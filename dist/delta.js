export function classifyVesselRecord(previous, current) {
    if (!previous)
        return 'SANCTION';
    if (previous.statusFingerprint !== current.statusFingerprint)
        return 'STATUS_CHANGE';
    if (previous.contentFingerprint !== current.contentFingerprint)
        return 'UPDATED';
    return 'SNAPSHOT_NO_DIFF';
}
//# sourceMappingURL=delta.js.map