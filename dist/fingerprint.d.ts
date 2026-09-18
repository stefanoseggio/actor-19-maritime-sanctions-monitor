import type { OfacVesselEntry } from './types.js';
export interface VesselFingerprint {
    /** Hash over `programs` (sorted, so reordering the same set isn't a false change) - the closest thing to a "status" this domain has: a still-listed vessel can be added to or dropped from a specific sanctions program without being delisted outright. */
    statusFingerprint: string;
    /** Hash over the vessel's other mutable fields - never `uid` (identity, already the record key) or `listPublishDateRaw` (a feed-level value shared by every entry in one fetch, not a per-vessel signal). */
    contentFingerprint: string;
}
export declare function vesselFingerprintOf(entry: OfacVesselEntry): VesselFingerprint;
//# sourceMappingURL=fingerprint.d.ts.map