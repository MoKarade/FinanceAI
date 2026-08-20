# Décisions d'architecture (ADR)

Une décision par fichier, `NNNN-slug.md`, numérotées dans l'ordre chronologique — structure
commune aux huit dépôts du hub
([`conventions/STRUCTURE-DEPOT.md`](https://github.com/MoKarade/claude-config/blob/main/conventions/STRUCTURE-DEPOT.md)).

Jusqu'au 2026-08-20, ces décisions vivaient empilées dans un `docs/adr/` unique,
dans le désordre chronologique (l'ADR-001 arrivait en quatrième position). Le fichier a été
découpé sans qu'une ligne soit réécrite : chaque bloc `##` est devenu un fichier, son titre est
passé en `#`, et rien d'autre n'a bougé. Les numéros `ADR-001` et `ADR-002` d'origine sont
conservés en 0001 et 0002.

| Fichier | Décision |
|---|---|
| [`0001-environnement-agents-de-revue.md`](0001-environnement-agents-de-revue.md) | ADR-001 — Environnement d'agents de revue (2026-06-17) |
| [`0002-app-personnelle-relais-byok.md`](0002-app-personnelle-relais-byok.md) | ADR-002 — App PERSONNELLE (solo) et relais BYOK pour Claude (2026-07-06) |
| [`0003-batch-decisions-marc-2026-07-06.md`](0003-batch-decisions-marc-2026-07-06.md) | Batch 2026-07-06 — Décisions Marc consolidées (8 items, 2 jeux fiscaux reçus) |
| [`0004-rafraichissement-serveur-des-prix.md`](0004-rafraichissement-serveur-des-prix.md) | ADR — Rafraîchissement serveur autonome des prix (`HUB-REFRESH-CRON`, 2026-07-22) |
| [`0005-contexte-decran-du-chat.md`](0005-contexte-decran-du-chat.md) | ADR — Contexte d'écran du chat : injection `system` figée par envoi, PAS un tool (`CHAT-PAGE-CONTEXT`, 2026-07-22) |
| [`0006-assistant-fusionne-prochaines-actions.md`](0006-assistant-fusionne-prochaines-actions.md) | ADR — Assistant fusionné : un seul moteur de « prochaines actions » (`ASSISTANT-HUB`, 2026-07-23) |
| [`0007-couverture-du-total-de-la-courbe.md`](0007-couverture-du-total-de-la-courbe.md) | ADR — Couverture du TOTAL de la courbe de portefeuille (`HIST-COVERAGE-TOTAL`, 2026-07-23) |
| [`0008-quotes-multi-providers.md`](0008-quotes-multi-providers.md) | ADR — Quotes multi-providers : Yahoo en repli + diagnostic actionnable (`HIST-MULTI-PROVIDER`, 2026-07-23) |
| [`0009-suppressions-via-mcp-delete-item.md`](0009-suppressions-via-mcp-delete-item.md) | ADR — Suppressions via MCP/IA : `delete_item` (actif / dette / objectif), transactions DIFFÉRÉES (`MCP-DIRECT-EDIT` Lots 4-5, 2026-07-29) |
| [`0010-sync-bancaire-fintable.md`](0010-sync-bancaire-fintable.md) | ADR — Sync bancaire & investissements via Fintable (`FINTABLE`, 2026-07-29) |
| [`0011-modele-du-divorce-dans-la-projection.md`](0011-modele-du-divorce-dans-la-projection.md) | ADR — Modèle du DIVORCE dans le moteur de projection (2026-08-13) |
| [`0012-quatre-decisions-de-marc-2026-08-17.md`](0012-quatre-decisions-de-marc-2026-08-17.md) | ADR — Quatre décisions de Marc (2026-08-17) |
| [`0013-mode-discret-categories-masquees.md`](0013-mode-discret-categories-masquees.md) | ADR — Mode discret : les CATÉGORIES sont masquées aussi (2026-08-18) |
| [`0014-sept-decisions-de-cadrage-2026-08-20.md`](0014-sept-decisions-de-cadrage-2026-08-20.md) | ADR — Sept décisions de cadrage en lot (Marc, 2026-08-20) |
| [`0015-prestations-rqap-ae-rrq-hors-assiette.md`](0015-prestations-rqap-ae-rrq-hors-assiette.md) | ADR — Prestations RQAP/AE/RRQ : hors assiette de cotisation, imposables (Marc, 2026-08-20) |

Une nouvelle décision prend le numéro suivant. Elle ne se réécrit pas après coup : une ADR est
un **récit daté**, et une mise à jour s'y ajoute en section datée (voir 0010, qui en porte cinq).
