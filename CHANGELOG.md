# Changelog

Toutes les modifications notables apportées au projet sont documentées ici.

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

---

## [unreleased — sync bancaire automatique Fintable (cron quotidien) + fix courbe Futur] — 2026-07-29

### Sync bancaire (chantier Fintable)
- **`[FINTABLE-3]` Sync automatique quotidienne** : un cron serveur (Cloud Run, réveillé par GitHub Actions
  1×/jour) lit Fintable et met à jour tes transactions, tes liquidités et tes dettes — sans que tu ouvres
  l'app. Complète le chantier commencé plus tôt cette session (lecteur, mapper, détection de doublons et de
  virements internes) : c'est la première écriture NON supervisée du chantier. Le résultat de chaque passe
  (comptes vus, transactions ajoutées, virements détectés, erreurs) apparaît dans Système & diagnostics.
- Une panne réelle (jeton Fintable révoqué, Drive inaccessible) reste visible ; un simple conflit avec une
  écriture depuis l'app (les deux ont poussé au même instant) est réessayé automatiquement, sans alerte.

### Projection Futur
- **Le segment PASSÉ du graphe Futur reste exact même quand le futur affiché est figé** : si tu ajoutes une
  dette ou une transaction pendant que ta projection future est « en pause » (badge « Pas à jour »), la
  partie passée du graphe (ta valeur nette réelle) se met maintenant à jour immédiatement — avant, elle
  pouvait rester bloquée sur l'ancien montant de dette jusqu'à ce que tu relances le calcul.

### Interne
- `mcp/runFintableSync.ts` (orchestrateur, patron `runPriceRefresh`) + `POST /fintable-sync` dans `mcp/
  http.ts` (secret dédié `FINANCEAI_FINTABLE_SYNC_SECRET`) + `.github/workflows/fintable-sync.yml`. Date de
  bascule anti-doublon DÉRIVÉE à chaque passe (`deriveCutoverDate`), jamais figée. `AppState.
  fintableSyncReport` (additif, zéro migration). `services/fintable/rolesConfig.ts` consolidé (CLI + serveur).
- `FutureProjection.tsx` : `currentDebtNonImmo` route désormais par `liveResults` (jamais le blob figé de
  PROJECTION-PERSIST). Test discriminant prouvé par `git stash` (échoue sur l'ancien code).

---

## [unreleased — MCP : budget et objectifs « juste en le demandant »] — 2026-07-29

### Assistant / MCP
- **Nouveau tool `set_budget_item`** : « mets mon budget épicerie à 600 $ » — ajoute ou met à jour un poste
  de budget par nom (casse/accents ignorés, jamais de doublon), mise à jour PARTIELLE (seuls les champs
  fournis changent). Éditer la cible fige le poste en cible MANUELLE (la moyenne auto-calculée ne
  l'écrasera plus). Confirmation avant chaque écriture (aperçu avant→après) + sauvegarde horodatée.
- **Nouveau tool `upsert_savings_goal`** : « crée un objectif Voyage Japon de 8 000 $ » — ajoute ou met à
  jour un objectif d'épargne par nom (cible, accumulé, échéance, icône). Même confirmation à 2 temps.

- **Nouveau tool `delete_item`** : « j'ai tout vendu mes VFV.TO » / « supprime ma dette soldée » /
  « retire l'objectif X » — supprime un actif, une dette ou un objectif, avec correspondance EXACTE
  (jamais d'à-peu-près sur une suppression), aperçu des effets (courbe, patrimoine, décaissement) et
  confirmation stricte avant d'agir. Sauvegarde horodatée avant chaque suppression (annulable).

### Interne
- `[MCP-DIRECT-EDIT]` Lots 2-3 : kinds `budget_item` + `savings_goal` dans `applyDocument` (upsert par nom
  normalisé, bornes D9, gardes non-fini), specs/tools scindés, parité app↔MCP (WRITE_SPECS).
- `[MCP-DIRECT-EDIT]` Lots 4-5 : kind `delete_item` + ADR « Suppressions via MCP/IA » (docs/decisions.md —
  vente totale = suppression, quantity:0 réfuté preuve holdingsAt ; transactions différées). MCP v0.10.0.
  ⚠️ Actif sur claude.ai après redéploiement Cloud Run.
- `[HIST-INFLIGHT-DEDUP]` withCache déduplique les requêtes en vol ; `[HIST-SESSION-HYDRATE]` un actif
  ajouté en session obtient sa courbe sans reload ; `[HIST-PREVIEW-PROXY]` proxy Yahoo en vite preview.

---

## [unreleased — MCP : changer tes liquidités juste en le demandant] — 2026-07-28

### Assistant / MCP
- **Nouveau tool d'écriture `set_cash`** : demande à Claude « mets mes liquidités à 50 000 $ » et il ajuste ton
  solde de cash à la cible. Le cash étant calculé depuis tes transactions + soldes de départ, l'ajustement passe
  par le compte « LIQUIDITE » des soldes de départ (visible dans Réglages → Comptes) — tes transactions ne sont
  jamais écrasées, et c'est réversible. Idempotent (redemander la même cible ne change rien).
- **Confirmation à 2 temps** (demande Marc) : sur claude.ai, le 1er appel renvoie un APERÇU (solde avant → après)
  sans rien écrire ; Claude te le montre et n'applique qu'après ton accord (2ᵉ appel `confirm:true`). Dans l'app,
  le modal de confirmation existant fait foi. Une sauvegarde horodatée est créée avant chaque écriture.

### Interne
- `set_cash` = 1ᵉʳ lot de `[MCP-DIRECT-EDIT]` : nouveau `kind: 'cash_balance'` dans `applyDocument` (delta sur
  `initialBalances.LIQUIDITE` via la source unique `computeStartingCash`, jamais d'écrasement de la map), garde
  de confirmation `RunApplyOptions` dans `runApply` (dry-run + `confirm`), spec/tool scindés (parité app↔MCP).
  ⚠️ Actif sur claude.ai seulement après redéploiement Cloud Run (révision séparée de Vercel).

---

## [unreleased — Futur : beaucoup plus d'icônes sur le graphe] — 2026-07-24

### Onglet Futur
- **Le graphe affiche maintenant des icônes pour tous tes jalons** : 🏛️ début RRQ / PSV, 📤 1er retrait REER / CELI,
  💸 règlements d'impôt, 🏠 début revenu locatif — en plus de la retraite 📍 et du FIRE 🔥. Avant, il n'y avait
  quasiment aucune icône (validé : ~29 pastilles sur un plan retraité, contre 0-2 auparavant).
- Les événements de flux du moteur (renouvellements d'hypothèque, retraits par palier, RAMQ…) étaient **filtrés à
  tort** et n'apparaissaient jamais — ils s'affichent désormais. Toutes les pastilles se posent sur la courbe (avant,
  les flux étaient placés tout en bas, quasi invisibles).

### Interne
- Nouveau module pur `services/projection/milestoneIcons.ts` (`deriveMilestoneIcons`) — jalons dérivés des champs
  `chartData` (présentation, zéro recalcul $). Test e2e Playwright réel (`e2e/futureIcons.spec.ts`) prouvant le rendu
  des icônes (Recharts a besoin d'un vrai viewport). RRQ/PSV migrés de lignes verticales vers icônes cliquables.

---

## [unreleased — Futur : « aujourd'hui » qui avance + assemblage du passé testé] — 2026-07-24

### Onglet Futur
- **« Aujourd'hui » avance tout seul** : si tu laisses l'onglet ouvert au passage d'un mois, la courbe se recale
  sur le nouveau mois (avant, « aujourd'hui » restait figé jusqu'à un rechargement).

### Interne
- Assemblage du segment passé de la courbe extrait en fonction pure `services/history/buildPastPrefix.ts`
  (unit-testable hors composant) — verrouille le câblage money-critical (buckets, dette soustraite, dates) contre
  toute régression, et allège le composant. `startYear/startMonth` réactifs au calendrier (check horaire + visibilité).

---

## [unreleased — Futur : historique réel raccordé exactement à aujourd'hui] — 2026-07-24

### Onglet Futur
- **La courbe avant « aujourd'hui »** (ton historique réel reconstruit depuis tes transactions et placements)
  **atteint maintenant EXACTEMENT ton patrimoine net d'aujourd'hui**, sans saut à la jointure. Avant, si tu avais
  des dettes (carte, prêt), le passé les ignorait et sautait vers le bas pile à aujourd'hui. Désormais le passé
  soustrait tes dettes au niveau actuel (approximation signalée sous le graphe : « dettes au niveau actuel »).
- **Cohérence du cash passé** : la reconstruction du solde de liquidités ignore désormais les virements et doublons
  exactement comme le calcul du solde présent — les deux bouts de la courbe partaient de bases différentes.
- Bandeau d'honnêteté sous le graphe : « Patrimoine net réel depuis … · dettes au niveau actuel · titres étrangers
  au change du jour » (aucune donnée inventée).

### Interne
- Nouveau helper pur `services/history/pastNetWorth.ts` (`pastNetWorthAt`) routant par `computeRawNetWorth`
  (source unique du patrimoine net) — zéro copie locale de la formule. Tests discriminants (raccord dette + base cash).

---

## [unreleased — Accessibilité : « Pas de donnée » annoncé au lecteur d'écran] — 2026-07-24

### Accessibilité
- **Quand un chiffre est indisponible**, l'app affiche un tiret « — ». Les lecteurs d'écran annoncent
  désormais « Pas de donnée » à sa place (au lieu de « tiret cadratin » ou d'un silence), sur toutes les
  tuiles de statistiques (Tableau de bord, Budget, Investissements, Futur). Aucun changement visuel.

## [unreleased — Assistant IA : coût réduit par la mise en cache du prompt] — 2026-07-24

### Amélioration
- **L'assistant IA in-app réutilise désormais explicitement le cache de prompt d'Anthropic** pour les
  définitions d'outils, en plus du contexte système déjà mis en cache. Sur une conversation qui consulte
  plusieurs outils (jusqu'à 6 allers-retours), la partie stable de la requête est re-servie du cache au
  lieu d'être refacturée à chaque tour — moins de coût sur ta clé API, aucun changement de comportement.

## [unreleased — Cours : un rate-limit temporaire ne gèle plus un vrai titre] — 2026-07-24

### Correction
- **Quand un fournisseur de cours répond « trop de requêtes » (429) ou tombe en panne réseau**, l'app
  ne considère plus le titre comme « introuvable » : ces erreurs sont temporaires et le prochain
  rafraîchissement retente normalement. Seul un symbole vraiment inconnu (404) ou sans cotation est mis
  en pause pour économiser le réseau — et cette pause s'auto-répare à l'expiration. Avant, une simple
  rafale de 429 pouvait figer le cours d'un vrai titre pendant des heures.

## [unreleased — Investissements : plus de « 0 % » trompeur sur un cours figé] — 2026-07-24

### Correction
- **Un titre dont le cours réel s'est arrêté mais dont on garde le dernier prix connu** (candles du
  fournisseur cassées, ex. certains titres Euronext) affichait « +0,00 % » sur la période — comme si
  le marché était plat, alors que la donnée est simplement figée. Il affiche maintenant « — » (donnée
  indisponible) quand les deux bornes de la période sont des prix figés. Un vrai mouvement (prix figé
  aujourd'hui vs prix réel plus ancien) reste affiché normalement.

## [unreleased — Accessibilité : sélecteurs de période navigables au clavier] — 2026-07-24

### Accessibilité
- **Les sélecteurs en pilules** (période de performance des Investissements, vues du Budget, mode de
  données du Futur…) se naviguent maintenant aux flèches ←→↑↓ (avec Home/End) comme un vrai groupe de
  boutons radio — un seul arrêt de tabulation pour tout le groupe au lieu d'un par option. Cible tactile
  minimale garantie (≥ 24 px).

## [unreleased — Projection Future : plus d'icônes d'événements affichées] — 2026-07-24

### Correction (bug Marc : « pas assez d'icônes dans Futur »)
- **Le graphe de projection montrait souvent la moitié des icônes d'événements possibles** en vue
  dézoomée : l'échantillonnage sautait à un pas de 2 dès qu'il y avait un peu plus d'événements que
  le plafond (25 événements → 13 affichés au lieu de 24). Désormais il répartit uniformément et
  atteint le plafond (jusqu'à 24 événements de vie / 16 flux), premier et dernier toujours inclus.
  Le zoom continue d'afficher tous les événements de la fenêtre, et la pastille FIRE reste épinglée.

## [unreleased — Import IA : catégories validées contre ton budget] — 2026-07-24

### Sécurité / robustesse
- **Une catégorie inventée par l'IA lors d'un import de relevé** (via Claude/MCP) n'entre plus
  telle quelle dans tes données : elle doit correspondre à une catégorie canonique ou à un de
  tes postes de budget (peu importe la casse/les accents). Sinon, la transaction est
  re-catégorisée par les règles habituelles sur le marchand — et le résumé de l'import
  l'indique. Avant, une catégorie comme « Sport » pouvait être silencieusement absorbée par
  le poste « Transport » à l'affichage.
- **Même garde-fou sur le bouton « Classer » (catégorisation IA)** : le modèle recevait la
  consigne « toute autre valeur sera rejetée » mais rien ne la faisait respecter — c'est
  maintenant appliqué en code (hors liste → règles sur le marchand, sinon « Autre »), avec
  une trace au journal. Une transaction que le modèle omet de sa réponse laisse aussi une
  trace (avant : ignorée en silence). Les catégories d'un CSV bancaire importé restent, elles, acceptées
  telles quelles : ce sont de vraies données de ta banque, qui deviennent des postes au
  prochain alignement du budget.

## [unreleased — Budget : la moyenne et le grand livre rapprochent comme le réel] — 2026-07-24

### Correction
- **Un poste dont le nom diffère légèrement de la catégorie de tes transactions** (ex. poste
  « Restaurants », transactions « Restaurant ») affichait un réel correct mais une moyenne 12 mois
  à 0 $ et un grand livre qui rangeait ces dépenses dans « Autres / non classées ». Les trois
  surfaces utilisent maintenant la même règle de rapprochement — plus de contradiction à l'écran.

## [unreleased — Budget : réel · moyenne 12 mois · prévu par poste] — 2026-07-23

### Amélioration (demande Marc : « le budget affiche le réel actuel, la moyenne des derniers mois, et la prévision »)
- **Nouvelle colonne « Moy. 12m » sur chaque poste du budget** : la moyenne de tes dépenses
  réelles des 12 derniers mois complets (le mois en cours, partiel, ne fausse pas la moyenne),
  à côté du Réel de la période et de la Cible — les trois se comparent d'un coup d'œil.
- **La moyenne suit la période affichée** (mois / trimestre / année) avec la même règle que la
  cible, pour comparer des pommes avec des pommes.
- **Pas d'historique complet → « — »** honnête, jamais un faux 0 $.
- **Bandeau de chaque groupe** (Besoins / Envies / Épargne) : réel · moy. · cible — et ces
  totaux sont maintenant masqués en mode discret (ils restaient en clair).

## [unreleased — Moins d'appels réseau inutiles + horodatage honnête des cours] — 2026-07-23

### Amélioration
- **Un titre que les fournisseurs ne connaissent pas (GIC, titre manuel) n'est plus retenté en
  boucle** : après 3 échecs consécutifs, l'app saute ce titre pendant 24 h (cours) ou 7 jours
  (secteur/région) au lieu de payer un appel réseau et 2,5 s d'attente à chaque démarrage —
  puis réessaie automatiquement (jamais bloqué à vie). Le bouton « Actualiser les cours »
  force toujours un nouvel essai immédiat de tout.
- **« Cours mis à jour » affiche l'heure du COURS, plus celle du téléchargement** : un dimanche,
  tu vois la clôture de vendredi datée de vendredi — plus honnête sur la fraîcheur réelle.

## [unreleased — Investissements : période de performance au choix] — 2026-07-23

### Amélioration (demande Marc : « la performance actuellement c'est 24h mais je veux pouvoir choisir moi »)
- **Sélecteur de période sur la carte Performance** : 24h / 7 j / 1 mois / 3 mois / 6 mois /
  cette année / 1 an. Le choix pilote toute la page : la carte Performance (portefeuille vs
  marché), les flèches de tendance des chips du graphe et la « Variation » des cartes par titre.
- **Deux mesures honnêtes selon la surface** : le portefeuille et les comptes affichent la
  variation de leur VALEUR (sensible aux apports) ; chaque titre affiche la performance de son
  PRIX (insensible à tes achats — un dépôt ne « performe » pas). Le benchmark Marché utilise
  désormais le prix du CW8/MSCI, plus la valeur de ta position (un apport gonflait le « marché »).
- **Pas de donnée dans la fenêtre → « — »** (un titre acheté il y a 2 mois n'affiche pas un faux
  « 1 an »). Le score de diversification du haut de page reste calé sur 24h (stable quel que soit
  le sélecteur).

## [unreleased — Sécurité des dépendances + 2 tickers de plus au catalogue] — 2026-07-23

### Sécurité
- Dépendances vulnérables corrigées (`npm audit fix`) : fast-uri (élevée) et dompurify (faible).
  Résiduel assumé et documenté : une alerte modérée sur un module épinglé par le SDK MCP, mesurée
  inexploitable dans notre usage (fonction non utilisée + prod Linux) — retombera au prochain bump
  du SDK.

### Correctif
- `GBS.PA` et `AASI.PA` (or Paris, Amundi MSCI Em Asia) ajoutés au catalogue de classification —
  les deux seuls tickers du portefeuille mesurés non couverts par les répartitions après la #496.

## [unreleased — Investissements : répartitions géographique et sectorielle réparées] — 2026-07-23

### Correctif (bug signalé Marc : « la répartition géographique marche pas et sectorielle non plus »)
- **Les donuts de répartition fonctionnent pour TOUS les titres** : la classification lisait une
  table figée de 13 titres, avec des clés dans un ancien format qui ne correspondait même plus aux
  symboles réels — presque tout tombait dans « Autre ». Désormais : classification portée par
  l'actif lui-même, remplie automatiquement au démarrage quand le fournisseur connaît le titre
  (crypto classée par construction), et **éditable directement sur chaque carte d'allocation**
  (sélecteurs Région et Secteur, à côté du type de compte) — aucun titre n'est plus une impasse.
- Un même titre détenu dans plusieurs comptes garde une classification unique.

## [unreleased — Investissements : graphe dégagé, courbes lisibles] — 2026-07-23

### Amélioration (demande Marc : « ya du texte sur le graph… la courbe est mal visible »)
- **Le graphe respire** : plus grand (+30 %), les notes de couverture et le diagnostic des cours
  sont maintenant repliés en une ligne discrète chacun (le détail honnête reste à un clic), et la
  ligne « N points · période » est retirée.
- **Les petites courbes sont enfin lisibles** : quand plusieurs séries d'échelles très différentes
  sont affichées (ton TOTAL à ~240 k$ à côté d'un titre à 30 $), le graphe passe automatiquement en
  vue Base 100 (%) — la même convention que Google Finance pour comparer ; ton choix manuel
  Prix ($) / Base 100 garde toujours le dernier mot.
- **Correctif** : en Base 100, un titre acheté après le début de la fenêtre restait figé à 0 %
  (courbe invisible — sa base était prise sur le premier jour du graphe, où il n'existait pas).
  Chaque série démarre maintenant à son propre premier point.
- Correctifs du panel de revue : l'infobulle du graphe affiche « — » sur un jour sans donnée (plus
  de faux « +0,00 % ») et respecte le mode Base 100 (elle affichait des dollars sur une échelle en
  pourcentage) ; le mode discret masque enfin les montants du graphe de comparaison (il ne les
  masquait jamais) ; boutons Prix/Base 100 annoncés aux lecteurs d'écran (y compris la bascule
  automatique) ; zones de clic des panneaux repliables agrandies.

## [unreleased — Cours multi-fournisseurs : « tout ce que j'ai et plus »] — 2026-07-23

### Correctif (retour Marc post-couverture TOTAL : ~200 k$ affichés et titres toujours sans courbe)
- **Les cotations ont maintenant une chaîne de repli complète** : crypto → CoinGecko ; actions/ETF →
  Finnhub (si clé) → **Yahoo via le proxy de l'app** (le tier gratuit Finnhub ne quote pas les bourses
  européennes — c'est pour ça que les ETF Euronext gardaient un vieux prix saisi à la main, et donc un
  TOTAL sous-évalué). Tout titre coté quelque part dans le monde a désormais un prix frais.
- **Le bouton « Actualiser les cours » resynchronise TOUT** : historiques (y compris les titres en
  échec, cache purgé) + cotations + diagnostic — plus besoin d'attendre le lendemain pour voir l'effet
  d'une correction.
- **Diagnostic par titre sous le graphe (Investissements)** : chaque titre sans courbe affiche la
  raison exacte (« introuvable — essayé : CW8, CW8.PA… », « cours trouvé incompatible avec ton prix
  saisi »), un champ « symbole de cotation » pour fixer le ticker à la main, et un bouton « Chercher
  le titre » qui propose les bons tickers par NOM (ex. « Amundi EM Asia » → AASI.PA) en un clic.
- Un ticker résolu (automatiquement ou à la main) sert aussi aux cotations, et corriger un ticker
  purge l'historique du titre (jamais deux titres mélangés dans une courbe).
- Correctifs du panel de revue (3 agents, sondes) : un échec de resynchronisation est maintenant dit
  dans le message final (jamais masqué par « N cours mis à jour ») ; les resynchronisations boot et
  bouton ne peuvent plus tourner en même temps (respect des limites des fournisseurs) ; un même titre
  détenu dans deux comptes n'affiche qu'une ligne de diagnostic ; en mode discret, le diagnostic ne
  montre aucun montant ; une devise non supportée par l'app (ex. livre sterling) ne peut plus s'écrire
  sur un actif via le repli Yahoo ; le rapport de diagnostic est purgé à l'entrée en mode démo.

## [unreleased — Investissements : la courbe TOTAL couvre TOUT le portefeuille] — 2026-07-23

### Correctif (bug signalé Marc : « normalement j'ai 230K mais dans la courbe je vois 180k »)
- **Le TOTAL de la courbe de portefeuille n'omet plus aucun titre détenu** : un titre sans historique
  de cours (ex. ETF européens Amundi/CW8/GBS sans candles chez les providers gratuits) est désormais
  COMPTÉ dans le total à sa valeur actuelle (contribution plate) au lieu d'être silencieusement exclu
  (~50 k$ manquants). Aucune courbe individuelle n'est inventée pour autant — le bandeau sous le
  graphe liste ces titres et le montant compté.
- **Plus de « marche » fantôme** : quand l'historique d'un titre commence après son achat (provider
  borné, ex. crypto ~365 j), les dates antérieures comptent à son premier cours connu (approximation
  signalée) au lieu de faire sauter le total sans transaction.
- **Raccord au cours du jour** : un titre dont l'historique s'arrête mais dont le prix live est frais
  (quote < 7 j) est raccordé à son prix actuel sur les derniers jours (cas GBS.PA : cotation OK,
  historique cassé).
- **Tickers européens sans suffixe résolus automatiquement** : un ticker nu qui ne répond pas est
  réessayé avec les suffixes de sa devise (EUR → .PA/.DE/.AS/.MI, CAD → .TO/.V), accepté seulement si
  le cours trouvé est cohérent avec le prix actuel de l'actif (anti-confusion de ticker), et la
  résolution est mémorisée sur l'actif.
- Réponse à « utiliser exactement la courbe de Google Finance, c'est possible ? » : pas d'API publique —
  la parité s'obtient par la couverture complète ci-dessus ; l'écart résiduel attendu vient de la
  granularité (clôtures quotidiennes) et de l'heure du taux de change.
- Correctifs du panel de revue (4 agents, sondes exécutées) : un titre dont l'historique s'arrête sans
  cotation fraîche est maintenant SIGNALÉ (« absent du total des derniers jours ») au lieu de disparaître
  en silence ; une panne réseau ne déclenche plus la recherche de variantes de ticker (risque d'adopter un
  autre titre) ; un ticker résolu qui cesse de répondre se répare seul au cycle suivant ; le montant du
  bandeau partage exactement la base de quantité de la courbe (achats datés).

## [unreleased — Assistant fusionné : onglet visible + prochaines actions cliquables] — 2026-07-23

### Nouveau (demande Marc « combiner Prochaine action à l'Assistant » + « je ne vois pas l'onglet assistant »)
- **L'onglet Assistant est maintenant VISIBLE dans la barre de navigation** (groupe Plan, à la place
  de « Prochaine action ») — il n'était accessible que par Alt+9/Cmd+K, c'est pour ça qu'il était
  introuvable. Alt+9 et la recherche (mots-clés « reco », « conseil », « prochaine ») y mènent toujours.
- **Prochaines actions fusionnées dans l'Assistant** : cartes compactes au-dessus du chat — dettes à
  taux élevé, cashflow négatif, coussin insuffisant, espace CELI/REER inexploité — chacune cliquable
  pour en discuter avec l'assistant (« Explique-moi ce signal et aide-moi à agir dessus »), qui a les
  outils pour le faire.
- **Un seul moteur de recommandations** : les cartes utilisent les MÊMES signaux purs que le chat
  (calcul direct, toujours frais) — fini l'ancien widget qui appelait l'IA avec « exactement 3
  actions » forcées (source des recommandations de remplissage peu pertinentes) et son cache d'1 h
  (recommandations périmées). Plus jamais deux avis contradictoires sur la même page.
- Honnêteté : 0 signal = « rien d'anormal détecté » (jamais de cartes fabriquées) ; profil vide =
  invitation à configurer ; mode discret = montants masqués ET clic désactivé (rien ne part vers
  l'API pendant que l'écran masque).
- Un lien/bookmark vers l'ancien onglet (#ACTIONS) redirige automatiquement vers l'Assistant.

## [unreleased — Chat : panneau réparé + Budget compris à 100 % (vague 1.5)] — 2026-07-23

### Correctif (bug signalé Marc, captures)
- **Panneau de chat réparé** : l'auto-scroll utilisait `scrollIntoView`, qui fait défiler TOUS les
  conteneurs parents — y compris le panneau lui-même → le header et la conversation sortaient par le
  haut (saisie affichée en haut, chat invisible, « je vois pas le chat »). Le défilement cible
  maintenant UNIQUEMENT le fil de messages. Vérifié en vrai navigateur (test e2e Playwright ajouté :
  header en haut, messages au milieu, saisie en bas).

### Nouveau (demande Marc « qu'il comprenne toute la page + les calculs derrière »)
- **Budget compris à 100 %** : le chat voit désormais TOUTES les cartes de la page — Impact à long
  terme, Sensibilité, projection Fin de mois, ventilation des revenus (Salaire/Divers), statut
  Excédentaire/Déficitaire, dépassements détectés — chacune avec sa PROVENANCE (d'où vient le
  chiffre, quel calcul derrière : ex. « Impact à long terme = patrimoine successoral de la
  projection Futur, rentes RRQ/PSV incluses »). « Explique-moi ce 6 104 080 $ » reçoit maintenant
  une vraie réponse au lieu d'un « je ne vois pas ce chiffre ».
- Prochaines vagues : mêmes cartes+provenance sur les autres onglets (V2 au BACKLOG).

## [unreleased — Chat conscient de la page (vague 1)] — 2026-07-22

### Nouveau (demande Marc « le chat peut réagir à tout sur la page »)
- **Le chat sait ce que tu regardes** : sur toutes les pages, il connaît l'onglet ouvert ; sur
  Budget, il voit EXACTEMENT ce que la page affiche (période naviguée, vue mois/trimestre/année,
  dépenses réelles, cible, revenus de la période, top 3 catégories, filtre personne) — « explique-moi
  ce chiffre » répond sur le chiffre de TON écran, pas un recalcul d'un autre mois.
- **Badge « Contexte : Budget — juillet 2026 »** au-dessus du champ de saisie : tu vois (et peux
  contester) ce que le chat perçoit. Le contexte est capturé au moment où tu envoies — naviguer
  pendant la réponse ne la fait pas dériver.
- **Honnêteté** : sur une page non encore instrumentée, le chat dit qu'il ne voit pas le détail et
  consulte ses outils (jamais « je vois » sans voir). Mode discret : les montants sortent du
  contexte À LA SOURCE (rien ne part vers l'API pendant que l'écran masque).
- Fondation extensible : les autres onglets s'ajoutent en vague 2 (`[CHAT-PAGE-CONTEXT-V2]`).

## [unreleased — Chat : choix du modèle par conversation + coût réel (B3+B4)] — 2026-07-22

### Nouveau (demande Marc « choisir quel ia, prix total prix de la conv etc »)
- **Choix du modèle PAR conversation** : sélecteur Haiku / Sonnet / Opus dans le header du chat.
  Le choix suit la conversation : archivée avec elle, restauré quand tu la rouvres ; une nouvelle
  conversation garde ton dernier choix. Gelé pendant qu'une réponse est en cours (le modèle d'un
  message est celui au moment de l'envoi). Les anciennes conversations comptent comme Sonnet
  (le seul modèle qui existait avant).
- **Coût API réel, en CAD** : chaque réponse affiche son coût exact (tokens réellement facturés ×
  tarif public Anthropic du modèle, cache compris), converti en CAD avec le taux de l'app. Le header
  montre le coût de la conversation en cours + le total cumulé à vie ; la sidebar montre le coût et
  le modèle de chaque conversation archivée. Un envoi annulé ou en échec compte ses tours déjà payés
  (jamais de coût maquillé). Micro-coûts : « < 0,01 $ » plutôt qu'un faux « 0,00 $ ».
- Garde-fous : un modèle sans tarif connu ne fabrique JAMAIS un coût (absence honnête + trace) ;
  tarifs datés/sourcés dans `services/aiChat/pricing.ts` ; parité modèles↔tarifs verrouillée par test.

### Correctifs du panel B3+B4 (6 agents, sondes — 2 élevés + moyens appliqués)
- **Coût dépensé en mode démo plus jamais perdu** (prouvé par sonde) : le chat en démo fait de VRAIS
  appels facturés — la sortie du mode test ADDITIONNE désormais cette dépense au cumul réel (avant :
  jetée en silence par la restauration du snapshot).
- **Ratio de coût du sélecteur DÉRIVÉ du tarif réel** : le libellé « 5× le coût de Sonnet » était
  faux (5/3 ≈ 1,7×) — il est maintenant calculé depuis la table (drift impossible).
- **Mode discret** : la ligne de coût du header est masquée comme tout montant (« masquer = ne pas
  rendre », sans exception).
- **a11y** : id du sélecteur unique par instance (panneau + onglet montés ensemble = id dupliqué,
  le label pouvait cibler le mauvais select) ; étiquette « Coût : » lisible au lecteur d'écran sur
  le coût par bulle.
- Robustesse : lecture TYPÉE de `msg.usage` (un renommage de champ SDK casserait le typecheck au
  lieu de sous-compter à 0 en silence) ; trace quand une réponse en vol perd sa bulle (pull Drive
  concurrent) ; ceinture `resolveChatModelKey` sur l'affichage sidebar ; micro-perf (memo).

## [unreleased — Chat : historique multi-conversations + pièces jointes cross-device (B2)] — 2026-07-22

### Nouveau (demande Marc « un onglet dédié avec historique »)
- **Historique de conversations dans l'onglet Assistant** : sidebar (mobile : sélecteur) listant tes
  conversations archivées — « Nouvelle conversation » archive l'active et repart à zéro, cliquer une
  ancienne la recharge (l'active du moment s'archive à sa place), suppression en 2 clics. Titre auto =
  ta première question. Le panneau latéral reste compact (conversation active seulement).
- **Synchronisé via Drive** : les conversations (texte + métadonnées) voyagent avec le reste de l'état —
  tu retrouves ton historique sur l'autre PC.
- **Pièces jointes cross-device** : le CONTENU des fichiers joints est stocké en fichiers SÉPARÉS du
  dossier caché Drive (jamais dans l'état synchronisé — il reste léger) : envoyé en arrière-plan à
  l'envoi, récupéré automatiquement sur l'autre appareil quand tu poses une question de suivi.
  Sans Drive connecté : comportement d'avant (note honnête « contenu non disponible »). Supprimés
  avec leur conversation (pas d'orphelins). Jamais actif en mode démo.
- Garde-fou : aucune bascule/suppression pendant qu'une réponse est en cours (la réponse payée
  serait perdue) ; zone entièrement masquée en mode discret (les titres peuvent porter des montants).

### Correctifs du panel B2 (4 agents, sondes — 1 critique + 2 élevés + moyens appliqués)
- **Droit à l'effacement complet (Loi 25)** : « Supprimer mes données de Google Drive » efface
  désormais AUSSI les fichiers de pièces jointes du chat — avant, seuls le fichier de sync partait,
  les relevés/PDF joints restaient dans le Drive indéfiniment.
- **Course corrigée (prouvée par sonde)** : pendant la lecture d'une pièce jointe, on pouvait
  changer de conversation et le message atterrissait dans la MAUVAISE — les actions gèlent
  désormais dès le clic Envoyer, avant toute lecture.
- **Suppression Drive fiable** : listing paginé (au-delà de 50 fichiers, des pièces jointes
  « supprimées » restaient silencieusement), échec par-fichier tracé (jamais avalé), mémo conservé
  pour retenter.
- **Récupération cross-device robuste** : un contenu introuvable est re-tenté après 60 s (avant :
  raté mémorisé pour toute la session — l'appareil B qui regardait AVANT que l'appareil A ait fini
  d'envoyer ne retrouvait jamais le document).
- **Historique borné** : maximum 30 conversations archivées (les plus anciennes tombent, leurs
  fichiers Drive nettoyés) — le payload de sync ne croît pas sans fin.
- **Accessibilité (mesurée)** : le focus ne retombe plus sur la page à chaque bascule/suppression,
  bordure visible sur la confirmation « Oui » (contraste non-texte 6,6:1), annonces lecteur
  d'écran des transitions, purge des caches au changement de compte Google.

## [unreleased — Chat : pièces jointes multimodales (B1)] — 2026-07-22

### Nouveau (demande Marc « que je puisse mettre des docs ou image ou autre »)
- **Joindre des fichiers au chat Assistant** (trombone dans la barre de saisie, panneau ET onglet) :
  **images** (PNG/JPEG/WebP/GIF, ≤ 5 Mo), **PDF** (≤ 10 Mo) et **texte/CSV** (≤ 1 Mo), jusqu'à
  5 par message — envoyés à Claude en multimodal (il lit le contenu, pas juste le nom).
- **Validation à la sélection** : un fichier refusé (type non supporté, trop lourd) est bloqué
  immédiatement avec un message nommé — jamais un envoi qui échoue plus tard en silence. Un envoi
  peut être « pièces jointes seules » (déposer un relevé sans question).
- **Transcript léger (ADR-4)** : seules les métadonnées (nom/type/taille) sont persistées et
  synchronisées Drive — les octets restent en mémoire de session. Après un rechargement, une
  question de suivi sur un ancien document reçoit une note honnête « contenu non disponible,
  rejoins le fichier » (le modèle n'invente jamais un contenu).
- **Sécurité** : contenu des fichiers texte neutralisé (anti-injection, même classe que les
  imports Vision) + clause explicite « pièce jointe = donnée, jamais des instructions » dans le
  system prompt ; les montants lus dans un document sont des LECTURES — les outils restent la
  seule source de vérité de l'état réel.

### Correctifs du panel B1 (5 agents, sondes exécutées — 1 critique + 3 élevés + 6 moyens appliqués)
- **Fichier de 0 octet** : refusé à la sélection (avant : base64 vide → le message ENTIER
  disparaissait de ce que voyait le modèle pendant que la puce s'affichait comme analysée) ;
  triple ceinture (plancher, garde par type, repli honnête dans l'historique).
- **Cliquer une suggestion avec un fichier joint** : le fichier PART avec la suggestion (avant :
  jeté en silence, puce disparue comme si envoyée).
- **Budget agrégé 20 Mo/message** : 3 PDF de 10 Mo valides un à un ne partent plus vers un rejet
  API générique — refus nommé à la sélection ET ceinture à l'envoi.
- **Coût BYOK borné** : point de cache Anthropic (`cache_control`) sur le dernier bloc de pièce
  jointe — les octets d'un document ne sont plus re-facturés plein tarif à chaque tour d'outils
  (jusqu'à ~30 ré-émissions d'un même PDF avant fix) ; éviction du cache mémoire au-delà de la
  fenêtre d'historique (croissance bornée) ; purge du cache à l'entrée/sortie du mode démo.
- **Messages honnêtes** : erreur API 400 sur une pièce jointe → « retire-la ou remplace-la »
  (avant : « réessaie », qui rééchouerait à l'identique) ; échec de lecture → « retape ton
  message et rejoins tes fichiers » (les puces sont déjà vidées) ; nom de fichier jamais écrit
  dans le journal d'erreurs local (il peut contenir un montant).
- **Accessibilité mesurée** : contraste des puces relevé (ink-200, 7,1:1 — l'ancienne puce
  « a consulté » corrigée au passage), cible du bouton retirer ≥ 24 px, ajout de puce annoncé
  aux lecteurs d'écran, doublon de fichier signalé au lieu d'ignoré.

## [unreleased — PORTFOLIO-HISTORY : les courbes de cours marchent enfin en données réelles] — 2026-07-22

### Correctif majeur (bug Marc « je vois pas le cours ni le cours du portefeuille »)
- **Cause racine** : tous les graphes de cours (Dashboard « Évolution détaillée », Investissements
  « Performance comparée », modal « Voir courbe ») reposaient sur un **stub mort** (l'ancien CSV Google
  Sheet supprimé → toujours vide) — ils ne marchaient qu'en mode démo (données synthétiques).
- **Historique réel par action, DEPUIS TON PREMIER ACHAT** : `priceHistory` est hydraté au boot via une
  chaîne de sources gratuite : **Finnhub (ta clé)** → **repli Yahoo** (proxy same-origin via rewrite
  Vercel — zéro nouveau domaine CSP, indispensable car les chandelles Finnhub sont réservées au tier
  payant) → **CoinGecko** pour la crypto. Fenêtre : de ta première date d'achat à aujourd'hui.
- **Courbe du portefeuille ENTIER** : reconstruction jour par jour = quantité détenue à chaque date
  (tes achats DCA datés) × clôture native × taux de change → valeur CAD par titre + totaux par compte
  (CELI/REER/Non-enr./Crypto) + TOTAL. Placements seulement (scope validé).
- **No-fake-data** : un titre sans historique disponible est EXCLU des courbes et totaux (signalé),
  jamais une ligne plate inventée ; « Performance (24h) » affiche « — » au lieu d'un faux +0.00% ;
  le cadre vide du Dashboard devient un message honnête avec quoi faire.
- **Robustesse cache** : une erreur provider (403 candles premium, 429) n'est PLUS cachée 24h comme
  « vide » — contrat `null` = erreur (retry/repli), `[]` = vide valide (cacheable).
- Fraîcheur : re-sync automatique d'un historique > 24h (`lastHistorySync`), pacing séquentiel 2,5s
  (rate-limit du provider le plus strict), anti-course sur l'état frais, sauté en mode test.

### Correctifs du panel adversarial (2026-07-22, 30 agents — 9 confirmés appliqués)
- **Même titre dans DEUX comptes** (ex. XEQT en CELI ET REER) : la colonne du graphe est désormais
  l'AGRÉGAT des positions — avant, la seconde écrasait la première (position sous-comptée de sa
  valeur entière, mesuré 10 k$).
- **Piles du Dashboard (CELI/REER/Non-enr./Crypto)** : lues depuis les totaux par compte ÉMIS par le
  builder (mêmes règles partout — CELIAPP compte en CELI, REEE en REER) — avant, une recomposition
  locale classait tout actif acheté après la 1re date en « Non-enregistré » (45 k$ de BTC mal empilés
  mesurés) et divergeait d'Investissements pour CELIAPP/REEE.
- **« Voir courbe » / matching des titres** : correspondance EXACTE partout — avant, « V » (Visa)
  matchait « VFV.TO » par sous-chaîne (mauvaise courbe affichée, mauvais actif modifié/supprimé
  dans Investissements), et le modal lisait les clés de la 1re ligne (éparse) → « Aucune donnée »
  à tort pour un titre acheté après le 1er achat global.
- **Garde de devise crypto** : « BTC » nu (CoinGecko répond en USD) sur un actif déclaré CAD n'est
  PLUS hydraté tel quel (valeurs fausses de −27,5 % mesurées) — ignoré avec message expliquant le
  correctif (renommer en BTC-CAD ou corriger la devise).
- **Fusion d'historique au re-sync** : les nouveaux points FUSIONNENT avec l'ancien historique —
  avant, le remplacement intégral faisait perdre chaque jour le point le plus ancien d'un crypto
  détenu > 1 an (fenêtre CoinGecko bornée à ~365 j).
- **Le cache persistant survit enfin aux rechargements** : configurer le provider avec la MÊME clé
  ne vide plus le cache IndexedDB 24h (il était vidé à CHAQUE boot — sa raison d'être annulée) ;
  balayage des entrées expirées ajouté (croissance bornée).
- **Signalement honnête des courbes incomplètes** : note sous le graphe listant les titres sans
  historique (exclus) et ceux à historique borné par le provider (« depuis AAAA-MM-JJ » — la marche
  du TOTAL ce jour-là est expliquée, mesurée +90 k$ sans transaction avant fix).
- **Prix périmé jamais forward-fillé** : un titre dont l'historique s'arrête (délisting, sync en
  échec) sort de la courbe après 7 jours au lieu d'afficher un vieux close comme valeur du jour.
- **Chips du graphe Investissements** : chaque total par compte a son libellé (« CELI (total) »…) —
  avant, 4-5 chips s'appelaient toutes « TOTAL PORTEFEUILLE » et le KPI « Votre Portefeuille (24h) »
  pouvait lire la tendance d'un bucket ; le sous-échantillonnage garde les 2 derniers points réels
  (« 24h » redevient vrai) ; un échec TOTAL de la chaîne d'historique est tracé (`error`) au lieu
  d'être confondu avec un « vide légitime ».

## [unreleased — Google Drive : rester connecté + déconnexion auto après inactivité] — 2026-07-22

### Améliorations (sauvegarde Drive)
- **Plus besoin de te reconnecter à chaque fois** (demande Marc) : au boot, si le jeton en cache a expiré
  (~1h) mais que tu as été actif il y a moins de 8h, l'app tente une **ré-authentification silencieuse**
  (sans popup) — tu restes connecté tant que ta session Google est valide. Avant, le boot n'utilisait que
  le cache → reconnexion au clic dès que le jeton avait expiré.
- **Déconnexion automatique après ~8h d'inactivité** (sécurité / Loi 25) : un minuteur suit ton activité
  (clic/clavier/retour d'onglet, horodatage persisté device-local) ; au bout de 8h sans interaction, le
  jeton Drive est **révoqué** et un message t'invite à te reconnecter. Tes **données locales ne sont jamais
  touchées** ; la reconnexion se fait en un clic (l'anti-clobber protège toujours contre l'écrasement).
- Limite assumée : sans refresh token (archi 100% navigateur, ADR-002), « rester connecté » tient tant que
  ta **session Google** vit ; si Google te déconnecte, il faut un clic.

### Correctifs du panel (sécurité + silent-failure, sondes exécutées)
- **CRITIQUE — la déconnexion 8h était neutralisée par le polling Drive** : le tick de sync (60s) comptait
  comme « activité » → l'horloge ne vieillissait jamais, et après une déconnexion l'horodatage effacé
  permettait au polling de reconnecter en ≤60s. Désormais SEULE une vraie interaction (clic/clavier) ou une
  connexion explicite avance l'horloge ; l'horodatage périmé est conservé après la déconnexion auto (la
  reconnexion exige un vrai clic). Discriminant : N ticks de polling → horloge inchangée.
- **Onglet gelé >8h** (navigateur qui suspend les timers) : l'activité au retour vérifie l'expiration AVANT
  de réarmer → la déconnexion se déclenche au retour au lieu d'être silencieusement effacée.
- **Échec réseau de la ré-auth silencieuse tracé** : « pas de session Google » (nominal) reste silencieux,
  mais un échec réseau/CDN au boot est journalisé (avant : renvoi au login sans trace, indiscernable d'un
  premier accès).

## [unreleased — chantier Claude-in-app, AITOOLS-SEC : audit sécurité final] — 2026-07-22

### Sécurité (audit de clôture du chantier — rapport `docs/AUDIT_SEC_CLAUDE_IN_APP_2026-07-22.md`)
- **Injection de prompt indirecte fermée côté serveur MCP** (`[MCP-WRITE-SUMMARY-SCRUB]`, ÉLEVÉ) :
  `runApply` renvoyait le `summary`/`changes` d'une écriture NON désinfectés à claude.ai — un nom de
  dette/employeur/ticker piégé (extrait d'un document joint) revenait verbatim dans le contexte. Le scrub,
  déjà en place côté app (Lot D), est désormais un helper PARTAGÉ (`scrubWriteResultForModel`) consommé par
  les deux surfaces → parité par construction, plus de dérive. ⚠️ Effet sur claude.ai au prochain deploy Cloud Run.

### Durcissements (audit de clôture du chantier)
- **`.finite()` sur les champs $ non bornés de 3 tools de lecture** (runProjection, calculateRealEstate,
  searchTransactions, getTaxRoom) — `Infinity` traversait la validation Zod (`.positive()/.nonnegative()`
  ne l'excluent pas), risquant un calcul absurde présenté avec autorité. + garde-scan
  `tests/aiTools/specFiniteGuard.test.ts` (volume prouvé) interdisant tout futur champ $ sans `.finite()`.
- **Réponse REFUSÉE par le modèle** (`stop_reason: 'refusal'`) traitée comme une fin dégradée honnête :
  marqueur « [Réponse refusée] » + `logError` (avant : « aucune réponse, réessaie » aveugle, sans trace).

## [unreleased — chantier Claude-in-app, Lot E : chat partout (panneau global + onglet)] — 2026-07-22

### Améliorations (Assistant)
- **Le conseiller IA est maintenant accessible PARTOUT** via un bouton flottant présent sur tous les
  onglets (panneau latéral global), en plus de l'onglet Assistant agrandi en pleine page. Les deux
  surfaces partagent la **même conversation, le même état** (une seule instance `useAiChat` via
  `AiChatProvider` monté au niveau App) — envoie une question depuis le panneau, retrouve-la dans
  l'onglet, et vice-versa. Une pastille sur le bouton flottant signale qu'une réponse arrive pendant
  que tu navigues ailleurs.
- **Résout à la racine le finding Lot D « promesse orpheline au changement d'onglet »** : le chat
  n'est plus monté/démonté par onglet (il vit au niveau App) → une confirmation d'écriture en attente
  survit à la navigation. Le modal de confirmation est rendu une seule fois par le provider.
- **Bundle de boot inchangé** (mesuré ~107 kB gzip) : `useAiChat` charge le SDK Anthropic en import
  DYNAMIQUE (au 1er message), le panneau global est lazy — le provider monté App ne tire rien de lourd.
- Rendu mutualisé `AiChatView` (variant panneau/onglet) : une seule source pour les deux surfaces.

### Correctifs du panel (4 agents, sondes exécutées)
- **ErrorBoundary autour du chat** (silent-failure, ÉLEVÉ) : le provider vit au-dessus de toute l'app ;
  sans filet, un crash du hook = écran blanc global. Ceinture `ErrorBoundary` autour du provider +
  `ErrorBoundary` dédié au panneau (isole un crash de rendu à la seule surface chat).
- **Autofocus du champ restauré** (3 agents, HIGH) : l'ouverture du panneau redonne le focus au champ ;
  la fermeture (Échap/✕/toggle) restaure le focus sur le bouton flottant (WCAG 2.4.3).
- **Contrastes** (a11y, mesurés) : horodatage message user `green-200`→`dark/60` (était ~1:1, invisible) ;
  horodatage assistant + placeholder `ink-500`→`ink-400` (< AA → ≥ 4,5:1).
- **`<h1>` de page** sur l'onglet Assistant (a11y) : l'onglet pleine page porte un `PageHeader` comme
  les autres onglets (hiérarchie de titres) ; `role="status"`+`aria-live` sur le bloc de chargement.
- **Résilience chunk périmé** (ai-reviewer) : les imports dynamiques du chat passent par `importWithRetry`
  (retry + reload gardé), comme le reste de l'app — un déploiement pendant une session ne boucle plus en 404.

## [unreleased — HUB-REFRESH-CRON : refresh serveur autonome des prix] — 2026-07-22

### Ajouts (serveur)
- **Refresh planifié des prix (`HUB-REFRESH-CRON`)** : le serveur MCP (Cloud Run) rafraîchit
  désormais les cours de marché SANS que l'app navigateur soit ouverte. Nouvelle route
  `POST /refresh` (activée si `FINANCEAI_REFRESH_SECRET` ≥16 car., sinon 404 comme `/hub/summary`),
  authentifiée par `Authorization: Bearer` en temps constant. Elle lit le blob Drive, rafraîchit
  les `currentPrice` via le moteur PARTAGÉ (`services/priceRefresh` — devise protégée, changement
  réel uniquement, provider-aware) et réécrit avec la garde OCC. **Ne touche QUE les cours**
  (dettes/budgets/relevés intacts) ; un symbole sans provider est SKIPPÉ (no-fake-data). Erreurs
  HONNÊTES : conflit de concurrence → `200 { ok:false, conflict:true }` transitoire (réessai au tick),
  mais une panne RÉELLE (Drive KO, jeton révoqué, coffre chiffré) → `5xx` pour que le cron rougisse
  au lieu de rester vert sur des prix figés (`StateConflictError` typée). Déclencheur : GitHub Actions
  planifié gratuit (`.github/workflows/refresh-prices.yml`, toutes les 6 h + manuel) — Cloud Run
  dort (scale-to-zero), un cron externe le réveille. `deploy.sh` monte `financeai-refresh-secret` et
  la `financeai-finnhub-key` (optionnelle, cours actions) depuis Secret Manager s'ils existent.
  Tests : `tests/mcp/refreshPrices.test.ts` (OCC, no-write-si-inchangé, skip honnête, source non
  inscriptible). ADR : `docs/decisions.md` § `HUB-REFRESH-CRON`.

## [unreleased — chantier Claude-in-app, Lot D : écritures avec confirmation] — 2026-07-21

### Améliorations (Assistant)
- **L'assistant in-app peut maintenant PROPOSER des écritures** via les 5 mêmes tools `apply_*` que le
  connecteur claude.ai (dette, fiche de paie, relevé bancaire, relevé de courtage, feuillet fiscal) —
  **RIEN ne s'écrit sans ton clic** : diff avant → après calculé PUREMENT (`applyDocument`, zéro mutation)
  → modal « Confirmer la modification » (`AiChatConfirmModal`) → Appliquer (sauvegarde IndexedDB créée
  AVANT l'écriture ; échec du backup = écriture ANNULÉE) ou Annuler (tool_result « refusé », Claude ne
  réessaie pas sans nouvelle demande). Toute fermeture du modal (✕, Échap, backdrop) = refus.
- Anti-course : au clic Appliquer, le diff est RECALCULÉ sur l'état FRAIS (un prix rafraîchi ou une
  écriture concurrente pendant que le modal est ouvert n'est jamais écrasé par un état périmé).
- Structurel : les tools d'écriture ne sont DÉCLARÉS à l'API que si l'exécuteur de confirmation est
  branché (une surface sans modal est incapable d'écrire) ; les vraies `apiKeys` ne peuvent pas être
  écrasées par un apply (exclues du snapshot ET du patch appliqué). Chips « proposition d'écriture ».
- Fix flake CI `oauthProvider` (« jeton ALTÉRÉ ») : le caractère de remplacement se base sur celui
  qu'on remplace (position -2) — avant, ~1/64 des runs produisait un jeton identique (faux rouge).

### Correctifs du panel (4 agents, sondes exécutées — 2 CRITIQUE + 2 ÉLEVÉ + 2 MOYEN appliqués)
- **Mode discret ne masquait pas le modal de confirmation** (CRITIQUE, Loi 25) : le modal affichait des
  montants hors du gating mode discret → activer le mode discret pendant une confirmation laissait la valeur
  en clair. Le hook auto-refuse désormais toute confirmation en attente quand le mode discret s'active
  (cohérent avec « fermer = refus ») + rendu gaté `!isPrivacyMode`.
- **Promesse de confirmation orpheline au changement d'onglet** (CRITIQUE) : `AiAssistant` n'est monté que
  sur l'onglet Assistant ; changer d'onglet pendant un modal ouvert démontait `useAiChat` → la boucle
  agentique restait suspendue à vie sans trace. Cleanup au démontage : refus automatique + abort + logError.
- **Injection de prompt indirecte via `summary`** (ÉLEVÉ) : le `summary`/`field`/`note` d'un tool_result
  d'écriture réinjectait le nom user brut (extrait d'un document joint) dans le contexte de Claude —
  `jsonContent` ne scrube que les clés user-free-text. `sanitizePromptText` appliqué au renvoi vers le
  modèle (jamais sur l'affichage user ni le store). `.max()` ajouté à `symbol`/`name` broker.
- **« Annuler » ne coupait qu'une confirmation par lot** (ÉLEVÉ) : si le modèle propose 2 écritures dans un
  tour, Annuler sur la 1re ouvrait quand même la 2e. La boucle de dispatch court-circuite désormais les
  tool_use restants dès le signal aborté (refus honnête `is_error`).
- **`.finite()`** ajouté aux 5 specs $ (3 en manquaient — mitigé par la ceinture `applyDocument`, ajouté
  par cohérence). 4 tests de régression (démontage, mode discret, abort en lot, scrub injection).

## [unreleased — chantier Claude-in-app : tools moteur hors du thread principal] — 2026-07-21

### Améliorations
- **`[AITOOLS-ENGINE-WORKER]`** — `get_projection`, `get_retirement_outlook` (Monte Carlo par défaut)
  et `simulate_what_if` (2 runs) routés sur `runProjectionAsync` : Web Worker + timeout 30 s côté
  navigateur (l'UI du futur chat ne gèlera pas pendant un calcul), repli synchrone IDENTIQUE côté
  Node/MCP (mêmes résultats — parité re-prouvée). `withState` accepte les handlers async (rétrocompat
  sync). Garde-scan : plus aucun appel moteur direct possible dans un spec.

## [unreleased — chantier Claude-in-app, Lot C : l'assistant passe au tool-use] — 2026-07-21

### Améliorations (Assistant)
- **L'assistant in-app consulte tes VRAIES données via les 11 tools de lecture** (mêmes specs que le
  connecteur claude.ai — « mêmes réponses ») au lieu d'un contexte résumé fait main. `generateContext()`
  SUPPRIMÉ (source divergente). Chips « a consulté : Situation fiscale » par réponse + chargement nommé
  (« Consulte : Projection… »). Logique partagée `hooks/useAiChat.ts` (prête pour le panneau global, Lot E).
- **Bannière mode test** (« je réponds sur le persona ») — `warning-400` (le shade 300 n'existe pas :
  no-op silencieux évité, mesuré). **Mode discret : chat masqué en ENTIER** (hors DOM, ADR-5).
- Transcript persisté LÉGER : rôle + texte + libellés d'outils (`AiMessage.id?`/`toolsUsed?` additifs).
- Bundle boot inchangé (mesuré : +110 octets gzip = bruit ; chat dans le chunk lazy).

### Correctifs du panel (sondes mesurées — 1 CRITIQUE + 2 ÉLEVÉ + 2 MOYEN appliqués)
- **Annuler ≠ erreur** : l'annulation rend `stopReason:'aborted'` + « [Annulé] » SANS logError (avant :
  « réessaie » générique + une entrée de log d'ERREUR à chaque clic Annuler — bruit masquant les vrais échecs).
- **Identité de message** : les mises à jour de stream ciblent l'ID du message de CET envoi (jamais « le
  dernier ») + garde de réentrance par ref (deux envois du même tick = une seule boucle) + **Effacer
  désactivé pendant un envoi** (vider mi-stream perdait la réponse payée sans trace).
- Commentaire ADR-4 corrigé (les blocs tool_use sont JETÉS par tour — re-consultation idempotente) ;
  system prompt : divergence possible entre `get_projection` (frais) et l'écran Futur (optimisé/figé)
  expliquée à l'utilisateur au lieu de passer pour un bug.

## [unreleased — chantier Claude-in-app, Lot B : boucle agentique + registre app (lecture)] — 2026-07-21

### Nouveau (fondation, pas encore branché à l'UI — Lot C)
- **`services/aiTools/`** : le chat Claude in-app peut consommer les 11 tools de LECTURE (mêmes specs
  que le serveur MCP) via le SDK Anthropic — `registry` (11 tools, écriture exclue jusqu'au Lot D),
  `toAnthropicTools` (zod → JSON Schema, même source de schémas que claude.ai), `dispatch` (validation
  zod EXPLICITE — l'étape que server.tool faisait côté MCP), `agentLoop` (streaming, cap dur 6 tours,
  timeout par tour, tool_result d'erreur lisibles — jamais de throw vers la conversation),
  `systemPrompt` (contexte QC + discipline no-fake-data), `appStateProvider` (snapshot PLAT du store —
  actions Zustand écartées — par la MÊME `normalizeAppState` que le MCP).
- **`mcp/state/appStateDefaults.ts`** : `buildDefaultAppState`/`normalizeAppState` extraits VERBATIM
  de `loadAppState.ts` (qui importe node:fs) → browser-safe ; ré-export de compat, zéro site touché.
- **Parité « mêmes réponses que claude.ai » PROUVÉE et verrouillée** : même état → même payload JSON
  sur les 8 tools data-aware × 2 personas (exhaustivité de la liste des cas assertée) + preuve
  « AUCUNE donnée changée » (snapshot du store identique après exécution de tous les tools de lecture).

### Correctifs du panel pré-commit (4 agents — 1 CRITIQUE, 3 ÉLEVÉ, 5 MOYEN appliqués)
- `agentLoop` : échec API (réseau/429/529/timeout) → résultat HONNÊTE `stopReason:'error'` (texte déjà
  streamé + historique préservés) + logError, au lieu de rejeter en perdant le travail payé ; réponse
  TRONQUÉE (`max_tokens`) → `'truncated'` + marqueur « [Réponse coupée] » (une phrase coupée en plein
  chiffre n'est plus présentée comme complète) ; refus → `'refused'` ; cap de tours → l'historique se
  clôt par un tour assistant (reprise saine) ; callbacks UI isolés (un bug de rendu ne casse plus la boucle).
- `dispatch` : ceinture try/catch structurelle autour de tout handler (l'invariant « jamais de throw
  vers la conversation » n'est plus supposé) + paramètre injectable pour la tester.
- `appStateProvider` : `apiKeys` EXCLU du snapshot (les vraies clés ne peuvent plus atteindre un
  handler) ; `validateAppStateShape` AVANT normalisation (un store corrompu → erreur claire, jamais
  des zéros plausibles) ; `structuredClone` à la frontière (~1 ms mesuré — « aucune donnée changée »
  garanti structurellement, plus seulement par discipline du moteur).
- Tools stateless convergés sur le chokepoint `jsonContent` (+ garde-scan « jamais de JSON.stringify
  à la main dans un spec ») ; `$schema` méta retiré des schémas envoyés à l'API ; `userFacts`
  (birthYear/canadaArrivalYear) exposés dans get_financial_overview (les calculateurs n'ont plus à
  APPROXIMER l'année de naissance) + carve-out explicite du system prompt.
- **Dérive RÉELLE attrapée par le nouveau test « défauts MCP ≡ défauts store »** : le chemin d'import
  legacy du store omettait `documents` (state.documents undefined au 1er boot) — corrigé.
- Différés au BACKLOG : `[AITOOLS-ENGINE-WORKER]` (tools moteur synchrones sur le thread principal —
  requis avant le branchement UI), `[AITOOLS-HISTORY-BOUND]` (borner l'historique resoumis, coût BYOK).

## [unreleased — chantier Claude-in-app, Lot A : frontière spec/register des tools MCP] — 2026-07-21

### Refactor (préparatoire, zéro changement de comportement)
- **16 tools MCP scindés en `*.spec.ts` (logique pure, browser-safe) + `*.tool.ts` (enregistrement
  serveur mince)** — fondation du chat Claude intégré à l'app (GO Marc 2026-07-21) : la MÊME logique
  servira le serveur MCP (claude.ai) ET le tool-use in-app (SDK Anthropic), garantissant « les mêmes
  réponses que claude.ai ». `ping`/`connect_drive` exclus (trivial / OAuth Node sans équivalent in-app).
- **Preuves verbatim** : parité d'enregistrement MESURÉE (capture par faux serveur, worktree HEAD vs
  courant — 16/16 tools : nom, description, schéma identiques) + suite MCP complète verte (payloads
  inchangés) + garde `noMcpSdkInSpecs` (frontière browser-safe + tools minces ≤ 25 lignes, volume
  prouvé) + 0 cycle d'import dans mcp/tools ; aucun spec n'importe un `.tool.ts`.

## [unreleased — sécurité deps : 0 vulnérabilité npm audit] — 2026-07-21

### Sécurité (dépendances)
- **`npm audit` : 4 → 0 vulnérabilités** (`[DEP-AUDIT-2026-07]`, signalé par Dependabot « 2 high » au push) —
  `brace-expansion` (DoS regex, chaîne eslint) + `js-yaml` (CPU quadratique) via `npm audit fix` ;
  `adm-zip` 0.5→0.6 (alloc 4 Go sur ZIP forgé — usage local = CRÉATION de zip par `mcp/pack.mjs` seulement,
  jamais de lecture non fiable) avec preuve empirique : `npm run mcp:pack` produit un `.mcpb` valide et relisible.

## [unreleased — lot audit n°2 : traçabilité MCP/sync, dettes DRY, durcissements préventifs] — 2026-07-21

### Corrections (restants de l'audit passe n°2 — 1 ÉLEVÉ + 3 MOYEN + 2 LOW)
- **`[MCP-TOOLS-SILENT-CATCH]` (ÉLEVÉ)** — les 6 catch de frontière MCP (`withState`, `runApply`,
  `apply_payslip`) journalisent désormais via `logError` AVANT de rendre la réponse d'erreur à Claude :
  un bug de calcul/état devient traçable dans les logs Cloud Run au lieu d'être introuvable côté serveur.
- **`[SYNC-APIKEYS-SILENT]` (MOYEN)** — l'échec de persistance des clés API au pull Drive (coffre indispo)
  est journalisé (« clés utilisables cette session seulement ») au lieu d'être avalé ; le best-effort est
  préservé (les données sont restaurées quand même).
- **`[DEBT-SUM-DUP]` (MOYEN)** — les 2 derniers reduce locaux de soldes de dettes (`HealthIndicator`,
  `DebtManager`) routés sur la source unique `computeTotalDebt` (garde isFinite incluse).
- **`[MCP-USERTEXT-LANDMINE]` (MOYEN, préventif)** — `USER_TEXT_KEYS` couvre `insurer`/`beneficiary`/
  `destination`/`userNotes` (anti-injection pour de futurs tools) ; `notes` reste RÉSERVÉ au texte
  code-auteur (jamais scrubé/tronqué).
- **`[LOG-TOKEN-ANCHORED]` (LOW)** — le scrub du journal redacte les clés en suffixe `-token`
  (`accessToken`, `refresh_token`, `idToken`), `factor` toujours épargné.
- **`[MCP-RUNPROJECTION-AMBIG]` (LOW)** — description de `run_projection` clarifiée : calculateur
  GÉNÉRIQUE sur paramètres fournis, avec aiguillage vers `get_projection`/`get_retirement_outlook`/
  `simulate_what_if` pour les données réelles.

### Correctifs additionnels du panel adversarial (workflow 17 agents : 14 findings, 4 confirmés, 10 réfutés)
- Les 2 catch clés-API du **PUSH** Drive (chiffrement échoué ; relecture de préservation D5 échouée)
  sont journalisés — ils court-circuitaient le `handleError` englobant, « mes clés ont disparu sur
  l'autre appareil » était indébuggable (et le commentaire du fix pull affirmait à tort que le push
  journalisait déjà — mesuré faux par le panel, corrigé).
- `connect_drive` : 7ᵉ et dernier catch de frontière MCP couvert par `logError` (échecs d'auth
  loopback invisibles).
- `apply_payslip` routé sur `runApply` comme les 4 autres tools d'écriture (il inlinait le même bloc —
  le lot venait d'y dupliquer les logError, et son message lecture-seule avait déjà drifté).

## [unreleased — lot corrections audit : réhydratation, KPI patrimoine, revenu IA] — 2026-07-17

### Corrections (lot audit passe n°2 — 1 CRITIQUE + 2 HIGH)
- **`[STORE-REHYDRATE-SILENT]` (CRITIQUE)** — la réhydratation Zustand a maintenant un filet : `onRehydrateStorage`
  journalise en `critical` tout blob illisible / migration en erreur (avec le PALIER fautif, ex. « v5→v6 ») et
  l'app affiche un toast honnête « tes données n'ont PAS pu être chargées — NE RIEN SAISIR, restaure un backup »
  au lieu de démarrer VIERGE en silence (même classe que l'incident 230 k$, côté local). Le blob localStorage
  reste INTACT (aucune écrasure). 4 tests discriminants.
- **`[DASH-NW-DUP]` (HIGH)** — le KPI « Valeur Nette Globale » du Dashboard ne contourne plus la source unique :
  le repli sans CSV route sur `computePresentNetWorth` (les dettes étaient JAMAIS soustraites — pattern
  MONEY-PHANTOM réapparu), le chemin principal sur `computeTotalDebt` (garde isFinite). Périmètre étiqueté :
  « équité immo incluse » (si immo), « Revenu actif (net, salaire déclaré) ».
- **`[INCOME-3WAY-SPLIT]` (HIGH)** — le snapshot IA/MCP (`buildFinancialSnapshot` → get_financial_overview,
  NextBestAction, prompts Claude) envoie le revenu RÉEL (moyenne des transactions de catégories de revenu, même
  base que l'onglet Budget) au lieu du salaire d'onboarding ; repli honnête étiqueté `monthlyIncomeSource:
  'declared'` sans historique. Les prompts étiquettent « (réel, moyenne des transactions) » vs « (salaire
  déclaré) ». `NextBestAction` consomme le helper partagé (fin du recalcul local divergent).

### Correctifs additionnels du panel pré-commit (5 findings réels, tous appliqués + testés)
- `monthlyCashflow` (overview MCP) partageait l'ANCIENNE base (salaire déclaré) avec le nouveau `monthlyIncome`
  réel → payload auto-contradictoire pour l'IA ; recalculé `max(0, monthlyIncome − monthlyExpenses)`.
- Le repli Dashboard (sans CSV) EXCLUAIT l'équité immo alors que l'étiquette « équité immo incluse » l'affirmait →
  équité (valeur − hypothèque) ajoutée au repli, cohérent avec le chemin principal.
- `get_financial_overview` expose désormais `monthlyIncomeSource` (l'étiquette de provenance manquait au JSON MCP).
- Toasts App : deux refs SÉPARÉS (migration legacy / réhydratation) — un ref partagé avalait l'avertissement
  « NE RIEN SAISIR » précisément quand les deux échecs coexistent (localStorage inaccessible).
- SystemView affiche le statut de réhydratation (chemin distinct de la migration, comme promis par le filet).

## [unreleased — audit financier complet, passe n°2] — 2026-07-16

### Audit
- **Audit financier récurrent (passe n°2)** — rapport daté `docs/AUDIT_FINANCIER_2026-07-16.md` (panel adversarial
  5 agents + batterie déterministe). Cœur AAA confirmé : fiscalité 0 écart sur ~180 valeurs, conservation prouvée
  sur 31 scénarios (résiduel max 0,02 $), 41/41 modules moteur testés, 2661/2661 tests, 0 vulnérabilité. Lot de
  findings de juin fermé à 12/14. Nouveaux findings routés au BACKLOG : 1 CRITIQUE (réhydratation du store sans
  filet d'erreur), 2 HIGH (KPI patrimoine du Dashboard contournant la source unique en repli ; revenu IA/MCP resté
  sur le salaire d'onboarding), plus durcissements MOYEN/LOW. Nettoyage : 4 warnings lint (locales mortes
  `financialSnapshot`, import orphelin) → lint 0 problème.

## [unreleased — a11y : hover conforme sur le rappel de sauvegarde] — 2026-07-16

### Accessibilité
- **`BackupReminder` (variante quota) : le survol du bouton « Sauvegarder » repasse AA** (`[A11Y-BANNER-HOVER-CONTRAST]`) —
  `hover:bg-danger-500` + blanc 12px tombait à 3,76:1 (< 4,5). Le hover FONCE désormais (`hover:brightness-90` = 5,23:1
  mesuré en espace linéaire). Le facteur du fix dépend de la couleur de BASE (`brightness-110`, valable sur info-600,
  aurait échoué ici à 4,48:1) — mesuré, pas copié. Variante warning mesurée conforme, inchangée.

## [unreleased — Futur : la projection révélée reste (reload, page, autre PC)] — 2026-07-16

### Améliorations (Futur)
- **La projection générée RESTE affichée** (`[PROJECTION-PERSIST]`, demande Marc) — la « révélation » (clic
  Calculer/Appliquer) était un état local du composant : un reload ou un aller-retour d'onglet re-demandait un calcul.
  Désormais la signature des entrées révélées est **persistée** (store, synchronisée Drive → autre PC inclus) et la
  courbe s'affiche directement au retour. Quand les hypothèses/données changent : la courbe est **FIGÉE au dernier
  calcul** (blob IndexedDB chiffré, record `revealed`) avec un badge « Pas à jour » + deux boutons — « Recharger avec
  mes données » (recalcule) ou « Rechoisir mes leviers » (retour au composeur) — au lieu de disparaître derrière
  l'écran « Paramètres modifiés » (choix Marc : figer, jamais recalculer en douce). Sur un autre PC sans le blob figé
  (non synchronisé, ~1-2 Mo), repli honnête : courbe live + badge. En mode test, le gel est coupé (aucune vraie donnée
  affichée/écrasée par un persona). KPIs/plan d'action suivent la même source figée (cohérence totale). 7 tests
  discriminants (prouvés rouges sur l'ancien code) + round-trip IndexedDB réel (fake-indexeddb).
  Durcissements issus du panel (code-reviewer + silent-failure-hunter + a11y) : au reload, tant que le moteur n'a pas
  republié → carte « Ta projection se recharge… » honnête (plus jamais de KPIs « 0 $ » affichés avec assurance) ; un
  persona ne peut plus SUPPRIMER le blob figé réel (« Ré-optimiser » gardé mode-test) ; la signature persistée est un
  hash court (pas le JSON complet des params — évite de gonfler localStorage + chaque push Drive) ; écriture IDB
  dédupliquée (plus de réécriture ~1-2 Mo à chaque visite d'onglet) ; focus jamais volé au chargement (garde immune
  StrictMode) ; bordure du bouton secondaire remontée à 3:1 (WCAG 1.4.11).

## [unreleased — Drive : ne plus se reconnecter à chaque reload] — 2026-07-16

### Améliorations (authentification Drive)
- **La session Google Drive survit aux reloads et au-delà de ~1h** (`[AUTH-DRIVE-PERSIST]`, demande Marc) — le jeton GIS
  (`drive.appdata`+`email`, ~1h, sans refresh token) était caché en `sessionStorage` → perdu à la fermeture d'onglet, mort
  à 1h. Désormais : (1) cache en **`localStorage`** (clé dédiée `financeai:gis:token:v1`, **jamais** synchronisée vers Drive)
  → survit reload / fermeture d'onglet / nouvel onglet ; (2) **renouvellement silencieux** avant l'expiration tant que
  l'onglet vit (échec = silencieux, bannière de reconnexion en secours ; jamais de popup au boot). Reste dans l'archi 100%
  navigateur (pas de backend / refresh token).

### Sécurité
- **Déconnexion/suppression Drive propagée entre onglets** — le renouvellement silencieux aurait pu maintenir un 2ᵉ onglet
  « connecté » indéfiniment après une déconnexion faite ailleurs (« sync fantôme post-déconnexion », Loi 25). Un écouteur
  `storage` purge le jeton en mémoire + arrête le renouvellement dès qu'un autre onglet efface la clé jeton (déconnexion OU
  suppression des données Drive) → l'onglet cesse immédiatement de pousser. Findings panel security-privacy + code-reviewer.

## [unreleased — MCP : neutralisation anti-injection des champs texte libres] — 2026-07-16

### Sécurité (MCP connecteur)
- **Champs texte libres neutralisés dans les réponses des tools data-aware** (`[MCP-PROMPT-SCRUB]`) — un nom d'actif
  (auto-rempli depuis Finnhub) ou un payee/catégorie (extrait d'un relevé/PDF de courtage) ressortait BRUT dans le JSON lu
  par Claude → surface d'injection de prompt indirecte. `jsonContent` (`mcp/tools/_dataAware.ts`) applique désormais
  `scrubMcpDeep` : neutralise (strip caractères de contrôle + markup/injection, borne 200 via `sanitizePromptText`) les
  valeurs sous les CLÉS de texte libre utilisateur (`name`/`payee`/`category`/`label`/`employer`/`description`) — les notes/
  verdicts money-critical rédigés par le code (`notes`, `netTaxSettlementsNote`…), les nombres/soldes, les identifiants
  (`symbol` : `^GSPC` préservé) et les clés d'objet restent INTACTS. Central → couvre TOUS les tools data-aware (présents et
  futurs) pour les clés connues. Un nom légitime (« Vanguard S&P 500 ») conservé. Tests discriminants (nom malveillant
  neutralisé ; notes code-auteur intactes au-delà de 200 c.).

## [unreleased — IA : plus de faux « 0 $ » dans les prompts] — 2026-07-16

### Corrections
- **Prompts IA : un montant indisponible n'est plus envoyé comme « 0 $ »** (`[AI-PROMPT-FAKE-ZERO]`, no-fake-data) —
  `roundToHundred` (`services/claude.ts`) retournait `0` pour toute valeur non finie (NaN/Infinity), interpolé nu dans ~27 sites
  de prompts → fabriquait un « 0 $ » plausible plus trompeur qu'un marqueur honnête. Corrigé : `roundToHundred` rend `NaN`
  pour le non-fini, et un helper `promptCad` rend `(non disponible)` (sinon `<arrondi>$`) sur tous les sites d'affichage ;
  `categorizeBatch` émet `amount: null` pour un montant non fini. Pendant `claude.ts` du fix Vague 1 d'`AiAssistant.tsx`
  (qui rendait déjà « — »). Test discriminant.

## [unreleased — correction Budget : navigation de mois + revenus réels] — 2026-07-16

### Corrections
- **Budget : les dépenses réelles se recalculent en changeant de mois** (`[BUDGET-MONTH-NAV]`, bug signalé Marc) — le
  memo des dépenses réelles par poste (`actualsMap`) omettait `periodOffset` (le navigateur de mois) dans ses dépendances
  → naviguer vers un mois précédent laissait les dépenses **figées** sur le mois courant (« ça s'actualise pas »). Corrigé :
  `periodOffset` ajouté aux deps (déjà présent dans les memos voisins revenus/alertes). Désormais : mois passé → dépenses de
  CE mois ; mois courant → dépenses du mois en cours, avec le budget de référence = moyenne des mois pleins passés (tuiles
  KPI, inchangé). Test de régression discriminant (la réel reste figée sur l'ancien code).
- **Budget : les revenus viennent des VRAIES transactions (paie + divers), ventilés** (`[BUDGET-INCOME-REAL]`, bug signalé
  Marc « les revenus semblent pas logiques ») — la tuile Revenus sommait **tous** les positifs (remboursements/retours inclus)
  et coexistait avec le salaire d'onboarding (`config.users[].netSalary`) → deux bases de revenu incohérentes. Corrigé :
  `computeIncomeBreakdown` (`utils/budgetSync.ts`) restreint le revenu aux catégories `Salaire` (paie) et `Revenus divers`,
  exclut transferts/doublons/positifs non-revenu, et **ventile** salaire vs divers (sous-libellé de la tuile). Le badge
  Excédentaire/Déficitaire et le diagnostic IA raisonnent désormais sur ce revenu réel (moyenne des mois pleins passés),
  plus sur le chiffre saisi à l'onboarding. La carte « Santé Financière » garde le salaire brut déclaré (nécessaire à la
  décomposition brut→déductions→net) et est explicitement étiquetée « (salaire déclaré) ». `computeMonthlyActualAverages`
  expose `salaryAvg`/`otherAvg` (ripple bénéfique sur TaxCenter + MCP `get_tax_situation` : revenu réel = catégories de
  revenu, hors remboursements). Tests discriminants (2500 vs 2600 ancien ; ventilation salaire/divers).

## [unreleased — durcissement MCP : concurrence d'écriture] — 2026-07-16

### Robustesse (MCP connecteur)
- **Écritures MCP protégées par jeton de version (OCC)** (`[MCP-WRITE-VERSION-TOKEN]`) — deux tool-calls MCP concurrents
  partant du même état en cache ne peuvent plus s'écraser silencieusement (last-writer-wins). Chaque lecture d'écriture
  porte un jeton (`updatedAt` du blob Drive) ; `save` refuse si la version stockée a bougé depuis. Additif : les tools de
  lecture sont inchangés ; le fichier local (stdio mono-processus) n'est pas concerné. Discriminant prouvé.

## [unreleased — VAGUE 4 « a11y : boutons ghost/outline »] — 2026-07-16

### Accessibilité
- **Boutons d'action secondaires : bordure conforme WCAG 1.4.11** (`[A11Y-BORDER-PROMINENCE-SWEEP]`, partiel) — 12 boutons
  custom (hors composant `Button`) qui gardaient une bordure `white/10`-`/15` (quasi invisible) passent à `white/40`
  (~3,8:1, même valeur mesurée que le composant Button) : TaxCenter, AiAssistant, Investments, Dashboard, réglages Drive,
  modal de conflit sync, carte cliquable Budget. Les champs `<input>`/`<select>`, toggles à état et dropzones restent à
  traiter dans une passe dédiée par type (interaction avec les états focus/actif).
- **Bordure des boutons `ghost`/`outline` conforme WCAG 1.4.11** (`[A11Y-GHOST-BUTTON-PROMINENCE]`) — la limite de ces
  boutons était à `white/10`-`/15` (~1,2-1,6:1 sur fond sombre, quasi invisible) ; passée à `white/40` (~3,8:1, mesuré),
  la bordure — seule affordance de ces variants — atteint le seuil de contraste non-texte ≥3:1. Corrige tous les usages
  d'un coup (composant de design-system). Aucune régression du texte (`ink-100` inchangé, ≥4,5:1).

## [unreleased — VAGUE 4 « outillage a11y »] — 2026-07-16

### Outillage
- **`check-contrast` lit désormais les tokens depuis `tailwind.config.js`** (`[A11Y-CHECK-CONTRAST-DRIFT]`) — le
  script re-codait des valeurs de couleurs PÉRIMÉES (surface/primary d'une ancienne palette) → il testait des combos
  inexistants (protection nulle). Il dérive maintenant les tokens de la config (source unique), exclut les surfaces de
  l'ensemble « texte », ne teste que les HEX opaques, et refuse de « passer à vide » (garde bg≥3 / text≥8). Aucun impact
  runtime (script CLI).

## [unreleased — VAGUE 3 « durcissement sync : timeout réseau »] — 2026-07-16

### Robustesse
- **Timeout sur tous les appels Google/Drive** (`[SYNC-FETCH-TIMEOUT]`) — `withDriveTimeout` (AbortController, 20 s)
  enveloppe chaque requête de `driveAppData.ts`, **lecture du corps comprise** (`res.json()` dans le budget) : un réseau
  lent/bloqué — y compris un corps de réponse qui stalle en cours de téléchargement — lève désormais une `DriveError`
  explicite au lieu de faire PENDRE `readDrive`/`fetchUserIdentity` indéfiniment. `clearTimeout` garanti, dégrade
  proprement sans `AbortController`. Volet `keepalive` écarté : `fetch keepalive`/`sendBeacon` plafonnés à 64 Ko, en deçà
  du payload sync réel.
- **`gateSilentResume` : erreur Drive post-jeton rendue visible** — quand un jeton valide est en cache mais que Drive est
  injoignable (ex. timeout), l'erreur est maintenant journalisée + publiée (`status.error`) au lieu d'être avalée en
  silence, qui renvoyait l'utilisateur au login sans aucune trace (symétrie avec `runBootSync`).

## [unreleased — VAGUE 3 « fondation sync : ARCH-SYNC-SPLIT »] — 2026-07-15

### Refactor (comportement inchangé)
- **`syncOrchestrator.ts` scindé en 9 modules à responsabilité unique + barrel de compat** (`[ARCH-SYNC-SPLIT]`) — le
  fichier de 892 lignes (siège des 2 incidents de sync de juillet, dont la perte de 230k$) est éclaté par responsabilité :
  `syncStatusStore` (propriétaire UNIQUE de l'état de statut, racine du graphe de dépendances), `syncTypes`, `syncSnapshot`
  (snapshot local + helpers purs), `syncErrors`, `syncMeta`, `syncPush`, `syncPull`, `syncLifecycle` (décision anti-clobber),
  `syncPolling`, `syncPassphrase`. Déplacements **verbatim** : l'API publique historique est préservée par le barrel
  `syncOrchestrator.ts` → aucun site appelant (App, composants, tests, MCP) n'a bougé. Invariants vérifiés : un seul `_status`
  dans tout le repo, la double-ceinture de désinfection persona (push + pull) intacte et non fusionnée, zéro cycle d'import.
  Prépare les durcissements sync à venir (`SEC-DRIVE-ENCRYPT-DEFAULT`, `MCP-WRITE-VERSION-TOKEN`, `SYNC-FETCH-TIMEOUT`).

## [unreleased — VAGUE 4a « périphérique : sécurité Vision + nettoyage »] — 2026-07-15

### Sécurité / vie privée
- **Clause anti-injection sur les prompts Vision** (`[SEC-VISION-CONSENT-INJECTION]`) — un relevé/paie (image/PDF)
  peut contenir du texte adversarial lu par le modèle ; `VISION_INJECTION_GUARD` (dans les 2 prompts Vision) le traite
  comme donnée, jamais comme instruction. Extraction Vision passée en `temperature: 0` (déterministe). + **avis de
  confidentialité explicite** (Loi 25) sur les **3 surfaces** qui envoient un document brut à Anthropic (relevé bancaire
  + les 2 uploads de fiche de paie) : montants, nom, employeur, n° de compte quittent l'appareil — un CSV reste 100 % local.
- **Backups IndexedDB : rejets asynchrones journalisés** (`[BACKUP-PROMISE-CATCH]`) — `return await` sur `createBackupNow`
  ET ses 3 fonctions sœurs (`listBackups`/`deleteBackup`/`clearAllBackups`) → un échec async (quota, tx.onerror) repasse
  par le catch (logué + repli) au lieu de fuir non journalisé (corrige un spinner infini du bouton « Backup maintenant »).
  Discriminant git-stash prouvé.

### Nettoyage
- Code mort retiré (`[DETTE-DEADCODE-2026-07]`) : locales `_`-préfixées inutilisées (Budget, RealEstate, AiAssistant).

## [unreleased — VAGUE 3a « rappel d'import de relevé »] — 2026-07-15

### Ajouté
- **Rappel proactif « relevé du mois manquant »** (`[UX-STATEMENT-REMINDER]`) — bannière dans l'onglet Budget quand
  aucune transaction réelle n'existe pour le mois courant (relevé de compte probablement pas encore importé) : le rituel
  d'import mensuel n'avait aucun filet (c'est ce qui a laissé la fuite de données de persona invisible des semaines).
  Dismissable par mois (réapparaît le mois suivant si toujours en retard), CTA vers l'onglet Transactions.

## [unreleased — VAGUE 2 « fiscal money-critical » : assiette emploi vs imposable + MCP v0.7.3] — 2026-07-15

> `[FISC-PAYROLL-BASE-INVEST]` + `[TAX-APP-MCP-BASE]`. Panel 4 agents (financial-integrity, projection-validator,
> code-reviewer, silent-failure-hunter). ⚠️ Redéploiement Cloud Run requis (v0.7.3).

### Corrigé
- **Cotisations RRQ/RQAP/AE sur le SALAIRE seul** — l'onglet Impôt calculait RRQ/RQAP/AE sur *salaire + revenu de
  placement estimé* → cotisations surévaluées quand le salaire est sous les maximums (RRQ ~74,6 k, AE ~68,9 k,
  RQAP ~103 k). `calculateFiscalReport` sépare désormais l'assiette d'EMPLOI (cotisations) de l'assiette IMPOSABLE
  (paliers d'impôt). **Mesuré : ~1 016 $/an de cotisations surévaluées corrigées** sur un profil salaire 50 k +
  230 k non-enregistré. Rétrocompat bit-identique pour le moteur de projection (aucun changement de conservation).
- **App ↔ MCP alignés** — `get_tax_situation` (MCP) et l'onglet Impôt utilisent maintenant le MÊME helper d'estimation
  du revenu de placement (`services/taxEstimate.ts`) → mêmes chiffres. Le MCP inclut désormais le placement imposable
  dans l'assiette (`taxableInvestmentIncome` exposé), et `averageRatePct` porte sur l'assiette imposable réelle.

### Tests
- `tests/services/taxPayrollBase.test.ts` (discriminant git-stash prouvé : sur-cotisation 1 016 $ → 0 sans le fix) +
  test MCP `[TAX-APP-MCP-BASE]` (placement imposé, cotisations sur salaire, cohérence averageRatePct). Suite complète verte.

## [unreleased — Vidage BACKLOG en vagues, VAGUE 1 « confiance quotidienne » + MCP v0.7.2] — 2026-07-15

> Plan PM validé par Marc (« go tout sans t'arrêter »). Vague 1 = 6 items S à impact quotidien, panel 6 agents.

### Ajouté
- **`get_holdings` (MCP v0.7.2)** — tool lecture seule listant les positions individuelles (symbole, nom, quantité,
  prix natif, devise, **valeur CAD** via `assetValueCad`, compte, rendement), triées, avec total et ventilation par
  compte. Répond à « qu'est-ce que je détiens ». ⚠️ Redéploiement Cloud Run requis.
- **Nudge CELI** (`[CELI-ASSET-NUDGE]`) — bannière discrète dans Investissements quand des virements CELI/TFSA sont
  détectés mais qu'aucun avoir CELI n'est saisi (CELI affiché 0 = patrimoine sous-estimé). NO-fake-data : le montant
  viré est un contexte, jamais un solde ; masqué en mode discret (`PrivateAmount`).

### Corrigé
- **`[DETTE-PDF-FX-BYPASS]`** — le PDF (`buildHoldingsRows`) ET `useDerivedFinancials` (2ᵉ instance latente révélée par
  le garde resserré) calculaient `quantité × prix × fx` à la main (repli 1:1 muet, classe de l'incident FX des 230 k$) →
  routés par la source unique `assetValueCad` ; garde `assetFxGuard` resserré (interdit désormais le `fx`/`factor` nu).
- **`[MCP-FRESHNESS-PRECISION]`** — la note de fraîcheur MCP affiche heures + minutes sous 48 h (« 4 h 40 » au lieu de
  « 5 h »), et corrige un double-arrondi.
- **`[DETTE-TOLOCALESTRING-NU]`** — 6 sites `toLocaleString()` nus (contexte IA + log fiscal) rendaient « NaN » / format
  en-US hors navigateur → `formatNumber`/`formatCAD` (fr-CA, NaN → « — »).

### Tests
- Routage `pickProvider` (crypto→CoinGecko / action→Finnhub, `[DETTE-TESTGAP-MARKETDATA]`), `get_holdings` (tri, FX,
  ventilation, vide), fraîcheur heures+minutes, nudge CELI (détection, seuil, garde NaN, NO-fake-data). Suite complète
  verte (2598 tests), typecheck + lint clean.

## [unreleased — Chaîne de vérité du revenu : paie → Impôt détaillé → Santé + MCP v0.7.1 (`[INCOME-PROVENANCE]` + `[TAX-DETAIL]`)] — 2026-07-15

> Demandes Marc : « la santé financière doit dépendre seulement de mon onglet impôt et l'onglet
> impôt dépend seulement des fichiers de paie que je lui mets, qui doit être unique… je veux que
> l'onglet impôt soit plus détaillé plus précis et que je vois exactement ce que je gagne et
> dépense et ce genre d'info doit être dans le mcp aussi ». ⚠️ Redéploiement Cloud Run requis (0.7.1).

- **Provenance du salaire (source unique)** : `User.salarySource` (additif) estampillé par le scan
  de paie de l'onglet Impôt (« Calcul rapide », nom du fichier) ET par `apply_payslip` MCP (champ
  `employer`, estampillé seulement si un montant change). Bannière dans l'onglet Impôt : « Revenu
  basé sur la fiche de paie X appliquée le Y — la Santé financière et le Budget utilisent ce même
  revenu » (avertissement si saisie manuelle). La Santé lit déjà `config.users[].netSalary` (la
  valeur que la paie écrit) — chaîne documentée dans HealthIndicator.
- **Onglet Impôt détaillé** : carte « Ce que tu gagnes » (brut → impôt fédéral après abattement,
  impôt QC, RRQ volets 1+2, RQAP, AE → net annuel + mensuel, taux moyen) + carte « Ce que tu
  dépenses » (réel des transactions : revenus/dépenses/solde mensuels moyens sur mois pleins +
  écart net fiscal ↔ revenus réels — mêmes chiffres que le Budget, source unique `budgetSync`).
- **MCP v0.7.1** : `get_tax_situation.perUser` += `withholdings` (féd/QC/RRQ/RQAP/AE), `netMonthly`,
  `salarySource` ; nouveau bloc `realMonthlyAverages` (réel des transactions). `apply_payslip` :
  `.finite()` sur les montants (règle D9) + `employer`.

---

## [unreleased — Budget mensuel : réel revenus+dépenses, budget = moyenne du passé (`[BUDGET-MONTHLY-LEDGER]` + `[BUDGET-PAST-AVG]`)] — 2026-07-15

> Demandes Marc : « chaque mois, je devrai avoir le réel de dépenses et revenus pour ce mois ci,
> et pour le mois en cours le budget devrait être la moyenne de tout le passé », « je vois 0 en
> revenus ça marche pas », « j'ai un truc budget et dépenses et ça a l'air d'être le même ».

- **Grand livre mensuel (12 mois)** (`buildMonthlyLedger`) : la table du Budget montre désormais
  le RÉEL par mois — lignes de REVENUS (par catégorie, « Autres revenus » pour les positifs à
  classer) ET de DÉPENSES + Total revenus / Total dépenses / Solde. Le mois courant est marqué
  « (en cours) » et EXCLU des moyennes (un « — » en revenus au mois courant = relevé de compte
  pas encore importé, pas un bug — note explicite sous la table).
- **Budget du mois en cours = moyenne de TOUT le passé** : cibles AUTO (`autoTarget`, champ
  additif) = moyenne mensuelle sur tous les mois PLEINS d'historique, recalculée à chaque
  chargement ; éditer une cible à la main DÉCROCHE la gestion auto. Tuiles KPI : le « prévu »
  = moyenne passée (× fenêtre), plus jamais la somme des cibles.
- **Tuiles dédupliquées** : « Budget » et « Dépenses » affichaient les MÊMES chiffres →
  remplacées par Revenus / Dépenses (budget = moy. passée) / Fin de mois (projection au rythme
  actuel, vue MOIS seulement — hors MOIS elle re-dupliquerait Dépenses) / Restant (réels).
- **Findings panel intégrés (2 agents)** : décrochage auto sur édition de FRÉQUENCE (sinon cible
  mensuelle réécrite sous une fréquence Yearly = ÷12 silencieux) ; bucket « Autres / non
  classées » côté dépenses du grand livre (Σ lignes ≡ Total, prouvé par test) ; refresh des
  cibles auto AUSSI en cours de session (import CSV après chargement) ; moyenne du grand livre
  = run-rate sur mois couverts (plus jamais 2 400 $ affiché à côté d'une cible de 400 $) ; badge
  neutre quand aucun mois complet ; garde anti-transactions futures ; traces logError.

---

## [unreleased — Catégories de transactions par règles + Budget aligné (`[TX-CATEGORY-RULES]` + `[BUDGET-TX-CATEGORIES]`)] — 2026-07-15

> Demandes Marc : « les catégories des transactions sont très mal réglées » + « dans mon onglet
> budget je veux seulement et exactement les meme catégories que dans transactions, et je veux
> voir l'historique par rapport a ces catégories ».

- **`services/import/categoryRules.ts`** : catégorisation DÉTERMINISTE par règles sur le payee
  (corpus réel : ~88 % de couverture mesurée sur 1 995 transactions extraites de 37 relevés
  Desjardins). Jeu canonique de 16 catégories (`RULE_CATEGORIES`). Gratuit, instantané,
  reproductible — l'IA (clé Anthropic) ne sert qu'EN SECOURS sur le reste.
- **Branchée partout** : import CSV (`parseBankCsv`, si pas de colonne catégorie), bouton
  « Auto-catégoriser » (passe règles AVANT l'IA — ce que les règles classent ne coûte aucun appel
  API), import MCP (`apply_bank_statement` — cohérence app↔MCP), listes de catégories disponibles
  (manuel + `allowed` IA) enrichies du jeu canonique (utile budget vide post-purge).
- **Budget = exactement les catégories des transactions** (`utils/budgetSync.ts` + effet
  `Budget.tsx`) : postes manquants AJOUTÉS (cible suggérée = médiane mensuelle 6 mois,
  modifiable), postes sans aucune transaction RETIRÉS — retraits à la PREMIÈRE passe du montage
  seulement (un poste créé à la main survit le temps d'y affecter des transactions — œuf-et-poule
  avec le menu de catégories). Idempotent, no-op sur transactions vides.
- **Historique par catégorie (12 mois)** : nouvelle table dans Budget — dépenses mensuelles par
  catégorie (hors transferts/doublons), moyenne par mois actif, lignes = exactement les
  catégories des transactions. Région défilante focusable + caption sr-only (panel a11y).
- **Findings panel intégrés (4 agents)** : cible suggérée = MOYENNE sur fenêtre 6 mois (zéros
  inclus — la médiane des mois actifs aurait projeté un voyage ponctuel de 2 400 $ en
  28 800 $/an) ; postes flou-rapprochables RENOMMÉS (réglages préservés) au lieu de
  supprimés/recréés ; « Impôts » exclu des postes (revenu projeté déjà net) ; « Logement »
  reconnu par la détection de loyer (projection + Retraite + réplique de parité — sinon défaut
  1 600 $) ; retraits limités à UNE passe par CHARGEMENT d'app (flag module — un ref composant
  se ré-armait à chaque changement de sous-onglet) + trace durable logError des retraits/renommages ;
  règle « Interac vers une personne » AVANT les enseignes (un destinataire nommé Bell/Wendy/Brunet
  ne tombe plus en Abonnements/Restaurants/Santé) ; SAAQ avant ASSURANCE ; INTERET SUR/INTEREST ON
  (jamais le mot nu) ; \bGRILL\b/PROVISIONS ancrés.

---

## [unreleased — Purge des données de persona de test (`[PERSONA-PURGE]`)] — 2026-07-15

> Incident Marc : « j'ai des fausses transactions sans doute des profils de test je veux plus que ça
> arrive jamais » — ~600 transactions du persona « Karim » (persona-tx-*) + son objectif « Indépendance
> financière (1 M$) » (kar-fg1) retrouvés MÉLANGÉS aux ~200 vraies transactions. Défense en profondeur.

- **`services/testPersonas/artifactIds.ts`** : registre AUTONOME (boot-safe, zéro fixture importée) de
  tous les ids d'artefacts de persona — préfixes générés (`persona-tx-`, `test-tx-`, `test-asset-`) +
  ~100 ids exacts de fixtures. Parité registre↔fixtures VERROUILLÉE par test-scan (un futur persona à
  id non enregistré = test rouge) ; zéro collision avec les ids réels (timestamps, `cat_/debt_/rule_`,
  `child_1`/`main_property` — vérifié, y compris les voisins `child-1`/`re-1`).
- **`services/personaSanitizer.ts`** : purge PURE et chirurgicale par id (19 tranches tableau +
  `childGoal` singulier) + variante enveloppe persist (`sanitizePersistEnvelope`, skip en mode test).
- **6 points d'ancrage** — un état RÉEL ne peut plus jamais contenir/propager un artefact de persona :
  self-heal au BOOT (App.tsx, backup IndexedDB PRÉ-purge puis toast — finding panel sécurité), sortie
  du MODE TEST (snapshot désinfecté, y compris les singuliers childGoal/weddingGoal — bug de spread
  attrapé par le panel), PUSH Drive (ceinture dans `getLocalPayload`), PULL Drive (`applyPulledPayload`
  — une vieille copie Drive ne ré-injecte plus la pollution), RESTAURATION de backup (`restoreBackup`),
  et **lecture MCP** (`mcp/state/stateStore.ts` — un blob historique pollué n'est plus résumé à Claude
  ni re-perpétué par les écritures ; trou structurel trouvé par le panel).
- **Échecs silencieux corrigés au passage** (panel) : backup illisible à la restauration désormais
  journalisé (cause d'« état vide au reboot » enfin visible) ; échec du backup pré-purge journalisé
  (le rejet async d'IndexedDB ne remonte PAS au catch interne de `createBackupNow` — piège documenté).
- **Tests** (`personaSanitizer.test.ts` 26 + `stateStorePurge.test.ts` 2 + preuves POSITIVES push/pull
  dans `syncOrchestrator.flow.test.ts`) : parité fixtures↔registre (volume prouvé : 7 personas, 100+
  ids scannés), direction anti-faux-positif (ids réels jamais flaggés, voisins immédiats inclus),
  pureté/no-op même référence, intégration store (purge idempotente, no-op en mode test, snapshot
  pollué désinfecté, singulier childGoal), pushNow/pullNow sur payloads réellement pollués.

---

## [unreleased — Connecteur MCP v0.7.0 : ajout de dettes (`[MCP-APPLY-DEBT]`)] — 2026-07-15

> Demande Marc : « rajouter des dettes avec mcp genre achat de voiture ». ⚠️ Redéploiement Cloud Run requis.

- **`apply_debt`** : ajoute une dette RÉELLE (prêt auto, carte, perso, marge) ou MET À JOUR la dette
  existante du même nom — mise à jour PARTIELLE : seuls les champs fournis changent (jamais forcer
  l'IA à ré-inventer un solde/taux qu'elle n'a pas — finding panel), idempotent au retry, jamais de
  doublon. La description avertit qu'un MÊME nom = écrasement (dette différente → nom distinctif).
  Catégorie inférée du nom si absente (auto → Car, études → Student, carte → CreditCard, sinon
  Personal ; accents strippés, mots courts ancrés — « Chargex »/« recharge » ne matchent plus `char`).
- **Sûreté** : bornes anti-injection (D9 : solde ≤ 50 M$, taux ≤ 100 %, paiement ≤ 1 M$/mois,
  amortissement ≤ 50 ans) + gardes non-fini côté MÉTIER (un appel direct du handler bypasse Zod —
  leçon MCP-WHATIF) ; rejet = throw AVANT toute écriture (jamais de dette partielle). Sauvegarde
  Drive horodatée avant écriture (infra `runApply` + backup v0.6.0).
- **Sémantique moteur explicitée** : les dettes n'ont pas de date de début (servies dès le mois 0) →
  le tool est réservé aux dettes DÉJÀ CONTRACTÉES ; sa description route les achats FUTURS/
  hypothétiques vers `simulate_what_if` (garde-fou `[MCP-WHATIF-DATED-DEBT]`).

---

## [unreleased — Cours actualisés en continu (`[PRICE-REFRESH-LIVE]`)] — 2026-07-14

> Suite directe d'ASSET-FX-DISPLAY : même convertis, les prix restaient FIGÉS à leur valeur d'ajout
> (dérive mesurée ~20 k$ vs courtier). Les cours se rafraîchissent désormais.

- **`services/priceRefresh.ts`** : `refreshAssetPrices` — quotes live via la source unique `getQuote`
  (Finnhub/CoinGecko, cache 5 min), SÉQUENTIEL espacé 2 500 ms (≈24/min, sous la limite du provider le
  plus strict — jamais de `Promise.all`, leçon PERF-BOOT-RATELIMIT). Gardes : prix NATIF only (la
  conversion reste à l'affichage via `assetValueCad`), devise protégée (quote ≠ devise stockée → skip),
  couverture honnête (symbole non quotable → skip motivé, jamais de prix inventé). `applyPricePatches`
  fusionne par symbole sur l'état COURANT (anti-course : un pull Drive/une édition pendant le refresh
  n'est pas écrasé).
- **Au boot** (App.tsx) : refresh automatique après l'hydratation d'historique, sauté en mode test.
- **Bouton « Actualiser les cours »** (Investissements → Détail) : état busy, horodatage « Cours mis à
  jour : … », toast récapitulatif (X mis à jour · Y non couverts par le fournisseur, symboles nommés).
- **`Asset.priceUpdatedAt`** : champ additif optionnel (aucun bump de migration).
- **Panel adversarial (3 agents) — findings intégrés** :
  - **[ÉLEVÉ, racine] `inferCurrency` Finnhub ignorait les SUFFIXES** (`CW8.PA` → étiqueté USD) → la
    garde de devise aurait skippé à tort TOUTE la poche EUR en « currency-mismatch » (jamais
    rafraîchie). Fix : mapping des suffixes (.PA/.TG/.DE… → EUR, .TO/.V → CAD, .L → GBP), discriminant
    git-stash prouvé.
  - **[ÉLEVÉ] anti-churn** : un quote au prix IDENTIQUE ne produit plus de patch (sinon
    `priceUpdatedAt` seul changeait le hash → push Drive à chaque boot + CONFLITS FANTÔMES entre
    2 appareils sur le mécanisme anti-clobber).
  - **[ÉLEVÉ] fréquence inter-passes** : mutex module (boot et bouton sérialisés) + passe non forcée
    sautée si < 5 min depuis la dernière (anti-spam reload) ; les symboles sans provider sont skippés
    SANS consommer de pacing (un boot sans clé Finnhub ne dort plus (N−1)×2,5 s pour rien).
  - Garde MODE TEST sur le bouton (les prix de fixtures persona ne sont plus écrasables) ; try/catch
    par itération (une exception ne jette plus le progrès des autres symboles) ; `performance`
    recalculée au moment de l'APPLICATION (édition concurrente du prix d'achat respectée) ; devise
    REVALIDÉE à l'application (patch abandonné si elle a changé pendant la fenêtre) ; self-heal de la
    devise d'un actif legacy depuis le quote ; date affichée via `formatDate` (convention repo).

---

## [unreleased — Patrimoine affiché en VRAIS dollars CAD (`[ASSET-FX-DISPLAY]`, money-critical)] — 2026-07-14

> Incident élucidé : « je devrais pas avoir 230k » — en fait SI. Les prix des actifs sont stockés en
> devise NATIVE (USD/EUR/CAD) et 6 surfaces UI les sommaient SANS conversion → l'app affichait
> 160 352 « $ » (69 k USD + 84 k EUR + 7 k CAD additionnés bruts) au lieu de ~230 k$ CAD réels.
> Le connecteur MCP (fx-correct) donnait le bon chiffre — pris à tort pour un bug. Courtier : ~250 k$
> (l'écart restant = cours périmés → `[PRICE-REFRESH-LIVE]` au BACKLOG).

- **`assetValueCad`** (`services/portfolio.ts`) : source UNIQUE de la valeur CAD d'un actif (prix natif ×
  `toCurrencyFactor` + garde NaN/Infinity) ; `computeAssetBreakdown`/`computeInvestmentsValue` routés dessus.
- **5 surfaces corrigées** : `NetWorthByOwnerCard`/`netWorthByOwner` (signature + fxRates), allocation de
  la page Investissements (valeurs, poids, dividendes annuels désormais en CAD), fallback patrimoine du
  Dashboard, gains $ par position du Dashboard (le % reste un ratio natif), `HealthIndicator`,
  `AssetLocationCard`. Les stats DCA repassent par le prix NATIF de l'actif (plus de dérivation depuis
  la valeur CAD — mélange de devises évité).
- **`csvExport`** : colonne `Value` documentée NATIVE par ligne (la colonne `Currency` la qualifie).
- **Garde anti-récidive** : `tests/services/assetFxGuard.test.ts` scanne le code (volume prouvé, commentaires
  strippés) et interdit toute multiplication `quantity × currentPrice` sans fx sur la ligne. Discriminant
  git-stash prouvé (4 tests échouent sur l'ancien code).
- **Panel adversarial (3 agents) — findings intégrés** : repli FX 1:1 et actif corrompu/sans devise désormais
  JOURNALISÉS (`logErrorThrottled`, patron HARDEN-NETWORTH-NAN — le repli muet « fxRates vide → facteur 1 »
  était le bug lui-même) ; panneau DCA d'Investments : coût moyen/gain total convertis en CAD à l'affichage
  (ils étaient natifs sous une étiquette $ CAD — gain sous-affiché ~33 % sur un titre EUR) ; `TaxCenter`
  routé sur `assetValueCad` (3e implémentation locale de la conversion éliminée).

---

## [unreleased — Connecteur MCP v0.6.0 : verdicts honnêtes + écriture Drive sûre + fraîcheur] — 2026-07-14

> Fixes des 4 items MCP de l'audit adversarial (12 agents) des réponses claude.ai. ⚠️ **Nécessite un
> redéploiement Cloud Run** (`mcp/deploy.sh`) pour être actif sur claude.ai.

### `get_retirement_outlook` — verdict de retraite honnête (`[MCP-RETIREMENT-VERDICT]`, money-critical)
- Le revenu de retraite expose désormais le **décaissement du portefeuille** (`portfolioWithdrawals` :
  retraits REER/CELI émis par le moteur, + loyers), moyenne mensuelle de la 1re année, déflatée par point.
- `meetsIncomeTarget` est basé sur la **soutenabilité du plan** (`minNetWorth > 0` sur tout l'horizon,
  + Monte Carlo ≥ 85 % si demandé) — plus jamais « revenu sous la cible » pour un plan autofinancé à
  MC 98 % (l'ancien verdict comparait les rentes publiques SEULES à la cible).
- Mesuré : le décaissement non-enregistré/liquide n'a pas de champ moteur → sommer les revenus
  sous-estime structurellement (note explicite dans la réponse).

### `get_tax_situation` — impôt PAR CONJOINT (`[MCP-TAX-COUPLE]`, money-critical)
- Calcul par contribuable puis somme (fiscalité canadienne individuelle, aligné moteur
  `taxDecember.ts`) ; `marginalRatePct` = marginal du conjoint au plus haut revenu ; détail `perUser`.
- Discriminant prouvé : couple 60k/60k → ~22 126 $ / 36,1 % (l'ancien code fusionnait → 33 435 $ / 45,7 %).

### Écriture Drive sûre (`[MCP-PAYSLIP-BACKUP]`, money-critical)
- `DriveStateSource.saveState` crée un **backup Drive horodaté** (`financeai-sync.json.<ISO>.bak.json`,
  rolling 5, appDataFolder) AVANT tout écrasement — FAIL-CLOSED (backup impossible → écriture refusée).
- **Garde de concurrence** : si l'app a synchronisé entre la lecture et l'écriture (`updatedAt` a avancé),
  le write est refusé (rien d'écrasé) et le cache d'état est invalidé → le retry relit l'état frais.
- `backupPath` renvoyé par les tools `apply_*` est désormais RÉEL côté Drive (spec tenue).
- `driveAppData` : helpers génériques `createAppDataFile`/`listAppDataFiles`.

### Fraîcheur des données (`[MCP-STALE-FRESHNESS]`)
- `mcp/state/freshness.ts` + note automatique sur CHAQUE réponse data-aware : date/âge du blob Drive ;
  au-delà de 6 h → avertissement « possiblement périmées — ouvre l'app pour pousser » (incident
  2026-07-14 : le MCP servait 5 732 $ pendant que l'app locale portait 160 k$+ jamais poussés).

### `get_projection` + `simulate_what_if` — étiquette fiscale honnête (`[PROJ-TAXPAID-LABEL]`, surface MCP)
- `totalTaxesPaid` → `netTaxSettlements` (+ `netTaxSettlementsDelta` dans le what-if) + note : ce compteur
  n'agrège que les régularisations d'avril (négatif = remboursements REER), PAS l'impôt total payé.
  Reliquat moteur (clamp taxLeakage MC) au BACKLOG.

### Panel adversarial (3 agents) — findings intégrés
- **[ÉLEVÉ] `successProbabilityPct` était le FVI, pas la survie** : `result.successRate` moteur est ÉCRASÉ
  par le FVI (score composite) quand MC tourne (`projection.ts` V65) → un plan à 50 % de survie réelle
  pouvait afficher « 85 % ». Fix : champ moteur ADDITIF `survivalRatePct` (survie brute, monteCarlo.ts:92)
  + les tools MCP l'utilisent (verdict retraite ≥ 85 % ET `successProbabilityPct`). `successRate`/UI inchangés.
- **[ÉLEVÉ] Race multi-sessions sur la garde de concurrence Drive** : writes sérialisés (mutex processus),
  refus de conflit + échec de pruning JOURNALISÉS (plus de catch muet) ; reliquat `[MCP-WRITE-VERSION-TOKEN]`.
- **[MOYEN] Verdict retraite** : min du patrimoine sur la PHASE RETRAITE (`minRetirementNetWorth`) au lieu
  du min global (faux négatif sur creux d'accumulation) ; cas « house-rich cash-poor » couvert par MC (défaut on).
- Garde `Number.isFinite` sur le déflateur (NaN amplifié par la moyenne 12 mois) ; tests fail-closed backup,
  invalidation du cache store sur conflit, et survie MC 0-100 ajoutés.

---

## [unreleased — Intégrité des données Drive : anti-perte STRICT + gate hard-block] — 2026-07-14

### Sync Google Drive — plus JAMAIS d'écrasement automatique du local réel (`[SYNC-ANTI-CLOBBER]`)
> Contexte : Marc a perdu 230k$ de placements — appareil silencieusement déconnecté (jeton expiré → aucun push),
> puis reconnexion → `pull` qui a écrasé le local avec une vieille copie Drive (SPCX seul). Récupéré via auto-backup.
- **`decideOnLoad` sans exception `restoreIntent`** (`services/sync/syncEngine.ts`) : une seule garde anti-perte —
  local vide → pull (restaure) ; local RÉEL + Drive divergent → `conflict` (choix utilisateur), jamais d'écrasement
  silencieux. Retrait du champ `restoreIntent` de `DecideOnLoadInput` et des 3 appelants (connect/gate/boot).
- **`SyncConflictModal`** (`components/sync/SyncConflictModal.tsx`) : résolution de conflit GLOBALE (montée au niveau
  App, surgit au premier plan quel que soit l'onglet), avec résumé « cet appareil vs Drive » (nb placements/transactions
  + date Drive) pour un choix éclairé ; « Restaurer depuis Drive » (destructeur) protégé par une confirmation.
- **`SyncStatusBanner`** (`components/sync/SyncStatusBanner.tsx`) : bandeau rouge in-flow dès que déconnecté-avec-données
  ou push en erreur, avec bouton Reconnecter/Réessayer (« propose de me connecter dès que je ne le suis pas »).
- **`flushPush`** (`services/sync/syncOrchestrator.ts`) : flush du push en attente au `visibilitychange hidden`/`pagehide`
  → le dernier changement atteint Drive avant que Marc parte parler à Claude (sinon le MCP lit une copie périmée).
- **Gate HARD-block** (`components/auth/LoginGate.tsx`) : pas d'accès tant que non connecté à Drive ; trappe d'urgence
  révélée seulement après un échec de connexion (+ `?nogate=1`). Requiert `VITE_GOOGLE_GATE=1` sur Vercel.
- Tests : discriminant git-stash prouvé (reconnexion + local réel + Drive divergent → `conflict`, local NON écrasé —
  échoue sur l'ancien code) ; `summarizeForConflict` (pur) ; matrice `decideOnLoad` mise à jour.
- Suite : audit des 6 alertes claude.ai routé au BACKLOG (`MCP-RETIREMENT-VERDICT`, `MCP-PAYSLIP-BACKUP`, `MCP-TAX-COUPLE`,
  `MCP-STALE-FRESHNESS`, `PROJ-TAXPAID-LABEL`, `CELI-ASSET-NUDGE`) — nécessitent un redéploiement Cloud Run.

---

## [unreleased — Connecteur MCP : déploiement Cloud Run (Lot 4 claude.ai — chantier COMPLET)] — 2026-07-13

### Connecteur MCP — déploiement (Lot 4)
- **Conteneur Cloud Run** : `mcp/Dockerfile` (node:22-slim, exécute le serveur HTTP via tsx, utilisateur
  non-root) + `.dockerignore` (n'embarque que le serveur, pas le front ni les secrets).
- **Déploiement** : `mcp/deploy.sh` (`gcloud run deploy` région Montréal, secrets OAuth injectés depuis
  Secret Manager, `min-instances 1`, injection de l'URL publique en 2ᵉ passe) + `.github/workflows/
  deploy-mcp.yml` (déploiement continu sur push `main` via Workload Identity Federation, ignoré tant que
  l'infra GCP n'est pas configurée).
- **Doc** : `mcp/README.md` gagne un guide pas-à-pas Google Cloud (génération des clés, création des 3 secrets,
  IAM, branchement claude.ai depuis le web ou le téléphone).
- **App** : la carte « Connecter à Claude » (Réglages → Système) affiche désormais, si `VITE_MCP_SERVER_URL`
  est défini, l'URL du connecteur à coller dans claude.ai (web/mobile) en plus de l'installation Claude Desktop.
- **Chantier MCP claude.ai COMPLET** (lots 1→4) : what-if + séries · transport HTTP · OAuth 2.1 + Secret
  Manager · déploiement. Reste des actions Google Cloud côté utilisateur (cf `docs/A_FAIRE_MOI.md`).

---

## [unreleased — Connecteur MCP : authentification OAuth 2.1 (Lot 3 claude.ai)] — 2026-07-13

### Connecteur MCP — sécurité (Lot 3)
- **OAuth 2.1 mono-utilisateur** (`mcp/auth/oauthProvider.ts`) : ce que l'UI des connecteurs custom de
  claude.ai exige (pas de Bearer statique). Serveur STATELESS (compatible Cloud Run scale-to-zero) —
  jetons signés HMAC-SHA256, enregistrement dynamique de client (DCR) sans base, PKCE S256 obligatoire,
  allowlist de redirection, rotation du refresh token. L'accès est gardé par une **clé d'accès** unique
  saisie une fois (comparaison constant-time). Endpoints `/oauth/*` + découverte `/.well-known/*`
  (RFC 8414/9728) ; `/mcp` répond 401 + `WWW-Authenticate` sans Bearer valide.
- **Refresh token Google en Secret Manager** (`mcp/auth/credentialsBackend.ts`) : sur Cloud Run, le token
  long-terme vit dans Secret Manager (via metadata server, zéro dépendance) au lieu d'un fichier ; en local,
  le fichier `~/.financeai-mcp/credentials.json` reste le défaut. `invalid_grant` (token expiré/révoqué —
  le symptôme historique) donne désormais un message actionnable « reconnecte le Drive » au lieu du texte brut.
- Auth activée quand `FINANCEAI_OAUTH_SIGNING_KEY` + `FINANCEAI_ACCESS_KEY` sont présents ; sans elles, le
  serveur refuse de démarrer sur un hôte exposé. 21 tests OAuth + flux e2e complet.

---

## [unreleased — Connecteur MCP : transport HTTP (Lot 2 claude.ai)] — 2026-07-13

### Connecteur MCP (v0.5.0)
- **Transport Streamable HTTP** (`mcp/http.ts`, `npm run mcp:http`) : le même registre de tools
  (16, dont `simulate_what_if`) servi en HTTP — endpoint `/mcp` à sessions + `/health`. Prérequis
  du branchement claude.ai web/mobile (Cloud Run, lots 3-4). Local = loopback + anti-DNS-rebinding ;
  `$PORT` (Cloud Run) → `0.0.0.0`. Arrêt propre SIGTERM. ⚠️ Sans auth tant que le Lot 3 (OAuth 2.1)
  n'est pas livré — ne pas exposer publiquement.
- **`mcp/bootstrap.ts`** : résolution de la source d'état (Drive autorisé > fichier local) factorisée,
  partagée entre stdio et HTTP (comportement stdio inchangé). 13 tests e2e du serveur HTTP.
- **Durcissements (panel 3 agents, findings prouvés)** : arrêt SIGTERM borné (grâce 5 s + fermeture forcée
  loguée — une requête en vol suspendue bloquait l'arrêt à jamais) ; corps plafonné 5 Mo → 413 avec drain
  (pas d'OOM silencieux, pas de RST qui jette la réponse) ; erreurs internes du SDK loguées
  (`transport.onerror`) ; protection anti-rebinding sur le port réellement lié + `Origin` vérifiée ;
  refus de démarrage sur hôte non-loopback sans auth (`MCP_HTTP_ALLOW_EXPOSED=1` pour forcer) ;
  session-ids tronqués dans les logs.

---

## [unreleased — Connecteur MCP : what-if sur vraies données + séries pour graphiques] — 2026-07-13

### Connecteur MCP (Lot 1 du chantier claude.ai)
- **Nouveau tool `simulate_what_if`** : « si j'achète une voiture demain, comment ça affecte mes
  finances ? » sur les VRAIES données. Les changements hypothétiques (achat ponctuel ou financé,
  changement de salaire, dépense récurrente ±, nouvelle dette, achat immobilier) sont traduits vers les
  structures que le moteur consomme déjà (`LifeEvent`, `Debt`, `RealEstateGoal`, salaires, épargne
  mensuelle), puis le moteur complet roule DEUX fois (trajectoire actuelle vs avec changements) :
  deltas de patrimoine à 1/2/5/10/20 ans, impact âge FIRE + impôts, hypothèses de modélisation
  remontées (`assumptions`), et séries annuelles base+scénario pour tracer des graphiques comparés.
  Aucun chiffre inventé : Claude reçoit les points du moteur. (`mcp/whatIf.ts` pur + 13 tests avec
  discriminants de magnitude économique.) (MCP-WHATIF)
- **`get_projection` : paramètre `includeSeries`** → série ANNUELLE exacte (patrimoine nominal/réel,
  comptes CELI/REER/CELIAPP/REEE/non-enregistré/crypto, immobilier, dettes, par âge) pour les graphiques.
- **Chantier relancé (choix Marc 2026-07-13)** : cible = claude.ai web/mobile (Cloud Run). Phase 0
  refaite — correction au brief : l'UI connecteurs custom claude.ai exige OAuth 2.0/2.1 (pas de champ
  Bearer statique) → lots suivants HTTP → OAuth → déploiement (cf `docs/BACKLOG.md` §MCP-CLOUDRUN).

---

## [unreleased — Perf : sélecteur atomique + imports de bundle honnêtes] — 2026-07-07

### Performance / interne
- **Checklist de complétude (Configuration)** : `MissingDataChecklist` s'abonnait au store ENTIER
  (`useFinanceStore()`) → re-render à chaque mutation (dont les écritures fréquentes du calcul Monte-Carlo).
  Remplacé par un sélecteur `useShallow` sur le tableau dérivé des champs manquants → re-render seulement
  quand l'ensemble des champs manquants change. (PERF-MISSINGDATA)
- **Imports de bundle** : 2 des 3 `INEFFECTIVE_DYNAMIC_IMPORT` (dynamic imports qui ne créaient aucun chunk
  séparé car le module est déjà en boot) convertis en imports statiques honnêtes — `lockedProjectionStore`
  (App.tsx, déjà en boot via le store) et `backupAuto` (syncOrchestrator, déjà en boot via App.tsx). Le 3ᵉ
  (`claude.ts`) est conservé en dynamique **à dessein** : ses consommateurs sont lazy, donc le SDK Anthropic
  vit dans les chunks lazy, pas en boot — le rendre statique le tirerait en boot. Boot inchangé (99,8 kB gzip),
  build : 3 warnings → 1. (PERF-BUNDLE)

---

## [unreleased — Nettoyage abonnements : calendrier annuel + DRY santé] — 2026-07-07

### Planification
- **Calendrier des factures** : un abonnement **annuel** ne s'affiche plus tous les mois — il apparaît
  uniquement dans son **mois d'échéance** (dérivé de `lastDate`). La liste des abonnements affiche le mois
  précis + « annuel » pour ces abonnements (au lieu de « Le X du mois »). Nouveau helper pur
  `isAnnualSubscription` (discriminant ratio `yearlyCost/averageAmount`). (PLANNING-ANNUAL-CALENDAR)

### Interne
- **Coût mensuel des abonnements (santé financière)** : `subscriptionsMonthlyCost` délègue au helper
  canonique `totalMonthlyCost` — source unique de l'annualisation, plus de divergence possible si la garde
  NaN change. Aucun impact sur le score (valeurs identiques). (HEALTH-SUB-DRY)

---

## [unreleased — A11Y : contraste santé + révélation clavier budget] — 2026-07-07

### Accessibilité
- **Santé financière (Accueil)** : les libellés secondaires de l'indicateur (`/ 100`, poids `%` de chaque
  métrique, ligne de détail `raw`) passent de `text-ink-500` (3,4-4,2:1, échec WCAG AA texte normal) à
  `text-ink-400` (5,2-6,4:1, ✅ AA). Mesuré par `check-contrast`. (A11Y-HEALTH-RAW-INK500)
- **Tableau Budget** : les `<select>` fréquence/type et le bouton « Supprimer » d'une catégorie, jusqu'ici
  révélés au survol souris seulement (`opacity-0 group-hover`), sont désormais révélés aussi au **focus
  clavier** (`focus-within` / `focus`) → utilisables sans souris. (A11Y-BUDGETTABLE-SELECT-KBD)

---

## [unreleased — TP1G-VIVANT-SEUL : crédit QC « personne vivant seule »] — 2026-07-07

### Fiscalité (money-critical)
- **Crédit « personne vivant seule » (ligne 361 QC)** modélisé : le montant de base (2 172 $) s'additionne aux
  montants âge + revenu de retraite pour un contribuable **sans conjoint** (solo ou survivant), l'ensemble réduit une
  seule fois de 18,75 % au-delà d'un **seuil unique 42 955 $** (revenu familial net) — les paliers duaux seul/couple
  (27 835 / 45 270, non sourcés) sont **archivés** (léger effet à la baisse sur le crédit des couples dans la bande).
  Un retraité solo 65+ paie ~304 $/an de moins. Source : MFQ Dépenses fiscales 2025, fiche 110606, tableau C.31.
  Limites assumées : appliqué au bloc 65+ ; supplément monoparental (2 681 $) non modélisé.

---

## [unreleased — DETTE-RE-SALE : vente immobilière ciblée par bien] — 2026-07-07

### Correction (money-critical)
- **Vente immobilière ciblée** : un événement de vente désigne désormais le bien par `propertyId` au lieu de
  vendre le premier bien à équité positive — corrige un bug de justesse $ (dans un scénario résidence principale +
  locatif, le moteur vendait la résidence principale EXEMPTÉE au lieu du locatif IMPOSABLE, faussant le gain en
  capital de dizaines de k$). Fallback rétrocompatible si non désigné ; sélecteur ajouté au formulaire d'événement
  dès 2 biens actifs. Champ `LifeEvent.propertyId` additif optionnel — aucune migration de schéma (v7 conservé).

---

## [unreleased — FISC-WELCOME-2026 : taxe de bienvenue « reste du Québec » 2026] — 2026-07-07

### Fiscalité (money-critical)
- **Barème des droits de mutation « reste du Québec »** réindexé au millésime **2026** : 3 tranches de base
  (≤ 62 900 $ : 0,5 % · → 315 000 $ : 1,0 % · > 315 000 $ : 1,5 %), source *Gazette officielle du Québec*
  2025-06-07 nº 23 (indexation +2,3438 %). L'ancienne 4ᵉ tranche à 2 % (approximation des sur-tranches
  municipales > 500 k$, non sourcée) est retirée → limite assumée documentée (ville par ville au-delà).
  Achat à 500 k$ : **5 610,50 $** (avant 5 755,50 $). Montréal inchangé, invariant « montreal ≥ reste_qc » préservé.

---

## [unreleased — P0-PROXY relais BYOK (dark-launch) + décision app SOLO] — 2026-07-06

### Infra : relais Anthropic chiffré pour l'IA
- **Proxy Edge Vercel** : clés API jamais exposées au navigateur. Relais BYOK (ta clé reste ta clé) qui
  chiffre le token de transit, antiAbus par construction. Code + tests livrés ; awaiting env Vercel (PROXY_ACCESS_TOKEN +
  VITE_PROXY_ACCESS_TOKEN, 6 étapes doc `A_FAIRE_MOI` O4). Vision API reste en direct (~13 Mo > limites Edge, spike post-lancement).
- **Sécurité du relais** : route unique `/api/claude/`, allowlist modèles, clamp tokens, `no-store` cache,
  annulation chaînée, zéro logs sensitifs.
- **Transport basculable** : flag `VITE_CLAUDE_TRANSPORT` (défaut direct, optionnel =proxy après déploiement).
- **Codex : `api/_lib/relay.ts` (proxy cœur), `api/claude/[...path].ts` (route Edge), middleware Vite, makeClient
  switch kind text/vision, 13 tests discriminants.** Pas d'API Anthropic côté serveur Node (Edge = stateless, sûr).

### Produit : app SOLO (multi-user remisé)
- **Décision Marc 2026-07-06** : FinanceAI = outil perso qualité AAA, pas produit bêta public. Multi-appareil
  (sync Drive + gate Google) CONSERVÉ.
- **Impact docs** : `docs/decisions.md` ADR-002 (contexte/trade-offs/alt), `docs/VISION.md` cap remisé,
  `docs/BACKLOG.md` section P0 annotée (multi-user → multi-appareil Marc).
- Aucun changement de code produit — infra invisible au-delà de la route relais.

---

## [unreleased — Hygiène documentaire : mise à niveau 2026-07-06] — 2026-07-06

### État documentaire synchronisé avec le code actuel
- **README.md** : chiffres tests réels 2334 / 207 fichiers (au lieu de 742 / 73) ; Vite 8 Rolldown, Vitest 4, schema v7 ; features manquantes ajoutées (import PDF Claude Vision, sync Drive chiffré, Budget v2 50/30/20, retraite per-conjoint, crédit dons, mode discret).
- **BACKLOG.md** : compteur PR #425 (2026-06-26), items cochés/fusionnés/dédoublonnés (HEALTH-SAVINGS, PLANNING-ANNUAL-SUB-12X, FISC-WHT, PH1-b Cloudflare, D6-GRAPH a11y).
- **CLAUDE.md** : test count ~2330, agent count 14 réel, leçon 2026-07-06 (branche distante no-op, triaging commits périmés).
- **SESSION_HANDOVER.md** : table §1 (#425 + 2334 tests), anti-patterns corrigés (cycle autonome Claude-merge), bandeau session 2026-07-06 ajouté.
- **docs/VISION.md** : auth Google in-app ✅ marqué fait (2026-06-16).
- **docs/A_FAIRE_MOI.md** : O6/Q2 Cloudflare marqué caduc, O3 cohérent avec O1.
- **docs/FISCAL_REFERENCE.md** : 2ᵉ passe audit 2026-06-23 marquée.
- Aucun impact produit — corrections documentaires de cohérence uniquement.

---

## [unreleased — Lisibilité : textes secondaires plus contrastés (WCAG AA)] — 2026-06-26

### Les libellés et données secondaires sont plus faciles à lire
- Sur de nombreux écrans (**Accueil, Budget, Investissements, Transactions, Planification, Événements de vie,
  Immobilier, Enfants, Revenus de retraite, Emplacement d'actifs**, détails de projection), des textes
  secondaires (libellés, pourcentages, dates, en-têtes de tableau, notes d'aide, messages d'état vide)
  s'affichaient dans un gris (`ink-500`) sous le contraste minimal **WCAG AA** (4,5:1) sur fond sombre. Ils
  passent à un gris plus clair (`ink-400`, 5,2-6,4:1) → plus lisibles, notamment en cas de basse vision.
- Les icônes décoratives et les états volontairement atténués gardent leur teinte (rien de superflu n'a changé).
- Migration progressive par écran ; les derniers écrans suivront.

## [unreleased — Abonnements : un abo annuel n'est plus compté ×12] — 2026-06-26

### Tes totaux d'abonnements sont justes même avec un abonnement annuel
- Dans l'onglet **Planification**, les totaux « Fixe mensuel » et « Coût annuel » des abonnements traitaient
  **tout abonnement comme mensuel** : un abonnement **annuel** (ex. 120 $/an facturé une fois) était compté
  comme 120 $/**mois** → **1 440 $/an** affichés au lieu de 120 $. Désormais chaque abonnement contribue son
  vrai coût mensuel-équivalent (un abo annuel = son montant ÷ 12), et la ligne par abonnement affiche le bon
  « /mois ». Aucun impact sur ton patrimoine net (c'est de l'affichage).

## [unreleased — Impôt à vie estimé : retenue REER exacte au cent près] — 2026-06-26

### Le total d'impôts estimé est plus précis les mois à plusieurs retraits REER
- Le compteur **« impôts payés sur la vie de la projection »** (et le classement des stratégies de décaissement
  qui s'en sert) estimait la retenue à la source des retraits REER en la **recalculant sur le total mensuel agrégé**.
  Comme le barème de retenue n'est pas additif (un palier unique s'applique à tout le montant), ce recalcul
  **sur-estimait** les mois où plusieurs retraits REER ont lieu. Désormais le compteur additionne la retenue
  **réellement prélevée à chaque retrait** → chiffre exact au cent près, cohérent avec ce que la projection a
  vraiment provisionné. Effet mesuré : ~−1 000 $ sur un retraité décaissant ~9 000 $/mois sur 10 ans.
- Aucun impact sur ton **patrimoine net** ni sur l'impôt réellement payé (c'est un compteur d'affichage/diagnostic).
- Côté code : déduplication de la logique de retenue REER vers une **source unique** (`withholdingForGrossRRSP`).

## [unreleased — Score de santé : taux d'épargne et coussin d'urgence plus justes] — 2026-06-25

### Ton épargne budgétée ne compte plus comme une « dépense »
- Le **taux d'épargne** et le **coussin d'urgence** du score de santé financière (Dashboard) comptaient à tort
  tes postes de budget de nature **Épargne** (virements vers CELI/REER…) comme des dépenses. Résultat : si tu
  budgétais explicitement ton épargne, ton taux d'épargne affiché tombait près de **0 %** et ton coussin
  était sous-estimé. Désormais l'épargne est exclue des dépenses → les deux indicateurs reflètent la réalité.
- **Cohérence partout** : la même correction est maintenant appliquée à TOUTES les surfaces qui calculent ton
  épargne mensuelle — Dashboard, assistant IA, suggestions « prochaine action », **projection de retraite** et page
  Budget. Avant, un poste d'épargne dont le nom de nature était écrit avec un accent (« Épargne ») pouvait être
  compté comme dépense sur certaines surfaces → épargne sous-estimée et projection pessimiste. Réglé.

---

## [unreleased — Couples : rentes de retraite (FERR, RRQ, PSV) calculées par conjoint] — 2026-06-25

### Le début de la RRQ / PSV et le bonus PSV 75+ sont maintenant calculés par conjoint
- Pour un couple dont les conjoints n'ont **pas le même âge**, la **RRQ et la PSV de chacun démarrent à SON
  propre âge** (au lieu de l'âge d'un seul conjoint appliqué à tout le ménage) — le conjoint plus jeune ne
  « touche » plus sa rente avant l'âge admissible. De même, la **bonification PSV de +10 % à 75 ans** ne
  s'applique qu'au conjoint qui a réellement 75 ans. Couples de même âge et personnes seules : **aucun changement**.
- Corrige au passage un cas où le **Supplément de revenu garanti (SRG)** était à tort nul pour un couple à écart
  d'âge dont l'**aîné** touchait déjà la PSV alors que le plus jeune n'y avait pas encore droit.

### La conversion obligatoire REER→FERR (72 ans) est maintenant calculée par conjoint
- Pour un couple dont les conjoints n'ont **pas le même âge**, la conversion obligatoire du REER en FERR
  (à 72 ans) se déclenche désormais **pour chaque conjoint à SON âge**, sur SA part de REER — au lieu d'un
  âge unique appliqué à tout le REER du ménage. Un couple **de même âge** ou une **personne seule** ne voient
  **aucun changement**. Effet : le revenu imposable et l'impôt de retraite sont plus justes pour les couples à
  écart d'âge.
- Au **décès d'un conjoint**, sa part de REER **roule vers le survivant** (sans impôt, comme le prévoit la règle
  fiscale) — corrige un cas où le REER du défunt aurait continué à générer des retraits imposables.

---

## [unreleased — Impôt à vie estimé : retenue REER au bon taux] — 2026-06-23

### Le total d'impôts et l'« efficacité fiscale » de tes stratégies sont plus justes
- L'impôt cumulé affiché (et la métrique de « fuite fiscale » qui sert à comparer les stratégies de décaissement)
  comptait la retenue sur tes retraits REER à un **taux figé de 15 %**, qui sous-estimait dès ~5 000 $/retrait.
  Il utilise désormais la **retenue réelle par paliers (19/24/29 %)** — le compteur d'impôts à vie reflète enfin
  ce que tu paies vraiment (aucun effet sur ton patrimoine, c'est un indicateur d'affichage).

---

## [unreleased — Mode discret sur les champs éditables + change réel au Centre fiscal] — 2026-06-23

### Le mode discret masque aussi les champs que tu peux modifier
- Tes montants de **pension/rente** (Profil) et tes **cibles de budget** sont maintenant masqués (`•••`) en mode
  discret tant que tu ne cliques pas dessus pour les modifier — la valeur **sort réellement de la page** (avant,
  un simple flou la laissait lisible par copier-coller, inspecteur ou lecteur d'écran). Le champ se re-masque dès
  que tu en sors, ou si tu actives le mode discret pendant que tu édites.

### Centre fiscal : estimation d'impôt de placement plus juste
- L'estimation d'impôt sur tes placements non enregistrés utilise désormais le **taux de change réel** (au lieu
  d'un taux USD figé et périmé) → l'impact estimé est correct pour un portefeuille en USD/EUR.

---

## [unreleased — Sécurité : durcissement chiffrement + journaux] — 2026-06-23

### Renforce la protection de tes clés et de tes journaux
- Les **clés API** chiffrées avant d'être synchronisées sur ton Drive utilisent désormais une dérivation **6× plus
  robuste** (PBKDF2 600 000 itérations, aligné sur les sauvegardes locales). Tes anciennes sauvegardes restent lisibles.
- Le **journal d'erreurs** (exportable) masque maintenant aussi les champs financiers aux noms composés
  (ex. « dette liquide », « solde hypothécaire », « montant annuel ») qui pouvaient auparavant y apparaître en clair.

---

## [unreleased — Fiscalité : dons charitables + loyers/dividendes correctement imposés] — 2026-06-23

### Le crédit pour dons (et l'impôt sur loyers/dividendes d'entreprise) s'applique enfin en phase active
- **Crédit d'impôt pour dons charitables corrigé** : il était calculé à un taux plat (33 %) ET, pour un salarié
  actif, **purement et simplement perdu** (un bug d'imputation l'écrasait en fin d'année). Désormais il suit le vrai
  barème par paliers (fédéral + Québec : 35 % sur les 1ers 200 $, 53 % au-delà) et s'applique que tu sois actif ou retraité.
- **Revenus locatifs et dividendes d'entreprise (CCPC)** : pour un propriétaire/actionnaire encore en activité, ils
  n'étaient **pas imposés** dans la projection (même bug d'imputation) — ils le sont maintenant.
- Le crédit pour dons est **plafonné à l'impôt que tu dois** (c'est un crédit non remboursable) : un gros don à faible
  revenu ne génère pas de « remboursement » fictif. L'excédent inutilisé n'est pas reporté dans la projection.
- Le don de **titres en nature** (case « titres* ») : l'avantage fiscal spécifique (gain en capital exonéré) n'est pas
  encore modélisé — un tooltip le précise ; le crédit de don ordinaire s'applique quand même.

---

## [unreleased — Mode test : la répartition 50/30/20 des personas est juste] — 2026-06-23

### Corrige le classement Besoin / Envie / Épargne des personas d'exemple
- Les budgets des personas de test classaient mal leurs postes (tout tombait en « Envie », et l'épargne CELI/REER comptait
  comme une dépense). Désormais chaque poste est dans la bonne classe **50/30/20** → les donuts « Comparatif » et « Ta
  répartition réelle » affichent enfin des Besoins ≠ 0, et le potentiel d'épargne / les dépenses montrées (y compris à
  l'assistant) sont justes en mode test. Aucun impact sur tes vraies données (déjà correctes).

---

## [unreleased — En couple : corrige qui a payé quoi] — 2026-06-22

### Attribue une transaction à l'un ou l'autre, à la main
- **En mode couple, le tableau des transactions a une nouvelle colonne « Conjoint »** : pour chaque ligne, choisis
  **Auto** (attribution automatique selon le type de poste budget — le réglage par défaut), ou force la transaction
  sur l'un des deux conjoints. Pratique quand une dépense « commune » est en fait perso, ou l'inverse. Disponible aussi
  en vue mobile. L'attribution alimente le « Perso réel » de la carte couple.

---

## [unreleased — Ton score de santé regarde ton budget et tes abonnements] — 2026-06-22

### Deux nouveaux ratios dans l'indicateur de santé financière
- **Adhérence au budget** : compare tes dépenses réelles du mois dernier à tes cibles, poste par poste (hors épargne).
  100 = tu restes dans tes cibles ; le score baisse avec le dépassement.
- **Poids des abonnements** : tes abonnements épinglés rapportés à ton revenu net (cible : moins de 15 %).
- **Score plus juste** : une métrique sans donnée (pas de projection FIRE, pas de dépenses le mois dernier, aucun abo
  épinglé) est maintenant affichée « — » et **exclue** du score global, au lieu de compter comme un 0 qui le tirait
  injustement vers le bas. Tu peux pondérer les 6 ratios à ta guise (bouton « Paramétrer »).

---

## [unreleased — Épingle tes abonnements] — 2026-06-22

### Tes abonnements restent, sans relancer l'analyse
- **Tu peux maintenant « épingler » un abonnement détecté** (Netflix, Spotify, Hydro…) : il est **sauvegardé** et
  réapparaît à chaque ouverture, sans avoir à relancer la détection IA. Survole un abonnement → bouton « Épingler » ;
  un abo épinglé affiche « Épinglé » (clique pour le retirer). Les abos épinglés ont priorité sur une nouvelle
  détection (ton montant confirmé prime). Aucun doublon : un même marchand = un seul abonnement.

---

## [unreleased — Dépenses réelles par conjoint] — 2026-06-22

### En couple : qui a dépensé quoi, pour de vrai
- **La carte « Santé Financière du Couple » montre maintenant le « Perso réel » de chaque conjoint** : les dépenses
  réellement attribuées à l'un ou à l'autre, à côté de la part *planifiée* (« Sorties »). L'attribution est **automatique**
  par défaut (un poste « Perso 1 » va au 1ᵉʳ conjoint, « Perso 2 » au 2ᵉ ; les postes « Commun » restent partagés). Tu vois
  ainsi l'écart entre le budget prévu par personne et ce qui est réellement sorti.

---

## [unreleased — Tes réglages de santé suivent tes appareils] — 2026-06-22

### Les pondérations de l'indicateur de santé sont sauvegardées avec le reste
- **Les poids que tu donnes à chaque ratio de santé (épargne, coussin, dette, FIRE) sont maintenant rangés avec le reste
  de tes données** (au lieu d'un coin de stockage local au navigateur). Concrètement : ils **suivent tes appareils** via la
  sync, et survivent proprement à un nettoyage. Tes réglages existants sont récupérés automatiquement (rien à refaire).

---

## [unreleased — Santé financière regroupée dans Budget] — 2026-06-22

### Ton indicateur de santé financière vit maintenant dans Budget
- **L'indicateur de santé financière (le score 0-100 avec taux d'épargne, coussin, dette, FIRE) a quitté le Dashboard pour
  l'onglet Budget**, dans un nouveau sous-onglet **« Santé »**. Il y est plus à sa place, à côté de ton budget et de tes objectifs.
  Le calcul et les réglages de pondération sont identiques — c'est juste mieux rangé.

---

## [unreleased — Objectifs : relie un objectif d'épargne à ton budget] — 2026-06-22

### « Versé ce mois » sur tes objectifs
- **Tu peux maintenant lier un objectif d'épargne à une catégorie de ton budget** : l'objectif affiche alors, en plus de
  l'accumulé et de la cible, le **« Versé ce mois »** — combien tu as réellement mis dans cette catégorie ce mois-ci (calculé
  depuis tes transactions, même règle que le budget). Le lien est modifiable par objectif. Si la catégorie liée est renommée ou
  supprimée, un badge **« ⚠ Lien invalide »** te le signale (plus de « 0 » trompeur).

---

## [unreleased — Budget : ta répartition 50/30/20 réelle] — 2026-06-22

### Vois où va vraiment ton argent vs la règle 50/30/20
- **Nouveau donut « Ta répartition réelle »** dans « Améliorer mon budget » : tes dépenses réellement rapprochées à tes
  postes (Besoins / Envies) + ton épargne réelle (revenu − dépenses), à côté du donut théorique (tes cibles budgétées).
- **Table comparative Réel · Cible · Idéal** : pour chaque catégorie, ton pourcentage réel, ta cible budgétée, et l'idéal
  50/30/20. Le réel s'affiche en **vert** s'il est proche de l'idéal (±2 pts), en **orange** sinon.
- **Signal de déficit** : si tu as dépensé plus que ton revenu sur la période, une note te le dit (l'épargne est ramenée à
  0 dans le graphe, mais le déficit réel reste affiché — pas de fausse impression d'équilibre).

---

## [unreleased — Budget : parité avec tes transactions] — 2026-06-22

### Repère les écarts entre ton budget et tes dépenses réelles
- **Le Budget rapproche maintenant tes transactions de tes postes avec UNE seule règle** (avant, les « réels » et les
  « tendances » se calculaient différemment → un même montant pouvait apparaître dans l'un mais pas l'autre). Tes montants
  réels et tes tendances 6 mois sont désormais cohérents.
- **Nouvelle section « Parité Budget ↔ Transactions »** : (1) les **catégories de transactions sans poste** (avec leur total —
  crée un poste ou renomme la catégorie pour les suivre), et (2) les **postes jamais rapprochés à une dépense** (poste inutilisé
  ou nom différent). L'épargne (alimentée par virements) n'est pas signalée.
- Le « Total dépensé » reste inchangé (il compte toujours toutes tes dépenses, avec ou sans poste).

---

## [unreleased — Mode test : tous les personas explorables sur toutes les pages] — 2026-06-22

### Chaque persona de démo ouvre toutes les pages
- **En mode test, les 7 personas de démonstration n'affichent plus d'écran « configure d'abord »** sur les pages
  pilotées par les données (Futur, Investissements, Immobilier, Enfant, Dettes, Projets…). Chaque persona déclare
  explicitement ce qui ne le concerne pas (« pas de projet immobilier », « pas d'enfant »…) ou contient une donnée
  minimale, pour qu'on puisse explorer toute l'app directement. (Les pages IA restent en attente d'une clé API, normal.)
- Purement des données de démo (mode test) — aucun impact sur l'app réelle.

---

## [unreleased — Futur : courbe dézoomée plus épurée] — 2026-06-22

### Moins d'icônes d'événements quand tu prends du recul
- **En vue dézoomée (tout l'horizon), la courbe Futur affiche maintenant moins d'icônes d'événements** (un
  échantillon représentatif), pour rester lisible. **En zoomant, elles réapparaissent progressivement jusqu'à toutes.**
  Les jalons importants (comme 🔥 FIRE atteint) restent **toujours visibles**, à tous les niveaux de zoom.
- La courbe **verrouillée** est déjà restaurée automatiquement au rechargement de la page (vérifié).

---

## [unreleased — a11y : lisibilité des annotations (token de couleur)] — 2026-06-22

### Textes d'annotation au bon niveau de gris
- Plusieurs petits textes d'aide/annotation (graphes, fiche détail, prochaine action…) utilisaient une classe de
  couleur **inexistante** : leur teinte était imprévisible (héritée du parent). Ils ont désormais une couleur grise
  **lisible et conforme aux contrastes d'accessibilité** (AA). Purement visuel, aucune donnée ni calcul touché.

---

## [unreleased — Futur : infobulle figeable (clic = fige)] — 2026-06-22

### Lis l'infobulle tranquillement, sans qu'elle fuie sous le curseur
- **Sur la courbe Futur, un clic FIGE désormais l'infobulle** : elle reste ancrée à l'écran, devient scrollable et
  cliquable, au lieu de suivre la souris. Tu peux survoler d'autres mois sans qu'elle disparaisse. **Échap** ou un clic
  ailleurs la libère.
- **Bouton « Détail complet »** dans l'infobulle figée → ouvre la fiche exhaustive du mois (l'ancienne modale). Les
  pastilles d'événement (🔥, 🏠…) ouvrent toujours directement le détail.
- Au survol simple, l'infobulle suit la souris comme avant (rien ne change tant qu'on ne clique pas).
- Sous le capot : aucun calcul touché (pure UI) ; positionnement borné à l'écran, accessibilité durcie (focus géré,
  Échap, contraste et cible tactile du bouton conformes).

---

## [unreleased — Futur : le cap « FIRE atteint » saute aux yeux] — 2026-06-20

### Une pastille orange au moment FIRE
- **Sur la courbe Futur, le mois où tu atteins ton objectif FIRE est désormais une pastille ORANGE 🔥**, au lieu de
  se fondre dans les autres jalons de vie. Elle reste **toujours visible**, même en vue dézoomée (avant, elle pouvait
  disparaître quand le graphe condense les événements). Clique dessus pour le détail du mois. Aucun calcul changé —
  le moment FIRE est celui que le moteur calcule déjà, juste mieux mis en valeur.

---

## [unreleased — Clarté : « Patrimoine successoral » (avec rentes)] — 2026-06-19

### Un KPI mieux nommé, avec une infobulle
- **Le KPI « Patrimoine projeté » de l'onglet Futur s'appelle maintenant « Patrimoine successoral, avec rentes »** + une
  infobulle explique ce qu'il recouvre : patrimoine au décès, net de l'impôt de liquidation (REER et gains en capital
  imposés au décès) **plus** la valeur actualisée des rentes RRQ/PSV restantes. C'est différent du patrimoine en fin
  d'horizon — le nom le dit enfin. Clarifié partout où ce montant apparaît (Budget, stress-tests, optimiseur de
  décaissement, assistant IA). Aucun calcul changé, juste les libellés.

---

## [unreleased — Accessibilité : lisibilité des badges] — 2026-06-19

### Badges plus nets (contraste)
- **Les badges (« Insoutenable », « Impôt », « FIRE atteint »…) ont une bordure plus marquée** : ils se détachent
  mieux du fond de la page (le fond du badge reste identique). Petit gain de lisibilité, surtout en coup d'œil rapide.

---

## [unreleased — Moteur : garde anti-NaN du patrimoine net] — 2026-06-19

### Robustesse — Un solde corrompu ne vide plus ton graphe en silence
- **Si un solde devenait `NaN`/infini** (donnée corrompue, division par zéro en amont), **tout ton patrimoine net devenait
  invalide et le graphe se vidait — sans aucune trace** d'erreur. Le calcul du patrimoine (source unique) n'avait pas de garde.
- **Désormais** : un terme non fini est isolé, **rabattu à 0**, et **journalisé** (visible dans le panneau système) au lieu de
  faire planter silencieusement l'affichage. Le calcul reste **identique au centime** quand tout est normal (aucun impact sur
  tes chiffres). Filet de défense en profondeur — la vraie source d'un solde corrompu reste à corriger en amont si elle survient.

---

## [unreleased — Moteur : perte en capital d'un locatif vendu sous coût] — 2026-06-19

### Correction fiscale — Vente d'un immeuble LOCATIF à perte
- **Un locatif vendu sous son coût d'achat générait une perte en capital qui était silencieusement ignorée** : l'avantage
  fiscal (report de la perte sur les gains en capital futurs, LIR 111(1)b) était perdu. Le moteur ne comptabilisait que les
  gains (`max(0, produit − coût)`).
- **Désormais la perte est portée en « banque de pertes en capital »** : elle réduit l'impôt sur tes gains en capital futurs
  (placements, crypto ou autre vente immobilière), exactement comme une perte sur un placement non enregistré. Symétriquement,
  un gain locatif nette d'abord les pertes accumulées avant d'être imposé. (Vente d'une résidence principale : toujours exemptée.)

---

## [unreleased — Moteur : patrimoine net net de déficit immobilier] — 2026-06-19

### Correction moteur — Vente immeuble avec peu d'équité (frais > solde)
- **Vente d'une propriété avec hypothèque proche de la valeur + frais de vente** : si le déficit était supérieur à l'équité
  disponible (ex. hypo = 95 % du prix, frais = 5 % → solde négatif), le moteur **n'en tenait pas compte** : le déficit était effacé
  silencieusement au lieu d'être soustrait du patrimoine net. Résultat : ton patrimoine affiché était surévalué.
- **Désormais le déficit est bien traité** : il réduit ton liquide (s'il y a du cash) ou s'ajoute à ta dette visible (découvert
  porté en ligne). Le patrimoine net reflète exactement la réalité économique de la vente. Cas rare mais structurel pour les
  propriétaires avec peu d'équité.

---

## [unreleased — Accessibilité (Vague 2)] — 2026-06-17

### Futur — Badge « plan insoutenable »
- **Un patrimoine projeté qui devient négatif est maintenant expliqué, pas juste affiché** : quand la projection
  fait passer ton patrimoine net sous zéro (capital épuisé, dette qui prend le dessus), un badge clair « Plan
  insoutenable — capital épuisé vers X ans » apparaît dans l'en-tête de l'onglet Futur. Un plan qui reste solvable
  jusqu'au bout n'affiche aucun badge. Transforme un chiffre négatif anxiogène en signal actionnable.

### Investissement — Recherche d'action (Finnhub)
- **Symbole proposé mais sans cours → saisie manuelle au lieu d'une erreur** : l'autocomplétion proposait des
  titres (TSX/étrangers) que le forfait Finnhub gratuit ne sait pas coter, ce qui menait à un message d'erreur
  sec. Désormais l'app bascule automatiquement en saisie manuelle pré-remplie (symbole + nom), avec un message
  informatif — tu n'as plus qu'à entrer le prix. Une vraie panne réseau reste signalée comme une erreur (pas
  masquée). Le menu d'autocomplétion est agrandi, et la touche **Échap** ferme le menu sans fermer la fenêtre.

### Projection — Événements de perte de revenu (FISC-EVENT-INCOMELOSS)
- **Perte d'emploi / année sabbatique / accident appliqués par le moteur** : ces événements de vie étaient
  collectés par l'UI mais **ignorés** par la projection (no-op silencieux — une interruption de revenu de 6 mois
  n'avait aucun effet). Ils réduisent désormais le revenu du ménage de « % perdu » pendant « durée (mois) »
  (défauts perte d'emploi/sabbatique 100 %, accident 50 %, modifiables). Formulaire : deux champs dédiés (% perdu
  + durée) au lieu d'un champ ambigu, avec validation (un événement sans % ni durée est refusé).
- Conservation de l'argent préservée (résiduel < 1 $) ; l'impôt salarial de décembre n'est pas réduit (biais
  conservateur, identique au modèle de chômage stochastique existant).

### Vie privée — Mode discret
- **Le mode discret masque maintenant la VALEUR (« ••• ») au lieu de la flouter** : la vraie valeur n'est
  plus présente dans la page (fini la fuite par copier-coller, inspecteur, lecteur d'écran ou désactivation
  du flou). Le **survol ne révèle plus** le montant. S'applique aux primitives `PrivateAmount`/`PrivateBlock`
  et aux KPI ; la migration des derniers montants encore floutés suit. (PRIV-DISCRET-DOM)

### Accessibilité (WCAG 2.2 AA)
- **Visualisation des tranches d'imposition** (`TaxBracketViz`) rendue lisible au lecteur d'écran :
  barres en `role="img"` + `aria-label` (revenu, taux marginal), contenu visuel interne masqué
  (`aria-hidden`), alternative textuelle `<ChartDataTable>` sr-only (paliers from→to + taux) par
  juridiction ; titre de juridiction passé en `<h3>` (fin du saut de niveau h2→h4) ; couleurs de
  contenu `ink-500`→`ink-400` (contraste AA vérifié : 5,2-6,4:1 vs 3,4-4,2:1). (A11Y-TAXBRACKET)

---

## [unreleased — Audit financier complet (AAA) + corrections périphériques] — 2026-06-17

> Audit exhaustif du moteur (panel 5 agents + vérification empirique) → `docs/AUDIT_FINANCIER_2026-06-17.md`.
> Verdict : cœur money-critical AAA (conservation prouvée ≤ 0,02 $ sur ~25 scénarios, fiscalité 0 écart,
> 0 échec silencieux). Tous les findings PÉRIPHÉRIQUES (UI/IA contournant la source unique). Commande
> récurrente `/audit-financier` ajoutée (cadence trimestre + release + impôts).

### Corrigé (périphérie — aucun n'altère la VALEUR du patrimoine net)
- **Patrimoine net PRÉSENT = source unique** (`computePresentNetWorth`) : le Dashboard (`useDerivedFinancials`)
  et l'IA (`AiAssistant`, FX en dur 1.38/1.50) OMETTAIENT les dettes → NW gonflé vs moteur. Garde keystone
  (parité inter-surfaces) + correction de la régression `availableCash` (mise de fonds immo). (#319)
- **Reconstructabilité sous hypothèque** : nouveau champ `DettesNonImmo` (dettes hors hypothèque) →
  `NetWorth = Σactifs − DettesNonImmo` tient toujours ; INV-9 étendu. (#322, M5)
- **Anti-injection LLM** : `getCoupleOptimizationStrategies` + `getNextBestActions` neutralisent les noms
  utilisateur + isolent les données (`<DONNEES>`), parité avec les autres surfaces. (#321, SEC-1)
- **Viz fiscale NETTE** : `TaxBracketViz` affiche l'impôt net (crédits inclus, via `calculateFiscalReport`)
  au lieu d'un total brut « exact » trompeur. (#323, M4)
- **DRY + cohérence** : constantes `NONREG_DIVIDEND_DISTRIBUTION_SHARE` / `CAPITAL_GAINS_INCLUSION_STANDARD`
  (#320), dépenses snapshot normalisées par fréquence (#322 L4), FX réels dans NextBestAction (#323 AI-NBA-FX).

---

## [unreleased — Money-critical : patrimoine net = dettes soustraites + découvert VISIBLE] — 2026-06-16

> Bug rapporté par Marc : « patrimoine net -193 398 $ avec une variation mensuelle de -208 633 $ »
> alors que revenu ~10,6 k$/mois et dépenses 6,8 k$. Audit total du moteur financier (workflow
> multi-agents + panel adversarial). Cause + corrections ci-dessous.

### Corrigé (patrimoine net)
- **Découvert invisible → VISIBLE** : un débit ponctuel non couvert (réno/véhicule dépassant les
  comptes) était porté en `liquidDebt`, **soustrait du patrimoine net mais exposé dans AUCUN champ**
  (`DetteTotale = hypothèque + prêts` seulement) → un patrimoine NÉGATIF que rien dans l'UI n'expliquait.
  Désormais `liquidDebt` est exposé (`LiquidDebt`), inclus dans `DetteTotale`, et le modal Futur affiche
  une ligne **« Dettes »** (montant = Σ actifs affichés − NetWorth, reconstruction-fidèle).
- **Dettes préexistantes désormais soustraites du patrimoine net** : `rawNetWorth` n'avait JAMAIS
  soustrait `activeDebtsTotal` (prêts auto/étudiant/cartes) ni `smithManoeuvreDebt` (HELOC) →
  patrimoine SURÉVALUÉ et, pire, **rembourser une dette érodait le NW au plein paiement** (le principal
  traité comme consommation) au lieu du seul intérêt. Aligné sur `financialSnapshot` (qui soustrait déjà
  les dettes) et sur la succession.
- **`diffNW` (« Variation nette ») exact** : `prevNW` suivait une formule différente de `rawNetWorth`
  (omettait celiapp + les dettes) → variation mensuelle faussée pour tout utilisateur FHSA/endetté.
  `prevNW` = `rawNetWorth` du mois précédent (source unique).
- **Succession cohérente** : `estateCalculation` soustrait aussi `activeDebtsTotal` (manquant) → le
  « Patrimoine projeté » ne diverge plus du graphe quand une dette persiste en fin d'horizon.
- **Source UNIQUE de la formule** (`services/projection/netWorth.ts` `computeRawNetWorth`) : la formule
  était recopiée en 4 endroits (dont une copie divergente) — désormais 1 seul point de vérité.
- **Garde NaN** : une dette à champ vidé dans l'UI (`parseFloat('')` = NaN) ne contamine plus
  silencieusement `NetWorth` (normalisée à 0 + journalisée via `logError`).

### Tests
- **`tests/services/projection.moneyConservation.test.ts`** — 9 invariants de conservation de l'argent
  (reconstructabilité, ΔNW expliqué, dette réduit le NW, principal neutre, achat immo conserve le NW,
  pas de solde négatif, NaN guardé, hypothèque non double-comptée). Tous discriminants (échouent sur le
  code d'avant). + checklist « VALIDATION FINANCIÈRE » ajoutée à `CLAUDE.md`.
- **2069 tests verts**, typecheck clean.

---

## [unreleased — Sécurité : Vite 6→8 (Rolldown), 0 vulnérabilité] — 2026-06-15

### Sécurité / Build
- **Vite 6 → 8** (moteur **Rolldown**, remplace Rollup + esbuild) : élimine les 2 advisories
  esbuild *high* (GHSA-gv7w-rqvm-qjhr, GHSA-g7r4-m6w7-qqqr) → `npm audit` = **0 vulnérabilité**.
  Le fix ciblé (override esbuild 0.28.1) était impossible sous Vite 6 (casse le build, incompat. vite 6
  `^0.25.0`) ; Vite 8 le résout nativement (+ `npm audit fix` pour l'esbuild résiduel de `tsx`).
- `@vitejs/plugin-react` 5 → 6. `vite.config.ts` adapté à Rolldown : `manualChunks` passé en
  **fonction** (forme objet abandonnée), `external` remonté au **top-niveau** de `rollupOptions`.
  Chunks vendor (react/recharts/ai/pdf) + lazy-loading **préservés** ; **2042 tests verts**, build OK.

---

## [unreleased — Import de relevé : PDF (extraction IA) + auto-classification] — 2026-06-13

### Ajouté
- **Upload d'un relevé bancaire en PDF/image** (en plus du CSV) : extraction des
  transactions par Claude Vision (`analyzeBankStatement`, bloc `document`), **tri
  chronologique**, puis MÊME pipeline que le CSV (synthèse CSV canonique →
  `parseBankCsv` → fusion + dédup). Le **CSV reste 100 % local** ; le PDF/image est
  envoyé à Claude (consenti explicitement à l'import).
- **Prompt d'extraction renforcé** : déduction d'année (lignes jour+mois → période du
  relevé), convention de signe explicite (incluant les cartes de crédit), normalisation
  des montants FR/CAD (« 1 234,56 $ » → 1234.56), complétude multi-pages, exclusion
  soldes/totaux/reports/en-têtes.
- **Détection de transfert corrigée** (validée sur un vrai relevé Desjardins, signes
  réconciliés à la cenne contre la colonne Solde) : un **Interac e-Transfer** (vers/depuis
  une personne) et « money/funds transfer » ne sont **plus** marqués « transfert » — seuls
  les vrais transferts internes (« virement/transfert », AccèsD entre comptes propres) le
  sont. Évitait de sortir à tort revenus/dépenses du cashflow (sur l'échantillon réel,
  **83/97 « transferts » étaient des faux**, dont un revenu de +64 168 $). Logique partagée
  `parseBankCsv` ↔ `categorizeBatch` via `isInternalTransferLabel`.
- **Auto-classification à l'import** : les nouvelles transactions (PDF ET CSV) sont
  catégorisées automatiquement par l'IA (`categorizeBatch`, Haiku) après import, en
  appliquant les catégories sur l'état FRAIS du store (pas d'écrasement d'un edit
  concurrent). Lazy-import de `claude.ts` → le SDK Anthropic n'entre pas dans le
  bundle de boot.
- a11y : `role="status"`/`aria-live` pour l'extraction en cours, `role="alert"` sur
  les erreurs d'import. Trace `warning` si un relevé voit un rejet massif au nettoyage.
- Tests : `extractedTxnsToCsv` (aller-retour RFC-4180 : virgules/guillemets/signes),
  `normalizeExtractedTxns` (tri + filtrage des lignes invalides).

---

## [unreleased — Fix : upload de documents PDF (Vision)] — 2026-06-12

### Corrigé
- **Upload de bulletins/relevés PDF impossible** (« impossible d'uploader mes documents ») :
  `analyzePayslip` (`services/claude.ts`) envoyait TOUT fichier dans un bloc Anthropic `image`
  ET rejetait explicitement les types non-image, alors que la carte d'upload (Profil) et le
  TaxCenter annoncent accepter le PDF (`accept` + libellé « PDF »). Conséquence : chaque PDF
  échouait avec « Analyse échouée ». Fix : nouveau helper pur exporté `buildPayslipFileBlock`
  qui route un PDF vers un bloc `document` (source base64 `application/pdf`) et une image vers
  un bloc `image`. **L'API Anthropic refuse un PDF dans un bloc `image` — le bloc `document` est
  obligatoire.** Toast d'erreur TaxCenter aligné (mention WEBP/PDF). Tests ajoutés
  (PDF → `document`, images → `image`, type non supporté → throw).

## [unreleased — Exactitude fiscale : A1 impôt de retraite par conjoint + résidus] — 2026-06-03

Suite de l'initiative couple (A1) et des résidus money. Priorité = impôt **par conjoint**
en retraite (plus gros impact). Discipline : invariant des baselines (couple de même
âge/revenu → impôt inchangé), trust-but-verify sur l'état réel du code.

### A1 — Impôt de retraite PAR conjoint (chacun sur sa pension réelle)
- **Bug** : le bloc retraité de `taxDecember.ts` splittait le revenu de retraite ÉGALEMENT
  (`taxableReal / activeUsersCount`). Sous un barème progressif, le split égal **minimise**
  l'impôt → sous-estimation pour un couple à revenus de retraite inégaux. (Le volet
  *crédits* par conjoint était déjà fait — B-AUDIT-3 ; c'est le *revenu* qui restait splitté.)
- **Fix** : `computeRetirementIncome` expose désormais une décomposition `perUser` (RRQ/PSV
  attribués par conjoint selon SON ratio salaire/MGA et SA résidence — ces ratios étaient
  déjà calculés puis MOYENNÉS ; on les conserve). `taxDecember` taxe chaque conjoint sur SA
  pension + sa part ÉGALE des composantes non attribuables. Repli sur le split égal si la
  décomposition est absente/incohérente (solo, etc.).
- **Invariant** : couple à revenus de retraite ÉGAUX → impôt identique (delta 0, vérifié).
  Couple inégal → impôt ≥ split égal (sens correct). Ex. pension 4 500$/1 500$ + 40 k$ de
  retraits REER : +427$/an d'impôt de retraite.
- **Limite honnête (documentée dans le code)** : les rentes gouvernementales (`accRentesYear`)
  et les retraits REER/FERR (`accRetraitsReerYear`) restent répartis ÉGALEMENT — le moteur ne
  les attribue pas par conjoint. La pension privée DB (« cumulée pour le couple ») et le SRG
  (familial) aussi. Lever cela exige un suivi PAR CONJOINT des comptes REER/FERR (structure de
  données, hors scope → décision de Marc).
- +10 tests (invariant somme perUser == total ; RRQ/PSV inégaux vs égaux ; impôt égal==historique,
  inégal>égal, replis).

### ITEM 2b — calculateGrossFromNet : borne haute extensible (très hauts revenus)
- **Bug** : dichotomie bornée à `[net, 2×net]`. Dès que le taux moyen dépasse 50 % (~600 k$
  net au QC), le brut requis > 2×net → convergence vers la borne, brut sous-estimé (−9 k$ à
  600 k$ ; −101 k$ à 2 M$).
- **Fix** : doublement de la borne haute jusqu'à `net(high) > cible`, puis dichotomie (40 itér).
  Round-trip net→brut→net sous 1 $ jusqu'à 5 M$. +1 test.

### ITEM 2d — Dividendes Non-Reg empilés progressivement (résiduel B-AUDIT-2)
- **Bug** : dividendes éligibles taxés à un taux marginal PLAT au revenu de base, puis CID. Sur
  un revenu modeste, un gros dividende renvoyait souvent un impôt de **0** (le CID annulait
  l'impôt brut au bas taux) alors que le dividende majoré pousse en réalité dans les hauts paliers.
- **Fix** (miroir B-AUDIT-2) : le dividende MAJORÉ s'empile → impôt brut = bande
  `impôt(revenu+majoré) − impôt(revenu)`, CID inchangé. Param optionnel `progressiveGrossTax` ;
  sans lui → calcul plat (rétro-compat). Petit dividende dans le même palier → empilé ≈ plat
  (zéro baseline décalée). Ex. 50 k$ revenu + 30 k$ dividende : 0$ → 3 211$ ; +100 k$ : 0$ → 20 654$.
  +3 tests.

### ITEM 2a — Indexation des paliers par simInflation : NON corrigé (décision Marc requise)
- **Investigué, fix proposé écarté car INCORRECT.** Le moteur déflate le revenu en dollars réels
  2026 (÷ `(1+simInflation)^t`), calcule l'impôt « réel » avec des paliers indexés (+2 %/an codé
  en dur), puis réinflate (× `(1+simInflation)^t`). Le fix proposé (indexer les paliers par
  `simInflation`) a été **vérifié numériquement et rejeté** : il aggrave fortement le cas dominant
  (revenu réel). À simInflation=5 %, t=20 ans : la réf. ARC réaliste (revenu nominal vs paliers
  indexés à l'inflation) donne ~29 353$ ; le fix « index par simInflation » donne ~7 712$ (pire
  que l'actuel ~22 313$).
- **Cause racine plus profonde** : l'aller-retour déflate→impôt→réinflate est **intrinsèquement
  lossy** car l'impôt n'est PAS homogène (BPA + crédits en dollars FIXES brisent l'invariance
  d'échelle). L'écart vs la réf. ARC réaliste atteint 12–60 % à forte inflation / long horizon,
  **même à simInflation=2 %**, et AUCUN choix de taux d'indexation (ni `simInflation`, ni 0) ne le
  corrige par cet aller-retour.
- **Décision Marc** : le correctif propre = calculer l'impôt sur le revenu **NOMINAL** avec paliers
  indexés par `simInflation` (supprimer l'aller-retour déflate/réinflate). C'est un changement
  structurel touchant ~12 sites d'appel (convention réel↔nominal incohérente aujourd'hui : la
  réconciliation de revenu/FERR/latent passe du RÉEL ; succession/gains/dividendes/affichage
  passent du NOMINAL) et reblesserait de nombreuses baselines. À arbitrer hors de cette PR.

### ITEM 2c — Gates de timing par conjoint (FERR 72, reset REER 71, bonus PSV 75+) : bloqué structurellement
- **Investigué ; non corrigeable de façon bornée et cohérente.** (1) FERR 72 et reset REER 71
  (`taxJanuary.ts`) opèrent sur le **pool REER ménage** (`reer`) et l'**espace REER ménage**
  (`rrspRoom`) — scalaires, **aucun** suivi par conjoint (confirmé : zéro `reerMarc/reerAnna`,
  zéro room par user). Les attribuer par âge de chaque conjoint exige des soldes REER par conjoint
  (changement structurel partout où `reer` circule). (2) Bonus PSV 75+ (`retirementIncome.ts`) :
  techniquement faisable maintenant (split PSV par conjoint dispo), mais tout le **timing** des
  rentes (âges de début RRQ 60 / PSV 65, facteurs de report, gate `isRetired`) suppose un **âge
  principal unique** partagé. Corriger SEULEMENT le bonus 75+ serait un demi-fix incohérent
  (pourquoi l'âge du bonus et pas celui du début de PSV ?). Le fix propre = rendre
  `computeRetirementIncome` per-conjoint de bout en bout (timing inclus) → décision de Marc.
- *Note* : la fermeture CELIAPP à 71 ans utilise DÉJÀ correctement `allUsersExceeded71` (par conjoint).

Suite **1548 verts** (132 fichiers, +14 tests), tsc + eslint propres, zéro régression.

---

## [unreleased — Fix · warning React clés dupliquées CELI/REER (Dashboard)] — 2026-05-29

Au chargement du Dashboard (onglet Accueil), la console émettait des warnings React
répétés « Encountered two children with the same key, `CELI` » (et `REER`) — reproduits
sous le persona « Diane & Robert ». Régression du suivi G8/G9 (le warning n'avait été
que *noté* non-bloquant, cf. plus bas, jamais corrigé).

### Corrigé
- **Cause racine** : un compte cash peut porter le même nom qu'une catégorie
  d'investissement hardcodée. Le persona a `initialBalances: { CELI: 0, REER: 0, … }`,
  donc `cashAccountsList` contenait déjà 'CELI'/'REER', puis `Dashboard.tsx` faisait
  `.concat(['Immobilier','CELI','REER',…])` → les clés 'CELI'/'REER' apparaissaient
  **deux fois** dans `accountKeys`, alimentant les chips de bascule (`key={key}`) et les
  séries recharts (rendu non garanti). Seules 'CELI'/'REER' collisionnaient exactement
  ('CRYPTO'≠'Crypto', 'NON-ENREG'≠'NonReg'), cohérent avec les deux warnings observés.
- **Fix** (`components/Dashboard.tsx`) : dédoublonnage de `combinedKeys` via `new Set`
  (ordre préservé, cash d'abord). Le dataset ne porte qu'une valeur par clé
  (`point.CELI`/`point.REER` agrègent l'investissement), le dédoublonnage est donc exact.
- **Régression** : `tests/components/Dashboard.duplicateKeys.test.tsx` monte le vrai
  Dashboard sous le scénario Diane & Robert et vérifie (a) aucun `console.error`
  « same key », (b) un seul chip par compte. 1209 tests verts.

---

## [unreleased — Feature · Sync Google Drive] — 2026-05-29

### Correctif money — B-AUDIT-3 : crédits d'âge/pension PAR conjoint (2026-06-01)
- **Bug** : `taxDecember.ts` appliquait l'âge de Marc (`ctx.age`) aux DEUX conjoints pour les crédits
  d'âge/pension (crédit d'âge fédéral + ligne 361 QC). Erreur ~1,5-2,5 k$/an pour les couples à âges décalés
  (ex. Marc 67 → Anna 60 recevait à tort le crédit d'âge ; ou l'inverse, Anna 67 → crédit manqué).
- **Fix** : nouveau champ `ageSpouse` dans `DecemberContext`, threadé depuis `projection.ts`
  (`config.users[1].age + yearsElapsed`). Le **bloc actif** (déjà 2 appels par conjoint) et le **bloc
  retraité** (splitté en per-conjoint) utilisent désormais chacun l'âge du bon conjoint. **Propriété de
  sûreté** : couple de même âge → `taxMarc + taxAnna` == ancien per-adulte × N → **aucune baseline décalée**.
- **TDD** : +2 tests à barème réel (retraité 70/60 → impôt > 70/70 ; actif 65+/conjoint <65). RED→GREEN.
- **Hors périmètre (gates de timing, suite)** : conversion FERR à 72 ans, reset espace REER à 71 ans, bonus
  PSV +10 % à 75 ans restent gatés sur l'âge principal. Ce sont des événements de TIMING par conjoint (vraie
  2e piste d'âge) — changement plus profond, consigné dans BACKLOG.
- Suite **1440 verts**, tsc + eslint propres, zéro régression.

### Correctif money — B-AUDIT-2 : gains en capital imposés en progressif (empilés) (2026-06-01)
- **Bug** : `taxDecember.ts` imposait les gains en capital à un **taux marginal plat** calculé sur le revenu
  AVANT le gain (`taxableGains × getMarginalRate(revenu)`). Un gros gain qui franchit un palier était donc
  sous-imposé (tout le gain au taux d'entrée au lieu du barème progressif sur la bande).
- **Fix** : impôt **incrémental empilé** = `impôt(revenu + gains) − impôt(revenu)` via `calculateFiscalReport`
  (champ `totalTax` = fédéral abattu + provincial), par adulte puis ×N. Le BPA s'annule dans la soustraction.
  **Propriété de cohérence** : un gain qui reste dans le même palier donne un incrément ≈ `gain × taux marginal`
  (identique à l'ancien) → **aucune baseline d'intégration décalée**. Seuls les gains franchissant un palier
  changent (correctement, à la hausse).
- **TDD** : nouveau test à **barème réel** prouvant l'empilement (gros gain → impôt > flat) + test de cohérence
  (petit gain ≈ flat). Les ~5 tests à stub plat existants reworkés sur le nouveau mécanisme (`STUB_RATE` au lieu
  de `STUB_MARGINAL`, le stub `calculateFiscalReport` étant linéaire → reproduit le résultat linéaire).
- **Hors périmètre** : les **dividendes** Non-Reg utilisent encore `calculateDividendTax(div, tauxMarginal)`
  (mécanisme de crédit d'impôt sur dividendes distinct) — leur empilement est un raffinement séparé, plus petit.
- Suite **1438 verts**, tsc + eslint propres, zéro régression.

### Échecs silencieux — SF-2 market data (lot SF complet) (2026-06-01)
- **SF-2** : les providers de cours (`finnhub.ts`, `coingecko.ts`) attrapaient TOUTES les erreurs en
  `console.warn` + retour `null`/`[]` → une erreur réseau ou une **clé invalide** produisait le même signal
  qu'un symbole inconnu → cours périmé/absent SILENCIEUX. Nouveau helper partagé `providerError.ts`
  (`logProviderError`) qui **distingue** : `NOT_FOUND` (symbole/crypto inconnu = légitime → pas de log) ·
  `AUTH` (clé invalide = action requise → severity `error`) · réseau/rate-limit/inconnu → `warning`. Le
  contrat de retour (null/[]) des méthodes reste inchangé (dégradation propre, portefeuille toujours affiché).
  +2 tests (erreur 500 → `logError` ; 404 NOT_FOUND → PAS de `logError`).
- **Le lot « échecs silencieux » est COMPLET** : SF-1 (backupAuto), SF-3 (sync/IA), SF-2 (market data).
  Suite **1436 verts**, tsc + eslint propres, zéro régression.

### Échecs silencieux — lot SF-1 + SF-3 (« ne jamais avaler les erreurs ») (2026-06-01)
- **SF-1 `backupAuto.ts`** : les 6 catches (createBackupNow / restoreBackup / listBackups / deleteBackup /
  clearAllBackups / initAutoBackup) utilisaient `console.warn` → invisible en prod (aucune console ouverte,
  pas de backend) → un échec de **backup/restauration** était donc silencieux côté utilisateur. Convertis en
  `logError` (logger borné, alimente diagnostics/UI) en gardant le contrat de retour (null/[]/false/void).
  +1 test (échec IndexedDB → `logError` appelé). C'est l'alignement sur le pattern déjà utilisé par
  `tryGetDeviceKey` dans le même fichier.
- **SF-3** : `claude.ts` (categorizeBatch / detectSubscriptionsAI) passait par `console.error` → `logError`
  (`source: 'ai'`). `syncOrchestrator.ts` (pull) : le déchiffrement raté des clés API était un `catch {}`
  totalement muet → `logError` (warning) pour signaler « clés non restaurées, reconfigurer dans Paramètres »
  (les données financières, elles, sont bien restaurées).
- **Choix de stratégie** (décision Marc « sois réaliste ») : **logguer sans changer le contrat de retour**
  plutôt que propager une exception — sur du local-first sans backend, faire remonter au milieu d'un backup
  auto en arrière-plan casserait des flux ; logguer rend l'échec visible sans risque.
- Suite **1434 verts**, tsc + eslint propres, zéro régression. **SF-2 (market data : erreur réseau/AUTH
  masquée en NOT_FOUND) reste à faire** (distinction de types d'erreur, batch séparé).

### Correctifs bugs money — B-AUDIT-1 (bonus/RSU chômage) + B-AUDIT-4 (ratio RRQ) (2026-06-01)
- **B-AUDIT-1** : pendant un chômage/invalidité, le bonus et les RSU de Marc (revenu d'EMPLOI)
  continuaient d'alimenter le revenu NET **et** le brut REER. Réaliste (décision Marc « sois réaliste ») :
  ils cessent quand on quitte l'employeur → gated par `marcEmploymentActive` dans `activeIncome.ts`. Le
  side income (travail autonome) est conservé (c'est du revenu gagné). +7 tests RED→GREEN.
- **B-AUDIT-4** : le ratio RRQ (`currentGross / MGA`) comparait un salaire NON indexé à une MGA projetée
  (indexée) → ratio rétréci → RRQ sous-évaluée pour les départs lointains. Fix : indexer le salaire par le
  même facteur (inflation + 0,5 %) → ratio earnings/MGA stable sur la carrière. +1 test.
- Suite **1433 verts**, tsc + eslint propres, **zéro régression** (aucune baseline d'intégration décalée).
- **B-AUDIT-2 (gains en capital empilés) REPORTÉ** : le fix change un comportement fondamental (impôt
  linéaire → progressif) explicitement caractérisé par ~5 tests à stub plat → mérite sa session dédiée
  (rework du modèle de stub + revue des baselines avec gains). Le rusher serait l'imprudence money-engine
  à éviter. B-AUDIT-3 (impôt par conjoint) reste en attente d'un go explicite (gros refactor).

### Audit complet (5 agents parallèles) + correctif sécurité C1 + tests retraite (2026-06-01)
- **Demande Marc** : « plus de tests + analyse complète : le projet est-il 100 % fait, trouve tous les
  bugs et corrige-les, recommandations ». 5 agents lecture-seule en parallèle (sécurité, bugs moteur,
  trous de tests, échecs silencieux, complétude). Findings **vérifiés manuellement** (« trust but verify »
  — 2 findings d'agents étaient surévalués/faux : ex. l'« écrasement de `financeai-storage` via un nom de
  profil » est impossible, le préfixe `profile_` l'empêche).
- **Correctif sécurité C1** : `getRebalanceJustifications` (`services/claude.ts`) interpolait
  `label / secteur / région` dans le prompt IA SANS `sanitizePromptText` / `wrapUserData`, alors que ses
  jumelles (`categorizeBatch`, `detectSubscriptionsAI`) le faisaient → injection de prompt possible via un
  nom d'actif. Fix : helper pur exporté `buildRebalancePrompt` qui sanitize chaque champ + encadre le bloc
  en `<DONNEES>`. +3 tests anti-injection (RED→GREEN).
- **Tests** : +9 sur `retirementIncome.ts` (le #1 trou de couverture) : report de rentes (1.42 / 1.36),
  bonus PSV +10 % exact à 75 ans, mode survivant (×0.8 RRQ), prorata immigrant <10 ans → PSV 0, écrêtement
  PSV clampé ≥ 0, rentes nulles avant l'âge, DB à partir de l'âge. Suite : **1425 verts** (123 fichiers),
  tsc + eslint propres, **zéro régression**.
- **Verdict complétude** (analyste) : ~90 % pour l'usage solo (Marc derrière Cloudflare), mais **~72 %
  comme produit multi-utilisateurs fiable**. Les 3 derniers mètres solo→multi-user ne sont pas franchis :
  sync Drive jamais prouvée en réel (Client ID absent), Cloudflare verrouillé sur l'email de Marc, clé
  Anthropic exposée côté navigateur (`dangerouslyAllowBrowser`). Plan P0/P1/P2 dans `docs/BACKLOG.md`.
- **Bugs fiscaux confirmés mais NON corrigés ce cycle** (chacun = TDD ciblé + parfois décision de
  modélisation — consignés dans `docs/BACKLOG.md` § « Bugs audit 2026-06-01 ») :
  - [money] revenus variables (bonus/RSU) NET de Marc non réduits pendant chômage/LTD (jumeau du fix REER) ;
  - [money] gains en capital imposés au taux marginal NON empilé → sous-estimation d'impôt sur gros gains ;
  - [money] crédits d'âge/pension basés sur l'âge de Marc pour les DEUX conjoints (couples à âges décalés) ;
  - [money, faible impact] SRG inclus dans le revenu du clawback PSV (mais un bénéficiaire du SRG est sous le seuil) ;
  - [money, mineur] ratio RRQ : salaire courant non indexé vs MGA projeté → RRQ sous-évaluée pour départs tardifs.

### Correctif — sur-cotisation REER pendant chômage/invalidité (money) (2026-06-01)
- **Symptôme** : pendant un mois de chômage (AE 55 %) ou d'invalidité (LTD 60 %), le moteur réduisait
  bien le revenu NET de Marc, mais le BRUT servant à l'espace REER (`accGrossAdd` → `accGrossIncomeYear`
  → `newRrspRoom = 18 %` en janvier, `taxJanuary.ts:151`) restait PLEIN.
- **Cause racine** : `activeIncome.ts` appliquait les réductions 0.55/0.60 au seul revenu net, jamais au
  brut REER. Or l'assurance-emploi et l'assurance-invalidité ne sont PAS du « revenu gagné » (art. 146(1)
  LIR) → elles ne génèrent aucun droit de cotisation REER. Conséquence : espace REER surévalué →
  sur-investissement REER possible les années suivantes (`cashflowAllocation` remplit jusqu'à `rrspRoom`).
  Ex. 100k$, 6 mois de chômage : ~18k$ d'espace généré au lieu de ~9k$ réels.
- **Fix (minimal)** : le brut d'emploi de BASE de Marc est neutralisé pendant les mois de chômage/LTD
  (mêmes gates que la réduction du net). Seul Marc est concerné (Anna inchangée). +4 tests RED→GREEN,
  suite complète **1413 verts**, zéro régression.
- **Hors périmètre** (faible matérialité, à trancher) : pendant le chômage, le bonus/RSU de Marc
  continuent d'alimenter le brut REER alors qu'en réalité ils cesseraient ; le side income (travail
  autonome) est lui correctement conservé (c'est du revenu gagné).

### Tests — +135 tests sur les zones à risque (moteur argent + sync) (2026-05-29)
- Demande Marc : « beaucoup de tests pour que tout marche 100 % sans bugs » + checklist manuelle vivante.
- **Checklist manuelle** : nouvelle section `✅ TESTS MANUELS À FAIRE (Marc)` en tête de `BACKLOG.md`
  (sync, clés chiffrées, zoom, chargement, salaire, Cloudflare). Repeuplée à chaque livraison.
- **+135 tests automatisés** (caractérisation + invariants, mutation-validés) sur les modules
  money-critical historiquement sous-testés (audit) + chemins d'échec sync :
  - `taxDecember.ts` (fiscal le plus dense, 0 test → **46**) : OAS clawback, RAMQ, FSS, gains >250k,
    dividendes, T1213, actif vs retraité.
  - `cashflowAllocation.ts` branche shortfall (**44**) : cascade de retraits, PBMA 0 %, cap OAS, banque de pertes.
  - `activeIncome.ts` (**30**) : chômage 0.55, LTD 60 %, bonus/RSU lissés, survivorMode.
  - `syncOrchestrator` chemins d'échec (**15**) : token KO → `'error'` + meta NON corrompue, pas de crash,
    données locales préservées. Confirme l'invariant anti-perte.
- Total suite : **1409 tests verts** (123 fichiers). 5 comportements suspects relevés par les agents
  (non corrigés) consignés ci-dessous pour arbitrage.

#### À trancher (comportements relevés en testant — pas des bugs confirmés)
- ~~**[money] `activeIncome` `accGrossAdd`** : cotisation REER calculée sur le brut PLEIN pendant
  chômage/invalidité~~ → **CONFIRMÉ et CORRIGÉ le 2026-06-01** (voir Correctif en tête de section).
- **[modélisation, doc OK]** gains >250k : inclusion 50 % uniforme (palier 66.67 % retiré mars 2025) ·
  crédit 65+ couple basé sur Marc · FSS exclut les travailleurs autonomes · OAS clawback : 2 indexations.
- **[cashflow]** seuil critique de liquidités = contrainte sur la 1re ponction seulement (le net retiré
  est recrédité) · retrait REER sous-couvre le shortfall de la retenue (le bucket suivant éponge).

### Sécurité — clés API CHIFFRÉES dans Drive (C1, sans passphrase) (2026-05-29)
- **Avant** : les clés API (Anthropic, Finnhub) partaient EN CLAIR dans le fichier Drive (`apiKeys`,
  `enc:false`). **Décision Marc** : « crypte mais pas de passphrase ».
- **Fix** : nouveau `services/sync/keyCipher.ts` — la clé de chiffrement (AES-GCM 256) est DÉRIVÉE du
  `sub` Google (PBKDF2), donc déterministe → **cross-appareils sans passphrase**. L'enveloppe stocke
  désormais `apiKeysEnc` (blob chiffré) au lieu de `apiKeys`. Push chiffre, pull déchiffre via le `sub`.
  **Rétro-compat** : un ancien blob en clair (`apiKeys`) est encore lu, puis ré-écrit chiffré au push
  suivant. `sub` récupéré via `fetchUserIdentity` + persisté dans la meta (`connectedSub`). Best-effort :
  si crypto/`sub` indispo, on pousse SANS les clés (jamais en clair).
- **Honnêteté** : `sub` n'est pas secret (il est dans le jeton) → ça sort les clés du clair mais ne
  protège PAS contre un vol du compte Google (zéro-connaissance = passphrase, déclinée). Documenté.
- Tests : `keyCipher` (round-trip, mauvais sub, altération — 5) + round-trip push→pull dans le flow
  test (le blob ne contient jamais la clé en clair). 1274 tests verts.

### UX — écran de chargement pendant le calcul de la courbe Futur (2026-05-29)
- **Demande Marc** : « quand ça calcule la courbe, je veux pas voir la (vieille) courbe mais un petit
  écran de chargement ». Avant : le `ComposedChart` restait rendu pendant le recalcul (Monte Carlo en
  worker, 1,5-3 s) → ancienne courbe visible / clignotement.
- **Fix** : pendant `isComputing`, le conteneur du graphe affiche un état de chargement (spinner +
  « Calcul de ta projection… ») **à la place** de la courbe, de la MÊME hauteur (`h-[380px]/500/650`)
  → zéro décalage de mise en page, jamais de courbe partielle/périmée. `components/FutureProjection.tsx`.

### Perf — zoom 100 % fluide sur TOUS les graphes (coalescence rAF) (2026-05-29)
- **Problème** : molette/pan émettent 60-120 events/s ; chaque event faisait un `setRange` synchrone
  → re-render complet du graphe (8 aires + barres + ~64 ReferenceDot) à chaque event → thread saturé
  → zoom saccadé. Touchait TOUS les graphes (hook partagé `hooks/useTimeChartZoom.ts` : Futur,
  Dashboard, Investissements, Dette, Immobilier, Retraite, Enfant).
- **Fix** : coalescence en `requestAnimationFrame` — au plus UN `setRange` (un re-render) par frame.
  La cible est suivie en synchrone (`rangeRef`) pour que les events d'un même burst se composent.
  Actions discrètes (période, reset) commitent immédiatement (annulent le frame en attente) ; nettoyage
  du frame au démontage. +2 tests (renderHook : burst molette → 1 commit ; reset). Correction centralisée
  dans le hook → bénéficie à tous les graphes d'un coup.

### Corrigé — bug MONEY-CRITICAL : `grossSalary` annuel stocké comme mensuel (2026-05-29)
- **Bug** : 3 chemins de saisie stockaient le salaire BRUT en **annuel**, alors que la convention
  canonique du store est **mensuelle** (le moteur ré-annualise ×12). Résultat : revenu ~12× trop
  haut → impôt/cotisations/projection faux pour les utilisateurs onboardés ou via scan de paie.
  - `Onboarding.tsx` (« Salaire brut annuel » stocké tel quel),
  - `PayslipUploadCard.tsx` (brut ET net annuels stockés),
  - `TaxCenter.tsx` (`grossSalary: Math.round(scannedPay.gross) // always stored as annual`).
- **Fix** : helper pur partagé `utils/salary.annualSalaryToMonthly()` (÷12 arrondi, garde 0/NaN) câblé
  dans les 3 chemins → stockage MENSUEL cohérent. Les libellés UI restent « annuel » (saisie annuelle,
  stockage mensuel). +3 tests garde (`tests/utils/salary.test.ts`). Saisie manuelle + personas déjà
  mensuels → non touchés.

### Durci — verrou anti-double-sync + unification état-vide + snapshot (2026-05-29, suite 5)
- **Audit 4 agents** (sécurité, archi, tests, frontend) → snapshot visuel `docs/SNAPSHOT_2026-05-29.md`.
- **Verrou anti-double-sync** (`syncOrchestrator.runDecision`) : au boot avec le gate actif,
  `gateSilentResume` ET `runBootSync` (T+2,5 s) pouvaient lancer deux décisions concurrentes →
  double pull/rehydrate, voire double `createSyncFile` (fichier Drive en double). `_decisionInFlight`
  déduplique : un appel concurrent réutilise la décision en vol. +1 test (déterministe).
- **Unification « état vide »** : `computeIsEmpty` (sync) et `hasMeaningfulData` (onboarding)
  encodaient la même notion avec des listes divergentes (13 vs 6 tableaux) → un état avec seulement
  budget/voyages était « non-vide » pour la sync mais « vide » pour l'onboarding. Liste CANONIQUE
  partagée `DATA_ARRAY_KEYS` (`utils/onboarding`). +1 test.
- **Docs** : commentaires « reload » périmés alignés sur la réhydratation en place (le module
  anti-perte ne recharge plus la page). 1263 tests verts.
- **Arbitrages sécu laissés à Marc** (pas corrigés aveuglément car ils dégraderaient l'UX / le
  multi-appareils) : C1 clés API en clair dans Drive → nécessite une **passphrase** (la clé de device
  casse le multi-appareils) ; C2 token en sessionStorage → le retirer ré-introduit la reconnexion en
  navigation privée. Documentés dans le snapshot.

### Corrigé — l'onboarding écrasait les profils + clés restaurés (2026-05-29, suite 4)
- **Symptôme Marc** : après restauration, l'âge de retraite et l'espérance de vie revenaient, mais
  **jamais les profils utilisateurs ni les clés API**.
- **Cause** : l'écran d'onboarding « nouvel utilisateur » s'affichait (car la détection « a des données »
  ne regardait QUE transactions+actifs → une restauration profil/retraite sans transactions était vue
  « vide »). En se terminant, `Onboarding.handleFinish` fait `setAppState({ config, apiKeys, … })` →
  **écrasait `config.users` (profils) ET `apiKeys` (clés)** par les valeurs vides du formulaire.
  `retirementGoal` n'étant pas dans l'onboarding, il survivait → d'où le symptôme exact.
- **Fix (3 protections)** :
  1. `applyPulledPayload` pose `app_onboarding_done` dès qu'une restauration a lieu (restaurer =
     utilisateur existant → jamais d'onboarding).
  2. `hasMeaningfulData` (nouveau, dans `utils/onboarding`) reconnaît un **profil renseigné** (nom ou
     salaire) ou tout tableau de données (dettes, objectifs…), pas seulement transactions/actifs.
  3. Garde **réactive** dans `App` : si des données arrivent après le mount (restauration asynchrone),
     l'onboarding se masque tout seul → il ne peut plus écraser les profils/clés. +4 tests.

### Corrigé — jeton persistant : fini la reconnexion à chaque rafraîchissement (2026-05-29, suite 3)
- **Symptôme Marc** : connexion Drive qui saute à chaque rafraîchissement → bouton « Sauvegarder » grisé
  (= déconnecté), restauration qui échoue tant qu'on n'a pas re-cliqué « Connecter », reconnexions à
  répétition. La sync finissait par marcher (le changement privé→principal est bien arrivé) mais au prix
  de nombreuses manips.
- **Cause** : le jeton Google ne vivait **qu'en mémoire** → perdu à chaque refresh → l'app se croyait
  déconnectée jusqu'à une ré-auth silencieuse, souvent **bloquée en navigation privée** (cookies tiers).
- **Fix** : `gisAuth` persiste le jeton en **`sessionStorage`** (clé `financeai:gis:token:v1`) → il survit
  aux rafraîchissements (jusqu'à ~1 h ou fermeture de l'onglet). `getValidAccessToken`/`getCachedToken`
  le restaurent ; `revokeAccess` l'efface. Jeton de portée `drive.appdata` + email, pas un secret long
  terme. Résultat : **on reste connecté** après un refresh → l'auto-sauvegarde et la restauration ne
  réclament plus de reconnexion. +4 tests.

### Corrigé — restauration EN PLACE (sans reload) : onboarding + sauvegarde + 1 login (2026-05-29, suite 2)
- **Symptômes Marc** : après login au gate → écran « nouvel utilisateur » (onboarding) + données pas
  restaurées (restauration manuelle obligatoire) + « ça n'enregistre pas mes données ».
- **Cause racine commune : `window.location.reload()`** dans la restauration. Le reload (a) perdait le
  jeton Google (en mémoire) → `connected` repassait à false → l'auto-push ne partait plus
  (« ça n'enregistre pas ») ; (b) faisait clignoter l'onboarding « nouvel utilisateur » avant l'arrivée
  des données ; (c) imposait potentiellement un 2e login.
- **Fix** : `applyPulledPayload` réhydrate désormais le store **en place** via `persist.rehydrate()`
  (Zustand v5) au lieu de recharger la page. Les clés API sont aussi injectées dans le store vivant
  (`updateApiKeys`) tout de suite. Résultat : les données apparaissent sans rechargement, la session
  reste connectée (→ l'auto-push fonctionne), pas d'onboarding parasite. La carte Réglages confirme la
  restauration par un toast (plus de reload).
- **Test d'intégration (demande Marc « teste toi-même »)** : `tests/services/syncOrchestrator.flow.test.ts`
  rejoue tout le flux avec Drive/Google mockés et **prouve** que (1) `gateSilentResume` et
  `connectAndSync` restaurent les vraies données dans le store (profil, retraite, espérance de vie,
  documents, transactions, actions) sans reload, en restant connecté ; (2) `pushNow` **embarque
  l'intégralité** du state local (rien de tronqué). +4 tests.

Synchronisation des données dans le **Drive de chaque utilisateur** (dossier caché `appDataFolder`)
pour les retrouver sur un autre appareil / en navigation privée après login Google. Conçu +
approuvé par Marc (design : `docs/GOOGLE_DRIVE_SYNC_DESIGN.md`). **Livré « dark »** : inerte tant
que `VITE_GOOGLE_CLIENT_ID` n'est pas défini (carte masquée, zéro appel) → aucun impact prod
jusqu'à activation. Activation : `docs/GOOGLE_DRIVE_SETUP.md`.

### Ajouté (par batches isolés, CI verte)
- **S1 — cœur logique anti-perte (pur, testé)** : `services/sync/syncEngine` (matrice
  `decideOnLoad` pull/push/conflict/noop, garde « jamais d'écrasement d'une cible plus récente »),
  `syncState` (métadonnées locales + deviceId), `syncTypes`. 23 tests.
- **S2 — intégration Google** : `services/googleDrive/gisAuth` (token GIS, scope `drive.appdata`)
  + `driveAppData` (REST appData find/create/read/update, fetch injectable, erreurs typées). 23 tests.
- **S3 — câblage + UI** : `syncOrchestrator` (glue + statut observable, snapshot sans clés API,
  apply avec backup d'assurance + reload, push debouncé), carte `GoogleDriveSyncCard` (Réglages →
  Système), boot sync + abonnement store dans `App.tsx`, CSP élargie à Google (index.html +
  netlify.toml), `VITE_GOOGLE_CLIENT_ID` (`.env.example` + `vite-env.d.ts`). 7 tests helpers.
- **S4 — suppression des données cloud** : `deleteSyncFile` (DELETE idempotent, 404 toléré) +
  `deleteRemoteData` (supprime le blob Drive puis déconnecte). Bouton « Supprimer mes données de
  Google Drive » dans la carte (confirmation 2 clics ; les données locales restent). +3 tests.
  Vérifié au navigateur : carte visible, CSP OK, flux OAuth s'initie (faux Client ID → invalid_client).
- **R1 — clés API synchronisées** : `apiKeys` incluses dans l'enveloppe (push) + ré-appliquées via
  `secureKeyStore` au restore (pull). Rétro-compat v1 (champ absent = ancien blob). +2 tests.
- **R2 — login Google unique + restauration automatique** (livré « dark », flag séparé) :
  `LoginGate` (enveloppe l'app dans `index.tsx`) → au boot, reprise **silencieuse** (zéro clic si
  session Google active), sinon écran « Se connecter avec Google » ; la connexion déclenche le
  **pull auto**. Un seul login sert l'accès à l'app ET la sync (remplace le rôle de Cloudflare
  Access). `authGate` (décision pure : capacité + activation + trappe anti-lockout),
  `gateSilentResume` (orchestrateur), `gisAuth` durci (`error_callback` + timeout → plus de boot
  figé sur un échec silencieux). Nouveau flag **`VITE_GOOGLE_GATE`** (défaut off) **distinct** de
  `VITE_GOOGLE_CLIENT_ID` : le gate ne s'active que si les deux sont là → « déployer ≠ activer ».
  Trappe anti-lockout : `?nogate=1` ou « continuer sans me connecter ». +20 tests.

### Corrigé — le mode test ne contamine plus la sync (2026-05-29)
- **Bug critique de perte de données** : `isTestMode`, `realDataSnapshot` et `activeTestPersonaId`
  étaient persistés dans `financeai-storage` (oubli dans `partialize`). Conséquence : en mode test,
  l'auto-push poussait les **données du persona** dans Drive et **écrasait la vraie sauvegarde** ;
  une « Restauration » ramenait alors des données de démo (symptôme Marc : espérance de vie + config
  utilisateur revenues aux valeurs par défaut).
- **Fix (3 volets, TDD)** : (1) `partialize` exclut désormais les 3 champs de mode test → jamais
  persistés ni synchronisés ; (2) garde `shouldPush(isEmpty, isTestMode)` + `pushNow` refusent de
  pousser en mode test ; (3) migration **v6 → v7** : un blob figé en mode test est auto-réparé
  (vraies données restaurées depuis `realDataSnapshot`, champs de test purgés). `migrate` extrait
  en `migratePersistedState` (exporté, testable). +6 tests.

### Corrigé / Doc — finitions sync (2026-05-29)
- **Onboarding « du début » réapparaissait après une restauration** : `isFirstLaunch` ne regardait
  que le flag local `app_onboarding_done` (non synchronisé). Sur un nouvel appareil / en navigation
  privée, un restore Drive ramenait les données mais pas le flag → l'écran d'accueil s'affichait à
  tort. Fix : `utils/onboarding.ts` `shouldShowOnboarding(flag, hasData)` — on n'accueille plus un
  utilisateur qui a déjà des transactions/actifs. +4 tests.
- **Texte UI périmé corrigé** : la carte de sync (et `GOOGLE_DRIVE_SETUP` / `SESSION_HANDOVER`)
  affirmait encore « clés API jamais synchronisées » — faux depuis R1. Remplacé par un message
  honnête (clés incluses, en clair, lisibles via le compte Google).
- **ADR 010** (`docs/adr/010-auth-google-in-app-gate.md`) : acte le login Google in-app comme gate
  d'accès, supersede partiellement l'ADR 007 (note ajoutée à 007 + index README). Réf ADR corrigée
  dans `SYNC_V2_DESIGN` (008 → 010, 008/009 étant déjà pris).

### Corrigé — sauvegarde « vide » + faux toast « Sauvegardé » (2026-05-29)
- **Bug bloquant** : `computeIsEmpty` ne comptait QUE les transactions et les actifs. Un setup
  « profil + salaire + retraite » (sans transaction ni placement) était jugé **vide** → `pushNow`
  sautait l'écriture… mais le bouton affichait quand même **« Sauvegardé vers Google Drive »**
  (faux positif). Résultat : Drive restait vide, et « Restaurer » ne ramenait rien (symptôme Marc).
- **Fix** : (1) `computeIsEmpty` reconnaît désormais toute donnée utilisateur réelle — n'importe
  quel tableau de données non vide (transactions, actifs, dettes, objectifs…) **ou** un profil
  renseigné (nom ou salaire) ; le défaut frais (`users` sans nom/salaire + tableaux vides) reste
  « vide » → garde anti-écrasement en navigation privée préservée. (2) `pushNow` retourne un
  `PushResult` typé et la carte affiche un message **honnête** : « Sauvegardé », « Rien à
  sauvegarder » ou « Mode test actif » — fini le faux « Sauvegardé ». +5 tests.

### Corrigé — UNE seule connexion + restauration fiable au gate (2026-05-29, suite)
- **Problème (test Marc) : 3 connexions** (Cloudflare + Google + Google encore) **+ restauration
  manuelle obligatoire + données incomplètes**. Causes : (a) la 1ʳᵉ règle `restoreIntent` ne couvrait
  que l'appareil « jamais synchronisé » (méta vierge) — sur un appareil avec une méta accumulée (tests
  répétés), le gate retombait en `conflict`/`noop` → pas de restauration auto ; (b) après le reload
  d'une restauration, le gate **redemandait le login** (jeton Google perdu au reload) ; (c) « il manque
  des données » = Drive était **en retard** (jamais entièrement poussé), pas un bug de restauration.
- **Fix (décision Marc : gate seul, Cloudflare retiré → une connexion)** :
  - `decideOnLoad` **élargi** au gate : Drive gagne dès qu'il a **avancé** (plus seulement « jamais
    syncé ») ; le local ne gagne que s'il est **strictement en avance** ; **plus jamais de `conflict`**
    au gate (déterministe pull/push/noop : `gate-restaure` / `gate-local-en-avance` / `gate-deja-sync`).
    Le boot normal garde la garde stricte. Tests `restoreIntent` réécrits (7 cas).
  - **Anti 2e login** : flag `sessionStorage` `isGateAuthedThisSession` posé dès l'auth réussie (avant
    le reload de restauration) → au remount le gate rend l'app directement, l'app ré-acquiert le jeton
    en silencieux. Effacé à la déconnexion. +3 tests.
  - Docs : matrice §4 réécrite (sous-table gate).
- **Note data** : les données « manquantes » ne sont pas perdues — elles sont sur l'appareil source ;
  il faut les **pousser** vers Drive (« Sauvegarder maintenant ») pour que Drive devienne complet.

### Corrigé — le login par le gate ne restaurait pas les bonnes données (2026-05-29)
- **Bug** : après login au gate (`LoginGate`), Marc voyait ses **données locales** (défaut/restes
  d'un test), pas celles sauvegardées dans Drive → il devait restaurer **manuellement** via Réglages.
  Cause : `decideOnLoad` ne faisait un `pull` auto que si le local était **strictement vide**. Dès
  qu'il y avait la moindre donnée locale + une méta de sync **vierge** (1er login sur cet appareil :
  `lastPulledUpdatedAt=0`, `lastLocalHash=''`), tout était classé **`conflict`** — et le gate, qui
  ne sait pas résoudre un conflit (UI réservée à Réglages), affichait le local.
- **Fix (TDD, décision Marc : auto-restaure)** : nouvelle intention `restoreIntent` sur `decideOnLoad`.
  Au **gate** (`connectAndSync` + `gateSilentResume`), si Drive a des données et que l'appareil n'a
  **jamais synchronisé** via ce système → `pull` (restaure). Filet : `applyPulledPayload` backupe le
  local avant d'écraser. Le **boot normal** (`runBootSync`) garde la garde anti-perte stricte
  (`conflict`, jamais d'écrasement auto). +5 tests.
- **Anti-régression clés API** : le hash de détection-de-changement (`getLocalPayload` / meta de
  `pullNow`) couvrait payload **+ clés API**. Or au gate les clés ne sont pas encore hydratées
  (`currentApiKeys()` vide) → après un pull+reload, le local paraissait « modifié » → `push` parasite
  qui **effaçait les clés dans Drive**. Hash rendu **invariant** (payload seul) ; les clés restent
  incluses dans l'enveloppe poussée. → après restauration : `noop` (pas de push parasite, clés Drive
  préservées).

### Décisions clés
- Données dans le Drive de l'utilisateur (on n'héberge rien) ; **pas de chiffrement applicatif**
  (choix confort assumé de Marc — passphrase optionnelle en backlog) ; sync **auto avec garde
  anti-perte** (pull au login, push debouncé, conflit → choix utilisateur).
- **Gate = intention de restauration** : se connecter au gate signifie « récupérer mon compte ».
  Sur un appareil jamais synchronisé, Drive gagne (auto-restaure, avec backup local de sécurité).
  Le boot normal reste prudent (conflit → choix utilisateur).

---

## [unreleased — Audit multi-agents · corrections] — 2026-05-28

Fleet de 5 agents (sécurité, TypeScript, silent-failures, performance, fintech) lancé sur
FinanceAI (rapport complet : `docs/AUDIT_2026-05-28.md`). Aucun problème CRITICAL. Toutes les
corrections sûres et à fort impact shippées en batches isolés (CI verte à chaque fois) :
sécurité (F5-F8), silent-failures du flux projection (F1/F3), exactitude fiscale (F4) et
performance (F9-F11). Les règles fiscales incertaines restent en attente de source
(Tier 🟢, **non modifiées** sans validation officielle / décision Marc).

### Sécurité / robustesse
- **F5 — `BudgetAiModal` injection de prompt** : noms/natures de catégories + alertes sanitisés
  (`sanitizePromptText`) + bloc `<DONNEES>` + note d'isolation (comble un trou laissé par S-D).
- **F7 — CSP durcie** : ajout `frame-ancestors 'none'` + `base-uri 'self'` + `object-src 'none'`
  dans `index.html` **et** `netlify.toml` (X-Frame-Options seul ne suffit pas).
- **F8 — `errorLogger`** : `userAgent` tronqué à 120 car. dans le log exportable (anti-fingerprint).
- **F6 — Limite de taille des uploads** : `PayslipUploadCard` et `TaxCenter` rejettent les fichiers
  > 10 Mo avant lecture/encodage base64 + envoi à l'API Vision (anti-saturation mémoire).

### Silent-failures (flux projection)
- **F3 — Stack trace préservée à travers le Web Worker** : `projection.worker.ts` poste désormais
  `{ __error: message, __errorStack: stack }` au lieu de `String(err)` (qui écrasait la stack →
  debug aveugle). `runAsync.ts` reconstruit l'Error et réattache la stack d'origine aux 3 points de
  réception (projection / robustness / strategySearch). Nouveau test `runAsync.test.ts` (6 cas).
- **F1 — Erreur de projection rendue honnêtement** : le chemin worker Monte-Carlo posait un résultat
  vide (`$0`) **sans** drapeau `_hasError` ; on affichait alors le graphe à zéro comme s'il était
  valide. Désormais `_hasError` est posé (sync ET worker) **et lu** : une garde de rendu affiche une
  erreur claire au lieu des zéros. Le store n'était déjà pas pollué (`setLastProjection` gate sur
  `chartData.length > 0`).

### Exactitude fiscale (money)
- **F4 — Retenue REER alignée sur la source de vérité** : `cashflowAllocation.ts:rrspWithholding`
  utilisait des taux hardcodés **21/26/30 %** (sur-retenue de ~1-3 k$/retraité) et incohérents avec
  `calculateGrossWithholdingRRSP` appelé juste avant dans la même cascade. Branché sur la constante
  `RRSP_WITHHOLDING_QC` (combinés QC **19/24/29 %**). Vérifié : **1148 tests verts, zéro régression**
  (aucun test n'assumait les anciens chiffres). `meltdownReer.ts` laissé tel quel — son `0.38/0.30`
  est le taux marginal ciblé par la stratégie meltdown, pas la retenue forfaitaire (Tier 🟢).
  > **Correction (Phase 0, 2026-06)** : cette dernière affirmation était FAUSSE. Dans
  > `projection.ts`, `meltResult.withholding` alimente le slot **retenue à la source**
  > (`taxCurrentYear.reer`, réconcilié en décembre au barème), pas l'impôt final. Le `0.38/0.30`
  > en dur jouait donc bien le rôle de retenue → désormais aligné sur `RRSP_WITHHOLDING_QC`
  > (19/24/29 % par tranche, via `withholdingForGrossRRSP`). Le net réinvesti et la retenue
  > intra-année sont maintenant justes (l'impact patrimonial restait limité au timing).

### Performance (Batch C)
- **F9 — `Math.pow` hissé** là où le **même** facteur de croissance salariale était recalculé dans un
  même scope : `activeIncome.ts` (6× → 1, boucle mensuelle), `monthlyCalcs.ts` (2× → 1),
  `taxDecember.ts` (2× → 1). Résultat numérique identique (vérifié : suite complète verte). Les usages
  uniques par bloc conditionnel laissés (les hisser pessimiserait les chemins gardés).
- **F10 — `tickFormatter` Futur en O(1)** : remplacement du `displayData.find()` O(n) par tick par une
  `Map<monthIndex, year>` mémoïsée. Évite O(ticks × n) par frame pendant le zoom/pan.
- **F11 — handlers de pan stables** : `useTimeChartZoom` enveloppe `onMouseDown/Move`/`endPan` dans
  `useCallback` (lecture `range`/`dataLength` via refs) + objet `handlers` mémoïsé → plus de re-render
  du graphe à chaque frame à cause d'identités de props recréées.

### Tier 🟡 — opportuniste (Batch D)
- **Robustesse FX (no-fake-data)** : `finance.ts` — sur échec réseau, le fallback préfère désormais le
  **dernier taux réel connu** (cache localStorage, même périmé) aux défauts hardcodés 1.40/1.47. Un taux
  d'hier est plus honnête qu'une approximation inventée.
- **Backup en clair signalé** : `backupAuto.tryGetDeviceKey` journalise (une fois/session) quand la crypto
  est indisponible et que les backups tombent en clair — au lieu d'un `null` totalement silencieux.
- **Validation backup durcie** : `BackupSchema` exige « tableau d'objets » pour `transactions`/`assets`
  (vs `z.unknown()`) — attrape la corruption grossière sans rejeter un backup légitime (chemin restauration).
- **Qualité TS `claude.ts`** : extraction des blocs texte Anthropic en `flatMap` type-safe (supprime le cast
  `as`) ; `safeJsonValidate` loggue via `errorLogger` (borné, exportable) au lieu de `console.warn`.
- **Mémoire Monte-Carlo (Batch E)** : `monteCarlo` ne retient plus le `chartData` complet par run (duplication
  intégrale de `netWorthByMonth` : jusqu'à ~600k objets retenus sur 1000 itérations × ~600 mois). Seule
  `chartDataLength` est conservée (unique usage restant). `allRuns` est interne → sortie strictement identique.
- **Non corrigé (jugement)** : `pdfReport` `window.open`/`document.write` sans `noopener` — faux positif
  (`noopener` ferait retourner `null`, cassant la feature ; fenêtre blanche même-origine, contenu qu'on
  génère → risque nul). Micro-memo `ExpertTooltip` (`React.memo`) + badge UI « taux FX estimé » → backlog (nice-to-have).

---

## [unreleased — Lot 2 · filet de tests moteur money-critical] — 2026-05-28

Filet de régression sur 11 modules money/sécurité auparavant **sans test unitaire direct**
(~119 nouveaux tests). C'est là qu'avaient surgi les 3 bugs silencieux de la semaine.

### Tests
- **cloudBackup** : round-trip AES-GCM/PBKDF2, salt+IV aléatoires, entête `FAI1`, non-leak du
  payload, codes d'erreur distincts (WRONG_PASSPHRASE vs INVALID_FORMAT), gate passphrase <12.
- **setupSimulation** : régression *revenu brut ×12* (annualisation) + *sliders returnRates*,
  ajustement RRQ, RNG seedé déterministe, smile curve, droits CELI/REER (immigrant < natif).
- **childrenReee** : régression *RQAP fantôme parent seul* (le calcul fiscal n'est même pas appelé,
  vérifié par spy), plafond REEE viager 50k$ (F13), fermeture 25 ans, clawback allocation, études.
- **taxJanuary** : gate janvier/m>0, plafonds CELI/REER, FERR 72+, fermeture CELIAPP 15 ans, Guyton-Klinger.
- **portfolioOps** : ACB + gains/pertes en capital, consommation de la banque de pertes, bornes.
- **meltdownReer** : gardes (null), paliers de patrimoine net, retenue 30 %/38 %.
- **monthlyCalcs** : inflation effective (bonus santé 75+, pondération CPI) + retenue T1213 (optim. déductions).
- **growthApplication** : agrégation des 7 actifs, base de croissance hors contributions du mois.
- **monteCarlo** : agrégation successRate / P10-P50-P90 / FVI (via `runScenario` injecté et stubé).
- **stochasticEvents** : déclencheurs (maladie grave, héritage, mortalité, LTC, perte d'emploi, divorce)
  via `rng` injecté → triggers et gardes déterministes.
- **claude** : `safeJsonValidate` (robustesse parsing/Zod des réponses LLM, nettoyage ```json),
  `isDefiniteTransfer` (pré-filtre), court-circuits sans réseau.

### Findings (caractérisation → candidats Lot 4)
- `handleNonRegSale` ne modélise pas les pertes en capital NonReg (branche inatteignable) — comportement pinné.
- `defaultBackupFilename` : 2ᵉ `replace` mort → millisecondes conservées dans le nom (cosmétique) — pinné.

---

## [unreleased — Lot 1 · sécurité & conformité] — 2026-05-28

Audit du 2026-05-28 → durcissement sécurité multi-utilisateur. **Lot 1 complet** : S-A, S-B, S-C, S-D, S-E.

### Sécurité
- **S-E — Quick-wins de durcissement** : (1) `BackupPanel` — retrait des deux `.passthrough()` Zod (les
  clés inconnues d'un backup sont écartées plutôt que propagées ; sans impact fonctionnel car `doRestore`
  ne lit que des clés connues). (2) `claude.ts` `safeJsonValidate` — la `console.warn` ne logue plus le
  contenu brut de la réponse LLM (pouvait contenir des marchands), seulement sa longueur. (3) SRI sur
  `gtag.js` : documenté comme **non applicable** (Google rotationne le fichier → un hash figé casserait GA ;
  la protection est l'allow-list d'origine CSP, déjà en place).
- **S-B — Consentement GA4 (Loi 25 QC)** : Google Consent Mode v2. `public/ga-init.js` refuse
  `analytics_storage` par défaut (aucun cookie/identifiant avant accord) et rétablit si un consentement
  a été persisté. Nouveau `services/consent.ts` (clé localStorage partagée avec ga-init) + bandeau
  discret `ConsentBanner` (non bloquant, Accepter/Refuser) monté dans `App`, + `AnalyticsConsentCard`
  dans Réglages → Clés API & Services pour accorder/retirer le consentement à tout moment (droit de
  retrait). `analytics.ts` : type gtag étendu (`consent`). 6 tests `tests/services/consent.test.ts`.
- **S-A — Backup auto chiffré au repos** : `services/backupAuto.ts` chiffre désormais le payload des
  backups rolling IndexedDB (transactions, soldes, dettes, revenus = PII financière) en AES-GCM, avec
  la clé de device non-extractible partagée avec `secureKeyStore` (`getOrCreateDeviceKey` désormais
  exportée). `restoreBackup` déchiffre et reste rétro-compatible avec les anciens backups en clair
  (champ `encrypted?`). Dégradation propre en clair si la crypto est indisponible (mieux qu'aucun
  backup). Le backup rolling reste *même-appareil* par nature ; l'export portable (`BackupPanel`) est
  une voie distincte, inchangée. Logique extraite en fonctions pures testées
  (`buildStoredPayload`/`readStoredPayload`) — 6 tests (chiffrement, non-leak PII, round-trip,
  rétro-compat clair, clé absente, blob altéré).
- **S-D — Défense anti-injection de prompt (Claude)** : nouveau module partagé et testé
  `utils/promptSafety.ts` — `sanitizePromptText` (neutralise caractères de contrôle + markup
  d'injection par arithmétique de code points, 0 octet de contrôle dans la source),
  `wrapUserData` (encadre les données en `<DONNEES>` et retire toute balise `</DONNEES>`
  injectée), `PROMPT_DATA_ISOLATION_NOTE`. 15 tests `tests/utils/promptSafety.test.ts`.
  `AiAssistant.generateContext` neutralise désormais marchands **+ symboles d'actions + nom
  de projet immobilier** (auparavant non assainis) et isole tout le bloc de données dans
  `<DONNEES>` avec la note d'isolation. `services/claude.ts` : copie locale redondante de
  `sanitizePayee` supprimée (DRY → util partagé) ; `detectSubscriptionsAI` encadre maintenant
  ses données dans `<DONNEES>` (parité avec `categorizeBatch`, routé via `wrapUserData`).
- **S-C — Tests de redaction PII de `errorLogger`** : `sanitizeContext` (déjà récursif) est
  désormais verrouillé par 6 tests (clés sensibles 1er niveau, formes variées, objets imbriqués,
  conservation des clés non-sensibles, troncature tableau→10 et profondeur→`[truncated]`) ; le
  log console émet le `context` **sanitisé** au lieu de l'`input` brut. `tests/services/errorLogger.test.ts`.

---

## [unreleased — G23 · qualité & purge] — 2026-05-27

Lot de 4 merges (`3167a55`, `20abca8`, `4af08b2`, `6042fe9`) partis de `f257efb`.

### Ajouté
- **Copilote — finitions** : import de positions courtier en lot (CSV Wealthsimple /
  Questrade / Disnat…) via `parseBrokerCsv` (pur, 11 tests) + modal `ImportBrokerPositions`
  dans Investissements (dédup par symbole) ; cache de prix Finnhub persisté en IndexedDB
  (`persistentCache.ts`, TTL history 1h → 24h — prix passés quasi-immuables). « Appliquer
  le gagnant » de l'optimiseur était déjà en place.
- **Option « Immigré au Canada » (par personne)** — bascule dans Config et Onboarding.
  Un immigrant n'accumule du droit CELI qu'à partir de son année de résidence fiscale
  (et son droit REER depuis son revenu canadien) ; défaut = non-immigrant (droit complet
  depuis 18 ans). Helper `getResidencyStartYear` + `tests/utils/residency.test.ts`.
- **Test de régression coussin d'urgence** — couvre le bug HealthIndicator/NextBestAction
  (coussin et patrimoine retournaient 0 avant correction).
- **Filet E2E Playwright (T2)** — `playwright.config.ts` + 15 tests dans `e2e/` : smoke
  navigation tous onglets (0 erreur console), assertions KPI (patrimoine > 0, coussin
  > 0 mois — aurait attrapé le bug HealthIndicator), screenshots baselines (Dashboard,
  Futur, Retraite, Enfant). Mode test activé via l'UI pour des données déterministes.
  Script `npm run test:e2e`. N'affecte pas les 732 tests Vitest (`e2e/` hors de l'include).

### Modifié
- **U3 — Radio-group Monte Carlo** : le toggle déterministe/MC dans ProjectionControls
  est désormais un vrai `<input type="radio">` stylé, navigable au clavier nativement.
- **U4 — Tooltip Futur : tous les événements** : ProjectionTooltip affiche maintenant
  TOUS les événements du mois (avant : seulement le 1er + « +N »).
- **DT4 — Split testFixtures** : `services/testFixtures.ts` (380 lignes) découpé en
  6 modules (`testConfig`, `testAssets`, `testBudget`, `testGoals`, `testTransactions`,
  `testMarketData`) ; `testFixtures.ts` reste le point d'entrée unique.
- **Lisibilité fiscale** : `tax.ts` — constante `QC_FEDERAL_ABATEMENT_RATE` pour le 0,165,
  commentaires barèmes ; `projection.ts` — commentaires règle des 4 % et amortissement.

### Corrigé
- **Bug HealthIndicator et NextBestAction** : coussin d'urgence et patrimoine affichaient 0
  car le code lisait des clés fixes `initialBalances.liquidity/.celi` inexistantes. Corrigé
  en passant par `computeCurrentLiquidity` (`services/portfolio.ts`) comme source unique.
- **Sécurité MEDIUM** : `eraContext` ne propage plus le corps HTTP brut dans le message
  d'erreur.
- **CI verte — screenshots cross-platform** : les baselines Playwright générées sous Windows
  divergeaient du runner Linux (rendu de police → ~3 % de pixels, > seuil 2 %), faisant échouer
  le job E2E. Les tests `@visual` sont désormais exclus du gate CI (`npm run test:e2e:ci`,
  `--grep-invert @visual`) et restent un filet de régression visuelle en local ; les tests
  fonctionnels (smoke / navigation / KPI, platform-agnostic) continuent de garder la CI verte.
- **Barème fiscal 2026 — montant personnel de base QC corrigé** : `BASIC_PERSONAL_AMOUNT_QC`
  était resté à la valeur 2025 (18 571 $) étiquetée « 2026 ». Valeur officielle 2026 = 18 952 $
  (= 18 571 × indexation 2,05 %), vérifiée contre Revenu Québec. BPA fédéral aussi ajusté
  16 444 → 16 452 $ (ARC, indexation 2,0 %). Les paliers d'impôt fédéraux et québécois ont été
  vérifiés contre les tables officielles 2026 : ils étaient déjà corrects. Impact de la
  correction : impôt QC surestimé d'environ 53 $/an/personne avant le fix.
- **Bug de défaut résidence (CELI + PSV)** : quand l'année d'arrivée était vide, le moteur
  supposait « arrivé il y a 5 ans », sous-estimant gravement le droit CELI et la résidence PSV
  d'un résident de naissance. Corrigé via le statut immigrant explicite (défaut non-immigrant
  = droit complet depuis 18 ans). Le défaut bugué `startYear - 5` est retiré des 3 sites moteur.
- **Constantes RRQ 2026** : taux 1er volet 6,40 % → 6,30 % (base 5,40 → 5,30 %), MGA
  74 900 → 74 600 $, MGAS 85 100 → 85 000 $. Vérifié contre Revenu Québec (le RPC fédéral
  partage le même MGA). RRQ_MAX 4 569,60 → 4 479,30 $.
- **Audit fiscal 2026 « à fond » (PSV + crédit d'âge fédéral)** : seuil de récupération PSV
  (OAS clawback) 93 454 → **95 323 $** (93 454 était la valeur 2025) ; crédit d'âge fédéral
  (ligne 30100) 8 966 → **9 208 $** (l'ancien indexait par erreur la base 2024). Le reste des
  constantes 2026 (RQAP, AE, crédit d'âge QC ligne 361, seuils SRG, BPA fédéral + QC, RAMQ)
  **vérifié correct** contre sources officielles. 3 tests de régression ajoutés (figent les
  valeurs). À reconfirmer quand publié/stabilisé : seuils FSS (Annexe F), montant SRG mensuel
  (fluctue par trimestre), seuils QC ligne 361.

### Supprimé
- **4 fonctions IA mortes** retirées de `services/claude.ts` : `getInvestmentAdvice`,
  `generateSmartGoals`, `analyzeBudgetAI`, `analyzeDocuments` + leurs schémas Zod
  orphelins. Aucun appelant.
- **Era Context retiré entièrement** (ADR 002 marqué SUPERSEDED) : `services/eraContext.ts`,
  `services/aiOrchestrator.ts`, `components/dashboard/EraContextInsights.tsx`, clé
  `apiKeys.eraContext` — environ 1 224 lignes supprimées. Raison : l'API REST
  `api.era.app` n'existe pas (Era est MCP-only), tous les appels échouaient. `AiAssistant`
  et `NextBestAction` dégradent proprement (Claude sans enrichissement era).
- **Résidus era** purgés : CSP `api.era.app` retirée d'`index.html` et `netlify.toml`,
  source de log `'era'` retirée d'`errorLogger`.
- **Code mort confirmé via knip** (53 → 36 unused exports) : `hasSeenTour`, `PLAN_LEVELS`,
  `annualToMonthly`, `getAssetMeta`/`getAssetMetaSync`, `getDividends`, `clearApiKeys`,
  `loadApiKeys`. Les 36 exports restants = barèmes fiscaux/immobiliers protégés intentionnellement.

### Qualité
- **0 warning ESLint** : 484 warnings éliminés (371 `no-explicit-any` typés précisément,
  64 `no-unused-vars`, 26 `no-console`, 20 `react-hooks/exhaustive-deps`, 3 directives
  obsolètes). Aucun override de config ESLint ajouté. 93 erreurs `tsc` induites par le
  typage strict réconciliées.
- Docs resync : README, SESSION_HANDOVER, USER_GUIDE, MANUAL_TEST_CHECKLIST.
- **Tests : 742 → 732** verts (71 fichiers). Delta = retrait des 2 fichiers de test era,
  partiellement compensé par le test de régression coussin.

---

## [unreleased — G22 · lisibilité, navigation & pédagogie] — 2026-05-26

Lot de 13 items axés sur la clarté pour un utilisateur non expert.

### Ajouté
- **Page « Explications » (Futur)** — 3e sous-onglet `ProjectionExplains` : explorateur
  data-driven de la projection. Par année (repliable) → drill mois par mois ; pour chaque
  mois les événements en français clair **+ détail chiffré par compte** (cotisé / marché /
  retrait / transfert / versé). Barre de recherche transverse + section « Comment ça marche »
  (méthodologie : ordre de retrait, RAP, CELIAPP, impôts, Monte Carlo). (G22-F1)
- **Tutoriel guidé** — moteur maison (zéro dépendance) : visite des 15 onglets, spotlight +
  bulle, raccourcis ←/→/Échap, démarrage post-onboarding, relançable depuis Configuration.
  (`components/tour/*`) (G22-F4)
- **Carte « Version & build »** dans Système (`__APP_VERSION__` · `__GIT_SHA__` ·
  `__BUILD_DATE__`) — auto-tenue à jour, remplace le CHANGELOG hardcodé. (G22-N5)

### Modifié
- **Configuration en sous-onglets thématiques** — `Settings.tsx` (745 l.) découpé en
  orchestrateur (~210 l.) + 6 sections (`components/settings/sections/*`) : Profil | Comptes &
  soldes | Patrimoine | Clés API | Sauvegarde | **Système & diagnostics** (fusionné). Deep-link
  cross-tab préservé. (G22-N4, N5)
- **Infobulles de projection réécrites en français clair**, jargon masqué (RAP, B-20, MBP,
  TBienv, REEE…) dans `realEstateMonth.ts`, `cashflowAllocation.ts`, `childrenReee.ts`. (G22-UX1)
- **Onboarding accueillant** — étape « Bienvenue » orientée valeur + tutoiement aligné sur
  l'app. (G22-F3)
- **Valeur nette passée complète** (cash + immo reconstruits) fusionnée au graphe Futur. (G22-B1)
- **Graphe Accueil** : boutons période + plein écran réalignés. (G22-B3)
- **Badge couple (sidebar)** : bascule directe Couple ⇄ Individuel. (G22-B2)
- **Version app auto** (CalVer) au lieu du bump manuel. (G22-F2)

### Supprimé
- Onglets **Documents** et **Data** retirés (enum, routeur, nav, palette). (G22-N1, N2)
- Onglet **Planif & Abos** fusionné dans **Budget** (sous-onglets). (G22-N3)
- `Tab.SYSTEM` retiré de l'enum (Système vit désormais dans Configuration).

### Qualité
- Revue IA (typescript + sécurité + qualité) : sécurité saine (clés API toujours hors backup),
  2 corrections appliquées au moteur de tour (logique de fin + cleanup rAF).
- Tests : 692 → **719** verts (nouveaux : `GuidedTour`, `ProjectionExplains`, `Settings` MAJ).

## [unreleased — G21 C5 · optimiseur configurable · C4 robustesse · C3 suite · PRIO_CELI_NO_RAP · AssetLocationPanel · Clés chiffrées · fix budget · plan d'action · crypto · import CSV] — 2026-05-26

### G21 C5 — Optimiseur de stratégies configurable

- **`StrategyOptimizerPanel`** dans l'onglet Futur : l'utilisateur **compose son espace
  de recherche** en cochant des valeurs de leviers (10 leviers : ordre de retrait,
  rentes, âge de retraite, RAP, ordre de cotisation, dépenses retraite, Smith Manoeuvre,
  priorité dettes, coussin d'urgence, placement par compte). Compte de configurations +
  temps estimé **en direct**, avertissement au-delà de 300 configs.
- On teste **toutes les combinaisons** (produit cartésien) par Monte Carlo, **réparti sur
  plusieurs cœurs** (pool multi-worker), et on désigne la **meilleure selon l'objectif**
  choisi (Équilibré / Patrimoine / Impôt / FIRE). Le re-tri par objectif est **instantané**
  (recalculé en mémoire, aucune relance moteur).
- **Verdict détaillé** : métriques clés du gagnant, ses 10 leviers en clair, une
  **explication FR** comparant au dauphin et nommant les **leviers décisifs**, et le
  **détail du score** (survie / patrimoine / fiscalité / FIRE / robustesse). Tableau
  triable/filtrable de **toutes** les configs avec garde de survie.
- **Découplage moteur** (ADR-008) : `StrategyConfig` modélise une stratégie comme une
  combinaison de leviers orthogonaux. `EngineOverrides` optionnels (RAP, cotisation,
  dettes) + clone de params (âge, dépenses, coussin, Smith, asset location). Tous les
  overrides absents ⇒ comportement historique inchangé.
- **`strategySearch.ts`** : MC par config (risque) + run déterministe (impôt à vie + âge
  FIRE). **`strategyConfigRanking.ts`** : classement par objectif + garde de survie +
  `explainWinner`. **`runStrategySearchAsync`** : sharding multi-worker + agrégation.
- **Fix bug dormant** : `runMonteCarlo` n'injectait pas les `EngineOverrides` dans les
  runs MC — les leviers découplés ne se seraient pas appliqués. Corrigé.
- Tests : +29 (générateur d'espace, recherche, sharding, classement, explication,
  assetLocation). 692 tests verts.

#### Ajustements post-feedback Marc
- **Fix bloquant** : la recherche mourait sur « worker sans progrès depuis 60 s » —
  la progression n'était signalée qu'après chaque config (1000 sims = long silence).
  Ajout d'un **heartbeat** Monte Carlo + progression fractionnaire ; watchdog 90 s.
- **assetLocation effectif** : le bonus (+0,4pp) s'applique à **tous les comptes**,
  plus seulement au NonReg que le moteur draine vers le CELI/REER (l'effet ne
  s'évapore plus).
- **« Appliquer »** : pousse la config gagnante dans les paramètres réels du Futur
  (leviers persistants dans ProjectionConfig + retirementGoal + sélection de scénario).
- **UX** : défaut 300 itérations (utilisable), composeur repliable (replié au
  lancement), chargement spinner + % + estimation.
- **Fusion** : l'ancien optimiseur « ta meilleure façon » (Phase 1, qui ne faisait
  que sélectionner un scénario) est retiré ; seul le bandeau « Verdict » reste en
  haut, l'optimisation complète vit dans le nouveau panneau.

### G21 C4 — Classement des stratégies par robustesse (Monte Carlo)

- **`RobustnessPanel`** dans l'onglet Futur : un bouton « Tester la robustesse » lance
  un Monte Carlo (1000 simulations × 5 stratégies de gestion) et classe les façons de
  gérer par **taux de succès** = % des scénarios où le patrimoine ne s'épuise jamais.
  Barre colorée sémantique par stratégie + patrimoine médian, bouton relancer.
- **`strategyRobustness.ts`** : `rankStrategiesByRobustness` re-lance un MC par stratégie
  (`kind:'strategy'`, donc sous le même monde réaliste — stress-tests exclus) et trie par
  taux de succès (départage FVI puis patrimoine médian). Injection de `runScenario`.
- **Web Worker** : nouveau mode `'robustness'` qui poste des messages de progression
  (`__progress`). `runRobustnessRankingAsync` utilise un **watchdog réarmé à chaque
  progrès** (pas de timeout fixe — 5000 sims dépassent souvent 30s ; on ne tue le worker
  que sur un vrai hang de 45s sans progrès). Fallback synchrone pour Node/tests.
- **Fix bug dormant** : `projection.ts` hardcodait `'AUTO_MARGINAL'` dans le Monte Carlo —
  le taux de succès affiché ignorait donc le scénario sélectionné. Corrigé en passant la
  stratégie réelle (`target.strategy`).
- Tests : 5 unitaires (faux `runScenario`, tri/bornage/progression/déterminisme) + 2
  d'intégration moteur réel (reproductibilité RNG seedée). 669 tests verts.



### G21 C3 suite — Décision RAP-vs-FHSA + placement par compte

- **`PRIO_CELI_NO_RAP`** — nouveau `AllocationStrategy` qui saute le retrait RAP à l'achat
  immobilier (CELIAPP + CELI en priorité, pas d'obligation de remboursement sur 15 ans).
  Répond à : « est-ce que le RAP vaut le coup face à vider le CELI ? » — les deux
  scénarios sont maintenant comparables côte à côte dans l'optimiseur.
- `realEstateMonth.ts` : `skipRapForPurchase` dans `RealEstateCtx`, même monde BASE
  que `PRIO_CELI`, seule différence à l'achat.
- `scenarios.ts` : 5 stratégies `kind: 'strategy'` comparables (AUTO_MARGINAL, PRIO_CELI,
  PRIO_REER, MELTDOWN_REER, PRIO_CELI_NO_RAP) + fix encodage (réécriture double-quotes ASCII
  pour éliminer le bug esbuild sur les apostrophes U+2018/U+2019).
- **`AssetLocationPanel`** — nouveau composant `components/projection/AssetLocationPanel.tsx`
  qui branche enfin `services/projection/assetLocation.ts` (code préexistant orphelin) sur
  le portfolio réel. Affiche le coût annuel évitable ($/an) en impôts selon le mauvais placement
  des actifs entre CELI/REER/NonReg. Panel expandable avec privacy-blur sur les montants.
  Heuristique symbole → classe d'actif (VOO/SPY → US equity, XIC/VCN → CAD equity, etc.).
- Tests : 659/659 verts, typecheck propre, build OK.

---

## [unreleased — Clés chiffrées · fix budget · plan d'action · crypto · import CSV] — 2026-05-25

> **Bug corrigé** : « je mets mes clés era / Finnhub et rien ne se charge ».
> Cause racine — l'audit C5 (2026-05-21) avait rendu les clés API
> *mémoire-seulement* ; elles disparaissaient donc à **chaque rechargement**
> (Finnhub recevait une clé vide, l'effet era ne partait jamais). Ce n'était pas
> un problème d'API.

### Persistance chiffrée des clés API

- Nouveau module `services/secureKeyStore.ts` : clé **AES-256-GCM non-extractible**
  générée par le navigateur et stockée dans **IndexedDB** ; blob chiffré
  (`iv ‖ ciphertext`, base64) dans `localStorage` (`app_api_keys_enc`). Un dump de
  `localStorage` seul est inexploitable (clé absente + non ré-exportable).
- Hydratation au boot (`App.tsx`) : les clés sont rechargées **toutes seules** au
  démarrage — donc dès que Cloudflare Access (Google + MFA) t'a laissé entrer.
  Saisie une fois → era + Finnhub se branchent ensuite via les effets réactifs.
- `handleUpdateApiKeys` chiffre et persiste à chaque mise à jour ; **no-silent-failure**
  (toast si le coffre est indisponible — vieux navigateur sans Web Crypto).
- **Limite assumée et documentée** : protège *au repos*, pas contre un XSS *actif*
  (un attaquant in-page peut demander le déchiffrement). La barrière contre les
  intrus reste la CSP stricte + Cloudflare Access.
- Migration douce de l'ancienne clé legacy `app_api_keys` (lue puis supprimée), et
  `partialize` continue d'exclure les clés du persist Zustand en clair.
- 7 tests (`tests/services/secureKeyStore.test.ts`) : round-trip, IV aléatoire,
  rejet de ciphertext altéré / mauvaise clé / blob trop court. Suite : 630 tests OK.

### Diagnostic era / Finnhub

- `fix(era)` (commit `2165c40`, déjà en prod) : un retour Era à **0 transaction**
  n'est plus muet → toast explicite. Combiné à la persistance, era/Finnhub
  deviennent **auto-diagnostiquants** (succès / 0-tx / erreur réseau-CORS visibles).

### Fix budget — impossible d'ajouter une catégorie

- **Bug** : `BudgetGroupTable` faisait `return null` quand le groupe était vide,
  ce qui masquait aussi son bouton « + Ajouter ». Avec `INITIAL_BUDGET = []`, un
  nouvel utilisateur ne pouvait créer **aucune** catégorie de dépense (bloquant).
- **Fix** : empty state explicite + bouton « + Ajouter » toujours rendu. Vérifié
  dans le navigateur (groupe vide → bouton → ajout). 3 tests de régression.

### Plan d'action HIÉRARCHIQUE (onglet Futur)

- Le plan d'action plat (liste par année) devient un **drill-down progressif** :
  Vue d'ensemble → décennie → 3 ans → année → semestre → trimestre → mois →
  conseils. Fil d'Ariane cliquable pour remonter.
- Moteur pur `services/projection/actionPlanHierarchy.ts` (découpe le flux mensuel
  par `monthIndex`, année par calendrier) + UI `ActionPlanDrilldown.tsx`. Chaque
  niveau montre le flux net par compte + des conseils dérivés des flux réels (aucune
  règle inventée). 6 tests sur le moteur ; drill-down vérifié dans le navigateur.

### Crypto — prix automatiques gratuits (CoinGecko)

- Nouveau provider `services/marketData/providers/coingecko.ts` : **gratuit, sans
  clé, CORS-OK** (vérifié : `access-control-allow-origin: *`, prix en CAD natif).
- La façade `marketData` **route par symbole** : un crypto connu (`BTC-CAD`,
  `ETH-CAD`…) → CoinGecko ; sinon → Finnhub. Le crypto marche donc **même sans clé
  Finnhub**. Aucune signature publique changée (`getQuote`/`getHistory`).
- Historique : `market_chart` *downsamplé* à 1 point/jour côté client (évite le
  param `interval=daily` réservé Enterprise). `https://api.coingecko.com` ajouté à
  la CSP. 7 tests ; fetch crypto vérifié dans le navigateur (BTC en CAD via la CSP).

### Banque — import CSV universel (gratuit, 100% local)

- Nouveau parseur `services/import/parseBankCsv.ts` qui gère **n'importe quel
  relevé** : séparateur virgule/`;`/TAB auto-détecté, guillemets, en-têtes FR/EN,
  mapping de colonnes, débit/crédit séparés, dates ISO ou JJ/MM ou MM/JJ
  (déduites), montants `$ 1 234,56` (décimale FR) et `(50,00)` négatif. Remplace
  l'ancien `parseTransactions` (TAB/`;` + JJ/MM/AAAA seulement).
- Nouveau composant `ImportBankStatement` dans Paramètres : choix de fichier →
  **aperçu** (séparateur/colonnes détectés + 3 lignes + compte) → import. Rien ne
  quitte le navigateur.
- Le champ « Era Context Token » (cassé, era est MCP-only) est **retiré**.
- 9 tests sur le parseur ; flux complet vérifié dans le navigateur (dépôt CSV →
  aperçu → import → toast).

### Durcissement — vulnérabilité + nettoyage era orphelin

- **Vulnérabilité corrigée** : `qs` (DoS modéré déclenchable à distance,
  GHSA-q8mj-m7cp-5q26) → `npm audit fix` → **0 vulnérabilité**.
- **Nettoyage era** : après le retrait du champ era (MCP-only, inutilisable), on
  enlève les **orphelins** qui pointaient encore vers cette feature morte : champ
  « Era Context Token » dans l'**Onboarding**, bouton « Sync Era Context » dans
  **Transactions** (+ chaîne de props `onSyncEra`/`isSyncing`), toast « Configure
  Era Context… » dans **Planning**. Plus aucune UI ne propose une fonctionnalité
  qui ne peut pas marcher. Typecheck + 655 tests + build OK ; 0 erreur lint.

### Consolidation de la persistance (dette #1 — avant ouverture publique)

- **Problème** : 2 systèmes lisaient le state à CHAQUE boot — `getInitialStateWithMigration`
  (lecture manuelle de ~25 clés legacy `app_*` + sa propre chaîne de migration) **et**
  Zustand `persist` (`financeai-storage`, v6). Deux chemins de migration parallèles =
  risque de corruption silencieuse + parse synchrone bloquant.
- **Fix sûr (préservant le comportement)** : `financeai-storage` (persist) est désormais
  la **source de vérité unique**. S'il existe, on **ne relit plus** les clés legacy ; la
  lecture legacy ne sert qu'à l'**import unique** des utilisateurs d'avant persist. Aucun
  déplacement/suppression de données → zéro risque de perte (prouvé sur 3 scénarios de boot).
- Retiré l'écriture directe redondante de `categorization_rules` (déjà persisté via le store).
- 4 tests de boot (`tests/store/persistenceConsolidation.test.ts`) ; **659 tests OK** ;
  boot vérifié au navigateur (mode test → 70 transactions hydratées, aucun crash).

---

## [unreleased — cycle 17 : Refonte graphique « Google Finance » (zoom partout + Futur)] — 2026-05-22

> Refonte transverse des graphiques : zoom molette / pan / reset sur **tous** les
> onglets + refonte complète du graph Futur. Architecture réutilisable
> (`useTimeChartZoom` + `ZoomContainer`). Commits `53d1faf`, `22922de`, `25f0838`,
> `6da3869`, `9a058a3`, `7473809`, `486a324` (poussés sur main).

### Graph Futur (G2-G6, G3b)

- **G3** — sous-onglets 📈 Graphique / ⚙️ Paramètres (KPIs toujours visibles).
- **G4** — zoom molette + pan + double-clic reset + sélecteur de période
  (5/10/20/30 ans/Tout) ; remplace le `<Brush>`. Logique extraite dans le hook
  `useTimeChartZoom`, partagé avec `ZoomableTimeChart`.
- **G5** — un événement = une pastille emoji individuelle **cliquable** → fiche
  détail (date/âge/valeur nette). Dedup des labels répétés + plafond de densité
  échantillonné ; rendu via le prop `shape` du ReferenceDot (recharts v3 n'affiche
  pas `LabelList` dans `ReferenceDot`).
- **G6** — infobulle refondue : conteneur dégradé + accent + apparition animée,
  hero valeur nette, pastilles de couleur sur la répartition.
- **G2** — labels de lignes FIRE/Aujourd'hui en pastilles ancrées aux bords
  (`RefLineLabel`), plus de texte illisible par-dessus les aires.
- **G3b** — plein écran via la **Fullscreen API** (top layer du navigateur, échappe
  à l'ancêtre transformé qui piégeait `position:fixed`).

### Zoom sur tous les autres graphs (G7)

- Composant réutilisable `ZoomContainer` (ref + handlers + bouton « Vue complète » + hint).
- Zoom molette/pan/reset ajouté à : **Dette** (extinction), **Retraite**
  (accumulation + cashflow), **Enfant** (coûts par âge + REEE), **Immobilier**
  (Acheter-vs-Louer + comparaison multi-propriétés). Dashboard + Investissements
  avaient déjà la molette (`ZoomableTimeChart`) + leur propre sélecteur de période.

### Détail au clic + légende interactive (G9, G10)

- **G9 P1** — clic sur le graph Futur → modale détaillée (`FutureDetailModal`,
  `createPortal` vers `body`) : tous les comptes (valeur + variation), événement
  du point cliqué, et **drill-down par compte** (graph valeur au fil du temps
  avec zoom + sélecteur de période). Pastilles cliquables → même modale.
- **G9 P2** — distinction **apport vs gain** par compte (chips Apport/Gain dans
  l'infobulle et la modale). Données déjà émises par le moteur
  (`Contrib*`/`MarketGrowth*`/`NetTransfer*` dans `chartData`) → UI seule, aucune
  extension moteur.
- **G10** — **légende interactive** : chaque série (Cash/CELI/REER/REEE/Non-Enreg/
  Crypto/Équité Immo, Valeur Nette, Impôt Latent, Paiement Impôts, Monte Carlo,
  Événements/icônes, Objectif FIRE, Aujourd'hui) est un chip cliquable
  afficher/masquer ; swatch dont la **forme** reflète l'encodage (aire/ligne/barre/
  pointillé/point). Choix persisté en localStorage (`future:hiddenSeries:v1`,
  même convention que `dashboard:hiddenAccounts:v1`) + bouton « Tout réafficher ».
  Le chip Monte Carlo n'apparaît que si MC est activé.

### Clic partout + explications + infobulle v2 (G11, G12, G13)

- **G12** — clic **n'importe où** sur le graph Futur ouvre la modale détail (plus
  seulement les pastilles d'événement). Le mois cliqué est résolu par géométrie
  (X du clic vs grille cartésienne) → robuste au tactile et là où recharts ne
  déclenche pas son `onClick` interne. Glisser (pan) ≠ clic (seuil de distance).
- **G13** — dans le drill-down par compte : explication **mois par mois** du
  pourquoi ça monte/descend, à partir des composantes réelles du moteur
  (gain marché `MarketGrowthX` vs apport/retrait net `NetTransferX`) + section
  « Moments clés » (plus gros mouvements). La cause précise d'un retrait vient
  des **événements** du moteur (« Achat Immo », « Palier 14% », « FERR »…), pas
  d'une devinette — un retrait CELI peut financer un achat immo (RAP), pas
  forcément la retraite (no-fake-data).
- **G11** — infobulle au **survol** refondue en résumé concis (date, valeur nette,
  variation, apport-vs-gain, aperçu d'événement, « clique pour le détail »). Tout
  le détail exhaustif (chaque compte, flux, impôts, drill-down) est réservé au
  **clic** dans la modale. Règle le souci « infobulle trop longue pour sa taille ».

### Lisibilité + espace de cotisation (G14-G19)

- **G14** — l'infobulle au survol redonne le détail par compte (valeur + rendement
  du mois par compte) et les revenus/dépenses, en plus du hero valeur nette.
- **G15** — libellés clarifiés : « Gain marché » → « Rendement placements »,
  « Retrait » → « Retrait (argent sorti) », le gros chiffre est nommé « Variation »,
  + une ligne de légende expliquant Variation = rendement + dépôts − retraits.
- **G16** — icônes d'événements (retraits, achats…) sur chaque mini-graph de
  compte dans le drill-down, avec exclusion du bruit récurrent et plafond de densité.
- **G17** — Monte Carlo bien plus visible : tracé en cône d'incertitude
  (P10/P90 pointillés + médiane pleine) **par-dessus** la pile d'aires (il était
  occulté + à 5 % d'opacité). 
- **G18** — Monte Carlo confirmé déjà reproductible (RNG seedé
  `scenarioType-strategy-iteration`, aucun `Math.random`) : mêmes percentiles à
  chaque recalcul. La stabilité est désormais visible grâce à G17.
- **G19** — détail **par année de l'espace de cotisation gagné** (CELI/REER) dans
  le drill-down : dérivé par conservation depuis `CELIMax`/`REERMax` + cotisations
  (capture aussi le ré-ajout d'espace CELI après un retrait/RAP). Aucune extension moteur.
- **G20** — le **FHSA/CELIAPP** devient un compte first-class : présent dans le graphe
  principal (aire empilable + chip de légende), l'infobulle (valeur + rendement), la
  modale (compte + drill-down + moments + marqueurs) et la table d'espace de cotisation.
  Le moteur émet désormais `CELIAPPMax = fhsaRoom + celiapp` (additif, ne change pas la
  simulation). Note : il ne s'affiche que s'il est financé (achat immo futur).

### Optimiseur « meilleure façon » — Phase 1 (G21)

- **Sélecteur d'objectif** dans l'onglet Futur (Équilibré / Patrimoine max / Impôt
  minimum / FIRE le plus tôt), persisté en localStorage.
- **Recommandation auto** : l'app classe les 7 scénarios déjà calculés selon
  l'objectif et propose le meilleur (nom + patrimoine + impôt à vie + âge FIRE),
  avec un bouton « Appliquer cette stratégie ». Module pur `strategyRanking.ts`
  (testé, 6 cas) — réutilise les métriques déterministes par scénario, aucune
  relance de simulation. Phases 2-3 à venir (actions concrètes par année + vraie
  recherche multi-stratégies dans le moteur).

### Ligne de vie : passé réel + futur projeté (A1-A3)

- **A1** — `services/history/reconstructPortfolioHistory.ts` (pur, 5 tests) :
  valeur marché passée par compte = Σ détention(t) × prix(t) en CAD, avec
  indicateur de couverture (vrais prix vs estimé).
- **A2** — `hooks/usePastPortfolioHistory.ts` : récupère l'historique quotidien
  Finnhub (`getHistory`) par titre détenu pour peupler les prix, puis reconstruit.
  Mode test : utilise le `priceHistory` des fixtures.
- **A3** — le graphe Futur **préfixe le passé réel** (placements) avant le début
  de projection (monthIndex < 0), zone « Passé réel » ombrée, sans toucher au
  futur (événements, lignes, périodes intacts). N'affiche que les comptes de
  placement (pas de fausse valeur nette totale : cash/immo passé non reconstruit).
  Note d'honnêteté affichée (source + couverture). Le vrai passé s'affiche avec
  des titres datés + une clé Finnhub configurée.

### Affichage 3 couches : verdict + plan d'action (B1, C2)

- **B1** — bandeau « Verdict » (Couche 0) en haut du graphe : une phrase + un
  chiffre + une pastille (« En bonne voie — libre dès X ans · Y M$ à l'horizon »),
  lisible en 2 secondes. Le détail (stratégie, pourquoi) est en dessous.
- **C2** — panneau « Plan d'action » : ce que la stratégie te fait faire année
  par année (dépose 💰 / retire 🏧 par compte), dérivé de `NetTransfer<compte>`
  du scénario affiché (`services/projection/yearlyActions.ts`, testé). Prochaines
  années + « voir toutes les années ». Aucune règle inventée.
- **B2** — « Pourquoi cette stratégie ? » : dépliant (Couche 2) sur l'optimiseur
  qui montre le **classement complet** des scénarios (patrimoine, impôt, âge FIRE)
  avec le 🏆 gagnant pour l'objectif choisi. Rend les raisons du choix visibles.
- **C3 (incrément 1)** — l'optimiseur compare désormais de **vraies façons de gérer**
  sous le même monde réaliste : 3 variantes ajoutées (CELI d'abord, REER d'abord,
  fonte du REER) à côté du Plan de Base. Champ `kind` 'strategy'/'stress' :
  l'optimiseur ne classe que les stratégies comparables (les stress-tests de monde
  restent pour la résilience, hors classement). Additif — les 7 scénarios existants
  sont inchangés (aucune régression de calcul). Reste C3 : décision RAP-vs-FHSA pour
  l'achat, asset location, recherche plus fine.

### Notes

- Qualité : `typecheck` 0 / `lint` 0 / **607 tests** verts à chaque palier, zoom
  vérifié en preview onglet par onglet.
- `RealEstate` : calcul Acheter-vs-Louer remonté d'une IIFE de rendu au niveau
  composant pour pouvoir brancher le hook.
- Warning dev-only recharts « duplicate key CELI/REER » sur les aires empilées :
  noté (G9), non-bloquant, absent du build prod.

---

## [unreleased — cycle 16 : Fix PWA inopérante en prod + locale aiOrchestrator] — 2026-05-21

> 2 PRs livrent le fix du bug PWA découvert lors de la validation finale
> du cycle 15 + un follow-up sur un test fragile aux locales.
> **PR #118 (PWA fix) mergée**, PR cycle-16-followups en cours.

### Bug PWA inopérante en prod (#118 — `ae8a6c5`)

Symptôme : sur https://www.hubperso.com, le service worker n'était pas
enregistré au boot, le cache `financeai-v2` restait vide. La PWA était
inopérante malgré les PRs #113 (PWA initial) et #116 (SW cache fix) du
cycle 15.

**Diagnostic en deux temps** (cf `docs/INVESTIGATION_PWA_VERCEL_2026-05-21.md`) :

1. **Bug build Vercel** : `import.meta.env.PROD` s'évaluait à `false`
   lors du build Vercel malgré le log `building for production`. Le bloc
   de registration SW dans `App.tsx:55-61` était dead-code-éliminé.
   Le bundle prod sur Vercel faisait 744 KB et ne contenait aucune
   référence à `sw.js` / `serviceWorker`, contre 528 KB pour mon build
   local correct (différentiel +216 KB / +40 % cohérent avec un build
   en mode dev).
2. **Bug séquencement React** : même avec le code SW présent dans le
   bundle, `useEffect` tourne après `window.load` (mount React arrive
   après l'event). Donc `window.addEventListener('load', ...)` attachait
   un listener à un event déjà fired → callback jamais exécuté →
   SW jamais registered.

### Fixes (#118)

- `package.json` : `"vite build"` → `"vite build --mode production"`.
  Effet primaire : Vite résout le mode comme `production` de manière
  non-ambiguë. Effet secondaire utile : le hash du commit change →
  Vercel ne peut PAS skipper le build via `Ignored Build Step:
  Automatic`.
- `App.tsx:54-71` : guard `document.readyState === 'complete'` avant
  d'attacher le listener. Si le DOM est déjà loaded au moment du
  effect (cas dominant en SPA React), register directement. Sinon
  fallback `addEventListener('load', ..., { once: true })`. Au passage,
  remplacement du `.catch(() => {})` silencieux par un `console.error`
  explicite (anti-pattern silent-failure-hunter).
- `docs/INVESTIGATION_PWA_VERCEL_2026-05-21.md` : 295 lignes de
  diagnostic complet (6 hypothèses testées et écartées, plan B archivé).

### Validation prod (post-merge `ae8a6c5`)

- Nouveau bundle `index-CviMRQ3u.js` (528 KB, contient `sw.js`)
- `navigator.serviceWorker.getRegistrations()` → 1 reg `activated`
- `caches.keys()` → `["financeai-v2"]` (16 entrées au 2e load)
- `navigator.serviceWorker.controller` non-null après navigation

### Hygiène : fix test fragile aux locales (`services/aiOrchestrator.ts`)

Bug latent découvert lors de la validation cycle 16 :
[tests/services/aiOrchestrator.test.ts:101](tests/services/aiOrchestrator.test.ts#L101)
attendait `'10,000'` mais `services/aiOrchestrator.ts:75-77` utilisait
`.toLocaleString()` **sans locale** → résultat dépendait du runtime :

- CI ubuntu-latest (`en_US.UTF-8`) → `'10,000'` → ✅ pass
- Node local `fr-CA` → `'10 000'` (espace insécable) → ❌ fail

Plus grave qu'un test fragile : le **system prompt envoyé à Claude
variait selon la locale browser de l'utilisateur**. Non-déterministe.

Fix : import de `formatNumber` depuis `utils/format` (centralisé fr-CA,
même convention que `formatCAD` etc.). 6 occurrences remplacées dans
`services/aiOrchestrator.ts`. Test mis à jour pour générer la chaîne
attendue via la même locale `fr-CA`.

### Méta cycle 16

- 2 PRs : #118 fix PWA + cycle-16-followups (locale + docs)
- Tests : 573 → 573 verts (1 test fail intermittent locale corrigé)
- 0 régression typecheck / build
- Bundle index passé de 744 KB → **528 KB** (économie réelle 216 KB
  gzip ~50 KB pour les utilisateurs prod)
- Apprentissages : silent catches sont des pièges même quand ils ne
  causent pas le bug actif ; séquencement React/DOM peut piéger les
  `window.load` listeners ; vérifier que le bundle prod contient ce
  qu'on croit avoir buildé.

---

## [unreleased — cycle 15 : P2 Mobile & a11y AAA COMPLÈTE (9/9 items)] — 2026-05-20/21

> Suite directe du cycle 14 (P1 livré). **8 PRs (#107 à #114)** livrent
> tout le plan P2 (`docs/PLAN_P2.md`) en ~7h effectif. **573/573 tests verts**.
> Estimation initiale 25-30h → révisée 14h après triage → livré 7h.
> La base était déjà solide après cycle 7.D + refonte v3.0.

### Plan P2 publié (#107)

`docs/PLAN_P2.md` (250 lignes) — triage du code existant qui révèle que la
base mobile/a11y est déjà solide (sidebar mobile, focus trap modal, 205
`aria-*`, script contrast, axe sur 6 primitives). 9 items priorisés en
4 phases d'exécution.

### Phase 1 : Quick wins (#108)

- **P2.2 Modal focus restore** : `components/ui/Modal.tsx` sauvegarde
  `document.activeElement` à l'ouverture, restaure à la fermeture (Escape /
  backdrop / X). Guard si l'élément a été détruit pendant l'ouverture.
  Bénéfice : keyboard users ne perdent plus le focus.
- **P2.3 Modal close hit area** : `w-8 h-8` → `w-11 h-11` (32 → 44px),
  WCAG 2.5.5 (Target Size). Bénéficie à tous les modals via la primitive.
- **P2.6 prefers-reduced-motion** : media query global dans `index.css`
  qui désactive animations/transitions longues + explicitement `aurora-blob`,
  `skeleton-box`, `lift-on-hover`. WCAG 2.3.3 (AAA).
- **P2.7 skip-to-main** : déjà implémenté (`Layout.tsx:117-123` depuis le
  cycle 5.1) — aucune action nécessaire.
- 3 nouveaux tests Modal (hit area, focus restore, no-crash si élément
  précédent détruit).

### Phase 2 : Audits → fixes

**P2.5 Contrast WCAG AA** (#109) :
- `scripts/check-contrast.ts` révèle 3 échecs critiques sur `ink-400`
  (#64748b ratio 3.30) et `ink-500` (#475569 ratio 2.07).
- Fix dans `tailwind.config.js` :
  - `ink-400` #64748b → **#8896a8** (ratio 5.21-6.42, passe AA normal)
  - `ink-500` #475569 → **#6a7689** (ratio 3.41-4.20, passe AA large)
- Avant : 38/48 conformes AA normal, 3 fails critiques.
- Après : 41/48 conformes AA normal, **0 fail critique**.
- 124+ usages `text-ink-400` bénéficient automatiquement.

**P2.4 Touch target audit** (#110) :
- 5 boutons icon-only sub-44px corrigés avec `.touch-target` utility
  (déjà définie `index.css`) ou bump explicite :
  1. Privacy toggle Layout : `w-9 h-9` → `w-11 h-11` + `focus-ring`
  2. Toast close ✕ : `p-0.5` (~20px) → `.touch-target` (44px)
  3. Documents delete 🗑️ : `p-1` (~24px) → `.touch-target` + `focus-within`
  4. Planning month arrows : `p-1 px-3` → `.touch-target` + `aria-label`
  5. Planning goal delete ✕ : aucune dimension → `.touch-target` + `aria-label`
- Checkboxes natifs (Transactions, Onboarding) reportés à P2.8.

### Phase 2 (suite) : Audits → fixes

**P2.8 Form labels audit** (#112) :
- 238 form elements audités à travers `components/`. **~35 inputs orphelins
  fixés** dans 9 fichiers via `aria-label` ou `htmlFor`+`id` binding.
- PatrimoineExtended.tsx (17 inputs immo/business/véhicules/rénovations/charité)
- Settings.tsx (10 inputs API keys/health/income — `htmlFor` + `aria-label`)
- DebtManager.tsx (5 inputs new debt form)
- Planning.tsx (4 inputs new goal)
- Investments.tsx (2 inputs rebalance + account type)
- BackupPanel.tsx (3 passphrase inputs)
- ChildPlanning.tsx, LifeEvents.tsx, PropertyConfigurator.tsx (1 chacun)
- Conforme WCAG 1.3.1 + 4.1.2.

### Phase 3 : Tests automatisés

**P2.1 Tests axe pages complètes** (#114) :
- Nouveau `tests/a11y/pages.axe.test.tsx` qui monte des pages complètes
  (vs primitives) avec stubs réseau et vérifie 0 violation a11y
  serious/critical via axe-core.
- 4 pages couvertes : Onboarding, SystemView, Dashboard (empty state),
  TaxBracketViz.
- Fixes au passage : 4 `<select>` orphelins dans ErrorLogViewer et
  AuditLogViewer → `aria-label` ajoutés.
- Pages complexes (Investments / TaxCenter / Retirement /
  FutureProjection / Settings) reportées à un follow-up futur (heavy
  lazy-loading + IA + extensive mocking requis).

### Phase 4 : PWA (optionnel)

**P2.9 PWA minimal** (#113) :
- `public/manifest.json` (name, theme `#10b981`, display standalone, `fr-CA`)
- `public/icon.svg` (512×512 maskable, logo "Fi" emerald)
- `public/sw.js` (cache-first sur `/assets/*` hashed, network-first sur
  le reste, skipWaiting + clientsClaim aggressive update)
- `index.html` : `<link rel="manifest">`, `<meta theme-color>`, meta tags
  Apple fullscreen
- `App.tsx` : register SW au boot en PROD seulement (Vite HMR en dev s'auto-gère)
- Compatible lazyWithRetry (P1.4) : on ne cache jamais index.html avec TTL long
- Limitations : pas de PNG fallback (Modern browsers acceptent SVG)

### Méta cycle 15

- **8 PRs** : #107 plan, #108 quick wins, #109 contrast, #110 touch targets,
  #111 docs intermédiaires, #112 form labels, #113 PWA, #114 axe pages
- Tests : 566 → **573** verts (+7 nouveaux : 3 Modal + 4 axe pages)
- 0 régression typecheck / build
- Bundle index inchangé (528 KB gzip 166 KB) ; PWA assets <5 KB ajoutés
- WCAG AA conformité atteinte (sub-ensemble AAA pour touch, focus, reduced-motion)

---

## [cycle 14 : P1 Production Readiness COMPLÈTE (7/7 items)] — 2026-05-20

> **Sprint d'une journée** post-refonte UI v3.0. 7 PRs (#99 à #105) livrent
> tout le plan `docs/PLAN_P1.md` (~35h estimés). **511 → 566 tests verts**.
> Contrainte cardinale respectée : **tout sur tiers gratuits**.

### P1.1 — Error logger local (#99)

- `services/errorLogger.ts` : rolling buffer 100 entrées en `localStorage`,
  helpers `logError` / `getErrors` / `filterErrors` / `clearErrors` /
  `exportErrorsAsJSON` / `getErrorStats`
- 7 sources (`ai | era | projection | ui | network | storage | unknown`),
  4 severities (`info | warning | error | critical`)
- `installGlobalErrorHandlers()` au boot dans `App.tsx` (capture
  `window.onerror` + `unhandledrejection`)
- `services/claude.ts` : `console.error` → `logError({source: 'ai', ...})`
  dans les 5 fonctions IA principales
- UI `components/system/ErrorLogViewer.tsx` dans onglet Système : table,
  filtres source/severity, export JSON, clear avec confirmation
- 10 tests unitaires

### P1.4 — CSV export + résilience chunk-load + cache headers (#100)

- `utils/csvExport.ts` : `escapeCsvField` / `toCSV<T>` / `downloadCSV` +
  helpers `exportTransactionsCSV` / `exportHoldingsCSV` / `exportBudgetCSV`
  conformes RFC 4180 (UTF-8 BOM, échappement `"` et `,`)
- 14 tests unitaires (edge cases : nulls, virgules, guillemets, newlines)
- **Fix critique chunk-load** : `utils/lazyWithRetry.tsx` wrap autour de
  `React.lazy` avec retry + reload one-shot via `sessionStorage` flag.
  Résout `TypeError: Failed to fetch dynamically imported module` après
  nouveau deploy.
- `netlify.toml` : cache headers `no-cache` pour `index.html`, `immutable`
  pour `/assets/*` — empêche le navigateur de garder un index.html stale
  qui pointe vers des chunks supprimés.

### P1.3 — Backup automatique IndexedDB (#101)

- `services/backupAuto.ts` : rolling 7-day backups dans IndexedDB
  (50MB+ vs 5MB localStorage), JSON sérialisé du state complet sauf
  `apiKeys` (sécurité)
- Debounce 2s au boot dans `App.tsx`, 1 backup quotidien max,
  garbage collection > 7 jours
- UI `components/settings/AutoBackupPanel.tsx` : liste, restore (avec
  confirmation + insurance backup pré-restore), delete
- Migration vers Schema v6 (`assets.purchases[]` DCA) couverte par les
  backups
- 12 tests unitaires (fake IDB via `fake-indexeddb`)

### P1.2 — Validation Zod end-to-end (#102)

- `services/eraContext.ts` : tous les `Schema.parse()` → `safeParse()` avec
  `logError({source: 'era', severity: 'warning', ...})` en cas d'échec
- Generic helper `eraRequest<T>(endpoint, schema, opts)` — DRY pour les
  9 endpoints
- `fetchTransactions` : pagination cursor-based résiliente (poursuit si
  une page est invalide, ne crash plus)
- `rememberFact` : ack response validation
- 8 tests unitaires couvrant : réponse OK, réponse invalide, réponse
  partiellement invalide (pagination), endpoint 500

### P1.7 — Audit log local (#103)

- `services/auditLog.ts` : rolling buffer 500 entrées en `localStorage`,
  helpers `logAudit` / `getAuditLog` / `filterAuditLog` / `clearAuditLog` /
  `getAuditStats` / `exportAuditLogAsJSON`
- 4 opérations (`add | remove | update | replace`), `countBefore`/`countAfter`
  optionnels pour traçabilité quantitative
- UI `components/system/AuditLogViewer.tsx` dans onglet Système (pattern
  identique à ErrorLogViewer) : table, filtres champ/opération, export, clear
- 8 tests unitaires (cap MAX_ENTRIES, filtres, stats, corruption recovery)
- **Wiring aux call-sites** reste optionnel — infrastructure prête mais
  `logAudit(...)` à appeler manuellement aux paths importants
  (import CSV, suppressions batch, etc.)

### P1.5 — PDF report complet (#104)

- Étend `services/pdfReport.ts` (jspdf, lazy 391 KB) avec 4 nouvelles pages :
  - **Fiscale** : fédéral, QC, RRQ, RQAP, AE, taux marginal/moyen par
    contribuable + totaux combinés (utilise `calculateFiscalReport`
    de `utils/tax.ts`)
  - **Holdings** : table par asset (symbole, qté, prix, compte) avec
    valeur CAD via `fxRates` et total
  - **Dettes** : table par dette (taux, paiement min, solde) avec
    estimation mois restants (formule amortissement avalanche)
  - **Goals** : liste objectifs actifs avec barre de progression et %
- 4 **builders purs** exportés et testables (`buildHoldingsRows` /
  `buildDebtsRows` / `buildGoalsRows` / `buildFiscalSummary`) — 16 tests
- `ReportData` étendu avec 4 champs optionnels — entrée historique
  `generateFinancialReport(data)` rétro-compatible
- Helper `ensureRoom()` pour pagination automatique des tables longues

### P1.6 — Lighthouse CI (#105)

- `.github/workflows/lighthouse.yml` : workflow **isolé** du CI critique
  (`ci.yml` inchangé), `treosh/lighthouse-ci-action@v12`
- `concurrency` + `cancel-in-progress` → pas de runs zombies
- `timeout-minutes: 10` + `continue-on-error: true` → ne bloque jamais
  le merge même si lighthouse fail/timeout
- `.lighthouserc.json` : 4 catégories (perf, a11y, best-practices, SEO)
  en **warn-only** initial (perf ≥0.5, a11y ≥0.85, BP ≥0.8, SEO ≥0.7)
- `staticDistDir: './dist'` → sert le build sans serveur externe
- Upload `temporary-public-storage` → lien rapport HTML dans logs du run
- `.gitignore` : exclut `.lighthouseci/` (artefacts locaux)

### Méta

- 511 → **566 tests verts** (+55, 50 fichiers)
- 0 régression typecheck/build
- Bundle index inchangé (528 KB gzip 166 KB), `pdf-vendor` 391 KB lazy
- Doc inventory mis à jour (`HANDOVER.md` §4.2, `PLAN_P1.md` clôturé)

---

## [cycle 13 : Refonte UI v3.0 COMPLÈTE (8 phases + cleanup + F.11)] — 2026-05-20

> Refonte massive selon le document directives `MAJ_FinanceAI.txt`. **10 PRs**
> (#86 à #95), 8 phases logiques (A → G + cleanup + F.11), **501 → 511 tests verts**.
> Store v4 → v6 avec migrations propres. 15+ nouveaux composants, 6 nouveaux
> services IA, fusion d'onglets, refonte navigation, indicateurs santé,
> IA partout. **100% gratuit** — Finnhub free, ta clé Anthropic perso, Era perso.

### Phase A (Fondations transverses) — PR #86

- Format `1 111,55 $` centralisé via `utils/format.ts` (formatCAD, formatNumber,
  formatPercent, formatSigned, formatDate, formatCompactCAD) — 23 tests unitaires
- Suppression du toggle FR/EN — locale `fr` verrouillée, paquet `en.json` retiré,
  dépendance `i18next-browser-languagedetector` retirée
- Version exacte injectée via Vite define (`__APP_VERSION__`, `__GIT_SHA__`,
  `__BUILD_DATE__`) — affichée dans la sidebar (tooltip date de build)
- Mode Couple = indicateur read-only global (`<CoupleModeBadge>`), source de
  vérité unique = `config.users[1].name` non vide

### Phase B (Navigation + sidebar refonte) — PR #86

- Sidebar cachée par défaut (rail 64px) + reveal au hover/focus (288px), transition
  fluide 200ms, respect motion-reduce
- Accordion par groupe (Argent / Plan / Objectifs / Outils) — chaque groupe
  toggleable au clic, aria-expanded propre
- Widget IA "Prochaine Meilleure Action" (`<NextBestAction>`) remplace le palier
  statique — Claude Haiku 4.5 + cache localStorage 1h
- Cleanup : boutons info ℹ️, Synchroniser 🔄, Rapport PDF retirés

### Phase C (Hub Configuration) — PR #87

- Onglet Configuration centralise : profil, retraite (âge, espérance de vie,
  revenus cibles), API keys, sauvegarde
- `<MissingDataBanner>` + `<MissingDataChecklist>` : 11 champs critiques
  déclarés, pattern de redirect cross-tab via `navigateWithFocus(tab, section)`
- `<PayslipUploadCard>` : extraction Vision Claude Sonnet auto-fill grossSalary/netSalary
- Era boot sync : pré-chauffe le cache `buildEnrichedContext` (1h TTL) au mount
- Migration store v4 → v5 : `retirementGoal.lifeExpectancy` (default 90)

### Phase D (Home tab refonte) — PRs #88 + #89

- KPI strip 5 cols : Net Worth, Variation, Active Income, Passive Income, Indicateur Futur
- `<ZoomableTimeChart>` : zoom molette + pan + multi-échelle dynamique (réutilisable Investments)
- Chips toggle multi-comptes + ligne Total overlay
- Stocks cliquables avec checkbox, multi-check → `<StockComparisonModal>` overlay
- Gain $/% depuis l'achat affiché si `Asset.buyPrice` connu (sinon CTA "Configurer")
- `<HealthIndicator>` : score 0-100 paramétrable (4 ratios : épargne, coussin, dette, FIRE)
- Suppression Cash/Saving/Dette/Jalons (vue allégée)

### Phase D' (Budget refonte) — PR #90

- Sync absolue catégories Budget↔Transactions : rename propagé, suppression réassigne à "Uncategorized"
- `<DualKPIStat>` : 4 tuiles Prévu/Réel (Budget / Revenus / Dépenses / Restant) avec écart % coloré
- Santé financière fiscale : `calculateFiscalReport` au lieu de Brut−Net (Fed/QC/RRQ/AE/RAMQ/FSS)
- Filtre Personne A/B/combiné (Pill) en mode couple
- Navigation périodes adjacentes (← Mai 26 → + bouton "Auj.")
- Diagnostic IA fluide (streaming via `chatStream`) au lieu de one-shot 30s

### Phase E (Investissement refonte) — PR #91

- 4 sous-onglets : Vue d'ensemble / Allocation / Rééquilibrage / Détail
- TimeRange global au sommet (affecte toutes les sections)
- StockChart utilise désormais `<ZoomableTimeChart>` (zoom molette, multi-échelle)
- Pies Geo/Sectorielles **interactives** : click → filtre stocks avec gains $/%
- Justifications IA des actions de rééquilibrage (`getRebalanceJustifications`)
- `<AddStockForm>` : ajout manuel avec validation Finnhub + suggestion prix historique
- Portefeuille projeté 2066 = copie exacte FUTUR (consume `lastProjection.chartData`)

### Phase F (Retraite + Immobilier + Enfant + Projets de vie) — PR #92

- Fusion Voyages + LifeEvents → onglet unifié "Projets de vie" (`Tab.LIFE_PROJECTS`)
- Indicateurs activation FUTUR uniformisés (RealEstate + ChildPlanning, mêmes badges)
- Rendement boursier Immobilier sync dynamique avec `projection.returnRate` global
  (coût d'opportunité Buy vs Rent toujours à jour)

### Phase G (Impôts + Documents) — PR #93

- Nouvel onglet **Documents** global (`Tab.DOCUMENTS`) : hub central PDF/Image
  avec catégories (PAYSLIP, T4, BANK_STATEMENT, etc.) et extraction IA Vision
  pour les fiches de paie
- `<CoupleOptimizationCard>` : 3 stratégies IA (Spousal RRSP, allocation CELI,
  pension splitting, transferts crédits) avec confidence + économie estimée $/an

### Cleanup final — PRs #94 + #95

- **E.8 DCA multi-achat** : type `Asset.purchases[]` + store v5→v6 + 4 helpers
  (`utils/assetPurchases.ts`, +10 tests) + UI stats DCA dans Portefeuille Détaillé
- **F.4 Asset Location développé** : score d'efficacité 0-100 live, pré-rempli
  depuis le store, synthèse 3 cards (CELI/REER/NonReg), perte annuelle estimée
- **F.8 Conseils IA Immobilier** : `<RealEstateAdviceCard>` 5 catégories
- **G.3 Tax brackets ultra-précis** : breakdown $ par tranche consommée, effective vs marginal
- **F.5 Extraction CurrentCapitalCard** : Retirement.tsx -23 lignes (partial)
- **F.11 ChildPlanning design pro** : tabs Pill-style cohérents, labels épurés
- **G.2** TaxCenter upload : orienté vers Documents global (`"Calcul rapide / Pour archiver → Documents"`)
- **G.5** Préparation architecturale Dettes/Planning → sous-onglets Transactions (commentaire seulement)
- **+19 tests** pour Documents, CoupleOptimization, assetPurchases (482 → 501 → 511 verts)

### Items volontairement différés (P0+P2+P3+P4+P5)

- E.2 Live prices intraday : nécessite WebSocket payant — current daily data acceptable
- F.5 deep refactor (38k → 20k via extraction multiple) : itératif
- P0 validation visuelle / mobile : à reprendre quand regressions identifiées
- Roadmap "10/10" détaillée : voir HANDOVER §4.4

---

## [unreleased — cycle 8 : Phase 7 + 7.G HIGH fixes + Phase 8 polish] — 2026-05-20

> Phase 7 : 22 sous-tâches (perf, a11y, i18n, market data Finnhub, schema v4,
> CommandPalette, Skeleton). Phase 7.G : 5 bugs HIGH de l'audit. Phase 8 :
> bundle, tests manquants, focus trap Modal, BudgetAiModal→Modal.
> Tests : 348 → 412 (+64). Branche `claude/analyze-finance-app-CtLvs`, PR #85.

### 🐛 §7.G — 5 HIGH findings de l'audit 2026-05

- **SRG double-count fix** (`retirementIncome.ts`) : `rrqMonthly` était déjà
  family-level (× `activeUsersCount`), puis `otherIncomeAnnualFamily` le
  multipliait à nouveau → GIS = $0 pour les couples ayant droit à $5k+/an.
  Fix : `otherIncomeAnnualFamily = (rrqMonthly + dbMonthly) * 12`,
  `otherIncomeAnnualPerAdult = family / max(1, activeUsersCount)`.
  3 tests de régression ajoutés.

- **apiKeys exclues du backup chiffré** (`BackupPanel.tsx`) : `doEncryptedExport`
  envoyait `buildPayload()` complet incluant les clés API. Fix : même
  destructuring que l'export JSON clair (`{ apiKeys: _stripped, ...rest }`).
  Ni le JSON clair ni le .bak ne contiennent maintenant de credentials.

- **RRSP cap desync** (`taxJanuary.ts`) : cap hardcodé à `33330` (faux pour 2026 :
  cap ARC officiel = `33810`). Fix : `RRSP_ANNUAL_LIMITS[nextLoopYear] ?? extrapolation`.
  Import `RRSP_ANNUAL_LIMITS` depuis `utils/tax`.

- **CSP** : `netlify.toml` retire `generativelanguage.googleapis.com` (Gemini
  retiré en PR #73), ajoute `api.anthropic.com` et `finnhub.io`. `index.html`
  ajoute `<meta http-equiv="Content-Security-Policy">` pour GitHub Pages.

- **README** : refonte complète — Gemini→Claude, 115→412 tests, 5→7 scénarios,
  architecture reflète l'état réel (aiOrchestrator, marketData/, schema v4).

### ⚡ Phase 8.A — Bundle + Perf

- `vite.config.ts` : `optimizeDeps.exclude: ['html2canvas']` + `external:
  ['html2canvas']` dans rollupOptions. Retire le define `GEMINI_API_KEY` (obsolète).
- `App.tsx` : `useFinanceStore(useShallow(s => s))` — shallow comparison
  prévient les cascade re-renders lors de mises à jour de slices non rendues
  (ex : `aiConversation`). `loadData` utilise `useFinanceStore.getState()`
  pour éviter les closures stale.

### ♿ Phase 8.C — Accessibilité

- `Modal.tsx` : focus trap complet Tab + Shift+Tab (wrap aux extrémités).
  `dialogRef` pointé sur `role="dialog"`, sélecteur FOCUSABLE couvre tous les
  éléments interactifs natifs.
- `BudgetAiModal.tsx` : remplace l'implémentation inline `<div>` custom par
  `<Modal>` — héritage automatique de `aria-modal`, `role="dialog"`,
  `aria-labelledby`, focus trap, Escape, scroll-lock.

### 🧪 Phase 8.B — Tests manquants

- `tests/utils/transactionParser.test.ts` (9 tests) : `markDuplicates` + `parseTransactions`
  — duplicate detection, score API vs manual, Interac, virement, CSV tab/semicolon.
- `tests/services/aiOrchestrator.test.ts` (8 tests) : `buildEnrichedContext` —
  token vide, parallel calls, graceful error, AbortSignal passthrough ;
  `renderEnrichedContext` — format cash-flow, memory facts.
- `tests/services/retirementIncome.test.ts` (3 tests) : régression SRG §7.G.

### 📚 Phase 8.E — Documentation

- `docs/HANDOVER.md §1` : mise à jour indicateurs (PR #85, 412 tests, schema v4,
  Finnhub, CSP, apiKeys backup fix).
- `CHANGELOG.md` : entrée cycle 8.
- `README.md` : refonte complète (voir §7.G ci-dessus).

---

## [unreleased — cycle 7 : Phase 6 fiscalité complète + flaky fix] — 2026-05-19

> Cycle dédié à la complétion de la Phase 6 fiscale (manques structurels
> identifiés par l'audit 2026-05). 8 items implémentés en suivant un
> protocole strict : impl → 4 agents review en parallèle → fix HIGH/MEDIUM
> → tests intégration → triple validation locale → commit + push.
> Tests : 243 → 348 (+105 nouveaux). Branche `claude/phase-6-tax-qc`.

### 💰 §6.2 — Crédits 65+ et revenu de retraite (fed + QC)

- **ARC ligne 30100** (Montant en raison de l'âge) : indexation 2026 = 2.0%,
  max 8 966$, seuil 46 432$, réduction 15%.
- **ARC ligne 31400** (Crédit pour revenu de pension) : 2 000$ fixe, restreint
  65+ (sauf invalidité non modélisée).
- **Revenu Québec ligne 361** (combinée) : crédit âge 3 986$ + revenu retraite
  3 058$, seuils familiaux 27 835$/45 270$ (single/couple), réduction 18.75%.
- Fonction `calculateAgeAndPensionCredits(opts, netTaxable, year)` avec guard
  NaN/Infinity, indexation seuils via `getIndexedBracketsForYear`.
- Intégration dans `calculateFiscalReport` (param `ageOpts` optionnel) +
  `taxDecember.ts` mode retraité + actif 65+ + `taxJanuary.ts` FERR margRate.
- 16 tests (12 baseline + 4 review-fixes : frontière 64/65, NaN, pension=0+65+,
  snapshot régression).
- Impact : ~970$/personne/an d'économie pour retraité 65+ sous seuils.

### 💊 §6.4 — RAMQ prime régime public d'assurance médicaments

- **Revenu Québec ligne 447 + Annexe K** : seuils 19 500$/31 610$ (single/couple),
  paliers 7.65%/3.84% (palier 1) + 11.48%/5.75% (palier 2), max 766$/adulte.
- Bonus seuils par enfant à charge (4 105$ / 12 110$ pour 1er, +3 790$ / +4 105$
  pour 2+).
- Fonction `calculateRamqPremium(income, opts, year)` avec exemption privée +
  indexation.
- Intégration dans `taxDecember.ts` modes retraité ET actif. `familyNetIncome`
  inclut REER déductions (mode actif) ou retraits REER + 50% gains capitaux
  (mode retraité).
- 18 tests dont 5 review-fixes (frontières seuils, childrenCount=1, frontière
  bracket1/bracket2, exempt + revenu élevé) + 3 intégration `processDecemberTaxFiling`.
- Impact : jusqu'à ~1 532$/an pour couple non-couvert privé.

### 🏦 §6.6 — Stress test OSFI B-20 hypothécaire

- **OSFI guideline B-20** : qualifying rate = max(contractRate + 2 pts, 5.25%),
  GDS ≤ 39%, TDS ≤ 44%.
- Fonctions `calculateB20QualifyingRate(rate)` + `calculateB20StressTest(input)`
  retournant `{qualifyingRate, qualifyingPmt, gds, tds, passes, failReason}`.
- Intégration dans `realEstateMonth.ts` au déclenchement de l'achat. Log warning
  dans `lifeEventLogs` si fail, n'empêche pas l'achat (informatif).
- Indexation des charges logement par inflation pour cohérence avec revenu nominal.
- 16 tests dont 4 review-fixes (amortization=0, frontière GDS 39%, snapshot
  qualifying PMT, contractRate=5.25%).
- Limitations documentées : `otherDebtMonthly = 0` (pas d'accès aux dettes via
  RealEstateCtx), composition mensuelle simple vs semi-annuelle canadienne.

### ✅ §6.8 — Validation SCHL mise de fonds + amortissement max

- **SCHL** : MDP min 5%/5%+10%/20% selon prix (≤500k/500k-1.5M/>1.5M).
  Amortissement max 25 ans (assuré std) ou 30 ans (1er acheteur OU résidence
  neuve depuis août 2024) ou 30 ans (conventionnel ≥20% MDP).
- Fonctions `calculateMinDownPayment(price)` + `validateMortgageParameters(input)`
  retournant `{valid, errors[], downPaymentRatio, minDownPayment, maxAmortizationAllowed, insured}`.
- Intégration : validation au mois d'achat avec warnings groupés (un seul message
  ciblé pour prix >1.5M$, pas de doublon).
- `RealEstateGoal` étendu avec `isFirstTimeBuyer?: boolean` et
  `isNewConstruction?: boolean`.
- Guard epsilon 1e-9 sur frontière MDP 20% (évite mauvaise classification à
  cause d'arrondi flottant).
- 19 tests dont 4 review-fixes (un seul message si prix>1.5M, frontière 1.5M
  exacte, MDP=20% exact, price=0 explicite).

### 🏥 §6.1 — FSS Fonds des services de santé

- **Revenu Québec ligne 446 + Annexe F** : seuils 18 130$/33 130$/63 060$/148 030$,
  paliers 0/1% × excès/150$ flat/150$ + 1%/1 000$ max.
- Fonction `calculateFSSPremium(netIncome, year)` avec indexation complète.
- Intégration `taxDecember.ts` mode retraité uniquement (salariés couverts par
  employeur). Revenu individuel = (pension + rentes + retraits + 50% gains
  capitaux) / activeUsersCount.
- Limitations documentées (audit silent-failure) : 1) actifs autonomes exclus
  (TODO `User.hasSelfEmployedIncome`), 2) revenu individuel approximé par
  moyenne familiale.
- 13 tests dont 3 intégration `processDecemberTaxFiling`.
- Impact : jusqu'à 1 000$/adulte/an pour retraités à revenu élevé.

### 🏠 §6.5 — SCHL prime d'assurance hypothécaire

- **SCHL primes 2026** par tranche LTV : 0.60%/1.70%/2.40%/2.80%/3.10%/4.00%
  (LTV ≤65/75/80/85/90/95%). Assurance non disponible si LTV > 95% ou prix > 1.5M$.
- Fonctions `calculateSchlPremiumRate(ltv)` + `calculateSchlPremium(input)`
  retournant `{ltv, rate, premium, required, available}`.
- Intégration `realEstateMonth.ts` : la prime est ajoutée au principal du prêt
  AVANT calcul du PMT, augmentant les paiements mensuels.
- 17 tests (tous les paliers + frontières + snapshot 5% MDP → 19 000$).

### 💰 §6.7 — TPS/TVQ remboursement résidence neuve

- **ARC RC4028** (TPS) : rebate 36% jusqu'à 350k$, décroissance linéaire à 0
  pour 450k$+.
- **Revenu Québec** (TVQ) : rebate 50% jusqu'à 200k$, décroissance à 0 pour 300k$+.
- Fonctions `calculateGstNewHomeRebate(price)`, `calculateQstNewHomeRebate(price)`,
  `calculateNewHomeRebateTotal(price, isNewConstruction)`.
- Intégration : si `goal.isNewConstruction`, rebate soustrait du `totalCashNeeded`
  à l'achat (modélisation simplifiée : net après remboursement).
- 13 tests (paliers TPS, paliers TVQ, combinaison, snapshot 300k$ → 5 400$).

### 🎁 §6.3 — SRG Supplément de revenu garanti

- **Service Canada Q1 2026** : max 1 105$/mois célibataire, 662$/mois couple/adulte,
  seuils revenu 22 512$/29 760$, clawback 50%.
- Fonction `calculateGISBenefit(otherIncomeAnnual, hasSpouseWithOAS, year)`.
- Intégration dans `retirementIncome.ts` : SRG ajouté au revenu de retraite
  mensuel si age ≥ psvStartAge ET psvMonthly > 0. otherIncome approximé par
  RRQ + DB annualisés.
- 9 tests (max célibataire/couple, clawback, annulation seuils, indexation).
- Limitation documentée : approximation `otherIncome = rrq + db` ignore retraits
  REER et gains capitaux (SRG potentiellement surestimé pour ces profils).
- Impact : crucial pour scénarios faible revenu retraite (jusqu'à 13 200$/an
  célibataire).

### 🐛 Fix flaky `RealEstateGoal isActive guard`

Test pré-existant qui échouait sur main depuis cycle 6 : `makeInactiveGoal`
omettait `totalClosingCosts`, ce qui rendait `totalCashNeeded = downPayment +
undefined + welcomeFees = NaN`. La cascade d'achat ne s'exécutait jamais
silencieusement, faisant converger active/inactive vers le même `estateNetWorth`.
Fix : ajout `totalClosingCosts: 5000` + fonds suffisants pour garantir l'achat
+ assertion renforcée (`diff > max(1, inactiveBase × 1%)` plutôt que `!==`).

### 🔬 Protocole agents review (multi-agents qualité par PR)

À partir de §6.2, chaque item §6.x déclenche un cycle :
1. Implémentation baseline + tests + triple validation.
2. Lancement de 4 agents en parallèle (typescript-reviewer, code-reviewer,
   silent-failure-hunter, tdd-guide) avec contexte ciblé.
3. Synthèse des findings (HIGH/MEDIUM/LOW + tests manquants).
4. Application des fixes critiques (HIGH systématique, MEDIUM selon impact).
5. Tests additionnels (snapshot régression, frontières exactes, intégration).
6. Triple validation finale + commit "review fixes" sur la même PR.

Résultat : 11 HIGH + 14 MEDIUM identifiés et résolus AVANT merge. Sans ce
protocole, les calculs fiscaux auraient des biais silencieux non détectables
par typecheck/tests baseline.

### 📚 Documentation

- `docs/PLAN_PHASE_6.md` (créé) : plan de match suivi PR par PR.
- `docs/HANDOVER.md` §3.4 : à mettre à jour après merge PR #84 (tous les ⏳ → ✅).
- Mémoire projet (`.claude/projects/.../memory/`) : 6 fichiers de mémoire
  pour Marc (profile, projet, workflow git, règles fiscales, état Phase 6,
  feedback agents).

### ✅ Tests

348/348 tests verts (vs 243 sur main avant ce cycle). Aucun flaky restant.
Typecheck strict clean en permanence. Build production : ~3.75s.

---

## [unreleased — cycle 6 : Claude+Era migration + UI refoundation + a11y polish] — 2026-05

> Le plus gros cycle depuis le lancement. Migration complète de la stack
> IA, refonte du design system, et toutes les pages standardisées sur un
> pattern uniforme.

### 🤖 Phase 4.A — Migration Gemini → Claude (5 PRs séquentielles)

- **`services/claude.ts`** créé (~550 lignes) : wrapper `@anthropic-ai/sdk`
  mirroring complet de l'ancienne surface Gemini.
  - `chat`, `chatStream` — équivalents `generateContent` + streaming
  - `categorizeBatch` — modèle `claude-haiku-4-5` (volume + vitesse)
  - `analyzeBudget`, `analyzePayslip`, `analyzeDocuments` — Sonnet 4.6
  - Préservation de `sanitizePayee`, `roundToHundred`, Zod schemas, `QUEBEC_FISCAL_CONTEXT`
  - `dangerouslyAllowBrowser: true` (app client-side, clé utilisateur)
- **Schema store v1 → v2 → v3** : ajout `apiKeys.anthropic` puis suppression
  `apiKeys.gemini`. Migration progressive sans casser les utilisateurs
  existants.
- **5 consumers migrés** : `AiAssistant`, `BudgetAiModal`, `Transactions`
  (catégorisation), `TaxCenter` (Vision), `Planning` (suggestions goals).
- **`services/gemini.ts` supprimé** + dépendance `@google/genai` retirée du
  `package.json`. Cleanup final dans la PR A5.
- **Bundle** : `ai-vendor` chunk 289 KB → 130 KB (**-55%** — Anthropic SDK
  plus léger).

### 🌐 Phase 4.B — Era Context comme moteur de qualité

- **`services/eraContext.ts`** étendu (1 endpoint → 9 endpoints) :
  - `getCashFlow`, `analyzeSpending`, `forecastSpending`, `getDailyFinancialSummary`
  - `rememberFact`, `recallHistory` (mémoire persistante)
  - `searchTransactions`, `listRecurringCharges`
  - Helper générique `eraRequest()` avec timeout, Bearer auth, validation Zod, cache TTL 1h
- **`services/aiOrchestrator.ts`** (nouveau, ~135 lignes) :
  - `buildEnrichedContext(token)` : Promise.all parallèle sur 4 endpoints
  - `renderEnrichedContext(ctx)` : format pour system prompt Claude
  - `maybeRememberFromMessage(msg, token)` : détecte "remember:"/"souviens-toi:"
- **`components/AiAssistant.tsx`** : court-circuit "remember:" + system
  prompt enrichi automatiquement avec insights Era Context.
- **`components/Planning.tsx`** : utilise `listRecurringCharges` Era Context
  comme primaire, Claude fallback (toast indique la source).
- **`components/dashboard/EraContextInsights.tsx`** (nouveau) : widget Dashboard
  qui montre cash-flow 90j + top catégorie 30j + prévision mois prochain +
  anomalies + mémoire. Silencieux si pas de token Era.

### 🎲 Phase 4 #4 — Nouveaux scénarios compound stress

2 scénarios MC supplémentaires (5 → 7 au total) :

- **`COMPOUND_STRESS`** (« Tempête Parfaite ») : empile inflation 5%+,
  rendements anémiques (CELI/REER 3%, NonReg 2%, cash 1%) ET force
  `ltcEnabled = true` via override scenario-local. Le pire du pire.
- **`LATE_INHERITANCE`** (« Héritage Tardif ») : injection de 250 000$ au
  mois 240 (an 20) au lieu de WINDFALL (mois 60). Teste le pont fiscal long.

UI : grille scenarios passe de `md:grid-cols-5` à `sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7`,
badge "Nouveau" sur les 2 ajouts.

### 🎨 Refonte UI complète (Phases A → D)

- **Phase A — Design tokens + primitives** :
  - `tailwind.config.js` : couleurs sémantiques (primary, success, warning,
    danger, info, secondary), scale typo cohérente (text-display/h1/h2/body/
    meta/tiny — fin des `text-[9-11px]` ad-hoc), border-radius `rounded-card`,
    focus utility `focus-ring`.
  - 14 primitives dans `components/ui/` : Button, Badge, Card, CollapsibleSection,
    KPIStat, StatGrid, PageHeader, Pill, SectionHeader, EmptyState, Modal,
    ConfirmModal, Toast, Tooltip, ErrorBoundary. Tests RTL pour chacune.
- **Phase B — Navigation** :
  - `Layout.tsx` regroupé en 4 groupes thématiques sidebar (Argent / Plan /
    Objectifs / Outils)
  - Deep-link cross-tab : `pendingFocus` dans le store + `navigateWithFocus(tab, section)`
    + hook `usePendingFocus` + animation `animate-pulse-once`
  - 5 consumers : Dashboard, Budget, Children, Investments, RealEstate
- **Phase C — Refonte des 9 pages** (C1 → C7) :
  - C1 FutureProjection : Hero KPI 4-strip (FIRE/Patrimoine/MC Success/FVI)
    + 4 CollapsibleSection (Macro / Variabilité / Stochastiques / Avancés)
  - C2 Dashboard : 4-KPI StatGrid + EraContextInsights widget + chart Brush
    multi-période + 3 cards segmentées
  - C3 Budget : 4-KPI StatGrid + `BudgetGroupTable` extrait + bandeau impact
    long terme cliquable (deep-link FutureProjection)
  - C4 Investments : KPIStat/StatGrid dans card Portefeuille projeté +
    3 CollapsibleSection (Allocation / Rééquilibrage / Portefeuille Détaillé)
  - C5 RealEstate : 4-KPI StatGrid + `PropertyConfigurator` + `MultiPropertyComparison`
    sous-composants
  - C6 Transactions : PageHeader uniformisé
  - C7 Retirement, TaxCenter, DebtManager, Travel, LifeEvents, Settings,
    Children avec PageHeader
- **Phase D — Mobile + animations** :
  - Bottom nav `text-tiny`, drawer regroupé, touch targets ≥ 56px, `pb-safe`
    pour iOS
  - Utilities `lift-on-hover`, `animate-pulse-once`, `touch-target`

### ♿ A11y — Audit Phase 5.1

- `components/Layout.tsx` : skip link "Aller au contenu principal" en
  premier focusable, devient visible au focus clavier
- `<main>` reçoit `id="main"` + `tabIndex={-1}` (target du skip link)
- `text-[9-11px]` bannis du codebase (0 occurrence)

### 📚 Documentation structurée

- **`docs/ARCHITECTURE.md`** (nouveau) : vue d'ensemble pour nouveaux
  contributeurs (stack, topologie, store, moteur projection, IA, tests,
  workflow contributeur)
- **`docs/adr/`** (nouveau dossier) : 4 ADRs courts
  - ADR-001 Migration Gemini → Claude
  - ADR-002 Era Context comme moteur de qualité
  - ADR-003 Split projection.ts modulaire (31 sous-modules)
  - ADR-004 Design system primitives custom (vs shadcn/Radix)
- **`docs/PROJECTION.md`** mis à jour : 7 scénarios documentés (Phase 4 #4),
  pipeline diagram à jour, count de tests (47 + 28)
- **`docs/UI_REFOUNDATION_PLAN.md`** : Phase A/B/C/D toutes marquées ✅ FAIT
  avec description précise de ce qui a atterri
- **`docs/WIRING_NOTES.md`** : section "UI Phase C terminée" + section
  "Phase 4 #4 Compound stress" + section "Deep-link cross-tab"
- **`docs/TYPECHECK_BACKLOG.md`** : entièrement réécrit (backlog résorbé,
  doc historique)
- **`docs/PLAN_PHASE_4.md`** (nouveau) : plan détaillé de la migration
  Claude + Era (référence historique)
- **`docs/AUDIT_2026-05.md`** §Phase 5 : colonne État ajoutée (5.1 ✅,
  5.2 ✅, 5.3-5.6 ⏳ non prioritaires)

### 🚀 Déploiement

- **GitHub Pages** : workflow `.github/workflows/deploy-pages.yml` créé,
  `VITE_BASE_PATH` configurable dans `vite.config.ts`
- **Vercel** : auto-detected, preview par PR

### ✅ Tests

225 tests verts (24 fichiers de test) tout au long du cycle. Aucune
régression introduite. Typecheck strict clean en permanence.

---

## [unreleased — cycle 5 : UI coverage 100% du moteur] — Branche `claude/analyze-finance-app-CtLvs`

### 🔍 Audit UI coverage par agent

Le moteur lit ~150 champs depuis SimulationParams + sous-types. L'audit a révélé que **~35% des champs effectivement utilisés** n'avaient aucun contrôle UI : leurs valeurs restaient figées sur les défauts.

### ⚙️ Nouveau composant : `AdvancedProjectionParams.tsx`

Panneau collapsible dans FutureProjection qui expose les paramètres jusque-là cachés :

**🔥 Stress Test (4 champs HIGH)** : enabled, year, drop, recovery + inflation shock — feature lue par moteur mais inaccessible.

**🎯 Optimisations fiscales (3 toggles HIGH)** :
- `useSmithManoeuvre` (hypothèque déductible)
- `optimizeSourceDeductions` (T1213)
- `vehicleReplacementEnabled` (auto-replace cyclique)

**🎲 Monte Carlo & Bootstrap** :
- `monteCarloIterations` (50-1000) — **désormais lu par le moteur** (était figé à 100)
- `bootstrapBlockSize`

**🎭 Détails événements stochastiques** (apparaissent quand le toggle correspondant est ON) :
- Divorce: probabilité annuelle, split %, pension alimentaire
- LTD: probabilité, % revenu maintenu, durée
- CI: probabilité, capital forfaitaire, dépenses additionnelles
- Héritage: montant attendu, âge attendu, incertitude, probabilité
- Perte d'emploi: probabilité, durée
- Survivant: % RRQ + % DB conservés

**🌴 Snowbird** : mois/an + surcoût mensuel
**🧒 Sandwich generation** : boomerang + caregiving (montant, âge début, durée)
**💰 Soldes initiaux manuels** : useManualBalances + 7 champs (CELI/REER/NonReg/Cash/Crypto/CELI room/REER room)
**📊 Rendements affinés** : crypto + cash (absents de la grille principale)

### 🧹 Cleanup

- Orphelins marqués `@deprecated` dans types.ts (scenarioB, scenarioBLabel)

---

## [unreleased — cycle 4 : ProjectionChartPoint + W5.x câblage] — Branche `claude/analyze-finance-app-CtLvs`

### 🎯 PR A — `ProjectionChartPoint` typé (TS reviewer quick win #1)

- Interface `ProjectionChartPoint` avec ~90 champs optionnels typés (NetWorth, IncomeMarc, CELI, REER, MarketGrowth*, etc.)
- `ProjectionResult.chartData: ProjectionChartPoint[]` (au lieu de `any[]`)
- ROI: élimine ~35 erreurs TS strict en cascade dans RealEstate/Investments/ChildPlanning

### 🔗 PR B — `RegisteredAccountType` unification finale

- `InvestmentAccount.type: 'CELI'|...` → `RegisteredAccountType` (élimine la 2e union divergente)

### 🔌 PR C — W5.x conteneurs câblés au moteur (cycle 4 intégration)

Les conteneurs capturés en UI depuis PR #16 mais ignorés du moteur sont maintenant **fonctionnels** :

- **W5.4 Assurances** : primes mensuelles ajoutées aux dépenses (avec respect `expiryDate` pour T10/T20/T30)
- **Véhicules cycliques** : `liquid -= cost` tous les N×12 mois
- **Rénovations majeures** : `liquid -= cost` à la date planifiée
- **Dons charitables** : `monthlyExpenses` + crédit fiscal 33% (`taxCurrentYear.revenu`) + bonus titres appréciés
- **W5.6 Immeubles locatifs** : NOI = `(rent×(1-vacancy) - expenses)` ajouté au revenu + imposable au marginal 45%

`SimulationParams` étendu, `Retirement.tsx` + `FutureProjection.tsx` passent les conteneurs via store.

5 tests régression W5.x ajoutés. Tests: **148/148**.

---

## [unreleased — cycle 2/3 fixes + architecture refactor + final agents review] — Branche `claude/analyze-finance-app-CtLvs`

### 🔍 Phase 4 — Re-run 3 agents post-refactor

3 agents relancés (code-reviewer, silent-failure-hunter, typescript-reviewer) ont vérifié les phases 1-3. Verdicts :
- **code-reviewer**: "Ship it" — 0 HIGH/CRITICAL. 1 LOW non-régression (array index keys in AssetLocationCard, anti-pattern pré-existant).
- **silent-failure**: 1 MEDIUM identifiée — Worker sans timeout/messageerror.
- **ts-reviewer**: ~40 erreurs strict éliminées par ProjectionResult, gain effectif 64 erreurs (vs 104 avant). Quick win RegisteredAccountType inutilisé.

### 🔧 Cycle 3 fixes additionnels

- **Worker timeout 30s + messageerror handler** : runAsync.ts cleanup unifié + détection mort automatique sur timeout/erreur (évite Promises pendantes indéfinies)
- **`Asset.accountType` câblé sur `RegisteredAccountType`** : unification du type partagé (préparation pour Retirement/FutureProjection/Investments)

---

## [unreleased — cycle 2/3 fixes + architecture refactor] — Branche `claude/analyze-finance-app-CtLvs`

### 🐛 Fixes post-merge PR #18 (cycle 2 multi-agents)

**Phase 1 — Findings restants des agents** :
- A: `HISTORICAL_RETURNS_US` mutation top-level retirée (effet de bord cross-test). CPI canadien lu via `canadianInflationFor()` à la demande.
- B: Tests comportementaux `useDebouncedMemo` avec `vi.useFakeTimers` (3 tests behavior).
- C: 2 `as any` Retirement.tsx retirés (`dbElectionType`, `dbSurvivorPct` désormais typés).
- D: `month1ActionPlan` typé `{ monthlyCashflow; strategy } | null` (élimine cascade strict).
- E: `goalSeekBusy` partagé entre 3 boutons → split en `busySavings`/`busyAge`/`busyDrawdown` (silent-failure: cliquer rapidement n'affiche plus de résultats croisés).
- F: **`ProjectionResult` interface exportée** + retour `calculateFutureProjection` typé. `runProjectionAsync` passe de `Promise<any>` à `Promise<ProjectionResult>`. ROI: élimine ~40 erreurs TS strict en cascade.

### 🏗️ Phase 2 — Architecture refactor (code-architect agent)

- `components/retirement/GoalSeekerCard.tsx` (124 lignes) — extraction Goal seeker + Drawdown optimizer + 3 busy flags + 2 results state local
- `components/retirement/AssetLocationCard.tsx` (91 lignes) — extraction holdings + analyse
- `components/Retirement.tsx` réduit **702 → 527 lignes (-25%)**
- Phase 2.1 (split `types.ts`) et 2.3 (split `projection.ts`) explicitement skip:
  - `types.ts` split: cosmétique single barrel file, risque > bénéfice
  - `projection.ts` split: ~2400 lignes, refactor majeur réservé à session dédiée

### 🎯 Phase 3 — Type tightening (type-design agent)

- Union stricte `Industry` (13 valeurs: tech/finance/health/public-sector/education/construction/retail/manufacturing/energy/transportation/agriculture/media/other) remplace `User.industry: string`
- Union `RegisteredAccountType` (CELI/CELIAPP/REER/NON-ENREG/CRYPTO/REEE/MARGE/AUTRE) — préparation unification 3 unions divergentes (Asset.accountType, InvestmentAccount.type, AccountType d'assetLocation)
- Settings UI: champ Industry passe d'input text à `<select>` avec les 13 valeurs

---

## [unreleased — post W1-W5] — Branche `claude/analyze-finance-app-CtLvs`

Bundle d'optimisations + nouvelle feature suite à l'analyse multi-agents du PR #16.

### ⚡ Performance (perf-optimizer agent #1 et #2)
- `utils/useDebouncedMemo.ts` (nouveau): hook React générique, debounce 300ms
- `Retirement.tsx` + `FutureProjection.tsx`: `useMemo` projection → `useDebouncedMemo`
- Gain estimé: -80% de recalculs pendant la saisie utilisateur
- **Web Worker câblé** dans FutureProjection pour MC (libère main thread 1.5-3s)
- Indicateur visuel ⏳ pendant calcul MC + bouton disabled

### 🧪 Couverture tests (silent-failure-hunter agent)
- 9 nouveaux tests Vitest pour les événements stochastiques (Divorce, LTD, CI, Inheritance, Survivor, Snowbird, Bootstrap, Replay 2008, US Withholding)
- 6 tests `assetLocation` (incl. cas allocation déjà optimale)
- Tests passent: 132 → 137/137

### 📊 Précision modélisation
- **Canadian CPI 1928-2024** (StatCan v41690973): le bootstrap historique utilise maintenant l'inflation canadienne au lieu d'US CPI (capture les divergences années 70-80, contrôles de prix Trudeau)
- 3 tests vérifiant les valeurs clés (1975-76, 2022 post-COVID, fallback)

### 🧭 Nouvelle feature: Asset Location Optimizer (L9)
- `services/projection/assetLocation.ts`: optimizeAssetLocation()
- Implémente la règle d'or canadienne (Canadian Couch Potato / PWL Capital)
- 7 classes d'actif × 3 comptes
- Calcule la perte annuelle ($) d'une mauvaise allocation
- UI dans Retirement: éditeur de holdings + bouton "Analyser"

---

## [unreleased — vague W1-W5] — Branche `claude/analyze-finance-app-CtLvs`

Bundle majeur ajoutant 11 nouvelles vagues d'améliorations identifiées lors de l'analyse de marché vs ProjectionLab, Pralana Gold, Snap Projections, Boldin, NaviPlan, etc.

### 🏗️ Fondations précision (W1)
- **W1.1** Web Worker scaffold pour MC hors thread principal (services/projection.worker.ts + runAsync.ts)
- **W1.2** Bootstrap historique S&P 500 1928-2024 (97 ans, source Damodaran NYU). Capture les vrais krachs.
- **W1.3** RRQ et PSV séparés (corrige L1: governmentPension × 0.65/0.35 obsolète)
- **W1.4** Scénario survivant après décès du conjoint (RRQ 60%, PSV cesse, DB selon election)
- **W1.5** Goal seeking inverse: trouve épargne nécessaire ou âge retraite minimum par dichotomie

### 💰 Optimisations fiscales (W2)
- **W2.6** Drawdown order optimizer: compare 5 stratégies, retourne la meilleure
- W2.1/W2.3/W2.7 capturés en config (flags, logique partielle)

### 🎲 Événements de vie stochastiques (W3)
- **W3.1** Divorce probabiliste (1.5%/an, split 50%, alimony)
- **W3.2** Invalidité longue durée (0.5%/an, 60% revenu pendant 24 mois)
- **W3.3** Maladie grave (0.3%/an, capital + dépenses)
- **W3.4** Héritage probabilisé (fenêtre ± uncertainty)
- **W3.5** Sandwich generation (boomerang kids + caregiving parents âgés)

### 📊 Visualisation et UX (W4)
- **W4.1** TaxBracketViz (fédéral + Québec avec marqueur revenu)
- **W4.5** Replay krach historique (1929/1973/2000/2008/2020/2022)
- **W4.7** Snowbird (4-6 mois US/Mexique)

### 📥 Capture variables (W5)
- **W5.1** Profil utilisateur enrichi (santé, carrière, identité, longévité)
- **W5.2** Bonus/RSU/Stock options/Side income/Périodicité paie
- **W5.3** Dettes étendues (kind, taux variable, limite, terme, déductible)
- **W5.4** InsurancePolicy (11 types de police)
- **W5.5** DB joint-life vs single-life avec %survivant
- **W5.6** RentalProperty (cap rate, vacancy, NOI, DPA)
- **W5.7** PrivateBusiness (CCPC, dividendes, BNR)
- **W5.x** Goals cycliques (véhicules, rénovations, dons charitables)

### 📚 Documentation
- `docs/PROJECTION.md` étendu (sections 7-11 ajoutées)
- Toutes les W-features documentées avec tables récapitulatives

---

## [PR #15 mergé] — Branche `claude/analyze-finance-app-CtLvs`

Bundle massif sur PR #15. Refactor profond du moteur de projection + nouvelles features de modélisation + correctifs de déterminisme.

### 🏗️ Refactor moteur de projection (D2.x)

#### D2.1 — Migration physique
- `utils/useFutureSimulation.ts` (1947 lignes) → `services/projection.ts`.
- Aucun consumer à mettre à jour (tous importaient déjà via `services/projection`).
- Import interne `./tax` ajusté en `../utils/tax`.

#### D2.2 — Extraction helpers purs
- Nouveau module `services/projection/helpers.ts`.
- Fonctions extraites : `mulberry32`, `gaussianRandom`, `applyShock`, `welcomeTax`, `ltcAnnualProbability`, `mortalityAnnualProbability`.
- Constantes extraites : `ASSET_VOLATILITY`, `MER`, `RRIF_RATES`.
- Bug latent documenté dans `welcomeTax` : paliers en `else if` (non-cumulatifs, faux fiscalement) — figé par tests régression.
- `applyShock` n'est plus redéfini 360× par scénario.
- 24 tests unitaires sur les helpers.

#### D2.3 — Correctifs déterminisme et nettoyage
- 🎯 **Graine Monte Carlo découplée du capital initial** (`scenario-strategy-iter` au lieu d'inclure `calculatedStartingCash`) — permet la comparaison équitable de stratégies.
- 🐛 Suppression de `new Date().getFullYear()` (rendait la simulation dépendante de l'horloge système).
- Suppression d'une fonction `logEvent` module-level shadow ée par sa version locale.
- Suppression de la double affectation de `monthlyExpenses` dans la phase retraite.
- **MC_ITERATIONS** : 50 → 100 (IC95% ≈ ±3 points vs ±7).

### ✨ Nouvelles features de modélisation

#### D2.4 — Pension à prestations déterminées (DB)
- 3 nouveaux champs dans `RetirementGoal` :
  - `dbPensionMonthly` — rente mensuelle couple
  - `dbPensionIndexationPct` — fraction d'IPC répercutée (0-100, défaut 100)
  - `dbPensionStartAge` — défaut = `targetAge`
- Pour les fonctionnaires (RREGOP, féd, profs, infirmières), c'est souvent le revenu de retraite #1.
- UI complète dans `Retirement.tsx`.

#### D2.5 — Smile Curve (dépenses retraite en U)
- Référence : étude CIBC "Spending in Retirement".
- Go-go (jusqu'à 74) : +15%, Slow-go (75-84) : base, No-go (85+) : -10%.
- Flag opt-in `useSmileCurve` dans `ProjectionConfig`.
- Toggle UI `😊 Smile Curve` dans `FutureProjection`.

#### D2.6 — Métrique Sequence Risk
- Nouvelles métriques dans `expertMetrics` :
  - `sequenceRiskPct` — % itérations MC où NW < 50% startNW dans la décennie critique [retraite-5, retraite+5]
  - `worstDecadeDrawdown` — pire chute relative
  - `criticalDecadeStartYear` / `criticalDecadeEndYear`
- Un krach durant cette fenêtre est ~10× plus destructeur qu'à 20 ans de retraite.

#### D2.7 — Withholding tax US 15% sur CELI
- Le CELI n'est PAS protégé par la convention fiscale Canada-US (le REER si).
- Nouveaux champs : `usEquityShareCeli` (0-100%), `usEquityDividendYield` (défaut 1.5%).
- Drag = share × yield × 15% appliqué sur `effectiveCeliRate`.
- UI : 2 sliders dans `FutureProjection`.

#### D2.8 — Mortalité stochastique + Soins longue durée (LTC)
- **LTC** : probabilités annuelles calibrées Stats Can/Genworth (1% à 65 → 25% à 90+). Coût mensuel paramétrable (2000-12000$). Une fois déclenché, persiste.
- **Mortalité** : tirage annuel selon table Stats Canada 2020-2022 (0.6% à 60 → 33% à 100). En mode MC + flag, la boucle `break` à la mort. `estateNetWorth` devient le patrimoine au décès.
- 2 toggles UI + slider coût LTC.

#### D2.9 — Inflation différenciée par poste
- Panier CPI Stats Canada 2023 (logement 30%, alim 17%, transport 15%, santé 5%, loisirs 6%, autres 27%).
- 6 sliders configurables.
- Le bonus santé après 75 ans s'applique désormais sur la part Santé uniquement.

#### D2.10 — Perte d'emploi stochastique
- Probabilité annuelle ~3% (Stats Can).
- Durée moyenne sans emploi : 6 mois (paramétrable).
- Pendant la période : salaire user1 = 55% (assurance-emploi).
- Toggle UI.

### 📚 Documentation

- ➕ **`docs/PROJECTION.md`** : documentation détaillée du moteur de projection (9 phases mensuelles, calendrier fiscal, déterminisme, cas-tests, limitations).
- ➕ **`CHANGELOG.md`** : ce fichier.
- 🗑️ **`CHANGELOG_COMPLET.md`** : supprimé (corrompu UTF-16, remplacé).
- 📦 Archivés dans `docs/archive/` :
  - `AUDIT_REPORT.md`
  - `META_AUDIT.md`
  - `PLAN_DE_FIX.md`
  - `RAPPORT_FIXES.md`
  - `plan_mcp_financeai.md`

### 🧪 Tests

- 79 → **115 tests** (toujours 100% pass).
- 6 fichiers de tests : `projection.test.ts`, `projection.helpers.test.ts`, `tax.test.ts`, `portfolio.test.ts`, `realEstate.test.ts`, `safeNumber.test.ts`.

---

## [Session précédente] — Mai 2026

### U-series — UI / UX
- **U1** : Conversation `AiAssistant` persistée dans le store (avec timestamps ISO).
- **U2** : Backup chiffré AES-256-GCM (PBKDF2 600k iters) dans Settings.
- **U3** : Vue mobile responsive pour `Transactions` (card layout en `<ul>` mobile).
- **U4** : `SystemView` — remplace faux terminal par diagnostic réel basé sur l'état.

### I-series — Infrastructure
- **I1** : Mini-proxy Netlify Function remplace `api.allorigins.win` (SSRF-safe).

### R-series — Robustesse
- **R1** : ErrorBoundary par onglet (reset via `resetKey`).
- **R2** : AbortController dans `loadData` pour éviter race conditions sur sync API.
- **R3** : Helper `safeNumber` anti-NaN/Infinity + 13 tests.

### T-series — Tests
- **T1** : Tests moteur projection + régression barèmes 2026.
- **T4** : Validation Zod des réponses Gemini LLM (4 schémas).

### D-series — Données
- **D1** : Mise à jour barèmes fiscaux 2026 (ARC + Revenu Québec).

### F-series — Persistance
- **F5a/b/c/d** : Persistance des états locaux dans le store (ChildGoal, RealEstateGoal, ProjectionConfig).

### Autres
- F3 : Remplacement de `window.confirm`/`prompt` par modal React dans Settings.
- Migration Lunch Money → Era Context (auth, schémas, CSP).

---

## [Historique plus ancien]

Voir `docs/archive/RAPPORT_FIXES.md` et `docs/archive/AUDIT_REPORT.md` pour les sessions de hardening initiales.
