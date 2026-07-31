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

## Plan d'exécution (vagues — PM + analyses code/fiscal 2026-07-31)

> Synthèse des 3 analyses (PM : ordre/valeur · code-analyzer : 15 findings nouveaux ·
> financial-integrity : 8 findings nouveaux MESURÉS + requalifications). Rapports condensés en
> scratchpad de session ; détail par item dans les sections ci-dessous.
> ✅ TOUTES les questions Marc sont répondues (2026-07-31, section 🧭) — plus aucune vague gatée
> sur lui. Restent gatés sur des SOURCES EXTERNES : FISC-GIS-COUPLE-RATE (table Service Canada),
> FISC-LINE361 (Annexe B), FISC-FED-CREDITRATE-15 (source ARC primaire).

- [x] **V1 — Quick wins confiance + hygiène** ✅ 2026-07-31 (PR #549, items archivés) : `[MCP-TAX-FHSA-BALANCE]` (clamp) +
  `[DASH-HIST-CARDS-LABEL]` + `[PROJ-TAXPAID-LABEL]` + `[BIAIS-CAGR]` + `[DEP-ESBUILD-UNLISTED]` +
  `[DETTE-SHADE-OUTOFPALETTE]` + `[DEADCODE-TX-TYPEFILTER]` + `[FISC-REF-FRESHNESS]`
  (doc : dater §4, nettoyer réserve §8, documenter 0.92/EST_*/REEE_AIP au doc).
- [x] **V2 — Meltdown honnête** ✅ 2026-07-31 (PR V2, discriminant git-stash prouvé 2/2) :
  `[WHT-DISPLAY-MELTDOWN]` (requalifié ÉLEVÉ — le ranking de stratégies pèse un impôt sous-compté
  ×2,6, MESURÉ) + `[ENG-MELTDOWN-FLOW-INVISIBLE]` (774 k$ de retraits invisibles des flux).
- [ ] **V3 — Parité état + tests money-critical** (1-2 PR) : `[DEFAULTS-DRIFT-FINTABLE-FIELDS]`
  (bug réel + garde bidirectionnel) + `[TEST-GAP-TAXESTIMATE]` + `[TEST-GAP-SUBSCRIPTIONS]` +
  `[TEST-GAP-ROLESCONFIG]` + `[PV-11e]` + `[NW-PARITY-SURFACES-TEST]`.
- [ ] **V4 — Vie privée / profils** (1 PR) : `[PROFIL-SWITCH]` + `[D6-PRIV-MONTANTS]` (décision
  déjà prise) + `[SEC-GA-DEFER-CONSENT]` + `[HIST-STORE-SIZE]` (downsample >365 j, mesure faite).
- [ ] **V5 — Fiscal débloqué (Marc : Q1 ok, Q2 fix, Q3 go)** : `[FISC-BRACKET-REALINDEX]`/ITEM-2A (CRITIQUE) +
  `[FISC-WHT-92PCT]` fix 1.0 (Q2) + `[FISC-SOLO-INVEST-SPLIT]` (Q3) + `[FISC-GIS-COUPLE-RATE]`
  (table Service Canada requise) + `[FISC-LINE361-PERCONJOINT-REDUC]` (Annexe B d'abord) +
  `[FISC-FED-CREDITRATE-15]` (source ARC).
- [ ] **V6 — Fiscal non gaté** (1 PR) : `[FISC-DTC-ABATEMENT-ORDER]` + `[FISC-STACK-GAINS-DIV]`
  (même bloc taxDecember) + `[FISC-REEE-GRANT-CLAWBACK]` + `[FISC-TAXDEC-INCR]` (Marc : « fix »).
- [ ] **V7 — Sécurité serveur + sync** (1 PR) : `[MCP-CLOUDRUN-AUTH-HARDENING]` +
  `[MCP-CHARTDATA-SUM-GUARD]` + `[FINTABLE-SYNC-STALE-BASE]` + `[FISC-CONST-GUARD-V2]`.
- [ ] **V8 — Features demandées** (2-3 PR) : `[SUBS-TAB]` · `[GOAL-DEADLINE-UI]` +
  `[PH4C-SAVINGS-NATURE]` · `[ASSET-CURRENCY-BACKFILL]` (si log) · `[CHAT-PAGE-CONTEXT-V2]`
  (file explicite Marc — maintenu malgré le « différer » PM).
- [ ] **V9 — Couverture moteur** (1-2 PR) : `[FUZZ-ONETIME-FLOWS]` + `[HARDEN-SNAPSHOT-RACE]`.
- [ ] **V10 — A11y** (1-2 PR) : `[A11Y-INK500]` + `[FUT-TOUCH-TARGETS]` + `[D6-KBD]` +
  `[A11Y-BORDER-PROMINENCE-SWEEP]` + `[A11Y-FUTUR-MILESTONES-KEYBOARD]` (Marc : focusables).
- [ ] **V11 — Dette structurée** (fond, par lots) : `[GODFILE-APPLYDOCUMENT]` → `[GODFILE-MCPHTTP]` →
  `[DETTE-GODFILES]` (Budget/FutureProjection/…) + `[DETTE-UI-PRIMITIVES]` + `[CA-07]` + `[T4]`.
- [ ] **V12 — Gros chantiers (tous GO Marc 2026-07-31, plan-first chacun)** :
  `[IA-NAV-CONSOLIDATE]` (GO — préparer un GROS batch de questions de cadrage d'abord) →
  `[UI-TABS-RICH]`+`[IA-NAV-LABELS]` ; `[PH4-BUD]` refonte Budget (GO — « faut tout refaire »,
  batch de questions d'abord) ; `[CIX-*]` (critère défini : bascule couple↔solo fiable →
  CIX-B → CIX-F → CIX-A1B en priorité) ; `[MCP-WHATIF-DATED-DEBT]` (Debt.startDate moteur) ;
  `[P0-IDB]` (si quota le justifie).
- [ ] **V3' — Nettoyage décidé** (S, greffé à V3) : supprimer `rsuYearsRemaining` +
  `futureProvince`/`futureMoveYear` (Marc : « retire ») ; `[DETTE-RE-SALE-PURGE]` option
  « supprimer l'événement » ; archiver SEC-DRIVE-ENCRYPT-DEFAULT (Marc : « non ») + .mcpb (fermé).

---

## 🔴 Money-critical — fiabilité des chiffres

> Analyse fiscale 2026-07-31 (financial-integrity, findings MESURÉS via npx tsx sur le vrai moteur).
> ⚠️ Un finding = une hypothèse : chaque fix passe par discriminant git-stash + panel adversarial.

- [ ] **`[FISC-BRACKET-REALINDEX]`** (L, **CRITIQUE** [Certain, MESURÉ], 🧭 Q1 — fusionne avec
  ITEM-2A) — DOUBLE indexation des paliers : le moteur DÉFLATE le revenu (`taxDecember.ts:370-371`)
  puis passe `loopYear` à un barème LUI-MÊME indexé 1,02^Δ (`utils/tax.ts:694`) et re-nominalise →
  les paliers s'élargissent de 2 %/an EN DOLLARS RÉELS, indépendamment de simInflation (présent au
  réglage par défaut). Mesuré (98 400 $ réel constant) : impôt réel 24 932 → 16 740 $ à l'an 30
  (−8 192 $/an/personne ; couple ~−16 k$/an ; cumul ~250-300 k$/30 ans, sens NON conservateur —
  patrimoine/FIRE optimistes). Gonfle aussi RAMQ/FSS/ligne 361. Correctif juste :
  `palier_réel = palier_2026 × (1,02/(1+i))^Δ`. ⚠️ Déplace TOUS les goldens (~12 sites).
- [ ] **`[FISC-WHT-92PCT]`** (S-M, ÉLEVÉ [Certain algèbre], 🧭 Q2 pour le fix) —
  `taxDecember.ts:407-410` : `estimatedWithholding = totalEmployerTax * 0.92` → ~8 % de l'impôt
  salarial facturé EN DOUBLE chaque avril (mesuré : ~1 995 $/an solo, ~3 608 $/an couple, sens
  conservateur). Le `netSalary` saisi incorpore déjà ~100 % de la retenue (vérifié : 5 604 vs
  5 620 $/mois) ; `0.92` n'est sourcé NULLE PART et échappe au garde FISC-CONST-LINT (constante
  nouvelle). Minimal (V1) : documenter au FISCAL_REFERENCE ; juste : `1.0` + discriminant.
- [x] **`[WHT-DISPLAY-MELTDOWN]`** ✅ 2026-07-31 (V2 — `rrspWithholdingMois += meltResult.withholding`,
  discriminant prouvé, NW bit-identique prouvé + pinné par golden). ⚠️ Précision du panel #551 (2 agents,
  mesuré au cent) : la retenue ENTRAIT déjà dans le crédit décembre (`taxCurrentYear.reer +=`, pré-existant) ;
  le vrai gain = COHÉRENCE de convention entre stratégies (ratio MELTDOWN/AUTO 0,601 → 1,400) — la reco
  « objectif impôt » recommandait MELTDOWN à tort sur main (corrigé). La valeur ABSOLUE du compteur reste
  sur-évaluée pour toutes les stratégies → `[PROJ-TTP-DOUBLECOUNT]`.
- [x] **`[ENG-MELTDOWN-FLOW-INVISIBLE]`** ✅ 2026-07-31 (V2 — `retraitReerMois += meltResult.reerDrawn`, Σ RetraitREER ≥ 90 % du REER drainé prouvé) — le meltdown n'alimente
  jamais `retraitReerMois` → Σ `RetraitREER` affiché 22 547 $ pour ~796 k$ de sorties réelles :
  tooltip/modal/milestoneIcons (« 1er retrait REER » jamais déclenché)/MCP aveugles. Aucun impact NW
  (angle mort de la conservation).
- [ ] **`[FISC-GIS-COUPLE-RATE]`** (M, ÉLEVÉ hors profil Marc [Probable — table Service Canada NON
  confirmable du conteneur]) — `utils/tax.ts:497-498` : clawback SRG 0,50 PAR ADULTE sur le revenu
  COMBINÉ → récupération 2× trop rapide ; `GIS_INCOME_THRESHOLD_COUPLE` 29 760 $ = CODE MORT (la
  formule s'annule dès 15 888 $) ; test `tax.test.ts:968` VACUEUX. Mesuré : 0 $ vs 7 944 $/an à
  15 888 $ combiné. ⚠️ Exiger la table SC + corriger FISCAL_REFERENCE §6 + remplacer le test, même PR.
- [ ] **`[FISC-DTC-ABATEMENT-ORDER]`** (S, MOYEN [Certain mécanisme] — V6) — le CID fédéral est
  soustrait APRÈS l'abattement QC 16,5 % (`taxDecember.ts:734-739` + `tax.ts:906-907`) alors que
  BPA/âge sont avant → sur-crédit de 16,5 % du CID (+49 $/an profil Marc, +308 $ à 9 k$ div).
- [ ] **`[FISC-STACK-GAINS-DIV]`** (S, MOYEN [MESURÉ] — V6, même PR) — gains (`taxDecember.ts:703`)
  et dividendes (`:737`) empilés CHACUN sur la même base → bande commune facturée 2× au taux bas
  (mesuré : −1 346 $/an sur base 100k/gains 30k/div 15k). Mord un retraité à gros non-enregistré.
- [ ] **`[FISC-REEE-GRANT-CLAWBACK]`** (S, [Probable] — V6) — à la fermeture du REEE,
  `liquidDelta += reeeNewBalance` verse 100 % du solde aux liquidités : les subventions SCEE/IQEE
  non utilisées (jusqu'à ~10 800 $/enfant) doivent être REMBOURSÉES au gouvernement → patrimoine
  surévalué. (Découvert en re-validant FISC-REEE-AIP-MODEL — défaut plus gros que le taux.)
- [ ] **`[FISC-FED-CREDITRATE-15]`** (S vérif, 🧭 source ARC requise) — `FED_NONREFUNDABLE_RATE`
  15 % vs 1er palier fédéral 14 % (C-4) : seule affirmation du doc SANS source (profil
  TP1G-VIVANT-SEUL : chiffre non sourcé = suspect). Si faux : ~165 $/pers/an. Re-sourcer AVANT tout changement.
- [ ] **`[FISC-SOLO-INVEST-SPLIT]`** (M, 🧭 Q3 — conditionnel au profil) — `getTaxSituation.spec.ts:64`
  + MIROIR app `TaxCenter.tsx:173` : split 1/2 du revenu de placement. Ne mord QUE si un seul
  conjoint a un salaire (mesuré : −2 530 $/an) ; 0 $ si les deux. Fix par détention réelle (owner),
  app+MCP au même helper.
- [ ] **`[FISC-LINE361-PERCONJOINT-REDUC]`** (M, [À vérifier] — V5) — réduction 18,75 % ligne 361
  appliquée par conjoint avec le revenu familial TOTAL (`taxDecember.ts:529` → `tax.ts:255`).
  Plafonné ~986 $/an, couple retraité 65+ seulement (0 $ Marc aujourd'hui). Lire l'Annexe B d'abord.
- [ ] **`[PV-11e]`** (S, test — V3) — PAS un bug (invariant Σ reerByUser == reer préservé par
  construction, re-vérifié) : écrire le test de pin couple-inégal + goal REER + cotisation même mois.
- [ ] **`[FISC-CONST-GUARD-V2]`** (S, garde — V7) — le garde FISC-CONST-LINT ne détecte pas une
  constante fiscale NOUVELLE non sourcée (c'est le trou par lequel 0.92 est passé) → garde
  complémentaire : constante $ de `services/projection/` participant à l'impôt ⇒ ancre FISCAL_REFERENCE.
- [ ] **`[NW-PARITY-SURFACES-TEST]`** (S-M, garde-fou keystone audit 2026-06-17) — étendre
  `tests/services/nwParity.test.ts` (aujourd'hui moteur↔computePresentNetWorth) aux surfaces
  UI/IA/PDF (KPI Accueil, useDerivedFinancials, financialSnapshot, pdfReport) sur persona endetté +
  propriétaire, convention équité immo EXPLICITE par surface.
- [ ] **`[MCP-CHARTDATA-SUM-GUARD]`** (S, garde) — aucun test/lint de convention sur les sommes de
  flux chartData dans `mcp/tools/*` (le décaissement non-enregistré/liquide n'a AUCUN champ
  `Retrait*` — leçon MCP-RETIREMENT-VERDICT) → scan-garde qui interdit une somme de flux comme revenu.
- [ ] **`[FUZZ-ONETIME-FLOWS]`** (M, reste) — flux non exercés par le fuzz de conservation
  (`projection.fuzzConservation.test.ts:21-23`) : vente/gain locatif, équité négative, véhicule,
  héritage, REEE. Les couvrir (mesurer la couverture, pas la supposer).

- [ ] **`[PROJ-TTP-DOUBLECOUNT]`** (M, ÉLEVÉ [Certain, MESURÉ au cent — panel #551, 2 agents]) —
  `totalTaxesPaid` DOUBLE-COMPTE la retenue REER pour TOUTES les stratégies : `projection.ts:1457`
  ajoute `rrspWithholdingMois` alors qu'avril débite le bucket `.reer` ENTIER (`taxApril.ts:55` :
  `fluxImpots = … + taxPaidREER`) — décembre ne consomme pas `.reer`, il calcule la réconciliation
  versée dans `.revenu`. « Impôt à vie » (StrategyOptimizerPanel:353,480) affiché +144 % (MELTDOWN :
  321 122 $ vs 131 871 $ réels ; AUTO : 229 338 $ vs 29 806 $). Dérivés : efficacité fiscale MC 0 %
  au lieu de ~53 % (−10 pts FVI), taxLeakage 115 % au lieu de 47 %. Fix : `+= fluxImpots + taxOnRrif`
  seulement (⚠️ re-mesurer taxOnRrif, même risque) + re-baseliner MC/strategySearch SCIEMMENT.
  Classement ordre-préservant (vérifié) → pas de flip attendu.
- [ ] **`[ENG-FERR-FLOW-INVISIBLE]`** (S, MOYEN [Certain, MESURÉ]) — même classe que le fix V2, 4ᵉ
  source : la FERR obligatoire (`projection.ts:999-1002`) et les retraits REER d'objectifs
  (`:1219-1226`) n'alimentent pas `retraitReerMois` → 113 418 $ (11,6 %) de sorties invisibles sur
  AUTO_MARGINAL ; « 1er retrait REER » jamais déclenché pour un retraité 71+ dont la 1re sortie est
  une FERR. Fix : 2 `+=` + étendre le test meltdownDisplay (parité Σ RetraitREER ≈ Σ accRetraitsReerYear).
- [ ] **`[MELTDOWN-THRESHOLDS-DOC]`** (S, doc) — `meltdownReer.ts:9-13` : seuils
  MELTDOWN_NW_HIGH/MID (2 M/1 M) + cibles 220 k/140 k/90 k × adultes = heuristiques de CONCEPTION
  non documentées (pas des constantes fiscales) — les documenter (module + FISCAL_REFERENCE §9).

## 🏦 Sync & données (Fintable, Drive, persistance)

- [ ] **`[DEFAULTS-DRIFT-FINTABLE-FIELDS]`** (S effort, L sévérité — V3, finding code-analyzer
  2026-07-31) — `buildDefaultAppState()` (`mcp/state/appStateDefaults.ts:22-60`) OMET 4 champs du
  store : `categoryReview`, `fintableSyncReport`, `fintableBrokerBalances`, `fintableRoles` →
  structurellement INVISIBLES au chat in-app (`appStateProvider.ts:33` dérive de Object.keys) et à
  `normalizeAppState`. Cause racine : `registryParity.test.ts:104-113` UNIDIRECTIONNEL (n'itère que
  sur mcpDefaults). Fix : +4 champs (`: undefined`) + test bidirectionnel.

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

## 📈 Investissements & historique

- [ ] **`[DASH-IMMO-EQUITY-WRITERS]`** (M, ✅ tranché Marc 2026-07-31 : BRANCHER) — le terme équité immo du KPI Accueil
  est INERTE (`RealEstateGoal.currentValue`/`mortgageBalance` sans AUCUN écrivain UI) → un
  propriétaire modélisé par price/downPayment a un KPI sans sa maison pendant que le Futur l'inclut
  (mesuré : 81 609 $ moteur vs 0 KPI). Trancher : brancher sur ce que l'UI possède OU retirer le
  terme. En même temps (F4) : gate `equity !== 0`, filtre `isActive`, gardes `Number.isFinite` +
  logErrorThrottled (3 sites).
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
- [ ] **`[NAV-IA-CONSOLIDATE]`** (L, ⏳, 🧭 OK Marc requis) — 14 destinations → ~6 (Accueil · Budget ·
  Patrimoine · Futur · Impôts&Docs · Réglages). Gros chantier nav (routes, deep-links, tests) →
  plan-first + OK Marc.
- [ ] **`[UI-TABS-RICH]`** (M) — généraliser le pattern sous-onglets à Retraite (4 outils empilés) et
  Profil (long scroll). Plan-first.
- [ ] **`[DETTE-CHART-THEME-DUP]`** (S) — tooltip/thème Recharts partagé (`CHART_TOOLTIP_STYLE`
  inexistant) — dédupliquer les styles inline des graphes.
- [ ] **`[D6-GRAPH]`** (M, résiduel) — accès clavier aux graphes restants (projections,
  investissements) ; tables sr-only faites pour les donuts Budget.

## ⚡ Performance

- [ ] **`[PERF-BOOT]`** (M-L, différé SCIEMMENT — provider-aware) — paralléliser
  `hydrateAssets`/priceRefresh SANS dépasser CoinGecko free ~30/min (le sleep 2500 protège le
  provider le PLUS strict). Fix provider-aware planifié, pas un Promise.all aveugle. (≡ D7.)
- [ ] **`[HARDEN-SNAPSHOT-RACE]`** (S, reste) — abort sur le chemin run projection simple
  (la recherche de stratégies a déjà son AbortSignal, `runAsync.ts:222,235`).

## 🧱 Dette technique

> Findings code-analyzer 2026-07-31 (preuve fichier:ligne, chacun vérifié par grep) :

- [ ] **`[TEST-GAP-TAXESTIMATE]`** (S — V3) — `services/taxEstimate.ts:22-35` (assiette fiscale
  placement, app+MCP, money-critical depuis TAX-AVGRATE-BASE) : AUCUN test unitaire direct.
- [ ] **`[TEST-GAP-SUBSCRIPTIONS]`** (S — V3) — `subscriptionAlerts.ts` (152 l., $ visibles
  utilisateur, seuils/médiane) : aucun test dédié.
- [ ] **`[TEST-GAP-ROLESCONFIG]`** (S — V3) — `parseRolesJson` (`rolesConfig.ts:14-47`) : aucun test
  (une faute de parse route un compte dans le mauvais panier fiscal).
- [ ] **`[GODFILE-APPLYDOCUMENT]`** (M — V11, 1er par impact) — `mcp/ingest/applyDocument.ts` 873 l.,
  5 handlers indépendants (:531,597,655,719,792) → split `applyDocument/<type>.ts` + orchestrateur mince.
- [ ] **`[GODFILE-MCPHTTP]`** (M — V11) — `mcp/http.ts` 710 l. (OAuth+CORS+DNS-guard+dispatch) →
  split `http/oauth.ts` + `http/security.ts` + `http/server.ts` (auditabilité sécurité).
- [ ] **`[GODFILE-APP]`** (M — V11) — `App.tsx` 866 l. → extraire `AppProviders.tsx`.
  **`[GODFILE-STORE]`** `useFinanceStore.ts` 717 l. (slices par domaine — DERNIER, risque migration).
  **`[GODFILE-REALESTATE-CMP]`** RealEstate.tsx 624 · **`[GODFILE-FUTUREDETAILMODAL]`** 606.

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
- [ ] **`[PH3-c-bis]`** (S, reste) — `futureProvince`/`futureMoveYear` orphelins (types.ts:343-344,
  0 consommateur services/) ; `rsuYearsRemaining` consommé (activeIncome.ts:101) mais AUCUN éditeur
  UI → auditer W2.7 + éditeur ou retrait.
- [ ] **`[ENG-RAMQ-FIELDS]`** (S, reste) — assurance médicaments PRIVÉE absente (enfants à charge ✓)
  → champ User + bascule RAMQ/privé dans taxDecember.
- [ ] **`[T4]`** (M, par lots) — automatiser les tests manuels critiques en Playwright : 8 specs e2e
  aujourd'hui, cible 20-30 (depuis MANUAL_TEST_CHECKLIST.md).
- [ ] **`[T3]`** (S pour mesurer) — lancer un run coverage pour trancher la cible 64→80 % (jamais
  mesuré depuis ~2350 tests ajoutés).
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

- [ ] **`[NONREG-LOSS]`** (M, REQUALIFIÉ FAIBLE par l'analyse fiscale 2026-07-31) — branche perte
  NonReg inatteignable (`portfolioOps.ts:70-75`) MAIS l'ACB excédentaire est CONSERVÉ → la perte est
  DIFFÉRÉE, pas détruite (effet de timing seulement, ~0 $ permanent). Déjà limite assumée
  FISCAL_REFERENCE §3. Prendre seulement avec un scénario où le timing compte (décaissement baissier).
- [ ] **`[FISC-RRSP-PRE2010-FALLBACK]`** (S, RÉFUTÉ pour le profil actuel) — plafond fallback ne mord
  que si salaire passé > 180 500 $ avant 2010 (mesuré). Latent — reprendre si un tel profil apparaît.
- [ ] **`[FISC-REEE-AIP-MODEL]`** (M, FAIBLE — conditionnel enfants + solde survivant aux études) —
  impôt PRA 20 % sur le solde total au lieu de la portion gains + surtaxe. Le défaut PLUS GROS
  (subventions non remboursées) est ticketé séparément : `[FISC-REEE-GRANT-CLAWBACK]` (V6).

- [ ] **`[NAN-MUTATOR-CENTRAL]`** (S) — garde centrale des 4 mutateurs nus — SEULEMENT si un vecteur
  d'entrée non-UI apparaît (numericInput couvre le boundary ; plan prêt en réserve).
- [ ] **`[DETTE-RE-SALE-PURGE]`** (S, ✅ tranché Marc 2026-07-31 : SUPPRIMER l'événement) — à la
  suppression d'un bien, supprimer les lifeEvents de vente qui le référencent (+ confirmation UI).
- [ ] **`[FISC-RAP-REPAY]`** (M, fixIsSafe:false) — inclusion ligne 12900 + passif successoral RAP —
  risque double-comptage estate ; limite consignée FISCAL_REFERENCE §9.
- [ ] **`[FISC-CHILDCARE]`** (M) — T778/crédit QC exacts au lieu de l'heuristique 30 % — travail dédié.
- [ ] **`[FISC-SURVIVOR-CAP]`** (S) — cap RRQ combiné per-bénéficiaire via perUserRrqWeight (un cap
  naïf serait FAUX) — peu d'impact.
- [ ] **`[FISC-ASSETLOC-INTL]`** (M) — withholdingDrag international en CELI/REER — rouvrir si la
  classe international entre au portefeuille (CELI-ASSET-NUDGE).
- [ ] **`[PROJ-REVEAL-RACE]`** (S, LOW) — course Rechoisir vs miroir IDB — récupérable en re-révélant.
- [ ] **`[MCP-WHATIF-DATED-DEBT]`** (M, ✅ tranché Marc 2026-07-31 : MOTEUR) — `Debt.startDate`
  optionnel honoré par le moteur (dette servie à partir de sa date, pas du mois 0). Plan-first
  (touche le moteur, money-critical) ; débloque le volet immobilier de MCP-DIRECT-EDIT.
- [ ] **`[FISC-CONST-LINT-LIMITS]`** (note de vigilance) — étendre le scan aux taux 2-3 décimales et
  RRIF_RATES = arbitrage faux-positifs à faire — seulement si une fuite réelle apparaît.
- [ ] **`[HARDEN-DECIMAL-STUDY]`** (S, étude) — PoC centimes entiers/decimal.js sur un sous-module —
  dérive flottante déjà bornée ≤ 0,02 $ ; mesurer le coût MC avant d'adopter.

## 🧭 Décisions Marc requises (posées en UN lot le 2026-07-31)

- [x] **`[Q1-BRACKET-REALINDEX]`** ✅ Marc 2026-07-31 : « ok » — GO pour corriger la double
  indexation (`[FISC-BRACKET-REALINDEX]`, goldens re-basés sciemment).
- [x] **`[Q2-WHT-92PCT]`** ✅ Marc 2026-07-31 : « fix » — passer le `0.92` à `1.0` (discriminant).
- [x] **`[Q3-SOLO-SPLIT]`** ✅ Marc : « les deux ont un salaire mais possible que pendant un temps juste un en ait » → le fix par détention réelle est le bon dans les DEUX configs (0 $ d'écart aujourd'hui, juste demain) — GO, V5.
- [x] **`[Q-TAXDEC-INCR]`** ✅ Marc : « fix » → coder les 3 sous-fixes de taxDecember (crédit d'âge sur incrément, empilement gains+div, FSS) avec discriminants — fusionne avec [FISC-STACK-GAINS-DIV] en V6.
- [x] **`[Q-MILESTONES-KBD]`** ✅ Marc : « focusable » → pastilles focusables directement (tabIndex=0 + Enter/Space), V10.
- [x] **`[Q-IMMO-EQUITY]`** ✅ Marc : « dans l'app oui » (propriétaire modélisé) → BRANCHER l'équité immo du KPI sur les vrais biens, V2'.
- [x] **`[Q-RE-SALE-PURGE]`** ✅ Marc : « supprimer » → à la suppression d'un bien, SUPPRIMER les lifeEvents de vente qui le référencent (option B).
- [x] **`[Q-DRIVE-ENCRYPT]`** ✅ Marc : « non » → l'opt-in actuel reste ; SEC-DRIVE-ENCRYPT-DEFAULT FERMÉ (archivé).
- [x] **`[Q-WHATIF-DEBT]`** ✅ Marc : « moteur » → champ `Debt.startDate` honoré par le moteur (MCP-WHATIF-DATED-DEBT sort des différés, plan-first moteur).
- [x] **`[Q-PH4-BUD]`** ✅ Marc : « pose plein de questions, faut tout refaire » → refonte Budget CONFIRMÉE, cadrage par batch de questions à préparer (PH4-BUD → V12, plan-first).
- [x] **`[Q-NAV]`** ✅ Marc : « go, pose plein de questions » → IA-NAV-CONSOLIDATE GO, cadrage par batch de questions à préparer (V12, plan-first).
- [x] **`[Q-MCPB]`** ✅ Marc : « cloudrun » → chemin .mcpb FERMÉ définitivement.
- [ ] **`[Q-SOLO-SPLIT]`** — `[FISC-SOLO-INVEST-SPLIT]` change les chiffres affichés : OK pour splitter
  par détention réelle ?
- [x] **`[Q-COUPLE-VISION]`** ✅ Marc : « deux façons de voir l'app, mode couple et pas couple, et que tous les résultats et données soient fiables » → critère CIX défini : bascule couple↔solo (CIX-F) + fiabilité per-conjoint de bout en bout (CIX-A1B). Bloc CIX DÉBLOQUÉ : CIX-B → CIX-F → CIX-A1B en priorité.
- [x] **`[Q-RSU]`** ✅ Marc : « retire » → supprimer `rsuYearsRemaining` + `futureProvince`/`futureMoveYear` (lot nettoyage, V3').

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

- [ ] **`[DEP-ESLINT10]`** (M, dev-only) — 5 vulnérabilités high `brace-expansion`/`minimatch` dans la
  chaîne eslint (outillage dev, DoS théorique) — fix = eslint@10 (breaking : config + règles à migrer).
  À prendre comme un lot dédié, pas un audit fix --force aveugle.

