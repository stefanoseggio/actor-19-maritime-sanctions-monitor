/**
 * ============================================================================
 * LIVE TARGET VERIFICATION - performed this session, 2026-09-07
 * ============================================================================
 *
 * The brief for this actor named four candidate maritime compliance sources
 * and required each to be live-checked against the fleet's compliance
 * doctrine (no CAPTCHA-solving, no login-wall/session bypass, no WAF evasion,
 * no proxy-rotation-to-evade) before any ingestion code was written. All four
 * were checked with plain `curl` (headers, robots.txt, and actual response
 * bodies) plus WebSearch/WebFetch. Results:
 *
 * 1. VERIFIED OPEN - PRIMARY SOURCE:
 *    US Treasury OFAC Specially Designated Nationals (SDN) List
 *      https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML
 *    A bare unauthenticated GET (no cookies, no prior requests, no API key)
 *    returns HTTP 302 to a time-limited, pre-signed S3 URL
 *    (wc2h-sls-prod-public-published.s3.us-gov-west-1.amazonaws.com), which
 *    itself returns HTTP 200 with Content-Type: text/xml. No CAPTCHA, no
 *    Cloudflare/WAF challenge, no session requirement anywhere in the chain.
 *    The legacy path `https://www.treasury.gov/ofac/downloads/sdn.xml` also
 *    still works (verified 200, ~10.7MB) and itself just 302s into the same
 *    SLS API - both are the same official OFAC feed. robots.txt on
 *    sanctionslistservice.ofac.treas.gov is a bare 404 (no restrictions
 *    declared); robots.txt on the unrelated ofac.treasury.gov Drupal site
 *    (a different host) does not apply to this download path. Live download
 *    this session: 19,329 total SDN entries, of which 1,540 have
 *    sdnType=Vessel (confirmed by direct grep count of the fetched file).
 *    Per-vessel human-readable permalink, also verified live and confirmed
 *    to resolve to the correct record: `sanctionssearch.ofac.treas.gov
 *    /Details.aspx?id=<uid>` (HTTP 200, robots.txt disallows only
 *    /error.aspx). See parseSdnXml.ts for the field-level structure that was
 *    inspected directly in the downloaded XML (idList/vesselInfo/akaList).
 *
 * 2. VERIFIED OPEN - ENRICHMENT SOURCE:
 *    UN Security Council Consolidated Sanctions List
 *      https://scsanctions.un.org/resources/xml/en/consolidated.xml
 *    A bare unauthenticated GET returns HTTP 302 to a pre-signed Azure Blob
 *    Storage URL (unsolprodfiles.blob.core.windows.net) with
 *    Access-Control-Allow-Origin: *, then HTTP 200 XML. No login, no
 *    CAPTCHA. This list has NO dedicated vessel record type or IMO field -
 *    IMO numbers appear only inside free-text COMMENTS1 fields on
 *    INDIVIDUAL/ENTITY records (e.g. "International Maritime Organization
 *    (IMO) Number: 1790183."), confirmed by direct inspection of the live
 *    file this session. Used ONLY as a cross-reference enrichment (see
 *    unConsolidatedList.ts), never to fabricate a structured UN vessel
 *    record the source does not actually provide.
 *
 * 3. VERIFIED GATED - REJECTED:
 *    Paris MoU (parismou.org) "Inspection Search" / "Detentions" pages
 *    Both pages are plain WordPress/LiteSpeed pages (verified: no
 *    Cloudflare/WAF challenge headers) that contain NO native searchable
 *    detention data of their own - both embed a link to EMSA's THETIS
 *    system (`thetis/current-detentions`, `thetis/inspections`, verified by
 *    grepping the fetched HTML). Fetching THETIS directly
 *    (portal.emsa.europa.eu/web/thetis/current-detentions) returns an
 *    immediate redirect to `am3.emsa.europa.eu/realms/emsa/protocol
 *    /openid-connect/auth` - a Keycloak OpenID Connect login screen - on
 *    every request, including its own robots.txt. This is a genuine login
 *    wall. REJECTED per the compliance doctrine's no-login-bypass rule.
 *
 * 4. VERIFIED CAPTCHA-GATED - REJECTED:
 *    Tokyo MoU (tokyo-mou.org) "PSC Database" page links to the public
 *    APCIS search at `https://apcis.tmou.org/isss/public_apcis.php
 *    ?Action=getSearchForm`, which redirects to `https://apcis.tmou.org
 *    /public/`. That page's own search <form> contains an <input
 *    name="captcha">. REJECTED per the compliance doctrine's
 *    no-CAPTCHA-solving rule.
 *
 * NOT USED (not independently re-verified as a data feed, only as a landing
 * page, consistent with this brief's explicit caution not to assume it is
 * open): IMO GISIS (gisis.imo.org). Its own robots.txt disallows
 * /Members/, /Secretariat/ and /WebServices/, and its Public module is
 * session/registration-gated for actual search - the landing page itself
 * returning HTTP 200 is not evidence of an open bulk feed.
 * ============================================================================
 *
 * Both live sources above are plain, stateless, unauthenticated file
 * downloads (not paginated HTML, not a search form) - a bare fetch() with a
 * redirect-following default and an exponential-backoff retry is the entire
 * client. No proxy: neither source is geo-blocked (both were reachable from
 * this session with no Argentina-style geo-restriction observed, unlike the
 * fleet's one documented proxy precedent), so no residential-proxy cost line
 * applies here.
 */

import { Impit } from 'impit';

// One Impit instance per actor run: it holds the connection pool and TLS
// session cache, and gives every request a real, internally-consistent
// Chrome TLS/HTTP2 fingerprint instead of Node's native (and distinctively
// bot-shaped) one - see AGENTS.md for why this was added.
const impit = new Impit({ browser: 'chrome' });

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export const OFAC_SDN_XML_URL = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML';
export const UN_CONSOLIDATED_XML_URL = 'https://scsanctions.un.org/resources/xml/en/consolidated.xml';
export const OFAC_DETAILS_BASE_URL = 'https://sanctionssearch.ofac.treas.gov/Details.aspx';

/**
 * Fetches a plain-text/XML resource with exponential-backoff retry on
 * network failure, non-2xx status, and specifically HTTP 429/503 (rate
 * limiting / temporary unavailability), matching the retry shape already
 * used by uk-hse-enforcement-monitor's http.ts. Both live sources above
 * redirect (302) to a pre-signed storage URL before returning 200 - `fetch`
 * follows redirects by default, so no special handling is needed for that.
 */
export async function fetchTextWithRetry(url: string, maxRetries = 4, baseDelayMs = 1000): Promise<string> {
    let lastError: Error = new Error('unreachable');
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await impit.fetch(url, { redirect: 'follow' });
            if (response.status === 429 || response.status === 503) {
                throw new Error(`HTTP ${response.status} (rate limited / temporarily unavailable) for ${url}`);
            }
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} for ${url}`);
            }
            return await response.text();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < maxRetries) {
                await sleep(baseDelayMs * 2 ** attempt);
            }
        }
    }
    throw lastError;
}
