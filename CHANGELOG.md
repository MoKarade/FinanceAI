# Changelog

Toutes les modifications notables apportées au projet sont documentées ici.

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

---

## [unreleased] — Branche `claude/analyze-finance-app-CtLvs`

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
