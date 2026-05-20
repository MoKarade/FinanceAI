# Plan de Refonte UI — FinanceAI v3.0

> **Document source** : `MAJ_FinanceAI.txt` (2026-05-20) — directives utilisateur.
> **Audit complet** réalisé sur la base de code actuelle (post-PR #85, 412 tests).
> **Branche** : `claude/ui-refonte-v3` (depuis `claude/analyze-finance-app-CtLvs`).
> **Statut** : Plan validé, exécution Phase A en attente.

---

## 0. Vue d'ensemble

| | |
|---|---|
| **Périmètre** | 13 sections + 5 règles globales du document directives |
| **Phases** | 8 phases logiques (A → I), parallélisables par paires |
| **Effort estimé** | ~280-340h dev (4-6 semaines temps plein) |
| **Tests** | +80-100 tests prévus (412 → ~500+) |
| **Stratégie PR** | 1 PR par phase, draft par défaut, validation incrémentale |
| **Phase H** | **Différée** (Futur déjà avancé Phase C1, Transactions reste fonctionnel) |

### Règles globales (s'appliquent partout)

1. **Format nombres** : `1 111,55` (espace millier, virgule décimal) — `fr-CA` strict
2. **Style** : Professionnel, épuré (moins "cartoon")
3. **Langue** : 100% français — toggle FR/EN retiré
4. **Interconnexion** : Era AI synchronise dépenses/comptes/investissements automatiquement
5. **Version** : Affichage exact de la version (git SHA + date)

### Ordre d'exécution recommandé

```
A (fondations) ──────────────► [tout repose dessus]
                │
                ▼
C (Hub Config) ──────► D / D' (Home + Budget en //) ──┐
                                                       │
                       E (Investissement) ─────────────┤──► I (QA/tests)
                                                       │
                       F (Retraite + Immo + Enfant + LifeProjects) ──┤
                                                                     │
                       G (Impôts + Documents) ───────────────────────┘
                B (Navigation) ── à faire EN PARALLÈLE de A
                H (Futur, Transactions) ── reminders, hors scope
```

---

## Phase A — Fondations transverses (~18h)

Règles globales du document. Doit être fait en premier car toutes les autres phases en dépendent.

| # | Item | Fichiers cibles | Effort |
|---|---|---|---|
| A.1 | Format `1 111,55` centralisé via `utils/format.ts` (wrapper `formatCAD`, `formatNumber`, `formatPercent`) | nouveau `utils/format.ts` + sweep 28 fichiers utilisant `.toLocaleString()` | 6h |
| A.2 | Suppression toggle FR/EN | `components/Layout.tsx:277-283, 294` + `i18n.ts` lock `lng: 'fr'`, retirer LanguageDetector | 1h |
| A.3 | Style pro (moins "cartoon") | Sweep emojis dans labels sérieux, revue couleurs tokens (contrast AA) | 5h |
| A.4 | Version exacte | `vite.config.ts` define `__APP_VERSION__` (git SHA + date) ; remplace `v2.5 • Pro` hardcodé `Layout.tsx:191` | 2h |
| A.5 | Mode Couple = indicateur read-only global | `Layout.tsx` (badge 👥/👤) + sweep des togglers ailleurs (sauf Hub Config) | 4h |

**Tests** : +5 (format.ts unit tests, version constant exposé)

---

## Phase B — Navigation + Sidebar (Section 1) — ~22h

### B.1 — Sidebar cachée par défaut + reveal hover (8h)
- État actuel : `Layout.tsx:182` sidebar always-visible `w-72`.
- Transformer en sliding rail collapsé (64px, icônes seules) → expand au survol (288px, full labels) avec transition fluide <200ms.
- État local `isSidebarHovered` + CSS group-hover variant. Respect `prefers-reduced-motion`.

### B.2 — Sous-onglets clairs au clic (4h)
- État actuel : `Layout.tsx:46-84` regroupe déjà en 4 intentions (Argent/Plan/Objectifs/Outils) — Phase B1 du HANDOVER.
- Mais clic ne montre pas visuellement de "sous-arbre".
- Refonte : clic sur Argent → expand visuel des 3 enfants avec animation de hauteur. Visuel "tree".

### B.3 — Widget IA "Prochaine Meilleure Action" (6h)
- À supprimer : `Layout.tsx:91-220` (`getSmartMilestone()`, widget "prochain palier"/cible).
- À créer : `components/sidebar/NextBestAction.tsx` qui appelle Claude (Haiku 4.5) avec `lastProjection` + `buildEnrichedContext` Era → 1 action concrète.
- Exemples : "Ouvrir un CELIAPP avant le 31 déc.", "Vendre 3 actions Tesla", "Cotiser 5 000$ REER".
- Cache localStorage 1h, refresh manuel.

### B.4 — Nettoyage boutons (2h)
- Supprimer : `Layout.tsx:195` (info ℹ️), `:268-270` (Synchroniser), `:271-275` (PDF). Mobile : `:293, 295`.

### B.5 — Toggle Couple ici seulement (2h)
- Source : `state.config.users.length === 2`. UI explicite dans sidebar (sous le widget IA). Sync vers Hub Config.

### 💡 5 propositions IA — Section 1
1. **Sidebar "intent-search"** — Cmd+K déjà en place (PR #67), étendre à actions directes ("trouve mes dépenses Hydro >100$", "ajoute un voyage Paris")
2. **Sidebar contextuelle** — Widget propose 3 prochaines actions classées par impact $ estimé
3. **Sidebar "pinning"** — Drag-pin des onglets favoris (custom user order)
4. **Sidebar "comparator"** — Hover sur Investissement = mini-graphique 30j ; Budget = % consommé ; etc.
5. **Sidebar "alerts"** — Pastilles numériques sur onglets avec actions urgentes (Transactions = 12 non-catégorisées, etc.)

**Tests** : +10 RTL (sidebar hover/reveal, NextBestAction stub IA, sub-tabs expand, couple badge)

---

## Phase C — Hub Configuration (Section 13 — fondation pour D-G) — ~32h

### C.1 — Création onglet "Configuration" (10h)
- Fusion `Settings.tsx` (1049L) + `Onboarding.tsx` (256L) → `components/Configuration.tsx`.
- Navigation interne : sub-tabs **Profil / Comptes / Investissements / Goals / Sécurité / API Keys**.
- Onboarding devient une "première visite" guidée à travers ce hub.

### C.2 — Upload PDF/Image relevé de salaire avec IA (6h)
- Réutiliser `services/claude.ts:474` `analyzePayslip` (déjà utilisé TaxCenter).
- Étendre à pension, T4, relevé bancaire. Auto-fill `grossSalary`, `netSalary`, `taxDeduction`.
- Drop-zone dans section "Profil".

### C.3 — Migrer paramètres depuis Retraite vers Hub (6h)
- À déplacer (state local Retirement.tsx → store global) :
  - `currentAge` (`Retirement.tsx:69`)
  - `targetAge` (`:208`)
  - `lifeExpectancy` (`:52`)
  - `targetMonthlyIncome` (`:259`)
  - `governmentPension` (`:263`)
  - `rrqEstimateMonthly`, `psvEstimateMonthly`, `dbPensionMonthly`
- Migration store v4 → v5 dans `useFinanceStore.ts`.
- Retirement.tsx consomme désormais depuis store, n'expose que les sliders calculs (Goal Seeker).

### C.4 — Migrer tranches d'imposition vers Impôts
- Pas de travail dans phase C — fait en phase G.

### C.5 — Checklist données manquantes + redirects (8h)
- Hub affiche checklist : `hasLifeExpectancy ✓`, `hasTargetAge ✗`, etc.
- Composant `<MissingDataBanner field="lifeExpectancy" />` : remplace les erreurs "data not found" dans autres onglets.
- Bouton "→ Configurer" : `navigateWithFocus(TAB.CONFIG, 'lifeExpectancy')`.
- Étendre hook `usePendingFocus` (PR #61) à field-level focus.

### C.6 — Synchronisation Era au boot (2h)
- `useEffect` dans `App.tsx` : si token Era présent, appelle `buildEnrichedContext()` au mount.
- Pull silencieux transactions/comptes/investissements ; store local mis à jour si non-conflict.

**Tests** : +15 (hub navigation, payslip upload + AI extraction, missing-data redirects, store migration v4→v5)

---

## Phase D — Home (Section 2) — ~28h

### D.1 — Précision décimale globale (1h)
- `Dashboard.tsx:280` (diff $) ajouter `maximumFractionDigits: 2`.

### D.2 — Graphique zoom molette (10h)
- Refactor `components/dashboard/DashboardEvolutionChart.tsx` : retirer `<Brush>` (l.35).
- Custom `onWheel` handler → domaine X adaptatif + pan-on-drag.
- Multi-échelle : `tickFormatter` dynamique (heure <2j, jour <90j, mois <2a, année sinon).
- Composant générique `<ZoomableTimeChart>` réutilisé en E.5 et autres.

### D.3 — Multi-comptes toggle + vue Total (5h)
- État local `visibleAccounts: Set<string>` ; checkboxes au-dessus du chart.
- Vue "Compte Total" = agrégation activable/désactivable.

### D.4 — Stocks cliquables + multi-check + précision (6h)
- `Dashboard.tsx:374-399` : transformer la liste en table avec checkbox.
- Click sur 1 stock → drawer avec `<StockChart>`.
- Multi-check ≥2 → courbes superposées normalisées (PERFORMANCE base 100).
- Gain $/% depuis achat : si `Asset.dateBought` existe → calcul ; sinon "N/A" + lien vers Configuration.
- Limite intraday : Finnhub free tier = pas de tick. Documenter.

### D.5 — Supprimer Cash/Saving/Dette/Jalons (1h)
- Retirer `Dashboard.tsx:402-423`, `:425-449`, `:453-529`.

### D.6 — Indicateur santé paramétrable (3h)
- Nouveau `<HealthIndicator>` : score 0-100 calculé depuis ratios paramétrables (épargne/revenus, dette/actifs, taux FIRE).
- Tooltip explique les composantes et permet d'ajuster les poids.

### D.7 — Indicateur Futur (vérification) (1h)
- Déjà sync (`Dashboard.tsx:292-333` consume `lastProjection`).
- Tester que changement scénario MC dans Futur → Home reflète bien.

### D.8 — Passive + Active Income KPIs (1h)
- Ajouter Active Income KPI : `baseNetAnnual / 12` lissé.

### 💡 5 propositions IA — Section 2
1. **Anomalies live** — Bannière IA "Variation inhabituelle de 12% ce mois sur Épicerie"
2. **Insights contextuels** — Tooltip IA sur chaque KPI ("patrimoine progresse 2× plus vite que moyenne tranche d'âge")
3. **Compare-périodes** — Bouton "Comparer à mai 2025" overlay deux périodes
4. **Trajectoire prédictive** — Ligne pointillée IA projetant Net Worth 12 mois selon trend
5. **What-if rapide** — Slider "Si je dépense 200$/mois en moins" anime la trajectoire en live

**Tests** : +12 (ZoomableTimeChart, multi-comptes toggle, stock multi-check, HealthIndicator)

---

## Phase D' — Budget (Section 3) — ~28h

### D'.1 — Synchro absolue catégories ↔ Transactions (10h)
- Source unique : nouveau store field `state.categories: Category[]` (déplacer depuis `constants.ts:INITIAL_BUDGET`).
- `BudgetGroupTable.tsx` lit depuis store. Ajout catégorie → injecté dans Transactions allowedCategories + Era.
- Suppression : si utilisée par transactions, modal warning.
- Categorizer Claude Haiku reçoit liste à jour.

### D'.2 — Cohérence prévisions (3h)
- Budget prévu = `categories.reduce((s, c) => s + c.target * c.multiplier, 0)`. Éliminer toute discrepancy.

### D'.3 — Santé financière (Impôts) — vraies tranches (3h)
- Intégrer `calculateAnnualIncomeTax()` de `utils/tax.ts` (au lieu de simple Brut-Net).
- Affiche : fédéral / QC / RRQ / AE / RAMQ / FSS vs Brut.

### D'.4 — Filtres Mois/Année + Personne A/B/combiné (5h)
- Selector au-dessus des KPIs : période + (si couple) personne.
- Filtre sur catégories Perso 1 / Perso 2 / Commun.
- Mode individuel : sélecteur Personne masqué.

### D'.5 — Tuiles fusionnées prévu/réel (4h)
- Refonte 4-KPI strip en 4 tuiles riches :
  - Budget prévu / réel
  - Revenus prévus / réels
  - Dépenses prévues / réelles
  - Restant prévu / réel
- Visuel : valeur principale + secondaire + % écart + mini-sparkline.

### D'.6 — Historique mois passé (2h)
- Sélecteur "Voir mois précédent" : remplit tuiles avec données M-1, M-2, etc.

### D'.7 — Diagnostic IA fluide streaming (3h)
- Migrer `analyzeBudgetAI` `chat()` one-shot → `chatStream()` (déjà utilisé AiAssistant).
- Recos qui apparaissent une par une dans BudgetAiModal.
- Validation temps réel pendant édition (debounce 1s) : signale anormaux (>2σ historique).

### 💡 5 propositions IA — Section 3
1. **Auto-budget IA** — "Génère mon budget" propose targets selon historique 6 mois
2. **Optimisation Besoin/Envie/Épargne** — IA suggère rééquilibrage 50/30/20 si déviance
3. **Catégorisation prédictive** — Nouvelle catégorie → IA propose nature + target
4. **Alertes contextuelles** — "Restaurant +40% ce mois" → cap suggéré
5. **Coaching mensuel** — Récap fin de mois : 3 succès + 3 axes d'amélioration

**Tests** : +12 (categories store sync, tuiles prévu/réel, IA streaming, filtres couple)

---

## Phase E — Investissement (Section 4) — ~36h

### E.1 — Time-control global (3h)
- Selector unique en haut de page synchronise tous les sous-composants.

### E.2 — Live prices à l'ouverture (4h)
- `useEffect` au mount fetch `getQuote()` pour chaque holding via `services/marketData/`.
- Indicateur "Mis à jour il y a 12s" + bouton refresh.
- Rate limit Finnhub 60/min → batch.

### E.3 — Sous-onglets (4h)
- 4 sub-tabs : Vue d'ensemble / Allocation / Rééquilibrage / Détail portefeuille.
- Convertir les CollapsibleSection actuelles (Investments.tsx:521, 643, 782).

### E.4 — Portefeuille 2066 = copie exacte FUTUR (4h)
- Au lieu d'extraire `horizonSnapshot` (Investments.tsx:83-96), consommer toute `chartData[]` de `lastProjection` filtrée par accountType.
- Render même structure visuelle que FUTUR.

### E.5 — Graphique zoom molette (réutilise D.2) (2h)
- Refactor `StockChart.tsx` pour utiliser `<ZoomableTimeChart>`.

### E.6 — Geo/Sectorielle interactive (5h)
- `Investments.tsx:531-589` : `onClick={(data) => setFilter(data.sector)}` aux PieChart segments.
- Stocks filtrés affichent gains $/% pour période sélectionnée.

### E.7 — Rééquilibrage avec justification IA (4h)
- Étendre `Investments.tsx:643-774` : chaque action BUY/SELL avec 1 phrase IA ("Réduire Tesla car >15% du portefeuille").
- Appel Claude Haiku ; cache localStorage 30min.

### E.8 — Portefeuille détaillé multi-achat DCA (6h)
- Refactor `Asset` type (types.ts:18-34) : `purchases: Array<{date, quantity, price}>`.
- Migration store v5 → v6 : `dateBought + buyPrice + quantity` → `purchases: [{...}]`.
- Garder `dateBought` deprecated pour rétrocompat 1 cycle.
- UI : table par stock affichant chaque achat + variations (origine, 24h, 1s, 1m, 3m, 6m, 1a) + poids %.

### E.9 — Ajout manuel actions (4h)
- Nouveau `<AddStockForm>` : input ticker (autocomplete Finnhub `searchSymbol`), courbe historique, formulaire date+quantité, suggestion prix `getHistory()`, override manuel.

### 💡 5 propositions IA — Section 4
1. **Suggestion d'achat IA** — "8 000$ en cash, voici 3 actions sous-évaluées en ligne avec profil" (justifications + scoring)
2. **Détection drift** — Alerte allocation dérive >5% cible
3. **Tax-loss harvesting** — IA repère actions en perte pour vente fin-année
4. **Risk score** — Volatilité, concentration, beta + recommandations
5. **News digest IA** — Résumé hebdo IA par holding (impacts probables)

**Tests** : +15 (multi-achat DCA, AddStockForm, geo/sectorielle click, rééquilibrage IA, store migration v5→v6)

---

## Phase F — Retraite + Immobilier + Enfant + Projets de vie — ~40h

### Retraite (Section 5) — 14h

| # | Item | Effort |
|---|---|---|
| F.1 | Migrer params vers Hub (couvert C.3) | 0h |
| F.2 | Migrer tranches → Impôts (couvert G.3) | 0h |
| F.3 | Sync absolue graphique + flux + Goal Seeker = FUTUR (capital au cent) | 5h |
| F.4 | Asset Location développé (CELI vs REER vs NonReg par tranche) | 5h |
| F.5 | Désencombrer design (38k → ~20k via extraction) | 4h |

### 💡💡 5 propositions IA — Section 5
1. **Optimiseur fiscal retraite** — IA détermine ordre optimal décaissement (REER→CELI→NonReg) min impôts cumulés
2. **Stress test décès conjoint** — Simulation impact financier
3. **Mode "longevity"** — Recalcul si vit jusqu'à 100 ans (+20% espérance)
4. **Bridge-pension** — Détecte si compte manque pour pont 55-65, propose stratégie
5. **Coaching pré-retraite** — 5 ans avant cible, checklist IA (consolidation REER, OAS, RRQ timing)

### Immobilier (Section 6) — 10h

| # | Item | Effort |
|---|---|---|
| F.6 | Indicateur activation FUTUR (déjà l.233) — renforcer | 1h |
| F.7 | Scénarios cross-link rendement stocks (coût d'opportunité dynamique) | 4h |
| F.8 | Précision frais annexes accrue + conseils IA poussés | 5h |

### 💡 5 propositions IA — Section 6
1. **Optimiseur amortissement** — IA suggère 25 vs 30 ans (impact intérêts vs cashflow)
2. **Rente vs vente** — À 65 ans, garder ou vendre ? Simulation 20 ans
3. **HELOC stratégique** — Détecter opportunités de levier (Smith Manoeuvre)
4. **Refinancement timing** — IA monitore taux + alerte si refi avantageux
5. **Quartier risk score** — Historique prix 10 ans + tendances locales

### Enfant (Section 7) — 8h

| # | Item | Effort |
|---|---|---|
| F.9 | Indicateur activation FUTUR (déjà l.264) — uniformiser avec Immobilier | 1h |
| F.10 | Coûts par âge + REEE sync FUTUR (vérifier précision) | 4h |
| F.11 | Design pro (réduire ~34k → ~22k) | 3h |

### Voyage + Life Events → "Projets de vie" (Section 8) — 8h

| # | Item | Effort |
|---|---|---|
| F.12 | Unifier `travelGoals` + `lifeEvents` en `lifeProjects[]` avec champ `type` | 4h |
| F.13 | Supprimer Tab.TRAVEL, route forward vers Tab.LIFE_PROJECTS | 1h |
| F.14 | Refonte UI ergonomique (timeline drag-drop unifiée + form simplifié) | 3h |

**Tests** : +20 (Asset Location strategies, Buy vs Rent cross-link, REEE precision, LifeProjects fusion)

---

## Phase G — Impôts + Documents + Dettes/Planning prep — ~20h

### G.1 — Nouvel onglet "Documents" global (6h)
- Nouveau `components/Documents.tsx` + `Tab.DOCUMENTS`.
- Stockage : nom, type (T4, paie, contrat, autre), date, blob (IndexedDB pour >1MB), extraction IA si applicable.
- Migrer upload de `TaxCenter.tsx:199-209`.

### G.2 — TaxCenter : retrait upload + intégration tranches (4h)
- Supprimer `<input type="file">` de TaxCenter.
- Intégrer `TaxBracketViz` (déplacé depuis Retirement) en édition : sliders par tranche, paramétrable par année via indexation 2% existante.

### G.3 — Graphiques imposition ultra-précis (5h)
- Décomposition visuelle : fédéral / QC / RRQ / AE / RAMQ / FSS empilés vs revenus bruts par mois.
- Comparaison tranches 2026 vs projection 2030/2040.

### G.4 — Mode Couple : optimisation fiscale croisée IA (4h)
- Si 2 users : IA simule allocation REER (revenus inégaux), pension splitting, transfert crédits.
- Output : "Si user1 cotise 4 000$ REER, économie totale couple = 1 800$".

### G.5 — Prep Dettes/Planning → sous-onglets Transactions (1h)
- Pas d'implémentation, juste préparation architecturale (commentaires TabRouter, types prêts).

**Tests** : +10 (Documents IndexedDB, tax sliders, couple fiscal optimization IA)

---

## Phase H — Futur + Transactions (différé)

- **H.1 Futur** : déjà avancé Phase C1 (PR #54). Document "gros chantier" à planifier post-refonte (phase J future).
- **H.2 Transactions** : reste fonctionnel. Ajustements visuels seulement (alignement style pro).

---

## Phase I — QA, tests, polish — ~30h

- Tests RTL nouveaux composants (Configuration, NextBestAction, ZoomableTimeChart, HealthIndicator, LifeProjects, Documents, AddStockForm) — ~30 tests
- Tests intégration : sync catégories Budget↔Transactions, migration v5/v6, missing-data redirects — ~15 tests
- A11y : axe-core sur nouvelles pages
- Mobile 360px validation manuelle
- Performance : audit chunks (bundle size), lazy-load Documents tab
- Migration store v4 → v5 (Configuration) → v6 (multi-achat DCA)

---

## Risques & points d'attention

1. **Migration store v4 → v6** — Risque corruption. Backup obligatoire, tests régression Zod.
2. **Sync catégories Budget↔Transactions** — Breaking pour users avec catégories custom. Migration soft (merge).
3. **Suppression FR/EN** — Users EN basculés en FR (locale fallback). Soft.
4. **Documents global** — Blobs localStorage limit ~5-10MB → IndexedDB obligatoire.
5. **Live prices Finnhub** — Free tier 60 req/min. Batch + cache 60s.

---

## Synthèse effort par phase

| Phase | Effort | Tests | Statut |
|---|---|---|---|
| A. Fondations | 18h | +5 | À démarrer |
| B. Navigation | 22h | +10 | Parallèle de A |
| C. Hub Config | 32h | +15 | Après A |
| D. Home | 28h | +12 | Après C |
| D'. Budget | 28h | +12 | Après C, parallèle de D |
| E. Investissement | 36h | +15 | Après D |
| F. Retraite+Immo+Enfant+LifeProjects | 40h | +20 | Après C |
| G. Impôts+Documents | 20h | +10 | Après C |
| H. Futur+Transactions | DIFFÉRÉ | - | Hors scope |
| I. QA tests | 30h | +15 | Continu |
| **TOTAL** | **~254h (sans H)** | **+114** | |

Tests projetés : 412 (actuel) + 114 = **~526 tests**.

---

## Décisions validées (2026-05-20)

- ✅ Plan stocké dans `docs/PLAN_REFONTE_UI.md`
- ✅ Branche `claude/ui-refonte-v3` créée
- ✅ Ordre A→I respecté
- ✅ Phase H différée

---

> **Next step** : commencer Phase A (utils/format.ts + suppression FR/EN + version display + couple badge global). Validation utilisateur attendue.
