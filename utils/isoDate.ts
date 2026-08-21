// utils/isoDate.ts
// [DEBT-MCP-PARITE] Source UNIQUE de la validation calendaire d'une date YYYY-MM-DD, réutilisée par
// la garde runtime (`mcp/ingest/applyDocument.ts`, un appel direct bypasse Zod — leçon MCP-WHATIF)
// ET le schéma Zod du tool MCP (`mcp/tools/applyDebt.spec.ts`) — une seule copie, jamais deux
// motifs qui dérivent l'un de l'autre en silence.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Une date YYYY-MM-DD est-elle CALENDAIREMENT valide (pas seulement au bon FORMAT) ?
 * `2026-13-01` ou `2026-02-30` matchent la regex mais ne sont pas des dates réelles ; `Date.UTC`
 * les fait « déborder » silencieusement (mois 13 → janvier de l'année suivante, 30 février → mars)
 * — on rejette donc si les composants ne survivent pas à l'aller-retour. Année bornée à
 * [1970, 2200] : une date de dette hors de cette plage est quasi certainement une faute de
 * frappe/OCR, jamais une vraie échéance.
 */
export function isValidIsoDate(s: string): boolean {
    if (!ISO_DATE_RE.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    if (y < 1970 || y > 2200 || m < 1 || m > 12) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
