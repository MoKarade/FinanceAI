// mcp/ingest/applyDocument.ts
//
// Lot 2 — FUSION PURE d'un document analysé dans l'AppState. Claude (Desktop) lit la pièce jointe et
// en extrait les valeurs ; ce module ne fait QUE la fusion sûre (aucun réseau, aucune clé API).
// Fonction pure (state, doc) → { nextState, changes, summary }. Réutilisée telle quelle par la couche
// Drive. Quatre types : fiche de paie, relevé bancaire, relevé de courtage, feuillet fiscal.

import { DEBT_KINDS } from '../../types';
import type { AppState, User, Asset, Transaction, Debt, DebtKind } from '../../types';
import { isValidIsoDate } from '../../utils/isoDate';
import { annualSalaryToMonthly } from '../../utils/salary';
import { RULE_CATEGORIES, buildCategoryCanonicalMap, resolveCandidateCategory } from '../../services/import/categoryRules';
import { computeCashLedgerDetailed } from '../../services/startingCash';
import { monthlyTargetOf } from '../../utils/healthRatios';
import { matchCategoryToName } from '../../utils/budget';

/** Fiche de paie — valeurs ANNUELLES (Claude multiplie période × fréquence). */
export interface PayslipPayload {
    kind: 'payslip';
    userIndex?: 0 | 1;
    userName?: string;
    grossAnnual?: number;
    netAnnual?: number;
    rrspContributedAnnual?: number;
    /** [INCOME-PROVENANCE] Employeur/étiquette de la paie (affiché comme source du revenu). */
    employer?: string;
    /**
     * [AI-VISION-PAYSLIP-NOGATE] Provenance à estamper. Défaut `'mcp'` = comportement historique
     * (connecteur) → rétrocompat BIT-IDENTIQUE pour le serveur MCP. L'upload in-app (Réglages)
     * passe `'payslip'` pour que le bandeau de l'onglet Impôt ne dise pas « via le connecteur
     * Claude » sur un fichier déposé à la main. Champ NON exposé dans l'inputSchema du tool :
     * le modèle ne peut pas le choisir, seule l'app le fixe.
     */
    sourceKind?: 'payslip' | 'mcp';
}

/** Relevé bancaire — transactions à ajouter (dédup automatique). */
export interface BankTransaction {
    date: string;
    payee: string;
    amount: number;
    category?: string;
    isTransfer?: boolean;
    /**
     * [TX-TRANSFERS] Compte porteur de CETTE transaction. Prioritaire sur le `accountName` du
     * document (qui reste le défaut quand un relevé ne couvre qu'un seul compte). C'est la seule
     * information qui permet à l'appariement des virements internes de PROUVER « deux poches
     * différentes » : sans elle, une paire de montants opposés reste une simple suggestion.
     */
    accountName?: string;
    /**
     * [FINTABLE-RATTRAPAGE] Doublon DÉJÀ identifié par l'appelant — la transaction est écrite mais
     * NEUTRALISÉE (hors courbe, hors budget), et reste rétablissable d'un clic.
     *
     * ⚠️ CE CHAMP MANQUAIT, et son absence rendait tout un lot inopérant. `applyBankStatement`
     * reconstruit chaque transaction CHAMP PAR CHAMP : un drapeau posé en amont et non déclaré ici
     * est silencieusement jeté. Le classement du rattrapage marquait donc ses doublons… pour rien,
     * et les transactions à libellé différent (donc à clé différente) étaient écrites comme de
     * VRAIES dépenses — double comptage dans le budget. Mesuré par l'audit de la PR #649.
     * La leçon générale est déjà au dossier (`GARDE-AU-PRODUCTEUR-NE-PROUVE-PAS-LA-CHAINE`) : la
     * garde doit viser ce qui ATTEINT le store, jamais la sortie du producteur.
     */
    isDuplicate?: boolean;
}
export interface BankStatementPayload {
    kind: 'bank_statement';
    accountName?: string;
    transactions: BankTransaction[];
    /**
     * [FINTABLE-RATTRAPAGE] L'appelant a DÉJÀ tranché les doublons — ne pas re-filtrer par clé.
     *
     * ⚠️ DEUX DÉDUPS QUI SE CONTREDISENT, mesuré par l'audit de la PR #649. La dédup par CLÉ
     * (`txnKey` = date|montant|payee) écarte tout ce qui lui ressemble, y compris deux dépenses
     * RÉELLES et identiques du même jour (deux cafés à 4,25 $) — un compromis acceptable sur un
     * relevé ponctuel. Le rattrapage, lui, classe explicitement avec un invariant d'APPARIEMENT
     * UNIQUE : une transaction existante ne peut absorber qu'une entrante. Laisser la clé s'appliquer
     * par-dessus annulait cet invariant et FAISAIT DISPARAÎTRE les vraies dépenses surnuméraires
     * (mesuré : 3 cafés → 1 écrit).
     *
     * Quand ce drapeau est vrai, la clé ne DROPPE plus : le classement de l'appelant fait autorité,
     * et ce qu'il a marqué `isDuplicate` est écrit puis neutralisé — donc VISIBLE et rétablissable,
     * au lieu de disparaître sans trace.
     * ⚠️ Défaut absent/false ⇒ tous les autres appelants (import CSV, relevé PDF, MCP, sync
     * ordinaire) sont INCHANGÉS. La clé reste leur garde-fou.
     */
    callerClassified?: boolean;
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
    /** [DEBT-MCP-PARITE] Type précis (mortgage/auto-lease/heloc/carte…) — câblé dans le moteur
     *  (`Debt.kind: DebtKind`) et l'UI DebtManager depuis W5.3, mais absent d'ici jusqu'ici.
     *  ⚠️ Nommé `debtKind` et NON `kind` : ce champ `DebtPayload.kind` porte déjà le discriminant
     *  `'debt'` utilisé par le switch de routage d'`applyDocument` — un deuxième `kind` de même nom
     *  l'aurait ÉCRASÉ à la construction du payload (`{ kind: 'debt', ...args }`), cassant le
     *  routage de TOUS les documents, pas seulement les dettes. */
    debtKind?: DebtKind;
    /** [DEBT-MCP-PARITE] Début du prêt/bail (YYYY-MM-DD) — câblé dans le moteur depuis
     *  `[DETTE-DATES]` (2026-08-19) et l'UI DebtManager, mais absent d'ici jusqu'ici. Absent ⇒ la
     *  dette a toujours couru (comportement historique, inchangé). */
    startDate?: string;
    /** [DEBT-MCP-PARITE] Fin du terme (YYYY-MM-DD), même sémantique que `startDate`. */
    termEndDate?: string;
}

/** [MCP-DIRECT-EDIT] Ajustement DIRECT du solde de liquidités (cash) à une cible. Le cash n'est PAS un
 *  champ brut : il est DÉRIVÉ (`computeStartingCash` = Σ initialBalances + Σ transactions non-dup/transfert).
 *  On applique donc un DELTA sur `initialBalances.LIQUIDITE` (compte visible dans Réglages → Comptes) pour
 *  que le cash calculé atteigne la cible — idempotent, jamais d'écrasement de la map entière. */
export interface CashBalancePayload {
    kind: 'cash_balance';
    /** Nouveau solde de liquidités TOTAL visé ($ CAD). */
    targetCad: number;
}

/** [MCP-DIRECT-EDIT Lot 2] Poste de budget — ajout OU mise à jour PARTIELLE par nom.
 *  ⚠️ Une édition de `targetCad` pose `autoTarget: false` (règle BUDGET-TX-CATEGORIES : une édition
 *  MANUELLE de la cible décroche la cible auto-gérée — sinon la moyenne du passé écraserait la
 *  demande de l'utilisateur au prochain chargement). */
export interface BudgetItemPayload {
    kind: 'budget_item';
    /** Nom du poste (clé d'upsert, normalisée casse/accents contre les postes existants). */
    name: string;
    /** Cible en $ CAD (dans la fréquence du poste). Requise à l'AJOUT ; optionnelle en mise à jour. */
    targetCad?: number;
    frequency?: 'Monthly' | 'Yearly' | 'Weekly' | 'Quarterly';
    nature?: 'Besoin' | 'Envie' | 'Epargne';
    type?: 'Commun' | 'Perso 1' | 'Perso 2';
}

/** [MCP-DIRECT-EDIT Lots 4-5] Suppression d'une entité (cf ADR « Suppressions via MCP/IA ») :
 *  correspondance par nom/symbole normalisé EXACT (jamais de fuzzy sur un geste destructif),
 *  ambiguïté → erreur. « Vente totale » d'un titre = suppression (quantity:0 fausserait la courbe
 *  d'historique à vie — holdingsAt compte les purchases). Transactions : DIFFÉRÉ (cash dérivé). */
export interface DeleteItemPayload {
    kind: 'delete_item';
    entity: 'asset' | 'debt';
    /** Nom (dette) ou SYMBOLE (actif) de l'entité à supprimer. */
    name: string;
    /** Désambiguïsation d'un actif détenu dans PLUSIEURS comptes (CELI / REER / NON-ENREG…). */
    accountType?: string;
}

export type DocumentPayload =
    | PayslipPayload
    | BankStatementPayload
    | BrokerStatementPayload
    | TaxSlipPayload
    | DebtPayload
    | CashBalancePayload
    | BudgetItemPayload
    | DeleteItemPayload;

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
    /** [MCP-REJECTIONS-NON-STRUCTUREES] Nombre de lignes REJETÉES pour une raison de qualité de
     *  donnée (montant aberrant, date invalide, ligne incomplète) — PAS les doublons. `summary`
     *  reste la seule source pour un lecteur LLM (`_writeHelper.ts`/`writeExecutor.ts` le lisent en
     *  entier), mais un appelant AUTOMATISÉ (`applyPayloadsIsolated`, qui ne lit jamais `summary`)
     *  a besoin d'un compteur structuré pour ne pas rejeter des lignes en silence à chaque sync.
     *  ⚠️ [finding financial-integrity, MESURÉ] `dupCount` reste hors de ce compteur parce que
     *  l'inclure ferait une alarme quasi permanente (mesuré : un lot à recouvrement total, cas
     *  nominal d'une sync quotidienne, donne `dupCount = 30/30`) — PAS parce qu'un doublon serait
     *  toujours bénin. Sur le chemin automatisé (`syncCore.ts`), le recouvrement légitime est déjà
     *  écarté EN AMONT par la bascule anti-doublon (`deriveCutoverDate` : mesuré 0 collision sur 60
     *  jours balayés) et le rattrapage pose `callerClassified: true` (dédup par clé désactivée,
     *  `dupCount` toujours 0) — donc un `dupCount > 0` qui survit jusqu'ici désigne surtout une
     *  collision INTRA-lot (deux dépenses RÉELLES identiques le même jour, `seen` les fusionne),
     *  un cas différent qui mérite son propre signal, pas une inclusion dans `rejectedCount` — voir
     *  `dupIntraLotCount` ci-dessous, qui porte CE signal.
     *  Absent (`undefined`) pour les types de document qui n'ont pas de rejet ligne-par-ligne. */
    rejectedCount?: number;
    /** [FINTABLE-DOUBLON-INTRALOT-SILENCIEUX] Sous-ensemble SUSPECT des doublons d'un relevé
     *  bancaire : deux lignes DISTINCTES du même lot entrant partagent la même clé
     *  (date|montant|payee), contrairement à un doublon contre l'existant (recouvrement légitime,
     *  bénin). Signale le plus souvent deux dépenses RÉELLES identiques le même jour, écrites
     *  UNE seule fois — jamais inclus dans `rejectedCount` (nature différente : une collision de
     *  déduplication, pas une donnée invalide). Absent pour les documents sans notion de doublon. */
    dupIntraLotCount?: number;
}

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
const MAX_CASH_BALANCE = 100_000_000;   // 100 M$ de liquidités : au-delà = aberrant/injection
const plausible = (v: number, max: number): boolean => Number.isFinite(v) && Math.abs(v) <= max;

// ── Ajustement direct du solde de liquidités (cash) ─────────────────────────
// [MCP-DIRECT-EDIT] « Mets mes liquidités à X » : le cash est DÉRIVÉ (computeStartingCash = Σ initialBalances
// + Σ transactions non-dup/transfert, source unique) → on n'écrase PAS un champ, on ajoute un DELTA sur
// `initialBalances.LIQUIDITE` (compte VISIBLE dans Réglages → Comptes) pour que le cash calculé atteigne la
// cible. Idempotent (2ᵉ appel même cible = 0 changement). Sauvegarde horodatée créée avant l'écriture (runApply).
function applyCashBalance(state: AppState, doc: CashBalancePayload): ApplyResult {
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
        return { nextState: state, changes: [], summary: `Solde de liquidités déjà à ${Math.round(target)} $ : aucune modification.` };
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
    const summary = `Solde de liquidités ajusté : ${Math.round(current)} $ → ${Math.round(target)} $ `
        + `(compte LIQUIDITE, visible dans Réglages → Comptes). Sauvegarde créée avant l'écriture.`;
    return { nextState, changes, summary };
}

// ── Poste de budget — ajout OU mise à jour PARTIELLE par nom ─────────────────
// [MCP-DIRECT-EDIT Lot 2] Clé d'upsert = nom normalisé (casse/accents) contre les postes existants.
// ⚠️ Éditer la CIBLE pose `autoTarget: false` (BUDGET-TX-CATEGORIES : une édition manuelle décroche
// la cible auto-gérée, sinon la moyenne du passé écraserait la demande au prochain chargement).

/** Clé d'upsert : nom trim + minuscules + accents strippés (même normalisation que categoryRules). */
const budgetNameKey = (name: string): string =>
    String(name || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

const MAX_BUDGET_TARGET = 1_000_000;    // 1 M$ par période pour un poste de budget (au-delà = aberrant)

function applyBudgetItem(state: AppState, doc: BudgetItemPayload): ApplyResult {
    const name = String(doc.name || '').trim();
    if (!name) throw new Error('Nom de poste de budget requis (ex. « Épicerie »).');
    if (doc.targetCad != null && (!plausible(doc.targetCad, MAX_BUDGET_TARGET) || doc.targetCad < 0)) {
        throw new Error('Cible de budget invalide ou aberrante (négative / non finie / hors bornes). Rien n\'a été écrit.');
    }
    // Garde ménage SOLO (leçon PH4E-OWNER-EDIT : tester le CONTENU, jamais la longueur du tuple
    // `users` qui vaut toujours 2) : « Perso 2 » sans 2ᵉ conjoint nommé disparaîtrait du breakdown
    // couple en silence → rejet honnête.
    if (doc.type === 'Perso 2' && !(state.config?.users?.[1]?.name ?? '').trim()) {
        throw new Error('Répartition « Perso 2 » impossible : aucun 2ᵉ conjoint configuré. Rien n\'a été écrit.');
    }

    const items = (state.budgetItems ?? []).map((b) => ({ ...b }));
    const changes: Change[] = [];
    const key = budgetNameKey(name);
    const idx = items.findIndex((b) => budgetNameKey(b.name) === key);

    // Doublons de noms équivalents (ex. « RESTAURANT » vs « Restaurant » importés d'un CSV) : le
    // premier est retenu — le signaler plutôt que de laisser croire à une mise à jour de l'autre.
    const twinCount = items.filter((b) => budgetNameKey(b.name) === key).length;
    const twinNote = twinCount > 1 ? ` ⚠️ ${twinCount} postes ont un nom équivalent — le premier a été retenu.` : '';
    // [HEALTH-RATIOS-NAN-ABSORBE-EN-AMONT] `monthlyTargetOf` PROPAGE désormais une cible illisible
    // en `NaN` au lieu de l'absorber en `0` (c'est tout l'objet du correctif). Les diffs ci-dessous
    // lisent `b.target`, la cible DÉJÀ en état, que rien n'a validée — contrairement à
    // `doc.targetCad`, passé par `plausible()`. Sans ce formateur, la note montrée à l'utilisateur
    // avant qu'il confirme une écriture dirait littéralement « passe de NaN $ à X $ » : ni un
    // « 0 $ » faussement crédible (proscrit par le no-fake-data) ni un « — » honnête, juste une
    // fuite technique (finding code-reviewer, 2e passe panel PR #757).
    const montantLabel = (n: unknown): string => (Number.isFinite(n) ? `${Math.round(n as number)} $` : '— (cible non exploitable)');
    const monthlyTargetLabel = (item: Parameters<typeof monthlyTargetOf>[0]): string => montantLabel(monthlyTargetOf(item));


    if (idx >= 0) {
        const b = items[idx];
        if (doc.targetCad != null && doc.targetCad !== b.target) {
            const freq = doc.frequency ?? b.frequency;
            changes.push({
                field: `poste « ${b.name} » (cible)`, before: b.target,
                after: `${doc.targetCad} $ / ${freq} (≈ ${monthlyTargetLabel({ target: doc.targetCad, frequency: freq })}/mois)`,
                note: (b.autoTarget ? 'cible auto-gérée décrochée (édition manuelle)' : undefined),
            });
            b.target = doc.targetCad;
            b.autoTarget = false; // édition manuelle = décrochage de la cible auto (BUDGET-TX-CATEGORIES)
        }
        if (doc.frequency && doc.frequency !== b.frequency) {
            // ⚠️ Même DÉCROCHAGE que l'UI (Budget.tsx : target OU frequency) — finding ÉLEVÉ panel :
            // sans lui, le refresh auto réécrit une moyenne MENSUELLE dans un poste devenu Yearly
            // (cible mensuelle effective ÷12, +épargne fabriquée dans toute la projection).
            changes.push({
                field: `poste « ${b.name} » (fréquence)`, before: b.frequency, after: doc.frequency,
                note: `la cible mensuelle effective passe de ${monthlyTargetLabel(b)} à `
                    + `${monthlyTargetLabel({ target: b.target, frequency: doc.frequency })} (cible inchangée : ${montantLabel(b.target)})`,
            });
            b.frequency = doc.frequency;
            b.autoTarget = false;
        }
        if (doc.nature && doc.nature !== b.nature) {
            changes.push({ field: `poste « ${b.name} » (nature)`, before: b.nature, after: doc.nature });
            b.nature = doc.nature;
        }
        if (doc.type && doc.type !== b.type) {
            changes.push({ field: `poste « ${b.name} » (répartition)`, before: b.type, after: doc.type });
            b.type = doc.type;
        }
        if (changes.length === 0) {
            return { nextState: state, changes: [], summary: `Poste « ${b.name} » : aucune modification (valeurs identiques).${twinNote}` };
        }
        const nextState: AppState = { ...state, budgetItems: items, lastUpdate: Date.now() };
        return { nextState, changes, summary: `Poste de budget « ${b.name} » mis à jour (${changes.length} champ(s)).${twinNote}` };
    }

    // AJOUT : la cible est requise (jamais inventer un montant pour l'utilisateur).
    if (doc.targetCad == null) {
        throw new Error(`Poste « ${name} » introuvable : pour l'AJOUTER, la cible (targetCad) est requise.`);
    }
    const added = {
        id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, // horodaté (convention PERSONA-PURGE)
        name,
        target: doc.targetCad,
        frequency: doc.frequency ?? 'Monthly' as const,
        type: doc.type ?? 'Commun' as const,
        nature: doc.nature ?? 'Besoin' as const,
        autoTarget: false, // cible posée explicitement par l'utilisateur — pas auto-gérée
    };
    items.push(added);
    // [Finding ÉLEVÉ panel] Le sync budget (Lot C : postes ≡ catégories OBSERVÉES) RETIRE au prochain
    // chargement tout poste dont le nom ne rapproche aucune catégorie de transactions (même règle
    // fuzzy que budgetSync : `matchCategoryToName` cat→nom). Prévenir AVANT plutôt que laisser le
    // poste s'évaporer en silence après un « ajouté ✓ ».
    const observedCats = Array.from(new Set(
        (state.transactions ?? []).map((t) => (t.category || '').trim()).filter(Boolean),
    ));
    const matchesObserved = observedCats.some((cat) => matchCategoryToName(cat, [name]) !== undefined);
    const orphanNote = matchesObserved
        ? undefined
        : `⚠️ aucune transaction de catégorie « ${name} » : le poste sera RETIRÉ au prochain chargement de l'app tant qu'aucune dépense ne s'y rattache (le budget suit les catégories observées).`;
    changes.push({
        field: `poste « ${name} »`, before: null,
        after: `${added.target} $ / ${added.frequency} (≈ ${monthlyTargetLabel(added)}/mois)`,
        note: orphanNote ?? 'nouveau poste — rapproché des dépenses réelles de la catégorie du même nom (un nom proche peut être auto-renommé vers la catégorie observée)',
    });
    const nextState: AppState = { ...state, budgetItems: items, lastUpdate: Date.now() };
    return {
        nextState, changes,
        summary: `Poste de budget « ${name} » ajouté (${added.target} $ / ${added.frequency}, ${added.nature}, ${added.type}).`
            + (orphanNote ? ` ${orphanNote}` : ''),
    };
}

// ── Suppression d'entité (actif / dette) — ADR Lots 4-5 ──────────────────────
// Correspondance NORMALISÉE EXACTE (casse/accents — jamais de fuzzy sur un geste destructif) ;
// ambiguïté (2 noms équivalents, même symbole dans 2 comptes sans précision) → throw, pas de choix
// silencieux. L'aperçu LISTE ce qui disparaît + les effets dérivés (NW, courbe, décaissement).

// [Finding panel — classe AI-PROMPT-FAKE-ZERO] Un montant NON FINI (état corrompu) affiché « 0 $ »
// dans l'aperçu d'une SUPPRESSION ferait confirmer l'utilisateur sur une donnée fabriquée → frontière
// de formatage honnête : « (non disponible) », jamais un 0 plausible.
const fmtOrUnavailable = (v: unknown): string =>
    Number.isFinite(Number(v)) ? String(Math.round(Number(v))) : '(non disponible)';

function applyDeleteItem(state: AppState, doc: DeleteItemPayload): ApplyResult {
    const name = String(doc.name || '').trim();
    if (!name) throw new Error('Nom/symbole requis pour une suppression.');
    const key = budgetNameKey(name);

    if (doc.entity === 'asset') {
        const all = (state.assets ?? []);
        let matches = all.filter((a) => budgetNameKey(a.symbol || '') === key);
        if (matches.length === 0) throw new Error(`Aucun actif au symbole « ${name} » dans le portefeuille. Rien n'a été supprimé.`);
        if (matches.length > 1 && doc.accountType) {
            const inAccount = matches.filter((a) => (a.accountType || '') === doc.accountType);
            // [Finding panel] Distinguer « ta précision est INVALIDE » de « précise » — sinon un agent
            // boucle en renvoyant le même accountType fautif en croyant devoir juste « préciser ».
            if (inAccount.length === 0) {
                const accounts = matches.map((a) => a.accountType || '(sans compte)').join(', ');
                throw new Error(`Aucun actif « ${name} » dans le compte « ${doc.accountType} » — ce symbole est détenu dans : ${accounts}. Rien n'a été supprimé.`);
            }
            matches = inAccount;
        }
        if (matches.length !== 1) {
            throw new Error(`Plusieurs actifs portent le symbole « ${name} » (comptes différents) : précise le compte (accountType, ex. CELI / REER / NON-ENREG). Rien n'a été supprimé.`);
        }
        const target = matches[0];
        const changes: Change[] = [{
            field: `actif ${target.symbol}${target.accountType ? ` (${target.accountType})` : ''}`,
            before: `${target.quantity} × ${fmtOrUnavailable(target.currentPrice)} ${target.currency || 'CAD'}`,
            after: 'supprimé',
            note: '⚠️ la courbe d\'historique du portefeuille perd AUSSI sa contribution passée (pas de registre de ventes) ; le produit d\'une vente réelle doit arriver par tes transactions bancaires (import relevé)',
        }];
        const nextState: AppState = { ...state, assets: all.filter((a) => a !== target), lastUpdate: Date.now() };
        return { nextState, changes, summary: `Actif ${target.symbol} supprimé du portefeuille. Sauvegarde créée avant l'écriture (annulable via Réglages → Sauvegarde).` };
    }

    // ⚠️ [NAV-REMOVE-OBJECTIFS-TAB] Ceinture métier — un appel DIRECT du handler contourne Zod
    // (même patron que `applyCashBalance`/`applyBudgetItem` dans ce fichier). Avant le retrait des
    // objectifs, une valeur d'`entity` inattendue retombait sur `savingsGoals` ; elle retomberait
    // désormais sur les DETTES — un geste destructif au rayon d'impact bien supérieur. On refuse
    // explicitement au lieu de deviner.
    if (doc.entity !== 'debt') {
        throw new Error(`Type d'entité non supporté pour une suppression : « ${String(doc.entity)} ». Attendu : asset ou debt. Rien n'a été supprimé.`);
    }
    const all = (state.debts ?? []);
    const matches = all.filter((d) => budgetNameKey(d.name || '') === key);
    if (matches.length === 0) throw new Error(`Aucune dette nommée « ${name} ». Rien n'a été supprimé.`);
    if (matches.length > 1) throw new Error(`Plusieurs dettes portent un nom équivalent à « ${name} » : renomme-les d'abord (noms distinctifs). Rien n'a été supprimé.`);
    const target = matches[0];
    const changes: Change[] = [{
        field: `dette « ${target.name} »`,
        before: `${fmtOrUnavailable(target.balance)} $ à ${target.interestRate} %`,
        after: 'supprimée',
        note: '⚠️ le patrimoine net MONTE du solde supprimé — réservé à une dette réellement soldée ou saisie par erreur',
    }];
    const nextState: AppState = { ...state, debts: all.filter((d) => d !== target), lastUpdate: Date.now() };
    return { nextState, changes, summary: `Dette « ${target.name} » supprimée. Sauvegarde créée avant l'écriture (annulable via Réglages → Sauvegarde).` };
}

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

/**
 * [MCP-CATEGORY-ALLOWLIST] Jeu canonique des catégories acceptées à l'ÉCRITURE : les postes de
 * budget EXISTANTS + les catégories des règles (`RULE_CATEGORIES`). La catégorie du tool MCP est
 * du TEXTE LIBRE écrit par l'IA : hors allowlist, elle entrerait dans le rapprochement fuzzy
 * partagé (réel/moyenne/grand livre) et pourrait être absorbée par un poste au nom englobant
 * (« Sport » ⊂ « Tran-sport ») SANS trace (finding silent-failure-hunter PR #501). Inconnue →
 * règles déterministes sur le payee, sinon « Non catégorisé » — et le résumé le DIT.
 * Postes APRÈS RULE_CATEGORIES : en cas de collision de clé normalisée (poste « épicerie » vs
 * canonique « Épicerie »), le POSTE gagne — c'est la cible réelle de réconciliation du Budget
 * (priorité documentée + testée, finding code-reviewer PR #502).
 */
function buildCategoryAllowlist(state: AppState): Map<string, string> {
    return buildCategoryCanonicalMap([
        ...RULE_CATEGORIES,
        ...(state.budgetItems ?? []).map((item) => item?.name ?? ''),
    ]);
}

function applyBankStatement(state: AppState, doc: BankStatementPayload): ApplyResult {
    const existing = (state.transactions ?? []) as Transaction[];
    // [FINTABLE-DOUBLON-INTRALOT-SILENCIEUX] finding financial-integrity, MESURÉ : `seen` unique
    // confondait deux cas de nature différente — un doublon contre l'EXISTANT (bénin sur le chemin
    // automatisé, le recouvrement légitime est déjà écarté en amont par la bascule anti-doublon,
    // 0 collision mesurée sur 60 jours) et un doublon INTRA-LOT (deux lignes DISTINCTES du même lot
    // entrant qui partagent la même clé) — qui, lui, désigne le plus souvent deux dépenses RÉELLES
    // identiques le même jour (mesuré : 3 cafés à 4,25 $, 1 seul écrit, 8,50 $ perdus en silence,
    // `cashAnchorDelta` absorbe l'écart). Deux ensembles séparés pour pouvoir avertir sur le second
    // sans déclencher une alarme permanente sur le premier.
    const existingKeys = new Set(existing.map(txnKey));
    const seenThisLot = new Set<string>();
    let maxId = existing.reduce((m, t) => Math.max(m, t.id || 0), 0);
    const allowedCategories = buildCategoryAllowlist(state);

    const added: Transaction[] = [];
    let dupCount = 0; // TOTAL (existant + intra-lot) — préserve le libellé `dupPhrase` existant
    let dupIntraLotCount = 0; // sous-ensemble SUSPECT de dupCount, voir commentaire ci-dessus
    let rejCount = 0; // montant aberrant (D9)
    // [BUDGET-TRANSACTIONS-SYNC-AUDIT] Compteur SÉPARÉ de `rejCount` : les deux causes de rejet ne
    // sont pas la même information pour l'appelant (un montant aberrant n'est pas une date invalide),
    // et les fusionner sous « aberrant » rendrait le résumé FAUX sur un rejet de date.
    let rejDateCount = 0;
    // [BUDGET-TRANSACTIONS-SYNC-AUDIT] finding silent-failure-hunter (ÉLEVÉ) : cette garde filtrait
    // trois cas (ligne absente, montant non numérique, date absente) sans compter AUCUN d'eux — un
    // lot où TOUTES les lignes ont ce défaut rendait `added.length === 0` et un résumé littéralement
    // « aucune nouvelle transaction. », sans dire qu'il y avait N lignes soumises et rejetées.
    let rejMalformedCount = 0;
    let remapCount = 0;
    for (const tx of doc.transactions ?? []) {
        if (!tx || typeof tx.amount !== 'number' || !tx.date) { rejMalformedCount++; continue; }
        // [BUDGET-TRANSACTIONS-SYNC-AUDIT] Garde runtime symétrique à `applyBankStatement.spec.ts` —
        // un appel direct (hors passerelle MCP) contourne Zod, leçon MCP-WHATIF. Sans elle, une date
        // hors calendrier (`2026-02-30`) ou mal formée passait telle quelle jusqu'au grand livre.
        if (!isValidIsoDate(tx.date)) { rejDateCount++; continue; }
        if (!plausible(tx.amount, MAX_TXN_AMOUNT)) { rejCount++; continue; } // D9 : montant aberrant ignoré
        const k = txnKey(tx);
        // ⚠️ `callerClassified` : le rattrapage a déjà tranché, avec un invariant d'appariement
        // unique que cette clé annulerait en supprimant les dépenses réelles surnuméraires.
        if (!doc.callerClassified) {
            if (existingKeys.has(k)) { dupCount++; continue; } // déjà présent — bénin (recouvrement)
            if (seenThisLot.has(k)) { dupCount++; dupIntraLotCount++; continue; } // déjà ajouté CE LOT — suspect
        }
        seenThisLot.add(k);
        // [TX-CATEGORY-RULES] + [MCP-CATEGORY-ALLOWLIST] Catégorie fournie ACCEPTÉE seulement si
        // canonique (remap vers la casse canonique) ; inconnue ou absente → règles déterministes
        // sur le payee (mêmes règles que l'import CSV de l'app — cohérence app↔MCP), sinon
        // « Non catégorisé » (l'IA de l'app peut re-passer dessus). Un remap est COMPTÉ (résumé).
        const resolvedCat = resolveCandidateCategory(tx.category, allowedCategories, tx.payee || '', 'Non catégorisé');
        if (resolvedCat.remapped) remapCount++;
        added.push({
            id: ++maxId,
            date: tx.date,
            payee: tx.payee || '',
            amount: tx.amount,
            category: resolvedCat.category,
            status: 'processed',
            isTransfer: !!tx.isTransfer,
            // ⚠️ Propagé SEULEMENT s'il est vrai : ajouter `isDuplicate: false` partout changerait
            // la forme de toutes les transactions écrites par tous les autres appelants.
            ...(tx.isDuplicate ? { isDuplicate: true } : {}),
            // [TX-TRANSFERS] Le compte de la LIGNE prime sur celui du document : un lot Fintable
            // couvre plusieurs comptes, alors qu'un relevé PDF n'en couvre qu'un.
            ...(tx.accountName || doc.accountName
                ? { accountName: tx.accountName || doc.accountName }
                : {}),
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
    // [BUDGET-DUPCOUNT-MESSAGE-FAUX] finding code-reviewer : chaque segment est une PHRASE nue (sans
    // séparateur), jointe plus bas par `, ` — l'ancienne construction préfixait chaque segment par
    // `, ` littéral, ce qui laissait une virgule orpheline en tête dès que `dupCount === 0` mais un
    // AUTRE rejet existait (`(, 1 montant(s) aberrant(s) ignoré(s))`).
    const dupPhrase = dupCount ? `${dupCount} doublon(s) ignoré(s)` : '';
    // [FINTABLE-DOUBLON-INTRALOT-SILENCIEUX] Signal SÉPARÉ (pas fusionné dans `dupPhrase`) : un
    // doublon intra-lot est SUSPECT (deux lignes distinctes du même lot, probablement deux vraies
    // dépenses identiques) alors qu'un doublon contre l'existant est un recouvrement bénin — les
    // fusionner sous « doublon(s) ignoré(s) » masquerait le seul cas qui mérite d'être vérifié.
    const dupIntraLotPhrase = dupIntraLotCount
        ? `${dupIntraLotCount} doublon(s) SUSPECT(s) au sein du même lot (vérifier s'il s'agit de dépenses distinctes)`
        : '';
    const rejPhrase = rejCount ? `${rejCount} montant(s) aberrant(s) ignoré(s)` : '';
    // [BUDGET-TRANSACTIONS-SYNC-AUDIT] Message SÉPARÉ (pas fusionné dans `rejPhrase`) : une date
    // invalide n'est pas un montant aberrant, et un appelant qui lit « aberrant » sur un rejet de
    // date en tirerait la mauvaise conclusion (il vérifierait ses montants, jamais son format de date).
    const rejDatePhrase = rejDateCount ? `${rejDateCount} date(s) invalide(s) ignorée(s)` : '';
    // [BUDGET-TRANSACTIONS-SYNC-AUDIT] finding financial-integrity (FAIBLE) : la garde compte 3
    // causes (ligne absente, montant non numérique, date manquante) — libellé générique plutôt que
    // d'en nommer 2 sur 3 et laisser croire qu'une ligne `null`/non-objet a une « date manquante ».
    const rejMalformedPhrase = rejMalformedCount
        ? `${rejMalformedCount} ligne(s) invalide(s) ou incomplète(s) ignorée(s)`
        : '';
    // [MCP-CATEGORY-ALLOWLIST] Signal honnête : un remap silencieux serait la classe
    // « staleness/attribution silencieuse » — l'appelant doit savoir que ses catégories
    // inventées ont été re-catégorisées par les règles.
    const remapPhrase = remapCount
        ? `${remapCount} catégorie(s) non canonique(s) re-catégorisée(s) par les règles`
        : '';
    const rejectionPhrases = [dupPhrase, dupIntraLotPhrase, rejPhrase, rejDatePhrase, rejMalformedPhrase, remapPhrase].filter(Boolean);
    const summary = added.length
        ? `Relevé bancaire : ${added.length} transaction(s) ajoutée(s)${rejectionPhrases.length ? `, ${rejectionPhrases.join(', ')}` : ''}.`
        : `Relevé bancaire : aucune nouvelle transaction${rejectionPhrases.length ? ` (${rejectionPhrases.join(', ')})` : ''}.`;
    // [MCP-REJECTIONS-NON-STRUCTUREES] PAS `dupCount` — voir le JSDoc de `rejectedCount` sur
    // `ApplyResult` pour la raison MESURÉE (pas juste supposée bénigne).
    const rejectedCount = rejCount + rejDateCount + rejMalformedCount;
    return {
        nextState, changes, summary,
        ...(rejectedCount > 0 ? { rejectedCount } : {}),
        ...(dupIntraLotCount > 0 ? { dupIntraLotCount } : {}),
    };
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
// ⚠️ [DEBT-MCP-PARITE, 2026-08-21] Ce commentaire affirmait « les dettes n'ont PAS de date de
// début » — FAUX depuis `[DETTE-DATES]` (2026-08-19) : `Debt.startDate`/`termEndDate` existent et
// sont servis par le moteur (`debtSchedule.ts`). Ce tool reste réservé aux dettes DÉJÀ
// CONTRACTÉES (le solde fourni doit être réel AUJOURD'HUI) ; `startDate` sert à dater une dette
// contractée dans le PASSÉ (pour que le graphe Futur ne la montre pas avant son vrai début) ou
// SIGNÉE mais dont le premier paiement est encore à venir — pas à modéliser un achat hypothétique,
// qui reste le rôle de `simulate_what_if`.

/** Clé de dédup/mise à jour : nom normalisé (le retry d'un même ajout ne duplique pas). */
const debtKey = (name: string): string => String(name || '').trim().toLowerCase();

/** [DEBT-MCP-PARITE] Date complète exigée (contrairement à `GOAL_DEADLINE_RE` plus permissif) :
 *  une date de dette vient d'un document réel (contrat, relevé) ou d'une saisie DebtManager
 *  (`<input type="date">`), toujours au jour près — jamais un YYYY-MM approximatif. Validation
 *  CALENDAIRE (pas seulement le format) : `utils/isoDate.ts`, source unique partagée avec le
 *  schéma Zod du tool MCP (`applyDebt.spec.ts`) — voir sa doc pour le piège `2026-13-01`. */

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
    // [DEBT-MCP-PARITE] Même ceinture que balance/interestRate : `kind` est un ENUM Zod côté tool,
    // mais l'IMPORT PDF (`applyDebt` appelé directement, sans passer par le schéma Zod du tool MCP —
    // même leçon MCP-WHATIF que ci-dessus) peut fournir n'importe quelle chaîne. Un `kind` inconnu
    // est REJETÉ plutôt que silencieusement accepté (il pilote `debtAmortization`/l'allowlist à
    // venir — un kind halluciné y serait invisible, pas juste cosmétique).
    if (doc.debtKind != null && !DEBT_KINDS.includes(doc.debtKind)) {
        throw new Error(`Type de dette inconnu (${doc.debtKind}). Valeurs valides : ${DEBT_KINDS.join(', ')}. Rien n'a été écrit.`);
    }
    if (doc.startDate != null && !isValidIsoDate(doc.startDate)) {
        throw new Error(`Date de début invalide (${doc.startDate}), format attendu YYYY-MM-DD (date calendaire réelle). Rien n'a été écrit.`);
    }
    if (doc.termEndDate != null && !isValidIsoDate(doc.termEndDate)) {
        throw new Error(`Date de fin invalide (${doc.termEndDate}), format attendu YYYY-MM-DD (date calendaire réelle). Rien n'a été écrit.`);
    }

    const debts = (state.debts ?? []).map((d) => ({ ...d })) as Debt[];
    const changes: Change[] = [];
    const category = doc.category ?? inferDebtCategory(name);

    const existingIdx = debts.findIndex((d) => debtKey(d.name) === debtKey(name));
    // [DEBT-MCP-PARITE, ÉLEVÉ revue] La cohérence chronologique doit se vérifier sur les valeurs
    // EFFECTIVES (après fusion avec la dette déjà stockée), jamais sur le seul payload courant :
    // une mise à jour PARTIELLE qui ne touche que `termEndDate` (l'autre date restant celle déjà
    // en base) contournait la garde précédente (comparaison payload-seul) — mesuré : une dette
    // dont `startDate` reste au FUTUR et `termEndDate` bascule au PASSÉ n'est alors JAMAIS
    // 'active' (phases 'a-venir' → 'terminee' sans jamais passer par 'active'), donc jamais payée
    // ni comptée au bilan avant de réapparaître d'un bloc à `startDate`.
    const existingForDates = existingIdx >= 0 ? debts[existingIdx] : undefined;
    const effectiveStart = doc.startDate ?? existingForDates?.startDate;
    const effectiveEnd = doc.termEndDate ?? existingForDates?.termEndDate;
    if (effectiveStart != null && effectiveEnd != null && effectiveEnd < effectiveStart) {
        throw new Error(`La date de fin (${effectiveEnd}) précède la date de début (${effectiveStart}). Rien n'a été écrit.`);
    }
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
        apply('kind', doc.debtKind);
        apply('startDate', doc.startDate);
        apply('termEndDate', doc.termEndDate);
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
        ...(doc.debtKind != null ? { kind: doc.debtKind } : {}),
        ...(doc.startDate != null ? { startDate: doc.startDate } : {}),
        ...(doc.termEndDate != null ? { termEndDate: doc.termEndDate } : {}),
    };
    debts.push(newDebt);
    changes.push({
        field: `debts[+${debts.length - 1}]`,
        before: null,
        after: { name, balance, interestRate, minimumPayment, category },
        note: doc.category ? undefined : `catégorie inférée du nom : ${category}`,
    });
    const nextState: AppState = { ...state, debts, lastUpdate: Date.now() };
    // [DEBT-MCP-PARITE, ÉLEVÉ revue] Ce résumé (relu par l'assistant ET affiché à l'aperçu de
    // consentement, `_writeHelper.ts`) affirmait TOUJOURS « servie dès maintenant » — faux dès que
    // `startDate` est dans le futur : la dette est alors ABSENTE du patrimoine du jour (exclue de
    // `activeDebtsTotal`) jusqu'à cette date, contredisant la description du tool ET la phrase
    // elle-même. `today` au même format YYYY-MM-DD que `doc.startDate` (comparaison lexicographique
    // valide sur ce format) — même patron que `applyBankStatement` plus haut dans ce fichier.
    const today = new Date().toISOString().slice(0, 10);
    const debutDifferencie = doc.startDate != null && doc.startDate > today
        ? `Débute le ${doc.startDate} (absente du patrimoine avant cette date).`
        : 'Servie dès maintenant par la projection.';
    const summary = `Dette « ${name} » ajoutée (${category}) : solde ${balance} $, ${interestRate} %, ` +
        `paiement ${minimumPayment} $/mois. ${debutDifferencie}`;
    return { nextState, changes, summary };
}
