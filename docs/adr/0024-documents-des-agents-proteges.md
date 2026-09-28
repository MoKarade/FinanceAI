# ADR — Les documents que les agents relisent au démarrage sont protégés (pole-securite, 2026-09-26)

**Statut** : proposé (PR en brouillon, `validation-marc`, non armée) ; s'applique dès la fusion.

## Contexte

Chaque session lit `CLAUDE.md`, `docs/claude/*.md`, les leçons (`docs/claude/lecons.md`, `docs/CONVENTIONS.md`) et l'état
(`HANDOVER.md`, `CHANGELOG.md`, `BACKLOG.md`). Une PR auto-fusionnée qui y glisse une « règle » ou une « leçon » piégée
(ordre de lancer une commande, de contacter une URL, d'ignorer une garde) serait appliquée par toutes les sessions suivantes :
c'est une **injection persistante**, et ces fichiers n'étaient sous aucune protection (seuls `.github/**`, `.claude/**`,
`scripts/hooks/**`, etc. l'étaient).

## Décision

1. **Attestation** (`chemins_label_validation`, levée par `attestationValide`) : `CLAUDE.md` et tous les `docs/claude/*.md` **sauf** `lecons.md`
   (agents, chemins-sensibles, ci, commandes, conventions-code, deploiement, documentation, entete, hub, principes, style,
   verifications, workflow-git). Une PR qui en touche un n'est jamais armée. Un test dérive la liste du dossier : un nouveau
   fichier de `docs/claude/` doit y entrer.
2. **Ajouts seulement** (`chemins_ajouts_seulement`, règle STRICTE) : `docs/claude/lecons.md`, `docs/CONVENTIONS.md` seulement.
   Le module `docsAjoutsSeulement.mjs` analyse le patch (statique, rien n'est exécuté) et refuse l'armement si : une ligne
   EXISTANTE est supprimée ou réécrite ; une ligne ajoutée contient une URL ; une ligne ajoutée porte une commande exécutable
   (entre backticks, dans un bloc de code ajouté, ou après `$`) ; plus de 200 lignes sont ajoutées par PR (tous fichiers listés
   confondus) ; le fichier est supprimé, renommé, ou son diff illisible. Refus = pas d'armement, Marc décide.
3. **Contenu surveillé** (`chemins_contenu_surveille`, règle SOUPLE) : `HANDOVER.md`, `CHANGELOG.md`, `BACKLOG.md`. Mêmes
   contrôles que ci-dessus sur les lignes AJOUTÉES (URL, commande, plafond), mais supprimer ou réécrire une ligne existante est
   **admis sans attestation** (cocher une case, archiver un item, corriger une date) : ce sont des journaux d'état, pas des
   règles relues comme consignes.
4. **Où** : `modeles/auto-merge/armer-docs.mjs` (point d'entrée du workflow, écart d'une ligne au gabarit — `armer.mjs` devient
   `armer-docs.mjs` dans `.github/workflows/armement-auto-merge.yml`, déclaré dans `COPIES.md` avec les deux empreintes) applique
   cette couche **avant** l'`armer.mjs` du modèle, qui reste une **copie exacte** (il n'offre aucun crochet) ; les deux doivent dire oui.
   Un refus (des deux règles ci-dessus, ou d'un chemin sous attestation) est **attestable** : `attestationValide` du modèle (compte
   dédié `securite_login`, SHA exact de la PR, `securite_user_id`) — actif depuis la fusion de la PR d'attestation (#1086).
5. **Revue hebdomadaire** : pole-securite relit les ajouts de `lecons.md` et `docs/CONVENTIONS.md` de la semaine
   (`docs/A_FAIRE_MOI.md`). Pas de revue hebdomadaire pour `HANDOVER.md`, `CHANGELOG.md`, `BACKLOG.md` (journaux datés).

## Conséquences et limites

- `BACKLOG.md`/`HANDOVER.md`/`CHANGELOG.md` sont en **contenu surveillé**, pas en ajouts seulement : cocher une case ou archiver
  un item passe SEUL (aucune attestation requise) ; seule une ligne AJOUTÉE avec une URL, une commande, ou un dépassement du
  plafond de 200 lignes déclenche le refus attestable. Le coût demandé à Marc reste donc ciblé sur le cas réellement suspect.
- `docs/claude/lecons.md` et `docs/CONVENTIONS.md` sont eux en **ajouts seulement** (strict) : toute ligne existante réécrite y
  exige l'attestation. La liste est dans `.github/auto-merge.json` : la déplacer d'une catégorie à l'autre est une décision de Marc.
- Le détecteur est **statique** : un texte piégé sans URL ni commande (une consigne en prose) passe ; d'où la revue
  hebdomadaire. Un bloc de code dont l'ouverture est dans le contexte non modifié n'est pas reconnu comme bloc.
- Ne couvre que l'**armement** : une fusion manuelle par un humain reste possible et voulue.
- Le kit 1.9.1 désarme les PR Dependabot avant la carence (`carence_dependabot_jours`, accepté par pole-securite) : elles ne
  passent pas par cette couche.
