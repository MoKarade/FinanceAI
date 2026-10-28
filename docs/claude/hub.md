<!-- Extrait de CLAUDE.md, déplacé le 2026-09-26 (texte copié à l'identique, rien supprimé). Index : CLAUDE.md -->

## 7. Intégration hub

FinanceAI publie un résumé au **hub perso** (`hubperso.com`) — mais **pas** depuis Vercel : le
endpoint vit dans le serveur MCP auto-hébergé (`mcp/http.ts` → `GET /hub/summary`), construit par
`mcp/hubSummary.ts`. C'est la différence avec les autres apps, et elle est structurelle : les
données financières ne quittent pas la machine de Marc, donc le résumé se calcule là où elles sont.

- **Identité publiée** : `id: "financeai"`, `name: "FinanceAI"`, `url:
  "https://finance.hubperso.com"`, `color: "#0f766e"`. L'`id` doit rester identique à l'entrée de
  `Hubperso/lib/sources.ts` — c'est du **code** côté hub, donc le changer exige un redéploiement
  du hub, pas seulement une variable d'environnement.
- **Auth (échec fermé)** : la route n'existe QUE si `FINANCEAI_HUB_TOKEN` est défini ; header
  `x-hub-token` exigé, **401** sinon, comparaison en temps constant. Réponse toujours
  `Cache-Control: no-store` — un résumé est un instantané, jamais une page mise en cache.
- **Validé avant d'être servi.** `buildHubSummary` passe par `validateSummary()` du vrai schéma du
  contrat : ce serveur ne publie jamais un JSON non conforme. Une panne interne rend
  `errorHubSummary` — le widget affiche la panne au lieu de traiter l'app comme injoignable.
- **No-fake-data au contrat** : les métriques viennent de `computeFinancialSignals` sur l'état
  réel, la fraîcheur Drive donne `status`/`dataAsOf`. Aucun chiffre inventé, jamais un `0`
  plausible à la place d'une mesure absente (§1).
- **Période et devise** : le hub somme **par période** et refuse de fusionner « cumulé » avec
  « ce mois-ci ». Une app qui publierait `mois` se retrouverait seule dans sa colonne et casserait
  le total pour tout le monde.
- ⚠️ **`GET /vehicule/bail` n'est PAS le hub** : c'est le seul endroit où FinanceAI parle à une
  autre app (CarAI), sous un secret **dédié** (`FINANCEAI_VEHICULE_TOKEN`, jamais celui du hub — il
  ouvrirait la valeur nette pour lire une mensualité). Il rend UNE dette, nomme ce que l'état ne
  porte pas, et **refuse 409** plutôt que de choisir entre deux véhicules. ADR 0017, détail dans
  `mcp/README.md`.
- **Contrat pinné sur le tag `v1.5.0`** depuis le 16/10/2026 (le contrat passe à zod 4 : un seul zod 4 dans l'arbre, plus de copie zod 3 sous `node_modules/@mokarade/hub-contract`) ; `v1.4.0` (15/10) avait ajouté le sous-chemin `/session`. ⚠️ Re-pinner n'est pas optionnel
  pour consommer un champ neuf : Zod STRIPPE les clés inconnues, donc sur un pin antérieur
  `validateSummary` retire `expectedMaxAgeSec`, `details`, `primary` et `recommendation` **en
  silence** — et les tests passent en n'affirmant plus rien sur eux.
- ⚠️ **`dataAsOf` MÊLE DEUX HORLOGES, et c'est pour ça que `expectedMaxAgeSec` est LÂCHE.** Il
  vaut le plus ANCIEN du push Drive (quelques minutes quand l'app est ouverte) et de la clôture de
  marché servie (une fois par jour OUVRÉ). Le contrôle de fraîcheur quotidien est donc
  `STALE_THRESHOLD_MS` (6 h sans push → `status: 'degraded'` + alerte), PAS le seuil publié : un
  seuil de 6 h crierait « donnée figée » chaque fin de semaine, alors que la bourse est simplement
  fermée. `AGE_MAX_ATTENDU_SEC` est donc un **filet de fond** — dérivé de `MAX_STALE_DAYS + 1 j`,
  parce qu'au-delà `computePortfolioSessionMetrics` refuse la séance et `dataAsOf` retombe sur le
  seul push. **Ne pas « resserrer » ce seuil vers 6 h** en croyant corriger un oubli : deux tests
  l'interdisent, et l'un dit pourquoi.
- **`recommendation` (contrat v1.3) vient de `signals[0]`, donc gratuitement** :
  `computeFinancialSignals` est déjà appelé pour les alertes et rend ses signaux triés par
  priorité. Le `label` porte **l'action** (`ACTION_PAR_SIGNAL`, clé = `signal.id`), le `why` porte
  le constat. ⚠️ Ce n'est pas un doublon d'`observation` : un signal DÉCRIT, une recommandation DIT
  QUOI FAIRE — et l'observation dépasse souvent les 80 caractères du `label`. Un test analyse
  `mcp/financialSignals.ts` et exige une action pour CHAQUE identifiant réel : un signal ajouté
  sans action ferait publier son constat comme un conseil.
- **`details` publie deux choses, et la première est la plus utile** : la fraîcheur **décomposée**
  (le push Drive et la clôture, séparément — un seul horodatage ne peut pas dire laquelle des deux
  est en retard, et c'est la première question quand un chiffre surprend), puis la ventilation des
  placements par compte depuis `computeAssetBreakdown` (source unique, FX incluse). Les postes à
  **zéro sont omis** : « REEE : 0 $ » affirmerait un compte vide là où il n'y a pas de compte.

## Accès au site : la session du hub (FinanceAI#1159, ADR 0027)
- **Tout finance.hubperso.com est derrière la session du hub** : `middleware.ts` (racine, Edge, sans `matcher`) → `api/_lib/gardeSite.ts`. Sans session : page → 302 vers `hubperso.com/login?callbackUrl=…` ; `/api/*` → 401 JSON ; autre courriel → 403 ; hub injoignable ou hors contrat → 503. Seule exception, dans le code et testée : `GET /api/sante`.
- **Le hub tranche** : `api/_lib/accesHub.ts` interroge `GET https://www.hubperso.com/api/session/moi` (Hubperso#601) avec les seuls cookies de session du hub (`www`, jamais l'apex qui redirige et fait perdre le cookie) ; `{proprietaire:true}` = ouvert. « Oui » gardé 60 s par isolat, refus jamais en cache. **Aucune variable à poser** ; `HUB_URL` ne sert qu'à la destination de la connexion.
- Le relais Claude et les proxys revérifient (`controlerAcces`). Ne jamais ajouter d'exception au garde « pour dépanner » ; une nouvelle route reste derrière lui. Verrous : `tests/api/middleware.test.ts`, `accessJwt.test.ts` (nom d'origine conservé), `relaisAccess.test.ts`.
- `api/_lib/lia.ts` a encore sa propre vérification (`HUB_SESSION_PUBLIC_KEYS`, `AUTHORIZED_EMAIL`) : tâche à part pour la brancher sur la même route.
- Preuves : `curl -s -o /dev/null -w "%{http_code}" "https://finance.hubperso.com/api/yahoo/search?q=tsla"` → `401` ; `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" https://finance.hubperso.com/` → `302 https://hubperso.com/login?callbackUrl=…` ; `/api/sante` → `200`.

## LIA dans FinanceAI (#1253)
- **Une seule LIA** : son état (humeur, mémoire, envies) vit chez MemoryAI ; FinanceAI n'en garde AUCUN (ni stockage local, ni store). Le paquet `@mokarade/lia-ui` (épinglé `v0.43.0`) est démarré une seule fois par `demarrerLia` (`@mokarade/lia-ui/boot`), dans `services/lia/demarrage.ts`, appelé depuis `index.tsx` au chargement du module (import dynamique, chunk à part, avant le rendu de React ; #1267). LIA vit donc dans `document.body`, hors de `#root` : ni le Suspense, ni l'`ErrorBoundary`, ni le `LoginGate`, ni le premier lancement ne la retirent (Marc, 23/10/2026 : « présente tout le temps »). **Aucune route sans LIA** : sans session du hub (écran de connexion Google éventuel, premier lancement) la fonction répond 401 et LIA dit « indisponible ». Une seule voie : un test interdit `<Lia` et tout autre import de `@mokarade/lia-ui/boot` ou `/react`.
- **Mode invité (#1273, comme app-template#141)** : LIA est déjà présente sans session, sur l'écran de connexion Google (`LoginGate`), au premier lancement et sous une erreur de rendu, parce qu'elle est démarrée avant React. Pas de drapeau de session côté navigateur : le cookie du hub est invisible du navigateur et la connexion Google du `LoginGate` n'est pas la session du hub. Sans session du hub, `POST /api/lia/ask` répond 401 (échec fermé côté serveur) et LIA dit « indisponible » ; un test verrouille que le démarrage précède le rendu du `LoginGate`.
- **Chemin d'une question** : navigateur → `POST /api/lia/ask` de CETTE app (même origine, cookie `__Secure-hub.session`) → hub `POST /api/lia/ask` (`x-hub-token: HUB_TOKEN`, corps `{question, page, proprietaire}`) → MemoryAI. Le navigateur ne voit jamais de jeton. Les blocs composés du hub ne sont pas relayés en v1.
- **Échec fermé** (`api/_lib/lia.ts`), dans l'ordre : méthode (405) → origine (403) → session du hub vérifiée avec `HUB_SESSION_PUBLIC_KEYS` (401, y compris clés absentes ou illisibles) → propriétaire = `AUTHORIZED_EMAIL` (403) → corps ≤ 8 Ko (413) → JSON/schéma (400) → hub en échec, injoignable, trop lent (35 s) ou réponse non conforme (503 `lia_indisponible`). Tout en `no-store`. Jamais de réponse inventée : LIA dit « indisponible ».
- **Variables Vercel du projet `finance-ai`** (posées par le fil Secrets, jamais dans le dépôt) : `HUB_TOKEN`, `HUB_SESSION_PUBLIC_KEYS`, `AUTHORIZED_EMAIL` ; `HUB_URL` optionnelle (défaut `https://hubperso.com`, https obligatoire). Sans l'une des trois premières, la fonction refuse (401/403/503) au lieu de servir.
- **Preuve en production** : `curl -i -X POST https://finance.hubperso.com/api/lia/ask` sans cookie → 401, jamais 200.

