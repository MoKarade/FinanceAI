// mcp/tools/getHoldings.spec.ts
// [ARCH-AITOOLS-SPLIT] SPEC pur (browser-safe) — logique VERBATIM de l'ancien tool, sans SDK MCP.
// Enregistrement serveur : getHoldings.tool.ts. Parité app/MCP : tests/aiTools/registryParity.
//
// [MCP-GET-HOLDINGS] — liste les positions RÉELLES de l'utilisateur (symbole, qty, prix natif, devise,
// valeur CAD, compte, rendement). Comblait un trou : pendant l'incident FX (2026-07-14), impossible
// d'identifier le « +70 k$ » en une question — get_financial_overview ne donne que les AGRÉGATS par
// compte, pas les titres. Lecture seule, réutilise la SOURCE UNIQUE assetValueCad (FX + garde NaN).

import type { AppState, Asset } from '../../types';
import { assetValueCad } from '../../services/portfolio';
import { logErrorThrottled } from '../../services/errorLogger';
import { jsonContent, withState } from './_dataAware';
import type { ReadToolSpec } from './_toolSpec';

// `satisfies` (pas une annotation) : préserve les types concrets → inférence server.tool correcte.
export const getHoldingsSpec = {
    kind: 'read',
    name: 'get_holdings',
    description:
        "Liste les PLACEMENTS individuels RÉELS de l'utilisateur (chaque titre détenu), lus depuis son " +
        'état FinanceAI : symbole, nom, quantité, prix courant en devise NATIVE du titre (USD/EUR/CAD), ' +
        'devise, valeur convertie en CAD, type de compte (CELI/REER/CELIAPP/REEE/non-enregistré/crypto/' +
        'marge/autre) et rendement (%). Trié par valeur CAD décroissante, avec le total et la ventilation ' +
        'par compte. Lecture seule. Réponds à « qu\'est-ce que je détiens », « ma plus grosse position », ' +
        '« combien ai-je en CELI ». La valeur CAD est la SOURCE UNIQUE (mêmes chiffres que l\'app) : ne ' +
        'JAMAIS recalculer quantité × prix sans conversion de devise (le prix est en devise native).',
    inputSchema: {},
    handler: async (_args, getState) => withState(getState, (state: AppState) => {
        const assets = (state.assets ?? []) as Asset[];
        const fxRates = state.fxRates ?? {};
        // On garde la valeur BRUTE (non arrondie) par actif pour les totaux → total/ventilation
        // s'alignent sur get_financial_overview (`round(Σ)`) et non `Σ round()` (sinon quelques $
        // d'écart par position, re-pris pour un bug FX vu la sensibilité post-incident 2026-07-14).
        const rows = assets.map((a) => {
            const raw = assetValueCad(a, fxRates); // source unique (FX + garde NaN/Infinity)
            let performancePct: number | null = null;
            if (typeof a.performance === 'number' && Number.isFinite(a.performance)) {
                performancePct = a.performance;
            } else if (typeof a.performance === 'number') {
                // number mais NON fini (Infinity via un buyPrice à 0 en amont) = corruption, pas
                // « rendement absent » : on le signale (throttlé) au lieu de le masquer en null muet.
                logErrorThrottled(`asset-performance-nonfinite:${a.symbol}`, {
                    source: 'storage',
                    severity: 'warning',
                    message: `Rendement non fini pour l'actif « ${a.symbol} » (division par un prix d'achat 0 ?) — omis (null)`,
                    context: { symbol: a.symbol },
                });
            }
            return {
                raw,
                pos: {
                    symbol: a.symbol,
                    name: a.name || null,
                    quantity: a.quantity,
                    currentPrice: a.currentPrice,
                    currency: a.currency ?? null,
                    valueCAD: Math.round(raw),
                    accountType: a.accountType ?? null,
                    performancePct,
                },
            };
        });
        rows.sort((x, y) => y.raw - x.raw);
        const positions = rows.map((r) => r.pos);

        const totalValueCAD = Math.round(rows.reduce((s, r) => s + r.raw, 0));
        // Ventilation par `accountType` BRUT (CELIAPP/NON-ENREG/MARGE/AUTRE distincts) — partition
        // PLUS FINE que les 5 buckets de get_financial_overview (qui replie tout le non-nommé dans
        // nonReg) ; CELI et REER coïncident exactement. Total du bucket = round(Σ bruts) comme ci-dessus.
        const byAccountRaw: Record<string, number> = {};
        for (const r of rows) {
            const key = r.pos.accountType ?? 'AUTRE';
            byAccountRaw[key] = (byAccountRaw[key] ?? 0) + r.raw;
        }
        const byAccount: Record<string, number> = {};
        for (const key of Object.keys(byAccountRaw)) byAccount[key] = Math.round(byAccountRaw[key]);

        return jsonContent({
            count: positions.length,
            totalValueCAD,
            currency: 'CAD',
            byAccount,
            positions,
        });
    }),
} satisfies ReadToolSpec<Record<string, never>>;
