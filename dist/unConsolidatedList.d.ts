import type { UnConsolidatedListMatch } from './types.js';
/** Builds a Map from 7-digit IMO number to every UN ENTITY/INDIVIDUAL record whose COMMENTS1 text mentions it. */
export declare function buildUnImoIndex(xml: string): Map<string, UnConsolidatedListMatch[]>;
/** Looks up an OFAC-extracted IMO number in the pre-built UN index. Returns an empty array (never null/undefined) when there is no match, so callers can spread the result directly. */
export declare function lookupUnMatches(imoNumber: string | null, index: Map<string, UnConsolidatedListMatch[]>): UnConsolidatedListMatch[];
//# sourceMappingURL=unConsolidatedList.d.ts.map