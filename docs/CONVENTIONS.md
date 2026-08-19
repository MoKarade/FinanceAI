# CONVENTIONS — FinanceAI (version détaillée)

> **Ce fichier est l'ancien `CLAUDE.md` dans son INTÉGRALITÉ**, déplacé ici le 2026-07-31.
> Aucune ligne n'a été supprimée : ce qui suit est le texte complet, verbatim.
>
> **Pourquoi ce déplacement.** `CLAUDE.md` se charge à CHAQUE session. Il avait atteint
> 1 799 lignes (~36 500 tokens) alors que son propre en-tête annonçait « Fichier dense et
> **court** (il se charge à chaque session = coûte des tokens) ». L'intention était juste,
> la dérive a gagné. Ça se payait deux fois : en tokens à chaque démarrage, et en ATTENTION
> — dans 36 000 tokens de règles, les plus importantes se noient.
>
> **Ce qui est resté dans `CLAUDE.md`** : l'opérationnel de chaque session (protocole de
> reprise, cycle git, tenue du BACKLOG, gate, commandes) + les non-négociables + un INDEX
> des classes de pièges, avec un pointeur vers ce fichier.
>
> **Ce fichier reste la référence de détail.** Chaque leçon ci-dessous a été payée par un vrai
> bug. Quand une tâche touche un domaine listé dans l'index de `CLAUDE.md`, LIRE la section
> correspondante ici AVANT de coder — c'est le mode d'emploi prévu, pas une archive morte.
>
> ⚠️ **Le texte ci-dessous est figé au moment du déplacement.** Là où il contredit `CLAUDE.md`,
> c'est `CLAUDE.md` qui fait foi — notamment son en-tête (« ~2330 tests Vitest » était déjà
> faux : le compte MESURÉ le 2026-07-31 est de **3 443 tests sur 299 fichiers**) et la carte des
> docs, qui inclut désormais ce fichier-ci. Les LEÇONS, elles, restent valides telles quelles.

---

# FinanceAI — CLAUDE.md

App perso de planif financière (fiscalité ARC + Revenu Québec, Monte Carlo retraite,
assistant Claude). 100 % navigateur, pas de backend. TS strict, ~2330 tests Vitest.
Tout en français.

Fichier dense et court (il se charge à chaque session = coûte des tokens).
Doc détaillée dans `docs/`, qui fait foi.

## Système de docs (qui sert à quoi)
- `docs/BACKLOG.md`          — tâches que CLAUDE peut faire (schéma + règles ci-dessous)
- `docs/A_FAIRE_MOI.md`      — tâches HUMAINES (Claude y ajoute ses blocages)
- `docs/SESSION_HANDOVER.md` — état actuel de l'app + reprise rapide
- `docs/VISION.md`           — où va le projet (futur)
- `docs/FISCAL_REFERENCE.md` — valeurs fiscales : SOURCE DE VÉRITÉ (datée + sourcée)
- `docs/ARCHITECTURE.md`, `docs/PROJECTION.md`, `docs/PROJECTION_OUTPUT_SCHEMA.md`, `mcp/README.md`, `CHANGELOG.md`
- `docs/HISTORIQUE.md`       — archive consolidée (snapshots, audits, designs livrés, ADRs, plans finis ;
  réduction 2026-06-11 : 47→9 fichiers docs/). Git garde l'historique fin par fichier.

## Réponses & reprise de session
- Réponses **structurées** : résumé/essentiel d'abord, puis le détail (titres courts, listes). Expliquer
  le POURQUOI (pas juste le comment) et proposer les prochaines étapes. Pour un choix : donner plusieurs
  options (le bon/le mauvais de chacune) PUIS ta reco. **Vérifier avant d'affirmer** ; jamais de réponse
  fausse (si pas sûr, le dire) ; vérifier un fait avancé par Marc avant de construire dessus, et le corriger
  si faux. Étiqueter toute affirmation non-triviale ET tes recommandations :
  [Certain] / [Probable] / [Supposition] / [À vérifier] — pas de label sur l'évident.
- **Date + heure en tête de CHAQUE réponse** (règle Marc 2026-06-10) : commencer par
  `[YYYY-MM-DD HH:MM UTC]` (via `date`) — toujours, sans exception.
- **PAS d'emojis dans le chat** sauf demande explicite (docs/commits en contiennent, OK).
  Français toujours, tutoiement, ton direct et technique.
- **À CHAQUE reprise de chat**, d'abord `git fetch origin main` + `git merge --ff-only origin/main`
  AVANT de juger l'état (le clone local du PC ne se met PAS à jour seul — vu 146 commits de retard
  le 2026-06-15 : des PR/symboles crus « absents » étaient déjà sur origin). Puis un point bref (lu
  depuis `docs/SESSION_HANDOVER.md` + `docs/BACKLOG.md`) :
  1. **Fait** — terminé depuis la dernière fois
  2. **État** — build/tests, chantiers ouverts
  3. **Suite proposée** — prochaine étape recommandée (+ ID)
  4. **Planifié** — ce qui est déjà prévu après (IDs)

## Workflow (validé)
- **Plan d'abord, TOUJOURS** : avant une tâche non triviale, poser TOUTES les questions de cadrage d'un
  coup (un seul batch) — y compris la définition de « fini » (objectif exact + critère d'arrêt) — puis
  proposer un plan court et attendre l'OK avant de coder. **Proposer ≠ faire** : ne JAMAIS ajouter une
  fonctionnalité ou un scope que Marc n'a pas demandé.
- **Git — cycle autonome** : Claude gère le cycle COMPLET. Branche `claude/<slug>`
  → commits en français **préfixés par l'ID** (`[A12a] desc`), gated → `git push`
  → PR (draft par défaut) → **Claude merge lui-même** (squash sur `main`) une fois
  le gate vert et `/review-all` fait. Le push sur `main` déclenche le déploiement
  Vercel : Claude en est responsable (choix de Marc, 2026-06 — plus de gate humain ;
  RECONFIRMÉ 2026-06-19 : commit→push→PR→merge AUTONOME, malgré « push si demandé » du
  bloc Préférences global — c'est CE cycle qui prévaut pour FinanceAI).
  ⚠️ **Ne PAS fractionner le cycle sur plusieurs tours** (leçon 2026-07-07, Marc : « ya un bug quand tu commit et push ») :
  un cycle étalé (commit au tour N, push au tour N+1, PR au tour N+2) laisse un état À MOITIÉ FAIT dès qu'un tour est
  interrompu (des commits poussés SANS PR = rien n'atterrit sur `main`, la reprise croit « c'est fait »). Faire commit+push
  en UN SEUL appel Bash atomique (`git add && git commit && git push` chaînés), puis créer la PR + armer l'auto-merge dans
  le MÊME tour. Si des commits sont déjà poussés sans PR (après reprise/interruption) : créer la PR IMMÉDIATEMENT depuis
  l'existant — JAMAIS re-committer le même travail. ⚠️ Hors ce cycle,
  toute action DESTRUCTIVE/irréversible (`--force`/force-push, `reset --hard`, `rm`,
  `drop`/migration de données, réécriture d'historique git) → CONFIRMER avec Marc d'abord.
- **NE PAS s'arrêter en pleine tâche** (règle Marc 2026-06-15, NON négociable) : une fois lancé,
  Claude va **jusqu'au bout sans rendre la main** — chaque tour DOIT contenir des appels d'outils
  tant que la tâche n'est pas finie ; JAMAIS de prose « je vais faire X » suivie d'un arrêt (exécuter
  X dans le MÊME tour). **On ne s'arrête qu'APRÈS un merge confirmé VISUELLEMENT** (réponse de merge
  `merged:true` + `origin/main` contient le commit), ou pour une vraie question bloquante à Marc.
  Mécanisme = cette règle comportementale, à suivre STRICTEMENT. Un filet automatique (Stop hook qui
  bloquerait l'arrêt tant qu'il reste des changements non commités/non poussés) est possible, mais son
  enregistrement dans `.claude/settings.json` est bloqué par sécurité (boucle d'auto-relance) → à activer
  uniquement sur accord EXPLICITE de Marc.
- **Merge SANS attente active** : après `/review-all` + gate vert → push → PR ready →
  **`enable_pr_auto_merge` (squash)** : GitHub merge tout seul dès la CI verte. PAS de timers
  `sleep` pour « surveiller » la CI (c'était ~7 min d'inactivité par PR). Vérifier le merge au
  point de contrôle suivant. Échec CI réel → le webhook réveille la session de toute façon.
  (Pré-requis repo : Settings → General → « Allow auto-merge » coché.)
  ⚠️ **Tout commit (doc/leçon/handover) DOIT être inclus AVANT d'armer l'auto-merge** (leçon 2026-06-23,
  BUDGET-DONUT-SVG-ARIA) : une PR à changeset léger (docs/.md, ou .ts sans CI lourde) peut merger en SECONDES
  après `enable_pr_auto_merge` → un `git push` de rattrapage arrive sur une branche DÉJÀ mergée que GitHub a
  auto-supprimée → push « [new branch] » qui RE-CRÉE la branche avec un commit ORPHELIN **absent de main**
  (le rappel `learn-on-push` qui pousse à MAJ le handover « avant ce push » tombe pile dans ce piège). Donc :
  finir TOUS les docs (CLAUDE.md, handover, BACKLOG, CHANGELOG) AVANT le commit final, PUIS armer l'auto-merge.
  Si un commit s'est orpheliné : branche fraîche depuis `origin/main` (à jour) + ré-appliquer l'edit + petite PR.
- ⚠️ **Une PR bloquée en `blocked` avec du code SAIN, c'est peut-être la FILE, pas le code**
  (leçon 2026-08-06, PR #574) : les checks sont restés **en file 15 minutes** puis ont été
  **ANNULÉS** par GitHub Actions — `conclusion: "cancelled"`, pas `"failure"`. Or **l'auto-merge ne
  se déclenche JAMAIS sur un check annulé** : il attend indéfiniment, sans rien signaler, et le
  webhook « échec CI » ne part pas non plus puisqu'il n'y a pas eu d'échec. La PR a stagné 40 min.
  **Diagnostic** : lire `conclusion` de chaque check, pas seulement `status`. `cancelled` et
  `failure` demandent des réactions OPPOSÉES — l'un se relance tel quel, l'autre exige un correctif.
  **Déblocage** : `mcp__github__actions_run_trigger` / `rerun_workflow_run` sur les runs concernés
  (⚠️ un run CodeQL annulé peut refuser le retry avec un 403 « cannot be retried » — sans gravité
  s'il n'est pas dans les checks REQUIS du ruleset ; vérifier lesquels le sont avant de s'en inquiéter).
- ⚠️ **« Mergé » ne veut PAS dire « déployé »** (leçon 2026-08-06, #574) : la PR a bien atterri sur
  `main` (`ed5a7d1`) et Vercel n'a créé **AUCUN déploiement de production** dans la demi-heure
  suivante — `latestDeployment` restait la PREVIEW du commit de branche (`target: null`).
  **Vérifier `latestDeployment.target === 'production'` ET le SHA. Ne JAMAIS déduire la mise en
  ligne du merge**, et le dire à Marc plutôt que d'annoncer un déploiement qui n'a pas eu lieu.
  ⚠️ **Et se méfier de sa PREMIÈRE explication** : j'ai d'abord attribué ça au quota du plan gratuit
  (100/jour, effectivement épuisé plus tôt le même jour). **Hypothèse RÉFUTÉE dix minutes plus tard**
  — Vercel a construit sans broncher la preview de la PR suivante. Le quota n'y était pour rien ;
  le plus probable est un webhook de déploiement MANQUÉ sur ce push précis (les merges précédents du
  même jour avaient bien produit leur production). Une cause plausible et non vérifiée reste une
  supposition : l'étiqueter comme telle, et la corriger dès qu'un fait la contredit.
- **Pourquoi un merge prend ~10 min quand même** : commit-gate local (typecheck+tests+build
  ≈ 5 min si `.ts/.tsx` stagés) PUIS la même suite en CI (≈ 5 min) — redondant mais voulu
  (gate = filet local, CI = vérité partagée). Pour raccourcir, l'option serait un gate allégé
  (typecheck+build+tests `related` seulement) avec la suite complète en CI — décision Marc.
- **CLAUDE.md s'améliore À CHAQUE PUSH** (règle Marc 2026-06-09, renforcée 2026-06-15) : étape
  OBLIGATOIRE du cycle de push — se demander explicitement « qu'ai-je appris ? » (bug d'infra,
  convention découverte, leçon, décision, piège) AVANT le commit final. Leçon → delta ciblé dans la
  section pertinente, **dans le MÊME commit/PR** (jamais de réécriture, juste le delta). Rien appris →
  le dire (« push sans leçon ») au point de contrôle, pas de skip silencieux. ⚠️ Une leçon notée
  ailleurs (chat, mémoire harness) mais PAS portée ici = perdue à la prochaine session.
- **TOUTE la doc concernée s'améliore à CHAQUE PUSH** (règle Marc 2026-06-17) : pas seulement CLAUDE.md —
  AVANT le commit final, se demander « quels docs décrivent ce que je viens de changer ? » et mettre à jour
  TOUS les documents touchés, dans la MÊME PR : `README` (features/usage), `docs/BACKLOG.md` (cocher les ID
  livrés + découvertes), `docs/SESSION_HANDOVER.md` (état), `CHANGELOG.md`, et les docs TECHNIQUES concernés
  (`PROJECTION.md`, `PROJECTION_OUTPUT_SCHEMA.md`, `FISCAL_REFERENCE.md`, `ARCHITECTURE.md`…). Un champ/calcul/
  règle/valeur fiscale ajouté SANS sa doc = doc périmée qui trompe la prochaine session (la doc « fait foi »).
  ⚠️ **`SESSION_HANDOVER.md` est la responsabilité KEYSTONE de l'agent `documentation-manager`** (renforcé Marc
  2026-06-18, après 6 PR mergées sans MAJ du handover) : il est désormais dans le « Toujours » de `/review-all` →
  il met à jour le bandeau de tête + la table §1 à CHAQUE PR, pas seulement « quand on y pense ». Le hook
  `learn-on-push` le rappelle (point 3). Le handover n'est PAS optionnel : c'est l'état que LIT la prochaine session.
- **Backlog tenu par Claude** (l'Action `backlog-autocheck` a été RETIRÉE — choix Marc 2026-06-09 ;
  règles RENFORCÉES Marc 2026-07-31) :
  au moment du MERGE d'une PR, Claude coche lui-même les `[ID]` livrés dans `docs/BACKLOG.md`
  (dans la PR même ou la suivante), ajoute les découvertes, et route les blocages humains
  vers `docs/A_FAIRE_MOI.md`. Fin de session : BACKLOG + SESSION_HANDOVER à jour = partie du travail.
  ⚠️ **CHAQUE tâche du BACKLOG a une case `- [ ]`** — aucune puce de tâche sans case (une note sans
  travail à faire n'est pas une tâche : archive ou decisions.md). ⚠️ **Item fini + validé (mergé,
  gate vert) → DÉMÉNAGE vers `docs/BACKLOG_ARCHIVE.md`** (avec date + PR), au plus tard à la PR
  suivante — le BACKLOG ne garde que le vivant. ⚠️ Leçon de la refonte 2026-07-31 : ~65 items étaient
  FAITS sans case cochée et ~128 puces n'avaient pas de case — un backlog qui mélange fait/à-faire
  trompe le PM et la reprise de session (classe PM-STALE-BACKLOG) ; c'est la tenue À CHAQUE push qui
  empêche la dérive, pas les grandes passes de nettoyage.
  ⚠️ **`MERGE-MARKERS-IN-MAIN` (2026-08-14) — le gate NE LIT PAS les `.md`, donc il ne les protège
  pas.** La PR #622 a livré sur `main` des marqueurs de conflit NON RÉSOLUS, committés en clair dans
  `CHANGELOG.md` (2 blocs) et `docs/BACKLOG.md` (1 bloc DÉSÉQUILIBRÉ : deux `<<<<<<<` pour un seul
  `>>>>>>>`). Ils y ont vécu plus d'une journée. Le gate était VERT tout du long — et c'est logique :
  `typecheck`, `lint`, `test` et `build` ne lisent aucun `.md`. Aucune barrière ne regardait.
  **Ce que ça produisait** : `[ENG-DIVORCE-ROOM-COUPLE]`, `[ENG-DIVORCE-ESTATE-PENSION]` et
  `[ENG-DIVORCE-LATENTTAX]` figuraient chacun DEUX FOIS — une version `[x] LIVRÉ` et une version
  `[ ]` périmée d'avant livraison. Une session qui lit la mauvaise moitié re-livre du déjà-fait, ou
  croit fait ce qui ne l'est pas. C'est `PM-STALE-BACKLOG` porté à son maximum, et l'incident n'a été
  découvert que parce qu'une PR suivante a dû fusionner ces fichiers et a produit un conflit imbriqué
  illisible. **Garde** : `tests/noConflictMarkers.test.ts` scanne les fichiers SUIVIS par git.
  ⚠️ Deux finesses dans cette garde, qui valent au-delà d'elle : (1) `=======` seul est AMBIGU —
  c'est aussi un titre setext Markdown — donc on ne le signale que dans un fichier portant déjà un
  chevron, sinon la garde crie sur de la doc légitime ; (2) le test de discrimination appelle le
  VRAI scanner sur de vrais fichiers, il ne re-code pas la détection — une copie qui marche ne prouve
  rien sur l'original.
  ⚠️ Leçon générale : quand une classe de défaut ne peut casser AUCUNE des quatre commandes du gate,
  ne pas conclure « ça se verra à la relecture ». Ça ne s'est pas vu.
- ⚠️ **`SILENCE-READS-AS-BROKEN` (2026-08-14) — un écran MUET se lit « c'est cassé », jamais « il n'y
  a rien ».** Marc a signalé DEUX FOIS « marche toujours pas » sur les transactions du jour. Le code
  était juste de bout en bout (vérifié maillon par maillon : prop passée, jour capté avant rebasage,
  comparaison de dates identique à celle de la reconstruction qui, elle, marchait). Le défaut était
  qu'une journée identifiée SANS mouvement ne rendait **rien du tout** : à l'écran, « aucune
  transaction ce jour-là » et « la fonctionnalité est morte » sont le MÊME pixel.
  ⚠️ **La faute de raisonnement est précise, et elle est réutilisable** : j'avais invoqué
  no-fake-data pour justifier le silence. Or cette règle interdit d'**INVENTER une donnée absente**
  — elle n'interdit pas d'**ÉNONCER un zéro qu'on a mesuré**. Distinguer les deux :
  · la question n'a pas de sens ici (point mensuel, futur) → **ne rien rendre**, c'est correct ;
  · la question a un sens et la réponse est zéro → **le dire**, sinon on laisse l'utilisateur
    conclure à une panne, ce qui est une information FAUSSE produite par omission.
  ⚠️ Corollaire de diagnostic, qui a coûté plusieurs allers-retours ici : quand un utilisateur dit
  « ça marche pas » sur une feature dont le code est vérifié correct, **chercher d'abord l'état où
  l'UI ne dit rien** — c'est le seul état qui ressemble à une panne sans en être une. Vérifier le
  câblage est nécessaire mais ne suffit pas : un chemin de code parfait qui n'affiche rien EST le
  bug. Même famille que `UX-UNREACHABLE-FEATURE` (livré ≠ atteignable) : ici, atteint ≠ visible.
  ⚠️ Garde anti-sur-correctif obligatoire dans ce cas : un test qui exige le message d'absence
  resterait VERT si on l'affichait EN PERMANENCE. Il faut l'assertion inverse — l'état vide ne
  s'affiche PAS quand il y a des mouvements.
  ⚠️ **Et surtout : remplacer un silence par une PHRASE change la nature du risque.** Le panel de
  revue de cette même PR a trouvé DEUX cas où le nouveau message affirmait une MESURE qui n'avait
  pas eu lieu — pire que le silence, parce qu'une phrase a l'autorité d'un fait constaté :
  · **jour FUTUR** — `dayIso` est posé sur TOUT point quotidien, pas seulement le passé (la branche
    projetée de `mergeDailyRealPoint` fait `{ ...d }`, et `d` le porte). Gater sur `dayIso` seul
    annonçait « aucun mouvement ce jour-là » sur du PROJETÉ. Le marqueur de mesure est
    **`dayIsReal`**, jamais la seule présence d'une date. Invisible avant l'état vide : la liste
    étant toujours vide dans le futur, la section ne se rendait pas.
  · **prop absente** — `transactions` est optionnelle par son TYPE ; sans donnée reçue on ne SAIT
    rien, donc on n'affirme rien. Une liste `[]` EXPLICITE reste une vraie mesure et garde, elle,
    le message. Distinguer « pas de données » de « données vides » est le cœur du correctif.
  **Règle à retenir** : avant d'écrire un état vide, énumérer TOUTES les entrées qui y mènent et
  vérifier que chacune justifie l'affirmation. Un état vide atteint par plusieurs chemins dont un
  seul est une mesure est un mensonge sur les autres.
- **Garde-fou (non négociable)** : avant CHAQUE commit, `typecheck` clean + `build`
  qui passe + `test` vert (hook `commit-gate`). Jamais `--no-verify`.
- **Vigilance** (à signaler dans le plan, pas interdit) : migrations schema Zustand
  (persist v7) — une erreur corrompt les données persistées.
  ⚠️ **Un champ ADDITIF optionnel ne nécessite AUCUN bump de version** (leçon PH4-C/PH4-E/PH4D-WEIGHTS-STORE/PH4-F
  2026-06-22) : un bump (v7→v8 + code dans `migratePersistedState`) n'est requis que pour RESTRUCTURER/transformer des
  données EXISTANTES. Pour un nouveau champ (`subscriptions?`, `healthWeights?`…) : le déclarer `optional` dans `AppState`,
  fournir la valeur à l'ÉTAT INITIAL du store ; `partialize` allow-all-sauf-denylist le persiste AUTO, et le `merge` Zustand
  par défaut (`{...current, ...persisted}`) GARDE la valeur initiale quand l'état persisté ne l'a pas → rétrocompat gratuite,
  zéro code de migration = zéro bug de migration (le risque #1). Un plan qui dit « v7→v8 additif » pour un champ dont les
  données n'étaient JAMAIS stockées (rien à migrer) sur-prescrit le bump → préférer l'additif sans bump (plus sûr), avec
  quand même un **test de migration RED** prouvant que le champ existe à l'init (retirer le défaut → le test échoue).

## Exécution cloud — résilience (leçons 2026-06-09)
- ⚠️ **COMMITTER AVANT de lancer un panel/des agents — le revert peut effacer un lot ENTIER non commité**
  (incident AITOOLS-C 2026-07-21) : pendant l'attente d'un panel de 4 agents, un revert conteneur a (1) orphaniné
  les agents (transcripts sans conclusion), (2) EFFACÉ du disque tout le Lot C non commité (5 fichiers), (3) reverti
  les REFS git locaux (HEAD retombé 5 commits en arrière, `origin/main` local périmé) — à répétition, entre commandes.
  Récupération : `git ls-remote` (serveur = vérité, les refs locaux mentent), `git fetch` explicite de la branche
  (les objets fetchés peuvent aussi disparaître → re-fetch), `checkout -B` sur le tip serveur (le working tree
  non-conflictuel survit), ré-application depuis la MÉMOIRE DE SESSION, commit+push IMMÉDIAT. Ordre du cycle depuis :
  implémenter → vérifier vite → COMMIT+PUSH → PR draft → panel sur le diff COMMITÉ (`origin/main...HEAD`, immunisé)
  → findings en commit de suivi → ready+auto-merge. Un échec de tests MASSIF et instantané (~1 ms partout, y compris
  des tests verts 5 min avant) pendant cette période = fenêtre de revert, PAS un bug : relancer avant de débugger.
- **Le conteneur peut REVERTIR le working tree** (resets périodiques) : ne JAMAIS faire confiance
  à l'état local après une reprise. Avant tout commit/push : `git fetch origin main` puis vérifier
  `git merge-base --is-ancestor origin/main HEAD`. Divergence → reset sur `origin/main` + ré-appliquer
  le diff proprement (jamais de merge de branches divergées). **Origin = seule source de vérité.**
  ⚠️ **Le ref LOCAL `origin/main` peut être PÉRIMÉ après un revert** (vu 2026-06-10 : pointait sur un
  commit d'avant 5 PR mergées) → `git checkout -B <br> origin/main` sur un ref périmé rebase sur une
  VIEILLE base, et committer EFFACE le travail mergé entre-temps. Donc : `git fetch origin main` TOUJOURS
  AVANT tout `checkout -B`/`reset` sur `origin/main`, et vérifier un repère connu (ex. `grep` d'un item
  livré récent) avant de committer un diff de docs. Symptôme : des items BACKLOG cochés « disparaissent ».
  ⚠️ **Le revert peut frapper UN fichier ENTRE deux commandes** (vu 2026-06-10 : fix moteur non commité
  présent puis absent du disque au fil des minutes) → des tests qui « flip-flop » sans cause = suspecter
  le revert AVANT toute hypothèse exotique (flake/pollution). Réflexe : `grep` d'un marqueur du diff
  juste AVANT et APRÈS chaque run de test/trace critique sur du code non commité ; en cas de doute,
  committer tôt (le commit protège, le gate vérifie).
- **CI qui ne se déclenche pas** sur une PR = symptôme n°1 d'une branche divergée → re-baser, la CI repart.
  ⚠️ **Le force-push est BLOQUÉ par les règles du repo** : recovery SANS force =
  `git checkout -B <branche> origin/<branche>` + `git merge origin/main` (arbres identiques après un
  squash-merge → fusion propre) + ré-appliquer le diff → `git push` en fast-forward. Pareil après CHAQUE
  squash-merge d'un lot : la branche diverge de `main` (le squash crée 1 commit absent de la branche) →
  merger `origin/main` AVANT le lot suivant, sinon la PR ré-affiche les commits déjà mergés.
  ⚠️ **Après un merge de PR, reconcilier via `git merge origin/main` — JAMAIS `git reset --hard origin/main`**
  (leçon 2026-06-12, vu 3×) : le reset aligne la branche LOCALE sur main mais laisse la branche DISTANTE
  aux commits pré-squash → le commit suivant + `git push` est NON-fast-forward (force-push bloqué) → merge
  + CONFLIT à résoudre à chaque lot. `git merge origin/main` garde la lignée distante → push fast-forward,
  zéro conflit. Le `reset --hard` n'est justifié que pour ré-aligner après un REVERT conteneur (état local
  corrompu), pas après un merge propre. Le stop-hook « commit Unverified noreply@github.com » sur le tip =
  commit de merge GitHub partagé avec `main` → l'ignorer, NE PAS reset pour le « nettoyer ».
  ⚠️ **PRÉCISION (leçon FINTABLE 2026-07-29, vu 3× dans une seule session) : cette règle suppose que la
  branche DISTANTE EXISTE ENCORE.** GitHub SUPPRIME la branche au squash-merge → `git ls-remote --heads origin
  <branche>` rend VIDE. Il n'y a alors plus aucune lignée distante à préserver, et `git merge origin/main`
  fabrique un commit de merge **VIDE** (`git show --stat` = 0 fichier, `git diff origin/main` = 0 ligne) que
  le stop-hook signale « Unverified » à CHAQUE fin de tour. Dans ce cas précis, préférer
  `git checkout -B <branche> origin/main` : ni merge vide, ni bruit récurrent, et zéro risque (rien
  d'unpushed — le vérifier par `git status --porcelain` vide + `git diff origin/main --stat` vide AVANT).
  ⚠️ Et ne JAMAIS « corriger » ce commit vide en le poussant (conseil littéral du stop-hook) : le push
  RE-CRÉERAIT une branche que GitHub a délibérément supprimée, avec dessus un commit ABSENT de `main` —
  exactement le piège du commit orphelin. Décision : brancher distante absente → `checkout -B` ; branche
  distante présente → `git merge origin/main` comme ci-dessus.
  ⚠️ **Branche assignée STALE/divergée** (leçon 2026-06-16, FISC-REER-WHT-DOUBLE) : la branche imposée par la
  tâche (`claude/jolly-…`) pointait sur de VIEUX commits divergés (une migration Vite déjà refaite autrement sur
  `main`) → committer le fix dessus tel quel aurait injecté cette divergence Vite dans la PR (risque de casser le
  build de `main`). Symptôme : `git log origin/main..origin/<branche>` montre des commits inattendus. Réconciliation
  SANS force : `git merge -X theirs origin/main` (`main` = canonique, écrase la divergence stale) → VÉRIFIER
  `git diff origin/main --stat` VIDE (branche ≡ main) → `git cherry-pick` du fix (déjà commité/gaté sur la branche
  de travail) → `git push` fast-forward. La PR ne montre alors QUE le fix.
- **E2E rouge** : lire le log AVANT de débugger — si l'échec est infra (install navigateurs, apt mirror),
  `rerun_failed_jobs` une fois ; n'investiguer que si ça re-échoue.
- **`npm install` après reprise** (le conteneur peut perdre `node_modules` — symptôme : tsc casse sur
  un module manquant type `lucide-react`).
- **Propreté** : GitHub auto-supprime les branches mergées ; supprimer soi-même toute branche de PR
  fermée-non-mergée. **Agents/timers : tuer IMMÉDIATEMENT après usage** (règle Marc 2026-06-10 —
  des agents « 160 h » traînaient) : dès que le résultat d'un agent/timer/monitor est consommé,
  `TaskStop` s'il tourne encore ; vérifier les traînards à CHAQUE point de contrôle, pas seulement
  en fin de session. Un agent qu'on ne consulte plus = un agent qu'on arrête.
  ⚠️ **Un resume de session peut ORPHELINER un agent en vol** (vu 2026-06-10 : projection-validator
  interrompu en pleine investigation ; `TaskOutput` → « No task found »). Récupérer sa conclusion par
  lecture BORNÉE du `.jsonl` (python qui ne sort que le dernier message texte — JAMAIS `Read` direct =
  overflow du transcript), ou simplement REFAIRE ses checks ouverts à la main s'il n'a pas conclu.
  ⚠️ **Sonde d'agent vs `commit-gate`** (piège 2026-06-17, FISC-BROKE-LIQUID-FLOOR) : un agent read-only
  AVEC Bash (ex. projection-validator) peut créer un fichier-sonde temporaire dans `tests/` (vu :
  `dc_probe.test.ts`) puis le supprimer ; si le `commit-gate` lance `vitest` PENDANT cette fenêtre, le glob
  l'attrape puis échoue à le charger (« Cannot find module ») → commit BLOQUÉ à tort (tes vrais tests passent).
  Ne PAS committer tant qu'un agent à Bash tourne ; sinon re-committer une fois l'agent fini (la race se résout).
- ⚠️ **Course `git stash` CONCURRENTE = mesures CORROMPUES + faux gate VERT** (piège 2026-06-23, FISC-WHT-HARDCODE) :
  lancer PLUSIEURS agents à Bash qui font chacun `git stash push/pop` (pour leur discriminant) EN MÊME TEMPS, +
  une suite complète en arrière-plan, sur le MÊME working tree → les stashes se marchent dessus et la suite peut
  s'exécuter PENDANT qu'un agent a stashé le fix (code d'AVANT) → `exit 0` TROMPEUR (un test qui casse avec le fix
  « passe » car le fix était absent pendant le run). Vu : la suite gate a fini exit 0 alors que `projection.survivor.test.ts`
  cassait VRAIMENT (révélé seulement par un run ISOLÉ après la fin des agents). Réflexe : (1) ne PAS lancer la suite-gate
  en // de plusieurs agents qui stashent ; (2) tout finding de baseline cassé d'un agent → RE-MESURER en isolation
  (working tree propre, `git stash list` vide) AVANT de trancher ; (3) le panel peut RÉFUTER le gate (« l'agent qui a
  mesuré l'emporte ») — ici projection-validator avait raison contre l'exit 0. Faire les git-stash SÉQUENTIELLEMENT.
- ⚠️ **Refactor VERBATIM (god-file → modules + barrel) : le discriminant n'est PAS `git-stash` (zéro changement de
  logique) mais des INVARIANTS STRUCTURELS prouvés mécaniquement** (leçon ARCH-SYNC-SPLIT 2026-07-15) : scinder
  `syncOrchestrator.ts` (892 l.) en 9 modules « un état mutable = un module propriétaire » + barrel de compat s'est
  vérifié par (a) `grep "let _status"` == 1 (un seul propriétaire de chaque état mutable, pas de double-instanciation ESM) ;
  (b) `grep sanitizePersistEnvelope services/sync/*.ts` == 2 (les ceintures de sécurité — ici la désinfection persona push+pull —
  SURVIVENT non fusionnées) ; (c) `npx madge --circular --extensions ts services/sync/` == 0 (aucun cycle d'import, aucune
  lecture d'état au CHARGEMENT top-level — tout `getSyncStatus()` est DANS une fonction) ; (d) le barrel re-exporte EXACTEMENT
  la surface publique historique (diff contre les imports RÉELS des consommateurs — ni fuite d'un rouage interne type `setStatus`,
  ni symbole manquant) ; (e) parité de traçabilité (`logError`/`catch` : même compte avant/après). Le piège #1 = une lecture
  `_status.X` intra-module devenue `getSyncStatus().X` cross-module doit rester une lecture FRAÎCHE (jamais mise en cache en haut
  de fichier, sinon statut figé → UI désync). Panel (code-reviewer/silent-failure-hunter/security-privacy) en comparaison
  LIGNE-À-LIGNE contre `git show HEAD:<fichier>` = la bonne façon de prouver « verbatim » ; ils ont confirmé 28 exports=28,
  7 logError=7, 21 catch=21. Coche AUSSI la suite complète (widely-imported → un symbole mal recâblé casse ailleurs).
- Un commit de merge GitHub (`noreply@github.com` sur `main`) signalé « Unverified » par le stop-hook
  n'est PAS un commit local à corriger — l'ignorer.
- ⚠️ **La suppression d'une branche DISTANTE est un no-op silencieux** (vu 2026-07-06 : `git push origin :branche` répond "Everything up-to-date" sans supprimer). Une branche périmée ne peut donc être ni force-poussée ni supprimée → réconcilier par `checkout -B <br> <tip-distant>` + `merge -X theirs origin/main` + **forcer l'arbre ≡ main** (`git checkout origin/main -- .` puis vérifier `git diff origin/main` VIDE) + commit de merge + push fast-forward. ⚠️ Avant de "sauver" les commits d'une branche périmée, TRIAGER : après des semaines, ils peuvent être superseded voire CONTRAIRES à une décision prise depuis (vu : suppression de l'alias tax vs décision Marc 2026-06-19 de le GARDER).
- ⚠️ **La politique réseau du conteneur BLOQUE les hôtes tiers non allowlistés → une API externe peut être
  NON-vérifiable depuis l'exécution cloud** (leçon FINTABLE-0 2026-07-29) : `curl: (56) CONNECT tunnel failed,
  response 403` = refus du PROXY (hôte hors politique), **PAS** un problème de l'origine — ne pas débugger TLS/UA.
  Asymétrie utile : `WebSearch` passe (chemin Anthropic) et `WebFetch` atteint l'origine (403 Cloudflare ≠ 403 proxy),
  mais `curl`/`fetch` depuis le conteneur non ; `getent hosts` distingue en plus le NXDOMAIN (l'hôte deviné n'existe
  pas) du blocage. Conséquence de CADRAGE : pour intégrer une API tierce non documentée publiquement, la forme
  (URL de base, en-tête d'auth, chemins, NOMS DE CHAMPS) doit venir de Marc — **une réponse réelle tronquée, montants
  masqués**. Coder un client contre une API DEVINÉE sur un chemin money-critical = le contre-modèle « vérifier avant
  d'affirmer » ; livrer plutôt l'ADR + le plan + le blocage précis dans `A_FAIRE_MOI.md`, et ne pas écrire le lecteur.
- ⚠️ **Un secret collé dans le chat est COMPROMIS — révocation d'abord, tout le reste après** (incident FINTABLE
  2026-07-29 : jeton Fintable read+write, expiration 2027) : l'historique de conversation est persisté, donc « personne
  ne l'a vu » n'est pas une mitigation. Séquence : révoquer → régénérer au **scope minimal** (lecture seule ici) →
  `echo "<jeton>" | gcloud secrets versions add <nom> --data-file=- --project=<projet>` depuis le poste de Marc, jamais
  un aller-retour par le chat. ⚠️ `gcloud secrets create … --data-file=-` **SANS pipe reste bloqué en attente de stdin**
  (lit l'entrée standard) — ça ressemble à un plantage, c'est juste un `-` sans amont : toujours donner la commande
  PIPÉE complète à Marc (cf. règle « son poste = Windows PowerShell », pas de bash/openssl).

## Agents — deux niveaux
**Globaux** (`~/.claude/agents/` via claude-config / ECC) : dispo dans tous les projets.
**Projet** (`.claude/agents/` ici, **14**) : spécialisés FinanceAI, SURCHARGENT les globaux par nom.
Détail complet (rôles, modèles, exclusions anti-chevauchement) : **`docs/agents.md`**. Usage des
commandes (`/new-feature`, `/review-all`, `/release-review`) : **`docs/workflow.md`**.

**Les agents s'améliorent À CHAQUE PUSH** (règle Marc 2026-06-17, sœur de « CLAUDE.md s'améliore à
chaque push ») : un agent qui produit du bruit, rate un angle mort, ou dont une convention a changé →
mettre à jour son fichier `.claude/agents/<nom>.md` dans la MÊME PR. Le hook `learn-on-push` le rappelle.

**Déclenchement PROACTIF + PANEL** (ne pas attendre qu'on le demande). À chaque feature finie ou
avant commit, lancer EN PARALLÈLE tous les agents pertinents (commande `/review-all`), puis synthétiser :
- Toujours → `code-reviewer`, `silent-failure-hunter`.
- Calcul $ / solde / flux / dette / impôt / devise / migration store → `financial-integrity` (lit `docs/FISCAL_REFERENCE.md`).
- Secrets/crypto/CSP/persistance/LLM/vie privée (Loi 25) → `security-privacy`.
- Appel SDK Anthropic (`services/claude.ts` + surfaces) → `ai-reviewer`.
- `services/projection/` ou calcul long-terme → `projection-validator`.
- Logique métier ajoutée → `test-writer`.
- UI notable → `a11y-auditor`.
- Doc touchée par le changement → `documentation-manager` (Edit `docs/`+`.md` uniquement).
- À LA DEMANDE : `architect` (design/dette), `product-manager` (valeur/MVP), `performance-optimizer`
  (profilage moteur profond — la perf générale est dans `code-reviewer`), `code-analyzer` (dette large → BACKLOG).

Seule limite : la PERTINENCE. Lancer tous les agents qui s'appliquent ; aucun hors sujet.

**Orchestrateur À CHAQUE MESSAGE** (règle Marc 2026-06-17) : le hook `UserPromptSubmit` → `scripts/hooks/orchestrate.mjs`
injecte la directive de routage (`.claude/agents/orchestrator.md`) à chaque message. AVANT de répondre, déduire le
TYPE de demande et annoncer en 1-2 lignes les agents retenus/ignorés (+ pourquoi), puis exécuter. ⚠️ Claude Code ne
peut PAS auto-spawner un sous-agent par message (ni souhaitable — coûteux) : le routage est appliqué par la boucle
principale, pas par un sous-agent. **Message trivial/conversationnel (« ok », « go », « merci ») → AUCUN agent, répondre direct.**

**Audit financier RÉCURRENT** (`/audit-financier`, demande Marc 2026-06-17) : ≠ `/review-all` (qui audite le DIFF) —
audite TOUT le moteur sur `main`, PROUVE la conservation empiriquement (forme-bilan `ΔNW==ΔΣactifs−ΔΣdettes`),
produit un rapport DATÉ (`docs/AUDIT_FINANCIER_<YYYY-MM-DD>.md`) à comparer d'une passe à l'autre (« peaufiner à
chaque passage »), et route les findings au BACKLOG. Cadence : **1×/trimestre + avant release majeur + 1×/période
d'impôts**. 1ʳᵉ passe 2026-06-17 : cœur AAA, findings tous périphériques (consommateurs UI/IA qui contournent la source unique).

⚠️ **Brieffer le panel PRÉ-COMMIT sur le bon diff** (leçon 2026-06-16) : avant un commit, le travail vit
dans le **working tree** (branche locale encore à `origin/main`) → `git diff origin/main...HEAD` est **VIDE**.
Dire aux agents de lire `git diff` (working tree) ou `git status`, JAMAIS `origin/main...HEAD`, sinon chaque
agent gaspille un aller-retour à « découvrir » que rien n'est commité avant de pivoter. (`origin/main...HEAD`
n'est correct qu'APRÈS commit, pour reviewer une branche déjà poussée.)

## Qualité d'abord (coût tokens non contraint)
- **Tâches à 100 %** : pas de stub ni de « TODO plus tard » non demandé ; tests verts avant commit.
- Privilégier la THOROUGHNESS : passes multiples, panel d'agents en parallèle aux gates,
  vérifications exhaustives. Le coût en tokens n'est PAS une contrainte.
- Seule limite : le SIGNAL. Ne pas lancer d'agent hors sujet ni produire du bruit que personne ne lira.
- Réponses structurées, essentiel d'abord (clarté ≠ économie).

## Posture de l'agent
- Pas de complaisance : si une approche est mauvaise, le dire et proposer mieux.
- Pas de validation gratuite ni d'intro inutile.
- ⚠️ **Une spec/formule d'un plan VALIDÉ peut être à l'envers — vérifier sa DIRECTION contre l'objectif AVANT de coder**
  (leçon R4-P4 2026-06-22) : le plan demandait un cap de densité `∝ (visMax−visMin)/6`, mais ça produit l'INVERSE du but
  (« dézoomé = peu d'icônes ») — span grand=dézoomé → cap élevé → PLUS d'icônes, et cap minuscule en zoom → écrête « toutes ».
  Avant d'implémenter une formule, instancier 2 cas extrêmes (zoom in / out) et vérifier que le résultat va dans le sens voulu.
  Corollaire (R4-P1, sœur de [[R2-FIRE]]) : VÉRIFIER qu'une feature n'est pas DÉJÀ faite avant de la coder (le boot-restore l'était).
  ⚠️ **Un item BACKLOG (surtout recommandé par le PM) peut être PÉRIMÉ — vérifier l'état RÉEL avant de coder** (leçon PM-STALE-BACKLOG
  2026-06-25, généralise [[R2-FIRE]] aux tâches BACKLOG) : sur 5 recos PM enchaînées, **3 étaient déjà réglées** — `TEST-PROJ-MODULES`
  (les 3 modules avaient déjà 49 tests, ajoutés depuis), `DEP-UNDICI`/`DEP-UNDICI-VULN` (le lockfile était DÉJÀ à `undici 7.28.0`, `npm
  audit` = 0 vuln — un `npm ls` local périmé à 7.25.0 trompait). Un item peut être clos AILLEURS (lockfile bumpé par Dependabot, tests
  ajoutés par une autre PR) sans que la case BACKLOG soit cochée. AVANT de coder un item : confirmer qu'il tient encore (grep des tests,
  `npm audit`, lire le vrai code) ; s'il est réglé, le COCHER « périmé/résolu » (traçabilité) et passer au suivant. Le PM lit le BACKLOG,
  pas l'état réel → ses priorités héritent de la staleness du BACKLOG ; un PASS de nettoyage du BACKLOG vaut mieux que d'enchaîner des items morts.
  ⚠️ **Sœur — l'EFFORT/la SÛRETÉ d'un item (surtout l'estimation PM) peut être fausse ; vérifier la VRAIE contrainte avant de coder** (leçon
  PERF-BOOT-RATELIMIT 2026-06-26) : le PM a classé `PERF-BOOT/D7` (paralléliser `hydrateAssets`) en quick-win « S », mais le `sleep(2500)` (24/min)
  ne ménage PAS que Finnhub (60/min) — il protège AUSSI **CoinGecko free (~30/min)**. Un speedup provider-AVEUGLE qui dépasse ~30/min déclenche des
  429 crypto au cold-boot → actifs non rafraîchis = **régression UX PIRE que la lenteur**. Pour un item perf borné par un rate-limit EXTERNE,
  vérifier la limite du provider le PLUS STRICT (pas du plus permissif) AVANT d'estimer/coder ; le vrai fix sûr est provider-aware (M-L, plan-first), pas un `Promise.all` aveugle.
  ⚠️ **Un ticket BACKLOG peut CONTREDIRE une décision VERROUILLÉE — relire `docs/decisions.md` + historique avant de coder** (leçon P0-PROXY 2026-07-06, généralise [[PM-STALE-BACKLOG]] aux décisions) : le ticket `[P0-PROXY]` disait « proxy pour la clé » (multi-user) alors que `ADR-002` (2026-07-06) verrouille « app SOLO » ; le plan-first l'a attrapé AVANT le code. Un item BACKLOG peut avoir été créé avant une décision Marc qui le REND obsolète ou le REDIRIGE (remis en perso vs multi-user). AVANT de coder un item : confirmer contre `docs/decisions.md` + `docs/VISION.md` qu'il n'a pas été annulé/remisé (leçon PM-STALE-BACKLOG : le PM/BACKLOG peut déraler) — s'il a, le COCHER « caduque/remis » + passer au suivant.
  ⚠️ **Un `onClick` React sur un conteneur de graphe ne capte PAS les clics tombant sur une forme SVG redessinée au survol — utiliser `pointerup`** (leçon FUTUR-CLICK-AREA 2026-08-11, mesurée par sonde Playwright, pas déduite). Sur le graphe Futur, cliquer sur une aire empilée (`path.recharts-curve.recharts-area-area`) ne déclenchait **aucun** événement `click` — vérifié jusqu'au listener `document` en phase de CAPTURE, qui ne voyait rien non plus, alors qu'un clic sur l'espace vide (`svg.recharts-surface`) passait normalement. Cause : recharts re-rend le `<path>` entre `pointerdown` et `pointerup` (l'état de survol change), donc les deux cibles ne sont plus le même nœud DOM et le navigateur ne synthétise jamais le `click`. `pointerup` arrive, lui, dans les deux cas. Conséquence utilisateur : la moitié basse de la courbe était **morte au clic** depuis toujours, et personne ne l'avait vu parce que l'e2e cliquait justement dans le vide au-dessus de la pile. **Deux leçons transverses** : (1) un test d'interaction doit cliquer là où l'utilisateur clique VRAIMENT (sur la donnée, pas dans la marge) — sinon il prouve un chemin que personne n'emprunte ; (2) quand un handler « ne se déclenche pas », instrumenter par SIDE-CHANNEL DOM (`setAttribute`) plutôt que `console.log` : le mode test peut réduire la console au silence, et j'ai perdu une passe entière sur un log jamais imprimé.
  ⚠️ **Superposer du RÉEL sur du PROJETÉ par `{...projeté, ...réel}` laisse filtrer les champs projetés dans une ligne présentée comme réelle — reconstruire le point À PARTIR DE RIEN** (leçon FUTUR-DAILY-PAST-REAL 2026-08-11). Le point quotidien du graphe Futur porte ~90 champs. En recouvrant seulement ceux qu'on sait mesurer (soldes, cash, dépenses), les ~70 autres — impôt dormant, rentes RRQ/PSV, solde d'impôt d'avril, cotisations, cibles FIRE — auraient SURVÉCU du point projeté vers une journée d'hier étiquetée « Réel ». Des chiffres crédibles, invérifiables, et faux par nature (on ne projette pas le passé). La forme sûre est structurelle : construire un objet NEUF ne contenant que le mesuré + l'identité du point ; ce qui n'est pas mesuré est ABSENT, donc « — ». Corollaire de la règle no-fake-data, appliquée non plus à UNE valeur mais à un objet entier — et c'est le cas de l'objet qui est piégeux, parce que la fuite est invisible à la relecture du diff (on voit ce qu'on écrit, pas ce qu'on hérite).
  ⚠️ **« Livré et testé » ne dit RIEN sur ce qui est VISIBLE par défaut — vérifier ce que l'état initial montre RÉELLEMENT** (leçon UX-UNREACHABLE-FEATURE, 3e occurrence, `[FUTUR-DAILY-PAST-REACH]` 2026-08-11). Le bouton « Jour » posait la fenêtre à `lo = todayIndex − 1`. Or la construction des jours CONSOMME la première ancre comme valeur d'ENTRÉE sans la rendre : le premier jour affiché était donc le 1er du mois COURANT, et le bouton ne montrait **aucun** jour passé. Toute la reconstruction du passé au jour — un module entier, 13 tests, une PR — était livrée, verte, déployée et **strictement invisible**. Aucun test ne l'attrapait parce que tous portaient sur la fenêtre OU sur la ventilation, jamais sur « qu'est-ce que l'utilisateur voit au premier clic ». Les trois occurrences de la classe sur ce seul chantier : (1) la vue au jour n'était atteignable qu'à 23-31 crans de molette ; (2) elle ne portait que la valeur nette ; (3) elle ne descendait jamais avant aujourd'hui. **Le test qui manque est toujours le même** : instancier l'état PAR DÉFAUT et assertionner sur son CONTENU (« la moitié des mois rendus tombe avant aujourd'hui »), pas sur la correction des briques.
  ⚠️ **Sœur, sur les LIBELLÉS : « techniquement une date » ≠ « lisible comme une date ».** Marc a signalé DEUX fois le même symptôme (« ça me dit pas le jour ») : d'abord sur `2026-09-14` (ISO — juste, illisible), puis sur « sam. 14 sept. 2026 » (français — juste, mais trop proche du libellé MENSUEL « sept. 2026 » d'un coup d'œil). Le format retenu est `sam. 14/09/2026` : les barres obliques rendent la granularité indiscutable. Quand un utilisateur répète un reproche après un correctif, ce n'est pas qu'il n'a pas vu le correctif — c'est que le correctif ne règle pas SON problème.
  ⚠️ **Un zoom multiplicatif sur des INDICES ENTIERS a un point fixe d'arrondi — le cran s'annule en silence dès que `span × (1−facteur) < 1`** (leçon ZOOM-ROUND-FIXPOINT 2026-08-11, trouvée par SONDE : 10 crans dispatchés, fenêtre inchangée — la lecture du code ne l'aurait pas donnée, il « avait l'air » correct). À span 5, ×0,85 déplace chaque borne de ~0,375 → `Math.round` redonne les MÊMES entiers, et comme la base du cran suivant est la cible ARRONDIE (pas la valeur fractionnaire), chaque cran repart du même point : zoom coincé pour toujours. Trois conséquences restées invisibles des mois : le plancher RÉEL du zoom était l'arrondi (pas `minPoints`) ; le DÉZOOM au plancher était coincé lui aussi (symétrique, ×1,15) ; et abaisser `minPoints` ne changeait RIEN. L'e2e historique n'a jamais rien vu parce qu'il zoomait depuis 450 points, où chaque cran retire plusieurs unités entières. Correctif : quand l'arrondi annule le cran, forcer un pas ENTIER du côté opposé au curseur. **Généralisation** : toute boucle « état ← round(f(état)) » avec f proche de l'identité a des points fixes parasites — tester le PAS UNITAIRE aux petites valeurs, pas seulement la trajectoire depuis les grandes.
  ⚠️ **Sœur, sur les stubs : un stub rAF SYNCHRONE inverse l'ordre callback/affectation d'id** — `rafIdRef.current = requestAnimationFrame(cb)` exécute `cb` AVANT l'affectation, donc le nettoyage `rafIdRef.current = null` fait DANS `cb` est aussitôt écrasé par l'id retourné : le hook croit un frame éternellement en attente et ne committe plus. Les tests mesuraient le stub, pas le hook (2 faux rouges vécus ici même). Stub correct : une FILE de callbacks flushée manuellement après chaque événement.
  ⚠️ **Supprimer une surface d'affichage exige l'INVENTAIRE de ce qu'elle était SEULE à dire** (leçon FUTUR-DAILY-ANCHOR-CAVEAT 2026-08-11). Le tableau jour-par-jour a été retiré à la demande de Marc — légitime — mais il était le SEUL endroit qui affichait `undatedTotal`/`flowsAfterNowDate`, l'avertissement « le niveau passé est décalé de N $ parce que l'ancre compte des flux que la série quotidienne ne peut pas placer » (classe PH4D, mesuré −2 000 $). Sa suppression a donc silencieusement retiré un garde-fou money-critical PENDANT le lot même qui rendait le risque actif. Attrapé à la RELECTURE du BACKLOG (l'item disait « latent tant que non branché » — il venait d'être branché), pas par un test : aucun test ne vérifie qu'une information est affichée QUELQUE PART. Règle : avant de supprimer un composant, lister ce qu'il affiche et classer chaque élément — redondant (part avec lui) ou UNIQUE (déménage d'abord). Les candidats uniques typiques sont précisément les avertissements d'honnêteté (caveats, badges « estimé », compteurs d'exclusion), parce qu'ils sont nés DANS la surface qu'ils qualifiaient.
  ⚠️ **Un test qui importe une CONSTANTE du code testé peut devenir VACUEUX sur le code d'avant — la preuve de discrimination par stash doit vérifier que le test échoue POUR LA BONNE RAISON** (leçon HARDEN-SNAPSHOT-RACE 2026-08-12). Le test assertait `rejects.toThrow(PROJECTION_CANCELLED)` avec la sentinelle IMPORTÉE du module. Sous `git stash` (code sans la feature), l'export n'existe plus → l'import transformé vaut `undefined` → `toThrow(undefined)` ≡ `toThrow()` = « n'importe quelle erreur » → 14/14 verts sur du code SANS la feature. La preuve de discrimination affichait donc « pas d'échec » et j'ai failli conclure que le test était bon. Règle : pour une SENTINELLE (contrat de protocole), l'assertion utilise le LITTÉRAL en dur + un test d'égalité `expect(CONSTANTE).toBe('littéral')` qui verrouille la constante — la renommer doit casser le test, c'est voulu. Généralisation : après un stash-check, regarder POURQUOI le test échoue (le bon message, la bonne ligne), pas seulement QU'il échoue — et un stash-check qui ne produit AUCUN échec est lui-même un résultat à expliquer, pas à célébrer.
  ⚠️ **Un constat d'IMPOSSIBILITÉ écrit par moi et jamais re-vérifié bloque une feature ATTEIGNABLE — le re-tester avant de le citer** (leçon DOC-STALE-IMPOSSIBILITY 2026-08-11, miroir de [[PM-STALE-BACKLOG]] : là c'est du travail DÉJÀ fait qu'on refait, ici c'est du travail FAISABLE qu'on ne fait pas). Le BACKLOG portait, de ma main, « seule la Valeur nette peut passer au jour ; ventiler les comptes exigerait d'inventer une répartition quotidienne, exactement la fausse précision que le dépôt s'interdit » — et l'écran affichait un bandeau qui l'expliquait à Marc. C'était FAUX : `monthlyOutput` émet DÉJÀ, par mois **et par compte**, `NetTransfer*` (dépôts/retraits) et `MarketGrowth*` (rendement) — de quoi décomposer un mois en jours sans rien inventer. La seule inconnue réelle était la DATE du rendement, qui reste répartie et annoncée comme telle. Le constat n'a jamais été refait après que le moteur eut gagné ces champs. **Un « c'est impossible » se date et se re-prouve** (grep le moteur) avant de servir d'argument dans un ticket, un bandeau ou une réponse à Marc — sinon il devient une prophétie auto-réalisatrice. Coût mesuré ici : deux itérations de livraison et un retour agacé de Marc (« ça me dit encore septembre 2026 »).
  ⚠️ **Sœur, sur les GARDES : un test qui lit la classification pour choisir quoi vérifier ne PEUT PAS détecter une erreur de classification** (même leçon, mesurée par `git`-perturbation). Les deux invariants de `dailyLedger` (« dernier jour = valeur du moteur », « Σ des jours = total du moteur ») itèrent sur `FIELD_KIND` : reclasser `CELI` de `stock` en `flow` les laisse tous les deux VERTS (le solde devient un flux dont la somme des 28 jours vaut bien le solde du mois — l'invariant est satisfait, l'affichage est faux d'un facteur 28). Il a fallu une 3e garde INDÉPENDANTE de la table : un test d'**ordre de grandeur** (un solde en milieu de mois vaut ~1× la valeur du mois, pas ~1/28). Généralisation : quand une table de configuration pilote À LA FOIS le code et le test, la garde est circulaire — il faut au moins une assertion qui ne consulte PAS la table.
  ⚠️ **Symétrique : un ticket peut SUR-prescrire son périmètre — prouver chaque volet AVANT de le coder** (leçon BUDGET-MATCH-UNIFY 2026-07-24, miroir de [[Lot audit n°2]] « compte du ticket < périmètre réel ») : le ticket (écrit par moi la veille) disait « unifier les TROIS calculs » mais la cible auto était DÉJÀ sur la règle unifiée PAR CONSTRUCTION (noms de postes ≡ catégories observées au moment du calcul — la sync canonicalise avant → l'exact n'y diverge jamais du fuzzy) ; coder ce volet aurait AJOUTÉ du risque (fuzzy mono-catégorie = double-comptage cross-poste) pour zéro effet. Avant d'exécuter un plan multi-volets, tester chaque volet : « ce cas divergent est-il ATTEIGNABLE ici ? » — un volet inatteignable se documente (pourquoi exempt), il ne se code pas.
- ⚠️ **`UX-UNREACHABLE-FEATURE` — « livré, testé, déployé » ne veut pas dire ATTEIGNABLE : mesurer le COÛT DU CHEMIN, pas seulement l'existence de la destination** (leçon FUTUR-DAILY-REACH 2026-08-11).
  La vue « jour par jour » du graphe Futur a été conçue, implémentée, couverte par 39 tests unitaires, validée par une e2e en navigateur RÉEL, mergée et déployée en production — et Marc n'a jamais pu la voir : « j'arrive toujours pas à voir jour par jour ». Rien n'était cassé.
  Elle ne s'active que sous 6 points mensuels visibles, et le seul chemin pour y descendre était la molette : **mesuré à 23-31 crans depuis « Tout »** (facteur 0,85/cran, plancher `DEFAULT_MIN_POINTS = 5`), **16 crans depuis le preset « 5 ans »** — sans aucun retour intermédiaire disant qu'on s'en approchait. Et `useTimeChartZoom` n'écoute que `wheel` + souris : **au doigt, la fonctionnalité était strictement inatteignable**.
  ⚠️ **Ce que l'e2e prouvait, et ce qu'elle ne prouvait PAS.** Elle appelait `page.mouse.wheel()` **60 fois de suite** dans une boucle, avec un commentaire qui disait tranquillement « ~28 crans suffisent en théorie ». Elle prouvait donc que la destination EXISTE. Elle ne prouvait rien sur l'accessibilité humaine — et le chiffre qui condamnait la feature était écrit noir sur blanc dans le test, personne (moi) ne l'a lu comme un signal UX. **Un test qui a besoin d'une boucle pour atteindre l'état testé DÉCRIT le coût du chemin : le lire comme tel.**
  ⚠️ Symptôme adjacent, même famille : un seuil dimensionné pile sur le plancher de zoom (`DAILY_CURVE_MAX_POINTS = 6` = `5 + 1`) rend la feature accessible **uniquement au zoom maximal exact**. Le premier jet plafonnait à 4 → inatteignable tout court. Un couplage aussi serré entre un seuil d'affichage et une borne d'interaction mérite un chemin DIRECT (bouton), pas un réglage plus fin de la borne.
  **Règle** : pour toute feature gatée par une INTERACTION (zoom, scroll, survol, glisser), écrire noir sur blanc le nombre de gestes nécessaires depuis l'état PAR DÉFAUT, et vérifier que chaque modalité d'entrée y arrive (souris, doigt, clavier). Si le compte dépasse quelques gestes, la feature a besoin d'un raccourci EXPLICITE — sinon elle est livrée pour les tests, pas pour l'utilisateur.
  ⚠️ **4e occurrence, et le raffinement de la règle : le raccourci doit être offert AU MOMENT DE L'INTENTION, pas ailleurs sur l'écran** (leçon FUTUR-DAILY-SELECT-PATH 2026-08-12). Le bouton « Jour » existait, visible, un clic — et Marc a quand même buté (« je peux pas selectionner de jour juste un mois », capture : infobulle figée sur « mai 2027 » en vue LARGE). Son geste dit son intention : il clique un MOIS en voulant un JOUR. Le raccourci était à un autre endroit de l'écran, dans le sélecteur de période — au moment du clic, rien ne le proposait. Correctif : l'infobulle figée d'un mois offre « Voir ce mois jour par jour » (zoom centré sur le mois CLIQUÉ), et celle d'un jour offre « Veille / Lendemain » (sélection au jour près sans re-viser — un jour ≈ 6 px à ~150 jours affichés, mesuré ; utilisable au doigt). Sondes mesurées au passage : un clic qui dérive de 8 px pendant le geste était AVALÉ par le garde anti-pan (seuil 6 px) → tolérance ADAPTATIVE (14 px en vue jour, où un pan de 14 px est imperceptible ; 6 px en vue large, où il vaut des mois). Généralisation : quand un utilisateur bute deux fois sur la même feature « livrée et testée », chercher où son GESTE exprime l'intention et mettre l'affordance LÀ.
  ⚠️ **Corollaire mesuré (ROLLOVER, 2026-08-12) — changer la granularité d'un AXE impose d'auditer TOUS ses ancrages** : en passant la courbe Futur du mois au jour, TROIS ancrages posés à l'entier du mois sont devenus faux de jusqu'à ~30 jours (ligne « Aujourd'hui », fin de bande « Passé réel », pastilles d'événements — les deux premiers trouvés en revue, le troisième par Marc en usage réel le même matin). Un ancrage n'échoue pas : il se DÉCALE en silence. Au moindre changement de résolution d'un axe, grep tous les `ReferenceLine`/`ReferenceArea`/`ReferenceDot`/positionnements par index de cet axe et prouver chacun à la nouvelle granularité. Et un état qui devient RÉACTIF (« aujourd'hui » qui avance à minuit) rend atteignables des chemins de données jamais exercés — auditer ce que la nouvelle fraîcheur rend visible (ici : un jour basculé « réel » avant la sync bancaire affichait un 0 $ crédible ; flag `daySyncUnconfirmed`, symétrique de `hasEstimatedPrice`).
  ⚠️ **6e occurrence — l'affordance de TROP : l'utilisateur ne voulait aucun chemin, il voulait le geste lui-même** (FUTUR-DAILY-NATIVE, 2026-08-12) : quatre itérations ont ajouté des CHEMINS vers la vue au jour (zoom profond, bouton « Jour », bouton « Voir ce mois jour par jour », flèches) — et Marc a fini par dire « je veux pas un bouton je veux pouvoir selectionner sur la courbe direct ». La réponse structurelle n'était pas une meilleure affordance mais un changement de RÉSOLUTION : le jour devient l'unité de base de la courbe, et le geste naturel (cliquer là où on regarde) EST la sélection. Quand on en est à la 3e affordance pour atteindre un état, se demander si l'état ne devrait pas être le DÉFAUT. Corollaires techniques mesurés dans la foulée : (a) 11 000 points × 8 aires Recharts gèlent le main thread au point que `mouse.wheel` Playwright EXPIRE — décimer le TRACÉ (phase globale stable, points porteurs préservés) en gardant la SÉLECTION sur la série complète ; (b) `ReferenceArea` hors domaine est JETÉE en silence (`ifOverflow` défaut « discard »), pas écrêtée — clamper les ancrages au domaine réellement rendu ; (c) `toLocaleDateString` PAR POINT domine une construction de masse (~800 ms/11 k appels) — tabler les 7 noms de jours une fois.
  ⚠️ **Un e2e « tactile » peut tester la SOURIS en silence** (leçon FUTUR-DAILY-TOUCH 2026-08-12) : les
  synthétiseurs CDP (`Input.synthesizePinchGesture`/`synthesizeScrollGesture`) sans `gestureSourceType: 'touch'`
  émettent la source « par défaut » de la PLATEFORME — en desktop headless c'est la MOLETTE (wheel/ctrl+wheel).
  Mon premier e2e pincement était VERT en validant le chemin molette déjà couvert ailleurs ; en forçant `'touch'`,
  les deux tests sont devenus rouges et ont révélé un vrai bug (même famille que « le robot paie le chemin » :
  le vert mesurait la mauvaise modalité). Trois corollaires MESURÉS : (a) un pincement d'écartement RÉEL démarre
  doigts quasi COLLÉS — une base armée seulement au touchstart avec un seuil d'écart laisse le geste mort, il faut
  pouvoir l'armer au touchMOVE ; (b) le geste CDP est VERTICAL — un dézoom fort fait naître les touches HORS de la
  boîte du graphe (380 px de haut) et les événements n'atteignent jamais le conteneur → gestes modérés répétés ;
  (c) le scroll tactile 1 doigt est INERTE dans l'émulation headless MÊME hors de tout listener (mesuré, aucun
  scroller dans la page) → le contrat « le hook ne bloque pas le doigt seul » se prouve par `defaultPrevented`,
  pas par un scroll observé.
  ⚠️ **5e occurrence — un bouton ATTEINT par le robot n'est pas un bouton VU** (leçon FUTUR-TOOLTIP-STICKY-ACTIONS 2026-08-12) : le bouton livré à la 4e occurrence était rendu, cliqué par l'e2e, déployé — et Marc ne le voyait toujours pas (« figée mais sans le nouveau bouton », prod vérifiée à jour). Cause : le tooltip défile en interne (`max-h-[480px] overflow-y-auto`) et ses vraies données poussaient le pied d'actions SOUS le pli ; or **`getByRole().click()` de Playwright scrolle automatiquement l'élément en vue avant de cliquer** — le test ne peut PAS échouer sur « l'utilisateur ne le voit pas ». Règle : pour une ACTION située dans un conteneur scrollable, soit l'épingler (`sticky`), soit prouver sa visibilité SANS scroll par la géométrie (`boundingBox` de l'action ⊆ boîte visible du conteneur, AVANT toute interaction) — un `click()` vert de Playwright ne vaut rien comme preuve de visibilité.
- ⚠️ **Un calcul DÉRIVÉ d'une donnée partagée EXPOSE les incohérences des calculs VOISINS sur la même base** (leçon
  PH4D-BUDGET-RATIOS 2026-06-22) : ajouter le ratio « adhérence budget » (qui normalise les cibles via `monthlyTargetOf`)
  a révélé que `monthlyExpenses` (taux d'épargne + coussin, pré-existant) sommait `b.target` BRUT — un poste annuel comptait
  ×12 en mensuel → deux calculs DIVERGENTS sur les MÊMES `budgetItems`. Au moment d'ajouter un ratio/métrique, AUDITER que
  les calculs voisins sur la même donnée la traitent PAREIL : (a) normalisation (fréquence mensuel/annuel), (b) exclusions
  (postes épargne = virements, hors dépenses), (c) sémantique des états « indisponible » (une métrique optionnelle sans
  donnée doit être EXCLUE du score comme ses sœurs, pas valoir 0 ni 100 — l'asymétrie FIRE-exclu vs abos-vides-=100 était un faux signal).
  La revue adversariale (workflow ultracode, 5 dimensions × vérification) a trouvé 6 vrais findings ICI et en a réfuté 3 à raison
  (changer la dispo des orphelins aurait donné un faux 100) — sur un calcul $ DÉRIVÉ, elle gagne sa place (≠ le fort taux de faux positifs des reviews fiscales/moteur).
  ⚠️ **Instance fiscale (leçon TAX-AVGRATE-BASE 2026-07-15, Vague 2)** : ÉLARGIR l'assiette d'un calcul (ajouter le revenu de
  placement imposable à la base d'impôt de `get_tax_situation`) a rendu `totalTax`/`netIncome` sur salaire+placement MAIS laissé
  `averageRatePct = totalTax/grossAnnual` (salaire SEUL au dénominateur) → taux moyen sur-estimé (25,1 % vs 21,2 %) + `netIncome`
  non reconstructible depuis `grossAnnualIncome − totalTax`. Le code-reviewer l'a mesuré en exécutant le vrai handler. Réflexe : en
  changeant la BASE d'un numérateur (assiette, montant, période), auditer TOUT dérivé qui partage cette base (ratio/taux au dénominateur,
  identité de reconstruction net=brut−impôt) pour qu'il utilise la MÊME base — et exposer la composante ajoutée (`taxableInvestmentIncome`) pour garder la reconstructabilité.
  ⚠️ **Corollaire heureux — un param optionnel additif avec défaut = la valeur d'avant donne une rétrocompat BIT-IDENTIQUE** (Vague 2) :
  `calculateFiscalReport(..., employmentIncome?)` avec `employmentIncome === undefined ? grossIncome : …` → les ~15 appelants moteur
  (qui ne passent rien) obtiennent la MÊME expression qu'avant, prouvé par projection-validator (golden inchangés, moneyConservation 20/20).
  Étend « champ additif optionnel = zéro migration » (store) à une SIGNATURE de fonction moteur : préférer un param positionnel additif à défaut-neutre plutôt qu'un objet d'options qui retoucherait tous les sites.
  ⚠️ **Sœur — un test `.length > 1` sur un TUPLE de longueur fixe est VACUEUX** (leçon PH4E-OWNER-EDIT 2026-06-22) : `config.users`
  est typé `[User, User]` (tuple), donc `users.length > 1` est TOUJOURS vrai → `isSolo = !user2` (Budget.tsx) était toujours FAUX, la
  section couple s'affichait même en solo (et un `ownerId` orphelin y montrait un montant inexpliqué). Pour « y a-t-il un 2ᵉ conjoint »,
  tester le CONTENU (`users[1]?.name?.trim()`), JAMAIS la longueur d'un tuple. La nouvelle feature (override `ownerId`) a EXPOSÉ ce bug dormant.
- **Findings de review = hypothèses, pas vérités** : une review multi-agents sur du code fiscal/moteur
  a un FORT taux de faux positifs (≈3/8 HIGH financiers FAUX — #2 supposait un revenu nominal alors qu'il
  est déflaté ; #5 prémisse fausse ; FISC-GOVPENSION-SCALE 2026-06-16 : `governmentPension` est un agrégat
  MÉNAGE, pas per-personne → le « fix » ×N aurait double-compté la RRQ+PSV d'un couple). VÉRIFIER chaque
  finding (lecture du vrai code + panel adversarial qui cherche à RÉFUTER) AVANT de coder un fix
  money-critical. Un faux fix dans un moteur d'impôt est pire que le finding non corrigé.
  ⚠️ **Un bug CONFIRMÉ peut viser du code DONT LA SORTIE EST JETÉE — prouver qu'elle est CONSOMMÉE avant de « corriger »**
  (leçon FISC-SRCDED-NOOP 2026-06-26) : le workflow de vérif avait CONFIRMÉ 2 vrais bugs (ordre + unité ~12×) dans
  `computeMonthlyWithholding`. Mais en traçant le flux, sa sortie (accumulée dans `taxCurrentYear.revenu`) était
  **ÉCRASÉE par l'override de décembre** (`=`, V30) avant tout règlement, et jamais appliquée au liquide mensuel
  (`impotSalaireMois=0`) → « corriger » les bugs = **ZÉRO effet**. Le discriminant d'un « est-ce consommé ? » est un
  **TEST DE PERTURBATION** (≠ git-stash) : injecter une valeur absurde dans la sortie suspecte (ici +999 999/mois) et
  vérifier que le golden + les invariants restent **byte-identiques** → si oui, la sortie est jetée (code mort). Quand
  c'est prouvé, la bonne action n'est pas le fix mais le **RETRAIT** du code mort (résout aussi un PERF « mémoïser X »
  voisin — on ne mémoïse pas du code mort, on le supprime). Avant tout fix money-critical, tracer le CONSOMMATEUR final
  de la grandeur (qui la LIT et l'applique au liquide/NW) ; une accumulation suivie d'un override `=` en aval = jetée.
  ⚠️ **La règle vaut HORS fiscal** (leçon A11Y-TAXBRACKET 2026-06-17) : un finding de CONTRASTE a11y
  (« ink-400 régresse l'AA ») se MESURE (`npm run check-contrast`), il ne se DÉDUIT pas du nom du token —
  l'a11y-auditor a supposé « numéro plus haut = plus clair » alors que la palette `ink` va du CLAIR au
  foncé (ink-300 > ink-400 > ink-500) → finding RÉFUTÉ empiriquement (ink-400 = 5,2-6,4:1 ✅, ink-500 =
  3,4-4,2:1 ❌). Chaque domaine a son arbitre outillé : `check-contrast` (a11y), résiduel de conservation
  (moteur $), `git stash` (test discriminant). Mesurer, pas raisonner.
  ⚠️ **Un audit EXTERNE/UX (rendu headless) a un FORT taux de faux positifs sur le money-critical** (leçon
  AUDIT-UX 2026-06-17 : 20 claims → ~40 % FAUX/PARTIEL) : il ne distingue PAS un LIBELLÉ d'un bug (« Budget
  diffère » = `estateNetWorth` successoral, pas un recalcul), un PERSONA de test insoutenable d'un défaut moteur
  (« patrimoine −1,88 M$ » = dette visible d'un retraité à 50 ans, moteur correct), ni une GATE de setup d'une
  page cassée. VALIDER chaque claim contre le vrai code (panel d'agents, preuve `fichier:ligne`) AVANT de
  l'inscrire au backlog. MAIS garder le claim FAUX comme note de PERCEPTION (demande Marc : c'est l'impression
  réelle d'un utilisateur qui ouvre l'app).
  ⚠️ **Un nom trompeur FABRIQUE des faux findings** (leçon FISC-GOVPENSION-SCALE) : la variable
  `rrqBaseIndiv` portait en fait une valeur FAMILIALE → c'est ce qui a induit le finding en erreur. Quand
  un faux positif vient d'un nom/commentaire trompeur, RENOMMER pour auto-documenter (ici `…Indiv→…Family`)
  est le vrai correctif — il prévient la récidive du finding, sans toucher la logique.
  ⚠️ **Prouver qu'un test DISCRIMINE le bug** (leçon FISC-RRQ-PRORATA) : pour un fix money-critical, ne pas
  se contenter de « le test passe ». VÉRIFIER qu'il ÉCHOUE sur le code d'avant : `git stash push -- <fichier
  moteur>` (le fix seul), relancer le test (DOIT échouer), `git stash pop`. Un test vert qui passe AUSSI sur
  le bug ne prouve rien. Pour un bug d'ordre/symétrie (ex. prorata per-conjoint), un test de SYMÉTRIE
  (`f([a,b]) == f([b,a])`) discrimine sans nombre magique. Et « 0 régression baseline » d'un agent ≠ vérité :
  lancer la SUITE COMPLÈTE — un changement peut toucher des fixtures encodant un état INVALIDE inatteignable
  en prod (ex. `canadaArrivalYear` sans `isImmigrant`, gardé par l'UI) ; ce n'est alors pas une vraie régression.
  ⚠️ **Un flux moteur alimente PLUSIEURS registres parallèles (solde, fiscal, per-conjoint, AFFICHAGE) —
  un nouveau producteur du flux doit alimenter TOUS les registres, et chaque correctif partiel doit re-vérifier
  les AUTRES** (leçon WHT-DISPLAY-MELTDOWN/ENG-MELTDOWN-FLOW-INVISIBLE 2026-07-31) : le meltdown REER alimentait
  soldes + bucket fiscal + per-conjoint (rajouté par un audit) mais JAMAIS `retraitReerMois`/`rrspWithholdingMois`
  (affichage) → convention d'impôt DIFFÉRENTE des autres stratégies (ratio MELTDOWN/AUTO 0,601 mesuré — la reco
  « objectif impôt » recommandait MELTDOWN à tort, corrigé) ; ~96 % des sorties absentes de `chartData.RetraitREER`
  (30 496 $ affichés pour 794 303 $ tirés — tooltip/jalons/MCP aveugles). La conservation NE l'attrape PAS
  (compteurs d'affichage, NW intact — prouvé bit-identique) : c'est un invariant de PARITÉ flux-affiché ↔ flux-réel
  qui manquait. ⚠️ Le panel a aussi MESURÉ que le compteur double-compte la retenue pour TOUTES les stratégies
  (avril débite le bucket .reer entier — [PROJ-TTP-DOUBLECOUNT]) et que la FERR a le même trou d'affichage
  ([ENG-FERR-FLOW-INVISIBLE]) : deux passes antérieures avaient corrigé CE bloc sans voir les registres voisins —
  vérifier TOUTES les sources ET tous les consommateurs du registre, pas le seul producteur qu'on corrige.
  ⚠️ **Variante ENTRÉE de la même classe : deux consommateurs d'une MÊME donnée qui la normalisent chacun
  de leur côté DIVERGENT sur les entrées hors-domaine** (mesuré validator #594, 2026-08-12) : le jour d'un
  `eventDays` était clampé par le ledger (`Math.min(nDays, …)`) mais PAS par `axisXAtDay` (courbe) → une
  date impossible restaurée d'un JSON (« 2027-02-29 ») posait la pastille EXACTEMENT sur le tick du mois
  SUIVANT pendant que le ledger l'affichait au 28 — deux vérités à l'écran. Et un clamp SANS arrondi rend
  l'égalité stricte `dayOf(l) === day` insatisfiable sur un jour fractionnaire → label silencieusement
  PERDU. Règle : toute normalisation d'une donnée consommée par PLUSIEURS registres est IDENTIQUE des deux
  côtés (même formule, commentaire croisé) ou extraite en un seul endroit ; « le moteur ne produit jamais
  ça » ne suffit pas quand la surface accepte aussi du restauré/MCP.
  ⚠️ **La magnitude d'un finding d'agent peut être en BRUT là où le flux réel est NET** (leçon
  ENG-TTP-UNSETTLED-HORIZON 2026-08-01) : l'audit #554 annonçait « −49 % du compteur sur 10 ans »
  en sommant les buckets AccruedTax* BRUTS de fin d'horizon — or la réconciliation de décembre y
  loge aussi le REMBOURSEMENT (bucket .revenu négatif) qui compense la retenue : le débit d'avril
  manquant, NET, était 171,89 $ (pas 5 815,50 $) sur la fixture citée, et 8,6 % (pas 49 %) sur le
  scénario solvable. La classe de bug était réelle ; l'erreur de l'audit était de sommer les séries
  AccruedTax* (= année réconciliée 171,89 $ NET + stub de l'année en cours NON réconciliée
  5 643,61 $ de retenues brutes — décomposé au dollar par la contre-vérification #555 ; ma propre
  première explication « le transfert est en janvier » était AUSSI fausse : il est dans le bloc
  décembre, lire taxPreviousYear aurait donné les mêmes chiffres). Règle : re-mesurer le CORRECTIF de l'agent
  (pas seulement son diagnostic) avant de l'implémenter, et exprimer toute dette/flux fiscal en
  NET SIGNÉ — c'est le seul chiffre qu'un règlement débiterait vraiment.
  ⚠️ **Un compteur qui somme un ACOMPTE et le RÈGLEMENT qui le contient compte deux fois**
  (leçon PROJ-TTP-DOUBLECOUNT 2026-08-01, mesuré +144 %) : `totalTaxesPaid` additionnait les
  retenues à la source (cascade/meltdown/FERR) ET `fluxImpots` d'avril — or avril débite le bucket
  `.reer` ENTIER (ces mêmes retenues provisionnées) + le complément de décembre. Le raisonnement
  qui « prouvait » l'absence de double-comptage protégeait l'ASSIETTE (décembre n'ajoute que le
  complément), pas le COMPTEUR (le complément ET les acomptes passent tous deux par avril). Règle :
  pour un compteur de FLUX, sommer les DÉBITS RÉELS d'un seul point de passage (ici Σ FluxImpots),
  jamais un mélange acomptes+règlements ; l'identité compteur == Σ(flux du chart) se verrouille
  par test. Corollaire : un discriminant bâti sur l'ancienne sémantique meurt avec elle — le test
  tiered-vs-flat a dû être repointé sur le flux d'affichage (le taux de retenue n'influence plus
  le compteur, décembre réconcilie au vrai impôt).
  ⚠️ **Un fix d'espace réel↔nominal ne s'applique qu'aux sites du MÊME espace — et la direction
  peut s'inverser selon la phase** (leçon FISC-BRACKET-REALINDEX 2026-08-01) : la double indexation
  (revenu déflaté en réel, paliers ×1,02^Δ nominal) ne vivait QUE dans les sites de taxDecember qui
  déflatent puis re-nominalisent (salarial, combinedTaxFor, RAMQ, FSS). Les blocs voisins gains/
  dividendes du MÊME fichier sont nominal-cohérents (revenu jamais déflaté, impôt jamais
  re-nominalisé) : leur passer le deflator aurait créé le bug INVERSE — le périmètre d'un fix
  d'espace se décide site par site en suivant les ÷/× inflationFactor, pas par fichier. MAIS
  l'énumération doit être EXHAUSTIVE (grep du motif « ÷ inflationFactor … × inflationFactor »
  sur tout services/) AVANT de fermer le périmètre : la passe initiale a raté `latentTax.ts`
  (même motif exact, −53 k$ d'obligation latente affichée à 30 ans) ET a documenté ce site
  « nominal — le bon espace pour lui » dans FISCAL_REFERENCE — une doc qui déclare un site sain
  sans mesure est un piège armé pour la session suivante (trouvé par le panel, 2026-08-01).
  Et la direction mesurée diffère par phase : retraité = impôt à vie +62 % (tout l'impôt transite
  par décembre), salarié = NW en légère HAUSSE. ⚠️ **Le MÉCANISME d'une direction se MESURE terme
  à terme, il ne se déduit pas** : la première explication écrite (« la retenue employeur était
  sur-évaluée, le net d'avril baisse ») était plausible et FAUSSE — mesuré : la retenue MONTE
  (20 495 → 32 879 $ à Δ=29) comme tout l'impôt post-fix. La vraie cause : la prime RAMQ/FSS était
  DOUBLEMENT indexée (766 $ × 1,02^Δ en $ réels puis re-nominalisé, ×1,81 à 30 ans) et son retour
  au niveau légal (−2 050 $/an) domine la hausse d'impôt (+1 077 $/an) sur une fixture sans
  déductions ; le reste est un artefact de l'heuristique 92 % ([FISC-WHT-92PCT] — en mode T1213 la
  direction salariée redevient conservatrice, NW −1,9 %). Le claim faux avait été répété dans
  3 docs (CHANGELOG, ici, commentaire de test) avant d'être réfuté par mesure. Vérifier la
  direction ET son mécanisme PAR PHASE avant d'écrire les commentaires de re-base. Bonus
  rétrocompat : parce que le barème est homogène de degré 1, l'ancien monde == `realDeflator = 1`
  exactement (paramètre optionnel à défaut neutre, zéro migration).
  ⚠️ **Un fix peut TUER l'observable de gardes voisines — réancrer, pas supprimer** (leçon
  FISC-WHT-92PCT 2026-08-01) : passer la retenue employeur à 100 % a rendu STRUCTURELLEMENT nul
  le complément salarial d'avril sans déductions — et 4 tests qui utilisaient ce complément comme
  OBSERVABLE (monotonie brut↑, crédit d'âge actif B-AUDIT-3, ménage fantôme survivant, pins
  unitaires ±8 %) sont devenus vacueux (`0 > 0`). L'invariant qu'ils gardaient n'était pas mort,
  seulement son canal de lecture : chaque garde a été réancrée sur le canal SURVIVANT (le
  remboursement des déductions pour la monotonie et le T1213, la prime RAMQ familiale pour le
  ménage fantôme, l'asymétrie crédit-tronqué-par-déductions pour B-AUDIT-3), avec garde de
  non-vacuité (`< 0` avant le `<`). Réflexe : après un fix qui annule un flux, grep les tests qui
  LISENT ce flux — un test qui passe encore peut être devenu vide, et un test cassé se réancre sur
  ce que l'invariant regarde VRAIMENT, pas sur le chiffre le plus proche.
  ⚠️ **Un réancrage peut être vacueux au 2e ordre — le PROUVER sensible à la variable d'intérêt**
  (leçon FA-10/#558) : le test « ménage fantôme » réancré sur la prime RAMQ familiale passait…
  parce que la prime était SATURÉE au max par adulte (100 k$) — `divers` identique avec un salaire
  fantôme de 80 000 $ ou de 0 $ ; l'assertion ne mesurait que le NOMBRE d'adultes. Le correctif :
  garder TOUTES les autres variables constantes (n=2 des deux côtés) et se placer SOUS la
  saturation (revenus bas) pour que SEULE la variable gardée fasse bouger l'observable. Réflexe :
  après un réancrage, perturber la variable d'intérêt À OBSERVABLE ÉGAL (probe) — pas seulement
  vérifier que le test passe.
  ⚠️ **`git stash` en validation concurrente : 3e course vécue (#558)** — un agent de panel a
  stashé/restauré l'arbre PENDANT que la session principale éditait (2 edits moteur perdus,
  ré-appliqués). La technique SANS mutation qui donne le même discriminant :
  `git archive <ref> | tar -x -C <scratch>` + symlink `node_modules` → on exécute l'ancien code
  dans un dossier jetable, l'arbre de travail n'est JAMAIS touché. À exiger dans tout prompt
  d'agent qui doit comparer avant/après.
  ⚠️ **Un secret a un TRAJET complet écriture→coffre→hydratation→lecture : chaque finding n'en
  répare qu'un segment** (leçon FINTABLE-TOKEN-PERSIST, incident réel 2026-08-05) : le champ
  `fintable` du coffre chiffré était DÉCLARÉ (#535, « pour éviter un chemin non chiffré »),
  l'HYDRATATION le lisait (#545, « jeton perdu à chaque reload » — même symptôme !), mais AUCUNE
  écriture n'y a jamais été branchée : la carte faisait `setAppState` (mémoire) sans `saveApiKeys`
  → jeton perdu au reload, import bancaire gelé 5 jours, découvert par MARC. Deux findings
  successifs ont chacun « réglé » leur segment sans jamais tester le trajet BOUT-EN-BOUT
  (écrire → recharger → lire). Réflexe : pour tout secret/clé, un test qui suit le trajet complet,
  pas des tests par segment. Corollaire diagnostic : une CORRÉLATION DE TIMING (fin d'essai le
  2026-08-01, gel le 2026-07-31) peut désigner le mauvais coupable — l'hypothèse « billing » était
  [Probable] et FAUSSE ; c'est l'observation de l'UTILISATEUR (« il ne garde pas mon jeton ») qui
  a donné la cause. Instrumenter d'abord (la raison `no-token` tournait en boucle SANS surface —
  cf [FINTABLE-STALE-ALERT]).
  ⚠️ **Méta-leçon (panel #559) : le fix qui PORTE cette leçon l'a lui-même violée.** Le premier jet
  ne persistait qu'au `blur` — et le panel a mesuré 3 chemins qui rouvraient le MÊME symptôme :
  (a) fermer l'onglet / naviguer dans l'app / un autofill de gestionnaire de mots de passe n'émet
  AUCUN `blur` sur l'input (un `blur` d'élément ne naît que d'un changement de focus INTRA-document) ;
  (b) le message d'échec du coffre était écrasé par l'erreur réseau suivante et n'était pas logué →
  invisible même dans Diagnostics sous double panne ; (c) deux écritures concurrentes non ordonnées
  → le blob PÉRIMÉ pouvait gagner (dernier écrivain gagne côté `localStorage`). Corrigés dans la
  même PR : flush `visibilitychange`/`pagehide` + démontage, `logError` + région d'alerte SÉPARÉE,
  sérialisation par chaîne de promesses. Réflexe : « écrire au blur » ne veut PAS dire « écrit » —
  pour tout secret/donnée saisie, énumérer les SORTIES possibles du champ (blur, démontage, onglet
  caché, fermeture, autofill) avant de se déclarer couvert. Corollaire d'humilité : la leçon
  fraîchement écrite ne protège pas le commit qui l'écrit — c'est le panel qui l'a attrapée.
  ⚠️ **Un champ AGRÉGÉ sans étiquette fabrique de faux diagnostics — y compris chez Claude**
  (leçon MCP-NETINCOME-MISLEADING, 2026-08-05, erreur COMMISE puis corrigée) : le `netIncome` de
  `get_tax_situation` porte l'assiette IMPOSABLE, donc il inclut le rendement de placement ESTIMÉ
  (12 970 $ chez Marc) — un montant qui n'est JAMAIS encaissé. En le comparant aux dépôts de paie
  réels, j'ai annoncé à Marc un écart de revenu de 12 800 $/an **inexistant** (le vrai écart est
  4 491 $, entièrement expliqué par la progression de ses paies dans l'année ; son salaire saisi
  est bon à 2,4 % près au rythme actuel). C'est Marc qui a demandé la contre-vérification.
  Règles qui en sortent : (1) ne JAMAIS comparer un agrégat fiscal à des transactions bancaires
  sans vérifier ce qu'il agrège — un chiffre encaissable et un chiffre théorique ne se soustraient
  pas ; (2) tout champ de tool MCP qui mélange encaissé et estimé doit l'annoncer DANS la note ET
  offrir la variante encaissable (`netSalaryIncome` : brut − impôt − cotisations, vérifiable au
  relevé — validé à 0,5 % contre 12 mois de dépôts réels) ; (3) le no-fake-data ne s'arrête pas à
  l'UI : un tool qui nourrit une IA est une surface de vérité au même titre qu'un écran.
  ⚠️ **Des fixtures de test à dates ABSOLUES vieillissent contre un NOW fixe** (leçon HIST-STORE-SIZE
  2026-08-01) : les tests de fusion d'historique utilisaient des closes datés « 2026-01-10 » avec un
  NOW figé à 2027-01-15 — l'ajout de la politique d'âge (downsample > 365 j) les a fait basculer du
  côté « vieux » et a changé le SENS du test (2 échecs qui ressemblaient à une régression de fusion).
  Pour un test qui ne teste PAS l'âge : générer les dates RELATIVES au NOW injecté (daysAgo(n)), pas
  en littéraux — sinon chaque nouvelle politique temporelle réinterprète les fixtures.
  ⚠️ **Un chemin par défaut TYPÉ « dépense » avale tout nouveau type de flux** (leçon ENG-HERITAGE-INFLOW
  2026-07-31, rapporté par Marc) : `applyLifeEvents` routait TOUT type hors KRACH/perte-de-revenu/vente vers
  `addExpense` — le type `HERITAGE` (offert par l'UI avec tips « investissez-le ») était DÉBITÉ comme une dépense
  one-shot, impact net −2× le montant, et AUCUN moyen UI de l'inverser. Quand un dispatch a une branche par défaut
  qui impose un SIGNE (dépense/rentrée), chaque type doit déclarer le sien explicitement — un enum qui grandit ne
  crie pas quand sa nouvelle valeur tombe dans le mauvais défaut. Fix : branche `HERITAGE` → `addLiquid` (non
  imposable au bénéficiaire, ARC), testée AVANT la détection « vente » par sous-chaîne.
  ⚠️ **Un helper $ PARTAGÉ porte sa garde non-fini LUI-MÊME, pas ses appelants** (leçon panel #552 2026-07-31) :
  la garde « valeur non finie → exclue + tracée » de `presentEquityOfGoal` vivait dans UN des TROIS consommateurs
  (le KPI ; le graphe historique et `hasRealEstate` avalaient un `mortgageBalance` NaN → l'hypothèque ENTIÈRE
  disparaissait du patrimoine affiché, mesuré 500 k$). Une garde côté appelant se copie mal et dérive ; dans le
  helper, elle couvre les consommateurs FUTURS aussi. Corollaire silent-failure : `fin(NaN) → 0` sans logError
  = neutralisation muette interdite (no-fake-data).
  ⚠️ **Un nouvel actif présent AU BOOT doit ensemencer TOUTES les graines qui résument l'état initial**
  (leçon panel #552 2026-07-31, cousin « état initial » de la leçon meltdown ci-dessus) : brancher le bien passé
  dans `propertiesState` SANS re-semer `prevNW`/`minNetWorth` (calculées avant que le moteur publie l'équité) a
  créé un « flux fantôme » diffNW[0] de +156 629 $ ET un `minNetWorth` sous-évalué de 158 731 $ → biais pessimiste
  dans safetyScore/goalSeek/strategyRanking. La conservation ne l'attrape pas (les GRANDEURS sont justes, ce sont
  les DÉRIVÉES de la graine qui mentent). Grep les `let xxx = currentRawNetWorth()`-style seeds quand l'état
  initial gagne un constituant.
  ⚠️ **Un registre PER-CONJOINT qui passe de SHADOW à PILOTE doit gérer TOUS les événements de vie (décès)**
  (leçon ITEM-2C-FERR 2026-06-25) : brancher la FERR au per-conjoint (chaque conjoint convertit SA part `reerByUser[i]`
  à SON âge) a créé un FLUX FISCAL FANTÔME — après le DÉCÈS du conjoint, sa part (registre `[1]`) continuait de
  FERR-convertir comme un « contribuable mort de 100 ans », imposée au survivant (+63 k$, baseline FISC-SURVIVOR-DRAWDOWN
  cassée, `surv > base` inversé). Fix : au déclenchement de `survivorMode`, ROULER la part du défunt vers le survivant
  (`reerByUser = [Σ, 0]`, roulement REER conjugal ARC sans impôt). Quand un registre per-conjoint devient money-critical,
  auditer décès/divorce/tout event qui doit le redistribuer — la conservation NE l'attrape PAS (l'argent reste conservé,
  c'est le TIMING fiscal qui fantôme). ⚠️ **2ᵉ occurrence de la course git-stash concurrente** (cf [[FISC-WHT-HARDCODE]]) :
  la suite-gate a RE-fini exit 0 pendant que les agents stashaient → seul le run ISOLÉ a révélé la casse survivor.
  L'agent qui a MESURÉ en isolation (projection-validator) l'emporte sur l'exit 0. Vérifs money-critical EN ISOLATION, séquentielles.
  ⚠️ **3ᵉ occurrence (2026-08-12, PR #592) — l'agent VÉRIFICATEUR a modifié les SOURCES pendant que je corrigeais** : un agent
  du panel encore actif a réintroduit chirurgicalement la régression fraîchement corrigée dans `dailyCurve.ts` (commentaires
  « RÉGRESSION #592 simulée ») pour prouver que les tests discriminent — sans restaurer. Mes tests ont viré au rouge sur du code
  que je n'avais pas écrit. Détection : le code sur disque contredisait mon édition → `git diff HEAD` AVANT tout débogage.
  Règles renforcées : (a) agents à droits d'écriture actifs ⇒ stager EXPLICITEMENT ses fichiers (jamais `git add -A`) et relire
  le diff stagé ; (b) un test rouge pendant qu'un panel tourne peut l'être sur le code D'UN AUTRE — diff d'abord, debug ensuite ;
  (c) les prompts d'agents de vérification interdisent la modification des sources (sondes en scratchpad UNIQUEMENT, et toute
  preuve par mutation se fait sur une COPIE ou se restaure dans le même souffle).
  ⚠️ **Gate per-conjoint d'ÂGE : ancrer sur `ctx.age` + l'ÉCART d'âge, PAS `users[i].age` brut** (leçon ITEM-2C-PSV
  2026-06-25) : passer le départ PSV/RRQ + le bonus 75+ au per-conjoint, en gatant chaque conjoint par `users[i].age + yearsElapsed`,
  a cassé 10 tests `retirementIncome` — ils passent `ctx.age` (âge de retraite, ex. 65) ≠ `users[i].birthYear` (métadonnée), donc
  l'âge brut donnait un user0 « trop jeune » → RRQ=0. Et gater user0 sur `ctx.age` (fixe) brisait le test de SYMÉTRIE (échange des
  conjoints). Le bon modèle : `ageOfUser(i) = ctx.age + (âgeDépart_i − âgeDépart_0)` (user0 = `ctx.age` authoritative ; conjoint =
  ctx.age + écart). Symétrique pour âges égaux (écart=0), cohérent quand un test passe `ctx.age` ≠ users[0].age, et IDENTIQUE en prod
  (`ctx.age == users[0].age + yearsElapsed`) → golden inchangé. NB : choix de scope sûr — le mode SURVIVANT garde le modèle familial
  inchangé (per-conjoint au décès = raffinement séparé) → zéro risque sur FISC-SURVIVOR.
  ⚠️ **Invariant STRUCTUREL/d'ORDRE : la preuve s'INVERSE** (leçon ENG-LOOP-ORDER-TEST 2026-06-18) : pour un test
  qui verrouille un comportement DÉJÀ correct (ordre de la boucle, séquençage), il n'y a pas de « fix à `git stash »`
  — le code sain EST l'état courant. La discrimination se prouve en INTRODUISANT temporairement l'inversion, le plus
  CHIRURGICALEMENT possible (pas de déplacement de bloc chaud risqué) : ex. passer à `applyMonthlyGrowth` un snapshot
  PRÉ-allocation des soldes (`celi: _SWAP_celi`, `contribNonReg: 0`…) pour simuler « croissance avant allocation »,
  relancer le test (DOIT échouer), puis `git checkout -- <fichier>` (sûr car le fichier moteur n'a AUCUNE modif voulue
  sur la branche — sinon Edit inverse ciblé, cf. piège git checkout). Signal discriminant net : un actif investi parti
  de 0 ne peut afficher de croissance le mois M que si sa contribution l'a financé AVANT la croissance ce mois-là — sous
  l'inversion la somme tombe à 0. Et un tel décalage CONSERVE l'argent (les 12 invariants de conservation NE l'attrapent
  PAS) : c'est précisément l'angle mort qu'un test d'ordre comble.
  ⚠️ **Vérifier le FIX empiriquement, pas que le bug — et MESURER les findings d'agents** (leçon FISC-REER-WHT-DOUBLE
  2026-06-16) : pour un bug de CONSERVATION du moteur, mesurer le résiduel `ΔNW − (épargne+croissance−impôt)` mois
  par mois sur un scénario ciblé (ex. retraité qui décaisse son REER) EXPOSE la fuite directement (ici = retenue/mois).
  Même une analyse quantitative d'agent peut livrer un fix FAUX : le 1er jet (« shortfall -= brut ») ne conservait PAS
  (prouvé algébriquement ET par le résiduel) ; seul le test empirique (exécuter le moteur, mesurer le résiduel) a donné
  le vrai fix (retenue = acompte CONSERVÉ au liquide → retrait NW-neutre, débité 1× en avril). Et un finding d'agent peut
  être FAUX : le code-reviewer a « mesuré » `totalTaxesPaid` inchangé par le fix (état pollué) et recommandé de NE PAS
  baisser un seuil de test — RÉFUTÉ par `git stash` avec/sans fix (266,6 → 215,1 k$, −51 k$ : « le 50 000 » de Marc).
  MESURER (stash), ne jamais trancher au raisonnement. Le résiduel de conservation est l'ARBITRE, pas l'analyse.
  ⚠️ **Deux agents du panel peuvent se CONTREDIRE sur une grandeur money-critical** (leçon FISC-EVENT-INCOMELOSS
  2026-06-18) : `financial-integrity` a MESURÉ que l'impôt salarial de décembre est INCHANGÉ par une perte de revenu
  (`accGrossIncomeYear` n'alimente que l'espace REER de l'an+1, ΔFluxImpots = 0), pendant que `projection-validator`
  RAISONNAIT l'inverse depuis la structure du code. Ne pas MOYENNER les avis ni suivre le plus détaillé : **l'agent
  qui a MESURÉ (exécuté le scénario, comparé la valeur) l'emporte sur celui qui a déduit**. Un raisonnement « le
  champ X alimente le calcul Y » sur une grandeur $ se VÉRIFIE en exécutant, jamais en lisant le code.

## Commandes (exactes, package.json)
- Dev `npm run dev` · Build `npm run build` (⚠️ `prebuild` = `lint` ; build CASSE si lint échoue)
- ⚠️ **Typecheck : `npm run typecheck`, JAMAIS `npx tsc`** (piège 2026-07-15) : `npx tsc` peut résoudre un
  TypeScript DISTANT (vu : 6.0.2 téléchargé qui IGNORE `--noEmit` et affiche l'aide → « vert » trompeur +
  20 tests « échoués » dans le même appel par pollution d'environnement). Le script npm force le tsc local (5.8).
- `npm run lint` · `npm run typecheck` (clean) · `npm run test` · `test:watch` · `test:e2e`
- `npm run knip` · `npm run check-contrast` · MCP : `mcp:dev`/`mcp:auth`/`mcp:connect`/`mcp:pack`
- ⚠️ **Vérifier qu'une classe Tailwind est GÉNÉRÉE : build PROPRE (`rm -rf dist`) AVANT de grep le CSS** (leçon
  A11Y-BADGE-PROMINENCE 2026-06-19) : le build Rolldown/Vite peut servir un asset CSS en CACHE → un grep du `dist/`
  périmé rend « classe absente » (count 0) à tort, m'a coûté un cycle de debug. Un build propre confirme la vraie
  génération (ex. `border-*-400/55` — l'opacité sur shade imbriqué FONCTIONNE ici). Le `commit-gate` build ne PROUVE
  pas qu'une classe se génère (build « réussi » même si une classe est silencieusement omise) → grep du CSS propre.
  ⚠️ **Un outil-garde à valeurs RE-CODÉES EN DUR dérive en SILENCE (protection nulle) → LIRE la source unique** (leçon
  A11Y-CHECK-CONTRAST-DRIFT 2026-07-16) : `scripts/check-contrast.ts` re-codait les hex des tokens (`surface #151922`,
  `primary #10b981`) qui avaient dérivé de `tailwind.config.js` (`#0E1014`, `#e6eaf2`) → il « testait » des combos qui
  n'existaient plus (0 protection, sans erreur). Fix durable : IMPORTER `tailwind.config.js` et dériver les tokens (pas
  re-coder) + garde anti-scan-vide (bg≥3, text≥8 sinon exit 2, cf FISC-CONST-LINT) + exclure les surfaces de l'ensemble
  « texte » (sinon « surface sur surface »=1.00 bruit) + ne tester que les HEX opaques (rgba translucide = composition, hors périmètre).
  ⚠️ **Sœur : un SHADE hors de la palette = no-op SILENCIEUX** (leçon FIX-INK600-TOKEN 2026-06-22) : `text-ink-600`
  était utilisé dans ~9 endroits alors que la palette `ink` (`tailwind.config.js`) s'arrête à **500** → aucune règle CSS
  générée, le texte HÉRITE la couleur du parent (intention « atténué » perdue, contraste imprévisible, AUCUNE erreur de
  build/lint). Avant d'écrire `text-<couleur>-<N>`, vérifier que `<N>` existe dans la palette (`ink` = 50→500 ; va du
  CLAIR au foncé). Choisir le shade par MESURE (`npm run check-contrast`), pas au jugé : `ink-400` passe AA normal (≥4,5),
  `ink-500` AA large seulement (3,4-4,2). ↻ **RÉCIDIVE PH4-C 2026-06-22** : `text-info-300` (palette `info` = **400/500/600**
  seulement) → corrigé `info-400`. Le bug REVIENT malgré la leçon (l'a11y-auditor l'attrape, mais c'est tard) → AUTO-CHECK
  systématique : tout `text-/bg-/border-<couleur>-<N>` ajouté → confirmer `<N>` dans `tailwind.config.js` AVANT de committer.
  ⚠️ **Un compte d'occurrences par grep NAÏF peut être gonflé par des homonymes-substrings** (leçon
  A11Y-INK500 2026-08-12) : `grep ink-500` matche AUSSI `pink-500` — le ticket disait « 115 occurrences »,
  la réalité était 107 (6 `pink-500` + 2 commentaires). Un sed aveugle sur ce compte aurait CASSÉ la couleur
  rose (`accent-pink-500` → `accent-pink-400` inexistant = no-op silencieux, cf. leçon shade hors palette).
  Mesurer avec une frontière (`(?<!p)ink-500`) et classifier par-occurrence : ici 85 textes actifs migrés
  `ink-400`, 22 gardés légitimes (glyphes aria-hidden, icônes-boutons ≥3:1 WCAG 1.4.11, présentationnel).
  ⚠️ **Un style écrit en IMPÉRATIF (el.style.x) sur un nœud que React style AUSSI ne sera pas
  « corrigé » par React** (leçon FUTUR-MOBILE-LAYOUT 2026-08-12) : React ne diffe que contre SES
  valeurs précédentes, pas contre le DOM — si un hook a posé `left: 412px` en impératif et que le
  JSX repasse de `left: 0` à `left: 0`, React ne réécrit RIEN et le 412px impératif survit au
  changement de mode. Au basculement flottant ↔ bottom-sheet du tooltip, la solution est un
  REMOUNT par `key` différente (style vierge garanti) + un débrayage explicite de l'écriture
  impérative (`dockedRef`) — jamais « les deux écrivent et on espère l'ordre ».
  ⚠️ **Cacher VISUELLEMENT ne retire pas du TAB-ORDER** (leçon D6-KBD 2026-08-12) : `max-h-0` +
  `overflow-hidden` (accordéon animé) et `opacity-0` laissent les contrôles focusables — Tab pose le
  focus sur un élément invisible, perdu à l'écran. Seuls `visibility: hidden` (classe `invisible`),
  `display: none` ou `inert` retirent du tab-order. Et l'inverse du même terrain : un contrôle
  `disabled` est SAUTÉ par Tab — un état « désactivé tant que le conteneur est replié » rend le
  contrôle inatteignable au clavier en marche avant quand c'est précisément le FOCUS qui déplie le
  conteneur (l'ordre Tab → focus → dépliage arrive trop tard). Règle : dans un conteneur
  repliable-au-focus, les contrôles restent TOUJOURS actifs (atteint = opérable) et le contenu
  replié passe `invisible`.
  ⚠️ **Un fix de hover-contraste ne se COPIE pas d'une couleur à l'autre** (leçon A11Y-BANNER-HOVER-CONTRAST 2026-07-16) :
  `hover:brightness-110` passe sur info-600 (4,81:1) mais échoue de justesse sur danger-600 (4,48:1) → là, le hover doit
  FONCER (`brightness-90` = 5,23:1). `brightness()` CSS opère en RGB LINÉAIRE (la luminance scale exactement du facteur —
  une approx sRGB×f sous-estime) ; recalculer le ratio PAR base, jamais recopier le facteur d'un fix voisin.

## Tests
- Tests pour TOUTE nouvelle logique. Priorité `services/projection/`. Ne pas baisser la couverture.
- ⚠️ **Mesurer une valeur depuis un test (discriminant git-stash, sonde) : vitest 4 INTERCEPTE `console.log`** (leçon WHT-DISPLAY-EXACT
  2026-06-26) — la sortie n'apparaît PAS en `vitest run` (m'a coûté 2 cycles à grep dans le vide). Écrire via `process.stderr.write(...)`
  (non intercepté) ou dans un fichier (`writeFileSync`), PUIS grep. Réflexe pour un git-stash de mesure : log → run NOUVEAU → `git stash push --
  <fichiers moteur>` → run ANCIEN → `git stash pop`, SÉQUENTIEL (jamais en // d'agents qui stashent, cf course git-stash), working tree isolé.
- ⚠️ **Testing-library `getByText('123 $')` sur un montant `formatCAD` : la CHAÎNE attendue n'est PAS normalisée**
  (leçon BUDGET-3-VUES 2026-07-23) : le texte DOM est normalisé (`\s+`→espace simple, ce qui CONVERTIT les espaces
  insécables U+00A0/U+202F de formatCAD) mais le matcher string est comparé BRUT → « Unable to find "123 $" » alors
  que la cellule est là. Normaliser l'attendu (`formatCAD(n).replace(/[  ]/g, ' ')`) ou matcher par regex.
  Sœur (direction d'un vecteur non-fini) : `NaN` ne FRANCHIT PAS un gate de signe (`NaN < 0` === false → tx ignorée,
  aucune contamination) — le vecteur qui le franchit est `-Infinity` ; prouver la PRÉ-CONDITION du test (la valeur
  brute est bien non finie) avant d'asserter la garde, sinon test vacant (cf NAN-INPUT-HARDENING).
- ⚠️ **Après un changement de FIXTURES/personas, relancer la SUITE VITEST COMPLÈTE — pas seulement les tests ciblés**
  (leçon R6-MICRO-ASSET 2026-06-22) : ajouter un MICRO-actif (~182 $) à un persona « fauché » a cassé 2 tests à SEUIL
  GROSSIER keyés sur un binaire « a-t-il des avoirs » (`personaAudit` + `futureSeedContinuity` : `investedTotal/seed.TOTAL > 1000`)
  — le micro-actif fait « a des avoirs » MAIS < 1000 → faux échec. Les tests ciblés (`typecheck` + le test du diff) passaient ;
  seule la suite complète l'a vu (signalé en CI après 3 cycles). Fix = clé sur la VRAIE valeur du portefeuille du persona, pas
  un binaire. Le `commit-gate` lance bien `npm run test` complet — mais VÉRIFIER soi-même AVANT, surtout si un agent (code-reviewer)
  l'a explicitement recommandé.
- **Garde-fou money-critical** : `tests/services/projection.moneyConservation.test.ts` (12 invariants de
  conservation de l'argent). À ÉTENDRE — pas affaiblir — à chaque bug financier trouvé. Voir la checklist
  « VALIDATION FINANCIÈRE » dans « Règles non négociables ».
- ⚠️ **Zod `.positive()`/`.min()`/`.max()` n'excluent PAS `Infinity` → `.finite()` OBLIGATOIRE sur tout `z.number()` de montant $**
  (leçon MCP-WHATIF 2026-07-13, prouvé par le panel : `price: Infinity` passait le schéma → le moteur drainait RÉELLEMENT
  REER/CELI vers un achat impossible → impact fabriqué −76 k$ « sans erreur »). Seuls les `.int()` rejettent Infinity par
  construction. Et un test qui appelle le HANDLER directement (harnais captureTool) BYPASS la validation Zod du SDK → la
  logique métier doit AUSSI garder (`Number.isFinite`, ceinture) — le schéma est la bretelle, pas la ceinture.
- ⚠️ **Assertion NaN/Infinity : asserter la valeur BRUTE (`Number(x)`), JAMAIS via un helper qui SANITISE**
  (leçon NAN-INPUT-HARDENING/INV-8 2026-06-23) : `Number.isNaN(num(x))` où `num = isFinite(Number(v))?…:0`
  est TOUJOURS faux → assertion VACANTE (faux-vert qui « garde » zéro). L'INV-8 était vacant ainsi pendant des
  mois. Pour tester une garde anti-NaN, lire la valeur SANS sanitisation. Et **vérifier la DIRECTION du finding** :
  `|| 0` rattrape NaN (falsy) mais PAS Infinity ; `?? 0` ne rattrape NI NaN NI Infinity (que null/undefined) ;
  l'arithmétique nue propage les deux. Donc « ce site a un `|| 0` donc il fuit NaN » est FAUX — auditer `||` vs
  `?? ` vs nu AVANT de garder (sinon on durcit des faux positifs). Garder TOUS les inputs d'une fonction, pas
  seulement ceux flaggés (le panel a trouvé `rateAnnual` NaN non gardé dans `applyMidMonthGrowth`, à côté de startVal/endVal).
- ⚠️ **`.gcloudignore` = syntaxe GITIGNORE (pattern NU matche à TOUS les niveaux) ≠ `.dockerignore`** (leçon
  MCP-CLOUDRUN-IGNORE 2026-07-14, vu en PROD, DEUX crashs de suite mal diagnostiqués) : un `tools` nu dans
  `.gcloudignore` (destiné au dossier RACINE `tools/`) excluait AUSSI `mcp/tools/` de l'upload Cloud Build → les
  15 `*.tool.ts` ABSENTS de l'image → `Cannot find module ping.tool` (runtime tsx) PUIS `Could not resolve
  ./tools/ping.tool` (build esbuild). J'ai d'abord accusé tsx (faux), puis esbuild (faux) : la VRAIE cause = fichiers
  jamais uploadés. Fix : ancrer les dossiers du front à la RACINE avec `/` (`/tools`, `/store`, `/tests`…) — prouvé
  (`git check-ignore` : `tools`→`mcp/tools` OUI, `/tools`→NON). **Réflexe #1 sur un « Could not resolve »/module
  manquant en conteneur : lire la LISTE DES FICHIERS uploadés dans le log Cloud Build (FETCHSOURCE/inflating) — un
  dossier absent = pattern `.gcloudignore` trop large, PAS un bug de résolution du bundler/runtime.**
- ⚠️ **Serveur TS en conteneur : BUNDLER (esbuild) au build reste PRÉFÉRABLE à `tsx` runtime** (démarrage instantané,
  résolution figée, zéro deps runtime) — `mcp/build-server.mjs` bundle `http.ts` → `dist-mcp/http.js` autonome (prouvé :
  démarre sans `node_modules`), `CMD ["node", "dist-mcp/http.js"]`. NB : ce n'était PAS la cause des crashs ci-dessus
  (c'était `.gcloudignore`), mais on le garde. Réflexe complémentaire : lire aussi les LOGS RUNTIME
  (`gcloud run services logs read <svc> --region … --limit 50`) — « failed to listen on PORT » est générique, le vrai
  message est dans les logs du conteneur ; et les LOGS DE BUILD (`gcloud builds log --region <r> <id>`) pour un échec de build.
- ⚠️ **`Dockerfile` : `ENV NODE_ENV=production` APRÈS `npm ci`, pas avant** (leçon MCP-CLOUDRUN-DEPLOY 2026-07-13,
  2 agents) : `NODE_ENV=production` avant l'install fait sauter les devDependencies → `tsx` (runtime TS du serveur)
  absent de l'image → `CMD npx tsx` retélécharge à chaud à chaque cold start (supply-chain + panne). Installer avec
  `npm ci --include=dev` PUIS fixer `NODE_ENV`. Et `gcloud run deploy --source` n'a PAS de flag `--dockerfile` → le
  Dockerfile doit être à la RACINE du contexte (Vercel l'ignore, il détecte Vite par `package.json`). Bootstrap
  Cloud Run : l'issuer OAuth (`FINANCEAI_PUBLIC_URL`) est exigé AU BOOT mais l'URL n'existe qu'après le 1er deploy →
  1ʳᵉ passe avec un placeholder (`https://pending.invalid`), récupérer l'URL, `update` ; réutiliser l'URL existante
  aux passes suivantes (zéro fenêtre). IAM `secretAccessor` sur les 3 secrets (pas juste 1) sinon la révision échoue.
- ⚠️ **Valider un `redirect_uri`/une origine = `new URL()` + comparaison d'ORIGINE EXACTE, JAMAIS `startsWith`**
  (leçon MCP-CLOUDRUN-B 2026-07-13, finding CRITIQUE prouvé par 2 agents) : `uri.startsWith('http://127.0.0.1')`
  laisse passer `http://127.0.0.1.evil.com/cb` (sous-domaine) ET `http://127.0.0.1@evil.com/cb` (userinfo → host
  réel = evil). Sur un endpoint OAuth `/oauth/register` PUBLIC, ça = account takeover par phishing. Parser
  (`new URL`), comparer `u.origin` exact (ou `u.hostname` dans un Set pour le loopback), et REJETER tout
  `u.username`/`u.password`. Corollaire OAuth 2.1 : code à USAGE UNIQUE + rotation refresh (jti consommés) —
  un design stateless pur les autorise à rejouer ; le best-effort en mémoire suffit pour un serveur mono-instance,
  le vrai kill-switch d'incident = rotation de la clé de signature (invalide TOUT).
- ⚠️ **Tester un serveur HTTP local : forger `Host`/`Origin` exige `node:http` BRUT** (leçon MCP-CLOUDRUN-HTTP
  2026-07-13) : `fetch` (undici) IGNORE ces en-têtes interdits → un test anti-DNS-rebinding via fetch « passe » à
  tort (200 au lieu du rejet). Sœur : répondre 413 PENDANT un upload → DRAINER le reste du corps (flag settled,
  mémoire plate), JAMAIS `req.destroy()` — le RST jette la réponse déjà envoyée (ECONNRESET client, vu 2×). Et
  `onerror` du transport MCP SDK est une PROPRIÉTÉ (`transport.onerror =`), pas une option du constructeur.
- **Lire un fichier du repo dans un test** (doc/source à scanner — ex. fiscalFreshness, futur FISC-CONST-LINT) :
  `readFileSync(resolve(process.cwd(), 'chemin'))` — PAS `new URL('…', import.meta.url)` : `import.meta.url`
  n'est PAS de scheme `file://` après transform Vite → « The URL must be of scheme file » (leçon
  HARDEN-FISCAL-TIMEBOMB 2026-06-18). Vitest tourne depuis la racine du projet.
- **Un test qui SCANNE le code (garde-fou type FISC-CONST-LINT) doit PROUVER son volume** (leçon FISC-CONST-LINT
  2026-06-18) : un scan qui rend 0 fichier (mauvais `cwd`, `readdirSync` muet) ou 0 motif (regex cassée) PASSE à
  vide = protection NULLE silencieuse. Toujours asserter `files.length > N` ET `motifs.length > M` AVANT le scan.
  Et **strip les commentaires** avant d'extraire/scanner des nombres : un n° de ligne de formulaire (« ARC ligne
  23500 ») en commentaire pollue sinon des deux côtés (faux positifs).
- ⚠️ **Test d'ALTÉRATION (« tamper 1 caractère » d'un jeton/signature) : choisir le caractère de remplacement
  d'après celui qu'on REMPLACE** (leçon OAUTH-TAMPER-FLAKE 2026-07-21, flake CI ~1/64) : `slice(0,-2) +
  (token.endsWith('A')?'B':'A') + slice(-1)` regardait le DERNIER caractère pour remplacer l'AVANT-dernier →
  quand l'avant-dernier valait déjà la valeur choisie, `tampered === original` (rien d'altéré) → « invalid_token
  attendu, jeton accepté » en CI, intraçable localement. Règle : `const c = s.at(pos); remplacement = c === 'A' ? 'B' : 'A'`
  sur LA position modifiée — et un test à entrée aléatoire (jeton signé) qui échoue rarement = suspecter d'abord
  une altération NO-OP de ce genre, pas le code produit.
- **Test LONG (fuzz/property-based) : timeout EXPLICITE + lecture stricte** (leçon HARDEN-FUZZING 2026-06-18) : le timeout
  Vitest par défaut est **5 s** → un fuzz de ~15 s échoue en « Test timed out » qui RESSEMBLE à une vraie violation
  (m'a coûté un tour de debug : j'ai cru à un bug de conservation). Passer le timeout en 4ᵉ arg de `it(…, …, ms)` et
  le dimensionner sur le nombre de runs. Pour un fuzz de CONSERVATION, lire les champs en STRICT (NaN/Infinity → throw,
  jamais silencés en 0 par un `num()` permissif, sinon `NaN > EPS === false` = faux-vert) et **seed FIXE** (CI
  déterministe, zéro flake). Prouver la discrimination END-TO-END (injecter une fuite dans le moteur → le fuzz doit
  échouer, puis revert), pas seulement un test unitaire de la formule.
- **Fuzz à FLUX OPTIONNELS (`fc.option`) : MESURER la couverture, pas la supposer** (leçon FUZZ-ONETIME-FLOWS 2026-06-19) :
  générer un flux (ex. achat immo→hypothèque) ≠ l'EXERCER. Mesurer combien de runs le touchent vraiment (ici 257/500 ont
  `DetteTotale > DettesNonImmo`) et clamper le générateur pour le garantir (achat ≥ 2 ans avant la fin de l'horizon, sinon
  ~0 mois sous hypothèque). « Acheter et DÉTENIR » ≠ tester la VENTE : documenter explicitement les flux NON exercés
  (vente/gain en capital, revenu locatif, équité négative…) au lieu de laisser le nom du test suggérer une couverture
  qu'il n'offre pas. Et pour un invariant qui est une IDENTITÉ structurelle (`DetteTotale ≥ DettesNonImmo`, écart = hypo ≥ 0),
  prouver quand même la discrimination e2e (drop d'un terme de `DetteTotale` côté moteur → l'invariant lève) + une assertion
  de NON-vacuité (∃ mois réellement sous hypothèque).
- **Sommer un objet de SOLDES qui porte un champ `TOTAL`/agrégat dérivé = double-comptage** (leçon NW-PARITY-INVARIANT
  2026-06-19) : `derivePortfolioStartingBalances` retourne `LiveCSVBalances = {CELI, …, REEE, TOTAL, historicalRate}` où
  `TOTAL = Σ buckets`. Sommer NAÏVEMENT tous les `Object.values` double-compte `TOTAL` (+ ajoute `historicalRate`) → j'ai
  cru à un faux bug moteur « 2× au démarrage » (15 536 vs 7 760) pendant une longue investigation, alors que c'était mon
  TEST. Sommer SEULEMENT les 6 buckets nommés. Plus largement : avant de crier au bug money-critical sur un écca ~2×/rond,
  suspecter un champ agrégat/dérivé recompté côté test AVANT de plonger dans le moteur (écart ~2× = signature classique).
  Et : `computePresentNetWorth` (NW
  présent UI) EXCLUT l'immobilier par design alors que `chartData[0]` du moteur l'INCLUT → toute parité présent↔moteur est
  définie HORS immobilier (sinon l'écart = l'équité immobilière, attendu).
- **Test e2e conservation sur un scénario IMMOBILIER : `unexplained` n'est PAS l'arbitre — utiliser la RECONSTRUCTABILITÉ** (leçon
  FISC-RE-CAPITAL-LOSS 2026-06-19) : le helper `unexplained` (`ΔNW − (épargne+croissance+impôt)`) n'est valable QUE pour un mois SANS
  événement (INV-2) — il n'inclut PAS le passage cash→équité d'un achat/vente immo, donc il SPIKE de ~la mise de fonds au mois d'achat
  (vu : résiduel 110 385 = le cash d'achat → faux échec). Pour un scénario immo, l'invariant de conservation est la RECONSTRUCTABILITÉ
  `NetWorth = Σactifs − DettesNonImmo` (INV-9, `DettesNonImmo` jamais `DetteTotale` sous hypothèque), qui tient à CHAQUE mois (achat,
  vente, re-flux). Et : **un achat immo dans le moteur se REPORTE si le cash est insuffisant à la date d'achat** (vu : achat mois 12→21,
  log « Achat reporté ») → un test qui VEND une propriété doit donner ASSEZ de `calculatedStartingCash` pour que l'achat ait lieu À TEMPS,
  sinon la vente ne trouve aucun bien acheté (`saleIdx = −1`, test vacant). MESURER que le flux s'exerce vraiment (ex. assert le log
  « Perte en capital » apparaît) — calque la leçon [[FUZZ-ONETIME-FLOWS]] « générer un flux ≠ l'exercer ».
- **Prouver une ABSENCE = chercher l'ID/le symbole dans TOUT le dépôt, jamais constater l'immobilité du fichier PRESSENTI**
  (leçon tenue BACKLOG 2026-08-12, attrapée par documentation-manager AVANT merge) : pour re-vérifier si
  `[NW-PARITY-SURFACES-TEST]` était livré, j'ai constaté que `nwParity.test.ts` (le fichier que le ticket disait
  « à étendre ») n'avait pas bougé depuis #384 → déclaré NON-livré, ligne V3 « corrigée »… à tort. Le livrable
  vivait dans un fichier NOUVEAU (`nwParitySurfaces.test.ts`, describe à l'ID, livré #552). Un ticket qui dit
  « étendre X » peut être livré en créant Y : la preuve d'absence est un `grep -r` de l'ID sur tout le dépôt
  (comme la preuve de présence), pas un `git log` du fichier candidat. Double ironie mesurée : l'erreur est née
  DANS une passe anti-PM-STALE, et c'est la relecture d'agent qui l'a interceptée — même une vérification peut
  vérifier la mauvaise chose.
- **Un paramètre HOMONYME à deux niveaux (config globale vs entité) : vérifier lequel le code LIT avant de le câbler**
  (leçon FUZZ-ONETIME-FLOWS lot final, 2026-08-12) : `propertyGrowthRate` existe sur `ProjectionConfig` ET sur
  `RealEstateGoal` — le moteur ne lit QUE le champ par-bien (`goal.propertyGrowthRate || 3`, realEstateMonth.ts:354) ;
  le champ config n'est lu par AUCUN code de prod (réglage fantôme, → `[ENG-PROPGROWTH-CONFIG-DEAD]`). L'avoir câblé
  côté config était un no-op parfaitement typé, vert au typecheck, et INVISIBLE sans mesure : c'est le test de
  COUVERTURE MESURÉE (sonde d'EFFET sur le chartData, plancher asserté par flux) qui l'a attrapé — équité négative
  0/120 — dès sa première exécution. Deux règles concrètes : (1) avant de câbler un paramètre (test OU prod), grep le
  CONSOMMATEUR réel, pas le type ; (2) la sonde de couverture vérifie l'EFFET produit, jamais le paramètre généré —
  un paramètre avalé par le mauvais niveau compte alors pour zéro au lieu de compter pour couvert.

## Stack
React 19.2 + Vite 8 (Rolldown) + TS 5.8 strict + Tailwind 3 · Zustand 5 (persist+partialize, schema v7,
migrations v1→v7) · Zod 3 · Recharts 3 (lazy) · Vitest 4 + Testing Library + axe-core ·
@anthropic-ai/sdk (Sonnet 4.6 + Haiku 4.5) · @modelcontextprotocol/sdk · Finnhub + CoinGecko ·
i18next · jspdf. Prod : **Vercel** (`vercel.json` : headers sécurité + cache + SPA).

## Structure (PLAT — pas de src/)
Racine : `App.tsx`, `index.tsx`, `constants.ts`, `types.ts`, `i18n.ts`.
Dossiers : `components/ hooks/ services/ store/ utils/ locales/ mcp/ e2e/ tests/ scripts/ docs/`.
Cœur : `services/projection.ts` + `services/projection/` (41 sous-modules).
⚠️ Hoister un import au niveau App tire ses deps dans le bundle de BOOT → lazy-charger (lazyWithRetry
+ Suspense) tout composant/service app-level qui importe du lourd (ex. `ProjectionEngine` → moteur
projection ; PH2-c : index 660→536 kB gzip après bascule lazy).

## Règles non négociables
- **Future = source unique** : tout calcul long-terme vient de `lastProjection.chartData`.
  Réf : `docs/PROJECTION_OUTPUT_SCHEMA.md` (détail refactor « source unique » dans `docs/HISTORIQUE.md`).
  ⚠️ **Avant d'AJOUTER un calcul/détection côté UI sur la projection, VÉRIFIER que le moteur ne l'émet pas déjà**
  (leçon R2-FIRE 2026-06-20) : R2 allait recalculer « FIRE atteint » dans l'UI alors que le moteur émet DÉJÀ le lifeEvent
  `'Objectif FIRE Atteint 🔥'` (`projection.ts:1438`, dans `chartData.lifeEvents`) → recompute = DOUBLON (à un mois différent :
  seuil UI nominal vs moteur inflaté) + contournement de la source unique. La revue ADVERSARIALE (workflow ultracode) l'a
  attrapé. Réflexe : `grep` le moteur (`services/projection*`) pour le concept (FIRE, retraite, jalon…) AVANT de le recalculer ;
  s'il existe, le CONSOMMER (matcher le label/champ) et juste le présenter, pas le refaire.
- ⚠️ **FIGER une vue dérivée = SUBSTITUER à la lecture UNIQUE de la source, pas par-surface** (leçon PROJECTION-PERSIST
  2026-07-16, demande Marc « la projection reste + badge pas à jour ») : `FutureProjection` lit `lastProjection` en UN point
  (`results`) dont TOUT l'aval dérive (courbe, KPIs, événements, plan) → `results = gelIDB ?? live` fige TOUT de façon cohérente
  (geler seulement la courbe aurait mélangé KPIs frais et courbe figée). Pattern de persistance d'un état de révélation :
  **petite SIGNATURE dans le store persisté** (voyage par la sync Drive → cross-PC) + **gros blob figé en IDB device-local**
  (~1-2 Mo, jamais synchronisé) avec repli HONNÊTE si le blob manque (autre PC : live + badge). ⚠️ Gel COUPÉ en mode test, dans
  les DEUX sens : afficher le blob réel en démo persona fuiterait les vraies données à l'écran ; laisser le miroir tourner
  écraserait le blob réel par du persona — ⚠️ et gater TOUS les verbes, la SUPPRESSION comprise (panel : lecture et écriture
  étaient gardées mais « Ré-optimiser » en démo persona SUPPRIMAIT le blob réel — même classe que PERSONA-PURGE). ⚠️ Un état
  UI click-gated qui devient PERSISTÉ peut être vrai DÈS le montage → 3 pièges (tous trouvés par le panel) : (1) **fenêtre
  « révélé sans résultat » au boot** — la sig persistée dit « affiche » mais le moteur n'a pas republié (~300 ms+) → KPIs
  « 0 $ » affichés avec assurance (no-fake-data violé) ; garde `results !== null` sur TOUTES les branches de visibilité +
  état de chargement honnête (« se recharge », pas l'écran d'amorçage qui crie « perdu ») ; (2) **vol de focus au montage** —
  ne focuser que sur TRANSITION false→true (ref valeur-précédente, immune StrictMode ; un flag « sauter le 1er passage » ne
  l'est pas) ; (3) **une string de comparaison in-memory devenue PERSISTÉE+SYNCHRONISÉE change de coût** — stocker un HASH
  court, pas le JSON complet des params (~dizaines de Ko dupliqués dans localStorage + chaque push Drive). ⚠️ Un effet-miroir
  qui écrit l'IDB à chaque publication moteur n'est sûr que si le producteur ne publie QUE sur vrai changement (vérifié :
  ProjectionEngine memoïse + debounce 300 ms) ET avec une dédup par référence MODULE-LEVEL — un composant démonté/remonté
  par onglet (TabRouter) ré-écrirait sinon ~1-2 Mo chiffrés à CHAQUE visite.
- **No-fake-data** : zéro donnée simulée en prod. Projection non calculée → `<ProjectionRequired>`.
  ⚠️ **Une valeur NON FINIE interpolée NUE dans un prompt IA fabrique une fausse donnée PLAUSIBLE** (leçon AI-PROMPT-FAKE-ZERO
  2026-07-16) : `roundToHundred` rendait `0` pour NaN/Infinity → « 0 $ » crédible envoyé au modèle (pire qu'un « — » honnête).
  Fix : garder à la FRONTIÈRE de formatage du prompt (`promptCad` → `(non disponible)` si non fini ; `formatNumber` → « — »),
  jamais un défaut numérique. ⚠️ La classe ne se limite PAS aux `$` : un RATIO calculé inline (`downPayment/price*100` → `Infinity%`
  si `price===0`) est le MÊME piège — l'ai-reviewer a trouvé ce voisin latent ; garder/omettre tout quotient affiché dans un prompt.
- **Valeurs fiscales** : toute constante fiscale (plafonds, paliers, taux, RRQ/PSV/SRG, montants
  de base) DOIT venir de `docs/FISCAL_REFERENCE.md` (datée + sourcée). Jamais de chiffre fiscal
  en dur non sourcé. Audit : agent `financial-integrity` (ex-`fiscal-accuracy`, vs `docs/FISCAL_REFERENCE.md`).
  ⚠️ **Une constante fiscale NON SOURCÉE peut être EMPRUNTÉE au MAUVAIS crédit — la vérifier contre la source PRIMAIRE,
  pas juste la « re-sourcer plus tard »** (leçon TP1G-VIVANT-SEUL 2026-07-07) : le seuil « couple » 45 270 $ (+ solo
  27 835 $) de la ligne 361 QC était en réalité le seuil du crédit **ligne 462** (soutien aux aînés) — le code CONFONDAIT
  deux crédits distincts → les couples étaient SUR-crédités. `financial-integrity` a tranché [Certain] (la ligne 361 a un
  seuil UNIQUE sur le revenu familial, statut-indépendant) CONTRE le doc. Un chiffre fiscal sans source n'est pas « à
  re-sourcer un jour » : il est SUSPECT (peut être structurellement faux, emprunté à un autre formulaire/ligne) → confirmer
  la FORME du crédit (Annexe/ligne exacte) avant de bâtir dessus. Corollaire : au moment d'AJOUTER un montant à un panier
  de crédits, auditer que les VOISINS du même panier viennent bien du même crédit (cf [[PH4D-BUDGET-RATIOS]] version fiscale).
- **Unités argent** : `config.users[].grossSalary`/`netSalary` (store) sont **MENSUELS** (convention
  canonique, `utils/salary.ts`). Annualiser **×12** pour toute comparaison annuelle (MGA, paliers
  fiscaux) — sinon bug d'échelle ~12× (vu sur la RRQ, FISC-RRQ-UNIT 2026-06-15).
- **`Asset.currentPrice`/`buyPrice` sont en devise NATIVE du titre** (USD/EUR/CAD + champ `currency`,
  cf `AddStockForm`) → toute valeur/somme affichée passe par **`assetValueCad`** (`services/portfolio.ts`,
  source unique prix natif × `toCurrencyFactor` + garde NaN). ⚠️ Leçon ASSET-FX-DISPLAY 2026-07-14 :
  6 surfaces sommaient qty×prix SANS FX → patrimoine SOUS-affiché de ~70 k$ (160 352 « $ » = 69 k USD +
  84 k EUR + 7 k CAD bruts vs ~230 k$ CAD réels) — et comme TOUTES les surfaces visibles étaient fausses
  pareil, l'utilisateur avait ANCRÉ le chiffre faux : quand le MCP (fx-correct) a affiché ~230 k$, c'est
  le chiffre JUSTE qui a été pris pour un bug. Réflexe : app et MCP divergent sur un montant d'actifs →
  suspecter la CONVERSION DE DEVISE en premier, et l'arbitre est le COURTIER (vérité terrain, ici 250 k$).
  Garde anti-récidive : `tests/services/assetFxGuard.test.ts` (scan du code, volume prouvé) interdit toute
  multiplication qty×currentPrice sans fx sur la ligne. Les % (gains, poids) restent des ratios NATIFS ;
  les stats DCA (`computePurchaseStats`) comparent des prix natifs entre eux — ne JAMAIS y injecter du CAD.
  ⚠️ **RESSERRER un scan-garde RÉVÈLE les instances LATENTES de la même classe de bug** (leçon FX-GUARD-TIGHTEN
  2026-07-15, Vague 1) : le garde acceptait un `fx`/`factor` NU sur la ligne (`fxRates[cur] || 1`) → le trou même
  qu'il prétendait fermer. En le durcissant à `assetValueCad|toCurrencyFactor` SEULEMENT (pour attraper le bypass
  connu `pdfReport.ts:123`), il a AUSSI exposé un 2ᵉ bypass dormant dans `useDerivedFinancials` (breakdown CELI/REER)
  que la regex laxe passait depuis toujours → un seul item BACKLOG a corrigé DEUX sites. Réflexe : quand tu resserres
  un lint/scan de garde, lance-le AVANT de coder le fix ciblé — la liste des offenders révélés = le vrai périmètre.
- **Formatage $ = `formatCAD` (`utils/format.ts`) UNIQUEMENT** (leçon FMT-CURRENCY-UNIFY 2026-06-17) :
  JAMAIS `n.toLocaleString()` NU (sans locale → hérite du runtime, rend en-US `164,400` hors du navigateur
  fr-CA de l'utilisateur — c'est ce que l'audit headless a vu), JAMAIS `` `${n.toFixed(0)}$` `` (pas de
  séparateur de milliers → `1100$`) ni une division affichée brute (`target/12` → `746.667$`). Utiliser
  `formatCAD` (déterministe fr-CA, NaN→« — »), `formatSigned({withCurrency:true})` pour `±`, `formatCompactCAD`
  pour les axes/tooltips compacts. Idem pourcentages → `formatPercent`. Garde-test : `/\d{4,}\$/` interdit au rendu.
- **Patrimoine net = source UNIQUE** (`services/projection/netWorth.ts` `computeRawNetWorth`) :
  `NetWorth = Σ(actifs) − liquidDebt − smithManoeuvreDebt − activeDebtsTotal`. `realEstateEquity` est
  DÉJÀ net d'hypothèque (ne JAMAIS re-soustraire `mortgageBalance`). Le moteur mensuel (`rawNetWorth` +
  `prevNW`, donc `diffNW`) ET la succession (`estateCalculation`) appellent ce helper — jamais de copie
  locale de la formule (une copie qui oublie un terme = patrimoine faux ; bug MONEY-PHANTOM 2026-06-16 :
  dettes jamais soustraites + découvert invisible → « -193 k$ qui ne fait pas de sens »). `prevNW` DOIT
  toujours = `rawNetWorth` du mois précédent (sinon `diffNW`/« Variation nette » faux). Cohérent avec
  `financialSnapshot.ts` (`netWorth = placements + cash − dettes`).
  ⚠️ **Garder un calcul $ en HOT-PATH contre NaN : garder l'AGRÉGAT, pas chaque terme ; throttler le log** (leçon
  HARDEN-NETWORTH-NAN 2026-06-19) : `computeRawNetWorth` est appelé mensuel × Monte-Carlo. Vérifier `Number.isFinite`
  sur le RÉSULTAT (1 check, formule littérale inchangée) PUIS, seulement si non fini (rare), diagnostiquer/rabattre
  chaque terme sur 0 + `logError`. Le `logError` du moteur DOIT être throttlé (1×/signature de termes fautifs) — sinon
  un état persistant-NaN en MC appelle `logError` des milliers de fois (chaque appel écrit le localStorage → thrash UI).
  Et un finding d'agent sur le scrub PII se MESURE : `SENSITIVE_KEY_PATTERNS` est ANCRÉ (`^debt$`), pas substring → une
  clé `liquidDebt` n'est PAS redactée (faux positif réfuté `node -e` ; cf [[posture de l'agent]] « mesurer, pas raisonner »).
  ⚠️ **`estateNetWorth` (succession) est NOMINAL et inclut la NPV des rentes publiques RRQ/PSV** (leçon
  FISC-ESTATE-PENSION-NPV 2026-06-18, `estateCalculation.ts`) : (1) la NPV = montant **MENSUEL ANNUALISÉ ×12**
  avant le facteur d'annuité ANNUEL `(1−(1+r)^-n)/r` (oubli du ×12 = rentes ~12× sous-évaluées au bilan
  successoral — n'affecte PAS le NW mensuel ni les 12 invariants, `computeEstateNetWorth` est appelé
  POST-simulation). (2) Les rentes RRQ/PSV sont INDEXÉES à l'inflation = une COUVERTURE → NE PAS comparer
  `estateNetWorth` entre scénarios d'inflation comme proxy d'érosion « réelle » (la rente gonfle nominalement
  et peut faire DÉPASSER l'estate sous hyper-inflation, ce qui est CORRECT) ; l'érosion se teste sur le
  portefeuille `finalNetWorth`, pas l'estate.
  ⚠️ **Étendre la discipline au PRÉSENT** (audit financier 2026-06-17, `docs/AUDIT_FINANCIER_2026-06-17.md`) :
  les consommateurs du NW *présent* doivent AUSSI router par `computeRawNetWorth`/`computeTotalDebt`. L'audit a
  trouvé `useDerivedFinancials.globalNetWorth` (Dashboard) et `AiAssistant` (+ FX en dur `1.38`/`1.50` au lieu de
  `fxRates`) qui OMETTENT les dettes → NW gonflé vs moteur/IA (`financialSnapshot` le fait bien). `INV-1` ne garde
  que le FUTUR (`chartData`) ; un test de PARITÉ « NW présent (toutes surfaces UI/IA) ≡ `chartData[0]` ≡
  `computeRawNetWorth` » sur un persona endetté MANQUE = garde-fou keystone recommandé. Règle générale : un bug $
  résiduel vit là où la source unique est CONTOURNÉE (recalcul local au lieu du helper).
  ⚠️ **Changer la SÉMANTIQUE d'un agrégat partagé casse SILENCIEUSEMENT les DÉRIVATIONS** (fix H1 2026-06-17) :
  passer `globalNetWorth` de brut (cash+placements) à net (−dettes) a cassé `TabRouter` `availableCash =
  globalNetWorth − placements` (donnait `cash`, devenu `cash−dettes` → mise de fonds immo amputée des dettes) —
  attrapé par `silent-failure-hunter`, PAS par les 2075 tests. Réflexe : `grep` TOUS les consommateurs et vérifier
  les DÉRIVATIONS algébriques (`X − Y`), pas seulement les sites d'affichage `netWorth={X}`.
- **Secrets** : clés via l'UI seulement, jamais en dur/versionnées, exclues du localStorage/backups.
- **Mode discret (vie privée, choix Marc 2026-06-17)** : masquer un montant = NE PAS rendre la valeur. Utiliser
  `<PrivateAmount>`/`<PrivateBlock>` qui rendent `•••` (`aria-hidden`) + un `sr-only` « Montant masqué » → la
  vraie valeur **sort du DOM**. JAMAIS un simple blur CSS (`privacy-blur`) : il laisse la valeur en clair
  (copier-coller / inspecteur / lecteur d'écran / désactivation de classe) — fuite Loi 25. Pas de survol-révèle.
  ⚠️ **État vide « — » (A11Y-DASH-SRONLY 2026-07-24) : `components/ui/emptyAware` = MIROIR de PrivateAmount** —
  quand la valeur rendue EST le tiret « — » (sortie de `formatCAD`/`formatPercent` sur une valeur non finie), il
  rend `<span aria-hidden>—</span>` + `<span class="sr-only">Pas de donnée</span>` (un SR lit sinon « tiret cadratin »/
  rien). Corrigé au CENTRE — le slot `value` des composants PARTAGÉS (`KPIStat` hors privacy, branche non-privée de
  `PrivateAmount` → couvre `DualKPIStat`), JAMAIS site-par-site : un état vide global se détecte à la CHAÎNE (string
  exactement « — » après trim), pas à chaque `formatCAD(x)`. Ne traite QUE la chaîne-tiret exacte (montant réel/nœud composé passe intact).
  ⚠️ **Champ ÉDITABLE → `<PrivateNumberInput>` (focus-to-edit), JAMAIS `type=password` ni `privacy-blur`** (leçon
  SEC-PRIVACY-BLUR-INPUTS 2026-06-23) : en mode discret hors-focus il rend `•••` SANS spread `...rest` (donc `value`
  HORS du DOM, comme `<PrivateAmount>`), et révèle un vrai `<input>` au clic/focus clavier ; il re-masque au blur ET
  via `useEffect([isPrivacy])` si le mode discret est (ré)activé EN cours d'édition (sinon la valeur reste visible).
  `type=password` NE suffit PAS (la `.value` reste dans le DOM). Pièges attrapés par le panel a11y/code-reviewer :
  (1) le `id` doit aussi aller sur le `<button>` masqué (sinon `<label htmlFor>` cassé en mode discret) ; (2) focus
  via `ref`+`useEffect`, pas `autoFocus` (fiabilité clavier + ne casse pas le contrat de prop) ; (3) `focus-ring` +
  `min-h-[24px]` sur le bouton (l'`outline-none` hérité de l'input rend le focus invisible / cible < 24 px).

### Checklist VALIDATION FINANCIÈRE (money-critical — à passer avant tout merge touchant un calcul $)
> Demande Marc 2026-06-16 : « plus jamais d'erreur comme ça ». Tout changement à `services/projection/`,
> `utils/tax.ts`, un solde, un flux, une dette ou un impôt DOIT cocher :
- [ ] **Conservation** : `npm run test -- projection.moneyConservation` vert (**12 invariants** : reconstructabilité,
  ΔNW expliqué, dette réduit le NW, principal neutre, achat immo conserve, pas de solde négatif, NaN guardé, hypothèque
  non double-comptée, retenue REER=acompte, meltdown NW-neutre, insolvable→dette). Ne JAMAIS affaiblir un invariant pour
  « faire passer » — corriger le code. ⚠️ **Arbitre RIGOUREUX = forme-bilan** `ΔNW == ΔΣactifs − ΔΣdettes` (+ ΔÉquité_immo) :
  la forme `ΔNW − (épargne+croissance−impôt)` n'est qu'un DÉPISTAGE et FAUX-POSITIVE sur les flux one-time (véhicule/réno/
  principal de dette/immo/héritage, hors `Income`/`Expenses` par design — audit 2026-06-17, faux positif vu jusqu'à 336 k$).
  ⚠️ **Mais la forme-bilan NE suffit PAS pour la CORRECTION d'un flux one-time** (leçon FISC-RE-SALE-RESIDUAL 2026-06-19) :
  un `Math.max(0, …)` qui EFFAÇAIT le déficit d'une vente quasi-underwater (frais > équité) passait ET la forme-bilan ET la
  reconstructabilité (le déficit effacé + l'équité retirée sont COHÉRENTS au bilan — ΔNW = −équité, ΔΣactifs = −équité), tout
  en étant économiquement FAUX (patrimoine surévalué de `|saleNet|`). Le discriminant doit alors asserter la MAGNITUDE
  ÉCONOMIQUE attendue du flux (ex. vente immo → ΔNW = −5 % de la valeur, pas −équité), pas seulement la cohérence interne
  du bilan. Prouver par `git stash` que le test ÉCHOUE sur l'ancien code (ici ΔNW −7965 ancien vs < −13000 fix).
  ⚠️ **Un bucket partagé ÉCRASÉ (`=`) dans un hot-path JETTE en silence tout ce qui y a été accumulé par AILLEURS** (leçon FA-6
  2026-06-23) : `taxCurrentYear.revenu` recevait la retenue salariale mensuelle ET les ajustements W5 (crédit-don, impôt locatif/
  CCPC) ; décembre faisait `taxCurrent.revenu = totalAnnualTax − retenue` (`=`, taxDecember active) → les ajustements W5 étaient
  JETÉS pour un salarié actif (crédit-don sans effet, loyers/CCPC non imposés). La conservation NE l'attrape PAS (l'argent reste
  cohérent — c'est l'impôt qui est faux, pas un leak). ⚠️ **Le fix « évident » `=`→`+=` est un FAUX FIX** : il double-compterait la
  retenue salariale (qui partage le bucket). Le vrai fix = router les ajustements vers un bucket qui SURVIT déjà (`divers`, jamais
  écrasé, juste `+=` RAMQ/FSS), via un mutateur dédié — sans toucher le `=`. Réflexe : avant de « réparer » un écrasement, lister
  TOUT ce qui alimente le bucket (le `=` en remplace peut-être une partie LÉGITIMEMENT) ; préférer déplacer ce qui doit survivre.
  ⚠️ **Un crédit NON REMBOURSABLE modélisé sans plafond à l'impôt dû SUR-crédite** (FA-6-CREDIT-CAP, même classe que FISC-RE-SALE-RESIDUAL) :
  conservation-safe mais économiquement faux pour un donateur dont l'impôt < crédit. Le panel `silent-failure-hunter` l'a vu là où
  `financial-integrity`/`projection-validator` (qui ont MESURÉ la conservation, verte) ne l'ont pas signalé — **une violation économique
  passe la conservation** (le discriminant doit asserter la MAGNITUDE économique, pas la cohérence du bilan). Fix propre (FA-6) : champ
  séparé `donCredit` accumulé, plafonné en décembre à `grossIncomeTax + gains` (là où la liability est connue), excédent perdu (pas de
  report). Discriminant : retirer le `Math.min` → le test « revenu bas » sur-crédite. Le bon point de cap est là où l'impôt BRUT est
  calculé (décembre), PAS au true-up (avril) ni à l'application du crédit (janvier, liability inconnue).
- [ ] **Reconstructible** : sur tout point, `NetWorth = Σ(actifs affichés) − dettes affichées` (à l'euro près).
  Un patrimoine net affiché ne doit JAMAIS être inexpliqué par l'UI (le modal `FutureDetailModal` montre la dette).
  ✅ **Reconstructabilité sous hypothèque RÉSOLUE (M5, audit 2026-06-17)** : utiliser `monthlyOutput.DettesNonImmo`
  (= activeDebts + liquidDebt + smithManoeuvre, SANS hypothèque) → `NetWorth = Σactifs − DettesNonImmo` tient TOUJOURS,
  même sous prêt (`Immobilier` = équité déjà nette). `DetteTotale` garde l'hypothèque (dette BRUTE affichée), donc
  `Σactifs − DetteTotale = NW − mortgage` SOUS prêt → pour reconstruire le NW, utiliser `DettesNonImmo`, jamais `DetteTotale`.
  Garde : INV-9 (reconstructabilité DettesNonImmo < 2 $ + discriminant DetteTotale).
- [ ] **Pas de flux fantôme** : TOUT débit qui dépasse les actifs est porté en `liquidDebt` VISIBLE — un débit
  one-time (`subtractLiquid` : réno/véhicule/objectif) MAIS AUSSI le **shortfall mensuel** d'un retraité insolvable
  (FISC-BROKE-LIQUID-FLOOR 2026-06-17 : le coussin `criticalThreshold` protégé masquait un déficit non financé qui
  s'évaporait — ΔNW ne baissait pas, +shortfall/mois ; le rescue PV-6 ne l'attrapait pas car liquid restait ≥0).
- [ ] **Unités** : mensuel vs annuel (×12) cohérent ; pas de double-indexation ; pas de double-imposition
  (retenue créditée 1× ; net ≠ brut selon le poste).
- [ ] **Test discriminant prouvé** : `git stash push -- <fichier moteur>` → le test ÉCHOUE sur le code d'avant →
  `git stash pop` (cf « Posture de l'agent »). Un test vert qui passe AUSSI sur le bug ne prouve rien.
  ⚠️ **Reverter UN changement dans un fichier qui porte AUSSI d'autres modifs voulues = Edit CHIRURGICAL, jamais
  `git checkout -- <fichier>`** (leçon HARDEN-NETWORTH-EXHAUSTIVE 2026-06-18 : pour prouver une garde, j'avais
  cassé temporairement la formule de `computeRawNetWorth` PUIS `git checkout -- netWorth.ts` pour la restaurer —
  ça a effacé AUSSI la garde `NET_WORTH_SIGN` ajoutée dans le MÊME fichier non commité). `git checkout --` ET
  `git stash push -- <fichier>` reverteraient TOUT le working-tree du fichier ; pour ne restaurer qu'une portion,
  re-Editer les seules lignes ciblées.
- [ ] **Suite COMPLÈTE** + `typecheck` clean + panel (`projection-validator`, `financial-integrity` si fiscal/calcul $,
  `silent-failure-hunter` pour les NaN/échecs avalés). Un finding = hypothèse → vérifier avant de coder.

## Automatisation (hooks `.claude/settings.json`)
- **SessionStart** → `session-brief` injecte l'état (SESSION_HANDOVER + quick wins) : la reprise est automatique.
  **+ [ACC Lot 5]** démarre le dashboard Agent Control Center (`tools/agent-control-center/server.mjs`, port 4317,
  détaché, s'auto-termine sur EADDRINUSE) et surface son URL `http://127.0.0.1:4317` dans le brief → présence « un clic »
  (Marc épingle le preview une fois). Non-bloquant. Le dashboard montre les 14 agents (message+transcription) + backlog + workflows.
- **PostToolUse (Edit|Write)** → `auto-lint` : `eslint --fix` sur le `.ts/.tsx` modifié (jamais bloquant).
- **PreToolUse (Bash)** :
  - `commit-gate` → avant tout `git commit` : `typecheck` + `test` + `build` doivent passer, sinon commit BLOQUÉ.
  - `guard` → bloque `rm -rf` sensible, `--no-verify`, écriture `.env`. **Le `git push` est AUTORISÉ**
    (Claude gère commit→push→PR→merge ; cf Workflow ci-dessus).
  - `learn-on-push` → sur `git push` : RAPPEL non-bloquant « leçon apprise → delta CLAUDE.md ? » **+ « un agent
    `.claude/agents/` à mettre à jour ? »** (applique « CLAUDE.md/agents s'améliorent à chaque push »). Pipe-tester un hook stdin : **Git Bash**
    (`echo '{...}' | node …`), PAS PowerShell 5.1 qui ne livre pas le stdin à un exe natif. ⚠️ Idem pour toute COMMANDE DONNÉE À MARC : son poste = Windows PowerShell (openssl ABSENT, vu 2026-07-06) → donner du `node -e crypto.randomBytes(...)` ou du PowerShell natif, jamais du openssl/bash.
    Matcher `push` comme SOUS-commande git (après `git` + options globales), pas « push »
    n'importe où — sinon faux positif sur un nom de branche en -push (révélé en live par le hook).
- **Gate sécurité opsera** (plugin tiers `opsera-devsecops`, PreToolUse/Bash) bloque `git commit` jusqu'à
  un scan. RÉSOLU 2026-06-16 : opsera AUTHENTIFIÉ (OAuth via l'outil MCP `authenticate` → URL navigateur).
  Flux LÉGITIME du gate (zéro bypass) : `security-scan` (scan_mode `pre-commit`) avec les CLI installés —
  `gitleaks` (winget) + `semgrep` (pip, OK Windows natif / Py 3.14) — → scan propre → `touch
  /tmp/.opsera-pre-commit-scan-passed` (<5 min) → le commit passe. Ne JAMAIS toucher le flag sans scan réel.
  ⚠️ **`touch` le flag dans un appel Bash SÉPARÉ AVANT le `git commit`** (piège 2026-06-17) : le hook PreToolUse
  évalue la commande AVANT son exécution → `touch flag && git commit` dans le MÊME appel = flag absent au check →
  BLOQUÉ. Séquence correcte = (1) scan, (2) `touch` (appel seul), (3) `git commit` (appel seul).
  ⚠️ **semgrep hors PATH** (piège 2026-06-17, a coûté 3 tours) : le wrapper `semgrep.exe` casse (« pysemgrep
  introuvable ») et `python -m semgrep` est DÉPRÉCIÉ (exit 2) → prepend `~/AppData/Roaming/Python/Python314/Scripts`
  au PATH puis appeler `semgrep --config p/javascript <fichier>` (v1.166 OK). gitleaks : `gitleaks protect --staged`.
  Sur un changeset SANS code applicatif (`.md`/`.mjs`), grype/checkov/hadolint sont hors sujet (déps/IaC/Docker).
  **Aikido** (scanner préféré de Marc) : token dans l'env var UTILISATEUR `AIKIDO_API_KEY` (lue au
  DÉMARRAGE du serveur MCP → redémarrer Claude Code ; `aikido_login` à chaud ne tient PAS pour `aikido_full_scan`).
- Avant de merger, lancer `/review-all` (panel d'agents), puis `commit-gate` fait la vérif déterministe.
- ⚠️ Les hooks tournent AUSSI en exécution cloud (Claude Code web) dès que `.claude/settings.json`
  est committé. `commit-gate` relance la suite complète **uniquement si des `.ts/.tsx` sont stagés**
  (~5 min — voulu) ; un commit de docs/config/hooks est instantané. `guard` laisse passer le push
  mais bloque toujours `rm -rf` sensible / `--no-verify` / `.env` (en ignorant le corps des messages).
- ⚠️ **`HOOK-WRONG-MECHANISM` (2026-08-14)** — j'ai conclu « le hook `commit-gate` n'est pas installé
  dans ce conteneur » parce que `.git/hooks/` ne contenait que des `.sample`, et je l'ai **annoncé à
  Marc**. C'était FAUX sur les deux points : `commit-gate` n'a jamais été un hook **git**, c'est un
  hook **Claude Code** (`PreToolUse` sur Bash → `scripts/hooks/commit-gate.mjs`), donc `.git/hooks/`
  vide est l'état NORMAL ; et il tournait bien. Ce que j'ai pris pour son absence était en réalité
  son comportement documenté : `touchesSource` est faux quand aucun `.ts/.tsx` n'est stagé, donc un
  commit de docs pur sort en `exit 0` immédiatement — voulu, et écrit juste au-dessus dans ce
  fichier. **La leçon générale** : constater qu'un mécanisme est absent de l'emplacement où l'on
  SUPPOSE qu'il vit ne prouve rien sur son existence. Localiser l'implémentation (`grep` du nom dans
  la config) AVANT de conclure — a fortiori avant de l'annoncer. Même famille que
  `DOC-STALE-IMPOSSIBILITY` : un constat d'absence est une hypothèse, pas une mesure.

## Notes
- ⚠️ **[GARDE-AU-PRODUCTEUR — RÉCIDIVE LE JOUR MÊME] 2026-08-18.** J'ai écrit le MATIN la leçon
  « un test au producteur ne prouve rien sur la chaîne » (`GARDE-AU-PRODUCTEUR-NE-PROUVE-PAS-LA-CHAINE`,
  après les flèches Veille/Lendemain livrées cassées), et je l'ai REFAITE l'après-midi sur le
  rattrapage Fintable : mon test assérait `r.incertaines` — la sortie du classeur — pendant que
  `applyBankStatement` reconstruisait chaque transaction CHAMP PAR CHAMP et jetait `isDuplicate`,
  non déclaré dans `BankTransaction`. **Tout le classement était un no-op**, et les doublons à
  libellé différent étaient écrits comme de vraies dépenses : double comptage dans le budget.
  Trouvé par un audit, pas par mes 16 tests.
  ⚠️ **Ce qui a rendu la faute invisible** : un `as typeof p.transactions` posé pour faire passer un
  type structurel a fait taire TypeScript sur le champ surnuméraire. Un cast qui « débloque » un
  branchement est un endroit où le compilateur cesse de vérifier la chose même qu'on ajoute.
  **Règles** : (1) quand on ajoute un CHAMP à une donnée qui traverse une frontière, vérifier que le
  consommateur le DÉCLARE — une reconstruction champ par champ jette tout le reste, en silence ;
  (2) l'assertion doit viser l'état ÉCRIT (`statePatch.transactions`), jamais la valeur de retour du
  module qu'on vient d'écrire ; (3) écrire la leçon ne suffit pas — c'est le TEST qui l'applique.
- ⚠️ **[DEUX-DEDUPS-QUI-SE-CONTREDISENT] 2026-08-18 — deux protections correctes, composées, en
  détruisent une troisième chose.** `applyBankStatement` écarte par CLÉ (`date|montant|payee`) :
  bon garde-fou pour un relevé ponctuel. Le rattrapage Fintable classe avec un invariant
  d'APPARIEMENT UNIQUE (une existante n'absorbe qu'une entrante) : bon pour un recouvrement
  volontaire. Composées, la clé s'applique APRÈS et supprime les entrantes surnuméraires que le
  classement venait de protéger — **3 vraies dépenses identiques → 1 écrite** (mesuré). Chaque
  moitié est défendable ; leur superposition perd de l'argent.
  **Règle** : quand deux couches dédupliquent la même donnée, en désigner UNE comme autorité pour
  le chemin concerné, explicitement (`callerClassified`), plutôt que de laisser la composition
  décider. Et le test doit porter sur l'état écrit — au niveau de chaque couche il est vert.
- ⚠️ **[GARDE-BORNEE-PAR-CLASSE-NEGATIVE] 2026-08-17 — borner une syntaxe IMBRIQUÉE avec `[^x]*` est
  faux par construction, et la garde devient aveugle EN SILENCE.** Le scan qui interdit une valeur
  dans le `title` d'une primitive de masquage bornait la balise avec `<Private…[^>]*>`. Or un `>`
  apparaît DANS la balise bien avant sa fin, dès qu'un `className` interpolé contient une
  comparaison : `className={\`… ${totalFlow >= 0 ? 'a' : 'b'}\`} title="…"`. Le `[^>]*` s'arrêtait
  sur le `>` de `>=` — le `title` n'était jamais lu. **Mesuré : 3 des appels réels étaient dans ce
  cas, et une fuite plantée derrière laissait la garde VERTE.**
  ⚠️ **Et ma preuve de discrimination ne l'avait pas vu** : j'avais posé la fuite d'essai sur une
  balise SANS comparaison — un cas favorable, choisi sans le savoir. Une preuve de discrimination
  ne vaut que si le cas d'essai est REPRÉSENTATIF ; sur un scan de syntaxe, ça veut dire l'essayer
  sur la forme la plus TORDUE du dépôt, pas sur la plus simple. Trouvé par la revue auto (#646),
  après merge.
  **Règles** : compter la PROFONDEUR (`{`/`}`) au lieu d'une classe négative ; et surtout
  **tester l'EXTRACTEUR sur des cas de syntaxe construits**, pas seulement le balayage du dépôt —
  un balayage vert ne prouve rien tant que l'extracteur peut être aveugle.
  ⚠️ Corollaire : ajouter un anti-vacuité sur ce que la garde TROUVE (ici « au moins 3 `title`
  vus », valeur MESURÉE et non estimée). Le compteur de primitives seul ne suffisait pas : il
  restait à 253 pendant que le compteur de `title` tombait à 0.
- ⚠️ **[TEST-AU-CONTRAT-NE-VOIT-PAS-L-APPELANT] 2026-08-17 — un composant testé à son CONTRAT ne dit
  rien de ce qu'on lui passe.** Les flèches Veille/Lendemain du panneau de détail avaient un test
  vert et complet : props reçues → callback appelé, boutons désactivés aux bornes, WCAG 2.5.3
  vérifié. Et la feature était CASSÉE — l'index fourni par la couche appelante désignait toujours le
  1er du mois (résolu depuis un point rebasé, donc sans `dayIso`, avec repli sur `monthIndex` alors
  que seuls les 1ers du mois portent une abscisse entière). « Lendemain » depuis le 15 menait au 2,
  et sur un jour futur les clics ne faisaient RIEN de visible (même référence d'objet ⇒ pas de
  re-render). Trouvé par une revue, pas par 4 300 tests.
  **La règle** : quand un composant reçoit un index/une clé/une position calculée ailleurs, la
  garde doit viser le CALCUL, pas la consommation. Corollaire pratique : extraire ce calcul en
  fonction PURE est ce qui le rend testable (`utils/daySeriesIndex.ts`, 6 rouges sur le code
  d'avant). Même famille que « une garde qui teste le producteur en isolation ne prouve rien sur la
  chaîne », vue cette fois par l'autre bout.
- ⚠️ **[FIXTURE-COMPLETE-CACHE-LE-REPLI] 2026-08-17 — une fixture qui remplit TOUS les champs teste
  le cas nominal et rien d'autre.** Le test de masquage des marchands dans l'infobulle posait
  toujours `dayMovements`. Or ce champ n'existe que sur un jour PASSÉ reconstruit : un jour FUTUR à
  charge récurrente passe forcément par le REPLI `dayLabels`, dont le contenu est le `payee` réel —
  et ce repli n'était pas masqué. Le chemin heureux était protégé, la fuite était dans le fallback,
  et la fixture rendait la branche inatteignable. **Règle** : pour toute branche `A ? x : y`, une
  fixture par branche, y compris (surtout) celle qui traite l'absence de donnée.
- ⚠️ **[DECISION-PRIVACY-UNE-SEULE-SORTIE] 2026-08-17 — une décision de vie privée écrite pour UNE
  sortie ne protège que celle qu'on regardait.** « Refuser en mode discret » avait été décidé pour
  le PDF, avec la justification « un fichier SORT de l'app et SURVIT au mode ». L'export CSV, juste
  à côté, n'a jamais été revu : il produisait marchands ET montants en clair, ligne par ligne —
  strictement PIRE que le PDF, qui ne porte aucun `payee`. **Règle** : une décision de vie privée se
  repasse sur TOUTES les sorties (PDF, CSV, backup, prompt LLM, MCP, presse-papiers, logs), et la
  garde vit au SERVICE qui produit le fichier, jamais au clic — sinon le prochain appelant passe.
- ⚠️ **[MASQUAGE-RETIRE-UN-DISCRIMINANT] 2026-08-17 — masquer une donnée peut créer un trou WCAG.**
  Masquer le marchand dans les `aria-label` a donné à toutes les transactions du MÊME JOUR le même
  nom accessible (« Sélectionner la transaction du 2026-06-18 ») : navigation au lecteur d'écran
  cassée (WCAG 4.1.2). J'avais anticipé le piège à moitié — je basculais sur la date — et mon
  commentaire affirmait « noms DISTINCTS » tandis que mon test comparait deux dates DIFFÉRENTES,
  donc prouvait l'évidence. Deux agents l'ont mesuré indépendamment.
  **Règle** : un masquage qui RETIRE un discriminant doit le REMPLACER par un discriminant non
  sensible (ici l'`id`, opaque et unique), et le test doit viser le cas où la collision se produit,
  pas le cas où elle ne peut pas.
- ⚠️ **[PARTAGER-LE-MONTANT-PAS-SES-REFLETS] 2026-08-17 — appliquer une part au RÉSULTAT d'un
  producteur oblige à se souvenir de tous ses registres, et on en oublie.** La garde 50/50 après
  divorce multipliait quelques champs du retour de `processOneChild` (`childGrossCostAdd`,
  `monthlyExpenseDelta`, `liquidDeltaCosts`…). Chaque montant d'enfant alimente pourtant 3 à 5
  registres. **Deux ont été oubliés**, mesurés par deux agents indépendants et sur le vrai moteur :
  les ALLOCATIONS étaient encaissées à 100 % (`monthlyIncomeDelta` n'était partagé nulle part) mais
  publiées à 50 % — 332 $/mois contre 166 $ affichés, **75 957 $ d'écart sur le patrimoine final** ;
  et le DÉCAISSEMENT REEE d'études restait ENTIER face à une dépense partagée — +1 450 $/mois de
  trésorerie née de nulle part, régime de l'enfant vidé 2× trop vite.
  **La règle** : partager le MONTANT à la source (`childCustodyShare` dans le contexte du
  producteur), jamais ses reflets — tout dérivé suit alors par construction, y compris ceux qu'on
  n'a pas en tête. Corollaire : quand un correctif consiste à multiplier N champs d'un résultat,
  c'est le signe qu'il faut remonter d'un cran. Même famille que « un flux alimente PLUSIEURS
  registres » (meltdown REER), mais vue du côté du CORRECTIF et non du producteur.
- ⚠️ **[GARDE-AU-PRODUCTEUR-NE-PROUVE-PAS-LA-CHAINE] 2026-08-17 — 4 262 tests verts, deux défauts
  d'argent dedans.** Trois angles morts se sont additionnés, et aucun n'était visible : (1) TOUS les
  tests de divorce déclaraient `childGoals: []` — divorce et enfants ne se rencontraient jamais ;
  (2) le fuzz a des enfants mais appelle le moteur **sans** `enableMonteCarlo`, or `tryDivorce`
  n'existe QUE dans cette branche — il ne tirait donc jamais ; (3) la garde dédiée testait le
  producteur **en ISOLATION** et ne touchait aucun registre aval. Une garde qui vérifie le
  producteur ne dit RIEN de la chaîne : il faut viser les grandeurs que le moteur PUBLIE.
  ⚠️ **Deux pièges de vacuité en écrivant ce test de scénario**, tous deux silencieux :
  · en mode MC, `buildMonthlyDataPoint` RÉDUIT chaque point à `{ NetWorth, monthIndex }` sauf
    `verboseMonthlyPoints` → le test lisait des `undefined`, comparait des zéros via `?? 0`, et
    serait resté VERT sur n'importe quel code ;
  · un enfant de 18 ans ne cotise plus au REEE (branche bornée à `< 18 ans`) → sans solde de
    départ, « payout ≤ gross » était satisfait par un régime VIDE, pas par un correctif.
  D'où la discipline : **une assertion `> 0` sur la grandeur mesurée AVANT de la comparer**. C'est
  elle qui a révélé les deux.
- ⚠️ **[EPURATION-SUPPRIME-LA-RESERVE] 2026-08-17 — « moins de texte » se satisfait trivialement en
  supprimant de l'information.** Marc a demandé une infobulle Futur « quasiment sans texte ». Trois
  des paragraphes candidats à la coupe portaient une RÉSERVE sur la fiabilité du point affiché
  (titre valorisé à son prix actuel faute d'historique, prix vieux de N jours, jour pas encore
  couvert par la sync bancaire). Les effacer aurait transformé un chiffre **sous réserve** en
  chiffre **net** — la même faute que le « 0 $ crédible », mais par soustraction.
  **La sortie** : séparer l'ALERTE du LIBELLÉ. L'alerte devient une pastille compacte et reste
  visible dans TOUTES les modalités (`~ prix estimé`, `prix J−34`, `⚠ sync incomplète`) ; la phrase
  complète passe au `title`. ⚠️ Limite à DIRE, pas à masquer : au doigt, un `title` ne s'ouvre pas —
  on perd le libellé, jamais l'alerte.
  **La garde ne peut pas être une seule assertion.** Un plafond de prose seul est satisfait en
  vidant l'écran ; un « rien perdu » seul est satisfait en ne changeant rien. Il faut les DEUX,
  tenues ensemble, parce qu'elles se contredisent dès que l'une est obtenue par le mauvais moyen
  (`tests/components/tooltipEpuree.test.tsx` : plafond de 45 car. par nœud de texte + une assertion
  par réserve). Corollaire de mesure : compter les **nœuds de texte** et non le `textContent` d'un
  élément — les `title` sont des attributs, donc hors comptage par construction, ce qui est
  exactement la frontière qu'on veut verrouiller.
- ⚠️ **[STYLE-CONST-DUPLIQUEE] 2026-08-17 — une constante JS qui duplique une valeur de STYLE dérive
  en silence.** `TOOLTIP_WIDTH = 288` (`utils/chartTooltip.ts`) sert à borner la position de
  l'infobulle au viewport ; la largeur réellement peinte est la classe Tailwind `w-72` du
  composant. Rien ne les confronte au runtime. Élargir la classe sans la constante compile, passe
  le lint et tous les tests — et fait déborder l'infobulle du bord droit **uniquement** sur un écran
  assez étroit pour que la borne serve, c'est-à-dire jamais chez le développeur.
  Règle : quand une valeur de style doit exister aussi en JS, la garde lit la **classe** (la vérité
  peinte) et la confronte à la constante — pas l'inverse, sinon elle est circulaire. Ici :
  `tests/components/tooltipLargeur.test.ts`, qui extrait `w-<N>` de la source et vérifie
  `N × 4 === TOOLTIP_WIDTH` (échelle Tailwind, base 16 px). Même famille que « un outil-garde à
  valeurs re-codées en dur dérive en silence ».
- ⚠️ **[PARTIAL-POINT-FAKE-ZERO] 2026-08-11 — fabriquer un point qui n'implémente qu'une PARTIE d'un
  contrat rallume tous les `|| 0` en aval.** Les points QUOTIDIENS de la courbe Futur ne portent
  qu'une poignée des dizaines de champs de `ProjectionChartPoint` (le moteur ne produit le reste
  qu'au mois). Le double cast `as unknown as` a fait taire TypeScript sur TOUS les champs manquants,
  et deux faux chiffres crédibles sont passés :
  (1) l'infobulle affichait « **Variation +0 $** » en vert sur CHAQUE jour — badge rendu sans garde
  sur `data.diffNW || 0` — y compris le jour où la paie tombe, pendant que le bas de la même
  infobulle disait correctement « Ce jour : Paie » ;
  (2) « Détail complet » passait le point à `FutureDetailModal`, qui joint par `monthIndex` — devenu
  FRACTIONNAIRE — donc ne trouvait rien 30 jours sur 31 et retombait sur ses `|| 0`, dont un
  `Math.max(0, 0 − NetWorth)` qui FABRIQUAIT une dette égale au patrimoine net dès qu'il était négatif.
  Règles : typer le point partiel en `Partial<Contrat> & { champs réellement portés }` plutôt qu'un
  double cast — le compilateur redevient utile ; garder la clé de jointure d'ORIGINE (`hostMonthIndex`)
  quand on détourne une clé existante ; et distinguer « je ne sais pas » de « ça vaut zéro » AU RENDU
  (`Number.isFinite`), pas au calcul. Corollaire a11y : la table `sr-only` doit suivre la série
  RÉELLEMENT tracée, sinon la granularité visible n'existe pas pour un lecteur d'écran — et son texte
  vide est le LIBELLÉ littéral (`NO_DATA_LABEL`), convention inverse des cellules visibles.
- ⚠️ **[FEATURE-UNREACHABLE] 2026-08-11 — un seuil qui rend la fonctionnalité INATTEIGNABLE passe
  tous les filtres.** La bascule « courbe au jour » se déclenchait sous 5 points visibles ; or
  `useTimeChartZoom` plafonne le zoom à `DEFAULT_MIN_POINTS = 5` d'ÉCART, ce qui laisse **6** points
  dans la fenêtre. Le code était correct, testé, typé — et la fonctionnalité ne s'activait JAMAIS.
  Ni le typecheck, ni le lint, ni les tests unitaires (qui testent les fonctions, pas leur
  déclenchement) ne peuvent voir ça : seul l'e2e qui EXERCE le geste réel l'attrape. Règle : tout
  seuil d'activation couplé à une limite d'un AUTRE module se documente avec la valeur de cette
  limite, et se couvre par un test qui reproduit le geste de bout en bout — pas par un test de la
  condition. Corollaire pour la revue : « ce seuil est-il atteignable ? » est une question à poser
  explicitement, elle ne se déduit pas de la lecture du fichier.
- ⚠️ **[DOC-STALE-SAME-PR] 2026-08-11 — le changement qui périme SES PROPRES commentaires.** La PR
  qui migre l'axe en numérique a laissé QUATRE endroits affirmant encore « l'axe X est CATÉGORIEL » :
  un commentaire 550 lignes plus haut dans le même fichier, l'en-tête de `DailyDetailPanel`, une
  puce BACKLOG contredisant la puce cochée juste au-dessus (classe `PM-STALE-BACKLOG`), et une entrée
  d'historique. La revue en a trouvé deux, le `grep` du terme les a tous trouvés. Réflexe : quand un
  changement invalide une AFFIRMATION (pas seulement une API), **grep le terme** dans `components/`
  et `docs/` avant de committer — le typecheck ne voit rien, la revue en rate la moitié. Nuance utile :
  une entrée d'historique DATÉE se marque « périmé depuis … », on ne réécrit pas le passé ; un
  commentaire vivant, lui, se corrige. Et un commentaire périmé peut cacher une VRAIE raison : celui
  du hook de zoom invoquait le type de l'axe, alors que ce qui rend son indexation valide est
  l'espacement UNIFORME des données — la correction a clarifié le vrai invariant.
- ⚠️ **[FUTUR-DAILY lot B] 2026-08-11 — axe recharts CATÉGORIEL vs NUMÉRIQUE, et la sonde qui ne
  prouvait rien.**
  (1) **Un axe catégoriel apparie les `ReferenceLine`/`ReferenceDot` par VALEUR DE CATÉGORIE** : un
  ancrage n'apparaît que si un point de données porte exactement cette valeur. En numérique, ce sont
  des COORDONNÉES — l'ancrage tombe au bon endroit même sans point à cette abscisse. C'est la
  différence entre « on peut ajouter des abscisses quotidiennes » et « les jalons disparaissent en
  silence ».
  (2) **Le `domain` explicite n'est PAS cosmétique** : le défaut d'un axe numérique recharts part de
  **0**, donc un `monthIndex` négatif (préfixe passé) est écrasé — frontière mesurée à 316,5 au lieu
  de 122,5, bande du passé à x=283 au lieu de x=70.
  (3) **La migration n'est pas un no-op au pixel** — j'ai écrit le contraire avant de mesurer :
  le catégoriel centre les points dans leur bande (demi-bande de marge aux bords), le numérique colle
  dataMin/dataMax aux bords. Tout se décale d'une demi-bande, points ET ancrages ENSEMBLE, donc
  l'alignement est préservé — et il s'AMÉLIORE : la frontière tombait 0,97 px à côté de la bande du
  passé, elle coïncide maintenant exactement.
  (4) ⚠️ **La sonde à écarter** : un `toHaveScreenshot` pleine page ne prouve RIEN sur un graphe.
  Les 4 baselines échouaient déjà pour cause de build chromium différent (écrans non touchés
  compris), et surtout le PNG rendait un conteneur `-1 × -1` — j'ai obtenu le MÊME md5 avec ET sans
  le `domain`, c'est-à-dire un « vert » qui aurait laissé passer un décalage de 194 px. La sonde qui
  discrimine mesure les **coordonnées SVG** des ancrages (`.recharts-reference-area-rect`,
  `line.recharts-reference-line-line`, la ligne de grille horizontale pour la zone de tracé) — et on
  la valide en la faisant ÉCHOUER dans chaque état fautif, pas seulement passer dans le bon.
- ⚠️ **[FUTUR-DAILY] 2026-08-11 — trois pièges du SEAM « aujourd'hui » et de l'absence légitime**
  (panel #577, tous CONFIRMÉS contre le vrai code avant correction) :
  (1) **Un `Number(x) || 0` au site d'appel VIDE le garde-fou du module appelé.** `refineMonthToDaily`
  rend `[]` sur une valeur non finie, exprès ; les deux appelants écrivaient `Number(p.NetWorth) || 0`,
  donc le garde ne se déclenchait JAMAIS — et un `NetWorth` laissé `undefined` À DESSEIN par
  `buildPastPrefix` (avant la première transaction connue) devenait un patrimoine de **0 $**. Un garde
  no-fake-data ne protège que si l'appelant lui transmet l'absence TELLE QUELLE. Correctif = source
  unique `finiteAnchorRun`, qui garde la plus longue plage **CONTIGUË** : filtrer au trou appairerait
  deux mois non voisins et étalerait un écart de deux mois sur un seul.
  (2) **Une borne INCLUSIVE et un prédicat STRICT sur la même frontière se contredisent.**
  `invTo = min(to, today)` inclut aujourd'hui (les prix du jour sont réels) mais `isPast = d < today`
  l'excluait : la ligne d'aujourd'hui portait des données MESURÉES et s'annonçait « (projeté) » au
  lecteur d'écran, sur la ligne la plus regardée du tableau. Deux tests jumeaux (aujourd'hui / demain)
  valent mieux qu'un test de chaque côté d'un seam jamais testé AU seam.
  (3) **`emptyAware` sur l'absence, `PrivateAmount` sur un montant — jamais l'inverse.** En mode privé,
  `PrivateAmount` sur un `null` afficherait « ••• » + « Montant masqué » : un montant CACHÉ là où il
  n'y a aucune donnée. Et un conteneur `overflow-*` sans descendant focusable a besoin de
  `tabIndex={0} role="region" aria-label` (motif `Budget.tsx`) — un navigateur fait défiler un ANCÊTRE
  du focus, jamais un descendant.
- ⚠️ **[FUTUR-DAILY] 2026-08-11 — une fonction de RECONSTRUCTION non bornée par « aujourd'hui »
  fabrique du futur en reconduisant la dernière valeur connue.** `reconstructPortfolioHistoryDaily`
  produit un point pour CHAQUE jour de `[from, to]` : son `priceAt` prend le dernier prix ≤ t, donc
  au-delà d'aujourd'hui elle rend un plateau — pas une valeur absente, un plateau CRÉDIBLE. Branchée
  sur une fenêtre à cheval passé/futur, elle affichait des placements « reconstruits » à côté d'une
  colonne « Projeté » qui, elle, croissait : deux chiffres pour la même date, dont un inventé. Règle :
  toute reconstruction alimentant un écran mixte est bornée à `min(to, today)` **au site d'appel** —
  la fonction, elle, obéit à ses bornes et n'a aucune raison de connaître le présent.
  **Et la leçon de méthode** : le défaut n'a pas été vu à l'œil ni en revue — il est tombé en écrivant
  l'assertion « le futur affiche — » d'une colonne VOISINE. Écrire l'attente d'une colonne oblige à
  répondre « d'où vient cette cellule ? » pour toute la ligne. Discriminant prouvé par perturbation
  (sans la borne : « 1 000 $ » là où le test exige « — »).
- ⚠️ **[PERF-SDK-BOOT-PRELOAD] 2026-07-31 — deux leçons de bundling MESURÉES (boot −54 Ko gzip, −24 %)** :
  (1) **Un manualChunk (Rolldown/Vite) atteint UNIQUEMENT par `import()` devient EAGER** — le chunk manuel
  casse la frontière asynchrone : l'entry importait STATIQUEMENT `ai-vendor` (SDK Anthropic, 126 Ko →
  modulepreload au boot) alors qu'AUCUNE chaîne d'imports statiques source n'existait ; preuve en retirant
  la règle : `pdf-vendor` (jspdf) est APPARU dans le preload à sa place (même piège, 2ᵉ occurrence). Règle :
  ne mettre en manualChunks QUE des paquets consommés statiquement au boot (react-vendor) ; un vendor
  lazy-only se laisse découper naturellement. Vérité = `grep modulepreload dist/index.html` après build
  PROPRE, jamais la config. (2) **Le diagnostic d'un ticket perf se RE-TRACE avant de coder** : le ticket
  accusait « claude.ts importé par 5 onglets lazy » ; la vraie chaîne de boot (walker d'imports statiques
  récursif depuis index.tsx, en ignorant `import type` et `import()`) était `TabRouter → PageSetupGate →
  PayslipUploadCard → claude.ts` — un composant de SETUP monté au boot. Sans le traceur, le fix « SDK
  dynamique dans makeClient » seul ne sortait RIEN du preload (mesuré : 3 hypothèses successives réfutées
  par rebuild). Le walker (~30 lignes node) vaut mieux que N greps : les chunks Rolldown s'entre-importent
  pour l'ordre d'exécution et rendent le dist illisible pour ce diagnostic.
- ⚠️ **[PORTFOLIO-HISTORY] 2026-07-22 — courbes de cours réelles (bug Marc), leçons** : (1) **Un STUB
  documenté « retourne toujours [] » peut rester branché à N surfaces pendant des mois SANS alerte parce que le
  MODE TEST les nourrit en synthétique** — les graphes marchaient en démo (fixtures) et étaient vides en réel :
  l'utilisateur voit un bug, les tests sont verts. Réflexe : au retrait d'une source de données, tracer TOUS ses
  consommateurs jusqu'à l'UI (pas seulement compiler) ; un « stub temporaire » qui nourrit un graphe = une dette
  qui MENT. (2) **Un provider d'historique qui avale ses erreurs en `[]` EMPOISONNE le cache** : `withCache` ne
  cache pas `null` mais cache `[]` 24h → un 403 (candles Finnhub = tier payant) devenait un trou de 24h. Contrat
  explicite : `[]` = vide VALIDE (cacheable), `null` = erreur (jamais cachée → retry/repli) — et le contrat doit
  être PROPAGÉ jusqu'au consommateur final (un `?? []` de façade le détruit : l'hydratation confondait « échec
  total » et « vide légitime »). (3) **Nouvelle source
  de données front SANS toucher la CSP = proxy same-origin** : rewrite `vercel.json` `/api/history/yahoo/:symbol`
  → query1.finance.yahoo.com (+ `server.proxy` vite en dev) — `connect-src 'self'` couvre, zéro domaine ajouté.
  Yahoo utilise les MÊMES suffixes que `toFinnhubSymbol` (.TO/.PA) → mapping partagé. (4) Détention/prix à la date
  t = helpers PARTAGÉS `holdingsAt`/`priceAt` (exportés de reconstructPortfolioHistory) — le graphe et la
  reconstruction du Futur ne divergent jamais (source unique, sœur de computeRawNetWorth).
  **Leçons du panel (30 agents, 9 confirmés par sondes)** : (5) **Changer la FORME d'un dataset partagé
  (colonnes CONSTANTES → lignes ÉPARSES à clés dynamiques) casse silencieusement tout consommateur qui lit
  `Object.keys(data[0])`** — Dashboard (piles fausses : 45 k$ de BTC sous « NonReg ») et modal (« Aucune
  donnée » à tort) lisaient la ligne 0 ; au changement de forme, grep TOUS les lecteurs de la ligne 0/du
  scan de clés (union des lignes, pattern Investments) — ↻ 3ᵉ instance INVEST-CURVES-LOW 2026-07-23 : la BASE du
  mode Base 100 de StockChart était prise sur la ligne 0 → un titre apparu plus tard avait base 0 → courbe FIGÉE à
  0 invisible (base par série = SON premier point fini, point manquant → null) — et le FIX doit couvrir TOUTE la
  chaîne d'affichage : le tooltip (`val || 0`) réintroduisait le faux « +0,00 % » que la courbe venait d'éliminer,
  et formatait en $ EN DUR ce que l'axe rendait en % (panel #495) ; NB test : jsdom ne cache PAS le contenu d'un
  `<details>` fermé (pas de règle UA) → « replié par défaut » s'asserte sur l'ATTRIBUT `open`, pas sur la visibilité.
  ⚠️ **Complément [FINTABLE-4] 2026-07-29** : `fireEvent.click` sur un `<summary>` BASCULE bien l'attribut natif
  `open` de son `<details>` parent en jsdom (mesuré, pas supposé — aucun test existant du repo ne le vérifiait
  avant). Et un `<summary>` qui ENVELOPPE un composant ayant lui-même un titre `<Card title="Importer un
  relevé bancaire…">` partageant un PRÉFIXE de texte avec le libellé de la disclosure (« Importer un relevé »)
  fait échouer `getByText(/Importer un relevé/i)` (« Found multiple elements ») dès que le contenu masqué reste
  dans le DOM (cf phrase précédente) — choisir un libellé de `<summary>` qui ne partage AUCUNE sous-chaîne avec
  le contenu qu'il déplie (ici « Import manuel (repli — … » vs « Importer un relevé bancaire… »).
  Sœur : le matching par SOUS-CHAÎNE (`k.includes(sym)`)
  sur des clés devenues = symboles exacts fait matcher « V » (Visa) avec « VFV.TO » → helper partagé
  `historyKeyMatchesSymbol` (exact + préfixe place legacy), 6 sites corrigés. ↻ **RÉCIDIVE INVEST-PERF-PERIOD
  2026-07-23 (sur les NOMS cette fois)** : `name.includes('MSCI')` pour trouver le benchmark matchait « Amundi
  **MSCI** Em Asia » (AASI.PA, titre réel) → l'Asie émergente affichée comme « Marché » mondial selon l'ordre des
  actifs (prouvé par sonde du code-reviewer). Un discriminant de MARQUE (`MSCI`) n'est pas un discriminant de
  PRODUIT (`MSCI WORLD`) → helper `isBenchmarkCandidate` (symbole CW8, sinon nom « MSCI WORLD » complet), testé. (6) **Une écriture par clé
  partagée dans une boucle multi-entités (`row[symbol] = v`) écrase quand 2 entités partagent la clé**
  (même titre en CELI + REER) → agréger AVANT d'écrire. (7) **Un `configure()` appelé au boot avec la MÊME
  config qui fait `clearCache()` inconditionnel ANNULE un cache persistant** (vidé à chaque reload « pour
  forcer le re-fetch ») → configure idempotent sur config inchangée ; et prolonger la vie d'un cache exige
  son BALAYAGE d'expirés (clés d'historique datées = 1 nouvelle entrée/jour, classe AUTH-DRIVE-PERSIST
  « déborner sans purge »). (8) **Dans un workflow adversarial, un agent verify MORT (« session limit »)
  ≠ finding réfuté** — le script rangeait les échecs de verify avec les réfutés (détail vide) : 17 findings
  étaient des HYPOTHÈSES non vérifiées, dont 8 VRAIS (vérifiés inline ensuite). Trier par « détail de
  réfutation présent », jamais par bucket seul ; un verify peut aussi être remplacé par lecture inline
  ciblée quand la capacité d'agents est épuisée.
- ⚠️ **[HIST-COVERAGE-TOTAL] 2026-07-23 — le TOTAL couvre tout le portefeuille, leçons** : (1) **Un agrégat
  qui EXCLUT des éléments non mesurables devient un chiffre FAUX affiché avec assurance** — l'exclusion no-fake-data
  « titre sans historique = hors totaux » (panel 2026-07-22) produisait un TOTAL ~190 k$ vs ~242 k$ réels : pour un
  AGRÉGAT, le repli approximatif SIGNALÉ (valeur actuelle plate, bandeau avec montant) bat l'omission silencieuse ;
  la frontière no-fake-data = « jamais approximer SANS le dire », pas « jamais approximer ». Une décision de panel
  peut être RÉVISÉE par l'usage réel — la surclasser EXPLICITEMENT (ADR + en-tête du module), pas en douce.
  (2) **Une variante de symbole auto-résolue (suffixe deviné) exige une garde de PLAUSIBILITÉ** (dernier close vs
  `currentPrice`, facteur ≤ 2 ; REFUS sans référence) — sinon collision de ticker = la courbe d'un AUTRE titre.
  Persister la résolution (`Asset.historySymbol`, additif) pour ne pas re-scanner à chaque sync. (3) Le repli
  « valeur actuelle » contribue au TOTAL/buckets mais JAMAIS en colonne → la reconstructibilité `TOTAL == Σ colonnes`
  ne tient plus dès qu'un titre sans historique existe — tout test/consommateur qui somme les colonnes doit le savoir.
  Leçons du panel (4 agents, sondes) : (4) **un mécanisme de résolution AUTO (fallback devineur) ne se déclenche que
  sur une réponse NÉGATIVE CONFIRMÉE (`[]`), JAMAIS sur une erreur/indéterminé (`null`)** — sinon une panne réseau
  transitoire sur le VRAI symbole fait adopter (et PERSISTER) une mauvaise résolution ; corollaire : toute résolution
  persistée doit avoir un chemin de SELF-HEAL quand elle cesse de répondre (sinon gel à vie, aucune UI ne l'expose).
  (5) **fermer un trou d'agrégat crée le trou SUIVANT à sa frontière** : après le repli « sans historique » et le
  raccord « quote fraîche », le cas résiduel (historique arrêté SANS quote fraîche) disparaissait des derniers jours
  du TOTAL sans signal — à chaque branche `continue` d'un agrégat, se demander « quel signal l'UI reçoit-elle ? ».
  (6) un montant affiché dans un bandeau doit partager la MÊME base que ce qu'il prétend décrire (`holdingsAt`
  vs `a.quantity` désynchronisable — instance de [[PH4D-BUDGET-RATIOS]] « calculs voisins sur la même base »).
- ⚠️ **[HIST-MULTI-PROVIDER] 2026-07-23 — quotes multi-providers, leçons** : (1) **un REPLI d'agrégat qui dépend
  d'une donnée SŒUR hérite de SES trous** — le repli « valeur actuelle » (#493) dépendait de `currentPrice`, or les
  quotes Finnhub free = US only → les ETF Euronext restaient à un prix saisi vieux/absent (TOTAL toujours faux de
  ~40 k$). Fermer le trou de la donnée sœur (chaîne de quotes → Yahoo) vaut mieux que raffiner l'agrégat. Le endpoint
  chart Yahoo porte DÉJÀ la quote (`meta.regularMarketPrice` + devise) → repli quote sans nouveau rewrite. Rewrites Vercel :
  `/api/history/yahoo/:symbol` → query1.finance.yahoo.com (historiques) + `/api/search/yahoo?q=` → query1.finance.yahoo.com/v1/finance/search
  (recherche par NOM via HistorySyncDoctor) ; `connect-src 'self'` couvre, zéro domaine ajouté. (2) **la
  config vitest du repo est `environment: 'jsdom'` PAR DÉFAUT** — un gate `typeof window` rend la branche navigateur
  dans TOUS les tests sans directive ; un test qui encode le comportement « hors navigateur » (`hasQuoteProvider ===
  false`) casse dès qu'on étend la branche navigateur, et un test « pas de fetch » peut passer PAR ACCIDENT (mock qui
  throw sur URL relative avant de compter). (3) **un échec de résolution sans RECOURS à l'écran = ticket de retour
  garanti** — la raison du skip (`detail` + `triedSymbols`) doit remonter jusqu'à l'UI avec le remède inline (champ
  symbole de cotation + recherche par NOM), pas seulement au journal d'erreurs. (4) corriger un ticker à la main DOIT
  purger `priceHistory` du titre (un historique fusionné d'un MAUVAIS titre survivrait à la correction — même classe
  que « variante d'un autre titre »). Leçons du panel (3 agents, sondes) : (5) **une protection posée sur UNE chaîne
  (mutex boot+bouton de priceRefresh, leçon PERF-BOOT-RATELIMIT) doit être portée à sa chaîne SŒUR (hydratation
  d'historique)** — la classe de bug re-rentre par la nouvelle chaîne (instance de [[AITOOLS-SEC]] « fix porté à
  toutes les surfaces ») ; (6) **élargir un provider élargit le DOMAINE DES VALEURS en aval** : le repli Yahoo mondial
  peut rendre une devise HORS de l'union `Asset.currency` (GBP — voire « GBp » pence aplati ×100 par toUpperCase) →
  allowlist au point d'écriture (`asSupportedCurrency`), jamais un cast `as` ; (7) un `detail` de diagnostic composé
  côté SERVICE peut interpoler un montant → fournir `detailPrivacySafe` jumeau et rendre le générique en défaut SÛR
  côté UI (mode discret, jamais de fallback vers la version chiffrée).
- ⚠️ **[QUOTE-NEGATIVE-CACHE] 2026-07-23 — cache négatif quotes/profils, leçons du panel (3 agents, sondes)** :
  (1) **un cache négatif nourri par des providers qui aplatissent TOUTE erreur en `null` (429 compris) gèle des
  VRAIS titres** (sonde : 3×429 → vrai symbole skippé 24 h, staleness invisible PIRE que le problème résolu) —
  sans distinction du type d'échec, le skip long doit se MÉRITER : TTL GRADUÉ (1er skip court 1 h, long après
  5 échecs) ; fix structurel = propager le type d'erreur ([QUOTE-ERRKIND]). (2) **un check de skip placé AVANT
  la lecture du cache positif masque une réponse déjà connue et fraîche** (sonde : clé de casse divergente) →
  le skip vit DANS le fetcher de `withCache`, jamais avant. (3) **`null` compté mais EXCEPTION non comptée =
  compteur asymétrique** — try/catch qui enregistre puis relance. (4) un skip automatique nouveau doit laisser
  une TRACE (journal) + un geste de reprise immédiat (le bouton Actualiser wipe le cache négatif) — un mécanisme
  d'économie réseau sans signal = classe « staleness silencieuse ». (5) **le documentation-manager peut INVENTER
  un chiffre et marquer mergée une PR en vol** — relire ses éditions du handover comme un finding (agent durci).
- ⚠️ **[AITOOLS-PROMPT-CACHE] 2026-07-24 — prompt caching Anthropic : l'ORDRE de préfixe est la vraie mécanique** :
  le prompt caching est un **match de PRÉFIXE** dans l'ordre canonique **`tools` → `system` → `messages`** — un
  `cache_control` sur le bloc `system` cache DÉJÀ **tout ce qui le précède, dont les tools** (confirmé skill claude-api).
  Donc « cache_control sur system ET tools » du ticket était en partie DÉJÀ livré par le breakpoint system (#490) : les
  16 schémas de tools étaient cachés par l'ordre. Le delta utile = un breakpoint EXPLICITE sur le DERNIER tool (un seul
  suffit pour tout le préfixe tools) → défense en profondeur (tools cachés même si le préfixe system change), pas un gain
  fonctionnel immédiat. Réflexe : avant de coder un fix de caching, tracer l'ORDRE de préfixe et les breakpoints DÉJÀ posés
  (leçon « vérifier l'état réel ») ; un marqueur sous le minimum cacheable (~1-2k tokens) est IGNORÉ sans erreur (sans risque) ;
  max 4 breakpoints. Preuve = guard-test de FORME de requête (capturer `requests[0].tools`/`.system`, asserter les marqueurs),
  pas une mesure de tokens (non déterministe en test). `usage.cache_read_input_tokens` est l'arbitre en prod (B4-CHAT-COST le remonte).
- ⚠️ **[QUOTE-ERRKIND] 2026-07-24 — propager le TYPE d'erreur provider→façade (fix structurel de QUOTE-NEGATIVE-CACHE)** :
  les providers PROPAGENT (throw `MarketDataError` typée) les erreurs TRANSITOIRES (RATE_LIMIT/NETWORK/AUTH/UNKNOWN) au
  lieu de les aplatir en `null` ; l'ABSENCE confirmée reste `null` ; la façade (`runLink`, `services/marketData/index.ts`)
  ne compte au cache négatif QUE l'absence confirmée. (1) **Classer par CODE HTTP a un ANGLE MORT : un provider peut
  répondre 200 AVEC un corps d'ERREUR** (Yahoo `chart.error` peuplé sans statut ≠2xx) → `parse→null` le classerait
  « absence confirmée » et re-gèlerait un vrai titre par un CHEMIN DIFFÉRENT (la classe de bug qu'on corrige, réintroduite) ;
  distinguer le corps d'erreur (throw transitoire) AVANT le `return null`. Le code-reviewer a trouvé ce voisin. (2) **AUTH
  = transitoire per-symbole VOULU** : une clé invalide ne dit rien sur CE titre → ne pas négative-cacher par symbole (sinon
  une clé expirée gèlerait TOUT le portefeuille) ; le coût = re-tentatives Finnhub à chaque cycle (borné, hors scope). (3)
  **Finnhub signale l'absence par le PAYLOAD (`c===0`), jamais par un 404** → le seul chemin « absence confirmée » Finnhub est
  le corps, pas le statut ; un 200 dégradé y reste un angle mort assumé (documenté, hors scope). Test discriminant par MAILLON
  (Finnhub-primaire + Yahoo repli + chart.error), pas seulement un maillon.
- ⚠️ **[FUTUR-REAL-HISTORY] 2026-07-24 — courbe passée du Futur raccordée EXACTEMENT à aujourd'hui, leçons** :
  (0) **La feature était DÉJÀ construite à ~90 %** (segment passé `pastPrefix` dans `FutureProjection.tsx`, reconstruit
  + recalculé à chaque upload par les deps du `useMemo`) — le cadrage (architect + financial-integrity) l'a établi AVANT
  tout code (classe [[R2-FIRE]]/[[PM-STALE-BACKLOG]] : vérifier l'état RÉEL avant de coder). Le vrai travail = fermer 2 écarts
  money-critical, pas reconstruire. (1) **Un raccord passé↔présent d'une COURBE de patrimoine doit soustraire la MÊME dette
  des deux côtés** : le passé (`pastPrefix`) ne soustrayait AUCUNE dette alors que le moteur soustrait `DettesNonImmo` dès le
  mois 0 → SAUT visible « aujourd'hui » = tout le solde des dettes (bug MONEY-PHANTOM d'un endetté). Fix (Option A, décision
  Marc) : soustraire `chartData[0].DettesNonImmo` (dette COURANTE, source unique du moteur) via un helper qui route par
  `computeRawNetWorth` (`services/history/pastNetWorth.ts` — `DettesNonImmo` entier dans `activeDebtsTotal`, autres à 0),
  JAMAIS une copie locale de la formule. Raccord EXACT (même dette aux 2 bouts) ; approximation « dette constante dans le
  passé » (pas d'historique d'amortissement) ASSUMÉE + SIGNALÉE au bandeau. (2) **Instance de [[PH4D-BUDGET-RATIOS]] « calculs
  voisins, même base »** : `reconstructCashHistory` (walk-back du cash passé) sommait TOUTES les transactions, alors que son
  ANCRE `computeStartingCash` (cash présent) EXCLUT `isDuplicate`/`isTransfer` → les 2 bouts de la MÊME courbe partaient de
  bases différentes (dérive = Σ virements/doublons). Fix : exclure dup/transfert des deux côtés. Discriminant : 3 tests rouges
  sur l'ancien code (git-stash du seul `reconstructCashHistory.ts`). (3) **FX du passé = prix natif × FX du JOUR** (pas de FX
  historique daté) : choix no-fake assumé (garantit le raccord exact au présent où FX du jour = vérité) + note au bandeau ;
  FX historique daté = ticket différé `[FUTUR-HIST-FX-DATED]`, non bloquant. (4) **Extraire un type d'objet en
  `interface` PEUT casser un typecheck que le `type` alias inline passait** (leçon FUTUR-HIST-WIRING-TEST) : un
  `interface` est mergeable → TS ne lui donne PAS de signature d'index implicite, donc il n'est PAS assignable à
  `Record<string, unknown>` ; un `type Foo = {…}` (object-literal) l'est. En extrayant `PastPrefixPoint` d'un composant
  vers un module (pour le rendre testable), le passer en `interface` a cassé l'assignabilité de `displayData` (consommé
  par ChartDataTable en `Record<string, unknown>[]`). Réflexe : pour un type d'objet DESTINÉ à circuler comme
  `Record<string, unknown>`, garder un `type` alias, pas une `interface`. (5) **Extraire l'assemblage inline d'un
  `useMemo` money-critical en fonction PURE = le rendre unit-testable SANS harnais de rendu lourd** (buildPastPrefix) —
  meilleur que mocker `lastProjection`+hooks pour tester le câblage ; discriminant vs substitution `DetteTotale`.
  (6) **Un `useState`+`setInterval` PAR instance pour un concept qui doit être PARTAGÉ (« aujourd'hui ») DIVERGE**
  (finding silent-failure) : `useSimulationParams` est monté 2× (ProjectionEngine + FutureProjection) → 2 horloges
  horaires décalées peuvent avancer le mois à des instants différents → `chartData` (moteur) et `pastPrefix` (affichage)
  sur un `startMonth` décalé d'un mois à cheval sur minuit du 1er (incohérence visuelle SILENCIEUSE). Fix = état
  module-level partagé via `useSyncExternalStore` (un seul timer, `getSnapshot` frais `monthEpochOf()` = stable par
  valeur → bail-out React) — même pattern que la dédup `usePastPortfolioHistory`. Règle : tout « maintenant » réactif
  consommé par ≥2 montages du même hook = source UNIQUE module-level, jamais un timer par instance.
- ⚠️ **[FUTUR-ICONS-RICH] 2026-07-24 — « quasi aucune icône dans le graphe Futur » (bug Marc récurrent), leçons** :
  (1) **Le fix précédent [FUTUR-ICON-DENSITY] ne réglait que la DENSITÉ (cap), pas la SOURCE** — le vrai problème était
  que le graphe n'affiche des icônes que pour les `lifeEvents`/`flowEvents` émis par le moteur (rares : retraite + FIRE +
  événements Monte-Carlo stochastiques ⇒ 0-2 icônes sur un plan normal). Quand un utilisateur dit « ça ne marche
  toujours pas » après un fix, RE-DIAGNOSTIQUER la CHAÎNE COMPLÈTE (source → filtre → rendu), pas re-régler le même maillon.
  (2) **Un `.includes('-')` (tiret ASCII) qui devait matcher des messages à tiret CADRATIn « — » = filtre quasi toujours
  faux** : le gate `(FluxImpots<0 || label.includes('-'))` de `FutureProjection` masquait la quasi-totalité des flowEvents
  (impôts/retraits) → RETIRÉ (la densité est le rôle de `sampleEvenly`, pas d'un gate). Réflexe : un filtre sur un caractère
  de ponctuation FR doit tester le bon codepoint (— U+2014, pas -). (3) **Les jalons récurrents (RRQ/PSV/retraits/impôt)
  vivent en CHAMPS NUMÉRIQUES de `chartData`, jamais en événements** → couche de présentation `services/projection/
  milestoneIcons.ts` (`deriveMilestoneIcons`, PURE, détecte la 1re occurrence — PRÉSENTATION, pas recalcul $, respecte
  « source unique »). Anti-doublon STRUCTUREL : ne dérive JAMAIS retraite/FIRE (émis par le moteur) → pas de string-matching
  fragile. (4) **`val` d'un événement = coordonnée Y de la pastille** : les flux étaient à `val=ImpotLatent` (position basse,
  quasi invisibles) → TOUTES les pastilles sur la courbe (`val=NetWorth`). (5) **Merge d'événements dérivés + moteur = RE-TRIER
  par `monthIndex` AVANT `sampleEvenly`** (contrat « tableau ordonné ») + réassigner subIdx/index. (6) **VALIDATION EXIGÉE par
  Marc « valide avant de dire que c'est bon » = e2e Playwright RÉEL** (`e2e/futureIcons.spec.ts`, chromium préinstallé via
  `PW_LOCAL_CHROMIUM`) : le preview headless rend Recharts en 0×0 (leçon R3-TOOLTIP) → seul un vrai viewport prouve les icônes.
  Mesuré : 29 pastilles (RRQ/PSV/retraits/impôts/retraite/FIRE) vs 0-2 avant. Un « c'est bon » sur du Recharts sans e2e réel = non prouvé.
  **Leçons du panel (4 agents, sondes exécutées) :** (7) **RETIRER un filtre expose ce qu'il MASQUAIT — auditer les DOUBLONS
  avec ce qui redevient visible** : mon jalon dérivé « 💸 Règlement d'impôt » DOUBLONNAIT le flowEvent moteur « 💸 Remboursement
  d'impôt: +X$ » (émis en avril, invisible AVANT car gaté) — 17/17 mois d'impôt avaient déjà l'événement moteur (sonde). Anti-doublon
  structurel étendu : ne PAS dériver un concept que le moteur émet DÉJÀ (retraite/FIRE/impôt). (8) **Un label moteur à MONTANT
  interpolé (« Retrait REER … +5 605 $ », « +5 609 $ »…) n'est JAMAIS collapsé par un dédup à CHAÎNE EXACTE** → ~400 labels distincts
  inondent le cap d'icônes. Dédup par MOTIF (normaliser les nombres → « # » avant la clé de dédup). (9) **Un garde d'exemption
  (locatif déjà actif au mois 0) doit être SYMÉTRIQUE sur tous les champs de même nature** : je l'avais mis sur le locatif mais pas
  RRQ/PSV/REER/CELI → « 1er retrait REER » au mois 0 pour un déjà-retraité (faux « 1er »). Initialiser chaque flag `xxxDone` à
  `actif-au-mois-0`. (10) **Une couche d'AFFICHAGE qui MULTIPLIE ×15 les éléments cliquables amplifie une dette a11y pré-existante**
  (tabIndex=-1 + alternative sr-only qui ne couvre pas les événements) : livrer la liste sr-only des jalons (parité SR) DANS la même PR,
  router l'opérabilité clavier au BACKLOG ; cible tactile flux 18→24 px (WCAG 2.5.8) + zone de clic transparente 44 px (2.5.5).
- ⚠️ **[INVEST-ALLOC-GEO-SECTOR] 2026-07-23** : (1) **une table de lookup dont le FORMAT de clé a dérivé de celui
  des données réelles est une table entièrement MORTE en silence** (`ASSET_META` keyée `EPA:CW8` vs symboles réels
  `CW8.PA` → 0 hit, tout en « Autre » sans erreur) — normaliser le LOOKUP (pas les données), même classe que
  `historyKeyMatchesSymbol` ; (2) l'en-tête du module promettait un `getAssetMeta` dynamique JAMAIS écrit (doc
  menteuse, classe [[Lot audit n°2]] « une affirmation de commentaire se vérifie ») ; (3) un auto-remplissage de
  champ persisté n'écrit QUE l'information UTILE — persister le DÉFAUT du mapping (« Autre »/« Global ») figerait
  la résolution et bloquerait tout meilleur remplissage futur (édition, provider enrichi).
- ⚠️ **[MCP-CATEGORY-ALLOWLIST] 2026-07-24** : (1) une catégorie de transaction LIBRE écrite par l'IA
  (apply_bank_statement) entre dans le rapprochement fuzzy PARTAGÉ (réel/moyenne/grand livre) → un nom
  inventé (« Sport ») est absorbé par un poste englobant (« Tran-sport ») SANS trace. Fix = allowlist au
  point d'écriture (`applyDocument.ts`, module partagé app↔MCP = les deux surfaces par construction) :
  postes + RULE_CATEGORIES, remap casse/accents vers la forme canonique, inconnue → ruleCategorize(payee)
  sinon « Non catégorisé », remaps COMPTÉS au summary. (2) **L'EXEMPLE d'une description de tool enseignait
  une catégorie HORS canon** (« Alimentation ») — le modèle apprend des exemples : exemples/listes de
  descriptions de tools se DÉRIVENT de la source unique (`RULE_CATEGORIES.join`), jamais re-codés
  (classe A11Y-CHECK-CONTRAST-DRIFT appliquée aux prompts de tools). (3) **La même classe vivait dans
  `categorizeBatch`** : le prompt AFFIRMAIT « toute autre valeur sera rejetée » sans AUCUN code d'enforcement
  (classe « une affirmation se vérifie », ici une affirmation de PROMPT) → helpers purs partagés
  (`resolveCandidateCategory`, `categoryRules.ts`) consommés par applyDocument ET categorizeBatch.
  (4) **Réfuté pour l'import CSV** : une catégorie de CSV bancaire = donnée RÉELLE → devient un poste au
  prochain sync (design Lot C « postes ≡ catégories observées ») — lui appliquer l'allowlist détruirait
  les nouvelles catégories légitimes. Le discriminant IA-vs-donnée-réelle : l'IA a un CONTRAT « choisis
  dans la liste » (enforcer), la banque apporte du VRAI nouveau (laisser passer).
- ⚠️ **[AITOOLS-SEC] 2026-07-22 — audit de clôture du chantier Claude-in-app, leçons** : (1) **Un fix de
  sécurité appliqué à UNE surface doit être porté à TOUTES les surfaces qui partagent le vecteur** — le scrub
  anti-injection du `summary`/`changes` d'une écriture avait été fait côté app (`writeExecutor`, Lot D) mais
  JAMAIS côté serveur MCP (`runApply` → claude.ai) : le trou est resté ouvert 1 jour, confirmé ÉLEVÉ à l'audit.
  Fix durable = CONSOLIDER dans un module partagé (`mcp/tools/scrubWriteResult.ts`) consommé par les deux, pas
  deux copies qui dérivent (classe [[Lot audit n°2]] « delta appliqué à DEUX copies »). Réflexe : un finding
  « corrigé côté X » → grep l'autre surface (MCP↔app) AVANT de clore. (2) **La règle `.finite()` sur tout `z.number()`
  $ n'était pas appliquée aux tools de LECTURE** (seulement écriture) — une règle non-négociable sans GARDE-SCAN
  dérive ; ajouter `tests/aiTools/specFiniteGuard.test.ts` (scan des specs, volume prouvé) ferme la récidive
  (comme `assetFxGuard`). (3) **Auditer TOUS les `stop_reason`** : `refusal` était le seul des 5 stopReasons sans
  marqueur honnête ni logError → « aucune réponse, réessaie » aveugle sur une question re-refusée. (4) Un finding
  MCP-serveur ne prend effet sur claude.ai qu'au **redéploiement Cloud Run** (révision séparée de Vercel) — le
  noter dans le rapport/handover. Optimisation coût trouvée mais NON corrigée en SEC (hors sécurité) : prompt
  caching Anthropic (`cache_control` sur system+tools) → ticket `[AITOOLS-PROMPT-CACHE]`.
- ⚠️ **[B2-CHAT-HISTORY] 2026-07-22 — multi-conversations + fichiers Drive appdata, leçons du panel (4 agents)** :
  (1) **Créer une NOUVELLE classe d'artefacts distants (fichiers appdata par message) impose d'étendre le DROIT À
  L'EFFACEMENT existant DANS LE MÊME LOT** — `deleteRemoteData` (« Supprimer mes données », libellé irréversible)
  ne wipait que le fichier de sync : les relevés/PDF joints au chat restaient dans le Drive à vie (CRITIQUE Loi 25,
  même classe qu'[[AITOOLS-SEC]] « fix porté à toutes les surfaces » — ici « effacement porté à tous les artefacts »).
  (2) **Un gel d'actions basé sur `isLoading` ne protège RIEN avant le `setIsLoading(true)`** : la lecture async des
  pièces jointes précédait la montée des flags → fenêtre où basculer de conversation envoyait le message dans la
  MAUVAISE (sonde). Flags d'occupation (`inFlightRef` + `setIsLoading`) AVANT le premier `await`, tout chemin de
  sortie via un `finally` global. (3) **Un mémo NÉGATIF (« fichier absent ») permanent casse la course de sync
  cross-device** : l'appareil B peut chercher AVANT que le push fire-and-forget de A n'aboutisse → mémoriser le raté
  à TTL (60 s), jamais à vie de session. (4) **`.catch(() => undefined)` par-fichier + listing NON PAGINÉ (pageSize 50)
  = suppression silencieusement partielle** : différencier le 404 (idempotent, OK) du reste (tracé, mémo conservé pour
  retenter), et paginer tout listing qui sert un wipe/delete. (5) Des données qui voyagent EN ENTIER dans chaque push
  (conversations archivées) → PLAFOND avec éviction nettoyante (cap 30 + droppedMessageIds → delete Drive), classe
  « déborner sans purge ».
- ⚠️ **[AITOOLS-B1] 2026-07-22 — pièces jointes multimodales du chat, leçons du panel (5 agents, sondes)** :
  (1) **Un état UI PARALLÈLE au texte (fichiers joints) doit être transmis par TOUS les chemins d'envoi** —
  le clic d'une SUGGESTION (`overrideText`) jetait `pendingFiles` en silence (puce disparue comme envoyée),
  et les suggestions ne s'affichent qu'à conversation vide = pile la fenêtre où on joint un fichier avant le
  1er message. À l'ajout d'un état d'entrée parallèle, grep TOUS les appels du chemin d'envoi (pas seulement
  le bouton principal). (2) **Garde par TRUTHINESS sur un contenu = un '' droppe en SILENCE** : un fichier de
  0 octet → base64 '' → bloc omis → combiné à un envoi sans texte, le tour utilisateur ENTIER disparaissait de
  l'historique modèle (la puce s'affichait comme analysée). Toujours `typeof x === 'string' && x.length`, un
  PLANCHER de taille à la validation, et une branche « incohérent » qui logError (jamais un no-op muet).
  (3) **Valider chaque fichier ≠ valider la REQUÊTE** : la limite API est PAR REQUÊTE (~32 Mo, base64 ×4/3) —
  3 PDF de 10 Mo passent un à un et échouent ensemble en générique APRÈS l'append. Budget AGRÉGÉ à la
  sélection + ceinture à l'envoi (sœur de PH4D « calculs voisins sur la même base »). (4) **Contenu lourd
  re-soumis à chaque tour d'une boucle stateless = poser un point de cache** (`cache_control` ephemeral sur le
  DERNIER bloc de pièce jointe → le préfixe system+tools+historique+octets est re-servi du cache aux tours
  2-6 et aux messages suivants ; UN seul breakpoint, la limite API est 4). (5) **Un message d'erreur générique
  « réessaie » est FAUX pour un échec STRUCTUREL** (PDF corrompu/trop de pages : le retry re-paie le même
  échec) → détecter le 400 pièce-jointe et dire « retire-la ». (6) Le NOM de fichier est une donnée sensible
  (« releve_230000.pdf ») : jamais l'Error brute (message+stack) dans logError — le scrub du journal ne
  masque que les montants FORMATÉS. (7) Un cache mémoire keyé par id de message : éviction dès que l'id sort
  de la fenêtre d'historique + purge à CHAQUE bascule de persona (classe « déborner sans purge »).
- ⚠️ **[CHAT-PAGE-CONTEXT] 2026-07-22 — chat conscient de la page (vague 1), leçons** : (1) **une donnée qui
  doit être FIGÉE par envoi ne se transporte PAS par un tool** (l'architect a réfuté mon esquisse `get_current_view`) :
  un tool est relu à CHAQUE tour de la boucle agentique (≤6) → le contexte dériverait mi-envoi ; le point d'injection
  DÉJÀ figé existe (`system`, construit 1× par envoi) — chercher le point de capture existant avant d'inventer un canal.
  (2) **le registre de tools est partagé app↔MCP par construction (AITOOLS-A)** : jamais de tool « app-only » qui
  forke cette frontière pour un besoin d'une seule surface. (3) **contexte d'écran = capturé en SYNCHRONE avant le
  1er await de sendMessage** (même leçon que les flags B2 — une navigation pendant la lecture des pièces jointes
  capturerait la mauvaise page) ; gate mode discret À LA SOURCE (dans le publisher, pas à l'affichage — sinon des
  montants masqués à l'écran partent vers l'API) ; le détail publié RÉUTILISE les valeurs rendues (jamais un 3e
  chiffre, parité verrouillée par test contre les helpers canoniques). (4) **Un hook de publication dont l'effet
  dépend d'un OBJET doit déduper PAR VALEUR (clé sérialisée en dep), pas par référence** (finding prouvé par sonde :
  un consommateur futur sans useMemo = boucle publish→notify→re-render→nouvel objet→effet → gel 100 % CPU puis OOM —
  un contrat « mémoïse ! » en commentaire ne protège rien). ↻ **Instance TEST (DASH-NETWORTH-CANONICAL 2026-07-31)** :
  un `vi.mock` de hook qui FABRIQUE un nouvel objet à chaque appel (`usePortfolioHistory: () => ({ history: [...] })`)
  relance `useEffect([portfolioHistory])` → setState → re-render → boucle infinie qui PEND le run vitest (timeout 240 s,
  zéro output). Tout mock de hook consommé par un useEffect à dep-référence → constante HOISTÉE (identité stable), et
  un vitest qui pend sans sortie = suspecter cette boucle avant tout le reste. (5) **Un `system` qui varie par envoi invalide le préfixe
  de prompt-caching ENTIER** (pièces jointes incluses) → scinder en blocs [statique+cache_control, dynamique] dès
  qu'on injecte du contenu par-envoi dans system. ADR complet : docs/decisions.md. (6) **`scrollIntoView` sur une
  sentinelle fait défiler TOUS les ancêtres scrollables — y compris un drawer `overflow-hidden` (scrollable par
  script)** : header/fil sortaient par le haut du panneau (bug Marc, intermittent). Auto-scroll d'un fil de messages =
  `scrollTop = scrollHeight` sur le CONTENEUR du fil, jamais scrollIntoView. Vérité d'un bug de layout = e2e Chromium
  réel (env cloud : `PW_LOCAL_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, le @playwright/test du repo
  attend une révision plus récente que celle préinstallée).
- ⚠️ **[B3B4-CHAT-MODEL-COST] 2026-07-22 — modèle par conversation + coût réel, leçons** : (1) **des ids/tarifs
  de modèles consommés par l'UI = module LÉGER source-unique** (`services/aiChat/models.ts`/`pricing.ts`, zéro
  import) — `services/claude.ts` (qui tire le SDK) en DÉRIVE ses constantes, jamais l'inverse ni deux littéraux
  (l'UI boot-safe importe les ids sans tirer le SDK). Tarifs $/MTok datés+sourcés (cache read 0,1×, write 1,25×) +
  garde de parité ids↔tarifs par test (un modèle offert sans tarif = coût silencieusement non compté). (2) **Un coût
  mesuré se rend sur TOUS les chemins de sortie d'une boucle** (aborted/error compris — les tours aboutis sont payés) ;
  tarif inconnu → `null` honnête + logError, JAMAIS un 0 plausible (no-fake-data version coût) ; micro-montant réel →
  « < 0,01 $ », pas « 0,00 $ ». (3) **Ajouter un champ au résultat d'une fonction MOCKÉE par des tests existants**
  (`runAgentLoop` → `usage`) : les vieux mocks ne le rendent pas → le consommateur garde une ceinture `if (result.usage)`
  (sinon TypeError runtime que le typage ne voit pas — le mock est untyped). (4) **Lire un champ d'API via un cast
  `as unknown` ANNULE la garde gratuite du typage SDK** (finding panel) : `msg.usage?.input_tokens` TYPÉ casse le
  typecheck si Anthropic renomme le champ ; le cast compilerait → coût sous-compté à 0 en silence à vie. (5) **Un
  remplacement de sous-chaîne COURTE sans ancrage corrompt les mots qui la contiennent** : mon `'réal'→'réel'` (typo
  doc) a transformé `réalisait`→`réelisait` dans une ligne historique — ancrer les remplacements de mots (`\b`, ou la
  phrase entière), même pour de la doc. (6) **Le coût $ accumulé PENDANT le mode démo est RÉEL** (vraie clé) : toute
  restauration verbatim d'un snapshot pré-démo doit ADDITIONNER les compteurs de dépense réelle accumulés en démo,
  pas les écraser (prouvé par sonde : 5→0→+2→retour 5, le 2 $ perdu).
- ⚠️ **[AITOOLS-E] 2026-07-22 — chat PARTOUT (panneau global + onglet), leçons** : (1) **Un hook monté
  CONDITIONNELLEMENT (par onglet) qui détient un état/une promesse = fragile ; le hisser au niveau App via un
  CONTEXT le rend robuste** — `AiChatProvider` (1 `useAiChat` monté App) résout à la RACINE le finding Lot D
  « promesse de confirmation orpheline au démontage d'onglet » (le hook ne disparaît plus). Le modal de
  confirmation est rendu 1× PAR LE PROVIDER (pas dans chaque surface) → pas de double-modal si panneau+onglet
  montés. (2) **Monter un provider au niveau App SANS gonfler le boot = imports DYNAMIQUES du lourd DANS le
  hook** — `useAiChat` charge `agentLoop` (→ SDK Anthropic), `writeExecutor`, `appStateProvider` en
  `await import()` au 1er message ; le hook statique n'importe que React/store/types/promptSafety → le provider
  est boot-safe (mesuré : boot ~107 kB gzip inchangé ; `AiChatView`/`AiChatLauncher` en chunks lazy séparés).
  ⚠️ `vi.mock` intercepte AUSSI les imports dynamiques → les tests restent valides. **MAIS un `await import()` NU
  n'a PAS la protection anti-chunk-périmé** (finding ai-reviewer) : après un déploiement, le 1er usage 404 en
  boucle alors que le reste de l'app se répare → envelopper dans `importWithRetry` (extrait de `lazyWithRetry`,
  retry 500 ms + reload gardé anti-boucle) + message honnête « nouvelle version, recharge » si `isChunkLoadError`.
  ⚠️ **Hisser un hook au niveau App RETIRE sa protection ErrorBoundary par-onglet** (finding silent-failure) :
  avant, `useAiChat` tournait dans l'ErrorBoundary de TabRouter (isolation par onglet) ; au niveau App (provider),
  un crash = écran blanc global → réentourer d'un `ErrorBoundary` (ceinture) + un `ErrorBoundary` dédié sur la
  surface de rendu (isolation fine). (3) **Collision d'`aria-label`
  entre deux boutons de même action** : le FAB ouvert ET le ✕ du header du panneau portaient tous deux « Fermer
  le conseiller IA » → `getByRole('button', {name})` en trouvait 2 (test rouge). Deux contrôles distincts = deux
  labels distincts (✕ header → « Réduire le conseiller IA »). (4) Un chunk lazy se PROUVE (`ls dist/assets` +
  grep du marqueur agentLoop ABSENT du boot + `ai-vendor` chunk séparé), pas se suppose.
- ⚠️ **[AITOOLS-D] 2026-07-21 — écritures agentiques in-app : 4 leçons du panel (4 agents, sondes exécutées, 6 vrais findings)** :
  (1) **Un modal qui affiche des MONTANTS doit être gaté par le mode discret comme le reste** — le modal de
  confirmation d'écriture était rendu HORS du bloc `isPrivacyMode ? … : …` (monté au niveau du fragment, à côté du
  panneau) → activer le mode discret pendant une confirmation ouverte laissait la valeur en clair (Loi 25, ADR-5).
  Fix : le hook auto-refuse toute confirmation en attente dès que le mode discret s'active (`useEffect([isPrivacyMode,
  pendingWrite])` → `resolvePendingWrite('cancel')`, cohérent avec « fermer = refus ») + rendu gaté `!isPrivacyMode`
  anti-flash. Réflexe : tout état UI qui REND une valeur $ (modal, toast, tooltip transverse) doit passer le même
  gate mode discret que les surfaces principales — un rendu « à côté » du gate est un angle mort.
  (2) **Un composant monté CONDITIONNELLEMENT (par onglet, TabRouter) qui détient le resolver d'une Promise = promesse
  ORPHELINE au démontage** — `AiAssistant` n'est monté que sur l'onglet Assistant ; changer d'onglet pendant un modal
  ouvert démonte `useAiChat` → `writeResolverRef` disparaît → `requestConfirmation` ne résout JAMAIS → toute la boucle
  agentique (payée) suspendue à vie, sans trace. Fix : `useEffect` de cleanup au démontage qui résout tout resolver en
  attente en `'cancel'` + abort le tour + logError warning (jamais un abandon silencieux). Réflexe : un hook qui crée
  une Promise dont le resolver vit dans un ref d'instance DOIT la clore au unmount.
  (3) **Le `summary`/`field`/`note` d'un tool_result d'écriture = PROSE composée par le code qui INTERPOLE des
  substrings SAISIES PAR L'UTILISATEUR** (nom de dette/employeur/ticker, souvent extraits d'un document JOINT) → le scrub
  par-CLÉ de `jsonContent` (`USER_TEXT_KEYS` = name/payee/…) NE couvre PAS ces clés code-auteur → un nom malveillant
  (« <IGNORE ALL PRIOR INSTRUCTIONS>… ») revenait VERBATIM dans le contexte du tour suivant, emballé dans une phrase « de
  confiance » (injection de prompt INDIRECTE, même classe que [[MCP-PROMPT-SCRUB]]). Fix : `sanitizePromptText` sur
  summary/field/note/before/after AU POINT DE RENVOI AU MODÈLE (writeExecutor), PAS sur ce que le MODAL affiche
  (preview.*, montré à l'utilisateur, échappé par React) ni sur le STORE (données réelles non déformées). ⚠️ Le vecteur
  équivalent existe côté MCP (`applyDocument`→`summary` renvoyé à claude.ai) : ticket `[MCP-WRITE-SUMMARY-SCRUB]`.
  (4) **Annulation en cours de LOT de tool_use** : le modèle peut émettre plusieurs `apply_*` dans UN tour (parallel
  tool-use, non désactivé) et le dispatch est séquentiel → cliquer « Annuler » pendant le 1er modal refusait bien
  celui-là mais la boucle ouvrait quand même le 2e. Fix : vérifier `opts.signal?.aborted` en tête de la boucle
  `for (const tu of toolUses)` et court-circuiter les tool_use RESTANTS en refus honnête (`is_error`). NB : `.finite()`
  était absent de 3 des 5 specs d'écriture ($) — mitigé par la ceinture `plausible()` d'applyDocument mais ajouté par
  cohérence (defense-in-depth, règle MCP-WHATIF) ; specs partagées MCP → le durcissement profite aux deux surfaces.
- ⚠️ **[AITOOLS-B] 2026-07-21 — leçons du panel (4 agents, sondes exécutées)** : (1) l'état du STORE Zustand porte
  les ACTIONS (fonctions) → le passer tel quel à un handler qui clone (`structuredClone` du what-if) PLANTE
  (« could not be cloned ») — tout fournisseur d'état app = pick data-only (clés de `buildDefaultAppState`) +
  `validateAppStateShape` (un `null` corrompu doit LEVER, pas être masqué en « absence » par les `??` des handlers)
  + `structuredClone` + `normalizeAppState` (la MÊME que le MCP = parité par construction) — et `apiKeys` EXCLU ;
  (2) une boucle agentique doit distinguer les FINS DÉGRADÉES (`max_tokens` → « [Réponse coupée] », refusal) d'une
  fin normale — collapser = présenter une phrase coupée en plein chiffre avec l'autorité d'une réponse complète
  (no-fake-data version texte) ; l'échec API rend un RÉSULTAT honnête (texte+historique préservés), jamais un reject
  qui jette le travail payé ; les callbacks UI s'isolent (un throw de rendu ne casse pas la boucle) ; l'historique au
  cap se clôt par un tour assistant ; (3) un test « défauts MCP ≡ défauts store » attrape les LITTÉRAUX de défauts
  dupliqués qui dérivent — il a trouvé dès sa 1re exécution `documents` MANQUANT du littéral legacy du store (même
  classe que le « FIX defaults manquants » d'un audit passé : un littéral à ~25 champs re-tapé À CÔTÉ de la source
  unique finit toujours par rater un champ) ; (4) pour du code NON COMMITTÉ, le discriminant « avant » d'un fix
  panel = la SONDE exécutée par l'agent qui a trouvé le bug (mesure du comportement pré-fix), le git-stash n'existant pas.
- ⚠️ **[AITOOLS-A] 2026-07-21 — split spec/register des tools MCP (fondation Claude-in-app)** : la logique de
  chaque tool vit dans `mcp/tools/<x>.spec.ts` (browser-safe, `satisfies ReadToolSpec/WriteToolSpec` — JAMAIS une
  annotation de type, elle élargit `inputSchema` et casse l'inférence de `server.tool`) ; `<x>.tool.ts` = mince,
  seul autorisé à importer le SDK MCP (frontière PHYSIQUE par fichier — le SDK tire express/cors/hono, le
  tree-shaking n'est pas une garantie). Gardes : `tests/aiTools/noMcpSdkInSpecs.test.ts` (⚠️ matcher des motifs
  d'IMPORT `from '...'`, pas la simple MENTION — mon 1er garde flaggait son propre commentaire explicatif).
  **Preuve verbatim d'un split de SURFACE (noms/descriptions/schémas) = CAPTURE d'enregistrement mesurée**
  (faux `server.tool` qui enregistre {name, description, schemaKeys} sur worktree HEAD vs courant, puis diff) —
  un grep/regex de littéraux multi-lignes sur du texte FRANÇAIS (apostrophes) fabrique des faux positifs en masse.
- ⚠️ **Lot audit n°2 2026-07-21 — 3 leçons du panel (workflow adversarial, 14 findings → 4 vrais / 10 réfutés)** :
  (1) corriger une CLASSE de bug (catch de frontière silencieux) = GREP EXHAUSTIF des occurrences D'ABORD — le
  ticket disait « les 4 catch » alors qu'il y en avait 7 dans mcp/tools/ (+ les 2 catch clés-API du PUSH, même
  classe côté sync) : le compte du ticket ≠ le périmètre réel (sœur de [[FX-GUARD-TIGHTEN]]) ; (2) une AFFIRMATION
  COMPARATIVE écrite dans un commentaire de fix (« asymétrique avec le push, qui log ») se VÉRIFIE comme un finding
  — le panel a MESURÉ 0 logError dans syncPush : un commentaire faux fabriquera le prochain faux-négatif ;
  (3) appliquer le MÊME delta à DEUX copies d'un bloc dupliqué = le signal de CONSOLIDER au lieu de dupliquer le
  fix (apply_payslip inlinait runApply ; son message read-only avait DÉJÀ drifté — routé sur le helper).
- ⚠️ **Lot audit 2026-07-17 — 3 leçons du panel sur MES propres fixes** : (1) changer la BASE d'un champ d'un
  payload (monthlyIncome → réel) exige d'auditer les champs FRÈRES du même payload dérivés de l'ancienne base —
  `monthlyCashflow` resté sur Σ netSalary rendait `get_financial_overview` AUTO-contradictoire
  (`monthlyIncome − monthlyExpenses ≠ monthlyCashflow`), instance payload de [[TAX-AVGRATE-BASE]]/[[PH4D-BUDGET-RATIOS]] ;
  (2) une ÉTIQUETTE pilotée par la DONNÉE (`hasRealEstate`) quand le NOMBRE dépend du CHEMIN (repli sans CSV qui
  excluait l'immo) = étiquette qui MENT sur un chemin — aligner le nombre du repli sur la convention affichée
  (équité immo ajoutée au repli), pas l'étiquette sur le chemin le plus pauvre ; (3) DEUX filets d'alerte
  INDÉPENDANTS (migration legacy / réhydratation zustand) gatés par UN ref « déjà montré » partagé → le 2ᵉ toast
  est avalé PILE quand les deux échouent ensemble (localStorage inaccessible : les deux chemins tombent en même
  temps) — un ref de dédup PAR CANAL d'alerte, jamais partagé ; App non-rendable en test → verrou par TEST-SCAN
  du source (volume prouvé, cf FISC-CONST-LINT).
- ⚠️ **Source de vérité du REVENU affiché = vraies transactions de catégories de revenu, PAS le salaire d'onboarding**
  (leçon BUDGET-INCOME-REAL 2026-07-16, bug Marc « les revenus semblent pas logiques ») : la tuile Revenus du Budget
  sommait TOUS les positifs (remboursements/retours inclus) ET coexistait avec `config.users[].netSalary` (chiffre saisi
  au 1er chargement) → deux/trois bases de revenu incohérentes à l'écran. Règle : le revenu réel vient des transactions
  restreintes aux catégories `INCOME_CATEGORIES` (`Salaire` = paie, `Revenus divers`), transferts/doublons/positifs
  non-revenu EXCLUS, et VENTILÉ salaire vs divers (`computeIncomeBreakdown`, `utils/budgetSync.ts`). Toutes les surfaces
  « total de revenu » (tuile, donut, badge, payload IA) doivent partager CETTE base — un payload IA resté sur le salaire
  config fait raisonner l'IA sur un chiffre que l'utilisateur ne voit plus (contradiction déplacée, pas résolue).
  ⚠️ **EXCEPTION légitime : une décomposition brut→déductions→net (carte « Santé Financière ») a BESOIN du salaire BRUT
  déclaré** (les transactions ne portent que le NET déposé — impossible d'en dériver féd/QC/RRQ) → elle garde `config`,
  mais doit être ÉTIQUETÉE « (salaire déclaré) » pour ne pas être prise pour le revenu réel. ⚠️ **Restreindre le revenu
  aux catégories = un revenu mal catégorisé (`Autre`/`Investissement`) devient invisible** — trade-off assumé (ne plus
  sur-compter les remboursements) ; corollaire à surveiller : la liste de catégorisation manuelle (`Transactions.tsx`)
  doit proposer `Revenus divers`. ⚠️ **Retirer un consommateur d'une variable dérivée la rend MORTE** : brancher le
  payload IA sur `avgRealIncomeDisplay` a orphaniné `totalNetIncomeMonthly`/`totalNetIncomeDisplay` (config) → lint
  `no-unused-vars` → les supprimer dans le MÊME diff (grep AVANT de committer).
- ⚠️ **Un `eslint-disable react-hooks/exhaustive-deps` + commentaire justificatif peut CACHER une vraie dep manquante**
  (leçon BUDGET-MONTH-NAV 2026-07-16, bug signalé Marc) : `Budget.tsx` désactivait la règle sur le memo `actualsMap`
  (deps listées à la main car `getDateRange`/`now` sont recréés à chaque render) MAIS avait OUBLIÉ `periodOffset` — que
  `getDateRange` applique (`now.getMonth() + periodOffset`) → naviguer vers un autre mois NE recalculait pas les dépenses
  réelles (memo figé, « ça s'actualise pas »). Le commentaire affirmait à tort « timeView/customStart/customEnd couvrent
  déjà les params ». Réflexe : quand un memo filtre via une FONCTION qui lit un état (getDateRange lit periodOffset),
  lister TOUS les états que la fonction lit ; et CROISER avec les memos VOISINS (ici revenus/alertes listaient bien
  `periodOffset` — l'incohérence était le tell). Le label inline (getDateRange en JSX) se met à jour, lui, donc « la date
  change mais pas les chiffres » = signature d'un memo à deps incomplètes. Test discriminant : scoper la valeur MÉMOÏSÉE
  affichée (ici la réel `.text-kpi` de la tuile, pas la prévu) et prouver qu'elle change à la navigation.
- ⚠️ **Vérifier une page qui POLL en continu dans le preview (dashboard ACC, toute surface live)** (leçon ACC-LOT3
  2026-06-19) : `preview_screenshot` **TIMEOUT (30 s)** — l'outil attend un « réseau au repos » qui n'arrive JAMAIS
  (poll 2 s perpétuel), même sur une page courte ; ce n'est PAS un bug de la page (console propre). M'a coûté 3 timeouts.
  Utiliser les outils TEXTE (`preview_snapshot`/`preview_eval`/`preview_network`/`preview_console_logs`) — de toute façon
  PRÉFÉRÉS pour vérifier structure/texte/erreurs/interactions. Preuve d'interaction = `preview_eval` (clic + assertion DOM).
- ⚠️ **Le preview headless rend `window` en 0×0 → Recharts (et tout `ResizeObserver`) NE DESSINE PAS** (leçon R3-TOOLTIP
  2026-06-22) : un graphe Recharts dans le preview a un `ResponsiveContainer` à 0×0 (interne `width:0;height:0`), donc
  aucun `.recharts-surface`/grille — `preview_resize` programmatique NE réveille PAS le ResizeObserver de façon fiable.
  Le preview reste bon pour PROUVER « zéro crash + zéro erreur console au montage » (l'arbre React monte), mais l'INTERACTION
  sur un graphe (survol/clic/tooltip/figeage) se vérifie en **e2e Playwright** (vrai viewport Chromium, où Recharts dessine).
  ⚠️ **e2e d'un graphe Futur** : (a) le graphe est GATED derrière le bouton « vois directement ta projection actuelle (sans
  optimiser) » → le cliquer d'abord ; (b) `locator.isVisible()` NE PATIENTE PAS → `waitFor({state:'visible'})` avant de cliquer
  un élément qui vient de monter ; (c) le graphe est sous la ligne de flottaison → `scrollIntoViewIfNeeded()` + CLAMPER les
  coords de `page.mouse.click/move` au `viewportSize()` (sinon le clic tombe hors écran et ne déclenche rien).
  ⚠️ **(d) une bannière `position:fixed` (consentement Loi 25, bas, z-40) SE SUPERPOSE au bas du graphe et INTERCEPTE les
  clics** (leçon TOOLTIP-CLICK-BANNER 2026-06-22) : `elementFromPoint` au point de clic renvoyait la bannière, pas le SVG
  Recharts → `[data-frozen-tooltip]` jamais visible → faux échec e2e selon le viewport (passait en local, rouge en CI). Fix =
  pré-régler le consentement dans `scriptBypassOnboarding` (`localStorage['financeai:analyticsConsent:v1']='denied'`) → la
  bannière n'apparaît pas. **Même cause pour un VRAI bug utilisateur** : tant que la bannière n'est pas fermée, le bas du graphe
  n'est pas cliquable (« il faut cliquer sur la courbe »). Réflexe debug : `document.elementsFromPoint(x,y)` révèle l'overlay.
  ⚠️ **(e) un clic e2e sur le graphe peut tomber sur une PASTILLE d'événement** (leçon TOOLTIP-CLICK-PASTILLE 2026-06-22) :
  coexistence R3 = pastille (`stopPropagation`) → ouvre la MODALE, zone vide → fige le tooltip. Un point de clic FIXE tombe
  tantôt sur une pastille (modale) tantôt sur du vide (gel) selon l'échelle/les events de la projection → e2e FLAKY (vert seul,
  rouge en suite). Fix : cliquer en ZONE VIDE (Y bas, sous les pastilles qui collent à la courbe) et ESSAYER plusieurs X, en
  fermant la modale si on touche une pastille, jusqu'au gel (cf `freezeViaClick` dans `futureTooltip.spec`).
- MCP : connecteur livré (Lots 0-3) + `simulate_what_if`/séries (Lot 1 claude.ai, 2026-07-13) ; chantier
  Cloud Run relancé (BACKLOG §MCP-CLOUDRUN : HTTP → OAuth 2.1 → deploy). ⚠️ claude.ai custom connectors =
  OAuth 2.0/2.1 SEULEMENT (pas de champ Bearer statique dans l'UI — vérifié 2026-07-13).
- ⚠️ **« vente » est un MOT RÉSERVÉ de `applyLifeEvents`** (leçon MCP-WHATIF 2026-07-13) : la vente immobilière est
  détectée par SOUS-CHAÎNE sur `LifeEvent.name` (`includes('vente')`) → un GROS_ACHAT étiqueté « … après vente de
  l'ancienne » devient une VENTE (impactAmount IGNORÉ, delta 0 silencieux). Tout producteur PROGRAMMATIQUE de LifeEvent
  (MCP, IA) doit assainir le label (cf `safeEngineName`, `mcp/whatIf.ts`) ; racine `[ENG-LIFEEVENT-VENTE-SUBSTRING]` au
  BACKLOG. Sœur : construire un mois `YYYY-MM` pour matcher le moteur = MÊME chaîne que lui (`new Date(y,m,1).toISOString()`,
  conversion UTC) — un formatage en composants LOCAUX décale d'un mois dans les fuseaux en avance sur UTC.
- ⚠️ **Un tool MCP `apply_*` qui MET À JOUR doit rendre ses champs $ OPTIONNELS (update PARTIEL), stricts à l'AJOUT**
  (leçon MCP-APPLY-DEBT 2026-07-15, finding panel) : des champs requis à chaque appel forcent l'IA à RE-fournir des
  chiffres qu'elle n'a pas (contredit « n'invente jamais ») → risque d'écraser un solde juste par une approximation.
  Pattern : payload optionnel + « si fourni, alors valide » (bornes D9) + requis seulement quand la cible n'existe pas.
  Sœur : une regex d'inférence sur un NOM utilisateur → accents strippés (`normalize('NFD')`+`\p{Diacritic}`) et mots
  COURTS ancrés `\b…\b` (« char » nu matchait « Chargex »/« recharge » — prouvé par le panel).
- ⚠️ **Rendre ÉDITABLE un AGRÉGAT DÉRIVÉ (via MCP/IA) = appliquer un DELTA sur UN terme de la somme, JAMAIS écraser
  l'agrégat** (leçon MCP-DIRECT-EDIT/set_cash 2026-07-28) : le cash est DÉRIVÉ (`computeStartingCash` = Σ initialBalances
  + Σ transactions non-dup/transfert, source unique) — « mets mes liquidités à X » ne peut pas écrire un champ `cash`
  (il n'existe pas). Le fix source-unique = `initialBalances.LIQUIDITE += (X − current)` → la somme atteint la cible sans
  toucher les transactions ni les autres soldes (compte visible/réversible dans Réglages → Comptes). L'invariant de test
  est le **ROUND-TRIP `f(next) === target`** (impl-agnostique : peu importe COMMENT le delta est réparti, le calcul dérivé
  DOIT redonner la cible) + idempotence (2ᵉ appel même cible = 0 changement, discriminant delta-vs-écrasement) + les
  AUTRES termes intacts. Ne JAMAIS recopier la formule de l'agrégat côté écriture (le helper `computeStartingCash` reste
  l'unique lecteur). **Confirmation MCP à 2 temps** = `RunApplyOptions {requireConfirm, confirmed}` dans `runApply` (dry-run
  APERÇU sans écriture si `confirm` absent → 2ᵉ appel `confirm:true` persiste) ; le `confirm` est un flag de CONTRÔLE, PAS
  une donnée du DocumentPayload (`toDocument` l'exclut) ; l'app garde son modal `writeExecutor` (chaque surface sa confirmation native, pas de double-gate).
- ⚠️ **La SORTIE JSON d'un tool MCP data-aware est une surface d'INJECTION de prompt indirecte — MAIS scruber en AVEUGLE
  détruit des garde-fous** (leçon MCP-PROMPT-SCRUB 2026-07-16, DOUBLE finding panel security+code-reviewer) : un nom d'actif
  (auto-rempli Finnhub), un payee/catégorie (extrait d'un PDF de courtage), un nom de projet/utilisateur = TEXTE LIBRE lu par
  Claude → vecteur d'injection. `sanitizePromptText` n'était appliqué qu'au PROMPT-building (`claude.ts`/`AiAssistant`), PAS aux
  réponses de tools. ⚠️ **1er jet FAUX** : `scrubMcpDeep` scrubait+tronquait (200) TOUTE string du payload → il a SILENCIEUSEMENT
  tronqué les NOTES/verdicts RÉDIGÉS PAR LE CODE (`getTaxSituation.notes` 889 c. « celiRoom… sont des AGRÉGATS du ménage »,
  `netTaxSettlementsNote` « net ≠ impôt total payé » anti-incident -50 253 $, `dollarsBasis`, `incomeSources.note`) — des
  garde-fous money-critical qui EMPÊCHENT Claude de mésinterpréter un agrégat ménage/un settlement d'avril. Le fix a réintroduit
  les bugs mêmes qu'ils prévenaient. **Correction** : scruber par **allowlist de CLÉS user-free-text** (`USER_TEXT_KEYS` =
  name/payee/category/label/employer/description) au chokepoint `jsonContent`, PAS toute string. Les notes code-auteur (clés
  `notes`/`verdict`/`…Note`) et les identifiants (`symbol` — sinon `^GSPC`→`GSPC`) passent INTACTS. Leçon transverse : **du texte
  RÉDIGÉ PAR LE CODE (prose, mise en garde) ≠ du texte SAISI PAR L'UTILISATEUR — un scrub/cap conçu pour le 2ᵉ ne doit JAMAIS
  s'appliquer au 1ᵉʳ**. Limite assumée : injection en langage NATUREL passe toujours (defense-in-depth). Garde-test : notes intactes
  au-delà de 200 c. + nom malveillant neutralisé. ⚠️ Étendre `USER_TEXT_KEYS` si un futur tool expose un nouveau champ libre.
- ⚠️ **Les dettes du moteur n'ont PAS de date de début** (elles sont servies dès le mois 0, `projection.ts` §dettes) :
  injecter une dette pour un événement FUTUR fausse le patrimoine AVANT l'événement (mesuré −28 k$ quatre ans trop tôt)
  → rejeter/borner le cas (cf what-if financement différé) tant que `[MCP-WHATIF-DATED-DEBT]` n'est pas fait.
- ⚠️ **Un helper qui laisse l'APPELANT choisir la BASE d'un diff finit avec la mauvaise base**
  (leçon FINTABLE-SYNC-STALE-BASE, 2026-08-05). `referenceDeltaPatch(base, next)` était exposé aux
  appelants ; les DEUX (carte Réglages et sync auto) passaient l'état capturé AVANT le fetch réseau,
  donc une saisie manuelle faite pendant les quelques secondes de réseau était réécrite et perdue en
  silence. Le commentaire du helper affirmait pourtant qu'« une modification concurrente n'est pas
  écrasée » — vrai pour les clés NON touchées, faux pour celles que la passe réécrit justement
  (`transactions`). **Correctif structurel, pas vigilant** : rendre le patch DÉJÀ calculé, depuis le
  seul endroit où la base est connue sans ambiguïté (juste après l'application). La faute cesse
  d'être exprimable dans le type. Généralisation : quand un contrat offre deux façons de faire dont
  une est fausse, en retirer une vaut mieux que documenter laquelle choisir.
- ⚠️ **Un verrou « une seule passe à la fois » ne protège PAS de l'UTILISATEUR** (même leçon). Le
  mutex de sync empêchait deux passes concurrentes et avait été validé comme tel par un panel — il
  laissait entièrement ouverte la course passe ↔ édition manuelle. Nommer ce contre quoi un verrou
  protège, et ce contre quoi il ne protège pas, fait partie du verrou.
- ⚠️ **Un abandon sur conflit OCC n'est « sûr » que côté intégrité — il a un COÛT de fraîcheur**
  (même leçon). Le cron Fintable jetait toute la passe sur collision : rien de corrompu (l'OCC fait
  son travail), mais sur une cadence quotidienne, une collision = une journée de retard, exactement
  le symptôme dont Marc s'est plaint. Une re-tentative UNIQUE qui ré-applique les mêmes payloads sur
  l'état frais coûte un aller-retour et sauve la journée ; rejouer le réseau serait disproportionné,
  et une boucle pilonnerait le Drive.
- ⚠️ **Un ticket peut décrire l'existant à l'envers** (leçon SUBS-TAB, 2026-08-05) : il réclamait
  « une surface dédiée » pour les abonnements comme s'il n'y en avait aucune — alors qu'elle vit
  dans `Planning.tsx` depuis TX-SUBSCRIPTIONS, avec alertes, totaux et épinglage. Le grep AVANT de
  coder (règle CLAUDE.md) a évité de reconstruire ce qui existait ET a révélé le vrai manque :
  aucun moyen de REFUSER un faux positif. Le libellé d'un ticket est une hypothèse sur le code,
  pas un constat.
- ⚠️ **Confirmer et refuser ne sont pas symétriques — implémenter l'un ne donne pas l'autre**
  (même leçon) : « épingler » gardait un abo détecté, mais rien ne permettait de dire « ce n'est
  pas un abonnement » — donc un faux positif revenait à chaque actualisation, indéfiniment. Quand
  une UI propose une confirmation, vérifier que le REFUS existe aussi, sinon le bruit est éternel.
- ⚠️ **Un refus « définitif » doit rester VISIBLE et réversible** (même leçon) : une exclusion
  persistée mais invisible est un piège — un mauvais clic ferait disparaître un vrai abonnement
  sans recours, et l'utilisateur chercherait pourquoi son total a baissé. Durable ≠ irréversible :
  compter les écartés à l'écran et offrir le retour arrière.
- ⚠️ **Un refus se persiste par CLÉ, pas par objet** (même leçon) : stocker le `RecurringItem`
  complet aurait figé des montants et une date qui bougent au débit suivant. Ce qu'on refuse, c'est
  le MARCHAND. Corollaire appliqué : le filtre vit dans le module PUR (qui ne se fie pas au handler
  d'UI pour maintenir la cohérence), pas seulement dans le composant.
- ⚠️ **Retirer une option d'un menu peut escamoter une donnée DÉJÀ posée** (leçon
  PH4C-SAVINGS-NATURE, 2026-08-05) : filtrer les postes d'épargne du menu de liaison a rendu
  invisible un lien existant vers l'un d'eux — et le moindre changement du `<select>` l'aurait
  effacé en silence. Quand on restreint un choix, traiter séparément « ce qu'on PROPOSE » et
  « ce qui est DÉJÀ sélectionné » : la valeur courante doit rester visible et défaisable, même
  quand elle n'est plus offerte. Attrapé par le test du lot lui-même, pas par le typecheck.
- ⚠️ **Une UI qui CACHE une valeur qui agit est aussi trompeuse qu'une UI qui MENT** (leçon
  GOAL-DEADLINE-UI, même lot) : l'échéance d'un objectif pilotait un décaissement réel et
  l'assistant pouvait l'écrire, mais rien ne l'affichait — donc une écriture IA était invisible ET
  irréversible. Quand un tool MCP peut écrire un champ, vérifier que l'UI le MONTRE et permet de le
  défaire ; sinon l'automatisation devient opaque au moment précis où elle agit.
- ⚠️ **Ne pas introduire un 2ᵉ encodage pour un sens qui en a déjà un** (même lot) : `deadline` est
  un `string` REQUIS et le formulaire de création utilisait déjà `''` pour « pas d'échéance ».
  Écrire `undefined` depuis le nouveau chemin aurait donné deux représentations du même état, qui
  divergent toujours à terme. Le typecheck l'a attrapé ici — il ne le fera PAS sur un champ optionnel.
- ⚠️ **Ancrer UNE occurrence d'une constante ne l'ancre pas** (leçon FISC-CONST-ANCHOR-DEBT,
  2026-08-06) : j'ai sorti `0.18` de `taxJanuary` en écrivant au CHANGELOG « il y a désormais un
  seul endroit à corriger, et il est nommé ». L'audit a trouvé le MÊME 18 % dans
  `setupSimulation.ts` et le MÊME arrondi CELI à deux endroits de `utils/tax.ts`. Avant d'annoncer
  une source unique, GREPPER la valeur dans tout le dépôt — sinon la phrase promet une garantie que
  le code ne tient pas, ce qui est pire que de ne rien dire.
- ⚠️ **Déplacer une constante vers un fichier NON scanné la fait sortir du garde** (même leçon) :
  `RRIF_RATE_PLATEAU` est parti de `taxJanuary` (scanné, inventorié) vers `helpers.ts` (absent de
  `FISCAL_MODULES`, et invisible au garde v1 car `0.20` n'est pas « distinctif »). La dette avait
  simplement changé de cachette. Un refactor qui traverse une frontière de scan doit DÉPLACER la
  frontière avec lui.
- ⚠️ **Un garde bruyant se fait désarmer — exclure le bruit est un travail de CONCEPTION** (même
  leçon) : élargir le scan à `helpers.ts` a d'abord noyé le signal sous les entrailles du générateur
  pseudo-aléatoire (`Math.imul(t ^ (t >>> 15), t | 1)`). Exclure les opérateurs BINAIRES est
  légitime et sans perte — aucune règle fiscale ne s'écrit avec `>>>`, `<<`, `&`, `^` ou un `|`
  simple. Restreindre sur un critère SÉMANTIQUE vaut mieux que relâcher un seuil.
- ⚠️ **Attribuer un offender au mauvais fichier de mémoire** (même leçon, petite mais révélatrice) :
  j'ai inventorié une dizaine de valeurs sous `helpers.ts` alors qu'elles vivaient dans
  `setupSimulation.ts`. Le test d'intégrité ne l'a pas vu — il ne vérifie que l'appartenance aux
  modules scannés, pas que l'entrée corresponde à un littéral RÉEL. Faire cracher la liste PAR
  FICHIER au scan lui-même plutôt que la reconstituer à la lecture.
- ⚠️ **Un seuil PORTÉ PAR UNE ABSENCE est indétectable — et donc incorrigible** (leçon
  FISC-RRIF-FRACTIONAL-AGE, 2026-08-06) : le plateau FERR commençait à 95 ans sans qu'aucune ligne
  n'écrive `95`. La règle vivait dans le fait que la table `RRIF_RATES` s'arrêtait à 94 et qu'un
  repli `|| 0.20` ramassait tout le reste. Aucun garde de constantes ne peut relever un littéral
  qui n'existe pas ; aucune relecture ne peut vérifier une règle que personne n'a écrite. Quand un
  comportement dépend de « ce qui n'est PAS dans la table », le NOMMER (`RRIF_PLATEAU_AGE`) est le
  correctif — pas un commentaire.
- ⚠️ **Un repli attrape-tout choisit une valeur pour des entrées qu'on n'a pas imaginées** (même
  leçon) : `RRIF_RATES[age] || RRIF_RATE_PLATEAU` distribuait le facteur le PLUS PUNITIF du barème
  à tout âge absent de la table. Âge fractionnaire 72,5 → 20 % au lieu de 5,40 %. Âge `NaN` → il
  traversait le filtre `age < 72` (toute comparaison avec NaN est fausse) et ressortait aussi à
  20 %. Un repli doit couvrir le cas qu'il DÉCLARE couvrir (`age >= 95 ? plateau : …`) ; l'écrire
  comme un `||` en fait un attrape-tout dont la couverture réelle est inconnue de son auteur.
- ⚠️ **Deux règles qui COÏNCIDENT ne sont pas la même règle — nommer les fusionne pour toujours**
  (leçon FISC-RRIF-FRACTIONAL-AGE, 2026-08-06) : en bornant `rrifRateForAge` par le bas, j'ai écrit
  `age < RRIF_FIRST_WITHDRAWAL_AGE` (72). La table porte pourtant un facteur à **71** ans, mis là
  DÉLIBÉRÉMENT pour une conversion REER→FERR volontaire précoce. « Quand la conversion est due »
  (71) et « quand le premier retrait est forcé » (72) sont deux règles ARC distinctes, séparées
  d'un an — les faire passer par un seul seuil supprimait un cas réel. **C'est mon propre test de
  non-régression qui l'a attrapé, pas une relecture** : la boucle `71 → 94` a échoué sur 71.
  Avant de donner UN nom à une valeur qui apparaît à plusieurs endroits, vérifier qu'ils désignent
  le même CONCEPT, pas seulement le même nombre — sinon le prochain changement de loi qui les
  sépare devra d'abord défaire la fusion.
- ⚠️ **Un helper EXPORTÉ ne doit pas dépendre de la prudence de son unique appelant** (même leçon) :
  `rrifRateForAge` rendait 20 % pour un âge de 50 ans (absent de la table → repli plateau), soit
  exactement la faute qu'elle venait corriger, reproduite un cran plus haut. Le `continue` de
  l'appelant la masquait. Une fonction publique doit être correcte sur TOUT son domaine d'entrée,
  pas seulement sur celui que le call-site d'aujourd'hui lui présente.
- ⚠️ **L'ORDRE des gardes peut remplacer un cas particulier codé en dur** (même leçon) : deux
  non-finis avaient des sens OPPOSÉS — `−Infinity` = « conjoint sans âge » (absence délibérée,
  silence légitime) vs `NaN`/`+Infinity` = donnée corrompue (à journaliser, convention
  `pastPurchaseInit.ts`). Plutôt que de tester `age === -Infinity`, placer la borne basse EN
  PREMIER les sépare gratuitement (`−Infinity < 71` est vrai). Un test `if (x === -Infinity)`
  aurait figé dans le code un savoir qui appartient au domaine.
- ⚠️ **Une clé d'inventaire `(fichier, valeur)` finit par coûter — prévoir la collision de SENS**
  (même leçon) : le compromis était documenté en tête de `fiscalConstGuardV2.ts` (« une deuxième
  occurrence de la même valeur dans le même fichier passe »), mais il a été VÉCU dès l'ajout
  suivant : `95` désigne à la fois le plateau FERR (fiscal) et le palier terminal de la courbe de
  mortalité (design) dans `helpers.ts`. Le test de doublon a bien cassé — bonne nouvelle. Résolu
  en fusionnant les deux sens dans UNE entrée qui les nomme tous les deux, avec la famille la plus
  EXIGEANTE (`fiscal`). Taire une des deux natures aurait fait mentir l'inventaire.
- ⚠️ **Un garde sur un terrain déjà peuplé doit être un RATCHET, jamais un échec dur** (leçon
  FISC-CONST-GUARD-V2, 2026-08-05) : 38 littéraux existaient déjà dans les modules fiscaux. Un
  échec dur aurait cassé sur 38 lignes le jour de sa naissance — donc aurait été relâché jusqu'à ne
  plus rien attraper. Inventorier l'existant AVEC SA RAISON et n'échouer que sur le NOUVEAU garde
  la valeur ET reste vivable. L'inventaire n'est pas une liste d'exemptions : c'est un CONSTAT daté
  qui rend la dette visible (ici 14 entrées fiscales non ancrées, ticketées).
- ⚠️ **Le TRI est la valeur d'un garde de constantes, pas le scan** (même leçon) : les 38 littéraux
  se répartissent en vrais paramètres fiscaux (le `0.18` du plafond REER, en dur), heuristiques de
  CONCEPTION (`0.95` Guyton-Klinger, seuils de meltdown) et structurels (index de mois). Les
  confondre polluerait `FISCAL_REFERENCE` avec des choix d'algorithme — une erreur de CATÉGORIE
  plus coûteuse que le trou d'origine.
- ⚠️ **Élargir un scan-garde révèle ce que l'œil a manqué** (même leçon) : le tri MANUEL avait
  raté `RRIF_RATES[age] || 0.20` — un vrai facteur FERR — parce que `||` ne ressemble pas à un
  opérateur de calcul. C'est le garde qui a trouvé les 4 derniers, pas moi. Corollaire : ne pas
  figer un inventaire avant d'avoir fait tourner le scan élargi.
- ⚠️ **Ne jamais inventorier une valeur qu'on ne sait pas expliquer** (même leçon) :
  `taxCurrentYearGains / 0.25` restait obscur ; l'élucider AVANT (c'est un proxy d'inversion
  impôt→gain à taux effectif supposé, pas un taux statutaire) évite de figer une ignorance dans un
  garde, ce qui lui donnerait l'air de protéger quelque chose. D'où l'assertion « chaque entrée
  porte une raison lisible » — qui a attrapé trois de mes propres entrées bâclées en « idem ».
- ⚠️ **Un garde qui strippe les commentaires ne peut plus y lire son échappatoire** (leçon
  MCP-CHARTDATA-SUM-GUARD, 2026-08-05) : le marqueur d'exemption vit par nature dans un commentaire,
  et le scan le supprimait AVANT de le chercher → toutes les exemptions ignorées, en silence. Chercher
  l'échappatoire sur la ligne BRUTE, la violation sur la ligne strippée. Attrapé par son propre test
  au premier lancement — ce qui est l'argument pour tester l'échappatoire, pas seulement la détection.
- ⚠️ **Une quantité DÉRIVÉE n'est juste que si les quantités suivies sont COMPLÈTES** (leçon
  FISC-REEE-GRANT-CLAWBACK, tentée et REVERTÉE le 2026-08-05). J'ai écrit que les trois poches du
  RÉEE « somment au solde PAR CONSTRUCTION » — vrai de l'arithmétique, faux du système : le solde est
  aussi alimenté par des chemins que les compteurs n'observent pas (solde d'OUVERTURE lu depuis les
  avoirs, `reee *= keep` au divorce, choc de marché). Tout ce qu'ils ne voient pas tombe dans la
  poche dérivée — ici la poche IMPOSABLE — donc un RÉEE existant se faisait imposer à ~70 %
  (**mesuré −31 193 $ à −59 025 $** selon la fixture). Avant de dériver, énumérer TOUS les
  producteurs du total, pas seulement ceux qu'on ajoute soi-même.
- ⚠️ **Un compteur PAR ENTITÉ posé sur un solde MUTUALISÉ est un bug qui attend** (même leçon) :
  `_childReee` est un solde MÉNAGE unique, mais les poches étaient par enfant — la fermeture du
  premier enfant remettait le solde global à zéro, liquidant et imposant l'argent du cadet
  (**mesuré +7 890 $ d'impôt fantôme**). Vérifier la granularité du SOLDE avant de choisir celle des
  compteurs.
- ⚠️ **Reprocher un défaut à l'ancien code ne vaccine pas contre lui** (même leçon, la plus humble) :
  le message de commit dénonçait « deux erreurs de sens opposé qui se masquent »… et le correctif en
  introduisait deux nouvelles, mesurées par le panel — assiette MÉNAGE au lieu du souscripteur
  (**+6 469 $**) contre revenu NON indexé dans un barème indexé (**−2 614 $**). Le net avait l'air
  raisonnable. Nommer une classe d'erreur, c'est se donner une checklist à s'appliquer à SOI.
- ⚠️ **Un flux qui n'alimente AUCUN registre casse la conservation en silence** (même leçon) : le
  remboursement des subventions n'existait que dans une chaîne de log → résiduel **−10 800 $** au
  mois de fermeture. Corollaire mesuré et instructif : la face ENTRANTE ne l'était pas non plus,
  dans l'ANCIEN code aussi (+125 $/mois) — l'ancien modèle créait donc 10 800 $ nets sans cause
  visible, et personne ne l'avait vu parce que `moneyConservation` tourne avec `childGoals: []` et
  que le fuzz exclut explicitement le RÉEE. **Un invariant qui n'exerce pas un domaine ne le protège
  pas** : un gate vert sur 3 574 tests est un vert de COUVERTURE, pas de correction.
- ⚠️ **Écrire un runbook qui s'appuie sur un signal que le code ne produit PAS** (leçon
  MCP-CLOUDRUN-AUTH-HARDENING, panel PR #566) : le runbook de rotation de clé désignait « une
  tentative suspecte dans les logs Cloud Run » comme déclencheur, alors que ni le blocage 429 ni le
  refus 403 n'écrivaient la moindre ligne — la doc décrivait une capacité inexistante, et le seul
  moment où on s'en serait aperçu est pendant un incident. Quand une doc dit « surveille X »,
  vérifier dans le code que X est ÉMIS, pas seulement que la condition existe. Classe sœur de
  « un commentaire qui affirme se vérifie ».
- ⚠️ **Un plafond « N par fenêtre » devient `N × instances` dès qu'il vit en mémoire** (même panel) :
  `deploy.sh` fixe `--max-instances 2`, donc les « 8 échecs / 15 min » annoncés valaient en réalité
  16 sous scale-up. Le chiffre affiché dans une doc de sécurité doit intégrer la topologie de
  déploiement, sinon il est faux — mesurer la config, pas seulement lire le code du limiteur.
- ⚠️ **Un test de panne qui échoue TOUJOURS ne teste pas la re-tentative** (finding code-reviewer,
  même panel, prouvé par INJECTION) : le test de conflit OCC existant faisait échouer `save` à
  chaque appel, donc il ne distinguait pas « conflit puis succès » de « conflit permanent » — un
  retry qui repassait la version PÉRIMÉE le laissait 100 % vert. Un chemin de RÉCUPÉRATION exige un
  mock qui échoue puis RÉUSSIT ; sinon on teste l'abandon, pas la reprise.
- ⚠️ **Un rate-limit PAR IP derrière un load balancer est une illusion de protection** (leçon
  MCP-CLOUDRUN-AUTH-HARDENING, 2026-08-05) : `X-Forwarded-For` est en partie sous contrôle du
  client, donc la clé se fait varier. Sur un service MONO-UTILISATEUR, un compteur GLOBAL est à la
  fois plus strict et plus honnête. Et compter les **ÉCHECS** plutôt que les tentatives supprime le
  compromis apparent « sécurité vs confort » : l'usage légitime ne consomme jamais de quota.
- ⚠️ **Mesurer le périmètre d'un garde AVANT de l'écrire change sa taille estimée** (leçon
  FISC-CONST-GUARD-V2, 2026-08-05) : le ticket disait « S, ajouter un scan ». Le scan des littéraux
  inline en position arithmétique sur les 4 modules fiscaux rend **25 offenders**, mêlant de vrais
  chiffres fiscaux en dur (`0.18` = plafond REER, âges 65/71/72) et des heuristiques de CONCEPTION
  (`0.95` Guyton-Klinger) qu'il ne faut surtout PAS traiter comme fiscales. Le vrai travail est un
  RATCHET + un tri qui alimente FISCAL_REFERENCE — donc M, pas S. Un garde écrit sans mesurer aurait
  soit échoué d'emblée sur 25 lignes, soit été relâché jusqu'à ne plus rien attraper.
- ⚠️ **Le décaissement NON-ENREGISTRÉ/liquide n'a AUCUN champ `Retrait*` dans chartData** (leçon MCP-RETIREMENT-VERDICT
  2026-07-14) : le moteur émet `RetraitREER`/`RetraitCELI`/`RentalIncome`, mais les ventes non-enregistrées et le liquide
  qui financent la retraite sont INVISIBLES en flux → toute « somme des revenus de retraite » depuis chartData SOUS-estime
  structurellement (mesuré : 3 923 $/mois identifiables vs cible 5 500 $ sur un plan DINK qui TIENT à MC 98 %). Un verdict
  « le plan finance-t-il la cible ? » doit s'appuyer sur les signaux d'adéquation du moteur (`minNetWorth > 0` sur l'horizon,
  `successRate` MC), JAMAIS sur une somme de flux. NB : `shortfallRate` ≠ échec du plan (il compte les mois financés par
  VENTES d'actifs — normal en décaissement, cf `cashflowAllocation.ts:174`).
- **`knip`** : la liste « unused exports » est surtout du BRUIT (types effacés au compile, symboles sur-exportés
  utilisés en interne ou par les tests, constantes fiscales protégées). NE PAS purger en masse — vérifier chaque
  cas (grep). Repo déjà propre au 2026-06-15 : 0 fichier mort, 0 dépendance inutilisée, lint clean.
  ⚠️ **Le code mort `_`-préfixé ÉCHAPPE au lint ET à knip** (leçon DETTE-DEADCODE 2026-06-26) : une `const _x = useMemo(…)`
  jamais rendue survit indéfiniment (le `_` dit à `no-unused-vars` « ignore-moi », et knip ne flague pas les locales). Une
  chasse au code mort doit aussi GREP les `_`-préfixés non consommés (vu : `_buyVsRentData` dans `RealEstate.tsx`, doublon mort
  de `combinedData` qui, lui, est rendu). Et avant de retirer une fonction exportée « test-only » : confirmer qu'aucune UI ne
  RÉIMPLÉMENTE la même logique inline (le vrai consommateur peut être un recalcul local, pas la fonction partagée).
- Auth : **Cloudflare RETIRÉ de FinanceAI (2026-06-16)** — Access (mur de login) ET proxy DNS dé-proxifié
  (apex+www en « DNS only » vers Vercel ; le tunnel CF du `hub` reste, projet séparé). L'auth = **gate Google
  in-app** (`LoginGate`+`authGate`, actif via `VITE_GOOGLE_GATE=1`+`VITE_GOOGLE_CLIENT_ID`). ⚠️ **Gate HARD-block
  depuis 2026-07-14** (choix Marc, ex-SOFT) : pas d'accès tant que non connecté à Drive (la sauvegarde en dépend) ;
  la trappe anti-lockout n'apparaît QU'APRÈS un échec de connexion (Google en panne) + `?nogate=1` en URL reste dispo
  → jamais enfermé dehors loin de ses propres données. **Requiert `VITE_GOOGLE_GATE=1` en prod Vercel** (sinon inerte).
  Données privées par compte Google (Drive), clés chiffrées par appareil (IDB non-extractible). Détail : `docs/GOOGLE_DRIVE_SETUP.md`.
- ⚠️ **Sync Drive = anti-perte STRICT, JAMAIS d'écrasement auto du local réel** (leçon SYNC-ANTI-CLOBBER 2026-07-14,
  Marc a perdu 230k$ de placements) : `decideOnLoad` n'a PLUS d'exception `restoreIntent` (« gate → Drive gagne »). Cause
  du désastre : appareil silencieusement déconnecté (jeton expiré ~1h → `schedulePush` no-op en silence) → 230k$ jamais
  poussés ; à la reconnexion, méta vierge → l'ancien `restoreIntent` faisait un `pull` qui écrasait le local avec une VIEILLE
  copie Drive (SPCX seul). UNE seule règle : local vide → pull (restaure) ; local RÉEL + Drive divergent → `conflict` (choix
  via `SyncConflictModal` GLOBAL, monté au niveau App, avec résumé « cet appareil vs Drive »), jamais d'écrasement silencieux.
  + `SyncStatusBanner` (rouge, in-flow) dès que déconnecté-avec-données ou push en erreur (« propose de me connecter dès que
  je ne le suis pas »). + `flushPush` au `visibilitychange hidden`/`pagehide` → le dernier changement atteint Drive avant que
  Marc parte parler à Claude (sinon le MCP lit une copie périmée). Discriminant prouvé (git-stash : `conflict` true→false sur
  l'ancien code). ⚠️ **`disconnectSync` efface la méta** (`clearSyncMeta`) → déconnecter PUIS reconnecter recrée une méta vierge :
  ne JAMAIS conseiller ça pour « repartir propre » (c'est le piège qui a causé la perte). Récupération d'un local écrasé =
  auto-backup IndexedDB (`applyPulledPayload` → `createBackupNow('auto')` AVANT d'écraser) → Réglages → Sauvegarde → « Restaurer ».
- ⚠️ **Un timeout `fetch` via AbortController doit couvrir la LECTURE DU CORPS, pas seulement les en-têtes** (leçon
  SYNC-FETCH-TIMEOUT 2026-07-16, finding code-reviewer) : `clearTimeout` placé dès que `await fetch()` résout NE protège
  que la phase « jusqu'aux en-têtes » — `res.json()`/`res.text()` lisent le corps en streaming APRÈS, HORS budget → une
  connexion qui stalle PENDANT le téléchargement du corps (typique d'un gros pull, ~2000 tx) re-pend à l'infini, le bug même
  qu'on ferme. Fix : lire le corps DANS le budget (`withDriveTimeout(f, url, init, async res => {…res.json()…})`) — en abortant,
  le signal partagé fait REJETER un `res.json()` en cours. Test discriminant = un `Response` dont `json()` ne résout jamais
  tant que le signal n'abort pas (≠ un fetch qui ne résout jamais du tout — ça ne couvre que la moitié).
- ⚠️ **`fetch keepalive:true` / `navigator.sendBeacon` = plafond DUR de 64 Ko de corps** (leçon SYNC-FETCH-TIMEOUT 2026-07-16) :
  l'idée « keepalive pour fiabiliser le push au `pagehide` » est INAPPLICABLE au payload sync réel (~2000 tx + actifs + budgets
  → >64 Ko) — keepalive:true FERAIT ÉCHOUER les gros push. Mesurer la contrainte (64 Ko) contre la réalité (taille du payload)
  AVANT de coder. La fiabilité à l'unload d'un gros état = timeout + bannière de reconnexion + debounce, PAS keepalive/sendBeacon.
- ⚠️ **Un `catch` d'échec « attendu/silencieux » (reprise gate, boot) doit distinguer l'échec NOMINAL du reste** (leçon
  GATE-SILENT-DRIVE 2026-07-16, finding silent-failure) : `gateSilentResume` avait UN catch englobant → une erreur Drive
  APRÈS un jeton valide (timeout, réseau) était avalée comme un « pas de session » (renvoi muet au login, zéro trace). Scinder :
  phase 1 (jeton cache-only, échec = nominal → silencieux) vs phase 2 (post-jeton : identité/Drive → ROUTER via `handleError`,
  comme `runBootSync`). Un timeout qui rend un hang en `DriveError` n'est utile que si cette `DriveError` remonte jusqu'à `logError`/`status.error` — sinon on troque un hang contre un échec invisible.
- ⚠️ **Le jeton Google Drive = flux GIS « token » (~1h, PAS de refresh token) ; persistance en `localStorage` (clé DÉDIÉE,
  jamais synchronisée) + renouvellement silencieux** (leçon AUTH-DRIVE-PERSIST 2026-07-16, demande Marc « ne plus me reconnecter
  à chaque reload ») : l'ancien cache `sessionStorage` mourait à la fermeture d'onglet. Fix = `localStorage` (survit reload/onglet ;
  clé `financeai:gis:token:v1` ≠ `financeai-storage` → JAMAIS dans le push Drive, vérifié) + `scheduleTokenRenewal` (réobtient un
  jeton `prompt:''` ~2 min avant l'échéance, tant que l'onglet vit ; échec silencieux → bannière). Pas de refresh_token/offline
  (exigerait un backend, contraire à l'archi 100% navigateur / ADR-002 app solo). ⚠️ **ALLONGER la vie d'un jeton (renouvellement)
  peut RENDRE ILLIMITÉE une fenêtre de « session périmée » pré-existante** (DOUBLE finding panel security+code-reviewer) : le
  renouvellement gardait un 2ᵉ onglet « connecté » indéfiniment après une déconnexion/suppression faite dans un AUTRE onglet →
  « sync fantôme post-déconnexion » (Loi 25 droit à l'effacement) — avant, le jeton mourait en ≤1h, bornant le dégât. Fix =
  écouteur `storage` (se déclenche SEULEMENT dans les autres onglets) : à la suppression de la clé jeton (revokeAccess via
  disconnectSync OU deleteRemoteData → clearCachedToken), purger le jeton EN MÉMOIRE + arrêter le renouvellement → l'onglet cesse
  IMMÉDIATEMENT de pousser. Réflexe : quand tu prolonges la durée de vie d'un credential/cache, AUDITE la propagation de la
  révocation (multi-onglet, multi-device) — sinon tu débornes un « ghost » que la courte TTL masquait. Autres gardes du fix :
  plancher de 30 s au délai de renouvellement (anti-boucle si `expires_in` anormalement court) ; skip du renouvellement si une
  acquisition interactive est déjà en vol (`_pendingReject` singleton — un 2ᵉ appel écraserait sa promesse).
- ⚠️ **[AUTH-DRIVE-INACTIVITY] 2026-07-22 — « rester connecté + déconnexion auto après 8h d'inactivité » (demande Marc)** :
  extension de [[AUTH-DRIVE-PERSIST]]. (1) **CHANGEMENT DE POLITIQUE au boot** : l'ancienne règle « au boot, cache-only,
  JAMAIS de réseau silencieux » (par peur de `popup_failed_to_open`) FORÇAIT une reconnexion dès que le jeton ~1h avait
  expiré. Or `renewTokenSilently` (`prompt=''`) ne lève PAS de popup (échec = `error_callback` silencieux) → on l'appelle
  désormais au boot (`gateSilentResume`/`runBootSync`) sur cache-miss → reprise sans clic tant que la session Google vit.
  ⚠️ `prompt='consent'` (login interactif) reste réservé à un GESTE utilisateur ; seul `prompt=''` est safe au boot.
  (2) **Borne de session 8h d'inactivité** (`services/sync/inactivityLogout.ts`) : horodatage `lastActivity` persisté
  device-local (clé dédiée, throttlé 1×/min) + minuteur (`pointerdown`/`keydown`/`visibilitychange` sur `document`) →
  à 8h sans interaction, `handleInactivityLogout` **révoque** le jeton (garde la meta → reconnexion 1-clic, pas de
  ré-onboarding). La reprise silencieuse au boot est GATÉE sur `isInactivityExpired()` (≥8h → login requis). C'est la
  protection « session bornée » que [[AUTH-DRIVE-PERSIST]] recommandait (fenêtre fantôme fermée). (3) `isInactivityExpired`
  rend `false` si `lastActivity` jamais enregistré (pas d'expiration spontanée avant la 1ʳᵉ connexion). Test du minuteur =
  `vi.useFakeTimers` + `vi.setSystemTime` (le reschedule lit `Date.now()`). ⚠️ **TOUT nouvel export de `gisAuth`
  consommé par `syncLifecycle` doit être ajouté aux 3+ MOCKS `gisAuth` des tests sync** (`syncOrchestrator.{errors,
  flow,passphrase}.test.ts`) — sinon `undefined` → throw au 1er appel, et le `commit-gate` local ne l'attrape PAS si
  seuls les tests ciblés tournent : la SUITE COMPLÈTE (ou la CI) le révèle. Historique : `renewTokenSilently` +
  `AuthInteractionRequiredError` (AUTH-DRIVE-INACTIVITY), puis `traceSilentAuthFailure` (AUTH-DRIVE-STILL-RECONNECT,
  PR #504 — CI rouge sur ce piège exact, 2ᵉ récidive). Réflexe : grep `vi.mock.*gisAuth` sur tout `tests/` au moindre
  ajout d'export. ⚠️ **Déplacer la logique de sévérité DANS un helper de `gisAuth` (mocké dans les tests sync) rend le
  spy `logError` du test sync AVEUGLE** — le test sync doit alors vérifier le CÂBLAGE (`helper appelé avec l'erreur`),
  la sévérité étant unit-testée là où le VRAI helper tourne (`gisAuth.test.ts`).
  ⚠️ **CRITIQUE (finding panel sécurité, mesuré) — un « horodatage d'activité » ne doit avancer QUE sur une VRAIE
  interaction, jamais sur un chemin AUTOMATIQUE** : le 1er jet appelait `recordActivity()` sur tout succès de jeton
  (`gateSilentResume`/`runBootSync`) ET au montage du watch. Or `startDrivePolling` appelle `runBootSync` **toutes les
  60s** → l'horloge d'inactivité était réarmée en boucle → la déconnexion 8h ne se déclenchait JAMAIS (feature
  cosmétique). Corollaire : `handleInactivityLogout` ne doit PAS `clearActivity()` (sinon `null → isInactivityExpired
  false` → le polling reconnecte en ≤60s) — GARDER l'horodatage périmé jusqu'à une VRAIE reconnexion (`connectAndSync`).
  Règle : `recordActivity` seulement depuis (a) les événements DOM (`onActivity`) et (b) la connexion explicite ; JAMAIS
  depuis le boot/polling/reload. Discriminant : simuler N `runBootSync` (polling) → `getLastActivityAt()` INCHANGÉ +
  `onExpire` finit par tirer. Généralise : un TTL/expiration piloté par un timestamp est neutralisé si un heartbeat
  automatique (poll, keep-alive, renouvellement) rafraîchit ce timestamp — l'« activité » doit être STRICTEMENT humaine.
  ⚠️ **Distinguer l'échec NOMINAL du réseau au boot** : `renewTokenSilently` (nouvel appel réseau pré-jeton) échoue soit
  par interaction requise (pas de session → `AuthInteractionRequiredError`, SILENCE), soit par réseau/CDN (→ `logError`
  warning) — sinon un boot en panne réseau renvoie au login sans trace (classe GATE-SILENT-DRIVE, étendue au pré-jeton).
- ⚠️ **[AUTH-DRIVE-BANNER-FLICKER] 2026-07-31 — un booléen d'état AFFICHÉ nourri par « la dernière tentative a-t-elle
  réussi ? » fait CLIGNOTER l'UI** (bug Marc : bannière rouge fréquente qui « s'enlève seule ») : `runBootSync` (polling
  60 s + focus) basculait `connected:false` sur TOUTE erreur post-jeton (timeout Drive transitoire) et dès le 1er raté du
  renouvellement silencieux → « tes changements ne sont PAS sauvegardés » affiché à tort, corrigé au tick suivant. Un état
  DURABLE montré à l'utilisateur (connecté/déconnecté) ne doit basculer que sur (a) un échec DÉFINITIF discriminé par une
  CLASSE d'erreur typée (`AuthInteractionRequiredError` : seule une action utilisateur débloquera ; 401 `DriveAuthError` :
  jeton rejeté) ou (b) une panne transitoire qui DURE (grâce de N ticks consécutifs, `_transientAuthFailStreak` ≥ 3, série
  remise à zéro à chaque succès) — JAMAIS sur un raté isolé d'une boucle de fond. Corollaires : pendant la grâce, le canal
  d'erreur HONNÊTE reste ouvert (un push raté affiche la bannière « échec de sauvegarde », `errorPhase='push'`) ; le chemin
  de déconnexion doit poser `busy:false` (sinon le polling — skip si busy — reste gelé à vie) ; et l'erreur transitoire
  routée `handleError('boot')` reste visible en Diagnostics (pas avalée). ⚠️ **Un compteur de grâce module-level exige
  la RÉENTRANCE-SÛRETÉ de son incrémenteur** (finding code-reviewer #542, prouvé par sonde) : `focus` + `visibilitychange`
  tirent le MÊME handler quasi simultanément au retour d'onglet → 2 `runBootSync` concurrents = +2 sur la série pour UN
  événement logique (bannière dès 2 alt-tab au lieu de 3 ticks — le symptôme même qu'on corrigeait) → verrou de
  réentrance sur TOUTE la fonction qui mute le compteur (`_bootSyncInFlight`, modèle `_decisionInFlight`), pas seulement
  sur la sous-phase déjà verrouillée. Symétrique silent-failure : la grâce doit compter TOUTES les causes transitoires
  (échec renouvellement ET erreur Drive post-jeton) — sinon une panne Drive persistante reste invisible en flux (la
  bannière n'affiche que déconnexion/push, la carte Réglages ne suffit pas).
- Persistance : localStorage + IndexedDB chiffré (AES-256-GCM, PBKDF2 600k). apiKeys exclues.
- Mode test : PERSISTÉ depuis #217 (bannière survit au reload) ; push Drive coupé en test
  (`shouldPush`). Switch de persona = base propre (`personaResetBase`), zéro fuite inter-persona.
  ⚠️ **[PERSONA-PURGE] (incident 2026-07-15 : ~600 tx « Karim » + kar-fg1 dans les VRAIES données de Marc)** :
  tout id de fixture/générateur de persona DOIT être reconnu par `services/testPersonas/artifactIds.ts`
  (préfixes `persona-tx-`/`test-tx-`/`test-asset-` + ids exacts ; parité verrouillée par le test-scan
  `personaSanitizer.test.ts` — un nouveau persona à ids non enregistrés = test rouge). Un état RÉEL est
  désinfecté à 6 ancrages (boot avec backup pré-purge, sortie mode test, push Drive, pull Drive,
  restauration backup, lecture StateStore MCP) via `services/personaSanitizer.ts` (pur, skip mode
  test). Corollaires : (1) JAMAIS d'id de fixture persona
  dans une fixture de TEST d'un chemin réel (vu : `debts:[{id:'d1'}]` dans syncOrchestrator.flow — purgé
  par la ceinture push, à raison) ; (2) les ids réels sont horodatés (`cat_/debt_/rule_/<ts>`) — garder
  cette convention pour préserver « zéro faux positif » du purgeur.
- ⚠️ **[FINTABLE] 2026-07-29 — API « money is a string » : le décodage est le vrai chemin money-critical** :
  l'API Fintable V2 (`https://fintable.io/api/v2`, Bearer, enveloppe `{data}`) rend TOUS les montants en
  CHAÎNES décimales exactes. (1) **`Number('') === 0` ET `Number(null) === 0`** → sans garde explicite AVANT
  la conversion, un champ vide/absent devient un montant de **0 $ parfaitement crédible** (no-fake-data violé
  en silence ; extension de [[NAN-INPUT-HARDENING]] aux montants TYPÉS STRING). Règle : montant obligatoire
  illisible → erreur `MALFORMED` qui NOMME le champ (`transactions[12].amount`, diagnosticable depuis un cron
  à 3 h) ; montant absent → `null`, jamais 0. Tests discriminants qui PROUVENT le piège (`expect(Number('')).toBe(0)`).
  (2) **Les avertissements en petits caractères d'une doc d'API sont des EXIGENCES de code, pas du folklore** —
  trois lignes de « fine print » sont devenues trois règles non négociables : `pending=false` FORCÉ (les
  suppressions sont invisibles au polling et une pending est REMPLACÉE en se postant → `applyDocument` déduplique
  mais ne SUPPRIME jamais ⇒ doublon À VIE qui fausse `computeStartingCash`) ; `cost_basis` = coût **TOTAL** de la
  position, pas unitaire (notre `Asset.buyPrice` est PAR PART → champ nommé `costBasisTotal` pour rendre la
  confusion impossible, classe FISC-RRQ-UNIT) ; `Account.type` = texte libre « display it, don't switch on it »
  → on interroge les positions de TOUS les comptes actifs au lieu de deviner lesquels sont des comptes de
  placement (un compte mal étiqueté par le provider serait sinon ignoré sans erreur), et le type fiscal
  CELI/REER/NON-ENREG ne s'INFÈRE jamais — c'est une table pilotée par Marc.
  (3) **Un dry-run dont la sortie doit revenir dans le chat se conçoit MASQUÉ par défaut** (`•••`, `--show-amounts`
  en option locale) : c'est ce qui rend le diagnostic partageable sans exposer les chiffres réels. Corollaire du
  blocage : quand seul Marc peut exécuter (hôte hors politique réseau), la valeur du livrable EST la qualité de
  ce qu'il aura à recoller — dimensionner le rapport sur les décisions qu'il débloque, pas sur « ça marche ».
- ⚠️ **[FINTABLE-7] 2026-07-30 — « je veux que tu fasses tout toi » : MESURER ses propres accès avant
  de renvoyer une liste de tâches à Marc** : je lui avais donné 6 gestes d'infra (secrets GCP, redeploy,
  secret GitHub). Sa réponse a forcé la bonne question — *qu'est-ce qui est VRAIMENT bloqué ?* Vérifié
  plutôt que supposé : `which gcloud` ABSENT, aucun `~/.config/gcloud`, `fintable.io` = **403 CONNECT**
  (politique réseau du conteneur), et `ToolSearch` ne rend AUCUN outil de création de secret GitHub.
  Conclusion honnête : le chemin serveur exige irréductiblement des identifiants de SES comptes — ce
  n'est pas une limite à contourner, c'est une propriété de sécurité. **Mais l'irréductible portait sur
  le CHEMIN, pas sur le BESOIN** : rejouer la même passe dans le navigateur (proxy same-origin déjà
  éprouvé pour Yahoo → zéro domaine CSP, zéro CORS) ramène le coût côté Marc à « coller un jeton ».
  Réflexe : quand une demande bute sur un mur d'infra, chercher un TRANSPORT alternatif avant de
  déclarer la demande bloquée — et ne migrer QUE le transport (le lecteur, le mapper, `applyDocument`
  et la persistance sont réutilisés TELS QUELS, sinon deux copies divergent, cf [[Lot audit n°2]]).
  Corollaire : dire le compromis (jeton dans le navigateur via l'edge Vercel vs Secret Manager ; pas
  d'exécution app fermée) AU MOMENT du choix, pas quand il se retourne contre nous.
  ⚠️ **Piège d'outillage du même lot** : réécrire un JSON via `json.load`/`json.dumps` REFORMATE tout
  le fichier (52 lignes touchées pour UNE addition, bloc CSP compris) — sur `vercel.json`, du bruit
  dans un fichier sensible. Édition CHIRURGICALE (Edit sur la ligne voisine), jamais un round-trip.
  ⚠️ Et un `npm run typecheck` ne couvre QUE ce qui existe au moment où il tourne : mon import fautif
  (`buildDefaultAppState` depuis le store au lieu de `mcp/state/appStateDefaults`) est passé parce que
  le fichier de test n'était pas encore écrit. Re-typechecker APRÈS avoir ajouté des fichiers, pas avant.
  ⚠️ **Lot 2 (UI) — recopier un `nextState` dans un store par une LISTE DE CLÉS À LA MAIN est une fuite
  garantie** (finding `silent-failure-hunter`, mesuré) : mon 1er jet énumérait 5 champs et perdait DÉJÀ
  `lastUpdate` (que les 3 branches d'`applyDocument` écrivent) → indicateur de fraîcheur périmé juste
  après une passe qui venait d'écrire de l'argent réel, sans signal ; et tout champ FUTUR touché par un
  payload aurait été lâché côté navigateur pendant que le chemin serveur, lui, continuait de marcher
  (deux surfaces qui divergent, cf [[Lot audit n°2]]). Fix = **delta par IDENTITÉ DE RÉFÉRENCE**
  (`applyDocument` est immuable → une clé modifiée porte une nouvelle référence) : capte tout champ
  futur gratuitement ET n'écrase pas une modification concurrente (le serveur a l'OCC, le navigateur
  non). Discriminant : restaurer la liste à la main → le test sur un champ HORS liste (`assets`) casse.
  ⚠️ **Une région live (`role=alert`/`status`) INSÉRÉE au moment du résultat n'est pas annoncée de façon
  fiable** (WCAG 4.1.3) : la monter en PERMANENCE et n'en changer que le TEXTE (`sr-only` quand vide,
  stylée quand pleine), UNE seule région par canal. Corollaire de test : deux `role="status"` coexistant
  rendent `getByRole('status')` AMBIGU → cibler le texte. Et un bouton `disabled` ne dit que « estompé »
  à un lecteur d'écran → la RAISON du blocage va dans un `aria-describedby` (sr-only) qui suit l'état.
  ⚠️ **`text-ink-500` échoue AA-normal (3,86–4,33:1, MESURÉ via `npm run check-contrast`)** — c'est le
  shade réflexe pour « texte secondaire » et il est faux : `ink-400` passe. Cf [[FIX-INK600-TOKEN]].
  ⚠️ **[FINTABLE-BROWSER-RELATIVE-BASE] `new URL(x)` à UN argument EXIGE une URL absolue → une base
  relative lève `TypeError: Invalid URL`** (bug Marc : il colle son jeton, l'app répond « url invalide »
  — *« mais c'est un jeton pas une url »*, et il a raison : le message accuse la mauvaise chose). En
  portant le transport du serveur (`https://fintable.io/api/v2`) au navigateur (proxy same-origin
  `/api/fintable`), `buildUrl` a gardé `new URL(base + path)` : absolu OK, relatif THROW. Fix = résoudre
  une base relative contre `location.origin` (2ᵉ argument ; `new URL(absolue, undefined)` ignore le 2ᵉ
  argument → chemin cron INCHANGÉ), et transformer le cas « relatif sans origine » en erreur NOMMÉE au
  lieu d'un « Invalid URL » opaque. **La vraie leçon est le trou de test, identique au test de câblage
  de la carte** : les 7 tests de `browserSync` injectaient TOUS un `client` factice (`opts.client`) →
  la ligne `new FintableClient({ baseUrl: FINTABLE_BROWSER_BASE })` n'était exécutée par AUCUN test.
  **Un paramètre d'injection pour les tests crée un chemin PAR DÉFAUT que plus personne n'exerce** —
  c'est précisément celui de la production. Réflexe : pour tout `opts.x ?? new Truc()`, garder au moins
  un test SANS l'injection, qui descend jusqu'au vrai transport (faux `fetch`, pas faux client).
  Discriminant : remettre `undefined` en 2ᵉ argument → `expected 'Invalid URL' to be null`, le message
  exact de Marc reproduit. ⚠️ Reste NON vérifiable depuis le conteneur (`fintable.io` = 403 CONNECT,
  cf [[FINTABLE-0]]) : que l'edge Vercel FORWARDE bien l'en-tête `Authorization` sur un rewrite externe
  — à confirmer par l'usage réel, pas à affirmer.
  ⚠️ **Un rewrite externe Vercel peut CACHER la réponse à l'edge — le trancher explicitement sur un
  proxy AUTHENTIFIÉ** (trouvé en cherchant la réponse à la question ci-dessus, doc Vercel « rewrites » —
  chercher la doc de la plateforme a rapporté plus que la question posée) : le cache des rewrites
  externes est opt-IN pour les projets créés avant le 2026-04-06, donc **opt-OUT (actif par défaut)
  après**. Or une réponse de `/api/fintable/*` porte les transactions et soldes RÉELS, et un cache
  d'edge est keyé par URL — l'en-tête `Authorization` n'entre pas dans la clé. Laisser le défaut de la
  plateforme mélange donc « donnée privée » et « cache partagé » (Loi 25) et peut servir des montants
  périmés. Coupé par `x-vercel-enable-rewrite-caching: 0` + `Cache-Control: private, no-store` sur ce
  seul chemin. Les proxys Yahoo restent cachables (cotations PUBLIQUES) : le discriminant est « la
  réponse dépend-elle d'un secret ? », PAS « est-ce un proxy ? ». Réflexe : tout rewrite externe ajouté
  tranche la question du cache dans le MÊME diff, jamais par omission.
  ⚠️ **[FINTABLE-BROWSER-FETCH-RECEIVER] `this.fetchImpl = opts.fetchImpl ?? fetch` casse le RÉCEPTEUR
  de `fetch` dans un navigateur** (2ᵉ bug du même écran, signalé par Marc : « [NETWORK] Appel Fintable
  /accounts : échec réseau (TypeError) », jeton pourtant bon) : stocker `fetch` dans une propriété puis
  l'appeler par `this.fetchImpl(...)` fait de `this` l'INSTANCE au lieu de `window`, et le binding
  WebIDL REJETTE ça. **MESURÉ dans un vrai Chromium** (sonde Playwright, `PW_LOCAL_CHROMIUM=/opt/
  pw-browsers/chromium-1194/chrome-linux/chrome`) sur une vraie origine, pas déduit :
  `bare(url)` OK · `obj.f(url)` → **`TypeError: Failed to execute 'fetch' on 'Window': Illegal
  invocation`** · `(i,x) => fetch(i,x)` OK · `fetch.bind(globalThis)` OK. Fix = wrapper (corrige le
  récepteur ET garde la résolution du global à l'APPEL, donc `vi.stubGlobal` reste intercepté).
  ⚠️ **Ni jsdom ni undici n'appliquent cette vérification** → aucun test Node ne peut l'attraper tel
  quel ; le garde est une SIMULATION de la règle WebIDL (un faux `fetch` global qui lève si
  `this !== globalThis`). Généralise : **toute API de plateforme rangée dans une propriété/variable
  (`fetch`, `setTimeout`, `alert`, `matchMedia`, `crypto.subtle`…) doit être enveloppée ou `bind`ée** —
  le pattern « injectable pour les tests » (`?? apiGlobale`) est précisément ce qui l'introduit.
  Discriminant : restaurer `?? fetch` → le test tombe en ~5 s (les 3 re-tentatives du back-off, soit
  EXACTEMENT le chemin qu'a vu Marc : TypeError → NETWORK → retries → message final).
  ⚠️ Réflexe de session : **3 bugs de suite sur cet écran ont la MÊME cause profonde** — le chemin par
  DÉFAUT (non injecté, non monté, non construit) n'était exercé par aucun test. Grep de la classe fait :
  instance unique dans le dépôt.
- ⚠️ **[FINTABLE-6] 2026-07-30 — « utilise exactement le montant que j'ai dans Fintable », leçons** :
  (1) **Une donnée CALCULÉE puis jetée est indiscernable d'une donnée absente — greper les CONSOMMATEURS
  avant de promettre un branchement** : `investmentBalances` était produit par le mapper depuis le Lot 2,
  mais seul un COMPTEUR (`investmentReferenceCount`) atterrissait dans l'état ; les montants n'existaient
  nulle part. Miroir exact de [[TX-DUPLICATES]] (« un flag respecté partout que personne n'écrit ») : ici
  c'est l'inverse — quelque chose d'écrit que personne ne lit. Réflexe commun : pour un champ, greper
  SES DEUX BOUTS (écrivains ET lecteurs) ; un seul bout = fonctionnalité fantôme.
  (2) **`Number.isFinite(Number(x))` ne protège PAS de `null`** (`Number(null) === 0`) — je suis retombé
  dans le piège `[[FINTABLE]]` en écrivant le code censé l'appliquer, et c'est MON PROPRE TEST qui l'a
  attrapé (un solde courtier absent devenait un **0 $ crédible**, effaçant un compte entier du patrimoine).
  La garde doit être un rejet EXPLICITE de `null`/`undefined` AVANT toute conversion, et posée aux DEUX
  bouts : à l'écriture, et à la lecture d'un état Drive qu'aucun schéma Zod ne valide (champ additif).
  Corollaire : écrire le test « jamais rabattu sur 0 » AVANT de croire la garde, même quand on vient de
  relire la leçon qui la décrit.
  (3) **La granularité d'une réconciliation est imposée par le MODÈLE DE DONNÉES, pas par le souhait** :
  Fintable donne un total PAR COMPTE, mais `Asset` ne porte pas d'id de compte courtier (seulement
  `accountType`) → réconcilier par compte est structurellement impossible ; on réconcilie par PANIER
  FISCAL. Le documenter explicitement (module + ADR) évite qu'une session future le prenne pour un oubli
  et « corrige » vers un appariement qui ne peut pas exister.
  (4) **Aligner la graphie d'un nouveau champ sur l'union EXISTANTE, jamais en inventer une parallèle** :
  mon 1er jet écrivait `NON_ENREGISTRE` alors que l'app utilise `'NON-ENREG'` (`RegisteredAccountType`) —
  deux graphies pour la même notion = la table de lookup morte en silence d'[[INVEST-ALLOC-GEO-SECTOR]].
  Corrigé avant tout code consommateur, et verrouillé par une garde de parité au COMPILE (assignation
  croisée dans un test) plutôt que par un import qui coûterait sa pureté au mapper.
  (5) **Sous `set -e`, `[ -z "$X" ] && var=…` TUE le job quand le test est FAUX** (le cas nominal !) —
  piège bash introduit puis attrapé à la relecture dans le même diff. Utiliser des `if … fi` explicites.
  Et un message d'échec doit nommer LE secret manquant, pas les deux : le générique « X / Y manquants »
  a coûté un aller-retour de diagnostic réel (seul l'un des deux manquait).
- ⚠️ **[FINTABLE-BOOL-QUERY + FINTABLE-DOCTOR] 2026-07-29 — deux leçons du 1ᵉʳ contact avec une API tierce RÉELLE** :
  (1) **Un booléen de query string s'encode `1`/`0`, JAMAIS via `String(booléen)`** : `pending=false` a été
  rejeté en 422 (« The pending field must be true or false » — message par défaut de la règle `boolean` de
  Laravel, qui n'accepte que `0/1/"0"/"1"` et pas les chaînes `"true"`/`"false"`). Diagnostiqué [Probable] par
  la FORME EXACTE du message d'erreur (identifier le framework serveur depuis son libellé est un signal fort),
  puis **confirmé par mesure**. Sœur de `NAN-INPUT-HARDENING` : la sérialisation « naturelle » de JS n'est pas
  celle qu'attend le validateur d'en face. (2) **Un fix mergé n'est pas un fix DÉPLOYÉ chez l'utilisateur** :
  le 422 est revenu à l'identique après le merge — non parce que le diagnostic était faux, mais parce que le
  clone de Marc était sur un `main` périmé. Réflexe avant de conclure « mon diagnostic est faux » quand une
  erreur se répète VERBATIM : faire confirmer `git fetch && git merge --ff-only` + un `grep` du marqueur du fix
  dans le fichier. Une erreur *identique au caractère près* après un fix est bien plus souvent un code non
  rapatrié qu'un diagnostic erroné (un mauvais fix produit en général une erreur DIFFÉRENTE).
  (3) **Un agrégat VIDE sans erreur ne se débugge pas dans les données mais dans l'ÉTAT DU COMPTE** (leçon
  FINTABLE-DOCTOR) : 3 comptes de placement ont rendu 0 position avec des appels qui RÉUSSISSENT — rien à
  tracer côté skips. Le bon outil n'est pas un log de plus sur le chemin de données, c'est un **docteur** qui
  lit les endpoints d'ÉTAT (droits du plan, santé/historique de sync des connexions, intégrations) et porte le
  raisonnement dans une fonction PURE (`explainMissingData`, testable sans réseau). Ses décodeurs prennent des
  défauts PRUDENTS (`can_sync`/`healthy` absents → `false`) : un docteur optimiste écarte silencieusement la
  cause la plus probable. Et il ne doit crier au loup sur AUCUNE cause quand tout est sain, sinon on cesse de le lire.
  (4) **Une réponse de cadrage de Marc peut être sincèrement FAUSSE — c'est pour ça qu'on gate par une MESURE** :
  il avait répondu « supprimer l'historique, utiliser que Plaid » (Q8) ; la mesure a donné **30 jours rendus sur
  90 demandés**, donc l'appliquer aurait coûté ~17 mois de données réelles. Un lot destructif se gate TOUJOURS
  sur une mesure du réel, jamais sur une intention — même exprimée clairement et de bonne foi.
- ⚠️ **[FINTABLE-2] 2026-07-29 — quand DEUX sources alimentent le même journal, c'est la BORNE TEMPORELLE
  qui protège, pas la déduplication** : `applyDocument` déduplique sur `txnKey = date|montant_en_cents|PAYEE`,
  or le `payee` d'un nouveau fournisseur (Fintable : `merchant`/`description`) n'est JAMAIS la même chaîne
  que celui extrait des relevés PDF importés à la main → même dépense, clé différente, **doublon accepté en
  silence** qui fausse `computeStartingCash` ET les dépenses réelles du Budget. Et la fenêtre du nouveau
  fournisseur RECOUVRE l'historique existant → risque réel, pas théorique. Parade : n'émettre que ce qui est
  **strictement postérieur** à la dernière donnée déjà connue (date de bascule) — la dédup reste la ceinture,
  la borne est la bretelle. Généralisation : **une clé de dédup qui inclut un LIBELLÉ ne survit pas à un
  changement de fournisseur du libellé** — le vérifier en LISANT la fonction de dédup, jamais en la supposant.
  Corollaires du même mapper : (a) un agrégat écrit en DELTA (`cash_balance` → `initialBalances`) se calcule
  en **tout-ou-rien** — une cible partielle (un solde manquant) déplacerait durablement le solde en silence,
  donc on suspend la mise à jour au lieu de l'approximer ; (b) un solde de carte de crédit NÉGATIF (crédit en
  ta faveur) doit passer par `Math.abs` — une dette négative GONFLE le patrimoine au lieu de le réduire ;
  (c) un rôle de compte (liquidités / dette / placement) est toujours EXPLICITE et un compte non déclaré est
  SIGNALÉ, jamais rangé par défaut (ranger une carte en liquidités gonflerait le patrimoine du montant dû).
- ⚠️ **Une intégration tierce peut être IMPOSSIBLE — le mesurer AVANT de coder l'aval, et le dire** (leçon
  FINTABLE-POSITIONS 2026-07-29) : la moitié « investissements temps réel » du chantier était irréalisable —
  l'annuaire PUBLIC de Fintable rend **3 courtiers SnapTrade au Canada** (Webull, Questrade, Wealthsimple) et
  Disnat n'y est pas. Ce n'était pas une config à corriger mais une limite produit. Réflexe : quand une donnée
  attendue n'arrive pas, chercher la **table de couverture du fournisseur** avant de débugger son propre code
  — et quand le cœur d'une demande tombe, le DIRE franchement plutôt que livrer le reste comme si de rien
  n'était (« ce qui reste est une proposition beaucoup plus petite que celle achetée mentalement au départ »).
  ⚠️ Corollaire : ma reco (« ne pas payer ») a été REJETÉE par Marc, qui a choisi de prendre un plan. Tracer
  l'arbitrage ET le désaccord dans l'ADR/BACKLOG — la prochaine session doit savoir que le coût est assumé.
- ⚠️ **[TX-DUPLICATES] 2026-07-29 — un flag RESPECTÉ partout mais que PERSONNE n'écrit = une machinerie
  d'exclusion sans alimentation** : `Transaction.isDuplicate` était lu par `computeStartingCash`, le
  Budget, les revenus, le patrimoine… mais `parseBankCsv` l'initialisait à `false` et **aucun code ne le
  passait jamais à `true`**. Le filtre UI « afficher les doublons » était mort (`_setShowDuplicates` jamais
  appelé — le `_` l'exempte de `no-unused-vars`, classe [[DETTE-DEADCODE]]). Réflexe : quand un champ
  d'exclusion existe, GREPPER ses ÉCRIVAINS (`= true`), pas seulement ses lecteurs — un champ que seuls des
  lecteurs référencent est une fonctionnalité fantôme. Conception du détecteur : critère = **montant exact
  + date proche**, le LIBELLÉ volontairement EXCLU du critère (c'est précisément quand il diffère — deux
  sources d'import — que la dédup `txnKey` laisse passer le doublon) ; on **marque, on ne supprime pas**
  (cash dérivé → suppression = solde déplacé en silence) ; **jamais de marquage automatique** sur du
  money-critical (deux cafés identiques le même jour sont un vrai faux positif, et marquer à tort RETIRE
  de l'argent réel des calculs) ; marquage réversible.
- ⚠️ **Un CLI qui IGNORE silencieusement une option inconnue rend « code périmé » indistinguable de
  « l'option n'a rien fait »** (incident 2026-07-29, coûté un aller-retour) : `fintable:dry` ignorait les
  `--roles`/`--after`/`--show-ids` d'un binaire pré-Lot-2 et rendait une sortie NORMALE — Marc a cru que la
  feature était cassée alors que son clone n'était pas à jour. Toute option non reconnue doit désormais
  ÉCHOUER en nommant le remède (`git pull origin main`). Sœur de « un fix mergé n'est pas un fix déployé ».
- ⚠️ **Vérifier une classe Tailwind dans le CSS buildé : `grep -F` avec l'antislash, pas une regex** (piège
  2026-07-29) — une classe à opacité s'écrit `.bg-warning-500\/5` dans le CSS (slash ÉCHAPPÉ). Un
  `grep "bg-warning-500\/5"` en guillemets DOUBLES fait manger l'antislash par le shell → « ABSENTE » à
  tort, et on croit à une classe morte. Utiliser `grep -qF 'classe\/opacité'` en guillemets SIMPLES.
  (Le vrai contrôle anti-classe-morte reste : vérifier que le SHADE existe dans `tailwind.config.js` —
  ici `warning` = 400/500/600 seulement, donc `warning-900` aurait été un no-op silencieux.)
- ⚠️ **[FINTABLE-TRANSFERS] 2026-07-29 — importer les DEUX CÔTÉS d'une relation compte↔carte double les
  dépenses du Budget si le paiement n'est pas marqué `isTransfer`** : le paiement mensuel de la carte
  apparaît en SORTIE du compte chèque ET en ENTRÉE sur la carte. Ce n'est pas une dépense, c'est un
  déplacement entre deux poches. Vérifié dans le code (pas supposé) : `budgetSync.ts:58` somme les
  négatifs HORS transferts → le paiement gonfle les dépenses réelles du mois, EN PLUS des achats déjà
  comptés sur la carte ; `:37` fait le symétrique sur les revenus. ⚠️ **Le PATRIMOINE, lui, reste juste**
  (les soldes sont recalés par `cash_balance`/`debt`) — c'est le BUDGET seul qui ment, donc le symptôme
  est discret et n'apparaît PAS dans les invariants de conservation. Détection = paires montants
  EXACTEMENT opposés + rôles DIFFÉRENTS (cash→dette) + dates proches + appariement **un pour un** (sinon
  deux paiements du même montant s'apparient en croix). Réflexe général : dès qu'on ingère deux comptes
  qui s'alimentent l'un l'autre, chercher les FLUX INTERNES avant d'écrire — un virement non marqué est
  compté deux fois, et aucun invariant de conservation ne l'attrape.
- ⚠️ **[FINTABLE-3] 2026-07-29 — cron serveur (1ʳᵉ écriture non supervisée du chantier), leçons** :
  (1) **Un besoin d'infra (« réveiller un service endormi sur un cron ») peut déjà avoir sa solution ÉTABLIE
  ailleurs dans le repo** — au lieu de Cloud Scheduler (nouveau service GCP, coût au-delà du free tier), le
  patron `.github/workflows/refresh-prices.yml` (HUB-REFRESH-CRON) couvrait déjà EXACTEMENT ce besoin →
  cloné à l'identique pour `fintable-sync.yml`. Réflexe : avant d'introduire un nouveau mécanisme d'infra,
  chercher un jumeau déjà en place qui résout le MÊME problème structurel (ici : « POST un endpoint secret-gated
  vers un Cloud Run qui dort »), pas seulement un jumeau au nom similaire. (2) **Deux routes serveur qui
  écrivent des CLASSES de données différentes méritent des secrets DISTINCTS**, même si le patron HTTP est
  identique : `FINANCEAI_REFRESH_SECRET` (cours de marché seulement) vs `FINANCEAI_FINTABLE_SYNC_SECRET`
  (transactions/soldes/dettes réels) — compromettre l'un ne doit pas donner accès à l'écriture de l'autre.
  (3) **Un parseur de config dupliqué entre un CLI et son futur serveur = extraire AVANT que la 2ᵉ copie
  existe**, pas après (classe `[[Lot audit n°2]]` étendue au moment de la CRÉATION, pas seulement à sa
  découverte) : `parseRolesJson` a été sorti de `fintableDry.ts` vers `services/fintable/rolesConfig.ts` en
  écrivant `runFintableSync`/`http.ts`, plutôt que de coller un 2ᵉ `JSON.parse` à côté.
- ⚠️ **[FUTUR-PAST-DEBT-FREEZE] 2026-07-29 — demande Marc « assure-toi que le passé marche… doit être
  exactement ce que c'était à cette date »** : un audit lecture seule PROACTIF (lancé en tâche de fond
  AVANT de coder quoi que ce soit, en parallèle du Lot 3) a confirmé 3 volets sur 4 (transactions/actifs/
  dettes → `pastPrefix` recalculé, deps `useMemo` complètes) et trouvé UN écart réel : `currentDebtNonImmo`
  (dette soustraite du segment PASSÉ) lisait `chartData[0]`, dérivé de `results = frozenUsable ?? liveResults`
  (PROJECTION-PERSIST) — donc quand le FUTUR affiché est GELÉ (badge « Pas à jour »), le PASSÉ continuait de
  soustraire l'ANCIENNE dette jusqu'au clic « Recharger ». **Un état FIGÉ pour UNE raison (le futur, par
  design, ne doit pas recalculer tant que l'utilisateur n'a pas validé) peut contaminer un consommateur
  voisin qui n'a AUCUNE raison d'être figé** (le passé est du RÉEL, indépendant du gel du futur) — le bug
  n'est pas dans le mécanisme de gel lui-même, mais dans un lecteur en aval qui ne distingue pas ses DEUX
  sources (`results` figeable vs `liveResults` toujours frais). Fix : lire `currentDebtNonImmo` depuis
  `liveResults` explicitement, jamais `results`/`chartData`. Réflexe généralisable : quand un composant
  expose DEUX résultats du même calcul (un figé pour l'affichage principal, un frais pour tout le reste),
  auditer CHAQUE dérivation en aval pour confirmer qu'elle lit la bonne source — un seul `chartData[0]`
  ambigu suffit à faire fuiter le gel là où il n'était pas voulu. Discriminant prouvé par `git stash` (le
  test échoue sur l'ancien code : geler le futur, bondir la dette LIVE de +10 M$, le NetWorth du passé
  affiché ne bouge PAS sur l'ancien code, CHUTE avec le fix).
  ⚠️ **7 agents en panel sur cette même PR ont trouvé 6 findings VRAIS supplémentaires (mesurés/vérifiés,
  pas de faux positifs cette fois) — leçons génériques au-delà du fix ci-dessus** :
  (1) **Un repli « live sinon frais » a lui-même une fenêtre morte au BOOT** — mon 1er jet
  (`liveResults?.chartData?.[0]?.DettesNonImmo`) réglait le gel PROJECTION-PERSIST mais, mesuré par 2 agents
  indépendamment (financial-integrity + projection-validator, mêmes chiffres : 271k$ vs 221k$ attendu),
  retombait à 0 dans la fenêtre boot/reload où `lastProjection` (EXCLU de la persistance, `partialize`) vaut
  encore `null` alors que le blob figé restauré depuis IDB affiche DÉJÀ une courbe. Un repli à DEUX niveaux
  (« live » puis « frais » puis seulement « rien ») a un angle mort si le niveau intermédiaire n'est jamais
  essayé : `liveResults?.chartData?.length ? liveResults.chartData : chartData` (repli sur ce qui est
  RÉELLEMENT affiché, jamais sur 0) ferme les DEUX fenêtres. Généralise [[HARDEN-NETWORTH-NAN]] : un repli de
  sécurité doit lui-même être testé aux LIMITES de son propre mécanisme (ici : booting avant que la source
  primaire soit prête), pas seulement au cas nominal qu'il corrige. (2) **Une boucle qui applique plusieurs
  payloads dans un cron NON supervisé doit isoler CHAQUE payload** — `applyDocument` REJETTE volontairement
  un solde de dette ≤0 (design voulu, `MCP-APPLY-DEBT`), mais sans `try/catch` PAR itération, ce rejet LÉGITIME
  avortait TOUTE la passe avant `store.save` : une carte remboursée à 0 $ un mois bloquait la sync ENTIÈRE
  (transactions ET cash compris) CHAQUE JOUR tant que la condition persistait — mesuré par financial-integrity
  via une sonde end-to-end. Un rejet de validation en aval doit devenir un avertissement LOCAL, jamais une
  panne qui efface le travail des payloads voisins déjà valides. (3) **Un plafond « aujourd'hui » manquant sur
  une date DÉRIVÉE (max d'un tableau) peut être poussé hors du réel par UNE SEULE entrée corrompue** — une
  transaction mal datée dans le futur (typo) pousse `deriveCutoverDate` en avant, et le mapper filtre alors
  TOUTES les vraies transactions Fintable comme « avant la bascule », indéfiniment, avec `ok:true` (silence
  total). Fix = plafond `min(dérivé, aujourd'hui)` + avertissement TRACÉ (jamais un cap silencieux, cf règle
  Workflow "no silent caps" étendue au code applicatif). (4) **Un champ `AppState` optionnel ADDITIF (nouveau
  cette PR) doit être ajouté EXPLICITEMENT à `DEFAULT_APP_STATE`** (même `: undefined`) — sinon `personaResetBase()`
  (qui dérive `DEFAULT_APP_STATE`) n'a PAS cette clé dans son objet retourné, et spreader un objet sans une clé
  ne réinitialise PAS cette clé : la VRAIE valeur (ici `fintableSyncReport` — comptes/dettes/dates réels de
  Marc) traverse `enableTestMode` intacte et s'affiche pendant une démo persona. Extension directe de
  [[PERSONA-PURGE]] à tout NOUVEAU champ `AppState?` — le réflexe s'applique à la CRÉATION du champ, pas
  seulement quand un futur audit le découvre. (5) **Un texte destiné à un LOG EXTERNE (GitHub Actions `cat`)
  mérite le MÊME scrub qu'un affichage UI** — `mapSnapshot.ts` interpolait un montant $ brut dans un message
  d'avertissement (solde de dette négatif chez Fintable) ; ce message atterrit à la fois dans la carte UI
  (non gatée mode discret — aucun $ n'y était PRÉVU) et dans les logs CI persistants (`fintable-sync.yml`,
  rétention ~90j, hors du droit à l'effacement de l'app). Le fix retire le montant du TEXTE à la source
  (le vrai chiffre reste disponible, gardé par le mode discret, via le champ `debt.balanceCad` normal) plutôt
  que de gater deux surfaces différemment. (6) **Une lecture `getWithVersion()` placée AVANT le `try` d'un
  orchestrateur qui promet « rapport TOUJOURS écrit » viole sa propre garantie** — silent-failure-hunter a
  trouvé que la toute première lecture d'état de `runFintableSync` vivait hors du bloc protégé : une panne
  PRÉCISÉMENT là (Drive KO, jeton révoqué) ne déclenchait aucune écriture de `fintableSyncReport`, contredisant
  le commentaire d'en-tête du fichier. Élargir le `try` pour englober TOUT ce qui doit contribuer à la garantie
  documentée, pas seulement la partie qui semblait risquée au premier jet.
- ⚠️ **[TX-TRANSFERS] 2026-07-31 — « ça détecte mal mes transferts entre comptes » (bug Marc), leçons** :
  (1) **Une capacité écrite DANS le dossier d'un fournisseur ne couvre pas la CLASSE de problème** :
  l'appariement des virements internes ne vivait que dans `services/fintable/detectTransfers.ts`, donc
  l'import CSV/relevés (tout l'historique) n'avait AUCUNE détection — `utils/transactionParser.ts:198`
  se contentait du mot « virement » dans la colonne catégorie de la banque. Réflexe : au moment d'écrire
  un détecteur pour une source, se demander si le PROBLÈME est propre à cette source (ici non : deux
  côtés importés = deux fois comptés, quel que soit le fournisseur) → cœur GÉNÉRIQUE
  (`services/transactions/detectTransfers.ts`) + garde spécifique passée en paramètre (`canPair`), une
  seule copie de l'algorithme. (2) **Une garde peut être trop ÉTROITE parce qu'elle utilise un PROXY du
  vrai critère** : le module Fintable exigeait des RÔLES différents (`cash` → `debt`, pensé pour le
  paiement de carte) ; le rôle n'était qu'un proxy de « deux poches différentes ». Résultat : un virement
  **compte courant → épargne** (deux comptes `cash`, le cas n°1 de Marc) n'était JAMAIS apparié. Le
  critère structurel correct est « comptes DIFFÉRENTS » ; garder la garde de rôle là où elle a un sens
  métier (Fintable), pas dans le cœur. (3) **Une preuve exige que sa donnée soit PERSISTÉE — greper les
  DEUX bouts avant de promettre une détection** (classe [[FINTABLE-6]]/[[TX-DUPLICATES]]) : `mapSnapshot`
  n'émettait AUCUN `accountName` par transaction (le payload n'a qu'un `accountName` de DOCUMENT, or un
  lot Fintable couvre plusieurs comptes) → côté app, l'appariement ne pouvait rien confirmer, même sur
  des données fraîches. Fix : `BankTransaction.accountName` (additif) + le compte de la LIGNE prime sur
  celui du document. (4) **Un littéral sentinelle est une ABSENCE, pas une valeur** : `parseBankCsv`
  écrit `accountName: "Unknown"` quand le CSV n'a pas de colonne compte — le traiter comme un vrai nom
  ferait apparier deux « Unknown » entre eux et marquerait de VRAIES dépenses en virements (un faux
  positif RETIRE la dépense du budget, `budgetSync.ts:58`). Normaliser en `null` au point de lecture.
  (5) **Obéir à « marquage automatique » sans baisser le seuil de preuve = deux régimes explicites** :
  `confirmed` (deux comptes connus et différents → écrit d'office) vs `suggested` (compte inconnu d'un
  côté → JAMAIS écrit, remonte à l'écran de tri). Baisser le seuil pour « couvrir plus » aurait marqué
  des achats suivis d'un remboursement, qui ont exactement la même forme. Et une paire dont UN côté est
  verrouillé (`status === 'manual'`) n'est pas appliquée DU TOUT : marquer un seul côté déséquilibre le
  budget (sortie neutralisée, entrée toujours comptée). (6) **Un `toEqual` sur un objet COMPLET casse à
  l'ajout d'un champ additif** — c'est le signal voulu, pas une régression : le test devient la preuve
  que le nouveau champ est bien émis (mise à jour du test = documentation de la nouvelle forme).
- ⚠️ **[TX-CATEGORIZE + TX-INTERAC-BUDGET] 2026-07-31 — « ça met abonnement pour tout et n'importe
  quoi », leçons** : (1) **Une règle de décision qui n'a pas accès à l'information décisive produit un
  faux systématique, pas un cas limite** : la catégorie « Abonnements » se décidait sur le seul LIBELLÉ
  (`APPLE\.COM`, `GOOGLE \*`, `MICROSOFT`), et cette règle passait AVANT Santé/Loisirs/Magasinage → un
  accessoire Apple, un jeu Xbox et un achat unique sur Google Play y tombaient tous. Or la décision de
  Marc (« un achat unique chez un marchand d'abonnement va dans Loisirs ») est INDÉCIDABLE sur une ligne :
  un jeu Steam et un abonnement Steam portent le même libellé. Fix structurel = calculer un **profil de
  récurrence par marchand** (`merchantProfile.ts` : ≥3 occurrences, cadence reconnue, montant stable)
  AVANT de décider, et ne promouvoir en « Abonnements » que les marchands AMBIGUS que ce profil prouve
  (`contextualCategorize.ts`). Réflexe : quand une règle doit trancher entre deux natures qu'un même
  libellé peut porter, la donnée décisive est dans l'HISTORIQUE — ni une regex plus fine ni l'IA sur une
  ligne isolée ne la fabriqueront. (2) **Un seuil de stabilité ABSOLU périme la chose qu'il mesure** :
  l'ancien détecteur (`Planning.tsx`) exigeait ±5 $ → un abonnement passant de 9,99 $ à 12,99 $ sortait de
  la liste au moment PRÉCIS où il devenait intéressant à signaler. Un écart RELATIF (15 %) suit l'objet.
  (3) **Ne JAMAIS promouvoir un marchand SANS règle, même parfaitement régulier** : un loyer, une prime
  d'assurance et un prêt auto sont mensuels, stables et récurrents — « je ne sais pas ce que c'est » +
  « ça revient chaque mois » ne fait pas un abonnement. (4) **[TX-INTERAC-BUDGET] Un crédit ne doit
  réduire QUE son propre poste** : rendre « Remboursement » visible au Budget (décision Marc : un Interac
  à sa conjointe EST une dépense) imposait de traiter l'entrant (« on me rembourse »), sinon les dépenses
  sont surévaluées. Mon 1er jet soustrayait le crédit du TOTAL global → un remboursement reçu de 500 $
  sans sortie correspondante dans la fenêtre EFFAÇAIT 400 $ de restaurants bien réels (mesuré par un test
  MCP existant, pas par le mien). Fix : accumuler sorties et crédits PAR catégorie, contribution nette
  `max(0, sorties − crédits)` — le crédit est borné par son poste et ne peut pas éroder les voisins.
  Le plancher 0 s'applique par poste, jamais au total (il masquerait un chiffre faux). (5) **Deux modules
  qui ont besoin de la MÊME règle et s'importent déjà l'un l'autre = extraire dans un 3ᵉ module neutre**
  (`utils/spendRules.ts`) — importer `budgetSync` depuis `budget` aurait créé un cycle, et dupliquer
  `isSpend` aurait fait diverger deux définitions d'une règle money-critical. Vérifié par
  `npx madge --circular --extensions ts utils/` = 0.
- ⚠️ **[TX-REVIEW + TX-SUBSCRIPTIONS] 2026-07-31 — mesurer un critère d'arrêt, leçons** :
  (1) **Un critère d'arrêt CHIFFRÉ doit être confronté à la statistique AVANT d'être promis** : Marc a
  fixé « moins de 1 % mal classé sur **300** tirages », et j'ai écrit le test qui l'encodait — il a
  ÉCHOUÉ. Mesuré : à 300 jugements **sans aucune erreur**, la borne haute de Wilson (95 %) monte encore
  à **1,26 %** ; il en faut **390**. Les deux nombres du cadrage étaient incompatibles, et afficher
  « moins de 1 % » sur 300 aurait été un faux avec l'autorité d'un chiffre. Fix : la constante
  `RECOMMENDED_SAMPLE_SIZE` est **DÉRIVÉE du calcul** (`samplesNeededForThreshold(1)`), jamais re-tapée
  — elle reste vraie si le seuil ou la méthode d'intervalle change (classe A11Y-CHECK-CONTRAST-DRIFT
  appliquée à un seuil statistique). Réflexe : quand l'utilisateur donne « X % sur N essais », vérifier
  que N peut PROUVER X avant de bâtir dessus ; corriger la constante, jamais le test.
  (2) **Un taux d'échantillon sans son INTERVALLE est un chiffre faux** : on rend toujours
  `[low, high]` + un `verdict` qui vaut « indéterminé » tant que l'intervalle chevauche le seuil —
  dire « pas encore concluant, encore N à juger » est plus utile qu'un pourcentage qui fait semblant.
  **Wilson, pas l'approximation normale** : sur un taux proche de 0 (notre cas), la normale rend un
  intervalle qui déborde sous zéro et SOUS-ESTIME l'incertitude.
  (3) **Un tirage d'échantillon doit être SEEDÉ et la graine PERSISTÉE** : `Math.random()` re-tirerait
  à chaque rendu → les jugements déjà faits ne porteraient plus sur le même dénominateur, et le taux ne
  mesurerait plus rien. Corollaire : trier le pool par id AVANT de mélanger — l'ordre du tableau
  d'entrée change (tri UI, ré-import) et ferait dériver l'échantillon malgré la graine.
  (4) **Une alerte « prix en hausse » se compare au prix D'AVANT, pas à la médiane globale** — celle-ci
  inclut le nouveau prix et amortit exactement la hausse qu'on cherche. Et un abonnement n'est
  « peut-être arrêté » qu'après **2** cadences manquées : crier au loup sur un simple retard de
  prélèvement fait cesser de lire les alertes. Le coût annuel total EXCLUT les abos signalés arrêtés
  (annoncer une dépense éteinte = no-fake-data).
  (5) ⚠️ **`formatPercent` (utils/format) prend DÉJÀ un pourcentage (×100), pas un ratio** — j'ai
  écrit `formatPercent(x / 100)` par réflexe, ce qui divise deux fois et affiche « 0,01 % » pour 1 %.
  Piège d'unité silencieux (aucune erreur de type, le résultat est juste faux) : lire la signature.
- ⚠️ **[A11Y-FUTUR-MILESTONES-KEYBOARD] itération audit 2026-08-12** : (1) **un callback-ref
  INLINE (`ref={(n) => n?.focus()}`) se ré-exécute à CHAQUE re-render** — l'identité de la
  fonction change, React détache (null) puis rattache le ref → tout effet de bord dedans
  (focus, mesure, abonnement) se REJOUE au moindre setState du composant. Ici : la modale
  re-volait le focus au bouton que l'utilisateur venait d'activer (piège clavier). Un effet
  « au montage » vit dans `useRef` + `useEffect(..., [])`, jamais dans le ref lui-même.
  (2) Une modale qui prend le focus au montage doit le **RENDRE au déclencheur** au démontage
  (capturer `document.activeElement` avant `.focus()`, le restaurer au cleanup) — sinon Tab
  repart de <body> après Échap. (3) Un anneau de focus SVG `fill="none"` se peint SUR LES
  AIRES COLORÉES du graphe (pas sur le disque de la pastille, plus petit) : contraste non
  garanti (WCAG 1.4.11) → fond opaque sous l'anneau, couleur = token `primary` commun.
  (4) Deux `.map()` successifs de séries datées = **deux passes dans l'ordre DOM** (donc l'ordre
  Tab/lecteur d'écran) : fusionner + trier AVANT de mapper pour un ordre chronologique global.
  Ces 4 bugs venaient d'une MÊME PR déjà « prouvée par stash » : les tests discriminants
  prouvent ce qu'ils testent, pas l'absence des classes de bugs qu'on n'a pas testées —
  l'audit par agent APRÈS l'implémentation garde sa valeur même quand la PR semble blindée.
- ⚠️ **[REFONTE-NAV-L1] 2026-08-12** : (1) **retirer un onglet qui RESTE dans l'enum est plus
  piégeux que d'en supprimer un** : le check générique de deep-link (`Object.values(Tab)
  .includes(hash)`) continue d'ACCEPTER son hash → onglet activé SANS route = écran vide
  silencieux. Le redirect explicite doit passer AVANT le check générique, et un test-scan
  verrouille l'ordre (jumeau du verrou #ACTIONS, mais la raison est inversée : ACTIONS était
  HORS enum, DASHBOARD y est encore). (2) Une refonte de nav se fait par SOURCE UNIQUE
  (`components/navDestinations.ts`) consommée par toutes les surfaces (sidebar, barre mobile,
  drawer) + un test de NON-PERTE qui compare la couverture de la nav à l'ensemble exact des
  onglets routés — c'est lui qui transforme « rien de perdu » (critère de Marc) en assertion.
  (3) **2e occurrence de la classe « revert de conteneur »** : le Lot 1 complet, non commité,
  a été effacé par un redémarrage pendant `npm run test` (pas un panel — la règle « committer
  avant les agents » sous-couvrait). Règle élargie : committer (et POUSSER dès que la branche
  est libre) avant TOUTE attente longue, suite de tests comprise ; le stash ne survit PAS au
  revert.
- ⚠️ **[REFONTE-NAV-L1] itération panel 2026-08-12** : (1) **un flag STRUCTUREL (« destination
  mono-onglet ») se calcule sur la SOURCE, jamais sur la vue FILTRÉE** — après retrait des tabs
  épinglés, Transactions [TX, BUDGET] devenait [BUDGET] (length 1) et le bouton Budget du drawer
  s'étiquetait « Transactions ». Le même piège se ré-arme à chaque changement de la liste
  d'épinglés → flag `isSingleTab` posé AVANT le filter. (2) **jsdom ne cache PAS les éléments
  masqués par media query** (`hidden md:flex` reste dans le DOM) : un test mobile qui interroge
  le document entier est satisfait par la SIDEBAR DESKTOP — vacueux. Scoper au conteneur
  (role+aria-label posés sur le panneau, utiles aussi à l'a11y) ET vérifier l'ACTION du bouton
  (clic → bon Tab), pas seulement la présence du texte.
- ⚠️ **[REFONTE-NAV-L2a] itération panel 2026-08-12** : (1) **une série à granularité ANNUELLE
  promue dans une fenêtre GLISSANTE de 30 j fabrique un « événement » à chaque 31 décembre**
  (mesuré : +14 396 $ de variation fictive au jour de l'An — l'équité immo par-année changeait
  de valeur au passage d'année, et le total « dettes présentes constant » affichait chaque
  remboursement de capital en perte sèche). Soit on ALIGNE la granularité du terme sur la
  fenêtre, soit on l'EXCLUT PAR CONSTRUCTION de la série, avec une étiquette de périmètre sur
  la tuile (« liquide + placements ») — jamais un terme annuel/constant « promu » tel quel
  dans un calcul quotidien. (2) **La classe « deux patrimoines à l'écran sans étiquette »
  (DASH-NETWORTH-CANONICAL) revient dès qu'on promeut un chiffre d'une page à une autre** :
  l'étiquette de périmètre fait partie du CHIFFRE, pas de la page — elle déménage (et
  s'adapte) avec lui, sinon l'assiette du % diverge en silence de la tuile voisine.
  (3) **Leçon agent 2b : un MOCK de hook qui retourne un objet/tableau RECRÉÉ à chaque appel
  alimente tout `useEffect`/`useMemo` qui en dépend → boucle de rendu infinie** (vitest gelé
  15 min, worker à 99 % CPU, aucun échec — juste un gel). Le retour d'un mock de hook se
  déclare STABLE au niveau module (constante ou `mockReturnValue` d'un objet unique), jamais
  un littéral dans la factory.
- ⚠️ **[REFONTE-NAV-L3] panel 2026-08-12** : (1) **une partition UI qui prétend suivre une convention du MOTEUR se
  prouve contre le CODE du moteur, jamais contre un commentaire** — `isOwnedToday` retenait `monthsSince >= 0` (mois
  courant = détenu) alors que le moteur exige `purchaseOffset < 0` STRICT et `presentEquityOfGoal` `> 0`. Le docstring
  ET le test affirmaient l'alignement : les deux étaient faux (classe `DOC-STALE-IMPOSSIBILITY` appliquée à un
  rationnel de partition). Mesuré par deux agents indépendants : la page affichait « Équité présente 200 000 $ » sur
  un bien que le moteur n'achetait jamais → **539 487 $ d'écart de patrimoine final**, ou (variante cash suffisant)
  un KPI à 0 $ là où le moteur portait 81 565 $. (2) **Le SEED d'un formulaire doit atterrir dans la zone où sa
  propre classification est VRAIE** : le bouton « ajouter » de la vue « biens détenus » semait `purchaseDate =
  aujourd'hui`, c'est-à-dire pile dans l'angle mort — chaque création naissait cassée. Règle : après avoir défini une
  frontière, instancier le cas que le formulaire produit PAR DÉFAUT et vérifier de quel côté il tombe.
- ⚠️ **[REFONTE-NAV-L5] revue 2026-08-12** : (1) **un sélecteur CSS construit par interpolation
  devient une bombe le jour où sa valeur vient de l'UTILISATEUR** — `usePendingFocus` ciblait
  `[data-focus-section="${section}"]` avec des sections statiques depuis toujours ; ce lot y a
  injecté `poste:<nom>` / `category:<nom>` (texte libre, souvent collé d'un relevé). Un guillemet
  double → `SyntaxError` levée DANS un `requestAnimationFrame`, donc avalée sans ErrorBoundary ni
  log : deep-link mort en silence. Comparer la VALEUR (`dataset`), ne pas construire de sélecteur.
  Règle générale : quand une entrée passe de « constantes du code » à « texte de l'utilisateur »,
  re-auditer TOUS ses consommateurs, même inchangés.
  (2) **Consolider deux formats ne doit RIEN retirer** : unifier les deux exports CSV de
  Transactions a fait disparaître la colonne `Confiance IA` (celle qui sert justement à relire les
  catégorisations douteuses). Une consolidation est ADDITIVE — on élargit le format commun, on ne
  rabote pas au plus petit dénominateur ; et un test verrouille la colonne conservée.
- ⚠️ **[REFONTE-NAV-L6a] revue 2026-08-12 — `TEXT-HEURISTIC-OVER-USER-TEXT`** : une **HEURISTIQUE
  DE TEXTE** (regex sur un libellé) qui coexiste avec du **texte UTILISATEUR interpolé dans les
  mêmes libellés** produit des faux positifs ; toléré sur une pastille visible à l'œil (l'utilisateur
  lit le libellé et peut la démentir), **INACCEPTABLE dans un prompt LLM** où l'affirmation fausse
  hérite de l'autorité de la source unique. Dériver le fait d'un marqueur **STRUCTUREL**, ou au
  minimum d'une **constante partagée avec l'émetteur**. Mesuré : `/\bfire\b/i` sur `p.lifeEvents`
  faisait dire au prompt « objectif FIRE atteint vers <année fausse> » dès qu'un immeuble s'appelait
  « Fire pit reno » (`lifeEvents` mêle messages moteur et noms saisis par l'utilisateur —
  `childrenReee.ts`, `realEstateMonth.ts`). Le signal structurel EXISTAIT déjà (`FireTarget` émis à
  chaque point, prédicat déjà écrit dans `strategyRanking.ts`) : **grepper les champs numériques du
  moteur avant d'écrire une regex sur ses libellés**.
  (2) Corollaire de gate : **un gate d'affichage vit sur la PAGE, la donnée vit dans le STORE** —
  toute AUTRE surface qui lit la même donnée du store doit re-appliquer le gate, sinon elle est la
  porte de service (chips de l'onglet Assistant bâties sur `lastProjection` sans la révélation
  `revealedProjectionSig` de PH4 : la retraite projetée s'affichait sans le geste explicite). Quand
  la condition complète est locale au composant, gater sur la **part lisible du store** et le DIRE —
  ne pas inventer un nouveau champ de store pour reproduire un état local.
  (3) Une **énumération vide** dans un prompt (`… : .`) est un blanc que le modèle comble : tout
  `join()` qui peut rendre `''` a besoin d'un repli NOMMÉ (« aucun chiffre disponible »).
- ⚠️ **[Lot filets de sécurité] 2026-08-12** : (1) **une fuite de mode discret se compte PAR CHAMP,
  pas par composant** — les 5 écrans fautifs câblaient DÉJÀ `isPrivacyMode` pour d'autres montants ;
  c'est l'oubli ponctuel qui fuit, donc l'audit doit grepper `formatCAD(` NON enveloppé, pas chercher
  des composants « non câblés ». Points aveugles récurrents : formatters de Tooltip Recharts et
  `<input type=number>` PRÉ-REMPLIS avec une vraie valeur. (2) **Deux chemins d'écriture pour la même
  donnée finissent toujours par diverger en garanties** : l'import de talon par le chat exigeait diff +
  modal + backup, celui des Réglages n'avait rien — l'incohérence EST le bug, et le correctif est de
  faire consommer le MÊME exécuteur, pas de ré-implémenter un mini-filet. Corollaire : après avoir
  corrigé une surface, chercher les AUTRES appelants de la même donnée (une 3e surface a été trouvée
  ainsi, `[AI-TAXCENTER-APPLY-NOGATE]`).
- ⚠️ **[Revue #608] 2026-08-13 — une PROP de composant tiers est un angle mort DOUBLE.** Le mode
  discret était respecté partout SAUF dans les graphiques : un montant y est produit par un
  `tickFormatter` / `formatter` passé en prop à Recharts. Ni le grep `formatCAD(` ne le voit (l'axe
  construisait `${(val/1000).toFixed(0)}k` à la main), ni les tests de rendu (ils mockent
  `YAxis`/`Tooltip` en `() => null`, faute de dimensions jsdom pour `ResponsiveContainer`). Résultat
  mesuré : l'axe annonçait « 41k » à 4 pixels d'une infobulle correctement masquée, dans un fichier
  déjà « corrigé » — 19 sites du même défaut sur 10 fichiers. Trois règles qui en sortent :
  (1) quand une valeur sensible sort par une **prop de rendu**, la garde qui la voit est un **scan de
  SOURCE** (`tests/components/chartPrivacyScan.test.ts`), pas un test de rendu ; (2) un mock qui rend
  `() => null` **désarme silencieusement** l'assertion — mieux vaut rendre la SORTIE du formateur pour
  une valeur témoin, le mock devient alors la surface d'affichage réelle ; (3) une politique
  transversale (masquer, formater, arrondir) veut un **helper nommé** (`maskedTick`) et non un
  ternaire recopié : le helper est ce que la garde peut chercher. Corollaire vérifié : la même revue
  a montré qu'un garde-fou logé dans un `useEffect` (annuler une confirmation en mode discret)
  s'exécute APRÈS la peinture — un garde de RENDU (`if (isPrivacyMode) return null`) ferme le trou
  pour toutes les surfaces d'un coup.
- ⚠️ **[Revue #608, 2e passe] 2026-08-13 — une garde peut être AUTO-SATISFAITE.** Le scan qui
  vérifie « tout formateur $ tient compte du mode discret » listait `money(` DANS LES DEUX motifs :
  celui qui prouve « c'est de l'argent » et celui qui prouve « c'est masqué ». Un helper local
  `const money = v => formatCAD(v)` sans `isPrivacyMode` passait donc au vert **en fuyant** (PoC
  exécuté par la revue). Généralisation : **le jeton qui détecte le problème ne peut jamais être le
  jeton qui atteste du correctif** — c'est la cousine de la garde CIRCULAIRE qui lit la table de
  config qu'elle est censée vérifier. Corollaires appliqués : (1) n'accepter comme preuve de gating
  que des marques qui PROUVENT la lecture de l'état (`isPrivacyMode`, `maskedTick(`), quitte à écrire
  le ternaire en clair au point d'appel ; (2) une garde qui LIT DU TEXTE doit refuser BRUYAMMENT ce
  qu'elle ne sait pas lire (formateur multi-lignes, JSX imbriqué dans une prop) — cesser de voir en
  silence est pire que pas de garde ; (3) une revue de correctif doit se demander « reste-t-il des
  sites de la même classe ? » ET « la garde que je viens d'écrire est-elle contournable ? » : les deux
  questions ont rendu ici, la seconde sur la garde livrée trente minutes plus tôt.
- ⚠️ **[Revue #608, 3e passe] 2026-08-13 — masquer les VALEURS ne masque pas leur EXISTENCE.** Dans
  `TaxBracketViz`, le détail « $ par tranche » ne rendait que les paliers ATTEINTS (`b.income > 0`).
  Chaque montant était bien en « ••• » — et pourtant le NOMBRE de lignes encodait la tranche
  marginale (mesuré : 2 lignes à 30 k$, 8 à 250 k$). Une donnée privée fuit aussi par la STRUCTURE
  du DOM : nombre d'éléments, présence/absence d'un bloc, position d'un marqueur (`style={{ left }}`),
  largeur d'une barre, échelle d'un axe. Corollaire de test : la garde correspondante doit être
  STRUCTURELLE — « deux entrées très différentes rendent un DOM indiscernable en mode discret » —
  et non « tel montant est absent ».
- ⚠️ **[Même passe] Un seuil de grandeur codé en dur rend un test de fuite VACUEUX.** La première
  version du test des attributs `title` du Budget cherchait `/\d{4,}/` ; l'impôt mensuel de la
  fixture faisait 3 chiffres (893 $) → le test passait au vert AVEC la fuite réintroduite. Le test
  s'AUTO-CALIBRE désormais : il relève les nombres réellement présents hors mode discret, puis exige
  qu'aucun ne subsiste. Règle générale : quand une assertion dépend d'une magnitude, la DÉRIVER de
  l'exécution de référence plutôt que de la deviner — et toujours vérifier qu'elle ROUGIT.
- ⚠️ **[2026-08-13] Après un squash-merge, `git remote prune origin` FAIT PARTIE de la réconciliation.**
  GitHub supprime la branche au merge, mais la référence locale `origin/<branche>` SURVIT et pointe
  encore sur l'ancienne tête. Effets vus DEUX FOIS dans la même session : (1) un hook a annoncé
  « 1 commit non poussé » alors que ce commit était le squash DÉJÀ sur `main` ; (2) un
  `push --force-with-lease` a été refusé pour « stale info » — c'est le filet qui FONCTIONNE, il
  détecte qu'on raisonne sur une info périmée, PAS un cas où insister avec `--force` serait correct.
  Séquence complète : `git status --porcelain` vide → `git fetch origin main` → `git remote prune
  origin` → `git checkout -B <branche> origin/main`. Et avant de conclure « il reste du travail non
  poussé », comparer le CONTENU (`git diff origin/<branche> origin/main`), pas les hashs : après un
  squash les commits diffèrent toujours alors que le contenu est identique.
- ⚠️ **[Même jour] Un compte de tests dans la doc se PÉRIME en cours de PR.** `CLAUDE.md`/`README`
  annonçaient 3 965 tests, mesurés après le 1er tour de revue ; les 2e et 3e tours en ont ajouté 13
  (réel : 3 978). Le chiffre à écrire est celui mesuré sur le DERNIER état, pas celui noté en cours
  de route — et il se re-mesure APRÈS le merge quand la PR a duré plusieurs tours.
- ⚠️ **[2026-08-13] Ne jamais inférer l'état d'une CLASSE de déploiement depuis un événement d'une
  AUTRE.** Deux conclusions fausses en 50 minutes, symétriques : « le quota Vercel est résolu » parce
  que 3 *previews* passaient (01:03 UTC), puis « la prod est bloquée » parce qu'un *preview* était
  refusé (01:56 UTC). En réalité le plafond gratuit refusait les previews de branche **pendant que
  les déploiements de PRODUCTION passaient** : `finance.hubperso.com` a servi le dernier `main` tout
  du long. Un statut GitHub « Vercel: failure » sur une PR parle du PREVIEW de cette PR, jamais de la
  prod. La vérification qui tranche est toujours ciblée : `list_deployments` → filtrer
  `target: "production"` → `get_deployment` → lire `readyState`, `meta.githubCommitSha` et `alias`.
  Et quand la réponse HTTP servie n'est pas atteignable (le proxy d'egress de l'environnement bloque
  le domaine), le DIRE : l'enregistrement d'alias de la plateforme est une preuve forte, ce n'est pas
  la même chose que la réponse réelle.
- ⚠️ **[2026-08-13] Vérifier les CHIFFRES d'un ticket, pas seulement sa thèse.** Le ticket
  `[FISC-DON-ABATEMENT]` avait raison sur le fond (la part fédérale du crédit-don n'était pas
  réduite de l'abattement QC) et ses montants étaient exacts au cent près (234,63 $ et 952,38 $/an).
  Mais le taux effectif qu'il annonçait — « ≈48,8 % » au-delà de 200 $ — est FAUX : `0,29 × 0,835 +
  0,24 = 48,2 %`. Recopié tel quel, ce chiffre serait entré dans `FISCAL_REFERENCE`, qui est la
  SOURCE DE VÉRITÉ du dépôt — un faux sourcé est pire qu'un faux anonyme. Règle : **re-dériver soi-même
  chaque valeur qu'on s'apprête à écrire dans la doc fiscale**, même quand le reste du ticket est
  irréprochable. Un ticket juste sur le diagnostic peut être faux sur la mesure, et inversement.
- ⚠️ **[Même jour] Un taux LÉGAL et un taux EFFECTIF ne se remplacent pas l'un l'autre.** La tentation
  était de corriger « 35 % / 53 % » en « 32,5 % / 48,2 % » dans le tableau de `FISCAL_REFERENCE`. Les
  deux sont vrais : 15 % + 20 % EST le taux légal, et 32,5 % est ce que ça vaut pour un résident du
  Québec. Écraser le premier aurait rendu la doc irréconciliable avec les sources officielles citées
  juste au-dessus (ARC P113, Revenu Québec). La table porte donc les DEUX colonnes, avec la règle de
  passage explicite. Vaut pour tout crédit non remboursable fédéral au Québec.
- ⚠️ **[2026-08-13, panel #611] Corriger une valeur fiscale, c'est chasser ses COPIES figées dans les
  tests.** Le correctif du crédit-don a été propagé à `w5Effects.test.ts`… mais pas au `const CREDIT =
  5264` de `taxDecember.test.ts` ni au commentaire « ≈ 5 264 $/an » de `projection.test.ts` — deux
  fichiers money-critical qui affirmaient donc une valeur périmée de 473,88 $. Impact utilisateur nul
  (c'était une entrée-stub), impact sur la PROCHAINE revue non nul : un chiffre faux dans un test est
  lu comme une référence. Réflexe : après toute correction d'une constante fiscale, `grep` le MONTANT
  d'avant dans tout le dépôt, pas seulement le nom de la fonction. Et remplacer par une valeur
  DÉRIVÉE de la source unique — c'est la même classe que « un outil-garde à valeurs re-codées en dur
  dérive en silence », appliquée aux tests.
- ⚠️ **[ENG-DIVORCE-*] 2026-08-13 — mesurer un correctif là où sa sortie est JETÉE ne prouve rien.**
  Le divorce n'existe QUE dans la branche Monte-Carlo (`tryDivorce` exige `enableMonteCarlo`), or
  `chartData` est TOUJOURS déterministe (`[ENG-MC-CONSERVATION-BLIND]`). Mes premières sondes
  comparaient donc `chartData` avec et sans divorce et rendaient un résultat **strictement
  identique** — j'aurais pu en conclure « le correctif ne change rien » ou pire, « il n'y avait pas
  de bug ». La sortie réellement consommée était ailleurs : les cônes `P10/P50/P90` et
  `survivalRatePct`. Réflexe à avoir AVANT d'écrire la moindre assertion : **remonter la chaîne
  jusqu'à ce que l'utilisateur voit**, et vérifier que la grandeur mesurée en fait partie. C'est la
  version constructive du piège déjà indexé « un bug confirmé peut viser du code dont la sortie est
  jetée ».
- ⚠️ **[Même jour] Trois bugs qui se COMPENSENT se lisent comme une absence de bug.** Avant
  correction, céder 50 % du patrimoine coûtait 4,2 % du résultat final : chiffre absurde, mais
  personne ne l'avait relevé parce qu'il n'était ni nul ni aberrant. Les trois erreurs tiraient dans
  des sens opposés (dettes gardées = pessimiste ; revenu fantôme + fiscalité de couple =
  optimistes). Corollaire opérationnel : les livrer SÉPARÉMENT aurait produit des états plus faux
  que l'état initial (corriger les dettes seules aurait aggravé le pessimisme). Quand des findings
  partagent un même invariant sémantique — ici « le ménage passe à une tête » — ils forment UN lot,
  pas trois.
- ⚠️ **[Même jour] Corriger un modèle révèle l'hypothèse tacite d'à côté.** Une fois le revenu
  fantôme retiré, le divorce est passé à « survie 0 % » — parce que le moteur ne réduit JAMAIS les
  dépenses du ménage quand il perd une tête (le décès a le même défaut). Ce n'était dans aucun
  ticket. Un correctif qui déplace un résultat d'un extrême à l'autre doit faire chercher ce qui
  compensait : ici, une hypothèse que personne n'avait jamais écrite. Elle est désormais une
  DÉCISION explicite (`docs/decisions.md`), pas un oubli — et c'est Marc qui l'a tranchée, parce
  que le choix change le résultat d'un facteur 8.

- ⚠️ **[ENG-DIVORCE] re-revue #616 — corriger une règle DUPLIQUÉE à moitié est PIRE que l'erreur
  d'origine.** Avant le lot, `taxFilers` (dépôt fiscal) et le multiplicateur du meltdown REER
  disaient tous les deux « couple » après un divorce : faux, mais COHÉRENT. Le premier correctif
  n'a basculé que `taxFilers` — le moteur retirait alors un revenu de DEUX têtes pour l'empiler sur
  UNE déclaration : mesuré 140 000 $/an de retraits REER imposables en trop, et une stratégie
  MELTDOWN_REER recommandée sur une fiscalité qui se contredisait elle-même. Règle : quand on
  corrige une grandeur, GREPPER toutes ses copies AVANT de committer ; si le nom diffère
  (`activeUsersCount` ici), c'est le NOM qu'il faut corriger — et hisser la valeur à un seul
  endroit vaut mieux que synchroniser deux copies.
- ⚠️ **[Même revue] Un compteur peut avoir TROIS sémantiques dans le même fichier.**
  `retirementIncome.ts` porte désormais `activeUsersCount` (DIVISEUR d'agrégat ménage),
  `householdPensionShare` (PART d'un montant ménage) et `householdAdults` (NOMBRE DE TÊTES). Les
  confondre coûte cher dans les deux sens : réduire le diviseur ANNULE la réduction des rentes
  (mesuré Δ = 0,00 $) ; lire le diviseur là où il faut des têtes donnait au divorcé le barème SRG de
  COUPLE **puis** sa prestation ×2 — 1 226,50 $/mois rendus, une valeur que la loi ne permet à
  PERSONNE (maximum célibataire : 1 105 $). Corollaire de test : l'assertion juste n'est pas « moins
  que le couple » (un célibataire pauvre peut légitimement toucher plus, son maximum est bien plus
  élevé), c'est **le plafond légal**. J'ai écrit la mauvaise version d'abord, et c'est la mesure qui
  l'a réfutée.
- ⚠️ **[Même revue] Un test sur la FONCTION ne prouve jamais le CÂBLAGE.** `processReerMeltdown`
  distinguait parfaitement 1 déclarant de 2 — pendant que l'appelant continuait de lui passer
  `activeUsersCount`. C'est le motif exact du NO-GO précédent. Il faut une assertion sur une
  grandeur que le MOTEUR produit. Piège rencontré ici : sous `enableMonteCarlo` — le seul mode où le
  divorce existe — `buildMonthlyDataPoint` ne rend qu'un point ALLÉGÉ `{ NetWorth, monthIndex }`,
  par performance ; aucun flux mensuel n'est observable pendant un divorce. La seule prise restante
  est un AGRÉGAT du retour de scénario (`totalTaxesPaid`), avec un seuil re-mesuré des deux côtés.
- ⚠️ **[Même revue] « Baseline intacte » se MESURE, et le contraire s'ASSUME.** Le drapeau solo
  couvre décès ET divorce : sur 9 combinaisons (3 stratégies × déterministe / MC / décès), 8 sont
  bit-identiques et UNE bouge — décès + MELTDOWN_REER, −75 756 $ d'impôt à vie, +92 921 $ de
  patrimoine. C'est un correctif (un veuf est UN déclarant), pas une régression : épinglé par un
  test et écrit au CHANGELOG. Annoncer « aucune baseline touchée » sans rejouer la batterie aurait
  été faux — et c'est le genre d'affirmation que personne ne revérifie ensuite.
- ⚠️ **[FINTABLE-TOKEN-WIPE] 2026-08-13 — un champ EXCLU d'une synchro est le plus fragile, pas le
  mieux protégé.** Le jeton Fintable est délibérément retiré du push Drive (« un jeton bancaire ne
  voyage pas », `syncSnapshot.ts`). Conséquence contre-intuitive : puisqu'il ne PART jamais, il n'est
  jamais dans ce qui REVIENT — et `syncPull` réécrivait le coffre EN BLOC avec le payload Drive, donc
  sans lui. **Chaque synchro effaçait le jeton.** Généralisation : dès qu'un champ est exclu d'un
  aller-retour, vérifier le RETOUR, pas seulement l'aller ; une exclusion défensive côté écriture
  crée une suppression côté lecture.
  Trois corollaires vérifiés sur ce bug :
  (1) **`undefined` ≠ `''`.** « Je ne parle pas de ce champ » n'est pas « efface ce champ ». Le
  correctif préserve sur `undefined` et obéit sur `''` — sans cette distinction, on ne pourrait plus
  vider un jeton volontairement.
  (2) **La garde va dans l'ÉCRITURE, pas chez les appelants.** Le coffre est la seule voie d'écriture :
  c'est le seul endroit qu'un appelant futur ne peut pas oublier. Quatre sites appelaient déjà
  `saveApiKeys` ; en corriger un seul aurait rejoué le bug.
  (3) **RÉCIDIVE de la classe déjà indexée.** Le finding #545 avait corrigé exactement ça — la garde
  d'hydratation d'`App.tsx` oubliait `fintable` — mais sur UN registre seulement ; les deux gardes de
  la couche sync sont restées. « Un producteur corrigé doit alimenter TOUS les registres » vaut aussi
  pour un CONSOMMATEUR corrigé.
  ⚠️ Symptôme à reconnaître : le store mémoire FUSIONNE (`{...prev, ...keys}`) alors que le coffre
  ÉCRASE. La donnée survit donc dans l'onglet ouvert et ne meurt qu'au rechargement — l'utilisateur
  décrit « ça se perd tout le temps », jamais « ça se perd quand je synchronise ».
- ⚠️ **[STORAGE-KEY-WRITE-RACE, panel #612] 2026-08-13 — passer d'un ÉCRASEMENT à une FUSION, c'est
  troquer l'atomicité contre une course.** Le correctif du jeton Fintable a remplacé un `setItem`
  atomique (aucune lecture) par un lire-puis-écrire. Le bug déterministe disparaissait, une course
  non déterministe le remplaçait — mesurée par le panel sur le scénario réel : le polling Drive tire
  au retour de focus d'onglet, or coller un jeton implique justement un alt-tab. Trois issues
  observées, dont la pire : **un secret effacé volontairement RESSUSCITÉ**.
  Réflexe à avoir : dès qu'on ajoute une LECTURE devant une écriture jusque-là atomique, se demander
  qui d'autre écrit — et sérialiser. Ici c'était facile *parce que* le correctif avait fait du coffre
  le point d'écriture unique : la même propriété qui rend la fusion sûre rend la file d'attente
  possible. Détail qui compte : la chaîne de promesses ne doit pas propager le rejet au suivant
  (un échec bloquerait le coffre à vie) tout en rendant bien SON erreur à l'appelant courant.
  Corollaire de revue : un correctif de bug mérite la même question qu'une feature — « qu'est-ce que
  ce changement rend possible qui ne l'était pas ? ». Ici, la concurrence.
- ⚠️ **[PASSE-REEL-1] 2026-08-13 — une règle ÉCRITE dans l'en-tête n'est pas une règle TENUE par le
  code.** `services/projection/dailyCurve.ts` s'ouvre sur « ce qui n'est pas mesuré doit être
  ABSENT, donc affiché — », et `CLAUDE.md` indexe « un point réel se construit à partir de RIEN ».
  Vingt lignes plus bas, `if (!real) return { ...d }` renvoyait le point PROJETÉ pour une journée
  présentée comme passée. Marc l'a vu avant nous : « je n'ai pas de CELI et pourtant mon passé me
  dit que j'en ai ». La doc d'intention rassure la revue et masque l'écart — quand un fichier
  ÉNONCE un invariant, chercher la ligne qui le viole plutôt que de créditer l'énoncé.
- ⚠️ **[Même jour] Un repli (`fallback`) est une DÉCISION DE PRODUIT déguisée en détail technique.**
  Ici, `if (!real) return projeté` est une ligne anodine qui répond en réalité à « que montre-t-on
  quand on ne sait pas ? ». Trois réponses défendables existaient (rien / trait plat à la dernière
  valeur connue / trait distinct), avec des conséquences très différentes sur ce que l'utilisateur
  CROIT lire. Marc a tranché « rien, la courbe commence où les données commencent ». Réflexe :
  devant un repli sur de la donnée AFFICHÉE, ne pas choisir seul — c'est du produit, pas de la
  technique.
- ⚠️ **[Même jour] Faire rendre `null` à une fonction pure est le meilleur outil de propagation.**
  Passer `ProjectionChartPoint` à `ProjectionChartPoint | null` a fait remonter au compilateur les
  QUATRE appelants d'un coup — dont l'infobulle (`buildEnrichedMonth`), que j'aurais oubliée en
  corrigeant seulement la courbe. Or l'en-tête du fichier promet justement que les deux partagent
  la même source « pour interdire toute divergence ». Un `filter(Boolean)` silencieux n'aurait rien
  révélé : c'est le TYPE qui a trouvé le second site.
- ⚠️ **[panel #614] 2026-08-13 — une dépendance qui ne « sert » que par RICOCHET n'est pas une
  dépendance.** J'avais oublié `todayIso` dans le 3e `useMemo` (`enrichCache`) — au point d'écrire
  dans le handover « ajouté aux DEUX useMemo » alors qu'il y en a TROIS. Le bug ne se voyait pas :
  `dailyPastByDate` est une NOUVELLE Map à chaque changement de `todayIso`, ce qui invalidait le
  cache par ricochet. Une protection ACCIDENTELLE — mémoïser `dailyPast` plus finement un jour
  (optimisation parfaitement raisonnable) aurait réintroduit le bug en silence, sans qu'aucun test
  ne le voie. Règle : une dépendance ne doit jamais reposer sur l'INSTABILITÉ DE RÉFÉRENCE d'une
  autre. Et quand on écrit « ajouté à tous les X », les COMPTER.

- ⚠️ **[AI-CATEGORIZE-NO-BACKOFF] 2026-08-13 — un `catch` qui « continue » transforme une panne
  TRANSITOIRE en dégradation TOTALE.** `categorizeBatch` avalait le 429 du chunk N et lançait le
  chunk N+1 aussitôt : la limite atteinte au début d'un gros import laissait tout le reste « non
  catégorisé », sans réessai ni signal — et le martèlement prolongeait le rate-limit. Signature de
  ce défaut : un `catch` qui rend une valeur par défaut à l'intérieur d'une BOUCLE. Se demander
  systématiquement « cette erreur est-elle transitoire ? » et, si oui, réessayer avec un backoff
  BORNÉ (le patron du dépôt existait déjà : `services/fintable/client.ts`, `priceRefresh.ts`).
  Trois natures d'erreur, trois conduites : transitoire → réessayer ; AUTH → couper le batch (la
  clé ne redeviendra pas valide au chunk suivant) ; requête invalide → abandonner CE chunk mais
  continuer (un défaut de requête n'est pas un défaut de compte).
- ⚠️ **[Même lot] Un test de backoff ne doit JAMAIS dormir.** `sleep` injectable (défaut =
  `setTimeout`) : les 15 tests s'exécutent en 17 ms et vérifient les délais EXACTS, y compris le cap
  et la priorité de `Retry-After` sur l'estimation locale. Un test de temporisation qui attend
  vraiment devient un test lent, donc un test que quelqu'un finit par désactiver.
- ⚠️ **[Même lot] Le pacing se compte en APPELS, pas en itérations.** La pause inter-chunks ne
  s'applique ni avant le premier appel, ni après un chunk 100 % « transferts évidents » (filtré
  avant l'API, donc sans appel). Compter les tours de boucle plutôt que les appels ajoute de
  l'attente gratuite à un import qui n'a rien demandé.
- ⚠️ **[PASSE-REEL-2] 2026-08-13 — un indicateur qui ne peut pas être MAUVAIS ne vaut rien.** La
  tentation naturelle était de comparer le passé réel à « la projection ». Mais la projection est
  recalculée en PARTANT des soldes réels du jour : elle colle au passé PAR CONSTRUCTION, l'écart
  serait nul, et l'indicateur afficherait éternellement « tout va bien ». La seule référence qui a
  du sens est une prévision FIGÉE, antérieure. Test à s'appliquer à tout indicateur d'écart, de
  score ou de santé : « existe-t-il une situation réelle où ce chiffre serait mauvais ? » Si non,
  il ne mesure rien.
- ⚠️ **[Même jour] Distinguer la POSITION de la FIDÉLITÉ.** L'écart du dernier mois répond à « où
  j'en suis » ; la moyenne des écarts ABSOLUS répond à « ma prévision est-elle fiable ». Une moyenne
  SIGNÉE confondrait les deux et masquerait un plan qui se trompe de +50 k$ puis −50 k$ sous un
  « écart moyen : 0 ». Les deux chiffres sont affichés, ils ne disent pas la même chose.
- ⚠️ **[PASSE-REEL-2] revue Vercel #617 — `MARKER-PROXY-GUARD` : filtrer sur un champ VOISIN au lieu
  du marqueur dédié.** `computeForecastAccuracy` retenait « un point réel » sur `typeof dayIso ===
  'string'`. Or `dailyCurve.ts` fabrique le point d'une journée FUTURE par `{ ...d, monthIndex }` :
  le spread **charrie `dayIso`**, et seul un point adossé à une mesure reçoit `dayIsReal: true`. La
  garde laissait donc entrer les 30 ans de projection quotidienne — l'indicateur comparait la
  prévision COURANTE à la prévision VERROUILLÉE et l'annonçait à Marc comme « ton réel ».
  Le marqueur structurel EXISTAIT (`dayIsReal`, déjà lu par `ProjectionTooltip`) : c'est la même
  classe que `TEXT-HEURISTIC-OVER-USER-TEXT` — dériver le fait d'un marqueur, jamais d'un proxy.
  Règle : avant de filtrer sur la PRÉSENCE d'un champ, vérifier comment l'objet du cas NÉGATIF est
  construit. Un `{ ...source }` en amont fait entrer tout ce qu'on croyait discriminant.
- ⚠️ **[Même revue] Une FIXTURE qui omet le marqueur rend toute la suite aveugle.** Les 11 tests de
  `forecastAccuracy` étaient verts parce que leur helper `jour()` ne posait pas `dayIsReal` : ils
  décrivaient un « point réel » que le moteur ne produit jamais. Aucun n'a vu le bug, et 5 d'entre
  eux portaient pourtant sur les cas `null`. Le nombre de tests ne prouve rien si la fixture ment
  sur la forme de la donnée — un helper de fixture doit être calqué sur le PRODUCTEUR réel (ici
  `dailyCurve.ts`), champ par champ, pas sur l'idée qu'on se fait de l'objet.

- ⚠️ **[PASSE-REEL-3] 2026-08-13 — un ticket écrit à partir d'un SYMPTÔME sur-prescrit son
  périmètre (`BACKLOG-STALE-TICKET`).** Marc signale « mon passé ne correspond pas au réel » ;
  j'écris trois tickets dans la foulée, dont un (L) « la projection se réancre chaque jour sur les
  soldes réels **au lieu des soldes saisis à la main** ». En allant coder, la prémisse s'est révélée
  FAUSSE : `deriveStartingBalancesFromHistory` prend déjà `points[points.length - 1]`, le
  `useEffect` de `ProjectionEngine` recalcule déjà sur changement de params, et
  `[FUTUR-DAILY-ROLLOVER]` faisait déjà avancer le jour — livré la veille, par moi. Le vrai défaut
  était `[PASSE-REEL-1]`, et il MASQUAIT le reste : un passé qui affiche la prévision donne
  l'impression que tout l'amorçage est faux. Règle : un ticket rédigé sous le coup d'un symptôme
  décrit ce qu'on CROIT cassé ; avant de coder, greper la chaîne réelle et re-prouver chaque
  prémisse — surtout celles formulées en « au lieu de ». Le livrable honnête est alors le constat
  DOCUMENTÉ, pas du code qui réimplémente l'existant.

- ⚠️ **[ENG-DIVORCE-SPLITPCT-UNBOUNDED] 2026-08-13 — un `<input type="number">` SANS `min`/`max`
  n'est pas une validation, et avec eux non plus.** Les attributs bornent les steppers ; ils
  n'empêchent ni la frappe, ni le collage, ni un import de sauvegarde, ni un futur appelant du
  moteur. Le clamp doit vivre au SEUL point de passage côté calcul, l'UI important la même règle
  (source unique). Mesuré ici : `divorceSplitPct = −100` faisait ENRICHIR le divorce
  (2 210 335 $ contre 755 482 $ à 50 %), `1e9` rendait un patrimoine de **−7,8 milliards** (les
  dettes multipliées par un `keep` négatif deviennent un actif), `NaN` zéroïsait tout en silence.
- ⚠️ **[Même lot] Le repli d'une valeur non finie n'est pas 0 — c'est le DÉFAUT MÉTIER.** Clamper
  `NaN` à 0 aurait donné « 0 % de partage », une réponse aussi inventée que le NaN d'origine, mais
  crédible : exactement le no-fake-data appliqué à un paramètre. Le seul repli défendable était la
  règle du patrimoine familial (50 %).
- ⚠️ **[Même lot] Tester la VALEUR PASSÉE, pas son effet lointain.** La tentation était d'asserter
  sur le patrimoine final (« ne doit pas dépasser X »), fragile et indirect. Le test capture le
  `keep` RÉELLEMENT remis au splitter via le callback : trois lignes, aucun scénario complet, et
  l'assertion porte exactement sur la grandeur corrigée.

- ⚠️ **[ENG-DIVORCE-SPLITPCT-UNBOUNDED] revue Vercel #621 — poser un clamp SANS corriger le libellé
  qui affiche la valeur brute AGGRAVE le défaut.** Avant le clamp, le libellé (« partage de 150 % »)
  et le calcul étaient faux ENSEMBLE : incohérents avec la réalité, mais cohérents entre eux. Le
  clamp seul rend le calcul juste et laisse la TRACE mentir — et c'est la trace que l'utilisateur
  lit. Même famille que « corriger une règle dupliquée à moitié ». Règle : en posant une
  normalisation (clamp, arrondi, défaut), GREPPER tous les sites qui affichent ou journalisent la
  valeur d'origine, et les faire passer par la même fonction.
- ⚠️ **[ENG-INV-FLUXFORM-COVERAGE] 2026-08-13 — la conservation de SOLDES ne demande jamais « d'où
  vient cet argent ».** `moneyConservation` et `fuzzConservation` vérifient « Σ actifs − dettes ==
  NetWorth » : ils sont indifférents à la CAUSE d'une variation. Un producteur qui mute un solde
  sans publier son flux les laisse parfaitement VERTS. La question complémentaire — la **forme-flux**,
  `Δsolde(m) == MarketGrowth<k>(m) + NetTransfer<k>(m)` — a trouvé **trois** producteurs muets en une
  seule écriture : le stress-test (162 835 $ au mois du krach), le transfert NonReg → CELI/REER
  (51 197 $ sur un scénario ORDINAIRE), et le remboursement d'impôt d'avril (29 796 $). Aucun
  n'était détectable autrement.
- ⚠️ **[Même lot] Ordre d'écriture : `applyMonthlyGrowth` ASSIGNE, il n'accumule pas.** Poser
  `growthCELI += delta` AVANT lui le fait écraser sans un bruit (`growthCELI = g.celi.growth`).
  Tout flux produit plus tôt dans l'itération doit être MÉMORISÉ et versé APRÈS. Vérifier
  `=` vs `+=` chez le consommateur avant de choisir où écrire.
- ⚠️ **[Même lot] Un défaut d'AFFICHAGE de flux peut coexister avec un suivi fiscal JUSTE — et c'est
  ce qui le rend invisible.** Le transfert NonReg → REER alimentait déjà `accRrspYear` : l'impôt
  était correct, seuls les flux publiés mentaient. Aucune garde fiscale ne pouvait l'attraper.
- ⚠️ **[Même lot] Une garde qui découvre PLUS que son ticket ne doit être ni élargie en douce, ni
  affaiblie en douce.** La forme-flux a révélé trois offenders ; deux sont corrigés (mesurés), le
  troisième touche `cashflowAllocation` EN AMONT de sa propre entrée — donc ticketé, pas bricolé.
  La garde est livrée sur les comptes PROUVÉS (`ACCOUNTS = CELI, REER, Crypto`, résiduel 0,01 $)
  avec, écrit dans le test, le montant exact du compte exclu et le geste à faire quand il tombera.
  Restreindre en le DISANT vaut mieux qu'un seuil de tolérance gonflé qui masque le défaut.
- ⚠️ **[Même lot] Mesurer même quand on est sûr.** J'avais écrit en commentaire que publier
  `contribREER` rendait « l'attribution per-conjoint juste ». Mesure : effet **NUL**,
  `reerByUserFinal` bit-identique sur 3 stratégies à salaires très inégaux — `stepReerByUser`
  réconcilie déjà sur `poolEnd` avec les mêmes parts. Le commentaire a été corrigé. Une affirmation
  plausible écrite dans le code a la même autorité qu'une affirmation vérifiée : elle doit être
  vérifiée.

- ⚠️ **[ENG-DIVORCE-ROOM-COUPLE] 2026-08-13 — deux QUESTIONS différentes veulent deux LISTES
  différentes, pas une liste raccourcie.** Réduire `users` pour retirer les droits d'un ex-conjoint
  aurait cassé la boucle FERR, qui itère sur `reerByUser.length` et lit `users[i]` pour l'âge :
  `undefined` → `currentAgeOfUser` rend `-Infinity` → la part REER de l'index 1 ne se convertit
  JAMAIS, sans une trace. C'est le piège exact d'un `slice(0,1)` précédent. Le correctif est un
  champ SÉPARÉ (`roomUsers`, défaut = `users`) : « qui a des droits » et « qui a un âge de
  conversion » sont deux questions, elles méritent deux entrées.
- ⚠️ **[Même lot] Une fixture doit rendre le défaut OBSERVABLE, pas seulement l'exercer.** Deux
  premières fixtures ont donné des sorties bit-identiques avec ET sans correctif — non parce que le
  code était bon, mais parce que les DROITS n'y étaient jamais le facteur limitant : recevoir
  15 000 $ de droits au lieu de 7 500 $ ne change rien à qui n'en utilise que 5 000 $. Il fallait
  une épargne SUPÉRIEURE aux droits annuels et un horizon s'arrêtant AVANT le décaissement. Même
  leçon que le registre REER (3 fixtures). Règle : quand une mesure avec/sans correctif rend un
  écart NUL, suspecter la fixture avant de conclure que le correctif est inutile.

- ⚠️ **[ENG-DIVORCE-ESTATE-PENSION] 2026-08-13 — le MÊME NOM peut désigner un MULTIPLICATEUR ici et
  un DIVISEUR là.** `activeUsersCount` divise un agrégat ménage dans `retirementIncome` (le réduire
  ANNULE la réduction) mais MULTIPLIE un estimé per-personne dans `estateCalculation` (le réduire
  est exactement ce qu'il faut). Sémantiques inverses, nom identique, deux fichiers voisins. La
  seule méthode fiable reste la lecture ligne à ligne de CHAQUE usage avant de câbler — le raccourci
  « j'ai déjà corrigé ce paramètre ailleurs » est précisément ce qui a coûté un NO-GO.
- ⚠️ **[Même lot] Un défaut CONFINÉ à un écran survit à tous les lots qui ne le regardent pas.**
  Le patrimoine mensuel, les invariants de conservation et le patrimoine final étaient tous JUSTES ;
  seule `estateNetWorth` portait les rentes de l'ex (322 865 $). Rien ne pouvait l'attraper depuis
  les grandeurs habituelles. Quand on corrige une fonction, se demander qui est sa MIROIR — ici le
  commentaire de `estateCalculation` citait lui-même « retirementIncome.ts:207-212 », c'est-à-dire
  la ligne exacte que le lot venait de corriger.

- ⚠️ **[ENG-DIVORCE-LATENTTAX] 2026-08-13 — un correctif JUSTE peut être totalement INERTE, et il
  faut le DIRE.** `computeLatentTax` était bel et bien faux après un divorce (paliers progressifs
  lissés sur deux têtes fictives, 53 126 $ mesurés par le panel en instrumentant le moteur). Mais
  `impotLatent` n'alimente QUE le point mensuel, et sous MC — le seul mode où le divorce existe — ce
  point est ALLÉGÉ à `{ NetWorth, monthIndex }`. Test de perturbation : patrimoine final, succession
  et `ImpotLatent` bit-identiques avec et sans le correctif.
  Conduite : corriger quand même (un calcul faux non lu aujourd'hui sera lu demain), mais tester la
  FONCTION PURE et écrire l'inertie noir sur blanc — un test de scénario aurait été VACUEUX, et
  annoncer « 53 126 $ corrigés » aurait été faux pour l'utilisateur.
- ⚠️ **[Même lot] Une même cause technique produit plusieurs angles morts — la nommer une fois vaut
  mieux que la contourner trois fois.** Le point MC allégé explique À LUI SEUL : `RetraitREER`
  inobservable pendant un divorce, `ImpotLatent` idem, et l'absence de garde de conservation sur le
  splitter. Trois contournements ont été écrits avant de voir qu'il s'agissait du même mur
  (`[ENG-MC-OBSERVABILITY]`).
- ⚠️ **[ENG-MC-OBSERVABILITY] 2026-08-13 — quand trois tests d'affilée doivent CONTOURNER la même
  limite, c'est la limite qu'il faut lever.** Le point MC allégé (`{ NetWorth, monthIndex }`) a
  imposé successivement : un test de câblage sur un agrégat (`totalTaxesPaid` au lieu de
  `RetraitREER`), un test de fonction pure (`computeLatentTax`), et l'absence pure et simple de
  garde de conservation sur le splitter du divorce. Un `verboseMonthlyPoints` réservé aux tests
  coûte 1 booléen et rend les trois vérifiables. Signal à reconnaître : le deuxième contournement.
- ⚠️ **[Même lot] Un drapeau de DIAGNOSTIC n'a rien à faire dans un objet de LEVIERS.**
  `EngineOverrides` est exploré par `strategySpace` : y glisser `verboseMonthlyPoints` l'aurait fait
  balayer comme s'il changeait le plan financier. D'où `ScenarioDiagnostics`, séparé — deux natures,
  deux objets.
- ⚠️ **[ENG-DIVORCE-NO-CONSERVATION-GUARD] Une identité dont les DEUX membres sortent de la même
  source est CIRCULAIRE.** « Σ actifs − dettes == NetWorth » ne peut pas détecter grand-chose quand
  `NetWorth` est justement recalculé depuis ces soldes : retirer le partage des dettes au divorce
  la laisse VERTE (vérifié par régression chirurgicale). Ce qu'elle attrape vraiment : un solde muté
  mais non exposé. L'invariant qui MORD porte sur une grandeur INDÉPENDANTE — ici le ratio de
  partage mesuré sur la dette totale (0,4926 attendu, 0,9949 avec la régression).
  Règle : après avoir écrit une garde, INTRODUIRE la régression qu'elle prétend couvrir. Si elle
  reste verte, elle ne garde rien — et il faut chercher la grandeur qui n'est pas dérivée.

- ⚠️ **[ENG-DIVORCE-TAXDEBT-UNSPLIT] 2026-08-13 — une DETTE FISCALE est du patrimoine, dans les deux
  sens.** Le splitter partageait actifs et dettes mais pas les buckets d'impôt : un divorcé ayant
  cédé 100 % de tout réglait quand même l'impôt du couple (1 488 $ mesurés), et symétriquement
  encaissait seul un remboursement du ménage (26 948,77 $ sur un patrimoine de 135 $ — d'où un
  « impôt à vie » NÉGATIF). Réflexe à garder : après avoir partagé les soldes, chercher les
  CRÉANCES ET DETTES DIFFÉRÉES (impôt à payer/recevoir, acomptes, crédits reportés) — elles ne
  ressemblent pas à un solde et se font oublier.
- ⚠️ **[Même lot] Un test de partage a besoin de sa garde ANTI-SUR-CORRECTIF.** « À 100 % de cession,
  plus rien à payer » passerait aussi si on avait purement ANNULÉ la dette. D'où la deuxième
  assertion : à 50 %, le règlement d'avril doit être RÉDUIT mais NON NUL. Partager n'est pas annuler
  — et seul le second test distingue les deux implémentations.
- ⚠️ **[PASSE-REEL-DETTE] 2026-08-13 — une APPROXIMATION documentée dans le code reste un MENSONGE
  à l'écran.** Le segment passé soustrait la dette d'aujourd'hui à tous les mois, avec ce commentaire
  en toutes lettres : « dette supposée constante dans le passé, faute d'historique d'amortissement ».
  L'approximation était assumée côté développeur, et Marc l'a signalée DEUX FOIS comme un bug — parce
  que du point de vue de l'utilisateur, c'en est un : son patrimoine d'il y a cinq ans est amputé
  d'une dette contractée il y a six mois. Règle : une approximation qui déforme une donnée PASSÉE
  (donc vérifiable par l'utilisateur) n'a pas le même statut qu'une approximation sur du projeté.
  La signaler dans un bandeau ne suffit pas ; il faut soit la donnée, soit ne rien afficher.
- ⚠️ **[Même constat] Avant de corriger un affichage, vérifier que la DONNÉE existe.** Ici la chaîne
  casse trois fois : `Debt` n'a pas de date de début, le payload d'ingestion PDF ne la capte pas, et
  le passé ne pourrait donc rien en faire. Coder le volet « affichage » en premier aurait produit un
  stub sans rien à lire. L'ordre est imposé par les données, pas par la visibilité du symptôme.

- ⚠️ **[PM-DUPLICATE-TICKET] 2026-08-13 — greper le BACKLOG par les MOTS DE MARC avant d'y écrire.**
  J'ai diagnostiqué « ma dette apparaît depuis des années » et créé trois sous-tickets… alors que
  `[DEBT-FROM-CONTRACT]` portait DÉJÀ la demande, dans le même fichier, avec une citation quasi
  identique. Un ID technique ne suffit pas à chercher : les demandes de Marc sont indexées par leur
  FORMULATION, pas par le nom que je donne au correctif. Correction : RELIER les deux (le ticket
  d'origine porte la demande et sa date, les sous-tickets portent le plan) plutôt que d'en supprimer
  un — supprimer l'original effacerait la trace de la demande.
- ⚠️ **[ENG-DIVORCE-DISPLAY-RATES] 2026-08-13 — deux erreurs qui se COMPENSENT à salaires égaux
  rendent la fixture décisive.** Le taux affiché faisait `(salaireA + salaireB) / 2` après un
  divorce. À salaires égaux, `(a + a) / 2 === a` : le défaut est rigoureusement INVISIBLE, et
  n'importe quelle fixture « symétrique » l'aurait laissé passer. Il a fallu 14 000 $ contre
  2 000 $/mois pour le faire apparaître. Règle : quand un calcul MOYENNE deux entités, toute
  fixture où ces entités sont égales est aveugle par construction.

- ⚠️ **[A11Y-MASK-STEALS-NAME] 2026-08-14 — masquer un champ ne doit pas lui voler son NOM.**
  `PrivateNumberInput` remplace l'`<input>` par un `<button>` « ••• » portant
  `aria-label="Montant masqué — cliquer pour modifier"` EN DUR. Or `aria-label` est PRIORITAIRE sur
  les deux seules façons dont un champ est nommé dans le dépôt : le `<label htmlFor>` (salaires de
  Profil) et l'`aria-label` du champ lui-même (facteur d'équivalence, RSU, Asset Location). MESURÉ
  avec l'algorithme réel de nom accessible : « Salaire Brut annuel ($) » et « RSU vesting annuel »
  devenaient l'un comme l'autre « Montant masqué — cliquer pour modifier ». En mode discret, TOUS
  les champs d'un formulaire annonçaient donc le même nom — impossible de savoir lequel on édite.
  Le masquage protégeait la valeur en rendant le formulaire inutilisable au lecteur d'écran.
  Correctif : laisser le nom au NOMMEUR EXISTANT (aucun `aria-label` en dur ; ceux du champ —
  `aria-label` ET `aria-labelledby`, les deux, même si le second n'a aucun appelant aujourd'hui —
  sont simplement transmis) et porter l'état masqué là où il n'écrase personne — le `title` devient une
  DESCRIPTION (annoncée EN PLUS du nom) et un texte `sr-only` ne devient le nom que si rien d'autre
  ne nomme le bouton (le contenu est le dernier recours de l'algorithme).
  Règle générale : **un remplacement de contrôle doit préserver le nom accessible du contrôle
  remplacé**, et ça se MESURE (`toHaveAccessibleName`), ça ne se raisonne pas — `getByLabelText` de
  Testing Library trouvait bien le bouton par son `<label>` alors que son nom réel était le libellé
  masqué. La requête TL n'est PAS l'algorithme de nommage : elle a validé un écran inutilisable.
- ⚠️ **[Même lot] La valeur d'un champ ÉDITABLE ne vit pas dans `textContent`.** Elle vit dans
  `.value`. Les tests de fuite de #608 comparaient le texte APLATI du DOM : ils étaient structurellement
  aveugles aux formulaires, ce qui explique que la SAISIE ait survécu à trois tours de revue sur
  l'AFFICHAGE. Un test de mode discret doit inspecter les DEUX canaux (texte + `.value`), plus les
  attributs (`title`, `aria-label`, `placeholder`).
- ⚠️ **[Même lot] Masquer ≠ tout masquer : la décision « laissé en clair » mérite son test.** Le bonus
  en POURCENTAGE reste éditable (le brut auquel il s'applique est masqué, le % seul ne reconstitue
  aucune somme). Sans test d'intention, un futur « masquons tout » passe sans que le choix soit
  rediscuté — et un test qui échoue force la discussion au bon moment.
- ⚠️ **[Même lot] Un agent de revue qui a `Bash` PERTURBE l'arbre de travail — ne jamais committer
  pendant qu'un panel tourne.** L'agent `silent-failure-hunter` lancé sur ce diff mesurait en
  remettant la version d'AVANT du fichier, puis en la restaurant.
  ⚠️ **Attribution corrigée** : j'avais d'abord accusé l'agent `a11y-auditor` (le commit 9b76782 le
  dit encore, il est poussé). Faux : son rapport détaille qu'il n'a créé que des tests jetables, et
  c'est `silent-failure-hunter` qui a confessé le swap `origin/main` ↔ HEAD. Leçon dans la leçon :
  **quand plusieurs agents partagent un arbre, on ne DÉDUIT pas le coupable de celui dont on voit
  les fichiers** — les fichiers de sondage visibles étaient ceux de l'INNOCENT. Le rapport de chaque
  agent dit ce qu'il a fait ; le lire avant d'écrire une accusation dans une doc permanente. Mon `git add` est tombé pile dans cette fenêtre :
  l'index contenait l'ANCIENNE primitive alors que le fichier de travail était bon. Plus tard, une
  de ses restaurations a écrasé un incrément non commité (`aria-labelledby` + son test).
  Détecté parce que j'ai relu `git show :<fichier>` au lieu de faire confiance à `git add` — c'est
  ce contrôle qui a évité de pousser une régression silencieuse portant le message du correctif.
  Règle : la course concurrente documentée pour les vérifs money-critical (`git stash`) NE SE LIMITE
  PAS au moteur — elle vaut dès qu'un agent a `Bash` sur l'arbre partagé. Donc : (1) snapshoter les
  fichiers modifiés HORS du dépôt avant de lancer un panel, (2) ne committer qu'une fois le panel
  rendu, (3) RELIRE le contenu réellement commité (`git show HEAD:<fichier>`), jamais supposer que
  `git add` a capturé ce qu'on venait d'écrire.

- ⚠️ **[A11Y-PRIVACY-PARAMS-AVANCES] 2026-08-14 — une garde de scan doit être SYMÉTRIQUE quand la
  règle a deux sens.** Le critère « on masque les champs dont le libellé porte un `$` » se garde
  naturellement dans un sens (un libellé en `$` sur un `<input>` nu = fuite). Mais il a un
  SECOND sens tout aussi important : un champ SANS `$` masqué par mégarde coûte de la lisibilité
  sans rien protéger, et signale que quelqu'un a masqué au jugé plutôt qu'au critère. Les deux
  assertions sont écrites, et les DEUX prouvées discriminantes par perturbation. Sans la seconde,
  « masquons tout » passait au vert — et c'est exactement la simplification tentante.
  Corollaire : un test de RENDU ne voit que les champs MONTÉS (ici la moitié du panneau est derrière
  des `projection.xxxEnabled`) ; un scan de SOURCE voit tout le fichier, y compris un champ ajouté
  demain dans une section que la fixture n'active pas. Les deux sont nécessaires, pas au choix.
- ⚠️ **[Même lot] Une transformation EN MASSE se vérifie attribut par attribut, pas au typecheck.**
  Ma substitution regex `<input type="number" …>` → `<PrivateNumberInput …>` a absorbé le
  `type="number"` dans le motif et l'a PERDU sur les 14 champs. `npm run typecheck` est resté VERT :
  `type` est optionnel sur `InputHTMLAttributes`. Le champ révélé redevenait un champ TEXTE —
  steppers et clavier numérique mobile en moins, sans la moindre erreur. Attrapé par un comptage
  AVANT/APRÈS sur le fichier (`grep -c 'type="number"'` : 41 des deux côtés, et idem pour
  `min|max|step`), pas par le compilateur. Règle : après un remplacement en masse, COMPTER les
  attributs de part et d'autre — un typage optionnel ne signale jamais une perte.
- ⚠️ **[Même lot] Un montant « unique » de fixture se vérifie contre le TEXTE RENDU, pas au flair.**
  J'ai choisi `1213` comme montant témoin « improbable » : il apparaît dans le libellé STATIQUE
  « T1213 retenue source ». Le test de fuite a donc échoué alors que le masquage était correct —
  faux positif fabriqué par ma propre fixture, sur un fichier que je venais de lire en entier.
  Un nombre de 3-4 chiffres a toutes les chances de croiser un numéro de formulaire fiscal, une
  année, un seuil ou un pourcentage. Préférer 5+ chiffres, ou vérifier le nombre contre le rendu.
- ⚠️ **[Même lot] Un dénominateur compté sur la source BRUTE compte les fantômes des commentaires.**
  Ma garde de couverture comparait « paires libellé↔champ vues par le scan » à
  `source.match(/type="number"/g).length`. Elle échouait à 40 contre 41 — et j'ai d'abord accusé le
  scan d'un angle mort. Le vrai coupable : le commentaire de `divorceSplitPct` contient le TEXTE
  `<input type="number">`, cité en exemple. Le fichier a 40 champs RÉELS, pas 41.
  Deux conséquences, l'une technique et l'autre pire :
  1. tout compte sur une source non nettoyée est faux dès qu'un commentaire cite du code — il faut
     retirer les commentaires AVANT de compter ;
  2. j'avais propagé « 41 champs » dans le message de commit, le corps de PR, le handover, le
     BACKLOG et l'en-tête du test, sans jamais recouper la somme. `14 + 26 = 40` sautait aux yeux
     et personne (moi compris) ne l'avait fait. Règle : **un décompte cité dans une doc se recoupe
     par une addition**, pas par une seule mesure répétée en boucle.
  Bénéfice net : cette garde de couverture n'existait pas au départ. Une garde qui ne prouve pas
  qu'elle voit TOUT ce qu'elle prétend surveiller est de la même famille que la garde circulaire —
  elle rend un vert qui ne veut rien dire.
- ⚠️ **[Même lot] NORMALISER puis matcher, plutôt que tout tolérer DANS la regex.** Pour que le scan
  voie un champ séparé de son libellé par un commentaire JSX, mon premier réflexe a été d'absorber
  le commentaire dans le motif : `<\/label>\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)*(<[A-Za-z]+)`. CodeQL l'a
  refusé, à raison : deux quantificateurs imbriqués sur un motif ambigu = backtracking exponentiel
  (ReDoS). L'entrée est un fichier du dépôt, donc le risque réel est nul — mais le correctif de
  forme s'est révélé MEILLEUR sur le fond : retirer les commentaires UNE fois
  (`source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')`) donne une source normalisée que le scan ET le
  décompte partagent, chaque motif reste linéaire, et les deux défauts que ces commentaires
  causaient (paire invisible, champ fantôme compté) tombent du même geste.
  Règle : quand une regex doit « tolérer » une construction, se demander d'abord si cette
  construction peut être ÉLIMINÉE de l'entrée. La garde a été revérifiée sur ses trois
  perturbations après le correctif — un correctif de forme ne doit jamais être supposé neutre.

- ⚠️ **[A11Y-PRIVACY-SOLDES-COMPTES] 2026-08-14 — un `id` DÉRIVÉ d'un texte utilisateur casse
  l'association `<label htmlFor>` en silence.** Les soldes de comptes sont rendus en boucle sur des
  noms SAISIS par l'utilisateur (« Compte chèque », « Épargne d'urgence »). Fabriquer l'`id` à partir
  de ce nom paraît naturel et lisible — mais deux noms distincts peuvent se nettoyer en un MÊME
  identifiant (`Épargne d'urgence #1` et `Épargne d urgence 1`), et deux éléments partageant un `id`
  font pointer les DEUX `<label>` sur le premier : le second champ perd son nom accessible, sans
  aucune erreur ni avertissement. L'index de boucle est sans collision par construction.
  Généralisation : **une donnée utilisateur ne doit jamais servir de CLÉ technique** (id DOM, clé de
  cache, nom de fichier) sans une garantie d'unicité qui ne dépende pas de son contenu.
- ⚠️ **[Même lot] Le contrat du mode discret porte sur les MONTANTS, pas sur « tout ce qui
  identifie ».** Le lot a tranché trois fois dans le même sens, et chaque fois sous test d'INTENTION :
  le bonus en % (#629), les %/durées/âges/probabilités des paramètres avancés (#630), et ici les NOMS
  de comptes. La règle qui unifie les trois : masquer une valeur qui n'est pas une somme ne protège
  rien de plus et coûte la lisibilité — pire, masquer ce qui NOMME un champ rend les contrôles
  masqués indistinguables, soit exactement le défaut que le lot corrige. Écrire le test d'intention
  À CHAQUE FOIS : sans lui, un futur « masquons tout » passe au vert sans que le choix soit rediscuté.
- ⚠️ **[Même lot] Un setter NO-OP dans une fixture rend le test structurellement AVEUGLE au
  re-render.** Tous mes tests d'`AccountsSection` passaient `setInitialBalances={vi.fn()}` : la prop
  ne changeait donc JAMAIS, et aucun d'eux ne pouvait voir ce qui arrive quand le parent se re-rend
  en cours de saisie — le scénario le plus à risque du lot, puisqu'en prod l'objet est reconstruit à
  CHAQUE frappe. Le comportement se trouvait correct, mais par accident heureux : il ne tient qu'au
  `key={acc}` du `<div>` parent, qui empêche React de démonter `PrivateNumberInput` et préserve son
  `useState` interne. Perturbation : rendre la clé instable (`key={acc + valeur}`) → le champ
  **se re-masque au PREMIER caractère**, saisie impossible, aucune erreur.
  Deux règles : (1) quand un composant remonte son état, la fixture doit REMONTER l'état pour de
  vrai (`useState` dans un wrapper), pas le simuler par un `vi.fn()` ; (2) une feature qui dépend
  d'une propriété INVISIBLE — ici l'identité d'un composant à travers les re-renders — mérite sa
  garde explicite : rien dans le code ne signale que changer cette clé casse la saisie.

- ⚠️ **[A11Y-PRIVACY-PATRIMOINE-ETENDU] 2026-08-14 — chercher l'ABSENCE d'un MÉCANISME ne prouve pas
  l'absence du RÉSULTAT.** J'ai grepé `<label>` dans `PatrimoineExtended.tsx`, trouvé zéro, et écrit
  dans le BACKLOG « aucun nommage, il faudra tout nommer par `aria-label` ». Faux en pratique : 15
  des 17 champs portaient DÉJÀ un `aria-label`, que mon grep ne cherchait pas. Le nom accessible a
  plusieurs sources (`<label htmlFor>`, `aria-label`, `aria-labelledby`, contenu, `title`) — n'en
  interroger qu'une et conclure sur le RÉSULTAT est un raisonnement invalide. La mesure juste est
  `toHaveAccessibleName`, pas un grep sur une seule des voies. Le cadrage faux a été RECTIFIÉ dans
  le BACKLOG plutôt que laissé : un cadrage erroné coûte du temps à la session suivante, qui le lit
  comme un acquis (famille `DOC-STALE-IMPOSSIBILITY`).
- ⚠️ **[Même lot] Le meilleur critère de masquage est celui que le fichier s'est DÉJÀ donné.**
  Ici les `aria-label` distinguaient nativement `(dollars)`, `(pourcentage)` et `(années)`. S'appuyer
  dessus plutôt qu'inventer une règle donne trois choses gratuitement : le classement est déjà fait
  par l'auteur du fichier, la garde de source est triviale à écrire, et un futur champ nommé selon
  la même convention est couvert sans qu'on y pense. Avant de définir un critère, chercher celui qui
  existe déjà.
- ⚠️ **[Même lot] Une garde d'exhaustivité doit comparer des ENSEMBLES, pas des CARDINALITÉS.**
  Ma garde vérifiait que le nombre de contrôles vus par le scan égalait le nombre d'occurrences de
  `aria-label="`. Ça attrape bien un champ oublié — mais deux erreurs qui se COMPENSENT
  numériquement (un contrôle raté par la regex, et ailleurs un `aria-label="` cité dans un
  commentaire de ligne que le nettoyage ne retirait pas) rendaient le test vert à tort. Comparer les
  LIBELLÉS eux-mêmes coûte une ligne, supprime la classe d'erreur, et le message d'échec NOMME le
  champ fautif au lieu d'annoncer « 12 attendus, 11 trouvés » — ce qui change tout pour celui qui
  débogue. Règle : dès qu'une assertion porte sur « tout est couvert », comparer les éléments.
- ⚠️ **[Même lot] Un changement de FORMATAGE peut être un changement de VALEUR AFFICHÉE.** Passer le
  NOI d'un `toLocaleString` nu à `formatCAD` était obligatoire (source unique), mais `formatCAD`
  impose `maximumFractionDigits: 0` alors que `toLocaleString` en laissait jusqu'à trois. MESURÉ sur
  la fixture : `230 528,436$` → `230 528 $`. L'utilisateur perd des décimales — c'est une
  amélioration (un NOI au millième de dollar est du bruit), mais elle se DÉCLARE au CHANGELOG au
  lieu de se déduire d'un diff. Règle : avant de conclure « c'est cosmétique », instancier le
  format avant et après sur une valeur NON RONDE — sur un entier, les deux sont identiques et la
  différence reste invisible.

- ⚠️ **[A11Y-PRIVACY-INVESTMENTS-DETAIL] 2026-08-14 — un test de RENDU qui n'atteint pas un site ne
  prouve rien SUR ce site, et le fait croire couvert.** Les 9 fuites de cet écran vivent dans 9
  états distincts (sous-onglet, cibles d'allocation configurées, transactions d'achat pour les
  stats DCA…). Un test qui rend l'écran et vérifie « aucun montant ne fuit » serait passé au vert en
  n'ayant affiché que deux d'entre eux. Le scan de SOURCE, lui, les voit tous — même famille que
  `chartPrivacyScan.test.ts`. Règle : quand les sites à couvrir sont conditionnés par des ÉTATS
  nombreux, la garde de source n'est pas un pis-aller, c'est le bon outil ; le rendu ne couvre que
  ce qu'il monte, et il ne le dit pas.
- ⚠️ **[Même lot] Appliquer « resserrer le scan AVANT de coder » au niveau du DÉPÔT change le
  périmètre d'un lot entier.** Avant de traiter l'écran suivant, j'ai passé le scan `formatCAD` sur
  tout `components/` : 38 sites dans 19 fichiers, là où l'audit fait à la main en listait une
  fraction. MAIS le chiffre brut est un MAJORANT — sur 4 sites inspectés, 3 étaient des faux
  positifs de 3 classes différentes (valeur PUBLIQUE qu'il FAUT garder visible ; primitive de
  masquage non reconnue par le motif ; chaîne construite plutôt que JSX rendu). Deux enseignements :
  (1) un scan large se TRIE avant de conclure — publier « 38 fuites » aurait été faux ;
  (2) une liste d'audit faite à la main se corrobore, mais ne prouve JAMAIS l'exhaustivité — seul un
  scan peut dire « il n'y en a pas d'autres », et seulement une fois ses faux positifs classés.
- ⚠️ **[PASSE-REEL-CAP-400J] 2026-08-14 — un GARDE-FOU de volume devient une COUPURE de données, et
  le commentaire qui le rassure peut n'avoir jamais été implémenté.** `reconstructPortfolioHistoryDaily`
  plafonnait à 400 jours « pour qu'un appelant distrait ne demande pas 20 ans au jour », en rendant
  les 400 PREMIERS. Pour un utilisateur réel dont l'historique démarre 20 mois plus tôt, ça coupe la
  courbe EN PLEIN MILIEU de la fenêtre visible : les jours au-delà n'ont pas de valeur de placements,
  et l'appelant les SAUTE — ni tracés, ni cliquables. Marc l'a signalé avec une date, et
  `début + 399 jours` tombait dessus au jour près.
  Deux leçons distinctes :
  1. **Un plafond doit couvrir le cas d'usage RÉEL, pas un ordre de grandeur imaginé.** « Un peu plus
     d'un an » sonne raisonnable et ne l'est pas pour un historique personnel.
  2. **Le commentaire affirmait « l'appelant le voit à la longueur — plutôt qu'une troncature
     silencieuse au milieu ». Aucun appelant ne comparait quoi que ce soit.** Une garantie écrite en
     prose et jamais codée est pire que rien : elle rassure les relectures suivantes. Une troncature
     se rend CONSTATABLE par une valeur de retour (`truncatedFrom`), pas par une phrase.
- ⚠️ **[Même lot] Rendre RAPIDE avant de rendre PLUS GRAND.** Le réflexe était de monter le plafond.
  MESURÉ d'abord : 1 993 ms pour 1 687 jours — le correctif « évident » aurait troqué un trou muet
  contre un gel de 2 s à chaque zoom. La cause : `priceAt` et `priceAgeDays` re-balayaient TOUT
  l'historique de prix, par actif ET par jour (deux scans complets par couple, ≈ 63 M d'opérations).
  La boucle des jours étant strictement croissante, un curseur par actif suffit : **37 ms, 54×**.
  Le plafond n'a été relevé qu'APRÈS. Règle : quand un plafond existe « pour la perf », mesurer ce
  qu'il protège avant de le déplacer — souvent il masque un algorithme à corriger.
  ⚠️ Corollaire de méthode : une optimisation ne vaut RIEN si elle déplace un chiffre. Les helpers
  d'origine ont été laissés INCHANGÉS (ils servent aussi la reconstruction mensuelle), et le test
  d'équivalence compare la boucle optimisée À EUX, jour par jour — pas à une valeur recopiée.
- ⚠️ **[PASSE-REEL-CAP-400J, revue d'intégrité] Remplacer un SCAN par un CURSEUR ajoute une
  HYPOTHÈSE que l'original n'avait pas.** Un scan complet (`priceAt`) tolère n'importe quel ordre,
  n'importe quel doublon, n'importe quel point corrompu : il regarde tout, à chaque fois. Un curseur
  suppose que le tri est TOTALEMENT cohérent avec le prédicat qu'il avance. Trois divergences
  MESURÉES par le panel sur mon curseur, aucune visible en lisant le diff :
  · **doublon de date** → le curseur s'arrête sur la DERNIÈRE occurrence, `priceAt` garde la
    PREMIÈRE (son `>` est strict). 700 $ contre 500 $ — et surtout la courbe QUOTIDIENNE et la
    courbe MENSUELLE affichaient deux prix DIFFÉRENTS pour la même date et le même titre ;
  · **`price` null ou absent** → `best.price` « existe » techniquement, donc le repli
    `?? currentPrice` ne se déclenche plus : 0 $ (le « 0 $ crédible » interdit par no-fake-data),
    ou `qty * undefined` = **NaN propagé jusqu'au patrimoine net** ;
  · **`date` absente sur un point EN TÊTE** → `undefined <= t` est faux, le curseur ne franchit
    jamais ce point et reste GELÉ sur toute la fenêtre.
  Correctif : NORMALISER une fois à la construction (filtrer les points invalides, trier,
  dédoublonner en gardant la PREMIÈRE occurrence — le choix de `priceAt`), pour que le module reste
  INDISCERNABLE de l'implémentation qu'il remplace. Coût mesuré : nul (109 ms à 4 000 jours).
  Règle : après une réécriture d'algorithme, la question n'est pas « est-ce plus rapide » mais
  « quelles hypothèses NOUVELLES ai-je introduites, et qu'arrive-t-il quand elles sont fausses ».
  ⚠️ Indice qui aurait dû m'alerter : `buildMarketData` et `periodReturn` filtraient DÉJÀ
  `p.date && Number.isFinite(p.price)`. Ce module était le seul consommateur à ne pas suivre la
  convention — une convention appliquée partout SAUF ici est un signal, pas un détail.
- ⚠️ **[Même revue] Une mise en garde qui se trompe d'un jour perd sa raison d'être.** Mon bandeau
  disait « l'historique s'arrête au {truncatedFrom} », alors que `truncatedFrom` est le PREMIER jour
  NON reconstruit : la courbe s'arrête la VEILLE. Sur un texte dont tout l'intérêt est d'être exact —
  il existe précisément parce qu'une coupure silencieuse a coûté sept mois d'historique — un décalage
  d'un jour renvoie l'utilisateur chercher au mauvais endroit. Reformulé en « le premier jour non
  reconstruit est le … », qui dit ce que la variable CONTIENT.

- ⚠️ **[PASSE-REEL-TXN-DU-JOUR] 2026-08-14 — « montrer tout » et « compter juste » sont DEUX
  promesses, et masquer une ligne en trahit une.** Marc voulait voir TOUTES ses transactions d'une
  journée. Or le registre exclut du calcul les doublons d'import et les virements internes. Trois
  options, une seule honnête : les masquer donne une liste qui ne correspond pas au relevé bancaire ;
  les compter donne un total qui ne correspond pas à la courbe ; les AFFICHER BARRÉS, avec la raison,
  tient les deux. D'où `counted` / `excluded` séparés dans le retour du helper, plutôt qu'une liste
  unique filtrée. Règle : quand un filtre métier existe en amont, l'affichage ne doit ni le copier en
  silence ni l'ignorer — il doit le RENDRE VISIBLE.
- ⚠️ **[Même lot] Filtrer À LA DEMANDE plutôt que pré-indexer, quand la dimension est grande et
  l'usage ponctuel.** La tentation était d'enrichir `dailyPastLedger` (qui construit déjà une Map par
  jour) avec les transactions. Il couvre jusqu'à ~4 000 jours : on aurait gardé TOUTES les
  transactions en mémoire, en permanence, pour n'en afficher qu'une journée à la fois. Un balayage
  O(n) au clic, sur une liste déjà chargée, coûte moins et ne pèse rien le reste du temps.
- ⚠️ **[Même lot] Un paramètre à VALEUR PAR DÉFAUT rend son cas `undefined` intestable par cette
  voie.** Mon helper de test était `(point, transactions = TOUTES)`. Le test « sans la prop » passait
  `undefined` explicitement — ce qui DÉCLENCHE le défaut en JS. Le test échouait donc en accusant le
  composant d'afficher une section qu'il n'aurait pas dû, alors que c'était mon harnais qui lui
  passait la liste complète. Pour tester une absence, rendre DIRECTEMENT sans la prop.
- 🔴 **[PASSE-REEL-TXN-DU-JOUR, revue] 2026-08-14 — j'ai livré une feature INATTEIGNABLE en citant,
  dans son propre fichier de test, la leçon qui l'interdit.** La section « transactions du jour » lit
  `dayIso`. Or `FutureProjection.detailPointFor` REBASE volontairement tout point quotidien sur son
  mois hôte avant de le transmettre à la modale — et `dayIso` est posé au MÊME endroit que
  `hostMonthIndex` (`dailyLedger.ts`), donc effacé par ce rebasage. En clic réel, la section ne
  pouvait JAMAIS s'afficher. **Huit tests au vert**, CHANGELOG annonçant la feature, BACKLOG coché.
  Pourquoi les tests n'ont rien vu : ils rendaient `FutureDetailModal` DIRECTEMENT avec une fixture
  portant `dayIso` écrit à la main, court-circuitant tout le chemin de production. **Un test qui
  FABRIQUE lui-même la condition qu'il devrait prouver atteignable ne prouve rien** — il aurait été
  identique avec ou sans le bug. C'est la forme « composant isolé » de `UX-UNREACHABLE-FEATURE`, et
  elle est plus insidieuse que la version « trop de gestes » : ici il n'y avait AUCUN chemin.
  Règle : pour une surface conditionnée par une donnée que l'APPELANT fournit, la garde doit tester
  la SEAM — au minimum « la donnée absente ⇒ rien ne s'affiche » ET « le porteur naturel de la donnée
  ne fait pas foi », plus un scan de source sur le câblage. Les trois ont été ajoutés, et prouvés en
  RÉINTRODUISANT le bug dans les deux sens (lecture depuis le point, et dérivation depuis le point
  rebasé).
  ⚠️ Correctif choisi : faire voyager le jour dans une PROP SÉPARÉE, pas fusionner
  `{ ...pointMensuel, dayIso }` — un point hybride aux montants mensuels et à la date quotidienne
  serait exactement le faux que no-fake-data interdit pour un objet.
- ⚠️ **[Même revue] `opacity-*` sur du texte déjà atténué passe sous le seuil AA, et
  `check-contrast` ne le voit pas.** Mes lignes « exclues » cumulaient `opacity-60` avec
  `text-ink-300`/`text-ink-400`, des shades calibrés pour être tout juste AA à PLEINE opacité :
  ~3,0-3,4:1 après composition, sur la ligne qui porte justement l'explication. Le script du dépôt
  est un scan statique token-vs-token : il ignore les classes d'opacité appliquées au runtime, donc
  il rend un vert trompeur. Règle : l'atténuation visuelle porte sur le FOND (`bg-white/[0.02]`) ou
  sur un décor, jamais sur un conteneur de texte ; et une garde qui ne rend pas le DOM ne peut pas
  arbitrer un contraste effectif.
- ⚠️ **[Même revue] Nommer un total par ce qu'il EXPLIQUE, pas par ce qu'on aimerait qu'il explique.**
  J'avais documenté `netCounted` comme « le montant qui explique le mouvement du jour sur la courbe »,
  et le CHANGELOG le répétait à l'utilisateur. Faux : c'est le FLUX DE TRÉSORERIE (`Income −
  Expenses`). La courbe bouge aussi par le rendement de marché et l'équité immobilière — sans aucune
  transaction. Un jour de forte hausse boursière affiche donc 0 $ pendant que la courbe monte.
  `dailyPastLedger` distingue d'ailleurs explicitement « dépôts » et « rendement » pour cette raison.
  Un nom trop généreux envoie la session suivante chercher une réconciliation qui n'existe pas.
- ⚠️ **[PASSE-REEL-TXN-DU-JOUR] Un jeton de test se choisit contre le VOCABULAIRE de l'écran, pas
  contre ce qui semble improbable.** Mon assertion « le prénom de l'autre conjoint n'apparaît pas »
  échouait sur… l'en-tête de colonne **MARCHAND**, dont « Marc » est un sous-mot. Deuxième fois dans
  la même session après le montant témoin `1213`, qui vivait dans « T1213 retenue source ».
  Corollaire du même incident : une assertion NÉGATIVE doit viser la ZONE qu'elle juge, pas tout le
  document — la modale affiche les prénoms ailleurs (ventilation par conjoint), et chercher dans
  `document.body` accusait le détail d'une ligne pour un texte venu d'une autre section.
- 🔴 **[PASSE-REEL-TXN-DU-JOUR, revue v2] Une FIXTURE qui reproduit l'hypothèse fausse du code ne
  discrimine RIEN — et c'est la deuxième fois de la même session.** J'ai traité `Transaction.confidence`
  comme une fraction 0-1 (`Math.round(c * 100)`). Elle est en **0-100** chez TOUS ses producteurs
  (`claude.ts` : 100, `applyTransferDetection` : 100, personas : 95), et le consommateur existant
  `Transactions.tsx` l'affiche déjà `${t.confidence}%` SANS multiplier. Ma pastille aurait donc
  affiché « 9 500 % ».
  **Le plus grave n'est pas l'affichage** : mon seuil d'alerte `pct < 70` devenait INATTEIGNABLE —
  une vraie confiance de 42 devenait 4 200, donc « neutre », donc jamais en ambre. La pastille
  perdait sa seule raison d'être (signaler les catégorisations douteuses) sur TOUTE donnée réelle.
  Mes deux tests utilisaient `0.93` et `0.42` : ils reproduisaient MON hypothèse, donc passaient au
  vert des deux côtés du bug.
  Règle : **une fixture se calibre sur les PRODUCTEURS réels du champ, pas sur l'idée qu'on s'en
  fait.** Un grep de `confidence:` dans `services/` coûtait dix secondes et donnait la réponse.
  Corollaire fort : pour une unité (%, fraction, cents, mensuel/annuel), chercher d'abord si un
  autre écran l'AFFICHE DÉJÀ — son code est la spécification la plus fiable du dépôt.
- ⚠️ **[Même revue] Une divergence assumée entre deux écrans se DOCUMENTE dans le code.**
  `resolveTransactionOwner` (vue Budget) DÉDUIT un conjoint quand `ownerId` est absent, en lisant le
  type de poste. Mon panneau n'affiche que l'attribution EXPLICITE — afficher une déduction comme un
  nom se lirait comme une certitude. Le choix est défendable, mais la conséquence ne l'est que si
  elle est écrite : une transaction imputée à un conjoint dans Budget peut n'avoir aucune pastille
  ici. Sans cette note, la prochaine session lira l'écart comme un bug et « corrigera ».

---

## Leçons du checkup de santé 2026-08-19 (panel de 9 agents)

### `AUDIT-SUR-TREE-PERIME` — vérifier l'ÉTAT DU TREE avant de lancer un panel

J'ai lancé six agents sur « l'état actuel de `main` ». Le conteneur avait été restauré à un
snapshot du **2026-08-13** : le tree était sur une vieille branche, **13 000 lignes en retard**,
et trois fichiers cités dans mes propres consignes (`backfillDedup.ts`, `PrivateText.tsx`,
`daySeriesIndex.ts`) n'existaient tout simplement pas sur le disque. Les agents ont audité pendant
plusieurs minutes du code qui n'existe plus.

**Ce qui rend ce mode d'échec vicieux** : leurs rapports auraient été *plausibles*. Des
`fichier:ligne` réels, des extraits de code réels, des mesures réelles — mais sur une version
morte. Rien dans le rapport n'aurait signalé le décalage ; je les aurais consolidés au BACKLOG et
la prochaine session aurait chassé des bugs déjà corrigés. Le seul indice a été un `git branch -vv`
fait pour une AUTRE raison (le ménage de branches).

**Règle** : avant de lancer un agent sur « l'état du code », prouver l'état du code —
`git fetch origin && git status -sb` et comparer à `origin/main`. Le coût est de dix secondes ;
le coût de l'omission est un audit entier à refaire. Corollaire : quand une consigne d'agent
mentionne un fichier précis, `ls` ce fichier d'abord — s'il manque, le tree ment.

C'est la **3ᵉ fois cette semaine** qu'un revert de conteneur coûte du travail (cf. la règle
« committer et pousser avant toute attente longue »). La nouveauté ici : le revert ne s'est pas
manifesté par une perte de travail, mais par un **travail neuf construit sur du sable**.

### `FINDING-JUSTE-CORRECTIF-INVALIDE` — vérifier le correctif, pas seulement le finding

La règle du dépôt dit qu'un finding est une hypothèse. Elle ne dit pas assez que **le CORRECTIF en
est une aussi**, et qu'il peut être faux alors que le finding est juste.

Cas mesuré : `RealEstateWorkspace.tsx:463-470`, un `<span role="button">` sans `tabIndex` ni
`onKeyDown` — finding **exact**, la suppression d'une propriété est vraiment inatteignable au
clavier. Le correctif proposé (« remplacer par un vrai `<button type="button">` ») est
**impossible** : ce span est imbriqué dans le `<button>` d'onglet. Un `<button>` dans un `<button>`
est du HTML invalide ; React le rendrait, le navigateur le réparerait en déplaçant le nœud, et le
« correctif » aurait cassé le layout tout en paraissant conforme à la revue.

**Règle** : lire le CONTEXTE SYNTAXIQUE du correctif (le parent, pas seulement la ligne citée)
avant de l'appliquer. Un agent qui cite `fichier:ligne` a souvent lu la ligne, pas l'arbre.

### `DOC-METRIQUE-RECOPIEE` — une métrique dupliquée diverge, et on ne la répare pas en la mettant à jour

Trois documents donnaient trois réponses à « combien de sous-modules a le moteur ? » — `CLAUDE.md`
disait 41, `docs/ARCHITECTURE.md` disait 48, la réalité était **50**. Idem pour la taille de
l'orchestrateur (~1 310 / ~2 400 / **2 228** réelles). Pire : `ARCHITECTURE.md` portait **deux
comptes de tests contradictoires dans le même fichier** (1 440/123 fichiers en §7, 3 887/339 en
en-tête) — symptôme d'une doc entretenue par AJOUT plutôt que par relecture.

**Le mauvais réflexe** est de corriger les trois. Ils re-divergeront au prochain push, parce que
rien ne les lie. Le correctif est d'en désigner **UNE** comme source (ici `CLAUDE.md`, qui se
charge à chaque session) et de faire pointer les autres vers elle — exactement la règle « source
unique » qu'on applique déjà au patrimoine net et au formatage.

**Corollaire** : une métrique qui ne peut pas être vérifiée d'un coup d'œil (nombre de lignes,
nombre de modules, nombre de tests) n'a rien à faire recopiée dans de la prose. Soit elle est
générée par script (comme `check-contrast`), soit elle vit à un seul endroit daté.

### `CONSERVATION-NE-VOIT-PAS-L-IMPOT-ELUDE` — l'invariant le plus fort du moteur a un angle mort

Les deux findings les plus lourds du checkup 2026-08-19 (`[REER-IMMO-HORS-ASSIETTE]`,
`[REER-ACTIF-NON-RECONCILIE]`, jusqu'à **94 600 $ d'impôt jamais facturé** sur un scénario mesuré)
coexistent avec `tests/services/projection.moneyConservation.test.ts` **au VERT, 20/20**.

Ce n'est pas un défaut du test : c'est la définition de la conservation. Elle vérifie que l'argent
ne se crée ni ne se détruit entre les registres. **Un impôt qui n'est jamais prélevé ne viole rien
de tout ça** — le dollar reste simplement chez l'utilisateur au lieu de partir chez l'ARC. Du point
de vue du bilan, c'est parfaitement conservatif. Du point de vue de Marc, c'est un patrimoine
surévalué de six chiffres.

**Ce que ça généralise.** Un invariant de FLUX (rien ne se perd) ne peut pas détecter une erreur
d'ASSIETTE (le montant sur lequel on calcule). Ce sont deux familles de bugs orthogonales :
- flux → conservation, résiduel en dollars ;
- assiette → il faut une assertion qui **recalcule indépendamment** la base imposable et la compare
  à celle qu'a utilisée le moteur, sans lire la même variable que lui (sinon la garde est circulaire,
  cf. `dailyLedger`).

**Signe d'alerte réutilisable** : quand une source de flux est ajoutée (ici une 5ᵉ source de retrait
REER, pour l'immobilier), la question n'est pas « la conservation tient-elle ? » mais « quels
registres cette source doit-elle alimenter, et lesquels a-t-elle oubliés ? ». C'est la règle déjà
indexée « un flux moteur alimente PLUSIEURS registres » — le meltdown REER de 2026-07-31 était la
même classe. Ici, le producteur a alimenté le registre de **retenue** (`taxCurrentYearReer`, que
décembre CRÉDITE) sans alimenter le registre d'**assiette** (`accRetraitsReerYear`, que décembre
DÉBITE) : le crédit sans la dette. Un registre n'a de sens qu'avec sa contrepartie.

### `MODULE-ECRIT-HORS-CHECKLIST` — quatre défauts money-critical dans un seul fichier

`services/projection/realEstateMonth.ts` a récolté **quatre findings indépendants** au checkup du
2026-08-19, trouvés par **deux agents qui ne communiquaient pas** :

1. le retrait REER n'alimente pas l'ASSIETTE fiscale (`accRetraitsReerYear`) — 94 600 $ éludés ;
2. il n'alimente pas non plus le registre d'AFFICHAGE (`retraitReerMois`) — 355 639 $ publiés
   comme « 0 $ retiré », avec 85 107 $ d'impôt affiché juste en face ;
3. le plafond RAP est calculé sur `activeUsersCount` (toujours 2) au lieu de `taxFilers` — un
   divorcé reçoit le plafond d'un couple, 38 081 $ de retrait non imposable illégitime ;
4. l'impôt du retrait est un taux marginal PLAT au lieu d'incrémental — 22 110 $ sous-estimés.

**Ce que ça dit.** Ce ne sont pas quatre inattentions : c'est **une seule** — le module a été écrit
sans passer la checklist « quels registres ce producteur doit-il alimenter, et lesquels a-t-il
oubliés ? ». Les trois premiers défauts sont littéralement la règle déjà indexée (« un flux moteur
alimente PLUSIEURS registres ») et le piège déjà indexé (« un paramètre HOMONYME à deux niveaux »),
appliqués au même bloc de code. Les corrections de 2026-07-31 (meltdown REER) et celles du divorce
(`taxJanuary`, `taxDecember`, meltdown, `latentTax`) ont balayé les autres producteurs — **et sauté
celui-ci**.

**Deux règles pratiques.**
- Quand on corrige une classe de bug « le producteur X a oublié le registre Y », **énumérer TOUS les
  producteurs** par grep sur le registre, pas seulement ceux du ticket. Ici `retraitReerMois` a
  quatre producteurs corrects (`projection.ts:1328, 1581, 1665, 1746`) et un cinquième absent :
  l'écart se voyait d'un `grep`.
- Un module qui accumule des findings de plusieurs agents indépendants se traite **en UN lot**, pas
  ticket par ticket : quatre PR sur le même bloc de code, c'est trois rebases et trois occasions de
  se contredire.

### `ASSIETTE-ELARGIE-CASSE-SES-RACCOURCIS` — élargir une assiette invalide le code qui la supposait étroite

En corrigeant `[REER-ACTIF-NON-RECONCILIE]` (ajouter les retraits REER à l'assiette imposable de
décembre en phase active), trois lignes VOISINES sont devenues fausses **sans que rien ne le
signale** — ni `tsc`, ni le lint, ni les 4 368 tests. Elles étaient correctes uniquement parce que
l'assiette valait le salaire.

1. **`calculateFiscalReport(gross, …)` fait `employmentIncome = gross` PAR DÉFAUT.** Élargir `gross`
   sans passer `employmentIncome` explicitement calcule RRQ/RQAP/AE **sur le retrait REER**. Le
   défaut est documenté comme « rétrocompat totale pour les appelants dont le gross EST le
   salaire » — ce qui cesse d'être vrai à l'instant où on élargit.
2. **`taxMarcEmployer = taxMarcReal`** était un raccourci juste tant que `taxMarcReal` était l'impôt
   du salaire seul. Après élargissement, il faisait retenir à l'employeur l'impôt d'un revenu qu'il
   ne verse pas. Recalculé explicitement sur le salaire.
3. **`familyGrossReal`**, qui sert de base à la réduction des crédits d'âge, référait à l'ancienne
   assiette — deux notions de « revenu familial » auraient cohabité dans la même fonction.

**La règle** (renfort de « élargir l'assiette → auditer TOUS les dérivés ») : après avoir élargi une
assiette, relire **toute la fonction** en se demandant, pour chaque usage de l'ancienne variable,
« celui-ci voulait-il dire l'assiette, ou le salaire ? ». Les deux étaient le même objet ; ils ne le
sont plus. Un raccourci d'égalité (`a = b`) entre deux grandeurs qui viennent de diverger est le
symptôme à chercher.

**Corollaire mesuré** : un écart CONSTANT dans un test (ici 766 $, présent même avec un retrait nul)
n'est presque jamais le bug qu'on chasse — c'est une grandeur voisine qu'on a incluse par erreur
dans la mesure. Ici, la prime RAMQ. Le réflexe utile est de faire varier l'entrée à zéro : si
l'écart survit, il est ailleurs. Et creuser l'écart a payé — il a révélé
`[RAMQ-ACTIF-HORS-RETRAITS]`, la même asymétrie actif/retraité sur un dérivé, laissée ouverte au
BACKLOG plutôt qu'embarquée dans un lot dont Marc avait fixé le périmètre.


### `PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI` — chercher le patron *voisin* avant de croire qu'il n'existe pas

`[CASH-NAN-SILENT]` : le cash de départ de toute la projection coerçait ses termes non finis en
silence. Le patron de durcissement qu'il lui fallait — isoler le terme fautif, le rabattre sur 0,
**journaliser en throttlant par signature** — existait déjà dans le dépôt, et pas loin : dans
`assetValueCad`, **65 lignes au-dessus, dans le même fichier**. Il avait été écrit après un
incident réel (patrimoine affiché à −193 k$).

**Ce que ça dit d'un audit.** Le finding intéressant n'est pas « il manque une garde » — c'est
« il manque une garde *là où le voisin immédiat en a une* ». Cette asymétrie est un signal beaucoup
plus fort qu'une absence isolée : elle prouve que l'équipe connaissait le risque, l'a traité une
fois, et a manqué le site d'à côté. Même famille que `MODULE-ECRIT-HORS-CHECKLIST`, vue le même jour
sur `realEstateMonth.ts`.

**Réflexe** : avant d'écrire une garde, `grep logError` / `Number.isFinite` dans le fichier et ses
voisins directs. Si un patron existe, le RÉUTILISER tel quel (même throttle, même forme de
`context`) — deux gardes de forme différente pour le même risque, c'est la prochaine divergence.

**Corollaire sur la preuve** : quand le correctif consiste à extraire une source unique NEUVE, la
plupart des tests portent sur du code neuf et ne peuvent PAS échouer sur « le code d'avant ». Seuls
ceux qui visent les **consommateurs** discriminent (ici 1 sur 10). Le dire dans le fichier plutôt
que laisser croire que dix gardes protègent le fix.


### `TRACER-AU-LIEU-DE-JETER-DESARME-LA-GARDE-AVAL` — la même donnée n'a pas le même contrat en lecture et en écriture

Corollaire découvert en livrant `[CASH-NAN-SILENT]` — **et attrapé uniquement par la suite complète**
(le fichier de test du lot passait 10/10 en isolation) : durcir un calcul en écartant ses termes non
finis a **désarmé une garde située en aval**, à l'autre bout du dépôt.

`applyCashBalance` (`mcp/ingest/applyDocument.ts`, chemin d'écriture piloté par l'IA) refusait
d'écrire quand `!Number.isFinite(current)`. Comme la source unique rend désormais **toujours** un
nombre fini, ce test ne pouvait plus jamais être vrai : l'écriture passait sur un cash silencieusement
amputé. Deux protections correctes, composées, annulent la garantie — même famille que
`DEUX-DEDUPS-QUI-SE-CONTREDISENT`.

**Le principe, réutilisable tel quel** :
- en **LECTURE / AFFICHAGE**, la bonne réponse à une donnée corrompue est *écarter le terme, tracer,
  montrer le reste* — un écran vide ou `NaN` n'aide personne ;
- en **ÉCRITURE**, c'est *refuser* — on ne calcule pas un delta sur une somme dont on sait qu'elle est
  incomplète.

Donc une source unique durcie doit exposer **deux** portes : le total (pour lire) **et l'inventaire de
ce qu'elle a écarté** (pour que l'aval décide de refuser). C'est le rôle de
`computeCashLedgerDetailed` à côté de `computeCashLedger`. Ne pas se contenter du total : l'aval perd
alors toute capacité de distinguer « 0 $ parce que c'est vrai » de « 0 $ parce qu'on a jeté ».

**Bénéfice inattendu** : en réécrivant la garde sur l'inventaire plutôt que sur la finitude, elle
attrape maintenant le `NaN` qu'elle **ratait depuis toujours** — l'ancien `Number(v) || 0` le rabattait
sur 0, la somme restait finie, l'écriture passait. Seul `±Infinity` était intercepté. Un test qui
échouait a donc révélé un trou plus ancien que le changement qui l'a fait échouer.

**Réflexe** : après avoir rendu une fonction « plus robuste », `grep` ses appelants pour
`Number.isFinite` / `isNaN` / `!Number.isFinite`. Chaque occurrence est une garde qui reposait sur la
fragilité qu'on vient de supprimer.


### `UN-TEST-QUI-ECHOUE-N-A-PAS-FORCEMENT-RAISON` — vérifier le SCÉNARIO avant d'accuser le code

En livrant `[CELIAPP-DOUBLE-RECHARGE]`, mon test de chaîne a échoué avec
`expected 32000 to be less than or equal to 16000` — un écart d'un facteur 2 sur du money-critical,
exactement la forme d'un vrai bug. Le réflexe naturel est de retourner corriger le moteur.

C'était **le test** qui avait tort. Le scénario ne faisait cotiser personne au CELIAPP
(`cashflowAllocation` exige `hasFuturePurchase`), et dans ce cas un report maximal est parfaitement
LÉGAL : 8 000 $ reportés + 8 000 $ annuels par personne, soit 32 000 $ pour un couple. Mon
assertion (« ne doit jamais dépasser le plafond annuel ») niait la règle que le ticket lui-même
décrivait deux paragraphes plus haut.

**Le contrôle qui tranche, avant de toucher au code** : mesurer la MÊME grandeur avec et sans le
correctif (`git apply -R`), sur le même scénario. Ici :
- sans achat → 32 000 avant **et** après : le scénario ne discrimine rien, l'échec était un artefact
  de mon assertion ;
- avec achat → **32 962 $ cotisés la 1re année avant, 16 926 $ après** : voilà le vrai signal.

Si l'écart avant/après est NUL sur le scénario testé, le test ne parle pas du correctif — quoi
qu'affiche son message d'erreur. Corollaire déjà connu mais qui se re-vérifie ici : un scénario doit
faire *emprunter au code le chemin* qu'on prétend corriger. Un couple qui ne cotise pas ne traverse
jamais la logique de cotisation.


### `PERCENTILE-DE-TRAJECTOIRES-N-EST-PAS-UN-PERCENTILE` — trier des séries entières ne produit pas un cône

`runMonteCarlo` classait les trajectoires ENTIÈRES par patrimoine final, puis publiait
`sorted[10 %].netWorthByMonth` sous le nom « bande P10 ». L'erreur est subtile parce que le code se
lit bien : on trie, on prend le 10ᵉ centile, on affiche. Mais l'objet trié est une **série**, pas une
valeur — et l'ordre des séries au point final ne dit rien de leur ordre aux points intermédiaires.

Mesuré : **99 mois sur 361 (27 %)** où « P10 » passait au-dessus de « P50 », pire écart **737 974 $**.

**La règle** : un percentile n'a de sens que sur une DIMENSION à la fois. Pour un fan chart, la
dimension est le temps → il faut trier la colonne de chaque mois, pas les lignes. Symptôme à
reconnaître : un tableau de séries qu'on trie par une seule de leurs valeurs, puis dont on lit
**toutes** les autres valeurs.

**Ce qu'il faut assumer et écrire** : la bande devient un objet synthétique qu'aucune simulation ne
suit. C'est le bon compromis pour « où en serai-je à cette date ? », mais pas pour « quel scénario
précis vais-je vivre ? ». Les deux besoins coexistent : ici le `representativeRun` (métriques
expertes) garde délibérément le tri par patrimoine final, parce qu'un SWR doit décrire un parcours
réellement vécu. Deux consommateurs, deux définitions — chacune documentée à son point d'usage.

**Deux gardes à ne pas oublier**, sinon le correctif est indémontrable :
- **non-vacuité** : un cône de zéros satisfait l'ordre trivialement. Ma première mesure activait le
  Monte Carlo par un flag de config inexistant (`runMC` est le 2ᵉ ARGUMENT de
  `calculateFutureProjection`) : les bandes valaient 0 et le test était vert sans rien prouver ;
- **anti-aplatissement** : rendre P10 = P50 = P90 satisferait l'ordre aussi. Exiger que le cône
  reste OUVERT et qu'il s'ÉVASE — l'incertitude est l'information qu'on affiche.

### `IDENTITE-COMPTABLE-INTERPOLEE-TROIS-FOIS` — lisser séparément des grandeurs liées par une identité la casse

`buildDailyLedger` interpole chaque champ mensuel vers le jour. Trois cadences y coexistent
légitimement : uniforme (les stocks qui glissent), hebdomadaire (les flux de paye et de dette),
datée (les événements ponctuels). Chaque cadence est correcte prise isolément.

Le défaut : `NetWorth` était lui aussi interpolé, **pour lui-même**, avec sa propre cadence — alors
qu'il n'est pas une grandeur indépendante mais l'IDENTITÉ `Σ actifs − DettesNonImmo`. Trois lissages
différents appliqués aux deux côtés d'une égalité comptable : l'égalité ne tient plus qu'aux points
où les trois se rejoignent, c'est-à-dire les fins de mois.

Mesuré sur 1 461 jours : **89,01 $** (socle salarié) et **−76,62 $** (hypothèque + prêt auto), et
jusqu'à **−1 408,37 $** (0,28 % du patrimoine) sur un profil plus gros. Les 25 invariants existants
du grand livre étaient tous VERTS : ils vérifiaient la conservation champ par champ et le raccord
aux fins de mois — jamais l'identité TRANSVERSE en intra-mois.

**La règle** : une grandeur DÉRIVÉE ne s'interpole pas, elle se RECOMPOSE à partir de ses
composants déjà interpolés. Symptôme à reconnaître : un même pipeline traite au même rang un
agrégat et ses propres termes.

**L'arbitrage à écrire noir sur blanc** : au DERNIER jour du mois, la valeur du moteur prime et
n'est PAS recomposée. Le moteur arrondit chaque composant à 2 décimales, donc la somme des arrondis
diffère de l'arrondi de la somme — mesuré 0,01 $. Le test de raccord existant exige l'égalité
STRICTE avec le point mensuel et il a raison : `cur.NetWorth` est la source de vérité. Un cent le
dernier jour contre une dérive structurelle les trente autres. Le test borne explicitement cet
écart (≤ 0,02 $) : sans borne, l'exception deviendrait une porte ouverte.

**Garde de couverture obligatoire** : la liste des composants (`NET_WORTH_DAILY_ASSETS`) est un
duplicata de ce que le moteur additionne. Si un actif y était ajouté côté moteur sans y figurer, le
jour l'oublierait EN SILENCE et le test d'identité échouerait sans nommer la cause. D'où un cas
dédié qui vérifie que chaque entrée est un `stock` connu du grand livre — et que `DettesNonImmo` (et
non `DetteTotale`) est le seul passif retranché, puisque `Immobilier` porte DÉJÀ l'équité nette
d'hypothèque.

### `HELPER-INAPPELABLE-PAR-SON-CONSOMMATEUR` — mesurer les sites AVANT d'écrire la source unique

Ticket `[NW-PRESENT-DEUX-PERIMETRES]` : « le patrimoine présent est recomposé à deux endroits avec
des périmètres différents → extraire une source unique ». J'ai écrit le helper
`computePresentNetWorthWithRealEstate`, puis je l'ai SUPPRIMÉ avant de committer.

Deux constats, dans cet ordre :
1. **le grep n'a trouvé qu'UN site** de recomposition (`FutureKpiStrip`) — la prémisse « deux
   périmètres » était périmée ;
2. ce site ne pouvait pas appeler le helper : il reçoit `netWorth` en **prop**, déjà calculé en
   amont. Un helper qui prend les entrées brutes est structurellement inatteignable depuis un
   composant qui reçoit le résultat. Et la part immobilière passait déjà par `presentEquityOfGoal`,
   qui porte sa propre garde de finitude.

**La règle** : avant d'extraire une source unique, compter les sites RÉELS *et* vérifier que chacun
peut l'appeler depuis les données dont il dispose. Une source unique que personne ne peut appeler
est du code mort qui donne l'illusion que le problème est traité — pire que le problème.

**Corollaire de tenue** : fermer un ticket SANS code est un résultat légitime, à condition d'écrire
la mesure qui le justifie dans l'archive. Sinon la session suivante rouvre le même ticket sur la
même prémisse périmée (famille `DOC-STALE-IMPOSSIBILITY`, en miroir).

### `GARDE-SUR-AGREGAT-AVEC-INDEX-PAR-COMPOSANT` — la garde existait, elle ne pouvait pas se déclencher

`buildMarketData` publie `syntheticTailKeys`, un `Set` de `JSON.stringify([date, symbole])` marquant
les valeurs raccordées au prix courant faute de chandelles. `seriesReturnPct` l'accepte pour rendre
« — » plutôt qu'un 0,00 % trompeur. En branchant la variation des placements du hub, j'ai passé cette
même fonction `isSynthetic` pour la clé **`TOTAL`**.

Elle ne peut jamais rendre `true` : l'index est peuplé PAR SYMBOLE, et `TOTAL` est un agrégat qui
mêle réel et synthétique — c'est même écrit dans le commentaire du champ. La garde compilait,
se lisait bien, et ne protégeait rien.

**Puis le second piège, plus grave** : même relevée correctement au niveau de l'agrégat, une règle
bâtie sur `syntheticTailKeys` rate le cas le plus COURANT. `priceAt` REPORTE le dernier close connu
jusqu'à 7 jours (`STALE_PRICE_DAYS`) sans rien marquer du tout. Deux jours consécutifs de report
donnent exactement le même 0,00 % trompeur, et aucune clé synthétique n'existe pour le dire. Une
garde correcte sur le mauvais indicateur reste une garde vide.

**La règle** : avant de brancher une garde indexée sur des COMPOSANTS à une grandeur AGRÉGÉE,
vérifier que l'index contient une entrée pour la clé qu'on interroge — et pas seulement que les types
concordent. Puis se demander si l'indicateur couvre bien TOUS les chemins qui produisent le symptôme,
ou seulement celui qui l'a fait naître.

**Ce qui a marché ici** : refonder la règle sur un fait vérifiable dans la SOURCE plutôt que dans un
sous-produit — « ce jour-là, au moins un titre portant une colonne avait-il une vraie clôture dans son
`priceHistory` ? ». Insensible au report comme au raccord, et sans dépendance aux détails internes de
`buildMarketData`. Sur une série quotidienne normale, elle ne se déclenche jamais.

**Ce qui l'a révélé** : un test de REFUS écrit avant de croire la garde. Il a d'abord échoué pour la
mauvaise raison (le refus « périmé » frappait avant), ce qui a obligé à construire une fixture où le
chemin visé est le SEUL atteignable — deux titres, dont un qui fournit l'axe des dates sans porter de
colonne. Une fixture qu'on doit tordre pour atteindre une garde est un signal : ou la garde est
inatteignable, ou on ne l'a pas comprise.

### `PARITE-QUI-REND-UN-TEST-VACUEUX` — une longueur de fixture choisie au jugé ne prouve rien

Garde contre la décimation : `buildMarketData` réduit sa sortie à 500 points (pour Recharts) en
gardant les indices `0, s, 2s…` plus les deux derniers. La borne « 7 jours » est à l'indice `N−8` :
elle survit à la décimation quand `(N−8) % s === 0`.

Mon premier test utilisait N = 900 (donc `s = 2`, et `892 % 2 === 0`) : la borne survivait, le test
passait **aussi bien avec la décimation active que sans**. Il avait l'air de garder quelque chose.
Vérifié par perturbation (remettre `maxPoints: 500`) : 9 tests verts dans les deux cas.

Avec N = 1500 (`s = 3`, `1492 % 3 === 1`), la borne disparaît si l'on décime et la baseline recule
d'un jour — « 7 jours » vaudrait 8. Le test discrimine.

**La règle** : quand un test dépend d'un pas d'échantillonnage, d'un modulo, d'une taille de bloc ou
d'une longueur de fenêtre, la valeur de la fixture est un PARAMÈTRE DU TEST, pas un décor. La choisir
en calculant la condition d'échec, et **asserter cette condition dans le test lui-même** (ici :
`expect((N − 8) % pas).not.toBe(0)`) — sinon un refactor de la constante de décimation rendrait le
cas vacueux sans que rien ne bronche.

Sœur de `PREUVE-DE-DISCRIMINATION-NON-REPRESENTATIVE` : ce n'est pas « le test échoue-t-il sur le code
d'avant ? » qu'il faut se demander une fois, c'est le vérifier pour CHAQUE perturbation qu'il prétend
couvrir. Trois refus, trois perturbations, trois vérifications — la troisième était verte.
### `CORRECTIF-VERT-EN-TEST-INERTE-EN-PROD` — le test et la prod n'appelaient pas la même configuration

`[JOUR-BILAN-ROMPU-SOUS-HYPOTHEQUE]` recompose `NetWorth` au jour à partir de ses composants, et
s'ABSTIENT dès qu'un terme manque (une somme partielle serait un patrimoine faux et crédible — la
garde est bonne). Mes 4 tests appelaient `buildDailyLedger` **sans `fields`** : ventilation
COMPLÈTE, tous les termes présents, recomposition exécutée, mesure 89,01 $ → 0,00 $.

La vraie courbe passe `fields: CURVE_FIELDS` — une ventilation ALLÉGÉE (~100 ms au lieu de ~500 ms
sur 30 ans) qui ne contient que les champs TRACÉS. `DettesNonImmo` n'y était pas, puisqu'aucune aire
ne la dessine. La condition `complet` était donc TOUJOURS fausse en production : **le correctif était
vert en test et INERTE à l'écran**. Trouvé par une revue automatique sur la PR, APRÈS le merge.

**La règle** : quand une fonction accepte un paramètre de CONFIGURATION qui restreint son travail
(`fields`, `include`, un `Set` de clés, un niveau de verbosité), le test doit s'exécuter avec la
configuration RÉELLE de l'appelant, pas avec le défaut le plus généreux. C'est
`TEST-AU-CONTRAT-NE-VOIT-PAS-L-APPELANT` appliqué non pas à une valeur, mais au *périmètre de
travail* — et c'est plus sournois, parce que le contrat de la fonction est parfaitement respecté.

**Symptôme à reconnaître** : une garde d'abstention (`if (complet)`, `if (tout est là)`) dont le test
ne construit jamais le cas INCOMPLET. Si l'abstention n'est pas testée, on ne sait pas laquelle des
deux branches la prod emprunte.

**Le correctif de garde** : lire la configuration réelle dans le SOURCE de l'appelant et rejouer avec
elle (patron `chartPrivacyScan`/`curveFields` déjà utilisé ici), en deux temps — la liste (« chaque
terme du bilan ∈ `CURVE_FIELDS` », qui NOMME la cause) ET l'effet (rejouer la ventilation avec ce set
et re-mesurer l'identité). La liste seule se satisferait d'un champ ajouté au mauvais endroit ;
l'effet seul échouerait sans dire pourquoi.

⚠️ **Et une note de posture** : c'est une revue AUTOMATIQUE qui l'a trouvé, sur du code que j'avais
mesuré, testé et documenté. Les findings de bot ont un fort taux de faux positifs sur le
money-critical (~3/8 des HIGH sont faux) — mais un finding qui pointe une INERTIE se vérifie en une
minute par grep, et il faut le faire AVANT de le classer. Le coût d'un faux positif ici est une
minute ; le coût d'un vrai positif ignoré est une livraison qui n'existe pas.
## Leçons de la vague 1c (fin) — 2026-08-19

### `INVARIANT-QUI-NE-PARCOURT-PAS-LA-PHASE` — une garde ne dit rien des mois qu'elle ne visite pas

`projection.fluxForm.test.ts` était la garde la plus fine du dépôt : « toute variation d'un compte est
EXPLIQUÉE par les flux publiés ». Elle tournait sur une fixture de **12 ans**, couple de 45 ans,
retraite fixée à **62**. Elle n'atteignait donc JAMAIS le décaissement — ni les retraits de retraite,
ni le meltdown REER, ni le retrait minimum FERR obligatoire à 72 ans. L'invariant était juste, son
implémentation correcte, et il n'avait simplement jamais rencontré la moitié du moteur.

Porté à 35 ans, il a trouvé en une exécution : **131 566,62 $** de REER disparaissant sans flux publié,
à chaque janvier de 72+, **en mode DÉTERMINISTE** — donc à l'écran, sur la courbe de tous les jours.

**La règle** : pour un moteur à PHASES (accumulation → retraite → décaissement forcé → succession),
l'horizon d'une fixture est un choix de COUVERTURE, pas un réglage de perf. Avant de faire confiance à
un invariant, se demander quelles phases sa fixture traverse — et l'écrire à côté de la fixture.
Symptôme à reconnaître : un `years:` court dans le fixture d'un test dont le nom promet « tout
l'horizon ».

**Corollaire de tenue** : quand une garde est étendue, comparer ce qu'elle trouve à ce que le ticket
PRÉDISAIT. Ici le ticket annonçait un échec sur `stressTestEnabled` — pari **périmé** (le stress-test
avait été corrigé entre-temps et reste vert). Le vrai défaut était ailleurs, et plus grave. Un ticket
qui se trompe de cause n'invalide pas le travail : il invalide seulement la phrase qu'on allait
recopier dans la PR.

### `UN-MONTANT-DEUX-REGISTRES-DEUX-REGLES` — le correctif « ajouter au registre oublié » peut déplacer de l'argent

Suite directe du défaut ci-dessus. Le retrait FERR alimentait `retraitReerMois` (registre
d'AFFICHAGE) mais pas `withdrawalREER` (registre des TRANSFERTS → `NetTransferREER`, lu par le plan
d'actions annuel). Le réflexe est d'écrire `withdrawalREER += ferr` et de passer à la suite.

Or `withdrawalREER` a **deux** consommateurs, et ils ne veulent pas la même chose :
- `monthlyOutput` → publie `NetTransferREER = contribREER − withdrawalREER`. Il DOIT voir la FERR.
- `stepReerByUser` → répartit le retrait **AU PRORATA** entre conjoints. Il ne doit SURTOUT PAS la
  voir : la FERR a déjà été retirée de la part EXACTE de chacun (`ferrGrossByUser`, facteur RRIF de
  SON âge). L'y réinjecter la soustrairait une seconde fois, au prorata — un correctif de FLUX qui
  déplace de l'ARGENT chez un couple à écart d'âge.

D'où un accumulateur mensuel dédié (`ferrWithdrawalMois`) et un `withdrawalREER − ferrWithdrawalMois`
au seul site du partage. **Un montant, deux registres, deux règles.**

**La règle** : avant d'ajouter un montant à un registre, **grep TOUS ses consommateurs** et se
demander pour chacun s'il attend ce terme. Un registre partagé par un producteur d'affichage et un
répartiteur per-conjoint n'a pas une seule sémantique. Parent de `PARTAGER-LE-MONTANT-PAS-SES-REFLETS`
(là c'était la part appliquée au mauvais objet ; ici c'est le terme versé au mauvais consommateur).

**La preuve exigible** : goldens COMPLETS (tous les champs × tous les mois) capturés avant, comparés
champ à champ après, sur plusieurs écarts d'âge dans le couple. Ici : **un seul champ change,
`NetTransferREER`, sur 27 points ; `reerByUserFinal`, soldes, impôts et patrimoine bit-identiques.**
Un diff de goldens qui ne montre QUE le champ visé est ce qui distingue « j'ai publié un flux » de
« j'ai changé le plan financier sans m'en rendre compte ».

### `UN-INVARIANT-QUI-NE-TROUVE-RIEN-DOIT-PROUVER-QU-IL-POURRAIT` — perturber, pas raisonner

`[ENG-MC-CONSERVATION-BLIND]` a étendu l'invariant de bilan à toute la branche stochastique (divorce,
décès du conjoint, LTD, maladie grave, LTC, perte d'emploi, héritage, bootstrap), jusque-là hors de
portée de TOUTES les gardes parce que l'API publique appelle toujours `runScenario(..., false, ...)`.
Résultat : **20 365 points, pire écart 0,02 $, aucun défaut**. Un « tout est vert » sur une garde
neuve est le résultat le plus suspect qui soit — il ressemble exactement à une garde vide.

Deux preuves ont été produites, dans cet ordre :
1. **couverture assertée, pas supposée** — chaque chemin stochastique est COMPTÉ avec un plancher
   (divorce ≥ 20 runs sur 60, perte d'emploi ≥ 25, maladie grave ≥ 12, héritage ≥ 12, LTD ≥ 6,
   LTC ≥ 3, décès du conjoint ≥ 1). Une gate d'âge déplacée ou une probabilité remise à zéro fait
   ÉCHOUER la suite au lieu de la vider en silence ;
2. **perturbation** — publier `CELI × 0,999` dans `monthlyOutput` fait ÉCHOUER la garde à 6 892 $.
   C'est la classe MONEY-PHANTOM, celle qu'INV-9 doit voir.

⚠️ Et la perturbation a AUSSI délimité ce que la garde ne peut PAS voir : `reer *= keep × 0,999` dans
le partage de divorce **passe**, et c'est correct — `NetWorth` est DÉRIVÉ des mêmes soldes, les deux
côtés bougent ensemble. Un invariant de bilan juge la **cohérence**, jamais le **montant**. Écrire
cette limite dans le fichier de test vaut mieux que de laisser croire la garde plus forte qu'elle
n'est (famille `GARDE-CIRCULAIRE`).

⚠️ **Le verrou d'observabilité comptait autant que le hook de test** : `__runScenarioForTests` seul ne
suffisait pas, car sous MC `buildMonthlyDataPoint` réduit le point à `{ NetWorth, monthIndex }` —
aucune ventilation d'actifs à reconstruire. Il fallait AUSSI `diagnostics.verboseMonthlyPoints`.
Quand un chemin est « invérifiable », chercher s'il l'est par nature ou seulement par une
OPTIMISATION d'affichage qu'un drapeau de diagnostic existant sait déjà désarmer.

### `REGISTRE-D-AFFICHAGE-QUI-PILOTE-UN-CALCUL` — remplir le « registre oublié » peut déplacer de l'argent

`[ENG-APRIL-REFUND-NONREG-UNPUBLISHED]` avait tout du correctif cosmétique : un producteur mutait
`nonReg` sans publier `contribNonReg`, donc le solde bougeait sans flux visible. On ajoute la ligne
manquante, on coche, on passe.

Sauf que `contribNonReg` a **deux** consommateurs :
- `monthlyOutput` → `NetTransferNonReg` (affichage) ;
- `growthApplication` → croissance calculée sur `nonReg − contribNonReg`, pour EXCLURE les dépôts de
  mi-mois d'un mois complet de rendement.

Publier le flux a donc **déplacé de l'argent** : le remboursement, versé le 30 avril, cessait de
gagner un mois entier de rendement. **−428,67 $ de patrimoine final sur 30 ans** (−0,009 %) sur le
scénario de référence, jusqu'à **−23 343 $** sur le plus gros ancrage golden.

**La règle** : avant de remplir un registre, grep TOUS ses lecteurs et classer chacun en
« affichage » ou « calcul ». Un seul lecteur de calcul suffit à faire d'un correctif d'affichage un
correctif money-critical — qui exige une MESURE, une re-base des goldens, et une phrase honnête dans
le CHANGELOG. Symétrique exact de `UN-MONTANT-DEUX-REGISTRES-DEUX-REGLES` (là, un consommateur ne
devait PAS voir le terme ; ici, il devait le voir, et personne ne l'avait remarqué).

**Comment savoir si le déplacement est une correction ou une régression** : regarder le SIGNE et sa
dépendance à l'horizon. Ici l'écart est négatif partout et croît avec la durée et la taille du
portefeuille — signature d'un intérêt composé qu'on cesse de créditer à tort. Un écart de signe
variable, ou constant quel que soit l'horizon, aurait dit l'inverse.

**Le ticket se trompait de risque**, et c'est instructif : il annonçait que publier `contribNonReg`
« déplacerait une décision d'allocation dans le même mois », `cashflowAllocation` le recevant en
entrée. Un grep suffit à réfuter — ce module ne fait qu'un `+=` et ne LIT jamais la valeur. On a donc
dépensé la prudence au mauvais endroit, et le vrai risque était dans un module que le ticket ne
mentionnait pas. **Re-dériver le risque d'un ticket par grep avant de le croire**, exactement comme
on re-trace le diagnostic d'un ticket perf.

**Et deux propriétés indépendantes, deux tests** : « le mouvement est expliqué » (forme-flux) et
« un dépôt du 30 ne rapporte pas un mois » sont séparées. Un futur passage qui retirerait
`contribNonReg` du calcul de croissance (« ça ne sert qu'à l'affichage ») recréerait la croissance
fantôme **sans casser la forme-flux**. Il faut un cas dédié pour chacune.
