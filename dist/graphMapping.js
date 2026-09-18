/**
 * Documents how this actor's records map onto the real fleet Neo4j
 * ontology defined in services/knowledge-graph-engine/src/ontology/labels.ts
 * (read, not imported - actor-19 is a self-contained package with no
 * dependency on services/, per this task's boundary). The interfaces below
 * are a local, field-for-field mirror of that file's NodeLabel /
 * RelationshipType / *NodeProps / AssociatedWithEdgeProps declarations, kept
 * here only so this actor's own mapping function has something concrete to
 * type-check against. They are NOT a second copy of the ontology to diverge
 * from - any actual ingestion code would import the real types from
 * services/knowledge-graph-engine.
 *
 * ============================================================================
 * REQUIRED DECISION: how does a vessel fit an ontology with no Vessel label?
 * ============================================================================
 * The real ontology has exactly 6 node labels - Entity, PublicBody,
 * Contract, Sanction, Jurisdiction, Official - and no dedicated Vessel type.
 * Two options were on the table:
 *   (a) model a vessel as an Entity, with entityKey derived from its IMO
 *       number (the one globally unique identifier every seagoing vessel
 *       over 100GT carries for life - a strong real dedup key, exactly as
 *       IMO numbers are used for this purpose industry-wide); or
 *   (b) propose a schema-extension note recommending a dedicated Vessel
 *       node label as a future engineering task, without editing the real
 *       ontology file.
 *
 * DECISION: (a). A vessel is modeled as an (:Entity). Justification: the
 * existing EntityNodeProps.entityKey doc comment already anticipates exactly
 * this situation - it says entityKey is "a normalized-name-based
 * deterministic string" used because "no verified registration number
 * exists across these 11 jurisdictions" for the fleet's existing company/
 * individual entities. A vessel's IMO number IS a verified, globally unique
 * registration number - strictly stronger than the name-based fallback the
 * Entity node already exists to use as a last resort. Reusing (:Entity)
 * rather than inventing (:Vessel) means:
 *   - AWARDED_CONTRACT / ISSUED_SANCTION / OPERATES_IN / ASSOCIATED_WITH all
 *     keep working unmodified (they are typed against Entity today);
 *   - a company that owns/operates BOTH conventional contracts (via other
 *     fleet actors) AND a sanctioned vessel resolves to graph-connected
 *     entities without a cross-label join; and
 *   - it costs nothing to reverse later - see the schema-extension note
 *     below for when a dedicated label would start earning its keep.
 *
 * SCHEMA-EXTENSION NOTE (documented recommendation, NOT performed here):
 * if a future actor needs vessel-specific structural queries at scale (e.g.
 * "all vessels flagged to country X regardless of sanctioning program", or
 * storing per-voyage/port-call data), a dedicated (:Vessel {imoNumber,
 * name, flag, vesselType}) label with its own OWNED_BY/FLAGGED_TO edges
 * would be cleaner than continuing to overload (:Entity). That is a
 * recommendation for services/knowledge-graph-engine's maintainers, not an
 * edit made by this actor.
 * ============================================================================
 */
export const ACTOR_ID = 'actor-19-maritime-sanctions-monitor';
const COMBINING_DIACRITICS_PATTERN = /[\u0300-\u036f]/g;
function normalizeEntityName(name) {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(COMBINING_DIACRITICS_PATTERN, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
/**
 * Pure mapping function: one VesselSanctionRawRecord in, the graph node/edge
 * shapes it produces out. entityKey uses the IMO number (prefixed `imo:` to
 * keep the key space unambiguous against the fallback form) when present;
 * otherwise it falls back to the SAME normalized-name convention the real
 * Entity node already uses fleet-wide (see the ontology decision above) -
 * this is a real, documented degradation, not a silent one: roughly 1 in 20
 * of the live SDN vessel entries checked this session carried no extractable
 * IMO number at all, so the fallback path is exercised in real data, not a
 * hypothetical.
 *
 * NOT modeled (documented gap, not silently dropped): raw.linkedTo /
 * raw.vesselOwner (e.g. "NATIONAL IRANIAN TANKER COMPANY") name a second,
 * related Entity - the owning/operating company - but the ontology defines
 * no Entity-to-Entity relationship type (only the four listed at the top of
 * labels.ts), so no edge is produced for this. Adding one (e.g. OWNED_BY)
 * would be a second, separate schema-extension recommendation.
 *
 * ALSO NOT modeled: an (:Entity)-[:OPERATES_IN]->(:Jurisdiction) edge for
 * the vessel itself. The vessel's real-world "jurisdiction" is its flag
 * state (raw.vesselFlag, e.g. "Iran", "Panama", "Cuba") - but this
 * ontology's Jurisdiction{code} node is scoped to the fleet's own 11
 * tracked jurisdictions (where a fleet actor collects data), not arbitrary
 * world countries. Minting a Jurisdiction("Iran") node would silently
 * repurpose that node type beyond its documented meaning, so this mapping
 * deliberately leaves the vessel Entity without an OPERATES_IN edge rather
 * than doing that.
 */
export function mapVesselRecordToGraph(record) {
    const entityKey = record.imoNumber ? `imo:${record.imoNumber}` : `name:${normalizeEntityName(record.vesselName)}`;
    return {
        entity: {
            entityKey,
            name: record.vesselName,
            // The vessel's flag state is not a fleet JurisdictionCode (see
            // module doc above) - null is the honest value, not 'US' (OFAC's
            // jurisdiction belongs to the PublicBody/Sanction side, not the
            // sanctioned vessel itself).
            jurisdictionHint: null,
            // A ship is never a person - this heuristic exists to flag
            // ambiguous human-vs-company defendant names (see labels.ts's
            // EntityNodeProps doc), which does not apply to a vessel name.
            isLikelyIndividual: false,
        },
        sanction: {
            recordId: record.record_id,
            actorId: ACTOR_ID,
            // No monetary amount: an SDN designation blocks assets, it is not
            // a fine - see umsNormalizer.ts's identical value_usd_normalized
            // reasoning.
            fineUsdNormalized: null,
            effectiveDateIso: null,
            sourceUrl: record.source_url,
        },
        publicBody: {
            name: 'Office of Foreign Assets Control (OFAC)',
            jurisdiction: 'US',
        },
        jurisdiction: {
            code: 'US',
        },
        entityIssuedSanctionEdge: { from: 'entity', to: 'sanction', type: 'ISSUED_SANCTION' },
        publicBodyIssuedSanctionEdge: { from: 'publicBody', to: 'sanction', type: 'ISSUED_SANCTION' },
        publicBodyOperatesInEdge: { from: 'publicBody', to: 'jurisdiction', type: 'OPERATES_IN' },
    };
}
//# sourceMappingURL=graphMapping.js.map