import { z } from 'zod';

/**
 * Actor input, validated at runtime in main.ts against whatever
 * Actor.getInput() returns (Apify does not itself enforce input_schema.json
 * at the TypeScript level - this is the actual runtime guard). Field names
 * and defaults mirror .actor/input_schema.json exactly.
 */
export const ActorInputSchema = z.object({
    maxItems: z.number().int().min(1).default(250),
    onlyNew: z.boolean().default(false),
    enrichWithUnConsolidatedList: z.boolean().default(true),
    programFilter: z.array(z.string()).optional(),
    vesselNameContains: z.string().optional(),
});

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
export const UnifiedRecordSchema = z.object({
    record_id: z.string().min(1),
    event_type: z.union([
        z.enum(['NEW_LISTING', 'AWARD_VARIATION', 'UPDATED', 'SANCTION', 'SNAPSHOT_NO_DIFF']),
        z.string().min(1),
    ]),
    scraped_at: z.string().datetime(),
    is_new: z.boolean().nullable(),
    source_url: z.string().url().nullable(),
    recipient_or_defendant_name: z.string().nullable(),
    entity_identifier_native: z.string().nullable(),
    value_native: z.string().nullable(),
    value_currency: z.string().nullable(),
    value_usd_normalized: z.number().nullable(),
    effective_date_iso: z.string().nullable(),
    publish_date_iso: z.string().nullable(),
    category_or_type: z.string().nullable(),
    status_or_estado: z.string().nullable(),
    awarding_or_regulating_agency: z.string().nullable(),
    jurisdiction: z.string().min(1),
    source_document_url: z.string().url().nullable(),
    reference_number: z.string().nullable(),
});

export type UnifiedRecord = z.infer<typeof UnifiedRecordSchema>;
