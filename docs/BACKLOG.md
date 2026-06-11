# BACKLOG — FinanceAI (actionnable)

> Liste **courte** de ce qui RESTE à faire. L'historique complet des items livrés est
> archivé dans [`docs/archive/BACKLOG_HISTORIQUE.md`](archive/BACKLOG_HISTORIQUE.md).
> Audit qualité détaillé (référence) : [`docs/AAA_AUDIT_2026-06.md`](AAA_AUDIT_2026-06.md).
> Actions humaines (Marc) : [`docs/A_FAIRE_MOI.md`](A_FAIRE_MOI.md).
>
> **Dernière mise à jour : 2026-06-10 (soir).** Tests : ~1886 verts / 158 fichiers · tsc clean · build OK.
> Session 2026-06-10 (suite) — livré : **TOP 10 [UI-EPURE]** (EP-1..10) · **FA-1..5** (fiscaux majeurs) ·
> **PV-5, PV-1, FA-9, FA-10, PV-2, PV-10, PV-7, PV-3, PV-9** (9 fix moteur/fiscal money-critical) ·
> **#238** : **PV-8** (TLH×ACB) + **[PH1-a]** (fix chunk périmé, Phase 1 du brief Marc) + **PV-4** +
> **FA-7** (§8 immobilier) + **FA-11** (limite SRG documentée). Reste actionnable 🔧 : PV-11, FA-8,
> FA-12 (design consigné au ticket) (+ a11y D6, U5, CA-xx). 🧭/👤 (Marc) : Q1/Q2 du brief (A_FAIRE_MOI
> O6), phases 2-4 du brief (plan-first, OK requis), ITEM-2A/2C, FA-6, P0-*.

## Convention (cochage par Claude au merge)
- Chaque item Claude-faisable porte un **`[ID]`** entre crochets. **Claude coche lui-même**
  l'item au moment du merge de la PR qui le livre (l'Action `backlog-autocheck` a été retirée —
  choix Marc, 2026-06-09).
- Claude édite ce fichier pour **cocher** (au merge) et **ajouter** des items (découvertes).
  Les blocages humains vont dans `A_FAIRE_MOI.md`.
- Légende : 🔧 Claude · 🧭 décision Marc requise · 👤 action humaine (Marc) · ⏳ gros chantier.
- Les **tests manuels** (section 👤 ci-dessous) n'ont PAS d'`[ID]` (à Marc).

---

## 🧱 BRIEF MARC 2026-06-10 — plan séquencé en 4 phases (PRIORITAIRE)
> Règles d'exécution (Marc) : **plan-first OBLIGATOIRE** sur les Phases 2, 3 et CHAQUE onglet de la
> Phase 4 (plan court : UI proposée, fichiers touchés, données nécessaires → validation Marc → code).
> **Ne JAMAIS passer à la phase suivante sans OK explicite de Marc.** Commits en français.
> `SESSION_HANDOVER.md` mis à jour après chaque phase.
> Questions à POSER (ne pas deviner) : **Q1** (avant PH4-FUT) — quoi annoter SUR la courbe
> (âge retraite ? épuisement d'un compte ? bascule de stratégie ?) · **Q2** (avant toute action
> Cloudflare) — confirmer que Cloudflare est bien devant Vercel.

### Phase 1 — BUGS (exécution immédiate, sans plan)
- [x] **[PH1-a]** 🔧 (livré) Erreur prod « Failed to fetch dynamically imported module
  DashboardEvolutionChart-[hash].js ». Cause code CONFIRMÉE : `Dashboard.tsx:5` était le SEUL
  `React.lazy` NU du codebase (tous les autres passent par `lazyWithRetry` P1.4 = retry 500 ms +
  1 reload gardé) → seul chunk sans filet sur hash périmé après deploy. Fix : (1) `lazyWithRetry`
  appliqué ; (2) filet GLOBAL `vite:preloadError` (`installPreloadErrorReload`, installé dans
  `index.tsx` avant le render) → intercepte racine ET dépendances préchargées des imports dynamiques.
  Revue (panel) → design durci : garde par **TIMESTAMP auto-expirant** (≤ 1 reload auto/min) au lieu
  du flag binaire + `clearChunkReloadFlag` au mount SUPPRIMÉ (il tournait avant la résolution des
  chunks du boot → un échec persistant bouclait reload→mount→clear→reload, en évinçant le journal
  d'erreurs) ; PAS de `preventDefault` (sinon les `import()` résolvent `undefined`) ; filtre
  `isChunkLoadError` (une erreur d'évaluation de module ne gaspille pas de reload) ; nom du chunk
  fautif persisté au log ; storage indispo → pas de reload. 7 tests. **Critères ✓** : plus aucun
  `React.lazy` nu ; boucle bornée structurellement ; ErrorBoundary en dernier recours. Audit cache
  fait : `vercel.json` DÉJÀ conforme (index.html `no-cache`, `/assets/*` `immutable`) ; `sw.js`
  DÉJÀ network-first `no-store` sur les navigations (2026-05-22) — rien à changer.
- [ ] **[PH1-b]** 🧭👤 Cloudflare : analyse livrée à Marc (session 2026-06-10 — voir aussi
  `A_FAIRE_MOI`). Verdict : [Probable] déclencheurs = deploy pendant session ouverte (chunks Vercel
  atomiquement supprimés) et/ou redirect Cloudflare Access sur session expirée ; [Peu probable] cache
  CF d'un index.html périmé (CF ne cache pas le HTML par défaut et respecte le `no-cache` origine —
  à vérifier : Page Rule « Cache Everything » dans le dashboard CF). NE PAS retirer Cloudflare avant
  P0-AUTH (gate Google in-app) : c'est l'authentification de l'app. Étapes de retrait + pertes
  documentées dans `A_FAIRE_MOI`. **Décision Marc requise (Q2).**

### Phase 2 — CLÉ DE VOÛTE ⏳ (plan-first → OK Marc → code) — dépend de : rien (débloque PH4)
- [x] **[PH2-a]** ✅ mergé #240 — `runMC` persisté dans le store (le toggle MC ne se réinitialise
  plus inter-onglets ni au reload), worker projection NON terminé au démontage (singleton chaud
  réutilisé), repli sur `lastProjection` au remount → la courbe stockée s'affiche INSTANTANÉMENT
  (pas d'écran vide ni de reset des contrôles). Nuance assumée : le recalcul déterministe (~150 ms)
  re-tourne au retour mais est idempotent ET masqué par le repli ; le calcul MC lourd, lui, n'est PAS
  relancé (cf PH2-b). Hoist complet du moteur hors composant jugé non nécessaire (objectif UX atteint).
- [x] **[PH2-b]** ✅ mergé #240 — dédup des requêtes MC IDENTIQUES en vol (`runProjectionAsync`,
  Map `_inflight`, clé effective = signature params + `runMC`/`idx`/`types`) : quitter Futur pendant
  un MC puis revenir RE-RACCROCHE à la promesse déjà en vol (un seul calcul worker, pas de restart).
  Worker singleton conservé (plus de `terminate()` au démontage). Revu : code-reviewer (rien de
  bloquant), silent-failure (clean), projection-validator (1895 tests verts). `performance-optimizer`
  NON lancé — diff = orchestration pure (Map dédup + booléen store + repli), zéro calcul ajouté, deux
  effets perf POSITIFS (worker chaud + 0 calcul MC dupliqué) → l'agent n'aurait rien à signaler.
- [x] **[PH2-c]** ✅ mergé #241 — moteur de projection hoisté AU NIVEAU APP (`ProjectionEngine`
  headless + lazy, monté dans App) : calcule + publie `lastProjection`, source TOUJOURS peuplée quel
  que soit l'onglet (avant, seul Futur monté calculait → Dashboard/Retraite à `ProjectionRequired`).
  `hooks/useSimulationParams` partagé moteur↔Futur (params identiques, zéro divergence) ; Futur devient
  pur CONSOMMATEUR ; `projectionStatus` au store (transitoire, exclu persist+sélecteur App = anti-cascade).
  Garde no-fake-data (prérequis Futur). Revu par le panel complet (rien de bloquant, invariants OK,
  1900 tests). Suivis non bloquants → PH2-c-1..4 ci-dessous.
- [x] **[PH2-d]** ✅ mergé #242 — verrou de courbe : bouton dans Futur → snapshot du `ProjectionResult`
  COMPLET persisté CHIFFRÉ en IndexedDB DÉDIÉE (`services/lockedProjectionStore`, clé device secureKeyStore),
  restauré au boot jusqu'au déverrouillage. **Double courbe** (verrouillée figée + aperçu live) sur Futur
  ET Retraite. Côté Zustand : seul `isProjectionLocked` (booléen ADDITIF) persisté → **ZÉRO bump v7**, le
  blob vit en IDB (aucun risque de corruption schema). Panel complet (code-reviewer/silent-failure/security/
  a11y) : rien de bloquant. Suivis non bloquants → PH2-d-1..4 ci-dessous. **→ Phase 2 (clé de voûte) TERMINÉE.**

#### Suivis PH2-c (découverts à la revue panel PR #241 — non bloquants, le hoist est livré)
- [ ] **[PH2-c-1]** 🔧 (MAJEUR) Dédupe `usePastPortfolioHistory` au niveau MODULE : PH2-c monte 2
  instances sur Futur (ProjectionEngine + FutureProjection) → double fetch Finnhub + jonction
  passé↔futur qui peut flotter transitoirement (mode réel, le temps du chargement ; départ de
  projection stable car `liveCSVBalances`=prix actuel). Fix : cache de fetch partagé (module) +
  notification, dans l'esprit de `_inflight` de runAsync.
- [ ] **[PH2-c-2]** 🔧 (signal) Câbler `projectionStatus === 'error'` dans Dashboard/Investissement/
  Budget/Retraite → bandeau discret « projection possiblement périmée (dernier recalcul échoué) » au-
  dessus de la courbe conservée. Aujourd'hui l'erreur n'est visible QUE sur Futur (pré-existant, mais
  PH2-c fournit enfin le véhicule `projectionStatus` pour corriger).
- [ ] **[PH2-c-3]** 🔧 (perf) Router le calcul DÉTERMINISTE dans le worker hors-Futur : en mode
  déterministe (runMC=false), le moteur app-level paie ~150 ms main-thread à chaque changement de
  params quel que soit l'onglet (atténué par debounce 300 ms ; défaut = MC déjà off-thread).
- [ ] **[PH2-c-4]** 🧪 Test DIRECT de `useSimulationParams` (renderHook) comparant `params` à
  l'assemblage de référence par persona — parité aujourd'hui prouvée transitivement
  (buildSimulationParams.parity + ProjectionEngine e2e), pas par un test du hook lui-même.

#### Suivis PH2-d (découverts à la revue panel PR #242 — non bloquants, le verrou est livré)
- [ ] **[PH2-d-1]** ⚠️ **DÉCISION MARC** (silent-failure MOYEN) : verrou présent mais clé de device
  absente au boot (nav privée, IDB vidée) → perte SILENCIEUSE de la courbe verrouillée. Le cas JUMEAU
  des clés API (`decrypt_failed`) fait déjà un `showToast` (App.tsx:241). Soit aligner (distinguer
  'vide' vs 'indéchiffrable' dans `loadLockedProjection` → toast au boot), soit assumer le silence
  pour cette feature de confort. Asymétrie probablement involontaire → trancher.
- [ ] **[PH2-d-2]** 🔧 (a11y) Tooltip Futur (`ExpertTooltip`) — afficher la valeur `lockedNetWorth` au
  survol (avec `privacy-blur`). La légende-texte nomme déjà la courbe ; manque la valeur au survol.
- [ ] **[PH2-d-3]** 🔧 (pré-existant) Graphe Retraite : le stack d'aires VISIBLE omet CELIAPP (4 aires)
  alors que `TotalCapital` l'inclut (5) — d'où la métrique verrouillée alignée sur le stack (sans CELIAPP)
  en attendant. Ajouter l'aire CELIAPP au stack (+ légende native `iconType` reflétant le tireté) ;
  + à terme, alternative TEXTE/table SR aux graphes (manque global, hors PH2-d).
- [ ] **[PH2-d-4]** 🧹 (doc) En-tête `secureKeyStore.ts` : la clé de device chiffre désormais 3 payloads
  (clés API + backups + courbe verrouillée) — mettre à jour le commentaire.

### Phase 3 — MODÈLE DE DONNÉES + ONGLET PROFIL ⏳ (plan-first) — dépend de : OK Marc post-PH2
- [ ] **[PH3-a]** 🔧 Nouvel onglet **Profil** remplaçant ENTIÈREMENT le Profil de Configuration :
  regroupe profil + utilisateur + paramètres de retraite + **profil détaillé** (actuellement dans
  Retraite). **Critères** : plus aucun champ profil dans Configuration ni Retraite ; zéro perte de
  données (mêmes clés store).
- [ ] **[PH3-b]** 🔧 Complétude : afficher QUELLE info manque pour QUEL onglet + % de complétion.
  **Critères** : chaque champ manquant pointe l'onglet qui en a besoin ; % global visible.
- [ ] **[PH3-c]** 🔧 Profil détaillé : AUDIT du code pour ne garder QUE les champs réellement
  consommés par l'app — supprimer le reste (champs + types + store + UI). **Critères** : chaque
  champ conservé a ≥ 1 consommateur prouvé (grep consigné dans la PR) ; migration store propre.
- [ ] **[PH3-d]** 🔧 « Paramètres de vie » retirés de Retraite → déplacés dans Profil. **Critères** :
  Retraite n'a plus de section vie ; valeurs préservées.

### Phase 4 — REFONTES ⏳ (UN plan SÉPARÉ par onglet → OK Marc par onglet) — dépend de : PH2 (+PH3 pour FUT/RET)
- [ ] **[PH4-FUT]** 🔧⏳ Refonte **Futur** : leviers OBLIGATOIRES avant calcul (l'actuel contenu
  d'Optimisation remonte en amont) ; la courbe affichée = toujours la MEILLEURE selon les leviers ;
  après calcul, choix parmi les courbes retenues puis VERROUILLAGE (PH2-d) ; stratégie de retrait
  AUTO (retirée des paramètres) ; spécificités de la stratégie optimale en langage « qu'un enfant
  comprenne » + ANNOTÉES sur la courbe (**Q1 à poser avant de coder**) ; onglet Paramètres revu
  (moins de texte, previews d'effet, RENOMMÉ) ; « Robustesse » = levier du calcul de départ (retirée
  d'Optimisation) ; stress tests déplacés dans Paramètres ; Optimisation visible seulement à la 1re
  ouverture puis dépliable ; BEAUCOUP plus de leviers, calcul accéléré mais représentatif ; conseils
  du plan d'action REMONTÉS (pas enterrés en bas), clarifiés, déclinés mois/trimestre/semestre/année.
- [ ] **[PH4-TX]** 🔧 Refonte **Transactions** : tri par montant/catégorie/date + refonte complète
  (onglet vieux et peu utile).
- [ ] **[PH4-BUD]** 🔧 Refonte **Budget** complète.
- [ ] **[PH4-INV]** 🔧 Refonte **Investissement** : autocomplétion à la frappe pour chercher une
  action (Finnhub symbol search) ; saisie d'actions facilitée ; VÉRIFIER l'allocation sur données
  réelles (bug constaté sur données test) ; afficher les dividendes perçus ; refonte plus explicite,
  plus simple, moins de pages, plus d'explications sans excès de texte.
- [ ] **[PH4-RET]** 🔧 Refonte **Retraite** : courbes identiques à Futur (acquis via PH2-c) ;
  refonte plus efficace/utile/lisible.

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
- [x] **[FA-1]** (livré #221) Assiette du crédit pension (féd 31400 + QC 361) inclut RRQ/PSV à tort
  (`taxDecember.ts:362-364`) — ARC/RQ les EXCLUENT. Restreindre à DB + FERR 72+. **Non conservateur**
  (~250-680 $/an/personne 65+). Le plus systémique des findings.
- [x] **[FA-2]** (livré #222) Clawback PSV : revenu FAMILIAL comparé au seuil INDIVIDUEL (`taxDecember.ts:39-44`)
  → clawback fictif jusqu'à ~14 k$/an pour un couple 95-190 k$ (conservateur mais massif).
  Calculer par conjoint (les décompositions per-user existent) ou documenter en §9.
- [x] **[FA-3]** (livré #222) SRG : (a) imposé à tort (non imposable) ; (b) clawback ignore retraits REER/gains
  → SRG fictif jusqu'à ~13 k$/an en scénario FIRE bas revenu (`retirementIncome.ts:206-220`). **Non
  conservateur** (b).
- [x] **[FA-4]** (livré #221) CELI dupliqué : `taxJanuary.ts:89-92` recalcule 7000×inflation au lieu de lire
  `CELI_ANNUAL_LIMITS` (2027 : 7 000 vs 7 500 au doc). Brancher sur la source unique.
- [x] **[FA-5]** (livré #221) NPV rentes succession : `governmentPension × 0,65 × activeUsersCount`
  (`estateCalculation.ts:144-145`) alors que le moteur le traite déjà comme FAMILIAL → ×N en double,
  `estateNetWorth` couple gonflé de dizaines de k$.
- [ ] **[FA-6]** 🧭 Dons charitables : crédit 33 % + relief gains 15 % en dur non sourcés
  (`w5Effects.ts:98-101`). Sourcer au doc (vrai barème ~48-53 % > 200 $ ; don de titres = inclusion 0 %).
- [x] **[FA-7]** 🔧 (livré) §8 immobilier transcrit dans FISCAL_REFERENCE : B-20 (plancher 5,25 %,
  +2 pts, GDS 39/TDS 44), mise de fonds min + amortissements SCHL (30 ans FTB/neuve août 2024),
  primes SCHL par LTV (0,60→4,00 %), mutations QC 2025 (paliers + note Montréal non modélisé,
  à réindexer 2026), TPS/TVQ neuf (36 %/6 300 $ · 50 %/9 975 $, dégressifs), Smith/HELOC LTV 65 %
  + margin call. Découverte routée vers FA-8 : taux HELOC 5 %/an EN DUR (`realEstateMonth.ts:336`)
  — hypothèse de modèle à paramétrer.
- [ ] **[FA-8]** 🔧 Lot mineurs fiscaux : taux clawback 0,15 nommé+sourcé · cap clawback sans facteur
  de report · prorata RRQ 39 ans / PSV 10-40 ans au doc · split 65/35 documenté · SystemView barèmes
  composés depuis les constantes (`SystemView.tsx:102`) · assiette dividendes vs gains cohérente ·
  retenue US 15 % sourcée · libellé FSS 2025/2026 · retenue FERR (`taxJanuary.ts:185`) passe encore
  le revenu TOTAL en `eligiblePensionIncome` (impact ≈0, réconcilié en décembre — aligner sur FA-1) ·
  `calculateCeliRoom` fallback `|| 7500` non indexé > 2030 (unifier avec l'extrapolation taxJanuary) ·
  `setupSimulation.ts:169` `inflationRate || 2.0` masque le 0 légitime (→ `??`) ·
  NPV estate lit `governmentPension` même quand `rrqEstimateMonthly` est fourni (divergence silencieuse) ·
  assiette clawback PSV sans gains/dividendes/intérêts non-reg (revenu net 23400 les inclut — sous-estime,
  borné au cap) · cap clawback ignore prorata résidence/`psvEstimateMonthly`/bonus 75+ (clawback fantôme
  possible pour immigrant 10/40) · assiette FSS inclut la PSV (l'Annexe F la déduit — à sourcer) ·
  lagged SRG déflaté du facteur du mois courant (~1 an d'écart, SRG légèrement surévalué) ·
  `ghOtherNominal` (récolte de gains, retraité) inclut le SRG non imposable → palier visé trop petit (conservateur) ·
  **dbMonthly quasi-nominal dans le revenu test SRG réel** (post-FA-9 : SRG coupé de plus en plus tôt
  pour un profil DB, conservateur mais amplitude ×1,49 à 20 ans — déflater la composante DB) ·
  **plafonds ×N non survivor-aware** (découverte FA-10) : droits CELI/REER/CELIAPP continuent de
  s'accumuler pour le défunt (`projection.ts` fhsaRoom, `taxJanuary.ts:159`) — sous-imposition
  indirecte mineure · retenue FERR estimée sur 2 têtes en survivorMode (timing seulement, réconcilié
  en décembre) · 🧭 « montant pour personne vivant seule » QC (grille TP-1.G) absent code+doc —
  pertinent pour un survivant, NE PAS chiffrer sans source Revenu Québec.
- [x] **[FA-12]** 🔧 (livré) Test d'intégration survivorMode SEEDÉ (`projection.survivor.test.ts`,
  5 tests) via hook test-only `__runScenarioForTests`. Astuce clé : `replayHistoricalYear` override
  les taux APRÈS les tirages MC → runs modelSurvivor ON/OFF BIT-IDENTIQUES jusqu'au décès (crypto=0,
  tous les flags stochastiques off), la divergence NetWorth EST le décès. Conjoint 100 ans (p=0,33
  plafond), seed k=0 épinglé → décès au PREMIER janvier (mi=12). Contrats : divergence exactement à
  mi=12 · totalTaxesPaid survivant > base ×1,10 (FA-10, 1 contribuable — mesuré +55 %) · NW final
  survivant < base (PSV défunt cesse) · base identique ∀ seed (aucun tirage si OFF) · série complète
  (la sim continue). En MC le chartData est ALLÉGÉ ({NetWorth, monthIndex}) → assertions par agrégats.
  Si un changement moteur décale la consommation rng : re-scanner k=0..7 (procédure en tête du test).
- [x] **[FA-11]** 🔧 (résolu par DOCUMENTATION — l'option prévue au ticket) Discontinuité SRG au
  seuil documentée en limite assumée dans FISCAL_REFERENCE (§ SRG) : marche ~167 $/mois au seuil
  22 512 $, SRG surévalué (non conservateur) dans la bande ~18-22,5 k$, cause = top-up récupéré
  ~25 ¢/$ supplémentaires non modélisé. Les paramètres exacts du top-up ne sont publiés que via les
  TABLES trimestrielles Service Canada (pas de formule officielle) → les chiffrer sans source
  violerait la règle fiscale. Reste ouvert (🧭 si voulu) : transcrire les tables et modéliser la
  vraie courbe continue.
- [x] **[FA-9]** 🔧 (livré) **Double indexation du SRG** corrigée : `calculateGISBenefit` appelé
  SANS `year` (barème 2026 de base = base réelle, comme RRQ/PSV) contre le revenu test réel, puis
  nominalisation UNIQUE ×inflFactor. Avant : max+seuils ×1,02^Δ dedans PUIS ×inflFactor dehors →
  max surévalué ~49 % à 20 ans (~+6,5 k$/an fictifs) + seuils nominaux face à revenu réel.
  4 tests anti-régression (max simple-indexé, réel constant, seuil de coupure réel) +
  FISCAL_REFERENCE §6.3 note d'indexation. L'util garde son param `year` (usages nominaux hors moteur).
- [x] **[FA-10]** 🔧 (livré) Impôt de décembre en **survivorMode** : le revenu du survivant était
  réparti sur 2 têtes (barème progressif 2× à demi-revenu + crédits d'âge du défunt + fractionnement
  fictif + RAMQ/FSS ×2 = sous-imposition). Fix au call-site (pattern FA-2) : `taxFilers = survivorMode
  ? 1 : activeUsersCount`, `ageSpouse`/décompositions par conjoint coupés, DB AGRÉGÉE sur une tête
  (crédit pension complet), salaire du défunt à 0 dans la branche active de décembre. 4 tests de
  contrat (vrai barème progressif). Bonus : commentaire W1.4 INVERSÉ corrigé (survivant = user1,
  défunt = user2 — `activeIncome.ts:61` faisait foi).
- [x] **[PV-1]** 🔧 (livré — choix Marc : cascade de vente) Liquide négatif effacé silencieusement :
  les débits DIRECTS (impôt d'avril, véhicules/rénos W5, échéances d'objectifs) rendaient `liquid < 0`,
  clampé à 0 par `applyMidMonthGrowth` = dette effacée, patrimoine SURÉVALUÉ. Fix : sauvetage unique
  avant la croissance — découvert couvert par la MÊME cascade que le shortfall régulier (stratégie,
  retenue REER, PBMA/OAS) ; résiduel insolvable journalisé + compté (`shortfallMonths`). Tests de
  conservation (`projection.overdraft.test.ts`). Révélation : Karim (retraite 50, MCP 20 ans) était
  maintenu « solvable » par ~32 k$ d'impôts d'avril avalés → ruine honnête à l'an 20 (test MCP passé
  à 10 ans). Bonus : `get_projection` MCP — `finalNetWorthNominal` = NW brut (cohérent avec `real`),
  successoral exposé séparément (`estateNetWorth`, comme get_retirement_outlook). ⚠️ Sémantique :
  les mois de sauvetage comptent désormais dans `shortfallRate` (honnête — il a fallu vendre).
- [ ] **[PV-6]** 🔧 Résiduel insolvable = dette portée : quand la cascade du sauvetage PV-1 ne couvre
  pas tout (comptes épuisés / cap OAS), le résiduel est journalisé puis absorbé (convention CF-2 des
  shortfalls non couverts) → NW encore surévalué du résiduel dans les scénarios DÉJÀ en ruine. Modéliser
  un passif `liquidDebt` cumulé (affiché au bilan) si on veut un NW honnête en insolvabilité. Basse
  priorité (scénarios concernés déjà signalés par shortfallRate/successRate). (M)
- [x] **[PV-2]** 🔧 (livré) Récolte de gains ignorait `capitalLossBank` : la banque de pertes (TLH)
  est désormais consommée EN PREMIER (LIR 111(1)(b)) — part compensée = 0 $ d'impôt et HORS palier
  (step-up d'ACB gratuit), remplissage du palier sur le latent restant. `consumedLoss` retourné au
  caller (seule la part non compensée entre dans `accCapitalGainsYear`). 4 tests + FISCAL_REFERENCE §3.
- [ ] **[PV-11]** 🔧 Résiduels PV-10 (revue) : (a) shortfall d'OBJECTIF (drawn < visé) visible au
  log mais hors métriques — métrique dédiée (`goalShortfalls`/ratio financé), PAS shortfallMonths
  (sémantique différente) ; (b) retraits de goals absents des séries `withdrawal*` de chartData
  (sous-rapport pour les consommateurs « source unique ») ; (c) `_label` mort sur la closure
  handleNonRegSale (suggère un log inexistant) ; (d) commentaire trompeur portfolioOps.ts:25
  (« Pertes → bank » : branche inatteignable, cap min(1,…) — documenté en §3). (S)
- [x] **[PV-7]** 🔧 (livré) Ventes de CRYPTO via `handleCryptoSale` (miroir de handleNonRegSale) :
  gain proportionnel + banque de pertes (LIR 111(1)(b)) + pertes banquées, aux 2 sites de vente en vie
  (cascade de shortfall `cashflowAllocation.ts`, goal-mutator `projection.ts`). Avant : gain BRUT
  (banque ignorée) et pertes JETÉES. 5 tests unitaires. (Estate latent : NonReg ET crypto ignorent la
  banque symétriquement — hors scope.) Reste le câblage caller de gainHarvesting non testé (cf PV-11).
- [x] **[PV-8]** 🔧 (livré) ⚠️ NON CONSERVATEUR corrigé — TLH fabriquait une perte à partir du seul
  rendement (`harvestedLoss = fakeSell × dropRate`), SANS regarder l'ACB : un titre en gain latent en
  année négative donnait une perte fictive qui gonflait `capitalLossBank` (et PV-2 transformait chaque $
  fabriqué en step-up d'ACB gratuit → sous-imposition des gains réels). Désormais borné par la perte
  LATENTE RÉELLE : `harvestedLoss = max(0, costBasisSold − fakeSell)` avec `costBasisSold = fakeSell ×
  (ACB/valeur)` = `0,5 × max(0, ACB − valeur)`, indépendant du taux ; gain latent → 0 récolte.
  Conservation `acbDelta = −L`. FISCAL_REFERENCE §3 : hypothèse « perte apparente » LIR 54/40(2)g)(i)
  levée (rachat fonds corrélé non identique). Tests réécrits (anti-fabrication, rate-indépendance,
  monotonie en profondeur de perte, conservation).
- [x] **[PV-9]** 🔧 (livré) ⚠️ NON CONSERVATEUR corrigé — gains en capital désormais inclus au test
  SRG ET au clawback PSV : le gain RÉALISÉ imposable (×0,5) entre dans le revenu net des deux tests.
  SRG → `prevYearCapitalGainsForGisNominal` (lag N-1, capturé en décembre avant reset, déflaté) ;
  clawback PSV → `accCapitalGainsYear` de l'année N passé à `computeOasClawback` (réparti également).
  Avant : exclus → un 65+ bas revenu avec gains/gainHarvesting voyait un SRG fictif (surévalué) et
  aucun clawback. Pas de double-comptage (N-1 vs N). 6 tests (SRG = REER ×0,5, clawback, gardes NaN).
  Reste hors test (FA-8) : dividendes/intérêts non-reg.
- [x] **[PV-10]** 🔧 (livré) ⚠️ NON CONSERVATEUR corrigé — goal-mutator NonReg : le retrait
  `'NON-ENREG'` des échéances d'objectifs passe par `handleNonRegSale` (ACB proportionnel, banque
  de pertes, gain → accCapitalGainsYear → imposé en décembre). Avant : ACB décrémenté du montant
  VENDU complet et AUCUN gain réalisé (jamais imposés + ACB faussé). Test d'intégration discriminant
  (delta TaxPaidGains avec/sans objectif — échec prouvé sans le fix). Bonus : logs d'objectifs
  HONNÊTES (montant TIRÉ + « visé X — fonds insuffisants », au lieu de la cible toujours affichée).
  Piège documenté : la room historique CELI/REER ignore `celiContributed` → fixture de test via
  `useManualBalances` + rooms 0.
- [x] **[PV-3]** 🔧 (livré) Fractionnement : l'assiette du crédit pension (féd 31400 / QC 361) SUIT
  désormais la pension transférée vers le récipiendaire (ARC : le bénéficiaire du fractionnement peut
  réclamer le crédit sur la pension reçue). `combinedTaxFor` prend l'assiette par appel ; la grille
  passe `{splittable[H]−tr, tr}`. Avant : assiette gelée pré-split → récipiendaire jamais crédité
  (conservateur). Test d'effet (impôt < assiette gelée, grille reproduite). FISCAL_REFERENCE §6.
- [x] **[PV-4]** 🔧 (livré) Tests des clamps hors-bornes `rrqStartAge`/`psvStartAge`
  (`retirementIncome.ts:184-185`) : 4 tests — 55→60 (rien à 59, identique à un 60 explicite),
  80→72 (facteur ×1,588 appliqué), PSV 60→65 (pas d'anticipation), PSV 80→70 (×1,36 vs 65).
- [x] **[PV-5]** 🔧 (livré) Champs `number` Retraite — saisie vide écrasée silencieusement (découverte EP-8) :
  `updateGoal('X', Number(e.target.value))` (`Retirement.tsx`) persistait `Number('')` = **0** (pas NaN ; et
  NaN sur saisie mi-frappe « - »/« 1e »). En projection (`retirementIncome.ts:203-208`) : `dbPensionStartAge`
  vidé ⇒ 0 ⇒ `age >= 0` toujours vrai ⇒ pension DB versée « dès 0 an » ; estimé RRQ/PSV vidé ⇒ 0 (≠ `undefined`)
  ⇒ le moteur ne retombe plus sur la rente agrégée (`!== undefined`, l.187-191). Fix : `utils/numericInput.ts`
  (`numOr` requis → repli valeur courante ; `numOrUndef` optionnel → `undefined`, jamais 0/NaN) appliqué aux
  10 `<input number>` + tests unitaires. Validé par projection-validator (1835/1835, invariants OK, 0 régression). (S/M)

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
  2026-06-09 : systémique, AUCUN `privacy-blur` du codebase n'est masqué aux SR — ~50 occurrences,
  dont les nouveaux montants du `StressTestPanel`. Correctif cible : primitive `<PrivateAmount>`
  partagée avec `aria-hidden` + `sr-only` « montant masqué ».)
- [ ] **[D7]** Perf boot : `hydrateAssets` (`App.tsx`) boucle `await sleep(2500ms)` séquentiel par
  symbole → 10 actifs = ~25 s. Paralléliser + cacher, garde-fous anti-rate-limit. Plus gros gain
  de fluidité ressenti.
- [ ] **[D6-KBD]** Sidebar hover-only : labels `opacity-0` focusables + `disabled` bloque
  l'accordéon clavier → rendre pilotable au clavier.
- [ ] **[D6-GRAPH]** Graphes sans alternative textuelle : table de données masquée / bouton « voir
  les données » sous chaque graphe (a11y).
- [ ] **[D6-HEADING]** `CollapsibleSection` émet son titre dans un `<div className="text-h2">` (pas
  un `<hN>`) → saut h1→h4 dans plusieurs onglets (sous-titres `<h4>`). Ajouter une prop `headingLevel`
  pour un vrai outline (h2/h3). Touche tout le codebase (a11y-auditor 2026-06-09).

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
- [x] **[UI-SCEN]** (livré #223) Enlever les « plans de base » : `withdrawalStrategy` = paramètre
  (sélecteur dans Paramètres), moteur 1 scénario (suite moteur 82→33 s, slider déterministe ÷11),
  stress-tests à la demande dans Optimisation (`StressTestPanel`), cartes/badge/Verdict supprimés,
  optimiseur « Appliquer » → paramètre + âges de rentes #210.
- [x] **[UI-EPURE]** Audit visuel global de chaque onglet → **fait (code-analyzer 2026-06-09)**.
  Verdict : Futur→Paramètres = l'écran le plus chargé (« usine ») ; redondances chiffrées
  (patrimoine projeté à 4 endroits, score de santé à 3, renvois « → Futur » dans 6 onglets,
  `UserConfigFields` dans 4 onglets). TOP 10 ci-dessous ([EP-1] seul = ~80% du « moins chargé »).
- [x] **[EP-1]** 🔧 (livré #225) Futur/Paramètres : fusionner « Variabilité » + « Événements stochastiques » en
  une section « Risques & aléas » repliée (gate MC actif) ; 10 toggles stochastiques derrière un
  bouton « Activer des aléas… ». 4 sections → 2, ~20 contrôles visibles → ~8. (M) **Priorité Marc n°1.**
- [x] **[EP-2]** 🔧 (livré #225) Futur/Paramètres : retirer la Card AI note + les pros/cons DUPLIQUÉS (déjà sous
  le sélecteur de stratégie) → un seul bloc stratégie. (S)
- [x] **[EP-3]** 🔧 (livré #226) Dashboard : le 5e KPI « Indicateur Futur » → KPIStat simple « Patrimoine projeté »
  (dernier point lastProjection.chartData, source unique), mini-formulaire retiré. (S)
- [x] **[EP-4]** 🔧 (livré #226) Investments : donut « Score de Santé » retiré (doublon du badge header). (S)
- [x] **[EP-5]** 🔧 (livré #226) Investments : Card « Portefeuille projeté » condensée → patrimoine net projeté
  + lien « Détail par compte dans Futur ». (S)
- [x] **[EP-6]** 🔧 (livré) Configuration : `SetupHub` → ruban discret repliable quand complétude = 100 %,
  hub complet sinon. (M)
- [x] **[EP-7]** 🔧 (livré) Futur/Plan d'action : `ProjectionExplains` — méthodologie (6 Q&A) sous
  `CollapsibleSection` « En savoir plus » repliée par défaut. (M)
- [x] **[EP-8]** 🔧 (livré) Retirement : Card « Revenus & besoins » allégée — bloc « Pension d'employeur
  (DB) » sous `CollapsibleSection` (ouvert seulement si un montant DB existe déjà) ; Besoin + RRQ + PSV
  restent visibles ; champs DB détail toujours conditionnels au montant > 0. (M)
- [x] **[EP-9]** 🔧 (audit ⇒ déjà satisfait) Global : les vrais doublons décoratifs ont été retirés par
  les lots antérieurs (donut santé #226, badge « N événements actifs » #225). L'audit (Explore très
  complet) confirme que les 5 renvois « Futur » restants sont fonctionnels et contextuels (1/onglet :
  KPI Dashboard, bouton Placements, carte Budget, badge Immo, badge REEE) et que `<ProjectionRequired>`
  est un empty-state honnête à GARDER → aucun code à retirer (≤ 1 lien discret/page déjà respecté). (S)
- [x] **[EP-10]** 🔧 (livré) Futur/Optimisation : `StressTestPanel` replié par défaut, `StrategyComparePanel`
  ouvert ; `AssetLocationPanel` RETIRÉ (doublon de l'AssetLocationCard de Retraite, plus riche → fichier supprimé). (S)

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
