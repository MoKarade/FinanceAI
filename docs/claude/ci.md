<!-- Extrait de CLAUDE.md, déplacé le 2026-09-26 (texte copié à l'identique, rien supprimé). Index : CLAUDE.md -->

### CI (GitHub Actions) — pourquoi un gate vert ne suffit pas

⚠️ **« Gate local vert » ≠ « CI verte »** : le conteneur de dev tourne sur Node **22**, les workflows
épinglent **20**, et rien ne déclare la cible (`engines`/`.nvmrc` absents — `[ENV-NODE-NON-DECLARE]`).
`globSync` (`node:fs`, Node 22+) a donné un gate local vert et une CI rouge sur le MÊME commit.
Avant d'employer une API `node:*`, vérifier depuis quelle version elle existe vs le `node-version`
des workflows — pas le `node -v` local. Symptôme : `TypeError: X is not a function` en CI seulement.
Le correctif est presque toujours de **réutiliser le marcheur/patron déjà employé par le dépôt**
(ici `readdirSync(dir, { recursive: true })`), dont la compatibilité est déjà prouvée par la CI
(`GATE-LOCAL-VERT-CI-ROUGE-PAR-VERSION-DE-NODE`).
✅ **Réglé le 2026-08-21** (`[ENV-NODE-NON-DECLARE]`) : `.nvmrc` + `engines.node` + les 4 workflows
sur `node-version-file`, gardés par `tests/nodeVersionDeclared.test.ts`. ⚠️ Mais la vraie protection
n'est AUCUN des deux que le ticket nommait : `engines`/`.nvmrc` sont DÉCLARATIFS (sans
`engine-strict`, `engines` n'est qu'un avertissement npm). C'est **`@types/node` aligné sur la
version EXÉCUTÉE** (`^22` → `^20`) qui rend la classe impossible : `tsc` refuse alors l'API trop
récente À L'ÉCRITURE. Face à un « vert local / rouge distant », distinguer l'artefact *déclaratif*
de l'*exécutoire* — seul le second protège.

⚠️ Le workflow filtre sur `pull_request: branches: [main]` : une **PR EMPILÉE** (base `claude/xxx`)
ne déclenche **aucun** run CI — Vercel et CodeQL partent quand même, ce qui donne l'illusion d'une
vérification. `enable_pr_auto_merge` répond « unstable status » parce que les checks requis sont
ABSENTS, pas en échec. Dans une pile, seule la PR du BAS est testée ; les autres n'ont leur CI qu'au
re-ciblage automatique de leur base sur `main`. Le gate LOCAL est alors la seule vérification réelle
(`PR-EMPILEE-N-A-AUCUNE-CI`).

⚠️ Le check requis **« E2E (Playwright / Chromium) »** n'apparaît PAS dans `pull_request_read
get_status` (qui ne montre que les *statuses* legacy — seul Vercel y figure) : le lire via
`actions_list list_workflow_jobs`. Il fige régulièrement sur « Install Playwright Chromium »
(blocage d'infra, vu 3× : 45 min, 32 min, 32 min) → `cancel_workflow_run`, attendre la propagation
(un rerun immédiat rend 403 « already running »), puis `rerun_workflow_run`.

