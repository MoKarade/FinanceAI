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
- [x] **V3 — Parité état + tests money-critical** ✅ 2026-07-31 (PR #552, 40 tests) :
  `[DEFAULTS-DRIFT-FINTABLE-FIELDS]` (4 champs + garde bidirectionnel) + `[TEST-GAP-TAXESTIMATE]` +
  `[TEST-GAP-SUBSCRIPTIONS]` + `[TEST-GAP-ROLESCONFIG]` + `[PV-11e]` + `[NW-PARITY-SURFACES-TEST]` (tous re-vérifiés livrés+verts 2026-08-12 — fichiers aux IDs, dont `nwParitySurfaces.test.ts`)
  (+ fix PDF `equity: 0` en dur → `presentEquityOfGoal`). Archive au merge de #552.
- [x] **V4 — Vie privée (3/4)** ✅ 2026-08-01 (PR V4) : `[D6-PRIV-MONTANTS]` (PrivateSliderValue,
  4 sliders + montants voisins) + `[SEC-GA-DEFER-CONSENT]` (le SCRIPT gtag ne part chez Google
  qu'au consentement) + `[HIST-STORE-SIZE]` (downsample stocké > 365 j → 1 pt/semaine, idempotent,
  compose avec mergePriceHistories). `[PROFIL-SWITCH]` reste (questions posées à Marc — voir 🧭).
- [ ] **V5 — Fiscal débloqué (Marc : Q1 ok, Q2 fix, Q3 go)** : ~~`[FISC-BRACKET-REALINDEX]`~~ ✅ #556 +
  ~~`[FISC-WHT-92PCT]`~~ ✅ #558 (archivé) + `[FISC-SOLO-INVEST-SPLIT]` (Q3 — ⚠️ **DÉPRIORISÉ,
  mesuré 0 $ sur le profil de Marc**, cf ci-dessous) +
  `[FISC-GIS-COUPLE-RATE]` (table Service Canada requise) + `[FISC-LINE361-PERCONJOINT-REDUC]`
  (Annexe B d'abord) + `[FISC-FED-CREDITRATE-15]` (source ARC).
- [ ] **V6 — Fiscal non gaté** : ~~`[FISC-DTC-ABATEMENT-ORDER]`~~ + ~~`[FISC-STACK-GAINS-DIV]`~~
  ✅ #564 (archivés — CID validé contre les tables RQ/ARC : 40,11 % / 48,70 %). RESTE :
  `[FISC-REEE-GRANT-CLAWBACK]` (⚠️ **mesuré 0 $ sur le profil de Marc** : `reee: 0`, aucun objectif
  d'études → dormant, actif seulement s'il ajoute un enfant ; confirmé contre le code —
  `childrenReee.ts:327` verse 100 % du solde, les trackers SCEE/IQEE existent mais ne sont jamais
  décrémentés → modélisation en 3 poches nécessaire, plan-first) + `[FISC-TAXDEC-INCR]`
  (⚠️ reste À CONFIRMER avec Marc, cf A_FAIRE_MOI — ne pas coder sans go).
- [ ] **V7 — Sécurité serveur + sync** — **2/4 livrés** (PR #566) :
  ✅ `[FINTABLE-SYNC-STALE-BASE]` + ✅ `[MCP-CLOUDRUN-AUTH-HARDENING]` (archivés).
  ✅ `[MCP-CHARTDATA-SUM-GUARD]` (#567) + ✅ `[FISC-CONST-GUARD-V2]` (#568). **V7 TERMINÉE (4/4).**
- [ ] **V7bis — RÉEE (demande explicite Marc 2026-08-05)** : `[FISC-REEE-GRANT-CLAWBACK]`, plan-first.
  ⚠️ Marc a tranché CONTRE la reco « différer » : des enfants sont donc au programme. Ne pas
  re-proposer de reporter.
- [ ] **`[FISC-REEE-GRANT-CLAWBACK]`** (L — ⚠️ **TENTÉ ET REVERTÉ le 2026-08-05**, PR #566) — le bug
  d'ORIGINE est réel et confirmé : à la fermeture (25 ans), `childrenReee.ts` verse 100 % du solde
  résiduel avec un forfait de 20 % sur le TOUT → les subventions SCEE/IQEE non utilisées (jusqu'à
  10 800 $/enfant) deviennent du patrimoine au lieu d'être REMBOURSÉES, et les cotisations (argent
  déjà imposé) sont taxées. Deux erreurs de sens OPPOSÉ.
  ⚠️ **Une modélisation en 3 poches DÉRIVÉES a été implémentée puis RETIRÉE** : le panel
  financial-integrity l'a mesurée PIRE que le bug sur deux cas courants. À refaire avec ce périmètre,
  qui est maintenant CONNU et CHIFFRÉ — ne pas repartir de zéro :
  - ⛔ **Solde d'ouverture** (`projection.ts:148`, `reee` depuis `liveCSVBalances.REEE`) : les poches
    démarraient à 0, donc 100 % d'un RÉEE EXISTANT était classé « revenu accumulé » et imposé à ~70 %.
    **Mesuré −31 193 $** (couple 183 600 $, enfant de 23 ans, RÉEE d'ouverture 60 000 $). Correctif :
    amorcer les poches (champ « dont cotisations / dont subventions », ou défaut conservateur = tout
    en cotisations plafonné à 50 000 $ — imposer du capital est la pire des deux erreurs).
  - ⛔ **Multi-enfants** : `_childReee` (`projection.ts:1214`) est un solde MÉNAGE unique alors que les
    poches sont PAR enfant, et la fermeture fait `reeeNewBalance = 0`. **Mesuré +7 890 $ d'impôt
    fantôme** (aînée 23 ans + cadette 6 ans) : le solde de la CADETTE est liquidé et imposé à la
    fermeture de l'aînée, ses subventions versées au lieu d'être remboursées, et ses poches survivent
    à un solde 0 → sous-imposition symétrique plus tard. Correctif : solde par enfant, OU poches
    ménage avec proratisation à la fermeture (+ transfert entre frères/sœurs, qui dans la vraie vie
    évite tout remboursement de SCEE).
  - ⚠️ **Base du taux marginal** : le PRA est imposable au SEUL SOUSCRIPTEUR. Le code utilisait
    `householdGross` (2 salaires), NON indexé (dollars an-0 dans un barème indexé) et aveugle à
    `isRetired`. **Mesuré sur un PRA de 50 000 $ en 2051** : code 32 759 $ (65,5 %) · souscripteur
    indexé 30 607 $ (61,2 %) · retraité à 60 k$ 24 646 $ (49,3 %). La référence existe déjà dans le
    dépôt : `latentTax.ts:58-64` (leçon `[FISC-BRACKET-REALINDEX]`), idem `projection.ts:902-904`.
  - ⚠️ **Dérivés à auditer** : `latentTax.ts` ne couvre PAS le RÉEE, et `netWorth.ts:59` /
    `estateCalculation.ts:135` le comptent à 100 %. Passer le prélèvement effectif de 20 % à ~70 %
    multiplie par ~3,5 l'écart entre le patrimoine affiché et l'impôt que le moteur percevra.
  - ⚠️ **Invariant manquant** : `subventions + cotisations ≤ solde` n'est pas tenu quand le solde
    baisse hors des flux suivis (`projection.ts:793` `reee *= keep` au divorce, marché baissier).
  - ⛔ **CONSERVATION DE FLUX cassée** (projection-validator, mesuré) : `grantsRepaid` n'alimentait
    AUCUN registre — il n'existait que dans une chaîne de log. Résiduel `unexplained` de
    **−10 799,99 $** sur le mois de fermeture (0,00 $ avant), soit exactement SCEE 7 200 + IQEE 3 600.
    ⚠️ Nuance MESURÉE : la face ENTRANTE n'était déjà pas enregistrée (+125 $/mois en rattrapage puis
    +62,50 $/mois, dans l'ANCIEN code aussi) — l'ancien modèle créait donc 10 800 $ nets sans cause
    visible. Le nouveau est plus juste EN CUMUL mais concentre tout sur un mois. Correctif : router
    `grantsRepaid` par un registre visible (`taxDiversAdd`, ou une série `ReeeGrantClawback`), et par
    SYMÉTRIE enregistrer les subventions ENTRANTES.
  - ⚠️ **Espaces mixtes** (projection-validator, mesuré) : `householdGross` n'est jamais indexé par
    `simSalaryGrowth` alors que le barème l'est → **−2 613,69 $** d'impôt sous-évalué en 2051.
    ⚠️ Cette erreur est de sens OPPOSÉ à celle de l'assiette ménage (+6 469 $) : elles se masquent
    partiellement — exactement le piège que le correctif reprochait à l'ancien forfait.
  - ⚠️ **Registres d'affichage** : la branche fermeture n'incrémente ni `withdrawalREEEAdd`, ni
    `reeePayoutAdd`, ni `contribLiquidAdd` (mesuré `ReeePayout = 0` pour 68 547,88 $ versés), alors
    que la branche études alimente les quatre. Pré-existant, mais aggravé.
  - ⚠️ **Croissance du RÉEE au `activeCashRate`** (`growthApplication.ts:51`), pas à un taux de
    placement. Pré-existant et anodin avant — mais la poche PRA EST le cumul de cette croissance,
    donc ce taux porte désormais un montant d'IMPÔT.
  - 🧪 **Deux tests discriminants déjà identifiés** : (1) conservation avec enfants, `maxResid < 1`
    (passait avant, échouait après) ; (2) « un RÉEE d'ouverture de 60 000 $ ajoute > 60 000 $ au
    patrimoine final » (ancien +88 010 $, nouveau +28 984 $).
  - ⚠️ **Ordre de puisage PAE** : la part SCEE d'un retrait d'études est PRORATISÉE
    (`PAE × C/(C+I)`, règlement CESP), pas « subventions d'abord » comme implémenté.
  - ⚠️ **Couverture** : `projection.moneyConservation.test.ts` tourne avec `childGoals: []` → aucun
    test de conservation n'exerce un remboursement de subventions.
  - 📄 **À documenter quoi qu'il arrive** : surtaxe PRA de 20 % = 12 % féd (T1172 / LIR 204.94) + 8 %
    impôt spécial QC — la valeur est JUSTE mais n'était pas sourcée ; roulement PRA → REER
    (50 000 $ à vie, déductible ET exonéré de la surtaxe) NON modélisé ; fermeture à 25 ans du
    bénéficiaire ≠ échéance légale du régime (fin de la 35ᵉ année).
- [ ] **`[FISC-REEE-EAP-STUDENT-TAX]`** (M, hypothèse ASSUMÉE, choix Marc 2026-08-05) — le retrait
  d'études est imposable dans les mains de l'ÉTUDIANT, pas du souscripteur. Le moteur le laisse à
  ~0 $ (réaliste : BPA + crédits de scolarité couvrent un étudiant sans autre revenu) mais c'est une
  hypothèse, PAS un calcul. Le coder exigerait un TROISIÈME contribuable dans le moteur.
- [ ] **`[FISC-CONST-ANCHOR-DEBT]`** (M, DETTE révélée par le tri de `[FISC-CONST-GUARD-V2]`) —
  l'inventaire du ratchet (`utils/fiscalConstGuardV2.ts`) classe **14 entrées en famille `fiscal`**
  qui vivent en DUR dans le moteur sans ancre `FISCAL_REFERENCE`. Les ancrer une par une, et les
  remplacer par un import depuis la source unique. Par ordre de gravité :
  ✅ **3 ancrées le 2026-08-06 (PR #572)** — `0.18` (droits REER → `RRSP_ROOM_RATE`), `500` (arrondi
  CELI → `CELI_LIMIT_ROUNDING`), `0.20` (plateau FERR → `RRIF_RATE_PLATEAU`) : sorties du moteur,
  ancrées dans FISCAL_REFERENCE, importées depuis la source unique. Leurs entrées d'inventaire ont
  été RETIRÉES (résolues, pas exemptées).
  ✅ **+2 le 2026-08-06 (PR #573)** — `72` → `RRIF_FIRST_WITHDRAWAL_AGE` (il vivait en dur sur
  taxJanuary ET taxDecember : la configuration JUMELLE exacte qui avait laissé survivre le `0.18`)
  et `95` → `RRIF_PLATEAU_AGE` (seuil qui n'était porté par AUCUN littéral, seulement par l'absence
  d'entrée dans la table). **RESTENT 9 :**
  - `taxJanuary.ts` `2026` (année d'ancrage RRSP_ANNUAL_LIMITS) — ⚠️ à REQUALIFIER : c'est un index
    d'extrapolation, pas un paramètre ARC. Probablement `structural`, à trancher en le codant.
  - Âges-seuils : `18` (CELI/CELIAPP) · `71` (conversion REER→FERR) · `15` (durée de vie CELIAPP) ·
    `65` (crédit d'âge, pivot RRQ/PSV — **2 modules**, donc le plus payant) · `70` (report PSV max) ·
    `75` (bonification PSV) · `39`/`40` (déjà nommés : RRQ_DENOMINATOR_YEARS, PSV_FULL_RESIDENCY_YEARS
    → doc seulement, aucun code à toucher).
  ⚠️ **Rendement décroissant assumé** : les 3 premières valeurs pilotaient un CALCUL. Ce qui reste
  est surtout des âges-seuils déjà commentés et sourcés sur place. Le seul vrai gain restant est le
  `65` (deux modules → risque de divergence). Le reste est de l'hygiène, à prendre au fil de l'eau,
  pas un chantier à prioriser.
  ⚠️ NE PAS toucher aux entrées `design` (`0.95` Guyton-Klinger, `0.50` vente fictive, seuils de
  meltdown, `0.25` proxy d'inversion impôt→gain) : les « sourcer » serait une erreur de CATÉGORIE
  qui polluerait FISCAL_REFERENCE avec des choix de conception.
- [ ] **`[FISC-RRIF-94-FACTOR]`** (S si confirmé, ⚠️ GATÉ source humaine — `A_FAIRE_MOI`) —
  `helpers.ts:95` code `94: 0.2000` ; le facteur prescrit serait 18,79 % (plateau 20 % à 95+).
  **Mesuré +13 726 $** de patrimoine final si corrigé. Le proxy bloque `canada.ca` → NE PAS
  modifier sans avoir vu le règlement 7308(4). Corriger aussi `FISCAL_REFERENCE.md:467` et
  `tests/services/projection.helpers.test.ts:80` dans le même lot.
- [ ] **`[FISC-RRSP-ROOM-PER-USER]`** (M, ⚠️ GATÉ décision Marc — `A_FAIRE_MOI`) — les droits REER
  sont calculés sur le revenu du MÉNAGE (`taxJanuary.ts:165`) alors que la règle ARC est PAR
  PERSONNE. **Mesuré : 45 000 $ accordés vs 34 480 $ dus** sur un ménage à 250 k$ avec un seul
  gagnant (+10 520 $/an de droits fantômes) → déduction REER surestimée, REER surdimensionné en
  projection. Changement de MODÈLE, pas correctif au fil de l'eau : plan + mesure avant/après.
- [ ] **`[FISC-RRSP-LIMITS-PRE2024-DOC]`** (S, doc — audit 2026-08-06) — `RRSP_ANNUAL_LIMITS` porte
  **14 valeurs 2010→2023** (22 000 → 30 780) qui n'apparaissent NULLE PART dans
  `FISCAL_REFERENCE.md` (§REER ne liste que 2024+). Elles pilotent les droits REER HISTORIQUES via
  `setupSimulation.ts:70`, donc de l'argent. Valeurs jugées correctes, mais non sourcées = suspectes
  par la règle du dépôt. Documenter dans le même geste que `[FISC-REF-DEDUP]`.
- [ ] **`[FISC-RRSP-FALLBACK-PRE2010]`** (M, MOYEN [MESURÉ — audit 2026-08-06], PRÉ-EXISTANT) —
  `RRSP_ANNUAL_LIMIT_FALLBACK = 32 490 $` (le plafond **2025**) est appliqué à TOUTE année
  **antérieure à 2010** (`setupSimulation.ts:70`). Pour un résident de longue date, chaque année
  pré-2010 reçoit donc un plafond de 2025. Le plafond ne mord qu'au-delà de ~180 k$ de salaire
  projeté en arrière (vs ~122 k$ avec le vrai plafond 2010) → **sur-attribution possible de
  10-19 k$ de droits REER par année pré-2010** pour un haut revenu, donc des déductions supérieures
  au légal. ⚠️ Changement de MODÈLE sur les droits historiques → plan + mesure avant/après, pas un
  fix au fil de l'eau.
- [ ] **`[FISC-RRSP-EXTRAP-05]`** (S, doc — audit 2026-08-06) — l'extrapolation du plafond REER
  au-delà du barème connu ajoute **+0,5 %/an** à l'inflation (`taxJanuary.ts:163`). §REER est muette ;
  le +0,5 % n'est documenté que pour le MGA (§6). Invisible au garde de constantes (`0.5` est classé
  bénin). Sourcer ou requalifier en hypothèse de modèle assumée.
- [ ] **`[FISC-RRSP-RENTAL-EARNED]`** (S-M, [Supposition] non chiffrée — audit 2026-08-06) — le
  revenu NET de location est du revenu GAGNÉ au sens de 146(1), mais il alimente `accRentesYear`
  et jamais `accGrossIncomeYear` (`realEstateMonth.ts:397`) → droits REER sous-estimés pour un
  propriétaire-bailleur (~4 320 $/an de droits non créés sur 24 k$ de loyer net). À confirmer.
- [x] **`[FISC-RRIF-FRACTIONAL-AGE]`** ✅ 2026-08-06 (PR #573) — `rrifRateForAge()` remplace le repli
  attrape-tout : plateau EXPLICITE à 95+ (`RRIF_PLATEAU_AGE`, seuil qui n'était porté que par
  l'absence d'entrée dans la table), âge entier pour un fractionnaire, **0** pour un âge non fini.
  Discriminant prouvé contre `git archive` : l'ancien code rendait 20 % — le facteur le plus
  punitif — sur 72,5 · 93,9 · NaN · +Infinity. Identité bit-à-bit du moteur vérifiée par SHA-256
  sur 361 mois × 102 champs (sonde prouvée discriminante : 1 point de base déplace le hash).
  Au passage : `RRIF_FIRST_WITHDRAWAL_AGE` nommé (il vivait en dur sur taxJanuary ET taxDecember).
- [x] **`[FISC-REF-DEDUP]`** ✅ 2026-08-06 (PR #573) — un sujet, un endroit : les valeurs vivent dans
  §CELI / §REER / §FERR, et la section d'ancrage ne garde que la PROVENANCE et la leçon.
- [ ] **V8 — Features demandées** — ✅ `[GOAL-DEADLINE-UI]` + ✅ `[PH4C-SAVINGS-NATURE]` (#569) +
  ✅ `[SUBS-TAB]` volet « ignorer » (#570). RESTENT : `[SUBS-TAB]` volet EMPLACEMENT (gaté sur
  l'arbitrage de Marc) · `[CHAT-PAGE-CONTEXT-V2]` (file explicite Marc) ·
  `[ASSET-CURRENCY-BACKFILL]` (gaté : rien à coder tant que le log `services/portfolio.ts:60-62`
  n'apparaît pas chez Marc).
- [ ] **V8bis — `[FUTUR-DAILY]` granularité QUOTIDIENNE (demande explicite Marc 2026-08-06)** —
  « quotidien sur tout, je veux voir le détail si je zoom beaucoup », futur ET passé, avec le détail
  par compte. ⚠️ Marc a tranché CONTRE ma reco (je proposais le quotidien seulement là où l'app a de
  vraies dates). Décision prise, **ne pas re-proposer de restreindre**.
  **Conception retenue** : le moteur RESTE mensuel (source de vérité, `projection.ts` intouché — le
  passer au jour = ~11 000 itérations × chaque tirage MC, et rejouer au jour une fiscalité qui n'a
  que des événements ANNUELS). Un module RAFFINE la fenêtre zoomée à la demande.
  **Invariant money-critical** : la série quotidienne passe EXACTEMENT par les points mensuels, par
  construction. Deux granularités qui divergeraient = deux soldes pour la même date selon le zoom.
  **LIVRÉ pour l'essentiel (PR #581→#587, mergées 2026-08-11/12)** — les étapes cochées sont
  ARCHIVÉES avec leur contexte dans `docs/BACKLOG_ARCHIVE.md` (section 2026-08-12). Ci-dessous :
  le RESTE VIVANT du chantier, uniquement.
- [x] **`[FUTUR-DAILY-TOUCH]` zoom au DOIGT sur les graphes (pincement)** ✅ 2026-08-12 (retour
      Marc 14:50 : « je veux pouvoir zoomer parce que pour l'instant sur le tel c'est inutilisable
      trop petit trop cramped impossible » ; cadrage : TOUS les graphes d'un coup, 2 doigts = zoom,
      1 doigt = la page). Implémenté DANS `useTimeChartZoom` (les 9 consommateurs héritent via
      `containerRef`/`ZoomContainer`) : pincement = zoom + pan combinés (base figée au départ du
      geste — ratio, donc pas de point-fixe d'arrondi), `touch-action: pan-y` posé par le hook,
      armement au touchMOVE (un écartement réel démarre doigts collés — mesuré par sonde CDP),
      garde `isPinchActive` contre la sélection au lever du 2e doigt. 8 unitaires (discriminants,
      8/8 rouges sur l'avant) + 2 e2e tactiles réels (CDP `gestureSourceType: 'touch'` — le
      « default » est la MOLETTE en desktop headless, leçon CONVENTIONS).
  - [ ] **`[FUTUR-DAILY-CADENCE]` cadence de paie dérivée des documents** (demande Marc 2026-08-11 :
        « je veux que ça dépende des PDF que je donne ou ce que j'indique à Claude… je veux pour
        l'instant que ce soit jeudi hebdo »). Aujourd'hui `DEFAULT_PAY_DAY_OF_WEEK` est un défaut de
        CODE : tous les montants quotidiens du futur en dépendent (un mauvais rythme décale chaque
        solde de plusieurs jours). À dériver des relevés/paies importés, avec repli sur le défaut
        actuel. Ampleur : M.
        Donc : au zoom fort, courbe de VN quotidienne + aires mensuelles ou masquées, et l'écran doit
        le DIRE. À valider avec Marc avant de coder.
        ⚠️ **2e prérequis de l'étape 2, trouvé en revue** : `resolvePointFromClick`
        (`utils/chartTooltip.ts`) et `handleWheel` (`hooks/useTimeChartZoom.ts`) résolvent la
        position par INDEX DE TABLEAU (`frac × (length − 1)`), en supposant un espacement uniforme.
        C'est vrai aujourd'hui — tous les producteurs de `monthIndex` incrémentent de 1 sans trou
        (`buildPastPrefix.ts`, `monthlyOutput.ts`) — donc sur un axe numérique à domaine
        `[dataMin,dataMax]` la relation position ∝ index tient par transformation affine. Dès que
        `displayData` portera des `monthIndex` FRACTIONNAIRES, les deux divergeront silencieusement
        de la position réellement rendue (le clic résout le mauvais point, le curseur de zoom dérive).
        À traiter EN MÊME TEMPS que l'injection des points quotidiens, pas après.
  - [ ] ⚠️ **Divergences d'ANCRE du cash quotidien** — ⚠️ **PLUS latentes depuis #582** (le cash
        quotidien est branché sur la courbe) : `computeStartingCash` compte TOUTE transaction, la
        quotidienne exige une date complète. Un flux daté au mois seul est dans l'ancre mais pas dans
        les points → tout le niveau passé décalé (mesuré −2 000 $). Idem pour un flux daté APRÈS
        aujourd'hui.
        **Mitigation RÉTABLIE 2026-08-11 (`[FUTUR-DAILY-ANCHOR-CAVEAT]`)** : la suppression du
        panneau (#584) avait emporté l'avertissement avec elle — régression d'honnêteté attrapée à
        la relecture du BACKLOG, pas par un test. `buildDailyPastLedger` rend désormais
        `undatedTotal`/`flowsAfterNowDate` (y compris quand AUCUNE ligne n'est produite) et le
        BANDEAU de la vue au jour les affiche en avertissement.
        - [ ] Le vrai correctif — retrancher ces flux de l'ancre — touche `computeStartingCash`,
              donc le raccord au présent : **plan-first**, inchangé.
  - [ ] Liquidités par COMPTE bancaire — ⚠️ BLOQUÉ par une absence de donnée : on reconstruit à
        rebours depuis le solde connu d'AUJOURD'HUI, or il n'est connu que GLOBALEMENT.
        `FintableBrokerBalance` ne couvre que les comptes `kind: 'investment'`. Prérequis : persister
        les soldes des comptes `kind: 'cash'` (la sync les LIT déjà, elle les agrège).
  ⚠️ Contraintes de garde pour la suite du chantier (pas des tâches) : NE JAMAIS mettre de
  décimales dans `monthIndex` (clé d'axe du graphe, du tableau ET des icônes-jalons — les jalons
  se désaligneraient en SILENCE ; la granularité vit dans `date`) · vérifier le POIDS stocké
  avant de livrer une densification (`[HIST-STORE-SIZE]` a été fait POUR tenir le quota).
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

- [ ] **`[ENG-GK-THRESHOLD-KNIFE]`** (M, MOYEN [MESURÉ — panel #564], PRÉ-EXISTANT) — le garde-fou
  Guyton-Klinger (`taxJanuary.ts` §5 : `currentPortfolio < prevPortfolioNW * 0.95`) est un seuil
  COUTEAU : un écart d'impôt de quelques centaines de dollars suffit à déclencher un gel de
  dépenses supplémentaire, qui vaut ensuite **−174,36 $/mois À VIE**. Mesuré au panel #564 : le
  CID (256 $/an) fait basculer le classement des stratégies d'un couple à 800 k$ non-enregistré
  (MELTDOWN 1re → 3e ; AUTO +28 % de patrimoine final EN PAYANT 2 225 $ d'impôt de PLUS).
  Le moteur est cohérent, mais la recommandation de stratégie devient instable pour un écart
  négligeable. Piste : hystérésis ou lissage du seuil plutôt qu'une comparaison sèche.
- [ ] **`[FISC-DIV-DERIVED-BASES]`** (S-M, FAIBLE [panel #564], PRÉ-EXISTANT) — deux assiettes
  dérivées ignorent le dividende majoré alors qu'elles incluent les gains : la prime **FSS**
  (`taxDecember.ts:719`, prend `accCapitalGainsYear × 0,5`) et le revenu de récupération **PSV**
  (`computeOasClawback`). Asymétrie rendue plus saillante par [FISC-STACK-GAINS-DIV] sans être
  corrigée. Chiffrer avant de coder. Voisin : le **clamp du CID** (`Math.max(0, grossTax − cid)`)
  perd l'excédent annuel au lieu de réduire l'impôt des autres revenus (mesuré : 0 $ d'impôt
  dividendes sur un couple à 1,5 M$ non-enreg à faible autre revenu, avant comme après).
- [ ] **`[FISC-BAND-AGE-CREDITS]`** (M, MOYEN [MESURÉ — panel #564], PRÉ-EXISTANT) — les bandes
  incrémentales de gains et de dividendes (`taxDecember.ts` §2 et §3) appellent
  `calculateFiscalReport(income, 0, 0, year, true)` **sans `ageOpts`** : les crédits 65+/pension
  sont donc absents des DEUX bornes, ce qui efface leur **récupération** (income-tested) sur le
  revenu de placement → sous-imposition d'un retraité. Mesuré sur une bande de +15 k$ à 70 ans :
  **−648,66 $/an** à 45 k$ de revenu de base, **−675,56 $/an** à 60 k$, −146,89 $ à 100 k$.
  ⚠️ Non introduit par #564 (identique sur origin/main). Fix : passer `ageOpts` aux deux bornes —
  attention, ça re-basera des goldens retraités (mesurer avant).
- [ ] **`[FISC-PENSION-CREDIT-REAL]`** (S, MOYEN [Certain, mesuré — panel #556], GO Marc requis :
  re-base de goldens retraités) — le crédit pension fédéral 2 000 $ est GELÉ nominalement
  (FISCAL_REFERENCE:178) mais traité à plat en espace RÉEL (`utils/tax.ts` l.249) → il vaut de
  facto 2 000 $ réels constants au lieu de `2 000/(1+i)^Δ`. Unique terme non homogène du barème
  réel (sweep 1 920 cas : zéro autre écart). Sous-imposition ≤ 250,50 $ réels/pers/an (couple 65+
  avec pension admissible : ~12 k$ réels sur 30 ans, sens NON conservateur). Fix connu :
  `Math.min(PENSION_INCOME_AMOUNT_FED / realDeflator, pension)` + note FISCAL_REFERENCE.
- [ ] **`[FISC-BRACKET-CPI-STRESS]`** (M, décision de MODÈLE [À vérifier avec Marc] — panel #556) —
  post-fix, à `i ≠ 2 %` le barème érode en réel à `(1,02/(1+i))^Δ` alors que l'ARC/RQ indexent au
  CPI réel, et que PSV (seuil clawback ×(1+i)^Δ) et SRG (gelé en $ réels) sont indexés pleinement →
  les scénarios de STRESS surestiment l'impôt (mesuré : ttp +106 % à i = 8 %, +76 % à 5,5 %).
  À i = 2 % (défaut) : aucun effet. Options : indexer les paliers à `simInflation` (fidèle CPI,
  contredit ADR 009 « ~2 %/an ») vs statu quo documenté (conservateur en stress). Trancher avec
  Marc avant de coder.
- [ ] **`[FISC-MARGINAL-SPACE]`** (M — panel #556, PRÉ-EXISTANTS, non chiffrés en $) — sites qui
  confrontent un revenu et un barème d'espaces différents via `.marginalRate`/`getMarginalRate`
  (barème 2026 figé : `utils/tax.ts:824` ne passe ni `year` ni `realDeflator`) :
  `cashflowAllocation.ts:350` (revenu NOMINAL croissant vs barème 2026 → AUTO_MARGINAL bascule
  REER-first trop tôt), `realEstateMonth.ts:250` (retrait REER d'achat sur-imposé, conservateur),
  `projection.ts:1616-1618` (taux affichés sous-évalués : salaire de base sans croissance vs
  barème indexé). Chiffrer en $ avant tout fix ; propager `year`+`realDeflator` au
  `.marginalRate` du report changerait TOUS les lecteurs → mesurer d'abord.
- [ ] **`[ENG-TTP-UNSETTLED-PROPAGATE]`** (S-M — contre-vérif #555) — 4 surfaces lisent encore
  `totalTaxesPaid` NU : `monteCarlo.ts:108,145` (taxLeakage), `getProjection.spec.ts:99` +
  `simulateWhatIf.spec.ts:131` (netTaxSettlements servi à l'IA), `drawdownOptimizer.ts:61`
  (GoalSeekerCard). Le terme dépend de la STRATÉGIE (AUTO 13 542 vs MELT 15 933 sur le même
  scénario) → l'IA et l'optimiseur peuvent annoncer deux « impôts » divergents de 8,6 % (100 % à
  1 an). Propager `+ unsettledTaxAtHorizon` OU documenter la divergence par surface.
- [ ] **`[ENG-RANKING-ORDER-PIN]`** (S — panel #554) — `rankStrategies` normalise min-max sur le
  compteur (poids 0,25) : pinner l'ORDRE complet (objectifs `tax` et `balanced`) sur une fixture de
  référence, pas seulement la paire MELT/AUTO. Le validator a MESURÉ le nouvel ordre post-fix
  (balanced : MELTDOWN > PRIO_REER > AUTO sur retraité 62) — c'est LA baseline à pinner.
- [ ] **`[ENG-RANKTAX-ESTATE]`** (M, MOYEN [Certain, mesuré ×3,6] — panel #554, PRÉ-EXISTANT
  amplifié) — l'objectif « impôt » de `rankStrategies` ne score QUE `totalTaxesPaid` :
  `totalEstateTax` n'entre nulle part → « impôt minimum » récompense le REPORT (mesuré : PRIO_CELI
  classé 1er avec ttp −189 849 $ + estateTax 1 299 510 $ = 3,6× l'impôt TOTAL de MELTDOWN).
  `avgEfficiency`/FVI ont le même angle mort (PRIO_CELI « 98,9 % efficace » avec 1,3 M$ d'impôt
  latent). Fix : `nTax` sur `totalTaxesPaid + totalEstateTax` OU libeller « impôt payé de son
  vivant » — décision produit, poser à Marc.
- [ ] **`[ENG-RAP-MISSED-REPAYMENT-TAX]`** (S — panel #554, PRÉ-EXISTANT) — un remboursement RAP
  sauté (liquide insuffisant, `realEstateMonth.ts:419-427`) devrait ajouter 1/15 du solde au revenu
  IMPOSABLE (règle ARC) — jamais modélisé, dans aucun compteur.
- [ ] **`[UI-FMTM-FORMATCAD]`** (S — panel #554, PRÉ-EXISTANT) — `fmtM` maison
  (`StrategyOptimizerPanel.tsx:57`, `(v/1e6).toFixed(2)M$`) viole « formatCAD UNIQUEMENT » et
  écrase la granularité (6 157 $ → « 0.01M$ »).
- [ ] **`[FISC-GIS-COUPLE-RATE]`** (M, ÉLEVÉ hors profil Marc [Probable — table Service Canada NON
  confirmable du conteneur]) — `utils/tax.ts:497-498` : clawback SRG 0,50 PAR ADULTE sur le revenu
  COMBINÉ → récupération 2× trop rapide ; `GIS_INCOME_THRESHOLD_COUPLE` 29 760 $ = CODE MORT (la
  formule s'annule dès 15 888 $) ; test `tax.test.ts:968` VACUEUX. Mesuré : 0 $ vs 7 944 $/an à
  15 888 $ combiné. ⚠️ Exiger la table SC + corriger FISCAL_REFERENCE §6 + remplacer le test, même PR.
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
  ⚠️ **RE-MESURÉ 2026-08-05 avant de coder (avec les VRAIES données de Marc) : impact 0,00 $** —
  il est en mode SOLO (`coupleMode: false`, 1 user) donc `splitRatio = 1/1` et tout le revenu de
  placement lui est déjà attribué. Le bug est réel mais DORMANT : 2 342 $/an de sous-imposition
  sur une fixture couple mono-salarié (60 k$ + 0 $, addOn 12 970 $). ⚠️ Hypothèse RÉFUTÉE au
  passage : je pensais l'app et le MCP divergents (le MCP `filter(g>0)` exclut le conjoint sans
  salaire, l'app non) — mesuré IDENTIQUES, parce que la moitié du placement tombe sous le BPA et
  ne produit aucun impôt. La divergence n'apparaîtrait qu'au-delà de ~670 k$ de non-enregistré.
  → **Condition d'activation : bascule de Marc en mode couple.** Le levier existe déjà
  (`Asset.owner` + `services/couple/netWorthByOwner.ts` `defaultOwner`), donc rien à préparer.
- [ ] **`[FISC-LINE361-PERCONJOINT-REDUC]`** (M, [À vérifier] — V5) — réduction 18,75 % ligne 361
  appliquée par conjoint avec le revenu familial TOTAL (`taxDecember.ts:529` → `tax.ts:255`).
  Plafonné ~986 $/an, couple retraité 65+ seulement (0 $ Marc aujourd'hui). Lire l'Annexe B d'abord.

> Findings panel #552 (financial-integrity MESURÉ + silent-failure + code-reviewer, 2026-07-31) —
> les corrigés dans #552 même sont dans l'archive au merge ; ici le RESTE à faire :

- [ ] **`[ENG-PAST-OWNED-VS-PLANNED]`** (M, ÉLEVÉ [Certain, mesuré] — panel #552) — `RealEstateGoal`
  n'a AUCUN discriminant « bien DÉTENU » vs « objectif planifié non réalisé » : un objectif saisi
  pour 2024 jamais mis à jour injecte +156 628 $ d'équité et +307 081 $ de dette FANTÔMES au m0
  (`purchaseOffset < 0` suffit depuis V2'). Mitigé dans #552 par un log lifeEvents visible au m0 ;
  vrai fix = champ explicite `isOwned` + question UI à la saisie d'une date passée → **décision
  Marc requise** (UX). 
- [ ] **`[IMMO-3-FORMULES]`** (M, MOYEN [Certain, mesuré 8 364 $] — panel #552) — TROIS formules
  concurrentes pour l'équité passée/présente : `initPastPurchase` (SCHL, sans rénos), 
  `runAmortization` (`realEstate.ts:118` — IGNORE la prime SCHL, clampe l'équité ≥ 0, rénos),
  moteur mensuel. Écart mesuré 8 364,31 $ au raccord historique↔présent du MÊME écran. Fix :
  intégrer la prime SCHL au principal de `runAmortization` (même `calculateSchlPremium`) + revisiter
  le clamp ≥ 0 (perte d'info underwater), puis re-baseliner les tests d'historique.
- [ ] **`[ENG-PROPGROWTH-ZERO-INEXPRIMABLE]`** (S, MOYEN — panel #552) — `realEstateMonth.ts:347`
  `(propertyGrowthRate || 3)` rend une croissance immobilière NULLE inexprimable (0 → 3 %/an).
  #552 aligne `initPastPurchase` sur cette convention (parité) ; le vrai fix (accepter 0, défaut 3
  seulement si absent) touche tous les scénarios existants → re-baseliner SCIEMMENT.
- [ ] **`[ENG-PROPGROWTH-CONFIG-DEAD]`** (S — découverte `[FUZZ-ONETIME-FLOWS]` 2026-08-12,
  [Certain, mesuré au grep]) — `ProjectionConfig.propertyGrowthRate` (types.ts:219) n'est lu par
  AUCUN code de prod : le moteur ne lit que `goal.propertyGrowthRate` (realEstateMonth.ts:354,
  pastPurchaseInit.ts:98), l'UI aussi (RealEstate.tsx:82, PropertyConfigurator.tsx:40). Le champ
  config est un réglage FANTÔME : le remplir ne change RIEN (prouvé : équité négative 0/120 dans
  le fuzz tant que le taux était câblé côté config). Fix à trancher : le retirer de
  `ProjectionConfig` (+ des `makeProjection` de tests), OU le brancher comme défaut d'un bien
  sans taux propre — puis nettoyer.
- [ ] **`[ENG-RENEWAL-M0]`** (S, FAIBLE — panel #552) — un bien passé détenu depuis un multiple
  exact de 60 mois subit le RENOUVELLEMENT (choc déterministe `charCodeAt % 3`) dès le mois 0
  (PMT −240 $ mesuré au 1er point affiché). Préexistant, atteignable au m0 depuis V2'. Option :
  décaler le 1er renouvellement d'un mois ou seeder le choc à 0 au m0.
- [ ] **`[ENG-CELIAPP-RESIDUAL-PASTBUY]`** (S, FAIBLE — panel #552) — un solde CELIAPP résiduel
  n'est plus liquidé quand l'achat est déjà fait (bloc d'achat sauté) ; repli 15 ans/71 ans
  (`taxJanuary.ts:149-153`) → retrait non imposable MANQUÉ (pas de perte de capital). Détecter le
  cas « CELIAPP > 0 + bien passé » et le signaler (ou transférer au REER à l'init).
- [ ] **`[ENG-RENEWAL-RATE-MISMATCH]`** (M, ÉLEVÉ [Certain, mesuré] — panel #552, PRÉ-EXISTANT) —
  au renouvellement hypothécaire, le PMT est recalculé au NOUVEAU taux mais l'intérêt mensuel reste
  à `goal.mortgageRate` (`realEstateMonth.ts:~349`) : renouvellement 4,5 %→3 % mesuré → capital
  551 $/mois seulement, solde encore 211 569 $ après 10 ans sur un prêt censé s'éteindre à 240 mois.
  Frappe tout achat (futur à m+60, passé dès m0 si multiple de 60). Fix : porter le taux courant
  dans pState (ex. `currentRate`) et le consommer pour l'intérêt. Re-baseliner SCIEMMENT.
- [ ] **`[ENG-NETTRANSFER-REER-INCOMPLET]`** (S — panel #552) — `NetTransferREER`
  (`monthlyOutput.ts:291` = ContribREER − withdrawalREER) ne voit ni FERR ni meltdown (écart
  cumulé 330 353 $ vs `RetraitREER` sur 301 mois) ; les deux séries cohabitent dans
  `ProjectionExplains.tsx:41`. Aligner (ou documenter la sémantique « transferts de la cascade
  seulement » à l'écran).
- [ ] **`[UX-ISACTIVE-SEMANTIQUE]`** (S, **décision Marc** — panel #552) — un bien créé dans
  l'onglet Immobilier naît `isActive: false` (« Activer dans Simulation ») → il ne compte NI au
  KPI Accueil NI au moteur tant qu'on ne l'active pas. Cohérent (mêmes conventions partout) mais
  piégeux : ta maison saisie sans clic « Activer » = patrimoine amputé de l'équité. Trancher :
  activer par défaut à la création ? Badge « non comptée » sur le KPI ?

## 🏦 Sync & données (Fintable, Drive, persistance)

- [ ] **`[DEFAULTS-DRIFT-FINTABLE-FIELDS]`** (S effort, L sévérité — V3, finding code-analyzer
  2026-07-31) — `buildDefaultAppState()` (`mcp/state/appStateDefaults.ts:22-60`) OMET 4 champs du
  store : `categoryReview`, `fintableSyncReport`, `fintableBrokerBalances`, `fintableRoles` →
  structurellement INVISIBLES au chat in-app (`appStateProvider.ts:33` dérive de Object.keys) et à
  `normalizeAppState`. Cause racine : `registryParity.test.ts:104-113` UNIDIRECTIONNEL (n'itère que
  sur mcpDefaults). Fix : +4 champs (`: undefined`) + test bidirectionnel.

- [ ] **`[FINTABLE-SOURCE-TAG]`** (M, ÉLEVÉ — finding #1 panel #561, LIMITE CONNUE de
  `[FINTABLE-STALE-ALERT]`) — `computeSyncHealth` compte TOUTES les transactions sans distinguer
  leur provenance (`Transaction.status` ne dit pas « Fintable » vs « CSV »). Chemin réel et
  plausible : l'import Fintable regèle → l'utilisateur, inquiet, importe un relevé CSV à la main →
  `daysSinceLastTransaction` retombe à 0 → statut `ok`, bannière éteinte, connecteur mort qui
  repasse pour vivant. C'est le MÊME vert trompeur que l'incident du 2026-08-05, par une autre
  porte. Fix : taguer l'origine (champ additif optionnel `source: 'fintable' | 'csv' | 'manual'`,
  donc zéro migration) OU persister `lastProductiveAt` (dernière passe avec `transactionsAdded > 0`)
  et fonder la fraîcheur Fintable là-dessus. ⚠️ Tant que ce ticket est ouvert, ne PAS considérer que
  « le connecteur ne peut plus geler en silence ».
- [ ] **`[FINTABLE-BACKFILL-HISTORY]`** (M, ⭐ demandé par Marc 2026-08-05 : « avec la version
  payante je devrai pouvoir importer beaucoup plus de transactions de fintable ») — ⚠️ **En l'état,
  il n'en importera AUCUNE de plus** : `deriveCutoverDate` (`services/fintable/deriveCutoverDate.ts`)
  fixe la bascule à la date de la transaction la PLUS RÉCENTE, et le mapper ne prend que ce qui est
  APRÈS (`transactionsAfter`). C'est la garde anti-doublon voulue (Marc a ~2 019 transactions dont
  18 mois saisis à la main), mais elle interdit aussi tout RATTRAPAGE d'historique : un plan payant
  qui exposerait 12-24 mois au lieu des 30 jours mesurés le 2026-07-29 ne changerait rien.
  Fix : passe de backfill SÉPARÉE de la sync courante — fenêtre explicite (ex. « importer depuis
  telle date »), application via `applyPayloadsIsolated`, puis dédoublonnage contre l'existant avec
  `findDuplicateGroups` (`services/transactions/duplicateDetection.ts`, DÉJÀ écrit et testé) et
  revue humaine des groupes douteux avant écriture. ⚠️ Money-critical : un doublon de transaction
  fausse le budget réel ET la moyenne 12 mois. Ne JAMAIS écrire sans dédoublonnage.
  Prérequis : confirmer avec Marc la profondeur réellement offerte par son plan (mesurer, ne pas
  supposer — 90 j demandés / 30 rendus au dernier test).
- [ ] **`[FINTABLE-SYNC-XTAB-MUTEX]`** (S, sœur de STALE-BASE, restée ouverte) — le cooldown
  localStorage n'est PAS un mutex cross-onglet : deux onglets ouverts peuvent lancer une passe
  simultanée (fenêtre étroite, intégrité seulement — la déduplication de `applyDocument` empêche
  les doublons, mais les deux passes se battent sur le dernier écrivain du solde).
- [ ] **`[ENG-T1213-NET-MONTHLY]`** (M, MOYEN, pré-existant — mesuré panel #558, −183 598 $/30 ans) —
  activer `optimizeSourceDeductions` (T1213) ANNULE le bénéfice fiscal du REER dans la simulation :
  la retenue modélisée baisse mais le net MENSUEL encaissé (`activeIncome.ts`) ne monte jamais →
  le ménage supporte `tax(g,0)` au lieu de `tax(g,d)`, à l'ENVERS de la réalité (T1213 est
  neutre-à-positif). Pré-existant (−180 136 $ avant WHT-92PCT, amplifié +1,9 %). Fix : majorer le
  net mensuel de `[tax(g,0)−tax(g,d)]/12` quand T1213 actif — sinon RETIRER le toggle de l'UI
  (`AdvancedProjectionParams.tsx`), il ne peut que nuire.
- [ ] **`[ENG-NET-MODEL-RESIDUAL]`** (M, FAIBLE-MOYEN, pré-existant — mesuré panel #558) — le net
  MENSUEL encaissé est le `netSalary` SAISI, jamais réconcilié avec l'impôt du MODÈLE : résidu
  mesuré −3 088 $/an (fixture 98,4 k$, le moteur « perd » du net) à +7 338 $/an (fixture 240 k$,
  il en « crée »). Documenté FISCAL_REFERENCE §9 (biais a). Piste : afficher l'écart net saisi vs
  net modélisé dans TaxCenter (diagnostic), ou réconcilier via un facteur calibré au boot.
- [ ] **`[SDK-IMPORT-TIMEOUT]`** (S, résiduel panel #547, non bloquant) — le chargement du chunk SDK
  (`services/claude.ts:157`) n'est couvert par aucun timeout : un `import()` qui stalle sans rejeter
  pend indéfiniment (borné : 1er usage par session). Fix : course import() vs timer 8-10 s dans
  importWithRetry. ⚠️ Partagé par tous les lazy — dimensionner pour recharts sur connexion lente.
- [ ] **`[P0-IDB]`** (L, ⏳) — migrer la persistance localStorage → IndexedDB (quota ~5 Mo + parsing
  synchrone au boot). ⚠️ Migration schéma persist v7 — vigilance corruption.
- [ ] **`[PROFIL-SWITCH]`** (M, 🧭 gaté questions 2026-08-01) — (a)+(d) couverts par PERSONA-PURGE ;
  restent : sélecteur de profil explicite (nom + type réel/test visibles) + persistance ISOLÉE par
  profil (clé storage dédiée, pas d'écrasement croisé). ⚠️ Touche la persistance des VRAIES données
  → questions posées à Marc AVANT de coder (batch en chat 2026-08-01) : (1) combien de profils
  RÉELS (juste « Marc » + personas de test, ou plusieurs réels genre « couple » vs « perso ») ?
  (2) lequel pousse vers Drive (un seul ? chacun son fichier ?) ; (3) que devient le profil actuel
  au premier lancement (migration de la clé existante = profil « Marc » par défaut ?) ;
  (4) le switch doit-il exiger une confirmation (anti-fausse-manip devant témoin) ?
- [ ] **`[ASSET-CURRENCY-BACKFILL]`** (S, attente signal) — backfill devise legacy SEULEMENT si le
  log `services/portfolio.ts:60-62` apparaît chez Marc. Ne rien coder avant.
- [ ] **`[PURGE-TOAST-UX]`** (S, 🧭 si Marc le veut) — le pull Drive qui purge des artefacts persona
  ne fait que logError (`syncPull.ts:78`) ; le toast n'existe qu'au boot. Abonnement générique → toast.
## 💬 Chat / IA

- [ ] **`[CHAT-PAGE-CONTEXT-V2]`** (M, file Marc « chat conscient de la page ») — instrumenter les
  autres onglets (Investissements : filtres/compte ; Futur : scénario + année survolée ; Impôts :
  année ; Dettes ; Transactions : recherche/filtres). L'union `ViewContextDetail`
  (`services/aiChat/viewContext.ts:49`) n'a qu'UN membre (Budget).
  ⚠️ **CADRAGE MESURÉ 2026-08-05 — le ticket sous-estime le prérequis.** « Un petit detail typé +
  publisher par onglet » suppose que le pipeline accepte un 2ᵉ membre tel quel. Ce n'est PAS le cas :
  `describeViewContextForPrompt` (`viewContext.ts:~134`) déréférence DIRECTEMENT les champs de
  `BudgetViewDetail` (`d.totalSpent`, `d.totalBudgetTarget`, `d.totalRealIncome`, `d.topCategories`,
  `d.personFilterLabel`, `d.cards`) sans jamais tester `d.kind`. Ajouter un membre à l'union CASSE
  le typecheck sur ce bloc — et le « corriger » à la va-vite sur une surface qui alimente un PROMPT
  serait dangereux : ce code porte 3 findings de sécurité (assainissement du texte utilisateur,
  encadrement `<DONNEES>`, troncature JAMAIS muette).
  ⇒ **Lot 1 = généraliser le constructeur AVANT tout onglet** : dispatch sur `kind`, chaque membre
  rendant ses propres lignes, en conservant les 3 garanties ci-dessus PAR MEMBRE (un nouveau membre
  ne doit pas pouvoir oublier l'assainissement). Puis 1 onglet pour valider la forme, puis les autres
  au fil de l'eau. ⚠️ Ne PAS enregistrer le scope sans l'ajouter à `SCOPE_TO_TAB` (`viewContext.ts:~110`) :
  sans ça, `viewContextMatchesTab` renvoie faux et la page publie dans le vide, en silence.
- [ ] **`[CHAT-PAGE-CONTEXT-V3]`** (M, évaluer AVANT) — état fin volatile (modal ouvert, tooltip figé
  du Futur, ligne sélectionnée) — fragile ; juger la valeur réelle avant de coder.

## 📈 Investissements & historique

- [ ] **`[SUBS-TAB]` — volet EMPLACEMENT seulement** (S, ⚠️ EN ATTENTE d'une décision de Marc) —
  le flux « confirmer / ignorer » est LIVRÉ (#570 : « Pas un abo » persistant + réaffichage).
  ⚠️ **Constat 2026-08-05, à ne pas re-découvrir** : la surface EXISTE DÉJÀ dans `Planning.tsx`
  (section `fixed`, « Abonnements & Récurrents ») avec alertes, totaux et épinglage — le ticket
  parlait d'une « surface dédiée » comme s'il n'y en avait aucune. Marc a répondu « sous-onglet de
  Transactions », mais la liste vit aujourd'hui dans **Budget**. Je lui ai signalé que déménager
  n'apporte rien au manque réel (l'exclusion, maintenant livrée) → **attendre son arbitrage** avant
  tout chantier de navigation. Ne PAS coder le déplacement sans go explicite.


- [x] **`[A11Y-INK500]`** ✅ 2026-08-12 — classification par-occurrence des 115 matchs du grep :
  6 étaient des `pink-500` (substring !) + 2 commentaires ; sur les 107 réels, 85 TEXTES actifs
  migrés → `ink-400` (AA normal 5.21-6.42 mesuré) et 22 GARDÉS en `ink-500` légitime (glyphes
  décoratifs aria-hidden, icônes-boutons ≥3:1 WCAG 1.4.11, numérotation présentationnelle,
  grandes icônes d'états vides).
- [x] **`[A11Y-FUTUR-MILESTONES-KEYBOARD]`** ✅ 2026-08-12 (décision Marc : focusables) — pastilles
  tabIndex 0 + Entrée/Espace = modale (même action que le clic), aria-labels DATÉS (dateLabel du
  meta), anneau de focus DESSINÉ en SVG (.event-focus-ring — l'outline CSS sur un <g> est
  invisible dans certains moteurs), ordre de Tab = ordre chronologique (ordre des données).
  Découverte : Échap ne fermait la modale de détail NULLE PART (le bouton Fermer seul) — ajouté
  (listener document + autofocus du dialog). E2E clavier réel + 4 unitaires discriminants.
- [x] **`[FUT-TOUCH-TARGETS]`** ✅ 2026-08-12 (absorbé par [FUTUR-MOBILE-LAYOUT], retour Marc
  « trop petit trop cramped ») — mobile : présets de fenêtre (« 5 ans »… « Tout », « Aujourd'hui »)
  à min-h 44px, bascules de légende à 36px (18 bascules : 44px chacune gonflait le bloc), boutons
  du pied d'infobulle déjà à 44px (sticky-footer). Desktop inchangé (sm:min-h-0). Livré avec :
  courbe mobile 55dvh (≈464px sur 844 vs 380 fixes), infobulle figée en BOTTOM SHEET pleine
  largeur avec bouton « Fermer » 44px (« Échap » n'existe pas au doigt), e2e géométrie réelle
  390×844.
- [ ] **`[A11Y-BORDER-PROMINENCE-SWEEP]`** (S, reste) — passe dédiée inputs/selects (focus:border-*),
  toggles, dropzones (border-white/10 : Transactions ×16, Investments ×8, Dashboard ×4).
- [x] **`[D6-KBD]`** ✅ 2026-08-12 — sidebar pilotable au clavier : (1) accordéon JAMAIS disabled
  (Tab SAUTE un bouton désactivé, et au moment où Tab le considère le focus n'est pas encore dans
  l'aside → sidebar repliée → bouton mort ; atteint = opérable, le focus ouvre la sidebar) ;
  (2) découverte au passage : les items d'un groupe REPLIÉ restaient TABBABLES (max-h-0 +
  overflow-hidden cache visuellement sans retirer du tab-order) → `invisible` (visibility:hidden)
  quand replié. 3 tests discriminants (4 rouges sur l'avant, dont l'ancien §B.2 qui verrouillait
  le comportement inverse).
- [ ] **`[FUTUR-PAST-EXACT]`** (M, 🧭 retour Marc 2026-08-12 17:20) — « le passé doit représenter
  EXACTEMENT le passé et je veux pouvoir voir les transactions aussi » : la partie passée de la
  courbe doit coller aux données réelles sans approximation, et l'infobulle/le détail d'un jour
  PASSÉ doit montrer les TRANSACTIONS de ce jour (elles existent dans le store — les brancher au
  point réel). Cadrer : quelles approximations restantes le gênent (ancre, flux non datés — cf.
  FUTUR-DAILY-ANCHOR-CAVEAT) ?
- [ ] **`[FUTUR-CLICK-ANYWHERE]`** (S, retour Marc 2026-08-12) — « quand je clique sur la courbe
  pour avoir l'infobulle je dois cliquer exactement sur la courbe, je veux pouvoir cliquer
  n'importe où » : le clic doit résoudre le jour par l'ABSCISSE seule (x), partout dans la zone
  du graphe (aires, vide au-dessus/en-dessous), pas seulement sur le tracé. Vérifier ce qui
  bloque aujourd'hui (zones mortes ? garde ?) et l'e2e clique-partout.
- [ ] **`[DEBT-FROM-CONTRACT]`** (M, 🧭 retour Marc 2026-08-12) — « ma dette doit être exactement
  ce que j'ai — là ça me dit que j'ai la dette depuis des années mais c'est faux, je t'ai donné
  le PDF du contrat, ça devrait être automatique » : extraire du contrat (PDF déjà fourni) la
  date de début, le principal, le taux, l'échéancier → la dette du store reflète le contrat
  RÉEL (import automatique côté app/MCP, pas de saisie manuelle approximative). Retrouver le
  PDF en question et cadrer le pipeline d'extraction.
- [ ] **`[MCP-V2-OVERHAUL]`** (L, 🧭 retour Marc 2026-08-12) — « grosse MAJ du MCP : je veux que
  tout fonctionne bien et plus de fonctionnalités » : passe complète sur les tools MCP (fiabilité,
  erreurs honnêtes, couverture) + nouvelles capacités à cadrer avec Marc (écritures étendues,
  transactions, dettes-contrats, simulations). Plan-first.
- [ ] **`[AUTH-REMEMBER-DEVICE]`** (M, retour Marc 2026-08-12) — « je veux pas qu'à chaque fois
  je doive me reconnecter, ça me le demande trop souvent pour rien : me connecter UNE fois avec
  option de se souvenir de l'appareil… à part pour changer des paramètres » : session Drive
  persistante par appareil (option « se souvenir de cet appareil »), ré-auth exigée SEULEMENT
  pour les zones sensibles (Réglages/paramètres). ⚠️ Inverse en partie la décision
  `[AUTH-DRIVE-INACTIVITY]` (déco auto 8 h, demande Marc 2026-07-22) — nouvelle préférence
  prévaut (à confirmer : garder ou retirer la déco 8 h en plus du « se souvenir »). Cadrer
  d'abord le POURQUOI des reconnexions actuelles (instrumentation `[AUTH-DRIVE-STILL-RECONNECT]`
  déjà en place — lire le journal Diagnostics avant de coder).
- [ ] **`[A11Y-SIDEBAR-ESC]`** (XS, a11y — audit #598, pré-existant) — la sidebar dépliée au
  survol/focus n'est pas fermable au clavier (Échap) → gap WCAG 1.4.13 (Dismissable). Ajouter
  un keydown Échap qui replie (blur/retour du focus au déclencheur).
- [ ] **`[IA-NAV-LABELS]`** (S) — sidebar w-16 par défaut, libellés opacity-0, icônes cryptiques →
  libellés visibles par défaut (ou rail plus large).
- [x] **`[NAV-IA-CONSOLIDATE]`** — **caduque 2026-08-12** : supersedé par `[REFONTE-NAV]`
  (vision différente de Marc : plus d'Accueil du tout, la courbe Future au centre — voir
  `docs/REFONTE_NAV_PLAN.md`). Ne pas implémenter l'ancien découpage.
- [ ] **`[REFONTE-NAV]`** (L, ⏳, GO Marc 2026-08-12) — chantier « tout tourne autour de la courbe
  Future », plan détaillé + décisions dans `docs/REFONTE_NAV_PLAN.md`. Lots :
  - [x] `[REFONTE-NAV-L1]` **Lot 1 — la nav** ✅ 2026-08-12 (PR #600) : 6 destinations
    (Futur · Configurations · Vie · Transactions · Assistant · Réglages), app s'ouvre sur Futur,
    Accueil retiré (#DASHBOARD→#FUTURE, chiffres de tête → FutureKpiStrip), barre mobile
    Futur·Transactions·Assistant·Plus. Critère : rien de perdu.
  - [ ] `[REFONTE-NAV-L2]` Lot 2 — Futur enrichi : bandeau KPI complet (variation, santé) +
    rapatriement des paramètres de projection + reste des tuiles de l'ex-Accueil (le composant
    `Dashboard.tsx` reste sur disque comme carrière à ce lot, puis sera supprimé).
  - [ ] `[REFONTE-NAV-L3]` Lot 3 — Configurations fusionnées (split immo/invest actuel vs projets,
    inclut `[DEBT-FROM-CONTRACT]`).
  - [ ] `[REFONTE-NAV-L4]` Lot 4 — Vie fusionnée (retraite, enfants, projets, voyages, événements).
  - [ ] `[REFONTE-NAV-L5]` Lot 5 — Transactions fusionnées (tx, budget, abonnements, imports).
  - [ ] `[REFONTE-NAV-L6]` Lot 6 — Assistant pleine page + outils (sous-lots par outil, voir plan).
  - [ ] `[REFONTE-NAV-L7]` Lot 7 — Réglages retravaillés en sections.
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

## 🧱 Dette technique

- [ ] **`[A11Y-CHART-HINT-HIDDEN]`** (S, a11y — audit #595) — la phrase d'aide du graphe Futur
  (« survol = jour · clic = fige · molette = zoom », `FutureProjection.tsx` ~1311) est en
  `aria-hidden="true"` : du contenu INSTRUCTIONNEL entièrement soustrait aux lecteurs d'écran,
  pas un glyphe décoratif. Idem, en plus faible, le séparateur « ou importer » de
  `PageSetupGate.tsx` ~271. Fournir l'équivalent `sr-only` (interactions clavier disponibles :
  table de données, preset « Aujourd'hui ») au lieu de tout masquer. Préexistant au sweep #595.
- [ ] **`[FUTUR-DAILY-STACK-X]`** (XS, cosmétique — FAIBLE-4 validator #594) — l'empilement
  vertical des pastilles (`subIdx` de `finalize()` dans `FutureProjection.tsx`) groupe encore par
  `monthIndex` : deux événements du même mois à des jours DIFFÉRENTS sont décalés verticalement
  alors qu'ils ne se chevauchent plus horizontalement. Empiler par abscisse arrondie (ou par
  proximité de x) plutôt que par mois. Zéro impact $, clic correct — purement visuel.
- [ ] **`[GATE-RELATED-RELIABILITY]`** (S, outillage — mesuré 2026-08-12) — `vitest related` de la
  gate ciblée n'a PAS sélectionné `tests/services/monthlyEvents.test.ts` alors que
  `services/projection/monthlyEvents.ts` était stagé (échec attrapé par la CI seule, 2×
  dans la même PR #594 avec la garde fiscale). Diagnostiquer pourquoi (chemins quotés ? CWD du
  hook ? suivi du graphe ?) et soit corriger, soit élargir la gate. En attendant : la CI
  complète reste l'arbitre (design assumé), les gardes-scan sont déjà forcées.
- [ ] **`[ENG-MC-BANDS-ORDER]`** (M, moteur, 🧭 financial-integrity d'abord) — les bandes Monte
  Carlo sortent DÉSORDONNÉES du moteur : sur 361 mois, 171 violations d'ordre et 8 mois où
  P10 > P90 (jusqu'à 36 952 $, 17,25 % du P50), toutes dans les ~60 premiers mois (mesuré
  projection-validator 2026-08-12, `probe7_mc.ts` — la ventilation quotidienne n'en crée AUCUNE :
  47,3 % au jour vs 47,4 % au mois, l'interpolation hérite). PRÉEXISTANT à #592, rendu plus
  visible depuis que les bandes se tracent partout. Diagnostiquer dans le moteur MC (tri des
  percentiles par mois ? graine ? fenêtre courte ?) — passe financial-integrity avant tout fix.

> Findings code-analyzer 2026-07-31 (preuve fichier:ligne, chacun vérifié par grep) :

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

