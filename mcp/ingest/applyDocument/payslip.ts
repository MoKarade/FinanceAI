// mcp/ingest/applyDocument/payslip.ts
// [GODFILE-APPLYDOCUMENT] Section extraite telle quelle du monolithe — le commentaire de
// section d'origine (── … ──) reste l'en-tête de référence ci-dessous.

import type { AppState, User } from '../../../types';
import { annualSalaryToMonthly } from '../../../utils/salary';
import type { ApplyResult, Change, PayslipPayload } from './types';
import { MAX_ANNUAL_INCOME, MAX_ANNUAL_RRSP, plausible, resolveUserIndex } from './commun';

// ── Fiche de paie ────────────────────────────────────────────────────────────
export function applyPayslip(state: AppState, doc: PayslipPayload): ApplyResult {
    const idx = resolveUserIndex(state, doc);
    const users = (state.config?.users ?? []).map((u) => ({ ...u })) as User[];
    if (!users[idx]) throw new Error(`Aucun utilisateur à l'index ${idx} dans la configuration.`);
    const u = users[idx];
    const changes: Change[] = [];

    const rejected: string[] = [];
    if (typeof doc.grossAnnual === 'number' && doc.grossAnnual > 0) {
        if (!plausible(doc.grossAnnual, MAX_ANNUAL_INCOME)) rejected.push('brut annuel aberrant');
        else {
            const monthly = annualSalaryToMonthly(doc.grossAnnual);
            if (u.grossSalary !== monthly) {
                changes.push({ field: `users[${idx}].grossSalary`, before: u.grossSalary, after: monthly, note: `brut annuel ${doc.grossAnnual} → mensuel` });
                u.grossSalary = monthly;
            }
        }
    }
    if (typeof doc.netAnnual === 'number' && doc.netAnnual > 0) {
        if (!plausible(doc.netAnnual, MAX_ANNUAL_INCOME)) rejected.push('net annuel aberrant');
        else {
            const monthly = annualSalaryToMonthly(doc.netAnnual);
            if (u.netSalary !== monthly) {
                changes.push({ field: `users[${idx}].netSalary`, before: u.netSalary, after: monthly, note: `net annuel ${doc.netAnnual} → mensuel` });
                u.netSalary = monthly;
            }
        }
    }
    if (typeof doc.rrspContributedAnnual === 'number' && doc.rrspContributedAnnual >= 0 && !plausible(doc.rrspContributedAnnual, MAX_ANNUAL_RRSP)) {
        rejected.push('cotisation REER aberrante');
    } else if (typeof doc.rrspContributedAnnual === 'number' && doc.rrspContributedAnnual >= 0) {
        if (u.rrspContributed !== doc.rrspContributedAnnual) {
            changes.push({ field: `users[${idx}].rrspContributed`, before: u.rrspContributed ?? 0, after: doc.rrspContributedAnnual });
            u.rrspContributed = doc.rrspContributedAnnual;
        }
    }

    // [INCOME-PROVENANCE] La fiche de paie devient LA source du revenu (visible dans l'onglet
    // Impôt + exposée par get_tax_situation). Estampillée si : un montant a changé, OU une paie
    // plausible est fournie sans provenance existante (1er apply idempotent — sinon le bandeau
    // dirait « saisie manuelle » à tort), OU l'employeur fourni diffère (changement d'employeur
    // à salaire identique — findings panel). La mise à jour de provenance SEULE compte comme un
    // changement (sinon le tool retournerait applied:false sans sauvegarder).
    const payProvided = (typeof doc.grossAnnual === 'number' && doc.grossAnnual > 0)
        || (typeof doc.netAnnual === 'number' && doc.netAnnual > 0);
    const provenanceStale = payProvided
        && (!u.salarySource || (typeof doc.employer === 'string' && doc.employer.trim() !== '' && doc.employer !== u.salarySource.label));
    if (changes.length > 0 || provenanceStale) {
        const before = u.salarySource?.label ?? null;
        const sourceKind = doc.sourceKind ?? 'mcp';
        u.salarySource = {
            kind: sourceKind,
            label: doc.employer || u.salarySource?.label || (sourceKind === 'mcp' ? 'fiche de paie (connecteur)' : 'fiche de paie'),
            appliedAt: Date.now(),
        };
        if (changes.length === 0) {
            changes.push({ field: `users[${idx}].salarySource`, before, after: u.salarySource.label, note: 'provenance de la paie mise à jour (montants inchangés)' });
        }
    }

    users[idx] = u;
    const nextState: AppState = { ...state, config: { ...state.config, users: users as AppState['config']['users'] }, lastUpdate: Date.now() };
    const who = u.name?.trim() || `utilisateur ${idx + 1}`;
    const rej = rejected.length ? ` (${rejected.length} valeur(s) aberrante(s) ignorée(s) : ${rejected.join(', ')})` : '';
    const summary = (changes.length
        ? `Fiche de paie appliquée à ${who} : ${changes.length} champ(s) mis à jour.`
        : `Fiche de paie pour ${who} : aucune modification (valeurs déjà à jour).`) + rej;
    return { nextState, changes, summary };
}
