import { describe, expect, it } from 'vitest';

import { vesselFingerprintOf } from '../src/fingerprint.js';
import type { OfacVesselEntry } from '../src/types.js';

function makeEntry(overrides: Partial<OfacVesselEntry> = {}): OfacVesselEntry {
    return {
        uid: '12345',
        vesselName: 'MV Example',
        sdnType: 'Vessel',
        programs: ['IRAN'],
        remarks: null,
        linkedTo: null,
        akaNames: [],
        imoNumber: '9876543',
        mmsi: null,
        otherIds: [],
        callSign: null,
        vesselType: 'Cargo',
        vesselFlag: 'Panama',
        tonnage: '50000',
        grossRegisteredTonnage: null,
        vesselOwner: 'Example Shipping Co',
        listPublishDateRaw: '01/01/2026',
        ...overrides,
    };
}

describe('vesselFingerprintOf', () => {
    it('is stable across identical input', () => {
        expect(vesselFingerprintOf(makeEntry())).toEqual(vesselFingerprintOf(makeEntry()));
    });

    it('statusFingerprint changes when programs change, contentFingerprint does not', () => {
        const a = vesselFingerprintOf(makeEntry());
        const b = vesselFingerprintOf(makeEntry({ programs: ['IRAN', 'SDGT'] }));
        expect(a.statusFingerprint).not.toBe(b.statusFingerprint);
        expect(a.contentFingerprint).toBe(b.contentFingerprint);
    });

    it('statusFingerprint is order-independent for the same set of programs', () => {
        const a = vesselFingerprintOf(makeEntry({ programs: ['IRAN', 'SDGT'] }));
        const b = vesselFingerprintOf(makeEntry({ programs: ['SDGT', 'IRAN'] }));
        expect(a.statusFingerprint).toBe(b.statusFingerprint);
    });

    it('contentFingerprint changes when vesselName changes (a renamed vessel is a real, meaningful signal), statusFingerprint does not', () => {
        const a = vesselFingerprintOf(makeEntry());
        const b = vesselFingerprintOf(makeEntry({ vesselName: 'MV Renamed' }));
        expect(a.statusFingerprint).toBe(b.statusFingerprint);
        expect(a.contentFingerprint).not.toBe(b.contentFingerprint);
    });

    it('contentFingerprint changes when vesselFlag or vesselOwner changes', () => {
        const a = vesselFingerprintOf(makeEntry());
        const flagChanged = vesselFingerprintOf(makeEntry({ vesselFlag: 'Liberia' }));
        const ownerChanged = vesselFingerprintOf(makeEntry({ vesselOwner: 'Different Owner LLC' }));
        expect(a.contentFingerprint).not.toBe(flagChanged.contentFingerprint);
        expect(a.contentFingerprint).not.toBe(ownerChanged.contentFingerprint);
    });

    it('does not fingerprint uid (identity) or listPublishDateRaw (feed-level, not per-vessel)', () => {
        const a = vesselFingerprintOf(makeEntry({ uid: '11111', listPublishDateRaw: '01/01/2026' }));
        const b = vesselFingerprintOf(makeEntry({ uid: '22222', listPublishDateRaw: '02/01/2026' }));
        expect(a).toEqual(b);
    });
});
