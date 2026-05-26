# BACKLOG global — FinanceAI

> Liste exhaustive de TOUT ce qui reste à faire, compilée à partir de :
> - Demandes explicites de Marc dans toutes les sessions
> - Bugs et améliorations trouvés par audits / agents Claude
> - Phases reportées (centralisation, sécurité, etc.)
> - Tâches en attente dans TaskList
> - Tests manquants
>
> **Mise à jour** : à chaque livraison majeure, mettre à jour le statut et
> ajouter les nouvelles entrées découvertes.

---

## 📍 Session 2026-05-26 (soir) — Lot UX/refonte demandé par Marc (G22)

> Chaque item est un **long chantier** : plan + questions + implémentation, un par un.
> Statut : `[ ]` à faire · `[~]` en cours · `[x]` fait.

### Bugs (effort faible-moyen)
- [x] **G22-B1 — Valeur nette passée à 0 (Futur)** — ✅ FAIT. VN passée COMPLÈTE
  (option 3) : placements (déjà) + cash (flux transactions à rebours,
  `reconstructCashHistory`) + équité immo (amortissement, `reconstructRealEstateEquity`).
  La ligne VN démarre à la 1re transaction connue (avant = vide, pas de fausse VN à 0).
  Carry-forward placements pour continuité. 8 tests. (décisions Marc : option 3 + start
  à la 1re transaction).
- [x] **G22-B2 — Bouton couple toujours cassé** — ✅ FAIT. Le badge couple de la
  sidebar (sous les onglets) ne faisait qu'ouvrir Configuration ; il **bascule
  désormais directement** Couple ⇄ Individuel (ajoute/retire le 2e utilisateur dans
  `config.users`). Propagation immédiate partout (38 fichiers lisent `config.users`
  réactivement via le store). Détails du conjoint éditables dans Configuration.
  À revalider en live (Marc).
- [~] **G22-B3 — Graph Accueil incohérent** — partiellement FAIT :
  Cause racine : `ZoomableTimeChart` avait perdu ses contrôles (régression de
  l'extraction G4 du hook ; #122 marqué fait mais code sans sélecteur).
  - [x] **Boutons de période** : data-aware (1M/3M/6M/1A/5A selon l'étendue réelle) +
    « Tout » (reset). Via `showRange()` du hook. → Accueil + Investissements.
  - [x] **Plein écran** : Fullscreen API native sur le conteneur (`containerEl`).
  - [x] **Zoom molette** : le listener natif `{passive:false}` était déjà correct ;
    les boutons période donnent un zoom fiable en complément. À RE-VALIDER en live
    après deploy : si la molette est encore morte SPÉCIFIQUEMENT sur l'Accueil, repro
    nécessaire (piste : données trop courtes, ou ancêtre qui capte le scroll).
  - [~] **Style** : contrôles harmonisés avec les autres ; affiner visuellement si
    besoin (la barre période peut chevaucher la légende centrée — à ajuster au besoin).

### Infobulles & lisibilité
- [x] **G22-UX1 — Infobulles incompréhensibles** — ✅ FAIT. Toutes les chaînes
  `flowEventLogs`/`lifeEventLogs` réécrites en français clair, jargon masqué.
  Avant : `🏠Achat (re-1): -103 135$` / `⚠️Stress test B-20 OSFI… GDS 197.7%…` /
  `🏧↳ Retrait RAP… +1 355$` / `📌MBP: -90 000$ | Frais+TBienv.: -13 135$`.
  Après : `🏠 Achat de la propriété : -103 135 $ (argent sorti de tes comptes)` /
  `⚠️ Hypothèque risquée : tes paiements seraient trop élevés…` / `🏦 ↳ Retrait
  REER via le RAP, sans impôt : +1 355 $` / `📌 Mise de fonds : -90 000 $ · Frais
  de notaire + taxe de bienvenue : -13 135 $`. Fichiers : `realEstateMonth.ts`,
  `cashflowAllocation.ts` (REER/CELI/non-enreg/crypto/dettes/surplus),
  `childrenReee.ts` (voiture, fermeture REEE). Format uniforme (espace avant `$`,
  acronymes expliqués). Aucun test ne dépendait des anciennes chaînes.

### Refonte navigation / onglets (questions à poser)
- [x] **G22-N1 — Supprimer l'onglet Documents** — ✅ FAIT. Retiré de l'enum Tab,
  TabRouter, Layout (sidebar + drawer mobile), CommandPalette ; `Documents.tsx` +
  test supprimés.
- [x] **G22-N2 — Supprimer l'onglet Data** — ✅ FAIT. Idem ; `JsonDataView.tsx` supprimé.
- [x] **G22-N3 — Déplacer Planif & Abos dans Budget** — ✅ FAIT (sous-onglets).
  Wrapper `BudgetWorkspace.tsx` : sous-onglets « Budget » | « Charges fixes & Abos »
  | « Objectifs ». `Planning` reçoit `section` ('fixed'/'goals') ; Budget intact.
  TabRouter rend BudgetWorkspace pour Tab.BUDGET ; enum `Tab.PLANNING` + nav (Layout,
  CommandPalette) + raccourci Alt+4 (→ Dettes) retirés. (clé i18n `tabs.planning`
  laissée, inerte.)
- [x] **G22-N4 — Refonte onglet Configuration** — ✅ FAIT (sous-onglets thématiques).
  `Settings.tsx` (745 lignes) découpé en orchestrateur léger (~210 l.) + 6 sections
  sous `components/settings/sections/` : `ProfileSection` (retraite hub + `UsersCard`),
  `AccountsSection` (soldes + paie + import banque), `PatrimoineSection` (W5.x :
  assurances/locatifs/entreprises/cycliques), `IntegrationsSection` (clés API),
  `BackupSection` (export/auto/mode test). Nav 5 sous-onglets : Profil | Comptes &
  soldes | Patrimoine | Clés API | Sauvegarde. Deep-link cross-tab préservé : le
  sous-onglet contenant le `data-focus-section` ciblé s'ouvre d'office avant le
  scroll (`usePendingFocus`). Test Settings mis à jour (navigue vers Sauvegarde →
  la couverture sécurité « clés API hors backup » est réellement exercée, plus de
  skip silencieux). (« Hypothèses éco » du plan initial : sans objet ici, vit dans Futur.)
- [x] **G22-N5 — Refonte onglet Système** — ✅ FAIT (décisions Marc).
  Système devient le 6e sous-onglet « Système & diagnostics » de Configuration
  (retiré de la sidebar, du drawer mobile, de la CommandPalette et de l'enum `Tab`).
  Le CHANGELOG écrit à la main est remplacé par une carte « Version & build » réelle
  (`__APP_VERSION__` CalVer · `__GIT_SHA__` · `__BUILD_DATE__`, injectés par Vite —
  auto-tenue à jour à chaque déploiement). Diagnostics runtime + journaux erreurs/audit
  conservés. « Toile d'Araignée » gardée pour l'instant (sera revue avec F1). `SystemView`
  reçoit `appState` forwardé par Settings. CommandPalette : keywords system/diagnostic/version
  pointent vers Configuration.

### Features (gros)
- [x] **G22-F1 — Page « Explications » dans Futur** — ✅ FAIT (explorateur data-driven complet).
  3e sous-onglet « 📖 Explications » dans Futur (`ProjectionExplains`, à côté de Graphique/Paramètres).
  Pilotée à 100 % par les vraies données de projection (`ProjectionChartPoint[]`, ~70 champs/mois) :
  par **année** (repliable) → drill **mois par mois** ; pour chaque mois, les événements en
  français clair (réutilise `flowEvents`/`lifeEvents` post-UX1) **+ détail chiffré par compte**
  (cotisé / marché / retrait / transfert / versé) pour CHAQUE compte (Liquidités, CELI, REER,
  CELIAPP, non-enreg, crypto, REEE, immo, dettes). **Barre de recherche** transverse (date,
  événements, comptes mouvementés) avec compteur + auto-expand des années matchées. Section
  **« Comment ça marche »** (méthodologie : projection, ordre de retrait, RAP, CELIAPP, impôts,
  Monte Carlo). Empty state honnête si aucune projection. 5 tests. Typecheck OK, build OK.
- [ ] **G22-F2 — Version de l'app auto-tenue à jour + affichée**.
- [x] **G22-F3 — Onboarding accueillant** — ✅ FAIT. Étape « Bienvenue » réécrite pour
  mener avec la valeur (vision claire, simulateur du futur, assistant IA, données locales)
  au lieu des seuls détails techniques. Tutoiement aligné sur le reste de l'app (les étapes
  vouvoyaient encore). Structure 4 étapes conservée (bienvenue/profil/clés/comptes). Aucun
  test ne dépendait du texte ; a11y onboarding OK.
- [x] **G22-F4 — Tutoriel pas-à-pas (1re fois)** — ✅ FAIT (moteur maison, zéro dépendance).
  Visite guidée de **tous les onglets** (15 étapes) : à chaque étape le tour ouvre l'onglet,
  met son item de nav en surbrillance (spotlight box-shadow, ancré sur `data-tour-id="nav-*"`)
  et affiche une bulle. Navigation Suivant/Précédent/Passer + raccourcis ←/→/Échap. Robuste :
  fallback bulle centrée si l'ancre n'est pas mesurable (mobile/sidebar masquée). Démarre
  automatiquement après l'onboarding (1re fois, flag `app_tour_done`), **relançable** via
  un bouton dans Configuration → Profil. Déclenchement découplé par event global
  (`financeai:start-tour`). Fichiers : `components/tour/{tourSteps,tourControl,GuidedTour}`.
  4 tests (démarrage/navigation/skip). Typecheck OK, build OK.

---

## 📍 Session 2026-05-25 — « Copilote d'argent » + sourcing gratuit + durcissement

### ✅ Livré + en prod cette session
- **Clés API persistées chiffrées** (AES-256-GCM, clé non-extractible IndexedDB) —
  `services/secureKeyStore.ts`. Résout « je mets mes clés et rien ne se charge »
  (l'audit C5 les rendait mémoire-seulement). Commit `c90f4b8`.
- **Fix budget** : impossible d'ajouter une catégorie (groupe vide → bouton caché).
  `BudgetGroupTable` montre toujours le bouton. Commit `4e21b58`.
- **Plan d'action hiérarchique** (Futur) : vue d'ensemble → décennie → 3 ans →
  année → semestre → trimestre → mois → conseils. `actionPlanHierarchy.ts` +
  `ActionPlanDrilldown.tsx`. Commit `01c0f83`.
- **Crypto gratuit** : provider CoinGecko (sans clé, CORS-OK), routage par symbole.
  Commit `2213e31`.
- **Import CSV bancaire universel** (gratuit, 100% local) : `parseBankCsv.ts` +
  `ImportBankStatement.tsx`. Commit `6d60973`.
- **era retiré** (MCP-only, inappelable d'un navigateur) : champ Settings +
  orphelins Onboarding/Transactions/Planning. Commits `6d60973`, `2ffcad4`.
- **Vuln `qs` corrigée** (`npm audit fix` → 0 vuln) + fixes d'audit multi-agents
  (collision d'IDs import, skip silencieux, dump de crash, a11y). Commits `2ffcad4`, `f608e92`.

### 🔧 Trouvé par le fleet d'agents — à traiter (priorisé)
- ~~**[HAUTE] Dette persistance : 2 systèmes concurrents**~~ — ✅ **FAIT (2026-05-25)**.
  `financeai-storage` (persist) est désormais la source de vérité unique ; la lecture
  legacy `app_*` ne sert plus qu'à l'import unique (gate sur présence de financeai-storage).
  Écriture redondante `categorization_rules` retirée. 4 tests de boot + vérif navigateur.
  Reste (suite, plus tard) : migrer le storage de localStorage → IndexedDB (quota + boot async).
- **[HAUTE] Backup auto manuel → automatique + nag** — `backupAuto.ts` + `cloudBackup.ts`
  existent ; un user public ne lancera jamais le backup avant un clear-cache. Wirer un
  déclencheur récurrent + un rappel « aucune sauvegarde ». (architect)
- **[MOY] Migrer la persistance vers IndexedDB** (quota localStorage ~5 Mo + parsing
  synchrone bloquant au boot). (architect)
- **[MOY] Sécurité H2 — prompt injection via `payee`** : `sanitizePayee` ne filtre que
  les caractères de contrôle ; un libellé bancaire malveillant peut injecter un prompt
  vers Claude. À durcir. (security-reviewer, ex-S4)
- **[MOY] `loadApiKeys`** : distinguer « rien stocké » de « blob présent mais
  déchiffrement échoué » + toast « clés non restaurées ». (silent-failure-hunter)
- **[BAS] Code mort à retirer** (refactor-cleaner + knip) : `MOCK_ASSETS` /
  `INITIAL_INVESTMENT_ACCOUNTS` / `INITIAL_INVESTMENT_TRANSACTIONS` (constants.ts, 0 réf) ;
  alias `optimizeDrawdownOrder` (drawdownOptimizer.ts) ; `searchTransactions` /
  `clearInsightCache` (eraContext, dormants). Attention aux imports de types orphelins.
- **[BAS] `Permissions-Policy`** absent du `<meta>` CSP (présent seulement dans les
  headers Netlify) → à ajouter avant ouverture publique non-Netlify.

### 🚀 Prochaines étapes produit (préparées avec Marc)
- **Import positions courtier (CSV)** : même mécanique que la banque, pour saisir les
  actions en lot (Wealthsimple/Questrade/Disnat…). Demandé, non commencé.
- **Option B — agrégateur bancaire (clé)** : SimpleFIN (~15 $/an, payé par le user) via
  un relais serverless Vercel (contourne le CORS). **Différé** — Marc a choisi « CSV-only
  pour l'instant ».
- **Rendre public / multi-user** : ouvrir Cloudflare Access (any Google login) ou retirer
  Access. Voir procédure dans [AUTH_SETUP.md](AUTH_SETUP.md). Pré-requis recommandé :
  consolider la persistance (dette ci-dessus) + onboarding « contrat de données » (« vos
  données restent dans CE navigateur, faites une sauvegarde »).
- **Sync cross-device gratuite optionnelle** : blob chiffré synchronisé via le propre
  stockage du user (GitHub Gist / Google Drive de l'user) — reste local-first, 0 coût.

---

## 🚨 P0 — Bloquant / Sécurité

### B0 — React error #310 sur chaque onglet au load — ✅ FIX CODE FAIT (2026-05-22)
À chaque chargement, chaque onglet tombait dans l'ErrorBoundary
(« Erreur dans Accueil ») avec **Minified React error #310** =
*"Rendered more hooks than during the previous render"*.

**Cause réelle** (confirmée par `eslint react-hooks/rules-of-hooks`) :
`components/dashboard/HealthIndicator.tsx` faisait
`if (!hasData) return <EmptyDataPrompt/>` AVANT 8 hooks (`useFinanceStore` ×5,
`useProjectionSelector`, 2× `useMemo`). À l'hydratation du store, `hasData`
passe false→true → le nombre de hooks change → crash. HealthIndicator est rendu
par Dashboard (Accueil) et monté en permanence, d'où l'effet « chaque onglet ».
C'était le **seul** fichier avec des erreurs `rules-of-hooks` (scan repo entier).

- [x] Audit ESLint de tout le repo → 1 seul fichier fautif (HealthIndicator)
- [x] Déplacé l'early-return APRÈS tous les hooks
- [x] Lint : 0 erreur `rules-of-hooks` ; typecheck clean ; 604/604 tests verts
- [x] **Gate lint ajouté** : étape `Lint` dans `.github/workflows/ci.yml` +
  `prebuild: npm run lint` dans package.json (gate le deploy Vercel/Netlify car
  ils lancent `npm run build`). Bonus : retiré une directive `eslint-disable
  import/no-unresolved` morte dans testFixtures.ts qui faisait sortir lint en
  erreur de config.
- [ ] Vérifier en prod sur les onglets après redeploy Vercel

### S1 — Auth Google OAuth + MFA (Cloudflare Access) — ✅ FAIT (2026-05-22)
Site désormais protégé : login Google obligatoire, restreint à
`marc.richard4@gmail.com`. Doc : [AUTH_SETUP.md](AUTH_SETUP.md).
- [x] Phase 1 — DNS Cloudflare (domaine acheté chez Cloudflare Registrar)
- [x] Phase 2 — Cloudflare Access policy (email Marc) + IdP Google OAuth
- [x] Phase 3 — Testé en fenêtre privée, session 24h, redirect apex → www
- [x] Phase 4 — Doc `AUTH_SETUP.md` créée
- [ ] Phase 5 — Hardening optionnel : chiffrement localStorage avec passphrase
  (= H1 / décision A8 — voir ACTIONS_MARC.md, reste à trancher)
- **Coût** : 0 $

### S2 — Sprint 3B SH3 : IndexedDB backup chiffré (analysé 2026-05-21)
État actuel :
- ✅ `services/backupAuto.ts` existe : backup IndexedDB rolling 7 jours auto
- ✅ Download manuel JSON déjà chiffré AES-256-GCM + PBKDF2 600k (`services/cloudBackup.ts`)
- ❌ Backup auto IndexedDB stocké en clair

**Analyse menace** : le chiffrement IndexedDB ne protège PAS contre le
seul scénario réaliste (vol laptop déverrouillé) car le `localStorage`
non-chiffré est tout aussi accessible. Pour une vraie sécurité au repos,
il faut chiffrer **tout le store** au boot avec une passphrase (item H1
hardening dans SECURITY_STRATEGY.md).

**Recommandation** :
- (a) Mettre en place Cloudflare Access (S1) — bloque l'accès distant
- (b) Si vol laptop critique : implémenter H1 (chiffrement localStorage
  passphrase) → IndexedDB chiffré automatique en cascade

S2 isolé apporte peu de valeur sans H1. Reporté jusqu'à décision Marc
sur H1.
- **Effort isolé** : 3-5 h (passphrase UI + Web Crypto AES + migration
  backups existants)
- **Risque** : medium (perte si passphrase oubliée → besoin recovery)

---

## 🎯 P1 — Centralisation calculs (Phase 3 — finition)

> Le refactor "Future = source unique" est à **65 %**. Reste l'extension
> moteur. Doc : [CENTRALIZED_CALC_PROGRESS.md](CENTRALIZED_CALC_PROGRESS.md).

### C1 — Étendre le moteur `monthlyOutput.ts` ✅ TERMINÉ 2026-05-21
Ajouter ces champs dans `ProjectionChartPoint` :
- [x] `marginalTaxRate` (% mensuel) — calculateFiscalReport per-month, par adulte
- [x] `effectiveTaxRate` (%) — taux moyen d'imposition
- [x] `TaxableInvIncome` ($) — pour TaxCenter investmentTaxData
- [x] `DividendIncome` ($) mensuel — pour Investments + DividendPanel
- [x] `reeeGrantsCum` ($) — pour ChildPlanning respProjection
- [x] `reeeContribCum` ($) — pour ChildPlanning respProjection
- [x] `pensionRRQ`, `pensionPSV`, `pensionPrivee` (split IncomeRetirement) ✅ 2026-05-21
- [x] `realNetWorth` (déflaté à $ d'aujourd'hui) — pour charts pouvoir d'achat
- [x] `liquidityRunway` (mois) — pour stress test
- [x] `mortgageRemainingMonths` — estimation linéaire balance/paiement
- **Reste à faire** : split pension (peu critique, reporté)
- **Effort restant** : ~30 min

### C2 — Migrer composants après extension ✅ FAIT (2026-05-22)
> Centralisation complète après vérification :
> - Faite via **C3** (mode strict) : ChildPlanning `respProjection` ← chartData ✓,
>   RealEstate badge équité ← chartData ✓ (+ HealthIndicator, Dashboard, etc.).
> - **N/A — valeur du présent ou outil interactif** (pas une projection, même
>   logique que TaxCenter & DebtManager) : TaxCenter (temps présent) ; Investments
>   `totalAnnualDividends` (KPI présent = holdings × yield) ; DividendPanel (outil
>   DRIP **interactif** : toggle + slider de croissance → une lecture chartData
>   statique DÉGRADERAIT l'interactivité). Rien de plus à migrer.
<!-- items d'origine -->
- [ ] TaxCenter `report.marginalRate` / `effectiveRate` / `taxableAddOn`
- [ ] Investments `totalAnnualDividends` (KPI)
- [ ] Investments DividendPanel (timeline 30 ans DRIP)
- [ ] ChildPlanning `respProjection` (timeline REEE)
- [ ] RealEstate `amortizationData.Équité` (timeline 25 ans par propriété)
- **Effort** : ~3 h total
- **Risque** : low (lecture chartData simple)

### C3 — Mode strict TOTAL ✅ TERMINÉ 2026-05-21
Marc a demandé : "que ca prenne seulement les données du graph uniquement
et que ca me mette une erreur ou un msg si pas dispo". Statut :
- [x] Retirement : strict (plus de fallback worker)
- [x] HealthIndicator : strict (msg si projection vide)
- [x] Composant `ProjectionRequired` créé
- [x] **Dashboard** : Indicateur Futur → ProjectionRequired si pas dispo + fallback 5% supprimé
- [x] **Investments** : Card "Portefeuille projeté" → ProjectionRequired
- [x] **Budget** : Card "Impact à long terme" → ProjectionRequired
- [x] **RealEstate** : Badge équité projetée → ProjectionRequired inline
- [x] **Planning** : "Latte Factor" fake `× 10 × 1.4` retiré → ProjectionRequired
- [x] **ChildPlanning** : `respProjection` reconstruit depuis chartData (champ REEE),
  totalResp/respCovers null si pas dispo, graphe → ProjectionRequired
- [x] **TaxCenter** : 100% temps présent — pas de migration nécessaire
- [x] **DebtManager** : 100% local-deterministic (slider extraPayment) — pas de migration

### C4 — Supprimer code mort post-migration ✅ FAIT (2026-05-22)
> Analyse `knip` : **aucun code mort applicatif à supprimer en sécurité.**
> - Les « unused files » signalés étaient des **faux positifs runtime**
>   (`public/sw.js` enregistré par App.tsx, `public/ga-init.js` chargé par
>   index.html) ou de l'**outillage dev** (`scripts/*`). → `knip.json` ajouté
>   (déclare les vrais entry points : index.tsx, mcp/, scripts/, sw.js, ga-init.js)
>   → rapport fiable désormais (plus de cri au loup).
> - Les ~58 « unused exports » restants sont de l'**API intentionnelle / interne** :
>   constantes fiscales (`utils/tax.ts`, `services/realEstate.ts`), fonctions IA
>   (`services/claude.ts`, `eraContext.ts`), crypto de backup (`cloudBackup.ts` =
>   feature **SH3** planifiée), seed data (`constants.ts`). Pas de suppression
>   (règle « supprimer seulement si certain »).
> - `costTimeline`/`respProjection` : déjà sourcés depuis chartData (cf. C3), pas
>   de calcul inline mort résiduel ; worker Retirement déjà supprimé.
<!-- items d'origine -->
- [x] Worker local Retirement.tsx (déjà supprimé)
- [x] `costTimeline` / `respProjection` : déjà migrés sur chartData (C3)

---

## 🐛 Bugs trouvés au test browser (2026-05-21)

### TB1 — Hash navigation au boot ✅ FIXÉ (commit e888564, validé prod)
### TB2 — Worker crash `slice undefined` ✅ FIXÉ (commit e888564, validé prod)
### TB3 — 7 cards scénarios Future à `0.00M$` 🟡 DORMANT — tripwire posé (2026-05-22)
**Hypothèse initiale RÉFUTÉE** : le worker NE tronque PAS `allResults`.
`calculateFutureProjection` (projection.ts:1129) calcule chaque scénario via
`runScenario(..., false, ...)` de façon déterministe → chaque `allResults[i]`
a son `estateNetWorth`. `runMC` n'ajoute que P10/P50/P90 au scénario sélectionné
(ligne 1169), il ne zéro pas les autres. `runAsync.ts` (ligne 83) passe `result`
intact via postMessage. Card lit `res.estateNetWorth` brut
(ProjectionControls.tsx:99).

**Donc `estateNetWorth` ne peut valoir 0 que si** : (a) NaN → garde
estateCalculation.ts:116 le force à 0 ; ou (b) le scénario épuise réellement le
patrimoine (légitime pour un FIRE agressif à l'horizon 95 ans). Le KPI principal
(FutureProjection.tsx:351) masque ça via fallback `estateNetWorth ||
finalNetWorth || fireNumber` — les cards non, d'où la divergence apparente.

**CONFIRMÉ par Marc (2026-05-22)** : les 7 cards sont TOUTES à 0. Donc ce n'est
PAS de la dépletion légitime (improbable que les 7 stratégies épuisent tout) →
c'est un **NaN** dans `computeEstateNetWorth` (estateCalculation.ts) forcé à 0
par la garde ligne 116. Comme le calcul est partagé par les 7 scénarios, un
input commun est NaN/undefined.
**À tracer** (candidats inputs) : `nonRegACB`, `governmentPension`,
`incomeRetirement`, `accRentesYear`, `accRetraitsReerYear`, ou un retour
`calculateFiscalReport` NaN. **Plan** : gardes `?? 0` sur les inputs + log DEV
du premier input non-fini dans computeEstateNetWorth, retester, puis retirer le
log. Effort ~1 h. Note : le KPI principal masque le bug via son fallback
`estateNetWorth || finalNetWorth || fireNumber` (FutureProjection.tsx:351).

**Résolution diagnostique (2026-05-22) — root cause identifiée, fix dormant :**
- Diag console (objet déplié) confirme : `liquid` (→ `finalRawNetWorth` → estate)
  devient **NaN**, et SEULEMENT `liquid` → spécifique au cash. Vient d'un champ de
  config numérique vide/NaN dans les **vraies données de Marc** (effacées depuis
  par Clear site data).
- Path enfant uni/voiture **écarté** (UNI_INFO/CAR_INFO complets). Reste real
  estate (mut. 770), childLiquid autre delta (849), ou cashflow (937).
- Les **fixtures de test ne reproduisent PLUS** (corrigées cycles 17/18 : dettes,
  carGift). Confirmé par Marc en mode test : banner visible + cards OK. Donc bug
  non reproductible ni via test ni via données.
- **Tripwire en place (choix Marc, option 1)** : instrumentation throttlée dans
  `projection.ts` (3 mutations de `liquid`) + `estateCalculation.ts`. À la
  prochaine occurrence, la console affiche `[TB3/liquid] NaN après
  <realEstate|childLiquid|cashflow> (mois N)` → fix ciblé immédiat.
  **À retirer une fois TB3 corrigé.**

### TB4 — Réactivité sliders Future ✅ VALIDÉ + 2 BUGS CORRIGÉS (2026-05-22)
Marc a validé manuellement (drag réel). Résultat :
- Slider **Dépenses** : OK (la projection réagit).
- Sliders **Rendement** : ne changeaient RIEN → 2 bugs trouvés et corrigés
  (commit 1134d59) :
  1. `setupSimulation` lisait `projection.rates` (champ inexistant) au lieu de
     `projection.returnRates` → fallback défaut, sliders sans effet. Aligné.
  2. Slider Non-Enregistré : `updateReturnRate` appelé 2× (nonReg+reer) → stale
     closure, le 2e écrasait le 1er → valeur figée. Remplacé par un seul update.
- Les sliders de rendement contrôlent désormais réellement la projection.

## 🐛 P1 — Bugs ouverts / hypothèses non validées

### B1 — Retirement runMC=false vs Future MC=true ✅ RÉSOLU 2026-05-21
Retirement consomme lastProjection.chartData donc reflète automatiquement
le scénario actif + toggle MC de Future. Ajout d'un badge "Scénario actif :
{strategyName}" dans le subtitle de PageHeader pour transparence visuelle.

### B2 — Cohérence coûts enfants ✅ DOCUMENTÉ 2026-05-21
La fonction `getAnnualChildCost` (UI) reste PURE par design — pas de
contexte ménage (revenu, fiscalité). Les éléments contextuels (RQAP,
clawback, commuting, crédit garderie 30%) sont appliqués par le moteur
de projection (childrenReee.ts). Les chiffres NET pour l'UI viennent
de chartData (childGross, childCost, childBenefits) — voir respProjection
dans ChildPlanning.tsx. Documenté en LIMITATIONS dans childCosts.ts.

### B3 — `findEarliestRetirementAge` timeout test 30 s
Le test passe mais le moteur s'alourdit. Si plus de fixes ajoutent du poids :
- [ ] Optimiser le bissection (early-exit si NetWorth diverge)
- Reporté — pas critique (30s OK actuellement)

### B4 — Tests obsolètes potentiels
2 tests fixés cette session (marketData token-en-URL, goalSeek timeout).
- [ ] Audit complet des 52 fichiers de test pour détecter d'autres obsolescences
  (claims sur structures internes qui ont changé)
- Reporté — pas critique (suite 594/594 verte actuellement)

---

## 🎨 P2 — UX & polish

### U1 — Indicateur visuel "Projection requise" partout
Composant `ProjectionRequired` créé mais utilisé seulement dans Retirement.
- [ ] Investments tab : si lastProjection vide, hide horizon KPI
- [ ] Dashboard : indicateur futur disabled si pas de projection
- [ ] TaxCenter : badge "approximation hors projection"

### U2 — Onglet Future : badge "Scénario actif"
Indiquer clairement quel scénario est sélectionné dans Future, vu que
les autres onglets en dépendent maintenant.
- [ ] Sticky banner "Scénario : BASE / LIBERTE_55 / etc." dans Future header

### U3 — Toggle déterministe vs MC plus visible
Avec C1 (centralisation), le toggle MC dans Future impacte tous les onglets.
Le rendre prominent (radio button ?).

### U4 — Tooltip Future : groupes événements
L'agent a noté que le tooltip avec 10+ événements peut devenir long. Bien que
fixed-height OK, on pourrait grouper "Maison • Hypo • Charges • Capital • Intérêts"
sous une section pliable.

### U5 — Dashboard Évolution Détaillée : exporter PNG
Bouton "Télécharger PNG" pour partager le graph.

### U6 — Mode test : indicateur quand fixtures CSV manquent un symbole
Si un test asset n'est pas dans le CSV (regression future), afficher un warning.

### U7 — Sidebar (panneau onglets gauche) : icônes stables + pas de flicker 🟡 P2 (demandé 2026-05-22)
Deux problèmes au repli/déploiement du panneau de gauche :
1. **Icônes qui se déplacent** : l'icône de chaque onglet doit rester à la
   MÊME position horizontale que le panneau soit replié (icône seule) ou déployé
   (icône + label). Actuellement elles bougent.
2. **Flicker** : la transition ouvrir/fermer saccade. La rendre fluide (animer
   `width`/`transform` en CSS, pas de remount du panneau, label en
   `opacity`/`overflow` plutôt que conditionnel monté/démonté).
- Fichier : `components/Layout.tsx` (sidebar) + sous-composants `components/sidebar/`.
- Effort ~2 h + vérif visuelle (replié/déployé, 320/768/1440).

---

## 🎨 Refonte graphs & onglet Futur (demandé par Marc 2026-05-22)

> Gros chantier UX. Plusieurs items nécessitent une vérif visuelle (browser) —
> à faire avec Marc dispo pour valider le rendu.

### G1 — Bug : boutons « Aller à l'onglet Futur » ne marchent pas 🔴 P1
Les CTA des empty-states `ProjectionRequired` (mode strict) ne naviguent pas
vers Future. À vérifier : `navigateWithFocus(Tab.FUTURE)` dans
`components/ui/ProjectionRequired.tsx` (hash routing vs setActiveTab). Effort ~1 h.

### G2 — Bug : texte qui chevauche icônes/cases, surtout onglet Futur ✅ FAIT (2026-05-22)
> Labels de lignes FIRE/Aujourd'hui en pastilles ancrées aux bords (`RefLineLabel`) ;
> les labels-texte d'événements qui se chevauchaient sont remplacés par des
> pastilles-icônes individuelles (cf. G5). Commit `6da3869`.
<!-- description d'origine -->
Overlaps visuels (« c'est moche »). Auditer les `position:absolute`,
`truncate` manquants, largeurs fixes, z-index. Cibler Future en priorité.
Effort ~2 h + vérif responsive 320/768/1440.

### G3 — Onglet Futur en sous-onglets + plein écran ✅ FAIT (2026-05-22)
> Sous-onglets 📈 Graphique / ⚙️ Paramètres (KPIs toujours visibles), commit `53d1faf`.
> Plein écran via la **Fullscreen API** (`requestFullscreen` + `.chart-fullscreen:fullscreen`,
> top layer qui échappe à l'ancêtre transformé), commit `486a324`.
<!-- description d'origine -->
- Sous-onglet **Paramètres** (sliders/config) + sous-onglet **Graphique**
- Bouton **plein écran** sur le graph
- Effort ~3-4 h (restructure layout FutureProjection.tsx + ProjectionControls.tsx)

### G4 — Refonte de TOUS les graphs façon Google Finance ✅ FAIT (2026-05-22)
> Hook réutilisable `useTimeChartZoom` + composant `ZoomContainer`. Zoom molette /
> pan / double-clic reset sur **tous** les graphs : Futur (+ sélecteur de période
> 5/10/20/30 ans), Dette, Retraite ×2, Enfant ×2, Immobilier ×2. Dashboard +
> Investissements avaient déjà molette zoom (ZoomableTimeChart) + leur propre
> sélecteur de période. Commits `53d1faf`, `9a058a3`, `7473809`.
<!-- description d'origine -->
Demande transverse, à appliquer à chaque graph (chacun garde ses params) :
- [ ] **Zoom molette** (in/out) + **pan** gauche/droite via slider/brush
- [ ] **Sélecteur de période depuis le graph** (1A/5A/10A/Max…)
- [ ] **Style/couleurs Google Finance** (ligne fine, gradient sous la courbe,
  grille discrète, hover crosshair) tout en gardant nos paramètres en plus
- Recharts supporte `Brush` (pan) et le zoom via domaine contrôlé ; molette =
  handler `onWheel` custom. Évaluer aussi `recharts` + lib zoom ou alternative.
- Effort ~8-12 h (composant graph réutilisable partagé). **Prérequis** : créer
  un `<FinanceChart>` générique pour ne pas réimplémenter par onglet.

### G5 — Graph Futur : toutes les icônes d'événements, individuellement ✅ FAIT (2026-05-22)
> Une pastille emoji par événement (fin de la fusion « A | B | C »), cliquable →
> fiche détail (date/âge/valeur nette). Anti-spam : dedup labels répétés + plafond
> de densité échantillonné ; zoom révèle tout. `ClickableEventIcon` via le prop
> `shape` du ReferenceDot (recharts v3 ignore LabelList dans ReferenceDot). Commit `22922de`.
<!-- description d'origine -->
Afficher chaque événement (enfant, achat voiture, impôts, hypothèque, vente,
reno, voyage…) avec son icône **distincte et cliquable**, pas un point unique
agrégé. Lié au tooltip G6. Effort ~3 h.

### G6 — Refonte infobulle graph Futur ✅ FAIT (2026-05-22)
> `ExpertTooltip` refondu : conteneur dégradé + barre d'accent + apparition animée,
> en-tête lisible (date gras + badge âge), répartition avec pastilles de couleur,
> valeur nette en hero (dégradé) avec la variation mensuelle en chip. Commit `25f0838`.
<!-- description d'origine -->
Affichage actuel des événements (vente CELIAPP, naissance enfant, etc.) jugé
« cheap ». Rendre plus beau/vivant : carte par événement avec icône, couleur
sémantique, montant formaté, mini-hiérarchie. Fichier
`components/projection/ProjectionTooltip.tsx`. Effort ~3 h.

### G7 — Bug : manifest PWA bloqué par la CSP sous Cloudflare Access ✅ FAIT (2026-05-22)
Réglé via **A12** : policy Bypass Access sur `/manifest.json` (+ `/sw.js`). Marc
a confirmé : les erreurs manifest/CORS ont disparu de la console. Aussi corrigé :
meta `mobile-web-app-capable` ajouté (déprécation apple-, commit 9ac2ca7).
<!-- entrée d'origine ci-dessous conservée pour contexte -->

Console prod : `Loading a manifest from 'https://hubperso.cloudflareaccess.com/
cdn-cgi/access/login/...manifest.json' violates CSP default-src 'self'`. Access
exige l'auth pour `/manifest.json` → redirige vers son login cross-origin →
violé par la CSP. Effet : la PWA ne charge plus son manifest.
**Fix** : ajouter une policy **Bypass** dans Access pour `/manifest.json` ET
`/sw.js` (assets publics, pas de données) — déjà anticipé dans
[AUTH_SETUP.md](AUTH_SETUP.md) §maintenance. Action Cloudflare (Marc), ~10 min.

### G8 — Bug : beacon Cloudflare Insights bloqué par la CSP ✅ FAIT (2026-05-22)
Réglé par whitelist CSP (choix Marc) : `static.cloudflareinsights.com` ajouté au
`script-src` + `cloudflareinsights.com` au `connect-src` (POST du beacon RUM),
dans index.html (CSP active sur Vercel) ET netlify.toml (synchro).
<!-- entrée d'origine ci-dessous -->

`static.cloudflareinsights.com/beacon.min.js` bloqué par `script-src`. Cloudflare
injecte son analytics auto. Comme GA4 est déjà en place, le plus simple :
**désactiver Cloudflare Web Analytics** (dashboard Cloudflare → la zone →
Analytics) OU ajouter `static.cloudflareinsights.com` au `script-src` de
[netlify.toml](../netlify.toml). Cosmétique (aucun impact fonctionnel).

### G9 — Warnings console recharts (dev-only) 🟢 P3
Le conteneur d'un graph a une taille 0 au 1er render (Future). Ajouter
`minWidth`/`minHeight` ou `aspect` sur le ResponsiveContainer concerné.
> 2026-05-22 : aussi observé « Encountered two children with the same key CELI/REER »
> sur les aires empilées (FutureProjection/Retirement). Warning **dev-only** (React
> ne vérifie les keys qu'en dev → absent du build prod), origine probable interne
> recharts v3. Non-bloquant, non corrigé.

### G10 — Service Worker servait du vieux code après deploy ✅ FAIT (2026-05-22)
Galère récurrente de la session : Marc restait coincé sur d'anciens bundles
(ex. worker `CoUPjCPD`, bug #310) malgré les hard-reloads, jusqu'à « Clear site
data ». Cause : `public/sw.js` network-first faisait `fetch(req)` sans
`no-store` → index.html pouvait venir du cache HTTP (stale) → pointait vers
d'anciens hashes de chunks. Et `sw.js` ne changeant jamais d'octets, aucun
nouveau SW ne s'installait (activate/purge jamais re-déclenché).
**Fix (commit d5bf8d1)** : navigation forcée en `cache: 'no-store'` (index
toujours frais en ligne, fallback offline conservé) + bump `CACHE_NAME` v2→v3.
Désormais un nouveau deploy est pris automatiquement au reload, sans Clear.

---

## ⚡ P2 — Performance

### P1 — Bundle size audit complet ✅ AUDITÉ (2026-05-22)
Mesuré (gzip) : recharts 128 KB · index/shell 125 KB · pdf-vendor 128 KB (lazy)
· html2canvas 48 KB (lazy) · ai-vendor 35 KB (lazy) · chaque onglet 3-18 KB (lazy
via TabRouter). **Conclusion** : déjà bien code-splitté (onglets/PDF/IA lazy).
Seul gros poste restant = **recharts (core, charts partout)** → réduire = changer
de lib, gros + risqué. À traiter avec **G4** (la refonte graphs façon Google
Finance pourrait remplacer/alléger recharts). Pas un sujet isolé.

### P2 — Cache portfolio-history.csv en SW ✅ TERMINÉ 2026-05-21
Le SW cache désormais `/assets/*` + `/portfolio-history.csv` +
`/test-portfolio-history.csv` (cache-first, immuable côté serveur).

### P3 — Worker projection : profiler
Le moteur s'est alourdi (childCosts, fix dettes). Mesurer impact sur
keystroke latency dans Future sliders.

---

## 🧪 P2 — Tests

### T1 — Étendre les tests de convergence ✅ TERMINÉ 2026-05-21
- [x] 29 tests dans `projection.convergence.test.ts` (cible 30 ≈ atteinte)
- [x] Tests sur les 9 nouveaux champs chartData (Phase 3 Tier 1+2+3)
- [x] Test plafond REEE 50k\$/enfant
- [x] Test liquidityRunway en retraite
- [x] 3 invariants généraux ajoutés (NetWorth ≥ composants, Expenses > 0, isRetired monotone)
- [ ] Test E2E mode test (E2E Playwright reporté → T2)
- [ ] Test ProjectionRequired affichage (composant rendering test reporté)

### T2 — Tests visuels (Playwright)
- [ ] Screenshot baseline Dashboard / Future / Retraite / Enfant
- [ ] Détecter régression visuelle automatiquement en CI

### T3 — Coverage 80% target
Actuel : ~64 % estimé. Cibles à couvrir :
- [ ] Hooks (`usePortfolioHistory`, `useProjectionSelector`)
- [ ] Composants critiques (Retirement, FutureProjection, ChildPlanning)

### T4 — Vérifier que les 131 tests manuels passent en CI
Le checklist `MANUAL_TEST_CHECKLIST.md` est manuel. Étape : automatiser
les plus critiques en Playwright (cible : 20-30 tests).

---

## 📚 P3 — Documentation

### D1 — Mettre à jour SESSION_HANDOVER.md ✅ TERMINÉ 2026-05-21
- [x] Section dédiée Cycles 17-18 (Mode test + 13 fixes + Mode strict + Centralisation)
- [x] Index des docs mis à jour avec BACKLOG en tête + lien CENTRALIZED_CALC_PROGRESS
- [x] Highlights synthétisés en haut du doc

### D2 — README projet ✅ TERMINÉ 2026-05-21
- [x] Section "Conventions clés" : Future = source unique, mode strict, no-fake
- [x] Section "Raccourcis clavier" Alt+1..9
- [x] Tests count : 573 → 596
- [x] Liens vers BACKLOG, MANUAL_TEST_CHECKLIST, CENTRALIZED_CALC_PROGRESS,
  PROJECTION_OUTPUT_SCHEMA, SECURITY_STRATEGY

### D3 — ADR (Architecture Decision Records) ✅ TERMINÉ 2026-05-21
- [x] ADR 005 — Future = source unique pour les calculs projetés
- [x] ADR 006 — Convention "valeurs réelles ou rien"
- [x] ADR 007 — Authentification Cloudflare Access (implémenté 2026-05-22, voir AUTH_SETUP.md)

### D4 — Doc utilisateur ✅ TERMINÉ 2026-05-21
- [x] [USER_GUIDE.md](USER_GUIDE.md) créé : quick start + tour chaque onglet
  + raccourcis clavier + confidentialité + backups + PWA install + FAQ
  (6 questions courantes)

---

## 🔧 P3 — Dette technique restante

### DT1 — Cleanup imports ✅ FAIT (2026-05-22)
Tous les imports morts retirés (9 fichiers, ~41 warnings clearés) :
recharts mort dans Planning/TaxCenter/Transactions/LifeEvents/DebtManager,
lazy-imports Travel/LifeEvents dans TabRouter, formatNumber/KPIStat/StatGrid/
CATEGORY_ICONS/BudgetConfig divers. Validé typecheck + 604 tests.
- **Reste (DT1b, basse priorité)** : ~460 warnings restants = `no-console`
  (intentionnels/scripts), props/args inutilisés (contrats d'interface),
  `exhaustive-deps` (revue prudente requise), `no-explicit-any` (= DT2).
  Aucun n'est un import mort.

### DT2 — Types `any` résiduels
Le projet utilise encore `any` dans certains endroits (rapidité).
- [ ] Audit `as any` et `: any` → préférer `unknown` ou type précis
- Sprint 3B TH4 a déjà migré `catch (e: any) → unknown`. Reste les composants.

### DT3 — ChildPlanning duplique TEST_DEBTS-like logique
Cf B2 — Reste à aligner totalement UI et moteur.

### DT4 — `services/testFixtures.ts` 300+ lignes
Pourrait être splitté en `testAssets.ts`, `testGoals.ts`, etc.
- **Effort** : 1 h
- **Risque** : low

### DT5 — Worker projection trop monolithique
Le worker fait : projection + Monte Carlo + scénarios. À splitter en
fichiers distincts si le moteur grossit.

---

## 🎯 Quick wins potentiels (< 1 h chacun)

- ❌ Bouton "Reset to defaults" dans Configuration — **reporté** (trop dangereux pour un quick win, perte irréversible)
- [x] Confirm dialog avant `enableTestMode` si données existantes — ✅ déjà fait
- [ ] Export PDF Future avec scénarios — reporté (1h+, builder dédié)
- ❌ Dark/light mode toggle — **reporté** (app en `darkMode: 'class'` sans variables CSS light, re-thémer = gros chantier)
- [x] **PWA install prompt customisé** ✅ 2026-05-21 (banner emerald discret en bas, dismiss 30 jours)
- [ ] Loading skeleton pour les chartes Future pendant calcul (>1s)
- [x] **Keyboard shortcuts Alt+1..9 pour switcher onglets** ✅ 2026-05-21
- [ ] Vue mobile : optimiser Future tab (responsive)
- [x] **U5 Warning fixtures CSV manquant un symbole** ✅ 2026-05-21
- [x] **Q8 Validation format clés API** ✅ 2026-05-21 (Anthropic `sk-ant-*`, Finnhub alphanum ≥15)

---

## ✅ Récemment livré (cycle 17, mai 2026)

Voir [SESSION_HANDOVER.md](SESSION_HANDOVER.md) et `git log --oneline -30`.
Highlights :
- Mode test fixtures + banner + toggle (Sprint cycle 16)
- 13 fixes bugs (Math.round, dettes infinies, Enfant crash, tooltip taille,
  TaxCenter × 100, etc.)
- Centralisation Phase 1+2 : 65 % complet
- CSV historique Yahoo Finance réel (no-fake total)
- Mode strict Retirement + HealthIndicator
- 16 tests Vitest convergence + 131 tests manuels checklist
- Docs SECURITY_STRATEGY + CENTRALIZED_CALC_REFACTOR + PROJECTION_OUTPUT_SCHEMA

---

## Comment maintenir ce backlog

À chaque session :
1. Marquer ✅ les items terminés
2. Ajouter de nouvelles entrées découvertes (avec catégorie P0/P1/P2/P3)
3. Mettre à jour estimés effort
4. Lier vers la doc/PR/commit pertinent

Priorité de traitement :
1. **P0** d'abord (bloquant ou sécurité)
2. **P1** ensuite (centralisation, bugs)
3. **P2/P3** comme rotation en quick-wins entre les gros sujets

## Snapshot de tailles approximatives

| Catégorie | Items ouverts | Effort | Note |
|-----------|---------------|--------|------|
| P0 Sécurité | S2 IndexedDB backup (reporté, dépend décision A8) | ~3 h | S1 auth ✅, B0 #310 ✅, gate lint ✅ |
| P1 Centralisation | C2 (brancher TaxCenter/Investments/RealEstate) + C4 (code mort) | ~4 h | C1 moteur ✅ complet |
| P1 Bugs | **TB3 cards à 0 = NaN confirmé**, G1 boutons « aller Futur » cassés ; TB4 (Marc), B3/B4 reportés | ~2 h | TB3+G1 = vrais bugs |
| 🎨 Refonte graphs & Futur | G2 overlaps, G3 sous-onglets+plein écran, G4 zoom/pan/style Google Finance (tous graphs), G5 icônes events, G6 tooltip | ~20-25 h | demandé 2026-05-22, gros chantier |
| P2 UX | U3 toggle MC, U4 tooltip groups, export PNG/PDF, **U7 sidebar (icônes stables + pas de flicker)** | ~6 h | U2/U5/U6 ✅, dark mode rejeté |
| P2 Performance | P1 bundle audit, P3 profiler worker | ~4 h | P2 SW cache ✅ |
| P2 Tests | T2 Playwright, T3 coverage 64→80%, T4 automatiser manuels | ~8 h | T1 convergence ✅ |
| P3 Docs | — | — | D1-D4 ✅ + AUTH_SETUP ✅ |
| P3 Dette tech | DT2 `any`, DT4 split testFixtures, DT5 split worker | ~5 h | DT1 imports ✅ fait |
| **Total restant** | **~19 items actionnables** | **~55 h** | gros poste = refonte graphs/Futur |

**Progression session 2026-05-25** :
- ✅ **Cycle 17 graphs** terminé : modale détaillée au clic (G9 P1), apport-vs-gain
  par compte (G9 P2), **légende interactive** du graph Futur (G10 — cocher/décocher
  chaque série, persistée). Détails dans le CHANGELOG cycle 17.
- ✅ **G12** — clic n'importe où sur le graph Futur → modale (résolution géométrique).
- ✅ **G13** — explication des mouvements par compte dans le drill-down (gain marché
  vs apport/retrait + moments clés + causes via événements moteur, aucune devinette).
- ✅ **G11** — infobulle au survol refondue en résumé concis, détail complet au clic.
- ✅ **G14-G19** — infobulle : détail par compte + dépenses restaurés (G14) ; libellés
  clarifiés (G15) ; icônes d'événements sur les graphs de compte (G16) ; Monte Carlo
  visible en cône (G17) + reproductibilité confirmée (G18) ; espace de cotisation
  gagné par année CELI/REER (G19, dérivé, aucune extension moteur).
- ✅ **G20** — FHSA/CELIAPP first-class (graphe + infobulle + modale + table d'espace) ;
  moteur émet `CELIAPPMax`. S'affiche quand financé (achat immo futur).
- ✅ **Bugs** réglés : mode test préserve les clés API, badge couple cliquable,
  sidebar onglets fluide (icônes stables au survol).
- ⏳ Reste : TB3 dormant, SH3 backup chiffré (analysé, faible valeur).

### 🎯 INITIATIVE « COPILOTE D'ARGENT » — onglet Futur = passé + présent + futur + optimiseur (GROS CHANTIER MULTI-SESSIONS)

**Vision (Marc, 2026-05-25)** : l'onglet Futur doit être *la meilleure façon possible
de gérer mon argent*. Ligne de vie continue passé→aujourd'hui→futur, qui dit en une
phrase quoi faire et se laisse creuser jusqu'au mois près pour comprendre pourquoi.

**Principe d'affichage transversal — 3 couches (progressive disclosure)** :
- **Couche 0 — Verdict (2 s)** : 1 phrase + 1 chiffre + pastille couleur.
- **Couche 1 — Pourquoi résumé (survol / 1 clic)** : 2-3 raisons clés + graphe.
- **Couche 2 — Détail total (creuser)** : par compte, par année, jour par jour (passé),
  actions concrètes, montages. Règle : tout chiffre de Couche 0/1 est cliquable → sa justif.

**Constat données (audit 2026-05-25)** : passé = AUCUNE source opérationnelle
(`fetchPortfolioHistory()` → [] à `services/finance.ts:135`, `liveCSVBalances` jamais
peuplé, prix quotidiens Finnhub `getHistory()` jamais appelés). Seule vraie donnée
passée = `cached_transactions` (datées au jour, sans `accountType` → mapping requis).
Projection = mensuelle, démarre à aujourd'hui (2026), pas de passé. ⇒ « voir le passé »
= **reconstruire** depuis les transactions, pas juste afficher.

**Pilier A — Ligne de vie (passé + présent + futur)**
- A1 (L) — reconstruire le passé par compte depuis `cached_transactions` (rétro-cumul
  depuis le solde actuel) + mapping accountId→type. Pur/testable. No-fake : depuis la
  1re transaction connue seulement.
- A2 (M, option) — brancher Finnhub `getHistory()` → `priceHistory[]` des Assets pour
  une vraie valeur-marché **quotidienne** des placements (cache local, 1 fetch/jour).
- A3 (M) — fusionner passé réel + futur projeté sur l'axe du graphe (passé plein, futur
  cône MC, jonction « Aujourd'hui »), + période étendue vers le passé.

**Pilier B — Affichage 3 couches**
- B1 (S) — bandeau « Verdict » Couche 0 en haut de l'onglet (optimiseur + santé).
- B2 (M) — « pourquoi » cliquable partout (chaque chiffre → justif en Couche 2).
- B3 (S) — cohérence tooltip=résumé / modale=détail / bandeau=verdict (déjà amorcé).

**Pilier C — Optimiseur (la cervelle)**
- ✅ C1 (FAIT, G21 P1) — reco parmi 7 scénarios + objectif sélectionnable (`strategyRanking.ts`).
- C2 (M) — actions concrètes par année dérivées du meilleur scénario (données déjà
  dans chartData : Contrib*/NetTransfer*/Retrait*).
- C3 (L/XL, moteur) — vraie recherche multi-stratégies : ordre de retrait paramétrable,
  allocations testées, **décision achat RAP vs FHSA vs CELI**, brancher `assetLocation.ts`
  (écrit mais non utilisé), boucle d'optimisation bornée en Web Worker.
- C4 (M, moteur) — Monte Carlo sur les 2-3 finalistes pour classer par robustesse réelle.

**Ordre de construction recommandé** : C2 → B1 → A1 → A3 → B2 → A2 → C3 → C4.
(D'abord la valeur immédiate sur données dispo ; le gros moteur C3 en dernier quand le reste est solide.)

**Avancement (2026-05-26)** : ✅ A1 (reconstruction, testé) · ✅ A2 (fetch Finnhub) ·
✅ A3 (passé+futur fusionnés) · ✅ B1 (verdict) · ✅ B2 (pourquoi/classement) ·
✅ C1 (reco objectif) · ✅ C2 (plan d'action annuel) · ✅ C3 incrément 1 (compare
4 façons de gérer sous monde BASE, stress hors classement) ·
✅ C3 suite — décision RAP-vs-FHSA (`PRIO_CELI_NO_RAP`), `assetLocation.ts` branché
(`AssetLocationPanel`), 5 stratégies `kind=strategy` comparables, 659 tests verts ·
✅ C4 — Monte Carlo de robustesse sur les **5 stratégies**, classées par **taux de
succès** (% des sims où le patrimoine ne s'épuise pas). `strategyRobustness.ts` +
worker (mode robustesse, watchdog progression) + `RobustnessPanel` (bouton, 1000
sims/stratégie). Fix bug dormant : le MC hardcodait AUTO_MARGINAL. 669 tests verts.
**Reste G21** : valider le **passé réel A3** sur données réelles (titres datés + clé Finnhub).


Demande Marc : l'onglet Futur doit tester plein de stratégies (ordre de retrait,
allocation cotisations, RAP vs FHSA vs CELI pour l'achat immo, timing) et **proposer
LA meilleure** façon, en actions concrètes. État actuel (audit moteur) :
- 7 scénarios statiques, **sélection manuelle** (`selectedScenarioIdx`), pas d'auto-best.
- `drawdownOptimizer.ts` = **code mort** (n'optimise rien) ; ordre de retrait **codé en
  dur** par stratégie dans `cashflowAllocation.ts:180-195`.
- `assetLocation.ts` complet mais **non branché** au moteur.
- Allocation cotisations = ordre fixe par stratégie (pas d'optimisation dynamique).
- FHSA **cédé en bloc** à l'achat (`realEstateMonth.ts:144-149`) ; RAP = cascade fixe
  (RAP → CELI → NonReg → REER), **aucune décision RAP vs FHSA vs CELI**.
- Aucune boucle multi-stratégies déterministe (sauf les 7 scénarios + MC sur le choisi).

À définir avec Marc : critère d'optimisation (valeur finale ? impôt ? date FIRE ?
succès MC ?), agressivité des recommandations, format des actions proposées.

**Progression session 2026-05-22** :
- ✅ **S1 — Cloudflare Access** activé (login Google, restreint à Marc) + [AUTH_SETUP.md](AUTH_SETUP.md)
- ✅ **B0 — React #310** corrigé (HealthIndicator : early-return après les hooks)
- ✅ **Gate lint** : étape CI + `prebuild: npm run lint` (bloque rules-of-hooks avant prod)
- ✅ **B0 #310 + G1 boutons** confirmés réglés EN PROD par Marc (post hard-reload)
- ✅ **TB3** root cause identifiée (`liquid` NaN venant des vraies données de Marc) ;
  fixtures ne reproduisent plus → bug **dormant**, tripwire posé (option 1 de Marc)
- ✅ **DT1 imports** : tous les imports morts retirés (9 fichiers, 502→461 warnings)
- 🆕 **Refonte graphs & Futur** (G1-G6) + bugs CSP (G7-G9) ajoutés au backlog
- ⏳ Actions Marc en attente : **A12** (bypass Access manifest, PWA), drag sliders (TB4)

**Progression session 2026-05-21** :
- ✅ **Mode strict TOTAL** : 8 composants migrés (Dashboard, Investments, Budget, RealEstate, Planning, ChildPlanning, HealthIndicator, Retirement) + ProjectionRequired
- ✅ **Centralisation Phase 3 Tier 1+2+3** : 9 nouveaux champs chartData (realNetWorth, liquidityRunway, mortgageRemainingMonths, reeeContribCum, reeeGrantsCum, DividendIncome, TaxableInvIncome, **marginalTaxRate, effectiveTaxRate**)
- ✅ **ChildPlanning respProjection** branché sur reeeContribCum/reeeGrantsCum (vraies données moteur)
- ✅ **B1 décision UX** : Badge "Scénario actif" dans Retirement + sync avec Future
- ✅ **B2 cohérence enfants** : LIMITATIONS documentées dans childCosts.ts
- ✅ **Q3 keyboard shortcuts** : Alt+1..9 pour switcher d'onglet
- ✅ **+7 tests Vitest** convergence (596/596 verts au total)
- ✅ **DT1 cleanup** : variables locales ChildPlanning post-migration retirées
- ✅ **D1 SESSION_HANDOVER** : section dédiée cycles 17-18 + index docs mis à jour
- ✅ **D2 README** : conventions clés + raccourcis clavier + liens docs
- ✅ **D3 ADR** : 3 nouveaux ADRs (005 Future source unique, 006 no-fake, 007 auth)
- ✅ **BACKLOG.md** maintenu à jour à chaque batch

**Items livrés cette session : 17** (vs ~40 restants au début)
**Tests : 583 → 596** (+13)
**Docs : 11 nouveaux fichiers**
