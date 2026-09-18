import { createHash } from 'node:crypto';
function hashOf(fields) {
    return createHash('sha1').update(JSON.stringify(fields)).digest('hex');
}
export function vesselFingerprintOf(entry) {
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
//# sourceMappingURL=fingerprint.js.map