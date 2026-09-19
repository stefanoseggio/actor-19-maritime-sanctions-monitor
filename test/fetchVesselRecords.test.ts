import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VesselEntry } from '../src/state.js';
import { vesselFingerprintOf } from '../src/fingerprint.js';
import type { ActorInputParsed } from '../src/schemas.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sdnFixtureXml = readFileSync(join(__dirname, 'fixtures/sdn_sample.xml'), 'utf-8');
const unFixtureXml = readFileSync(join(__dirname, 'fixtures/un_consolidated_sample.xml'), 'utf-8');

// A response that is HTTP 200 but not a real SDN.XML document at all (e.g. a
// bot-check/error/redirect-target page) - zero <sdnEntry> elements of any
// kind, no <Record_Count>. This is the exact shape of the confirmed bug:
// indistinguishable from "the OFAC feed genuinely has 0 vessels" unless the
// fetch is sanity-checked before trusting a zero-vessel reading.
const malformedEmptyXml = '<html><body>Access Denied - please verify you are not a robot</body></html>';

// A response that IS a well-formed, internally-consistent SDN.XML - it just
// genuinely, verifiably has zero entries this run (Record_Count says 0, and
// 0 <sdnEntry> elements are actually present - the two agree). Used to prove
// the fix does NOT break a real empty-feed day.
const genuinelyEmptySdnXml = `<?xml version="1.0" standalone="yes"?>
<sdnList xmlns="https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/XML">
  <publshInformation>
    <Publish_Date>09/18/2026</Publish_Date>
    <Record_Count>0</Record_Count>
  </publshInformation>
</sdnList>`;

// The fixture has 4 <sdnEntry> records, only 3 of which are
// sdnType=Vessel (uid 36 is sdnType=Entity and must be filtered out - see
// the fixture's own header comment). Mocking
// fetchTextWithRetry keeps this a pure, network-free test while exercising
// the REAL orchestration logic in fetchVesselRecords.ts against real,
// previously-captured XML - not a hand-simplified stub of the parser.
// `sdnXmlOverride` lets a test swap in a different body for the OFAC feed
// specifically, without touching the UN Consolidated List mock.
let sdnXmlOverride: string | null = null;
vi.mock('../src/http.js', async () => {
    const actual = await vi.importActual<typeof import('../src/http.js')>('../src/http.js');
    return {
        ...actual,
        fetchTextWithRetry: vi.fn(async (url: string) => {
            if (url === actual.OFAC_SDN_XML_URL) return sdnXmlOverride ?? sdnFixtureXml;
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

describe('fetchVesselRecords - suspected fetch failure guard (malformed/truncated-but-200 responses)', () => {
    afterEach(() => {
        sdnXmlOverride = null;
    });

    it('does NOT report DELISTED or lose tracked vessels when the OFAC feed comes back malformed/empty (0 sdnEntry elements) - the exact false-positive this guard exists to prevent', async () => {
        sdnXmlOverride = malformedEmptyXml;
        const priorEntries: Record<string, VesselEntry> = {
            '4238': { statusFingerprint: 'x', contentFingerprint: 'y', lastSeenAt: '2026-09-01T00:00:00.000Z', vesselName: 'MAR AZUL', imoNumber: null },
            '4243': { statusFingerprint: 'x', contentFingerprint: 'y', lastSeenAt: '2026-09-01T00:00:00.000Z', vesselName: 'EBANO', imoNumber: '7406784' },
            '15036': { statusFingerprint: 'x', contentFingerprint: 'y', lastSeenAt: '2026-09-01T00:00:00.000Z', vesselName: 'ARTAVIL', imoNumber: '9187629' },
        };

        const result = await fetchVesselRecords(baseInput(), priorEntries, NOW);

        expect(result.records).toHaveLength(0);
        expect(result.suspectedFetchFailure).toBe(true);
        // The core regression this guard fixes: previously-tracked vessels
        // must NOT be reported DELISTED just because a malformed/bot-check
        // response happened to parse to 0 entries.
        expect(result.delistedRecords).toHaveLength(0);
        // Nothing was actually parsed this run, but main.ts merges onto prior
        // state (instead of replacing with this empty map) whenever
        // suspectedFetchFailure is true, so the tracked vessels survive.
        expect(Object.keys(result.entriesThisRun)).toHaveLength(0);
    });

    it('DOES trust a genuinely empty feed (0 entries) that is structurally self-consistent (declared Record_Count=0 matches 0 parsed entries) - must not break a real empty/closed day', async () => {
        sdnXmlOverride = genuinelyEmptySdnXml;
        const priorEntries: Record<string, VesselEntry> = {
            '15036': { statusFingerprint: 'x', contentFingerprint: 'y', lastSeenAt: '2026-09-01T00:00:00.000Z', vesselName: 'ARTAVIL', imoNumber: '9187629' },
        };

        const result = await fetchVesselRecords(baseInput(), priorEntries, NOW);

        expect(result.suspectedFetchFailure).toBe(false);
        expect(result.delistedRecords).toHaveLength(1);
        expect(result.delistedRecords[0].uid).toBe('15036');
    });

    it('flags a suspected fetch failure when the vessel count crashes to less than half of what was tracked last run, even with a non-zero result', async () => {
        // The fixture returns 3 real vessels this run; simulate 10
        // previously-tracked vessels, only 1 of which (uid 15036) is still
        // in the fixture - a ~90% single-run drop with no real-world
        // precedent for this source.
        const priorEntries: Record<string, VesselEntry> = {
            '15036': { statusFingerprint: 'x', contentFingerprint: 'y', lastSeenAt: '2026-09-01T00:00:00.000Z', vesselName: 'ARTAVIL', imoNumber: '9187629' },
        };
        for (let i = 0; i < 9; i++) {
            priorEntries[`ghost-${i}`] = {
                statusFingerprint: 'x',
                contentFingerprint: 'y',
                lastSeenAt: '2026-09-01T00:00:00.000Z',
                vesselName: `Ghost Vessel ${i}`,
                imoNumber: null,
            };
        }

        const result = await fetchVesselRecords(baseInput(), priorEntries, NOW);

        expect(result.records.length).toBeGreaterThan(0);
        expect(result.suspectedFetchFailure).toBe(true);
        expect(result.delistedRecords).toHaveLength(0);
    });

    it('does NOT flag a suspected fetch failure for an ordinary small prior state with a normal (non-crashed) result', async () => {
        // Pins down that the existing DELISTED-detection tests above are
        // unaffected by this guard: a single previously-tracked vessel with a
        // normal (non-malformed, non-crashed) fetch result must still behave
        // exactly as before.
        const priorEntries: Record<string, VesselEntry> = {
            'no-longer-listed-42': {
                statusFingerprint: 'x',
                contentFingerprint: 'y',
                lastSeenAt: '2026-09-01T00:00:00.000Z',
                vesselName: 'Formerly Sanctioned Vessel',
                imoNumber: '1234567',
            },
        };
        const result = await fetchVesselRecords(baseInput(), priorEntries, NOW);
        expect(result.suspectedFetchFailure).toBe(false);
        expect(result.delistedRecords).toHaveLength(1);
    });
});
