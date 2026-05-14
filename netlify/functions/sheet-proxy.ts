// Proxy Netlify Function pour fetch la Google Sheet en server-side.
// Remplace api.allorigins.win (tiers gratuit non fiable, risque de disparition).
//
// Sécurité: SHEET_ID est hardcodé ici (pas de paramètre URL accepté), donc
// pas de risque SSRF. Si on doit gérer plusieurs sheets, ajouter une
// allowlist explicite plutôt que d'accepter une URL en query string.
//
// Format: Netlify Functions v2 (Web Standard Request/Response).

const SHEET_ID = "1bvHRAFP-GCjQjgsRit61JBidPAmerdgij33_lO1Ob9w";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;

export default async (_req: Request): Promise<Response> => {
    try {
        const upstream = await fetch(CSV_URL, { cache: 'no-store' });

        if (!upstream.ok) {
            return new Response(
                JSON.stringify({ error: 'sheet_fetch_failed', status: upstream.status }),
                {
                    status: upstream.status,
                    headers: { 'Content-Type': 'application/json' },
                },
            );
        }

        const text = await upstream.text();

        // Si la sheet est privatisée/supprimée, Google renvoie une page HTML 200
        const lower = text.toLowerCase();
        if (lower.includes('<!doctype html>') || lower.includes('<html')) {
            return new Response(
                JSON.stringify({ error: 'sheet_not_public' }),
                { status: 502, headers: { 'Content-Type': 'application/json' } },
            );
        }

        return new Response(text, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Cache-Control': 'public, max-age=300, s-maxage=300',
            },
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return new Response(
            JSON.stringify({ error: 'proxy_exception', message: msg }),
            { status: 502, headers: { 'Content-Type': 'application/json' } },
        );
    }
};

export const config = {
    path: '/.netlify/functions/sheet-proxy',
};
