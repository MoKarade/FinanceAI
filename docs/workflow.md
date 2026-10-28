# Workflow des agents FinanceAI

> Comment utiliser la flotte d'agents (`docs/agents.md`) au quotidien.

## Plan-first (non négociable)
Tout changement non trivial : proposer un PLAN, attendre l'OK de Marc avant de coder. Ensuite Claude gère
le **cycle git autonome** (commit → push → PR → merge squash sur `main`, gate vert + `/review-all` requis) ;
le déploiement Vercel suit automatiquement sur `main`.

## Commandes
| Commande | Quand | Pipeline |
|---|---|---|
| `/new-feature <desc>` | au lancement d'une feature | product-manager → architect → synthèse plan (OK Marc) |
| `/review-all [domaine]` | avant chaque commit/merge | panel pertinent EN PARALLÈLE → consolidation trust-but-verify → GO/NO-GO |
| `/release-review` | avant un release/déploiement | code-reviewer → documentation-manager → ai-reviewer → build/lint/test → GO/NO-GO |
| `/audit-financier` | trimestre + release + période d'impôts | audit profond de TOUT le moteur (exceptionnel, coûteux) |

## Panel proactif (par pertinence)
Le routage est dans `docs/agents.md`. Règle : lancer **tous** les agents qui s'appliquent, **aucun hors
sujet**. La seule limite est la pertinence.

## Séquentiel vs parallèle
- `/review-all` = **parallèle** : perspectives indépendantes, rapide ; la synthèse dédup + vérifie.
- `/new-feature` et `/release-review` = **séquentiels** : un sous-agent démarre dans un contexte vierge et
  ne voit que ce qu'on lui passe → la commande transmet EXPLICITEMENT les findings d'une étape à la suivante.

## Vérité d'abord
Un finding = **HYPOTHÈSE** (~33 % de faux positifs sur le code money-critical). Vérifier le vrai code avant
de coder un fix (lecture + panel adversarial qui cherche à RÉFUTER). Un faux fix dans un moteur d'impôt est
pire que le finding non corrigé.

## Gates déterministes
Le `commit-gate` (typecheck + test + build) reste la vérif finale, indépendante des agents. Les agents
conseillent ; ils ne remplacent ni les tests ni le jugement de Marc.

## Entretien
Les agents et `docs/CONVENTIONS.md` **s'améliorent à chaque push** : un angle mort ou du bruit d'un agent
→ delta dans son fichier (et `docs/agents.md` si le rôle change), MÊME PR. Le hook `learn-on-push` le
rappelle. ⚠️ Depuis le 2026-07-31, les LEÇONS vont dans `docs/CONVENTIONS.md`, pas dans `CLAUDE.md` :
ce dernier se charge à chaque session et doit rester court — il ne reçoit qu'une LIGNE d'index quand une
classe de piège est nouvelle.
