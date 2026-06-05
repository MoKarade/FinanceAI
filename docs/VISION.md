# VISION — où va FinanceAI

> Le « nord » du projet. Sert à trancher les arbitrages : si une tâche ne sert pas
> cette vision, elle attend. Tâches concrètes : `docs/BACKLOG.md`. Actions humaines :
> `docs/A_FAIRE_MOI.md`.

## En une phrase
Le **planificateur de finances personnelles et de retraite de référence pour le Québec** :
local-first, privé par défaut, fiscalement exact, et **pilotable par Claude** — au niveau
de qualité d'une « triple AAA company ».

## Principes directeurs (ce qui ne change pas)
- **Local-first, sans backend obligatoire** : les données vivent dans le navigateur +
  le Google Drive de l'utilisateur. Zéro SaaS payant récurrent imposé.
- **Privé par défaut** : PII financière chiffrée au repos, clés API jamais exposées,
  mode privé (masquage) jusque pour les lecteurs d'écran.
- **Exactitude fiscale QC/Canada** : chaque chiffre sourcé + daté (`FISCAL_REFERENCE.md`),
  jamais bâclé. C'est l'avantage défendable vs les outils génériques.
- **No-fake-data** : on n'affiche que de vraies valeurs calculées, ou un état vide honnête.
- **Future = source unique** : tout le long-terme dérive d'une seule projection.
- **Agent-native** : l'app est aussi un outil que Claude opère (MCP) — lecture des finances
  + dépôt de documents (paie, relevés) rangés automatiquement.

## Cap produit (ordre indicatif)
1. **Passer de « solo » (~90 %) à « vrai produit multi-utilisateurs »** (~72 % aujourd'hui) :
   prouver la sync Drive en réel, auth Google in-app (sortir de Cloudflare), proxy clé
   Anthropic. (cf `A_FAIRE_MOI` O1/O3/O4.)
2. **Connecteur Claude grand public** : `.mcpb` hébergé, install 1 clic, ouverture bêta
   (vérification Google `drive.appdata`). (cf `A_FAIRE_MOI` O2.)
3. **Qualité AAA transversale** (audit `docs/AAA_AUDIT_2026-06.md`) : robustesse (ne jamais
   avaler une erreur), a11y, design system tokenisé, perf de boot, découpe des god-files.
4. **Exactitude fiscale continue** : attribution par conjoint complète (timing FERR/PSV),
   indexation nominale propre, revue annuelle du barème.

## Hors périmètre (sauf décision explicite de Marc)
- Backend de données / multi-device temps réel lourd (au-delà du blob Drive).
- Tout service payant récurrent. Conseil en placement réglementé.
- Fiscalité hors Québec/Canada.
