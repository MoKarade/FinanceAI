# Changelog

Toutes les modifications notables apportées au projet sont documentées ici.

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

---

## [unreleased — cycle 7 : Phase 6 fiscalité complète + flaky fix] — 2026-05-19

> Cycle dédié à la complétion de la Phase 6 fiscale (manques structurels
> identifiés par l'audit 2026-05). 8 items implémentés en suivant un
> protocole strict : impl → 4 agents review en parallèle → fix HIGH/MEDIUM
> → tests intégration → triple validation locale → commit + push.
> Tests : 243 → 348 (+105 nouveaux). Branche `claude/phase-6-tax-qc`.

### 💰 §6.2 — Crédits 65+ et revenu de retraite (fed + QC)

- **ARC ligne 30100** (Montant en raison de l'âge) : indexation 2026 = 2.0%,
  max 8 966$, seuil 46 432$, réduction 15%.
- **ARC ligne 31400** (Crédit pour revenu de pension) : 2 000$ fixe, restreint
  65+ (sauf invalidité non modélisée).
- **Revenu Québec ligne 361** (combinée) : crédit âge 3 986$ + revenu retraite
  3 058$, seuils familiaux 27 835$/45 270$ (single/couple), réduction 18.75%.
- Fonction `calculateAgeAndPensionCredits(opts, netTaxable, year)` avec guard
  NaN/Infinity, indexation seuils via `getIndexedBracketsForYear`.
- Intégration dans `calculateFiscalReport` (param `ageOpts` optionnel) +
  `taxDecember.ts` mode retraité + actif 65+ + `taxJanuary.ts` FERR margRate.
- 16 tests (12 baseline + 4 review-fixes : frontière 64/65, NaN, pension=0+65+,
  snapshot régression).
- Impact : ~970$/personne/an d'économie pour retraité 65+ sous seuils.

### 💊 §6.4 — RAMQ prime régime public d'assurance médicaments

- **Revenu Québec ligne 447 + Annexe K** : seuils 19 500$/31 610$ (single/couple),
  paliers 7.65%/3.84% (palier 1) + 11.48%/5.75% (palier 2), max 766$/adulte.
- Bonus seuils par enfant à charge (4 105$ / 12 110$ pour 1er, +3 790$ / +4 105$
  pour 2+).
- Fonction `calculateRamqPremium(income, opts, year)` avec exemption privée +
  indexation.
- Intégration dans `taxDecember.ts` modes retraité ET actif. `familyNetIncome`
  inclut REER déductions (mode actif) ou retraits REER + 50% gains capitaux
  (mode retraité).
- 18 tests dont 5 review-fixes (frontières seuils, childrenCount=1, frontière
  bracket1/bracket2, exempt + revenu élevé) + 3 intégration `processDecemberTaxFiling`.
- Impact : jusqu'à ~1 532$/an pour couple non-couvert privé.

### 🏦 §6.6 — Stress test OSFI B-20 hypothécaire

- **OSFI guideline B-20** : qualifying rate = max(contractRate + 2 pts, 5.25%),
  GDS ≤ 39%, TDS ≤ 44%.
- Fonctions `calculateB20QualifyingRate(rate)` + `calculateB20StressTest(input)`
  retournant `{qualifyingRate, qualifyingPmt, gds, tds, passes, failReason}`.
- Intégration dans `realEstateMonth.ts` au déclenchement de l'achat. Log warning
  dans `lifeEventLogs` si fail, n'empêche pas l'achat (informatif).
- Indexation des charges logement par inflation pour cohérence avec revenu nominal.
- 16 tests dont 4 review-fixes (amortization=0, frontière GDS 39%, snapshot
  qualifying PMT, contractRate=5.25%).
- Limitations documentées : `otherDebtMonthly = 0` (pas d'accès aux dettes via
  RealEstateCtx), composition mensuelle simple vs semi-annuelle canadienne.

### ✅ §6.8 — Validation SCHL mise de fonds + amortissement max

- **SCHL** : MDP min 5%/5%+10%/20% selon prix (≤500k/500k-1.5M/>1.5M).
  Amortissement max 25 ans (assuré std) ou 30 ans (1er acheteur OU résidence
  neuve depuis août 2024) ou 30 ans (conventionnel ≥20% MDP).
- Fonctions `calculateMinDownPayment(price)` + `validateMortgageParameters(input)`
  retournant `{valid, errors[], downPaymentRatio, minDownPayment, maxAmortizationAllowed, insured}`.
- Intégration : validation au mois d'achat avec warnings groupés (un seul message
  ciblé pour prix >1.5M$, pas de doublon).
- `RealEstateGoal` étendu avec `isFirstTimeBuyer?: boolean` et
  `isNewConstruction?: boolean`.
- Guard epsilon 1e-9 sur frontière MDP 20% (évite mauvaise classification à
  cause d'arrondi flottant).
- 19 tests dont 4 review-fixes (un seul message si prix>1.5M, frontière 1.5M
  exacte, MDP=20% exact, price=0 explicite).

### 🏥 §6.1 — FSS Fonds des services de santé

- **Revenu Québec ligne 446 + Annexe F** : seuils 18 130$/33 130$/63 060$/148 030$,
  paliers 0/1% × excès/150$ flat/150$ + 1%/1 000$ max.
- Fonction `calculateFSSPremium(netIncome, year)` avec indexation complète.
- Intégration `taxDecember.ts` mode retraité uniquement (salariés couverts par
  employeur). Revenu individuel = (pension + rentes + retraits + 50% gains
  capitaux) / activeUsersCount.
- Limitations documentées (audit silent-failure) : 1) actifs autonomes exclus
  (TODO `User.hasSelfEmployedIncome`), 2) revenu individuel approximé par
  moyenne familiale.
- 13 tests dont 3 intégration `processDecemberTaxFiling`.
- Impact : jusqu'à 1 000$/adulte/an pour retraités à revenu élevé.

### 🏠 §6.5 — SCHL prime d'assurance hypothécaire

- **SCHL primes 2026** par tranche LTV : 0.60%/1.70%/2.40%/2.80%/3.10%/4.00%
  (LTV ≤65/75/80/85/90/95%). Assurance non disponible si LTV > 95% ou prix > 1.5M$.
- Fonctions `calculateSchlPremiumRate(ltv)` + `calculateSchlPremium(input)`
  retournant `{ltv, rate, premium, required, available}`.
- Intégration `realEstateMonth.ts` : la prime est ajoutée au principal du prêt
  AVANT calcul du PMT, augmentant les paiements mensuels.
- 17 tests (tous les paliers + frontières + snapshot 5% MDP → 19 000$).

### 💰 §6.7 — TPS/TVQ remboursement résidence neuve

- **ARC RC4028** (TPS) : rebate 36% jusqu'à 350k$, décroissance linéaire à 0
  pour 450k$+.
- **Revenu Québec** (TVQ) : rebate 50% jusqu'à 200k$, décroissance à 0 pour 300k$+.
- Fonctions `calculateGstNewHomeRebate(price)`, `calculateQstNewHomeRebate(price)`,
  `calculateNewHomeRebateTotal(price, isNewConstruction)`.
- Intégration : si `goal.isNewConstruction`, rebate soustrait du `totalCashNeeded`
  à l'achat (modélisation simplifiée : net après remboursement).
- 13 tests (paliers TPS, paliers TVQ, combinaison, snapshot 300k$ → 5 400$).

### 🎁 §6.3 — SRG Supplément de revenu garanti

- **Service Canada Q1 2026** : max 1 105$/mois célibataire, 662$/mois couple/adulte,
  seuils revenu 22 512$/29 760$, clawback 50%.
- Fonction `calculateGISBenefit(otherIncomeAnnual, hasSpouseWithOAS, year)`.
- Intégration dans `retirementIncome.ts` : SRG ajouté au revenu de retraite
  mensuel si age ≥ psvStartAge ET psvMonthly > 0. otherIncome approximé par
  RRQ + DB annualisés.
- 9 tests (max célibataire/couple, clawback, annulation seuils, indexation).
- Limitation documentée : approximation `otherIncome = rrq + db` ignore retraits
  REER et gains capitaux (SRG potentiellement surestimé pour ces profils).
- Impact : crucial pour scénarios faible revenu retraite (jusqu'à 13 200$/an
  célibataire).

### 🐛 Fix flaky `RealEstateGoal isActive guard`

Test pré-existant qui échouait sur main depuis cycle 6 : `makeInactiveGoal`
omettait `totalClosingCosts`, ce qui rendait `totalCashNeeded = downPayment +
undefined + welcomeFees = NaN`. La cascade d'achat ne s'exécutait jamais
silencieusement, faisant converger active/inactive vers le même `estateNetWorth`.
Fix : ajout `totalClosingCosts: 5000` + fonds suffisants pour garantir l'achat
+ assertion renforcée (`diff > max(1, inactiveBase × 1%)` plutôt que `!==`).

### 🔬 Protocole agents review (multi-agents qualité par PR)

À partir de §6.2, chaque item §6.x déclenche un cycle :
1. Implémentation baseline + tests + triple validation.
2. Lancement de 4 agents en parallèle (typescript-reviewer, code-reviewer,
   silent-failure-hunter, tdd-guide) avec contexte ciblé.
3. Synthèse des findings (HIGH/MEDIUM/LOW + tests manquants).
4. Application des fixes critiques (HIGH systématique, MEDIUM selon impact).
5. Tests additionnels (snapshot régression, frontières exactes, intégration).
6. Triple validation finale + commit "review fixes" sur la même PR.

Résultat : 11 HIGH + 14 MEDIUM identifiés et résolus AVANT merge. Sans ce
protocole, les calculs fiscaux auraient des biais silencieux non détectables
par typecheck/tests baseline.

### 📚 Documentation

- `docs/PLAN_PHASE_6.md` (créé) : plan de match suivi PR par PR.
- `docs/HANDOVER.md` §3.4 : à mettre à jour après merge PR #84 (tous les ⏳ → ✅).
- Mémoire projet (`.claude/projects/.../memory/`) : 6 fichiers de mémoire
  pour Marc (profile, projet, workflow git, règles fiscales, état Phase 6,
  feedback agents).

### ✅ Tests

348/348 tests verts (vs 243 sur main avant ce cycle). Aucun flaky restant.
Typecheck strict clean en permanence. Build production : ~3.75s.

---

## [unreleased — cycle 6 : Claude+Era migration + UI refoundation + a11y polish] — 2026-05

> Le plus gros cycle depuis le lancement. Migration complète de la stack
> IA, refonte du design system, et toutes les pages standardisées sur un
> pattern uniforme.

### 🤖 Phase 4.A — Migration Gemini → Claude (5 PRs séquentielles)

- **`services/claude.ts`** créé (~550 lignes) : wrapper `@anthropic-ai/sdk`
  mirroring complet de l'ancienne surface Gemini.
  - `chat`, `chatStream` — équivalents `generateContent` + streaming
  - `categorizeBatch` — modèle `claude-haiku-4-5` (volume + vitesse)
  - `analyzeBudget`, `analyzePayslip`, `analyzeDocuments` — Sonnet 4.6
  - Préservation de `sanitizePayee`, `roundToHundred`, Zod schemas, `QUEBEC_FISCAL_CONTEXT`
  - `dangerouslyAllowBrowser: true` (app client-side, clé utilisateur)
- **Schema store v1 → v2 → v3** : ajout `apiKeys.anthropic` puis suppression
  `apiKeys.gemini`. Migration progressive sans casser les utilisateurs
  existants.
- **5 consumers migrés** : `AiAssistant`, `BudgetAiModal`, `Transactions`
  (catégorisation), `TaxCenter` (Vision), `Planning` (suggestions goals).
- **`services/gemini.ts` supprimé** + dépendance `@google/genai` retirée du
  `package.json`. Cleanup final dans la PR A5.
- **Bundle** : `ai-vendor` chunk 289 KB → 130 KB (**-55%** — Anthropic SDK
  plus léger).

### 🌐 Phase 4.B — Era Context comme moteur de qualité

- **`services/eraContext.ts`** étendu (1 endpoint → 9 endpoints) :
  - `getCashFlow`, `analyzeSpending`, `forecastSpending`, `getDailyFinancialSummary`
  - `rememberFact`, `recallHistory` (mémoire persistante)
  - `searchTransactions`, `listRecurringCharges`
  - Helper générique `eraRequest()` avec timeout, Bearer auth, validation Zod, cache TTL 1h
- **`services/aiOrchestrator.ts`** (nouveau, ~135 lignes) :
  - `buildEnrichedContext(token)` : Promise.all parallèle sur 4 endpoints
  - `renderEnrichedContext(ctx)` : format pour system prompt Claude
  - `maybeRememberFromMessage(msg, token)` : détecte "remember:"/"souviens-toi:"
- **`components/AiAssistant.tsx`** : court-circuit "remember:" + system
  prompt enrichi automatiquement avec insights Era Context.
- **`components/Planning.tsx`** : utilise `listRecurringCharges` Era Context
  comme primaire, Claude fallback (toast indique la source).
- **`components/dashboard/EraContextInsights.tsx`** (nouveau) : widget Dashboard
  qui montre cash-flow 90j + top catégorie 30j + prévision mois prochain +
  anomalies + mémoire. Silencieux si pas de token Era.

### 🎲 Phase 4 #4 — Nouveaux scénarios compound stress

2 scénarios MC supplémentaires (5 → 7 au total) :

- **`COMPOUND_STRESS`** (« Tempête Parfaite ») : empile inflation 5%+,
  rendements anémiques (CELI/REER 3%, NonReg 2%, cash 1%) ET force
  `ltcEnabled = true` via override scenario-local. Le pire du pire.
- **`LATE_INHERITANCE`** (« Héritage Tardif ») : injection de 250 000$ au
  mois 240 (an 20) au lieu de WINDFALL (mois 60). Teste le pont fiscal long.

UI : grille scenarios passe de `md:grid-cols-5` à `sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7`,
badge "Nouveau" sur les 2 ajouts.

### 🎨 Refonte UI complète (Phases A → D)

- **Phase A — Design tokens + primitives** :
  - `tailwind.config.js` : couleurs sémantiques (primary, success, warning,
    danger, info, secondary), scale typo cohérente (text-display/h1/h2/body/
    meta/tiny — fin des `text-[9-11px]` ad-hoc), border-radius `rounded-card`,
    focus utility `focus-ring`.
  - 14 primitives dans `components/ui/` : Button, Badge, Card, CollapsibleSection,
    KPIStat, StatGrid, PageHeader, Pill, SectionHeader, EmptyState, Modal,
    ConfirmModal, Toast, Tooltip, ErrorBoundary. Tests RTL pour chacune.
- **Phase B — Navigation** :
  - `Layout.tsx` regroupé en 4 groupes thématiques sidebar (Argent / Plan /
    Objectifs / Outils)
  - Deep-link cross-tab : `pendingFocus` dans le store + `navigateWithFocus(tab, section)`
    + hook `usePendingFocus` + animation `animate-pulse-once`
  - 5 consumers : Dashboard, Budget, Children, Investments, RealEstate
- **Phase C — Refonte des 9 pages** (C1 → C7) :
  - C1 FutureProjection : Hero KPI 4-strip (FIRE/Patrimoine/MC Success/FVI)
    + 4 CollapsibleSection (Macro / Variabilité / Stochastiques / Avancés)
  - C2 Dashboard : 4-KPI StatGrid + EraContextInsights widget + chart Brush
    multi-période + 3 cards segmentées
  - C3 Budget : 4-KPI StatGrid + `BudgetGroupTable` extrait + bandeau impact
    long terme cliquable (deep-link FutureProjection)
  - C4 Investments : KPIStat/StatGrid dans card Portefeuille projeté +
    3 CollapsibleSection (Allocation / Rééquilibrage / Portefeuille Détaillé)
  - C5 RealEstate : 4-KPI StatGrid + `PropertyConfigurator` + `MultiPropertyComparison`
    sous-composants
  - C6 Transactions : PageHeader uniformisé
  - C7 Retirement, TaxCenter, DebtManager, Travel, LifeEvents, Settings,
    Children avec PageHeader
- **Phase D — Mobile + animations** :
  - Bottom nav `text-tiny`, drawer regroupé, touch targets ≥ 56px, `pb-safe`
    pour iOS
  - Utilities `lift-on-hover`, `animate-pulse-once`, `touch-target`

### ♿ A11y — Audit Phase 5.1

- `components/Layout.tsx` : skip link "Aller au contenu principal" en
  premier focusable, devient visible au focus clavier
- `<main>` reçoit `id="main"` + `tabIndex={-1}` (target du skip link)
- `text-[9-11px]` bannis du codebase (0 occurrence)

### 📚 Documentation structurée

- **`docs/ARCHITECTURE.md`** (nouveau) : vue d'ensemble pour nouveaux
  contributeurs (stack, topologie, store, moteur projection, IA, tests,
  workflow contributeur)
- **`docs/adr/`** (nouveau dossier) : 4 ADRs courts
  - ADR-001 Migration Gemini → Claude
  - ADR-002 Era Context comme moteur de qualité
  - ADR-003 Split projection.ts modulaire (31 sous-modules)
  - ADR-004 Design system primitives custom (vs shadcn/Radix)
- **`docs/PROJECTION.md`** mis à jour : 7 scénarios documentés (Phase 4 #4),
  pipeline diagram à jour, count de tests (47 + 28)
- **`docs/UI_REFOUNDATION_PLAN.md`** : Phase A/B/C/D toutes marquées ✅ FAIT
  avec description précise de ce qui a atterri
- **`docs/WIRING_NOTES.md`** : section "UI Phase C terminée" + section
  "Phase 4 #4 Compound stress" + section "Deep-link cross-tab"
- **`docs/TYPECHECK_BACKLOG.md`** : entièrement réécrit (backlog résorbé,
  doc historique)
- **`docs/PLAN_PHASE_4.md`** (nouveau) : plan détaillé de la migration
  Claude + Era (référence historique)
- **`docs/AUDIT_2026-05.md`** §Phase 5 : colonne État ajoutée (5.1 ✅,
  5.2 ✅, 5.3-5.6 ⏳ non prioritaires)

### 🚀 Déploiement

- **GitHub Pages** : workflow `.github/workflows/deploy-pages.yml` créé,
  `VITE_BASE_PATH` configurable dans `vite.config.ts`
- **Vercel** : auto-detected, preview par PR

### ✅ Tests

225 tests verts (24 fichiers de test) tout au long du cycle. Aucune
régression introduite. Typecheck strict clean en permanence.

---

## [unreleased — cycle 5 : UI coverage 100% du moteur] — Branche `claude/analyze-finance-app-CtLvs`

### 🔍 Audit UI coverage par agent

Le moteur lit ~150 champs depuis SimulationParams + sous-types. L'audit a révélé que **~35% des champs effectivement utilisés** n'avaient aucun contrôle UI : leurs valeurs restaient figées sur les défauts.

### ⚙️ Nouveau composant : `AdvancedProjectionParams.tsx`

Panneau collapsible dans FutureProjection qui expose les paramètres jusque-là cachés :

**🔥 Stress Test (4 champs HIGH)** : enabled, year, drop, recovery + inflation shock — feature lue par moteur mais inaccessible.

**🎯 Optimisations fiscales (3 toggles HIGH)** :
- `useSmithManoeuvre` (hypothèque déductible)
- `optimizeSourceDeductions` (T1213)
- `vehicleReplacementEnabled` (auto-replace cyclique)

**🎲 Monte Carlo & Bootstrap** :
- `monteCarloIterations` (50-1000) — **désormais lu par le moteur** (était figé à 100)
- `bootstrapBlockSize`

**🎭 Détails événements stochastiques** (apparaissent quand le toggle correspondant est ON) :
- Divorce: probabilité annuelle, split %, pension alimentaire
- LTD: probabilité, % revenu maintenu, durée
- CI: probabilité, capital forfaitaire, dépenses additionnelles
- Héritage: montant attendu, âge attendu, incertitude, probabilité
- Perte d'emploi: probabilité, durée
- Survivant: % RRQ + % DB conservés

**🌴 Snowbird** : mois/an + surcoût mensuel
**🧒 Sandwich generation** : boomerang + caregiving (montant, âge début, durée)
**💰 Soldes initiaux manuels** : useManualBalances + 7 champs (CELI/REER/NonReg/Cash/Crypto/CELI room/REER room)
**📊 Rendements affinés** : crypto + cash (absents de la grille principale)

### 🧹 Cleanup

- Orphelins marqués `@deprecated` dans types.ts (scenarioB, scenarioBLabel)

---

## [unreleased — cycle 4 : ProjectionChartPoint + W5.x câblage] — Branche `claude/analyze-finance-app-CtLvs`

### 🎯 PR A — `ProjectionChartPoint` typé (TS reviewer quick win #1)

- Interface `ProjectionChartPoint` avec ~90 champs optionnels typés (NetWorth, IncomeMarc, CELI, REER, MarketGrowth*, etc.)
- `ProjectionResult.chartData: ProjectionChartPoint[]` (au lieu de `any[]`)
- ROI: élimine ~35 erreurs TS strict en cascade dans RealEstate/Investments/ChildPlanning

### 🔗 PR B — `RegisteredAccountType` unification finale

- `InvestmentAccount.type: 'CELI'|...` → `RegisteredAccountType` (élimine la 2e union divergente)

### 🔌 PR C — W5.x conteneurs câblés au moteur (cycle 4 intégration)

Les conteneurs capturés en UI depuis PR #16 mais ignorés du moteur sont maintenant **fonctionnels** :

- **W5.4 Assurances** : primes mensuelles ajoutées aux dépenses (avec respect `expiryDate` pour T10/T20/T30)
- **Véhicules cycliques** : `liquid -= cost` tous les N×12 mois
- **Rénovations majeures** : `liquid -= cost` à la date planifiée
- **Dons charitables** : `monthlyExpenses` + crédit fiscal 33% (`taxCurrentYear.revenu`) + bonus titres appréciés
- **W5.6 Immeubles locatifs** : NOI = `(rent×(1-vacancy) - expenses)` ajouté au revenu + imposable au marginal 45%

`SimulationParams` étendu, `Retirement.tsx` + `FutureProjection.tsx` passent les conteneurs via store.

5 tests régression W5.x ajoutés. Tests: **148/148**.

---

## [unreleased — cycle 2/3 fixes + architecture refactor + final agents review] — Branche `claude/analyze-finance-app-CtLvs`

### 🔍 Phase 4 — Re-run 3 agents post-refactor

3 agents relancés (code-reviewer, silent-failure-hunter, typescript-reviewer) ont vérifié les phases 1-3. Verdicts :
- **code-reviewer**: "Ship it" — 0 HIGH/CRITICAL. 1 LOW non-régression (array index keys in AssetLocationCard, anti-pattern pré-existant).
- **silent-failure**: 1 MEDIUM identifiée — Worker sans timeout/messageerror.
- **ts-reviewer**: ~40 erreurs strict éliminées par ProjectionResult, gain effectif 64 erreurs (vs 104 avant). Quick win RegisteredAccountType inutilisé.

### 🔧 Cycle 3 fixes additionnels

- **Worker timeout 30s + messageerror handler** : runAsync.ts cleanup unifié + détection mort automatique sur timeout/erreur (évite Promises pendantes indéfinies)
- **`Asset.accountType` câblé sur `RegisteredAccountType`** : unification du type partagé (préparation pour Retirement/FutureProjection/Investments)

---

## [unreleased — cycle 2/3 fixes + architecture refactor] — Branche `claude/analyze-finance-app-CtLvs`

### 🐛 Fixes post-merge PR #18 (cycle 2 multi-agents)

**Phase 1 — Findings restants des agents** :
- A: `HISTORICAL_RETURNS_US` mutation top-level retirée (effet de bord cross-test). CPI canadien lu via `canadianInflationFor()` à la demande.
- B: Tests comportementaux `useDebouncedMemo` avec `vi.useFakeTimers` (3 tests behavior).
- C: 2 `as any` Retirement.tsx retirés (`dbElectionType`, `dbSurvivorPct` désormais typés).
- D: `month1ActionPlan` typé `{ monthlyCashflow; strategy } | null` (élimine cascade strict).
- E: `goalSeekBusy` partagé entre 3 boutons → split en `busySavings`/`busyAge`/`busyDrawdown` (silent-failure: cliquer rapidement n'affiche plus de résultats croisés).
- F: **`ProjectionResult` interface exportée** + retour `calculateFutureProjection` typé. `runProjectionAsync` passe de `Promise<any>` à `Promise<ProjectionResult>`. ROI: élimine ~40 erreurs TS strict en cascade.

### 🏗️ Phase 2 — Architecture refactor (code-architect agent)

- `components/retirement/GoalSeekerCard.tsx` (124 lignes) — extraction Goal seeker + Drawdown optimizer + 3 busy flags + 2 results state local
- `components/retirement/AssetLocationCard.tsx` (91 lignes) — extraction holdings + analyse
- `components/Retirement.tsx` réduit **702 → 527 lignes (-25%)**
- Phase 2.1 (split `types.ts`) et 2.3 (split `projection.ts`) explicitement skip:
  - `types.ts` split: cosmétique single barrel file, risque > bénéfice
  - `projection.ts` split: ~2400 lignes, refactor majeur réservé à session dédiée

### 🎯 Phase 3 — Type tightening (type-design agent)

- Union stricte `Industry` (13 valeurs: tech/finance/health/public-sector/education/construction/retail/manufacturing/energy/transportation/agriculture/media/other) remplace `User.industry: string`
- Union `RegisteredAccountType` (CELI/CELIAPP/REER/NON-ENREG/CRYPTO/REEE/MARGE/AUTRE) — préparation unification 3 unions divergentes (Asset.accountType, InvestmentAccount.type, AccountType d'assetLocation)
- Settings UI: champ Industry passe d'input text à `<select>` avec les 13 valeurs

---

## [unreleased — post W1-W5] — Branche `claude/analyze-finance-app-CtLvs`

Bundle d'optimisations + nouvelle feature suite à l'analyse multi-agents du PR #16.

### ⚡ Performance (perf-optimizer agent #1 et #2)
- `utils/useDebouncedMemo.ts` (nouveau): hook React générique, debounce 300ms
- `Retirement.tsx` + `FutureProjection.tsx`: `useMemo` projection → `useDebouncedMemo`
- Gain estimé: -80% de recalculs pendant la saisie utilisateur
- **Web Worker câblé** dans FutureProjection pour MC (libère main thread 1.5-3s)
- Indicateur visuel ⏳ pendant calcul MC + bouton disabled

### 🧪 Couverture tests (silent-failure-hunter agent)
- 9 nouveaux tests Vitest pour les événements stochastiques (Divorce, LTD, CI, Inheritance, Survivor, Snowbird, Bootstrap, Replay 2008, US Withholding)
- 6 tests `assetLocation` (incl. cas allocation déjà optimale)
- Tests passent: 132 → 137/137

### 📊 Précision modélisation
- **Canadian CPI 1928-2024** (StatCan v41690973): le bootstrap historique utilise maintenant l'inflation canadienne au lieu d'US CPI (capture les divergences années 70-80, contrôles de prix Trudeau)
- 3 tests vérifiant les valeurs clés (1975-76, 2022 post-COVID, fallback)

### 🧭 Nouvelle feature: Asset Location Optimizer (L9)
- `services/projection/assetLocation.ts`: optimizeAssetLocation()
- Implémente la règle d'or canadienne (Canadian Couch Potato / PWL Capital)
- 7 classes d'actif × 3 comptes
- Calcule la perte annuelle ($) d'une mauvaise allocation
- UI dans Retirement: éditeur de holdings + bouton "Analyser"

---

## [unreleased — vague W1-W5] — Branche `claude/analyze-finance-app-CtLvs`

Bundle majeur ajoutant 11 nouvelles vagues d'améliorations identifiées lors de l'analyse de marché vs ProjectionLab, Pralana Gold, Snap Projections, Boldin, NaviPlan, etc.

### 🏗️ Fondations précision (W1)
- **W1.1** Web Worker scaffold pour MC hors thread principal (services/projection.worker.ts + runAsync.ts)
- **W1.2** Bootstrap historique S&P 500 1928-2024 (97 ans, source Damodaran NYU). Capture les vrais krachs.
- **W1.3** RRQ et PSV séparés (corrige L1: governmentPension × 0.65/0.35 obsolète)
- **W1.4** Scénario survivant après décès du conjoint (RRQ 60%, PSV cesse, DB selon election)
- **W1.5** Goal seeking inverse: trouve épargne nécessaire ou âge retraite minimum par dichotomie

### 💰 Optimisations fiscales (W2)
- **W2.6** Drawdown order optimizer: compare 5 stratégies, retourne la meilleure
- W2.1/W2.3/W2.7 capturés en config (flags, logique partielle)

### 🎲 Événements de vie stochastiques (W3)
- **W3.1** Divorce probabiliste (1.5%/an, split 50%, alimony)
- **W3.2** Invalidité longue durée (0.5%/an, 60% revenu pendant 24 mois)
- **W3.3** Maladie grave (0.3%/an, capital + dépenses)
- **W3.4** Héritage probabilisé (fenêtre ± uncertainty)
- **W3.5** Sandwich generation (boomerang kids + caregiving parents âgés)

### 📊 Visualisation et UX (W4)
- **W4.1** TaxBracketViz (fédéral + Québec avec marqueur revenu)
- **W4.5** Replay krach historique (1929/1973/2000/2008/2020/2022)
- **W4.7** Snowbird (4-6 mois US/Mexique)

### 📥 Capture variables (W5)
- **W5.1** Profil utilisateur enrichi (santé, carrière, identité, longévité)
- **W5.2** Bonus/RSU/Stock options/Side income/Périodicité paie
- **W5.3** Dettes étendues (kind, taux variable, limite, terme, déductible)
- **W5.4** InsurancePolicy (11 types de police)
- **W5.5** DB joint-life vs single-life avec %survivant
- **W5.6** RentalProperty (cap rate, vacancy, NOI, DPA)
- **W5.7** PrivateBusiness (CCPC, dividendes, BNR)
- **W5.x** Goals cycliques (véhicules, rénovations, dons charitables)

### 📚 Documentation
- `docs/PROJECTION.md` étendu (sections 7-11 ajoutées)
- Toutes les W-features documentées avec tables récapitulatives

---

## [PR #15 mergé] — Branche `claude/analyze-finance-app-CtLvs`

Bundle massif sur PR #15. Refactor profond du moteur de projection + nouvelles features de modélisation + correctifs de déterminisme.

### 🏗️ Refactor moteur de projection (D2.x)

#### D2.1 — Migration physique
- `utils/useFutureSimulation.ts` (1947 lignes) → `services/projection.ts`.
- Aucun consumer à mettre à jour (tous importaient déjà via `services/projection`).
- Import interne `./tax` ajusté en `../utils/tax`.

#### D2.2 — Extraction helpers purs
- Nouveau module `services/projection/helpers.ts`.
- Fonctions extraites : `mulberry32`, `gaussianRandom`, `applyShock`, `welcomeTax`, `ltcAnnualProbability`, `mortalityAnnualProbability`.
- Constantes extraites : `ASSET_VOLATILITY`, `MER`, `RRIF_RATES`.
- Bug latent documenté dans `welcomeTax` : paliers en `else if` (non-cumulatifs, faux fiscalement) — figé par tests régression.
- `applyShock` n'est plus redéfini 360× par scénario.
- 24 tests unitaires sur les helpers.

#### D2.3 — Correctifs déterminisme et nettoyage
- 🎯 **Graine Monte Carlo découplée du capital initial** (`scenario-strategy-iter` au lieu d'inclure `calculatedStartingCash`) — permet la comparaison équitable de stratégies.
- 🐛 Suppression de `new Date().getFullYear()` (rendait la simulation dépendante de l'horloge système).
- Suppression d'une fonction `logEvent` module-level shadow ée par sa version locale.
- Suppression de la double affectation de `monthlyExpenses` dans la phase retraite.
- **MC_ITERATIONS** : 50 → 100 (IC95% ≈ ±3 points vs ±7).

### ✨ Nouvelles features de modélisation

#### D2.4 — Pension à prestations déterminées (DB)
- 3 nouveaux champs dans `RetirementGoal` :
  - `dbPensionMonthly` — rente mensuelle couple
  - `dbPensionIndexationPct` — fraction d'IPC répercutée (0-100, défaut 100)
  - `dbPensionStartAge` — défaut = `targetAge`
- Pour les fonctionnaires (RREGOP, féd, profs, infirmières), c'est souvent le revenu de retraite #1.
- UI complète dans `Retirement.tsx`.

#### D2.5 — Smile Curve (dépenses retraite en U)
- Référence : étude CIBC "Spending in Retirement".
- Go-go (jusqu'à 74) : +15%, Slow-go (75-84) : base, No-go (85+) : -10%.
- Flag opt-in `useSmileCurve` dans `ProjectionConfig`.
- Toggle UI `😊 Smile Curve` dans `FutureProjection`.

#### D2.6 — Métrique Sequence Risk
- Nouvelles métriques dans `expertMetrics` :
  - `sequenceRiskPct` — % itérations MC où NW < 50% startNW dans la décennie critique [retraite-5, retraite+5]
  - `worstDecadeDrawdown` — pire chute relative
  - `criticalDecadeStartYear` / `criticalDecadeEndYear`
- Un krach durant cette fenêtre est ~10× plus destructeur qu'à 20 ans de retraite.

#### D2.7 — Withholding tax US 15% sur CELI
- Le CELI n'est PAS protégé par la convention fiscale Canada-US (le REER si).
- Nouveaux champs : `usEquityShareCeli` (0-100%), `usEquityDividendYield` (défaut 1.5%).
- Drag = share × yield × 15% appliqué sur `effectiveCeliRate`.
- UI : 2 sliders dans `FutureProjection`.

#### D2.8 — Mortalité stochastique + Soins longue durée (LTC)
- **LTC** : probabilités annuelles calibrées Stats Can/Genworth (1% à 65 → 25% à 90+). Coût mensuel paramétrable (2000-12000$). Une fois déclenché, persiste.
- **Mortalité** : tirage annuel selon table Stats Canada 2020-2022 (0.6% à 60 → 33% à 100). En mode MC + flag, la boucle `break` à la mort. `estateNetWorth` devient le patrimoine au décès.
- 2 toggles UI + slider coût LTC.

#### D2.9 — Inflation différenciée par poste
- Panier CPI Stats Canada 2023 (logement 30%, alim 17%, transport 15%, santé 5%, loisirs 6%, autres 27%).
- 6 sliders configurables.
- Le bonus santé après 75 ans s'applique désormais sur la part Santé uniquement.

#### D2.10 — Perte d'emploi stochastique
- Probabilité annuelle ~3% (Stats Can).
- Durée moyenne sans emploi : 6 mois (paramétrable).
- Pendant la période : salaire user1 = 55% (assurance-emploi).
- Toggle UI.

### 📚 Documentation

- ➕ **`docs/PROJECTION.md`** : documentation détaillée du moteur de projection (9 phases mensuelles, calendrier fiscal, déterminisme, cas-tests, limitations).
- ➕ **`CHANGELOG.md`** : ce fichier.
- 🗑️ **`CHANGELOG_COMPLET.md`** : supprimé (corrompu UTF-16, remplacé).
- 📦 Archivés dans `docs/archive/` :
  - `AUDIT_REPORT.md`
  - `META_AUDIT.md`
  - `PLAN_DE_FIX.md`
  - `RAPPORT_FIXES.md`
  - `plan_mcp_financeai.md`

### 🧪 Tests

- 79 → **115 tests** (toujours 100% pass).
- 6 fichiers de tests : `projection.test.ts`, `projection.helpers.test.ts`, `tax.test.ts`, `portfolio.test.ts`, `realEstate.test.ts`, `safeNumber.test.ts`.

---

## [Session précédente] — Mai 2026

### U-series — UI / UX
- **U1** : Conversation `AiAssistant` persistée dans le store (avec timestamps ISO).
- **U2** : Backup chiffré AES-256-GCM (PBKDF2 600k iters) dans Settings.
- **U3** : Vue mobile responsive pour `Transactions` (card layout en `<ul>` mobile).
- **U4** : `SystemView` — remplace faux terminal par diagnostic réel basé sur l'état.

### I-series — Infrastructure
- **I1** : Mini-proxy Netlify Function remplace `api.allorigins.win` (SSRF-safe).

### R-series — Robustesse
- **R1** : ErrorBoundary par onglet (reset via `resetKey`).
- **R2** : AbortController dans `loadData` pour éviter race conditions sur sync API.
- **R3** : Helper `safeNumber` anti-NaN/Infinity + 13 tests.

### T-series — Tests
- **T1** : Tests moteur projection + régression barèmes 2026.
- **T4** : Validation Zod des réponses Gemini LLM (4 schémas).

### D-series — Données
- **D1** : Mise à jour barèmes fiscaux 2026 (ARC + Revenu Québec).

### F-series — Persistance
- **F5a/b/c/d** : Persistance des états locaux dans le store (ChildGoal, RealEstateGoal, ProjectionConfig).

### Autres
- F3 : Remplacement de `window.confirm`/`prompt` par modal React dans Settings.
- Migration Lunch Money → Era Context (auth, schémas, CSP).

---

## [Historique plus ancien]

Voir `docs/archive/RAPPORT_FIXES.md` et `docs/archive/AUDIT_REPORT.md` pour les sessions de hardening initiales.
