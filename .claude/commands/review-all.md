---
description: Lance le panel d'agents pertinents en parallèle sur le diff courant, puis synthétise (gate avant commit/merge).
allowed-tools: Bash, Read, Grep, Glob, Agent
---

Objectif : faire passer le **panel d'agents** de FinanceAI sur le travail courant et produire une
synthèse go/no-go AVANT commit/merge.

1. Établis le périmètre : `git diff --stat main...HEAD` (ou `git diff --stat` si pas de branche)
   pour voir les fichiers et domaines touchés.

2. Sélectionne les agents PAR PERTINENCE (lance en PARALLÈLE, en un seul message multi-outils) :
   - **Toujours** : `code-reviewer`, `silent-failure-hunter`.
   - Diff touche secrets/crypto/CSP/persistance/appels LLM → `security-reviewer`.
   - Logique métier ajoutée/modifiée → `test-writer`.
   - `services/projection/` ou calcul long-terme → `projection-validator` ET `performance-optimizer`.
   - Constante ou logique fiscale → `fiscal-accuracy`.
   - UI notable → `a11y-auditor`.
   - (Audit large / dette → `code-analyzer`, sur demande seulement.)
   N'invoque AUCUN agent hors sujet — la seule limite est la pertinence (cf CLAUDE.md).

3. Synthétise les retours en un tableau unique classé **[BLOCKER] / [MAJEUR] / [MINEUR]**, dédupliqué,
   chaque finding avec `fichier:ligne` et le correctif proposé. Applique le `trust-but-verify` :
   vérifie rapidement tout finding douteux avant de le retenir (des agents sur-évaluent parfois).

4. Conclus par un verdict explicite : **prêt à committer/merger** (aucun BLOCKER) ou **liste des
   correctifs requis d'abord**. Rappel : le `commit-gate` (typecheck+test+build) reste la vérif
   déterministe finale.

Argument optionnel : $ARGUMENTS (ex. un chemin/domaine pour cadrer la revue).
