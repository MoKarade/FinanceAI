---
description: Panel d'agents pertinents (en parallèle) sur le diff courant, consolidation trust-but-verify, verdict GO/NO-GO avant commit/merge.
allowed-tools: Bash, Read, Grep, Glob, Agent
---

Objectif : faire passer le **panel d'agents** de FinanceAI sur le travail courant et produire un verdict **GO/NO-GO** AVANT commit/merge. Détail des agents (rôles, modèles, exclusions) : `docs/agents.md`.

1. **Périmètre** : `git diff --stat` (working tree, AVANT commit — la branche locale est encore à `origin/main`, donc `origin/main...HEAD` serait VIDE) ou `git diff --stat main...HEAD` pour une branche déjà poussée. Liste les fichiers + domaines touchés.

2. **Sélection PAR PERTINENCE** (lancer en PARALLÈLE, en un seul message multi-Agent) :
   - **Toujours** : `code-reviewer`, `silent-failure-hunter`, **`documentation-manager`** (il met à jour `HANDOVER.md` + tous les docs touchés — non optionnel : « tout à jour à chaque push », règle Marc 2026-06-18).
   - Calcul $ / solde / flux / dette / impôt / devise / migration store → `financial-integrity`.
   - `services/projection/` ou calcul long-terme → `projection-validator`.
   - Secrets / crypto / CSP / persistance / appel LLM / vie privée (Loi 25) → `security-privacy`.
   - Appel SDK Anthropic (`services/claude.ts` + surfaces) → `ai-reviewer`.
   - Logique métier ajoutée/modifiée → `test-writer`.
   - UI notable → `a11y-auditor`.
   - (`documentation-manager` est désormais dans « Toujours » ci-dessus — il sync le handover + la doc à chaque PR.)
   - (À la demande : `performance-optimizer` pour le profilage moteur lourd ; `code-analyzer` pour la dette large.)
   N'invoque AUCUN agent hors sujet — la seule limite est la pertinence (cf CLAUDE.md).

3. **Consolidation (trust-but-verify)** : agrège tous les findings dans UN tableau dédupliqué, classé **CRITIQUE / ÉLEVÉ / MOYEN / FAIBLE**, chacun avec `fichier:ligne` · cause · impact utilisateur · correctif. ⚠️ Un finding money-critical est une **HYPOTHÈSE** (~33 % de faux positifs sur ce code) : VÉRIFIE le vrai code avant de le retenir. Marque chaque finding **retenu** ou **réfuté** (avec la raison).

4. **Verdict GO/NO-GO** : **NO-GO** s'il reste un CRITIQUE (ou un ÉLEVÉ money-critical non réfuté) → liste les correctifs requis d'abord. Sinon **GO**. Rappel : le `commit-gate` (typecheck + test + build) reste la vérif déterministe finale. Sur **GO** + gate vert, Claude gère le cycle autonome (commit → push → PR → merge squash sur `main`) ; le déploiement Vercel suit automatiquement sur `main`.

Argument optionnel : $ARGUMENTS (un chemin/domaine pour cadrer la revue).
