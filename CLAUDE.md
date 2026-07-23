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
- **Backlog tenu par Claude** (l'Action `backlog-autocheck` a été RETIRÉE — choix Marc 2026-06-09) :
  au moment du MERGE d'une PR, Claude coche lui-même les `[ID]` livrés dans `docs/BACKLOG.md`
  (dans la PR même ou la suivante), ajoute les découvertes, et route les blocages humains
  vers `docs/A_FAIRE_MOI.md`. Fin de session : BACKLOG + SESSION_HANDOVER à jour = partie du travail.
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

## Notes
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
  scan de clés (union des lignes, pattern Investments). Sœur : le matching par SOUS-CHAÎNE (`k.includes(sym)`)
  sur des clés devenues = symboles exacts fait matcher « V » (Visa) avec « VFV.TO » → helper partagé
  `historyKeyMatchesSymbol` (exact + préfixe place legacy), 6 sites corrigés. (6) **Une écriture par clé
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
  un contrat « mémoïse ! » en commentaire ne protège rien). (5) **Un `system` qui varie par envoi invalide le préfixe
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
  `vi.useFakeTimers` + `vi.setSystemTime` (le reschedule lit `Date.now()`). ⚠️ Un mock `gisAuth` d'un test sync doit
  désormais exporter `renewTokenSilently` + `AuthInteractionRequiredError` (sinon `undefined` si cache-miss emprunté).
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
