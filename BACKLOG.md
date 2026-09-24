# BACKLOG — FinanceAI (actionnable)

> Liste de ce qui RESTE à faire — refonte complète 2026-07-31 (demande Marc) : chaque item
> vérifié contre le code réel (2 agents, preuve fichier:ligne) avant d'entrer ici.
> Tâches finies + validées → [`docs/BACKLOG_ARCHIVE.md`](BACKLOG_ARCHIVE.md) (créé 2026-07-31).
> Historique ancien : [`docs/HISTORIQUE.md`](HISTORIQUE.md). Actions humaines : [`docs/A_FAIRE_MOI.md`](A_FAIRE_MOI.md).

## Convention (règles Marc 2026-07-31, NON négociables)
- **CHAQUE tâche a une case `- [ ]`** — aucune puce de tâche sans case. Une note/décision sans
  travail à faire n'est pas une tâche : elle va en archive ou dans `docs/adr/`.
- **Tenu à jour à CHAQUE push** : cocher les items livrés dans la PR même, ajouter les découvertes.
- **Archivage** : un item coché + validé (mergé sur main, gate vert) DÉMÉNAGE vers
  `BACKLOG_ARCHIVE.md` (avec date + PR) au plus tard à la PR suivante — le BACKLOG ne garde que le vivant.
- Chaque item Claude-faisable porte un **`[ID]`**. Claude coche lui-même au merge.
- Légende : 🔧 Claude · 🧭 décision Marc requise · 👤 action humaine (Marc) · ⏳ gros chantier ·
  (S/M/L) = effort. Les tests manuels (section 👤) n'ont pas d'`[ID]`.

---

## 💼 Portefeuille Disnat — refonte (cahier des charges de Marc, Lot 0 fait le 2026-09-24)

> Demande : « FinanceAI devient la référence fiable du portefeuille Disnat : valeur exacte jour par
> jour, aucun artefact, tenue à jour sans intervention » (cahier des charges « PROMPT v2 », fourni
> par Marc avec un fichier de vérification). Le **Lot 0** (audit en lecture seule + plan + questions)
> est livré à Marc **hors dépôt** — il contient ses montants réels, et ce dépôt est PUBLIC. Ce qui
> suit ne porte que des MÉCANISMES : aucune quantité, aucun montant, aucune date réelle d'acquisition.
> Lot 0.5 livré (PR #1035-#1039) ; questions du Lot 0 répondues (ADR 0019) ; **feu vert de Marc pour
> le Lot 1** (2026-09-24), un lot = une PR, dans l'ordre ci-dessous. Architecture retenue au Lot 0 : grand livre par
> compte courtier (champ additif, sans valeur par défaut) ; magasin de marché dans un fichier Drive
> SÉPARÉ, écrit par une seule tâche serveur (GitHub Actions → Cloud Run, ADR 0004/0010) ; moteur de
> valorisation pur partagé app/MCP/tâche ; Fintable en contrôle si Marc choisit la clôture officielle.

- [ ] 🔧 **`[PTF-L1A-SORTES-A-TRANCHER]`** (S, décision Marc) — la liste des onze sortes d'événements
  est « demandée, sans ajout » ; la revue du lot 1a a relevé ce qu'elle ne sait pas écrire, à trancher
  AVANT le parseur Disnat (1f) : annulation ou correction d'une ligne du courtier (montants toujours
  positifs, aucune sorte ne défait), regroupement qui change d'ISIN ou espèces versées pour une
  fraction (le fractionnement n'a qu'un ISIN et interdit tout montant), valeur comptable TOTALE
  imprimée à un transfert entrant (seul un coût unitaire est accepté, donc une division à l'import).
  Conversion de devises et virement interne : voir `[PTF-L1B-CONVERSION-VIREMENT]`. Tout ajout est un
  nouveau membre d'union ou un champ optionnel, sans migration ; chaque clé textuelle neuve entre dans
  `CHAMPS_TEXTE` dans le même commit.
- [ ] 🔧 **`[PTF-L1B-CONVERSION-VIREMENT]`** (S) — le livre n'a PAS de sorte pour une conversion de
  devises entre les comptes CAD et USD, ni pour un virement d'espèces interne. Tant qu'elles
  manquent, un relevé qui en contient ne peut pas être importé sans les déformer en dépôt/retrait
  (deux événements sans lien, taux de conversion perdu). À trancher avec le parseur (1f), sur des
  relevés synthétiques qui en portent : une sorte qui débite un compte et crédite l'autre dans le
  MÊME événement, avec le taux appliqué.
- [ ] 🔧 **`[PTF-L1C1-LECTEURS-EVENEMENTS]`** (S) — lecteurs EODHD des fractionnements et des
  dividendes, et lecteur Yahoo (secours). Volontairement ABSENTS du lot 1c-1 : la mesure du Lot 0.5b
  n'a porté que sur les clôtures, et Yahoo sert un prix AJUSTÉ qu'il faut dé-ajuster des
  fractionnements avant de le traiter en secours. Chacun arrive avec sa réponse RÉELLE enregistrée en
  fixture (mesure en CI, journal sans valeur), jamais d'après une forme supposée.
- [ ] 🔧 **`[PTF-L1C-MAGASIN-MARCHE]`** (L+S, deux PR restantes : tâche serveur 1c-2, référentiel 1c-3) — format du magasin (clôtures BRUTES avec
  source et statut officiel/reporté/secours, taux BdC datés, fractionnements, dividendes) ; tâche
  serveur idempotente qui rattrape les jours manqués, budget d'appels COMPTÉ, mode essai à blanc,
  magasin inclus dans l'export JSON ; import du SEUL référentiel (sans quantités) pour que
  l'archivage démarre avant le livre. ⚠️ Si la source retenue n'offre qu'un an d'historique gratuit,
  le rattrapage doit avoir lieu avant la fin de cette fenêtre.
- [x] 🔧 **`[PTF-L1D-VALORISATION]`** (L) — moteur pur partagé (date de calcul INJECTÉE) ; test
  « zéro artefact » contre un ORACLE indépendant (l'identité cours + change + flux est vraie par
  algèbre si le moteur calcule lui-même les effets) sur valeurs non arrondies, plus « jour sans
  mouvement → 0 » et « passé stable au recalcul » ; scénarios synthétiques nommés ; tests sous deux
  fuseaux de signes opposés.
  ✅ 2026-09-24 : `services/valorisation/valoriser.ts` — `valoriserAu(livre, magasin, date, ageMaxJours)`
  (total `null` dès qu'un cours, un taux ou le livre manque ; `manquants` nomme chaque cause sans
  montant ; aucun arrondi) et `variationEntre` (effet de cours, effet de change, mouvements ; un
  fractionnement de la fenêtre ré-exprime la position de départ). Oracle écrit à la main, 15 cas,
  6 perturbations rouges. Non branché : la passerelle est `[PTF-L1E-PASSERELLE]`.
- [ ] 🔧 **`[PTF-L1E-PASSERELLE]`** (L+L) — un seul point d'entrée pour toutes les surfaces (présent,
  départ du Futur, passé, PDF, MCP, hub), identique livre vide ; parité CROISÉE (même portefeuille en
  actifs et en livre → même chiffre au cent partout ; retirer une surface fait rougir).
- [ ] 🔧 **`[PTF-L1F-PARSEUR-DISNAT]`** (L) — parseur TypeScript texte → événements, sections bornées
  par la fin de COMPTE (l'ancien parseur Python s'arrêtait au premier « Total » et perdait des lignes
  en silence, mesuré), opérations réelles (retenue, impôt de non-résident, fractionnement), devise
  du prix distincte de celle de la valeur ; fixtures SYNTHÉTIQUES ; lecture PDF chargée en différé.
- [ ] 🔧 **`[PTF-L1G-IMPORT-PORTEFEUILLE]`** (L) — import déclenché par Marc, aperçu avant/après
  (quantité, prix, devise, coût, encaisse) ; remplacement daté des lignes mal cotées ; refus
  d'`apply_broker_statement` et de `delete_item` sur les lignes du référentiel (variante de symbole
  comprise) ; « ligne absente du relevé → rien retiré, écart signalé ».
- [ ] 🔧 **`[PTF-L1H-SOURCE-UNIQUE]`** (M) — retrait des anciens producteurs pour les lignes du livre ;
  l'appel BdC du navigateur est GARDÉ pour les actifs hors livre.
- [ ] 🔧 **`[PTF-L2-AUTOMATISATION]`** (M×5) — dividendes courus puis réels (requêtes tournantes dans
  le budget) ; virements caisse → courtier appariés ; rapprochements et alertes (dont compteur
  quotidien des résidus > 0,01 $, sans montant) ; arrivée des documents ; répartitions datées ; puis
  dix jours de bourse sans intervention.
- [ ] 🔧 **`[PTF-L3-AFFICHAGE]`** (M×5+L) — qualité des données, en-tête, courbe Valeur/Performance,
  lignes et fiche, dividendes réels, répartitions, MCP enrichi au cent près de l'app.
- [ ] 🔧 **`[PTF-L4-FISCALITE]`** (M×2, seulement si Marc le retient, après avis d'un fiscaliste) —
  PBR en CAD, gains latents fiscaux, T1135, revenus et impôts étrangers, gains réalisés (+ MCP).

**Défauts trouvés au Lot 0, hors du chemin des lots (mesurés ou relus dans le code)**

- [ ] 🔴 **`[SYNC-PUSH-SANS-OCC]`** (M) — la poussée Drive de l'app ne compare jamais l'état distant à
  sa dernière lecture (`services/sync/syncPush.ts`) : une écriture serveur (cron des cours, cron
  Fintable, outil MCP) arrivée entre deux sondages est effacée en silence. Prérequis de
  `[PTF-L1G-IMPORT-PORTEFEUILLE]` si le livre peut s'écrire depuis claude.ai.
- [ ] 🔴 **`[MCP-BROKER-IMPORT-DOUBLE-COMPTE]`** (→ `[PTF-L1G-IMPORT-PORTEFEUILLE]`) — `apply_broker_statement` :
  ligne neuve en CAD par défaut, coût = cours du relevé, quantité réécrite sans les achats datés,
  prix écrit dans la devise STOCKÉE, aucune suppression, aucun aperçu côté claude.ai. Simulé en pur
  sur l'état réel : un relevé recopié fidèlement double une partie du portefeuille.
- [ ] 🔴 **`[MCP-DELETE-ITEM-EFFACE-LE-PASSE]`** (→ L1g) — supprimer une ligne retire aussi ses achats
  datés : elle disparaît de toute la courbe passée.
- [ ] 🔴 **`[INVEST-AUCUNE-EDITION]`** (→ L1g/L3) — aucun écran ne corrige la devise, le prix d'achat,
  la quantité ou le symbole ; ni vente ni fractionnement (`addPurchase` n'a aucun appelant).
- [ ] 🟠 **`[ADDSTOCK-DEVISE-USD-PAR-DEFAUT]`** (S) — le formulaire d'ajout ignore la devise de la
  cotation et part en USD : un titre européen ajouté sans toucher au sélecteur est mal valorisé puis
  jamais rafraîchi (`AddStockForm.tsx:39`).
- [ ] 🟠 **`[QUOTE-SYMBOLE-SANS-CONTROLE]`** (S) — un symbole de cotation collé est accepté sans
  contrôle de devise ni d'ordre de grandeur, et efface l'historique ; ses cours sont ensuite rejetés
  pour devise différente → prix figé sans alerte.
- [ ] 🟠 **`[HISTORIQUE-YAHOO-DEVISE-NON-LUE]`** (S) — l'historique Yahoo ne lit pas `meta.currency` :
  une ligne de Londres en pence entrerait dans la courbe à ×100 sans rien dire.
- [ ] 🟠 **`[PERF-COMPAREE-TOTAL-AMPUTE]`** (M) — la « Performance » d'Investissements compare des
  totaux qui ne portent pas les mêmes titres ; une ligne sortie du TOTAL fait un creux FANTÔME, et la
  note ne regarde que le DERNIER jour de l'axe.
- [ ] 🟠 **`[DIVIDENDES-TABLE-EN-DUR]`** (→ L2/L3) — rendements codés en dur sans source (un FNB
  capitalisant reçoit un dividende inventé) ; la garde `> 0` empêche de saisir 0.
- [ ] 🟠 **`[FUTUR-HISTORIQUE-DETTE-DU-JOUR]`** (S) — l'Historique du Futur retranche la dette
  d'AUJOURD'HUI à toutes les dates passées (`FutureHistorySection.tsx:130`, `:161`).
- [ ] 🟠 **`[CASHFLOW-REVENU-GONFLE-PAR-UN-VIREMENT]`** (S + geste Marc) — un virement entrant
  UNIQUE classé « Revenus divers » est moyenné comme un revenu mensuel ; et le cashflow publié
  (revenu réel − dépenses BUDGÉTÉES) est planché à 0 (`financialSnapshot.ts:183`), donc un déficit
  s'affiche « 0 $ ». Quatre définitions de l'épargne coexistent selon l'écran.
- [ ] 🟠 **`[EXPORT-JSON-PERD-FINTABLE]`** (S) — l'export JSON énumère ses champs à la main et la
  restauration vide le stockage : soldes et historique Fintable, rôles, abonnements et taux perdus.
- [ ] 🟡 **`[PDF-PLACEMENTS-SANS-ECART-COURTIER]`** (S, jumeau de `[PDF-DETTES-SOLDE-BRUT]`) — la
  ligne « Non-Enregistré » du PDF est la somme des titres, l'actif net inclut l'écart courtier : la
  page ne s'additionne pas.
- [ ] 🟡 **`[COURS-AU-TROMPEUR]`** (S) — « Cours au … » est l'heure du dernier rafraîchissement, pas
  l'âge de chaque cours ; la variation « 24 h » compare les deux dernières clôtures quel que soit
  leur âge ; `get_holdings` ne publie aucune date.
- [ ] 🟡 **`[FUTUR-PANNEAU-REPOS-DEBUT-DE-MOIS]`** (S, [Probable], à confirmer à l'écran) — au
  repos, le panneau du jour désigne le 1er du mois (premier point `monthIndex ≥ 0`,
  `panneauPas.ts:53-57`), pas aujourd'hui.
- [ ] 🟡 **`[HUB-TREND-VALEUR-NETTE-EST-LA-SEANCE]`** (S) — la tendance collée à « Valeur nette »
  est la variation de séance des seuls placements (`mcp/hubSummary.ts:177`).
- [ ] 🟡 **`[HUB-FRAICHEUR-HORODATEE-PAR-LE-CRON]`** (S) — « Dernière synchro » prend l'heure de
  n'importe quelle écriture du blob, cron des cours compris : « ok » possible avec des transactions
  figées.
- [ ] 🟡 **`[HISTORIQUE-FX-1POUR1-MUET]`** (S) — deux copies locales du convertisseur du passé
  replient à 1:1 sans journaliser (`reconstructPortfolioHistory.ts:64`, `dailyPastLedger.ts:191`).
- [ ] 🔧 **`[CELI-SOLDE-ZERO-DESYNC]`** (?) — signalé par Marc dans son cahier des charges (« solde
  CELI à 0 par désynchronisation récurrente ») : NON investigué, à reproduire avant tout correctif.

## 📉 Axe des graphes trop large sur téléphone (Marc, 21/09/2026)

> Demande : « texte dépasse c'est moche, sur téléphone la courbe est trop petite, faut qu'elle
> prenne toute la largeur de l'écran, laisser moins de place pour la légende et pour le x et y,
> pose plein de questions je veux 5 propositions ». Cadrage fait (4 questions en clic) : le
> bandeau KPI/tiroirs (texte qui débordait) est **corrigé** — voir `HANDOVER.md` et le
> `CHANGELOG.md` du 21/09. Ce qui RESTE : le graphe lui-même.

- [x] 🔧 **`[FUTUR-AXE-Y-MINIMAL]`** (M) — **Futur fait, reste 9 écrans (→ item suivant).** Marc a
  choisi, parmi 5 maquettes (canvas `eeecb5db-c2f1-49a1-8f29-9b82b46610a2`, E1-E5), la combinaison
  **E2 (badge flottant) + E4 (étiquettes superposées)**. Livré sur le graphe principal « Courbe de
  vie » (`FutureProjection.tsx`) : `<YAxis hide>` (plus aucun chiffre, gouttière récupérée — 5
  lignes de `CartesianGrid` restent en repère discret), nouveau badge `TodayValueBadge`
  (`ProjectionTooltip.tsx`) ancré sur le point du jour avec sa valeur nette réelle
  (`pointAncre.NetWorth`, masquée en mode discret via `maskedTick`), conteneur du graphe débordant
  du padding de sa `<Card>` (`-mx-6 px-1`). Panel a11y-auditor/code-reviewer/silent-failure-hunter
  passé, 0 bloquant, 4 correctifs appliqués (garde `Number.isFinite`, `Pill` partagée, `aria-hidden`
  défensif, mitigation de chevauchement). 4 tests neufs
  (`tests/components/FutureProjection.todayValueBadge.test.tsx`).
  ⚠️ **MESURÉ** sur un Pixel 10 Pro (viewport ~412×915px CSS, **[Probable]** — appareil sorti après
  le dernier entraînement du modèle) : zone de tracé passée de 238px à ~290px sur 412 (57,8 %→70 %+).

- [ ] 🔧 **`[FUTUR-AXE-Y-MINIMAL-ROLLOUT]`** (L) — Le même traitement (E2+E4) reste à porter sur les
  **9 autres écrans à graphe**, aucun n'ayant d'abstraction d'axe partagée : `Retirement.tsx`,
  `DebtManager.tsx`, `ChildPlanning.tsx`, `budget/BudgetGroupTable.tsx`,
  `investments/DividendPanel.tsx`, `projection/futureDetail/DrillDownCompte.tsx`,
  `realestate/MultiPropertyComparison.tsx`, `realestate/ScenariosComparatifsCard.tsx`, et
  `ui/ZoomableTimeChart.tsx` (partagé par le tiroir Historique de Futur — signalé « trop cramped »
  par Marc, donc PRIORITAIRE dans ce sous-lot — **et** par `StockChart.tsx`/Investments, contextes
  pleine largeur où masquer l'axe n'a pas été demandé). ⚠️ `ZoomableTimeChart` a 3 appelants
  distincts (`FutureHistorySection` via `DashboardEvolutionChart`, `Investments.tsx`,
  `StockComparisonModal.tsx`) : le patron `isLateralDrawer`/`isLateralDrawer`-style de
  `ProjectionControls.tsx` (prop booléen fourni par l'appelant, défaut `false`) s'applique — jamais
  un `hide` inconditionnel qui casserait les 2 autres contextes non signalés.

## 🛰️ Chaîne de publication vers hubperso (21/09/2026, signalé par Marc)

> Demande : « affciehe encore la mauvais valeur dans hubperso, pourtant jai deploy », puis
> « corrige tout maointeant je veux avoir la bonne valeur dans hubperso et que ca réarrive jamais ».
> Cause racine : **rien dans la réponse servie ne disait quel code la produisait**. Détail et
> mesures dans `docs/CONVENTIONS.md`
> (`UN-DEPLOIEMENT-QUI-EMBARQUE-LE-DOSSIER-LOCAL-NE-DIT-PAS-QUEL-CODE-IL-SERT`).

- [ ] 👤 **`[MCP-DEPLOY-CONTINU-MORT]`** (S, **bloqué sur Marc** → `docs/A_FAIRE_MOI.md`) — le
  workflow `Deploy MCP (Cloud Run)` échoue à CHAQUE push en ~12 s : `GCP_PROJECT_ID` n'est pas
  défini, et les secrets `GCP_WIF_PROVIDER` / `GCP_DEPLOY_SA` manquent. Tant qu'il est mort, la
  seule voie vers Cloud Run est le script lancé à la main — c'est-à-dire exactement la voie qui
  permet de déployer un clone périmé. ⚠️ Un workflow qui échoue à chaque push depuis des mois
  n'alerte plus personne : il enseigne le rouge.

## 🧪 Mode Sandbox de l'onglet Futur (21/09/2026, demandé par Marc)

> Demande : « on va retravailler full le sandbox de l'onglet futur, jveux que ca change que ce soit
> plus propore ». **Décisions de Marc (21/09)** : (1) périmètre cible = **copie complète du dossier**
> modifiable de bout en bout ; (2) signal = **toute la page change d'allure** ; (3) le mécanisme
> GÉNÉRALISE le **MODE TEST** existant plutôt que d'en créer un second — il remplace déjà tout
> l'état, garde une copie du réel, sait revenir, coupe le push Drive et affiche déjà un bandeau
> plein écran ; (4) les deux curseurs actuels sont **SUPPRIMÉS** (avec neutralisation de la valeur
> persistée), ce qui referme le split 55/45 par suppression du code qui le porte ; (5) l'étanchéité
> se ferme **tout de suite, en lot séparé** ; (6) backup manuel **refusé avec explication**, export
> PDF **refusé** pendant le mode (choix de Marc CONTRE ma recommandation de filigrane).

### Ce que « généraliser le MODE TEST » FAIT, mesuré le 2026-09-22 (Marc : « analyse d'abord tout ce que ça fait mais oui »)

**Le « Sandbox » actuel n'est pas un mode, c'est UN booléen** : `projection.useTheoretical`, basculé
par le sélecteur `real`/`sandbox` de `FutureProjection.tsx`. Il change **trois** sites du moteur :
`computeIncomeBaseline` remplace les vrais salaires par `theoreticalIncome` **splitté 55/45 entre
deux conjoints**, `projection.ts` (base de dépenses) lit `theoreticalExpenses`, et la sensibilité
d'épargne bascule aussi. Les deux curseurs n'écrivent que ces deux champs. Rien d'autre de l'app ne
sait que le sandbox existe.

**Le MODE TEST, lui, est lu par 22 fichiers de production** (`grep isTestMode`, hors tests/e2e), en
QUATRE familles — c'est ça, « tout ce que ça fait » :

| famille | ce que ça fait | sites |
|---|---|---|
| **Coupure réseau / écriture** | push Drive coupé (`syncPush`, `syncEngine`) · sync Fintable coupée (`autoSync`) · **les 3 hooks de cotations s'arrêtent** (`useAssetDataHydration`, `usePortfolioHistory`, `usePastPortfolioHistory`) · pièces jointes non poussées (`useAiChat`) · backup d'ARCHIVE, PDF et CSV refusés | 10 |
| **Rappels tus** | `BackupReminder`, `StatementReminder`, `SyncStaleBanner`, `SyncStatusBanner`, `CeliAssetNudge`, `HistorySyncDoctor`, `FintableSyncCard` | 7 |
| **Affichage** | bandeau + contour orange plein écran (`Layout`, classe `test-mode-active`) · `TestModePanel` · `FutureProjection` (8 sites autour de la révélation/gel de courbe) · `Investments` · `AiChatView` | 5 |
| **Hygiène** | `personaSanitizer`, `purgePersonaArtifacts`, `migrationsPersistees` | 3 |

**Ce qui est DÉJÀ sûr sans rien écrire** : le push Drive coupé ⇒ le serveur MCP et hubperso
continuent de servir le DERNIER instantané RÉEL ; les clés API ne sont jamais écrasées ; la sortie
désinfecte le snapshot avant de le restaurer.

- [ ] 🧪 **`[SANDBOX-MODE-TEST-GENERALISE]`** (L, **cadré + OK de Marc le 2026-09-21**, portée
  GLOBALE confirmée le 2026-09-22) — remplacer `useTheoretical` par un bac à sable qui est une
  **copie complète du dossier**, via le MODE TEST existant. Trois conséquences MESURÉES décident de
  la forme du lot, et aucune n'était sur la table au cadrage :
  1. ⚠️ **Toute clé absente des fixtures retombe au DÉFAUT, pas au réel.** `enableTestMode` fait
     `personaResetBase()` (= `DEFAULT_APP_STATE` moins `apiKeys`/`fxRates`/`lastUpdate`, cloné)
     **PUIS** `...fixtures`. Un clone PARTIEL est donc un dossier silencieusement AMPUTÉ — sur 47
     clés d'`AppState`, chaque oubli est une tranche remise à zéro sans le dire. Le clone doit
     porter le jeu de clés EXACT du snapshot. ⚠️ Et **deux listes d'exclusion divergent déjà** :
     `extrairePersistable` en exclut 8, le snapshot d'`enableTestMode` en exclut 8 AUTRES (il
     n'exclut pas `projectionStatus`/`projectionRefus`/`lockedProjection`). En écrire une
     troisième à la main, c'est la faire diverger une fois de plus → **source unique**.
  2. ⚠️ **Les cotations s'ARRÊTENT pendant tout le bac à sable** (3 hooks). Voulu pour un persona
     figé — on ne dépense pas de quota Finnhub sur du faux. Sur un bac à sable qui porte SES vrais
     titres, ça veut dire **portefeuille gelé aux derniers prix connus** tant que le mode est actif.
     Probablement acceptable (on explore un scénario, pas la séance du jour), mais ça doit être
     **dit à l'écran**, jamais subi — sinon c'est indiscernable d'un bug (classe
     `UN-CHIFFRE-JUSTE-PEUT-ETRE-ILLISIBLE`).
  3. ⚠️ **`realDataSnapshot` est PERSISTÉ** (`extrairePersistable` ne l'exclut pas, délibérément :
     « la bannière survit au reload »). Avec un persona, le snapshot est le dossier réel et les
     fixtures sont petites. Avec un **clone**, le blob `financeai-storage` porte le dossier **DEUX
     FOIS**. `localStorage` plafonne à ~5 Mo/origine et le dépôt a déjà un garde qui **re-lance**
     l'erreur de quota (`services/quotaStorage.ts`) — donc un dépassement n'est pas silencieux, il
     CASSE l'écriture. ⚠️ **Taille non mesurable depuis le conteneur** : aucune mesure du poids de
     l'état n'existe dans le dépôt. Mesure à UNE question de distance — Marc, dans la console du
     navigateur : `new Blob([localStorage.getItem('financeai-storage')]).size`. Sous ~1,5 Mo le
     doublement est sans risque ; au-delà il faut trancher entre « le bac à sable ne survit pas au
     reload » (ne pas persister le clone) et une compression.

  Reste du plan, inchangé : entrée « bac à sable » appelant `enableTestMode(cloneDuDossier,
  'bac-a-sable')` ; `activeTestPersonaId` ne peut pas porter un persona qui n'existe pas → marqueur
  propre, sinon le bandeau (qui le LIT) annonce un persona vide ; bandeau adapté pour distinguer
  « persona de démo » de « bac à sable sur TA copie ».

- [ ] 🔒 **`[SANDBOX-CURSEURS-THEORIQUES-RETRAIT]`** (S, **OK de Marc**) — retirer les deux curseurs
  `theoreticalIncome`/`theoreticalExpenses` **ET neutraliser `useTheoretical` dans le moteur**. La
  PAIRE est obligatoire : un dossier déjà persisté à `useTheoretical: true` resterait sur des
  revenus splittés 55/45 **sans plus aucun bouton pour revenir** — l'interface qui le permettait
  venant de disparaître (`RETIRER-UN-REGLAGE-NUISIBLE-EXIGE-DE-NEUTRALISER-SA-VALEUR-PERSISTEE`,
  re-payée à l'identique sur T1213). Sites moteur à neutraliser : `setupSimulation.ts`
  (`computeIncomeBaseline`), `projection.ts` (base de dépenses), `projection.ts` (sensibilité
  d'épargne). Les trois champs restent `@deprecated` dans le type : les supprimer exigerait une
  migration du schéma persisté, soit un risque sur les données pour un gain nul.

- [ ] 🔒 **`[SANDBOX-PROMPTS-MARQUER-CONTEXTE]`** (S, **décision de Marc le 2026-09-22**, contre
  l'option « refuser ») — quand l'app tourne sur des données fictives, le `system` envoyé au modèle
  DIT que les chiffres sont un scénario hypothétique. Rien n'est refusé : demander conseil **sur**
  un scénario est l'usage même du bac à sable ; ce qu'on corrige est que le modèle traite du fictif
  comme des faits. ⚠️ **Périmètre RE-MESURÉ, et il corrige ce que j'avais publié** : j'avais écrit
  « pas de point d'entrée unique, sept fonctions, trois appels SDK directs » — faux dans les deux
  sens. Mesuré sur `\.messages\.(create|stream)\(` : **CINQ** points de contact, tous porteurs
  d'un `system` → `claude.ts` ×4 (`chat`, `chatStream`, `analyzePayslip`, `analyzeBankStatement`) et
  `services/aiTools/agentLoop.ts` ×1 (l'agent d'outils, celui qui porte le contexte financier).
  ⚠️ Le marqueur s'injecte **au point de contact SDK**, jamais chez l'appelant : `chat`/`chatStream`
  reçoivent `options.system` de leurs appelants, donc une injection en amont obligerait chaque
  appelant futur à y penser (même raison qui a mis la garde CSV dans `downloadCSV`, le point de
  SORTIE). ⚠️ Le patron existe déjà : `VISION_INJECTION_GUARD` (`utils/promptSafety.ts`) est un
  fragment de `system` partagé, injecté dans les `system` littéraux — c'est son domicile naturel.
  Garde : une 6ᵉ surface SDK sans marqueur doit rougir (l'inventaire se dérive du grep, pas d'une
  liste écrite à la main).

- [ ] 🟡 **`[CSV-EXPORTS-MORTS-SANS-GARDE]`** (XS) — `exportHoldingsCSV` et `exportBudgetCSV`
  (`utils/csvExport.ts`) n'ont **aucune** garde de mode discret, alors que leur voisin immédiat
  `exportTransactionsCSV` en a une, 20 lignes plus haut, avec son commentaire expliquant pourquoi
  (`PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`). ⚠️ **Mesuré avant d'écrire « fuite »** : les deux
  n'ont **AUCUN appelant** dans tout le code de production — ce sont des exports MORTS, donc le
  défaut est aujourd'hui **inatteignable**. Deux issues possibles (les retirer, ou les garder et
  les brancher) ; trancher avant de coder. ⚠️ Le téléchargement, lui, est déjà couvert contre les
  données fictives : la garde vit dans `downloadCSV`, le point de sortie commun.

- [ ] 🔴 **`[SANDBOX-FUITE-VERS-LE-MCP]`** (M, money-critical) — un sandbox laissé ALLUMÉ sort de
  l'onglet Futur et atteint les outils MCP. Chaîne tracée : `buildSimulationParamsFromState`
  (`services/projection/buildSimulationParams.ts:318`) passe `state.projection` **ENTIER** au
  moteur, donc `useTheoretical` / `theoreticalIncome` / `theoreticalExpenses` avec — et `projection`
  **est persisté** (`extrairePersistable`, `store/optionsPersistance.ts:76-95`, n'exclut que
  `lastProjection`). Le blob part vers Drive, le serveur MCP le lit, et `get_projection`,
  `get_retirement_outlook` et `simulate_what_if` répondent sur une projection **théorique**
  présentée à l'assistant comme le dossier réel. ⚠️ **MESURE QUI RÉFUTE l'alarme voisine** : le
  résumé du **hub n'est PAS atteint** — `mcp/hubSummary.ts:140` passe par `computeFinancialSignals`
  → `buildFinancialOverview` + `computeBaseGrossAnnual`, qui lisent `users` et les avoirs, jamais
  `projection`. Publier « le hub montre des chiffres inventés » serait faux : c'est le chemin MCP,
  et lui seul.

- [ ] 🟠 **`[SANDBOX-LASTPROJECTION-SANS-GARDE]`** (S, money-critical) — `ProjectionEngine.tsx:142`
  fait `setLastProjection(results)` **sans condition sur `useTheoretical`**. Or `lastProjection` est
  la source unique du dépôt (`CLAUDE.md` §1), lue par Retraite, Placements, Planification enfant,
  l'export PDF et le contexte de l'assistant — des écrans qui n'affichent AUCUN signe de sandbox.
  Un chiffre théorique y est donc indiscernable d'un chiffre réel. ⚠️ Contrepoint vérifié :
  `lastProjection` EST exclu de la persistance, donc il ne part jamais vers Drive — le défaut est
  borné à la session en cours, ce qui le rend moins grave que le précédent mais tout aussi
  silencieux. C'est `DECISION-PRIVACY-UNE-SEULE-SORTIE` à l'envers : une décision prise pour UN
  écran qui se répand sur toutes les surfaces.

- [ ] 🟠 **`[SANDBOX-SPLIT-5545-INVENTE-UN-CONJOINT]`** (S, money-critical) — le revenu saisi en
  sandbox est coupé **55 % / 45 %** en dur (`services/projection/setupSimulation.ts:168-169`) sans
  vérifier qu'un second conjoint existe. **Mesuré** (`computeIncomeBaseline`, revenu 8 000 $) : un
  dossier à UN seul utilisateur — comme un dossier dont le second est `undefined` — rend
  `{ 4 400, 3 600 }`, alors que le mode RÉEL sur le même dossier rend `{ 5 000, 0 }`. Le sandbox
  invente donc un second déclarant, ce qui fractionne le revenu sur deux déclarations et
  sous-estime l'impôt. ⚠️ Le défaut est **invisible dans le cas nominal** (Marc est en couple) et
  apparaît exactement dans le scénario que le bac à sable existe pour explorer (« et si j'étais
  seul », « et si Anna arrêtait de travailler »). ⚠️ Peut devenir sans objet si la refonte fait
  éditer chaque salaire individuellement dans la copie — à trancher au plan, pas à corriger deux
  fois.

- [ ] 🟡 **`[SANDBOX-FORME-DES-CHAMPS]`** (XS) — dans `FluxMensuelsFields.tsx` : les deux montants
  sont composés À LA MAIN (`{projection.theoreticalIncome || 8000}$`), donc hors `formatCAD`
  (« 8000$ » au lieu de « 8 000 $ ») alors que le `CLAUDE.md` §1 impose `formatCAD` UNIQUEMENT ;
  les défauts `8000`/`4000` sont écrits en dur sur **4+ sites** (affichage et curseur de chaque
  champ, plus les deux lecteurs moteur) ; et en mode réel les curseurs restent VISIBLES mais
  `opacity-50 pointer-events-none`, sans dire pourquoi — `pointer-events-none` ne les retire pas
  du parcours clavier, donc ils restent atteignables à la tabulation tout en paraissant éteints.

## 📱 Installable sur le téléphone (Marc, 18/09/2026 — « toutes les applications installables »)

- [ ] **`[PWA-IOS-ICONE]`** (XS, non demandé) — pas d'`apple-touch-icon.png`. Hors périmètre :
  Marc est sur **Android** (tranché le 18/09). À prendre si un iPhone entre dans le parc.

## 📈 Infobulle et courbes du Futur (18/09/2026, demandé par Marc)

> Demande : « je veux voir la courbe de la dette même dans le passé et je vois pas les transactions
> dans l'infobulle on dirait ça manque des transactions, fais une grosse grosse passe sur les
> infobulles y a des irritants ». Réponses en clic : **tout afficher avec défilement**, dette en
> **orange plein sous zéro**, périmètre **le graphe Futur d'abord**.

- [ ] 🎨 **`[A11Y-PANNEAU-BOUTONS-FANTOMES]`** (S) — **PRÉEXISTANT, trouvé par l'audit a11y du
  2026-09-18, non corrigé** (hors du périmètre demandé). Les boutons « à contour fantôme » du
  panneau du jour — « Détail complet » (`bg-primary/15` + `border-primary/30`), « Revenir à
  aujourd'hui » et les flèches Veille/Lendemain (`bg-white/10` + `border-white/20`) — ont un TEXTE
  parfaitement lisible (≈ 11,8:1) mais un **fond à ≈ 1,40:1** et une **bordure à ≈ 2,35:1** contre
  la page, sous le seuil WCAG 1.4.11 (3:1) qui s'applique aux limites d'un contrôle.
  ⚠️ **`npm run check-contrast` ne le voit pas** : il ne mesure que les CTA PLEINS. C'est le trou
  d'outillage qui explique que le motif ait survécu.
  ⚠️ Le motif est **identique à celui de l'ancienne infobulle** — donc pas introduit par
  `[FUTUR-PANNEAU-FIXE]` —, mais son EXPOSITION a changé : il est désormais **permanent** à l'écran
  au lieu d'apparaître au survol. Corriger = monter l'opacité du fond/bordure, et la valeur se
  choisit par MESURE, jamais au jugé.

- [ ] 🔧 **`[PANNEAU-FLUX-COLONNE-MUETTE]`** (XS) — **PRÉEXISTANT** (hérité de l'infobulle, vérifié
  contre `f2d0ee69`), signalé par la chasse aux échecs silencieux. `SectionFlux` rend un bloc VIDE
  quand aucun revenu ni dépense n'est non nul (une journée calme) : une colonne sans texte se lit
  comme une donnée manquante, alors que ses trois sœurs disent toutes explicitement qu'il n'y a rien
  (« Point mensuel — pas de détail au jour », « Aucun mouvement · marché seul »…).
  ⚠️ L'exposition a changé avec le panneau : la colonne est là en permanence.

- [ ] 🧹 **`[FUTUR-DETAIL-SHOWNASSETSSUM-MORT]`** (XS) — `FutureDetailModal.tsx` calcule
  `shownAssetsSum` et ne la lit **jamais** (une seule occurrence dans tout le dépôt). Elle porte en
  plus le `Number(...) || 0` que `[INFOBULLE-DETTE-NW-NON-FINI]` vient de condamner : la laisser,
  c'est garder un exemple du motif corrigé à trois lignes du correctif.

- [ ] 🔧 **`[PRIVACY-SCAN-ALIAS-FORMATNUMBER]`** (S) — `amountPrivacyScan` ne connaît que
  `formatCAD` / `formatCompactCAD` / `formatSigned(withCurrency)` et leurs alias : un
  `const fmtNu = (n) => formatNumber(...)` lui est **structurellement invisible**. Le site réel
  (`panneauJour/sections.tsx`, le gain affiché sous la valeur d'un compte) EST correctement
  enveloppé dans `<PrivateAmount>` — vérifié à l'œil — mais la garde ne peut pas le dire, donc son
  silence ne vaut rien ici. Trou d'outillage PRÉEXISTANT, simplement déménagé avec le code
  (`UN-RELEVE-PAR-LE-NOM-CANONIQUE-EST-AVEUGLE-AUX-ALIAS` appliqué à un formateur SANS devise).

- [ ] 🔧 **`[FUTUR-COURBE-DETTE-RENDU-NON-GARDE]`** (XS) — angle mort ASSUMÉ de
  `tests/components/futureCourbeDette.test.ts` : elle teste le module `detteSerie` et la config de
  légende, **jamais le rendu Recharts réel**. Un `connectNulls` retiré par erreur sur l'`<Area>` de
  la dette relierait les trous sans qu'aucun test ne rougisse — et un trou relié affirme une
  continuité que la donnée n'a pas.

---

- [ ] 🔧 **`[PANNEAU-VARIATION-RACCORD-PASSE-FUTUR]`** (S) — **signalé par Marc le 18/09/2026**
  (« explique-moi le rendement pour cette journée »), sur une capture du panneau du jour.
  **L'arithmétique de l'écran ne se recompose pas** : « Variation du jour » de plusieurs milliers de dollars contre
  « Dépôts » + « Rendement », qui ne somment qu'à quelques dollars. Écart de plusieurs milliers de dollars, sur la donnée la
  plus regardée du panneau.
  ✅ Ce qui EST cohérent, vérifié sur la même capture : les comptes recomposent la valeur nette au
  dollar près (somme des comptes moins la dette = valeur nette affichée), et les badges « +N » par
  compte somment exactement le rendement (vérifié au dollar près) — normal, `SectionValeurNette` et
  `SectionComptes` lisent les MÊMES champs `MarketGrowth*`.
  **MÉCANISME [Probable]** : `recomputeDailyDiffs` (`services/projection/dailyCurve.ts`) pose
  `diffNW = NetWorth(jour) − NetWorth(veille)` dès que les deux points sont CALENDAIREMENT
  contigus — `isCalendarYesterday` ne compare que les DATES, jamais la NATURE des deux points. Or
  le 18/09 est le premier jour **PROJETÉ** (badge à l'écran) et le 17/09 le dernier jour **RÉEL**
  (`lastTransactionDate` du MCP). La marche du RACCORD passé → futur est donc présentée comme une
  « variation du jour ». Les deux valeurs sont probablement EXACTES chacune ; c'est le LIBELLÉ qui
  est faux sur ce point précis.
  ⚠️ Même famille que `[PASSE-REEL-RACCORD-CHUTE]` et `UN-CHIFFRE-JUSTE-PEUT-ETRE-ILLISIBLE` (la
  « chute de 10k »), mais en sens INVERSE — et le correctif d'alors était une PHRASE, pas un
  lissage : lisser afficherait une valeur nette jamais eue.
  **À MESURER avant de corriger** : relire les deux points 17/09 et 18/09 et décomposer l'écart
  (bases de prix différentes ? clôture périmée contre prix courant ? un flux du jour défait par le
  dernier point du passé ?). `CORRIGER-UN-PRODUCTEUR-N-EST-PAS-CORRIGER-LA-CLASSE` : le raccord a
  déjà coûté ≈ 5 % d'écart de base entre `reconstructPortfolioHistoryDaily` et la boucle
  mensuelle le 17/09.
  **REMÈDE PRESSENTI** : ne pas nommer « Variation du jour » une marche qui traverse le raccord —
  soit l'absenter (comme pour un jour sans veille connue, déjà fait), soit la nommer pour ce
  qu'elle est. Aucun chiffre ne se lisse.

- [ ] 🔴 **`[SMITH-VENTE-FORCEE-FLUX-MUET]`** (M, money-critical d'AFFICHAGE, **préexistant**) —
  la vente forcée de l'appel de marge (`realEstateMonth.ts`, appel à `handleNonRegSale`) n'alimente
  **aucun flux publié** : pas de `state.withdrawalNonReg += call`, alors que son JUMEAU du même
  fichier (financement de l'achat) le fait. **Mesuré** sur la fixture Smith de
  `tests/services/smithMargeSansDette.test.ts`, invariant `ΔNonReg == MarketGrowthNonReg +
  NetTransferNonReg` : **227 pas sur 240** avec un résiduel > 1 $, pire 1 650,26 $, **209 748,91 $
  cumulés** ; contrôle négatif Smith OFF : **0/240**. Le patrimoine net reste JUSTE (actif ↓ = dette
  ↓) — ce qui ment est la SÉRIE : le non-enregistré bouge sans cause chez tous ses consommateurs
  (infobulle Futur, table `sr-only`, répartitions).
  ⚠️ **Le lot est ASYMÉTRIQUE et c'est ce qui le rend non trivial.** Publier `withdrawalNonReg` pour
  la vente coûte **0 $** (lecteur unique d'affichage). Publier `contribNonReg` pour l'injection
  jumelle (`state.nonReg += principalPaid`) **DÉPLACE DE L'ARGENT** : `growthApplication.ts` calcule
  la croissance sur `nonReg − contribNonReg`, donc l'injection gagne aujourd'hui un mois plein de
  rendement qu'elle n'a pas mérité — même mécanisme que `[ENG-APRIL-REFUND-NONREG-UNPUBLISHED]`,
  mesuré à −428,67 $/30 ans. Les deux ne se livrent pas au même titre.
  ⚠️ **Pourquoi rien ne rougit** : `tests/services/projection.fluxForm.test.ts` PORTE cet invariant
  sur NonReg, mais sa fixture a `realEstateGoals: []` — tout le module immobilier est hors de sa
  portée (`UN-INVARIANT-JUSTE-PEUT-ETRE-AVEUGLE-A-UNE-STRATEGIE-ENTIERE`, ici par la fixture). Le
  lot doit venir avec l'élargissement de cette fixture (une maison + Smith), sinon il reste invisible.
  ⚠️ `[SMITH-MARGE-SANS-DETTE]` a RÉDUIT l'exposition sans la fermer : avant, la vente muette
  frappait TOUT propriétaire ; depuis, seuls les dossiers `useSmithManoeuvre`.

- [ ] 🟠 **`[DETTE-LIEN-IGNORE-SANS-MESSAGE]`** (S, **préexistant**) — une dette liée à un marchand
  (taux 0 %) dont on remonte ensuite le taux perd son champ « marchand lié » : `peutSuivreDesVirements`
  devient faux, le champ ET son explication DISPARAISSENT du formulaire. `paymentPayee` reste stocké,
  le moteur refuse la courbe (`tracerDetteSuspecte` → `logError` warning), mais ce warning ne vit que
  dans Système & diagnostics — jamais dans le formulaire où l'utilisateur vient de faire le
  changement qui casse le lien. Il voit un champ s'évaporer sans cause donnée.
  Correctif proposé : quand `versementsFixes && lie !== '' && interestRate !== 0`, un message inline
  (`role="status"`, comme le refus d'origine incohérente deux lignes plus bas) : « Le lien à {lie} est
  ignoré tant que le taux n'est pas à 0 % — le solde n'est pas suivi. »

- [ ] 🟠 **`[NW-IMMO-ABSENT-DU-HUB]`** (S, **découvert en livrant `[KPI-AVOIRS-DETTES]`**) — le
  patrimoine net du BANDEAU de l'app AJOUTE l'équité immobilière (`FutureKpiStrip` : `netWorth +
  realEstateEquity`), celui du **snapshot MCP / hubperso** ne l'ajoute PAS
  (`services/financialSnapshot.ts` : `computePresentNetWorth(...)` seul, aucun `realEstateGoals`).
  Les deux coïncident tant qu'il n'y a pas de bien — **c'est le cas de Marc aujourd'hui**, et c'est
  pour ça que personne ne l'a vu. Le jour de son achat prévu dans sa projection, hubperso
  affichera une valeur nette inférieure à celle de son app, de toute son équité. ⚠️ Même classe que
  l'écart Fintable/app qu'il vient de signaler : **deux chiffres qui prétendent mesurer la même
  chose et ne se recomposent pas**. ⚠️ Corriger côté snapshot DÉPLACE un chiffre money-critical
  publié (hub + prompts IA + `get_financial_overview`) → plan-first, et mesurer d'abord si d'autres
  consommateurs comptent sur la convention actuelle.

- [ ] 🔴 **`[COTATIONS-EUROPE-PERIMEES]`** (M, money-critical d'AFFICHAGE, **signalé par la mesure
  du 2026-09-21**) — le panneau du jour de Marc affiche « **prix J−59** » : les cours de ses titres
  ont 59 jours. MESURÉ sur ses positions réelles : **une large part du portefeuille est cotée en Europe**
  (plusieurs lignes, sur des places européennes), et le forfait gratuit du fournisseur ne
  sert pas ces places (403 « le forfait ne couvre pas », classe déjà documentée). Conséquence CHIFFRÉE : le PASSÉ reconstruit au 20/09 est
  **≈ 3,7 % sous** la valeur des titres au prix du jour, sur toute la courbe passée.
  ⚠️ AUJOURD'HUI est juste (il part du total du courtier,
  `[FINTABLE-AUTORITE-AUJOURDHUI]`) : c'est exactement ce qui fabrique la marche au raccord dont
  Marc demande l'explication. ⚠️ Le correctif n'est PAS « un meilleur repli » : il faut une source
  de cotations qui couvre Euronext/Xetra, ou accepter et DIRE que le passé européen est figé. →
  décision Marc (une source payante est un abonnement, ce que le profil du dépôt exclut).
  ⚠️ **Complété au Lot 0 (2026-09-24)** : le diagnostic « forfait gratuit » est incomplet. Le repli
  Yahoo ne s'active que dans le NAVIGATEUR (`services/marketData/index.ts:183`) : côté serveur (cron,
  hub, MCP app fermée), seul Finnhub existe. Et certaines lignes ne sont servies NULLE PART (devise
  rejetée ou aucune cotation). Le remède passe par `[PTF-L1C-MAGASIN-MARCHE]`, source tranchée par
  `[PTF-L05B-MESURE-SOURCES]`.


- [ ] 🟠 **`[FUTUR-LEVIER-PASSE-MUET]`** (S, découvert en livrant `[DETTE-LEVIER-EXPLICITE]`) — la
  courbe « dont levier Smith » ne commence qu'au premier mois PROJETÉ où la résidence est détenue :
  le PASSÉ (`buildPastPrefix`, `dailyPastLedger`) ne publie pas `DetteLevierSmith`, et l'app ne suit
  aucune marge RÉELLE. C'est un choix ASSUMÉ (`null` plutôt que `0` — tracer zéro affirmerait
  « aucun levier »), **pas un oubli**, et la garde le verrouille. ⚠️ Mais rien à l'écran ne DIT que
  la courbe commence là : une courbe qui démarre au milieu du graphe est indiscernable d'un bug —
  exactement la plainte qui a créé ce lot. À trancher : une mention à l'écran, ou rien.

- [ ] 🟡 **`[SMITH-MARGE-BLOC-SANS-GARDE-FINIE]`** (XS, **préexistant**, aujourd'hui INATTEIGNABLE) —
  le bloc de l'appel de marge n'a aucune garde de finitude à lui. Un `currentValue`/`mortgage` non
  fini le ferait sauter EN SILENCE (`NaN > NaN` est `false`), et `smithManoeuvreDebt` croîtrait sans
  plafond, sans trace. Non atteint aujourd'hui **grâce au filet amont** (`verifierEntreesMoteur`
  scanne `realEstateGoals` récursivement) — à ne pas comptabiliser comme une protection DU BLOC.

- [ ] 🟡 **`[NORMALISATION-ACCENTS-DUPLIQUEE]`** (XS) — `s.normalize('NFD').replace(/\p{Diacritic}/gu,
  '')` est réécrit dans au moins **8** fichiers (`categoryRules.ts`, `merchantProfile.ts`,
  `detectTransfers.ts`, `suggestDebtName.ts`, `commun.ts`, `budget.ts`, et `ChampMarchandLie.ts`
  depuis `[DETTE-MARCHAND-RECHERCHE]`). ⚠️ Avant d'unifier : SÉPARER ce qui est partagé de ce qui ne
  l'est pas — une clé de RECHERCHE (rabat casse et accents) et une clé d'APPARIEMENT (`clePayee`,
  `trim()` seul) ne doivent surtout PAS fusionner, et c'est écrit dans les deux en-têtes.

- [ ] 🧭 **`[SMITH-MARGE-BIEN-QUELCONQUE]`** (S, **décision Marc**, money-critical) — même famille
  que `[SMITH-MARGE-SANS-DETTE]`, trouvée par le panel sur le lot qui le corrigeait : **la portée du
  bloc est plus large que celle de son sujet**. `state.smithManoeuvreDebt` est un registre de
  MÉNAGE — il n'est créé que sur la résidence principale (`useSmithManoeuvre && goal.isPrimaryResidence`)
  — mais l'appel de marge vit DANS la boucle sur les biens et le compare au `mortgage`/`currentValue`
  du bien COURANT. Un immeuble locatif à fort levier déclenche donc un appel de marge sur une marge
  hypothéquée par la résidence principale.
  **Mesuré** (RP 480 000 $ à 40 % de mise + plex 400 000 $ à 10 % acheté en 2029, Smith ON,
  croissance 0 %, 30 ans) : 1er appel au **mois de l'achat du PLEX** (m=38) contre m=122 si le bloc
  est restreint à la résidence principale ; 225 appels contre 192 ; patrimoine final
  **7 971 024 $ contre 7 998 034 $** — **−27 010 $ sur 30 ans**. ⚠️ Deux contrôles négatifs : RP
  SEULE et plex SEUL sont **bit-identiques** entre les deux versions, donc l'écart ne touche que le
  dossier MIXTE.
  Correctif candidat : ajouter `goal.isPrimaryResidence` à la condition — c'est la garde que le bloc
  voisin porte déjà. ⚠️ **Ça déplace de l'argent** → décision, à prendre avec `[SMITH-LTV-SEUIL-65]`
  (les deux portent sur la même formule). ⚠️ Aucun test ne nomme l'appel de marge hors la garde de
  `[SMITH-MARGE-SANS-DETTE]` : couverture actuelle nulle sur ce chemin.

- [ ] 🧭 **`[SMITH-LTV-SEUIL-65]`** (S, **décision Marc**, money-critical) — né du correctif
  `[SMITH-MARGE-SANS-DETTE]`. L'appel de marge compare **`marge Smith + hypothèque`** à **65 % de la
  valeur du bien**. Au Canada, le 65 % borne la portion **MARGE** d'un prêt ré-avançable ; le TOTAL
  (marge + hypothèque) est plutôt borné à **80 %**. Les deux règles ne se confondent pas, et celle
  qui est codée déclenche l'appel dès qu'on a moins de 35 % de mise de fonds — c'est-à-dire presque
  toujours. ⚠️ Le correctif livré rend le défaut INOFFENSIF (on ne rembourse plus que ce que la marge
  porte) mais ne tranche PAS le seuil : changer la formule déplace encore de l'argent, donc c'est une
  décision, pas un correctif. À poser à Marc avec les deux formulations et leur mesure.

## 💸 Reste du panel `[DETTE-VIREMENTS-REELS]` (18/09/2026) — mesuré, NON corrigé (hors périmètre)

- [ ] 🔧 **`[PDF-DETTES-SOLDE-BRUT]`** (S) — **le rapport PDF ne se recompose pas avec lui-même.**
  `components/app/exportPdfEcran.ts` somme `state.debts.reduce((s, d) => s + d.balance, 0)` et
  `services/pdfReport.ts` remplit chaque ligne (`balance`, `monthsToZero`) depuis `d.balance` —
  aucun des deux ne passe par `soldeDetteAujourdhui`. Le même document affiche pourtant un
  patrimoine net CORRECT (il vient de `computePresentNetWorth`, corrigé). **Mesuré sur le bail de
  Marc : le PDF dépasse l'écran d'environ 3,6 %, et l'écart grandit d'un versement hebdomadaire chaque semaine.**
  Un document exporté et partagé où `actifs − dettes ≠ valeur nette`, sans avertissement.
  ⚠️ Pré-existant (`[DETTE-SOLDE-INSTANTANE-FIGE]`, 17/09) ; `[DETTE-VIREMENTS-REELS]` en élargit
  la magnitude, il ne le crée pas. Routé plutôt que corrigé : deux fichiers qu'aucun des deux lots
  ne touche.

- [ ] 🔧 **`[PASSE-MOIS-DEUX-INSTANTS]`** (M) — **la série MENSUELLE du passé mêle la fin d'un mois
  et le début d'un autre.** `services/history/buildPastPrefix.ts` : `cashByMi` porte le cash à la
  **FIN** du mois (contrat de `reconstructCashHistory`) pendant que le supplément de dette porte le
  solde au **1er** du mois (`amortirVersementsFixes` échantillonne `premierDuMois`). **Mesuré au
  point `2026-08` : liquidités (= cash au 1er septembre) contre dette
  (= dette au 1er août) — un mois d'écart.** Chaque point mensuel du passé sous-estime donc la
  valeur nette d'environ un mois de versements (**un versement mensuel du bail** ici), et le raccord passé→futur
  montre une marche que `fluxPeriodeAnnulee` (environ la moitié de la marche) n'explique pas.
  ⚠️ **PRÉ-EXISTANT, prouvé** : rejoué avec la grille modélisée (donc sans `paymentPayee`, le
  comportement d'avant le lot), les valeurs sont IDENTIQUES — cohérent avec la bit-identité mesurée
  sur les huit personas. La série au JOUR, elle, est exacte. ⚠️ Avant de « corriger », trancher
  lequel des deux instants la série mensuelle PROMET : déplacer l'un sans l'autre ne fait que
  changer de côté l'écart d'un mois.

- [ ] 🔧 **`[DETTE-TX-POSTDATEE-ASYMETRIE]`** (S) — miroir, beaucoup plus petit, du défaut
  `isTransfer` corrigé dans le lot : `paiementsReelsDette` REFUSE une transaction datée APRÈS
  aujourd'hui (justifié : elle ne décrit pas un solde du jour) pendant que `computeCashLedger`, lui,
  la compte sans regarder la date. **Mesuré : valeur nette d'un versement hebdomadaire trop BASSE par transaction
  post-datée.** Le correctif n'est pas forcément côté dette — c'est l'ASYMÉTRIE qui est le défaut, et
  c'est peut-être le cash qui a tort.

- [ ] 🔧 **`[DETTE-TX-DATEE-AU-MOIS-JETEE]`** (S) — une transaction datée au MOIS seul
  (`2026-09`) est écartée des virements par `jourMs` (qui exige ≥ 10 caractères) **sans compteur ni
  avertissement**, alors que le registre du cash les COMPTE et les ANNONCE (`undatedTotal`, affiché
  dans le bandeau de la vue au jour). **Mesuré : un versement hebdomadaire de dette non déduit par occurrence** ⇒
  patrimoine sous-évalué. Le remède est un compteur PUBLIÉ (même patron qu'`undatedTotal`), pas un
  `continue` muet — refuser en silence est le mode de panne que ce dépôt a déjà payé trois fois.

- [ ] 🔧 **`[DETTE-PAYEE-RESIDU-INVISIBLE]`** (XS) — changer le `kind` d'une dette liée, ou lui
  donner un taux non nul, MASQUE le sélecteur de marchand sans effacer `paymentPayee` : le champ
  survit à l'enregistrement (`saveEdit` fusionne `{...d, ...draft}`), reste invisible, et le lien se
  réactive en silence si le taux revient à zéro. Effet conservateur aujourd'hui (aucune déduction
  n'a lieu), donc XS — mais un champ posé qu'aucun écran ne montre est exactement ce que
  `[DETTE-BALANCEASOF-INVISIBLE]` a coûté la veille.

---

## ♿ Trouvé par le panel du lot `[DETTE-VIREMENTS-REELS]` (18/09/2026) — RE-MESURÉ avant d'être écrit

- [ ] 🔧 **`[CONTRAST-SCAN-CLASSNAME-CALCULE]`** (M) — **le scan de contraste ne voit que les
  `className="…"` LITTÉRAUX, et son angle mort couvre 130 sites.** Il est DÉCLARÉ en tête de
  `scripts/lib/ctaContrast.ts` (« ⚠️ ANGLE MORT ASSUMÉ ») — donc il se lit comme un détail déjà
  tranché, et personne n'en avait jamais mesuré la TAILLE (`AUDITER-LE-FILTRE-AUTANT-QUE-LA-LISTE`).
  **MESURÉ le 18/09/2026** : `130 sites dans 48 fichiers` de `components/` portent un token de
  couleur (`text-…-400`, `bg-…-600`…) à l'intérieur d'un `className={…}` calculé. Aucun n'entre
  dans l'inventaire de `npm run check-contrast`, qui rend pourtant `exit 0`.
  ⚠️ **Le remède évident est presque INERTE, et c'est le point du ticket** : « étendre le scan aux
  ternaires de deux chaînes littérales complètes » (ce que le panel proposait) couvre **7 sites sur
  130**, soit 5 %. Re-mesuré autrement : si le scan récolte TOUT fragment littéral de l'expression
  (chaînes `'…'`/`"…"` **et** le texte brut d'un gabarit hors des `${…}`), il couvre **127 sites sur
  130** — les 3 restants construisent le nom de classe par interpolation
  (`FutureProjection.tsx`, `Layout.tsx`, `ui/Toast.tsx`) et resteront hors de portée, à déclarer.
  ⚠️ **Rejouer l'outil élargi AVANT de croire qu'il n'y a rien** : les offenders révélés sont le vrai
  périmètre, et ils n'ont aucune raison de ressembler à ce ticket-ci.
  · *Déclencheur de ce ticket* : la phrase de statut du solde dans `DebtManager` (la ligne qui
    choisit entre `text-amber-400` et `text-ink-400` selon `alerte`), mesurée À LA MAIN faute d'outil — **10,43** sur le fond réel `#1a1a1a` et **11,94** sur `bg-dark`
    pour `amber-400`, **5,78** / **6,62** pour `ink-400` : les quatre passent AA largement, donc le
    lot n'a PAS de défaut de contraste. C'est l'outil qui ne pouvait pas le dire.

- [ ] 🔧 **`[A11Y-DETTE-CIBLES-TACTILES]`** (S) — **aucun champ du formulaire de dette n'atteint
  44 px de haut**, et ce n'est pas une régression du lot. Mesuré : les `<input>`/`<select>` de
  `DebtManager.tsx` et `DebtKindFields.tsx` font ≈ **26 px** (`text-meta` 16 px + `py-1` 8 px +
  2 px de bordures), soit **−41 %** du seuil WCAG 2.5.5. La LARGEUR n'est pas en cause (le
  `<label className="flex flex-col">` étire les champs bien au-delà de 44 px) — mesurer par AXE,
  jamais en agrégat (`UNE-GARDE-QUI-REDUIT-DEUX-DIMENSIONS-A-UNE-MESURE-LE-MAUVAIS-OBJET`).
  `.touch-target` (44×44, `index.css`) existe et sert dans `Investments`, `Planning`,
  `Transactions`, `budget/BudgetGroupTable` — **jamais** dans ces deux fichiers, sans justification
  écrite. ⚠️ Le correctif cohérent porte sur le formulaire ENTIER : ne corriger que les deux champs
  neufs créerait une incohérence visuelle sans raison écrite.

- [ ] 🔧 **`[A11Y-DETTE-FOCUS-EDITION]`** (S) — `startEdit` (`DebtManager.tsx`) insère le panneau
  d'édition sans y déplacer le focus. Pour un utilisateur clavier ou lecteur d'écran, la branche
  ALERTE de `phraseStatutSolde` (« Solde jamais daté… », « Vérifie le marchand choisi ») n'est donc
  pas garantie d'être annoncée à l'ouverture : il faut naviguer jusqu'à elle. Pré-existant (le
  panneau date de `[DETTE-DATES]`), révélé par le lot qui a donné à cette ligne quelque chose
  d'important à dire. ⚠️ `tabIndex = -1` sur le conteneur est obligatoire : `focus()` sur un `<div>`
  non focalisable est un no-op SILENCIEUX, et le test interroge `document.activeElement`, jamais la
  présence de l'appel.
  ⚠️ **Ce qui a été EXAMINÉ et n'est PAS un défaut**, écrit pour qu'on ne le reprenne pas : la phrase
  de `phraseStatutSolde` **ne doit pas** devenir une région live. Elle se calcule sur la dette
  PERSISTÉE, pas sur le brouillon — elle ne réagit à aucune saisie dans ce formulaire, et ne peut
  changer qu'à une synchro en arrière-plan. L'annoncer interromprait la frappe pour un contenu
  descriptif. Le `role="status"` du refus de saisie, lui, réagit DIRECTEMENT à l'utilisateur : c'est
  ça, un message de statut au sens WCAG 4.1.3.

---

## 🔗 Carte du hub — ce que FinanceAI publie (14/09/2026)

- [ ] 👤 **Déployer le serveur MCP** — décision de Marc (15/09) : `mcp/deploy.sh` à la main
  maintenant. Les 177 commits partent d'un coup, dont `/vehicule/bail` que CarAI attend.
  L'écart se recreusera au commit suivant tant que `GCP_PROJECT_ID` + `GCP_WIF_PROVIDER` +
  `GCP_DEPLOY_SA` ne sont pas posés (`mcp/README.md` § Déploiement continu).

- [ ] 🔧 **`[HUB-LIQ]`** Ventiler les LIQUIDITÉS par compte dans `details` (S). Prévu au plan du
  jour, **écarté après lecture du code** : `computeCurrentLiquidity` délègue à `computeCashLedger`,
  qui accumule un solde UNIQUE (`initialBalances` + transactions) sans clé de compte. Il n'existe
  donc aucune ventilation à extraire — la publier demanderait un grand livre par compte, c'est-à-dire
  du travail neuf et non demandé. La ventilation des PLACEMENTS (`computeAssetBreakdown`) a été
  publiée à la place : elle existe déjà, elle est convertie en CAD, et c'est elle qui explique les
  signaux d'espace CELI/REER.
- [ ] 🔧 **`[HUB-RENDU]`** Le hub ne REND pas encore `details`, `primary` ni `recommendation` (son
  lot 2). Rien à faire dans ce dépôt : entrée gardée pour que « publié » ne se lise pas « affiché ».

---

## 📱 Refonte de l'onglet Futur pour le TÉLÉPHONE (Marc, 2026-09-10 — « actuellement c'est inutilisable »)

> Cadrage fait le 2026-09-10 (`/new-feature` : product-manager → architect → 16 questions posées à Marc, toutes
> répondues). Maquettes 390×844 : https://claude.ai/code/artifact/260843dd-1ee9-4a39-b1cb-ce4095c328ec
> (sources : `scratchpad/futur-mobile/*.dc.html`, valeurs d'EXEMPLE). Décisions verrouillées :
> [`docs/adr/0016-refonte-futur-mobile.md`](adr/0016-refonte-futur-mobile.md). **Direction A** (courbe d'abord,
> sous-onglets conservés), adaptation EN PLACE du composant existant (pas de coquille mobile dédiée), **zéro
> changement visuel desktop**, 6 PR incrémentales, filet d'abord, chaque PR livrée avec captures 390×844.
> ⚠️ Ni `[GODFILE-FUTUREPROJECTION]` ni `[A11Y-SUBTABS-FUTUR]` ne sont pris ici : les extractions de ce chantier
> sont des composants-FEUILLES purs (rendu desktop bit-identique), jamais l'arbre d'état ni les panneaux.

- [ ] 🔧 **`[A11Y-LEGEND-TOUTREAFFICHER-FOCUS-PERDU]`** (S) — DÉCOUVERT en revue a11y de PR3, PRÉ-EXISTANT (déjà
  dans `origin/main` avant toute la refonte mobile, vérifié : `git show 8bc6faa7:components/FutureProjection.tsx`
  portait déjà `showAllSeries` vidant `hiddenSeries`). Le bouton « Tout réafficher » (`FutureLegendDrawer.tsx`,
  variantes `inline` ET `drawer`) se DÉMONTE à chaque clic (`hiddenSeries.size` retombe à 0, la condition
  `hiddenSeries.size > 0 && (...)` rend `false`) — le focus clavier retombe sur `<body>`, perte de contexte pour
  un utilisateur clavier/lecteur d'écran. Le MÊME fichier documente et corrige exactement ce mécanisme sur un
  bouton voisin (`revealedRef.current?.focus()` après démontage du bouton Calculer, `FutureProjection.tsx:609`)
  — le correctif est donc déjà connu : renvoyer le focus sur le bouton de bascule du tiroir (stable) après
  `showAllSeries()`. Non corrigé dans PR3 (bug pré-existant, hors périmètre sans feu vert explicite).
- [ ] 🔧 **`[FUTUR-MOBILE-RETURNRATEFIELD-DETTE]`** (XS) — 5 points mineurs relevés par les revues silent-failure-hunter/
  a11y-auditor/code-reviewer de PR4, aucun bloquant, routés plutôt que corrigés hors périmètre : (1) `changedHypothesesCount`
  compare par `JSON.stringify` — sensible à l'ordre des clés d'un objet imbriqué (`returnRates`), inatteignable aujourd'hui
  (tous les producteurs respectent le même ordre littéral) mais sans filet si un futur producteur en change ; (2) un champ
  composite (`returnRates`) ne compte que pour UNE hypothèse modifiée même si plusieurs sous-valeurs changent — choix
  assumé, à documenter comme tel plutôt que découvert plus tard ; (3) `ReturnRateField` n'a pas de mécanisme de masquage
  mode-discret (`isPrivacyMode`/`maskedSliderAria`), contrairement à `FluxMensuelsFields`/`ValeurMaxMaisonField` du même
  lot — `ltcMonthlyCost` ($/mois) qui y passe désormais hérite silencieusement du même défaut PRÉ-EXISTANT que sur desktop
  (`ProjectionControls.tsx:407-412`, jamais dans `PrivateAmount`) ; (4) `check-contrast` est aveugle aux classes passées en
  template literal (`colorClassName`) et aux fonds `rgba` (`bg-black/30`) — trou d'outillage, contraste mesuré MANUELLEMENT
  conforme (6,83–12,14:1) mais une future couleur mal choisie sur ce composant ne serait jamais détectée automatiquement ;
  (5) `numberId` de `ReturnRateField` se dérive de `slugify(label)` sans vérification d'unicité — aucune collision
  aujourd'hui (tous les libellés mobiles sont distincts), mais un `id` optionnel avec fallback silencieux est fragile.
  ⚠️ Deux points PRÉ-EXISTANTS (non aggravés par PR4, juste étendus de 3 à 6 sections / repris tels quels) : les curseurs
  `<input type="range">` n'ont pas de zone tactile ≥44 px garantie par CSS (seul le champ numérique jumeau l'a) — vaut un
  ticket séparé puisque PR4 est justement la refonte tactile ; et les 6 `CollapsibleSection` de l'onglet Hypothèses mobile
  sont en `headingLevel` par défaut (h3) directement sous le `<h1>` « Projection », sans `<h2>` intermédiaire (motif déjà
  présent sur les 3 sections desktop, ce lot le double sur la surface mobile).

## 🔗 Chaîne de build — audit du 2026-09-18 (`REMEDIATION_AUDIT_2026-09-18.md`)

- [ ] 🔧 **`[AUDIT-L2-AUTRES]` Le même lot L2 sur les 7 autres dépôts** (S). `DriveAI` 6
  checkout, `Hubperso` 5, `JobAI` 3, `CarAI` 3, `hub-contract` 2, `batchchef-` 2, `MemoryAI` 2 —
  23 étapes, aucune avec `persist-credentials` au 18/09. Plus `npm ci` sans `--ignore-scripts`.
  ⚠️ Mesurer par dépôt quels workflows POUSSENT avant d'éditer, et re-mesurer les comptes : sur
  FinanceAI, deux des trois comptes du document (S6505 × 7, S8543 × 7) valaient **zéro**.
- [ ] 🔧 **`[CI-LOCKFILE-PERIME]` `ci.yml:33` affirme « pas de package-lock.json commité dans ce
  repo » — c'est FAUX** (S). Découvert en passant le 18/09, non corrigé : hors périmètre.
  Le lockfile EST commité (`npm ci` fonctionne sur un clone neuf, et le `Dockerfile` le copie).
  Conséquences de la phrase périmée : `cache: 'npm'` reste désactivé sans raison, et les quatre
  workflows utilisent `npm install` là où `npm ci` serait déterministe. ⚠️ Un commentaire qu'on
  sait faux cesse d'être lu comme une information — c'est la même mécanique que
  `UNE-REGLE-ECRITE-SUR-UN-OBJET-DU-MONDE-REEL-SE-PERIME-QUAND-SA-REPRESENTATION-CHANGE`.

---

## 🔬 Audit financier 2026-09-07 — findings VÉRIFIÉS et re-mesurés (rapport : `docs/AUDIT_FINANCIER_2026-09-07.md`)

> Passe n°4 (commit `3f657d7d`, demande Marc « lance une grosse analyse, check tous les problèmes corrigés et
> mets à jour la doc »). Cœur sain : 0 écart fiscal de valeur, conservation 0,02 $, 233/239 corrections
> archivées encore en place, 10/10 de juillet fermés. Chaque ticket ci-dessous a été relu au `fichier:ligne` et
> ses chiffres re-mesurés par moi — jamais recopiés d'un agent. Lots proposés (rapport §10) : ✅ 213 = XS/S sans
> décision (16 tickets livrés le 2026-09-07) · ✅ 214 = W5 publication (3 tickets, 2026-09-07) · 215 = gate REER per-conjoint · le reste attend Marc.

- [ ] 🟡 **`[ENG-DIVORCE-RENTAL-INCOME-UNSPLIT]`** (S, MOYEN money-critical, trouvé en revue de la PR
  #954 par le silent-failure-hunter — même classe que le dividende d'entreprise ci-dessus, PAS
  introduit par ce lot) — `applyW5Effects` calcule le NOI locatif encaissé/imposé depuis le tableau
  BRUT `containers.rentalProperties` (`monthlyRent`, `monthlyExpenses`, `vacancyPct`), jamais depuis
  `rentalStates` — la copie mutable qui, elle, EST partagée au divorce (`currentValue`, `mortgage`,
  `monthlyPayment` `*= keep`, corrigé par `[ENG-W5-RENTAL-OFFBALANCE]` le 2026-08-13). Résultat : le
  BILAN d'un immeuble locatif suit le partage, le LOYER NET encaissé et imposé ne le suit pas — le
  ménage restant continue de toucher et payer l'impôt sur 100 % du loyer net indéfiniment. Même
  correctif que `businessStates` ci-dessus : faire lire `applyW5Effects` sur une version scalée de
  `monthlyRent`/`monthlyExpenses` (ou dériver le NOI depuis `rentalStates` si les deux registres
  peuvent porter la même info), mesurer l'écart cumulé avant de livrer.
- [ ] 🟢 **`[ENG-DIVORCE-CRYPTOACB-UNSPLIT]`** (XS, FAIBLE, trouvé en revue de la PR #954 par
  financial-integrity, PAS introduit par ce lot) — `crypto *= keep` est appliqué au divorce
  (`services/projection.ts`) mais `cryptoACB` (le prix de base pour le calcul du gain en capital à
  la vente) ne l'est pas, contrairement à `nonRegACB` qui suit bien `nonReg *= keep` une ligne plus
  haut. Le PBR crypto resterait au niveau d'avant-divorce sur une position réduite de moitié ou plus
  — sous-estimation potentielle de l'impôt sur un retrait crypto post-divorce. Correctif suggéré :
  `cryptoACB *= keep;` juste après `crypto *= keep;`, avec un test discriminant à écart d'âge/position
  non nul (mesurer l'écart avant de livrer, comme pour tout correctif money-critical).
- [ ] 🟡 **`[REER-CONJOINT-ATTRIBUTION-72]`** (S, MOYEN — résiduel du lot 215, RECLASSÉ par les deux revues : estimations d'AGENT sur une copie patchée (cotisations réservées aux conjoints ≤ 71 ans) = **+13 789 $ (+2,1 %)** de patrimoine surévalué sur 68/53 (60 227 $ de cotisations attribuées au slot du 72+ après ses 72 ans), et **−195 415 $ (−7,5 %)** sur 60/73 — défaut PRÉ-EXISTANT que le lot 215 n'a pas créé (60/73 est bit-identique) mais que son nouveau cas de test « le conjoint de 73 ans génère des droits » BÉNIT ; 55/55 → 0 $ exactement — [À vérifier] par une mesure à moi avant de coder) — quand un conjoint de 72 ans ou plus
  génère des droits (revenu gagné) et que le ménage cotise, le moteur verse dans le pool `reer` et le registre
  per-conjoint attribue la cotisation par `shares` (clé salariale), donc en partie au REER du conjoint de 72+ — qui ne
  peut plus en détenir. En droit, c'est une cotisation à un REER de CONJOINT : elle va au REER du plus jeune. Effet :
  conversion FERR trop tôt d'une part qui devrait vivre chez le plus jeune. Non mesuré (aucune fixture ne cotise avec
  un conjoint de 72+ actif) ; mesurer sur 60/73 avec cotisations avant de coder.
- [ ] 🟡 **`[ALLOC-REER-72-RECUPERATION-PSV]`** (M, MOYEN produit, 🧭 plan-first — touche une FONCTION OBJECTIF, trouvé
  par le projection-validator du lot 215, nouvellement ATTEIGNABLE) — `AUTO_MARGINAL` cotise au REER pour un ménage dont
  un conjoint a 72+ (les droits existent, lot 215) alors que les retraits FERR obligatoires qui suivent déclenchent la
  récupération de la PSV : sur 68/53 (déterministe) la stratégie détruit **113 449 $ de PSV** pour gagner 34 220 $ de
  remboursements d'impôt. Le gate est juste ; c'est l'allocateur qui n'a jamais eu à arbitrer dans ce régime. Question
  produit : la décision de cotiser doit-elle intégrer la récupération PSV attendue (taux effectif marginal 15 % de plus
  au-dessus du seuil) ? Plan à poser à Marc — c'est le classement des stratégies qui bougerait.
- [ ] 🟢 **`[REER-GROWTH-FANTOME-MOIS-VIDE]`** (XS, FAIBLE, pré-existant — projection-validator du lot 215) —
  `MarketGrowthREER` est PUBLIÉ (−7,64 $ mesuré sur 68/53 au mois 238 ; 61,18 $ sur 60/73 au mois 159) le mois où le
  REER est vidé à exactement 0 : une croissance annoncée, jamais réalisée → résiduel INV-2 de quelques dollars, aux
  mêmes valeurs AVANT et APRÈS le lot (le lot déplace le mois, pas le mécanisme). Correctif : ne publier que la
  croissance effectivement créditée au solde.
- [ ] 🟡 **`[RRSP-EARNED-INCOME-LOYER-BRUT]`** (S, MOYEN, pré-existant — trouvé par la revue fiscale du lot 215) —
  `services/projection/realEstateMonth.ts` (`ajouterParProprietaire(state.rentalEarnedParProprietaire, …, rentalIncome)`)
  verse le loyer BRUT au revenu gagné pour les droits REER, alors que la LIR 146(1) retient le revenu de location NET
  (intérêts, taxes, entretien déduits). Avant le lot 215 le pool était fermé dès 72 ans ; désormais un propriétaire de
  72+ avec conjoint plus jeune accumule des droits sur une assiette surévaluée. Non mesuré. Correctif : passer le loyer
  net des charges déjà calculées dans le même module (`immoCharges`, `immoInterest`) — vérifier d'abord que ces charges
  sont bien celles du bien loué, pas de la résidence.
- [ ] 🟡 **`[AGE-USER0-SANS-AGE-VAUT-30]`** (XS, MOYEN, pré-existant — revue fiscale du lot 215) — `services/projection.ts`
  `const currentAge = user1?.age || 30` : un premier utilisateur saisi par `birthYear` SEUL (sans `age`) est traité à
  30 ans pour toute la projection — donc gate des droits REER ouvert à vie, FERR jamais, PSV/RRQ décalés. Le conjoint,
  lui, a un repli `birthYear` (`ageCourantUtilisateur`). Correctif : même repli pour user0 (`startYear − birthYear`),
  et un `0`/`NaN` ne doit pas retomber sur 30 en silence (`||` efface la saisie). Vérifier d'abord quels producteurs
  peuvent écrire un user sans `age` (onboarding, MCP, import).
- [ ] 🟡 **`[TAXESTIMATE-DIVIDENDES-ORDINAIRES]`** (S, MOYEN, 🧭 sur quelle surface s'aligner) — `services/taxEstimate.ts:33-35`
  estime les dividendes (2 % du non-enregistré) puis les impose comme du revenu ORDINAIRE dans l'onglet Impôts et
  `get_tax_situation` ; le moteur passe par `calculateDividendTax` (majoration + CID). **Mesuré** sur 10 000 $
  de dividendes déterminés : ordinaire 2 569 / 3 678 / 5 047 $ contre majoration + CID progressif 200 / 1 895 /
  3 727 $ (bases 40 k / 100 k / 250 k$) — surestimation de 2 369 à 1 320 $. Conservateur, mais deux surfaces
  donnent deux chiffres pour la même hypothèse.
- [ ] 🟡 **`[FISC-PROXY-45-BONUS-RSU-NON-DOCUMENTE]`** (XS docs livrées au lot 212 · reste : XS ratchet + 🧭 assiette) —
  `services/projection/activeIncome.ts:186-187` `(bonus + rsu + side) * 0.55` : proxy 45 % absent de
  `FISCAL_REFERENCE.md` (table d'écart mesurée ajoutée en §9 au lot 212 : **+1 931 $** sur-imposé à 40 k$ …
  **−547 $** sous-imposé à 250 k$ sur 10 000 $ — l'écart change de SIGNE, la FORME est fausse), clé de ratchet
  `(activeIncome.ts, 0.55)` FUSIONNÉE avec le taux AE 55 %, montant hors assiette de décembre et hors registres
  (`totalTaxesPaid` sous-compte). Reste : nommer la constante (clé de ratchet distincte, XS) ; passer par
  l'assiette réelle = déplace de l'argent → plan-first.
- [ ] 🟡 **`[AI-VISION-SANS-ANNULATION]`** (S, MOYEN, 🧭 UX) — `analyzePayslip`/`analyzeBankStatement` :
  `makeTimeoutSignal(undefined, 90_000)`, aucun `signal` en paramètre, pas de bouton Annuler pendant 90 s.
- [ ] 🟡 **`[AI-CONSEILS-SANS-ANNULATION]`** (XS/carte, MOYEN, 🧭 UX) — les trois cartes de conseil
  (couple, immobilier, rééquilibrage) n'ont pas d'`AbortController` (25 s sans issue).
- [ ] 🟢 **`[FMT-COMPACT-AXE-A-LA-MAIN]`** (S, FAIBLE, 🧭 membre déviant possible) — 5 axes `${(v/1000).toFixed(0)}k`
  sans `$` (`ChildPlanning.tsx:477,561`, `realestate/MultiPropertyComparison.tsx:107`,
  `projection/futureDetail/DrillDownCompte.tsx:212`, `FutureProjection.tsx:1804`), invisibles à
  `formatMonetaireSourceUnique` (motif exige `$`) ; mode discret OK (`maskedTick`). `formatCompactCAD` rend
  « 850 k$ » : re-mesurer la largeur d'axe (50 px) avant de migrer — un axe court peut être un choix.

## 🟢 Décisions Marc du 2026-09-05 — tickets nés des réponses (détail des questions : `docs/A_FAIRE_MOI.md`)

- [ ] ⏸️ **`[FUTUR-ANNOTATIONS]`** (M — réponse A12 du 2026-09-05 ; **plan P6 / question Q14 dans `docs/A_FAIRE_MOI.md`, à valider avant de coder** — lot 211, 2026-09-06 : le moteur publie `isRetired`, `pensionRRQ`, `pensionPSV` et les séries par compte, mais PAS la bascule de stratégie par mois) — annoter la courbe Futur avec les événements
  cités : âge de retraite, épuisement d'un compte, début RRQ/PSV, bascule de stratégie — **en bref**
  (marqueur + libellé court), chaque type d'annotation **désactivable en décochant** (préférence
  persistée). Réutiliser le mécanisme des pastilles d'événements existant (rang après écrêtage, cf.
  `UN-RANG-CALCULE-AVANT-L-ECRETAGE-SURVIT-A-SES-VOISINS`) — ne pas en écrire un second.
## 🧭 Vague Budget/Transactions/Investissements (Marc, 2026-08-21)

> Retours de Marc en bloc, non cadrés — chaque item à cadrer (questions groupées) avant de coder,
> par ticket ou par petit paquet cohérent.

- [ ] **`[BUDGET-CHARGES-FIXES-REFONTE]`** (L) — « Charges fixes et abonnements » ne fonctionne pas
  assez bien : Marc veut une analyse BEAUCOUP plus approfondie et une interface plus interactive
  et utile (refonte, pas un correctif ponctuel).
  🧭 **Cadrage round 1 (2026-08-27)** : Marc a coché les TROIS irritants proposés (aucun exclu) —
  détection imprécise (faux positifs/négatifs de l'heuristique + IA), manque d'analyse dans le
  temps (tendances de prix, évolution de la facture totale), interface peu interactive (liste +
  calendrier statiques). Portée confirmée large — les trois angles sont à couvrir, pas un sous-
  ensemble. **Prochaine étape avant de coder** : batch de cadrage DÉTAILLÉ (mockup/wireframe
  léger si utile) sur CHAQUE axe — ex. quels signaux concrets manquent à la détection, quelles
  vues d'analyse précises (graphique de tendance ? comparaison mois-à-mois ? projection
  d'impact ?), quelle interactivité voulue (filtrage, regroupement, drill-down). Effort L : ne
  pas coder avant d'avoir cette DoD précise.
- [ ] ⏸️ **`[ENG-GOALS-HORS-TOTALEXPENSES]`** (S — **DÉCIDÉ par Marc le 2026-09-03 : ATTENDRE l'affichage du SWR** — rien à faire tant qu'aucun lot ne branche le SWR à l'écran ; ce ticket se rouvre DANS le lot qui l'affichera · mécanisme confirmé, correctif évident = RÉGRESSION, limite épinglée par `tests/services/goalsHorsTotalExpenses.test.ts` au lot 110) — un tirage d'objectif n'entre PAS dans
  `totalExpenses` : l'argent sort de `liquid`, est publié en `withdrawalLiquid`, le patrimoine
  baisse — mais le registre de REPORTING l'ignore.
  ⚠️ **Mécanisme CONFIRMÉ** (le ticket le disait « probable ») : `addExpense: (_n) => {}` est un
  no-op DÉLIBÉRÉ dans le `goalMutator`, commenté « déjà soustrait du compte ciblé ».
  ⚠️⚠️ **LE CORRECTIF ÉVIDENT EST UNE RÉGRESSION MONEY-CRITICAL.** Rendre ce `addExpense` effectif
  paraît être « le » correctif ; il soustrairait le montant une SECONDE fois du flux réel, parce que
  `monthlyExpenses` n'est PAS un registre de reporting — il alimente directement
  `monthlyCashflow = monthlyIncome − monthlyExpenses`. Le seul correctif correct est un
  accumulateur de REPORTING **distinct** de celui qui pilote la trésorerie.
  ⚠️ **Qui LIT `totalExpenses`** (la question que le ticket posait) : un seul vrai lecteur, le calcul
  du **SWR** (taux de retrait sécuritaire) dans `monteCarlo.ts`. Et ce champ n'a **aucun consommateur
  d'interface** — vérifié par grep sur `components/`. Coût aujourd'hui : **nul à l'écran**. Le risque
  est pour DEMAIN : un lot qui brancherait le SWR publierait un taux **sous-estimé**, donc un plan
  qui a l'air plus sûr qu'il ne l'est.
- [ ] **`[INVEST-PORTFOLIO-DATA-CORRECTION]`** (S, 👤 données réelles de Marc à appliquer) —
  ⚠️ **RE-MESURÉ au Lot 0 (2026-09-24) — NE PAS appliquer tel quel.** Sa prémisse « transactions en
  CAD » est réfutée (les prix sont déjà stockés comme prix NATIFS) ; la ligne du 12 juin est le
  FRACTIONNEMENT 10:1, pas un achat (l'ajouter créerait des actifs fictifs) ; plusieurs lignes sont
  sur la mauvaise place de cotation. Remplacé par `[PTF-L1G-IMPORT-PORTEFEUILLE]` (import du relevé du
  courtier, qui fait foi). La liste des positions que ce ticket portait (composition, dates,
  quantités, prix) a été RETIRÉE le 2026-09-24 sur décision de Marc (dépôt public) ; l'historique git
  la garde, il n'a pas été réécrit. Elle se relit, au besoin, dans le relevé du courtier.
  ⚠️ Couverture : une ligne cotée hors marché (OTC) reste un gap de COUVERTURE du forfait gratuit, pas
  un bug de routage — son jumeau coté sur une bourse standard est la piste, à trancher au Lot 1.

---

## 🎯 PLAN VERS ZÉRO (analyse PM du 2026-08-19 — demande Marc : « fais tout jusqu'à ce que le backlog soit fini »)

> **Le chiffre honnête** : 230 items ouverts ≠ 230 PR. Après le ménage (vague 0, faite) et le tri
> des blocages, il reste **~46-50 PR livrables**, dont ~30 items qui resteront ouverts quoi qu'il
> arrive parce qu'ils attendent une réponse ou une action de Marc (→ `docs/A_FAIRE_MOI.md`).
>
> **Règle de groupement** : un lot = une PR = un FICHIER ou un domaine. Plusieurs PR sur le même
> fichier, ce sont des rebases et des occasions de se contredire.
>
> ⚠️ **Les cases de CE bloc sont un compteur d'avancement du PLAN, pas des tâches.** Ne PAS les
> déménager vers l'archive en les cochant (règle « item fini → archive ») : le plan perdrait sa
> raison d'être. Elles se cochent au fur et à mesure et RESTENT ici jusqu'à ce que le backlog soit
> vide, moment où le bloc entier part à l'archive.

- [ ] **Vague 1 — L'argent faux d'abord.** Un chiffre financier faux affiché avec assurance est le
  pire risque de cette app ; il passe avant l'a11y, la perf et la dette.
  **1a** ✅ `[CASH-NAN-SILENT]` **livré 2026-08-19** (source unique `services/startingCash.ts`) — c'est le point d'entrée de TOUTE la projection,
  s'il est faux tout ce qui en découle l'est aussi.
  **1b** ✅ *partiel 2026-08-19* — livrés : `[CELIAPP-DOUBLE-RECHARGE]`, `[RAMQ-ACTIF-HORS-RETRAITS]`,
  `[DOC-CELIAPP-REPORT-PERIMEE]`. RESTE dans ce lot (`[FISC-BAND-AGE-CREDITS]`,
  `[FISC-DIV-DERIVED-BASES]`, `[ENG-GK-THRESHOLD-KNIFE]`, `[ENG-TTP-UNSETTLED-PROPAGATE]`,
  `[RAMQ-ACTIF-HORS-RETRAITS]`, puis `[DOC-CELIAPP-REPORT-PERIMEE]`) — même fichier, même risque de
  re-baser des goldens : 6 PR séparées se re-baseraient l'une l'autre.
  **1c** ✅ *TERMINÉE 2026-08-19* — `[MC-BANDES-CROISEES]`, puis `[ENG-MC-CONSERVATION-BLIND]` +
  `[ENG-INV-FLUXFORM-COVERAGE]`. Les deux extensions de couverture ont trouvé un défaut chacune :
  `[ENG-FERR-NETTRANSFER-MUET]` (corrigé, 131 566 $ en DÉTERMINISTE) et `[ENG-DIVORCE-FLUX-MUET]`
  (ouvert, MC seulement, impact utilisateur nul aujourd'hui).
  **1d** ✅ *TERMINÉE 2026-08-19* — livrés : `[REVENUS-NON-VENTILES-AFFICHAGE]`,
  `[JOUR-BILAN-ROMPU-SOUS-HYPOTHEQUE]`, `[NW-PRESENT-DEUX-PERIMETRES]` (fermé SANS code : un seul
  site de recomposition, et il reçoit `netWorth` en prop), `[ENG-APRIL-REFUND-NONREG-UNPUBLISHED]`,
  `[ENG-W5-RENTAL-OFFBALANCE]`, `[ENG-W5-BUSINESS-OFFBALANCE]`. **Sorti du lot** :
  `[ENG-LIQUIDDEBT-NEVER-REPAID]` → bloqué sur un taux de découvert à SOURCER + un choix produit,
  routé vers `docs/A_FAIRE_MOI.md`.
  **1e** ✅ *TERMINÉE 2026-08-19* — `[COUPLE-CTX-FAKE-ZERO]` + `[TOOL-TAXSITUATION-FAKE-ZERO]`
  (⚠️ diagnostic groupé à moitié FAUX : le second ne publiait pas un 0, il EFFAÇAIT le conjoint —
  deux correctifs opposés), puis les cinq XS `[SILENT-STOCKFORM-PRICEHINT]`, `[SYSVIEW-DBSIZE-ZERO]`,
  `[DEAD-PARSETX-SILENT-DROP]`, `[SILENT-PWA-PROMPT]`, `[SILENT-HEALTHWEIGHTS-FIELD]`.
  **1f** Valeurs fiscales sans source NON gatées (`[RQAP-CAP-98K]`, `[W5-PROXY-NON-SOURCE]`,
  `[ESTATE-NPV-07]`, `[MIGRATE-GROSS-135]`, `[FISC-GUARD-SCOPE]` — ce dernier **en premier**,
  élargir le ratchet AVANT révèle le vrai périmètre).
- [ ] **Vague 3 — `formatCAD`** ⚠️ **AVANT la vague 4** : les deux touchent les mêmes fichiers
  (`ProjectionTooltip`, `GoalSeekerCard`…). **3a** livrer le scan-garde d'abord — il n'existe pas et
  ses offenders SONT le périmètre. **3b** corriger ce qu'il révèle, par dossier
  (`services/projection/*` en premier, 80 % du volume). Puis `[FORMATCAD-OR-ZERO]`, classe distincte.
- [ ] **Vague 4 — a11y.** **4a Étendre les outils-garde D'ABORD** (`[A11Y-CONTRAST-ANGLE-MORT-541]`,
  `[A11Y-CONTRAST-TOOL-GAP-CTA]` ; ✅ `[A11Y-PRIVACY-SCAN-GLOBAL]` livré au lot 59) — coder les fixes
  avant donnerait un périmètre DEVINÉ, pas mesuré. La garde du mode discret l'a confirmé une fois de
  plus : son ticket annonçait 38 sites, la mesure alias-aware en a trouvé d'autres et en a réfuté. **4b** mode discret formulaires · **4c** contraste · **4d** clavier /
  focus / cibles tactiles (indépendant des outils, peut partir en parallèle) ·
  **4e** ✅ `[A11Y-SUBTABS-FUTUR]` — résolu 2026-09-21, voir archive.
- [ ] **Vague 5 — IA/Anthropic** : un seul lot, une seule surface (`services/claude.ts` + `mcp/`).
- [ ] **Vague 7 — Fintable/sync** : ✅ `[FINTABLE-INVESTMENTS-MUET]` (PR #830) · ✅ `[FINTABLE-SOURCE-TAG]` (lot 130). Reste : `[FINTABLE-BACKFILL-HISTORY]` (prérequis Marc), `[DEFAULTS-DRIFT…]` fermé caduque.
- [ ] **Vague 8 — Dette technique** : **8a** god-fonctions moteur · **8b** god-files UI, UN fichier à
  la fois · **8c** primitives et tokens · **8d** casts/dépréciations/exports morts ·
  **8e** garde-fous structurels (`[STORE-RENAME-NO-GUARD]`, `[SVC-STORE-COUPLING]`,
  `[ENGINE-IMPLICIT-ORDER]` — des TESTS d'ordre, pas un refactor de l'orchestrateur) ·
  **8f** divers · **8g** dépendances · **8h** tests.
- [ ] **Vague 9 — Chat/contexte d'écran** · **Vague 10 — Gros chantiers** (en DERNIER : les plus
  risqués en régression, à faire quand le reste est stable) · **Vague 11 — `[PASSE-REEL]` restant**.

---

## Plan d'exécution (vagues — PM + analyses code/fiscal 2026-07-31)

> Synthèse des 3 analyses (PM : ordre/valeur · code-analyzer : 15 findings nouveaux ·
> financial-integrity : 8 findings nouveaux MESURÉS + requalifications). Rapports condensés en
> scratchpad de session ; détail par item dans les sections ci-dessous.
> ✅ TOUTES les questions Marc sont répondues (2026-07-31, section 🧭) — plus aucune vague gatée
> sur lui. Restent gatés sur des SOURCES EXTERNES : FISC-GIS-COUPLE-RATE (table Service Canada),
> FISC-LINE361 (Annexe B), FISC-FED-CREDITRATE-15 (source ARC primaire).

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
  décrémentés → modélisation en 3 poches nécessaire, plan-first) + ~~`[FISC-TAXDEC-INCR]`~~
  ✅ **LIVRÉ 2026-08-20, PR #676** ((a) codé, (b) déjà fait #564, (c) statu quo documenté — archivé).
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
- [ ] **V8 — Features demandées** — ✅ `[GOAL-DEADLINE-UI]` + ✅ `[PH4C-SAVINGS-NATURE]` (#569) +
  ✅ `[SUBS-TAB]` volet « ignorer » (#570), ~~volet EMPLACEMENT~~ (FERMÉ 2026-09-05 : la liste reste dans Budget). RESTENT : `[CHAT-PAGE-CONTEXT-V2]` (file explicite Marc) ·
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
- [ ] **V10 — A11y** (1-2 PR) : `[A11Y-INK500]` + `[FUT-TOUCH-TARGETS]` +
  `[A11Y-BORDER-PROMINENCE-SWEEP]`. ⚠️ `[D6-KBD]` + `[A11Y-FUTUR-MILESTONES-KEYBOARD]` archivés
  (2026-08-12, PR #598, #599).
- [ ] **V11 — Dette structurée** (fond, par lots) : ✅ `[GODFILE-APPLYDOCUMENT]` (#879) →
  ✅ `[GODFILE-MCPHTTP]` (#880) →
  `[DETTE-GODFILES]` (Budget/FutureProjection/…) + `[DETTE-UI-PRIMITIVES]` + `[CA-07]` + `[T4]`.
- [ ] **V12 — Gros chantiers (tous GO Marc 2026-07-31, plan-first chacun)** :
  `[IA-NAV-CONSOLIDATE]` (GO — préparer un GROS batch de questions de cadrage d'abord) →
  `[UI-TABS-RICH]`+`[IA-NAV-LABELS]` ; `[PH4-BUD]` refonte Budget (GO — « faut tout refaire »,
  batch de questions d'abord) ; `[CIX-*]` (critère défini : bascule couple↔solo fiable →
  CIX-B → CIX-F → CIX-A1B en priorité) ; ~~`[MCP-WHATIF-DATED-DEBT]`~~ ✅ **livré par `[DETTE-DATES]` (2026-08-19)** — le moteur honore `Debt.startDate` (phaseDette : pas de paiement ni de solde avant la date), constaté au lot 129 ;
  `[P0-IDB]` (si quota le justifie).

---

- [ ] **`[A11Y-RESERVE-CHIP-PROMINENCE]`** (XS, **REQUALIFIÉ 2026-09-02 : design, pas conformité**)
  — ⚠️ **Ses chiffres sont JUSTES, re-mesurés** (composition alpha sur `surfaceHighlight #15181E`,
  palette Tailwind par défaut) : fond `bg-amber-500/10` → **1,17**, bordure `border-amber-500/30` →
  **1,83**, texte → **8,82** (alerte) et **10,86** (réel). Le ticket annonçait ≈1,15 / ≈1,8 / ≈9–10.
  Une mesure qui CONFIRME se publie autant qu'une réfutation.
  ⚠️ **Mais sa conclusion ne suit pas.** Il veut étendre `check-contrast` pour imposer le seuil
  non-texte 3:1 (WCAG 1.4.11) à ces pastilles. Or 1.4.11 vise l'information que la COULEUR SEULE
  porte : ici l'état est écrit en toutes lettres DANS la pastille (« Réel », « Projeté »,
  « ~ prix estimé »), à 8,8 et 10,9 de contraste, et la couleur ne porte rien de plus. Le seuil ne
  s'applique pas — construire ce contrôle produirait un scanner qui crie sur du code conforme
  (`UN-SCANNER-QUI-CRIE-SUR-DU-CODE-VIVANT-APPREND-A-ETRE-IGNORE`, et
  `UNE-REGLE-GENERALE-A-UN-DOMAINE-DE-VALIDITE`).
  **Ce qui reste** : la phrase du ticket lui-même — « l'effet *saute aux yeux* est affaibli » — sur
  la seule pastille d'ALERTE. C'est un choix de DESIGN (quelle prominence pour une réserve ?), donc
  à trancher avec Marc, pas à décider seul par une règle qui ne s'applique pas.
  ⚠️ Note d'outillage, vraie et indépendante : `scripts/lib/ctaContrast.ts` ÉCARTE explicitement les
  fonds translucides (`bg-…/10`) et ne résout que les tokens de `tailwind.config.js` — les classes de
  la palette Tailwind par défaut lui sont invisibles. Réel, mais à ne PAS élargir pour ce ticket-ci :
  la composition alpha dépend du fond de l'ANCÊTRE, qu'un scan par ligne ne connaît pas
  (`LE-CONTEXTE-D-UN-DEFAUT-CSS-VIT-CHEZ-L-ANCETRE`).

- [ ] **`[PROJ-NW-FALAISE-REER]`** (M, **ÉLEVÉ** [DIAGNOSTIQUÉ 2026-08-21 — décision produit
  ✅ **DÉCISION Marc 2026-09-05 (en session)** : **(b) plancher de préservation CELI** (X mois de dépenses, X fixé par MESURE — 24 proposé). Plan-first : chiffrer X, re-base des goldens SCIEMMENT, mesurer le classement des stratégies avant/après.
  routée A_FAIRE_MOI]) — reproduit et EXPLIQUÉ : ±1 000 $ de REER d'ouverture → **−112 k$** de NW
  final (couple 72/72, 30 ans, AUTO_MARGINAL ; bifurcation au mois 143). **Mécanisme prouvé**
  (`cashflowAllocation.ts:182-236`) : `runningGross` inclut le FERR minimum forcé (∝ REER
  initial) → le remplissage « Palier 14 % » (`bracket1Top`, MUR dur) se plafonne plus bas → le
  solde du shortfall passe à la cascade standard dont le 1er bucket AUTO_MARGINAL est **CELI** →
  le CELI s'épuise des années plus tôt → une fois mort, tout sort du REER au marginal PLEIN →
  spirale composée. La politique est LOCALEMENT optimale (éviter la tranche suivante) et
  GLOBALEMENT perdante (mesuré : le run qui « préserve » son REER finit 112 k$ plus pauvre).
  **Pas un bug d'arithmétique — une politique myope + un seuil dur.** Options routées à Marc
  (A_FAIRE_MOI) : (a) lisser le mur (retrait partiel au-delà du palier), (b) plancher de
  préservation CELI (basculer sur le REER au-delà du palier quand CELI < X mois de dépenses),
  (c) statu quo documenté (la sensibilité est réelle mais le modèle l'amplifie). ⚠️ Tout
  correctif re-base des goldens et peut changer le CLASSEMENT des stratégies. ⚠️ D'ici là, toute
  mesure d'impact « NW » d'un retraité à gros REER près d'un seuil de palier est non
  représentative (la falaise domine).
- [ ] **`[FISC-REEE-GRANT-CLAWBACK]`** (S, [Probable] — V6) — à la fermeture du REEE,
  ✅ **DÉCISION Marc 2026-09-05 (en session)** : **GO pour retenter** (voir le ticket L du même ID plus haut) ; Marc ne peut pas séparer cotisations/subventions sur son REEE réel → part subvention DÉRIVÉE des règles SCEE/IQEE sur l'historique de cotisation, hypothèse écrite et affichée.
  `liquidDelta += reeeNewBalance` verse 100 % du solde aux liquidités : les subventions SCEE/IQEE
  non utilisées (jusqu'à ~10 800 $/enfant) doivent être REMBOURSÉES au gouvernement → patrimoine
  surévalué. (Découvert en re-validant FISC-REEE-AIP-MODEL — défaut plus gros que le taux.)
- [ ] **`[FISC-FED-CREDITRATE-15]`** (S vérif, 🧭 source ARC requise) — `FED_NONREFUNDABLE_RATE`
  ⚠️ Depuis le lot 210 (`[FISC-DON-FEDRATE-DUP]`), `DONATION_CREDIT_RATES.fed.first` LIT cette constante : corriger ICI corrige aussi le 1er palier du crédit pour dons (même terme statutaire, LIR 118.1(3)). Le crédit compensatoire C-4, s'il ne couvre pas les dons de la même façon, se décide à ce moment-là — pas de seconde copie à ré-introduire.
  ✅ **DÉCISION Marc 2026-09-05 (en session)** : recherche relayée : **14,5 % (2025), 14 % (2026)** + un **crédit compensatoire** 2025-2030 qui garde 15 % pour la part des crédits au-delà du 1er palier (58 523 $ en 2026) — correctif à DEUX étages ; il MANQUE la formule exacte du compensatoire (capture ARC demandée).
  15 % vs 1er palier fédéral 14 % (C-4) : seule affirmation du doc SANS source (profil
  TP1G-VIVANT-SEUL : chiffre non sourcé = suspect). Si faux : ~165 $/pers/an. Re-sourcer AVANT tout changement.
- [ ] 🟠 **`[DETTE-AUTO-BAIL-TOYOTA]`** (M, money-critical, **BLOCAGE 1 TRANCHÉ ET ÉCRIT ; reste le type/les dates, saisissables dans l'écran**) —
  le véhicule de Marc est sous **BAIL** (« Offre de Location » d'un concessionnaire), pas sous
  prêt. Contrat LU et vérifié par l'arithmétique : coût capitalisé, **versement hebdomadaire +
  taxes = total hebdomadaire au cent près**, terme en **MOIS**, taux, valeur résiduelle
  et kilométrage annuel. ⚠️ Le terme est en MOIS et non en semaines : sur la durée en semaines, le versé
  avant taxes colle à dépréciation + intérêt à **+0,4 %**, contre **+18,9 %** pour
  un terme de 60 mois — vérification arithmétique, pas une lecture d'image.
  ⚠️ **BLOCAGE 1** : ses prélèvements réels sont **hebdomadaires** (7 mesurés,
  sur plusieurs semaines), soit **+7,4 %** de plus que le contrat. Le
  document est une OFFRE — le bail signé a pu changer. **Ne pas choisir à sa place** : la mensualité du contrat
  contre celle des prélèvements réels, sur tout le terme.
  ⚠️ **BLOCAGE 2** : `KIND_AMORTISSANT['auto-lease'] = false` — le moteur REFUSE d'amortir un bail,
  **par décision écrite** (« n'amortit pas un SOLDE »). La demande de Marc (« qu'elle diminue à chaque
  virement ») est légitime mais porte sur une AUTRE grandeur : soit l'**engagement restant**
  (versements restants × montant), soit le **solde capitalisé** qui descend vers la **résiduelle**, pas
  vers zéro. Les deux donnent un patrimoine net différent.
  ⚠️ Sa saisie actuelle est fausse sur les deux chiffres (**montant et taux**, un rond qui ne figure
  nulle part au contrat) et son bilan ne porte **aucun véhicule à l'actif** — défendable pour un bail,
  mais c'est un choix à rendre délibéré.
  ⚠️ `apply_debt` (MCP) ne peut écrire **ni `kind`, ni `startDate`, ni `originalBalance`, ni
  `termEndDate`** — exactement les champs que la demande réclame. Ils existent dans Réglages → Dettes.
  ✅ **TRANCHÉ 2026-09-14** : Marc confirme que **le montant réellement prélevé est la vérité** (« j'ai des offres en
  plus ») — le contrat est bien une offre. **Total du bail recalculé sur les versements réels**
  (au-dessus du contrat), davantage s'il rachète à la résiduelle. Écrit par
  `apply_debt` (sauvegarde horodatée, réversible) : solde **d'un montant rond → leur somme** (versements
  restants), paiement **aligné sur les prélèvements réels**, taux **→ 0 %**, prêteur renseigné.
  ⚠️ **0 % est MESURÉ, pas un avis** : le solde écrit est la somme des versements restants, qui
  contiennent déjà l'intérêt ; ressaisir le taux du contrat donne une extinction plus longue et un total plus élevé que
  les valeurs réelles — **environ 15 % de versements fantômes en plus**.
  ⚠️ **Le plus gros écart n'était pas le contrat** : `minimumPayment` valait **moins d'un quart** du prélèvement réel pour une
  auto louée. Effet mesuré : patrimoine net ≈ +1,3 %, cashflow mensuel
  **≈ −35 %**.
  ⚠️ **RESTE** (hors de portée du MCP, à faire dans Réglages → Dettes) : type = **bail auto**, début
  = **date du contrat**, fin de terme = **date du contrat**. Et la **valeur résiduelle** n'existe
  dans aucun champ du modèle — un rachat de bail reste à cadrer.
  Détail et tableau du contrat dans `docs/A_FAIRE_MOI.md`. ⚠️ Dépôt PUBLIC : NIV, adresse, téléphone,
  n° de contrat et nom du vendeur délibérément NON consignés.

- [ ] 🔴 **`[FINTABLE-MONTANT-EN-DEVISE-ORIGINALE]`** (M, money-critical, **MESURÉ sur les VRAIES
  données de Marc**) — Fintable livre le montant d'une transaction dans sa **devise d'ORIGINE** tout
  en étiquetant `currency: "CAD"` (la devise du COMPTE). Le filtre de devise du mapper
  (`tx.currency.toUpperCase() !== baseCurrency` → `skippedForeignCurrency`) est donc **structurellement
  aveugle** : il lit l'étiquette, jamais la valeur, et n'a jamais pu tirer une seule fois.
  ⚠️ **MESURÉ** (voyage à l'étranger de Marc, transactions appariées une à une à son relevé de carte,
  qui fait foi en CAD) : **le total importé dépassait de loin le montant réellement facturé —
  soit près du triple, en dépenses fantômes**. les transactions en devise locale SURÉVALUÉES (ratio mesuré **3,567 à
  3,624**) et celles en USD **SOUS-évaluées** (ratio **1,417 à 1,427**) — le défaut va donc dans les DEUX
  sens, et un « ça gonfle les dépenses » serait déjà une description fausse.
  ⚠️ **Contrôle négatif dans les mêmes données** : quelques marchands locaux
  tombent au CENT près sur le relevé — cohérent avec une conversion au terminal (DCC),
  donc facturés en CAD à l'origine. Le défaut suit bien la devise d'ORIGINE, pas le pays.
  ⚠️ **Aucun correctif par le contenu du payload n'est possible** : le schéma Fintable enregistré
  (`FtRawTransaction`) ne porte ni montant facturé, ni devise d'origine, ni taux. Une heuristique sur
  la `description` (ville et pays dans le libellé) est exclue — `TEXT-HEURISTIC-OVER-USER-TEXT`, et ici elle
  piloterait un MONTANT. Le seul recoupement indépendant disponible est le **SOLDE du compte**, que
  Fintable donne bien en CAD : la somme des transactions importées ne peut pas s'écarter durablement
  du mouvement de solde. C'est la piste à cadrer.
  ⚠️ **Dette de données** : les transactions déjà importées sont fausses dans l'état de Marc. Il
  n'existe **aucun outil MCP** qui modifie ou supprime une transaction existante (`apply_bank_statement`
  ne fait qu'AJOUTER, avec dédup sur date+montant+marchand : ré-importer le bon montant créerait un
  DOUBLON, pas une correction). Le seul levier est `isDuplicate`, qui exclut une ligne de TOUS les
  calculs et se pose à la main dans l'écran Transactions. Procédure et décision dans `docs/A_FAIRE_MOI.md`.
  ✅ **Débloqué le 14/09 par `[TX-SELECTION-SANS-ACTION]`** : ce levier était INATTEIGNABLE pour cette
  classe (voir ci-dessous) ; il l'est désormais en quatre gestes.
  ✅ **Dette de DONNÉES réparée le 15/09** (feu vert de Marc) : **les lignes réimportées**
  aux montants du relevé. ⚠️ Ce n'est ni le compte ni le montant de départ, et l'écart est une MESURE, pas un
  arrondi : **4 originaux n'avaient jamais été exclus** (marchands retirés
  — tous les quatre SOUS-évalués, donc invisibles à
  qui cherchait des dépenses gonflées), et les réimporter aurait compté la dépense DEUX fois ;
  **4 billets de métro** du même jour sont des doublons d'import confirmés par Marc (« 2 vrais achetés »).
  Reste [montant retiré] suspendu à 4 clics de Marc — procédure au bas de `docs/A_FAIRE_MOI.md`.
  ⚠️ **La dette de CODE reste entière** : le mapper importe toujours le montant en devise d'origine.
  ✅ **Volet PRÉVENTION livré le 15/09 (`[FINTABLE-CHAMPS-INCONNUS]`)** — pas le correctif du
  montant, la condition pour savoir s'il est possible : `decodeTransaction` reconstruit la
  transaction CHAMP PAR CHAMP, donc **tout ce que l'API envoie hors de `FtRawTransaction` était jeté
  sans trace** — et ce contrat a été écrit d'après la DOC, jamais d'après un payload observé.
  Personne ne pouvait donc répondre à « l'API dit-elle la devise RÉELLE quelque part ? ». Le
  snapshot publie désormais `unknownTransactionKeys` (union triée, champ REQUIS) et le rapport de
  sync le DIT, en nommant les champs. 11 gardes, 3 perturbations séparées.
  ⚠️ **Prochain pas, et il dépend d'une mesure que je ne peux pas prendre** : la doc Fintable est
  inatteignable depuis le conteneur (403 au CONNECT, `EGRESS_BLOCKED` sur `fintable.io`) et les
  pages publiques de couverture montrent **PLAID** et **FINICITY** comme providers — chez Plaid une
  transaction porte `iso_currency_code`. Si un champ de ce genre arrive, le correctif devient EXACT.
  Question posée à Marc dans `docs/A_FAIRE_MOI.md` (une commande, ou la prochaine passe de sync).
  ⚠️ **Le recoupement par le SOLDE** (seule grandeur indépendante, bien donnée en CAD) reste la
  piste de secours — mais il EXIGE `[FINTABLE-BASCULE-GLOBALE-JETTE-LE-COMPTE-LENT]` d'abord : tant
  que la bascule jette les transactions de la carte, l'écart serait permanent, donc l'alarme morte.
  ✅ **Ce prérequis est livré le 2026-09-16** — ⚠️ mais il n'est EFFECTIF pour un compte qu'une fois
  ce compte connu sous son libellé (sinon il reste sur le repli global). Avant d'écrire le
  recoupement par le solde, **vérifier que le rapport de sync ne nomme plus la carte** : sinon
  l'alarme naîtrait morte pour la même raison, une marche plus bas.
- [ ] 🟡 **`[E2E-CIBLE-44-SOUS-PIXEL]`** (XS, **MESURÉ, découvert en passant sur la PR #974**) — six
  assertions E2E comparent une `boundingBox()` de Playwright à la borne WCAG **exacte** `>= 44`
  (`e2e/futureMobileProjectionScreen.spec.ts`, `e2e/futureMobileLegendDrawer.spec.ts` — recensé, pas
  cité). Or une boîte de rendu est FRACTIONNAIRE : mesuré en CI le 2026-09-16,
  **`43.99999237060547`** contre `>= 44`, soit un écart de **7,6 × 10⁻⁶ px**. Le même check était
  VERT sur le head précédent, dont l'unique écart était une ligne de `CLAUDE.md` : c'est donc une
  variance de rendu du runner, pas une régression. ⚠️ Le correctif n'est PAS de baisser l'exigence
  (44 px est une règle WCAG, et une garde qui descend sous sa règle ne garde plus rien) : c'est de
  comparer la grandeur ARRONDIE, ou d'admettre un ε explicite et commenté. ⚠️ Et il se fait sur les
  SIX sites, pas sur celui qui a rougi — les cinq autres portent le même défaut et n'ont pas encore
  eu la malchance de tomber du mauvais côté. Non corrigé dans #974 : défaut préexistant, sans rapport
  avec le lot, et le corriger aurait élargi la PR.
- [ ] 🟠 **`[FINTABLE-RAPPORT-EN-CLAIR-DANS-UN-JOURNAL-PUBLIC]`** (M, vie privée, **DÉCOUVERT au
  panel de la PR #975, préexistant — NON corrigé dans ce lot**) — `.github/workflows/fintable-sync.yml`
  fait `cat /tmp/fintable_sync_out`, donc le corps JSON complet de `/fintable-sync`
  (`{ ok: true, report }`) atterrit en clair dans les journaux GitHub Actions d'un dépôt **PUBLIC**.
  Le commentaire du workflow juste au-dessus affirme « peut contenir des COMPTEURS … mais **jamais de
  montant ni de libellé** » : **vérifié, c'est FAUX**, et ça l'était avant ce lot —
  `cashAnchorDelta` est un montant, `debtsUpdated` des noms de dettes, `comptesSansPositions[].label`
  des libellés, et 15 sites de `mapSnapshot.ts` interpolent `account.label`/`role.debtName` dans les
  avertissements ; un payload de dette rejeté pousse même `formatCAD(...)` dans `warnings`
  (`applyDocument/debt.ts:110-112` → `syncCore.ts:221`). Le commentaire est donc un **alibi** : il
  fait croire à une garantie qui n'existe pas. ⚠️ Même surface côté app : `SystemView.tsx:348` rend
  `report.warnings` **sans gate de mode discret** (classe `DECISION-PRIVACY-UNE-SEULE-SORTIE`).
  ⚠️ Ce lot-ci retient délibérément le montant du solde, mais rend la publication du LIBELLÉ de
  chaque carte **quotidienne et inconditionnelle** — il n'ouvre pas la classe, il l'alimente.
  **Deux moitiés distinctes** : (a) corriger le commentaire mensonger et décider ce que le workflow
  a le droit de `cat`er ; (b) passer `report.warnings` au mode discret dans `SystemView`.
- [ ] 🟡 **`[FINTABLE-CARTE-SOLDEE-GARDE-LA-DETTE-D-HIER]`** (S, money-critical, **MOITIÉ VISIBLE
  LIVRÉE le 2026-09-16 — reste la moitié qui CORRIGE**) ✅ Le mapper n'émet plus le payload voué au
  rejet : il s'abstient et **DIT** que la dette garde sa valeur précédente, en nommant le compte. Un
  « Payload non appliqué » cryptique sur un état parfaitement NORMAL est remplacé par une phrase
  vraie. ⏸️ **Reste le vrai correctif** : ramener la dette à zéro exige un canal que l'app n'a pas
  (`applyDebt` refuse `<= 0`) — c'est une décision produit, pas un oubli. Contexte d'origine : — une carte **remboursée à zéro** donne `owed = 0`, or `applyDebt`
  refuse tout solde `<= 0` (`mcp/ingest/applyDocument/debt.ts:50`) et **rejette le payload** : la
  dette garde donc la valeur de la veille, et le patrimoine net porte une dette déjà payée jusqu'au
  prochain solde non nul. Pas silencieux (`syncCore.ts:221` pousse un avertissement), mais faux.
  ⚠️ C'est exactement la branche que `signeSolde` étiquette `'zéro'` : si la mesure de
  `[FINTABLE-SOLDE-CARTE-SIGNE-INVERSE]` rapporte `'zéro'`, l'étape 2 doit savoir que ce chemin ne
  met déjà **rien** à jour. ⚠️ Même refus (`<= 0`) : l'app n'a **aucun canal** pour une carte en
  CRÉDIT — c'est ce qui borne à une fois (et non deux fois) le solde créditeur l'écart réparable du ticket ci-dessus.
- [ ] 🧭 **`[FINTABLE-CARTE-DETTE-AUTO]`** (M, **PLAN POSÉ ET CONFIRMÉ PAR LA MESURE du 2026-09-16
  — EN ATTENTE DU GO DE MARC**) ⚠️ Le plan ci-dessous suppose `négatif = dû` : c'est **exactement ce
  que la mesure a établi** (cf. `[FINTABLE-SOLDE-CARTE-SIGNE-INVERSE]`). Rien à recadrer. — la carte de
  crédit n'est pas une dette : c'est un **solde à DEUX SENS**. Marc, 2026-09-14 : « parfois mon crédit
  fait que j'ai de l'argent en plus et parfois de l'argent en moins », et il a choisi que le surplus
  **compte comme des liquidités** (et non une dette à 0 $, que je recommandais) — choix assumé, le plus
  exact et le plus coûteux : il fait de la carte un compte à solde SIGNÉ dont les deux moitiés vont dans
  deux registres. Plan en trois étapes dans `docs/A_FAIRE_MOI.md` : (1) MESURER le signe sans rien
  déplacer (cf. ticket ci-dessus) ; (2) `dû = max(0, −solde)` → dette, `surplus = max(0, +solde)` →
  cible de liquidités, les deux **mutuellement exclusifs** et remis à zéro ensemble à chaque bascule
  (`PARTAGER-LE-MONTANT-PAS-SES-REFLETS` : deux registres oubliés avaient coûté 75 957 $) ; (3) la
  création automatique. ⚠️ **Obstacle mesuré sur l'étape 2** : `applyCashBalance` **refuse** une cible
  de liquidités négative (`targetCad < 0` → `throw`), ce qui **rejette le payload entier** — la cible
  reste positive tant que le compte chèque domine, mais c'est une condition à écrire dans un test, pas
  une garantie. ⚠️ **Il manque encore UN chiffre** : le paiement minimum, qu'`applyDebt` exige pour
  CRÉER une dette et dont **aucun défaut n'existe dans le dépôt** (`debtAmortization` exige `> 0`) ; le
  taux est déjà tranché (celui de la carte).

- [ ] 🟡 **`[DEBT-CADENCE-FUTUR-MENSUEL]`** (XS, noté 2026-09-17) — `[DEBT-CADENCE-REELLE]` fait
  descendre la dette au JOUR du prélèvement dans le PASSÉ ; la boucle du FUTUR, elle, paie une fois
  par mois (`effectiveMinimum`). Sans conséquence sur la courbe (le futur est mensuel de bout en
  bout) et aucun dollar ne bouge — mais l'asymétrie est ÉCRITE ici plutôt que découverte plus tard.
  ⚠️ Ne PAS « corriger » sans mesurer : passer le futur au jour multiplierait par ~30 le coût de la
  boucle pour un gain d'affichage nul.

- [ ] 🔴 **`[FINTABLE-AUTORITE-PARTOUT]`** (L, money-critical, **DEMANDE MARC 2026-09-17**) —
  « je veux que toutes les valeurs soient cohérentes de partout entre elles et que ce soit la valeur
  Fintable, car la plus fiable ». Aujourd'hui QUATRE producteurs répondent à « combien valent mes
  placements ? » (mesuré : quatre valeurs différentes — Accueil, Fintable réel, Futur mois 0, hub —
  avec ≈ 11 % entre la plus haute et la plus basse), et un seul consulte Fintable (`appliquerAutoriteCourtier`, uniquement le mois 0).
  **Réponses de cadrage de Marc** : total incomplet → *« si trop gros écart, marquer qu'il y a une
  erreur d'import ; si pas trop long, dernière valeur Fintable affichée »* ; variations → *« garder
  l'historique nous »*.
  - [x] **Étape 0 — PRÉREQUIS.** ✅ Livré le 2026-09-17. Le montant NATIF (`amountNative` +
    `currency`) est désormais persisté à côté de son reflet converti, et la lecture
    (`relireSoldeCourtier`) reconvertit **au taux du jour**. Un compte écarté faute de taux à la
    synchro redevient convertible dès que le vrai taux est connu, sans attendre la synchro suivante.
    ⚠️ L'ORDRE DES BRANCHES EST LE CORRECTIF : le montant natif gagne sur un `missingRate` PERSISTÉ,
    qui décrit ce qu'on savait à la synchro et non ce qu'on sait maintenant ; le tester d'abord
    aurait rendu la reconversion inatteignable dans le cas exact qui l'a motivée. ⚠️ `estimated` est
    dérivé de `fxFaitAutorite` (source unique) et non du booléen `fxRatesEstimated` : lire le booléen
    aurait refusé les taux SAISIS À LA MAIN par Marc, c'est-à-dire le recours prévu quand la Banque
    du Canada ne répond pas. ⚠️ Deux tests de LIMITE inversés au même endroit avec leur histoire.
    Recoupe `[FX-CARTE-ECART-DIRE-LA-RESYNCHRO]`, qui devient sans objet pour le CALCUL (reste la
    phrase à l'écran).
  - [ ] **Étape 1 — source unique.** Un module qui rend la **dernière valeur Fintable connue** —
    lue dans `fintableBrokerHistory` (déjà produit, daté, par compte et par jour, 730 j de rétention,
    branché sur les DEUX chemins de synchro), **jamais l'instantané écrasé** — avec sa DATE et son
    ÉCART contre la somme des titres. ⚠️ Le producteur existe et son en-tête dit lui-même « ce lot ne
    change rien aujourd'hui » : c'est le CONSOMMATEUR qui manque, et c'est exactement la demande.
  - [ ] **Étape 2 — les deux garde-fous demandés.** (a) *« pas trop long »* → **48 h**, DÉRIVÉ : le
    cron Fintable tourne tous les jours à 10 h UTC (`.github/workflows/fintable-sync.yml`), donc
    au-delà de 48 h la synchro a échoué au moins deux fois. (b) *« trop gros écart → erreur
    d'import »* → seuil **À MESURER AVANT D'ÊTRE ÉCRIT** : une seule observation (1,4 % le
    2026-09-17) n'est pas une distribution. Le dériver de la volatilité quotidienne réelle du
    portefeuille de Marc, calculable depuis sa propre reconstruction — un seuil au jugé crierait un
    jour de marché agité, ou jamais (`UN-SEUIL-ECRIT-AVANT-SA-MESURE-EST-UN-CHIFFRE-INVENTE`).
  - [x] **Étape 3 — brancher** ✅ Livré le 2026-09-17, sur la forme CORRIGÉE (partager la DÉCISION,
    jamais la BASE). `decideRegimesRepris` extraite et partagée ; `placementsFaisantAutorite`
    l'applique à la base de l'ÉCRAN ; `jumeauxPorteursDepuisActifs` rend le refus `famille-mixte`
    atteignable des deux côtés. Branché sur `computeInvestmentsValue`/`computeGrossAssets`/
    `computePresentNetWorth` (paramètre REQUIS, 19 sites énumérés par le compilateur). La vue
    d'ensemble se recompose : valeur nette = liquidités + placements − dettes.
    ⚠️ Reste de l'ancienne rédaction, conservée parce qu'elle explique POURQUOI la forme a changé :
  - [ ] ~~**Étape 3 (rédaction d'origine)** — brancher~~ Accueil/Investissements, valeur nette, hub et MCP sur cette source
    unique. Le mois 0 du Futur y est déjà : ne pas créer une SECONDE règle à côté.
    **CONCEPTION RÉSOLUE le 2026-09-17, à implémenter telle quelle :**
    - Le point d'injection est `computeInvestmentsValue` (`services/portfolio.ts`), et c'est une
      BONNE nouvelle : `computePresentNetWorth`, `computeGrossAssets` et `buildFinancialOverview`
      l'appellent tous les trois. Les brancher déplace donc le chiffre « Investissements » ET la
      valeur nette **ensemble** — sans recréer la contradiction interne à la carte du hub qui a
      ouvert cette session.
    - **La formule est une identité, pas une nouvelle règle** : `placements_autorité =
      Σ titres + écart_appliqué`. En effet `écart = Σ(total courtier − titres)` sur les seuls
      paniers repris, donc `Σ titres + écart = titres_des_paniers_NON_repris + courtier_des_repris`.
      C'est exactement ce que le mois 0 calcule déjà.
    - ⚠️ **Prendre l'écart de `appliquerAutoriteCourtier` (`ecartTotal`), JAMAIS `reco.totalGapCad`.**
      Les deux se ressemblent et diffèrent : `appliquerAutoriteCourtier` REFUSE certains paniers
      (`famille-mixte`, `total-partiel`…). Utiliser le second donnerait deux réponses à une seule
      question — l'écran et le moteur divergeraient, ce que le commentaire de `buildSimulationParams`
      interdit en toutes lettres.
    - ⚠️ **OBSTACLE À TRANCHER AVANT DE CODER** : `appliquerAutoriteCourtier` a besoin des soldes
      PAR PANIER, produits par `derivePortfolioStartingBalances` — qui vit dans
      `services/projection/buildSimulationParams.ts`. L'importer depuis `financialSnapshot.ts`
      tirerait le constructeur de paramètres de projection dans le chemin de l'ACCUEIL, donc dans le
      bundle de boot (règle §2 du `CLAUDE.md`). Deux issues : (a) extraire
      `derivePortfolioStartingBalances` dans son propre petit module et le ré-exporter pour
      compatibilité ; (b) mesurer le coût réel avant de décider. **Ne pas trancher ça à la va-vite :
      c'est un arbitrage de frontière de bundle, pas un détail d'import.**
    - ⚠️ `holdingsCadByRegime` n'est PAS un substitut : il replie CELIAPP sur CELI et REEE sur REER,
      alors que les soldes de départ les gardent séparés — asymétrie déjà connue et routée.
    - ⚠️⚠️ **CORRECTION DE LA CONCEPTION, 2026-09-17 (après le merge de la PR #981) : la formule
      « Σ titres + écart_moteur » est SUBTILEMENT FAUSSE, et elle l'est exactement là où ce ticket
      fait mal.** `écart_moteur` est mesuré sur la base du MOTEUR (`derivePortfolioStartingBalances`,
      détention DATÉE via `holdingsAt`) ; `Σ titres` est la base de l'ACCUEIL (`computeInvestmentsValue`,
      `a.quantity` courante). Additionner l'un à l'autre n'est une identité que si les deux bases
      coïncident — la seule hypothèse que personne n'a mesurée. Dès qu'un titre a un `quantity`
      désynchronisé de la somme de ses achats, l'écart importe la divergence dans le chiffre de
      l'Accueil, en silence et sans rien de non fini.
    - ✅ **LA FORME JUSTE : partager la DÉCISION, jamais la BASE.** `appliquerAutoriteCourtier` fait
      DEUX choses qu'on confond parce qu'elles sortent de la même fonction : (1) elle DÉCIDE quels
      paniers sont repris (`regimesAppliques` / `regimesRefuses`), (2) elle CALCULE un écart sur la
      base qu'on lui a donnée. Seule la (1) doit être unique. L'Accueil doit donc faire
      `Σ titres + Σ_{régime ∈ regimesAppliques} (brokerTotalCad[régime] − holdingsCadByRegime[régime])`,
      c'est-à-dire appliquer la MÊME liste de paniers à sa PROPRE base. Un panier repris vaut alors
      exactement le total du courtier des deux côtés — donc l'écran et le moteur ne peuvent plus
      diverger sur un panier repris —, et un panier refusé garde de chaque côté la base que son écran
      affiche déjà. Variante de `AVANT-D-UNIFIER-N-COPIES-SEPARER-CE-QUI-EST-PARTAGE-DE-CE-QUI-NE-L-EST-PAS`
      (la vitesse se partage, l'ancre non).
    - ⚠️⚠️ **Et c'est ce qui CONDAMNE l'option (b) ci-dessous, par une raison plus forte que « deux
      règles » : sur la base de l'Accueil, le refus `famille-mixte` est STRUCTURELLEMENT
      INATTEIGNABLE.** `holdingsCadByRegime` dérive de `BUCKET_OF`, qui replie CELIAPP→`TOTAL_CELI`
      et REEE→`TOTAL_REER` ; les jumeaux n'existent donc jamais comme entrées séparées, et le test
      `Number(sortie['CELIAPP'] ?? 0) !== 0` est faux par construction. Ré-appliquer l'autorité sur
      cette base ferait donc APPLIQUER à l'écran un panier que le moteur REFUSE — le double comptage
      du CELIAPP (mesuré 91 500 $ pour 66 500 $ réels) réintroduit sur l'Accueil, pendant que le
      moteur, lui, refuse correctement. Une garde qui ne peut pas TIRER, au sens exact de
      `UNE-GARDE-QUI-NE-PEUT-PAS-TIRER-N-EST-PAS-UNE-PROTECTION` — à prouver par perturbation avant
      de livrer.
    - ✅ **Les DEUX obstacles bloquants sont LEVÉS** (PR #981, `b7634f46`) : (a) le bundle —
      `derivePortfolioStartingBalances` vit désormais dans `services/projection/startingBalancesFromAssets.ts`
      (dépendances légères, ré-exporté depuis `buildSimulationParams` pour compatibilité) ;
      (b) l'ordonnancement — `[FUTUR-MOIS0-CLOTURE-SANS-AGE]` est corrigé, donc la reconstruction et
      les prix courants ne diffèrent plus par une clôture périmée.
    - 📏 **LA MESURE QUI RESTE, et elle est maintenant FACILE** : le correctif du mois 0 ayant aligné
      les PRIX, tout écart résiduel entre `computeInvestmentsValue(assets, fx)` et
      `Σ derivePortfolioStartingBalances(assets, fx)` est **exactement** la divergence de QUANTITÉ
      (`a.quantity` contre la somme des achats). À mesurer sur l'état RÉEL de Marc avant de livrer —
      pas sur une fixture, qui aura toujours les deux en phase. Point de repère du 2026-09-17 :
      `get_holdings` rend des positions toutes rangées dans un SEUL panier
      — donc sur SON état le refus `famille-mixte` n'est pas atteignable non plus, et la mesure porte
      sur un seul panier.
    - ⚠️⚠️ **OBSTACLE D'ORDONNANCEMENT, trouvé le 2026-09-17 en câblant : cette étape DÉPEND de
      `[FUTUR-MOIS0-CLOTURE-SANS-AGE]`.** `appliquerAutoriteCourtier` s'applique aux soldes issus de
      la RECONSTRUCTION (derniers closes datés, sans borne d'âge), alors que l'Accueil affiche
      `computeInvestmentsValue` (prix COURANTS). Les deux bases diffèrent de **≈ 5,6 %** sur l'état
      réel. Conséquence : brancher l'Accueil sur la sortie de l'autorité ferait TOMBER son chiffre
      d'environ 5,6 % partout où Fintable ne s'applique pas — on importerait le défaut des
      clôtures périmées sur l'écran d'accueil pour régler un problème de cohérence. **Le gain de
      cohérence coûterait une régression de justesse.**
      Deux ordres possibles, à trancher : (a) corriger d'abord `[FUTUR-MOIS0-CLOTURE-SANS-AGE]` pour
      que la reconstruction et les prix courants coïncident, puis brancher — ordre PRÉFÉRÉ, une seule
      base ensuite ; (b) faire porter l'autorité sur `holdingsCadByRegime` (base prix courants), ce
      qui oblige à réimplémenter les REFUS de `appliquerAutoriteCourtier` sur cette base — donc deux
      règles pour une question, ce que le reste de ce ticket interdit.
    - 📏 **Périmètre RECENSÉ (mesuré, pas estimé)** : « partout » vaut **4 sites** —
      `services/financialSnapshot.ts` (×2 : patrimoine net et `investments`, donc Accueil + hub +
      MCP), `utils/useDerivedFinancials.ts` (écrans de l'app), `utils/healthScore.ts`.
      ⚠️ `healthScore` ne reçoit que `(assets, fxRates)`, pas l'état : le brancher élargirait sa
      signature. Comme il produit un SCORE et non un montant que Marc compare, il peut rester sur la
      somme des titres — mais il faut l'ÉCRIRE, sinon c'est une incohérence de plus, silencieuse.
  - [ ] **Étape 4 — variations** (séance, 7 j, 30 j) : elles restent calculées sur NOTRE
    reconstruction (Fintable n'a aucun historique), avec leur base NOMMÉE à l'écran — sinon deux
    chiffres voisins ne se recomposent pas et rien ne le dit.
  - ⚠️ **Contrainte de source, irréductible** : Fintable rend le TOTAL d'un compte, jamais ses
    positions. La liste des titres continuera de sommer à autre chose ; l'écart s'AFFICHE, jamais ne
    se lisse — lisser fabriquerait un portefeuille que Marc n'a pas.
  - ⚠️ **Le passé reste reconstruit** à partir des titres (aucun historique Fintable avant le
    2026-09-16) : la marche au raccord est déjà nommée par `mentionAutoriteCourtier`.
- [ ] 🟡 ~~`[HUB-REFUS-4-SANS-DIAGNOSTIC]`~~ *(entrée d'origine, conservée pour l'historique)* (XS, **DÉCOUVERT au panel du 2026-09-17**) — quand le
  refus 4 s'active, la carte du hub perd ses trois lignes de placements sans dire QUEL titre est en
  cause ni depuis quand. L'app le dit déjà (`HistoryCoverageNote` depuis `staleTailSymbols`), le hub
  non. Piste : publier le ou les symboles responsables dans `details`, le champ qui porte déjà la
  fraîcheur décomposée. Un silence actionnable vaut mieux qu'un silence mystérieux.
- [ ] 🟡 **`[HIST-CREUX-EN-MILIEU-DE-SERIE]`** (S, **DÉCOUVERT au panel du 2026-09-17**) — les graphes
  « Performance comparée » et « Évolution détaillée » peuvent afficher un CREUX à une date
  intermédiaire (trou > 7 j dans l'historique d'un titre au milieu de la série), que l'utilisateur
  lit comme une vraie baisse de marché. `omittedKeys` est désormais exposé par `usePortfolioHistory`,
  mais `HistoryCoverageNote` ne liste que les symboles en QUEUE — jamais les dates amputées en
  milieu de série. Correctif : une note jumelle qui nomme ces dates.
- [ ] 🟠 ~~`[FUTUR-MOIS0-CLOTURE-SANS-AGE]`~~ *(entrée d'origine, conservée pour son historique)* (M, money-critical, **MESURÉ le 2026-09-17**) — le
  mois 0 de la projection (`reconstructPortfolioHistory` → `deriveStartingBalancesFromHistory` →
  `liveCSVBalances`) appelle `priceAt(a, t)` **sans `maxStaleDays`**, là où `buildMarketData` passe
  **7**. C'est le seul écran du dépôt qui accepte une clôture d'un âge QUELCONQUE comme valeur du
  jour, et il ne retombe sur `currentPrice` que si le titre n'a AUCUN historique. Mesuré sur l'état
  ⚠️⚠️ **Enrichi par le panel du 2026-09-17** : le défaut n'est pas seulement le prix périmé, c'est
  que **rien ne le signale**. `priceAt` sans borne rend `histPrice !== null` même pour un close
  vieux de plusieurs années, donc cette valeur compte dans `valueWithRealPrice` et **`coverage`
  reste ≈ 1,0** — l'avertissement « partiellement estimé aux prix actuels » (affiché sous
  `coverage < 0,99`) ne tire JAMAIS. Le cas RARE (aucun historique) est couvert, le cas COURANT (flux
  de prix interrompu) est traité comme sain. Même défaut dans `reconstructPortfolioHistoryDaily`,
  qui alimente le patrimoine net du PASSÉ à l'écran.
  réel : Futur au 17/09 porte des placements **−5,6 %** sous les titres au prix live,
  au point de départ de toute la projection. ⚠️ Le correctif re-basera
  des goldens (il déplace le mois 0) : plan-first. ⚠️ Et il faut décider ce que devient un titre
  périmé SANS quote fraîche — l'omettre au mois 0 rejouerait `[HUB-TOTAL-AMPUTE]` un cran plus bas.
  ⚠️⚠️ **LE REMÈDE ÉVIDENT EST FAUX POUR LE PASSÉ PROFOND — mesuré le 2026-09-17 EN LE CÂBLANT.**
  Borner la péremption à TOUTE date ferait retomber un titre à l'historique interrompu sur son
  `currentPrice`, c'est-à-dire appliquer le prix D'AUJOURD'HUI à une date PASSÉE : la courbe du passé
  serait réécrite au prix du jour. Pour une date passée, le dernier close connu EST la meilleure
  estimation — le report indéfini y est JUSTE. Le défaut est donc plus ÉTROIT que ce ticket ne le
  disait : il porte sur le **DERNIER point** (celui qui sert de mois 0), où un close périmé est
  préféré à une cotation FRAÎCHE qui existe. C'est là, et seulement là, qu'il faut préférer
  `currentPrice` — en faisant baisser `coverage` en conséquence, pour que l'avertissement
  « partiellement estimé » puisse enfin tirer.
  ⚠️ Et deux philosophies de péremption coexistent dans le dépôt : `buildMarketData` borne à toutes
  les dates ET OMET au-delà ; la reconstruction reporte indéfiniment. Les aligner est une DÉCISION
  (`AVANT-D-UNIFIER-N-COPIES-SEPARER-CE-QUI-EST-PARTAGE-DE-CE-QUI-NE-L-EST-PAS`), pas un nettoyage.
- [ ] 🟠 **`[FX-AUTORITE-SANS-FRAICHEUR]`** (M, money-critical, **DÉCOUVERT au panel du 2026-09-17**)
  — `fxFaitAutorite(source)` ne lit QUE la provenance : ni `fxRates.lastFetched`, ni
  `fxObservationDate`. Le lot `[FX-OBSERVATION-COHORTE]` vient d'inventer la notion « trop vieux
  pour être le taux du jour » et ne l'applique qu'à la lecture ENTRANTE. Or `decisionEcritureFx`
  garantit qu'un état `'api'` persisté n'est jamais remplacé par une lecture sans autorité : si le
  réseau reste coupé des semaines, le taux d'origine garde **indéfiniment** le droit d'écrire le
  mois 0 de la projection, badge vert compris. ⚠️ **Et le seuil actuel porte DEUX questions** :
  « cette série est-elle morte ? » (10 j y répondent : VND 2 452 j, RUB/SAR 140 j) et « ce taux
  peut-il écrire le total du portefeuille ? » — à laquelle 10 j ne répondent pas, USD/CAD bougeant
  couramment de 1 à 2 % sur dix jours (soit 1 à 2 % du solde USD du courtier). Piste :
  `fxFaitAutorite` prend l'ÉTAT et non la seule `source`, avec un `AGE_MAX_POUR_AUTORITE` distinct
  et DÉRIVÉ d'une volatilité mesurée — jamais deviné. ⚠️ La limite est écrite dans
  `services/fx/observationsBdc.ts` plutôt que laissée à découvrir.
- [ ] 🟡 **`[FX-CACHE-CORROMPU-MUET]`** (XS, **DÉCOUVERT au panel du 2026-09-17**) — dans
  `services/finance.ts`, un `fx_rates_cache` corrompu lu DANS la fenêtre de 24 h tombe dans un
  `catch { }` sans trace, alors que la branche JUMELLE du même fichier (le dernier recours)
  journalise exactement la même corruption. Une corruption RÉCURRENTE de cette clé reste donc
  invisible tant que le fetch réseau réussit ensuite — c'est-à-dire le cas normal
  (`PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`). Correctif : le même `logError` qu'à la ligne jumelle.
  ⚠️ Préexistant au lot, signalé et NON corrigé : hors du périmètre demandé.
- [ ] 🟡 **`[FX-CARTE-ECART-DIRE-LA-RESYNCHRO]`** (XS, **DÉCOUVERT au panel du 2026-09-17**) — la
  conversion du solde courtier est faite **au moment de la synchro Fintable** et persistée telle
  quelle (`toPersistableBrokerBalances`). Donc un compte en devise étrangère écarté « faute de
  taux » le RESTE, avec son écart affiché, jusqu'à la prochaine synchro — même une fois les vrais
  taux obtenus. Rien à l'écran ne le dit. Correctif : une phrase dans `BrokerReconciliationCard`
  là où l'écart est affiché. Aucun changement de calcul.
- [ ] 🟡 **`[FX-PLACEHOLDER-PROPOSE-LE-REPLI]`** (XS, **DÉCOUVERT le 2026-09-17**) — le champ de
  saisie manuelle de `FxRatesCard` affiche en `placeholder` la valeur COURANTE, donc **exactement
  `1.4000` / `1.4700`** quand le taux vient du repli — c'est-à-dire précisément la situation où la
  saisie sert. Les retaper blanchirait le littéral du dépôt en taux `'manuel'`, qui a le droit
  d'écrire un total de compte (`fxFaitAutorite`). ⚠️ **Rien n'est cassé aujourd'hui** : les champs
  sont vides et `lireTauxSaisi('')` refuse, donc il faut un geste délibéré. Mais un écran qui propose
  en exemple la valeur dont il faut sortir travaille contre son propre but. Piste : ne mettre le
  `placeholder` que quand la source FAIT AUTORITÉ, sinon un exemple neutre (`ex. 1,3850`).
- [ ] 🟠 **`[FINTABLE-AUTORITE-FAMILLE-CELIAPP-REEE]`** (M, money-critical, **DÉCOUVERT au panel du
  2026-09-16, décision produit requise**) — la base de comparaison replie **CELIAPP sur CELI** et
  **REEE sur REER** (`BUCKET_OF`, « même famille fiscale », décision écrite), pendant que les soldes
  de départ les gardent SÉPARÉS. Écrire le total courtier « CELI » — comparé à CELI + CELIAPP — dans
  le seul panier `CELI` compterait le CELIAPP **deux fois** (mesuré : 91 500 $ pour 66 500 $ réels).
  ⚠️ **Le lot REFUSE d'appliquer ces paniers** tant que le jumeau porte une valeur : c'est sûr, mais
  ça prive Marc de l'autorité sur ses CELI/REER dès qu'il a un CELIAPP ou un REEE.
  🧭 **Décision Marc** : (a) mettre le jumeau à zéro en appliquant la famille — mais ça range de
  l'argent CELIAPP dans le CELI, donc ça change son **régime fiscal**, pas un arrondi ; (b) cesser de
  replier côté comparaison — mais l'écart affiché par la carte change aussi ; (c) demander un rôle
  Fintable par régime FIN (l'UI n'en offre que trois). Les deux moitiés sont liées.
- [ ] 🟡 **`[PROJ-DEUX-MOIS-ZERO]`** (S, **DÉCOUVERT au panel du 2026-09-16**) — `Retirement.tsx`
  construit un **second** `liveCSVBalances` qui ne passe PAS par l'autorité du courtier : le
  chercheur d'objectif de l'écran Retraite démarre donc d'un mois 0 différent de la courbe Futur, de
  l'écart exact. Divergence **préexistante**, ÉLARGIE par le lot d'autorité. ⚠️ Et le patrimoine net
  de l'Accueil / Investissements somme toujours les titres saisis — la demande du 30/07 reste à
  moitié livrée, ce que la note de version DIT maintenant au lieu de le laisser croire.
- [ ] 🟡 **`[GARDE-FUTURESEED-PERIMEE]`** (XS, **DÉCOUVERT au panel du 2026-09-16**) —
  `tests/services/futureSeedContinuity.test.ts` affirme « ce test exerce EXACTEMENT la fonction que
  le composant exécute désormais ». C'est devenu FAUX : le composant exécute maintenant
  `appliquerAutoriteCourtier(deriveStartingBalancesFromHistory(...), …)`. La garde anti-falaise ne
  couvre plus le point d'injection (`GARDE-AU-PRODUCTEUR-NE-PROUVE-PAS-LA-CHAINE`). Corriger la
  PHRASE ou étendre la garde — mais ne pas la laisser affirmer ce qu'elle ne fait plus.
- [ ] 🟠 **`[FX-PASSE-TAUX-PLAT]`** (M, money-critical, **DÉCOUVERT le 2026-09-16, routé sur choix
  explicite de Marc**) — `reconstructPortfolioHistory` convertit **TOUS** les points passés au taux
  d'AUJOURD'HUI (`fxToCad(a.currency, fx)`, un facteur unique), donc la courbe du passé est fausse de
  tout ce que le change a bougé — et repose en plus sur le repli en dur tant que `[FX-TAUX-JAMAIS-ARRIVES]`
  n'a pas abouti chez Marc. ⚠️ **Le champ prévu pour ça EXISTE et n'est ni écrit ni lu par personne** :
  `Asset.priceHistory[].fxRate` (grep : 0 occurrence en production) — `UN-CHAMP-TYPE-SANS-PRODUCTEUR`.
  La Banque du Canada publie ses séries DATÉES et le domaine est déjà autorisé par la CSP.
  ⚠️ Marc a choisi l'accumulation de l'historique Fintable plutôt que ce correctif-là : le reprendre
  demande son GO, pas une décision de reprise de session.
- [ ] 🟠 **`[FINTABLE-ECART-FANTOME-DEUX-DATES-DE-TAUX]`** (M, money-critical, **DÉCOUVERT au panel
  du 2026-09-16, OUVERT PAR CE LOT — mesuré, borné, non corrigé**) — le solde courtier converti est
  FIGÉ au taux de l'écriture (`toPersistableBrokerBalances`), tandis que l'autre côté de la
  réconciliation (`holdingsCadByRegime` → `assetValueCad`) est recalculé au taux COURANT à chaque
  rendu. `gapCad` compare donc deux dates de taux, et invente un écart là où il n'y en a pas.
  **MESURÉ par le panel** (un solde USD au courtier, titres strictement équivalents, écart VRAI = 0) :
  taux identique → **0,00 $** (contrôle négatif) ; 1,37 → 1,42 → **−5 %** du solde USD ; 1,37 → 1,32
  → **+5 %**. ⚠️ **Borné à la carte de réconciliation** : l'énumération complète des lecteurs de
  `fintableBrokerBalances` ne donne qu'UN consommateur de production, et ni le patrimoine net ni la
  projection ne le lisent. Pas un dollar faux au bilan — un écart inventé sur l'écran dont c'est la
  seule raison d'être, qui pousserait Marc à « corriger » des titres corrects.
  ⚠️ **Atténué dans l'immédiat** par le durcissement du même panel : un taux ESTIMÉ
  (`fxRatesEstimated`, le cas par DÉFAUT) ne convertit plus du tout, donc l'écart fantôme ne peut
  naître que sur des taux réels. Il n'est pas fermé pour autant.
  **Correctif** : persister le taux et sa date avec le solde (`rateUsed`, `rateAt`) et convertir les
  DEUX côtés au même taux — ou ne pas figer du tout (persister la devise native et convertir au
  rendu). Le second est plus juste et plus simple, mais `balanceCad` cesse alors d'être un nom
  honnête : c'est une décision de contrat, pas un correctif mécanique.
- [ ] 🟡 **`[FINTABLE-SIGNE-RECIDIVE-NON-DETECTEE]`** (S, **DÉCOUVERT au panel du 2026-09-16**) —
  `soldesDetteSignes` est calculé par le mapper et lu par PERSONNE en production : `FintableSyncReport`
  ne déclare pas ce champ, et les deux orchestrateurs construisent leur rapport champ par champ sans
  le recopier. ⚠️ Mon commentaire affirmait qu'il est « la seule trace qui permettra de re-vérifier la
  convention si Fintable change d'avis » — **faux**, corrigé dans le même lot : écrire une capacité
  inexistante dans un commentaire est le défaut que ce lot dénonce, commis dans le lot qui le corrige.
  ⚠️ L'information UTILISATEUR, elle, atteint bien l'écran (« EN TA FAVEUR », « carte soldée ») : ce
  qui manque est la détection AUTOMATIQUE d'une récidive, pas l'information de Marc.
  **Décision requise avant de câbler** : le rapport part en clair dans un journal PUBLIC. Publier des
  signes quotidiennement pour une détection sans consommateur est un coût de vie privée sans
  contrepartie — d'où le routage plutôt que le câblage.
- [ ] **`[FINTABLE-BACKFILL-HISTORY]`** (M, ⭐ demandé par Marc 2026-08-05 : « avec la version
  ✅ **DÉCISION Marc 2026-09-05 (en session)** : Marc pense que son plan offre plus de 30 jours → à MESURER chez lui (`npm run fintable:dry -- --days 365`, compte de transactions rendues, montants masqués) ; je ne peux pas appeler fintable.io d'ici (403).
  payante je devrai pouvoir importer beaucoup plus de transactions de fintable ») — ⚠️ **En l'état,
  il n'en importera AUCUNE de plus** : `deriveCutoverDate` (`services/fintable/deriveCutoverDate.ts`)
  fixe la bascule à la date de la transaction la PLUS RÉCENTE, et le mapper ne prend que ce qui est
  APRÈS (`transactionsAfter`). C'est la garde anti-doublon voulue (Marc a des milliers de transactions dont
  plus d'un an saisi à la main), mais elle interdit aussi tout RATTRAPAGE d'historique : un plan payant
  qui exposerait 12-24 mois au lieu des 30 jours mesurés le 2026-07-29 ne changerait rien.
  Fix : passe de backfill SÉPARÉE de la sync courante — fenêtre explicite (ex. « importer depuis
  telle date »), application via `applyPayloadsIsolated`, puis dédoublonnage contre l'existant avec
  `findDuplicateGroups` (`services/transactions/duplicateDetection.ts`, DÉJÀ écrit et testé) et
  revue humaine des groupes douteux avant écriture. ⚠️ Money-critical : un doublon de transaction
  fausse le budget réel ET la moyenne 12 mois. Ne JAMAIS écrire sans dédoublonnage.
  Prérequis : confirmer avec Marc la profondeur réellement offerte par son plan (mesurer, ne pas
  supposer — 90 j demandés / 30 rendus au dernier test).
- [ ] **`[ENG-REERBYUSER-RETRAIT-INERTE]`** (XS, ARBITRAGE — découvert en auditant les gardes
  per-conjoint) — le terme `withdrawal` de `stepReerByUser` est **ratio-neutre par construction** :
  retirer au prorata du solde multiplie chaque part par le même facteur, et `reconcileToPool` efface
  la trace du montant. VÉRIFIÉ à 1 $, 1 000 $, 70 000 $, 300 000 $ et 899 999 $ : répartition
  identique au **neuvième chiffre**. Seule porte de sortie : `w ≥ Σ prev` (repli sur `shares`).
  Conséquence : les EXCLUSIONS ajoutées à ce terme au fil des lots (`ferrWithdrawalMois`,
  `divorceReerWithdrawalMois`) sont **justes mais quasi sans effet** — mesuré en retirant celle de la
  FERR : **0 $ à âge égal, −141,22 $ à 15 ans d'écart, −1 641,85 $ à 27 ans** (pool 1 755 229,60 $,
  soit 0,09 %), avec **53 tests verts**.
  ⚠️ **Décision pour Marc, ne pas trancher seul** : (a) les GARDER telles quelles — elles sont
  correctes et documentent une intention, mais elles coûtent de la lecture et ont déjà fait croire
  deux fois à un enjeu qu'elles n'ont pas ; ou (b) les retirer et écrire une seule fois, dans
  `perUserBalances.ts`, que le terme est ratio-neutre. ⚠️ Ne PAS choisir (b) sans traiter le cas
  dégénéré : c'est le seul endroit où la double soustraction change quelque chose.
  Caractérisation verrouillée par `tests/services/stepReerByUserProprietes.test.ts`.
- [ ] **`[P0-IDB]`** (L, ⏳) — migrer la persistance localStorage → IndexedDB (quota ~5 Mo + parsing
  synchrone au boot). ⚠️ Migration schéma persist v7 — vigilance corruption.
- [ ] **`[ASSET-CURRENCY-BACKFILL]`** (S, attente signal) — backfill devise legacy SEULEMENT si le
  log `services/portfolio.ts:60-62` apparaît chez Marc. Ne rien coder avant.
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

- [ ] **`[A11Y-BORDER-PROMINENCE-SWEEP]`** (M, 🧭 **décision d'apparence — MESURÉ 2026-08-25**) —
  ⚠️ **Le ticket disait « S » et annonçait 28 sites. Mesuré : 255 occurrences de `border-white/10`
  dans `components/`**, dont **31 sur un `<input>`/`<select>`/`<textarea>`** (les vraies frontières
  de contrôle visées par WCAG 1.4.11) et **224 décoratives** (séparateurs, bordures de cartes — que
  1.4.11 n'exige PAS à 3:1). Seulement **2** des 31 portent un `focus:border-*`.
  **Contrastes mesurés** (blanc composé sur les fonds de la palette) :

  | Bordure | sur `dark` | sur `surface` | sur `surfaceHighlight` |
  |---|---|---|---|
  | `border-white/10` (actuel) | **1,25** | **1,29** | **1,32** |
  | `border-white/20` | 1,75 | 1,83 | 1,88 |
  | `border-white/30` | 2,58 | 2,67 | 2,70 |
  | **exigence WCAG 1.4.11** | **3,00** | **3,00** | **3,00** |

  ⚠️ **Le réflexe évident — monter l'opacité de 10 à 20 puis 30 — NE PEUT PAS marcher** : il faut
  **`white/34` minimum** (3,01 / 3,07 / 3,14), soit plus du TRIPLE de l'actuel. Un jeton opaque de la
  palette passe avec marge : `ink-500 #6a7689` → **3,86 à 4,33**.
  ⚠️ **Et le repli d'identification ne sauve rien** : un champ `bg-dark` posé sur une carte
  `bg-surface` fait **1,05** de contraste — le fond ne distingue pas le contrôle non plus, donc
  l'exemption « identifiable autrement » de 1.4.11 ne s'applique pas.
  🧭 **Pourquoi c'est ta décision** : passer 31 bordures de 10 % à 34 % (ou à un gris plein) change
  visiblement le caractère de l'app, et la frontière entre « contrôle » et « décor » demande un
  arbitrage (les 224 décoratives peuvent rester à 10 %, mais un séparateur de tableau très visible
  n'est pas le même choix esthétique qu'un champ de saisie).
  Trois options : (a) `ink-500` sur les 31 contrôles seulement ; (b) `white/34` sur les 31 ;
  (c) statu quo assumé et documenté comme écart WCAG connu.
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
- [ ] **`[DEBT-FROM-CONTRACT]`** (M, 🧭 retour Marc 2026-08-12) — « ma dette doit être exactement
  ce que j'ai — là ça me dit que j'ai la dette depuis des années mais c'est faux, je t'ai donné
  le PDF du contrat, ça devrait être automatique » : extraire du contrat la date de début, le
  principal, le taux, l'échéancier → la dette du store reflète le contrat RÉEL.
  ✅ **DIAGNOSTIQUÉ le 2026-08-13** : les trois maillons cassés sont identifiés — voir
  `[PASSE-REEL-DETTE-1/2/3]`. Ce ticket-ci reste le point d'entrée « demande de Marc » ; les
  sous-tickets sont le PLAN.
  ✅ **CADRAGE TRANCHÉ le 2026-08-21** : Marc a confirmé vouloir la courbe qui S'AMORTIT (pas le
  niveau figé) — voir `[DEBT-AMORTIZATION]` ci-dessus, qui reprend `originalBalance` et le reste
  du périmètre.
- [ ] **`[MCP-V2-OVERHAUL]`** (L, 🧭 retour Marc 2026-08-12) — « grosse MAJ du MCP : je veux que
  tout fonctionne bien et plus de fonctionnalités » : passe complète sur les tools MCP (fiabilité,
  erreurs honnêtes, couverture) + nouvelles capacités à cadrer avec Marc (écritures étendues,
  transactions, dettes-contrats, simulations). Plan-first.
- [ ] **`[AUTH-REMEMBER-DEVICE]`** (M, retour Marc 2026-08-12) — « je veux pas qu'à chaque fois
  ✅ **DÉCISION Marc 2026-09-05 (en session)** : **retirer la déconnexion auto 8 h** quand « se souvenir de cet appareil » est actif ; ré-auth exigée seulement pour les Réglages. Lire le journal `[AUTH-DRIVE-STILL-RECONNECT]` d'abord (D4 en attente : Marc n'a que son téléphone).
  je doive me reconnecter, ça me le demande trop souvent pour rien : me connecter UNE fois avec
  option de se souvenir de l'appareil… à part pour changer des paramètres » : session Drive
  persistante par appareil (option « se souvenir de cet appareil »), ré-auth exigée SEULEMENT
  pour les zones sensibles (Réglages/paramètres). ⚠️ Inverse en partie la décision
  `[AUTH-DRIVE-INACTIVITY]` (déco auto 8 h, demande Marc 2026-07-22) — nouvelle préférence
  prévaut (à confirmer : garder ou retirer la déco 8 h en plus du « se souvenir »). Cadrer
  d'abord le POURQUOI des reconnexions actuelles (instrumentation `[AUTH-DRIVE-STILL-RECONNECT]`
  déjà en place — lire le journal Diagnostics avant de coder).
- [ ] **`[TOUR-STEP-GROUPE-REPLIE]`** (S, 🧭 si Marc le veut — reste de `[TOUR-ANCHOR-INVISIBLE]`) —
  depuis que `findVisibleAnchorRect` refuse une ancre `visibility:hidden`, le tour ne pointe plus un
  bouton invisible : il retombe sur sa carte centrée. C'est HONNÊTE, mais l'étape décrit encore un
  contrôle que l'utilisateur doit ouvrir lui-même. L'option (a) du ticket d'origine — le tour force
  l'ouverture du groupe de l'étape active — la rendrait ATTEIGNABLE, au prix d'un tour qui défait un
  repli VOLONTAIRE et d'un couplage entre les étapes et l'état de la nav. Décision d'UX : à trancher.
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
  - [x] `[REFONTE-NAV-L7]` Lot 7 — **CADUQUE 2026-08-17 (décision Marc, `docs/adr/`)**.
    « Réglages retravaillés en sections » était **DÉJÀ LIVRÉ** : `components/Settings.tsx` est un
    orchestrateur léger de SIX sous-onglets (Profil · Comptes & soldes · Patrimoine · Clés API ·
    Sauvegarde · Système & diagnostics), délégués à `components/settings/sections/` — livré le
    2026-07-31 par la PR #549, donc AVANT la rédaction du plan, qui ne consacrait au Lot 7 qu'une
    ligne sans contenu. Classe `BACKLOG-STALE-TICKET`.
    → remplacé par le découpage de **Profil** (seul volet vivant, cf. `[UI-TABS-RICH]`).
- [ ] **`[PERF-BOOT]`** (M-L, différé SCIEMMENT — provider-aware) — paralléliser
  `hydrateAssets`/priceRefresh SANS dépasser CoinGecko free ~30/min (le sleep 2500 protège le
  provider le PLUS strict). Fix provider-aware planifié, pas un Promise.all aveugle. (≡ D7.)

## 🧱 Dette technique

- [ ] 🔧 **`[FUTUR-DRAWER-FOCUS-ROTATION]`** (XS, routé — pas corrigé) — **Découvert en revue
  (`silent-failure-hunter`) du lot `[FUTUR-NAV-TIROIRS]` (21/09).** Si le viewport bascule le seuil
  ~1024px (`hooks/useViewportBelowLg.ts`) PENDANT qu'un tiroir (`components/ui/Drawer.tsx`) est
  ouvert, son déclencheur d'origine (bouton de `FutureSidebar` ou boutons mobiles, selon le côté
  d'où l'on vient) est démonté avant la fermeture du tiroir. `previousFocusRef` pointe alors vers
  un nœud absent du DOM ; le garde-fou `document.body.contains(target)` évite le crash mais ne
  restaure le focus NULLE PART — il retombe sur `<body>`, sans annonce, l'utilisateur clavier doit
  retabuler depuis le haut. Edge case rare (rotation d'écran exactement au seuil, tiroir ouvert),
  jamais couvert par un test. **Correctif** : un repli explicite (ex. le `<h1>` de la page ou le
  conteneur principal) quand `document.body.contains(target)` est faux, au lieu du silence actuel.

- [ ] 🔧 **`[MCP-HTTP-ERR-MESSAGE]`** (S) — les **QUATRE** routes de
  `mcp/http/routesPlanifiees.ts` renvoient `err.message` BRUT à l'appelant authentifié
  (`handleRefresh`, `handleFintableSync`, `handleVehiculeBail` — **la même ligne au caractère
  près dans les trois**, `sendJson(res, 503, { ok: false, error: reason }, HUB_NO_STORE)` — plus
  l'équivalent tronqué de `handleHubSummary` via `errorHubSummary`). **Découverte par la revue sécurité du lot
  `[VEHICULE-BAIL]` (15/09), PR #967 — préexistant, PAS causé par ce lot.** Tracé : les erreurs nommées de la chaîne d'état
  sont des phrases françaises fixes, sans secret ; le seul détail opérationnel est une panne
  OAuth `invalid_grant` (`mcp/drive/tokenProvider.ts`) qui interpole `backend.description` — un
  chemin local en dev, ou le **NOM** d'un secret Google Secret Manager en prod, jamais sa valeur,
  et seulement APRÈS la garde d'auth. ⚠️ **Se fait sur les QUATRE handlers ENSEMBLE** (message
  générique en réponse, détail complet dans `console.error`) : durcir `/vehicule/bail` seule
  créerait l'incohérence inverse de celle qu'on corrige.

- [ ] **`[FUTUR-STACK-ZOOM-AWARE]`** (M, cosmétique — reliquat RE-CADRÉ de `[FUTUR-DAILY-STACK-X]`,
  livré #724) — séparer horizontalement deux pastilles du même mois posées à des jours différents
  n'est LÉGITIME qu'en vue zoomée, et cette information n'existe pas là où le rang est calculé.
  **MESURÉ** : la pastille fait 24 px de diamètre (rayon 12 dans `ClickableEventIcon`), 44 px de
  cible de clic ; à l'horizon PAR DÉFAUT (40 ans = 480 mois, `constants.ts`) sur un écran de
  téléphone (390 px), **un mois vaut ≈ 0,7 px** — deux événements à 15 jours d'écart sont donc à
  ≈ 0,35 px l'un de l'autre. Les séparer verticalement n'est pas un défaut à cet horizon : c'est la
  seule chose qui les rende lisibles. Le critère juste est en PIXELS (`Δx × px/mois ≥ 24`), donc il
  dépend de la fenêtre de zoom et de la largeur du conteneur — deux grandeurs absentes du calcul
  actuel, qui ne dépend que de `chartData`. Faire ce lot = déplacer la décision au rendu (fenêtre
  visible + largeur mesurée), pas changer la clé de groupement. ⚠️ Ne PAS livrer « grouper par
  abscisse arrondie » : à la vue par défaut, ça superpose les pastilles au lieu de les empiler.

- [ ] **`[T4]`** (M, par lots) — automatiser les tests manuels critiques en Playwright : 15 specs e2e
  aujourd'hui (re-compté 2026-09-04), cible 20-30. ⚠️ **PRÉMISSE MORTE (recensé 2026-09-04)** : la
  source annoncée, `docs/MANUAL_TEST_CHECKLIST.md`, a été SUPPRIMÉE par la PR #244 (réduction
  47→9 docs) et son contenu décrit une app d'avant la refonte nav (onglet « Accueil », fixtures
  Alex+Sam aux valeurs d'époque). Faire ce lot = RE-DÉRIVER la liste des parcours critiques depuis
  l'app ACTUELLE (onglets, flux réels), jamais depuis le récit mort — sinon on automatise des
  attendus périmés.

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

## Audit de santé 2026-08-19 (panel de 9 agents, demandé par Marc)

> « Gros checkup de santé : finance, code, sécu, interface. » 9 agents lancés en parallèle sur
> l'état de `main` @ 1381ef7 (pas un diff). Chaque item est **[MESURÉ]** ou **[HYPOTHÈSE]**, et a
> été **reconfronté au vrai code par Claude** avant d'atterrir ici (règle : un finding
> money-critical est une hypothèse, ≈3/8 des HIGH sont faux).
> Les findings RÉFUTÉS sont en fin de section — ne pas les re-lever.

### ✅ Fiscal — impôt jamais facturé — **SECTION VIDE, tout est livré** *(en-tête conservé pour l'historique des liens ; il annonçait « les 2 plus gros de tout l'audit » et faisait croire à deux défauts d'argent OUVERTS)*

> ⚠️ Les deux CRITIQUES ci-dessous sont **invisibles pour la garde de conservation monétaire**
> (`projection.moneyConservation.test.ts` : 20/20 VERT avec les bugs en place). Un impôt jamais
> facturé ne crée ni ne détruit d'argent côté utilisateur — il faut une assertion sur **l'ASSIETTE**,
> pas sur les soldes. Mécanismes reconfirmés ligne par ligne par Claude ; montants mesurés par
> l'agent en exécutant le moteur.

### 🔴 Moteur — invariants et registres (agent `projection-validator`, tout MESURÉ)

> ✅ **Point chaud RÉSORBÉ — les QUATRE défauts sont livrés** (vérifié le 2026-09-02 : chacun est
> `[x]` dans `docs/BACKLOG_ARCHIVE.md`). `services/projection/realEstateMonth.ts` cumulait, trouvés
> par deux agents qui ne se parlaient pas, une assiette fiscale absente (`[REER-IMMO-HORS-ASSIETTE]`),
> un registre d'affichage absent (`retraitReerMois`), le plafond RAP d'un COUPLE accordé à une
> personne seule (`[RAP-DIVORCE-DEUX-TETES]`) et un taux marginal PLAT sur un retrait à six chiffres
> (`[EMPILEMENT-REER-ACHAT-IMMO]`).
> **Ce qui reste vrai, et c'est la seule raison de garder cette note** : le module d'achat immobilier
> a été écrit sans passer la checklist « quels registres ce producteur doit-il alimenter ? ». Tout
> nouveau producteur d'argent s'y confronte AVANT d'être livré. ⚠️ Cet en-tête annonçait encore
> quatre défauts OUVERTS le 2026-09-02 — il envoyait chercher un point chaud déjà nettoyé.

- [ ] **`[COASTFIRE-CROISSANCE-FIGEE]`** (XS, FAIBLE — **portée mesurée NULLE**) — la croissance qui
  actualise la cible CoastFIRE est figée à 5 %/an, indépendante de `projection.returnRate` : deux
  utilisateurs qui projettent 4 % et 9 % obtiennent le même CoastFIRE, alors que la question n'a pas
  de sens sans le rendement. Même famille pour le revenu « barista » de 1 500 $/mois, qui ne s'indexe
  pas alors que les dépenses dont il se soustrait le sont. ⚠️ **Trancher d'ABORD si ces champs ont un
  consommateur** : `CoastFIRE` et `BaristaFIRE` sont publiés au contrat et lus par **personne**
  (mesuré, gardé). Corriger un champ que rien ne lit ne se distingue pas d'une régression — et la
  seule garde existante n'exerce que la branche post-retraite, où cette croissance n'intervient pas.

### 🔴 Valeurs fiscales sans source (viole le non-négociable `FISCAL_REFERENCE.md`)

> ⚠️ **Périmètre RÉVÉLÉ par `[FISC-GUARD-SCOPE]` (livré 2026-08-20, PR #666)** — l'élargissement du
> ratchet à 12 modules a sorti **76 littéraux / 63 clés** de l'ombre. Les quatre tickets ci-dessous
> sont désormais tous inventoriés et tracés dans `utils/fiscalConstGuardV2.ts` : aucun ne peut plus
> disparaître en silence. Trois DÉCOUVERTES s'y sont ajoutées (juste après).

- [ ] **`[ESTATE-NPV-BASE-REELLE]`** (M, **ÉLEVÉ** — découvert en revue de `[ESTATE-NPV-07]`, PR #671) —
  la VAN des rentes publiques (`services/projection/estateCalculation.ts`, bloc `rrqExpected`/`psvExpected`)
  est bâtie sur l'estimé de SAISIE (`rrqEstimateMonthly` ou le split 65/35 de `governmentPension`)
  indexé à l'inflation, **pas** sur la rente que le moteur verse réellement. Elle ignore donc
  `rrqProrata` (gains/MGA × années de résidence). **MESURÉ** sur la fixture divorce : VAN RRQ
  599 584 $ contre 470 081 $ à partir de la rente réellement versée → **+129 503 $ de VAN
  surévaluée**. Le lot `[ESTATE-NPV-07]` a plombé la vraie rente (`pensionRrqMonthlyFinal`…) mais
  **uniquement pour le facteur d'impôt**, pas pour la VAN elle-même — les deux grandeurs divergent
  donc encore. C'est aussi la cause de la discontinuité résiduelle à la frontière de retraite
  (facteur 0,9068 juste avant, 1,0000 juste après, mesuré sur un horizon qui bouge d'UN an).
  ⚠️ Toucher à la VAN re-base des goldens ET peut déplacer le classement de `compareLifeScenarios` —
  vérifier le classement à 25/28/30/33/35 ans avant/après, comme #671 l'a fait.

  ⚠️⚠️ **INSTRUIT ET CHIFFRÉ le 2026-08-29, correctif TENTÉ puis REMIS — lire avant de recommencer.**
  · **Le finding est CONFIRMÉ**, par interception des entrées réelles de `computeEstateNetWorth`
    (fixture couple 45 ans, horizon 25 ans, inflation 2 %) :

    | rente | estimé indexé (base actuelle) | réellement versée | ratio |
    |---|---|---|---|
    | RRQ | 3 609 $/mois | 2 310 $/mois | **0,640** |
    | PSV | 2 297 $/mois | 2 297 $/mois | 1,000 |
    | **total** | **5 906 $/mois** | **4 607 $/mois** | **0,780** |

    Soit **22 % de VAN surévaluée**, et c'est le **RRQ SEUL** qui diverge — le PSV colle au centime.
    C'est la signature exacte du prorata de gains/résidence, comme le ticket l'annonçait.
  · **Piège d'unité à ne pas rater** : la rente réelle est DÉJÀ en dollars nominaux de l'année
    finale ; seule la branche ESTIMÉ doit s'indexer. La ré-indexer la gonflerait de ×1,64.
  · ⚠️ **MAIS le correctif ne se limite PAS à changer la base de la VAN**, et c'est pour ça qu'il a
    été remis plutôt que livré à moitié. Changer `rrqExpected`/`psvExpected` seuls fait tomber
    **5 tests d'`[ESTATE-NPV-07]`** qui ne sont PAS des goldens : ce sont des invariants de
    CONCEPTION. `rentesValorisees` (ce que la VAN valorise) et `rentesReellesAnnuelles` (l'assiette
    imposable) sont couplées par un « complément » ajouté au contexte fiscal, dont l'unique raison
    d'être est d'assurer la CONTINUITÉ du facteur d'impôt au démarrage d'une rente. Baser la VAN sur
    le réel rend ce complément ~nul en phase de rente — ce qui est probablement plus juste — mais
    **change la sémantique du facteur**, donc les preuves du lot #671. Le vrai périmètre est le
    COUPLE (VAN, assiette), pas une base. Classe `UN-FLUX-ALIMENTE-PLUSIEURS-REGISTRES`.
  · **Ce qu'il reste à trancher** : (i) en phase de rente, le contexte fiscal devient le revenu réel
    seul — est-ce voulu ? (ii) la branche PRÉ-retraite garde forcément l'estimé indexé (aucune rente
    versée) : les deux régimes cohabitent, il faut que la frontière reste continue ; (iii) le SRG est
    inclus dans `.psv` et réellement versé — le garder dans la VAN (flux reçu) tout en le retranchant
    de l'assiette (non imposable) est défendable, mais suppose qu'il reste versé sur tout l'horizon.

- [ ] **`[ESTATE-NPV-CONTEXTE-PLURIANNUEL]`** (M, MOYEN — découvert en revue de `[ESTATE-NPV-07]`, PR #671) —
  le facteur net d'impôt de la VAN se calcule sur le revenu de retraite d'UN SEUL point (l'année
  finale) alors qu'il valorise 25 ans de rentes. #671 a retenu un contexte **structurel**
  (`incomeRetirement × 12 + accRentesYear`, hors retrait REER ponctuel) parce que c'est la seule
  variante qui ne fait pas basculer la recommandation de décaissement au gré du curseur d'horizon —
  mais l'hypothèse a un sens d'erreur ASSUMÉ : pour un retraité qui décaisse son REER/FERR chaque
  année, elle sous-estime le revenu récurrent, donc **surestime** le facteur (0,9335 au lieu de
  0,8987 mesuré sur la fixture divorce). Le correctif propre est un revenu de retraite MOYEN sur les
  années restantes. ⚠️ `estateNetWorth` est l'objectif de tri de `drawdownOptimizer.ts` et le score
  `wealth` de `strategyRanking.ts` : toute variante doit être mesurée sur le CLASSEMENT, pas seulement
  sur la valeur.
  ⚠️ **Ce ticket a gagné un COMPAGNON obligatoire le 2026-09-02** (lot 85) : la bande des rentes doit
  aussi recevoir les crédits d'âge (`[FISC-BANDES-FRERES-SANS-AGEOPTS]`), et les deux ne peuvent PAS
  se livrer séparément — câbler les crédits seuls inverse l'invariant « une pension DB pleinement
  indexée ne peut pas appauvrir » pour tout horizon ≤ ~9 ans (mesures dans l'autre ticket). Le
  contexte pluriannuel est le prérequis : c'est lui qui rend la sensibilité au revenu légitime.

- [ ] **`[ESTATE-COUPLE-DECLARANT-UNIQUE]`** (M, MOYEN — découvert en revue de `[ESTATE-NPV-07]`, PR #671) —
  `estateCalculation.ts` empile la liquidation successorale sur UNE déclaration (hypothèse du double
  décès, correcte pour la liquidation). `[ESTATE-NPV-07]` réutilise ce même revenu mono-déclarant
  pour taxer la VAN — or cette VAN représente des rentes encaissées **par deux personnes, sur deux
  déclarations, pendant 25 ans**. Le barème étant progressif, l'abattement est structurellement trop
  élevé pour un couple. Hypothèse de modèle NOUVELLE, à > 100 k$ d'impact, écrite nulle part hors du
  commentaire de code. **Correctif** : soit ventiler la VAN par conjoint avant d'appliquer le barème,
  soit documenter l'hypothèse dans `docs/PROJECTION.md` et la nommer dans l'UI.

- [ ] **`[FISC-REEE-AGE-FERMETURE]`** (XS, FAIBLE — découvert en revue de `[FISC-GUARD-SCOPE]`) —
  ✅ **DÉCISION Marc 2026-09-05 (en session)** : « 35 ans » CONFIRMÉ par recherche relayée — mais c'est **35 ans après l'OUVERTURE** (cotisations 31 ans), pas un âge de l'enfant. Reste UNE question à Marc : garder 25 ans comme hypothèse de simulation documentée (reco) ou aligner sur ouverture + 35.
  `services/projection/childrenReee.ts:401` ferme le REEE à **25 ans** alors que le régime réel
  autorise 35 ans. L'écart est un choix de simulation défendable, mais il n'est **documenté nulle
  part** : `FISCAL_REFERENCE.md` ne mentionne ni « 35 ans » ni l'âge de fermeture (vérifié — le §9
  ne couvre que le PRA, le clawback de subventions et les PAE). **Correctif** : une ligne en §9,
  ou aligner sur 35.
  ⚠️ **BLOQUÉ sur une source (2026-08-25)** → routé en `docs/A_FAIRE_MOI.md` **B8**. Le ticket
  AFFIRME « 35 ans » — mais un ticket n'est pas une source, et le proxy bloque `canada.ca`.

- [ ] **`[RQAP-PHASES-70-55]`** (M, MOYEN — sorti de `[RQAP-CAP-98K]`, décision PRODUIT) — le moteur
  applique **55 % plat** sur les 12 mois de congé parental. Le régime de BASE du RQAP verse en
  réalité **70 %** pendant la maternité/paternité et le début du parental, puis 55 % — donc le début
  du congé est SOUS-ESTIMÉ. Le corriger fidèlement demande de modéliser le nombre de semaines par
  prestation **et** le choix entre régime de base et régime particulier, que l'app ne saisit nulle
  part. ⚠️ **Ce n'est pas un correctif, c'est une feature** : il faut d'abord décider si on demande
  le régime à l'utilisateur ou si on assume le régime de base. La constante est déjà NOMMÉE
  (`RQAP_REPLACEMENT_RATE_BASE`) et la divergence documentée sur place + FISCAL_REFERENCE §2.

- [ ] **`[FISC-BANDES-FRERES-SANS-AGEOPTS]`** (S, MOYEN — revue #676 · **deux tiers livrés** :
  `latentTax` au lot 84, bande SUCCESSORALE de `estateCalculation` au lot 85, 2026-09-02) —
  ⬜ **RESTE le SEUL site `facteurNetRentes`**, et il est **BLOQUÉ, pas oublié** : à livrer dans le
  MÊME lot que `[ESTATE-NPV-CONTEXTE-PLURIANNUEL]` ci-dessus, jamais seul.
  **MESURÉ au lot 85** (fixture `buildAtRetirement`, couple 64 ans, DB 2 000 $/mois) : câbler les
  crédits d'âge sur cette bande INVERSE l'invariant vrai « une pension DB pleinement indexée ne peut
  pas appauvrir ». Écart `indexée − non indexée` du patrimoine successoral, par horizon :
  5 ans **+4 836 → −4 845 $** · 6 ans +9 324 → −2 594 · 8 ans +15 999 → −175 · 10 ans +26 284 →
  +6 398 · 25 ans +327 886 → +315 912. Le point de bascule passe de « sous 5 ans » à « ~9 ans ».
  ⚠️ **La cause n'est PAS le crédit d'âge** : décomposition par site à 5 ans, bande successorale
  seule = +4 764 $ (invariant intact), bande des rentes seule = **−4 773 $**. C'est l'artefact
  `[ESTATE-NPV-CONTEXTE-PLURIANNUEL]` (facteur d'UNE année appliqué à une VAN pluriannuelle) que
  rendre le facteur plus sensible au revenu AMPLIFIE. Livrer la moitié isolément déplacerait un
  chiffre faux au lieu de le corriger (`DES-TESTS-ROUGES-QUI-ENCODENT-UNE-CONCEPTION-NE-SE-RE-BASENT-PAS`).
  L'état actuel est BORNÉ par un test qui doit MOURIR au moment du correctif couplé
  (`tests/services/estateAgeCredits.test.ts`, cas « INVENTAIRE DE DETTE »).

- [ ] **`[ENG-RENTES-ACTIF-APRES-AGE-MAX-REPORT]`** (M, MOYEN — découvert au lot 195 en mesurant le persona « Gilles, 71 ans », MESURÉ) — **un ménage ACTIF ne touche AUCUNE rente RRQ/PSV tant que `isRetired` est faux**, quel que soit son âge : `computeRetirementIncome` n'est appelé que sous `if (isRetired)` (`services/projection.ts`, phase retraite), et `rrqStartAge`/`psvStartAge` ne sont lus que là. Or la PSV ne se reporte pas au-delà de **70 ans** ni la RRQ au-delà de **72** (`PSV_DEFERRED_START_AGE`, `RRQ_DEFERRED_START_AGE`) : un travailleur de 71-75 ans les REÇOIT obligatoirement. Mesuré sur Gilles (71 ans, `targetAge` 76, `governmentPension` 2 100 $/mois) : `IncomeRetirement` vaut **0 sur les 60 premiers mois**, premier versement au mois 60 (76 ans) — ≈ **126 k$ bruts** de rentes jamais versées ni imposées (avant impôt et récupération PSV, `[À vérifier]` en net). Population : quiconque saisit un `targetAge` > 70. ⚠️ Correctif non trivial : les rentes de la branche active doivent aussi entrer dans l'assiette de décembre (§1 actif) et dans la récupération PSV — grep les DEUX registres avant de câbler, comme pour les retraits REER actifs (`[REER-ACTIF-NON-RECONCILIE]`). Le `governmentPension` saisi est un AGRÉGAT RRQ+PSV : le découpage par âge de début est à décider (Marc). Non corrigé au lot 195 (hors périmètre, bug préexistant signalé).

- [ ] **`[PROJ-TAXPAID-SOLDE-AVRIL]`** (S, MOYEN — revue du correctif 12×, 2026-08-20) —
  `totalTaxesPaid` (`services/projection.ts`, `+= fluxImpots`) ne somme QUE les règlements d'avril,
  et l'avril actif vaut `totalAnnualTax − estimatedWithholding` — donc **négatif structurel** dès
  qu'il y a des déductions REER/CELIAPP (mesuré −126 094 $ sur un témoin sans W5) : la retenue
  salariale, incorporée au `netSalary` saisi, ne transite jamais par `fluxImpots`. Nom trompeur
  (`UN-NOM-TROMPEUR-FABRIQUE-DES-FAUX-FINDINGS`). Pas affiché à l'écran, MAIS pilote
  `strategyRanking.ts` (`lifetimeTax`), `drawdownOptimizer` et `strategySearch` — un objectif
  « impôt minimum » assis sur un solde d'avril. ⚠️ Se coordonne avec `[ENG-RANKTAX-ESTATE]`
  (LIVRÉ 2026-08-21 : l'objectif score désormais lifetimeTaxTotal — le biais des retenues reste).
  ⚠️ Relecture #681 : le biais n'est PAS constant entre stratégies sous T1213
  (optimizeSourceDeductions) — la retenue absorbe les déductions REER strategy-dépendantes,
  écart mesuré 107 530 $ entre PRIO_REER et PRIO_CELI sur le même profil. [MESURÉ]

- [ ] ⏸️ **`[W5-RENTAL-DPA-ELECTION]`** (relevé de **S à L** — la décision choisie l'exige, voir plus bas ;
  découvert en livrant `[W5-RENTAL-INTERET-DPA]`, lot 188 ; **✅ DÉCISION MARC répondue le 2026-09-14
  (en clic) : option 3, élire AVEC vente et recapture — plan-first posé dans `docs/A_FAIRE_MOI.md`,
  GO en attente**) — la DPA (déduction pour amortissement, catégorie 1,
  4 %/an dégressif, règle de demi-année) n'est PAS modélisée : `RentalProperty.ccaTaken` est une DPA
  **CUMULÉE** saisie pour la recapture à la vente — or la vente n'est pas modélisée non plus, donc le
  champ n'a aucun lecteur (`UN-CHAMP-SANS-LECTEUR-NE-SE-CORRIGE-PAS-EN-LUI-DONNANT-UNE-SAISIE`). Élire la
  DPA chaque année est un CHOIX de l'utilisateur (elle ne peut pas créer une perte de location, et elle
  est reprise à la vente) : la modéliser sans la vente surévaluerait le patrimoine, ne pas la modéliser
  le sous-évalue pour un bailleur qui l'élit. Trois issues posées à Marc : ne pas modéliser et le DIRE à
  l'écran ; élection par immeuble (case + taux) sans recapture ; élection AVEC vente/recapture.
  [MESURÉ : 0 lecteur de `ccaTaken` ; ampleur DPA ≈ 4 % × (valeur − terrain) × proxy/an, non mesurée]

- [ ] 🔴 **`[IMMO-BUT-LOCATIF-LOYER-NON-IMPOSE-ACTIF]`** (S, **ÉLEVÉ money-critical** — découvert au lot 189
  en MESURANT le jumeau ci-dessous, 2026-09-05 ; **plan P5 à valider dans `docs/A_FAIRE_MOI.md`**) — le
  loyer d'un BUT immobilier locatif (`realEstateMonth.ts` → `accRentesYear`) n'entre dans l'assiette
  du barème de décembre QUE dans la branche RETRAITÉE (`taxDecember.ts` §1, `basePensionAnnual`) ; la
  branche ACTIVE taxe `salaire + retraits REER` seulement — le loyer d'un ménage qui travaille n'est
  imposé par AUCUN barème (il n'entre que dans les bases RAMQ/FSS et la récupération PSV). Miroir
  exact de `[REER-ACTIF-NON-RECONCILIE]` (2026-08-19 : la branche retraitée avait le terme, l'active
  pas). **MESURÉ** (couple 260 k$ actif 30 ans, condo loué 350 k$ / 1 500 $ de loyer, prêt 280 k$ à
  4,5 %) en ajoutant le loyer à l'assiette active (part égale par adulte, comme la branche
  retraitée) : impôt cumulé **+63 242 $ à 10 ans, +156 559 $ à 20, +264 356 $ à 30** ; patrimoine
  final **−76 038 $ / −224 099 $ / −436 909 $** (−4,1 % à 30 ans) ; sans hypothèque
  −79 189 $ / −228 719 $ / −443 392 $. Le persona et les fixtures à `rentalIncomeMonthly` (7 fichiers
  de tests) re-baseraient. ⚠️ DOIT se livrer AVEC le jumeau ci-dessous (la déduction des intérêts) :
  l'un sans l'autre est faux dans un sens ou dans l'autre. ⚠️ L'assiette d'EMPLOI (RRQ/RQAP/AE)
  reste le salaire seul, comme pour les retraits REER. [MESURÉ]

- [ ] **`[IMMO-BUT-LOCATIF-INTERET-BRUT]`** (S, MOYEN — JUMEAU trouvé en livrant `[W5-RENTAL-INTERET-DPA]`,
  lot 188 ; ⚠️ **NE PAS livrer seul — apparié à `[IMMO-BUT-LOCATIF-LOYER-NON-IMPOSE-ACTIF]`, plan P5**.
  MESURÉ au lot 189, 2026-09-05 : la déduction SEULE (`accRentesYear += loyer − intérêt`, revenu
  gagné net) sur le couple actif ci-dessus donne impôt **inchangé** au dollar près quand le revenu
  gagné reste brut, et patrimoine **−2 820 $ / −6 836 $ / −10 076 $** à 10/20/30 ans quand il
  passe net — parce que le loyer n'est pas imposé en phase active, la déduction ne réduit AUCUN
  impôt et ne fait que retirer des droits REER : une perte sèche, le cas d'école
  `CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE`. Le code a été écrit, mesuré, puis RETIRÉ) — le loyer d'un BUT immobilier locatif (`realEstateMonth.ts`, `goal.rentalIncomeMonthly` →
  `accRentesYear`, imposé au barème en décembre) est imposé BRUT des intérêts hypothécaires, alors que
  `state.immoInterest` les calcule au même endroit et que le lot 188 vient de les déduire pour le chemin
  W5 — deux chemins, deux règles pour le même fait fiscal (T4036 ligne 8710). ⚠️ Pas au proxy ici : la
  déduction doit RÉDUIRE l'assiette `accRentesYear` (barème complet), pas un `divers` forfaitaire — et
  `accRentesYear` a d'AUTRES lecteurs (crédit de pension ? fractionnement ?) à recenser AVANT (leçon
  « un flux moteur alimente plusieurs registres »). [Dérivé, à mesurer : ≈ 12,5 k$ d'intérêts la
  1re année sur le condo 350 k$ à 4,5 % de la fixture `rrspRentalEarnedWiring`, imposés en trop au
  taux marginal du ménage]

- [ ] **`[W5-DIVIDENDE-PROXY-VS-MOTEUR]`** (S, MOYEN — découvert en livrant `[W5-PROXY-NON-SOURCE]`,
  PR #673) — `services/projection/w5Effects.ts` impose le dividende CCPC à un forfait de 36 %, alors
  que **le dépôt sait déjà le calculer exactement** : `utils/tax.ts` `calculateDividendTax` applique
  la majoration (38 % déterminé / 15 % ordinaire) et les deux crédits d'impôt pour dividende, dans
  le bon ordre vis-à-vis de l'abattement québécois. C'est le cas d'école « grep le moteur : s'il
  l'émet déjà, le CONSOMMER ». **MESURÉ** sur 30 k$ de dividende, barème 2026 : le forfait ne vaut
  que pour un dividende **ORDINAIRE à ~100 k$** de revenu (36,04 %) ; il sur-impose un dividende
  **DÉTERMINÉ** de **+7 606 $/an** à 40 k$ de revenu et **+2 969 $** à 100 k$, et sous-impose un
  actionnaire à 250 k$ de **−3 526 $/an**. ⚠️ Bloquant produit : `PrivateBusiness` ne porte pas le
  TYPE de dividende — il faut d'abord ajouter le champ (déterminé / ordinaire), donc c'est un lot
  avec une décision Marc, pas un remplacement mécanique. ⚠️ Re-baserait des goldens. [MESURÉ]

- [ ] **`[BACKUP-TEXTE-INCONNU-REFUSE]`** (S, FAIBLE) — limite ASSUMÉE de la garde de type livrée au
  lot 41 : elle refuse une chaîne sous une clé que l'app ne connaît pas encore, donc un backup
  produit par une version **plus récente** et portant un nouveau champ textuel ne se restaurerait
  pas. Accepté parce que (1) le cas suppose de restaurer un fichier plus récent que l'app qui le
  lit, (2) tout champ texte ajouté au produit entre dans `types.ts` et fait rougir le canari en CI,
  (3) l'alternative — lister les champs numériques — échoue en SILENCE sur le money-critical. À
  revoir si le cas se présente vraiment. Le raisonnement complet est dans
  `tests/components/backupSchemaTypes.test.ts`.

### 🔴 Interface — atteignabilité et clavier

- [ ] **`[A11Y-CTA-HORS-SCAN]`** (S, FAIBLE, 🧭 **décision d'APPARENCE — Marc tranche**) — angle
  mort RESTANT de `check-contrast` une fois `[A11Y-CTA-CONTRASTE-OFFENDERS]` livré. Le scan lit les
  fonds `bg-{famille}-{shade}` et `hover:bg-…` **littéraux** ; trois familles lui échappent encore,
  et deux sont MESURÉES non conformes :
  - `bg-secondary` + `text-white` → **3,67** (`components/ui/Button.tsx:18`, variante `secondary`) :
    token PLAT, hors du motif `-\d{3}` du scan. `text-dark` sur ce même fond vaudrait **5,43**.
  - `bg-amber-700` + `hover:brightness-110` → **4,28** (`components/StatementReminder.tsx:87`) : un
    FILTRE CSS échappe par construction à un scan de classes. Le repos (5,02) est conforme, le
    survol non — c'est exactement le motif corrigé dans `CeliAssetNudge` par le ticket parent.
  - fonds TRANSLUCIDES (`bg-amber-700/60` + `text-white`, `components/BackupReminder.tsx:126`) :
    exigent une composition sur le fond sous-jacent, hors périmètre déclaré de l'outil.
  Correctif proposé : passer les deux premiers à une teinte conforme PAR MESURE (jamais à l'œil),
  puis étendre le scan aux tokens plats en fond. Le troisième reste un angle mort assumé et écrit.

### 🔴 IA / Anthropic

- [ ] **`[AI-CATEGORIZE-DOUBLE-RETRY]`** (XS, FAIBLE — ⚠️ HYPOTHÈSE, découverte au lot 209, NON corrigée) — `categorizeBatch` empile SON réessai applicatif (`CATEGORIZE_MAX_ATTEMPTS = 4`, backoff 1 s → 60 s) sur celui du SDK (`maxRetries = 2`, 0,5 s → 8 s) : un chunk en 429 persistant coûte jusqu'à **4 × 3 = 12 requêtes réseau**, et le message de progression « essai 2/4 » compte les tentatives applicatives, pas les requêtes. Rien de faux à l'écran, mais deux politiques de réessai pour un même appel sont deux endroits qui divergent. À trancher : soit `maxRetries: 0` sur le client de `categorizeBatch` (sa politique est plus riche : `auth`/`fatal`/progression), soit supprimer la couche applicative au profit du SDK (`Retry-After` honoré des deux côtés). Mesure à faire AVANT : compter les requêtes réelles sur un 429 persistant (garde du lot 209 comme modèle, `fetch` simulé).

### 🔴 Sécurité / vie privée

### ✅ Échecs silencieux — **SECTION VIDE, tout est livré** *(en-tête conservé pour l'historique)*

### 🚀 Performance — mesurée par harnais, pas déduite

> Baselines mesurées le 2026-08-19 (Node 22, 2 adultes, horizon 40 ans) — à réutiliser comme point
> de comparaison : run déterministe **~133 ms** · Monte Carlo 100 itérations **~3 764 ms**
> (~27 ms/itération) · `buildMonthlyDataPoint` **126,6 µs/appel** · `structuredClone` d'un
> `ProjectionResult` complet (481 points × ~90 champs, ~2,05 Mo) **8,4 ms** · bundle de boot
> **~540,9 ko brut / ~177,3 ko gzip**. Croissance quasi-linéaire (~3,3 ms/année) — pas de blowup.

- [ ] **`[PERF-ENGINE-MC-WASTED-LOGSTRINGS]`** (M, FAIBLE) — sous Monte Carlo, `buildMonthlyDataPoint`
  retourne bien un point allégé (déjà optimisé), mais tout le travail amont qui construit
  `flowEventsLog`/`lifeEventsLog` (~40 sites) s'exécute quand même — messages **entièrement jetés** en
  MC. Mesure de contrôle importante : `Number.toLocaleString('fr-CA')` **sans options** est déjà rapide
  (0,49 µs, quasi identique à un formatter caché) → ce n'est **pas** un problème d'`Intl` non caché,
  seulement des template strings jamais lues. Gater les logs ne suffirait pas (les arguments sont
  évalués AVANT l'appel en JS) : il faudrait remonter la garde aux ~40 sites d'appel — coût
  disproportionné. [HYPOTHÈSE — gain non confirmé comme significatif ; noté pour ne pas être re-cherché]

### 🧱 Dette technique et architecture

- [ ] **`[FISC-DEC-PSV-CLAWBACK-ASSIETTE-TIMING]`** (S, ⚠️ bug préexistant potentiel, signalé sans correctif —
  découverte du lot 179, 2026-09-05) — le bloc de récupération PSV de décembre (`computeOasClawback`, « Cycle 10 »
  de `projection.ts`) lit `accRetraitsReerYear`, `accRetraitsReerYearByUser`, `capitalGainsRealizedThisYear` et
  les dividendes de l'année AVANT la cascade d'allocation, le meltdown, l'immobilier et les objectifs du même
  décembre — exactement le trou que le lot 179 vient de fermer pour le DÉPÔT fiscal, un lecteur plus haut dans
  la boucle. Un retrait REER de décembre échappe donc au revenu de récupération PSV (ligne 23400) de l'année.
  **MESURÉ, et le banc est AVEUGLE** : `scripts/inverserOrdreBoucle.py dec_psv_fin_de_mois` (déplace les DEUX
  blocs) rend **0,00 $ d'écart sur les 5 fixtures** de `scripts/mesureOrdreBoucle.ts` — parce qu'aucune n'atteint
  le seuil de récupération PSV (`OAS_CLAWBACK_THRESHOLD_2026`), pas parce que le lecteur est inerte
  (`UNE-GARDE-NE-COUVRE-QUE-CE-QUE-SA-FIXTURE-REND-NON-NUL`).
  ✅ **MESURÉ au lot 181 (2026-09-05)** sur quatre retraités à HAUT revenu (REER 2 à 2,5 M$, 25 ans, bloc PSV
  déplacé après le meltdown, moteur de `main` post-#910) : **0,00 $ sous AUTO_MARGINAL** sur les deux fixtures
  (récupération déjà saturée au plafond — un dollar de plus n'y change rien) ; sous MELTDOWN_REER : couple
  66/66 patrimoine **+180,41 $**, impôt à vie −415,58 $ ; solo 70 patrimoine **−2 919,53 $**, impôt à vie
  −918,30 $, retraits REER +836 $. Effet PETIT et de signe non évident (le retrait de décembre déplace le
  calendrier du meltdown de l'année suivante) — reclassé **XS, FAIBLE**. Correctif si GO (Q11 de
  `docs/A_FAIRE_MOI.md`) : déplacer le bloc APRÈS le meltdown avec sa garde d'ordre (`oasClawbackNextPeriod`
  n'est lu qu'en janvier : rien ne l'oblige à précéder le dépôt). Non corrigé : hors du périmètre nommé par
  la décision 15 (le dépôt fiscal). Reproduction : `scratchpad/mesurePsv181.ts` (non committé — fixtures
  décrites ci-dessus, banc `mesureOrdreBoucle.ts` aveugle par construction sur ce lecteur).
- [ ] **`[DETTE-COULEURS-ADHOC]`** (S, MOYEN) — **26 couleurs hex en dur** (`bg-[#1a1a1a]`,
  `text-[#2dd4bf]`, `bg-[#0d1118]`…) dans ~15 fichiers dont `Layout.tsx` (×3), `Investments.tsx` (×2),
  `aiChat/AiChatView.tsx` (×2), `Retirement.tsx` (×2). Ces teintes échappent à `check-contrast` ET
  aux tokens. Correctif : mapper vers `tailwind.config.js`, ou y ajouter la teinte si elle est
  volontaire. [MESURÉ]

---

## Audit complet 2026-08-12 (panel de 9 agents)

> Consolidation de 8 rapports spécialisés : dette technique, fiscal, sécurité, silence, a11y,
> perf, IA, moteur. 🔴 = fuite de données / argent / problème utilisateur réel mesurable.
> Tous les findings ont une MESURE exécutée. Chaque ticket porte un lien vers le rapport audit.
> Les 5 derniers captions du moteur détaillent CHAQUE hypothèse testée et RÉFUTÉE (ne pas
> re-lever). Aucune baseline testée n'est cassée (3833/3833 verts post-audit).

### 🔴 Moteur & fiscal — altère les calculs d'argent

> Périmètre : projection.ts + projection/* + utils/tax.ts + services/realEstate.ts
> + services/claude.ts (Vision payslip). Tous les findings sont MESURÉS sur le vrai moteur
> (tvite run, sondes adverses). Tests discriminants posés à chaque correction.

#### HIGH — Bloque la fiabilité des chiffres

#### MOYEN

- [ ] **`[FISC-RAMQ-COUPLE-CAP]`** (S) — couple ne peut jamais atteindre prime RAMQ max 766 $ (tranche
  2 bornée 9 600 $ → 744 $ max possible). **Mesuré : célibataire 766 $, couple 744 $ constant.**
  Impact −22 $/adulte/an = ~1 300 $ / 30 ans retraite. Incohérence interne doc (prime max vs tranche
  2 qui s'excluent). **Correctif** : re-sourcer Annexe K 2026 réelle (Revenu Québec / RAMQ / CFFP) et
  corriger la valeur fautive EN CODE ET EN DOC. Ne rien ajuster sans source.

#### LOW / FAIBLE

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

### ✅ Échecs silencieux — **SECTION VIDE, tout est livré** *(le HIGH `[SILENT-ACTIONPLAN-NAN]` par #608, les MED/LOW ensuite ; le titre annonçait autrefois un reliquat — voir `docs/BACKLOG_ARCHIVE.md`)*

> Pattern : traiter un champ présent-mais-non-fini comme absent, SANS log ni signal à l'utilisateur.
> Référence : `services/finance.ts` (parseRate, patron parfait), `services/marketData/*` (appliqué),
> `services/claude.ts` (safeJsonValidate loggue sys, rejets massifs tracés).

### 🔴 A11y

> Les 4 fuites de Mode Discret de l'audit sont CORRIGÉES (#608), ainsi qu'une 5e trouvée à la revue
> (axes et infobulles de graphiques, `[A11Y-PRIVACY-CHART-FORMATTER]`). Garde de non-régression :
> `tests/components/chartPrivacyScan.test.ts`.

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

> ✅ **CONFIRMÉ VIVANT le 2026-08-19** (Marc : « oui on veut extraire »). Le PM de la passe de
> ménage proposait de fermer ces trois tickets + `[DEBT-FROM-CONTRACT]` comme caducs, en citant la
> Décision 2 de `docs/adr/`. **Refusé après vérification** : cette décision interdit
> l'amortissement RÉTROACTIF et toute SAISIE demandée à Marc — lire le PDF du contrat qu'il a déjà
> fourni n'est ni l'un ni l'autre. La décision a été précisée en conséquence
> (`docs/adr/`, « PRÉCISION Marc du 2026-08-19 »). Ne pas re-fermer ces items.

✅ **`[PASSE-REEL-DETTE-1]` livré 2026-08-21, PR #687 — voir `docs/BACKLOG_ARCHIVE.md`.**

- [ ] 🟠 **`[DEBT-AMORTIZATIONYEARS-QUATRE-PRODUCTEURS-ZERO-LECTEUR]`** (QUESTION POUR MARC, sortie
  du lot 95) — `Debt.amortizationYears` est ÉCRIT par quatre producteurs (`jeuneCoupleDink`,
  `coupleDettes`, `mcp/whatIf.ts` ×2, `applyDocument`), **validé** à l'ingestion (« Amortissement
  invalide (N ans) »), exposé dans le schéma Zod du tool MCP… et **lu par personne**. `mcp/whatIf.ts`
  calcule un `termYears` et le range en croyant qu'il compte. Trois issues, et le choix n'est pas
  technique : (a) le BRANCHER — un prêt à terme fini devrait cesser d'être payé à son échéance, ce
  que `termEndDate` fait déjà autrement ; (b) le SUPPRIMER du type avec ses quatre écritures ;
  (c) le laisser et l'assumer par écrit. ⚠️ Ne rien trancher seul : (a) déplace de l'argent,
  (b) touche un type persisté. Même famille que `rsuYearsRemaining` (+23 % de patrimoine final), sauf
  qu'ici le champ n'est lu par personne — donc aucun chiffre n'est faux AUJOURD'HUI.

**Ordre imposé** : `[DEBT-MCP-PARITE]` → `[DEBT-AMORTIZATION]` → `[DEBT-MCP-ORIGINALBALANCE]`.
Les trois sont LIVRÉS (lots 91→94). Reste UNE question pour Marc :
`[DEBT-AMORTIZATIONYEARS-QUATRE-PRODUCTEURS-ZERO-LECTEUR]`.

⚠️ **`[DEBT-LEASE-VS-LOAN-COMPARATOR]` (comparateur prêt vs bail, demandé par Marc dans le même
message) N'EST PAS scopé ici** — cadrage insuffisant pour un MVP fiable : « rentable » n'a pas de
sens univoque sans trancher hypothétique-avant-signature vs rétrospectif-sur-dette-existante, ni
sans décision sur la valeur résiduelle nette de l'actif (ignorer la valeur résiduelle rendrait
« le prêt coûte plus cher » trompeur — un prêt payé laisse un bien au bilan, un bail non). Router
vers une session de cadrage dédiée (batch de questions habituel) avant d'écrire un seul test.

### ✅ `[PASSE-REEL]` — le passé affichait la PROJECTION (signalé par Marc 2026-08-13) — **SECTION VIDE, tout est livré**

> Marc : « mon passé ne semble pas correspondre à mon passé réel mais au futur qui était estimé.
> Je n'ai pas de compte CELI et pourtant mon passé me dit que j'ai de l'argent dedans. »
> Cause : `services/projection/dailyCurve.ts` — `if (!real) return { ...d }` où `d` est le point
> PROJETÉ. ⚠️ L'en-tête du MÊME fichier énonçait pourtant la règle inverse.

### 🔴 `[PASSE-REEL-JOUR]` — la courbe passée au jour (bug + demande de Marc, 2026-08-14)

- [ ] **`[PERF-BOOT-HYDRATE-CHAIN]`** (M/L) — hydratation historique/prix/profil chaînées en SÉRIE :
  chaque passe a sa PROPRE boucle pacée 2500 ms → 3 passes totales = 3×N×2500 ms pour N titres.
  Pour 20 titres : **jusqu'à ~150 s** avant dernier titre complet vs ~50 s si entrelaçé. **⚠️ NE PAS
  paralléliser naïvement** (rate-limit provider écrasé) — piste sûre = entrelacer par titre (historique
  +prix+profil consécutifs). **Correctif** : valider budget provider RÉEL avant de coder (cf. leçon
  `docs/CONVENTIONS.md` « vraie contrainte »).

### 🔴 IA / Anthropic

> Périmètre : services/claude.ts, Vision payslip, chat in-app, budget recommandations.

- [ ] **`[AI-MODELID-EPINGLER-SNAPSHOTS]`** (XS, **HUMAIN**) — ⚠️ **Moitié restante de
  `[AI-MODELID-PINNING-DRIFT]` (lot 70), non faisable par Claude.** `claude-sonnet-4-6` et
  `claude-opus-4-8` sont des ALIAS que le fournisseur peut repointer ; les remplacer par leurs
  instantanés datés supprimerait la dérive de tarif à la source. **Claude ne peut pas inventer ces
  identifiants** — un mauvais id casserait tous les appels du chat, ce qui est bien pire que la
  dérive. **Action** : relever les ids datés sur docs.claude.com, puis les substituer dans
  `services/aiChat/models.ts` et `pricing.ts` (un suffixe de date, rien d'autre) et retirer les
  entrées correspondantes de `ALIAS_A_EPINGLER` — le test refuse un inventaire périmé, il guidera.

### 🔴 Dette technique

> Périmètre : bundling, UI, sync, linting, code mort, god files.

- [ ] **`[CHART-COLOR-DUP]`** (S — unifie `[CA-07]`, dont la **règle ESLint anti-régression** est
  ⚠️ RE-MESURÉ le 2026-09-06 (lot 211) : **257 occurrences de hex dans 27 fichiers, 60 valeurs distinctes** (le ticket disait 212 dans 6+) ; 13 valeurs / 54 occurrences sont DÉJÀ des tokens de `tailwind.config.js`, 47 valeurs / 203 occurrences n'en sont pas (`#4f9d86` ×23, `#5b82bf` ×22, `#c2974f` ×19…). Aucun `constants/chartColors.ts` n'existe malgré l'archive de `[CA-07]`. Un module central qui garde les MÊMES hex est un pur réorganisation sans décision ; les MAPPER aux tokens change des couleurs (décision d'apparence, comme `[A11Y-CTA-HORS-SCAN]`) et la règle ESLint est une politique — ces deux volets se routent, le premier se livre. Taille réelle : M, pas S. Recensement : `grep -rhoE '#[0-9a-fA-F]{6}\b' components utils --include=*.tsx --include=*.ts | sort | uniq -c | sort -rn`.
  à reprendre : sans elle les hex reviennent) — Aucun module central de tokens couleurs graphiques. **212 hex
  littéraux** dans 6+ fichiers (FutureProjection, Retirement, Investments…), mêmes valeurs répétées
  (ex. `#ef4444` rouge alerte dans 6 fichiers). Un changement de teinte design system = grep-replace
  manuel 6 fichiers sans garantie exhaustivité. **Correctif** : `utils/chartColors.ts` exportant
  teintes de séries (mappées aux tokens Tailwind existants), importé par les 6 fichiers.

- [ ] **`[GODFILE-FUTUREPROJECTION]`** (L — unifie `[DETTE-GODFILE-FUTUREPROJECTION]` et la part
  `FutureProjection` de l'ex-`[DETTE-GODFILES]`) — ⚠️ **taille re-mesurée le 2026-09-07 : 2 207 lignes** (2 026 le
  2026-08-19, pas 1 820 : le fichier a GROSSI de 12 % entre deux tickets qui le décrivaient. C'est la
  démonstration que l'agrégat périmé ne servait à rien.
  ⚠️ La contrainte de séquencement avec `[A11Y-SUBTABS-FUTUR]` (deux refactors du même fichier) est
  caduque : ce dernier est résolu (2026-09-21), et autrement qu'en touchant à la structure interne
  du fichier — il reste donc entier à découper ici.
  Détail historique (mesure 1 820 l.) : `FutureProjection.tsx` **1 820 lignes**, 91 fonctions
  locales, 15 `useMemo`, 6 `useEffect`. Combine : config séries + zoom/tooltip + marqueurs événements
  + persistance localStorage. **Correctif (découpe sans changement comportement)** : (1) extraire config
  statique vers `components/future/seriesConfig.ts` ; (2) logique marqueurs vers
  `hooks/useFutureEventMarkers.ts` ; (3) persistance vers `hooks/useHiddenSeries.ts` (pattern dupliqué
  ailleurs).

- [ ] **`[GODFILE-INVESTMENTS]`** (L) — `Investments.tsx` **1 533 lignes** (mesuré 2026-09-07 ; 1 440 au ticket), 9 `useState`, 20 définitions
  locales. Combine probablement liste positions + comparaison + formulaires. Certains partiellement
  extraits (AddStockForm 475 l.). **Correctif** : identifier sous-sections quasi-autonomes (return
  imbriqués / commentaires section), extraire vers `components/investments/` style AddStockForm. Nécessite
  lecture préalable COMPLÈTE avant découpe.

- [ ] **`[GODFILE-BUDGET]`** (L) — `Budget.tsx` **1 569 lignes** (mesuré 2026-09-07 ; 1 413 au ticket), 12 `useMemo`, 46 const/fonctions locales.
  Contient sélection dates inline (violant `[UI-NO-INPUT-PRIMITIVE]`). **Correctif** : même méthode que
  FutureProjection — extraire blocs purement calculatoires (agrégats budget, vérifier non-re-dérivés
  localement vs moteur), puis sous-vues JSX. Mesurer handlers (0 `useCallback` → risque re-création).

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

- [ ] **`[Q-HOOKS-DEPS-ERROR]`** — moitié (b) de `[HOOKS-EXHAUSTIVE-DEPS-WARN]`, livré au lot 76.
  Passe-t-on `react-hooks/exhaustive-deps` de `warn` à **`error`** ? **Mesuré après le lot 76 :
  0 violation dans tout le dépôt**, donc le basculement ne coûte RIEN aujourd'hui et rendrait la
  classe impossible à réintroduire (c'est la leçon de `[ENV-NODE-NON-DECLARE]` : seul l'artefact
  EXÉCUTOIRE protège, le déclaratif n'avertit que). **Ce qu'il coûte à l'avenir** : la règle a des
  faux positifs connus, et sous `error` la sortie de secours est un commentaire de désactivation
  ligne par ligne — certains la gardent en `warn` pour ça. C'est un arbitrage de politique, donc
  ta décision, pas la mienne.

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

- [ ] **`[DEP-ESLINT10]`** (M, dev-only) — ⚠️ **SA RAISON A DISPARU (mesuré 2026-09-02, lot 79).** Il
  existait pour « 5 vulnérabilités high `brace-expansion`/`minimatch` dans la chaîne eslint, fix =
  eslint@10 (breaking) ». Mesuré : `npm audit` rend **0 vulnérabilité** après un `npm audit fix`
  **simple, sans `--force`** — `brace-expansion` est passé 5.0.7 → 5.0.9 dans la chaîne eslint
  existante, sans toucher à eslint. L'écosystème a bougé sous le ticket : le remède « breaking »
  qu'il prescrivait n'était plus nécessaire.
  **Ce qui RESTE** : migrer vers `eslint@10` peut valoir la peine pour d'autres raisons (règles,
  performances, support), mais ce n'est plus un lot de SÉCURITÉ et rien ne le rend urgent. À
  requalifier ou à fermer par Marc — il n'a plus de justification mesurable aujourd'hui.
