# BACKLOG — FinanceAI (actionnable)

> Liste de ce qui RESTE à faire — refonte complète 2026-07-31 (demande Marc) : chaque item
> vérifié contre le code réel (2 agents, preuve fichier:ligne) avant d'entrer ici.
> Tâches finies + validées → [`docs/BACKLOG_ARCHIVE.md`](BACKLOG_ARCHIVE.md) (créé 2026-07-31).
> Historique ancien : [`docs/HISTORIQUE.md`](HISTORIQUE.md). Actions humaines : [`docs/A_FAIRE_MOI.md`](A_FAIRE_MOI.md).

## Convention (règles Marc 2026-07-31, NON négociables)
- **CHAQUE tâche a une case `- [ ]`** — aucune puce de tâche sans case. Une note/décision sans
  travail à faire n'est pas une tâche : elle va en archive ou dans decisions.md.
- **Tenu à jour à CHAQUE push** : cocher les items livrés dans la PR même, ajouter les découvertes.
- **Archivage** : un item coché + validé (mergé sur main, gate vert) DÉMÉNAGE vers
  `BACKLOG_ARCHIVE.md` (avec date + PR) au plus tard à la PR suivante — le BACKLOG ne garde que le vivant.
- Chaque item Claude-faisable porte un **`[ID]`**. Claude coche lui-même au merge.
- Légende : 🔧 Claude · 🧭 décision Marc requise · 👤 action humaine (Marc) · ⏳ gros chantier ·
  (S/M/L) = effort. Les tests manuels (section 👤) n'ont pas d'`[ID]`.

---

## Plan d'exécution (vagues)

> Ordre PM en cours d'établissement (analyse 2026-07-31 : PM + code-analyzer + financial-integrity
> en vol). Sera remplacé par les vagues priorisées ; en attendant, l'ordre des sections ci-dessous
> reflète la priorité par défaut : money-critical → sync/données → UX confiance → a11y/perf → dette → gros chantiers.

---

## 🔴 Money-critical — fiabilité des chiffres

- [ ] **`[NONREG-LOSS]`** (M, money-critical, CONFIRMÉ vérif 2026-07-31) — les pertes en capital
  NonReg sont inatteignables : `portfolioOps.ts:70` `proportion = Math.min(1, ACB/nonReg)` ⇒
  `costBasis ≤ sold` ⇒ `rawGain ≥ 0` — la branche perte d'`applyCapitalDisposition` (livrée pour
  l'immo, FISC-RE-CAPITAL-LOSS) n'est jamais exercée par une vente NonReg → sous-estime l'efficacité
  fiscale en marché baissier. Fix : retirer le cap pour réaliser la perte. ⚠️ Discriminant git-stash
  + panel obligatoires.
- [ ] **`[FISC-SOLO-INVEST-SPLIT]`** (M, money-critical, 🧭 validation Marc — change les chiffres) —
  `mcp/tools/getTaxSituation.spec.ts:64` : `splitRatio = 1/users.length` répartit le revenu de
  placement imposable également entre conjoints au lieu des contribuables RÉELS → sous/sur-imposition
  selon qui détient quoi. Splitter par détention réelle (owner), app+MCP.
- [ ] **`[MCP-TAX-FHSA-BALANCE]`** (S, money-critical) — `getTaxSituation.spec.ts:78` passe
  `u.fhsaBalance` (SOLDE) à `calculateFiscalReport` en position COTISATION annuelle → déduction
  CELIAPP surévaluée dès que le solde dépasse le plafond annuel. Champ cotisation dédié ou clamp.
- [ ] **`[WHT-DISPLAY-MELTDOWN]`** (S, affichage seulement) — `projection.ts:1348-1354` : la retenue
  REER du meltdown est provisionnée (NW correct) mais absente du compteur d'affichage
  `totalTaxesPaid` (`rrspWithholdingMois`) → sous-estime l'impôt affiché en stratégie MELTDOWN_REER.
  ⚠️ Change le ranking de stratégies + golden → discriminant + mesure obligatoires.
- [ ] **`[FISC-RRSP-PRE2010-FALLBACK]`** (S) — `utils/tax.ts:585-588` : plafond REER 2025 (32 490 $)
  appliqué aux années < 2010 (anachronique, réel ~16,5 k$ en 2005) → sur-estime les droits REER des
  vieux profils à hauts salaires. Étendre la table ou extrapoler à la baisse.
- [ ] **`[FISC-LINE361-PERCONJOINT-REDUC]`** (M, money-critical) — `taxDecember.ts:~530` : la
  réduction 18,75 % de la ligne 361 QC est appliquée PAR conjoint avec le revenu familial TOTAL →
  possible double-comptage dans la bande de réduction partielle. ⚠️ Vérifier la structure réelle de
  l'Annexe B AVANT de coder (réduction sur le total ménage vs per-déclaration).
- [ ] **`[FISC-REEE-AIP-MODEL]`** (M) — `childrenReee.ts` : impôt PRA 20 % appliqué au SOLDE TOTAL
  du REEE à la fermeture au lieu de la seule portion revenu accumulé + surtaxe en sus de l'impôt
  ordinaire. Approximation marquée ; raffiner = séparer cotisations/gains.
- [ ] **`[PV-11e]`** (S, test) — pinner par un test le micro-réalignement per-conjoint dans la
  fenêtre couple inégal + goal REER + cotisation REER le même mois (`stepReerByUser`).
- [ ] **`[NW-PARITY-SURFACES-TEST]`** (S-M, garde-fou keystone audit 2026-06-17) — étendre
  `tests/services/nwParity.test.ts` (aujourd'hui moteur↔computePresentNetWorth) aux surfaces
  UI/IA/PDF (KPI Accueil, useDerivedFinancials, financialSnapshot, pdfReport) sur persona endetté +
  propriétaire, convention équité immo EXPLICITE par surface.
- [ ] **`[NW-ASSETBREAKDOWN-DRY]`** (M — PAS un quick win, analyse 2026-06-18) —
  `utils/useDerivedFinancials.ts:46-70` recalcule assetBreakdown/currentLiquidity inline (reee=0 en
  dur, crypto dans nonReg) au lieu des helpers `services/portfolio.ts`. 3 deltas sémantiques sur un
  agrégat partagé → rescoper chaque consommateur + décider crypto/reee délibérément.
- [ ] **`[BIAIS-CAGR]`** (S) — `startingBalancesFromHistory.ts:55-63` : bornes livrées, mais le
  « rendement réel » ne retire toujours pas les apports → surestime. Note UI ou retrait des apports.
- [ ] **`[MCP-CHARTDATA-SUM-GUARD]`** (S, garde) — aucun test/lint de convention sur les sommes de
  flux chartData dans `mcp/tools/*` (le décaissement non-enregistré/liquide n'a AUCUN champ
  `Retrait*` — leçon MCP-RETIREMENT-VERDICT) → scan-garde qui interdit une somme de flux comme revenu.
- [ ] **`[PROJ-TAXPAID-LABEL]`** (S, reste moteur) — `monteCarlo.ts:106` : plafond sans plancher 0
  (compteur négatif → efficacité > 100 % possible) ; `taxLeakage` :137 non borné ; `totalTaxesPaid`
  non renommé. Re-baseliner les tests MC sciemment.
- [ ] **`[FUZZ-ONETIME-FLOWS]`** (M, reste) — flux non exercés par le fuzz de conservation
  (`projection.fuzzConservation.test.ts:21-23`) : vente/gain locatif, équité négative, véhicule,
  héritage, REEE. Les couvrir (mesurer la couverture, pas la supposer).

## 🏦 Sync & données (Fintable, Drive, persistance)

- [ ] **`[FINTABLE-SYNC-STALE-BASE]`** (M, résiduel #545 ASSUMÉ) — une passe de sync calcule son
  `nextState` sur un snapshot capturé AVANT le fetch réseau (`browserSync.ts:181`,
  `runFintableSync.ts:118`) : une édition manuelle pendant la fenêtre peut être écrasée. Vrai fix =
  ré-appliquer `applyPayloadsIsolated` sur l'état FRAIS au moment de l'écriture. Sœur : cooldown
  localStorage ≠ mutex cross-onglet (fenêtre étroite, intégrité seulement).
- [ ] **`[HIST-STORE-SIZE]`** (M, MESURÉ 2026-07-31) — `priceHistory` dans le store persisté :
  ~116 Ko aujourd'hui (8 titres, 18 mois, 37 o/point), +6 Ko/mois, ~384 Ko à 5 ans — dans CHAQUE
  push Drive + localStorage. Reco : downsample du stocké (> 365 j → 1 point/semaine, ÷5 le stock
  ancien) ; PAS d'IDB device-local (un nouvel appareil perdrait les points crypto > 365 j, fenêtre
  CoinGecko — c'est pourquoi mergePriceHistories existe).
- [ ] **`[SDK-IMPORT-TIMEOUT]`** (S, résiduel panel #547, non bloquant) — le chargement du chunk SDK
  (`services/claude.ts:157`) n'est couvert par aucun timeout : un `import()` qui stalle sans rejeter
  pend indéfiniment (borné : 1er usage par session). Fix : course import() vs timer 8-10 s dans
  importWithRetry. ⚠️ Partagé par tous les lazy — dimensionner pour recharts sur connexion lente.
- [ ] **`[P0-IDB]`** (L, ⏳) — migrer la persistance localStorage → IndexedDB (quota ~5 Mo + parsing
  synchrone au boot). ⚠️ Migration schéma persist v7 — vigilance corruption.
- [ ] **`[PROFIL-SWITCH]`** (M, reste) — (a)+(d) couverts par PERSONA-PURGE ; restent : sélecteur de
  profil explicite (nom + type réel/test visibles) + persistance ISOLÉE par profil (clé storage
  dédiée, pas d'écrasement croisé).
- [ ] **`[ASSET-CURRENCY-BACKFILL]`** (S, attente signal) — backfill devise legacy SEULEMENT si le
  log `services/portfolio.ts:60-62` apparaît chez Marc. Ne rien coder avant.
- [ ] **`[PURGE-TOAST-UX]`** (S, 🧭 si Marc le veut) — le pull Drive qui purge des artefacts persona
  ne fait que logError (`syncPull.ts:78`) ; le toast n'existe qu'au boot. Abonnement générique → toast.
- [ ] **`[MCP-CLOUDRUN-AUTH-HARDENING]`** (M, 2/4 faits, pré-exposition) — restent : rate-limit sur
  `POST /oauth/authorize` (grep 429 oauthProvider.ts = 0) + runbook rotation
  `FINANCEAI_OAUTH_SIGNING_KEY` (kill-switch d'incident).
- [ ] **`[SEC-GA-DEFER-CONSENT]`** (S, Loi 25) — `index.html:49` : gtag chargé inconditionnellement
  AVANT le consentement → différer au consentement accordé.

## 💬 Chat / IA

- [ ] **`[CHAT-PAGE-CONTEXT-V2]`** (M, file Marc « chat conscient de la page ») — instrumenter les
  autres onglets (Investissements : filtres/compte ; Futur : scénario + année survolée ; Impôts :
  année ; Dettes ; Transactions : recherche/filtres). L'union `ViewContextDetail`
  (`services/aiChat/viewContext.ts:49`) n'a qu'UN membre (Budget) — un petit detail typé + publisher
  par onglet, pipeline en place.
- [ ] **`[CHAT-PAGE-CONTEXT-V3]`** (M, évaluer AVANT) — état fin volatile (modal ouvert, tooltip figé
  du Futur, ligne sélectionnée) — fragile ; juger la valeur réelle avant de coder.
- [ ] **`[HARDEN-SAFEBLOCK]`** (S, reste) — protection anti-injection live partout, mais pas de
  helper unique `buildSafeUserBlock` ni de lint anti-régression. Factoriser + lint.

## 📈 Investissements & historique

- [ ] **`[DASH-HIST-CARDS-LABEL]`** (S, reste du finding #544 F3) — étiqueter les cartes « Actifs
  individuels » + le graphe Accueil « au dernier cours de clôture » (le tooltip Variation est fait) —
  réutiliser `staleTailSymbols`/`noHistorySymbols`.
- [ ] **`[DASH-IMMO-EQUITY-WRITERS]`** (M, 🧭 décision Marc) — le terme équité immo du KPI Accueil
  est INERTE (`RealEstateGoal.currentValue`/`mortgageBalance` sans AUCUN écrivain UI) → un
  propriétaire modélisé par price/downPayment a un KPI sans sa maison pendant que le Futur l'inclut
  (mesuré : 81 609 $ moteur vs 0 KPI). Trancher : brancher sur ce que l'UI possède OU retirer le
  terme. En même temps (F4) : gate `equity !== 0`, filtre `isActive`, gardes `Number.isFinite` +
  logErrorThrottled (3 sites).
- [ ] **`[U5]`** (S) — export PNG du graphe « Évolution détaillée » (Dashboard).
- [ ] **`[SUBS-TAB]`** (M, reste) — détection/alertes abonnements livrées (TX-SUBSCRIPTIONS) ;
  restent : surface dédiée (onglet ou sous-onglet) + flux « confirmer/ignorer » les nouveaux détectés.
- [ ] **`[GOAL-DEADLINE-UI]`** (S) — la carte d'un objectif existant (`Planning.tsx`) n'affiche ni
  n'édite `deadline`, alors que l'échéance pilote un décaissement RÉEL et que le MCP peut la poser →
  écriture IA non visible/réversible à l'écran. Afficher + éditer/effacer.
- [ ] **`[PH4C-SAVINGS-NATURE]`** (S) — objectif lié à un poste nature Épargne → « Versé ce mois : 0 »
  permanent (virements exclus d'actualsMap). Filtrer le dropdown aux natures non-épargne OU inclure
  les virements rapprochés pour ces postes.

## 🎨 UI / UX / a11y

- [ ] **`[D6-PRIV-MONTANTS]`** (S, décision Marc OUI déjà prise 2026-07-06) — les montants des
  sliders REER/CELIAPP (`TaxCenter.tsx:409,417`), REEE (`ChildPlanning.tsx:489`) et paiement suppl.
  (`DebtManager.tsx:141`) s'affichent EN CLAIR en mode discret → masquer au repos, révéler au focus
  (symétrie PrivateNumberInput), aria-label SR-safe.
- [ ] **`[A11Y-INK500]`** (M, par lots — 115 occurrences restantes, ~37 fichiers) — migrer ink-500 →
  ink-400 sur le contenu actif (échec AA normal), classification par-occurrence (PAS un sed aveugle) :
  investments/, projection/, sidebar/, setup/, realestate/, AdvancedProjectionParams…
- [ ] **`[A11Y-FUTUR-MILESTONES-KEYBOARD]`** (M, 🧭 décision Marc) — pastilles du graphe Futur non
  atteignables au clavier (`ProjectionTooltip.tsx:270-271` tabIndex=-1, WCAG 2.1.1). Options :
  focusabiliser ~29 pastilles (impact pattern « clic n'importe où ») OU contrôle clavier alternatif
  ouvrant FutureDetailModal. Aria-labels datés si focusables. (≡ A11Y-CHART-KEYBOARD.)
- [ ] **`[FUT-TOUCH-TARGETS]`** (S) — cibles tactiles de l'onglet Futur (couplé au sweep a11y).
- [ ] **`[A11Y-BORDER-PROMINENCE-SWEEP]`** (S, reste) — passe dédiée inputs/selects (focus:border-*),
  toggles, dropzones (border-white/10 : Transactions ×16, Investments ×8, Dashboard ×4).
- [ ] **`[D6-KBD]`** (S) — sidebar pilotable au clavier : labels opacity-0 focusables +
  `disabled={!isSidebarOpen}` bloque l'accordéon (`Layout.tsx:286`).
- [ ] **`[IA-NAV-LABELS]`** (S) — sidebar w-16 par défaut, libellés opacity-0, icônes cryptiques →
  libellés visibles par défaut (ou rail plus large).
- [ ] **`[ONB-TOUR-OPTIN]`** (S) — le tour guidé se lance AUTO à 700 ms post-onboarding
  (`App.tsx:749`) → le rendre opt-in (bouton « Visite guidée »). Règle aussi [ONB-OVERLAY-SEQ]
  (coexistence tour + bandeau consentement).
- [ ] **`[NAV-IA-CONSOLIDATE]`** (L, ⏳, 🧭 OK Marc requis) — 14 destinations → ~6 (Accueil · Budget ·
  Patrimoine · Futur · Impôts&Docs · Réglages). Gros chantier nav (routes, deep-links, tests) →
  plan-first + OK Marc.
- [ ] **`[UI-TABS-RICH]`** (M) — généraliser le pattern sous-onglets à Retraite (4 outils empilés) et
  Profil (long scroll). Plan-first.
- [ ] **`[BUDGET-KEY-WARNING]`** (S) — warning dev clés dupliquées Recharts (`Budget.tsx:1133-1170`,
  2 `<Pie dataKey="value">` + Legend) — investigation dédiée, non fatal.
- [ ] **`[DETTE-CHART-THEME-DUP]`** (S) — tooltip/thème Recharts partagé (`CHART_TOOLTIP_STYLE`
  inexistant) — dédupliquer les styles inline des graphes.
- [ ] **`[D6-GRAPH]`** (M, résiduel) — accès clavier aux graphes restants (projections,
  investissements) ; tables sr-only faites pour les donuts Budget.

## ⚡ Performance

- [ ] **`[PERF-BOOT]`** (M-L, différé SCIEMMENT — provider-aware) — paralléliser
  `hydrateAssets`/priceRefresh SANS dépasser CoinGecko free ~30/min (le sleep 2500 protège le
  provider le PLUS strict). Fix provider-aware planifié, pas un Promise.all aveugle. (≡ D7.)
- [ ] **`[PERF-WK]`** (M) — profiler le worker projection (latence keystroke des sliders Futur).
- [ ] **`[HARDEN-SNAPSHOT-RACE]`** (S, reste) — abort sur le chemin run projection simple
  (la recherche de stratégies a déjà son AbortSignal, `runAsync.ts:222,235`).

## 🧱 Dette technique

- [ ] **`[DETTE-GODFILES]`** (L, ⏳, par barrel — au fil de l'eau) — restent : `Budget.tsx` 1413 l.
  (a GROSSI), `Investments.tsx` 1345, `FutureProjection.tsx` 1199, `Transactions.tsx` 982,
  `Dashboard.tsx` 735, `utils/tax.ts` 908, `services/claude.ts` 912, `services/pdfReport.ts` 851,
  `services/projection.ts` 1751. (syncOrchestrator ✓, TaxCenter ✓ 613 l.) (≡ D4, CA-06, CA-09,
  DETTE-CLAUDE-SPLIT.) + [D4-H2] sélecteurs atomiques (App re-render sur tout slice non-lastProjection).
- [ ] **`[DETTE-UI-PRIMITIVES]`** (M) — `components/ui/Input|Select|Field` (label+erreur+aria) sur
  les tokens existants + migrer les hotspots (AdvancedProjectionParams 40 inputs, PatrimoineExtended
  19, Onboarding 11, ProjectionControls 10). (≡ CA-08.)
- [ ] **`[CA-07]`** (M) — tokens couleur : `constants/chartColors.ts` (source Recharts), ~200 hex en
  className → tokens sémantiques + règle ESLint anti-régression. (≡ D3 restes ; text-gray = 0 ✓.)
- [ ] **`[CA-01]`** (S) — trancher les 2 orphelins def-only : `addPurchase`/`removePurchase`
  (utils/assetPurchases.ts) et `getHasUserDataSnapshot` (utils/useHasUserData.ts).
- [ ] **`[PH3-c-bis]`** (S, reste) — `futureProvince`/`futureMoveYear` orphelins (types.ts:343-344,
  0 consommateur services/) ; `rsuYearsRemaining` consommé (activeIncome.ts:101) mais AUCUN éditeur
  UI → auditer W2.7 + éditeur ou retrait.
- [ ] **`[ENG-RAMQ-FIELDS]`** (S, reste) — assurance médicaments PRIVÉE absente (enfants à charge ✓)
  → champ User + bascule RAMQ/privé dans taxDecember.
- [ ] **`[T4]`** (M, par lots) — automatiser les tests manuels critiques en Playwright : 8 specs e2e
  aujourd'hui, cible 20-30 (depuis MANUAL_TEST_CHECKLIST.md).
- [ ] **`[T3]`** (S pour mesurer) — lancer un run coverage pour trancher la cible 64→80 % (jamais
  mesuré depuis ~2350 tests ajoutés).
- [ ] **`[B4-TESTS]`** (S, 🧭 fermer ?) — audit des assertions obsolètes des tests — vague, sans
  critère d'arrêt : soit le définir, soit fermer.
- [ ] **`[DT5]`** (requalifier) — splitter le worker projection : le sharding multi-workers existe
  DÉJÀ (`runAsync.ts:199`) → requalifier en « split par type de calcul si le moteur grossit » ou fermer.
- [ ] **`[HARDEN-ZOD-GATEKEEP]`** (S, requalifié LOW) — `numericInput.ts` couvre déjà NaN/Infinity au
  boundary UI ; schémas Zod systématiques = défense en profondeur optionnelle.
- [ ] **`[ENG-LIFEEVENT-VENTE-SUBSTRING]`** (S, racine) — « vente » mot réservé détecté par
  sous-chaîne sur LifeEvent.name (`applyLifeEvents`) → détection par champ typé, plus de string-matching.

## 🚀 Gros chantiers (⏳ — plan-first + OK Marc par chantier)

- [ ] **`[ITEM-2A]`** (L, money-critical, approche VALIDÉE Marc 2026-06-16) — impôt NOMINAL.
  Phase 0 ✓ (golden). Restent : Phase 1 (threader `rate` dans getIndexedBracketsForYear — taux 1,02
  FIGÉ `utils/tax.ts:694` — + calculateFiscalReport/BPA/crédits/FSS/RAMQ, défaut 0,02 additif) ;
  Phase 2 (bascule ~10 sites sur revenu nominal, retirer les déflations, re-baser les golden
  SCIEMMENT, panel fiscal + validator).
- [ ] **`[CIX-B]`** (S, reste) — `owner` sur `Debt` (Asset ✓, netWorthByOwner ✓, carte ✓) + comptes.
- [ ] **`[CIX-A1B]`** (L, reste) — attribution SRG/DB/rentes per-conjoint end-to-end (soldes REER/FERR
  per-conjoint ✓).
- [ ] **`[CIX-A3]`** (M) — REER de conjoint : `useSpousalRrsp` déclaré (types.ts:650) mais JAMAIS lu
  (fonctionnalité fantôme, classe TX-DUPLICATES) → câbler le moteur ou retirer le champ.
- [ ] **`[CIX-A45]`** (M) — déductions au plus haut taux marginal + crédits transférables (frais
  médicaux, âge, conjoint) — seul le fractionnement pension existe.
- [ ] **`[CIX-C]`** (M, reste) — patrimoine familial QC (séparation) + comparateur ensemble vs séparé
  (décès/divorce stochastique ✓).
- [ ] **`[CIX-DE]`** (L) — optimiseur de couple + décaissement coordonné à 2 têtes (drawdownOptimizer
  sans perUser aujourd'hui).
- [ ] **`[CIX-F]`** (M) — bascule couple↔individuel sans perte (mémoriser le conjoint) + avatars.
- [ ] **`[ICONS-FUT]`** (S, requalifier — quasi couvert) — restent : icônes typées
  transferts/hypothèque/RAP/REEE + clustering LOD complet (le gros est livré par FUTUR-ICONS-RICH).
- [ ] **`[PH4-BUD]`** (🧭 cadrage Marc requis) — refonte Budget design (Budget techniquement sain ;
  a gagné les vues MONTH/QUARTER/YEAR/CUSTOM depuis).

## 🧊 Différés SCIEMMENT (ne pas prendre sans le déclencheur noté)

- [ ] **`[NAN-MUTATOR-CENTRAL]`** (S) — garde centrale des 4 mutateurs nus — SEULEMENT si un vecteur
  d'entrée non-UI apparaît (numericInput couvre le boundary ; plan prêt en réserve).
- [ ] **`[DETTE-RE-SALE-PURGE]`** (S, 🧭 décision Marc A/B/C) — purge propertyId à la suppression d'un
  bien : re-cibler une vente = money-critical → décision délibérée (purge / remove / warn), pas un batch.
- [ ] **`[FISC-RAP-REPAY]`** (M, fixIsSafe:false) — inclusion ligne 12900 + passif successoral RAP —
  risque double-comptage estate ; limite consignée FISCAL_REFERENCE §9.
- [ ] **`[FISC-CHILDCARE]`** (M) — T778/crédit QC exacts au lieu de l'heuristique 30 % — travail dédié.
- [ ] **`[FISC-SURVIVOR-CAP]`** (S) — cap RRQ combiné per-bénéficiaire via perUserRrqWeight (un cap
  naïf serait FAUX) — peu d'impact.
- [ ] **`[FISC-ASSETLOC-INTL]`** (M) — withholdingDrag international en CELI/REER — rouvrir si la
  classe international entre au portefeuille (CELI-ASSET-NUDGE).
- [ ] **`[PROJ-REVEAL-RACE]`** (S, LOW) — course Rechoisir vs miroir IDB — récupérable en re-révélant.
- [ ] **`[MCP-WHATIF-DATED-DEBT]`** (M, 🧭 sémantique à trancher) — dettes sans date de début (servies
  dès le mois 0) → soit `Debt.startDate` honoré par le moteur, soit modélisation flux de paiements.
- [ ] **`[FISC-CONST-LINT-LIMITS]`** (note de vigilance) — étendre le scan aux taux 2-3 décimales et
  RRIF_RATES = arbitrage faux-positifs à faire — seulement si une fuite réelle apparaît.
- [ ] **`[HARDEN-DECIMAL-STUDY]`** (S, étude) — PoC centimes entiers/decimal.js sur un sous-module —
  dérive flottante déjà bornée ≤ 0,02 $ ; mesurer le coût MC avant d'adopter.

## 🧭 Décisions Marc requises (à poser en UN lot après l'analyse en cours)

- [ ] **`[Q-TAXDEC-INCR]`** — `[FISC-TAXDEC-INCR]` : confirmer l'interprétation de ta décision
  2026-07-06 (coder le fix risqué vs statu quo documenté).
- [ ] **`[Q-MILESTONES-KBD]`** — pastilles Futur : focusables (~29 stops tab) vs contrôle clavier alternatif.
- [ ] **`[Q-IMMO-EQUITY]`** — KPI Accueil : brancher l'équité immo sur les biens réels OU retirer le terme.
- [ ] **`[Q-RE-SALE-PURGE]`** — suppression d'un bien : purge / suppression d'événement / avertir.
- [ ] **`[Q-DRIVE-ENCRYPT]`** — `[SEC-DRIVE-ENCRYPT-DEFAULT]` : passphrase par défaut (enc:true) ou
  opt-in actuel.
- [ ] **`[Q-WHATIF-DEBT]`** — sémantique dette datée (champ moteur vs flux de paiements).
- [ ] **`[Q-PH4-BUD]`** — refonte Budget : tes irritants concrets (ou on ferme).
- [ ] **`[Q-NAV]`** — GO pour le chantier nav 14→6 destinations ?
- [ ] **`[Q-MCPB]`** — confirmer la fermeture du chemin .mcpb Desktop (supersedé par Cloud Run/claude.ai).
- [ ] **`[Q-SOLO-SPLIT]`** — `[FISC-SOLO-INVEST-SPLIT]` change les chiffres affichés : OK pour splitter
  par détention réelle ?
- [ ] **`[Q-COUPLE-VISION]`** — « mode couple plus concret » (vision PH4) : critère d'arrêt ?

## 👤 Actions humaines Marc (jamais auto-cochées)

- [ ] Vérif prod AUTH-DRIVE : si une reconnexion est redemandée → Réglages → Diagnostics → raison GIS
  exacte (login_required = session Google ; popup/cookies = ITP).
- [ ] P0-PROXY restes : env Vercel + smoke + spike Vision (relire sous ADR-002 app solo).
- [ ] RECH-ACTION-UX : confirmation visuelle des fixes #355.
- [ ] Tests manuels (checklist historique — beaucoup sont de facto couverts par l'usage réel
  quotidien ; les cocher si tu les as vécus) : install 1 clic connecteur · auto-sync paie/relevé via
  Claude · fenêtre privée → données reviennent · reste connecté au refresh · clés chiffrées autre
  appareil · rentes RRQ/PSV aux âges choisis · switch persona zéro fuite · refonte Futur 4
  sous-onglets OK ? · zoom molette 60 fps · écran « Calcul en cours » · salaire mensuel cohérent
  partout · chômage → moins d'espace REER.

## 🛡️ Dépendances

- [ ] **`[DEP-DEPENDABOT-26]`** (S) — 1 alerte moderate ouverte sur main
  (https://github.com/MoKarade/FinanceAI/security/dependabot/26) — bump + npm audit.
