import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import type { VesselEntry } from '../src/state.js';
import { vesselFingerprintOf } from '../src/fingerprint.js';
import type { ActorInputParsed } from '../src/schemas.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sdnFixtureXml = readFileSync(join(__dirname, 'fixtures/sdn_sample.xml'), 'utf-8');
const unFixtureXml = readFileSync(join(__dirname, 'fixtures/un_consolidated_sample.xml'), 'utf-8');

// The fixture has 4 <sdnEntry> records, only 3 of which are
// sdnType=Vessel (uid 36 is sdnType=Entity and must be filtered out - see
// the fixture's own header comment). Mocking
// fetchTextWithRetry keeps this a pure, network-free test while exercising
// the REAL orchestration logic in fetchVesselRecords.ts against real,
// previously-captured XML - not a hand-simplified stub of the parser.
vi.mock('../src/http.js', async () => {
    const actual = await vi.importActual<typeof import('../src/http.js')>('../src/http.js');
    return {
        ...actual,
        fetchTextWithRetry: vi.fn(async (url: string) => {
            if (url === actual.OFAC_SDN_XML_URL) return sdnFixtureXml;
            if (url === actual.UN_CONSOLIDATED_XML_URL) return unFixtureXml;
            throw new Error(`Unexpected URL in test: ${url}`);
        }),
    };
});

const { fetchVesselRecords } = await import('../src/fetchVesselRecords.js');

const NOW = new Date('2026-09-08T00:00:00.000Z');

function baseInput(overrides: Partial<ActorInputParsed> = {}): ActorInputParsed {
    return {
        maxItems: 250,
        onlyNew: false,
        enrichWithUnConsolidatedList: false,
        ...overrides,
    };
}

describe('fetchVesselRecords - cold start', () => {
    it('classifies every entry as SANCTION (first-seen) with no prior state, and is not truncated', async () => {
        const result = await fetchVesselRecords(baseInput(), {}, NOW);
        expect(result.records).toHaveLength(3);
        expect(result.records.every((r) => r.event_type === 'SANCTION')).toBe(true);
        expect(result.records.every((r) => r.is_new === true)).toBe(true);
        expect(result.truncatedByMaxItems).toBe(false);
        expect(result.delistedRecords).toHaveLength(0);
        expect(Object.keys(result.entriesThisRun)).toHaveLength(3);
    });
});

describe('fetchVesselRecords - truncation boundary', () => {
    it('sets truncatedByMaxItems=false when maxItems exactly matches the total vessel count (no overflow)', async () => {
        const result = await fetchVesselRecords(baseInput({ maxItems: 3 }), {}, NOW);
        expect(result.records).toHaveLength(3);
        expect(result.truncatedByMaxItems).toBe(false);
    });

    it('sets truncatedByMaxItems=true when maxItems cuts the walk short, and skips DELISTED detection', async () => {
        const priorEntries: Record<string, VesselEntry> = {
            'not-in-fixture-999': { statusFingerprint: 'x', contentFingerprint: 'y', lastSeenAt: '2026-09-01T00:00:00.000Z', vesselName: 'Ghost Vessel', imoNumber: null },
        };
        const result = await fetchVesselRecords(baseInput({ maxItems: 2 }), priorEntries, NOW);
        expect(result.records).toHaveLength(2);
        expect(result.truncatedByMaxItems).toBe(true);
        // DELISTED detection must be skipped on a truncated walk - the
        // "not-in-fixture-999" uid wasn't actually re-checked, so it must
        // NOT be reported as delisted (the false-positive class of bug this
        // gate exists to prevent).
        expect(result.delistedRecords).toHaveLength(0);
    });
});

describe('fetchVesselRecords - DELISTED detection', () => {
    it('classifies a previously-seen uid absent from the current (complete, untruncated) fetch as DELISTED', async () => {
        const priorEntries: Record<string, VesselEntry> = {
            'no-longer-listed-42': {
                statusFingerprint: 'x',
                contentFingerprint: 'y',
                lastSeenAt: '2026-09-01T00:00:00.000Z',
                vesselName: 'Formerly Sanctioned Vessel',
                imoNumber: '1234567',
            },
        };
        const result = await fetchVesselRecords(baseInput({ maxItems: 250 }), priorEntries, NOW);
        expect(result.truncatedByMaxItems).toBe(false);
        expect(result.delistedRecords).toHaveLength(1);
        expect(result.delistedRecords[0]).toMatchObject({
            uid: 'no-longer-listed-42',
            event_type: 'DELISTED',
            vesselName: 'Formerly Sanctioned Vessel',
            imoNumber: '1234567',
            is_new: false,
        });
    });

    it('does NOT classify a still-present uid as DELISTED', async () => {
        const priorEntries: Record<string, VesselEntry> = {
            '15036': { statusFingerprint: 'x', contentFingerprint: 'y', lastSeenAt: '2026-09-01T00:00:00.000Z', vesselName: 'ARTAVIL', imoNumber: '9187629' },
        };
        const result = await fetchVesselRecords(baseInput(), priorEntries, NOW);
        expect(result.delistedRecords.find((r) => r.uid === '15036')).toBeUndefined();
    });
});

describe('fetchVesselRecords - onlyNew means new-or-changed', () => {
    it('with onlyNew=true, delivers SANCTION (first-seen) but not SNAPSHOT_NO_DIFF (unchanged repeat)', async () => {
        // Build prior state that exactly matches the fixture's real fingerprint
        // for uid 15036 (ARTAVIL), so it classifies as SNAPSHOT_NO_DIFF, not
        // STATUS_CHANGE/UPDATED - proving onlyNew genuinely filters based on
        // real fingerprint comparison, not just presence in state.
        const first = await fetchVesselRecords(baseInput(), {}, NOW);
        const artavil = first.records.find((r) => r.uid === '15036')!;
        const fingerprint = vesselFingerprintOf(artavil);
        const priorEntries: Record<string, VesselEntry> = {
            '15036': { ...fingerprint, lastSeenAt: '2026-09-01T00:00:00.000Z', vesselName: artavil.vesselName, imoNumber: artavil.imoNumber },
        };

        const result = await fetchVesselRecords(baseInput({ onlyNew: true }), priorEntries, NOW);
        expect(result.records.find((r) => r.uid === '15036')).toBeUndefined();
        // The other 2 vessels are still first-seen (SANCTION) and must still be delivered.
        expect(result.records.length).toBe(2);
        expect(result.records.every((r) => r.event_type === 'SANCTION')).toBe(true);
    });
});
