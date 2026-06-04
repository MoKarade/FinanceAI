// mcp/ingest/applyDocument.ts
//
// Lot 2 — FUSION PURE d'un document analysé dans l'AppState. Claude (Desktop)
// lit la pièce jointe (PDF/image) et en extrait les valeurs ; ce module ne fait
// QUE la fusion sûre (aucune dépendance réseau, aucune clé API). Fonction pure :
// (state, doc) → { nextState, changes, summary }. Testable, et réutilisée telle
// quelle par la couche fluide (Drive) — seul le transport changera.
//
// Première tranche : fiche de paie. Les autres types (relevé bancaire, courtage,
// feuillets fiscaux) s'ajoutent au type union `DocumentPayload` + un case ci-dessous.

import type { AppState, User } from '../../types';
import { annualSalaryToMonthly } from '../../utils/salary';

/** Fiche de paie — valeurs ANNUELLES (Claude multiplie période × fréquence). */
export interface PayslipPayload {
    kind: 'payslip';
    /** Utilisateur ciblé : 0 = principal (défaut), 1 = conjoint. */
    userIndex?: 0 | 1;
    /** Alternative à userIndex : cibler par nom (insensible à la casse). */
    userName?: string;
    /** Salaire BRUT annuel. Stocké en mensuel (convention du store). */
    grossAnnual?: number;
    /** Salaire NET annuel. Stocké en mensuel. */
    netAnnual?: number;
    /** Cotisations REER de l'année (annuel). */
    rrspContributedAnnual?: number;
}

/** Union extensible des documents applicables (les 3 autres types suivent). */
export type DocumentPayload = PayslipPayload;

/** Un changement atomique, pour un résumé lisible (avant → après). */
export interface Change {
    field: string;
    before: unknown;
    after: unknown;
    note?: string;
}

export interface ApplyResult {
    nextState: AppState;
    changes: Change[];
    summary: string;
}

/** Point d'entrée : route vers le merge du bon type de document. */
export function applyDocument(state: AppState, doc: DocumentPayload): ApplyResult {
    switch (doc.kind) {
        case 'payslip':
            return applyPayslip(state, doc);
        default: {
            const k = (doc as { kind?: string }).kind ?? 'inconnu';
            throw new Error(`Type de document non supporté : « ${k} ».`);
        }
    }
}

/** Résout l'index d'utilisateur ciblé (par index, sinon par nom, sinon 0). */
function resolveUserIndex(state: AppState, doc: PayslipPayload): number {
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

function applyPayslip(state: AppState, doc: PayslipPayload): ApplyResult {
    const idx = resolveUserIndex(state, doc);
    const users = (state.config?.users ?? []).map((u) => ({ ...u })) as User[];
    if (!users[idx]) throw new Error(`Aucun utilisateur à l'index ${idx} dans la configuration.`);
    const u = users[idx];
    const changes: Change[] = [];

    // Brut/net : le store est MENSUEL (le moteur ré-annualise ×12). On reçoit de
    // l'ANNUEL → on convertit, EXACTEMENT comme l'upload de paie in-app.
    if (typeof doc.grossAnnual === 'number' && doc.grossAnnual > 0) {
        const monthly = annualSalaryToMonthly(doc.grossAnnual);
        if (u.grossSalary !== monthly) {
            changes.push({ field: `users[${idx}].grossSalary`, before: u.grossSalary, after: monthly, note: `brut annuel ${doc.grossAnnual} → mensuel` });
            u.grossSalary = monthly;
        }
    }
    if (typeof doc.netAnnual === 'number' && doc.netAnnual > 0) {
        const monthly = annualSalaryToMonthly(doc.netAnnual);
        if (u.netSalary !== monthly) {
            changes.push({ field: `users[${idx}].netSalary`, before: u.netSalary, after: monthly, note: `net annuel ${doc.netAnnual} → mensuel` });
            u.netSalary = monthly;
        }
    }
    if (typeof doc.rrspContributedAnnual === 'number' && doc.rrspContributedAnnual >= 0) {
        if (u.rrspContributed !== doc.rrspContributedAnnual) {
            changes.push({ field: `users[${idx}].rrspContributed`, before: u.rrspContributed ?? 0, after: doc.rrspContributedAnnual });
            u.rrspContributed = doc.rrspContributedAnnual;
        }
    }

    users[idx] = u;
    const nextState: AppState = {
        ...state,
        config: { ...state.config, users: users as AppState['config']['users'] },
        lastUpdate: Date.now(),
    };
    const who = u.name?.trim() || `utilisateur ${idx + 1}`;
    const summary = changes.length
        ? `Fiche de paie appliquée à ${who} : ${changes.length} champ(s) mis à jour.`
        : `Fiche de paie pour ${who} : aucune modification (valeurs déjà à jour).`;
    return { nextState, changes, summary };
}
