# Décisions d'architecture (ADR)

> Journal court des décisions structurantes. Format : Contexte / Décision / Pourquoi / Trade-offs / Alternatives
> rejetées. Les ADR livrés plus anciens sont consolidés dans `docs/HISTORIQUE.md`.

## Batch 2026-07-06 — Décisions Marc consolidées (8 items, 2 jeux fiscaux reçus)
**Statut** : accepté (Marc, 2026-07-06). Applicabilité : immédiate (FISC), à confirmer (FISC-TAXDEC-INCR).

**Contexte** : audit financier complet (6 lots 2026-06-23), reste des blocages fiscaux/produit. Marc formule
des choix de design, approuve des proxies/limites, et reçoit **2 jeux de données fiscales 2026** (taxe de
bienvenue Québec + grille TP-1.G personne vivant seule).

### Décisions fondées (avec sources documentées)
1. **Taxe de bienvenue Québec 2026** (`FISC-WELCOME-2026`, barème reste_qc) :
   - **Seuils** : 62 900 / 315 000 (vs 2025 : 58 900 / 290 000)
   - **Source** : *Loi concernant les droits sur les mutations immobilières* (RLRQ c. D-15.1), indexation
     2026 (*Gazette officielle du Québec, Partie 1, 2025-06-07*), **+2,3438 %**.
   - **Implication** : update `FISCAL_REFERENCE.md` §8 + code `realEstate.ts:101-105` (même PR).

2. **Crédit d'âge 65+ / Personne vivant seule (TP-1.G, QC ligne 361)** (`TP1G-VIVANT-SEUL`) :
   - **Montant base** : 2 172 $ ; **supplément monoparental** : 2 681 $ ; **seuil revenu net** : 42 955 $
   - **Taux réduction** : 18,75 % au-delà du seuil ; **taux crédit** : 14 %
   - **Source** : MFQ *Dépenses fiscales 2025*, fiche 110606, **Tableau C.31** + Loi sur les impôts art. 752.0.7.4 a)/b).
   - **Implication** : update `FISCAL_REFERENCE.md` §4 + intégrer au moteur line361 QC (plan-first, discriminant git-stash).

### Décisions de design (proxies et limites acceptées)
3. **W5-TAX-PROXY** (revenus locatif 0,45 / dividende CCPC 0,36) :
   - **Choix (a)** : garder les proxies documentés = estimation de taux marginal QC (rapide, honnête).
   - **Alternative rejetée (b)** : modéliser l'impôt incrémental réel (exact mais lourd, plan-first, impact moteur).
   - **Implication** : ajouter mention UI + source taux marginal QC dans `FISCAL_REFERENCE` ; code inchangé.

4. **HIST-NW-DEBT-DISCLAIMER** (patrimoine net passé sans dettes) :
   - **Choix (b)** : disclaimer visuel sur la zone passée du graphe (honnête vs gonflé pour endettés).
   - **Alternative (a)** : laisser tel quel documenté (moins honnête).
   - **Alternative (c)** : soustraire dette courante (imprécis, suppose dette stable).
   - **Implication** : UI disclaimer sur `FutureProjection` + doc existante (HIST-NW-NO-DEBT).

5. **D6-PRIV-MONTANTS** (montants sliders REER/CELIAPP/REEE/paiements masqués en mode privé) :
   - **Choix** : OUI masquer au repose, révéler au focus (par symétrie `<PrivateNumberInput>`).
   - **Implication** : wrapper sliders 3 fichiers (TaxCenter, ChildPlanning, DebtManager), effort S.

### Décisions de fermeture (périmées ou en limite assumée)
6. **FA-11** (discontinuité SRG au seuil) : **maintenir en limite assumée** (doc `FISCAL_REFERENCE §6` suffisante).
   - Reste optionnel = transcrire tables Service Canada (formule non officielle) — clos, ouvert seulement si voulu.

7. **ITEM-2C** (gates timing per-conjoint, reset REER 71 + PSV/RRQ au décès) :
   - **Phases 1+2 livrées** : FERR per-conjoint ✅ + PSV/RRQ per-conjoint ✅ (2026-06-25).
   - **Restes** : reset REER 71 + per-conjoint PSV/RRQ au décès = **laisser en limite assumée** (impact $ minimal).
   - **Implication** : clos, doc §9 survivorMode ; relancer seulement si impact $ détecté.

### À clarifier (en attente de confirmation)
8. **FISC-TAXDEC-INCR** (impôt décembre : 3 sous-claims bornés mais risqué à fixer) :
   - Marc répond « ok » 2026-07-06 → **interprétation ambigüe** : (a) COD ER le fix (re-baser golden, tests,
     risque moteur élevé) ou (b) statu quo / différé (passer) ?
   - **Blocage** : avant tout code, clarifier l'intention → « go fix » ou « wait ».

---

## ADR-002 — App PERSONNELLE (solo) et relais BYOK pour Claude (2026-07-06)
**Statut** : accepté (Marc, 2026-07-06).

**Contexte** : FinanceAI vise la qualité AAA d'un outil perso de retraite QC. Multi-utilisateurs / bêta
publique était un cap (VISION.md §2). Stockage privé (Google Drive) + auth Google in-app (2026-06-16)
débloquent le multi-appareil. Reste la **clé Anthropic** : exposée au navigateur (modèle solo) vs
proxy backend (multi-user, anti-abus). Une évaluation 2026-07-06 remet en question le multi-user.

**Décision** : **FinanceAI = app SOLO** (Marc remise le volet multi-utilisateurs public). Raison : une
app QC de retraite est un outil existentiel pour Marc ; faire de lui un produit grand public (+ bêta
de tests) retire du focus/risque sur la qualité AAA. Solution : **relais BYOK (Bring Your Own Key)
pour Claude** = proxy **Edge Vercel** (gratuit tier) qui relaie les appels Anthropic en **chiffrant le
token marcand à la clé de Marc (transitement sûr, pas d'exposition cloud)**. Token = secret Vercel
unique, antiabus par construction (l'appelant fournit sa clé). En solo, l'objection vie-privée du relais
tombe (serveur=Marc, données=Marc).

**Trade-offs** :
- ✅ **Gain** : zero clé client-side (inaccessible au navigateur), anti-abus, route unique pour l'IA.
- ⚠️ **Vision en direct** : Vision API ~13 Mo/requête > limites Edge (~10 Mo) → reste en direct pour l'instant (spike post-lancement).
- ⚠️ **Maintenance relais** : petit proxy à maintenir, mais code livré (Edge + middleware Vite).

**Alternatives rejetées** :
- (a) Multi-user public sans relais → risque clé client-side (phishing/malware cible clair).
- (b) Relais commercial (tierces clés) → hors-sujet pour un outil perso Marc.
- (c) Pas de relais (garder clé client) → acceptable seul, mais anti-pattern pour produit.

**Corollaire** : multi-appareil Marc + sync Drive MAINTENUS (`docs/VISION.md` principes #1+2) ;
gate Google in-app pour preuve de sync Drive (O3 Marc) ; multi-user grand public REMISÉ indefinitely.

---

## ADR-001 — Environnement d'agents de revue (2026-06-17)
**Statut** : accepté (Marc, 2026-06-17).

**Contexte** : dépôt solo React / Vite / TS, moteur fiscal money-critical, SDK Anthropic intégré. 9 agents
projet existants + ~184 globaux. Besoin d'un ensemble d'agents sans chevauchement, à **décision unique**
chacun, aligné sur le workflow plan-first.

**Décision** : flotte de **13 agents projet** (voir `docs/agents.md`) = 7 cœur (`architect`, `product-manager`,
`financial-integrity`, `security-privacy`, `code-reviewer`, `ai-reviewer`, `documentation-manager`) + 2
spécialistes money-critical gardés distincts (`projection-validator`, `silent-failure-hunter`) + 4 utilitaires
(`test-writer`, `performance-optimizer`, `a11y-auditor`, `code-analyzer`). Renommages :
`fiscal-accuracy` → `financial-integrity`, `security-reviewer` → `security-privacy`. Nouveaux : `ai-reviewer`,
`documentation-manager`, `architect`, `product-manager`. Modèles : **opus** (`financial-integrity`,
`projection-validator`), **haiku** (`documentation-manager`), **sonnet** (le reste). Commandes : `/new-feature`,
`/review-all` (enrichie : parallèle → trust-but-verify → GO/NO-GO), `/release-review`.

**Pourquoi** : la cible de 7 agents du cadrage initial n'était PAS un sur-ensemble des 9 agents existants ;
l'adopter telle quelle aurait supprimé des agents money-critical (`projection-validator`,
`silent-failure-hunter`, `test-writer`) sur lesquels repose la preuve AAA de l'audit du 2026-06-17. La
réconciliation garde la couverture money-critical tout en ajoutant le seul vrai manque (`ai-reviewer`, pour
les ~12 surfaces consommatrices du SDK).

**Trade-offs** : 13 agents > 7 (plus à entretenir), mitigé par la règle « les agents s'améliorent à chaque
push » et le routage par pertinence (on ne les lance jamais tous). `performance-optimizer` passé en on-demand
(la perf générale est absorbée par `code-reviewer`) pour réduire le chevauchement.

**Alternatives rejetées** :
- (a) remplacement strict par 7 → perte de couverture money-critical.
- (b) fusion de `projection-validator` dans `financial-integrity` → perte de la validation **systémique** des 12 invariants (la conservation de l'argent ≠ la justesse d'un calcul ponctuel).
- (c) injection de `FISCAL_REFERENCE.md` via un champ `skills` → **non supporté** par Claude Code (aucun agent, projet ou global, n'utilise un tel champ) ; l'agent `financial-integrity` LIT le doc au runtime, ce qui évite un snapshot périmé.

## ADR — Rafraîchissement serveur autonome des prix (`HUB-REFRESH-CRON`, 2026-07-22)
**Statut** : accepté (Marc, 2026-07-22).

**Contexte** : l'app est 100 % navigateur ; elle SEULE poussait l'état (dont les cours de marché)
dans Drive. Onglet fermé = état figé partout, y compris le widget hub (« pas à jour sans ouvrir
l'app »). Le serveur MCP (Cloud Run) lit déjà Drive et a le refresh-token (Secret Manager), et le
moteur de prix `refreshAssetPrices`/`applyPricePatches` (services/priceRefresh) est partagé/pur.

**Décision** : exposer `POST /refresh` sur le serveur MCP (secret dédié `FINANCEAI_REFRESH_SECRET`,
Bearer, temps constant), déclenché par un **GitHub Actions planifié** (toutes les 6 h). Il lit
l'état (`getWithVersion`), rafraîchit les cours, `applyPricePatches`, et `save(next, version)` —
**écriture Drive avec garde OCC**. Ne touche QUE `currentPrice`/`priceUpdatedAt` ; les données
saisies sont intactes. Aucun changement de cours → aucune écriture. Clé Finnhub via env
(`FINANCEAI_FINNHUB_KEY`) pour rafraîchir aussi les actions (crypto CoinGecko marche sans clé).

**Pourquoi** : réutilise l'infra existante (Drive OAuth serveur + moteur de prix partagé) ; le
déclencheur externe contourne le scale-to-zero de Cloud Run ; GitHub Actions est gratuit et sans
la limite « 1×/jour » de Vercel Hobby (Marc : tout gratuit).

**Trade-offs** : introduit un ÉCRIVAIN serveur autonome (nuance le « 100 % navigateur, pas de
backend » — la source de vérité reste le blob Drive, le serveur n'en devient qu'un 2ᵉ écrivain,
borné aux cours). Risque d'écrasement écarté par l'OCC (un push app concurrent → conflit TYPÉ
`StateConflictError` → `200 { ok:false, conflict:true }` transitoire, réessai au tick). Erreurs
honnêtes : une panne RÉELLE (jeton révoqué, Drive KO, coffre chiffré) → `5xx`, le cron rougit et
alerte au lieu de rester vert sur des prix figés. Rafraîchit les PRIX, pas des saisies hors ligne.

**Alternatives rejetées** :
- (a) Vercel Cron → le front Vercel n'a PAS le token Drive (il vit sur Cloud Run) ; et Hobby = 1×/jour.
- (b) `setInterval` interne au serveur → Cloud Run dort sans trafic (scale-to-zero) → non fiable.
- (c) Rafraîchissement lecture-seule pour le seul widget hub → l'APP resterait figée (Marc veut tout, partout).

## ADR — Contexte d'écran du chat : injection `system` figée par envoi, PAS un tool (`CHAT-PAGE-CONTEXT`, 2026-07-22)
**Statut** : accepté (OK Marc donné d'avance, plan architect 2026-07-22).

**Contexte** : le chat in-app doit savoir ce que l'utilisateur regarde (onglet, période, chiffres
affichés) pour répondre à « explique-moi ce chiffre » — sans jamais recalculer un montant déjà
affiché (« jamais un 3e chiffre »), sans fuiter en mode discret, et avec un contexte FIGÉ au moment
de l'envoi (naviguer pendant la réponse ne doit pas la faire dériver).

**Décision** : registre pur `services/aiChat/viewContext.ts` (Tier 1 = onglet actif, gratuit,
partout ; Tier 2 = détail publié par les pages instrumentées via `useViewContextPublisher`, gate
mode discret À LA SOURCE). La ligne « CONTEXTE ÉCRAN » est construite en SYNCHRONE au démarrage de
`sendMessage` (avant tout await) et injectée en FIN de `system` prompt (`buildAgentSystemPrompt`,
param additif). Aucun nouveau tool.

**Pourquoi** : `system` est structurellement figé pour toute la boucle agentique (calculé une fois
par envoi, jamais relu) = exactement le contrat de fraîcheur voulu, zéro code de fraîcheur neuf.
Un tool serait relu à CHAQUE tour (jusqu'à 6) → une navigation mi-envoi ferait dériver le contexte.
Et le registre de tools (`READ_SPECS`) est partagé app↔MCP par construction (AITOOLS-A, verrouillé
par `registryParity`) — un tool app-only casserait cette frontière pour un contenu qui tient en une
ligne compacte (moins cher en tokens qu'un aller-retour tool_use/tool_result).

**Trade-offs** : la ligne est renvoyée sur chaque tour de la boucle (bornée : top 3 catégories,
montants arrondis). ⚠️ MAJ commit de suivi (finding ai-reviewer) : le split en blocs est FAIT —
`buildAgentSystemBlocks` = préfixe statique AVEC `cache_control` ephemeral + ligne dynamique
séparée (un `system` string variable invalidait le préfixe de cache entier, pièces jointes
incluses) ; livre l'essentiel d'`[AITOOLS-PROMPT-CACHE]`. Résiduel assumé : l'entrée de cache des
MESSAGES est ré-écrite quand la ligne de contexte change entre deux envois.

**Alternatives rejetées** : (a) tool `get_current_view` app-only (fraîcheur incompatible multi-tours,
frontière app↔MCP cassée) ; (b) contexte dans le message user (entrerait dans le transcript persisté,
contraire à ADR-4) ; (c) store Zustand pour le registre (rien à persister/synchroniser — module pur
+ useSyncExternalStore, patron ARCH-SYNC-SPLIT).


## ADR — Assistant fusionné : un seul moteur de « prochaines actions » (`ASSISTANT-HUB`, 2026-07-23)
**Statut** : accepté (scope validé Marc par AskUserQuestion, 2026-07-23).

**Contexte** : deux surfaces concurrentes de recommandations — l'onglet ACTIONS (widget Haiku dédié,
cache localStorage 1h, prompt « EXACTEMENT 3 actions » → remplissage fabriqué sur profil sain, source
du retour Marc « signaux peu pertinents/périmés/pas actionnables ») et le chat (tool
`get_next_best_actions` → `computeFinancialSignals`, pur, toujours frais). Risque n°1 : deux avis
contradictoires sur la même page. Et l'onglet ASSISTANT n'était pas dans la nav (introuvable).

**Décision** : fusion dans `Tab.ASSISTANT` (visible dans la nav, position de l'ancien ACTIONS) :
cartes = `computeFinancialSignals` (0-5 signaux à seuils, zéro LLM, zéro cache) via
`hooks/useFinancialSignals` + `AiChatSignalCards`, clic → message contextualisé au chat partagé.
Retrait complet du widget Haiku + `getNextBestActions`/schémas de services/claude.ts + enum
`Tab.ACTIONS` (redirect deep-link `#ACTIONS`). Gate = `anthropicKey` seul (le chat peut servir à se
faire guider dans la configuration — pas de mur salaire).

**Pourquoi** : une seule source de vérité « quoi faire ensuite » (déjà partagée avec claude.ai via le
MCP) ; suppression d'un appel Haiku récurrent (coût, latence, staleness 1h) sans perte — la prose IA
s'obtient au clic, toujours cohérente avec ce que le modèle voit.

**Trade-offs** : plus de prose pré-générée sur les cartes (observation factuelle brute) ; nombre de
cartes variable 0-5 (honnête) au lieu de « toujours 3 » (fabriqué) — choix délibéré, pas un manque.
Mode discret : clic DÉSACTIVÉ (le montant est cuit dans l'observation — une redaction regex serait
fragile, même classe de risque que le blur CSS interdit).

**Alternatives rejetées** : garder le widget Haiku déplacé (2 moteurs, risque n°1 non résolu) ;
reformulation privacy-safe par signal (désynchronisation silencieuse à chaque évolution) ; publier
les signaux en contexte d'écran Tier 2 (circulaire — le tool le fait à la demande — et casserait le
prefix-cache sur l'onglet le plus utilisé du chat).


## ADR — Couverture du TOTAL de la courbe de portefeuille (`HIST-COVERAGE-TOTAL`, 2026-07-23)
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


## ADR — Quotes multi-providers : Yahoo en repli + diagnostic actionnable (`HIST-MULTI-PROVIDER`, 2026-07-23)
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
