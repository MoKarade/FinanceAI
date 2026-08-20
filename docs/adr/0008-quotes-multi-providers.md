# ADR — Quotes multi-providers : Yahoo en repli + diagnostic actionnable (`HIST-MULTI-PROVIDER`, 2026-07-23)
**Statut** : accepté (demandes Marc verbatim : « plusieurs trucs comme yahoo et finhub etc pour tout
avoir » ; « je veux assez de providers pour que ca fasse au moins tout ce que jai et plus »).

**Contexte** : après [HIST-COVERAGE-TOTAL], le TOTAL restait à ~200 k$ (vs ~242 k$) et des titres
restaient sans courbe. Cause racine : le repli « valeur actuelle » dépend de `currentPrice`, or le
tier gratuit Finnhub ne quote PAS les bourses européennes → les ETF Euronext gardaient un prix saisi
à la main, vieux ou absent. Et quand l'auto-résolution de ticker échouait, la raison était invisible
(journal seulement).

**Décision** :
1. **Chaîne de quotes multi-providers** (`getQuote` façade) : crypto → CoinGecko ; sinon Finnhub
   (si clé) → **repli Yahoo** via le MÊME endpoint chart du proxy same-origin (`meta.regularMarketPrice`,
   zéro rewrite de plus, devise Yahoo = vraie devise du titre → la garde currency-mismatch de
   priceRefresh protège). `hasQuoteProvider` = vrai pour tout non-crypto dans le navigateur.
2. **Le symbole de COTATION suit la résolution** : `priceRefresh` quote `historySymbol || symbol`
   (un ticker résolu CW8 → CW8.PA sert aux quotes aussi, patch keyé par le symbole de l'actif).
3. **Bouton « Actualiser les cours » = resynchronisation COMPLÈTE** : purge du cache 'history' du
   jour + hydratation FORCÉE (variantes incluses) + refresh des quotes forcé + publication du
   diagnostic. L'utilisateur n'attend plus 24 h pour voir l'effet d'une correction.
4. **Diagnostic PAR TITRE à l'écran** (`HistorySyncDoctor`, Investissements) : raison exacte en
   français (`skipped[].detail` + `triedSymbols`), champ « symbole de cotation » inline (purge
   l'historique du titre au changement — un historique d'un MAUVAIS titre ne survit pas), et
   **recherche par NOM** (`/api/search/yahoo` → tickers candidats cliquables). Rapport en module
   session pur (`syncDiagnostics`, pattern viewContext) ; JAMAIS rendu en mode test (tickers réels).

**Pourquoi pas un 3e provider (Stooq…)** : Yahoo couvre déjà toutes les bourses détenues (mondial) ;
le gap réel était « trouver le bon ticker », pas « une source de plus ». Un provider redondant à
faible couverture Euronext ajouterait de la surface de bugs sans fermer le vrai trou. À réévaluer si
le diagnostic montre un jour un titre hors de portée des deux.

**Trade-offs** : quote Yahoo = daily/delayed (pas intraday temps réel — même granularité que Google
Finance) ; la recherche par nom expose le nom d'actif SAISI à Yahoo via le proxy (même périmètre de
confidentialité que l'historique par ticker, geste explicite de l'utilisateur).
