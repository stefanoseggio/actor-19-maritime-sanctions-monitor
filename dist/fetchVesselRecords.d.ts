import type { ActorInputParsed } from './schemas.js';
import type { VesselEntry } from './state.js';
import type { VesselDelistedRecord, VesselSanctionRawRecord } from './types.js';
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
export declare function fetchVesselRecords(input: ActorInputParsed, priorEntries: Record<string, VesselEntry>, now: Date): Promise<FetchVesselRecordsResult>;
//# sourceMappingURL=fetchVesselRecords.d.ts.map