import * as cheerio from 'cheerio';
/**
 * The UN Security Council Consolidated Sanctions List
 * (https://scsanctions.un.org/resources/xml/en/consolidated.xml, verified
 * live 2026-09-07 - see http.ts) has NO dedicated vessel record type and NO
 * structured IMO field. Every IMO number in the list appears only inside the
 * free-text <COMMENTS1> field of an <ENTITY> or <INDIVIDUAL> record, in
 * prose such as "International Maritime Organization (IMO) Number: 1790183."
 * or the shorter "IMO Number: 5342883." (both real sentences observed in the
 * live file this session - see test/fixtures/un_consolidated_sample.xml).
 *
 * This module does NOT attempt to model the UN list as a structured vessel
 * source (that would fabricate fields the source does not have). It only
 * builds an IMO-number -> [matching UN record] index, scoped per-record (not
 * a flat whole-document regex scan, which could misattribute an IMO number
 * to the wrong neighboring entity), used purely as a cross-reference
 * enrichment against OFAC's already-structured vessel records.
 */
const IMO_IN_TEXT_PATTERN = /IMO[^0-9]{0,40}?(\d{7})\b/gi;
function textOrNull(value) {
    const trimmed = (value ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
}
/** Builds a Map from 7-digit IMO number to every UN ENTITY/INDIVIDUAL record whose COMMENTS1 text mentions it. */
export function buildUnImoIndex(xml) {
    const $ = cheerio.load(xml, { xmlMode: true });
    const index = new Map();
    $('ENTITY, INDIVIDUAL').each((_index, element) => {
        const $record = $(element);
        const dataId = textOrNull($record.children('DATAID').first().text());
        const comments = $record.children('COMMENTS1').first().text() ?? '';
        if (!dataId || !comments)
            return;
        const matches = [...comments.matchAll(IMO_IN_TEXT_PATTERN)];
        if (matches.length === 0)
            return;
        const firstName = textOrNull($record.children('FIRST_NAME').first().text());
        const secondName = textOrNull($record.children('SECOND_NAME').first().text());
        const name = [firstName, secondName].filter((part) => part !== null).join(' ') || 'UNKNOWN';
        const referenceNumber = textOrNull($record.children('REFERENCE_NUMBER').first().text());
        const listedOn = textOrNull($record.children('LISTED_ON').first().text());
        const record = { dataId, name, referenceNumber, listedOn };
        for (const match of matches) {
            const imoNumber = match[1];
            const existing = index.get(imoNumber);
            if (existing) {
                existing.push(record);
            }
            else {
                index.set(imoNumber, [record]);
            }
        }
    });
    return index;
}
/** Looks up an OFAC-extracted IMO number in the pre-built UN index. Returns an empty array (never null/undefined) when there is no match, so callers can spread the result directly. */
export function lookupUnMatches(imoNumber, index) {
    if (!imoNumber)
        return [];
    return index.get(imoNumber) ?? [];
}
//# sourceMappingURL=unConsolidatedList.js.map