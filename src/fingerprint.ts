import { createHash } from 'node:crypto';

import type { OfacVesselEntry } from './types.js';

function hashOf(fields: Record<string, unknown>): string {
    return createHash('sha1').update(JSON.stringify(fields)).digest('hex');
}

export interface VesselFingerprint {
    /** Hash over `programs` (sorted, so reordering the same set isn't a false change) - the closest thing to a "status" this domain has: a still-listed vessel can be added to or dropped from a specific sanctions program without being delisted outright. */
    statusFingerprint: string;
    /** Hash over the vessel's other mutable fields - never `uid` (identity, already the record key) or `listPublishDateRaw` (a feed-level value shared by every entry in one fetch, not a per-vessel signal). */
    contentFingerprint: string;
}

export function vesselFingerprintOf(entry: OfacVesselEntry): VesselFingerprint {
    return {
        statusFingerprint: hashOf({ programs: [...entry.programs].sort() }),
        contentFingerprint: hashOf({
            vesselName: entry.vesselName,
            remarks: entry.remarks,
            linkedTo: entry.linkedTo,
            akaNames: entry.akaNames,
            imoNumber: entry.imoNumber,
            mmsi: entry.mmsi,
            otherIds: entry.otherIds,
            callSign: entry.callSign,
            vesselType: entry.vesselType,
            vesselFlag: entry.vesselFlag,
            tonnage: entry.tonnage,
            grossRegisteredTonnage: entry.grossRegisteredTonnage,
            vesselOwner: entry.vesselOwner,
        }),
    };
}
