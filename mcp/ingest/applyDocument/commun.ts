// mcp/ingest/applyDocument/commun.ts
// [GODFILE-APPLYDOCUMENT] Aides PARTAGÉES entre plusieurs sections d'ingestion — n'atterrit ici
// que ce que DEUX handlers au moins consomment (une aide à site unique reste dans son module).

import type { AppState } from '../../../types';

/** Résout l'index d'utilisateur ciblé (par index, sinon par nom, sinon 0). */
export function resolveUserIndex(state: AppState, doc: { userIndex?: 0 | 1; userName?: string }): number {
    if (doc.userIndex === 0 || doc.userIndex === 1) return doc.userIndex;
    if (doc.userName) {
        const target = doc.userName.trim().toLowerCase();
        const i = (state.config?.users ?? []).findIndex(
            (u) => (u?.name ?? '').trim().toLowerCase() === target,
        );
        if (i >= 0) return i;
    }
    return 0;
}

// ── Bornes de plausibilité (D9, sécurité) ───────────────────────────────────
// Le contenu des documents est extrait par l'IA depuis une pièce jointe ; une prompt-injection sur
// le document pourrait tenter d'écrire des valeurs ABERRANTES (salaire à 10¹², transactions énormes)
// pour corrompre les finances. Toute valeur hors de ces bornes (très larges) est IGNORÉE — jamais
// appliquée — et signalée dans le résumé (pas d'écriture silencieuse).
export const MAX_ANNUAL_INCOME = 50_000_000;   // 50 M$/an : couvre tout revenu personnel réaliste
export const MAX_ANNUAL_RRSP = 1_000_000;      // 1 M$/an de cotisation REER
export const MAX_TXN_AMOUNT = 100_000_000;     // 100 M$ pour une seule transaction
export const MAX_QUANTITY = 100_000_000;       // 100 M d'unités d'un même titre
export const MAX_PRICE = 10_000_000;           // 10 M$ par unité
export const MAX_DEBT_BALANCE = 50_000_000;    // 50 M$ de solde de dette personnelle
export const MAX_MONTHLY_PAYMENT = 1_000_000;  // 1 M$/mois de paiement
export const MAX_INTEREST_RATE = 100;          // 100 %/an (au-delà = aberrant/injection)
export const MAX_CASH_BALANCE = 100_000_000;   // 100 M$ de liquidités : au-delà = aberrant/injection
export const plausible = (v: number, max: number): boolean => Number.isFinite(v) && Math.abs(v) <= max;

/** Clé d'upsert : nom trim + minuscules + accents strippés (même normalisation que categoryRules). */
export const budgetNameKey = (name: string): string =>
    String(name || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

