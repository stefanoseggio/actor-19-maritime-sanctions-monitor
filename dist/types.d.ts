export interface ActorInput {
    maxItems: number;
    onlyNew: boolean;
    enrichWithUnConsolidatedList: boolean;
    programFilter?: string[];
    vesselNameContains?: string;
}
export interface AkaName {
    type: string | null;
    category: string | null;
    name: string;
}
export interface OtherId {
    idType: string;
    idNumber: string;
}
export interface UnConsolidatedListMatch {
    dataId: string;
    name: string;
    referenceNumber: string | null;
    listedOn: string | null;
}
/** One <sdnEntry> from the OFAC SDN.XML feed with sdnType=Vessel, parsed into a typed shape. */
export interface OfacVesselEntry {
    uid: string;
    vesselName: string;
    sdnType: 'Vessel';
    programs: string[];
    remarks: string | null;
    linkedTo: string | null;
    akaNames: AkaName[];
    imoNumber: string | null;
    mmsi: string | null;
    otherIds: OtherId[];
    callSign: string | null;
    vesselType: string | null;
    vesselFlag: string | null;
    tonnage: string | null;
    grossRegisteredTonnage: string | null;
    vesselOwner: string | null;
    /** The SDN list's own <Publish_Date> (MM/DD/YYYY), one value shared by every entry parsed from the same feed fetch. */
    listPublishDateRaw: string;
}
/** This actor's real event-type vocabulary - see src/delta.ts for the full classification reasoning. */
export type VesselEventType = 'SANCTION' | 'STATUS_CHANGE' | 'UPDATED' | 'SNAPSHOT_NO_DIFF' | 'DELISTED';
/** The raw, per-actor record shape this actor emits to the dataset - OfacVesselEntry's native fields plus the fleet's standard 5-field envelope, mirroring every sibling actor's raw-record convention (see uk-hse-enforcement-monitor's HseRecord / types.ts). */
export interface VesselSanctionRawRecord extends OfacVesselEntry {
    crossReferencedInUnConsolidatedList: boolean;
    unConsolidatedListMatches: UnConsolidatedListMatch[];
    record_id: string;
    event_type: Exclude<VesselEventType, 'DELISTED'>;
    scraped_at: string;
    is_new: boolean;
    source_url: string;
}
/**
 * A vessel no longer present in the current OFAC SDN.XML fetch, when that
 * fetch was a complete census (see src/delta.ts). Deliberately NOT shaped
 * like VesselSanctionRawRecord - this actor has no fresh OFAC data for a
 * delisted vessel (by definition, it's no longer in the feed), so this type
 * only carries what was already known from the last time it WAS seen,
 * rather than pretending to have current native fields it doesn't have.
 */
export interface VesselDelistedRecord {
    record_id: string;
    event_type: 'DELISTED';
    uid: string;
    vesselName: string;
    imoNumber: string | null;
    scraped_at: string;
    is_new: false;
    source_url: string;
    /** When this vessel was last confirmed present in the OFAC feed, before this run's fetch no longer included it. */
    lastConfirmedListedAt: string;
}
//# sourceMappingURL=types.d.ts.map