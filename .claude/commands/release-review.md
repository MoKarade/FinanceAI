---
description: Gate de release FinanceAI — code-reviewer → documentation-manager → ai-reviewer (séquentiel, findings passés) puis synthèse GO/NO-GO + vérif build/lint/tests.
allowed-tools: Bash, Read, Grep, Glob, Agent
---

Objectif : décision **GO/NO-GO de release** (≠ `/review-all` par-commit ; ≠ `/audit-financier` qui audite tout le moteur). À lancer avant un release/déploiement notable. Pipeline **séquentiel** — passe explicitement les findings d'une étape à la suivante (chaque sous-agent démarre vierge).

Périmètre : `git diff --stat main...HEAD` (ou la plage de release visée).

1. **code-reviewer** : correction / clarté / perf générale / couverture du diff de release. Récupère ses findings.
2. **documentation-manager** : en lui PASSANT les findings de l'étape 1 (surtout les changements de comportement / champ / valeur fiscale), vérifie que `README` / `CLAUDE.md` / `docs/*` / `CHANGELOG` sont à jour. Récupère les incohérences doc↔code.
3. **ai-reviewer** : en lui passant le contexte des étapes 1-2, vérifie l'intégration SDK (prompts / coût / fallback / validation des réponses) **si** la release touche l'IA.
4. **Vérif déterministe** : lance `npm run typecheck`, `npm run lint`, `npm run test` (+ `npm run build` si pertinent). Rapporte le résultat RÉEL (pas d'optimisme : un test rouge se dit).
5. **Synthèse GO/NO-GO** (rôle ex-release-manager) : consolide tout (findings + état doc + résultat des gates), classe **CRITIQUE / ÉLEVÉ / MOYEN / FAIBLE**, et tranche **GO** (rien de bloquant + gates verts) ou **NO-GO** (liste des correctifs requis d'abord). Justifie le verdict. Renvoie à `docs/compliance.md` pour la checklist réglementaire aux jalons.

Sur **GO** (gate vert + `/review-all` fait), Claude gère le cycle complet : commit → push → PR → merge (squash sur `main`) ; le déploiement Vercel suit automatiquement sur `main`.
