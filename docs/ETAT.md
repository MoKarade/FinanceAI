# ÉTAT — FinanceAI

> Photographie courte de l'état du projet, pour un chef ou un spécialiste qui arrive sans
> contexte. La référence complète et datée reste `HANDOVER.md` (racine) et `BACKLOG.md` —
> ce fichier n'en est qu'un résumé daté, pas une source concurrente.
>
> **Rédigé le 2026-10-14**, à partir de `git log` de `main` (dernier commit `4b53a712`, #1099,
> du 30/09/2026 : aucun commit sur `main` entre le 01/10 et le 14/10), de `package.json`, de
> `.github/` (workflows, `auto-merge.json`), de `qualite/seuils.json`, de `BACKLOG.md`,
> `docs/A_FAIRE_MOI.md` et de la liste des PR ouvertes sur GitHub au 14/10. Version précédente :
> 2026-09-28 (commit `9cb2bbb1`), consultable dans l'historique git.

## Gel en cours

Gel décidé par Marc le 14/10 : aucun nouveau travail sur les apps tant que le plan de réduction
du temps des PR est en cours.

## Fait (en service)

App perso de planif financière (fiscalité ARC + Revenu Québec, projection Monte Carlo,
assistant Claude) : 100 % navigateur, pas de backend applicatif, servie sur
`finance.hubperso.com` (Vercel). Onglets en service : Budget, Transactions, Investissements
(portefeuille courtier, refonte en cours — voir « En cours »), Dettes, Immobilier, Futur
(projection), Retraite, Impôts, Enfants, Système, Réglages. Serveur MCP séparé (Cloud Run,
`mcp/`) expose les données au connecteur claude.ai et à Claude Code (outils de lecture +
écriture, OAuth 2.1).

Livré sur `main` entre le 28/09 et le 30/09 (détail : `HANDOVER.md`, `CHANGELOG.md`) :
- Sécurité MCP : écritures en deux temps avec jeton serveur à usage unique (#1076, ADR 0023),
  limites de débit des routes, message de parse sans extrait, clé d'accès faible signalée
  (#1080), verrou d'écriture MCP désactivé par défaut et activable seulement depuis l'app web
  (#1093, ADR 0025).
- Chiffrement de la sauvegarde Drive, Phase 1 : création de passphrase + mémorisation par
  appareil verrouillée par WebAuthn (#1094, ADR 0026).
- Refonte visuelle (Tailwind 4, #1063, puis #1097 et #1098 : écrans restants, accessibilité AA).
- Mode discret : récapitulatif d'ajout de placement et calendrier des factures masqués (#1109) ;
  code mort retiré, garde de vie privée élargie aux alias de `formatNumber` (#1100).
- Futur : commutateur « Bac à sable » et curseurs théoriques retirés, `useTheoretical` neutralisé
  dans le moteur ; marqueur « données fictives » dans les prompts de l'IA (#1099).
- Outillage : kit d'auto-fusion de l'Atelier passé de 1.9.1 à 1.14.0 (#1096, #1113), frein
  visuel activé (#1095, #1105), routes planifiées sans détail d'erreur interne (#1108), E2E
  stabilisé (#1111), fuite de fuseau d'un test corrigée (#1117).

## En cours / pas encore vu en usage

- **PR ouvertes au 14/10** (aucune fusionnée depuis le 30/09) : `[PRIVACY-RATIOS-DUREES-UNIFORMES]`
  (#1112, brouillon), `[EXPORT-JSON-PERD-FINTABLE]` (#1107), `[A11Y-PANNEAU]` (#1103, brouillon),
  `[A11Y-DETTE]` (#1101, brouillon), `[HOOKS-LECONS]` (#1079, brouillon),
  `[CI-GITLEAKS-8-30-1]` (#1110 — `main` est déjà passé à gitleaks 8.30.1 par #1113, PR
  probablement sans objet, [À vérifier]), une PR de documentation (#1122) et cinq PR Dependabot
  (#1083, #1089, #1115, #1116, #1121).
- **Cloudflare Access (`[CF-ACCESS]`, #1074, fusionnée le 28/09) : code livré, SANS EFFET tant
  que Marc n'a pas posé le mur.** Procédure pas à pas dans `docs/A_FAIRE_MOI.md`
  (`[CF-ACCESS-MISE-EN-SERVICE]`, toujours ouvert au 14/10).
- **Refonte du portefeuille courtier** (cahier des charges de Marc, feu vert Lot 1) : grand
  livre, valorisation, parseur Disnat, lecture PDF et passerelle pure (e1, non branchée) livrés ;
  branchement (e2 et suivants) et magasin de marché restent à faire (`BACKLOG.md`, section
  « Portefeuille courtier »).
- Chiffrement Phase 2 (MCP + Infisical) et Phase 3 (défaut chiffré) : bloquées, prérequis
  externe (`BACKLOG.md`).
- Bug fiscal connu et déjà tracé : le taux du crédit fédéral non remboursable est codé à 15 %
  (`FED_NONREFUNDABLE_RATE`) sans source primaire confirmée (`[FISC-FED-CREDITRATE-15]`,
  `docs/FISCAL_REFERENCE.md` §1 et `BACKLOG.md`).

## Bloqué / risque ouvert

- 🔴 **Aucun mur d'authentification devant `finance.hubperso.com` tant que
  `[CF-ACCESS-MISE-EN-SERVICE]` n'est pas fait par Marc** (action humaine, `docs/A_FAIRE_MOI.md`).
- ⚠️ Après un rollback Vercel (déjà arrivé une fois, cf. `HANDOVER.md` session 2026-09-23),
  l'auto-assignation du domaine de production se coupe : le déploiement suivant doit être
  **promu** manuellement, sinon `finance.hubperso.com` reste sur l'ancien code alors que la CI
  est verte. Le déploiement de production du dernier commit (`4b53a712`) n'a pas été vérifié
  par la session du 14/10 [À vérifier].
- Actions humaines encore ouvertes (`docs/A_FAIRE_MOI.md`) : retirer `PROXY_ACCESS_TOKEN` et
  `VITE_PROXY_ACCESS_TOKEN` de Vercel ; régénérer la clé d'accès MCP puis activer le mode STRICT
  (`[MCP-DURCISSEMENT]`) ; consignes d'usage du verrou d'écriture et du chiffrement.
- ⚠️ Règle de fusion contradictoire entre documents (brouillon par défaut / fusion par Claude /
  fusion par GitHub seul) : note « À trancher par Marc (14/10) » dans `docs/claude/workflow-git.md`.

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

## Repères techniques rapides (versions relevées dans `package.json` le 14/10)

React 19.3 + Vite 8 (Rolldown) + TypeScript 5.9 strict + Tailwind 4 (depuis #1063) · Zustand 5
(`persist`, schéma v7) · Zod 4 (depuis #1055) · Recharts 3 · Vitest 4 · `@anthropic-ai/sdk` ·
SDK MCP 1.30 · Node 24 (`.nvmrc`, `engines`) · contrat hub `@mokarade/hub-contract` épinglé sur
`v1.3.1`. Pas de `src/` : racine plate (`App.tsx`, `constants.ts`, `types.ts`…) + dossiers
`components/ hooks/ services/ store/ utils/ mcp/ api/ e2e/ tests/ scripts/ docs/`. Détail complet
et raisons des choix : `docs/ARCHITECTURE.md`.

## Où lire le détail

- `HANDOVER.md` (racine) — état daté, verbeux, session par session (section « État au 14/10/2026 » en tête).
- `BACKLOG.md` (racine) — tâches ouvertes, avec case à cocher.
- `docs/A_FAIRE_MOI.md` — actions humaines en attente (Marc).
- `docs/ARCHITECTURE.md` — stack, structure, moteur de projection.
- `docs/FISCAL_REFERENCE.md` — constantes fiscales datées et sourcées.
- `docs/CONVENTIONS.md` — leçons apprises, une par incident.
- `docs/adr/` — décisions d'architecture datées.
