import type { VesselFingerprint } from './fingerprint.js';

/**
 * This actor's real event-type vocabulary. First-seen keeps the pre-existing
 * name 'SANCTION' (an OFAC SDN designation genuinely IS a sanction action,
 * unlike a generic "listing"). DELISTED is new: the OFAC SDN.XML feed is a
 * complete, unpaginated single-file export (confirmed live, see http.ts) -
 * every fetch is a full census of the current list, so a previously-seen uid
 * genuinely absent from the current fetch is trustworthily delisted, NOT
 * just "not linked from this run" the way a paginated/query-narrowed source
 * would be ambiguous about. That completeness guarantee is gated on
 * `!truncatedByMaxItems` in fetchVesselRecords.ts - if maxItems cut the walk
 * short, DELISTED is never computed for that run (the same
 * complete-census-gating discipline used elsewhere in this fleet, e.g.
 * salta-compras-monitor's truncatedByMaxItems / pba-tenders-monitor's views
 * completeness check).
 */
export type VesselEventType = 'SANCTION' | 'STATUS_CHANGE' | 'UPDATED' | 'SNAPSHOT_NO_DIFF' | 'DELISTED';

export function classifyVesselRecord(previous: VesselFingerprint | undefined, current: VesselFingerprint): Exclude<VesselEventType, 'DELISTED'> {
    if (!previous) return 'SANCTION';
    if (previous.statusFingerprint !== current.statusFingerprint) return 'STATUS_CHANGE';
    if (previous.contentFingerprint !== current.contentFingerprint) return 'UPDATED';
    return 'SNAPSHOT_NO_DIFF';
}
