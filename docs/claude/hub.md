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
- **Contrat pinné sur le tag `v1.3.0`** depuis le 14/09/2026. ⚠️ Re-pinner n'est pas optionnel
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

