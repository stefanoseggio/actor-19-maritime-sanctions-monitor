import { type UnifiedRecord } from './schemas.js';
import type { VesselDelistedRecord, VesselSanctionRawRecord } from './types.js';
/** OFAC's <Publish_Date> is "MM/DD/YYYY". Converts to a UTC-midnight ISO timestamp, or null if the input is not in that exact shape (never throws - this is a pure best-effort formatter, not a validator). */
export declare function parseOfacPublishDateToIso(raw: string): string | null;
/**
 * Pure function: one raw VesselSanctionRawRecord in, one validated
 * UnifiedRecord out (or throws a ZodError if the raw record fails the UMS
 * contract - callers decide whether to catch that per-record or let it
 * fail the run, see main.ts).
 *
 * Field-by-field UMS crosswalk rationale:
 *  - entity_identifier_native = the vessel's IMO number (the fleet-wide
 *    "strong dedup key" this brief calls out), null when OFAC has not
 *    recorded one for this entry - never backfilled with a weaker
 *    substitute here (see graphMapping.ts for how the graph layer falls
 *    back to a normalized-name key in that case, consistent with the
 *    Entity node's existing documented fallback behavior).
 *  - value_native / value_currency / value_usd_normalized = null always:
 *    an SDN designation blocks a vessel's assets, it does not itself carry
 *    a monetary amount (unlike e.g. a contract award or a court fine).
 *  - effective_date_iso = null always: the OFAC SDN.XML feed carries no
 *    per-entry designation date field (verified against the live feed this
 *    session - only a list-level Publish_Date exists, see below).
 *  - publish_date_iso = the SDN list's own list-level Publish_Date,
 *    converted from OFAC's MM/DD/YYYY to ISO - the same value for every
 *    record read from one fetch, which is honest (it is a snapshot
 *    publish date, not a fabricated per-entry one).
 *  - category_or_type = the OFAC sanctions program(s) this vessel is
 *    designated under (e.g. "IRAN"), joined with "; " for multi-program
 *    entries.
 *  - source_document_url = null always: OFAC does not publish a separate
 *    per-record source document (PDF/etc) distinct from the Details.aspx
 *    page already used as source_url.
 */
export declare function normalizeVesselRecordToUms(raw: VesselSanctionRawRecord): UnifiedRecord;
/**
 * Pure function: one VesselDelistedRecord in, one validated UnifiedRecord
 * out. Fields this actor has no fresh data for (a delisted vessel is, by
 * definition, no longer in the OFAC feed) are honestly nulled rather than
 * reused from stale native data - category_or_type and status_or_estado in
 * particular are null here, not the last-known programs/status, since this
 * actor no longer has current confirmation of either.
 */
export declare function normalizeDelistedVesselToUms(raw: VesselDelistedRecord): UnifiedRecord;
//# sourceMappingURL=umsNormalizer.d.ts.map