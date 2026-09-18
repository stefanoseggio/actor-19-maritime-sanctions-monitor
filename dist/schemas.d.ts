import { z } from 'zod';
/**
 * Actor input, validated at runtime in main.ts against whatever
 * Actor.getInput() returns (Apify does not itself enforce input_schema.json
 * at the TypeScript level - this is the actual runtime guard). Field names
 * and defaults mirror .actor/input_schema.json exactly.
 */
export declare const ActorInputSchema: z.ZodObject<{
    maxItems: z.ZodDefault<z.ZodNumber>;
    onlyNew: z.ZodDefault<z.ZodBoolean>;
    enrichWithUnConsolidatedList: z.ZodDefault<z.ZodBoolean>;
    programFilter: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    vesselNameContains: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    maxItems: number;
    onlyNew: boolean;
    enrichWithUnConsolidatedList: boolean;
    programFilter?: string[] | undefined;
    vesselNameContains?: string | undefined;
}, {
    maxItems?: number | undefined;
    onlyNew?: boolean | undefined;
    enrichWithUnConsolidatedList?: boolean | undefined;
    programFilter?: string[] | undefined;
    vesselNameContains?: string | undefined;
}>;
export type ActorInputParsed = z.infer<typeof ActorInputSchema>;
/**
 * The Unified Master Schema (UMS) - 18 fields, exactly as specified in
 * services/enterprise-sdks/node/src/types.ts's UnifiedRecord interface.
 * Nothing here adds, removes, or renames a field.
 *
 * `jurisdiction` in that real interface is typed as the fleet's existing
 * 11-code JurisdictionCode union (AU, UK, FL, AR-*, CL) - none of which is
 * correct for a US federal sanctions program. Per this task's own copy of
 * the UMS contract (which types `jurisdiction` as plain `string`, not that
 * narrower union), this actor emits 'US' - the OFAC SDN List is administered
 * by the U.S. Department of the Treasury. Wiring 'US' into the shared
 * JurisdictionCode union in services/enterprise-sdks would be a follow-up
 * engineering task against that package, out of this actor's boundary
 * (src/actors/actor-19/ only) - flagged here rather than silently done.
 */
export declare const UnifiedRecordSchema: z.ZodObject<{
    record_id: z.ZodString;
    event_type: z.ZodUnion<[z.ZodEnum<["NEW_LISTING", "AWARD_VARIATION", "UPDATED", "SANCTION", "SNAPSHOT_NO_DIFF"]>, z.ZodString]>;
    scraped_at: z.ZodString;
    is_new: z.ZodNullable<z.ZodBoolean>;
    source_url: z.ZodNullable<z.ZodString>;
    recipient_or_defendant_name: z.ZodNullable<z.ZodString>;
    entity_identifier_native: z.ZodNullable<z.ZodString>;
    value_native: z.ZodNullable<z.ZodString>;
    value_currency: z.ZodNullable<z.ZodString>;
    value_usd_normalized: z.ZodNullable<z.ZodNumber>;
    effective_date_iso: z.ZodNullable<z.ZodString>;
    publish_date_iso: z.ZodNullable<z.ZodString>;
    category_or_type: z.ZodNullable<z.ZodString>;
    status_or_estado: z.ZodNullable<z.ZodString>;
    awarding_or_regulating_agency: z.ZodNullable<z.ZodString>;
    jurisdiction: z.ZodString;
    source_document_url: z.ZodNullable<z.ZodString>;
    reference_number: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    record_id: string;
    event_type: string;
    scraped_at: string;
    is_new: boolean | null;
    source_url: string | null;
    recipient_or_defendant_name: string | null;
    entity_identifier_native: string | null;
    value_native: string | null;
    value_currency: string | null;
    value_usd_normalized: number | null;
    effective_date_iso: string | null;
    publish_date_iso: string | null;
    category_or_type: string | null;
    status_or_estado: string | null;
    awarding_or_regulating_agency: string | null;
    jurisdiction: string;
    source_document_url: string | null;
    reference_number: string | null;
}, {
    record_id: string;
    event_type: string;
    scraped_at: string;
    is_new: boolean | null;
    source_url: string | null;
    recipient_or_defendant_name: string | null;
    entity_identifier_native: string | null;
    value_native: string | null;
    value_currency: string | null;
    value_usd_normalized: number | null;
    effective_date_iso: string | null;
    publish_date_iso: string | null;
    category_or_type: string | null;
    status_or_estado: string | null;
    awarding_or_regulating_agency: string | null;
    jurisdiction: string;
    source_document_url: string | null;
    reference_number: string | null;
}>;
export type UnifiedRecord = z.infer<typeof UnifiedRecordSchema>;
//# sourceMappingURL=schemas.d.ts.map