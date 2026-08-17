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
- [ ] **V10 — A11y** (1-2 PR) : `[A11Y-INK500]` + `[FUT-TOUCH-TARGETS]` +
  `[A11Y-BORDER-PROMINENCE-SWEEP]`. ⚠️ `[D6-KBD]` + `[A11Y-FUTUR-MILESTONES-KEYBOARD]` archivés
  (2026-08-12, PR #598, #599).
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
- [x] **`[FUT-TOUCH-TARGETS]`** ✅ 2026-08-12 (absorbé par [FUTUR-MOBILE-LAYOUT], retour Marc
  « trop petit trop cramped ») — mobile : présets de fenêtre (« 5 ans »… « Tout », « Aujourd'hui »)
  à min-h 44px, bascules de légende à 36px (18 bascules : 44px chacune gonflait le bloc), boutons
  du pied d'infobulle déjà à 44px (sticky-footer). Desktop inchangé (sm:min-h-0). Livré avec :
  courbe mobile 55dvh (≈464px sur 844 vs 380 fixes), infobulle figée en BOTTOM SHEET pleine
  largeur avec bouton « Fermer » 44px (« Échap » n'existe pas au doigt), e2e géométrie réelle
  390×844.
- [ ] **`[A11Y-BORDER-PROMINENCE-SWEEP]`** (S, reste) — passe dédiée inputs/selects (focus:border-*),
  toggles, dropzones (border-white/10 : Transactions ×16, Investments ×8, Dashboard ×4).
- [ ] **`[UI-RETIREMENT-DEAD-FRAGMENT]`** (XS, cosmétique — retour revue #604) — fragment JSX `<>…</>`
  inutile dans `components/Retirement.tsx` (lignes ~322-434) après le retrait d'un ternaire mort ;
  suppression imposte re-indenter ~110 lignes. Aucun impact fonctionnel ; `eslint` le rate
  (règle `react/jsx-no-useless-fragment` non activée). Reporté en attente d'une PR plus large
  de refactoring `Retirement.tsx` (où il se perdrait dans le bruit).
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
  le PDF du contrat, ça devrait être automatique » : extraire du contrat la date de début, le
  principal, le taux, l'échéancier → la dette du store reflète le contrat RÉEL.
  ✅ **DIAGNOSTIQUÉ le 2026-08-13** : les trois maillons cassés sont identifiés, avec emplacements
  exacts et ordre imposé — voir `[PASSE-REEL-DETTE-1/2/3]`. Ce ticket-ci reste le point d'entrée
  « demande de Marc » ; les trois sous-tickets sont le PLAN.
  ⚠️ Question de CADRAGE ouverte (posée à Marc, sans réponse à ce jour) : le passé doit-il montrer
  la dette qui S'AMORTIT (courbe décroissante depuis le solde d'origine — exige `originalBalance`
  dans le PDF) ou FIGÉE à son niveau actuel depuis sa date de début (plus simple, peut-être
  suffisant) ? La réponse change le périmètre de `-2` et `-3`.
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
- [ ] **`[TOUR-ANCHOR-INVISIBLE]`** (S, a11y — audit #600, pré-existant) — `anchorRect.ts` ne
  teste que width/height > 0, or `visibility:hidden` CONSERVE le layout : un accordéon replié
  manuellement + visite guidée relancée → le tour spotlighte un bouton invisible. Fix : le
  tour force l'ouverture du groupe du step actif, OU `anchorRect` vérifie
  `getComputedStyle(el).visibility`. Surface élargie par la nav 6 destinations (Configurations
  = 5 onglets).
- [ ] **`[AI-TAXCENTER-APPLY-NOGATE]`** (S, 🔴 découvert en corrigeant `[AI-VISION-PAYSLIP-NOGATE]`) —
  la MÊME faille subsiste sur une 2e surface : `TaxCenter.applyToProfile` (l. ~59-75) écrit le profil
  via `setConfig` direct, sans diff ni backup ni garde de vraisemblance. Le bouton « Appliquer au
  Profil Principal » donne un geste de confirmation, mais pas le filet. Aligner sur `writeExecutor`
  comme l'a été `PayslipUploadCard`.
- [ ] **`[A11Y-SIDEBAR-ESC]`** (XS, a11y — audit #598, pré-existant) — la sidebar dépliée au
  survol/focus n'est pas fermable au clavier (Échap) → gap WCAG 1.4.13 (Dismissable). Ajouter
  un keydown Échap qui replie (blur/retour du focus au déclencheur).
- [ ] **`[IA-NAV-LABELS]`** (S) — sidebar w-16 par défaut, libellés opacity-0, icônes cryptiques →
  libellés visibles par défaut (ou rail plus large).
- [x] **`[NAV-IA-CONSOLIDATE]`** — **caduque 2026-08-12** : supersedé par `[REFONTE-NAV]`
  (vision différente de Marc : plus d'Accueil du tout, la courbe Future au centre — voir
  `docs/REFONTE_NAV_PLAN.md`). Ne pas implémenter l'ancien découpage.
- [ ] **`[REFONTE-NAV]`** (L, ⏳, GO Marc 2026-08-12) — chantier « tout tourne autour de la courbe
  Future », plan détaillé + décisions dans `docs/REFONTE_NAV_PLAN.md`. ⚠️ L1-L4 ARCHIVÉS
  (2026-08-12, PR #600-#604). Lots restants :
  - [x] `[REFONTE-NAV-L5]` Lot 5 — Transactions fusionnées (tx, budget, abonnements, imports).
    **FAIT 2026-08-12 (PR à venir)** : `BudgetWorkspace` porte le h1 de page (`TAB_LABELS`,
    stable sur les 4 sous-onglets + deep-links `objectifs`/`abonnements`/`sante`), `Budget`
    rétrogradé en barre de pilotage (fin du 2e h1), cross-links poste ⇄ transactions
    (`poste:<nom>` / `category:<nom>` via `navigateWithFocus`), empty state UNIQUE desktop+mobile
    (le desktop rendait un `<table>` d'en-têtes vide), les 2 exports CSV consolidés sur
    `utils/csvExport`, et le compte « groupe(s) à classer » n'est plus gaté sur l'ouverture de
    l'assistant (il était figé à 0 = faux chiffre). → à ARCHIVER avec L1-L4 au merge.
  - [ ] `[REFONTE-NAV-L6]` Lot 6 — Assistant pleine page + outils (sous-lots par outil, voir plan).
    ⚠️ Le plan étiquetait « 6a » comme « écritures NL » ; le sous-lot réellement livré est
    « Assistant ancré sur la courbe » → sous-lots restants RENUMÉROTÉS dans
    `docs/REFONTE_NAV_PLAN.md` (écritures NL = 6b). Le parent `[REFONTE-NAV-L6]` reste OUVERT
    tant que 6b..6f ne sont pas faits.
    - [x] `[REFONTE-NAV-L6a]` 6a — Assistant ancré sur la courbe. **FAIT 2026-08-12 (PR à venir)** :
      `FutureProjection` publie son contexte d'écran (`useViewContextPublisher('future', …)`,
      patron `CHAT-PAGE-CONTEXT`) bâti par le builder pur `services/aiChat/futureViewContext.ts`
      sur la courbe AFFICHÉE (source unique `lastProjection.chartData` / gel `PROJECTION-PERSIST`,
      zéro recalcul UI) : patrimoine départ + horizon, retraite, FIRE, plus gros creux, point
      sélectionné (modal détail ou infobulle figée). `ViewContextDetail` devient une union
      discriminée par `kind` (`budget` | `future`), `SCOPE_TO_TAB.future = Tab.FUTURE`, badge du
      chat décliné par `kind`. **No-fake-data** : tout champ gardé par `Number.isFinite`, un montant
      manquant est OMIS **et NOMMÉ** dans le prompt ; aucune projection → aveu honnête sans AUCUN
      chiffre. + rangée de **chips** de questions suggérées qui PRÉ-REMPLISSENT la saisie (jamais
      d'envoi automatique), présentes seulement si une projection existe, et
      « Pourquoi ça baisse en [année] ? » seulement sur un vrai creux détecté (≥ 5 % pic→creux).
      20 tests neufs (14 builder + 6 chips). → à ARCHIVER au merge.
      **Revue 2026-08-12** (3 correctifs, même branche) : jalon FIRE du prompt rendu STRUCTUREL
      (`services/projection/fireMilestone.ts` — `FireTarget`/`NetWorth`, plus de regex sur des
      libellés qui portent du texte utilisateur) ; chips de la page Assistant gatées sur
      `revealedProjectionSig` (même geste explicite que le Futur) ; énumération vide du prompt
      remplacée par « aucun chiffre disponible ». +10 tests (5 prouvés discriminants).
    - [ ] `[FUTUR-FIRE-REGEX-SHARED]` (S) — **duplication restante du jalon FIRE**. Le prompt IA
      lit désormais le jalon STRUCTUREL (`isFireReached`, `services/projection/fireMilestone.ts`),
      mais la **pastille de la courbe** (`components/FutureProjection.tsx` ~l.440) et l'infobulle
      (`components/projection/ProjectionTooltip.tsx` l.11) choisissent encore l'icône 🔥 par
      `/\bfire\b/i` sur le libellé. Toléré (l'utilisateur VOIT la pastille et son libellé, il peut
      la démentir) mais faux positif possible sur un nom d'immeuble/d'enfant contenant « fire ».
      → faire consommer `FIRE_LIFE_EVENT` (comparaison EXACTE) ou le prédicat structurel, avec un
      test « immeuble nommé Fire pit reno → aucune pastille FIRE ». ⚠️ Vérifier l'impact bundle :
      `FutureProjection` importerait un module de `services/projection/` (leaf, types only).
    - [ ] `[REFONTE-NAV-L6b]` 6b — écritures en langage naturel (ex-« 6a » du plan initial).
    - [ ] `[REFONTE-NAV-L6c]` 6c — what-if comparés.
    - [ ] `[REFONTE-NAV-L6d]` 6d — explication du moteur.
    - [ ] `[REFONTE-NAV-L6e]` 6e — analyse de documents.
    - [ ] `[REFONTE-NAV-L6f]` 6f — assistant proactif.
  - [x] `[REFONTE-NAV-L7]` Lot 7 — **CADUQUE 2026-08-17 (décision Marc, `docs/decisions.md`)**.
    « Réglages retravaillés en sections » était **DÉJÀ LIVRÉ** : `components/Settings.tsx` est un
    orchestrateur léger de SIX sous-onglets (Profil · Comptes & soldes · Patrimoine · Clés API ·
    Sauvegarde · Système & diagnostics), délégués à `components/settings/sections/` — livré le
    2026-07-31 par la PR #549, donc AVANT la rédaction du plan, qui ne consacrait au Lot 7 qu'une
    ligne sans contenu. Classe `BACKLOG-STALE-TICKET`.
    → remplacé par le découpage de **Profil** (seul volet vivant, cf. `[UI-TABS-RICH]`).
- [x] **`[UI-TABS-RICH]`** — **LIVRÉ 2026-08-17**. Généraliser le pattern sous-onglets.
  ~~Retraite (4 outils empilés)~~ FAIT par `[REFONTE-NAV-L4]` 2026-08-12. ~~Profil (long scroll)~~
  **FAIT** : `Profile.tsx` passe de CINQ groupes empilés à QUATRE sous-onglets — Identité · Revenus ·
  Retraite & enfants · Profils enregistrés (découpage Marc, `docs/decisions.md` ; le 4e onglet est
  mon ajout, ses trois bacs ne couvraient ni Retraite ni Enfants).
  Vrai travail : **extraire** les profils enregistrés de `UsersCard` (338 l. → 233 l.) vers
  `components/profile/SavedProfilesCard.tsx` — la Card mélangeait identité des personnes et
  snapshots de config, deux sujets qui partent dans deux onglets différents.
  ⚠️ Migration UI PURE : mêmes clés `localStorage` (`saved_profiles_list`, `profile_<slug>`), même
  slug. Garde de **rétrocompatibilité** qui écrit les clés À LA MAIN, comme l'ancien code — passer
  par l'UI pour construire la fixture n'aurait prouvé que la cohérence du code avec lui-même.
  Gardes : `tests/components/Profile.subTabs.test.tsx` (exhaustivité : l'union des onglets couvre
  EXACTEMENT les 5 groupes d'avant, ensembles comparés et non cardinalités) +
  `tests/components/SavedProfilesCard.test.tsx`. Les deux prouvées discriminantes.
- [x] **`[A11Y-SUBTABS-TABPANEL]`** — **LIVRÉ 2026-08-17**. Le motif ARIA des sous-onglets était
  INCOMPLET (ni `role="tabpanel"`, ni `aria-controls`, ni `aria-labelledby`) et RECOPIÉ à la main
  dans plusieurs écrans. Correctif : un composant UNIQUE `components/ui/SubTabs.tsx`
  (`<SubTabs>` + `<TabPanel>`), qui pose le lien RÉCIPROQUE onglet↔panneau et rend le panneau
  focalisable. Réparer les copies aurait garanti qu'elles divergent : le correctif durable est de
  retirer la copie.
  ⚠️ **La garde a révélé DEUX écrans que le ticket ne listait pas** (`Settings`, `FutureProjection`) :
  le ticket en annonçait 3, il y en avait 5. Leçon déjà au dossier — resserrer le scan AVANT de
  coder, les offenders donnent le vrai périmètre. Converti : `Profile`, `Retirement`,
  `BudgetWorkspace`, `Settings` (4 écrans, style IDENTIQUE → zéro changement visuel).
  Garde : `tests/components/subTabsAria.test.tsx` — rendu (lien réciproque, focalisabilité, panneau
  actif seul, `id` préfixés) + scan de SOURCE en CLIQUET.
- [ ] **`[A11Y-SUBTABS-FUTUR]`** (M — **RE-CHIFFRÉ 2026-08-17, plus gros qu'annoncé**) —
  `FutureProjection` est le 5e écran à sous-onglets et le seul non converti à `<SubTabs>`.
  **Deux obstacles, mesurés** :
  1. **Habillage différent** (emojis au lieu d'icônes, autre fond, autres espacements) → le convertir
     tel quel changerait l'apparence de l'écran principal de Marc. Solution : une VARIANTE
     d'habillage dans `<SubTabs>`, pas un alignement forcé.
  2. ⚠️ **Obstacle STRUCTUREL, découvert en tentant la conversion** : ses 4 onglets ne sont pas
     rendus par 4 blocs mais par **SEPT blocs conditionnels dispersés** — `graph` en 3 morceaux
     (`curveRestoring`, `!curveVisible`, `curveVisible`), `plan` en 2, plus `params` et
     `historique`. Un `role="tabpanel"` par bloc produirait **plusieurs panneaux avec le même `id`
     pour un seul onglet** — un balisage ARIA invalide, donc pire que l'actuel.
     La conversion exige donc de REGROUPER 7 blocs en 4 panneaux dans un fichier de ~2 000 lignes.
  **C'est un refactor à part entière de l'écran principal**, pas un habillage : à faire dans une PR
  DÉDIÉE, avec les tests de l'écran en filet. Chiffré M, pas S.
  ⚠️ En attendant, il reste épinglé dans le CLIQUET de `tests/components/subTabsAria.test.tsx` —
  exception listée et justifiée, jamais silencieuse.
- [ ] **`[DETTE-CHART-THEME-DUP]`** (S) — tooltip/thème Recharts partagé (`CHART_TOOLTIP_STYLE`
  inexistant) — dédupliquer les styles inline des graphes.
- [ ] **`[D6-GRAPH]`** (M, résiduel) — accès clavier aux graphes restants (projections,
  investissements) ; tables sr-only faites pour les donuts Budget.

- [ ] 🔴 **`[FINTABLE-INVESTMENTS-MUET]`** (S, **demandé par Marc 2026-08-17**) — quand Plaid refuse le
  produit `investments` pour une institution (`PRODUCTS_NOT_SUPPORTED`, `ITEM_ERROR`), les positions
  n'arrivent jamais et l'app affiche un patrimoine de placements **VIDE, sans dire pourquoi**.
  ⚠️ **Vérifié** : `services/fintable/` ne traite AUCUN code d'erreur Plaid — l'erreur est remontée
  telle quelle par Fintable et l'app n'en sait rien.
  C'est la classe `SILENCE-READS-AS-BROKEN`, la 4e du même motif : Marc conclurait à un bug de
  l'app alors que la donnée n'a **jamais été fournie** par sa banque.
  **Correctif** : distinguer « aucune position » de « ce compte ne fournit pas les positions », et le
  DIRE là où les placements s'affichent. ⚠️ Ne PAS afficher 0 $ : c'est un chiffre crédible et faux.
  ⚠️ L'action de RÉPARATION est chez Fintable (reconnecter l'institution sans `investments`, ajouter
  le courtier comme source distincte) — l'app ne peut que rendre la cause visible.

## ⚡ Performance

- [ ] **`[PERF-BOOT]`** (M-L, différé SCIEMMENT — provider-aware) — paralléliser
  `hydrateAssets`/priceRefresh SANS dépasser CoinGecko free ~30/min (le sleep 2500 protège le
  provider le PLUS strict). Fix provider-aware planifié, pas un Promise.all aveugle. (≡ D7.)

## 🧱 Dette technique

- [ ] **`[MC-LABEL-FROZEN]`** (S, finding financial-integrity #601) — le libellé « Monte Carlo
  (N itér.) » lit la config LIVE (`effectiveMcIterations(config.monteCarloIterations)`) alors
  que `results` peut être GELÉ (calculé avec l'ancienne valeur) : changer les itérations sans
  relancer fait mentir le libellé sur le calcul affiché. Fix propre = porter le nombre
  d'itérations réellement exécuté DANS `MonteCarloResult` (le libellé lit le résultat, pas la
  config). Atténué en attendant par le bandeau « Paramètres modifiés ».
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

---

## Audit complet 2026-08-12 (panel de 9 agents)

> Consolidation de 8 rapports spécialisés : dette technique, fiscal, sécurité, silence, a11y,
> perf, IA, moteur. 🔴 = fuite de données / argent / problème utilisateur réel mesurable.
> Tous les findings ont une MESURE exécutée. Chaque ticket porte un lien vers le rapport audit.
> Les 5 derniers captions du moteur détaillent CHAQUE hypothèse testée et RÉFUTÉE (ne pas
> re-lever). Aucune baseline testée n'est cassée (3833/3833 verts post-audit).

### 🔴 Moteur & fiscal — altère les calculs d'argent (8 HIGH/ÉLEVÉ · 7 MED · 7 LOW/FAIBLE)  *(4 HIGH livrés : `[FISC-DON-ABATEMENT]` #611 · bloc DIVORCE #613)*

> Périmètre : projection.ts + projection/* + utils/tax.ts + services/realEstate.ts
> + services/claude.ts (Vision payslip). Tous les findings sont MESURÉS sur le vrai moteur
> (tvite run, sondes adverses). Tests discriminants posés à chaque correction.

#### HIGH — Bloque la fiabilité des chiffres

- [ ] 🔴 **`[ENG-MC-CONSERVATION-BLIND]`** (M) — toute la branche stochastique du moteur
  (divorce/décès/LTC/maladie grave/héritage/bootstrap) est **hors de portée de TOUS les invariants
  de conservation**. `calculateFutureProjection` appelle toujours `runScenario(..., false, ...)` →
  le `chartData` est toujours déterministe, et sous MC seul `{NetWorth, monthIndex}` est retourné
  (aucune ventilation d'actifs/dettes pour reconstruire le bilan). Résidu NaN potentiel NON mesuré.
  **Correctif** : assertion interne au moteur dans `runScenario`, et étendre
  `projection.fuzzConservation` à `enableMonteCarlo=true` avec tous les flags stochastiques armés.

- [x] 🔴 **`[ENG-STRESSTEST-GROWTH-UNREGISTERED]`** (S, LIVRÉ) — le krach et la reprise mutaient
  les soldes sans alimenter `growthCELI/REER/NonReg/Crypto`. Livré : deltas mémorisés au moment du
  choc puis versés APRÈS `applyMonthlyGrowth` (qui ASSIGNE — les ajouter avant les écrasait
  silencieusement). Discrimination mesurée : **162 835 $** de chute non expliquée au mois du krach
  sans le correctif.
- [x] 🔴 **`[ENG-INV-FLUXFORM-COVERAGE]`** (M, LIVRÉ partiellement — périmètre MESURÉ) —
  `tests/services/projection.fluxForm.test.ts` : `Δsolde == MarketGrowth<k> + NetTransfer<k>`, mois
  par mois. Couvre **CELI, REER, Crypto** (résiduel mesuré 0,01 $ = l'arrondi au cent, avec ET sans
  stress-test). La garde a révélé DEUX producteurs muets de plus, dont un corrigé dans le même lot
  (transfert NonReg → CELI/REER, ci-dessous) ; le dernier est ticketé juste après.
- [x] **`[ENG-NONREG-TRANSFER-UNPUBLISHED]`** (S, LIVRÉ — découvert PAR la garde) — le bloc
  « Transfert NonReg → CELI/REER si espace » vendait du non-enregistré pour remplir les droits sans
  publier `withdrawalNonReg` / `contribCELI` / `contribREER`. **Mesuré : 51 197 $ de variation de
  NonReg inexpliquée en un mois**, sur un scénario ORDINAIRE (stress-test désactivé).
  ⚠️ `accRrspYear` était DÉJÀ alimenté : le suivi FISCAL était juste, seul l'affichage des flux
  mentait — c'est ce qui rendait le défaut invisible côté impôt. Effet de `contribREER` sur le
  registre per-conjoint : **MESURÉ NUL** (`reerByUserFinal` bit-identique sur 3 stratégies à
  salaires très inégaux — `stepReerByUser` réconcilie déjà sur `poolEnd`).
- [ ] 🔴 **`[ENG-APRIL-REFUND-NONREG-UNPUBLISHED]`** (S) — dernier producteur muet trouvé par la
  garde de forme-flux : `processAprilSettlement` verse le remboursement d'impôt au non-enregistré
  (`addNonReg`, `projection.ts:987`) sans publier `contribNonReg`. **Mesuré : 29 796,22 $ au mois
  123 (un AVRIL), stress-test désactivé.** Non corrigé dans le lot : ce mutateur s'exécute AVANT
  `cashflowAllocation`, qui reçoit `contribNonReg` en ENTRÉE — y toucher peut déplacer une décision
  d'allocation dans le même mois et demande sa propre mesure. **Correctif** : publier le flux, puis
  AJOUTER `'NonReg'` à `ACCOUNTS` dans `projection.fluxForm.test.ts` (la garde est prête).

- [ ] 🔴 **`[ENG-LIQUIDDEBT-NEVER-REPAID]`** (M) — `liquidDebt` ne fait que croître : jamais
  remboursé (même avec millions en liquide), **jamais porteur d'intérêt**. **Mesuré : retraité
  insolvable, héritage de 1,5 M$, liquidDebt gelé 559 k$ pendant 180 mois à côté de 1,65 M$ de
  liquidités oisives.** À taux découvert 10-20 %, omission 56-112 k$/an ≈ 0,8-1,7 M$ sur 15 ans.
  **Correctif** : traiter comme vraie dette — (a) intérêt mensuel paramétrable, (b) remboursement
  prioritaire dès qu'un surplus existe, (c) exposer dans le plan d'action.

- [ ] 🔴 **`[ENG-W5-RENTAL-OFFBALANCE]`** (M) — un immeuble locatif n'existe **PAS au bilan** :
  ni sa valeur, ni hypothèque, ni service de dette. Seul le NOI n'afflue revenus. **Mesure exacte :
  300 k$ d'équité + 500 k$ de prêt introuvables.** L'invariant du fuzz reste vert (tout absent du
  chartData). Pire : le service non modélisé vaut ≈2,9 k$/mois sur le prêt → ≈700 k$ de coût omis
  sur l'horizon. **Correctif** : brancher `currentValue` dans `realEstateEquity` et `mortgageBalance`
  dans soldes de dette, servir hypothèque mensuellement (le module `realEstateMonth` le fait déjà
  pour les buts immo).

- [x] 🔴 **`[AI-CATEGORIZE-NO-BACKOFF]`** (M, LIVRÉ) — `categorizeBatch` chunkait 50 tx sans
  retry/backoff/pacing. Livré : backoff exponentiel borné (1/2/4 s, cap 60 s) **+** `Retry-After`
  honoré (secondes ET date HTTP) **+** pacing 1 s inter-chunks **+** court-circuit sur 401/403 (une
  clé refusée ne redevient pas valide au chunk suivant) **+** logs AGRÉGÉS portant l'erreur brute.
  `sleep` injectable → 15 tests qui ne dorment jamais.

#### MOYEN

- [ ] **`[ENG-W5-BUSINESS-OFFBALANCE]`** (M) — `PrivateBusiness.estimatedValue` et `retainedEarnings`
  n'entrent ni patrimoine mensuel ni succession ; seul `annualDividend` circule. **Mesure : 2 M$
  d'entreprise + 400 k$ RBN absents du NW** (300 k$ d'écart mesuré = uniquement dividendes
  capitalisés). **Correctif** : ajouter `privateBusinessValue` à `NetWorthParts` (le Record
  exhaustif force le compilateur, la garde existe déjà) et traiter dans `computeLatentTax`.

- [ ] **`[ENG-INV-FLUXFORM-COVERAGE]`** (S) — forme-FLUX n'est assertée que sur socle salarié nu ;
  c'est le SEUL invariant capable d'attraper #2 (stress-test silencieux) et il ne tourne jamais sur
  scénarios qui en ont besoin. `fuzzConservation` documente explicitement l'abandon de la
  forme-flux. **Correctif** : porter le détecteur résiduel dans la suite (seuil 1 k$, exclusion
  événement journalisé) sur scénarios one-time. Test discriminant garanti : échoue aujourd'hui sur
  `stressTestEnabled`.

- [ ] **`[FISC-UI-MARGINAL-ABATEMENT]`** (S) — « Combiné marginal » de l'UI ≠ taux marginal du moteur.
  `TaxBracketViz.tsx` somme brute (fedRate + qcRate) ignore abattement 16,5 %, alors que
  `getMarginalRate` le fait. Re-code aussi ses propres paliers au lieu de consommer
  `calculateDetailedTax`. **Mesuré : 100 k$ brut → moteur 36,12 % vs affichage 39,50 % (3,38 pts,
  survend le REER).** **Correctif** : `combinedMarginal = getMarginalRate(...) * 100` + consommer
  `calculateDetailedTax` pour les barres.

- [ ] **`[FISC-RAMQ-COUPLE-CAP]`** (S) — couple ne peut jamais atteindre prime RAMQ max 766 $ (tranche
  2 bornée 9 600 $ → 744 $ max possible). **Mesuré : célibataire 766 $, couple 744 $ constant.**
  Impact −22 $/adulte/an = ~1 300 $ / 30 ans retraite. Incohérence interne doc (prime max vs tranche
  2 qui s'excluent). **Correctif** : re-sourcer Annexe K 2026 réelle (Revenu Québec / RAMQ / CFFP) et
  corriger la valeur fautive EN CODE ET EN DOC. Ne rien ajuster sans source.

- [ ] **`[SCHL-1500K-BOUNDARY]`** (S) — au prix EXACT 1,5 M$, mise de fonds minimale celle du palier
  assuré (non celle non-assuré). **Mesuré : 1,5 M$ → 125 k$ (8,33 %) ; 1,6 M$ → 320 k$ (20 %)** ;
  écart au point bascule −175 k$ mise de fonds exigée. Le code écrit `<=` au lieu de `<`. **Correctif** :
  `price < SCHL_PRICE_THRESHOLD_TIER2` (3 sites) + test de bornes 1 499 999 / 1 500 000 / 1 500 001.

#### LOW / FAIBLE

- [ ] **`[FISC-PAYROLL-NEG-GROSS]`** (S) — cotisations RQAP/AE non-clamped sur brut négatif (RRQ l'est).
  **Mesuré : brut −5 000 $ → deductionsSource −86,50 $ (net > brut : argent créé).** Impact nul
  aujourd'hui (filtres en amont), mais garde ASYMÉTRIQUE. **Correctif** : `Math.max(0, ...)` sur
  RQAP/AE aussi (rétrocompat bit-identique pour brut ≥ 0).

- [ ] **`[STORAGE-PERSIST-REQUEST]`** (XS, découvert en diagnostiquant `[FINTABLE-TOKEN-WIPE]`) —
  l'app ne demande **JAMAIS** `navigator.storage.persist()` (0 occurrence dans le dépôt). Le coffre
  chiffré repose sur IndexedDB (clé AES) + localStorage (blob) : sans persistance accordée, le
  navigateur classe le stockage « best-effort » et peut l'évincer sous pression disque — perte des
  clés API ET de la courbe verrouillée. Ce n'était PAS la cause du bug de Marc (c'était la synchro
  Drive), donc non corrigé au passage. **Correctif** : demander la persistance au boot, une fois,
  et exposer l'état dans SystemView (`navigator.storage.persisted()`) pour que ce soit
  diagnosticable. Chrome l'accorde selon l'engagement / l'installation PWA.

- [ ] **`[FISC-DON-FEDRATE-DUP]`** (XS, relevé par le panel de la PR #611) — le taux du 1er palier des
  dons (`DONATION_CREDIT_RATES.fed.first = 0.15`, `utils/donationCredit.ts`) et
  `FED_NONREFUNDABLE_RATE = 0.15` (`utils/tax.ts`) sont **juridiquement la MÊME valeur** (le
  « pourcentage approprié » = taux du palier le plus bas) mais vivent en DEUX copies. Or ce 0,15 est
  déjà signalé en tête de FISCAL_REFERENCE comme **la seule valeur du doc sans source primaire**, dans
  un contexte C-4 où le plus bas palier descend à 14,5 %/14 %. Impact borné (~1,67 $/an par point de
  taux, le palier étant plafonné à 200 $) mais les deux copies dériveront à la prochaine MAJ.
  **Correctif** : re-sourcer ARC d'abord, PUIS importer la constante unique — ou documenter en §10
  pourquoi elles sont volontairement découplées. Ne rien changer sans la source.

- [ ] **`[FISC-GUARD-SCOPE]`** (S) — le ratchet de constantes scanne 8 modules, MANQUENT
  `donationCredit.ts` (où vivent les findings #2), `realEstate.ts` (SCHL/mutations/TPS-TVQ),
  `childrenReee.ts` (SCEE/IQEE), et 3 autres. **Correctif** : étendre `FISCAL_MODULES` AVANT de
  corriger quoi que ce soit (leçon « resserrer le scan AVANT le fix »).

- [ ] **`[FMT-MONEY-BYPASS]`** (S) — montants rendus sans `formatCAD` (9 sites en grep).
  Aucun n'est faux au cent près — dérive de présentation. Classe comptabilisée dans
  `[FMT-TOLOCALESTRING-MONEY]` (HIGH, part d'un seul ticket).

- [ ] **`[DEAD-PROP-GROSSINCOME]`** (S) — `Retirement.tsx` reçoit prop `grossIncome` = somme des
  salaires MENSUELS (sans ×12). Jamais consommée, donc aucun bug visible. Premier consommateur
  héritera d'un facteur ×12 dormant. **Correctif** : supprimer la prop.

- [ ] **`[ENG-TTP-NEGATIF]`** (S) — `totalTaxesPaid` ressort NÉGATIF pour salarié (compte seulement
  débits du liquide, retenues à la source n'y transitent pas → seuls remboursements nets). Cohérent
  avec contrat documenté, mais libellé à risque si l'UI affiche « Impôt à vie ». Jugement quantitatif
  à financial-integrity.

- [x] **`[ENG-DIVORCE-ROOM-DOUBLE]`** (S) — REMPLACÉ par `[ENG-DIVORCE-ROOM-COUPLE]` ci-dessous :
  l'hypothèse est désormais MESURÉE, avec les montants. Ne pas traiter deux fois.

#### Divorce — reliquat MESURÉ par le panel de re-revue (PR #616)

> Les deux blocages ÉLEVÉ (SRG et cible du meltdown) sont CORRIGÉS dans #616. Ce qui suit a été
> mesuré par le même panel et laissé DÉLIBÉRÉMENT hors du lot : ce sont des surfaces voisines, pas
> le mécanisme du divorce lui-même. ⚠️ Leur point commun est le motif d'échec de #613 — « le même
> défaut, laissé dans la fonction sœur ».
>
> ⚠️ **Les 8 items LIVRÉS de cette sous-section sont partis dans `docs/BACKLOG_ARCHIVE.md`**
> (2026-08-14, PR #626) — `ROOM-COUPLE`, `ESTATE-PENSION`, `LATENTTAX`, `TAXDEBT-UNSPLIT`,
> `SPLITPCT-UNBOUNDED`, `MC-OBSERVABILITY`, `NO-CONSERVATION-GUARD`, `DISPLAY-RATES`.
> Ne reste ici que ce qui est encore à faire.

- [x] 🔴 **`[ENG-DIVORCE-CHILDREN-REEE]`** — **LIVRÉ 2026-08-17** (décisions Marc, `docs/decisions.md` :
  garde 50/50 + cotisations REEE suivant `keep`).
  ⚠️ **Le raccourci était FAUX, et c'est le cœur du ticket** : `liquidDelta` transportait les DEUX
  familles mélangées — coûts d'enfants (naissance l.162, voiture l.294) ET flux REEE (cotisation
  l.273, décaissement l.328). Un `liquidDelta * 0.5` aurait divisé par deux les cotisations REEE :
  un faux SILENCIEUX. Motif « un flux alimente PLUSIEURS registres » (meltdown REER).
  **Correctif** : ventilation À LA SOURCE — `ChildTickResult.liquidDeltaCosts` / `liquidDeltaReee`,
  avec l'invariant `costs + reee === liquidDelta` sous test. Le site d'appel applique la garde à la
  SEULE famille des coûts ; le REEE garde son partage patrimonial déjà appliqué au solde.
  Suivent la garde : `monthlyExpenseDelta`, `childGrossCostAdd`, `childBenefitsAdd`.
  ⚠️ `childCustodyShare = 1` hors divorce ⇒ rétrocompat BIT-IDENTIQUE par construction.
  Garde : `tests/services/childrenGardePartagee.test.ts` — partition sur 3 moments distincts +
  appartenance de chaque flux à sa famille, prouvée discriminante en classant la cotisation REEE
  dans les coûts (l'erreur RÉELLE que la garde doit attraper).
- [ ] **`[SEC-AUDIT-DEP-FASTURI]`** (S) — GHSA-7p8r-x3mc-p8w7 (confusion d'hôte) dans `fast-uri`
  (transitif ajv → @modelcontextprotocol/sdk), CVSS 7.5. Exploitabilité non confirmée dans le code
  actuel (aucun champ `format: uri` exposé dans MCP tools). **Correctif** : `npm audit fix`
  (bump vers `fast-uri >=3.1.5`), re-vérifier tests + MCP dev après.

- [ ] **`[SEC-AUDIT-SYNC-LEGACY-CLEARTEXT]`** (S) — chemin rétrocompatibilité pour blobs Drive
  pré-chiffrement (2026-05-29) : clés API peuvent rester en clair jusqu'au prochain push (qui les
  rechiffre). Fenêtre résiduelle théorique pour comptes abandonnés. **Correctif optionnel (low
  priority)** : au pull, si `drive.apiKeys` détecté, forcer `pushNow()` immédiat pour rechiffrer.

### 🔴 Échecs silencieux — 3 MED/LOW  *(le HIGH `[SILENT-ACTIONPLAN-NAN]` est livré par #608)*

> Pattern : traiter un champ présent-mais-non-fini comme absent, SANS log ni signal à l'utilisateur.
> Référence : `services/finance.ts` (parseRate, patron parfait), `services/marketData/*` (appliqué),
> `services/claude.ts` (safeJsonValidate loggue sys, rejets massifs tracés).

- [ ] **`[SILENT-STOCKFORM-PRICEHINT]`** (S) — `AddStockForm.suggestHistoryPrice()` échoue en silence
  (réseau/provider) : catch sans `logError` ni `setNotice` (contrairement à `validateSymbol` du même
  fichier). L'utilisateur voit spinner s'arrêter, prix vide, aucune explication. **Correctif** :
  `logError + setNotice` sur le modèle de validateSymbol.

- [ ] **`[SILENT-PWA-PROMPT]`** (S) — `usePwaInstallPrompt` échoue de `deferredEvent.prompt()`
  sans `logError`. Impact faible (perte invite installation PWA seulement, pas donnée financière).
  Signalé pour cohérence règle projet. **Correctif** : `logError(..., severity: 'info', ...)`.

- [ ] **`[SILENT-HEALTHWEIGHTS-FIELD]`** (S) — `healthWeights` parse un JSON et coerce champ invalide
  (présent-mais-non-fini) à son défaut sans trace. Impact faible (pondération UI, pas argent).
  **Correctif optionnel** : détection `présent && !fini` avec `logError` agrégé par champ.

### 🔴 A11y — 1 HIGH restant, 3 MED, 1 LOW  *(4 HIGH « Mode Discret » livrés par #608 → archive)*

> Les 4 fuites de Mode Discret de l'audit sont CORRIGÉES (#608), ainsi qu'une 5e trouvée à la revue
> (axes et infobulles de graphiques, `[A11Y-PRIVACY-CHART-FORMATTER]`). Garde de non-régression :
> `tests/components/chartPrivacyScan.test.ts`.

- [ ] 🔴 **`[A11Y-MODAL-GUIDE-NODIALOG]`** (S) — `GuideModal` : aucune sémantique de dialogue
  (`role="dialog"` absente), pas de focus initial/piège Tab/restauration focus/Escape. Atteignable au
  clavier (palette Cmd+K). **Correctif** : migrer vers primitive `<Modal>` existante (doc affirme
  faussement que c'est déjà fait — leçon `DOC-STALE-IMPOSSIBILITY`).

- [ ] **`[A11Y-ROUTE-FOCUS]`** (M) — changement onglet/route : aucun focus déplacé, aucune annonce SR.
  Un utilisateur SR qui clique nav n'a aucune indication que le contenu a changé. **Correctif** :
  appeler `document.getElementById('main')?.focus()` au changement `activeTab` ; pour deep-link
  `usePendingFocus`, ajouter `el.focus({preventScroll})` après `scrollIntoView`.

### 🔴 `[PASSE-REEL-DETTE]` — le passé montre la dette actuelle depuis TOUJOURS (Marc, signalé 2×)

> ⚠️ **Ces trois sous-tickets SONT le plan de `[DEBT-FROM-CONTRACT]`** (retour Marc 2026-08-12,
> plus haut dans ce fichier) — pas un doublon. Je les avais d'abord écrits sans voir que le ticket
> d'origine existait : classe `PM-DUPLICATE-TICKET`, corrigée en les RELIANT plutôt qu'en supprimant
> l'un des deux (le ticket d'origine porte la DEMANDE et sa date, ceux-ci portent le PLAN).
>
> Marc : « je veux que ma dette soit exactement ce que j'ai — là ça me dit que j'ai la dette depuis
> des années mais c'est faux ; je t'ai donné le pdf du contrat, ça devrait être automatique ».
> **Constat VÉRIFIÉ dans le code le 2026-08-13** — le symptôme est réel, et il a DEUX causes
> indépendantes. Même famille que `[PASSE-REEL-1]` : le passé affiche quelque chose de faux.

- [ ] 🔴 **`[PASSE-REEL-DETTE-1]`** (M) — **le passé soustrait la dette d'AUJOURD'HUI à CHAQUE point
  passé.** `FutureProjection.tsx` (~l. 395) lit `chartData[0].DettesNonImmo` et le passe à
  `buildPastPrefix`, qui l'applique à TOUS les mois (`pastNetWorthAt(..., currentDebtNonImmo)`).
  Le code le DOCUMENTE comme une approximation : « dette supposée constante dans le passé, faute
  d'historique d'amortissement ». Conséquence exacte : une dette contractée il y a 6 mois ampute le
  patrimoine d'il y a 5 ans. **Correctif** : ne soustraire une dette qu'à partir de sa date de
  début — donc `buildPastPrefix` doit recevoir les DETTES DATÉES, pas un total agrégé.
  ⚠️ Ne remet PAS en cause la décision « Option A » (raccord exact au présent, `docs/decisions.md`) :
  la dette existe AUJOURD'HUI, le raccord au présent reste exact ; seul le passé change.
- [ ] 🔴 **`[PASSE-REEL-DETTE-2]`** (S) — **la donnée nécessaire N'EXISTE PAS.** `Debt` (`types.ts`
  l. 570) n'a NI date de début NI solde d'origine — seulement `amortizationYears` et `termEndDate`.
  Sans date de début, `[PASSE-REEL-DETTE-1]` est INAPPLICABLE. **Correctif** : `startDate?: string`
  (champ ADDITIF optionnel ⇒ aucun bump de version, aucune migration — cf. `CLAUDE.md`), plus
  `originalBalance?: number` pour amortir le passé au lieu de le figer.
- [ ] 🔴 **`[PASSE-REEL-DETTE-3]`** (S) — **l'import du PDF ne capte pas ces champs non plus.**
  `DebtPayload` (`mcp/ingest/applyDocument.ts` l. 80) porte `balance`, `interestRate`,
  `minimumPayment`, `category`, `amortizationYears`, `rateProvider` — **pas la date du contrat**.
  C'est ce qui rend le « ça devrait être automatique » de Marc impossible EN L'ÉTAT : le PDF a
  l'information, le schéma d'ingestion la jette. **Correctif** : ajouter les deux champs au payload
  et au prompt d'extraction, une fois `-2` livré.

**Ordre imposé** : `-2` (donnée) → `-1` (passé) → `-3` (ingestion). Faire `-1` d'abord serait un
stub : il n'aurait aucune date à lire.

### 🔴 `[PASSE-REEL]` — le passé affichait la PROJECTION (signalé par Marc 2026-08-13)

> Marc : « mon passé ne semble pas correspondre à mon passé réel mais au futur qui était estimé.
> Je n'ai pas de compte CELI et pourtant mon passé me dit que j'ai de l'argent dedans. »
> Cause : `services/projection/dailyCurve.ts` — `if (!real) return { ...d }` où `d` est le point
> PROJETÉ. ⚠️ L'en-tête du MÊME fichier énonçait pourtant la règle inverse.

- [x] 🔴 **`[PASSE-REEL-1]`** (M, LIVRÉ PR #614) — le passé ne montre QUE du mesuré.
  **DÉCISION MARC** : pas de repli, pas de trait plat — la courbe commence où les données
  commencent. Livré : paramètre `todayIso`, retour `ProjectionChartPoint | null`, borne stricte
  (aujourd'hui reste projeté). Le changement de type a fait trouver l'infobulle par le compilateur.
- [x] 🔴 **`[PASSE-REEL-2]`** (M, LIVRÉ PR #617) — indicateur « mon passé colle-t-il à ce qui était prévu ».
  **DÉCISION MARC** : comparer à une prévision **FIGÉE que Marc verrouille** (`lockedProjectionStore`
  / `PROJECTION-PERSIST` existent déjà). ⚠️ Surtout PAS à une prévision recalculée aujourd'hui :
  elle intègre déjà le passé, l'écart serait nul par construction et l'indicateur dirait toujours
  « tout va bien ». Revue Vercel avant merge : la garde « point réel » filtrait sur `dayIso` (que le
  spread `{ ...d }` charrie sur les jours FUTURS) au lieu du marqueur `dayIsReal` → corrigé + 2 tests
  discriminants (leçon `MARKER-PROXY-GUARD`, `docs/CONVENTIONS.md`).
- [x] 🔴 **`[PASSE-REEL-3]`** (L) — **CADUC : déjà en place, VÉRIFIÉ dans le code le 2026-08-13.**
  La prémisse du ticket (« les soldes sont saisis une fois à la main ») est FAUSSE. Preuves, dans
  l'ordre de la chaîne :
  1. `hooks/useSimulationParams.ts:123` — `liveCSVBalances = deriveStartingBalancesFromHistory(pastHistory.points)` ;
  2. `services/history/startingBalancesFromHistory.ts:45` — `const last = points[points.length - 1]` :
     le futur démarre sur le **dernier point réel**, donc les soldes d'aujourd'hui ;
  3. `components/ProjectionEngine.tsx:58-85` — `useEffect([params, …])` : dès que ces soldes
     changent, la projection est **recalculée automatiquement** (debounce 300 ms) et republiée dans
     `lastProjection`. Aucun bouton, conformément à la décision de Marc ;
  4. `[FUTUR-DAILY-ROLLOVER]` (livré 2026-08-12, `useSimulationParams.ts:52-64`) — la frontière du
     JOUR avance toute seule (tick horaire + retour d'onglet), app laissée ouverte comprise ;
  5. Garde déjà en place : `tests/services/futureSeedContinuity.test.ts` (branchée sur la VRAIE
     reconstruction, pas sur une réplique) + `tests/hooks/useSimulationParams.dailyRefresh.test.tsx`.
  Seul résidu, et il est **correct par construction** : l'ancre `startYear/startMonth` a une
  granularité MOIS, parce que le moteur est mensuel. Les SOLDES, eux, sont ceux du jour.
  ⚠️ Classe `BACKLOG-STALE-TICKET` : ce ticket a été rédigé le même jour, à partir du symptôme
  signalé par Marc, sans greper le moteur — le vrai défaut était `[PASSE-REEL-1]` (le passé
  affichait la prévision), et il masquait le fait que l'amorçage du futur, lui, était déjà bon.

### 🔴 `[PASSE-REEL-JOUR]` — la courbe passée au jour (bug + demande de Marc, 2026-08-14)

- [x] 🔴 **`[PASSE-REEL-CAP-400J]`** — livré 2026-08-14. Plafond de 400 j qui coupait la courbe de
  Marc au 2026-01-10 (sa date, au jour près). Boucle passée en curseur (1 993 ms → 37 ms, 54×) AVANT
  de relever le plafond à 4 000 j — relever seul aurait échangé un trou muet contre un gel de 2 s.
  `truncatedFrom` rend la troncature constatable. Garde : `tests/services/pastCap400Days.test.ts`.
- [x] 🔴 **`[PASSE-REEL-TXN-DU-JOUR]`** — livré 2026-08-14. Toutes les transactions du jour dans
  `FutureDetailModal` (le panneau existant, cadrage de Marc) : marchand, compte, catégorie, montant,
  + le net du jour. **Doublons et virements internes AFFICHÉS mais barrés**, avec leur raison — les
  masquer donnerait une liste qui ne colle pas au relevé bancaire, les compter donnerait un total
  qui ne colle pas à la courbe. Filtrage **à la demande** (`services/history/dayTransactions.ts`),
  PAS de Map pré-construite : le registre couvre ~4 000 jours, les pré-indexer garderait tout en
  mémoire pour n'en afficher qu'un. Mode discret conforme dès la naissance de la surface.
  **Détail par ligne** (demande de suivi de Marc, « et plus de détail ») : compte, statut anormal,
  conjoint attribué, origine de la catégorie (IA + confiance, ou vérifiée), catégorie d'avant si
  changée. Rien de déduit — un champ absent ne produit aucune pastille.
  Gardes : `tests/services/dayTransactions.test.ts` + `tests/components/FutureDetailModal.transactions.test.tsx`.
- [x] 🔴 **`[PASSE-REEL-TXN-JOUR-VIDE]`** — livré 2026-08-14. **Signalé par Marc (« marche toujours
  pas »), en mode « courbe au jour », sur des points du PASSÉ.** Une journée identifiée SANS
  transaction ne rendait RIEN : « aucun mouvement ce jour-là » et « c'est cassé » étaient
  indistinguables à l'écran, et c'est la seconde lecture qui s'impose. J'avais appliqué la règle
  no-fake-data au mauvais cas — elle interdit d'INVENTER une donnée absente, pas d'ÉNONCER un zéro
  MESURÉ. Le silence n'est honnête que là où la question n'a pas de sens (point mensuel ou futur,
  toujours sans section). Garde discriminante : 2 tests ÉCHOUENT sur le code d'avant, plus une
  assertion anti-sur-correctif (l'état vide ne doit pas s'afficher quand il y a des mouvements —
  sans elle, on pourrait rendre le message en permanence et rester vert).
- [x] **`[PASSE-REEL-IMPOT-LATENT-DEBUT]`** — **LIVRÉ 2026-08-17**. Marc : « je vois impôt latent
  commencer le 1/09 mais jsp pourquoi ». **Cause CONFIRMÉE par mesure** : `ImpotLatent` n'est émis
  NULLE PART dans le passé reconstruit (0 occurrence dans `dailyPastLedger.ts` et
  `buildPastPrefix.ts`) — le passé ne porte que soldes, flux et patrimoine net. Reconstruire un
  impôt latent exigerait l'historique des PRIX DE REVIENT, que l'app n'a pas.
  ⚠️ **Le calcul est JUSTE ; c'est le SILENCE qui était le défaut** — une courbe qui surgit à une
  date arbitraire se lit comme un bug. Classe `SILENCE-READS-AS-BROKEN`, la troisième de la semaine.
  Correctif : une phrase dans le bandeau « Courbe au jour », GATÉE sur la visibilité de la série
  (sinon bruit permanent). ⚠️ On n'invente PAS un impôt latent passé — no-fake-data.
  Garde : `tests/services/impotLatentPasse.test.ts`, qui verrouille le FAIT et non la phrase : si le
  passé se met un jour à émettre `ImpotLatent`, le test ÉCHOUE — l'explication affichée deviendrait
  fausse et devrait être retirée en même temps. Sans ça, l'app continuerait d'affirmer une
  limitation qui n'existe plus.
- [ ] 🔴 **`[PASSE-REEL-RACCORD-CHUTE]`** (S — **CAUSE ÉTABLIE PAR MESURE 2026-08-17**) — Marc :
  « je vois une chute de 10k aujourd'hui jsp pourquoi ». Ses données étant locales, j'ai mesuré le
  MÉCANISME sur des données construites : `tests/services/raccordChute.test.ts` (6 tests).
  **`reconstructCashHistoryDaily` remonte le temps À PARTIR du solde d'aujourd'hui en DÉFAISANT les
  flux jour par jour, et s'arrête à la VEILLE** (aujourd'hui n'est pas reconstruit — le présent
  vient de l'ancre du moteur). Donc `veille = solde_aujourd'hui − flux_du_jour` : le dernier point
  du passé ANNULE les mouvements du jour, et la marche veille→aujourd'hui vaut EXACTEMENT le flux
  net d'aujourd'hui. Une sortie de 10 000 $ datée d'aujourd'hui (hypothèque, gros transfert,
  facture) produit une chute de 10 000 $ — et elle revient à chaque échéance.
  ⚠️ **PAS un bug de calcul** : l'argent est réellement sorti, les deux points sont justes. C'est un
  défaut d'EXPLICATION — rien ne dit que la veille est un solde RECONSTRUIT qui a volontairement
  défait la journée en cours. Même classe que `SILENCE-READS-AS-BROKEN` : le chiffre est juste, sa
  lecture est fausse. Gardes discriminantes : sans mouvement du jour → aucune marche ; une ENTRÉE
  produit la marche inverse ; un virement interne n'en produit aucune.
  **Correctif à faire** : DIRE la marche (infobulle du jour ou mention au raccord).
  ⚠️ Ne JAMAIS la lisser — ce serait fabriquer un solde que Marc n'a jamais eu.
  ⚠️ **Seconde cause POSSIBLE et DISTINCTE**, non confirmée chez lui : `undatedTotal` /
  `flowsAfterNowDate` décalent tout le NIVEAU passé au lieu de créer une marche d'un jour. Le
  bandeau les affiche déjà ; s'ils sont nuls chez Marc, cette piste est réfutée.
- [x] 🔴 **`[PASSE-REEL-VARIATION-DU-JOUR]`** — **LIVRÉ 2026-08-17** (demande Marc 2026-08-14 :
  « je veux voir la variabilité d'argent pour la journée, tout compris mais détaillé »).
  Le panneau montrait le NET ENCAISSÉ, qui n'est pas la variation du patrimoine : un jour de hausse
  boursière affichait 0 $ pendant que la courbe montait.
  ⚠️ **RIEN de recalculé** : `services/history/dayVariation.ts` ne fait que COMBINER ce que
  `DailyPastRow` émettait déjà. Les deux pièges annoncés au ticket sont traités et sous test —
  le **dépôt** s'annule dans le total (sinon compté deux fois) mais reste montré à part ; le
  **palier immobilier** est dit comme tel, jamais lissé.
  ⚠️ **Le RÉSIDUEL est AFFICHÉ** (« Non expliqué », ambre), jamais absorbé par un poste fourre-tout —
  c'était le critère de fini posé d'avance : un fourre-tout fermerait le total par construction et
  rendrait la vérification circulaire.
  Section repliable FERMÉE (choix Marc) + les deux contraintes qui rendent ce choix tenable :
  **état persisté** (sinon « repliable » = « toujours fermée ») et **titre autonome portant le
  montant** (la valeur est lisible sans déplier).
  `addDay` EXPORTÉ de `reconstructCashHistory` plutôt que dupliqué (pas de copie locale de formule).
  Gardes : `tests/services/dayVariation.test.ts` (11) + `tests/components/FutureDetailModal.variation.test.tsx`
  (9), les deux volets prouvés discriminants, avec assertion anti-sur-correctif sur le résiduel.

### 🔴 `[A11Y-PRIVACY-LOT2]` — le mode discret ne couvre PAS encore les formulaires (balayage exhaustif 2026-08-13)

> Balayage complet des 133 composants après la PR #608 (3 tours de revue). Les écrans de LECTURE
> visés par #608 sont couverts et gardés par test. Le trou restant est d'une autre nature : **#608 a
> traité l'affichage, jamais la SAISIE**. Les formulaires natifs de Réglages/Profil affichent les
> données les plus sensibles de l'app — salaire des deux conjoints, soldes réels par compte,
> assurances, immeubles locatifs, société — en `<input type="number" value={…}>` non masqué, quel que
> soit le mode. La primitive existe déjà (`PrivateNumberInput`, utilisée par `AssetLocationCard`).
> ⚠️ Rappel de méthode (leçon #608) : un test de fuite doit être prouvé DISCRIMINANT, et un canal de
> fuite peut être un ATTRIBUT (`title`, `aria-label`) ou la STRUCTURE (nombre de lignes rendues).
>
> ⚠️ **Prérequis LEVÉ par `[A11Y-PRIVACY-SALAIRE]`** (2026-08-14) : la primitive volait le NOM
> ACCESSIBLE du champ qu'elle masquait (`aria-label` en dur, prioritaire sur `<label htmlFor>` ET
> sur l'`aria-label` du champ). Tous les champs masqués d'un formulaire annonçaient donc le même
> nom. Corrigé DANS la primitive : les tickets suivants de ce lot en héritent, il n'y a rien à
> refaire par écran. Voir `A11Y-MASK-STEALS-NAME` dans `docs/CONVENTIONS.md`.

- [ ] **`[A11Y-PRIVACY-TITLE-CLOBBER]`** (XS, relevé par le panel a11y de #629) —
  `components/ui/PrivateNumberInput.tsx` écrase en dur le `title` de l'appelant par
  « Montant masqué » en mode discret. Aucun appelant n'en dépend aujourd'hui pour son NOM (vérifié
  call site par call site), donc non bloquant — mais un appelant qui compterait sur son `title`
  pour porter une info la perdrait SANS avertissement. Deux pistes : composer les deux `title`, ou
  passer l'état masqué en `aria-describedby` vers un `sr-only` dédié. ⚠️ La seconde piste corrige
  AUSSI une faiblesse mesurée par le panel : le tooltip `title` ne s'affiche qu'au SURVOL souris
  dans Chrome/Edge — un utilisateur voyant naviguant au CLAVIER n'a aucun indice visuel de
  « cliquer pour modifier ». Traiter les deux ensemble, pas séparément.
- [ ] **`[A11Y-LABELS-PARAMS-AVANCES]`** (S, découvert en livrant le ticket ci-dessus) — les **26
  champs NON monétaires** de `components/AdvancedProjectionParams.tsx` n'ont toujours AUCUNE
  association `<label>`↔champ : ni `htmlFor`/`id`, ni enveloppement. Leur nom accessible est donc
  VIDE (WCAG 4.1.2). Défaut PRÉEXISTANT, sans rapport avec le mode discret — les 14 champs
  monétaires ont été câblés parce que le masquage l'exigeait, pas les autres. Le geste est
  mécanique (un `id` + un `htmlFor` par champ) ; c'est le volume qui l'a sorti du périmètre.
  ⚠️ Le même trou existe probablement dans les autres panneaux de Réglages : greper
  `<label className=` non suivi de `htmlFor` AVANT de chiffrer.

- [x] 🔴 **`[A11Y-PRIVACY-INVESTMENTS-DETAIL]`** (S) — livré 2026-08-14. Les **9 sites** listés par
  l'audit corrigés (légendes des 2 donuts, rééquilibrage en carte ET en liste, carte par titre :
  Valeur, Coût moyen DCA, Gain total DCA). Pourcentages et signe du gain laissés visibles, sous test
  d'intention. Garde de SOURCE sur tout le fichier :
  `tests/components/Investments.privacy.test.tsx`.

- [ ] 🔴 **`[A11Y-PRIVACY-SCAN-GLOBAL]`** (M, **DÉCOUVERT PAR MESURE** 2026-08-14) — construire la
  garde de source `formatCAD` au niveau du DÉPÔT, comme `chartPrivacyScan.test.ts` le fait déjà pour
  les graphiques. **Un scan brut remonte 38 sites dans 19 fichiers** — mais c'est un MAJORANT, pas un
  compte : le tri est le vrai travail. Trois classes de faux positifs déjà identifiées sur un
  échantillon de 4 :
  · **valeur PUBLIQUE** (`TaxBracketViz.tsx:73` — bornes de paliers fiscaux, que #608 exige
    explicitement de GARDER visibles) ;
  · **primitive non reconnue** (`DebtManager.tsx:151` — déjà dans `PrivateSliderValue`) ;
  · **chaîne, pas JSX** (`Budget.tsx:460` — construit un libellé d'alerte ; à tracer jusqu'à son
    consommateur, qui peut être un prompt IA — cas money-critical, cf. la règle no-fake-data).
  ⚠️ **Cette garde REMPLACERAIT la liste faite à la main par l'audit** : elle mesure au lieu
  d'énumérer, et elle ne peut pas oublier un écran. Les tickets `-DIVERS`, `-PROJECTION-EXPLAINS`,
  `-PROPERTY-CONFIG` et `-ONBOARDING` devraient être RE-CADRÉS depuis son résultat plutôt que depuis
  l'audit — leurs sites sont corroborés par le scan, mais rien ne dit que l'audit soit exhaustif.
- [ ] 🔴 **`[A11Y-PRIVACY-PROJECTION-EXPLAINS]`** (S) — `components/projection/ProjectionExplains.tsx` :
  zéro `isPrivacyMode`. Vue année-par-année ET mois-par-mois complète de la projection (soldes,
  cotisations, croissance, retraits, transferts) en clair.
- [ ] **`[A11Y-PRIVACY-DIVERS]`** (M, 8 sites MOYENS regroupés) — `Travel.tsx:125` (budget de voyage) ·
  `dashboard/HealthIndicator.tsx:196,220` (cible FIRE $ et coût des abonnements $ sous les métriques,
  widget permanent) · `retirement/GoalSeekerCard.tsx:61-66,100,111` · `tax/CoupleOptimizationCard.tsx:129` ·
  `investments/AddStockForm.tsx:418-419` · `FutureProjection.tsx:1642,1649` (bandeau « courbe au jour »,
  omission ponctuelle dans un fichier par ailleurs gardé) · `settings/sections/UsersCard.tsx:230` ·
  `retirement/RetirementSettingsCard.tsx:56-64`.
- [ ] **`[A11Y-PRIVACY-PROPERTY-CONFIG]`** (S) — `components/realestate/PropertyConfigurator.tsx` : les
  2 sliders prix/mise de fonds SONT masqués (test dédié), mais pas les champs voisins du même
  formulaire — revenu locatif (96-103), rénos annuelles (185), taxes/chauffage/condo (216-245).
  Même patron « omission par champ » que #608.
- [ ] **`[A11Y-PRIVACY-ONBOARDING]`** (XS, cohérence) — `components/Onboarding.tsx` : mêmes champs non
  masqués, mais NON exploitable (overlay `fixed inset-0 z-[9999]` qui recouvre le bouton du mode
  discret → impossible de l'activer pendant l'onboarding). À aligner par cohérence, pas en urgence.
- [x] **`[A11Y-PRIVACY-PDF-CONTRAT]`** — **LIVRÉ 2026-08-17** (décision Marc, `docs/decisions.md`).
  `services/pdfReport.ts` REFUSE désormais de générer tant que le mode discret est actif, via une
  erreur TYPÉE (`PdfRefusedPrivacyError`) que l'appelant distingue d'une panne.
  ⚠️ **La garde est AU SERVICE, pas au clic** : une borne posée seulement dans `App.tsx` laisserait
  passer tout futur appelant (autre bouton, raccourci, outil MCP, script) — même motif que
  `clampSplitPct`, où la borne UI seule laissait passer un import de sauvegarde.
  ⚠️ Refus **immédiat**, avant toute construction : refuser au moment d'écrire le fichier aurait
  laissé un PDF partiel. Le mode est lu à l'APPEL (il peut être activé entre le rendu du bouton et
  le clic).
  Le toast dit quoi FAIRE (« désactive le mode discret »), pas « erreur » — confondre le refus avec
  une panne enverrait Marc chercher un bug.
  Garde : `tests/services/pdfPrivacyRefus.test.ts`, avec assertion ANTI-SUR-CORRECTIF (mode inactif
  → génère bel et bien : sans elle, refuser TOUJOURS resterait vert) et garde sur le `name` stable
  de l'erreur, sur lequel l'appelant discrimine. Prouvée discriminante (2 tests tombent sans la garde).
- [ ] **`[A11Y-BUDGETGROUP-CHART-NOALT]`** (S, relevé par le panel a11y de #608) — le mini-graphique
  « Historique » par catégorie (`components/budget/BudgetGroupTable.tsx:312-330`) est le SEUL des 10
  graphiques du dépôt sans `role="img"` + `aria-label` ni `ChartDataTable` sr-only : aucun nom
  accessible, aucune alternative textuelle (WCAG 1.1.1 A). Pré-existant, pas une régression.
  **Correctif** : appliquer le patron des 9 autres.

- [ ] **`[A11Y-TOUCH-DELETE-ICONS]`** (S) — 3 boutons suppression icône-seule < 44×44 px (Travel,
  Investments, BudgetGroupTable). Projet a `.touch-target` utilisée ailleurs. **Correctif** : ajouter
  `touch-target` (ou `min-h-[44px] min-w-[44px]`) aux 3 boutons.

- [ ] **`[A11Y-TABSTATE-TAXCENTER]`** (S) — TaxCenter bascule Global/Conjoint sans `aria-pressed`/`aria-current`.
  SR ne sait pas quelle vue est active. **Correctif** : `aria-pressed={viewUser === 'all'}` (ou pattern
  `tablist` déjà présent ailleurs).

- [ ] **`[A11Y-TABLIST-NO-PANEL]`** (S) — Futur : sous-onglets ont `role="tablist"` (bon) mais pas
  `aria-controls`/tabpanel ni flèches gauche-droite (pattern APG complet). Impact limité : chaque tab
  reste normal `<button>` donc atteignable/activable. **Correctif** : ajouter `id`/`aria-controls`
  + `role="tabpanel"` + `aria-labelledby` sur panneau.

### 🔴 Performance (1 HIGH, 2 MED, 1 LOW)

> Mesures réelles (Node profiling CPU V8 + micro-bench isolés). NO O(n²) trouvé.
> Le coût dominant = volume itérations (mois × MC × configs), pas un algorithme mal choisi.

- [ ] 🔴 **`[PERF-ENG-LATENT-MC-WASTE]`** (S) — `computeLatentTax` + bloc fiscal Tier-3 calculés PUIS
  JETÉS en mode Monte Carlo (**5–10 % du temps MC mesuré**). `buildMonthlyDataPoint` garde déjà `if
  (enableMonteCarlo) return {NetWorth, monthIndex}` → sous MC tout `impotLatent`, `dividendIncome`,
  etc. est ignoré, mais le calcul (3× `calculateFiscalReport`) reste d'abord. **Mesuré : 301 ms
  gaspillés sur 6532 ms total MC (4,6 %),** ≈ 2.5-4 s sur `calculateStrategySearch` (52 s total).
  **Correctif** : entourer bloc `1614-1648` d'un `if (!enableMonteCarlo) {...}` avec valeurs neutres
  en branche MC. Test : force `runMC=true` et vérifie `chartData` contient uniquement
  `{NetWorth, monthIndex}`.

- [ ] **`[PERF-ENG-INCOMELOSS-DATESTR]`** (S) — `computeIncomeLossFactor` reforme date en chaîne à
  CHAQUE mois actif, sans vérifier événements. `toISOString() + substring() + split()` répété 4M fois
  sur 30×MC(100). **Mesure : 530 ticks CPU (2,6 % du profil),** comparable à `computeRetirementIncome`.
  **Correctif** : retour anticipé si `lifeEvents.length === 0` (majorité des ménages sans perte de
  revenu), remplacer `toISOString().substring(0,7)` par arithmétique entière `getUTC*()` (pas
  d'allocation chaîne), parser événement date via slice + Number.

- [ ] **`[PERF-BOOT-HYDRATE-CHAIN]`** (M/L) — hydratation historique/prix/profil chaînées en SÉRIE :
  chaque passe a sa PROPRE boucle pacée 2500 ms → 3 passes totales = 3×N×2500 ms pour N titres.
  Pour 20 titres : **jusqu'à ~150 s** avant dernier titre complet vs ~50 s si entrelaçé. **⚠️ NE PAS
  paralléliser naïvement** (rate-limit provider écrasé) — piste sûre = entrelacer par titre (historique
  +prix+profil consécutifs). **Correctif** : valider budget provider RÉEL avant de coder (cf. leçon
  `docs/CONVENTIONS.md` « vraie contrainte »).

- [ ] **`[PERF-RENDER-SETUPHUB-FULLSTORE]`** (S) — `SetupHub.tsx` sélectionne store complet (`s => s`)
  au lieu d'atomique → re-render sur TOUTE écriture store. Composant peu coûteux (11 onglets ×
  2-4 reqs), gain modeste. **Correctif** : remplacer par sélecteur atomique
  `useShallow` restreint aux champs RÉELLEMENT lus.

### 🔴 IA / Anthropic (1 HIGH, 4 MED, 2 LOW)  *(2 HIGH talon de paie livrés par #608)*

> Périmètre : services/claude.ts, Vision payslip, chat in-app, budget recommandations.

- [x] 🔴 **`[AI-CATEGORIZE-NO-BACKOFF]`** (M, LIVRÉ) — [dupliqué en fiscal section, voir là-haut]

- [ ] **`[AI-BUDGETMODAL-MODEL-COST]`** (S) — `BudgetAiModal.tsx` `chatStream` sans `model` →
  défaut Sonnet pour 3 recos courtes (toutes les tâches comparables épinglent Haiku). `MODEL_HAIKU`
  n'est pas exporté (piège futur). **Correctif** : `model: MODEL_IDS.haiku`.

- [ ] **`[AI-BUDGETMODAL-ERROR-COLLAPSE]`** (S) — catch générique rend « Vérifie ta clé Anthropic »
  même quand clé valide (réseau, 429, JSON tronqué). Contraste avec `agentLoop.ts` qui distingue
  `truncated`/`refused`/`error`. **Correctif** : détecter troncature + message honnête.

- [ ] **`[AI-COUPLE-SELFRATED-CONFIDENCE]`** (S) — `confidence` et `estimated_savings_cad` sont
  AUTO-évalués par le modèle ; code valide que la FORME (enum Zod) et affiche « Haute confiance »
  verbatim. Chiffre halluciné s'affiche avec autorité d'un calcul vérifié. **Correctif** : libellé
  « estimation IA, non vérifiée » quel que soit `confidence`.

- [ ] **`[AI-MODELID-PINNING-DRIFT]`** (S) — Haiku épinglé sur snapshot daté, Sonnet/Opus sur alias
  non datés → Anthropic peut faire évoluer modèle/tarif sans que `pricing.ts` (daté 2026-06-24) ne
  suive → coût affiché faux en silence. **Correctif** : épingler des snapshots datés partout, ou
  dater la vérification.

- [ ] **`[AI-ONESHOT-NO-CACHE]`** (M) — `system` typé `string` nu → **aucun** appel one-shot ne peut
  utiliser cache prompt (contrairement à `agentLoop.ts`). Impact faible (~190 tokens), mais boutons
  « Régénérer » repaient plein tarif. **Correctif** : union `string | Array<block>` pour permettre
  `cache_control`.

- [ ] **`[AI-BUDGETMODAL-RAW-FALLBACK]`** (S) — sans JSON détecté, texte BRUT non validé est affiché
  comme recommandation légitime (hors `RecosSchema`). **Correctif** : échec honnête plutôt qu'affichage
  de secours.

### 🔴 Dette technique (2 HIGH, 4 MED, 6 LOW/S)

> Périmètre : bundling, UI, sync, linting, code mort, god files.

- [ ] 🔴 **`[FMT-TOLOCALESTRING-MONEY]`** (L) — **45 sites** `Math.round(x).toLocaleString('fr-CA') + '$'`
  sur des MONTANTS (hors dates, exclues). **17 fichiers**, services/projection/* surtout (80 % volume).
  Classe de bug déjà vécue (couleurs/contraste divergence par site). **Correctif** : helper
  `formatCADSigned`/`formatCADRound` dans `utils/format.ts` (réutilise `formatCAD`), remplacer les
  45 sites (script grep-replace + relecture, aucun changement visuel attendu). Par dossier
  `services/projection/*` d'abord (plein d'impact).

- [ ] **`[UI-NO-INPUT-PRIMITIVE]`** (L) — `components/ui/` n'a **aucun** composant `Input`/`Select`/`Field`
  (seul `PrivateNumberInput` existe). **132 occurrences** `<input>` brut dans **16 fichiers**. Chaque
  site réécrit sa propre chaîne Tailwind → dérive de style (focus ring, contraste, cible tactile) doit
  être corrigée site par site. **Correctif** : créer `components/ui/Input.tsx` + `Select.tsx` +
  `Field.tsx` (label+erreur+aria) + migrer sliders d'abord (fort impact partagé), puis texte/date. Par
  fichier, aucun changement comportement.

- [ ] **`[SYNC-PUSH-PULL-NO-UNIT-TEST]`** (M) — `syncPush.ts` / `syncPull.ts` (logique push/pull Drive,
  write direct `localStorage.setItem`) + 4 autres modules sync (`syncPassphrase`, `syncSnapshot`,
  `syncMeta`, `syncPolling`, cumulé 886 lignes) **zéro test direct**. `syncOrchestrator` a des tests
  EN INTÉGRATION. Un bug de merge/payload tronqué en sync conservation peut passer inaperçu.
  **Correctif** : auditer d'abord ce que `syncOrchestrator*.test.ts` couvre réellement (mock vs
  réel) ; ajouter tests directs `syncPush`/`syncPull` priorité (paths de conflit, payload
  partiel/corrompu).

- [ ] **`[CHART-COLOR-DUP]`** (S) — Aucun module central de tokens couleurs graphiques. **212 hex
  littéraux** dans 6+ fichiers (FutureProjection, Retirement, Investments…), mêmes valeurs répétées
  (ex. `#ef4444` rouge alerte dans 6 fichiers). Un changement de teinte design system = grep-replace
  manuel 6 fichiers sans garantie exhaustivité. **Correctif** : `utils/chartColors.ts` exportant
  teintes de séries (mappées aux tokens Tailwind existants), importé par les 6 fichiers.

- [ ] **`[STORAGE-KEYS-NO-REGISTRY]`** (S) — **40 clés localStorage** en chaînes littérales à travers
  **~20 fichiers**. 3 composants définissent chacun leur propre `DISMISS_KEY` (exportés mais unused).
  Aucune table documentant qui possède quoi → futur renommage/purge risqué (collision silencieuse).
  **Correctif** : `utils/storageKeys.ts` avec `const STORAGE_KEYS = {...} as const` documentant owner
  + but, centraliser les 3 `DISMISS_KEY` dupliqués.

- [ ] **`[DEAD-CALCNETFROMGROSS]`** (S) — `calculateNetFromGross` (`utils/tax.ts:852`) mort (grep :
  zéro appelant). Fonction jumelle `calculateGrossFromNet` active. Commentaire voisin y fait référence
  comme si active → lecture trompeuse. **Correctif** : supprimer, ou ajouter test dédié si futur UI
  l'utilisera.

- [ ] **`[KNIP-EDGE-FALSE-POSITIVE]`** (S) — `api/claude/[...path].ts` listé « unused » par knip (faux
  positif : route Vercel par convention, jamais importée statiquement). **Correctif** : ajouter
  `"api/**/*.ts"` aux `entry` de `knip.json`.

- [ ] **`[GODFILE-FUTUREPROJECTION]`** (L) — `FutureProjection.tsx` **1 820 lignes**, 91 fonctions
  locales, 15 `useMemo`, 6 `useEffect`. Combine : config séries + zoom/tooltip + marqueurs événements
  + persistance localStorage. **Correctif (découpe sans changement comportement)** : (1) extraire config
  statique vers `components/future/seriesConfig.ts` ; (2) logique marqueurs vers
  `hooks/useFutureEventMarkers.ts` ; (3) persistance vers `hooks/useHiddenSeries.ts` (pattern dupliqué
  ailleurs).

- [ ] **`[GODFILE-INVESTMENTS]`** (L) — `Investments.tsx` **1 440 lignes**, 9 `useState`, 20 définitions
  locales. Combine probablement liste positions + comparaison + formulaires. Certains partiellement
  extraits (AddStockForm 475 l.). **Correctif** : identifier sous-sections quasi-autonomes (return
  imbriqués / commentaires section), extraire vers `components/investments/` style AddStockForm. Nécessite
  lecture préalable COMPLÈTE avant découpe.

- [ ] **`[GODFILE-BUDGET]`** (L) — `Budget.tsx` **1 413 lignes**, 12 `useMemo`, 46 const/fonctions locales.
  Contient sélection dates inline (violant `[UI-NO-INPUT-PRIMITIVE]`). **Correctif** : même méthode que
  FutureProjection — extraire blocs purement calculatoires (agrégats budget, vérifier non-re-dérivés
  localement vs moteur), puis sous-vues JSX. Mesurer handlers (0 `useCallback` → risque re-création).

- [ ] **`[KNIP-UNUSED-EXPORTS-73]`** (S triage) — **73 exports non-utilisés** + **209 types** exportés
  inutilisés. Types bénins (aucun coût réel). Valeurs notables : `utils/tax.ts` **19 constantes RRQ/
  RQAP/AE/RAMQ/FSS** non-ré-exportées (probablement usage interne au fichier seulement). **Correctif** :
  triage item-par-item : retirer `export` si usage interne, supprimer si vraiment mort (cf.
  `calculateNetFromGross`). Deux exports dupliqués détectés aussi (`resetAttachmentDriveMemos|_reset...`
  + `compareLifeScenarios|optimizeDrawdownOrder`).

- [ ] **`[HOOKS-EXHAUSTIVE-DEPS-WARN]`** (S) — `react-hooks/exhaustive-deps` en `warn` (pas `error`) →
  **2 violations actives** ne bloquent pas le gate : `useChartTooltipPosition.ts:96` et
  `useTimeChartZoom.ts:255` (dépendances manquantes sur refs stables). **Correctif (a)** : corriger les
  2 warnings ; **(b)** discuter passage à `'error'` avec Marc (impact sur autres fichiers à mesurer).

---

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

