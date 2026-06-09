# BACKLOG — FinanceAI (actionnable)

> Liste **courte** de ce qui RESTE à faire. L'historique complet des items livrés est
> archivé dans [`docs/archive/BACKLOG_HISTORIQUE.md`](archive/BACKLOG_HISTORIQUE.md).
> Audit qualité détaillé (référence) : [`docs/AAA_AUDIT_2026-06.md`](AAA_AUDIT_2026-06.md).
> Actions humaines (Marc) : [`docs/A_FAIRE_MOI.md`](A_FAIRE_MOI.md).
>
> **Dernière mise à jour : 2026-06-09.** Tests : 1782 verts / 154 fichiers · tsc clean · build OK.

## Convention (cochage par Claude au merge)
- Chaque item Claude-faisable porte un **`[ID]`** entre crochets. **Claude coche lui-même**
  l'item au moment du merge de la PR qui le livre (l'Action `backlog-autocheck` a été retirée —
  choix Marc, 2026-06-09).
- Claude édite ce fichier pour **cocher** (au merge) et **ajouter** des items (découvertes).
  Les blocages humains vont dans `A_FAIRE_MOI.md`.
- Légende : 🔧 Claude · 🧭 décision Marc requise · 👤 action humaine (Marc) · ⏳ gros chantier.
- Les **tests manuels** (section 👤 ci-dessous) n'ont PAS d'`[ID]` (à Marc).

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

## 💰 Audit fiscal + moteur 2026-06-09 (3 agents : fiscal-accuracy, projection-validator, code-analyzer)
> 0 BLOCKER. Socle exact (barèmes/BPA/RRQ/RAMQ/FSS/FERR/retenues conformes au doc). Détails dans les
> rapports d'agents (session 2026-06-09). Chaque correctif fiscal = code + FISCAL_REFERENCE même PR.
- [ ] **[FA-1]** 🔧 Assiette du crédit pension (féd 31400 + QC 361) inclut RRQ/PSV à tort
  (`taxDecember.ts:362-364`) — ARC/RQ les EXCLUENT. Restreindre à DB + FERR 72+. **Non conservateur**
  (~250-680 $/an/personne 65+). Le plus systémique des findings.
- [ ] **[FA-2]** 🧭 Clawback PSV : revenu FAMILIAL comparé au seuil INDIVIDUEL (`taxDecember.ts:39-44`)
  → clawback fictif jusqu'à ~14 k$/an pour un couple 95-190 k$ (conservateur mais massif).
  Calculer par conjoint (les décompositions per-user existent) ou documenter en §9.
- [ ] **[FA-3]** 🧭 SRG : (a) imposé à tort (non imposable) ; (b) clawback ignore retraits REER/gains
  → SRG fictif jusqu'à ~13 k$/an en scénario FIRE bas revenu (`retirementIncome.ts:206-220`). **Non
  conservateur** (b).
- [ ] **[FA-4]** 🔧 CELI dupliqué : `taxJanuary.ts:89-92` recalcule 7000×inflation au lieu de lire
  `CELI_ANNUAL_LIMITS` (2027 : 7 000 vs 7 500 au doc). Brancher sur la source unique.
- [ ] **[FA-5]** 🔧 NPV rentes succession : `governmentPension × 0,65 × activeUsersCount`
  (`estateCalculation.ts:144-145`) alors que le moteur le traite déjà comme FAMILIAL → ×N en double,
  `estateNetWorth` couple gonflé de dizaines de k$.
- [ ] **[FA-6]** 🧭 Dons charitables : crédit 33 % + relief gains 15 % en dur non sourcés
  (`w5Effects.ts:98-101`). Sourcer au doc (vrai barème ~48-53 % > 200 $ ; don de titres = inclusion 0 %).
- [ ] **[FA-7]** 🔧 Transcrire le §8 immobilier dans FISCAL_REFERENCE (OSFI, SCHL, primes, TPS/TVQ
  neuf, taxes de bienvenue 2025/2026, HELOC 65 %) — valeurs déjà dans le code, doc en retard.
- [ ] **[FA-8]** 🔧 Lot mineurs fiscaux : taux clawback 0,15 nommé+sourcé · cap clawback sans facteur
  de report · prorata RRQ 39 ans / PSV 10-40 ans au doc · split 65/35 documenté · SystemView barèmes
  composés depuis les constantes (`SystemView.tsx:102`) · assiette dividendes vs gains cohérente ·
  retenue US 15 % sourcée · libellé FSS 2025/2026 · retenue FERR (`taxJanuary.ts:185`) passe encore
  le revenu TOTAL en `eligiblePensionIncome` (impact ≈0, réconcilié en décembre — aligner sur FA-1) ·
  `calculateCeliRoom` fallback `|| 7500` non indexé > 2030 (unifier avec l'extrapolation taxJanuary) ·
  `setupSimulation.ts:169` `inflationRate || 2.0` masque le 0 légitime (→ `??`) ·
  NPV estate lit `governmentPension` même quand `rrqEstimateMonthly` est fourni (divergence silencieuse).
- [ ] **[PV-1]** 🔧 Liquide négatif effacé silencieusement : débits directs (impôt d'avril, W5) peuvent
  rendre `liquid < 0`, puis `applyMidMonthGrowth` clampe à 0 (`helpers.ts:54`) = dette fiscale effacée.
  Garde explicite (cascade de vente ou dette comptée) + test de conservation couvrant avril.
- [ ] **[PV-2]** 🔧 Récolte de gains ignore `capitalLossBank` (impôt payé sur gains compensables —
  conservateur, sous-optimal).
- [ ] **[PV-3]** 🔧 Fractionnement : le transfert n'alimente pas le crédit pension du RÉCIPIENDAIRE
  (ARC 31400 l'admet) — conservateur.
- [ ] **[PV-4]** 🔧 Tests des clamps hors-bornes `rrqStartAge` (55→60, 80→72) / `psvStartAge`.

## 🧽 Audit code 2026-06-09 (code-analyzer) — dette actionnable
- [ ] **[CA-01]** Code mort utils/ : `csvExport.ts` (109 l) + `safeNumber.ts` (30 l) entiers +
  exports orphelins (addPurchase/removePurchase, formatMonthYear, formatCompactCAD,
  getHasUserDataSnapshot). Confirmer via `npm run knip` avant suppression. (S)
- [ ] **[CA-02]** Unifier le formatage monétaire : 11 helpers locaux divergents (« 1 234$ » vs
  « 1 234,00 $ »…) → `formatCAD` de `utils/format.ts` ; résorber ~135 `toLocaleString`. (M)
- [ ] **[CA-03]** Finaliser la migration `utils/tax.ts` (820 l) → `services/tax.ts` (alias 5 l
  inachevé, ~20 imports directs restants). (S)
- [ ] **[CA-04]** Smoke tests composants money-critical sans test direct : Investments (1187 l),
  FutureProjection (1000), RealEstate, Retirement, TaxCenter, ChildPlanning, DebtManager, AiAssistant. (M)
- [ ] **[CA-05]** Découper `Investments.tsx` (1187 l, +33) sous `components/investments/`. (L)
- [ ] **[CA-06]** Découper `FutureProjection.tsx` (1000 l) + centraliser ses 32 hex dans
  `chartColors`. (L)
- [ ] **[CA-07]** Tokens couleur : `constants/chartColors.ts` (source Recharts), 20 hex en className
  à bannir, 247 classes palette brute → tokens sémantiques. (Le « ~636 text-gray » du D3 est réglé :
  0 restant.) (M)
- [ ] **[CA-08]** Primitives `ui/Input`, `ui/Select`, `ui/Field` (label+erreur+aria) + migrer les
  hotspots (AdvancedProjectionParams 40 inputs, PatrimoineExtended 19, Onboarding 11,
  ProjectionControls 10). (M)
- [ ] **[CA-09]** Découper `services/pdfReport.ts` (847 l) et `services/claude.ts` (768 l) ; évaluer
  l'extractible restant de `projection.ts` (1387 l). (L)
- [ ] **[CA-10]** Tests manquants : `usePastPortfolioHistory` (alimente FutureProjection — priorité),
  assetMeta, analytics, usePwaInstallPrompt. (S)

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
  pas seulement flouter. Touche KPI/cellules de tableau/inputs. (Re-confirmé par `a11y-auditor`
  2026-06-09 : systémique, AUCUN `privacy-blur` du codebase n'est masqué aux SR.)
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

## 🎨 Épuration UI — directives Marc 2026-06-09 (ordre validé)
> Ordre : [UI-SCEN] plans de base → [UI-EPURE] épuration → [U5] → lot a11y (D6) → [ICONS-FUT].
- [ ] **[UI-SCEN]** 🧭 **Enlever les « plans de base » (scénarios du Futur)** : 11 simulations
  complètes recalculées à CHAQUE changement de paramètre (5 plans de gestion « Le Plan de Base /
  CELI d'abord / REER d'abord / fonte du REER / Achat sans RAP » + 6 stress-tests) pour alimenter
  le sélecteur de cartes + bandeau Verdict — redondant avec l'onglet Optimisation. Cible proposée :
  stratégie de retrait = simple paramètre (select), stress-tests = à la demande dans Optimisation,
  moteur ne calcule QUE le scénario réaliste par défaut (sliders ~10× plus rapides). Périmètre exact
  à confirmer avec Marc.
- [ ] **[UI-EPURE]** 🔧 Audit visuel global de CHAQUE onglet (Futur→Paramètres, Dashboard,
  Configuration en premier — retours Marc) → plan d'épuration : sections à fusionner/retirer,
  textes à couper, hiérarchie. Livrer le plan AVANT de toucher l'UI.

## 🎨 P2 — UX & polish
- [ ] **[U5]** Export PNG du graphe « Évolution détaillée » (Dashboard).
- [ ] **[ICONS-FUT]** Icônes Futur exhaustives : une icône typée par événement moteur (transferts,
  hypothèque, ventes, RAP, REEE…) + **LOD/clustering** lié au zoom (`useTimeChartZoom`). Moyen-grand.
- [x] **[ANIM]** Animations de qualité partout (chargements, navigation, KPIs, modales/listes) en
  CSS/WAAPI (pas de framer-motion), compositor-friendly, `prefers-reduced-motion`. Grand, à phaser.
  ⚠️ Piège connu (`index.css:222`) : un wrapper `transform` casse `position:fixed` → animer en opacité
  pure ou via portails.
- [x] **[FUT-OPT]** Onglet Futur : optimisation déplacée dans le sous-onglet « Optimisation »
  (4 onglets Graphique/Paramètres/Optimisation/Plan d'action + écran d'amorçage, #213) ; Robustesse
  + Optimiseur fusionnés en un outil « Comparer les stratégies » 2 modes (#215).
- [x] **[RENTE-80]** Rente retraite « ~80 $ » : cause = rentes couplées à l'âge d'arrêt. Réglé par
  le découplage moteur (`rrqStartAge`/`psvStartAge`, RRQ jusqu'à 72, #210) + UI âge de début des
  rentes dans l'onglet Retraite (#214). 👤 À valider sur ton persona (tests manuels ci-dessous).

## 🛠️ Configuration & Système — retours Marc (2026-06-05)
- [x] **[CFG-PROFIL]** Onglet Configuration → Profil : **regrouper en UN seul ensemble cohérent**
  (Paramètres de retraite « hub central » + Configuration Utilisateurs/Salaires & Macro + Profils
  enregistrés + Mode de répartition) et **améliorer** la présentation.
- [x] **[CFG-COMPTES]** Onglet Configuration → Comptes : **regrouper** (Upload relevé de salaire IA +
  Soldes initiaux + Import CSV bancaire), **retirer le texte inutile**, améliorer.
- [x] **[CFG-SAUVE]** Onglet Sauvegarde : **en retirer le Mode test ET « Connecter à Claude »**
  (mauvais emplacement) → les déplacer (Mode test → Système/diagnostics ; Connecteur → sa propre carte).
- [x] **[SYS-REGROUP]** Refonte page **Système & diagnostics** : tout regrouper, plus simple et propre
  (diagnostics AVEC le journal d'erreurs).
- [x] **[SYS-ERRLOG]** Journal d'erreurs : bouton « Rafraîchir » présent (`ErrorLogViewer.tsx`,
  refreshKey). Vérifié 2026-06-09 — était livré mais jamais coché.
- [x] **[SYS-AUDIT]** Journal d'audit **toujours à 0** → brancher `logAudit()` aux call-sites
  (import CSV, suppressions en lot, restauration backup…). Infra prête depuis #103, jamais câblée.
- [x] **[SYS-WEB]** « Toile d'araignée » : **retirée** (option « la retirer si plus pertinente » —
  `SystemView.tsx:156`). Vérifié 2026-06-09.
- [x] **[SYS-VERSION]** Version & build : branché sur Vite define (`vite.config.ts:31-33` →
  `BUILD_INFO` SystemView), auto-tenu à jour à chaque build. Vérifié 2026-06-09.
- [x] **[NBA-PAGE]** « Prochaine action » : **sortir de la sidebar → page/onglet à part** (la sidebar
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
- [ ] Rentes (fix #210/#214) : sur ton profil, vérifier que RRQ/PSV démarrent aux âges choisis
  dans Retraite (indépendants de l'âge d'arrêt) et que le « ~80 $/mois » a disparu.
- [ ] Mode test (fix #217) : switch de persona → AUCUNE donnée de l'ancien ; reload → la bannière
  orange reste ; « Désactiver » → tes vraies données reviennent.
- [ ] Refonte Futur (#213-#216) : les 4 sous-onglets te conviennent ? L'écran « Calculer ma
  projection » au premier passage ? La checklist du Plan d'action (cases + « Pourquoi ? ») ?
- [ ] Zoom molette + pan fluides (60 fps) sur tous les onglets graphiques.
- [ ] Pendant un (re)calcul Futur → écran « Calcul de ta projection… » (pas l'ancienne courbe).
- [ ] Salaire saisi (Onboarding/scan paie/TaxCenter) → affiché **mensuel cohérent** partout.
- [ ] Scénario chômage/invalidité → **moins d'espace REER** cette année-là + patrimoine REER final ≤.

---

## Comment maintenir ce backlog
1. **Ajouter** un item découvert → `- [ ] **[ID]** description`.
2. **Cocher au merge** : Claude coche l'`[ID]` quand la PR qui le livre est mergée (+ réf PR).
3. Blocage humain → `A_FAIRE_MOI.md`. Audit large → `code-analyzer` (ajoute des items ici).
4. Priorité : **P0** → 🧭 décisions → grand nettoyage AAA → CIX → P2/P3 en rotation.
