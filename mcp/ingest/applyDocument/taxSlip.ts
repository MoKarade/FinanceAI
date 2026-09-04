// mcp/ingest/applyDocument/taxSlip.ts
// [GODFILE-APPLYDOCUMENT] Section extraite telle quelle du monolithe — le commentaire de
// section d'origine (── … ──) reste l'en-tête de référence ci-dessous.

import type { AppState, User } from '../../../types';
import { annualSalaryToMonthly } from '../../../utils/salary';
import type { ApplyResult, Change, TaxSlipPayload } from './types';
import { MAX_ANNUAL_INCOME, MAX_ANNUAL_RRSP, plausible, resolveUserIndex } from './commun';

// ── Feuillet fiscal (T4 / RL-1) ──────────────────────────────────────────────
export function applyTaxSlip(state: AppState, doc: TaxSlipPayload): ApplyResult {
    const idx = resolveUserIndex(state, doc);
    const users = (state.config?.users ?? []).map((u) => ({ ...u })) as User[];
    if (!users[idx]) throw new Error(`Aucun utilisateur à l'index ${idx} dans la configuration.`);
    const u = users[idx];
    const changes: Change[] = [];

    const rejected: string[] = [];
    if (typeof doc.employmentIncomeAnnual === 'number' && doc.employmentIncomeAnnual > 0) {
        if (!plausible(doc.employmentIncomeAnnual, MAX_ANNUAL_INCOME)) rejected.push("revenu d'emploi aberrant");
        else {
            const monthly = annualSalaryToMonthly(doc.employmentIncomeAnnual);
            if (u.grossSalary !== monthly) {
                changes.push({ field: `users[${idx}].grossSalary`, before: u.grossSalary, after: monthly, note: `revenu d'emploi annuel ${doc.employmentIncomeAnnual} → mensuel` });
                u.grossSalary = monthly;
            }
        }
    }
    if (typeof doc.rrspContributedAnnual === 'number' && doc.rrspContributedAnnual >= 0) {
        if (!plausible(doc.rrspContributedAnnual, MAX_ANNUAL_RRSP)) rejected.push('cotisation REER aberrante');
        else if (u.rrspContributed !== doc.rrspContributedAnnual) {
            changes.push({ field: `users[${idx}].rrspContributed`, before: u.rrspContributed ?? 0, after: doc.rrspContributedAnnual });
            u.rrspContributed = doc.rrspContributedAnnual;
        }
    }

    users[idx] = u;
    const nextState: AppState = { ...state, config: { ...state.config, users: users as AppState['config']['users'] }, lastUpdate: Date.now() };
    const who = u.name?.trim() || `utilisateur ${idx + 1}`;
    const rej = rejected.length ? ` (${rejected.length} valeur(s) aberrante(s) ignorée(s) : ${rejected.join(', ')})` : '';
    const summary = (changes.length
        ? `Feuillet ${doc.slipType || 'fiscal'} appliqué à ${who} : ${changes.length} champ(s) mis à jour.`
        : `Feuillet fiscal pour ${who} : aucune modification (valeurs déjà à jour).`) + rej;
    return { nextState, changes, summary };
}
