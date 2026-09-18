import { Actor } from 'apify';
// A NAMED key-value store (not Actor.getValue()/setValue(), which resolve to
// the store "associated with the current Actor run" per the Apify SDK docs -
// isolated per run, never shared across separate runs, the exact bug found
// and fixed on this fleet's primer-actor the same day this actor was
// migrated) persists across scheduled runs.
const STATE_STORE_NAME = 'actor-19-maritime-sanctions-monitor-delta-state';
const MAX_ENTRIES = 5000;
// v1 of this actor stored { seenUids: string[], lastRunAt }. isValidState()
// treats that shape (and anything else unexpected) as absent rather than
// attempting a migration - an existing scheduled task's next run simply
// re-baselines against the richer v2 shape.
function isValidState(value) {
    if (!value || typeof value !== 'object')
        return false;
    const candidate = value;
    if (typeof candidate.entries !== 'object' || candidate.entries === null)
        return false;
    return true;
}
export function createEmptyState() {
    return { entries: {}, lastRunAt: null };
}
export async function loadState() {
    const store = await Actor.openKeyValueStore(STATE_STORE_NAME);
    const state = await store.getValue('state');
    return isValidState(state) ? state : createEmptyState();
}
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
export async function saveState(finalEntries, runAt) {
    let capped = finalEntries;
    const keys = Object.keys(finalEntries);
    if (keys.length > MAX_ENTRIES) {
        const keptKeys = keys.sort((a, b) => finalEntries[b].lastSeenAt.localeCompare(finalEntries[a].lastSeenAt)).slice(0, MAX_ENTRIES);
        capped = Object.fromEntries(keptKeys.map((k) => [k, finalEntries[k]]));
    }
    const next = { entries: capped, lastRunAt: runAt };
    const store = await Actor.openKeyValueStore(STATE_STORE_NAME);
    await store.setValue('state', next);
    return next;
}
//# sourceMappingURL=state.js.map