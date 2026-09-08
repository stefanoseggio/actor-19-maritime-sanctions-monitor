import { classifyVesselRecord } from './delta.js';
import { vesselFingerprintOf } from './fingerprint.js';
import { fetchTextWithRetry, OFAC_DETAILS_BASE_URL, OFAC_SDN_XML_URL, UN_CONSOLIDATED_XML_URL } from './http.js';
import { parseSdnXml } from './parseSdnXml.js';
import type { ActorInputParsed } from './schemas.js';
import type { VesselEntry } from './state.js';
import type { VesselDelistedRecord, VesselSanctionRawRecord } from './types.js';
import { buildUnImoIndex, lookupUnMatches } from './unConsolidatedList.js';

export interface FetchVesselRecordsResult {
    records: VesselSanctionRawRecord[];
    /** Vessels previously listed (in persisted state) but absent from this run's fetch - only ever populated when `truncatedByMaxItems` is false, see below. */
    delistedRecords: VesselDelistedRecord[];
    /** Fingerprint entries for every uid actually present in the CURRENT fetch (the full OFAC feed, independent of programFilter/vesselNameContains/maxItems - see below), for state.ts to persist. */
    entriesThisRun: Record<string, VesselEntry>;
    /**
     * True if `maxItems` capped DELIVERY before every entry in the feed was
     * visited. The OFAC SDN.XML feed itself is always fetched and parsed in
     * full (never paginated) - what `maxItems` limits is how many records
     * this run pushes to the dataset, not how much of the feed is read. But
     * the walk that builds `entriesThisRun` runs inside the same loop as
     * delivery, so once `maxItems` triggers a break, later entries are never
     * visited either - a real, live example of the same truncation-boundary
     * class of bug already found and fixed on salta-compras-monitor. DELISTED
     * detection is gated on this being false, the same complete-census
     * discipline used across this fleet.
     */
    truncatedByMaxItems: boolean;
}

function matchesProgramFilter(programs: string[], programFilter: string[] | undefined): boolean {
    if (!programFilter || programFilter.length === 0) return true;
    const lowerPrograms = programs.map((p) => p.toLowerCase());
    return programFilter.some((wanted) => lowerPrograms.some((p) => p.includes(wanted.toLowerCase())));
}

function matchesNameFilter(vesselName: string, nameContains: string | undefined): boolean {
    if (!nameContains) return true;
    return vesselName.toLowerCase().includes(nameContains.toLowerCase());
}

/**
 * Orchestrates this actor's single ingestion pass:
 *  1. Fetch + parse the OFAC SDN.XML feed in full, already filtered to
 *     sdnType=Vessel by parseSdnXml.
 *  2. Fingerprint and classify every entry against persisted state
 *     (SANCTION/STATUS_CHANGE/UPDATED/SNAPSHOT_NO_DIFF - see src/delta.ts),
 *     BEFORE applying programFilter/vesselNameContains - those filters only
 *     narrow what's DELIVERED, never what's censused, so state always
 *     reflects the true complete list regardless of input filters.
 *  3. Apply the input's programFilter / vesselNameContains filters, then
 *     onlyNew (now "new or changed", not just "never seen" - a disclosed
 *     behavior upgrade, see CHANGELOG.md), then the maxItems cap.
 *  4. Optionally fetch + index the UN Consolidated List and cross-reference
 *     each vessel's IMO number against it.
 *  5. Compute DELISTED vessels (previously-listed uids absent from this
 *     run's fetch) - gated on the walk not having been maxItems-truncated.
 *     Deliberately NOT filtered by programFilter/vesselNameContains: hiding
 *     a delisting because it doesn't match this run's unrelated filter would
 *     defeat this actor's core compliance purpose, so DELISTED always
 *     surfaces regardless of input filters.
 */
export async function fetchVesselRecords(
    input: ActorInputParsed,
    priorEntries: Record<string, VesselEntry>,
    now: Date,
): Promise<FetchVesselRecordsResult> {
    // The real, live SDN.XML feed is ~29MB (confirmed via a real cloud fetch,
    // 2026-09-07) - a much larger figure than an earlier same-day local check
    // suggested (~1MB), which turned out to have been silently truncated by
    // this dev sandbox's own corporate network proxy (the same MCAS-proxy
    // interference actor-20's README independently documents for a different
    // URL). Parsing the real ~29MB file into cheerio's full XML DOM is why
    // this actor's memory ceiling (.actor/actor.json) is set well above the
    // fleet's usual 256-512MB default - see that file's own note.
    const sdnXml = await fetchTextWithRetry(OFAC_SDN_XML_URL);
    const { entries } = parseSdnXml(sdnXml);

    const unIndex = input.enrichWithUnConsolidatedList
        ? buildUnImoIndex(await fetchTextWithRetry(UN_CONSOLIDATED_XML_URL))
        : new Map();

    const scrapedAt = now.toISOString();
    const entriesThisRun: Record<string, VesselEntry> = {};
    const records: VesselSanctionRawRecord[] = [];
    let truncatedByMaxItems = false;

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const fingerprint = vesselFingerprintOf(entry);
        const previous = priorEntries[entry.uid];
        entriesThisRun[entry.uid] = { ...fingerprint, lastSeenAt: scrapedAt, vesselName: entry.vesselName, imoNumber: entry.imoNumber };

        if (!matchesProgramFilter(entry.programs, input.programFilter)) continue;
        if (!matchesNameFilter(entry.vesselName, input.vesselNameContains)) continue;

        const eventType = classifyVesselRecord(previous, fingerprint);
        const isNew = !previous;

        // onlyNew now means "new or changed since last run" (delivers
        // STATUS_CHANGE/UPDATED too), not just "never seen before" - see
        // CHANGELOG.md for the full disclosed-behavior-upgrade reasoning,
        // matching the same change already made to this fleet's
        // actor-22-drug-safety-recalls-monitor the same day.
        if (input.onlyNew && eventType === 'SNAPSHOT_NO_DIFF') continue;

        const unMatches = lookupUnMatches(entry.imoNumber, unIndex);

        records.push({
            ...entry,
            crossReferencedInUnConsolidatedList: unMatches.length > 0,
            unConsolidatedListMatches: unMatches,
            record_id: `OFAC-SDN-${entry.uid}`,
            event_type: eventType,
            scraped_at: scrapedAt,
            is_new: isNew,
            source_url: `${OFAC_DETAILS_BASE_URL}?id=${entry.uid}`,
        });

        if (records.length >= input.maxItems) {
            truncatedByMaxItems = i < entries.length - 1;
            break;
        }
    }

    const delistedRecords: VesselDelistedRecord[] = [];
    if (!truncatedByMaxItems) {
        for (const [uid, priorEntry] of Object.entries(priorEntries)) {
            if (entriesThisRun[uid]) continue;
            delistedRecords.push({
                record_id: `OFAC-SDN-${uid}`,
                event_type: 'DELISTED',
                uid,
                vesselName: priorEntry.vesselName,
                imoNumber: priorEntry.imoNumber,
                scraped_at: scrapedAt,
                is_new: false,
                source_url: `${OFAC_DETAILS_BASE_URL}?id=${uid}`,
                lastConfirmedListedAt: priorEntry.lastSeenAt,
            });
        }
    }

    return { records, delistedRecords, entriesThisRun, truncatedByMaxItems };
}
