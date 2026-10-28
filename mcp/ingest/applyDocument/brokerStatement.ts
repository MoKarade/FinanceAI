// mcp/ingest/applyDocument/brokerStatement.ts
// [GODFILE-APPLYDOCUMENT] Section extraite telle quelle du monolithe — le commentaire de
// section d'origine (── … ──) reste l'en-tête de référence ci-dessous.

import type { AppState, Asset } from '../../../types';
import type { ApplyResult, BrokerStatementPayload, Change } from './types';
import { MAX_PRICE, MAX_QUANTITY, plausible } from './commun';

// ── Relevé de courtage (positions → assets) ──────────────────────────────────
export function applyBrokerStatement(state: AppState, doc: BrokerStatementPayload): ApplyResult {
    const assets = (state.assets ?? []).map((a) => ({ ...a })) as Asset[];
    const today = new Date().toISOString().slice(0, 10);
    const changes: Change[] = [];
    let updated = 0;
    let addedCount = 0;
    let rejCount = 0;

    for (const h of doc.holdings ?? []) {
        const sym = String(h?.symbol || '').trim().toUpperCase();
        if (!sym || typeof h.quantity !== 'number' || h.quantity <= 0) continue;
        if (!plausible(h.quantity, MAX_QUANTITY)) { rejCount++; continue; } // D9 : quantité aberrante ignorée
        const idx = assets.findIndex(
            (a) => (a.symbol || '').toUpperCase() === sym && (!doc.accountType || a.accountType === doc.accountType),
        );
        if (idx >= 0) {
            const before = assets[idx].quantity;
            assets[idx] = {
                ...assets[idx],
                quantity: h.quantity,
                ...(typeof h.currentPrice === 'number' && plausible(h.currentPrice, MAX_PRICE) ? { currentPrice: h.currentPrice } : {}),
            };
            if (before !== h.quantity || typeof h.currentPrice === 'number') {
                changes.push({ field: `position ${sym} (quantité)`, before, after: h.quantity });
                updated++;
            }
        } else {
            const price = (typeof h.currentPrice === 'number' && plausible(h.currentPrice, MAX_PRICE)) ? h.currentPrice : 0;
            assets.push({
                symbol: sym,
                name: h.name || sym,
                quantity: h.quantity,
                currency: h.currency || 'CAD',
                currentPrice: price,
                performance: 0,
                dateBought: today,
                buyPrice: price,
                purchases: [{ date: today, quantity: h.quantity, price }],
                accountType: doc.accountType ?? 'NON-ENREG',
            });
            changes.push({ field: `position ${sym}`, before: null, after: `${h.quantity} unité(s)` });
            addedCount++;
        }
    }

    const nextState: AppState = changes.length ? { ...state, assets, lastUpdate: Date.now() } : state;
    const rej = rejCount ? ` (${rejCount} position(s) aberrante(s) ignorée(s))` : '';
    const summary = (changes.length
        ? `Relevé de courtage : ${updated} position(s) mise(s) à jour, ${addedCount} ajoutée(s).`
        : 'Relevé de courtage : aucune modification.') + rej;
    return { nextState, changes, summary };
}
