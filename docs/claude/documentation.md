<!-- Extrait de CLAUDE.md, déplacé le 2026-09-26 (texte copié à l'identique, rien supprimé). Index : CLAUDE.md -->

## 8. Documentation (où vit quoi)

- `docs/CONVENTIONS.md` — **détail de tout ce qui est indexé plus bas** (leçons, pièges, rationnels)
- `BACKLOG.md` — tâches que Claude peut faire · `docs/BACKLOG_ARCHIVE.md` — items finis
- `docs/A_FAIRE_MOI.md` — tâches HUMAINES (Claude y route ses blocages)
- `HANDOVER.md` — état actuel + reprise rapide
- `docs/VISION.md` — où va le projet · `docs/adr/` — décisions verrouillées (ADR)
- `docs/FISCAL_REFERENCE.md` — valeurs fiscales : **SOURCE DE VÉRITÉ** (datée + sourcée)
- `docs/ARCHITECTURE.md`, `docs/PROJECTION.md`, `docs/PROJECTION_OUTPUT_SCHEMA.md`, `mcp/README.md`, `CHANGELOG.md`
- `docs/HISTORIQUE.md` — archive consolidée

**Reprise de session**

1. `git fetch origin main && git merge --ff-only origin/main` **AVANT de juger l'état**
   (le clone local ne se met pas à jour seul — vu 146 commits de retard).
2. Point bref lu depuis `HANDOVER.md` + `BACKLOG.md` : **Fait** / **État** /
   **Suite proposée** (+ ID) / **Planifié**.

La structure est commune aux huit dépôts — elle est fixée dans
[`conventions/STRUCTURE-DEPOT.md`](https://github.com/MoKarade/claude-config/blob/main/conventions/STRUCTURE-DEPOT.md)
du dépôt `claude-config`, et nulle part ailleurs.

⚠️ **Un fichier daté est un RÉCIT, pas une référence.** `docs/AUDIT_2026-08-12.md`,
`docs/AUDIT_FINANCIER_2026-06-17.md`, `docs/ANALYSE_APP_2026-07-15.md`,
`docs/PLAN_CHANTIERS_2026-06-19.md`… disent à quoi ils correspondaient **à leur date** et ne se
mettent pas à jour — les rafraîchir effacerait ce qui était vrai ce jour-là. Ce qui doit rester
vrai va dans un document **sans date** : `BACKLOG.md` pour le restant, `HANDOVER.md` pour l'état,
`docs/CONVENTIONS.md` pour les leçons, `docs/adr/` pour les décisions.

Nuance du déménagement du 2026-08-20 : dans ces récits, les **chemins** ont été réparés (un lien
mort n'aide personne), mais **rien de ce qu'ils affirment** n'a été rafraîchi. Réparer un pointeur
n'est pas réécrire un récit.

