# BACKLOG ARCHIVE — FinanceAI

> **Archive du backlog** (créée 2026-07-31, demande Marc : « un nouveau fichier backlog archive
> pour archiver toutes les tâches une fois finies et validées »). Ce fichier reçoit les tâches
> FINIES + VALIDÉES retirées de `BACKLOG.md`, avec leur contexte d'origine.
>
> ⚠️ **Toute case NON cochée ci-dessous est HISTORIQUE** : les items encore ouverts au
> 2026-07-31 ont été EXTRAITS vers `docs/BACKLOG.md` (refonte complète, vérification
> item-par-item contre le code par 2 agents, preuve fichier:ligne). Ne JAMAIS reprendre une
> tâche depuis ce fichier — la seule source des tâches ouvertes est `BACKLOG.md`.
> L'historique fin par item reste dans git et `docs/HISTORIQUE.md`.

## Note de vérification 2026-07-31 (refonte du backlog)

Vérification exhaustive des ~180 items non cochés contre le code réel (2 agents, preuve
fichier:ligne). Verdicts appliqués à la refonte :
- **~65 items FAITS sans case cochée** (classe PM-STALE-BACKLOG) — considérés livrés, restés
  ici tels quels. Notables : PRIV-DISCRET-DOM + D6-SR-2 (0 `privacy-blur` brut restant),
  D6-HEADING (CollapsibleSection headingLevel), CIX-A2 (fractionnement pension, taxDecember),
  B3 (early-exit goalSeek), DT3 (childCosts partagé), HARDEN-MC-WORKER (sharding runAsync),
  NAV-IA-GATE-MSG, MCP-CLOUDRUN-ROOT/DEPLOY-LOGS, HEALTH-SAVINGS-RATE-DIVERGENCE, TP-1.G
  Phases 0+1, verrouillage courbe (= PROJECTION-PERSIST), et ~44 puces ✅-sans-case confirmées.
- **12 items OBSOLÈTES/caducs** : HIST-BENCH-SYMBOL (superseded INVEST-PERF-PERIOD),
  TX-INCOME-CATEGORY-LIST (faux positif), PERSONA-ASSET-PERF (site supprimé), table H1
  (passphrase opt-in existe), P0-SYNC (prouvé par l'usage réel), CA-03 (contredit la décision
  ENG-TAX-NS « garder l'alias »), D7 (doublon PERF-BOOT), .mcpb (supersedé Cloud Run, à
  confirmer Marc), spec/critères/contraintes MCP-CLOUDRUN (lot livré).
- **Le reste (PARTIELS, PAS FAIT, différés, décisions, actions Marc)** → extrait vers le
  nouveau `BACKLOG.md`.
- **11 items COUPÉS par le PM** (analyse valeur 2026-07-31, demande Marc « demande au PM si c'est
  utile chaque tâche ou non ») — récupérables ici si le contexte change :
  `HARDEN-SAFEBLOCK` (protection déjà live, DRY pur) · `HARDEN-ZOD-GATEKEEP` (boundary numericInput
  déjà couvert) · `BUDGET-KEY-WARNING` (warning dev, zéro impact utilisateur) · `ONB-TOUR-OPTIN` +
  `ONB-OVERLAY-SEQ` (perception seule, validés FAUX à l'audit UX) · `U5` export PNG (confort) ·
  `NW-ASSETBREAKDOWN-DRY` (DRY pur, aucun bug identifié) · `PERF-WK` + `DT5` (perf non mesurée comme
  problème ; le sharding multi-workers existe déjà, runAsync.ts:199) · `B4` audit assertions (vague,
  sans critère d'arrêt) · `CA-01` orphelins def-only (code mort sans risque) · `PH3-c-bis/futureProvince`
  (orphelin — suppression liée à la question RSU).
- **DT3** (aligner UI↔moteur ChildPlanning) : vérifié FAIT — `childCosts.ts` est la source unique
  partagée (ChildPlanning.tsx:25,37-38).

---

## ✅ Vague 1 — quick wins confiance (PR #549, mergée 2026-07-31)

- [x] **`[MCP-TAX-FHSA-BALANCE]`** ✅ 2026-07-31 (V1) (S — V1) — `getTaxSituation.spec.ts:78` passe `u.fhsaBalance`
  (SOLDE) en position COTISATION. Effet actuel NUL (`fhsaBalance` n'a AUCUN écrivain — vérifié) mais
  bombe dès qu'un écrivain arrive → clamp `min(fhsaBalance, FHSA_ANNUAL_LIMIT)` maintenant.
- [x] **`[FISC-REF-FRESHNESS]`** ✅ 2026-07-31 (V1 — 3ᵉ passe datée, réserve §8 levée, hypothèses de modèle documentées §9) (S, doc — V1) — FISCAL_REFERENCE : dater l'en-tête (§4 réécrit
  2026-07-07 sans bump), nettoyer la réserve §8 obsolète (barème 2026 déjà là), DOCUMENTER les
  hypothèses de modèle absentes (0.92, EST_DIVIDEND_YIELD 0,02 / EST_CAPITAL_GAINS_YIELD 0,07,
  REEE_AIP_TAX_RATE 0,20, NONREG_DIVIDEND_DISTRIBUTION_SHARE, FSS retraité, PAE REEE non modélisés).
  + Ticket daté : confirmer CELI/REER 2027 au Budget (nov-déc 2026 — la garde 12 mois ne le verra pas).
- [x] **`[BIAIS-CAGR]`** ✅ 2026-07-31 (V1 — note UI honnête + doc source ; retrait des apports = impossible sans transactions datées par bucket) (S) — `startingBalancesFromHistory.ts:55-63` : bornes livrées, mais le
  « rendement réel » ne retire toujours pas les apports → surestime. Note UI ou retrait des apports.
- [x] **`[PROJ-TAXPAID-LABEL]`** ✅ 2026-07-31 (V1 — clamp [0,1] efficacité + taxLeakage ; renommage de totalTaxesPaid jugé non rentable, sémantique déjà documentée projection.ts:573) (S, reste moteur) — `monteCarlo.ts:106` : plafond sans plancher 0
  (compteur négatif → efficacité > 100 % possible) ; `taxLeakage` :137 non borné ; `totalTaxesPaid`
  non renommé. Re-baseliner les tests MC sciemment.
- [x] **`[DASH-HIST-CARDS-LABEL]`** ✅ 2026-07-31 (V1) (S, reste du finding #544 F3) — étiqueter les cartes « Actifs
  individuels » + le graphe Accueil « au dernier cours de clôture » (le tooltip Variation est fait) —
  réutiliser `staleTailSymbols`/`noHistorySymbols`.
- [x] **`[DEADCODE-TX-TYPEFILTER]`** ✅ 2026-07-31 (V1 — états + branches supprimés) (S — V1) — `Transactions.tsx:70,72` : `_setDateStart`/
  `_setTypeFilter` JAMAIS appelés → filtres date-début + type (Income/Expense/Transfer) morts
  structurels (pourtant dans les deps du useMemo :216). Câbler une vraie UI ou supprimer l'état +
  les branches.
- [x] **`[DEP-ESBUILD-UNLISTED]`** ✅ 2026-07-31 (V1 — esbuild 0.28.1 épinglé en devDependency) (S — V1) — `esbuild` importé par `mcp/build-server.mjs:10` +
  `mcp/pack.mjs:10` mais ABSENT de package.json (transitive seulement) → un bump Vite/Vitest peut
  casser le build Cloud Run en silence. `npm i -D esbuild` épinglé.
- [x] **`[DETTE-SHADE-OUTOFPALETTE]`** ✅ 2026-07-31 (V1 — 8/8 remplacés : info-400/success-400/warning-400/surface) (S — V1) — 8 classes Tailwind hors palette = no-op silencieux
  (classe FIX-INK600-TOKEN) : `LifeProjects.tsx:62` text-info-100 · `AssetLocationCard.tsx:120`
  text-info-200 · `ZoomableTimeChart.tsx:170` bg-ink-950 · `StrategyOptimizerPanel.tsx:461`
  bg-ink-900/95 · `ProjectionControls.tsx:109` + `UserConfigFields.tsx:84` text-success-300 ·
  `UsersCard.tsx:297` + `PageSetupGate.tsx:377` text-warning-300 → shade existant le plus proche.
- [x] **`[DEP-DEPENDABOT-26]`** ✅ 2026-07-31 (V1 — @hono/node-server 2.0.12 via npm audit fix ; 0 moderate restant) (S) — 1 alerte moderate ouverte sur main
  (https://github.com/MoKarade/FinanceAI/security/dependabot/26) — bump + npm audit.

---

## ✅ Vagues 2 + 3 + findings (PR #551 mergée 2026-07-31, PR #552 mergée 2026-08-01)

> V2 (meltdown honnête, #551) · V2'/V2''/V3/findings panel/héritage (#552, squash `32a112f`).
> Panel #552 : 4 agents, tout MESURÉ (conservation 20/20, INV-9 ≤ 0,02 $/301 mois, amortissement
> forme fermée écart 0, achat futur bit-identique). Tickets RESTANTS ouverts par le panel :
> [ENG-PAST-OWNED-VS-PLANNED], [ENG-RENEWAL-RATE-MISMATCH], [IMMO-3-FORMULES],
> [ENG-PROPGROWTH-ZERO-INEXPRIMABLE], [ENG-NETTRANSFER-REER-INCOMPLET], [ENG-RENEWAL-M0],
> [ENG-CELIAPP-RESIDUAL-PASTBUY], [UX-ISACTIVE-SEMANTIQUE] — au BACKLOG vivant.

- [x] **`[WHT-DISPLAY-MELTDOWN]`** ✅ 2026-07-31 (V2, PR #551 — `rrspWithholdingMois += meltResult.withholding`,
  discriminant prouvé, NW bit-identique pinné par golden). Précision panel #551 : la retenue entrait
  déjà dans le crédit décembre ; le vrai gain = COHÉRENCE de convention entre stratégies (ratio
  MELTDOWN/AUTO 0,601 → 1,400) — la reco « objectif impôt » recommandait MELTDOWN à tort (corrigé).
  Valeur absolue toujours sur-évaluée pour toutes → [PROJ-TTP-DOUBLECOUNT] (vivant).
- [x] **`[ENG-MELTDOWN-FLOW-INVISIBLE]`** ✅ 2026-07-31 (V2, PR #551 — `retraitReerMois += meltResult.reerDrawn`,
  Σ RetraitREER ≥ 90 % du REER drainé prouvé) — ~96 % des sorties invisibles avant (30 496 $ affichés
  pour 794 303 $ tirés) : tooltip/modal/jalons/MCP aveugles.
- [x] **`[ENG-FERR-FLOW-INVISIBLE]`** ✅ 2026-07-31 (V2'', PR #552) — FERR obligatoire + retraits de
  goals alimentent `retraitReerMois` (113 418 $ = 11,6 % invisibles avant) ; test discriminant
  fixture 73 ans (Σ ≈ 0 sur l'ancien code pour 80 k$+ drainés). Identité de compte REER :
  Σ|résidu| 330 354 $ → 1 $ sur 301 mois (mesuré par le validator).
- [x] **`[ENG-HERITAGE-INFLOW]`** ✅ 2026-08-01 (PR #552, rapporté par Marc « héritage marche pas ») —
  `applyLifeEvents` n'avait AUCUNE branche de rentrée d'argent : un HERITAGE était DÉBITÉ comme
  dépense one-shot (impact net −2× le montant). Branche +liquide non imposable + 4 tests (delta
  ±50 k$, saut au mois de l'événement, piège « vente » dans le nom, NaN) — discriminant prouvé par
  stash (3/4 échouent sur l'ancien code).
- [x] **`[DASH-IMMO-EQUITY-WRITERS]`** ✅ 2026-07-31 (V2' — racine trouvée et corrigée : **le MOTEUR
  traitait un bien à purchaseDate PASSÉE comme un achat À FAIRE** — re-débit de la mise de fonds au
  m0 si le cash suffisait, « Achat reporté » à l'INFINI sinon → Immobilier = 0 sur tout l'horizon
  (mesuré). Fix : helper partagé `services/projection/pastPurchaseInit.ts` (init DÉTENU aux
  conventions du moteur : prime SCHL, PMT d'origine, solde amorti forme fermée, valeur appréciée)
  consommé par l'init `propertiesState` du moteur ET par le KPI Accueil (`presentEquityOfGoal` —
  champs explicites prioritaires, F4 : filtre isActive + gate équité ≠ 0 + garde non-fini tracée).
  11 tests dont discriminant (Immobilier = 0 sur l'ancien code) + INV-9 + conservation/fuzz/personas
  verts.) — ancien texte : le terme équité immo du KPI Accueil
  est INERTE (`RealEstateGoal.currentValue`/`mortgageBalance` sans AUCUN écrivain UI) → un
  propriétaire modélisé par price/downPayment a un KPI sans sa maison pendant que le Futur l'inclut
  (mesuré : 81 609 $ moteur vs 0 KPI). Trancher : brancher sur ce que l'UI possède OU retirer le
  terme. En même temps (F4) : gate `equity !== 0`, filtre `isActive`, gardes `Number.isFinite` +
  logErrorThrottled (3 sites).
- [x] **V3 détail** ✅ (PR #552) : [DEFAULTS-DRIFT-FINTABLE-FIELDS] (4 champs + garde
  bidirectionnelle registryParity) · [TEST-GAP-TAXESTIMATE] · [TEST-GAP-SUBSCRIPTIONS] ·
  [TEST-GAP-ROLESCONFIG] · [PV-11e] (pin Σ reerByUser == REER, couple inégal + goal REER) ·
  [NW-PARITY-SURFACES-TEST] (conventions équité immo par surface + fix PDF `equity: 0`).
- [x] **Findings panel #552 corrigés dans #552 même** ✅ 2026-08-01 : graine prevNW/minNetWorth
  ensemencée (flux fantôme +156 629 $, plancher −158 731 $) · substitution loyer↔PMT neutre au boot
  (sur-charge 20 084 $/an) · champs explicites honorés par le moteur (écart 291 676 $) ·
  sanitisation immo frontière (968 non-finis) · garde non-fini dans presentEquityOfGoal
  (3 consommateurs) · équité historique PAR ANNÉE au graphe Accueil (+77 097 $ sur 2022) ·
  log « supposée DÉTENUE » au m0 · docs PROJECTION/OUTPUT_SCHEMA + 3 leçons CONVENTIONS.


# (Contenu intégral du BACKLOG au 2026-07-31, avant refonte)

# BACKLOG — FinanceAI (actionnable)

> Liste **courte** de ce qui RESTE à faire. L'historique complet des items livrés est
> archivé dans [`docs/HISTORIQUE.md`](HISTORIQUE.md) (fusion de tous les snapshots/audits/designs livrés).
> Audit qualité détaillé : voir `docs/HISTORIQUE.md` (section `AAA_AUDIT_2026-06.md`).
> Actions humaines (Marc) : [`docs/A_FAIRE_MOI.md`](A_FAIRE_MOI.md).

## 🔎 Chantier « analyse des transactions » (cadrage validé Marc 2026-07-31, 27 questions — 3 PR)

> Demande verbatim : « je veux une meilleure analyse de mes transactions […] ça detecte mal mes
> transferts entre comptes ça met abonnement pour tout et nimporte quoi je veux du précis ».
> **Critère d'arrêt (Marc)** : moins de **1 % de transactions mal classées, mesuré sur 300 tirages**
> (revue d'échantillon DANS l'app — Marc a refusé de fournir un export de référence, donc la mesure
> doit être un outil de l'app, pas un jeu de test hors ligne).
> **Décisions Marc** : marquage des virements AUTOMATIQUE · la re-catégorisation peut ÉCRASER une
> catégorie existante, SAUF une correction manuelle (verrou par transaction, PAS de règle par
> marchand) · écran de tri dans l'onglet Transactions · moteur HYBRIDE règles + IA, « vraiment précis
> pas sur des mots bateau » · passe IA sur tout l'historique · catégories à plat, jeu actuel OK ·
> abonnement = service RÉCURRENT (achat unique chez un marchand d'abo → Loisirs) · abos fantômes oui.
> **Comptes de Marc** : PCA = compte courant, TS1 = épargne, Mastercard = crédit, + placements.

- [x] **`[TX-TRANSFERS]`** ✅ (2026-07-31, PR 1/3) — appariement des virements internes SORTI de
  `services/fintable/` vers un cœur générique `services/transactions/detectTransfers.ts` (montants
  exactement opposés au cent, ≤ 3 jours, comptes DIFFÉRENTS, appariement 1:1 sur la contrepartie la
  plus proche, Interac exclu par règle métier). Fintable délègue au cœur en gardant sa contrainte de
  rôles via la garde `canPair` → une seule copie de l'algorithme. Appliqué automatiquement à l'import
  (`App.tsx`, sur l'historique COMPLET : les deux côtés peuvent venir de deux imports différents) +
  panneau « Virements internes » (`components/transactions/TransfersPanel.tsx`) pour le rattrapage et
  la confirmation. **Deux régimes** : `confirmed` (comptes connus et différents → marqué d'office) vs
  `suggested` (compte inconnu d'un côté → jamais écrit). `accountName` désormais émis PAR TRANSACTION
  (Fintable n'en émettait aucun). 19 tests dédiés, suite complète verte (3352).
- [x] **`[TX-CATEGORIZE]`** ✅ (2026-07-31, PR 2/3) — catégorisation précise. **Cause racine mesurée** : la règle
  « Abonnements » (`services/import/categoryRules.ts:115`) décide sur le LIBELLÉ seul (`GOOGLE \*`,
  `MICROSOFT`, `APPLE\.COM`, `\bBELL\b`) et passe AVANT Santé/Loisirs/Magasinage → un accessoire
  Apple, un jeu Xbox et un achat Google Play tombent tous en « Abonnements ». Or la décision de Marc
  (achat unique chez un marchand d'abo → Loisirs) rend le libellé structurellement insuffisant :
  il faut un **profil de récurrence par marchand** (nb d'occurrences, régularité, stabilité du montant)
  calculé AVANT de décider, puis règles précises, puis IA sur le reste avec ce contexte.
  **Livré** : `merchantProfile.ts` (profil de récurrence pur) + `contextualCategorize.ts` (promotion
  en « Abonnements » réservée aux marchands AMBIGUS que le profil prouve) + `AMBIGUOUS_SUBSCRIPTION_RULES`
  (Google Play / App Store / Microsoft / YouTube / Twitch / Patreon / Steam / PlayStation / Nintendo →
  Loisirs par défaut) + bouton « Tout recatégoriser » (historique complet, verrou `status === 'manual'`).
  **PR 3 livrée** : `[TX-REVIEW]` — `services/transactions/reviewSample.ts` (tirage seedé déterministe,
  intervalle de WILSON, verdict « indéterminé » tant que l'intervalle chevauche le seuil) + panneau
  « Mesurer la qualité du classement ». ⚠️ **Le « 300 tirages » du cadrage est INTENABLE** : à 300
  jugements sans aucune erreur, la borne haute reste à 1,26 % — il en faut **390**, et la constante est
  DÉRIVÉE du calcul (`samplesNeededForThreshold`), jamais re-tapée.
- [x] **`[TX-INTERAC-BUDGET]`** ✅ (2026-07-31, PR 2/3) — Marc veut qu'un Interac à sa conjointe
  compte comme une **vraie dépense**, mais « Remboursement » est dans `NON_BUDGET_CATEGORIES`
  (`utils/budgetSync.ts:16-26`) → aujourd'hui ces montants sont invisibles au Budget (ni dépense, ni
  revenu). ⚠️ Le sortant et l'entrant ne sont pas symétriques : compter le sortant en dépense sans
  traiter l'entrant (« on me rembourse ») surévaluerait les dépenses. Design proposé : poste à part
  entière, l'entrant venant en crédit du même poste.
- [x] **`[TX-SUBSCRIPTIONS]`** ✅ (2026-07-31, PR 3/3) — abonnements fantômes (hausse de prix silencieuse, service qui
  a cessé d'être débité, coût annuel réel). Repose sur le profil de récurrence de la PR 2. ⚠️ L'actuel
  détecteur heuristique (`components/Planning.tsx:55`) exige ≥ 2 occurrences, montant stable à ±5 $ et
  20-40 jours d'écart : un abo dont le prix monte de 3 $ finit par sortir de la liste.

---

## 🏦 Chantier FINTABLE — sync bancaire & investissements (cadrage validé Marc 2026-07-29, 14 questions)
> ADR complet : `docs/decisions.md` § « Sync bancaire & investissements via Fintable ».
> Décisions verrouillées : Fintable = PRODUCTEUR de `DocumentPayload` (aucun nouveau moteur de fusion —
> `applyDocument` couvre déjà `bank_statement` / `broker_statement` / `cash_balance`) ; exécution SERVEUR
> (Cloud Run, cron quotidien) jamais navigateur ; jeton lecture seule en Secret Manager ; écriture via
> `runApply` (OCC + sauvegarde horodatée) ; import manuel CONSERVÉ mais masqué ; tools MCP existants INCHANGÉS.

- [x] **`[FINTABLE-0]` ADR + jeton en Secret Manager** (S) — ✅ 2026-07-29. Jeton `financeai-fintable-token`
  créé par Marc (scope lecture seule). ⚠️ Incident : le 1ᵉʳ jeton (read+write) avait été collé en clair dans
  un chat → RÉVOQUÉ et remplacé avant tout usage. Découverte de cadrage qui RÉDUIT le chantier : la chaîne
  d'ingestion existante couvre déjà toute la fusion → le travail restant est un lecteur + un mapper pur,
  pas un pipeline (classe `R2-FIRE` : vérifier l'état RÉEL avant de coder).
- [x] **`[FINTABLE-1]` Lecteur → `FintableSnapshot` normalisé** (M) — ✅ 2026-07-29. Forme de l'API
  **VÉRIFIÉE** (docs officielles fournies par Marc → ADR mis à jour). `services/fintable/` : `types.ts`
  (formes brutes + modèle normalisé + `FintableError` à code typé transitoire/confirmé), `decode.ts`
  (décodage STRICT), `client.ts` (Bearer, enveloppe, pagination par curseur, 429 + `Retry-After`,
  timeout couvrant la LECTURE DU CORPS), `readSnapshot.ts` (orchestration, pannes partielles tracées).
  `npm run fintable:dry` (montants MASQUÉS par défaut → sortie partageable ; `--show-amounts` en local).
  50 tests. ⚠️ Le dry-run RÉEL doit être lancé par Marc (`fintable.io` inatteignable depuis l'exécution
  cloud) → routé dans `A_FAIRE_MOI.md`.
- [x] **`[FINTABLE-1b]` Docteur « pourquoi ma donnée n'arrive pas »** (S) — ✅ 2026-07-29, né du 1ᵉʳ
  dry-run réel : 3 comptes de placement, **0 position**, et AUCUNE erreur (les appels ont réussi en
  rendant des listes vides). Un vide sans explication est la classe « staleness silencieuse » → lire
  l'état du COMPTE, pas les données. `readDiagnostics.ts` (`/me` droits du plan, `/connections` santé +
  historique de sync, `/integrations`) + `explainMissingData` (raisonnement PUR, testable sans réseau) +
  `npm run fintable:doctor`. Défauts prudents : `can_sync`/`healthy` absents → `false` (un docteur
  optimiste écarte la cause la plus probable). 16 tests.
- [x] **`[FINTABLE-2]` Mapper pur `snapshot → DocumentPayload[]` + aperçu** (M) — ✅ 2026-07-29
  (GO Marc : « je paie, on finit le Lot 2 sans les positions »). `services/fintable/mapSnapshot.ts`,
  fonction PURE (aucun réseau, aucune écriture) → `bank_statement` + `cash_balance` + `debt`.
  ⚠️ **Piège money-critical trouvé en LISANT le vrai code de dédup** : `txnKey` porte sur
  `date|montant|PAYEE`, or le payee de Fintable (`merchant`/`description`) ne sera JAMAIS la même
  chaîne que celui extrait des relevés PDF importés à la main → même dépense, clé différente,
  **doublon accepté en silence** qui fausserait `computeStartingCash` ET les dépenses réelles du
  Budget. La fenêtre Fintable (30 j) RECOUVRE l'historique manuel : risque réel, pas théorique.
  Parade = **date de bascule** (`transactionsAfter`, strictement postérieur) — pas de recouvrement,
  donc aucune dépendance à la dédup ; la dédup reste la ceinture. Autres garde-fous : rôle de compte
  toujours EXPLICITE (un compte sans rôle est signalé, jamais rangé par défaut) ; liquidités en
  **tout-ou-rien** (un seul solde manquant suspend la mise à jour — `cash_balance` écrit un DELTA,
  une cible partielle déplacerait le cash en silence) ; solde de carte négatif → `Math.abs` + alerte
  (une dette négative gonflerait le patrimoine) ; devise ≠ CAD écartée et signalée, jamais empilée ;
  dette en mise à jour de SOLDE seulement (ni taux ni paiement minimum inventés → elle doit préexister).
  Aperçu via `npm run fintable:dry -- --roles <fichier.json> --after YYYY-MM-DD` (+ `--show-ids`
  pour construire le fichier ; `.fintable-roles.json` est gitignoré — il contient des ids de comptes).
  16 tests dédiés, dont le scénario réel à 6 comptes. **Volet positions ABANDONNÉ** : Disnat n'est pas
  couvert par SnapTrade chez Fintable (mesuré sur l'annuaire public) — les soldes des comptes de
  placement servent de valeur de RÉFÉRENCE du courtier, jamais de source d'actifs.
- [x] **`[TX-DUPLICATES]` Détection de doublons (demande Marc « enlève les transactions en double »)** (M)
  — ✅ 2026-07-29. **Constat qui a motivé le lot** : `Transaction.isDuplicate` était RESPECTÉ partout
  (exclu de `computeStartingCash`, du Budget, des revenus, du patrimoine) mais **rien ne le mettait
  jamais à `true`** — `parseBankCsv` l'initialise à `false`, personne ne le change ensuite ; et le
  filtre « afficher les doublons » était du code MORT (`_setShowDuplicates` jamais appelé, le `_`
  l'exemptant du lint — classe `DETTE-DEADCODE`). La machinerie d'exclusion existait sans personne
  pour l'alimenter. `services/transactions/duplicateDetection.ts` (PUR) : regroupement par **montant
  exact + date proche** (tolérance 0/1/3 j), le **libellé n'entre PAS dans le critère** — c'est
  justement quand il diffère (deux sources d'import) que la dédup `txnKey` laisse passer le doublon.
  ⚠️ **On MARQUE, on ne SUPPRIME pas** (ADR « Suppressions via MCP/IA » : le cash est dérivé →
  une suppression déplacerait le solde en silence) et **aucun marquage automatique** (deux dépenses
  identiques le même jour sont un vrai faux positif → l'humain valide). Marquage réversible.
  `components/transactions/DuplicatesPanel.tsx` + toggle `showDuplicates` ressuscité. 18 tests.
- [x] **`[FINTABLE-TRANSFERS]` Paiement de carte reconnu comme virement** (S) — ✅ 2026-07-29, trouvé en LISANT l'aperçu réel : importer les deux côtés compte↔carte ferait compter le paiement mensuel comme une dépense EN PLUS des achats (`budgetSync.ts:58` somme les négatifs hors transferts). Le patrimoine reste juste (soldes recalés) — seul le BUDGET mentirait, donc aucun invariant de conservation ne l'attrape. `detectTransfers.ts` : montants exactement opposés + rôles différents (cash→dette) + dates proches + appariement UN POUR UN, déterministe. 13 tests.
- [x] **`[FINTABLE-3]` Cron quotidien Cloud Run** (M) — ✅ 2026-07-29. `mcp/runFintableSync.ts` (orchestrateur :
  lecture Fintable → mapper Lot 2 → `applyDocument` → écriture ATOMIQUE `store.save(next, version)`, patron
  EXACT de `runPriceRefresh`/HUB-REFRESH-CRON). `POST /fintable-sync` dans `mcp/http.ts` (secret DÉDIÉ
  `FINANCEAI_FINTABLE_SYNC_SECRET`, distinct de `FINANCEAI_REFRESH_SECRET` — périmètre différent, autorise
  l'écriture de tx/soldes réels). Cadence 1×/jour (choix Marc), déclencheur `.github/workflows/fintable-sync.yml`
  (gratuit, même mécanique que `refresh-prices.yml`). Date de bascule anti-doublon **DÉRIVÉE À CHAQUE PASSE**
  (`deriveCutoverDate` — la transaction la plus récente déjà connue, jamais une valeur figée à maintenir).
  Rapport `AppState.fintableSyncReport` **TOUJOURS écrit** (succès ou échec — comptes vus, tx ajoutées, virements
  détectés, cash/dettes MAJ, avertissements, erreur) → carte « Sync Fintable » dans Système & diagnostics, visible
  sans notification proactive (choix Marc). Conflit OCC = transitoire (relancé tel quel, PAS de rapport d'échec,
  le prochain tick réessaie) ; panne réelle Fintable/Drive = rapport d'échec persisté + 5xx (le cron GitHub rougit).
  20 tests (`deriveCutoverDate` 4 + `runFintableSync` 10 + carte UI 6). `parseRolesJson` extrait en module
  PARTAGÉ (`services/fintable/rolesConfig.ts`) consommé par `fintable:dry` ET le serveur — zéro copie qui dérive.
  ⚠️ **Panel de 7 agents (code-reviewer, silent-failure-hunter, financial-integrity, security-privacy,
  projection-validator, documentation-manager, a11y-auditor) sur cette même PR : 6 findings VRAIS corrigés**
  (tous mesurés/vérifiés) — voir le bloc de leçons `[FUTUR-PAST-DEBT-FREEZE]` dans `CLAUDE.md` pour le détail :
  isolation par payload dans la boucle d'application (un solde de dette 0 bloquait TOUTE la sync), bascule
  plafonnée à aujourd'hui (une transaction future gelait la sync à `transactionsAdded:0` en silence), lecture
  d'état initiale déplacée DANS le bloc protégé (garantit le rapport « toujours écrit » même si `getWithVersion`
  échoue), montant $ retiré d'un message d'avertissement (fuyait en clair dans les logs GitHub Actions),
  `fintableSyncReport` ajouté à `DEFAULT_APP_STATE` (sinon survivait au switch de persona démo), carte UI
  durcie contre une forme corrompue (`Array.isArray` + `logError`, jamais un crash de render).
- [x] **`[FINTABLE-4]` Import manuel répliqué et masqué** (S) — ✅ 2026-07-29. CONSERVÉ intégralement comme
  repli (Q1) : `ImportBankStatement` reste pleinement fonctionnel (même composant, même pipeline
  `parseBankCsv`/`applyDocument`), rien retiré. Déplacé hors du flux principal : le bouton du header
  `Transactions.tsx` (toujours visible dans les actions de la `PageHeader`, donc « dans » le flux principal
  au sens propre) est remplacé par une disclosure `<details>` native (convention établie, cf
  `AdvancedProjectionParams`/`HistoryCoverageNote`) — **repliée par défaut** dès qu'il y a des transactions
  (Fintable synchronise déjà le quotidien), **ouverte automatiquement** à l'onboarding (0 transaction, D2 —
  l'écran vide reste jamais une impasse). L'instance de Réglages → Comptes (`AccountsSection.tsx`) était déjà
  hors du flux principal, INCHANGÉE. Le formulaire de courtage (`ImportBrokerPositions`, `Investments.tsx`)
  reste au premier plan — c'est le SEUL chemin pour les positions (FINTABLE-POSITIONS : Disnat hors SnapTrade).
  Panel ciblé de 3 agents (code-reviewer, a11y-auditor, silent-failure-hunter — pur diff UI, pas de calcul $) :
  ZÉRO finding bloquant. Confirmé empiriquement : `aria-expanded` retiré n'est pas une régression (le rôle
  natif `<details>/<summary>` expose déjà l'état à l'arbre d'a11y) ; `text-ink-300` du summary passe AA/AAA
  sur les 3 fonds sombres (6,93-7,77:1, mesuré) ; `open={transactions.length===0}` ne fige qu'UNE transition
  (true→false au 1er import, jamais recontesté ensuite — comportement voulu, pas un bug de contrôle React).
  1 finding non-bloquant routé au BACKLOG (`[A11Y-DETAILS-TAP-TARGET]`, ci-dessous — pré-existant, pas
  introduit par ce diff).
  3 tests mis à jour (`Transactions.import.test.tsx`) : discriminant sur l'attribut `open` de `<details>`,
  PAS `queryByText` (jsdom ne cache pas le contenu d'un details fermé, cf leçon `[[INVEST-CHART-CLEAN]]`) —
  et un `fireEvent.click` sur `<summary>` bascule bien `open` en jsdom (mesuré, pas supposé).
  ⚠️ **Découverte en chemin** : `text-info-300` est un token Tailwind INEXISTANT (palette `info` = 400/500/600
  seulement, cf `[[FIX-INK600-TOKEN]]`) — no-op silencieux, ~12 occurrences dans `components/` (corrigé
  seulement l'instance touchée par ce diff, `Transactions.tsx:436`) → nouvel item `[A11Y-INFO300-SWEEP]` ci-dessous.
- [x] **`[FINTABLE-6]` Lot 1 — le montant du COURTIER fait autorité : fondation** (M) — ✅ 2026-07-30.
  Demande Marc : « je veux que dans investissements ça utilise exactement le montant que j'ai dans
  Fintable » + « que l'accueil utilise Fintable aussi ». **Constat en LISANT le code** : `investmentBalances`
  était calculé par `mapSnapshot` puis **JETÉ** — seul un compteur (`investmentReferenceCount`) survivait
  dans le rapport. Une donnée produite sans consommateur : rien à brancher, il fallait d'abord la stocker.
  Livré : (a) `FintableAccountRole.investment` porte un `taxRegime` OPTIONNEL (`CELI|REER|NON-ENREG`),
  **jamais inféré** — absent = solde affiché mais écart hors projection, SIGNALÉ (dégradation gracieuse,
  pas d'échec de passe) ; (b) `AppState.fintableBrokerBalances` (additif, zéro migration) clé sur
  `accountId` STABLE — jamais le libellé, renommable côté banque (classe `[[INVEST-ALLOC-GEO-SECTOR]]`) —
  + horodatage `at` pour afficher honnêtement la fraîcheur ; (c) `services/fintable/brokerBalances.ts`,
  module PUR source-unique de la réconciliation, consommé plus tard par Investissements ET Accueil (pas
  deux copies qui dérivent) ; (d) ajouté explicitement à `DEFAULT_APP_STATE` (leçon PERSONA-PURGE de la PR #531).
  **Granularité = le PANIER FISCAL, pas le compte** : les `Asset` ne portent pas d'id de compte courtier,
  seulement `accountType` → réconcilier par compte est structurellement impossible, c'est documenté et non subi.
  ⚠️ **Mon propre test a attrapé mon propre bug** : `Number.isFinite(Number(x))` ne protège PAS de `null`
  (`Number(null) === 0`) → un solde ABSENT devenait un **0 $ crédible** effaçant le compte du patrimoine.
  Exactement le piège `[[FINTABLE]]`, retombé dedans en l'écrivant. Garde null-explicite AVANT conversion,
  aux DEUX bouts (écriture + lecture d'un état Drive non validé par Zod). 19 tests.
- [x] **`[FINTABLE-7]` Sync Fintable DEPUIS LE NAVIGATEUR — réseau + runner** (M) — ✅ 2026-07-30.
  Demande Marc : « je veux que tu fasses tout toi, sans que j'aie besoin de t'aider ». **Mesuré avant
  de décider** : `gcloud` ABSENT du conteneur, aucun identifiant GCP, `fintable.io` = 403 CONNECT
  (politique réseau), aucun outil MCP pour créer un secret GitHub → le chemin Cloud Run exige
  IRRÉDUCTIBLEMENT les identifiants de Marc (3 secrets + redeploy + secret Actions). Le chemin
  navigateur ne demande QUE de coller le jeton dans Réglages. Livré : (a) proxy same-origin
  `/api/fintable/:path*` → `fintable.io/api/v2/*` (`vercel.json` + `server.proxy` vite dev/preview),
  patron EXACT de Yahoo → `connect-src 'self'` couvre, **zéro domaine ajouté à la CSP** ; (b)
  `apiKeys.fintable` (optionnel, même traitement que les autres clés) ; (c) `AppState.fintableRoles`
  — remplace le fichier `.fintable-roles.json` que Marc devait écrire à la main puis pousser en secret
  GCP ; (d) `services/fintable/browserSync.ts` qui RÉUTILISE tel quel lecteur/mapper/`applyDocument`/
  `toPersistableBrokerBalances` (zéro logique dupliquée — seuls le transport et le porteur d'état
  changent), avec les MÊMES garanties que le cron : rapport toujours rendu, isolation par payload,
  bascule plafonnée à aujourd'hui, et `nextState: null` sur échec (jamais d'état à moitié appliqué).
  Garde de parité au COMPILE entre le rôle PERSISTÉ (`types.ts`, sans dépendance) et le rôle du
  MAPPER (pur) — les deux formes sont volontairement séparées, leur divergence casse le typecheck.
  ⚠️ **Compromis assumé, dit dans la PR** : le jeton vit dans le navigateur et transite par l'edge
  Vercel (vs Secret Manager) — scope LECTURE SEULE, ce qui borne le risque ; et ça ne tourne pas
  application fermée. Le cron serveur reste en place, prioritaire si Marc monte la config un jour. 7 tests.
- [x] **`[FINTABLE-7]` Lot 2 — UI Réglages : coller le jeton + assigner les rôles par clic** (M) — ✅ 2026-07-30.
  `components/settings/FintableSyncCard.tsx`, rendue dans **Réglages → Clés API** (sous-onglet
  `integrations`, `Settings.tsx`). Bouton « Tester » qui liste les comptes réels (sans pager les
  transactions ni les positions), puis un rôle par compte (liquidités / dette + nom EXACT / placement
  + régime / ignorer). Marc a dit « c'est tout non enregistré pour le moment » → « Placement »
  pré-remplit `NON-ENREG`. ⚠️ **AUCUN montant rendu** par la carte (verrouillé par test) → pas de
  surface à garder en mode discret. Sync coupée en mode démo. Échec de passe → seul le RAPPORT est
  écrit. L'état est écrit par **delta de référence** (jamais une liste de clés à la main : la 1ʳᵉ
  version perdait déjà `lastUpdate`). 8 tests.
- [x] **`[FINTABLE-BROWSER-RELATIVE-BASE]` « url invalide » alors que Marc collait un JETON** — ✅ 2026-07-30.
  `buildUrl` faisait `new URL(base + path)` à UN argument (exige une URL absolue) → `TypeError: Invalid
  URL` sur la base relative du proxy navigateur `/api/fintable`. Résolue contre `location.origin` ;
  chemin cron bit-identique (`new URL(absolue, undefined)` ignore le 2ᵉ argument). ⚠️ Cause du trou de
  test : les 7 tests `browserSync` injectaient tous un client factice → le chemin PAR DÉFAUT (celui de
  la prod) n'était exercé nulle part. 3 tests ajoutés sans injection, discriminant prouvé.
- [x] **`[FINTABLE-BROWSER-FETCH-RECEIVER]` « échec réseau (TypeError) » avec un jeton valide** — ✅ 2026-07-30.
  `this.fetchImpl = opts.fetchImpl ?? fetch` puis `this.fetchImpl(...)` fait de `this` l'INSTANCE au
  lieu de `window` → le binding WebIDL lève `Illegal invocation`. MESURÉ dans un vrai Chromium (sonde
  Playwright), pas déduit. Fix = wrapper. ⚠️ jsdom/undici n'appliquent pas la règle → le garde SIMULE
  la vérification de récepteur. Grep de la classe : instance unique dans le dépôt.
- [x] **`[FINTABLE-7]` Lot 3 — déclenchement AUTOMATIQUE de la passe à l'ouverture** (S) — ✅ 2026-07-31.
  `services/fintable/autoSync.ts` (`maybeRunDailyFintableSync`) : gardes = jeton présent + PAS mode test +
  dernière passe RÉUSSIE ≥ 24 h (un ÉCHEC ne gèle pas 24 h — c'est le cooldown de TENTATIVE 1 h,
  device-local, qui borne les retries anti-boucle-F5) + mutex en vol. Déclenché par un effet App RÉACTIF
  au jeton (hydraté async depuis le coffre — un timer au boot lirait un store vide). Patch d'état par
  `referenceDeltaPatch` (`applyStatePatch.ts`), EXTRAIT de FintableSyncCard au moment du 2ᵉ consommateur
  (une seule copie). Échec → seul le rapport est persisté (diagnostics), pas de toast anxiogène quotidien ;
  succès avec transactions → toast discret (compte, jamais de montant). 15 tests.
  **Panel #545 (3 agents — 5 vrais findings, tous corrigés même PR)** : (1) CRITIQUE code-reviewer —
  AUCUNE exclusion mutuelle auto↔manuel (2 passes concurrentes sur bases figées = dernier-écrivain-
  gagne sur transactions/soldes) → verrou PARTAGÉ `acquireFintableSyncLock` consommé par les deux
  chemins ; (2) ÉLEVÉ security-privacy PROUVÉ PAR SONDE — TOCTOU `isTestMode` : basculer en démo
  PENDANT le fetch écrivait de VRAIES transactions dans la session persona (inverse de PERSONA-PURGE)
  → re-check FRAIS avant TOUTE écriture (contenu ET rapport), les 2 chemins ; (3) ÉLEVÉ silent-failure
  — un coffre avec le jeton Fintable SEUL (ni Anthropic ni Finnhub) n'était JAMAIS restauré au boot
  (`App.tsx` gate `anthropic||finnhub`) → jeton perdu à chaque reload, feature neutralisée en silence
  → `|| fintable` ajouté ; (4) « ne LÈVE jamais » était faux (throw importWithRetry → unhandledrejection)
  → catch + outcome 'error' + rapport d'échec écrit ; (5) debounce 3 s de l'effet (jeton tapé
  caractère par caractère → passe avec jeton incomplet). Discriminants = sondes des agents (code non
  encore mergé au moment des fixes, leçon AITOOLS-B).
- [ ] **`[FINTABLE-SYNC-STALE-BASE]`** (M, résiduel code-reviewer + security-privacy #545, ASSUMÉ) —
  une passe de sync (auto ou manuelle) calcule son `nextState` sur un snapshot capturé AVANT le fetch
  réseau (plusieurs secondes) : une ÉDITION manuelle d'une transaction pendant cette fenêtre peut être
  écrasée par le patch (dernier-écrivain-gagne sur les clés que la sync touche). Le verrou #545 exclut
  les passes ENTRE ELLES, pas sync-vs-édition. Vrai fix = séparer fetch et application (ré-appliquer
  `applyPayloadsIsolated` sur l'état FRAIS au moment de l'écriture). Sœur : le cooldown localStorage
  n'est pas un mutex CROSS-ONGLET (2 onglets bootant en même temps peuvent courir tous les deux —
  fenêtre étroite, même jeton, intégrité seulement).
- [x] **`[FINTABLE-6]` Lot 2 — consommer le montant courtier dans Investissements + Accueil** (M) —
  ✅ 2026-07-31. `BrokerReconciliationCard` (UNE implémentation, variantes `full` Investissements /
  `compact` Accueil — pas deux copies) : total par panier = solde COURTIER (autorité), ligne « écart
  (non ventilé) » explicite (Σ titres + écart == total courtier, reconstructible), badge de fraîcheur
  borné par la lecture la plus ANCIENNE (`fraîcheur inconnue` si un compte n'a pas d'horodatage),
  avertissements comptes sans régime déclaré / soldes illisibles. `holdingsCadByRegime`
  (`services/fintable/holdingsByRegime.ts`) DÉRIVE la famille fiscale de `BUCKET_OF` (source unique,
  même table que les piles de l'Accueil : CELIAPP→CELI, REEE→REER, MARGE/AUTRE/absent→NON-ENREG,
  CRYPTO hors réconciliation) et somme via `assetValueCad`. `formatRelative` extrait de SystemView
  vers `utils/relativeTime.ts` (consolidé AVANT la 2ᵉ copie). Ship dark sans sync Fintable ; purge
  persona par construction (`fintableBrokerBalances` ∈ DEFAULT_APP_STATE). 11 tests.
  **Panel #543 (4 agents — 5 vrais findings, tous corrigés même PR ; reconstructibilité et FX vérifiés
  EXACTS, résidu 0,0)** : (1) CRITIQUE convergent (3 agents, mesuré −171 k$) — la variante compacte
  rendait « 0 $ » d'autorité quand tous les comptes étaient non déclarés → état honnête sans montant
  (« N comptes sans régime déclaré ») + mention « + N compte(s) hors total » quand des comptes sont
  exclus d'un total affiché ; (2) valeur NÉGATIVE (quantité corrompue) écartée en silence avec un
  commentaire qui prétendait qu'assetValueCad la signalait (il ne loggue que NaN/devise) → tracée
  `logErrorThrottled` ; (3) a11y : `role=status/alert` sur les avertissements (ils apparaissent en
  cours de session via le polling Drive — WCAG 4.1.3) ; (4) `at ≤ 0` (horodatage corrompu encodé 0)
  affichait « vu jamais » et contaminait le panier via Math.min → traité inconnu à la lecture ;
  (5) doc : base carte = PRÉSENT (quote × quantité courantes) ≠ piles TOTAL_* (close daté × détention
  datée) — divergence VOULUE, documentée en tête de module pour la prochaine session.
- [x] **`[DASH-NETWORTH-CANONICAL]` L'Accueil est la SEULE surface qui recalcule le patrimoine** (M,
  diagnostic `financial-integrity` 2026-07-30, demande Marc « l'accueil fait aucun sens » / « je veux
  source unique ») — ✅ 2026-07-31. Le KPI « patrimoine global » lit désormais `presentNetWorth` =
  `computePresentNetWorth(initialBalances, transactions, assets, fxRates, debts) + équité immo`
  (MÊME expression que l'ex-repli sans CSV — le piège « computePresentNetWorth nu ferait CHUTER le
  patrimoine de l'équité immo » évité comme prévu au ticket), dans TOUS les cas — plus JAMAIS
  `latestTotals.Total` (dernier point d'un historique figé au dernier close, cash gated accountName).
  `latestTotals` retiré du memo (code mort dans le même diff, leçon DETTE-DEADCODE). Le GRAPHE et la
  variation restent sur l'historique (présent ≠ histoire, assumé — le KPI dit le présent comme toutes
  les autres surfaces). Discriminant : test avec historique PÉRIMÉ injecté (mock `usePortfolioHistory`)
  → l'ancien KPI affichait ~500 $, le nouveau 140 600 $ (rouge sur l'ancien code, prouvé git-stash).
  Restes du ticket NON couverts ici (symptômes 2-3, périmètre graphe/cartes — l'axe des dates, le
  cash `accountName`-gated de l'HISTORIQUE, les cartes vides) : l'essentiel (le chiffre-titre faux)
  est réglé ; le graphe historique est un chantier séparé si Marc le redemande.
  **Panel #544 (3 agents)** : silent-failure = 0 finding (le retrait du `Number(x)||0` CORRIGE même un
  masquage — NaN affichait « 0 $ », désormais « — ») ; code-reviewer → Variation étiquetée « (courbe
  historique) » + tooltip (sinon la classe « deux patrimoines à l'écran » revenait entre 2 KPIs
  adjacents) ; financial-integrity (MESURÉ, parité 203 800 $ exacte sur toutes les surfaces hors immo,
  double-comptage immo RÉFUTÉ) → F1 corrigé même PR : `rc` non amorcé sur les comptes venus des
  TRANSACTIONS (accountName Fintable/CSV ∉ initialBalances) → `point.Total` NaN → **Variation figée à
  0,00 % en permanence** (mesuré) — amorçage à 0 comme `runningCash` + test discriminant. F2-F4 → tickets ci-dessous.
- [ ] **`[DASH-IMMO-EQUITY-WRITERS]`** (M, finding financial-integrity #544 F2/F4, MESURÉ) — le terme
  « équité immo » du KPI Accueil est INERTE en prod : `RealEstateGoal.currentValue`/`mortgageBalance`
  n'ont AUCUN écrivain (aucune UI ne les édite — RealEstate.tsx ne les expose pas, PatrimoineExtended
  édite `RentalProperty`, un autre type) → `hasRealEstate` toujours false, l'étiquette « équité immo
  incluse » ne s'affiche jamais, et un propriétaire modélisé par `price`/`downPayment` a un KPI SANS sa
  maison pendant que le Futur l'inclut (mesuré : `Immobilier` 81 609 $ moteur vs 0 au KPI). Classe
  [[TX-DUPLICATES]] « champ que seuls des lecteurs référencent ». À trancher : brancher l'équité sur ce
  que le moteur/l'UI possèdent réellement, OU retirer le terme + l'étiquette. En même temps (F4) : gater
  l'étiquette sur `equity !== 0` (pas `currentValue > 0`), filtrer `isActive` (comme moteur/PDF), et
  ajouter la garde `Number.isFinite` + `logErrorThrottled` sur currentValue/mortgageBalance (3 sites,
  note silent-failure : `||0` couvre NaN mais pas Infinity — aujourd'hui rattrapé en « — » par formatCAD,
  sans trace pour diagnostiquer).
- [ ] **`[NW-PARITY-SURFACES-TEST]`** (S-M, reco financial-integrity #544 — le garde-fou keystone de
  l'audit 2026-06-17, toujours manquant) — test de PARITÉ « NW présent ≡ toutes surfaces (KPI Accueil,
  useDerivedFinancials, financialSnapshot IA/MCP, PDF) ≡ `chartData[0]` (modulo équité immo, convention
  par surface EXPLICITE) » sur un persona endetté + propriétaire. C'est le test qui aurait attrapé
  mécaniquement F2 et l'inexactitude doc F5. `tests/services/nwParity.test.ts` couvre déjà
  moteur↔computePresentNetWorth — l'étendre aux surfaces UI.
- [ ] **`[DASH-HIST-CARDS-LABEL]`** (S, finding financial-integrity #544 F3) — sur l'Accueil, le KPI dit
  le PRÉSENT mais les cartes « Actifs individuels » et le graphe restent au dernier close → la
  reconstructabilité à l'écran ne tient plus SANS que rien ne le dise. Étiqueter les cartes « au dernier
  cours de clôture » (réutiliser `staleTailSymbols`/`noHistorySymbols` de usePortfolioHistory).
- [x] **`[A11Y-INFO300-SWEEP]` `text-info-300` inexistant (no-op silencieux) — sweep dédié** (S) —
  ✅ 2026-07-31. 13 occurrences → `text-info-400`, MESURÉ `check-contrast` (7,84 / 7,49 / 6,99:1, AA
  normal ✅ sur les 3 fonds opaques). Preuve build PROPRE (`rm -rf dist`) : `.text-info-400` générée,
  `.text-info-300` absente du CSS (le no-op silencieux confirmé — le texte héritait du parent).
- [x] **`[A11Y-DETAILS-TAP-TARGET]` `<summary>` sous la cible tactile 24×24px (WCAG 2.5.8)** (S) —
  ✅ 2026-07-31. Sweep des 9 `<summary>` du repo : 4 avaient déjà un `py-*` (Budget, HistoryCoverageNote,
  HistorySyncDoctor ×2), les 5 autres reçoivent `py-1.5` (26-34 px mesurés). ⚠️ **Finding a11y-auditor
  (MESURÉ en Chromium réel) : `inline-block` sur un `<summary>` est INUTILE pour la hauteur (le padding
  compte déjà sur `list-item`) et NUISIBLE — il supprime le triangle natif ▶/▼ (seule affordance
  visuelle d'état) et rétrécit la cible cliquable de la pleine largeur à la largeur du texte** → retiré
  des 2 sites où je venais de l'ajouter. Contrastes translucides du sweep info-400 composités à la main
  (check-contrast ne couvre que l'opaque) : tous ≥ 4,69:1 AA — marge la plus fine = AutoBackupPanel
  hover, premier site à surveiller si un token de fond bouge. Reste (pré-existant, hors PR) :
  `Transactions.tsx:492` porte un `inline-block` d'avant — même symptôme triangle perdu, à reprendre
  avec un éventuel design-system des disclosures.
- [x] **`[FINTABLE-5]` Bascule de l'historique 18 mois — ✅ TRANCHÉ 2026-07-29 : ON GARDE.** La mesure
  est tombée : 90 jours demandés, **30 rendus** (2026-06-29 → 2026-07-28). La réponse de cadrage de Marc
  (« supprimer l'historique, n'utiliser que Plaid », Q8) est donc **caduque** — l'appliquer aurait coûté
  ~17 mois de données. C'est précisément pourquoi ce lot était gaté par une MESURE et non par une
  intention : l'intention était sincère et fausse. Rien à coder ; l'import manuel reste la source du
  passé, Fintable celle du présent. À réévaluer si la fenêtre s'élargit (connexions peut-être récentes),
  mais **jamais de suppression sur une promesse**.
- [x] **`[FINTABLE-POSITIONS]` ❌ IMPOSSIBLE — clos par la mesure (2026-07-29)** — le docteur a d'abord
  montré que les 6 comptes arrivent par **UNE SEULE connexion Desjardins via PLAID**, sans aucune
  connexion SNAPTRADE (plan et santé hors de cause). L'annuaire PUBLIC a ensuite tranché : SnapTrade
  au Canada chez Fintable = **exactement 3 courtiers** (Webull Canada, Questrade, Wealthsimple Trade) ;
  `q=disnat` → **0 résultat**, et « Desjardins Online Solutions » est `supported: false`. Ce n'est donc
  pas un problème de configuration mais une **limite du produit** : les positions détaillées sont hors
  de portée via Fintable, quoi que Marc fasse. Décision : volet abandonné ; les positions continuent
  de passer par `apply_broker_statement` (dépôt d'un relevé Disnat dans le chat), qui fonctionne déjà.
  À rouvrir seulement si Marc change de courtier ou si Fintable élargit sa couverture SnapTrade.
- [x] **`[FINTABLE-PLAN]` ✅ Marc paie (décision 2026-07-29)** — l'essai expirait le 2026-08-01 et le
  palier gratuit a `can_sync: false` (arrêt TOTAL des syncs, pas de dégradation). Après avoir vu que
  les positions étaient impossibles, Marc a choisi de prendre un plan pour conserver l'import
  automatique des transactions + les soldes de référence. ⚠️ Ma recommandation était l'inverse (ne pas
  payer, le gain restant ne justifiant pas de casser la règle « zéro abonnement ») — arbitrage assumé
  par Marc, tracé ici pour la prochaine session. NB mesuré : ni Airtable ni Google Sheets ne sont
  connectés chez lui — le « repli Sheet » de l'ADR n'a jamais existé en pratique, ce qui conforte le
  choix de l'API directe.

## 🚧 Chantier Claude-in-app (GO Marc 2026-07-21 : « go jusqu'à tout fini et testé + audit de sec à la fin + aucune donnée changée + résultat fiable »)
> Plan validé (panel PM + architect, 2026-07-21). P1 = Claude intégré à l'app (tool-use sur les MÊMES
> specs que le MCP — parité « mêmes réponses que claude.ai ») ; P2 = tools MCP d'écriture manquants
> (ordre : transactions → objectifs → budgets → actifs → immobilier) ; P3 = visuels des 5 surfaces.
> Décisions verrouillées : mode discret = chat masqué d'un bloc (PrivateBlock) ; transcript persisté
> LÉGER (payloads tools en mémoire session seulement) ; Sonnet = chat interactif (Haiku reste au fond) ;
> écritures = confirmation diff avant/après à CHAQUE écriture ; AUDIT SÉCURITÉ complet en fin de chantier.

- [x] **`[AITOOLS-A]` Frontière spec/register** — ✅ 2026-07-21 : 16 tools scindés en `*.spec.ts`
  (pur, browser-safe) + `*.tool.ts` (mince). Parité d'enregistrement MESURÉE (worktree HEAD vs courant,
  16/16 identiques), suite MCP verte, garde `noMcpSdkInSpecs` (frontière + minceur, volume prouvé).
- [x] **`[AITOOLS-B]` Registre app + boucle agentique lecture** (L) — ✅ 2026-07-21 : `services/aiTools/`
  (registry 11 tools lecture, toAnthropicTools, dispatch avec validation zod explicite + ceinture try/catch,
  agentLoop cap 6 tours + streaming + timeout/tour + fins dégradées distinguées error/truncated/refused +
  callbacks UI isolés, systemPrompt, appStateProvider : pick data-only SANS apiKeys + validateAppStateShape +
  structuredClone + la MÊME normalizeAppState que le MCP — extraite browser-safe `mcp/state/appStateDefaults.ts`).
  Parité PROUVÉE (8 tools × 2 personas, exhaustivité assertée) + « aucune donnée changée » prouvé (2 personas,
  MC + what-if variés, clone frontière testé). Panel 4 agents : 1 CRITIQUE + 3 ÉLEVÉ + 5 MOYEN appliqués ;
  bonus : dérive RÉELLE `documents` manquant du littéral legacy du store attrapée par le test de défauts.
- [x] **`[AITOOLS-C]` Branchement panneau existant** (M) — ✅ 2026-07-21 (PR #478) : AiAssistant en
  tool-use via `hooks/useAiChat` (partagé, prêt Lot E), `generateContext()` SUPPRIMÉ, chips « a consulté »,
  bannière mode test (warning-400 mesuré), mode discret = chat masqué entier (ADR-5), bundle boot inchangé
  (+110 o gzip). Panel sur diff COMMITÉ : 1 CRITIQUE (abort ≠ error) + 2 ÉLEVÉ (identité de message par ID,
  réentrance par ref, Effacer gelé pendant envoi) + 2 MOYEN appliqués — sondes mesurées. 8 tests composant.
  ⚠️ Incident : un revert conteneur a EFFACÉ le Lot C non commité pendant l'attente du panel (ré-appliqué
  de mémoire) → règle : committer AVANT de lancer un panel. ⏳ Critère d'arrêt à VALIDER PAR MARC en prod
  (5 vraies questions → réponses correctes).
- [x] **`[AITOOLS-ENGINE-WORKER]`** 🟠 ÉLEVÉ (M→S, requis avant Lot C) — ✅ 2026-07-21 : les 3 tools moteur
  routés sur `runProjectionAsync` (drop-in : même signature, Worker + timeout 30s côté navigateur, repli
  synchrone IDENTIQUE côté Node/MCP) ; `withState` élargi aux fn async (rétrocompat sync). Parité re-prouvée
  (registryParity vert sur le chemin async) + garde-scan « jamais d'appel moteur DIRECT dans un spec ».
- [x] **`[AITOOLS-HISTORY-BOUND]`** ✅ 2026-07-29 (PR #519) — vérif de l'état RÉEL : entre deux ENVOIS, useAiChat resoumet du TEXTE seul (prémisse à moitié périmée) ; le vrai coût était INTRA-boucle (tours 2-6 re-paient les tool_results). Fix = breakpoint de cache TOURNANT sur le dernier tool_result (4ᵉ/4 marqueurs, l'ancien marqueur est retiré à chaque tour — 5 marqueurs = erreur API). Préfixe re-servi du cache (0,1×) au lieu d'une troncature qui l'aurait cassé. Guard-test de forme. Ex-finding ai-reviewer : l'API est
  stateless → réinjecter `messages` (avec tool_results volumineux, ex. simulate_what_if includeSeries ~1400
  points) RE-paie ces tokens à CHAQUE tour suivant sur la clé BYOK. Borner l'historique resoumis (tronquer les
  vieux tool_results, garder le texte). NB : ne PAS changer `includeSeries` défaut (surface claude.ai, parité).
- [x] **`[AITOOLS-D]` Écritures + confirmation** (M) — ✅ 2026-07-21 : 5 write-tools via `applyDocument` pur →
  modal diff avant/après (`AiChatConfirmModal`) → Appliquer (backup `createBackupNow('auto')` OBLIGATOIRE
  avant l'écriture, sinon annulée) / Annuler (tool_result refusé). Diff RECALCULÉ sur état FRAIS au clic
  (anti-race), écritures multiples séquentielles (la boucle re-snapshot après chaque apply), tools déclarés
  à l'API SEULEMENT si l'exécuteur est branché, apiKeys insensibles à un apply. 17 tests. + fix flake
  oauthProvider (tamper ~1/64 no-op). **Panel (4 agents, sondes)** : 6 findings appliqués — mode discret
  masque le modal (Loi 25), promesse orpheline au démontage d'onglet, scrub injection du `summary`,
  Annuler coupe tout le lot, `.finite()` sur 5 specs.
- [x] **`[MCP-WRITE-SUMMARY-SCRUB]`** ✅ 2026-07-22 (audit SEC) — le vecteur « injection indirecte via
  `summary`/`field` d'un tool_result d'écriture » existait AUSSI côté serveur MCP (`runApply` renvoyait le
  `summary` non scrubé à claude.ai). CORRIGÉ : helper PARTAGÉ `mcp/tools/scrubWriteResult.ts`
  (`scrubWriteResultForModel`) consommé par `writeExecutor` (app) ET `runApply` (MCP) → parité par construction.
  Test `tests/mcp/writeResultScrub.test.ts`. ⚠️ Effet sur claude.ai au prochain deploy Cloud Run. Limite assumée :
  injection en langage naturel passe toujours (defense-in-depth).
- [x] **`[AITOOLS-E]` UI partagée** (L) — ✅ 2026-07-22 : `AiChatProvider` (1 instance `useAiChat` au niveau
  App) + panneau latéral GLOBAL (`AiChatLauncher`, FAB partout, lazy) + onglet Assistant pleine page —
  rendu mutualisé `AiChatView` (variant panneau/onglet), MÊME conversation partout. Résout à la racine le
  finding Lot D « promesse orpheline au démontage d'onglet » (chat monté App, jamais démonté par onglet ;
  modal rendu 1× par le provider). Boot inchangé (~107 kB gzip mesuré : SDK Anthropic en import dynamique
  dans `useAiChat`, panneau lazy). Mode discret masque tout ; pastille d'activité sur le FAB panneau fermé.
- [x] **`[AITOOLS-PROMPT-CACHE]`** ✅ (2026-07-24, PR suivante) — état réel : le `cache_control` du bloc
  `system` statique (livré en #490) cachait DÉJÀ les 16 schémas de tools par l'ORDRE de préfixe Anthropic
  (tools → system → messages : un breakpoint sur system cache tout ce qui le précède). Complété : marqueur
  `cache_control` EXPLICITE sur le DERNIER tool dans `agentLoop.ts` → les tools sont cachés INDÉPENDAMMENT
  du system (défense en profondeur si le préfixe system change) ; le préfixe (system+tools+historique) est
  re-servi du cache aux tours 2-6 + messages suivants (coût BYOK). Guard-test de forme de requête (2 marqueurs
  présents). Zéro changement de comportement ; `usage.cache_read_input_tokens` déjà remonté (B4-CHAT-COST).
- [x] **`[PERF-SDK-BOOT-PRELOAD]`** ✅ 2026-07-31 — **boot −54 Ko gzip (225,6 → 171,6 Ko, −24 %), mesuré
  par git-stash avant/après**. Le diagnostic du ticket était INCOMPLET (« les 5 onglets lazy ») — la vraie
  chaîne, tracée par un walker d'imports STATIQUES depuis index.tsx : `TabRouter → PageSetupGate →
  PayslipUploadCard → claude.ts → SDK` (le gate de setup est monté au BOOT). Fix en 3 morceaux, chacun
  prouvé par rebuild+mesure : (1) `makeClient` ASYNC (`import type` pour les types — effacés — + SDK
  chargé via importWithRetry au premier usage) ; (2) `PayslipUploadCard` lazy dans PageSetupGate
  (Suspense local) — casse la chaîne statique boot→claude ; (3) ⚠️ **retrait des règles `manualChunks`
  `ai-vendor`/`pdf-vendor` : un manualChunk atteint UNIQUEMENT par `import()` devient EAGER** (le chunk
  manuel casse la frontière asynchrone — l'entry l'importait STATIQUEMENT alors qu'AUCUNE chaîne statique
  source n'existait ; en retirant la règle SDK, `pdf-vendor` est APPARU dans le preload à sa place, même
  piège). Sans les règles, Rolldown range SDK et jspdf dans les chunks async naturels (sdk-*.js /
  jspdf.es.min-*.js) — téléchargés au premier usage seulement. Preload final : react-vendor + cœur.
  Panel #547 (code-reviewer + silent-failure + ai-reviewer, 0 bloquant) : test de résolution du chunk lazy
  ajouté (PageSetupGate → vraie PayslipUploadCard, pas le fallback à vie) + `ErrorBoundary.componentDidCatch`
  route désormais vers `logError` (un crash de rendu — ex. chunk périmé post-déploiement — était visible à
  l'écran mais INVISIBLE dans Réglages → Diagnostics). Suivi routé : `[SDK-IMPORT-TIMEOUT]` ci-dessous.
- [ ] **`[SDK-IMPORT-TIMEOUT]`** (S, résiduel panel #547, NON bloquant — ai-reviewer MOYEN + code-reviewer
  FAIBLE, convergents) — le chargement du chunk SDK (`await importWithRetry(() => import('@anthropic-ai/sdk'))`,
  `services/claude.ts:157`) n'est couvert par AUCUN timeout : `makeTimeoutSignal` est construit APRÈS. Un
  `import()` dont le fetch STALLE sans jamais rejeter pend indéfiniment (aucun recours sauf recharger l'onglet).
  Borné en pratique : 1er usage par session d'onglet seulement (registre ESM dédup ensuite), et un « Annuler »
  pendant le chargement est honoré AVANT l'appel API (makeTimeoutSignal teste `aborted` à sa création — zéro
  coût facturé). Fix candidat : course `import()` vs timer 8-10 s dans importWithRetry (rejet propre routé vers
  les messages d'erreur existants, tous les appelants catchent déjà). ⚠️ importWithRetry est PARTAGÉ par tous
  les lazy — dimensionner le timeout pour les gros chunks (recharts) sur connexion lente avant de l'appliquer.
- [x] **`[AITOOLS-SEC]` Audit sécurité FINAL du chantier** ✅ 2026-07-22 (exigence Marc) — panel security-privacy
  + ai-reviewer sur TOUT le chantier. **Verdict : sain.** Rapport daté `docs/AUDIT_SEC_CLAUDE_IN_APP_2026-07-22.md`.
  Prouvés SAINS (mesuré) : aucune écriture sans confirmation, clés API exclues, Loi 25/mode discret, isolation
  persona, lecture zéro-mutation, parité claude.ai. Findings corrigés : `[MCP-WRITE-SUMMARY-SCRUB]` (ÉLEVÉ,
  injection indirecte serveur), `.finite()` sur 3 tools lecture + garde-scan, `refusal` fin dégradée honnête.
  Optimisations coût routées (non-sécurité) : `[AITOOLS-PROMPT-CACHE]`, `[PERF-SDK-BOOT-PRELOAD]`.
>
> **Dernière mise à jour : 2026-07-06.** Tests : 2334 verts / 207 fichiers · tsc clean · build OK.
> **Dernière PR mergée : #425** (2026-06-26, WHT-DISPLAY-EXACT) — 111 commits depuis #315, audit financier complet 2026-06-23 résolu (6 lots), 5 sessions 06-19→06-26, retraite per-conjoint ✅.
> Restes uniquement : suivis LOW (DEP-UNDICI-VULN, FISC-CONST-LINT-LIMITS, FISC-RRSP-PRE2010-FALLBACK + suivi FUZZ-ONETIME-FLOWS) +
> blocages Marc (RECH-ACTION-UX confirmée visuellement, phases 2-4 brief plan-first, P0-*, design Budget/Transactions/Retraite).

## 💬 Roadmap chat (B, scope validé Marc 2026-07-22 par AskUserQuestion)
- [x] **`[B1-CHAT-ATTACHMENTS]`** ✅ 2026-07-22 (PR #487) — pièces jointes multimodales (images ≤5 Mo, PDF ≤10 Mo,
  texte/CSV ≤1 Mo, max 5/message, budget agrégé 20 Mo) : `services/aiChat/attachments.ts` (classify/read/
  buildUserContent, cache session par id de message + éviction hors fenêtre + purge inter-persona),
  `useAiChat.sendMessage(text, files)` (+ `cache_control` sur le dernier bloc pièce jointe — coût BYOK),
  UI trombone + puces (AiChatView), clause anti-injection system prompt. Transcript = MÉTA seulement
  (ADR-4) ; contenu post-reload → note honnête. **Panel 5 agents appliqué** (1 CRITIQUE fichier 0 octet →
  tour évaporé ; 3 ÉLEVÉS suggestion-jette-fichier / budget agrégé / cache_control ; 6 MOYENS a11y-sécurité).
  Suivi non bloquant : `max_tokens` 2048 court pour « liste tout le PDF » (marqueur [Réponse coupée] honnête),
  timeout 60 s premier tour PDF lourd à instrumenter si vu en prod. B2 déplacera les octets en fichiers Drive appdata.
- [x] **`[B2-CHAT-HISTORY]`** ✅ 2026-07-22 — multi-conversations : `aiConversations` (archivées) +
  `activeAiConversationId` (additifs, zéro migration) ; `aiConversation` RESTE l'active (source unique,
  l'active ne figure JAMAIS dans la liste — pas de double copie qui diverge). Logique pure
  `services/aiChat/conversations.ts` (new/switch/delete, titre auto, aliveAttachmentMessageIds),
  UI `AiConversationList` (sidebar md+ / sélecteur mobile, onglet seulement, zone mode discret, actions
  gelées isLoading). **Pièces jointes cross-device** : `attachmentDriveStore.ts` — un fichier appdata
  par message (`financeai-chat-attach-<msgId>.json`), push fire-and-forget à l'envoi, fetch au
  cache-miss (ratés mémorisés), delete avec la conversation, skip mode test/sans jeton.
- [x] **`[PERSONA-SANITIZE-CHAT]`** ✅ 2026-07-29 (PR #519) — sanitizer étendu : `aiConversation` filtrée par id de message, archive `aiConversations` contaminée (id OU message de fixture) retirée EN ENTIER + test de parité. Ex-finding : `personaSanitizer`
  ne scanne pas `aiConversation`/`aiConversations` (aucun persona n'y écrit AUJOURD'HUI — pas de fuite
  active). Si un futur persona pré-remplit un chat de démo, la ceinture PERSONA-PURGE ne l'attraperait
  pas. Étendre le scan (ids `aimsg_` de fixtures enregistrés dans artifactIds) + test de parité.
- [x] **`[B3-CHAT-MODEL]`** ✅ (2026-07-22, PR #489) — choix du modèle PAR conversation (Haiku / Sonnet /
  Opus) : sélecteur dans le header du chat (gelé pendant un envoi), `AppState.aiChatModel` (additif) pour
  l'active, porté dans `AiConversation.model` à l'archivage et RESTAURÉ à la bascule (archive pré-B3 →
  sonnet, le seul modèle d'alors). Source unique des ids : `services/aiChat/models.ts` (`MODEL_IDS` —
  `services/claude.ts` en dérive MODEL_SONNET/MODEL_HAIKU, plus deux littéraux qui divergent).
- [x] **`[B4-CHAT-COST]`** ✅ (2026-07-22, PR #489) — coût API RÉEL : `agentLoop` accumule `msg.usage`
  par tour (rendu sur TOUS les stopReasons — un envoi annulé a payé ses tours aboutis) →
  `services/aiChat/pricing.ts` (tarifs $/MTok datés/sourcés 2026-06 : haiku 1/5, sonnet 3/15, opus 5/25 ;
  cache read 0,1×, write 1,25×) → `costUsd` sur chaque réponse (persisté, léger) + cumul à vie
  `aiChatCostUsdTotal`. Affichage CAD via `fxRates.USD` (`formatCostCad`, « < 0,01 $ » jamais un faux
  0,00 $) : par réponse (bulle), par conversation (header + sidebar), total à vie (header). Parité
  ids↔tarifs verrouillée par test (un modèle sans tarif = garde rouge, jamais un coût non compté muet).

## 🛡️ Dépendances — alertes Dependabot ouvertes (capture Marc 2026-07-22, « backlog aussi »)
- [x] **`[DEP-DEPENDABOT-2026-07]`** ✅ (2026-07-23, PR #497 — coché 2026-07-24 au balayage) — 4 alertes ouvertes sur package-lock : fast-uri ×2 (HIGH, host
  confusion via IDN/backslash), @hono/node-server (MODERATE, path traversal serve-static Windows — serveur
  MCP ; vecteur limité : Cloud Run Linux, pas de serve-static exposé, à vérifier), dompurify (LOW,
  CUSTOM_ELEMENT_HANDLING bypass). Passe de bump ciblée : `npm audit` + bump lockfile (fast-uri est
  probablement transitif — `npm ls fast-uri`), suite complète + build ensuite. Leçon PM-STALE-BACKLOG :
  vérifier l'état RÉEL du lockfile avant de coder (Dependabot a pu déjà ouvrir des PR).
  ✅ 2026-07-23 (PR #497) : `npm audit fix` → fast-uri (HIGH ×2 advisories) et dompurify (LOW) corrigés.
  ⚠️ RÉSIDUEL ASSUMÉ (2 MODERATE) : `@hono/node-server` <2.0.5 épinglé par `@modelcontextprotocol/sdk`
  (^1.19.9, même @latest) — le fix est une MAJOR hors range. Exploitabilité MESURÉE nulle dans notre usage :
  l'advisory vise `serve-static` sur WINDOWS (grep : 0 usage dans mcp/ ET dans le dist du SDK ; prod = Cloud
  Run Linux). Pas d'override major non testé par l'upstream. → `[DEP-HONO-NODE-SERVER]` : re-vérifier à chaque
  bump du SDK MCP (dès qu'il passe à node-server 2.x, le résiduel tombe tout seul).

## 📈 Investissements — couverture d'historique incomplète (demande Marc 2026-07-22, verbatim « backlog », captures)
- [x] **`[HIST-COVERAGE-TOTAL]`** 🔴 (M-L) — ✅ 2026-07-23 (PR #493, ADR docs/decisions.md) : la courbe TOTAL
  n'omet PLUS aucun titre détenu. Livré : (b) titre sans historique → compté au TOTAL/buckets à sa valeur
  actuelle (contribution plate, AUCUNE colonne inventée, `noHistorySymbols` signalé) ; backfill borné
  pré-historique au PREMIER close (plus de « marche » fantôme) ; queue périmée raccordée au `currentPrice`
  si la quote est fraîche (`priceUpdatedAt` < 7 j — cas GBS.PA quote OK/candles KO) ; (c) bandeau Dashboard
  honnête avec le montant compté (<PrivateAmount>) ; (a) variantes de suffixe Yahoo par DEVISE pour les
  tickers nus (EUR → .PA/.DE/.AS/.MI, CAD → .TO/.V), validées par plausibilité de prix (facteur ≤ 2 vs
  currentPrice, sinon refus anti-collision) et persistées via `Asset.historySymbol` (additif). NB : si
  « Amundi EM Asia » ne se résout toujours pas en prod, préciser le ticker suffixé (ex. AASI.PA) dans l'actif.
- [x] **`[QUOTE-NEGATIVE-CACHE]`** (S) — ✅ 2026-07-23 : cache négatif TTL par symbole
  (`services/marketData/negativeCache.ts`, localStorage clé dédiée jamais synchronisée, repli mémoire hors
  navigateur) : 3 échecs CONSÉCUTIFS (fenêtre 7 j) → skip borné (quote 24 h, profil 7 j), succès = effacement,
  self-heal à l'expiration, purge > 30 j. Intégré à la façade (`getQuote`/`getProfile` + `canAttemptQuote`/
  `canAttemptProfile` consommés par le boot) ; wipe sur changement de clé provider ET sur le bouton
  « Actualiser » (geste explicite = repartir de zéro). ⚠️ Périmètre RÉDUIT vs le ticket : l'HISTORIQUE est
  EXCLU volontairement — son contrat `[]` (vide confirmé, caché 24 h) vs `null` (erreur) pilote la résolution
  de variantes de `hydrateAssetHistories` (un négative-cache qui rendrait `null` masquerait ce contrat), et le
  coût résiduel est déjà borné ~1 essai/symbole/jour (`needsHistorySync` + cache 24 h).
- [x] **`[QUOTE-MARKET-TIMESTAMP]`** (S) — ✅ 2026-07-23 : `priceUpdatedAt = marketTimestampOrNow(quote.timestamp,
  now)` (garde de plausibilité : ≥ 2000-01-01, ≤ now+10 min, sinon repli heure de fetch) → le raccord
  `quoteFresh` (7 j) et le libellé « Cours mis à jour » mesurent la fraîcheur du COURS (clôture de vendredi
  affichée comme telle un dimanche), pas celle du réseau.
- [x] **`[INVEST-CURVES-LOW]`** (S) — ✅ 2026-07-23 (avec [INVEST-CHART-CLEAN], demande Marc « la courbe est mal
  visible ») : (1) auto-défaut **Base 100 (%)** quand ≥ 2 séries d'échelles disparates (> 20×) partagent l'axe $
  (le choix manuel du toggle prime toujours) ; (2) fix Base 100 sur lignes ÉPARSES — base de CHAQUE série = son
  premier point FINI (avant : ligne 0 → un titre acheté plus tard avait base 0 → courbe FIGÉE À 0, invisible),
  point manquant → null (trou honnête). + graphe 400→520 px, notes de couverture et diagnostic REPLIABLES
  (une ligne compacte, détails au clic), ligne « N points · période » retirée.
- [x] **`[INVEST-ALLOC-GEO-SECTOR]`** (M) — ✅ 2026-07-23 : cause DOUBLE — table `ASSET_META` statique (13 titres)
  ET keyée préfixe place (`EPA:CW8`) face à des symboles réels suffixe (`CW8.PA`) → quasi tout en « Autre ».
  Livré : `Asset.sector`/`region` additifs (persistés) ; `resolveAssetMeta` (source unique : champ > seed
  NORMALISÉ préfixe↔suffixe > crypto > Autre) ; auto-remplissage au boot via le profil Finnhub
  (`assetProfileSync`, séquentiel, information utile seulement, jamais d'écrasement) ; édition inline
  région/secteur dans les cartes d'allocation (tout titre classable même sans provider).
- [x] **`[HIST-MULTI-PROVIDER]`** 🔴 — ✅ 2026-07-23 (retour Marc post-#493 : TOTAL ~200 k$ et titres toujours
  sans courbe ; « plusieurs providers pour tout avoir ») : chaîne de QUOTES multi-providers (crypto → CoinGecko ;
  Finnhub → repli Yahoo via le proxy chart, `meta.regularMarketPrice`, devise vérifiée) ; `priceRefresh` quote
  `historySymbol || symbol` ; bouton « Actualiser les cours » = resync COMPLÈTE (purge cache history + hydratation
  forcée + quotes + diagnostic) ; `HistorySyncDoctor` (Investissements) : raison exacte par titre + symbole de
  cotation inline + recherche par NOM (`/api/search/yahoo`). ADR docs/decisions.md.
- [x] **`[INVEST-PERF-PERIOD]`** (S-M) — ✅ 2026-07-23 (demande Marc : « la performance actuellement c'est 24h
  mais je veux pouvoir choisir moi ») : sélecteur de période (24h / 7 j / 1 mois / 3 mois / 6 mois / cette
  année / 1 an) sur la carte Performance, qui pilote AUSSI les chips du graphe et les cartes par titre.
  Helper pur `services/history/periodReturn.ts` à DEUX sémantiques honnêtes : `seriesReturnPct` (variation
  de VALEUR d'une série marketData — TOTAL/buckets, sensible aux apports) et `priceReturnPct` (performance
  de PRIX NATIF d'un titre via `priceHistory`, insensible aux achats — les cartes par titre l'utilisent).
  Benchmark « Marché » = prix natif du titre CW8/MSCI détenu (repli série CSV). Pas de baseline dans la
  fenêtre (titre plus récent que la période) → `null`/« — » honnête, jamais un 0. Score de santé : momentum
  FIXÉ sur 24h (indépendant du sélecteur — badge header stable).
- [x] **`[QUOTE-ERRKIND]`** ✅ (2026-07-24, PR suivante) — fix structurel livré : les providers PROPAGENT
  désormais (throw) une `MarketDataError` typée pour les échecs TRANSITOIRES (RATE_LIMIT/NETWORK/AUTH/UNKNOWN)
  au lieu de les aplatir en `null` ; l'ABSENCE confirmée (Finnhub `c:0`, Yahoo 404, crypto id inconnu) reste
  `null`. La façade (`runLink`) classe : transitoire → avalé en `null` mais NON compté au cache négatif (un
  429/réseau ne gèle plus un vrai titre) ; absence confirmée → compté au skip. Le TTL gradué reste 2ᵉ ceinture.
  Discriminant : 3× 429 → `canAttemptQuote` reste `true` (échouait avant) ; 3× 404 → skip armé.
- [x] **`[PRICE-SYNC-REPORT]`** ✅ 2026-07-29 — `updateQuoteSkips` (syncDiagnostics, fusion sans écraser l'hydratation, [] efface les périmés) publié par le boot (App) ET le bouton Actualiser (Investments) → section « Prix non actualisés (N) » du HistorySyncDoctor (repliée, raisons en français, dédup avec la liste historique). Ex-finding : les skips du refresh de
  BOOT (quotes/profils) n'ont AUCUNE surface UI (contrairement à l'historique → HistorySyncDoctor). Mitigation
  livrée : logError au journal quand des titres sont skippés au boot + TTL gradué (staleness bornée ~1 h).
  Fix complet : un rapport publié (patron setHistorySyncReport) consommé par le doctor/une note discrète.
- [x] **`[PERF-STALE-TAIL-ZERO]`** ✅ (2026-07-24, PR suivante) — `buildMarketData` trace les valeurs
  raccordées au prix courant (`syntheticTailKeys` = `${date}|${symbol}`, posé au splice `quoteFresh`) ;
  `seriesReturnPct(rows, key, period, isSynthetic?)` rend `null` (« — » honnête) quand latest ET baseline
  sont tous deux synthétiques (au lieu d'un 0,00 % trompeur — donnée figée ≠ marché plat, cas GBS.PA). UN
  SEUL endpoint synthétique = mouvement RÉEL (prix figé vs réel) → % conservé. Scope PER-SYMBOLE (les
  agrégats TOTAL/buckets mêlent réel+synthétique). Câblé dans `Investments` (tendances par série).
  Discriminant baked dans le test (ancien = 0, nouveau = null). Rétrocompat : prédicat optionnel.
- [x] **`[A11Y-PILL-RADIOGROUP]`** ✅ (2026-07-24, PR suivante) — `components/ui/Pill.tsx` (radiogroup partagé)
  a désormais la navigation clavier APG : roving tabindex (`tabIndex={isSelected ? 0 : -1}`, 1 seul arrêt de
  Tab, repli sur la 1re option si `value` hors liste → jamais intabbable) + flèches ←→↑↓ (wrap) + Home/End,
  la sélection SUIT le focus. Corrigé UNE fois → profite aux 3+ usages (Investissements/Budget/Futur). Cible
  tactile `sm` : `min-h-[24px]` (WCAG 2.2 SC 2.5.8). Tests clavier + discriminant (4 tests échouent sur l'ancien).
- [x] **`[FUTUR-REAL-HISTORY]`** ✅ (2026-07-24, PR suivante — cadrage architect + financial-integrity, décision Marc
  Option A + FX du jour) — la courbe **Futur** montre AVANT aujourd'hui l'historique RÉEL du patrimoine « depuis que j'ai
  l'app ». **CONSTAT du cadrage : déjà construit à ~90 %** (segment passé `pastPrefix` dans `FutureProjection.tsx`,
  reconstruit placements + cash + immo, recalculé à chaque upload/changement via les deps du `useMemo` — cf [[R2-FIRE]]).
  Cette PR ferme les 2 écarts money-critical qui empêchaient « matcher EXACTEMENT le niveau d'aujourd'hui » :
  - **Raccord dette EXACT (Option A)** : le passé soustrait `chartData[0].DettesNonImmo` (dette courante, source unique)
    via `pastNetWorthAt` → `computeRawNetWorth` (zéro copie locale) → fin du SAUT « aujourd'hui » pour un endetté (le futur
    soustrait la même dette dès le mois 0). Approximation assumée (dette supposée constante dans le passé) SIGNALÉE au bandeau.
    Remplace la limite [[HIST-NW-DEBT-DISCLAIMER]] (option b, jamais livrée) — Marc a re-tranché (a) le 2026-07-24.
  - **Cohérence de base cash** : `reconstructCashHistory` EXCLUT désormais `isDuplicate`/`isTransfer` comme l'ancre
    `computeStartingCash` (les 2 bouts de la courbe divergeaient — finding financial-integrity). Tests discriminants (3 rouges sur l'ancien).
  - **FX** : titres étrangers valorisés au change DU JOUR (déjà en place, choix Marc) — note d'honnêteté ajoutée au bandeau.
  - [x] **`[FUTUR-HIST-WIRING-TEST]`** ✅ (PR A, 2026-07-24) — assemblage du passé EXTRAIT en fonction pure
    `services/history/buildPastPrefix.ts` (unit-testable hors composant, ≠ harnais de rendu lourd) ; test prouve le câblage
    (buckets 1:1, dette COURANTE soustraite, dates, gate no-fake) + discriminant vs `DetteTotale`. Sort la logique money-critical
    du composant de ~1000 l. ⚠️ `type` alias (pas `interface`) pour garder l'assignabilité `Record<string, unknown>` de `displayData`.
  - [x] **`[FUTUR-HIST-DAILY-REFRESH]`** ✅ (PR A, 2026-07-24) — `startYear/startMonth` ne sont plus figés au montage :
    `monthEpoch` (an×12+mois) réévalué par un check HORAIRE + au retour de visibilité → au passage de mois, « aujourd'hui »
    avance (projection re-seed, le passé gagne son point). Granularité mois (passé/moteur mensuels). Test fake-timers.
  - **Reste (différé, non bloquant)** : `[FUTUR-HIST-FX-DATED]` (FX historique daté via proxy Yahoo `USDCAD=X`/`EURCAD=X`, plus
    juste que le change du jour — money-critical, garder le point d'AUJOURD'HUI au FX courant pour le raccord exact ; no-fake si
    FX daté manquant → repli FX courant signalé) ; recherche binaire dans `priceAt` si un jour mesuré lent.
  - [x] **`[FUTUR-PAST-DEBT-FREEZE]`** ✅ (2026-07-29, demande Marc « assure-toi que le passé marche… le passé doit
    être exactement ce que c'était à cette date ») — audit lecture seule PROACTIF (avant tout code) qui a confirmé le
    câblage réactif (transactions/actifs/dettes → recalcul de `pastPrefix`, 3/3 dépendances OK) mais trouvé UN écart
    réel : `currentDebtNonImmo` lisait `chartData[0]` (dérivé de `results = frozenUsable ?? liveResults`) → quand le
    FUTUR est gelé (PROJECTION-PERSIST, badge « Pas à jour »), le segment PASSÉ continuait de soustraire l'ANCIENNE
    dette jusqu'au clic « Recharger ». Fix : lire depuis `liveResults` (JAMAIS `results`/`chartData`, qui peuvent être
    le blob figé) — le passé reste réel, indépendant du gel du futur. Test discriminant (`FutureProjection.
    pastDebtFreeze.test.tsx`) : gèle le futur, bondit la dette LIVE de +10 M$, prouve que le NetWorth affiché du passé
    CHANGE (échoue sur l'ancien code — vérifié par `git stash`). Seule composante affectée (buckets cash/placements/immo
    du passé étaient déjà corrects, non gelés).
    ⚠️ **2 agents (financial-integrity + projection-validator) ont mesuré INDÉPENDAMMENT une 2ᵉ fenêtre** que le 1ᵉʳ
    jet du fix rouvrait : au boot/reload, `lastProjection` (exclu de la persistance) vaut `null` le temps que le
    moteur recalcule (~300 ms+), alors que le blob figé restauré depuis IDB affiche DÉJÀ une courbe → le 1ᵉʳ jet
    retombait à une dette de 0 (271 k$ mesuré vs 221 k$ attendu). Fix affiné : repli sur `chartData` (ce qui est
    RÉELLEMENT affiché, live ou figé) plutôt que sur 0 — `liveResults?.chartData?.length ? liveResults.chartData
    : chartData`. 2ᵉ test discriminant ajouté (remontage avant publication moteur + blob figé dispo).
- [x] **`[FUTUR-ICONS-RICH]`** ✅ (2026-07-24, PR suivante — bug Marc « quasi aucune icône », le fix
  [FUTUR-ICON-DENSITY] ne suffisait pas) — le graphe Futur n'affichait des icônes que pour les rares `lifeEvents`/
  `flowEvents` du moteur (0-2 sur un plan normal). Fix 3 volets : (a) module pur `services/projection/milestoneIcons.ts`
  `deriveMilestoneIcons` = jalons dérivés des CHAMPS `chartData` (🏛️ RRQ/PSV, 📤 retraits REER/CELI, 💸 impôt, 🏠 locatif ;
  présentation pure, jamais retraite/FIRE = anti-doublon structurel) ; (b) gate `.includes('-')` (tiret ASCII vs cadratin « — »)
  RETIRÉ → flowEvents moteur enfin visibles ; (c) toutes les pastilles sur la courbe (`val=NetWorth`, avant les flux étaient
  à `ImpotLatent` = invisibles). RRQ/PSV migrés de lignes verticales → icônes cliquables. **Validé e2e Playwright RÉEL**
  (`e2e/futureIcons.spec.ts`) : 29 icônes vs 0-2. Tests purs (`projection.milestoneIcons.test.ts`).
- [ ] **`[A11Y-FUTUR-MILESTONES-KEYBOARD]`** 🔵 (M, finding a11y-auditor PR #516) — les pastilles d'événements du
  graphe Futur (`ClickableEventIcon`, `<g role="button" tabIndex={-1}>`) ne sont pas atteignables au CLAVIER (WCAG 2.1.1) :
  aucun `onKeyDown`, conteneur graphe `tabIndex=-1`. Une liste sr-only des jalons (parité SR) a été livrée avec FUTUR-ICONS-RICH,
  mais l'OPÉRABILITÉ clavier reste à faire → rendre les pastilles VISIBLES focusables (`tabIndex=0` + Enter/Space → `onSelect`,
  focus-ring) OU un contrôle clavier alternatif ouvrant `FutureDetailModal`. ⚠️ Impact sur le pattern « clic n'importe où » (G12) →
  trancher avec Marc. Aria-label des jalons récurrents (impôt) : inclure `dateLabel`/année si focusables (sinon ~N boutons identiques).
- [x] **`[A11Y-DASH-SRONLY]`** ✅ (2026-07-24, PR suivante) — convention GLOBALE : helper pur
  `components/ui/emptyAware` — quand la valeur rendue EST le tiret « — » (état vide de formatCAD/formatPercent),
  il remplace le tiret muet par `<span aria-hidden>—</span>` + `<span class="sr-only">Pas de donnée</span>`
  (un SR lirait sinon « tiret cadratin »/rien). Appliqué au CENTRE (slot `value` de `KPIStat` hors privacy +
  branche non-privée de `PrivateAmount` → couvre aussi `DualKPIStat`) → pas de correction site-par-site.
  Miroir de `PrivateAmount` (« ••• » + « Montant masqué »). Tests : « — » → sr-only exposé + dash aria-hidden ;
  discriminant valeur finie → aucun sr-only fabriqué.
- [x] **`[HIST-GOOGLE-PARITY]`** — ✅ 2026-07-23 absorbé par [HIST-COVERAGE-TOTAL] (couverture complète livrée ;
  l'écart résiduel attendu vs Google = granularité daily + heure FX, documenté ci-dessous). Question Marc :
  (« utiliser exactement la courbe de google finance c'est possible ? ») —
  RÉPONSE COURTE : non, pas directement (Google Finance n'a PAS d'API publique de portefeuille/courbes ; la scraper
  violerait les ToS et casserait sans prévenir). La bonne cible = PARITÉ par couverture complète (HIST-COVERAGE-TOTAL) :
  mêmes titres tous couverts + FX → la courbe converge vers celle de Google (même donnée sous-jacente). Écart résiduel
  attendu : granularité (daily close vs intraday) et heure de FX.

## 💰 Budget — 3 vues (demande Marc 2026-07-22, verbatim « backlog: »)
- [x] **`[BUDGET-3-VUES]`** ✅ (2026-07-23, PR #500) — cadrage validé Marc : PAR POSTE · moyenne
  **12 mois** · prévision = la CIBLE saisie · 3 colonnes. Livré : colonne « Moy. 12m » par poste
  (`BudgetGroupTable`, moyenne des 12 derniers mois pleins via `buildMonthlyLedger` — même base que
  l'historique par poste ; ramenée à la période affichée, sans inflationSim) + bandeau de groupe
  réel · moy. · cible (montants gatés mode discret) + « — » honnête sans historique révolu
  (`coveredFullMonths` exposé, additif). La « projection fin de mois » (réel extrapolé au prorata)
  n'a PAS été retenue au cadrage — la rouvrir seulement si Marc la demande.
- [x] **`[BUDGET-MATCH-UNIFY]`** ✅ (2026-07-24, PR #501) — le ledger (moyenne 12m + grand livre)
  rapproche tx→poste par la MÊME règle fuzzy que le réel : `matchCategoryToName` (variante noms-seuls
  extraite de `matchTransactionToCategory`, qui délègue — UNE source de la règle). Discriminant prouvé
  par git stash (« Restaurant » → poste « Restaurants » : moy 300 $ au lieu de 0 $). ⚠️ Le ticket
  SUR-prescrivait « les trois ensemble » : la CIBLE AUTO est restée exacte À RAISON — au moment du
  calcul, les noms de postes ≡ catégories observées (la sync canonicalise avant) → l'exact n'y diverge
  jamais du fuzzy, et un fuzzy mono-catégorie aurait risqué un double-comptage cross-poste.
- [x] **`[MCP-CATEGORY-ALLOWLIST]`** ✅ (2026-07-24, PR suivante) — la catégorie LIBRE d'`apply_bank_statement`
  est validée au point d'écriture (`mcp/ingest/applyDocument.ts`, module PARTAGÉ app↔MCP → les deux surfaces
  couvertes par construction) : allowlist = postes existants + `RULE_CATEGORIES`, insensible casse/accents
  (remap vers la forme canonique) ; inconnue (« Sport ») → `ruleCategorize(payee)` sinon « Non catégorisé »,
  et le summary COMPTE les remaps (jamais silencieux). Discriminant prouvé par git stash. Bonus : l'exemple
  de la description du tool enseignait « Alimentation » (hors canon !) — désormais DÉRIVÉ de `RULE_CATEGORIES`.
  NB conservé : ne PAS ancrer le fuzzy sur mots entiers (casserait « Restaurant » ⊂ « Restaurants »).
  **Extension (panel PR #502)** : helpers PURS partagés (`categoryKey`/`buildCategoryCanonicalMap`/
  `resolveCandidateCategory` dans `categoryRules.ts`) + le MÊME enforcement porté à `categorizeBatch`
  (finding ÉLEVÉ silent-failure : le prompt affirmait « sera rejetée » sans code — désormais hors liste →
  règles payee sinon « Autre », compté + logError). Collision poste↔RULE_CATEGORY documentée+testée (le
  poste gagne). **Réfuté pour l'import CSV** : la catégorie d'un CSV est une DONNÉE RÉELLE de la banque —
  par design Lot C (postes ≡ catégories observées), elle devient légitimement un poste au prochain sync ;
  l'allowlist la détruirait. Fenêtre fuzzy pré-sync transitoire, s'auto-résout au sync.
  **2ᵉ passe (ai-reviewer)** : sur un remap, `isTransfer`/`confidence` recyclés portaient sur la catégorie
  REJETÉE (« Transfert » avec isTransfer:false = compté à tort dans le Σ affiché) → isTransfer dérivé de la
  catégorie FINALE, confiance 100 (règle) / 0 (repli honnête) ; logError AGRÉGÉ 1×/batch (pas 1×/chunk —
  ~40/100 entrées du journal sinon) ; défaut `safeCategories` aligné sur `RULE_CATEGORIES` (littéral
  divergent « Alimentation »/« Loisir » retiré).
- [x] **`[AI-CATEGORIZE-MISSING-ID]`** ✅ (2026-07-24, PR suivante) — `missingIdCount` agrégé sur le
  batch + logError warning (même pattern que `offListCount`) : une transaction absente de la réponse
  JSON du modèle laisse désormais une trace au lieu d'un silent-drop.
- [x] **`[DEP-HONO-TRAVERSAL]`** ✅ DOUBLON (2026-07-24) — même résiduel que `[DEP-HONO-NODE-SERVER]`
  déjà triagé sous `[DEP-DEPENDABOT-2026-07]` (§ Dépendances) ; re-triage 2026-07-24 identique (patch
  2.0.5 publié le jour même, toujours hors range du SDK 1.29.0, exploitabilité nulle : zéro
  serveStatic/hono dans `mcp/`, Cloud Run Linux). Suivi UNIQUE : `[DEP-HONO-NODE-SERVER]` — re-vérifier
  à chaque bump du SDK MCP. Leçon : GREP le BACKLOG avant de créer un ticket sur un finding « nouveau ».

## 🔮 Futur — densité d'icônes (bug Marc 2026-07-24 : « pas assez d'icônes dans futur »)
- [x] **`[FUTUR-ICON-DENSITY]`** ✅ (2026-07-24, PR suivante) — l'échantillonnage des pastilles
  d'événements (`thinEvents`, `FutureProjection.tsx`) utilisait un PAS ENTIER `step = ceil(len/cap)`
  qui SOUS-REMPLISSAIT le plafond dès que `len` dépasse un peu `cap` : mesuré 25 événements cap 24 →
  **13 montrés** (au lieu de ~24), 17 flux cap 16 → 9, 30→15, 49→17. Marc voyait ~la MOITIÉ du cap.
  Fix : `utils/sampleEvenly.ts` (pur, testé) répartit EXACTEMENT `cap` indices uniformément (extrémités
  incluses, ordre préservé, zéro doublon) → le plafond 24/16 est enfin ATTEINT. Les `pinned` (FIRE) et
  le LOD « zoom = toutes » (fenêtre zoomée < cap → `len<=cap` rend tout) restent inchangés. Le plafond
  lui-même (24/16) est laissé tel quel (décision Marc R4 2026-06-22) ; à MONTER seulement s'il en veut plus.
- [x] **`[ASSISTANT-HUB]`** ✅ (2026-07-23, PR #492) — onglet Assistant VISIBLE dans la nav (remplace
  « Prochaine action » — il n'était accessible que par Alt+9/Cmd+K) ; cartes de signaux
  (`AiChatSignalCards` ← `useFinancialSignals` ← `computeFinancialSignals`, moteur PUR partagé avec le
  tool MCP — un seul avis) au-dessus du chat, clic → discussion contextualisée ; widget Haiku
  `getNextBestActions` + cache 1h RETIRÉS de services/claude.ts ; enum `Tab.ACTIONS` retiré (8 sites
  migrés, typecheck comme filet) + redirect deep-link `#ACTIONS`→`#ASSISTANT` ; mode discret = clic
  désactivé (ADR : pas de redaction fragile). Tests : parité narrow↔full du hook, clic/mode discret
  discriminants, scan redirect. ADR complet : docs/decisions.md.

## 🖥️ Chat conscient de la page (demande Marc 2026-07-22 : « le chat peut réagir à tout sur la page »)
- [x] **`[CHAT-PAGE-CONTEXT]`** ✅ vague 1 (2026-07-22, PR #490) — onglet actif (Tier 1, TOUTES les pages,
  `TAB_LABELS` déplacé en source unique dans `constants.ts`) + Budget en contexte FIN (Tier 2 : période
  humanisée, vue, dépenses/cible/revenus AFFICHÉS, top 3 catégories, filtre personne) via le registre pur
  `services/aiChat/viewContext.ts` + `useViewContextPublisher` (gate mode discret À LA SOURCE). Injection en
  FIN de `system` (figée par envoi — ADR docs/decisions.md, PAS un tool). Badge « Contexte : Budget —
  juillet 2026 » contestable dans le chat. Page non instrumentée → aveu honnête. Parité canonique verrouillée
  (`Budget.viewContext.test.tsx` : détail ≡ computeBudgetParity/computeIncomeBreakdown — jamais un 3e chiffre).
- [ ] **`[CHAT-PAGE-CONTEXT-V2]`** (M) — vague 2 : instrumenter les autres onglets (Investissements : filtres/
  compte ; Futur : scénario + année survolée ; Impôts : année ; Dettes ; Transactions : recherche/filtre actifs).
  Un onglet = un petit detail typé ajouté à l'union `ViewContextDetail` + un publisher — le pipeline est en place.
- [ ] **`[CHAT-PAGE-CONTEXT-V3]`** (M) — vague 3 : état fin volatile (modal ouvert, tooltip figé du graphe Futur,
  ligne sélectionnée) — évaluer la valeur réelle avant (fragile, très volatile).

## 🔐 Drive — « je veux plus devoir me reconnecter tout le temps » (rappel Marc 2026-07-22)
- [ ] **`[AUTH-DRIVE-STILL-RECONNECT]`** 🔴 (suivi actif, demande Marc réitérée APRÈS le merge de #483) —
  exigence : connecté UNE fois → ça tient (reconnexion seulement après ~8h d'inactivité). `[AUTH-DRIVE-INACTIVITY]`
  (#483, mergée 2026-07-22) livre exactement ça (jeton en localStorage + `renewTokenSilently` prompt='' au boot,
  gaté < 8h d'inactivité). **À VÉRIFIER par Marc une fois le deploy Vercel en prod** : si la reconnexion est
  encore demandée, investiguer les causes résiduelles : (a) session Google elle-même expirée/déconnectée
  (le silencieux ne peut rien), (b) ITP/cookies tiers bloquant l'iframe GIS `prompt=''` (Safari/brave →
  `error_callback`), (c) `lastActivity` jamais enregistré ou > 8h (gate refuse le silencieux), (d) multi-onglets/
  multi-PC (le jeton est device-local — chaque appareil a sa première connexion). Instrumenter au besoin :
  logError info sur CHAQUE échec de `renewTokenSilently` avec la raison GIS exacte, visible dans Réglages → Diagnostics.
  ✅ **Instrumentation livrée (2026-07-24, PR suivante)** : `traceSilentRenewalFailure(context, error)`
  (`gisAuth.ts`) trace `info` la raison GIS exacte, throttlée 1×/(contexte+raison)/session
  (`logErrorThrottled` — le polling 60 s noierait le journal sinon). Câblée aux DEUX trous : le minuteur
  de renouvellement (`gisAuth.ts`, qui avalait TOUT en `.catch(()=>{})` — le vrai trou noir, aucun
  appelant) ET le cas NOMINAL de `trySilentReauth` boot/gate (`syncLifecycle.ts`, jusqu'ici muet). Reste
  la vérif HUMAINE de Marc en prod : ouvrir Diagnostics après une reconnexion redemandée → la raison GIS
  (`login_required` = session Google expirée, `popup_failed_to_open`/cookies = ITP Safari/Brave) tranche.
  **Panel PR #504** : sévérité DÉRIVÉE (`info` nominal / `warning`+stack anormal — un vrai bug du minuteur ne se
  déclasse plus en info) ; **trou 401 fermé** (un `DriveAuthError` — jeton rejeté par l'API Drive, scope révoqué —
  était TOTALEMENT muet aux 2 sites gate+boot ; même surface « reconnexion redemandée » → tracé) ; helper renommé
  `traceSilentAuthFailure` (couvre renouvellement GIS ET 401 Drive).
  ✅ **`[AUTH-DRIVE-BANNER-FLICKER]` fix livré (2026-07-31)** — cause de la « bannière rouge qui apparaît souvent
  et s'enlève parfois seule » (rappel Marc 2026-07-31) : `runBootSync` (polling 60 s + retour d'onglet) basculait
  `connected:false` sur TOUTE erreur post-jeton (timeout Drive transitoire, réseau au réveil de veille) ET dès le
  1er raté du renouvellement silencieux → la bannière « tes changements ne sont PAS sauvegardés » mentait puis
  disparaissait au tick suivant. Désormais (`syncLifecycle.ts`) : jeton valide + erreur Drive non-401 → on RESTE
  connecté (`handleError('boot')`, trace Diagnostics) ; raté TRANSITOIRE du renouvellement → grâce de 3 ticks
  (~2 min) avant la bannière ; échec DÉFINITIF (`AuthInteractionRequiredError` session Google morte, 401
  `DriveAuthError`) → bannière immédiate (elle dit vrai). Pendant la grâce, un push raté affiche la bannière
  « échec de sauvegarde » (honnête, bouton Réessayer). Reste le cas légitime « faut me reconnecter » : session
  Google expirée / cookies tiers — la raison GIS exacte est dans Réglages → Diagnostics.
  **Panel #542 (code-reviewer + silent-failure-hunter, 2 vrais findings, tous corrigés dans la même PR)** :
  (1) réentrance PROUVÉE par sonde — `focus` + `visibilitychange` tirent 2 `runBootSync` quasi simultanés et la
  garde `busy` ne couvre pas la phase jeton → le compteur avançait de 2 pour UN retour d'onglet (bannière dès
  2 alt-tab) → verrou `_bootSyncInFlight` (modèle `_decisionInFlight`), qui déduplique AUSSI les
  `renewTokenSilently` concurrents (`_pendingReject` singleton gisAuth) ; (2) une panne Drive PERSISTANTE
  non-401 restait invisible hors Réglages (la bannière n'affiche que déconnexion/push) → la série de grâce
  compte AUSSI les erreurs Drive post-jeton : 3 ticks ratés consécutifs (toutes causes transitoires
  confondues) → bannière. §3 assumé + documenté (`flushPush`) : pendant la grâce (~3 min max), un flush au
  pagehide peut échouer sans signal — zéro perte (le prochain boot pousse), seul coût = copie Drive périmée
  pour le MCP jusqu'à la prochaine ouverture.

## 📈 PORTFOLIO-HISTORY — courbes de cours réelles (bug Marc 2026-07-22, PR #485)
- [x] **`[PORTFOLIO-HISTORY]`** ✅ 2026-07-22 — courbes par action (depuis 1er achat) + courbe portefeuille
  entier sur les vraies surfaces. Chaîne gratuite Finnhub→Yahoo proxy→CoinGecko (contrat null=erreur/
  []=vide), hydratation persistée (`hydrateAssetHistories`, fraîcheur 24h, pacing 2,5s, FUSION au re-sync),
  builder pur (`buildMarketData` : DCA×close natif×FX, buckets TOTAL_*, agrégat multi-comptes, prix périmé
  >7j exclu, partialHistorySymbols). **Panel adversarial 30 agents : 9 findings confirmés APPLIQUÉS** (dont
  3 ÉLEVÉS mesurés : écrasement colonne multi-comptes 10 k$, garde devise crypto −27,5 %, clés éparses
  ligne 0 → piles Dashboard fausses/modal vide) + matching exact (`historyKeyMatchesSymbol`), cache IDB
  qui survit au boot (+ sweep), chips Investissements distinctes, note honnête excluded/partial.
- [x] **`[HIST-SESSION-HYDRATE]`** ✅ 2026-07-29 (PR #518) — clé stable de symboles en dep de l'effet boot. (S) — hydratation UNIQUEMENT au boot (`useEffect []`) : un actif
  AJOUTÉ en cours de session n'a pas de courbe (ni part au TOTAL) avant le prochain reload, sans message.
  Déclencher une hydratation ciblée à l'ajout d'actif (AddStockForm/import courtier) ou sur changement de
  la liste des symboles.
- [x] **`[HIST-INFLIGHT-DEDUP]`** ✅ 2026-07-29 (PR #518) — dédup in-flight dans withCache (rejet partagé, clé libérée en finally). (S) — au PREMIER boot (store sans priceHistory), `usePastPortfolioHistory`
  (Futur, sans pacing) et `hydrateAssetHistories` (pacé) peuvent fetcher les MÊMES symboles en parallèle
  (withCache ne déduplique pas l'in-flight). Bénin après le 1er boot (le store est hydraté). Dédup in-flight
  dans withCache ou skip usePast quand l'hydratation est en cours.
- [ ] **`[HIST-BENCH-SYMBOL]`** 🟢 (décision produit Marc) — la carte « Marché (CW8 / MSCI) » d'Investissements
  est STRUCTURELLEMENT morte en données réelles (buildMarketData n'émet que les symboles détenus — pas de
  benchmark) → « — » permanent + momentum « bat le marché » comparé à 0. Soit hydrater un benchmark (ex.
  XWD.TO) via la même chaîne, soit retirer la carte et la branche momentum-vs-marché.
- [ ] **`[HIST-STORE-SIZE]`** 🟡 (M, à MESURER) — `priceHistory` quotidien depuis le 1er achat vit dans le
  store PERSISTÉ (localStorage + chaque push Drive) : ~25-30 Ko/symbole/3 ans, croît sans cap (surtout avec
  la fusion crypto > 365 j). Mesurer la taille réelle du payload sync ; si notable → downsample du stocké
  (quotidien 1 an, hebdo au-delà) ou sortir l'historique vers IDB device-local (pattern PROJECTION-PERSIST).
- [x] **`[HIST-PREVIEW-PROXY]`** ✅ 2026-07-29 (PR #518) — const yahooProxy partagée server/preview. (XS) — `vite preview` n'a pas de proxy `/api/history/yahoo` (seul `server.proxy`
  dev est configuré) → repli Yahoo → fallback SPA → HTML → null honnête, graphes vides en preview local.
  Ajouter `preview.proxy` miroir si on se met à utiliser vite preview.

## 🔎 Analyse app complète 2026-07-15 (panel 4 agents — rapport : `docs/ANALYSE_APP_2026-07-15.md`)
> Demande Marc : « une grosse analyse de l'app ». Détail, preuves fichier:ligne et plan d'ordre dans le rapport.

- **`[DETTE-PDF-FX-BYPASS]`** ✅ **LIVRÉ 2026-07-15 (Vague 1)** — `pdfReport.buildHoldingsRows` ET
  `useDerivedFinancials.assetBreakdown` (2ᵉ instance latente RÉVÉLÉE par le garde resserré) routés par
  `assetValueCad` ; garde `assetFxGuard` resserré (n'accepte plus qu'`assetValueCad`/`toCurrencyFactor`, plus le
  `fx`/`factor` nu qui laissait passer le bug). Panel financial-integrity : bascule correcte ou strictement meilleure.
- **`[ARCH-SYNC-SPLIT]`** ✅ **LIVRÉ 2026-07-15 (Vague 3)** — `syncOrchestrator.ts` (892 l.) scindé en **9 modules à
  responsabilité unique + barrel de compat** verbatim (API publique inchangée, zéro site appelant modifié) : `syncStatusStore`
  (propriétaire UNIQUE de `_status`+listeners, racine du DAG), `syncTypes`, `syncSnapshot` (getLocalPayload + helpers purs +
  ceinture persona PUSH), `syncErrors`, `syncMeta`, `syncPush` (`_apiKeysHydrated`/`_pushInFlight`/`_pushTimer`), `syncPull`
  (pullNow + applyPulledPayload + ceinture persona PULL — le point d'écrasement 230k$), `syncLifecycle` (`_decisionInFlight`,
  switch anti-clobber `runDecision`), `syncPolling` (`_pollTimer`), `syncPassphrase`. Règle « un état mutable = un module
  propriétaire » : `grep "let _status"` == 1, double-ceinture `sanitizePersistEnvelope` == 2 (push+pull, non fusionnée),
  `madge --circular` == 0. 81 tests sync verts, suite complète + typecheck OK.
- **`[SEC-DRIVE-ENCRYPT-DEFAULT]`** ⏸️ **EN ATTENTE DÉCISION MARC (2026-07-16)** → voir `docs/A_FAIRE_MOI.md` §O-SYNC.
  Payload Drive EN CLAIR par défaut (chiffré seulement si passphrase opt-in) alors que les clés API ont déjà un
  chiffrement dérivé du `sub` Google (keyCipher). MAIS l'appliquer au payload touche l'anti-clobber (decideOnLoad
  lit le payload clair pour le noop « contenu identique » ; summarizeForConflict lit assets/tx en clair) + exige une
  migration de format (`SyncEnvelope.enc` bool→tri-état). Plan-first Claude 2026-07-16 : gain modeste (Drive privé,
  clé `sub` non-secrète) vs risque money-critical → reco basse priorité / passphrase pour du vrai secret. Décision Marc requise.
- **`[SEC-VISION-CONSENT-INJECTION]`** ✅ **LIVRÉ 2026-07-15 (Vague 4)** — clause anti-injection `VISION_INJECTION_GUARD`
  (`utils/promptSafety.ts`) câblée dans les 2 prompts Vision (paie + relevé) : un document peut contenir du texte
  adversarial lu par le modèle → traité comme donnée, jamais comme instruction (test scan) ; + `temperature: 0` sur les
  2 appels Vision (extraction déterministe). + avis de confidentialité EXPLICITE Loi 25 sur les **3 surfaces d'envoi
  brut** (relevé `ImportBankStatement`, paie `PayslipUploadCard` + `TaxCenter` — panel security-privacy). RESTE (petits
  suivis) : `[SEC-ONBOARDING-VISION-TEXT]` (le texte d'onboarding « marchands tronqués + arrondis 100 $ » décrit le
  pipeline TEXTE, trompeur pour le Vision brut — à nuancer) ; QA manuelle du guard (upload piégé « ignore… ») non
  automatisable côté no-backend ; aperçu d'import limité à 3 lignes (`slice(0,3)`, pré-existant).
- **`[MCP-CHARTDATA-SUM-GUARD]`** 🟡 MOYEN (M) — garde-fou générique : tout nouveau tool MCP qui SOMME des flux
  chartData retombe dans le piège MCP-RETIREMENT-VERDICT (décaissement non-enreg sans champ Retrait*) ; corrigé au
  cas par cas aujourd'hui, à systématiser (test/lint de convention sur mcp/tools/*).
- **`[UX-STATEMENT-REMINDER]`** ✅ **LIVRÉ 2026-07-15 (Vague 3a)** — helper pur `computeStatementReminderStatus`
  (détecte : aucune transaction réelle ce mois-ci = relevé non importé, ≥ 1 mois de retard, après le 5 du mois) +
  bannière dismissible `StatementReminder` (onglet Budget, CTA « Importer mon relevé » → onglet Transactions, dismiss
  keyé par mois courant → réapparaît le mois suivant si toujours en retard). Le filet d'import mensuel qui manquait.
- **`[DETTE-GODFILE-BUDGET]` / `[DETTE-GODFILE-INVESTMENTS]`** 🟡 MEDIUM (L, au fil de l'eau) — 1 289/1 163 lignes ;
  répliquer le pattern « sections » qui a réussi sur Settings (207 l.) ; extraire coupleAnalysis/fiscalBreakdown/
  alerts vers services/budgetAnalysis.ts (purs, testables) et DEFAULT_TARGET_MODEL/écarts vers services/.
- **`[DETTE-CLAUDE-SPLIT]`** 🟡 MEDIUM (M) — services/claude.ts = 8 features IA indépendantes (918 l.) → split
  mécanique services/claude/ + re-export (zéro breaking).
- **`[DETTE-TOLOCALESTRING-NU]`** ✅ **LIVRÉ 2026-07-15 (Vague 1)** — 6 sites `toLocaleString()` nus (AiAssistant ×5,
  taxApril payé+remboursement) routés par `formatNumber`/`formatCAD` (NaN → « — »). Zéro `toLocaleString()` nu restant
  (grep exhaustif). Bonus panel : `AiAssistant:103` `success`/`fvi` passés de `!= null` à `Number.isFinite` (évite « NaN% »).
- **`[DETTE-TESTGAP-MARKETDATA]`** ✅ **LIVRÉ 2026-07-15 (Vague 1)** — `tests/services/marketDataRouting.test.ts` :
  6 tests de routage `pickProvider` (crypto→CoinGecko même sans clé ; action→Finnhub ; crypto va TOUJOURS à CoinGecko
  même avec clé), preuve par l'URL réellement appelée (coingecko.com vs finnhub.io).
- **`[DETTE-DEADCODE-2026-07]`** ✅ **LIVRÉ 2026-07-15 (Vague 4)** — locales `_`-préfixées mortes retirées (Budget.tsx
  `_totalTaxDisplay`/`_totalGrossDisplay` + leur chaîne source `totalTaxMonthly`/`totalGrossIncomeMonthly`, RealEstate
  `_downPaymentPercent`, AiAssistant `_retirementAge`). typecheck clean après retrait.
- **`[DETTE-CHART-THEME-DUP]`** 🟢 LOW (S) — tooltip Recharts dupliqué 14× avec 4 fonds différents → constante
  partagée CHART_TOOLTIP_STYLE. · **`[DETTE-INPUT-PRIMITIVES]`** 🟢 LOW→M — 81 inputs inline sans primitive
  Field (40 dans AdvancedProjectionParams). · **`[SEC-GA-DEFER-CONSENT]`** 🟢 LOW (S) — injecter gtag.js APRÈS
  consentement. · **`[ENG-RAMQ-FIELDS]`** 🟢 LOW (M) — 2 TODO moteur (enfants à charge, assurance médicaments privée,
  champs User additifs).
- **DÉCISIONS DE GEL proposées (produit)** : `[CIX]` en entier + raffinements per-conjoint/dons + durcissement
  OAuth au-delà de l'existant + chasses d'affichage LOW sans impact patrimoine — tant que la situation de
  l'utilisateur (solo, 26 ans) ne change pas. La doc « 31 sous-modules projection » corrigée → 41.

### Findings du panel Vague 1 (2026-07-15) — routés (pré-existants, hors périmètre de la vague)
- **`[AI-PROMPT-FAKE-ZERO]`** ✅ **LIVRÉ 2026-07-16 (Vague 4)** — `roundToHundred` non-fini rend désormais `NaN` (plus `0`) ;
  nouveau helper `promptCad(x)` = fini ? `<arrondi>$` : `(non disponible)` appliqué aux **27 sites d'affichage** de prompts
  (`services/claude.ts`) ; le site pseudo-JSON de `categorizeBatch` garde `amount: null` pour un montant non fini. Plus de faux
  « 0$ » envoyé au modèle (no-fake-data) — pendant `claude.ts` du fix Vague 1 d'`AiAssistant.tsx` (« — » via `formatNumber`).
  Test discriminant via `buildRebalancePrompt` (NaN → « (non disponible) », jamais « 0$ »/« NaN »).
- **`[MCP-PROMPT-SCRUB]`** ✅ **LIVRÉ 2026-07-16 (Vague 4)** — `jsonContent` (`mcp/tools/_dataAware.ts`) applique `scrubMcpDeep` :
  neutralise (strip contrôle + markup/injection, borne 200 via `sanitizePromptText`) les valeurs sous les CLÉS de texte libre
  utilisateur (`USER_TEXT_KEYS` = name/payee/category/label/employer/description) — nom d'actif Finnhub, payee/catégorie d'un PDF
  de courtage, nom de projet/dette/utilisateur, employeur. ⚠️ **PAS un scrub aveugle** (1er jet réfuté par double panel
  security+code-reviewer) : les notes/verdicts money-critical rédigés par le CODE (`notes`, `netTaxSettlementsNote`, `dollarsBasis`…)
  et les identifiants (`symbol` → `^GSPC`) passent INTACTS (le scrub aveugle les tronquait à 200 → détruisait les garde-fous
  anti-mésinterprétation). Central → couvre tous les tools data-aware pour les clés connues. Tests discriminants (nom malveillant
  neutralisé ; « Vanguard S&P 500 » + notes code-auteur au-delà de 200 c. intactes).
- **`[AUTH-DRIVE-PERSIST]`** ✅ **LIVRÉ 2026-07-16** (demande Marc « ne plus me reconnecter à Drive à chaque reload ») — jeton
  GIS `sessionStorage`→`localStorage` (clé dédiée, jamais synchronisée) + renouvellement silencieux avant ~1h (`gisAuth.ts`).
  DOUBLE panel (security-privacy + code-reviewer) a trouvé + fait fixer une régression HIGH : le renouvellement débornait une
  « sync fantôme post-déconnexion » cross-onglet (Loi 25) → écouteur `storage` qui purge le jeton mémoire quand un autre onglet
  efface la clé (disconnect OU deleteRemoteData). + plancher 30 s (anti-boucle), skip si acquisition interactive en vol. 19 tests.
  Découverte livrée à part : `[PROJECTION-PERSIST]` (voir entrée dédiée ci-dessous).
- **`[PROJECTION-PERSIST]`** ✅ **LIVRÉ 2026-07-16** (demande Marc « la projection reste, badge si pas à jour ») — la signature
  de révélation (`revealedProjectionSig`, HASH court) passe d'un useState local à un champ PERSISTÉ du store (additif, hors
  denylist → localStorage + sync Drive → autre PC) ; blob figé en IDB chiffrée (record `revealed` de `lockedProjectionStore`,
  refactor saveRecord/loadRecord/clearRecord par id, zéro migration) ; substitution unique `results = gel ?? live` → courbe/
  KPIs/plan cohérents ; badge « Pas à jour » + « Recharger avec mes données » / « Rechoisir mes leviers » (choix Marc : FIGER,
  jamais recalculer en douce). Repli honnête sans blob (autre PC) : live + badge. Gel coupé en mode test. Panel (3 agents) →
  4 findings réels APPLIQUÉS : garde no-fake-data au reload (carte « se recharge » au lieu de KPIs 0 $), garde mode-test sur la
  SUPPRESSION du blob réel, hash au lieu du JSON complet persisté, dédup module-level des écritures IDB (~1-2 Mo par visite
  d'onglet sinon). 7 tests discriminants (git-stash rouges) + round-trip IDB réel (devDep `fake-indexeddb`).
  Suivis non bloquants (panel) :
  - **`[FUT-TOUCH-TARGETS]`** 🟢 LOW (S) — les petits boutons de l'onglet Futur (période, Verrouiller, Ré-optimiser, badge)
    font ~22-24 px de haut sans `.touch-target` (pattern systémique du fichier, pas une régression) — à uniformiser avec le
    sweep a11y des CHAMPS déjà en attente de Marc.
  - **`[PROJ-REVEAL-RACE]`** 🟢 LOW — course étroite « Rechoisir » vs sauvegarde-miroir en vol (blob orphelin possible,
    récupérable en re-révélant) ; et vérification empirique de la cadence de republication moteur (console.count sur l'effet
    miroir, cf note historique syncPush:138) si un doute de fréquence d'écriture IDB apparaît.
- **`[A11Y-BANNER-HOVER-CONTRAST]`** ✅ **LIVRÉ 2026-07-16 (Vague 4)** — `BackupReminder` variante quota : `hover:bg-danger-500`
  + blanc 12px = 3,76:1 (< AA) → hover qui FONCE (`hover:brightness-90` = 5,23:1 mesuré en linéaire). ⚠️ Le fix CeliAssetNudge
  (`hover:brightness-110`, base info-600 = 4,81:1 OK) aurait échoué ICI de justesse (danger-600 ×1,1 = 4,48:1) — le facteur
  dépend de la BASE, toujours mesurer, jamais copier-coller. Variante warning (translucide) mesurée conforme (8,64/5,27) — rien
  à changer. La GÉNÉRALISATION au design-system des bannières rejoint le sweep a11y des champs (en attente preview Marc).

## 🔬 Audit financier 2026-07-16 (passe n°2) — findings vérifiés (rapport : docs/AUDIT_FINANCIER_2026-07-16.md)
> Cœur AAA confirmé (fiscal 0 écart/~180 valeurs ; conservation : 31 scénarios, résiduel max 0,02 $ ; 41/41
> modules testés ; 2661/2661). Lot de juin fermé 12/14. Les findings ci-dessous sont TOUS contre-vérifiés
> dans le vrai code (trust-but-verify) — détail/preuves au rapport §5.

- [x] **`[STORE-REHYDRATE-SILENT]`** 🔴 CRITIQUE (S) — ✅ 2026-07-17 (lot corrections audit) : `onRehydrateStorage`
  ajouté (logError critical + `getHydrationStatus()` exposé), `migratePersistedState` wrappé avec traçage PAR PALIER
  (`palier « v5→v6 »` dans le message), toast CRITIQUE honnête dans App (« NE RIEN SAISIR — restaure un backup », le
  blob reste INTACT). 4 tests discriminants (`tests/store/hydrationNet.test.ts`), prouvés rouges sur l'ancien code.
- [x] **`[DASH-NW-DUP]`** 🔴 HIGH (M) — ✅ 2026-07-17 (lot corrections audit) : le repli sans CSV route sur
  `computePresentNetWorth` (dettes soustraites), le chemin principal sur `computeTotalDebt` (gardé isFinite) ;
  périmètre immo ÉTIQUETÉ sur le KPI (« équité immo incluse » seulement si immo présent) + « Revenu actif » étiqueté
  « (net, salaire déclaré) ». Test discriminant Dashboard (persona endetté : 590, pas 990), prouvé rouge avant fix.
- [x] **`[INCOME-3WAY-SPLIT]`** 🔴 HIGH (S-M) — ✅ 2026-07-17 (lot corrections audit) : `buildFinancialSnapshot`
  (→ MCP get_financial_overview + IA) route sur `computeMonthlyActualAverages` (même base que Budget), repli
  étiqueté `monthlyIncomeSource: 'declared'` ; le prompt `claude.ts` étiquette « (réel, moyenne des transactions) »
  vs « (salaire déclaré) » ; `NextBestAction` consomme désormais `buildFinancialSnapshot` (fin du recalcul local).
  2 tests discriminants (2300 réel ≠ 4000 déclaré, remboursement exclu), prouvés rouges avant fix.
- [x] **`[MCP-TOOLS-SILENT-CATCH]`** 🟠 ÉLEVÉ (S) — ✅ 2026-07-21 (lot audit n°2) : les **7/7** catch de frontière
  (`withState` ×2, `runApply` ×2, `applyPayslip` — routé sur `runApply`, dé-duplication finding panel —,
  `connectDrive` trouvé par le panel) appellent `logError` AVANT de rendre la réponse d'erreur à Claude → traçable
  dans les logs Cloud Run (errorLogger route console.*). Tests `tests/mcp/mcpBoundaryLog.test.ts`
  (3 discriminants + 1 anti-bruit nominal), prouvés rouges pré-fix.
- [x] **`[SYNC-APIKEYS-SILENT]`** 🟡 MOYEN (S) — ✅ 2026-07-21 (lot audit n°2) : échec `saveApiKeys` au PULL →
  `logError` warning (best-effort préservé) **+ côté PUSH (finding panel)** : les 2 catch clés-API (chiffrement ;
  relecture de préservation D5) journalisés aussi. Tests discriminants dans `syncOrchestrator.flow.test.ts`.
- [x] **`[DEBT-SUM-DUP]`** 🟡 MOYEN (S) — ✅ 2026-07-21 (lot audit n°2) : les 2 sites restants
  (`HealthIndicator:108`, `DebtManager:73`) routés sur `computeTotalDebt` (NextBestAction et Dashboard l'étaient
  déjà depuis le lot #471). Zéro reduce local de soldes de dettes restant.
- [x] **`[MCP-USERTEXT-LANDMINE]`** 🟡 MOYEN (S, préventif) — ✅ 2026-07-21 (lot audit n°2) : `USER_TEXT_KEYS`
  += `insurer`/`beneficiary`/`destination`/`userNotes`. ⚠️ `notes` N'EST PAS ajouté (RÉSERVÉ code-auteur,
  cf MCP-PROMPT-SCRUB — un futur champ de notes UTILISATEUR doit s'appeler `userNotes`). Test de garde.
- [x] **`[LOG-TOKEN-ANCHORED]`** 🟢 LOW (XS) — ✅ 2026-07-21 (lot audit n°2) : `token` → `.*token` (suffixe ancré)
  → `accessToken`/`refresh_token`/`idToken` redactés, `factor` toujours épargné (anti-faux-positif testé).
- [x] **`[MCP-RUNPROJECTION-AMBIG]`** 🟢 LOW (XS) — ✅ 2026-07-21 (lot audit n°2) : description réécrite
  « CALCULATEUR GÉNÉRIQUE… ne lit PAS les données réelles » + aiguillage explicite vers `get_projection`
  (vraie projection) / `get_retirement_outlook` (retraite) / `simulate_what_if` (scénarios sur SES données).
- [x] **`[LINT-4-WARNINGS]`** ✅ réglé dans la PR du rapport (3 locales mortes `financialSnapshot.ts` + import
  `within` orphelin `Budget.test.tsx`) — lint 0 problème.
- Dette non urgente (L, plan-first `architect`) : découpe de `Budget.tsx` (+20 % en 3 sem.) / `FutureProjection.tsx`
  (+13 %) / `TaxCenter.tsx` (+31 %) — le terrain où naissent les récidives de la classe n°1.

## 🔴 Données de test dans les vraies données (2026-07-15) — incident « fausses transactions »
> Marc : « j'ai des fausses transactions sans doute des profils de test je veux plus que ça arrive jamais ».
> Constat (via MCP + code) : ~600 transactions du persona « Karim » (`persona-tx-*`) + objectif `kar-fg1`
> mélangés aux ~200 vraies transactions Desjardins ; [Probable] budgets `kar-b*` aussi. Fuite ANTÉRIEURE
> aux gardes actuelles (persona activé ~2026-06-07), chemin exact non identifiable a posteriori.

- **`[BUDGET-INCOME-REAL]`** ✅ **LIVRÉ 2026-07-16** (bug Marc « les revenus semblent pas logiques ») — revenu du Budget =
  vraies transactions des catégories `Salaire`/`Revenus divers` (`computeIncomeBreakdown`), ventilé, transferts/doublons/
  positifs non-revenu exclus ; badge + payload IA sur revenu réel (moyenne mois pleins) ; carte Santé étiquetée « (salaire
  déclaré) » (garde le brut config, requis pour la décompo brut→net). Panel financial-integrity : 0 bug bloquant.
  Découvertes (SUIVI) :
  - **`[TX-INCOME-CATEGORY-LIST]`** ✅ **PÉRIMÉ 2026-07-16 (faux positif du panel)** — `Revenus divers` EST déjà proposé en
    catégorisation manuelle : `Transactions.tsx:134` unit `systemCats` avec `RULE_CATEGORIES` (`categoryRules.ts:17` contient
    `Revenus divers`). Le panel n'avait lu que le tableau `systemCats` codé en dur (l.131), pas l'union. Rien à corriger.
  - **`[TAX-MCP-INCOMEAVG-TEST]`** ✅ **LIVRÉ 2026-07-16** — test d'intégration sur le contrat MCP `get_tax_situation`
    (`tests/mcp/dataAwareTools.test.ts`) : un remboursement +500 dans un mois plein N'inflate PAS `realMonthlyAverages.income`
    (2300 et non 2800). La sémantique de `computeMonthlyActualAverages` était déjà verrouillée à la source
    (`budgetSync.test.ts:219`) ; ce test verrouille en plus le pass-through côté MCP (chiffre que LIT Claude).
- **`[INCOME-PROVENANCE]` + `[TAX-DETAIL]`** ✅ **LIVRÉ 2026-07-15** (demande Marc : chaîne paie→Impôt→Santé,
  source unique) — salarySource estampillé (scan paie UI + apply_payslip MCP), bannière de provenance +
  détail des retenues (féd/QC/RRQ/RQAP/AE) + réel des transactions dans l'onglet Impôt ; get_tax_situation
  enrichi (withholdings/netMonthly/salarySource/realMonthlyAverages). MCP v0.7.1 → ✅ **Cloud Run redéployé par Marc
  2026-07-16** (dernière version en ligne : v0.7.x + OCC + prompt-scrub).
- **`[BUDGET-MONTHLY-LEDGER]` + `[BUDGET-PAST-AVG]`** ✅ **LIVRÉ 2026-07-15** (demandes Marc : réel
  revenus+dépenses par mois ; budget du mois courant = moyenne de tout le passé ; tuiles Budget/Dépenses
  identiques dédupliquées ; « Revenus 0 » explicité — relevé de compte mensuel en retard sur la carte).
  Cibles `autoTarget` (champ additif) recalculées à chaque chargement ET en cours de session ; grand
  livre 12 mois avec bucket « Autres / non classées » (Σ lignes ≡ Total).
- **`[TX-CATEGORY-RULES]`** ✅ **LIVRÉ 2026-07-15** — règles déterministes de catégorisation (payees QC du corpus
  réel de Marc, ~88 % de couverture mesurée) branchées sur import CSV + bouton Auto-catégoriser (règles AVANT IA)
  + MCP apply_bank_statement + listes de catégories. Jeu canonique 16 catégories (`RULE_CATEGORIES`).
- **`[BUDGET-TX-CATEGORIES]`** ✅ **LIVRÉ 2026-07-15** (verbatim Marc : « seulement et exactement les meme
  catégories que dans transactions ») — sync auto Budget↔catégories observées (`utils/budgetSync.ts`, cible
  suggérée = médiane 6 mois ; retraits à la 1re passe du montage seulement) + table « Historique par catégorie »
  (12 mois, moyenne par mois actif).
- **`[PERSONA-PURGE]`** ✅ **LIVRÉ 2026-07-15** — registre d'ids d'artefacts (`testPersonas/artifactIds.ts`,
  parité fixtures↔registre verrouillée par test-scan) + sanitizer pur (`personaSanitizer.ts`) ancré à
  5 endroits : boot (self-heal + toast), sortie de mode test (snapshot), push Drive, pull Drive,
  restauration de backup. 22 tests (direction anti-faux-positif incluse). La purge des données de Marc
  s'exécute AUTOMATIQUEMENT au prochain chargement de l'app (Vercel déploie au merge).
- **`[PERSONA-LEAK-ROOTCAUSE]`** 🔍 LOW — chemin de fuite exact inconnu (antérieur aux gardes SYNC-ANTI-CLOBBER
  et shouldPush-test). Si récidive malgré PERSONA-PURGE (le log `purgePersonaArtifacts` en ferait foi), creuser :
  restauration d'un backup pris EN mode test avant #217, ou merge conflit Drive d'une époque sans garde.
- **`[FISC-PAYROLL-BASE-INVEST]` + `[TAX-APP-MCP-BASE]`** ✅ **LIVRÉ 2026-07-15 (Vague 2, MCP v0.7.3)** —
  `calculateFiscalReport` gagne un 7ᵉ param optionnel `employmentIncome` (assiette EMPLOI RRQ/RQAP/AE) DISTINCT de
  l'assiette imposable (paliers) ; défaut = grossIncome → **rétrocompat bit-identique** pour les ~15 appelants moteur
  (prouvé par projection-validator + moneyConservation 20/20). TaxCenter passe `uGross` (salaire), get_tax_situation
  aligné sur le MÊME helper partagé `services/taxEstimate.ts` (placement imposable ajouté à l'assiette + `employmentIncome`
  = salaire). **Mesuré : ~1 016 $/an de cotisations sur-évaluées évitées** (salaire 50 k + 230 k non-enreg), discriminant
  git-stash prouvé (0 sans le fix). Panel 4 agents : cœur correct, averageRatePct MCP recalé sur l'assiette réelle +
  `taxableInvestmentIncome` exposé. ⚠️ Redéploiement Cloud Run requis (v0.7.3).
- **`[FISC-SOLO-INVEST-SPLIT]`** 🔧 MEDIUM (finding panel Vague 2, financial-integrity + code-reviewer, PRÉ-EXISTANT) —
  le split du revenu de placement `1/config.users.length` répartit sur les 2 têtes du tuple `[User,User]` MÊME en solo :
  la part attribuée au « conjoint fantôme » (ou à un conjoint payé en `netSalary` seul, exclu de perUserReports côté MCP)
  est abritée sous SON BPA / non imposée → **sous-imposition du placement d'un solo/mono-salarié** (Marc : ~la moitié de
  ~12,6 k$ non imposée). Fix (leçon PH4E-OWNER-EDIT : `.length` d'un tuple est vacueux) : splitter par le nombre de
  contribuables RÉELS (`users[i].name?.trim()` ou brut/net > 0), app ET MCP au même helper. ⚠️ Change les chiffres affichés
  (impôt estimé du solo ↑) → à valider avec Marc + plan-first (touche le split per-conjoint, gelé CIX).
- **`[FISC-ASSETLOC-INTL]`** 🔧 MEDIUM — **ÉVALUÉ 2026-07-15 (Vague 2), DIFFÉRÉ** : s'applique au TYPE de titres de Marc
  (ETF EU internationaux) mais PAS à leur emplacement actuel (100 % non-enregistré, où la retenue étrangère 15 % EST
  créditable — la perte n'existe qu'en CELI/REER, où Marc a 0 $). Le BACKLOG note lui-même « fix non trivial (le patch naïf
  reste 0) ». À reprendre si Marc met de l'international en CELI/REER (cf CELI-ASSET-NUDGE). Latent, pas stale. Détail infra ↓.
- **`[BACKUP-PROMISE-CATCH]`** ✅ **LIVRÉ 2026-07-15 (Vague 4)** — `return await new Promise(...)` appliqué à `createBackupNow`
  ET aux 3 fonctions sœurs du même fichier (`listBackups`/`deleteBackup`/`clearAllBackups`, même bug — panel code-reviewer :
  `restoreBackup` appelait `listBackups` HORS de son try → rejet async non capté sur le bouton « Restaurer »). Un rejet ASYNC
  (tx/req.onerror IndexedDB, ex. quota) repasse désormais par le catch → journalisé + repli. Vrai impact confirmé : le bouton
  « Backup maintenant » (`AutoBackupPanel`, sans try/catch amont) restait en spinner infini. Discriminant git-stash prouvé.
  App.tsx self-heal aligné (`if (!backup)` + commentaire à jour).
- **`[PURGE-TOAST-UX]`** 🎨 LOW (finding panel) — seuls le boot notifie par toast ; les purges au pull Drive /
  sortie de mode test ne sont visibles qu'en SystemView (logError). Si Marc veut la notification partout :
  abonnement générique aux entrées storage PERSONA-PURGE → toast. (`restoreBackup` recharge la page → toast inutile.)

## 🔴 Intégrité des données Drive + MCP (2026-07-14) — incident perte de 230k$ + audit 6 alertes
> Marc a perdu 230k$ de placements (reconnexion Drive → écrasement du local par une vieille copie). Récupéré
> via auto-backup IndexedDB. Audit adversarial (12 agents) des 6 alertes claude.ai : verdicts ci-dessous.
> ⚠️ **Les items MCP requièrent un REDÉPLOIEMENT Cloud Run** (`mcp/deploy.sh`) pour que Marc en profite.

- **`[SYNC-ANTI-CLOBBER]`** 🔧 ✅ **LIVRÉ (PR à venir, 2026-07-14)** — `decideOnLoad` sans `restoreIntent` (une seule
  garde anti-perte : local réel + Drive divergent → `conflict`, jamais d'écrasement auto) + `SyncConflictModal` global
  (résumé « cet appareil vs Drive ») + `SyncStatusBanner` (alerte déconnexion/erreur push) + `flushPush` au masquage
  d'onglet + gate HARD-block (`LoginGate`). Discriminant git-stash prouvé. **Marc : mettre `VITE_GOOGLE_GATE=1` sur Vercel.**
- **`[MCP-RETIREMENT-VERDICT]`** ✅ **LIVRÉ 2026-07-14 (PR MCP v0.6.0)** — `get_retirement_outlook` expose désormais le
  décaissement du portefeuille (`incomeSources.portfolioWithdrawals`, retraits REER/CELI + loyers, moyenne 1re année déflatée
  par point) et `meetsIncomeTarget` est basé sur la SOUTENABILITÉ du plan (`minNetWorth > 0` + MC ≥ 85 si demandé) — plus
  jamais « sous la cible » pour un plan autofinancé (MC 98 %). NB mesuré : le décaissement NON-ENREGISTRÉ n'a pas de champ
  moteur (`Retrait*`) → sommer les revenus sous-estime toujours (3 923 $ identifiables vs cible 5 500 $ sur un plan qui
  tient) → verdict = signal moteur, pas somme. Discriminant git-stash prouvé (DINK : false→true).
- **`[MCP-PAYSLIP-BACKUP]`** ✅ **LIVRÉ 2026-07-14** — `driveStateSource.saveState` : backup Drive horodaté
  (`financeai-sync.json.<ISO>.bak.json`, rolling 5, appDataFolder) AVANT tout écrasement, FAIL-CLOSED (backup impossible →
  write refusé) ; garde de concurrence (`updatedAt` a avancé depuis la lecture → refuse, rien d'écrasé, cache store invalidé
  → le retry relit du frais). `backupPath` désormais réel côté Drive (spec des apply_* tenue). Discriminant prouvé.
- **`[MCP-TAX-COUPLE]`** ✅ **LIVRÉ 2026-07-14** — `get_tax_situation` calcule PAR CONJOINT puis somme (aligné moteur
  `taxDecember.ts:369-395`) ; `marginalRatePct` = marginal du conjoint au plus haut revenu (jamais celui du total fusionné) ;
  détail `perUser`. Discriminant : couple 60/60 → ~22 k$/36,1 % (l'ancien code rendait 33 435 $/45,7 %). Solo inchangé (Marc).
- **`[MCP-STALE-FRESHNESS]`** ✅ **LIVRÉ 2026-07-14** — `mcp/state/freshness.ts` : la source Drive publie l'`updatedAt` du
  blob lu/écrit ; `withState` appose une note de fraîcheur à CHAQUE réponse (date + âge ; > 6 h → avertissement « possiblement
  périmées, ouvre l'app pour pousser »). Claude sait désormais quand la copie Drive est vieille.
- **`[PROJ-TAXPAID-LABEL]`** 🔶 **partiellement livré 2026-07-14** — surface MCP faite : `get_projection` ET `simulate_what_if`
  renomment le champ en `netTaxSettlements`/`netTaxSettlementsDelta` + note explicite (« PAS l'impôt total payé »). RESTE
  (moteur, non-money-critical) : renommer/documenter `totalTaxesPaid` côté `projection.ts:1444` et borner
  `taxLeakage`/`avgEfficiency` (`Math.max(0, …)`, monteCarlo.ts:106/137 — efficacité > 100 % possible avec un compteur
  négatif). ⚠️ touche des seuils de tests MC → re-baseliner prudemment.
- **`[ASSET-FX-DISPLAY]`** ✅ **LIVRÉ 2026-07-14 (PR FX)** — 6 surfaces UI sommaient `quantity × currentPrice` SANS
  conversion de devise (prix stockés en NATIF) → patrimoine SOUS-affiché de ~70 k$ (l'app disait 160 352 $, la vraie
  valeur CAD ≈ 230 k$ — le MCP avait raison, incident « je devrais pas avoir 230k » élucidé). Fix : source unique
  `assetValueCad` + 5 sites convertis (NetWorthByOwnerCard, Investments, Dashboard ×2, HealthIndicator,
  AssetLocationCard) + csvExport documenté natif-par-ligne + test-garde scan `assetFxGuard` (discriminant prouvé).
- **`[MCP-APPLY-DEBT]`** ✅ **LIVRÉ 2026-07-15 (demande Marc « rajouter des dettes avec mcp genre achat de voiture »)** —
  tool `apply_debt` (v0.7.0) : ajoute/met à jour PAR NOM une dette RÉELLE (update PARTIEL — champs $ optionnels en màj,
  requis à l'ajout ; idempotent au retry, jamais de doublon, description avertit « même nom = écrasement »),
  catégorie inférée du nom (auto→Car, études→Student, carte→CreditCard), bornes anti-injection D9 + gardes non-fini
  côté MÉTIER (bypass-Zod couvert, leçon MCP-WHATIF). ⚠️ Sémantique moteur documentée dans la description : dettes
  DÉJÀ CONTRACTÉES seulement (servies dès le mois 0) — achat FUTUR/hypothétique routé vers `simulate_what_if`
  (garde-fou [MCP-WHATIF-DATED-DEBT]). ⚠️ Redéploiement Cloud Run requis.
- **`[MCP-DIRECT-EDIT]`** 🚧 (demande Marc 2026-07-28 « change mes liquidités et tout tout tout avec mcp juste en le
  demandant » + « confirmation » avant chaque écriture) — écritures directes « juste en le demandant », avec
  confirmation à 2 temps (dry-run + `confirm:true`, cf `RunApplyOptions`/`runApply`) :
  - [x] **Lot 1 — `set_cash`** ✅ 2026-07-28 : ajuste le solde de LIQUIDITÉS à une cible. Cash DÉRIVÉ
    (`computeStartingCash`, source unique) → DELTA sur `initialBalances.LIQUIDITE` (visible Réglages → Comptes,
    jamais d'écrasement des transactions), idempotent, borné (0 → 100 M$) + garde non-fini métier. Invariant
    round-trip prouvé (`computeStartingCash(next) === target`). ⚠️ Redéploiement Cloud Run requis pour claude.ai.
  - [x] **Lot 2 — `set_budget_item`** ✅ 2026-07-29 : upsert PAR NOM (casse/accents ignorés), update
    PARTIEL (cible/fréquence/nature/répartition), éditer la cible → `autoTarget:false` (BUDGET-TX-CATEGORIES),
    bornes 0→1 M$ + non-fini, id `cat_<ts>_<rand>`. Confirmation 2 temps. MCP v0.9.0.
  - [x] **Lot 3 — `upsert_savings_goal`** ✅ 2026-07-29 : upsert PAR NOM, update PARTIEL (cible/accumulé/
    échéance `YYYY-MM(-DD)`/icône), défauts ajout (accumulé 0, 💰), id `goal_<ts>_<rand>`. Confirmation 2 temps.
  - [ ] **`[GOAL-DEADLINE-UI]`** 🟡 (S, finding financial-integrity PR #518) — la carte d'un objectif
    existant (Planning.tsx) n'affiche NI n'édite `deadline`, alors que l'échéance pilote un décaissement
    RÉEL dans la projection (retrait cible−accumulé au mois de l'échéance) et que le MCP peut désormais la
    poser : une écriture IA non visible/réversible à l'écran. Afficher l'échéance sur la carte + permettre
    de l'éditer/effacer.
  - [x] **Lots 4-5 — `delete_item`** ✅ 2026-07-29 (ADR docs/decisions.md) : suppression actif/dette/objectif,
    correspondance normalisée EXACTE (ambiguïté → throw, accountType pour un symbole multi-comptes),
    aperçu des effets (courbe passée, NW, décaissement), confirmation 2 temps stricte. « Vente totale » =
    suppression (quantity:0 réfuté : holdingsAt compte les purchases → courbe fausse à vie). Transactions
    DIFFÉRÉES (cash dérivé — chemin sûr = isDuplicate, sémantique à ne pas deviner par l'IA). MCP v0.10.0.
  - Salaire : DÉJÀ couvert par `apply_payslip` (aucun nouveau tool). Immobilier : différé.
- **`[ASSET-CURRENCY-BACKFILL]`** 🔧 (résidu panel FX) — un actif LEGACY sans champ `currency` est traité 1:1 CAD
  (désormais JOURNALISÉ par `assetValueCad`, plus muet) ; le fix propre = backfill de migration (défaut assumé +
  documenté) OU invite UI à préciser la devise. Attendre de VOIR le log apparaître chez un utilisateur réel avant
  de migrer (peut ne concerner personne). Effort S.
- **`[HUB-REFRESH-CRON]`** ✅ **LIVRÉ 2026-07-22** — refresh AUTONOME des prix côté serveur (Marc : « les données
  de finance ai sont pas à jour mais j'ai pas envie d'aller dans l'app »). `mcp/refreshPrices.ts` (`runPriceRefresh` :
  `getWithVersion` → `refreshAssetPrices` en `force:true` via le MÊME moteur que le boot app → `applyPricePatches` →
  `save(next, version)` OCC ; écrit SEULEMENT si un cours a changé ; ne touche QUE `currentPrice`, jamais les données
  saisies ; skip honnête si pas de provider) + route `POST /refresh` (`mcp/http.ts`, activée par `FINANCEAI_REFRESH_SECRET`
  ≥16 car., Bearer temps constant, conflit OCC = `200 {ok:false}` transitoire). Déclencheur GitHub Actions gratuit
  (`.github/workflows/refresh-prices.yml`, 6 h + manuel — Cloud Run scale-to-zero, cron externe le réveille).
  `deploy.sh` monte `financeai-refresh-secret` + `financeai-finnhub-key` (optionnelle, actions) s'ils existent.
  5 tests (`tests/mcp/refreshPrices.test.ts`). ADR `docs/decisions.md`. ⚠️ Marc : secrets Cloud Run + GitHub + redéploiement.
- **`[PRICE-REFRESH-LIVE]`** ✅ **LIVRÉ 2026-07-14 (PR à venir)** — `services/priceRefresh.ts` : `refreshAssetPrices`
  (getQuote séquentiel espacé 2 500 ms ≈ 24/min, sous CoinGecko free ~30/min — jamais de Promise.all) + patches par
  symbole fusionnés sur l'état FRAIS (`applyPricePatches`, anti-course avec un pull Drive/édition). Gardes : prix natif
  only, devise protégée (quote ≠ devise stockée → skip), couverture HONNÊTE (no-quote/invalid-price listés, jamais de
  prix inventé). Câblage : refresh AU BOOT (après hydrateAssets, sauté en mode test) + bouton « Actualiser les cours »
  (Investissements → Détail, horodatage + toast récapitulatif). Champ additif `Asset.priceUpdatedAt` (zéro bump).
- **`[MCP-GET-HOLDINGS]`** ✅ **LIVRÉ 2026-07-15 (Vague 1, MCP v0.7.2)** — tool `get_holdings` (lecture seule) :
  positions individuelles (symbole/nom/qty/prix natif/devise/valeur CAD/compte/rendement) triées, total + ventilation
  par compte, via `assetValueCad` (source unique). Arrondi aligné sur `get_financial_overview` (`round(Σ)`). ⚠️ Redéploiement Cloud Run requis.
- **`[MCP-FRESHNESS-PRECISION]`** ✅ **LIVRÉ 2026-07-15 (Vague 1, MCP v0.7.2)** — `humanAge` affiche heures+minutes
  sous 48 h (« 4 h 40 » ; pile sur l'heure → « 5 h »). Corrige aussi un double-arrondi de l'ancienne version. ⚠️ Redéploiement Cloud Run requis.
- **`[MCP-WRITE-VERSION-TOKEN]`** ✅ **LIVRÉ 2026-07-16 (GO Marc)** — OCC (optimistic concurrency) per-call : `StateVersion`
  (= `updatedAt` du blob) plumbé via `StateStore.getWithVersion() → {state, version}` + `save(next, expectedVersion)`.
  `DriveStateSource.loadRawVersioned()` lit raw+version atomiquement ; `saveState(state, expectedVersion)` REFUSE si la
  version stockée a bougé depuis la lecture de CET appel (ferme le trou de la garde process-wide `lastSeenUpdatedAt` : 2
  tool-calls concurrents partis du même cache — le 2ᵉ clobberait). Additif : les tools de LECTURE gardent `get()` ; seuls
  `_writeHelper` + `applyPayslip` passent le jeton ; fichier local (stdio mono-processus) = pas d'OCC. 4 tests dont
  discriminant prouvé (git-patch : la garde process-wide seule laisse le 2ᵉ save clobber).
- **`[CELI-ASSET-NUDGE]`** ✅ **LIVRÉ 2026-07-15 (Vague 1)** — helper pur `computeCeliNudgeStatus` (détecte virements
  CELI/TFSA sortants ≥ 1000 $ + zéro avoir CELI) + bannière dismissible `CeliAssetNudge` (Investissements, `PrivateAmount`
  pour le mode discret, CTA « Ajouter mes avoirs CELI »). NO-fake-data : montant viré = CONTEXTE, jamais un solde dérivé.
- Note : `moteur-impot-couple-fusionne` audit **REFUTED** — le moteur impose déjà PAR conjoint (`taxDecember.ts:394-396`), aucun bug. (Correction d'une hypothèse antérieure.)
- **`[SYNC-FETCH-TIMEOUT]`** ✅ **LIVRÉ 2026-07-16 (Vague 3)** — `withDriveTimeout` (AbortController, 20 s,
  `DRIVE_FETCH_TIMEOUT_MS`) enveloppe TOUS les appels Google/Drive de `driveAppData.ts` (findSyncFile, read/update/
  create/delete, listAppDataFiles, fetchUserIdentity) → un réseau « dégradé » lève une `DriveError` explicite au lieu
  de PENDRE indéfiniment (la racine du hang, mitigé jusqu'ici seulement par la trappe LoginGate 10 s). ⚠️ **Le délai
  couvre AUSSI la lecture du CORPS** (`res.json()`/`text()` DANS le budget via un handler) — un 1er jet qui ne wrappait
  que jusqu'aux en-têtes re-pendait sur un gros pull dont le corps stalle (finding code-reviewer). `clearTimeout` dans
  `finally`, dégrade proprement si `AbortController` absent. **+ `gateSilentResume` ROUTE désormais une erreur Drive
  post-jeton via `handleError`** (avant : catch unique l'avalait en silence → renvoi muet au login, indiscernable d'un
  1er accès — finding silent-failure) ; symétrie avec `runBootSync`. 5 tests (2 discriminants timeout : en-têtes + corps
  qui stalle ; clearTimeout ; repli userinfo ; gate route l'erreur). ⚠️ **Volet `keepalive:true` REJETÉ (mesure, pas supposition)** : `fetch
  keepalive` ET `navigator.sendBeacon` sont plafonnés à **64 Ko de corps**, or le payload sync réel de Marc (~2000 tx +
  actifs + budgets + config) dépasse largement 64 Ko → `keepalive:true` FERAIT ÉCHOUER les gros push au `pagehide`. La
  fiabilité de `flushPush` au masquage d'onglet reste couverte par timeout + `SyncStatusBanner` (invite à reconnecter sur
  erreur) + push debouncé ; un vrai « push garanti à l'unload » exigerait une delta-sync bornée < 64 Ko (projet séparé, non planifié).
- **`[A11Y-CHECK-CONTRAST-DRIFT]`** ✅ **LIVRÉ 2026-07-16 (Vague 4)** — `scripts/check-contrast.ts` LIT désormais
  les tokens depuis `tailwind.config.js` (source unique) au lieu de valeurs re-codées en dur qui dérivaient (vu :
  `surface #151922`→`#0E1014`, `primary #10b981`→`#e6eaf2`) → fini le « teste des combos qui n'existent plus »
  (protection nulle). Ne teste que les HEX opaques (les `rgba()` translucides exigeraient une composition, hors
  périmètre) ; surfaces exclues de l'ensemble « texte » ; garde anti-scan-vide (bg≥3, text≥8 sinon exit 2). Résultat
  réaligné : 60 combos, 0 non-conforme, 9 large-only (shades `-600`/`ink-500`, usages larges/bordures — OK).
- **`[A11Y-GHOST-BUTTON-PROMINENCE]`** ✅ **LIVRÉ 2026-07-16 (Vague 4)** — variants `ghost`/`outline` de
  `components/ui/Button.tsx` : bordure `white/10`-`/15` (~1,2-1,6:1, quasi invisible) → **`white/40`** (mesuré ~3,8:1 sur
  les 3 surfaces dark/surface/highlight via calcul node de contraste) → WCAG 1.4.11 (contraste non-texte ≥3:1) au niveau
  du design-system → corrige les ~28 usages d'un coup. Classe générée vérifiée (`dist` : `.border-white/40{border-color:#fff6}`).
  Note scope : les `border-white/10` restants sont DÉCORATIFS (cards/dividers/pills/table-rows, hors 1.4.11) ; les cartes/
  champs cliquables custom hors composant Button → `[A11Y-BORDER-PROMINENCE-SWEEP]` ci-dessous.
- **`[A11Y-BORDER-PROMINENCE-SWEEP]`** 🟡 **PARTIEL 2026-07-16 (Vague 4)** — ~15 éléments INTERACTIFS custom (hors composant
  `Button`) réutilisent `border-white/10`-`/15` (~1,2-1,6:1) et échouent WCAG 1.4.11 (bordure = affordance). Traité au cas
  par cas (`white/40` = même valeur mesurée que GHOST-BUTTON, ~3,8:1 sur les 3 surfaces — PAS de bump aveugle).
  - ✅ **Boutons d'action autonomes FAITS** (12 sites) : `Budget.tsx:800` (carte cliquable), `TaxCenter.tsx:277,285`,
    `AiAssistant.tsx:311`, `Investments.tsx:1000,1007`, `Dashboard.tsx:378`, `settings/GoogleDriveSyncCard.tsx:164,171,209`,
    `sync/SyncConflictModal.tsx:179,198`.
  - ⏳ **RESTE (cas de jugement, différés exprès)** : les `<input>`/`<select>` (`Transactions.tsx:452,458,530,732,750,823,847`,
    `Dashboard.tsx:470,472`, `Investments.tsx:1102`) — la bordure interagit avec `focus:border-*`, traitement 1.4.11 distinct ;
    les onglets/toggles à état conditionnel (`RealEstate.tsx:318`, `Transactions.tsx:617,623` inactifs — l'état ACTIF a déjà
    une bordure colorée ≥3:1) ; les labels/dropzones (`settings/PayslipUploadCard.tsx:116,137`, `import/ImportBankStatement.tsx:110`,
    `border-dashed` + hover). À faire dans une passe dédiée par type (input vs toggle vs dropzone). Décoratifs (cards/dividers/pills/tr) = HORS périmètre.
- **`[MCP-TAX-FHSA-BALANCE]`** 🔧 (pré-existant, trouvé par le panel 2026-07-14) — `getTaxSituation.tool.ts` passe `u.fhsaBalance`
  (un SOLDE) comme cotisation CELIAPP ANNUELLE à `calculateFiscalReport` → sur-déduit (sous-estime l'impôt) dès que le solde
  dépasse la cotisation de l'année. Antérieur au fix per-conjoint (l'ancien code sommait pareil). Fix : champ de cotisation
  annuelle dédié ou clamp au plafond CELIAPP annuel. + Limite documentée : un conjoint SANS salaire brut mais avec
  `rrspContributed > 0` n'a aucun bénéfice fiscal (correct — la déduction ne réduit que le revenu de SON titulaire ; l'ancien
  code l'appliquait à tort au revenu fusionné de l'autre).

## Convention (cochage par Claude au merge)
- Chaque item Claude-faisable porte un **`[ID]`** entre crochets. **Claude coche lui-même**
  l'item au moment du merge de la PR qui le livre (l'Action `backlog-autocheck` a été retirée —
  choix Marc, 2026-06-09).
- Claude édite ce fichier pour **cocher** (au merge) et **ajouter** des items (découvertes).
  Les blocages humains vont dans `A_FAIRE_MOI.md`.
- Légende : 🔧 Claude · 🧭 décision Marc requise · 👤 action humaine (Marc) · ⏳ gros chantier.
- Les **tests manuels** (section 👤 ci-dessous) n'ont PAS d'`[ID]` (à Marc).

---

## 🧭 Décisions & vision Marc — 2026-06-19 (batch de réponses)
> Marc a tranché un lot d'items en attente + livré sa vision Futur/Budget. Source de vérité ; les items
> individuels ci-dessous pointent ici. Quick-wins/closures appliqués cette session ; gros chantiers = plan-first.
>
> **➡️ FEUILLE DE ROUTE VALIDÉE & exécutée en autonomie : [`docs/PLAN_CHANTIERS_2026-06-19.md`](PLAN_CHANTIERS_2026-06-19.md)**
> (4 agents d'exploration → plans `fichier:ligne`, VALIDÉS par Marc 2026-06-19). Décisions verrouillées : **Q1 multi-courbes
> OUI** ; **FA-6** = fédéral **14 %** (≤200 $) / titres **inclusion 0 % sur tout le don** / QC **24 % fixe** ; couple = attribution
> **auto par défaut** (type de poste), éditable ; ordre = gains rapides UI → PH4 → money-critical. ★ **Surprise** : le verrouillage +
> persistance de courbe (Q1-A) est DÉJÀ construit à ~95 % (`lockedProjectionStore.ts` + store) → ne PAS reconstruire.

### Tranché (closures + go)
| Item | Décision Marc | Suite |
|---|---|---|
| `A11Y-BADGE-PROMINENCE` | **Option B — bordure renforcée** (fond inchangé, bordure ~0,55) | 🔧 PR à venir (appliquer aux 6 variants) |
| `LABEL-NW-SUCCESSORAL` | Reco acceptée : **libellés distincts** (« Patrimoine successoral, avec rentes » vs « Patrimoine projeté ») + **infobulle** expliquant l'écart | ✅ LIVRÉ (R1, 2026-06-19 — libellé + tooltip sur 5 sites, pas de moteur) |
| `FA-6` (dons charitables) | **(a) Modéliser proprement** (paliers fed+QC + inclusion 0 % titres) | 🔧 effort M, sourcé (voir item FA-6) |
| `PH3-c-bis` (`User.industry`) | **Supprimer** | ⚠️ migration schéma Zustand (prudence) |
| `ENG-TAX-NS` | **Garder l'alias** | ✅ clos, rien à coder |
| `H1` (chiffrement passphrase) | **Non** | ✅ clos, décliné |
| `B-AUDIT-5` (SRG dans clawback PSV) | Corriger | ✅ **DÉJÀ FAIT** (vérifié 2026-06-19) : `projection.ts:918/921/929` excluent déjà le SRG (`incomeRetirement − incomeRetirementGis`). Item périmé → clos. PAS de fake fix. |
| `ITEM-2C`, `Tables fiscales` | **Planifier** | plans ci-dessous |
| `NAV-CONSOLIDATE` | « on en parle après » | ⏸️ différé |

### ★ Q1 — Onglet Futur (vision détaillée, plan-first par sous-chantier)
- **Annotations sur la courbe** : âge de retraite ✅ · **chaque événement de vie** ✅ · **FIRE atteint** ✅.
  PAS : épuisement de compte ❌, ni RRQ/PSV/CELIAPP ❌ (déjà lisibles sur la courbe). **Clic sur une icône →
  description brève** de l'événement.
- **Infobulle** : tout voir (actuellement coupée + impossible à scroller car elle suit la souris) → la **figer/
  rendre scrollable** (ne plus suivre le curseur quand on veut lire). ✅ **LIVRÉ (R3, 2026-06-22)** : clic = FIGE
  l'infobulle (portail `position:fixed`, ancrée, scrollable, interactive) ; survol = suit la souris
  (`pointer-events:none`) ; Échap / clic-dehors libère ; coexistence avec la modale via bouton « Détail complet ».
  Hook `useChartTooltipPosition` (machine d'état) + utils purs `resolvePointFromClick`/`clampTooltipPosition`.
  - **Découvertes R3 (panel a11y, 2026-06-22) → follow-ups** :
    - `A11Y-CHART-KEYBOARD` — le graphe Futur est clic-only (conteneur `role="img"` `tabIndex=-1`, pastilles `tabIndex=-1`) :
      figer/ouvrir le détail au CLAVIER n'est pas possible (limite PRÉEXISTANTE, pas une régression R3 ; mitigée par
      l'alternative sr-only `ChartDataTable`). Chantier a11y dédié (clavier sur graphes Recharts).
    - `FIX-INK600-TOKEN` — ✅ **FAIT (2026-06-22)** : `text-ink-600` (inexistant, `ink` s'arrête à 500) remplacé par `ink-400`
      sur les **9 usages / 7 fichiers** (Dashboard, ActionPlanDrilldown ×2, FutureDetailModal ×2, ProjectionTooltip, NextBestAction,
      ZoomableTimeChart, ZoomContainer). `ink-400` mesuré AA normal (`check-contrast` : 5,84 surface / 5,21 highlight, ≥ 4,5). Pur CSS.
- **Densité au zoom (level-of-detail)** : dézoomé = peu d'icônes ; en zoomant, de plus en plus jusqu'à toutes.
  ✅ **FAIT (R4-P4, 2026-06-22)** : cap fixe baissé 40/24 → **24/16** (`MAX_LIFE_ICONS`/`MAX_FLOW_ICONS`). Le LOD « zoom = toutes »
  était déjà là (fenêtre zoomée < cap). ⚠️ La formule `(visMax−visMin)/6` du plan était à l'envers (rejetée) → cap fixe plus bas.
  **R4-P1 (boot-restore au mount)** : ✅ déjà en place (`App.tsx:72-96`, PH2-d), vérifié — aucun patch.
- **`[FUTURE-ICONS-EXHAUSTIVE]`** 🔵 (brief Marc 2026-07-22, plan-first) — **une icône pour LITTÉRALEMENT TOUT**
  sur la courbe Futur : chaque impôt (règlement/acompte annuel), chaque achat immobilier, **chaque enfant**,
  **transferts inter-comptes** (retrait d'un compte pour mettre dans un autre — nouvelle icône), FIRE atteint,
  retraite, tout autre événement. ⚠️ **RÉVISE le périmètre antérieur** de ce Q1 (qui disait « PAS : impôts,
  RRQ/PSV/CELIAPP ») → Marc veut désormais TOUT visible. Couplé au **LOD par PRIORITÉ** (pas juste un cap fixe
  R4-P4) : dézoomé = seulement les icônes IMPORTANTES ; en zoomant, de plus en plus d'icônes moins importantes
  apparaissent (rangs d'importance par type d'événement, révélés progressivement selon le niveau de zoom).
  Travail probable : (1) le moteur émet-il déjà un `lifeEvent` pour chaque type (impôts annuels, transferts
  inter-comptes) ? sinon les AJOUTER à `chartData.lifeEvents` (source unique — ne PAS recalculer côté UI, cf R2-FIRE) ;
  (2) mapper chaque type d'événement à un rang d'importance + une icône ; (3) LOD = filtrer par rang selon le zoom
  (remplace/complète le cap fixe `MAX_LIFE_ICONS`/`MAX_FLOW_ICONS`). Plan-first (design du barème de priorité + inventaire
  exhaustif des types d'événements émis par le moteur) avant de coder.
- **`[SUBS-TAB]` Abonnements : onglet dédié + retrait + détection auto des nouveaux** 🔵 (brief Marc 2026-07-22) —
  Marc veut : (a) pouvoir RETIRER un abonnement qu'il n'a plus, (b) que ça s'ACTUALISE selon ses transactions pour
  voir les NOUVEAUX abonnements. ⚠️ **Vérifier l'existant AVANT de coder** (leçon R2-FIRE/PM-STALE-BACKLOG) : une
  bonne partie existe déjà dans `components/Planning.tsx` (sous-onglet de `BudgetWorkspace`) — `detectSubscriptionsAI`
  (`services/claude.ts`), `utils/subscriptions.ts` (`addSubscription`/`removeSubscription`/`mergeSubscriptions`/
  `subscriptionDueLabel`…), champ store `subscriptions`. Le vrai gap probable = (1) le SURFACER en onglet DÉDIÉ (vs
  sous-onglet Budget), (2) un flux clair « nouveaux abonnements détectés depuis tes transactions → confirmer/ignorer »,
  (3) retrait facile d'un abo obsolète. Plan-first : auditer Planning.tsx d'abord, puis décider ce qui manque vraiment.
- **★ VERROUILLAGE + PERSISTANCE de la courbe** (clé de voûte Phase 2) : une fois leviers + courbe choisis, elle
  **reste affichée** en changeant de page ET **après déconnexion/reconnexion**, jusqu'à ce que Marc la change ou
  **compare** des courbes. → persistance (store + IndexedDB), pas un recalcul volatil.

### PH4 — par onglet (vision, plan-first)
- **Budget** : **parité catégories** (chaque catégorie de Transactions ↔ un poste Budget) ✅ **FAIT (PH4-A, 2026-06-22)** :
  règle unique `utils/budget.ts matchTransactionToCategory` (réels + tendances), section UI « Parité » (orphelins + postes jamais
  rapprochés). `totalSpent` préserve le « Total dépensé ». · meilleure répartition **envie/besoin** ✅ **FAIT (PH4-B, 2026-06-22)** :
  donut **réel** (dépenses rapprochées + épargne réelle) + table comparative **Réel · Cible · Idéal 50/30/20** (`computeGoldenSplit`,
  écart coloré ±2 pts). · **objectif d'épargne** + vue **réel vs objectif** ✅ **FAIT (PH4-C, 2026-06-22)** : `SavingsGoal.linkedBudgetCategoryName?`
  (lien par NOM vers une catégorie budget) → « Accumulé / cible / **Versé ce mois** » (`monthlyActualsMap`, dépense réelle du mois) ;
  lien éditable par objectif ; lien orphelin (catégorie renommée) → badge « ⚠ Lien invalide ». Migration : aucun code (champ optionnel additif).
  - [ ] **[PH4C-SAVINGS-NATURE]** 🔧 LOW — lier un objectif à une catégorie de **nature « Épargne »** affiche « Versé ce mois : 0 » en
    permanence (l'épargne est alimentée par VIREMENTS, exclus d'`actualsMap` comme dans la parité budget). Pistes : filtrer le dropdown
    aux catégories non-épargne, OU inclure les virements rapprochés pour ces postes. Découvert par `financial-integrity` (PH4-C). Pas un bug $.
  - [x] **[PH4D-WEIGHTS-STORE]** ✅ LOW (2026-06-22) — poids de l'`HealthIndicator` migrés vers le **store Zustand** :
    `AppState.healthWeights?` (additif, pas de v7→v8) + `utils/healthWeights.ts` (`DEFAULT_HEALTH_WEIGHTS` + `loadLegacyHealthWeights`
    qui lit l'ancienne clé à l'init du store ; le `merge` Zustand défaut garde la valeur initiale → poids user NON perdus). HealthIndicator
    lit/écrit le store (`setAppState`). 7 tests migration + tests composant adaptés. Panel APPROVE (logError sur corruption, `@deprecated` sur la clé).
  - [x] **[PH4D-BUDGET-RATIOS]** ✅ MEDIUM (2026-06-22) — 2 ratios budgétaires ajoutés à l'`HealthIndicator` : **adhérence au budget**
    (`computeBudgetParityScore`, dépenses réelles vs cibles du mois précédent, hors postes épargne) + **poids des abonnements**
    (`computeSubscriptionLoadScore`, coût mensuel des abos épinglés / revenu net, plafond 15 %). `HealthWeights` 4→6 (rétrocompat via
    `normalizeHealthWeights`). Correction de fond : `totalScore` exclut les métriques sans donnée (un 0 par absence ne tire plus le score).
    Revue adversariale (workflow, 5 dimensions) → 6 findings intégrés (épargne exclue, fréquence `monthlyExpenses`, masquage orphelins, a11y `—`).
  - [x] **[A11Y-HEALTH-RAW-INK500]** ✅ **FAIT (2026-07-07)** — `HealthIndicator.tsx` : **3** occurrences `text-ink-500`
    migrées vers `text-ink-400` (le `m.raw` de chaque métrique l.329 + les 2 voisines de même classe échouant AA trouvées à la
    lecture : `/ 100` l.306 et le poids `%` l.327). `check-contrast` confirme ink-400 = 5,21-6,42:1 (AA ✅) vs ink-500 = 3,41-4,20:1 (❌).
    Panel a11y-auditor + code-reviewer APPROVE. Pur CSS, zéro logique.
  - [x] **[PH4E-OWNER-EDIT]** ✅ LOW (2026-06-22) — **colonne « Conjoint »** dans le tableau Transactions (mode couple) : un `<select>`
    par ligne (Auto / prénom conjoint 0 / prénom conjoint 1) qui OVERRIDE `Transaction.ownerId` (`updateOwner`, `undefined` = AUTO).
    Table desktop (colonne conditionnelle) + carte mobile (ligne « Conjoint : »). `Transactions.tsx` lit `config` du store ; l'override
    alimente `resolveTransactionOwner`/`computeActualByOwner` (#398, déjà prouvé). 3 tests (solo absente, couple présente, change écrit/efface).
    **PH4-E complet.** Reste-note (`computeActualByOwner` garde `amount<0` interne) → non requis : seul site d'appel filtre déjà.
  - `BUDGET-KEY-WARNING` (découverte PH4-A, **pré-existant, LOW, non-fatal**) : la page Budget émet des warnings React « two children
    with the same key, `value` » (~32 en session, clé littérale `value`). ⚠️ **Hypothèse `nameKey` RÉFUTÉE** (testée 2026-06-23) :
    ajouter `nameKey="name"` aux `<Pie dataKey="value">` ne change RIEN — Recharts keye en interne sur le `dataKey`, pas le label.
    Sources « value » à l'écran : les 2 donuts (`<Pie dataKey="value">`) au montage + `<Bar dataKey="value">` (`BudgetGroupTable:254`,
    rendu seulement à l'expansion d'un poste). Vraie correction = inconnue (quirk interne Recharts sur la légende du Pie) → demande une
    investigation dédiée (essayer un `id` unique par `<Pie>`, ou supprimer/customiser `<Legend>`). Warning React dev, pas une erreur runtime.
  - [x] **[PLANNING-ANNUAL-SUB-12X]** ✅ **FAIT (2026-06-26)** — voir l.709 détail. Doublon fermé.
    « Fixe Mensuel »/« Coût Annuel ». Identique avant/après PH4-F (financial-integrity : pas une régression). Fix : utiliser
    `yearlyCost` pour l'annuel et normaliser le mensuel par `yearlyCost/12` plutôt que `averageAmount` brut.
  - `BUDGET-DONUT-SVG-ARIA` ✅ **FAIT (2026-06-23)** : les 2 donuts (théo + réel) enveloppent désormais `<ResponsiveContainer>`
    dans `<div aria-hidden="true">` → le `<svg>` Recharts n'est plus traversable par les SR (le nom accessible reste sur le
    `div role="img"`, les données dans le `ChartDataTable` sr-only). Contrastes du bloc PH4-B tous MESURÉS PASS (a11y-auditor).
  - `BUDGET-NATURE-FREEFORM` ✅ **FAIT (2026-06-23)** : les 56 items de fixtures (testBudget + 6 personas) avaient des natures
    LIBRES ('Logement', 'Alimentation', 'Épargne' accentué…) violant l'union typée → tout tombait dans « Envie » + CELI/REER
    (`'Épargne'`≠`'Epargne'`) comptaient comme DÉPENSES (groupement, `coupleAnalysis`, ET les dépenses envoyées à l'IA/Dashboard/
    NextBestAction qui testent `=== 'Epargne'` exact). Normalisés vers la classe 50/30/20 (`name` garde le détail). Panel
    financial-integrity + code-reviewer = CORRECTION confirmée, 0 régression (2285 tests verts). Donuts 50/30/20 montrent enfin
    Besoins ≠ 0 (Léa : 37 % théo / 51 % réel). Vérifié au preview.
  - `HEALTH-SAVINGS-RATE-DIVERGENCE` (découverte panel BUDGET-NATURE-FREEFORM, **pré-existant, à trancher**) :
    `components/dashboard/HealthIndicator.tsx:93` somme TOUS les postes (épargne incluse) dans `monthlyExpenses` → le **taux d'épargne**
    est sous-estimé, alors que `portfolio.computeMonthlyBudgetAggregates`, `useDerivedFinancials`, `NextBestAction` EXCLUENT
    `nature==='Epargne'`. Même divergence « 2 calculs sur la même donnée la traitent différemment » que la leçon PH4D-BUDGET-RATIOS.
    Fix = exclure l'épargne du `monthlyExpenses` du HealthIndicator (money-display → panel financial-integrity).
- **Santé financière** retravaillée · **mode couple** plus concret · **détail de ce que CHAQUE conjoint sort**
  comme argent.
- **Abonnements** : les voir (peut-être un onglet dédié avec les **dates** d'abonnement).
- **Personas de test** : tous retravaillés pour **marcher sur TOUTES les pages** (tous les critères cochés).
  ✅ **FAIT (R6, 2026-06-22)** : `isActive:true` sur les childGoals (coupleConfort/autonomeMono) + `setupOptOut` par persona
  (6 personas) + micro-actif CELI (lea/coupleDettes). Garde-fou `tests/components/setup/personaGates.test.ts` (7 personas ×
  pages data, source unique `PAGE_SETUP`+`REQUIREMENTS`). Actions/Assistant restent gated = clé API (par design).
  - `PERSONA-ASSET-PERF` (découverte R6, **pré-existant, hors scope**) : les actifs de TOUS les personas omettent
    `performance`/`currency` (le type `Asset` les exige, mais `TEST_ASSETS` + les inline trichent via `as unknown as Asset[]`)
    → `AiAssistant.tsx:83` rend `+undefined%` + tri NaN en mode test AVEC clé API. Fix propre = garder `(a.performance ?? 0)`
    côté AiAssistant et/ou compléter les actifs des personas. (Mes 2 micro-actifs R6 sont déjà complets.)

### Plan — `ITEM-2C` (gates de timing par conjoint, money-critical)
- **Problème** : FERR 72 / reset REER 71 / bonus PSV 75+ sont bloqués par un pool REER MÉNAGE + un âge principal
  unique (`taxJanuary.ts:173` `ctx.age>=72`, `ctx.age`=`users[0].age` projection.ts:177) → timing per-conjoint impossible.
  ⚙️ **Décisions Marc (2026-06-25)** : cadence phase-par-phase (OK entre chaque) ; clé de répartition REER par conjoint =
  `rrspContributed` historique [(a)] ; re-baselining golden en Phase 2 = OK (justifié vs ARC + discriminant).
- **Phase 0** ✅ **FAIT (2026-06-25)** : `tests/services/projection.item2c.golden.test.ts` — golden de caractérisation
  (5 scénarios : couple 70/64, 64/70, 70/70, solo 70, **76/64 PSV-bonus**) pinnant FERR + nw + tax. Ancres zéro-régression
  (equal/solo) + **signatures du bug NON-VACANTES** (`(70/64)≡(70/70)` ; `(64/70)` ferr=mois 96 — casseront au fix Phase 2).
  Panel projection-validator + code-reviewer ✅. ZÉRO changement moteur. ⚠️ Bonus PSV 75+ = MÊME bug structurel (borné).
- **Phase 1+2 FERR** ✅ **FAIT (2026-06-25, choix Marc « option 3 » = plomberie+flip 1 PR)** : `taxJanuary.ts` boucle sur
  `reerByUser` + âge par conjoint (chaque conjoint de 72+ convertit SA part au facteur RRIF de SON âge) ; `projection.ts`
  débite la part FERR de chaque conjoint dans le registre (qui passe de SHADOW à PILOTE). Défaut additif (âges égaux ⇒
  Σ=`reer×rate`, ancres golden equal/solo INCHANGÉES). Golden age-gap re-basés SCIEMMENT + preuves-de-fix (discriminant
  git-stash : 5/7 échouent sur l'ancien code). ⚠️ **Bug CRITIQUE trouvé au panel + corrigé** : flux fiscal FANTÔME au DÉCÈS
  (la part du défunt FERR-convertissait comme un mort de 100 ans → +63 k$ sur le survivant) → roulement REER conjugal
  `reerByUser=[Σ,0]` au `survivorMode`. Panel financial-integrity + projection-validator + silent-failure + code-reviewer ✅.
  Repli `birthYear` pour le conjoint sans `age` + 2 tests unitaires per-conjoint. Conservation 20/20.
- **Sous-phase PSV/RRQ per-conjoint** ✅ **FAIT (2026-06-25, plan-first OK Marc)** : `rrqMonthly`/`psvMonthly` (`retirementIncome.ts`)
  passés en SOMME per-conjoint — le DÉPART RRQ/PSV (`age_i >= startAge`) ET le bonus PSV 75+ sont évalués à l'âge de CHAQUE conjoint,
  sur SA part (`base/N × poids_i`). Modèle d'âge RELATIF `ctx.age + (âgeDépart_i − âgeDépart_0)` (symétrique âges égaux, golden inchangé,
  10 tests `retirementIncome` préservés — cf leçon CLAUDE.md). Mode SURVIVANT = modèle familial INCHANGÉ (per-conjoint au décès =
  raffinement à part) → zéro impact FISC-SURVIVOR. Golden : `couplePsvBonus` (76/64, bonus sur user1 seul) + `couplePsvStartGap` (66/63,
  PSV de user2 à SES 65) re-basés + preuve-de-fix `(66/63)≠(66/66)`. Discriminant git-stash (4/9). Conservation 20/20.
  **Panel 4 agents → 3 fixes intégrés** : (a) SRG gaté sur `psvMonthly > 0` (au lieu de l'âge user1) — un couple à écart d'âge où
  l'AÎNÉ touche la PSV mais user0 < 65 avait à tort un SRG nul (bug $ réel exposé par le per-conjoint) ; (b) repli `ctx.age` pour un
  conjoint sans age/birthYear (évite d'amputer sa rente en silence) ; (c) `returnProfile` PIN re-piné (−476 $ légitime, couple 35/33).
- **RESTE — reset REER 71 per-conjoint** : `rrspRoomDelta`/`rrspRoomReset` (`taxJanuary.ts`) restent sur l'âge user1 (impact $ ~nul
  pour les retraités sans cotisation). À traiter si besoin (faible priorité). + per-conjoint PSV/RRQ AU DÉCÈS (raffinement du modèle survivant).

### Plan — Tables fiscales « montant pour personne vivant seule » (QC TP-1.G)
- **Problème** : le montant pour personne vivant seule (crédit QC) est absent du code ET de `FISCAL_REFERENCE`.
- **Phase 0** : transcrire la grille TP-1.G **datée + sourcée** dans `FISCAL_REFERENCE.md` (jamais de chiffre deviné).
- **Phase 1** : appliquer le crédit aux ménages **1 adulte** (et la majoration applicable) dans `calculateFiscalReport` ;
  test discriminant (un single 65+ bas revenu voit le crédit) ; panel fiscal. Effort S/M une fois la grille fournie.

---

## 🎛️ Audit UX 2026-06-17 (VALIDÉ — voir `docs/AUDIT_UX_2026-06-17.md`)
> Audit externe (rendu headless, 7 personas, 14 pages) **validé claim par claim** par panel de 5 agents
> (preuve `fichier:ligne`). Robustesse app = 0 plantage. Cœur money-critical = sain (les 2 « bugs de chiffres »
> sont un libellé + un persona insoutenable, pas des erreurs de calcul). Vrais chantiers = formatage $,
> archi de l'info, mode discret. ⚠️ Verdict en tête de chaque item. 🧭 = décision Marc.

### 🔴 Présentation money-critical (valeurs justes, mais trompeuses)
- [x] **[FMT-CURRENCY-UNIFY]** ✅ MEDIUM (2026-06-17) — montants `$` formatés à la main (floats en-US, sans
  séparateur, décimales variables) routés par `formatCAD`/`formatSigned`/`formatCompactCAD`. **Part 1** (#338) :
  `DebtManager` + `BudgetGroupTable` + garde test discriminante (`/\d{4,}\$/` rejeté, prouvé via `git stash`).
  **Part 2** : `TaxCenter`, `Budget`, `Retirement`, `LifeEvents`, `Investments`, `Planning`, `DividendPanel`,
  `Transactions`, `Travel` (9 fichiers, ~50 sites ; signés via `formatSigned`, axes/KPI via `formatCompactCAD`).
  Laissés à dessein : `AiAssistant` (≈10 `toLocaleString` dans les PROMPTS LLM, pas de l'affichage), dates,
  export CSV, inputs éditables. Reste 0 `toLocaleString` monétaire hors prompt. Convention figée dans CLAUDE.md
  (« formatCAD = seul formateur $ »).
- [x] **[LABEL-NW-SUCCESSORAL]** ✅ MEDIUM (R1, 2026-06-19) — l'écart « projection Budget ≠ reste » est un **libellé**,
  pas un calcul : Budget affiche `estateNetWorth` (patrimoine **successoral**, net d'impôt au décès + NPV rentes,
  `estateCalculation.ts:195`) vs `chartData[dernier].NetWorth` ailleurs. Source unique RESPECTÉE. 🧭 Décision :
  soit Budget affiche aussi le NW fin-horizon (parité stricte), soit clarifier « successoral » vs « fin
  d'horizon » partout (libellés + infobulle). PAS un correctif moteur. ≠ `[NW-PARITY-INVARIANT]`.
  ✅ RÉSOLU (R1, décision Marc = clarifier) : « Patrimoine successoral, avec rentes » + tooltip (prop `tooltip` ajouté à `KPIStat`)
  sur 5 sites (FutureProjection KPI, Budget, StressTestPanel, GoalSeekerCard `title`, prompt AiAssistant). Fallback conditionné
  (libellé neutre « Patrimoine projeté » si `estateNetWorth`=0, sinon « avec rentes » mentirait). a11y durcie (`Tooltip` : `aria-describedby` sur l'enfant + Échap).
- [x] **[PROJ-INSOLVENCY-BADGE]** ✅ MEDIUM (PR #358, 2026-06-18) — onglet Futur : badge danger « Plan insoutenable —
  capital épuisé vers X ans » dès que le patrimoine net projeté franchit 0 (vs −1,88 M$ nu anxiogène). Helper pur
  `utils/insolvency.ts` `findInsolvencyPoint(chartData)` (1er point `NetWorth<0`, ignore le passé/NaN ; 7 tests) +
  `<Badge>` dans le `<PageHeader>` (wrap `role="status"` pour l'annonce SR). Métrique ≠ Retraite (`TotalCapital≤0`).
  Âge affiché en clair (cohérence Retraite, ≠ montant → non masqué en mode discret — finding code-reviewer). Plan
  solvable → aucun badge (empty state honnête). Panel code-reviewer + a11y-auditor.
- [x] **[A11Y-BADGE-PROMINENCE]** ✅ LOW (PR #375, 2026-06-19) — **Option B (décision Marc)** : bordure RENFORCÉE
  (fond `*-bg` inchangé à 0,10). `components/ui/Badge.tsx` : `border-*-border` (accent à 0,30) → `border-*-400/55`
  (accent saturé à 0,55) sur les 6 variants ; `border-white/10`→`/25` (neutral), `border-primary/30`→`/55` (primary).
  Badge-only : on ne touche PAS le token partagé `*-border` (utilisé par ProjectionControls/IntegrationsSection).
  Contraste badge↔page remonté (WCAG 1.4.11) ; texte déjà AA inchangé. Classes générées vérifiées (build propre).

### 🟠 Architecture de l'information
- [ ] **[IA-NAV-CONSOLIDATE]** 🧭 ⏳ ✅VÉRIDIQUE — **14 destinations** (Argent 3 · Plan 4 · Objectifs 3 · Outils 3
  + Config, `Layout.tsx:67-106`) ; recouvrements (Futur/Retraite/Prochaine-action = même projection) ; 2-4
  coquilles par persona. Cible : ~6 dest. (Accueil · Budget · Patrimoine · Futur · Impôts&Docs · Réglages).
  Gros chantier nav (routes, deep-links, tests) → **plan-first + OK Marc**.
- [x] **[IA-DEDUP-COMPLETUDE]** ✅ LOW (2026-06-17) — `<SetupHub />` retiré de `Profile.tsx` ; reste UNIQUEMENT
  dans Configuration (`Settings.tsx:166`). Profil = uniquement les champs à remplir (réversible : 1 import + 1 balise).
- [x] **[IA-ASSETLOC-PERSIST]** ✅ LOW (2026-06-17) — ⚠️ **finding RÉVISÉ après lecture du code** : l'éditeur
  de holdings (`AssetLocationCard`) n'est PAS un éditeur de portefeuille mais un **bac-à-sable what-if** (titre
  « Optimizer », bouton « ↺ Depuis portefeuille », recommandations live) → l'état local non persisté est VOULU.
  Le « fix read-only/persister » aurait CASSÉ l'outil. Vrai risque = CLARTÉ → note « Simulation : ne modifie pas
  ton portefeuille réel, édite-le dans Investissements ». (Discipline : vérifier AVANT de coder un « fix ».)
- [x] **[UI-SCORES-UNIFY]** ✅ MEDIUM (2026-06-17, choix Marc) — collision « deux Santé /100 » résolue :
  `HealthIndicator` « Santé financière /100 » (Accueil, agrège 4 ratios) = LE score global ; le badge
  Investissements « Santé /100 » (qui mesurait la diversification) renommé **« Diversification /100 »**
  (variable `healthScore`→`diversificationScore` + `title` « sous-mesure… le score global est sur l'Accueil »).
  `Efficacité fiscale /100` (AssetLocation) et `Complétude %` (SetupHub) sont déjà des sous-mesures sur des
  axes distincts → laissées. Pas de changement de formule.
- [ ] **[UI-TABS-RICH]** 🔧 ◑PARTIEL MEDIUM — généraliser le pattern sous-onglets (déjà sur Investissements ET
  Configuration) à **Retraite** (4 outils empilés `Retirement:199-230`) et **Profil** (long scroll). Plan-first.

### 🔒 Vie privée & sécurité
- [~] **[PRIV-DISCRET-DOM]** 🔧 ✅VRAI MEDIUM — **KEYSTONE LIVRÉ (2026-06-17, choix Marc = •••)** : les primitives
  `PrivateAmount` + `PrivateBlock` (+ `KPIStat`) MASQUENT désormais la valeur par « ••• » → la vraie valeur n'est
  **plus dans le DOM** en mode discret (fin de la fuite copier-coller/inspecteur/SR). **Survol-révèle RETIRÉ**
  (`.privacy-blur:hover` supprimé de `Layout.tsx`). **RESTE** = `[A11Y-D6-SR-2]` ph.3 : migrer les ~69 spots BRUTS
  `privacy-blur` restants → `PrivateAmount` (ils floutent encore, mais SANS survol-révèle) pour que TOUTE valeur
  masquée sorte du DOM. Les graphes (axes/tooltips Recharts) floutent encore (à traiter avec `[A11Y-CHARTS]`).
- [x] **[SEC-CSP-HEADER]** ✅ LOW (2026-06-17) — `frame-ancestors` retiré du `<meta>` CSP (`index.html`) :
  ignoré en meta par spec → ne servait qu'à émettre un warning console. Protection anti-clickjacking intacte
  via `vercel.json` (CSP HTTP `frame-ancestors 'none'` + `X-Frame-Options: DENY`, vérifié). Pas une faille.

### 🟡 Polish UI / onboarding / viz
- [ ] **[IA-NAV-LABELS]** 🔧 ✅VÉRIDIQUE MEDIUM — sidebar `w-16` par défaut, libellés `opacity-0`
  (`Layout.tsx:343`) ; icônes cryptiques (éclair/boussole/palmier). Un `title` existe mais labels invisibles
  par défaut → rendre les libellés visibles par défaut (ou rail plus large).
- [x] **[FMT-CASING-ACCOUNTTYPE]** ✅ **FERMÉ PÉRIMÉ (workflow backlog-verify 2026-06-26)** — re-confirme l'analyse #351 ci-dessous : bug THÉORIQUE (union stricte majuscules, tsc garantit la casse), 3 classifieurs distincts ≠ duplication → helper = anti-YAGNI. Historique conservé :
  casse incohérente `CRYPTO`(enum)
  /`Crypto`(clé chart), `NON-ENREG`/`NonReg`, mappée à la main (`Dashboard.tsx:290-291`) = **bug latent**.
  Une seule fonction `accountTypeToChartKey()`. (dedup CELI/REER déjà corrigé — `new Set`.) ⚠️ **Analyse
  2026-06-17** : le pattern `=== 'CRYPTO'`/`'NON-ENREG'` vit dans 3 fichiers (`Dashboard` chart-keys,
  `TaxCenter` + `AssetLocationCard` = traitement FISCAL, pas le même mapping) → extraction = refactor plus
  large que « LOW » (constante d'enum partagée + helper). À regrouper avec `DETTE-UI-PRIMITIVES`/un nettoyage
  enum dédié, pas en quick-win. ⚠️ **Vérif 2026-06-18 (PR #351) : le bug de CASSE est en fait THÉORIQUE** —
  `accountType: RegisteredAccountType` est une UNION STRICTE (`'CELI'|'CELIAPP'|'REER'|'NON-ENREG'|'CRYPTO'|'REEE'|
  'MARGE'|'AUTRE'`, tout en majuscules) → tsc garantit la casse, aucun `CRYPTO`/`Crypto` runtime possible. Et les
  3 sites sont des CLASSIFIEURS DISTINCTS (Dashboard keyToAccount, TaxCenter filtre non-enreg, AssetLocationCard
  3-buckets), pas une duplication réelle → un helper = abstraction spéculative (anti-YAGNI). **Déclassé.**
- [x] **[UI-TX-CLEANUP]** ✅ LOW (2026-06-17) — colonne **AUTO** auto-documentée : en-tête avec `title`
  explicite (code couleur vert ≥90 % / jaune ≥70 % / rouge <70 %) + glyphe `ⓘ` visible signalant l'info ;
  les pastilles gardent `title`/`aria-label` par ligne. Colonne TYPE = artefact data (laissée, non prioritaire).
- [x] **[GATE-CTA-CONTRAST]** ✅ LOW (2026-06-17) — MESURÉ : le TEXTE du CTA était déjà ~12:1 (description « gris
  foncé » de l'audit inexacte), MAIS le FOND `bg-primary/15` (#282B2F) vs page `bg-dark` (#07090D) ≈ 1,3:1 → le
  bouton ne RESSORTAIT pas (CTA fantôme). Fix on-brand : CTA **solide** `bg-primary text-dark` (prominent, ~14:1)
  + `focus-ring` ajouté (indicateur de focus manquant). Pas de vert introduit (cohérence palette).

### ✗ Faux (validés FAUX — impression seule, effort minimal / rien à coder)
- [ ] **[ONB-OVERLAY-SEQ]** 🔧 ✗FAUX→perception LOW — PAS 3 overlays simultanés (onboarding plein écran
  exclusif ; backup exige `hasData`). Mais tour (700 ms post-onboarding) + ConsentBanner **peuvent** coexister
  → option : ne pas auto-lancer le tour (cf `[ONB-TOUR-OPTIN]`) ou retarder le bandeau de consentement.
- [ ] **[ONB-TOUR-OPTIN]** 🔧 ✗FAUX→perception LOW — le tour 15 étapes se lance **après** l'onboarding (pas au
  1er écran ; bouton Passer présent). Perception : auto-lancement non sollicité → le rendre opt-in (bouton
  « Visite guidée »). Lié à `[IA-NAV-CONSOLIDATE]` (le tour est un symptôme de la nav éparpillée).
- [ ] **[NAV-IA-GATE-MSG]** 🔧 ✗FAUX→perception LOW — « Assistant IA » route correctement
  (`TabRouter:277-291`) ; l'auditeur a heurté `PageSetupGate` (profil non configuré). Perception « page
  cassée » → message clair « configure ton profil pour débloquer l'Assistant IA » sur la gate.
- **Rien à coder (validés FAUX, artefacts data)** : `GATE-VALUE-PROP` (value-prop déjà avant le bouton),
  `UI-DETTES-TITLE` (titre fixe « Gestion de la Dette »), `BUD-CATEG-DEFAULT` (`migrateBudgetItems` classe
  l'épargne correctement — données de test), `VIZ-LEGEND-DEDUP` `TOTAL PORTEFEUILLE ×5` (artefact CSV).

---

## 🚀 MCP FinanceAI → Cloud Run [⏳ gros chantier] (brief Marc 2026-06-16, RELANCÉ 2026-07-13)
> Le serveur MCP perso FinanceAI (finances : Drive/BigQuery, comptes CELI/REER/CELIAPP/REEE) tourne en
> local (stdio), token Google en **fichier**. **Symptôme** : `get_financial_overview` → `invalid_grant`
> (« Token has been expired or revoked ») alors que `ping` répond. **But** : serveur **distant** hébergé sur
> **Google Cloud Run**, stable, sécurisé, redéployé à chaque push. **Code : dossier `mcp/`.**
> ⚠️ **PLAN-FIRST** : phase 0 (explore + rapport) AVANT tout code ; **OK Marc requis avant la phase d'écriture.**
> ⚠️ **DEUX OAuth distincts** : **A** = serveur ↔ Google (lire les finances Drive/BigQuery — c'est CE token qui
> est mort, à persister hors disque + rafraîchir) ; **B** = Claude ↔ serveur (auth du connecteur — Bearer
> d'abord, architecture prête pour OAuth 2.1 plus tard). NE PAS les confondre.
>
> **RELANCE 2026-07-13 (choix Marc : claude.ai web/mobile direct)** — plan validé en 4 lots :
> Lot 1 `[MCP-WHATIF]` (tools what-if + séries, indépendant de l'hébergement) → Lot 2 `[MCP-CLOUDRUN-HTTP]`
> → Lot 3 `[MCP-CLOUDRUN-A]`+`[MCP-CLOUDRUN-B]` → Lot 4 `[MCP-CLOUDRUN-DEPLOY]` (+ MAJ carte « Connecter à
> Claude » de l'app, qui pointe vers un `.mcpb` jamais hébergé — rappel Marc 2026-07-13).
> ⚠️ **Phase 0 REFAITE 2026-07-13, correction au brief** : l'UI connecteurs custom de claude.ai n'a PAS de
> champ Bearer statique (OAuth 2.0 seulement : Authorization URL, Token URL, Client ID/Secret en advanced
> settings ; `static_headers` = bêta réservée aux orgs Team/Enterprise) → **Auth B = mini serveur OAuth 2.1
> mono-utilisateur (PKCE)**, pas un middleware Bearer. `[MCP-CLOUDRUN-ROOT]` (consentement en Production)
> = ✅ RÉGLÉ par Marc 2026-07-06. Marc a confirmé : PAS de passphrase sur le coffre (DriveStateSource OK).

- [x] **[MCP-CLOUDRUN-0]** ✅ **FAIT 2026-07-13** (phase 0 refaite : stack TS `@modelcontextprotocol/sdk`,
  entrée `mcp/stdio.ts`, 15 tools, token Drive en `~/.financeai-mcp/credentials.json` scope `drive.appdata`,
  flux `access_type=offline+prompt=consent` ; rapport livré à Marc en session, plan 4 lots OK). Détail original :
  langage/framework MCP (FastMCP Python ? `@modelcontextprotocol/sdk` TS ? autre ?) ; transport actuel +
  entrée du serveur ; où/comment le token Google est lu/écrit (fichier ? chemin ? lib OAuth ?) ; où vivent
  `client_id`/`client_secret` (clair ? `.env` ?) ; scopes Google + `access_type`/`prompt` ; **liste
  exhaustive des outils MCP exposés** (pour ne rien casser). → rapport court + plan → **attendre l'OK Marc**.
- [x] **[MCP-WHATIF]** ✅ **Lot 1 FAIT 2026-07-13 (PR de cette session)** — demande Marc : « si j'achète une
  voiture demain, comment ça affecte mes finances, avec des chiffres précis de l'app et des graphs, aucun
  chiffre inventé ». Nouveau tool data-aware `simulate_what_if` (`mcp/whatIf.ts` pur + `mcp/tools/
  simulateWhatIf.tool.ts`) : changements hypothétiques (achat ponctuel/financé, salaire, dépense récurrente,
  nouvelle dette, achat immobilier) traduits vers les VRAIES structures moteur (LifeEvent GROS_ACHAT, Debt,
  RealEstateGoal, users, calculatedMonthlySavings) → moteur roulé 2× (même `now`) → deltas à 1/2/5/10/20 ans
  + âge FIRE + impôts + hypothèses REMONTÉES (`assumptions`) + séries annuelles base/scénario pour graphs.
  + `get_projection` param `includeSeries` (série annuelle exacte). 20 tests (discriminants de MAGNITUDE
  économique : voiture 30 k$ → écart an 1 ∈ [−40k, −25k]). ⚠️ Piège évité : `totalClosingCosts` SANS taxe
  de bienvenue (le moteur ajoute `welcomeFees` lui-même, `realEstateMonth.ts:175` — l'inclure = double-comptage).
  **Panel 2026-07-13 (3 agents, findings MESURÉS et tous intégrés)** : mot réservé « vente » assaini (delta 0
  silencieux sinon) · `.finite()` + gardes `Number.isFinite` (Infinity passait Zod → impact fabriqué) · mois ISO
  construit comme le moteur (toISOString, pas composants locaux — fuseaux positifs décalaient d'un mois) ·
  changement daté hors horizon REJETÉ (avant : « succès » à effet nul) · financement différé REJETÉ (dettes sans
  date de début → −28 k$ quatre ans trop tôt) · mise de fonds > prix rejetée · hypothèses SCHL/retraite remontées.
- [ ] **[MCP-WHATIF-DATED-DEBT]** 🔧 LOW (suivi panel MCP-WHATIF 2026-07-13) — les dettes du moteur n'ont pas de
  date de DÉBUT (servies dès le mois 0) → le what-if rejette un achat FINANCÉ différé (`monthsFromNow > 1`).
  Pour le supporter : soit un champ `startDate?` sur `Debt` honoré par le moteur (plan-first, touche le moteur),
  soit une modélisation « flux de paiements » côté what-if. Décision Marc requise sur la sémantique.
- [x] **[MCP-ENGINE-WARNINGS]** ✅ 2026-07-29 — `onLogEntry` (écouteur éphémère d'errorLogger, isolé) + collecte dans `withState` (source projection, warning+, cap 5, dédup, désabonné en finally) → bloc texte additif « ⚠️ Avertissements du moteur » dans la réponse (JSON intact). Ex-suivi : les `logErrorThrottled` du moteur
  (ex. « montant non fini → dépense ignorée ») partent dans un sink NAVIGATEUR (localStorage, no-op sous Node) →
  invisibles pour Claude côté MCP. Piste : `withState` collecte les logs moteur pendant le run et les remonte dans
  la réponse JSON (champ `engineWarnings`). Zéro impact app web.
- [x] **[ENG-LIFEEVENT-VENTE-SUBSTRING]** ✅ 2026-07-29 — `LifeEvent.eventKind?: 'VENTE_IMMO' | 'NONE'` (additif, zéro bump persist) : sémantique EXPLICITE prime, absent = sous-chaîne historique exacte (golden inchangé, conservation 20/20). Le what-if MCP pose eventKind:'NONE' sur ses GROS_ACHAT (ceinture structurelle, safeEngineName reste la bretelle). 3 tests discriminants. Ex : `applyLifeEvents`
  détecte une vente immobilière par SOUS-CHAÎNE `name.includes('vente')` : fragile pour tout producteur de
  LifeEvent non humain (MCP assainit déjà via `safeEngineName`). Piste : type d'événement EXPLICITE
  (`'VENTE_IMMO'` dans `LifeEventType`) + migration douce du fallback substring. Plan-first (touche le moteur).
- [x] **[MCP-CLOUDRUN-A]** ✅ **Lot 3 FAIT 2026-07-13** — `mcp/auth/credentialsBackend.ts` : backend
  d'identifiants FICHIER (local, inchangé) OU **Secret Manager** (`$FINANCEAI_GOOGLE_SECRET`) via metadata
  server + API REST (zéro dépendance npm) ; `save` réécrit une version (refresh token régénéré). `tokenProvider`
  prend le backend en injection + **`invalid_grant` traité** → message ACTIONNABLE (« Autorisation Google EXPIRÉE
  ou RÉVOQUÉE… reconnecte »). `bootstrap` sélectionne le backend selon l'env. 404 secret = « pas autorisé »
  (pas une panne). Test Secret Manager avec fetch simulé (round-trip base64, metadata absent → erreur claire).
- [x] **[MCP-CLOUDRUN-B]** ✅ **Lot 3 FAIT 2026-07-13** — `mcp/auth/oauthProvider.ts` : mini serveur OAuth 2.1
  MONO-USER **STATELESS** (Cloud Run scale-to-zero : rien en mémoire) — tokens = payload JSON signé HMAC-SHA256
  (`$FINANCEAI_OAUTH_SIGNING_KEY`), DCR sans base (client_secret = HMAC(client_id)), PKCE **S256 obligatoire**,
  redirect_uri sur allowlist (claude.ai/claude.com + loopback) lié au code, rotation du refresh (OAuth 2.1). La
  « porte » = **clé d'accès** unique (`$FINANCEAI_ACCESS_KEY`) constant-time sur une page HTML. Endpoints `/oauth/
  authorize` (form GET + POST), `/oauth/token`, `/oauth/register`, `/.well-known/oauth-authorization-server` +
  `/.well-known/oauth-protected-resource` (RFC 8414/9728) ; garde Bearer sur `/mcp` (toutes méthodes) → 401 +
  `WWW-Authenticate` pointant la découverte. Activé quand `SIGNING_KEY`+`ACCESS_KEY` présents (l'un sans l'autre
  = refus de démarrer). 21 unités OAuth + flux e2e HTTP complet (register→authorize→code→token PKCE→tools/call).
- [x] **[MCP-CLOUDRUN-HTTP]** ✅ **Lot 2 FAIT 2026-07-13** — `mcp/http.ts` (node:http pur, zéro dépendance
  ajoutée) : endpoint unique `/mcp` (POST/GET/DELETE, sessions `StreamableHTTPServerTransport` du SDK,
  `enableJsonResponse`, balayage sessions inactives 1 h, cap 32) + `/health` ; `$PORT` (Cloud Run) → `0.0.0.0`,
  local → `127.0.0.1` + anti-DNS-rebinding ; SIGTERM/SIGINT propres ; `mcp/bootstrap.ts` factorise la source
  d'état (partagée stdio/http) ; version 0.4.0→0.5.0. Le switch stdio|http = 2 entrées + scripts npm
  (`mcp:dev`/`mcp:http`) plutôt que `MCP_TRANSPORT` (plus simple, même effet). 9 tests e2e (vrai serveur,
  vrai protocole). ⚠️ SANS auth → ne pas exposer avant Lot 3 (A+B).
- [ ] **[MCP-CLOUDRUN-AUTH-HARDENING]** 🔧 CONDITIONS pré-exposition (panel sécurité Lot 3, 2026-07-13, à trancher
  au Lot 4) : (1) **rate-limit** sur `POST /oauth/authorize` (brute-force de la clé d'accès — Cloud Armor ou compteur) ;
  (2) `FINANCEAI_ACCESS_KEY` GÉNÉRÉE par `crypto.randomBytes` (documenté README, pas juste « ≥16 car. ») ; (3) single-use
  code + rotation refresh sont **best-effort mémoire** (mono-instance) → si multi-instance un jour, `jti` consommés dans
  un store partagé (Firestore/Memorystore TTL) ; kill-switch d'incident = rotation `FINANCEAI_OAUTH_SIGNING_KEY` (à
  documenter dans le runbook) ; (4) `min-instances 1` recommandé pour ne pas vider le set de `jti` à chaque cold-start.
- [x] **[MCP-CLOUDRUN-DEPLOY-LOGS]** ✅ RÉSOLU 2026-07-13 — l'email Drive est tronqué au domaine dans les logs
  (`bootstrap.describe()` : `…@domaine`), session-ids tronqués (Lot 2). Case cochée (panel a confirmé le code déjà en place).
- [ ] **[MCP-CLOUDRUN-DEPLOY-LOGS]** 🔧 CONDITION pré-déploiement (panel security-privacy 2026-07-13) : avant
  d'exposer les logs à Cloud Run, retirer/tronquer l'EMAIL Drive du log de démarrage (`bootstrap.describe()`)
  — les session-ids sont DÉJÀ tronqués à 8 caractères (fait au Lot 2). + MAJ carte « Connecter à Claude » de
  l'app (Réglages → Système) pour décrire le branchement claude.ai (rappel Marc 2026-07-13).
- [x] **[MCP-CLOUDRUN-DEPLOY]** ✅ **Lot 4 FAIT 2026-07-13** — `mcp/Dockerfile` (node:22-slim, copie mcp/services/
  utils/types/constants — fermeture d'import PROUVÉE minimale, USER node, `npx tsx mcp/http.ts`, EXPOSE 8080) +
  `.dockerignore` (exclut front/tests/secrets) + `mcp/deploy.sh` (`gcloud run deploy --source`, région Montréal,
  `--set-secrets` ×2 OAuth + `FINANCEAI_GOOGLE_SECRET` env, `min-instances 1`, 2 passes pour injecter
  `FINANCEAI_PUBLIC_URL`) + `.github/workflows/deploy-mcp.yml` (déploiement continu via WIF, garde `if
  vars.GCP_PROJECT_ID`) + README pas-à-pas GCP (clés `randomBytes`, 3 secrets, IAM secretAccessor, branchement
  claude.ai) + carte « Connecter à Claude » (`ClaudeConnectorCard.tsx`) gagne une section web/mobile
  (`VITE_MCP_SERVER_URL`). **Actions Marc restantes** (dans A_FAIRE_MOI) : créer projet GCP + 3 secrets + IAM +
  lancer `deploy.sh` + coller l'URL dans claude.ai. **Spec d'origine ci-dessous (référence) :**
- **[MCP-CLOUDRUN-DEPLOY — spec]** Dockerfile (EXPOSE 8080, démarre sur `PORT`) +
  endpoint `/health` → 200 ; `deploy.sh` (`gcloud run deploy`, région **northamerica-northeast1**,
  `--min-instances 0`, `--set-secrets` ×3) ; workflow **GitHub Actions** (`google-github-actions/deploy-cloudrun`)
  qui redéploie sur push `main` ; README (créer les 3 secrets, publier l'OAuth consent en Production, déployer,
  brancher le déploiement continu, brancher Claude : Settings → Connectors → custom connector URL
  `https://…run.app/mcp` + clé Bearer en advanced settings, retrait de l'ancien MCP local).
- **Critères d'acceptation** : `docker build` + `docker run -e PORT=8080` démarre en HTTP local ; appel MCP
  GET/POST `/mcp` répond, **sans Bearer → 401** ; token lu depuis Secret Manager (jamais fichier ; `grep` = 0
  secret clair) ; `get_financial_overview` OK une fois un refresh token valide en place ; **tous les outils MCP
  préexistants encore enregistrés** (lister avant/après) ; `/health` → 200 ; workflow Actions valide (dry-run).
- **Contraintes** : ne PAS renommer outils/signatures ; jamais de secret commité (vérifier `.gitignore`) ;
  petits commits atomiques + explication ; **branche, pas `main`** ; décision Marc (région/nom service/scopes)
  → demander au lieu de supposer.
- 🧭👤 **[MCP-CLOUDRUN-ROOT]** **CAUSE RACINE prioritaire (action Marc — Google Cloud Console)** : l'écran de
  consentement OAuth est probablement en mode **« Testing »** → le refresh token expire tous les **7 jours**
  (= la vraie cause du `invalid_grant`). **Publier l'app en Production** (OAuth consent screen). À rappeler
  comme étape OBLIGATOIRE dans le README. → aussi candidat à `A_FAIRE_MOI.md`.

## 💰 Audit money-critical 2026-06-16 (bug « -208 633 $/mois » — workflow + panel adversarial)
> Déclencheur : Marc voit un patrimoine net -193 398 $ / variation -208 633 $ avec revenu ~10,6 k$.
> Workflow multi-agents (12 finders + vérif adversariale 2 votes) → 9 bugs confirmés / 10 réfutés.
> **CLUSTER PATRIMOINE NET livré cette PR** (MONEY-PHANTOM). Reste à corriger (PRs ciblées, money-critical) :
- [x] **[MONEY-PHANTOM]** ✅ livré : découvert `liquidDebt` exposé+visible (modal « Dettes ») ;
  `rawNetWorth`/`prevNW`/succession soustraient activeDebts+smithDebt via source unique
  `computeRawNetWorth` ; `diffNW` exact ; garde NaN dette ; 9 invariants de conservation +
  checklist CLAUDE.md. (Cause racine = débit one-time réno/véhicule > actifs → dette invisible.)
- [x] **[FISC-REER-WHT-DOUBLE]** ✅ CRITICAL livré (2026-06-16) — **le « 50 000 au fisc » de Marc, CONFIRMÉ
  numériquement** : impôt cumulé d'un couple retraité (600 k$ REER) **266,6 k$ → 215,1 k$ sur 11 ans (−51 k$)**.
  Cause RÉELLE (≠ hypothèse du finding « net crédité ») : la retenue quittait le patrimoine au RETRAIT — le
  BRUT sort du REER et le crédit net est effacé par l'invariant **CF-2** de `cashflowAllocation.ts` — ET était
  re-débitée en avril via `.reer` → fuite ≈ retenue/mois (prouvée empiriquement : résiduel de conservation
  négatif chaque mois sur un retraité qui décaisse). Fix = retrait **NW-NEUTRE** : la retenue (acompte d'impôt)
  est CONSERVÉE au liquide jusqu'au règlement d'avril (`reerWithholdingPrepaid` réinjecté en CF-2 ; meltdown :
  `liquid += withholding`). FERR/immo créditaient déjà le brut = corrects (référence de cohérence). Garde
  permanente : **INV-10/INV-11** (`projection.moneyConservation.test.ts`) — conservation décaissement + meltdown,
  **DISCRIMINANTS prouvés** (échouent sur le code d'avant via `git stash`). Re-baseline `projection.survivor.test.ts`
  (le bug gonflait l'impôt du couple > celui du survivant). Panel : projection-validator + fiscal-accuracy (fix
  fiscalement CORRECT, palier 0 % désormais remboursé) + code-reviewer + silent-failure-hunter. ⚠️ LEÇON : le
  1er fix proposé (« shortfall -= brut ») NE conservait PAS (prouvé algébriquement + empiriquement) → c'est la
  CONSERVATION EMPIRIQUE (exécuter le moteur, mesurer ΔNW résiduel) qui a donné le vrai fix, pas l'analyse.
- [x] **[FISC-BROKE-LIQUID-FLOOR]** ✅ MEDIUM (livré 2026-06-17 ; découvert pendant FISC-REER-WHT-DOUBLE) —
  quand TOUS les actifs de décaissement sont épuisés (REER/CELI/nonReg/crypto = 0) mais qu'un coussin de liquidité
  protégé par `criticalThreshold` subsiste, un shortfall non couvert (`cashflowAllocation.ts:144-152`, branche `else`
  qui ne puise pas sous le seuil critique) ne puise PAS le coussin ET n'est PAS porté en `liquidDebt` (le rescue
  `projection.ts:~1309` ne s'arme que si liquide < 0). La dépense « s'évapore » : ΔNW ne baisse pas → résiduel de
  conservation = +shortfall/mois (mesuré ~+3,9 k$/mois sur un retraité à sec, après épuisement du REER). Peut-être
  un FLOOR voulu (éviter une spirale absurde une fois ruiné) MAIS viole la conservation. **Décision Marc = (b) porter
  en `liquidDebt`** (dette VISIBLE, coussin gardé). Fix : `cashflowAllocation.ts` expose `uncoveredShortfall` (résidu
  après cascade) ; `projection.ts` le porte en `liquidDebt` au site PRIMAIRE — zéro double-comptage avec le rescue
  PV-6 (ne s'arme que si liquid<0 ; après le primaire liquid reste au coussin ≥0, vérifié projection-validator +
  silent-failure-hunter). Garde : **INV-12** (`moneyConservation`), prouvé discriminant (résiduel 3496 $/mois sans le
  fix → ≈0 avec, via `git stash`). Chemin DISTINCT du fix REER (qui y était inerte ; INV-10/INV-11 = phase solvable).
### 🔬 Audit financier 2026-06-23 (findings vérifiés — `docs/AUDIT_FINANCIER_2026-06-23.md`)
> Cœur AAA CONFIRMÉ + élargi (conservation 29 scénarios résiduel ≤0,03 $, fiscalité 0 écart, FA-6 conforme). Findings de
> juin quasi tous FERMÉS. **Tout ci-dessous = PÉRIPHÉRIE** (durcissement défensif / affichage / sécurité au repos) — aucun
> n'altère la conservation ni un calcul fiscal du cœur. Lot 1 (sûr) d'abord, puis NaN-hardening (plan-first, touche le moteur).
- [x] **[NAN-INPUT-HARDENING]** ✅ **FAIT (2026-06-23, LOT 4)** — gardes `Number.isFinite` (rabattre sur 0/neutre) sur les VRAIS
  vecteurs : `retirementIncome.ts:173` (`?? 0`), `useDerivedFinancials.ts:51` (arith. nue), `monthlyEvents.ts:160` (`?? 0`),
  `w5Effects.ts:125` (rental `!== 0`), `helpers.ts:57+rateAnnual` (`NaN<=0`=false + taux NaN trouvé au panel), `portfolio.ts`
  (computeTotalDebt/AssetBreakdown/InvestmentsValue : `|| 0`→`Number.isFinite` pour Infinity). ⚠️ Faux positifs écartés (findings=hypothèses) :
  `portfolio:147` `||` rattrapait déjà NaN ; `taxDecember:600` DÉJÀ gardé ; `w5Effects:139` business sûr via `>0`. Tests discriminants
  (git-stash : échouent sans gardes) + **INV-8 corrigé** (était VACANT : `num()` sanitisait avant `isNaN`). Panel 4 agents ✅, conservation 19/19.
- [x] **[NAN-OBSERVABILITY]** ✅ **FAIT (2026-06-25)** — nouveau helper partagé `logErrorThrottled(signature, input)` (`errorLogger.ts`,
  1×/signature, calque le throttle de `computeRawNetWorth`) câblé aux 2 sites : `monthlyEvents.ts` (lifeEvent `impactAmount` non fini →
  `warning` throttlé par event id) et `useDerivedFinancials.ts` (actif valeur non finie → `warning` throttlé par `symbol`). 3 tests du throttle.
  Observabilité seule (la garde NaN prévient déjà la corruption). Conservation inchangée.
- [ ] **[NAN-MUTATOR-CENTRAL]** 🔧 LOW (suite LOT 4, panel projection-validator) — les 4 mutateurs nus (`addIncome`/`addExpense`/`addLiquid`/
  `subtractLiquid`, `projection.ts:717-754`) n'ont aucune garde centrale → des angles morts Infinity subsistent (`w5Effects:137` business,
  `stochasticEvents.ts:45/47/83`, `taxApril.ts:55`). Une garde unique dans ces 4 closures couvrirait tout en 1 endroit (vs gardes par-appelant).
  ⚠️ Infinity NON atteignable depuis le boundary UI (`parseFloat` rend NaN, jamais Infinity) → durcissement défensif, pas bug. Effort S.
  ⚠️ **Vérif workflow backlog-verify 2026-06-26 : VALIDE mais À DIFFÉRER** — `utils/numericInput.ts` `numOr`/`numOrUndef` (l.22/33) filtre déjà NaN
  **ET** Infinity via `Number.isFinite` au boundary → vecteur **inatteignable depuis la saisie** ⇒ valeur réelle FAIBLE (défensif pour futurs appelants/import JSON brut).
  Plan complet prêt en réserve (6 gardes `if (Number.isFinite(amt))` dans les closures `projection.ts:726-763` + test discriminant héritage=Infinity → NetWorth fini, étend INV-8 au chemin flux). À prendre seulement si un vecteur d'entrée non-UI apparaît.
- [x] **[WHT-DISPLAY-EXACT]** ✅ **FAIT (2026-06-26, panel financial-integrity + projection-validator + silent-failure + code-reviewer, tous APPROVE)** —
  `totalTaxesPaid` (compteur d'affichage) : (a) nouveau champ `CashflowState.rrspWithholdingMois` = SOMME des retenues PAR TIRAGE déjà
  calculées par la cascade `drawReer` (cumulé/mois, round-trip buildCashState/applyCashState, reset 0 chaque mois). `projection.ts` passe de
  `withholdingForGrossRRSP(retraitReerMois)` (recalcul sur le brut MENSUEL agrégé) à `rrspWithholdingMois` → exact au cent près ET aligné sur la
  retenue réellement provisionnée (`taxCurrentYear.reer`). (b) fonction locale `rrspWithholding` (cashflowAllocation) SUPPRIMÉE → source unique
  `withholdingForGrossRRSP` (refactor PUR, math identique). Découplage CF-2 : le restore du liquide utilise le DELTA de l'appel courant
  (`rrspWithholdingMois − rrspWithholdingAtStart`) pour rester correct au 2ᵉ appel (sauvetage de découvert PV-6). Mesuré (git-stash) :
  270 087 → 269 132 $ (−955 $, l'agrégat sur-estimait, barème non additif). Test discriminant unitaire (3 tirages palier 1, somme franchit le palier 2)
  prouvé RED→GREEN. Compteur de display/ranking, **aucun impact NW** ; conservation 12 invariants verte, suite 2330/2330.
- [ ] **[WHT-DISPLAY-MELTDOWN]** 🔧 LOW (découverte silent-failure-hunter, suite WHT-DISPLAY-EXACT 2026-06-26) — le compteur d'affichage
  `totalTaxesPaid` n'inclut PAS la retenue REER du **meltdown** (`meltResult.withholding`, `projection.ts:~1352`) : elle est bien provisionnée
  dans `taxCurrentYear.reer` (NW correct, conservation OK) mais le compteur de display sous-estime pour un user en stratégie `MELTDOWN_REER`.
  Pré-existant (l'ancien `withholdingForGrossRRSP(retraitReerMois)` ne l'incluait pas non plus — le meltdown n'alimente jamais `retraitReerMois`).
  Fix candidat : `rrspWithholdingMois += meltResult.withholding` à côté de `taxCurrentYear.reer += meltResult.withholding`. ⚠️ Change le ranking
  de stratégies + golden → discriminant `git-stash` + mesure OBLIGATOIRES. Aucun impact NW.
- [ ] **[FISC-REEE-AIP-MODEL]** 🔧 LOW (découverte financial-integrity, suite REEE-LITERALS 2026-06-26) — l'impôt PRA à la fermeture du REEE
  (`childrenReee.ts`, `REEE_AIP_TAX_RATE=0.20` × `reeeNewBalance`) frappe le SOLDE TOTAL à 25 ans, alors que l'impôt sur le Paiement de Revenu
  Accumulé officiel ne vise QUE la portion revenu accumulé (gains, pas les cotisations remboursées sans impôt) + une SURTAXE 20 % (12 % féd
  + 8 % QC) en SUS de l'impôt ordinaire. Approximation de modèle (déjà marquée comme telle). Raffiner = séparer cotisations/gains + modéliser
  la surtaxe. ⚠️ money-critical (touche `taxDiversAdd`) → discriminant + panel. Effort M.
- [x] **[TC-FX-HARDCODE]** ✅ **FAIT (2026-06-23, LOT 3)** — `TaxCenter.tsx` : FX USD/EUR via `useFinanceStore(s=>s.fxRates)` (helper
  `fxOf` + garde `Number.isFinite`, CAD=1) au lieu de `1.38` figé ; rendements `0.02`/`0.07` → constantes `EST_DIVIDEND_YIELD`/
  `EST_CAPITAL_GAINS_YIELD` ; `0.5` → `CAPITAL_GAINS_INCLUSION_STANDARD` ; garde `(qty||0)*(price||0)`. Panel financial-integrity ✅
  (sens FX correct, `taxableAddOn` confiné à l'affichage TaxCenter, zéro fuite vers le moteur source-unique).
- [x] **[SEC-PRIVACY-BLUR-INPUTS]** ✅ **FAIT (2026-06-23, LOT 2)** — nouveau `components/ui/PrivateNumberInput.tsx` (focus-to-edit :
  `•••` hors DOM en mode discret hors-focus, vrai `<input>` au clic/focus clavier, re-masque au blur ET si le mode discret est
  (ré)activé en cours d'édition). Appliqué à `BudgetGroupTable` (1 champ) + `RetirementIncomeCard` (2 champs). `id` propagé au
  bouton (label `htmlFor` préservé), `focus-ring` + `min-h-[24px]`, focus programmatique via ref. Panel a11y + security-privacy ✅.
- [x] **[SEC-PRIVACY-RETIREMENT-RRQ-PSV]** ✅ **FAIT (2026-06-23)** — `RetirementIncomeCard.tsx` : les 2 `<input>` `rrqEstimateMonthly`/
  `psvEstimateMonthly` (montants de rente = PII) migrés vers `<PrivateNumberInput>` (même pattern panel-approuvé que leurs 2 voisins) →
  masqués hors-focus en mode discret, valeur hors DOM. Clôt la découverte du LOT 2 (volet vie privée des champs éditables complet).
- [x] **[SEC-PBKDF2-DRIVE]** ✅ **FAIT (2026-06-23, LOT 1)** — `keyCipher.ts` : PBKDF2 600k (encrypt) + fallback legacy 100k
  (decrypt) pour les anciens blobs Drive. Garde « Web Crypto indisponible » avant la boucle. Test rétro-compat (blob 100k déchiffre).
- [x] **[M1-FISC-WHT-HARDCODE]** ✅ **FAIT (2026-06-23, LOT 6)** — `projection.ts:1428` : retenue REER du compteur `totalTaxesPaid`
  passe de `*0.15` figé à `withholdingForGrossRRSP(retraitReerMois).withholding` (tiered 19/24/29 % combiné QC, MÊME barème que le
  cashflow `rrspWithholding`). Non-double-compte VÉRIFIÉ par panel (financial-integrity + projection-validator + silent-failure-hunter) :
  c'est l'acompte que la réconciliation de décembre soustrait (`totalAnnualTax − taxCurrentYear.reer`) ; `taxOnRrif` séparé, base disjointe.
  Mesuré : totalTaxesPaid 211,6 k$ → 270,1 k$ sur un retraité décaissant ~9 k$/mois (discriminant git-stash, seuil 250 k$). A compressé
  l'écart du test survivor 3,77 %→2,21 % (artefact du biais 0,15) → seuil `projection.survivor.test.ts` re-calibré 0,03→0,015 + chiffres MAJ.
  Résiduels (display) → BACKLOG WHT-DISPLAY-EXACT.
- [x] **[M5-INV1-EXTEND]** ✅ **DÉJÀ COUVERT (constaté 2026-06-23, LOT 5)** — INV-9 (`projection.moneyConservation.test.ts:346-354`,
  ajouté à l'audit 2026-06-17) contient EXACTEMENT le gap visé : reconstructabilité sous hypothèque `NetWorth = Σactifs − DettesNonImmo`
  (<2 $) + discriminant `DetteTotale` (écart = solde hypothécaire > 1 k$). Pas de test dupliqué (leçon « vérifier avant de coder »).
- [x] **[HIST-NW-NO-DEBT]** ✅ **FAIT (2026-06-23, LOT 5)** — documenté les DEUX sites (`reconstructPortfolioHistory.ts:143` + le
  recompute d'affichage `FutureProjection.tsx:274`) : NW passé = placements (+cash+immo) SANS dettes, car l'app n'a pas l'historique
  des soldes de dette. Pas de rename (casserait les consommateurs `.NetWorth`). Question PRODUIT (disclaimer / approx dette courante)
  → `docs/A_FAIRE_MOI` HIST-NW-DEBT-DISCLAIMER.
- [x] **[SEC-LOG-DEBT-REGEX]** ✅ **FAIT (2026-06-23, LOT 1)** — `errorLogger.ts` : les termes financiers (amount/balance/debt/
  salary/income/expense/cost/price/net-worth) matchés en SUBSTRING (capte `liquidDebt`/`mortgageBalance`/`annualAmount`…) ; les
  termes ambigus (token/email/`fact`…) restent ANCRÉS (anti faux-positif `factor`). Tests : composés redactés + diagnostiques conservés.

### 🔬 Audit financier 2026-06-17 (findings vérifiés — `docs/AUDIT_FINANCIER_2026-06-17.md`)
> Cœur money-critical = AAA (conservation prouvée ≤0,02 $/~25 scénarios, fiscalité 0 écart). **Tous les findings
> ci-dessous sont à la PÉRIPHÉRIE** (consommateurs UI/IA/viz qui recalculent au lieu de la source unique) — aucun
> n'altère la VALEUR du patrimoine net. Lot d'implémentation : commencer par le keystone PUIS H1/H2 (test avant fix).
- [x] **[NW-PARITY-INVARIANT]** ✅ HIGH (★ garde-fou keystone, PR #370 2026-06-19) — SOURCE UNIQUE `computePresentNetWorth`
  (3 surfaces routent) + RESTE livré : `tests/services/nwParity.test.ts` cross-check le NW présent ≡ NW de DÉPART du moteur
  (`computeStartingCash` ≡ `computeCurrentLiquidity` par construction ; Σ 6 buckets `derivePortfolioStartingBalances` ≡
  `computeInvestmentsValue` — PAS « par construction » : 2 chemins de valorisation, vérifié) − dettes ; + end-to-end
  `chartData[0]` à flux nuls AVEC dettes (tolérance relative 0,1 %, le mois 0 applique un MER minime). Discriminant prouvé
  (D1 TOTAL double-compté, D2 dettes omises, D3 valorisation 2× → tous attrapés). **LIMITE documentée** : parité définie HORS
  immobilier (`computePresentNetWorth` exclut l'immo, le moteur l'inclut dans `chartData[0]`). Panel 3 agents APPROVE.
- [x] **[NW-UI-DEBT]** ✅ HIGH (livré PR audit) — `useDerivedFinancials.globalNetWorth` route vers `computePresentNetWorth`
  (soustrait les dettes). Avant : cash+investments SANS dettes → Dashboard gonflé.
- [x] **[AI-CTX-FX]** ✅ HIGH (livré PR audit) — `AiAssistant` : FX RÉELS (`fxRates`) + dettes soustraites via
  `computePresentNetWorth`/`computeInvestmentsValue` ; 1.38/1.50 en dur supprimés. Régression `TabRouter.availableCash`
  (dérivation `globalNetWorth − placements`) corrigée en passant (→ `currentLiquidity`).
- [x] **[FISC-DETTE-TOTALE-MORTGAGE]** (M5) ✅ MEDIUM (livré, décision Marc = champ additif) — champ `DettesNonImmo`
  (= activeDebts+liquidDebt+smithManoeuvre, SANS hypothèque) ajouté à `monthlyOutput` + `projection/types` →
  `NetWorth = Σactifs − DettesNonImmo` tient TOUJOURS (Immobilier = équité nette). INV-9 étendu : reconstructabilité
  via DettesNonImmo (< 2 $) + discriminant (DetteTotale NE reconstruit PAS sous hypothèque, écart = solde hypothécaire).
- [x] **[LLM-INJECT-PARITY]** (SEC-1) ✅ MEDIUM (livré) — `getCoupleOptimizationStrategies` + `getNextBestActions`
  neutralisent désormais les noms utilisateur (`sanitizePromptText`) et isolent les blocs de données en `<DONNEES>`
  (`wrapUserData`) — parité avec les 4 autres surfaces LLM. Le system prompt QUEBEC_FISCAL_CONTEXT isole déjà `<DONNEES>`.
- [x] **[FISC-WHT-HARDCODE]** ✅ **FAIT (2026-06-26, LOT 6/M1)** — `withholdingForGrossRRSP` tiered 19/24/29 % (barème tiers). Résiduel → [WHT-DISPLAY-EXACT] l.381 coché. Doublon fermé.
  DOUBLE-COMPTAGE dans ce compteur d'AFFICHAGE (`totalTaxesPaid`, PAS le NW). Augmenter le taux empirerait le double-compte.
  À FAIRE d'abord : vérifier empiriquement `totalTaxesPaid == Σ(sorties d'impôt réelles)` (cadre moneyConservation), puis
  corriger selon le résultat (retirer la ligne si double-compte, ou aligner sur la vraie retenue si complémentaire). Effort M.
- [x] **[FISC-DIV-SHARE-DRY]** (M2) ✅ MEDIUM (livré) — `NONREG_DIVIDEND_DISTRIBUTION_SHARE = 0.30` extraite dans
  `projection/helpers.ts`, consommée par `projection.ts` ET `taxDecember.ts` (source unique). Value-neutral.
- [x] **[FISC-INCLUSION-DRY]** (M3) ✅ MEDIUM (livré) — `projection.ts:1435` importe désormais
  `CAPITAL_GAINS_INCLUSION_STANDARD` (au lieu de `0.5` en dur). Value-neutral.
- [x] **[FISC-VIZ-CREDITS]** (M4) ✅ MEDIUM (livré, décision Marc) — `TaxBracketViz` : total + taux effectif (par
  juridiction ET combiné) tirés de `calculateFiscalReport` (NET, crédits BPA+abattement) ; barres + détail $ restent
  BRUTS (pédagogique, libellés « avant crédits »). Fin du total « exact » surévalué.
- [x] **[FISC-CONST-LINT]** ✅ MEDIUM (PR #364, 2026-06-18, garde-fou) — `utils/fiscalConstantsGuard.ts` +
  `tests/fiscalConstants.guard.test.ts` (10 tests, échec dur, choix Marc). Auto-extrait de `tax.ts`/`realEstate.ts` les littéraux
  DISTINCTIFS non-collisionnables (entiers ≥5 chiffres ≠ `…000` + taux 4 décimales) et échoue si l'un fuite hors source.
  Scope sûr : ronds (`60000`=60 s ms) et taux 2-décimales (`0.5`) EXCLUS. Strip des commentaires (numéros de ligne ARC ≠
  constantes). Échappatoire `// fiscal-const-ok`. **A trouvé une vraie fuite** : `setupSimulation.ts` recopiait `32490`
  (RRSP 2025) → nommé `RRSP_ANNUAL_LIMIT_FALLBACK` dans tax.ts (byte-identique, 180+ tests projection verts). Démo
  (`testBudget`) exclue. Ferme structurellement M1-M3.
- [ ] **[FISC-CONST-LINT-LIMITS]** 🔧 LOW (découverte #364) — limites connues du garde-fou, à garder en tête :
  (1) les **taux à 2-3 décimales** (`0.063` RRQ, `0.205`, `0.15` clawback, `0.18` REER) ne sont PAS bannissables sans
  faux positifs (omniprésents en ratios) → une recopie manuelle d'un tel taux passerait sous le radar. (2) Les **facteurs
  FERR** (`helpers.ts` `RRIF_RATES`, `0.0617`…) sont des constantes réglementaires hors `tax.ts`/`realEstate.ts`, donc non
  protégées par le scan. Aucune fuite aujourd'hui (vérifié). Étendre le scope = arbitrage faux-positifs à faire.
- [ ] **[FISC-RRSP-PRE2010-FALLBACK]** 🔧 LOW (découverte #364) — `setupSimulation.ts` applique
  `RRSP_ANNUAL_LIMIT_FALLBACK` (= plafond 2025, 32 490 $) aux années en sol canadien **avant 2010** (hors table). C'est
  ANACHRONIQUE (plafond réel ~16,5 k$ en 2005) → sur-estime les droits REER historiques des très vieux profils (mord
  seulement si salaire×0,18 > 32 490, càd salaires > ~180 k$). Pré-existant (non introduit par #364). Fix futur : étendre
  la table avant 2010 ou extrapoler à la baisse.
- [x] **[AI-SNAP-FREQ]** (L4) ✅ LOW (livré) — `monthlyExpenses` NORMALISÉ par fréquence + hors épargne :
  `financialSnapshot` via `computeMonthlyBudgetAggregates`, `NextBestAction` via `monthlyAmountFor` (excl. Epargne).
  Avant : Σ brute des cibles (poste annuel compté ×12) envoyée à l'IA/MCP. 29 tests verts.
- [x] **[AI-NBA-FX]** ✅ LOW (livré) — `NextBestAction` utilise désormais les `fxRates` RÉELS du store (avant : `{}`
  → actifs étrangers à 1:1). NW + ventilation CELI/REER envoyés à l'IA corrects. (DRY complet via `buildFinancialSnapshot`
  reste un nice-to-have séparé — duplication du snapshot inline, consigné.)
- [x] **[ENG-LOOP-ORDER-TEST]** (L1) ✅ LOW (PR #362, 2026-06-18) — `tests/services/projection.loopOrder.test.ts` : garde-fou
  de l'ordre boucle (allocation AVANT croissance). 2 scénarios : (1) actifs investis partis de 0 → croissance mois 1 > 0
  (la contribution du mois finance sa propre demi-mois de rendement) ; (2) contrôle sans contribution → croissance investie === 0.
  DISCRIMINANT PROUVÉ à la main : en simulant l'ordre inversé (croissance sur soldes PRÉ-allocation), le scénario 1 échoue
  (`expected 0 to be greater than 1000`). Attrape une inversion que les 12 invariants de conservation laissent passer (l'argent
  reste conservé, seul le rendement est décalé). Liquide exclu (démarre ≠ 0).
- [x] **[ENG-MONTHLYOUTPUT-TEST]** (L2) ✅ LOW (PR #351, 2026-06-18) — `tests/services/monthlyOutput.test.ts` : 19
  assertions sur `buildMonthlyDataPoint` (mode MC minimal + mappings dérivés DetteTotale/DettesNonImmo, diffNW,
  *Max, NetTransfer, CoastFIRE, AccruedTax, ExpenseInflation, reconstructabilité, gardes div-0/Infinity). Panel
  `code-reviewer` (arrondi IEEE-754 borderline corrigé + 4 mappings non couverts ajoutés).
- [x] **[ENG-TAX-NS]** ✅ DÉCISION Marc 2026-06-19 : **GARDER l'alias** `services/tax.ts` (`export *`). Pas de
  résorption. Clos (voir batch décisions 2026-06-19).
- [x] **[FISC-WELCOME-2026]** ✅ **FAIT (2026-07-07)** money-critical — `services/realEstate.ts` `WELCOME_TAX_QUEBEC` :
  barème « reste_qc » passé du millésime 2025 (58 900/290 000/552 300 + 4ᵉ tranche 2 %) au **barème de BASE 2026 à 3 tranches**
  (62 900 : 0,5 % / 315 000 : 1,0 % / >315 000 : 1,5 %). La 4ᵉ tranche à 2 % (sur-tranches municipales >500 k$) est RETIRÉE →
  limite assumée documentée (ville par ville, non modélisable sur le binaire montreal/reste_qc). Discriminant : 500 k$ = 5 610,50 $
  (avant : 5 755,50 $) + bornes exactes 62 900/315 000 testées. SOURCE : *Gazette officielle du Québec* 2025-06-07 nº 23 (indexation
  +2,3438 %). Panel `financial-integrity`. Montréal intact, invariant « montreal ≥ reste_qc » préservé.
- [x] **[TP1G-VIVANT-SEUL]** ✅ **FAIT (2026-07-07)** — `utils/tax.ts` : montant « personne vivant seule » (2 172 $)
  additionné à âge + revenu retraite AVANT la réduction UNIQUE 18,75 % au-delà du **seuil unique 42 955 $** (les paliers
  duaux 27 835/45 270 non sourcés sont ARCHIVÉS → touche aussi les couples, crédit ↓ léger dans la bande), conversion 14 %.
  Gate `!hasSpouse` = solo ET survivant (via `taxFilers`, aucun changement `taxDecember.ts`). Discriminant prouvé (zéro-out
  → 3 tests solo échouent) ; suite complète 2352 verts, 2 goldens ITEM-2C re-basés SCIEMMENT (solo −9 175 $ ; couple +9 $).
  Panel `financial-integrity` + `silent-failure-hunter`. Limites assumées (doc §4) : montant appliqué au bloc 65+ (solo <65
  non crédité) ; supplément monoparental 2 681 $ NON modélisé (exigerait `childrenCount`).
- [ ] **[FISC-LINE361-PERCONJOINT-REDUC]** 🔍 LOW money-critical (découverte `financial-integrity` TP1G 2026-07-07, PRÉ-EXISTANT) —
  la réduction 18,75 % de la ligne 361 QC est appliquée PAR CONJOINT en mode retraité couple (`taxDecember.ts:532` passe
  `familyIncome = taxableReal` TOTAL à CHAQUE appel, boucle n=2) → si l'Annexe B réduit le TOTAL combiné une SEULE fois,
  la réduction serait comptée 2× dans la bande de réduction PARTIELLE → léger sur-impôt couple. NON introduit par TP1G
  (code d'avant, non modifié). Vérifier la structure réelle de l'Annexe B (réduction sur le total ménage vs per-déclaration)
  AVANT de coder ; discriminant `git stash` + panel. Golden `coupleEqual` inchangé = crédit soit nul soit plein hors bande.
- [x] **[REEE-LITERALS]** ✅ **FAIT (2026-06-26)** — `services/projection/childrenReee.ts` : SCEE/IQEE/REEE extraits en
  constantes nommées+sourcées (`SCEE_GRANT_RATE`, `*_ANNUAL_GRANT_BASIC/CATCHUP`, `*_LIFETIME_GRANT_LIMIT`, `IQEE_*`,
  `REEE_LIFETIME_LIMIT_PER_BENEFICIARY`, `REEE_TARGET_ANNUAL_CONTRIB_*`, + `REEE_AIP_TAX_RATE` marqué « approximation modèle »),
  pointant vers `FISCAL_REFERENCE §REEE`. Refactor PUR (valeurs inchangées) : golden + conservation + suite byte-identiques. Aucun impact $.
- [ ] **[NW-ASSETBREAKDOWN-DRY]** 🔧 LOW (audit 2026-06-17, panel) — `utils/useDerivedFinancials.ts:45-66` :
  `assetBreakdown` ET `currentLiquidity` recalculent INLINE au lieu de `computeAssetBreakdown`/
  `computeCurrentLiquidity` (`services/portfolio.ts`). ⚠️ **Analyse 2026-06-18 (PR #351) : PAS un quick win.**
  `currentLiquidity` = router safe (logique identique). MAIS `assetBreakdown` = **3 deltas sémantiques** sur un
  agrégat partagé : (1) le local met crypto dans `nonReg` (else), le helper le SORT → `nonReg` baisserait pour
  `Retirement.currentNonReg` (TabRouter:236) + contexte NBA (App.tsx:569) ; (2) le local a `reee` HARDCODÉ à 0,
  consommé par `currentRESP` (ChildPlanning, TabRouter:213) → changerait ; (3) l'interface `DerivedFinancials`
  n'a pas de champ `crypto`. = classe « changer un agrégat partagé casse silencieusement les dérivations »
  (CLAUDE.md). **À RESCOPER** : vérifier chaque consommateur + décider crypto/reee délibérément (effort M, pas S).

### 🛡️ Durcissement structurel (brief Marc 2026-06-17, post-audit) — VALIDÉ + reformulé pour l'app
> Objectif Marc : rendre bugs math / blocages UI / corruptions de données structurellement impossibles. Statut vérifié
> contre le code actuel — certains tickets sont DÉJÀ faits (ne pas refaire), d'autres partiels. IDs reformulés pour FinanceAI.

**ÉPIC 1 — Noyau de calcul & preuve**
- [x] **[HARDEN-FUZZING]** ✅ HIGH (PR #365, 2026-06-18, ticket 1.1) — `tests/services/projection.fuzzConservation.test.ts`
  (fast-check `^4.8.0` dev). 500 scénarios aléatoires BORNÉS → par mois : reconstructabilité forme-BILAN
  `|NW − (Σactifs − DettesNonImmo)| ≤ 1 $` (PAS la forme dépistage, faux-positive sur flux one-time) + NetWorth fini
  (lecture STRICTE, pas de NaN silencé) + aucun actif (hors immo) négatif (INV-6). Seed FIXE (CI déterministe), timeout
  lié à NUM_RUNS, fast-check affiche contre-exemple + seed à l'échec. **Discrimination PROUVÉE end-to-end** (injection
  `+1000` au NW → fuzz échoue, counterexample minimal). Panel 4 agents (résiduel max MESURÉ 0,02 $, arbiter = `computeRawNetWorth`
  terme-pour-terme, chemins fiscaux exercés : REER 70 %, clawback PSV 10 %, insolvabilité 33 %). Complète les ~25 scénarios fixes.
- [~] **[FUZZ-ONETIME-FLOWS]** 🔧 MEDIUM ◑PARTIEL (PR #367, 2026-06-19) — le fuzz génère désormais l'**ACHAT IMMOBILIER**
  (mise 5-50 % < prix → hypothèque ; **mesuré 257/500 runs sous hypothèque**, écart max 886 k$) + **RÉNOVATION** majeure,
  et un invariant **`DetteTotale ≥ DettesNonImmo`** (hypothèque non double-comptée, écart = `mortgageBalance ≥ 0`). **Test
  déterministe immo** : reconstruction NW sous prêt. La reconstructabilité SOUS hypothèque (raison d'être de la forme-bilan,
  ex-`immoSeen=0/500`) est désormais fuzzée. Discrimination PROUVÉE end-to-end (flip signe équité + drop liquidDebt de
  DetteTotale → fuzz échoue). **RESTE (suivi)** : la VENTE immo / GAIN EN CAPITAL locatif (déclenché par lifeEvent « vente »
  — le fuzz achète et DÉTIENT), le REVENU LOCATIF (`rentalIncomeMonthly`), l'ÉQUITÉ NÉGATIVE (choc immo / immeuble sous l'eau),
  véhicule, héritage, REEE/childGoals.
- [x] **[DEP-UNDICI-VULN]** ✅ **RÉSOLU/PÉRIMÉ (constaté 2026-06-25)** — voir [DEP-UNDICI] : le lockfile est à `undici 7.28.0` (≥ fix),
  `npm audit` = **0 vulnérabilité**. Le `npm ls` à 7.25.0 = `node_modules` local périmé (pas réinstallé). Rien à coder.
- [x] **[HARDEN-NETWORTH-EXHAUSTIVE]** ✅ MEDIUM (PR #356, 2026-06-18, ticket 1.2) — garde anti MONEY-PHANTOM sur
  `NetWorthParts` (`services/projection/netWorth.ts`) : `export const NET_WORTH_SIGN: Record<keyof NetWorthParts, 1|-1>`
  → un champ ajouté à l'interface SANS signe casse le **typecheck** (prouvé). + test croisé « littéral == Σ signe×valeur »
  → un terme oublié dans la formule fait échouer le test (discriminant prouvé : retrait d'un terme → 3 tests rouges).
  ⚠️ La formule littérale `computeRawNetWorth` reste **byte-identique** (hot-path inchangé, zéro régression — conservation
  verte) : le sign-map est un filet compile-time + test, INERTE au runtime. Panel `projection-validator` : garde correcte.
- [ ] **[HARDEN-DECIMAL-STUDY]** 🔧 LOW/⏳ (nouveau, ticket 1.4, ÉTUDE) — PoC arithmétique exacte (centimes entiers OU
  `decimal.js`) sur un sous-module (impôts). ⚠️ Priorité BASSE : la dérive flottante est DÉJÀ bornée ≤ 0,02 $ sur ~25
  scénarios (invariants tolèrent < 2 $). Mesurer le coût Monte Carlo (480 mois × 100 iter) AVANT d'adopter. Ticket 1.3 =
  `[FISC-CONST-LINT]` ci-dessus (déjà au backlog).

**ÉPIC 2 — Exécution & UI**
- [~] **[HARDEN-MC-WORKER]** 🔧 MEDIUM (PARTIEL, ticket 2.1) — `services/projection.worker.ts` + `runProjectionAsync`
  (timeout 30 s) EXISTENT (W1.1). RESTE : vérifier/ajouter le **chunking** (lots 10-50 iter) + un **`onProgress(pct)`** pour
  la barre MC ; évaluer **Comlink** (non installé) pour des types bout-en-bout. DoD : 100 iter × 40 ans sans drop de frame.
- [~] **[HARDEN-SNAPSHOT-RACE]** 🔧 MEDIUM (PARTIEL, ticket 2.2) — le moteur est PUR (zéro mutation d'état partagé, vérifié
  audit) ; `structuredClone` existe déjà au store ; AbortController déjà sur les appels API (claude/finnhub). RESTE :
  garantir un snapshot immuable de l'input AVANT envoi Worker/IA + un AbortController sur le chemin Worker projection.

**ÉPIC 3 — Cycle de vie**
- [x] **[HARDEN-FISCAL-TIMEBOMB]** ✅ MEDIUM (PR #363, 2026-06-18, ticket 3.1) — `utils/fiscalFreshness.ts` (helper pur)
  + `tests/utils/fiscalFreshness.test.ts`. Lit la date « Dernière vérification »/« Ré-audité » la PLUS RÉCENTE de
  `FISCAL_REFERENCE.md` (regex tolérante au gras markdown) et mesure l'ancienneté RELATIVE (pas de `Date.now() < 2027`
  calendaire) : `console.warn` à 12 mois, **échec dur à 18 mois** (généreux → n'interrompt un travail non-fiscal qu'en
  cas de négligence profonde ; la cadence `/audit-financier` l'évite). Date introuvable ⇒ traité comme périmé (pas de
  désamorçage silencieux). Discrimination INTRINSÈQUE : test unitaire avec date périmée synthétique (`now` injecté) →
  `isExpired=true`. 11 tests. Réutilisable pour un futur « warning au build ».
- [x] **[HARDEN-ZUSTAND-MIGRATE]** ✅ DÉJÀ FAIT (ticket 3.2) — `persist` schema **v7** + `migratePersistedState` (v1→v7,
  optional chaining, fallback défaut + dump du localStorage corrompu) + tests `migratePersistedState.test`. Plus avancé
  que le ticket (v2). Rien à faire.

**ÉPIC 4 — Frontières & IA**
- [ ] **[HARDEN-ZOD-GATEKEEP]** 🔧 MEDIUM (nouveau, ticket 4.1) — Zod est utilisé (sorties LLM `safeJsonValidate`, backup)
  mais PAS en gatekeeping systématique des INPUTS UI. Ajouter des schémas stricts (`salary: z.number().min(0)`, `age:
  z.number().min(18).max(100)`…) aux actions Zustand / handlers → le moteur ne reçoit jamais NaN/Infinity/string (défense
  en profondeur en amont du garde NaN du moteur).
- [x] **[HARDEN-AI-CTX]** ✅ DÉJÀ FAIT (ticket 4.2, #319) — `AiAssistant` + Dashboard routent par `computePresentNetWorth`
  (FX réels `fxRates`, dettes soustraites). NB : le NW PRÉSENT utilise `computePresentNetWorth` (pendant de
  `computeRawNetWorth` qui sert le FUTUR/moteur) — garde de parité keystone dans `portfolio.test`.
- [~] **[HARDEN-SAFEBLOCK]** 🔧 LOW (PARTIEL, ticket 4.3, complète SEC-1 #321) — sanitizePromptText + wrapUserData LIVE sur
  toutes les surfaces LLM (l'attaque `</DONNEES>Ignore…` est déjà neutralisée par `neutralizeFrameTags`). RESTE :
  factoriser un helper unique `buildSafeUserBlock(text)` + imposer son usage (idéalement lint) pour qu'une FUTURE surface
  LLM ne puisse pas oublier la protection.


- [x] **[HARDEN-NETWORTH-NAN]** ✅ MEDIUM (PR #372, 2026-06-19) — `computeRawNetWorth` (SOURCE UNIQUE du patrimoine)
  n'avait AUCUNE garde `Number.isFinite` : un terme non fini (`liquid`/`reer` NaN) rendait TOUT le patrimoine NaN →
  graphe vide SANS `logError` (échec silencieux, dette préexistante). Fix : helper module-scope `sumNetWorthParts`
  (formule unique) ; total non fini → chemin lent qui rabat chaque terme fautif sur 0 (itère `NET_WORTH_SIGN`) +
  `logError(source:'projection', {offending})` **throttlé par signature** (hot-path MC, anti-flood localStorage) +
  recalcul. Chemin sain = 1 `Number.isFinite` (formule inchangée). Miroir runtime de `sumActiveDebts`. Discriminant
  prouvé (court-circuit → 4 tests échouent). Panel 3 agents APPROVE (1 finding redaction PII RÉFUTÉ : pattern ancré
  `^debt$` ≠ substring → clés `*Debt` non redactées). 6 tests ajoutés.
- [x] **[FISC-ESTATE-PENSION-NPV]** ✅ MEDIUM (PR #352, 2026-06-18) — NPV des rentes publiques (RRQ/PSV) au bilan
  successoral : montant MENSUEL × facteur d'annuité ANNUEL sans ×12 → ~12× sous-évaluée (~34 k$ au lieu de ~409 k$
  sur 1200 $/mois). Fix = annualiser ×12 avant le facteur (`estateCalculation.ts`). Test discriminant PROUVÉ
  (`git stash` → 6 tests échouent : 48 681 vs 584 180). Panel financial-integrity (×12 = bonne réannualisation,
  +0,67 % vs annuité mensuelle, zéro double-comptage) + projection-validator (12/12 conservation, appel post-sim).
  HYPER_INFLATION re-ciblé sur `finalNetWorth` (rentes indexées = couverture, estate nominal peut dépasser la base
  sous inflation — leçon CLAUDE.md). **Découverte** : 1 LOW silent-failure (voir [ENG-ESTATE-ESTIMATE-FIN] ci-dessous).
- [x] **[ENG-ESTATE-ESTIMATE-FIN]** ✅ LOW (PR #360, 2026-06-18) — `estateCalculation.ts` : `Math.max(0, fin(rrqEstimate
  Monthly))` (idem psv). Un estimé `NaN` zérotait SILENCIEUSEMENT TOUT l'`estateNetWorth` (le `fin()` de sortie
  absorbait le NaN propagé, effaçant même un `finalRawNetWorth` positif). Désormais le NaN est neutralisé à la SOURCE :
  sa rente → 0, l'autre rente + le reste du patrimoine calculent (dégradation gracieuse). Zéro changement sur les cas
  finis (`fin(x)=x`). Discriminant prouvé (`git stash` → NaN rrq zérotait l'estate). Panel silent-failure-hunter : fermé.
- [x] **[FISC-EVENT-INCOMELOSS]** ✅ MEDIUM (PR #354, 2026-06-18) — PERTE_EMPLOI/SABBATIQUE/ACCIDENT étaient un
  NO-OP (le moteur ne lisait que `impactAmount`, absent pour ces types) → une perte d'emploi de 6 mois était
  ignorée. Fix = `computeIncomeLossFactor` (`monthlyEvents.ts`) réduit le revenu MÉNAGE de `incomeLossPercent`%
  pendant `durationMonths` (sémantique Marc : % perdu + durée, défauts 100/100/50). UI dédoublée (% perdu +
  durée) + validation (refuse un événement inerte). Net + brut REER réduits ; **l'impôt salarial de décembre
  N'est PAS réduit** (biais conservateur, identique au chômage stochastique — vérifié empiriquement par le panel).
  Test discriminant prouvé (`git stash` → no-op → patrimoine identique). Conservation : +2 tests moneyConservation
  (50 % + 100 %). Panel 5 agents, tous findings intégrés. **Suite possible** : per-conjoint (sélecteur « qui »).
- [x] **[FISC-RE-SALE-RESIDUAL]** ✅ MEDIUM (PR #368, 2026-06-19) — vente immobilière quasi-underwater (hypo 95-100 %
  de la valeur, les 5 % de frais poussent `saleNet` < 0) : `addLiquid(Math.max(0, saleNet))` (`monthlyEvents.ts`)
  EFFAÇAIT le déficit (patrimoine surévalué de `|saleNet|`). Fix : `addLiquid(saleNet)` → le déficit est DÉDUIT
  (ponctionné du liquide, ou porté en `liquidDebt` visible via PV-6 si liquide épuisé). ΔNW = −5 % de la valeur
  (prouvé algébrique + empirique). Tests : unitaire (`monthlyEvents.test.ts` 50k→40k) + end-to-end conservation
  (`moneyConservation` ΔNW < −13k au mois de vente), DISCRIMINANTS prouvés via `git stash` (ancien −7965). Log
  corrigé (n'affiche plus « +0$ » sur un déficit). Panel 4 agents APPROVE (conservation prouvée, 0 régression).
- [x] **[FISC-RE-CAPITAL-LOSS]** ✅ MEDIUM (PR #371, 2026-06-19) — `monthlyEvents.ts` à la vente d'un LOCATIF sous coût :
  `gain = max(0, produit − coût)` + `if (gain > 0)` IGNORAIT silencieusement la perte en capital réalisée (avantage
  fiscal LIR 111(1)b perdu). Fix : nouveau helper SOURCE UNIQUE `applyCapitalDisposition(state, rawGain signé)` dans
  `portfolioOps.ts` (perte < 0 → banque ; gain ≥ 0 → nette la banque puis impose) ; `handleNonRegSale`/`handleCryptoSale`
  refactorés dessus (zéro duplication) ; mutator immo `realizeCapitalGain` → `realizeCapitalDisposition` (nom honnête,
  gère gain ET perte) + log de la perte. Discriminant prouvé (réintro `Math.max(0)` → test échoue). Panel + 12 invariants
  conservation verts.
- [ ] **[FISC-ASSETLOC-INTL]** 🔧 MEDIUM — asset-location : classe `international` jamais analysée →
  retenue étrangère 15 % en CELI/REER non comptée (`assetLocation.ts:104-132`) ; l'outil dit « optimal »
  alors qu'une perte existe (~375 $/an sur 100 k$ international en CELI). Fix non trivial (le patch naïf
  reste 0 : taxIdeal NonReg=marginalRate domine) — modéliser le coût de détention.
- [x] **[FISC-SRCDED-NOOP]** ✅ **RÉSOLU (2026-06-26, choix Marc) — par RETRAIT du code mort, pas par fix** :
  l'enquête a prouvé que les 2 bugs (ordre + unité) affectaient une valeur **DISCARDÉE** — `computeMonthlyWithholding`
  accumulait dans `taxCurrentYear.revenu`, **jamais appliqué au liquide** (`impotSalaireMois=0`), puis **écrasé par
  l'override de décembre** (V30) avant le règlement d'avril. Preuve : perturbation +999 999/mois → golden PINé +
  2331 tests d'intégration **byte-identiques** (seuls les 2 unitaires DE la fonction cassaient). Le flag T1213
  fonctionne via le chemin DÉCEMBRE (`taxDecember`, V49, correct). « Corriger » = zéro effet → fonction **retirée**
  (résout aussi PERF-WITHHOLDING + gain perf MC). Panel projection-validator (2329/2329) + financial-integrity + code-reviewer ✅.
- [x] **[A11Y-DANGER-300]** ✅ LOW (2026-06-17) — `text-danger-300` n'existait PAS dans `tailwind.config.js` (palette
  danger = 400/500/600 seulement) → couleur ignorée. 3 sites hors périmètre MONEY-PHANTOM :
  `ImportBankStatement.tsx:123`, `RealEstateAdviceCard.tsx:19`, `Transactions.tsx:439` (+ son hover no-op).
  Fix : → `text-danger-400`.
- [x] **[A11Y-MODAL-PRIVATE]** ✅ LOW (2026-06-17) — `FutureDetailModal` entièrement migré vers `<PrivateAmount>`
  (idiome `const blur` ×2 supprimé ; valeur nette, comptes, apports/gains, flux, moments-clés, espace cotisation
  enveloppés). En mode discret → ••• hors DOM. (Livré avec [A11Y-D6-SR-2] ph.3.)

## 🔎 Review multi-agents 2026-06-15 — risques confirmés (27 : 8 HIGH / 11 MEDIUM / 8 LOW)
> Audit complet (12 agents specialises, emphase financiere). Les **HIGH financiers #1-#6 sont en
> correction cette session**. Severite en tete de chaque item.

### Fiscal / moteur (money-critical)
- [x] **[FISC-RRQ-UNIT]** ✅ HIGH (#296, 2026-06-15) — `retirementIncome.ts:151` : `grossSalary` (mensuel) ÷ MGA annuelle → RRQ ~12× trop basse. Corrigé (×12) + test discriminant + panel projection-validator/fiscal-accuracy.
- [x] ~~**[FISC-MARGINAL-YEAR]**~~ ❌ **FAUX POSITIF** (vérifié 2026-06-15, projection-validator) — le finding supposait un revenu NOMINAL ; le moteur passe un revenu RÉEL déflaté (`monthlyCalcs.ts:92-110` : déflation revenu + ré-inflation du `totalTax`). `marginalRate` sur paliers 2026 est donc DÉJÀ correct ; propager `year` introduirait un bug (taux marginal décroissant + casse REER-first/goldens). **NE PAS corriger.**
- [x] **[FISC-WELCOME-UNIFY]** ✅ HIGH (2026-06-16) — taxe de bienvenue unifiée. Décision Marc : champ `RealEstateGoal.municipality` (`'montreal' | 'reste_qc'`, type `Municipality`) requis à la saisie (sélecteur `PropertyConfigurator`), PAS de défaut stocké ; non choisi ⇒ repli conservateur Montréal. SOURCE UNIQUE : `realEstate.ts:calculateWelcomeTax(price, municipality?)` porte les 2 barèmes (MTL 8 tranches→4% / reste QC 4 tranches→2%) ; `helpers.ts:welcomeTax` y délègue (fin du bug C9 « 3 implémentations divergentes »). Param MCP ajouté. Les 2 barèmes transcrits dans `FISCAL_REFERENCE §8`. Panel : fiscal-accuracy/projection-validator/code-reviewer/silent-failure-hunter/a11y-auditor → 0 CRITICAL/HIGH, 2048 tests verts. Restes LOW documentés : seuils provinciaux 2025 à réindexer 2026 ; municipalités hors MTL regroupées dans `reste_qc`.
- [x] **[FISC-SURVIVOR-DRAWDOWN]** ✅ HIGH (#297, 2026-06-15) — `cashflowAllocation.ts` : seuils survivant ×2 → `liveFilers=1` (cohérent taxFilers/oasBeneficiaries) + salaire du défunt exclu. Verdict NUANCE (qualité de stratégie, pas fuite fiscale). Panel projection-validator OK. NB : `meltdownReer.ts` a le même schéma (cible ×N) — voir [FISC-MELTDOWN-SURVIVOR] ci-dessous, opt-in MC, à faire si voulu.
- [x] ~~**[FISC-ACB-RENO]**~~ ❌ **FAUX POSITIF** (vérifié 2026-06-15, fiscal-accuracy) — prémisse fausse : les rénos n'augmentent PAS non plus `currentValue` dans le moteur (croît seulement par `propertyGrowthRate`). `cost` ET `currentValue` ignorent les rénos symétriquement → gain cohérent, pas de surimposition. ⚠️ Le fix suggéré (ajouter rénos à `cost` seul) serait NOCIF (sous-imposition). **NE PAS corriger.** (Sujet séparé hors scope : l'équité/net worth sous-estime les rénos capitalisées → [DETTE-RENO-EQUITY] à créer si voulu.)
- [x] **[FISC-LATENT-RE]** ✅ HIGH (#298, 2026-06-15) — `latentTax.ts` : `realEstateLatentGain` (×50%) ajouté à `totalTaxableLatent`, même Σ que le bilan successoral. Seul `ImpotLatent` d'affichage bouge. Panel projection-validator OK.
- [ ] **[FISC-TAXDEC-INCR]** 🔧 LOW (requalifié de MEDIUM, triage 2026-06-16 — `fixIsSafe:false`) — `taxDecember.ts:694-730` : 3 sous-claims RÉELS mais bornés. (a) crédit d'âge omis sur l'incrément gains/div → ne joue QUE dans la zone d'érosion du crédit (s'annule ailleurs comme le BPA), sous-imposition légère bornée. (b) gains+div empilés depuis la MÊME base (pas en cascade) → sous-imposition d'un retraité gros gains ET gros div franchissant un palier ensemble. (c) FSS sur revenu moyen du couple → **déjà documenté in situ** (taxDecember.ts:653-658, plafond 1 000 $/adulte). ⚠️ **DÉCISION Marc 2026-07-06 À CONFIRMER** — interprétation : OK pour COD ER le fix risqué, ou ok=statu quo / différé ? Avant tout code : clarifier l'intention (fix full vs stay différé + doc). En attente.
- [x] ~~**[FISC-GOVPENSION-SCALE]**~~ ❌ **FAUX POSITIF** (vérifié 2026-06-16, panel projection-validator + fiscal-accuracy + code-reviewer, unanime) — prémisse FAUSSE : `governmentPension` est un AGRÉGAT **MÉNAGE** (RRQ+PSV combinés des 2 conjoints), pas un per-personne. L'absence de ×N est VOULUE et cohérente sur 3 sites (`retirementIncome`, `estateCalculation:177-178`, `setupSimulation:114-118`) + documentée (utils/tax.ts:99, FISCAL_REFERENCE §6) + verrouillée par régression (`estateCalculation.test.ts:131`). Ajouter ×N = ré-introduire le bug FA-5 (couple double-compté) → **NE PAS corriger**. ✅ Corrections sûres faites (2026-06-16) : label UI clarifié « total ménage (couple combiné) » + typo « Etat→État » (`RetirementIncomeCard.tsx:26`) ; rename `rrqBaseIndiv/psvBaseIndiv → …Family` (`retirementIncome.ts`, le nom trompeur avait FABRIQUÉ le faux positif).
- [x] **[FISC-RRQ-PRORATA]** ✅ MEDIUM (2026-06-16) — prorata de résidence RRQ rendu PER-CONJOINT (`retirementIncome.ts`), mirroir de la PSV : `arrivalAge` via `getResidencyStartYear` (corrige aussi le gate `isImmigrant` manquant → RRQ désormais cohérente avec PSV/CELI/REER), poids RRQ = ratio gains/MGA × prorata résidence per-conjoint, split par poids. Couple non-immigrant ⇒ inchangé (zéro régression baseline ; état `canadaArrivalYear` sans `isImmigrant` inatteignable en prod). 3 tests discriminants (symétrie ordre-conjoints — VÉRIFIÉ échouant sur l'ancien code via stash). Triage adversarial : REAL_BUG confirmé (seul vrai bug sur 7 findings vérifiés).
- [x] ~~**[FISC-INFLATION-COUPLING]**~~ ❌ **DOUBLON de ITEM 2a (déjà rejeté Marc)** (triage 2026-06-16) — `tax.ts:673` indexe les paliers ×1,02/an pendant que le revenu est déflaté par `simInflation`. Le fix proposé (« indexer sur `simInflation` ») a été **prouvé numériquement PIRE** (simInflation 5 %/20 ans : ARC ~29 353 $ vs fix ~7 712 $ vs actuel ~22 313 $ — cf HISTORIQUE.md ITEM 2a). Cause : l'aller-retour déflate→impôt→réinflate est lossy (BPA/crédits en $ fixes). Le vrai correctif = impôt sur revenu NOMINAL + paliers indexés `simInflation` (supprime l'aller-retour) = chantier STRUCTUREL ~12 sites → **décision Marc + plan requis**. Documenté FISCAL_REFERENCE §9. **NE PAS appliquer le fix naïf.**
- [ ] **[FISC-SURVIVOR-CAP]** 🔧 LOW (triage 2026-06-16, différé) — `retirementIncome.ts:224` (survivorRrqFactor) : rente de survivant non plafonnée au max RRQ combiné. ⚠️ Cap naïf `Math.min(rrqMonthly, RRQ_MAX)` serait FAUX (un couple a droit à 2 rentes jusqu'au décès) ; le cap doit s'appliquer à la portion d'UN bénéficiaire (RRQ propre survivant + part défunt ≤ max), via `perUserRrqWeight`. Money-critical + peu d'impact → différé.
- [ ] **[FISC-RAP-REPAY]** 🔧 LOW (triage 2026-06-16, hypothèse DOCUMENTÉE, fix différé) — `realEstateMonth.ts:405-414` : remboursement RAP « toujours honoré » (versement manqué reporté en silence, pas d'inclusion ligne 12900 ; solde impayé pas porté au revenu de la déclaration finale). ✅ Limite consignée FISCAL_REFERENCE §9. Fix (inclusion au revenu + passif successoral) `fixIsSafe:false` (risque de double-comptage estate) → différé.
- [ ] **[FISC-CHILDCARE]** 🔧 LOW (triage 2026-06-16, hypothèse DOCUMENTÉE, fix différé) — `childrenReee.ts:199-201` : facteur de coût résiduel 30 % sur garde privée > 400 $/mois = HEURISTIQUE conservatrice, PAS le vrai régime (féd T778 ligne 21400 / QC crédit remboursable dégressif ~67-78 %). ✅ Consigné FISCAL_REFERENCE §9. Précision réelle (déduction/crédit exacts) = travail dédié → différé.
- [x] **[FISC-REEE-CONST]** ✅ LOW (2026-06-16) — valeurs REEE/SCEE/IQEE vérifiées EXACTES (SCEE 20 %/500/1000/7200 ; IQEE 10 %/250/500/3600 ; REEE 50 000 $/bénéficiaire) et **documentées** FISCAL_REFERENCE §7 (REEE — SCEE/IQEE). Reste optionnel : extraire les littéraux en constantes nommées dans `childrenReee.ts` (noté dans la doc, non urgent).
- [x] **[GUARD-NAN]** ✅ LOW (2026-06-16) — garde `Number.isFinite` en tête de `getMarginalRate` (`utils/tax.ts`) : un income non fini est rabattu sur 0 (1er palier, dégradation prévisible) au lieu du taux MAX silencieux. Sans dépendance (tax.ts reste pur, pas de logError importé).

### Accessibilite
- [x] **[A11Y-D6-SR-2]** ✅ HIGH (2026-06-17 — 3 phases livrées + keystone •••) — fuite : le mode privé est lu intégralement par les lecteurs d'écran (masquage CSS seul). **Phase 1 LIVRÉE** : dossier `projection/` migré (`ProjectionTooltip` 13, `ActionPlanDrilldown` 6, `StressTestPanel` 1, `StrategyOptimizerPanel` 3) → `<PrivateAmount>` ; primitives `PrivateAmount`/`PrivateBlock` dotées d'un prop `title` (conserve les infobulles natives). KPIStat était déjà correct. **Phase 2 LIVRÉE (2026-06-16, 5 fichiers div)** : `DividendPanel` 1, `Budget` 3, `Planning` 3, `ChildPlanning` 1, `Investments` 1 → `<PrivateAmount as="div">`. **Phase 3 LIVRÉE (2026-06-17, 16 instances migrées via agent + vérif suite complète)** : `FutureDetailModal` (idiome `const blur` ×2 supprimé), tables `<td>` (`RealEstate` 4 /`Transactions` 2 /`ImportBankStatement` 1 /`ImportBrokerPositions` 2 /`BudgetGroupTable` 2 → wrapper interne `<PrivateAmount>` dans le td). ⚠️ Les 3 `<input>` (`RetirementIncomeCard` ×2, `BudgetGroupTable` ×1) ne sont PAS wrappables par `<PrivateAmount>` (champ éditable) → approche dédiée ou hors scope. ⚠️ Finding a11y-auditor (phase 1) : les 3 infobulles `title` de `ProjectionTooltip` (l.106/119/122, « Écart… », « Dépôts… », « Rendement… ») sur un span au contenu aria-hidden ne sont PAS annoncées de façon fiable par les SR (limite PRÉEXISTANTE, pas une régression) → en phase 2, remplacer `title` par `aria-describedby`/`sr-only` pour que l'explication soit accessible.
- [x] **[A11Y-CHARTS]** ✅ HIGH (2026-06-17 — phases 1+2 COMPLÈTES) — graphes Recharts sans alternative textuelle
  (WCAG 1.1.1 A). **Phase 1** : primitif `<ChartDataTable>` (sr-only, caption + scope + échantillonnage ≤40 +
  mode privé) intégré dans `ZoomableTimeChart` (StockChart + DashboardEvolutionChart). **Phase 2 (3 lots, ~14
  graphes)** : LOT 1 `FutureProjection`/`Retirement` accumulation/`DebtManager` · LOT 2 `RealEstate` scénarios/
  `Investments` 2 donuts/`Budget` donut/`ChildPlanning` coût+REEE · LOT 3 `Retirement` cashflow/`DividendPanel`/
  `MultiPropertyComparison`/`LifeEvents`/`FutureDetailModal` drill-down. Tous → `<ChartDataTable>` sr-only +
  `role="img"` + **masquage privacy-aware** ($ → `Montant masqué` en mode discret ; `%` visibles). Garde-test
  (DebtManager). ⚠️ Seul l'amortissement RealEstate non câblé car DÉJÀ un `<table>` HTML accessible (correct).
- [ ] **[A11Y-INK500]** 🔧 LOW (EN COURS, par lots) — `ink-500` (#6a7689) sur du contenu actif (échec AA normal). Passer à `ink-400` (#8896a8, AA ✅ 5,21-6,42 cf check-contrast). **Avancement** : `TaxBracketViz.tsx` (4 occ., A11Y-TAXBRACKET) + **LOT 1 fait 2026-06-26** = 6 écrans quotidiens (Dashboard/Budget/BudgetGroupTable/Investments/Transactions/Planning), **43 occ. migrées** sur classification a11y-auditor par-occurrence ; **10 GARDÉES** à raison (icônes = seuil 3:1, séparateurs décoratifs, `ⓘ` aria-hidden, 1 cible inactive délibérée `timeView!==MONTH`). ⚠️ PAS un sed global aveugle. **LOT 2 fait 2026-06-26** = LifeEvents/RealEstate/FutureDetailModal/ChildPlanning/retirement(RetirementIncomeCard+AssetLocationCard), **37 occ. migrées** + **8 GARDÉES** (icônes, tabs inactifs, glyphes aria-hidden) ; code-reviewer a aussi corrigé LifeEvents:367 (texte d'empty-state → ink-400) + ajouté `aria-hidden` au `→` AssetLocationCard:215. **RESTE ~37 fichiers / ~105 occ.** (investments/*, projection/*, sidebar/*, setup/*, realestate/*, AdvancedProjectionParams…) → lots suivants.
- [x] **[A11Y-BUDGETTABLE-SELECT-KBD]** ✅ **FAIT (2026-07-07)** — `BudgetGroupTable.tsx` : `focus-within:opacity-100` sur le
  wrapper des `<select>` fréquence/type (l.147) + `focus:opacity-100` sur le bouton supprimer (l.225, `<td>` séparé) → révélés au
  focus clavier (avant : survol souris uniquement). Panel a11y-auditor APPROVE (anneau de focus natif visible, WCAG 2.4.7 OK) +
  code-reviewer (redondance `focus-visible` retirée). ⚠️ Note hors-scope (a11y-auditor) : `BudgetGroupTable:181` (`text-ink-500`
  sur l'input `target` en vue ≠ MONTH) échoue AA sur du texte actif — mais GARDÉ « à raison » au LOT 1 [A11Y-INK500] (« cible
  inactive délibérée ») ; à re-trancher dans le sweep [A11Y-INK500], pas ici.

### Echecs silencieux
- [x] **[SF-PDF]** ✅ MEDIUM (2026-06-16) — `pdfReport.ts` : échec jsPDF routé vers `logError({source:'ui'})` (visible en prod via SystemView) ; repli print conservé.
- [x] **[SF-RESIDUS]** ✅ LOW (2026-06-16) — `StockComparisonModal.tsx:41` (→ network/warning), `FutureProjection.tsx:464` (→ ui/error, context = champs manquants, pas les objets financiers), `TaxCenter.tsx:89` (→ ai/error) routés vers `logError`. `syncOrchestrator.ts` était déjà propre (référence BACKLOG périmée).

### Tests / dette technique
- [x] **[TEST-PROJ-MODULES]** ✅ **PÉRIMÉ/COUVERT (constaté 2026-06-25)** — les 3 modules ONT des tests directs : `projection.assetLocation.test.ts`
  (8), `monthlyOutput.test.ts` (19), `strategyConfig.returnProfile.test.ts` + `strategyConfigRanking.test.ts` (22) = 49 tests. Item ajouté avant
  ces couvertures. (Leçon R2-FIRE : vérifier qu'une tâche n'est pas déjà faite avant de la coder.)
- [x] **[HEALTH-SAVINGS-RATE]** ✅ **FAIT (2026-06-25, reco PM)** — `HealthIndicator.tsx` : le taux d'épargne + le coussin d'urgence
  comptaient les postes ÉPARGNE comme des dépenses → taux ≈ 0 % pour un épargnant, coussin sous-estimé. Helper pur `monthlyConsumptionExpenses`
  (`healthRatios.ts`, exclut `isSavingsNature`, cohérent avec `computeBudgetParityScore`/`Budget.tsx`) + 4 tests. Panel financial-integrity + code-reviewer ✅.
- [x] **[HEALTH-SAVINGS-CONSISTENCY]** ✅ **FAIT (2026-06-26, choix Marc)** — `nature === 'Epargne'` STRICT remplacé par `isSavingsNature`
  (NFD) sur **5 surfaces / 6 sites** : `portfolio.ts:139` (IA/MCP), `NextBestAction.tsx:114`, `useDerivedFinancials.ts:37` (moteur),
  `buildSimulationParams.ts:231` (moteur MCP), + **5ᵉ surface trouvée par le panel** `Budget.tsx:105` (inflation sim) et `:306` (ventilation
  couple, UI-only). Une nature « Épargne » accentuée est désormais exclue des dépenses PARTOUT (avant : comptée en dépense → épargne sous-estimée
  → projection pessimiste). Test discriminant `healthSavingsConsistency.test.ts` (git-stash : 2500→3500 prouvé) + panel financial-integrity +
  projection-validator (conservation 20/20) + silent-failure ✅. `BudgetGroupTable`/`Budget:266,1010` laissés (groupement UI sur l'union typée, pas un calcul de dépense).
- [x] **[DETTE-PDF-FORMAT]** ✅ MEDIUM (2026-06-16) — `pdfReport.ts` : `formatCAD` local retiré → importé de `utils/format` (source unique fr-CA ; bonus : valeurs non finies → '—' au lieu de « NaN $ »). Tests pdfReport/pdfScenarios verts.
- [x] **[DETTE-RE-SALE]** ✅ **FAIT (2026-07-07)** — `monthlyEvents.ts` : vente immo ciblée par `LifeEvent.propertyId`
  (champ additif optionnel, PAS de bump v7) au lieu du `find` premier-bien qui vendait la RP exemptée au lieu du locatif
  imposable (faussait le gain en capital de dizaines de k$). Fallback rétrocompat exact si `propertyId` absent ; fourni SANS
  match → aucune vente (jamais un AUTRE bien). Sélecteur UI (`LifeEvents`, affiché si ≥2 biens actifs, option « Auto »).
  4 tests discriminants (dont symétrie + no-match + fallback) + panel projection-validator (2352/2352, conservation 20/20)/silent-failure/code-reviewer.
- [ ] **[DETTE-RE-SALE-PURGE]** 🔧 LOW (suivi, panel silent-failure 2026-07-07) — supprimer un bien (`RealEstate.tsx doConfirmDeleteGoal`)
  ne purge pas `lifeEvents[].propertyId` qui le référence → vente orpheline. Mitigé : la vente orpheline est SIGNALÉE (`logFlow`
  « vente ignorée : bien introuvable »), pas silencieuse. Fix propre : avertir/purger à la suppression. Effort S.
  ⚠️ **DIFFÉRÉ (sweep 2026-07-07) — ambiguïté design money-adjacent** : purger `propertyId`→`undefined` re-cible l'événement sur le 1ᵉʳ bien à
  équité positive (ANNULE l'intention de [DETTE-RE-SALE] : ne pas vendre le mauvais bien) ; supprimer l'événement = destructif ; avertir = plus de
  câblage store→dialog. Re-cibler une vente = money-critical → mérite une décision délibérée (option A purge/B remove/C warn) + panel, pas un batch.
  État actuel déjà mitigé (logFlow). À trancher avec Marc.
- [x] **[DETTE-DEADCODE]** ✅ **FAIT (2026-06-26)** — RETIRÉ : `runBuyVsRent` (`realEstate.ts`, test-only, zéro call-site prod) + ses
  types `BuyVsRentInput`/`BuyVsRentYear` (servaient QUE lui) + son bloc de test + import ; `buildTestFixtures` (`testFixtures.ts`, wrapper
  de compat jamais appelé) + ses imports devenus inutilisés (le barrel `testFixtures` reste VIVANT : TestModePanel/Layout/PageSetupGate/
  usePortfolioHistory en consomment les re-exports). EXCLUS après vérif : `clearCredentials` (dans `mcp/` → règle « y toucher seulement sur
  demande ») ; façade `getProfile` (méthode du contrat `MarketDataProvider`, implémentée + testée → API délibérée, pas du cruft). Reste du
  bruit knip (GST/QST/SCHL, interfaces, constantes fiscales) NON purgé (règle CLAUDE.md). + **`_buyVsRentData`** (`RealEstate.tsx`, useMemo
  préfixé `_` jamais rendu — vraie courbe UI = `combinedData`) retiré (trouvé par le panel code-reviewer, même feature morte). 2 commentaires
  stale (`testFixtures.ts` en-tête, `coupleConfort.ts`) corrigés. typecheck + build + suite verts.
- [x] **[PLANNING-ANNUAL-SUB-12X]** ✅ **FAIT (2026-06-26)** — `Planning.tsx` : les KPI « Fixe mensuel »/« Coût annuel » sommaient
  `averageAmount` BRUT puis ×12 → un abo ANNUEL compté ×12. Fix : helpers purs `monthlyEquivalent`/`totalMonthlyCost`/`totalYearlyCost`
  (`utils/subscriptions.ts`) dérivés de `yearlyCost` (source de vérité annualisée) + gardes `Number.isFinite`. KPI + ligne d'affichage
  (`formatCAD(monthlyEquivalent(sub))` « /mois ») câblés. 6 tests dont discriminant (annuel : 130 ancien → 20 nouveau). Panel financial-integrity + code-reviewer.
  Follow-up → `PLANNING-ANNUAL-CALENDAR` (un abo ANNUEL apparaît sur le calendrier CHAQUE mois car le filtre ignore le mois ; + label « /an » explicite vs « /mois »).
- [x] **[HEALTH-SUB-DRY]** ✅ **FAIT (2026-07-07)** — `utils/healthRatios.ts:subscriptionsMonthlyCost` délègue au helper canonique
  `totalMonthlyCost` (`utils/subscriptions.ts`). Panel `financial-integrity` : golden santé NE PEUT PAS bouger (identité math `Σ(x/12)=(Σx)/12`,
  écart sous-ULP, `Math.round` sur métrique+score avant affichage) ; garde NaN préservée (par-item dans `totalYearlyCost`). code-reviewer : pas de cycle d'import. APPROVE.
- [x] **[PLANNING-ANNUAL-CALENDAR]** ✅ **FAIT (2026-07-07)** — helpers PURS `isAnnualSubscription` (discriminant ratio `yearlyCost/averageAmount`,
  seuil STRICT 2 = ~annuel ; plus fréquent → défaut mensuel = sur-affichage, jamais masquer une facture) + `subscriptionDueLabel` (`utils/subscriptions.ts`).
  `Planning.tsx` : calendrier filtre les annuels par mois d'échéance (`lastDate.getMonth() === date.getMonth()` de la cellule) ; liste affiche « Le X <mois> · annuel ».
  Panel `financial-integrity` (display seul, `dailyTotal` non consommé par un flux $ ; seuil 2 resserré depuis 6 sur son finding trimestriel) + code-reviewer
  (IIFE extraite en helper testable, double-espace corrigé) APPROVE. 6 tests neufs (seuil, trimestriel, label + date invalide).
  ⚠️ Limite : `RecurringItem` n'a pas de `frequency` → une cadence IA non standard (hebdo/trimestriel) tombe en mensuel (sur-affiché) ; un vrai champ `frequency` serait le fix complet (non requis).
- [ ] **[DETTE-GODFILES]** ⏳ — decouper par barrel : `utils/tax.ts`, `syncOrchestrator.ts`, `Investments.tsx`, `Budget.tsx`, `FutureProjection.tsx`.
- [ ] **[DETTE-UI-PRIMITIVES]** ⏳ — `components/ui/Input|Select|Field` sur les tokens existants ; migrer 16 fichiers a `<input>` inline.

### Performance
- [ ] **[PERF-BOOT]** 🔧 — `App.tsx:401` : `hydrateAssets` `sleep(2500)` sequentiel par actif → pool concurrent borne.
- [x] **[PERF-WITHHOLDING]** ✅ **RÉSOLU (2026-06-26) — par SUPPRESSION, pas mémoïsation** : `computeMonthlyWithholding`
  était du code mort (sortie écrasée par décembre, cf. FISC-SRCDED-NOOP) → retirée. On ne mémoïse pas du code mort, on
  le supprime (gain perf MC réel : 2× `calculateFiscalReport`/mois × chemins MC en moins, pour un résultat jeté).
- [x] **[PERF-BUNDLE]** ✅ **FAIT (2026-07-07)** — 2 des 3 `INEFFECTIVE_DYNAMIC_IMPORT` convertis en import STATIQUE (le module
  était DÉJÀ en boot, le dynamic import ne créait aucun chunk) : `lockedProjectionStore` (`App.tsx`, boot via le store) + `backupAuto`
  (`syncOrchestrator.ts`, boot via `App.tsx initAutoBackup`). Le 3ᵉ (`claude.ts`) est GARDÉ dynamique **à dessein** : ses consommateurs
  sont lazy (TabRouter) → le SDK Anthropic vit dans les chunks lazy, PAS en boot ; le rendre statique le tirerait en boot = régression
  (vérifié : boot 99,8 kB gzip inchangé, warnings 3→1). Panel code-reviewer + silent-failure-hunter. Zéro régression (branches d'erreur préservées).
- [x] **[PERF-MISSINGDATA]** ✅ **FAIT (2026-07-07)** — `components/ui/MissingDataBanner.tsx` (`MissingDataChecklist`) : le full-store
  `useFinanceStore()` remplacé par un sélecteur `useShallow` sur le tableau DÉRIVÉ des champs manquants → re-render seulement quand
  l'ENSEMBLE change (plus à chaque écriture du calcul MC). Panel code-reviewer + silent-failure-hunter. 20 tests verts.

### Securite (deja connu / Marc)
- [x] **[DEP-UNDICI]** ✅ **RÉSOLU/PÉRIMÉ (constaté 2026-06-25)** — le `package-lock.json` est DÉJÀ à `undici 7.28.0` (= le fix des 2 alertes
  Dependabot, plage vulnérable `>= 7.0.0, < 7.28.0`), `node_modules/undici` = 7.28.0, `npm audit` = **0 vulnérabilité** (dev + prod). Les
  entrées `undici-types` du lock sont un AUTRE package (types TS, non vulnérable). Plus aucune action — bump déjà appliqué au lock.
  - **Risque réel FAIBLE** : dev-only (jamais bundlé en prod ; pas de ProxyAgent SOCKS5 ni de cache HTTP partagé dans notre usage) — mais à patcher pour vider les alertes.
  - **Action = merger la PR Dependabot existante** [#366](https://github.com/MoKarade/FinanceAI/pull/366) (`build(deps-dev): bump undici 7.25.0→7.28.0`) une fois la CI verte → ferme les 2 alertes. Pur lockfile, zéro code.
  - **Cadence** (cf `rules/toolkit/dependency-management.md`) : revue Dependabot hebdo, patchs HIGH ≤ 7 j. Décision Marc : merger #366 maintenant ou l'inclure dans la prochaine revue de deps.
- [x] **[BACKUP-PASSPHRASE]** ✅ LOW (2026-06-17) — `BackupPanel.tsx` : TOUS les seuils (export/import, label, boutons) alignés sur `MIN_PASSPHRASE_LENGTH` (12, importé de `syncOrchestrator` comme `PassphraseGate`). Fin de l'incohérence export-12/import-8 (l'import acceptait des passphrases de 8).

---

## 🔬 Panel agents — validation Phase 5 (2026-06-17, findings sur #322-324 + surfaces touchées)
> Issus du test empirique du nouvel environnement d'agents (PR #325). Vrais findings sur du code DÉJÀ mergé
> (l'audit money-critical précédent visait le $, pas la résilience SDK / l'UX / la vie privée / l'a11y).
> Aucun CRITIQUE/ÉLEVÉ. Sévérité en tête.

### IA / SDK Anthropic (ai-reviewer)
- [x] **[NBA-CACHE-STALE]** ✅ MEDIUM (2026-06-17, BATCH2b) — `snapshotSig()` (netWorth arrondi + revenu + dépenses + nb dettes/objectifs + couple) stockée avec le cache ; `readCache(sig)` invalide si la signature diffère → plus de conseils basés sur un profil périmé. Rétro-compat : ancien cache sans `sig` valide par TTL, réécrit au 1er fetch.
- [x] **[AI-VISION-TIMEOUT]** ✅ MEDIUM (2026-06-17, BATCH2a) — `analyzePayslip` + `analyzeBankStatement` bornés par `makeTimeoutSignal(undefined, 90_000)` + `{ signal }` passé à `messages.create` + `cleanup()` → abort au timeout, fin du spinner infini.
- [x] ~~**[AI-SNAPSHOT-DUP]** (fix d'origine)~~ ✅ RÉSIDUS RÉSOLUS AILLEURS (vérifié 2026-07-29) : une SEULE `interface FinancialSnapshot` subsiste (financialSnapshot.ts — la collision de nom a disparu) et `buildFinancialSnapshot` a désormais un consommateur RUNTIME (`buildFinancialOverview` → MCP + financialSignals, plus du code mort). ⚠️ **PRÉMISSE FAUSSE** (vérifié 2026-06-17, lecture du code) — les 2 `FinancialSnapshot` ne sont PAS identiques (`claude.ts` = `topDebts`/`activeGoals`/âges/soldes ; `financialSnapshot.ts` = `totalDebt`/`userCount`) et `buildFinancialSnapshot` n'est appelé par AUCUN runtime (def + tests + docs seulement). Le fix naïf (NextBestAction appelle `buildFinancialSnapshot`) serait FAUX (shapes incompatibles). **Résidu RÉEL restreint** : (a) collision de NOM entre 2 interfaces → en renommer une (`FinancialOverviewSnapshot` ?) ; (b) `buildFinancialSnapshot` = dead code → vérifier/supprimer (lié [CA-01]). NE PAS appliquer le fix d'origine.
- [x] **[AI-NBA-MODEL]** ✅ LOW (2026-06-17, BATCH2a) — `getNextBestActions` `temperature:0` (actions déterministes) + `impact_estimate` borné `.max(60)` Zod + disclaimer UI « Recommandations générées par IA — à valider ». Modèle gardé Haiku (suffisant + caché 1h). `safeParse` cosmétique NON fait (le `schema.parse` est dans un try/catch testé qui retourne null = correct ; le changer = risque pour 0 gain).

### Vie privée — Loi 25 / RGPD (security-privacy)
- [x] **[PRIV-NBA-CACHE]** ✅ MEDIUM (2026-06-17, BATCH2b) — `purgeCache()` appelé quand le profil est vidé / déconnecté (`!apiKey || !hasData`) → la PII dérivée (conseils IA) ne reste plus en clair dans localStorage après un reset/déconnexion (Loi 25). + invalidation par signature (cf NBA-CACHE-STALE) limite la fuite inter-profil. Chiffrement IDB du cache = optionnel (non fait : purge + sig suffisent pour le risque, conseils = dérivés bornés).
- [x] **[PRIV-AI-MINIMIZE]** ✅ LOW (2026-06-17, BATCH2a) — `deadline` tronquée à l'ANNÉE (`slice(0,4)`) avant envoi à Anthropic. ⚠️ Âge GARDÉ exact (décision) : matériellement utilisé pour les règles fiscales QC (RAP/CELIAPP, crédits 65+, conversion FERR à 71) → l'arrondir dégraderait le conseil. À rebander seulement si Marc préfère la confidentialité à la précision sur l'âge.

### Doc inline / a11y (code-reviewer, a11y-auditor)
- [x] **[DOC-L4-JSDOC]** ✅ LOW (2026-06-17) — `financialSnapshot.ts` JSDoc corrigé : dépenses NORMALISÉES (`computeMonthlyBudgetAggregates`, hors épargne) + NW via `computePresentNetWorth`. Fin de la fausse spec post-L4.
- [x] **[A11Y-TAXBRACKET]** ✅ MEDIUM (2026-06-17, Vague 2) — `TaxBracketViz.tsx` : (a) `role="img"` + `aria-label` (revenu+marginal) sur les barres, contenu visuel interne `aria-hidden` (lève l'ambiguïté inter-AT en plus du role), + `<ChartDataTable>` sr-only (ladder des paliers from→to + taux) par juridiction ; (b) `<h4>`→`<h3>` (la `Card` émet h2 → fin du saut) ; (c) 4× `ink-500`→`ink-400` — contraste VÉRIFIÉ empiriquement (`check-contrast` : ink-400 #8896a8 = 5,21-6,42 ✅ AA, ink-500 #6a7689 = 3,41-4,20 ❌ ; la numérotation ink va du CLAIR au foncé, donc ink-400 contraste PLUS sur fond sombre). Test `TaxBracketViz.a11y.test.tsx` (4 cas) + couvert par `pages.axe.test.tsx`. **Suivi LOW (optionnel)** : la table sr-only liste le ladder mais pas l'impôt $/palier (dispo via `<details>` natif accessible) ni un marqueur « tranche active » → enrichissement futur, PAS un échec WCAG (vérifié a11y-auditor).

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
- [x] **[PH1-b]** ✅ **CADUC — Cloudflare retiré 2026-06-16** (Access + proxy DNS dé-proxifié). Auth = gate Google in-app. Fermé.
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
- [x] **[PH2-c-1]** ✅ — fetch Finnhub de `usePastPortfolioHistory` DÉDUPLIQUÉ AU NIVEAU MODULE
  (cache + signatures de lot + `useSyncExternalStore` partagés entre instances) : 1 seul fetch par lot
  quel que soit le nombre d'instances, résultat poussé à toutes (jonction passé↔futur cohérente), et un
  fetch en vol SURVIT au démontage d'une instance. Tests : 2 instances → 1 appel ; montage tardif →
  servi du cache (tests/hooks/usePastPortfolioHistory.dedup.test.tsx).
- [x] **[PH2-c-2]** ✅ — `ProjectionStaleBanner` (composant partagé, role=status) rendu dans Dashboard/
  Investissement/Budget/Retraite : bandeau discret quand `projectionStatus === 'error'` (« les chiffres
  affichés datent du dernier calcul réussi »). Câblé sur `projectionStatus === 'error'` dans Dashboard/Investissement/
  Budget/Retraite → bandeau discret « projection possiblement périmée (dernier recalcul échoué) » au-
  dessus de la courbe conservée. Aujourd'hui l'erreur n'est visible QUE sur Futur (pré-existant, mais
  PH2-c fournit enfin le véhicule `projectionStatus` pour corriger).
- [x] **[PH2-c-3]** ✅ (perf) Router le calcul DÉTERMINISTE dans le worker hors-Futur : en mode
  déterministe (runMC=false), le moteur app-level paie ~150 ms main-thread à chaque changement de
  params quel que soit l'onglet (atténué par debounce 300 ms ; défaut = MC déjà off-thread).
- [x] **[PH2-c-4]** ✅ — tests/hooks/useSimulationParams.parity.test.tsx : renderHook du hook RÉEL
  comparé à `buildSimulationParamsFromState` (même startYear/startMonth), pour CHAQUE persona (7/7).

#### Suivis PH2-d (découverts à la revue panel PR #242 — non bloquants, le verrou est livré)
- [x] **[PH2-d-1]** ✅ (Marc a tranché = AVERTIR) — `loadLockedProjection` retourne désormais un statut
  DISCRIMINÉ (`ok` / `empty` / `unreadable`) ; au boot, `unreadable` (entrée présente mais clé device
  disparue / blob altéré) → `showToast` « Ta courbe verrouillée n'a pas pu être restaurée… » (jumeau de
  `decrypt_failed`). `empty` (rien stocké OU erreur d'accès IDB transitoire) reste silencieux. Test verrou OK.
- [x] **[PH2-d-2]** ✅ — `ExpertTooltip` affiche le bloc « 🔒 Verrouillée » au survol (valeur figée +
  écart vs live, `privacy-blur`), conditionnel à `displayData.lockedNetWorth` (présent sous verrou).
- [x] **[PH2-d-3]** ✅ — aire CELIAPP ajoutée au stack Retraite + métrique verrouillée recomplétée (CELIAPP inclus) ; reste l'alternative texte SR (hors PH2-d, global). Ex-périmètre (pré-existant) Graphe Retraite : le stack d'aires VISIBLE omet CELIAPP (4 aires)
  alors que `TotalCapital` l'inclut (5) — d'où la métrique verrouillée alignée sur le stack (sans CELIAPP)
  en attendant. Ajouter l'aire CELIAPP au stack (+ légende native `iconType` reflétant le tireté) ;
  + à terme, alternative TEXTE/table SR aux graphes (manque global, hors PH2-d).
- [x] **[PH2-d-4]** ✅ — en-tête secureKeyStore mis à jour (3 payloads : clés API + backups + courbe verrouillée). (doc) En-tête `secureKeyStore.ts` : la clé de device chiffre désormais 3 payloads
  (clés API + backups + courbe verrouillée) — mettre à jour le commentaire.

#### Suivi PV-11 (validation projection-validator — réserve documentée)
- [ ] **[PV-11e]** 🧪 (réserve MOYEN du validator) — `withdrawalREER` du goalMutator alimente AUSSI
  `stepReerByUser` (attribution fiscale per-conjoint, taxDecember Phase 2 ACTIVE) : dans la fenêtre
  couple INÉGAL + goal REER + cotisation REER le MÊME mois, le registre per-conjoint bouge légèrement
  (micro-réalignement ASSUMÉ — plus correct : aligne le décrément sur la clé fiscale déjà utilisée).
  Baselines inchangées (1927/1927). À pinner par un test couple-inégal+goal-REER+cotisation simultanée.
  NOTE : goalShortfallTotal agrège des $ NOMINAUX d'années différentes (sémantique à documenter à l'UI).

### Phase 3 — MODÈLE DE DONNÉES + ONGLET PROFIL ⏳ (plan-first) — dépend de : OK Marc post-PH2
- [x] **[PH3-a]** ✅ (PR Phase 3) — onglet **Profil** unifié (`components/Profile.tsx` + Tab.PROFILE) qui
  COMPOSE tous les éditeurs de setup (UsersCard, UserConfigFields salary/fiscal/detailed/children,
  RepartitionField, RetirementSettingsCard, RetirementIncomeCard). Retirés de Config/Impôts/Budget/
  Enfant/Retraite → pointeur `ProfileFieldsMoved`. Mêmes clés store → zéro perte. **Critères ✓.**
- [x] **[PH3-b]** ✅ (PR Phase 3) — `SetupHub` rendu en tête de Profil : **% de complétion GLOBAL**
  (infos met/total + barre de progression) + par onglet « X/N » + quelle info manque + « Ouvrir »
  (navigateWithFocus). **Critères ✓.**
- [x] **[PH3-c]** ✅ (PR PH3-c) — 19 champs morts PURGÉS (contre-audit repo COMPLET : aucun consommateur ; types compagnons orphelins retirés ; UI detailed → « Carrière & rémunération variable ») ; 5 gardés commentés avec consommateur prouvé ; ZÉRO migration persist (résiduels inertes documentés). Découvertes → PH3-c-bis. Audit initial (2026-06-11) : NON consommés
  par `services/` (moteur) → gender, province, citizenship, maritalStatus, employmentType, yearsOfExperience,
  pensionPlan, promotionLikelihood5Y, healthRating, isSmoker, bmiCategory, chronicConditions, activityLevel,
  parentAgeAtDeath, bonusVolatilityPct, stockOptionsValue, commissionPctOfGross, cryptoStakingAnnual,
  payFrequency. CONSOMMÉS (garder) → industry, bonusPctOfGross, rsuVestingPerYear, rsuYearsRemaining,
  sideIncomeAnnual. ⚠️ **RESTE (soigné, séparé)** : vérifier consommateurs HORS `services/` (UI + surtout
  `province`/`maritalStatus` potentiellement fiscaux) + migration persist propre. Money/tax-sensible → pas à la va-vite.
- [x] **[PH3-d]** ✅ (PR Phase 3) — Retraite ne contient PLUS d'éditeur de profil/vie (« Parametres de Vie »
  + « Revenus & besoins » extraits → `RetirementIncomeCard` dans Profil) ; lecteurs/graphes conservés ;
  `lifeExpectancy` reste lu du store. **Critères ✓.**
- [x] **[A11Y-LBL]** ✅ — 18 associations posées : htmlFor/id sur RetirementIncomeCard (8),
  RetirementSettingsCard (5), UserConfigFields salary (2×idx), UsersCard nom/âge (2×idx) ;
  aria-label sur le select RepartitionField + l'input « Nom du profil ». Reste la dette
  hors-Profil (8/30 fichiers htmlFor) — opportuniste.
- [x] **[DEAD-FLT-2]** ✅ PÉRIMÉ/RÉSOLU AILLEURS (vérifié 2026-07-29, leçon PM-STALE-BACKLOG) — le stub `fetchPortfolioHistory` a été RETIRÉ par [PORTFOLIO-HISTORY] 2026-07-22 (grep : seuls des commentaires historiques le mentionnent). Ex : purger toute la CHAÎNE du stub `fetchPortfolioHistory`
  (`services/finance.ts` return []) : consumers restants = StockComparisonModal (+ son
  `.catch(console.warn)` à router logError), `hooks/usePortfolioHistory`, `fetchAssetHistory`.
- [x] **[DEAD-FLT]** ✅ — bloc `fetchLiveTotals` purgé (45 lignes mortes : l'async ne tournait
  JAMAIS, stub `[]`) → `liveCSVBalances` est un simple useMemo des props (mêmes valeurs réelles
  qu'avant). Imports/destructures morts nettoyés (useState/useEffect/fetchPortfolioHistory/logError/
  RegisteredAccountType/assets).
- [x] **[SF-WARN]** ✅ — fetchLiveTotals (Retirement) + restore profils (UsersCard) routés vers logError (source network/storage). (revue #244, pré-existant) — `Retirement.tsx` fetchLiveTotals + `UsersCard.tsx`
  restore : `console.warn` sur de vrais échecs I/O → router vers `logError` (convention repo).
- [x] **[CPL-1]** ✅ (signalé Marc 2026-06-11) — switch individuel↔couple GATÉ : « + Ajouter conjoint »
  ouvre désormais un FORMULAIRE de définition (nom + âge REQUIS, salaire optionnel, bouton disabled sinon)
  + avertissement explicite « passer en couple change les calculs » — plus de placeholder silencieux
  (age 30/salaires 0). **Diagnostic calculs** (tests/services/coupleParity.test.ts) : en mode RÉEL, un
  conjoint vide = ZÉRO revenu fantôme (computeIncomeBaseline neutre — le ×1.35 ne s'applique qu'à un net
  non nul) ; la différence de courbes venait des RENTES D'ÉTAT/fiscalité du placeholder (PSV/SRG à ses
  65 ans, imposition 2 têtes) — effets LÉGITIMES pour un vrai conjoint même sans revenu → PAS de
  neutralisation moteur (elle fausserait les vrais couples), le gate UX est la correction. Le split
  théorique 55/45 (useTheoretical) documenté au test. ⚠️ Reste à VALIDER par Marc en visuel : créer un
  conjoint réel sans revenu DOIT changer les courbes (rentes d'État du conjoint) — c'est voulu.

#### Suivis PH3-c (découvertes du contre-audit)
- [~] **[PH3-c-bis]** PARTIEL — ✅ **`User.industry` PURGÉ** (PR R5/#377, 2026-06-19, décision Marc) : `type Industry` +
  champ `User.industry` + `<select>` `UserConfigFields` retirés ; zéro consommateur services/, zéro migration (politique PH3-c :
  résiduel persisté ignoré) ; typecheck clean, 0 ref résiduelle. **RESTE** : `ProjectionConfig.futureProvince/MoveYear` (W2.7,
  orphelins — auditer) · `rsuYearsRemaining` (consommé moteur mais SANS éditeur UI, défaut 99 ans — ajouter l'éditeur ou retirer du moteur).

#### Phase 4 — onglet FUTUR « leviers-d'abord » (en cours)
- [x] **[PH4-FUT-A]** ✅ (PR-A) — calcul-sur-clic + retrait des « plans ». La courbe ET le bandeau
  KPI ne s'affichent QUE sur clic « Calculer » (signe `params` ENTIER → aucune entrée ne met la courbe
  à jour en douce ; état « périmé » si une entrée change après calcul). Mode « Test rapide » (5
  stratégies-types / RobustnessPanel) RETIRÉ → l'Optimisation montre directement les leviers (recherche
  Monte-Carlo). Chaîne morte robustesse purgée (strategyRobustness.ts, runRobustnessRankingAsync,
  branche worker 'robustness'). Panel : code-reviewer (MAJEUR signature corrigé), silent-failure (RAS),
  a11y (propre, aria-busy ajouté).
- [x] **[PH4-FUT-B-1]** ✅ #251 — levier **Profil de rendement** (conservateur/équilibré/agressif → presets
  returnRates ; 'balanced' = inchangé, non-régression). Helper partagé recherche↔courbe. 20 tests, monotonie.
- [x] **[PH4-FUT-B-2]** ✅ (PR-B2) — levier **Fractionnement pension 65+** ON/OFF (gate la Phase 3 de
  taxDecember ; défaut actif = historique ; false = conservateur/légal). Panel fiscal-accuracy RAS, baselines
  intactes. Tests : unitaire (actif 20k < inactif 32,5k) + cohérence configToEngine + non-régression.
- [x] **[PH4-FUT-B-3]** ✅ (PR-B3) — levier **Taux d'épargne** (multiplicateur 0.9/1/1.2). Modèle :
  multiplie l'épargne RÉELLE positive (net−dépenses), réduit les dépenses d'autant (conservation revenu
  net, surplus investi) ; mode réel + épargne>0 seulement (déficit = inerte) ; défaut 1 = non-régression.
  Tests : non-régression bit-près + monotonie + déficit inerte + cohérence configToEngine. Baselines intactes.
- [x] **[PH4-FUT-B-4]** ✅ (PR-B4) — levier **Downsizing immo retraite** (choix Marc : vendre + racheter
  plus petit, à l'âge de retraite). Au mois de retraite, la résidence principale libère DOWNSIZE_RELEASE_PCT
  (40 %) de l'équité en placements, garde 60 % dans un bien payé cash (hypothèque 0) ; EXEMPTION gain
  résidence principale (ARC) ; gardes underwater/locataire/une-seule-fois. Tests unitaires (effet/non-rég/
  underwater/locataire) + baselines intactes. → **PH4-FUT-B COMPLET (4/4 leviers livrés #251-#254).**

#### Suivis fiscaux (découverts au panel PH4-FUT-B-4)
- [x] **[RE-GAIN]** ✅ mergé #260 (vente) + #261 (succession) — le gain en capital immobilier d'un **locatif**
  (≠ résidence principale) n'est PAS modélisé à la disposition : la vente générique
  (`monthlyEvents.ts` `name.includes('vente')`) libère le net SANS réaliser de gain imposable et SANS
  tester `isPrimaryResidence` ; à la succession (`estateCalculation.ts`) `realEstateEquity` entre sans
  impôt latent immobilier. Préexistant (hors PH4-FUT-B-4, qui borne correctement le downsizing à la RP).
  Fix : taxer le gain locatif (inclusion 50 %) à la vente/succession ; documenté FISCAL_REFERENCE §8.

- [x] **[PH4-FUT-TEST]** ✅ — test RTL du chemin `applyAndReveal` (Futur leviers-d'abord) :
  clic « Appliquer » → courbe révélée (strip KPI + « Ré-optimiser »), amorçage disparu, `isStale` reste
  faux (preuve du batching des 2 setAppState) + le geste coule au store (emergencyFundMonths/profil/rentes) ;
  2e test : « Ré-optimiser » re-cache la courbe. `tests/components/FutureProjection.applyReveal.test.tsx`.

### Phase 4 — REFONTES ⏳ (UN plan SÉPARÉ par onglet → OK Marc par onglet) — dépend de : PH2 (+PH3 pour FUT/RET)
- [x] **[PH4-FUT]** ✅ Refonte **Futur** « leviers-d'abord » LIVRÉE (#250 calcul-sur-clic+retrait plans ;
  #251-254 4 leviers ; #268 composeur EN AMONT ; #269 « Hypothèses »+ordre retrait AUTO ; #270 annotations
  courbe retraite/rentes/épuisement). Conseils déclinés mois→année = déjà ActionPlanDrilldown. Robustesse =
  l'optimiseur MC. RESTE optionnel : remonter un résumé « prochaines actions » sur la vue Projection (cadrage Marc).
  --- (ancien détail) leviers OBLIGATOIRES avant calcul (l'actuel contenu
  d'Optimisation remonte en amont) ; la courbe affichée = toujours la MEILLEURE selon les leviers ;
  après calcul, choix parmi les courbes retenues puis VERROUILLAGE (PH2-d) ; stratégie de retrait
  AUTO (retirée des paramètres) ; spécificités de la stratégie optimale en langage « qu'un enfant
  comprenne » + ANNOTÉES sur la courbe (**Q1 à poser avant de coder**) ; onglet Paramètres revu
  (moins de texte, previews d'effet, RENOMMÉ) ; « Robustesse » = levier du calcul de départ (retirée
  d'Optimisation) ; stress tests déplacés dans Paramètres ; Optimisation visible seulement à la 1re
  ouverture puis dépliable ; BEAUCOUP plus de leviers, calcul accéléré mais représentatif ; conseils
  du plan d'action REMONTÉS (pas enterrés en bas), clarifiés, déclinés mois/trimestre/semestre/année.
- [x] **[PH4-TX]** ✅ #257 — tri par date/marchand/montant/catégorie (en-têtes cliquables, aria-sort).
  🧭 Reste = refonte visuelle profonde (design → cadrage Marc).
- [ ] **[PH4-BUD]** 🧭 Refonte **Budget** complète — DESIGN, besoin du cadrage Marc (irritants concrets).
  Budget déjà sain techniquement (source unique lastProjection). Routé → `A_FAIRE_MOI`.
- [x] **[PH4-INV]** ✅ Refonte **Investissement** LIVRÉE — #255 autocomplétion à la frappe (Finnhub
  symbol search, debounce + anti-race) ; #256 allocation sur données RÉELLES (`assets`, plus le CSV
  déprécié) + dividendes réels (priorité `Asset.dividendYield/dividendFreq`) ; #259 moins de pages
  (4 → 3 sous-onglets, rééquilibrage fusionné dans l'allocation). 🧭 Reste = polish design (cadrage Marc).
- [x] **[PH4-RET]** ✅ #258 — courbes = source unique (acquis PH2-c) ; invite ProjectionRequired (CSV
  déprécié retiré). 🧭 Reste = lisibilité (design → cadrage Marc).

## 🚨 P0 — Bloquant pour un vrai produit multi-utilisateurs
> ⚠️ **Décision 2026-07-06 (Marc)** : app SOLO — multi-user REMISÉ indéfiniment (focus qualité AAA). Items P0 relus
> sous cet angle : **sync Drive + gate Google = multi-APPAREILS de Marc** (pas multi-user public). `docs/decisions.md`
> ADR-002, `docs/VISION.md` cap produit.

- [~] **[P0-PROXY]** 🔧 Proxy backend pour la clé Anthropic — **Phases 1-2 LIVRÉES dark-launch** (2026-07-06) :
  relais BYOK (clé chiffrée, Edge Vercel, anti-abus). **Code livré** : `api/_lib/relay.ts` (proxy cœur +
  allowlist modèles/clamp/no-store/annulation chaînée/zéro log), `api/claude/[...path].ts` (route Edge),
  middleware Vite (dev), makeClient switch kind text/vision, 13 tests. **RESTE** : (a) Marc pose 2 env Vercel
  (PROXY_ACCESS_TOKEN serveur + VITE_PROXY_ACCESS_TOKEN build) → redéploie ; (b) smoke test via flag
  VITE_CLAUDE_TRANSPORT=proxy basculable (défaut direct pour Vision, switch relais phase 4) ; (c) spike Vision
  (~13 Mo/90 s vs limites Edge ~10 Mo). *Cf* `A_FAIRE_MOI` O4.
- [ ] **[P0-IDB]** 🔧 Migrer la persistance `localStorage` → IndexedDB (quota ~5 Mo + parsing
  synchrone bloquant au boot). ⚠️ Migration du schéma persist v7 — vigilance corruption.
- [ ] **[P0-SYNC]** 👤 Prouver la sync Drive en réel : créer `VITE_GOOGLE_CLIENT_ID`, tester en
  fenêtre privée (cf `A_FAIRE_MOI` O3 + tests manuels ci-dessous).
- [x] **[P0-AUTH]** ✅ (2026-06-16) — **Cloudflare RETIRÉ de FinanceAI**, gate Google in-app actif. Marc a :
  créé l'OAuth client + posé `VITE_GOOGLE_CLIENT_ID`+`VITE_GOOGLE_GATE=1` (Vercel) + validé (login + données +
  anti-lockout + pas de re-login) + supprimé l'app Cloudflare Access + dé-proxifié apex/www (DNS only → Vercel).
  Piège rencontré : le client OAuth était PARTAGÉ avec CF Access (flux serveur, redirect_uri `cdn-cgi/access/callback`)
  → l'avoir retiré cassait le login CF (`redirect_uri_mismatch`) ; restauré le temps de valider, puis CF retiré.
- [x] **[CF-CODE]** ✅ (2026-06-16) — retrait code-side : CSP nettoyée (`cloudflareinsights` retiré de
  `vercel.json` + `index.html`) ; commentaires périmés MAJ (`secureKeyStore.ts` — la sécu ne repose plus sur CF
  Access, le gate est SOFT + clé par-appareil ; `App.tsx`, `lazyWithRetry.tsx`) ; docs MAJ (CLAUDE.md, A_FAIRE_MOI O1).
  **RESTE optionnel (durcissement gate, séparé)** : bouton « se déconnecter », sélecteur de compte
  `prompt:'select_account'` (aide [PROFIL-SWITCH]), indicateur de sync, client OAuth DÉDIÉ au gate (découpler de CF).

## 🆕 Signalements Marc (2026-06-16)
- [ ] **[PROFIL-SWITCH]** 🔧 HIGH (data-sensible) — le switch entre comptes/profils est compliqué et
  instable : (a) **fuite** — garde en mémoire des infos des profils de TEST après changement ;
  (b) choix de profil **pas assez explicite** (on ne voit pas clairement lequel/quel type est actif) ;
  (c) calculs **pas assez précis/sûrs** selon le profil actif ; (d) **mauvaise sauvegarde** des données.
  Plan : **reset COMPLET à chaque switch** (auditer `personaResetBase`/`personaReset` — visiblement laisse
  passer des données test ; cf #217 mode test persisté) ; **sélecteur explicite** (nom + type réel/test +
  bannière persistante du profil actif + confirmation au changement) ; **persistance isolée par profil**
  (clé storage par profil, pas d'écrasement croisé, vérif d'intégrité au chargement) ; garde-fou « quel
  profil/hypothèses alimentent ces chiffres ». ⚠️ Touche la persistance (schéma v7) → vigilance corruption,
  lié à [P0-IDB]. Plan-first + panel avant de coder (data-critical). *Cadrage à confirmer/préciser par Marc.*
- [~] **[RECH-ACTION-UX]** ◑ MEDIUM PARTIEL (PR #355, 2026-06-18) — (1) ✅ dropdown d'autocomplétion **agrandi**
  (`max-h-64`→`80`) ; (2) **cause la plus évidente corrigée + TESTÉE** : Escape fermait toute la modale (le `Modal`
  écoute Escape sur `document`) → désormais Escape ferme le DROPDOWN sans fermer la fenêtre (`stopPropagation` +
  `stopImmediatePropagation`, test composant prouve `onClose` non appelé). ⚠️ Le symptôme EXACT « sélectionner le
  prix fait quitter » n'a pas pu être reproduit en navigateur (le dropdown exige une clé Finnhub absente en dev) →
  **confirmation visuelle Marc requise** (routé `A_FAIRE_MOI`). Le fallback FINNHUB-MISMATCH ci-dessous améliore
  aussi le ressenti « sélection → coincé ».
- [x] **[FINNHUB-MISMATCH]** ✅ MEDIUM (PR #355, 2026-06-18) — l'autocomplétion Finnhub `/search` proposait des
  symboles que le `/quote` du forfait gratuit ne sait pas coter (TSX/étrangers) → erreur sèche « introuvable ».
  Fix : `selectSuggestion` bascule en **saisie manuelle pré-remplie** (symbole+nom) + notice informatif quand
  le symbole n'a pas de cours (`'no-quote'`). Panel : distinction `'no-quote'` (fallback) vs `'error'` réseau
  (erreur VISIBLE, pas de masquage silencieux — silent-failure-hunter HIGH intégré). 3 tests composant.

## 🧭 Décisions moteur (à trancher avec Marc — money-critical)
- [ ] **[ITEM-2A]** 🧭→🔧 **APPROCHE VALIDÉE PAR MARC (2026-06-16)** : entreprendre le refactor « impôt
  NOMINAL » (revenu nominal + paliers/BPA/crédits indexés par `simInflation`, supprime l'aller-retour
  déflate→impôt→réinflate lossy). **Phase 0 FAITE** (2026-06-16) : test de caractérisation
  `tests/services/tax.item2a.characterization.test.ts` qui PIN le comportement actuel (filet golden — ex.
  impôt 100 k$ : 25 510 $ en 2026 → 20 355 $ en 2046, dérive ~5,2 k$ du 1,02 en dur), zéro changement moteur.
  **RESTE** : **Phase 1** — paramétrer `getIndexedBracketsForYear(year, rate)` + threader le `rate` dans
  `calculateFiscalReport` ET ses sous-calculs indexés (BPA, `calculateAgeAndPensionCredits`, FSS, RAMQ),
  défaut 0,02 (additif, zéro régression) ; **Phase 2** — basculer les ~10 sites d'appel sur revenu nominal +
  `simInflation`, retirer les déflations (`monthlyCalcs.ts:92-110`, latentTax, retirementIncome, taxDecember…),
  **re-baser les golden Phase 0 + les baselines SCIEMMENT** (prouver le rapprochement vs ARC), panel
  fiscal-accuracy + projection-validator. ⚠️ Money-critical, plan-first à chaque phase, gate + panel.
- [x] **[ITEM-2C]** ✅ **PHASES 1+2 FAITES (2026-06-25 : FERR per-conjoint + PSV/RRQ per-conjoint)**. RESTES : reset REER 71 + per-conjoint PSV/RRQ AU DÉCÈS = **DÉCISION Marc 2026-07-06 : LAISSER EN LIMITE ASSUMÉE** (doc `FISCAL_REFERENCE §9` coté survivorMode, impact $ minimal). Clos.
- [x] **[B-AUDIT-5]** ✅ **DÉJÀ CORRIGÉ** (vérifié 2026-06-19, Marc avait dit « corriger »). Le SRG est DÉJÀ exclu
  de l'assiette du clawback PSV : `projection.ts:918` passe `incomeRetirement − incomeRetirementGis` à
  `computeOasClawback`, l.921 `v − gisShare` par conjoint, l.929 le cap `pensionPSV − incomeRetirementGis`
  (corrigé implicitement par FA-2/FA-3/FA-8). Le `incomeRetirement` AVEC SRG ne sert qu'au reset de janvier
  (l.945), pas au clawback. Item périmé → PAS de fake fix (un faux fix d'impôt = pire que le finding).
- [x] **[H1]** ❌ DÉCISION Marc 2026-06-19 : **PAS de chiffrement par passphrase** (risque recovery > valeur ;
  cascade IndexedDB chiffré suffit). Clos, décliné.

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
- [x] **[FA-6]** ✅ **FAIT (2026-06-23)** — Dons charitables : crédit par PALIERS (`utils/donationCredit.ts`, féd 15/29 +
  QC 20/24 → 35 % / 53 %, FISCAL_REFERENCE §10 daté+sourcé) remplace le `33 %` plat ; volet titres `−0,15·don` (inventé) SUPPRIMÉ.
  ⚠️ **Découverte CRITIQUE en cadrant** : le crédit (et la taxe locative/CCPC) allait dans `taxCurrentYear.revenu`, **ÉCRASÉ en
  décembre année ACTIVE** (`taxDecember:406` `=` vs `+=` retraité) → un salarié actif donateur n'avait AUCUN bénéfice fiscal, et les
  loyers/dividendes CCPC d'un actif n'étaient PAS imposés. Fix = router les 3 ajustements W5 vers `divers` (jamais écrasé) via
  `addTaxDivers`. Panel financial-integrity + projection-validator = CORRECT, 0 régression, conservation 35/35, discriminant
  `git stash` prouvé. Découvertes routées ci-dessous (FA-6-CREDIT-CAP, W5-TAX-PROXY).
- [x] **[FA-6-CREDIT-CAP]** ✅ **FAIT (2026-06-23, même PR que FA-6)** — le crédit-don (non remboursable) est désormais PLAFONNÉ
  à l'impôt sur le revenu + gains de l'année. Champ séparé `taxCurrentYear.donCredit` (accumulé en janvier) → `taxDecember`
  le plafonne à `grossIncomeTax + max(0, gains)` puis l'applique à `divers` (RAMQ/FSS hors assiette). Un crédit non remboursable
  ne génère plus de remboursement net (donateur bas-revenu : crédit borné à son impôt) ; l'excédent est perdu (pas de report
  modélisé). Tests unitaires (revenu élevé = complet, revenu bas = plafonné, revenu nul = 0) + discriminant `git stash` (sans cap,
  les tests bas/nul échouent). Panel financial-integrity + projection-validator + silent-failure-hunter.
- [x] **[W5-TAX-PROXY]** ✅ **DÉCISION Marc 2026-07-06** : **(a) Garder les proxies plats** (0,45 locatif / 0,36 CCPC) documentés en tant qu'estimation de taux marginal QC. Ajouter une mention UI + source de taux marginal QC dans `FISCAL_REFERENCE.md` (rapide, honnête). Option (b) = modéliser l'impôt incrémental réel (exact, mais plan-first dédié, impact moteur). Choix : (a). Clos.
- [x] **[FA-7]** 🔧 (livré) §8 immobilier transcrit dans FISCAL_REFERENCE : B-20 (plancher 5,25 %,
  +2 pts, GDS 39/TDS 44), mise de fonds min + amortissements SCHL (30 ans FTB/neuve août 2024),
  primes SCHL par LTV (0,60→4,00 %), mutations QC 2025 (paliers + note Montréal non modélisé,
  à réindexer 2026), TPS/TVQ neuf (36 %/6 300 $ · 50 %/9 975 $, dégressifs), Smith/HELOC LTV 65 %
  + margin call. Découverte routée vers FA-8 : taux HELOC 5 %/an EN DUR (`realEstateMonth.ts:336`)
  — hypothèse de modèle à paramétrer.
- [x] **[FA-8]** ✅ mergé (PR FA-8) — lot mineurs fiscaux LIVRÉ (10 sous-items, 2 vrais bugs : cap clawback PSV versée + assiette dividendes ; panel fiscal-accuracy AUCUN BLOQUANT ; 11 tests dédiés, preuve par mutation). Restes requalifiés ci-dessous. Ex-périmètre. **LIVRÉ 2026-06-11 (10 sous-items, en attente de merge)** :
  taux clawback 15 % nommé+sourcé (`OAS_CLAWBACK_RATE`, utils/tax.ts) · **cap clawback = PSV
  réellement VERSÉE** (breakdown décembre hors SRG : facteur de report, bonus 75+, prorata
  résidence, survivant — couvre AUSSI « cap ignore prorata/`psvEstimateMonthly`/bonus 75+ » et le
  clawback fantôme avant `psvStartAge` ; `psvBasePension` = repli legacy) · prorata RRQ 39 ans /
  PSV 10-40 ans documentés (doc §6 + commentaires sourcés retirementIncome) · split 65/35 →
  constantes de MODÈLE `GOV_PENSION_*_SHARE` (3 sites unifiés : setupSimulation, retirementIncome,
  estateCalculation) + doc §6 · SystemView TAX_MODULE composé depuis `TAX_BASE_YEAR`/
  `FED_BRACKETS[0].label`/`BASIC_PERSONAL_AMOUNT_FED` · assiette dividendes ALIGNÉE gains
  (+`accRetraitsReerYear` dans `incomeForDiv`) + hypothèse « 30 % du rendement = dividendes »
  documentée §3 · retenue US 15 % sourcée (`US_DIVIDEND_WITHHOLDING_RATE`, convention Canada–É.-U.
  art. X(2)b)/XXI — 4 sites : assetLocation ×3 + glidepathRates) · **FSS réindexé barème 2026**
  (18 500/33 500/64 355/149 355, RQ+CFFP vérifié 2026-06-11 — le code portait le barème 2025 sous
  libellé 2026) · retenue FERR : `eligiblePensionIncome` = retraits REER/FERR N-1 par tête (aligné
  FA-1 ; impact chiffré NUL — `marginalRate` est bracket-only, documenté code+doc §7) ·
  `calculateCeliRoom` unifié sur l'extrapolation taxJanuary (`LAST_KNOWN_CELI_YEAR` exporté,
  fallback `|| 7500` figé supprimé).
  **RESTES (non couverts par le lot)** : ~~`setupSimulation.ts` `inflationRate || 2.0` masque le
  0 légitime (→ `??`)~~ ✅ FAIT (PR #273 — `?? 2.0`, le 0 % saisi est respecté ; 3 tests ; rayon
  baselines nul = aucun fixture à inflation 0 ; + 2 sites UI alignés : Retirement label, ChildPlanning
  coûts, sinon un scénario 0 % affichait/indexait 2 %) · ~~NPV estate lit `governmentPension` même quand `rrqEstimateMonthly` est
  fourni (divergence silencieuse)~~ ✅ FAIT (estateCalculation : les estimés RRQ/PSV priment, ×N
  per-personne comme retirementIncome ; repli 65/35 sans ×N préservé = garde FA-5 ; 5 tests) ·
  ~~**[RRQ-PSV-MIN]** inputs RRQ/PSV sans `min={0}` → un estimé NÉGATIF sous-estimerait en silence~~
  ✅ FAIT : clamp `Math.max(0, …)` dans retirementIncome ET estateCalculation (symétrique) + `min={0}`
  UI sur les 2 inputs ; test (négatif clampé == estimé 0). ·
  assiette clawback PSV/test SRG sans dividendes/intérêts non-reg
  (revenu net 23400 les inclut — sous-estime, borné au cap) · **[FSS-PSV]** 🔧 assiette FSS inclut la
  PSV — l'Annexe F la DÉDUIT (revendiqué sourcé 2026-06-11, page RQ « Cotisation des particuliers au
  FSS »). **Trace 2026-06-12** : confirmé que la PSV est DANS `incomeRetirementMonthly` (taxDecember.ts:662)
  donc bien dans l'assiette FSS ; SEUL le SRG en est retranché (`incomeRetirementGisMonthly`). Le fix
  exige (a) câbler un montant PSV mensuel familial dans le `ctx` de décembre (depuis le breakdown
  `computeRetirementIncome` — RRQ+PSV+DB par conjoint existe déjà, mais PAS la PSV isolée) puis le
  soustraire de l'assiette FSS comme le SRG ; (b) **transcrire d'abord la règle Annexe F dans
  FISCAL_REFERENCE** (actuellement ABSENTE : §FSS ne documente que l'exclusion SRG) — money-critical,
  ne pas implémenter sans source transcrite. PR dédiée. · lagged SRG déflaté du facteur du mois courant
  (~1 an d'écart, SRG légèrement surévalué) · `ghOtherNominal` (récolte de gains, retraité) inclut
  le SRG non imposable → palier visé trop petit (conservateur) · **dbMonthly quasi-nominal dans le
  revenu test SRG réel** (post-FA-9 : SRG coupé de plus en plus tôt pour un profil DB, conservateur
  mais amplitude ×1,49 à 20 ans — déflater la composante DB) · **plafonds ×N non survivor-aware**
  (découverte FA-10) : droits CELI/REER/CELIAPP continuent de s'accumuler pour le défunt
  (`projection.ts` fhsaRoom, `taxJanuary.ts:159`) — sous-imposition indirecte mineure · retenue FERR
  estimée sur 2 têtes en survivorMode (timing seulement, réconcilié en décembre) · taux HELOC
  5 %/an en dur (`realEstateMonth.ts:336`, découverte FA-7 — hypothèse de modèle à paramétrer) ·
  🧭 « montant pour personne vivant seule » QC (grille TP-1.G) absent code+doc — pertinent pour un
  survivant, NE PAS chiffrer sans source Revenu Québec.
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
- [x] **[PV-6]** ✅ Résiduel insolvable = dette portée : quand la cascade du sauvetage PV-1 ne couvre
  pas tout (comptes épuisés / cap OAS), le résiduel est journalisé puis absorbé (convention CF-2 des
  shortfalls non couverts) → NW encore surévalué du résiduel dans les scénarios DÉJÀ en ruine. Modéliser
  un passif `liquidDebt` cumulé (affiché au bilan) si on veut un NW honnête en insolvabilité. Basse
  priorité (scénarios concernés déjà signalés par shortfallRate/successRate). (M)
- [x] **[PV-2]** 🔧 (livré) Récolte de gains ignorait `capitalLossBank` : la banque de pertes (TLH)
  est désormais consommée EN PREMIER (LIR 111(1)(b)) — part compensée = 0 $ d'impôt et HORS palier
  (step-up d'ACB gratuit), remplissage du palier sur le latent restant. `consumedLoss` retourné au
  caller (seule la part non compensée entre dans `accCapitalGainsYear`). 4 tests + FISCAL_REFERENCE §3.
- [x] **[PV-11]** ✅ mergé #247 — (a) métrique `goalShortfalls {count,total}` (hook onGoalShortfall,
  3 tests) ; (b) retraits de goals aux séries withdrawal* ; (c) `_label` retiré ; (d) docstring
  portfolioOps précisé. + clamp liquid négatif (un goal n'efface plus un découvert). Validé
  projection-validator (1927/1927, baselines intactes) ; réserve per-conjoint → PV-11e.
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
- [~] **[CA-01]** PARTIEL — code mort utils/. ✅ **`safeNumber.ts` (30 l) SUPPRIMÉ** (PR #373, 2026-06-19) : util de
  coercition NaN jamais adopté (le moteur garde inline via `Number.isFinite`) → aucun consumer prod (grep : fichier +
  son test seulement), retiré avec son test. ⚠️ **`csvExport.ts` N'EST PAS mort** (affirmation d'origine périmée) : USÉ
  par `components/Transactions.tsx` (export CSV) → NE PAS supprimer. Reste à vérifier 1-à-1 (knip bruyant, pas en masse) :
  exports orphelins (addPurchase/removePurchase, formatMonthYear, `getHasUserDataSnapshot`). NB `formatCompactCAD` EST
  utilisé (axes/tooltips compacts, cf CLAUDE.md formatage) → pas mort. (S)
- [x] **[CA-02]** ✅ (helpers délèguent à formatCAD — source unique, format préservé) Unifier le formatage monétaire : 11 helpers locaux divergents (« 1 234$ » vs
  « 1 234,00 $ »…) → `formatCAD` de `utils/format.ts` ; résorber ~135 `toLocaleString`. (M)
- [ ] **[CA-03]** Finaliser la migration `utils/tax.ts` (820 l) → `services/tax.ts` (alias 5 l
  inachevé, ~20 imports directs restants). (S)
- [x] **[CA-04]** ✅ Smoke tests des 8 composants money-critical sans test direct (DebtManager,
  ChildPlanning, TaxCenter, RealEstate, Retirement, Investments, FutureProjection, AiAssistant) — rendent sans crash.
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
- [x] **[CA-10]** ✅ (quasi complet) — `usePastPortfolioHistory` (dédup PH2-c-1 + `.modes` : mode test,
  anti-fuite réel→test M3, gardes) + **`usePwaInstallPrompt`** (`tests/hooks/usePwaInstallPrompt.test.ts`,
  11 cas : recence de dismiss 30j + garde `Number.isFinite`, standalone, flux beforeinstallprompt/
  promptInstall/appinstalled). `assetMeta` n'existe plus (module supprimé) ; `analytics.ts` = trivial
  (`trackPageView` 40 l, un seul wrapper) → test sans valeur, laissé. (S)

## 🧹 Grand nettoyage AAA — items ENCORE ouverts (réf. `AAA_AUDIT_2026-06.md`)
> D1 (money CF/M-*), D5 (robustesse), D6 (double-h1, focus tour), D9 (robustesse LLM/ingest) = ✅ **faits**
> (détail dans l'audit). Restent les gros chantiers à décision/risque :
- [ ] **[D3]** Design system : codemod des ~636 couleurs ad-hoc (`text-gray-*`, hex) → tokens
  (`ink-*`, `surface`, `success/warning`) + règle ESLint anti-régression. Raffine l'existant
  (dark + emerald), zéro changement d'apparence rendue.
- [ ] **[D4]** God-files : scinder par impact `Investments` (1154) → `FutureProjection` (969) →
  `Budget` (892) → `Transactions` (729) → `Dashboard` (621)… + **[D4-H2]** sélecteurs atomiques
  (App re-render sur tout slice non-`lastProjection` + prop-drilling via `TabRouter`).
- [x] **[D6-SR]** ✅ (gros du lot) — primitive `<PrivateAmount>` (aria-hidden + sr-only « Montant
  masqué » en mode privé, blur CSS inchangé, 4 tests) + MIGRATION : `KPIStat` (prop privacy → couvre
  TOUS les KPI), `DualKPIStat`, `CurrentCapitalCard` (6), + 13 sites one-liner via codemod conservateur
  (RealEstate, Investments, Dashboard, ChildPlanning, StressTestPanel, PropertyConfigurator,
  NetWorthByOwnerCard).
- [ ] **[D6-SR-2]** 🔧 (reste de migration, enrichi revue #247) — ~69 occurrences `privacy-blur`
  restantes : INPUTS (légitimes — un champ éditable doit rester utilisable par son utilisateur SR ;
  **SLIDERS ✅ FAIT** : helper partagé `maskedSliderAria(isPrivacyMode)` (`utils/privacyAria.ts`) +
  `aria-valuetext="Montant masqué"` sur les 5 sliders monétaires masqués — PropertyConfigurator
  prix/mise de fonds, ProjectionControls revenu/dépenses théoriques + plafond immo ; helper réutilisable
  pour les sliders restants ; ChildPlanning REEE NON masqué visuellement → pas de parité à corriger.
  **+ `aria-label` (nom accessible) sur ces 5 sliders** (leurs `<label>` ne sont pas associés) + constante
  partagée `MASKED_AMOUNT_LABEL` (DRY entre `privacyAria` et `PrivateAmount`)) +
  spans mono-valeur + MONTANTS ADJACENTS. **#282 Retirement (13 mono-valeur → PrivateAmount).** **#283 : primitive
  `<PrivateBlock>` CRÉÉE** (`components/ui/PrivateBlock.tsx` + 4 tests : aria-hidden sur le conteneur + `sr-only`
  sibling, SANS wrapper les enfants → préserve le flex multi-spans, là où PrivateAmount le casserait) **+ Dashboard
  liste d'actifs migré** (bloc diff+revenu → PrivateBlock ; bloc gain → PrivateAmount). RESTE = **finition de masse**
  (~50 `privacy-blur` sur ~16 fichiers ; les primitives PrivateAmount/PrivateBlock/KPIStat/Layout NE comptent PAS) :
  gros = `ProjectionTooltip` (13), `ActionPlanDrilldown` (6), `RealEstate` (4), `StrategyOptimizerPanel`/`Planning`/
  `Budget`/`BudgetGroupTable` (3 ch.), puis RetirementIncomeCard/FutureDetailModal/Transactions/Investments/
  StressTestPanel/ChildPlanning/etc. Outils prêts : mono-valeur → `<PrivateAmount>`, bloc multi-spans → `<PrivateBlock>`.
  Mécanique mais volumineux → à faire par paquets (1 fichier ou 2 / lot).
- [x] **[A11Y-SLIDERS]** ✅ COMPLET — nom accessible (WCAG 4.1.2/2.5.3) sur TOUS les sliders dont le `<label>`
  n'était pas associé. **ProjectionControls** (10 : Horizon, Inflation, Hausse salaire, CELI, NonReg/REER,
  Coussin, Inflation/poste ×6, Part actions US, Rendement div. US, Coût soins LD) + **PropertyConfigurator**
  (Prix, Mise de fonds, Plafond) + **RealEstate** (Rendement Boursier, Appréciation Immo) + **DebtManager**
  (Paiement suppl.) + **TaxCenter** (Cotisation REER, CELIAPP) + **ChildPlanning** (Cotisation REEE) — tous
  `aria-label` = texte visible. **Budget:622** avait déjà un nom ; **HealthIndicator:322** déjà associé via
  `htmlFor`/`id` (SKIP, corrects). Tests : `ProjectionControls.a11y` (13 sliders) + PropertyConfigurator (3) +
  DebtManager.smoke (1) + TaxCenter.smoke (2) ; RealEstate/ChildPlanning vérifiés statiquement (render =
  fixtures goal/enfant, disproportionné pour attribut statique). NB : `aria-label` partout (uniformité) ;
  `aria-labelledby` serait + robuste contre la dérive label↔aria si refonte un jour.
- [ ] **[D6-PRIV-MONTANTS]** 🔧 DECISION Marc 2026-07-06 : **OUI masquer au repose, révéler au focus** — incohérence produit :
  les montants $ des sliders REER/CELIAPP (TaxCenter), REEE (ChildPlanning) et paiement suppl. (DebtManager)
  s'affichent EN CLAIR en mode privé (pas de `<PrivateAmount>`), alors que prix immo, revenus/dépenses théoriques,
  mise de fonds y sont masqués. Solution : chaque slider → encapsuler la valeur numérique DANS un composant qui
  masque au blur/repose (par symétrie avec `<PrivateNumberInput>` — focus révèle, blur re-masque) ; l'input reste
  cliquable. Accessible : `aria-label` porte la vraie valeur SR-safe + le slider se focus normalement. Patches : `TaxCenter.tsx`,
  `ChildPlanning.tsx`, `DebtManager.tsx`. Effort S (3 fichiers, pattern clair). Priorité : post-D7-KBD (lot a11y).
- [ ] **[D7]** → Voir [PERF-BOOT] l.724 (doublon, même tâche, déféré provider-aware).
- [ ] **[D6-KBD]** Sidebar hover-only : labels `opacity-0` focusables + `disabled` bloque
  l'accordéon clavier → rendre pilotable au clavier.
- [x] **[D6-GRAPH]** ✅ **PARTIELLEMENT FAIT (A11Y-INK500 lots 1-2)** — tables de données `ChartDataTable` sr-only ajoutées aux 2 donuts Budget. Reste : graphes restants (projections, investissements) ; résiduel = accès clavier aux graphes.
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
