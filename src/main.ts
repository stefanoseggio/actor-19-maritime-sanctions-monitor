import { Actor, log } from 'apify';

import { fetchVesselRecords } from './fetchVesselRecords.js';
import { ActorInputSchema } from './schemas.js';
import { createEmptyState, loadState, saveState } from './state.js';
import { normalizeDelistedVesselToUms, normalizeVesselRecordToUms } from './umsNormalizer.js';

const RESULT_EVENT_NAME = 'result';

// Diagnostic safety net: if anything throws or rejects outside the
// try/catch blocks below (or if the Apify logger itself is what's failing
// to flush), a raw console.error guarantees SOMETHING reaches the captured
// log stream before the process exits, rather than a silent exit code 1.
process.on('unhandledRejection', (reason) => {
    console.error('UNHANDLED REJECTION:', reason instanceof Error ? reason.stack : reason);
    process.exit(1);
});
process.on('uncaughtException', (error) => {
    console.error('UNCAUGHT EXCEPTION:', error.stack);
    process.exit(1);
});

await Actor.init();
await run();
await Actor.exit();

async function run(): Promise<void> {
    const rawInput = (await Actor.getInput()) ?? {};
    const input = ActorInputSchema.parse(rawInput);

    const now = new Date();

    // loadState() opens a NAMED (cross-run) key-value store, a real network/API
    // call to the Apify platform - unlike the run's own default store, this is
    // fallible for reasons outside this actor's control (a transient platform
    // API issue, a first-run permission/creation edge case). A delta-state
    // load failure must never block a fresh, working extraction: fall back to
    // an empty state (equivalent to a cold-start run) and log loudly rather
    // than letting an unguarded await here crash the whole run before a single
    // record is ever fetched.
    let state;
    try {
        state = await loadState();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`loadState() failed, continuing with a cold-start (empty) delta state: ${message}`);
        state = createEmptyState();
    }

    let pushed = 0;
    try {
        const { records, delistedRecords, entriesThisRun, truncatedByMaxItems } = await fetchVesselRecords(input, state.entries, now);
        log.info(
            `Fetched ${records.length} vessel record(s) from the OFAC SDN List${ 
                input.enrichWithUnConsolidatedList ? ' (UN Consolidated List cross-reference enabled)' : '' 
                }${truncatedByMaxItems ? ' [maxItems truncated the walk - DELISTED detection skipped this run]' : ''}`,
        );
        if (delistedRecords.length > 0) {
            log.info(`${delistedRecords.length} previously-listed vessel(s) no longer in the current OFAC feed - classified DELISTED.`);
        }

        for (const record of records) {
            // Push the rich native record (all OFAC/UN fields) as the dataset
            // item, matching every sibling actor's convention of emitting its
            // full native shape rather than only the 18-field UMS envelope -
            // the UMS view is a normalized adapter output (umsNormalizer.ts),
            // not what this actor itself pushes to its own dataset.
            await Actor.pushData(record);
            pushed += 1;

            // Validate that every pushed record also normalizes cleanly to the
            // Unified Master Schema - a normalization failure here indicates a
            // real bug (a raw field this actor promised the UMS contract but
            // failed to produce), so it is logged loudly rather than silently
            // swallowed, without blocking the run.
            try {
                normalizeVesselRecordToUms(record);
            } catch (umsError) {
                const message = umsError instanceof Error ? umsError.message : String(umsError);
                log.error(`Record ${record.record_id} failed UMS normalization: ${message}`);
            }

            const { eventChargeLimitReached } = await Actor.charge({ eventName: RESULT_EVENT_NAME, count: 1 });
            if (eventChargeLimitReached) {
                log.info('Charge limit reached - stopping.');
                break;
            }
        }

        for (const record of delistedRecords) {
            await Actor.pushData(record);
            pushed += 1;

            try {
                normalizeDelistedVesselToUms(record);
            } catch (umsError) {
                const message = umsError instanceof Error ? umsError.message : String(umsError);
                log.error(`DELISTED record ${record.record_id} failed UMS normalization: ${message}`);
            }

            const { eventChargeLimitReached } = await Actor.charge({ eventName: RESULT_EVENT_NAME, count: 1 });
            if (eventChargeLimitReached) {
                log.info('Charge limit reached - stopping.');
                break;
            }
        }

        // A complete, untruncated census REPLACES state entirely (a vessel
        // absent from entriesThisRun really is delisted, per the DELISTED
        // computation above). A maxItems-truncated run instead MERGES onto
        // prior state - entries beyond the truncation point were never
        // re-visited this run and must not be forgotten, or they'd
        // incorrectly look "new" again next time they ARE reached.
        const finalEntries = truncatedByMaxItems ? { ...state.entries, ...entriesThisRun } : entriesThisRun;

        // Persisting delta state is a housekeeping step, not part of
        // extraction correctness - a failure here must never relabel an
        // already-successful extraction (records already pushed above) as
        // "Extraction failed", and must never push a spurious {error} record
        // on top of real data that already landed in the dataset.
        try {
            await saveState(finalEntries, now.toISOString());
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error(`saveState() failed (extraction itself succeeded, ${pushed} record(s) already pushed): ${message}`);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Extraction failed: ${message}`);
        await Actor.pushData({ error: message, scraped_at: now.toISOString() });
        return;
    }

    log.info(`Pushed ${pushed} item(s) to the dataset.`);
}
