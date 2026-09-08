import { Actor } from 'apify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createEmptyState, loadState, saveState } from '../src/state.js';
import type { VesselEntry } from '../src/state.js';

describe('state persistence', () => {
    beforeAll(async () => {
        await Actor.init();
    });

    afterAll(async () => {
        await Actor.exit({ exit: false });
    });

    it('returns an empty state when nothing has been saved yet', async () => {
        const state = await loadState();
        expect(state.entries).toEqual({});
        expect(state.lastRunAt).toBeNull();
    });

    it('round-trips a saved state', async () => {
        const entry: VesselEntry = {
            statusFingerprint: 'sh1',
            contentFingerprint: 'ch1',
            lastSeenAt: '2026-09-08T00:00:00.000Z',
            vesselName: 'MV Example',
            imoNumber: '9876543',
        };
        const saved = await saveState({ '12345': entry }, '2026-09-08T00:00:00.000Z');
        expect(saved.entries['12345']).toEqual(entry);

        const loaded = await loadState();
        expect(loaded.entries['12345']).toEqual(entry);
        expect(loaded.lastRunAt).toBe('2026-09-08T00:00:00.000Z');
    });

    it('a full replacement (complete census) correctly drops an entry not passed in', async () => {
        const onlyOne: VesselEntry = {
            statusFingerprint: 'sh2',
            contentFingerprint: 'ch2',
            lastSeenAt: '2026-09-08T01:00:00.000Z',
            vesselName: 'MV Only',
            imoNumber: null,
        };
        await saveState({ '99999': onlyOne }, '2026-09-08T01:00:00.000Z');
        const loaded = await loadState();
        expect(loaded.entries['12345']).toBeUndefined();
        expect(loaded.entries['99999']).toEqual(onlyOne);
    });

    it('treats a v1-shaped legacy value ({ seenUids, lastRunAt }) as absent rather than throwing', async () => {
        const store = await Actor.openKeyValueStore('actor-19-maritime-sanctions-monitor-delta-state');
        await store.setValue('state', { seenUids: ['12345', '67890'], lastRunAt: '2026-09-01T00:00:00.000Z' });
        const loaded = await loadState();
        expect(loaded).toEqual(createEmptyState());
    });
});
