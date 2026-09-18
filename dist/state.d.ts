import type { VesselFingerprint } from './fingerprint.js';
export interface VesselEntry extends VesselFingerprint {
    lastSeenAt: string;
    /** Enough identity to synthesize a meaningful DELISTED record without re-fetching stale-by-definition OFAC data for a vessel no longer in the feed. */
    vesselName: string;
    imoNumber: string | null;
}
export interface DeltaState {
    entries: Record<string, VesselEntry>;
    lastRunAt: string | null;
}
export declare function createEmptyState(): DeltaState;
export declare function loadState(): Promise<DeltaState>;
/**
 * Persists the given `finalEntries` map as-is (capped), whatever the caller
 * decided it should be. The caller (main.ts) is responsible for deciding
 * whether that's a full replacement (a complete, untruncated census - a
 * delisted vessel's uid is then correctly DROPPED, not kept as a tombstone:
 * a real second delisting, e.g. a data-entry correction that briefly
 * relists then re-delists the same uid, should classify as SANCTION again -
 * first-seen - not some third state this actor doesn't model) or a MERGE
 * with the prior state (a maxItems-truncated run, where entries beyond the
 * truncation point were never re-visited and must not be forgotten just
 * because this run didn't reach them - see fetchVesselRecords.ts's
 * `truncatedByMaxItems`). Getting this wrong the other way around - always
 * replacing - would silently forget every vessel beyond a truncated walk's
 * cutoff on every subsequent run, making them look "new" again instead of
 * correctly retaining their fingerprint history.
 */
export declare function saveState(finalEntries: Record<string, VesselEntry>, runAt: string): Promise<DeltaState>;
//# sourceMappingURL=state.d.ts.map