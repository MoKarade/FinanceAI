// mcp/ingest/applyDocument.ts
//
// Lot 2 — FUSION PURE d'un document analysé dans l'AppState. Claude (Desktop) lit la pièce jointe et
// en extrait les valeurs ; ce module ne fait QUE la fusion sûre (aucun réseau, aucune clé API).
// Fonction pure (state, doc) → { nextState, changes, summary }. Réutilisée telle quelle par la couche
// Drive. Quatre types : fiche de paie, relevé bancaire, relevé de courtage, feuillet fiscal.

import type { AppState, User, Asset, Transaction, Debt } from '../../types';
import { annualSalaryToMonthly } from '../../utils/salary';
import { ruleCategorize } from '../../services/import/categoryRules';

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

export interface DebtPayload {
    kind: 'debt';
    /** Nom de la dette (ex. « Prêt auto Honda Civic »). Sert AUSSI de clé de dédup/mise à jour. */
    name: string;
    /** Solde ACTUELLEMENT dû ($). Requis pour un AJOUT ; optionnel en mise à jour PARTIELLE
     *  (ne jamais forcer l'IA à ré-inventer un chiffre qu'elle n'a pas — finding panel 2026-07-15). */
    balance?: number;
    /** Taux d'intérêt annuel (%). Requis pour un AJOUT ; optionnel en mise à jour. */
    interestRate?: number;
    /** Paiement mensuel (minimum ou régulier). Requis pour un AJOUT ; optionnel en mise à jour. */
    minimumPayment?: number;
    /** Catégorie ; absente → inférée du nom (auto/étude/carte), sinon Personal. */
    category?: Debt['category'];
    amortizationYears?: number;
    rateProvider?: string;
}

export type DocumentPayload =
    | PayslipPayload
    | BankStatementPayload
    | BrokerStatementPayload
    | TaxSlipPayload
    | DebtPayload;

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
        case 'debt': return applyDebt(state, doc);
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
const MAX_DEBT_BALANCE = 50_000_000;    // 50 M$ de solde de dette personnelle
const MAX_MONTHLY_PAYMENT = 1_000_000;  // 1 M$/mois de paiement
const MAX_INTEREST_RATE = 100;          // 100 %/an (au-delà = aberrant/injection)
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
            // [TX-CATEGORY-RULES] Catégorie fournie par l'appelant si présente, sinon règles
            // déterministes sur le payee (mêmes règles que l'import CSV de l'app — cohérence
            // app↔MCP), sinon « Non catégorisé » (l'IA de l'app peut re-passer dessus).
            category: tx.category || ruleCategorize(tx.payee || '') || 'Non catégorisé',
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

// ── Dette (prêt auto, carte, perso…) — ajout OU mise à jour par nom ──────────
// ⚠️ Sémantique moteur : les dettes n'ont PAS de date de début (servies dès le MOIS 0 de la
// projection, cf CLAUDE.md § dettes datées). Ce kind est donc réservé aux dettes DÉJÀ CONTRACTÉES
// (l'achat a eu lieu, le solde est réel). Un achat FUTUR/hypothétique doit passer par
// `simulate_what_if` (qui modélise l'événement daté) — la description du tool le dit à Claude.

/** Clé de dédup/mise à jour : nom normalisé (le retry d'un même ajout ne duplique pas). */
const debtKey = (name: string): string => String(name || '').trim().toLowerCase();

/** Catégorie inférée du nom quand absente (auto/études/carte → sinon Personal).
 *  Accents strippés une fois (« véhicule » matche `vehic`) ; les mots COURTS sont ancrés `\b…\b` —
 *  faux positifs prouvés par le panel 2026-07-15 : « Chargex »/« recharge » matchaient `char` nu. */
function inferDebtCategory(name: string): Debt['category'] {
    const n = name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    if (/auto|voiture|vehic|camion|\bchar\b|\bcar\b|\bmoto\b/.test(n)) return 'Car';
    if (/etud|student|scolaire/.test(n)) return 'Student';
    if (/carte|\bcard\b|visa|mastercard|amex/.test(n)) return 'CreditCard';
    return 'Personal';
}

function applyDebt(state: AppState, doc: DebtPayload): ApplyResult {
    const name = String(doc.name || '').trim();
    if (!name) throw new Error('Nom de dette requis (ex. « Prêt auto Honda »).');

    // Bornes de plausibilité (D9) — le contenu vient de l'IA : toute valeur FOURNIE aberrante/non
    // finie est REJETÉE en bloc (pas d'écriture partielle d'une dette corrompue). Les 3 champs $
    // sont optionnels (mise à jour PARTIELLE d'une dette existante — jamais forcer l'IA à inventer
    // un chiffre) mais « si fourni, alors valide ». Ceinture : le schéma Zod du tool a déjà
    // .finite(), mais un appel direct du handler bypasse Zod (leçon MCP-WHATIF).
    if (doc.balance != null && (!plausible(doc.balance, MAX_DEBT_BALANCE) || doc.balance <= 0)) {
        throw new Error(`Solde de dette invalide/aberrant (${doc.balance}). Rien n'a été écrit.`);
    }
    if (doc.interestRate != null && (!plausible(doc.interestRate, MAX_INTEREST_RATE) || doc.interestRate < 0)) {
        throw new Error(`Taux d'intérêt invalide/aberrant (${doc.interestRate} %). Rien n'a été écrit.`);
    }
    if (doc.minimumPayment != null && (!plausible(doc.minimumPayment, MAX_MONTHLY_PAYMENT) || doc.minimumPayment < 0)) {
        throw new Error(`Paiement mensuel invalide/aberrant (${doc.minimumPayment}). Rien n'a été écrit.`);
    }
    if (doc.amortizationYears != null && (!Number.isFinite(doc.amortizationYears) || doc.amortizationYears <= 0 || doc.amortizationYears > 50)) {
        throw new Error(`Amortissement invalide (${doc.amortizationYears} ans). Rien n'a été écrit.`);
    }

    const debts = (state.debts ?? []).map((d) => ({ ...d })) as Debt[];
    const changes: Change[] = [];
    const category = doc.category ?? inferDebtCategory(name);

    const existingIdx = debts.findIndex((d) => debtKey(d.name) === debtKey(name));
    if (existingIdx >= 0) {
        // MISE À JOUR par nom (idempotent : re-soumettre la même dette ne crée pas de doublon).
        // Un champ ABSENT est laissé intact (mise à jour partielle) — et donc jamais EFFAÇABLE via
        // ce tool une fois posé (choix assumé, style additif : effacer = geste UI DebtManager).
        const d = debts[existingIdx];
        const apply = (field: keyof Debt, after: unknown): void => {
            const before = d[field];
            if (before === after || after == null) return;
            changes.push({ field: `debts[${existingIdx}].${String(field)}`, before, after });
            (d as unknown as Record<string, unknown>)[String(field)] = after;
        };
        apply('balance', doc.balance);
        apply('interestRate', doc.interestRate);
        apply('minimumPayment', doc.minimumPayment);
        if (doc.category) apply('category', doc.category);
        apply('amortizationYears', doc.amortizationYears);
        apply('rateProvider', doc.rateProvider);
        const nextState: AppState = { ...state, debts, lastUpdate: Date.now() };
        const summary = changes.length
            ? `Dette « ${d.name} » mise à jour : ${changes.length} champ(s).`
            : `Dette « ${d.name} » : aucune modification (valeurs déjà à jour).`;
        return { nextState, changes, summary };
    }

    // AJOUT : les 3 champs financiers redeviennent REQUIS (pas de dette incomplète — l'optionnel
    // ne vaut que pour la mise à jour partielle d'une dette existante).
    const { balance, interestRate, minimumPayment } = doc;
    if (balance == null || interestRate == null || minimumPayment == null) {
        throw new Error(`Dette « ${name} » introuvable : pour l'AJOUTER, balance + interestRate + ` +
            `minimumPayment sont tous requis (l'omission n'est permise qu'en mise à jour d'une dette existante). Rien n'a été écrit.`);
    }
    const newDebt: Debt = {
        // Suffixe aléatoire anti-collision même-milliseconde ; le préfixe debt_ distingue de la
        // convention DebtManager (Date.now().toString()) → aucun chevauchement entre les 2 sources.
        id: `debt_${Date.now()}_${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`,
        name,
        balance,
        interestRate,
        minimumPayment,
        category,
        ...(doc.amortizationYears != null ? { amortizationYears: doc.amortizationYears } : {}),
        ...(doc.rateProvider ? { rateProvider: doc.rateProvider } : {}),
    };
    debts.push(newDebt);
    changes.push({
        field: `debts[+${debts.length - 1}]`,
        before: null,
        after: { name, balance, interestRate, minimumPayment, category },
        note: doc.category ? undefined : `catégorie inférée du nom : ${category}`,
    });
    const nextState: AppState = { ...state, debts, lastUpdate: Date.now() };
    const summary = `Dette « ${name} » ajoutée (${category}) : solde ${balance} $, ${interestRate} %, ` +
        `paiement ${minimumPayment} $/mois. Servie dès maintenant par la projection.`;
    return { nextState, changes, summary };
}
