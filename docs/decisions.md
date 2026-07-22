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
montants arrondis) ; le jour où `[AITOOLS-PROMPT-CACHE]` pose un cache sur le préfixe system, il
faudra scinder system en blocs (statique caché / ligne dynamique) — noté dans systemPrompt.ts.

**Alternatives rejetées** : (a) tool `get_current_view` app-only (fraîcheur incompatible multi-tours,
frontière app↔MCP cassée) ; (b) contexte dans le message user (entrerait dans le transcript persisté,
contraire à ADR-4) ; (c) store Zustand pour le registre (rien à persister/synchroniser — module pur
+ useSyncExternalStore, patron ARCH-SYNC-SPLIT).
