// mcp/ingest/applyDocument.ts
//
// Lot 2 — FUSION PURE d'un document analysé dans l'AppState. Claude (Desktop) lit la pièce jointe et
// en extrait les valeurs ; ce module ne fait QUE la fusion sûre (aucun réseau, aucune clé API).
// Fonction pure (state, doc) → { nextState, changes, summary }. Réutilisée telle quelle par la couche
// Drive. Huit types de documents ; [GODFILE-APPLYDOCUMENT] chaque section vit dans
// `applyDocument/<type>.ts` (aides partagées : `applyDocument/commun.ts`, contrat :
// `applyDocument/types.ts`). Cette façade ré-exporte TOUT le contrat public — les consommateurs
// (outils MCP, sync Fintable, exécuteur IA, tests) importent d'ici, inchangés.

import type { AppState } from '../../types';
import type { ApplyResult, DocumentPayload } from './applyDocument/types';
import { applyPayslip } from './applyDocument/payslip';
import { applyTaxSlip } from './applyDocument/taxSlip';
import { applyBankStatement } from './applyDocument/bankStatement';
import { applyBrokerStatement } from './applyDocument/brokerStatement';
import { applyDebt } from './applyDocument/debt';
import { applyCashBalance } from './applyDocument/cashBalance';
import { applyBudgetItem } from './applyDocument/budgetItem';
import { applyDeleteItem } from './applyDocument/deleteItem';

export * from './applyDocument/types';

export function applyDocument(state: AppState, doc: DocumentPayload): ApplyResult {
    switch (doc.kind) {
        case 'payslip': return applyPayslip(state, doc);
        case 'bank_statement': return applyBankStatement(state, doc);
        case 'broker_statement': return applyBrokerStatement(state, doc);
        case 'tax_slip': return applyTaxSlip(state, doc);
        case 'debt': return applyDebt(state, doc);
        case 'cash_balance': return applyCashBalance(state, doc);
        case 'budget_item': return applyBudgetItem(state, doc);
        case 'delete_item': return applyDeleteItem(state, doc);
        default: {
            const k = (doc as { kind?: string }).kind ?? 'inconnu';
            throw new Error(`Type de document non supporté : « ${k} ».`);
        }
    }
}
