# SESSION HANDOVER — pour le prochain Claude

> **À lire EN PREMIER si tu reprends FinanceAI.** Ce document remplace
> la lecture séquentielle de tous les autres. Pointeurs vers les détails
> à la fin.
>
> ## 🟢 Session 2026-08-11 (suite 39) — `[FUTUR-DAILY-INFOBULLE-ONLY]` + `[ZOOM-ROUND-FIXPOINT]`
> **Correction de cap de Marc** : « je veux que juste dans l'infobulle ce soit l'information par
> jour […] je veux pouvoir zoomer un peu plus pour voir les jours individuels […] pas de nouvel
> onglet ou quoi ».
> - **Retiré** : le tableau jour-par-jour sous la courbe (`DailyDetailPanel`) + tout le code que lui
>   seul consommait (`refineMonthToDaily`, `refineWindowToDaily`, `daySpan`, `dailyDeltasFor`,
>   `datedCoverageForMonth`) et leurs tests. Le détail du jour vit dans l'infobulle, uniquement.
> - **Zoom profond** : `minPoints: 1` sur le graphe Futur → plancher à 2 points mensuels = 1 mois
>   rendu au jour (~30 px par jour). Les autres graphes gardent le défaut 5.
> - ⚠️ **Bug de fond `[ZOOM-ROUND-FIXPOINT]`, trouvé par SONDE** (10 crans dispatchés, fenêtre
>   inchangée — pas à la lecture) : à petit span l'arrondi entier ANNULAIT le cran (à span 5, ×0,85
>   déplace chaque borne de ~0,375 → mêmes entiers → point fixe, et la base du cran suivant est la
>   cible arrondie). `minPoints: 1` seul était INOPÉRANT, et le DÉZOOM au plancher était déjà coincé
>   avant ce lot. Correctif : pas entier forcé quand l'arrondi annule, côté opposé au curseur.
>   6 tests du hook (4 discriminants prouvés par stash) + garde e2e mesurable (la légende sr-only
>   cesse d'être « échantillonnée » sous 40 jours).
> - ⚠️ Piège de test vécu : un stub rAF SYNCHRONE fait croire au hook qu'un frame est éternellement
>   en attente (le callback tourne avant l'affectation de l'id) — les tests mesuraient le stub.
>   File de frames flushée manuellement.
> - Gate vert : typecheck, lint, **3 729 tests / 326 fichiers** (−21 : tests du tableau retiré et du
>   code mort, +6 du hook de zoom), build, e2e Futur complet (jour, tooltip, axe, icônes).

> ## 🟢 Session 2026-08-11 (suite 38) — `[FUTUR-DAILY-PAST-REAL]` : le passé au jour devient RÉEL
> Seconde moitié de la demande de Marc (« je veux aussi que ça marche pour le passé, en fonction de
> la valeur de mes comptes, de mes dépenses »).
> - **Avant** : les jours du passé étaient INTERPOLÉS entre deux ancres mensuelles — un lissage là où
>   l'app connaît la vérité au jour près (transactions datées, prix datés), et où les fonctions de
>   reconstruction existaient déjà, consommées par `DailyDetailPanel` mais PAS par la courbe.
> - **Livré** : `services/history/dailyPastLedger.ts` (13 tests). Soldes par compte + cash + immo +
>   valeur nette réels, revenus/dépenses = vraies transactions du jour (libellés compris), et la
>   variation d'un compte séparée en DÉPÔT (achats datés à leur prix d'achat) vs RENDEMENT.
> - ⚠️ **Le point réel est construit À PARTIR DE RIEN**, pas par `{...projeté, ...réel}` : sinon des
>   dizaines de champs PROJETÉS (impôt dormant, rentes, solde d'impôt) survivraient dans une journée
>   présentée comme réelle. Ce qui n'est pas mesuré est ABSENT.
> - ⚠️ Une journée n'existe que si cash ET placements ont de la matière ; aujourd'hui n'est pas
>   reconstruit (la reconstruction s'arrête à la veille) ; bornée à aujourd'hui pour ne pas afficher
>   des placements plats « reconstruits » sur le futur.
> - Badge **Réel / Projeté** dans l'infobulle + avertissement quand le prix utilisé date de > 7 jours.
> - ⚠️ **Retour immédiat de Marc : « je vois toujours pas au jour pour le passé ».** Vrai, et
>   arithmétique : `dailyWindowRange` posait `lo = todayIndex − 1`, or la 1re ancre de la fenêtre est
>   CONSOMMÉE comme valeur d'entrée sans être rendue → le 1er jour affiché était le 1er du mois
>   COURANT. Le passé au jour était livré, testé, et **strictement invisible**. Fenêtre désormais
>   CENTRÉE (2 mois passés + courant + 2 futurs), avec un test qui échoue sur l'ancien ancrage.
>   Classe `UX-UNREACHABLE-FEATURE`, 3e occurrence sur ce chantier — livrer ≠ rendre visible.
> - Libellé du jour passé en `JJ/MM/AAAA` (« sam. 14/09/2026 ») : le mois abrégé ressemblait encore
>   au libellé mensuel d'un coup d'œil. Demande de Marc, 2e correction du même symptôme.
> - Gate vert : typecheck, lint, **3 750 tests / 326 fichiers**, build, e2e « sélection d'un jour ».
> - **Reste** : `[FUTUR-DAILY-CADENCE]` (cadence de paie dérivée des relevés) et
>   `[FUTUR-DAILY-TOUCH]` (pincement au doigt, à cadrer avec Marc).

> ## 🟢 Session 2026-08-11 (suite 37) — `[FUTUR-DAILY-FULL]` : la vue au jour ne CALCULAIT rien au jour
> **Retour de Marc, capture à l'appui** : « ça me dit encore septembre 2026 et pas le jour […] je
> veux que tous les calculs soient faits pour chaque jour, je veux que tout soit ajusté au jour,
> toutes les sommes. Je veux aussi que ça marche pour le passé. »
> - **Diagnostic** : l'infobulle de sa capture était un point MENSUEL (elle affiche « Paye »,
>   « Dépenses de vie », « Impôt dormant », « Par compte » — des champs que le moteur n'émet qu'au
>   mois). Mais le vrai défaut était en dessous : **la vue au jour ne portait QUE `NetWorth`**. Toutes
>   les autres lignes de l'infobulle étaient donc vides au jour, et les aires par compte masquées
>   « en s'en expliquant ». Une courbe au jour SANS calculs au jour.
> - **Livré** : `services/projection/dailyLedger.ts` (25 tests) ventile **tous** les champs du moteur
>   au jour, par classe — `stock` (interpolé du mois précédent à ce mois), `flow` (réparti selon sa
>   cadence), `monthly` (un taux ne se divise pas), `recomputed`. L'infobulle et les aires empilées
>   fonctionnent au jour **sans une ligne de réécriture** : elles lisent les mêmes clés.
> - ⚠️ **Un constat de cadrage à moi était FAUX et bloquait la feature** : « seule la Valeur nette
>   peut passer au jour, ventiler les comptes serait de la fausse précision » (BACKLOG, lot B étape 2).
>   Le moteur émet DÉJÀ `NetTransfer*` et `MarketGrowth*` par mois ET par compte — de quoi décomposer
>   sans rien inventer. Classe `DOC-STALE-IMPOSSIBILITY`.
> - ⚠️ **Bug de fond corrigé** : le raffinement précédent appliquait la même liste de mouvements datés
>   au COMPTE et au PATRIMOINE NET → un paiement de dette creusait un trou dans la valeur nette le
>   jour de paie, rebouché ensuite par l'étalement du résidu (juste en fin de mois, faux au jour).
> - ⚠️ **Les deux tests d'invariant ne suffisaient PAS** : ils lisent `FIELD_KIND` pour choisir quoi
>   vérifier, donc un solde reclassé en flux leur échappe (mesuré). D'où une 3e garde d'**ordre de
>   grandeur**, indépendante de la classification.
> - **Reste ouvert** : `[FUTUR-DAILY-PAST-REAL]` (le passé au jour vient encore de l'interpolation des
>   ancres mensuelles, alors que les vraies séries quotidiennes existent) et `[FUTUR-DAILY-CADENCE]`
>   (cadence de paie dérivée des relevés — Marc : « pour l'instant jeudi hebdo »).
> - ⚠️ **Défaut MAJEUR trouvé en route, antérieur à ce chantier** : cliquer sur une AIRE du graphe
>   Futur ne figeait pas l'infobulle — le navigateur ne dispatche aucun `click` sur un path recharts
>   redessiné au survol. La moitié basse de la courbe était morte au clic depuis toujours ; l'e2e
>   cliquait dans le vide au-dessus de la pile, donc il ne le voyait pas. Corrigé (`onPointerUp`).
>   Méthode : sonde Playwright + instrumentation par attribut DOM (le `console.log` restait muet).
> - Gate vert : typecheck, lint, **3 735 tests / 325 fichiers**, build, e2e Futur (jour, infobulle, axe, icônes).

> ## 🟢 Session 2026-08-11 (suite 36) — `[FUTUR-DAILY-REACH]` : la vue au jour était INATTEIGNABLE
> **Retour de Marc après le déploiement de l'étape 2 : « j'arrive toujours pas à voir jour par
> jour ».** Rien n'était cassé — et il avait entièrement raison.
> - **Diagnostic mesuré** : la vue au jour ne s'active que sous **6 points mensuels visibles**, et le
>   seul chemin y menant était la molette — **23 à 31 crans depuis « Tout »** (facteur 0,85/cran,
>   plancher `DEFAULT_MIN_POINTS = 5`), **16 depuis le preset « 5 ans »** — sans aucun retour disant
>   qu'on s'en approchait. Et `useTimeChartZoom` n'écoute QUE `wheel` + souris : **au doigt, c'était
>   impossible**, sur tous les graphes de l'app.
> - **Livré** : bouton **« Jour »** dans le sélecteur de période. Un clic pose la fenêtre exacte,
>   ancrée sur aujourd'hui. `dailyWindowRange` (pur, 6 tests) — recule d'un mois parce que
>   `refineWindowToDaily` CONSOMME la première ancre comme valeur d'entrée sans la rendre, et rend
>   `null` si la fenêtre couvrirait tout (le hook repasserait en « vue complète » → jamais zoomé →
>   bouton sans effet). E2E « EN UN CLIC », **prouvée discriminante** (`git stash` : échoue sans).
> - **Défaut adjacent corrigé** : `idxForYears` cherchait dans `chartData` alors que le zoom indexe
>   `displayData` (= passé préfixé + `chartData`) → les presets « 5/10/20/30 ans » s'arrêtaient
>   `pastPrefix.length` mois trop tôt.
> - **Routé au BACKLOG** : `[FUTUR-DAILY-TOUCH]` (pincement au doigt) — à cadrer avec Marc avant de
>   coder, la question « utilises-tu l'app au doigt ? » n'est pas tranchée.
> - Gate vert : typecheck, lint, **3 710 tests / 324 fichiers**, build.

> ## 🟢 Session 2026-08-11 (suite 33) — `[FUTUR-DAILY]` lot A2 : infobulle quotidienne + par compte
> **Demande de Marc** : « avec l'info bulle dans futur je veux voir le détail par jour et le passé je
> veux voir le détail par jour et par compte aussi ». Les deux sont livrés.
> - **Infobulle Futur** : bloc « Jour par jour » du mois SURVOLÉ. `ExpertTooltip` reste PASSIVE (prop
>   `dailyRows`) — c'est `FutureProjection` qui raffine UN mois (ancre d'entrée = le mois précédent).
>   Jours à mouvement daté surlignés ; le pied dit que le reste est de l'interpolation.
> - **Passé par compte** : 6 colonnes de régime dans `DailyDetailPanel`. La donnée existait déjà dans
>   `reconstructPortfolioHistoryDaily` — elle était JETÉE au rendu.
> - ⚠️ **Défaut CORRIGÉ, trouvé en écrivant le test** : la reconstruction n'était pas bornée à
>   aujourd'hui → plateau de prix reconduit présenté comme mesuré sur les jours FUTURS, à côté d'une
>   colonne « Projeté » croissante. Bornée à `min(to, today)`. Leçon dans `CONVENTIONS.md`.
> - Replis de sélecteurs `?? []` inline → **constantes de module** (`react-hooks/exhaustive-deps` les
>   signalait : nouvelle référence à chaque rendu → memos invalidés à chaque frame de zoom).
> - **Panel (code-reviewer, a11y-auditor, silent-failure-hunter) — 5 findings, tous CONFIRMÉS et
>   corrigés dans la même PR** : `Number(NetWorth) || 0` qui vidait le garde no-fake de
>   `refineMonthToDaily` (→ `finiteAnchorRun`, plage contiguë) · la ligne d'AUJOURD'HUI mesurée mais
>   annoncée « (projeté) » (`isPast` en `<` face à une borne inclusive) · la fermeture `deltasFor`
>   dupliquée entre les deux écrans (→ `dailyDeltasFor`) · deux conteneurs défilants inatteignables
>   au clavier · les « — » hors convention `emptyAware`.
> - Gate vert : typecheck, lint, **3 691 tests / 324 fichiers**, build.

> ## 🟢 Session 2026-08-11 (suite 35) — `[FUTUR-DAILY]` lot B étape 2 : SÉLECTIONNER un jour
> ⚠️ **CORRECTION DE CAP de Marc** : « je veux pas voir dans l'info bulle le détail des jours de
> chaque mois, je veux pouvoir sélectionner chaque jour dans le graph ». Le bloc-liste ajouté au
> lot A2 donnait à LIRE — retiré. Chaque jour est désormais un POINT du graphe au zoom maximal.
> - Abscisse fractionnaire `axisXAtDay` (jour 1 = entier du mois → jalons alignés).
> - ⚠️ Clic résolu par VALEUR d'abscisse (`resolvePointByX`), pas par rang : les jours ne sont pas
>   régulièrement espacés (1/28 vs 1/31) — par rang le clic visait un autre jour, en silence.
> - ⚠️ **Seuil COUPLÉ au plancher de zoom** : `minPoints = 5` laisse **6** points visibles ; mon
>   plafond initial (4 mois) rendait la vue au jour INATTEIGNABLE. Code « correct », fonctionnalité
>   jamais déclenchée — attrapé par l'e2e, invisible à la lecture et au typecheck.
> - Aires par compte masquées au jour + bandeau qui explique pourquoi (moteur mensuel).
> - Gardes : `e2e/futureDailySelect.spec.ts` (2 abscisses éloignées → 2 jours DIFFÉRENTS) + tests
>   unitaires `axisXAtDay` / `resolvePointByX`.
> - ⚠️ **2 findings CRITIQUES de la revue, corrigés** : « Variation +0 $ » en vert sur chaque jour
>   (badge sans garde sur `diffNW || 0`) → `diffNW` est désormais l'écart avec la VEILLE, et le badge
>   se masque quand elle est inconnue · « Détail complet » passait un point à abscisse FRACTIONNAIRE
>   à `FutureDetailModal`, qui joint par `monthIndex` → 30 jours sur 31 sans correspondance, `|| 0`
>   partout, et une DETTE fabriquée égale au patrimoine net quand il est négatif → on rabat sur le
>   vrai mois hôte (`hostMonthIndex`). Le double cast `as unknown as` avait masqué les deux :
>   remplacé par `Partial<ProjectionChartPoint> & {…}`.
> - Table sr-only : suit désormais `chartSeries` (parité a11y avec la vue au jour), champs absents →
>   `NO_DATA_LABEL` littéral, jamais « 0 $ ». Gate : **3 704 tests**.

> ## 🟢 Session 2026-08-11 (suite 34) — `[FUTUR-DAILY]` lot B étape 1 : axe X NUMÉRIQUE
> **Marc a choisi l'axe numérique** parmi 3 options (fraction de mois / axe numérique / 2e graphe).
> `type="number"` + `domain={['dataMin','dataMax']}` — préalable au tracé quotidien : en catégoriel,
> les ancrages s'apparient par CATÉGORIE et disparaîtraient sur des abscisses fractionnaires.
> - ⚠️ **Pas un no-op au pixel** (mesuré) : décalage d'une demi-bande, points et ancrages ENSEMBLE.
> - ⚠️ **`domain` obligatoire** : sans lui recharts part de 0 → tout le passé repoussé (316,5 vs 122,5).
> - Garde `e2e/futureAxis.spec.ts`, prouvée discriminante dans les DEUX états fautifs.
> - ⚠️ **Sonde à ne PAS refaire** : `toHaveScreenshot` pleine page — même md5 avec et sans le
>   `domain` (conteneur rendu −1×−1), soit un « vert » qui masquait 194 px d'écart.
> - ⚠️ **Constat de cadrage pour l'étape 2** : seule la **Valeur nette** peut passer au quotidien.
>   Les 8 aires empilées, l'impôt latent, la barre d'impôts et le Monte Carlo lisent des champs que
>   le moteur n'émet qu'au MOIS. À trancher avec Marc avant de coder.
> - E2E dans ce conteneur : chromium 1194 vs 1223 attendu → `PW_LOCAL_CHROMIUM=/opt/pw-browsers/chromium`
>   (les specs Futur lisent déjà cette variable).

> ## 🟠 Session 2026-08-06 (suite 32) — #574 mergée, mais PAS déployée
> `[FUTUR-DAILY]` est **sur `main`** (`ed5a7d1`, #574) — et **Vercel n'a créé aucun déploiement de
> PRODUCTION** dans la demi-heure suivante. `latestDeployment` du projet restait la PREVIEW de
> `02ae31a` (`target: null`). **Marc en a été informé** — ne PAS annoncer une mise en ligne qui n'a
> pas eu lieu. À re-vérifier : `latestDeployment.target === 'production'` ET le SHA.
> ⚠️ **J'ai d'abord accusé le quota du plan gratuit — hypothèse RÉFUTÉE 10 min plus tard** : Vercel a
> construit sans broncher la preview de #575. Le plus probable est un webhook de déploiement MANQUÉ
> sur ce push précis (les merges précédents du même jour avaient bien produit leur production).
> Le merge de #575 devrait donc emporter le contenu de `ed5a7d1` en production au passage — à
> VÉRIFIER, pas à supposer. Sinon : Vercel → Deployments → `ed5a7d1` → Redeploy (action de Marc).
>
> ⚠️ **Et le blocage qui a coûté 40 min** : les checks de #574 sont restés EN FILE 15 min puis ont
> été **ANNULÉS** (`conclusion: "cancelled"`, PAS `"failure"`). L'auto-merge ne se déclenche jamais
> là-dessus, et aucun webhook d'échec ne part. Déblocage = `rerun_workflow_run`. Leçon portée dans
> `CONVENTIONS.md` : lire `conclusion`, pas seulement `status`.

> ## 🟢 Session 2026-08-06 (suite 31) — `[FUTUR-DAILY]` : granularité QUOTIDIENNE (demande Marc)
> **Marc a tranché « quotidien sur tout, je veux voir le détail si je zoom beaucoup ».** J'avais
> objecté que le quotidien long terme est de la fausse précision ; il a maintenu. **Décision prise,
> ne plus la rediscuter.** Sa formulation permet de la servir sans le coût redouté.
>
> **CONCEPTION** : le moteur RESTE mensuel (source de vérité, `projection.ts` INTOUCHÉ — le passer au
> jour = ~11 000 itérations × chaque tirage MC, et rejouer au jour une fiscalité qui n'a que des
> événements ANNUELS). Un module RAFFINE la fenêtre regardée.
> **INVARIANT money-critical** : la série quotidienne passe EXACTEMENT par les points mensuels, par
> construction. Sinon l'app afficherait deux vérités pour le même mois selon le zoom.
>
> Livré et testé (**~110 tests**) : `dailyRefine` · `reconstructCashHistoryDaily` (le `slice(0,7)`
> jetait le jour) · `reconstructPortfolioHistoryDaily` (fenêtrée, par compte) · `datedMonthEvents` ·
> `DailyDetailPanel` **BRANCHÉ** dans `FutureProjection` (n'apparaît qu'en zoom).
>
> ⚠️ **UI lot B — la COURBE elle-même en quotidien — reste À FAIRE, et ce n'est PAS un branchement.**
> _(⚠️ PÉRIMÉ depuis le 2026-08-11 — l'axe est passé en NUMÉRIQUE, voir suite 34. Conservé tel quel :
> c'est l'état des lieux qui a motivé le choix du panneau à l'époque.)_
> L'axe X du graphe Futur est **CATÉGORIEL** : « Aujourd'hui », la frontière passé/futur, les
> événements de vie et les icônes-jalons sont ancrés sur un `monthIndex` ENTIER apparié comme
> CATÉGORIE. Migrer exige de convertir chaque ancrage ; un désalignement y serait SILENCIEUX sur un
> écran money-critical → changement dédié + e2e.
> ⚠️ **Écart ANNONCÉ à Marc** : `RecurringItem.dayOfMonth` est la SEULE date que l'app connaisse pour
> le futur. La PAIE et les DETTES n'ont aucun champ de jour → seules les charges récurrentes font de
> vraies marches, le reste est lissé. Question **A13** dans `A_FAIRE_MOI`.
>
> **Audit `financial-integrity` (relancé sur main, le 1er était mort au lancement)** — findings
> traités AVANT le branchement : la fusion des deux `72` est CONFIRMÉE correcte et protectrice
> (découpler = +6 508 $ sur 22/56 personas) · ma borne basse est INERTE (1 716 appels instrumentés) ·
> mais mon « aucun producteur d'âge fractionnaire » était FAUX pour les CHARGEURS
> (`appStateSchema.ts:27` accepte `z.number()` sans arrondi) et l'écart vaut **+386 276 $** sur un
> solo à 71,5 ans · `FISCAL_REFERENCE` décrivait un gate MÉNAGE qui n'existe plus · deux divergences
> d'ANCRE du cash quotidien (`undatedTotal`/`flowsAfterNowDate` désormais exposés ET affichés).
> Trois dettes PRÉ-EXISTANTES ticketées : plafonds REER 2010-2023 non documentés, fallback 2025
> appliqué aux années pré-2010, extrapolation +0,5 %/an non sourcée.

> ## 🟢 Session 2026-08-06 (suite 30) — repli FERR durci + dédup doc + INDEX des blocages (PR #573)
> **Demande de Marc : « continue avec tout ce que tu peux faire, et prépare-moi la liste de ce que
> je dois faire pour te débloquer le backlog au complet ».** Les deux sont livrés.
>
> 1. **`[FISC-RRIF-FRACTIONAL-AGE]`** — `rrifRateForAge()` remplace le repli attrape-tout
>    `RRIF_RATES[age] || RRIF_RATE_PLATEAU`, qui distribuait le facteur le PLUS PUNITIF du barème
>    (20 %) à toute entrée absente de la table. Discriminant PROUVÉ contre `git archive` : l'ancien
>    code rend 20 % sur 72,5 · 93,9 · NaN · +Infinity ; le nouveau rend 5,40 % · 16,34 % · 0 · 0.
>    ⚠️ **NaN traversait le filtre `age < 72`** (toute comparaison avec NaN est fausse) — je ne
>    l'avais pas anticipé, c'est le tracé du code qui l'a montré.
>    **Bit-identité vérifiée** : SHA-256 sur 361 mois × 102 champs, fixture couple 70/66 ans avec
>    1,4 M$ de REER (ΣRetraitREER = 2 185 736,69 $, donc le FERR tourne VRAIMENT), sonde prouvée
>    discriminante (93 → 16,35 % au lieu de 16,34 % déplace le hash).
> 2. **`[FISC-REF-DEDUP]`** — un sujet, un endroit. Les valeurs vivent dans §CELI/§REER/§FERR ; la
>    section d'ancrage ne garde que la provenance et la leçon. Deux limites connues sont maintenant
>    ÉCRITES là où on les lira (94 ans contesté · droits REER au niveau MÉNAGE).
> 3. **`[FISC-CONST-ANCHOR-DEBT]` +2 (5/14)** — `RRIF_FIRST_WITHDRAWAL_AGE` (72, qui vivait en dur
>    sur taxJanuary ET taxDecember) et `RRIF_PLATEAU_AGE` (95, qui n'était écrit NULLE PART :
>    porté par la seule absence d'entrée dans la table).
>    ⚠️ **Le garde a mordu sur mon propre ajout** : `95` existait DÉJÀ dans `helpers.ts` (palier de
>    la courbe de mortalité, famille `design`) → collision de la clé `(fichier, valeur)`. Le
>    compromis était documenté ; il est désormais VÉCU. Résolu par UNE entrée qui nomme les DEUX
>    sens, famille la plus exigeante (`fiscal`). Taire une des deux aurait fait mentir l'inventaire.
>    ⚠️ **Rendement décroissant sur les 9 restantes** : ce sont des âges-seuils déjà commentés et
>    sourcés sur place. Seul le `65` (2 modules) vaut encore le geste. Noté au BACKLOG.
> 4. **Findings du panel `silent-failure-hunter` CORRIGÉS dans la même PR** — les deux tenaient :
>    - **MOYEN** — `return 0` sur non-fini confondait deux signaux OPPOSÉS : le sentinelle
>      `−Infinity` de `taxJanuary` (« conjoint sans âge », absence délibérée) et une donnée
>      CORROMPUE (`NaN`/`+Infinity`). La convention du dossier (`pastPurchaseInit.ts`, `isCorrupt`)
>      est explicite : « champ renseigné mais non fini, jamais avalé sans trace ». Corrigé par
>      `logErrorThrottled` — mais **sans coder « −Infinity est spécial »** : c'est l'ORDRE des
>      gardes qui sépare (borne basse d'abord, `−Infinity < 71` est vrai). Zéro cycle d'import
>      vérifié (`errorLogger` n'importe rien ; `pastPurchaseInit` du même dossier l'importe déjà).
>    - **FAIBLE** — mon commentaire de test sur-affirmait « repli inatteignable ». Vrai seulement
>      sur [72, 95) avec la vraie table. Reformulé.
>    - ⚠️ **Et un 3ᵉ, que je me suis infligé en corrigeant le 1er** : j'ai borné par le bas à
>      `RRIF_FIRST_WITHDRAWAL_AGE` (72), ce qui **écrasait le facteur 71** que la table porte
>      délibérément (conversion volontaire précoce). Conversion (71) et 1er retrait forcé (72) sont
>      DEUX règles ARC distinctes. **Attrapé par mon propre test de non-régression**, pas par
>      relecture → `RRSP_TO_RRIF_CONVERSION_AGE` ajouté, borne corrigée, test dédié.
>    Bit-identité RE-VÉRIFIÉE après ces corrections : même SHA-256.
> 5. **`docs/A_FAIRE_MOI.md` — INDEX exhaustif des blocages** (§ « 🔓 INDEX ») : A = 12 questions à
>    réponse courte + les 4 de `PROFIL-SWITCH` · B = 5 sources fiscales que le proxy bloque ·
>    C = 7 actions de configuration · D = 5 vérifs à l'écran · E = 3 chantiers qui attendent MON
>    cadrage, pas une action de Marc · F = ce que je fais sans lui. Chaque ligne porte son impact
>    MESURÉ et ce qu'elle débloque.
>
> ## 🟠 Session 2026-08-06 (suite 29) — audit de l'ancrage : 2 findings à impact ROUTÉS vers Marc
> L'audit `financial-integrity` de #572 CONFIRME la bit-identité (hash SHA-256 identique sur 481
> mois, sonde prouvée discriminante par perturbation) **et prend en défaut mon CHANGELOG** : le
> 18 % vivait AUSSI dans `setupSimulation.ts`, l'arrondi CELI à 2 endroits d'`utils/tax.ts`.
> **Corrigé dans la même PR** : les 2 jumeaux · la contradiction interne de FISCAL_REFERENCE
> (« 18 % du brut » vs « du GAGNÉ ») · un commentaire disant `??` là où le code fait `||` ·
> et le **trou de garde que j'avais créé** en déplaçant `RRIF_RATE_PLATEAU` vers `helpers.ts`,
> absent de `FISCAL_MODULES` (ajouté, avec `setupSimulation.ts`, + exclusion des opérateurs
> BINAIRES pour ne pas noyer le signal sous le générateur pseudo-aléatoire).
>
> ⚠️ **DEUX findings à impact $ NON corrigés, routés vers `A_FAIRE_MOI`** — je ne peux pas les
> confirmer seul (le proxy BLOQUE `canada.ca`, 403) et un faux fix dans un moteur d'impôt est pire
> que le bug laissé en place :
> - `[FISC-RRIF-94-FACTOR]` — `helpers.ts:95` code `94: 0.2000` ; le prescrit serait 18,79 %
>   (plateau 20 % à 95+). **Mesuré +13 726 $** de patrimoine final. Il faut le règlement 7308(4).
> - `[FISC-RRSP-ROOM-PER-USER]` — droits REER sur le revenu du MÉNAGE au lieu de PAR PERSONNE.
>   **Mesuré 45 000 $ accordés vs 34 480 $ dus** (+10 520 $/an de droits fantômes). Changement de
>   MODÈLE → décision de Marc requise.
> Aussi ticketés : `[FISC-RRSP-RENTAL-EARNED]`, `[FISC-RRIF-FRACTIONAL-AGE]`, `[FISC-REF-DEDUP]`.

> ## 🟢 Session 2026-08-06 (suite 28) — dette fiscale : 3 constantes ancrées (PR #572)
> `[FISC-CONST-ANCHOR-DEBT]` entamé — **3 des 14 entrées `fiscal` résolues**, à commencer par la
> plus nette : `0.18`, le plafond REER de 18 % du revenu GAGNÉ, en dur dans `taxJanuary.ts` sans
> source. Aussi : `500` (arrondi CELI) et `0.20` (plateau FERR 95+, qui échappait au premier scan
> parce qu'écrit en repli `|| 0.20`).
> - Ancrées dans `FISCAL_REFERENCE` (tableau daté + sourcé), exportées depuis la SOURCE UNIQUE
>   (`RRSP_ROOM_RATE`, `CELI_LIMIT_ROUNDING` dans `utils/tax.ts` ; `RRIF_RATE_PLATEAU` dans
>   `helpers.ts`), importées par le moteur.
> - **Refactor à valeurs IDENTIQUES** : gate vert, 3 602 tests, aucun écart numérique.
> - Les 3 entrées d'inventaire du ratchet ont été RETIRÉES — résolues, pas exemptées. C'est ainsi
>   que cet inventaire est censé DÉCROÎTRE.
> **RESTENT 11 entrées `fiscal`** (âges-seuils 65/70/71/72/75/18/15, `2026`, `39`, `40`).
> ⚠️ NE PAS toucher aux entrées `family: 'design'` — les « sourcer » serait une erreur de CATÉGORIE.

> ## 🟢 Session 2026-08-05 (suite 27) — #570 MERGÉE + PROD DÉPLOYÉE + cadrage CHAT-PAGE-CONTEXT-V2
> **#570 mergée** (`3eef577`) et **production Vercel READY dessus** (vérifié) — tout le travail de la
> journée est EN LIGNE. Le quota Vercel s'est débloqué plus tôt que les 24 h annoncées.
> **Bilan : V6 ✅, V7 ✅ (4/4), V8 3/4.**
>
> **Cadrage de `[CHAT-PAGE-CONTEXT-V2]` fait, code NON commencé** — le ticket sous-estime le
> prérequis : `describeViewContextForPrompt` déréférence directement les champs de `BudgetViewDetail`
> sans tester `d.kind`, donc ajouter un membre à l'union CASSE le typecheck. Il faut généraliser le
> constructeur AVANT tout onglet, en préservant PAR MEMBRE les 3 garanties de sécurité du prompt
> (assainissement, encadrement `<DONNEES>`, troncature non muette). Détail dans la fiche BACKLOG.
>
> **EN ATTENTE de Marc** : (1) emplacement de la surface abonnements ; (2) reprise du RÉEE (reverté,
> 7 volets chiffrés). **Dette ouverte** : `[FISC-CONST-ANCHOR-DEBT]` (14 constantes fiscales en dur).

> ## 🟢 Session 2026-08-05 (suite 26) — #569 MERGÉE + abonnements : pouvoir dire NON (PR #570)
> `[SUBS-TAB]` volet « confirmer / ignorer » LIVRÉ. ⚠️ **Le ticket décrivait mal l'existant** : il
> réclamait « une surface dédiée » alors qu'elle vit DÉJÀ dans `Planning.tsx` (section `fixed`),
> avec alertes, totaux et épinglage. Le grep avant de coder a révélé le VRAI manque : rien ne
> permettait de REFUSER un faux positif, qui revenait donc à chaque actualisation.
> - Liste d'exclusion persistée `dismissedSubscriptions`, par CLÉ de marchand normalisée (pas par
>   objet : les montants d'une occurrence bougent). Champ additif + 3ᵉ param à défaut `[]` → aucun
>   bump de schéma, rétrocompat bit-identique (test dédié).
> - Le filtre s'applique AUSSI aux épinglés, dans le module PUR : le handler désépingle en même
>   temps, mais on ne s'y fie pas (un état incohérent venant du Drive se corrige au calcul).
> - « Ne plus jamais » reste VISIBLE et réversible (`<details>` + « Réafficher ») — un refus
>   invisible serait un piège.
>
> ⚠️ **EN ATTENTE de Marc** : il a répondu « sous-onglet de Transactions » pour l'emplacement, mais
> la liste vit dans **Budget**. Je lui ai dit que déménager n'apporte rien au manque réel (livré) →
> **ne PAS coder le déplacement sans go explicite**.
>
> **Reste V8** : `[CHAT-PAGE-CONTEXT-V2]` (file Marc) · `[ASSET-CURRENCY-BACKFILL]` (gaté sur un log).

> ## 🟢 Session 2026-08-05 (suite 25) — #568 MERGÉE (V7 4/4) + V8 démarrée (PR #569)
> **V7 TERMINÉE.** Deux items V8 livrés, même famille : une UI qui promet ce qu'elle ne peut tenir.
> - `[GOAL-DEADLINE-UI]` — l'échéance pilote un décaissement réel et le MCP peut l'écrire, mais
>   rien ne l'affichait → écriture IA invisible et irréversible. Champ date affiché + éditable.
>   S'aligne sur la CHAÎNE VIDE (encodage déjà en place), pas `undefined`.
> - `[PH4C-SAVINGS-NATURE]` — le menu offrait des postes de nature Épargne, qui ne peuvent afficher
>   que « Versé ce mois : 0 » (les virements sont hors `actualsMap`). Retirés de l'offre.
>   ⚠️ **Régression attrapée par son propre test** : le filtre rendait invisible une liaison DÉJÀ
>   posée. Corrigé en distinguant « catégorie disparue » de « nature épargne », les deux restant
>   visibles pour être défaites.
>
> **Reste V8** : `[SUBS-TAB]` (⚠️ **POSER LA QUESTION à Marc** sur l'emplacement de la surface avant
> de coder : onglet propre / sous-onglet Transactions / carte Accueil) · `[CHAT-PAGE-CONTEXT-V2]` ·
> `[ASSET-CURRENCY-BACKFILL]` (gaté sur l'apparition d'un log chez Marc).

> ## 🟢 Session 2026-08-05 (suite 24) — **V7 TERMINÉE (4/4)** : ratchet des constantes fiscales (#568)
> `[FISC-CONST-GUARD-V2]` livré → **V7 est complète**. Le garde ferme le trou par lequel `0.92`
> était passé : une constante fiscale NOUVELLE née dans le moteur, que rien ne comparait à rien.
> - **RATCHET** et non échec dur : 38 littéraux existaient déjà — un échec dur aurait cassé sur 38
>   lignes et aurait été relâché. L'existant est inventorié AVEC SA RAISON, le NOUVEAU échoue.
> - **Le TRI est la valeur** : 3 familles (`fiscal` / `design` / `structural`). Il a révélé `0.18`
>   (plafond REER 18 % du revenu gagné) en dur, à côté d'heuristiques de conception qu'il ne faut
>   surtout PAS « sourcer ».
> - **Le garde a trouvé ce que le tri manuel avait manqué** : `RRIF_RATES[age] || 0.20`, un vrai
>   taux FERR invisible parce que `||` ne ressemble pas à un calcul.
> - Discriminant PROUVÉ par injection de `x * 0.92` dans `taxApril.ts`.
>
> **Dette ouverte : `[FISC-CONST-ANCHOR-DEBT]`** — 14 entrées `fiscal` à ancrer dans
> FISCAL_REFERENCE, par ordre de gravité (`0.18` en tête). ⚠️ NE PAS toucher aux entrées `design`.
>
> **Prochaine vague : V8 — features demandées** (`[SUBS-TAB]`, `[GOAL-DEADLINE-UI]`,
> `[CHAT-PAGE-CONTEXT-V2]`…). ⚠️ Le RÉEE reste REVERTÉ et ne se reprend PAS sans go de Marc.

> ## 🟢 Session 2026-08-05 (suite 23) — #566 MERGÉE + garde chartData (PR #567)
> **#566 mergée** (`d851504`, V7 seul). **`[MCP-CHARTDATA-SUM-GUARD]` livré** : garde de convention
> interdisant de fabriquer un « revenu » en additionnant des flux `chartData` (0 offender aujourd'hui
> → PRÉVENTIF, pour que la correction MCP-RETIREMENT-VERDICT ne soit pas refaite à l'envers).
> Assertion anti-désarmement : chaque champ surveillé doit exister dans `ProjectionChartPoint`.
> **Reste de V7** : `[FISC-CONST-GUARD-V2]` seul — ⚠️ **M et non S** : 25 offenders mesurés, mêlant
> vrais chiffres fiscaux en dur (`0.18` plafond REER, âges 65/71/72) et heuristiques de CONCEPTION
> (`0.95` Guyton-Klinger) à NE PAS traiter comme fiscales ⇒ ratchet + tri vers FISCAL_REFERENCE.

> ## 🔴 Session 2026-08-05 (suite 22) — RÉEE implémenté puis REVERTÉ (panel)
> `[FISC-REEE-GRANT-CLAWBACK]` a été codé (3 poches dérivées), mesuré −20 021 $ sur une fixture de
> fermeture… puis **RETIRÉ de la PR #566** après que DEUX panels indépendants l'aient mesuré **PIRE
> que le bug** sur deux cas courants. Le bug d'origine reste RÉEL ; le ticket est rouvert dans
> `BACKLOG.md` avec le périmètre désormais CHIFFRÉ — **ne pas repartir de zéro**.
> - ⛔ **Solde d'ouverture** : poches à 0 → 100 % d'un RÉEE existant classé revenu imposable →
>   **−31 193 $ à −59 025 $** mesurés. C'est l'erreur nº 2 que le commit prétendait corriger,
>   réintroduite en plus grand.
> - ⛔ **Multi-enfants** : `_childReee` est un solde MÉNAGE, les poches sont par enfant →
>   **+7 890 $ d'impôt fantôme** sur le cadet.
> - ⛔ **Conservation de flux** : `grantsRepaid` n'alimentait aucun registre → résiduel −10 800 $.
> - ⚠️ Assiette ménage (+6 469 $) vs revenu non indexé (−2 614 $) : deux erreurs de sens opposé qui
>   se masquent — exactement ce que le commit reprochait à l'ancien forfait.
>
> **Leçon centrale, portée dans CONVENTIONS** : un gate vert sur 3 574 tests était un vert de
> COUVERTURE, pas de correction — `moneyConservation` tourne avec `childGoals: []` et le fuzz exclut
> le RÉEE. Deux tests discriminants sont déjà identifiés pour la prochaine tentative.
>
> **PR #566 ne contient donc plus que V7** (sync + durcissement OAuth), qui avait passé son propre
> panel (8 findings corrigés).

> ## 🟢 Session 2026-08-05 (suite 21) — #565 MERGÉE + V7 (PR #566) + Marc tranche : RÉEE ensuite
> **#565 mergée** (`3d666b0`, archivage). **V7 livrée à 2/4 (PR #566)** :
> - `[FINTABLE-SYNC-STALE-BASE]` — la sync appliquait ses payloads sur un snapshot d'AVANT le
>   fetch réseau : une saisie manuelle pendant la fenêtre était réécrite et **perdue en silence**.
>   `runFintableBrowserSync` relit l'état (`getFreshState`) juste avant d'appliquer et rend un
>   `statePatch` DÉJÀ calculé — l'appelant ne choisit plus la base, donc ne peut plus se tromper.
>   Côté cron : re-tentative UNIQUE sur conflit OCC au lieu de jeter la passe (= une journée de
>   fraîcheur récupérée). Test discriminant prouvé (échoue sur le code d'avant).
> - `[MCP-CLOUDRUN-AUTH-HARDENING]` — `POST /oauth/authorize` plafonné à 8 ÉCHECS / 15 min
>   (429 + `Retry-After`), compteur GLOBAL et non par IP (`X-Forwarded-For` est spoofable derrière
>   le LB → une clé par IP serait une illusion). Un succès remet à zéro → Marc n'est jamais gêné.
>   Runbook de rotation `FINANCEAI_OAUTH_SIGNING_KEY` écrit dans `mcp/README.md`.
>
> **Panel (code-reviewer + silent-failure + security-privacy) : 8 findings, TOUS corrigés dans la
> même PR.** Le plus instructif était auto-infligé : mon runbook disait « surveille les logs » alors
> que le blocage 429 et le refus 403 n'écrivaient AUCUNE ligne. Aussi : plafond réel `8 × max-instances`
> (=16, `deploy.sh --max-instances 2`) corrigé dans la doc ; `curl` du runbook sans `--data ''`
> (→ 411 au lieu de 401, faux négatif) ; test du chemin de SUCCÈS du retry OCC ajouté (l'ancien test
> faisait échouer `save` à chaque appel, donc un retry à version périmée restait vert — prouvé par
> injection) ; test de `getFreshState` qui lève ; rôles Fintable toujours lus pré-fetch, nommé en
> commentaire au lieu de rester un résiduel silencieux.
>
> **⚠️ MARC A TRANCHÉ (2026-08-05) : « vague suivante pour régime épargne-étude »** →
> `[FISC-REEE-GRANT-CLAWBACK]` est la PROCHAINE vague, **contre** la reco de différer. Des enfants
> sont donc au programme : ne PAS re-proposer de reporter, ne pas ré-argumenter le 0 $ mesuré.
> Plan-first (modélisation en 3 poches : capital / SCEE+IQEE / revenus accumulés ;
> `childrenReee.ts:327` verse aujourd'hui 100 % du solde à la fermeture, les trackers de
> subventions ne sont jamais décrémentés).
>
> **Restent de V7, déprioritisés avec leur périmètre MESURÉ** (fiches BACKLOG à jour) :
> `[FISC-CONST-GUARD-V2]` — **25 offenders mesurés**, mêlant vrais chiffres fiscaux en dur
> (`0.18` plafond REER, âges 65/71/72) et heuristiques de CONCEPTION (`0.95` Guyton-Klinger) à ne
> PAS traiter comme fiscales ⇒ c'est un RATCHET + un tri, taille réelle **M et non S** ;
> `[MCP-CHARTDATA-SUM-GUARD]` — **0 offender aujourd'hui** (vérifié), prévention pure, le moins
> urgent du lot.

> ## 🟢 Session 2026-08-05 (suite 20) — #564 MERGÉE + rattrapage d'archivage
> **#564 mergée** (`191d5c0`). **6 items ARCHIVÉS** (retard rattrapé — ils étaient mergés sans
> avoir été déplacés, exactement la dérive PM-STALE-BACKLOG que la règle interdit) :
> [MCP-NETINCOME-MISLEADING] #560, [FINTABLE-STALE-ALERT] #561, [ENG-TAXDEC-NAN-GUARD] +
> [ENG-TAXDEC-FLOOR-INDEX] #563, [FISC-STACK-GAINS-DIV] + [FISC-DTC-ABATEMENT-ORDER] #564.
> **V6 : 2/4 livrés.** Restent `[FISC-REEE-GRANT-CLAWBACK]` — CONFIRMÉ contre le code
> (`childrenReee.ts:327` verse 100 % du solde à 25 ans ; les trackers SCEE/IQEE existent mais ne
> sont jamais décrémentés par les retraits d'études → modélisation en 3 poches à faire) mais
> **mesuré 0 $ sur le profil de Marc** (`reee: 0`, aucun objectif d'études) → question posée à
> Marc : le coder maintenant ou passer à V7 ? Reco donnée : V7 — et `[FISC-TAXDEC-INCR]` reste
> gaté sur son go (A_FAIRE_MOI).
> **Suite proposée si Marc ne tranche pas : V7 — sécurité serveur + sync** (
> [MCP-CLOUDRUN-AUTH-HARDENING] + [MCP-CHARTDATA-SUM-GUARD] + [FINTABLE-SYNC-STALE-BASE] +
> [FISC-CONST-GUARD-V2]) : ça touche ce que Marc utilise tous les jours.
>
> ## 🟢 Session 2026-08-05 (suite 19) — #560 MERGÉE (`2f05622`) + FINTABLE-STALE-ALERT (PR en cours)
> **#560 mergée** (netSalaryIncome ; archivée). **En cours : `[FINTABLE-STALE-ALERT]`** — l'import
> gelé devient VISIBLE. Module PUR `services/fintable/syncHealth.ts` (ok/stale/error/never) partagé
> UI + MCP (source unique — la divergence est exactement ce qui a produit #560 le même jour).
> ⚠️ **Seuil ADAPTATIF, pas fixe** : un seuil de 7 j n'aurait alerté Marc qu'à J+8 alors qu'il a
> vu le gel à J+5 (mesuré → l'alerte serait arrivée APRÈS lui, donc inutile). Dérivé de la cadence
> réelle (médiane des écarts entre jours d'activité × 3, borné 3–14 j) : son profil quotidien
> donne 3 j → alerte à J+4. Livré : `SyncStaleBanner` (Accueil ; muette en démo et si l'import
> n'a JAMAIS été configuré) + `syncHealth` dans `get_financial_overview` (ce qui manquait pour
> diagnostiquer à distance) + deep-link Réglages (la section `fintable-` n'existait pas dans
> `subTabForSection` → bouton qui n'aurait mené nulle part, corrigé). 14 tests.
> Pièges attrapés au passage : `Tab.Settings` n'existe pas (c'est `SETTINGS`) et `min-h-touch`
> n'est pas dans tailwind.config.js (no-op silencieux) — les deux pris par typecheck/grep.
> ✅ **BOUCLE FERMÉE 15:03 UTC — Marc : « jeton marche ».** Vérifié côté serveur : les 5 jours
> manquants sont RATTRAPÉS (11 transactions 2026-07-31 → 2026-08-05). `[FINTABLE-TOKEN-PERSIST]`
> (#559) est validé EN CONDITIONS RÉELLES ; l'hypothèse « fin d'essai Fintable » est définitivement
> réfutée (l'import reprend sans toucher à l'abonnement). A_FAIRE_MOI : les 2 actions Fintable de
> Marc sont cochées, plus rien ne l'attend sur ce sujet.
>
> **Panel #561 (2 agents) : NO-GO levé, 6 findings traités.** silent-failure : #2 rapport non écrit
> sur exception dans handleSync (prérequis de la feature cassé) → CORRIGÉ ; #1 provenance des
> transactions → ticket `[FINTABLE-SOURCE-TAG]` + LIMITE documentée dans le module (un CSV manuel
> peut masquer un connecteur mort — même vert trompeur, autre porte). code-reviewer : #1
> `Math.max(...)` crashait > 125 k transactions et tombait TOUT l'onglet → boucle ; #2 le plancher
> de 3 j ne protégeait de RIEN (démonstration algébrique : les écarts entre jours sont ≥ 1 donc
> ceil(médiane×3) ≥ 3 déjà) → **p90 × 2, plancher réel 4 j** ; #3 région live insérée avec son texte
> = violation d'une convention MAISON (#245, WCAG 4.1.3) que ProjectionStaleBanner respectait sur
> la même page → montage permanent ; #4 la cadence affichée était re-dérivée du seuil clampé
> (chiffre inventé, répété par l'assistant via MCP) → `observedGapDays` réel exposé. 18 tests.
> **Demande Marc 15:33** : « avec la version payante je devrai pouvoir importer beaucoup plus de
> transactions » → ⚠️ vérifié dans le code : `deriveCutoverDate` fixe la bascule à la transaction la
> plus RÉCENTE, donc **aucun historique ancien ne rentrerait**, plan payant ou pas. Ticket
> `[FINTABLE-BACKFILL-HISTORY]` créé (passe de backfill séparée + dédoublonnage via
> `findDuplicateGroups`, déjà écrit et testé). Money-critical : jamais d'écriture sans dédoublonnage.
>
> ## 🟢 Session 2026-08-05 (suite 19) — V6 fiscal : deux sous-impositions du placement (PR #564)
> **#563 mergée** (`b3477df` : tickets Fintable + [ENG-TAXDEC-NAN-GUARD] + [ENG-TAXDEC-FLOOR-INDEX]).
> **V6 en cours (PR #564)** : [FISC-STACK-GAINS-DIV] (gains et dividendes empilaient chacun leur
> bande depuis le revenu NU → bande commune facturée 2× au taux bas ; empilement SÉQUENTIEL
> désormais, additivité exacte au cent : +815,41 $/an) + [FISC-DTC-ABATEMENT-ORDER] (le CID
> FÉDÉRAL est soustrait AVANT l'abattement QC 16,5 %, comme le BPA → valeur effective 12,5415 %
> du majoré, pas 15,0198 % : +256,50 $/an). **Effet combiné ~1 072 $/an** sur un profil à gros
> non-enregistré, sens conservateur.
> ⚠️ **Panel #564 — financial-integrity a VALIDÉ le fix CID contre les tables publiées** : taux
> marginal max dividende admissible **40,11 %** et non admissible **48,70 %**, identiques à RQ/ARC
> 2026 (avant : 36,69 % / 46,98 %, soit −3,42 pp et −1,71 pp). C'était le point que je lui avais
> demandé de RÉFUTER — il est confirmé, chiffres à l'appui. Ses findings F1-F6 traités dans la PR
> (FISCAL_REFERENCE §3 mis à jour — il revendiquait « 0 écart code↔doc » ; attribution du golden
> meltdown corrigée : les −40,30 $ viennent à 100 % du CID, [FISC-STACK-GAINS-DIV] est NEUTRE sur
> cette fixture ; commentaires à valeurs périmées ; `QC_FEDERAL_ABATEMENT_RATE` EXPORTÉ et importé
> par les tests au lieu d'être re-codé en dur). F7 → ticket `[FISC-BAND-AGE-CREDITS]`
> (préexistant, −648 à −675 $/an : les bandes incrémentales ignorent les crédits 65+/pension).
>
> ## 🟢 Session 2026-08-05 (suite 18) — #559 MERGÉE (`bbd6bda`) + MCP-NETINCOME-MISLEADING (PR en cours)
> **#559 mergée** (jeton Fintable persisté ; archivée). **En cours : `[MCP-NETINCOME-MISLEADING]`**
> — né d'une ERREUR que j'ai commise et que MARC m'a fait re-vérifier : j'avais comparé le
> `netIncome` du tool fiscal (qui inclut 12 970 $ de rendement de placement ESTIMÉ, non encaissé)
> à ses dépôts de paie réels, et annoncé un salaire surestimé de 12 800 $/an — FAUX. Vrai écart :
> 4 491 $/an, expliqué par la progression de ses paies (368→839 $/sem sur l'année) ; son 60 000 $
> saisi est bon à 2,4 % près au rythme actuel (brut impliqué 58 568 $). Fix livré :
> `netSalaryIncome`/`netSalaryMonthly` (brut − impôt − cotisations) = la trésorerie réelle,
> validée à 0,5 % contre 12 mois de dépôts ; note du tool avertit explicitement ; test
> discriminant. Leçon CONVENTIONS (agrégat non étiqueté → faux diagnostic, y compris chez Claude).
> ⚠️ Mesuré aussi : `[FISC-SOLO-INVEST-SPLIT]` vaut **0 $** pour Marc (mode SOLO — le split 1/2
> ne mord qu'en couple mono-salarié, 2 342 $/an) → NE PAS le prioriser ; `[FINTABLE-STALE-ALERT]`
> passe devant (né de l'incident réel).
>
> ## 🟢 Session 2026-08-05 (suite 17) — #558 MERGÉE (`14e079a`) + FINTABLE-TOKEN-PERSIST (PR en cours)
> **#558 mergée** (squash `14e079a`, auto-merge après panel 4 agents + findings traités).
> **[FINTABLE-TOKEN-PERSIST] (PR en cours, priorité Marc)** : cause racine de l'import gelé
> trouvée par MARC — le jeton Fintable n'était jamais persisté (setAppState mémoire, jamais
> saveApiKeys). Fix : persistance dans le coffre chiffré (blur + avant Tester/Sync), échec
> affiché ; 3 tests (blur / ceinture bouton / échec visible — discriminants par construction).
> La piste « fin d'essai Fintable » était un leurre de timing (leçon CONVENTIONS : trajet
> complet d'un secret + corrélation ≠ cause).
> ⚠️ **Panel #559 (2 agents) : NO-GO des DEUX, convergents — le fix violait sa propre leçon.**
> Le blur seul laissait 3 chemins rouvrant le symptôme (fermeture/navigation/autofill sans blur ;
> échec de coffre écrasé par l'erreur réseau et jamais logué ; écritures concurrentes non
> ordonnées) + 1 régression UX (le succès masqué par l'erreur de persistance). TOUT corrigé dans
> la PR : flush `visibilitychange`/`pagehide`/démontage, canal d'alerte SÉPARÉ (`persistError`,
> régions ARIA nommées) + `logError`, sérialisation par chaîne de promesses, test `handleSync`.
> 15 tests (7 nouveaux). Méta-leçon aux CONVENTIONS. Marc devra RE-COLLER son jeton une fois après
> déploiement + vérifier son abonnement Fintable (A_FAIRE_MOI). [FISC-WHT-92PCT] archivé.
> Suite : [FISC-SOLO-INVEST-SPLIT] (Q3, GO) puis V5 gatés sources.
>
> ## 🟢 Session 2026-08-01 (suite 16) — #556 MERGÉE (`16e9e9d`, Vercel prod READY) + V5d : FISC-WHT-92PCT
> **#556 mergée** (squash `16e9e9d`, prod déployée). **V5d livrée (PR en cours)** : retenue
> employeur 100 % (`[FISC-WHT-92PCT]`, GO Marc Q2) — l'ancien ×0,92 non sourcé facturait ~8 % de
> l'impôt salarial en double chaque avril. Mesuré avant/après : salarié référence ttp
> 106 915 → 57 723 (−1 243,23 $/an réel = exactement les 8 %), NW +13,7 % ; retraités
> BIT-IDENTIQUES (branche phase active seulement). Discriminant dédié
> `projection.whtSettlement.test.ts` ; goldens re-basés : returnProfile (+7 %), bracketRealIndex
> (pin niveau 2 702→1 459, constance intacte), totalTaxesPaid (pin salarié −17 160→−23 553).
> ⚠️ Leçon (CONVENTIONS) : le fix a TUÉ l'observable de 4 gardes (complément 8 % ≡ 0) →
> réancrées sur le canal survivant (remboursement des déductions, RAMQ familiale, asymétrie
> crédit d'âge), jamais supprimées. [FISC-BRACKET-REALINDEX] archivé (BACKLOG_ARCHIVE).
> **Panel #558 (4 agents, tous traités)** : GO ×3 + NO-GO silent-failure RÉSOLU dans la PR —
> plancher −100 000 $ journalisé (2 sites) + test plancher réancré sur un cas qui l'exerce
> (ablation prouvée) ; garde FA-10 fantôme re-réancrée SOUS la saturation RAMQ (2e ordre,
> leçon CONVENTIONS) ; preuve d'auto-cohérence + TP-1015.F/T4032-QC au FISCAL_REFERENCE ;
> « retraités bit-identiques » restreint (branche inchangée, actif→retraite bouge +21,5 % NW) ;
> invariant T1213 ON ≡ OFF sans déductions ajouté (survit aux re-bases). Tickets ouverts :
> [ENG-T1213-NET-MONTHLY] (T1213 annule le REER, −183 k$/30 ans, PRÉ-existant),
> [ENG-TAXDEC-FLOOR-INDEX], [ENG-TAXDEC-NAN-GUARD], [ENG-NET-MODEL-RESIDUAL].
> **Incident Fintable (Marc, 2026-08-05)** : import gelé depuis le 2026-07-31 — cause RACINE
> trouvée par Marc : son jeton Fintable N'ÉTAIT PAS PERSISTÉ (la sync tournait « jeton absent »).
> Demande explicite : le sauvegarder comme les clés API (IDB chiffré). → PROCHAINE PR après le
> merge de #558. Tickets [FINTABLE-STALE-ALERT] + actions A_FAIRE_MOI (plan payé ? carte Réglages).
> Suite V5 : [FISC-SOLO-INVEST-SPLIT] (Q3, GO) puis GIS/LINE361/CREDITRATE (gatés sources).
>
> ## 🟢 Session 2026-08-01 (suite 15) — PR #556 : panel traité, latentTax corrigé, ready+auto-merge
> Panel #556 rendu (projection-validator + financial-integrity, tous deux MESURÉS) : cœur du fix
> confirmé (homogénéité exacte à 1e-9, conservation 0,02 $, rétrocompat bit-identique). 3 findings
> traités dans la PR : (1) **site oublié `latentTax.ts`** — même motif déflaté-sans-deflator, impôt
> latent affiché sous-évalué ~53 k$/−35 % à 30 ans → corrigé (8e arg `realDeflator`), discriminant
> unitaire d'homogénéité prouvé (échoue pré-fix) ; (2) **claim « retenue sur-évaluée » RÉFUTÉ par
> mesure** (elle MONTE ; la vraie cause du NW salarié ↑ = prime RAMQ/FSS doublement indexée ×1,81 à
> 30 ans qui redescend, + artefact 92 %) → CHANGELOG/CONVENTIONS/commentaire de test réécrits ;
> (3) doc FISCAL_REFERENCE corrigée (latent + taxJanuary sont RÉELS, exception crédit pension
> 2 000 $ notée). Nouveaux tickets : [FISC-PENSION-CREDIT-REAL] (GO Marc, re-base goldens),
> [FISC-BRACKET-CPI-STRESS] (décision modèle i≠2 %), [FISC-MARGINAL-SPACE]. Suite V5 :
> [FISC-WHT-92PCT] 0.92→1.0 (GO) → [FISC-SOLO-INVEST-SPLIT] (GO) ; puis ENG-TTP-UNSETTLED-PROPAGATE,
> ENG-RANKING-ORDER-PIN (baseline mesurée dispo).
>
> ## 🟢 Session 2026-08-01 (suite 14) — #555 MERGÉE + V5c : FISC-BRACKET-REALINDEX (CRITIQUE)
> **#555 mergée** (`22d128a`). **V5c livrée** : `realDeflator` (défaut 1 = bit-identique) sur
> `getIndexedBracketsForYear` + dérivés (paliers, BPA, crédits d'âge/361, RAMQ, FSS,
> getMarginalRate, calculateFiscalReport) ; passé par les sites RÉELS de taxDecember
> (salarial ×4, combinedTaxFor, RAMQ, FSS) **+ latentTax (ajouté au panel #556)** —
> gains/dividendes sont NOMINAL-cohérents (documenté en
> code, leur passer le deflator = bug inverse). Discriminant 5/5 (impôt réel CONSTANT 2 702 $/an à
> revenu réel constant ; dérivait à 3 235 $). Direction PAR PHASE : retraité ttp +62 %
> (29 806 → 48 314, conservateur) ; salarié NW +0,8 % (cause mesurée par le panel : RAMQ/FSS
> doublement indexées redescendent — PAS la retenue, cf suite 15).
> 10 goldens re-basés SCIEMMENT (item2c, meltdownDisplay ~−10,8 k$ NW, returnProfile +0,8 %,
> totalTaxesPaid). Archivés : #553/#554/#555 dans BACKLOG_ARCHIVE. Suite V5 : [FISC-WHT-92PCT]
> 0.92→1.0 (GO) → [FISC-SOLO-INVEST-SPLIT] (GO) ; puis tickets panel (ENG-TTP-UNSETTLED-PROPAGATE,
> ENG-RANKING-ORDER-PIN — baseline mesurée dispo).
>
> ## 🟢 Session 2026-08-01 (suite 13) — #554 MERGÉE + V5b : unsettledTaxAtHorizon
> **#554 mergée** (auto-merge squash `acfa035`). **V5b** : `unsettledTaxAtHorizon` (photographié à
> la réconciliation de décembre — ≡ taxPreviousYear, transfert dans le MÊME bloc, contre-vérifié
> #555 ; remis à 0 à l'avril) + `strategySearch.lifetimeTax` l'additionne + étiquette « Régularisations d'impôt
> (net) » + tickets [ENG-RANKING-ORDER-PIN]/[ENG-RANKTAX-ESTATE] (décision produit à poser).
> ⚠️ Leçon : la magnitude de l'audit (−49 %) était en BRUT — le NET réel (= débit d'avril
> manquant) : 8,6 % solvable 10 ans, 171,89 $ sur la fixture FERR. Re-mesurer le CORRECTIF d'un
> agent, pas seulement son diagnostic. Suite V5 : [FISC-BRACKET-REALINDEX] (GO, PR dédiée) →
> [FISC-WHT-92PCT] → [FISC-SOLO-INVEST-SPLIT].

> ## 🟢 Session 2026-08-01 (suite 12) — #553 MERGÉE + V5a : PROJ-TTP-DOUBLECOUNT corrigé
> **#553 mergée** (auto-merge squash — l'API l'accepte quand le statut Vercel est vert). **V5a
> livrée** : `totalTaxesPaid` = Σ FluxImpots SEUL (avril débite le bucket .reer entier — retenues
> cascade/meltdown/FERR — + le complément de décembre : les additionner re-comptait les mêmes
> dollars, +144 % mesuré). Identité vérifiée au cent sur 3 scénarios + salarié, NW bit-identique
> (5 scénarios git-archive), ratio MELT/AUTO honnête 4,42 — ⚠️ l'ORDRE du ranking CHANGE (voulu :
> l'ancien reposait sur le double-comptage ; balanced best bascule sur retraité 62). Re-basés
> SCIEMMENT : goldens ITEM-2C (tax seul, nw/ferr intacts) + test WHT-tiered repointé sur le flux
> ImpotRetraitREER (le taux de retenue n'influence plus le compteur — décembre réconcilie).
> Suite V5 : [FISC-BRACKET-REALINDEX] (GO Marc, L, ~12 goldens — PR dédiée), [FISC-WHT-92PCT]
> 0.92→1.0, [FISC-SOLO-INVEST-SPLIT]. [PROFIL-SWITCH] toujours gaté sur les 4 questions Marc.

> ## 🟢 Session 2026-08-01 (suite 11) — #552 MERGÉE + V4 vie privée (3/4)
> **#552 mergée** (squash `32a112f`, merge direct — l'API auto-merge refusait sur le statut Vercel
> non-requis « unstable » ; CI 6/6 verte). Branche réconciliée, items #551/#552 ARCHIVÉS dans
> BACKLOG_ARCHIVE. **V4 livrée aux 3/4** : [SEC-GA-DEFER-CONSENT] (script gtag injecté seulement
> au consentement — ensureGtagLoaded + ga-init gaté), [D6-PRIV-MONTANTS] (PrivateSliderValue :
> masqué au repos, révélé au focus — TaxCenter ×2, ChildPlanning, DebtManager), [HIST-STORE-SIZE]
> (downsamplePriceHistory > 365 j → 1 pt/sem, idempotent, appliqué après mergePriceHistories).
> [PROFIL-SWITCH] GATÉ sur 4 questions posées à Marc (persistance des vraies données — voir 🧭
> du BACKLOG). Suite : V5 fiscal (TTP-DOUBLECOUNT → BRACKET-REALINDEX GO → WHT-92PCT → SOLO-SPLIT).

> ## 🟢 Session 2026-07-31 (suite 10) — PR #552 : V2'+V2''+V3 + findings panel + héritage
> **PR #552** (draft → ready) porte : V2' (bien passé détenu), V2'' (FERR/goals visibles dans
> RetraitREER), V3 complète (DEFAULTS-DRIFT 4 champs + garde bidirectionnelle, TEST-GAP ×3, PV-11e,
> NW-PARITY-SURFACES, PDF equity réelle), **[ENG-HERITAGE-INFLOW]** (bug rapporté par Marc : un
> héritage était DÉBITÉ comme dépense — branche +liquide non imposable, 4 tests discriminants
> prouvés par stash), et le **commit findings du panel 4 agents** (tout MESURÉ) : graine
> prevNW/minNetWorth ensemencée de l'équité passée (flux fantôme +156 629 $ et plancher −158 731 $
> corrigés), substitution loyer↔PMT neutre au boot (sur-charge 20 084 $/an), champs explicites
> honorés par le MOTEUR (écart Accueil↔Futur 291 676 $), sanitisation immo à la frontière (968
> non-finis), garde non-fini DANS presentEquityOfGoal (3 consommateurs couverts), équité historique
> PAR ANNÉE au graphe Accueil (+77 097 $ sur 2022), log « supposée DÉTENUE » au m0, docs
> PROJECTION/OUTPUT_SCHEMA. Nouveaux tickets : [ENG-RENEWAL-RATE-MISMATCH] (ÉLEVÉ pré-existant),
> [ENG-PAST-OWNED-VS-PLANNED] + [UX-ISACTIVE-SEMANTIQUE] (décisions Marc), [IMMO-3-FORMULES],
> [ENG-PROPGROWTH-ZERO], [ENG-NETTRANSFER-REER-INCOMPLET], [ENG-RENEWAL-M0], [ENG-CELIAPP-RESIDUAL].
> ⚠️ Vercel rate-limité (100 deploys/jour, plan gratuit) — le deploy PROD au merge échouera ~24 h,
> la prod reste sur le dernier déploiement réussi ; le statut Vercel n'est PAS un check requis.
> Suite : merge #552 → archiver les items livrés → V4 (PROFIL-SWITCH, D6-PRIV, GA-CONSENT,
> HIST-STORE-SIZE) → V5 fiscal (TTP-DOUBLECOUNT, BRACKET-REALINDEX GO, 0.92→1.0, SOLO-SPLIT).

> ## 🟢 Session 2026-07-31 (suite 9) — V2' : un bien PASSÉ est DÉTENU (moteur + KPI)
> Racine du ticket DASH-IMMO-EQUITY-WRITERS (décision Marc « brancher ») : le moteur traitait un
> `purchaseDate` passé comme un achat À FAIRE (re-débit de la mise de fonds au m0, ou « Achat
> reporté » à l'infini → le Futur perdait la maison, Immobilier = 0 mesuré). Nouveau
> `services/projection/pastPurchaseInit.ts` (pur, conventions moteur : SCHL + PMT origine + solde
> amorti + valeur appréciée) branché sur l'init moteur ET le KPI Accueil (F4 : isActive, gate
> équité ≠ 0, non-fini tracé). 11 tests + discriminant + conservation 20/20 + fuzz + personas verts.
> ⚠️ Sémantique : les personas/fixtures à bien passé voient leur NW BOUGER (voulu — avant ils
> perdaient ou re-payaient la maison).

> ## 🟢 Session 2026-07-31 (suite 8) — V1 (PR #549) + V2 meltdown honnête
> **V1 mergée (#549)** : clamp CELIAPP signalé, étiquettes « dernier close » Accueil, clamps MC
> (bug FVI « 103/100 » réel corrigé — mesuré), note CAGR, esbuild épinglé, 8 shades hors palette,
> filtres morts Transactions, FISCAL_REFERENCE 3ᵉ passe, Dependabot #26 (hono 2.0.12). Panel 3
> agents : tous findings traités (taxLeakage SANS cap haut — un ratio > 1 en décaissement est une
> info réelle ; bornes sliders TaxCenter = constantes fiscales). **V2 LIVRÉE (PR #551)** : le meltdown REER
> alimente `retraitReerMois` (exact au dollar : 794 303 $ = sorties réelles) + `rrspWithholdingMois`
> (convention cohérente entre stratégies — la reco « objectif impôt » était FAUSSE sur main, corrigée,
> mesuré par 2 agents). NW bit-identique prouvé + pinné par golden. Panel : 2 tickets racine ouverts,
> [PROJ-TTP-DOUBLECOUNT] (le compteur double-compte la retenue pour TOUTES les stratégies, « Impôt à
> vie » +144 %) et [ENG-FERR-FLOW-INVISIBLE] (FERR/goals invisibles, 4ᵉ source). **Marc a répondu aux 14 questions** (toutes les
> vagues débloquées). Suite : V2' équité immo (BRANCHER) → V3 parité état/tests → V4 → V5 fiscal
> (paliers GO, 0.92→1.0, split GO) → … → V12 (nav + Budget : GROS batch de questions d'abord).

> ## 🟢 Session 2026-07-31 (suite 7) — REFONTE DU BACKLOG (directive Marc) + 3 analyses
> **Directive Marc** : cases cocheables partout, archive, vérif de tout, PM (ordre/utilité), grosse
> analyse code, analyse fiscale, puis TOUT exécuter sans s'arrêter. Livré (PR #548) :
> `docs/BACKLOG_ARCHIVE.md` (contenu pré-refonte + note de vérification) + `BACKLOG.md` refondu
> (~60 items vivants, 100 % cases, plan en 12 vagues) + règle CLAUDE.md. Vérification : ~180 items
> confrontés au code (2 agents) — ~65 FAITS non cochés archivés, 12 obsolètes, 11 coupés par le PM.
> **Analyse fiscale (MESURÉE)** : `[FISC-BRACKET-REALINDEX]` CRITIQUE (double indexation des paliers
> → impôt réel fond de 8 192 $/an/pers à l'an 30, patrimoine/FIRE optimistes — fusionne avec ITEM-2A,
> gaté Q1) ; `[FISC-WHT-92PCT]` (0.92 non sourcé → ~3 600 $/an sur-facturés au couple, Q2) ;
> `[WHT-DISPLAY-MELTDOWN]` requalifié ÉLEVÉ (le ranking de stratégies pèse un impôt sous-compté ×2,6)
> + `[ENG-MELTDOWN-FLOW-INVISIBLE]` (774 k$ de retraits absents des flux affichés) ; SRG couple 2×
> trop rapide ; NONREG-LOSS requalifié timing-only. **Analyse code** : `[DEFAULTS-DRIFT-FINTABLE-FIELDS]`
> (4 champs invisibles au chat/MCP, garde-test unidirectionnel) + 3 TEST-GAP + 8 shades hors palette +
> esbuild non déclaré + filtres Transactions morts. **Questions Marc posées en un lot (13+3)** —
> V5/V12 gatées dessus ; exécution des vagues non gatées EN COURS (V1 d'abord).

> ## 🟢 Session 2026-07-31 (suite 6) — `[PERF-SDK-BOOT-PRELOAD]` (perf, file Marc)
> **Boot −54 Ko gzip (225,6 → 171,6, −24 %), mesuré git-stash avant/après.** Le ticket accusait les
> onglets lazy — la VRAIE chaîne (tracée par walker d'imports statiques depuis index.tsx) était
> `TabRouter → PageSetupGate → PayslipUploadCard → claude.ts → SDK`. Fix : makeClient ASYNC (SDK via
> importWithRetry au 1er usage), PayslipUploadCard lazy dans le gate, et ⚠️ retrait des manualChunks
> `ai-vendor`/`pdf-vendor` — **un manualChunk atteint seulement par import() devient EAGER** (leçon
> CLAUDE.md, prouvée 2× : pdf-vendor est apparu dans le preload dès le retrait de la règle SDK).
> Preload final : react-vendor + cœur seulement. Reste perf : HIST-STORE-SIZE (à mesurer).

> ## 🟢 Session 2026-07-31 (suite 5) — petits a11y (Lot E de la file Marc)
> `[A11Y-INFO300-SWEEP]` : 13 `text-info-300` (shade INEXISTANT → aucune règle CSS, texte héritant du
> parent) → `info-400`, MESURÉ check-contrast (6,99-7,84:1 AA) + preuve build propre (`.text-info-300`
> absente du CSS). `[A11Y-DETAILS-TAP-TARGET]` : `py-1.5` sur les 5 `<summary>` sans padding vertical
> (WCAG 2.5.8 ; 4 autres en avaient déjà). `[A11Y-FUTUR-MILESTONES-KEYBOARD]` reste au backlog — le
> ticket exige de TRANCHER AVEC MARC (focusabiliser ~29 pastilles vs contrôle clavier alternatif,
> impact sur le pattern « clic n'importe où »). **Suite** : perf (PERF-SDK-BOOT-PRELOAD, HIST-STORE-SIZE
> à mesurer) → chat conscient de la page (V2/V3) → gros chantiers.

> ## 🟢 Session 2026-07-31 (suite 4) — `[FINTABLE-7]` Lot 3 (Lot D de la file Marc)
> Sync bancaire AUTO à l'ouverture, 1×/jour : `services/fintable/autoSync.ts` (gardes jeton/mode
> test/24 h-succès/cooldown-tentative 1 h/mutex), effet App RÉACTIF au jeton hydraté (un timer au
> boot lirait un store vide), `referenceDeltaPatch` extrait de la carte vers
> `services/fintable/applyStatePatch.ts` (partagé, une seule copie). Échec → rapport seul persisté,
> pas de toast quotidien anxiogène ; succès → toast compte-seulement. **Panel #545 : 5 vrais findings
> corrigés** — verrou partagé auto↔manuel (CRITIQUE), TOCTOU mode démo prouvé par sonde (re-check
> frais avant toute écriture, les 2 chemins), jeton Fintable SEUL jamais restauré du coffre (`App.tsx`
> gate `anthropic||finnhub` → `||fintable`), catch + rapport d'échec (« ne lève jamais » tenu),
> debounce 3 s. Résiduel assumé → ticket `[FINTABLE-SYNC-STALE-BASE]` (sync vs édition concurrente,
> base figée ; cooldown non cross-onglet). **File restante** : petits a11y
> (A11Y-INFO300-SWEEP, A11Y-DETAILS-TAP-TARGET, A11Y-FUTUR-MILESTONES-KEYBOARD) → perf
> (PERF-SDK-BOOT-PRELOAD, HIST-STORE-SIZE) → chat conscient de la page (V2/V3) → gros chantiers.

> ## 🟢 Session 2026-07-31 (suite 3) — `[DASH-NETWORTH-CANONICAL]` (Lot C de la file Marc)
> « Je veux source unique » : le KPI patrimoine de l'Accueil lisait `latestTotals.Total` (dernier
> point de l'HISTORIQUE — figé au dernier close, cash gated `accountName`) → il lit désormais
> `computePresentNetWorth + équité immo` (même expression que l'ex-repli sans CSV) dans TOUS les cas ;
> `latestTotals` retiré (code mort). Le graphe/variation restent sur l'historique (présent ≠ histoire).
> Discriminant : historique périmé injecté (mock `usePortfolioHistory` à identité STABLE — ⚠️ un mock
> qui fabrique un nouvel objet par appel relance `useEffect([portfolioHistory])` en boucle et PEND le
> test, classe CHAT-PAGE-CONTEXT « dédupe par référence », vécue ici). Symptômes 2-3 du ticket
> (périmètre graphe/cartes historiques) : hors de ce fix, chantier séparé si redemandé.

> ## 🟢 Session 2026-07-31 (suite 2) — `[FINTABLE-6]` Lot 2 (Lot B de la file Marc)
> Lot A (bannière sync) MERGÉ (#542). Lot B livré : `BrokerReconciliationCard` (full/compact —
> une implémentation) branche `reconcileBrokerBalances` dans Investissements ET Accueil : total par
> panier = solde COURTIER (autorité), écart explicite reconstructible, fraîcheur bornée par le compte
> le plus ancien, comptes non déclarés/illisibles signalés. `holdingsCadByRegime` dérive la famille
> fiscale de `BUCKET_OF` (source unique) + `assetValueCad`. Ship dark sans sync Fintable.
> **File restante** : DASH-NETWORTH-CANONICAL (Lot C, « source unique ») → FINTABLE-7 Lot 3 (sync
> auto 1×/jour) → a11y → perf → chat-page-context → gros chantiers.

> ## 🟢 Session 2026-07-31 (suite) — `[AUTH-DRIVE-BANNER-FLICKER]` (Lot A de la file Marc)
> **Marc a relancé** : « la bannière rouge apparaît souvent, parfois elle s'enlève seule, parfois faut
> que je me connecte ». Cause trouvée dans `syncLifecycle.runBootSync` (appelé toutes les 60 s par le
> polling + au focus) : il basculait `connected:false` sur TOUTE erreur post-jeton (timeout Drive
> transitoire, réveil de veille) et dès le 1er raté du renouvellement silencieux → bannière-mensonge
> qui disparaissait au tick suivant. **Fix** : (1) jeton valide + erreur Drive non-401 → on RESTE
> connecté (`handleError('boot')`, visible Diagnostics) ; (2) raté transitoire du renouvellement →
> grâce de 3 ticks (~2 min, `_transientAuthFailStreak`) ; (3) définitif (`AuthInteractionRequiredError`,
> 401 `DriveAuthError`) → bannière immédiate + `busy:false` (sinon polling gelé). Discriminant prouvé
> par git-stash (4 tests rouges sur l'ancien code, `syncOrchestrator.errors.test.ts`). ⚠️ Le mock
> `gisAuth` du test passphrase a reçu `AuthInteractionRequiredError` + `renewTokenSilently` (leçon
> AUTH-DRIVE-INACTIVITY : un import non mocké = TypeError). **Panel #542, 2 vrais findings corrigés** :
> verrou de réentrance `_bootSyncInFlight` (focus+visibilitychange = 2 ticks concurrents → compteur +2
> pour UN alt-tab, prouvé par sonde) et grâce étendue aux erreurs Drive post-jeton persistantes (3 ticks
> ratés toutes causes → bannière, sinon une panne durable restait invisible hors Réglages). Fenêtre
> `flushPush`-pendant-grâce assumée + documentée (zéro perte, le prochain boot pousse). **File restante de Marc (dans l'ordre)** :
> FINTABLE-6 Lot 2 (montant courtier + écart dans Investissements/Accueil) → DASH-NETWORTH-CANONICAL
> (« je veux source unique ») → FINTABLE-7 Lot 3 (sync auto 1×/jour à l'ouverture) → petits a11y →
> perf → chat conscient de la page → gros chantiers.

> ## 🟢 Session 2026-07-31 — `[TX-REVIEW]` + `[TX-SUBSCRIPTIONS]` (PR 3/3, chantier CLOS)
> **Le chantier « analyse des transactions » est complet** : virements (#539), catégorisation (#540),
> mesure + abos fantômes (cette PR).
> ⚠️ **LE point à retenir : le critère d'arrêt de Marc était STATISTIQUEMENT INTENABLE.** Il a fixé
> « < 1 % mal classé sur 300 tirages » ; le test qui l'encodait a ÉCHOUÉ. Mesuré : à 300 jugements
> SANS AUCUNE erreur, la borne haute de Wilson (95 %) monte encore à **1,26 %** → il faut **390**
> tirages. `RECOMMENDED_SAMPLE_SIZE` est donc DÉRIVÉE de `samplesNeededForThreshold(1)`, jamais
> re-tapée. Si Marc rediscute le seuil, c'est la constante qui suit, pas le test.
> **Livré** : `services/transactions/reviewSample.ts` (tirage seedé déterministe — graine PERSISTÉE
> dans `AppState.categoryReview`, sinon les jugements ne portent plus sur le même dénominateur ;
> intervalle de Wilson ; verdict « indéterminé » tant qu'il chevauche le seuil) +
> `subscriptionAlerts.ts` (hausse de prix vs le prix D'AVANT ; « arrêté » après 2 cadences manquées ;
> coût annuel EXCLUANT les arrêtés) + `CategoryReviewPanel.tsx` (Transactions) + alertes dans Planning.
> ⚠️ `AppState.categoryReview` est ADDITIF → déclaré EXPLICITEMENT dans `DEFAULT_APP_STATE`
> (`: undefined`), sinon la vraie revue de Marc traverserait le mode démo (PERSONA-PURGE).
> ⚠️ Piège d'unité rencontré : `formatPercent` prend DÉJÀ un pourcentage (×100), pas un ratio.
> **Suite possible** (rien de bloqué) : Marc lance la revue et me dit le taux mesuré ; si > 1 %, ses
> corrections indiquent QUELLES classes d'erreurs restent — c'est le prochain lot, guidé par la mesure
> plutôt que par l'intuition.

> ## 🟢 Session 2026-07-31 — `[TX-CATEGORIZE]` + `[TX-INTERAC-BUDGET]` (PR 2/3)
> **Cause racine du « ça met abonnement pour tout et n'importe quoi »** : la catégorie « Abonnements »
> se décidait sur le seul LIBELLÉ (`APPLE\.COM`, `GOOGLE \*`, `MICROSOFT`) et passait AVANT
> Santé/Loisirs/Magasinage. Or la décision de Marc (« achat unique chez un marchand d'abo → Loisirs »)
> est INDÉCIDABLE sur une ligne : un jeu Steam et un abonnement Steam ont le même libellé.
> **Livré** : `services/transactions/merchantProfile.ts` (profil de récurrence PUR : ≥3 occurrences,
> cadence weekly/monthly/quarterly/yearly, écart RELATIF ≤15 % — un abo qui passe de 9,99 à 12,99 reste
> stable, ce que le ±5 $ absolu de `Planning.tsx` perdait) + `contextualCategorize.ts` (promotion
> « Abonnements » réservée aux marchands AMBIGUS listés dans `AMBIGUOUS_SUBSCRIPTION_RULES`) + bouton
> « Tout recatégoriser » (`handleAutoCategorizeAll('all')`, verrou `status === 'manual'`).
> ⚠️ **Ne JAMAIS promouvoir un marchand SANS règle** même parfaitement régulier (loyer/assurance/prêt
> auto ont la même forme) — c'est testé.
> **`[TX-INTERAC-BUDGET]`** : « Remboursement » retiré de `NON_BUDGET_CATEGORIES` → un Interac sortant
> est une VRAIE dépense (décision Marc) ; l'entrant vient en CRÉDIT du même poste. Règles extraites dans
> `utils/spendRules.ts` (module NEUTRE : `budgetSync` ↔ `budget` s'importent déjà, cycle évité, madge = 0).
> ⚠️ **Finding attrapé par un test MCP existant** : mon 1er jet soustrayait le crédit du TOTAL global →
> 500 $ reçus sans sortie correspondante EFFAÇAIENT 400 $ de restaurants réels. Le crédit est désormais
> borné à SON poste (`max(0, sorties − crédits)`).
> **RESTE (PR 3)** : écran de tri des cas douteux + **revue d'échantillon 300 tirages** (le critère
> d'arrêt de Marc « < 1 % mal classé » n'est PAS vérifiable sans elle — il a refusé de fournir un export)
> + abonnements fantômes (hausse de prix, service qui a cessé d'être débité).

> ## 🟢 Session 2026-07-31 — `[TX-TRANSFERS]` (PR 1/3 du chantier « analyse des transactions »)
> Demande Marc : « ça détecte mal mes transferts entre comptes, ça met abonnement pour tout et
> n'importe quoi ». Cadrage fait (27 questions), découpé en **3 PR** : 1) transferts, 2) catégorisation
> (règles + IA, hybride — profil de récurrence par marchand), 3) abonnements fantômes.
> **Livré ici (PR 1)** : cœur d'appariement GÉNÉRIQUE `services/transactions/detectTransfers.ts`
> (montants exactement opposés, ≤3 j, comptes différents, 1:1, Interac exclu) — il ne vivait que dans
> `services/fintable/`, qui délègue désormais au cœur en gardant SA contrainte de rôles via `canPair`.
> Appliqué automatiquement à l'import (`App.tsx`) + panneau « Virements internes » (onglet Transactions).
> ⚠️ **Deux régimes** : `confirmed` (comptes connus ET différents) marqué d'office ; `suggested`
> (compte inconnu d'un côté) JAMAIS écrit — un faux positif retire une vraie dépense du budget.
> ⚠️ **`accountName` est maintenant émis PAR TRANSACTION** (Fintable n'en émettait aucun : le payload
> n'a qu'un compte de DOCUMENT alors qu'un lot couvre plusieurs comptes) — sans lui, rien n'est
> prouvable. L'historique déjà importé sans compte reste en « suggestions ».
> **Décisions Marc à respecter en PR 2** : catégoriser en HYBRIDE (règles précises d'abord, IA ensuite
> — « pas sur des mots bateau ») ; passe IA sur tout l'historique ; écraser oui, SAUF une correction
> manuelle (verrou par transaction, pas de règle par marchand) ; écran de tri dans Transactions ;
> Interac = « Remboursement » MAIS doit compter comme **vraie dépense** (il est aujourd'hui dans
> `NON_BUDGET_CATEGORIES`, donc invisible au Budget — à traiter en PR 2) ; abonnement = service
> récurrent, achat unique chez un marchand d'abo → Loisirs (donc la catégorie ne peut PAS se décider
> sur le libellé seul) ; critère d'arrêt = **< 1 % d'erreur mesuré sur 300 tirages** (revue
> d'échantillon dans l'app — Marc refuse un export de données).

> ## 🔴→🟢 Session 2026-07-30 (correctif 2) — `[FINTABLE-BROWSER-FETCH-RECEIVER]` : « échec réseau (TypeError) »
> 2ᵉ bug du même écran, signalé par Marc juste après le déploiement du 1ᵉʳ. `this.fetchImpl =
> opts.fetchImpl ?? fetch` puis `this.fetchImpl(...)` change le RÉCEPTEUR de `fetch` (`this` =
> l'instance au lieu de `window`) → le binding WebIDL du navigateur lève `TypeError: Illegal
> invocation`, remonté en `[NETWORK] … (TypeError)` après les 3 re-tentatives.
> **MESURÉ dans un vrai Chromium** (sonde Playwright, pas déduit) : `bare(u)` OK · `obj.f(u)` ILLEGAL
> INVOCATION · wrapper OK · bind OK. Fix = wrapper `(input, init) => fetch(input, init)`.
> ⚠️ **jsdom/undici n'appliquent PAS la vérification de récepteur** → le garde est une SIMULATION de la
> règle WebIDL dans `client.test.ts`. Discriminant : restaurer `?? fetch` → test rouge en ~5 s.
> ⚠️ **Les 3 bugs de la session ont la MÊME cause profonde** : le chemin par DÉFAUT (carte non montée
> en test, client non construit en test, `fetch` non exercé en test) n'était couvert nulle part.
> Grep de la classe fait : instance unique. RESTE : que l'edge Vercel forwarde `Authorization`.
>
> ## 🔴→🟢 Session 2026-07-30 (correctif) — `[FINTABLE-BROWSER-RELATIVE-BASE]` : « url invalide » sur un JETON
> Marc a collé son jeton et l'app a répondu **« url invalide »** — *« mais c'est un jeton pas une url »*.
> Il avait raison, le message accusait la mauvaise chose. Cause RACINE : `FintableClient.buildUrl`
> faisait `new URL(base + path)` **à un seul argument**, ce qui EXIGE une URL absolue. Ça marchait
> côté cron (`https://fintable.io/api/v2`) et lève `TypeError: Invalid URL` côté navigateur, où la
> base est le proxy same-origin **relatif** `/api/fintable`. Fix : résoudre une base relative contre
> `location.origin` (2ᵉ argument ; `new URL(absolue, undefined)` ignore le 2ᵉ argument → chemin cron
> BIT-IDENTIQUE), + erreur NOMMÉE si base relative sans origine.
> ⚠️ **Le vrai défaut était le trou de test**, jumeau du test de câblage de la carte : les 7 tests de
> `browserSync` injectaient TOUS un `client` factice → la ligne `new FintableClient({ baseUrl })`
> n'était exécutée par AUCUN test. Un paramètre d'injection crée un chemin PAR DÉFAUT que plus
> personne n'exerce — et c'est celui de la production. 3 tests ajoutés SANS injection (faux `fetch`,
> vrai client) ; discriminant : `expected 'Invalid URL' to be null`, le message exact de Marc.
> ⚠️ **NON vérifiable depuis le conteneur** (`fintable.io` = 403 CONNECT) : que l'edge Vercel forwarde
> l'en-tête `Authorization` sur un rewrite externe. À confirmer par l'usage réel de Marc.
>
> ## 🟢 Session 2026-07-30 (fin) — `[FINTABLE-7]` Lot 2 : l'ÉCRAN existe (Réglages → Clés API)
> Marc, 2× : « dans mes clés api je vois pas pour le jeton », puis « je ne vois toujours pas ». Les deux
> fois c'était vrai : la 1ʳᵉ PR ne livrait que la plomberie, et la 2ᵉ n'était pas encore MERGÉE (donc pas
> déployée — un merge n'est pas un déploiement, cf `[[FINTABLE-BOOL-QUERY]]` §2 appliqué à Vercel).
> Livré : `components/settings/FintableSyncCard.tsx`, rendue **inconditionnellement** dans le sous-onglet
> `integrations` de `Settings.tsx` — libellé de l'onglet = **« Clés API »**. Contenu : champ jeton
> (`type=password`, `apiKeys.fintable`, device-local, JAMAIS poussé sur Drive), « Tester la connexion »
> (liste les comptes RÉELS sans pager transactions/positions), un rôle par compte (liquidités / dette +
> nom EXACT / placement + régime pré-rempli NON-ENREG / ignorer), « Synchroniser maintenant », et le
> rapport de la dernière passe. ⚠️ **Aucun montant rendu** (verrouillé par test) → zéro surface à garder
> en mode discret. Sync coupée en mode démo. Écriture de l'état par **delta de référence** (la 1ʳᵉ
> version énumérait 5 clés et perdait déjà `lastUpdate`). **RESTE** : Lot 3 = déclenchement AUTO à
> l'ouverture (throttlé 1×/jour) ; `[FINTABLE-6]` Lot 2 = afficher le montant courtier + ligne d'écart
> dans Investissements et Accueil ; `[DASH-NETWORTH-CANONICAL]`.
>
> ## 🟢 Session 2026-07-30 (suite) — `[FINTABLE-7]` : la sync passe DANS LE NAVIGATEUR (zéro config pour Marc)
> **Demande Marc, non négociable** : « je veux que tu fasses tout toi, sans que j'aie besoin de t'aider ».
> **Mesuré avant de décider** (ne pas re-supposer) : `gcloud` ABSENT du conteneur, aucun identifiant
> GCP, `fintable.io` = 403 CONNECT, aucun outil MCP pour créer un secret GitHub → le chemin Cloud Run
> exige IRRÉDUCTIBLEMENT les identifiants de Marc. Donc bascule : la passe tourne dans l'app.
> Livré (réseau + runner) : proxy same-origin `/api/fintable/:path*` (vercel.json + vite dev/preview,
> patron Yahoo → **zéro domaine CSP ajouté**), `apiKeys.fintable`, `AppState.fintableRoles` (remplace
> le fichier JSON + secret GCP), `services/fintable/browserSync.ts` qui RÉUTILISE lecteur/mapper/
> `applyDocument`/persistance TELS QUELS — mêmes garanties que le cron + `nextState: null` sur échec.
> ⚠️ Compromis assumé : jeton dans le navigateur via l'edge Vercel (lecture seule → risque borné), et
> pas d'exécution app fermée. Le cron serveur reste en place, prioritaire si la config est montée.
> **RESTE** : `[FINTABLE-7]` Lot 2 = UI Réglages (coller le jeton, bouton « Tester », rôles par clic —
> Marc a dit « tout non enregistré pour le moment » → pré-remplir NON-ENREG) + déclenchement auto 1×/jour.
>
> ## 🔴 Session 2026-07-30 — LA SYNC FINTABLE N'A JAMAIS TOURNÉ + `[FINTABLE-6]` Lot 1 (montant courtier = autorité)
> **⛔ CONSTAT MESURÉ (ne pas supposer le contraire)** : le cron s'est déclenché pour la 1ʳᵉ fois le
> 2026-07-30 11:49 UTC et a ÉCHOUÉ. Deux blocages, tous deux côté Marc :
> (1) le secret GitHub `FINANCEAI_FINTABLE_SYNC_SECRET` est **absent** (`FINANCEAI_MCP_URL`, lui, est
> bien posé — le log montre `SYNC_SECRET:` vide) ; (2) `deploy-mcp.yml` est **skipped à chaque push**
> (garde `vars.GCP_PROJECT_ID` non défini = déploiement manuel voulu) → **le Cloud Run tourne une
> révision d'avant `[FINTABLE-3]` et n'expose pas `/fintable-sync`**. Donc ZÉRO donnée Fintable n'est
> jamais entrée dans l'app, et tout ce que Marc demande en aval en dépend.
> **🔵 `[FINTABLE-6]` Lot 1 LIVRÉ** — demandes Marc : « dans investissements utilise exactement le
> montant que j'ai dans Fintable » + « l'accueil aussi, chaque jour ». Décision Marc (question posée) :
> **autorité + ligne d'écart explicite** (pas autorité muette, pas simple référence). En LISANT le code :
> `investmentBalances` était calculé puis **jeté** (seul un compteur survivait) → rien à brancher.
> Livré : `taxRegime` OPTIONNEL par compte (jamais inféré, absent = signalé et hors projection),
> `AppState.fintableBrokerBalances` (clé `accountId` stable + horodatage), module PUR
> `services/fintable/brokerBalances.ts` (source unique de la réconciliation, **par PANIER FISCAL** — les
> `Asset` ne portent pas d'id de compte courtier, réconcilier par compte est impossible par construction).
> ⚠️ Mon propre test a attrapé mon propre bug : `Number(null) === 0` → un solde absent devenait un 0 $
> crédible effaçant un compte. Garde null-explicite aux deux bouts. 19 tests.
> **🩺 Diagnostic Accueil (agent `financial-integrity`)** — les 4 symptômes de Marc ont UNE cause :
> le KPI `Dashboard.tsx:425` est **la seule surface de l'app qui recalcule localement** le patrimoire au
> lieu de la source unique. ⚠️ Pour la suite : son cash ne somme que les transactions à `accountName`
> non vide, or **le mapper Fintable n'en émet aucun** → réparer la sync ne suffirait PAS à réparer
> l'Accueil. Ticket `[DASH-NETWORTH-CANONICAL]` au BACKLOG avec le piège à éviter (passer naïvement à
> `computePresentNetWorth` FERAIT CHUTER le patrimoine de l'équité immo → cible = `+ équité immo`).
> **Suite** : `[FINTABLE-6]` Lot 2 (consommer dans Investissements + Accueil) puis `[DASH-NETWORTH-CANONICAL]`.
>
> ## 🟢 Session 2026-07-29 (suite 8) — `[FINTABLE-4]` LIVRÉ (import manuel replié par défaut) — chantier Fintable CLOS côté code
> **🔵 `[FINTABLE-4]` LIVRÉ** — dernier item du chantier Fintable. L'import manuel (`ImportBankStatement`,
> CSV/PDF) reste ENTIÈREMENT fonctionnel (aucune ligne de logique retirée) mais le bouton d'en-tête de
> `Transactions.tsx` est remplacé par une disclosure `<details>` native (même convention que
> `AdvancedProjectionParams`/`HistoryCoverageNote`) : **repliée par défaut** dès qu'il y a des transactions
> (Fintable synchronise déjà le quotidien), **ouverte automatiquement** à l'onboarding (0 transaction, D2 —
> l'écran vide ne doit jamais être une impasse). L'instance de Réglages → Comptes était déjà hors du flux
> principal, inchangée. L'import de courtage (`Investments.tsx`) reste au premier plan — seul chemin pour
> les positions (FINTABLE-POSITIONS : Disnat hors SnapTrade). 3 tests mis à jour, discriminant sur l'attribut
> `open` (jsdom ne cache pas le contenu d'un `<details>` fermé). Découverte en chemin : `text-info-300`
> (token Tailwind inexistant, ~12 sites) → `[A11Y-INFO300-SWEEP]` au BACKLOG (1 site corrigé ici).
> **Chantier Fintable CLOS côté code** (`[FINTABLE-0]`→`[FINTABLE-4]`, #521→ce jour) — ce qui reste est
> CONFIGURATION côté Marc : voir `docs/A_FAIRE_MOI.md` § FINTABLE-3 (3 secrets Secret Manager + redeploy
> Cloud Run + 2 secrets GitHub Actions) pour que le cron tourne réellement.
>
> ## 🟢 Session 2026-07-29 (suite 7) — `[FINTABLE-3]` LIVRÉ (cron serveur, 1ʳᵉ écriture auto du chantier) + `[FUTUR-PAST-DEBT-FREEZE]`
> **🔵 `[FINTABLE-3]` LIVRÉ** (cette PR) — cadrage validé par Marc (4 questions) : écriture réelle DÈS LE
> DÉPART, 1×/jour, date de bascule AUTO-DÉRIVÉE, échecs visibles dans l'app seulement (pas de notif proactive).
> `mcp/runFintableSync.ts` : lecture Fintable → mapper (Lot 2) → `applyDocument` → écriture ATOMIQUE
> (`store.save(next, version)`), patron EXACT de `runPriceRefresh`/HUB-REFRESH-CRON. `POST /fintable-sync`
> dans `mcp/http.ts`, secret **DÉDIÉ** `FINANCEAI_FINTABLE_SYNC_SECRET` (distinct de `FINANCEAI_REFRESH_SECRET`
> — celui-ci autorise l'écriture de tx/soldes réels). Déclencheur = **GitHub Actions** (`.github/workflows/
> fintable-sync.yml`, 10:00 UTC), PAS Cloud Scheduler — le patron `refresh-prices.yml` couvrait déjà
> exactement ce besoin (réveiller Cloud Run endormi), gratuitement, sans nouveau service GCP. Rapport
> `AppState.fintableSyncReport` TOUJOURS écrit (succès/échec) → carte « Sync Fintable » dans Système &
> diagnostics. Conflit OCC = transitoire (relancé sans rapport d'échec) ; panne réelle = rapport persisté + 5xx.
> `parseRolesJson` extrait en module PARTAGÉ (`services/fintable/rolesConfig.ts`, consommé par `fintable:dry`
> ET le serveur). 20 tests.
> **Panel de 7 agents post-commit** (code-reviewer, silent-failure-hunter, financial-integrity, security-privacy,
> projection-validator, documentation-manager, a11y-auditor) — 6 findings vrais, chacun vérifié par lecture du
> code puis corrigé avec test discriminant prouvé : isolation par payload (un rejet légitime n'avortait plus
> toute la passe de sync), bascule plafonnée à aujourd'hui (transaction future ne gèle plus l'import, no silent
> cap), garantie « rapport toujours écrit » élargie à la lecture d'état initiale, montant $ retiré d'un
> avertissement (fuite mode discret + logs GitHub), `fintableSyncReport` ajouté à `DEFAULT_APP_STATE` (purge
> persona), carte UI durcie contre une forme corrompue. Détail complet dans `CLAUDE.md` (bloc
> `[FUTUR-PAST-DEBT-FREEZE]`, sous-point panel) et `docs/decisions.md` (n°5).
> **🔵 `[FUTUR-PAST-DEBT-FREEZE]` LIVRÉ** (même PR) — demande Marc distincte, arrivée en cours de Lot 3 :
> « assure-toi que le passé marche… le passé doit être exactement ce que c'était à cette date ». Audit
> lecture seule d'abord (3/4 volets déjà corrects) puis fix d'un écart réel : `currentDebtNonImmo` (segment
> PASSÉ) lisait `chartData[0]` — qui peut être le blob FIGÉ (PROJECTION-PERSIST) — au lieu de `liveResults`
> (toujours frais). Conséquence : quand le futur affiché est gelé (badge « Pas à jour »), le passé continuait
> de soustraire l'ANCIENNE dette. Fix : lire depuis `liveResults` systématiquement. Test discriminant qui
> échoue sur l'ancien code (`git stash`, prouvé) : gèle le futur, bondit la dette live de +10 M$, vérifie
> que le NetWorth du passé CHANGE.
> **Suite** : `[FINTABLE-4]` (import manuel masqué, dernier item du chantier Fintable) ; Marc doit encore créer
> les 3 secrets GCP (`financeai-fintable-sync-secret`/`-token`/`-roles-json`) et les 2 secrets GitHub Actions
> avant que le cron ne tourne réellement (cf `mcp/README.md` § Sync Fintable planifiée).
>
> ## 🟢 Session 2026-07-29 (suite 6) — TX-DUPLICATES : détection de doublons (demande Marc) + durcissement CLI
> **🔵 `[TX-DUPLICATES]` LIVRÉ** (cette PR). Demande Marc : « enlève les transactions en double ».
> **Constat en vérifiant l'état réel** : `Transaction.isDuplicate` était RESPECTÉ partout (exclu de
> `computeStartingCash`, Budget, revenus, patrimoine) mais **rien ne le mettait jamais à `true`** —
> `parseBankCsv` l'initialise à `false`, personne ne le change ; et le filtre UI « afficher les doublons »
> était du CODE MORT (`_setShowDuplicates` jamais appelé, le `_` l'exemptant du lint). Une machinerie
> d'exclusion complète… sans personne pour l'alimenter. Marc n'avait donc AUCUN moyen de voir ni marquer
> ses doublons. `services/transactions/duplicateDetection.ts` (PUR, 18 tests) : critère = **montant exact
> + date proche** (tolérance 0/1/3 j), **libellé volontairement EXCLU** du critère — c'est justement quand
> il diffère (deux sources d'import) que la dédup `txnKey` laisse passer. ⚠️ On **MARQUE, on ne SUPPRIME
> pas** (cash dérivé → suppression = solde déplacé en silence, ADR suppressions) et **jamais de marquage
> automatique** (deux dépenses identiques le même jour = vrai faux positif ; marquer à tort RETIRE de
> l'argent réel des calculs). Réversible. `components/transactions/DuplicatesPanel.tsx` + toggle ressuscité.
> **🔵 Durcissement CLI** : `fintable:dry` REJETTE désormais une option inconnue. Un binaire pré-Lot-2
> ignorait `--roles`/`--after`/`--show-ids` en silence et rendait une sortie normale → Marc a cru la feature
> cassée alors que son clone n'était pas à jour (2ᵉ occurrence de « mergé ≠ déployé chez l'utilisateur »).
> **Comptes de Marc mappés** (ids obtenus via `--show-ids`) : PCA + TS1 = `cash` · Mastercard = `debt` ·
> 2 Disnat + SHR = `investment`. Date de bascule retenue : **2026-06-29** (à confirmer contre la dernière
> transaction RÉELLE de l'app, pas la date d'import).
> **Suite** : `[FINTABLE-3]` cron Cloud Run + écriture via `runApply` (OCC + backup) — PREMIÈRE écriture
> réelle du chantier, plan-first obligatoire. 💡 Y dériver la date de bascule automatiquement
> (`max(date)` des transactions existantes) au lieu d'un paramètre que Marc maintient.
>
> ## 🟢 Session 2026-07-29 (suite 5) — Lot 2 LIVRÉ (mapper pur) · positions IMPOSSIBLES, clos · Marc paie
> **❌ `[FINTABLE-POSITIONS]` CLOS — impossible, mesuré.** L'annuaire PUBLIC de Fintable rend
> **3 courtiers SnapTrade au Canada** (Webull, Questrade, Wealthsimple Trade) ; `q=disnat` → 0 résultat,
> « Desjardins Online Solutions » = `supported: false`. Limite PRODUIT, pas une config. Les positions
> restent sur `apply_broker_statement` (relevé déposé dans le chat), qui marche déjà.
> **✅ `[FINTABLE-PLAN]`** : Marc prend un plan payant — CONTRE ma reco (j'ai conseillé d'arrêter, le
> cœur de la demande étant impossible). Arbitrage assumé, tracé ADR + BACKLOG.
> **🔵 `[FINTABLE-2]` LIVRÉ** (cette PR) : `services/fintable/mapSnapshot.ts`, fonction PURE →
> `bank_statement` + `cash_balance` + `debt`. 16 tests (82 au total sur `services/fintable/`).
> ⚠️ **Piège money-critical trouvé en LISANT `txnKey`** : la dédup porte sur `date|montant|PAYEE`, et le
> payee Fintable ne sera jamais celui des relevés PDF → même dépense, clé différente, **doublon
> silencieux** qui fausserait `computeStartingCash` + les dépenses du Budget. La fenêtre Fintable (30 j)
> RECOUVRE l'historique manuel. Parade = **date de bascule** (`transactionsAfter`, strictement postérieur).
> Leçon générale portée dans CLAUDE.md : quand 2 sources alimentent le même journal, c'est la BORNE
> TEMPORELLE qui protège, pas la dédup — une clé qui inclut un libellé ne survit pas au changement de fournisseur.
> Autres garde-fous testés : rôle de compte EXPLICITE (jamais deviné) · liquidités en TOUT-OU-RIEN
> (`cash_balance` écrit un DELTA → cible partielle = dérive silencieuse) · solde de carte négatif →
> `Math.abs` (une dette négative gonflerait le patrimoine) · devise ≠ CAD écartée et signalée · dette en
> SOLDE seulement (ni taux ni paiement minimum inventés → elle doit préexister).
> Aperçu : `npm run fintable:dry -- --roles <f.json> --after YYYY-MM-DD` (`--show-ids` pour construire le
> fichier ; `.fintable-roles.json` gitignoré = ids de comptes bancaires).
> **Suite — 3 actions Marc (routées `A_FAIRE_MOI.md`)** : créer la dette Mastercard une fois (avec son
> VRAI taux), donner la date de bascule, construire le fichier de rôles puis me coller l'aperçu. Ensuite
> `[FINTABLE-3]` (cron Cloud Run + écriture via `runApply`) et `[FINTABLE-4]` (import manuel masqué).
>
> ## 🟠 Session 2026-07-29 (suite 4) — docteur lancé : cause des positions TROUVÉE + essai qui expire le 01-08
> **Le docteur a désigné la bonne cause du premier coup** : les 6 comptes de Marc arrivent par **UNE
> SEULE connexion, Desjardins via PLAID**, et il n'y a **aucune connexion SNAPTRADE**. Chez Fintable le
> courtage passe par SnapTrade → un compte de placement lié via un lien bancaire expose son solde sans
> ses positions. Plan et santé des connexions HORS DE CAUSE (`can_sync: true`, sync réussie le jour même).
> **Action Marc** : vérifier la couverture Disnat via l'annuaire PUBLIC (`GET /institutions?q=disnat&provider=SNAPTRADE`,
> sans jeton) puis créer la connexion. Si Disnat n'est pas couvert par SnapTrade → « investissements
> temps réel » impossible via Fintable, rouvrir le cadrage.
> **🔴 `[FINTABLE-PLAN]` NOUVEAU BLOCAGE, échéance dure** : l'essai de Marc **expire le 2026-08-01**, et
> le palier **gratuit a `can_sync: false`** → à l'expiration plus AUCUNE sync ne tourne (arrêt total, pas
> de dégradation). Heurte la règle « zéro abonnement » du CLAUDE.md global → arbitrage Marc.
> **NE PAS coder le `[FINTABLE-2]` avant sa réponse** : sans plan actif tout l'aval est mort-né.
> **Mesuré au passage** : ni Airtable ni Google Sheets ne sont connectés chez lui → le « repli Sheet »
> documenté à l'ADR n'a JAMAIS existé en pratique, ce qui conforte le choix de l'API directe.
>
> ## 🟠 Session 2026-07-29 (suite 3) — 1ᵉʳ dry-run RÉEL : Lot 5 tranché, positions BLOQUÉES, docteur livré
> **Le dry-run passe** (6 comptes, 121 transactions). Fix `pending=1/0` (#524) **confirmé par mesure**.
> ⚠️ Piège rencontré : le 422 est revenu VERBATIM après le merge — pas un mauvais diagnostic, le clone de
> Marc était sur un `main` périmé. Une erreur identique au caractère près après un fix = code non rapatrié.
> **🔵 `[FINTABLE-5]` TRANCHÉ — ON GARDE les 18 mois d'historique manuel** : 90 jours demandés, **30 rendus**
> (2026-06-29 → 2026-07-28). La réponse de cadrage de Marc (« supprimer l'historique, que Plaid », Q8) était
> sincère et FAUSSE → l'appliquer coûtait ~17 mois. C'est exactement pourquoi ce lot était gaté par une MESURE.
> **🔴 `[FINTABLE-POSITIONS]` BLOQUANT** : 3 comptes de placement (Disnat ×2, SHR), **0 position**, et les
> appels `/holdings` RÉUSSISSENT en rendant des listes vides (aucun skip à tracer). Marc confirme que ces
> comptes contiennent des titres → c'est la moitié de la demande initiale qui ne marche pas.
> **🔵 `[FINTABLE-1b]` docteur livré** (cette PR) : `readDiagnostics.ts` (`/me` droits du plan, `/connections`
> santé + historique de sync, `/integrations`) + `explainMissingData` (raisonnement PUR, testable sans réseau)
> + `npm run fintable:doctor`. Décodeurs à défauts PRUDENTS (`can_sync`/`healthy` absents → `false`). Piste
> n°1 encodée : chez Fintable le **courtage passe par SnapTrade** — un compte de placement lié via un provider
> bancaire expose son solde sans ses positions. 16 tests (66 au total sur `services/fintable/`).
> **Décisions de mapping tranchées par Marc** (AskUserQuestion) : les 2 Disnat = **non-enregistrés** ; la
> Mastercard Desjardins alimente une **dette**, pas les liquidités (90/121 tx en viennent). Simplification
> mesurée : **0 catégorie Fintable**, 121 tx non catégorisées → aucun conflit de taxonomie, `ruleCategorize` prend le relais.
> **Suite** : Marc lance `npm run fintable:doctor` (routé `A_FAIRE_MOI.md`). Le `[FINTABLE-2]` est SCINDÉ —
> volet transactions/liquidités/dette exerçable (121 tx réelles), volet **positions GELÉ** tant qu'aucune
> donnée réelle ne peut l'exercer (leçon PORTFOLIO-HISTORY : un stub qui nourrit une surface est une dette qui MENT).
>
> ## 🟢 Session 2026-07-29 (suite 2) — FINTABLE Lot 1 LIVRÉ : lecteur API + dry-run (blocage levé)
> **Marc a fourni la doc officielle de l'API Fintable V2** → le « Ouvert » de l'ADR est fermé (mise à jour
> ajoutée à `docs/decisions.md` : base `https://fintable.io/api/v2`, Bearer, enveloppe `{data}`, curseur,
> `order=updated&updated_since` pour l'incrémental, 300 lectures/min).
> **🔵 `[FINTABLE-1]` livré** : `services/fintable/` = `types.ts` (formes brutes + modèle normalisé +
> `FintableError` à code typé transitoire/confirmé, classe QUOTE-ERRKIND) · `decode.ts` (décodage STRICT) ·
> `client.ts` (pagination curseur + garde anti-curseur-répété, 429 avec `Retry-After`, **timeout couvrant la
> LECTURE DU CORPS** — leçon SYNC-FETCH-TIMEOUT, jeton jamais dans une URL ni un message d'erreur) ·
> `readSnapshot.ts`. `npm run fintable:dry` (montants MASQUÉS par défaut). **50 tests**, typecheck + lint propres.
> **4 contraintes de la doc devenues règles de code** (ADR) : `pending=false` FORCÉ (une pending repostée =
> doublon À VIE, `applyDocument` ne supprime jamais) · `cost_basis` = coût **TOTAL** → champ `costBasisTotal`
> (notre `buyPrice` est PAR PART) · `Account.type` = texte libre → aucune inférence du type fiscal, positions
> demandées pour TOUS les comptes actifs · « money is a string » → `Number('')===0` gardé explicitement.
> **⚠️ CORRECTION d'une affirmation antérieure** : j'avais dit « Fintable sync 1×/jour, donc l'API n'apporte
> rien de plus que le Sheet » (extrait indexé). La doc réelle dit **balayage randomisé 6-23 h** + `POST /sync`
> à la demande + polling incrémental → l'API directe reste le bon choix, le Sheet redevient un simple repli.
> **Suite (bloquée sur Marc, routé `A_FAIRE_MOI.md`)** : il doit lancer `npm run fintable:dry -- --days 90`
> (je ne peux PAS appeler `fintable.io` depuis l'exécution cloud — 403 au tunnel CONNECT sur TOUS les chemins,
> endpoints publics compris). Sa sortie débloque le Lot 2 sur 4 décisions : mapping compte→type fiscal
> (CELI/REER/NON-ENREG, non inférable), devises rencontrées, catégories Fintable → postes canoniques, et
> l'étendue de dates réelle qui tranchera le Lot 5 (garder ou remplacer les 18 mois d'historique manuel).
>
> ## 🟠 Session 2026-07-29 (suite) — nouveau chantier FINTABLE : cadrage + ADR livrés, Lot 1 BLOQUÉ sur la forme de l'API
> **Demande Marc** : « mettre en place Fintable pour récupérer mes transactions et mes investissements en temps réel »,
> sans perdre l'import manuel (le mettre de côté), en gardant tous les tools MCP. 14 questions de cadrage répondues.
> **🔵 `[FINTABLE-0]` LIVRÉ (cette PR)** : ADR (`docs/decisions.md`) + plan en 6 lots (`docs/BACKLOG.md` § 🏦 FINTABLE).
> **Découverte de cadrage qui RÉDUIT le chantier** (classe `R2-FIRE` — vérifier l'état RÉEL avant de coder) :
> `mcp/ingest/applyDocument.ts` couvre DÉJÀ toute la fusion via 3 payloads existants — `bank_statement`
> (transactions + dédup + allowlist), `broker_statement` (positions), `cash_balance` (delta `initialBalances.LIQUIDITE`).
> Fintable est donc un **PRODUCTEUR de `DocumentPayload`**, pas un nouveau pipeline : il reste un LECTEUR + un MAPPER pur.
> L'écriture passe par `runApply` → OCC + sauvegarde horodatée héritées (c'est ce qui rend un écrivain SERVEUR
> compatible avec `SYNC-ANTI-CLOBBER`). Exécution = cron Cloud Run (jamais navigateur : le jeton n'entre pas dans le bundle).
> **🔴 BLOCAGE Lot 1 (routé `A_FAIRE_MOI.md`)** : la forme de l'API Fintable n'est PAS vérifiable depuis l'exécution
> cloud — `docs.fintable.io` NXDOMAIN, `fintable.io`/`api.fintable.com` bloqués par la politique réseau du conteneur
> (403 au tunnel CONNECT ; `WebSearch` passe, `curl` non). Marc doit fournir URL de base + en-tête d'auth + chemins
> + **une réponse réelle tronquée** (noms de champs). Le lecteur n'est PAS écrit tant que la forme n'est pas mesurée.
> Repli documenté et immédiatement faisable si Marc préfère : lire le Google Sheet que Fintable alimente déjà.
> **⚠️ Incident sécurité traité** : le 1ᵉʳ jeton Fintable (read+write, exp. 2027) a été collé en clair dans le chat →
> RÉVOQUÉ par Marc, remplacé par un jeton **lecture seule** dans Secret Manager (`financeai-fintable-token`). Leçon
> portée dans `CLAUDE.md` (§ Exécution cloud) avec la commande PIPÉE correcte (`gcloud secrets … --data-file=-` sans
> pipe reste bloqué sur stdin — ça ressemble à un plantage).
> **Suite** : dès la forme d'API reçue → Lot 1 (lecteur + `fintable:dry`, zéro écriture) puis Lot 2 (mapper pur + panel
> money-critical : FX natif via `assetValueCad`, sémantique réelle d'`applyBrokerStatement` à MESURER, compte fermé
> ≠ actif disparu). Lot 5 (bascule des 18 mois d'historique) reste GATÉ par une mesure de couverture Plaid réelle.
>
> ## 🟢 Session 2026-07-29 — DIRECTIVE MARC : « vider entièrement le backlog, non stop » → MCP-DIRECT-EDIT Lots 2-3 (PR en cours)
> **Contexte** : `set_cash` (#517) mergé + **déployé par Marc sur Cloud Run (v0.8.0 → confirmé fonctionnel sur claude.ai)**. Marc a ensuite donné la directive : vider TOUT le backlog, trouver/corriger les erreurs, non-stop. Stratégie : lots de PR sur les items actionnables (vérifier l'état RÉEL avant de coder, leçon PM-STALE-BACKLOG) ; items gated décision/action humaine → routés `A_FAIRE_MOI.md`.
> **🔵 Lots 2-3 MCP-DIRECT-EDIT** (cette PR) : `set_budget_item` (upsert poste par nom, édition cible → `autoTarget:false`) + `upsert_savings_goal` (upsert objectif par nom). Même pattern que set_cash (confirmation 2 temps, bornes D9, update partiel). MCP v0.9.0. ⚠️ Chaque lot MCP mergé exige un redéploiement Cloud Run par Marc (manuel — deploy-mcp.yml PAS configuré, `gcloud` non dispo en session cloud) → regrouper les lots avant de lui demander.
> **PR #518** (Lots 2-3 + HIST quick wins) : panel 3 agents FAIT (2 ÉLEVÉ financial-integrity corrigés : parité autoTarget/fréquence + note « poste orphelin retiré au prochain sync » ; 1 ÉLEVÉ silent-failure corrigé : '' avalé par toDocument → '' = effacer ; MOYENS/FAIBLES appliqués). Auto-merge armé.
> **Lots 4-5 FAITS localement (PR suivante)** : `delete_item` (actif = vente totale / dette / objectif) + ADR « Suppressions via MCP/IA » (docs/decisions.md) — correspondance EXACTE, ambiguïté → throw, confirmation stricte, transactions différées. MCP v0.10.0. Panel à lancer au push.
> **Suite prévue** : merge #518 → réconcilier → push Lots 4-5 + panel → silent-failure/MCP LOW (AITOOLS-HISTORY-BOUND, PERSONA-SANITIZE-CHAT, PRICE-SYNC-REPORT, MCP-ENGINE-WARNINGS, ENG-LIFEEVENT-VENTE-SUBSTRING) → a11y (A11Y-INK500 Lot 3, A11Y-FUTUR-MILESTONES-KEYBOARD) → dette. Items gated décision Marc → A_FAIRE_MOI. Voir BACKLOG.
>
> ## 🟢 Session 2026-07-28 — MCP-DIRECT-EDIT Lot 1 : `set_cash` (changer ses liquidités « juste en le demandant ») [PR — branche `claude/progress-check-yua8yy`]
> **🔵 `[MCP-DIRECT-EDIT]` Lot 1 `set_cash`** (demande Marc « change mes liquidités et tout tout tout avec mcp juste en le demandant » + « confirmation ») : nouveau tool d'écriture. Le cash est DÉRIVÉ (`computeStartingCash` = Σ initialBalances + Σ transactions non-dup/transfert, source unique) → l'ajustement se fait par **DELTA sur `initialBalances.LIQUIDITE`** (compte visible Réglages → Comptes, jamais d'écrasement des transactions ni de la map). Idempotent, borné (0 → 100 M$) + garde non-fini métier (bypass-Zod couvert). **Invariant round-trip prouvé** : `computeStartingCash(next) === target`. **Confirmation à 2 temps** (nouveau `RunApplyOptions` dans `runApply` : dry-run APERÇU sans écriture → 2ᵉ appel `confirm:true` persiste) côté MCP/claude.ai ; l'app garde son modal `writeExecutor`. Spec/tool scindés (`setCash.spec.ts` browser-safe + `.tool.ts` mince), enregistrés dans `mcp/server.ts` + `services/aiTools/registry.ts` (WRITE_SPECS) → parité app↔MCP. tests (round-trip exact, idempotence, bornes, dry-run/confirm bout-en-bout, garde non-fini) + registryParity/specFiniteGuard verts. **Panel money-critical FAIT** (financial-integrity RAS + security-privacy RAS + silent-failure-hunter 1 CRITIQUE CORRIGÉ : `current`/`delta` gardés non-finis avant écriture — Zod laisse passer ±Infinity dans initialBalances/transactions → on écrivait `NaN` en silence ; discipline HARDEN-NETWORTH-NAN appliquée, discriminant prouvé). ⚠️ Actif sur claude.ai seulement après **redéploiement Cloud Run** (auto via `deploy-mcp.yml` sur merge main si `GCP_PROJECT_ID` configuré, sinon `mcp/deploy.sh` manuel) + reconnexion du connecteur claude.ai (rafraîchit la liste des tools). Prochains lots BACKLOG : `set_budget_item`, `upsert_savings_goal`, vente totale, suppression (ADR). Salaire déjà couvert par `apply_payslip`.
>
> ## 🟢 Session 2026-07-24 (suite) — backlog « tout » VIDÉ (PR #505→#511 MERGÉES) → FUTUR-REAL-HISTORY en cours (raccord dette exact)
> **🔵 `[FUTUR-REAL-HISTORY]`** (PR suivante, DRAFT — branche `claude/progress-check-yua8yy`) : la courbe Futur AVANT aujourd'hui montre l'historique RÉEL du patrimoine. **Cadrage (architect + financial-integrity) : DÉJÀ construit à ~90 %** (`pastPrefix` dans `FutureProjection.tsx`). Cette PR ferme les 2 écarts money-critical : (1) **raccord dette EXACT (Option A, décision Marc 2026-07-24)** — le passé soustrait `chartData[0].DettesNonImmo` (dette courante) via `pastNetWorthAt`→`computeRawNetWorth` (zéro copie locale) → fin du SAUT « aujourd'hui » pour un endetté ; (2) **cohérence base cash** — `reconstructCashHistory` exclut dup/transfert comme `computeStartingCash` (les 2 bouts divergeaient) ; (3) **FX du jour** + note d'honnêteté au bandeau. Tests discriminants (3 rouges sur l'ancien code). Reste différé (Lot 4, non bloquant) : `[FUTUR-HIST-DAILY-REFRESH]`, `[FUTUR-HIST-FX-DATED]`. Panel money-critical à lancer.
> **✅ `[A11Y-DASH-SRONLY]`** (PR #511, MERGÉE) : convention globale d'accessibilité pour l'état vide « — ». Helper pur `components/ui/emptyAware` (tiret `aria-hidden` + `sr-only` « Pas de donnée ») appliqué au CENTRE (slot `value` de `KPIStat` hors privacy + branche non-privée de `PrivateAmount` → couvre `DualKPIStat`) — pas site-par-site. Miroir de `PrivateAmount`. **DERNIER item du backlog « tout » de Marc → VIDÉ.**
> **✅ `[AITOOLS-PROMPT-CACHE]`** (PR #509, DRAFT) : prompt caching Anthropic. État réel : le `cache_control` du bloc system statique (#490) cachait DÉJÀ les 16 schémas de tools par l'ORDRE de préfixe (tools → system → messages). Complété par un marqueur `cache_control` EXPLICITE sur le dernier tool (`agentLoop.ts`) → tools cachés indépendamment du system (défense en profondeur). Guard-test de forme de requête (2 marqueurs). Zéro changement de comportement ; `usage.cache_read_input_tokens` déjà remonté.
> **✅ `[QUOTE-ERRKIND]`** (PR #508, DRAFT) : fix structurel du cache négatif — les providers de cours (Finnhub/CoinGecko/Yahoo) PROPAGENT désormais (throw `MarketDataError` typée) les échecs TRANSITOIRES (429/réseau/AUTH) au lieu de les aplatir en `null` ; l'absence CONFIRMÉE (Finnhub `c:0`, Yahoo 404, crypto inconnu) reste `null`. La façade (`runLink`) ne compte au skip QUE l'absence confirmée → un 429 ne gèle plus un vrai titre (finding ÉLEVÉ #499). TTL gradué = 2ᵉ ceinture. Discriminant : 3× 429 → interrogeable ; 3× 404 → skip armé. 52 tests marketData verts.
> **✅ `[FUTUR-ICON-DENSITY]`** (PR #505, mergée) : bug Marc « pas assez d'icônes dans Futur » — `thinEvents` sous-remplissait le cap de densité (pas entier `Math.ceil(n/cap)` → jusqu'à 2× trop peu d'icônes). Remplacé par `utils/sampleEvenly.ts` (répartition uniforme atteignant EXACTEMENT `cap` indices). Panel + tests discriminants.
> **✅ `[A11Y-PILL-RADIOGROUP]`** (PR #506, mergée) : navigation clavier APG du composant `Pill` partagé (roving tabindex + flèches + Home/End, sélection suit le focus, `aria-label` requis, cible ≥ 24 px). Panel a11y.
> **PR #507 `[PERF-STALE-TAIL-ZERO]` (DRAFT, auto-merge armé)** : `seriesReturnPct` rend « — » au lieu d'un 0 % TROMPEUR quand latest ET baseline sont des valeurs raccordées au prix courant (candles KO + quote fraîche, cas GBS.PA). `buildMarketData.syntheticTailKeys` (clés `JSON.stringify([date, symbol])` anti-collision) trace ces valeurs figées ; prédicat optionnel `isSynthetic` (rétrocompat bit-identique). Panel financial-integrity (SÛR, 5 points sondés) + code-reviewer (finding clé anti-collision appliqué). Un SEUL endpoint synthétique → mouvement réel conservé.
>
> ## 🟢 Session 2026-07-24 — BUDGET-3-VUES + BUDGET-MATCH-UNIFY + MCP-CATEGORY-ALLOWLIST + AI-CATEGORIZE-MISSING-ID + AUTH-DRIVE-STILL-RECONNECT (PR #503/#504 MERGÉES)
> **✅ `[BUDGET-3-VUES]`** (PR #500, squash 7e80af2, 2026-07-23) : tableau Budget 3 colonnes — réel période · moyenne 12 mois · cible. Panel `/review-all` : findings a11y corrigés.
> **✅ `[BUDGET-MATCH-UNIFY]`** (PR #501, squash ace36bf, 2026-07-24) : rapprochement catégorie fuzzy via `matchCategoryToName` prédicat partagé, allocation zéro-overhead, auto-target. Panel : financial-integrity 0 findings (mesurés), code-reviewer 1 perf (allocation/appel, corrigé), silent-failure-hunter 1 ÉLEVÉ → déploiement imédiat.
> **✅ `[MCP-CATEGORY-ALLOWLIST]`** (PR #502, squash 9686691, 2026-07-24) : validations catégorie libre au point d'écriture `applyDocument.ts` (app↔MCP partagé), allowlist postes/RULE_CATEGORIES, remap casse/accents, inconnue → ruleCategorize sinon « Non catégorisé », remaps comptés au summary. Description du tool dérivée de source unique. Panel 4 agents (code-reviewer, silent-failure-hunter, security-privacy, ai-reviewer) appliqué. MERGÉE. Nouveau ticket [AI-CATEGORIZE-MISSING-ID] (S) découvert.
> **✅ PR #503 `[AI-CATEGORIZE-MISSING-ID]` (MERGÉE, squash fde0eec, 2026-07-24, branche `claude/progress-check-yua8yy`)** : trace des transactions omises par le modèle dans `categorizeBatch` + triage Dependabot #26 ([DEP-HONO-TRAVERSAL] non exploitable, en attente upstream) + action Cloud Run remise en attente. Panel 2 agents appliqué.
> **PR #504 `[AUTH-DRIVE-STILL-RECONNECT]` (DRAFT, branche `claude/progress-check-yua8yy`)** : instrumentation des échecs de renouvellement Drive (traceSilentAuthFailure : raison GIS throttlée, sévérité info/warning) + fermeture trou 401 DriveAuthError. Panel 2 agents en cours, ready+auto-merge imminents. ⚠️ **Bug Marc signalé : « pas assez d'icônes dans Futur »** — cause trouvée (thinEvents sous-remplit cap de densité), fix prévu tâche #35 PR séparée post-merge #504.
>
> ## 🟡 Session 2026-07-23 (suite 9) — BUDGET-3-VUES : Budget par poste 3 colonnes réel/moy.12m/cible (PR #500, DRAFT — auto-merge armé)
> **En cours** `[BUDGET-3-VUES]` : tableau Budget 3 colonnes — réel période · moyenne 12 mois (mois courant exclu, sans historique → « — ») · cible.
> Bandeau groupe (réel/moy/cible gaté mode discret). `buildMonthlyLedger` + `computeAvgByItem` sources uniques. Panel `/review-all` fait (4 agents) :
> findings a11y (sr-only sur colonnes) + tests câblage corrigés ; finding financial-integrity (rapprochement fuzzy vs exact) routé BACKLOG `[BUDGET-MATCH-UNIFY]`.
> Auto-merge sera armé immédiatement après ce handover.
>
> ## 🟢 Session 2026-07-23 (suite 8) — QUOTE-NEGATIVE-CACHE, QUOTE-MARKET-TIMESTAMP : cache négatif + horodatage marché (PR #499, MERGÉE)
> **✅ `[QUOTE-NEGATIVE-CACHE]` + `[QUOTE-MARKET-TIMESTAMP]`** (PR #499) : cache négatif TTL par symbole —
> 3 échecs CONSÉCUTIFS (fenêtre 7 j) → skip 24 h quotes / 7 j profils, auto-guérison à l'expiration, entrées
> non FINIES rejetées à la lecture (durcissement anti-tampering `1e999`→Infinity, finding sécurité), purge au
> bouton Actualiser + changement de clé provider. Contrat historique null=erreur / []=vide cacheable PRÉSERVÉ
> (périmètre historique exclu volontairement). Horodatage marché (`priceUpdatedAt` = heure du COURS si plausible
> ≥ 2000-01-01 et ≤ maintenant+10 min, sinon heure de fetch). BACKLOG cochés, CHANGELOG fait.
>
> ## 🟢 Session 2026-07-23 (suite 7) — INVEST-PERF-PERIOD : sélecteur de période Performance (PR #498, MERGÉE)
> **En cours `[INVEST-PERF-PERIOD]`** : sélecteur de période (24h / 7j / 1M / 3M / 6M / YTD / 1a) sur la carte
> Performance d'Investissements + chips du graphe + cartes par titre. Helper pur `services/history/periodReturn.ts` :
> `seriesReturnPct` (variation valeur TOTAL/buckets) + `priceReturnPct` (performance titre natif via `priceHistory`).
> Benchmark Marché = prix CW8/MSCI (repli CSV). Pas de baseline → null/« — ». Score santé : momentum fixé 24h.
> Panel : finding ÉLEVÉ corrigé (`isBenchmarkCandidate` — « MSCI » nu matchait Amundi MSCI Em Asia) + tri
> déterministe dates dupliquées. MERGÉE (squash `7fbdccb`).
>
> ## 🟢 Session 2026-07-23 (suite 6) — DEP-DEPENDABOT-2026-07 : npm audit + assetMeta seed (PR #497)
> **✅ `[DEP-DEPENDABOT-2026-07]`** : `npm audit fix` — HIGH corrigés (fast-uri 0.1.50, dompurify 3.0.11) ;
> résiduel @hono/node-server (2 MODERATE, inexploitable mesuré) documenté BACKLOG. + 2 entrées seed assetMeta
> (EPA:GBS, EPA:AASI — tickers de Marc non couverts Finnhub). Tests 2985 verts (inchangés). Build OK.
> BACKLOG+CHANGELOG déjà à jour. **Suite : [INVEST-ALLOC-GEO-SECTOR] (déjà livré, #496).**
>
> ## 🟢 Session 2026-07-23 (suite 5) — INVEST-ALLOC-GEO-SECTOR : répartitions géo/secteur (PR #496)
> **✅ `[INVEST-ALLOC-GEO-SECTOR]`** : Asset.sector/region champs additifs optionnels ; resolveAssetMeta
> (normalisation : champ > seed statique > crypto > « Autre ») ; assetProfileSync (auto-populate profil
> Finnhub au boot) ; sélecteurs Région/Secteur inline dans les cartes d'allocation (Investissements).
> Tests 2985 verts (+14). BACKLOG [INVEST-ALLOC-GEO-SECTOR] ✅ coché. Suite : [BUDGET-3-VUES] (plan-first).
>
> ## 🟢 Session 2026-07-23 (suite 4) — INVEST-CURVES-LOW : graphe investissements (PR #495)
> **✅ `[INVEST-CURVES-LOW]`** : graphe Investissements dégagé (notes de couverture + diagnostic repliés en
> `<details>`, ligne « N points » retirée, 400→520px), StockChart auto-défaut Base 100 en séries disparates
> (choix manuel prime) + fix base éparse (courbe figée à 0), correctifs panel (tooltipValue « — » sur null +
> yFormatter respecté, aria-pressed + aria-live, cibles tactiles summary, h4 sr-only, isPrivacyMode enfin
> passé au StockChart). Tests 2971 verts. BACKLOG [INVEST-CURVES-LOW] ✅ coché, CHANGELOG et leçon CLAUDE.md
> déjà faits. **Suite : [INVEST-ALLOC-GEO-SECTOR], [BUDGET-3-VUES] (plan-first).**
>
> ## 🟢 Session 2026-07-23 (suite 3) — HIST-MULTI-PROVIDER : quotes multi-providers (PR #494)
> **✅ `[HIST-MULTI-PROVIDER]`** (suite de #493 coverage-total) : chaîne de quotes multi-providers
> (CoinGecko crypto, Finnhub stock-US, Yahoo Finance via proxy same-origin `/api/history/yahoo/:symbol`
> pour Euronext/CAD) + repli quote `meta.regularMarketPrice` sans nouveau rewrite. Actualiser les cours =
> purge cache history + hydratation forcée + quotes fraîches. HistorySyncDoctor : diagnostic par titre
> (symbole de cotation inline, recherche `/api/search/yahoo` par NOM de titre), module `services/history/syncDiagnostics.ts`,
> composant `HistorySyncDoctor` sur Investissements. Rewrites vercel.json + proxy vite dev. Tests 2954 verts (+24).
> ADR complet docs/decisions.md (bloc HIST-MULTI-PROVIDER). Leçons CLAUDE.md portées.
>
> ## 🟢 Session 2026-07-23 (suite 2) — HIST-COVERAGE-TOTAL : portefeuille complet (PR #493)
> **✅ `[HIST-COVERAGE-TOTAL]`** (panel 30 agents, 9 confirmés, 17 vérifiés) : le TOTAL du portefeuille couvre
> TOUT — titres sans historique comptés à valeur actuelle (contribution plate, noHistorySymbols), backfill pré-historique,
> queue périmée au currentPrice, variantes Yahoo-devise persistées (Asset.historySymbol, additif). ADR-complet docs/decisions.md.
> Trade-off assumé : reconstructibilité `TOTAL == Σ colonnes` ne tient plus dès qu'existe un titre sans historique —
> test coché, usage cohérent (UI+modals). Tests 2930 verts (+24 dont correctifs panel, gate propre). BACKLOG [HIST-COVERAGE-TOTAL] ✅ coché,
> [HIST-GOOGLE-PARITY] absorbé. Suite : [INVEST-CURVES-LOW], [INVEST-ALLOC-GEO-SECTOR], [BUDGET-3-VUES] (plan-first).
>
> ## 🟢 Session 2026-07-23 (suite) — ASSISTANT-HUB : fusion Prochaine action + Assistant (PR #492)
> **✅ `[ASSISTANT-HUB]`** (plan PM+architect suivi) : onglet Assistant VISIBLE dans la nav (remplace
> ACTIONS — cause du « je ne vois pas l'onglet assistant ») ; cartes de signaux purs
> (`useFinancialSignals`→`computeFinancialSignals`, MÊME moteur que le tool MCP — un seul avis) au-dessus
> du chat, clic → discussion contextualisée ; widget Haiku getNextBestActions + cache 1h RETIRÉS ;
> `Tab.ACTIONS` retiré de l'enum (8 sites, typecheck = filet) + redirect `#ACTIONS`→`#ASSISTANT` ;
> mode discret = clic désactivé (ADR). Tests : parité narrow↔full (garde anti-staleness du hook),
> clic/discret discriminants, scan redirect. ADR : docs/decisions.md.
>
> ## 🟢 Session 2026-07-23 — vague 1.5 : panneau réparé + Budget à 100 % (PR #491)
> **Fix bug Marc (captures)** : auto-scroll du chat par `scrollTop` sur le CONTENEUR de messages —
> `scrollIntoView` scrollait le drawer overflow-hidden parent (header/conversation invisibles). Prouvé/
> verrouillé par e2e `e2e/chatPanel.spec.ts` (Chromium réel ; env cloud : PW_LOCAL_CHROMIUM pour pointer
> le Chromium préinstallé). **Vague 1.5** : `BudgetViewDetail.cards` (label/valeur AFFICHÉE/note de
> PROVENANCE, assainies au prompt-build) — Impact à long terme (estateNetWorth de lastProjection),
> Sensibilité, Fin de mois, ventilation revenus, statut, dépassements. Le chat peut EXPLIQUER chaque
> chiffre de la page Budget. BACKLOG enrichi (demandes Marc) : [BUDGET-3-VUES], [HIST-COVERAGE-TOTAL]
> (courbe 190k vs 242k réels — titres sans historique exclus), [INVEST-ALLOC-GEO-SECTOR], [INVEST-CURVES-LOW],
> [HIST-GOOGLE-PARITY] (réponse : pas d'API Google Finance — viser la parité par couverture), [DEP-DEPENDABOT-2026-07].
>
> ## 🟢 Session 2026-07-22 (suite 6) — CHAT-PAGE-CONTEXT vague 1 : chat conscient de la page (PR #490)
> **✅ `[CHAT-PAGE-CONTEXT]` vague 1** (demande Marc « le chat réagit à tout sur la page », OK donné d'avance,
> plan PM+architect suivi) : registre pur `services/aiChat/viewContext.ts` (Tier 1 = onglet actif partout via
> `TAB_LABELS` déplacé dans `constants.ts` ; Tier 2 = détail publié par la page) + `useViewContextPublisher`
> (gate mode discret À LA SOURCE) + `useViewContextSnapshot` (badge). Injection en FIN de `system` (figée par
> envoi — ADR : PAS un tool, relu à chaque tour = dérive ; registre app↔MCP jamais forké), capture SYNCHRONE
> avant tout await dans sendMessage. Budget instrumenté (période/vue/dépenses/cible/revenus/top3/filtre —
> RÉUTILISE totalSpentDisplay/computeIncomeBreakdown, jamais un 3e chiffre, parité verrouillée par test).
> Page non instrumentée → aveu honnête. Vague 2 (autres onglets) : `[CHAT-PAGE-CONTEXT-V2]` au BACKLOG.
>
> ## 🟢 Session 2026-07-22 (suite 5) — B3+B4 : choix du modèle par conversation + coût réel (PR #489)
> **✅ `[B3-CHAT-MODEL]` + `[B4-CHAT-COST]`** (fin de la roadmap chat B de Marc) : sélecteur Haiku/Sonnet/Opus
> dans le header du chat, PAR conversation (`AppState.aiChatModel` additif pour l'active, porté dans
> `AiConversation.model` à l'archivage, restauré à la bascule ; pré-B3 → sonnet). Source unique des ids :
> `services/aiChat/models.ts` (`MODEL_IDS` — `services/claude.ts` en dérive ses constantes). Coût RÉEL :
> `agentLoop` accumule `msg.usage` par tour (présent sur TOUS les stopReasons — l'annulation compte ses
> tours payés) → `services/aiChat/pricing.ts` (tarifs $/MTok datés/sourcés : haiku 1/5, sonnet 3/15, opus
> 5/25 ; cache read 0,1×/write 1,25×) → `costUsd` par réponse (persisté) + cumul à vie `aiChatCostUsdTotal`.
> Affichage CAD via `fxRates.USD` (`formatCostCad` — « < 0,01 $ », jamais un faux 0,00 $) : bulle, header
> (conv + total), sidebar (coût + modèle par archive). Modèle sans tarif → null honnête + logError (garde de
> parité ids↔tarifs par test). Défauts store/MCP/backup en parité. **Roadmap chat B TERMINÉE (B1→B4).**
>
> ## 🟢 Session 2026-07-22 (suite 4) — B2 : onglet + historique multi-conversations + pièces jointes cross-device
> **✅ `[B2-CHAT-HISTORY]` implémenté** : `aiConversations`/`activeAiConversationId` (additifs — `aiConversation`
> RESTE l'active, source unique, jamais dupliquée dans la liste), logique pure `services/aiChat/conversations.ts`,
> UI `AiConversationList` (sidebar onglet md+ / sélecteur mobile, gelée pendant un envoi, zone mode discret),
> octets des pièces jointes en fichiers Drive appdata SÉPARÉS (`attachmentDriveStore.ts` : push best-effort à
> l'envoi, fetch au cache-miss sur l'autre appareil, delete avec la conversation, skip mode test). Défauts MCP
> mis en parité (appStateDefaults). **Panel 4 agents APPLIQUÉ** : CRITIQUE droit-à-l'effacement
> (`deleteRemoteData` wipe désormais les `financeai-chat-attach-*`) ; ÉLEVÉS course flags-avant-await
> (sonde : un message atterrissait dans la MAUVAISE conversation pendant la lecture d'un fichier) +
> suppression Drive paginée/tracée ; MOYENS TTL 60s sur les fetch ratés (course de sync cross-device),
> cap 30 archives (payload sync borné), focus/contraste/SR a11y, purge caches au changement de compte.
> Reste latent → BACKLOG `[PERSONA-SANITIZE-CHAT]`. Ensuite B3 (choix modèle) + B4 (coût CAD).
>
> ## 🟢 Session 2026-07-22 (suite 3) — B1 : pièces jointes multimodales du chat (PR #487)
> **Panel 5 agents APPLIQUÉ en commit de suivi** : CRITIQUE fichier 0 octet (tour évaporé de l'historique
> modèle, sonde) → plancher + garde par type + repli honnête ; ÉLEVÉS : suggestion-jette-fichier (sonde),
> budget agrégé 20 Mo/message (limite API par REQUÊTE ≠ par fichier), `cache_control` sur le dernier bloc
> pièce jointe (un PDF était re-facturé jusqu'à ~30× sur la clé BYOK) ; MOYENS : éviction cache hors fenêtre
> + purge inter-persona (enableTestMode/disableTestMode), nom de fichier jamais dans logError (peut porter
> un montant), erreur API 400 pièce jointe → « retire-la » (pas « réessaie »), contraste puces ink-200
> (mesuré 7,1:1, l'ancienne puce toolsUsed corrigée au passage), cible retirer ≥24 px, aria-live.
> **✅ `[B1-CHAT-ATTACHMENTS]`** (roadmap chat B, scope validé Marc) : images/PDF/texte-CSV joignables au
> chat (trombone, panneau + onglet), envoyés en blocs multimodaux Anthropic. `services/aiChat/attachments.ts`
> (pur : classify allowlist+bornes, read → base64/texte, buildUserContent, cache session par id message),
> `useAiChat.sendMessage(text, files?)` (lecture AVANT append — échec = refus honnête de l'envoi entier ;
> historique multimodal tant que le cache vit, note « contenu non disponible » post-reload), transcript =
> MÉTA seulement (ADR-4, jamais d'octets dans le store/push Drive), anti-injection (neutralizeFrameTags sur
> fichiers texte + clause system prompt). 15+4 tests. Boot inchangé (~109 kB gzip, SDK toujours absent).
> **Suite : B2 (onglet + multi-conversations Drive, octets → fichiers appdata), B3 (choix modèle), B4 (coût).**
> ⚠️ Marc a RÉITÉRÉ « plus me reconnecter à Drive tout le temps » APRÈS le merge de #483 → suivi
> `[AUTH-DRIVE-STILL-RECONNECT]` au BACKLOG (vérifier en prod post-deploy ; instrumenter si ça persiste).
>
> ## 🟢 Session 2026-07-22 (suite 2) — PORTFOLIO-HISTORY : courbes de cours réelles (bug Marc) — PR #485
> **✅ `[PORTFOLIO-HISTORY]` implémenté + panel appliqué** (bug Marc « je vois pas le cours ni le cours du
> portefeuille ») : cause = stub CSV mort (`fetchPortfolioHistory`→[]) → graphes vides en réel. Livré : chaîne
> d'historique gratuite `marketData.getHistory` (Finnhub clé Marc → repli Yahoo via proxy same-origin
> `/api/history/yahoo` [rewrite vercel.json + proxy vite dev] → CoinGecko crypto ; contrat null=erreur JAMAIS
> cachée / []=vide cacheable, PROPAGÉ jusqu'à l'hydratation) ; hydratation `services/history/hydrateAssetHistories`
> (depuis 1er achat, pacing 2,5s, fraîcheur 24h, FUSION ancien∪nouveau au re-sync, garde devise crypto,
> anti-course, skip mode test) au boot App ; builder pur `services/history/buildMarketData` (DCA qty(t) ×
> close natif × FX → CAD, colonnes AGRÉGÉES multi-comptes, buckets TOTAL_*, prix périmé >7 j exclu,
> excludedSymbols + partialHistorySymbols) ; `usePortfolioHistory` DÉRIVE du store → Dashboard (piles depuis
> les buckets émis), Investissements (chips distinctes, isTotal strict), StockComparisonModal (union des
> clés) ; matching par `historyKeyMatchesSymbol` (exact, jamais includes). **Panel adversarial wf 30 agents :
> 9 confirmés appliqués, 17 vérifiés inline après un « session limit » des agents verify** (8 réels corrigés,
> 3 → BACKLOG [HIST-*], reste réfuté). Cache IDB survit au boot (configure idempotent + sweep expirés).
> ⚠️ Suivi : smoke test Yahoo proxy en PROD après deploy (query params period1/period2 — prouvés OK en dev,
> [Probable] côté Vercel).
>
> ## 🟢 Session 2026-07-22 (suite) — Google Drive : rester connecté + déconnexion auto 8h + roadmap chat
> **En cours `[AUTH-DRIVE-INACTIVITY]`** (demande Marc « plus me reconnecter à chaque fois + déconnexion ~8h d'inactivité ») :
> ré-auth SILENCIEUSE au boot (`renewTokenSilently` prompt='' sur cache-miss, GATÉE sur < 8h d'inactivité) + minuteur 8h
> (`services/sync/inactivityLogout.ts`) → `handleInactivityLogout` révoque le jeton (garde la meta, reconnexion 1-clic).
> Données locales jamais touchées. Tests : `inactivityLogout.test.ts` (8) + 2 dans `syncOrchestrator.flow.test.ts`. Panel
> security-privacy + cycle PR à suivre. **ROADMAP CHAT (B, plan-first, scope validé Marc)** : B1 pièces jointes (images+PDF+CSV
> multimodal, stockées en fichiers Drive appdata SÉPARÉS — pas inline), B2 onglet dédié + historique multi-conversations (sync
> Drive), B3 choix modèle Haiku/Sonnet/Opus par conv, B4 coût (tokens×tarif → total + par conv, CAD). + BACKLOG `[FUTURE-ICONS-EXHAUSTIVE]`
> (icône pour tout événement + LOD par priorité au zoom). ⚠️ Rappel : fix SEC `[MCP-WRITE-SUMMARY-SCRUB]` actif sur claude.ai
> seulement au **prochain deploy Cloud Run** (workflow deploy-mcp SKIPPED : `GCP_PROJECT_ID` non défini → deploy manuel).
>
> ## 🟢 Session 2026-07-22 — Refresh planifié des prix (`HUB-REFRESH-CRON`) livré (GO Marc « code tout »)
> **Problème Marc** : « les données de finance ai sont pas à jour mais j'ai pas envie d'aller dans l'app
> pour que ce soit à jour ». Cause racine : seule l'app navigateur poussait l'état dans Drive → tout
> figeait dès l'onglet fermé. **Solution livrée** : `mcp/refreshPrices.ts` (`runPriceRefresh` — lit le
> blob, rafraîchit les cours via le moteur PARTAGÉ `services/priceRefresh` en `force:true`, réécrit avec
> l'OCC ; ne touche QUE `currentPrice`, jamais les données saisies ; skip honnête si pas de provider) +
> route `POST /refresh` (`mcp/http.ts`, activée par `FINANCEAI_REFRESH_SECRET` ≥16 car., Bearer temps
> constant, conflit OCC = `200 {ok:false, conflict:true}` transitoire mais panne RÉELLE = `5xx` pour
> que le cron rougisse — `StateConflictError` typée, finding sécu ÉLEVÉ appliqué) + déclencheur GitHub Actions gratuit
> (`.github/workflows/refresh-prices.yml`, 6 h + manuel — Cloud Run dort, un cron externe le réveille).
> `deploy.sh` monte `financeai-refresh-secret` + `financeai-finnhub-key` (optionnelle, actions) depuis
> Secret Manager s'ils existent. Tests `tests/mcp/refreshPrices.test.ts` (7, verts). ADR `docs/decisions.md`.
> ⏳ **Marc doit** : créer les secrets Cloud Run (`financeai-refresh-secret` + `financeai-finnhub-key`),
> redéployer (`./mcp/deploy.sh`), puis créer les 2 secrets GitHub (`FINANCEAI_MCP_URL` +
> `FINANCEAI_REFRESH_SECRET`). Détail : `mcp/README.md` § Refresh planifié.
>
> ## 🟢 Session 2026-07-22 — Chantier Claude-in-app COMPLET (A→E + audit SEC)
> **✅ `[AITOOLS-SEC]` livré — chantier CLÔTURÉ.** Audit de sécurité final (panel security-privacy + ai-reviewer,
> sondes exécutées) sur toute la surface. **Verdict : sain.** Rapport `docs/AUDIT_SEC_CLAUDE_IN_APP_2026-07-22.md`.
> Prouvés SAINS : aucune écriture sans confirmation, clés API exclues, Loi 25/mode discret, isolation persona,
> lecture zéro-mutation, parité claude.ai. **3 findings corrigés** : `[MCP-WRITE-SUMMARY-SCRUB]` (ÉLEVÉ — injection
> indirecte côté serveur MCP, le scrub app jamais porté au serveur → helper PARTAGÉ `scrubWriteResult.ts` ;
> ⚠️ effet claude.ai au prochain deploy Cloud Run), `.finite()` sur 3 tools lecture + garde-scan, `refusal`
> fin dégradée honnête. Optimisations coût routées (non-sécurité) : `[AITOOLS-PROMPT-CACHE]`, `[PERF-SDK-BOOT-PRELOAD]`.
> **Chantier Claude-in-app : A→E + SEC = TOUT livré.** Suite possible (au choix Marc) : P2 (tools d'écriture
> supplémentaires : transactions/objectifs/budgets/actifs/immobilier, réutilisent l'infra de confirmation) + P3
> (visuels des 5 surfaces). Marc doit encore VALIDER en prod (questions réelles dans l'onglet Assistant).
>
> ## 🟢 Session 2026-07-22 — Chantier Claude-in-app : Lot E livré (chat PARTOUT)
> **✅ `[AITOOLS-E]` livré** : le conseiller IA est accessible sur TOUS les onglets (panneau latéral global
> `AiChatLauncher`, FAB partout, lazy) + onglet Assistant pleine page. `AiChatProvider` (monté App) = UNE
> instance `useAiChat` partagée → même conversation/état sur les deux surfaces ; rendu mutualisé `AiChatView`
> (variant panneau/onglet). Résout à la RACINE le finding Lot D « promesse orpheline au démontage d'onglet »
> (chat plus jamais démonté par onglet ; modal rendu 1× par le provider). Boot inchangé (~107 kB gzip : SDK en
> import dynamique dans useAiChat). ⏳ Panel (a11y + code-reviewer + silent-failure + ai-reviewer) en cours sur
> le diff commité. **Reste au chantier** : SEC (audit sécurité final, exigence Marc). Puis P2 (tools d'écriture
> supplémentaires) + P3 (visuels des 5 surfaces).
>
> ## 🟢 Session 2026-07-21 (suite) — Chantier Claude-in-app LANCÉ (GO Marc) — Lot A livré
> **GO Marc** : « go jusqu'à tout fini et testé + audit de sec à la fin + aucune donnée changée + résultat fiable ».
> Plan 5 lots validé (PM + architect) — détail et décisions verrouillées : BACKLOG §Chantier Claude-in-app.
> **✅ `[AITOOLS-A]` livré (#475)** : 16 tools MCP scindés spec (pur, browser-safe) / register (mince) — parité
> d'enregistrement MESURÉE 16/16 (worktree HEAD vs courant), suite MCP verte, garde `noMcpSdkInSpecs`.
> **✅ `[AITOOLS-B]` livré** : `services/aiTools/` (boucle agentique tool-use lecture, 11 tools, cap 6 tours,
> validation zod explicite) + `appStateProvider` (snapshot plat via la MÊME normalizeAppState que le MCP,
> extraite browser-safe → `mcp/state/appStateDefaults.ts`). Parité de payloads PROUVÉE (8×2 personas) +
> preuve « aucune donnée changée ». ⚠️ Piège trouvé au test : l'état du STORE porte les ACTIONS Zustand →
> structuredClone du what-if plantait (« could not be cloned ») — d'où le pick data-only + normalize.
> **✅ `[AITOOLS-ENGINE-WORKER]` livré (#477)** : 3 tools moteur → runProjectionAsync (Worker navigateur,
> repli sync Node/MCP), withState async-compatible, garde-scan anti-appel-direct.
> **✅ `[AITOOLS-C]` livré (PR #478)** : AiAssistant en tool-use (useAiChat partagé), generateContext
> SUPPRIMÉ, chips, bannière mode test, mode discret = chat masqué entier, bundle boot inchangé. Panel sur
> diff COMMITÉ : abort ≠ error (plus de faux logs), identité de message par ID + réentrance par ref +
> Effacer gelé pendant envoi, divergence écran-Futur-figé vs get_projection expliquée au system prompt.
> ⚠️ **INCIDENT revert conteneur** : le Lot C NON COMMITÉ a été effacé pendant l'attente du panel (agents
> orphelinés en prime) — ré-appliqué depuis la mémoire de session. RÈGLE : committer AVANT tout panel.
> ⏳ Marc doit VALIDER le critère d'arrêt en prod (5 vraies questions → réponses correctes).
> **✅ `[AITOOLS-D]` livré (PR #479)** : écritures avec CONFIRMATION — `writeExecutor` (diff pur applyDocument →
> modal `AiChatConfirmModal` → recalcul sur état FRAIS anti-course → backup auto OBLIGATOIRE sinon pas
> d'écriture → setAppState sans apiKeys) ; apply_* déclarés à l'API SEULEMENT si l'exécuteur est branché ;
> Annuler/✕/Échap/backdrop = refus explicite. Panel 4 agents (sondes) → 6 findings appliqués : mode discret
> masque le modal (Loi 25), promesse orpheline au démontage d'onglet, scrub injection du `summary`, Annuler
> coupe tout le lot de tool_use, `.finite()` sur 5 specs. 17 tests + fix flake oauthProvider. Découverte :
> `[MCP-WRITE-SUMMARY-SCRUB]` (même vecteur côté serveur MCP, au BACKLOG).
> **Suite** : E (panneau latéral global + onglet agrandi — useAiChat déjà prêt), SEC (audit final),
> puis P2 (tools d'écriture supplémentaires : transactions, objectifs, budgets, actifs, immobilier).
> + `[DEP-AUDIT-2026-07]` mergé (#474) : npm audit 4→0 vulnérabilités (adm-zip 0.6 prouvé par mcp:pack).
>
> ## 🟢 Session 2026-07-21 — Lot audit n°2 : les 6 restants (« go ») + cadrage MCP/Claude-in-app
> **✅ Lot des 6 restants de l'audit livré (1 PR)** : `[MCP-TOOLS-SILENT-CATCH]` (logError aux 6 catch de
> frontière MCP), `[SYNC-APIKEYS-SILENT]` (échec coffre journalisé au pull), `[DEBT-SUM-DUP]` (HealthIndicator +
> DebtManager → computeTotalDebt), `[MCP-USERTEXT-LANDMINE]` (+4 clés préventives, `notes` réservé code-auteur),
> `[LOG-TOKEN-ANCHORED]` (`.*token` suffixe), `[MCP-RUNPROJECTION-AMBIG]` (description clarifiée). 6 tests
> discriminants prouvés rouges pré-fix. §Audit 2026-07-16 : TOUT est coché sauf la découpe god-files (L, plan-first).
> **🎯 NOUVEAU CHANTIER demandé par Marc (2026-07-21)** : « grandement améliorer le MCP », app surtout
> visuel/affichage (l'usage passe par Claude), + Claude INTÉGRÉ dans l'app qui consomme le MCP directement.
> Marc veut un cadrage par questions (« pose plein de questions ») → batch de cadrage envoyé, EN ATTENTE de ses
> réponses avant tout plan/code (plan-first).
>
> ## 🟢 Session 2026-07-17 — Lot corrections audit passe n°2 (« go correction »)
> **✅ Lot 1-2-3 de l'audit livré (1 PR)** : `[STORE-REHYDRATE-SILENT]` (CRITIQUE — `onRehydrateStorage` +
> `getHydrationStatus()` + paliers de migration tracés + toast « NE RIEN SAISIR, restaure un backup », blob intact),
> `[DASH-NW-DUP]` (HIGH — repli Dashboard → `computePresentNetWorth`, dettes enfin soustraites ; `computeTotalDebt`
> gardé ; périmètre immo + « salaire déclaré » étiquetés), `[INCOME-3WAY-SPLIT]` (HIGH — `buildFinancialSnapshot`
> → moyenne réelle des transactions, repli étiqueté `monthlyIncomeSource` ; prompts claude.ts étiquetés ;
> NextBestAction routé sur le helper partagé). 6 tests discriminants prouvés rouges pré-fix (git-stash séquentiel).
> **Restants audit** (BACKLOG §Audit 2026-07-16) : `[MCP-TOOLS-SILENT-CATCH]`, `[SYNC-APIKEYS-SILENT]`,
> `[DEBT-SUM-DUP]` (reste HealthIndicator:108 + DebtManager:73), `[MCP-USERTEXT-LANDMINE]`, `[LOG-TOKEN-ANCHORED]`,
> `[MCP-RUNPROJECTION-AMBIG]`, découpe god-files (L, plan-first).
>
> ## 🟢 Session 2026-07-16 — Durcissement sync/MCP + a11y + Budget + persistance Drive/projection
> **✅ Mergés** : ARCH-SYNC-SPLIT (#455), SYNC-FETCH-TIMEOUT (#456), A11Y-CHECK-CONTRAST-DRIFT (#457), GHOST-BUTTON (#458),
> BORDER-SWEEP boutons (#459), MCP-WRITE-VERSION-TOKEN OCC (#460), `[BUDGET-MONTH-NAV]` (#461), `[BUDGET-INCOME-REAL]` (#462),
> `[TAX-MCP-INCOMEAVG-TEST]` (#463), `[AI-PROMPT-FAKE-ZERO]` (#464), `[MCP-PROMPT-SCRUB]` (#465). **En cours** :
> `[AUTH-DRIVE-PERSIST]` (#466, MERGÉ) — « ne plus me reconnecter à Drive à chaque reload » : jeton `sessionStorage`→
> `localStorage` (clé dédiée, jamais synchronisée) + renouvellement silencieux avant ~1h ; panel a trouvé + fixé une régression
> HIGH (sync fantôme cross-onglet post-déconnexion → écouteur `storage`). **En cours : `[PROJECTION-PERSIST]`** — la projection
> révélée RESTE (signature persistée+synchronisée dans le store ; blob figé IDB record `revealed`) et se FIGE quand les entrées
> changent (badge « Pas à jour » + boutons Recharger/Rechoisir, choix Marc : figer). Gel coupé en mode test. Panel (3 agents)
> → 4 findings réels appliqués (garde no-fake-data reload, garde suppression blob en mode test, hash de sig, dédup IDB) ;
> 7 tests discriminants + round-trip IDB réel (fake-indexeddb) — **MERGÉ (#467)**. Puis `[A11Y-BANNER-HOVER-CONTRAST]` :
> hover quota BackupReminder 3,76:1 → `brightness-90` (5,23:1 mesuré ; le facteur dépend de la base, jamais copier).
> **🔬 AUDIT FINANCIER passe n°2 (demande Marc « gros checkup ») : rapport `docs/AUDIT_FINANCIER_2026-07-16.md`** —
> cœur AAA (fiscal 0 écart, conservation 0,02 $ max sur 31 scénarios, 2661/2661, 0 vuln) ; lot de juin fermé 12/14 ;
> MAIS 1 CRITIQUE (`[STORE-REHYDRATE-SILENT]` : réhydratation sans filet = app vierge sans trace) + 2 HIGH
> (`[DASH-NW-DUP]` repli NW sans dettes ; `[INCOME-3WAY-SPLIT]` IA/MCP sur salaire config) + suivis — tout au BACKLOG §Audit
> 2026-07-16. Prochain lot de corrections proposé à Marc (plan-first). **Décision Marc** :
> SEC-DRIVE-ENCRYPT-DEFAULT = NON ; refresh_token/backend = NON (archi 100% navigateur). **En attente Marc** : sweep a11y des
> CHAMPS (input/select) — regarder le rendu des boutons en preview d'abord.
>
> ## 🔴 Session 2026-07-15 (suite) — Incident « fausses transactions » : purge persona + chantier transactions/catégories/Budget
> **Incident** : Marc a trouvé des FAUSSES transactions dans ses vraies données (« je veux plus que ça arrive jamais »).
> Diagnostic (MCP + code) : ~600 transactions du persona de test « Karim » (`persona-tx-*`, activé ~06-07) + son objectif
> `kar-fg1` (« Indépendance financière 1 M$ ») mélangés aux ~200 vraies transactions Desjardins ; [Probable] budgets `kar-b*`
> aussi (expliquerait « catégories très mal réglées »). Fuite antérieure aux gardes actuelles, chemin exact inconnu
> (`[PERSONA-LEAK-ROOTCAUSE]` LOW au BACKLOG).
> **✅ LIVRÉ `[PERSONA-PURGE]`** : registre d'ids (`testPersonas/artifactIds.ts`, parité test-scan) + sanitizer pur
> (`personaSanitizer.ts`) à 5 ancrages (boot self-heal + toast, sortie mode test, push Drive, pull Drive, restauration
> backup). 22 tests. La purge chez Marc s'exécute au prochain chargement de l'app après déploiement Vercel.
> **✅ LIVRÉ (même session) `[TX-CATEGORY-RULES]` + `[BUDGET-TX-CATEGORIES]`** : règles déterministes de catégorisation
> (payees QC réels tirés de ses 37 relevés PDF uploadés — corpus extrait et PROUVÉ : 355 tx compte validées par soldes +
> 1 640 tx carte exactes au sou vs totaux imprimés, 19/19 relevés ; ~88 % de couverture) branchées import CSV + bouton
> Auto-catégoriser (règles AVANT IA) + MCP ; Budget auto-aligné sur les catégories des transactions (médiane 6 mois
> comme cible suggérée, retraits à la 1re passe du montage) + table « Historique par catégorie » 12 mois.
> **✅ (D) CSV livré à Marc** (1 995 tx validées au sou, 87 % catégorisées, instructions d'import données).
> **✅ LIVRÉ `[BUDGET-MONTHLY-LEDGER]`+`[BUDGET-PAST-AVG]`** : grand livre mensuel revenus+dépenses+solde (12 mois,
> mois courant marqué partiel et exclu des moyennes), budget du mois courant = moyenne de TOUT le passé (cibles
> `autoTarget` recalculées au chargement et en session ; édition manuelle décroche), tuiles KPI dédupliquées.
> **✅ LIVRÉ `[INCOME-PROVENANCE]`+`[TAX-DETAIL]` (Lot F)** : chaîne de vérité du revenu — salarySource estampillé
> (scan de paie UI + apply_payslip MCP avec `employer`), bannière de provenance + détail des retenues
> (féd/QC/RRQ v1+2/RQAP/AE, brut→net annuel+mensuel) + réel des transactions dans l'onglet Impôt ;
> get_tax_situation enrichi (perUser.withholdings/netMonthly/salarySource + realMonthlyAverages). MCP v0.7.1 —
> **✅ Cloud Run REDÉPLOYÉ par Marc (2026-07-16, « ça marche »)** : le connecteur claude.ai tourne sur la
> dernière version (v0.7.x + OCC MCP-WRITE-VERSION-TOKEN + MCP-PROMPT-SCRUB). Plus d'action en attente ici.
>
> ## 🟢 Session 2026-07-15 (suite) — Vidage du BACKLOG en vagues (plan PM validé « go tout ») — VAGUE 1 livrée
> Marc a demandé au PM l'ordre pour « tout corriger et vider le backlog », validé le plan en vagues, puis « go tout sans t'arrêter ».
> **Ordre** : V1 confiance quotidienne (S) → V2 fiscal money-critical (M) → V3 fondation sync (L, ARCH-SYNC-SPLIT d'abord) → V4 périphérique.
> **✅ VAGUE 1 livrée (6 items S)** : `[DETTE-PDF-FX-BYPASS]` (pdfReport + `useDerivedFinancials` — **2ᵉ bypass FX latent RÉVÉLÉ par
> le garde `assetFxGuard` resserré** ; les deux routés par `assetValueCad`), `[MCP-GET-HOLDINGS]` (tool `get_holdings`, MCP **v0.7.2**),
> `[CELI-ASSET-NUDGE]` (helper pur + bannière dismissible Investissements, NO-fake-data), `[MCP-FRESHNESS-PRECISION]` (heures+minutes < 48 h),
> `[DETTE-TOLOCALESTRING-NU]` (6 sites → formatNumber/formatCAD, zéro reliquat), `[DETTE-TESTGAP-MARKETDATA]` (6 tests routage pickProvider).
> Panel 6 agents (code-reviewer, silent-failure-hunter, financial-integrity, ai-reviewer, a11y-auditor, security-privacy) : cœur jugé net,
> ~8 correctifs mineurs appliqués (2 MEDIUM : celiNudge garde NaN, getHoldings log rendement non-fini ; + arrondi `round(Σ)`, aria-label
> Label-in-Name, hover contraste, taxApril remboursement). 3 findings pré-existants routés au BACKLOG (`AI-PROMPT-FAKE-ZERO`,
> `MCP-PROMPT-SCRUB`, `A11Y-BANNER-HOVER-CONTRAST`). **⚠️ Marc : redéployer Cloud Run pour MCP v0.7.2** (`get_holdings` + fraîcheur précise).
> **✅ VAGUE 2 livrée (fiscal money-critical, MCP v0.7.3)** : `[FISC-PAYROLL-BASE-INVEST]` + `[TAX-APP-MCP-BASE]` —
> `calculateFiscalReport` sépare l'assiette EMPLOI (RRQ/RQAP/AE = salaire) de l'assiette IMPOSABLE (paliers = salaire +
> placement) via un 7ᵉ param optionnel `employmentIncome` (défaut = grossIncome → **rétrocompat bit-identique** pour les
> ~15 appelants moteur, prouvé par projection-validator + moneyConservation 20/20). App (TaxCenter) et MCP (get_tax_situation)
> alignés sur le helper partagé `services/taxEstimate.ts`. **Mesuré ~1 016 $/an de cotisations sur-évaluées corrigées**
> (salaire 50 k + 230 k non-enreg), discriminant git-stash prouvé. Panel 4 agents : cœur correct ; 1 bug ÉLEVÉ que j'avais
> introduit (averageRatePct MCP sur salaire au lieu de l'assiette imposable) CORRIGÉ + `taxableInvestmentIncome` exposé.
> 2 items routés au BACKLOG : `[FISC-SOLO-INVEST-SPLIT]` (split par longueur de tuple sous-impose le placement d'un solo —
> pré-existant, à valider avec Marc car ↑ son impôt estimé), `[FISC-ASSETLOC-INTL]` ÉVALUÉ/DIFFÉRÉ (international en non-enreg
> chez Marc = pas de perte ; fix non trivial). **⚠️ Marc : redéployer Cloud Run pour MCP v0.7.3.**
> **✅ VAGUE 3a livrée** : `[UX-STATEMENT-REMINDER]` — bannière proactive « relevé du mois manquant » (onglet Budget,
> helper pur + dismiss keyé par mois, CTA vers Transactions). Le filet d'import mensuel qui manquait (leçon fuite persona).
> **✅ VAGUE 4a livrée (périphérique sûr, hors sync)** : `[SEC-VISION-CONSENT-INJECTION]` (clause anti-injection
> `VISION_INJECTION_GUARD` dans les 2 prompts Vision + avis de confidentialité explicite à l'upload, Loi 25),
> `[DETTE-DEADCODE-2026-07]` (locales `_` mortes retirées), `[BACKUP-PROMISE-CATCH]` (`await` du backup → rejet async logué).
> **✅ VAGUE 3b livrée** : `[ARCH-SYNC-SPLIT]` — `syncOrchestrator.ts` (892 l.) scindé en **9 modules à responsabilité
> unique + barrel de compat** verbatim (API publique inchangée, zéro appelant modifié) : `syncStatusStore` (propriétaire
> UNIQUE de `_status`, racine du DAG), `syncTypes`, `syncSnapshot`, `syncErrors`, `syncMeta`, `syncPush`, `syncPull`
> (applyPulledPayload = point d'écrasement 230k$), `syncLifecycle` (switch anti-clobber `runDecision`, `_decisionInFlight`),
> `syncPolling`, `syncPassphrase`. Invariants prouvés : `grep "let _status"`==1, double-ceinture persona (push+pull)==2 non
> fusionnée, `madge --circular`==0. 81 tests sync + suite complète + typecheck OK. Débloque le durcissement sync.
> **✅ VAGUE 3c livrée** : `[SYNC-FETCH-TIMEOUT]` — `withDriveTimeout` (AbortController 20 s) sur TOUS les appels
> `driveAppData.ts`, **lecture du corps comprise** (un 1er jet ne couvrait que les en-têtes → re-pendait sur un gros
> pull dont le corps stalle ; corrigé sur finding code-reviewer) → un réseau lent lève une `DriveError` honnête au lieu
> de pendre à l'infini. **+ `gateSilentResume` route désormais l'erreur Drive post-jeton via `handleError`** (avant :
> avalée en silence → renvoi muet au login ; finding silent-failure). Volet `keepalive` ÉCARTÉ à la mesure : keepalive/
> sendBeacon plafonnés à 64 Ko < payload sync réel → fiabilité `pagehide` = timeout+bannière+debounce (leçons CLAUDE.md).
> 5 tests (2 discriminants timeout en-têtes+corps, clearTimeout, repli userinfo, gate route l'erreur). Panel 2 agents (2 findings appliqués).
> **✅ VAGUE 4 (a11y)** : `[A11Y-CHECK-CONTRAST-DRIFT]` — `check-contrast.ts` LIT les tokens depuis `tailwind.config.js`
> (fini la dérive silencieuse) + garde anti-scan-vide. 60 combos, 0 non-conforme. `[A11Y-GHOST-BUTTON-PROMINENCE]` —
> bordure boutons `ghost`/`outline` `white/10`→`white/40` (~3,8:1 mesuré, WCAG 1.4.11 non-texte ≥3:1) au niveau du
> composant de design-system (corrige ~28 usages ; a11y-auditor a confirmé 3,76-3,82:1). `[A11Y-BORDER-PROMINENCE-SWEEP]`
> **PARTIEL** : 12 boutons d'action autonomes custom bumpés à `white/40` (TaxCenter/AiAssistant/Investments/Dashboard/Drive/
> SyncConflictModal/Budget). RESTE différé par type (jugement) : `<input>`/`<select>` (interaction focus), toggles à état
> conditionnel (l'actif a déjà bordure colorée), labels/dropzones — passe dédiée. Décoratifs hors périmètre.
> **✅ `[MCP-WRITE-VERSION-TOKEN]` (GO Marc « 2 oui » 2026-07-16)** : OCC per-call plumbé (`getWithVersion`/`save(next,
> expectedVersion)`, `DriveStateSource.loadRawVersioned`) → 2 tool-calls MCP concurrents ne se clobberent plus. Discriminant prouvé (git-patch).
> **⏸️ Décision Marc — `[SEC-DRIVE-ENCRYPT-DEFAULT]` = NON** (Marc 2026-07-16 « pas 1 ») : plan-first Claude avait tranché reco
> basse priorité (touche l'anti-clobber + migration format, gain modeste, clé `sub` non-secrète) → confirmé, on ne le fait pas.
> `[MCP-CHARTDATA-SUM-GUARD]` différé (lint heuristique, faux positifs). Reste sweep a11y sur les CHAMPS (input/select/toggle/
> dropzone) → en attente que Marc regarde le rendu des boutons en preview. ⚠️ Zone sync = là où Marc a perdu 230 k$ → prudence maximale.
>
> ## 🔴 Session 2026-07-14 — Incident perte de données Drive (230k$) + anti-clobber STRICT + audit 6 alertes MCP
> **Incident** : Marc a perdu 230k$ de placements. Chaîne : appareil silencieusement déconnecté (jeton Google expiré ~1h →
> `schedulePush` no-op EN SILENCE) → ses ajouts (jusqu'à 230k$) jamais poussés vers Drive → à la reconnexion, méta vierge →
> l'ancien `restoreIntent` de `decideOnLoad` faisait un `pull` qui a ÉCRASÉ le local avec une VIEILLE copie Drive (SPCX seul, 4k$).
> **✅ Récupéré** via l'auto-backup IndexedDB (`applyPulledPayload` → `createBackupNow('auto')` AVANT d'écraser → Réglages →
> Sauvegarde → « Restaurer » le plus gros backup). Confirmé bout-en-bout : le MCP relit 230k$ non-enreg + NW 181,9k$.
> **✅ LIVRÉ `[SYNC-ANTI-CLOBBER]` (PR à venir)** : `decideOnLoad` SANS `restoreIntent` (une seule garde : local réel + Drive
> divergent → `conflict`, jamais d'écrasement auto) + `SyncConflictModal` GLOBAL (résumé « cet appareil vs Drive ») +
> `SyncStatusBanner` (alerte déconnexion/erreur push) + `flushPush` (push au masquage d'onglet → MCP jamais périmé) + gate
> HARD-block (`LoginGate`). Discriminant git-stash PROUVÉ. typecheck clean, 34 tests sync verts. **⚠️ Marc doit mettre
> `VITE_GOOGLE_GATE=1` sur Vercel** pour activer le hard-block. **⚠️ NE JAMAIS conseiller déconnecter+reconnecter** (efface la
> méta = recrée le piège vierge).
> **Audit adversarial 6 alertes claude.ai (12 agents)** → BACKLOG (§ Intégrité Drive+MCP), tous CONFIRMÉS sauf 1 : `MCP-RETIREMENT-VERDICT`
> (CONFIRMED, money-critical, a induit Marc en erreur : verdict retraite ignore le décaissement du portefeuille), `MCP-PAYSLIP-BACKUP`
> (CONFIRMED : écrit Drive sans backup ni garde de concurrence), `MCP-TAX-COUPLE` (PARTIAL : fusionne les 2 salaires, ≈nul pour Marc mono-salarié),
> `PROJ-TAXPAID-LABEL` (PARTIAL non-money-crit : `totalTaxesPaid` mal nommé), `CELI-ASSET-NUDGE` (CONFIRMED : virements CELI suivis mais compte
> destinataire non → CELI=0). Moteur impôt couple **REFUTED** (déjà per-conjoint, aucun bug). **⚠️ Les fixes MCP requièrent un REDÉPLOIEMENT Cloud Run.**
> **✅ LOT MCP v0.6.0 LIVRÉ (même session, 2e PR)** : les 4 items MCP + surface TAXPAID faits — `MCP-RETIREMENT-VERDICT`
> (décaissement visible + verdict = soutenabilité minNetWorth/MC ; ⚠️ leçon : le décaissement NON-ENREGISTRÉ n'a pas de champ
> `Retrait*` moteur → toute somme de revenus retraite depuis chartData SOUS-estime, cf CLAUDE.md), `MCP-TAX-COUPLE`
> (per-conjoint, discriminant 60/60 → 22 126 $/36,1 % vs fusionné 33 435 $/45,7 %), `MCP-PAYSLIP-BACKUP` (backup Drive
> horodaté rolling 5 FAIL-CLOSED + garde de concurrence updatedAt + cache store invalidé sur échec), `MCP-STALE-FRESHNESS`
> (note de fraîcheur sur chaque réponse withState, seuil 6 h), `PROJ-TAXPAID-LABEL` surface (`netTaxSettlements` + note ;
> reliquat moteur au BACKLOG). Discriminants git-stash prouvés (8 tests échouent sur l'ancien code). v0.6.0.
> **⚠️ ACTION MARC : redéployer Cloud Run** (`mcp/deploy.sh` depuis son poste) pour activer v0.6.0 sur claude.ai.
> **✅ v0.6.0 DÉPLOYÉE par Marc (même session, ~18:45Z)** — révision financeai-mcp-00004-kvh, /health vérifié.
> **✅ 3e LOT `[ASSET-FX-DISPLAY]` (même session)** : « je devrais pas avoir 230k » → investigation → en fait SI :
> les prix d'actifs sont NATIFS (USD/EUR/CAD) et 6 surfaces UI sommaient SANS conversion FX → app affichait
> 160 352 « $ » (somme multi-devises brute) vs ~230 k$ CAD réels (le MCP avait raison ; courtier ~250 k$, écart
> restant = cours périmés → `[PRICE-REFRESH-LIVE]`). Fix : source unique `assetValueCad` + 5 surfaces converties +
> garde scan `assetFxGuard` (discriminant git-stash prouvé). La note de fraîcheur v0.6.0 a AUSSI exposé au passage
> que l'onglet app de Marc (vieux bundle) ne poussait plus vers Drive depuis 15:41Z — F5 requis pour le nouveau bundle.
> **✅ 5e LOT `[MCP-APPLY-DEBT]` (2026-07-15, demande Marc « rajouter des dettes avec mcp genre achat de voiture »)** :
> tool `apply_debt` v0.7.0 — ajout/màj PAR NOM (update PARTIEL, idempotent), catégorie inférée, bornes D9 + non-fini bypass-Zod,
> description qui ROUTE l'achat futur vers simulate_what_if (dettes servies dès mois 0). ⚠️ Redéploiement Cloud Run requis.
> **✅ 4e LOT `[PRICE-REFRESH-LIVE]` (même session, PR #442 MERGÉE)** : les cours se rafraîchissent (boot + bouton
> « Actualiser les cours »), séquentiel provider-aware 2 500 ms, prix natif only + devise protégée + couverture honnête
> (non-couverts NOMMÉS — les titres EU de Marc peuvent ne pas être quotables en Finnhub gratuit), patches fusionnés
> anti-course, `Asset.priceUpdatedAt` additif. Ça ferme l'écart ~250 k$ courtier pour les titres couverts.
>
> ## 📊 Session 2026-07-13 — MCP pour claude.ai : Lot 1 what-if + séries LIVRÉ, chantier Cloud Run relancé
> **Demande Marc** : parler à Claude de ses VRAIES finances depuis claude.ai web/mobile (pas seulement Desktop), déposer des
> PDF (déjà couvert, Lot 2 ingestion), et poser des what-if (« si j'achète une voiture demain ») avec chiffres EXACTS de l'app
> + graphiques — zéro chiffre inventé. **Choix Marc consignés** : cible claude.ai direct (chantier MCP-CLOUDRUN relancé, 4 lots) ·
> what-if générique complet · séries annuelles pour que Claude trace · PAS de passphrase sur le coffre (DriveStateSource OK).
> **✅ Lot 1 `[MCP-WHATIF]`** : tool `simulate_what_if` (`mcp/whatIf.ts` PUR : achat ponctuel/financé → LifeEvent GROS_ACHAT+Debt,
> salaire → users (net proportionnel REMONTÉ en assumption), dépense récurrente → délta d'épargne POST-clamp, immo → RealEstateGoal
> avec closingCosts SANS taxe de bienvenue — le moteur ajoute `welcomeFees` lui-même) ; moteur roulé 2× même `now` → deltas
> 1/2/5/10/20 ans + FIRE + impôts + séries annuelles base/scénario ; `get_projection` gagne `includeSeries`. 13 tests
> (discriminants de MAGNITUDE : voiture 30 k$ → écart an 1 ∈ [−40k,−25k] ; 20 après panel). **Panel (3 agents, findings
> MESURÉS, tous intégrés)** : mot réservé « vente » (delta 0 silencieux) assaini · Infinity passait Zod (`.finite()` +
> gardes, leçon CLAUDE.md) · mois ISO = même construction que le moteur (UTC) · hors-horizon + financement différé +
> mise>prix REJETÉS (erreurs claires) · suivis BACKLOG `MCP-WHATIF-DATED-DEBT`/`MCP-ENGINE-WARNINGS`/
> `ENG-LIFEEVENT-VENTE-SUBSTRING`. **Phase 0 Cloud Run REFAITE** : ⚠️ claude.ai
> custom connectors = OAuth 2.0/2.1 SEULEMENT (pas de Bearer statique ; `static_headers` = bêta Team/Enterprise) → Auth B révisée
> en mini-OAuth 2.1 mono-user (BACKLOG §MCP-CLOUDRUN à jour). `MCP-CLOUDRUN-ROOT` (consent Production) déjà réglé 2026-07-06.
> **✅ Lot 2 `[MCP-CLOUDRUN-HTTP]` (même session, PR #433 mergée avant)** : `mcp/http.ts` (node:http pur, sessions
> Streamable HTTP + `/health`, loopback+anti-DNS-rebinding Host+Origin en local, `0.0.0.0:$PORT` sous Cloud Run,
> SIGTERM propre, 13 tests e2e) + `mcp/bootstrap.ts` (source d'état factorisée stdio/http) ; v0.5.0 ; `npm run
> mcp:http`. **Panel Lot 2 (code-reviewer + silent-failure + security-privacy, findings PROUVÉS, tous intégrés)** :
> arrêt borné (grâce 5 s + fermeture forcée loguée — une requête en vol suspendue bloquait SIGTERM à JAMAIS, prouvé) ·
> corps plafonné 5 Mo → 413 + drain (OOM silencieux sinon, +144 Mo RSS/20 Mo mesuré) + garde close-avant-fin ·
> `transport.onerror` câblé (rejets SDK invisibles sinon) · `allowedHosts/Origins` sur le port RÉELLEMENT lié ·
> refus de démarrage hôte non-loopback sans auth (sauf `MCP_HTTP_ALLOW_EXPOSED=1`) · session-ids tronqués dans les
> logs · fermetures de session loguées · version dédupliquée (`MCP_SERVER_VERSION`). Verdict security-privacy :
> mergeable AVANT le Lot 3 (loopback par défaut, rien d'exposé).
> **✅ Lot 3 `[MCP-CLOUDRUN-A]`+`[MCP-CLOUDRUN-B]` (même session)** : **Auth B** = `mcp/auth/oauthProvider.ts` — OAuth 2.1
> mono-user STATELESS (tokens signés HMAC, DCR sans base = client_secret dérivé, PKCE S256 obligatoire, allowlist redirect,
> rotation refresh) ; porte = clé d'accès (`$FINANCEAI_ACCESS_KEY`) constant-time sur page HTML ; endpoints `/oauth/*` +
> `/.well-known/*` (RFC 8414/9728) ; garde Bearer sur `/mcp` (401 + WWW-Authenticate). **Auth A** = `mcp/auth/
> credentialsBackend.ts` — refresh token Google en **Secret Manager** (`$FINANCEAI_GOOGLE_SECRET`, metadata server + REST,
> zéro dép) ou fichier local ; `invalid_grant` → message actionnable. Activation : `SIGNING_KEY`+`ACCESS_KEY` présents.
> 21 unités OAuth + flux e2e HTTP complet.
> **✅ Lot 4 `[MCP-CLOUDRUN-DEPLOY]` (même session) → CHANTIER MCP claude.ai COMPLET (1→4)** : `mcp/Dockerfile`
> (node:22-slim, fermeture d'import PROUVÉE minimale, `npx tsx mcp/http.ts`) + `.dockerignore` + `mcp/deploy.sh`
> (gcloud run, Montréal, secrets OAuth, min-instances 1, 2 passes pour `FINANCEAI_PUBLIC_URL`) + `.github/workflows/
> deploy-mcp.yml` (CD via WIF, garde `if vars.GCP_PROJECT_ID`) + README pas-à-pas GCP + carte « Connecter à Claude »
> (section web/mobile via `VITE_MCP_SERVER_URL`). **Actions Marc → `A_FAIRE_MOI` O8** : projet GCP + 3 secrets + IAM +
> `deploy.sh` + coller l'URL dans claude.ai (~15 min, pas-à-pas fourni). Conditions pré-exposition : BACKLOG
> `MCP-CLOUDRUN-AUTH-HARDENING` (rate-limit, clé aléatoire) + `MCP-CLOUDRUN-DEPLOY-LOGS`.
>
> ## 📊 Session 2026-07-07 — BACKLOG EN CONTINU : money-critical (#429/#430/#431 mergés) → sweep a11y/nettoyage/perf
> Exécution **ORDONNÉE du backlog** (demande Marc « continue le backlog en entier ») : **✅ MERGÉS** #429 `FISC-WELCOME-2026` (barème taxe
> bienvenue « reste QC » 2026, 500 k$ = 5 610,50 $), #430 `DETTE-RE-SALE` (vente immo ciblée par `propertyId`, panel 2352/2352), #431
> `TP1G-VIVANT-SEUL` (crédit QC « personne vivant seule » 2 172 $ ligne 361, seuil UNIQUE **42 955 $** remplaçant les paliers duaux 27 835/45 270
> — DÉCOUVERTE : l'ancien 45 270 était le seuil du crédit ligne 462 CONFONDU → retrait d'un sur-crédit couple ; panel `financial-integrity` +
> `silent-failure-hunter`). **Nouveau finding BACKLOG** : `[FISC-LINE361-PERCONJOINT-REDUC]` (réduction 18,75 % appliquée PAR CONJOINT → possible
> double-comptage couple en bande partielle, pré-existant, à vérifier séparément). **⏳ EN COURS — sweep LOW/MEDIUM sûrs, PR #432**
> (branche mono `claude/recent-commits-status-w3sakd`, commits focalisés, un merge) : **✅ a11y** (`A11Y-HEALTH-RAW-INK500` +
> `A11Y-BUDGETTABLE-SELECT-KBD`) · **✅ nettoyage** (`HEALTH-SUB-DRY` DRY coût mensuel santé + `PLANNING-ANNUAL-CALENDAR` abo annuel ≠ chaque
> mois ; **`DETTE-RE-SALE-PURGE` DIFFÉRÉ** — ambiguïté design money-adjacent purge/remove/warn, à trancher avec Marc) · **✅ perf**
> (`PERF-MISSINGDATA` sélecteur `useShallow` + `PERF-BUNDLE` 2/3 imports statiques, `claude.ts` gardé dynamique à dessein). Panels APPROVE à
> chaque vague. **RESTE — money-critical ISOLÉS** (PRs séparées après merge #432) : `WHT-DISPLAY-MELTDOWN`, `FISC-REEE-AIP-MODEL`, investigation
> `FISC-LINE361-PERCONJOINT-REDUC`. **NE PAS toucher** (bloqués) :
> 🧭 décisions Marc (IA-NAV-CONSOLIDATE, PH4-BUD, ITEM-2A, FISC-TAXDEC-INCR) · ⏳ gros chantiers (MCP-CLOUDRUN, DETTE-GODFILES, CIX-*, CA-*, D-*,
> P0-IDB, PROFIL-SWITCH) · money-critical différés `fixIsSafe:false` (FISC-RAP-REPAY, FISC-CHILDCARE, FISC-SURVIVOR-CAP, NAN-MUTATOR-CENTRAL).
> **Reste Marc** : envs O4 (jeton relais Vercel), 12 tests manuels. Décisions bloc 2026-07-06 exécutées ✅.
>
> ## 📊 Session 2026-07-06 — Rapport d'état + hygiène doc + P0-PROXY BYOK + décision app SOLO
> Rapport complet livré à Marc (3 semaines, 111 commits #315→#425, santé 2334 tests verts mesurée) ; branche de session réconciliée (résidus 06-17 superseded écartés) ; dérives doc corrigées (README remis à niveau + features, BACKLOG ×5 cochés/fusionnés/dédoublonnés, compteurs CLAUDE.md/VISION/FISCAL_REFERENCE, CHANGELOG, SESSION_HANDOVER table/mantra). **+ P0-PROXY relais BYOK livré dark-launch** (phases 1-2 : code proxy Edge + routes + tests ; awaiting env Vercel + flag, cf O4) **+ décision Marc : app SOLO** (multi-user remisé indéfiniment, focus qualité AAA ; multi-appareil Marc + sync Drive conservés). **+ Batch décisions 2026-07-06 consigné** (welcome-tax 2026 + grille TP-1.G reçues → 2 items money-critical actionnables `FISC-WELCOME-2026` + `TP1G-VIVANT-SEUL` ; W5-TAX-PROXY (a) garder proxies ; FA-11 limite assumée ; ITEM-2C restes fermés ; HIST-NW=(b) disclaimer visuel ; D6-PRIV=oui au focus ; FISC-TAXDEC-INCR à confirmer ; 3 batchs de questions UI à préparer). **+ FISC-WELCOME-2026 LIVRÉ 2026-07-07** (barème taxe de bienvenue « reste du Québec » 2026 : 3 tranches 62 900/315 000, panel `financial-integrity` ✅, discriminant 500k = 5 610,50 $). **Actions Marc FAITES** : OAuth consent → Production ✅ · sync Drive prouvée (fenêtre privée) ✅ · FISC-TAXDEC-INCR = **« laisse »** (statu quo documenté, clos). Reste sur Marc : envs O4 (jeton relais Vercel), 12 tests manuels. **Session EN COURS : exécution ORDONNÉE du backlog (ordre PM 2026-07-07)** — fait #1 `FISC-WELCOME-2026` + #3 `DETTE-RE-SALE` (vente immo ciblée par `propertyId` ; panel projection-validator 2352/2352 + code-reviewer APPROVE + silent-failure ; suivi LOW `DETTE-RE-SALE-PURGE`). **RESTE #2 `TP1G-VIVANT-SEUL`** (crédit « personne vivant seule ») : plan-first fait, mécanique COMBINÉE confirmée, MAIS **1 point money-critical à valider avec Marc AVANT de coder** — le seuil unique 42 955 $ remplace-t-il le seuil COUPLE 45 270 $ actuel ? (mauvais choix = sur-imposition de tous les couples ; les données consignées par Marc donnent UN seul seuil 42 955 → penche Option A). Puis privacy/a11y/perf (ordre PM).
>
> ## ⚡ BRIEF MARC 2026-06-10 — LE CHANTIER PRIORITAIRE (4 phases)
> Marc a livré un brief structurant (détail COMPLET dans `BACKLOG.md` § « BRIEF MARC 2026-06-10 ») :
> **Phase 1** bugs chunk périmé (✅ FAITE, mergée #238 → prod : [PH1-a] `lazyWithRetry` sur le dernier
> `React.lazy` nu + filet global `vite:preloadError` durci au panel — garde timestamp ≤ 1 reload/min,
> clear-au-mount supprimé ; analyse Cloudflare livrée, décision Marc = [PH1-b]/Q2) →
> **Phase 2** clé de voûte (état persistant inter-onglets, projection en Web Worker app-level, source
> unique Futur=Retraite, verrouillage de courbe + IndexedDB) → **Phase 3** onglet Profil (remplace
> Config/Profil, regroupe profil+retraite+profil détaillé, % complétion, purge des champs morts) →
> **Phase 4** refontes par onglet (Futur leviers-d'abord/annotations/plan d'action remonté ;
> Transactions ; Budget ; Investissement autocomplétion+dividendes ; Retraite).
> ⚠️ RÈGLES : plan-first OBLIGATOIRE sur Ph. 2/3/et CHAQUE onglet de Ph. 4 ; **JAMAIS passer à la
> phase suivante sans OK explicite de Marc** ; Q1/Q2 à poser (cf `A_FAIRE_MOI` O6) ; handover à jour
> après chaque phase.
>
> **Session 2026-06-19 — ACC Lot 0 + Lot 1 (#379)** : Agent Control Center (`docs/BRIEF_CONTROL_CENTER.md`), exécution
> LOT PAR LOT. **Lot 0** (test surface) = **Voie 1 viable** : le preview pane rend `127.0.0.1:4317` avec JS live (poll `/status`
> mesuré au network, 0 erreur). **Lot 1** (capteur enrichi, `scripts/hooks/agent-status.mjs` + `settings.json` SubagentStop +
> `.gitignore`) : prompt COMPLET → `agents[nom].message` ; au SubagentStop, extraction sortie+outils(+thinking) du transcript
> `.jsonl` → `.claude/agent-transcripts/<id>.json` (gitignored) + extraits bornés dans status.json ; corrélation prompt→nom par
> sous-chaîne du message ENTIER (longest-wins) — **bug live corrigé** (préambule commun attachait tout au 1er agent). ⚠️ **DÉCOUVERTE
> LIVE : les transcripts SOUS-AGENTS n'ont PAS de blocs `thinking`** (`hasThinking:false`) → pas de « fil de pensée » pour les
> sous-agents, on montre la SORTIE + les outils. Transcripts sous-agents = `.claude/projects/<session>/subagents/agent-<id>.jsonl`.
> Panel code-reviewer+silent-failure APPROVE (findings intégrés). **Lot 2 (#380, mergé)** : route `/backlog` (`backlog-scan.mjs` scan READ-ONLY `BACKLOG.md`+`A_FAIRE_MOI`+git via `execFileSync` SANS shell, parsing TOLÉRANT, import dynamique → un scanner cassé ne tue pas `/status`). **Lot 3 (dashboard enrichi)** : cartes agents CLIQUABLES → tiroir détail (message+sortie+outils du transcript, focus-trap via `inert`, fermeture Échap/fond/✕) + **bloc Avancement** (métriques backlog, barres de phases, backlog groupé en cours/attente Marc/à venir/fait, **chips de filtre** + **recherche** client) ; polling `/status`+`/backlog` avec détection de changement ; XSS-safe (`el()`/`textContent`). Vérifié LIVE (preview : routes 200, 0 erreur, tiroir réel, filtres/recherche OK, `inert` pose/retire le focus-trap). Panel code-reviewer+silent-failure+a11y APPROVE (findings intégrés). **Lot 4 (workflows)** : ⚠️ DÉCOUVERTE — les dynamic workflows **se journalisent eux-mêmes** dans `<session>/workflows/wf_<runId>.json` (terminés) + `subagents/workflows/<runId>/journal.jsonl` (stream LIVE, le json final n'existe pas encore pendant le run) ; **PAS de hook** (les agents internes d'un workflow ne touchent PAS `agent-status.mjs` — 2 systèmes séparés). Livré : `workflow-scan.mjs` (read-only, PUR fs, zéro dép) + route `/workflows` + bloc dashboard (cartes de run : nom/statut/phases/agents+état/tokens/durée, run EN COURS surligné en tête, marqueur `stale` > 2 h). Vérifié LIVE : un workflow lancé apparaît EN COURS (agents `running`) puis passe en « récents ». Panel code-reviewer+silent-failure APPROVE (findings intégrés : warns sur faux négatifs muets, stale, label 60). **Lot 5 (présence)** : le hook `SessionStart` (`session-brief.mjs`) **démarre le serveur ACC au début de session** (détaché, s'auto-termine sur EADDRINUSE — plus tôt que `ensureAccServer` au 1ᵉʳ agent) + **surface l'URL** `http://127.0.0.1:4317` dans le brief → présence « un clic » (Marc épingle le preview une fois). Vérifié : le hook spawn bien le serveur (port 4317 écoute, `/health` + `/workflows` répondent). **✅ ACC COMPLET (Lots 0-5).** Limite assumée : un hook ne peut pas auto-ÉPINGLER le preview (UI app) → « un clic », pas « zéro ».
>
> **📋 FILE D'ATTENTE (2026-06-19)** : Marc a demandé l'**ACC d'abord** (« fais le acc avant tout »). **✅ ACC COMPLET — Lots 0-5 FAITS**
> (Lot 0 test ✓ · Lot 1 #379 capteur ✓ · Lot 2 #380 `/backlog` ✓ · Lot 3 #381 dashboard ✓ · Lot 4 #382 workflows ✓ · Lot 5 présence ✓).
> **PROCHAINE SESSION** : ORDRE 1 (R1→R6) ✅ + **PH4 COMPLET ✅ : A/B/C + D (Santé+poids store+2 ratios budget) + E (couple auto + override manuel) + F (abos)** → **ORDRE 2 (PH4) TERMINÉ.**
> **ORDRE 3 = money-critical** : **dons (FA-6) ✅ FAIT 2026-06-23** ; RESTE : **ITEM-2C** (gates timing par conjoint) / **tables
> fiscales** TP-1.G (personne vivant seule) / **FISC-WHT-HARDCODE** (retenue REER 0,15 en dur). **session DÉDIÉE** — panel
> `financial-integrity`+`projection-validator`+`silent-failure-hunter` + **test discriminant `git stash` OBLIGATOIRE** par item.
> Plan-first par item. Reste aussi les multi-courbes (Q1) et divers BACKLOG. Plus de chantier PH4 ouvert.
> **Session 2026-06-23 — FA-6 (crédit dons + sous-imposition locatif/CCPC active) ✅ FAIT** : `utils/donationCredit.ts` (crédit par
> paliers féd+QC, FISCAL_REFERENCE §10). ⚠️ Bug CRITIQUE trouvé en cadrant : `taxCurrentYear.revenu` (crédit + taxe locative/CCPC W5)
> est **ÉCRASÉ** en décembre année ACTIVE (`taxDecember:406` `=` vs `+=` retraité) → crédit jeté + loyers/CCPC non imposés pour un actif.
> Fix = router vers `divers` (jamais écrasé) via `addTaxDivers` — PAS `=`→`+=` (double-compterait la retenue salariale). **+ `FA-6-CREDIT-CAP`
> inclus** : crédit non remboursable PLAFONNÉ à l'impôt dû (champ `donCredit` accumulé → cap en décembre à `grossIncomeTax+gains`, excédent
> perdu) — corrige le sur-crédit d'un donateur bas-revenu (silent-failure-hunter). Panel financial-integrity+projection-validator+silent-failure
> + discriminants `git stash` (fix d'imputation ET cap) + conservation verte. Follow-up restant : **`W5-TAX-PROXY`** (taux locatif 0,45 / CCPC 0,36 plats non sourcés).
> **Session 2026-06-23 — AUDIT FINANCIER + CODE exhaustif ✅** (`docs/AUDIT_FINANCIER_2026-06-23.md`, panel 5 agents sur `main`
> ce61ee1) : **cœur AAA confirmé** (fiscalité 0 écart, conservation 29 scénarios résiduel ≤0,03 $, suite 2329 verte, FA-6 conforme).
> Findings de juin quasi tous FERMÉS. Nouveaux findings PÉRIPHÉRIQUES routés au BACKLOG (§ audit 2026-06-23) : `NAN-INPUT-HARDENING`
> (durcissement défensif, 7 sites, plan-first), `TC-FX-HARDCODE` (TaxCenter FX 1.38 en dur), `SEC-PRIVACY-BLUR-INPUTS` (Loi 25),
> `SEC-PBKDF2-DRIVE` (100k→600k), + M1/M5/HIST/log-regex (LOW). **Aucun ne menace la conservation/fiscalité** — lot 1 (sûr) puis NaN-hardening.
> **Correction des findings (PM a séquencé en 5 lots)** : **LOT 1 ✅ (#407)** (`SEC-PBKDF2-DRIVE` 600k+fallback ; `SEC-LOG-DEBT-REGEX`).
> **LOT 2+3 ✅ FAIT** (batché — UI pure) : `SEC-PRIVACY-BLUR-INPUTS` (`PrivateNumberInput` focus-to-edit, valeur hors DOM) + `TC-FX-HARDCODE`
> (FX réel du store + constantes). Panel a11y+security-privacy+financial-integrity+silent-failure+code-reviewer → fix convergents intégrés
> (id sur bouton, focus-ring, ref-focus, re-mask sur activation privé, `CAPITAL_GAINS_INCLUSION_STANDARD`). RESTE : LOT 5 `M1`+`M5-INV1`+
> `HIST-NW` (LOW), LOT 4 `NAN-INPUT-HARDENING` (moteur, plan-first+panel, EN DERNIER). Découverte → BACKLOG : `SEC-PRIVACY-RETIREMENT-RRQ-PSV`
> (rrq/psv jamais masqués, LOW). Bloqués → A_FAIRE_MOI : `FISC-WELCOME-2026`, `W5-TAX-PROXY` (a/b).
> **LOT 5 ✅ FAIT** (doc-only) : `M5-INV1-EXTEND` était **déjà couvert** par INV-9 (lignes 346-354 : reconstructabilité hypothèque +
> discriminant DetteTotale) → fermé sans test dupliqué ; `HIST-NW-NO-DEBT` documenté aux 2 sites (module + `FutureProjection`, NW passé
> sans dettes faute d'historique). Question produit → A_FAIRE_MOI `HIST-NW-DEBT-DISCLAIMER` (a/b/c).
> **LOT 4 ✅ FAIT** (moteur, panel 4 agents + discriminant git-stash) : `NAN-INPUT-HARDENING` — gardes `Number.isFinite` sur les VRAIS
> vecteurs (retirementIncome `??`, useDerivedFinancials arith. nue, monthlyEvents `??`, w5Effects rental `!==0`, helpers `NaN<=0`+rateAnnual,
> portfolio `||`→isFinite pour Infinity). Faux positifs écartés (portfolio `||` rattrapait NaN ; taxDecember déjà gardé ; business `>0`).
> **INV-8 corrigé** (était VACANT : `num()` sanitisait avant `isNaN`). Panel a trouvé `rateAnnual` non gardé → corrigé. Findings différés →
> BACKLOG `NAN-OBSERVABILITY` + `NAN-MUTATOR-CENTRAL`. Conservation 19/19.
> **LOT 6/M1 ✅ FAIT** (moteur, panel 4 agents + discriminant) : `FISC-WHT-HARDCODE` — `totalTaxesPaid` `*0.15` → `withholdingForGrossRRSP`
> (tiered 19/24/29 %, même barème que le cashflow). Non-double-compte vérifié (acompte que décembre réconcilie). Mesuré 211,6→270,1 k$
> (discriminant git-stash). ⚠️ A cassé `projection.survivor.test.ts` (écart 3,77→2,21 %, artefact du biais 0,15) → seuil re-calibré 0,03→0,015
> + chiffres MAJ (pas affaiblir : direction tient). ⚠️ PIÈGE INFRA : la course git-stash CONCURRENTE (4 agents + suite) a donné un faux gate
> VERT → re-mesuré en isolation (leçon CLAUDE.md). Résiduels → BACKLOG `WHT-DISPLAY-EXACT`.
> **✅✅ TOUS LES FINDINGS DE L'AUDIT 2026-06-23 CORRIGÉS** (6 lots, PR #407-#411). + **SEC-PRIVACY-RETIREMENT-RRQ-PSV ✅ FAIT** (suivi :
> les 2 champs rente RRQ/PSV migrés vers `PrivateNumberInput` → volet vie privée des champs éditables COMPLET). Restent en BACKLOG : découvertes
> LOW (NAN-OBSERVABILITY, NAN-MUTATOR-CENTRAL, WHT-DISPLAY-EXACT) + A_FAIRE_MOI : `FISC-WELCOME-2026`, `W5-TAX-PROXY`, `HIST-NW-DEBT-DISCLAIMER`.
> **ORDRE 3 / ITEM-2C — FERR per-conjoint ✅ FAIT (2026-06-25, money-critical, options 3 de Marc)** : Phase 0 (golden #413) +
> Phase 1+2 FERR (1 PR) : `taxJanuary.ts` boucle sur `reerByUser` + âge par conjoint (chaque conjoint de 72+ convertit SA part au
> facteur RRIF de SON âge) ; `reerByUser` passe de SHADOW à PILOTE. Défaut additif (ancres equal/solo INCHANGÉES) ; golden age-gap
> re-basés + preuves-de-fix (discriminant git-stash 5/7). ⚠️ Panel a trouvé un **flux fiscal FANTÔME au DÉCÈS** (part du défunt
> FERR-convertissait → +63 k$ survivant) → corrigé par roulement REER conjugal `reerByUser=[Σ,0]`. + repli `birthYear`, 2 tests unitaires.
> Conservation 20/20. **+ Sous-phase PSV/RRQ per-conjoint ✅ FAIT (2026-06-25, plan-first OK Marc)** : `rrqMonthly`/`psvMonthly`
> (`retirementIncome.ts`) en SOMME per-conjoint — départ RRQ/PSV + bonus PSV 75+ à l'âge de CHAQUE conjoint sur SA part. Modèle d'âge
> RELATIF `ctx.age + (âgeDépart_i − âgeDépart_0)` (symétrique, golden inchangé, 10 tests `retirementIncome` préservés — leçon CLAUDE.md).
> Mode SURVIVANT = modèle familial INCHANGÉ (zéro impact FISC-SURVIVOR). Golden `couplePsvBonus`/`couplePsvStartGap` re-basés + discriminant 4/9.
> **⏳ RESTE (faible priorité)** : reset REER 71 per-conjoint (~0 impact) + PSV/RRQ AU DÉCÈS (raffinement survivant). ITEM-2C ≈ COMPLET.
> **Priorisation PM (2026-06-25, « fais selon le PM »)** : sa reco #1 TEST-PROJ-MODULES était PÉRIMÉE (49 tests déjà là — leçon R2-FIRE) →
> passé à #2 **HEALTH-SAVINGS-RATE ✅ FAIT** : taux d'épargne + coussin du score de santé excluent enfin les postes ÉPARGNE (helper
> `monthlyConsumptionExpenses`). Découverte → BACKLOG `HEALTH-SAVINGS-CONSISTENCY` (4 surfaces IA/MCP/moteur à uniformiser sur `isSavingsNature`).
> #3 **DEP-UNDICI = PÉRIMÉ** (lockfile déjà à undici 7.28.0, `npm audit` 0 vuln — fermé). #4 **NAN-OBSERVABILITY ✅ FAIT** (helper
> `logErrorThrottled` + 2 sites monthlyEvents/useDerivedFinancials). ⚠️ **3 des 5 recos PM étaient PÉRIMÉES** (BACKLOG en retard sur l'état réel) →
> leçon CLAUDE.md `PM-STALE-BACKLOG`.
> **PASS de de-staling (workflow `backlog-verify`, 2026-06-26)** : 12 items actionnables vérifiés contre le code → **11 VALIDES, 1 PÉRIMÉ**
> (FMT-CASING-ACCOUNTTYPE fermé). NAN-MUTATOR-CENTRAL = VALIDE mais **DIFFÉRÉ** (Infinity inatteignable depuis l'UI, `numericInput` garde déjà ;
> plan en réserve). FISC-SRCDED-NOOP = **2 bugs confirmés** (ordre + unité ~12×, cashflow mensuel affiché, net annuel ≈ inchangé). WHT-DISPLAY-EXACT,
> FISC-ASSETLOC-INTL = VALIDES, plan-first. Le reste (REEE-LITERALS, NW-ASSETBREAKDOWN-DRY, DETTE-DEADCODE, PERF-WITHHOLDING…) = VALIDES LOW.
> **HEALTH-SAVINGS-CONSISTENCY ✅ FAIT (choix Marc)** : `isSavingsNature` (NFD) sur 5 surfaces/6 sites (4 du BACKLOG + 5ᵉ `Budget.tsx` trouvée par le panel) ;
> discriminant git-stash 2500→3500 + panel (conservation 20/20).
> **FISC-SRCDED-NOOP ✅ RÉSOLU par RETRAIT (choix Marc)** : enquête a prouvé que les 2 bugs visaient du code MORT (`computeMonthlyWithholding`,
> sortie écrasée par l'override décembre avant règlement ; perturbation +999 999/mois → golden byte-identique). Fonction RETIRÉE (résout aussi
> PERF-WITHHOLDING + perf MC). Panel 2329/2329. Leçon CLAUDE.md FISC-SRCDED-NOOP (test de perturbation pour prouver « code mort »).
> **WHT-DISPLAY-EXACT ✅ FAIT (2026-06-26, choix Marc)** : le compteur d'AFFICHAGE `totalTaxesPaid` additionne désormais la retenue REER
> EXACTE PAR TIRAGE (nouveau champ `CashflowState.rrspWithholdingMois`, round-trippé buildCashState/applyCashState, reset/mois) au lieu de la
> recalculer sur le brut MENSUEL agrégé (barème non additif → sur-estimait les mois multi-tirages). + dédup volet b : fonction locale
> `rrspWithholding` → source unique `withholdingForGrossRRSP`. Découplage CF-2 (delta `−rrspWithholdingAtStart` pour rester correct au 2ᵉ appel
> du sauvetage PV-6). Mesuré git-stash 270 087 → 269 132 $ (−955 $, direction correcte). Test discriminant unitaire RED→GREEN (3 tirages palier 1,
> somme franchit le palier 2). **Aucun impact NW** (compteur display/ranking). Panel 4 agents APPROVE, conservation 12 inv. verte, suite 2330/2330.
> **REEE-LITERALS ✅ FAIT (2026-06-26)** : constantes fiscales SCEE/IQEE/REEE de `childrenReee.ts` extraites en constantes nommées+sourcées
> (pointent vers `FISCAL_REFERENCE §REEE`) — refactor PUR, golden/conservation/suite byte-identiques. `REEE_AIP_TAX_RATE` (~20 % PRA) nommé +
> marqué « approximation modèle » (à raffiner). Note FISCAL_REFERENCE l.450 passée de « dette LOW » à « résolu ».
> **DETTE-DEADCODE ✅ FAIT (2026-06-26)** : retiré `runBuyVsRent` + types `BuyVsRent*` + son test (test-only, zéro call-site prod) et
> `buildTestFixtures` (wrapper compat jamais appelé) + imports orphelins. EXCLUS après vérif : `clearCredentials` (mcp/, touch-on-request),
> façade `getProfile` (contrat `MarketDataProvider` testé). Bruit knip restant (GST/QST/SCHL/interfaces) NON purgé (règle). typecheck+build+suite verts.
> **PLANNING-ANNUAL-SUB-12X ✅ FAIT (2026-06-26, « fais tout »)** : KPI abos (`Planning.tsx`) comptaient un abo ANNUEL ×12 (Σ `averageAmount` brut ×12).
> Helpers purs `monthlyEquivalent`/`totalMonthlyCost`/`totalYearlyCost` (`utils/subscriptions.ts`) dérivés de `yearlyCost` + gardes `Number.isFinite`.
> Affichage display-only (zéro impact NW, confirmé financial-integrity). 7 tests dont discriminant. Follow-ups → `HEALTH-SUB-DRY`, `PLANNING-ANNUAL-CALENDAR`.
> **⚠️ PERF-BOOT/D7 DÉFÉRÉ (pas un quick-win)** : `hydrateAssets` (`App.tsx:420`) `sleep(2500)` protège AUSSI CoinGecko (~30/min, pas que Finnhub 60/min) →
> un speedup provider-AVEUGLE déclenche des 429 crypto au cold-boot (régression UX). Vrai fix = provider-aware (M-L) + plan-first. Item rouvert dans cet état.
> **A11Y-INK500 LOTS 1+2 ✅ FAITS (2026-06-26, « fais tout »)** : `text-ink-500`→`text-ink-400` (AA normal ✅) sur classification a11y-auditor PAR-OCCURRENCE.
> **Lot 1** = 6 écrans quotidiens (Dashboard/Budget/BudgetGroupTable/Investments/Transactions/Planning), 43 occ. + 10 gardées. **Lot 2** = LifeEvents/RealEstate/
> FutureDetailModal/ChildPlanning/retirement(RetirementIncomeCard+AssetLocationCard), 37 occ. + 8 gardées (+ fix empty-state LifeEvents:367 + `aria-hidden` `→` AssetLoc:215).
> Panel a11y-auditor + code-reviewer APPROVE chaque lot, check-contrast confirme, suite verte. **RESTE ~37 fichiers/~105 occ.** en lots suivants (investments/*, projection/*,
> sidebar/*, setup/*, realestate/*…). Découverte → `A11Y-BUDGETTABLE-SELECT-KBD` (selects+bouton invisibles au clavier). Méthode rodée : a11y-auditor classe → sed line-adressé → vérif GARDER → panel.
> **⚠️ IA-NAV-LABELS = DÉCISION UX MARC** (pas un bug) : rail délibérément collapsed-by-default (hover/focus expand, Phase B.1) — NE PAS override sans OK.
> **⚠️ PERF-BOOT/D7 DÉFÉRÉ** (CoinGecko ~30/min ; provider-aware requis, plan-first).
> **Prochaines pistes plan-first** : FISC-ASSETLOC-INTL (M, money-critical) ; A11Y-INK500 lots suivants (par écran) ; reste lot hygiène LOW (NW-ASSETBREAKDOWN-DRY — partie `currentLiquidity`
> safe, `assetBreakdown` a 3 deltas sémantiques à garder) ; + WHT-DISPLAY-MELTDOWN / FISC-REEE-AIP-MODEL (LOW money-critical, discriminant requis).
> + décisions Marc en attente : W5-TAX-PROXY, HIST-NW-DEBT-DISCLAIMER, FISC-WELCOME-2026.
> ⚠️ Leçons : registre per-conjoint pilote → gérer décès (fantôme) ; 2ᵉ course git-stash (vérifs isolées) ; gate d'âge per-conjoint = ancrer sur ctx.age + écart.
> **Session 2026-06-23 — quick-win `BUDGET-NATURE-FREEFORM` ✅ FAIT** : les 56 items de fixtures (testBudget + 6 personas) avaient
> des natures LIBRES violant l'union typée `'Besoin'|'Envie'|'Epargne'` → tout en « Envie » + CELI/REER (`'Épargne'` accentué)
> comptés comme dépenses (groupement, coupleAnalysis, dépenses IA/Dashboard/NextBestAction). Normalisés 50/30/20. Panel
> financial-integrity+code-reviewer = CORRECTION, 0 régression (2285 verts). Donuts montrent enfin Besoins ≠ 0. Nouveau finding
> BACKLOG `HEALTH-SAVINGS-RATE-DIVERGENCE` (HealthIndicator:93 n'exclut pas l'épargne du taux d'épargne — pré-existant, à trancher).
> **Session 2026-06-23 — `BUDGET-DONUT-SVG-ARIA` ✅ FAIT (#403)** : les 2 donuts 50/30/20 enveloppent `<ResponsiveContainer>` dans
> `<div aria-hidden="true">` (SVG Recharts hors traversée SR ; nom accessible sur `role="img"`, données dans `ChartDataTable` sr-only).
> ⚠️ `BUDGET-KEY-WARNING` reste OUVERT : hypothèse `nameKey="name"` **TESTÉE et RÉFUTÉE** (ne change pas la clé interne Recharts) →
> investigation dédiée requise (instance « mesurer pas raisonner »). Non-fatal (warning React dev).
> ⭐ **PATRON migration store ADDITIVE** (validé PH4-C + PH4D-WEIGHTS-STORE) : champ `optional` dans `AppState` (ne casse pas les fixtures),
> valeur fournie à l'**état initial** du store, `partialize` allow-all-sauf-denylist le persiste AUTO, et le **`merge` Zustand par défaut**
> (`{...current, ...persisted}`) GARDE la valeur initiale quand l'état persisté ne l'a pas → **AUCUN bump v7→v8** ni `migratePersistedState`.
> Pour migrer une vieille clé localStorage : la lire à l'init (helper testable, ex. `loadLegacyHealthWeights`). Le **v7→v8 de PH4-F** est DIFFÉRENT
> (vrai bump → toucher `migratePersistedState` + version, test RED d'abord).
> Money-critical (M1 dons / M2 ITEM-2C / M3 tables fiscales) = ORDRE 3 (panel + discriminant obligatoires).
> ⚠️ **Quick-win découvert (BACKLOG `BUDGET-NATURE-FREEFORM`)** : les `TEST_BUDGET_ITEMS` ont des natures LIBRES (violent l'union typée)
> → les 2 donuts 50/30/20 montrent **Besoins 0 %** pour les personas test (un vrai user a la dropdown typée → OK). Fix = aligner les
> fixtures sur 'Besoin'/'Envie'/'Epargne' (PAS le groupement) ; relancer la SUITE COMPLÈTE après (tests à seuil keyés personas).
>
> **Session 2026-06-22 — PH4E-OWNER-EDIT ✅ (override couple, PH4-E + PH4 COMPLETS)** : colonne « Conjoint » dans le tableau `Transactions.tsx`
> en mode couple — un `<select>` par ligne (Auto / prénom conjoint 0 / prénom conjoint 1) qui OVERRIDE `Transaction.ownerId` (`updateOwner`,
> `undefined` = retour AUTO par type de poste). Lu depuis `config` du store (`isCouple = user[1] nommé`). Table desktop (colonne conditionnelle) +
> carte mobile. L'override alimente `resolveTransactionOwner` (ownerId explicite gagne, #398, déjà prouvé). **Revue adversariale (workflow,
> 3 dim × vérif) : 5 findings intégrés** — (1) `useFinanceStore` en tête ; (2) **HIGH `isSolo` BUDGET pré-existant** : `config.users` est un
> tuple `[User,User]` → `length>1` TOUJOURS vrai → la section couple s'affichait en SOLO (un override orphelin y montrait un montant inexpliqué)
> → `isSolo` basé sur le NOM (cohérent avec `isCouple`) ; (3) select sur DÉPENSES seulement (revenus/transferts ignorés par le calcul → « — ») ;
> (4) `aria-label` + date (unicité si même marchand) ; (5) `touch-target` mobile. 1 réfuté (focus-ring : tous les selects pareils, pré-existant).
> 7 tests (5 owner + 2 Budget solo/couple). ⚠️ Branche EMPILÉE sur PH4D (bb4c37d pre-squash) → reconciliée via `git merge origin/main`
> (#400 squashé en ac2d3ef). **PH4 ENTIÈREMENT COMPLET** → prochain = ORDRE 3 money-critical (session dédiée).
>
> **Session 2026-06-22 — PH4D-BUDGET-RATIOS ✅ (2 ratios santé, PH4-D complet)** : `utils/healthRatios.ts` (purs) — **adhérence budget**
> (`computeBudgetParityScore` : réel vs cibles du mois COMPLET précédent, hors postes ÉPARGNE, dépassement seul pénalise) + **poids des abos**
> (`computeSubscriptionLoadScore` : `Σ yearlyCost/12` / revenu net, plafond 15 % → évite le ×12 des abos annuels). `HealthWeights` 4→6 +
> `normalizeHealthWeights` (rétrocompat lecture, pas de bump). `HealthIndicator` : flag `available` + **`totalScore` EXCLUT les métriques sans
> donnée** (un 0 par absence ne tire plus le score — corrige aussi FIRE). **Revue ADVERSARIALE (workflow ultracode, 5 dimensions × vérification,
> 14 agents) : 6 findings RÉELS intégrés** (épargne exclue du dénominateur ; `monthlyExpenses` normalisé en fréquence — bug PRÉ-EXISTANT exposé ;
> orphelins distingués de « aucune dépense » ; aucun abo épinglé → indispo cohérent ; a11y `—` en `ink-400`) + **3 réfutés à raison**. 62 tests
> ciblés verts + suite complète. **PH4 : A/B/C ✅ + D ✅ + E ◑ + F ✅** → reste `PH4E-OWNER-EDIT` (LOW) puis ORDRE 3 money-critical.
>
> **Session 2026-06-22 — PH4-F ✅ (abonnements persistés)** : `AppState.subscriptions?: RecurringItem[]` (réutilise `RecurringItem`).
> **DÉCISION : ADDITIF SANS bump v7→v8** (le plan disait v7→v8, mais les abos n'étaient JAMAIS stockés — seulement détectés à la volée
> par IA/heuristique → RIEN à migrer ; le pattern additif validé #397 prouve qu'un champ optionnel ne nécessite aucun bump ; plus SÛR =
> zéro code de migration = zéro bug de migration). `utils/subscriptions.ts` (`subscriptionKey`/`isPinned`/`mergeSubscriptions`/`addSubscription`/
> `removeSubscription`, purs, dédup par marchand). `Planning.tsx` lit le store + boutons Épingler/Désépingler (l'onglet « Charges fixes & Abos »
> existait déjà, `section='fixed'`). **Test de migration RED écrit ET PROUVÉ** (retiré `subscriptions:[]` du store → test échoue « undefined ≠ [] »).
> 13 tests (util + migration). Panel code-reviewer + silent-failure + financial-integrity (zéro double-comptage, dédup) + security-privacy (même
> classe de sensibilité que `transactions`, chiffré au repos) APPROVE. Découverte routée BACKLOG : `PLANNING-ANNUAL-SUB-12X` (abo annuel ×12,
> pré-existant). **PH4 : A/B/C ✅ + D ◑ + E ◑ + F ✅.**
>
> **Session 2026-06-22 — PH4-E ◑ (dépenses réelles par conjoint)** : `Transaction.ownerId?: 0|1` (additif) ; `utils/budget.ts`
> `resolveTransactionOwner` (override `ownerId` gagne ; sinon AUTO par `BudgetCategory.type` : `Perso 1`→0, `Perso 2`→1, `Commun`→null)
> + `computeActualByOwner` (réel par conjoint, purs, réutilisent `matchTransactionToCategory`). `Budget.tsx` : `actualByOwner` dans le
> useMemo de parité → `coupleAnalysis` (`user1Actual/user2Actual/communActual`) → carte couple « Perso réel » (masqué en solo). 7 tests
> (4 resolve + 3 compute). Panel financial-integrity (**conservation prouvée** : owner0+owner1+commun == totalSpent, seaux disjoints) +
> code-reviewer + silent-failure APPROVE. **Scope** : auto-attribution + affichage ✅ ; **override éditable dans l'UI transactions → BACKLOG
> `PH4E-OWNER-EDIT`** (l'auto couvre le défaut). **PH4 : A/B/C ✅ + D ◑ + E ◑.**
>
> **Session 2026-06-22 — PH4D-WEIGHTS-STORE ✅** : poids de l'`HealthIndicator` migrés de localStorage (`healthIndicator:weights:v1`)
> vers le **store Zustand persisté** — `AppState.healthWeights?` (additif, PAS de v7→v8), `utils/healthWeights.ts` (`DEFAULT_HEALTH_WEIGHTS`
> + `loadLegacyHealthWeights` lu à l'init du store ; le `merge` défaut garde les poids user → zéro perte). HealthIndicator lit/écrit le store
> (`setAppState`), plus de loadWeights/saveWeights/localStorage. 7 tests migration + 2 tests composant adaptés. Panel code-reviewer + silent-failure
> APPROVE (logError sur corruption, `@deprecated` sur la clé). Cf. ⭐ PATRON migration additive ci-dessus. **Reste PH4-D : `PH4D-BUDGET-RATIOS`.**
>
> **Session 2026-06-22 — PH4-D ◑ PARTIEL (« Santé » ramené dans Budget)** : l'`HealthIndicator` (composant INCHANGÉ) est DÉPLACÉ
> du Dashboard vers un nouveau sous-onglet **« Santé »** de `BudgetWorkspace` (`Dashboard.tsx` : render + import retirés ; `BudgetWorkspace.tsx` :
> sous-onglet 'sante' icône `health`). **e2e `kpi.spec.ts` MIS À JOUR** (test #2 navigue Budget→Santé au lieu du Dashboard — sinon CI rouge ;
> attrapé par code-reviewer). Le test unit `HealthIndicator.test.tsx` (rend le composant via son chemin inchangé) → OK. **Scope RÉDUIT
> volontairement** (slice sûre, session à 10 PR) : les 2 autres parties de PH4-D → BACKLOG `PH4D-WEIGHTS-STORE` (poids localStorage→store,
> additif) + `PH4D-BUDGET-RATIOS` (ratios parité/abos, schéma poids 4→6). Panel code-reviewer + silent-failure + a11y APPROVE. **PH4 : A/B/C ✅ + D ◑.**
>
> **Session 2026-06-22 — PH4-C (objectif d'épargne lié au budget) ✅ FAIT** : `SavingsGoal.linkedBudgetCategoryName?` (lien par NOM
> = clé d'`actualsMap`, pas l'`id?` optionnel) ; `utils/budget.ts monthlyActualsMap` (pur, mois courant, réutilise `computeBudgetParity`) ;
> `BudgetWorkspace.tsx` calcule le mois courant (réactif, `monthStr` dans les deps) + passe à `Planning section="goals"` ; `Planning.tsx` :
> dropdown de lien (form + par objectif éditable) + « Accumulé / cible / **Versé ce mois** » (formatCAD + PrivateAmount). **Migration : AUCUN
> code** (champ optionnel additif, pas de Zod strict). 6 tests `monthlyActualsMap`. Panel (financial-integrity JUSTE + silent-failure +
> code-reviewer + a11y) : fixes intégrés — **lien orphelin** (catégorie renommée/supprimée) → badge « ⚠ Lien invalide » (plus de « 0 » muet) ;
> token `text-info-300` INEXISTANT → `info-400` (RÉCIDIVE de FIX-INK600 → leçon CLAUDE.md renforcée). Limite documentée `[PH4C-SAVINGS-NATURE]`
> (BACKLOG, LOW) : catégorie nature « Épargne » (virements exclus) → « versé 0 ». **PH4 : A/B/C ✅ → reste D/E/F.**
>
> **Session 2026-06-22 — PH4-B (donut 50/30/20 réel vs théorique) ✅ FAIT** : `utils/budget.ts computeGoldenSplit` (pur, clamp ≥0 +
> garde NaN/division-zéro, partagé théo/réel) + `GOLDEN_IDEAL`. `Budget.tsx` : 2ᵉ donut « Ta répartition réelle » (Besoins/Envies =
> Σ actualsMap par groupe ; Épargne réelle = revenu réel − dépenses réelles) + table comparative **Réel · Cible · Idéal** (écart ±2 pts
> vert/orange), caption sr-only, `ChartDataTable` sr-only. ⚠️ Panel `silent-failure-hunter` : `Math.max(0,…)` masquait un **déficit réel**
> → note « Déficit réel de X » quand dépenses > revenu (no-fake-data). a11y : panel a MESURÉ tous les contrastes PASS. 6 tests
> `computeGoldenSplit` + suite complète verte. Découvertes BACKLOG : `BUDGET-NATURE-FREEFORM`, `BUDGET-DONUT-SVG-ARIA` (pré-existants).
>
> **Session 2026-06-22 — PH4-A (parité Budget↔Transactions) ✅ FAIT** : `utils/budget.ts` (`matchTransactionToCategory` règle UNIQUE
> exact+substring + `computeBudgetParity` → `actualsMap`/`totalSpent`/`orphanCategories`/`itemsWithoutTransactions`). `Budget.tsx` :
> réels ET tendances 6 mois via la MÊME règle (avant : tendances en exact seul + comptaient les doublons → divergence supprimée).
> Section UI « Parité » (orphelins + postes jamais rapprochés sur TOUT l'historique ; épargne exclue accent-insensible ; empty-state).
> ⚠️ Panel `financial-integrity` a attrapé une **régression $** (sortir les orphelins d'`actualsMap` faisait baisser le « Total dépensé »
> /Restant/projection/IA) → `totalSpent` (matchés+orphelins) préserve le total EXACT d'avant. a11y h2/h3, key robuste. 14 tests utils +
> suite complète verte. Découverte hors scope : `BUDGET-KEY-WARNING` (warnings React clés dupliquées sur la page Budget, pré-existant, BACKLOG).
>
> **Session 2026-06-22 — R6 (personas de test) ✅ FAIT** : tous les personas ouvrent désormais toutes les pages data (aucune
> `PageSetupGate`). `isActive:true` sur les childGoals (coupleConfort via `TEST_CHILD_GOALS`, autonomeMono) ; `setupOptOut` par
> persona (karim/preRetraite `{debts,realEstate,children}`, jeuneCoupleDink `{children}`, autonomeMono `{realEstate}`,
> lea/coupleDettes `{realEstate,children,lifeProjects}`) + **micro-actif CELI** (lea/coupleDettes, prérequis `assets` non opt-outable).
> Garde-fou `tests/components/setup/personaGates.test.ts` (7 personas × pages data via source unique `PAGE_SETUP`+`REQUIREMENTS`).
> Actions/Assistant restent gated = clé API (par design). ⚠️ Découverte pré-existante `PERSONA-ASSET-PERF` (BACKLOG) : les actifs
> de tous les personas omettent `performance`/`currency` (cast `as unknown as Asset[]`) → `AiAssistant` rend `+undefined%` en test
> avec clé. Aussi ce jour : `DEP-UNDICI` résolu (PR Dependabot #366 mergée → 0 alerte), ménage des branches locales.
>
> **Session 2026-06-22 — R4 (boot-restore + densité) ✅ FAIT** : **R4-P1 (boot-restore)** était DÉJÀ en place (`App.tsx:72-96`,
> PH2-d : `isProjectionLocked` persisté → `loadLockedProjection()` → `setLockedProjection` au mount, gère ok/unreadable/empty +
> toast) → vérifié, zéro patch. **R4-P4 (densité)** : cap fixe d'icônes baissé **40/24 → 24/16** (`MAX_LIFE_ICONS`/`MAX_FLOW_ICONS`
> dans `FutureProjection.tsx`) pour « dézoomé = peu d'icônes » ; le LOD « zoom = toutes » était déjà assuré (fenêtre zoomée < cap) ;
> pinned (FIRE) jamais écrêté. ⚠️ **Formule du plan `(visMax−visMin)/6` REJETÉE** (à l'envers : aurait montré PLUS d'icônes dézoomé
> et écrêté en zoom) → un cap FIXE plus bas est le correctif correct (décision Marc 2026-06-22 : baisse modérée). Aussi : `DEP-UNDICI`
> planifié (PR #389 : 2 alertes Dependabot `undici` dev-dep → merger la PR Dependabot #366) ; ménage des 13 branches locales `[gone]`.
>
> **Session 2026-06-22 — R3 (tooltip figeable) ✅ IMPLÉMENTÉ** (blueprint suivi à la lettre, choix Marc « clic = fige ») :
> clic sur le graphe Futur = FIGE l'infobulle (portail `createPortal` body, `position:fixed`, ancré/scrollable/interactif,
> `z-290` < modale `z-300`) ; survol = suit la souris (`pointer-events:none`) ; Échap / clic-dehors libère ; **coexistence** avec
> `FutureDetailModal` via bouton « Détail complet » (+ pastilles d'événement inchangées). `<Tooltip content={()=>null}>` garde
> Recharts actif (alimente `onMouseMove`/`lastHoverPointRef` + le curseur). **Nouveaux fichiers** : `utils/chartTooltip.ts`
> (`resolvePointFromClick` + `clampTooltipPosition`, purs), `hooks/useChartTooltipPosition.ts` (machine d'état `idle/hovering/frozen`,
> position en `useRef` + mutation DOM directe = pas de re-render 60fps, listeners Échap/clic-dehors montés en gelé seulement, focus
> a11y). `ExpertTooltip` découplé de Recharts (prend `data` direct + `frozen`/`onOpenDetail`). **Tests** : 34 unité (utils/hook/tooltip)
> + 2 e2e (figeage, invariant mousemove, Échap, « Détail complet »→modale) — tous verts ; suite complète + build verts. Panel
> `code-reviewer`+`silent-failure-hunter`+`a11y-auditor` : 2 findings réfutés (mesurés), corrigés sur surfaces R3 (contraste footer
> `ink-400`, cible tactile 44px). ⚠️ **Leçons** (cf CLAUDE.md) : le preview headless rend `window` 0×0 → Recharts (ResizeObserver) ne
> dessine PAS le SVG → vérifier l'interaction graphe par e2e (vrai viewport Chromium), pas par le preview. Le graphe Futur est GATED
> derrière le bouton « vois directement ta projection actuelle (sans optimiser) » → l'e2e doit le cliquer d'abord. Follow-ups routés
> BACKLOG : `FIX-INK600-TOKEN` ✅ **FAIT (2026-06-22, PR séparée)** — `text-ink-600` (hors palette) → `ink-400` sur 9 usages/7 fichiers (AA normal mesuré). Reste `A11Y-CHART-KEYBOARD` : accès CLAVIER du graphe (préexistant, mitigé sr-only `ChartDataTable`).
>
> **Session 2026-06-19 — R1 (LABEL-NW-SUCCESSORAL) ✅ — 1ᵉʳ chantier autonome** : libellé trompeur « Patrimoine projeté »
> (qui affichait en fait `estateNetWorth`) renommé **« Patrimoine successoral, avec rentes »** + **tooltip** (nouveau prop
> `tooltip` sur `KPIStat`) sur 5 sites (FutureProjection KPI, Budget, StressTestPanel, GoalSeekerCard `title`, prompt AiAssistant).
> Fallback CONDITIONNÉ (libellé neutre si `estateNetWorth`=0, sinon « avec rentes » mentirait sur le `finalNetWorth` affiché —
> attrapé par financial-integrity). a11y durcie (`Tooltip` : `aria-describedby` sur l'enfant via `cloneElement` + fermeture Échap ;
> déclencheur `<button>` aria-label court au lieu de `role="img"`). Pure UI, zéro moteur. Typecheck + tests ciblés (22) verts.
> **CHANTIERS : R1 ✅ → reprendre R2** (annotation « FIRE atteint » au 1ᵉʳ mois `NetWorth ≥ FireTarget`, `FutureProjection.tsx` `lifeMarkers`).
>
> **Session 2026-06-20 — R2 (annotation FIRE) ✅ — PIVOT source-unique (revue adversariale ultracode)** : ⚠️ DÉCOUVERTE — le
> MOTEUR émet DÉJÀ `'Objectif FIRE Atteint 🔥'` (`projection.ts:1438`, seuil inflaté) → la pastille FIRE existait. Recalculer
> côté UI = DOUBLON + violation « Future = source unique ». **Livré** : on met en valeur la pastille MOTEUR — orange `#f97316`
> + icône 🔥 (`ClickableEventIcon` `payload.color` + entrée `EVENT_KEYWORD_ICONS`) + `pinned` (jamais écrêtée par `thinEvents`
> en vue dézoomée — bug attrapé par la revue). 2 fichiers (`FutureProjection.tsx`, `ProjectionTooltip.tsx`), zéro moteur,
> zéro recompute. Le helper `fireReached.ts` a été créé PUIS supprimé après la découverte (workflow de revue adversariale =
> 5 dimensions + réfutation ; 3 findings confirmés). Typecheck + tests verts ; code-reviewer + silent-failure APPROVE.
> ⚠️ **LEÇON (portée CLAUDE.md)** : avant d'AJOUTER un calcul/détection côté UI sur la projection, VÉRIFIER que le moteur
> ne l'émet pas déjà (`chartData.lifeEvents`/champs) — sinon doublon + contournement de la source unique. **CHANTIERS : R2 ✅ → reprendre R3** (infobulle figée/scrollable, `FutureProjection.tsx` + `ProjectionTooltip.tsx`, portail React — risque MOYEN).
>
> **Session 2026-06-19 — FEUILLE DE ROUTE VALIDÉE (#376)** : `docs/PLAN_CHANTIERS_2026-06-19.md` — plans cadrés par
> 4 agents (`fichier:ligne`) + VALIDÉS par Marc, exécutés en AUTONOMIE PR par PR. Ordre : R1-R6 gains rapides UI
> (NW-successoral libellés, Futur P1-P4 annotation FIRE/tooltip figée/boot-restore/densité, PH3-c-bis suppr. `User.industry`,
> personas complets) → PH4-A→F (Budget) → money-critical (FA-6 dons fed 14 %/titres 0 %/QC 24 %, ITEM-2C per-conjoint, tables
> personne seule QC) → Q1 multi-courbes. ★ Persistance de courbe DÉJÀ construite (~95 %, `lockedProjectionStore.ts`) → ne pas
> reconstruire. **PROCHAINE SESSION : reprendre l'exécution à l'item non coché dans le PLAN.**
>
> **Session 2026-06-19 — A11Y-BADGE-PROMINENCE (#375)** : Badge option B (choix Marc) — bordure renforcée
> (`border-*-border` 0,30 → `border-*-400/55`), fond inchangé, badge-only (token `*-border` partagé non touché).
> Contraste badge↔page remonté (WCAG 1.4.11). Classes Tailwind générées vérifiées (build propre). Item clos.
>
> **Session 2026-06-19 — Décisions & vision Marc (batch, #374)** : Marc a tranché un lot d'items + livré sa vision
> Futur/Budget. Capturé dans `BACKLOG.md` § « Décisions & vision Marc — 2026-06-19 ». Closures : ENG-TAX-NS (garder
> alias), H1 (pas de passphrase), **B-AUDIT-5 vérifié DÉJÀ-FAIT** (SRG déjà exclu du clawback PSV, `projection.ts:918/921/929`
> — pas de fake fix). Go : Badge **option B** (bordure renforcée), LABEL-NW-SUCCESSORAL (libellés distincts + tooltip),
> FA-6 (modéliser, barème fed+QC sourcé), PH3-c-bis (supprimer `User.industry`, ⚠️ schéma Zustand). Plans rédigés : ITEM-2C
> (per-conjoint), tables fiscales (personne seule QC). ★ Vision Q1 Futur = annotations (retraite/événements/FIRE) +
> infobulle figée + densité au zoom + **verrouillage/persistance de courbe** (clé Phase 2). PH4 = parité catégories Budget,
> envie/besoin, objectif épargne, détail per-conjoint, abonnements, personas de test complets. Gros chantiers = plan-first.
>
> **Session 2026-06-19 — Hygiène CA-01 partiel (#373)** : `utils/safeNumber.ts` (+ test) SUPPRIMÉ — util de coercition
> NaN jamais adopté (0 consumer prod, grep). CORRIGÉ une affirmation périmée du backlog : `csvExport.ts` n'est PAS mort
> (usé par `Transactions.tsx`). CA-01 passe à PARTIEL (exports orphelins restants à vérifier 1-à-1, knip bruyant). Trivial, zéro impact runtime.
>
> **Session 2026-06-19 — HARDEN-NETWORTH-NAN (#372)** (money-critical, garde anti échec silencieux) : `computeRawNetWorth`
> (SOURCE UNIQUE du patrimoine, `netWorth.ts`) n'avait AUCUNE garde `Number.isFinite` → un seul terme NaN/Infinity rendait
> TOUT le patrimoine NaN, graphe vide SANS trace. Fix : helper module-scope `sumNetWorthParts` (formule unique, hot-path
> inchangé) ; total non fini → chemin LENT qui rabat chaque terme fautif sur 0 (itère `NET_WORTH_SIGN`), `logError` THROTTLÉ
> par signature (anti-flood MC), recalcul. Chemin sain = 1 `Number.isFinite`. Discriminant prouvé (court-circuit → 4 échecs),
> +6 tests. Panel 3 agents APPROVE — finding redaction-PII RÉFUTÉ empiriquement (pattern `^debt$` ancré ≠ substring → clés
> `*Debt` non redactées ; leçon « mesurer les findings »). Gates verts.
>
> **Session 2026-06-19 — FISC-RE-CAPITAL-LOSS (#371)** (money-critical, découverte panel #368) : un IMMEUBLE LOCATIF vendu
> SOUS son coût réalisait une perte en capital SILENCIEUSEMENT ignorée (`gain = max(0, produit − coût)` + `if (gain > 0)`)
> → avantage fiscal LIR 111(1)b perdu. Fix : helper SOURCE UNIQUE `applyCapitalDisposition(state, rawGain signé)` (`portfolioOps.ts`)
> — perte < 0 → banque de pertes ; gain ≥ 0 → nette la banque puis impose. `handleNonRegSale`/`handleCryptoSale` refactorés
> dessus (zéro duplication, 3 copies → 1). Mutator immo `realizeCapitalGain` → `realizeCapitalDisposition` (nom honnête : gère
> gain ET perte) + log de la perte. `NonRegSaleState`/`CryptoSaleState extends CapitalDispositionState` (lien nominal). **Discriminant
> prouvé 2× (réintro `Math.max(0)` → échec) : unitaire (mock) ET end-to-end (vrai moteur, log « Perte en capital »), puis revert chirurgical**.
> Tests +7 : helper ×5, perte+gain-netté monthlyEvents, **e2e conservation moneyConservation (reconstructabilité INV-9 sous hypothèque)**.
> Panel 4 agents APPROVE (M2 toLocaleString RÉFUTÉ : locale `'fr-CA'` explicite ≠ nu). Suite complète verte. Gates verts.
>
> **Session 2026-06-18 — Garde-fou FISC-CONST-LINT (#364)** : `utils/fiscalConstantsGuard.ts` + `tests/fiscalConstants.guard.test.ts`
> (10 tests) : échec dur, auto-extraction des littéraux distinctifs non-collisionnables de `utils/tax.ts`/`services/realEstate.ts`
> + scan du codebase pour interdit. **A trouvé + corrigé 1 vraie fuite** : `32490` (RRSP 2025 recopié dans `setupSimulation.ts` sans
> le nommer) → constante nommée `RRSP_ANNUAL_LIMIT_FALLBACK` dans `tax.ts`. Scope sûr : ronds (`60000`) et taux 2-décimales (`0.5`)
> EXCLUS, strip des commentaires, échappatoire `// fiscal-const-ok`. Nouveaux LOW-tickets découverts (FISC-CONST-LINT-LIMITS,
> FISC-RRSP-PRE2010-FALLBACK). ~2159 tests verts (+ 10). Gates verts.
>
> **Session 2026-06-17 — AUDIT FINANCIER COMPLET + corrections (#318→#323)** : audit exhaustif du moteur
> (panel 5 agents + vérif empirique → rapport AAA `docs/AUDIT_FINANCIER_2026-06-17.md`, 5 diagrammes Mermaid).
> Verdict : **cœur money-critical AAA** (conservation prouvée ≤ 0,02 $ sur ~25 scénarios, fiscalité 0 écart,
> 0 échec silencieux) ; TOUS les findings PÉRIPHÉRIQUES (consommateurs UI/IA qui contournaient la source unique).
> Commande récurrente **`/audit-financier`** créée (cadence trimestre + release + période d'impôts). Corrigé :
> **#319** H1/H2 (NW présent UI/IA omettait les dettes + FX en dur → `computePresentNetWorth` SOURCE UNIQUE +
> garde keystone parité ; régression `availableCash` attrapée par le panel) · **#320** M2/M3 (DRY dividende/
> inclusion) · **#321** SEC-1 (anti-injection 2 surfaces LLM) · **#322** M5 (`DettesNonImmo` → NW reconstructible
> sous hypothèque, INV-9 étendu) + L4 (snapshot fréquence) + section BACKLOG « Durcissement structurel »
> (11 tickets Marc validés : 2 déjà faits, 3 partiels, 5 nouveaux) · **#323** M4 (viz fiscale NETTE de crédits) +
> AI-NBA-FX (FX réels). **Reste LOW** : L1/L2 (tests-guards), L3 (🧭 décision alias `services/tax.ts`),
> REEE-LITERALS (hygiène), M1 (⚠️ analyse double-comptage requise). Gates verts, ~2077 tests, 12 invariants conservation.
>
> **Session 2026-06-17 (suite) — Environnement d'agents + Accessibilité (Vague 2)** : mise en place de
> l'environnement d'agents (14 agents projet + orchestrateur routé à CHAQUE message via hook `UserPromptSubmit`)
> et de l'**Agent Control Center** (dashboard dev-only live `npm run acc`, auto-démarré au lancement d'un agent —
> PR #325→#334), puis reprise du backlog. **Vague 2 (accessibilité)** : `A11Y-TAXBRACKET` (#335,
> `TaxBracketViz` → `role="img"`+`aria-hidden`, `<ChartDataTable>` sr-only, `h4`→`h3`, `ink-500`→`ink-400`
> contraste VÉRIFIÉ) + `D6-HEADING` (#336, `CollapsibleSection` titre dans un vrai `<hN>` + prop `headingLevel`)
> LIVRÉS. Reste Vague 2 : `A11Y-INK500` (codemod CIBLÉ — ink-500 = disabled), `A11Y-D6-SR-2` ph.3,
> `A11Y-CHARTS` ph.2, `A11Y-MODAL-PRIVATE`, `D6-KBD`.
>
> **Session 2026-06-17 (suite²) — AUDIT UX externe VALIDÉ + backlog** : audit UX (rendu headless, 7 personas,
> 14 pages) reçu de Marc → **20 claims validés un par un** par panel de 5 agents (preuve `fichier:ligne`) →
> `docs/AUDIT_UX_2026-06-17.md`. Verdict : robustesse OK (0 plantage), cœur money-critical sain (les 2 « bugs de
> chiffres » = libellé `estateNetWorth` + persona insoutenable, PAS des erreurs de calcul). Vrais chantiers :
> **FMT-CURRENCY-UNIFY** (75 sites $ manuels), **IA dispersée** (14 dest., scores/holdings/complétude dupliqués),
> **PRIV-DISCRET-DOM** (mode discret floute sans masquer + hover révèle). Backlog rempli (§ « Audit UX 2026-06-17 »),
> dédupliqué, + 3 nouveaux points. **PM relancé pour l'ordre d'exécution.**
>
> **Session 2026-06-16/17 — Durcissement MONEY-CONSERVATION (#314 #315)** : 2 bugs de conservation de
> l'argent du moteur, trouvés via le résiduel `ΔNW − (épargne+croissance−impôt)`. **#314 [FISC-REER-WHT-DOUBLE]**
> (« le 50 000 au fisc » de Marc) : la retenue REER/FERR était comptée 2× (au retrait ET en avril) →
> sur-imposition ~retenue/an ; fix = retenue CONSERVÉE au liquide (acompte), retrait NW-neutre, débitée 1× en
> avril (INV-10/11). **#315 [FISC-BROKE-LIQUID-FLOOR]** : un retraité insolvable (tous comptes de décaissement
> épuisés, coussin `criticalThreshold` gardé) voyait sa dépense non couverte S'ÉVAPORER (ΔNW stable, +~3,7 k$/mois
> d'argent fantôme) ; fix (choix Marc = porter en dette) = `uncoveredShortfall` reporté en `liquidDebt` VISIBLE
> (INV-12, prouvé discriminant via `git stash`). Garde-fou `moneyConservation` = **12 invariants**. Leçons
> CLAUDE.md : résiduel de conservation comme ARBITRE (mesurer, pas raisonner) ; « pas de flux fantôme » étendu au
> shortfall mensuel insolvable ; piège race sonde-agent/`commit-gate`. Gates verts, ~2073 tests.
>
> **Session 2026-06-15 — Infra/hygiène (5 PR auto-mergées #288→#292)** : reprise sur un clone local
> **146 commits en retard** (fetch+ff → règle ajoutée à CLAUDE.md). #288 js-yaml → `npm audit` **0 vuln**.
> #289 règle « CLAUDE.md s'améliore à chaque push » **DURCIE** (obligatoire) + fetch-first à la reprise.
> #290 **hook `learn-on-push`** (PreToolUse : rappel « leçon→CLAUDE.md » sur chaque `git push`) + #291 fix
> de son faux positif (nom de branche en `-push`). #292 maj `A_FAIRE_MOI`. **Ménage : 23 branches mortes
> supprimées** (16 distantes + 7 locales) → `main` SEULE. ⚠️ **Auto-merge PROUVÉ bout-en-bout** (push→CI→
> squash-merge→suppression auto, zéro intervention) : les notes « auto-merge KO / required checks à activer »
> plus bas sont **PÉRIMÉES** (la ruleset `main` exige les 2 checks, ça marche). Stack : **Vite 8 (Rolldown)**,
> schema store **v7**.
>
> **Session 2026-06-15/16 — Review multi-agents + LOT HIGH FINANCIER BOUCLÉ (#295→#300)** : audit
> complet (12 agents, emphase financière) → 32 findings consignés au `BACKLOG.md` (§ « Review multi-agents
> 2026-06-15 »). **Lot HIGH financier #1-#6 entièrement traité** : 4 corrigés — #296 [FISC-RRQ-UNIT] (RRQ
> ×12, grossSalary mensuel÷MGA annuelle), #297 [FISC-SURVIVOR-DRAWDOWN] (survivant = 1 contribuable dans
> la cascade), #298 [FISC-LATENT-RE] (gain locatif latent au bilan successoral), #300 [FISC-WELCOME-UNIFY]
> (taxe de bienvenue UNIFIÉE par municipalité, source unique moteur+UI, repli Montréal, fin du bug C9) — et
> **2 FAUX POSITIFS écartés après vérif** : #2 FISC-MARGINAL-YEAR (revenu déjà déflaté), #5 FISC-ACB-RENO
> (rénos symétriques cost/value). ⚠️ Leçon clé ajoutée à CLAUDE.md : **« findings de review = hypothèses »**
> (33 % de faux positifs sur du code money-critical → VÉRIFIER avant de coder un fix). Restent MEDIUM/LOW au
> BACKLOG (FISC-TAXDEC-INCR, FISC-GOVPENSION-SCALE, FISC-RRQ-PRORATA, a11y…). Tous gates verts, 2048 tests.
>
> **▶ PHASE 2 (clé de voûte) TERMINÉE — 3/3 PR** (#240 #241 #242, détail BACKLOG) · **▶ PHASE 3 TERMINÉE
> (a/b/d) #244** : onglet PROFIL unifié (tout le setup user : identité, salaires, fiscal, répartition,
> détaillé, retraite via RetirementSettingsCard + RetirementIncomeCard extrait, enfants) + SetupHub en tête
> (% complétion global) ; éditeurs RETIRÉS de Impôts/Enfant/Budget/Config/Retraite (pointeur
> `ProfileFieldsMoved`) ; Retraite = résultats/analyses only. **PH3-c (purge champs détaillé morts) RESTE**
> (audit consigné au BACKLOG : 19 non consommés vs 5 ; purge soignée à part, tax-sensible).
>
> **Session 2026-06-12 (reprise) — GRIND autonome #267-275** (Marc « forcer basse-prio, ne pas s'arrêter ») :
> #267 SESSION_HANDOVER consolidé · **PH4-FUT « leviers-d'abord » BOUCLÉE** : #268 composeur de leviers
> REMONTÉ en amont (écran d'amorçage = `StrategyOptimizerPanel` obligatoire ; calcul-sur-clic via
> `revealedSig`/`applyAndReveal`, 2 `setAppState` BATCHÉS React 19) · #269 onglet « Paramètres »→« Hypothèses »
> + ordre de retrait AUTO (sélecteur retiré) · #270 annotations courbe (retraite/RRQ/PSV/épuisement compte) ·
> #271 docs (leçon git merge>reset). · **#272 tests Futur-critiques** : `applyAndReveal` (révélation sans
> flash = garde le batching) + `usePastPortfolioHistory` (mode test reconstruction directe, anti-fuite
> réel→test M3). · **#273 inflation 0 % respectée** (`?? 2.0` vs `|| 2.0`, famille PV-5 ; + cohérence
> moteur↔UI Retraite/Enfants) + re-scope FSS-PSV. · **#274 NPV estate** : estimés RRQ/PSV priment sur le
> split 65/35 (×N per-personne comme retirementIncome ; garde FA-5 verrouillée) — résout une divergence
> silencieuse estate↔revenu. · **#275 RRQ-PSV-MIN** : clamp `Math.max(0,…)` des estimés (retirementIncome
> + estateCalculation + `min={0}` UI ; un estimé négatif ne dégrade plus `total`/NPV en silence). Chaque
> lot : panel 3 agents (code-reviewer/silent-failure/projection-validator), suite verte (→**1996/1996**),
> zéro baseline. Confirmé : **le repo n'a aucun required check → `enable_pr_auto_merge` échoue « unstable »**
> → merge au vert via **timer court** (`sleep ~290` run_in_background, pattern documenté §auto-merge).
> **Lane fraîche épuisée → Marc a tranché « CONTINUER BAS-BRUIT »** : **#277** D6-SR-2 parité lecteur d'écran
> sur les sliders monétaires (helper `maskedSliderAria` + `aria-valuetext` ; étiquettes `privacy-blur`→
> `<PrivateAmount>` ; 0 privacy-blur restant dans les 2 fichiers) · **#278** CA-10 `usePwaInstallPrompt`
> (11 tests : recence de dismiss 30j, standalone, flux install) · **#279** noms accessibles `aria-label` sur
> les 5 sliders monétaires (WCAG 2.5.3/4.1.2) + constante partagée `MASKED_AMOUNT_LABEL` · **#280** [A11Y-SLIDERS]
> nom accessible (`aria-label` = texte visible) sur les **10 sliders taux/% de ProjectionControls** (dont la
> boucle inflation/poste) + PropertyConfigurator:172 ; test direct `ProjectionControls.a11y.test.tsx` · **#281**
> [A11Y-SLIDERS] **COMPLÉTÉ** — noms sur les 6 derniers sliders (RealEstate Rendement/Appréciation, DebtManager,
> TaxCenter REER/CELIAPP, ChildPlanning REEE) ; Budget déjà nommé, HealthIndicator déjà associé · **#282**
> [D6-SR-2] Retirement.tsx : les **13 montants** mono-valeur (3 KPIs + 10 tooltip) `privacy-blur`→`<PrivateAmount>`
> (ferme la fuite SR : le blur est CSS-only, un SR lisait les vrais montants en mode privé) · **#283** [D6-SR-2]
> **primitive `<PrivateBlock>` créée** (4 tests : aria-hidden conteneur + sr-only sibling, préserve le flex
> multi-spans là où PrivateAmount le casse) **+ Dashboard liste d'actifs migré**. Panel a11y-auditor à chaque
> lot UI. Suite → **~2024**.
> **▶ Reste = 🧭 FEU VERT MARC** : **[FSS-PSV]** (PSV DANS l'assiette FSS confirmé `taxDecember.ts:662` ;
> fix = câbler une PSV mensuelle au `ctx` + **transcrire la règle Annexe F dans FISCAL_REFERENCE D'ABORD**
> — money-critical, ne pas coder sur source non transcrite) · gros refactors CA-03/CA-06/CA-09 · P0 (proxy
> Anthropic / IndexedDB) · refontes **DESIGN** (Budget/Transactions/Retraite, irritants à cadrer).
> **Bas-bruit ENCORE dispo (prêt, mandat « continuer » de Marc)** : **[A11Y-SLIDERS] ✅ FAIT** · **D6-SR-2 :
> primitives `<PrivateAmount>`/`<PrivateBlock>` prêtes**, Retirement + Dashboard migrés → RESTE = **finition de masse**
> (~50 `privacy-blur` sur ~16 fichiers : ProjectionTooltip 13, ActionPlanDrilldown 6, RealEstate 4, etc. — mécanique,
> à faire par paquets de 1-2 fichiers ; outils prêts) · `analytics.ts` (trivial). DEAD-FLT-2/CA-01 = consommateurs
> VIVANTS → PAS du code mort. **Bas-bruit à fort signal épuisé ; reste = grind de masse D6-SR-2 OU item FEU VERT.**
> 🐛 **FIX 2026-06-12 (urgent Marc) — upload de DOCUMENTS PDF réparé** : `analyzePayslip` (services/claude.ts)
> envoyait TOUT fichier dans un bloc Anthropic `image` ET rejetait les non-images → tout PDF de bulletin/relevé
> échouait (« Analyse échouée ») alors que PayslipUploadCard + TaxCenter annoncent le PDF (`accept`+label). Correctif :
> helper pur exporté `buildPayslipFileBlock` → PDF en bloc `document` (base64 `application/pdf`), image en bloc `image`,
> throw sinon ; tests ajoutés. **Leçon : un PDF NE PASSE PAS dans un bloc `image` côté API Anthropic — bloc `document`
> obligatoire.** Validé typecheck + tests ; bout-en-bout réel (clé Anthropic + vrai PDF) reste à confirmer par Marc.
> 🆕 **FEATURE 2026-06-13 (Marc) — import de relevé PDF + auto-classification** : `ImportBankStatement` accepte
> désormais PDF/image (+ CSV). PDF → `analyzeBankStatement` (Claude Vision, bloc `document`) → tri chrono → CSV canonique
> (`extractedTxnsToCsv`) → MÊME pipeline que le CSV (parseBankCsv/fusion/dédup). Helper du fix PDF généralisé
> `buildPayslipFileBlock`→`buildVisionFileBlock`. Auto-catégorisation IA des nouvelles transactions à l'import (PDF+CSV,
> choix Marc) sur l'état FRAIS du store, lazy-import `claude.ts` (bundle boot préservé). CSV reste 100 % local ; le PDF
> est envoyé à Claude (consenti). Panel 4 agents → a11y status/alert + fix clobber appliqués. Bout-en-bout réel à confirmer.
> ⏸️ **Grind D6-SR-2 EN PAUSE** : ne pas relancer la finition de masse en pilote auto — DEMANDER la direction à Marc
> (Pause / grind D6-SR-2 / FSS-PSV / DESIGN). Outils (`PrivateAmount`/`PrivateBlock`) prêts pour reprise incrémentale.
>
> **Session 2026-06-11 (suite) — GRIND backlog (demande Marc « tout faire sans s'arrêter »)** :
> #243 PH2-d-1 (toast verrou irrécupérable) · #244 Phase 3 + **réduction docs 47→9** (HISTORIQUE.md
> consolidé) · #245 **[CPL-1]** (bug couple Marc : passage en couple GATÉ sur définition consciente du
> conjoint — formulaire + bypass sidebar fermé ; conjoint vide = zéro revenu fantôme, prouvé par test)
> + PH2-c-1 (dédup module fetch Finnhub durcie : par symbole+clé, retry, anti-fuite test) + PH2-c-2
> (ProjectionStaleBanner inter-onglets) + PH2-d-2 (tooltip verrou) + PH2-d-3 (aire CELIAPP) + SF-WARN ·
> #246 PH2-c-4 (parité directe du hook, 7 personas) + A11Y-LBL (18 labels) + DEAD-FLT (purge
> fetchLiveTotals inopérant) + primitive **PrivateAmount** · #247 : D6-SR
> (migration PrivateAmount : KPIStat levier + 21 sites — montants masqués aux SR en mode privé)
> + **PV-11** (goalShortfalls structuré, retraits goals aux séries withdrawal*, clamp liquid négatif ;
> validé projection-validator 1927/1927, réserve per-conjoint assumée → PV-11e).
> · **#248 FA-8** (lot fiscal : 2 vrais bugs — cap clawback PSV versée + assiette dividendes ; panel
> fiscal-accuracy AUCUN BLOQUANT ; 11 tests preuve-par-mutation) · **#249 PH3-c** (19 champs profil morts
> purgés, contre-audit complet, zéro migration — Phase 3 100 % TERMINÉE).
> **BACKLOG ACTIONNABLE VIDÉ** (10 PR mergées 2026-06-11). Restent : 🧭 décisions Marc (PH3-c-bis,
> PH1-b/Q2, FA-6, ITEM-2A/2C, P0-*) · suivis opportunistes (PV-11e test pinnant, D6-SR-2, DEAD-FLT-2,
> CA-xx) · **Phase 4 (refontes par onglet) : plan-first + OK Marc REQUIS par onglet.**
>
> **Session 2026-06-11 (suite 2) — PHASE 4 onglet FUTUR « leviers-d'abord » LIVRÉE** (5 PR) :
> #250 PH4-FUT-A (calcul-sur-clic : courbe+KPIs cachés tant que pas cliqué, signature `params` entier ;
> retrait des « plans » / 5 stratégies-types ; purge chaîne robustesse) · **4 nouveaux leviers de stratégie**
> (câblage partagé recherche↔courbe : StrategyConfig+LEVER_LIBRARY+applied*+configToEngine+runScenario) :
> #251 **profil de rendement** (conservateur/équilibré/agressif, presets) · #252 **fractionnement pension 65+**
> (ON/OFF, gate Phase 3 taxDecember) · #253 **taux d'épargne** (multiplicateur 0.9/1/1.2) · #254 **downsizing**
> immo retraite (vendre+racheter plus petit, libère 40% équité RP, exemption gain ARC). Chaque levier :
> non-régression bit-près + monotonie/effet + panel (fiscal-accuracy/projection-validator). Suivi : `[RE-GAIN]`
> (gain locatif non taxé, préexistant). ⚠️ Agents-panel s'orphelinent au resume → checks refaits à la main.
> **Phase 4 : onglet Futur TERMINÉ. Autres onglets (Transactions/Budget/Investissement/Retraite) : OK Marc requis par onglet.**
>
> **Session 2026-06-12 — GRIND MASSIF (~20 PR #250-266, demande Marc « forcer les basse-prio »)** :
> Phase 4 ONGLETS : Futur (#250 calcul-sur-clic gaté sur signature `params` + retrait des « plans » ; #251-254
> **4 LEVIERS** profil de rendement / fractionnement pension 65+ / taux d'épargne / downsizing) · Investissement
> (#255 autocomplétion Finnhub `searchSymbol` ; #256 allocation = portefeuille `assets` RÉEL + dividendes réels ;
> #259 4→3 pages) · Transactions (#257 tri colonnes) · Retraite (#258 invite `ProjectionRequired`, CSV déprécié
> retiré). · **RE-GAIN** #260 (vente immeuble LOCATIF → gain en capital imposé ; RP EXEMPTE) + #261 (succession,
> disposition réputée). · #263 **PV-6** (résiduel insolvable porté en dette `liquidDebt` au lieu d'absorbé) +
> **PH2-c-3** (calcul déterministe routé au Web Worker ; `useDebouncedMemo` purgé). · #264 **CA-02** (formatage →
> `formatCAD`). · #265/#266 **CA-04** (smoke tests des 8 composants money-critical sans test direct). Câblage
> leviers : StrategyConfig + LEVER_LIBRARY + applied* (ProjectionConfig) + configToEngine + runScenario (recherche
> ↔ courbe cohérentes). FISCAL_REFERENCE §8 (RE-GAIN) à jour. ⚠️ **Agents-panel s'orphelinent au resume** → checks
> refaits à la main (baselines + cohérence). **RESTE (FEU VERT MARC requis — gros/risqué)** : CA-03 (migration
> `utils/tax.ts` 820 l → `services/tax.ts`), CA-05 (découpe `Investments.tsx` 1187 l), P0 (proxy Anthropic /
> IndexedDB), DESIGN Budget + annotations Futur (routé `A_FAIRE_MOI`). **Non-tractables** : PV-11e (micro-effet
> non observable), DEAD-FLT-2 (`fetchPortfolioHistory` stub mais consommateurs VIVANTS → `StockComparisonModal`),
> CA-01 (`csvExport` en fait VIVANT, utilisé par Transactions).
>
> Session 2026-06-10 — **TOP 10 [UI-EPURE] COMPLET + 5 fiscaux MAJEURS + [UI-SCEN]**. Build/tsc/tests verts.
> - **Épuration UI (EP-1..EP-10)** — 4 PR (#225 EP-1/2, #226 EP-3/4/5, #227 EP-6/7/10, #228 EP-8) :
>   Futur/Paramètres « Risques & aléas » repliée + Card AI retirée ; Dashboard 5e KPI « Patrimoine projeté »
>   = source unique (`lastProjection.chartData`, mini-formulaire retiré) ; Investments donut santé +
>   projection par compte épurés ; Config SetupHub → ruban discret à 100 % ; ProjectionExplains méthodologie
>   sous « En savoir plus » ; Optimisation StressTest replié + **AssetLocationPanel SUPPRIMÉ** (doublon
>   Retraite) ; Retraite bloc pension DB replié. **no-silent-failure** : NetWorth non fini → `<ProjectionRequired>`
>   + `logError` (Dashboard/Investments). EP-9 = déjà satisfait (doublons retirés avant, CTA Futur fonctionnels).
> - **[UI-SCEN] (#223)** : `projection.withdrawalStrategy` = paramètre (sélecteur Paramètres), moteur 1 scénario
>   par défaut (suite moteur **82→33 s**), stress-tests à la demande (`StressTestPanel`), plans de base supprimés.
> - **Fiscal 5 MAJEURS (#221/#222)** : FA-1 assiette crédit pension (exclut RRQ/PSV) · FA-2 clawback PSV par
>   conjoint (seuil individuel) · FA-3 SRG non imposable + clawback complet · FA-4 CELI source unique ·
>   FA-5 NPV rentes succession ×N corrigé. `FISCAL_REFERENCE` §4/6/7 à jour.
> - **Gouvernance** : Action `backlog-autocheck` retirée (déjà) ; CLAUDE.md — règle auto-merge +
>   **force-push BLOQUÉ par le repo** → recovery « checkout branche distante + merge main + fast-forward »
>   (+ reconcile après CHAQUE squash-merge) documenté en § résilience cloud.
> - ⚠️ **Auto-merge KO** : le repo n'a **aucun required status check** → `enable_pr_auto_merge` échoue
>   (« unstable »). **À débloquer côté Marc** : Settings → Branches → required status checks (cf `A_FAIRE_MOI`).
>   Sinon chaque PR = re-check manuel. ⚠️ **Le webhook PR ne livre PAS le succès CI** (que les échecs +
>   commentaires) → pour merger sur vert sans auto-merge : `send_later` indispo ici → **réveil court en
>   arrière-plan** (`Bash run_in_background` `sleep ~210`) qui re-déclenche le check CI puis merge. Pas de
>   1 h d'attente, pas de `sleep` foreground (bloqué par le harness).
> - **Fix moteur/fiscal money-critical (suite, #229-#234)** : **PV-5** (champs `number` Retraite —
>   vide ⇒ `Number('')=0` persisté ⇒ pension DB « dès 0 an » ; garde `numOr`/`numOrUndef`) ·
>   **PV-1** (découvert de liquidités effacé par le clamp de croissance ⇒ patrimoine surévalué ;
>   sauvetage par cascade de vente, choix Marc) · **FA-9** (double indexation du SRG ⇒ max surévalué
>   ~49 % à 20 ans ; base réelle + nominalisation unique) · **FA-10** (impôt de décembre en survivorMode
>   sur 2 têtes ⇒ sous-imposition ; 1 contribuable) · **PV-2** (récolte de gains ignorait la banque de
>   pertes ; consomme `capitalLossBank` en premier, LIR 111(1)(b)) · **PV-10** (retrait NON-ENREG des
>   objectifs ne réalisait AUCUN gain ⇒ sous-imposition ; via `handleNonRegSale`). Chaque PR : panel
>   4 agents + FISCAL_REFERENCE à jour, suite ~1859 verte, zéro baseline.
> - **Règles Marc 2026-06-10** (CLAUDE.md) : **date+heure en tête de CHAQUE réponse** · **agents/timers
>   tués IMMÉDIATEMENT après usage** (plus de traînards « 160 h »).
> - **Reste ouvert (découvertes routées au BACKLOG)** : FA-6/7/8/11 (fiscal) · PV-3/4/7/8/9/11 (moteur :
>   crypto sans banque de pertes, TLH×ACB, gains invisibles au test SRG/clawback, métriques d'objectifs) ·
>   CA-01..10 (dette code) · [D6-SR] fuite SR mode privé. Auto-merge toujours KO (required checks à activer).
>
> Session 2026-06-09 — **14 PR mergées (#206-#217 + gouvernance)**. Tests **1782 verts / 154 fichiers**.
> - **Refonte Futur COMPLÈTE** : 4 sous-onglets (Graphique/Paramètres/Optimisation/Plan d'action)
>   + écran d'amorçage (#213) ; Robustesse+Optimiseur fusionnés en « Comparer les stratégies »
>   2 modes (#215) ; Plan d'action = checklist (case + montant + « Pourquoi ? » repliable,
>   `AdviceItem[]` structuré, zéro chiffre fiscal en dur) (#216) ; fix contraste onglets actifs (#215).
> - **Bug rentes bouclé** : début RRQ/PSV découplé de l'âge d'arrêt (moteur #210, RRQ→72) + UI âges
>   dans Retraite (#214). Fiscal : fractionnement pension 65+ (#211), récolte de gains (#212).
> - **Mode test réparé (#217)** : switch persona = base propre (zéro fuite inter-persona) ; mode test
>   PERSISTÉ (bannière survit au reload) ; push Drive toujours coupé en test ; `resetState` sort du
>   mode test ; `realDataSnapshot` typé `Omit<…,'apiKeys'>`.
> - **Gouvernance** : Action `backlog-autocheck` RETIRÉE (Claude coche le BACKLOG au merge) ;
>   CLAUDE.md § « Exécution cloud — résilience » (reverts conteneur → vérifier ancêtre origin/main,
>   CI muette = divergence, flake E2E = rerun) ; 14 branches mortes supprimées.
> - **Reste ouvert** : PR #150 dependabot (hono, sécu) ; P0 (proxy clé, IndexedDB, sync Drive réelle,
>   gate Google) ; [D6-SR] fuite SR mode privé.
>
> Session 2026-05-29 — **Feature Sync Google Drive** (livrée « dark », inerte sans `VITE_GOOGLE_CLIENT_ID`) :
> données dans le Drive de chaque user (appDataFolder), auto + garde anti-perte, pas de chiffrement
> applicatif (choix Marc), clés API synchronisées (sync v2, en clair). Code : `services/sync/*` + `services/googleDrive/*`
> + carte Réglages→Système. **Pour activer** : suivre `docs/GOOGLE_DRIVE_SETUP.md` (créer le Client ID
> OAuth + mettre `VITE_GOOGLE_CLIENT_ID`). Design : `docs/GOOGLE_DRIVE_SYNC_DESIGN.md`. Tests +53.
>
> Dernière session : 2026-05-28 — **Lot 1 (sécu) + Lot 2 (tests) + Audit multi-agents (Lot 3)** :
> - **Lot 1 — Sécurité & conformité** : backup auto chiffré AES-GCM (S-A), Google Consent Mode v2
>   pour GA4/Loi 25 (S-B), redaction PII errorLogger testée (S-C), anti-injection prompt partagé
>   `utils/promptSafety.ts` (S-D), quick-wins (S-E). ✅
> - **Lot 2 — Filet de tests moteur money-critical** : ~119 tests sur 11 modules sans test unitaire
>   direct (cloudBackup, taxJanuary, meltdownReer, monteCarlo, monthlyCalcs, etc.). ✅
> - **Audit 5 agents → corrections (Lot 3)** : aucun CRITICAL. Shippé en batches isolés (CI verte) :
>   F5/F7/F8/F6 (sécu), **F4** (retenue REER 21/26/30→19/24/29 % via `RRSP_WITHHOLDING_QC` — money fix),
>   **F1/F3** (silent-failures projection : stack worker préservée + `_hasError` lu → erreur honnête),
>   **F9/F10/F11** (perf : hoist `Math.pow`, Map O(1) tickFormatter, handlers pan stables). Rapport :
>   [AUDIT_2026-05-28.md](AUDIT_2026-05-28.md). Tier 🟢 (règles fiscales incertaines) **non modifié** sans source.
> Voir aussi [AUTH_SETUP.md](AUTH_SETUP.md), [SECURITY_STRATEGY.md](SECURITY_STRATEGY.md). Tests **1154/1154 verts** (106 fichiers).
>
> Session 2026-05-27 — **État production** (Cloudflare Access, clés chiffrées, CSV universel,
> CoinGecko/Finnhub, era retiré, G21 optimiseur, G22 UX, G23 a11y). Tests 732/732 alors.
>
> Session précédente : 2026-05-26 (G22) — refonte UX + navigation.
> Tests 742 → **732 verts** (delta : 2 fichiers test era retirés, compensé par test régression coussin).
>
> **Cycle 17-18 highlights** :
> - Mode test fixtures (couple Alex/Sam, 5 actifs réels Yahoo, REEE/dettes/immo)
> - 13 fixes bugs visibles (TaxCenter × 100, dettes infinies, Enfant crash, Math.round M$, etc.)
> - **Mode strict TOTAL** : 8 composants migrés vers `lastProjection.chartData`
> - **Centralisation Phase 3** : 9 nouveaux champs chartData (marginalTax,
>   reeeContribCum, DividendIncome, realNetWorth, etc.)
> - CSV Yahoo Finance authentique pour mode test (no-fake total)
> - Keyboard shortcuts Alt+1..9
> - 23 tests convergence Vitest (594→596 verts) + checklist 131 tests manuels
> - 8 nouveaux docs (BACKLOG, SECURITY_STRATEGY, CENTRALIZED_CALC_*,
>   PROJECTION_OUTPUT_SCHEMA, etc.)

> **Session 2026-06-19 — NW-PARITY-INVARIANT (#370)** (★ garde-fou keystone) : test-only, `tests/services/nwParity.test.ts` (5 tests). Cross-check NW présent (`computePresentNetWorth` UI) ≡ NW de départ moteur (cash + Σ buckets `derivePortfolioStartingBalances` − dettes) + end-to-end `chartData[0]` à flux nuls avec dettes. **Discriminant prouvé** : 3 scénarios (D1 celibataire, D2 couple 2 revenus, D3 couple asym dettes). Limite documentée : parité HORS immobilier. Panel 3 agents (code-reviewer/financial-integrity/silent-failure) APPROVE, 0 régression. Tests ~**2171/2171 verts**. Gates verts.
>
> **Process 2026-06-19 — CLAUDE.md prefs de Marc FONDUES (#369)** : au lieu d'un bloc dupliquant le `~/.claude/CLAUDE.md` global, les bouts nouveaux sont intégrés aux sections existantes — Réponses (résumé d'abord + options bon/mauvais + reco + le POURQUOI + labels enrichis `[Certain]/[Probable]/[Supposition]/[À vérifier]`), Workflow (cadrage en UN batch + définition de « fini » objectif+critère d'arrêt + « proposer ≠ faire »), cycle git **RECONFIRMÉ autonome** (commit→push→PR→merge seul ; le « push si demandé » du bloc global NE prévaut PAS ici ; mais destructif hors-cycle force-push/reset --hard/rm/drop/migration → confirmer Marc d'abord). Décision Marc.
>
> **Session 2026-06-19 — FISC-RE-SALE-RESIDUAL (#368)** (money-critical) : vente immo quasi-underwater (hypo 95-100 %, frais 5 % > équité → `saleNet < 0`) : `addLiquid(Math.max(0, saleNet))` effaçait le déficit → patrimoine surévalué. Fix = `addLiquid(saleNet)` → déficit déduit ou porté en `liquidDebt` (PV-6). 2 tests discriminants (unitaire `monthlyEvents.test.ts` + end-to-end conservation). ΔNW = −5 % valeur prouvé. Panel 4 agents APPROVE, 0 régression. Tests ~**2166 verts**. Gates verts.
>
> **Session 2026-06-19 — FUZZ-ONETIME-FLOWS (#367)** : fuzz étendu à l'**ACHAT IMMOBILIER** (mise 5-50 % < prix, génère hypothèque ; mesuré 257/500 runs sous hypothèque) + **RÉNOVATION** majeure. Invariant ajouté : `DetteTotale ≥ DettesNonImmo` (hypothèque non double-comptée). **Test déterministe immo** : reconstruction NW sous prêt. Discrimination prouvée end-to-end (flip signe équité + drop liquidDebt → fuzz échoue). **PARTIEL** : reste vente immo / gain locatif / revenu locatif / équité négative / véhicule / héritage / REEE (suivi au BACKLOG). Tests ~**2164 verts**. Gates verts.
>
> **Session 2026-06-18 (suite) — HARDEN-FUZZING (#365)** : `tests/services/projection.fuzzConservation.test.ts`
> (2 tests : 1 fuzz 500 runs + 1 discriminant end-to-end) + dép dev `fast-check ^4.8.0` déjà en place. Fuzz des 12 invariants :
> reconstructabilité forme-bilan (`ΔNetWorth = Σactifs − dettes`), NetWorth toujours fini, INV-6 (pas de flux fantôme).
> Scénarios bornés (1-180 mois, couples/célibataires, revenus/immo/dettes aléa). Discrimination prouvée : revert TEMPORAIRE
> d'une garde → test échoue → revert annulé (pattern détaillé CLAUDE.md « Prouver un test discriminant »). Panel 4 agents
> (projection-validator/financial-integrity/silent-failure/code-reviewer) ; **résiduel max mesuré 0,02 $**. **Backlog autonome
> ÉPUISÉ** : restent suivis (FUZZ-ONETIME-FLOWS, DEP-UNDICI-VULN, FISC-CONST-LINT-LIMITS, FISC-RRSP-PRE2010-FALLBACK) +
> items 🧭/👤 Marc (FISC-WELCOME-2026, RECH-ACTION-UX, phases 2-4 brief). Tests ~**2163 verts**. Gates verts.
>
> **Session 2026-06-18 — Durcissement MONEY-CONSERVATION + correctifs métier + UX (12 PR #351→#363)** :
> **Lot HIGH fiscal/métier** — #352 [FISC-ESTATE-PENSION-NPV] (NPV rentes RRQ/PSV ×12 annualisée, bilan successoral ~375 k$ corrigés) · #354 [FISC-EVENT-INCOMELOSS] (perte d'emploi/sabbatique/accident : réduction revenu ménage appliquée par moteur ; défauts 100%/100%/50%, net+brut REER réduits, impôt décembre conservateur) · #355 [FINNHUB-MISMATCH][RECH-ACTION-UX] (Investissement : fallback gracieux symbole non-cotable, Escape ferme dropdown sans fermer modale) ; **Durcissement money** — #356 [HARDEN-NETWORTH-EXHAUSTIVE] (compile-guard `NET_WORTH_SIGN` dans `computeRawNetWorth`, test littéral vs Σ, zéro régression) · **#362 [ENG-LOOP-ORDER-TEST]** (test ordre boucle mensuelle : allocation AVANT croissance, 2 scénarios discriminants, inversion PROUVÉE à la main échoue test → attrape décalage rendement que les 12 invariants laissent passer) · **#363 [HARDEN-FISCAL-TIMEBOMB]** (garde de fraîcheur des valeurs fiscales : `utils/fiscalFreshness.ts` lit la date « Dernière vérification »/« Ré-audité » dans `FISCAL_REFERENCE.md`, warn @12 mois, fail @18 mois ; 13 tests discriminants) ; **Hygiène** — #351 [ENG-MONTHLYOUTPUT-TEST] (test monthlyOutput complet, seul module sans test) + #353 [BACKLOG] (cocher livrés, découvertes, router FISC-WELCOME-2026) ; **UX + infra** — #357 [DOCS-DISCIPLINE] (`documentation-manager` devient PROPRIÉTAIRE de SESSION_HANDOVER, dans le « Toujours » de /review-all + rappel hook → handover à jour à CHAQUE push) · #358 [PROJ-INSOLVENCY-BADGE] (onglet Futur : badge danger « Plan insoutenable — capital épuisé vers X ans » quand le NW projeté franchit 0 ; helper pur `utils/insolvency.ts`) ; **Robustesse** — #360 [ENG-ESTATE-ESTIMATE-FIN] (`fin()` à la SOURCE : un estimé de rente NaN ne zérote plus TOUT l'estate — dégradation gracieuse). Conservation prouvée : **12 invariants OK**. Moteur stable **~2149 tests**, typecheck strict, Vite clean. État prêt déploiement.
> ⚠️ **À FAIRE Marc** : `FISC-WELCOME-2026` (valeurs RQ 2026) · `RECH-ACTION-UX` (confirmer visuellement avec clé Finnhub, A_FAIRE_MOI O5). **Restes autonomes** : `FISC-CONST-LINT` (risque faux positifs) ; `HARDEN-FUZZING` (attend OK dép `fast-check`). **Déféré (décision design Marc)** : `A11Y-BADGE-PROMINENCE` (fond Badge ~1.1:1 < 3:1 WCAG 1.4.11 sur TOUS les variants ; contraste par teinte non automatisé par check-contrast).

---

## 1. État en une page

| Indicateur | Valeur |
|---|---|
| **Repo** | https://github.com/MoKarade/FinanceAI |
| **Branche principale** | `main` (seule branche — ménage 2026-06-15) |
| **Dernière PR mergée** | **#532** [DOC] correction post-merge #531 (compte de tests + résumé panel dans SESSION_HANDOVER.md) |
| **PR en cours (DRAFT)** | **`[FINTABLE-4]`** (import manuel replié par défaut, dernier item du chantier Fintable — cf bandeau ci-dessus) — en cours d'ouverture |
| **App déployée** | https://www.hubperso.com (Vercel auto-deploy sur push `main`) |
| **Tests** | **3290 verts, suite complète** (288 fichiers, Vitest 4 ; `fileParallelism: false` ; 12 invariants money-conservation — compte exact au gate/CI, mesuré 2026-07-29) |
| **Typecheck** | Clean en mode strict |
| **Build** | OK — **Vite 8 (Rolldown)** ; lazy-loading préservé (vendor react/recharts/ai/pdf) |
| **Schema store** | **v7** (Zustand persist, migrations v1→v7) |
| **Stack IA** | `@anthropic-ai/sdk` (Haiku 4.5 + Sonnet 4.6 + Opus 4.8) — choix modèle par conversation, coût réel CAD ; Gemini retiré |
| **Banque** | CSV **+ import relevé PDF** (Claude Vision, #285) → pipeline `parseBankCsv` ; CSV 100 % local |
| **Crypto** | CoinGecko (gratuit, sans clé) |
| **Stock/ETF** | Finnhub REST (gratuit) |
| **Sécurité storage** | AES-256-GCM + IndexedDB non-extractible (`services/secureKeyStore.ts`) ; `npm audit` = **0 HIGH/CRITICAL, 2 MODERATE** (@hono/node-server, MCP-CloudRun séparé) |
| **Auth** | **Gate Google in-app** (`LoginGate`+`authGate`, `VITE_GOOGLE_GATE=1`) — **Cloudflare RETIRÉ le 2026-06-16** (Access + proxy DNS). Gate SOFT (trappe `?nogate=1`) ; données privées par compte Google |
| **Lighthouse prod** | Performance 97 / A11y 100 / BP 100 / SEO 90 (dernière mesure connue) |
| **PWA** | manifest + SW v2 (precache résilient) — installable Chrome/Edge/Mobile |
| **WCAG** | AA conformant (sub-set AAA pour touch, focus, reduced-motion) |

(Lighthouse : dernière mesure connue ; re-run recommandé après une grosse livraison UI.)

---

## 2. Contraintes cardinales (NE PAS VIOLER)

1. **🔒 ZÉRO service payant** — user a explicitement refusé Finnhub paid,
   Sentry SaaS, GlitchTip backend, tout SaaS récurrent. Tout doit rester
   sur tiers gratuits (Vercel free, GitHub Actions free, IndexedDB browser,
   localStorage, Anthropic API clé perso de l'user, Era Context perso, Finnhub free).

2. **🔒 PAS de Google Sheet** — l'user a demandé suppression totale du
   Google Sheet legacy (cycle 14). Le fichier `netlify/functions/sheet-proxy.ts`
   a été supprimé, le CSP a été nettoyé de docs.google.com, `services/finance.ts`
   ne fait plus de fetch CSV. Ne PAS le réintroduire.

3. **🔒 Pas de demo data au boot** — l'user veut un état vide tant qu'il
   n'a pas saisi ses infos lui-même. Hook `useHasUserData` (`utils/useHasUserData.ts`)
   gate l'affichage des widgets d'actions/dashboard. NE PAS pré-remplir
   `constants.ts` avec des INITIAL_USERS / INITIAL_BUDGET non-vides.

4. **🔒 Tester sur hubperso.com** — l'user a précisé : « SI tu veux faire
   des tests directement sur l'app utilise hubperso.com ». L'app est aussi
   sur GitHub Pages mais hubperso.com est la prod canonique.

5. **Branches `claude/<slug>` — cycle AUTONOME** (changé depuis 2026-06) — Claude gère le cycle
   COMPLET : branche → commits gated → push → PR → **auto-merge squash** (GitHub merge dès CI verte)
   → sync. **Plus de gate humain, Claude merge lui-même.** Source de vérité : `CLAUDE.md` § Workflow.

---

## 3. Ce qui a été livré cette session (18 PRs)

### Phase 1 — Production Readiness (PRs #99-#105)

| PR | Item | Description |
|---|---|---|
| #99 | P1.1 errorLogger | Rolling buffer 100 entrées localStorage + global handlers + viewer dans Système |
| #100 | P1.4 CSV + chunkLoad | `utils/csvExport.ts` RFC 4180 + `lazyWithRetry` (fix chunk-load) + cache headers Netlify |
| #101 | P1.3 backupAuto | IndexedDB 7-day rolling backups + AutoBackupPanel UI |
| #102 | P1.2 zod safeParse | Toutes les `Schema.parse()` → `safeParse()` avec errorLogger |
| #103 | P1.7 audit log | Rolling 500 entrées + AuditLogViewer dans Système |
| #104 | P1.5 PDF complet | Patrimoine + **Fiscal** + **Holdings** + **Dettes** + **Goals** + Retraite + Budget (+16 tests builders purs) |
| #105 | P1.6 Lighthouse CI | Workflow `.github/workflows/lighthouse.yml` warn-only + continue-on-error |
| #106 | docs P1 | MAJ HANDOVER + CHANGELOG + PLAN_P1 |

### Phase 2 — Mobile & a11y AAA (PRs #107-#114)

| PR | Item | Description |
|---|---|---|
| #107 | P2 plan | `docs/PLAN_P2.md` — triage + 9 items chiffrés |
| #108 | P2 quick wins | Modal focus restore (P2.2) + close 44px (P2.3) + prefers-reduced-motion (P2.6) |
| #109 | P2.5 contrast | ink-400 #64748b→#8896a8, ink-500 #475569→#6a7689 (WCAG AA) |
| #110 | P2.4 touch targets | 5 boutons icon <44px corrigés (privacy toggle, toast, docs, planning) |
| #111 | docs intermédiaires | MAJ HANDOVER P2 6/9 |
| #112 | P2.8 form labels | ~35 inputs orphelins fixés (PatrimoineExtended 17, Settings 10, DebtManager 5, etc.) |
| #113 | P2.9 PWA | manifest.json + sw.js + icon.svg + register en PROD |
| #114 | P2.1 axe pages | 4 pages couvertes (Onboarding, SystemView, Dashboard, TaxBracketViz) |
| #115 | docs P2 final | MAJ HANDOVER + CHANGELOG + PLAN_P2 (clôturé 9/9) |

### Cycles 17-18 — Mode test + Centralisation + Strict mode (2026-05-21)

Direct merges sur main (pas de PRs numérotées — workflow accéléré avec
Marc validant en live).

**Mode test** :
- `services/testFixtures.ts` : couple Alex/Sam, 68 transactions, 5 actifs
  réels Yahoo (VFV.TO, VEQT.TO, XEQT.TO, AAPL, BTC-CAD), CSV historique
  100% authentique bundlé `services/data/test-portfolio-history.csv`
- Bouton Activer/Désactiver dans Configuration → TestModePanel
- Banner orange permanent en mode actif
- `enableTestMode` snapshot des vraies données pour restauration safe

**13 fixes bugs visibles** (cycle 17) :
- TaxCenter taux marginal × 100 (était décimal affiché tel quel)
- Future scénarios "0.0M$" (Math.round avant /1M)
- Enfant crash (Bar dans AreaChart → ComposedChart)
- Tooltip Future taille fixe + icônes alignées + ligne décaissement
- Extinction dettes (effectiveMinimum garde-fou)
- Retirement aligné avec Future (savingsGoals + financialGoals)
- Fixtures Debt/ChildGoal champs corrects
- Variation Dashboard 2 décimales partout
- Plus : tooltip décaissement portfolio en retraite (bug "60\$/mois")

**Mode strict TOTAL** (cycle 18) :
- 8 composants migrés : Retirement, Dashboard, Investments, Budget,
  RealEstate, Planning, ChildPlanning, HealthIndicator
- Composant partagé `components/ui/ProjectionRequired.tsx` (variants
  block + inline)
- Suppression de tous les fallbacks fake (formule 5% Dashboard, 25×
  HealthIndicator, ×10×1.4 Latte Factor Planning, projection REEE locale
  ChildPlanning)
- Convention "valeurs réelles ou rien" appliquée à fond

**Centralisation Phase 3 — 9 nouveaux champs `chartData`** :
- Tier 1 : `realNetWorth`, `liquidityRunway`, `mortgageRemainingMonths`
- Tier 2 : `reeeContribCum`, `reeeGrantsCum`
- Tier 3 : `DividendIncome`, `TaxableInvIncome`, `marginalTaxRate`, `effectiveTaxRate`
- Hook partagé `hooks/useProjectionSelector.ts` (3 variants)

**B1 décision UX** : Retirement reflète automatiquement le scénario actif
de Future (badge "Scénario actif : {strategyName}" dans subtitle).

**Q3 keyboard shortcuts** : Alt+1..9 pour switcher d'onglet.

**Tests** : 573 → 596 verts (+23 : 16 convergence + 5 nouveaux Tier 1-2
+ 2 nouveaux Tier 3). +131 tests manuels checklist.

### G21 — Optimiseur de stratégie (cycles post-#116)

- `services/projection/strategySearch.ts` : recherche automatique de la meilleure stratégie d'allocation parmi toutes les combinaisons
- `services/projection/drawdownOptimizer.ts` : optimisation du calendrier de décaissement
- `services/projection/strategyRanking.ts` / `strategyRobustness.ts` : classement et robustesse des stratégies
- Bouton « Annuler » dans l'UI FutureProjection pour interrompre le calcul long
- Bouton « Appliquer la stratégie gagnante » (bascule le scénario actif sur le résultat optimal)
- Budget adaptatif : watchdog 15 min, estimation ~8ms/sim
- `lastProjection.bestStrategyIdx` : index de la stratégie gagnante dans `allResults`

### G22 — Refonte UX (cycles post-G21)

| Item | Description |
|---|---|
| G22-N3 | Planning + Abonnements fusionnés dans Budget (sous-onglets via `BudgetWorkspace.tsx`) |
| G22-N4 | Settings.tsx découpé en sous-sections (`settings/sections/` : Profile, Accounts, Integrations, Patrimoine, Backup) |
| G22-N5 | Onglet Système fusionné dans Configuration (sous-onglet « Système & diagnostics ») |
| G22-F1 | `components/projection/ProjectionExplains.tsx` : explorateur data-driven des données de projection |
| G22-F4 | `components/tour/GuidedTour.tsx` : tutoriel guidé lancé après l'onboarding (relançable depuis Profil) |
| G22-B1 | Valeur nette complète dans FutureProjection (placements reconstruits + cash) |
| G22-B2 | Bascule directe Couple/Individuel depuis la sidebar |

### G23 — Qualité & purge (session 2026-05-27, 4 merges directs sur main)

| Commit | Description |
|---|---|
| `3167a55` | U3 radio-group MC (clavier natif) + U4 tooltip tous événements + DT4 split testFixtures (6 modules) + bug HealthIndicator/NextBestAction (coussin = 0) + lisibilité tax.ts/projection.ts + sécurité MEDIUM eraContext + 0 warning ESLint (484→0) + resync docs |
| `20abca8` | Retrait 4 fonctions IA mortes de services/claude.ts (getInvestmentAdvice, generateSmartGoals, analyzeBudgetAI, analyzeDocuments) + schémas Zod orphelins |
| `4af08b2` | Retrait COMPLET era Context (~1 224 lignes) : services/eraContext.ts, services/aiOrchestrator.ts, components/dashboard/EraContextInsights.tsx, clé apiKeys.eraContext. ADR 002 marqué SUPERSEDED |
| `6042fe9` | Purge résidus era (CSP index.html + netlify.toml, source log errorLogger) + code mort knip (53→36 unused exports : hasSeenTour, PLAN_LEVELS, annualToMonthly, getAssetMeta*, getDividends, clearApiKeys, loadApiKeys) |

Tests après session : **732 verts / 71 fichiers** (delta : 2 fichiers test era retirés, compensé par test de régression coussin).

### Phase 3 — Lighthouse prod fixes (PR #116)

| PR | Description |
|---|---|
| #116 | Card title h3→h2 (heading hierarchy) + CoupleModeBadge role="img" + SW cache.addAll → précache individuel (Vercel rewrite `/index.html` 404 swallowed) + cache v1→v2 |

### P2.7 skip-to-main : déjà fait au cycle 5.1 (Layout.tsx:117-123) — pas de PR nouvelle.

---

## 4. Ce qui a été validé manuellement par l'user

Validé sur hubperso.com lors de la dernière session :
- ✅ PWA install Chrome desktop + mobile (icône emerald "Fi")
- ✅ DevTools → Manifest chargé, theme `#10b981`
- ✅ SW registered, activated
- ✅ Offline test (page s'affiche)
- ✅ **Lighthouse desktop : 97/95/100/90** (avant PR #116) — A11y 100 attendu après
- ✅ A11y manual checks 5.1 à 5.7 tous OK (focus restore, hit area, contrast, touch, reduced-motion, skip-link, form labels)

**À valider encore** (après #116 mergé) :
- ✅ **Cache Storage `financeai-v2` peuplé** — Validé 2026-05-21 après PR #118 (cycle 16). 16 entrées au 2e load (HTML + assets/* hashés). Voir `docs/INVESTIGATION_PWA_VERCEL_2026-05-21.md` pour le diagnostic complet.
- 🔲 **Lighthouse A11y re-run pour confirmer 100**
- 🔲 **PDF complet (P1.5)** — l'user n'a pas encore testé Patrimoine + Fiscal + Holdings + Dettes + Goals dans un seul PDF
- ✅ **SW update test** — Validé 2026-05-21 : push PR #118 a triggered un nouveau build, SW v2 a remplacé l'ancien automatiquement (skipWaiting + clientsClaim).
- 🔲 **iOS Safari** (l'user n'a pas Safari)

---

## 5. Ce qui reste (roadmap "10/10")

| Priorité | Item | Effort | Notes |
|---|---|---|---|
| 🔴 | P3 Refactor god-components | 40h | Settings 1500+ lignes, Retirement 1000+ lignes, Investments. Le refactor le plus rentable car ces fichiers freinent toute évolution. |
| 🟠 | P4 Tests Playwright E2E + visual regression | 25h | Manque tests d'intégration full-flow (onboarding → ajout asset → projection → PDF). |
| 🟢 | P5 Era push / sync multi-device | 50-80h | Avancé : sync transactions cloud bidirectionnel via Era. **Touche backend** → vérifier que ça reste gratuit. |
| 🟡 | Form primitives `<Input>`/`<Select>`/`<Field>` | 8h | 133+ inputs inline non factorisés (ADR-004). À faire en même temps que P3 idéalement. |
| 🟡 | i18n compléter | 10h | 32 → ~260 clés si l'user veut réactiver EN/FR (cycle A a supprimé le toggle). |
| ⚪ | Brancher `logAudit()` aux call-sites | 2h | Infra prête depuis #103 mais les call-sites (import CSV, suppressions batch) ne logent pas. Quick win. |

### Suggestions ad-hoc

- **Lighthouse Performance** : 97 est excellent. Si tu veux le pousser à 100, vise les 239 KiB d'unused JS dans `index-*.js` (split Settings + Retirement + Investments en lazy chunks). Voir suggestion Lighthouse.
- **Forced reflow Recharts** : 46ms perdus dans recharts internals. Pas fixable côté FinanceAI sans forker recharts. Ignorer.

---

## 6. Comment travailler dans ce repo

### Setup
```bash
git clone https://github.com/MoKarade/FinanceAI.git
cd FinanceAI
npm ci   # package-lock.json EST committé (lockfile de référence ; après reprise si node_modules manque)
```

### Commandes utiles
```bash
npm run dev          # localhost:3000 — Vite HMR
npm test             # vitest run (suite complète)
npm run typecheck    # tsc --noEmit, strict
npm run build        # bundle prod (vérifie pas de regression de size)
npm run lint         # eslint
npm run knip         # détecter dead code
npx tsx scripts/check-contrast.ts  # audit WCAG AA contrast
```

### Workflow Git (cycle AUTONOME — détail dans `CLAUDE.md` § Workflow)
1. À la reprise : `git fetch origin main && git merge --ff-only origin/main` (le clone local peut être
   TRÈS en retard — vu 146 commits le 2026-06-15).
2. `git checkout -b claude/<slug>` depuis `main`.
3. Code + tests ; commit (le hook `commit-gate` relance typecheck+test+build si des `.ts/.tsx` sont stagés).
4. `git push -u origin claude/<slug>` (le hook `learn-on-push` rappelle « leçon → CLAUDE.md ? »).
5. `gh pr create` (ready) → `gh pr merge --auto --squash` : GitHub merge seul dès la CI verte.
6. Au point de contrôle : vérifier `merged`, puis `git checkout main` + ff + `git branch -D <slug>` (squash ⇒ `-D`).
7. **CLAUDE.md s'améliore à chaque push** : capturer la leçon dans la MÊME PR.

### Onglets actifs (Alt+1..9)

| Alt | Onglet | Notes |
|---|---|---|
| Alt+1 | Dashboard | |
| Alt+2 | Transactions | |
| Alt+3 | Budget | Inclut Planification et Abonnements (sous-onglets internes — G22-N3) |
| Alt+4 | Dettes | Ancien Alt+4 était Planning, maintenant fusionné dans Budget |
| Alt+5 | Investments | |
| Alt+6 | Future | Sous-onglet « Explications » (ProjectionExplains — G22-F1) |
| Alt+7 | Retraite | |
| Alt+8 | Impôts | |
| Alt+9 | Assistant | |

Onglets retirés : Planning (fusionné dans Budget — G22-N3), Système (fusionné dans Configuration — G22-N5).

### Architecture clés
- **Entry** : `index.tsx` → `App.tsx` (root) → `Layout.tsx` (sidebar + bottom nav)
- **Routing** : Tab enum dans `types.ts:1`, dispatch via `TabRouter.tsx`
- **State** : `store/useFinanceStore.ts` (Zustand v5 + persist localStorage)
- **State shape** : `AppState` dans `types.ts:638`
- **Projection moteur** : `services/projection.ts` (9 phases mensuelles, 7 scénarios) — voir `docs/PROJECTION.md`
- **Fiscal** : `utils/tax.ts` (barèmes 2026 fédéral + QC + RRQ + RQAP + AE)
- **PDF** : `services/pdfReport.ts` (jspdf lazy)
- **IA** : `services/claude.ts` (Anthropic SDK) — `aiOrchestrator.ts` et `eraContext.ts` supprimés (era retiré)
- **Market data** : `services/marketData/` (façade Finnhub)
- **Backup** : `services/backupAuto.ts` (IndexedDB rolling 7-day) + `services/cloudBackup.ts` (export chiffré)
- **Audit/logs** : `services/errorLogger.ts` + `services/auditLog.ts` (rolling localStorage)

### Composants UI primitives (`components/ui/`)
- `Button`, `Card` (title=h2), `Badge`, `KPIStat`, `PageHeader` (h1), `EmptyState`, `Skeleton`, `Modal` (focus-trap+restore), `Pill`, `Tooltip`, `Toast`, `ConfirmModal`, `CommandPalette` (Cmd+K), etc.

### A11y patterns en place
- `.focus-ring` (72 usages) → `:focus-visible:ring-2 ring-primary`
- `.touch-target` (`min-width/height: 44px`)
- `prefers-reduced-motion` global media query (`index.css`)
- Skip-to-main link (`Layout.tsx:117-123`)
- Modal focus-trap + focus-restore
- 205+ `aria-*` attributes
- WCAG AA tokens (`ink-400` #8896a8, `ink-500` #6a7689)

---

## 7. Docs à lire si besoin de plus

**Core actif (9 fichiers `docs/`)** — réduction 2026-06-11 (47→9, le reste fusionné dans HISTORIQUE) :
| Doc | Quand le lire |
|---|---|
| **`docs/BACKLOG.md`** | **Restant à faire — à lire EN PREMIER** |
| `docs/A_FAIRE_MOI.md` | Tâches HUMAINES (Marc) |
| `docs/FISCAL_REFERENCE.md` | Valeurs fiscales — SOURCE DE VÉRITÉ (datée + sourcée) |
| `docs/ARCHITECTURE.md` | Stack, topologie, store, pipeline IA |
| `docs/PROJECTION.md` | Moteur de projection (phases, scénarios, MC) |
| `docs/PROJECTION_OUTPUT_SCHEMA.md` | Champs de `lastProjection.chartData[i]` |
| `docs/VISION.md` | Où va le projet |
| **`docs/HISTORIQUE.md`** | **TOUT le reste fusionné** : snapshots, audits, designs LIVRÉS (auth Cloudflare, sync Drive, MCP, multiuser, sécurité), ADRs, plans finis, 131 tests manuels. Git garde le détail par fichier. |
| `CHANGELOG.md` | Historique versionné |

---

## 8. Recommandations immédiates pour le prochain Claude

### Si l'user veut continuer le sprint
1. **D'abord** : faire valider les 4 items manuels restants (§4 ci-dessus)
   en demandant `AskUserQuestion`. Ne pas coder à l'aveugle si la prod
   n'est pas validée.
2. **Si tout est vert** : proposer P3 plan (refactor Settings le plus
   gros gain) ou Form primitives (compatible avec P3).
3. **Si bugs trouvés** : fixer en priorité avant d'ouvrir un nouveau chantier.

### Si l'user veut une feature précise
1. Lire `docs/ARCHITECTURE.md` pour comprendre la stack et la topologie
2. Identifier le composant/service à toucher via `grep`/`find` (pas Read en aveugle)
3. Suivre le workflow Git de la section 6
4. Toujours respecter les 5 contraintes cardinales (§2)

### Sources potentielles d'erreur connues
- **vitest v4** (PR #98 dependabot) : `environmentMatchGlobs` retiré. Le `vitest.config.ts` utilise déjà `environment: 'jsdom'` globalement. Ne pas re-rajouter `environmentMatchGlobs`.
- **CI race condition** (Tests + Build duplicate runs) : push+PR sync déclenchent 2 jobs concurrents qui se battent sur npm install. Faux-positif si un fail en <60s — re-run le job ou merger quand même.
- **Recharts canvas warnings** dans tests : `HTMLCanvasElement.getContext` non implémenté dans jsdom. Ce sont des warnings, pas des échecs.

### Anti-patterns à éviter
- ❌ Ré-introduire Google Sheet / docs.google.com / fetchPortfolioHistory CSV
- ❌ Pré-remplir INITIAL_USERS avec des noms / salaires non-vides
- ❌ Push à `main` directement sans PR (le cycle autonome = branche + PR + auto-merge, jamais direct)
- ❌ Ajouter une dépendance payante / SaaS récurrent
- ❌ Toucher au workflow `.github/workflows/ci.yml` sans précaution
  (vitest v4 incident — lighthouse a son propre workflow isolé pour ça)
- ❌ Rewrite massif sans plan (cycle 14 = plan P1 d'abord puis exécution)
- ❌ Arrêter une tâche EN PLEINE EXÉCUTION (règle Marc 2026-06-15 : aller au bout sans rendre la main)

---

## 9. Contact / contexte user

- **GitHub** : MoKarade
- **Email** : marc.richard4@gmail.com
- **Localisation** : Québec, Canada (l'app cible fiscalité QC/CA)
- **Langue** : français (FR uniquement depuis le cycle A — EN retiré)
- **Style** : direct, méthodique, valide en prod après merge, merge rapide
- **Préférence** : 1 PR par item, draft par défaut, descriptions PR détaillées
- **Test environnement** : hubperso.com (prod Vercel)

---

## 10. Mantra

> **Plan avant code. Tests verts avant commit. Gate vert + /review-all avant auto-merge. Claude merge autonome dès CI verte.**

Cycle 2026-06 : plus de validation humaine sur chaque PR — Claude gère le cycle COMPLET (branche → commits gated → push → PR draft → auto-merge squash dès CI ✅). Si tu lis ça, prends 5 min pour relire les contraintes cardinales (§2) et le workflow (§6) avant de commencer. C'est la différence entre une session productive et un rollback.

Bonne session 👋
