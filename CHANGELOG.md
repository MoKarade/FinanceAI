# Changelog

Toutes les modifications notables apportées au projet sont documentées ici.

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

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
