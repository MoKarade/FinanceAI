# ÉTAT — FinanceAI

> Photographie courte de l'état du projet, pour un chef ou un spécialiste qui arrive sans
> contexte. La référence complète et datée reste `HANDOVER.md` (racine) et `BACKLOG.md` —
> ce fichier n'en est qu'un résumé daté, pas une source concurrente.
>
> Rédigé le 2026-09-28, à partir de `HANDOVER.md`, `BACKLOG.md`, `docs/A_FAIRE_MOI.md`,
> `docs/FISCAL_REFERENCE.md`, `qualite/seuils.json`, `apps.json` (Atelier) et l'historique git
> jusqu'au commit `9cb2bbb1` (#1074). Aucun chiffre ici n'est mesuré par cette session : tout
> est repris des documents cités.

## Fait (en service)

App perso de planif financière (fiscalité ARC + Revenu Québec, projection Monte Carlo,
assistant Claude) : 100 % navigateur, pas de backend applicatif, servie sur
`finance.hubperso.com` (Vercel). Onglets en service : Budget, Transactions, Investissements
(portefeuille courtier, refonte en cours — voir « En cours »), Dettes, Immobilier, Futur
(projection), Retraite, Impôts, Enfants, Système, Réglages. Serveur MCP séparé (Cloud Run,
`mcp/`) expose les données au connecteur claude.ai et à Claude Code (outils de lecture +
écriture, OAuth 2.1).

Chantiers de sécurité fermés et verrouillés par test : jeton de relais IA public supprimé,
remplacé par des freins honnêtes — Origin, débit, plafond de corps, clé Anthropic vérifiée
(`[DURCISSEMENT-RELAIS]`, #1072) ; kit d'auto-fusion de l'Atelier en 1.9.1 avec attestation
réelle de pole-securite (`securite_login`/`securite_user_id`, #1086) ; documents relus par les
agents (CLAUDE.md, docs/claude/, HANDOVER.md, BACKLOG.md, CHANGELOG.md) protégés contre une
modification silencieuse glissée dans une PR auto-fusionnée (`[DOCS-PROTECTION]` v3, #1088).

## En cours / pas encore vu en usage

- **Cloudflare Access (`[CF-ACCESS]`, #1074, fusionnée le 28/09) : code livré, SANS EFFET tant
  que Marc n'a pas posé le mur.** Procédure pas à pas et ordre strict dans `docs/A_FAIRE_MOI.md`
  (`[CF-ACCESS-MISE-EN-SERVICE]`) : poser `CF_ACCESS_REQUIRED=0` sur Vercel AVANT de déployer,
  test iPhone/PWA, application Access + DNS proxifié, vérifications, puis seulement retirer la
  variable pour passer à « exiger ». Tant que ce n'est pas fait, le relais IA et les proxys
  restent protégés par le seul durcissement de #1072 (pas de mur devant l'app elle-même).
- **Refonte du portefeuille courtier** (cahier des charges de Marc, feu vert Lot 1) : grand
  livre par compte courtier et référentiel d'instruments livrés (Lot 1a) ; lots suivants en
  cours, détail dans `BACKLOG.md` (section « Portefeuille courtier »).
- Bug fiscal connu et déjà tracé : le taux du crédit fédéral non remboursable est codé à 15 %
  (`FED_NONREFUNDABLE_RATE`) sans source primaire confirmée ; une recherche relayée par Marc
  (2026-09-05) suggère 14,5 % (2025) / 14 % (2026) + crédit compensatoire. Valeur INCHANGÉE tant
  que la source ARC manque (`[FISC-FED-CREDITRATE-15]`, `docs/FISCAL_REFERENCE.md` §1 et
  `BACKLOG.md`).

## Bloqué / risque ouvert

- 🔴 **Aucun mur d'authentification devant `finance.hubperso.com` tant que
  `[CF-ACCESS-MISE-EN-SERVICE]` n'est pas fait par Marc** (action humaine, `docs/A_FAIRE_MOI.md`).
  Le code est en attente sur `main` depuis le 28/09.
- ⚠️ Après un rollback Vercel (déjà arrivé une fois, cf. `HANDOVER.md` session 2026-09-23),
  l'auto-assignation du domaine de production se coupe : le déploiement suivant doit être
  **promu** manuellement (Vercel → Deployments → Promote), sinon `finance.hubperso.com` reste
  sur l'ancien code alors que la CI est verte.
- Deux actions humaines encore ouvertes après #1072 : retirer `PROXY_ACCESS_TOKEN` et
  `VITE_PROXY_ACCESS_TOKEN` de Vercel (obsolètes depuis le durcissement du relais), et confirmer
  le comportement en prévisualisation de `[CF-ACCESS]` (réécriture Vercel → fonction, 401 vs 302,
  en-tête `cf-connecting-ip`) — voir `BACKLOG.md`.

## Portes qualité (cliquet, `qualite/seuils.json`, mis à jour le 24/09/2026)

| Porte | Seuil |
|---|---|
| Erreurs de typecheck | 0 |
| Erreurs de lint | 0 |
| Avertissements de lint | ≤ 32 |
| Échecs de tests | 0 |
| Couverture lignes, cœur (`services/`) | ≥ 94,3 % |
| Couverture lignes, globale | ≥ 93,0 % |
| Couverture branches, globale | ≥ 83,3 % |
| Problèmes de code mort (knip) | ≤ 40 |
| Violations d'architecture (dependency-cruiser) | ≤ 14 |
| Score de mutation (Stryker) | ≥ 75,1 % |

Un seuil ne redescend jamais sans `--forcer` et une décision de Marc (`npm run portes:maj` le
resserre quand un chiffre s'améliore). Invoqué par la CI (`node qualite/portes.mjs`) et
disponible en local (`npm run portes`).

## Repères techniques rapides

React 19.2 + Vite 8 (Rolldown) + TypeScript 5.8 strict + Tailwind (v4 depuis #1072) · Zustand 5
(`persist`, schéma v7) · Zod 3 · Recharts 3 · Vitest 4 · `@anthropic-ai/sdk` · SDK MCP 1.30 ·
Node 24 (CI). Pas de `src/` : racine plate (`App.tsx`, `constants.ts`, `types.ts`…) + dossiers
`components/ hooks/ services/ store/ utils/ mcp/ api/ e2e/ tests/ scripts/ docs/`. Détail complet
et raisons des choix : `docs/ARCHITECTURE.md`.

## PR récentes notables (jusqu'au 28/09, commit `9cb2bbb1`)

| PR | Date | Contenu |
|---|---|---|
| #1074 | 28/09 | `[CF-ACCESS]` Cloudflare Access : jeton vérifié côté API, proxys gardés, session expirée |
| #1072 | 28/09 | `[DURCISSEMENT-RELAIS]` relais IA : jeton public supprimé, freins honnêtes |
| #1088 | 28/09 | `[DOCS-PROTECTION]` v3 : documents des agents protégés (kit 1.9.1 + attestation réelle) |
| #1087 | 28/09 | Correctif : garde a11y des graphes cassée sous Windows (`path.relative` sans `toPosix`) |
| #1086 | 28/09 | CI : attestation réelle de pole-securite (`securite_login`, `securite_user_id`) |
| #1085 | 28/09 | `[KIT-191]` resynchro kit d'auto-fusion 1.9.0 → 1.9.1 |
| #1078 | 26/09 | `[WIN-GARDES]` les tests-gardes passent aussi sous Windows |
| #1075 | 26/09 | `[CLAUDE-MD-COURT]` `CLAUDE.md` 3153 → 40 lignes, détail déplacé vers `docs/claude/` |
| #1073 | 26/09 | `[GARDE]` fusion auto bloquée sur chemins sensibles, LF, limites du hook |

## Où lire le détail

- `HANDOVER.md` (racine) — état daté, verbeux, session par session.
- `BACKLOG.md` (racine) — tâches ouvertes, avec case à cocher.
- `docs/A_FAIRE_MOI.md` — actions humaines en attente (Marc).
- `docs/ARCHITECTURE.md` — stack, structure, moteur de projection.
- `docs/FISCAL_REFERENCE.md` — constantes fiscales datées et sourcées.
- `docs/CONVENTIONS.md` — leçons apprises, une par incident.
- `docs/adr/` — décisions d'architecture datées.
