// Edge worker in front of the static Astro build.
// It looks up the visitor's location from Cloudflare (request.cf) and tags
// every HTML page with the cookie consent mode for that location:
//   optin  : consent needed before non-essential cookies (GDPR style)
//   notice : non-essential cookies allowed, with a way to opt out (US state laws)
//   none   : no banner
// Everything else is served straight from the static assets.

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

type Mode = 'optin' | 'notice' | 'none';

// EU member states and their outermost regions, plus EEA (IS, LI, NO)
const OPT_IN_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'GF', 'GP', 'MQ', 'RE', 'YT', 'MF', 'AX',
  'IS', 'LI', 'NO',
  // UK and its Crown Dependencies, Switzerland, Brazil (LGPD)
  'GB', 'GG', 'JE', 'IM', 'CH', 'BR',
]);

// Canadian provinces that require opt-in consent (Quebec Law 25)
const OPT_IN_CA_REGIONS = new Set(['QC']);

// US states with comprehensive privacy laws built on opt-out rights
const NOTICE_US_STATES = new Set([
  'CA', 'CO', 'CT', 'DE', 'IA', 'IN', 'KY', 'MD', 'MN', 'MT', 'NE', 'NH', 'NJ',
  'OR', 'RI', 'TN', 'TX', 'UT', 'VA',
]);

function modeFor(country: string, region: string): Mode {
  if (OPT_IN_COUNTRIES.has(country)) return 'optin';
  if (country === 'CA' && OPT_IN_CA_REGIONS.has(region)) return 'optin';
  if (country === 'US' && NOTICE_US_STATES.has(region)) return 'notice';
  return 'none';
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cf = (request as any).cf || {};
    const country = String(cf.country || '').toUpperCase();
    const region = String(cf.regionCode || '').toUpperCase();
    const mode = modeFor(country, region);

    // Debug endpoint: shows what the edge sees for this visitor
    if (url.pathname === '/__consent') {
      return Response.json(
        { country: country || null, region: region || null, mode },
        { headers: { 'cache-control': 'no-store' } },
      );
    }

    const res = await env.ASSETS.fetch(request);
    const type = res.headers.get('content-type') || '';
    if (!type.includes('text/html')) return res;

    const out = new HTMLRewriter()
      .on('html', {
        element(el) {
          el.setAttribute('data-consent', mode);
          if (country) el.setAttribute('data-geo', region ? `${country}-${region}` : country);
        },
      })
      .transform(res);

    // The page now differs per visitor location, so keep shared caches out
    const headers = new Headers(out.headers);
    headers.set('cache-control', 'private, no-cache');
    headers.delete('etag');
    return new Response(out.body, { status: out.status, statusText: out.statusText, headers });
  },
};
