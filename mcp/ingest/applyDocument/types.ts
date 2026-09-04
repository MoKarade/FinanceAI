// mcp/ingest/applyDocument/types.ts
// [GODFILE-APPLYDOCUMENT] Contrat d'ingestion (payloads + résultat) — extrait du monolithe.
// La façade `mcp/ingest/applyDocument.ts` ré-exporte tout : les consommateurs ne changent pas.

import type { AppState, Asset, Debt, DebtKind } from '../../../types';

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
    /** [DEBT-MCP-ORIGINALBALANCE] Montant EMPRUNTÉ à l'origine ($). C'est le champ qui RÉVEILLE la
     *  courbe d'amortissement du passé (`[DEBT-AMORTIZATION-CABLAGE]`, lot 92) : sans lui le service
     *  refuse (`donnees-manquantes`) et la dette reste au niveau figé d'aujourd'hui. Il se LIT sur le
     *  contrat — c'est une EXTRACTION, jamais une saisie ni une estimation (décision Marc consignée
     *  dans `docs/adr/0012-…`, section « RENVERSEMENT du 2026-09-02 »). Absent ⇒ comportement
     *  historique exact. */
    originalBalance?: number;
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
