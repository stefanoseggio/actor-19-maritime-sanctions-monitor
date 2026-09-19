import * as cheerio from 'cheerio';

import type { AkaName, OfacVesselEntry, OtherId } from './types.js';

/** Matches "IMO 9187629", "IMO  8730455" (double space seen in the live feed), case-insensitive. IMO ship numbers are always exactly 7 digits. */
const IMO_PATTERN = /IMO\s*(\d{7})\b/i;
/** Matches a "(Linked To: X)" or "Linked To: X;" clause inside OFAC's free-text remarks. */
const LINKED_TO_PATTERN = /Linked To:\s*([^);]+)/i;

function textOrNull(value: string | undefined | null): string | null {
    const trimmed = (value ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Parses one raw OFAC SDN.XML document (the exact feed described in
 * http.ts's verified-target comment block) into typed vessel entries,
 * filtering out every non-vessel sdnType (Individual, Entity, Aircraft).
 *
 * Also surfaces two structural signals used by fetchVesselRecords.ts's
 * suspected-fetch-failure guard, independent of how many Vessel entries
 * came out the other end:
 *   - `totalEntryCount`: every <sdnEntry> element found, of ANY sdnType
 *     (Individual/Entity/Aircraft/Vessel) - the real feed's vessels are a
 *     small (~8%) slice of ~19,300 total entries, so this is a much larger,
 *     more stable number than the vessel-only count and a good signal for
 *     "did this response actually contain SDN entries at all".
 *   - `declaredRecordCount`: the feed's own <publshInformation>
 *     <Record_Count> value - present in every genuine SDN.XML fetch - used
 *     to check internal consistency (does the file's own claimed size match
 *     how many entries were actually parsed out of it) rather than trusting
 *     the parsed entry count in isolation.
 *
 * Uses cheerio in xmlMode - the document's default xmlns is unprefixed, so
 * plain tag-name selectors (`sdnEntry`, `uid`, ...) match exactly as they
 * would against the equivalent HTML-shaped markup cheerio is normally used
 * for elsewhere in this fleet (see uk-hse-enforcement-monitor's parsers/).
 */
export function parseSdnXml(xml: string): {
    entries: OfacVesselEntry[];
    publishDateRaw: string;
    totalEntryCount: number;
    declaredRecordCount: number | null;
} {
    const $ = cheerio.load(xml, { xmlMode: true });

    const publishDateRaw = textOrNull($('publshInformation Publish_Date').first().text()) ?? '';
    const recordCountRaw = textOrNull($('publshInformation Record_Count').first().text());
    const declaredRecordCount = recordCountRaw !== null && /^\d+$/.test(recordCountRaw) ? Number(recordCountRaw) : null;

    const entries: OfacVesselEntry[] = [];
    let totalEntryCount = 0;

    $('sdnEntry').each((_index, element) => {
        totalEntryCount += 1;
        const $entry = $(element);
        const sdnType = textOrNull($entry.children('sdnType').first().text());
        if (!sdnType || sdnType.toLowerCase() !== 'vessel') return;

        const uid = textOrNull($entry.children('uid').first().text());
        const vesselName = textOrNull($entry.children('lastName').first().text());
        if (!uid || !vesselName) return;

        const programs: string[] = [];
        $entry.find('programList > program').each((_i, programEl) => {
            const program = textOrNull($(programEl).text());
            if (program) programs.push(program);
        });

        const remarks = textOrNull($entry.children('remarks').first().text());
        const linkedToMatch = remarks ? remarks.match(LINKED_TO_PATTERN) : null;
        const linkedTo = linkedToMatch ? linkedToMatch[1].trim() : null;

        const akaNames: AkaName[] = [];
        $entry.find('akaList > aka').each((_i, akaEl) => {
            const $aka = $(akaEl);
            const name = textOrNull($aka.children('lastName').first().text());
            if (!name) return;
            akaNames.push({
                type: textOrNull($aka.children('type').first().text()),
                category: textOrNull($aka.children('category').first().text()),
                name,
            });
        });

        let imoNumber: string | null = null;
        let mmsi: string | null = null;
        const otherIds: OtherId[] = [];
        $entry.find('idList > id').each((_i, idEl) => {
            const $id = $(idEl);
            const idType = textOrNull($id.children('idType').first().text());
            const idNumber = textOrNull($id.children('idNumber').first().text());
            if (!idType || !idNumber) return;

            if (idType === 'Vessel Registration Identification') {
                const match = idNumber.match(IMO_PATTERN);
                if (match) {
                    imoNumber = match[1];
                    return;
                }
                // A "Vessel Registration Identification" entry that is NOT an IMO
                // number (a real, verified case in the live feed - some vessels
                // carry a national registry number here instead). Keep it as a
                // generic identifier rather than silently discarding it or
                // mislabeling it as an IMO number.
                otherIds.push({ idType, idNumber });
                return;
            }
            if (idType === 'MMSI') {
                mmsi = idNumber;
                return;
            }
            otherIds.push({ idType, idNumber });
        });

        const vesselInfo = $entry.children('vesselInfo').first();
        const callSign = textOrNull(vesselInfo.children('callSign').first().text());
        const vesselType = textOrNull(vesselInfo.children('vesselType').first().text());
        const vesselFlag = textOrNull(vesselInfo.children('vesselFlag').first().text());
        const tonnage = textOrNull(vesselInfo.children('tonnage').first().text());
        const grossRegisteredTonnage = textOrNull(vesselInfo.children('grossRegisteredTonnage').first().text());
        const vesselOwner = textOrNull(vesselInfo.children('vesselOwner').first().text());

        entries.push({
            uid,
            vesselName,
            sdnType: 'Vessel',
            programs,
            remarks,
            linkedTo,
            akaNames,
            imoNumber,
            mmsi,
            otherIds,
            callSign,
            vesselType,
            vesselFlag,
            tonnage,
            grossRegisteredTonnage,
            vesselOwner,
            listPublishDateRaw: publishDateRaw,
        });
    });

    return { entries, publishDateRaw, totalEntryCount, declaredRecordCount };
}
