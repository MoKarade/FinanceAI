---
description: Audit financier COMPLET et récurrent (panel 5 agents sur tout le moteur) → rapport daté + findings au BACKLOG. À relancer périodiquement pour valider/peaufiner.
allowed-tools: Bash, Read, Grep, Glob, Agent, Write, Edit
---

Objectif : relancer l'**audit financier exhaustif** de FinanceAI (demande Marc 2026-06-17 : « lancer
régulièrement pour valider et peaufiner à chaque passage »). Différent de `/review-all` (qui audite le DIFF
courant) : ici on audite **tout le moteur financier sur `main`**, on PROUVE la conservation empiriquement, et
on produit un rapport daté comparable d'une passe à l'autre.

Cadence recommandée : **1×/trimestre** ET avant un release majeur ET 1×/période d'impôts (avec `fiscal-accuracy`).

## 1. État de base (résilience cloud)
`git fetch origin main` + `git merge --ff-only origin/main` AVANT de juger (le clone local peut être périmé).
Note le commit audité. `npm install` si `node_modules` manque.

## 2. Panel adversarial — lancer les 5 agents EN PARALLÈLE (un seul message multi-outils)
Brief chacun de **réfuter, pas valider** ; rappeler « findings = hypothèses, ~33 % de faux positifs money-critical » :
- **`fiscal-accuracy`** — toute constante/logique fiscale vs `docs/FISCAL_REFERENCE.md` (paliers féd/QC, BPA,
  RRQ/MGA/MGAS, PSV/clawback, SRG, CELI/REER/CELIAPP/RAP/REEE, retenues, FERR, gains, taxe bienvenue). Verdict
  par valeur : ✅ conforme / ❌ écart / ⚠️ non sourcé / 🕰️ périmé + `file:line`.
- **`projection-validator`** — conservation EMPIRIQUE sur ~25 scénarios (jeune, couple+enfants+objectifs,
  retraités REER ample/modeste/épuisé/insolvable, immigrant, immo+Smith, dettes, meltdown, inflation 0-7 %,
  avenirs de stress). **Arbitre = forme-bilan** `ΔNW == ΔΣactifs − ΔΣdettes` (+ ΔÉquité_immo), PAS la forme
  `ΔNW − (épargne+croissance−impôt)` qui faux-positive sur les flux one-time. Symétrie per-conjoint, unités, NaN.
- **`code-analyzer`** — dette de la logique financière : duplication de formules (copies de `computeRawNetWorth`),
  magic numbers fiscaux hors `utils/tax.ts`, trous de tests money-critical, **incohérences moteur↔UI/IA**
  (consommateurs qui recalculent au lieu de la source unique = classe de bug récurrente).
- **`silent-failure-hunter`** — échecs avalés sur tout le chemin $ : `catch{}`, `|| fallback` masquant (PV-5),
  NaN/Infinity non gardés, débits qui s'évaporent, clamps cachant un négatif anormal.
- **`security-reviewer`** — données financières au repos : chiffrement (AES-GCM/PBKDF2), secrets exclus des
  backups/exports, migrations Zustand, fuite vers le LLM/logs, CSP, anti-injection des prompts.

## 3. Vérifier CHAQUE finding (trust-but-verify)
Avant inscription : relire le VRAI code (`file:line`). Un finding réfuté est CONSERVÉ (il documente pourquoi
ce n'est PAS un bug). Pour un finding money-critical, prouver discriminant (`git stash` du fix → le test échoue).

## 4. Produire le rapport daté
`docs/AUDIT_FINANCIER_<YYYY-MM-DD>.md` (modèle : `docs/AUDIT_FINANCIER_2026-06-17.md`) : résumé exécutif +
méthodo + diagrammes Mermaid (flux système, boucle 9 phases, cascade décaissement, reconstruction NW,
invariant-arbitre) + findings par gravité (vérifiés) + limites assumées + recommandations + scorecard par axe.
Comparer au rapport précédent (« peaufiner à chaque passage » : les findings fermés deviennent des garde-fous).

## 5. Router les findings
- Tout finding actionnable → entrée `docs/BACKLOG.md` (ID, gravité, `file:line`, fix, effort).
- Findings réfutés / limites assumées → `docs/FISCAL_REFERENCE.md` §9 ou commentaire code (traçabilité).
- Leçon de méthode/convention → delta `CLAUDE.md` (même PR).

## 6. Conclure
Verdict explicite (cœur sain ? findings périphériques ?) + lot de corrections proposé (plan-first si code
money-critical). Le `commit-gate` (typecheck+test+build) reste la vérif déterministe.

Argument optionnel : $ARGUMENTS (ex. un axe à approfondir : `fiscal`, `conservation`, `securite`).
