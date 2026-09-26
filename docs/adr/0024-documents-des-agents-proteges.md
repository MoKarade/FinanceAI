# ADR — Les documents que les agents relisent au démarrage sont protégés (pole-securite, 2026-09-26)

**Statut** : proposé (PR en brouillon, `validation-marc`, non armée) ; s'applique dès la fusion.

## Contexte

Chaque session lit `CLAUDE.md`, `docs/claude/*.md`, les leçons (`docs/claude/lecons.md`, `docs/CONVENTIONS.md`) et l'état
(`HANDOVER.md`, `CHANGELOG.md`, `BACKLOG.md`). Une PR auto-fusionnée qui y glisse une « règle » ou une « leçon » piégée
(ordre de lancer une commande, de contacter une URL, d'ignorer une garde) serait appliquée par toutes les sessions suivantes :
c'est une **injection persistante**, et ces fichiers n'étaient sous aucune protection (seuls `.github/**`, `.claude/**`,
`scripts/hooks/**`, etc. l'étaient).

## Décision

1. **Attestation** (`chemins_label_validation`) : `CLAUDE.md` et tous les `docs/claude/*.md` **sauf** `lecons.md`
   (agents, chemins-sensibles, ci, commandes, conventions-code, deploiement, documentation, entete, hub, principes, style,
   verifications, workflow-git). Une PR qui en touche un n'est jamais armée. Un test dérive la liste du dossier : un nouveau
   fichier de `docs/claude/` doit y entrer.
2. **Ajouts seulement** (`chemins_ajouts_seulement`) : `docs/claude/lecons.md`, `docs/CONVENTIONS.md`, `HANDOVER.md`,
   `CHANGELOG.md`, `BACKLOG.md`. Le module `docsAjoutsSeulement.mjs` analyse le patch (statique, rien n'est exécuté) et refuse
   l'armement si : une ligne existante est supprimée ou réécrite ; une ligne ajoutée contient une URL ; une ligne ajoutée
   porte une commande exécutable (entre backticks, dans un bloc de code ajouté, ou après `$`) ; plus de 200 lignes sont
   ajoutées par PR ; le fichier est supprimé, renommé, ou son diff illisible. Refus = pas d'armement, Marc décide.
3. **Où** : `armer.mjs` (adapté FinanceAI) applique cette couche **après** `peutArmer`. La copie du modèle de l'Atelier
   (`autoMerge.mjs`) reste **exacte** ; la couche pourra être proposée au modèle de l'Atelier.
4. **Revue hebdomadaire** : pole-securite relit les ajouts de `lecons.md` et `docs/CONVENTIONS.md` de la semaine
   (`docs/A_FAIRE_MOI.md`). Pas de revue hebdomadaire pour `HANDOVER.md`, `CHANGELOG.md`, `BACKLOG.md` (journaux datés).

## Conséquences et limites

- `BACKLOG.md` : cocher une case ou archiver un item réécrit une ligne, donc exige l'attestation de Marc ; c'est le coût
  demandé. La liste est dans `.github/auto-merge.json` : la retirer d'une ligne est une décision de Marc.
- Le détecteur est **statique** : un texte piégé sans URL ni commande (une consigne en prose) passe ; d'où la revue
  hebdomadaire. Un bloc de code dont l'ouverture est dans le contexte non modifié n'est pas reconnu comme bloc.
- Ne couvre que l'**armement** : une fusion manuelle par un humain reste possible et voulue.
