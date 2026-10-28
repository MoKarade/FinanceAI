<!-- Ajouté le 2026-09-26 lors du raccourcissement de CLAUDE.md : règle qui n'existait que dans les consignes d'orchestration, désormais écrite dans le dépôt. -->

# Chemins sensibles — fusionnés seulement si le garde-fou est vert

Ces chemins pilotent la sécurité, la CI, le déploiement ou les garde-fous des sessions. Une PR qui les touche :
- est fusionnée par Mergify SEULEMENT si le contrôle « Garde-fou » est vert (oui écrit de Marc, 15/10/2026 : il bloque un test retiré ou sauté, un seuil baissé, une référence à un secret, une migration destructive, et toute modification de `.mergify.yml` ou du garde-fou) ; jamais à la main par Claude ; rouge, elle attend Marc (issue `qui:marc`) ;
- ne se prépare pas dans le même lot que du code applicatif ordinaire (PR dédiée, périmètre lisible).

Liste : `scripts/hooks/**`, `.github/**`, `.claude/**` (agents, commandes, settings*), `commit-gate*`, `api/**` (relais Anthropic/IA, routes Vercel), `mcp/**` (serveur MCP + hub), `vercel.json` (CSP enforcée), `vite.config.ts`, `index.html`.

Autres interdits permanents : jamais `--no-verify`, jamais de secret en clair, jamais de donnée d'identification (NIV, adresse, téléphone, n° de contrat) ni de montant dans le dépôt (à tenir comme public : public visé, privé en attendant depuis le 21/10/2026), ses journaux CI ou ses rapports de synchro. Verrou : `tests/guards/donneesPerso.test.ts` (empreintes + cliquet par fichier ; sortie sans la donnée). Détail : `principes.md`, `workflow-git.md`, `deploiement.md`.
