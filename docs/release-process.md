# Processus de release FinanceAI

> Décision **GO/NO-GO** avant un release/déploiement notable. Le push et le déploiement Vercel restent sous
> le contrôle **exclusif de Marc**.

## Étapes
1. **Branche & diff** : travail sur `claude/<slug>` ; `git diff --stat main...HEAD` = périmètre de release.
2. **`/release-review`** : code-reviewer → documentation-manager → ai-reviewer (findings passés d'une étape à
   la suivante), puis `npm run typecheck` + `npm run lint` + `npm run test` (+ `npm run build` si pertinent),
   puis synthèse **GO/NO-GO** (rôle ex-release-manager).
3. **Conformité aux jalons** : passer `docs/compliance.md` si la release touche données / fiscalité / sécurité.
4. **commit-gate** : à chaque commit, typecheck + test + build doivent passer (déterministe, indépendant des agents).
5. **Cycle autonome** : sur un GO (gate vert + `/review-all`), Claude gère commit → push → PR → merge (squash sur `main`) ; le push sur `main` déclenche le déploiement Vercel.

## Verdict
- **GO** : aucun finding CRITIQUE non réfuté + tous les gates verts + doc à jour.
- **NO-GO** : au moins un bloquant → liste des correctifs requis d'abord, puis on relance le gate.

## À ne PAS faire
- Pas de `/full-audit` en routine (coûteux). L'audit profond du moteur = `/audit-financier`, à cadence
  **trimestre + release + période d'impôts**.
- Jamais `--no-verify` ; jamais de push DIRECT sur `main` (toujours via branche `claude/<slug>` + PR + merge squash).
