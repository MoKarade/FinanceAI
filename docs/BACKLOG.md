# BACKLOG — FinanceAI (actionnable)

> Liste **courte** de ce qui RESTE à faire. L'historique complet des items livrés est
> archivé dans [`docs/HISTORIQUE.md`](HISTORIQUE.md) (fusion de tous les snapshots/audits/designs livrés).
> Audit qualité détaillé : voir `docs/HISTORIQUE.md` (section `AAA_AUDIT_2026-06.md`).
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
- [ ] **[LABEL-NW-SUCCESSORAL]** 🧭 🔧 ◑PARTIEL MEDIUM — l'écart « projection Budget ≠ reste » est un **libellé**,
  pas un calcul : Budget affiche `estateNetWorth` (patrimoine **successoral**, net d'impôt au décès + NPV rentes,
  `estateCalculation.ts:195`) vs `chartData[dernier].NetWorth` ailleurs. Source unique RESPECTÉE. 🧭 Décision :
  soit Budget affiche aussi le NW fin-horizon (parité stricte), soit clarifier « successoral » vs « fin
  d'horizon » partout (libellés + infobulle). PAS un correctif moteur. ≠ `[NW-PARITY-INVARIANT]`.
- [ ] **[PROJ-INSOLVENCY-BADGE]** 🔧 ✗FAUX(bug)→UX MEDIUM — un NW projeté négatif (Karim −1,88 M$) n'est PAS un
  bug : c'est de la dette liquide VISIBLE d'un persona insoutenable (retraite 50 ans). Mais l'afficher nu est
  anxiogène. Exposer l'insolvabilité : badge « plan insoutenable / capital épuisé à l'âge X » quand
  `shortfallRate > seuil` ou NW franchit 0. Vrai service de planification (le signal utile).

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
- [ ] **[UI-SCORES-UNIFY]** 🧭 🔧 ✅VÉRIDIQUE MEDIUM — **4** scores 0-100 concurrents sans grille : « Santé /100 »
  diversif. (`Investments:417`), « Efficacité fiscale /100 » (`AssetLocationCard:106`), « Complétude % »
  (`SetupHub`), donut « Santé financière /100 » ratios (`HealthIndicator:231`). Deux « Santé » mesurent des
  choses différentes. → 1 score global (Accueil), les autres « sous-mesure ». 🧭.
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
- [ ] **[FMT-CASING-ACCOUNTTYPE]** 🔧 LOW (nouveau, trouvé en validation) — casse incohérente `CRYPTO`(enum)
  /`Crypto`(clé chart), `NON-ENREG`/`NonReg`, mappée à la main (`Dashboard.tsx:290-291`) = **bug latent**.
  Une seule fonction `accountTypeToChartKey()`. (dedup CELI/REER déjà corrigé — `new Set`.)
- [ ] **[UI-TX-CLEANUP]** 🔧 ◑PARTIEL LOW — Transactions : pastille **AUTO** sans légende visible
  (`Transactions.tsx:624`, `title` seul) → légende/tooltip explicite. Colonne TYPE (toggle Transfert/Transaction)
  = artefact data, pas constant (NON prioritaire).
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

## 🚀 MCP FinanceAI → Cloud Run [⏳ gros chantier] (brief Marc 2026-06-16)
> Le serveur MCP perso FinanceAI (finances : Drive/BigQuery, comptes CELI/REER/CELIAPP/REEE) tourne en
> local (stdio), token Google en **fichier**. **Symptôme** : `get_financial_overview` → `invalid_grant`
> (« Token has been expired or revoked ») alors que `ping` répond. **But** : serveur **distant** hébergé sur
> **Google Cloud Run**, stable, sécurisé, redéployé à chaque push. **Code : dossier `mcp/`.**
> ⚠️ **PLAN-FIRST** : phase 0 (explore + rapport) AVANT tout code ; **OK Marc requis avant la phase d'écriture.**
> ⚠️ **DEUX OAuth distincts** : **A** = serveur ↔ Google (lire les finances Drive/BigQuery — c'est CE token qui
> est mort, à persister hors disque + rafraîchir) ; **B** = Claude ↔ serveur (auth du connecteur — Bearer
> d'abord, architecture prête pour OAuth 2.1 plus tard). NE PAS les confondre.

- [ ] **[MCP-CLOUDRUN-0]** 🔧 **Phase 0 — explorer + rapporter (LECTURE SEULE, ne rien modifier)** :
  langage/framework MCP (FastMCP Python ? `@modelcontextprotocol/sdk` TS ? autre ?) ; transport actuel +
  entrée du serveur ; où/comment le token Google est lu/écrit (fichier ? chemin ? lib OAuth ?) ; où vivent
  `client_id`/`client_secret` (clair ? `.env` ?) ; scopes Google + `access_type`/`prompt` ; **liste
  exhaustive des outils MCP exposés** (pour ne rien casser). → rapport court + plan → **attendre l'OK Marc**.
- [ ] **[MCP-CLOUDRUN-A]** 🔧 **Auth A (serveur ↔ Google — le token mort)** : module `token_store` qui
  lit/écrit le refresh token dans **Secret Manager** (`financeai-google-refresh`), jamais en fichier ;
  `client_id`/`client_secret` depuis `financeai-google-client` ; flux `access_type=offline` + `prompt=consent` ;
  si Google renvoie un nouveau refresh token → **réécrire le secret** ; **gérer `invalid_grant` explicitement**
  (log clair + message MCP exploitable « reconnecte Google », pas de crash) + outil/chemin de ré-consentement.
- [ ] **[MCP-CLOUDRUN-B]** 🔧 **Sécurité B (Claude ↔ serveur)** : middleware exigeant
  `Authorization: Bearer <FINANCEAI_API_KEY>` (clé en secret/env) → **401** sinon ; point d'extension commenté
  pour OAuth 2.1 (401 + `WWW-Authenticate`).
- [ ] **[MCP-CLOUDRUN-HTTP]** 🔧 **Transport** : stdio → **Streamable HTTP**, endpoint unique `/mcp`
  (POST + GET), écoute `0.0.0.0:$PORT` (défaut **8080**) ; garder un mode stdio via `MCP_TRANSPORT=stdio|http`
  pour le dev local.
- [ ] **[MCP-CLOUDRUN-DEPLOY]** 🔧 **Conteneur + CI/CD** : Dockerfile (EXPOSE 8080, démarre sur `PORT`) +
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
### 🔬 Audit financier 2026-06-17 (findings vérifiés — `docs/AUDIT_FINANCIER_2026-06-17.md`)
> Cœur money-critical = AAA (conservation prouvée ≤0,02 $/~25 scénarios, fiscalité 0 écart). **Tous les findings
> ci-dessous sont à la PÉRIPHÉRIE** (consommateurs UI/IA/viz qui recalculent au lieu de la source unique) — aucun
> n'altère la VALEUR du patrimoine net. Lot d'implémentation : commencer par le keystone PUIS H1/H2 (test avant fix).
- [~] **[NW-PARITY-INVARIANT]** 🔧 HIGH (★ garde-fou keystone) — **PARTIELLEMENT LIVRÉ (PR audit)** : SOURCE UNIQUE
  `computePresentNetWorth` (`services/portfolio.ts`) + les 3 surfaces présentes (`useDerivedFinancials`, `financialSnapshot`,
  `AiAssistant`) y routent → parité PAR CONSTRUCTION + garde unitaire discriminant (persona endetté + devise étrangère,
  `tests/services/portfolio.test.ts`). **RESTE** : le cross-check explicite « NW présent ≡ `chartData[0].NetWorth` (moteur
  mois 0) » (extension d'`INV-1` au présent — vérifier d'abord l'alignement init moteur). Effort S.
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
- [ ] **[FISC-WHT-HARDCODE]** (M1) 🔍 MEDIUM — `services/projection.ts:1390` `totalTaxesPaid += … + retraitReerMois * 0.15`.
  ⚠️ **Analyse 2026-06-17 : NE PAS appliquer le fix de surface (0.15→0.29) tel quel.** Post-#314, la retenue REER est un
  ACOMPTE débité en AVRIL (dans `fluxImpots` d'avril, l.738) → l'ajouter AUSSI mensuellement l.1390 est un possible
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
- [ ] **[FISC-CONST-LINT]** 🔧 MEDIUM (garde-fou) — test/règle ESLint : aucun littéral fiscal connu (`0.15`/`0.5`/`0.30`/
  paliers) hors `utils/tax.ts`/`realEstate.ts`. Ferme structurellement la classe M1-M3. Effort M.
- [x] **[AI-SNAP-FREQ]** (L4) ✅ LOW (livré) — `monthlyExpenses` NORMALISÉ par fréquence + hors épargne :
  `financialSnapshot` via `computeMonthlyBudgetAggregates`, `NextBestAction` via `monthlyAmountFor` (excl. Epargne).
  Avant : Σ brute des cibles (poste annuel compté ×12) envoyée à l'IA/MCP. 29 tests verts.
- [x] **[AI-NBA-FX]** ✅ LOW (livré) — `NextBestAction` utilise désormais les `fxRates` RÉELS du store (avant : `{}`
  → actifs étrangers à 1:1). NW + ventilation CELI/REER envoyés à l'IA corrects. (DRY complet via `buildFinancialSnapshot`
  reste un nice-to-have séparé — duplication du snapshot inline, consigné.)
- [ ] **[ENG-LOOP-ORDER-TEST]** (L1) 🔧 LOW — boucle mensuelle `services/projection.ts` : l'ordre croissance↔allocation est
  money-critical mais AUCUN invariant ne teste l'ORDRE (INV-2 attrape une fuite, pas une inversion qui conserve l'argent en
  faussant les rendements). Fix : test « ordre » discriminant (2 scénarios). Effort S.
- [ ] **[ENG-MONTHLYOUTPUT-TEST]** (L2) 🔧 LOW — `services/projection/monthlyOutput.ts` (102 champs) : seul sous-module (1/31)
  sans test dédié. Fix : test unitaire de mapping ctx→point. Effort S.
- [ ] **[ENG-TAX-NS]** (L3) 🔧 LOW/🧭 — `services/tax.ts` = alias `export *` jamais résorbé → imports incohérents
  (`services/tax` vs `utils/tax`). Décision Marc : finir la migration ou supprimer l'alias. Effort S.
- [ ] **[FISC-WELCOME-2026]** 🔧 LOW — `services/realEstate.ts:101-105` : seuils mutation « reste_qc » millésime **2025**
  (58 900/290 000/552 300) à réindexer 2026. ⚠️ exiger les valeurs officielles RQ 2026 (NE PAS deviner), corriger code+doc même PR.
- [ ] **[REEE-LITERALS]** 🔧 LOW (hygiène) — `services/projection/childrenReee.ts` : SCEE/IQEE = littéraux non nommés
  (valeurs CORRECTES). Extraire en constantes si on y retouche. Aucun impact $.
- [ ] **[NW-ASSETBREAKDOWN-DRY]** 🔧 LOW (audit 2026-06-17, panel) — `utils/useDerivedFinancials.ts:50-62` :
  `assetBreakdown` ET `currentLiquidity` recalculent INLINE (FX `||1`) au lieu de `computeAssetBreakdown`/
  `computeCurrentLiquidity` (`services/portfolio.ts`) ; `assetBreakdown` local OMET `crypto` (le helper l'a).
  Même motif « recalcul local au lieu du helper ». Router vers les helpers. Effort S.

### 🛡️ Durcissement structurel (brief Marc 2026-06-17, post-audit) — VALIDÉ + reformulé pour l'app
> Objectif Marc : rendre bugs math / blocages UI / corruptions de données structurellement impossibles. Statut vérifié
> contre le code actuel — certains tickets sont DÉJÀ faits (ne pas refaire), d'autres partiels. IDs reformulés pour FinanceAI.

**ÉPIC 1 — Noyau de calcul & preuve**
- [ ] **[HARDEN-FUZZING]** 🔧 HIGH (nouveau, ticket 1.1) — property-based testing des invariants de conservation avec
  **fast-check** (à installer). Générateurs bornés (salaires 0-1M, dettes, rendements −40 %..+40 %, inflation, âges) →
  boucler `calculateFutureProjection`, vérifier le résiduel-**BILAN** `ΔNW==ΔΣactifs−ΔΣdettes` ≤ 0,05 $ sur 100 % des mois
  (PAS la forme épargne+croissance−impôt, qui faux-positive sur les flux one-time — cf CLAUDE.md). Échec → afficher la SEED.
  ⚠️ borner les runs CI (~300-1000, pas 10 000 : 480 mois × N stratégies, coûteux). Complète les 25 scénarios fixes actuels.
- [ ] **[HARDEN-NETWORTH-EXHAUSTIVE]** 🔧 MEDIUM (nouveau, ticket 1.2) — test d'exhaustivité sur `NetWorthParts` (la vraie
  frontière du bilan, pas `Assets`) : forcer `Record<keyof NetWorthParts, number>` → si un futur actif/dette est ajouté au
  bilan sans être traité par `computeRawNetWorth`, le typecheck casse. Empêche un terme oublié (classe MONEY-PHANTOM).
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
- [ ] **[HARDEN-FISCAL-TIMEBOMB]** 🔧 MEDIUM (nouveau, ticket 3.1) — test qui ALERTE quand la fiscalité périme. ⚠️ PAS un
  hard `Date.now() < 2027` (casserait TOUS les déploiements le 1ᵉʳ janvier, même un hotfix non-fiscal) → lire la date
  « Dernière vérification » de `FISCAL_REFERENCE.md` et échouer si > N mois, OU warning au build. Aligné `/audit-financier`.
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


  `services/projection/netWorth.ts:33` `computeRawNetWorth` n'a AUCUNE garde `Number.isFinite` : un terme non
  fini (`liquid`/`reer` NaN) se propage au patrimoine affiché SANS `logError` (graphe vide, sans trace). Dette
  PRÉEXISTANTE (le fix REER ne l'aggrave pas ; décembre garde déjà `.reer` via `Number.isFinite`). Fix : garder
  chaque terme (rabattre sur 0 + `logError(source:'projection')`), miroir de la garde NaN dette de MONEY-PHANTOM.
- [ ] **[FISC-ESTATE-PENSION-NPV]** 🔧 MEDIUM — NPV des rentes publiques (RRQ/PSV) au bilan successoral :
  montant MENSUEL × facteur d'annuité ANNUEL sans ×12 (`estateCalculation.ts:177-187`) → composante
  sous-évaluée ~12× (ex. -370 k$ sur `estateNetWorth` pour un profil 1200 $/mois). N'affecte PAS le NW
  mensuel. Fix : annualiser (×12) avant le facteur d'annuité.
- [ ] **[FISC-EVENT-INCOMELOSS]** 🔧 MEDIUM — `incomeLossPercent`/`durationMonths` (PERTE_EMPLOI,
  SABBATIQUE, ACCIDENT) collectés par l'UI mais JAMAIS appliqués par le moteur (`monthlyEvents.ts:95-100`
  ne lit que `impactAmount`) → une perte d'emploi de 6 mois (30-60 k$) est ignorée (no-op silencieux).
  Fix : réduire le revenu de `incomeLossPercent`% pendant `durationMonths` dès `e.date`.
- [ ] **[FISC-RE-SALE-RESIDUAL]** 🔧 MEDIUM — vente immobilière à équité négative (hypo > 95 % valeur) :
  `addLiquid(Math.max(0, saleNet))` (`monthlyEvents.ts:72-79`) efface la dette résiduelle (clamp à 0)
  alors que l'équité positive est retirée → patrimoine légèrement surévalué. Fix : `addLiquid(saleNet)`
  (laisser le découvert tomber dans la cascade liquidDebt).
- [ ] **[FISC-ASSETLOC-INTL]** 🔧 MEDIUM — asset-location : classe `international` jamais analysée →
  retenue étrangère 15 % en CELI/REER non comptée (`assetLocation.ts:104-132`) ; l'outil dit « optimal »
  alors qu'une perte existe (~375 $/an sur 100 k$ international en CELI). Fix non trivial (le patch naïf
  reste 0 : taxIdeal NonReg=marginalRate domine) — modéliser le coût de détention.
- [ ] **[FISC-SRCDED-NOOP]** 🔧 MEDIUM/LOW — `optimizeSourceDeductions` (V49) : réduction de la retenue
  salariale selon cotisations REER/CELIAPP toujours NULLE (ordre d'exécution, `monthlyCalcs.ts:98-112`) +
  bug d'unité mensuel/annuel sous-jacent. Effet net ~0 (régularisé en avril) mais cashflow mensuel et
  solde d'avril faussés. Fix : calculer la retenue APRÈS la cascade d'allocation + unité annuelle.
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
- [ ] **[FISC-TAXDEC-INCR]** 🔧 LOW (requalifié de MEDIUM, triage 2026-06-16 — `fixIsSafe:false`) — `taxDecember.ts:694-730` : 3 sous-claims RÉELS mais bornés. (a) crédit d'âge omis sur l'incrément gains/div → ne joue QUE dans la zone d'érosion du crédit (s'annule ailleurs comme le BPA), sous-imposition légère bornée. (b) gains+div empilés depuis la MÊME base (pas en cascade) → sous-imposition d'un retraité gros gains ET gros div franchissant un palier ensemble. (c) FSS sur revenu moyen du couple → **déjà documenté in situ** (taxDecember.ts:653-658, plafond 1 000 $/adulte). ⚠️ Fix RISQUÉ : un `ageOpts` mal aligné FABRIQUE un écart artificiel ; chaîner gains→div risque le double-comptage ; re-base les snapshots d'impôt de décembre → exige tests de non-régression + OK Marc. Différé.
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
- [ ] **[A11Y-CHARTS]** 🔧 HIGH (PHASE 1 faite 2026-06-16, phase 2 restante) — graphes Recharts sans alternative textuelle (WCAG 1.1.1 A). **Phase 1 LIVRÉE** : primitif réutilisable `<ChartDataTable>` (table sr-only, caption + en-têtes scope + échantillonnage uniforme ≤40 lignes, formateurs délégués + mode privé) ; intégré dans le wrapper partagé `ZoomableTimeChart` (couvre `StockChart` + `DashboardEvolutionChart`) — placé en FRÈRE du conteneur `role="img"` (un SR ne traverse pas dedans). 3 tests. **Phase 2 RESTE** : câbler `<ChartDataTable>` aux ~12 graphes à `ResponsiveContainer` brut (FutureProjection courbe principale, Retirement, RealEstate amortissement, Investments allocation, Budget, ChildPlanning, DebtManager, LifeEvents, DividendPanel, MultiPropertyComparison, FutureDetailModal) — chacun fournit ses colonnes/données.
- [ ] **[A11Y-INK500]** 🔧 LOW — `ink-500` (#6a7689, reserve disabled) sur ~193 contenus actifs (echec AA normal). Passer a `ink-400` (#8896a8, AA ✅ 5,21-6,42 cf check-contrast). **Avancement** : `TaxBracketViz.tsx` fait (4 occ., via [A11Y-TAXBRACKET], 2026-06-17). ⚠️ PAS un sed global aveugle : ne migrer QUE le contenu actif/informationnel, LAISSER `ink-500` sur les vrais éléments `disabled`.

### Echecs silencieux
- [x] **[SF-PDF]** ✅ MEDIUM (2026-06-16) — `pdfReport.ts` : échec jsPDF routé vers `logError({source:'ui'})` (visible en prod via SystemView) ; repli print conservé.
- [x] **[SF-RESIDUS]** ✅ LOW (2026-06-16) — `StockComparisonModal.tsx:41` (→ network/warning), `FutureProjection.tsx:464` (→ ui/error, context = champs manquants, pas les objets financiers), `TaxCenter.tsx:89` (→ ai/error) routés vers `logError`. `syncOrchestrator.ts` était déjà propre (référence BACKLOG périmée).

### Tests / dette technique
- [ ] **[TEST-PROJ-MODULES]** 🔧 MEDIUM — 3 sous-modules projection money-critical sans test direct : `assetLocation.ts`, `monthlyOutput.ts`, `strategyConfig.ts`.
- [x] **[DETTE-PDF-FORMAT]** ✅ MEDIUM (2026-06-16) — `pdfReport.ts` : `formatCAD` local retiré → importé de `utils/format` (source unique fr-CA ; bonus : valeurs non finies → '—' au lieu de « NaN $ »). Tests pdfReport/pdfScenarios verts.
- [ ] **[DETTE-RE-SALE]** 🔧 LOW — `monthlyEvents.ts:70` : vente immo pilotee par sous-chaine « vente » du nom + premier immeuble hypotheque (peut vendre la RP exempte au lieu du locatif). Lier a un `propertyId`.
- [ ] **[DETTE-DEADCODE]** 🔧 LOW — `runBuyVsRent` (`realEstate.ts:639`) jamais appele hors tests ; verifier aussi `clearCredentials`, facade `getProfile`, `buildTestFixtures`.
- [ ] **[DETTE-GODFILES]** ⏳ — decouper par barrel : `utils/tax.ts`, `syncOrchestrator.ts`, `Investments.tsx`, `Budget.tsx`, `FutureProjection.tsx`.
- [ ] **[DETTE-UI-PRIMITIVES]** ⏳ — `components/ui/Input|Select|Field` sur les tokens existants ; migrer 16 fichiers a `<input>` inline.

### Performance
- [ ] **[PERF-BOOT]** 🔧 — `App.tsx:401` : `hydrateAssets` `sleep(2500)` sequentiel par actif → pool concurrent borne.
- [ ] **[PERF-WITHHOLDING]** 🔧 — `monthlyCalcs.ts:80` : memoïser `computeMonthlyWithholding` par cle d'invariance.
- [ ] **[PERF-BUNDLE]** 🔧 — 3 `INEFFECTIVE_DYNAMIC_IMPORT` (`claude.ts`, `backupAuto.ts`, `lockedProjectionStore`) → tout-statique ou tout-dynamique par module.
- [ ] **[PERF-MISSINGDATA]** 🔧 — `MissingDataBanner.tsx:209` : selecteur atomique (`useShallow`) pour eviter les re-renders pendant le calcul MC.

### Securite (deja connu / Marc)
- [ ] **[SECU-O4]** 👤 — avant hebergement multi-utilisateurs : proxy backend pour la cle Anthropic (retirer `dangerouslyAllowBrowser`) + Finnhub en header serveur. Cf `A_FAIRE_MOI` O4.
- [x] **[BACKUP-PASSPHRASE]** ✅ LOW (2026-06-17) — `BackupPanel.tsx` : TOUS les seuils (export/import, label, boutons) alignés sur `MIN_PASSPHRASE_LENGTH` (12, importé de `syncOrchestrator` comme `PassphraseGate`). Fin de l'incohérence export-12/import-8 (l'import acceptait des passphrases de 8).

---

## 🔬 Panel agents — validation Phase 5 (2026-06-17, findings sur #322-324 + surfaces touchées)
> Issus du test empirique du nouvel environnement d'agents (PR #325). Vrais findings sur du code DÉJÀ mergé
> (l'audit money-critical précédent visait le $, pas la résilience SDK / l'UX / la vie privée / l'a11y).
> Aucun CRITIQUE/ÉLEVÉ. Sévérité en tête.

### IA / SDK Anthropic (ai-reviewer)
- [x] **[NBA-CACHE-STALE]** ✅ MEDIUM (2026-06-17, BATCH2b) — `snapshotSig()` (netWorth arrondi + revenu + dépenses + nb dettes/objectifs + couple) stockée avec le cache ; `readCache(sig)` invalide si la signature diffère → plus de conseils basés sur un profil périmé. Rétro-compat : ancien cache sans `sig` valide par TTL, réécrit au 1er fetch.
- [x] **[AI-VISION-TIMEOUT]** ✅ MEDIUM (2026-06-17, BATCH2a) — `analyzePayslip` + `analyzeBankStatement` bornés par `makeTimeoutSignal(undefined, 90_000)` + `{ signal }` passé à `messages.create` + `cleanup()` → abort au timeout, fin du spinner infini.
- [ ] ~~**[AI-SNAPSHOT-DUP]** (fix d'origine)~~ ⚠️ **PRÉMISSE FAUSSE** (vérifié 2026-06-17, lecture du code) — les 2 `FinancialSnapshot` ne sont PAS identiques (`claude.ts` = `topDebts`/`activeGoals`/âges/soldes ; `financialSnapshot.ts` = `totalDebt`/`userCount`) et `buildFinancialSnapshot` n'est appelé par AUCUN runtime (def + tests + docs seulement). Le fix naïf (NextBestAction appelle `buildFinancialSnapshot`) serait FAUX (shapes incompatibles). **Résidu RÉEL restreint** : (a) collision de NOM entre 2 interfaces → en renommer une (`FinancialOverviewSnapshot` ?) ; (b) `buildFinancialSnapshot` = dead code → vérifier/supprimer (lié [CA-01]). NE PAS appliquer le fix d'origine.
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
- [ ] **[DEAD-FLT-2]** 🧹 (suite #246) — purger toute la CHAÎNE du stub `fetchPortfolioHistory`
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
- [ ] **[PH3-c-bis]** 🧭 (décision Marc) — `User.industry` : ZÉRO consommateur réel (gardé sur mandat,
  étiqueté « informatif ») — purger ou brancher ? · `ProjectionConfig.futureProvince/MoveYear` (W2.7) :
  orphelins, candidats audit · `rsuYearsRemaining` : consommé par le moteur mais SANS éditeur UI
  (défaut 99 ans) — ajouter le champ à la section carrière ou retirer du moteur.

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
- [ ] **[P0-PROXY]** 🔧 Proxy backend pour la clé Anthropic (H3) : `services/claude.ts` utilise
  `dangerouslyAllowBrowser` (clé exposée navigateur — OK solo, inacceptable pour des tiers).
  Cible Vercel Edge (free tier). Claude code le proxy ; déploiement + secret = Marc.
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
- [ ] **[RECH-ACTION-UX]** 🔧 MEDIUM — page de **recherche d'action** (Investissement, autocomplétion
  Finnhub #255) : (1) **agrandir** la page/zone de recherche (trop petite) ; (2) **BUG** : sélectionner le
  prix **fait QUITTER la page** → corriger (probable submit/blur qui navigue ou ferme la modale).
- [ ] **[FINNHUB-MISMATCH]** 🔧 MEDIUM — l'autocomplétion **propose des symboles** mais Finnhub **ne les
  retrouve pas** ensuite (quote introuvable au lookup de prix). Réconcilier la source d'autocomplétion avec
  le lookup Finnhub : filtrer aux symboles réellement cotés/supportés, ou fallback propre + message clair.

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
- [ ] **[CA-01]** Code mort utils/ : `csvExport.ts` (109 l) + `safeNumber.ts` (30 l) entiers +
  exports orphelins (addPurchase/removePurchase, formatMonthYear, formatCompactCAD,
  getHasUserDataSnapshot). Confirmer via `npm run knip` avant suppression. (S)
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
- [ ] **[D6-PRIV-MONTANTS]** ❓DÉCISION MARC (découverte audit a11y du lot sliders) — incohérence produit :
  les montants $ des sliders REER/CELIAPP (TaxCenter), REEE (ChildPlanning) et paiement suppl. (DebtManager)
  s'affichent EN CLAIR en mode privé (pas de `<PrivateAmount>`/`privacy-blur`), alors que prix immo, revenus/
  dépenses théoriques, mise de fonds y sont masqués. Veux-tu ces montants privés aussi ? Si oui : envelopper
  la valeur dans `<PrivateAmount>` + ajouter `{...maskedSliderAria(isPrivacyMode)}` au slider (les deux ensemble).
  Sinon, fermer. Pas un bug a11y — pur choix de confidentialité produit. (S)
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
