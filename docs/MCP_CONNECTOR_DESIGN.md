# FinanceAI comme connecteur MCP pour Claude — design

> **Statut** : conçu 2026-06-03. **Document de design — À VALIDER PAR MARC AVANT TOUT CODE.**
> Aucune feature n'est construite ici : ce doc cadre le chantier et liste les décisions ouvertes.
> Réutilise le scaffold MCP (`mcp/*`), le moteur pur (`services/projection*`, `utils/tax.ts`),
> la sync Drive (`services/sync/*`, `services/googleDrive/*`) et les parsers (`services/import/*`,
> `services/claude.ts`). Croise [SYNC_V2_DESIGN](SYNC_V2_DESIGN.md),
> [GOOGLE_DRIVE_SYNC_DESIGN](GOOGLE_DRIVE_SYNC_DESIGN.md), [ADR-010](adr/010-auth-google-in-app-gate.md),
> [ADR-001](adr/001-migration-gemini-claude.md), [ADR-009](adr/009-fiscalite-quebec-centralisee.md).

---

## 1. Vision + écart

**Ce que veut Marc** (ses mots) : que FinanceAI devienne un connecteur Claude, pour pouvoir poser à
Claude « plein de questions sur mes sous dans le futur, sur mes prochaines étapes, sur mes impôts… sur
tout ce que l'app propose », et **uploader des docs à Claude pour qu'il les range au bon endroit**.

**Ce qui existe** (`mcp/`) : un serveur MCP stdio avec 4 tools **SANS ÉTAT** —
`ping`, `get_tax_room`, `calculate_real_estate`, `run_projection`. Chacun prend **tous ses paramètres
en entrée** et calcule. Exemple concret : `get_tax_room` exige `birthYear`, `arrivalYear`,
`currentYear`, `currentCeliBalance` — Claude doit déjà connaître ces valeurs. C'est une **calculatrice
conversationnelle**, pas une fenêtre sur les données de Marc.

**L'écart** :

| Aujourd'hui (calculatrice) | Ce que veut Marc (Q&A sur SES données) |
|---|---|
| « Combien d'espace CELI si né en 1992, arrivé en 2010, 25k$ dedans ? » (Marc fournit tout) | « **Combien d'espace CELI il ME reste ?** » (le connecteur lit le solde réel) |
| `run_projection(80000, 2000, 20, 7)` — Marc donne patrimoine, épargne, horizon | « **Mon patrimoine dans 20 ans ?** » (lit comptes, salaires, objectifs, immo, enfants…) |
| Aucune écriture | « **Range cette fiche de paie au bon endroit** » (ingestion → revenus) |

Combler l'écart = donner au serveur MCP un **accès en lecture (puis écriture) à l'état réel de
l'utilisateur**, qui aujourd'hui vit **uniquement dans son navigateur + son Google Drive**.

---

## 2. Le défi central — où sont les données, et comment le MCP les atteint

FinanceAI est **local-first, sans backend** :

- L'état (`AppState` — comptes, transactions, budget, objectifs, dettes, `retirementGoal`, profils…)
  vit dans `localStorage` (clé `financeai-storage`) et dans le **Google Drive de l'utilisateur**
  (`appDataFolder`, fichier `financeai-sync.json`), via `services/sync/*`.
- **Aucun serveur ne détient les données.** Il n'y a pas de base centrale à interroger.

Un serveur MCP est un **process séparé** de l'onglet du navigateur. Il n'a accès ni au `localStorage`
de Marc ni à son store Zustand vivant. **La seule surface partagée et déjà existante entre l'app et un
process externe, c'est le blob Drive `financeai-sync.json`.** C'est le pivot de tout ce design.

> **Contrainte d'auth dure** (vérifiée dans `services/googleDrive/gisAuth.ts`) : l'app utilise
> **Google Identity Services en flux *token* navigateur** — client ID **public**, **aucun secret
> client**, et surtout **AUCUN refresh token**. Le jeton d'accès (`drive.appdata` + `userinfo.email`)
> vit en mémoire + `sessionStorage`, expire en ~1 h, et son renouvellement silencieux exige une
> **session Google active dans un navigateur**. Ceci détermine la faisabilité des options ci-dessous :
> un MCP *headless* (sans navigateur) ne peut pas, tel quel, obtenir un jeton Drive long terme.

---

## 3. Architecture d'accès aux données — 3 options + tradeoffs

### Option A — MCP adossé au Drive de l'utilisateur (lit/écrit `financeai-sync.json`)

Le connecteur s'authentifie au Drive de l'utilisateur (OAuth `drive.appdata`), lit l'enveloppe
`financeai-sync.json`, **fait tourner le moteur PUR dessus**, et répond. Pour l'ingestion : il parse le
doc, **fusionne** dans le payload, ré-écrit l'enveloppe au Drive ; l'app récupère au prochain `pull`.

```
Claude  ──MCP──▶  Serveur FinanceAI-MCP
                      │  OAuth drive.appdata (token de l'utilisateur)
                      ▼
        Google Drive appDataFolder / financeai-sync.json   ◀── même fichier que l'app web
                      │ (lit l'enveloppe → payload AppState)
                      ▼
        Moteur PUR (calculateFutureProjection, calculateFiscalReport, calculateCeliRoom…)
                      │
                      ▼  réponse JSON ; (ingestion : ré-écrit l'enveloppe, garde anti-perte)
```

**Pourquoi c'est naturel** : on réutilise **la sync + le moteur pur + les parsers**, on reste
cohérent local-first, et **on ne stocke RIEN de nouveau** côté serveur (le Drive de l'utilisateur
reste l'unique dépôt). Le blob est déjà le contrat d'échange entre appareils ; le MCP devient « un
appareil de plus » qui lit/écrit le même fichier.

**Points durs à concevoir (le cœur du chantier) :**

1. **Où vit le refresh token OAuth du process MCP.** C'est LE problème. Le flux GIS actuel ne donne
   pas de refresh token. Deux sous-variantes :
   - **A1 — connecteur distant (claude.ai), OAuth serveur** : on crée un **2ᵉ client OAuth Google de
     type "Web", AVEC client secret**, hébergé (Vercel). Claude redirige l'utilisateur vers le
     consentement Google `drive.appdata`, le serveur échange le code contre un **refresh token** (en
     demandant `access_type=offline`) et le **chiffre au repos** (clé serveur, jamais exposée à Claude).
     Isolation : un refresh token **par utilisateur**, indexé par son `sub` Google. C'est faisable
     techniquement, mais **introduit un état serveur** (les refresh tokens) — entorse au « sans backend »
     qu'il faut assumer explicitement (voir §5).
   - **A2 — connecteur local (Claude Desktop, stdio)** : le MCP tourne sur la machine de Marc. On peut
     y faire un **OAuth "installed app" (loopback `localhost`)** qui rend un refresh token stocké **en
     local** (fichier de creds dans le profil utilisateur, chiffré). Pas de serveur, mais ne marche que
     sur la machine où tourne le MCP (mono-poste).
2. **Isolation par utilisateur** : chaque utilisateur = son compte Google = son `appDataFolder` = son
   blob. Le `sub` Google sert déjà de clé d'identité stable dans `keyCipher.ts`. En A1, la table
   `sub → refreshToken (chiffré)` est l'unique état multi-utilisateur ; aucune donnée financière n'y est.
3. **Gestion de la passphrase (`enc:true`)** : si l'utilisateur a activé la passphrase zéro-knowledge
   (D-3), le blob est `enc:true` → `encPayload` chiffré (PBKDF2 600k + AES-GCM), **et la passphrase ne
   va JAMAIS dans Drive**. Le MCP **ne peut donc PAS déchiffrer** sans elle. Options : (a) le MCP
   détecte `enc:true` et **répond honnêtement « coffre chiffré, fournis ta passphrase »** (Claude la
   demande dans la conversation, le serveur la garde **en mémoire de session uniquement**, jamais
   persistée) ; (b) Marc accepte que le connecteur ne marche **qu'en mode `enc:false`** (clair + clés
   chiffrées par `sub`) — c'est le mode par défaut aujourd'hui. **Décision pour Marc** (§8). On réutilise
   tel quel `cloudBackup.decryptBackup` / `passphraseStore` (sémantique « secret de session »).

**Limite honnête A** : latence (lecture Drive à chaque requête, ~100-300 ms ; mitigeable par un cache
mémoire court par session). Et surtout, **l'écriture concurrente** : si l'app web et le MCP écrivent
le blob « en même temps », il faut passer par la **garde anti-perte** existante (`decideOnLoad`,
`updatedAt`/hash) — jamais d'écrasement aveugle (voir §4).

### Option B — MCP local stdio (Claude Desktop) sur un export local

Le scaffold **actuel**. Claude Desktop lance `mcp/stdio.ts` en local. Pour lui donner les données, on
ne touche pas au Drive : l'app web propose un bouton **« Exporter pour Claude »** qui écrit un snapshot
(le payload AppState, éventuellement déchiffré côté app) dans un fichier local convenu ; le MCP le lit.

- ✅ Zéro auth réseau, zéro serveur, zéro refresh token, **données ne quittent pas la machine**.
- ✅ Réutilise immédiatement le moteur pur sur un fichier local.
- ❌ **Manuel et vite périmé** : il faut ré-exporter à chaque changement (Claude voit un instantané figé).
- ❌ Mono-poste (la machine où tourne Desktop), pas de Q&A « de n'importe où ».
- ❌ L'ingestion (write-back) devrait ré-importer dans l'app à la main → casse la promesse « range-le tout seul ».

### Option C — MCP distant hébergé (Vercel + OAuth), source de données propre

MCP HTTP distant (Streamable HTTP) ajouté comme connecteur custom sur claude.ai, **mais** au lieu de
lire le Drive de l'utilisateur, on se brancherait sur une **source serveur** (base hébergée).

- ✅ Toujours à jour, multi-appareils, pas de souci de jeton navigateur.
- ❌ **Contredit frontalement le local-first / sans backend** : il faudrait répliquer l'état dans une
  base centrale → exactement ce que l'archi refuse (cf. [SECURITY_STRATEGY](SECURITY_STRATEGY.md),
  Loi 25). Gros chantier (sync bidirectionnelle, conflits, sécurité d'une base PII centrale).
- ❌ Redondant avec le Drive : on aurait **deux** dépôts de vérité.

> Note : **C (l'hébergement HTTP+OAuth) et A1 partagent la même plomberie de transport** (MCP distant
> sur Vercel, OAuth). La différence n'est PAS le transport mais **la source** : A1 lit le **Drive de
> l'utilisateur** (rien stocké), C lit une **base serveur** (tout répliqué). On peut donc avoir le
> « distant » sans la « base centrale » → c'est précisément **A1**.

### Recommandation — **A (variante A2 d'abord, A1 ensuite)**, lecture seule au départ

**A est le bon cadre** : le blob Drive est déjà l'unique surface partagée entre l'app et le monde
extérieur ; le moteur et les parsers sont déjà purs ; on ne crée aucun nouveau dépôt de données. B est
un fallback de prototypage (utile pour itérer sur les tools sans résoudre l'auth), C trahit l'archi.

**Mais je challenge mon intuition sur le « par où commencer »** : le point bloquant d'A1 (connecteur
claude.ai, le plus pratique pour Marc « de partout ») est **le refresh token Drive headless**, qui exige
un **2ᵉ client OAuth avec secret + un serveur qui stocke des refresh tokens chiffrés** — donc un
**petit backend**, ce que l'app a toujours évité. C'est faisable et standard (c'est ce que fait tout
connecteur OAuth), mais **ce n'est plus « sans backend »**, et ça engage Loi 25 sur ce service.

Donc, recommandation pragmatique :
- **Valider d'abord la valeur** avec **A2 (Claude Desktop / stdio + OAuth installed-app local)** ou même
  **B (export local)** : zéro serveur, on prouve que les tools « sur les vraies données » sont utiles.
- **Puis** investir dans **A1 (connecteur distant claude.ai)** une fois la valeur prouvée et la
  décision « petit backend de tokens » assumée par Marc.

Faisabilité à signaler honnêtement : **l'auth Drive headless pour un MCP distant n'est pas un acquis** ;
elle repose sur un flux OAuth offline classique qu'on n'a jamais mis en place ici (l'app n'utilise que
le flux *token* navigateur sans secret). À prototyper tôt — c'est le plus gros risque technique.

---

## 4. Tools / resources à exposer (Q&A sur LES données réelles)

Tous lisent le **payload AppState** issu du blob Drive (Option A) puis appellent du **code pur
existant**. Renvoient du JSON structuré + un court résumé en français.

> Pré-requis transverse à construire : un **adaptateur pur `AppState → SimulationParams`**. Aujourd'hui
> cette transformation (calcul de `calculatedStartingCash`, `liveCSVBalances`, `baseGrossAnnual/Net`,
> `baseMonthlyExpenses`, `currentRentExpense`, `startYear/Month`) vit **dans React**
> (`components/FutureProjection.tsx` ~L123-240). Le moteur `calculateFutureProjection` est pur, mais
> son **assemblage d'entrée ne l'est pas**. Extraire un `buildSimulationParams(state): SimulationParams`
> pur et testable est **la brique fondatrice** des tools de projection/retraite.

| Tool | Lit dans l'état | Renvoie | Code pur réutilisé |
|---|---|---|---|
| `get_financial_overview` | `transactions`, `assets`, `initialBalances`, `config.users`, `budgetItems`, `debts`, `retirementGoal` | Valeur nette, revenu/dépenses mensuels, soldes CELI/REER/non-enr., âge, dettes principales, objectifs actifs | reprend la construction de `FinancialSnapshot` (`services/claude.ts`), à extraire en helper pur |
| `get_projection` | tout l'état projeté | Patrimoine nominal **et réel** à horizon N ans, FIRE, succession ; param. scénario (`BASE`, `LIBERTE_55`, stress…) | `buildSimulationParams` + `calculateFutureProjection` |
| `get_tax_situation` | `config.users`, soldes, revenus | Impôt fédéral+QC, taux marginal, **espace REER/CELI restant**, retenues, RAMQ/PSV | `calculateFiscalReport`, `calculateCeliRoom`/`…AvailableRoom`, room REER (`utils/tax.ts`) |
| `get_retirement_outlook` | `retirementGoal`, état projeté | Suffisance à la retraite, âge faisable, revenu de retraite (RRQ/PSV/privé), probabilité de réussite (Monte Carlo) | `calculateFutureProjection` (MC) + sous-modules `retirementIncome`, `drawdownOptimizer` |
| `get_next_best_actions` | `FinancialSnapshot` dérivé | 3-5 prochaines actions priorisées (urgence, impact) | `getNextBestActions` (`services/claude.ts`) — **utilise la clé Anthropic** (voir §5) |
| `search_transactions` | `transactions` | Transactions filtrées (texte/catégorie/montant/dates), agrégats | filtre pur sur `Transaction[]` (à écrire ; logique simple) |

**Resources** (lecture seule, idéales pour donner du contexte sans « appeler » un calcul) :
- `financeai://overview` — snapshot read-only (mêmes données que `get_financial_overview`).
- `financeai://state-summary` — résumé structuré de l'état (profils, comptes, objectifs) **sans** PII
  superflue, pour que Claude « comprenne » la situation avant de répondre.

**Prompts** (optionnels, pré-cadrés QC) : `revue-financiere` (« fais le point sur ma situation »),
`optimisation-impot` (« comment réduire mon impôt cette année »), `puis-je-prendre-ma-retraite-a`.

### Croquis de signature (illustration — PAS d'implémentation)

```ts
// get_projection — « mon patrimoine dans X ans », scénarios
const inputSchema = {
  years: z.number().int().min(1).max(50)
    .describe("Horizon en années (ex: 20 pour « dans 20 ans »)"),
  scenario: z.enum(['BASE', 'LIBERTE_55', 'STRESS', 'COMPOUND_STRESS'])
    .default('BASE').describe('Scénario de projection à simuler'),
  monteCarlo: z.boolean().default(false)
    .describe('Active la simulation Monte Carlo (probabilité de réussite)'),
};
// Handler (esquisse) : state = await loadStateFromDrive(session)
//                      params = buildSimulationParams(state)        // ADAPTATEUR PUR À CONSTRUIRE
//                      result = calculateFutureProjection(params, monteCarlo, scenarioIdx)
// Renvoie : { currency:'CAD', horizon, finalNetWorthNominal, finalNetWorthReal,
//             fireReached, fireAge, successProbability?, byScenario? }

// get_tax_situation — impôt, room REER/CELI, retenues
const inputSchema2 = {
  year: z.number().int().min(2024).max(2050).default(2026)
    .describe("Année d'imposition"),
};
// Handler : appelle calculateFiscalReport(...) + room CELI/REER depuis utils/tax.ts
// Renvoie : { taxFederal, taxQuebec, marginalRate, celiRoomRemaining,
//             reerRoomRemaining, withholdings, ramq, oasClawback? }
```

---

## 5. Ingestion de docs — « upload → rangé au bon endroit »

**Flux cible (Option A, write-back vers le blob)** :

```
Claude (Marc upload un doc)
   └─▶ tool  ingest_document(file, hint?)
         1. DÉTECTION du type
              • fiche de paie / talon      → revenus        (Vision: analyzePayslip)
              • relevé bancaire (CSV)      → transactions   (parseBankCsv)
              • relevé de courtage (CSV)   → placements     (parseBrokerCsv)
              • doc fiscal (T4/Relevé 1…)  → TaxCenter / config.users
         2. PARSING (réutilise les parsers + Vision IA existants)
         3. VALIDATION du résultat (schémas zod : PayslipSchema, Transaction…)
         4. CHARGE l'enveloppe Drive courante  (lecture, comme §3/§4)
         5. FUSION NON DESTRUCTIVE dans le payload
              • transactions : append + dédup (markDuplicates) — jamais d'écrasement
              • revenus paie : met à jour config.users (gross/net annualisés)
              • documents : ajoute un DocumentMeta (la métadonnée existe déjà)
         6. GARDE ANTI-PERTE : buildEnvelope avec updatedAt frais ; si Drive a avancé
            entre la lecture et l'écriture → conflit (decideOnLoad), pas d'écrasement
         7. RÉ-ÉCRIT l'enveloppe au Drive  → l'app récupère au prochain pull
         8. CONFIRMATION : renvoie un résumé de ce qui a été classé + où
```

**Tout est déjà là côté parsing/rangement** :
- `parseBankCsv` (pur, universel : virgule/`;`/TAB, dates ISO/JJ-MM, débit/crédit séparés, dédup) et
  `parseBrokerCsv` ;
- `analyzePayslip` (Claude **Vision**, `PayslipSchema` → `grossPeriod/netPeriod/taxPeriod/rrspPeriod/frequency`),
  et **le routage existe déjà** : `PayslipUploadCard` annualise et écrit dans `config.users` via
  `setAppState` — c'est exactement la logique « range au bon endroit » à transposer côté MCP ;
- **`DocumentMeta[]` existe déjà dans `AppState`** (Phase G.1 : « blobs stockés séparément, métadonnées
  dans le state ») → le slot d'archivage des docs est déjà modélisé.

**Sécurité / non-régression de l'ingestion** :
- **Validation systématique** (zod) avant fusion ; un parse douteux → on **propose** sans écrire.
- **Jamais d'écrasement silencieux** : transactions en append+dédup ; mises à jour de profil/revenus
  **confirmées** (Claude annonce « je vais passer ton salaire brut de X à Y, OK ? »).
- **Réutilise la garde anti-perte de la sync** (`decideOnLoad` / `updatedAt` / hash) : si le blob a
  bougé entre lecture et écriture, on ne pousse pas par-dessus → conflit explicite.
- **Filet** : le mécanisme de backup avant écrasement (`backupAuto.createBackupNow`) est côté app ; en
  Option A il faudra un équivalent côté MCP (écrire l'ancienne enveloppe en copie avant `update`).

**Inconnue honnête** : `analyzePayslip` prend un `File` (API navigateur) et **une clé Anthropic**. Côté
MCP (Node, sans DOM), il faut (a) adapter l'entrée fichier (base64/Buffer), et (b) **fournir une clé**
(voir §6 « clé IA »). En **A1 distant**, faire tourner la Vision côté serveur signifie que **le doc + la
clé transitent par le serveur** → à arbitrer (Loi 25). En **A2 local**, tout reste sur la machine.

---

## 6. Auth / sécurité / isolation / conformité (Loi 25)

- **Isolation par utilisateur = native** : chaque utilisateur s'authentifie à **son** Google Drive ;
  son `appDataFolder` est **inaccessible aux autres apps et aux autres utilisateurs**. Un connecteur
  branché sur le compte de Marc ne voit que les données de Marc. Le `sub` Google (id stable) est la clé
  d'identité, déjà utilisée par `keyCipher.ts`.
- **Scope minimal** : on garde `drive.appdata` (dossier caché de l'app, **pas** tout le Drive) +
  `userinfo.email`. Le connecteur **n'a pas accès** aux autres fichiers Drive de l'utilisateur.
- **Cohérence avec l'existant** :
  - **`enc:false`** (défaut) : payload en clair dans le blob + **clés API chiffrées** (`apiKeysEnc`,
    dérivé du `sub`). Le MCP peut lire le payload (c'est le but) ; les clés API restent chiffrées.
  - **`enc:true`** (passphrase, opt-in) : zéro-knowledge — **le MCP ne peut RIEN lire sans la
    passphrase**, qui n'est jamais dans Drive. Comportement à décider (§3 / §8).
  - **Hard gate / `keyCipher` / `passphraseStore`** : réutilisés tels quels ; la passphrase reste un
    **secret de session** (jamais persistée), y compris côté MCP.
- **Clé IA (le point sensible)** : les tools « intelligents » (`get_next_best_actions`, et la Vision
  d'ingestion) **font des appels à Claude/Anthropic et voient donc les données**. Aujourd'hui ces appels
  partent du **navigateur de l'utilisateur avec SA clé** (`apiKeys.anthropic`, ADR-001,
  `dangerouslyAllowBrowser`). Côté MCP, **deux mondes** :
  - dans un connecteur MCP, **Claude lui-même fait déjà le raisonnement** : pour beaucoup de questions,
    on n'a PAS besoin d'appeler l'API Anthropic dans le tool — on renvoie les **données + calculs purs**
    et **Claude rédige la réponse**. ⇒ **préférer des tools « données pures » sans appel IA interne**
    (moins de clé, moins de surface, moins de coût). Les helpers IA ne sont nécessaires que pour ce qui
    n'est pas déjà couvert par Claude (ex. Vision sur un PDF scanné lors de l'ingestion).
  - quand un appel IA interne est requis (Vision), **où vit la clé** : BYO-key fournie par l'utilisateur
    (lue depuis le blob une fois `enc:false`, ou saisie en session), jamais en dur. **À trancher** (§8).
- **Loi 25 / minimisation** : Option A ne crée **aucun nouveau dépôt** de données financières → empreinte
  minimale. La **seule** entorse possible est **A1** : un serveur qui stocke des **refresh tokens
  chiffrés** (pas de données financières) et, si la Vision tourne côté serveur, qui **voit transiter**
  documents + clé. À documenter et à arbitrer explicitement (consentement, rétention, chiffrement au
  repos, droit à l'effacement — cohérent avec `deleteRemoteData` existant).

---

## 7. Distribution — comment Marc ajoute le connecteur à Claude

| Mode | Comment | Implications |
|---|---|---|
| **Claude Desktop (stdio)** — Options A2 / B | Éditer `claude_desktop_config.json` (cf `mcp/README.md`) pour lancer `mcp/stdio.ts`. | Zéro serveur, données restent locales, mais **mono-poste** + config manuelle. Idéal pour **prototyper la valeur** des tools sur les vraies données. |
| **Connecteur custom claude.ai (MCP distant HTTP + OAuth)** — Option A1 | Héberger le serveur MCP (Streamable HTTP) sur Vercel ; déclarer l'**OAuth Google** (consentement `drive.appdata`) ; ajouter l'URL comme connecteur dans claude.ai. | **De partout**, multi-appareils, toujours à jour. Exige le **2ᵉ client OAuth avec secret** + **stockage serveur de refresh tokens chiffrés** (petit backend) + transport HTTP MCP **pas encore présent** (le scaffold est stdio-only). |

Le scaffold actuel (`mcp/server.ts` + `mcp/stdio.ts`, SDK `^1.0`) couvre **stdio** ; le **transport
HTTP** (StreamableHTTP) reste à ajouter pour le mode claude.ai.

---

## 8. Phasing / MVP

| Lot | Contenu | Valeur / risque | Effort indicatif |
|---|---|---|---|
| **Lot 0 — Fondation** | Extraire l'**adaptateur pur `buildSimulationParams(state)`** (sortir la glue de `FutureProjection.tsx`) + helper pur `buildFinancialSnapshot(state)`. Prérequis de tous les tools « projection/overview ». | Aucune valeur user directe, mais **débloque tout** ; risque faible (refactor testable). | **S** (2-4 j) |
| **Lot 1 — Q&A read-only sur le blob Drive** | Pont « lire l'enveloppe Drive → état », + tools `get_financial_overview`, `get_projection`, `get_tax_situation`, `get_retirement_outlook`, `search_transactions` + resources. **Lecture seule.** Démarrer en **A2/stdio** (ou B) pour éviter l'auth distante. | **Max de valeur, min de risque** : Marc « parle à ses données » sans aucune écriture. | **M** (1-2 sem.) |
| **Lot 2 — Ingestion de docs (write-back gardé)** | `ingest_document` : détection type + parsers/Vision existants + **fusion non destructive** dans le blob + **garde anti-perte** + confirmation. | Forte valeur (« range mes docs »), risque **moyen** (écriture → anti-perte obligatoire). | **M-L** (2-3 sem.) |
| **Lot 3 — Distant + write-back avancé** | Transport **HTTP MCP** + **OAuth Drive offline** (A1, connecteur claude.ai) ; write-back riche (modifier objectifs/budget) ; gestion `enc:true`. | Confort max (de partout) ; risque **élevé** (auth headless, petit backend, Loi 25). | **L** (3-5 sem. + arbitrages) |

---

## 9. Décisions ouvertes pour Marc (les bifurcations)

1. **Option d'architecture** : on confirme **A** (adossé au Drive) ? B (export local) seulement comme
   tremplin de prototypage ? C (base serveur) **écarté** car il trahit le local-first ?
2. **Par où commencer** : **A2/stdio (Claude Desktop, local, zéro serveur)** d'abord pour prouver la
   valeur, **ou** viser directement **A1/distant (claude.ai, de partout)** malgré l'auth headless +
   petit backend ?
3. **Lecture seule d'abord, ou write-back tout de suite ?** (Reco : Lot 1 read-only avant d'ouvrir
   l'écriture du blob.)
4. **Backend de tokens assumé ?** A1 implique **stocker des refresh tokens Drive chiffrés** côté serveur
   (entorse au « sans backend »). Marc l'accepte-t-il, avec ses implications Loi 25 ?
5. **Passphrase `enc:true`** : le connecteur doit-il **la demander en session** pour déchiffrer, ou
   **se limiter au mode `enc:false`** (et donc demander à Marc de ne pas activer la passphrase s'il veut
   le connecteur) ?
6. **Clé IA pour l'ingestion/Vision (BYO ?)** : tolère-t-on des **appels IA internes** dans certains
   tools (qui voient les données + consomment la clé), ou vise-t-on des **tools « données pures »** et on
   laisse **Claude** raisonner ? Si Vision requise : **où vit la clé** et, en A1, **accepte-t-on que le
   doc + la clé transitent par le serveur** ?
7. **Périmètre des tools** : la liste §4 est-elle la bonne ? Manque-t-il un tool (ex. immobilier sur
   données réelles, optimisation de couple) ou faut-il en couper pour le MVP ?
8. **Concurrence d'écriture** app web ↔ MCP : politique de conflit (réutiliser `decideOnLoad` → on
   **bloque sur conflit** plutôt que d'écraser) — OK ?

---

## 10. Déjà réutilisable vs à construire

| Brique | État | Détail |
|---|---|---|
| Scaffold MCP (`mcp/server.ts`, `mcp/stdio.ts`, tools) | ✅ Réutilisable | Registry + stdio + 4 tools d'exemple (SDK `^1.0`). |
| Moteur de projection pur (`calculateFutureProjection`, `services/projection/*`) | ✅ Réutilisable | Pur, testé, sans React. |
| Fiscalité QC (`utils/tax.ts` : `calculateFiscalReport`, room CELI/REER) | ✅ Réutilisable | Pur, centralisé (ADR-009). |
| Sync Drive (`syncEngine` pur, `driveAppData` I/O, enveloppe `syncTypes`) | ✅ Réutilisable | `decideOnLoad`/garde anti-perte, `buildEnvelope`, lecture/écriture `appDataFolder`. |
| Crypto sync (`keyCipher`, `cloudBackup`, `passphraseStore`) | ✅ Réutilisable | Chiffrement clés (`sub`) + zéro-knowledge passphrase. |
| Parsers (`parseBankCsv`, `parseBrokerCsv`) | ✅ Réutilisable | Purs, universels, avec dédup. |
| Vision paie (`analyzePayslip` + `PayslipSchema`) + routage `PayslipUploadCard` | ✅ Réutilisable (adapter l'entrée fichier hors-DOM) | Logique « range au bon endroit » déjà écrite côté app. |
| Modèle de doc (`DocumentMeta[]` dans `AppState`) | ✅ Réutilisable | Slot d'archivage déjà modélisé (Phase G.1). |
| `FinancialSnapshot` / `getNextBestActions` (`services/claude.ts`) | ⚙️ Partiel | Le snapshot est construit en composant ; à extraire en helper pur. `getNextBestActions` exige la clé Anthropic. |
| **Adaptateur `AppState → SimulationParams`** | 🔨 À construire | Glue actuellement **dans React** (`FutureProjection.tsx`). Brique fondatrice (Lot 0). |
| **Pont « blob Drive ↔ état » côté MCP** | 🔨 À construire | Charger l'enveloppe, gérer `enc:false`/`enc:true`, exposer l'état au moteur. |
| **Auth MCP** (refresh token Drive headless) | 🔨 À construire | Flux OAuth offline (A1, secret serveur + stockage chiffré) **ou** installed-app loopback (A2). **Plus gros risque technique.** |
| **Transport HTTP MCP** (StreamableHTTP) | 🔨 À construire | Le scaffold est stdio-only ; requis pour le connecteur claude.ai. |
| **Ingestion routée + write-back gardé** | 🔨 À construire | Détection type → parser → fusion non destructive → ré-écriture Drive avec garde anti-perte. |

---

### Annexe — fichiers de référence (chemins absolus)

- Scaffold MCP : `/home/user/FinanceAI/mcp/server.ts`, `/home/user/FinanceAI/mcp/stdio.ts`,
  `/home/user/FinanceAI/mcp/tools/*.tool.ts`, `/home/user/FinanceAI/mcp/README.md`
- Moteur pur : `/home/user/FinanceAI/services/projection.ts` (`calculateFutureProjection`, L1197),
  `/home/user/FinanceAI/services/projection/*`, `/home/user/FinanceAI/utils/tax.ts`
- Sync : `/home/user/FinanceAI/services/sync/syncEngine.ts`,
  `/home/user/FinanceAI/services/sync/syncOrchestrator.ts`,
  `/home/user/FinanceAI/services/sync/syncTypes.ts`,
  `/home/user/FinanceAI/services/sync/keyCipher.ts`,
  `/home/user/FinanceAI/services/sync/passphraseStore.ts`,
  `/home/user/FinanceAI/services/googleDrive/driveAppData.ts`,
  `/home/user/FinanceAI/services/googleDrive/gisAuth.ts`
- Données : `/home/user/FinanceAI/types.ts` (`AppState`, `DocumentMeta`),
  `/home/user/FinanceAI/store/useFinanceStore.ts`
- Parsers / IA : `/home/user/FinanceAI/services/import/parseBankCsv.ts`,
  `/home/user/FinanceAI/services/import/parseBrokerCsv.ts`,
  `/home/user/FinanceAI/services/claude.ts` (`analyzePayslip`, `getNextBestActions`, `FinancialSnapshot`),
  `/home/user/FinanceAI/components/settings/PayslipUploadCard.tsx`
- Adaptateur à extraire : `/home/user/FinanceAI/components/FutureProjection.tsx` (~L123-240)
