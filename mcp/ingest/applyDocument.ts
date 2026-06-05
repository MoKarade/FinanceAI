// mcp/ingest/applyDocument.ts
//
// Lot 2 — FUSION PURE d'un document analysé dans l'AppState. Claude (Desktop) lit la pièce jointe et
// en extrait les valeurs ; ce module ne fait QUE la fusion sûre (aucun réseau, aucune clé API).
// Fonction pure (state, doc) → { nextState, changes, summary }. Réutilisée telle quelle par la couche
// Drive. Quatre types : fiche de paie, relevé bancaire, relevé de courtage, feuillet fiscal.

import type { AppState, User, Asset, Transaction } from '../../types';
import { annualSalaryToMonthly } from '../../utils/salary';

/** Fiche de paie — valeurs ANNUELLES (Claude multiplie période × fréquence). */
export interface PayslipPayload {
    kind: 'payslip';
    userIndex?: 0 | 1;
    userName?: string;
    grossAnnual?: number;
    netAnnual?: number;
    rrspContributedAnnual?: number;
}

/** Relevé bancaire — transactions à ajouter (dédup automatique). */
export interface BankTransaction {
    date: string;
    payee: string;
    amount: number;
    category?: string;
    isTransfer?: boolean;
}
export interface BankStatementPayload {
    kind: 'bank_statement';
    accountName?: string;
    transactions: BankTransaction[];
}

/** Relevé de courtage — positions (snapshot de quantités/prix). */
export interface BrokerHolding {
    symbol: string;
    quantity: number;
    currentPrice?: number;
    name?: string;
    currency?: 'USD' | 'CAD' | 'EUR';
}
export interface BrokerStatementPayload {
    kind: 'broker_statement';
    accountType?: Asset['accountType'];
    holdings: BrokerHolding[];
}

/** Feuillet fiscal (T4 / RL-1…) — revenu d'emploi annuel + cotisations. */
export interface TaxSlipPayload {
    kind: 'tax_slip';
    userIndex?: 0 | 1;
    userName?: string;
    slipType?: string;
    employmentIncomeAnnual?: number;
    rrspContributedAnnual?: number;
}

export type DocumentPayload =
    | PayslipPayload
    | BankStatementPayload
    | BrokerStatementPayload
    | TaxSlipPayload;

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

export function applyDocument(state: AppState, doc: DocumentPayload): ApplyResult {
    switch (doc.kind) {
        case 'payslip': return applyPayslip(state, doc);
        case 'bank_statement': return applyBankStatement(state, doc);
        case 'broker_statement': return applyBrokerStatement(state, doc);
        case 'tax_slip': return applyTaxSlip(state, doc);
        default: {
            const k = (doc as { kind?: string }).kind ?? 'inconnu';
            throw new Error(`Type de document non supporté : « ${k} ».`);
        }
    }
}

/** Résout l'index d'utilisateur ciblé (par index, sinon par nom, sinon 0). */
function resolveUserIndex(state: AppState, doc: { userIndex?: 0 | 1; userName?: string }): number {
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
const MAX_ANNUAL_INCOME = 50_000_000;   // 50 M$/an : couvre tout revenu personnel réaliste
const MAX_ANNUAL_RRSP = 1_000_000;      // 1 M$/an de cotisation REER
const MAX_TXN_AMOUNT = 100_000_000;     // 100 M$ pour une seule transaction
const MAX_QUANTITY = 100_000_000;       // 100 M d'unités d'un même titre
const MAX_PRICE = 10_000_000;           // 10 M$ par unité
const plausible = (v: number, max: number): boolean => Number.isFinite(v) && Math.abs(v) <= max;

// ── Fiche de paie ────────────────────────────────────────────────────────────
function applyPayslip(state: AppState, doc: PayslipPayload): ApplyResult {
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

    users[idx] = u;
    const nextState: AppState = { ...state, config: { ...state.config, users: users as AppState['config']['users'] }, lastUpdate: Date.now() };
    const who = u.name?.trim() || `utilisateur ${idx + 1}`;
    const rej = rejected.length ? ` (${rejected.length} valeur(s) aberrante(s) ignorée(s) : ${rejected.join(', ')})` : '';
    const summary = (changes.length
        ? `Fiche de paie appliquée à ${who} : ${changes.length} champ(s) mis à jour.`
        : `Fiche de paie pour ${who} : aucune modification (valeurs déjà à jour).`) + rej;
    return { nextState, changes, summary };
}

// ── Feuillet fiscal (T4 / RL-1) ──────────────────────────────────────────────
function applyTaxSlip(state: AppState, doc: TaxSlipPayload): ApplyResult {
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

// ── Relevé bancaire (transactions + dédup) ───────────────────────────────────
const txnKey = (t: { date: string; amount: number; payee: string }): string =>
    `${t.date}|${Math.round((t.amount || 0) * 100)}|${String(t.payee || '').trim().toLowerCase()}`;

function applyBankStatement(state: AppState, doc: BankStatementPayload): ApplyResult {
    const existing = (state.transactions ?? []) as Transaction[];
    const seen = new Set(existing.map(txnKey));
    let maxId = existing.reduce((m, t) => Math.max(m, t.id || 0), 0);

    const added: Transaction[] = [];
    let dupCount = 0;
    let rejCount = 0;
    for (const tx of doc.transactions ?? []) {
        if (!tx || typeof tx.amount !== 'number' || !tx.date) continue;
        if (!plausible(tx.amount, MAX_TXN_AMOUNT)) { rejCount++; continue; } // D9 : montant aberrant ignoré
        const k = txnKey(tx);
        if (seen.has(k)) { dupCount++; continue; } // doublon (déjà présent OU déjà ajouté dans ce lot)
        seen.add(k);
        added.push({
            id: ++maxId,
            date: tx.date,
            payee: tx.payee || '',
            amount: tx.amount,
            category: tx.category || 'Non catégorisé',
            status: 'processed',
            isTransfer: !!tx.isTransfer,
            ...(doc.accountName ? { accountName: doc.accountName } : {}),
        });
    }

    const changes: Change[] = [];
    if (added.length) {
        changes.push({
            field: 'transactions',
            before: existing.length,
            after: existing.length + added.length,
            note: `+${added.length} ajoutée(s)${dupCount ? `, ${dupCount} doublon(s) ignoré(s)` : ''}`,
        });
    }
    const nextState: AppState = added.length
        ? { ...state, transactions: [...existing, ...added], lastUpdate: Date.now() }
        : state;
    const rej = rejCount ? `, ${rejCount} montant(s) aberrant(s) ignoré(s)` : '';
    const summary = added.length
        ? `Relevé bancaire : ${added.length} transaction(s) ajoutée(s)${dupCount ? `, ${dupCount} doublon(s) ignoré(s)` : ''}${rej}.`
        : `Relevé bancaire : aucune nouvelle transaction${dupCount || rejCount ? ` (${dupCount} doublon(s) ignoré(s)${rej})` : ''}.`;
    return { nextState, changes, summary };
}

// ── Relevé de courtage (positions → assets) ──────────────────────────────────
function applyBrokerStatement(state: AppState, doc: BrokerStatementPayload): ApplyResult {
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
