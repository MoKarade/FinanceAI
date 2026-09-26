# CLAUDE.md — FinanceAI

App perso de planification financière (fiscalité ARC + Revenu Québec, Monte Carlo retraite, assistant Claude).
100 % navigateur : React 19 + Vite 8 + TS 5.8 strict + Tailwind 3, Zustand 5 (persist), Zod, Recharts, Vitest 4.
Hors navigateur : `api/` (relais Anthropic, Vercel) et `mcp/` (serveur MCP + hub). Prod : Vercel. Tout en français.
Structure plate (pas de `src/`) : `components/ hooks/ services/ store/ utils/ mcp/ api/ tests/ docs/`. Moteur : `services/projection/`.
Compte de tests (source unique, MESURÉ 2026-09-18, `cc0aa63c`) : **6 319 tests / 638 fichiers**. Détail du comptage : `docs/claude/entete.md`.

## Index — le détail vit dans `docs/claude/` (ce fichier reste ≤ 60 lignes / ≤ 10 Ko)
- Principes complets : `docs/claude/principes.md` · Conventions de code : `docs/claude/conventions-code.md`
- Git, PR, cycle autonome, tenue du BACKLOG, docs à chaque push : `docs/claude/workflow-git.md`
- Commandes : `docs/claude/commandes.md` · Gate avant commit : `docs/claude/verifications.md`
- Après merge, déploiement Vercel : `docs/claude/deploiement.md` · Hub / CarAI : `docs/claude/hub.md`
- Où vit quoi : `docs/claude/documentation.md` · Leçons (clés MAJUSCULES) : `docs/claude/lecons.md` (+ `docs/CONVENTIONS.md`)
- CI : `docs/claude/ci.md` · Style, compte-rendu : `docs/claude/style.md` · Agents, hooks : `docs/claude/agents.md`
- Chemins sensibles : `docs/claude/chemins-sensibles.md` · En-tête historique : `docs/claude/entete.md`
- État : `HANDOVER.md` · Tâches : `BACKLOG.md` (humaines : `docs/A_FAIRE_MOI.md`) · Architecture : `docs/ARCHITECTURE.md`
- Valeurs fiscales : `docs/FISCAL_REFERENCE.md` · Décisions : `docs/adr/`

## Commandes
`npm run dev` · `test` · `test:watch` · `test:e2e` · `typecheck` · `lint` · `build` (prebuild = lint) · `knip` · `check-contrast` · `mcp:dev|auth|connect|pack`.
**Gate avant CHAQUE commit** : `npm run typecheck && npm run lint && npm run test && npm run build`. Jamais `npx tsc`.

## Règles NON NÉGOCIABLES (texte complet dans `docs/claude/principes.md`)
1. **No-fake-data** : aucune donnée simulée en prod ; projection absente → `<ProjectionRequired>` ; valeur non finie/absente → « — » ou `null`, jamais `0` (y compris dans un prompt IA).
2. **Secrets** : jamais en clair (code, repo, chat). Clés API en IDB chiffré, exclues de localStorage, backups et push Drive.
3. **Dépôt PUBLIC** : jamais NIV, adresse, téléphone, n° de contrat ; jamais de montant dans un rapport de synchro ni un journal CI.
4. **Chemins sensibles** (`scripts/hooks/**`, `.github/**`, `.claude/**`, settings*, commit-gate*, `api/**`, `mcp/**`, `vercel.json`, `vite.config.ts`, `index.html`) : validation de Marc, JAMAIS d'auto-fusion.
5. **Sources uniques** : futur = `lastProjection.chartData` (grep le moteur avant tout calcul UI) ; patrimoine net = `computeRawNetWorth`.
6. **Fiscal** : toute constante vient de `docs/FISCAL_REFERENCE.md` (datée, sourcée) ; chiffre non sourcé = suspect. Salaires MENSUELS (×12).
7. **Formatage** : `formatCAD` / `formatPercent` uniquement ; devises natives → `assetValueCad`.
8. **Git** : branche `claude/<slug>`, PR avec `--base main` explicite, commits `[ID] desc`. Jamais `--no-verify`. Destructif → confirmer avec Marc.
9. **Store** : champ additif optionnel = pas de bump de version ; bump seulement pour restructurer.
10. **Tenue docs** : même PR : `HANDOVER.md`, `BACKLOG.md`, `CHANGELOG.md`, README touchés ; leçon → `docs/CONVENTIONS.md`, sinon « push sans leçon ».
11. **Déploiement** : après un merge qui change ce qui est servi, vérifier un déploiement Vercel production `READY` sur le bon SHA (CSP de `vercel.json` enforcée).

## Conduite
Plan d'abord, questions en un batch, OK avant de coder, puis exécution continue ; proposer ≠ faire. `[YYYY-MM-DD HH:MM UTC]` en tête de chaque réponse. Qualité d'abord, coût tokens non contraint.

@docs/COMPTE-RENDU.md
