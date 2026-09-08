import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseSdnXml } from '../src/parseSdnXml.js';
import { buildUnImoIndex, lookupUnMatches } from '../src/unConsolidatedList.js';
import { normalizeDelistedVesselToUms, normalizeVesselRecordToUms, parseOfacPublishDateToIso } from '../src/umsNormalizer.js';
import type { VesselDelistedRecord, VesselSanctionRawRecord } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// All fixtures are trimmed real excerpts of the two live sources verified
// this session - see the header comments in each fixture file and in
// src/http.ts. No live network calls happen anywhere in this test file.
const sdnFixtureXml = readFileSync(join(__dirname, 'fixtures/sdn_sample.xml'), 'utf-8');
const unFixtureXml = readFileSync(join(__dirname, 'fixtures/un_consolidated_sample.xml'), 'utf-8');

function buildRawRecord(overrides: Partial<VesselSanctionRawRecord> = {}): VesselSanctionRawRecord {
    const base: VesselSanctionRawRecord = {
        uid: '15036',
        vesselName: 'ARTAVIL',
        sdnType: 'Vessel',
        programs: ['IRAN'],
        remarks: '(Linked To: NATIONAL IRANIAN TANKER COMPANY)',
        linkedTo: 'NATIONAL IRANIAN TANKER COMPANY',
        akaNames: [
            { type: 'f.k.a.', category: 'strong', name: 'ABADAN' },
            { type: 'f.k.a.', category: 'weak', name: 'ALPHA' },
        ],
        imoNumber: '9187629',
        mmsi: '572469210',
        otherIds: [{ idType: 'Former Vessel Flag', idNumber: 'Malta' }],
        callSign: 'T2EU4',
        vesselType: 'Crude/Oil Products Tanker',
        vesselFlag: 'Iran',
        tonnage: '99144',
        grossRegisteredTonnage: '56068',
        vesselOwner: null,
        listPublishDateRaw: '09/04/2026',
        crossReferencedInUnConsolidatedList: false,
        unConsolidatedListMatches: [],
        record_id: 'OFAC-SDN-15036',
        event_type: 'SANCTION',
        scraped_at: '2026-09-07T10:00:00.000Z',
        is_new: true,
        source_url: 'https://sanctionssearch.ofac.treas.gov/Details.aspx?id=15036',
    };
    return { ...base, ...overrides };
}

describe('parseSdnXml', () => {
    const { entries, publishDateRaw } = parseSdnXml(sdnFixtureXml);

    it('reads the list-level Publish_Date', () => {
        expect(publishDateRaw).toBe('09/04/2026');
    });

    it('filters out non-vessel sdnType entries (uid 36, an Entity, is excluded)', () => {
        expect(entries.find((e) => e.uid === '36')).toBeUndefined();
        expect(entries).toHaveLength(3);
    });

    it('parses a vessel with no idList at all as imoNumber: null (MAR AZUL)', () => {
        const marAzul = entries.find((e) => e.uid === '4238');
        expect(marAzul).toBeDefined();
        expect(marAzul?.imoNumber).toBeNull();
        expect(marAzul?.vesselOwner).toBe('Samir de Navegacion S.A.');
        expect(marAzul?.grossRegisteredTonnage).toBe('212');
    });

    it('extracts the IMO number and akaList entries (EBANO)', () => {
        const ebano = entries.find((e) => e.uid === '4243');
        expect(ebano).toBeDefined();
        expect(ebano?.imoNumber).toBe('7406784');
        expect(ebano?.akaNames).toEqual([
            { type: 'f.k.a.', category: 'weak', name: 'ANA I' },
            { type: 'f.k.a.', category: 'weak', name: 'SAND SWAN' },
        ]);
    });

    it('extracts IMO, MMSI, linkedTo, and vesselInfo fields together (ARTAVIL)', () => {
        const artavil = entries.find((e) => e.uid === '15036');
        expect(artavil).toBeDefined();
        expect(artavil?.imoNumber).toBe('9187629');
        expect(artavil?.mmsi).toBe('572469210');
        expect(artavil?.linkedTo).toBe('NATIONAL IRANIAN TANKER COMPANY');
        expect(artavil?.vesselType).toBe('Crude/Oil Products Tanker');
        expect(artavil?.vesselFlag).toBe('Iran');
        expect(artavil?.otherIds).toEqual(
            expect.arrayContaining([{ idType: 'Former Vessel Flag', idNumber: 'Malta' }]),
        );
    });
});

describe('buildUnImoIndex / lookupUnMatches', () => {
    const index = buildUnImoIndex(unFixtureXml);

    it('indexes an IMO number mentioned in "International Maritime Organization (IMO) Number: X." prose', () => {
        const matches = lookupUnMatches('1790183', index);
        expect(matches).toHaveLength(1);
        expect(matches[0].dataId).toBe('6908046');
        expect(matches[0].name).toBe('OCEAN MARITIME MANAGEMENT COMPANY, LIMITED (OMM)');
        expect(matches[0].referenceNumber).toBe('KPe.020');
    });

    it('indexes an IMO number mentioned in the shorter "IMO Number: X." prose', () => {
        const matches = lookupUnMatches('5342883', index);
        expect(matches).toHaveLength(1);
        expect(matches[0].dataId).toBe('6908516');
    });

    it('returns an empty array for an IMO number not present in the list', () => {
        expect(lookupUnMatches('9999999', index)).toEqual([]);
    });

    it('returns an empty array when given a null IMO number, without touching the index', () => {
        expect(lookupUnMatches(null, index)).toEqual([]);
    });

    it('does not index the control entity that has no IMO number in its comments', () => {
        for (const matches of index.values()) {
            expect(matches.every((m) => m.dataId !== '690770')).toBe(true);
        }
    });
});

describe('parseOfacPublishDateToIso', () => {
    it('converts MM/DD/YYYY to a UTC-midnight ISO timestamp', () => {
        expect(parseOfacPublishDateToIso('09/04/2026')).toBe('2026-09-04T00:00:00.000Z');
    });

    it('returns null for an unrecognized shape rather than throwing', () => {
        expect(parseOfacPublishDateToIso('2026-09-04')).toBeNull();
        expect(parseOfacPublishDateToIso('')).toBeNull();
    });
});

describe('normalizeVesselRecordToUms', () => {
    it('maps a fully-populated raw record onto all 18 UMS fields correctly', () => {
        const raw = buildRawRecord();
        const ums = normalizeVesselRecordToUms(raw);

        expect(ums.record_id).toBe('OFAC-SDN-15036');
        expect(ums.event_type).toBe('SANCTION');
        expect(ums.is_new).toBe(true);
        expect(ums.source_url).toBe('https://sanctionssearch.ofac.treas.gov/Details.aspx?id=15036');
        expect(ums.recipient_or_defendant_name).toBe('ARTAVIL');
        expect(ums.entity_identifier_native).toBe('9187629');
        expect(ums.value_native).toBeNull();
        expect(ums.value_currency).toBeNull();
        expect(ums.value_usd_normalized).toBeNull();
        expect(ums.effective_date_iso).toBeNull();
        expect(ums.publish_date_iso).toBe('2026-09-04T00:00:00.000Z');
        expect(ums.category_or_type).toBe('IRAN');
        expect(ums.status_or_estado).toBe('Specially Designated National (Blocked)');
        expect(ums.awarding_or_regulating_agency).toBe(
            'U.S. Department of the Treasury, Office of Foreign Assets Control (OFAC)',
        );
        expect(ums.jurisdiction).toBe('US');
        expect(ums.source_document_url).toBeNull();
        expect(ums.reference_number).toBe('15036');
    });

    it('sets entity_identifier_native to null when the vessel has no IMO number, without fabricating one', () => {
        const raw = buildRawRecord({ uid: '4238', vesselName: 'MAR AZUL', imoNumber: null, programs: ['CUBA'] });
        const ums = normalizeVesselRecordToUms(raw);
        expect(ums.entity_identifier_native).toBeNull();
        expect(ums.category_or_type).toBe('CUBA');
    });

    it('joins multiple programs with "; "', () => {
        const raw = buildRawRecord({ programs: ['IRAN', 'IRGC'] });
        const ums = normalizeVesselRecordToUms(raw);
        expect(ums.category_or_type).toBe('IRAN; IRGC');
    });

    it('produces a record that satisfies the full UnifiedRecordSchema (all 18 fields, correct types)', () => {
        const raw = buildRawRecord();
        const ums = normalizeVesselRecordToUms(raw);
        expect(Object.keys(ums)).toHaveLength(18);
    });
});

describe('normalizeDelistedVesselToUms', () => {
    function buildDelistedRecord(overrides: Partial<VesselDelistedRecord> = {}): VesselDelistedRecord {
        return {
            record_id: 'OFAC-SDN-15036',
            event_type: 'DELISTED',
            uid: '15036',
            vesselName: 'ARTAVIL',
            imoNumber: '9187629',
            scraped_at: '2026-09-08T00:00:00.000Z',
            is_new: false,
            source_url: 'https://sanctionssearch.ofac.treas.gov/Details.aspx?id=15036',
            lastConfirmedListedAt: '2026-09-01T00:00:00.000Z',
            ...overrides,
        };
    }

    it('maps identity fields through and honestly nulls fields with no fresh data', () => {
        const ums = normalizeDelistedVesselToUms(buildDelistedRecord());
        expect(ums.record_id).toBe('OFAC-SDN-15036');
        expect(ums.event_type).toBe('DELISTED');
        expect(ums.recipient_or_defendant_name).toBe('ARTAVIL');
        expect(ums.entity_identifier_native).toBe('9187629');
        expect(ums.is_new).toBe(false);
        // Honestly null - this actor has no current OFAC data for a
        // delisted vessel, so it never reuses stale native fields here.
        expect(ums.category_or_type).toBeNull();
        expect(ums.effective_date_iso).toBeNull();
        expect(ums.publish_date_iso).toBeNull();
        expect(ums.status_or_estado).toMatch(/Delisted/);
    });

    it('produces a record that satisfies the full UnifiedRecordSchema', () => {
        const ums = normalizeDelistedVesselToUms(buildDelistedRecord());
        expect(Object.keys(ums)).toHaveLength(18);
    });
});
