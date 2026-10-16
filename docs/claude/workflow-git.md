<!-- Extrait de CLAUDE.md, déplacé le 2026-09-26 (texte copié à l'identique, rien supprimé). Index : CLAUDE.md -->

## 3. Workflow git

- **Cadrage, plan et exécution : voir la convention commune** (§7, chargée par la §10 de ce
  fichier). Elle porte désormais la règle qui est NÉE ici — « plan d'abord, toutes les
  questions d'un coup, OK avant de coder, puis exécution continue sans arrêt en pleine tâche ».
  Marc l'a étendue aux neuf dépôts le 21/08/2026 plutôt que de la supprimer : elle protégeait
  du code money-critical, elle protège maintenant partout. Écrite ici ET là-bas, elle aurait
  divergé — c'est le problème qu'on vient de régler.
- **Proposer ≠ faire** : jamais de scope que Marc n'a pas demandé. Ici, le rappel vaut aussi
  pour l'arrêt : on s'arrête après un merge confirmé VISUELLEMENT, ou sur une vraie question
  bloquante — pas sur « je vais faire X ».
- **Qualité d'abord, coût tokens NON contraint** : voir §10, « Propre à ce dépôt ». La règle
  est intacte ; ce qui a été ajouté, c'est qu'elle porte sur l'EFFORT et non sur le volume écrit.

### Cycle git (autonome, de bout en bout)

Branche `claude/<slug>` → commits français préfixés par l'ID (`[A12a] desc`) → push → PR
(draft par défaut) → **Claude merge lui-même** (squash sur `main`). Le push sur `main`
déclenche le déploiement Vercel : Claude en est responsable (choix Marc).

- ⚠️ **Une branche par PR, jamais de branche de session réutilisée** (type `claude/progress-check-*`)
  — règle adoptée par le gérant de l'agence le 2026-09-29. Une branche de session qui porte le
  travail de plusieurs PR mélange leurs historiques : la PR `[EXPORT-JSON-PERD-FINTABLE]` (#1065)
  vivait sur `claude/progress-check-yua8yy` et a dû être reprise sur une branche dédiée.
- ⚠️ **Ne PAS fractionner le cycle sur plusieurs tours.** `git add && git commit && git push`
  chaînés en UN SEUL appel Bash, puis PR + auto-merge dans le MÊME tour. Un cycle étalé laisse
  un état à moitié fait dès qu'un tour est interrompu (commits poussés SANS PR = rien
  n'atterrit sur `main`, et la reprise croit que c'est fait). Si des commits sont déjà poussés
  sans PR : créer la PR IMMÉDIATEMENT depuis l'existant — jamais re-committer le même travail.
- **Merge sans attente active** : `enable_pr_auto_merge` (squash) après gate vert + `/review-all`.
  Pas de `sleep` pour surveiller la CI.
- ⚠️ **Tout commit (doc/leçon/handover) DOIT être inclus AVANT d'armer l'auto-merge** : une PR
  légère peut merger en SECONDES, et un push de rattrapage arrive alors sur une branche déjà
  supprimée → commit ORPHELIN absent de `main`.
- ⚠️ Hors ce cycle, toute action **destructive/irréversible** (`--force`, `reset --hard`, `rm`,
  migration de données, réécriture d'historique) → **confirmer avec Marc d'abord**.
- **Réconciliation post-merge** : après un squash-merge, GitHub supprime la branche →
  `git checkout -B <branche> origin/main` (après avoir confirmé `git status --porcelain` vide).
  Ne JAMAIS pousser un commit de merge vide.

### Backlog : les issues du dépôt (depuis le 2026-10-15)

Le backlog vit dans les **issues** du dépôt (`niveau:tâche`, avec Avant / Après / Fini quand) ; `BACKLOG.md` n'est
qu'un renvoi de 20 lignes au plus (plan de standardisation, grille de conformité ligne 11 ; garde :
`tests/backlogArchivageDesCoches.test.ts`). Une PR porte `Tâche : #n`, jamais `Closes` : la tâche se ferme par la
preuve « Acceptée » sur l'issue. Les blocages humains vont dans `docs/A_FAIRE_MOI.md`.

L'ancienne liste (règles « case `- [ ]` », archivage vers `docs/BACKLOG_ARCHIVE.md`, leçon `PM-STALE-BACKLOG`) est
figée dans `docs/BACKLOG_AVANT_ISSUES_2026-10-15.md` : les lignes « Source : BACKLOG.md:Lnn » des issues y renvoient.

### Docs à jour à CHAQUE push

Avant le commit final, se demander « quels docs décrivent ce que je viens de changer ? » et
les mettre à jour **dans la MÊME PR** : `HANDOVER.md` (état — responsabilité keystone,
dans le « Toujours » de `/review-all`), `CHANGELOG.md`, `README`, et les docs
techniques touchés (`PROJECTION*.md`, `FISCAL_REFERENCE.md`, `ARCHITECTURE.md`…). Un champ,
calcul ou valeur fiscale ajouté SANS sa doc = doc périmée qui trompe la prochaine session.

**Leçon apprise → `docs/CONVENTIONS.md`, dans le MÊME commit.** Rien appris → le dire
(« push sans leçon »), pas de skip silencieux. Une leçon notée ailleurs (chat, mémoire
harness) mais pas portée dans le dépôt est perdue à la prochaine session.

