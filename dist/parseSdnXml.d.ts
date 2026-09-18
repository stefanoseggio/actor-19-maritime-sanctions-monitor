import type { OfacVesselEntry } from './types.js';
/**
 * Parses one raw OFAC SDN.XML document (the exact feed described in
 * http.ts's verified-target comment block) into typed vessel entries,
 * filtering out every non-vessel sdnType (Individual, Entity, Aircraft).
 *
 * Uses cheerio in xmlMode - the document's default xmlns is unprefixed, so
 * plain tag-name selectors (`sdnEntry`, `uid`, ...) match exactly as they
 * would against the equivalent HTML-shaped markup cheerio is normally used
 * for elsewhere in this fleet (see uk-hse-enforcement-monitor's parsers/).
 */
export declare function parseSdnXml(xml: string): {
    entries: OfacVesselEntry[];
    publishDateRaw: string;
};
//# sourceMappingURL=parseSdnXml.d.ts.map