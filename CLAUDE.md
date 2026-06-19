# FinanceAI — CLAUDE.md

App perso de planif financière (fiscalité ARC + Revenu Québec, Monte Carlo retraite,
assistant Claude). 100 % navigateur, pas de backend. TS strict, ~1780 tests Vitest.
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
  bloc Préférences global — c'est CE cycle qui prévaut pour FinanceAI). ⚠️ Hors ce cycle,
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

## Exécution cloud — résilience (leçons 2026-06-09)
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
- Un commit de merge GitHub (`noreply@github.com` sur `main`) signalé « Unverified » par le stop-hook
  n'est PAS un commit local à corriger — l'ignorer.

## Agents — deux niveaux
**Globaux** (`~/.claude/agents/` via claude-config / ECC) : dispo dans tous les projets.
**Projet** (`.claude/agents/` ici, **13**) : spécialisés FinanceAI, SURCHARGENT les globaux par nom.
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
- **Findings de review = hypothèses, pas vérités** : une review multi-agents sur du code fiscal/moteur
  a un FORT taux de faux positifs (≈3/8 HIGH financiers FAUX — #2 supposait un revenu nominal alors qu'il
  est déflaté ; #5 prémisse fausse ; FISC-GOVPENSION-SCALE 2026-06-16 : `governmentPension` est un agrégat
  MÉNAGE, pas per-personne → le « fix » ×N aurait double-compté la RRQ+PSV d'un couple). VÉRIFIER chaque
  finding (lecture du vrai code + panel adversarial qui cherche à RÉFUTER) AVANT de coder un fix
  money-critical. Un faux fix dans un moteur d'impôt est pire que le finding non corrigé.
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
- `npm run lint` · `npm run typecheck` (clean) · `npm run test` · `test:watch` · `test:e2e`
- `npm run knip` · `npm run check-contrast` · MCP : `mcp:dev`/`mcp:auth`/`mcp:connect`/`mcp:pack`

## Tests
- Tests pour TOUTE nouvelle logique. Priorité `services/projection/`. Ne pas baisser la couverture.
- **Garde-fou money-critical** : `tests/services/projection.moneyConservation.test.ts` (12 invariants de
  conservation de l'argent). À ÉTENDRE — pas affaiblir — à chaque bug financier trouvé. Voir la checklist
  « VALIDATION FINANCIÈRE » dans « Règles non négociables ».
- **Lire un fichier du repo dans un test** (doc/source à scanner — ex. fiscalFreshness, futur FISC-CONST-LINT) :
  `readFileSync(resolve(process.cwd(), 'chemin'))` — PAS `new URL('…', import.meta.url)` : `import.meta.url`
  n'est PAS de scheme `file://` après transform Vite → « The URL must be of scheme file » (leçon
  HARDEN-FISCAL-TIMEBOMB 2026-06-18). Vitest tourne depuis la racine du projet.
- **Un test qui SCANNE le code (garde-fou type FISC-CONST-LINT) doit PROUVER son volume** (leçon FISC-CONST-LINT
  2026-06-18) : un scan qui rend 0 fichier (mauvais `cwd`, `readdirSync` muet) ou 0 motif (regex cassée) PASSE à
  vide = protection NULLE silencieuse. Toujours asserter `files.length > N` ET `motifs.length > M` AVANT le scan.
  Et **strip les commentaires** avant d'extraire/scanner des nombres : un n° de ligne de formulaire (« ARC ligne
  23500 ») en commentaire pollue sinon des deux côtés (faux positifs).
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

## Stack
React 19.2 + Vite 8 (Rolldown) + TS 5.8 strict + Tailwind 3 · Zustand 5 (persist+partialize, schema v7,
migrations v1→v7) · Zod 3 · Recharts 3 (lazy) · Vitest 4 + Testing Library + axe-core ·
@anthropic-ai/sdk (Sonnet 4.6 + Haiku 4.5) · @modelcontextprotocol/sdk · Finnhub + CoinGecko ·
i18next · jspdf. Prod : **Vercel** (`vercel.json` : headers sécurité + cache + SPA).

## Structure (PLAT — pas de src/)
Racine : `App.tsx`, `index.tsx`, `constants.ts`, `types.ts`, `i18n.ts`.
Dossiers : `components/ hooks/ services/ store/ utils/ locales/ mcp/ e2e/ tests/ scripts/ docs/`.
Cœur : `services/projection.ts` + `services/projection/` (31 sous-modules).
⚠️ Hoister un import au niveau App tire ses deps dans le bundle de BOOT → lazy-charger (lazyWithRetry
+ Suspense) tout composant/service app-level qui importe du lourd (ex. `ProjectionEngine` → moteur
projection ; PH2-c : index 660→536 kB gzip après bascule lazy).

## Règles non négociables
- **Future = source unique** : tout calcul long-terme vient de `lastProjection.chartData`.
  Réf : `docs/PROJECTION_OUTPUT_SCHEMA.md` (détail refactor « source unique » dans `docs/HISTORIQUE.md`).
- **No-fake-data** : zéro donnée simulée en prod. Projection non calculée → `<ProjectionRequired>`.
- **Valeurs fiscales** : toute constante fiscale (plafonds, paliers, taux, RRQ/PSV/SRG, montants
  de base) DOIT venir de `docs/FISCAL_REFERENCE.md` (datée + sourcée). Jamais de chiffre fiscal
  en dur non sourcé. Audit : agent `financial-integrity` (ex-`fiscal-accuracy`, vs `docs/FISCAL_REFERENCE.md`).
- **Unités argent** : `config.users[].grossSalary`/`netSalary` (store) sont **MENSUELS** (convention
  canonique, `utils/salary.ts`). Annualiser **×12** pour toute comparaison annuelle (MGA, paliers
  fiscaux) — sinon bug d'échelle ~12× (vu sur la RRQ, FISC-RRQ-UNIT 2026-06-15).
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
- **PostToolUse (Edit|Write)** → `auto-lint` : `eslint --fix` sur le `.ts/.tsx` modifié (jamais bloquant).
- **PreToolUse (Bash)** :
  - `commit-gate` → avant tout `git commit` : `typecheck` + `test` + `build` doivent passer, sinon commit BLOQUÉ.
  - `guard` → bloque `rm -rf` sensible, `--no-verify`, écriture `.env`. **Le `git push` est AUTORISÉ**
    (Claude gère commit→push→PR→merge ; cf Workflow ci-dessus).
  - `learn-on-push` → sur `git push` : RAPPEL non-bloquant « leçon apprise → delta CLAUDE.md ? » **+ « un agent
    `.claude/agents/` à mettre à jour ? »** (applique « CLAUDE.md/agents s'améliorent à chaque push »). Pipe-tester un hook stdin : **Git Bash**
    (`echo '{...}' | node …`), PAS PowerShell 5.1 qui ne livre pas le stdin à un exe natif.
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
- MCP : connecteur livré (Lots 0-3) — y toucher seulement sur demande ; reste = héberger le `.mcpb`.
- **`knip`** : la liste « unused exports » est surtout du BRUIT (types effacés au compile, symboles sur-exportés
  utilisés en interne ou par les tests, constantes fiscales protégées). NE PAS purger en masse — vérifier chaque
  cas (grep). Repo déjà propre au 2026-06-15 : 0 fichier mort, 0 dépendance inutilisée, lint clean.
- Auth : **Cloudflare RETIRÉ de FinanceAI (2026-06-16)** — Access (mur de login) ET proxy DNS dé-proxifié
  (apex+www en « DNS only » vers Vercel ; le tunnel CF du `hub` reste, projet séparé). L'auth = **gate Google
  in-app** (`LoginGate`+`authGate`, actif via `VITE_GOOGLE_GATE=1`+`VITE_GOOGLE_CLIENT_ID`). ⚠️ Le gate est
  SOFT (trappe `?nogate=1`) → l'app est publiquement accessible (modèle multi-user voulu) ; les **données
  restent privées par compte Google** (sync Drive) et les clés chiffrées sont **par appareil** (IDB
  non-extractible). Plus de WAF/DDoS CF → filet = chiffrement au repos + CSP. Détail : `docs/GOOGLE_DRIVE_SETUP.md`.
- Persistance : localStorage + IndexedDB chiffré (AES-256-GCM, PBKDF2 600k). apiKeys exclues.
- Mode test : PERSISTÉ depuis #217 (bannière survit au reload) ; push Drive coupé en test
  (`shouldPush`). Switch de persona = base propre (`personaResetBase`), zéro fuite inter-persona.
