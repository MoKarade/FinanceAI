# BACKLOG — FinanceAI (actionnable)

> Liste **courte** de ce qui RESTE à faire. L'historique complet des items livrés est
> archivé dans [`docs/archive/BACKLOG_HISTORIQUE.md`](archive/BACKLOG_HISTORIQUE.md).
> Audit qualité détaillé (référence) : [`docs/AAA_AUDIT_2026-06.md`](AAA_AUDIT_2026-06.md).
> Actions humaines (Marc) : [`docs/A_FAIRE_MOI.md`](A_FAIRE_MOI.md).
>
> **Refonte « lean » : 2026-06-05.** Tests : ~1704 verts / 152 fichiers · tsc clean · build OK.

## Convention (cochage automatique)
- Chaque item Claude-faisable porte un **`[ID]`** entre crochets. Un commit `[ID] …` mergé sur
  `main` **coche l'item tout seul** (Action `backlog-autocheck`). Ne pas cocher à la main.
- Claude n'édite ce fichier que pour **ajouter** des items (découvertes). Les blocages humains
  vont dans `A_FAIRE_MOI.md`.
- Légende : 🔧 Claude · 🧭 décision Marc requise · 👤 action humaine (Marc) · ⏳ gros chantier.
- Les **tests manuels** (section 👤 ci-dessous) n'ont PAS d'`[ID]` → jamais auto-cochés (à toi).

---

## 🚨 P0 — Bloquant pour un vrai produit multi-utilisateurs
- [ ] **[P0-PROXY]** 🔧 Proxy backend pour la clé Anthropic (H3) : `services/claude.ts` utilise
  `dangerouslyAllowBrowser` (clé exposée navigateur — OK solo, inacceptable pour des tiers).
  Cible Vercel Edge (free tier). Claude code le proxy ; déploiement + secret = Marc.
- [ ] **[P0-IDB]** 🔧 Migrer la persistance `localStorage` → IndexedDB (quota ~5 Mo + parsing
  synchrone bloquant au boot). ⚠️ Migration du schéma persist v7 — vigilance corruption.
- [ ] **[P0-SYNC]** 👤 Prouver la sync Drive en réel : créer `VITE_GOOGLE_CLIENT_ID`, tester en
  fenêtre privée (cf `A_FAIRE_MOI` O3 + tests manuels ci-dessous).
- [ ] **[P0-AUTH]** 👤 Sortir de Cloudflare Access → gate Google in-app (ADR 010, `A_FAIRE_MOI` O1).

## 🧭 Décisions moteur (à trancher avec Marc — money-critical)
- [ ] **[ITEM-2A]** Indexation des paliers vs déflation : le fix « indexer par `simInflation` » a été
  **investigué et rejeté** (aggrave le cas dominant). Correctif propre = impôt sur revenu NOMINAL
  + paliers indexés (~12 sites, rebless baselines). Garder tel quel ou entreprendre le refactor ?
- [ ] **[ITEM-2C]** Gates de *timing* par conjoint (FERR 72 / reset REER 71 / bonus PSV 75+) :
  bloqués structurellement (pool REER ménage + âge principal unique). Fix propre =
  `computeRetirementIncome` per-conjoint de bout en bout (lourd). À planifier ou laisser ?
- [ ] **[B-AUDIT-5]** SRG inclus dans le revenu du clawback PSV (incorrect, mais bénéficiaire SRG
  sous le seuil → impact pratique ~0). Corriger pour la propreté si on y touche.
- [ ] **[H1]** Chiffrement `localStorage` au repos par passphrase (faible valeur isolée ; cascade
  IndexedDB chiffré). Décision Marc (risque : passphrase oubliée → recovery).

## 🧹 Grand nettoyage AAA — items ENCORE ouverts (réf. `AAA_AUDIT_2026-06.md`)
> D1 (money CF/M-*), D5 (robustesse), D6 (double-h1, focus tour), D9 (robustesse LLM/ingest) = ✅ **faits**
> (détail dans l'audit). Restent les gros chantiers à décision/risque :
- [ ] **[D3]** Design system : codemod des ~636 couleurs ad-hoc (`text-gray-*`, hex) → tokens
  (`ink-*`, `surface`, `success/warning`) + règle ESLint anti-régression. Raffine l'existant
  (dark + emerald), zéro changement d'apparence rendue.
- [ ] **[D4]** God-files : scinder par impact `Investments` (1154) → `FutureProjection` (969) →
  `Budget` (892) → `Transactions` (729) → `Dashboard` (621)… + **[D4-H2]** sélecteurs atomiques
  (App re-render sur tout slice non-`lastProjection` + prop-drilling via `TabRouter`).
- [ ] **[D6-SR]** Mode privé : le flou CSS laisse les montants **lisibles par lecteur d'écran**
  (fuite). Masquer le TEXTE quand le mode privé est actif (comme les graphes font déjà `***`),
  pas seulement flouter. Touche KPI/cellules de tableau/inputs.
- [ ] **[D7]** Perf boot : `hydrateAssets` (`App.tsx`) boucle `await sleep(2500ms)` séquentiel par
  symbole → 10 actifs = ~25 s. Paralléliser + cacher, garde-fous anti-rate-limit. Plus gros gain
  de fluidité ressenti.
- [ ] **[D6-KBD]** Sidebar hover-only : labels `opacity-0` focusables + `disabled` bloque
  l'accordéon clavier → rendre pilotable au clavier.
- [ ] **[D6-GRAPH]** Graphes sans alternative textuelle : table de données masquée / bouton « voir
  les données » sous chaque graphe (a11y).

## 🚀 [CIX] Couple/Individuel « 1000× » — grande initiative ⏳ (surtout ouverte)
> Fait : impôt par conjoint (revenu A1 + crédits B-AUDIT-3). Reste tout le reste.
- [ ] **[CIX-B]** FONDATION — propriété par personne : `owner` sur `Asset`/`Debt`/comptes +
  util `netWorthByOwner` + vue « Répartition par personne ». Additif, faible risque.
- [ ] **[CIX-A1B]** Impôt exact par conjoint **de bout en bout** (attribution rentes/retraits
  REER-FERR/DB/SRG par conjoint — exige des soldes REER/FERR par conjoint). Lourd, débloque le timing.
- [ ] **[CIX-A2]** Fractionnement du revenu de pension à la retraite (≤ 50 %).
- [ ] **[CIX-A3]** REER de conjoint (spousal RRSP) : cotiser au conjoint à plus bas revenu.
- [ ] **[CIX-A45]** Attribuer déductions au plus haut taux marginal + crédits transférables (frais
  médicaux, âge, conjoint).
- [ ] **[CIX-C]** Scénarios séparation (patrimoine familial QC) + décès (roulement REER/CELI,
  RRQ survivant 60 %, PSV cesse) + comparateur ensemble vs séparé.
- [ ] **[CIX-DE]** Optimiseur de couple (étend G21) + décaissement coordonné à 2 têtes (âges de
  retraite différents, demande RRQ/PSV optimale par personne).
- [ ] **[CIX-F]** Bascule couple↔individuel **sans perte** (mémoriser le conjoint) + avatars/couleurs.

## 🎨 P2 — UX & polish
- [ ] **[U5]** Export PNG du graphe « Évolution détaillée » (Dashboard).
- [ ] **[ICONS-FUT]** Icônes Futur exhaustives : une icône typée par événement moteur (transferts,
  hypothèque, ventes, RAP, REEE…) + **LOD/clustering** lié au zoom (`useTimeChartZoom`). Moyen-grand.
- [ ] **[ANIM]** Animations de qualité partout (chargements, navigation, KPIs, modales/listes) en
  CSS/WAAPI (pas de framer-motion), compositor-friendly, `prefers-reduced-motion`. Grand, à phaser.
  ⚠️ Piège connu (`index.css:222`) : un wrapper `transform` casse `position:fixed` → animer en opacité
  pure ou via portails.
- [ ] **[FUT-OPT]** Onglet Futur : déplacer toute l'optimisation (Verdict + `StrategyOptimizerPanel`
  + badge scénario) dans un 4ᵉ sous-onglet « Optimiseur » ; vue Graphique = courbe + KPIs seulement.
- [ ] **[RENTE-80]** Rente retraite « ~80 $ pendant quelques mois » : reproduire le persona/âge →
  trancher trou PSV (< 65) normal vs bug (prorata RRQ, split 0,65/0,35, affichage tooltip).

## 🛠️ Configuration & Système — retours Marc (2026-06-05)
- [x] **[CFG-PROFIL]** Onglet Configuration → Profil : **regrouper en UN seul ensemble cohérent**
  (Paramètres de retraite « hub central » + Configuration Utilisateurs/Salaires & Macro + Profils
  enregistrés + Mode de répartition) et **améliorer** la présentation.
- [x] **[CFG-COMPTES]** Onglet Configuration → Comptes : **regrouper** (Upload relevé de salaire IA +
  Soldes initiaux + Import CSV bancaire), **retirer le texte inutile**, améliorer.
- [x] **[CFG-SAUVE]** Onglet Sauvegarde : **en retirer le Mode test ET « Connecter à Claude »**
  (mauvais emplacement) → les déplacer (Mode test → Système/diagnostics ; Connecteur → sa propre carte).
- [ ] **[SYS-REGROUP]** Refonte page **Système & diagnostics** : tout regrouper, plus simple et propre
  (diagnostics AVEC le journal d'erreurs).
- [ ] **[SYS-ERRLOG]** Journal d'erreurs : **bouton « actualiser » manquant** (impossible de rafraîchir).
- [ ] **[SYS-AUDIT]** Journal d'audit **toujours à 0** → brancher `logAudit()` aux call-sites
  (import CSV, suppressions en lot, restauration backup…). Infra prête depuis #103, jamais câblée.
- [ ] **[SYS-WEB]** « Toile d'araignée » (interconnexions) **pas à jour** → la régénérer depuis l'état
  réel ou la retirer si plus pertinente.
- [ ] **[SYS-VERSION]** Vérifier que **Version & build** se tient bien à jour (`__APP_VERSION__`/
  `__GIT_SHA__`/`__BUILD_DATE__` via Vite define).
- [ ] **[NBA-PAGE]** « Prochaine action » : **sortir de la sidebar → page/onglet à part** (la sidebar
  ne devrait pas porter ce widget).

## ⚡🧪🔧 P2/P3 — Perf, tests, dette
- [ ] **[PERF-WK]** Profiler le worker projection (keystroke latency des sliders Futur).
- [ ] **[T3]** Couverture 64 → 80 % (composants lourds restants : Retirement/FutureProjection/ChildPlanning).
- [ ] **[T4]** Automatiser 20-30 tests manuels critiques en Playwright (depuis `MANUAL_TEST_CHECKLIST.md`).
- [ ] **[DT5]** Splitter le worker projection (projection / Monte Carlo / scénarios) si le moteur grossit.
- [ ] **[DT3]** Aligner totalement UI ↔ moteur `ChildPlanning` (cf B2).
- [ ] **[B3]** Early-exit de la bissection `findEarliestRetirementAge` (test ~30 s, pas critique).
- [ ] **[B4]** Audit des fichiers de test pour repérer les assertions obsolètes (structures internes changées).
- [ ] **[BIAIS-CAGR]** `startingBalancesFromHistory.ts` : le « rendement réel » compare 1er↔dernier
  point sans retirer les apports → surestime. Note UI ou exiger ≥ 3 ans.
- [ ] **[NONREG-LOSS]** `handleNonRegSale` ne modélise pas les pertes en capital NonReg (branche
  `capitalLossBank +=` inatteignable) → sous-estime l'efficacité fiscale en marché baissier.

## 🔭 Grosses initiatives — quasi terminées
- ✅ **Copilote d'argent** (onglet Futur, passé+présent+futur+optimiseur) : A1-A3, B1-B2, C1-C4
  **livrés**. Reste 👤 : valider le **passé réel** sur tes données + clé Finnhub.
- ✅ **Connecteur MCP** (Lots 0-3) : livré. Reste 👤 : héberger le `.mcpb` (cf `A_FAIRE_MOI` O2).
- ✅ Refonte graphs G1-G20, audit fiscal 2026, mode strict, centralisation : **livrés** (cf archive).

---

## 👤 Tests manuels en attente — SEULEMENT Marc (sans `[ID]`, jamais auto-cochés)
> Ce que Claude ne peut pas vérifier seul. Détail exhaustif : `docs/MANUAL_TEST_CHECKLIST.md`.

**Connecteur MCP (après hébergement du `.mcpb`)**
- [ ] Install 1 clic depuis la carte → Claude Desktop → « connecte mes finances » → vraies données.
- [ ] Auto-sync : appliquer une paie/un relevé dans Claude → rouvrir l'app → données à jour.

**Sync Drive (version fraîche : Unregister SW puis recharger)**
- [ ] Fenêtre privée → login Google → toutes les données reviennent (+ clés API).
- [ ] Reste connecté au refresh ; l'onboarding ne réapparaît pas ; « Dernière sync » se met à jour seule.
- [ ] Clés chiffrées : restauration sur un autre appareil ramène les clés (preuve que le `sub` déchiffre).

**Moteur / UX**
- [ ] Zoom molette + pan fluides (60 fps) sur tous les onglets graphiques.
- [ ] Pendant un (re)calcul Futur → écran « Calcul de ta projection… » (pas l'ancienne courbe).
- [ ] Salaire saisi (Onboarding/scan paie/TaxCenter) → affiché **mensuel cohérent** partout.
- [ ] Scénario chômage/invalidité → **moins d'espace REER** cette année-là + patrimoine REER final ≤.

---

## Comment maintenir ce backlog
1. **Ajouter** un item découvert → `- [ ] **[ID]** description` (l'`[ID]` permet l'auto-cochage).
2. **Ne pas cocher à la main** : un commit `[ID] …` sur `main` coche via `backlog-autocheck`.
3. Blocage humain → `A_FAIRE_MOI.md`. Audit large → `code-analyzer` (ajoute des items ici).
4. Priorité : **P0** → 🧭 décisions → grand nettoyage AAA → CIX → P2/P3 en rotation.
