# SESSION HANDOVER — pour le prochain Claude

> **À lire EN PREMIER si tu reprends FinanceAI.** Ce document remplace
> la lecture séquentielle de tous les autres. Pointeurs vers les détails
> à la fin.
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
| **Dernière PR mergée** | **#430** [DETTE-RE-SALE] (vente immo ciblée par `propertyId`, 2026-07-07) |
| **App déployée** | https://www.hubperso.com (Vercel auto-deploy sur push `main`) |
| **Tests** | **2352/2352 verts** (Vitest 4 ; `fileParallelism: false` ; 12 invariants money-conservation) |
| **Typecheck** | Clean en mode strict |
| **Build** | OK — **Vite 8 (Rolldown)** ; lazy-loading préservé (vendor react/recharts/ai/pdf) |
| **Schema store** | **v7** (Zustand persist, migrations v1→v7) |
| **Stack IA** | `@anthropic-ai/sdk` (Sonnet 4.6 + Haiku 4.5) — Gemini retiré |
| **Banque** | CSV **+ import relevé PDF** (Claude Vision, #285) → pipeline `parseBankCsv` ; CSV 100 % local |
| **Crypto** | CoinGecko (gratuit, sans clé) |
| **Stock/ETF** | Finnhub REST (gratuit) |
| **Sécurité storage** | AES-256-GCM + IndexedDB non-extractible (`services/secureKeyStore.ts`) ; `npm audit` = **0** |
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
