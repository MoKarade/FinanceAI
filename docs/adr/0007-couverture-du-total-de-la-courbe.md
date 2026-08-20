# ADR — Couverture du TOTAL de la courbe de portefeuille (`HIST-COVERAGE-TOTAL`, 2026-07-23)
**Statut** : accepté (demande Marc 2026-07-22 : « normalement j'ai 230K mais dans la courbe je vois 180k » ;
SURCLASSE la règle no-fake-data d'origine de buildMarketData « un actif sans historique n'a NI colonne NI
part dans les totaux » — décision du panel 2026-07-22, révisée en connaissance de cause).

**Contexte** : ~50 k$ de titres détenus (Amundi EM Asia, CW8.PA, GBS.PA — tickers européens sans candles
chez les providers gratuits) étaient EXCLUS des totaux de la courbe → le TOTAL affiché (~190 k$) contredisait
le patrimoine réel (~242 k$, vérifié Google Finance/courtier). Un TOTAL amputé est un chiffre FAUX affiché
avec assurance — pire que l'approximation qu'on évitait.

**Décision** (`services/history/buildMarketData.ts`) :
1. Titre SANS historique → contribution PLATE au TOTAL/buckets à `qty(t) × currentPrice × fx` ; AUCUNE
   colonne (on n'invente jamais une courbe) ; signalé `noHistorySymbols` + bandeau Dashboard avec le
   montant compté. Sans prix courant connu → rien n'est compté (0 honnête, signalé quand même).
2. Dates AVANT le début d'historique d'un titre détenu (provider borné) → PREMIER close connu (backfill
   borné, signalé `partialHistorySymbols`) — supprime la « marche » fantôme du TOTAL.
3. Queue PÉRIMÉE (> 7 j) → raccord au `currentPrice` sur les 7 derniers jours SI la quote live est fraîche
   (`priceUpdatedAt` < 7 j) — cas « quote OK, candles cassées » (GBS.PA) ; sinon le titre sort de la courbe
   ET est SIGNALÉ `staleTailSymbols` (« absent du total des derniers jours ») — correctif panel #493
   (silent-failure, CRITIQUE) : sans ce signal, on reproduisait en silence le trou même que ce lot corrige.
4. Tickers NUS sans réponse → variantes de suffixe par DEVISE à l'hydratation (EUR → .PA/.DE/.AS/.MI,
   CAD → .TO/.V), acceptées SEULEMENT si le dernier close est plausible vs `currentPrice` (facteur ≤ 2,
   refus sans référence — anti-collision de ticker) ; résolution persistée `Asset.historySymbol` (additif).
   ⚠️ Correctifs panel #493 : (a) variantes déclenchées UNIQUEMENT sur un vide CONFIRMÉ (`[]`), jamais sur
   `null` (panne réseau) — une panne transitoire sur le vrai symbole ne doit pas faire adopter un autre
   titre (code-reviewer, prouvé par sonde) ; (b) un `historySymbol` résolu qui répond vide déclenche le
   retour au symbole saisi + autres variantes (self-heal, pas de gel à vie) ; (c) des variantes en échec
   réseau après un principal vide → verdict « error » (retry) + logError, jamais « empty » menteur.

**Pourquoi** : la frontière no-fake-data se déplace de « ne jamais approximer » à « ne jamais approximer
SANS le dire » : chaque approximation est signalée à l'écran, mais le TOTAL reflète TOUT le portefeuille.
`TOTAL = Σ colonnes + Σ contributions plates sans colonne` (la reconstructibilité stricte TOTAL == Σ
colonnes ne tient plus quand un titre sans historique existe — assumé, documenté dans l'en-tête).

**Trade-offs** : la contribution plate ignore les variations passées du titre (courbe TOTAL amortie) ;
le backfill au premier close ignore la performance pré-historique ; le facteur 2 de plausibilité peut
refuser un titre qui a réellement fait ×2+ depuis la dernière quote (l'utilisateur précise alors le
symbole suffixé — message logError explicite).

**Alternatives rejetées** : scraper Google Finance (pas d'API publique, ToS, cassera sans prévenir) ;
forward-fill illimité du dernier close (un titre déliste resterait « valorisé » à vie) ; variantes sans
garde de plausibilité (courbe d'un AUTRE titre affichée avec assurance = pire violation possible).
