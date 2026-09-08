/**
 * MCP tool spec for this actor, following the real registration pattern in
 * services/mcp-gateway/src/mcp/tools/searchGovernmentTenders.ts +
 * getEnforcementHistory.ts + registry.ts (read, not imported - this file is
 * self-contained inside src/actors/actor-19/, per this task's boundary; it
 * is NOT wired into services/mcp-gateway's actual registry.ts here).
 *
 * Modeled specifically on getEnforcementHistory.ts's shape: like that tool,
 * this one is scoped to exactly one actor/source (no `jurisdiction` fan-out
 * parameter), because "vessel sanctions" is not a concept spread across
 * multiple fleet actors the way "government tenders" is.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const TOOL_NAME = 'search_vessel_sanctions';

export const SEARCH_VESSEL_SANCTIONS_DESCRIPTION =
    'Scoped exclusively to actor-19-maritime-sanctions-monitor: vessel-type entries from the US Treasury OFAC Specially Designated Nationals (SDN) List (name, IMO number, flag, tonnage, owner, sanctions program), optionally cross-referenced against the UN Security Council Consolidated Sanctions List by IMO number. This is sanctions/designation data (assets blocked), not a fine or a contract award - value_usd_normalized is always null.';

/**
 * Shared request-mode / date-range shapes would normally be imported from
 * services/mcp-gateway/src/schemas/common.ts (requestModeSchema,
 * dateRangeSchema) - redeclared minimally here since this actor package has
 * no dependency on services/.
 */
const requestModeSchema = z.enum(['cached', 'realtime']).default('cached');

export const searchVesselSanctionsInputSchema = z.object({
    /** Case-insensitive substring match against the vessel's listed name (including aka/fka entries). */
    vessel_name: z.string().optional(),
    /** Exact 7-digit IMO number match - the strongest identifier this tool supports. */
    imo_number: z
        .string()
        .regex(/^\d{7}$/, 'IMO numbers are exactly 7 digits')
        .optional(),
    /** OFAC program code(s), e.g. "IRAN", "DPRK2" - matches if the vessel is designated under any one of them. */
    program: z.array(z.string()).optional(),
    /** When true, only vessels also cross-referenced in the UN Security Council Consolidated List are returned. */
    un_cross_referenced_only: z.coerce.boolean().default(false),
    only_new: z.coerce.boolean().default(false).describe('Early-stop delta filter, matching this actor\'s own onlyNew input.'),
    mode: requestModeSchema,
});

export type SearchVesselSanctionsInput = z.infer<typeof searchVesselSanctionsInputSchema>;

export const inputSchema = searchVesselSanctionsInputSchema;
/** Real JSON Schema derived from the single zod source above - not hand-duplicated, matching searchGovernmentTenders.ts's convention. */
export const jsonSchema = zodToJsonSchema(searchVesselSanctionsInputSchema, TOOL_NAME);
export const description = SEARCH_VESSEL_SANCTIONS_DESCRIPTION;

export interface SearchVesselSanctionsOutput {
    result_count: number;
    cache_hit: boolean;
    records: unknown[];
}

/**
 * Minimal shape of the shared ToolContext (see
 * services/mcp-gateway/src/mcp/tools/context.ts) that this handler actually
 * uses. The real ToolContext carries more (subscriptionStore, apiKey, ...)
 * but this tool only needs queryRouter + usageSink, so only that subset is
 * declared here rather than importing the full real interface.
 */
export interface ToolContext {
    queryRouter: {
        fetchRecords: (params: {
            jurisdictions: string[];
            mode: 'cached' | 'realtime';
            onlyNew: boolean;
            extraCacheKeyShape: Record<string, unknown>;
        }) => Promise<{ records: unknown[]; cacheHit: boolean }>;
    };
    usageSink: {
        record: (usage: Record<string, unknown>) => Promise<void>;
    };
}

/**
 * Filters records this actor's own dataset shape produces (see types.ts's
 * VesselSanctionRawRecord) by the tool's input. Records are `unknown` at
 * this boundary (matching applySearchFilters/applyEnforcementFilters'
 * real-world un-typed shape in services/mcp-gateway/src/routing/
 * recordFilters.ts, which filters the same kind of loosely-typed dataset
 * rows coming back from a cache/queryRouter layer).
 */
function applyVesselSanctionFilters(records: unknown[], input: SearchVesselSanctionsInput): unknown[] {
    return records.filter((record) => {
        if (typeof record !== 'object' || record === null) return false;
        const r = record as Record<string, unknown>;

        if (input.vessel_name) {
            const name = typeof r.vesselName === 'string' ? r.vesselName.toLowerCase() : '';
            const akas = Array.isArray(r.akaNames)
                ? (r.akaNames as Array<{ name?: unknown }>).map((a) => String(a?.name ?? '').toLowerCase())
                : [];
            const wanted = input.vessel_name.toLowerCase();
            if (!name.includes(wanted) && !akas.some((a) => a.includes(wanted))) return false;
        }

        if (input.imo_number && r.imoNumber !== input.imo_number) return false;

        if (input.program && input.program.length > 0) {
            const programs = Array.isArray(r.programs) ? (r.programs as string[]) : [];
            const wanted = input.program.map((p) => p.toLowerCase());
            if (!programs.some((p) => wanted.some((w) => p.toLowerCase().includes(w)))) return false;
        }

        if (input.un_cross_referenced_only && r.crossReferencedInUnConsolidatedList !== true) return false;

        if (input.only_new && r.is_new !== true) return false;

        return true;
    });
}

export async function handler(input: SearchVesselSanctionsInput, ctx: ToolContext): Promise<SearchVesselSanctionsOutput> {
    const result = await ctx.queryRouter.fetchRecords({
        jurisdictions: ['US'],
        mode: input.mode,
        onlyNew: input.only_new,
        extraCacheKeyShape: {
            tool: TOOL_NAME,
            vessel_name: input.vessel_name,
            imo_number: input.imo_number,
            program: input.program,
            un_cross_referenced_only: input.un_cross_referenced_only,
        },
    });

    const filtered = applyVesselSanctionFilters(result.records, input);

    await ctx.usageSink.record({
        toolOrEndpoint: TOOL_NAME,
        cacheHit: result.cacheHit,
        jurisdictionsRequested: ['US'],
    });

    return {
        result_count: filtered.length,
        cache_hit: result.cacheHit,
        records: filtered,
    };
}
