import { describe, expect, it } from 'vitest';

import { classifyVesselRecord } from '../src/delta.js';
import type { VesselFingerprint } from '../src/fingerprint.js';

const FP_A: VesselFingerprint = { statusFingerprint: 'status-1', contentFingerprint: 'content-1' };
const FP_STATUS_CHANGED: VesselFingerprint = { statusFingerprint: 'status-2', contentFingerprint: 'content-1' };
const FP_CONTENT_CHANGED: VesselFingerprint = { statusFingerprint: 'status-1', contentFingerprint: 'content-2' };

describe('classifyVesselRecord', () => {
    it('classifies a vessel with no prior entry as SANCTION (first-seen)', () => {
        expect(classifyVesselRecord(undefined, FP_A)).toBe('SANCTION');
    });

    it('classifies a programs (status) change as STATUS_CHANGE', () => {
        expect(classifyVesselRecord(FP_A, FP_STATUS_CHANGED)).toBe('STATUS_CHANGE');
    });

    it('classifies a non-status content change as UPDATED', () => {
        expect(classifyVesselRecord(FP_A, FP_CONTENT_CHANGED)).toBe('UPDATED');
    });

    it('classifies an identical fingerprint pair as SNAPSHOT_NO_DIFF', () => {
        expect(classifyVesselRecord(FP_A, { ...FP_A })).toBe('SNAPSHOT_NO_DIFF');
    });

    it('prioritizes STATUS_CHANGE over UPDATED when both fingerprints differ', () => {
        const both: VesselFingerprint = { statusFingerprint: 'status-2', contentFingerprint: 'content-2' };
        expect(classifyVesselRecord(FP_A, both)).toBe('STATUS_CHANGE');
    });
});
