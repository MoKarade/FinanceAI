<!-- Ajouté le 2026-09-26 lors du raccourcissement de CLAUDE.md : règle qui n'existait que dans les consignes d'orchestration, désormais écrite dans le dépôt. -->

# Chemins sensibles — validation de Marc, jamais d'auto-fusion

Ces chemins pilotent la sécurité, la CI, le déploiement ou les garde-fous des sessions. Une PR qui les touche :
- n'est JAMAIS fusionnée automatiquement ni à la main par Claude : validation explicite de Marc ;
- ne se prépare pas dans le même lot que du code applicatif ordinaire (PR dédiée, périmètre lisible).

Liste : `scripts/hooks/**`, `.github/**`, `.claude/**` (agents, commandes, settings*), `commit-gate*`, `api/**` (relais Anthropic/IA, routes Vercel), `mcp/**` (serveur MCP + hub), `vercel.json` (CSP enforcée), `vite.config.ts`, `index.html`.

Autres interdits permanents : jamais `--no-verify`, jamais de secret en clair, jamais de donnée d'identification (NIV, adresse, téléphone, n° de contrat) ni de montant dans le dépôt public, ses journaux CI ou ses rapports de synchro. Détail : `principes.md`, `workflow-git.md`, `deploiement.md`.
