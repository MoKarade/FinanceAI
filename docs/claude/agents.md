<!-- Extrait de CLAUDE.md, déplacé le 2026-09-26 (texte copié à l'identique, rien supprimé). Index : CLAUDE.md -->

## 11. Agents & automatisation

Agents et hooks : voir `.claude/` et la section correspondante de `docs/CONVENTIONS.md`.
Les agents ECC sont en anglais → **répondre à Marc en français** quoi qu'il arrive.
En conflit entre une règle ECC et les règles ci-dessus, **celles-ci prévalent**.

⚠️ **Committer (et POUSSER dès que la branche est libre) avant TOUTE attente longue** — panel
d'agents, suite de tests, CI : un revert de conteneur pendant l'attente efface un lot entier
non commité, stash compris (vécu 2×, dont le Lot 1 REFONTE-NAV pendant `npm run test`).
