# REFONTE NAV — « tout tourne autour de la courbe Future »

> Demande Marc 2026-08-12 17:20 : « je veux que la partie principale de l'app soit la courbe
> future, tout doit tourner autour. enlever la partie accueil. toutes les configurations à un
> endroit, tout ce qui touche à la vie à un même endroit, tout ce qui touche aux transactions à
> un même endroit, tous les paramètres retravaillés à un même endroit. et une partie dédiée et
> plus détaillée pour un assistant, une page entière avec historique et plus d'outils. »
>
> Cadrage batch 1 RÉPONDU (2026-08-12) : bandeau KPI compact au-dessus de la courbe ·
> Retraite→Vie, Impôts→Config · Assistant maximal (toutes les options + les siennes) ·
> livraison INCRÉMENTALE (nav d'abord).
> Batch 2 sans réponse → DÉFAUTS recommandés ci-dessous, marqués ⚙️ — renversables d'un mot.

## Les 6 destinations

1. **FUTUR** (= page d'ouverture, l'Accueil disparaît)
   - La courbe domine, bandeau KPI compact au-dessus (patrimoine net actuel, variation,
     santé financière). La « Prochaine action » migre vers l'Assistant.
   - ⚙️ Les paramètres de PROJECTION (rendements, inflation, Monte Carlo, stratégies…)
     quittent leurs panneaux dispersés et vivent ICI, avec la courbe qu'ils pilotent.
2. **CONFIGURATIONS** — « ce que j'AI » (la photo d'aujourd'hui, les entrées du moteur)
   - Profil & salaires · Comptes & liquidités · Portefeuille (actions/crypto actuels) ·
     Immobilier ACTUEL · Dettes (avec `[DEBT-FROM-CONTRACT]` : la dette = le contrat PDF) ·
     Impôts (centre fiscal complet — décision Marc).
3. **VIE** — « ce que je PRÉVOIS » (les plans qui déforment la courbe)
   - Retraite (décision Marc) · Enfants · Projets immobiliers FUTURS · Voyages ·
     Événements de vie.
   - ⚙️ Split immo/invest : l'ACTUEL en Config, les PROJETS en Vie.
     **Volet immo FAIT au Lot 3** (`Tab.REAL_ESTATE_PROJECTS`) ; le volet invest reste à faire.
4. **TRANSACTIONS** — le réel au quotidien
   - Transactions · Budget · Abonnements · Imports (relevés/paies).
5. **ASSISTANT** — page entière (historique multi-conversations déjà là)
   - Outils validés par Marc : écritures complètes en langage naturel · what-if guidés ET
     plus poussés (comparaison de courbes côte à côte) · analyse ANCRÉE sur la courbe future ·
     détail/explication des calculs du moteur (« pourquoi ce chiffre ») · précision améliorée
     (l'assistant APPELLE le moteur de l'app, ne recalcule jamais à la main — règle source
     unique) · analyse de documents dans le chat (PDF contrat/relevé/paie → extraction +
     application proposée) · suivis proactifs & alertes.
   - Propositions supplémentaires (« trouve-en d'autres ») : revue mensuelle automatique
     (résumé du mois réel vs plan) · détection d'anomalies dans les transactions ·
     scénarios SAUVEGARDÉS et nommés (comparer « plan A / plan B » dans le temps) ·
     mode pédagogique (expliquer REER/CELI/FERR sur TES chiffres) · rappels fiscaux
     saisonniers (échéances ARC/RQ).
6. **RÉGLAGES** — retravaillés
   - ⚙️ Sections claires (Comptes & sync · Clés API · Données & sauvegardes · Profil &
     couple · Avancé) ; Système/Diagnostics fusionné ici ; les paramètres de PROJECTION
     partent vers Futur (cf. 1).

⚙️ Nav mobile (bas d'écran) : Futur · Transactions · Assistant · Plus (Config/Vie/Réglages).

## Lots de livraison (incrémental — décision Marc)

- **Lot 1 — LA NAV** : 6 destinations + sous-onglets = pages actuelles déplacées TELLES
  QUELLES ; l'app s'ouvre sur Futur ; Accueil retiré (tuiles → bandeau KPI / Assistant) ;
  barre mobile refaite. Critère de fini ⚙️ : RIEN de perdu (chaque écran actuel accessible),
  deep-links/`#hash` redirigés, e2e de non-perte.
- **Lot 2 — FUTUR enrichi** — scindé 2a/2b (2026-08-12) :
  - **2a (fait)** : bannière d'import gelé déplacée sur le Futur, tuile « Variation 30 j »
    (hook `useNetWorthVariation`, série de l'ex-Accueil, fenêtre fixe 30 j), équité immo
    incluse + étiquetée au patrimoine du bandeau, libellé MC au nombre réel d'itérations.
    ⚠️ Hypothèse du plan PÉRIMÉE : les paramètres de projection étaient DÉJÀ consolidés
    dans le sous-onglet « Hypothèses » du Futur (PH4-FUT) — rien à rapatrier.
  - **2b (à faire)** : sous-onglet historique (graphe d'évolution + sélecteur de fenêtre
    complet, réutilise la fonction pure du hook), déménagement de la comparaison d'actions,
    puis SUPPRESSION de `Dashboard.tsx` (fin de la carrière).
- **Lot 3 — SPLIT IMMO actuel / projets (fait, 2026-08-12)** : `Tab.REAL_ESTATE` (Config) ne
  montre plus que les biens DÉTENUS ; nouveau `Tab.REAL_ESTATE_PROJECTS` dans **Vie** (après
  Projets de vie) pour les achats FUTURS. Même tranche de store `realEstateGoals`, partition
  UI **pure** (`services/realEstatePartition.ts`) — zéro migration, zéro champ ajouté. Le corps
  de la page est extrait en `components/realestate/RealEstateWorkspace.tsx` (variante
  `'actuel' | 'projet'`), `RealEstate.tsx` devient un wrapper mince. Gate `PAGE_SETUP` dédié
  partageant la MÊME clé d'opt-out `realEstate` (une seule notion « pas concerné par
  l'immobilier »), et `SetupHub` ne liste QUE `REAL_ESTATE` pour ne pas compter deux fois le
  même prérequis. Passe de cohérence des libellés : « Dettes », « Impôts & Docs ».
  ⚠️ **Reste hors périmètre de ce lot** : le split invest actuel/projets et
  `[DEBT-FROM-CONTRACT]` (la dette = le contrat PDF) — ce dernier demeure un **ticket séparé,
  ouvert**, à planifier pour lui-même et non comme un sous-produit de la refonte nav.
- **Lot 4 — VIE harmonisée (fait, 2026-08-12)** : les **4** pages de la destination Vie
  (Retraite, Enfant, Projets de vie, Projets immo) parlent désormais d'une seule voix, SANS
  fusionner les onglets ni toucher aux fichiers de nav (`navDestinations` / `TabRouter` /
  `Layout` inchangés — la structure vient du Lot 1, ce lot ne fait que l'habiller).
  Trois règles, appliquées partout : (1) le titre de page vient de `TAB_LABELS` — un libellé en
  dur finit toujours par diverger de l'onglet qui y mène ; (2) le sous-titre dit **ce que je
  PRÉVOIS**, c'est-à-dire comment ce plan déforme la courbe Future ; (3) une affordance COMMUNE
  `components/vie/VieCurveLink.tsx` (« Voir l'effet sur ma courbe » →
  `navigateWithFocus(Tab.FUTURE)`) en tête de chaque page — source unique du libellé et du
  placement, à ne pas re-coder à la main.
  Au passage : `ChildPlanning` sans enfant retournait `null` = **page BLANCHE** → empty state
  honnête avec CTA ; `Travel` et `LifeEvents` ne se rendent QUE dans `LifeProjects`, leurs
  `PageHeader` (h1) sont rétrogradés en `<section>` + h2 (il y avait **3 h1** sur une page) ;
  `Retirement` est rangée en sous-onglets « Projection » / « Outils d'optimisation »
  (réduit `[UI-TABS-RICH]` à Profil) et son ternaire MORT `chartData.length === 0` est retiré.
  La 4e page (Lot 3) est harmonisée via la variante `'projet'` de `RealEstateWorkspace`
  UNIQUEMENT : la variante `'actuel'` est une page **Configurations** (ce que je POSSÈDE), pas
  une page Vie — elle garde son titre, son sous-titre de photo et n'a pas de lien courbe.
- **Lot 5 — TRANSACTIONS fusionnées (fait, 2026-08-12)** : budget/tx/abonnements/imports en un
  flux cohérent, **sans toucher aux fichiers de nav** (`navDestinations` / `TabRouter` /
  `Layout` inchangés, comme aux lots 3-4). Mêmes règles qu'au Lot 4, appliquées à la
  destination Transactions : (1) le titre de page vient de `TAB_LABELS` — `BudgetWorkspace`
  porte désormais le `PageHeader` (h1 « Budget »), **stable quel que soit le sous-onglet**, et
  `Transactions` prend son titre de `TAB_LABELS[Tab.TRANSACTIONS]` ; (2) **un seul h1 par
  destination** — l'ancien h1 « Pilotage Budget » de `Budget.tsx` est rétrogradé en simple
  barre de pilotage (badge excédent/déficit + vision de période + actions), il y avait 2 h1 sur
  la page ; (3) une affordance de navigation entre pairs, dans les DEUX sens :
  « Voir les transactions → » sur un poste déplié (`BudgetGroupTable`) et « Voir au budget → »
  sur la catégorie filtrée (`Transactions`), toutes deux via `navigateWithFocus` +
  `data-focus-section` (`poste:<nom>` / `category:<nom>`, patron `Settings`). `BudgetWorkspace`
  consomme aussi les sections `objectifs` / `abonnements` / `sante` pour ouvrir le bon
  sous-onglet AVANT le scroll.
  ⚠️ **Ne pas confondre avec `VieCurveLink` (Lot 4)** : ce lien-là est page-level, dans les
  actions du `PageHeader`, et dit l'**impact sur la courbe** (« Voir l'effet sur ma courbe »).
  Les liens du Lot 5 sont **contextuels** (ligne dépliée / barre de filtre) et font de la
  **navigation entre pairs** sur la même donnée — intentions différentes, formes différentes
  (suffixe « → », idiome déjà en place dans `EmptyDataPrompt` / `SyncStaleBanner`). Ne PAS
  imposer `VieCurveLink` aux pages Transactions.
  Au passage, trois corrections d'honnêteté : l'**empty state** de la liste devient UNIQUE
  (desktop + mobile) — le desktop rendait un `<table>` d'en-têtes vide — avec un CTA qui
  distingue « aucune transaction » (→ importer) de « les filtres masquent tout » (→
  réinitialiser) ; les **deux exports CSV** (tout l'historique / la vue filtrée-triée) passent
  par la source unique `utils/csvExport` (le second re-dérivait le format avec un jeu de
  colonnes divergent) ; le compte « **groupe(s) à classer** » du sous-titre n'est plus calculé
  seulement quand l'assistant est ouvert — il affichait `0` tant qu'on ne l'avait pas ouvert,
  soit un faux chiffre crédible (no-fake-data).
- **Lot 6 — ASSISTANT pleine page** : le plus gros — sous-lots PAR OUTIL (6a écritures NL,
  6b what-if comparés, 6c explication moteur, 6d analyse de docs, 6e proactif…), chaque
  sous-lot une PR.
- **Lot 7 — RÉGLAGES retravaillés**.

Chaque lot : PR + panel d'agents + merge + déploiement — Marc peut corriger le tir entre
chaque lot. Lien avec `[NAV-IA-CONSOLIDATE]` (ancien ticket 14→6 destinations) : ce plan le
REMPLACE (vision différente : plus d'Accueil, courbe au centre) — ticket à clore comme
supersedé au Lot 1.

## Ce qui ne change PAS
Le moteur de projection, le store, les invariants money-critical, la source unique
(`lastProjection.chartData`), le MCP (sa grosse MAJ = `[MCP-V2-OVERHAUL]`, chantier séparé).
