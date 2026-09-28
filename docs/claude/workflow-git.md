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

### Tenue du BACKLOG (règles renforcées Marc 2026-07-31)

Au MERGE d'une PR, Claude coche lui-même les `[ID]` livrés, ajoute les découvertes, et route
les blocages humains vers `docs/A_FAIRE_MOI.md`.

- ⚠️ **CHAQUE tâche a une case `- [ ]`** — aucune puce de tâche sans case. Une note sans travail
  à faire n'est pas une tâche : elle va dans l'archive ou dans `docs/adr/`.
- ⚠️ **Item fini ET validé (mergé, gate vert) → DÉMÉNAGE vers `docs/BACKLOG_ARCHIVE.md`**
  (avec date + PR), au plus tard à la PR suivante. Le BACKLOG ne garde que le vivant.
- ⚠️ Leçon de la refonte 2026-07-31 : ~65 items étaient FAITS sans case cochée et ~128 puces
  n'avaient pas de case. Un backlog qui mélange fait et à-faire trompe le PM et la reprise de
  session (classe `PM-STALE-BACKLOG`). C'est la tenue **à chaque push** qui empêche la dérive,
  pas les grandes passes de nettoyage.

### Docs à jour à CHAQUE push

Avant le commit final, se demander « quels docs décrivent ce que je viens de changer ? » et
les mettre à jour **dans la MÊME PR** : `HANDOVER.md` (état — responsabilité keystone,
dans le « Toujours » de `/review-all`), `BACKLOG.md`, `CHANGELOG.md`, `README`, et les docs
techniques touchés (`PROJECTION*.md`, `FISCAL_REFERENCE.md`, `ARCHITECTURE.md`…). Un champ,
calcul ou valeur fiscale ajouté SANS sa doc = doc périmée qui trompe la prochaine session.

**Leçon apprise → `docs/CONVENTIONS.md`, dans le MÊME commit.** Rien appris → le dire
(« push sans leçon »), pas de skip silencieux. Une leçon notée ailleurs (chat, mémoire
harness) mais pas portée dans le dépôt est perdue à la prochaine session.

