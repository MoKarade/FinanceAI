// mcp/ingest/applyDocument/cashBalance.ts
// [GODFILE-APPLYDOCUMENT] Section extraite telle quelle du monolithe — le commentaire de
// section d'origine (── … ──) reste l'en-tête de référence ci-dessous.

import type { AppState } from '../../../types';
import { formatCAD } from '../../../utils/format';
import { computeCashLedgerDetailed } from '../../../services/startingCash';
import type { ApplyResult, CashBalancePayload, Change } from './types';
import { MAX_CASH_BALANCE, plausible } from './commun';

// ── Ajustement direct du solde de liquidités (cash) ─────────────────────────
// [MCP-DIRECT-EDIT] « Mets mes liquidités à X » : le cash est DÉRIVÉ (computeStartingCash = Σ initialBalances
// + Σ transactions non-dup/transfert, source unique) → on n'écrase PAS un champ, on ajoute un DELTA sur
// `initialBalances.LIQUIDITE` (compte VISIBLE dans Réglages → Comptes) pour que le cash calculé atteigne la
// cible. Idempotent (2ᵉ appel même cible = 0 changement). Sauvegarde horodatée créée avant l'écriture (runApply).
export function applyCashBalance(state: AppState, doc: CashBalancePayload): ApplyResult {
    // Ceinture métier (un appel direct du handler bypasse Zod, leçon MCP-WHATIF) — SANS interpoler le montant
    // dans le message (Loi 25 : le message remonte à logError côté serveur ; ne pas y mettre de valeur brute).
    if (!plausible(doc.targetCad, MAX_CASH_BALANCE) || doc.targetCad < 0) {
        throw new Error('Solde de liquidités invalide ou aberrant (négatif / non fini / hors bornes). Rien n\'a été écrit.');
    }
    // [HARDEN-NETWORTH-NAN] + [CASH-NAN-SILENT] `current` est DÉRIVÉ de données PERSISTÉES
    // (initialBalances/transactions) que le schéma ne garantit PAS finies (Zod `z.number()` laisse passer
    // ±Infinity ; `transactions` = `z.unknown()`). Écrire un delta calculé sur une somme corrompue
    // empoisonnerait le patrimoine en SILENCE (applied:true).
    //
    // ⚠️ **Deux protections correctes qui se contredisaient** (classe DEUX-DEDUPS-QUI-SE-CONTREDISENT).
    // Depuis `[CASH-NAN-SILENT]`, la source unique ÉCARTE les termes non finis et journalise — donc elle
    // rend toujours un nombre FINI, et le test `!Number.isFinite(current)` ci-dessous ne se déclenchait
    // plus JAMAIS. C'est le bon comportement pour un AFFICHAGE (montrer quelque chose + tracer), pas pour
    // une ÉCRITURE : on ne calcule pas un delta sur une somme dont on SAIT qu'elle est incomplète.
    // On interroge donc l'INVENTAIRE des termes écartés, pas la finitude du total.
    //
    // Effet de bord bénéfique : l'ancienne garde ratait le `NaN` (l'ancien `Number(v) || 0` le rabattait
    // sur 0, donc la somme restait finie et l'écriture passait). La nouvelle l'attrape aussi.
    const { cash: current, termesFautifs } = computeCashLedgerDetailed(
        state.initialBalances ?? {},
        state.transactions ?? [],
    );
    const target = doc.targetCad;
    const delta = target - current;
    // Message sans montant brut (Loi 25 : il remonte à logError côté serveur).
    if (termesFautifs.length > 0 || !Number.isFinite(current) || !Number.isFinite(delta)) {
        throw new Error('Solde de liquidités actuel non calculable (un solde de départ ou une transaction est corrompu / non fini). Rien n\'a été écrit — corrige la donnée en cause d\'abord.');
    }
    if (Math.abs(delta) < 0.005) {
        return { nextState: state, changes: [], summary: `Solde de liquidités déjà à ${formatCAD(target)} : aucune modification.` };
    }
    const initialBalances: Record<string, number> = { ...(state.initialBalances ?? {}) };
    initialBalances.LIQUIDITE = (Number(initialBalances.LIQUIDITE) || 0) + delta;
    const changes: Change[] = [{
        field: 'liquidités (solde de cash)',
        before: Math.round(current),
        after: Math.round(target),
        note: 'ajusté via le compte LIQUIDITE des soldes de départ (Réglages → Comptes) — réversible',
    }];
    const nextState: AppState = { ...state, initialBalances, lastUpdate: Date.now() };
    const summary = `Solde de liquidités ajusté : ${formatCAD(current)} → ${formatCAD(target)} `
        + `(compte LIQUIDITE, visible dans Réglages → Comptes). Sauvegarde créée avant l'écriture.`;
    return { nextState, changes, summary };
}
