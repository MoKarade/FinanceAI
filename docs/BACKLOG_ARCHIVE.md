# BACKLOG ARCHIVE — FinanceAI

> **Archive du backlog** (créée 2026-07-31, demande Marc : « un nouveau fichier backlog archive
> pour archiver toutes les tâches une fois finies et validées »). Ce fichier reçoit les tâches
> FINIES + VALIDÉES retirées de `BACKLOG.md`, avec leur contexte d'origine.
>
> ⚠️ **Toute case NON cochée ci-dessous est HISTORIQUE** : les items encore ouverts au
> 2026-07-31 ont été EXTRAITS vers `BACKLOG.md` (refonte complète, vérification
> item-par-item contre le code par 2 agents, preuve fichier:ligne). Ne JAMAIS reprendre une
> tâche depuis ce fichier — la seule source des tâches ouvertes est `BACKLOG.md`.
> L'historique fin par item reste dans git et `docs/HISTORIQUE.md`.

## 2026-08-28 — Lot 31 : fermeture des angles morts du lot 30 (absorptions silencieuses, site d'appel unique)

- [ ] **`[HEALTH-RATIOS-NAN-ABSORBE-EN-AMONT]`** (S — findings silent-failure-hunter + financial-integrity
  MESURÉS, panel PR #756, PRÉ-EXISTANT) — deux métriques de santé traversent des absorptions
  SILENCIEUSES avant d'atteindre la garde `sanitizeNonFinite` : le `clamp01` local de
  `utils/healthRatios.ts` (`Number.isFinite(n) ? n : 0`) et `totalYearlyCost` de
  `utils/subscriptions.ts`. Une entrée corrompue devient un `0` FINI — donc crédible, donc invisible
  à la garde de sortie, et sans aucune trace. Mesuré (poids par défaut) : `budgetItems[].target =
  Infinity` → total **28** ; `= NaN` → **56** ; `subscriptions[].yearlyCost = Infinity` → **84** ;
  `debts[].balance = Infinity` → **84** — dans tous les cas `available: true`, aucun `logError`.
  Classe `TRACER-AU-LIEU-DE-JETER-DESARME-LA-GARDE-AVAL`. ⚠️ Ces absorptions ont d'autres
  consommateurs : grep-les AVANT de durcir (la garde d'entrée de `computeSubscriptionLoadScore` a été
  durcie au lot 30, elle n'avait qu'un seul consommateur de production).
  ✅ **Livré lot 31** (`claude/lot-31`), gate vert (4 884 tests, 459 fichiers). Les trois chemins RE-MESURÉS avant de coder, et ils vont
  dans les DEUX sens — c'est ce qui rend l'absorption dangereuse plutôt qu'imprécise : cible de
  poste `Infinity` → score 92,86 → **100** (parfait, depuis un poste corrompu) ; dépense réelle
  `NaN`/`Infinity` → 92,86 → **0** (« 100 % de dépassement ») ; coût d'abo `NaN`/`Infinity` →
  95 $/mois jetés à 20 $/mois, score 87,3 → **97,3**. Tous FINIS, donc invisibles à la garde de
  SORTIE du lot 30. Correctif conforme à `TRACER-AU-LIEU-DE-JETER-DESARME-LA-GARDE-AVAL` : deux
  portes — `totalYearlyCost` (LIRE : l'écran Planning garde le droit d'afficher la somme des abos
  lisibles) et `totalYearlyCostAudit` (ÉCRIRE : un calcul qui publie un score REFUSE). Gardes
  d'ENTRÉE tracées dans `computeBudgetParityScore` et `computeSubscriptionLoadScore` ; le
  `clamp01` local reste comme DERNIER filet mais TRACE désormais s'il tire. 6 tests, discriminés
  par deux perturbations (3 rouges puis 2 rouges).

- [ ] **`[AITOOLS-CALLSITE-UNIQUE-GARDE]`** (S — findings ai-reviewer, panel PR #756) — deux trous
  que `[MCP-WRITE-PARITY-GUARD]` (lot 30) ne ferme pas, aucun n'étant un défaut observé aujourd'hui :
  (a) `services/aiTools/agentLoop.ts` est le SEUL site qui déclare un tableau `tools` à l'API
  Anthropic, mais c'est une propriété de FAIT, non testée — un futur second site avec son propre
  `tools:` échapperait à toutes les gardes ; remède = une garde de source « seul `agentLoop.ts`
  importe `toAnthropicTools` », même patron que `tests/aiTools/noMcpSdkInSpecs.test.ts`.
  (b) Rien ne lie `spec.kind === 'write'` à l'ENDROIT où le tool est enregistré dans `mcp/server.ts`
  (bloc `if (options.store)`) : un tool d'écriture branché hors de ce bloc ferait rougir la parité,
  mais la correction « naturelle » (l'ajouter à `READ_SPECS` ou à `SERVER_ONLY`) masquerait sa vraie
  nature. Vérifié : les 8 tools d'écriture actuels sont bien dans le bloc conditionnel.
  ✅ **Livré lot 31** (volet a). `tests/aiTools/anthropicCallsiteGuard.test.ts` balaie les 200+
  fichiers de production et fige trois faits : seul `agentLoop.ts` importe `toAnthropicTools` ;
  les sites d'appel du SDK sont exactement les deux mesurés (`agentLoop.ts`, `claude.ts`) ; et
  `claude.ts` ne déclare aucun `tools:`. Contre-épreuve incluse — le site autorisé doit vraiment
  construire son tableau DEPUIS le registre et ne fabriquer aucun `input_schema` littéral, sinon
  « un seul site » ne garantirait rien sur ce qu'il déclare. Toutes les assertions d'ABSENCE
  lisent la source DÉCOMMENTÉE avec anti-vacuité (`tests/helpers/source.ts`) — ce fichier
  EXPLIQUE le motif qu'il interdit. 2 perturbations, 2 rouges.
  ⚠️ **Volet (b) NON livré, et délibérément** : lier `spec.kind === 'write'` à l'endroit
  d'enregistrement dans `mcp/server.ts` demanderait de mapper `registerX` → `.tool.ts` → spec,
  alors que la parité comportementale du lot 30 fait DÉJÀ rougir le cas. Le vrai risque n'est pas
  la détection mais la RÉPARATION (ajouter le tool à `READ_SPECS` ou à `SERVER_ONLY` ferait
  reverdir en masquant sa nature) — c'est donc un commentaire nommant ce piège qui a été posé
  dans `tests/mcp/writeToolParity.test.ts`, pas de la machinerie.

## 2026-08-28 — Lot 30 : garde de parité des tools d'écriture, score de santé non fini, persona par défaut reproductible

> ⚠️ **Panel `/review-all` (5 agents) sur la PR #756 — 4 défauts CAUSÉS ou LIMITÉS par ce lot, tous
> corrigés dans la même PR, aucun trouvé par le gate.** (a) `computeHealthTotalScore` retombait sur
> `0` quand plus rien n'est mesurable : branche MORTE avant le lot (les trois métriques de base
> étaient `available:true` en dur, donc `counted` ne pouvait pas être vide), **rendue ATTEIGNABLE**
> par `sanitizeNonFinite` — et `0` s'affiche « 0/100 » avec l'anneau ROUGE, soit « santé critique »
> pour dire « on ne sait pas ». Corrigé en `number | null`, ce qui fait exiger la branche honnête par
> `tsc` sur chaque surface. Classe `UN-CORRECTIF-PEUT-ETRE-PIRE-QUE-LE-DEFAUT-SUR-UNE-BRANCHE`.
> (b) Sur la MÊME corruption (`netSalary: Infinity`), `computeSubscriptionLoadScore` rendait le score
> PARFAIT de 100 au lieu de 87 (`Infinity > 0` est vrai → `95/∞ = 0`) avec le libellé faux « 0,0 % du
> revenu net » — mesuré +8 points sur le total. La garde de SORTIE ne pouvait structurellement pas le
> voir : 100 est un nombre fini. C'est la garde d'ENTRÉE qui devait refuser. (c) Ma fixture de test
> portait `subscriptions: []`, ce qui rendait cette métrique inobservable — l'assertion « les autres
> métriques restent intactes » était vacueuse pour elle (`UNE-GARDE-NE-COUVRE-QUE-CE-QUE-SA-FIXTURE-REND-NON-NUL`).
> (d) J'avais recopié le « 3 088,55 $ » du ticket dans le CODE : il n'est pas retrouvable sur la
> grandeur qu'il nomme, bornée par construction à 2 480 $ et re-mesurée à 1 168,66 $ sur 50 000
> graines. Un ticket n'est pas une source, même quand il dit « MESURÉ ».
> Quatre findings pré-existants routés au `BACKLOG.md` plutôt que corrigés ici
> (`[HEALTH-RATIOS-NAN-ABSORBE-EN-AMONT]`, `[ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE]`,
> `[AITOOLS-CALLSITE-UNIQUE-GARDE]`, `[HEALTH-CORRUPTION-INDISTINGUABLE-D-UNE-ABSENCE]`).

- [x] **`[MCP-WRITE-PARITY-GUARD]`** (S — finding ai-reviewer, panel PR #755, PRÉ-EXISTANT) —
  `tests/aiTools/registryParity.test.ts` n'assure l'exhaustivité que sur `READ_SPECS`
  (`s.kind === 'read'`). AUCUN test ne compare les tools d'ÉCRITURE enregistrés côté serveur MCP
  (`mcp/server.ts`, bloc `if (options.store)`) à `WRITE_SPECS` (`services/aiTools/registry.ts`).
  Les deux fichiers compilent indépendamment → un tool d'écriture ajouté ou retiré d'UN SEUL des
  deux registres ne serait vu ni par `tsc`, ni par le lint, ni par le gate. Risque concret : un
  geste destructif (`delete_item`-like) exposé côté MCP mais absent du chat in-app, ou l'inverse,
  sans aucun test rouge. Même classe que `[DEFAULTS-DRIFT-FINTABLE-FIELDS]` (test unidirectionnel).
  ⚠️ Le retrait de `upsert_savings_goal` (PR #755) a été fait symétriquement à la main et VÉRIFIÉ —
  ce ticket ferme le trou pour la prochaine fois, il ne corrige pas un bug actuel.
  ✅ **Livré lot 30** (`claude/lot-30`), gate vert (4 874 tests, 457 fichiers). Garde
  `tests/mcp/writeToolParity.test.ts` : elle démarre le VRAI `createServer()` sur un
  `InMemoryTransport` et lui demande `tools/list` — mesure COMPORTEMENTALE, pas un scan de source
  (un `registerX` neutralisé ne peut pas se cacher derrière un grep). Trois volets : parité
  bidirectionnelle des tools d'ÉCRITURE (serveur avec magasin MOINS serveur sans magasin ≡
  `WRITE_SPECS`), parité des tools de LECTURE hors deux exclusions déclarées ET vérifiées non
  périmées (`ping`, `connect_drive`), et égalité des DESCRIPTIONS servies au modèle. Discriminée
  par 3 perturbations : retrait côté serveur → rouge, retrait côté registre → rouge, description
  réécrite dans un `.tool.ts` → rouge.

- [x] **`[HEALTH-SCORE-NAN-SILENCIEUX]`** (XS — finding silent-failure-hunter, panel PR #755,
  PRÉ-EXISTANT) — `clamp01` (`utils/healthScore.ts`) ne neutralise pas `NaN`
  (`Math.max(0, Math.min(100, NaN)) === NaN`), et les 3 métriques toujours `available: true`
  (taux d'épargne, coussin, ratio dette/actif) n'ont aucune garde d'entrée. Une entrée corrompue en
  amont afficherait littéralement « Santé financière : NaN/100 », sans `logError`. Pas une
  violation stricte du no-fake-data (NaN n'est pas un « 0 $ crédible »), mais un affichage cassé
  et muet. ⚠️ Défaut d'ORIGINE de `HealthIndicator.tsx` : l'extraction de `utils/healthScore.ts`
  (PR #755) l'a seulement DUPLIQUÉ vers une 2e surface d'affichage, doublant son exposition.
  ✅ **Livré lot 30** (`claude/lot-30`), gate vert (4 874 tests, 457 fichiers). Chemin MESURÉ
  avant de coder : sur 8 entrées sondées (montant de poste NaN/Infinity, soldes, prix d'actif,
  cible FIRE, dette), **une seule** contamine encore le total — `netSalary: Infinity`, que `|| 0`
  ne rattrape pas (Infinity est truthy) et que `JSON.parse` PRODUIT depuis un blob contenant
  `1e999`. Correctif : un point de passage UNIQUE `sanitizeNonFinite` sur la liste finale (donc
  couvrant aussi toute métrique AJOUTÉE plus tard) qui bascule la métrique en `available:false`
  — l'état « — » que l'UI rend déjà — au lieu d'un `?? 0` qui serait un score CRÉDIBLE inventé
  (no-fake-data), plus `logErrorThrottled` (une trace, pas N par re-rendu). Ceinture `isFinite`
  dans `computeHealthTotalScore`, qui est exporté et peut recevoir des lignes d'ailleurs.
  6 tests ; sur le code d'AVANT, 4 rougissent (dont `expected NaN to be 80`) et 2 restent verts
  par conception (anti-vacuité + non-régression des autres métriques).

- [x] **`[TEST-PERSONA-NON-DETERMINISTE]`** (S, **ÉLEVÉ en gêne d'outillage** — finding
  projection-validator MESURÉ, panel PR #755, PRÉ-EXISTANT) — `services/testTransactions.ts:42-52`
  utilise `Math.random()` NU. `couple-confort`, le persona PAR DÉFAUT, est le seul à consommer
  `generateTestTransactions()` → `calculatedStartingCash` change à CHAQUE appel. Mesuré : 5
  exécutions du MÊME code donnent 5 `finalNetWorth` distincts, amplitude **3 088,55 $** (0,028 %).
  Conséquence directe : **toute comparaison avant/après sur ce persona est impossible sans graine**
  — le panel a dû injecter un LCG pour obtenir sa preuve bit-identique. C'est le persona qu'un
  audit prend spontanément. Fix : graine injectable (le dépôt a déjà ce patron pour Monte Carlo).
  ✅ **Livré lot 30** (`claude/lot-30`), gate vert (4 874 tests, 457 fichiers). Les 5
  `Math.random()` de `services/testTransactions.ts` passent à un mulberry32 seedé, graine par
  défaut 42 (même convention que `buildPersonaTransactions`) et surchargeable. Le PRNG est
  RÉUTILISÉ depuis `services/testPersonas/transactions.ts` (désormais exporté) plutôt que
  recopié une 4e fois — et pas pris dans `services/projection/helpers.ts`, dont l'import
  tirerait `services/realEstate` dans le graphe des personas pour six lignes d'arithmétique.
  4 tests, anti-vacuité incluse (deux graines différentes DOIVENT diverger, et la variance
  intra-tirage doit survivre) ; 2 rougissent au retour à `Math.random()`.
  ⚠️ **Reste ouvert, hors périmètre du ticket** : les dates restent relatives à `new Date()`,
  donc le persona n'est pas reproductible d'un JOUR à l'autre — choix délibéré et identique
  chez son voisin (le passé reconstruit doit toucher aujourd'hui).

## 2026-08-27 — Objectif ajouté aux 4 tuiles Budget + filet de test manquant comblé

- [x] **`[BUDGET-REEL-PREVISIONNEL-OBJECTIF]`** (M) — PR #755 (lot 29), gate
  vert (4 853 tests, 453 fichiers). Cadrage (choix cliquable) : Marc a demandé l'Objectif sur les
  TROIS tuiles (Revenus/Dépenses/Restant), pas seulement Dépenses — a exigé de définir un
  « objectif de revenu » qui n'existait pas encore côté UI, résolu en réutilisant
  `fiscalBreakdown.netDisplay` (déjà calculé dans `Budget.tsx`, déjà distingué du réel
  transactionnel sous le nom « salaire déclaré »). Objectif par tuile : Revenus =
  `fiscalBreakdown.netDisplay` · Dépenses / Fin de mois (projection) = `totalBudgetDisplay` (même
  source pour les deux) · Restant = Objectif Revenus − Objectif Dépenses. `DualKPIStat` gagne une
  prop `objectif?: number` optionnelle (absente ⇒ comportement bit-à-bit identique, rétrocompat,
  aucun autre appelant à toucher). 3 tests neufs, discriminés par perturbation.
  ⚠️ **Découverte en chemin, corrigée dans le même lot** : `components/Planning.tsx` (Charges
  fixes & Abonnements) n'avait plus AUCUN test de RENDU depuis `[NAV-REMOVE-OBJECTIFS-TAB]`
  (l'unique fichier qui le montait, `PlanningGoals.test.tsx`, ciblait la section Objectifs
  retirée — la logique pure restait testée à part). Ajouté
  `tests/components/Planning.smoke.test.tsx` (rendu de base + détection heuristique d'un
  abonnement) — baseline avant la refonte `[BUDGET-CHARGES-FIXES-REFONTE]`.

## 2026-08-27 — Xetra (ETR:) et Milan (BIT:) ajoutés au routage des cours exacts

- [x] **`[INVEST-COURS-EXACT-TOUTES-ACTIONS]`** (M) — PR #755 (lot 29), gate
  vert (4 853 tests, 453 fichiers). Cause trouvée par investigation (pas de décision Marc requise
  pour le correctif principal) : `toFinnhubSymbol` (`services/marketData/providers/finnhub.ts`) ne
  convertit que 3 préfixes (NASDAQ/NYSE, TSE/TSX, EPA) vers le format Finnhub/Yahoo — tout autre
  préfixe retombe sur le ticker BRUT sans suffixe de place, que Finnhub/Yahoo ne résolvent jamais
  (silencieux, aucune erreur). `ETR:KLA` (Xetra) et `BIT:GBS` (Milan), deux positions du
  portefeuille réel de Marc, tombaient dans ce trou. `inferCurrency` (même fichier) anticipait
  DÉJÀ les suffixes `.DE`/`.MI` correspondants depuis une revue de 2026-07-15 — la table de
  routage n'avait simplement jamais été complétée avec les préfixes qui y mènent. Ajouté ETR→.DE
  et BIT→.MI dans `toFinnhubSymbol` ET `inferCurrency` (qui lit le symbole ORIGINAL avant
  conversion, donc a besoin du même cas de préfixe séparément).
  ⚠️ Portée volontairement LIMITÉE à ces deux préfixes, confirmés par les tickers RÉELS du ticket :
  Madrid/Amsterdam/Bruxelles/Lisbonne/Vienne/Dublin/Helsinki (suffixes déjà anticipés par
  `inferCurrency`) n'ont PAS de convention de préfixe vérifiée dans ce dépôt — deviner risquerait
  de router un ticker vers un AUTRE instrument, pire qu'un cours absent. `OTCMKTS:ANDXF` (ADR
  pink-sheet) reste sur le fallback ticker-brut existant : gap de couverture du forfait gratuit,
  pas un bug de routage — note ajoutée à `[INVEST-PORTFOLIO-DATA-CORRECTION]` dans `BACKLOG.md`.
  2 tests neufs (`tests/services/finnhub.test.ts`), discriminés par perturbation (revert des deux
  fonctions → les deux rougissent ; non-régression `OTCMKTS:` confirmée à part).

## 2026-08-27 — Résumé Santé condensé en tête de Futur

- [x] **`[NAV-MERGE-SANTE-FUTUR]`** (M) — PR #755 (lot 29), gate vert
  (4 853 tests, 453 fichiers). Décision Marc, confirmée par choix cliquable : « Condensé (résumé +
  lien vers le détail) » plutôt qu'un déplacement verbatim du contenu. Le sous-onglet Santé
  (Budget → Santé, jauge + 6 métriques + réglage des pondérations) reste INCHANGÉ, seule vue
  détaillée ; un nouveau composant `components/future/FutureHealthSummary.tsx` affiche, en tête de
  la page Futur, un résumé condensé (score/100 coloré + « Voir le détail → ») qui pointe vers ce
  même sous-onglet via `navigateWithFocus(Tab.BUDGET, 'sante')` — mécanisme de deep-link déjà câblé
  et testé (`BudgetWorkspace.test.tsx`), aucune nouvelle plomberie de navigation.
  Le calcul du score (6 métriques + score pondéré) a été EXTRAIT de `HealthIndicator.tsx` vers
  `utils/healthScore.ts` (source unique, comportement bit-à-bit identique — les 13 tests
  `HealthIndicator`/`BudgetWorkspace` restent verts sans modification) : le résumé condensé et la
  carte détaillée affichent désormais garanti le MÊME score, au lieu de deux calculs qui
  pourraient diverger. No-fake-data respecté : sans profil renseigné, le résumé invite à saisir le
  profil plutôt que d'afficher un score 0/100 inventé.
  ⚠️ Effet de bord découvert en testant : le nouvel import statique dans `FutureProjection.tsx`
  tire `services/portfolio.ts` (donc `logErrorThrottled`) dans l'arbre de rendu de la page — 3
  fichiers de test qui montent `<FutureProjection>` avec un mock PARTIEL de
  `services/errorLogger` (seulement `logError`) plantaient sur un actif sans devise. Mocks
  complétés (`FutureProjection.persist/.applyReveal/.eventStack.test.tsx`).
  3 tests neufs (`tests/components/future/FutureHealthSummary.test.tsx`), discriminés par
  perturbation ciblée (retrait du `onClick` → le test de deep-link rougit).

## 2026-08-27 — Retrait complet de la feature « Objectifs » (SavingsGoal)

- [x] **`[NAV-REMOVE-OBJECTIFS-TAB]`** (S→devenu M en cours de route) — PR #755 (lot 29), gate vert (4 853 tests, 453 fichiers). Décision Marc, confirmée DEUX fois : la
  1ʳᵉ réponse (« Retiré du produit ») visait l'UI ; une cartographie a montré que `savingsGoals`
  alimentait aussi `applySavingsGoalDeadlines` dans le moteur de projection (décaissement réel au
  mois de l'échéance) — Marc a confirmé vouloir retirer « VRAIMENT tout (UI + moteur) » une fois
  informé. Retiré : l'onglet Objectifs de `BudgetWorkspace`/`Planning` (le sous-onglet « Charges
  fixes & Abos » perd son `section`, ne rend plus que lui-même) ; `applySavingsGoalDeadlines` du
  moteur (`GoalDeadlineMutator` et `applyFinancialGoalDeadlines` restent intacts, seul appelant
  restant) ; les deux surfaces MCP (`mcp/server.ts` + `services/aiTools/registry.ts`, fichiers
  `upsertSavingsGoal.tool.ts`/`.spec.ts` supprimés) ; `applyDocument.ts` (case `savings_goal`,
  fonction dédiée, `DeleteItemPayload.entity` réduit à `'asset' | 'debt'`) ; `types.ts`
  (`SavingsGoal`, `AppState.savingsGoals`) ; les deux tables non typées où un champ supprimé passe
  inaperçu du typecheck (`utils/onboarding.ts` `DATA_ARRAY_KEYS`, `services/personaSanitizer.ts`
  `ARRAY_SLICES`). Le payload de backup (`BackupPanel.tsx`) garde `savingsGoals` optionnel en
  LECTURE (vieux fichiers de backup) mais ne le ré-écrit plus (rien ne le relit).
  Ordre d'exécution délibéré : UI/fixtures de test d'abord, moteur ensuite, `types.ts` en DERNIER
  pour que le typecheck serve de filet — il a effectivement rattrapé 3 sites oubliés
  (`services/testPersonas/_shared.ts`, `coupleConfort.ts`, `tests/components/Settings.test.tsx`).
  `tests/components/PlanningGoals.test.tsx` supprimé (dédié à la feature) ; le test TZ
  `[BUDGET-TRANSACTIONS-SYNC-AUDIT]` de `BudgetWorkspace.test.tsx` supprimé aussi — son sujet
  (le calcul `monthStr` local qui alimentait `actualsMap` de l'onglet Objectifs) est devenu du
  code mort par la suppression, pas juste non testé.

## 2026-08-27 — `computeGoldenSplit`/`GOLDEN_IDEAL` code mort supprimé

- [x] **`[UTIL-GOLDENSPLIT-ORPHELIN]`** (XS) — PR #755 (lot 29), gate vert (4 853 tests, 453 fichiers).
  Découvert en livrant `BUDGET-REMOVE-AMELIORER` : `computeGoldenSplit`, `GOLDEN_IDEAL` et le type
  `GoldenSplit` (`utils/budget.ts`) n'avaient plus aucun consommateur en production, seuls leurs
  propres tests les exerçaient encore (angle mort connu de `knip`, cf leçon
  `UNE-EPURATION-SE-JUGE-SUR-CE-QU-ELLE-NE-DOIT-PAS-EMPORTER`). Confirmé supprimable (recommandé
  et choisi par Marc plutôt que re-brancher) : bloc `[PH4-B]` retiré de `utils/budget.ts` et ses
  5 tests dédiés de `tests/utils/budget.test.ts`.

## 2026-08-27 — Un doublon bénin (recouvrement) distingué d'un doublon intra-lot suspect

- [x] **`[FINTABLE-DOUBLON-INTRALOT-SILENCIEUX]`** (M) — PR à venir (branche `claude/lot-29`),
  gate vert (4 871 tests). Finding financial-integrity (PR #754), routé au `BACKLOG.md` puis
  traité ici. `applyBankStatement` (`mcp/ingest/applyDocument.ts`) fusionnait par la clé
  `date|montant|payee` sans distinguer un doublon contre l'EXISTANT (recouvrement légitime,
  bénin) d'un doublon INTRA-LOT (deux lignes DISTINCTES du même lot entrant — le plus souvent
  deux vraies dépenses identiques le même jour, dont une seule écrite SANS avertissement).
  Mesuré : 8,50 $ de dépense réelle perdue en silence, `cashAnchorDelta` absorbe l'écart (total
  de liquidités juste, ventilation budget/historique faussée).
  `existingKeys`/`seenThisLot` séparés au lieu d'un seul `seen` ; nouveau champ optionnel
  `ApplyResult.dupIntraLotCount`, nouvelle phrase de résumé distincte ; `applyPayloadsIsolated`
  pousse un avertissement SÉPARÉ dans `SystemView` quand `dupIntraLotCount > 0`. `mcp/README.md`
  mis à jour (nouveau champ + note corrigée sur les doublons). 4 tests neufs, chaque correctif
  discriminé par perturbation ciblée.

## 2026-08-26 — Les lignes rejetées d'un relevé bancaire deviennent visibles à la sync automatisée

- [x] **`[MCP-REJECTIONS-NON-STRUCTUREES]`** (M) — PR #754, gate vert (4 867 tests). Finding
  silent-failure-hunter (PR #753) : `applyBankStatement` (`mcp/ingest/applyDocument.ts`) rejette
  des lignes (montant aberrant, date invalide, ligne incomplète) SANS lever — seulement une
  phrase dans `ApplyResult.summary`, jamais lue par le chemin de sync automatisé
  (`services/fintable/syncCore.ts` `applyPayloadsIsolated`, qui ne destructure que
  `nextState`/`changes`). Une sync quotidienne qui recevait 10 lignes dont 5 rejetées écrivait
  bien les 5 valides sans qu'aucun signal n'apparaisse nulle part (ni `SystemView`, ni log).
  Nouveau champ optionnel `ApplyResult.rejectedCount` (montant aberrant + date invalide + ligne
  malformée, PAS les doublons) ; `applyPayloadsIsolated` pousse un avertissement dans `warnings`
  (déjà affiché par `SystemView`) quand `rejectedCount > 0`. 3 tests neufs, discriminé par
  perturbation ciblée.
  ⚠️ Panel `/review-all` (3 agents), même PR : `code-reviewer` a demandé un test verrouillant que
  DEUX documents `bank_statement` dans le même lot produisent DEUX avertissements distincts (ajouté).
  `financial-integrity`, MESURÉ : le commentaire justifiant l'exclusion de `dupCount` affirmait
  qu'un doublon est « attendu d'une sync à fenêtres chevauchantes » — FAUX sur le seul chemin qui
  lit le champ (la bascule anti-doublon écarte déjà ce cas en amont, 0 collision mesurée sur 60
  jours) ; réécrit pour dire ce qui est vérifié : un `dupCount` survivant y désigne surtout une
  collision INTRA-lot. Décision inchangée, seule sa justification était fausse. Défaut préexistant
  routé au `BACKLOG.md` (`[FINTABLE-DOUBLON-INTRALOT-SILENCIEUX]`) : deux dépenses réelles
  identiques le même jour se fusionnent en silence (8,50 $ mesurés).

## 2026-08-26 — 4 bugs préexistants routés par le panel de PR #752, corrigés séparément

- [x] **`[BUDGET-DUPCOUNT-MESSAGE-FAUX]`** (XS) — PR #753, gate vert (4 863 tests). Le résumé de
  `applyBankStatement` (`mcp/ingest/applyDocument.ts`) annonçait toujours littéralement « 0
  doublon(s) ignoré(s) » même quand `dupCount === 0`, au lieu de l'omettre. Construction du résumé
  réécrite en phrases nues jointes par `, ` (plus de virgule orpheline possible).
- [x] **`[BUDGET-CUSTOM-PLAGE-INVERSEE]`** (S) — PR #753. `getDateRange()` CUSTOM
  (`components/Budget.tsx`) ne gérait pas une plage inversée (fin saisie avant début) :
  `civilDaysBetween` fait `Math.abs` (« prévu » positif) mais le filtre par chaîne ne matchait
  jamais rien (« réel » toujours 0 $). Les deux bornes sont maintenant permutées silencieusement.
  ⚠️ Finding panel (MOYEN) : le libellé de période envoyé au chat IA gardait les dates BRUTES
  (ordre saisi) pour une plage inversée, incohérent avec les montants sur la plage permutée —
  aligné sur `getDateRange()`.
- [x] **`[BUDGET-RENAME-ECRIT-A-CHAQUE-FRAPPE]`** (S) — PR #753. Renommer un poste de budget
  écrivait à chaque frappe (`onChange`) : jusqu'à 5 réécritures complètes de `transactions`
  (persist + push Drive) et 5 toasts pour « Resto » → « Restaurant ». Propagation débouncée
  (500 ms), le nom de départ étant figé dès la 1ʳᵉ frappe de la session (pas la valeur
  intermédiaire de la frappe précédente).
  ⚠️ **Ce débounce était lui-même cassé**, trouvé par le panel `/review-all` — **CRITIQUE**
  (code-reviewer + silent-failure-hunter, indépendamment) : les refs de debounce étaient clées par
  `index` POSITIONNEL (recalculé à chaque render), pas par `item.id` stable — supprimer un poste
  pendant qu'un AUTRE poste (qui hérite de son index) est en renommage pouvait corrompre la
  catégorie du mauvais poste. Reclé sur `item.id` ; la suppression annule/flushe tout renommage en
  vol pour le poste supprimé. **2 ÉLEVÉ** : nettoyage au démontage qui annulait sans flusher (perte
  silencieuse d'un renommage tapé juste avant de changer d'onglet) ; timer capturant `transactions`
  par fermeture (écriture concurrente écrasée au flush) — corrigés (flush au démontage,
  `transactionsRef` toujours à jour). 4 tests neufs de plus.
- [x] **`[MCP-JSDOC-APPLYDEBT-NON-FERME]`** (XS) — PR #753. JSDoc `[DEBT-MCP-PARITE]`
  (`mcp/ingest/applyDocument.ts`) sans `*/` de fermeture, avalait le JSDoc suivant
  (`inferDebtCategory`). Fermeture ajoutée.
  7 tests neufs au total (3 + 4 du panel), chaque correctif comportemental re-discriminé par
  perturbation ciblée. 1 finding hors-scope (compteurs de rejet MCP non structurés) routé au
  `BACKLOG.md` (`[MCP-REJECTIONS-NON-STRUCTUREES]`).

## 2026-08-26 — Audit sync Budget ↔ Transactions : 4 défauts trouvés et corrigés

- [x] **`[BUDGET-TRANSACTIONS-SYNC-AUDIT]`** (M) — PR #752 (`claude/lot-29`), gate vert (4 856
  tests). Ticket ouvert (« Marc n'est pas sûr que Budget s'adapte correctement à Transactions »),
  sans hypothèse précise. Audit `financial-integrity` (lecture seule, mesures réelles) : 6 pistes
  vérifiées SAINES (store partagé, comptes, devises, bornes Mois/Trimestre/Année, dépendances des
  `useMemo`, détection des catégories orphelines), 4 défauts confirmés et corrigés, 3 décisions
  produit routées à Marc (`docs/A_FAIRE_MOI.md`).
  Corrigé : **(1)** `utils/budget.ts` — un nom de poste vide matchait N'IMPORTE QUELLE catégorie
  via `fuzzyNameMatch` (`''.includes(x)` faux mais `x.includes('')` vrai) ; un poste vidé
  absorbait un autre poste sans rapport. **(2)** `components/Budget.tsx` — vider le nom d'un poste
  (input contrôlé, écrit à chaque frappe) orphelinait ses transactions SANS retour possible
  (retaper le nom ne redéclenchait plus la garde de rename, `oldItem.name` devenu `''` = falsy) ;
  refusé à l'écriture. **(3)** `components/Budget.tsx` — le multiplicateur Custom comptait les
  jours civils EXCLUSIFS (`civilDaysBetween`) alors que la fenêtre de sélection est INCLUSIVE des
  deux bornes ; le « prévu » était sous-estimé de ~3 % sur un mois plein (jusqu'à +204 % sur 1
  jour, via le plancher 0,1). **(4)** `mcp/ingest/applyDocument.ts` +
  `mcp/tools/applyBankStatement.spec.ts` — la date d'une transaction MCP n'était validée ni au
  format ni au calendrier (un LLM produit spontanément `31/07/2026`/`2026-7-15`/`2026-02-30` pour
  la même date, comptées différemment par le grand livre) ; ceinture Zod + garde runtime, comme
  `applyDebt`.
  Routé (`docs/A_FAIRE_MOI.md`) : un Interac reçu doit-il être un revenu ou un crédit sur poste
  (`[TX-INTERAC-BUDGET]`, code mort côté producteurs) ; le grand livre doit-il compter les retours
  marchands/remboursements d'impôt en revenus (écart mesuré 11,7 % sur une fixture) ; les impôts
  payés doivent-ils avoir un poste budget (écart d'assiette mesuré 44 %, conseil du panneau Parité
  auto-annulé sinon).
  Chaque correctif discriminé par revert CIBLÉ (single-line), pas par `git stash` pleine page.
  Panel `/review-all` (4 agents) sur le même lot : 2 ÉLEVÉ (`silent-failure-hunter` — refus de nom
  vide 100 % silencieux ; lignes MCP incomplètes non comptées dans le résumé), 1 MOYEN RÉEL
  (`financial-integrity` — le plancher `Math.max(0.1, …)` de `getMultiplier()` avait perdu sa
  raison d'être avec le `+1` et écrasait les plages de 1 à 3 jours vers la même valeur, jusqu'à
  +204 % d'erreur sur 1 jour ; retiré), 2 FAIBLE durcis (`fuzzyNameMatch` sur un nom fait
  d'espaces ; libellé du nouveau compteur de rejet MCP). 4 bugs préexistants découverts en chemin,
  non corrigés, routés au `BACKLOG.md`.
  12 tests neufs au total.

## 2026-08-26 — Le revenu du 1er du mois disparaissait sous un fuseau négatif

- [x] **`[BUDGET-INCOME-WINDOW-UTC-OFFBYONE]`** (XS, découvert en diagnostiquant `BUDGET-PREVU-BUG`)
  — PR #751, gate vert. `incomeBreakdown` (`components/Budget.tsx`) comparait `new Date(t.date)`
  (ancré UTC minuit) à `start`/`end` (ancrés en heure LOCALE) — sous un fuseau négatif
  (`TZ=America/Toronto`, mesuré), ça excluait le 1er jour de la période. Invisible en CI (conteneur
  en UTC, leçon `UN-CONTENEUR-EN-UTC-NE-PEUT-PAS-DEPARTAGER-LOCAL-ET-UTC`).
  Fix : `getDateRangeStrings()` (nouveau helper, comparaison par CHAÎNE `YYYY-MM-DD` comme le filtre
  des dépenses) + `toLocalDateStr()` (jour LOCAL, jamais un aller-retour `.toISOString()` qui décale
  la fin de période d'un jour sous un fuseau négatif — bug JUMEAU trouvé en écrivant le fix, déjà
  présent dans le filtre des dépenses). Le bloc `CUSTOM` de `getDateRange()` avait le MÊME défaut à
  la source (`new Date(customStart)` ancré UTC) — corrigé avec `parseLocalDateStr()`, sans quoi
  `toLocalDateStr` aurait décalé la plage personnalisée d'un jour dans l'autre sens.
  2 tests neufs sous `TZ=America/Toronto`, 2 perturbations confirmées (l'une sur le fix principal,
  l'autre en isolant SEULEMENT le correctif `CUSTOM` — chacune rougit sur son propre défaut).
  Panel `/review-all` a trouvé 3 défauts JUMEAUX de plus, corrigés dans le même lot :
  `code-reviewer` (ÉLEVÉ) — les valeurs par défaut du champ Custom ET le libellé des 6 mois de
  tendance utilisaient encore `.toISOString()`, cassant sous un fuseau POSITIF (Europe/Asie/
  Australie) ; `financial-integrity` (MOYEN) — `getMultiplier()` Custom comptait un delta de
  millisecondes faussé de ±1 h par un changement d'heure (mesuré +3,45 % sur un budget cible),
  remplacé par un compte de jours CIVILS (`civilDaysBetween`). Les trois helpers déplacés en
  fonctions MODULE (utilisés dès l'initialisation des `useState`). 2 tests neufs de plus (dont un
  sous `TZ=Australia/Sydney`, fuseau positif).

## 2026-08-26 — Un remboursement DOUBLAIT l'erreur au lieu de la corriger

- [x] **`[BUDGET-CATEGORY-INCOME-SIGN]`** (M) — PR #749, gate vert.
  Mesuré avant de conclure : `computeBudgetParity`/`computeActualByOwner` (`utils/budget.ts`)
  agrégeaient une ligne à crédit (« Remboursement », `CREDIT_BACK_CATEGORIES`) avec `Math.abs`
  au lieu de `spendAmountOf` (déjà correct ailleurs, `utils/spendRules.ts`) — un remboursement de
  250 $ sur une sortie de 400 $ affichait **650 $** de « versé ce mois » (objectifs Planning) au
  lieu de **150 $** : le crédit était ADDITIONNÉ, pas DÉDUIT. Erreur = 2× le crédit.
  Fix : `spendAmountOf(t)` dans les deux fonctions. Sans effet sur `Budget.tsx` (tableau principal,
  répartition par conjoint, tendance 6 mois) qui pré-filtre `amount < 0` en amont — ces trois-là
  restent donc dans leur comportement actuel (crédit invisible, ni ajouté ni déduit), une
  incohérence avec `monthlyActualsMap` routée à Marc (`docs/A_FAIRE_MOI.md`) plutôt que tranchée
  seule : uniformiser changerait pour la première fois les montants du tableau principal.
  1 test neuf, perturbation confirmée (rouge à 650 $ sur le code d'avant). Panel `/review-all` :
  `code-reviewer` (MOYEN) a trouvé qu'un poste à crédit peut désormais afficher un net NÉGATIF
  (« Versé ce mois : −150 $ ») — clampé à 0 $ à l'affichage dans `Planning.tsx` avec une note
  explicative, jamais au calcul ; `financial-integrity` (FAIBLE) a confirmé le fix par mesure
  directe et fait corriger la JSDoc de `OrphanCategory`/`ActualByOwner`/`computeBudgetParity`
  (NETS signés, plus des valeurs absolues). 2 tests neufs de plus.

## 2026-08-26 — Le mutex cross-onglet de lot 16 ne mutex-ait rien, en vrai navigateur

- [x] **`[FINTABLE-SYNC-XTAB-MANUEL]`** (M → devenu bien plus large) — PR #747, gate vert.
  Parti d'une extension de routine (`withCrossTabLock` généricisé pour que le bouton manuel
  partage le verrou de la passe auto), et tombé sur un bug de PRODUCTION dans le mécanisme de
  lot 16 (`[FINTABLE-SYNC-XTAB-MUTEX]`) lui-même : sous `ifAvailable: true`, la spec Web Locks
  (vérifiée par recherche web, 3 sources) dit que le rappel est TOUJOURS invoqué, avec
  `lock === null` quand le verrou est pris ailleurs — jamais sauté. Le code de lot 16 croyait
  l'inverse (commenté ET testé comme tel) et ignorait ce paramètre, exécutant `run()`
  inconditionnellement. **En navigateur réel, la mutex ne bloquait donc rien** : deux onglets en
  collision pouvaient écraser un solde/dette avec des données périmées, exactement le risque que
  ce verrou devait éliminer. Le test de lot 16 ne l'a jamais vu car son mock encodait la même
  croyance fausse que le code qu'il couvrait.
  Fix aux DEUX endroits : `withCrossTabLock<T>(run, onBusy)` vérifie maintenant `lock === null`
  DANS le rappel (jamais la valeur de retour de `request()`, ambiguë avec un `run()` qui résout
  légitimement `undefined` — finding CRITIQUE `code-reviewer` sur ce point précis), et
  `tests/services/fintable/autoSyncXtabLock.test.ts` corrigé pour appeler `cb(null)` au lieu de
  sauter le rappel. Rejet de `locks.request` maintenant journalisé puis re-levé (finding ÉLEVÉ
  `silent-failure-hunter`). `handleSync` enveloppe désormais tout son corps du même verrou (garde
  intra-onglet incluse, `UN-VERROU-DOIT-ENVELOPPER-LA-GARDE-PAS-SEULEMENT-LE-TRAVAIL`).
  5 tests neufs (dont le cas `undefined` qui aurait laissé filer la régression), 2 corrigés.
  Leçon dans `docs/CONVENTIONS.md` : un contrat d'API tiers commenté ET testé n'est pas une preuve.

## 2026-08-25 — Le partage d'un bien détenu au divorce est enfin couvert par un test

- [x] **`[TEST-DIVORCE-SANS-IMMOBILIER]`** (S) — PR #748, gate vert (recréée après un blocage
  d'infrastructure GitHub Actions sur la PR #745 d'origine, fermée sans merge — voir
  `docs/A_FAIRE_MOI.md`). Trou de couverture routé par #737 : les 16 fixtures de divorce portaient
  `realEstateGoals: []`.
  **Le mécanisme est SAIN, mesuré avant d'écrire** : à 50 %, équité ×0,5047 et intérêt suivant
  ×0,5000 ; à 75 %, ×0,2523 / ×0,2500. Le lot ne corrige rien — il verrouille.
  4 tests (`tests/services/divorceImmobilier.test.ts`), fixture réutilisable « ménage
  propriétaire », **3 perturbations rouges** : partage immobilier retiré (l'état d'avant #735) → 3 ;
  `keep` inversé sur l'immobilier → 2 (grâce au discriminant à 75 %) ; fixture sans `isActive` → 4
  (le bien disparaît, `NaN`). L'assertion la plus forte : l'INTÉRÊT du mois suivant, qui prouve que
  le partage atteint l'état du moteur et pas seulement l'affichage.

## 2026-08-25 — Le divorcé payait la mensualité ENTIÈRE sur une hypothèque de moitié

- [x] **`[ENG-DIVORCE-PMT-NON-PARTAGEE]`** (S) — PR #737, gate vert.
  Le défaut est réel : le partage divisait `currentValue` et `mortgage` de chaque bien, jamais
  `calculatedPmt`. **Les DEUX prédictions du ticket sont fausses**, et chacune a appris quelque chose.
  1. « Re-basera des goldens » → **zéro golden n'a bougé**, sur un correctif qui déplace le
     patrimoine final de dizaines de milliers de dollars. Cause mesurée : **les 16 fixtures de
     divorce du dépôt portent `realEstateGoals: []`** (routé : `[TEST-DIVORCE-SANS-IMMOBILIER]`).
  2. « le prêt s'amortit ~2× trop vite » → seulement pendant **48 mois**. Le renouvellement
     hypothécaire recalcule la mensualité sur le solde réel et ré-ancre tout : mois de solde nul
     **239 dans les deux cas**. Reste le vrai dégât : **56 121 $ de sur-paiement** sur la fenêtre
     (1 169,18 $/mois que le divorcé ne doit plus).
  3. ⚠️ **Le patrimoine final BAISSE avec le correctif**, et le signe change avec le rendement
     (30 ans, correctif − défaut) : 3 % −93 546 $ · 5 % −82 643 $ · 6 % −66 989 $ · 8 % −20 351 $ ·
     10 % **+54 003 $**. Le défaut équivaut à un désendettement FORCÉ au taux de l'hypothèque (5 %) ;
     le signe est une propriété de l'écart de taux, pas un argument sur la justesse. Ce qui tranche :
     le chemin LOCATIF, trois lignes plus bas dans le même bloc, partage DÉJÀ sa mensualité.
  5 tests (`tests/services/divorcePmtPartagee.test.ts`), **3 perturbations, 3 rouges chacune**.
  Aucun montant ancré : les gardes visent la RELATION (rapport mensualité/solde = l'échéancier).
  Chemin DÉCÈS vérifié : rien à partager, le survivant hérite. Leçon :
  `LE-SIGNE-D-UN-CORRECTIF-PEUT-DEPENDRE-D-UN-ECART-DE-TAUX`.
## 2026-08-25 — La sync bancaire auto se verrouille enfin ENTRE ONGLETS

- [x] **`[FINTABLE-SYNC-XTAB-MUTEX]`** (S, sœur de `STALE-BASE`) — PR #736, gate vert.
  Le ticket : « le cooldown localStorage n'est PAS un mutex cross-onglet ». **Vérifié EXACT** —
  `applyDocument` déduplique bien sur `date|montant_en_cents|payee_minuscule`, donc le risque est
  bien l'intégrité (dernier écrivain du solde) et non le doublon.
  Ce que le ticket ne disait pas, et qui change le correctif : le verrou existant `_inFlight` est
  commenté « verrou **PARTAGÉ** auto ↔ manuel » — partagé entre les deux CHEMINS d'un onglet, pas
  entre onglets (variable de module). Et la course n'est pas le réseau : `localStorage` n'a pas de
  compare-and-swap, donc `readLastAttempt()` puis `writeLastAttempt(now())` laissent deux onglets
  lire le même vieil horodatage et passer tous les deux la garde. La fenêtre est la plus large
  exactement quand elle compte — un navigateur qui restaure deux onglets épinglés les démarre
  ensemble.
  Livré : `withCrossTabLock` (API Web Locks, `ifAvailable: true` = on renonce au lieu d'attendre)
  enveloppant **toutes** les gardes, cooldown compris ; verrou nommé `financeai:fintable-sync` ;
  repli EXPLICITE quand l'API manque (jsdom, navigateurs anciens, contexte non sécurisé) — un
  verrou qui bloque tout serait pire que le défaut.
  3 tests (`tests/services/fintable/autoSyncXtabLock.test.ts`), **5 perturbations rouges sur 5**,
  dont le cooldown remis HORS du verrou. Leçon :
  `UN-VERROU-DOIT-ENVELOPPER-LA-GARDE-PAS-SEULEMENT-LE-TRAVAIL`.

## 2026-08-25 — Le partage du divorce publie enfin ses flux

- [x] **`[ENG-DIVORCE-FLUX-MUET]`** (S) — PR #739, gate vert. Ticket CONFIRMÉ.
  Le callback de partage multipliait sept pools par `keep` sans publier le moindre flux. Résiduel de
  forme-flux mesuré AU MOIS DU DIVORCE (fixture MC déterministe, partage 50 %) : **CELI 119 007,53 $ ·
  REER 91 679,66 $ · Crypto 15 599,16 $ · Liquidités 12 492,83 $ · REEE 9 088,89 $ · CELIAPP 6 635,66 $**.
  Après : 0,01 $ (arrondi au cent).
  ⚠️ **Le ticket nommait QUATRE comptes** ; six sont touchés — `CELIAPP` et `REEE` n'y figuraient pas,
  et `nonReg` (qui y figurait) est resté **à zéro sur les 360 mois**, donc déclaré exclu avec sa mesure.
  ⚠️ **Pourquoi la garde forme-flux existante ne voyait rien** : elle tourne en DÉTERMINISTE, et
  `tryDivorce` exige `enableMonteCarlo`. Invariant juste, aveugle à une branche entière.
  ⚠️ **Ne déplace AUCUN argent** — vérifié bit-identique (patrimoine final 331 014,12 $, REER final
  175 685,09 $, CELI final 113 506,31 $). `withdrawalREER` a un second consommateur (`stepReerByUser`),
  d'où une exclusion `divorceReerWithdrawalMois` — **inerte aujourd'hui** (`reerByUser` est consolidé
  à `[reer, 0]` et `reconcileToPool` ramène à `poolEnd`), écrite comme telle dans le code.
  5 tests, **3 perturbations rouges sur 3**. Leçon :
  `UN-PARTAGE-A-50-POURCENT-NE-DISTINGUE-PAS-KEEP-DE-SON-COMPLEMENT` — à 50 %, `keep` et `1 − keep`
  sont indiscernables ; publier la part CONSERVÉE laissait le test à 50 % VERT.
  Découvertes routées : `[ENG-CELIAPP-TRANSFERT-FLUX-MUET]`, `[ENG-LIQUID-FLUX-FORM]`.
## 2026-08-25 — La bannière « Drive déconnecté » ne ment plus au chargement

- [x] **`[BUDGET-DRIVE-BANNER-FLASH]`** (S) — PR #738, gate vert.
  Le mot « brièvement » du ticket cachait la mesure : la fenêtre fait au moins **2 500 ms**, et elle
  est écrite en toutes lettres dans `App.tsx` (`initSync` publie `configured: true`, puis
  `setTimeout(() => { void runBootSync(); }, 2500)`). Ce n'est pas une course de rendu.
  Le fond : **`connected: false` recouvrait deux faits OPPOSÉS** — « on a essayé et on n'est pas
  connecté » et « on n'a pas encore essayé ». La bannière lisait le second comme le premier et
  affirmait « tes changements ne sont PAS sauvegardés » alors que c'était faux.
  Livré : un champ `resumeSettled` qui pose la question que `connected` ne pose pas, posé dans un
  `finally` (`runBootSyncTick` a SEPT sorties, `gateSilentResume` six) et `true` **d'entrée** quand
  il n'y a rien à reprendre — un appareil jamais connecté voit l'invitation TOUT DE SUITE, comme Marc
  l'a demandé. Deux pièges constatés : `initSync` est appelé DEUX fois au boot (d'où la monotonie), et
  l'état de module survit d'un test à l'autre (d'où `_resetSyncStatusForTests`).
  9 tests, **5 perturbations rouges sur 5**, chacune isolant sa garde. Leçon :
  `UN-DEFAUT-QUI-RECOUVRE-DEUX-FAITS-OPPOSES-SE-CORRIGE-EN-LES-SEPARANT`.

## 2026-08-25 — La fermeture du CELIAPP publie enfin ses deux flux

- [x] **`[ENG-CELIAPP-TRANSFERT-FLUX-MUET]`** (S) — PR #741, gate vert. Ticket que j'avais routé la
  veille en livrant `[ENG-DIVORCE-FLUX-MUET]` : trouvé par le balayage d'horizon, pas cherché.
  À la fermeture du CELIAPP (15 ans, ou 71 ans), `reer += X; celiapp = 0;` ne publiait aucun flux →
  forme-flux violée des DEUX côtés du MÊME montant, **10 470,25 $ au mois 168**. Après : 0,01 $.
  ⚠️ **L'avertissement que j'avais écrit moi-même était FAUX** : `contribREER` n'alimente PAS
  l'exclusion de croissance de mi-mois (`growthApplication` l'applique à `contribNonReg`/`contribREEE` ;
  le REER passe par `prevREER`). Vérifié dans la source avant de livrer.
  ⚠️ **Ne déplace aucun argent** : patrimoine et REER finaux identiques au centième, `reerByUserFinal`
  identique à ~3 × 10⁻¹⁰ $ près, y compris sur un couple 10:1 (choisi exprès — un couple équilibré ne
  distinguerait pas deux répartitions).
  4 tests, **4 perturbations** isolant chacune son côté (aucun flux → 3 rouges ; REER seul → 3 ;
  CELIAPP seul → 2 ; MOITIÉ du montant → 2). Leçon :
  `UN-REGISTRE-RECONCILIE-A-UNE-CLE-REND-SES-FLUX-DECORATIFS`.
  Découverte routée : `[ENG-REERBYUSER-FLUX-DECORATIF]`.
## 2026-08-25 — La section « Améliorer mon budget » est retirée

- [x] **`[BUDGET-REMOVE-AMELIORER]`** (S) — PR #740, gate vert. Demande directe de Marc.
  ⚠️ **Vérifié AVANT de couper** : le bouton « Diagnostic » de la carte avait un JUMEAU dans la barre
  de pilotage du même onglet. Le diagnostic IA ne part donc PAS avec la carte — elle n'en portait
  qu'un doublon. La garde l'exige explicitement : **exactement UN** bouton « Diagnostic » après coup
  (le doublon parti ET la fonction restée).
  Disparaissent réellement, et c'était uniques : le donut théorique 50/30/20, la « répartition
  réelle » et le comparatif Réel · Cible · Idéal.
  **Bundle mesuré** sur build PROPRE : `BudgetWorkspace` **86 865 → 81 251 octets** (−5 614, −6,5 %),
  `dist` total −5 489. ⚠️ Le chunk `recharts` est **identique au octet près** (404 617) : d'autres
  écrans l'importent encore — ce n'est pas une victoire de dépendance, et le dire autrement aurait
  été un chiffre inventé.
  3 tests, **3 perturbations** (carte restaurée → 3 rouges ; import Recharts réintroduit → 1 rouge ;
  mention en COMMENTAIRE → reste vert). Leçon :
  `UNE-EPURATION-SE-JUGE-SUR-CE-QU-ELLE-NE-DOIT-PAS-EMPORTER` — dont : **`knip` est aveugle au code
  dont le seul consommateur est son propre test** (routé : `[UTIL-GOLDENSPLIT-ORPHELIN]`).

## 2026-08-25 — Après un divorce, la moitié de la mise de fonds s'évaporait à l'achat

- [x] **`[ENG-DIVORCE-SCALE-UNBOUGHT]`** — le ticket était marqué **« [À vérifier] — finding non
  vérifié par perturbation »** et classé FAIBLE. Vérifié : le chemin est réel, et le dégât n'est pas
  celui qu'il annonçait.
  Au divorce, le `.map` de partage divisait `currentValue` et `mortgage` de **tous** les biens, y
  compris ceux pas encore achetés. Or pour un bien futur, ces deux champs ne sont pas des actifs du
  couple : ce sont les **paramètres semés** de l'achat à venir (`price` et `price − downPayment`),
  que `realEstateMonth` consomme tels quels (`const p = pState.mortgage`).
  **MESURÉ** (achat 500 000 $, mise de fonds 100 000 $, `keep` = 0,5) :

  | | sans divorce | après divorce |
  |---|---|---|
  | Cash sorti | 105 000 $ | **105 000 $ — identique** |
  | Valeur du bien | 500 000 $ | 250 000 $ |
  | Hypothèque | 399 328 $ | 199 664 $ |
  | **Équité obtenue** | 100 672 $ | **50 336 $** |

  Le ticket annonçait « un principal réduit de moitié » ; le vrai dégât est sur l'**équité**. Le
  débit vient du BUT (`goal.downPayment`), l'actif vient de l'ÉTAT — **deux sources pour une même
  opération**, et le divorcé paie plein tarif pour un demi-bien.
  Correctif : ne partager que `p.isBought`. 3 tests, **2 perturbations rouges** (garde retirée du
  vrai code · plus rien n'est partagé).
  ⚠️ La reproduction locale du `.map` dans le test ne prouve QUE la conséquence — un test qui
  contient une expression ressemblant au code testé teste sa copie. Le câblage réel est vérifié par
  un scan de source ancré sur l'**initialiseur** du `.map`, pas sur le fichier « quelque part ».
  Livré 2026-08-25 · PR #735.

## 2026-08-25 — Le meltdown REER vidait 1,85 M$ sans publier un seul flux

- [x] **`[ENG-NETTRANSFER-REER-INCOMPLET]`** — le ticket disait « ne voit ni FERR ni meltdown, écart
  cumulé 330 353 $ ». **RE-MESURÉ : la moitié FERR était déjà fermée** par
  `[ENG-FERR-NETTRANSFER-MUET]` (2026-08-19) ; la moitié MELTDOWN était ouverte, et **5,6× pire que
  le chiffre du ticket**.
  **MESURÉ sous la stratégie `MELTDOWN_REER`** : le solde REER chutait de 34 794 $ en un mois pour
  **802 $** de flux publiés (pire résiduel **35 596,32 $**), soit **1 849 080,59 $** d'écart cumulé
  entre `RetraitREER` (affichage) et `ContribREER − NetTransferREER` (transferts) sur 156 mois.
  Après correctif : **0,10 $**.
  ⚠️ **Pourquoi la garde existante ne l'a jamais vu** : le test `[ENG-FERR-NETTRANSFER-MUET]` nomme
  exactement le bon invariant — les deux registres du retrait REER doivent dire la même chose — mais
  sa fixture ne demande pas la stratégie `MELTDOWN_REER`, et le meltdown ne s'exécute QUE sous cette
  stratégie. Invariant juste, nommé, testé, et aveugle à un chemin entier.
  ⚠️ **Le registre per-conjoint ne subit PAS le traitement de la FERR** : la FERR est exclue de
  `stepReerByUser` parce qu'elle sort de la part EXACTE de chaque conjoint (facteur RRIF de SON âge) ;
  le meltdown est attribué AU PRORATA (`addByWeights`), donc le soustraire au prorata est la MÊME
  règle, pas une seconde. Vérifié : les goldens per-conjoint ne bougent pas.
  ⚠️ **La jambe d'ARRIVÉE est délibérément LAISSÉE muette** → `[ENG-MELTDOWN-JAMBE-ARRIVEE]`.
  `contribNonReg` pilote l'exclusion de croissance de mi-mois, donc la publier déplace de l'argent :
  **−5 045,04 $** de patrimoine final mesuré, et **deux goldens « NEUTRALITÉ NW » rougissent**. La
  correction paraît juste (de l'argent arrivé le 15 ne devrait pas toucher un mois plein de
  croissance) mais elle contredit un invariant explicite posé avec sa preuve — c'est une décision,
  pas un correctif. Le résiduel restant est BORNÉ par le test pour qu'il ne grandisse pas en silence.
  1 test, **2 perturbations rouges** (jambe muette · publication partielle). Livré 2026-08-25 · PR #733.

## 2026-08-25 — Le renouvellement hypothécaire annonçait un changement qui n'a jamais lieu

- [x] **`[ENG-RENEWAL-M0]`** — ⚠️ **caduque, remplacé par `[ENG-RENEWAL-CHOC-MORT]`.** Sa prémisse
  est exacte (un bien détenu depuis un multiple exact de 60 mois renouvelle dès le mois 0) mais sans
  conséquence : le renouvellement est LOGGÉ, et avec un choc de taux nul il ne change ni le PMT ni le
  taux. Le « PMT −240 $ mesuré » du panel supposait un choc non nul.
  **Ce que la mesure a trouvé à la place** : le choc de taux au renouvellement est dérivé du PREMIER
  CARACTÈRE de l'identifiant du bien — `((id.charCodeAt(0) % 3) - 1) * 0,015` — et **il vaut ZÉRO
  partout dans le dépôt**. L'UI crée `prop_<timestamp>` ('p' → 112, 112 % 3 = 1 → nul), les fixtures
  utilisent `p1`, les personas `jc-re1` ('j' → 106 → 1). Aucune propriété atteignable par un
  utilisateur n'a jamais vu son taux bouger au renouvellement.
  **Livré ici, et rien de plus** (zéro dollar déplacé) : le message ne dit plus « nouveau taux
  5,00 % » quand l'ancien était 5,00 % — il dit « taux inchangé ». Affirmer un changement qui n'a pas
  eu lieu viole le no-fake-data ; le renouvellement, lui, a bien eu lieu, donc l'événement reste.
  ⚠️ **Le mécanisme n'est PAS réveillé** : le rendre vivant déplacerait de l'argent sur toute
  projection avec hypothèque ET exposerait `[ENG-RENEWAL-RATE-MISMATCH]` (l'intérêt reste calculé à
  l'ancien taux). Deux décisions qui appartiennent à Marc → `[ENG-RENEWAL-CHOC-MORT]`.
  ⚠️ **Portée de `[ENG-RENEWAL-RATE-MISMATCH]` corrigée au passage** : il annonce « frappe tout
  achat » ; mesuré, il ne frappe rien tant que le choc est nul. Bug réel, correctif juste,
  inatteignable aujourd'hui — les deux tickets se livrent ensemble.
  2 tests, **2 perturbations rouges** (message inconditionnel · branche vivante tuée).
  Livré 2026-08-25 · PR #732.

## 2026-08-25 — Une croissance immobilière de 0 % était inexprimable, y compris dans son propre éditeur

- [x] **`[ENG-PROPGROWTH-ZERO-INEXPRIMABLE]`** — `(goal.propertyGrowthRate || 3)` transformait un 0
  explicite en 3 %/an. **MESURÉ, et le ticket sous-estimait la portée dans un sens et la
  surestimait dans l'autre.**
  **Cinq sites**, pas un : le moteur (`realEstateMonth`), l'initialisation d'un achat passé
  (`pastPurchaseInit`), deux écrans (`RealEstateWorkspace`, `MultiPropertyComparison`) — et
  **`PropertyConfigurator`, l'éditeur lui-même** : taper 0 réaffichait 3. La valeur n'était pas
  seulement ignorée par le calcul, elle était invisible à qui venait de la saisir.
  ⚠️ **Deux sites voisins étaient DÉJÀ corrects** (`?? 3` dans la reconstruction d'équité, un
  paramètre par défaut dans `services/realEstate.ts`, `num(v, 3)` dans `rentalMonth`) — le patron
  juste existait à côté (`PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`).
  ⚠️ **NEUF tests déclaraient `propertyGrowthRate: 0`** et tournaient donc à 3 % depuis toujours.
  Un seul l'avait senti sans le nommer : son assertion était une FOURCHETTE « + ≤1 mois de
  croissance » posée sur une fixture qui dit 0. La fourchette ABSORBAIT le défaut ; elle est
  redevenue une égalité exacte.
  ⚠️ **Le ticket annonçait « touche tous les scénarios existants → re-baseliner sciemment »** :
  mesuré, **une seule assertion a bougé** sur 4 779 tests. Les huit autres fixtures à 0 n'assertent
  rien de sensible à la croissance.
  ⚠️ **Piège évité par la mesure, pas par la relecture** : `fin(goal.propertyGrowthRate) ?? 3` aurait
  été un non-correctif silencieux — `fin` rend TOUJOURS un nombre, donc le `?? 3` ne se déclenche
  jamais et un taux absent serait devenu 0 %. Le défaut se passe à `fin` lui-même
  (`PATRON-COPIE-AVEC-SON-CONTRAT-D-ERREUR`).
  3 tests, **2 perturbations rouges** (0 effacé · défaut tué). Livré 2026-08-25 · PR #731.

## 2026-08-25 — Un bouton n'est pas un filet : le centre fiscal écrivait le profil en direct

- [x] **`[AI-TAXCENTER-APPLY-NOGATE]`** — la faille était l'**incohérence entre deux surfaces qui
  font la même chose** : `PayslipUploadCard` avait reçu le filet (diff → confirmation → recalcul sur
  état frais → backup → écriture), `TaxCenter.applyToProfile` écrivait encore le profil salarial en
  direct via `setConfig`. Le bouton « Appliquer au Profil Principal » donnait un geste de
  confirmation, mais **aucun diff** (on ne voyait pas ce qui changeait), **aucun backup** (rien où
  revenir), **aucune garde de vraisemblance** — sur le profil qui alimente TOUTE l'app.
  ⚠️ **Un défaut de plus, trouvé en lisant** : `const newConfig = { ...config }` est une copie de
  SURFACE, donc `newConfig.users` restait le MÊME tableau et `newConfig.users[0] = …` écrasait
  l'état précédent **en place**. L'objet auquel un backup ou un `undo` se serait raccroché était
  déjà modifié. Le bug disparaît avec le chemin standard, qui ne touche jamais l'état à la main.
  ⚠️ **La prop `setConfig` de `TaxCenter` est RETIRÉE**, pas laissée inerte : la garder ferait croire
  qu'il existe encore un chemin d'écriture direct, et inviterait à le reprendre.
  **Extraction préalable, exigée par le dépôt** : la plomberie de confirmation existait DEUX fois, à
  l'octet près (`useAiChat` + `PayslipUploadCard`). Vérifié avant de bouger — les deux copies
  n'avaient PAS divergé, donc l'extraction est mécanique. TaxCenter aurait été la troisième
  (`DEUX-COPIES-D-UN-PATRON-ONT-DEJA-DIVERGE-LA-TROISIEME-SE-REFUSE`) → `hooks/useWriteConfirmation.ts`,
  qui porte aussi la règle de vie privée (le modal AFFICHE des montants → mode discret pendant
  l'attente = refus), là où toute nouvelle surface en hérite.
  ⚠️ **Une perturbation n'a RIEN fait rougir** : désarmer complètement cette règle de vie privée
  laissait les **145 tests** des deux surfaces au vert. Une garantie que rien ne vérifie n'est pas
  une garantie → 4 tests neufs sur le contrat du hook.
  ⚠️ **Et ma propre garde avait un trou, trouvé par perturbation** : `setConfig?.(` — l'appel
  OPTIONNEL, la forme la plus probable ici — échappait au motif `setConfig\s*\(`. Resserré.
  7 tests, **4 perturbations rouges**. Livré 2026-08-25 · PR #730.

## 2026-08-25 — Les RSU ne s'arrêtaient jamais : +1 380 630 $ de patrimoine fantôme

- [x] **`[PH3-c-bis]`** — le ticket rangeait deux choses ensemble ; mesurées, elles n'ont pas du tout
  la même gravité (`UN-TICKET-QUI-GROUPE-PAR-LA-SYNTAXE-GROUPE-DES-ENJEUX-INCOMPARABLES`).
  **1. `rsuYearsRemaining` — un chiffre FAUX, pas une fonctionnalité manquante.** Le moteur lit ce
  champ depuis toujours (`activeIncome.ts` : `(u.rsuYearsRemaining ?? 99) > yearsElapsed`) et **aucun
  champ ne l'écrivait** : le repli à 99 ans faisait couler les RSU sur tout l'horizon, sans jamais
  expirer. **MESURÉ** sur une projection de 40 ans à 24 000 $/an de RSU : **7 273 468 $** de
  patrimoine final sans durée contre **5 892 838 $** avec un vesting de 4 ans — **1 380 630 $
  (+23,4 %) de richesse fantôme**, et encore 823 937 $ d'écart à 10 ans de vesting. Son JUMEAU
  `rsuVestingPerYear` avait son champ depuis toujours, deux lignes plus haut
  (`PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`). Champ ajouté à côté de lui.
  ⚠️ Vider le champ rend `undefined`, jamais `0` : « pas renseigné » et « zéro an » ne sont pas la
  même chose — un `0` persisté couperait les RSU immédiatement.
  **2. `futureProvince` / `futureProvinceMoveYear` — retirés.** ⚠️ Le ticket nommait
  `futureMoveYear`, qui n'existe pas : le champ s'appelle `futureProvinceMoveYear`. Mesuré : **zéro
  producteur ET zéro consommateur**, et le type `CanadianProvince` n'existait que pour typer le
  premier. Un commentaire de `types.ts` AFFIRMAIT pourtant « CanadianProvince GARDÉ : consommé par
  ProjectionConfig.futureProvince » — une justification qui maintenait en vie du code que rien
  n'appelle. Retrait sûr : champs optionnels, aucune validation stricte au store.
  3 tests, **2 perturbations rouges** (champ présent mais muet · `0` persisté au lieu d'`undefined`).
  Livré 2026-08-25 · PR #729.

## 2026-08-25 — Neuf styles d'infobulle, dont deux blanches dans une app sombre

- [x] **`[DETTE-CHART-THEME-DUP]`** — le ticket disait « dédupliquer les styles inline ».
  **MESURÉ** : 14 infobulles Recharts, **9 styles distincts**, **six fonds différents** pour la même
  surface — `#1e1e1e` (×4), `#151922` (×2), `#1a1a1a` (×2), `#1a1e29`, `#111`, `#0B0E14` (×2) — et
  **deux infobulles BLANCHES** (`#fff`, texte noir), dans les graphiques de placements, au milieu
  d'une app sombre. Surtout : **aucun de ces six fonds n'existe dans `tailwind.config.js`**. Le
  problème n'était donc pas la duplication mais le fait qu'aucune infobulle n'utilisait le système
  de design — la duplication n'en était que le symptôme.
  Livré : `CHART_TOOLTIP_STYLE` + `CHART_TOOLTIP_ITEM_STYLE` dans `utils/chartTooltip.ts`, appliqués
  aux 14 sites. Fond = `surfaceHighlight` (l'infobulle est une surface ÉLEVÉE au-dessus de
  `surface`/`dark` — c'est ce que le token nomme), texte = `ink-100`, **ratio mesuré 14,42** contre
  les 4,5 exigés par WCAG AA. Choisi par mesure, jamais au jugé.
  ⚠️ **Décision d'apparence assumée** : les deux infobulles blanches deviennent sombres comme les
  douze autres. Elles n'étaient pas posées sur une surface claire — elles étaient simplement les
  seules à ne pas suivre le thème, et tout aussi hors palette que les autres.
  ⚠️ Ces valeurs DUPLIQUENT les tokens et rien au runtime ne les confronte : un `contentStyle` part
  dans la prop d'un composant TIERS, il ne peut pas être une classe Tailwind. La garde le fait dans
  les deux sens — la constante doit reproduire les tokens, ET aucun composant ne doit re-peindre un
  `contentStyle` inline (scan de source décommenté, avec double anti-vacuité : volume de code
  restant + témoin retrouvé par le MÊME lecteur que les offenders).
  3 tests, **2 perturbations rouges**. Livré 2026-08-25 · PR #728.

## 2026-08-25 — Vendre une maison dépendait d'un mot tapé dans un champ libre

- [x] **`[ENG-LIFEEVENT-VENTE-SUBSTRING]`** — ⚠️ **la moitié moteur était DÉJÀ faite, et c'est ce qui
  rendait le défaut invisible.** `LifeEvent.eventKind` (`'VENTE_IMMO' | 'NONE'`) existe dans `types.ts`,
  le moteur le consulte EN PREMIER, et trois tests verrouillent son contrat. **Mesuré** :
  `'VENTE_IMMO'` n'avait **AUCUN producteur dans tout le dépôt** — seul `mcp/whatIf.ts` écrivait
  `'NONE'`, deux fois, par prudence. Tout événement créé par l'app arrivait donc au moteur avec
  `eventKind` absent, c'est-à-dire sur le chemin historique : **la sous-chaîne « vente » dans le nom**.
  Le contrat était testé, l'appelant n'existait pas (`TEST-AU-CONTRAT-NE-VOIT-PAS-L-APPELANT`).
  ⚠️ **Le formulaire portait la MÊME heuristique**, à deux endroits : le sélecteur « Bien à vendre »
  n'apparaissait que si le nom contenait « vente ». Conséquence mesurée : « Vente d'auto » ou « Vente
  de garage » **revendait la maison** (des centaines de milliers de dollars), et « Je me départis du
  condo » ne vendait rien.
  Livré : une case à cocher « Cet événement est la vente d'un bien immobilier » qui écrit `eventKind`,
  et `handleAdd` qui l'écrit **explicitement** sur tout événement neuf (`'NONE'` par défaut — absent
  voudrait dire « je ne sais pas » et relancerait l'heuristique). Le sélecteur de bien suit désormais
  la CASE. Décocher efface `propertyId` : une cible orpheline désignerait un bien que plus rien ne vend.
  ⚠️ **La réserve est DITE, pas devinée** : si le nom parle de vente alors que la case est décochée,
  un avertissement visible le signale — sans lui, un utilisateur habitué à l'ancien comportement
  perdrait son intention en silence. Testé dans les DEUX sens (une alarme permanente s'ignore).
  ⚠️ Le chemin historique reste en place côté moteur pour les événements DÉJÀ enregistrés, qui n'ont
  pas le champ : rétrocompat exacte, zéro migration.
  ⚠️ Effet de bord assumé, dans le bloc édité : « Nom » et « Date » étaient les deux seuls champs du
  formulaire dont l'étiquette n'était liée à aucun `id` — les six autres l'étaient déjà
  (`PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`). Un lecteur d'écran annonçait deux champs sans nom.
  4 tests, **2 perturbations rouges**. Livré 2026-08-25 · PR #727.

## 2026-08-25 — La garde du grand livre au jour ne regardait que 5 soldes sur 30

- [x] **`[GARDE-JOUR-ANTICIRCULAIRE-ETROITE]`** — le ticket avait raison sur le constat (la seule
  garde NON circulaire ne couvrait que 5 champs, un seul jour) et **se trompait sur le correctif**.
  Il prescrivait « étendre le test de rapport à TOUS les stocks non nuls ». **MESURÉ** : appliqué
  tel quel à la fixture existante, ça couvre 13 champs et **aucun des onze que le ticket nomme** —
  `DetteTotale`, `DettesNonImmo`, `LiquidDebt`, `rapBalance`, `Immobilier`, `REEE`, `NonReg`,
  `Crypto`, `reeeContribCum`, `reeeGrantsCum`, `CELIAPPMax` valent **tous zéro** dans un scénario
  sans dette, sans immeuble et sans enfant. Le vrai correctif était la **FIXTURE**, pas la liste
  de clés (`INVARIANT-QUI-NE-PARCOURT-PAS-LA-PHASE`, encore).
  Livré : une fixture riche (dette auto, achat de maison, enfant, crypto, non-enregistré) qui porte
  la garde de **5 à 18 soldes** et de **1 jour à 2 644 couples (jour, clé)**. Le pire rapport réel
  mesuré est **0,995** contre **0,035** pour un solde ventilé par erreur — seuil posé à 0,5, donc
  facteur 2 de marge au vrai et facteur 14 au défaut.
  ⚠️ **La liste balayée reste ÉCRITE À LA MAIN, et c'est le point** : la dériver de `FIELD_KIND`
  ferait sortir du balayage le champ même qu'un reclassement stock→flux vient de déclasser. Un
  second test consulte `FIELD_KIND` UNIQUEMENT pour EXIGER des ajouts — tout solde neuf doit
  atterrir soit dans la liste balayée, soit dans la liste des **13 exclusions déclarées et
  motivées** (`Liquidites` change de signe pendant la mise de fonds — rapport mesuré de −8,7 à 552).
  ⚠️ Le scénario EXACT que le ticket décrivait comme invisible — reclasser `DetteTotale` en flux —
  rougit désormais, et **seule** la garde neuve l'attrape : les 26 autres tests du fichier restent
  verts. 2 tests, **2 perturbations rouges**. Livré 2026-08-25 · PR #726.

## 2026-08-25 — Le plafond REER faisait une marche de 4,5 % en une année

- [x] **`[FISC-RRSP-EXTRAP-05]`** — le ticket demandait de « sourcer ou requalifier » le
  **`+0,5 pp`** ajouté à l'inflation pour prolonger le plafond REER au-delà du barème. Requalifié :
  c'est une **hypothèse de MODÈLE**, documentée comme telle en §7 de `FISCAL_REFERENCE.md` avec son
  écart MESURÉ contre l'indexation réellement observée (2,72 %/an de 2010 à 2026 · 3,97 %/an de 2021
  à 2026 · 2,00 %/an sur les estimations 2027-2030 du dépôt, contre 2,50 %/an modélisés à 2 %
  d'inflation). Le plafond vient de l'ARC ; la vitesse à laquelle on le prolonge, non — et la
  ranger telle quelle dans la source de vérité lui aurait donné l'autorité d'un texte de loi.
  **Trouvé en écrivant cette doc** : l'extrapolation composait depuis le littéral **2026** alors que
  le barème va jusqu'à **2030**. Les années 2027-2030 sortaient de la table (≈ 2 %/an) et 2031
  repartait de 2026 au rythme du modèle. **MESURÉ à inflation 2 % : la couture 2030 → 2031 sautait
  de 36 590 $ à 38 252,91 $, soit +4,54 % en une seule année** ; ancrée sur la dernière année connue
  elle donne 37 504,75 $ (+2,50 %, exactement la vitesse du modèle). À 5 % d'inflation, 2032 valait
  44 188 $ contre 38 602 $ — **5 586 $ de droits fabriqués par la seule ancre**. Le patron correct
  existait à trois lignes de là : le CELI ancre déjà sur `LAST_KNOWN_CELI_YEAR`.
  **Deux goldens ont bougé et c'est le bon signe** : −28 969 $ et −47 367 $ (−0,13 % / −0,11 %) sur
  la seule fixture dont le plafond MORD et dont l'horizon dépasse 2030. Moins de droits fabriqués,
  donc moins d'abri fiscal.
  ⚠️ **Le garde d'obsolescence de l'inventaire fiscal a fait son travail tout seul** : l'entrée
  `taxJanuary.ts::2026` est devenue fantôme au moment même où le littéral disparaissait — retirée.
  Et la raison voisine renvoyait à un « §7.G » qui n'a **jamais existé** dans `FISCAL_REFERENCE.md`.
  4 tests, **2 perturbations rouges** (continuité de la couture · câblage de l'ancre).
  Livré 2026-08-25 · PR #725.

- [x] **Quatre tickets fiscaux ROUTÉS, pas livrés** (`[FISC-RAP-15ANS]`, `[FISC-RAP-GRACE-WINDOW]`,
  `[FISC-REEE-AGE-FERMETURE]`, `[FISC-RRSP-LIMITS-PRE2024-DOC]`) — leur seul correctif est de
  SOURCER une règle ARC. **Re-vérifié le 2026-08-25** : le proxy de sortie répond 403 à `canada.ca`,
  `revenuquebec.ca`, `bankofcanada.ca` et aux moteurs de recherche — ce n'est pas une panne
  passagère. Écrire un chiffre fiscal non vérifié dans la source de vérité fabriquerait la source
  qu'on prétend citer. Routés en `docs/A_FAIRE_MOI.md` **B6 à B9**, avec la question exacte et le
  site de code, et laissés OUVERTS au BACKLOG avec leur mention de blocage.

## 2026-08-24 — Une pastille flottait sur un étage vide

- [x] **`[FUTUR-DAILY-STACK-X]`** — ⚠️ **le ticket visait le mauvais défaut.** Il disait : deux
  événements du même mois à des jours différents sont empilés « alors qu'ils ne se chevauchent plus
  horizontalement ». **Mesuré** : la pastille fait 24 px de diamètre et, à l'horizon par défaut
  (40 ans) sur un écran de téléphone, **un mois vaut ≈ 0,7 px** — deux événements à 15 jours d'écart
  sont à ≈ 0,35 px l'un de l'autre. À la vue par défaut, l'empilement est ce qui les rend lisibles,
  et la correction proposée (grouper par abscisse arrondie) les aurait SUPERPOSÉS.
  **Le vrai défaut, trouvé en cherchant celui-là** : le rang d'empilement était attribué en amont,
  sur la liste COMPLÈTE des événements — donc AVANT le filtre de fenêtre et AVANT l'écrêtage de
  densité (24 pastilles « vie », 16 « flux »). Un mois dont l'échantillonnage ne gardait pas la
  première pastille laissait la survivante au rang 1 ou 2, dessinée 44 ou 68 px au-dessus de la
  courbe, au bout d'une longue tige, avec un ou deux **étages vides** en dessous. **Observé** dans
  le vrai composant : mois 15, une seule pastille montrée, rang 1.
  Correctif : `assignStackIndex` appliqué EN DERNIER, sur ce qui est réellement montré. Effet de
  bord voulu : la numérotation lue par un lecteur d'écran (« (2) ») désigne enfin des pastilles qui
  existent. Reliquat re-cadré en `[FUTUR-STACK-ZOOM-AWARE]` (le critère juste est en pixels, donc
  il appartient au rendu, pas au calcul des événements).
  2 tests, dont l'anti-vacuité qui a **rougi sur ma propre fixture** (sans événement épinglé, aucun
  mois ne gardait deux pastilles et l'assertion de contiguïté était vraie par construction).
  Discrimination prouvée sur le code d'avant. Livré 2026-08-24 · PR #724.

## 2026-08-24 — Le test de pincement passait par accident

- [x] **`[E2E-PINCH-ZOOM-FLAKE]`** — le check requis « E2E (Playwright / Chromium) » a échoué
  **3 fois d'affilée** (1 exécution + 2 reprises) sur la PR #722, à
  `e2e/futurePinchZoom.spec.ts` — « le préset *Tout* doit avoir perdu son état actif » recevait
  `true`. Le diff de cette PR ne touchait **ni le graphe ni le tactile**, et le rejeu du **MÊME
  sha** est passé VERT : donc pas une régression.
  **Mécanisme MESURÉ** (sonde locale, 3/3 identiques) : juste après le `touchmove` à 2 doigts,
  « Tout » est **encore actif** ; la bascule met **2,1 à 2,3 s** (2301 / 2124 / 2174 ms) — le hook
  planifie la nouvelle fenêtre en `requestAnimationFrame`, puis toute la série est re-tranchée et
  React re-rend : c'est du CALCUL, pas une frame. Le test lisait l'état **une seule fois, sans
  attendre**, et ne passait que parce que le bouton se DÉTACHE pendant le recalcul, ce qui forçait
  Playwright à re-tenter sa résolution. Quand il ne se détache pas, la lecture unique renvoie
  l'état d'avant.
  Correctif : attendre la **transition** par `expect.poll` là où l'état doit changer, et — symétrie
  indispensable — lire **après** le budget mesuré là où l'état ne doit PAS changer (lue tout de
  suite, cette assertion-là serait vraie même pendant un zoom en cours de commit). La mesure est
  écrite dans le fichier, avec le numéro du run, pour que la prochaine occurrence soit lisible.
  Livré 2026-08-24 · PR #723.

## 2026-08-24 — Le déplacement de l'ancre « Liquidités » cesse d'être invisible

- [x] **`[FINTABLE-ANCRE-LIQUIDITE-GONFLEE]`** — **le mécanisme est encore atteignable**, mesuré
  avant d'écrire une ligne de code : un doublon qui échappe au classement (`callerClassified`, où
  l'appelant affirme avoir déjà tranché — donc la dédup par clé ne droppe plus) fait compter une
  dépense DEUX fois, et le recalage par `cash_balance` absorbe l'écart en déplaçant l'ancre.
  **MESURÉ : `initialBalances.LIQUIDITE` passe de 1 000 $ à 1 300 $** sur une dépense de 300 $
  comptée deux fois, **sans aucun avertissement**.
  ⚠️ **Ce lot NE corrige PAS l'ancre — et c'est délibéré.** Le déplacement est le comportement VOULU
  du recalage (le cash est dérivé : `Σ initialBalances + Σ transactions`) ; ce qui est fautif, c'est
  qu'il soit SILENCIEUX. On ne peut pas décider à la place de l'utilisateur si l'écart vient d'un
  doublon, d'une transaction pas encore importée ou d'une vraie correction bancaire — donc on le
  MESURE et on le PUBLIE (`cashAnchorDelta`, affiché dans Système) au lieu de l'absorber. Le total
  présent reste juste ; ce qui bouge en silence, c'est l'ancre visible dans Réglages → Comptes et
  TOUT l'historique passé.
  ⚠️ Champ ADDITIF et optionnel : un rapport d'avant ce lot n'a pas la valeur → l'écran n'affiche
  RIEN, jamais « 0 $ », qui affirmerait faussement que l'ancre n'a pas bougé (no-fake-data).
  2 tests, dont le SENS INVERSE (une passe sans écart ne déplace rien — sinon l'écran porterait une
  alarme permanente). **2 perturbations prouvées rouges**, une par sens.

Contexte d'origine :

- [ ] **`[FINTABLE-ANCRE-LIQUIDITE-GONFLEE]`** (S, MOYEN — MESURÉ, audit PR #649) — un doublon non
  neutralisé gonfle `initialBalances.LIQUIDITE` en silence (mesuré 1000 → 1584 $) : le total présent
  est auto-réparé par le payload `cash_balance`, mais l'ANCRE visible dans Réglages → Comptes porte
  un montant qui ne correspond à rien, et l'HISTORIQUE passé est déplacé d'autant (mesuré +500 $ sur
  tous les mois antérieurs). ⚠️ Si aucun compte n'a le rôle `cash`, rien ne recale : l'écart cumulé
  reste sur le solde courant. Largement fermé par le correctif `isDuplicate` de #649, mais le
  mécanisme reste exposé pour tout doublon qui échappe au classement (cf. les deux tickets ci-dessus).

## 🔴 Money-critical — fiabilité des chiffres

> Analyse fiscale 2026-07-31 (financial-integrity, findings MESURÉS via npx tsx sur le vrai moteur).
> ⚠️ Un finding = une hypothèse : chaque fix passe par discriminant git-stash + panel adversarial.

### ✅ Panel PR #644 (2026-08-17) — divorce × enfants : NO-GO LEVÉ, tout traité

> ⚠️ **DEUX agents indépendants (`projection-validator`, `financial-integrity`) ont MESURÉ le même
> défaut**, chacun de son côté et sur le vrai moteur. Ce n'est donc pas une hypothèse de revue.
> La cause commune : `[ENG-DIVORCE-CHILDREN-REEE]` a ventilé `liquidDelta` par clé de partage,
> mais PAS `monthlyIncomeDelta`, qui transporte exactement le même mélange de familles. C'est la
> classe maison « un flux alimente PLUSIEURS registres » — appliquée à la moitié du problème.

### Trouvés par le panel #644 mais PRÉ-EXISTANTS (hors périmètre de la PR)

## 2026-08-24 — Plus de congé parental pour un parent qui n'est plus là

- [x] **`[REEE-CONGE-SANS-GARDE-SOLO]`** — `projection.ts` passait `grossAnnaBaseAnnual` **brut** au
  bloc enfants, sans le garde `soloHousehold` appliqué aux **quatre** autres sites qui transmettent ce
  salaire. Après décès ou divorce, le congé parental se déclenchait donc sur un salaire que le ménage
  ne touche plus.
  **Mesuré au module** : `accGrossDelta = −5 000 $/mois` (−60 k$/an de brut RETIRÉ, jamais crédité)
  et **+2 436 $/mois** de prestation RQAP fabriquée pour un parent absent.
  **Mesuré au SCÉNARIO** (le vrai moteur, divorce + naissance pendant la projection) : le revenu du
  mois observé passe de 5 620 $ à **8 930 $** sans le correctif — **+3 310 $/mois** de revenu
  fantôme. C'est cette mesure-là qui compte : le module ne peut pas voir le défaut, qui est un défaut
  de CÂBLAGE.
  ⚠️ **Deuxième moitié du ticket, mesurée et corrigée aussi** : la porte `!isRetired` manquait.
  `grossAnnaBaseAnnual` est le salaire de BASE — il reste non nul après la retraite, le moteur cesse
  simplement de le créditer. Un ménage retraité avec un nourrisson retirait donc le même salaire
  fantôme. Le module conditionnait déjà la cotisation REEE à `!isRetired` : même convention.
  Corrigé au PRODUCTEUR pour la partie solo (le module enfants n'a aucun moyen de savoir que le
  second parent a disparu), et dans le module pour la retraite (c'est lui qui connaît l'état).
  3 tests (1 de scénario + 2 de module), **2 perturbations prouvées rouges** — dont une qui a révélé
  que le cas RETRAITÉ n'était couvert par AUCUN test existant, d'où la garde ajoutée.
  ⚠️ **Un volet a été RETIRÉ du lot en cours de route, et c'est un test existant qui l'a imposé.**
  J'avais aussi appliqué `soloHousehold` à `householdGross` — par cohérence apparente. Le test de
  scénario `[ENG-DIVORCE-BENEFITS-FLUX]` a rougi : cette valeur ne sert pas au congé mais à la
  RÉCUPÉRATION des allocations, et la baisser fait MONTER l'allocation d'un parent seul (**166 $ →
  250 $/mois** au mois 36). C'est une question de RÈGLE, pas de câblage → routée en
  `[ENG-DIVORCE-ALLOC-ASSIETTE]`. Un correctif « cohérent » n'est pas forcément dans le périmètre du
  défaut qu'on corrige.

Contexte d'origine :

- [ ] **`[REEE-CONGE-SANS-GARDE-SOLO]`** (S, MOYEN [MESURÉ — revue #679, PRÉEXISTANT, ABSORBÉ]) —
  `projection.ts` passe `grossAnnaBaseAnnual` BRUT au bloc enfants sans le garde `soloHousehold`
  appliqué aux 4 autres sites, et sans gate `isRetired` : après décès/divorce (ou avec des jumeaux
  < 12 mois), le congé retire un salaire jamais crédité → slot 1 NÉGATIF (mesuré −60 k$/an).
  Le clamp par personne de #679 l'ABSORBE aujourd'hui (et corrige au passage : l'ancien agrégat
  rongeait les droits de Marc de 8 100 $/an sur des jumeaux) — mais si le congé devient
  per-parent, le défaut ressort. Corriger le site producteur, pas le consommateur.

## 2026-08-24 — Le gate ciblé lance le test qui porte le nom du module

- [x] **`[GATE-RELATED-RELIABILITY]`** — **le symptôme n'est PAS reproductible**, et c'est le premier
  résultat du lot. Le ticket rapportait que `services/projection/monthlyEvents.ts` stagé ne faisait
  pas sélectionner `tests/services/monthlyEvents.test.ts` par `vitest related` (échec vu en CI seule,
  2× dans la PR #594). Re-mesuré le 2026-08-24 sur Vitest 4.1.8, avec la forme EXACTE de la commande
  du hook (guillemets simples) : **le test homonyme est bien sélectionné** — 72 fichiers pour un
  module stagé, 87 pour deux, cibles incluses dans les deux cas.
  Plutôt que de clore sur « ça marche maintenant » (la cause reste inconnue), la classe est rendue
  IMPOSSIBLE là où elle est vérifiable : `scripts/hooks/lib/testsHomonymes.mjs` dérive, pour chaque
  module stagé, le test qui porte SON nom, et le hook l'ajoute EXPLICITEMENT à la commande — que le
  graphe d'imports l'ait retrouvé ou non. Même geste que `SCAN_GUARD_TESTS`, pour une autre cause.
  ⚠️ La fonction vit dans un module SÉPARÉ parce que `commit-gate.mjs` **lit stdin au chargement**
  (c'est un hook PreToolUse) : l'importer depuis un test BLOQUE le processus — vérifié en essayant.
  5 tests, dont le sens inverse (un module sans test homonyme ne fabrique rien) et le CÂBLAGE.
  ⚠️ **Ma garde de câblage était vacueuse — deux fois.** `toMatch(/TESTS_HOMONYMES/)` restait verte
  sur la perturbation « liste calculée puis inutilisée » (`void TESTS_HOMONYMES;`), et la borner à la
  LIGNE ne suffisait pas non plus (la perturbation tient sur la même ligne). Il a fallu l'ancrer sur
  l'INITIALISEUR, borné au premier `;`. Les deux échecs sont écrits dans le test.

- ⚠️ **Correction apportée à `docs/CONVENTIONS.md` dans le même lot** : la leçon
  `LE-GATE-N-EST-PAS-LANCE-SI-LE-HOOK-N-EST-PAS-INSTALLE`, écrite plus tôt le même jour, donnait la
  mauvaise cause (`core.hooksPath` vide). `commit-gate.mjs` n'est pas un hook git mais un hook
  **PreToolUse de Claude Code** déclaré dans `.claude/settings.json`. Le constat opératoire tient, le
  mécanisme était faux.

Contexte d'origine :

- [ ] **`[GATE-RELATED-RELIABILITY]`** (S, outillage — mesuré 2026-08-12) — `vitest related` de la
  gate ciblée n'a PAS sélectionné `tests/services/monthlyEvents.test.ts` alors que
  `services/projection/monthlyEvents.ts` était stagé (échec attrapé par la CI seule, 2×
  dans la même PR #594 avec la garde fiscale). Diagnostiquer pourquoi (chemins quotés ? CWD du
  hook ? suivi du graphe ?) et soit corriger, soit élargir la gate. En attendant : la CI
  complète reste l'arbitre (design assumé), les gardes-scan sont déjà forcées.

> Findings code-analyzer 2026-07-31 (preuve fichier:ligne, chacun vérifié par grep) :

## 2026-08-24 — Le tour guidé cesse de pointer un bouton invisible

- [x] **`[TOUR-ANCHOR-INVISIBLE]`** — `findVisibleAnchorRect` ne testait que `width/height > 0`. Or
  `display:none` retire l'élément du flux (rect 0×0, attrapé), mais **`visibility:hidden` CONSERVE le
  layout** : l'ancre garde ses dimensions tout en étant invisible. Un groupe de navigation replié à
  la main, puis la visite guidée relancée, et le tour projetait son spotlight sur un bouton que
  l'utilisateur ne voit pas.
  La visibilité se DEMANDE au moteur de rendu (`checkVisibility`, qui couvre display, visibility,
  `content-visibility` et l'opacité en une fois) plutôt que de se déduire d'une dimension. Repli
  EXPLICITE sur `getComputedStyle` là où la méthode n'existe pas (jsdom) : sans lui, l'environnement
  sans la méthode retomberait sur « tout est visible » et la garde serait morte.
  4 tests neufs dont **le sens inverse** (une ancre sans style particulier reste visible) — sans
  celui-là, un `estVisible` toujours faux passerait les trois autres et casserait le tour partout.
  **2 perturbations prouvées rouges**, la seconde faisant tomber les DEUX sens.
  ⚠️ **Option (a) du ticket écartée, et routée** en `[TOUR-STEP-GROUPE-REPLIE]` : faire ouvrir le
  groupe par le tour rendrait l'étape ATTEIGNABLE, mais défait un repli VOLONTAIRE de l'utilisateur
  et couple les étapes à l'état de la nav. Avec le correctif livré, le tour retombe sur sa carte
  centrée — honnête, mais l'étape décrit encore un contrôle à ouvrir soi-même. Décision d'UX à
  trancher, pas un oubli.

Contexte d'origine :

- [ ] **`[TOUR-ANCHOR-INVISIBLE]`** (S, a11y — audit #600, pré-existant) — `anchorRect.ts` ne
  teste que width/height > 0, or `visibility:hidden` CONSERVE le layout : un accordéon replié
  manuellement + visite guidée relancée → le tour spotlighte un bouton invisible. Fix : le
  tour force l'ouverture du groupe du step actif, OU `anchorRect` vérifie
  `getComputedStyle(el).visibility`. Surface élargie par la nav 6 destinations (Configurations
  = 5 onglets).

## 2026-08-24 — Un `aria-hidden` se juge par ce qui existe à côté

- [x] **`[A11Y-CHART-HINT-HIDDEN]`** — livré, mais **le ticket se trompait de défaut**, et c'est le
  résultat principal du lot.
  Il annonçait « du contenu instructionnel entièrement soustrait aux lecteurs d'écran » pour la
  phrase d'aide du graphe Futur (`survol = jour · clic = fige…`). Vérifié : cette phrase est un
  **DOUBLON** — le conteneur du graphe porte déjà un `aria-label` qui énonce les mêmes gestes. La
  masquer est correct ; l'exposer ferait annoncer deux fois la même chose.
  **Le vrai défaut était dans le CONTENU de cet `aria-label`** : il n'énonçait que des gestes de
  POINTEUR (clic, molette, glisser) — inutilisables par qui ne pointe pas — et ne nommait JAMAIS
  l'alternative textuelle qui existe pourtant juste après la courbe (`ChartDataTable` sr-only + liste
  sr-only des jalons). On annonçait donc ce qu'un utilisateur clavier ne peut pas faire, et on lui
  taisait ce qu'il peut faire. Le libellé renvoie maintenant à l'alternative et étiquette les gestes
  « à la souris ».
  ⚠️ **Le libellé a failli citer un titre INEXISTANT** : j'y avais écrit « le tableau *Données de la
  projection* », alors que sa vraie légende est « Projection du patrimoine net et des comptes, jour
  par jour » (et diffère au repli mensuel). Renvoyer vers un nom inventé aurait été le même mensonge
  dans l'autre sens — le renvoi est donc descriptif, pas nominatif.
  **2e site** (`components/setup/PageSetupGate.tsx`) : le séparateur « ou importer » était masqué
  ENTIER. Les deux filets sont décoratifs, mais le libellé porte le seul indice qu'il existe un
  chemin **alternatif** à la saisie manuelle — masquer le tout supprimait une BIFURCATION, pas un
  ornement. Filets toujours cachés, libellé exposé, bloc d'import nommé (`role="group"`).
  **3e site, VÉRIFIÉ CONFORME et consigné** : `{done}/{total} prêts` est masqué **à bon droit** — un
  vrai `role="progressbar"` avec `aria-label` et `aria-valuenow/min/max` le porte déjà. Une garde
  fige cette décision, sinon un prochain passage « corrigera » un masquage légitime.
  6 tests, **3 perturbations prouvées rouges** (dont une sur le site conforme, dans le sens
  « surcorrection »).

Contexte d'origine :

- [ ] **`[A11Y-CHART-HINT-HIDDEN]`** (S, a11y — audit #595) — la phrase d'aide du graphe Futur
  (« survol = jour · clic = fige · molette = zoom », `FutureProjection.tsx` ~1311) est en
  `aria-hidden="true"` : du contenu INSTRUCTIONNEL entièrement soustrait aux lecteurs d'écran,
  pas un glyphe décoratif. Idem, en plus faible, le séparateur « ou importer » de
  `PageSetupGate.tsx` ~271. Fournir l'équivalent `sr-only` (interactions clavier disponibles :
  table de données, preset « Aujourd'hui ») au lieu de tout masquer. Préexistant au sweep #595.

## 2026-08-24 — Un résultat gelé porte enfin ses propres métadonnées

- [x] **`[MC-LABEL-FROZEN]`** — le KPI « Taux de succès » annonçait « Monte Carlo (N itér.) » en
  lisant la **configuration vivante** (`effectiveMcIterations(config.monteCarloIterations)`), alors
  que `results` peut être **GELÉ** : bouger le curseur d'itérations sans relancer la projection
  faisait annoncer un nombre qui n'avait jamais servi au calcul montré.
  Correctif conforme à ce que le ticket proposait : le compte voyage AVEC le résultat —
  `MonteCarloResult.iterationsRun` (= `allRuns.length`, ce qui a VRAIMENT tourné, pas le paramètre
  demandé : un futur arrêt anticipé rendrait le second mensonger), propagé en `mcIterationsRun` dans
  la sortie de projection, lu par le libellé.
  ⚠️ **Troisième cas, absent du ticket** : un résultat SANS compte (MC désactivé au moment du calcul,
  ou projection produite avant ce lot) n'emprunte PAS le nombre à la configuration — il affiche
  « Monte Carlo » sans chiffre. Un libellé incomplet est honnête, un nombre crédible ne l'est pas
  (no-fake-data).
  Le libellé est extrait en `mcSublabel` pour être testable : le défaut n'était pas dans le composant
  mais dans ce qu'on lui PASSAIT. 7 tests (les trois cas du libellé, le compteur du moteur vérifié
  par DEUX moitiés — champ publié et nombre d'appels observés —, la chaîne par scan).
  **2 perturbations prouvées rouges.**

Contexte d'origine :

- [ ] **`[MC-LABEL-FROZEN]`** (S, finding financial-integrity #601) — le libellé « Monte Carlo
  (N itér.) » lit la config LIVE (`effectiveMcIterations(config.monteCarloIterations)`) alors
  que `results` peut être GELÉ (calculé avec l'ancienne valeur) : changer les itérations sans
  relancer fait mentir le libellé sur le calcul affiché. Fix propre = porter le nombre
  d'itérations réellement exécuté DANS `MonteCarloResult` (le libellé lit le résultat, pas la
  config). Atténué en attendant par le bandeau « Paramètres modifiés ».

## 2026-08-24 — Le piège à focus devient une source unique (et les deux copies avaient divergé)

- [x] **`[A11Y-FUTUR-DETAIL-FOCUS-TRAP]`** — `FutureDetailModal` avait `role="dialog"
  aria-modal="true"`, le focus au montage et Échap, mais **rien ne retenait Tab** : la tabulation
  sortait vers le contenu de fond, que l'overlay masque à la souris et laisse atteignable au clavier.
  ⚠️ **Le correctif n'est PAS celui que le ticket proposait.** Il suggérait de reprendre « le patron
  déjà présent deux fois ». Or ces deux copies avaient **déjà divergé** : la liste d'éléments
  focusables de `components/ui/Modal.tsx` inclut `select` et `textarea`, celle de
  `components/sync/SyncConflictModal.tsx` les avait perdus — un dialogue de conflit qui gagnerait une
  liste déroulante aurait fui hors du piège en silence.
  Extrait dans `hooks/useFocusTrap.ts` (piège Tab **seulement** — focus initial, verrou de scroll,
  Échap et restauration restent chez l'appelant : ils diffèrent légitimement, le modal de conflit
  étant volontairement BLOQUANT). Les **trois** dialogues y sont branchés.
  7 tests : cycle Tab / Shift+Tab vérifié en COMPORTEMENT sur la modale du ticket, câblage des deux
  autres par scan, plus une garde qui interdit une quatrième liste locale. **2 perturbations prouvées
  rouges.** ⚠️ L'anti-vacuité a de nouveau attrapé ma fixture : sans les flèches Veille/Lendemain, le
  dialogue n'a qu'UN élément focusable et le cycle boucle sur lui-même.
## 2026-08-24 — Le facteur d'inflation est validé à l'entrée de décembre, et son repli est DIT

- [x] **`[TAXDEC-INFLATIONFACTOR-AMONT]`** — une seule valeur assainie en tête de
  `processDecemberTaxFiling`, avec un `logs.push` quand elle remplace une donnée corrompue.
  ⚠️ **Le ticket sous-estimait la portée** (et ses numéros de ligne étaient périmés — une référence
  de ligne dans une doc est une dette). Il ne visait que les appels fiscaux passant le facteur comme
  `realDeflator`, là où `utils/tax.ts` le répare via `safeDeflator`. Or le facteur est AUSSI le
  **DIVISEUR** d'une dizaine de grandeurs du bloc (salaires, déductions, retraits REER, rentes,
  pension DB) : à 0, ces divisions rendaient `Infinity` **avant** d'atteindre `utils/tax.ts`, dont le
  repli ne couvre que la bande de paliers. Deux protections partielles à deux étages ne font pas une
  protection.
  Le repli à 1 n'invente rien : c'est la convention DÉJÀ retenue en aval (année non indexée), et le
  test le prouve par une ÉGALITÉ avec le cas neutre, pas par une plausibilité. Les deux gardes
  `Number.isFinite` devenues redondantes sur le plancher d'avril ont été retirées avec la raison
  écrite (le `Math.max(1, …)`, lui, reste : il empêche une déflation de rétrécir le plancher).
  7 tests, dont les DEUX sens (un facteur sain ne dit rien) et une anti-vacuité qui a **réellement
  attrapé** une fixture creuse — sans déductions, le solde d'avril valait 0 et trois assertions
  étaient satisfaites par du vide. **1 perturbation prouvée rouge (5 tests sur 7).**

- [x] **`[FISC-BRACKET-CPI-STRESS]`** — fermé sans code le 2026-08-20 (réponse Marc A7 :
  « conservateur », statu quo ADR 009), archivé ici comme prévu.

Contexte d'origine :

- [ ] **`[TAXDEC-INFLATIONFACTOR-AMONT]`** (S, FAIBLE — revue #680) — `taxDecember.ts` transmet
  `ctx.inflationFactor` brut comme `realDeflator` à 5 sites (506, 507, 519, 520, 651) ; la garde
  vit désormais en AVAL (`calculateAgeAndPensionCredits`, `getIndexedBracketsForYear`) mais un
  facteur corrompu devrait être dit UNE fois à l'entrée du mois (logs.push, patron L546) plutôt
  que réparé en silence N fois en aval. Incident `inflationFactor = 0` documenté in situ.
- [x] **`[FISC-BRACKET-CPI-STRESS]`** — ✅ FERMÉ SANS CODE 2026-08-20 (réponse Marc A7 : **« conservateur »**,
  statu quo ADR 009 confirmé — les scénarios de stress surestiment l'impôt et c'est ASSUMÉ). → archive à la prochaine PR.
  Détail historique du finding (panel #556) —
  post-fix, à `i ≠ 2 %` le barème érode en réel à `(1,02/(1+i))^Δ` alors que l'ARC/RQ indexent au
  CPI réel, et que PSV (seuil clawback ×(1+i)^Δ) et SRG (gelé en $ réels) sont indexés pleinement →
  les scénarios de STRESS surestiment l'impôt (mesuré : ttp +106 % à i = 8 %, +76 % à 5,5 %).
  À i = 2 % (défaut) : aucun effet. Options : indexer les paliers à `simInflation` (fidèle CPI,
  contredit ADR 009 « ~2 %/an ») vs statu quo documenté (conservateur en stress). Trancher avec
  Marc avant de coder.

## 2026-08-24 — Le clamp du crédit d'impôt pour dividendes : limite CONSIGNÉE, pas corrigée

- [x] **`[FISC-CID-CLAMP-EXCEDENT]`** — **décision de Marc : consigner la limite chiffrée**, ne pas
  corriger. Le ticket avait raison sur son CONSTAT (0 $ d'impôt sur dividendes dans son scénario) et
  tort sur son INFÉRENCE (« au lieu de réduire l'impôt des autres revenus ») : là où le clamp mord,
  il n'y a **aucun autre impôt** à réduire.
  **Mécanisme mesuré** : le CID effectif vaut 24,24 % du montant majoré, sous le plus bas taux
  marginal combiné positif (~26,5 %) — donc au-dessus du seuil d'imposition, l'impôt de la bande
  dépasse TOUJOURS le crédit et le clamp ne peut pas mordre.
  **Balayages (2026-08-24)** : retraité 70 ans + conjoint, revenu autre 0→60 k$ par pas de 500 $ ×
  6 niveaux de dividende → **23 combinaisons sur 726** où l'excédent serait absorbable, **pire cas
  251 $/an**. Actif sans crédits d'âge : **1 sur 92**, **33 $/an**. Scénario du ticket : **0 $**.
  Consigné en §3 de `docs/FISCAL_REFERENCE.md` avec la cause, les bornes, leurs hypothèses, et ce
  qu'un « correctif » DÉPLACERAIT (il faudrait trancher l'ORDRE entre deux crédits non remboursables
  visant la même assiette — le CID et le crédit-don `[FA-6-CREDIT-CAP]` — ordre qu'aucune source ne
  fixe). Garde : `tests/services/cidClampLimiteConsignee.test.ts`, qui vise les MOTS de la cause et
  jamais le montant. **2 perturbations prouvées rouges.**

Contexte d'origine :

- [ ] **`[FISC-CID-CLAMP-EXCEDENT]`** (S, FAIBLE — ex-« voisin » de DIV-DERIVED-BASES) — le clamp
  `Math.max(0, grossTax − cid)` perd l'excédent annuel de crédit d'impôt pour dividendes au lieu
  de réduire l'impôt des autres revenus (mesuré : 0 $ d'impôt dividendes sur un couple à 1,5 M$
  non-enreg à faible autre revenu, avant comme après — l'excédent du CID est perdu).

## 2026-08-24 — Les compteurs de la sync bancaire disent enfin ce qui a été écrit

- [x] **`[FINTABLE-TXADDED-MENT]`** — `applyPayloadsIsolated` comptait `doc.transactions.length`,
  la taille du PAYLOAD, alors qu'`applyBankStatement` écarte doublons, montants aberrants et lignes
  malformées. Le compteur ment donc le plus fort **dans le cas nominal** d'une sync quotidienne
  (recouvrement total : 3 annoncées, 0 écrites). Il compte désormais le **delta réel** de
  `nextState.transactions`.
  ⚠️ **Les deux compteurs VOISINS avaient la même faute** — trouvés en relisant la boucle plutôt que
  la seule ligne du ticket : `cashUpdated` était posé à `true` même quand `applyCashBalance` ne
  touche à rien (écart < 0,005 $ → état inchangé, `changes: []`), et `debtsUpdated` listait une
  dette « déjà à jour ». Les deux sont **affichés** dans `SystemView` (« Liquidités : mises à jour /
  inchangées »). Ils dérivent maintenant du registre d'écriture (`changes`).
  ⚠️ L'en-tête de `mcp/runFintableSync.ts` AFFIRMAIT déjà la propriété absente (« ses compteurs
  décrivent ce qui a réellement été appliqué ») : une doc qui décrit l'intention se lit comme une
  garantie. Un seul correctif couvre les deux chemins — navigateur et serveur MCP partagent
  `applyPayloadsIsolated`.
  6 tests, dont les deux SENS pour le cash et pour la dette. **3 perturbations prouvées rouges.**

Contexte d'origine :

- [ ] **`[FINTABLE-TXADDED-MENT]`** (XS, MOYEN — MESURÉ, audit PR #649) — `transactionsAdded` compte
  la longueur du PAYLOAD (`syncCore.ts`), pas les écritures réelles ; `applyBankStatement` rend
  pourtant `added.length`. Mesuré : 3 rapportées / 0 écrites. Le toast « N transaction(s)
  ajoutée(s) » est donc faux précisément là où le recouvrement est maximal — ironie : ce lot existe
  pour corriger un compteur qui mentait et en laisse un autre qui ment davantage.

## 2026-08-24 — Deux trous a11y XS : cible tactile des sous-onglets, Échap sur le rail

- [x] **`[A11Y-SUBTABS-TOUCH-TARGET]`** — les onglets faisaient **28 px** de haut (`py-1.5` = 12 px
  + 16 px d'interligne `text-meta`) contre les 44 px du plancher WCAG 2.5.5. Corrigé par la classe
  partagée `touch-target` sur `components/ui/SubTabs.tsx` : **une ligne, trois écrans** (Profil,
  Retraite, Budget), parce que le composant commun existait déjà.
  ⚠️ La garde ne se contente PAS de vérifier la classe : elle relit `index.css` et exige que
  `.touch-target` déclare bien 44 px. Une classe utilitaire renommée est un **no-op silencieux**
  (même famille que « un shade hors palette ne génère rien ») et le test de classe resterait vert en
  ne contraignant plus rien.

- [x] **`[A11Y-SIDEBAR-ESC]`** — le rail latéral se déplie au survol/focus et **rien ne le refermait
  au clavier** (WCAG 1.4.13, « Dismissable »). Échap le replie désormais sans déplacer le pointeur
  ni le focus.
  ⚠️ **Le correctif naïf ne marche pas** : remettre `sidebarFocused` à `false` est annulé au Tab
  suivant, car `onFocus` se redéclenche à chaque élément interne. Il faut un **VERROU**
  (`sidebarDismissed`), levé quand le survol ou le focus quitte réellement l'aside — sinon on
  fabrique l'autre défaut : un rail définitivement fermé pour la session.
  Les libellés repassent en `opacity-0` mais **aucun nom accessible n'est perdu** : chaque item porte
  déjà un `aria-label` quand le rail est replié.
  4 tests, dont le sens INVERSE (revenir sur le rail le rouvre) et « une autre touche ne referme
  rien ». **3 perturbations prouvées rouges.**

Contexte d'origine :

- [ ] **`[A11Y-SUBTABS-TOUCH-TARGET]`** (XS) — les onglets de `SubTabs` font ~28 px de haut (seuil
  `.touch-target` = 44 px). Pré-existant, mais les TROIS écrans convergent maintenant vers ce seul
  composant : un correctif, trois surfaces.
- [ ] **`[A11Y-SIDEBAR-ESC]`** (XS, a11y — audit #598, pré-existant) — la sidebar dépliée au
  survol/focus n'est pas fermable au clavier (Échap) → gap WCAG 1.4.13 (Dismissable). Ajouter
  un keydown Échap qui replie (blur/retour du focus au déclencheur).

## 2026-08-24 — Les CTA passent WCAG AA, et la garde devient bloquante

- [x] **`[A11Y-CTA-CONTRASTE-OFFENDERS]`** — arbitrage de Marc : **corriger les 4 boutons** (plutôt
  que tolérer l'écart au titre du « texte large »). Teintes choisies PAR MESURE, jamais à l'œil, et
  la règle qui en sort est simple : **fond clair → texte sombre, fond saturé → texte blanc**, parce
  que la palette bascule entre le shade 600 et le 700 (le blanc ne passe qu'à partir de 700 ; le
  sombre ne passe que jusqu'à 600).
  - `bg-warning-500` / `-600` et `bg-success-600` : `text-white` → **`text-dark`** (2,15 → **9,28**,
    3,19 → **6,25**, 3,77 → **5,29**). L'ambre et le vert gardent leur teinte.
  - `bg-danger-500` → **`bg-danger-600`** (3,76 → **4,83**), le blanc reste. Les survols descendent
    d'un cran au lieu d'éclaircir : `danger-700` **6,47** (shade AJOUTÉ à la palette).
  - Sites hors scan corrigés au passage parce qu'ils portent la MÊME paire fautive :
    `ui/Button.tsx:24` (variante `danger`, écrite en littéral de variante) et
    `profile/SavedProfilesCard.tsx:121` (classe interpolée) — invisibles au scan, pas au grep.
  ⚠️ **L'extension aux SURVOLS a révélé un 5e offender que personne ne cherchait** : `text-white` sur
  `hover:bg-info-500` → **3,68** (`LifeEvents.tsx:248`, `TaxCenter.tsx:353`), des boutons qui
  ÉCLAIRCISSENT leur fond au survol. Et le correctif déjà appliqué à ce motif dans
  `CeliAssetNudge.tsx` — `hover:brightness-110` — vaut **4,44**, toujours sous 4,5 : il avait déplacé
  le défaut dans un filtre CSS, hors de portée de tout scan de classes. Les trois passent à
  `hover:bg-info-700` (**6,70**, shade ajouté).
  **Dernière étape du ticket livrée** : la passe CTA de `check-contrast.ts` bascule en
  `process.exit(1)`. Et comme la CI ne lance PAS ce script, l'extraction a été sortie dans
  `scripts/lib/ctaContrast.ts` (source unique) et branchée sur une garde Vitest
  `tests/a11y/ctaContrast.test.ts` — 5 tests, dont l'anti-vacuité, la couverture des survols et une
  contre-preuve que le seuil discrimine. **2 perturbations prouvées rouges.**
  Mesure finale : **8 paires / 8 conformes**, extraites de 3 494 attributs `className` littéraux.

Contexte d'origine :

- [ ] **`[A11Y-CTA-CONTRASTE-OFFENDERS]`** (S, 🧭 **décision d'APPARENCE — Marc tranche**) — révélé
  par `[A11Y-CONTRAST-TOOL-GAP-CTA]` en rejouant l'outil étendu : **4 CTA pleins sur 6 échouent
  WCAG AA** (texte normal, seuil 4,5), tous PRÉEXISTANTS. **Mesuré** :
  - `text-white` sur `bg-warning-500` → **2,15** ⚠️ échoue même le seuil « texte large » (3,0).
    Site : `components/ui/ProjectionRequired.tsx:63`.
  - `text-white` sur `bg-warning-600` → **3,19**. Sites : `ProjectionRequired.tsx:63` (état survol),
    `transactions/DuplicatesPanel.tsx:150`, `transactions/CategoryReviewPanel.tsx:166`.
  - `text-white` sur `bg-danger-500` → **3,76**. Sites : `settings/BackupPanel.tsx:402`,
    `DebtManager.tsx:161` (survol), `aiChat/AiChatView.tsx:500`.
  - `text-white` sur `bg-success-600` → **3,77**. Site : `transactions/CategoryReviewPanel.tsx:160`.
  Conformes : `bg-danger-600` (4,83) et `bg-info-600` (5,17).
  ⚠️ **Pourquoi Marc et pas Claude** : changer la couleur d'un bouton est une décision d'apparence,
  pas un correctif mécanique — et le dépôt interdit de choisir un shade au jugé (« par MESURE,
  jamais à l'œil »). Options à trancher : assombrir le fond (700), passer le texte en `text-dark`
  sur les fonds clairs (le jaune surtout), ou accepter l'écart pour les libellés en gras ≥ 14 px
  (qui relèvent du seuil « texte large » à 3,0 — ce qui sauverait 3 des 4, mais PAS le 2,15).
  **Dernière étape une fois tranché** : basculer la passe CTA de `check-contrast.ts` en
  `process.exit(1)` (elle rapporte sans bloquer aujourd'hui, à dessein et c'est écrit dans le
  script) pour que la régression devienne impossible.


## 2026-08-24 — Le levier Smith cesse d'être flatteur : la marge suit le prêt

- [x] **`[SMITH-HELOC-TAUX-FIGE]`** — décision Marc : « la marge suit l'hypothèque ». Le taux du
  levier Smith n'est plus un littéral figé à 5 % ; `smithHelocAnnualRate(goal.mortgageRate)` rend
  `hypothèque + 2 points`, avec un plancher à 3 % (un bien sans taux saisi donnerait sinon une marge
  quasi gratuite, donc un levier artificiellement gagnant — le biais même qu'on corrige).
  ⚠️ Ce taux n'alimente pas un affichage mais un **classement** : `useSmithManoeuvre` fait partie de
  l'espace de recherche de stratégies, donc il décide de ce que l'app RECOMMANDE. Le 5 % figé pouvait
  passer SOUS le taux du prêt — une marge révolvante moins chère que le prêt de premier rang qu'elle
  accompagne, impossible en pratique, et flatteuse **précisément** quand les taux montent.
  **Mesuré** (30 ans, célibataire 8 000 $/mois, maison 500 k$, rendement 6 %), gain du levier :
  hypothèque 3 % → **+639 889 $ inchangé** (la marge y vaut 5 %, comme avant : non-régression) ;
  5 % → **+489 760 $ → +413 769 $** ; 8 % → **+275 001 $ → +32 263 $**, soit **242 738 $ d'avantage
  fantôme retirés**.
  ⚠️ La DIRECTION est structurelle, la MAGNITUDE est une hypothèse assumée : les 2 points ne sont pas
  un écart de marché relevé quelque part, et le module le dit plutôt que d'inventer une source.
  7 tests neufs, 3 perturbations rouges. **Deux gardes existantes ont rougi, comme elles devaient** :
  la garde de LIMITE de `[CONSTANTES-MOTEUR-NON-SOURCEES]`, **inversée plutôt que supprimée**, et le
  test voisin de `realEstateMonth` dont la fixture coïncidait avec l'ancien taux figé.
  ⚠️ Aucun golden n'a bougé, et c'est VÉRIFIÉ : aucun n'active le levier.
  Gate vert : 4 691 tests / 425 fichiers (après rebase sur #707).
## 2026-08-24 — Les crédits d'âge 65+ entrent enfin dans l'inversion net→brut

- [x] **`[GROSSFROMNET-CREDITS-65]`** — instruit d'abord (mesures + obstacles + trois options), puis
  livré après arbitrage de Marc : **tout câbler, moteur inclus**.
  `calculateGrossFromNet` accepte `ageOpts` (optionnel, défaut NEUTRE, même forme que `year`), et les
  **quatre** appelants de production le passent PAR UTILISATEUR via la source unique
  `ageOptsForSalaryInversion` : `Retirement`, `TaxCenter` — aux **DEUX bouts** de son aller-retour,
  car les crédits y manquaient des deux côtés, ce qui était au moins cohérent (n'en câbler qu'un
  aurait été pire que le défaut) —, `buildSimulationParams`, et le socle `computeIncomeBaseline`,
  dont le type `users` a dû être élargi pour recevoir `age`/`birthYear` : l'âge ne lui parvenait même
  pas.
  ✅ **Les chiffres du ticket étaient exacts au dollar près** (+1 904 $ à 36 k$ de net, +1 018 $ à
  48 k$, +391 $ à 60 k$). J'ai failli le déclarer faux en mesurant côté BRUT alors qu'il annonçait —
  et NOMMAIT — un écart en NET ; leçon écrite.
  Mesures ajoutées : côté brut, **+3 041 $ à 30 k$ de net (6,7 % du net)**, et l'écart **disparaît
  au-dessus de ~80 k$** — le défaut mordait surtout EN BAS. Le cas COUPLE diffère du SOLO
  (+2 527 $ contre +3 004 $ à 36 k$) : `hasSpouse` est dérivé du nombre d'ACTIFS, pas de
  `users.length`. Contre-épreuve à 64 ans : écart exactement 0.
  ⚠️ **Aucun golden n'a bougé, et c'est EXPLIQUÉ** : l'effet exige 65+ **ET** aucun brut saisi, or les
  fixtures en ont toutes un. Deux tests construisent le profil manquant pour prouver que le câblage
  moteur n'est pas inerte.
  10 tests neufs, **3 perturbations prouvées rouges**. Gate vert : 4 684 tests / 424 fichiers.

## 2026-08-24 — `@types/adm-zip` retiré : knip avait raison, et la cause est instruite

- [x] **`[DETTE-KNIP-ADMZIP]`** — le ticket posait la bonne question sans trancher : « le paquet
  `adm-zip` lui-même est-il encore employé (auquel cas ses types le sont indirectement, et c'est knip
  qui a tort), ou les deux sont-ils morts ? ». **Les deux propositions étaient vraies en même temps**,
  et c'est ça le piège. `adm-zip` est bien vivant (`mcp/pack.mjs` l'importe, le script `mcp:pack`
  l'exécute) — mais ce consommateur est un fichier **`.mjs`**, et `tsconfig.json` pose
  `allowJs: true` **sans `checkJs`** : le fichier est inclus dans le projet TypeScript et n'est
  JAMAIS typé. `@types/adm-zip` fournissait donc ses déclarations à personne.
  Tranché par l'**expérience** plutôt que par la lecture de la config : retrait du paquet →
  `npm run typecheck` reste **VERT**, et knip ne signale plus **aucune** dépendance inutilisée ; le
  runtime est intact (`import('adm-zip')` résout, `node --check mcp/pack.mjs` passe).
  ⚠️ **Aucune garde ajoutée, et c'est délibéré** : si quelqu'un importe un jour `adm-zip` depuis un
  fichier TypeScript, `tsc` échouera de lui-même sur la déclaration manquante. La protection existe
  déjà. Un lot peut se terminer sans test neuf, à condition de DIRE quel mécanisme tient le rôle.
  Gate vert : 4 674 tests / 423 fichiers (après rebase sur #705 ; inchangé par ce lot — aucun test ajouté).

## 2026-08-24 — Les tranches d'imposition suivent l'année, et le biais COMPOSE

- [x] **`[TAXBRACKETVIZ-ANNEE]`** — `TaxBracketViz` dessinait les paliers 2026 bruts et calculait son
  total à l'année 2026 par défaut, alors que le brut reçu de `Retirement` est déduit au barème de
  l'année COURANTE. Paire désaccordée (`CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE`).
  **Livré** : `year` devient une prop **REQUISE** (aucun défaut : un `= 2026` se périme en silence,
  et lire l'horloge dans le composant en ferait une bombe au 1er janvier), utilisée pour les barres
  ET le total. Nouvel export `bracketsForYear` dans `utils/tax.ts`, qui lit
  `getIndexedBracketsForYear` — la source dont `calculateFiscalReport` tire son impôt, jamais une
  ré-indexation recopiée. Côté `Retirement`, une SEULE lecture d'horloge alimente les deux côtés.
  ⚠️ **Le chiffre du ticket était faux, et sa NATURE aussi.** « 333 $ sur 86 968 (0,4 %) dès 2027 —
  visuellement invisible » avait valu le classement FAIBLE. RE-MESURÉ sur l'impôt total :
  **+212 $ (1,0 %) en 2027, +874 $ (4,4 %) en 2030, +2 069 $ (11,1 %) en 2035** à 86 968 $ de brut,
  et **+5 095 $ à 200 000 $ en 2035**. L'écart vient d'une indexation ignorée, donc il **COMPOSE** à
  ~2 %/an : un point de mesure unique ne pouvait pas le dire.
  6 tests neufs, **3 perturbations prouvées rouges** — dont les DEUX demi-correctifs que le ticket
  interdisait à juste titre, chacun produisant une incohérence VISIBLE entre des barres et la somme
  affichée juste en dessous. Gate vert : 4 674 tests / 423 fichiers (après rebase sur #704).
## 2026-08-22 — La bascule CELI→REER est réelle, et la fixture qui l'a cachée trois fois

- [x] **`[AUTOMARGINAL-BASCULE-SILENCIEUSE]`** — la bascule est **RÉELLE**, mesurée : `reerFirst`
  passe de `false` à `true` à l'année 9, quand le taux marginal franchit 0,411 (célibataire
  7 000 $/mois, croissance 3 %). Le ticket se trompait sur DEUX points. (1) « Pour TOUTE la
  projection » est faux — `marginal` est recalculé CHAQUE mois sur le brut indexé : c'est une
  FRONTIÈRE MOBILE (jamais à croissance nulle, plus tôt à 9 000 $/mois). (2) La surface proposée
  était mauvaise — `stratDescription` est rendu en `truncate` (invisible,
  `UX-UNREACHABLE-FEATURE`) et la seule réponse de FAQ existante parle des **RETRAITS** : y greffer
  un fait de COTISATION l'aurait rendue fausse. **Livré** : une entrée de FAQ DÉDIÉE à l'ordre de
  cotisation, rendue en entier, qui nomme le seuil de 40 % ET la mobilité.
  ⚠️⚠️ **La découverte la plus utile du lot est méthodologique.** Ma première fixture (dépenses
  3 200 $/mois) donnait un surplus de ~29 k$/an contre un plafond CELI de ~8,5 k$ : les deux comptes
  se remplissaient de toute façon, l'ORDRE devenait inobservable, et la sortie d'`AUTO_MARGINAL`
  était à 1 000 $ près identique à `CELI_FIRST` sur 25 ans. J'ai conclu **trois fois de suite** que
  la bascule n'existait pas, en lisant le code, ses appelants et le câblage du levier. C'est
  l'instrumentation du moteur qui a tranché en une exécution. Fixture corrigée à 4 400 $/mois : le
  surplus passe sous le plafond, tout devient net.
  5 tests neufs, **3 perturbations prouvées rouges** — dont la fixture saturante, qui rend rouge le
  test du levier et inscrit le piège dans le dépôt. Gate vert : 4 668 tests / 422 fichiers.

## 2026-08-22 — Un flake non reproduit, mais réfuté et rendu lisible

- [x] **`[FLAKE-DIVORCE-INCOME-PHANTOM]`** — le ticket concluait « flake d'ORDRE ou de PARALLÉLISME »
  et prescrivait `--repeat` + `--sequence.shuffle`. **Non reproduit** : 8 exécutions vertes sur le
  même commit (5 isolées, 3 suites complètes). Ce qui a été productif, c'est d'avoir RÉFUTÉ chaque
  hypothèse par une mesure : `vitest.config.ts` pose `fileParallelism: false` (aucun parallélisme de
  fichiers — trente secondes de lecture de config, avant de lancer l'outil recommandé par le
  ticket) · durées dans la suite complète = durées en isolation (2 289/1 888/1 343 contre
  2 400/1 838/1 417 ms) · RNG entièrement graine (`buildSeededRng`) et **zéro** `new Date()` /
  `Date.now()` dans toute la chaîne Monte-Carlo · marge d'assertion mesurée `perte = 1,132` contre
  un seuil de 0,5, le scénario divorcé finissant à −644 980 $.
  ⚠️ **Il ne restait qu'un mécanisme capable de rendre l'assertion rouge sans toucher au code — une
  grandeur ABSENTE — et celui-là était RÉEL.** `P50` est annulable côté moteur
  (`d.P50 = mcResult.p50Data[i] ?? null`) et le helper la convertissait en `NaN` par un `?? NaN` : le
  test comparait ce `NaN` à un seuil et son message **accusait le moteur d'un défaut d'argent
  inexistant**. C'est `GARDE-AU-PRODUCTEUR-NE-PROUVE-PAS-LA-CHAINE`, leçon déjà indexée — une leçon
  écrite ne s'applique pas toute seule aux tests déjà en place.
  **Livré** : le helper EXIGE la mesure avant de comparer, sur les deux grandeurs qu'il publie.
  Perturbation (P50 forcé à `null`) : ancien message « expected NaN to be greater than 0.5 », nouveau
  « P50 ABSENT du dernier point ». La tolérance n'a PAS été élargie — c'est la garde d'un défaut réel.
  Gate vert : 4 663 tests / 421 fichiers (aucun test ajouté : les mêmes assertions, rendues honnêtes).

## 2026-08-22 — Le garde fiscal voit enfin les barèmes passés en ARGUMENT

- [x] **`[FISC-GUARD-ARGUMENT]`** + **`[FISC-GUARD-BENIGN-60]`** — livrés ENSEMBLE, comme le ticket
  l'exigeait : le `60` d'anticipation de la RRQ était caché DEUX fois, par l'exemption `BENIGN` et par
  sa position d'ARGUMENT. Corriger l'un sans l'autre ne l'aurait pas révélé.
  ⚠️ **L'arbitrage du ticket était faux, et son inverse aussi.** Le ticket annonçait « ~1 clé fiscale
  pour ~15 de bruit ». Re-mesuré : le motif large `/[(,]$/` rend **26 clés neuves dont 16 fiscales**.
  Mais **14 de ces 16 sont les ÂGES de la table FERR**, déjà décrits par les 24 entrées de TAUX
  (`RRIF_RATES[73]` nomme son âge dans sa raison) : fiscales, neuves comme clés, et n'ajoutant
  **aucune protection**. Le motif retenu `/\w\($/` (1er argument d'un APPEL) rend **11 clés + 3
  comptes** et attrape les **deux seuls barèmes réellement non protégés** — l'âge 18 de début de la
  période cotisable RRQ et la borne 60 d'anticipation. **100 % de la protection pour 42 % des
  entrées.** Il évite en prime le faux positif du motif large : « (18 ans) » dans un MESSAGE
  utilisateur de `childrenReee.ts` (`SCAN-QUI-MATCHE-LA-PROSE`, dans un littéral de CHAÎNE cette fois
  — hors de portée de `stripComments`).
  Les 11 entrées sont triées à la main en lisant le BLOC, pas la ligne : 2 `fiscal`, 6 `design`,
  3 `structural`. Trois comptes existants passent en `[≠3]`/`[×2]` avec leurs sens nommés.
  3 tests neufs, **3 perturbations prouvées rouges**. Gate vert : 4 663 tests / 421 fichiers.

## 2026-08-22 — Quatre hypothèses de modèle nommées, et une décision qui remonte à Marc

- [x] **`[CONSTANTES-MOTEUR-NON-SOURCEES]`** — ticket étiqueté **XS / FAIBLE** (« trois littéraux en
  dur dans des champs publiés »). La mesure l'a **reclassé** : les trois constantes ne partageaient
  qu'une FORME, pas un enjeu. Le taux de la marge du levier Smith pilote une **fonction objectif** —
  `useSmithManoeuvre` fait partie de l'espace de recherche de stratégies, donc ce nombre décide de ce
  que l'app RECOMMANDE : mesuré sur 30 ans, le gain annoncé du levier va de **+533 577 $ (marge 3 %)
  à +146 425 $ (marge 10 %)**, soit **343 335 $ d'amplitude**, et à 10 % la succession passe SOUS le
  scénario sans levier — **le conseil s'inverse**. À l'opposé, `CoastFIRE` et `BaristaFIRE` sont
  publiés au contrat et lus par **personne** (balayage de `components/ hooks/ utils/ mcp/
  services/aiChat/`, avec `FireTarget` en contre-épreuve) : leur incohérence est réelle et sa portée
  est nulle.
  Un **4e site** manquait à la liste du ticket : le multiple 25× de la règle des 4 % existait en DEUX
  copies anonymes, dont une seule portait sa justification.
  **Livré** : `services/projection/modelAssumptions.ts`, où chaque nombre est nommé avec sa PORTÉE
  MESURÉE et son STATUT. ⚠️ **PAS dans `FISCAL_REFERENCE.md`** — ce sont des hypothèses de modèle,
  qu'aucune autorité ne publie ; les y ranger leur prêterait l'autorité d'un texte de loi.
  ⚠️ **Aucun comportement changé** : les deux corrections possibles sont routées en tickets
  (`[SMITH-HELOC-TAUX-FIGE]`, décision produit pour Marc ; `[COASTFIRE-CROISSANCE-FIGEE]`, XS gaté
  par « ce champ a-t-il un consommateur ? »).
  Le ratchet fiscal a rougi **sur ce commit** en constatant que `0.05` avait quitté
  `realEstateMonth.ts` : le module d'hypothèses a donc été AJOUTÉ au périmètre scanné et les entrées
  ré-inventoriées (`[≠2]`, deux sens nommés) — nommer une constante ne doit jamais la faire changer
  de cachette.
  7 tests neufs, **3 perturbations prouvées rouges** (multiple nu restauré ; marge suivant
  l'hypothèque → 297 % d'écart contre une borne mesurée à 1 % ; consommateur `CoastFIRE` ajouté).
  Gate vert : 4 660 tests / 421 fichiers.

## 2026-08-22 — `[W5-DOUBLE-SAISIE-LOCATIF]` : un même immeuble peut compter deux fois

- [x] **`[W5-DOUBLE-SAISIE-LOCATIF]`** (XS, FAIBLE — ticket marqué « [À vérifier] », donc INSTRUIT
  avant d'écrire une ligne de code). **Vérifié : le défaut est réel.** Un immeuble locatif peut être
  saisi dans DEUX écrans sans aucun lien entre eux :
  · onglet Immobilier → `RealEstateGoal.rentalIncomeMonthly` → revenu + `accRentesYear`, imposé au
    barème **RÉEL** en décembre (`realEstateMonth.ts`) ;
  · Réglages → Patrimoine → `RentalProperty` → NOI, imposé au **FORFAIT** W5 (`w5Effects.ts`).
  Les deux producteurs s'ADDITIONNENT et **aucun ne consulte la structure de l'autre** (vérifié par
  scan de source, c'est la 1re assertion du test) : rien ne peut dédupliquer. Loyer compté deux
  fois, impôt calculé deux fois par deux mécanismes distincts.
  **Livré : une note UX conditionnelle aux DEUX écrans.** Corriger un seul côté aurait laissé
  l'autre porte grande ouverte — le lot précédent (`tickLtd`) venait de rappeler ce piège.
  ⚠️ **Ce que ce lot NE fait PAS, et c'est un choix** : il ne tente pas de détecter que « c'est le
  même immeuble ». Les deux structures n'ont aucun identifiant commun, et les rapprocher par leur
  NOM serait une heuristique de texte sur du texte UTILISATEUR
  (`TEXT-HEURISTIC-OVER-USER-TEXT`) — « Plex Papineau » vs « 4-plex » échapperait en silence, et une
  détection qui rate discrètement est pire que pas de détection. L'avertissement repose donc sur un
  fait **STRUCTUREL** (les deux listes sont non vides) et ne PRÉTEND rien : il demande de vérifier.
  ⚠️ **Asymétrie assumée des deux compteurs**, expliquée dans le code : côté Immobilier on filtre
  (`!isPrimaryResidence && rentalIncomeMonthly > 0` — la condition EXACTE du moteur, sinon on
  avertirait pour une résidence principale qui ne produit aucun loyer) ; côté W5 on ne filtre pas
  (un `RentalProperty` est locatif par nature, et alimente le NOI même à loyer nul — dépenses
  seules). Filtrer sur `monthlyRent > 0` y raterait un doublon réel.
  5 tests neufs, dont **la preuve que le double comptage est possible** (sans elle, l'avertissement
  serait une précaution invérifiée, donc du bruit qu'on finit par retirer) et les DEUX sens de la
  condition — apparition ET non-apparition, car une alarme permanente s'ignore. 1 perturbation
  prouvée rouge. Gate vert : 4 653 tests / 420 fichiers.

## 2026-08-22 — Deux limites fiscales CONSIGNÉES avec leur cause (pas corrigées)

> Les deux tickets demandaient explicitement de **documenter une limite assumée**, l'un d'eux avec
> la mention « ne PAS corriger à l'aveugle ». Livrer ici, c'est donc écrire une explication — et la
> GARDER, pour qu'elle ne se périme pas en silence.

- [x] **`[TAXDEC-BANDE-ACTIVE-BASE-BRUTE]`** (XS, FAIBLE) — chez un non-retraité, `incomeForGains`
  est le salaire **BRUT** alors que le crédit d'âge s'érode sur le revenu **NET des déductions**
  (REER + CELIAPP) : l'érosion de la bande part d'une base plus haute que celle du crédit lui-même
  → sous-facturation bornée.
  **RE-MESURÉ plutôt que recopié** (balayage 20 k$ → 160 k$ par pas de 500 $, cotisation au plafond
  ANNUEL légal = 18 % du brut + 8 000 $ CELIAPP) : **1 052,51 $/adulte/an** au maximum, à 75 500 $
  de brut. ⚠️ Le ticket avançait « ~1 153 $ » — chiffre NON retrouvé, d'où sa re-dérivation
  (`ECRIRE-UN-CHIFFRE-FISCAL-SANS-LE-MESURER-FABRIQUE-SA-SOURCE` : on ne recopie pas une mesure
  qu'on n'a pas refaite). ⚠️ Et **une borne sans son hypothèse est fausse** : celle-ci vaut pour la
  cotisation de l'ANNÉE seule ; avec un rattrapage de droits REER accumulés — courant à 65 ans et
  parfaitement légal — l'écart monte à **1 482,78 $** (mesuré, 32 000 $ cotisés sur 75 k$). Les deux
  chiffres ET leur hypothèse sont écrits.
- [x] **`[TAXDEC-SPLIT-EGAL-VS-PERUSER]`** (XS, FAIBLE) — le crédit d'âge fédéral s'érode sur le
  revenu **individuel** (`taxableRealByUser[i]`), la bande répartit à parts **ÉGALES**
  (`incomeForGains / N`) : sur un couple 90/10, crédit accordé et crédit érodé ne portent pas sur la
  même personne. Approximation **PRÉ-EXISTANTE** des paliers, étendue aux crédits par
  `[FISC-TAXDEC-INCR]` — pas un défaut né du lot. Consignée avec l'interdiction explicite de la
  corriger à l'aveugle : son signe dépend du profil, l'aligner naïvement DÉPLACERAIT l'écart au lieu
  de le fermer et re-baserait les goldens.

⚠️ **Ce que ce lot corrige vraiment** : les deux écarts étaient DÉJÀ chiffrés en §4 (« 69 à
1 130 $ », « −345,72 $ ») — mais leur MÉCANISME n'était nommé nulle part. Un écart chiffré sans
cause invite le lecteur suivant à le « corriger ». C'est la RAISON qui manquait, et c'est elle que
la nouvelle garde protège.
Garde `tests/services/taxDecemberLimitesConsignees.test.ts` (5 assertions) : elle vérifie que la
CAUSE et ses hypothèses sont écrites, **sans figer les bornes au dollar** — une borne dépend
d'hypothèses et se re-mesure ; l'ancrer ferait de ce test une bombe au premier changement
d'indexation. Perturbations prouvées : section supprimée → 5 rouges, hypothèse de cotisation
retirée → 1 rouge.
Gate vert : 4 648 tests / 419 fichiers, build inclus.
## 2026-08-21 — Dette technique XS : deux angles morts qui rendaient le code INTROUVABLE

> Lot réuni non par la zone touchée mais par le SYMPTÔME : dans les deux cas, du code parfaitement
> vivant paraissait mort — à un outil dans un cas, à un `grep` dans l'autre. Les deux ont déjà
> produit une conclusion FAUSSE écrite dans le dépôt.

- [x] **`[DETTE-KNIP-API-ENTRY]`** (XS, FAIBLE) — `knip.json` ne déclarait pas `api/**/*.ts` en
  point d'entrée, alors que `api/claude/[...path].ts` est une fonction Edge **routée par la
  plateforme Vercel**, donc sans importateur dans le dépôt. Elle ressortait en « fichier inutilisé »
  à chaque exécution. Le coût n'est pas le faux positif lui-même mais ce qu'il ANESTHÉSIE : un
  scanner de code mort qui signale du code vivant apprend à être ignoré, et le vrai code mort futur
  de `api/` sera lu comme du bruit habituel. **Rejoué après correctif** : le fichier disparaît de la
  liste, et l'export `anthropicError` (`api/_lib/relay.ts`) sort AUSSI des 80 « exports inutilisés »
  — il n'était signalé que parce que son consommateur n'était pas analysé (80 → 79).
- [x] **`[DETTE-DEPRECATED-DRAWDOWN]`** (XS, MOYEN) — l'alias `@deprecated optimizeDrawdownOrder`
  était **encore le seul chemin** par lequel `GoalSeekerCard` appelait `compareLifeScenarios`. Un
  alias « pour ne pas casser les consumers » qui n'a jamais rien protégé : il maintenait un second
  nom pour la même fonction, marqué obsolète et pourtant vivant en production.
  ⚠️ **Son coût réel était une DÉSINFORMATION, déjà matérialisée** : un `grep` sur
  `compareLifeScenarios` ne trouvait aucun appelant, d'où la conclusion « module orphelin » —
  écrite noir sur blanc dans un commentaire de `drawdownOptimizer.ts`, puis corrigée par la revue
  #683 qui avait dû découvrir l'alias. Un alias déprécié rend le code cherchable par deux noms,
  donc INTROUVABLE par un seul. Le commentaire est réactualisé au même commit.
  Renommage bit-identique (l'alias était `= compareLifeScenarios`, pas une adaptation de signature).
  Le test qui vérifiait « l'alias pointe bien sur la fonction » est supprimé avec lui : c'était une
  tautologie sur une ligne d'affectation, et la seule chose qu'il protégeait était le second nom.

Gate vert : 4 643 tests / 418 fichiers (−1 : le test tautologique de l'alias), build inclus.
Découverte au passage, NON traitée (hors périmètre) : `@types/adm-zip` est signalé comme dépendance
de développement inutilisée — routé en `[DETTE-KNIP-ADMZIP]`.

## 2026-08-21 — `[JOBLOSS-DUREE-N-PLUS-1]` + `[ASSETLOC-INCLUSION-RECOPIEE]` : une durée qui vaut N, et une constante qui vient de sa source

- [x] **`[JOBLOSS-DUREE-N-PLUS-1]`** (XS au ticket, **money-critical en pratique**) — une perte
  d'emploi configurée à N mois en produisait **N+1**. Le mois du DÉCLENCHEMENT est déjà un mois de
  chômage (l'appelant réduit le revenu dès `triggered`), et le code posait ensuite un compteur de
  N mois SUPPLÉMENTAIRES. Le log annonçait pourtant « durée prévue 6 mois » : l'intention était
  claire, seul le code était faux.
  **MESURÉ en rejouant la boucle réelle** : 6 → **7**, 12 → **13**, 24 → **25**, et surtout
  **1 → 2 (+100 %)** — le pire ratio, et celui qu'un test « durée moyenne » ne montre jamais.
  ⚠️ **Le ticket ne parlait que du chômage. `tickLtd` (invalidité longue durée) portait EXACTEMENT
  le même défaut** — trouvé en vérifiant le jumeau (règle « énumérer TOUS les producteurs »,
  `MODULE-ECRIT-HORS-CHECKLIST`). Corriger le chômage SEUL aurait désaccordé deux mécaniques
  jusqu'ici cohérentes — toutes deux fausses du même cran — ce qui est pire que ne rien faire
  (`CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE`). Les deux sont corrigés.
  ⚠️ **DEUX tests figeaient le défaut**, l'un sur le producteur (`stochasticEvents.test.ts`),
  l'autre sur l'appelant (`activeIncome.test.ts`) — cohérents entre eux et faux ensemble. Chacun
  vérifiait que le compteur valait ce que le code y mettait, sans jamais compter les mois VÉCUS :
  `newMonthsRemaining = 8` est défendable en isolation, il ne devient faux qu'en sachant que
  l'appelant a déjà servi le mois courant (`GARDE-AU-PRODUCTEUR-NE-PROUVE-PAS-LA-CHAINE`). Le test
  neuf rejoue la condition exacte du consommateur et compte les mois — il ne reconstruit pas le
  calcul testé. 4 assertions prouvées rouges par perturbation.
- [x] **`[ASSETLOC-INCLUSION-RECOPIEE]`** (XS, MOYEN) — `assetLocation.ts` écrivait
  `marginalRate * 0.5`, seul site du dépôt à recopier le taux d'inclusion des gains en capital
  (six autres modules importent `CAPITAL_GAINS_INCLUSION_STANDARD`). Il était invisible parce que
  `0.5` figurait dans la liste `BENIGN` du garde fiscal — **l'exclusion cachait la copie**
  (`AUDITER-LE-FILTRE-AUTANT-QUE-LA-LISTE`). Bit-identique tant que le taux vaut 50 %, et c'est
  l'intérêt : le jour où il change, ce site suivra au lieu de rester seul en arrière.

Gate vert : 4 644 tests / 418 fichiers, build inclus.

## 2026-08-21 — Lot a11y XS : le % de répartition masqué, et l'outil de contraste qui voit enfin les boutons

- [x] **`[A11Y-PCT-NOT-MASKED]`** (XS, FAIBLE) — dans `NetWorthByOwnerCard`, le montant par personne
  passait par `PrivateAmount` mais le **pourcentage juste à côté** non. Motif
  `PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI` : la garde existait sur la ligne VOISINE.
  ⚠️ **Ce lot fixe un ARBITRAGE qui va contre la règle générale du dépôt**, et c'est écrit dans le
  test plutôt que subi. `Investments.privacy.test.tsx` pose en toutes lettres que « les
  pourcentages restent visibles, à dessein : ce sont des ratios, pas des sommes ». Vrai pour un
  portefeuille (40 % en actions ne dit rien de la personne) ; **faux entre deux conjoints** —
  « 70 % / 30 % » est une information RELATIONNELLE, reste lisible quand les dollars sont masqués,
  et parle du couple, pas du portefeuille. Le dépôt masquait d'ailleurs déjà un `%` selon le
  contexte (`FutureKpiStrip`, drapeau `privateSublabel`) : la règle n'était pas « jamais un
  pourcentage » mais « pas les ratios anodins ». Le libellé du poste reste en clair — masquer ne
  doit pas retirer le discriminant du nom accessible (`MASQUAGE-RETIRE-UN-DISCRIMINANT`), sinon les
  trois tuiles deviennent « ••• / ••• » trois fois.
  3 tests (garde de SOURCE, pas de rendu : atteindre ce composant exige un état de couple complet,
  et un test de rendu qui n'atteint pas le site le ferait croire couvert), 1 prouvé rouge par
  perturbation, avec anti-vacuité explicite.

- [x] **`[A11Y-CONTRAST-TOOL-GAP-CTA]`** (XS, FAIBLE) — `check-contrast.ts` ne testait que
  `text-*` sur les 3 fonds de page : un bouton plein (`bg-danger-600` + `text-white`) n'y
  apparaissait JAMAIS. Trou de couverture de l'**outil-arbitre** — celui-là même dont le dépôt se
  sert pour trancher « par mesure, jamais à l'œil ».
  **Paires EXTRAITES DU CODE PEINT** (3 492 attributs `className` littéraux balayés), jamais
  devinées : une liste écrite à la main teste des combinaisons mortes et rate les nouvelles —
  exactement le défaut que l'en-tête du script décrit déjà pour les tokens
  (`A11Y-CHECK-CONTRAST-DRIFT`). Angle mort DÉCLARÉ dans le script : les `className` construits par
  interpolation échappent au scan ; un plancher (200 attributs, 5 paires) empêche la passe de
  devenir vide et donc faussement verte.
  ⚠️ **Rejouer l'outil a révélé 4 offenders préexistants sur 6** (règle « resserrer le scan-garde
  AVANT de coder le fix : les offenders révélés = le vrai périmètre ») — dont `text-white` sur
  `bg-warning-500` à **2,15**, sous le seuil même pour du texte large. **NON corrigés ici** :
  changer la couleur d'un bouton est une décision d'apparence qui appartient à Marc. Routés,
  chiffrés et localisés en `[A11Y-CTA-CONTRASTE-OFFENDERS]`, dont la dernière étape est de basculer
  la passe en `process.exit(1)`. La passe rapporte donc sans bloquer aujourd'hui — choix assumé et
  daté DANS le script : la rendre bloquante d'emblée livrerait un outil rouge à sa première
  exécution, ce qui apprend à ignorer sa sortie.
  ⚠️ Erreur commise en chemin, attrapée en rejouant : `__dirname` n'existe pas en module ES
  (`"type": "module"`) — dérivé de `import.meta.url`.

Gate vert : 4 641 tests / 418 fichiers, build inclus.

## 2026-08-21 — `[ENV-NODE-NON-DECLARE]` : la version de Node se déclare une fois, et le TYPECHECK la fait respecter

- [x] **`[ENV-NODE-NON-DECLARE]`** (XS, MOYEN) — le conteneur de dev tourne sur **Node 22**, les
  workflows épinglent **Node 20**, et rien ne déclarait la cible (`engines` absent, `.nvmrc` absent,
  littéral `'20'` répété dans **4 workflows**). Incident réel du 2026-08-19 (PR #665) : `globSync`
  (`node:fs`, Node 22+) a donné un **gate local VERT et une CI ROUGE sur le même commit**.
  **Livré** : `.nvmrc` (source unique), `engines.node: '20.x'`, et les 4 workflows repointés sur
  `node-version-file: '.nvmrc'` — plus aucun littéral de version dupliqué.
  ⚠️ **Le vrai coupable n'était aucun des deux que le ticket nommait.** `engines` et `.nvmrc`
  DÉCRIVENT la cible sans l'imposer à quoi que ce soit : sans `.npmrc` `engine-strict` (absent ici),
  `engines` n'est qu'un avertissement npm. Ce qui transforme la classe entière en **erreur de
  compilation**, c'est `@types/node`, qui était en `^22` face à une CI en Node 20 : le typecheck
  autorisait des API que le runtime de la CI n'a pas. Aligné sur `^20`. **Mesuré avant de le
  faire** : le typecheck passe sous `@types/node@20`, donc aucun code n'utilisait d'API 22+ — la
  garde est posée sur un arbre propre, elle ne masque aucune dette existante.
  Nouvelle garde `tests/nodeVersionDeclared.test.ts` (4 assertions) : les trois déclarations
  existent ET concordent, et aucun workflow ne re-code la version. Elle ne fige PAS le numéro 20 —
  passer à Node 22 reste possible, mais exige de bouger les trois ensemble
  (`CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE` appliqué à la version de Node). Deux anti-vacuités
  posées : au moins un workflow balayé, au moins 4 pointeurs trouvés (sinon supprimer tous les
  `setup-node` rendrait le test vert). **3 perturbations prouvées rouges**, une par assertion.
  Gate vert : 4 638 tests / 417 fichiers.

## 2026-08-21 — `[ASSETLOC-YEAR-2026]` : l'année fiscale devient une entrée EXIGÉE

- [x] **`[ASSETLOC-YEAR-2026]`** (XS, FAIBLE au ticket — **impact mesuré plus élevé que son
  étiquette**) — `assetLocation.ts` lisait le taux marginal avec `input.year ?? 2026`, et l'unique
  appelant de production (`AssetLocationCard`) ne passait JAMAIS `year` : le repli s'appliquait donc
  **toujours**, et le module aurait conseillé sur le barème 2026 à perpétuité.
  **Écart MESURÉ sur le taux marginal** (avant de coder) : nul pour la plupart des revenus, mais
  **−5,000 points à 55 000 $ dès 2027** (30,690 % → 25,690 %) — un revenu juste au-dessus d'une
  borne de palier en 2026 repasse dessous une fois la borne indexée. À 2030 : 60 000 $ perd
  5,4 pts, 120 000 $ en perd 4,6. L'erreur n'est pas diffuse : elle est CONCENTRÉE près des bornes,
  et c'est ce qui rend un test bâti sur un revenu « rond » (100 000 $) VACUEUX — les deux années y
  donnent le même taux.
  **Correctif** : `year` rendu **REQUIS** dans `AssetLocationInput`. Écarté : « défaut = année
  courante », qui rendrait cette fonction pure non déterministe et transformerait chaque test
  l'omettant en bombe à retardement (rouge au 1er janvier, sans changement de code — piège déjà
  vécu dans ce dépôt). Un champ requis casse au TYPECHECK sur chaque site, présent et futur.
  ⚠️ **La garde anti-entrée-fantôme a rougi d'elle-même sur ce commit** : l'inventaire
  `fiscalConstGuardV2.ts` portait une entrée `assetLocation.ts::2026` décrivant précisément le
  défaut que ce lot ferme, et le littéral ayant disparu, l'entrée est devenue un constat périmé.
  Retirée. C'est exactement le rôle de cette garde (`ENTREE-D-INVENTAIRE-FANTOME` : un inventaire
  de dette doit DÉCROÎTRE) — elle a fonctionné sans intervention.
  3 tests neufs, dont un prouvé rouge par perturbation (année re-figée à 2026), avec assertion de
  non-nullité de la grandeur mesurée AVANT comparaison. Gate vert : 4 634 tests / 416 fichiers.

## 2026-08-21 — Lot « perf moteur » : deux points chauds de la boucle mensuelle

> Deuxième lot de la passe audit. Les deux correctifs sont **bit-identiques par construction** —
> aucun golden n'a bougé, et c'est le résultat ATTENDU ici (contrairement à la règle « aucun golden
> n'a bougé est un résultat à EXPLIQUER » : il ne s'agit pas d'un changement d'assiette mais du
> remplacement d'un calcul par un équivalent prouvé, l'identité étant elle-même la propriété visée).

- [x] **`[PERF-ENGINE-DATELABEL-INTL]`** (XS, CRITIQUE) — `toLocaleString('fr-CA', { month: 'short' })`
  appelé à chaque mois de chaque run sans formateur en cache (`monthlyOutput.ts`). Remplacé par une
  table de 12 mois précalculée, **construite depuis `toLocaleString` lui-même** — pas depuis une
  liste de noms recopiée à la main, qui divergerait du locale en silence. Même patron que
  `WEEKDAY_SHORT_FR` (`dailyLedger.ts`), déjà présent dans le dépôt pour la même raison.
  ⚠️ **Piège du fuseau, tranché par mesure** : la table est indexée par `getMonth()` **LOCAL**,
  parce que `projection.ts` construit ses dates de boucle en local (`new Date(y, m, 1)`) et que
  l'appel remplacé lisait lui aussi le fuseau local (aucun `timeZone` passé). Indexer par
  `getUTCMonth()` décalerait le libellé d'un mois pour tout utilisateur à l'est de Greenwich —
  **mesuré 132 cas sur 132 à Sydney (UTC+11), 0 à Montréal**. Le conteneur de dev tournant en UTC,
  un balayage local-seul ne peut PAS départager les deux : la vérification a donc été rejouée sous
  `TZ=America/Montreal`, `Australia/Sydney` et `Pacific/Kiritimati` (0 divergence, 972 cas).
- [x] **`[PERF-ENGINE-ISOSTRING-HOTLOOP]`** (XS, MOYEN) — `toISOString().substring(0,7).split('-')`
  exécuté inconditionnellement à chaque mois dans `computeIncomeLossFactor`, même sans aucun
  événement de perte de revenu. Remplacé par `getUTCFullYear()*12 + getUTCMonth()` : **la base UTC
  est conservée** (elle doit rester alignée sur `applyLifeEvents`), seuls la construction de chaîne
  et son reparsing disparaissent. Identité vérifiée sur 3 888 cas × 4 fuseaux.

**Gain MESURÉ localement** (360 mois = un run de 30 ans, moyenne sur 20 passes) : le libellé passe
de 23,00 ms à 0,61 ms (**38×**), l'index de mois de 0,955 ms à 0,053 ms (**18×**) — soit ~22,4 ms
par run déterministe. ⚠️ Les tickets annonçaient 97× et 24× : mes chiffres sont plus bas, je
rapporte **ma** mesure et non la leur (matériel et version de V8 différents).
3 tests neufs, **tous prouvés rouges par perturbation** (décalage d'un mois injecté dans les deux
fichiers réels, restauration vérifiée au `git diff`). Gate vert : 4 632 tests / 416 fichiers.

## 2026-08-21 — Lot « échecs silencieux IA » : 6 items XS de l'audit 2026-08-19

> Premier lot de la passe sur les 120 items d'audit (ordre choisi par Marc : les plus rapides
> d'abord). Six items XS regroupés par TERRAIN (les surfaces IA et le coffre de clés) plutôt que par
> gravité — un lot cohérent se relit et se teste ensemble.

- [x] **`[AI-UNBOUNDED-CONFIDENCE]`** (XS, ÉLEVÉ) — `CategorizeItemSchema`, `SubscriptionItemSchema`
  et `CoupleOptimizationStrategySchema` validaient leurs nombres avec `z.number()` NU, alors que
  `PayslipSchema` avait été durci pour ce risque exact. Une confiance hallucinée traversait
  `safeJsonValidate` et s'affichait verbatim (« Confiance : 9999 % »). Bornes posées
  (`confidence` ∈ [0,100], montants `.nonnegative().finite()`, `dayOfMonth` ∈ [1,31] entier) **plus**
  un clamp d'AFFICHAGE (`displayConfidence`) : les deux sont nécessaires — le schéma protège ce qui
  ENTRE, le clamp protège ce qui est DÉJÀ PERSISTÉ (aucune revalidation rétroactive à la lecture).
- [x] **`[BUDGET-AI-WRONG-MODEL]`** (XS, MOYEN — coût) — `BudgetAiModal` appelait `chatStream` sans
  `model` → défaut Sonnet, alors que les 5 autres surfaces de même nature passent Haiku
  explicitement. Seule surface Haiku-éligible à payer le tarif Sonnet sur la clé BYOK de Marc.
- [x] **`[TX-STALE-MODEL-LABEL]`** (XS, FAIBLE) — « Modele: Claude Sonnet 4.6 » affiché en dur
  pendant une catégorisation qui tourne sur Haiku depuis la bascule. Libellé désormais DÉRIVÉ :
  `CATEGORIZE_MODEL_ID` (exporté, et lu par le site d'appel lui-même) + `modelLabelFromId()`
  (nouveau, dans `services/aiChat/models.ts`, la source unique des modèles). Changer de modèle met
  le libellé à jour du même geste, par construction.
- [x] **`[REBALANCE-SILENT-FAIL]`** (XS, MOYEN) — `getRebalanceJustifications` rend `[]` sur ERREUR
  comme sur « rien à dire », et `Investments` ne posait aucun état d'erreur : un 429 se lisait
  « l'IA n'avait rien à ajouter ». Patron `hasError` de `CoupleOptimizationCard` répliqué. Le vide
  ne peut pas être un succès ici : le bouton n'existe que si `hasActions`.
- [x] **`[BUDGET-AI-DUP-PARSING]`** (XS, FAIBLE) — parsing JSON réimplémenté sur place au lieu de
  `safeJsonValidate` (qui gère déjà les fences ```json et la prose autour). L'ancienne version
  JETAIT sur un JSON malformé, ce qui perdait TOUT le texte déjà streamé alors qu'il était lisible.
- [x] **`[KEYSTORE-DECRYPT-FAILED-SILENCIEUX]`** (XS, MOYEN) — à la sauvegarde de clés,
  `decrypt_failed` (coffre existant mais illisible → champs device-local perdus) était traité
  exactement comme `empty` (premier usage, rien à préserver), sans trace. Classe
  `REPLI-SILENCIEUX-LEGITIME-VS-CORRUPTION` : l'écriture continue (refuser bloquerait l'utilisateur
  hors de ses propres clés) mais la perte est désormais journalisée.

5 tests neufs (`tests/services/aiSchemaBounds.test.ts`), bout-en-bout avec le SDK mocké — ces
schémas ne sont pas exportés, un test sur une copie locale ne prouverait rien. **3 des 5 prouvés
rouges par perturbation** (bornes retirées du vrai fichier, restauré vérifié au `git diff`).
Gate complet vert : 4 629 tests / 416 fichiers, build inclus.

## 2026-08-21 — `[DEBT-MCP-PARITE]` : parité kind/dates de dette entre PDF, MCP direct et moteur/UI

- [x] **`[DEBT-MCP-PARITE]`** (S) — ✅ PR #? (à compléter au merge).
  `Debt.kind`/`startDate`/`termEndDate` étaient absents des DEUX voies d'écriture externes : l'import
  PDF (`mcp/ingest/applyDocument.ts`, `DebtPayload`) et l'appel MCP direct de l'assistant Claude
  (`mcp/tools/applyDebt.spec.ts`). Le tool MCP affirmait même encore « les dettes n'ont pas de date
  de début » — faux depuis `[DETTE-DATES]` (2026-08-19), un risque réel de désinformer l'assistant
  en session. ⚠️ Nuance apportée par le panel : `startDate`/`termEndDate` sont bien câblés dans le
  moteur ; `kind` existe dans le type depuis W5.3 mais n'a encore AUCUN consommateur moteur ni
  champ UI — c'est un discriminant PRÉPARÉ pour `[DEBT-AMORTIZATION]`/`[DEBT-UI-PAR-TYPE]`.
  **Corrigé aux deux endroits** : champ payload `debtKind` (voir piège de nommage ci-dessous),
  `startDate`/`termEndDate`, avec validations miroir de celles déjà en place pour balance/taux/
  paiement (kind contre une liste fermée `DEBT_KINDS`, dates au format ISO strict `YYYY-MM-DD`,
  cohérence chronologique `startDate ≤ termEndDate`) — ceinture ET bretelle, un appel direct du
  handler bypasse Zod (leçon `MCP-WHATIF` déjà connue). Description du tool + commentaires de
  module corrigés (la fausse affirmation datait d'avant `[DETTE-DATES]`).
  ⚠️ **Piège rencontré** (leçon `UN-CHAMP-PAYLOAD-NE-PEUT-PAS-PORTER-LE-NOM-DU-DISCRIMINANT`,
  `docs/CONVENTIONS.md`) : le champ ne peut pas s'appeler `kind` sur `DebtPayload`, qui porte déjà
  le discriminant de routage `kind: 'debt'` — une collision aurait cassé le routage de TOUS les
  documents (pas seulement des dettes) via `{ kind: 'debt', ...args }`. Renommé `debtKind`, mappé
  vers `Debt.kind` à l'écriture. `types.ts` gagne `DEBT_KINDS` (tableau `as const`, source UNIQUE
  des valeurs `DebtKind`) réutilisé par le `z.enum` Zod ET la garde runtime — zéro liste redupliquée.
  **Panel de revue (4 agents) appliqué avant merge — 2 ÉLEVÉS confirmés par mesure directe :**
  (1) la cohérence `startDate ≤ termEndDate` ne comparait que les deux champs du payload COURANT
  (code-reviewer ET financial-integrity, indépendamment) — une mise à jour PARTIELLE ne touchant
  QUE `termEndDate` contournait la garde ; mesuré, une dette avec `startDate` future et
  `termEndDate` passée n'était alors JAMAIS `'active'` (`'a-venir'` → `'terminee'` sans passer par
  `'active'`) : jamais payée, exclue du bilan, puis réapparaissant d'un bloc. Corrigé par
  comparaison sur les valeurs FUSIONNÉES avec l'existant.
  (2) le résumé rendu à l'assistant (et à l'aperçu de consentement) affirmait TOUJOURS « servie dès
  maintenant », y compris avec `startDate` future — contredisant la description du tool corrigée
  dans le MÊME lot (`DOC-STALE` re-commise à un 3e site). Corrigé, message conditionnel.
  **MOYEN** (silent-failure-hunter + financial-integrity) : le format ISO seul acceptait
  `2026-13-01`/`2026-02-30` — `moisAbsolu()` rejette alors le mois et traite la date comme ABSENTE,
  SILENCIEUSEMENT (l'assistant croit avoir daté la dette, le moteur l'ignore). Corrigé par
  `utils/isoDate.ts` (nouveau, source UNIQUE partagée garde runtime + `.refine()` Zod) :
  validation calendaire réelle par aller-retour `Date.UTC` + borne d'année [1970, 2200].
  **FAIBLE non retenu** : `changes.after` de l'ajout omet les 3 nouveaux champs — cohérent avec le
  pattern préexistant (`amortizationYears`/`rateProvider`), pas une régression de ce lot.
  12 tests neufs (parité ajout/mise à jour, rejets kind/date invalides — format ET calendaire,
  cohérence chronologique y compris en mise à jour partielle, résumé conditionnel, garde Zod).
  Gate complet vert : 4 624 tests / 415 fichiers, build inclus.
  En chemin : `A00b` (déploiement production bloqué du lot précédent, #687) vérifié et CLOS —
  `list_deployments` Vercel confirme `production READY` sur `3bbc380` (#690), qui contient `3dd9d9d`
  (#687).

## 2026-08-21 — `[PASSE-REEL-DETTE-1]` : une dette n'apparaît plus dans le passé avant sa date de début

- [x] **`[PASSE-REEL-DETTE-1]`** (M, money-critical) — ✅ PR #687.

**Demande** : Marc, en creusant depuis « je veux seter la date de ma dette » (déjà livré par
`[DETTE-DATES]`, 2026-08-19) : « je veux que la dette ne se voie sur le graph futur seulement à la
date où ça a commencé ». Sa dette-auto (bail, débute le 20 juillet) apparaissait dans le passé
reconstruit comme si elle existait depuis toujours.

**Diagnostic** : `buildPastPrefix.ts`/`dailyPastLedger.ts` recevaient un scalaire unique
`currentDebtNonImmo` (= `chartData[0].DettesNonImmo`), appliqué à TOUS les mois passés, sans
jamais consulter `startDate`/`termEndDate` par dette.

**Correctif** : nouvelles fonctions pures dans `services/projection/debtSchedule.ts`
(`phaseDetteAuMoisAbsolu`, `sumNotYetStartedDebtsAtMonth`/`...AtAbsoluteMonth`) qui retranchent en
**DELTA** le solde des dettes pas-encore-commencées de `currentDebtNonImmo` — jamais une
resommation complète. `FutureProjection.tsx` passe désormais `debts` (store, tableau frais) EN
PLUS de `currentDebtNonImmo` aux deux builders. Palier MENSUEL préservé au jour.

⚠️ **Mon 1er jet resommait les `balance` bruts de toutes les dettes actives** (au lieu du delta) —
un test de raccord a révélé un écart de 372 $ sur une dette de 22 000 $ : le moteur applique déjà
son propre pas d'amortissement du mois 0 (intérêt + paiement) avant de publier `DettesNonImmo`, et
resommer les soldes bruts diverge de ce total exact, cassant le raccord qu'Option A garantit. Le
delta corrige ça : quand aucune dette n'est datée (l'état de tout le monde aujourd'hui), le
comportement reste bit-identique à avant ce lot. Nouvelle leçon `docs/CONVENTIONS.md` :
`RESOMMER-UN-AGREGAT-DEJA-TRANSFORME-DIVERGE`.

⚠️ **Revirement de décision, ASSUMÉ par Marc** : en creusant encore, Marc a redemandé une VRAIE
courbe d'amortissement (« chaque semaine je dois un peu moins »), pas juste un niveau figé — ce qui
inverse la Décision 2 de `docs/adr/0012-quatre-decisions-de-marc-2026-08-17.md` (« aucun
amortissement rétroactif »). Confirmé par Marc après rappel explicite du contexte du 17-19 août
(« je confirme, je veux la courbe malgré le coût supplémentaire »). Scopé en panel produit+archi
(lecture seule) en lots séparés, routés au BACKLOG : `[DEBT-MCP-PARITE]`, `[DEBT-AMORTIZATION]`,
`[DEBT-MCP-ORIGINALBALANCE]`, `[DEBT-UI-PAR-TYPE]`. Le comparateur prêt-vs-bail demandé dans le
même message est explicitement PAS scopé (cadrage insuffisant, à faire dans une session dédiée).

**Tests** : `detteDates.test.ts` (nouvelles fonctions pures), `buildPastPrefix.test.ts`/
`dailyPastLedger.test.ts` (discriminants prouvés rouges par perturbation chirurgicale — delta
forcé à 0, restauré ensuite), `FutureProjection.pastDebtFreeze.test.tsx` (wiring bout-en-bout,
localisation des lignes par libellé de date plutôt que position — un 1er jet indexé par position
comparait deux mois tous deux AVANT la date de la dette, test vacant démasqué par la perturbation).

⚠️ **Panel #687 (5 agents) appliqué — CRITIQUE trouvé INDÉPENDAMMENT par financial-integrity ET
code-reviewer, par lecture directe du code (pas exécution)** : mon delta ci-dessus excluait une
dette dès qu'elle était 'a-venir' au MOIS PASSÉ regardé, sans jamais vérifier qu'elle avait
réellement contribué à `currentDebtNonImmo` en premier lieu. Une dette dont le `startDate` est
encore dans le FUTUR par rapport à AUJOURD'HUI (pas seulement après le mois regardé — le cas
d'usage même de `[DETTE-DATES]` : « un prêt signé dans six mois ») n'a JAMAIS été comptée dans
`currentDebtNonImmo` (le moteur l'exclut déjà de `sumActiveDebts`) — la retrancher quand même
fabriquait **−22 000 $ de patrimoine passé FANTÔME**, mesuré, le symptôme INVERSE du bug initial
de Marc, introduit par mon propre correctif sur une branche voisine qu'AUCUN test du 1er jet
n'exerçait (tous utilisaient une dette déjà commencée aujourd'hui). **Corrigé** : le garde-fou
compare désormais la phase de la dette à DEUX mois (le mois passé ET aujourd'hui), n'excluant que
si 'a-venir' au premier ET PAS au second. **Corollaire ÉLEVÉ, même mécanisme** : même une dette
correctement exclue peut faire passer le total en dessous de 0 (le delta emprunte le solde BRUT
contre un total déjà post-amortissement — mesuré jusqu'à −4 651,67 $) ; `Math.max(0, …)` ajouté
aux deux call sites. Nouvelle leçon `docs/CONVENTIONS.md` :
`EXCLURE-N-EST-PAS-LE-DROIT-DE-RETRANCHER-DE-N-IMPORTE-QUEL-TOTAL`.

- **[ÉLEVÉ, silent-failure-hunter]** un solde de dette non fini (NaN) était rabattu à 0 SANS
  `logError`, contrairement au moteur (`sumActiveDebts`/`computeRawNetWorth`) qui journalise le
  même genre de corruption — corrigé (`logError` throttlé par dette, même patron que `netWorth.ts`).
- **[documentation-manager]** `docs/PROJECTION_OUTPUT_SCHEMA.md` (description de `DettesNonImmo`)
  était périmée — corrigée pour mentionner le gating par `startDate`.

⚠️ **projection-validator (5e agent, revue MESURÉE contre le VRAI moteur, sur 24 696 combinaisons
pour le refactor de `phaseDette`)** a confirmé le CRITIQUE ci-dessus AVANT que mon correctif
n'atterrisse (mesuré −22 000 $ de patrimoine fantôme sur `ec83a04`, 0 $ après `013704a`), ET trouvé
un **résidu MOYEN qui SURVIT au clamp** : le clamp (`Math.max(0, …)`) ne borne que le côté NÉGATIF
(une seule dette gatée) — quand une AUTRE dette (non gatée) maintient le total positif, le même
écart solde-brut-vs-post-amortissement de la dette gatée survit comme argent fantôme BORNÉ (mesuré
371,50 $). Approximation ASSUMÉE (documentée, pas éliminée — fermeture complète = publier un solde
per-dette déjà amorti par le moteur, hors périmètre, routée à `[DEBT-AMORTIZATION]`). Un test dédié
mesure ce résidu avec le VRAI moteur (`calculateFutureProjection`, pas une réimplémentation) et
l'assertit BORNÉ (< 600 $, la marge du paiement mensuel de la dette gatée) plutôt qu'exact —
mesuré −371,67 $ sur mon propre banc, à 0,17 $ près de la mesure indépendante de l'agent. Le même
agent a aussi signalé un test `[discriminant]` tautologique (`X − 0 === X`, dette déjà active au
mois 0 lui-même — ne peut jamais échouer) : reformulé en note honnête + remplacé par ce test du
résidu pour la preuve réelle. Nouvelle section dans `docs/CONVENTIONS.md` (même leçon
`EXCLURE-N-EST-PAS-LE-DROIT-DE-RETRANCHER-DE-N-IMPORTE-QUEL-TOTAL`, précisée).

⚠️ **Piège de fixture rencontré en écrivant CE test du résidu** : une carte de crédit à faible solde
(15 000 $/19 %) était payée d'un coup par la stratégie BASE dès le mois 0 (cash disponible
suffisant) — mesuré directement (script), pas supposé — rendant le résidu comparé à 0 $ au lieu du
vrai solde de l'autre dette, un test VACUEUX. Remplacé par un gros prêt (200 000 $) qu'aucune
stratégie ne peut éteindre en un mois.

14 tests neufs au total (dont 5 discriminants du CRITIQUE/ÉLEVÉ/MOYEN trouvés par le panel, prouvés
rouges par perturbation chirurgicale du garde-fou et du clamp, ou mesurés directement contre le
moteur réel). Gate complet vert : 4 612 tests / 415 fichiers, build inclus.

## 2026-08-21 — Vague 2 : devises/unités (badge FX estimé, prop morte, récap en devise native)

- [x] **`[FX-FALLBACK-SILENCIEUX]`** (S, MOYEN) — ✅ 2026-08-21, PR #686.
- [x] **`[RETIREMENT-GROSSINCOME-DEAD]`** (XS, FAIBLE) — ✅ idem.
- [x] **`[ADDSTOCK-CAD-NATIF]`** (XS, FAIBLE) — ✅ idem.

**FX-FALLBACK-SILENCIEUX** : le repli FX en dur n'était visible que dans SystemView (page
technique). Deux helpers purs (`services/portfolio.ts` : `isFxRatesEstimated`,
`hasForeignCurrencyAssets`) + un badge partagé (`components/ui/FxEstimateBadge.tsx`) qui ne se
déclenche QUE quand un taux estimé compte réellement (avoir étranger présent — sinon pur bruit).
Câblé sur la tuile « Patrimoine net » (`FutureKpiStrip` — couvre Dashboard ET Patrimoine,
consolidés au même tuile depuis REFONTE-NAV), le header Investissements, et une note sous
« Total placements » du PDF.

⚠️ **Panel #686 (4 agents) appliqué — le premier jet était incomplet sur le fond ET la forme** :

- **[MOYEN money-critical, financial-integrity]** le signal ne portait QUE `lastFetched === 0` —
  un succès GLOBAL du fetch BdC (une série présente, l'autre absente/corrompue) faisait conclure
  « taux réel » alors qu'une des deux devises était inventée : exactement le scénario chiffré par
  le ticket (~3 000 $ CAD/100 k$ US à 3 pts d'écart), et il restait invisible. Correctif réel (pas
  cosmétique) : `services/finance.ts` fait remonter un `estimated: boolean` PAR APPEL (vrai si
  n'importe laquelle des deux séries est tombée sur son repli), propagé comme un champ **SIBLING**
  de `fxRates` — `AppState.fxRatesEstimated`, jamais DANS `fxRates` lui-même (qui reste un
  `Record<string, number>` compatible avec ses ~13 consommateurs, `toCurrencyFactor`/
  `assetValueCad` en tête — un champ booléen dedans les aurait tous cassés typecheck). Rétrocompat :
  `fxRatesEstimated` absent (état antérieur) → `isFxRatesEstimated` retombe sur
  `fxRates.lastFetched === 0`, seul signal qui existait alors.
- **[ÉLEVÉ, code-reviewer]** `AddStockForm.tsx` bannière « Prix actuel » (chemin Finnhub validé,
  le PLUS courant) affichait encore `formatCAD(currentPrice)` — le même défaut que le ticket
  corrigeait 90 lignes plus bas, jamais touché. Corrigé au même patron (`formatNumber` + devise).
- **[MOYEN, code-reviewer]** ce chemin (validation Finnhub réussie) n'avait AUCUN test — d'où le
  défaut ci-dessus invisible ; test ajouté.
- **[MOYEN, code-reviewer]** le commentaire du 1er jet affirmait détecter un « cache trop vieux » —
  faux : seul « jamais récupéré » est détecté (le cache réel mais périmé est volontairement
  préféré à l'approximation, `services/finance.ts`). Libellés (badge + PDF) corrigés pour ne plus
  surclaimer.
- **[HIGH a11y]** le select « Compte fiscal », juste au-dessus de « Devise » dans la même grille,
  avait le même trou d'association `label`/`id` — corrigé au même patron (1 champ sur 2 réparé au
  1er jet ; les 7 autres champs du formulaire, hors périmètre de ce lot, routés en ticket
  `[A11Y-ADDSTOCKFORM-LABELS]`).
- **[MEDIUM a11y]** les deux badges du header Investissements (Diversification + FX) pouvaient
  déborder sur mobile étroit (pas de `flex-wrap`) — corrigé au patron déjà présent dans
  `Retirement.tsx`. Même correctif (optionnel, dégradation déjà gracieuse) sur la tuile
  Patrimoine net.
- **[FAIBLE, financial-integrity]** `hasForeignCurrencyAssets(undefined)` levait une exception —
  garde `?? []` ajoutée ; et son jumeau exact (`FutureProjection.tsx:269`, écrit en dur) consomme
  désormais l'helper partagé (source unique).
- **[FAIBLE, financial-integrity]** une assertion de test (`not.toMatch(/\$\s*CA/)`) était
  VACUEUSE — `formatCAD` ne rend jamais ce motif sous cette version d'ICU, l'assertion ne pouvait
  pas rougir. Remplacée par `not.toContain('$')`, qui discrimine vraiment.
- **[INFO]** deux surfaces FX non couvertes par ce badge (`TaxCenter.tsx`, un affichage fiscal ;
  `buildSimulationParams.ts`, toute la courbe Futur) — routées `[FX-BADGE-SURFACES-RESTANTES]`.

**19 tests neufs** (8 `portfolio.test.ts`, 4 `FxEstimateBadge.test.tsx`, 3 `pdfReport.fxNote.test.ts`,
3 `AddStockForm.test.tsx`, 1 `finance.test.ts` — dont le test qui reproduit EXACTEMENT le bug F-1 :
une série réelle + une absente, `lastFetched > 0` mesuré, `estimated: true` mesuré), 5 perturbations
prouvées rouges assertion par assertion (dont la perturbation du VRAI correctif money-critical),
restaurations vérifiées par diff.

**RETIREMENT-GROSSINCOME-DEAD** : la prop `grossIncome` (`TabRouter.tsx` → `Retirement.tsx`)
n'avait AUCUN consommateur — retirée du type ET du site d'appel plutôt que renommée (zéro usage
à préserver). Piège d'échelle ×12 dormant fermé sans jamais avoir mordu personne.

**ADDSTOCK-CAD-NATIF** : le récapitulatif d'ajout de titre passait `quantity × buyPrice` (devise
NATIVE saisie par Marc) par `formatCAD` — affichait un montant USD/EUR comme si c'était du CAD.
`formatNumber` (sans symbole) + le code de devise explicite, comme la ligne du prix unitaire déjà
correcte.

## 2026-08-21 — La détention immobilière se DÉCLARE (isOwned) + badges « non compté » (A6 + A5)

- [x] **`[ENG-PAST-OWNED-VS-PLANNED]`** (M, ÉLEVÉ [Certain, mesuré] — panel #552) — ✅ 2026-08-21,
  PR #684. Décision Marc A6 (ADR 0014) : champ `isOwned?: boolean` sur `RealEstateGoal`
  (additif, zéro migration). `false` = objectif planifié non réalisé → RIEN au m0 (ferme les
  +156 628 $ d'équité et +307 081 $ de dette fantômes du panel #552) ; `true`/`undefined` =
  comportement V2' bit-identique (prouvé par test).
- [x] **`[UX-ISACTIVE-BADGE]`** (XS — A5, reformulé depuis `[UX-ISACTIVE-SEMANTIQUE]`) — ✅ idem.
  Défaut `isActive: false` INCHANGÉ (décision : on attend le clic « Activer ») ; badge « Non
  comptée dans la simulation » sur le bien ET l'enfant inactifs — l'amputation du patrimoine
  est désormais VISIBLE.

**CINQ registres gated — pas « 3 »** (un flux alimente PLUSIEURS registres ; récidive
`MODULE-ECRIT-HORS-CHECKLIST` : ma 1re archive affirmait « 3 registres » et la revue #684 en a
trouvé DEUX de plus par grep des consommateurs de `purchaseDate`) :
(1) moteur `projection.ts` `initPastPurchase` ; (2) affichage `pastPurchaseInit.presentEquityOfGoal`
— et PAS de repli sur `currentValue` sous `isOwned:false` : ma 1re version l'honorait (200 000 $
au KPI pendant que le moteur publiait 0 — l'écart Accueil↔Futur du panel #552 réintroduit ET figé
par mon propre test, financial-integrity mesuré) ; (3) `realEstateMonth` bloc d'achat — sans ce
gate le bien `isOwned:false` était acheté D'OFFICE au m0 (34 310 $ mesuré malgré les 2 autres
gates) ; (4) `reconstructRealEstateEquityByYear` (préfixe passé de la courbe Futur — marche de
67 472 $ mesurée au raccord passé→présent) ; (5) partition `isOwnedToday` (un « Pas encore »
restait affiché dans « ce que je POSSÈDE »). Corollaires revue #684 : seuil UI unique
`firstDayOfCurrentMonthIso` (LOCAL, granularité MOIS — la checkbox au jour UTC divergeait du
moteur sur tout le mois courant : acheté au m0 à 34 310 $ SOUS le badge « non acheté », mesuré) ;
badge conditionné à la date (sinon affiché à JAMAIS après correction de la date) ; popup en file
par bien (fermer saute CE bien — un booléen global avalait tout le lot) + instantané à l'ouverture
d'écran (plus de vol de focus en pleine saisie, WCAG 3.2.2) + scope aux biens VISIBLES de la page.
Effet de bord documenté : une résidence principale `isOwned:false` rouvre les cotisations CELIAPP
(`hasPurchasedPrimary` faux) — cohérent avec « pas encore propriétaire ». 9 tests composant neufs
(le chemin d'écriture UI d'un champ money-critical n'en avait AUCUN), 5 perturbations prouvées
rouges, restauration byte-identique par diff.

**UI (spec A6)** : popup à l'ouverture de l'espace immobilier quand un objectif ACTIF a une date
planifiée passée sans réponse — Modal nu à 3 issues (« Pas encore » → `isOwned:false` / « Oui,
acheté » → `true` / fermer → on redemandera), PAS `ConfirmModal` dont fermer == répondre non ;
checkbox au formulaire quand la date saisie est passée ; un bien créé depuis la page « Actuel »
naît `isOwned: true`. 4 tests neufs (`pastOwnedVsPlanned.test.ts`) dont un bout-en-bout moteur
comparant m0 `Immobilier`/`DetteTotale` ; perturbation prouvée rouge, restauration par diff.
Docs : PROJECTION.md (phase 6) aligné.

## 2026-08-21 — Queue de vague 1b : dette d'horizon propagée, dividende majoré dans les assiettes, GK lissé

- [x] **`[ENG-TTP-UNSETTLED-PROPAGATE]`** (S-M) — ✅ 2026-08-21, PR #683.
- [x] **`[FISC-DIV-DERIVED-BASES]`** (S-M, FAIBLE) — ✅ idem.
- [x] **`[ENG-GK-THRESHOLD-KNIFE]`** (M, MOYEN) — ✅ idem.
- [x] **`[FISC-BAND-AGE-CREDITS]`** — ✅ DOUBLON de `[FISC-TAXDEC-INCR]`, livré par #676 (mêmes
  chiffres : 675,56 $ — deux IDs pour un défaut, constaté au cochage).

**TTP-PROPAGATE, surface par surface** : monteCarlo (avgEfficiency + taxLeakage) PROPAGÉ —
l'impôt d'horizon = ttp + dette du dernier exercice (un horizon court était aveugle à 8,6-100 %
de l'impôt réel) ; l'ESTATE attend la décision A4-FVI ([ENG-FVI-EFFICIENCY-ESTATE]). MCP
netTaxSettlements : VALEUR intacte (contrat IA adversarial 2026-07-14), notes enrichies des trois
exclusions et de la divergence assumée avec l'optimiseur. drawdownOptimizer : nu assumé (orphelin).

**DIV-DERIVED-BASES** : source unique `computeAnnualNonRegDividends` (3 copies remplacées), le
dividende MAJORÉ entre dans l'assiette FSS (+70 $/ménage mesuré à 500 k$ non-enreg) et le revenu
de récupération PSV (+1 552,50 $/an, couple 100 k$/conjoint ; 0 sous le seuil, testé). ⚠️ Mon
chiffrage jetable disait +3 006 $ : il oubliait la part distribuée 30 % — re-mesuré à la source
unique (récidive ECRIRE-UN-CHIFFRE). Le clamp CID voisin extrait en ticket propre
([FISC-CID-CLAMP-EXCEDENT], 0 $ mesuré sur le profil du panel).

**GK-THRESHOLD-KNIFE** : le gel binaire à −5 % (couteau : −174,36 $/mois À VIE déclenché par
256 $/an de CID, classement instable) devient une BANDE de lissage −4 %/−6 % (constantes nommées,
ratchet 0.95 → 0.06+0.02 design). ⚠️ Un premier lissage 0→−5 % réduisait l'indexation dès −0,1 %
de baisse — politique bien plus large que le défaut, attrapée par les goldens (FERR +8 683 $) et
resserrée : hors bande, comportement STRICTEMENT identique à l'ancien. 6 goldens re-basés — **et mes attributions
étaient CROISÉES sur 3 d'entre eux** (revue #683, bissection de commits : les pins estate = DIV,
le pin unsettled solvable = GK — sa fixture n'a pas de non-enregistré, mon « FSS du dernier
exercice » était impossible ; 4e récidive de la classe attribution-causale, commentaires
réécrits). **Vague revue #683 appliquée** : la RAMQ voit aussi le dividende majoré (+814 $/ménage
mesuré, 8× le FSS — l'asymétrie voisine que mon lot laissait), gross-up REQUIS dans
DecemberHelpers, NaN tracé patron FA-8, GK bordé prev>0 fini, FISCAL_REFERENCE aligné (3 passages
+ limite assumée [FISC-DIV-ACB-STEPUP] ≈ 58 k$ de double imposition, ticket ÉLEVÉ routé).

11 tests neufs, 8 perturbations prouvées rouges au total, restaurations par diff.

## 2026-08-21 — [ENG-RANKTAX-ESTATE] : « impôt minimum » score l'impôt TOTAL (successoral inclus)

- [x] **`[ENG-RANKTAX-ESTATE]`** (M, MOYEN) — ✅ 2026-08-21, PR à compléter au merge.

**Décision Marc A4 (ADR 0014) : « TOUT ».** L'objectif « impôt minimum » ne scorait que
`totalTaxesPaid` (règlements d'avril) : il RÉCOMPENSAIT le report — panel #554 : PRIO_CELI classé
1er avec ttp −189 849 $ et 1 299 510 $ d'impôt successoral ignoré (3,6× l'impôt total de MELTDOWN).

**Livré** : source unique `lifetimeTaxTotal` (`services/projection/lifetimeTax.ts`) = les trois
registres DISJOINTS du moteur (`totalTaxesPaid` + `unsettledTaxAtHorizon` + `totalEstateTax`),
branchée au site VIVANT (`strategySearch.lifetimeTax` → `strategyConfigRanking`) et à
`rankStrategies` (champ retourné renommé `lifetimeTaxTotal` — il portait le nom d'un registre
qu'il ne contient plus). Cas #554 pinné (MELTDOWN bat PRIO_CELI sur « impôt minimum »), test dette
d'horizon, ancre négative sur le câblage search. 2 perturbations prouvées rouges, restauration
par diff. `[PROJ-TAXPAID-SOLDE-AVRIL]` reste ouvert (biais constant entre stratégies — sans effet
sur un classement, documenté dans le helper).

**Découvertes routées** : `[ENG-RANKING-MODULES-ORPHELINS]` (⚠️ CORRIGÉ par la revue #683 :
seul rankStrategies est orphelin — compareLifeScenarios vit via l'alias optimizeDrawdownOrder →
GoalSeekerCard ; + double comptage estate dans balanced), `[ENG-FVI-EFFICIENCY-ESTATE]` (ré-ouvert
— l'angle mort FVI du ticket #554 avait été SUPPRIMÉ au cochage au lieu d'être routé : −20 pts de
FVI mesurés, clamp à 100 % dès ttp < 0).
**Relecture #681 appliquée** : l'infobulle du panneau vivant promettait « ni l'impôt
successoral » sur la valeur qui l'inclut désormais (étiquette → « Impôt total (modélisé) », les
deux tooltips réécrits, la divergence avec le MCP netTaxSettlements DOCUMENTÉE au commentaire) ;
mon test « 3 registres » était VACUEUX (départage par index d'entrée — ordre inversé + assertion
sur la grandeur) ; unsettled ajouté au fake de strategySearch (sa suppression laissait 82 tests
verts) ; « biais constant entre stratégies » borné (faux sous T1213 : 107 530 $ mesurés) ;
« impôt total » précisé « MODÉLISÉ » (la retenue salariale ~732 k$/10 ans reste hors compteur) ;
PROJECTION_OUTPUT_SCHEMA + types.ts mis à jour dans la même PR.

⚠️ **3e revert de conteneur de la session** pendant ce lot : le snapshot restauré portait un
`origin/main` PÉRIMÉ (95f0a5f, −5 semaines) et la branche est partie de là — trahie par le
COMPTE DU GATE (348 fichiers au lieu de 410). Réparé : fetch, rebase sur le vrai main,
`--force-with-lease`, `npm install` (deps du nouveau package.json), re-gate vert. Leçon portée
dans CONVENTIONS : le compte de tests du gate est un DÉTECTEUR de revert.

## 2026-08-20 — [FISC-PENSION-CREDIT-REAL] : le crédit pension fédéral décroît en espace réel

- [x] **`[FISC-PENSION-CREDIT-REAL]`** (S, MOYEN) — ✅ 2026-08-20, PR à compléter au merge.

**GO Marc A3.** Le montant fédéral (2 000 $, ARC 31400) est GELÉ nominalement depuis 2006 ; le
barème réel le traitait à plat → 2 000 $ RÉELS constants au lieu de `2 000/(1+i)^Δ`. C'était
l'**unique** terme non homogène du barème réel (sweep 1 920 cas, panel #556). Fix d'une ligne :
`min(PENSION_INCOME_AMOUNT_FED / realDeflator, pension)` — nominal strictement inchangé.

**MESURÉ** : à 20 ans (1,02^20), composante crédit 201,89 $ au lieu de 300 $ ; sous-imposition
fermée (≤ 250,50 $ réels/pers/an en asymptote ; cumul 30 ans à i = 2 % : ≤ 3 809 $ réels au max
analytique, 2 229-4 414 $ sur profils moteur réalistes — le « ~12 k$ » du ticket n'apparaît qu'à
5,5 %/40 ans, chiffre d'estimation corrigé par la revue #680, classe ECRIRE-UN-CHIFFRE). Discrimination
prouvée par `git stash push utils/tax.ts` (ancien moteur + tests neufs → 1 rouge exact — ⚠️ un
stash COMPLET emporte les tests avec le fix et ne prouve rien). 3 tests neufs dans `tax.test.ts`.
**1 golden re-basé — et ma 1re attribution causale était FAUSSE** (revue #680, 3e récidive du
jour) : j'avais écrit « la pension per-adulte des couples reste sous le montant » — mesuré, elle
est 10× AU-DESSUS (20 568 vs 1 922 $). La vraie raison : le fedTax des couples est DÉJÀ clampé à
0 (BPA + montant d'âge > imposable per-adulte), le crédit non remboursable est perdu — réduire un
crédit perdu ne change rien. Ces goldens ne sont PAS structurellement insensibles au fix.
**Vague revue #680 appliquée** : garde safeDeflator reprise de getIndexedBracketsForYear (2000/0 =
Infinity → min créditait la pension ENTIÈRE, fini et invisible ; bracketRealIndex passe NaN mais
sans ageOpts — la ligne n'était couverte par AUCUN test de corruption, fermé) ; else journalisé
sur la régularisation retraité NON FINIE (asymétrie avec la branche active) ; test « zone de
bascule » discriminant (pension entre cap déflaté et cap nominal — le 1er jet testait 800 $ sous
LES DEUX caps, vert avant ET après) ; date du gel 2015 → 2006 (recopie divergente de tête).

## 2026-08-20 — [FISC-RRSP-ROOM-PER-USER] : les droits REER se calculent par personne (règle ARC)

- [x] **`[FISC-RRSP-ROOM-PER-USER]`** (M, ÉLEVÉ) — ✅ 2026-08-20, PR #679.

**Décision Marc A1 (ADR 0014)** : « par personne ». `taxJanuary.ts` calculait les droits sur le
revenu du MÉNAGE (`min(cap × N, Σrevenus × 18 %) − ΣFE`) — le plafond de DEUX personnes s'appliquait
au revenu d'UNE seule. Désormais : `room_i = max(0, min(cap, revenu_gagné_i × 18 %) − FE_i)`, sommé.

**Ventilation à la SOURCE** : `activeIncome` retourne `accGrossAddByUser` ([Marc, Anna] — chômage/LTD
neutralise le brut du SEUL touché, survivant celui d'Anna) ; le congé parental (`childrenReee`)
s'attribue à l'index 1 (toujours Anna dans ce modèle). **Le scalaire ménage est SUPPRIMÉ** (plus
aucun lecteur) : un total se dérive, il ne se co-tient pas (`PARTAGER-LE-MONTANT-PAS-SES-REFLETS`).

**MESURÉ avant/après** (janvier 2027, barème estimé) : mono-gagnant 250 k$ : **45 000 → 34 480 $**
(−10 520, le chiffre du ticket au dollar) · couple 125/125 : inchangé · 90/10 sous plafond :
inchangé · FE croisé (conjoint sans revenu, FE 8 k$) : **10 000 → 18 000 $** — le FE ne traverse
plus les conjoints, et un FE > droits d'un conjoint ne devient jamais négatif (clamp par personne).

**Garde** : `tests/services/rrspRoomPerUser.test.ts` (7 tests) — pins mesurés + ancres négatives
contre le calcul ménage + invariant Σ(ventilation) == scalaire d'activeIncome. Perturbation :
calcul ménage restauré → 3 rouges exactement (l'« équilibré » reste vert : non-régression prouvée).
**« Zéro golden bougé » EXPLIQUÉ — et ma première explication était FAUSSE** (revue #679 MOYEN-1) :
j'avais écrit « salaire max 120 k$/an », en lisant `grossSalary` comme un ANNUEL — il est MENSUEL
(§1). `divorceRegisteredRoom.test.ts` porte 300 k$ et 264 k$/an, au-dessus du seuil. La vraie
raison, MESURÉE : ces deux conjoints saturent le plafond DES DEUX côtés (min(cap,·)×2 ≡ min(cap×2,·))
— l'équivalence tient aussi au-dessus. Preuve d'ensemble : formule ménage réintroduite → suite
complète 3 rouges / 4 545, tous dans `rrspRoomPerUser.test.ts`, ZÉRO golden (mesuré, pas déduit).
**Revue #679 (financial-integrity)** : ÉLEVÉ-1 corrigé — ménage SOLO en mode sandbox, le split
55/45 de `computeIncomeBaseline` droppait 45 % du revenu gagné (−12 173 $/an de droits, −50 159 $
de NW à 12 ans mesurés) → repli `activeUsersCount <= 1` (même critère que `reerShares`), espion
discriminant. MOYEN-2/3 : le CÂBLAGE de projection.ts n'était couvert par rien (croisement d'index
et inversion du congé laissaient 4 545 tests verts, jusqu'à 7 911 $ déplacés) → 3 tests-ESPIONS
(`rrspRoomWiring.test.ts`), 3 perturbations prouvées rouges. Garde NaN par slot, année du plafond
confirmée (droits N+1, plafond N+1), commentaire « 2026 » corrigé (droits 2027).

## 2026-08-20 — [FISC-TAXDEC-INCR] (a) : les bandes de décembre portent l'érosion des crédits d'âge

- [x] **`[FISC-TAXDEC-INCR]`** (S, ÉLEVÉ) — ✅ 2026-08-20, PR #676.

> **Sous-volets du ticket** : (a) CODÉ — érosion des crédits d'âge sur les bandes ; (b) déjà corrigé #564 (FISC-STACK-GAINS-DIV) ; (c) statu quo documenté in situ (FSS ne varie pas avec la bande).

**Livré** : helper `incrementalBandTax` (par adulte, `familyIncome` évolue avec la bande) branché aux deux blocs impôt incrémental (gains en capital §2 et dividendes §3 de `taxDecember.ts`). Les crédits d'âge fédéral (15 % au-delà de 46 432 $) et québécois ligne 361 (18,75 % au-delà de 42 955 $) s'érodent maintenant sur chaque dollar ajouté par les bandes.

**Goldens re-basés** : couple retraité 62 ans en MELTDOWN_REER, −57,98 $ sur `finalNetWorth` ET `estateNetWorth` (la bande de dividendes du non-enregistré que le meltdown remplit porte l'érosion après 65 ans) ; la fixture FERR (pension couvrante, aucune bande) ne bouge PAS — effet ciblé, preuve inverse. Pins ADDITIVITÉ ré-basés 2 776,96→4 220,90 / 7 377,67→7 599,71 (delta = l'érosion nouvellement facturée). Perturbations prouvées (ageOpts retirés / familyIncome figé / asymétrie tb-tt). Ratchet fiscal : helper `a >= 65` marqué `[≠4]`.

⚠️ **Récidive du pin fiscal déduit** (776,25 $ vs mesuré 675,56 $), puis **récidive du MÉCANISME déduit** (« borné par le crédit restant » — faux, la vraie décomposition est l'abattement QC 16,5 % sur le crédit féd + conversion 14 %) : le pin ET son explication se mesurent. Entrée `ECRIRE-UN-CHIFFRE-FISCAL-SANS-LE-MESURER` doublement enrichie.

**Panel #676 (6 agents), correctifs DANS la PR** : pension admissible réelle aux deux appels de la bande (F1 ÉLEVÉ, +317,81 $ re-facturés, source unique `eligiblePensionFor` hissée, test discriminant) ; branche revenu-FAIBLE documentée+testée (le crédit inutilisé abrite la bande — bidirectionnel, prouvé égal au calcul 1-coup sur 6 points) ; garde NaN patron `ENG-TAXDEC-NAN-GUARD` ; test couple 68/60 (ratio 0,5) + pin §3 (466,14). **2e relecture** : borne `ctx.isRetired` sur la pension de la bande (le hissage emportait la branche active, ±1 878 $ — test discriminant), garde NaN passée aux ENTRÉES, phrase « 1-coup » bornée à son périmètre mesuré. 6 tickets routés au BACKLOG (`[FISC-BANDES-FRERES-SANS-AGEOPTS]` ÉLEVÉ en tête, `[TAXDEC-ACTIF-72-PENSION-CREDIT]`).

## 2026-08-20 — Lot « prestations » : l'assiette d'emploi nulle (règle Marc du jour appliquée)

- [x] **`[RQAP-PRESTATION-COTISATIONS]`** (S, ÉLEVÉ) — ✅ 2026-08-20, PR #675.
- [x] **`[AE-PLAFOND-MANQUANT]`** (S, ÉLEVÉ) — ✅ 2026-08-20, PR #675.

> Débloqués le matin même par la réponse sourcée de Marc (ADR + `FISCAL_REFERENCE.md` §2) :
> les prestations RQAP/AE/RRQ ne sont assujetties à AUCUNE des trois cotisations — assiette de
> cotisation = revenus de TRAVAIL uniquement.

**RQAP** : la prestation de congé parental payait RRQ + RQAP + AE (`employmentIncome` absent → le
défaut retombait sur `grossIncome`). Correctif d'un argument : `employmentIncome: 0`. MESURÉ :
**+4 328,50 $/an** de net au plafond (le chiffre du ticket, re-vérifié au sou — exact, indépendant
du profil) ; effet patrimoine à 10 ans FIXTURE-DÉPENDANT : +9 518 $ (ma fixture) / +8 803 $ (celle
de la revue). La revue a aussi mesuré le POINT DE CROISEMENT de l'AE : **86 606 $ de brut** — en
dessous, l'ancien modèle SOUS-payait (jusqu'à +21 % de prestation aujourd'hui) ; au-dessus, il
sur-payait (−51 % à 200 k$). Garde : test-ESPION `vi.mock` qui vérifie l'ARGUMENT réellement
passé sur chacun des ≥ 12 appels de la fenêtre de congé (patron du proxy DB — jamais de
reconstruction).

**AE** : le chômage simulé faisait `net × 0,55` SANS plafond — il sur-payait un haut salaire ET
assujettissait la prestation aux cotisations. Désormais : 55 % des gains assurables BRUTS plafonnés
à `AE_MAX_INCOME` (68 900 $, projeté au patron MGA), nets d'impôt à assiette nulle. Champs REQUIS
ajoutés au contexte (`loopYear`, `simInflation`, `calculateFiscalReport` injecté) — pas optionnels :
un appelant qui les omettrait retomberait en silence sur l'ancienne approximation, le compilateur
doit le voir. Repli documenté : brut absent (legacy) → `net × 0,55`.

**Six tests asservissaient l'ANCIEN comportement** (`× 0,55` en dur) : réécrits avec des ancres
NÉGATIVES qui excluent chacun des trois anciens chemins (net × 0,55, brut sans plafond, avec
cotisations). Cinq perturbations, cinq rouges. Le ratchet fiscal a encore attrapé le lot (4e fois) :
`0.5` d'indexation du plafond inventorié `design`, `0.55` re-déclaré `[≠4]` avec ses deux sens.

Aucun golden ne portait ces chemins (suite verte avant/après sans re-basage) — les nouveaux tests
SONT les premiers à les épingler.

## 2026-08-20 — Vague 1f (5/5) : les deux derniers forfaits fiscaux non sourcés

- [x] **`[W5-PROXY-NON-SOURCE]`** (XS) — ✅ 2026-08-20, PR #673.

> Décision Marc `[W5-TAX-PROXY]` (close, mais à moitié livrée — classe `PM-STALE-BACKLOG`) :
> **(a) garder les proxys plats**, les documenter comme estimation de taux marginal QC, et ajouter
> une mention UI. Le ticket demandait « nommer ou retirer » : ils sont désormais **nommés, exportés,
> documentés et annoncés à l'utilisateur**.

**Ce que valent vraiment les deux forfaits** — MESURÉ sur 30 k$ de flux, barème 2026 :

| revenu du ménage | locatif : marginal RÉEL | écart du 45 % | dividende ORDINAIRE | dividende DÉTERMINÉ |
|---|---|---|---|---|
| 40 000 $ | 30,38 % | +4 387 $/an | 23,19 % | 10,65 % |
| 60 000 $ | 36,12 % | +2 665 $/an | 28,93 % | 16,39 % |
| 100 000 $ | 41,65 % | +1 004 $/an | **36,04 %** | 26,10 % |
| 150 000 $ | 47,46 % | **−738 $/an** | 42,23 % | 32,87 % |
| 250 000 $ | 52,36 % | −2 208 $/an | 47,75 % | 39,16 % |

Le forfait locatif **change de signe vers ~125-140 k$ selon le NOI** (121 272 $ à 5 k$ de NOI,
139 603 $ à 30 k$ — la revue a réfuté mon « 145 k$ » écrit de tête) : conservateur en dessous, non
conservateur au-dessus. Le forfait dividende ne vaut que pour un dividende **ordinaire à ~100 k$**,
et à personne d'autre.

⚠️ **Une affirmation que j'allais publier était fausse, et la mesure l'a arrêtée.** Mon premier jet
de l'entrée doc écrivait « 0,36 est proche du taux marginal SUPÉRIEUR d'un dividende déterminé ».
Ce taux vaut **39,16 %** à 250 k$ de revenu : 0,36 est un taux de MILIEU de barème pour un dividende
ORDINAIRE. Écrire un chiffre fiscal sans le mesurer, c'est fabriquer la source qu'on prétend citer.

⚠️ **Découverte routée** : `[W5-DIVIDENDE-PROXY-VS-MOTEUR]` — le dépôt sait déjà calculer ce taux
exactement (`utils/tax.ts` `calculateDividendTax`, majoration + les deux CID, dans le bon ordre
vis-à-vis de l'abattement). Le forfait ignore une source unique existante. Bloquant produit :
`PrivateBusiness` ne porte pas le TYPE de dividende — il faut d'abord ajouter le champ.

**Garde de concordance à TROIS sites** (`tests/services/w5TaxProxyAnchor.test.ts`) : les taux sont
exportés depuis le moteur, la doc doit les porter, l'écran doit les AFFICHER en les important — et
aucun littéral `45 %`/`36 %` n'est toléré dans le composant. La garde IMPORTE les constantes au lieu
de les recopier (`UN-OUTIL-GARDE-A-VALEURS-RECODEES`). Cinq perturbations, cinq rouges — dont une
qui a attrapé un « 45 % » dans **mon propre commentaire JSX** : un commentaire qui porte le chiffre
dérive comme le reste, il a été réécrit sans lui plutôt que d'assouplir la garde.

### ⚠️⚠️ La garde COMPORTEMENTALE a découvert que le forfait n'était PAS appliqué — 12× trop bas

En fermant le trou « échanger les deux constantes laissait tout vert » (finding de revue), j'ai écrit
l'assertion `taxDivers === noi_mensuel × 0,45` — et elle a ROUGI sur le moteur : le code faisait
`(noi_mensuel × 0,45) / 12`, alors que `addTaxDivers` alimente un accumulateur ANNUEL à raison d'un
versement PAR MOIS. Le taux effectivement prélevé était **3,75 %** (locatif) et **3 %** (dividende)
— pendant que la décision Marc, la doc toute neuve et l'écran annonçaient 45 et 36.

MESURÉ bout en bout : 1 125 $/an collectés sur 30 000 $ de NOI au lieu de 13 500 $. Sur un ménage
duplex + CCPC (60 k$ de dividende) à 30 ans : patrimoine successoral **8 141 254 → 6 736 381 $
(−1 404 873 $, −17 %)**. Le bug gonflait le patrimoine de tout bailleur/actionnaire depuis
l'introduction des conteneurs W5 ; AUCUN test ne le voyait parce qu'aucun ne fixait la VALEUR de ces
impôts (`taxDivers > 0` seulement) et qu'aucun golden ne porte de locatif/CCPC.

Trois leçons d'un coup : (1) **un scan de texte prouve des jetons, seul le COMPORTEMENT prouve le
câblage** — la garde comportementale a trouvé en une assertion ce que six passes de texte n'ont pas
vu ; (2) le défaut d'unité venait de la ligne VOISINE (`noi / 12` quatre lignes plus haut) — encore
un recopiage de voisin ; (3) « documenter un forfait » n'est fini qu'après avoir VÉRIFIÉ que le
moteur l'applique — sinon on ancre dans la source de vérité un taux que personne ne prélève.

**Bundle de boot vérifié** (l'écran importe désormais du moteur) : 9 `modulepreload` et 3,2 Mo
d'assets avant comme après, build PROPRE des deux côtés.

## 2026-08-20 — Vague 1f (4/5) : encore un facteur plat, encore contre les modestes

- [x] **`[ESTATE-NPV-07]`** (XS annoncé, S réel) — ✅ 2026-08-20, PR #671.

> Le ticket disait « facteur `0,7` sans nom, sans commentaire, absent de FISCAL_REFERENCE — nommer
> ou retirer ». Il disait aussi « écran Succession seulement ». **Les deux sont à corriger.**

**Le périmètre était sous-estimé** : `estateNetWorth` alimente aussi un chiffre-TITRE de l'onglet
Budget (avec sa note explicative), le panneau de stress-tests et la carte FIRE du Futur.

**Le facteur n'était juste pour personne** — MESURÉ, facteur net RÉEL d'une rente publique :

| situation du ménage | facteur net réel |
|---|---|
| vit surtout de ses rentes (24 k$/an) | **0,94** |
| + 30 k$ d'autre revenu de retraite | 0,743 |
| + 60 k$ | 0,639 |
| + 100 k$ | 0,594 |

`0,7` n'était donc correct que dans une bande étroite, et il **sous-estimait le patrimoine
successoral des ménages modestes** — ceux pour qui les rentes publiques pèsent le plus. Même forme
d'erreur que `[MIGRATE-GROSS-135]` : un facteur plat sur une relation qui ne l'est pas.

**Correctif** : abattement CALCULÉ par le patron déjà présent 40 lignes plus haut
(`estateReportFinal − estateReportBase`), appliqué au FLUX ANNUEL et non à la VAN — taxer une VAN de
plusieurs centaines de k$ comme un revenu d'une seule année l'aurait envoyée au taux marginal
maximal, bien plus faux que le 0,7 remplacé. Facteur borné à [0, 1].

**Goldens re-basés, delta écrit à côté** : 3 374 653 → **3 565 398 $** (+190 745, +5,7 %) ;
2 715 684 → **2 906 430 $** (+190 746, le même écart à un dollar d'arrondi près — la VAN des rentes ne
dépend pas du tirage Monte Carlo) ; et 144 220 → **208 594 $** (+64 375, **+44,6 %**) — l'écart relatif y est
énorme parce que cette fixture finit INSOLVABLE, donc son patrimoine successoral est presque
entièrement la VAN des rentes.

### ⚠️ La revue `financial-integrity` a démoli le PREMIER jet — trois défauts, tous MESURÉS

Le lot corrigeait un vrai défaut, mais dans son premier état il **échangeait un biais borné et
connu (30 pts) contre trois défauts non bornés**. Aucun des trois tests neufs ne les voyait.

**1. Contresens sur toute la population PRÉ-RETRAITE (−123 000 à −158 543 $).** Quand l'horizon
s'arrête avant l'âge de retraite, `estateCurrentIncome` est un SALAIRE. Le code mesurait le taux
marginal au sommet de ce salaire pour taxer des rentes encaissées 10 ans plus tard, une fois le
salaire disparu → facteur 0,52, soit **PIRE que le 0,7 remplacé**. Et c'est exactement la
population que le bloc VAN a été écrit pour servir (son propre commentaire : « valeur invisible en
fin de simulation AVANT 65 ans »). **Preuve de non-couverture mesurée** : en annulant complètement
la VAN sur cette branche, **1 seul test rouge sur 4 495**, et c'est un legacy `toBeGreaterThan(0)`.
Corrigé : sur cette branche le contexte est la rente ELLE-MÊME, valorisée à l'année finale et
imposée depuis zéro. Facteur mesuré stable à 0,9068 quel que soit l'horizon, et **indépendant du
salaire** (test dédié : doubler le salaire de base ne doit rien changer).

**2. La tranche soustraite n'était PAS la rente réellement versée (−29 %).** `rrqMonthlyFamily × 12`
= 28 800 $ retirés là où `incomeRetirement` en portait 40 616 $. Trois causes cumulées : base en
dollars D'AUJOURD'HUI alors que le revenu est NOMINAL (le `rrqExpected` deux lignes plus haut
applique justement `(1+infl)^années`) ; prorata gains/résidence absent (mesuré 0,784) ; SRG présent
dans le revenu mais absent de la tranche. Seul le dénominateur étant faux, le facteur sortait
systématiquement **trop bas** — l'erreur était **maximale sur les ménages modestes que le lot
prétend servir** (0,898 rendu au lieu de 0,948 pour un ménage vivant à 100 % de ses rentes).
Corrigé en plombant `pensionRrqMonthlyFinal` / `pensionPsvMonthlyFinal` / `pensionGisMonthlyFinal`
depuis la boucle (champs optionnels, défaut-neutre).

**3. Le classement des stratégies de décaissement BASCULAIT.** `drawdownOptimizer.ts` trie sur
`estateNetWorth` et publie « Meilleur avenir : X » ; `strategyRanking.ts` en fait le score de
l'objectif `wealth` ; deux outils MCP l'exposent au LLM. Avant, le terme VAN était identique pour
toutes les stratégies, donc il s'annulait au tri. Le premier jet le rendait dépendant du décaissement
REER de la **seule dernière année** — donc de la stratégie ET de l'endroit où l'utilisateur coupe
l'horizon. MESURÉ en ne bougeant QUE `years` :

| contexte du facteur | gagnant à 25 / 28 / 30 / 33 / 35 ans |
|---|---|
| `estateCurrentIncome` (1er jet) | MELTDOWN · **MELTDOWN** · **MELTDOWN** · AUTO · AUTO |
| **structurel** (retenu) | MELTDOWN · AUTO · AUTO · AUTO · AUTO |
| `origin/main` (0,7 plat) | MELTDOWN · AUTO · AUTO · AUTO · AUTO |

Le contexte structurel (`incomeRetirement × 12 + accRentesYear`, hors retrait REER ponctuel) est la
seule variante qui corrige le NIVEAU **sans changer la recommandation en effet de bord**.
⚠️ Hypothèse assumée avec son sens d'erreur : pour un retraité qui décaisse son REER/FERR chaque
année, ce contexte sous-estime le revenu récurrent, donc surestime légèrement le facteur (0,9335 au
lieu de 0,8987 sur la fixture divorce) → ticket `[ESTATE-NPV-CONTEXTE-PLURIANNUEL]`.

### ⚠️⚠️ Puis une SECONDE revue a trouvé deux défauts que la première n'avait pas — que j'avais INTRODUITS

**4. Le SRG servait d'assiette imposable (jusqu'à 64 898 $ sur un seul ménage).** J'avais retiré le
SRG de la TRANCHE (il est du revenu non imposable, et la VAN ne le valorise pas) mais **pas du
CONTEXTE** — or `incomeRetirement = retirementBreakdown.total` le contient via `psv`. Le résidu
`revenuSansRentes` était donc composé de **SRG pur**, sur lequel la tranche s'empilait comme s'il
était imposable. Corriger un seul côté d'une convention partagée est pire que ne rien corriger
(`CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE`, re-commis dans le lot même qui en portait la leçon).
MESURÉ sur le golden meltdown : facteur 0,8343 au lieu de 1,0000, soit **35 838 $ effacés** — sur un
ménage à faible revenu, exactement la population que le lot prétend servir. Le même défaut
renversait la recommandation de décaissement sur 4 points de mesure /52.
⚠️ Et le commentaire que j'avais écrit pour justifier le golden re-basé disait « le reste est une
pension privée » : **faux**, c'était le SRG. La prose qui justifie un chiffre décrivait le défaut
comme s'il était légitime. Même convention appliquée à l'**écrêtement PSV** au passage (`.rrq`/`.psv`
sont bruts, `.total` en est net).

**5. `estateNetWorth` DÉCROISSAIT quand l'horizon augmentait (−169 437 $ pour un an de plus).**
J'avais branché sur `rentesRéelles > 0` en le traitant comme « le ménage est-il retraité ». Faux
entre l'âge de retraite et le début des rentes publiques : un retraité à 55 ans avec 60 000 $/an de
rente DB était imposé « depuis zéro » sur sa rente publique ESTIMÉE, en **ignorant son revenu réel**
— 235 205 $ de patrimoine successoral fantôme, sur une plage où `origin/main` est strictement
croissant. La correction supprime la branche : la seule question est « les rentes sont-elles DÉJÀ
dans le revenu ? » ; si oui le contexte les contient, sinon elles s'ajoutent PAR-DESSUS le revenu
structurel. Continu par construction — au mois où la rente commence, le revenu structurel monte
exactement du montant qu'on cessait d'ajouter. Vérifié : 1 734 681 → 1 789 760 → 1 850 785 →
1 926 376 → 1 997 198, strictement croissant.

**Et la preuve que le classement ne bouge PAS** : sur 32 points de mesure (REER 300 k$ → 1 M$ ×
8 horizons), les marges MELTDOWN − AUTO sont **identiques au dollar près** à `origin/main`. Ce n'est
pas une coïncidence : le contexte structurel ne dépend d'aucune grandeur pilotée par la stratégie,
donc le terme VAN s'annule au classement — exactement comme le faisait le forfait plat. Réserve
honnête : `incomeRetirement` est net de l'écrêtement PSV, lequel dépend du revenu ; le découplage
est mesuré, pas prouvé.

**6. Point de bascule assumé et VERROUILLÉ.** Le lot rend l'abattement dépendant du revenu de
retraite ; une pension DB fait donc deux choses opposées (elle enrichit, et elle fait passer les
rentes publiques de 0 % à ~25,7 %). À un horizon de **5 ans exactement**, le second l'emporte de
11 298 $ : `tests/services/projection.test.ts` asservit désormais les DEUX faits, l'invariant à
10 ans (+108 559 $) et la bascule à 5 ans, pour qu'aucun des deux ne dérive en silence.
Delta mesuré : 5 ans −11 298 $ · 10 ans +108 559 $ · 15 ans +266 090 $ · 20 ans +488 619 $ ·
25 ans +789 492 $.

⚠️ **Le sens d'erreur du contexte structurel était sous-déclaré d'un facteur ~10** : j'avais écrit
« surestime légèrement (3,5 pts) » sur la foi d'une seule fixture. Mesuré ailleurs : **+16,5 pts /
+66 232 $** sur un REER de 700 k$ et **+36,1 pts / +144 963 $** sur un REER de 2 M$ — le biais croît
avec la taille du REER, donc frappe le plus la population que `drawdownOptimizer` conseille. Un
ticket de suivi chiffré « 3,5 pts » aurait été priorisé comme cosmétique.

### ⚠️⚠️⚠️ Et une TROISIÈME revue a trouvé deux défauts de plus — encore les miens

**7. `estateNetWorth` dépendait du MOIS CALENDRIER de lancement (210 997 $ d'amplitude).** J'avais
gardé `accRentesYear` dans le revenu de contexte. Malgré son nom (il cumule les LOYERS), c'est un
accumulateur **année-à-date** remis à zéro chaque janvier : l'additionner à un `incomeRetirement × 12`
mélange deux unités. MESURÉ, à loyer annuel identique (~64 000 $), le seul `startMonth` faisait varier
le terme de 5 383 $ (janvier) à 64 019 $ (décembre) — donc le facteur de 0,8920 à 0,6765. Contre-épreuve :
sans immeuble locatif, l'amplitude est exactement 0. J'avais exclu son JUMEAU `accRetraitsReerYear`
et gardé l'autre : `PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI` à l'intérieur de la **même expression**.
Après correction, l'amplitude au `startMonth` est **identique à `origin/main`** (35 692 $ / 12 344 $) :
la branche n'ajoute plus aucune dépendance calendaire.

**8. `estateNetWorth` restait NON MONOTONE en horizon (−65 687 $ et −61 936 $).** Deux causes
distinctes, chacune corrigée :
- *La tranche imposée n'était pas celle que la VAN valorise.* La VAN valorise `rrqExpected + psvExpected`
  à tout horizon ; j'imposais la rente déjà VERSÉE. À 64 ans seule la RRQ est versée → un facteur
  calculé sur la RRQ seule appliqué à une VAN qui contient aussi la PSV. Au démarrage de la PSV, le
  facteur chutait de 10,59 points. Corrigé : la tranche est `max(versé, valorisé)` et le **complément
  non encore versé** s'ajoute au contexte, puisqu'il s'y ajoutera vraiment. Continu par construction.
- *Avant la retraite, le revenu de retraite n'est pas zéro — il est INCONNU.* Le moteur ne renseigne
  `incomeRetirement` que dans le bloc retraite. Un ménage qui touchera 60 000 $/an de rente DB était
  donc évalué à contexte nul. La pension DB planifiée est une **saisie utilisateur**, connue dès le
  premier mois : s'en priver fabriquait une falaise sur une information déjà disponible.

**Vérifié après correction** : **9 familles** de fixtures (rente DB 1 500 à 8 000 $, estimés RRQ/PSV,
immigrante à résidence partielle, retraite de 55 à 70 ans), horizon balayé **an par an de 5 à 45 ans**
→ **monotone partout**. Et le classement de décaissement reste **identique à `origin/main` sur 30
points supplémentaires** (5 familles × 6 horizons), en plus des 32 déjà mesurés.

### ⚠️ 4e et 5e revues — deux défauts de plus, dans le proxy de pension DB

**9. Le proxy DB mettait la valeur planifiée EN CONCURRENCE avec le revenu réel.** `Math.max(réel,
proxy)` au lieu d'un complément : entre l'âge de la retraite et `dbPensionStartAge`, un ménage touche
déjà ses rentes publiques mais pas encore sa DB, et le `max` prenait le proxy en JETANT les rentes
réelles. MESURÉ sur un solo (retraite 58, DB à 70) : contexte surestimé de 53 799 $/an,
`estateNetWorth` sous-évalué de **142 890 $**, et une falaise NEUVE de 5,49 points — le défaut même
que ce terme devait supprimer. Le patron correct vivait 20 lignes plus bas.
Le proxy recopiait aussi une indexation approximative : `dbPensionIndexationPct` ignoré (jusqu'à
47 287 $/an de contexte fantôme, **à vie**, pour une pension non indexée), `dbPensionStartAge` ignoré,
`dbSurvivorPct` remplacé par `householdPensionShare`. D'où l'extraction de `computeDbPensionMonthly`
en **source unique** partagée avec `retirementIncome.ts` : une formule money-critical recopiée est
une formule qui diverge.

**10. Puis le proxy était réduit DEUX FOIS en mode survivant.** J'avais recopié
`(survivorMode || divorced) ? 1/N : 1` de la ligne voisine — où le halving EST légitime, parce que
l'agrégat `governmentPension` couvre les deux conjoints. Dans le slot DB, le décès est déjà porté par
`dbSurvivorFactor` À L'INTÉRIEUR de la source unique. MESURÉ proxy/réel = **0,5000** en survivant
contre 1,0000 en couple intact et en divorce, soit jusqu'à **17 067 $** de patrimoine successoral
surestimé et une marche résiduelle de ~2 k$ au démarrage de la DB. `PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`,
**quatrième fois du lot**, et précisément la divergence que le commit précédent affirmait avoir
supprimée : le code livré appliquait alors les DEUX facteurs.

⚠️ **Et le test de câblage écrit pour fermer ce trou était lui-même VACUEUX** : il RECONSTRUISAIT le
proxy en appelant la source unique avec les arguments recopiés du site d'appel, au lieu d'observer
celui que le moteur passe. Les cinq perturbations passaient. `TEST-AU-CONTRAT-NE-VOIT-PAS-L-APPELANT`,
re-commis dans le test écrit pour le fermer. Refait avec un espion `vi.mock` sur
`computeEstateNetWorth` qui capture les entrées réelles — les cinq rougissent désormais.
La branche survivant, elle, n'a **aucun chemin déterministe** (mortalité stochastique) : plutôt que
de fabriquer une fixture qui n'exerce rien et qui SEMBLERAIT couvrir, l'argument est vérifié par scan
de source, avec une garde anti-vacuité et la raison écrite dans le test.

**Tests re-écrits et PROUVÉS discriminants** (perturbations, chacune rougit) : contexte incrémental
: retour au 0,7 plat (14 rouges), contexte = revenu total (4), complément hors contexte (3), tranche
= versé seulement, SRG hors tranche, SRG hors contexte, écrêtement PSV hors tranche, `accRentesYear`
réintroduit, plancher DB retiré, indexation du plancher retirée, `fin()` retiré des champs plombés,
année désappariée. **Toutes rougissent.** Deux d'entre elles ne rougissaient PAS au jet précédent et
ont été fermées ici : le plancher DB (aucun test pré-retraite avec pension DB) et l'appariement
d'année — mon scan disait `toContain('finalYear')`, or `finalYear + 5` le contient aussi ; il isole
maintenant le 4ᵉ argument à profondeur 0 et exige l'égalité stricte. L'extracteur d'appels est
lui-même testé sur un appel à argument parenthésé (`GARDE-BORNEE-PAR-CLASSE-NEGATIVE` : un `[^)]*`
tronquait `calculateFiscalReport((a + b), …)` et laissait la garde aveugle).
La seule perturbation qui ne peut PAS rougir est le retrait du `Math.max(0, …)` sur le résidu, et
c'est écrit dans le test : tout barème sain rend 0 sur un revenu négatif, donc un résidu de −48 000 $
et un résidu de 0 $ produisent le même impôt. Fabriquer un stub absurde pour « couvrir » cette ligne
n'aurait rien prouvé sur le moteur réel. Le stub est désormais
à DEUX PALIERS (0 / 20 / 50 %) et les points de mesure sont strictement positifs de part et d'autre
des coudes — le stub `(g − 20 000) × 0,4` du premier jet était **affine**, donc plat au-dessus du
coude, donc aveugle. Les trois helpers `extractNPV` du fichier, qui divisaient par un `0,7` codé en
dur, dérivent maintenant la VAN brute d'un second appel sous barème nul.

⚠️ **TROIS erreurs de méthode attrapées par mes propres perturbations, dans ce seul lot** :
1. Le `fiscalStub` du fichier de test est `gross * 0.3` — un taux PLAT. Un stub qui reproduit la
   FORME du défaut ne peut pas le détecter : le correctif y était strictement invisible. Tests
   réécrits avec un stub PROGRESSIF.
2. Mon premier test dérivait le facteur en divisant la VAN nette par une VAN « brute ». **Vacueux** :
   un facteur constant se simplifie dans un ratio. Perturbation à l'appui — remettre `0,7` ne le
   faisait pas rougir. Refondé en comparaison entre DEUX barèmes.
3. Mon test du clamp ne mordait pas : la fixture avait `incomeRetirement: 0`, donc la soustraction
   était clampée et l'impôt incrémental valait 0. Corrigé avec un revenu non nul.

⚠️ **Et un faux raisonnement rattrapé de justesse** : j'avais justifié la soustraction des rentes par
`accRentesYear`. Malgré son nom, ce terme cumule les **LOYERS**
(`realEstateMonth.ts : accRentesYear += rentalIncome`). Ce sont `incomeRetirement * 12`
(= RRQ + PSV + rente privée) qui portent les rentes publiques. Le code était bon, la justification
fausse — et j'ai failli câbler le calcul à l'envers. `UN-NOM-TROMPEUR-FABRIQUE-DES-FAUX-FINDINGS`,
vécu en direct.

## 2026-08-20 — Une valeur fiscale figée par un défaut de signature

- [x] **`[GROSSFROMNET-ANNEE-FIGEE]`** (S) — ✅ 2026-08-20, PR #670.

> Suite directe de `[MIGRATE-GROSS-135]`. `calculateGrossFromNet` n'avait pas de paramètre d'année :
> elle appelait `calculateFiscalReport(x, 0, 0)`, donc le barème par DÉFAUT (2026), pendant que le
> moteur indexe par `startYear` / `loopYear`. Le lot précédent venait de rendre TOUTE l'assiette
> d'impôt dépendante de cette inversion — la dérive n'était donc plus théorique.

**MESURÉ** — brut qui redonne le même net selon le barème :

| net annuel | 2026 (figé) | 2027 | 2030 | dérive 2027 | dérive 2030 |
|---|---|---|---|---|---|
| 48 000 $ | 66 554 | 66 174 | 64 988 | **380** | 1 565 |
| 60 000 $ | 86 968 | 86 634 | 85 590 | **334** | 1 378 |
| 100 000 $ | 157 028 | 156 125 | 153 305 | **903** | 3 723 |

Dès janvier 2027 le brut déduit aurait été surestimé de 330 à 900 $, avec accumulation (~2 %/an
d'indexation des paliers).

**Paramètre OPTIONNEL à défaut NEUTRE** — un appelant qui ne passe rien obtient exactement le
comportement d'avant : zéro code de migration, zéro risque de rétrocompat, et un test le verrouille
(`calculateGrossFromNet(60000) === calculateGrossFromNet(60000, 2026)`).

**Cinq sites câblés** : `computeIncomeBaseline` et `computeBaseGrossAnnual` reçoivent `startYear` du
moteur ; `Retirement.tsx`, `TaxCenter.tsx` et la migration du store passent l'année COURANTE.

**Discrimination prouvée** : ignorer le paramètre dans l'implémentation fait rougir deux des trois
tests neufs.

⚠️ **La revue a trouvé une RÉGRESSION que j'avais introduite.** `TaxCenter.tsx` : j'avais changé
l'inversion pour l'année courante en laissant `calculateFiscalReport` à son défaut 2026, trois
lignes plus bas. AVANT le lot les deux étaient à 2026, donc l'aller-retour était EXACT ; après, la
paire était désaccordée. MESURÉ : **212 $/an dès 2027, 874 $ en 2030**, sur un panneau étiqueté
« Estimation {année courante} ». Câbler une année, c'est câbler une PAIRE.

⚠️ **Et une bombe à retardement dans mon propre test.** `migrateGrossFromNet.test.ts` vérifiait
l'aller-retour au barème 2026 alors que le code lit l'horloge : rouge garanti le 2027-01-01, sans le
moindre changement de code (reproduit en exécution, écart 208 $). Corrigé, et vérifié sous horloge
forcée à 2027, 2030 et 2040.

⚠️ **Deux sites d'appel manqués** — `mcp/financialSignals.ts` et `mcp/tools/getTaxSituation.spec.ts`
appelaient `computeBaseGrossAnnual(users)` alors que `year` était DANS LA PORTÉE aux deux. Le second
publie ce brut à un LLM dans un payload que le system prompt déclare « seule source de vérité
chiffrée » : écart mesuré 1 377 $ (2030) à 8 535 $ (2050). L'inventaire « cinq sites » en comptait
sept.

⚠️ **Mes tests de câblage ne testaient pas les appelants.** Mesuré : retirer `startYear` de
`projection.ts` laissait TOUT vert — `TEST-AU-CONTRAT-NE-VOIT-PAS-L-APPELANT`, re-commis. Fermé par
un scan de SOURCE sur les quatre sites, prouvé discriminant.

**Aussi** : les défauts littéraux `2026` remplacés par `TAX_BASE_YEAR` (ce qui a rendu l'entrée
d'inventaire fantôme en une heure — la garde l'a exigé) ; `year` gardé contre le non-fini (`NaN`
rendait « brut = net », impôt ZÉRO, en silence) ; seuil de test encadré (1 200-1 600 $) au lieu d'un
plancher 13× trop lâche ; `buildSimulationParams.ts` déclaré dans le hors-périmètre du garde — il
n'était NI scanné NI exclu, ce qui rendait à moitié fausse mon affirmation « le ratchet a attrapé mon
code » (il en avait attrapé un des deux littéraux du même commit).

**Découverte ouverte** : `[TAXBRACKETVIZ-ANNEE]` (même paire désaccordée côté affichage, 0,4 %). Le sens est le discriminant — indexer les paliers ALLÈGE l'impôt, donc il faut MOINS de
brut pour le même net ; un `year` ignoré rendrait toutes les années strictement égales.

⚠️ **Le ratchet fiscal a de nouveau attrapé mon propre code** : le défaut `startYear: number = 2026`
est un littéral neuf dans un module scanné. Inventorié `structural` — c'est la valeur de
rétrocompat, pas un ancrage de barème. Troisième lot d'affilée où une garde livrée récemment se
déclenche sur le lot suivant.

## 2026-08-20 — Vague 1f (3/5) : un facteur plat dont l'erreur change de signe

- [x] **`[MIGRATE-GROSS-135]`** (XS annoncé, S réel) — ✅ 2026-08-20, PR #669.

> Le brut était FABRIQUÉ à partir du net par un facteur plat `× 1,35`, à deux endroits
> (`store/useFinanceStore.ts` et `services/projection/setupSimulation.ts`, 4 usages). Ce brut
> alimente `baseGrossAnnual` — donc **toute** l'assiette d'impôt de la projection, les droits REER
> (18 % du revenu gagné) et les bonus/RSU.

**MESURÉ sur le barème 2026 — l'erreur CHANGE DE SIGNE**, ce qui est le point :

| net annuel | brut à 1,35× | brut EXACT | écart |
|---|---|---|---|
| 30 000 $ | 40 500 | 37 819 | **+2 681** (surestimé) |
| 100 000 $ | 135 000 | **157 028** | **−22 028** |
| 250 000 $ | 337 500 | 469 696 | **−132 196** |

Aucun réglage du facteur ne peut donc marcher : la relation net→brut est CONVEXE, un facteur plat la
coupe en un point et diverge des deux côtés. Remplacé par `calculateGrossFromNet` (inversion par
dichotomie, exacte à moins de 1 $ — roundtrip re-vérifié).

**Deux risques VÉRIFIÉS avant de câbler, pas supposés :**
- *Perf* — `calculateGrossFromNet` tourne dans `computeIncomeBaseline`, que `goalSeek` appelle en
  boucle. Mesuré : **0,026 ms/appel**, soit ~2 ms sur une dichotomie `goalSeek` complète. Négligeable.
- *Boot* — le store n'importait pas `utils/tax`, et le store EST dans le bundle de boot. Mesuré par
  build propre avant/après : le chunk `tax` (**6 125 octets**) passe de « chargé à la demande » à
  **préchargé** (8 → 9 `modulepreload`), +358 octets de JS total.
  ⚠️ **Justification revue à la baisse après relecture** : ce coût est imputable au SEUL import du
  store (vérifié en le retirant : on retombe à 8 preloads, plus de chunk `tax` — le correctif du
  moteur, lui, vit dans le bundle lazy et ne coûte rien). Or `getInitialStateWithMigration` fait un
  early-return dès que `financeai-storage` existe : ce chemin ne sert qu'aux upgrades d'avant l'ère
  persist. On paie donc 6 ko au boot pour TOUT LE MONDE au bénéfice d'une population résiduelle.
  Gardé quand même — une valeur fausse PERSISTÉE l'est à vie — mais c'est un arbitrage, pas un
  cadeau, et ma première formulation le présentait trop favorablement.

**Trois ancres re-basées**, chacune avec son delta mesuré à côté (+5 968 $, +7 324 $, +1 754 $) — et
réécrites pour viser la PROPRIÉTÉ (« le brut déduit redonne le net visé ») plutôt qu'un nombre.

⚠️ **Les gardes des deux PR précédentes ont travaillé sur ce lot** : la garde anti-fantôme (#668) a
exigé le retrait des deux entrées `1.35` au moment même où la dette était payée, et le ratchet
fiscal rougit maintenant si quelqu'un remet le facteur plat. Le registre décroît comme prévu.

**⚠️ LA REVUE A TROUVÉ UN DÉFAUT PLUS GROS QUE LE LOT** — `computeBaseGrossAnnual`
(`buildSimulationParams.ts`) n'avait AUCUN repli net→brut (`grossSalary || 0`). Le moteur DÉDUISAIT
donc un brut pour un conjoint sans salaire saisi et l'IMPOSAIT dessus, tout en le comptant pour ZÉRO
dans `baseGrossAnnual` — qui alimente les DROITS REER historiques et le ratio gains/MGA de la RENTE
RRQ. MESURÉ sur un couple dont le conjoint a 4 000 $/mois de net : **−211 532 $ de droits REER** et
**−247 $/mois de rente RRQ**. Corrigé dans ce lot, avec le patron qui existait déjà dans
`components/Retirement.tsx` (trois conventions net→brut coexistaient : `× 1,35`,
`calculateGrossFromNet`, et `|| 0`).

**⚠️ Mes trois ancres passaient par CHANCE.** `toBeCloseTo(x, 0)` exige `< 0,5 $`, or
`calculateGrossFromNet` ne garantit que `< 1 $`. Mesuré sur 2 951 cibles : **43 % dépassent 0,5 $**
(max 0,998 $). Tolérance réalignée sur la garantie de la fonction — une assertion plus serrée que ce
que la fonction promet est un piège CI à retardement.

**Trou de test comblé** : le site PERSISTÉ n'avait aucun test (`tests/store/migrateGrossFromNet.test.ts`,
4 cas, discrimination prouvée). C'était pourtant le seul des deux à ÉCRIRE des dollars.

**Effet non documenté ailleurs, et c'est le meilleur argument du lot** : il ANNULE le biais
`[ENG-NET-MODEL-RESIDUAL]` de FISCAL_REFERENCE §9 pour la population « brut déduit » — net du modèle
moins net déclaré : −3 627 $ → **−0,29 $** à 60 k$, −17 388 $ → **+0,77 $** à 120 k$. §9 mise à jour.

**Découvertes ouvertes** : `[GROSSFROMNET-ANNEE-FIGEE]` (barème figé à 2026, dérive 330-900 $ dès
2027), `[GROSSFROMNET-CREDITS-65]` (+1 904 $/an à 36 k$ pour un salarié 65+),
`[AUTOMARGINAL-BASCULE-SILENCIEUSE]`, et `[MIGRATE-GROSS-DEJA-PERSISTE]` — le correctif ne rattrape pas les configs
dont le brut erroné est DÉJÀ persisté (`u.grossSalary || …` court-circuite).

## 2026-08-20 — Le garde fiscal ne voyait pas la table FERR (ni le crédit pour dons)

- [x] **`[FISC-GUARD-VALEUR-LIEE]`** (M) — ✅ 2026-08-20, PR #668.
  *(Ouvert sous le nom `[FISC-GUARD-TERNAIRE]` ; la mesure a montré que le ternaire n'était que la
  moitié du trou, d'où le renommage.)*

> ⚠️ **Le filtre de position ne relevait qu'un littéral qu'on CALCULE** (`* 0.45`, `>= 65`,
> `|| 0.20`). Or un barème est tout aussi souvent un littéral qu'on **NOMME** — valeur de propriété
> d'objet — ou qu'on **CHOISIT** — branche de ternaire. Deux positions entièrement hors de vue.

**Ce qui était invisible depuis le PREMIER JOUR du garde :**

| Table | Ce que c'est |
|---|---|
| `RRIF_RATES` (24 valeurs) | les facteurs de retrait **minimum du FERR** de l'ARC, de 5,28 % à 71 ans à 20 % à 94 ans — le barème le plus utilisé de tout le moteur de décaissement, et il pilote un retrait **forcé**, donc de l'impôt |
| `DONATION_CREDIT_RATES` | 15 % / 29 % fédéral, 20 % / 24 % Québec |

Les deux sont **ancrées** dans `FISCAL_REFERENCE.md` (§7 et §10) : ce qui manquait n'était pas la
source, c'était la **protection**. Rien n'empêchait un facteur de dériver en silence.

**Mesuré** : 50 clés neuves à trier (27 dans `helpers.ts`, 9 `assetLocation`, 5 `setupSimulation`,
4 `donationCredit`, 4 `useFinanceStore`, 1 `realEstateMonth`). Une entrée **par âge** pour les
24 facteurs FERR.

⚠️ **Correction d'une surestimation que j'avais écrite ici** : « afin que la garde nomme précisément
lequel a bougé » était à moitié faux. La clé d'inventaire est `(fichier, valeur)` — elle ignore
l'ÂGE. La revue en a tiré qu'une PERMUTATION de deux facteurs passerait inaperçue ; **mesuré, c'est
inexact** : en échangeant 80 ↔ 94, le ratchet reste effectivement VERT, mais
`tests/services/projection.helpers.test.ts` tombe DEUX fois (ancre à 94 ans, et surtout l'assertion
de stricte croissance qui boucle de 73 à 94 — elle existait déjà). Le dépôt est donc protégé, par
une garde AUTRE que celle-ci. Formulation juste : le ratchet nomme la VALEUR apparue ou disparue ;
l'ORDRE des âges est tenu par le test de monotonicité.

**Discrimination prouvée sur ce qui compte** : dériver le facteur FERR de 80 ans (0,0682 → 0,0862)
et le taux du crédit fédéral pour dons (0,29 → 0,31) font rougir la garde. Ni l'un ni l'autre
n'aurait bougé avant ce lot.

**Effet de bord vertueux** : l'élargissement a rendu visible le `survivorPsvFactor = survivorMode ?
0.5 : 1` de `retirementIncome.ts`, et **la garde `[×N]`/`[≠N]` a immédiatement exigé** que l'entrée
correspondante passe de `[≠3]` à `[≠4]`. C'est le mécanisme qui fonctionne comme annoncé : le compte
bouge quand une occurrence apparaît, et c'est exactement le moment où il faut re-regarder.

**Découvertes classées au passage** : `setupSimulation::72` (report de la RRQ jusqu'à 72 ans depuis
2024 — vrai paramètre, à ancrer §6) et `realEstateMonth::5` (grâce RAP de 5 ans, à sourcer avec les
bornes 2022/2025 de `[FISC-RAP-GRACE-WINDOW]`).

## 2026-08-20 — Vague 1f (2/5) : le plafond RQAP, et une règle de portefeuille qui déplaçait une loi

- [x] **`[RQAP-CAP-98K]`** (XS annoncé, S réel) — ✅ 2026-08-20, PR #667.

**Trois volets, prouvés séparément parce qu'ils régressent séparément.**

**(a) La valeur.** `98000` recopié en dur — la valeur 2025 — pendant que la source unique portait
`RQAP_MAX_INCOME = 103 000 $`. Remplacé par un import. **Écart MESURÉ à l'année 0 : 53 900 $ →
56 650 $, soit +2 750 $/an** de prestation brute. Le chiffre du ticket est confirmé.

**(b) Le taux de remplacement.** Constante nommée `RQAP_REPLACEMENT_RATE_BASE`, sourcée §2. La
divergence avec le vrai régime (70 % puis 55 %, pas 55 % plat) est **documentée, pas corrigée** :
elle demande de modéliser les semaines par prestation et le choix de régime, que l'app ne saisit
pas. C'est une décision produit → `[RQAP-PHASES-70-55]`.

**(c) L'index — le volet qui comptait vraiment.** Le plafond était multiplié par
`expenseMultiplier`, qui compose l'inflation des DÉPENSES DU MÉNAGE (courbe du sourire de retraite
comprise) **et qui est GELABLE par Guyton-Klinger**.

> MESURÉ à l'année 20 : avec le gel de la règle de décaissement, l'assiette RQAP tombait de
> **80 092 $ à 53 900 $**. Une règle de PORTEFEUILLE déplaçait un plafond GOUVERNEMENTAL de
> 26 192 $. Ce n'est pas une imprécision, c'est une inversion de causalité.

Remplacé par le patron que le dépôt emploie DÉJÀ pour le MGA de la RRQ — `inflation + 0,5 %/an`,
documenté §6 — plutôt que d'en inventer un.

**La garde livrée la veille a attrapé ce lot-ci.** `rqapCapProjected` ajoutait un second `0.5` dans
`childrenReee.ts` ; la garde `[FISC-GUARD-SCOPE]` a exigé qu'on le déclare. Elle a aussi révélé, en
étant renforcée, que **16 de ses propres références de ligne étaient fausses** — certaines de
naissance, d'autres dérivées par les éditions de CE lot. Les numéros de ligne ont donc été
remplacés par des NOMS de construction, et le mécanisme `L<n>` par un compte `[×N]` / `[≠N]` qui
ne dérive pas.

**Découvertes ouvertes** : `[RQAP-PHASES-70-55]`, `[GOLDEN-RQAP-NON-COUVERT]`.

## 2026-08-20 — Vague 1f (1/5) : le ratchet fiscal voyait 8 modules sur 20

> ⚠️ **Le critère d'inclusion était le bug.** `FISCAL_MODULES` disait « les modules qui PRODUISENT
> de l'impôt ou une rente ». Or écrire un barème ne demande pas de produire un impôt : une
> SUBVENTION (SCEE/IQEE), une PRESTATION (RQAP), un PLAFOND LÉGAL (RAP, REEE) et un PROXY d'impôt
> (`noi * 0.45`) en sont tout autant. C'est par cette définition trop étroite que `98000` — le
> plafond RQAP figé à sa valeur 2025 alors que la source unique porte **103 000 $** — a vécu hors de
> portée du garde.

- [x] **`[FISC-GUARD-SCOPE]`** (réestimé **M**, annoncé S) — ✅ 2026-08-20, PR #666.
  **Mesuré avant d'écrire** : 12 modules à ajouter, **76 littéraux → 63 clés `(fichier, valeur)`**, puis **71 clés** après la revue (retrait de `0.5`/`1000` de `BENIGN`)
  triées à la main contre le code (27 pour `childrenReee.ts` seul). `FISCAL_MODULES` passe de 8 à
  **20**. Les quatre autres tickets 1f (`[RQAP-CAP-98K]`, `[W5-PROXY-NON-SOURCE]`, `[ESTATE-NPV-07]`,
  `[MIGRATE-GROSS-135]`) sont désormais tous inventoriés avec leur raison — leur diagnostic a été
  re-dérivé sur le code et **les quatre sont confirmés**.

**Deux gardes NEUVES, chacune prouvée discriminante :**

- *Le périmètre EXCLU est déclaré et vérifié* (`FISCAL_MODULES_HORS_PERIMETRE`) : `utils/tax.ts`
  (82 littéraux) et `services/realEstate.ts` (26) sont les sources DÉSIGNÉES du garde V1 — les
  scanner inverserait le sens du garde ; `services/projection.ts` (31) est un trou assumé. Un
  périmètre borné en silence se lit comme « tout est couvert ».
- *Une clé qui recouvre plusieurs occurrences les énumère* : soit `[×N]` en tête (les N occurrences
  ont le MÊME sens), soit N références `L<n>` (les sens diffèrent, chacun décrit). **La garde a
  trouvé 15 offenders PRÉEXISTANTS** dans l'inventaire d'origine — resserrer le scan avant le fix,
  encore une fois.

⚠️ **La revue a trouvé QUATRE de mes raisons FAUSSES** — dans le lot même qui prétend éliminer les
entrées « triées » sans qu'on les regarde. Motif commun : j'ai lu la LIGNE du littéral, pas le BLOC
autour. Et j'avais audité le critère de la LISTE sans regarder celui du FILTRE (`BENIGN`), qui
masquait trois vraies valeurs légales dans des modules scannés depuis toujours.

**Découvertes ouvertes au BACKLOG** : `[AE-PLAFOND-MANQUANT]` (ÉLEVÉ — le 55 % de l'AE appliqué au
NET et sans plafond), `[ASSETLOC-INCLUSION-RECOPIEE]`, `[FISC-REEE-AGE-FERMETURE]`,
`[FISC-RAP-GRACE-WINDOW]`, `[FISC-RAP-15ANS]`, `[ASSETLOC-YEAR-2026]`, `[FISC-GUARD-PROJECTION-TS]`.

## 2026-08-19 — Vague 1e (fin) : les cinq XS du silence

> Cinq erreurs avalées sans trace, regroupées par CLASSE. ⚠️ Chaque diagnostic a été **re-dérivé sur
> son propre code** avant d'écrire quoi que ce soit (leçon `DIAGNOSTIC-GROUPE-A-MOITIE-FAUX`, née du
> lot précédent où un groupement identique cachait deux défauts opposés). Les cinq se sont confirmés
> — cette fois.

**`[SILENT-STOCKFORM-PRICEHINT]`** — `suggestHistoricalPrice` échouait en `console.warn` seul : le
spinner s'arrêtait, le champ restait vide, aucune trace, aucun message. `logError` + un message à
l'écran, et un cas SÉPARÉ pour « aucun cours trouvé » (qui n'est pas une erreur). Patron repris de
`validateSymbol`, dans le MÊME fichier, qui distinguait déjà proprement les deux cas.

**`[SYSVIEW-DBSIZE-ZERO]`** — `catch { return 0; }` affichait « 0 KB », une valeur CRÉDIBLE donc un
mensonge : l'utilisateur lit « ma base est vide » quand la sérialisation vient d'échouer. Rend `null`
→ « — », avec la raison en `title`. L'incohérence était entre deux lignes du même écran :
`computeDiagnostics` poussait déjà un `level: 'err'` pour le MÊME échec.

**`[SILENT-PWA-PROMPT]`** — `logError` en `severity: 'info'`. Impact faible assumé, mais « faible
impact » ne veut pas dire « invisible ».

**`[SILENT-HEALTHWEIGHTS-FIELD]`** — distingue enfin ABSENT de CORROMPU. Un champ absent est la
rétrocompat normale (repli silencieux, voulu) ; un champ PRÉSENT mais non fini signale que quelque
chose a écrit une valeur invalide, et son repli muet rendait un réglage « oublié » inexplicable.
Journalisé, agrégé en un seul appel throttlé par signature de champs.

**`[DEAD-PARSETX-SILENT-DROP]`** — `parseTransactions` SUPPRIMÉE (fonction + ses tests). Plus aucun
appelant en production ; elle jetait silencieusement toute ligne à date ou montant invalide.
⚠️ Supprimée plutôt que corrigée **à dessein** : du code mort à perte silencieuse est un piège
RÉ-EXPOSABLE par copier-coller, et le corriger l'aurait rendu plus crédible sans lui rendre d'utilité.
`markDuplicates` et `isInternalTransferLabel` RESTENT (appelées par `App.tsx` et `parseBankCsv.ts`) —
un test le verrouille, parce que le vrai risque d'une suppression est d'emporter un voisin vivant.

### Un scan qui matchait la PROSE, deux fois de suite

La garde « aucun appelant ne référence `parseTransactions` » a échoué deux fois sur un COMMENTAIRE
d'en-tête de `parseBankCsv.ts` — qui mentionne légitimement le vieux parseur pour expliquer pourquoi
il existe. Le motif nu matchait la prose ; le resserrer sur l'appel (`\s*\(`) aussi, parce que la
prose écrit « parseTransactions (TAB/`;` … ».

**Resserrer le motif ne réglait pas le problème de fond** : un scan qui lit les commentaires les
prendra toujours pour du code. Les commentaires sont désormais RETIRÉS avant le scan, avec un
anti-vacuité sur le décommentage lui-même (il ne doit pas avoir mangé le fichier).

**9 cas, 5 discriminent** (un par correctif, vérifiés par perturbation).

- [x] **`[SILENT-STOCKFORM-PRICEHINT]`** (S, MOYEN) — ✅ 2026-08-19, PR #665.
- [x] **`[SYSVIEW-DBSIZE-ZERO]`** (XS, FAIBLE) — ✅ 2026-08-19, PR #665.
- [x] **`[DEAD-PARSETX-SILENT-DROP]`** (XS, FAIBLE) — ✅ 2026-08-19, PR #665.
- [x] **`[SILENT-PWA-PROMPT]`** (S) — ✅ 2026-08-19, PR #665.
- [x] **`[SILENT-HEALTHWEIGHTS-FIELD]`** (S) — ✅ 2026-08-19, PR #665.

## 2026-08-19 — Vague 1e (début) : deux silences vers un LLM, et un diagnostic à moitié faux

> Les deux tickets étaient groupés sous le même diagnostic : « un `(u.grossSalary || 0) * 12` publie
> un faux 0 $ au modèle ». **Vérifié : ce diagnostic n'est juste que pour le premier.**

### Livré — `[COUPLE-CTX-FAKE-ZERO]` (diagnostic CONFIRMÉ)

`CoupleOptimizationCard` coerçait en `|| 0` avant `promptCad`, qui rend justement « (non disponible) »
sur une valeur non finie. Un salaire absent devenait donc un **« 0 $ » affirmé** au modèle, qui
bâtissait ensuite des stratégies de fractionnement REER/CELI sur ce revenu fantôme. Coercition
retirée : `undefined * 12` vaut `NaN`, et la garde reprend son travail sans qu'aucune signature ne
change.

**Refactor pour rendre la garantie testable** : le bloc « profil » du prompt vivait inline dans une
fonction `async` qui appelle l'API — invérifiable autrement que par scan. Extrait en
`buildCoupleProfileLines` (pur, exporté), **sans changer un caractère du prompt produit**. Ce qui
compte n'est pas la valeur passée, c'est le TEXTE que le modèle lit.

### Livré — `[TOOL-TAXSITUATION-FAKE-ZERO]` (diagnostic RÉFUTÉ, vrai défaut ailleurs)

Dans `get_tax_situation`, le `|| 0` est suivi d'un `.filter(g > 0)` : le conjoint sans brut est
**EXCLU**, pas publié à 0. Aucun faux zéro n'existait.

Le vrai défaut est l'inverse, et plus sournois : **le conjoint disparaît du payload sans trace**. Or
le system prompt déclare les payloads d'outils « ta SEULE source de vérité chiffrée » — le modèle
voit un ménage à un seul contribuable et n'a aucun moyen de savoir qu'il en manque un.

Correctif : `perUserOmitted` nomme les exclus et la raison. ⚠️ **On exclut ET on le dit** — inclure
le conjoint avec un impôt à 0 aurait rétabli le faux zéro que le ticket croyait déjà présent. Le
champ est **toujours** présent, même vide : omis quand la liste est vide, il serait indiscernable de
« l'outil ne le dit pas ».

### Une assertion presque vacueuse, attrapée par perturbation

`expect(src).toContain('perUserOmitted')` passait **même sans le champ dans le payload** — la
constante locale porte le même nom. Resserré sur la ligne DU PAYLOAD
(`/perUserOmitted,\n\s*perUser: perUserReports\.map/`). Vérifié : les deux assertions tombent
maintenant quand on retire la ligne.

**5 cas, 3 discriminent** (vérifiés par perturbation).

- [x] **`[COUPLE-CTX-FAKE-ZERO]`** (XS, MOYEN) — ✅ 2026-08-19, PR #664.
- [x] **`[TOOL-TAXSITUATION-FAKE-ZERO]`** (XS, MOYEN) — ✅ 2026-08-19, PR #664.
## 2026-08-19 — Vague 1d (fin) : deux conteneurs W5 qui n'existaient pas au bilan

> Un immeuble locatif ne montrait que son NOI ; une entreprise privée que son dividende. **Leur
> valeur, leur dette et le service de cette dette n'existaient nulle part.**
>
> ⚠️ **L'invariant de conservation restait VERT dans les deux cas**, et c'est la leçon : tout était
> ABSENT du `chartData`, donc il n'y avait rien à réconcilier. Un actif qu'on n'écrit nulle part ne
> casse aucun bilan — il ment simplement. Un invariant de COHÉRENCE ne peut pas détecter une
> OMISSION ; il faut une assertion de PRÉSENCE.

### Livré — `[ENG-W5-RENTAL-OFFBALANCE]`

`services/projection/rentalMonth.ts` (module pur) + branchement moteur. **Les trois volets ensemble**
— valeur au bilan, hypothèque au bilan, service de la dette en dépense. Chaque moitié serait pire que
le statu quo : l'équité sans le service donnerait une hypothèque qui ne descend jamais.

**MESURÉ** (immeuble 800 k$, prêt 500 k$ à 5 % sur 25 ans) :

| | avant | après |
|---|---|---|
| équité au bilan (m0) | 0 $ | **+302 574 $** |
| hypothèque au bilan (m0) | 0 $ | **499 160 $** |
| service de dette | 0 $/mois | **+2 922,95 $/mois** |
| hypothèque à l'horizon | jamais amortie | **0 $** (éteinte) |

⚠️ **Hypothèse assumée et nommée** : `DEFAULT_RENTAL_AMORTIZATION_YEARS = 25` quand
`amortizationYears` est absent — standard canadien, et déjà le défaut du chemin « but immobilier ».
Posée dans une constante documentée, pas dispersée en littéral. L'UI devrait à terme demander le
champ (il existe déjà dans le type).

⚠️ **Non modélisé, et nommé plutôt que découvert plus tard** : la vente de l'immeuble, la récupération
de DPA (`ccaTaken`), l'impôt latent sur le gain. Le revenu locatif reste imposé au proxy 0,45 de
`w5Effects` (`[W5-PROXY-NON-SOURCE]`).

### Livré — `[ENG-W5-BUSINESS-OFFBALANCE]`

`privateBusinessValue` ajouté à `NetWorthParts`. **Le `Record<keyof NetWorthParts, …>` exhaustif a
fait exactement son travail** : il a forcé le compilateur à révéler les **4 sites** qui construisent
un patrimoine (moteur, succession, `pastNetWorth`, `dailyPastLedger`), et le test croisé a forcé
l'ajout à la fixture. Aucun site n'a pu être oublié en silence — c'est la raison d'être de ce patron.

⚠️ **On compte `estimatedValue × ownershipPct` et PAS `retainedEarnings`** : une valeur juste
marchande EMBARQUE déjà les bénéfices non répartis. Les additionner double-compterait de **400 k$**
dans le persona de référence. Un test verrouille ce point précis (2 M$, pas 2,4 M$).

⚠️ **Valeur CONSTANTE sur l'horizon** : aucune croissance modélisée. Faire croître une entreprise
privée à un taux inventé serait de la donnée fabriquée.

⚠️ **Le PASSÉ passe 0 EXPLICITEMENT** (`dailyPastLedger`) : il n'y a ni cours, ni relevé, ni
transaction d'où reconstruire la valorisation d'une entreprise privée.

**Preuve** : 10 cas, 4 discriminent (2 par moitié, vérifiés par perturbation), dont deux cas de
rétrocompatibilité stricte point par point.

- [x] **`[ENG-W5-RENTAL-OFFBALANCE]`** (M, HAUT) — ✅ 2026-08-19, PR #663.
- [x] **`[ENG-W5-BUSINESS-OFFBALANCE]`** (M) — ✅ 2026-08-19, PR #663.

## 2026-08-19 — `[ENG-APRIL-REFUND-NONREG-UNPUBLISHED]` : le dernier producteur muet

> `processAprilSettlement` réinvestissait le remboursement d'impôt de salaire au non-enregistré
> (`addNonReg`) sans publier `contribNonReg`. **Mesuré : 29 796,22 $ au mois 123 (un AVRIL), en mode
> DÉTERMINISTE.** `'NonReg'` entre enfin dans les `ACCOUNTS` de la garde forme-flux.
>
> ⚠️ **Le risque annoncé par le ticket était FAUX.** Il redoutait que publier ce flux « déplace une
> décision d'allocation dans le même mois », `cashflowAllocation` recevant `contribNonReg` en entrée.
> Vérifié par grep : ce module ne fait qu'un `state.contribNonReg += excess` et ne LIT jamais la
> valeur. Un ticket qui se trompe de cause n'invalide pas le travail — il invalide la phrase qu'on
> allait recopier.
>
> ⚠️ **Le VRAI risque était ailleurs, et le correctif n'est PAS neutre en argent.** `contribNonReg` a
> un SECOND consommateur : `growthApplication` calcule la croissance sur `nonReg − contribNonReg`,
> pour exclure les dépôts de MI-MOIS d'un mois complet de rendement. Le remboursement, versé le
> **30 avril**, gagnait donc un mois ENTIER de rendement qu'il n'avait pas mérité. Publier le flux
> retire cette croissance fantôme : **−428,67 $ de patrimoine final sur 30 ans** (−0,009 %) sur le
> scénario de référence, jusqu'à **−23 343 $** sur le plus gros ancrage. L'écart est NÉGATIF partout
> et croît avec l'horizon — signature d'un intérêt composé qu'on cesse de créditer à tort.
>
> **Trois ancrages goldens RE-BASÉS**, avec l'écart chiffré et expliqué à côté de chacun — jamais une
> tolérance élargie « pour faire passer » (patron déjà appliqué dans ces mêmes fichiers).
>
> **Périmètre MESURÉ avant de coder** : la garde a été élargie à `NonReg` D'ABORD, sur la version
> COMPLÈTE incluant les cas de décaissement (#658). Un seul contrevenant révélé.
>
> **4 cas rouges** sans le correctif (vérifié par perturbation), dont un cas dédié qui prouve la
> conséquence financière — les deux propriétés (« mouvement expliqué » et « pas de rendement sur un
> dépôt du 30 ») sont indépendantes, et la seconde se casserait en silence sans lui.

- [x] **`[ENG-APRIL-REFUND-NONREG-UNPUBLISHED]`** (S, HAUT) — ✅ 2026-08-19, PR #662.

## 2026-08-19 — Vague 1c (fin) : deux angles morts d'invariant, deux défauts trouvés

> Les deux items étaient des extensions de COUVERTURE, pas des correctifs. Chacune a trouvé un vrai
> défaut que les gardes existantes ne pouvaient pas voir — c'est le rendement d'une extension de
> couverture bien ciblée, et la raison de les traiter comme une investigation.

### Livré — `[ENG-MC-CONSERVATION-BLIND]`

`tests/services/mcConservation.test.ts` (4 cas). Toute la branche stochastique (divorce, décès du
conjoint, LTD, maladie grave, LTC, perte d'emploi, héritage, bootstrap) n'existe que sous
`enableMonteCarlo`, et l'API publique appelle TOUJOURS `runScenario(..., false, ...)` : ces chemins
n'avaient jamais été parcourus par un invariant de conservation.

**Deux verrous à lever, et il fallait les deux** : `__runScenarioForTests` (hook TEST-ONLY pour
`enableMonteCarlo = true`) et `diagnostics.verboseMonthlyPoints` (sans lui, le point MC est réduit à
`{ NetWorth, monthIndex }` — aucune ventilation à reconstruire).

**MESURÉ (60 runs × 361 mois = 20 365 points)** : l'identité de bilan TIENT, pire écart **0,02 $**,
zéro champ non fini, zéro actif négatif. **Aucun défaut corrigé** — un angle mort devient une garde.

**Anti-vacuité assertée, pas supposée** : la couverture de chaque chemin est comptée avec un plancher
(divorce ≥ 20 runs, perte d'emploi ≥ 25, maladie grave ≥ 12, héritage ≥ 12, LTD ≥ 6, LTC ≥ 3, décès
du conjoint ≥ 1). Une gate d'âge déplacée ou une probabilité remise à zéro fait ÉCHOUER la suite au
lieu de vider la garde en silence.

**Force de la garde MESURÉE par perturbation** (un invariant qui ne trouve rien doit prouver qu'il
POURRAIT trouver) : publier `CELI × 0,999` dans `monthlyOutput` → ÉCHEC à 6 892 $ (classe
MONEY-PHANTOM, ce qu'INV-9 doit voir) ; `reer *= keep × 0,999` dans le partage de divorce → PASSE, et
c'est correct — `NetWorth` est dérivé des mêmes soldes, un invariant de bilan juge la COHÉRENCE, pas
le MONTANT. Écrit dans le fichier pour qu'on ne croie pas la garde plus forte qu'elle n'est.

- [x] **`[ENG-MC-CONSERVATION-BLIND]`** (M) — ✅ 2026-08-19, PR #658.

### Livré — `[ENG-INV-FLUXFORM-COVERAGE]` → a révélé `[ENG-FERR-NETTRANSFER-MUET]`

La garde forme-flux tournait sur une fixture de **12 ans** avec une retraite à 62 ans pour un couple
de 45 : elle n'ATTEIGNAIT JAMAIS le décaissement. Portée sur 35 ans, elle a trouvé immédiatement :

> **`[ENG-FERR-NETTRANSFER-MUET]`** — le retrait MINIMUM FERR (72+) alimentait `retraitReerMois`
> (registre d'AFFICHAGE) mais PAS `withdrawalREER` (registre des TRANSFERTS → `NetTransferREER`).
> **MESURÉ : 131 566,62 $** de REER disparaissant sans flux publié, **en mode DÉTERMINISTE** — donc à
> l'écran — à chaque janvier de 72+. Récidive exacte de `[ENG-FERR-FLOW-INVISIBLE]`, qui avait branché
> UN des deux registres.

⚠️ **Le pari du ticket était périmé** : il annonçait un échec sur `stressTestEnabled`. Le stress-test
est corrigé depuis et reste vert. Le vrai défaut était ailleurs, et plus grave.

⚠️ **Le correctif exclut la FERR de `stepReerByUser`** : elle a déjà été retirée de la part EXACTE de
chaque conjoint (facteur RRIF de SON âge) ; l'y réinjecter la re-soustrairait AU PRORATA et fausserait
un couple à écart d'âge. Un montant, deux registres, deux règles.

**Preuve de non-régression** : goldens complets (~50 champs × 361 mois × 3 écarts d'âge 0/6/12 ans)
comparés champ à champ AVANT/APRÈS. **Un seul champ change, `NetTransferREER`, sur 27 points.**
`reerByUserFinal`, soldes, impôts, patrimoine : bit-identiques.

**3 cas ajoutés à `tests/services/projection.fluxForm.test.ts`, 2 DISCRIMINENT** (vérifié par
`git stash`). Le 3ᵉ verrouille la frontière : le partage per-conjoint ne doit PAS bouger — un
correctif de FLUX qui déplacerait de l'ARGENT serait pire que le défaut.

- [x] **`[ENG-INV-FLUXFORM-COVERAGE]`** (S) — ✅ 2026-08-19, PR #658.
- [x] **`[ENG-FERR-NETTRANSFER-MUET]`** (S) — ✅ 2026-08-19, PR #658 (découvert par l'item ci-dessus).
## 2026-08-19 — Vague 1d (suite) : le bilan au jour, et un ticket fermé sans code

### Corrigé — `[JOUR-BILAN-ROMPU-SOUS-HYPOTHEQUE]`

> `NetWorth` était interpolé POUR LUI-MÊME au jour, avec ses propres deltas datés et un résidu
> étalé uniformément — pendant que `DettesNonImmo` étalait le sien en cadence HEBDOMADAIRE et que
> `Liquidites` encaissait en plus les remboursements. Trois formes d'étalement pour des grandeurs
> liées par une identité comptable.
>
> **Mesuré, pire écart sur 1 461 jours** : socle salarié **89,01 $ → 0,00 $** · hypothèque + prêt
> auto **−76,62 $ → 0,00 $** (l'audit initial mesurait jusqu'à −1 408,37 $, 0,28 % du patrimoine,
> sur un profil plus gros). `NetWorth` est désormais DÉRIVÉ du bilan du jour, même patron que
> `Savings` juste au-dessus.
>
> ⚠️ **Arbitrage assumé au DERNIER jour du mois** : la valeur du MOTEUR prime et n'est pas dérivée.
> Le moteur arrondit chaque composant à 2 décimales, donc la somme des arrondis diffère de
> l'arrondi de la somme — mesuré 0,01 $. Le test de raccord existant exige l'égalité stricte (5e-7)
> avec le point mensuel et il a raison : `cur.NetWorth` EST la source de vérité. Un cent le dernier
> jour contre une dérive structurelle les trente autres. **Le correctif aurait pu être « écrit » en
> relâchant cette tolérance** — un test dédié verrouille l'inverse.
>
> Preuve : 3 cas sur 4 discriminent ; les 25 invariants existants du grand livre repassent.

- [x] **`[JOUR-BILAN-ROMPU-SOUS-HYPOTHEQUE]`** (S, MOYEN) — au JOUR,
  `NetWorth ≠ Σactifs − DettesNonImmo` en intra-mois : `NetWorth` reçoit les deltas datés et étale
  son résidu **uniformément**, tandis que `DettesNonImmo`/`DetteTotale` étalent le leur en cadence
  **hebdomadaire** et que `Liquidites` reçoit en plus `ctx.debt`
  (`services/projection/dailyLedger.ts:572-595`, `:586-590`). **Mesuré : 0,01–0,02 $ sans immobilier
  (5 scénarios), mais −1 408,37 $ avec hypothèque + prêt auto (0,28 % du NW), en dents de scie les
  jeudis** ; l'identité se referme au dernier jour du mois. Effet visible : les aires empilées et la
  ligne NetWorth ne se recomposent pas. Correctif : dériver la série quotidienne `NetWorth` de la
  somme des séries de composants au lieu de l'interpoler indépendamment. [MESURÉ]

### Fermé SANS code — `[NW-PRESENT-DEUX-PERIMETRES]`

> **Mesuré, pas supposé** : une SEULE surface recompose `netWorth + realEstateEquity`
> (`FutureKpiStrip`, vérifié par grep), et elle utilise déjà la source unique `presentEquityOfGoal`,
> qui porte sa propre garde de finitude (`presentEquity-nonfini`). **Aucun écart en production.**
>
> J'ai commencé par écrire le `computePresentNetWorthWithRealEstate` que le ticket proposait, puis
> je l'ai RETIRÉ : `FutureKpiStrip` reçoit `netWorth` déjà calculé en PROP, il n'a pas les entrées
> brutes (`initialBalances`, `transactions`, `assets`, `fxRates`, `debts`) et ne pourrait donc pas
> l'appeler. Le helper n'aurait été appelable par personne, et sa garde de finitude existait déjà
> en amont. Ajouter du code que rien ne consomme est pire que le ticket ouvert.
>
> Les deux périmètres sont LÉGITIMES et documentés : hors immobilier pour le Dashboard et le
> snapshot IA, immobilier inclus pour le bandeau KPI du Futur (parité voulue avec l'ex-Accueil).
> À rouvrir SI une 3ᵉ surface veut ce périmètre — là, le point d'entrée unique se justifiera.

- [x] **`[NW-PRESENT-DEUX-PERIMETRES]`** (XS, FAIBLE) — le patrimoine net PRÉSENT existe en deux
  périmètres : `computePresentNetWorth` (`services/portfolio.ts:207`, **hors** immobilier) et une
  recomposition locale `netWorth + realEstateEquity` avec son propre `presentEquityOfGoal`
  (`components/FutureKpiStrip.tsx:84-97`). L'écart vaut l'équité immobilière entière selon la surface
  consultée ; documenté comme parité voulue avec l'ex-Accueil. Correctif : exposer un
  `computePresentNetWorthWithRealEstate` unique. [MESURÉ par lecture]

---

## 2026-08-19 — Correctif du correctif : `[CURVE-FIELDS-DETTE-MANQUANTE]`

> Le correctif `[JOUR-BILAN-ROMPU-SOUS-HYPOTHEQUE]` (PR #657) **ne s'exécutait jamais sur la vraie
> courbe**. La recomposition s'abstient si un terme du bilan manque (garde délibérée, et bonne) ; or
> `FutureProjection` passe `fields: CURVE_FIELDS` — une ventilation ALLÉGÉE (~100 ms au lieu de
> ~500 ms sur 30 ans) qui ne liste que les champs TRACÉS. `DettesNonImmo` n'y figurait pas, puisque
> aucune AIRE ne la dessine. Condition `complet` toujours fausse ⇒ **vert en test, inerte en prod**.
>
> ⚠️ Mes 4 tests appelaient `buildDailyLedger` **sans `fields`** : ventilation complète, tous les
> termes présents. Le CONTRAT de la fonction était parfaitement respecté — c'est le PÉRIMÈTRE DE
> TRAVAIL de l'appelant que je n'avais pas rejoué.
>
> ⚠️ Trouvé par la revue automatique Vercel sur la PR, **après** le merge. Un finding qui pointe une
> INERTIE se vérifie en une minute par grep : le faire AVANT de le classer en faux positif.
>
> Livré : `DettesNonImmo` ajouté à `CURVE_FIELDS` (avec le POURQUOI en commentaire, puisque le champ
> n'est tracé par rien), plus un cas qui lit le set dans le SOURCE du composant et rejoue la
> ventilation avec LUI — en deux temps, la LISTE (qui nomme la cause) et l'EFFET (qui re-mesure
> l'identité). Il DISCRIMINE (vérifié par `git stash`).

- [x] **`[CURVE-FIELDS-DETTE-MANQUANTE]`** (XS, HAUT) — ✅ 2026-08-19, PR #659.
      Leçon : `CORRECTIF-VERT-EN-TEST-INERTE-EN-PROD` (`docs/CONVENTIONS.md`).

## 2026-08-19 — Vague 1d (début) : les revenus que la ventilation ne montrait pas

> `Income` contient le revenu locatif, les allocations familiales et les paiements REEE ; la
> ventilation affichée n'en listait AUCUN. **Mesuré : 3 551 $/mois de loyer invisibles** (scénario
> locatif) et **550 $/mois d'allocations** (scénario 1 enfant) — le résidu
> `Income − (Marc + Anna + Retraite)` valait EXACTEMENT ces champs. Le moteur les émettait déjà :
> il suffisait de les CONSOMMER (jamais de les recalculer, cf. `chartDataSumGuard`).
>
> ⚠️ **Mes fixtures étaient fausses au premier essai** : `monthlyRent` au lieu de
> `rentalIncomeMonthly` + `isRented`, et un `ChildGoal` incomplet. Les trois scénarios rendaient un
> résidu de **0** et le test aurait été VERT sans rien mesurer. Vérifier les noms de champs contre
> `types.ts` AVANT de conclure qu'un scénario ne reproduit rien.
>
> ⚠️ **Le test moteur ne discriminait pas** : le correctif vit dans deux COMPOSANTS, le moteur n'a
> pas changé. D'où le scan de source (patron `chartPrivacyScan`) qui, lui, échoue sur le code
> d'avant. 2 cas sur 6 discriminent — écrit dans le fichier.

- [x] **`[REVENUS-NON-VENTILES-AFFICHAGE]`** (S, MOYEN) — `Income` inclut le revenu locatif, les
  prestations pour enfants et les paiements REEE, mais la ventilation montrée à l'utilisateur ne
  liste que `IncomeMarc / IncomeAnna / IncomeRetirement / (RetraitREER+RetraitCELI)` —
  `components/projection/FutureDetailModal.tsx:439-445`, `components/projection/ProjectionTooltip.tsx:230-232`.
  **Mesuré : `Income − (IncomeMarc+IncomeAnna+IncomeRetirement)` = 5 299,30 $/mois** (scénario
  locatif, m480) et **659,22 $/mois** (scénario 1 enfant) ; 0,01 $ sur le socle. Correctif : ajouter
  les lignes manquantes — le moteur émet déjà les champs, donc les CONSOMMER et surtout **ne pas
  additionner** (cf. `utils/chartDataSumGuard.ts`). [MESURÉ]

---

## 2026-08-19 — Vague 1c (partielle) : le cône Monte Carlo cessait d'être ordonné

> **Mesuré sur un scénario volatil** (30 ans, 200 itérations, gros non-enregistré + retraite à 60) :
> P10 > P50 sur **99 mois / 361 (27 %)**, P50 > P90 sur 6 mois, pire écart **737 974 $**. Après :
> **0 croisement**, garanti par construction.
>
> Le tri par patrimoine FINAL est conservé pour le seul `representativeRun` (les métriques expertes
> décrivent un scénario VÉCU, pas un assemblage de percentiles). La contrepartie du fan chart est
> assumée et écrite dans le code : la bande n'est plus une trajectoire atteignable.
>
> ⚠️ **Deux pièges rencontrés, tous deux de mon fait** :
> le Monte Carlo s'active par le 2ᵉ ARGUMENT de `calculateFutureProjection(params, runMC)`, pas par
> un flag de config — ma première mesure lisait des bandes à zéro et le test « 0 croisement » était
> VERT sans rien prouver. Puis j'ai asserté que les trois bandes coïncident au premier point : faux,
> `chartData[0]` a déjà subi un mois de rendement stochastique.
>
> Preuve : **2 cas sur 4** discriminent (les 2 autres gardent contre un « correctif » qui aplatirait
> le cône ou le rendrait dégénéré).

- [x] **`[MC-BANDES-CROISEES]`** (M, MOYEN — unifie `[ENG-MC-BANDS-ORDER]`, même mécanisme) — `runMonteCarlo` classe les **trajectoires entières** par
  patrimoine FINAL puis publie `sorted[10%]/[50%]/[90%]` comme un cône P10/P50/P90
  (`services/projection/monteCarlo.ts:117-121`). Ce ne sont donc **pas** des percentiles mensuels :
  à un mois donné la borne basse peut passer au-dessus de la médiane. **Mesuré (30 ans, 200
  itérations) : P10 > P50 sur 60 mois / 361 (17 %), P50 > P90 sur 11 mois, pire croisement
  32 808 $ au m57** ; non-vacuité vérifiée (361/361 points à P10 ≠ 0). **Aucun test ne le couvre** —
  `tests/services/monteCarlo.test.ts:64` assied le tri par NW final avec un mock à NW constant, donc
  le croisement y est **impossible par construction**. Correctif : soit calculer le percentile PAR
  MOIS, soit renommer/documenter la série comme « trajectoire du run au décile terminal » ; dans les
  deux cas ajouter la garde `P10 ≤ P50 ≤ P90` mois par mois. [MESURÉ]

---

## 2026-08-19 — Vague 1b (partielle) : l'espace CELIAPP et l'assiette RAMQ

> Trois items du lot `taxDecember`/`taxJanuary`. Les deux restants du lot (`[FISC-BAND-AGE-CREDITS]`,
> `[FISC-DIV-DERIVED-BASES]`, `[ENG-GK-THRESHOLD-KNIFE]`, `[ENG-TTP-UNSETTLED-PROPAGATE]`) sont
> laissés OUVERTS : les bandes d'âge demandent de reconstruire un `ageOpts` valide hors des branches
> actif/retraité et vont re-baser des goldens ; le seuil Guyton-Klinger demande un choix de design
> (hystérésis). Les empiler ici aurait fait un lot ingérable.
>
> **Mesures de l'écart, sur la CHAÎNE** (couple à 16 k$/mois brut, achat immobilier dans 6 ans) :
> solde CELIAPP à la fin de l'an 1 = **32 962 $ avant, 16 926 $ après** — plus du DOUBLE du plafond
> annuel légal de 16 000 $. Effet symétrique pour qui ne cotise pas : l'espace publié retombait de
> 32 000 $ à 16 000 $ chaque décembre (la « dent de scie »), sous-estimant des droits réels.
>
> ⚠️ **Deux de mes tests étaient faux avant d'être justes** — c'est la partie instructive :
> les cas visant `processJanuaryReset` en direct passaient des DEUX côtés (le contrat de janvier
> était bon, le défaut vivait chez son appelant), et mon premier test de chaîne accusait le moteur
> sur un scénario sans cotisation, où le report maximal est parfaitement LÉGAL. Un test qui échoue
> n'a pas forcément raison. Preuve finale : 5 cas sur 13 discriminent.

- [x] **`[CELIAPP-DOUBLE-RECHARGE]`** (S, ÉLEVÉ) — l'espace CELIAPP a **deux producteurs qui
  s'ignorent** : décembre écrase `fhsaRoom = FHSA_ANNUAL_LIMIT_PER_USER * taxFilers`
  (`projection.ts:1190`), puis janvier calcule son report
  `allowedCarryForward = min(annuel, fhsaRoomCurrent)` **sur cette valeur déjà écrasée**
  (`taxJanuary.ts:164-167`) → le report est **toujours maximal**, quelle que soit l'utilisation
  réelle. Chaîne vérifiée par Claude. **Mesuré** : dents de scie de `CELIAPPMax` (32 000 $ →
  16 000 $ au m23 → 32 000 $ au m24, chaque année) ; sur un couple qui cotise vraiment, **22 535 $
  cotisés en an 1 pour un maximum légal de 16 000 $, 54 666 $ cumulés fin an 2 pour 32 000 $ légal,
  et le plafond à vie de 80 000 $ atteint en 3 ans au lieu de 5**. Correctif : supprimer l'écriture
  de décembre (janvier est la source unique) et faire porter le report sur l'espace RÉELLEMENT
  inutilisé. [MESURÉ]

- [x] **`[DOC-CELIAPP-REPORT-PERIMEE]`** (XS, FAIBLE) — `docs/FISCAL_REFERENCE.md:431` affirme que
  « le REPORT de droits n'est PAS modélisé » alors que `taxJanuary.ts:164-167` implémente bel et bien
  un `allowedCarryForward` et publie 16 000 $/personne/an. La note dit explicitement « ne pas
  corriger le clamp sans modéliser le report entier » : **elle protège aujourd'hui un bug au lieu
  d'un choix**. Correctif : réécrire après le fix `[CELIAPP-DOUBLE-RECHARGE]`. [MESURÉ]

- [x] **`[RAMQ-ACTIF-HORS-RETRAITS]`** (XS, MOYEN — **trouvé par Claude en corrigeant
  `[REER-ACTIF-NON-RECONCILIE]`**) — l'assiette de la prime RAMQ est ASYMÉTRIQUE entre les deux
  branches de décembre : en mode RETRAITÉ elle inclut `accRetraitsReerYear`
  (`services/projection/taxDecember.ts:728-733`), en mode ACTIF elle vaut « salaire brut − déductions »
  et **ignore les retraits REER** (`:735-741`). Or un retrait REER entre bien dans le revenu net au
  sens de la ligne 275 TP-1, qui est l'assiette de la prime. Impact BORNÉ : la prime plafonne à
  `RAMQ_MAX_PREMIUM_2026` = 766 $/adulte, donc l'écart n'existe que pour un revenu bas assorti d'un
  gros retrait — nul sur les cas mesurés à 90 k$ et 150 k$ de salaire, déjà au plafond.
  ⚠️ Le FSS voisin est un cas DIFFÉRENT : il ne s'applique qu'aux retraités par choix documenté
  (« les salariés sont couverts par leur employeur ») — ne pas le « corriger » par symétrie.
  Correctif : ajouter les retraits REER (et les gains) à `familyNetIncome` de la branche active.
  ⚠️ NON corrigé dans le lot REER du 2026-08-19 : hors des deux CRITIQUES demandés par Marc, et
  élargir un scope non demandé sur du fiscal est précisément ce que la règle interdit. [MESURÉ]

---

## 2026-08-19 — Vague 1a : `[CASH-NAN-SILENT]`, le cash de départ trace enfin sa corruption

> Premier lot de code du plan « vider le backlog ». Traité **seul** parce que c'est le POINT
> D'ENTRÉE de toute la projection : si le cash de départ est faux, tout ce qui en découle l'est.
>
> Le nombre ne change PAS (un terme non fini valait 0, il vaut toujours 0) — c'est la **trace** qui
> manquait. Trois copies de la formule faisaient `Number(v) || 0` en silence, alors que le patron
> `HARDEN-*-NAN` (né de l'incident « −193 k$ ») est appliqué à `assetValueCad` 65 lignes plus haut
> dans le MÊME fichier. Les trois pointent désormais sur `services/startingCash.ts`.
>
> ⚠️ Portée de la preuve de discrimination : **1 cas sur 10** échoue sur le code d'avant (celui qui
> vise les consommateurs réels). Les 9 autres testent un module NEUF — écrit dans le fichier plutôt
> que présenté comme une garde du fix.
>
> Le schéma de restauration de backup (`transactions: passthrough()`, `amount` non typé) n'a PAS été
> durci : c'est un choix documenté (« accepter large plutôt que rejeter un backup légitime »), et la
> trace est précisément la bonne réponse à ce choix.

- [x] **`[CASH-NAN-SILENT]`** (M, CRITIQUE) — le **cash de départ de TOUTE la projection** coerce en
  silence : `Number(v) || 0` sur `initialBalances` ET sur `transaction.amount`, sans aucun
  `logError`, dans les 3 copies de la formule (`hooks/useSimulationParams.ts:128-135` — celle
  réellement consommée par `ProjectionEngine`, `services/portfolio.ts:120-130`,
  `services/projection/buildSimulationParams.ts:135-147`). Le patron `HARDEN-*-NAN` est appliqué
  65 lignes plus haut dans le MÊME fichier (`assetValueCad`) et dans `computeRawNetWorth`
  (`services/projection/netWorth.ts:77-93`), créé après l'incident réel « −193 k$ » du 2026-06-16 —
  mais pas ici. **Chemin d'atteinte vérifié** : `components/settings/BackupPanel.tsx:24` valide les
  backups restaurés avec `transactions: z.array(z.object({}).passthrough())` → `amount` n'est PAS
  typé (contrairement à `initialBalances: z.record(z.string(), z.number())` qui l'est), et le store
  recharge par `JSON.parse` brut (`store/useFinanceStore.ts:318`) sans re-validation. Un montant
  corrompu devient un `0 $` crédible à la racine de la projection, sans trace. Correctif : unifier
  les 3 copies sur un helper unique + `logErrorThrottled` avec les termes fautifs, calqué sur
  `computeRawNetWorth`. [MESURÉ]

---

## 2026-08-19 — Ménage : 14 tickets fermés comme DOUBLONS (aucun code)

> Vague 0 du plan « vider le backlog » (analyse PM du 2026-08-19). **Aucun travail réel n'est
> retiré** : chaque classe garde UN ticket canonique, enrichi des mesures que ses doublons
> portaient. Ce qui disparaît, ce sont les IDs redondants.
>
> **Pourquoi ça comptait** : trois audits successifs (2026-07-31, 08-12, 08-19) ont re-décrit les
> mêmes défauts sans se comparer entre eux. Le bypass de `formatCAD` existait sous **cinq** IDs, les
> god-files sous un agrégat périmé PLUS un ticket par fichier, et `[SILENT-STOCKFORM-PRICEHINT]`
> était copié-collé deux fois dans le même fichier. Deux PR auraient pu partir sur le même code.
>
> **Preuve que l'agrégat nuisait** : `[DETTE-GODFILES]` annonçait `FutureProjection.tsx` à 1 199
> lignes, `[GODFILE-FUTUREPROJECTION]` à 1 820, la mesure du 2026-08-19 dit **2 026**. Le fichier
> grossissait pendant qu'on le décrivait à trois tailles différentes.
>
> ⚠️ **Une fusion proposée par le PM a été REFUSÉE** : `[FORMATCAD-OR-ZERO]` (10 sites
> `formatCAD(Number(v) || 0)`) n'est pas du même groupe que le bypass de `formatCAD`. Le `|| 0`
> ANNULE la garde no-fake-data au lieu de la contourner, et son correctif est l'inverse (retirer le
> `|| 0`, pas remplacer l'appel). Les deux tickets restent séparés.

**Fermé comme DOUBLON de `[FMT-TOLOCALESTRING-MONEY]`** :
- [x] **`[FMT-INFOBULLE-TOLOCALESTRING]`** (XS) — `ProjectionTooltip` a son propre
  `fmt = Math.round(n).toLocaleString('fr-CA')` au lieu de `formatCAD` (non négociable du CLAUDE.md).
  Pré-existant, mais la PR l'ÉTEND à une nouvelle surface monétaire. Conséquences : une valeur non
  finie afficherait `NaN$` au lieu de « — », et le même montant se lit « 1 234$ » dans l'infobulle
  et « 1 234 $ » dans la modale.

**Fermé comme DOUBLON de `[FMT-TOLOCALESTRING-MONEY]`** :
- [x] **`[UI-FMTM-FORMATCAD]`** (S — panel #554, PRÉ-EXISTANT) — `fmtM` maison
  (`StrategyOptimizerPanel.tsx:57`, `(v/1e6).toFixed(2)M$`) viole « formatCAD UNIQUEMENT » et
  écrase la granularité (6 157 $ → « 0.01M$ »).

**Fermé comme DOUBLON de `[MC-BANDES-CROISEES]`** :
- [x] **`[ENG-MC-BANDS-ORDER]`** (M, moteur, 🧭 financial-integrity d'abord) — les bandes Monte
  Carlo sortent DÉSORDONNÉES du moteur : sur 361 mois, 171 violations d'ordre et 8 mois où
  P10 > P90 (jusqu'à 36 952 $, 17,25 % du P50), toutes dans les ~60 premiers mois (mesuré
  projection-validator 2026-08-12, `probe7_mc.ts` — la ventilation quotidienne n'en crée AUCUNE :
  47,3 % au jour vs 47,4 % au mois, l'interpolation hérite). PRÉEXISTANT à #592, rendu plus
  visible depuis que les bandes se tracent partout. Diagnostiquer dans le moteur MC (tri des
  percentiles par mois ? graine ? fenêtre courte ?) — passe financial-integrity avant tout fix.

**Fermé comme DOUBLON de `[GODFILE-BUDGET / GODFILE-INVESTMENTS / GODFILE-FUTUREPROJECTION]`** :
- [x] **`[DETTE-GODFILES]`** (L, ⏳, par barrel — au fil de l'eau) — restent : `Budget.tsx` 1413 l.
  (a GROSSI), `Investments.tsx` 1345, `FutureProjection.tsx` 1199, `Transactions.tsx` 982,
  `Dashboard.tsx` 735, `utils/tax.ts` 908, `services/claude.ts` 912, `services/pdfReport.ts` 851,
  `services/projection.ts` 1751. (syncOrchestrator ✓, TaxCenter ✓ 613 l.) (≡ D4, CA-06, CA-09,
  DETTE-CLAUDE-SPLIT.) + [D4-H2] sélecteurs atomiques (App re-render sur tout slice non-lastProjection).

**Fermé comme DOUBLON de `[CHART-COLOR-DUP]`** :
- [x] **`[CA-07]`** (M) — tokens couleur : `constants/chartColors.ts` (source Recharts), ~200 hex en
  className → tokens sémantiques + règle ESLint anti-régression. (≡ D3 restes ; text-gray = 0 ✓.)

**Fermé comme DOUBLON de `[FMT-TOLOCALESTRING-MONEY]`** :
- [x] **`[FORMAT-CAD-BYPASS]`** (S, MOYEN) — helpers `$` **locaux** qui court-circuitent `formatCAD` :
  rendu mesuré `"NaN$"` / `"-NaN $"` au lieu de « — ». `components/projection/ActionPlanDrilldown.tsx:17` ·
  `components/projection/ProjectionExplains.tsx:24` · `components/projection/ProjectionTooltip.tsx:135` ·
  `components/retirement/GoalSeekerCard.tsx:100,111` · `components/import/ImportBankStatement.tsx:19` ·
  `components/investments/ImportBrokerPositions.tsx:20`. **Aucune garde du dépôt n'interdit ce
  motif** — `chartPrivacyScan` ne le couvre pas. Correctif : remplacer par `formatCAD` **et** ajouter
  le test-scan manquant (« pas de `toLocaleString` suivi de `$` hors `utils/format.ts` ») — sans quoi
  le motif reviendra. Recoupe `[DETTE-FORMATCAD-BYPASS]` (77 occurrences au total). [MESURÉ]

**Fermé comme DOUBLON de `[FMT-TOLOCALESTRING-MONEY]`** :
- [x] **`[DETTE-FORMATCAD-BYPASS]`** (S, ÉLEVÉ) — **77 occurrences** de `toLocaleString('fr-CA')` hors
  `utils/format.ts` (hors dates), dont **6 dans `services/projection/cashflowAllocation.ts`**
  (l:213, 266, 272, 285, 332, 398 — logs de flux money-critical) et des affichages UI directs
  (`ProjectionTooltip.tsx:135`, `ProjectionExplains.tsx:24`, `ActionPlanDrilldown.tsx:17`,
  `GoalSeekerCard.tsx:100,111`, `assetLocation.ts:188`, `drawdownOptimizer.ts:79`, `goalSeek.ts:91`).
  Viole le non-négociable « `formatCAD` UNIQUEMENT ». [MESURÉ]

**Fermé comme DOUBLON de `[GODFILE-FUTUREPROJECTION]`** :
- [x] **`[DETTE-GODFILE-FUTUREPROJECTION]`** (L, MOYEN) — `components/FutureProjection.tsx` =
  **2 026 lignes**, le plus gros fichier du dépôt (devant `Investments.tsx` 1 440, `Budget.tsx` 1 423,
  `projection/FutureDetailModal.tsx` 1 116, `Transactions.tsx` 1 054). Correctement lazy-chargé (zéro
  risque de bundle de boot) — le coût est la revue : un fichier de cette taille tronque le contexte
  des agents et dilue la relecture humaine. **Pas de chantier dédié** (Marc n'aime pas le refactor
  gratuit) : traiter chaque tâche qui y touche comme une occasion d'extraire le bloc concerné vers
  `components/future/` ou `components/projection/`, comme déjà amorcé. [MESURÉ]

**Fermé comme DOUBLON de `[FMT-TOLOCALESTRING-MONEY]`** :
- [x] **`[FMT-MONEY-BYPASS]`** (S) — montants rendus sans `formatCAD` (9 sites en grep).
  Aucun n'est faux au cent près — dérive de présentation. Classe comptabilisée dans
  `[FMT-TOLOCALESTRING-MONEY]` (HIGH, part d'un seul ticket).

**Fermé comme DOUBLON de `[RETIREMENT-GROSSINCOME-DEAD]`** :
- [x] **`[DEAD-PROP-GROSSINCOME]`** (S) — `Retirement.tsx` reçoit prop `grossIncome` = somme des
  salaires MENSUELS (sans ×12). Jamais consommée, donc aucun bug visible. Premier consommateur
  héritera d'un facteur ×12 dormant. **Correctif** : supprimer la prop.

**Fermé comme DOUBLON de `[SILENT-STOCKFORM-PRICEHINT (copie unique conservée au BACKLOG)]`** :
- [x] **`[SILENT-STOCKFORM-PRICEHINT]`** (S) — `AddStockForm.suggestHistoryPrice()` échoue en silence
  (réseau/provider) : catch sans `logError` ni `setNotice` (contrairement à `validateSymbol` du même
  fichier). L'utilisateur voit spinner s'arrêter, prix vide, aucune explication. **Correctif** :
  `logError + setNotice` sur le modèle de validateSymbol.

**Fermé comme DOUBLON de `[BUDGET-AI-WRONG-MODEL]`** :
- [x] **`[AI-BUDGETMODAL-MODEL-COST]`** (S) — `BudgetAiModal.tsx` `chatStream` sans `model` →
  défaut Sonnet pour 3 recos courtes (toutes les tâches comparables épinglent Haiku). `MODEL_HAIKU`
  n'est pas exporté (piège futur). **Correctif** : `model: MODEL_IDS.haiku`.

**Fermé comme DOUBLON de `[DETTE-UI-PRIMITIVES]`** :
- [x] **`[UI-NO-INPUT-PRIMITIVE]`** (L) — `components/ui/` n'a **aucun** composant `Input`/`Select`/`Field`
  (seul `PrivateNumberInput` existe). **132 occurrences** `<input>` brut dans **16 fichiers**. Chaque
  site réécrit sa propre chaîne Tailwind → dérive de style (focus ring, contraste, cible tactile) doit
  être corrigée site par site. **Correctif** : créer `components/ui/Input.tsx` + `Select.tsx` +
  `Field.tsx` (label+erreur+aria) + migrer sliders d'abord (fort impact partagé), puis texte/date. Par
  fichier, aucun changement comportement.

**Fermé comme DOUBLON de `[DETTE-KNIP-API-ENTRY]`** :
- [x] **`[KNIP-EDGE-FALSE-POSITIVE]`** (S) — `api/claude/[...path].ts` listé « unused » par knip (faux
  positif : route Vercel par convention, jamais importée statiquement). **Correctif** : ajouter
  `"api/**/*.ts"` aux `entry` de `knip.json`.

---

## 2026-08-19 — Checkup de santé : la doc recalée sur le code (PR #651)

- [x] **`[DOC-METRIQUES-DERIVE]`** (S, ÉLEVÉ) — **livré 2026-08-19** : trois documents donnaient trois
  réponses différentes à « combien de sous-modules ? » (`CLAUDE.md` 41 · `ARCHITECTURE.md` 48 · réel
  **50**) et à la taille de l'orchestrateur (`ARCHITECTURE.md` ~1 310 · `PROJECTION.md` ~2 400 · réel
  **2 228**). `ARCHITECTURE.md` portait à lui seul **deux** comptes de tests contradictoires
  (1 440/123 fichiers ET 3 887/339) et annonçait « Vite 6 » / « Recharts 2 » alors que le
  `package.json` dit `vite ^8.0.16` / `recharts ^3.7.0`. Corrigé + le compte de tests renvoie
  désormais à `CLAUDE.md` comme **source unique** au lieu d'être recopié.

---

## 2026-08-19 — Lot REER : les retraits qui échappaient à l'impôt (PR à venir, gate vert)

> Les 5 items ci-dessous sont issus du checkup de santé du 2026-08-19 et ont été livrés le MÊME
> jour, en UN lot (ils touchaient le même bloc de code — cf. `MODULE-ECRIT-HORS-CHECKLIST`).
>
> ⚠️ **Ce que ce lot enseigne, et qui vaut au-delà de lui** : `projection.moneyConservation` était
> VERT 20/20 avec les cinq défauts en place. Un impôt jamais prélevé est parfaitement conservatif —
> l'argent reste simplement chez l'utilisateur au lieu de partir chez l'ARC. Notre invariant le
> plus fort ne couvre que les FLUX, jamais les ASSIETTES. La garde livrée
> (`tests/services/reerRetraitsRegistres.test.ts`, 13 cas dont **11 prouvés discriminants** en
> retirant le correctif) vise donc l'assiette et les registres publiés, pas les soldes.

- [x] **`[REER-IMMO-HORS-ASSIETTE]`** (M, CRITIQUE) — le retrait REER « dernier recours » qui finance
  un achat immobilier **n'alimente pas `accRetraitsReerYear`** (ni la version per-conjoint : ces
  champs n'existent même pas dans `RealEstateState`), mais pose quand même un « impôt » dans
  `state.taxCurrentYearReer` (`services/projection/realEstateMonth.ts:245-259`, `tax = drawn * margRate`).
  Or décembre lit ce bucket comme une **RETENUE déjà prise** et la crédite
  (`services/projection/taxDecember.ts:646` : `withholdingAlreadyTaken = taxCurrent.reer`). Crédit
  sans dette correspondante → **le retrait finit non imposé**. Aggravant : le marginal utilisé est
  celui d'AVANT le retrait (0,2569 mesuré vs 0,49965 réel).
  **Impact mesuré : 94 599,60 $ d'impôt éludé** sur un scénario complet (retraité, pension 48 k$/an,
  condo 400 k$ / MDF 150 k$ → 207 758 $ retirés du REER, 53 373 $ « d'impôt » posés à 26 % plat,
  total payé en avril **6 679,78 $ au lieu de 101 279,37 $**). Cascade sur tous les registres qui
  lisent `accRetraitsReerYear` : test SRG N+1, récupération PSV, RAMQ, FSS, per-conjoint.
  Vérifié par Claude : `accRetraitsReerYear` n'a **qu'un seul** producteur dans tout le moteur
  (`services/projection/cashflowAllocation.ts:206`), et `realEstateMonth.ts` ne le mentionne jamais.
  Correctif : ajouter `accRetraitsReerYear`/`accRetraitsReerYearByUser` au `RealEstateState` et les
  alimenter au retrait (comme les 5 autres sources, cf. `projection.ts:1750` « 5e source de retrait
  REER »), puis remplacer `drawn * margRate` par `withholdingForGrossRRSP(drawn)` (19/24/29 %) en
  laissant décembre réconcilier. [MESURÉ, mécanisme reconfirmé par Claude]
- [x] **`[REER-ACTIF-NON-RECONCILIE]`** (L, CRITIQUE) — en phase **ACTIVE**, la déclaration de décembre
  ne comprend QUE le salaire : `accRetraitsReerYear` n'entre jamais dans l'assiette
  (`services/projection/taxDecember.ts:379-455`, branche `if (!ctx.isRetired)` — vérifié : elle ne
  somme que `grossMarc + grossAnna − déductions`). Tout retrait REER d'un ménage actif (cascade de
  shortfall, retraits d'objectifs, meltdown) reste donc au seul taux de retenue 19/24/29 %, jamais
  réconcilié au marginal réel. Le cap `oasCap` vaut `Infinity` en actif
  (`services/projection/cashflowAllocation.ts:196-215`) → le montant n'est même pas borné.
  **Impôt jamais facturé, mesuré** : 1 424 $ (retrait 20 k$ sur salaire 60 k$) · **6 315 $** (50 k$
  sur 90 k$) · **20 177 $** (100 k$ sur 150 k$).
  ⚠️ C'est **exactement** le bug corrigé côté retraité en juin 2026 — le commentaire de la branche
  retraité (`taxDecember.ts:452-470`) décrit le symptôme mot pour mot (« les retraits REER/FERR
  étaient EXCLUS de l'assiette imposable → jamais réconciliés au taux marginal réel »). Le miroir
  côté actif n'a jamais été fait. Correctif : ajouter `accRetraitsReerYear` (réparti par
  `accRetraitsReerYearByUser`) au revenu imposable de la branche active, la retenue du bucket
  `.reer` restant créditée **une seule** fois. [MESURÉ, mécanisme reconfirmé par Claude]
- [x] **`[REER-RETRAIT-IMMO-REGISTRE]`** (S, ÉLEVÉ) — le retrait REER qui finance l'achat (RAP +
  retrait imposable) alimente le SOLDE (`reer`), le FISCAL (`taxCurrentYearReer`) et
  `NetTransferREER`, mais **pas le registre d'AFFICHAGE `retraitReerMois`** : `RealEstateState`
  déclare `retraitCeliMois` (`realEstateMonth.ts:59`, alimenté l:228) et **aucun** `retraitReerMois`,
  alors que les 4 autres producteurs REER l'alimentent tous (`projection.ts:1328` FERR, `:1581`
  drawdown, `:1665` cashflow, `:1746` meltdown) — vérifié par Claude. Classe MELTDOWN-REER exacte.
  **Mesuré : 355 639 $ sortis du REER (120 000 $ RAP + 235 639 $ imposable) publiés comme
  `RetraitREER = 0 $`, avec `ImpotRetraitREER = 85 107 $` affiché juste en face** — le modal montre
  85 k$ d'impôt sur un décaissement de zéro. Correctif : ajouter `retraitReerMois` au
  `RealEstateState`, l'incrémenter aux 2 sites, le remonter comme `retraitCeliMois`
  (`projection.ts:1423`). [MESURÉ]
- [x] **`[RAP-DIVORCE-DEUX-TETES]`** (XS, ÉLEVÉ) — `processRealEstate` reçoit `activeUsersCount`
  (nominal, toujours 2) au lieu de `taxFilers` (1 après divorce/décès) :
  `rapLimit = RAP_LIMIT_PER_USER * activeUsersCount` (`realEstateMonth.ts:201`, câblage
  `projection.ts:1387-1390` — vérifié par Claude) accorde le **plafond RAP d'un COUPLE à une
  personne seule**. C'est le même homonyme déjà corrigé dans `taxJanuary`, `taxDecember`, le meltdown
  et `latentTax` — ce site-là a été oublié. **Mesuré : RAP de 98 080,68 $ après un divorce 50 %
  (plafond légal 1 personne = 60 000 $) → 38 080,68 $ de retrait REER non imposable illégitime**,
  plus l'obligation de remboursement correspondante ; témoin sans divorce non vacueux. Correctif :
  passer `taxFilers`. À creuser dans le même lot : `rapBorrowed`/`rapRepaymentDueTotal` ne sont pas
  partagés par le splitter de divorce (`projection.ts:758-830`) — [HYPOTHÈSE, non mesuré]. [MESURÉ]
- [x] **`[EMPILEMENT-REER-ACHAT-IMMO]`** (S, MOYEN) — la Phase 4 du financement d'achat applique un
  taux marginal **PLAT** à un retrait REER de plusieurs centaines de k$
  (`realEstateMonth.ts:246-256` : `getMarginalRate(...)` puis `drawn * margRate`), au lieu de l'impôt
  incrémental `tax(rev+x) − tax(rev)`. **Mesuré : retrait 235 639 $ → impôt moteur 85 107 $ (36,12 %
  plat) contre 107 217 $ en incrémental, soit 22 110 $ sous-estimés sur un seul mois.** Correctif :
  le différentiel de `calculateFiscalReport`, comme le fait déjà la cascade de `cashflowAllocation`.
  ⚠️ Recoupe `[REER-IMMO-HORS-ASSIETTE]` : même bloc de code, défauts distincts. [MESURÉ]

**Découvert en corrigeant, NON embarqué** : `[RAMQ-ACTIF-HORS-RETRAITS]` (asymétrie de l'assiette
RAMQ entre les branches active et retraitée) — laissé ouvert au BACKLOG avec sa mesure, plutôt
qu'élargir sans mandat un lot fiscal. Le FSS voisin a été vérifié et n'est PAS le même cas (choix
documenté, pas un oubli).

---

## Note de vérification 2026-07-31 (refonte du backlog)

Vérification exhaustive des ~180 items non cochés contre le code réel (2 agents, preuve
fichier:ligne). Verdicts appliqués à la refonte :
- **~65 items FAITS sans case cochée** (classe PM-STALE-BACKLOG) — considérés livrés, restés
  ici tels quels. Notables : PRIV-DISCRET-DOM + D6-SR-2 (0 `privacy-blur` brut restant),
  D6-HEADING (CollapsibleSection headingLevel), CIX-A2 (fractionnement pension, taxDecember),
  B3 (early-exit goalSeek), DT3 (childCosts partagé), HARDEN-MC-WORKER (sharding runAsync),
  NAV-IA-GATE-MSG, MCP-CLOUDRUN-ROOT/DEPLOY-LOGS, HEALTH-SAVINGS-RATE-DIVERGENCE, TP-1.G
  Phases 0+1, verrouillage courbe (= PROJECTION-PERSIST), et ~44 puces ✅-sans-case confirmées.
- **12 items OBSOLÈTES/caducs** : HIST-BENCH-SYMBOL (superseded INVEST-PERF-PERIOD),
  TX-INCOME-CATEGORY-LIST (faux positif), PERSONA-ASSET-PERF (site supprimé), table H1
  (passphrase opt-in existe), P0-SYNC (prouvé par l'usage réel), CA-03 (contredit la décision
  ENG-TAX-NS « garder l'alias »), D7 (doublon PERF-BOOT), .mcpb (supersedé Cloud Run, à
  confirmer Marc), spec/critères/contraintes MCP-CLOUDRUN (lot livré).
- **Le reste (PARTIELS, PAS FAIT, différés, décisions, actions Marc)** → extrait vers le
  nouveau `BACKLOG.md`.
- **11 items COUPÉS par le PM** (analyse valeur 2026-07-31, demande Marc « demande au PM si c'est
  utile chaque tâche ou non ») — récupérables ici si le contexte change :
  `HARDEN-SAFEBLOCK` (protection déjà live, DRY pur) · `HARDEN-ZOD-GATEKEEP` (boundary numericInput
  déjà couvert) · `BUDGET-KEY-WARNING` (warning dev, zéro impact utilisateur) · `ONB-TOUR-OPTIN` +
  `ONB-OVERLAY-SEQ` (perception seule, validés FAUX à l'audit UX) · `U5` export PNG (confort) ·
  `NW-ASSETBREAKDOWN-DRY` (DRY pur, aucun bug identifié) · `PERF-WK` + `DT5` (perf non mesurée comme
  problème ; le sharding multi-workers existe déjà, runAsync.ts:199) · `B4` audit assertions (vague,
  sans critère d'arrêt) · `CA-01` orphelins def-only (code mort sans risque) · `PH3-c-bis/futureProvince`
  (orphelin — suppression liée à la question RSU).
- **DT3** (aligner UI↔moteur ChildPlanning) : vérifié FAIT — `childCosts.ts` est la source unique
  partagée (ChildPlanning.tsx:25,37-38).

---

## Livré 2026-08-13/14 — lot DIVORCE (PR #616, #622, #623, #624, #625, #626)

> Sous-section « Divorce — reliquat MESURÉ par le panel de re-revue (PR #616) » de `BACKLOG.md`,
> déménagée ici à la livraison de `[ENG-DIVORCE-TAXDEBT-UNSPLIT]` (le dernier des huit).
> ⚠️ Trois de ces items (`ROOM-COUPLE`, `ESTATE-PENSION`, `LATENTTAX`) figuraient sur `main` en
> DOUBLE — une version livrée et une version périmée d’avant livraison — à cause de marqueurs de
> conflit committés par la PR #622 et restés invisibles au gate (aucune de ses quatre commandes
> ne lit un `.md`). Les textes conservés ci-dessous sont les versions LIVRÉES, vérifiées commit
> par commit. Garde posée dans la même PR : `tests/noConflictMarkers.test.ts`.

- [x] 🔴 **`[ENG-DIVORCE-ROOM-COUPLE]`** (M, LIVRÉ) — les droits enregistrés restaient ceux d'un
  COUPLE : `processJanuaryReset` recevait `config.users` entier et `activeUsersCount` inchangé.
  Décembre disait déjà « 1 déclarant », janvier redonnait les droits des deux — les deux voies se
  contredisaient. **Mesuré : 716 717 $ de patrimoine INDU** sur un divorcé à 25 ans d'horizon
  (12 745 146 $ → 12 028 429 $). Livré : `activeUsersCount: taxFilers` (les 4 usages du fichier
  relus un par un — homonyme, comme dans `retirementIncome`), `fhsaEligibleUsersCount` borné à 1,
  et une liste **`roomUsers` DÉDIÉE** aux droits.
  ⚠️ `users` reste ENTIER : la boucle FERR itère sur `reerByUser.length` et lit `users[i]` pour
  l'âge du conjoint — la raccourcir aurait rendu `-Infinity` et la part REER de l'index 1 ne se
  serait JAMAIS convertie en FERR, en silence (le piège exact d'un précédent `slice(0,1)`).
  Rétrocompat MESURÉE : déterministe et décès bit-identiques.

- [x] 🔴 **`[ENG-DIVORCE-ESTATE-PENSION]`** (M, LIVRÉ) — `computeEstateNetWorth` recevait
  `activeUsersCount` inchangé et la pension MÉNAGE entière : le divorcé héritait à l'écran
  Succession de la valeur actualisée des rentes de son ex. **Mesuré : 322 865 $ de valeur
  successorale INDUE** (1 068 947 $ → 746 082 $). Livré : compteur de TÊTES à 1 pour la branche
  « estimés précis » (per-personne × N) **et** `householdPensionShare` pour la branche « repli
  agrégé » (`governmentPension` est déjà familial) — deux réductions DISTINCTES, jamais cumulées
  sur le même terme. ⚠️ `activeUsersCount` MULTIPLIE ici, alors qu'il DIVISE dans
  `retirementIncome` : sémantiques inverses sous le même nom. Rétrocompat mesurée (déterministe et
  MC bit-identiques) ; le patrimoine mensuel ne bouge pas — le défaut ne vivait QUE dans la
  succession, ce qui l'a fait survivre au premier lot.

- [x] **`[ENG-DIVORCE-LATENTTAX]`** (S, LIVRÉ — mais INERTE aujourd'hui, voir ci-dessous) —
  `computeLatentTax` recevait `activeUsersCount` inchangé (c'est un NOMBRE DE DÉCLARANTS : il divise
  le revenu puis remultiplie l'impôt) et le salaire de l'ex dans l'assiette. Corrigé en `taxFilers`
  + `grossAnnaBaseAnnual: 0` en ménage solo, avec 3 tests sur la fonction PURE.
  ⚠️ **VÉRIFIÉ PAR PERTURBATION : effet NUL sur toute sortie observable.** `impotLatent` n'alimente
  QUE `ImpotLatent` du point mensuel, et sous MC — le seul mode où le divorce existe — le point est
  ALLÉGÉ à `{ NetWorth, monthIndex }`. Patrimoine final, succession et `ImpotLatent` sont
  bit-identiques avec/sans correctif. Le calcul est désormais juste ; il n'est simplement pas LU.

- [x] **`[ENG-DIVORCE-TAXDEBT-UNSPLIT]`** (S, LIVRÉ) — la créance/dette fiscale ne suivait pas le
  partage. `taxPreviousYear` porte l'impôt de l'année du COUPLE, réglé en avril : sans partage, un
  divorcé ayant cédé **100 %** de son patrimoine réglait quand même **1 488 $** d'impôt du ménage
  (mesuré), et dans l'autre sens encaissait le remboursement INTÉGRAL (26 948,77 $ mesurés par le
  panel sur un patrimoine de 135 $ — d'où un `totalTaxesPaid` NÉGATIF). Livré : `keep` appliqué aux
  DEUX buckets (`taxPreviousYear` ET `taxCurrentYear`, ce dernier par symétrie — il vaut ~0 en
  janvier, mais n'en corriger qu'un est le motif « règle dupliquée corrigée à moitié »).
  Conforme à la décision VERROUILLÉE « on partage la valeur NETTE » (`docs/adr/`), celle-là
  même qui avait justifié d'ajouter les dettes au split.
  ⚠️ Test impossible à écrire avant `[ENG-MC-OBSERVABILITY]` : `FluxImpots` n'existe que dans le
  point COMPLET, et le divorce n'existe que sous MC. Garde anti-sur-correctif incluse (à 50 %, la
  moitié de la dette reste DUE — partager n'est pas annuler).

- [x] 🔴 **`[ENG-DIVORCE-SPLITPCT-UNBOUNDED]`** (S, LIVRÉ) — `divorceSplitPct` n'était borné nulle
  part. Mesuré : `−100` → patrimoine 2 210 335 $ contre 755 482 $ à 50 % (le divorce ENRICHIT) ;
  `1e9` → **−7 782 605 996 $** (dettes × keep négatif = actif fantôme) ; `NaN` → actifs zéroïsés
  sans trace. Livré : `clampSplitPct` (source unique, `[0,100]`, non-fini → DÉFAUT et non 0) posé
  au MOTEUR — une borne seulement à l'UI laisserait passer un import de sauvegarde ou un futur
  appelant — plus `min`/`max` + le même clamp à l'input. 9 tests, `keep` observé À LA SOURCE
  (3 échouent sans le clamp). Revue Vercel : le LIBELLÉ du divorce interpolait encore la valeur
  BRUTE (« partage de 150 % » pendant que le moteur en appliquait 100) — corrigé + garde de source.

- [x] 🔴 **`[ENG-MC-OBSERVABILITY]`** (M, LIVRÉ) — sous MC, `buildMonthlyDataPoint` ne rendait que
  `{ NetWorth, monthIndex }` (choix de PERF), alors que divorce/mortalité/LTC/perte d'emploi
  n'existent QUE sous MC : leurs flux mensuels étaient INVÉRIFIABLES, et trois lots ont dû
  contourner (agrégat `totalTaxesPaid` au lieu de `RetraitREER`, test de fonction pure sur
  `computeLatentTax`, absence de garde sur le splitter). Livré :
  `ScenarioDiagnostics.verboseMonthlyPoints`, 8e paramètre de `runScenario`, DÉLIBÉRÉMENT séparé
  d'`EngineOverrides` (exploré par `strategySpace` : un drapeau de diagnostic y serait balayé comme
  un levier financier). Défaut absent ⇒ production inchangée, épinglé par un test qui vérifie que
  le point MC reste ALLÉGÉ sans le drapeau.

- [x] 🔴 **`[ENG-DIVORCE-NO-CONSERVATION-GUARD]`** (M, LIVRÉ) — premier bénéficiaire du ticket
  ci-dessus : `tests/services/projection.divorceConservation.test.ts` fait tourner un divorce AVEC
  dettes sous invariants (6 tests).
  ⚠️ Leçon en chemin : « Σ actifs − dettes == NetWorth » est en partie CIRCULAIRE — `NetWorth` est
  recalculé depuis ces mêmes soldes, donc retirer le partage des dettes la laisse VERTE (vérifié par
  régression chirurgicale). L'invariant qui MORD porte sur une grandeur INDÉPENDANTE : le **ratio de
  partage mesuré sur la DETTE totale** — 0,4926 attendu, 0,9949 avec la régression.

- [x] **`[ENG-DIVORCE-DISPLAY-RATES]`** (S, LIVRÉ) — le taux d'imposition AFFICHÉ (marginal et
  effectif du point mensuel) additionnait encore les DEUX salaires puis divisait par 2 après un
  divorce : il montrait le taux d'un ménage qui n'existe plus. Deux erreurs qui se compensent
  partiellement — taux trop BAS pour un divorcé à haut salaire, trop HAUT pour l'autre. Livré :
  `taxFilers` au dénominateur + salaire de l'ex retiré du numérateur (les deux gestes du lot).
  Sortie d'AFFICHAGE : rien d'autre n'en dépend, mais c'est un chiffre que l'utilisateur LIT.
  ⚠️ Fixture à salaires TRÈS inégaux (14 000 vs 2 000 $/mois) : à salaires égaux `(a+b)/2 === a`
  et le défaut est INVISIBLE. Test rendu possible par `[ENG-MC-OBSERVABILITY]`.

- [ ] **`[ENG-DIVORCE-CHILDREN-REEE]`** reste OUVERT et est resté dans `BACKLOG.md` —
  ne pas le reprendre depuis ce fichier.

## Livré 2026-08-14 — PR #632 `[A11Y-PRIVACY-PATRIMOINE-ETENDU]` (lot `[A11Y-PRIVACY-LOT2]` 4/9)

- [x] **`[A11Y-PRIVACY-PATRIMOINE-ETENDU]`** — **13 montants sur 17 champs** masqués dans les 4
  panneaux (assurances, immeubles locatifs, sociétés, objectifs cycliques). Critère : l'`aria-label`
  porte `(dollars)` — convention DÉJÀ en place dans le fichier, pas une règle inventée.
- [x] NOI du résumé d'immeuble masqué ET passé à `formatCAD` (il violait la règle de formatage via
  un `toLocaleString` nu). ⚠️ Conséquence ASSUMÉE et documentée : le NOI est désormais arrondi au
  dollar (`230 528,436$` → `230 528 $`).
- [x] Deux champs d'assurance nommés — ils n'avaient que leur `placeholder`, qui disparaît avec le
  champ masqué.
- [x] Garde de source symétrique + garde de couverture comparant des ENSEMBLES (pas des comptes :
  deux erreurs qui se compensent numériquement rendaient la version précédente verte à tort).

## Livré 2026-08-14 — PR #631 `[A11Y-PRIVACY-SOLDES-COMPTES]` (lot `[A11Y-PRIVACY-LOT2]` 3/9)

- [x] **`[A11Y-PRIVACY-SOLDES-COMPTES]`** — solde réel de CHAQUE compte masqué
  (`components/settings/sections/AccountsSection.tsx`).
- [x] Association `<label htmlFor>` câblée (elle n'existait pas), avec un `id` **INDEXÉ** et non
  dérivé du nom de compte : un nom saisi par l'utilisateur peut se nettoyer en un identifiant DÉJÀ
  pris, et deux éléments partageant un `id` font pointer les DEUX `<label>` sur le premier — le
  second champ perd son nom accessible sans erreur ni avertissement.
- [x] Nom et nombre de comptes laissés en clair, à dessein et sous test d'INTENTION.
- [x] **Garde de saisie continue** (finding de revue) : taper dans un champ révélé provoque un
  re-render du parent à chaque frappe. Le comportement ne tient qu'au `key={acc}` ; avec une clé
  instable, le champ se re-masque au PREMIER caractère. Les tests précédents étaient aveugles à ce
  scénario (`setInitialBalances` no-op → la prop ne changeait jamais).

## Livré 2026-08-14 — PR #630 `[A11Y-PRIVACY-PARAMS-AVANCES]` (lot `[A11Y-PRIVACY-LOT2]` 2/9)

- [x] **`[A11Y-PRIVACY-PARAMS-AVANCES]`** — **14 champs sur 40** masqués dans
  `components/AdvancedProjectionParams.tsx` : soldes manuels CELI/REER/Non-Enreg/Cash/Crypto +
  droits restants, pension alimentaire, capital maladie grave, dépenses additionnelles, héritage
  attendu, surcoût snowbird, boomerang, proche aidant. **Critère** : le libellé porte un `$`. Les
  %, durées, âges, probabilités et itérations MC restent lisibles — masquer tout aurait coûté la
  lisibilité sans rien protéger de plus, et un test refuse cette simplification.
- [x] Association `<label htmlFor>` câblée pour ces 14 champs (elle n'existait POUR AUCUN champ).
- [x] **Garde de SOURCE symétrique + garde de la garde** — le scan doit couvrir TOUS les champs du
  fichier, sinon vert trompeur. Trois angles morts fermés et prouvés par perturbation : commentaire
  JSX entre libellé et champ, libellé à élément imbriqué, champ sans libellé.
- [x] ⚠️ Deux erreurs à moi corrigées en route : `type="number"` perdu par une substitution en masse
  (typecheck VERT, `type` étant optionnel) ; décompte « 41 champs » propagé partout alors que
  `14 + 26 = 40` (un `<input type="number">` vivait dans le TEXTE d'un commentaire).
- [x] Alerte CodeQL (ReDoS) sur la regex de la garde → corrigée en NORMALISANT la source (retrait
  des commentaires) au lieu de tolérer la construction dans le motif. Plus simple et plus sûr.

## Livré 2026-08-14 — PR #629 `[A11Y-PRIVACY-SALAIRE]` (lot `[A11Y-PRIVACY-LOT2]` 1/9)

- [x] **`[A11Y-PRIVACY-SALAIRE]`** — le mode discret entre dans les FORMULAIRES. #608 avait traité
  l'AFFICHAGE, jamais la SAISIE : `components/settings/UserConfigFields.tsx` n'avait aucune
  référence au mode discret. Masqués : salaire brut ET net des DEUX conjoints, facteur
  d'équivalence, RSU, revenus secondaires. Bonus en % laissé en clair À DESSEIN (c'est un %, pas un
  montant, et le brut auquel il s'applique est masqué), verrouillé par un test d'INTENTION.
  Gardes : `tests/components/settings/UserConfigFields.privacy.test.tsx`.
- [x] **Défaut de la PRIMITIVE corrigé au passage** (`components/ui/PrivateNumberInput.tsx`) — le
  bouton masqué portait un `aria-label` EN DUR, prioritaire sur le `<label htmlFor>`, sur
  l'`aria-label` du champ ET sur `aria-labelledby`. MESURÉ : tous les champs masqués d'un formulaire
  annonçaient le même nom. Le nom est désormais laissé au nommeur existant, l'état masqué porté par
  `title` (description) + `sr-only`. `AssetLocationCard` et `RetirementIncomeCard` en bénéficient
  immédiatement. Leçon `A11Y-MASK-STEALS-NAME` dans `docs/CONVENTIONS.md`.
- [x] **`BudgetGroupTable`** — trouvé par le panel : ce champ n'avait AUCUN nommeur, son nom venait
  du `title`, identique sur chaque ligne, y compris HORS mode discret. Le nom porte désormais le
  POSTE (« Montant de base — Épicerie »), jamais le montant.

## ⚠️ 2026-08-13 — PR #613 RECALÉE par le panel moteur, reprise en #615

> **Cette entrée a été écrite trop tôt.** Le panel moteur a rendu **NO-GO** sur #613 avec 12
> findings, dont 5 ÉLEVÉ mesurés. `[ENG-DIVORCE-REGISTRE-PERCONJOINT]` était notamment archivé
> « fait » à tort : la consolidation `reerByUser = [reer, 0]` ne tenait qu'UN MOIS, les PARTS
> (`reerShares`, un `const`) repeuplant le slot de l'ex dès la cotisation suivante.
> Le lot est repris et complété dans la PR #615 ; l'entrée de livraison réelle est plus bas.
> Conservé ici pour que la trace de l'erreur ne disparaisse pas.

## Livré 2026-08-13 — PR #613 (contenu initial, INCOMPLET — voir l'avertissement ci-dessus)

> Gate vert. Les 3 tickets forment UN seul changement sémantique (le ménage passe à une tête) :
> les livrer séparément aurait produit des états incohérents. Décisions produit dans
> `docs/adr/` (ADR « Modèle du DIVORCE »).

- [x] 🔴 **`[ENG-DIVORCE-DEBT-ASYMMETRY]`** (S) — le divorce partage ACTIFS et l'hypothèque,
  mais garde **100 % des dettes non immobilières** (activeDebts[], liquidDebt, smithManoeuvreDebt).
  **Mesuré : après avoir cédé 100 % des actifs, le NW reste −81 827 $ (100 k$ de dettes intactes).**
  Impact = solde total dettes × divorceSplitPct, cumulé sur tous les MC où le divorce se déclenche.
  **Correctif** : appliquer `keep` à `activeDebts[i].balance`, `liquidDebt`, `smithManoeuvreDebt`.
  Décision produit requise si dettes ne se partagent pas (documenté dans `docs/adr/`).

- [x] 🔴 **`[ENG-DIVORCE-REGISTRE-PERCONJOINT]`** (M) — le divorce est **fiscalement INERTE** :
  `reerByUser`, `activeUsersCount`, `liveFilers`, espaces CELI/REER/CELIAPP, revenus, tous
  survivent intacts (contrairement au décès qui les traite). **Mesuré isolant : Δ impôt = 0 $ exact
  sur 30 ans.** Ordre de grandeur : différence 1 vs 2 contribuables = 187 k$ de différence d'impôt
  cumulé. **Correctif** : au divorce, appliquer le pendant du merge décès — scinder
  `reerByUser`/`accRetraitsReerYearByUser`, ramener `activeUsersCount` à 1, zéroïser
  `grossAnnaBaseAnnual`, recalculer reerShares. Charge fiscale à valider par financial-integrity.

- [x] 🔴 **`[FISC-DIVORCE-INCOME-PHANTOM]`** (M) — le divorce coupe ACTIFS mais garde le **revenu et
  la fiscalité de COUPLE**. Aucune réduction de `grossAnnaBaseAnnual`, `incomeAnnaNetMonthly`,
  `taxFilers` ni RAMQ au barème couple. **Mesure : couple 183 k$ brut, conjoint parti = 85 k$ de
  revenu fantôme encaissé à vie + fiscalité couple indue.** Cette erreur DOMINE la coupe de 50 % du
  patrimoine. La garde argent ne l'attrape pas (l'argent reste conservé, juste inventé au bon
  endroit). **Correctif** : basculer sur mode « ménage à 1 » symétrique du `survivorMode` : `taxFilers
  = 1`, `grossAnnaBaseAnnual = 0`, `incomeAnnaNetMonthly = 0`, `activeUsersCount` fiscal = 1. **À
  minima** : documenter comme limite assumée dans FISCAL_REFERENCE §9 (aujourd'hui absent).

  **Effet combiné mesuré** (couple 183 k$, dette 100 k$, 30 ans, partage 50 %) : avant, un
  divorce coûtait **4,2 %** du patrimoine médian final et laissait la survie à 100 %. Après :
  −621 625 $ et 0 % de survie — la part sombre venant de la décision ASSUMÉE de Marc de garder
  les dépenses du ménage à 100 % (ADR, décision 3).
  ⚠️ **Piège d'observabilité rencontré** : le divorce n'existe QUE dans la branche Monte-Carlo, et
  `chartData` est toujours déterministe. Mes premières mesures donnaient un résultat IDENTIQUE
  avec et sans divorce. La sortie réellement consommée est celle du MC (cônes P10/P50/P90 +
  `survivalRatePct`). 3/3 tests prouvés discriminants sur le code d'avant.

## Livré 2026-08-13 — PR #611 `[FISC-DON-ABATEMENT]` (lot moteur 1/5)

> Gate vert. Premier des 5 lots du batch 🔴 « moteur & fiscal » de l'audit 2026-08-12.

- [x] 🔴 **`[FISC-DON-ABATEMENT]`** (S) — crédit-don fédéral n'est **pas réduit de l'abattement QC**.
  `computeDonationCredit` renvoie `fed + qc` au taux fédéral PLEIN (15 %/29 %), appliqué à un impôt
  déjà net d'abattement 16,5 %. Pour un résident QC, la valeur effective du crédit féd est **83,5 %,
  pas 100 %** (cf. CID déjà corrigé). **Mesure exact : don 5 k$ → 234,63 $/an surévalué ; don 20 k$
  → 952,38 $/an.** **Correctif** : `fed × (1 − QC_FEDERAL_ABATEMENT_RATE) + qc` dans
  `computeDonationCredit`, réécrire §10 FISCAL_REFERENCE dans la MÊME PR (doc encode modèle faux :
  « 35 %/53 % » → devient ≈32,5 %/48,8 % QC). Test discriminant exigé : git stash doit faire
  ÉCHOUER le nouveau test.

  **Livré** : `fed × (1 − QC_FEDERAL_ABATEMENT_RATE) + qc` dans `computeDonationCredit`, aligné
  sur le patron déjà en place pour le CID (`[FISC-DTC-ABATEMENT-ORDER]`). FISCAL_REFERENCE §10
  réécrit dans la MÊME PR (colonne « effectif QC » ajoutée à côté de la somme légale, qui reste
  vraie en droit). Test discriminant prouvé : 5/8 assertions échouent sur le code d'avant.
  ⚠️ **Le ticket annonçait « ≈48,8 % » d'effectif au-delà de 200 $ — c'est FAUX, c'est 48,2 %.**
  Ses montants ($234,63 et $952,38/an), eux, sont exacts au cent près.

## Livré 2026-08-13 — PR #608 « filets de sécurité » (suite de l'audit 2026-08-12)

> Gate vert (typecheck + lint + 3 965 tests + build). Les 7 items ci-dessous étaient les 🔴
> d'effort S de l'audit : fuites du mode discret, écriture IA sans filet, NaN silencieux.
> La revue du panel a ajouté un 8e correctif, décrit après les items.

- [x] 🔴 **`[AI-VISION-PAYSLIP-NOGATE]`** (S) — `PayslipUploadCard.analyzePayslip()` écrit
  `grossSalary`/`netSalary` **DIRECTEMENT dans config.users** via `setAppState` : **aucune
  confirmation, aucun backup préalable, aucune garde > 0**. Une hallucination OCR écrase le profil
  salarial qui alimente TOUT (fiscalité + projection). Contraste : même flux via chat impose diff +
  modal + backup. **Correctif** : écran de revue avant `setAppState` + `createBackupNow` + refus si
  `grossPeriod <= 0`.

- [x] 🔴 **`[AI-PAYSLIP-SCHEMA-UNBOUNDED]`** (S) — `PayslipSchema` utilise `z.number()` nu sur les
  montants, ni `.positive()` ni `.finite()`, alors que tous les schémas d'écriture du repo l'imposent.
  `Infinity`/négatifs passent Zod et sont **multipliés par la fréquence**. **Correctif** :
  `z.number().positive().finite()` sur les 4 champs.

- [x] 🔴 **`[SILENT-ACTIONPLAN-NAN]`** (S) — `actionPlanHierarchy.ts` coerce NaN/Infinity à 0 sans
  aucun log : `num() := typeof v === 'number' && isFinite ? v : 0`. Le module alimente « Plan
  d'action » (conseils en $). Le MÊME fichier moteur a **DÉJÀ eu ce bug 2 fois** (netWorth.ts,
  pastPurchaseInit.ts), documenté + corrigé avec garde. **Correctif** : répliquer patron
  `pastPurchaseInit` — helper `isCorrupt(v)` séparé de `num()`, `logErrorThrottled` par
  (niveau, id de bucket) pour éviter thrash, détecteur par (champ, signature).

- [x] 🔴 **`[A11Y-PRIVACY-DEBT]`** (S) — page Dettes : soldes individuels + total NON masqués en mode
  Discret, bien qu'autres montants (graphe, slider) le soient. **Correctif** : envelopper
  `formatCAD(d.balance)`, `totalDebt` et `totalMinPayment + extraPayment` dans `<PrivateAmount>` (pattern
  déjà présent dans le fichier).

- [x] 🔴 **`[A11Y-PRIVACY-TAXCENTER]`** (M) — Centre fiscal : 4 zones d'impôts/salaires non masquées
  en mode Discret. **Fuite JUMELLE** : `PayslipUploadCard.tsx` (partagé entre Réglages et gate setup)
  affiche aussi Brut/Net/Impôt sans `isPrivacyMode`. **Correctif** : ajouter `isPrivacyMode` +
  wrapping `<PrivateAmount>` à 4 sites du TaxCenter + 1 PayslipUploadCard (ou factorise pour un seul
  correctif).

- [x] 🔴 **`[A11Y-PRIVACY-RETIREMENT-ASSETLOC]`** (S) — Asset Location Optimizer : **zéro référence** à
  `isPrivacyMode` → CELI/REER/NonReg totalement non protégés en mode Discret (contrairement au reste
  de l'onglet Retraite). **Correctif** : importer `useFinanceStore`, lire `isPrivacyMode`, envelopper
  5 valeurs dans `<PrivateAmount>`.

- [x] 🔴 **`[A11Y-PRIVACY-TXN-TOTALS]`** (S) — Transactions : montants par ligne masqués, mais agrégats
  (total groupe, somme filtrée) ne le sont pas — aussi révélateur qu'une ligne individuelle. **Correctif** :
  `<PrivateAmount>` sur 2 agrégats.

- [x] **`[A11Y-PRIVACY-CHART-FORMATTER]`** (S, 🔴 trouvé PAR LA REVUE de #608, absent de
  l'audit) — le mode discret s'arrêtait aux GRAPHIQUES : 8 axes Y et 11 formateurs d'infobulle
  annonçaient des $ en clair (`components/DebtManager.tsx:173` mesuré : « 41k » juste à côté
  d'une infobulle correctement masquée ; `DividendPanel` affichait même des `formatCAD` PLEINS
  sur l'axe). Invisible au grep `formatCAD(` (montants construits à la main) ET aux tests de
  rendu (`YAxis`/`Tooltip` mockés en `() => null`). **Livré** : helpers `utils/chartPrivacy.ts`
  (`maskedTick` / `maskedTooltipValue`), 10 fichiers corrigés, garde de source
  `tests/components/chartPrivacyScan.test.ts` + mock Recharts renforcé (les deux prouvés
  discriminants en réintroduisant la fuite). Bonus : le modal de confirmation d'écriture IA ne
  peut plus « flasher » les montants une frame avant son annulation en mode discret.

- [x] **`[A11Y-PRIVACY-TAXBRACKET]`** (S, 🔴 trouvé par la 2e revue de #608) —
  `components/TaxBracketViz.tsx` (rendu depuis l'onglet Retraite, `Retirement.tsx:301`) n'avait
  **aucune** notion de mode discret : revenu brut, impôt net, détail $ par palier, taux effectif et
  marginal, plus les `aria-label`/`title`/caption, tout en clair. **Livré** : frontière explicite —
  les BORNES et TAUX de palier sont du droit fiscal PUBLIC et restent visibles ; tout ce qui dérive
  du revenu est masqué, y compris le marqueur de revenu (sa POSITION est un montant) et l'échelle de
  l'axe (figée à 300 000 $ en mode discret, sinon `revenu × 1,2` fuit par la géométrie).

- [x] **`[A11Y-PRIVACY-TRANSFERS-ARIA]`** (XS, trouvé par la même revue) —
  `components/transactions/TransfersPanel.tsx` : le montant VISIBLE passait par `PrivateAmount`,
  mais l'`aria-label` du bouton juste en dessous le reconstruisait avec `formatCAD` nu — annoncé en
  clair au lecteur d'écran, lisible dans le DOM. Même classe (valeur sensible qui sort par une
  PROP), hors Recharts.

- [x] **`[A11Y-PRIVACY-SCAN-SELFSAT]`** (XS, trou DANS la garde livrée plus haut) — le jeton
  `money(` figurait à la fois dans le motif « c'est de l'argent » et dans le motif « c'est masqué » :
  un helper local `const money = v => formatCAD(v)` SANS `isPrivacyMode` passait au vert tout en
  fuyant (PoC exécuté). **Livré** : `PRIVACY` n'accepte plus que des marques qui PROUVENT la lecture
  du mode discret ; les points d'appel écrivent le ternaire en clair ; le scan lit désormais le CORPS
  complet d'un formateur (multi-lignes) et refuse bruyamment un `<YAxis>` à JSX imbriqué, au lieu de
  cesser de voir en silence.

- [x] **`[A11Y-PRIVACY-BUDGET-COUPLE]`** (M, 🔴 trouvé au 3e tour de revue de #608) — la carte
  « Santé Financière du Couple » (`components/Budget.tsx`) ne consultait JAMAIS `isPrivacyMode`,
  alors que le fichier le lisait déjà ailleurs : décomposition fiscale complète (fédéral, QC, RRQ,
  AE+RQAP, total, net disponible) ET partage du revenu des DEUX conjoints, en texte comme en
  attribut `title`. Seul le total combiné final était masqué. **Livré** : `PrivateAmount` sur le
  texte, helper `maskedAttr` sur les `title`, taux moyen d'imposition masqué aussi (il désigne la
  tranche de revenu) ; les ratios de comportement (effort, clé de partage) restent visibles.

- [x] **`[A11Y-PRIVACY-LIFEEVENTS]`** (S, même tour) — `components/LifeEvents.tsx` : le `title` de
  chaque pastille de la frise portait le coût de l'événement, et la carte « Analyse d'Impact »
  (coût immédiat, effet papillon, coût d'opportunité, manque à gagner 20 ans) n'était pas masquée —
  alors que `isPrivacyMode` alimentait déjà la table sr-only et l'infobulle du donut juste en dessous.

- [x] **`[A11Y-PRIVACY-STRUCTURAL-LEAK]`** (S, même tour, le plus intéressant) — dans
  `TaxBracketViz`, le détail « $ par tranche » ne rendait que les paliers ATTEINTS (`b.income > 0`) :
  chaque montant était bien en « ••• », mais le NOMBRE de lignes encodait la tranche marginale
  (mesuré : 2 lignes à 30 k$, 8 à 250 k$). **Masquer les valeurs sans masquer leur EXISTENCE ne
  suffit pas.** Le test qui garde ce point est STRUCTUREL : deux revenus très différents doivent
  produire un DOM indiscernable en mode discret.

- [x] **`[A11Y-PRIVACY-SCAN-CUSTOMTOOLTIP]`** (XS, même tour) — 2e trou de la garde : un
  `<Tooltip content={<MonTooltip/>}>` échappait au scan (le formatage $ vit dans le corps d'un
  composant nommé, pas dans une prop). Les 2 usages réels du dépôt étaient corrects par CONVENTION,
  pas par vérification. La garde résout désormais le composant désigné et exige `PrivateAmount` ou
  `isPrivacyMode` dans son corps (PoC vérifié rouge).

## ✅ Chantier REFONTE-NAV Lot 1 — la nav (PR #600, merged 2026-08-12)

- [x] **`[REFONTE-NAV-L1]`** ✅ 2026-08-12 (PR #600) — 6 destinations (Futur · Configurations · Vie · 
  Transactions · Assistant · Réglages) avec source unique `navDestinations.ts`. L'app s'ouvre sur 
  Futur (défaut store `Tab.FUTURE`, non persisté) ; Accueil retiré (deep-link `#DASHBOARD→#FUTURE` 
  redirigé, composant conservé sur disque pour Lot 2). Chiffres de tête reprises par `FutureKpiStrip` 
  (patrimoine net, liquidités, épargne/mois — dérivés réels, « — » si non fini). Barre mobile : 
  Futur·Transactions·Assistant·Plus. Tests : `navDestinations.test.ts` verrouille la non-perte 
  (destinations couvrent EXACTEMENT les onglets routés), redirect scanné, Layout destinations 
  directes vs accordéons. Leçon : un redémarrage de conteneur a effacé le Lot 1 NON COMMITÉ pendant 
  la suite de tests (2e occurrence, vécu 2026-08-12) — tout ré-appliqué depuis le contexte. Renforcé 
  dans CLAUDE.md : committer (et POUSSER) AVANT toute attente longue.

---

## ✅ Chantier REFONTE-NAV Lots 2-4 (PR #601, #602, #603, #604, merged 2026-08-12)

- [x] **`[REFONTE-NAV-L2]`** ✅ 2026-08-12 (PR #601, #602) — Futur enrichi, SCINDÉ 2a/2b. Hypothèse du
  plan périmée : les paramètres de projection étaient DÉJÀ dans le sous-onglet « Hypothèses » du Futur
  (PH4-FUT) — rien à rapatrier. Les DEUX moitiés livrées et archivées au merge de la PR 2b.
  - [x] **`[REFONTE-NAV-L2a]`** ✅ 2026-08-12 (PR #601) — bannière import gelé → Futur · tuile
    « Variation 30 j » (`hooks/useNetWorthVariation`, fenêtre fixe 30 j, « — » si < 2 points) · périmètre
    « liquide + placements » PAR CONSTRUCTION — étiquetage sur la tuile, couverture < 30 j signalée ·
    équité immo incluse ET étiquetée au patrimoine · libellé « Monte Carlo (N itér.) » au nombre RÉEL.
  - [x] **`[REFONTE-NAV-L2b]`** ✅ 2026-08-12 (PR #602) — 4e sous-onglet « Historique » du Futur
    (`components/future/FutureHistorySection.tsx`, lazy — graphe d'évolution par compte + sélecteur de
    fenêtre complet, clés localStorage `dashboard:*` conservées) · comparaison d'actions déménagée dans
    Investissements (mode « Comparer ») · `Dashboard.tsx` SUPPRIMÉ (gate PAGE_SETUP retiré).
- [x] **`[REFONTE-NAV-L3]`** ✅ 2026-08-12 (PR #603) — split immo actuel / projets.
  `services/realEstatePartition.ts` (pur, `partitionRealEstateGoals`/`isOwnedToday`) ·
  `components/realestate/RealEstateWorkspace.tsx` (ex-corps RealEstate.tsx, variante `'actuel'|'projet'`) ·
  `Tab.REAL_ESTATE_PROJECTS` → `components/life/RealEstateProjects.tsx` dans destination Vie · gate
  `PAGE_SETUP` partagée clé `realEstate` (zéro double comptage) · libellés alignés `TAB_LABELS`.
- [x] **`[REFONTE-NAV-L4]`** ✅ 2026-08-12 (PR #604) — destination Vie parle d'une seule voix.
  `components/vie/VieCurveLink.tsx` (affordance COMMUNE « Voir l'effet ») câblée sur 4 pages Vie · titres
  depuis `TAB_LABELS` · empty states honnêtes avec CTA · `Retirement` en sous-onglets « Projection »/« Outils
  d'optimisation » · ternaire MORT retiré · harmonisation étendue aux 4 pages.

---

## ✅ Chantier A11Y — Keyboard & Privacy (PR #598, #599, merged 2026-08-12)

- [x] **`[D6-KBD]`** ✅ 2026-08-12 (PR #598) — sidebar pilotable au clavier. Accordéon JAMAIS disabled
  (Tab SAUTE un bouton désactivé : focus atteindrait outside sidebar) · Tab ouvre sidebar si repliée ·
  focus roving-tabindex optionnel sur boutons d'un accordéon ouvert.
- [x] **`[A11Y-FUTUR-MILESTONES-KEYBOARD]`** ✅ 2026-08-12 (PR #599) — pastilles d'événement focusables
  (`tabIndex: 0` + Entrée/Espace = modale) · aria-labels DATÉS (dateLabel du meta) · anneau de focus
  DESSINÉ en SVG (outline CSS sur `<g>` silencieusement ignoré).

---

## ✅ Chantier FUTUR-DAILY au jour + V9 couverture moteur (PR #581→#587 + #588, mergées 2026-08-11/12)

### Tenue 2026-08-12 (suite) — doublons PM-STALE re-vérifiés contre le code + doc meltdown

- [x] **`[TEST-GAP-TAXESTIMATE]` + `[TEST-GAP-SUBSCRIPTIONS]` + `[TEST-GAP-ROLESCONFIG]` +
  `[PV-11e]`** — CADUQUES 2026-08-12 : déjà LIVRÉS en PR #552 (2026-08-01) — les fichiers
  `tests/services/taxEstimate.test.ts`, `tests/services/transactions/subscriptionAlerts.test.ts`,
  `tests/services/fintable/rolesConfig.test.ts`, `tests/services/projection.reerByUserParity.test.ts`
  portent les IDs dans leurs describe et couvrent exactement les surfaces signalées (seuils/médiane,
  chemins d'erreur parseRolesJson, assiette placement, pin couple-inégal). Re-vérifié suites VERTES
  (25/25 + PV-11e) avant d'archiver. Les bullets « Dette technique » dataient de l'analyse
  code-analyzer du 2026-07-31, antérieure à #552 — classe PM-STALE-BACKLOG.
- [x] **`[NW-PARITY-SURFACES-TEST]`** — CADUQUE 2026-08-12, lui aussi livré en #552
  (`tests/services/nwParitySurfaces.test.ts`, 4/4 verts re-vérifiés : les 4 surfaces du ticket,
  persona endetté+propriétaire, conventions équité immo explicites — les surfaces UI déléguées à
  leurs fichiers dédiés, référencés en tête). ⚠️ Ma première re-vérification l'avait déclaré
  NON-livré en constatant que `nwParity.test.ts` n'avait pas bougé depuis #384 — j'ai vérifié le
  FICHIER PRESSENTI au lieu de chercher l'ID dans tout le dépôt ; le livrable vivait dans un
  fichier NOUVEAU. Attrapé par documentation-manager AVANT merge. Leçon portée dans CONVENTIONS :
  prouver une ABSENCE = grep l'ID partout, jamais l'immobilité d'un fichier candidat.
- [x] **`[MELTDOWN-THRESHOLDS-DOC]`** ✅ 2026-08-12 — les 5 seuils de `meltdownReer.ts` (cibles
  90 k/140 k/220 k$ par adulte, paliers NW 2 M/1 M$) documentés comme HEURISTIQUES DE CONCEPTION
  (bloc module + FISCAL_REFERENCE §9 « Limites connues ») : rationale (saturer les paliers bas de
  son vivant vs bombe fiscale successorale), pourquoi rien à sourcer, et l'avertissement re-base
  des goldens si on les ajuste. Affirmation « 90 k ≈ haut du 2e palier » RÉFUTÉE en l'écrivant
  (plafonds réels 117 045 $ féd / 108 680 $ QC) — corrigée avant commit.

> Chantier V8bis (demande Marc 2026-08-06 : « quotidien sur tout ») livré sur 7 PR + la PR de
> clôture V9. Le RESTE VIVANT (cadence de paie, zoom au doigt, ancre, liquidités par compte)
> demeure dans `BACKLOG.md`. Contexte d'origine conservé tel quel ci-dessous.

  - [x] Cœur du raffinement — `services/projection/dailyRefine.ts` (17 tests) ✅ 2026-08-06
  - [x] Passé quotidien, cash — `reconstructCashHistoryDaily` (10 tests, dont la réconciliation avec
        la version mensuelle) ✅ 2026-08-06. ⚠️ Fonction SÉPARÉE : `buildPastPrefix` consomme la
        mensuelle sur une chaîne money-critical, on ne change pas sa forme pour un besoin d'affichage.
  - [x] Passé quotidien, PLACEMENTS — `reconstructPortfolioHistoryDaily` (9 tests) ✅ 2026-08-06.
        FENÊTRÉE (`from`/`to` + `maxDays`), jamais « tout l'historique au jour » : 18 ans feraient
        ~6 500 points × chaque titre. Ventilation par compte (`accountType`), conversion FX, et
        chaque point porte `priceAgeMaxDays` + `hasEstimatedPrice`.
        ⚠️ Butoir DUR à ~12 mois : `DOWNSAMPLE_AFTER_DAYS = 365` compresse le stocké à 1 pt/semaine
        au-delà (quota localStorage) → au-delà, `priceAgeMaxDays` grimpe et l'écran DOIT le dire :
        un plateau de 6 jours n'est plus un week-end, c'est de la donnée absente qui ressemble à une
        valeur stable.
  - [x] Mouvements DATÉS du futur — `services/projection/datedMonthEvents.ts` (9 tests) ✅ 2026-08-06.
        ⚠️ **MESURE QUI RÉDUIT LA PROMESSE** : `RecurringItem.dayOfMonth` est la SEULE date que l'app
        connaisse pour le futur. La PAIE n'a aucun champ de jour (`grossSalary`/`netSalary` sont des
        montants MENSUELS), les DETTES non plus (`Debt` n'a que `termEndDate`), l'hypothèque non plus.
        Donc dans un futur zoomé, seules les charges récurrentes font de vraies marches ; le salaire
        et l'hypothèque sont lissés dans le résidu. → question **A13** routée à Marc — ✅ **RÉPONDUE
        le 2026-08-06 : « chaque semaine jeudi, pareil pour dette »**. `weeklyDeltasForMonth` livré :
        conversion du MENSUEL du store en versements hebdomadaires (×12/52), posés à chaque jeudi,
        jour de la semaine PARAMÉTRABLE (pas un `if` en dur). Un mois à 5 jeudis reçoit 5 paies —
        c'est la réalité, et `dailyRefine` l'absorbe dans son résidu (fin de mois inchangée).
        ⚠️ Limite ASSUMÉE : le MOTEUR raisonne au mois et ignore les mois à 5 paies. Le RYTHME
        affiché est juste, le TOTAL du mois reste celui du moteur.
        ⚠️ Reste à faire : rendre le jour/la cadence ÉDITABLES (aujourd'hui c'est un défaut de code
        aligné sur la réponse de Marc, pas un champ de profil).
        Deux pièges qu'un graphe rend INVISIBLES, tous deux testés : le SIGNE (un coût positif doit
        faire DESCENDRE un solde) et l'ANNUEL compté douze fois.
  - [x] **UI lot A** — `components/projection/DailyDetailPanel.tsx` : le détail jour par jour de la
        fenêtre regardée, sous la courbe ✅ 2026-08-06.
  - [x] **UI lot A2 — infobulle + par compte** (demande Marc 2026-08-09 : « avec l'info bulle dans
        futur je veux voir le détail par jour et le passé je veux voir le détail par jour et par
        compte aussi ») ✅ 2026-08-11. Infobulle : bloc « Jour par jour » du mois SURVOLÉ (l'appelant
        raffine un seul mois, l'infobulle reste passive) — jours à mouvement daté surlignés, le pied
        dit que le reste est interpolé. Passé : 6 colonnes de régime, données déjà calculées par
        `reconstructPortfolioHistoryDaily` et jusqu'ici JETÉES à l'affichage.
        ⚠️ **Défaut trouvé en écrivant le test** : la reconstruction n'était pas bornée à aujourd'hui
        → elle produisait un point pour CHAQUE jour demandé, y compris futur, en reconduisant le
        dernier prix. Les lignes futures montraient donc des placements PLATS présentés comme
        reconstruits, à côté d'une colonne « Projeté » qui, elle, croît. Bornée à `min(to, today)` ;
        test discriminant prouvé (sans la borne : « 1 000 $ » au lieu de « — »).
  - [x] **UI lot B, étape 1 — AXE X NUMÉRIQUE** ✅ 2026-08-11 (choix de Marc parmi 3 options).
        `type="number"` + `domain={['dataMin','dataMax']}`. C'est le PRÉALABLE : en catégoriel, un
        `ReferenceLine x={…}` s'apparie à une CATÉGORIE et n'apparaît que si un point porte
        exactement cette valeur — des abscisses quotidiennes feraient donc disparaître ou glisser
        « Aujourd'hui », la frontière et les jalons, EN SILENCE. En numérique ce sont des coordonnées.
        ⚠️ **Pas un no-op au pixel** (mesuré, mon 1er commentaire le prétendait à tort) : le catégoriel
        centre les points dans leur bande, le numérique colle dataMin/dataMax aux bords → décalage
        d'une demi-bande (~1 px sur ~450 mois), IDENTIQUE pour les points et les ancrages.
        ⚠️ **Le `domain` explicite n'est pas cosmétique** : sans lui recharts part de 0 et tout le
        préfixe PASSÉ est repoussé (frontière mesurée à 316,5 au lieu de 122,5 ; bande du passé à
        x=283 au lieu de x=70).
        Garde `e2e/futureAxis.spec.ts`, prouvée discriminante dans les DEUX états fautifs
        (catégoriel : écart 0,97 ; numérique sans domaine : écart 213,2).
  - [x] **UI lot B, étape 2 — SÉLECTIONNER UN JOUR sur la courbe** ✅ 2026-08-11.
        ⚠️ **CORRECTION DE CAP de Marc** : « je veux pas voir dans l'info bulle le détail des jours
        de chaque mois, je veux pouvoir sélectionner chaque jour dans le graph ». Le bloc-liste que
        j'avais ajouté à l'infobulle (lot A2) donnait à LIRE ; la demande est de SÉLECTIONNER.
        Bloc-liste RETIRÉ. Au zoom maximal, chaque jour est un POINT du graphe : survol, clic pour
        figer, ouverture du détail — comme un mois. L'infobulle ne décrit que le jour visé, et dit
        s'il porte un mouvement daté ou seulement de l'étalement.
        Abscisse fractionnaire via `axisXAtDay` (jour 1 = l'entier du mois, donc jalons alignés).
        ⚠️ **Résolution du clic par VALEUR d'abscisse** (`resolvePointByX`) et non par rang : les
        jours ne sont PAS régulièrement espacés (1/28 en février, 1/31 en mars) — par rang, le clic
        sélectionnait un autre jour sans que rien ne casse. Preuve chiffrée dans le test.
  - [x] **UI lot B, étape 3 — `[FUTUR-DAILY-REACH]` rendre la vue au jour ATTEIGNABLE** ✅ 2026-08-11.
        ⚠️ **Retour de Marc APRÈS le déploiement de l'étape 2 : « j'arrive toujours pas à voir jour
        par jour ».** Il avait raison, et rien n'était cassé : la vue au jour ne s'active que sous
        6 points mensuels visibles, et le SEUL chemin pour y descendre était la molette — **23 à 31
        crans depuis « Tout » (mesuré), 16 depuis le preset « 5 ans »** —, sans aucun retour disant
        qu'on s'en approchait. Pire : `useTimeChartZoom` n'écoute que `wheel` + souris, donc au
        doigt (téléphone, tablette) la fonctionnalité était **strictement inatteignable**.
        Livré : bouton **« Jour »** dans le sélecteur de période → un clic pose la fenêtre exacte,
        ancrée sur aujourd'hui (`dailyWindowRange`, 6 tests). E2E `futureDailySelect.spec.ts`
        « EN UN CLIC », **prouvée discriminante** (échoue sans le bouton).
        ⚠️ Défaut ADJACENT corrigé au passage : `idxForYears` cherchait son indice dans `chartData`
        alors que le zoom indexe `displayData` (= passé préfixé + `chartData`) → les presets
        « 5/10/20/30 ans » s'arrêtaient `pastPrefix.length` mois trop tôt, et leur état actif se
        comparait au même indice faux, donc cohérent avec lui-même et invisible.
        — Contexte d'étape 3 (seuils de zoom, aires masquées, gardes) :
        ⚠️ **Seuil COUPLÉ au plancher de zoom** : `useTimeChartZoom` s'arrête à 5 d'écart, soit
        **6** points visibles. Mon premier plafond (4 mois) rendait la vue au jour INATTEIGNABLE —
        code « correct », fonctionnalité jamais déclenchée. Attrapé par l'e2e, pas à la lecture.
        Aires par compte MASQUÉES au jour + bandeau qui explique pourquoi (le moteur ne ventile
        qu'au mois ; l'étaler serait une précision inventée).
        Gardes : `e2e/futureDailySelect.spec.ts` (deux abscisses éloignées → deux jours DIFFÉRENTS,
        sinon « on peut sélectionner un jour » serait vrai en apparence), + tests unitaires
        `axisXAtDay` et `resolvePointByX`.
  - [x] **UI lot B, étape 4 — `[FUTUR-DAILY-FULL]` TOUS les calculs au jour** ✅ 2026-08-11.
        ⚠️ **Retour de Marc APRÈS le déploiement de l'étape 3, capture à l'appui** : « ça me dit
        encore septembre 2026 et pas le jour […] je veux que tous les calculs soient faits pour
        chaque jour, je veux que tout soit ajusté au jour, toutes les sommes ». Il avait raison et
        le diagnostic était plus profond que l'étiquette : la vue au jour ne portait QUE `NetWorth`,
        donc l'infobulle (soldes par compte, dépôts, rendement, paie, dépenses, impôts) était vide
        au jour et les aires empilées étaient masquées. Une courbe au jour SANS calculs au jour.
        Livré : `services/projection/dailyLedger.ts` (25 tests) ventile **tous** les champs du
        moteur au jour. L'infobulle et les aires empilées fonctionnent au jour **sans être
        réécrites** — elles lisent les mêmes clés, avec les montants du jour ; donc zéro risque de
        divergence entre les deux granularités.
        ⚠️ **RÉFUTATION EXPLICITE de mon propre constat de cadrage** (« seule la Valeur nette peut
        passer au jour, ventiler les comptes serait de la fausse précision »). C'était faux : le
        moteur émet DÉJÀ, par mois et par compte, `NetTransfer*` et `MarketGrowth*` — de quoi
        décomposer sans rien inventer. La seule vraie inconnue est la DATE du rendement du marché,
        qui reste répartie et annoncée comme telle. Classe `DOC-STALE-IMPOSSIBILITY` : un constat
        d'impossibilité non re-vérifié bloque une feature atteignable.
        Trois gardes indépendantes : classification exhaustive **contre le moteur réel** (un champ
        ajouté au moteur sans classe fait échouer la suite), invariants de raccord (dernier jour =
        valeur du moteur ; Σ des jours = total du moteur), et un test d'**ordre de grandeur** —
        ajouté après avoir mesuré que les deux premiers, qui lisent la classification pour choisir
        quoi vérifier, ne détectaient PAS un solde reclassé en flux.
        ⚠️ **Bug de fond corrigé au passage** : le raffinement précédent appliquait la même liste de
        mouvements datés au compte ET au patrimoine net → un paiement de dette creusait un trou dans
        la VALEUR NETTE le jour de paie, aussitôt rebouché par l'étalement du résidu (donc invisible
        en fin de mois, bien visible au jour). Un remboursement de dette est NEUTRE sur le patrimoine
        net : le compte baisse, la dette baisse d'autant.
  - [x] **`[FUTUR-CLICK-AREA]` cliquer sur une AIRE ne figeait pas l'infobulle** ✅ 2026-08-11.
        Trouvé en diagnostiquant un e2e rouge, PAS en lisant le code. Sonde Playwright : sur
        `path.recharts-area-area`, aucun événement `click` n'est dispatché — même pas au niveau
        `document` en capture ; sur `svg.recharts-surface` (espace vide), oui. Recharts re-rend le
        path entre `pointerdown` et `pointerup`, donc le navigateur ne synthétise jamais le `click`.
        La moitié basse de la courbe était morte au clic **depuis toujours** (défaut antérieur à la
        vue au jour) ; l'e2e ne l'avait jamais vu parce qu'il cliquait dans le vide au-dessus de la
        pile. Corrigé en passant le conteneur à `onPointerUp` (+ garde pour ne pas doubler l'action
        des pastilles d'événement). L'e2e clique désormais DANS les aires, volontairement.
  - [x] **`[FUTUR-DAILY-PAST-REAL]` le PASSÉ au jour depuis les VRAIES séries quotidiennes** ✅ 2026-08-11
        (demande Marc : « je veux aussi que ça marche pour le passé, en fonction de la valeur de mes
        comptes, de mes dépenses »). `services/history/dailyPastLedger.ts` (13 tests) : soldes par
        compte + cash + équité immo + valeur nette RÉELS avant aujourd'hui, revenus/dépenses = les
        VRAIES transactions du jour avec leurs libellés, et la variation d'un compte séparée en
        DÉPÔT (achats datés, à leur prix d'achat) vs RENDEMENT (le reste). Valeur nette via
        `computeRawNetWorth` (source unique), jamais une copie de la formule.
        ⚠️ Le point réel est reconstruit **à partir de rien**, pas en écrasant quelques champs du
        point projeté : un `{...projeté, ...réel}` laisserait filtrer des dizaines de valeurs
        PROJETÉES (impôt dormant, rentes, solde d'impôt, cotisations) dans une journée présentée
        comme réelle. Ce qui n'est pas mesuré est ABSENT, donc « — ».
        ⚠️ Une journée n'est produite que si les DEUX sources ont de la matière ce jour-là : cash
        seul donnerait un patrimoine amputé de tout le portefeuille — crédible et faux.
        ⚠️ AUJOURD'HUI n'est pas reconstruit (la reconstruction s'arrête à la veille, par
        construction) : le présent vient de l'ancre du moteur, sinon deux vérités pour la même date.
        ⚠️ Bornée à aujourd'hui : `reconstructPortfolioHistoryDaily` produit volontiers des jours
        FUTURS plats en reconduisant le dernier prix — le même défaut avait déjà été corrigé une
        fois dans le panneau quotidien.
        Limites assumées et DITES à l'écran : équité immo connue à l'ANNÉE (palier), dettes figées
        au niveau actuel (Option A), badge « Réel / Projeté » + âge du prix dans l'infobulle.
  - [x] **`[FUTUR-DAILY-PAST-REACH]` le bouton « Jour » ne montrait AUCUN jour passé** ✅ 2026-08-11.
        ⚠️ **Retour de Marc : « je vois toujours pas au jour pour le passé ».** Il avait raison, et le
        défaut est arithmétique : `dailyWindowRange` posait `lo = todayIndex − 1`, or la construction
        des jours CONSOMME la première ancre comme valeur d'entrée sans la rendre → le premier jour
        affiché était le 1er du mois COURANT. Toute la reconstruction du passé au jour
        (`[FUTUR-DAILY-PAST-REAL]`) était donc livrée, testée… et **strictement invisible**.
        Même classe que `[FUTUR-DAILY-REACH]`, une marche plus loin : la fonctionnalité était
        atteignable, mais pas la MOITIÉ qu'elle promettait.
        Corrigé : fenêtre **centrée** sur aujourd'hui (2 mois passés + mois courant + 2 futurs).
        Garde : test « la moitié des mois rendus tombe AVANT aujourd'hui », qui échoue sur l'ancien
        ancrage.
  - [x] **`[FUTUR-DAILY-DATE-FORMAT]` libellé du jour en JJ/MM/AAAA** ✅ 2026-08-11 (demande Marc :
        « ça devrait me dire par exemple le // »). « sam. 14 sept. 2026 » ressemblait encore au
        libellé mensuel d'un coup d'œil ; « sam. 14/09/2026 » ne laisse aucun doute. Le jour de la
        SEMAINE est gardé — la paie tombe le jeudi, et le voir rend la marche lisible.
  - [x] **`[FUTUR-DAILY-INFOBULLE-ONLY]` le détail du jour vit dans l'INFOBULLE, uniquement**
        ✅ 2026-08-11 (correction de cap Marc : « je veux que juste dans l'infobulle ce soit
        l'information par jour […] pas de nouvel onglet ou quoi »). Le tableau jour-par-jour sous la
        courbe (`DailyDetailPanel`, lot A) est RETIRÉ — composant, tests, et le code que lui seul
        consommait (`refineMonthToDaily`/`refineWindowToDaily`/`daySpan` de `dailyRefine`,
        `dailyDeltasFor`/`datedCoverageForMonth` de `datedMonthEvents`). Garder du code mort couvert
        de tests verts aurait fait croire à la prochaine session que c'était vivant.
        ⚠️ Leçon « Proposer ≠ faire » incarnée : ce tableau était MON ajout de cadrage, jamais
        demandé tel quel — il a fini perçu comme du bruit et retiré sur demande explicite.
  - [x] **`[FUTUR-DAILY-ZOOM-DEEP]` zoomer jusqu'à UN mois affiché (~30 px par jour)** ✅ 2026-08-11
        (demande Marc : « je veux pouvoir zoomer un peu plus pour pouvoir voir les jours
        individuels »). `minPoints: 1` sur le zoom du graphe Futur (le défaut 5 reste pour les
        autres graphes) : plancher = 2 points mensuels = 1 mois rendu au jour. Passé compris (même
        mécanique, mêmes données réelles).
        ⚠️ **Bug de fond débusqué en route, `[ZOOM-ROUND-FIXPOINT]`** : à petit span, l'arrondi
        entier ANNULAIT le cran de molette (à span 5, ×0,85 déplace chaque borne de ~0,375 →
        `Math.round` redonne les mêmes entiers → point fixe silencieux). `minPoints: 1` seul était
        donc INOPÉRANT — et le DÉZOOM molette était déjà coincé au plancher AVANT ce lot (bug
        préexistant, symétrique). Correctif : quand l'arrondi annule le cran, forcer un pas ENTIER
        du côté opposé au curseur. 6 tests unitaires du hook, 4 prouvés discriminants par
        `git stash` ; garde e2e mesurable (la légende de la table sr-only cesse d'être
        « échantillonnée » sous 40 jours — inatteignable avant le fix).
  - [x] ⚠️ **Piège de nommage au branchement** ✅ 2026-08-11 (`[NAMING-INVESTED]`) : la reconstruction
        MENSUELLE nommait `NetWorth` un champ qui porte la valeur INVESTIE ; renommé `InvestedValue`,
        aligné sur la quotidienne. ⚠️ Le commentaire du code affirmait « renommer casserait d'autres
        consommateurs » — constat PÉRIMÉ, jamais re-vérifié (classe `DOC-STALE-IMPOSSIBILITY`) :
        mesuré au grep + typecheck, AUCUN consommateur de prod ne lisait ce champ, seulement 3 tests.
        Ce nom avait déjà nourri de faux rapprochements d'audit (« un nom trompeur fabrique des faux
        findings », CLAUDE.md).
- [x] **V9 — Couverture moteur** ✅ 2026-08-12 : `[FUZZ-ONETIME-FLOWS]` + `[HARDEN-SNAPSHOT-RACE]` (détail ci-dessous).
- [x] **`[HARDEN-SNAPSHOT-RACE]`** ✅ 2026-08-12 — `runProjectionAsync` accepte `{ signal }`
  (sentinelle `PROJECTION_CANCELLED`), branché dans `ProjectionEngine` (abort au changement de
  params/démontage, annulation filtrée AVANT le log « CRITICAL »).
  ⚠️ Design imposé par la dédup PH2-b : l'abort ne rejette qu'une promesse DÉRIVÉE par appelant —
  rejeter la promesse PARTAGÉE annulerait le calcul de l'appelant raccroché qui n'a rien demandé.
  Le worker n'est PAS interrompu (canal singleton partagé) : annuler = se détacher, message tardif
  filtré par requestId.
  ⚠️ Leçon de test : la 1re preuve de discrimination par stash était VACUEUSE — l'import de la
  sentinelle devenait `undefined` sous l'ancien code, et `toThrow(undefined)` accepte n'importe
  quelle erreur. Sentinelle EN DUR dans les assertions ; discrimination re-prouvée (2 rouges sans
  le fix).
- [x] **`[FUZZ-ONETIME-FLOWS]`** ✅ 2026-08-12 — le fuzz de conservation exerce désormais TOUS les
  flux one-time restants : VENTE immo (lifeEvent `eventKind: 'VENTE_IMMO'` daté APRÈS l'achat, dont
  bien locatif → gain imposable), REVENU LOCATIF (bien non-RP), ÉQUITÉ NÉGATIVE (croissance
  immobilière générée −10..+8 %/an, portée sur le GOAL), VÉHICULE cyclique (W5), HÉRITAGE, REEE.
  Couverture MESURÉE par un test dédié (échantillon seedé 120 scénarios, sondes d'EFFET sur le
  chartData, planchers assertés par flux) — jamais supposée.
  ⚠️ Le test de couverture a payé dès l'écriture : `propertyGrowthRate` câblé sur la CONFIG
  projection était un no-op silencieux (équité négative 0/120) — le moteur ne lit que
  `goal.propertyGrowthRate` (realEstateMonth.ts:354) ; le champ config est MORT en prod
  (→ découverte `[ENG-PROPGROWTH-CONFIG-DEAD]`, au BACKLOG). Re-mesuré après correction : 4/120,
  plancher 2 (événement rare par nature : achat réussi × croissance négative × mise faible ×
  années sous l'eau). Conservation INV-9 verte sur les 500 runs avec les nouveaux flux.

## ✅ Vague 1 — quick wins confiance (PR #549, mergée 2026-07-31)

- [x] **`[MCP-TAX-FHSA-BALANCE]`** ✅ 2026-07-31 (V1) (S — V1) — `getTaxSituation.spec.ts:78` passe `u.fhsaBalance`
  (SOLDE) en position COTISATION. Effet actuel NUL (`fhsaBalance` n'a AUCUN écrivain — vérifié) mais
  bombe dès qu'un écrivain arrive → clamp `min(fhsaBalance, FHSA_ANNUAL_LIMIT)` maintenant.
- [x] **`[FISC-REF-FRESHNESS]`** ✅ 2026-07-31 (V1 — 3ᵉ passe datée, réserve §8 levée, hypothèses de modèle documentées §9) (S, doc — V1) — FISCAL_REFERENCE : dater l'en-tête (§4 réécrit
  2026-07-07 sans bump), nettoyer la réserve §8 obsolète (barème 2026 déjà là), DOCUMENTER les
  hypothèses de modèle absentes (0.92, EST_DIVIDEND_YIELD 0,02 / EST_CAPITAL_GAINS_YIELD 0,07,
  REEE_AIP_TAX_RATE 0,20, NONREG_DIVIDEND_DISTRIBUTION_SHARE, FSS retraité, PAE REEE non modélisés).
  + Ticket daté : confirmer CELI/REER 2027 au Budget (nov-déc 2026 — la garde 12 mois ne le verra pas).
- [x] **`[BIAIS-CAGR]`** ✅ 2026-07-31 (V1 — note UI honnête + doc source ; retrait des apports = impossible sans transactions datées par bucket) (S) — `startingBalancesFromHistory.ts:55-63` : bornes livrées, mais le
  « rendement réel » ne retire toujours pas les apports → surestime. Note UI ou retrait des apports.
- [x] **`[PROJ-TAXPAID-LABEL]`** ✅ 2026-07-31 (V1 — clamp [0,1] efficacité + taxLeakage ; renommage de totalTaxesPaid jugé non rentable, sémantique déjà documentée projection.ts:573) (S, reste moteur) — `monteCarlo.ts:106` : plafond sans plancher 0
  (compteur négatif → efficacité > 100 % possible) ; `taxLeakage` :137 non borné ; `totalTaxesPaid`
  non renommé. Re-baseliner les tests MC sciemment.
- [x] **`[DASH-HIST-CARDS-LABEL]`** ✅ 2026-07-31 (V1) (S, reste du finding #544 F3) — étiqueter les cartes « Actifs
  individuels » + le graphe Accueil « au dernier cours de clôture » (le tooltip Variation est fait) —
  réutiliser `staleTailSymbols`/`noHistorySymbols`.
- [x] **`[DEADCODE-TX-TYPEFILTER]`** ✅ 2026-07-31 (V1 — états + branches supprimés) (S — V1) — `Transactions.tsx:70,72` : `_setDateStart`/
  `_setTypeFilter` JAMAIS appelés → filtres date-début + type (Income/Expense/Transfer) morts
  structurels (pourtant dans les deps du useMemo :216). Câbler une vraie UI ou supprimer l'état +
  les branches.
- [x] **`[DEP-ESBUILD-UNLISTED]`** ✅ 2026-07-31 (V1 — esbuild 0.28.1 épinglé en devDependency) (S — V1) — `esbuild` importé par `mcp/build-server.mjs:10` +
  `mcp/pack.mjs:10` mais ABSENT de package.json (transitive seulement) → un bump Vite/Vitest peut
  casser le build Cloud Run en silence. `npm i -D esbuild` épinglé.
- [x] **`[DETTE-SHADE-OUTOFPALETTE]`** ✅ 2026-07-31 (V1 — 8/8 remplacés : info-400/success-400/warning-400/surface) (S — V1) — 8 classes Tailwind hors palette = no-op silencieux
  (classe FIX-INK600-TOKEN) : `LifeProjects.tsx:62` text-info-100 · `AssetLocationCard.tsx:120`
  text-info-200 · `ZoomableTimeChart.tsx:170` bg-ink-950 · `StrategyOptimizerPanel.tsx:461`
  bg-ink-900/95 · `ProjectionControls.tsx:109` + `UserConfigFields.tsx:84` text-success-300 ·
  `UsersCard.tsx:297` + `PageSetupGate.tsx:377` text-warning-300 → shade existant le plus proche.
- [x] **`[DEP-DEPENDABOT-26]`** ✅ 2026-07-31 (V1 — @hono/node-server 2.0.12 via npm audit fix ; 0 moderate restant) (S) — 1 alerte moderate ouverte sur main
  (https://github.com/MoKarade/FinanceAI/security/dependabot/26) — bump + npm audit.

---

## ✅ Vagues 2 + 3 + findings (PR #551 mergée 2026-07-31, PR #552 mergée 2026-08-01)

> V2 (meltdown honnête, #551) · V2'/V2''/V3/findings panel/héritage (#552, squash `32a112f`).
> Panel #552 : 4 agents, tout MESURÉ (conservation 20/20, INV-9 ≤ 0,02 $/301 mois, amortissement
> forme fermée écart 0, achat futur bit-identique). Tickets RESTANTS ouverts par le panel :
> [ENG-PAST-OWNED-VS-PLANNED], [ENG-RENEWAL-RATE-MISMATCH], [IMMO-3-FORMULES],
> [ENG-PROPGROWTH-ZERO-INEXPRIMABLE], [ENG-NETTRANSFER-REER-INCOMPLET], [ENG-RENEWAL-M0],
> [ENG-CELIAPP-RESIDUAL-PASTBUY], [UX-ISACTIVE-SEMANTIQUE] — au BACKLOG vivant.

- [x] **`[WHT-DISPLAY-MELTDOWN]`** ✅ 2026-07-31 (V2, PR #551 — `rrspWithholdingMois += meltResult.withholding`,
  discriminant prouvé, NW bit-identique pinné par golden). Précision panel #551 : la retenue entrait
  déjà dans le crédit décembre ; le vrai gain = COHÉRENCE de convention entre stratégies (ratio
  MELTDOWN/AUTO 0,601 → 1,400) — la reco « objectif impôt » recommandait MELTDOWN à tort (corrigé).
  Valeur absolue toujours sur-évaluée pour toutes → [PROJ-TTP-DOUBLECOUNT] (vivant).
- [x] **`[ENG-MELTDOWN-FLOW-INVISIBLE]`** ✅ 2026-07-31 (V2, PR #551 — `retraitReerMois += meltResult.reerDrawn`,
  Σ RetraitREER ≥ 90 % du REER drainé prouvé) — ~96 % des sorties invisibles avant (30 496 $ affichés
  pour 794 303 $ tirés) : tooltip/modal/jalons/MCP aveugles.
- [x] **`[ENG-FERR-FLOW-INVISIBLE]`** ✅ 2026-07-31 (V2'', PR #552) — FERR obligatoire + retraits de
  goals alimentent `retraitReerMois` (113 418 $ = 11,6 % invisibles avant) ; test discriminant
  fixture 73 ans (Σ ≈ 0 sur l'ancien code pour 80 k$+ drainés). Identité de compte REER :
  Σ|résidu| 330 354 $ → 1 $ sur 301 mois (mesuré par le validator).
- [x] **`[ENG-HERITAGE-INFLOW]`** ✅ 2026-08-01 (PR #552, rapporté par Marc « héritage marche pas ») —
  `applyLifeEvents` n'avait AUCUNE branche de rentrée d'argent : un HERITAGE était DÉBITÉ comme
  dépense one-shot (impact net −2× le montant). Branche +liquide non imposable + 4 tests (delta
  ±50 k$, saut au mois de l'événement, piège « vente » dans le nom, NaN) — discriminant prouvé par
  stash (3/4 échouent sur l'ancien code).
- [x] **`[DASH-IMMO-EQUITY-WRITERS]`** ✅ 2026-07-31 (V2' — racine trouvée et corrigée : **le MOTEUR
  traitait un bien à purchaseDate PASSÉE comme un achat À FAIRE** — re-débit de la mise de fonds au
  m0 si le cash suffisait, « Achat reporté » à l'INFINI sinon → Immobilier = 0 sur tout l'horizon
  (mesuré). Fix : helper partagé `services/projection/pastPurchaseInit.ts` (init DÉTENU aux
  conventions du moteur : prime SCHL, PMT d'origine, solde amorti forme fermée, valeur appréciée)
  consommé par l'init `propertiesState` du moteur ET par le KPI Accueil (`presentEquityOfGoal` —
  champs explicites prioritaires, F4 : filtre isActive + gate équité ≠ 0 + garde non-fini tracée).
  11 tests dont discriminant (Immobilier = 0 sur l'ancien code) + INV-9 + conservation/fuzz/personas
  verts.) — ancien texte : le terme équité immo du KPI Accueil
  est INERTE (`RealEstateGoal.currentValue`/`mortgageBalance` sans AUCUN écrivain UI) → un
  propriétaire modélisé par price/downPayment a un KPI sans sa maison pendant que le Futur l'inclut
  (mesuré : 81 609 $ moteur vs 0 KPI). Trancher : brancher sur ce que l'UI possède OU retirer le
  terme. En même temps (F4) : gate `equity !== 0`, filtre `isActive`, gardes `Number.isFinite` +
  logErrorThrottled (3 sites).
- [x] **V3 détail** ✅ (PR #552) : [DEFAULTS-DRIFT-FINTABLE-FIELDS] (4 champs + garde
  bidirectionnelle registryParity) · [TEST-GAP-TAXESTIMATE] · [TEST-GAP-SUBSCRIPTIONS] ·
  [TEST-GAP-ROLESCONFIG] · [PV-11e] (pin Σ reerByUser == REER, couple inégal + goal REER) ·
  [NW-PARITY-SURFACES-TEST] (conventions équité immo par surface + fix PDF `equity: 0`).
- [x] **Findings panel #552 corrigés dans #552 même** ✅ 2026-08-01 : graine prevNW/minNetWorth
  ensemencée (flux fantôme +156 629 $, plancher −158 731 $) · substitution loyer↔PMT neutre au boot
  (sur-charge 20 084 $/an) · champs explicites honorés par le moteur (écart 291 676 $) ·
  sanitisation immo frontière (968 non-finis) · garde non-fini dans presentEquityOfGoal
  (3 consommateurs) · équité historique PAR ANNÉE au graphe Accueil (+77 097 $ sur 2022) ·
  log « supposée DÉTENUE » au m0 · docs PROJECTION/OUTPUT_SCHEMA + 3 leçons CONVENTIONS.

## ✅ V4 vie privée + V5a/V5b impôt à vie (PR #553 `000eec6`, #554 `acfa035`, #555 `22d128a` — mergées 2026-08-01)

- [x] **`[D6-PRIV-MONTANTS]`** ✅ (PR #553) — montants des sliders REER/CELIAPP (TaxCenter), REEE
  (ChildPlanning) et paiement suppl. (DebtManager) masqués en mode discret via `PrivateSliderValue`
  (révélation au focus, aria-label SR-safe), symétrie PrivateNumberInput.
- [x] **`[SEC-GA-DEFER-CONSENT]`** ✅ (PR #553, Loi 25) — le SCRIPT gtag n'est chargé qu'au
  consentement accordé (plus aucun octet vers Google avant).
- [x] **`[HIST-STORE-SIZE]`** ✅ (PR #553) — downsample du `priceHistory` stocké (> 365 j →
  1 pt/semaine, idempotent, compose avec mergePriceHistories) : ÷5 le stock ancien dans chaque
  push Drive/localStorage.
- [x] **`[PROJ-TTP-DOUBLECOUNT]`** ✅ (PR #554) — « Impôt à vie » = Σ FluxImpots SEUL (identité au
  cent sur 3 scénarios, NW bit-identique, discriminant git-stash). Mesures : MELTDOWN
  321 122 → 131 871 $ ; AUTO 229 338 → 29 806 $ ; ratio honnête 4,42. UI relibellée
  « Régularisations d'impôt (net) » + tooltip. ⚠️ L'ordre du ranking CHANGE (voulu — l'ancien
  reposait sur le double-comptage) → tickets [ENG-RANKING-ORDER-PIN]/[ENG-RANKTAX-ESTATE] au vivant.
- [x] **`[ENG-TTP-UNSETTLED-HORIZON]`** ✅ (PR #555) — `unsettledTaxAtHorizon` (NET signé, photo à
  la réconciliation de décembre, reset à l'avril suivant) exposé et additionné dans
  `strategySearch.lifetimeTax`. Additivité prouvée au cent ; magnitudes 8,6 %/51,5 %/100 % à
  10/2/1 ans ; signe négatif honnête. Reste : [ENG-TTP-UNSETTLED-PROPAGATE] (4 surfaces au compteur nu).

## ✅ V5c — paliers en dollars réels (PR #556 `16e9e9d`, mergée 2026-08-01)

- [x] **`[FISC-BRACKET-REALINDEX]`** (fusionne ITEM-2A, CRITIQUE, GO Marc) ✅ (PR #556) — param
  `realDeflator` (défaut 1 = rétrocompat bit-identique) sur `getIndexedBracketsForYear` + dérivés
  (paliers, BPA, crédits d'âge/361, RAMQ, FSS, getMarginalRate, calculateFiscalReport) ; passé
  par les sites RÉELS de taxDecember + latentTax (site oublié rattrapé au panel #556, latent
  affiché sous-évalué ~53 k$/−35 % à 30 ans). Discriminants 5/5 + unitaire d'homogénéité ;
  homogénéité exacte au bit (panel) ; conservation ≤ 0,02 $. Retraité ttp +62 % (conservateur) ;
  salarié NW +0,8 % — cause MESURÉE : RAMQ/FSS doublement indexées redescendent (le claim
  « retenue sur-évaluée » a été réfuté et réécrit dans 3 docs). 10 goldens re-basés sciemment.
  Tickets dérivés au vivant : [FISC-PENSION-CREDIT-REAL], [FISC-BRACKET-CPI-STRESS],
  [FISC-MARGINAL-SPACE].

## ✅ Champ MCP trompeur (PR #560 `2f05622`, mergée 2026-08-05)

- [x] **`[MCP-NETINCOME-MISLEADING]`** ✅ (PR #560) — `netIncome` de `get_tax_situation` porte
  l'assiette IMPOSABLE, donc il inclut le rendement de placement ESTIMÉ (12 970 $) jamais encaissé.
  En le comparant aux dépôts de paie réels, j'ai annoncé à Marc un écart de salaire de 12 800 $/an
  INEXISTANT (vrai écart 4 491 $, expliqué par la progression de ses paies ; son 60 000 $ saisi est
  bon à 2,4 % près). C'est MARC qui a demandé la contre-vérification. Fix : `netSalaryIncome` /
  `netSalaryMonthly` (brut − impôt − cotisations), validés à 0,5 % contre 12 mois de dépôts réels
  (39 654 prédits vs 39 848 mesurés) + mise en garde dans la note du tool + test discriminant.
  Leçon CONVENTIONS : un agrégat non étiqueté fabrique de faux diagnostics, y compris chez Claude.

## ✅ Session 2026-08-05 (suite) — abonnements : pouvoir dire NON (PR #570)

- [x] **`[SUBS-TAB]` — volet « confirmer / ignorer »** ✅ 2026-08-05 (PR #570) — la détection et la
  surface existaient déjà (`Planning.tsx`, section `fixed`), avec les alertes de hausse/arrêt, les
  totaux et l'ÉPINGLAGE. Mais **rien ne permettait de REFUSER** : épingler confirmait, alors qu'un
  faux positif revenait à CHAQUE actualisation, indéfiniment.
  - Choix Marc (2026-08-05) : « ne plus JAMAIS le proposer ». Liste d'exclusion persistée
    (`dismissedSubscriptions`), **par CLÉ de marchand normalisée** et non par objet : le refus porte
    sur le marchand, pas sur une occurrence datée dont les montants bougent.
  - Champ ADDITIF optionnel + 3ᵉ paramètre de `mergeSubscriptions` à défaut `[]` → **aucun bump de
    schéma, aucun code de migration**, rétrocompatibilité bit-identique (verrouillée par un test).
  - Le filtre s'applique AUSSI aux épinglés : le handler désépingle en même temps, mais le module
    pur ne s'y FIE pas — un état incohérent venant du Drive ou d'un backup se corrige au calcul
    plutôt que de ressusciter l'abo par la porte de derrière.
  - ⚠️ **« Ne plus jamais » reste RÉVERSIBLE et VISIBLE** : un `<details>` compte les marchands
    écartés et permet de les réafficher. Un refus définitif ET invisible aurait été un piège — un
    mauvais clic ferait disparaître un vrai abonnement sans recours, et Marc chercherait pourquoi
    son total a baissé.
  - ⚠️ **Le ticket décrivait mal l'existant** : il demandait « une surface dédiée » comme s'il n'y
    en avait aucune. Vérifié par grep AVANT de coder (règle CLAUDE.md) → le vrai manque était le
    refus, pas l'affichage. Le volet EMPLACEMENT reste ouvert, gaté sur l'arbitrage de Marc.

## ✅ Session 2026-08-05 (suite) — V8 : deux UI qui promettaient ce qu'elles ne pouvaient tenir (PR #569)

Même famille : une interface qui propose quelque chose qu'elle ne peut pas honorer. L'une CACHE une
valeur qui agit, l'autre OFFRE un choix qui ne produit que du faux.

- [x] **`[GOAL-DEADLINE-UI]`** ✅ 2026-08-05 (PR #569) — la carte d'un objectif existant
  (`Planning.tsx`) n'affichait ni n'éditait `deadline`, alors que l'échéance pilote un DÉCAISSEMENT
  réel dans la projection ET que le tool MCP `upsert_savings_goal` peut la poser. Une écriture de
  l'assistant restait donc INVISIBLE et IRRÉVERSIBLE à l'écran — même classe que
  [MCP-NETINCOME-MISLEADING] : une donnée qui AGIT sans que Marc puisse la voir ni la corriger.
  Champ date affiché + éditable, patron calqué sur `updateGoalLink`.
  ⚠️ `deadline` est un `string` REQUIS et le formulaire de création utilise déjà la CHAÎNE VIDE pour
  « pas d'échéance » : on s'aligne dessus plutôt que d'introduire un 2ᵉ encodage (`undefined`) qui
  ferait diverger deux chemins d'écriture pour le même sens. Absence d'échéance DITE (« aucune »)
  plutôt qu'un champ vide ambigu.
- [x] **`[PH4C-SAVINGS-NATURE]`** ✅ 2026-08-05 (PR #569) — le menu de liaison listait TOUTES les
  catégories, y compris celles de nature `Epargne`. Or le « Versé ce mois » vient de `actualsMap`,
  qui EXCLUT les virements — précisément le moyen d'alimenter un poste d'épargne. Lier un tel poste
  condamnait donc l'objectif à « Versé ce mois : 0 $ » À PERPÉTUITÉ. Le choix est retiré de l'offre
  plutôt que d'afficher un zéro crédible (no-fake-data).
  ⚠️ **Régression attrapée par son propre test** : filtrer l'option rendait INVISIBLE une liaison
  DÉJÀ posée sur un poste épargne — et le moindre changement du menu l'aurait effacée en silence.
  Correctif : distinguer deux raisons de ne pas être dans le menu (catégorie disparue → « introuvable »
  vs nature épargne → « ne peut rien afficher »), et garder l'option visible dans les deux cas pour
  que Marc puisse défaire la liaison au lieu de la subir.

## ✅ Session 2026-08-05 (suite) — V7 TERMINÉE : ratchet des constantes fiscales (PR #568)

- [x] **`[FISC-CONST-GUARD-V2]`** ✅ 2026-08-05 (PR #568 ; annoncé S, livré **M** — la mesure a
  corrigé l'estimation) — le garde existant `FISC-CONST-LINT` interdit de RECOPIER un littéral de
  `utils/tax.ts`, mais est aveugle au cas INVERSE : une constante fiscale **nouvelle**, née dans le
  moteur, que rien ne compare à rien. C'est par ce trou que `totalEmployerTax * 0.92` a vécu sans
  source pendant des mois.
  - **RATCHET, pas échec dur** : le périmètre a été MESURÉ avant d'écrire une ligne (leçon
    « resserrer le scan AVANT de coder le fix ») → **38 littéraux** existants sur 6 modules
    fiscaux. Un échec dur aurait cassé d'emblée sur 38 lignes, donc aurait été relâché jusqu'à ne
    plus rien attraper. L'existant est inventorié AVEC SA RAISON ; tout NOUVEAU fait échouer.
  - **Le TRI est la valeur**, pas le scan. Trois familles : `fiscal` (vrai paramètre ARC/RQ, à
    ancrer), `design` (heuristique de conception, à ne JAMAIS « sourcer ») et `structural`.
    Il a révélé `0.18` — le plafond REER de 18 % du revenu gagné — en dur, noyé au milieu du
    `0.95` de Guyton-Klinger et des seuils de meltdown. Les confondre aurait pollué FISCAL_REFERENCE.
  - **Le ratchet a trouvé ce que le tri manuel avait manqué** : en élargissant le scan aux replis
    (`||`), 4 littéraux de plus, dont un VRAI taux FERR (`RRIF_RATES[age] || 0.20`) invisible à
    l'œil parce que `||` ne ressemble pas à un opérateur de calcul.
  - **Élucidation avant inventaire** : `taxCurrentYearGains / 0.25` restait obscur. Vérifié — c'est
    un PROXY qui inverse l'impôt vers le gain brut en supposant un taux effectif de 25 %
    (inclusion 50 % × marginal 50 %) : une approximation de modèle, PAS un taux statutaire. Figer
    une ignorance dans un garde lui donne l'air de protéger quelque chose.
  - Clé d'inventaire **(fichier, valeur)** et non (fichier, ligne) : un numéro de ligne dérive au
    premier refactor et rendrait le garde bruyant. Prix assumé et écrit : une 2ᵉ occurrence de la
    même valeur dans le même fichier passe.
  - Test d'intégrité de l'inventaire (raison ≥ 30 caractères, pas de doublon, pas d'orphelin) — il
    a d'ailleurs attrapé trois de mes propres entrées bâclées en « — idem. ».
  - **Discriminant PROUVÉ** par injection de `x * 0.92` dans `taxApril.ts` : le garde le signale
    nommément. Dette de suivi ouverte : `[FISC-CONST-ANCHOR-DEBT]` (14 entrées `fiscal` à ancrer).

## ✅ Session 2026-08-05 (suite) — garde de convention chartData (PR #567)

- [x] **`[MCP-CHARTDATA-SUM-GUARD]`** ✅ 2026-08-05 (PR #567 ; S, garde PRÉVENTIF) — aucun test ni
  lint n'empêchait un outil MCP de fabriquer un « revenu de retraite » en ADDITIONNANT des champs de
  flux `chartData`. Or le décaissement NON-ENREGISTRÉ et le LIQUIDE n'ont **aucun** champ de flux
  (leçon MCP-RETIREMENT-VERDICT, mesuré : 3 923 $/mois identifiables contre une cible de 5 500 $ sur
  un plan qui TIENT à 98 % en Monte-Carlo) → une telle somme SOUS-ESTIME structurellement.
  - **0 offender au moment de l'écriture** (vérifié) : le garde existe pour que la correction de
    MCP-RETIREMENT-VERDICT ne soit pas refaite à l'envers par quelqu'un qui trouvera « logique »
    d'additionner ce que le moteur expose gentiment.
  - Deux formes attrapées, choisies parce que ce sont celles par lesquelles l'erreur ARRIVE :
    addition de deux flux DISTINCTS sur une ligne, et accumulation d'un flux (`reduce` / `+=`).
    Volontairement PAS attrapé : la simple LECTURE d'un champ, qui est légitime.
  - **Assertion anti-désarmement** : la liste des champs surveillés est explicite (le type ne
    distingue pas un flux d'un solde), donc le test EXIGE que chaque nom existe encore dans
    `ProjectionChartPoint` — un renommage moteur casse le test au lieu de vider le garde en silence.
  - ⚠️ **Piège rencontré à l'écriture** : la première version cherchait l'échappatoire sur la ligne
    STRIPPÉE de ses commentaires — donc jamais trouvée, donc toutes les exemptions ignorées en
    silence. Attrapé par son propre test au premier lancement.

## ✅ Session 2026-08-05 (suite) — V7 sécurité serveur + sync (PR #566)

- [x] **`[FINTABLE-SYNC-STALE-BASE]`** ✅ 2026-08-05 (PR #566 ; M, résiduel ASSUMÉ de #545) — une
  passe de sync appliquait ses payloads sur un snapshot capturé AVANT le fetch réseau (plusieurs
  secondes). Une saisie manuelle faite pendant cette fenêtre atterrissait dans le store mais pas
  dans le snapshot : le patch touchant `transactions`/`initialBalances` réécrivait un tableau
  reconstruit sans elle → **saisie perdue en silence**. Le verrou de sync ne protégeait que contre
  une autre PASSE, jamais contre l'utilisateur.
  - **Navigateur** : `runFintableBrowserSync` relit l'état via `getFreshState` juste avant
    `applyPayloadsIsolated`, et rend désormais un `statePatch` DÉJÀ calculé (au lieu d'un
    `nextState` que l'appelant devait diffuser lui-même — les DEUX appelants prenaient la base
    d'avant le réseau). La faute n'est plus exprimable dans le type.
  - **Serveur** (`runFintableSync`) : sur conflit OCC, une re-tentative UNIQUE ré-applique les mêmes
    payloads sur l'état frais au lieu de jeter toute la passe. Rien n'était corrompu (l'OCC faisait
    son travail), mais sur un cron quotidien une collision coûtait une journée de fraîcheur —
    exactement le symptôme vécu par Marc.
  - **La bascule anti-doublon reste dérivée de l'état PRÉ-fetch, à dessein** : la vraie protection
    est la déduplication par clé de `applyDocument` à l'application (donc contre la base fraîche) ;
    re-dériver la bascule n'aurait fait que FILTRER des transactions légitimes en plus.
  - Test DISCRIMINANT prouvé : le faux client mute l'état pendant son `await` (Marc qui tape pendant
    que ça tourne) ; le test échoue sur le code d'avant, les 13 autres passent.
- [x] **`[MCP-CLOUDRUN-AUTH-HARDENING]`** ✅ 2026-08-05 (PR #566 ; les 2 volets restants) —
  `POST /oauth/authorize` était le seul endroit du serveur comparant une clé SAISIE (donc devinable :
  `/oauth/token` exige un code signé HMAC), et il était sans plafond : `FINANCEAI_ACCESS_KEY` était
  attaquable au débit que la machine servait. Livré : `mcp/auth/rateLimit.ts` (module pur, horloge
  injectable) — **8 échecs / 15 min → 429 + `Retry-After`**.
  - On compte les **ÉCHECS**, jamais les succès → une autorisation réussie remet le compteur à zéro
    et l'usage légitime de Marc ne consomme aucun quota.
  - Compteur **GLOBAL, pas par IP** : derrière le load balancer, `X-Forwarded-For` est en partie
    sous contrôle du client, donc une clé par IP aurait donné une illusion de protection. Sur un
    service mono-utilisateur, un plafond global est plus strict ET plus honnête.
  - Limite ASSUMÉE et documentée : compteur en mémoire → un cold-start Cloud Run le remet à zéro
    (même compromis que `consumedJti`). Ralentit massivement une attaque soutenue, ne prétend pas
    à une garantie distribuée.
  - **Runbook de rotation `FINANCEAI_OAUTH_SIGNING_KEY`** (kill-switch d'incident) écrit dans
    `mcp/README.md` : nouvelle version de secret → redéploiement → vérification 401 sur l'ancien
    Bearer → désactivation de l'ancienne version.

## ✅ Session 2026-08-05 — observabilité de l'import + V6 fiscal (PR #560 → #564)

> Six items livrés dans la journée, chacun mergé avec gate vert et panel adversarial.
> Deux d'entre eux sont nés d'une ERREUR de Claude ou d'un incident vécu par Marc, pas d'un audit.

- [x] **`[MCP-NETINCOME-MISLEADING]`** ✅ (PR #560) — le `netIncome` de `get_tax_situation` additionnait
  le salaire net ET le rendement de placement ESTIMÉ (12 970 $ chez Marc), jamais encaissé. En le
  comparant à ses dépôts de paie réels, Claude a annoncé à Marc un écart de salaire de 12 800 $/an
  **INEXISTANT** (vrai écart : 4 491 $, expliqué par la progression de ses paies 368 → 839 $/sem ;
  son 60 000 $ saisi est bon à 2,4 % près). C'est MARC qui a demandé la contre-vérification.
  Ajout de `netSalaryIncome`/`netSalaryMonthly` (brut − impôt − cotisations) = la trésorerie réelle,
  validée à 0,5 % contre 12 mois de dépôts (39 654 prédits vs 39 848 mesurés) + mise en garde
  explicite dans la note du tool. Leçon CONVENTIONS : un agrégat non étiqueté fabrique de faux
  diagnostics, y compris chez Claude ; le no-fake-data vaut aussi pour les tools qui nourrissent une IA.
- [x] **`[FINTABLE-STALE-ALERT]`** ✅ 2026-08-05 (PR #561) — l'import gelé est désormais VISIBLE.
  Module PUR partagé `services/fintable/syncHealth.ts` (`computeSyncHealth` : ok/stale/error/never),
  consommé par l'UI **et** le MCP (source unique — la divergence app/MCP est précisément ce qui a
  produit [MCP-NETINCOME-MISLEADING] le même jour). Seuil de gel **ADAPTATIF** dérivé de la cadence
  réelle (médiane des écarts entre jours d'activité × 3, borné 3–14 j) : ⚠️ un seuil FIXE de 7 j
  n'aurait alerté Marc qu'à J+8 alors qu'il a constaté le gel à J+5 — mesuré, l'alerte serait
  arrivée APRÈS lui. Sur son profil (activité quotidienne) le seuil tombe à 3 j → alerte à J+4.
  Livré : bannière Accueil `SyncStaleBanner` (silencieuse en mode démo et si l'import n'a JAMAIS
  été configuré — on alerte sur une CHUTE, pas sur une absence) + `syncHealth` exposé dans
  `get_financial_overview` (ce qui manquait pour diagnostiquer à distance le 2026-08-05).
  14 tests dont le REJEU de l'incident (passe « réussie » + 0 transaction = le vert trompeur).
- [x] **`[ENG-TAXDEC-NAN-GUARD]`** ✅ 2026-08-05 (PR #563 ; S, résiduel panel #558, pré-existant) — `taxDecember.ts` : le
  clamp `Math.max(-100000, x)` du solde d'avril ACTIF ne protège pas contre NaN
  (`Math.max(-100000, NaN) === NaN`, prouvé par exécution avec `inflationFactor = 0`) → un NaN
  amont traverse jusqu'à FluxImpots/totalTaxesPaid sans trace, malgré l'apparence de garde-fou.
  La branche RETRAITÉE a déjà `Number.isFinite(reconciliation)` — appliquer le même pattern
  (`gisMonthlySafe` l.365) au site actif + log. Non introduit par #558 (structure préexistante).
- [x] **`[ENG-TAXDEC-FLOOR-INDEX]`** ✅ 2026-08-05 (PR #563 ; S, MOYEN, pré-existant — panel #558) — le plancher
  `-100 000 $` du solde d'avril est NOMINAL et jamais indexé alors que le flux l'est → à 30 ans
  (facteur 1,81) le seuil réel effectif tombe à ~−55 k$ ; la retenue 100 % fait mordre le clamp
  dès ~600 k$ de brut + grosses déductions (mesuré). La troncature est maintenant JOURNALISÉE
  (#558) ; reste à indexer le plancher sur `ctx.inflationFactor` (les 2 sites, actif + retraité).
- [x] **`[FISC-STACK-GAINS-DIV]`** ✅ 2026-08-05 (PR #564 ; S, MOYEN [CONFIRMÉ par lecture + mesure] — V6) — gains (`taxDecember.ts:703`)
  et dividendes (`:737`) empilés CHACUN sur la même base → bande commune facturée 2× au taux bas
  (mesuré : −1 346 $/an sur base 100k/gains 30k/div 15k). Mord un retraité à gros non-enregistré.
- [x] **`[FISC-DTC-ABATEMENT-ORDER]`** ✅ 2026-08-05 (PR #564 ; S, MOYEN [CONFIRMÉ par lecture + mesure] — V6) — le CID fédéral est
  soustrait APRÈS l'abattement QC 16,5 % (`taxDecember.ts:734-739` + `tax.ts:906-907`) alors que
  BPA/âge sont avant → sur-crédit de 16,5 % du CID (+49 $/an profil Marc, +308 $ à 9 k$ div).

## ✅ Incident jeton Fintable (PR #559 `bbd6bda`, mergée 2026-08-05)

- [x] **`[FINTABLE-TOKEN-PERSIST]`** ✅ (PR #559, cause racine trouvée par MARC) — le jeton Fintable
  n'était écrit que dans le store MÉMOIRE, jamais dans le coffre chiffré → perdu au reload → import
  bancaire gelé 5 jours, sync « jeton absent » en boucle, zéro alerte. Persistance `saveApiKeys` sur
  TOUTES les sorties du champ (blur + `visibilitychange:hidden` + `pagehide` + démontage), canal
  d'alerte SÉPARÉ (`persistError` + régions ARIA nommées) + `logError` durable, écritures
  SÉRIALISÉES (le blob périmé pouvait gagner). 15 tests (7 nouveaux, discriminants).
  ⚠️ Panel : NO-GO des 2 agents sur le premier jet (blur seul) — le fix violait la leçon qu'il
  portait ; tout corrigé dans la PR. Méta-leçon aux CONVENTIONS. La piste « fin d'essai Fintable »
  était un LEURRE de timing. Reste ouvert (distinct) : `[FINTABLE-STALE-ALERT]`.

## ✅ V5d — retenue employeur 100 % (PR #558 `14e079a`, mergée 2026-08-05)

- [x] **`[FISC-WHT-92PCT]`** (GO Marc Q2) ✅ (PR #558) — retenue employeur = 100 % de l'impôt sans
  déductions (`taxDecember.ts`, l'ancien ×0,92 non sourcé facturait ~8 % en double chaque avril).
  Fondement TP-1015.F/T4032-QC + preuve d'auto-cohérence avec `calculateNetFromGross`
  (FISCAL_REFERENCE §9). Mesuré : salarié référence ttp 106 915 → 57 723 (−1 243,23 $/an réel),
  NW +7 à +14 % selon profil ; retraités-au-départ bit-identiques ; actif→retraite +21,5 % NW.
  Panel 4 agents (GO ×3, NO-GO silent-failure résolu en PR : plancher −100 000 $ journalisé + test
  qui l'exerce, ablation prouvée). 4 gardes réancrées (dont FA-10 re-réancrée SOUS la saturation
  RAMQ — leçon 2e ordre) + invariant T1213 ON ≡ OFF sans déductions. Tickets dérivés au vivant :
  [ENG-T1213-NET-MONTHLY], [ENG-TAXDEC-FLOOR-INDEX], [ENG-TAXDEC-NAN-GUARD],
  [ENG-NET-MODEL-RESIDUAL].


# (Contenu intégral du BACKLOG au 2026-07-31, avant refonte)

# BACKLOG — FinanceAI (actionnable)

> Liste **courte** de ce qui RESTE à faire. L'historique complet des items livrés est
> archivé dans [`docs/HISTORIQUE.md`](HISTORIQUE.md) (fusion de tous les snapshots/audits/designs livrés).
> Audit qualité détaillé : voir `docs/HISTORIQUE.md` (section `AAA_AUDIT_2026-06.md`).
> Actions humaines (Marc) : [`docs/A_FAIRE_MOI.md`](A_FAIRE_MOI.md).

## 🔎 Chantier « analyse des transactions » (cadrage validé Marc 2026-07-31, 27 questions — 3 PR)

> Demande verbatim : « je veux une meilleure analyse de mes transactions […] ça detecte mal mes
> transferts entre comptes ça met abonnement pour tout et nimporte quoi je veux du précis ».
> **Critère d'arrêt (Marc)** : moins de **1 % de transactions mal classées, mesuré sur 300 tirages**
> (revue d'échantillon DANS l'app — Marc a refusé de fournir un export de référence, donc la mesure
> doit être un outil de l'app, pas un jeu de test hors ligne).
> **Décisions Marc** : marquage des virements AUTOMATIQUE · la re-catégorisation peut ÉCRASER une
> catégorie existante, SAUF une correction manuelle (verrou par transaction, PAS de règle par
> marchand) · écran de tri dans l'onglet Transactions · moteur HYBRIDE règles + IA, « vraiment précis
> pas sur des mots bateau » · passe IA sur tout l'historique · catégories à plat, jeu actuel OK ·
> abonnement = service RÉCURRENT (achat unique chez un marchand d'abo → Loisirs) · abos fantômes oui.
> **Comptes de Marc** : PCA = compte courant, TS1 = épargne, Mastercard = crédit, + placements.

- [x] **`[TX-TRANSFERS]`** ✅ (2026-07-31, PR 1/3) — appariement des virements internes SORTI de
  `services/fintable/` vers un cœur générique `services/transactions/detectTransfers.ts` (montants
  exactement opposés au cent, ≤ 3 jours, comptes DIFFÉRENTS, appariement 1:1 sur la contrepartie la
  plus proche, Interac exclu par règle métier). Fintable délègue au cœur en gardant sa contrainte de
  rôles via la garde `canPair` → une seule copie de l'algorithme. Appliqué automatiquement à l'import
  (`App.tsx`, sur l'historique COMPLET : les deux côtés peuvent venir de deux imports différents) +
  panneau « Virements internes » (`components/transactions/TransfersPanel.tsx`) pour le rattrapage et
  la confirmation. **Deux régimes** : `confirmed` (comptes connus et différents → marqué d'office) vs
  `suggested` (compte inconnu d'un côté → jamais écrit). `accountName` désormais émis PAR TRANSACTION
  (Fintable n'en émettait aucun). 19 tests dédiés, suite complète verte (3352).
- [x] **`[TX-CATEGORIZE]`** ✅ (2026-07-31, PR 2/3) — catégorisation précise. **Cause racine mesurée** : la règle
  « Abonnements » (`services/import/categoryRules.ts:115`) décide sur le LIBELLÉ seul (`GOOGLE \*`,
  `MICROSOFT`, `APPLE\.COM`, `\bBELL\b`) et passe AVANT Santé/Loisirs/Magasinage → un accessoire
  Apple, un jeu Xbox et un achat Google Play tombent tous en « Abonnements ». Or la décision de Marc
  (achat unique chez un marchand d'abo → Loisirs) rend le libellé structurellement insuffisant :
  il faut un **profil de récurrence par marchand** (nb d'occurrences, régularité, stabilité du montant)
  calculé AVANT de décider, puis règles précises, puis IA sur le reste avec ce contexte.
  **Livré** : `merchantProfile.ts` (profil de récurrence pur) + `contextualCategorize.ts` (promotion
  en « Abonnements » réservée aux marchands AMBIGUS que le profil prouve) + `AMBIGUOUS_SUBSCRIPTION_RULES`
  (Google Play / App Store / Microsoft / YouTube / Twitch / Patreon / Steam / PlayStation / Nintendo →
  Loisirs par défaut) + bouton « Tout recatégoriser » (historique complet, verrou `status === 'manual'`).
  **PR 3 livrée** : `[TX-REVIEW]` — `services/transactions/reviewSample.ts` (tirage seedé déterministe,
  intervalle de WILSON, verdict « indéterminé » tant que l'intervalle chevauche le seuil) + panneau
  « Mesurer la qualité du classement ». ⚠️ **Le « 300 tirages » du cadrage est INTENABLE** : à 300
  jugements sans aucune erreur, la borne haute reste à 1,26 % — il en faut **390**, et la constante est
  DÉRIVÉE du calcul (`samplesNeededForThreshold`), jamais re-tapée.
- [x] **`[TX-INTERAC-BUDGET]`** ✅ (2026-07-31, PR 2/3) — Marc veut qu'un Interac à sa conjointe
  compte comme une **vraie dépense**, mais « Remboursement » est dans `NON_BUDGET_CATEGORIES`
  (`utils/budgetSync.ts:16-26`) → aujourd'hui ces montants sont invisibles au Budget (ni dépense, ni
  revenu). ⚠️ Le sortant et l'entrant ne sont pas symétriques : compter le sortant en dépense sans
  traiter l'entrant (« on me rembourse ») surévaluerait les dépenses. Design proposé : poste à part
  entière, l'entrant venant en crédit du même poste.
- [x] **`[TX-SUBSCRIPTIONS]`** ✅ (2026-07-31, PR 3/3) — abonnements fantômes (hausse de prix silencieuse, service qui
  a cessé d'être débité, coût annuel réel). Repose sur le profil de récurrence de la PR 2. ⚠️ L'actuel
  détecteur heuristique (`components/Planning.tsx:55`) exige ≥ 2 occurrences, montant stable à ±5 $ et
  20-40 jours d'écart : un abo dont le prix monte de 3 $ finit par sortir de la liste.

---

## 🏦 Chantier FINTABLE — sync bancaire & investissements (cadrage validé Marc 2026-07-29, 14 questions)
> ADR complet : `docs/adr/` § « Sync bancaire & investissements via Fintable ».
> Décisions verrouillées : Fintable = PRODUCTEUR de `DocumentPayload` (aucun nouveau moteur de fusion —
> `applyDocument` couvre déjà `bank_statement` / `broker_statement` / `cash_balance`) ; exécution SERVEUR
> (Cloud Run, cron quotidien) jamais navigateur ; jeton lecture seule en Secret Manager ; écriture via
> `runApply` (OCC + sauvegarde horodatée) ; import manuel CONSERVÉ mais masqué ; tools MCP existants INCHANGÉS.

- [x] **`[FINTABLE-0]` ADR + jeton en Secret Manager** (S) — ✅ 2026-07-29. Jeton `financeai-fintable-token`
  créé par Marc (scope lecture seule). ⚠️ Incident : le 1ᵉʳ jeton (read+write) avait été collé en clair dans
  un chat → RÉVOQUÉ et remplacé avant tout usage. Découverte de cadrage qui RÉDUIT le chantier : la chaîne
  d'ingestion existante couvre déjà toute la fusion → le travail restant est un lecteur + un mapper pur,
  pas un pipeline (classe `R2-FIRE` : vérifier l'état RÉEL avant de coder).
- [x] **`[FINTABLE-1]` Lecteur → `FintableSnapshot` normalisé** (M) — ✅ 2026-07-29. Forme de l'API
  **VÉRIFIÉE** (docs officielles fournies par Marc → ADR mis à jour). `services/fintable/` : `types.ts`
  (formes brutes + modèle normalisé + `FintableError` à code typé transitoire/confirmé), `decode.ts`
  (décodage STRICT), `client.ts` (Bearer, enveloppe, pagination par curseur, 429 + `Retry-After`,
  timeout couvrant la LECTURE DU CORPS), `readSnapshot.ts` (orchestration, pannes partielles tracées).
  `npm run fintable:dry` (montants MASQUÉS par défaut → sortie partageable ; `--show-amounts` en local).
  50 tests. ⚠️ Le dry-run RÉEL doit être lancé par Marc (`fintable.io` inatteignable depuis l'exécution
  cloud) → routé dans `A_FAIRE_MOI.md`.
- [x] **`[FINTABLE-1b]` Docteur « pourquoi ma donnée n'arrive pas »** (S) — ✅ 2026-07-29, né du 1ᵉʳ
  dry-run réel : 3 comptes de placement, **0 position**, et AUCUNE erreur (les appels ont réussi en
  rendant des listes vides). Un vide sans explication est la classe « staleness silencieuse » → lire
  l'état du COMPTE, pas les données. `readDiagnostics.ts` (`/me` droits du plan, `/connections` santé +
  historique de sync, `/integrations`) + `explainMissingData` (raisonnement PUR, testable sans réseau) +
  `npm run fintable:doctor`. Défauts prudents : `can_sync`/`healthy` absents → `false` (un docteur
  optimiste écarte la cause la plus probable). 16 tests.
- [x] **`[FINTABLE-2]` Mapper pur `snapshot → DocumentPayload[]` + aperçu** (M) — ✅ 2026-07-29
  (GO Marc : « je paie, on finit le Lot 2 sans les positions »). `services/fintable/mapSnapshot.ts`,
  fonction PURE (aucun réseau, aucune écriture) → `bank_statement` + `cash_balance` + `debt`.
  ⚠️ **Piège money-critical trouvé en LISANT le vrai code de dédup** : `txnKey` porte sur
  `date|montant|PAYEE`, or le payee de Fintable (`merchant`/`description`) ne sera JAMAIS la même
  chaîne que celui extrait des relevés PDF importés à la main → même dépense, clé différente,
  **doublon accepté en silence** qui fausserait `computeStartingCash` ET les dépenses réelles du
  Budget. La fenêtre Fintable (30 j) RECOUVRE l'historique manuel : risque réel, pas théorique.
  Parade = **date de bascule** (`transactionsAfter`, strictement postérieur) — pas de recouvrement,
  donc aucune dépendance à la dédup ; la dédup reste la ceinture. Autres garde-fous : rôle de compte
  toujours EXPLICITE (un compte sans rôle est signalé, jamais rangé par défaut) ; liquidités en
  **tout-ou-rien** (un seul solde manquant suspend la mise à jour — `cash_balance` écrit un DELTA,
  une cible partielle déplacerait le cash en silence) ; solde de carte négatif → `Math.abs` + alerte
  (une dette négative gonflerait le patrimoine) ; devise ≠ CAD écartée et signalée, jamais empilée ;
  dette en mise à jour de SOLDE seulement (ni taux ni paiement minimum inventés → elle doit préexister).
  Aperçu via `npm run fintable:dry -- --roles <fichier.json> --after YYYY-MM-DD` (+ `--show-ids`
  pour construire le fichier ; `.fintable-roles.json` est gitignoré — il contient des ids de comptes).
  16 tests dédiés, dont le scénario réel à 6 comptes. **Volet positions ABANDONNÉ** : Disnat n'est pas
  couvert par SnapTrade chez Fintable (mesuré sur l'annuaire public) — les soldes des comptes de
  placement servent de valeur de RÉFÉRENCE du courtier, jamais de source d'actifs.
- [x] **`[TX-DUPLICATES]` Détection de doublons (demande Marc « enlève les transactions en double »)** (M)
  — ✅ 2026-07-29. **Constat qui a motivé le lot** : `Transaction.isDuplicate` était RESPECTÉ partout
  (exclu de `computeStartingCash`, du Budget, des revenus, du patrimoine) mais **rien ne le mettait
  jamais à `true`** — `parseBankCsv` l'initialise à `false`, personne ne le change ensuite ; et le
  filtre « afficher les doublons » était du code MORT (`_setShowDuplicates` jamais appelé, le `_`
  l'exemptant du lint — classe `DETTE-DEADCODE`). La machinerie d'exclusion existait sans personne
  pour l'alimenter. `services/transactions/duplicateDetection.ts` (PUR) : regroupement par **montant
  exact + date proche** (tolérance 0/1/3 j), le **libellé n'entre PAS dans le critère** — c'est
  justement quand il diffère (deux sources d'import) que la dédup `txnKey` laisse passer le doublon.
  ⚠️ **On MARQUE, on ne SUPPRIME pas** (ADR « Suppressions via MCP/IA » : le cash est dérivé →
  une suppression déplacerait le solde en silence) et **aucun marquage automatique** (deux dépenses
  identiques le même jour sont un vrai faux positif → l'humain valide). Marquage réversible.
  `components/transactions/DuplicatesPanel.tsx` + toggle `showDuplicates` ressuscité. 18 tests.
- [x] **`[FINTABLE-TRANSFERS]` Paiement de carte reconnu comme virement** (S) — ✅ 2026-07-29, trouvé en LISANT l'aperçu réel : importer les deux côtés compte↔carte ferait compter le paiement mensuel comme une dépense EN PLUS des achats (`budgetSync.ts:58` somme les négatifs hors transferts). Le patrimoine reste juste (soldes recalés) — seul le BUDGET mentirait, donc aucun invariant de conservation ne l'attrape. `detectTransfers.ts` : montants exactement opposés + rôles différents (cash→dette) + dates proches + appariement UN POUR UN, déterministe. 13 tests.
- [x] **`[FINTABLE-3]` Cron quotidien Cloud Run** (M) — ✅ 2026-07-29. `mcp/runFintableSync.ts` (orchestrateur :
  lecture Fintable → mapper Lot 2 → `applyDocument` → écriture ATOMIQUE `store.save(next, version)`, patron
  EXACT de `runPriceRefresh`/HUB-REFRESH-CRON). `POST /fintable-sync` dans `mcp/http.ts` (secret DÉDIÉ
  `FINANCEAI_FINTABLE_SYNC_SECRET`, distinct de `FINANCEAI_REFRESH_SECRET` — périmètre différent, autorise
  l'écriture de tx/soldes réels). Cadence 1×/jour (choix Marc), déclencheur `.github/workflows/fintable-sync.yml`
  (gratuit, même mécanique que `refresh-prices.yml`). Date de bascule anti-doublon **DÉRIVÉE À CHAQUE PASSE**
  (`deriveCutoverDate` — la transaction la plus récente déjà connue, jamais une valeur figée à maintenir).
  Rapport `AppState.fintableSyncReport` **TOUJOURS écrit** (succès ou échec — comptes vus, tx ajoutées, virements
  détectés, cash/dettes MAJ, avertissements, erreur) → carte « Sync Fintable » dans Système & diagnostics, visible
  sans notification proactive (choix Marc). Conflit OCC = transitoire (relancé tel quel, PAS de rapport d'échec,
  le prochain tick réessaie) ; panne réelle Fintable/Drive = rapport d'échec persisté + 5xx (le cron GitHub rougit).
  20 tests (`deriveCutoverDate` 4 + `runFintableSync` 10 + carte UI 6). `parseRolesJson` extrait en module
  PARTAGÉ (`services/fintable/rolesConfig.ts`) consommé par `fintable:dry` ET le serveur — zéro copie qui dérive.
  ⚠️ **Panel de 7 agents (code-reviewer, silent-failure-hunter, financial-integrity, security-privacy,
  projection-validator, documentation-manager, a11y-auditor) sur cette même PR : 6 findings VRAIS corrigés**
  (tous mesurés/vérifiés) — voir le bloc de leçons `[FUTUR-PAST-DEBT-FREEZE]` dans `CLAUDE.md` pour le détail :
  isolation par payload dans la boucle d'application (un solde de dette 0 bloquait TOUTE la sync), bascule
  plafonnée à aujourd'hui (une transaction future gelait la sync à `transactionsAdded:0` en silence), lecture
  d'état initiale déplacée DANS le bloc protégé (garantit le rapport « toujours écrit » même si `getWithVersion`
  échoue), montant $ retiré d'un message d'avertissement (fuyait en clair dans les logs GitHub Actions),
  `fintableSyncReport` ajouté à `DEFAULT_APP_STATE` (sinon survivait au switch de persona démo), carte UI
  durcie contre une forme corrompue (`Array.isArray` + `logError`, jamais un crash de render).
- [x] **`[FINTABLE-4]` Import manuel répliqué et masqué** (S) — ✅ 2026-07-29. CONSERVÉ intégralement comme
  repli (Q1) : `ImportBankStatement` reste pleinement fonctionnel (même composant, même pipeline
  `parseBankCsv`/`applyDocument`), rien retiré. Déplacé hors du flux principal : le bouton du header
  `Transactions.tsx` (toujours visible dans les actions de la `PageHeader`, donc « dans » le flux principal
  au sens propre) est remplacé par une disclosure `<details>` native (convention établie, cf
  `AdvancedProjectionParams`/`HistoryCoverageNote`) — **repliée par défaut** dès qu'il y a des transactions
  (Fintable synchronise déjà le quotidien), **ouverte automatiquement** à l'onboarding (0 transaction, D2 —
  l'écran vide reste jamais une impasse). L'instance de Réglages → Comptes (`AccountsSection.tsx`) était déjà
  hors du flux principal, INCHANGÉE. Le formulaire de courtage (`ImportBrokerPositions`, `Investments.tsx`)
  reste au premier plan — c'est le SEUL chemin pour les positions (FINTABLE-POSITIONS : Disnat hors SnapTrade).
  Panel ciblé de 3 agents (code-reviewer, a11y-auditor, silent-failure-hunter — pur diff UI, pas de calcul $) :
  ZÉRO finding bloquant. Confirmé empiriquement : `aria-expanded` retiré n'est pas une régression (le rôle
  natif `<details>/<summary>` expose déjà l'état à l'arbre d'a11y) ; `text-ink-300` du summary passe AA/AAA
  sur les 3 fonds sombres (6,93-7,77:1, mesuré) ; `open={transactions.length===0}` ne fige qu'UNE transition
  (true→false au 1er import, jamais recontesté ensuite — comportement voulu, pas un bug de contrôle React).
  1 finding non-bloquant routé au BACKLOG (`[A11Y-DETAILS-TAP-TARGET]`, ci-dessous — pré-existant, pas
  introduit par ce diff).
  3 tests mis à jour (`Transactions.import.test.tsx`) : discriminant sur l'attribut `open` de `<details>`,
  PAS `queryByText` (jsdom ne cache pas le contenu d'un details fermé, cf leçon `[[INVEST-CHART-CLEAN]]`) —
  et un `fireEvent.click` sur `<summary>` bascule bien `open` en jsdom (mesuré, pas supposé).
  ⚠️ **Découverte en chemin** : `text-info-300` est un token Tailwind INEXISTANT (palette `info` = 400/500/600
  seulement, cf `[[FIX-INK600-TOKEN]]`) — no-op silencieux, ~12 occurrences dans `components/` (corrigé
  seulement l'instance touchée par ce diff, `Transactions.tsx:436`) → nouvel item `[A11Y-INFO300-SWEEP]` ci-dessous.
- [x] **`[FINTABLE-6]` Lot 1 — le montant du COURTIER fait autorité : fondation** (M) — ✅ 2026-07-30.
  Demande Marc : « je veux que dans investissements ça utilise exactement le montant que j'ai dans
  Fintable » + « que l'accueil utilise Fintable aussi ». **Constat en LISANT le code** : `investmentBalances`
  était calculé par `mapSnapshot` puis **JETÉ** — seul un compteur (`investmentReferenceCount`) survivait
  dans le rapport. Une donnée produite sans consommateur : rien à brancher, il fallait d'abord la stocker.
  Livré : (a) `FintableAccountRole.investment` porte un `taxRegime` OPTIONNEL (`CELI|REER|NON-ENREG`),
  **jamais inféré** — absent = solde affiché mais écart hors projection, SIGNALÉ (dégradation gracieuse,
  pas d'échec de passe) ; (b) `AppState.fintableBrokerBalances` (additif, zéro migration) clé sur
  `accountId` STABLE — jamais le libellé, renommable côté banque (classe `[[INVEST-ALLOC-GEO-SECTOR]]`) —
  + horodatage `at` pour afficher honnêtement la fraîcheur ; (c) `services/fintable/brokerBalances.ts`,
  module PUR source-unique de la réconciliation, consommé plus tard par Investissements ET Accueil (pas
  deux copies qui dérivent) ; (d) ajouté explicitement à `DEFAULT_APP_STATE` (leçon PERSONA-PURGE de la PR #531).
  **Granularité = le PANIER FISCAL, pas le compte** : les `Asset` ne portent pas d'id de compte courtier,
  seulement `accountType` → réconcilier par compte est structurellement impossible, c'est documenté et non subi.
  ⚠️ **Mon propre test a attrapé mon propre bug** : `Number.isFinite(Number(x))` ne protège PAS de `null`
  (`Number(null) === 0`) → un solde ABSENT devenait un **0 $ crédible** effaçant le compte du patrimoine.
  Exactement le piège `[[FINTABLE]]`, retombé dedans en l'écrivant. Garde null-explicite AVANT conversion,
  aux DEUX bouts (écriture + lecture d'un état Drive non validé par Zod). 19 tests.
- [x] **`[FINTABLE-7]` Sync Fintable DEPUIS LE NAVIGATEUR — réseau + runner** (M) — ✅ 2026-07-30.
  Demande Marc : « je veux que tu fasses tout toi, sans que j'aie besoin de t'aider ». **Mesuré avant
  de décider** : `gcloud` ABSENT du conteneur, aucun identifiant GCP, `fintable.io` = 403 CONNECT
  (politique réseau), aucun outil MCP pour créer un secret GitHub → le chemin Cloud Run exige
  IRRÉDUCTIBLEMENT les identifiants de Marc (3 secrets + redeploy + secret Actions). Le chemin
  navigateur ne demande QUE de coller le jeton dans Réglages. Livré : (a) proxy same-origin
  `/api/fintable/:path*` → `fintable.io/api/v2/*` (`vercel.json` + `server.proxy` vite dev/preview),
  patron EXACT de Yahoo → `connect-src 'self'` couvre, **zéro domaine ajouté à la CSP** ; (b)
  `apiKeys.fintable` (optionnel, même traitement que les autres clés) ; (c) `AppState.fintableRoles`
  — remplace le fichier `.fintable-roles.json` que Marc devait écrire à la main puis pousser en secret
  GCP ; (d) `services/fintable/browserSync.ts` qui RÉUTILISE tel quel lecteur/mapper/`applyDocument`/
  `toPersistableBrokerBalances` (zéro logique dupliquée — seuls le transport et le porteur d'état
  changent), avec les MÊMES garanties que le cron : rapport toujours rendu, isolation par payload,
  bascule plafonnée à aujourd'hui, et `nextState: null` sur échec (jamais d'état à moitié appliqué).
  Garde de parité au COMPILE entre le rôle PERSISTÉ (`types.ts`, sans dépendance) et le rôle du
  MAPPER (pur) — les deux formes sont volontairement séparées, leur divergence casse le typecheck.
  ⚠️ **Compromis assumé, dit dans la PR** : le jeton vit dans le navigateur et transite par l'edge
  Vercel (vs Secret Manager) — scope LECTURE SEULE, ce qui borne le risque ; et ça ne tourne pas
  application fermée. Le cron serveur reste en place, prioritaire si Marc monte la config un jour. 7 tests.
- [x] **`[FINTABLE-7]` Lot 2 — UI Réglages : coller le jeton + assigner les rôles par clic** (M) — ✅ 2026-07-30.
  `components/settings/FintableSyncCard.tsx`, rendue dans **Réglages → Clés API** (sous-onglet
  `integrations`, `Settings.tsx`). Bouton « Tester » qui liste les comptes réels (sans pager les
  transactions ni les positions), puis un rôle par compte (liquidités / dette + nom EXACT / placement
  + régime / ignorer). Marc a dit « c'est tout non enregistré pour le moment » → « Placement »
  pré-remplit `NON-ENREG`. ⚠️ **AUCUN montant rendu** par la carte (verrouillé par test) → pas de
  surface à garder en mode discret. Sync coupée en mode démo. Échec de passe → seul le RAPPORT est
  écrit. L'état est écrit par **delta de référence** (jamais une liste de clés à la main : la 1ʳᵉ
  version perdait déjà `lastUpdate`). 8 tests.
- [x] **`[FINTABLE-BROWSER-RELATIVE-BASE]` « url invalide » alors que Marc collait un JETON** — ✅ 2026-07-30.
  `buildUrl` faisait `new URL(base + path)` à UN argument (exige une URL absolue) → `TypeError: Invalid
  URL` sur la base relative du proxy navigateur `/api/fintable`. Résolue contre `location.origin` ;
  chemin cron bit-identique (`new URL(absolue, undefined)` ignore le 2ᵉ argument). ⚠️ Cause du trou de
  test : les 7 tests `browserSync` injectaient tous un client factice → le chemin PAR DÉFAUT (celui de
  la prod) n'était exercé nulle part. 3 tests ajoutés sans injection, discriminant prouvé.
- [x] **`[FINTABLE-BROWSER-FETCH-RECEIVER]` « échec réseau (TypeError) » avec un jeton valide** — ✅ 2026-07-30.
  `this.fetchImpl = opts.fetchImpl ?? fetch` puis `this.fetchImpl(...)` fait de `this` l'INSTANCE au
  lieu de `window` → le binding WebIDL lève `Illegal invocation`. MESURÉ dans un vrai Chromium (sonde
  Playwright), pas déduit. Fix = wrapper. ⚠️ jsdom/undici n'appliquent pas la règle → le garde SIMULE
  la vérification de récepteur. Grep de la classe : instance unique dans le dépôt.
- [x] **`[FINTABLE-7]` Lot 3 — déclenchement AUTOMATIQUE de la passe à l'ouverture** (S) — ✅ 2026-07-31.
  `services/fintable/autoSync.ts` (`maybeRunDailyFintableSync`) : gardes = jeton présent + PAS mode test +
  dernière passe RÉUSSIE ≥ 24 h (un ÉCHEC ne gèle pas 24 h — c'est le cooldown de TENTATIVE 1 h,
  device-local, qui borne les retries anti-boucle-F5) + mutex en vol. Déclenché par un effet App RÉACTIF
  au jeton (hydraté async depuis le coffre — un timer au boot lirait un store vide). Patch d'état par
  `referenceDeltaPatch` (`applyStatePatch.ts`), EXTRAIT de FintableSyncCard au moment du 2ᵉ consommateur
  (une seule copie). Échec → seul le rapport est persisté (diagnostics), pas de toast anxiogène quotidien ;
  succès avec transactions → toast discret (compte, jamais de montant). 15 tests.
  **Panel #545 (3 agents — 5 vrais findings, tous corrigés même PR)** : (1) CRITIQUE code-reviewer —
  AUCUNE exclusion mutuelle auto↔manuel (2 passes concurrentes sur bases figées = dernier-écrivain-
  gagne sur transactions/soldes) → verrou PARTAGÉ `acquireFintableSyncLock` consommé par les deux
  chemins ; (2) ÉLEVÉ security-privacy PROUVÉ PAR SONDE — TOCTOU `isTestMode` : basculer en démo
  PENDANT le fetch écrivait de VRAIES transactions dans la session persona (inverse de PERSONA-PURGE)
  → re-check FRAIS avant TOUTE écriture (contenu ET rapport), les 2 chemins ; (3) ÉLEVÉ silent-failure
  — un coffre avec le jeton Fintable SEUL (ni Anthropic ni Finnhub) n'était JAMAIS restauré au boot
  (`App.tsx` gate `anthropic||finnhub`) → jeton perdu à chaque reload, feature neutralisée en silence
  → `|| fintable` ajouté ; (4) « ne LÈVE jamais » était faux (throw importWithRetry → unhandledrejection)
  → catch + outcome 'error' + rapport d'échec écrit ; (5) debounce 3 s de l'effet (jeton tapé
  caractère par caractère → passe avec jeton incomplet). Discriminants = sondes des agents (code non
  encore mergé au moment des fixes, leçon AITOOLS-B).
- [ ] **`[FINTABLE-SYNC-STALE-BASE]`** (M, résiduel code-reviewer + security-privacy #545, ASSUMÉ) —
  une passe de sync (auto ou manuelle) calcule son `nextState` sur un snapshot capturé AVANT le fetch
  réseau (plusieurs secondes) : une ÉDITION manuelle d'une transaction pendant cette fenêtre peut être
  écrasée par le patch (dernier-écrivain-gagne sur les clés que la sync touche). Le verrou #545 exclut
  les passes ENTRE ELLES, pas sync-vs-édition. Vrai fix = séparer fetch et application (ré-appliquer
  `applyPayloadsIsolated` sur l'état FRAIS au moment de l'écriture). Sœur : le cooldown localStorage
  n'est pas un mutex CROSS-ONGLET (2 onglets bootant en même temps peuvent courir tous les deux —
  fenêtre étroite, même jeton, intégrité seulement).
- [x] **`[FINTABLE-6]` Lot 2 — consommer le montant courtier dans Investissements + Accueil** (M) —
  ✅ 2026-07-31. `BrokerReconciliationCard` (UNE implémentation, variantes `full` Investissements /
  `compact` Accueil — pas deux copies) : total par panier = solde COURTIER (autorité), ligne « écart
  (non ventilé) » explicite (Σ titres + écart == total courtier, reconstructible), badge de fraîcheur
  borné par la lecture la plus ANCIENNE (`fraîcheur inconnue` si un compte n'a pas d'horodatage),
  avertissements comptes sans régime déclaré / soldes illisibles. `holdingsCadByRegime`
  (`services/fintable/holdingsByRegime.ts`) DÉRIVE la famille fiscale de `BUCKET_OF` (source unique,
  même table que les piles de l'Accueil : CELIAPP→CELI, REEE→REER, MARGE/AUTRE/absent→NON-ENREG,
  CRYPTO hors réconciliation) et somme via `assetValueCad`. `formatRelative` extrait de SystemView
  vers `utils/relativeTime.ts` (consolidé AVANT la 2ᵉ copie). Ship dark sans sync Fintable ; purge
  persona par construction (`fintableBrokerBalances` ∈ DEFAULT_APP_STATE). 11 tests.
  **Panel #543 (4 agents — 5 vrais findings, tous corrigés même PR ; reconstructibilité et FX vérifiés
  EXACTS, résidu 0,0)** : (1) CRITIQUE convergent (3 agents, mesuré −171 k$) — la variante compacte
  rendait « 0 $ » d'autorité quand tous les comptes étaient non déclarés → état honnête sans montant
  (« N comptes sans régime déclaré ») + mention « + N compte(s) hors total » quand des comptes sont
  exclus d'un total affiché ; (2) valeur NÉGATIVE (quantité corrompue) écartée en silence avec un
  commentaire qui prétendait qu'assetValueCad la signalait (il ne loggue que NaN/devise) → tracée
  `logErrorThrottled` ; (3) a11y : `role=status/alert` sur les avertissements (ils apparaissent en
  cours de session via le polling Drive — WCAG 4.1.3) ; (4) `at ≤ 0` (horodatage corrompu encodé 0)
  affichait « vu jamais » et contaminait le panier via Math.min → traité inconnu à la lecture ;
  (5) doc : base carte = PRÉSENT (quote × quantité courantes) ≠ piles TOTAL_* (close daté × détention
  datée) — divergence VOULUE, documentée en tête de module pour la prochaine session.
- [x] **`[DASH-NETWORTH-CANONICAL]` L'Accueil est la SEULE surface qui recalcule le patrimoine** (M,
  diagnostic `financial-integrity` 2026-07-30, demande Marc « l'accueil fait aucun sens » / « je veux
  source unique ») — ✅ 2026-07-31. Le KPI « patrimoine global » lit désormais `presentNetWorth` =
  `computePresentNetWorth(initialBalances, transactions, assets, fxRates, debts) + équité immo`
  (MÊME expression que l'ex-repli sans CSV — le piège « computePresentNetWorth nu ferait CHUTER le
  patrimoine de l'équité immo » évité comme prévu au ticket), dans TOUS les cas — plus JAMAIS
  `latestTotals.Total` (dernier point d'un historique figé au dernier close, cash gated accountName).
  `latestTotals` retiré du memo (code mort dans le même diff, leçon DETTE-DEADCODE). Le GRAPHE et la
  variation restent sur l'historique (présent ≠ histoire, assumé — le KPI dit le présent comme toutes
  les autres surfaces). Discriminant : test avec historique PÉRIMÉ injecté (mock `usePortfolioHistory`)
  → l'ancien KPI affichait ~500 $, le nouveau 140 600 $ (rouge sur l'ancien code, prouvé git-stash).
  Restes du ticket NON couverts ici (symptômes 2-3, périmètre graphe/cartes — l'axe des dates, le
  cash `accountName`-gated de l'HISTORIQUE, les cartes vides) : l'essentiel (le chiffre-titre faux)
  est réglé ; le graphe historique est un chantier séparé si Marc le redemande.
  **Panel #544 (3 agents)** : silent-failure = 0 finding (le retrait du `Number(x)||0` CORRIGE même un
  masquage — NaN affichait « 0 $ », désormais « — ») ; code-reviewer → Variation étiquetée « (courbe
  historique) » + tooltip (sinon la classe « deux patrimoines à l'écran » revenait entre 2 KPIs
  adjacents) ; financial-integrity (MESURÉ, parité 203 800 $ exacte sur toutes les surfaces hors immo,
  double-comptage immo RÉFUTÉ) → F1 corrigé même PR : `rc` non amorcé sur les comptes venus des
  TRANSACTIONS (accountName Fintable/CSV ∉ initialBalances) → `point.Total` NaN → **Variation figée à
  0,00 % en permanence** (mesuré) — amorçage à 0 comme `runningCash` + test discriminant. F2-F4 → tickets ci-dessous.
- [ ] **`[DASH-IMMO-EQUITY-WRITERS]`** (M, finding financial-integrity #544 F2/F4, MESURÉ) — le terme
  « équité immo » du KPI Accueil est INERTE en prod : `RealEstateGoal.currentValue`/`mortgageBalance`
  n'ont AUCUN écrivain (aucune UI ne les édite — RealEstate.tsx ne les expose pas, PatrimoineExtended
  édite `RentalProperty`, un autre type) → `hasRealEstate` toujours false, l'étiquette « équité immo
  incluse » ne s'affiche jamais, et un propriétaire modélisé par `price`/`downPayment` a un KPI SANS sa
  maison pendant que le Futur l'inclut (mesuré : `Immobilier` 81 609 $ moteur vs 0 au KPI). Classe
  [[TX-DUPLICATES]] « champ que seuls des lecteurs référencent ». À trancher : brancher l'équité sur ce
  que le moteur/l'UI possèdent réellement, OU retirer le terme + l'étiquette. En même temps (F4) : gater
  l'étiquette sur `equity !== 0` (pas `currentValue > 0`), filtrer `isActive` (comme moteur/PDF), et
  ajouter la garde `Number.isFinite` + `logErrorThrottled` sur currentValue/mortgageBalance (3 sites,
  note silent-failure : `||0` couvre NaN mais pas Infinity — aujourd'hui rattrapé en « — » par formatCAD,
  sans trace pour diagnostiquer).
- [ ] **`[NW-PARITY-SURFACES-TEST]`** (S-M, reco financial-integrity #544 — le garde-fou keystone de
  l'audit 2026-06-17, toujours manquant) — test de PARITÉ « NW présent ≡ toutes surfaces (KPI Accueil,
  useDerivedFinancials, financialSnapshot IA/MCP, PDF) ≡ `chartData[0]` (modulo équité immo, convention
  par surface EXPLICITE) » sur un persona endetté + propriétaire. C'est le test qui aurait attrapé
  mécaniquement F2 et l'inexactitude doc F5. `tests/services/nwParity.test.ts` couvre déjà
  moteur↔computePresentNetWorth — l'étendre aux surfaces UI.
- [ ] **`[DASH-HIST-CARDS-LABEL]`** (S, finding financial-integrity #544 F3) — sur l'Accueil, le KPI dit
  le PRÉSENT mais les cartes « Actifs individuels » et le graphe restent au dernier close → la
  reconstructabilité à l'écran ne tient plus SANS que rien ne le dise. Étiqueter les cartes « au dernier
  cours de clôture » (réutiliser `staleTailSymbols`/`noHistorySymbols` de usePortfolioHistory).
- [x] **`[A11Y-INFO300-SWEEP]` `text-info-300` inexistant (no-op silencieux) — sweep dédié** (S) —
  ✅ 2026-07-31. 13 occurrences → `text-info-400`, MESURÉ `check-contrast` (7,84 / 7,49 / 6,99:1, AA
  normal ✅ sur les 3 fonds opaques). Preuve build PROPRE (`rm -rf dist`) : `.text-info-400` générée,
  `.text-info-300` absente du CSS (le no-op silencieux confirmé — le texte héritait du parent).
- [x] **`[A11Y-DETAILS-TAP-TARGET]` `<summary>` sous la cible tactile 24×24px (WCAG 2.5.8)** (S) —
  ✅ 2026-07-31. Sweep des 9 `<summary>` du repo : 4 avaient déjà un `py-*` (Budget, HistoryCoverageNote,
  HistorySyncDoctor ×2), les 5 autres reçoivent `py-1.5` (26-34 px mesurés). ⚠️ **Finding a11y-auditor
  (MESURÉ en Chromium réel) : `inline-block` sur un `<summary>` est INUTILE pour la hauteur (le padding
  compte déjà sur `list-item`) et NUISIBLE — il supprime le triangle natif ▶/▼ (seule affordance
  visuelle d'état) et rétrécit la cible cliquable de la pleine largeur à la largeur du texte** → retiré
  des 2 sites où je venais de l'ajouter. Contrastes translucides du sweep info-400 composités à la main
  (check-contrast ne couvre que l'opaque) : tous ≥ 4,69:1 AA — marge la plus fine = AutoBackupPanel
  hover, premier site à surveiller si un token de fond bouge. Reste (pré-existant, hors PR) :
  `Transactions.tsx:492` porte un `inline-block` d'avant — même symptôme triangle perdu, à reprendre
  avec un éventuel design-system des disclosures.
- [x] **`[FINTABLE-5]` Bascule de l'historique 18 mois — ✅ TRANCHÉ 2026-07-29 : ON GARDE.** La mesure
  est tombée : 90 jours demandés, **30 rendus** (2026-06-29 → 2026-07-28). La réponse de cadrage de Marc
  (« supprimer l'historique, n'utiliser que Plaid », Q8) est donc **caduque** — l'appliquer aurait coûté
  ~17 mois de données. C'est précisément pourquoi ce lot était gaté par une MESURE et non par une
  intention : l'intention était sincère et fausse. Rien à coder ; l'import manuel reste la source du
  passé, Fintable celle du présent. À réévaluer si la fenêtre s'élargit (connexions peut-être récentes),
  mais **jamais de suppression sur une promesse**.
- [x] **`[FINTABLE-POSITIONS]` ❌ IMPOSSIBLE — clos par la mesure (2026-07-29)** — le docteur a d'abord
  montré que les 6 comptes arrivent par **UNE SEULE connexion Desjardins via PLAID**, sans aucune
  connexion SNAPTRADE (plan et santé hors de cause). L'annuaire PUBLIC a ensuite tranché : SnapTrade
  au Canada chez Fintable = **exactement 3 courtiers** (Webull Canada, Questrade, Wealthsimple Trade) ;
  `q=disnat` → **0 résultat**, et « Desjardins Online Solutions » est `supported: false`. Ce n'est donc
  pas un problème de configuration mais une **limite du produit** : les positions détaillées sont hors
  de portée via Fintable, quoi que Marc fasse. Décision : volet abandonné ; les positions continuent
  de passer par `apply_broker_statement` (dépôt d'un relevé Disnat dans le chat), qui fonctionne déjà.
  À rouvrir seulement si Marc change de courtier ou si Fintable élargit sa couverture SnapTrade.
- [x] **`[FINTABLE-PLAN]` ✅ Marc paie (décision 2026-07-29)** — l'essai expirait le 2026-08-01 et le
  palier gratuit a `can_sync: false` (arrêt TOTAL des syncs, pas de dégradation). Après avoir vu que
  les positions étaient impossibles, Marc a choisi de prendre un plan pour conserver l'import
  automatique des transactions + les soldes de référence. ⚠️ Ma recommandation était l'inverse (ne pas
  payer, le gain restant ne justifiant pas de casser la règle « zéro abonnement ») — arbitrage assumé
  par Marc, tracé ici pour la prochaine session. NB mesuré : ni Airtable ni Google Sheets ne sont
  connectés chez lui — le « repli Sheet » de l'ADR n'a jamais existé en pratique, ce qui conforte le
  choix de l'API directe.

## 🚧 Chantier Claude-in-app (GO Marc 2026-07-21 : « go jusqu'à tout fini et testé + audit de sec à la fin + aucune donnée changée + résultat fiable »)
> Plan validé (panel PM + architect, 2026-07-21). P1 = Claude intégré à l'app (tool-use sur les MÊMES
> specs que le MCP — parité « mêmes réponses que claude.ai ») ; P2 = tools MCP d'écriture manquants
> (ordre : transactions → objectifs → budgets → actifs → immobilier) ; P3 = visuels des 5 surfaces.
> Décisions verrouillées : mode discret = chat masqué d'un bloc (PrivateBlock) ; transcript persisté
> LÉGER (payloads tools en mémoire session seulement) ; Sonnet = chat interactif (Haiku reste au fond) ;
> écritures = confirmation diff avant/après à CHAQUE écriture ; AUDIT SÉCURITÉ complet en fin de chantier.

- [x] **`[AITOOLS-A]` Frontière spec/register** — ✅ 2026-07-21 : 16 tools scindés en `*.spec.ts`
  (pur, browser-safe) + `*.tool.ts` (mince). Parité d'enregistrement MESURÉE (worktree HEAD vs courant,
  16/16 identiques), suite MCP verte, garde `noMcpSdkInSpecs` (frontière + minceur, volume prouvé).
- [x] **`[AITOOLS-B]` Registre app + boucle agentique lecture** (L) — ✅ 2026-07-21 : `services/aiTools/`
  (registry 11 tools lecture, toAnthropicTools, dispatch avec validation zod explicite + ceinture try/catch,
  agentLoop cap 6 tours + streaming + timeout/tour + fins dégradées distinguées error/truncated/refused +
  callbacks UI isolés, systemPrompt, appStateProvider : pick data-only SANS apiKeys + validateAppStateShape +
  structuredClone + la MÊME normalizeAppState que le MCP — extraite browser-safe `mcp/state/appStateDefaults.ts`).
  Parité PROUVÉE (8 tools × 2 personas, exhaustivité assertée) + « aucune donnée changée » prouvé (2 personas,
  MC + what-if variés, clone frontière testé). Panel 4 agents : 1 CRITIQUE + 3 ÉLEVÉ + 5 MOYEN appliqués ;
  bonus : dérive RÉELLE `documents` manquant du littéral legacy du store attrapée par le test de défauts.
- [x] **`[AITOOLS-C]` Branchement panneau existant** (M) — ✅ 2026-07-21 (PR #478) : AiAssistant en
  tool-use via `hooks/useAiChat` (partagé, prêt Lot E), `generateContext()` SUPPRIMÉ, chips « a consulté »,
  bannière mode test (warning-400 mesuré), mode discret = chat masqué entier (ADR-5), bundle boot inchangé
  (+110 o gzip). Panel sur diff COMMITÉ : 1 CRITIQUE (abort ≠ error) + 2 ÉLEVÉ (identité de message par ID,
  réentrance par ref, Effacer gelé pendant envoi) + 2 MOYEN appliqués — sondes mesurées. 8 tests composant.
  ⚠️ Incident : un revert conteneur a EFFACÉ le Lot C non commité pendant l'attente du panel (ré-appliqué
  de mémoire) → règle : committer AVANT de lancer un panel. ⏳ Critère d'arrêt à VALIDER PAR MARC en prod
  (5 vraies questions → réponses correctes).
- [x] **`[AITOOLS-ENGINE-WORKER]`** 🟠 ÉLEVÉ (M→S, requis avant Lot C) — ✅ 2026-07-21 : les 3 tools moteur
  routés sur `runProjectionAsync` (drop-in : même signature, Worker + timeout 30s côté navigateur, repli
  synchrone IDENTIQUE côté Node/MCP) ; `withState` élargi aux fn async (rétrocompat sync). Parité re-prouvée
  (registryParity vert sur le chemin async) + garde-scan « jamais d'appel moteur DIRECT dans un spec ».
- [x] **`[AITOOLS-HISTORY-BOUND]`** ✅ 2026-07-29 (PR #519) — vérif de l'état RÉEL : entre deux ENVOIS, useAiChat resoumet du TEXTE seul (prémisse à moitié périmée) ; le vrai coût était INTRA-boucle (tours 2-6 re-paient les tool_results). Fix = breakpoint de cache TOURNANT sur le dernier tool_result (4ᵉ/4 marqueurs, l'ancien marqueur est retiré à chaque tour — 5 marqueurs = erreur API). Préfixe re-servi du cache (0,1×) au lieu d'une troncature qui l'aurait cassé. Guard-test de forme. Ex-finding ai-reviewer : l'API est
  stateless → réinjecter `messages` (avec tool_results volumineux, ex. simulate_what_if includeSeries ~1400
  points) RE-paie ces tokens à CHAQUE tour suivant sur la clé BYOK. Borner l'historique resoumis (tronquer les
  vieux tool_results, garder le texte). NB : ne PAS changer `includeSeries` défaut (surface claude.ai, parité).
- [x] **`[AITOOLS-D]` Écritures + confirmation** (M) — ✅ 2026-07-21 : 5 write-tools via `applyDocument` pur →
  modal diff avant/après (`AiChatConfirmModal`) → Appliquer (backup `createBackupNow('auto')` OBLIGATOIRE
  avant l'écriture, sinon annulée) / Annuler (tool_result refusé). Diff RECALCULÉ sur état FRAIS au clic
  (anti-race), écritures multiples séquentielles (la boucle re-snapshot après chaque apply), tools déclarés
  à l'API SEULEMENT si l'exécuteur est branché, apiKeys insensibles à un apply. 17 tests. + fix flake
  oauthProvider (tamper ~1/64 no-op). **Panel (4 agents, sondes)** : 6 findings appliqués — mode discret
  masque le modal (Loi 25), promesse orpheline au démontage d'onglet, scrub injection du `summary`,
  Annuler coupe tout le lot, `.finite()` sur 5 specs.
- [x] **`[MCP-WRITE-SUMMARY-SCRUB]`** ✅ 2026-07-22 (audit SEC) — le vecteur « injection indirecte via
  `summary`/`field` d'un tool_result d'écriture » existait AUSSI côté serveur MCP (`runApply` renvoyait le
  `summary` non scrubé à claude.ai). CORRIGÉ : helper PARTAGÉ `mcp/tools/scrubWriteResult.ts`
  (`scrubWriteResultForModel`) consommé par `writeExecutor` (app) ET `runApply` (MCP) → parité par construction.
  Test `tests/mcp/writeResultScrub.test.ts`. ⚠️ Effet sur claude.ai au prochain deploy Cloud Run. Limite assumée :
  injection en langage naturel passe toujours (defense-in-depth).
- [x] **`[AITOOLS-E]` UI partagée** (L) — ✅ 2026-07-22 : `AiChatProvider` (1 instance `useAiChat` au niveau
  App) + panneau latéral GLOBAL (`AiChatLauncher`, FAB partout, lazy) + onglet Assistant pleine page —
  rendu mutualisé `AiChatView` (variant panneau/onglet), MÊME conversation partout. Résout à la racine le
  finding Lot D « promesse orpheline au démontage d'onglet » (chat monté App, jamais démonté par onglet ;
  modal rendu 1× par le provider). Boot inchangé (~107 kB gzip mesuré : SDK Anthropic en import dynamique
  dans `useAiChat`, panneau lazy). Mode discret masque tout ; pastille d'activité sur le FAB panneau fermé.
- [x] **`[AITOOLS-PROMPT-CACHE]`** ✅ (2026-07-24, PR suivante) — état réel : le `cache_control` du bloc
  `system` statique (livré en #490) cachait DÉJÀ les 16 schémas de tools par l'ORDRE de préfixe Anthropic
  (tools → system → messages : un breakpoint sur system cache tout ce qui le précède). Complété : marqueur
  `cache_control` EXPLICITE sur le DERNIER tool dans `agentLoop.ts` → les tools sont cachés INDÉPENDAMMENT
  du system (défense en profondeur si le préfixe system change) ; le préfixe (system+tools+historique) est
  re-servi du cache aux tours 2-6 + messages suivants (coût BYOK). Guard-test de forme de requête (2 marqueurs
  présents). Zéro changement de comportement ; `usage.cache_read_input_tokens` déjà remonté (B4-CHAT-COST).
- [x] **`[PERF-SDK-BOOT-PRELOAD]`** ✅ 2026-07-31 — **boot −54 Ko gzip (225,6 → 171,6 Ko, −24 %), mesuré
  par git-stash avant/après**. Le diagnostic du ticket était INCOMPLET (« les 5 onglets lazy ») — la vraie
  chaîne, tracée par un walker d'imports STATIQUES depuis index.tsx : `TabRouter → PageSetupGate →
  PayslipUploadCard → claude.ts → SDK` (le gate de setup est monté au BOOT). Fix en 3 morceaux, chacun
  prouvé par rebuild+mesure : (1) `makeClient` ASYNC (`import type` pour les types — effacés — + SDK
  chargé via importWithRetry au premier usage) ; (2) `PayslipUploadCard` lazy dans PageSetupGate
  (Suspense local) — casse la chaîne statique boot→claude ; (3) ⚠️ **retrait des règles `manualChunks`
  `ai-vendor`/`pdf-vendor` : un manualChunk atteint UNIQUEMENT par `import()` devient EAGER** (le chunk
  manuel casse la frontière asynchrone — l'entry l'importait STATIQUEMENT alors qu'AUCUNE chaîne statique
  source n'existait ; en retirant la règle SDK, `pdf-vendor` est APPARU dans le preload à sa place, même
  piège). Sans les règles, Rolldown range SDK et jspdf dans les chunks async naturels (sdk-*.js /
  jspdf.es.min-*.js) — téléchargés au premier usage seulement. Preload final : react-vendor + cœur.
  Panel #547 (code-reviewer + silent-failure + ai-reviewer, 0 bloquant) : test de résolution du chunk lazy
  ajouté (PageSetupGate → vraie PayslipUploadCard, pas le fallback à vie) + `ErrorBoundary.componentDidCatch`
  route désormais vers `logError` (un crash de rendu — ex. chunk périmé post-déploiement — était visible à
  l'écran mais INVISIBLE dans Réglages → Diagnostics). Suivi routé : `[SDK-IMPORT-TIMEOUT]` ci-dessous.
- [ ] **`[SDK-IMPORT-TIMEOUT]`** (S, résiduel panel #547, NON bloquant — ai-reviewer MOYEN + code-reviewer
  FAIBLE, convergents) — le chargement du chunk SDK (`await importWithRetry(() => import('@anthropic-ai/sdk'))`,
  `services/claude.ts:157`) n'est couvert par AUCUN timeout : `makeTimeoutSignal` est construit APRÈS. Un
  `import()` dont le fetch STALLE sans jamais rejeter pend indéfiniment (aucun recours sauf recharger l'onglet).
  Borné en pratique : 1er usage par session d'onglet seulement (registre ESM dédup ensuite), et un « Annuler »
  pendant le chargement est honoré AVANT l'appel API (makeTimeoutSignal teste `aborted` à sa création — zéro
  coût facturé). Fix candidat : course `import()` vs timer 8-10 s dans importWithRetry (rejet propre routé vers
  les messages d'erreur existants, tous les appelants catchent déjà). ⚠️ importWithRetry est PARTAGÉ par tous
  les lazy — dimensionner le timeout pour les gros chunks (recharts) sur connexion lente avant de l'appliquer.
- [x] **`[AITOOLS-SEC]` Audit sécurité FINAL du chantier** ✅ 2026-07-22 (exigence Marc) — panel security-privacy
  + ai-reviewer sur TOUT le chantier. **Verdict : sain.** Rapport daté `docs/AUDIT_SEC_CLAUDE_IN_APP_2026-07-22.md`.
  Prouvés SAINS (mesuré) : aucune écriture sans confirmation, clés API exclues, Loi 25/mode discret, isolation
  persona, lecture zéro-mutation, parité claude.ai. Findings corrigés : `[MCP-WRITE-SUMMARY-SCRUB]` (ÉLEVÉ,
  injection indirecte serveur), `.finite()` sur 3 tools lecture + garde-scan, `refusal` fin dégradée honnête.
  Optimisations coût routées (non-sécurité) : `[AITOOLS-PROMPT-CACHE]`, `[PERF-SDK-BOOT-PRELOAD]`.
>
> **Dernière mise à jour : 2026-07-06.** Tests : 2334 verts / 207 fichiers · tsc clean · build OK.
> **Dernière PR mergée : #425** (2026-06-26, WHT-DISPLAY-EXACT) — 111 commits depuis #315, audit financier complet 2026-06-23 résolu (6 lots), 5 sessions 06-19→06-26, retraite per-conjoint ✅.
> Restes uniquement : suivis LOW (DEP-UNDICI-VULN, FISC-CONST-LINT-LIMITS, FISC-RRSP-PRE2010-FALLBACK + suivi FUZZ-ONETIME-FLOWS) +
> blocages Marc (RECH-ACTION-UX confirmée visuellement, phases 2-4 brief plan-first, P0-*, design Budget/Transactions/Retraite).

## 💬 Roadmap chat (B, scope validé Marc 2026-07-22 par AskUserQuestion)
- [x] **`[B1-CHAT-ATTACHMENTS]`** ✅ 2026-07-22 (PR #487) — pièces jointes multimodales (images ≤5 Mo, PDF ≤10 Mo,
  texte/CSV ≤1 Mo, max 5/message, budget agrégé 20 Mo) : `services/aiChat/attachments.ts` (classify/read/
  buildUserContent, cache session par id de message + éviction hors fenêtre + purge inter-persona),
  `useAiChat.sendMessage(text, files)` (+ `cache_control` sur le dernier bloc pièce jointe — coût BYOK),
  UI trombone + puces (AiChatView), clause anti-injection system prompt. Transcript = MÉTA seulement
  (ADR-4) ; contenu post-reload → note honnête. **Panel 5 agents appliqué** (1 CRITIQUE fichier 0 octet →
  tour évaporé ; 3 ÉLEVÉS suggestion-jette-fichier / budget agrégé / cache_control ; 6 MOYENS a11y-sécurité).
  Suivi non bloquant : `max_tokens` 2048 court pour « liste tout le PDF » (marqueur [Réponse coupée] honnête),
  timeout 60 s premier tour PDF lourd à instrumenter si vu en prod. B2 déplacera les octets en fichiers Drive appdata.
- [x] **`[B2-CHAT-HISTORY]`** ✅ 2026-07-22 — multi-conversations : `aiConversations` (archivées) +
  `activeAiConversationId` (additifs, zéro migration) ; `aiConversation` RESTE l'active (source unique,
  l'active ne figure JAMAIS dans la liste — pas de double copie qui diverge). Logique pure
  `services/aiChat/conversations.ts` (new/switch/delete, titre auto, aliveAttachmentMessageIds),
  UI `AiConversationList` (sidebar md+ / sélecteur mobile, onglet seulement, zone mode discret, actions
  gelées isLoading). **Pièces jointes cross-device** : `attachmentDriveStore.ts` — un fichier appdata
  par message (`financeai-chat-attach-<msgId>.json`), push fire-and-forget à l'envoi, fetch au
  cache-miss (ratés mémorisés), delete avec la conversation, skip mode test/sans jeton.
- [x] **`[PERSONA-SANITIZE-CHAT]`** ✅ 2026-07-29 (PR #519) — sanitizer étendu : `aiConversation` filtrée par id de message, archive `aiConversations` contaminée (id OU message de fixture) retirée EN ENTIER + test de parité. Ex-finding : `personaSanitizer`
  ne scanne pas `aiConversation`/`aiConversations` (aucun persona n'y écrit AUJOURD'HUI — pas de fuite
  active). Si un futur persona pré-remplit un chat de démo, la ceinture PERSONA-PURGE ne l'attraperait
  pas. Étendre le scan (ids `aimsg_` de fixtures enregistrés dans artifactIds) + test de parité.
- [x] **`[B3-CHAT-MODEL]`** ✅ (2026-07-22, PR #489) — choix du modèle PAR conversation (Haiku / Sonnet /
  Opus) : sélecteur dans le header du chat (gelé pendant un envoi), `AppState.aiChatModel` (additif) pour
  l'active, porté dans `AiConversation.model` à l'archivage et RESTAURÉ à la bascule (archive pré-B3 →
  sonnet, le seul modèle d'alors). Source unique des ids : `services/aiChat/models.ts` (`MODEL_IDS` —
  `services/claude.ts` en dérive MODEL_SONNET/MODEL_HAIKU, plus deux littéraux qui divergent).
- [x] **`[B4-CHAT-COST]`** ✅ (2026-07-22, PR #489) — coût API RÉEL : `agentLoop` accumule `msg.usage`
  par tour (rendu sur TOUS les stopReasons — un envoi annulé a payé ses tours aboutis) →
  `services/aiChat/pricing.ts` (tarifs $/MTok datés/sourcés 2026-06 : haiku 1/5, sonnet 3/15, opus 5/25 ;
  cache read 0,1×, write 1,25×) → `costUsd` sur chaque réponse (persisté, léger) + cumul à vie
  `aiChatCostUsdTotal`. Affichage CAD via `fxRates.USD` (`formatCostCad`, « < 0,01 $ » jamais un faux
  0,00 $) : par réponse (bulle), par conversation (header + sidebar), total à vie (header). Parité
  ids↔tarifs verrouillée par test (un modèle sans tarif = garde rouge, jamais un coût non compté muet).

## 🛡️ Dépendances — alertes Dependabot ouvertes (capture Marc 2026-07-22, « backlog aussi »)
- [x] **`[DEP-DEPENDABOT-2026-07]`** ✅ (2026-07-23, PR #497 — coché 2026-07-24 au balayage) — 4 alertes ouvertes sur package-lock : fast-uri ×2 (HIGH, host
  confusion via IDN/backslash), @hono/node-server (MODERATE, path traversal serve-static Windows — serveur
  MCP ; vecteur limité : Cloud Run Linux, pas de serve-static exposé, à vérifier), dompurify (LOW,
  CUSTOM_ELEMENT_HANDLING bypass). Passe de bump ciblée : `npm audit` + bump lockfile (fast-uri est
  probablement transitif — `npm ls fast-uri`), suite complète + build ensuite. Leçon PM-STALE-BACKLOG :
  vérifier l'état RÉEL du lockfile avant de coder (Dependabot a pu déjà ouvrir des PR).
  ✅ 2026-07-23 (PR #497) : `npm audit fix` → fast-uri (HIGH ×2 advisories) et dompurify (LOW) corrigés.
  ⚠️ RÉSIDUEL ASSUMÉ (2 MODERATE) : `@hono/node-server` <2.0.5 épinglé par `@modelcontextprotocol/sdk`
  (^1.19.9, même @latest) — le fix est une MAJOR hors range. Exploitabilité MESURÉE nulle dans notre usage :
  l'advisory vise `serve-static` sur WINDOWS (grep : 0 usage dans mcp/ ET dans le dist du SDK ; prod = Cloud
  Run Linux). Pas d'override major non testé par l'upstream. → `[DEP-HONO-NODE-SERVER]` : re-vérifier à chaque
  bump du SDK MCP (dès qu'il passe à node-server 2.x, le résiduel tombe tout seul).

## 📈 Investissements — couverture d'historique incomplète (demande Marc 2026-07-22, verbatim « backlog », captures)
- [x] **`[HIST-COVERAGE-TOTAL]`** 🔴 (M-L) — ✅ 2026-07-23 (PR #493, ADR docs/adr/) : la courbe TOTAL
  n'omet PLUS aucun titre détenu. Livré : (b) titre sans historique → compté au TOTAL/buckets à sa valeur
  actuelle (contribution plate, AUCUNE colonne inventée, `noHistorySymbols` signalé) ; backfill borné
  pré-historique au PREMIER close (plus de « marche » fantôme) ; queue périmée raccordée au `currentPrice`
  si la quote est fraîche (`priceUpdatedAt` < 7 j — cas GBS.PA quote OK/candles KO) ; (c) bandeau Dashboard
  honnête avec le montant compté (<PrivateAmount>) ; (a) variantes de suffixe Yahoo par DEVISE pour les
  tickers nus (EUR → .PA/.DE/.AS/.MI, CAD → .TO/.V), validées par plausibilité de prix (facteur ≤ 2 vs
  currentPrice, sinon refus anti-collision) et persistées via `Asset.historySymbol` (additif). NB : si
  « Amundi EM Asia » ne se résout toujours pas en prod, préciser le ticker suffixé (ex. AASI.PA) dans l'actif.
- [x] **`[QUOTE-NEGATIVE-CACHE]`** (S) — ✅ 2026-07-23 : cache négatif TTL par symbole
  (`services/marketData/negativeCache.ts`, localStorage clé dédiée jamais synchronisée, repli mémoire hors
  navigateur) : 3 échecs CONSÉCUTIFS (fenêtre 7 j) → skip borné (quote 24 h, profil 7 j), succès = effacement,
  self-heal à l'expiration, purge > 30 j. Intégré à la façade (`getQuote`/`getProfile` + `canAttemptQuote`/
  `canAttemptProfile` consommés par le boot) ; wipe sur changement de clé provider ET sur le bouton
  « Actualiser » (geste explicite = repartir de zéro). ⚠️ Périmètre RÉDUIT vs le ticket : l'HISTORIQUE est
  EXCLU volontairement — son contrat `[]` (vide confirmé, caché 24 h) vs `null` (erreur) pilote la résolution
  de variantes de `hydrateAssetHistories` (un négative-cache qui rendrait `null` masquerait ce contrat), et le
  coût résiduel est déjà borné ~1 essai/symbole/jour (`needsHistorySync` + cache 24 h).
- [x] **`[QUOTE-MARKET-TIMESTAMP]`** (S) — ✅ 2026-07-23 : `priceUpdatedAt = marketTimestampOrNow(quote.timestamp,
  now)` (garde de plausibilité : ≥ 2000-01-01, ≤ now+10 min, sinon repli heure de fetch) → le raccord
  `quoteFresh` (7 j) et le libellé « Cours mis à jour » mesurent la fraîcheur du COURS (clôture de vendredi
  affichée comme telle un dimanche), pas celle du réseau.
- [x] **`[INVEST-CURVES-LOW]`** (S) — ✅ 2026-07-23 (avec [INVEST-CHART-CLEAN], demande Marc « la courbe est mal
  visible ») : (1) auto-défaut **Base 100 (%)** quand ≥ 2 séries d'échelles disparates (> 20×) partagent l'axe $
  (le choix manuel du toggle prime toujours) ; (2) fix Base 100 sur lignes ÉPARSES — base de CHAQUE série = son
  premier point FINI (avant : ligne 0 → un titre acheté plus tard avait base 0 → courbe FIGÉE À 0, invisible),
  point manquant → null (trou honnête). + graphe 400→520 px, notes de couverture et diagnostic REPLIABLES
  (une ligne compacte, détails au clic), ligne « N points · période » retirée.
- [x] **`[INVEST-ALLOC-GEO-SECTOR]`** (M) — ✅ 2026-07-23 : cause DOUBLE — table `ASSET_META` statique (13 titres)
  ET keyée préfixe place (`EPA:CW8`) face à des symboles réels suffixe (`CW8.PA`) → quasi tout en « Autre ».
  Livré : `Asset.sector`/`region` additifs (persistés) ; `resolveAssetMeta` (source unique : champ > seed
  NORMALISÉ préfixe↔suffixe > crypto > Autre) ; auto-remplissage au boot via le profil Finnhub
  (`assetProfileSync`, séquentiel, information utile seulement, jamais d'écrasement) ; édition inline
  région/secteur dans les cartes d'allocation (tout titre classable même sans provider).
- [x] **`[HIST-MULTI-PROVIDER]`** 🔴 — ✅ 2026-07-23 (retour Marc post-#493 : TOTAL ~200 k$ et titres toujours
  sans courbe ; « plusieurs providers pour tout avoir ») : chaîne de QUOTES multi-providers (crypto → CoinGecko ;
  Finnhub → repli Yahoo via le proxy chart, `meta.regularMarketPrice`, devise vérifiée) ; `priceRefresh` quote
  `historySymbol || symbol` ; bouton « Actualiser les cours » = resync COMPLÈTE (purge cache history + hydratation
  forcée + quotes + diagnostic) ; `HistorySyncDoctor` (Investissements) : raison exacte par titre + symbole de
  cotation inline + recherche par NOM (`/api/search/yahoo`). ADR docs/adr/.
- [x] **`[INVEST-PERF-PERIOD]`** (S-M) — ✅ 2026-07-23 (demande Marc : « la performance actuellement c'est 24h
  mais je veux pouvoir choisir moi ») : sélecteur de période (24h / 7 j / 1 mois / 3 mois / 6 mois / cette
  année / 1 an) sur la carte Performance, qui pilote AUSSI les chips du graphe et les cartes par titre.
  Helper pur `services/history/periodReturn.ts` à DEUX sémantiques honnêtes : `seriesReturnPct` (variation
  de VALEUR d'une série marketData — TOTAL/buckets, sensible aux apports) et `priceReturnPct` (performance
  de PRIX NATIF d'un titre via `priceHistory`, insensible aux achats — les cartes par titre l'utilisent).
  Benchmark « Marché » = prix natif du titre CW8/MSCI détenu (repli série CSV). Pas de baseline dans la
  fenêtre (titre plus récent que la période) → `null`/« — » honnête, jamais un 0. Score de santé : momentum
  FIXÉ sur 24h (indépendant du sélecteur — badge header stable).
- [x] **`[QUOTE-ERRKIND]`** ✅ (2026-07-24, PR suivante) — fix structurel livré : les providers PROPAGENT
  désormais (throw) une `MarketDataError` typée pour les échecs TRANSITOIRES (RATE_LIMIT/NETWORK/AUTH/UNKNOWN)
  au lieu de les aplatir en `null` ; l'ABSENCE confirmée (Finnhub `c:0`, Yahoo 404, crypto id inconnu) reste
  `null`. La façade (`runLink`) classe : transitoire → avalé en `null` mais NON compté au cache négatif (un
  429/réseau ne gèle plus un vrai titre) ; absence confirmée → compté au skip. Le TTL gradué reste 2ᵉ ceinture.
  Discriminant : 3× 429 → `canAttemptQuote` reste `true` (échouait avant) ; 3× 404 → skip armé.
- [x] **`[PRICE-SYNC-REPORT]`** ✅ 2026-07-29 — `updateQuoteSkips` (syncDiagnostics, fusion sans écraser l'hydratation, [] efface les périmés) publié par le boot (App) ET le bouton Actualiser (Investments) → section « Prix non actualisés (N) » du HistorySyncDoctor (repliée, raisons en français, dédup avec la liste historique). Ex-finding : les skips du refresh de
  BOOT (quotes/profils) n'ont AUCUNE surface UI (contrairement à l'historique → HistorySyncDoctor). Mitigation
  livrée : logError au journal quand des titres sont skippés au boot + TTL gradué (staleness bornée ~1 h).
  Fix complet : un rapport publié (patron setHistorySyncReport) consommé par le doctor/une note discrète.
- [x] **`[PERF-STALE-TAIL-ZERO]`** ✅ (2026-07-24, PR suivante) — `buildMarketData` trace les valeurs
  raccordées au prix courant (`syntheticTailKeys` = `${date}|${symbol}`, posé au splice `quoteFresh`) ;
  `seriesReturnPct(rows, key, period, isSynthetic?)` rend `null` (« — » honnête) quand latest ET baseline
  sont tous deux synthétiques (au lieu d'un 0,00 % trompeur — donnée figée ≠ marché plat, cas GBS.PA). UN
  SEUL endpoint synthétique = mouvement RÉEL (prix figé vs réel) → % conservé. Scope PER-SYMBOLE (les
  agrégats TOTAL/buckets mêlent réel+synthétique). Câblé dans `Investments` (tendances par série).
  Discriminant baked dans le test (ancien = 0, nouveau = null). Rétrocompat : prédicat optionnel.
- [x] **`[A11Y-PILL-RADIOGROUP]`** ✅ (2026-07-24, PR suivante) — `components/ui/Pill.tsx` (radiogroup partagé)
  a désormais la navigation clavier APG : roving tabindex (`tabIndex={isSelected ? 0 : -1}`, 1 seul arrêt de
  Tab, repli sur la 1re option si `value` hors liste → jamais intabbable) + flèches ←→↑↓ (wrap) + Home/End,
  la sélection SUIT le focus. Corrigé UNE fois → profite aux 3+ usages (Investissements/Budget/Futur). Cible
  tactile `sm` : `min-h-[24px]` (WCAG 2.2 SC 2.5.8). Tests clavier + discriminant (4 tests échouent sur l'ancien).
- [x] **`[FUTUR-REAL-HISTORY]`** ✅ (2026-07-24, PR suivante — cadrage architect + financial-integrity, décision Marc
  Option A + FX du jour) — la courbe **Futur** montre AVANT aujourd'hui l'historique RÉEL du patrimoine « depuis que j'ai
  l'app ». **CONSTAT du cadrage : déjà construit à ~90 %** (segment passé `pastPrefix` dans `FutureProjection.tsx`,
  reconstruit placements + cash + immo, recalculé à chaque upload/changement via les deps du `useMemo` — cf [[R2-FIRE]]).
  Cette PR ferme les 2 écarts money-critical qui empêchaient « matcher EXACTEMENT le niveau d'aujourd'hui » :
  - **Raccord dette EXACT (Option A)** : le passé soustrait `chartData[0].DettesNonImmo` (dette courante, source unique)
    via `pastNetWorthAt` → `computeRawNetWorth` (zéro copie locale) → fin du SAUT « aujourd'hui » pour un endetté (le futur
    soustrait la même dette dès le mois 0). Approximation assumée (dette supposée constante dans le passé) SIGNALÉE au bandeau.
    Remplace la limite [[HIST-NW-DEBT-DISCLAIMER]] (option b, jamais livrée) — Marc a re-tranché (a) le 2026-07-24.
  - **Cohérence de base cash** : `reconstructCashHistory` EXCLUT désormais `isDuplicate`/`isTransfer` comme l'ancre
    `computeStartingCash` (les 2 bouts de la courbe divergeaient — finding financial-integrity). Tests discriminants (3 rouges sur l'ancien).
  - **FX** : titres étrangers valorisés au change DU JOUR (déjà en place, choix Marc) — note d'honnêteté ajoutée au bandeau.
  - [x] **`[FUTUR-HIST-WIRING-TEST]`** ✅ (PR A, 2026-07-24) — assemblage du passé EXTRAIT en fonction pure
    `services/history/buildPastPrefix.ts` (unit-testable hors composant, ≠ harnais de rendu lourd) ; test prouve le câblage
    (buckets 1:1, dette COURANTE soustraite, dates, gate no-fake) + discriminant vs `DetteTotale`. Sort la logique money-critical
    du composant de ~1000 l. ⚠️ `type` alias (pas `interface`) pour garder l'assignabilité `Record<string, unknown>` de `displayData`.
  - [x] **`[FUTUR-HIST-DAILY-REFRESH]`** ✅ (PR A, 2026-07-24) — `startYear/startMonth` ne sont plus figés au montage :
    `monthEpoch` (an×12+mois) réévalué par un check HORAIRE + au retour de visibilité → au passage de mois, « aujourd'hui »
    avance (projection re-seed, le passé gagne son point). Granularité mois (passé/moteur mensuels). Test fake-timers.
  - **Reste (différé, non bloquant)** : `[FUTUR-HIST-FX-DATED]` (FX historique daté via proxy Yahoo `USDCAD=X`/`EURCAD=X`, plus
    juste que le change du jour — money-critical, garder le point d'AUJOURD'HUI au FX courant pour le raccord exact ; no-fake si
    FX daté manquant → repli FX courant signalé) ; recherche binaire dans `priceAt` si un jour mesuré lent.
  - [x] **`[FUTUR-PAST-DEBT-FREEZE]`** ✅ (2026-07-29, demande Marc « assure-toi que le passé marche… le passé doit
    être exactement ce que c'était à cette date ») — audit lecture seule PROACTIF (avant tout code) qui a confirmé le
    câblage réactif (transactions/actifs/dettes → recalcul de `pastPrefix`, 3/3 dépendances OK) mais trouvé UN écart
    réel : `currentDebtNonImmo` lisait `chartData[0]` (dérivé de `results = frozenUsable ?? liveResults`) → quand le
    FUTUR est gelé (PROJECTION-PERSIST, badge « Pas à jour »), le segment PASSÉ continuait de soustraire l'ANCIENNE
    dette jusqu'au clic « Recharger ». Fix : lire depuis `liveResults` (JAMAIS `results`/`chartData`, qui peuvent être
    le blob figé) — le passé reste réel, indépendant du gel du futur. Test discriminant (`FutureProjection.
    pastDebtFreeze.test.tsx`) : gèle le futur, bondit la dette LIVE de +10 M$, prouve que le NetWorth affiché du passé
    CHANGE (échoue sur l'ancien code — vérifié par `git stash`). Seule composante affectée (buckets cash/placements/immo
    du passé étaient déjà corrects, non gelés).
    ⚠️ **2 agents (financial-integrity + projection-validator) ont mesuré INDÉPENDAMMENT une 2ᵉ fenêtre** que le 1ᵉʳ
    jet du fix rouvrait : au boot/reload, `lastProjection` (exclu de la persistance) vaut `null` le temps que le
    moteur recalcule (~300 ms+), alors que le blob figé restauré depuis IDB affiche DÉJÀ une courbe → le 1ᵉʳ jet
    retombait à une dette de 0 (271 k$ mesuré vs 221 k$ attendu). Fix affiné : repli sur `chartData` (ce qui est
    RÉELLEMENT affiché, live ou figé) plutôt que sur 0 — `liveResults?.chartData?.length ? liveResults.chartData
    : chartData`. 2ᵉ test discriminant ajouté (remontage avant publication moteur + blob figé dispo).
- [x] **`[FUTUR-ICONS-RICH]`** ✅ (2026-07-24, PR suivante — bug Marc « quasi aucune icône », le fix
  [FUTUR-ICON-DENSITY] ne suffisait pas) — le graphe Futur n'affichait des icônes que pour les rares `lifeEvents`/
  `flowEvents` du moteur (0-2 sur un plan normal). Fix 3 volets : (a) module pur `services/projection/milestoneIcons.ts`
  `deriveMilestoneIcons` = jalons dérivés des CHAMPS `chartData` (🏛️ RRQ/PSV, 📤 retraits REER/CELI, 💸 impôt, 🏠 locatif ;
  présentation pure, jamais retraite/FIRE = anti-doublon structurel) ; (b) gate `.includes('-')` (tiret ASCII vs cadratin « — »)
  RETIRÉ → flowEvents moteur enfin visibles ; (c) toutes les pastilles sur la courbe (`val=NetWorth`, avant les flux étaient
  à `ImpotLatent` = invisibles). RRQ/PSV migrés de lignes verticales → icônes cliquables. **Validé e2e Playwright RÉEL**
  (`e2e/futureIcons.spec.ts`) : 29 icônes vs 0-2. Tests purs (`projection.milestoneIcons.test.ts`).
- [ ] **`[A11Y-FUTUR-MILESTONES-KEYBOARD]`** 🔵 (M, finding a11y-auditor PR #516) — les pastilles d'événements du
  graphe Futur (`ClickableEventIcon`, `<g role="button" tabIndex={-1}>`) ne sont pas atteignables au CLAVIER (WCAG 2.1.1) :
  aucun `onKeyDown`, conteneur graphe `tabIndex=-1`. Une liste sr-only des jalons (parité SR) a été livrée avec FUTUR-ICONS-RICH,
  mais l'OPÉRABILITÉ clavier reste à faire → rendre les pastilles VISIBLES focusables (`tabIndex=0` + Enter/Space → `onSelect`,
  focus-ring) OU un contrôle clavier alternatif ouvrant `FutureDetailModal`. ⚠️ Impact sur le pattern « clic n'importe où » (G12) →
  trancher avec Marc. Aria-label des jalons récurrents (impôt) : inclure `dateLabel`/année si focusables (sinon ~N boutons identiques).
- [x] **`[A11Y-DASH-SRONLY]`** ✅ (2026-07-24, PR suivante) — convention GLOBALE : helper pur
  `components/ui/emptyAware` — quand la valeur rendue EST le tiret « — » (état vide de formatCAD/formatPercent),
  il remplace le tiret muet par `<span aria-hidden>—</span>` + `<span class="sr-only">Pas de donnée</span>`
  (un SR lirait sinon « tiret cadratin »/rien). Appliqué au CENTRE (slot `value` de `KPIStat` hors privacy +
  branche non-privée de `PrivateAmount` → couvre aussi `DualKPIStat`) → pas de correction site-par-site.
  Miroir de `PrivateAmount` (« ••• » + « Montant masqué »). Tests : « — » → sr-only exposé + dash aria-hidden ;
  discriminant valeur finie → aucun sr-only fabriqué.
- [x] **`[HIST-GOOGLE-PARITY]`** — ✅ 2026-07-23 absorbé par [HIST-COVERAGE-TOTAL] (couverture complète livrée ;
  l'écart résiduel attendu vs Google = granularité daily + heure FX, documenté ci-dessous). Question Marc :
  (« utiliser exactement la courbe de google finance c'est possible ? ») —
  RÉPONSE COURTE : non, pas directement (Google Finance n'a PAS d'API publique de portefeuille/courbes ; la scraper
  violerait les ToS et casserait sans prévenir). La bonne cible = PARITÉ par couverture complète (HIST-COVERAGE-TOTAL) :
  mêmes titres tous couverts + FX → la courbe converge vers celle de Google (même donnée sous-jacente). Écart résiduel
  attendu : granularité (daily close vs intraday) et heure de FX.

## 💰 Budget — 3 vues (demande Marc 2026-07-22, verbatim « backlog: »)
- [x] **`[BUDGET-3-VUES]`** ✅ (2026-07-23, PR #500) — cadrage validé Marc : PAR POSTE · moyenne
  **12 mois** · prévision = la CIBLE saisie · 3 colonnes. Livré : colonne « Moy. 12m » par poste
  (`BudgetGroupTable`, moyenne des 12 derniers mois pleins via `buildMonthlyLedger` — même base que
  l'historique par poste ; ramenée à la période affichée, sans inflationSim) + bandeau de groupe
  réel · moy. · cible (montants gatés mode discret) + « — » honnête sans historique révolu
  (`coveredFullMonths` exposé, additif). La « projection fin de mois » (réel extrapolé au prorata)
  n'a PAS été retenue au cadrage — la rouvrir seulement si Marc la demande.
- [x] **`[BUDGET-MATCH-UNIFY]`** ✅ (2026-07-24, PR #501) — le ledger (moyenne 12m + grand livre)
  rapproche tx→poste par la MÊME règle fuzzy que le réel : `matchCategoryToName` (variante noms-seuls
  extraite de `matchTransactionToCategory`, qui délègue — UNE source de la règle). Discriminant prouvé
  par git stash (« Restaurant » → poste « Restaurants » : moy 300 $ au lieu de 0 $). ⚠️ Le ticket
  SUR-prescrivait « les trois ensemble » : la CIBLE AUTO est restée exacte À RAISON — au moment du
  calcul, les noms de postes ≡ catégories observées (la sync canonicalise avant) → l'exact n'y diverge
  jamais du fuzzy, et un fuzzy mono-catégorie aurait risqué un double-comptage cross-poste.
- [x] **`[MCP-CATEGORY-ALLOWLIST]`** ✅ (2026-07-24, PR suivante) — la catégorie LIBRE d'`apply_bank_statement`
  est validée au point d'écriture (`mcp/ingest/applyDocument.ts`, module PARTAGÉ app↔MCP → les deux surfaces
  couvertes par construction) : allowlist = postes existants + `RULE_CATEGORIES`, insensible casse/accents
  (remap vers la forme canonique) ; inconnue (« Sport ») → `ruleCategorize(payee)` sinon « Non catégorisé »,
  et le summary COMPTE les remaps (jamais silencieux). Discriminant prouvé par git stash. Bonus : l'exemple
  de la description du tool enseignait « Alimentation » (hors canon !) — désormais DÉRIVÉ de `RULE_CATEGORIES`.
  NB conservé : ne PAS ancrer le fuzzy sur mots entiers (casserait « Restaurant » ⊂ « Restaurants »).
  **Extension (panel PR #502)** : helpers PURS partagés (`categoryKey`/`buildCategoryCanonicalMap`/
  `resolveCandidateCategory` dans `categoryRules.ts`) + le MÊME enforcement porté à `categorizeBatch`
  (finding ÉLEVÉ silent-failure : le prompt affirmait « sera rejetée » sans code — désormais hors liste →
  règles payee sinon « Autre », compté + logError). Collision poste↔RULE_CATEGORY documentée+testée (le
  poste gagne). **Réfuté pour l'import CSV** : la catégorie d'un CSV est une DONNÉE RÉELLE de la banque —
  par design Lot C (postes ≡ catégories observées), elle devient légitimement un poste au prochain sync ;
  l'allowlist la détruirait. Fenêtre fuzzy pré-sync transitoire, s'auto-résout au sync.
  **2ᵉ passe (ai-reviewer)** : sur un remap, `isTransfer`/`confidence` recyclés portaient sur la catégorie
  REJETÉE (« Transfert » avec isTransfer:false = compté à tort dans le Σ affiché) → isTransfer dérivé de la
  catégorie FINALE, confiance 100 (règle) / 0 (repli honnête) ; logError AGRÉGÉ 1×/batch (pas 1×/chunk —
  ~40/100 entrées du journal sinon) ; défaut `safeCategories` aligné sur `RULE_CATEGORIES` (littéral
  divergent « Alimentation »/« Loisir » retiré).
- [x] **`[AI-CATEGORIZE-MISSING-ID]`** ✅ (2026-07-24, PR suivante) — `missingIdCount` agrégé sur le
  batch + logError warning (même pattern que `offListCount`) : une transaction absente de la réponse
  JSON du modèle laisse désormais une trace au lieu d'un silent-drop.
- [x] **`[DEP-HONO-TRAVERSAL]`** ✅ DOUBLON (2026-07-24) — même résiduel que `[DEP-HONO-NODE-SERVER]`
  déjà triagé sous `[DEP-DEPENDABOT-2026-07]` (§ Dépendances) ; re-triage 2026-07-24 identique (patch
  2.0.5 publié le jour même, toujours hors range du SDK 1.29.0, exploitabilité nulle : zéro
  serveStatic/hono dans `mcp/`, Cloud Run Linux). Suivi UNIQUE : `[DEP-HONO-NODE-SERVER]` — re-vérifier
  à chaque bump du SDK MCP. Leçon : GREP le BACKLOG avant de créer un ticket sur un finding « nouveau ».

## 🔮 Futur — densité d'icônes (bug Marc 2026-07-24 : « pas assez d'icônes dans futur »)
- [x] **`[FUTUR-ICON-DENSITY]`** ✅ (2026-07-24, PR suivante) — l'échantillonnage des pastilles
  d'événements (`thinEvents`, `FutureProjection.tsx`) utilisait un PAS ENTIER `step = ceil(len/cap)`
  qui SOUS-REMPLISSAIT le plafond dès que `len` dépasse un peu `cap` : mesuré 25 événements cap 24 →
  **13 montrés** (au lieu de ~24), 17 flux cap 16 → 9, 30→15, 49→17. Marc voyait ~la MOITIÉ du cap.
  Fix : `utils/sampleEvenly.ts` (pur, testé) répartit EXACTEMENT `cap` indices uniformément (extrémités
  incluses, ordre préservé, zéro doublon) → le plafond 24/16 est enfin ATTEINT. Les `pinned` (FIRE) et
  le LOD « zoom = toutes » (fenêtre zoomée < cap → `len<=cap` rend tout) restent inchangés. Le plafond
  lui-même (24/16) est laissé tel quel (décision Marc R4 2026-06-22) ; à MONTER seulement s'il en veut plus.
- [x] **`[ASSISTANT-HUB]`** ✅ (2026-07-23, PR #492) — onglet Assistant VISIBLE dans la nav (remplace
  « Prochaine action » — il n'était accessible que par Alt+9/Cmd+K) ; cartes de signaux
  (`AiChatSignalCards` ← `useFinancialSignals` ← `computeFinancialSignals`, moteur PUR partagé avec le
  tool MCP — un seul avis) au-dessus du chat, clic → discussion contextualisée ; widget Haiku
  `getNextBestActions` + cache 1h RETIRÉS de services/claude.ts ; enum `Tab.ACTIONS` retiré (8 sites
  migrés, typecheck comme filet) + redirect deep-link `#ACTIONS`→`#ASSISTANT` ; mode discret = clic
  désactivé (ADR : pas de redaction fragile). Tests : parité narrow↔full du hook, clic/mode discret
  discriminants, scan redirect. ADR complet : docs/adr/.

## 🖥️ Chat conscient de la page (demande Marc 2026-07-22 : « le chat peut réagir à tout sur la page »)
- [x] **`[CHAT-PAGE-CONTEXT]`** ✅ vague 1 (2026-07-22, PR #490) — onglet actif (Tier 1, TOUTES les pages,
  `TAB_LABELS` déplacé en source unique dans `constants.ts`) + Budget en contexte FIN (Tier 2 : période
  humanisée, vue, dépenses/cible/revenus AFFICHÉS, top 3 catégories, filtre personne) via le registre pur
  `services/aiChat/viewContext.ts` + `useViewContextPublisher` (gate mode discret À LA SOURCE). Injection en
  FIN de `system` (figée par envoi — ADR docs/adr/, PAS un tool). Badge « Contexte : Budget —
  juillet 2026 » contestable dans le chat. Page non instrumentée → aveu honnête. Parité canonique verrouillée
  (`Budget.viewContext.test.tsx` : détail ≡ computeBudgetParity/computeIncomeBreakdown — jamais un 3e chiffre).
- [ ] **`[CHAT-PAGE-CONTEXT-V2]`** (M) — vague 2 : instrumenter les autres onglets (Investissements : filtres/
  compte ; Futur : scénario + année survolée ; Impôts : année ; Dettes ; Transactions : recherche/filtre actifs).
  Un onglet = un petit detail typé ajouté à l'union `ViewContextDetail` + un publisher — le pipeline est en place.
- [ ] **`[CHAT-PAGE-CONTEXT-V3]`** (M) — vague 3 : état fin volatile (modal ouvert, tooltip figé du graphe Futur,
  ligne sélectionnée) — évaluer la valeur réelle avant (fragile, très volatile).

## 🔐 Drive — « je veux plus devoir me reconnecter tout le temps » (rappel Marc 2026-07-22)
- [ ] **`[AUTH-DRIVE-STILL-RECONNECT]`** 🔴 (suivi actif, demande Marc réitérée APRÈS le merge de #483) —
  exigence : connecté UNE fois → ça tient (reconnexion seulement après ~8h d'inactivité). `[AUTH-DRIVE-INACTIVITY]`
  (#483, mergée 2026-07-22) livre exactement ça (jeton en localStorage + `renewTokenSilently` prompt='' au boot,
  gaté < 8h d'inactivité). **À VÉRIFIER par Marc une fois le deploy Vercel en prod** : si la reconnexion est
  encore demandée, investiguer les causes résiduelles : (a) session Google elle-même expirée/déconnectée
  (le silencieux ne peut rien), (b) ITP/cookies tiers bloquant l'iframe GIS `prompt=''` (Safari/brave →
  `error_callback`), (c) `lastActivity` jamais enregistré ou > 8h (gate refuse le silencieux), (d) multi-onglets/
  multi-PC (le jeton est device-local — chaque appareil a sa première connexion). Instrumenter au besoin :
  logError info sur CHAQUE échec de `renewTokenSilently` avec la raison GIS exacte, visible dans Réglages → Diagnostics.
  ✅ **Instrumentation livrée (2026-07-24, PR suivante)** : `traceSilentRenewalFailure(context, error)`
  (`gisAuth.ts`) trace `info` la raison GIS exacte, throttlée 1×/(contexte+raison)/session
  (`logErrorThrottled` — le polling 60 s noierait le journal sinon). Câblée aux DEUX trous : le minuteur
  de renouvellement (`gisAuth.ts`, qui avalait TOUT en `.catch(()=>{})` — le vrai trou noir, aucun
  appelant) ET le cas NOMINAL de `trySilentReauth` boot/gate (`syncLifecycle.ts`, jusqu'ici muet). Reste
  la vérif HUMAINE de Marc en prod : ouvrir Diagnostics après une reconnexion redemandée → la raison GIS
  (`login_required` = session Google expirée, `popup_failed_to_open`/cookies = ITP Safari/Brave) tranche.
  **Panel PR #504** : sévérité DÉRIVÉE (`info` nominal / `warning`+stack anormal — un vrai bug du minuteur ne se
  déclasse plus en info) ; **trou 401 fermé** (un `DriveAuthError` — jeton rejeté par l'API Drive, scope révoqué —
  était TOTALEMENT muet aux 2 sites gate+boot ; même surface « reconnexion redemandée » → tracé) ; helper renommé
  `traceSilentAuthFailure` (couvre renouvellement GIS ET 401 Drive).
  ✅ **`[AUTH-DRIVE-BANNER-FLICKER]` fix livré (2026-07-31)** — cause de la « bannière rouge qui apparaît souvent
  et s'enlève parfois seule » (rappel Marc 2026-07-31) : `runBootSync` (polling 60 s + retour d'onglet) basculait
  `connected:false` sur TOUTE erreur post-jeton (timeout Drive transitoire, réseau au réveil de veille) ET dès le
  1er raté du renouvellement silencieux → la bannière « tes changements ne sont PAS sauvegardés » mentait puis
  disparaissait au tick suivant. Désormais (`syncLifecycle.ts`) : jeton valide + erreur Drive non-401 → on RESTE
  connecté (`handleError('boot')`, trace Diagnostics) ; raté TRANSITOIRE du renouvellement → grâce de 3 ticks
  (~2 min) avant la bannière ; échec DÉFINITIF (`AuthInteractionRequiredError` session Google morte, 401
  `DriveAuthError`) → bannière immédiate (elle dit vrai). Pendant la grâce, un push raté affiche la bannière
  « échec de sauvegarde » (honnête, bouton Réessayer). Reste le cas légitime « faut me reconnecter » : session
  Google expirée / cookies tiers — la raison GIS exacte est dans Réglages → Diagnostics.
  **Panel #542 (code-reviewer + silent-failure-hunter, 2 vrais findings, tous corrigés dans la même PR)** :
  (1) réentrance PROUVÉE par sonde — `focus` + `visibilitychange` tirent 2 `runBootSync` quasi simultanés et la
  garde `busy` ne couvre pas la phase jeton → le compteur avançait de 2 pour UN retour d'onglet (bannière dès
  2 alt-tab) → verrou `_bootSyncInFlight` (modèle `_decisionInFlight`), qui déduplique AUSSI les
  `renewTokenSilently` concurrents (`_pendingReject` singleton gisAuth) ; (2) une panne Drive PERSISTANTE
  non-401 restait invisible hors Réglages (la bannière n'affiche que déconnexion/push) → la série de grâce
  compte AUSSI les erreurs Drive post-jeton : 3 ticks ratés consécutifs (toutes causes transitoires
  confondues) → bannière. §3 assumé + documenté (`flushPush`) : pendant la grâce (~3 min max), un flush au
  pagehide peut échouer sans signal — zéro perte (le prochain boot pousse), seul coût = copie Drive périmée
  pour le MCP jusqu'à la prochaine ouverture.

## 📈 PORTFOLIO-HISTORY — courbes de cours réelles (bug Marc 2026-07-22, PR #485)
- [x] **`[PORTFOLIO-HISTORY]`** ✅ 2026-07-22 — courbes par action (depuis 1er achat) + courbe portefeuille
  entier sur les vraies surfaces. Chaîne gratuite Finnhub→Yahoo proxy→CoinGecko (contrat null=erreur/
  []=vide), hydratation persistée (`hydrateAssetHistories`, fraîcheur 24h, pacing 2,5s, FUSION au re-sync),
  builder pur (`buildMarketData` : DCA×close natif×FX, buckets TOTAL_*, agrégat multi-comptes, prix périmé
  >7j exclu, partialHistorySymbols). **Panel adversarial 30 agents : 9 findings confirmés APPLIQUÉS** (dont
  3 ÉLEVÉS mesurés : écrasement colonne multi-comptes 10 k$, garde devise crypto −27,5 %, clés éparses
  ligne 0 → piles Dashboard fausses/modal vide) + matching exact (`historyKeyMatchesSymbol`), cache IDB
  qui survit au boot (+ sweep), chips Investissements distinctes, note honnête excluded/partial.
- [x] **`[HIST-SESSION-HYDRATE]`** ✅ 2026-07-29 (PR #518) — clé stable de symboles en dep de l'effet boot. (S) — hydratation UNIQUEMENT au boot (`useEffect []`) : un actif
  AJOUTÉ en cours de session n'a pas de courbe (ni part au TOTAL) avant le prochain reload, sans message.
  Déclencher une hydratation ciblée à l'ajout d'actif (AddStockForm/import courtier) ou sur changement de
  la liste des symboles.
- [x] **`[HIST-INFLIGHT-DEDUP]`** ✅ 2026-07-29 (PR #518) — dédup in-flight dans withCache (rejet partagé, clé libérée en finally). (S) — au PREMIER boot (store sans priceHistory), `usePastPortfolioHistory`
  (Futur, sans pacing) et `hydrateAssetHistories` (pacé) peuvent fetcher les MÊMES symboles en parallèle
  (withCache ne déduplique pas l'in-flight). Bénin après le 1er boot (le store est hydraté). Dédup in-flight
  dans withCache ou skip usePast quand l'hydratation est en cours.
- [ ] **`[HIST-BENCH-SYMBOL]`** 🟢 (décision produit Marc) — la carte « Marché (CW8 / MSCI) » d'Investissements
  est STRUCTURELLEMENT morte en données réelles (buildMarketData n'émet que les symboles détenus — pas de
  benchmark) → « — » permanent + momentum « bat le marché » comparé à 0. Soit hydrater un benchmark (ex.
  XWD.TO) via la même chaîne, soit retirer la carte et la branche momentum-vs-marché.
- [x] **`[HIST-STORE-SIZE]`** ✅ 2026-08-01 (PR #553 — mesuré ~116 Ko, downsample > 365 j → 1 pt/semaine
  livré ; IDB device-local REJETÉ : un nouvel appareil perdrait les points crypto > 365 j, fenêtre
  CoinGecko). Ancien texte (pré-mesure) : `priceHistory` quotidien depuis le 1er achat vit dans le
  store PERSISTÉ (localStorage + chaque push Drive), croît sans cap — mesurer puis downsampler.
- [x] **`[HIST-PREVIEW-PROXY]`** ✅ 2026-07-29 (PR #518) — const yahooProxy partagée server/preview. (XS) — `vite preview` n'a pas de proxy `/api/history/yahoo` (seul `server.proxy`
  dev est configuré) → repli Yahoo → fallback SPA → HTML → null honnête, graphes vides en preview local.
  Ajouter `preview.proxy` miroir si on se met à utiliser vite preview.

## 🔎 Analyse app complète 2026-07-15 (panel 4 agents — rapport : `docs/ANALYSE_APP_2026-07-15.md`)
> Demande Marc : « une grosse analyse de l'app ». Détail, preuves fichier:ligne et plan d'ordre dans le rapport.

- **`[DETTE-PDF-FX-BYPASS]`** ✅ **LIVRÉ 2026-07-15 (Vague 1)** — `pdfReport.buildHoldingsRows` ET
  `useDerivedFinancials.assetBreakdown` (2ᵉ instance latente RÉVÉLÉE par le garde resserré) routés par
  `assetValueCad` ; garde `assetFxGuard` resserré (n'accepte plus qu'`assetValueCad`/`toCurrencyFactor`, plus le
  `fx`/`factor` nu qui laissait passer le bug). Panel financial-integrity : bascule correcte ou strictement meilleure.
- **`[ARCH-SYNC-SPLIT]`** ✅ **LIVRÉ 2026-07-15 (Vague 3)** — `syncOrchestrator.ts` (892 l.) scindé en **9 modules à
  responsabilité unique + barrel de compat** verbatim (API publique inchangée, zéro site appelant modifié) : `syncStatusStore`
  (propriétaire UNIQUE de `_status`+listeners, racine du DAG), `syncTypes`, `syncSnapshot` (getLocalPayload + helpers purs +
  ceinture persona PUSH), `syncErrors`, `syncMeta`, `syncPush` (`_apiKeysHydrated`/`_pushInFlight`/`_pushTimer`), `syncPull`
  (pullNow + applyPulledPayload + ceinture persona PULL — le point d'écrasement 230k$), `syncLifecycle` (`_decisionInFlight`,
  switch anti-clobber `runDecision`), `syncPolling` (`_pollTimer`), `syncPassphrase`. Règle « un état mutable = un module
  propriétaire » : `grep "let _status"` == 1, double-ceinture `sanitizePersistEnvelope` == 2 (push+pull, non fusionnée),
  `madge --circular` == 0. 81 tests sync verts, suite complète + typecheck OK.
- **`[SEC-DRIVE-ENCRYPT-DEFAULT]`** ⏸️ **EN ATTENTE DÉCISION MARC (2026-07-16)** → voir `docs/A_FAIRE_MOI.md` §O-SYNC.
  Payload Drive EN CLAIR par défaut (chiffré seulement si passphrase opt-in) alors que les clés API ont déjà un
  chiffrement dérivé du `sub` Google (keyCipher). MAIS l'appliquer au payload touche l'anti-clobber (decideOnLoad
  lit le payload clair pour le noop « contenu identique » ; summarizeForConflict lit assets/tx en clair) + exige une
  migration de format (`SyncEnvelope.enc` bool→tri-état). Plan-first Claude 2026-07-16 : gain modeste (Drive privé,
  clé `sub` non-secrète) vs risque money-critical → reco basse priorité / passphrase pour du vrai secret. Décision Marc requise.
- **`[SEC-VISION-CONSENT-INJECTION]`** ✅ **LIVRÉ 2026-07-15 (Vague 4)** — clause anti-injection `VISION_INJECTION_GUARD`
  (`utils/promptSafety.ts`) câblée dans les 2 prompts Vision (paie + relevé) : un document peut contenir du texte
  adversarial lu par le modèle → traité comme donnée, jamais comme instruction (test scan) ; + `temperature: 0` sur les
  2 appels Vision (extraction déterministe). + avis de confidentialité EXPLICITE Loi 25 sur les **3 surfaces d'envoi
  brut** (relevé `ImportBankStatement`, paie `PayslipUploadCard` + `TaxCenter` — panel security-privacy). RESTE (petits
  suivis) : `[SEC-ONBOARDING-VISION-TEXT]` (le texte d'onboarding « marchands tronqués + arrondis 100 $ » décrit le
  pipeline TEXTE, trompeur pour le Vision brut — à nuancer) ; QA manuelle du guard (upload piégé « ignore… ») non
  automatisable côté no-backend ; aperçu d'import limité à 3 lignes (`slice(0,3)`, pré-existant).
- **`[MCP-CHARTDATA-SUM-GUARD]`** 🟡 MOYEN (M) — garde-fou générique : tout nouveau tool MCP qui SOMME des flux
  chartData retombe dans le piège MCP-RETIREMENT-VERDICT (décaissement non-enreg sans champ Retrait*) ; corrigé au
  cas par cas aujourd'hui, à systématiser (test/lint de convention sur mcp/tools/*).
- **`[UX-STATEMENT-REMINDER]`** ✅ **LIVRÉ 2026-07-15 (Vague 3a)** — helper pur `computeStatementReminderStatus`
  (détecte : aucune transaction réelle ce mois-ci = relevé non importé, ≥ 1 mois de retard, après le 5 du mois) +
  bannière dismissible `StatementReminder` (onglet Budget, CTA « Importer mon relevé » → onglet Transactions, dismiss
  keyé par mois courant → réapparaît le mois suivant si toujours en retard). Le filet d'import mensuel qui manquait.
- **`[DETTE-GODFILE-BUDGET]` / `[DETTE-GODFILE-INVESTMENTS]`** 🟡 MEDIUM (L, au fil de l'eau) — 1 289/1 163 lignes ;
  répliquer le pattern « sections » qui a réussi sur Settings (207 l.) ; extraire coupleAnalysis/fiscalBreakdown/
  alerts vers services/budgetAnalysis.ts (purs, testables) et DEFAULT_TARGET_MODEL/écarts vers services/.
- **`[DETTE-CLAUDE-SPLIT]`** 🟡 MEDIUM (M) — services/claude.ts = 8 features IA indépendantes (918 l.) → split
  mécanique services/claude/ + re-export (zéro breaking).
- **`[DETTE-TOLOCALESTRING-NU]`** ✅ **LIVRÉ 2026-07-15 (Vague 1)** — 6 sites `toLocaleString()` nus (AiAssistant ×5,
  taxApril payé+remboursement) routés par `formatNumber`/`formatCAD` (NaN → « — »). Zéro `toLocaleString()` nu restant
  (grep exhaustif). Bonus panel : `AiAssistant:103` `success`/`fvi` passés de `!= null` à `Number.isFinite` (évite « NaN% »).
- **`[DETTE-TESTGAP-MARKETDATA]`** ✅ **LIVRÉ 2026-07-15 (Vague 1)** — `tests/services/marketDataRouting.test.ts` :
  6 tests de routage `pickProvider` (crypto→CoinGecko même sans clé ; action→Finnhub ; crypto va TOUJOURS à CoinGecko
  même avec clé), preuve par l'URL réellement appelée (coingecko.com vs finnhub.io).
- **`[DETTE-DEADCODE-2026-07]`** ✅ **LIVRÉ 2026-07-15 (Vague 4)** — locales `_`-préfixées mortes retirées (Budget.tsx
  `_totalTaxDisplay`/`_totalGrossDisplay` + leur chaîne source `totalTaxMonthly`/`totalGrossIncomeMonthly`, RealEstate
  `_downPaymentPercent`, AiAssistant `_retirementAge`). typecheck clean après retrait.
- **`[DETTE-CHART-THEME-DUP]`** 🟢 LOW (S) — tooltip Recharts dupliqué 14× avec 4 fonds différents → constante
  partagée CHART_TOOLTIP_STYLE. · **`[DETTE-INPUT-PRIMITIVES]`** 🟢 LOW→M — 81 inputs inline sans primitive
  Field (40 dans AdvancedProjectionParams). · **`[SEC-GA-DEFER-CONSENT]`** 🟢 LOW (S) — injecter gtag.js APRÈS
  consentement. · **`[ENG-RAMQ-FIELDS]`** 🟢 LOW (M) — 2 TODO moteur (enfants à charge, assurance médicaments privée,
  champs User additifs).
- **DÉCISIONS DE GEL proposées (produit)** : `[CIX]` en entier + raffinements per-conjoint/dons + durcissement
  OAuth au-delà de l'existant + chasses d'affichage LOW sans impact patrimoine — tant que la situation de
  l'utilisateur (solo, 26 ans) ne change pas. La doc « 31 sous-modules projection » corrigée → 41.

### Findings du panel Vague 1 (2026-07-15) — routés (pré-existants, hors périmètre de la vague)
- **`[AI-PROMPT-FAKE-ZERO]`** ✅ **LIVRÉ 2026-07-16 (Vague 4)** — `roundToHundred` non-fini rend désormais `NaN` (plus `0`) ;
  nouveau helper `promptCad(x)` = fini ? `<arrondi>$` : `(non disponible)` appliqué aux **27 sites d'affichage** de prompts
  (`services/claude.ts`) ; le site pseudo-JSON de `categorizeBatch` garde `amount: null` pour un montant non fini. Plus de faux
  « 0$ » envoyé au modèle (no-fake-data) — pendant `claude.ts` du fix Vague 1 d'`AiAssistant.tsx` (« — » via `formatNumber`).
  Test discriminant via `buildRebalancePrompt` (NaN → « (non disponible) », jamais « 0$ »/« NaN »).
- **`[MCP-PROMPT-SCRUB]`** ✅ **LIVRÉ 2026-07-16 (Vague 4)** — `jsonContent` (`mcp/tools/_dataAware.ts`) applique `scrubMcpDeep` :
  neutralise (strip contrôle + markup/injection, borne 200 via `sanitizePromptText`) les valeurs sous les CLÉS de texte libre
  utilisateur (`USER_TEXT_KEYS` = name/payee/category/label/employer/description) — nom d'actif Finnhub, payee/catégorie d'un PDF
  de courtage, nom de projet/dette/utilisateur, employeur. ⚠️ **PAS un scrub aveugle** (1er jet réfuté par double panel
  security+code-reviewer) : les notes/verdicts money-critical rédigés par le CODE (`notes`, `netTaxSettlementsNote`, `dollarsBasis`…)
  et les identifiants (`symbol` → `^GSPC`) passent INTACTS (le scrub aveugle les tronquait à 200 → détruisait les garde-fous
  anti-mésinterprétation). Central → couvre tous les tools data-aware pour les clés connues. Tests discriminants (nom malveillant
  neutralisé ; « Vanguard S&P 500 » + notes code-auteur au-delà de 200 c. intactes).
- **`[AUTH-DRIVE-PERSIST]`** ✅ **LIVRÉ 2026-07-16** (demande Marc « ne plus me reconnecter à Drive à chaque reload ») — jeton
  GIS `sessionStorage`→`localStorage` (clé dédiée, jamais synchronisée) + renouvellement silencieux avant ~1h (`gisAuth.ts`).
  DOUBLE panel (security-privacy + code-reviewer) a trouvé + fait fixer une régression HIGH : le renouvellement débornait une
  « sync fantôme post-déconnexion » cross-onglet (Loi 25) → écouteur `storage` qui purge le jeton mémoire quand un autre onglet
  efface la clé (disconnect OU deleteRemoteData). + plancher 30 s (anti-boucle), skip si acquisition interactive en vol. 19 tests.
  Découverte livrée à part : `[PROJECTION-PERSIST]` (voir entrée dédiée ci-dessous).
- **`[PROJECTION-PERSIST]`** ✅ **LIVRÉ 2026-07-16** (demande Marc « la projection reste, badge si pas à jour ») — la signature
  de révélation (`revealedProjectionSig`, HASH court) passe d'un useState local à un champ PERSISTÉ du store (additif, hors
  denylist → localStorage + sync Drive → autre PC) ; blob figé en IDB chiffrée (record `revealed` de `lockedProjectionStore`,
  refactor saveRecord/loadRecord/clearRecord par id, zéro migration) ; substitution unique `results = gel ?? live` → courbe/
  KPIs/plan cohérents ; badge « Pas à jour » + « Recharger avec mes données » / « Rechoisir mes leviers » (choix Marc : FIGER,
  jamais recalculer en douce). Repli honnête sans blob (autre PC) : live + badge. Gel coupé en mode test. Panel (3 agents) →
  4 findings réels APPLIQUÉS : garde no-fake-data au reload (carte « se recharge » au lieu de KPIs 0 $), garde mode-test sur la
  SUPPRESSION du blob réel, hash au lieu du JSON complet persisté, dédup module-level des écritures IDB (~1-2 Mo par visite
  d'onglet sinon). 7 tests discriminants (git-stash rouges) + round-trip IDB réel (devDep `fake-indexeddb`).
  Suivis non bloquants (panel) :
  - **`[FUT-TOUCH-TARGETS]`** 🟢 LOW (S) — les petits boutons de l'onglet Futur (période, Verrouiller, Ré-optimiser, badge)
    font ~22-24 px de haut sans `.touch-target` (pattern systémique du fichier, pas une régression) — à uniformiser avec le
    sweep a11y des CHAMPS déjà en attente de Marc.
  - **`[PROJ-REVEAL-RACE]`** 🟢 LOW — course étroite « Rechoisir » vs sauvegarde-miroir en vol (blob orphelin possible,
    récupérable en re-révélant) ; et vérification empirique de la cadence de republication moteur (console.count sur l'effet
    miroir, cf note historique syncPush:138) si un doute de fréquence d'écriture IDB apparaît.
- **`[A11Y-BANNER-HOVER-CONTRAST]`** ✅ **LIVRÉ 2026-07-16 (Vague 4)** — `BackupReminder` variante quota : `hover:bg-danger-500`
  + blanc 12px = 3,76:1 (< AA) → hover qui FONCE (`hover:brightness-90` = 5,23:1 mesuré en linéaire). ⚠️ Le fix CeliAssetNudge
  (`hover:brightness-110`, base info-600 = 4,81:1 OK) aurait échoué ICI de justesse (danger-600 ×1,1 = 4,48:1) — le facteur
  dépend de la BASE, toujours mesurer, jamais copier-coller. Variante warning (translucide) mesurée conforme (8,64/5,27) — rien
  à changer. La GÉNÉRALISATION au design-system des bannières rejoint le sweep a11y des champs (en attente preview Marc).

## 🔬 Audit financier 2026-07-16 (passe n°2) — findings vérifiés (rapport : docs/AUDIT_FINANCIER_2026-07-16.md)
> Cœur AAA confirmé (fiscal 0 écart/~180 valeurs ; conservation : 31 scénarios, résiduel max 0,02 $ ; 41/41
> modules testés ; 2661/2661). Lot de juin fermé 12/14. Les findings ci-dessous sont TOUS contre-vérifiés
> dans le vrai code (trust-but-verify) — détail/preuves au rapport §5.

- [x] **`[STORE-REHYDRATE-SILENT]`** 🔴 CRITIQUE (S) — ✅ 2026-07-17 (lot corrections audit) : `onRehydrateStorage`
  ajouté (logError critical + `getHydrationStatus()` exposé), `migratePersistedState` wrappé avec traçage PAR PALIER
  (`palier « v5→v6 »` dans le message), toast CRITIQUE honnête dans App (« NE RIEN SAISIR — restaure un backup », le
  blob reste INTACT). 4 tests discriminants (`tests/store/hydrationNet.test.ts`), prouvés rouges sur l'ancien code.
- [x] **`[DASH-NW-DUP]`** 🔴 HIGH (M) — ✅ 2026-07-17 (lot corrections audit) : le repli sans CSV route sur
  `computePresentNetWorth` (dettes soustraites), le chemin principal sur `computeTotalDebt` (gardé isFinite) ;
  périmètre immo ÉTIQUETÉ sur le KPI (« équité immo incluse » seulement si immo présent) + « Revenu actif » étiqueté
  « (net, salaire déclaré) ». Test discriminant Dashboard (persona endetté : 590, pas 990), prouvé rouge avant fix.
- [x] **`[INCOME-3WAY-SPLIT]`** 🔴 HIGH (S-M) — ✅ 2026-07-17 (lot corrections audit) : `buildFinancialSnapshot`
  (→ MCP get_financial_overview + IA) route sur `computeMonthlyActualAverages` (même base que Budget), repli
  étiqueté `monthlyIncomeSource: 'declared'` ; le prompt `claude.ts` étiquette « (réel, moyenne des transactions) »
  vs « (salaire déclaré) » ; `NextBestAction` consomme désormais `buildFinancialSnapshot` (fin du recalcul local).
  2 tests discriminants (2300 réel ≠ 4000 déclaré, remboursement exclu), prouvés rouges avant fix.
- [x] **`[MCP-TOOLS-SILENT-CATCH]`** 🟠 ÉLEVÉ (S) — ✅ 2026-07-21 (lot audit n°2) : les **7/7** catch de frontière
  (`withState` ×2, `runApply` ×2, `applyPayslip` — routé sur `runApply`, dé-duplication finding panel —,
  `connectDrive` trouvé par le panel) appellent `logError` AVANT de rendre la réponse d'erreur à Claude → traçable
  dans les logs Cloud Run (errorLogger route console.*). Tests `tests/mcp/mcpBoundaryLog.test.ts`
  (3 discriminants + 1 anti-bruit nominal), prouvés rouges pré-fix.
- [x] **`[SYNC-APIKEYS-SILENT]`** 🟡 MOYEN (S) — ✅ 2026-07-21 (lot audit n°2) : échec `saveApiKeys` au PULL →
  `logError` warning (best-effort préservé) **+ côté PUSH (finding panel)** : les 2 catch clés-API (chiffrement ;
  relecture de préservation D5) journalisés aussi. Tests discriminants dans `syncOrchestrator.flow.test.ts`.
- [x] **`[DEBT-SUM-DUP]`** 🟡 MOYEN (S) — ✅ 2026-07-21 (lot audit n°2) : les 2 sites restants
  (`HealthIndicator:108`, `DebtManager:73`) routés sur `computeTotalDebt` (NextBestAction et Dashboard l'étaient
  déjà depuis le lot #471). Zéro reduce local de soldes de dettes restant.
- [x] **`[MCP-USERTEXT-LANDMINE]`** 🟡 MOYEN (S, préventif) — ✅ 2026-07-21 (lot audit n°2) : `USER_TEXT_KEYS`
  += `insurer`/`beneficiary`/`destination`/`userNotes`. ⚠️ `notes` N'EST PAS ajouté (RÉSERVÉ code-auteur,
  cf MCP-PROMPT-SCRUB — un futur champ de notes UTILISATEUR doit s'appeler `userNotes`). Test de garde.
- [x] **`[LOG-TOKEN-ANCHORED]`** 🟢 LOW (XS) — ✅ 2026-07-21 (lot audit n°2) : `token` → `.*token` (suffixe ancré)
  → `accessToken`/`refresh_token`/`idToken` redactés, `factor` toujours épargné (anti-faux-positif testé).
- [x] **`[MCP-RUNPROJECTION-AMBIG]`** 🟢 LOW (XS) — ✅ 2026-07-21 (lot audit n°2) : description réécrite
  « CALCULATEUR GÉNÉRIQUE… ne lit PAS les données réelles » + aiguillage explicite vers `get_projection`
  (vraie projection) / `get_retirement_outlook` (retraite) / `simulate_what_if` (scénarios sur SES données).
- [x] **`[LINT-4-WARNINGS]`** ✅ réglé dans la PR du rapport (3 locales mortes `financialSnapshot.ts` + import
  `within` orphelin `Budget.test.tsx`) — lint 0 problème.
- Dette non urgente (L, plan-first `architect`) : découpe de `Budget.tsx` (+20 % en 3 sem.) / `FutureProjection.tsx`
  (+13 %) / `TaxCenter.tsx` (+31 %) — le terrain où naissent les récidives de la classe n°1.

## 🔴 Données de test dans les vraies données (2026-07-15) — incident « fausses transactions »
> Marc : « j'ai des fausses transactions sans doute des profils de test je veux plus que ça arrive jamais ».
> Constat (via MCP + code) : ~600 transactions du persona « Karim » (`persona-tx-*`) + objectif `kar-fg1`
> mélangés aux ~200 vraies transactions Desjardins ; [Probable] budgets `kar-b*` aussi. Fuite ANTÉRIEURE
> aux gardes actuelles (persona activé ~2026-06-07), chemin exact non identifiable a posteriori.

- **`[BUDGET-INCOME-REAL]`** ✅ **LIVRÉ 2026-07-16** (bug Marc « les revenus semblent pas logiques ») — revenu du Budget =
  vraies transactions des catégories `Salaire`/`Revenus divers` (`computeIncomeBreakdown`), ventilé, transferts/doublons/
  positifs non-revenu exclus ; badge + payload IA sur revenu réel (moyenne mois pleins) ; carte Santé étiquetée « (salaire
  déclaré) » (garde le brut config, requis pour la décompo brut→net). Panel financial-integrity : 0 bug bloquant.
  Découvertes (SUIVI) :
  - **`[TX-INCOME-CATEGORY-LIST]`** ✅ **PÉRIMÉ 2026-07-16 (faux positif du panel)** — `Revenus divers` EST déjà proposé en
    catégorisation manuelle : `Transactions.tsx:134` unit `systemCats` avec `RULE_CATEGORIES` (`categoryRules.ts:17` contient
    `Revenus divers`). Le panel n'avait lu que le tableau `systemCats` codé en dur (l.131), pas l'union. Rien à corriger.
  - **`[TAX-MCP-INCOMEAVG-TEST]`** ✅ **LIVRÉ 2026-07-16** — test d'intégration sur le contrat MCP `get_tax_situation`
    (`tests/mcp/dataAwareTools.test.ts`) : un remboursement +500 dans un mois plein N'inflate PAS `realMonthlyAverages.income`
    (2300 et non 2800). La sémantique de `computeMonthlyActualAverages` était déjà verrouillée à la source
    (`budgetSync.test.ts:219`) ; ce test verrouille en plus le pass-through côté MCP (chiffre que LIT Claude).
- **`[INCOME-PROVENANCE]` + `[TAX-DETAIL]`** ✅ **LIVRÉ 2026-07-15** (demande Marc : chaîne paie→Impôt→Santé,
  source unique) — salarySource estampillé (scan paie UI + apply_payslip MCP), bannière de provenance +
  détail des retenues (féd/QC/RRQ/RQAP/AE) + réel des transactions dans l'onglet Impôt ; get_tax_situation
  enrichi (withholdings/netMonthly/salarySource/realMonthlyAverages). MCP v0.7.1 → ✅ **Cloud Run redéployé par Marc
  2026-07-16** (dernière version en ligne : v0.7.x + OCC + prompt-scrub).
- **`[BUDGET-MONTHLY-LEDGER]` + `[BUDGET-PAST-AVG]`** ✅ **LIVRÉ 2026-07-15** (demandes Marc : réel
  revenus+dépenses par mois ; budget du mois courant = moyenne de tout le passé ; tuiles Budget/Dépenses
  identiques dédupliquées ; « Revenus 0 » explicité — relevé de compte mensuel en retard sur la carte).
  Cibles `autoTarget` (champ additif) recalculées à chaque chargement ET en cours de session ; grand
  livre 12 mois avec bucket « Autres / non classées » (Σ lignes ≡ Total).
- **`[TX-CATEGORY-RULES]`** ✅ **LIVRÉ 2026-07-15** — règles déterministes de catégorisation (payees QC du corpus
  réel de Marc, ~88 % de couverture mesurée) branchées sur import CSV + bouton Auto-catégoriser (règles AVANT IA)
  + MCP apply_bank_statement + listes de catégories. Jeu canonique 16 catégories (`RULE_CATEGORIES`).
- **`[BUDGET-TX-CATEGORIES]`** ✅ **LIVRÉ 2026-07-15** (verbatim Marc : « seulement et exactement les meme
  catégories que dans transactions ») — sync auto Budget↔catégories observées (`utils/budgetSync.ts`, cible
  suggérée = médiane 6 mois ; retraits à la 1re passe du montage seulement) + table « Historique par catégorie »
  (12 mois, moyenne par mois actif).
- **`[PERSONA-PURGE]`** ✅ **LIVRÉ 2026-07-15** — registre d'ids d'artefacts (`testPersonas/artifactIds.ts`,
  parité fixtures↔registre verrouillée par test-scan) + sanitizer pur (`personaSanitizer.ts`) ancré à
  5 endroits : boot (self-heal + toast), sortie de mode test (snapshot), push Drive, pull Drive,
  restauration de backup. 22 tests (direction anti-faux-positif incluse). La purge des données de Marc
  s'exécute AUTOMATIQUEMENT au prochain chargement de l'app (Vercel déploie au merge).
- **`[PERSONA-LEAK-ROOTCAUSE]`** 🔍 LOW — chemin de fuite exact inconnu (antérieur aux gardes SYNC-ANTI-CLOBBER
  et shouldPush-test). Si récidive malgré PERSONA-PURGE (le log `purgePersonaArtifacts` en ferait foi), creuser :
  restauration d'un backup pris EN mode test avant #217, ou merge conflit Drive d'une époque sans garde.
- **`[FISC-PAYROLL-BASE-INVEST]` + `[TAX-APP-MCP-BASE]`** ✅ **LIVRÉ 2026-07-15 (Vague 2, MCP v0.7.3)** —
  `calculateFiscalReport` gagne un 7ᵉ param optionnel `employmentIncome` (assiette EMPLOI RRQ/RQAP/AE) DISTINCT de
  l'assiette imposable (paliers) ; défaut = grossIncome → **rétrocompat bit-identique** pour les ~15 appelants moteur
  (prouvé par projection-validator + moneyConservation 20/20). TaxCenter passe `uGross` (salaire), get_tax_situation
  aligné sur le MÊME helper partagé `services/taxEstimate.ts` (placement imposable ajouté à l'assiette + `employmentIncome`
  = salaire). **Mesuré : ~1 016 $/an de cotisations sur-évaluées évitées** (salaire 50 k + 230 k non-enreg), discriminant
  git-stash prouvé (0 sans le fix). Panel 4 agents : cœur correct, averageRatePct MCP recalé sur l'assiette réelle +
  `taxableInvestmentIncome` exposé. ⚠️ Redéploiement Cloud Run requis (v0.7.3).
- **`[FISC-SOLO-INVEST-SPLIT]`** 🔧 MEDIUM (finding panel Vague 2, financial-integrity + code-reviewer, PRÉ-EXISTANT) —
  le split du revenu de placement `1/config.users.length` répartit sur les 2 têtes du tuple `[User,User]` MÊME en solo :
  la part attribuée au « conjoint fantôme » (ou à un conjoint payé en `netSalary` seul, exclu de perUserReports côté MCP)
  est abritée sous SON BPA / non imposée → **sous-imposition du placement d'un solo/mono-salarié** (Marc : ~la moitié de
  ~12,6 k$ non imposée). Fix (leçon PH4E-OWNER-EDIT : `.length` d'un tuple est vacueux) : splitter par le nombre de
  contribuables RÉELS (`users[i].name?.trim()` ou brut/net > 0), app ET MCP au même helper. ⚠️ Change les chiffres affichés
  (impôt estimé du solo ↑) → à valider avec Marc + plan-first (touche le split per-conjoint, gelé CIX).
- **`[FISC-ASSETLOC-INTL]`** 🔧 MEDIUM — **ÉVALUÉ 2026-07-15 (Vague 2), DIFFÉRÉ** : s'applique au TYPE de titres de Marc
  (ETF EU internationaux) mais PAS à leur emplacement actuel (100 % non-enregistré, où la retenue étrangère 15 % EST
  créditable — la perte n'existe qu'en CELI/REER, où Marc a 0 $). Le BACKLOG note lui-même « fix non trivial (le patch naïf
  reste 0) ». À reprendre si Marc met de l'international en CELI/REER (cf CELI-ASSET-NUDGE). Latent, pas stale. Détail infra ↓.
- **`[BACKUP-PROMISE-CATCH]`** ✅ **LIVRÉ 2026-07-15 (Vague 4)** — `return await new Promise(...)` appliqué à `createBackupNow`
  ET aux 3 fonctions sœurs du même fichier (`listBackups`/`deleteBackup`/`clearAllBackups`, même bug — panel code-reviewer :
  `restoreBackup` appelait `listBackups` HORS de son try → rejet async non capté sur le bouton « Restaurer »). Un rejet ASYNC
  (tx/req.onerror IndexedDB, ex. quota) repasse désormais par le catch → journalisé + repli. Vrai impact confirmé : le bouton
  « Backup maintenant » (`AutoBackupPanel`, sans try/catch amont) restait en spinner infini. Discriminant git-stash prouvé.
  App.tsx self-heal aligné (`if (!backup)` + commentaire à jour).
- **`[PURGE-TOAST-UX]`** 🎨 LOW (finding panel) — seuls le boot notifie par toast ; les purges au pull Drive /
  sortie de mode test ne sont visibles qu'en SystemView (logError). Si Marc veut la notification partout :
  abonnement générique aux entrées storage PERSONA-PURGE → toast. (`restoreBackup` recharge la page → toast inutile.)

## 🔴 Intégrité des données Drive + MCP (2026-07-14) — incident perte de 230k$ + audit 6 alertes
> Marc a perdu 230k$ de placements (reconnexion Drive → écrasement du local par une vieille copie). Récupéré
> via auto-backup IndexedDB. Audit adversarial (12 agents) des 6 alertes claude.ai : verdicts ci-dessous.
> ⚠️ **Les items MCP requièrent un REDÉPLOIEMENT Cloud Run** (`mcp/deploy.sh`) pour que Marc en profite.

- **`[SYNC-ANTI-CLOBBER]`** 🔧 ✅ **LIVRÉ (PR à venir, 2026-07-14)** — `decideOnLoad` sans `restoreIntent` (une seule
  garde anti-perte : local réel + Drive divergent → `conflict`, jamais d'écrasement auto) + `SyncConflictModal` global
  (résumé « cet appareil vs Drive ») + `SyncStatusBanner` (alerte déconnexion/erreur push) + `flushPush` au masquage
  d'onglet + gate HARD-block (`LoginGate`). Discriminant git-stash prouvé. **Marc : mettre `VITE_GOOGLE_GATE=1` sur Vercel.**
- **`[MCP-RETIREMENT-VERDICT]`** ✅ **LIVRÉ 2026-07-14 (PR MCP v0.6.0)** — `get_retirement_outlook` expose désormais le
  décaissement du portefeuille (`incomeSources.portfolioWithdrawals`, retraits REER/CELI + loyers, moyenne 1re année déflatée
  par point) et `meetsIncomeTarget` est basé sur la SOUTENABILITÉ du plan (`minNetWorth > 0` + MC ≥ 85 si demandé) — plus
  jamais « sous la cible » pour un plan autofinancé (MC 98 %). NB mesuré : le décaissement NON-ENREGISTRÉ n'a pas de champ
  moteur (`Retrait*`) → sommer les revenus sous-estime toujours (3 923 $ identifiables vs cible 5 500 $ sur un plan qui
  tient) → verdict = signal moteur, pas somme. Discriminant git-stash prouvé (DINK : false→true).
- **`[MCP-PAYSLIP-BACKUP]`** ✅ **LIVRÉ 2026-07-14** — `driveStateSource.saveState` : backup Drive horodaté
  (`financeai-sync.json.<ISO>.bak.json`, rolling 5, appDataFolder) AVANT tout écrasement, FAIL-CLOSED (backup impossible →
  write refusé) ; garde de concurrence (`updatedAt` a avancé depuis la lecture → refuse, rien d'écrasé, cache store invalidé
  → le retry relit du frais). `backupPath` désormais réel côté Drive (spec des apply_* tenue). Discriminant prouvé.
- **`[MCP-TAX-COUPLE]`** ✅ **LIVRÉ 2026-07-14** — `get_tax_situation` calcule PAR CONJOINT puis somme (aligné moteur
  `taxDecember.ts:369-395`) ; `marginalRatePct` = marginal du conjoint au plus haut revenu (jamais celui du total fusionné) ;
  détail `perUser`. Discriminant : couple 60/60 → ~22 k$/36,1 % (l'ancien code rendait 33 435 $/45,7 %). Solo inchangé (Marc).
- **`[MCP-STALE-FRESHNESS]`** ✅ **LIVRÉ 2026-07-14** — `mcp/state/freshness.ts` : la source Drive publie l'`updatedAt` du
  blob lu/écrit ; `withState` appose une note de fraîcheur à CHAQUE réponse (date + âge ; > 6 h → avertissement « possiblement
  périmées, ouvre l'app pour pousser »). Claude sait désormais quand la copie Drive est vieille.
- **`[PROJ-TAXPAID-LABEL]`** 🔶 **partiellement livré 2026-07-14** — surface MCP faite : `get_projection` ET `simulate_what_if`
  renomment le champ en `netTaxSettlements`/`netTaxSettlementsDelta` + note explicite (« PAS l'impôt total payé »). RESTE
  (moteur, non-money-critical) : renommer/documenter `totalTaxesPaid` côté `projection.ts:1444` et borner
  `taxLeakage`/`avgEfficiency` (`Math.max(0, …)`, monteCarlo.ts:106/137 — efficacité > 100 % possible avec un compteur
  négatif). ⚠️ touche des seuils de tests MC → re-baseliner prudemment.
- **`[ASSET-FX-DISPLAY]`** ✅ **LIVRÉ 2026-07-14 (PR FX)** — 6 surfaces UI sommaient `quantity × currentPrice` SANS
  conversion de devise (prix stockés en NATIF) → patrimoine SOUS-affiché de ~70 k$ (l'app disait 160 352 $, la vraie
  valeur CAD ≈ 230 k$ — le MCP avait raison, incident « je devrais pas avoir 230k » élucidé). Fix : source unique
  `assetValueCad` + 5 sites convertis (NetWorthByOwnerCard, Investments, Dashboard ×2, HealthIndicator,
  AssetLocationCard) + csvExport documenté natif-par-ligne + test-garde scan `assetFxGuard` (discriminant prouvé).
- **`[MCP-APPLY-DEBT]`** ✅ **LIVRÉ 2026-07-15 (demande Marc « rajouter des dettes avec mcp genre achat de voiture »)** —
  tool `apply_debt` (v0.7.0) : ajoute/met à jour PAR NOM une dette RÉELLE (update PARTIEL — champs $ optionnels en màj,
  requis à l'ajout ; idempotent au retry, jamais de doublon, description avertit « même nom = écrasement »),
  catégorie inférée du nom (auto→Car, études→Student, carte→CreditCard), bornes anti-injection D9 + gardes non-fini
  côté MÉTIER (bypass-Zod couvert, leçon MCP-WHATIF). ⚠️ Sémantique moteur documentée dans la description : dettes
  DÉJÀ CONTRACTÉES seulement (servies dès le mois 0) — achat FUTUR/hypothétique routé vers `simulate_what_if`
  (garde-fou [MCP-WHATIF-DATED-DEBT]). ⚠️ Redéploiement Cloud Run requis.
- **`[MCP-DIRECT-EDIT]`** 🚧 (demande Marc 2026-07-28 « change mes liquidités et tout tout tout avec mcp juste en le
  demandant » + « confirmation » avant chaque écriture) — écritures directes « juste en le demandant », avec
  confirmation à 2 temps (dry-run + `confirm:true`, cf `RunApplyOptions`/`runApply`) :
  - [x] **Lot 1 — `set_cash`** ✅ 2026-07-28 : ajuste le solde de LIQUIDITÉS à une cible. Cash DÉRIVÉ
    (`computeStartingCash`, source unique) → DELTA sur `initialBalances.LIQUIDITE` (visible Réglages → Comptes,
    jamais d'écrasement des transactions), idempotent, borné (0 → 100 M$) + garde non-fini métier. Invariant
    round-trip prouvé (`computeStartingCash(next) === target`). ⚠️ Redéploiement Cloud Run requis pour claude.ai.
  - [x] **Lot 2 — `set_budget_item`** ✅ 2026-07-29 : upsert PAR NOM (casse/accents ignorés), update
    PARTIEL (cible/fréquence/nature/répartition), éditer la cible → `autoTarget:false` (BUDGET-TX-CATEGORIES),
    bornes 0→1 M$ + non-fini, id `cat_<ts>_<rand>`. Confirmation 2 temps. MCP v0.9.0.
  - [x] **Lot 3 — `upsert_savings_goal`** ✅ 2026-07-29 : upsert PAR NOM, update PARTIEL (cible/accumulé/
    échéance `YYYY-MM(-DD)`/icône), défauts ajout (accumulé 0, 💰), id `goal_<ts>_<rand>`. Confirmation 2 temps.
  - [ ] **`[GOAL-DEADLINE-UI]`** 🟡 (S, finding financial-integrity PR #518) — la carte d'un objectif
    existant (Planning.tsx) n'affiche NI n'édite `deadline`, alors que l'échéance pilote un décaissement
    RÉEL dans la projection (retrait cible−accumulé au mois de l'échéance) et que le MCP peut désormais la
    poser : une écriture IA non visible/réversible à l'écran. Afficher l'échéance sur la carte + permettre
    de l'éditer/effacer.
  - [x] **Lots 4-5 — `delete_item`** ✅ 2026-07-29 (ADR docs/adr/) : suppression actif/dette/objectif,
    correspondance normalisée EXACTE (ambiguïté → throw, accountType pour un symbole multi-comptes),
    aperçu des effets (courbe passée, NW, décaissement), confirmation 2 temps stricte. « Vente totale » =
    suppression (quantity:0 réfuté : holdingsAt compte les purchases → courbe fausse à vie). Transactions
    DIFFÉRÉES (cash dérivé — chemin sûr = isDuplicate, sémantique à ne pas deviner par l'IA). MCP v0.10.0.
  - Salaire : DÉJÀ couvert par `apply_payslip` (aucun nouveau tool). Immobilier : différé.
- **`[ASSET-CURRENCY-BACKFILL]`** 🔧 (résidu panel FX) — un actif LEGACY sans champ `currency` est traité 1:1 CAD
  (désormais JOURNALISÉ par `assetValueCad`, plus muet) ; le fix propre = backfill de migration (défaut assumé +
  documenté) OU invite UI à préciser la devise. Attendre de VOIR le log apparaître chez un utilisateur réel avant
  de migrer (peut ne concerner personne). Effort S.
- **`[HUB-REFRESH-CRON]`** ✅ **LIVRÉ 2026-07-22** — refresh AUTONOME des prix côté serveur (Marc : « les données
  de finance ai sont pas à jour mais j'ai pas envie d'aller dans l'app »). `mcp/refreshPrices.ts` (`runPriceRefresh` :
  `getWithVersion` → `refreshAssetPrices` en `force:true` via le MÊME moteur que le boot app → `applyPricePatches` →
  `save(next, version)` OCC ; écrit SEULEMENT si un cours a changé ; ne touche QUE `currentPrice`, jamais les données
  saisies ; skip honnête si pas de provider) + route `POST /refresh` (`mcp/http.ts`, activée par `FINANCEAI_REFRESH_SECRET`
  ≥16 car., Bearer temps constant, conflit OCC = `200 {ok:false}` transitoire). Déclencheur GitHub Actions gratuit
  (`.github/workflows/refresh-prices.yml`, 6 h + manuel — Cloud Run scale-to-zero, cron externe le réveille).
  `deploy.sh` monte `financeai-refresh-secret` + `financeai-finnhub-key` (optionnelle, actions) s'ils existent.
  5 tests (`tests/mcp/refreshPrices.test.ts`). ADR `docs/adr/`. ⚠️ Marc : secrets Cloud Run + GitHub + redéploiement.
- **`[PRICE-REFRESH-LIVE]`** ✅ **LIVRÉ 2026-07-14 (PR à venir)** — `services/priceRefresh.ts` : `refreshAssetPrices`
  (getQuote séquentiel espacé 2 500 ms ≈ 24/min, sous CoinGecko free ~30/min — jamais de Promise.all) + patches par
  symbole fusionnés sur l'état FRAIS (`applyPricePatches`, anti-course avec un pull Drive/édition). Gardes : prix natif
  only, devise protégée (quote ≠ devise stockée → skip), couverture HONNÊTE (no-quote/invalid-price listés, jamais de
  prix inventé). Câblage : refresh AU BOOT (après hydrateAssets, sauté en mode test) + bouton « Actualiser les cours »
  (Investissements → Détail, horodatage + toast récapitulatif). Champ additif `Asset.priceUpdatedAt` (zéro bump).
- **`[MCP-GET-HOLDINGS]`** ✅ **LIVRÉ 2026-07-15 (Vague 1, MCP v0.7.2)** — tool `get_holdings` (lecture seule) :
  positions individuelles (symbole/nom/qty/prix natif/devise/valeur CAD/compte/rendement) triées, total + ventilation
  par compte, via `assetValueCad` (source unique). Arrondi aligné sur `get_financial_overview` (`round(Σ)`). ⚠️ Redéploiement Cloud Run requis.
- **`[MCP-FRESHNESS-PRECISION]`** ✅ **LIVRÉ 2026-07-15 (Vague 1, MCP v0.7.2)** — `humanAge` affiche heures+minutes
  sous 48 h (« 4 h 40 » ; pile sur l'heure → « 5 h »). Corrige aussi un double-arrondi de l'ancienne version. ⚠️ Redéploiement Cloud Run requis.
- **`[MCP-WRITE-VERSION-TOKEN]`** ✅ **LIVRÉ 2026-07-16 (GO Marc)** — OCC (optimistic concurrency) per-call : `StateVersion`
  (= `updatedAt` du blob) plumbé via `StateStore.getWithVersion() → {state, version}` + `save(next, expectedVersion)`.
  `DriveStateSource.loadRawVersioned()` lit raw+version atomiquement ; `saveState(state, expectedVersion)` REFUSE si la
  version stockée a bougé depuis la lecture de CET appel (ferme le trou de la garde process-wide `lastSeenUpdatedAt` : 2
  tool-calls concurrents partis du même cache — le 2ᵉ clobberait). Additif : les tools de LECTURE gardent `get()` ; seuls
  `_writeHelper` + `applyPayslip` passent le jeton ; fichier local (stdio mono-processus) = pas d'OCC. 4 tests dont
  discriminant prouvé (git-patch : la garde process-wide seule laisse le 2ᵉ save clobber).
- **`[CELI-ASSET-NUDGE]`** ✅ **LIVRÉ 2026-07-15 (Vague 1)** — helper pur `computeCeliNudgeStatus` (détecte virements
  CELI/TFSA sortants ≥ 1000 $ + zéro avoir CELI) + bannière dismissible `CeliAssetNudge` (Investissements, `PrivateAmount`
  pour le mode discret, CTA « Ajouter mes avoirs CELI »). NO-fake-data : montant viré = CONTEXTE, jamais un solde dérivé.
- Note : `moteur-impot-couple-fusionne` audit **REFUTED** — le moteur impose déjà PAR conjoint (`taxDecember.ts:394-396`), aucun bug. (Correction d'une hypothèse antérieure.)
- **`[SYNC-FETCH-TIMEOUT]`** ✅ **LIVRÉ 2026-07-16 (Vague 3)** — `withDriveTimeout` (AbortController, 20 s,
  `DRIVE_FETCH_TIMEOUT_MS`) enveloppe TOUS les appels Google/Drive de `driveAppData.ts` (findSyncFile, read/update/
  create/delete, listAppDataFiles, fetchUserIdentity) → un réseau « dégradé » lève une `DriveError` explicite au lieu
  de PENDRE indéfiniment (la racine du hang, mitigé jusqu'ici seulement par la trappe LoginGate 10 s). ⚠️ **Le délai
  couvre AUSSI la lecture du CORPS** (`res.json()`/`text()` DANS le budget via un handler) — un 1er jet qui ne wrappait
  que jusqu'aux en-têtes re-pendait sur un gros pull dont le corps stalle (finding code-reviewer). `clearTimeout` dans
  `finally`, dégrade proprement si `AbortController` absent. **+ `gateSilentResume` ROUTE désormais une erreur Drive
  post-jeton via `handleError`** (avant : catch unique l'avalait en silence → renvoi muet au login, indiscernable d'un
  1er accès — finding silent-failure) ; symétrie avec `runBootSync`. 5 tests (2 discriminants timeout : en-têtes + corps
  qui stalle ; clearTimeout ; repli userinfo ; gate route l'erreur). ⚠️ **Volet `keepalive:true` REJETÉ (mesure, pas supposition)** : `fetch
  keepalive` ET `navigator.sendBeacon` sont plafonnés à **64 Ko de corps**, or le payload sync réel de Marc (~2000 tx +
  actifs + budgets + config) dépasse largement 64 Ko → `keepalive:true` FERAIT ÉCHOUER les gros push au `pagehide`. La
  fiabilité de `flushPush` au masquage d'onglet reste couverte par timeout + `SyncStatusBanner` (invite à reconnecter sur
  erreur) + push debouncé ; un vrai « push garanti à l'unload » exigerait une delta-sync bornée < 64 Ko (projet séparé, non planifié).
- **`[A11Y-CHECK-CONTRAST-DRIFT]`** ✅ **LIVRÉ 2026-07-16 (Vague 4)** — `scripts/check-contrast.ts` LIT désormais
  les tokens depuis `tailwind.config.js` (source unique) au lieu de valeurs re-codées en dur qui dérivaient (vu :
  `surface #151922`→`#0E1014`, `primary #10b981`→`#e6eaf2`) → fini le « teste des combos qui n'existent plus »
  (protection nulle). Ne teste que les HEX opaques (les `rgba()` translucides exigeraient une composition, hors
  périmètre) ; surfaces exclues de l'ensemble « texte » ; garde anti-scan-vide (bg≥3, text≥8 sinon exit 2). Résultat
  réaligné : 60 combos, 0 non-conforme, 9 large-only (shades `-600`/`ink-500`, usages larges/bordures — OK).
- **`[A11Y-GHOST-BUTTON-PROMINENCE]`** ✅ **LIVRÉ 2026-07-16 (Vague 4)** — variants `ghost`/`outline` de
  `components/ui/Button.tsx` : bordure `white/10`-`/15` (~1,2-1,6:1, quasi invisible) → **`white/40`** (mesuré ~3,8:1 sur
  les 3 surfaces dark/surface/highlight via calcul node de contraste) → WCAG 1.4.11 (contraste non-texte ≥3:1) au niveau
  du design-system → corrige les ~28 usages d'un coup. Classe générée vérifiée (`dist` : `.border-white/40{border-color:#fff6}`).
  Note scope : les `border-white/10` restants sont DÉCORATIFS (cards/dividers/pills/table-rows, hors 1.4.11) ; les cartes/
  champs cliquables custom hors composant Button → `[A11Y-BORDER-PROMINENCE-SWEEP]` ci-dessous.
- **`[A11Y-BORDER-PROMINENCE-SWEEP]`** 🟡 **PARTIEL 2026-07-16 (Vague 4)** — ~15 éléments INTERACTIFS custom (hors composant
  `Button`) réutilisent `border-white/10`-`/15` (~1,2-1,6:1) et échouent WCAG 1.4.11 (bordure = affordance). Traité au cas
  par cas (`white/40` = même valeur mesurée que GHOST-BUTTON, ~3,8:1 sur les 3 surfaces — PAS de bump aveugle).
  - ✅ **Boutons d'action autonomes FAITS** (12 sites) : `Budget.tsx:800` (carte cliquable), `TaxCenter.tsx:277,285`,
    `AiAssistant.tsx:311`, `Investments.tsx:1000,1007`, `Dashboard.tsx:378`, `settings/GoogleDriveSyncCard.tsx:164,171,209`,
    `sync/SyncConflictModal.tsx:179,198`.
  - ⏳ **RESTE (cas de jugement, différés exprès)** : les `<input>`/`<select>` (`Transactions.tsx:452,458,530,732,750,823,847`,
    `Dashboard.tsx:470,472`, `Investments.tsx:1102`) — la bordure interagit avec `focus:border-*`, traitement 1.4.11 distinct ;
    les onglets/toggles à état conditionnel (`RealEstate.tsx:318`, `Transactions.tsx:617,623` inactifs — l'état ACTIF a déjà
    une bordure colorée ≥3:1) ; les labels/dropzones (`settings/PayslipUploadCard.tsx:116,137`, `import/ImportBankStatement.tsx:110`,
    `border-dashed` + hover). À faire dans une passe dédiée par type (input vs toggle vs dropzone). Décoratifs (cards/dividers/pills/tr) = HORS périmètre.
- **`[MCP-TAX-FHSA-BALANCE]`** 🔧 (pré-existant, trouvé par le panel 2026-07-14) — `getTaxSituation.tool.ts` passe `u.fhsaBalance`
  (un SOLDE) comme cotisation CELIAPP ANNUELLE à `calculateFiscalReport` → sur-déduit (sous-estime l'impôt) dès que le solde
  dépasse la cotisation de l'année. Antérieur au fix per-conjoint (l'ancien code sommait pareil). Fix : champ de cotisation
  annuelle dédié ou clamp au plafond CELIAPP annuel. + Limite documentée : un conjoint SANS salaire brut mais avec
  `rrspContributed > 0` n'a aucun bénéfice fiscal (correct — la déduction ne réduit que le revenu de SON titulaire ; l'ancien
  code l'appliquait à tort au revenu fusionné de l'autre).

## Convention (cochage par Claude au merge)
- Chaque item Claude-faisable porte un **`[ID]`** entre crochets. **Claude coche lui-même**
  l'item au moment du merge de la PR qui le livre (l'Action `backlog-autocheck` a été retirée —
  choix Marc, 2026-06-09).
- Claude édite ce fichier pour **cocher** (au merge) et **ajouter** des items (découvertes).
  Les blocages humains vont dans `A_FAIRE_MOI.md`.
- Légende : 🔧 Claude · 🧭 décision Marc requise · 👤 action humaine (Marc) · ⏳ gros chantier.
- Les **tests manuels** (section 👤 ci-dessous) n'ont PAS d'`[ID]` (à Marc).

---

## 🧭 Décisions & vision Marc — 2026-06-19 (batch de réponses)
> Marc a tranché un lot d'items en attente + livré sa vision Futur/Budget. Source de vérité ; les items
> individuels ci-dessous pointent ici. Quick-wins/closures appliqués cette session ; gros chantiers = plan-first.
>
> **➡️ FEUILLE DE ROUTE VALIDÉE & exécutée en autonomie : [`docs/PLAN_CHANTIERS_2026-06-19.md`](PLAN_CHANTIERS_2026-06-19.md)**
> (4 agents d'exploration → plans `fichier:ligne`, VALIDÉS par Marc 2026-06-19). Décisions verrouillées : **Q1 multi-courbes
> OUI** ; **FA-6** = fédéral **14 %** (≤200 $) / titres **inclusion 0 % sur tout le don** / QC **24 % fixe** ; couple = attribution
> **auto par défaut** (type de poste), éditable ; ordre = gains rapides UI → PH4 → money-critical. ★ **Surprise** : le verrouillage +
> persistance de courbe (Q1-A) est DÉJÀ construit à ~95 % (`lockedProjectionStore.ts` + store) → ne PAS reconstruire.

### Tranché (closures + go)
| Item | Décision Marc | Suite |
|---|---|---|
| `A11Y-BADGE-PROMINENCE` | **Option B — bordure renforcée** (fond inchangé, bordure ~0,55) | 🔧 PR à venir (appliquer aux 6 variants) |
| `LABEL-NW-SUCCESSORAL` | Reco acceptée : **libellés distincts** (« Patrimoine successoral, avec rentes » vs « Patrimoine projeté ») + **infobulle** expliquant l'écart | ✅ LIVRÉ (R1, 2026-06-19 — libellé + tooltip sur 5 sites, pas de moteur) |
| `FA-6` (dons charitables) | **(a) Modéliser proprement** (paliers fed+QC + inclusion 0 % titres) | 🔧 effort M, sourcé (voir item FA-6) |
| `PH3-c-bis` (`User.industry`) | **Supprimer** | ⚠️ migration schéma Zustand (prudence) |
| `ENG-TAX-NS` | **Garder l'alias** | ✅ clos, rien à coder |
| `H1` (chiffrement passphrase) | **Non** | ✅ clos, décliné |
| `B-AUDIT-5` (SRG dans clawback PSV) | Corriger | ✅ **DÉJÀ FAIT** (vérifié 2026-06-19) : `projection.ts:918/921/929` excluent déjà le SRG (`incomeRetirement − incomeRetirementGis`). Item périmé → clos. PAS de fake fix. |
| `ITEM-2C`, `Tables fiscales` | **Planifier** | plans ci-dessous |
| `NAV-CONSOLIDATE` | « on en parle après » | ⏸️ différé |

### ★ Q1 — Onglet Futur (vision détaillée, plan-first par sous-chantier)
- **Annotations sur la courbe** : âge de retraite ✅ · **chaque événement de vie** ✅ · **FIRE atteint** ✅.
  PAS : épuisement de compte ❌, ni RRQ/PSV/CELIAPP ❌ (déjà lisibles sur la courbe). **Clic sur une icône →
  description brève** de l'événement.
- **Infobulle** : tout voir (actuellement coupée + impossible à scroller car elle suit la souris) → la **figer/
  rendre scrollable** (ne plus suivre le curseur quand on veut lire). ✅ **LIVRÉ (R3, 2026-06-22)** : clic = FIGE
  l'infobulle (portail `position:fixed`, ancrée, scrollable, interactive) ; survol = suit la souris
  (`pointer-events:none`) ; Échap / clic-dehors libère ; coexistence avec la modale via bouton « Détail complet ».
  Hook `useChartTooltipPosition` (machine d'état) + utils purs `resolvePointFromClick`/`clampTooltipPosition`.
  - **Découvertes R3 (panel a11y, 2026-06-22) → follow-ups** :
    - `A11Y-CHART-KEYBOARD` — le graphe Futur est clic-only (conteneur `role="img"` `tabIndex=-1`, pastilles `tabIndex=-1`) :
      figer/ouvrir le détail au CLAVIER n'est pas possible (limite PRÉEXISTANTE, pas une régression R3 ; mitigée par
      l'alternative sr-only `ChartDataTable`). Chantier a11y dédié (clavier sur graphes Recharts).
    - `FIX-INK600-TOKEN` — ✅ **FAIT (2026-06-22)** : `text-ink-600` (inexistant, `ink` s'arrête à 500) remplacé par `ink-400`
      sur les **9 usages / 7 fichiers** (Dashboard, ActionPlanDrilldown ×2, FutureDetailModal ×2, ProjectionTooltip, NextBestAction,
      ZoomableTimeChart, ZoomContainer). `ink-400` mesuré AA normal (`check-contrast` : 5,84 surface / 5,21 highlight, ≥ 4,5). Pur CSS.
- **Densité au zoom (level-of-detail)** : dézoomé = peu d'icônes ; en zoomant, de plus en plus jusqu'à toutes.
  ✅ **FAIT (R4-P4, 2026-06-22)** : cap fixe baissé 40/24 → **24/16** (`MAX_LIFE_ICONS`/`MAX_FLOW_ICONS`). Le LOD « zoom = toutes »
  était déjà là (fenêtre zoomée < cap). ⚠️ La formule `(visMax−visMin)/6` du plan était à l'envers (rejetée) → cap fixe plus bas.
  **R4-P1 (boot-restore au mount)** : ✅ déjà en place (`App.tsx:72-96`, PH2-d), vérifié — aucun patch.
- **`[FUTURE-ICONS-EXHAUSTIVE]`** 🔵 (brief Marc 2026-07-22, plan-first) — **une icône pour LITTÉRALEMENT TOUT**
  sur la courbe Futur : chaque impôt (règlement/acompte annuel), chaque achat immobilier, **chaque enfant**,
  **transferts inter-comptes** (retrait d'un compte pour mettre dans un autre — nouvelle icône), FIRE atteint,
  retraite, tout autre événement. ⚠️ **RÉVISE le périmètre antérieur** de ce Q1 (qui disait « PAS : impôts,
  RRQ/PSV/CELIAPP ») → Marc veut désormais TOUT visible. Couplé au **LOD par PRIORITÉ** (pas juste un cap fixe
  R4-P4) : dézoomé = seulement les icônes IMPORTANTES ; en zoomant, de plus en plus d'icônes moins importantes
  apparaissent (rangs d'importance par type d'événement, révélés progressivement selon le niveau de zoom).
  Travail probable : (1) le moteur émet-il déjà un `lifeEvent` pour chaque type (impôts annuels, transferts
  inter-comptes) ? sinon les AJOUTER à `chartData.lifeEvents` (source unique — ne PAS recalculer côté UI, cf R2-FIRE) ;
  (2) mapper chaque type d'événement à un rang d'importance + une icône ; (3) LOD = filtrer par rang selon le zoom
  (remplace/complète le cap fixe `MAX_LIFE_ICONS`/`MAX_FLOW_ICONS`). Plan-first (design du barème de priorité + inventaire
  exhaustif des types d'événements émis par le moteur) avant de coder.
- **`[SUBS-TAB]` Abonnements : onglet dédié + retrait + détection auto des nouveaux** 🔵 (brief Marc 2026-07-22) —
  Marc veut : (a) pouvoir RETIRER un abonnement qu'il n'a plus, (b) que ça s'ACTUALISE selon ses transactions pour
  voir les NOUVEAUX abonnements. ⚠️ **Vérifier l'existant AVANT de coder** (leçon R2-FIRE/PM-STALE-BACKLOG) : une
  bonne partie existe déjà dans `components/Planning.tsx` (sous-onglet de `BudgetWorkspace`) — `detectSubscriptionsAI`
  (`services/claude.ts`), `utils/subscriptions.ts` (`addSubscription`/`removeSubscription`/`mergeSubscriptions`/
  `subscriptionDueLabel`…), champ store `subscriptions`. Le vrai gap probable = (1) le SURFACER en onglet DÉDIÉ (vs
  sous-onglet Budget), (2) un flux clair « nouveaux abonnements détectés depuis tes transactions → confirmer/ignorer »,
  (3) retrait facile d'un abo obsolète. Plan-first : auditer Planning.tsx d'abord, puis décider ce qui manque vraiment.
- **★ VERROUILLAGE + PERSISTANCE de la courbe** (clé de voûte Phase 2) : une fois leviers + courbe choisis, elle
  **reste affichée** en changeant de page ET **après déconnexion/reconnexion**, jusqu'à ce que Marc la change ou
  **compare** des courbes. → persistance (store + IndexedDB), pas un recalcul volatil.

### PH4 — par onglet (vision, plan-first)
- **Budget** : **parité catégories** (chaque catégorie de Transactions ↔ un poste Budget) ✅ **FAIT (PH4-A, 2026-06-22)** :
  règle unique `utils/budget.ts matchTransactionToCategory` (réels + tendances), section UI « Parité » (orphelins + postes jamais
  rapprochés). `totalSpent` préserve le « Total dépensé ». · meilleure répartition **envie/besoin** ✅ **FAIT (PH4-B, 2026-06-22)** :
  donut **réel** (dépenses rapprochées + épargne réelle) + table comparative **Réel · Cible · Idéal 50/30/20** (`computeGoldenSplit`,
  écart coloré ±2 pts). · **objectif d'épargne** + vue **réel vs objectif** ✅ **FAIT (PH4-C, 2026-06-22)** : `SavingsGoal.linkedBudgetCategoryName?`
  (lien par NOM vers une catégorie budget) → « Accumulé / cible / **Versé ce mois** » (`monthlyActualsMap`, dépense réelle du mois) ;
  lien éditable par objectif ; lien orphelin (catégorie renommée) → badge « ⚠ Lien invalide ». Migration : aucun code (champ optionnel additif).
  - [ ] **[PH4C-SAVINGS-NATURE]** 🔧 LOW — lier un objectif à une catégorie de **nature « Épargne »** affiche « Versé ce mois : 0 » en
    permanence (l'épargne est alimentée par VIREMENTS, exclus d'`actualsMap` comme dans la parité budget). Pistes : filtrer le dropdown
    aux catégories non-épargne, OU inclure les virements rapprochés pour ces postes. Découvert par `financial-integrity` (PH4-C). Pas un bug $.
  - [x] **[PH4D-WEIGHTS-STORE]** ✅ LOW (2026-06-22) — poids de l'`HealthIndicator` migrés vers le **store Zustand** :
    `AppState.healthWeights?` (additif, pas de v7→v8) + `utils/healthWeights.ts` (`DEFAULT_HEALTH_WEIGHTS` + `loadLegacyHealthWeights`
    qui lit l'ancienne clé à l'init du store ; le `merge` Zustand défaut garde la valeur initiale → poids user NON perdus). HealthIndicator
    lit/écrit le store (`setAppState`). 7 tests migration + tests composant adaptés. Panel APPROVE (logError sur corruption, `@deprecated` sur la clé).
  - [x] **[PH4D-BUDGET-RATIOS]** ✅ MEDIUM (2026-06-22) — 2 ratios budgétaires ajoutés à l'`HealthIndicator` : **adhérence au budget**
    (`computeBudgetParityScore`, dépenses réelles vs cibles du mois précédent, hors postes épargne) + **poids des abonnements**
    (`computeSubscriptionLoadScore`, coût mensuel des abos épinglés / revenu net, plafond 15 %). `HealthWeights` 4→6 (rétrocompat via
    `normalizeHealthWeights`). Correction de fond : `totalScore` exclut les métriques sans donnée (un 0 par absence ne tire plus le score).
    Revue adversariale (workflow, 5 dimensions) → 6 findings intégrés (épargne exclue, fréquence `monthlyExpenses`, masquage orphelins, a11y `—`).
  - [x] **[A11Y-HEALTH-RAW-INK500]** ✅ **FAIT (2026-07-07)** — `HealthIndicator.tsx` : **3** occurrences `text-ink-500`
    migrées vers `text-ink-400` (le `m.raw` de chaque métrique l.329 + les 2 voisines de même classe échouant AA trouvées à la
    lecture : `/ 100` l.306 et le poids `%` l.327). `check-contrast` confirme ink-400 = 5,21-6,42:1 (AA ✅) vs ink-500 = 3,41-4,20:1 (❌).
    Panel a11y-auditor + code-reviewer APPROVE. Pur CSS, zéro logique.
  - [x] **[PH4E-OWNER-EDIT]** ✅ LOW (2026-06-22) — **colonne « Conjoint »** dans le tableau Transactions (mode couple) : un `<select>`
    par ligne (Auto / prénom conjoint 0 / prénom conjoint 1) qui OVERRIDE `Transaction.ownerId` (`updateOwner`, `undefined` = AUTO).
    Table desktop (colonne conditionnelle) + carte mobile (ligne « Conjoint : »). `Transactions.tsx` lit `config` du store ; l'override
    alimente `resolveTransactionOwner`/`computeActualByOwner` (#398, déjà prouvé). 3 tests (solo absente, couple présente, change écrit/efface).
    **PH4-E complet.** Reste-note (`computeActualByOwner` garde `amount<0` interne) → non requis : seul site d'appel filtre déjà.
  - `BUDGET-KEY-WARNING` (découverte PH4-A, **pré-existant, LOW, non-fatal**) : la page Budget émet des warnings React « two children
    with the same key, `value` » (~32 en session, clé littérale `value`). ⚠️ **Hypothèse `nameKey` RÉFUTÉE** (testée 2026-06-23) :
    ajouter `nameKey="name"` aux `<Pie dataKey="value">` ne change RIEN — Recharts keye en interne sur le `dataKey`, pas le label.
    Sources « value » à l'écran : les 2 donuts (`<Pie dataKey="value">`) au montage + `<Bar dataKey="value">` (`BudgetGroupTable:254`,
    rendu seulement à l'expansion d'un poste). Vraie correction = inconnue (quirk interne Recharts sur la légende du Pie) → demande une
    investigation dédiée (essayer un `id` unique par `<Pie>`, ou supprimer/customiser `<Legend>`). Warning React dev, pas une erreur runtime.
  - [x] **[PLANNING-ANNUAL-SUB-12X]** ✅ **FAIT (2026-06-26)** — voir l.709 détail. Doublon fermé.
    « Fixe Mensuel »/« Coût Annuel ». Identique avant/après PH4-F (financial-integrity : pas une régression). Fix : utiliser
    `yearlyCost` pour l'annuel et normaliser le mensuel par `yearlyCost/12` plutôt que `averageAmount` brut.
  - `BUDGET-DONUT-SVG-ARIA` ✅ **FAIT (2026-06-23)** : les 2 donuts (théo + réel) enveloppent désormais `<ResponsiveContainer>`
    dans `<div aria-hidden="true">` → le `<svg>` Recharts n'est plus traversable par les SR (le nom accessible reste sur le
    `div role="img"`, les données dans le `ChartDataTable` sr-only). Contrastes du bloc PH4-B tous MESURÉS PASS (a11y-auditor).
  - `BUDGET-NATURE-FREEFORM` ✅ **FAIT (2026-06-23)** : les 56 items de fixtures (testBudget + 6 personas) avaient des natures
    LIBRES ('Logement', 'Alimentation', 'Épargne' accentué…) violant l'union typée → tout tombait dans « Envie » + CELI/REER
    (`'Épargne'`≠`'Epargne'`) comptaient comme DÉPENSES (groupement, `coupleAnalysis`, ET les dépenses envoyées à l'IA/Dashboard/
    NextBestAction qui testent `=== 'Epargne'` exact). Normalisés vers la classe 50/30/20 (`name` garde le détail). Panel
    financial-integrity + code-reviewer = CORRECTION confirmée, 0 régression (2285 tests verts). Donuts 50/30/20 montrent enfin
    Besoins ≠ 0 (Léa : 37 % théo / 51 % réel). Vérifié au preview.
  - `HEALTH-SAVINGS-RATE-DIVERGENCE` (découverte panel BUDGET-NATURE-FREEFORM, **pré-existant, à trancher**) :
    `components/dashboard/HealthIndicator.tsx:93` somme TOUS les postes (épargne incluse) dans `monthlyExpenses` → le **taux d'épargne**
    est sous-estimé, alors que `portfolio.computeMonthlyBudgetAggregates`, `useDerivedFinancials`, `NextBestAction` EXCLUENT
    `nature==='Epargne'`. Même divergence « 2 calculs sur la même donnée la traitent différemment » que la leçon PH4D-BUDGET-RATIOS.
    Fix = exclure l'épargne du `monthlyExpenses` du HealthIndicator (money-display → panel financial-integrity).
- **Santé financière** retravaillée · **mode couple** plus concret · **détail de ce que CHAQUE conjoint sort**
  comme argent.
- **Abonnements** : les voir (peut-être un onglet dédié avec les **dates** d'abonnement).
- **Personas de test** : tous retravaillés pour **marcher sur TOUTES les pages** (tous les critères cochés).
  ✅ **FAIT (R6, 2026-06-22)** : `isActive:true` sur les childGoals (coupleConfort/autonomeMono) + `setupOptOut` par persona
  (6 personas) + micro-actif CELI (lea/coupleDettes). Garde-fou `tests/components/setup/personaGates.test.ts` (7 personas ×
  pages data, source unique `PAGE_SETUP`+`REQUIREMENTS`). Actions/Assistant restent gated = clé API (par design).
  - `PERSONA-ASSET-PERF` (découverte R6, **pré-existant, hors scope**) : les actifs de TOUS les personas omettent
    `performance`/`currency` (le type `Asset` les exige, mais `TEST_ASSETS` + les inline trichent via `as unknown as Asset[]`)
    → `AiAssistant.tsx:83` rend `+undefined%` + tri NaN en mode test AVEC clé API. Fix propre = garder `(a.performance ?? 0)`
    côté AiAssistant et/ou compléter les actifs des personas. (Mes 2 micro-actifs R6 sont déjà complets.)

### Plan — `ITEM-2C` (gates de timing par conjoint, money-critical)
- **Problème** : FERR 72 / reset REER 71 / bonus PSV 75+ sont bloqués par un pool REER MÉNAGE + un âge principal
  unique (`taxJanuary.ts:173` `ctx.age>=72`, `ctx.age`=`users[0].age` projection.ts:177) → timing per-conjoint impossible.
  ⚙️ **Décisions Marc (2026-06-25)** : cadence phase-par-phase (OK entre chaque) ; clé de répartition REER par conjoint =
  `rrspContributed` historique [(a)] ; re-baselining golden en Phase 2 = OK (justifié vs ARC + discriminant).
- **Phase 0** ✅ **FAIT (2026-06-25)** : `tests/services/projection.item2c.golden.test.ts` — golden de caractérisation
  (5 scénarios : couple 70/64, 64/70, 70/70, solo 70, **76/64 PSV-bonus**) pinnant FERR + nw + tax. Ancres zéro-régression
  (equal/solo) + **signatures du bug NON-VACANTES** (`(70/64)≡(70/70)` ; `(64/70)` ferr=mois 96 — casseront au fix Phase 2).
  Panel projection-validator + code-reviewer ✅. ZÉRO changement moteur. ⚠️ Bonus PSV 75+ = MÊME bug structurel (borné).
- **Phase 1+2 FERR** ✅ **FAIT (2026-06-25, choix Marc « option 3 » = plomberie+flip 1 PR)** : `taxJanuary.ts` boucle sur
  `reerByUser` + âge par conjoint (chaque conjoint de 72+ convertit SA part au facteur RRIF de SON âge) ; `projection.ts`
  débite la part FERR de chaque conjoint dans le registre (qui passe de SHADOW à PILOTE). Défaut additif (âges égaux ⇒
  Σ=`reer×rate`, ancres golden equal/solo INCHANGÉES). Golden age-gap re-basés SCIEMMENT + preuves-de-fix (discriminant
  git-stash : 5/7 échouent sur l'ancien code). ⚠️ **Bug CRITIQUE trouvé au panel + corrigé** : flux fiscal FANTÔME au DÉCÈS
  (la part du défunt FERR-convertissait comme un mort de 100 ans → +63 k$ sur le survivant) → roulement REER conjugal
  `reerByUser=[Σ,0]` au `survivorMode`. Panel financial-integrity + projection-validator + silent-failure + code-reviewer ✅.
  Repli `birthYear` pour le conjoint sans `age` + 2 tests unitaires per-conjoint. Conservation 20/20.
- **Sous-phase PSV/RRQ per-conjoint** ✅ **FAIT (2026-06-25, plan-first OK Marc)** : `rrqMonthly`/`psvMonthly` (`retirementIncome.ts`)
  passés en SOMME per-conjoint — le DÉPART RRQ/PSV (`age_i >= startAge`) ET le bonus PSV 75+ sont évalués à l'âge de CHAQUE conjoint,
  sur SA part (`base/N × poids_i`). Modèle d'âge RELATIF `ctx.age + (âgeDépart_i − âgeDépart_0)` (symétrique âges égaux, golden inchangé,
  10 tests `retirementIncome` préservés — cf leçon CLAUDE.md). Mode SURVIVANT = modèle familial INCHANGÉ (per-conjoint au décès =
  raffinement à part) → zéro impact FISC-SURVIVOR. Golden : `couplePsvBonus` (76/64, bonus sur user1 seul) + `couplePsvStartGap` (66/63,
  PSV de user2 à SES 65) re-basés + preuve-de-fix `(66/63)≠(66/66)`. Discriminant git-stash (4/9). Conservation 20/20.
  **Panel 4 agents → 3 fixes intégrés** : (a) SRG gaté sur `psvMonthly > 0` (au lieu de l'âge user1) — un couple à écart d'âge où
  l'AÎNÉ touche la PSV mais user0 < 65 avait à tort un SRG nul (bug $ réel exposé par le per-conjoint) ; (b) repli `ctx.age` pour un
  conjoint sans age/birthYear (évite d'amputer sa rente en silence) ; (c) `returnProfile` PIN re-piné (−476 $ légitime, couple 35/33).
- **RESTE — reset REER 71 per-conjoint** : `rrspRoomDelta`/`rrspRoomReset` (`taxJanuary.ts`) restent sur l'âge user1 (impact $ ~nul
  pour les retraités sans cotisation). À traiter si besoin (faible priorité). + per-conjoint PSV/RRQ AU DÉCÈS (raffinement du modèle survivant).

### Plan — Tables fiscales « montant pour personne vivant seule » (QC TP-1.G)
- **Problème** : le montant pour personne vivant seule (crédit QC) est absent du code ET de `FISCAL_REFERENCE`.
- **Phase 0** : transcrire la grille TP-1.G **datée + sourcée** dans `FISCAL_REFERENCE.md` (jamais de chiffre deviné).
- **Phase 1** : appliquer le crédit aux ménages **1 adulte** (et la majoration applicable) dans `calculateFiscalReport` ;
  test discriminant (un single 65+ bas revenu voit le crédit) ; panel fiscal. Effort S/M une fois la grille fournie.

---

## 🎛️ Audit UX 2026-06-17 (VALIDÉ — voir `docs/AUDIT_UX_2026-06-17.md`)
> Audit externe (rendu headless, 7 personas, 14 pages) **validé claim par claim** par panel de 5 agents
> (preuve `fichier:ligne`). Robustesse app = 0 plantage. Cœur money-critical = sain (les 2 « bugs de chiffres »
> sont un libellé + un persona insoutenable, pas des erreurs de calcul). Vrais chantiers = formatage $,
> archi de l'info, mode discret. ⚠️ Verdict en tête de chaque item. 🧭 = décision Marc.

### 🔴 Présentation money-critical (valeurs justes, mais trompeuses)
- [x] **[FMT-CURRENCY-UNIFY]** ✅ MEDIUM (2026-06-17) — montants `$` formatés à la main (floats en-US, sans
  séparateur, décimales variables) routés par `formatCAD`/`formatSigned`/`formatCompactCAD`. **Part 1** (#338) :
  `DebtManager` + `BudgetGroupTable` + garde test discriminante (`/\d{4,}\$/` rejeté, prouvé via `git stash`).
  **Part 2** : `TaxCenter`, `Budget`, `Retirement`, `LifeEvents`, `Investments`, `Planning`, `DividendPanel`,
  `Transactions`, `Travel` (9 fichiers, ~50 sites ; signés via `formatSigned`, axes/KPI via `formatCompactCAD`).
  Laissés à dessein : `AiAssistant` (≈10 `toLocaleString` dans les PROMPTS LLM, pas de l'affichage), dates,
  export CSV, inputs éditables. Reste 0 `toLocaleString` monétaire hors prompt. Convention figée dans CLAUDE.md
  (« formatCAD = seul formateur $ »).
- [x] **[LABEL-NW-SUCCESSORAL]** ✅ MEDIUM (R1, 2026-06-19) — l'écart « projection Budget ≠ reste » est un **libellé**,
  pas un calcul : Budget affiche `estateNetWorth` (patrimoine **successoral**, net d'impôt au décès + NPV rentes,
  `estateCalculation.ts:195`) vs `chartData[dernier].NetWorth` ailleurs. Source unique RESPECTÉE. 🧭 Décision :
  soit Budget affiche aussi le NW fin-horizon (parité stricte), soit clarifier « successoral » vs « fin
  d'horizon » partout (libellés + infobulle). PAS un correctif moteur. ≠ `[NW-PARITY-INVARIANT]`.
  ✅ RÉSOLU (R1, décision Marc = clarifier) : « Patrimoine successoral, avec rentes » + tooltip (prop `tooltip` ajouté à `KPIStat`)
  sur 5 sites (FutureProjection KPI, Budget, StressTestPanel, GoalSeekerCard `title`, prompt AiAssistant). Fallback conditionné
  (libellé neutre « Patrimoine projeté » si `estateNetWorth`=0, sinon « avec rentes » mentirait). a11y durcie (`Tooltip` : `aria-describedby` sur l'enfant + Échap).
- [x] **[PROJ-INSOLVENCY-BADGE]** ✅ MEDIUM (PR #358, 2026-06-18) — onglet Futur : badge danger « Plan insoutenable —
  capital épuisé vers X ans » dès que le patrimoine net projeté franchit 0 (vs −1,88 M$ nu anxiogène). Helper pur
  `utils/insolvency.ts` `findInsolvencyPoint(chartData)` (1er point `NetWorth<0`, ignore le passé/NaN ; 7 tests) +
  `<Badge>` dans le `<PageHeader>` (wrap `role="status"` pour l'annonce SR). Métrique ≠ Retraite (`TotalCapital≤0`).
  Âge affiché en clair (cohérence Retraite, ≠ montant → non masqué en mode discret — finding code-reviewer). Plan
  solvable → aucun badge (empty state honnête). Panel code-reviewer + a11y-auditor.
- [x] **[A11Y-BADGE-PROMINENCE]** ✅ LOW (PR #375, 2026-06-19) — **Option B (décision Marc)** : bordure RENFORCÉE
  (fond `*-bg` inchangé à 0,10). `components/ui/Badge.tsx` : `border-*-border` (accent à 0,30) → `border-*-400/55`
  (accent saturé à 0,55) sur les 6 variants ; `border-white/10`→`/25` (neutral), `border-primary/30`→`/55` (primary).
  Badge-only : on ne touche PAS le token partagé `*-border` (utilisé par ProjectionControls/IntegrationsSection).
  Contraste badge↔page remonté (WCAG 1.4.11) ; texte déjà AA inchangé. Classes générées vérifiées (build propre).

### 🟠 Architecture de l'information
- [ ] **[IA-NAV-CONSOLIDATE]** 🧭 ⏳ ✅VÉRIDIQUE — **14 destinations** (Argent 3 · Plan 4 · Objectifs 3 · Outils 3
  + Config, `Layout.tsx:67-106`) ; recouvrements (Futur/Retraite/Prochaine-action = même projection) ; 2-4
  coquilles par persona. Cible : ~6 dest. (Accueil · Budget · Patrimoine · Futur · Impôts&Docs · Réglages).
  Gros chantier nav (routes, deep-links, tests) → **plan-first + OK Marc**.
- [x] **[IA-DEDUP-COMPLETUDE]** ✅ LOW (2026-06-17) — `<SetupHub />` retiré de `Profile.tsx` ; reste UNIQUEMENT
  dans Configuration (`Settings.tsx:166`). Profil = uniquement les champs à remplir (réversible : 1 import + 1 balise).
- [x] **[IA-ASSETLOC-PERSIST]** ✅ LOW (2026-06-17) — ⚠️ **finding RÉVISÉ après lecture du code** : l'éditeur
  de holdings (`AssetLocationCard`) n'est PAS un éditeur de portefeuille mais un **bac-à-sable what-if** (titre
  « Optimizer », bouton « ↺ Depuis portefeuille », recommandations live) → l'état local non persisté est VOULU.
  Le « fix read-only/persister » aurait CASSÉ l'outil. Vrai risque = CLARTÉ → note « Simulation : ne modifie pas
  ton portefeuille réel, édite-le dans Investissements ». (Discipline : vérifier AVANT de coder un « fix ».)
- [x] **[UI-SCORES-UNIFY]** ✅ MEDIUM (2026-06-17, choix Marc) — collision « deux Santé /100 » résolue :
  `HealthIndicator` « Santé financière /100 » (Accueil, agrège 4 ratios) = LE score global ; le badge
  Investissements « Santé /100 » (qui mesurait la diversification) renommé **« Diversification /100 »**
  (variable `healthScore`→`diversificationScore` + `title` « sous-mesure… le score global est sur l'Accueil »).
  `Efficacité fiscale /100` (AssetLocation) et `Complétude %` (SetupHub) sont déjà des sous-mesures sur des
  axes distincts → laissées. Pas de changement de formule.
- [ ] **[UI-TABS-RICH]** 🔧 ◑PARTIEL MEDIUM — généraliser le pattern sous-onglets (déjà sur Investissements ET
  Configuration) à **Retraite** (4 outils empilés `Retirement:199-230`) et **Profil** (long scroll). Plan-first.

### 🔒 Vie privée & sécurité
- [~] **[PRIV-DISCRET-DOM]** 🔧 ✅VRAI MEDIUM — **KEYSTONE LIVRÉ (2026-06-17, choix Marc = •••)** : les primitives
  `PrivateAmount` + `PrivateBlock` (+ `KPIStat`) MASQUENT désormais la valeur par « ••• » → la vraie valeur n'est
  **plus dans le DOM** en mode discret (fin de la fuite copier-coller/inspecteur/SR). **Survol-révèle RETIRÉ**
  (`.privacy-blur:hover` supprimé de `Layout.tsx`). **RESTE** = `[A11Y-D6-SR-2]` ph.3 : migrer les ~69 spots BRUTS
  `privacy-blur` restants → `PrivateAmount` (ils floutent encore, mais SANS survol-révèle) pour que TOUTE valeur
  masquée sorte du DOM. Les graphes (axes/tooltips Recharts) floutent encore (à traiter avec `[A11Y-CHARTS]`).
- [x] **[SEC-CSP-HEADER]** ✅ LOW (2026-06-17) — `frame-ancestors` retiré du `<meta>` CSP (`index.html`) :
  ignoré en meta par spec → ne servait qu'à émettre un warning console. Protection anti-clickjacking intacte
  via `vercel.json` (CSP HTTP `frame-ancestors 'none'` + `X-Frame-Options: DENY`, vérifié). Pas une faille.

### 🟡 Polish UI / onboarding / viz
- [ ] **[IA-NAV-LABELS]** 🔧 ✅VÉRIDIQUE MEDIUM — sidebar `w-16` par défaut, libellés `opacity-0`
  (`Layout.tsx:343`) ; icônes cryptiques (éclair/boussole/palmier). Un `title` existe mais labels invisibles
  par défaut → rendre les libellés visibles par défaut (ou rail plus large).
- [x] **[FMT-CASING-ACCOUNTTYPE]** ✅ **FERMÉ PÉRIMÉ (workflow backlog-verify 2026-06-26)** — re-confirme l'analyse #351 ci-dessous : bug THÉORIQUE (union stricte majuscules, tsc garantit la casse), 3 classifieurs distincts ≠ duplication → helper = anti-YAGNI. Historique conservé :
  casse incohérente `CRYPTO`(enum)
  /`Crypto`(clé chart), `NON-ENREG`/`NonReg`, mappée à la main (`Dashboard.tsx:290-291`) = **bug latent**.
  Une seule fonction `accountTypeToChartKey()`. (dedup CELI/REER déjà corrigé — `new Set`.) ⚠️ **Analyse
  2026-06-17** : le pattern `=== 'CRYPTO'`/`'NON-ENREG'` vit dans 3 fichiers (`Dashboard` chart-keys,
  `TaxCenter` + `AssetLocationCard` = traitement FISCAL, pas le même mapping) → extraction = refactor plus
  large que « LOW » (constante d'enum partagée + helper). À regrouper avec `DETTE-UI-PRIMITIVES`/un nettoyage
  enum dédié, pas en quick-win. ⚠️ **Vérif 2026-06-18 (PR #351) : le bug de CASSE est en fait THÉORIQUE** —
  `accountType: RegisteredAccountType` est une UNION STRICTE (`'CELI'|'CELIAPP'|'REER'|'NON-ENREG'|'CRYPTO'|'REEE'|
  'MARGE'|'AUTRE'`, tout en majuscules) → tsc garantit la casse, aucun `CRYPTO`/`Crypto` runtime possible. Et les
  3 sites sont des CLASSIFIEURS DISTINCTS (Dashboard keyToAccount, TaxCenter filtre non-enreg, AssetLocationCard
  3-buckets), pas une duplication réelle → un helper = abstraction spéculative (anti-YAGNI). **Déclassé.**
- [x] **[UI-TX-CLEANUP]** ✅ LOW (2026-06-17) — colonne **AUTO** auto-documentée : en-tête avec `title`
  explicite (code couleur vert ≥90 % / jaune ≥70 % / rouge <70 %) + glyphe `ⓘ` visible signalant l'info ;
  les pastilles gardent `title`/`aria-label` par ligne. Colonne TYPE = artefact data (laissée, non prioritaire).
- [x] **[GATE-CTA-CONTRAST]** ✅ LOW (2026-06-17) — MESURÉ : le TEXTE du CTA était déjà ~12:1 (description « gris
  foncé » de l'audit inexacte), MAIS le FOND `bg-primary/15` (#282B2F) vs page `bg-dark` (#07090D) ≈ 1,3:1 → le
  bouton ne RESSORTAIT pas (CTA fantôme). Fix on-brand : CTA **solide** `bg-primary text-dark` (prominent, ~14:1)
  + `focus-ring` ajouté (indicateur de focus manquant). Pas de vert introduit (cohérence palette).

### ✗ Faux (validés FAUX — impression seule, effort minimal / rien à coder)
- [ ] **[ONB-OVERLAY-SEQ]** 🔧 ✗FAUX→perception LOW — PAS 3 overlays simultanés (onboarding plein écran
  exclusif ; backup exige `hasData`). Mais tour (700 ms post-onboarding) + ConsentBanner **peuvent** coexister
  → option : ne pas auto-lancer le tour (cf `[ONB-TOUR-OPTIN]`) ou retarder le bandeau de consentement.
- [ ] **[ONB-TOUR-OPTIN]** 🔧 ✗FAUX→perception LOW — le tour 15 étapes se lance **après** l'onboarding (pas au
  1er écran ; bouton Passer présent). Perception : auto-lancement non sollicité → le rendre opt-in (bouton
  « Visite guidée »). Lié à `[IA-NAV-CONSOLIDATE]` (le tour est un symptôme de la nav éparpillée).
- [ ] **[NAV-IA-GATE-MSG]** 🔧 ✗FAUX→perception LOW — « Assistant IA » route correctement
  (`TabRouter:277-291`) ; l'auditeur a heurté `PageSetupGate` (profil non configuré). Perception « page
  cassée » → message clair « configure ton profil pour débloquer l'Assistant IA » sur la gate.
- **Rien à coder (validés FAUX, artefacts data)** : `GATE-VALUE-PROP` (value-prop déjà avant le bouton),
  `UI-DETTES-TITLE` (titre fixe « Gestion de la Dette »), `BUD-CATEG-DEFAULT` (`migrateBudgetItems` classe
  l'épargne correctement — données de test), `VIZ-LEGEND-DEDUP` `TOTAL PORTEFEUILLE ×5` (artefact CSV).

---

## 🚀 MCP FinanceAI → Cloud Run [⏳ gros chantier] (brief Marc 2026-06-16, RELANCÉ 2026-07-13)
> Le serveur MCP perso FinanceAI (finances : Drive/BigQuery, comptes CELI/REER/CELIAPP/REEE) tourne en
> local (stdio), token Google en **fichier**. **Symptôme** : `get_financial_overview` → `invalid_grant`
> (« Token has been expired or revoked ») alors que `ping` répond. **But** : serveur **distant** hébergé sur
> **Google Cloud Run**, stable, sécurisé, redéployé à chaque push. **Code : dossier `mcp/`.**
> ⚠️ **PLAN-FIRST** : phase 0 (explore + rapport) AVANT tout code ; **OK Marc requis avant la phase d'écriture.**
> ⚠️ **DEUX OAuth distincts** : **A** = serveur ↔ Google (lire les finances Drive/BigQuery — c'est CE token qui
> est mort, à persister hors disque + rafraîchir) ; **B** = Claude ↔ serveur (auth du connecteur — Bearer
> d'abord, architecture prête pour OAuth 2.1 plus tard). NE PAS les confondre.
>
> **RELANCE 2026-07-13 (choix Marc : claude.ai web/mobile direct)** — plan validé en 4 lots :
> Lot 1 `[MCP-WHATIF]` (tools what-if + séries, indépendant de l'hébergement) → Lot 2 `[MCP-CLOUDRUN-HTTP]`
> → Lot 3 `[MCP-CLOUDRUN-A]`+`[MCP-CLOUDRUN-B]` → Lot 4 `[MCP-CLOUDRUN-DEPLOY]` (+ MAJ carte « Connecter à
> Claude » de l'app, qui pointe vers un `.mcpb` jamais hébergé — rappel Marc 2026-07-13).
> ⚠️ **Phase 0 REFAITE 2026-07-13, correction au brief** : l'UI connecteurs custom de claude.ai n'a PAS de
> champ Bearer statique (OAuth 2.0 seulement : Authorization URL, Token URL, Client ID/Secret en advanced
> settings ; `static_headers` = bêta réservée aux orgs Team/Enterprise) → **Auth B = mini serveur OAuth 2.1
> mono-utilisateur (PKCE)**, pas un middleware Bearer. `[MCP-CLOUDRUN-ROOT]` (consentement en Production)
> = ✅ RÉGLÉ par Marc 2026-07-06. Marc a confirmé : PAS de passphrase sur le coffre (DriveStateSource OK).

- [x] **[MCP-CLOUDRUN-0]** ✅ **FAIT 2026-07-13** (phase 0 refaite : stack TS `@modelcontextprotocol/sdk`,
  entrée `mcp/stdio.ts`, 15 tools, token Drive en `~/.financeai-mcp/credentials.json` scope `drive.appdata`,
  flux `access_type=offline+prompt=consent` ; rapport livré à Marc en session, plan 4 lots OK). Détail original :
  langage/framework MCP (FastMCP Python ? `@modelcontextprotocol/sdk` TS ? autre ?) ; transport actuel +
  entrée du serveur ; où/comment le token Google est lu/écrit (fichier ? chemin ? lib OAuth ?) ; où vivent
  `client_id`/`client_secret` (clair ? `.env` ?) ; scopes Google + `access_type`/`prompt` ; **liste
  exhaustive des outils MCP exposés** (pour ne rien casser). → rapport court + plan → **attendre l'OK Marc**.
- [x] **[MCP-WHATIF]** ✅ **Lot 1 FAIT 2026-07-13 (PR de cette session)** — demande Marc : « si j'achète une
  voiture demain, comment ça affecte mes finances, avec des chiffres précis de l'app et des graphs, aucun
  chiffre inventé ». Nouveau tool data-aware `simulate_what_if` (`mcp/whatIf.ts` pur + `mcp/tools/
  simulateWhatIf.tool.ts`) : changements hypothétiques (achat ponctuel/financé, salaire, dépense récurrente,
  nouvelle dette, achat immobilier) traduits vers les VRAIES structures moteur (LifeEvent GROS_ACHAT, Debt,
  RealEstateGoal, users, calculatedMonthlySavings) → moteur roulé 2× (même `now`) → deltas à 1/2/5/10/20 ans
  + âge FIRE + impôts + hypothèses REMONTÉES (`assumptions`) + séries annuelles base/scénario pour graphs.
  + `get_projection` param `includeSeries` (série annuelle exacte). 20 tests (discriminants de MAGNITUDE
  économique : voiture 30 k$ → écart an 1 ∈ [−40k, −25k]). ⚠️ Piège évité : `totalClosingCosts` SANS taxe
  de bienvenue (le moteur ajoute `welcomeFees` lui-même, `realEstateMonth.ts:175` — l'inclure = double-comptage).
  **Panel 2026-07-13 (3 agents, findings MESURÉS et tous intégrés)** : mot réservé « vente » assaini (delta 0
  silencieux sinon) · `.finite()` + gardes `Number.isFinite` (Infinity passait Zod → impact fabriqué) · mois ISO
  construit comme le moteur (toISOString, pas composants locaux — fuseaux positifs décalaient d'un mois) ·
  changement daté hors horizon REJETÉ (avant : « succès » à effet nul) · financement différé REJETÉ (dettes sans
  date de début → −28 k$ quatre ans trop tôt) · mise de fonds > prix rejetée · hypothèses SCHL/retraite remontées.
- [ ] **[MCP-WHATIF-DATED-DEBT]** 🔧 LOW (suivi panel MCP-WHATIF 2026-07-13) — les dettes du moteur n'ont pas de
  date de DÉBUT (servies dès le mois 0) → le what-if rejette un achat FINANCÉ différé (`monthsFromNow > 1`).
  Pour le supporter : soit un champ `startDate?` sur `Debt` honoré par le moteur (plan-first, touche le moteur),
  soit une modélisation « flux de paiements » côté what-if. Décision Marc requise sur la sémantique.
- [x] **[MCP-ENGINE-WARNINGS]** ✅ 2026-07-29 — `onLogEntry` (écouteur éphémère d'errorLogger, isolé) + collecte dans `withState` (source projection, warning+, cap 5, dédup, désabonné en finally) → bloc texte additif « ⚠️ Avertissements du moteur » dans la réponse (JSON intact). Ex-suivi : les `logErrorThrottled` du moteur
  (ex. « montant non fini → dépense ignorée ») partent dans un sink NAVIGATEUR (localStorage, no-op sous Node) →
  invisibles pour Claude côté MCP. Piste : `withState` collecte les logs moteur pendant le run et les remonte dans
  la réponse JSON (champ `engineWarnings`). Zéro impact app web.
- [x] **[ENG-LIFEEVENT-VENTE-SUBSTRING]** ✅ 2026-07-29 — `LifeEvent.eventKind?: 'VENTE_IMMO' | 'NONE'` (additif, zéro bump persist) : sémantique EXPLICITE prime, absent = sous-chaîne historique exacte (golden inchangé, conservation 20/20). Le what-if MCP pose eventKind:'NONE' sur ses GROS_ACHAT (ceinture structurelle, safeEngineName reste la bretelle). 3 tests discriminants. Ex : `applyLifeEvents`
  détecte une vente immobilière par SOUS-CHAÎNE `name.includes('vente')` : fragile pour tout producteur de
  LifeEvent non humain (MCP assainit déjà via `safeEngineName`). Piste : type d'événement EXPLICITE
  (`'VENTE_IMMO'` dans `LifeEventType`) + migration douce du fallback substring. Plan-first (touche le moteur).
- [x] **[MCP-CLOUDRUN-A]** ✅ **Lot 3 FAIT 2026-07-13** — `mcp/auth/credentialsBackend.ts` : backend
  d'identifiants FICHIER (local, inchangé) OU **Secret Manager** (`$FINANCEAI_GOOGLE_SECRET`) via metadata
  server + API REST (zéro dépendance npm) ; `save` réécrit une version (refresh token régénéré). `tokenProvider`
  prend le backend en injection + **`invalid_grant` traité** → message ACTIONNABLE (« Autorisation Google EXPIRÉE
  ou RÉVOQUÉE… reconnecte »). `bootstrap` sélectionne le backend selon l'env. 404 secret = « pas autorisé »
  (pas une panne). Test Secret Manager avec fetch simulé (round-trip base64, metadata absent → erreur claire).
- [x] **[MCP-CLOUDRUN-B]** ✅ **Lot 3 FAIT 2026-07-13** — `mcp/auth/oauthProvider.ts` : mini serveur OAuth 2.1
  MONO-USER **STATELESS** (Cloud Run scale-to-zero : rien en mémoire) — tokens = payload JSON signé HMAC-SHA256
  (`$FINANCEAI_OAUTH_SIGNING_KEY`), DCR sans base (client_secret = HMAC(client_id)), PKCE **S256 obligatoire**,
  redirect_uri sur allowlist (claude.ai/claude.com + loopback) lié au code, rotation du refresh (OAuth 2.1). La
  « porte » = **clé d'accès** unique (`$FINANCEAI_ACCESS_KEY`) constant-time sur une page HTML. Endpoints `/oauth/
  authorize` (form GET + POST), `/oauth/token`, `/oauth/register`, `/.well-known/oauth-authorization-server` +
  `/.well-known/oauth-protected-resource` (RFC 8414/9728) ; garde Bearer sur `/mcp` (toutes méthodes) → 401 +
  `WWW-Authenticate` pointant la découverte. Activé quand `SIGNING_KEY`+`ACCESS_KEY` présents (l'un sans l'autre
  = refus de démarrer). 21 unités OAuth + flux e2e HTTP complet (register→authorize→code→token PKCE→tools/call).
- [x] **[MCP-CLOUDRUN-HTTP]** ✅ **Lot 2 FAIT 2026-07-13** — `mcp/http.ts` (node:http pur, zéro dépendance
  ajoutée) : endpoint unique `/mcp` (POST/GET/DELETE, sessions `StreamableHTTPServerTransport` du SDK,
  `enableJsonResponse`, balayage sessions inactives 1 h, cap 32) + `/health` ; `$PORT` (Cloud Run) → `0.0.0.0`,
  local → `127.0.0.1` + anti-DNS-rebinding ; SIGTERM/SIGINT propres ; `mcp/bootstrap.ts` factorise la source
  d'état (partagée stdio/http) ; version 0.4.0→0.5.0. Le switch stdio|http = 2 entrées + scripts npm
  (`mcp:dev`/`mcp:http`) plutôt que `MCP_TRANSPORT` (plus simple, même effet). 9 tests e2e (vrai serveur,
  vrai protocole). ⚠️ SANS auth → ne pas exposer avant Lot 3 (A+B).
- [ ] **[MCP-CLOUDRUN-AUTH-HARDENING]** 🔧 CONDITIONS pré-exposition (panel sécurité Lot 3, 2026-07-13, à trancher
  au Lot 4) : (1) **rate-limit** sur `POST /oauth/authorize` (brute-force de la clé d'accès — Cloud Armor ou compteur) ;
  (2) `FINANCEAI_ACCESS_KEY` GÉNÉRÉE par `crypto.randomBytes` (documenté README, pas juste « ≥16 car. ») ; (3) single-use
  code + rotation refresh sont **best-effort mémoire** (mono-instance) → si multi-instance un jour, `jti` consommés dans
  un store partagé (Firestore/Memorystore TTL) ; kill-switch d'incident = rotation `FINANCEAI_OAUTH_SIGNING_KEY` (à
  documenter dans le runbook) ; (4) `min-instances 1` recommandé pour ne pas vider le set de `jti` à chaque cold-start.
- [x] **[MCP-CLOUDRUN-DEPLOY-LOGS]** ✅ RÉSOLU 2026-07-13 — l'email Drive est tronqué au domaine dans les logs
  (`bootstrap.describe()` : `…@domaine`), session-ids tronqués (Lot 2). Case cochée (panel a confirmé le code déjà en place).
- [ ] **[MCP-CLOUDRUN-DEPLOY-LOGS]** 🔧 CONDITION pré-déploiement (panel security-privacy 2026-07-13) : avant
  d'exposer les logs à Cloud Run, retirer/tronquer l'EMAIL Drive du log de démarrage (`bootstrap.describe()`)
  — les session-ids sont DÉJÀ tronqués à 8 caractères (fait au Lot 2). + MAJ carte « Connecter à Claude » de
  l'app (Réglages → Système) pour décrire le branchement claude.ai (rappel Marc 2026-07-13).
- [x] **[MCP-CLOUDRUN-DEPLOY]** ✅ **Lot 4 FAIT 2026-07-13** — `mcp/Dockerfile` (node:22-slim, copie mcp/services/
  utils/types/constants — fermeture d'import PROUVÉE minimale, USER node, `npx tsx mcp/http.ts`, EXPOSE 8080) +
  `.dockerignore` (exclut front/tests/secrets) + `mcp/deploy.sh` (`gcloud run deploy --source`, région Montréal,
  `--set-secrets` ×2 OAuth + `FINANCEAI_GOOGLE_SECRET` env, `min-instances 1`, 2 passes pour injecter
  `FINANCEAI_PUBLIC_URL`) + `.github/workflows/deploy-mcp.yml` (déploiement continu via WIF, garde `if
  vars.GCP_PROJECT_ID`) + README pas-à-pas GCP (clés `randomBytes`, 3 secrets, IAM secretAccessor, branchement
  claude.ai) + carte « Connecter à Claude » (`ClaudeConnectorCard.tsx`) gagne une section web/mobile
  (`VITE_MCP_SERVER_URL`). **Actions Marc restantes** (dans A_FAIRE_MOI) : créer projet GCP + 3 secrets + IAM +
  lancer `deploy.sh` + coller l'URL dans claude.ai. **Spec d'origine ci-dessous (référence) :**
- **[MCP-CLOUDRUN-DEPLOY — spec]** Dockerfile (EXPOSE 8080, démarre sur `PORT`) +
  endpoint `/health` → 200 ; `deploy.sh` (`gcloud run deploy`, région **northamerica-northeast1**,
  `--min-instances 0`, `--set-secrets` ×3) ; workflow **GitHub Actions** (`google-github-actions/deploy-cloudrun`)
  qui redéploie sur push `main` ; README (créer les 3 secrets, publier l'OAuth consent en Production, déployer,
  brancher le déploiement continu, brancher Claude : Settings → Connectors → custom connector URL
  `https://…run.app/mcp` + clé Bearer en advanced settings, retrait de l'ancien MCP local).
- **Critères d'acceptation** : `docker build` + `docker run -e PORT=8080` démarre en HTTP local ; appel MCP
  GET/POST `/mcp` répond, **sans Bearer → 401** ; token lu depuis Secret Manager (jamais fichier ; `grep` = 0
  secret clair) ; `get_financial_overview` OK une fois un refresh token valide en place ; **tous les outils MCP
  préexistants encore enregistrés** (lister avant/après) ; `/health` → 200 ; workflow Actions valide (dry-run).
- **Contraintes** : ne PAS renommer outils/signatures ; jamais de secret commité (vérifier `.gitignore`) ;
  petits commits atomiques + explication ; **branche, pas `main`** ; décision Marc (région/nom service/scopes)
  → demander au lieu de supposer.
- 🧭👤 **[MCP-CLOUDRUN-ROOT]** **CAUSE RACINE prioritaire (action Marc — Google Cloud Console)** : l'écran de
  consentement OAuth est probablement en mode **« Testing »** → le refresh token expire tous les **7 jours**
  (= la vraie cause du `invalid_grant`). **Publier l'app en Production** (OAuth consent screen). À rappeler
  comme étape OBLIGATOIRE dans le README. → aussi candidat à `A_FAIRE_MOI.md`.

## 💰 Audit money-critical 2026-06-16 (bug « -208 633 $/mois » — workflow + panel adversarial)
> Déclencheur : Marc voit un patrimoine net -193 398 $ / variation -208 633 $ avec revenu ~10,6 k$.
> Workflow multi-agents (12 finders + vérif adversariale 2 votes) → 9 bugs confirmés / 10 réfutés.
> **CLUSTER PATRIMOINE NET livré cette PR** (MONEY-PHANTOM). Reste à corriger (PRs ciblées, money-critical) :
- [x] **[MONEY-PHANTOM]** ✅ livré : découvert `liquidDebt` exposé+visible (modal « Dettes ») ;
  `rawNetWorth`/`prevNW`/succession soustraient activeDebts+smithDebt via source unique
  `computeRawNetWorth` ; `diffNW` exact ; garde NaN dette ; 9 invariants de conservation +
  checklist CLAUDE.md. (Cause racine = débit one-time réno/véhicule > actifs → dette invisible.)
- [x] **[FISC-REER-WHT-DOUBLE]** ✅ CRITICAL livré (2026-06-16) — **le « 50 000 au fisc » de Marc, CONFIRMÉ
  numériquement** : impôt cumulé d'un couple retraité (600 k$ REER) **266,6 k$ → 215,1 k$ sur 11 ans (−51 k$)**.
  Cause RÉELLE (≠ hypothèse du finding « net crédité ») : la retenue quittait le patrimoine au RETRAIT — le
  BRUT sort du REER et le crédit net est effacé par l'invariant **CF-2** de `cashflowAllocation.ts` — ET était
  re-débitée en avril via `.reer` → fuite ≈ retenue/mois (prouvée empiriquement : résiduel de conservation
  négatif chaque mois sur un retraité qui décaisse). Fix = retrait **NW-NEUTRE** : la retenue (acompte d'impôt)
  est CONSERVÉE au liquide jusqu'au règlement d'avril (`reerWithholdingPrepaid` réinjecté en CF-2 ; meltdown :
  `liquid += withholding`). FERR/immo créditaient déjà le brut = corrects (référence de cohérence). Garde
  permanente : **INV-10/INV-11** (`projection.moneyConservation.test.ts`) — conservation décaissement + meltdown,
  **DISCRIMINANTS prouvés** (échouent sur le code d'avant via `git stash`). Re-baseline `projection.survivor.test.ts`
  (le bug gonflait l'impôt du couple > celui du survivant). Panel : projection-validator + fiscal-accuracy (fix
  fiscalement CORRECT, palier 0 % désormais remboursé) + code-reviewer + silent-failure-hunter. ⚠️ LEÇON : le
  1er fix proposé (« shortfall -= brut ») NE conservait PAS (prouvé algébriquement + empiriquement) → c'est la
  CONSERVATION EMPIRIQUE (exécuter le moteur, mesurer ΔNW résiduel) qui a donné le vrai fix, pas l'analyse.
- [x] **[FISC-BROKE-LIQUID-FLOOR]** ✅ MEDIUM (livré 2026-06-17 ; découvert pendant FISC-REER-WHT-DOUBLE) —
  quand TOUS les actifs de décaissement sont épuisés (REER/CELI/nonReg/crypto = 0) mais qu'un coussin de liquidité
  protégé par `criticalThreshold` subsiste, un shortfall non couvert (`cashflowAllocation.ts:144-152`, branche `else`
  qui ne puise pas sous le seuil critique) ne puise PAS le coussin ET n'est PAS porté en `liquidDebt` (le rescue
  `projection.ts:~1309` ne s'arme que si liquide < 0). La dépense « s'évapore » : ΔNW ne baisse pas → résiduel de
  conservation = +shortfall/mois (mesuré ~+3,9 k$/mois sur un retraité à sec, après épuisement du REER). Peut-être
  un FLOOR voulu (éviter une spirale absurde une fois ruiné) MAIS viole la conservation. **Décision Marc = (b) porter
  en `liquidDebt`** (dette VISIBLE, coussin gardé). Fix : `cashflowAllocation.ts` expose `uncoveredShortfall` (résidu
  après cascade) ; `projection.ts` le porte en `liquidDebt` au site PRIMAIRE — zéro double-comptage avec le rescue
  PV-6 (ne s'arme que si liquid<0 ; après le primaire liquid reste au coussin ≥0, vérifié projection-validator +
  silent-failure-hunter). Garde : **INV-12** (`moneyConservation`), prouvé discriminant (résiduel 3496 $/mois sans le
  fix → ≈0 avec, via `git stash`). Chemin DISTINCT du fix REER (qui y était inerte ; INV-10/INV-11 = phase solvable).
### 🔬 Audit financier 2026-06-23 (findings vérifiés — `docs/AUDIT_FINANCIER_2026-06-23.md`)
> Cœur AAA CONFIRMÉ + élargi (conservation 29 scénarios résiduel ≤0,03 $, fiscalité 0 écart, FA-6 conforme). Findings de
> juin quasi tous FERMÉS. **Tout ci-dessous = PÉRIPHÉRIE** (durcissement défensif / affichage / sécurité au repos) — aucun
> n'altère la conservation ni un calcul fiscal du cœur. Lot 1 (sûr) d'abord, puis NaN-hardening (plan-first, touche le moteur).
- [x] **[NAN-INPUT-HARDENING]** ✅ **FAIT (2026-06-23, LOT 4)** — gardes `Number.isFinite` (rabattre sur 0/neutre) sur les VRAIS
  vecteurs : `retirementIncome.ts:173` (`?? 0`), `useDerivedFinancials.ts:51` (arith. nue), `monthlyEvents.ts:160` (`?? 0`),
  `w5Effects.ts:125` (rental `!== 0`), `helpers.ts:57+rateAnnual` (`NaN<=0`=false + taux NaN trouvé au panel), `portfolio.ts`
  (computeTotalDebt/AssetBreakdown/InvestmentsValue : `|| 0`→`Number.isFinite` pour Infinity). ⚠️ Faux positifs écartés (findings=hypothèses) :
  `portfolio:147` `||` rattrapait déjà NaN ; `taxDecember:600` DÉJÀ gardé ; `w5Effects:139` business sûr via `>0`. Tests discriminants
  (git-stash : échouent sans gardes) + **INV-8 corrigé** (était VACANT : `num()` sanitisait avant `isNaN`). Panel 4 agents ✅, conservation 19/19.
- [x] **[NAN-OBSERVABILITY]** ✅ **FAIT (2026-06-25)** — nouveau helper partagé `logErrorThrottled(signature, input)` (`errorLogger.ts`,
  1×/signature, calque le throttle de `computeRawNetWorth`) câblé aux 2 sites : `monthlyEvents.ts` (lifeEvent `impactAmount` non fini →
  `warning` throttlé par event id) et `useDerivedFinancials.ts` (actif valeur non finie → `warning` throttlé par `symbol`). 3 tests du throttle.
  Observabilité seule (la garde NaN prévient déjà la corruption). Conservation inchangée.
- [ ] **[NAN-MUTATOR-CENTRAL]** 🔧 LOW (suite LOT 4, panel projection-validator) — les 4 mutateurs nus (`addIncome`/`addExpense`/`addLiquid`/
  `subtractLiquid`, `projection.ts:717-754`) n'ont aucune garde centrale → des angles morts Infinity subsistent (`w5Effects:137` business,
  `stochasticEvents.ts:45/47/83`, `taxApril.ts:55`). Une garde unique dans ces 4 closures couvrirait tout en 1 endroit (vs gardes par-appelant).
  ⚠️ Infinity NON atteignable depuis le boundary UI (`parseFloat` rend NaN, jamais Infinity) → durcissement défensif, pas bug. Effort S.
  ⚠️ **Vérif workflow backlog-verify 2026-06-26 : VALIDE mais À DIFFÉRER** — `utils/numericInput.ts` `numOr`/`numOrUndef` (l.22/33) filtre déjà NaN
  **ET** Infinity via `Number.isFinite` au boundary → vecteur **inatteignable depuis la saisie** ⇒ valeur réelle FAIBLE (défensif pour futurs appelants/import JSON brut).
  Plan complet prêt en réserve (6 gardes `if (Number.isFinite(amt))` dans les closures `projection.ts:726-763` + test discriminant héritage=Infinity → NetWorth fini, étend INV-8 au chemin flux). À prendre seulement si un vecteur d'entrée non-UI apparaît.
- [x] **[WHT-DISPLAY-EXACT]** ✅ **FAIT (2026-06-26, panel financial-integrity + projection-validator + silent-failure + code-reviewer, tous APPROVE)** —
  `totalTaxesPaid` (compteur d'affichage) : (a) nouveau champ `CashflowState.rrspWithholdingMois` = SOMME des retenues PAR TIRAGE déjà
  calculées par la cascade `drawReer` (cumulé/mois, round-trip buildCashState/applyCashState, reset 0 chaque mois). `projection.ts` passe de
  `withholdingForGrossRRSP(retraitReerMois)` (recalcul sur le brut MENSUEL agrégé) à `rrspWithholdingMois` → exact au cent près ET aligné sur la
  retenue réellement provisionnée (`taxCurrentYear.reer`). (b) fonction locale `rrspWithholding` (cashflowAllocation) SUPPRIMÉE → source unique
  `withholdingForGrossRRSP` (refactor PUR, math identique). Découplage CF-2 : le restore du liquide utilise le DELTA de l'appel courant
  (`rrspWithholdingMois − rrspWithholdingAtStart`) pour rester correct au 2ᵉ appel (sauvetage de découvert PV-6). Mesuré (git-stash) :
  270 087 → 269 132 $ (−955 $, l'agrégat sur-estimait, barème non additif). Test discriminant unitaire (3 tirages palier 1, somme franchit le palier 2)
  prouvé RED→GREEN. Compteur de display/ranking, **aucun impact NW** ; conservation 12 invariants verte, suite 2330/2330.
- [ ] **[WHT-DISPLAY-MELTDOWN]** 🔧 LOW (découverte silent-failure-hunter, suite WHT-DISPLAY-EXACT 2026-06-26) — le compteur d'affichage
  `totalTaxesPaid` n'inclut PAS la retenue REER du **meltdown** (`meltResult.withholding`, `projection.ts:~1352`) : elle est bien provisionnée
  dans `taxCurrentYear.reer` (NW correct, conservation OK) mais le compteur de display sous-estime pour un user en stratégie `MELTDOWN_REER`.
  Pré-existant (l'ancien `withholdingForGrossRRSP(retraitReerMois)` ne l'incluait pas non plus — le meltdown n'alimente jamais `retraitReerMois`).
  Fix candidat : `rrspWithholdingMois += meltResult.withholding` à côté de `taxCurrentYear.reer += meltResult.withholding`. ⚠️ Change le ranking
  de stratégies + golden → discriminant `git-stash` + mesure OBLIGATOIRES. Aucun impact NW.
- [ ] **[FISC-REEE-AIP-MODEL]** 🔧 LOW (découverte financial-integrity, suite REEE-LITERALS 2026-06-26) — l'impôt PRA à la fermeture du REEE
  (`childrenReee.ts`, `REEE_AIP_TAX_RATE=0.20` × `reeeNewBalance`) frappe le SOLDE TOTAL à 25 ans, alors que l'impôt sur le Paiement de Revenu
  Accumulé officiel ne vise QUE la portion revenu accumulé (gains, pas les cotisations remboursées sans impôt) + une SURTAXE 20 % (12 % féd
  + 8 % QC) en SUS de l'impôt ordinaire. Approximation de modèle (déjà marquée comme telle). Raffiner = séparer cotisations/gains + modéliser
  la surtaxe. ⚠️ money-critical (touche `taxDiversAdd`) → discriminant + panel. Effort M.
- [x] **[TC-FX-HARDCODE]** ✅ **FAIT (2026-06-23, LOT 3)** — `TaxCenter.tsx` : FX USD/EUR via `useFinanceStore(s=>s.fxRates)` (helper
  `fxOf` + garde `Number.isFinite`, CAD=1) au lieu de `1.38` figé ; rendements `0.02`/`0.07` → constantes `EST_DIVIDEND_YIELD`/
  `EST_CAPITAL_GAINS_YIELD` ; `0.5` → `CAPITAL_GAINS_INCLUSION_STANDARD` ; garde `(qty||0)*(price||0)`. Panel financial-integrity ✅
  (sens FX correct, `taxableAddOn` confiné à l'affichage TaxCenter, zéro fuite vers le moteur source-unique).
- [x] **[SEC-PRIVACY-BLUR-INPUTS]** ✅ **FAIT (2026-06-23, LOT 2)** — nouveau `components/ui/PrivateNumberInput.tsx` (focus-to-edit :
  `•••` hors DOM en mode discret hors-focus, vrai `<input>` au clic/focus clavier, re-masque au blur ET si le mode discret est
  (ré)activé en cours d'édition). Appliqué à `BudgetGroupTable` (1 champ) + `RetirementIncomeCard` (2 champs). `id` propagé au
  bouton (label `htmlFor` préservé), `focus-ring` + `min-h-[24px]`, focus programmatique via ref. Panel a11y + security-privacy ✅.
- [x] **[SEC-PRIVACY-RETIREMENT-RRQ-PSV]** ✅ **FAIT (2026-06-23)** — `RetirementIncomeCard.tsx` : les 2 `<input>` `rrqEstimateMonthly`/
  `psvEstimateMonthly` (montants de rente = PII) migrés vers `<PrivateNumberInput>` (même pattern panel-approuvé que leurs 2 voisins) →
  masqués hors-focus en mode discret, valeur hors DOM. Clôt la découverte du LOT 2 (volet vie privée des champs éditables complet).
- [x] **[SEC-PBKDF2-DRIVE]** ✅ **FAIT (2026-06-23, LOT 1)** — `keyCipher.ts` : PBKDF2 600k (encrypt) + fallback legacy 100k
  (decrypt) pour les anciens blobs Drive. Garde « Web Crypto indisponible » avant la boucle. Test rétro-compat (blob 100k déchiffre).
- [x] **[M1-FISC-WHT-HARDCODE]** ✅ **FAIT (2026-06-23, LOT 6)** — `projection.ts:1428` : retenue REER du compteur `totalTaxesPaid`
  passe de `*0.15` figé à `withholdingForGrossRRSP(retraitReerMois).withholding` (tiered 19/24/29 % combiné QC, MÊME barème que le
  cashflow `rrspWithholding`). Non-double-compte VÉRIFIÉ par panel (financial-integrity + projection-validator + silent-failure-hunter) :
  c'est l'acompte que la réconciliation de décembre soustrait (`totalAnnualTax − taxCurrentYear.reer`) ; `taxOnRrif` séparé, base disjointe.
  Mesuré : totalTaxesPaid 211,6 k$ → 270,1 k$ sur un retraité décaissant ~9 k$/mois (discriminant git-stash, seuil 250 k$). A compressé
  l'écart du test survivor 3,77 %→2,21 % (artefact du biais 0,15) → seuil `projection.survivor.test.ts` re-calibré 0,03→0,015 + chiffres MAJ.
  Résiduels (display) → BACKLOG WHT-DISPLAY-EXACT.
- [x] **[M5-INV1-EXTEND]** ✅ **DÉJÀ COUVERT (constaté 2026-06-23, LOT 5)** — INV-9 (`projection.moneyConservation.test.ts:346-354`,
  ajouté à l'audit 2026-06-17) contient EXACTEMENT le gap visé : reconstructabilité sous hypothèque `NetWorth = Σactifs − DettesNonImmo`
  (<2 $) + discriminant `DetteTotale` (écart = solde hypothécaire > 1 k$). Pas de test dupliqué (leçon « vérifier avant de coder »).
- [x] **[HIST-NW-NO-DEBT]** ✅ **FAIT (2026-06-23, LOT 5)** — documenté les DEUX sites (`reconstructPortfolioHistory.ts:143` + le
  recompute d'affichage `FutureProjection.tsx:274`) : NW passé = placements (+cash+immo) SANS dettes, car l'app n'a pas l'historique
  des soldes de dette. Pas de rename (casserait les consommateurs `.NetWorth`). Question PRODUIT (disclaimer / approx dette courante)
  → `docs/A_FAIRE_MOI` HIST-NW-DEBT-DISCLAIMER.
- [x] **[SEC-LOG-DEBT-REGEX]** ✅ **FAIT (2026-06-23, LOT 1)** — `errorLogger.ts` : les termes financiers (amount/balance/debt/
  salary/income/expense/cost/price/net-worth) matchés en SUBSTRING (capte `liquidDebt`/`mortgageBalance`/`annualAmount`…) ; les
  termes ambigus (token/email/`fact`…) restent ANCRÉS (anti faux-positif `factor`). Tests : composés redactés + diagnostiques conservés.

### 🔬 Audit financier 2026-06-17 (findings vérifiés — `docs/AUDIT_FINANCIER_2026-06-17.md`)
> Cœur money-critical = AAA (conservation prouvée ≤0,02 $/~25 scénarios, fiscalité 0 écart). **Tous les findings
> ci-dessous sont à la PÉRIPHÉRIE** (consommateurs UI/IA/viz qui recalculent au lieu de la source unique) — aucun
> n'altère la VALEUR du patrimoine net. Lot d'implémentation : commencer par le keystone PUIS H1/H2 (test avant fix).
- [x] **[NW-PARITY-INVARIANT]** ✅ HIGH (★ garde-fou keystone, PR #370 2026-06-19) — SOURCE UNIQUE `computePresentNetWorth`
  (3 surfaces routent) + RESTE livré : `tests/services/nwParity.test.ts` cross-check le NW présent ≡ NW de DÉPART du moteur
  (`computeStartingCash` ≡ `computeCurrentLiquidity` par construction ; Σ 6 buckets `derivePortfolioStartingBalances` ≡
  `computeInvestmentsValue` — PAS « par construction » : 2 chemins de valorisation, vérifié) − dettes ; + end-to-end
  `chartData[0]` à flux nuls AVEC dettes (tolérance relative 0,1 %, le mois 0 applique un MER minime). Discriminant prouvé
  (D1 TOTAL double-compté, D2 dettes omises, D3 valorisation 2× → tous attrapés). **LIMITE documentée** : parité définie HORS
  immobilier (`computePresentNetWorth` exclut l'immo, le moteur l'inclut dans `chartData[0]`). Panel 3 agents APPROVE.
- [x] **[NW-UI-DEBT]** ✅ HIGH (livré PR audit) — `useDerivedFinancials.globalNetWorth` route vers `computePresentNetWorth`
  (soustrait les dettes). Avant : cash+investments SANS dettes → Dashboard gonflé.
- [x] **[AI-CTX-FX]** ✅ HIGH (livré PR audit) — `AiAssistant` : FX RÉELS (`fxRates`) + dettes soustraites via
  `computePresentNetWorth`/`computeInvestmentsValue` ; 1.38/1.50 en dur supprimés. Régression `TabRouter.availableCash`
  (dérivation `globalNetWorth − placements`) corrigée en passant (→ `currentLiquidity`).
- [x] **[FISC-DETTE-TOTALE-MORTGAGE]** (M5) ✅ MEDIUM (livré, décision Marc = champ additif) — champ `DettesNonImmo`
  (= activeDebts+liquidDebt+smithManoeuvre, SANS hypothèque) ajouté à `monthlyOutput` + `projection/types` →
  `NetWorth = Σactifs − DettesNonImmo` tient TOUJOURS (Immobilier = équité nette). INV-9 étendu : reconstructabilité
  via DettesNonImmo (< 2 $) + discriminant (DetteTotale NE reconstruit PAS sous hypothèque, écart = solde hypothécaire).
- [x] **[LLM-INJECT-PARITY]** (SEC-1) ✅ MEDIUM (livré) — `getCoupleOptimizationStrategies` + `getNextBestActions`
  neutralisent désormais les noms utilisateur (`sanitizePromptText`) et isolent les blocs de données en `<DONNEES>`
  (`wrapUserData`) — parité avec les 4 autres surfaces LLM. Le system prompt QUEBEC_FISCAL_CONTEXT isole déjà `<DONNEES>`.
- [x] **[FISC-WHT-HARDCODE]** ✅ **FAIT (2026-06-26, LOT 6/M1)** — `withholdingForGrossRRSP` tiered 19/24/29 % (barème tiers). Résiduel → [WHT-DISPLAY-EXACT] l.381 coché. Doublon fermé.
  DOUBLE-COMPTAGE dans ce compteur d'AFFICHAGE (`totalTaxesPaid`, PAS le NW). Augmenter le taux empirerait le double-compte.
  À FAIRE d'abord : vérifier empiriquement `totalTaxesPaid == Σ(sorties d'impôt réelles)` (cadre moneyConservation), puis
  corriger selon le résultat (retirer la ligne si double-compte, ou aligner sur la vraie retenue si complémentaire). Effort M.
- [x] **[FISC-DIV-SHARE-DRY]** (M2) ✅ MEDIUM (livré) — `NONREG_DIVIDEND_DISTRIBUTION_SHARE = 0.30` extraite dans
  `projection/helpers.ts`, consommée par `projection.ts` ET `taxDecember.ts` (source unique). Value-neutral.
- [x] **[FISC-INCLUSION-DRY]** (M3) ✅ MEDIUM (livré) — `projection.ts:1435` importe désormais
  `CAPITAL_GAINS_INCLUSION_STANDARD` (au lieu de `0.5` en dur). Value-neutral.
- [x] **[FISC-VIZ-CREDITS]** (M4) ✅ MEDIUM (livré, décision Marc) — `TaxBracketViz` : total + taux effectif (par
  juridiction ET combiné) tirés de `calculateFiscalReport` (NET, crédits BPA+abattement) ; barres + détail $ restent
  BRUTS (pédagogique, libellés « avant crédits »). Fin du total « exact » surévalué.
- [x] **[FISC-CONST-LINT]** ✅ MEDIUM (PR #364, 2026-06-18, garde-fou) — `utils/fiscalConstantsGuard.ts` +
  `tests/fiscalConstants.guard.test.ts` (10 tests, échec dur, choix Marc). Auto-extrait de `tax.ts`/`realEstate.ts` les littéraux
  DISTINCTIFS non-collisionnables (entiers ≥5 chiffres ≠ `…000` + taux 4 décimales) et échoue si l'un fuite hors source.
  Scope sûr : ronds (`60000`=60 s ms) et taux 2-décimales (`0.5`) EXCLUS. Strip des commentaires (numéros de ligne ARC ≠
  constantes). Échappatoire `// fiscal-const-ok`. **A trouvé une vraie fuite** : `setupSimulation.ts` recopiait `32490`
  (RRSP 2025) → nommé `RRSP_ANNUAL_LIMIT_FALLBACK` dans tax.ts (byte-identique, 180+ tests projection verts). Démo
  (`testBudget`) exclue. Ferme structurellement M1-M3.
- [ ] **[FISC-CONST-LINT-LIMITS]** 🔧 LOW (découverte #364) — limites connues du garde-fou, à garder en tête :
  (1) les **taux à 2-3 décimales** (`0.063` RRQ, `0.205`, `0.15` clawback, `0.18` REER) ne sont PAS bannissables sans
  faux positifs (omniprésents en ratios) → une recopie manuelle d'un tel taux passerait sous le radar. (2) Les **facteurs
  FERR** (`helpers.ts` `RRIF_RATES`, `0.0617`…) sont des constantes réglementaires hors `tax.ts`/`realEstate.ts`, donc non
  protégées par le scan. Aucune fuite aujourd'hui (vérifié). Étendre le scope = arbitrage faux-positifs à faire.
- [ ] **[FISC-RRSP-PRE2010-FALLBACK]** 🔧 LOW (découverte #364) — `setupSimulation.ts` applique
  `RRSP_ANNUAL_LIMIT_FALLBACK` (= plafond 2025, 32 490 $) aux années en sol canadien **avant 2010** (hors table). C'est
  ANACHRONIQUE (plafond réel ~16,5 k$ en 2005) → sur-estime les droits REER historiques des très vieux profils (mord
  seulement si salaire×0,18 > 32 490, càd salaires > ~180 k$). Pré-existant (non introduit par #364). Fix futur : étendre
  la table avant 2010 ou extrapoler à la baisse.
- [x] **[AI-SNAP-FREQ]** (L4) ✅ LOW (livré) — `monthlyExpenses` NORMALISÉ par fréquence + hors épargne :
  `financialSnapshot` via `computeMonthlyBudgetAggregates`, `NextBestAction` via `monthlyAmountFor` (excl. Epargne).
  Avant : Σ brute des cibles (poste annuel compté ×12) envoyée à l'IA/MCP. 29 tests verts.
- [x] **[AI-NBA-FX]** ✅ LOW (livré) — `NextBestAction` utilise désormais les `fxRates` RÉELS du store (avant : `{}`
  → actifs étrangers à 1:1). NW + ventilation CELI/REER envoyés à l'IA corrects. (DRY complet via `buildFinancialSnapshot`
  reste un nice-to-have séparé — duplication du snapshot inline, consigné.)
- [x] **[ENG-LOOP-ORDER-TEST]** (L1) ✅ LOW (PR #362, 2026-06-18) — `tests/services/projection.loopOrder.test.ts` : garde-fou
  de l'ordre boucle (allocation AVANT croissance). 2 scénarios : (1) actifs investis partis de 0 → croissance mois 1 > 0
  (la contribution du mois finance sa propre demi-mois de rendement) ; (2) contrôle sans contribution → croissance investie === 0.
  DISCRIMINANT PROUVÉ à la main : en simulant l'ordre inversé (croissance sur soldes PRÉ-allocation), le scénario 1 échoue
  (`expected 0 to be greater than 1000`). Attrape une inversion que les 12 invariants de conservation laissent passer (l'argent
  reste conservé, seul le rendement est décalé). Liquide exclu (démarre ≠ 0).
- [x] **[ENG-MONTHLYOUTPUT-TEST]** (L2) ✅ LOW (PR #351, 2026-06-18) — `tests/services/monthlyOutput.test.ts` : 19
  assertions sur `buildMonthlyDataPoint` (mode MC minimal + mappings dérivés DetteTotale/DettesNonImmo, diffNW,
  *Max, NetTransfer, CoastFIRE, AccruedTax, ExpenseInflation, reconstructabilité, gardes div-0/Infinity). Panel
  `code-reviewer` (arrondi IEEE-754 borderline corrigé + 4 mappings non couverts ajoutés).
- [x] **[ENG-TAX-NS]** ✅ DÉCISION Marc 2026-06-19 : **GARDER l'alias** `services/tax.ts` (`export *`). Pas de
  résorption. Clos (voir batch décisions 2026-06-19).
- [x] **[FISC-WELCOME-2026]** ✅ **FAIT (2026-07-07)** money-critical — `services/realEstate.ts` `WELCOME_TAX_QUEBEC` :
  barème « reste_qc » passé du millésime 2025 (58 900/290 000/552 300 + 4ᵉ tranche 2 %) au **barème de BASE 2026 à 3 tranches**
  (62 900 : 0,5 % / 315 000 : 1,0 % / >315 000 : 1,5 %). La 4ᵉ tranche à 2 % (sur-tranches municipales >500 k$) est RETIRÉE →
  limite assumée documentée (ville par ville, non modélisable sur le binaire montreal/reste_qc). Discriminant : 500 k$ = 5 610,50 $
  (avant : 5 755,50 $) + bornes exactes 62 900/315 000 testées. SOURCE : *Gazette officielle du Québec* 2025-06-07 nº 23 (indexation
  +2,3438 %). Panel `financial-integrity`. Montréal intact, invariant « montreal ≥ reste_qc » préservé.
- [x] **[TP1G-VIVANT-SEUL]** ✅ **FAIT (2026-07-07)** — `utils/tax.ts` : montant « personne vivant seule » (2 172 $)
  additionné à âge + revenu retraite AVANT la réduction UNIQUE 18,75 % au-delà du **seuil unique 42 955 $** (les paliers
  duaux 27 835/45 270 non sourcés sont ARCHIVÉS → touche aussi les couples, crédit ↓ léger dans la bande), conversion 14 %.
  Gate `!hasSpouse` = solo ET survivant (via `taxFilers`, aucun changement `taxDecember.ts`). Discriminant prouvé (zéro-out
  → 3 tests solo échouent) ; suite complète 2352 verts, 2 goldens ITEM-2C re-basés SCIEMMENT (solo −9 175 $ ; couple +9 $).
  Panel `financial-integrity` + `silent-failure-hunter`. Limites assumées (doc §4) : montant appliqué au bloc 65+ (solo <65
  non crédité) ; supplément monoparental 2 681 $ NON modélisé (exigerait `childrenCount`).
- [ ] **[FISC-LINE361-PERCONJOINT-REDUC]** 🔍 LOW money-critical (découverte `financial-integrity` TP1G 2026-07-07, PRÉ-EXISTANT) —
  la réduction 18,75 % de la ligne 361 QC est appliquée PAR CONJOINT en mode retraité couple (`taxDecember.ts:532` passe
  `familyIncome = taxableReal` TOTAL à CHAQUE appel, boucle n=2) → si l'Annexe B réduit le TOTAL combiné une SEULE fois,
  la réduction serait comptée 2× dans la bande de réduction PARTIELLE → léger sur-impôt couple. NON introduit par TP1G
  (code d'avant, non modifié). Vérifier la structure réelle de l'Annexe B (réduction sur le total ménage vs per-déclaration)
  AVANT de coder ; discriminant `git stash` + panel. Golden `coupleEqual` inchangé = crédit soit nul soit plein hors bande.
- [x] **[REEE-LITERALS]** ✅ **FAIT (2026-06-26)** — `services/projection/childrenReee.ts` : SCEE/IQEE/REEE extraits en
  constantes nommées+sourcées (`SCEE_GRANT_RATE`, `*_ANNUAL_GRANT_BASIC/CATCHUP`, `*_LIFETIME_GRANT_LIMIT`, `IQEE_*`,
  `REEE_LIFETIME_LIMIT_PER_BENEFICIARY`, `REEE_TARGET_ANNUAL_CONTRIB_*`, + `REEE_AIP_TAX_RATE` marqué « approximation modèle »),
  pointant vers `FISCAL_REFERENCE §REEE`. Refactor PUR (valeurs inchangées) : golden + conservation + suite byte-identiques. Aucun impact $.
- [ ] **[NW-ASSETBREAKDOWN-DRY]** 🔧 LOW (audit 2026-06-17, panel) — `utils/useDerivedFinancials.ts:45-66` :
  `assetBreakdown` ET `currentLiquidity` recalculent INLINE au lieu de `computeAssetBreakdown`/
  `computeCurrentLiquidity` (`services/portfolio.ts`). ⚠️ **Analyse 2026-06-18 (PR #351) : PAS un quick win.**
  `currentLiquidity` = router safe (logique identique). MAIS `assetBreakdown` = **3 deltas sémantiques** sur un
  agrégat partagé : (1) le local met crypto dans `nonReg` (else), le helper le SORT → `nonReg` baisserait pour
  `Retirement.currentNonReg` (TabRouter:236) + contexte NBA (App.tsx:569) ; (2) le local a `reee` HARDCODÉ à 0,
  consommé par `currentRESP` (ChildPlanning, TabRouter:213) → changerait ; (3) l'interface `DerivedFinancials`
  n'a pas de champ `crypto`. = classe « changer un agrégat partagé casse silencieusement les dérivations »
  (CLAUDE.md). **À RESCOPER** : vérifier chaque consommateur + décider crypto/reee délibérément (effort M, pas S).

### 🛡️ Durcissement structurel (brief Marc 2026-06-17, post-audit) — VALIDÉ + reformulé pour l'app
> Objectif Marc : rendre bugs math / blocages UI / corruptions de données structurellement impossibles. Statut vérifié
> contre le code actuel — certains tickets sont DÉJÀ faits (ne pas refaire), d'autres partiels. IDs reformulés pour FinanceAI.

**ÉPIC 1 — Noyau de calcul & preuve**
- [x] **[HARDEN-FUZZING]** ✅ HIGH (PR #365, 2026-06-18, ticket 1.1) — `tests/services/projection.fuzzConservation.test.ts`
  (fast-check `^4.8.0` dev). 500 scénarios aléatoires BORNÉS → par mois : reconstructabilité forme-BILAN
  `|NW − (Σactifs − DettesNonImmo)| ≤ 1 $` (PAS la forme dépistage, faux-positive sur flux one-time) + NetWorth fini
  (lecture STRICTE, pas de NaN silencé) + aucun actif (hors immo) négatif (INV-6). Seed FIXE (CI déterministe), timeout
  lié à NUM_RUNS, fast-check affiche contre-exemple + seed à l'échec. **Discrimination PROUVÉE end-to-end** (injection
  `+1000` au NW → fuzz échoue, counterexample minimal). Panel 4 agents (résiduel max MESURÉ 0,02 $, arbiter = `computeRawNetWorth`
  terme-pour-terme, chemins fiscaux exercés : REER 70 %, clawback PSV 10 %, insolvabilité 33 %). Complète les ~25 scénarios fixes.
- [~] **[FUZZ-ONETIME-FLOWS]** 🔧 MEDIUM ◑PARTIEL (PR #367, 2026-06-19) — le fuzz génère désormais l'**ACHAT IMMOBILIER**
  (mise 5-50 % < prix → hypothèque ; **mesuré 257/500 runs sous hypothèque**, écart max 886 k$) + **RÉNOVATION** majeure,
  et un invariant **`DetteTotale ≥ DettesNonImmo`** (hypothèque non double-comptée, écart = `mortgageBalance ≥ 0`). **Test
  déterministe immo** : reconstruction NW sous prêt. La reconstructabilité SOUS hypothèque (raison d'être de la forme-bilan,
  ex-`immoSeen=0/500`) est désormais fuzzée. Discrimination PROUVÉE end-to-end (flip signe équité + drop liquidDebt de
  DetteTotale → fuzz échoue). **RESTE (suivi)** : la VENTE immo / GAIN EN CAPITAL locatif (déclenché par lifeEvent « vente »
  — le fuzz achète et DÉTIENT), le REVENU LOCATIF (`rentalIncomeMonthly`), l'ÉQUITÉ NÉGATIVE (choc immo / immeuble sous l'eau),
  véhicule, héritage, REEE/childGoals.
- [x] **[DEP-UNDICI-VULN]** ✅ **RÉSOLU/PÉRIMÉ (constaté 2026-06-25)** — voir [DEP-UNDICI] : le lockfile est à `undici 7.28.0` (≥ fix),
  `npm audit` = **0 vulnérabilité**. Le `npm ls` à 7.25.0 = `node_modules` local périmé (pas réinstallé). Rien à coder.
- [x] **[HARDEN-NETWORTH-EXHAUSTIVE]** ✅ MEDIUM (PR #356, 2026-06-18, ticket 1.2) — garde anti MONEY-PHANTOM sur
  `NetWorthParts` (`services/projection/netWorth.ts`) : `export const NET_WORTH_SIGN: Record<keyof NetWorthParts, 1|-1>`
  → un champ ajouté à l'interface SANS signe casse le **typecheck** (prouvé). + test croisé « littéral == Σ signe×valeur »
  → un terme oublié dans la formule fait échouer le test (discriminant prouvé : retrait d'un terme → 3 tests rouges).
  ⚠️ La formule littérale `computeRawNetWorth` reste **byte-identique** (hot-path inchangé, zéro régression — conservation
  verte) : le sign-map est un filet compile-time + test, INERTE au runtime. Panel `projection-validator` : garde correcte.
- [ ] **[HARDEN-DECIMAL-STUDY]** 🔧 LOW/⏳ (nouveau, ticket 1.4, ÉTUDE) — PoC arithmétique exacte (centimes entiers OU
  `decimal.js`) sur un sous-module (impôts). ⚠️ Priorité BASSE : la dérive flottante est DÉJÀ bornée ≤ 0,02 $ sur ~25
  scénarios (invariants tolèrent < 2 $). Mesurer le coût Monte Carlo (480 mois × 100 iter) AVANT d'adopter. Ticket 1.3 =
  `[FISC-CONST-LINT]` ci-dessus (déjà au backlog).

**ÉPIC 2 — Exécution & UI**
- [~] **[HARDEN-MC-WORKER]** 🔧 MEDIUM (PARTIEL, ticket 2.1) — `services/projection.worker.ts` + `runProjectionAsync`
  (timeout 30 s) EXISTENT (W1.1). RESTE : vérifier/ajouter le **chunking** (lots 10-50 iter) + un **`onProgress(pct)`** pour
  la barre MC ; évaluer **Comlink** (non installé) pour des types bout-en-bout. DoD : 100 iter × 40 ans sans drop de frame.
- [~] **[HARDEN-SNAPSHOT-RACE]** 🔧 MEDIUM (PARTIEL, ticket 2.2) — le moteur est PUR (zéro mutation d'état partagé, vérifié
  audit) ; `structuredClone` existe déjà au store ; AbortController déjà sur les appels API (claude/finnhub). RESTE :
  garantir un snapshot immuable de l'input AVANT envoi Worker/IA + un AbortController sur le chemin Worker projection.

**ÉPIC 3 — Cycle de vie**
- [x] **[HARDEN-FISCAL-TIMEBOMB]** ✅ MEDIUM (PR #363, 2026-06-18, ticket 3.1) — `utils/fiscalFreshness.ts` (helper pur)
  + `tests/utils/fiscalFreshness.test.ts`. Lit la date « Dernière vérification »/« Ré-audité » la PLUS RÉCENTE de
  `FISCAL_REFERENCE.md` (regex tolérante au gras markdown) et mesure l'ancienneté RELATIVE (pas de `Date.now() < 2027`
  calendaire) : `console.warn` à 12 mois, **échec dur à 18 mois** (généreux → n'interrompt un travail non-fiscal qu'en
  cas de négligence profonde ; la cadence `/audit-financier` l'évite). Date introuvable ⇒ traité comme périmé (pas de
  désamorçage silencieux). Discrimination INTRINSÈQUE : test unitaire avec date périmée synthétique (`now` injecté) →
  `isExpired=true`. 11 tests. Réutilisable pour un futur « warning au build ».
- [x] **[HARDEN-ZUSTAND-MIGRATE]** ✅ DÉJÀ FAIT (ticket 3.2) — `persist` schema **v7** + `migratePersistedState` (v1→v7,
  optional chaining, fallback défaut + dump du localStorage corrompu) + tests `migratePersistedState.test`. Plus avancé
  que le ticket (v2). Rien à faire.

**ÉPIC 4 — Frontières & IA**
- [ ] **[HARDEN-ZOD-GATEKEEP]** 🔧 MEDIUM (nouveau, ticket 4.1) — Zod est utilisé (sorties LLM `safeJsonValidate`, backup)
  mais PAS en gatekeeping systématique des INPUTS UI. Ajouter des schémas stricts (`salary: z.number().min(0)`, `age:
  z.number().min(18).max(100)`…) aux actions Zustand / handlers → le moteur ne reçoit jamais NaN/Infinity/string (défense
  en profondeur en amont du garde NaN du moteur).
- [x] **[HARDEN-AI-CTX]** ✅ DÉJÀ FAIT (ticket 4.2, #319) — `AiAssistant` + Dashboard routent par `computePresentNetWorth`
  (FX réels `fxRates`, dettes soustraites). NB : le NW PRÉSENT utilise `computePresentNetWorth` (pendant de
  `computeRawNetWorth` qui sert le FUTUR/moteur) — garde de parité keystone dans `portfolio.test`.
- [~] **[HARDEN-SAFEBLOCK]** 🔧 LOW (PARTIEL, ticket 4.3, complète SEC-1 #321) — sanitizePromptText + wrapUserData LIVE sur
  toutes les surfaces LLM (l'attaque `</DONNEES>Ignore…` est déjà neutralisée par `neutralizeFrameTags`). RESTE :
  factoriser un helper unique `buildSafeUserBlock(text)` + imposer son usage (idéalement lint) pour qu'une FUTURE surface
  LLM ne puisse pas oublier la protection.


- [x] **[HARDEN-NETWORTH-NAN]** ✅ MEDIUM (PR #372, 2026-06-19) — `computeRawNetWorth` (SOURCE UNIQUE du patrimoine)
  n'avait AUCUNE garde `Number.isFinite` : un terme non fini (`liquid`/`reer` NaN) rendait TOUT le patrimoine NaN →
  graphe vide SANS `logError` (échec silencieux, dette préexistante). Fix : helper module-scope `sumNetWorthParts`
  (formule unique) ; total non fini → chemin lent qui rabat chaque terme fautif sur 0 (itère `NET_WORTH_SIGN`) +
  `logError(source:'projection', {offending})` **throttlé par signature** (hot-path MC, anti-flood localStorage) +
  recalcul. Chemin sain = 1 `Number.isFinite` (formule inchangée). Miroir runtime de `sumActiveDebts`. Discriminant
  prouvé (court-circuit → 4 tests échouent). Panel 3 agents APPROVE (1 finding redaction PII RÉFUTÉ : pattern ancré
  `^debt$` ≠ substring → clés `*Debt` non redactées). 6 tests ajoutés.
- [x] **[FISC-ESTATE-PENSION-NPV]** ✅ MEDIUM (PR #352, 2026-06-18) — NPV des rentes publiques (RRQ/PSV) au bilan
  successoral : montant MENSUEL × facteur d'annuité ANNUEL sans ×12 → ~12× sous-évaluée (~34 k$ au lieu de ~409 k$
  sur 1200 $/mois). Fix = annualiser ×12 avant le facteur (`estateCalculation.ts`). Test discriminant PROUVÉ
  (`git stash` → 6 tests échouent : 48 681 vs 584 180). Panel financial-integrity (×12 = bonne réannualisation,
  +0,67 % vs annuité mensuelle, zéro double-comptage) + projection-validator (12/12 conservation, appel post-sim).
  HYPER_INFLATION re-ciblé sur `finalNetWorth` (rentes indexées = couverture, estate nominal peut dépasser la base
  sous inflation — leçon CLAUDE.md). **Découverte** : 1 LOW silent-failure (voir [ENG-ESTATE-ESTIMATE-FIN] ci-dessous).
- [x] **[ENG-ESTATE-ESTIMATE-FIN]** ✅ LOW (PR #360, 2026-06-18) — `estateCalculation.ts` : `Math.max(0, fin(rrqEstimate
  Monthly))` (idem psv). Un estimé `NaN` zérotait SILENCIEUSEMENT TOUT l'`estateNetWorth` (le `fin()` de sortie
  absorbait le NaN propagé, effaçant même un `finalRawNetWorth` positif). Désormais le NaN est neutralisé à la SOURCE :
  sa rente → 0, l'autre rente + le reste du patrimoine calculent (dégradation gracieuse). Zéro changement sur les cas
  finis (`fin(x)=x`). Discriminant prouvé (`git stash` → NaN rrq zérotait l'estate). Panel silent-failure-hunter : fermé.
- [x] **[FISC-EVENT-INCOMELOSS]** ✅ MEDIUM (PR #354, 2026-06-18) — PERTE_EMPLOI/SABBATIQUE/ACCIDENT étaient un
  NO-OP (le moteur ne lisait que `impactAmount`, absent pour ces types) → une perte d'emploi de 6 mois était
  ignorée. Fix = `computeIncomeLossFactor` (`monthlyEvents.ts`) réduit le revenu MÉNAGE de `incomeLossPercent`%
  pendant `durationMonths` (sémantique Marc : % perdu + durée, défauts 100/100/50). UI dédoublée (% perdu +
  durée) + validation (refuse un événement inerte). Net + brut REER réduits ; **l'impôt salarial de décembre
  N'est PAS réduit** (biais conservateur, identique au chômage stochastique — vérifié empiriquement par le panel).
  Test discriminant prouvé (`git stash` → no-op → patrimoine identique). Conservation : +2 tests moneyConservation
  (50 % + 100 %). Panel 5 agents, tous findings intégrés. **Suite possible** : per-conjoint (sélecteur « qui »).
- [x] **[FISC-RE-SALE-RESIDUAL]** ✅ MEDIUM (PR #368, 2026-06-19) — vente immobilière quasi-underwater (hypo 95-100 %
  de la valeur, les 5 % de frais poussent `saleNet` < 0) : `addLiquid(Math.max(0, saleNet))` (`monthlyEvents.ts`)
  EFFAÇAIT le déficit (patrimoine surévalué de `|saleNet|`). Fix : `addLiquid(saleNet)` → le déficit est DÉDUIT
  (ponctionné du liquide, ou porté en `liquidDebt` visible via PV-6 si liquide épuisé). ΔNW = −5 % de la valeur
  (prouvé algébrique + empirique). Tests : unitaire (`monthlyEvents.test.ts` 50k→40k) + end-to-end conservation
  (`moneyConservation` ΔNW < −13k au mois de vente), DISCRIMINANTS prouvés via `git stash` (ancien −7965). Log
  corrigé (n'affiche plus « +0$ » sur un déficit). Panel 4 agents APPROVE (conservation prouvée, 0 régression).
- [x] **[FISC-RE-CAPITAL-LOSS]** ✅ MEDIUM (PR #371, 2026-06-19) — `monthlyEvents.ts` à la vente d'un LOCATIF sous coût :
  `gain = max(0, produit − coût)` + `if (gain > 0)` IGNORAIT silencieusement la perte en capital réalisée (avantage
  fiscal LIR 111(1)b perdu). Fix : nouveau helper SOURCE UNIQUE `applyCapitalDisposition(state, rawGain signé)` dans
  `portfolioOps.ts` (perte < 0 → banque ; gain ≥ 0 → nette la banque puis impose) ; `handleNonRegSale`/`handleCryptoSale`
  refactorés dessus (zéro duplication) ; mutator immo `realizeCapitalGain` → `realizeCapitalDisposition` (nom honnête,
  gère gain ET perte) + log de la perte. Discriminant prouvé (réintro `Math.max(0)` → test échoue). Panel + 12 invariants
  conservation verts.
- [ ] **[FISC-ASSETLOC-INTL]** 🔧 MEDIUM — asset-location : classe `international` jamais analysée →
  retenue étrangère 15 % en CELI/REER non comptée (`assetLocation.ts:104-132`) ; l'outil dit « optimal »
  alors qu'une perte existe (~375 $/an sur 100 k$ international en CELI). Fix non trivial (le patch naïf
  reste 0 : taxIdeal NonReg=marginalRate domine) — modéliser le coût de détention.
- [x] **[FISC-SRCDED-NOOP]** ✅ **RÉSOLU (2026-06-26, choix Marc) — par RETRAIT du code mort, pas par fix** :
  l'enquête a prouvé que les 2 bugs (ordre + unité) affectaient une valeur **DISCARDÉE** — `computeMonthlyWithholding`
  accumulait dans `taxCurrentYear.revenu`, **jamais appliqué au liquide** (`impotSalaireMois=0`), puis **écrasé par
  l'override de décembre** (V30) avant le règlement d'avril. Preuve : perturbation +999 999/mois → golden PINé +
  2331 tests d'intégration **byte-identiques** (seuls les 2 unitaires DE la fonction cassaient). Le flag T1213
  fonctionne via le chemin DÉCEMBRE (`taxDecember`, V49, correct). « Corriger » = zéro effet → fonction **retirée**
  (résout aussi PERF-WITHHOLDING + gain perf MC). Panel projection-validator (2329/2329) + financial-integrity + code-reviewer ✅.
- [x] **[A11Y-DANGER-300]** ✅ LOW (2026-06-17) — `text-danger-300` n'existait PAS dans `tailwind.config.js` (palette
  danger = 400/500/600 seulement) → couleur ignorée. 3 sites hors périmètre MONEY-PHANTOM :
  `ImportBankStatement.tsx:123`, `RealEstateAdviceCard.tsx:19`, `Transactions.tsx:439` (+ son hover no-op).
  Fix : → `text-danger-400`.
- [x] **[A11Y-MODAL-PRIVATE]** ✅ LOW (2026-06-17) — `FutureDetailModal` entièrement migré vers `<PrivateAmount>`
  (idiome `const blur` ×2 supprimé ; valeur nette, comptes, apports/gains, flux, moments-clés, espace cotisation
  enveloppés). En mode discret → ••• hors DOM. (Livré avec [A11Y-D6-SR-2] ph.3.)

## 🔎 Review multi-agents 2026-06-15 — risques confirmés (27 : 8 HIGH / 11 MEDIUM / 8 LOW)
> Audit complet (12 agents specialises, emphase financiere). Les **HIGH financiers #1-#6 sont en
> correction cette session**. Severite en tete de chaque item.

### Fiscal / moteur (money-critical)
- [x] **[FISC-RRQ-UNIT]** ✅ HIGH (#296, 2026-06-15) — `retirementIncome.ts:151` : `grossSalary` (mensuel) ÷ MGA annuelle → RRQ ~12× trop basse. Corrigé (×12) + test discriminant + panel projection-validator/fiscal-accuracy.
- [x] ~~**[FISC-MARGINAL-YEAR]**~~ ❌ **FAUX POSITIF** (vérifié 2026-06-15, projection-validator) — le finding supposait un revenu NOMINAL ; le moteur passe un revenu RÉEL déflaté (`monthlyCalcs.ts:92-110` : déflation revenu + ré-inflation du `totalTax`). `marginalRate` sur paliers 2026 est donc DÉJÀ correct ; propager `year` introduirait un bug (taux marginal décroissant + casse REER-first/goldens). **NE PAS corriger.**
- [x] **[FISC-WELCOME-UNIFY]** ✅ HIGH (2026-06-16) — taxe de bienvenue unifiée. Décision Marc : champ `RealEstateGoal.municipality` (`'montreal' | 'reste_qc'`, type `Municipality`) requis à la saisie (sélecteur `PropertyConfigurator`), PAS de défaut stocké ; non choisi ⇒ repli conservateur Montréal. SOURCE UNIQUE : `realEstate.ts:calculateWelcomeTax(price, municipality?)` porte les 2 barèmes (MTL 8 tranches→4% / reste QC 4 tranches→2%) ; `helpers.ts:welcomeTax` y délègue (fin du bug C9 « 3 implémentations divergentes »). Param MCP ajouté. Les 2 barèmes transcrits dans `FISCAL_REFERENCE §8`. Panel : fiscal-accuracy/projection-validator/code-reviewer/silent-failure-hunter/a11y-auditor → 0 CRITICAL/HIGH, 2048 tests verts. Restes LOW documentés : seuils provinciaux 2025 à réindexer 2026 ; municipalités hors MTL regroupées dans `reste_qc`.
- [x] **[FISC-SURVIVOR-DRAWDOWN]** ✅ HIGH (#297, 2026-06-15) — `cashflowAllocation.ts` : seuils survivant ×2 → `liveFilers=1` (cohérent taxFilers/oasBeneficiaries) + salaire du défunt exclu. Verdict NUANCE (qualité de stratégie, pas fuite fiscale). Panel projection-validator OK. NB : `meltdownReer.ts` a le même schéma (cible ×N) — voir [FISC-MELTDOWN-SURVIVOR] ci-dessous, opt-in MC, à faire si voulu.
- [x] ~~**[FISC-ACB-RENO]**~~ ❌ **FAUX POSITIF** (vérifié 2026-06-15, fiscal-accuracy) — prémisse fausse : les rénos n'augmentent PAS non plus `currentValue` dans le moteur (croît seulement par `propertyGrowthRate`). `cost` ET `currentValue` ignorent les rénos symétriquement → gain cohérent, pas de surimposition. ⚠️ Le fix suggéré (ajouter rénos à `cost` seul) serait NOCIF (sous-imposition). **NE PAS corriger.** (Sujet séparé hors scope : l'équité/net worth sous-estime les rénos capitalisées → [DETTE-RENO-EQUITY] à créer si voulu.)
- [x] **[FISC-LATENT-RE]** ✅ HIGH (#298, 2026-06-15) — `latentTax.ts` : `realEstateLatentGain` (×50%) ajouté à `totalTaxableLatent`, même Σ que le bilan successoral. Seul `ImpotLatent` d'affichage bouge. Panel projection-validator OK.
- [x] **[FISC-TAXDEC-INCR]** ✅ **LIVRÉ 2026-08-20** (PR #676 — GO Marc A2 « code le ») : (a) codé, (b) caduc (#564), (c) statu quo documenté. **Détail : section « 2026-08-20 — [FISC-TAXDEC-INCR] (a) » en tête de ce fichier** (source unique — ne pas dupliquer ici).
- [x] ~~**[FISC-GOVPENSION-SCALE]**~~ ❌ **FAUX POSITIF** (vérifié 2026-06-16, panel projection-validator + fiscal-accuracy + code-reviewer, unanime) — prémisse FAUSSE : `governmentPension` est un AGRÉGAT **MÉNAGE** (RRQ+PSV combinés des 2 conjoints), pas un per-personne. L'absence de ×N est VOULUE et cohérente sur 3 sites (`retirementIncome`, `estateCalculation:177-178`, `setupSimulation:114-118`) + documentée (utils/tax.ts:99, FISCAL_REFERENCE §6) + verrouillée par régression (`estateCalculation.test.ts:131`). Ajouter ×N = ré-introduire le bug FA-5 (couple double-compté) → **NE PAS corriger**. ✅ Corrections sûres faites (2026-06-16) : label UI clarifié « total ménage (couple combiné) » + typo « Etat→État » (`RetirementIncomeCard.tsx:26`) ; rename `rrqBaseIndiv/psvBaseIndiv → …Family` (`retirementIncome.ts`, le nom trompeur avait FABRIQUÉ le faux positif).
- [x] **[FISC-RRQ-PRORATA]** ✅ MEDIUM (2026-06-16) — prorata de résidence RRQ rendu PER-CONJOINT (`retirementIncome.ts`), mirroir de la PSV : `arrivalAge` via `getResidencyStartYear` (corrige aussi le gate `isImmigrant` manquant → RRQ désormais cohérente avec PSV/CELI/REER), poids RRQ = ratio gains/MGA × prorata résidence per-conjoint, split par poids. Couple non-immigrant ⇒ inchangé (zéro régression baseline ; état `canadaArrivalYear` sans `isImmigrant` inatteignable en prod). 3 tests discriminants (symétrie ordre-conjoints — VÉRIFIÉ échouant sur l'ancien code via stash). Triage adversarial : REAL_BUG confirmé (seul vrai bug sur 7 findings vérifiés).
- [x] ~~**[FISC-INFLATION-COUPLING]**~~ ❌ **DOUBLON de ITEM 2a (déjà rejeté Marc)** (triage 2026-06-16) — `tax.ts:673` indexe les paliers ×1,02/an pendant que le revenu est déflaté par `simInflation`. Le fix proposé (« indexer sur `simInflation` ») a été **prouvé numériquement PIRE** (simInflation 5 %/20 ans : ARC ~29 353 $ vs fix ~7 712 $ vs actuel ~22 313 $ — cf HISTORIQUE.md ITEM 2a). Cause : l'aller-retour déflate→impôt→réinflate est lossy (BPA/crédits en $ fixes). Le vrai correctif = impôt sur revenu NOMINAL + paliers indexés `simInflation` (supprime l'aller-retour) = chantier STRUCTUREL ~12 sites → **décision Marc + plan requis**. Documenté FISCAL_REFERENCE §9. **NE PAS appliquer le fix naïf.**
- [ ] **[FISC-SURVIVOR-CAP]** 🔧 LOW (triage 2026-06-16, différé) — `retirementIncome.ts:224` (survivorRrqFactor) : rente de survivant non plafonnée au max RRQ combiné. ⚠️ Cap naïf `Math.min(rrqMonthly, RRQ_MAX)` serait FAUX (un couple a droit à 2 rentes jusqu'au décès) ; le cap doit s'appliquer à la portion d'UN bénéficiaire (RRQ propre survivant + part défunt ≤ max), via `perUserRrqWeight`. Money-critical + peu d'impact → différé.
- [ ] **[FISC-RAP-REPAY]** 🔧 LOW (triage 2026-06-16, hypothèse DOCUMENTÉE, fix différé) — `realEstateMonth.ts:405-414` : remboursement RAP « toujours honoré » (versement manqué reporté en silence, pas d'inclusion ligne 12900 ; solde impayé pas porté au revenu de la déclaration finale). ✅ Limite consignée FISCAL_REFERENCE §9. Fix (inclusion au revenu + passif successoral) `fixIsSafe:false` (risque de double-comptage estate) → différé.
- [ ] **[FISC-CHILDCARE]** 🔧 LOW (triage 2026-06-16, hypothèse DOCUMENTÉE, fix différé) — `childrenReee.ts:199-201` : facteur de coût résiduel 30 % sur garde privée > 400 $/mois = HEURISTIQUE conservatrice, PAS le vrai régime (féd T778 ligne 21400 / QC crédit remboursable dégressif ~67-78 %). ✅ Consigné FISCAL_REFERENCE §9. Précision réelle (déduction/crédit exacts) = travail dédié → différé.
- [x] **[FISC-REEE-CONST]** ✅ LOW (2026-06-16) — valeurs REEE/SCEE/IQEE vérifiées EXACTES (SCEE 20 %/500/1000/7200 ; IQEE 10 %/250/500/3600 ; REEE 50 000 $/bénéficiaire) et **documentées** FISCAL_REFERENCE §7 (REEE — SCEE/IQEE). Reste optionnel : extraire les littéraux en constantes nommées dans `childrenReee.ts` (noté dans la doc, non urgent).
- [x] **[GUARD-NAN]** ✅ LOW (2026-06-16) — garde `Number.isFinite` en tête de `getMarginalRate` (`utils/tax.ts`) : un income non fini est rabattu sur 0 (1er palier, dégradation prévisible) au lieu du taux MAX silencieux. Sans dépendance (tax.ts reste pur, pas de logError importé).

### Accessibilite
- [x] **[A11Y-D6-SR-2]** ✅ HIGH (2026-06-17 — 3 phases livrées + keystone •••) — fuite : le mode privé est lu intégralement par les lecteurs d'écran (masquage CSS seul). **Phase 1 LIVRÉE** : dossier `projection/` migré (`ProjectionTooltip` 13, `ActionPlanDrilldown` 6, `StressTestPanel` 1, `StrategyOptimizerPanel` 3) → `<PrivateAmount>` ; primitives `PrivateAmount`/`PrivateBlock` dotées d'un prop `title` (conserve les infobulles natives). KPIStat était déjà correct. **Phase 2 LIVRÉE (2026-06-16, 5 fichiers div)** : `DividendPanel` 1, `Budget` 3, `Planning` 3, `ChildPlanning` 1, `Investments` 1 → `<PrivateAmount as="div">`. **Phase 3 LIVRÉE (2026-06-17, 16 instances migrées via agent + vérif suite complète)** : `FutureDetailModal` (idiome `const blur` ×2 supprimé), tables `<td>` (`RealEstate` 4 /`Transactions` 2 /`ImportBankStatement` 1 /`ImportBrokerPositions` 2 /`BudgetGroupTable` 2 → wrapper interne `<PrivateAmount>` dans le td). ⚠️ Les 3 `<input>` (`RetirementIncomeCard` ×2, `BudgetGroupTable` ×1) ne sont PAS wrappables par `<PrivateAmount>` (champ éditable) → approche dédiée ou hors scope. ⚠️ Finding a11y-auditor (phase 1) : les 3 infobulles `title` de `ProjectionTooltip` (l.106/119/122, « Écart… », « Dépôts… », « Rendement… ») sur un span au contenu aria-hidden ne sont PAS annoncées de façon fiable par les SR (limite PRÉEXISTANTE, pas une régression) → en phase 2, remplacer `title` par `aria-describedby`/`sr-only` pour que l'explication soit accessible.
- [x] **[A11Y-CHARTS]** ✅ HIGH (2026-06-17 — phases 1+2 COMPLÈTES) — graphes Recharts sans alternative textuelle
  (WCAG 1.1.1 A). **Phase 1** : primitif `<ChartDataTable>` (sr-only, caption + scope + échantillonnage ≤40 +
  mode privé) intégré dans `ZoomableTimeChart` (StockChart + DashboardEvolutionChart). **Phase 2 (3 lots, ~14
  graphes)** : LOT 1 `FutureProjection`/`Retirement` accumulation/`DebtManager` · LOT 2 `RealEstate` scénarios/
  `Investments` 2 donuts/`Budget` donut/`ChildPlanning` coût+REEE · LOT 3 `Retirement` cashflow/`DividendPanel`/
  `MultiPropertyComparison`/`LifeEvents`/`FutureDetailModal` drill-down. Tous → `<ChartDataTable>` sr-only +
  `role="img"` + **masquage privacy-aware** ($ → `Montant masqué` en mode discret ; `%` visibles). Garde-test
  (DebtManager). ⚠️ Seul l'amortissement RealEstate non câblé car DÉJÀ un `<table>` HTML accessible (correct).
- [ ] **[A11Y-INK500]** 🔧 LOW (EN COURS, par lots) — `ink-500` (#6a7689) sur du contenu actif (échec AA normal). Passer à `ink-400` (#8896a8, AA ✅ 5,21-6,42 cf check-contrast). **Avancement** : `TaxBracketViz.tsx` (4 occ., A11Y-TAXBRACKET) + **LOT 1 fait 2026-06-26** = 6 écrans quotidiens (Dashboard/Budget/BudgetGroupTable/Investments/Transactions/Planning), **43 occ. migrées** sur classification a11y-auditor par-occurrence ; **10 GARDÉES** à raison (icônes = seuil 3:1, séparateurs décoratifs, `ⓘ` aria-hidden, 1 cible inactive délibérée `timeView!==MONTH`). ⚠️ PAS un sed global aveugle. **LOT 2 fait 2026-06-26** = LifeEvents/RealEstate/FutureDetailModal/ChildPlanning/retirement(RetirementIncomeCard+AssetLocationCard), **37 occ. migrées** + **8 GARDÉES** (icônes, tabs inactifs, glyphes aria-hidden) ; code-reviewer a aussi corrigé LifeEvents:367 (texte d'empty-state → ink-400) + ajouté `aria-hidden` au `→` AssetLocationCard:215. **RESTE ~37 fichiers / ~105 occ.** (investments/*, projection/*, sidebar/*, setup/*, realestate/*, AdvancedProjectionParams…) → lots suivants.
- [x] **[A11Y-BUDGETTABLE-SELECT-KBD]** ✅ **FAIT (2026-07-07)** — `BudgetGroupTable.tsx` : `focus-within:opacity-100` sur le
  wrapper des `<select>` fréquence/type (l.147) + `focus:opacity-100` sur le bouton supprimer (l.225, `<td>` séparé) → révélés au
  focus clavier (avant : survol souris uniquement). Panel a11y-auditor APPROVE (anneau de focus natif visible, WCAG 2.4.7 OK) +
  code-reviewer (redondance `focus-visible` retirée). ⚠️ Note hors-scope (a11y-auditor) : `BudgetGroupTable:181` (`text-ink-500`
  sur l'input `target` en vue ≠ MONTH) échoue AA sur du texte actif — mais GARDÉ « à raison » au LOT 1 [A11Y-INK500] (« cible
  inactive délibérée ») ; à re-trancher dans le sweep [A11Y-INK500], pas ici.

### Echecs silencieux
- [x] **[SF-PDF]** ✅ MEDIUM (2026-06-16) — `pdfReport.ts` : échec jsPDF routé vers `logError({source:'ui'})` (visible en prod via SystemView) ; repli print conservé.
- [x] **[SF-RESIDUS]** ✅ LOW (2026-06-16) — `StockComparisonModal.tsx:41` (→ network/warning), `FutureProjection.tsx:464` (→ ui/error, context = champs manquants, pas les objets financiers), `TaxCenter.tsx:89` (→ ai/error) routés vers `logError`. `syncOrchestrator.ts` était déjà propre (référence BACKLOG périmée).

### Tests / dette technique
- [x] **[TEST-PROJ-MODULES]** ✅ **PÉRIMÉ/COUVERT (constaté 2026-06-25)** — les 3 modules ONT des tests directs : `projection.assetLocation.test.ts`
  (8), `monthlyOutput.test.ts` (19), `strategyConfig.returnProfile.test.ts` + `strategyConfigRanking.test.ts` (22) = 49 tests. Item ajouté avant
  ces couvertures. (Leçon R2-FIRE : vérifier qu'une tâche n'est pas déjà faite avant de la coder.)
- [x] **[HEALTH-SAVINGS-RATE]** ✅ **FAIT (2026-06-25, reco PM)** — `HealthIndicator.tsx` : le taux d'épargne + le coussin d'urgence
  comptaient les postes ÉPARGNE comme des dépenses → taux ≈ 0 % pour un épargnant, coussin sous-estimé. Helper pur `monthlyConsumptionExpenses`
  (`healthRatios.ts`, exclut `isSavingsNature`, cohérent avec `computeBudgetParityScore`/`Budget.tsx`) + 4 tests. Panel financial-integrity + code-reviewer ✅.
- [x] **[HEALTH-SAVINGS-CONSISTENCY]** ✅ **FAIT (2026-06-26, choix Marc)** — `nature === 'Epargne'` STRICT remplacé par `isSavingsNature`
  (NFD) sur **5 surfaces / 6 sites** : `portfolio.ts:139` (IA/MCP), `NextBestAction.tsx:114`, `useDerivedFinancials.ts:37` (moteur),
  `buildSimulationParams.ts:231` (moteur MCP), + **5ᵉ surface trouvée par le panel** `Budget.tsx:105` (inflation sim) et `:306` (ventilation
  couple, UI-only). Une nature « Épargne » accentuée est désormais exclue des dépenses PARTOUT (avant : comptée en dépense → épargne sous-estimée
  → projection pessimiste). Test discriminant `healthSavingsConsistency.test.ts` (git-stash : 2500→3500 prouvé) + panel financial-integrity +
  projection-validator (conservation 20/20) + silent-failure ✅. `BudgetGroupTable`/`Budget:266,1010` laissés (groupement UI sur l'union typée, pas un calcul de dépense).
- [x] **[DETTE-PDF-FORMAT]** ✅ MEDIUM (2026-06-16) — `pdfReport.ts` : `formatCAD` local retiré → importé de `utils/format` (source unique fr-CA ; bonus : valeurs non finies → '—' au lieu de « NaN $ »). Tests pdfReport/pdfScenarios verts.
- [x] **[DETTE-RE-SALE]** ✅ **FAIT (2026-07-07)** — `monthlyEvents.ts` : vente immo ciblée par `LifeEvent.propertyId`
  (champ additif optionnel, PAS de bump v7) au lieu du `find` premier-bien qui vendait la RP exemptée au lieu du locatif
  imposable (faussait le gain en capital de dizaines de k$). Fallback rétrocompat exact si `propertyId` absent ; fourni SANS
  match → aucune vente (jamais un AUTRE bien). Sélecteur UI (`LifeEvents`, affiché si ≥2 biens actifs, option « Auto »).
  4 tests discriminants (dont symétrie + no-match + fallback) + panel projection-validator (2352/2352, conservation 20/20)/silent-failure/code-reviewer.
- [ ] **[DETTE-RE-SALE-PURGE]** 🔧 LOW (suivi, panel silent-failure 2026-07-07) — supprimer un bien (`RealEstate.tsx doConfirmDeleteGoal`)
  ne purge pas `lifeEvents[].propertyId` qui le référence → vente orpheline. Mitigé : la vente orpheline est SIGNALÉE (`logFlow`
  « vente ignorée : bien introuvable »), pas silencieuse. Fix propre : avertir/purger à la suppression. Effort S.
  ⚠️ **DIFFÉRÉ (sweep 2026-07-07) — ambiguïté design money-adjacent** : purger `propertyId`→`undefined` re-cible l'événement sur le 1ᵉʳ bien à
  équité positive (ANNULE l'intention de [DETTE-RE-SALE] : ne pas vendre le mauvais bien) ; supprimer l'événement = destructif ; avertir = plus de
  câblage store→dialog. Re-cibler une vente = money-critical → mérite une décision délibérée (option A purge/B remove/C warn) + panel, pas un batch.
  État actuel déjà mitigé (logFlow). À trancher avec Marc.
- [x] **[DETTE-DEADCODE]** ✅ **FAIT (2026-06-26)** — RETIRÉ : `runBuyVsRent` (`realEstate.ts`, test-only, zéro call-site prod) + ses
  types `BuyVsRentInput`/`BuyVsRentYear` (servaient QUE lui) + son bloc de test + import ; `buildTestFixtures` (`testFixtures.ts`, wrapper
  de compat jamais appelé) + ses imports devenus inutilisés (le barrel `testFixtures` reste VIVANT : TestModePanel/Layout/PageSetupGate/
  usePortfolioHistory en consomment les re-exports). EXCLUS après vérif : `clearCredentials` (dans `mcp/` → règle « y toucher seulement sur
  demande ») ; façade `getProfile` (méthode du contrat `MarketDataProvider`, implémentée + testée → API délibérée, pas du cruft). Reste du
  bruit knip (GST/QST/SCHL, interfaces, constantes fiscales) NON purgé (règle CLAUDE.md). + **`_buyVsRentData`** (`RealEstate.tsx`, useMemo
  préfixé `_` jamais rendu — vraie courbe UI = `combinedData`) retiré (trouvé par le panel code-reviewer, même feature morte). 2 commentaires
  stale (`testFixtures.ts` en-tête, `coupleConfort.ts`) corrigés. typecheck + build + suite verts.
- [x] **[PLANNING-ANNUAL-SUB-12X]** ✅ **FAIT (2026-06-26)** — `Planning.tsx` : les KPI « Fixe mensuel »/« Coût annuel » sommaient
  `averageAmount` BRUT puis ×12 → un abo ANNUEL compté ×12. Fix : helpers purs `monthlyEquivalent`/`totalMonthlyCost`/`totalYearlyCost`
  (`utils/subscriptions.ts`) dérivés de `yearlyCost` (source de vérité annualisée) + gardes `Number.isFinite`. KPI + ligne d'affichage
  (`formatCAD(monthlyEquivalent(sub))` « /mois ») câblés. 6 tests dont discriminant (annuel : 130 ancien → 20 nouveau). Panel financial-integrity + code-reviewer.
  Follow-up → `PLANNING-ANNUAL-CALENDAR` (un abo ANNUEL apparaît sur le calendrier CHAQUE mois car le filtre ignore le mois ; + label « /an » explicite vs « /mois »).
- [x] **[HEALTH-SUB-DRY]** ✅ **FAIT (2026-07-07)** — `utils/healthRatios.ts:subscriptionsMonthlyCost` délègue au helper canonique
  `totalMonthlyCost` (`utils/subscriptions.ts`). Panel `financial-integrity` : golden santé NE PEUT PAS bouger (identité math `Σ(x/12)=(Σx)/12`,
  écart sous-ULP, `Math.round` sur métrique+score avant affichage) ; garde NaN préservée (par-item dans `totalYearlyCost`). code-reviewer : pas de cycle d'import. APPROVE.
- [x] **[PLANNING-ANNUAL-CALENDAR]** ✅ **FAIT (2026-07-07)** — helpers PURS `isAnnualSubscription` (discriminant ratio `yearlyCost/averageAmount`,
  seuil STRICT 2 = ~annuel ; plus fréquent → défaut mensuel = sur-affichage, jamais masquer une facture) + `subscriptionDueLabel` (`utils/subscriptions.ts`).
  `Planning.tsx` : calendrier filtre les annuels par mois d'échéance (`lastDate.getMonth() === date.getMonth()` de la cellule) ; liste affiche « Le X <mois> · annuel ».
  Panel `financial-integrity` (display seul, `dailyTotal` non consommé par un flux $ ; seuil 2 resserré depuis 6 sur son finding trimestriel) + code-reviewer
  (IIFE extraite en helper testable, double-espace corrigé) APPROVE. 6 tests neufs (seuil, trimestriel, label + date invalide).
  ⚠️ Limite : `RecurringItem` n'a pas de `frequency` → une cadence IA non standard (hebdo/trimestriel) tombe en mensuel (sur-affiché) ; un vrai champ `frequency` serait le fix complet (non requis).
- [ ] **[DETTE-GODFILES]** ⏳ — decouper par barrel : `utils/tax.ts`, `syncOrchestrator.ts`, `Investments.tsx`, `Budget.tsx`, `FutureProjection.tsx`.
- [ ] **[DETTE-UI-PRIMITIVES]** ⏳ — `components/ui/Input|Select|Field` sur les tokens existants ; migrer 16 fichiers a `<input>` inline.

### Performance
- [ ] **[PERF-BOOT]** 🔧 — `App.tsx:401` : `hydrateAssets` `sleep(2500)` sequentiel par actif → pool concurrent borne.
- [x] **[PERF-WITHHOLDING]** ✅ **RÉSOLU (2026-06-26) — par SUPPRESSION, pas mémoïsation** : `computeMonthlyWithholding`
  était du code mort (sortie écrasée par décembre, cf. FISC-SRCDED-NOOP) → retirée. On ne mémoïse pas du code mort, on
  le supprime (gain perf MC réel : 2× `calculateFiscalReport`/mois × chemins MC en moins, pour un résultat jeté).
- [x] **[PERF-BUNDLE]** ✅ **FAIT (2026-07-07)** — 2 des 3 `INEFFECTIVE_DYNAMIC_IMPORT` convertis en import STATIQUE (le module
  était DÉJÀ en boot, le dynamic import ne créait aucun chunk) : `lockedProjectionStore` (`App.tsx`, boot via le store) + `backupAuto`
  (`syncOrchestrator.ts`, boot via `App.tsx initAutoBackup`). Le 3ᵉ (`claude.ts`) est GARDÉ dynamique **à dessein** : ses consommateurs
  sont lazy (TabRouter) → le SDK Anthropic vit dans les chunks lazy, PAS en boot ; le rendre statique le tirerait en boot = régression
  (vérifié : boot 99,8 kB gzip inchangé, warnings 3→1). Panel code-reviewer + silent-failure-hunter. Zéro régression (branches d'erreur préservées).
- [x] **[PERF-MISSINGDATA]** ✅ **FAIT (2026-07-07)** — `components/ui/MissingDataBanner.tsx` (`MissingDataChecklist`) : le full-store
  `useFinanceStore()` remplacé par un sélecteur `useShallow` sur le tableau DÉRIVÉ des champs manquants → re-render seulement quand
  l'ENSEMBLE change (plus à chaque écriture du calcul MC). Panel code-reviewer + silent-failure-hunter. 20 tests verts.

### Securite (deja connu / Marc)
- [x] **[DEP-UNDICI]** ✅ **RÉSOLU/PÉRIMÉ (constaté 2026-06-25)** — le `package-lock.json` est DÉJÀ à `undici 7.28.0` (= le fix des 2 alertes
  Dependabot, plage vulnérable `>= 7.0.0, < 7.28.0`), `node_modules/undici` = 7.28.0, `npm audit` = **0 vulnérabilité** (dev + prod). Les
  entrées `undici-types` du lock sont un AUTRE package (types TS, non vulnérable). Plus aucune action — bump déjà appliqué au lock.
  - **Risque réel FAIBLE** : dev-only (jamais bundlé en prod ; pas de ProxyAgent SOCKS5 ni de cache HTTP partagé dans notre usage) — mais à patcher pour vider les alertes.
  - **Action = merger la PR Dependabot existante** [#366](https://github.com/MoKarade/FinanceAI/pull/366) (`build(deps-dev): bump undici 7.25.0→7.28.0`) une fois la CI verte → ferme les 2 alertes. Pur lockfile, zéro code.
  - **Cadence** (cf `rules/toolkit/dependency-management.md`) : revue Dependabot hebdo, patchs HIGH ≤ 7 j. Décision Marc : merger #366 maintenant ou l'inclure dans la prochaine revue de deps.
- [x] **[BACKUP-PASSPHRASE]** ✅ LOW (2026-06-17) — `BackupPanel.tsx` : TOUS les seuils (export/import, label, boutons) alignés sur `MIN_PASSPHRASE_LENGTH` (12, importé de `syncOrchestrator` comme `PassphraseGate`). Fin de l'incohérence export-12/import-8 (l'import acceptait des passphrases de 8).

---

## 🔬 Panel agents — validation Phase 5 (2026-06-17, findings sur #322-324 + surfaces touchées)
> Issus du test empirique du nouvel environnement d'agents (PR #325). Vrais findings sur du code DÉJÀ mergé
> (l'audit money-critical précédent visait le $, pas la résilience SDK / l'UX / la vie privée / l'a11y).
> Aucun CRITIQUE/ÉLEVÉ. Sévérité en tête.

### IA / SDK Anthropic (ai-reviewer)
- [x] **[NBA-CACHE-STALE]** ✅ MEDIUM (2026-06-17, BATCH2b) — `snapshotSig()` (netWorth arrondi + revenu + dépenses + nb dettes/objectifs + couple) stockée avec le cache ; `readCache(sig)` invalide si la signature diffère → plus de conseils basés sur un profil périmé. Rétro-compat : ancien cache sans `sig` valide par TTL, réécrit au 1er fetch.
- [x] **[AI-VISION-TIMEOUT]** ✅ MEDIUM (2026-06-17, BATCH2a) — `analyzePayslip` + `analyzeBankStatement` bornés par `makeTimeoutSignal(undefined, 90_000)` + `{ signal }` passé à `messages.create` + `cleanup()` → abort au timeout, fin du spinner infini.
- [x] ~~**[AI-SNAPSHOT-DUP]** (fix d'origine)~~ ✅ RÉSIDUS RÉSOLUS AILLEURS (vérifié 2026-07-29) : une SEULE `interface FinancialSnapshot` subsiste (financialSnapshot.ts — la collision de nom a disparu) et `buildFinancialSnapshot` a désormais un consommateur RUNTIME (`buildFinancialOverview` → MCP + financialSignals, plus du code mort). ⚠️ **PRÉMISSE FAUSSE** (vérifié 2026-06-17, lecture du code) — les 2 `FinancialSnapshot` ne sont PAS identiques (`claude.ts` = `topDebts`/`activeGoals`/âges/soldes ; `financialSnapshot.ts` = `totalDebt`/`userCount`) et `buildFinancialSnapshot` n'est appelé par AUCUN runtime (def + tests + docs seulement). Le fix naïf (NextBestAction appelle `buildFinancialSnapshot`) serait FAUX (shapes incompatibles). **Résidu RÉEL restreint** : (a) collision de NOM entre 2 interfaces → en renommer une (`FinancialOverviewSnapshot` ?) ; (b) `buildFinancialSnapshot` = dead code → vérifier/supprimer (lié [CA-01]). NE PAS appliquer le fix d'origine.
- [x] **[AI-NBA-MODEL]** ✅ LOW (2026-06-17, BATCH2a) — `getNextBestActions` `temperature:0` (actions déterministes) + `impact_estimate` borné `.max(60)` Zod + disclaimer UI « Recommandations générées par IA — à valider ». Modèle gardé Haiku (suffisant + caché 1h). `safeParse` cosmétique NON fait (le `schema.parse` est dans un try/catch testé qui retourne null = correct ; le changer = risque pour 0 gain).

### Vie privée — Loi 25 / RGPD (security-privacy)
- [x] **[PRIV-NBA-CACHE]** ✅ MEDIUM (2026-06-17, BATCH2b) — `purgeCache()` appelé quand le profil est vidé / déconnecté (`!apiKey || !hasData`) → la PII dérivée (conseils IA) ne reste plus en clair dans localStorage après un reset/déconnexion (Loi 25). + invalidation par signature (cf NBA-CACHE-STALE) limite la fuite inter-profil. Chiffrement IDB du cache = optionnel (non fait : purge + sig suffisent pour le risque, conseils = dérivés bornés).
- [x] **[PRIV-AI-MINIMIZE]** ✅ LOW (2026-06-17, BATCH2a) — `deadline` tronquée à l'ANNÉE (`slice(0,4)`) avant envoi à Anthropic. ⚠️ Âge GARDÉ exact (décision) : matériellement utilisé pour les règles fiscales QC (RAP/CELIAPP, crédits 65+, conversion FERR à 71) → l'arrondir dégraderait le conseil. À rebander seulement si Marc préfère la confidentialité à la précision sur l'âge.

### Doc inline / a11y (code-reviewer, a11y-auditor)
- [x] **[DOC-L4-JSDOC]** ✅ LOW (2026-06-17) — `financialSnapshot.ts` JSDoc corrigé : dépenses NORMALISÉES (`computeMonthlyBudgetAggregates`, hors épargne) + NW via `computePresentNetWorth`. Fin de la fausse spec post-L4.
- [x] **[A11Y-TAXBRACKET]** ✅ MEDIUM (2026-06-17, Vague 2) — `TaxBracketViz.tsx` : (a) `role="img"` + `aria-label` (revenu+marginal) sur les barres, contenu visuel interne `aria-hidden` (lève l'ambiguïté inter-AT en plus du role), + `<ChartDataTable>` sr-only (ladder des paliers from→to + taux) par juridiction ; (b) `<h4>`→`<h3>` (la `Card` émet h2 → fin du saut) ; (c) 4× `ink-500`→`ink-400` — contraste VÉRIFIÉ empiriquement (`check-contrast` : ink-400 #8896a8 = 5,21-6,42 ✅ AA, ink-500 #6a7689 = 3,41-4,20 ❌ ; la numérotation ink va du CLAIR au foncé, donc ink-400 contraste PLUS sur fond sombre). Test `TaxBracketViz.a11y.test.tsx` (4 cas) + couvert par `pages.axe.test.tsx`. **Suivi LOW (optionnel)** : la table sr-only liste le ladder mais pas l'impôt $/palier (dispo via `<details>` natif accessible) ni un marqueur « tranche active » → enrichissement futur, PAS un échec WCAG (vérifié a11y-auditor).

---

## 🧱 BRIEF MARC 2026-06-10 — plan séquencé en 4 phases (PRIORITAIRE)
> Règles d'exécution (Marc) : **plan-first OBLIGATOIRE** sur les Phases 2, 3 et CHAQUE onglet de la
> Phase 4 (plan court : UI proposée, fichiers touchés, données nécessaires → validation Marc → code).
> **Ne JAMAIS passer à la phase suivante sans OK explicite de Marc.** Commits en français.
> `SESSION_HANDOVER.md` mis à jour après chaque phase.
> Questions à POSER (ne pas deviner) : **Q1** (avant PH4-FUT) — quoi annoter SUR la courbe
> (âge retraite ? épuisement d'un compte ? bascule de stratégie ?) · **Q2** (avant toute action
> Cloudflare) — confirmer que Cloudflare est bien devant Vercel.

### Phase 1 — BUGS (exécution immédiate, sans plan)
- [x] **[PH1-a]** 🔧 (livré) Erreur prod « Failed to fetch dynamically imported module
  DashboardEvolutionChart-[hash].js ». Cause code CONFIRMÉE : `Dashboard.tsx:5` était le SEUL
  `React.lazy` NU du codebase (tous les autres passent par `lazyWithRetry` P1.4 = retry 500 ms +
  1 reload gardé) → seul chunk sans filet sur hash périmé après deploy. Fix : (1) `lazyWithRetry`
  appliqué ; (2) filet GLOBAL `vite:preloadError` (`installPreloadErrorReload`, installé dans
  `index.tsx` avant le render) → intercepte racine ET dépendances préchargées des imports dynamiques.
  Revue (panel) → design durci : garde par **TIMESTAMP auto-expirant** (≤ 1 reload auto/min) au lieu
  du flag binaire + `clearChunkReloadFlag` au mount SUPPRIMÉ (il tournait avant la résolution des
  chunks du boot → un échec persistant bouclait reload→mount→clear→reload, en évinçant le journal
  d'erreurs) ; PAS de `preventDefault` (sinon les `import()` résolvent `undefined`) ; filtre
  `isChunkLoadError` (une erreur d'évaluation de module ne gaspille pas de reload) ; nom du chunk
  fautif persisté au log ; storage indispo → pas de reload. 7 tests. **Critères ✓** : plus aucun
  `React.lazy` nu ; boucle bornée structurellement ; ErrorBoundary en dernier recours. Audit cache
  fait : `vercel.json` DÉJÀ conforme (index.html `no-cache`, `/assets/*` `immutable`) ; `sw.js`
  DÉJÀ network-first `no-store` sur les navigations (2026-05-22) — rien à changer.
- [x] **[PH1-b]** ✅ **CADUC — Cloudflare retiré 2026-06-16** (Access + proxy DNS dé-proxifié). Auth = gate Google in-app. Fermé.
  CF d'un index.html périmé (CF ne cache pas le HTML par défaut et respecte le `no-cache` origine —
  à vérifier : Page Rule « Cache Everything » dans le dashboard CF). NE PAS retirer Cloudflare avant
  P0-AUTH (gate Google in-app) : c'est l'authentification de l'app. Étapes de retrait + pertes
  documentées dans `A_FAIRE_MOI`. **Décision Marc requise (Q2).**

### Phase 2 — CLÉ DE VOÛTE ⏳ (plan-first → OK Marc → code) — dépend de : rien (débloque PH4)
- [x] **[PH2-a]** ✅ mergé #240 — `runMC` persisté dans le store (le toggle MC ne se réinitialise
  plus inter-onglets ni au reload), worker projection NON terminé au démontage (singleton chaud
  réutilisé), repli sur `lastProjection` au remount → la courbe stockée s'affiche INSTANTANÉMENT
  (pas d'écran vide ni de reset des contrôles). Nuance assumée : le recalcul déterministe (~150 ms)
  re-tourne au retour mais est idempotent ET masqué par le repli ; le calcul MC lourd, lui, n'est PAS
  relancé (cf PH2-b). Hoist complet du moteur hors composant jugé non nécessaire (objectif UX atteint).
- [x] **[PH2-b]** ✅ mergé #240 — dédup des requêtes MC IDENTIQUES en vol (`runProjectionAsync`,
  Map `_inflight`, clé effective = signature params + `runMC`/`idx`/`types`) : quitter Futur pendant
  un MC puis revenir RE-RACCROCHE à la promesse déjà en vol (un seul calcul worker, pas de restart).
  Worker singleton conservé (plus de `terminate()` au démontage). Revu : code-reviewer (rien de
  bloquant), silent-failure (clean), projection-validator (1895 tests verts). `performance-optimizer`
  NON lancé — diff = orchestration pure (Map dédup + booléen store + repli), zéro calcul ajouté, deux
  effets perf POSITIFS (worker chaud + 0 calcul MC dupliqué) → l'agent n'aurait rien à signaler.
- [x] **[PH2-c]** ✅ mergé #241 — moteur de projection hoisté AU NIVEAU APP (`ProjectionEngine`
  headless + lazy, monté dans App) : calcule + publie `lastProjection`, source TOUJOURS peuplée quel
  que soit l'onglet (avant, seul Futur monté calculait → Dashboard/Retraite à `ProjectionRequired`).
  `hooks/useSimulationParams` partagé moteur↔Futur (params identiques, zéro divergence) ; Futur devient
  pur CONSOMMATEUR ; `projectionStatus` au store (transitoire, exclu persist+sélecteur App = anti-cascade).
  Garde no-fake-data (prérequis Futur). Revu par le panel complet (rien de bloquant, invariants OK,
  1900 tests). Suivis non bloquants → PH2-c-1..4 ci-dessous.
- [x] **[PH2-d]** ✅ mergé #242 — verrou de courbe : bouton dans Futur → snapshot du `ProjectionResult`
  COMPLET persisté CHIFFRÉ en IndexedDB DÉDIÉE (`services/lockedProjectionStore`, clé device secureKeyStore),
  restauré au boot jusqu'au déverrouillage. **Double courbe** (verrouillée figée + aperçu live) sur Futur
  ET Retraite. Côté Zustand : seul `isProjectionLocked` (booléen ADDITIF) persisté → **ZÉRO bump v7**, le
  blob vit en IDB (aucun risque de corruption schema). Panel complet (code-reviewer/silent-failure/security/
  a11y) : rien de bloquant. Suivis non bloquants → PH2-d-1..4 ci-dessous. **→ Phase 2 (clé de voûte) TERMINÉE.**

#### Suivis PH2-c (découverts à la revue panel PR #241 — non bloquants, le hoist est livré)
- [x] **[PH2-c-1]** ✅ — fetch Finnhub de `usePastPortfolioHistory` DÉDUPLIQUÉ AU NIVEAU MODULE
  (cache + signatures de lot + `useSyncExternalStore` partagés entre instances) : 1 seul fetch par lot
  quel que soit le nombre d'instances, résultat poussé à toutes (jonction passé↔futur cohérente), et un
  fetch en vol SURVIT au démontage d'une instance. Tests : 2 instances → 1 appel ; montage tardif →
  servi du cache (tests/hooks/usePastPortfolioHistory.dedup.test.tsx).
- [x] **[PH2-c-2]** ✅ — `ProjectionStaleBanner` (composant partagé, role=status) rendu dans Dashboard/
  Investissement/Budget/Retraite : bandeau discret quand `projectionStatus === 'error'` (« les chiffres
  affichés datent du dernier calcul réussi »). Câblé sur `projectionStatus === 'error'` dans Dashboard/Investissement/
  Budget/Retraite → bandeau discret « projection possiblement périmée (dernier recalcul échoué) » au-
  dessus de la courbe conservée. Aujourd'hui l'erreur n'est visible QUE sur Futur (pré-existant, mais
  PH2-c fournit enfin le véhicule `projectionStatus` pour corriger).
- [x] **[PH2-c-3]** ✅ (perf) Router le calcul DÉTERMINISTE dans le worker hors-Futur : en mode
  déterministe (runMC=false), le moteur app-level paie ~150 ms main-thread à chaque changement de
  params quel que soit l'onglet (atténué par debounce 300 ms ; défaut = MC déjà off-thread).
- [x] **[PH2-c-4]** ✅ — tests/hooks/useSimulationParams.parity.test.tsx : renderHook du hook RÉEL
  comparé à `buildSimulationParamsFromState` (même startYear/startMonth), pour CHAQUE persona (7/7).

#### Suivis PH2-d (découverts à la revue panel PR #242 — non bloquants, le verrou est livré)
- [x] **[PH2-d-1]** ✅ (Marc a tranché = AVERTIR) — `loadLockedProjection` retourne désormais un statut
  DISCRIMINÉ (`ok` / `empty` / `unreadable`) ; au boot, `unreadable` (entrée présente mais clé device
  disparue / blob altéré) → `showToast` « Ta courbe verrouillée n'a pas pu être restaurée… » (jumeau de
  `decrypt_failed`). `empty` (rien stocké OU erreur d'accès IDB transitoire) reste silencieux. Test verrou OK.
- [x] **[PH2-d-2]** ✅ — `ExpertTooltip` affiche le bloc « 🔒 Verrouillée » au survol (valeur figée +
  écart vs live, `privacy-blur`), conditionnel à `displayData.lockedNetWorth` (présent sous verrou).
- [x] **[PH2-d-3]** ✅ — aire CELIAPP ajoutée au stack Retraite + métrique verrouillée recomplétée (CELIAPP inclus) ; reste l'alternative texte SR (hors PH2-d, global). Ex-périmètre (pré-existant) Graphe Retraite : le stack d'aires VISIBLE omet CELIAPP (4 aires)
  alors que `TotalCapital` l'inclut (5) — d'où la métrique verrouillée alignée sur le stack (sans CELIAPP)
  en attendant. Ajouter l'aire CELIAPP au stack (+ légende native `iconType` reflétant le tireté) ;
  + à terme, alternative TEXTE/table SR aux graphes (manque global, hors PH2-d).
- [x] **[PH2-d-4]** ✅ — en-tête secureKeyStore mis à jour (3 payloads : clés API + backups + courbe verrouillée). (doc) En-tête `secureKeyStore.ts` : la clé de device chiffre désormais 3 payloads
  (clés API + backups + courbe verrouillée) — mettre à jour le commentaire.

#### Suivi PV-11 (validation projection-validator — réserve documentée)
- [ ] **[PV-11e]** 🧪 (réserve MOYEN du validator) — `withdrawalREER` du goalMutator alimente AUSSI
  `stepReerByUser` (attribution fiscale per-conjoint, taxDecember Phase 2 ACTIVE) : dans la fenêtre
  couple INÉGAL + goal REER + cotisation REER le MÊME mois, le registre per-conjoint bouge légèrement
  (micro-réalignement ASSUMÉ — plus correct : aligne le décrément sur la clé fiscale déjà utilisée).
  Baselines inchangées (1927/1927). À pinner par un test couple-inégal+goal-REER+cotisation simultanée.
  NOTE : goalShortfallTotal agrège des $ NOMINAUX d'années différentes (sémantique à documenter à l'UI).

### Phase 3 — MODÈLE DE DONNÉES + ONGLET PROFIL ⏳ (plan-first) — dépend de : OK Marc post-PH2
- [x] **[PH3-a]** ✅ (PR Phase 3) — onglet **Profil** unifié (`components/Profile.tsx` + Tab.PROFILE) qui
  COMPOSE tous les éditeurs de setup (UsersCard, UserConfigFields salary/fiscal/detailed/children,
  RepartitionField, RetirementSettingsCard, RetirementIncomeCard). Retirés de Config/Impôts/Budget/
  Enfant/Retraite → pointeur `ProfileFieldsMoved`. Mêmes clés store → zéro perte. **Critères ✓.**
- [x] **[PH3-b]** ✅ (PR Phase 3) — `SetupHub` rendu en tête de Profil : **% de complétion GLOBAL**
  (infos met/total + barre de progression) + par onglet « X/N » + quelle info manque + « Ouvrir »
  (navigateWithFocus). **Critères ✓.**
- [x] **[PH3-c]** ✅ (PR PH3-c) — 19 champs morts PURGÉS (contre-audit repo COMPLET : aucun consommateur ; types compagnons orphelins retirés ; UI detailed → « Carrière & rémunération variable ») ; 5 gardés commentés avec consommateur prouvé ; ZÉRO migration persist (résiduels inertes documentés). Découvertes → PH3-c-bis. Audit initial (2026-06-11) : NON consommés
  par `services/` (moteur) → gender, province, citizenship, maritalStatus, employmentType, yearsOfExperience,
  pensionPlan, promotionLikelihood5Y, healthRating, isSmoker, bmiCategory, chronicConditions, activityLevel,
  parentAgeAtDeath, bonusVolatilityPct, stockOptionsValue, commissionPctOfGross, cryptoStakingAnnual,
  payFrequency. CONSOMMÉS (garder) → industry, bonusPctOfGross, rsuVestingPerYear, rsuYearsRemaining,
  sideIncomeAnnual. ⚠️ **RESTE (soigné, séparé)** : vérifier consommateurs HORS `services/` (UI + surtout
  `province`/`maritalStatus` potentiellement fiscaux) + migration persist propre. Money/tax-sensible → pas à la va-vite.
- [x] **[PH3-d]** ✅ (PR Phase 3) — Retraite ne contient PLUS d'éditeur de profil/vie (« Parametres de Vie »
  + « Revenus & besoins » extraits → `RetirementIncomeCard` dans Profil) ; lecteurs/graphes conservés ;
  `lifeExpectancy` reste lu du store. **Critères ✓.**
- [x] **[A11Y-LBL]** ✅ — 18 associations posées : htmlFor/id sur RetirementIncomeCard (8),
  RetirementSettingsCard (5), UserConfigFields salary (2×idx), UsersCard nom/âge (2×idx) ;
  aria-label sur le select RepartitionField + l'input « Nom du profil ». Reste la dette
  hors-Profil (8/30 fichiers htmlFor) — opportuniste.
- [x] **[DEAD-FLT-2]** ✅ PÉRIMÉ/RÉSOLU AILLEURS (vérifié 2026-07-29, leçon PM-STALE-BACKLOG) — le stub `fetchPortfolioHistory` a été RETIRÉ par [PORTFOLIO-HISTORY] 2026-07-22 (grep : seuls des commentaires historiques le mentionnent). Ex : purger toute la CHAÎNE du stub `fetchPortfolioHistory`
  (`services/finance.ts` return []) : consumers restants = StockComparisonModal (+ son
  `.catch(console.warn)` à router logError), `hooks/usePortfolioHistory`, `fetchAssetHistory`.
- [x] **[DEAD-FLT]** ✅ — bloc `fetchLiveTotals` purgé (45 lignes mortes : l'async ne tournait
  JAMAIS, stub `[]`) → `liveCSVBalances` est un simple useMemo des props (mêmes valeurs réelles
  qu'avant). Imports/destructures morts nettoyés (useState/useEffect/fetchPortfolioHistory/logError/
  RegisteredAccountType/assets).
- [x] **[SF-WARN]** ✅ — fetchLiveTotals (Retirement) + restore profils (UsersCard) routés vers logError (source network/storage). (revue #244, pré-existant) — `Retirement.tsx` fetchLiveTotals + `UsersCard.tsx`
  restore : `console.warn` sur de vrais échecs I/O → router vers `logError` (convention repo).
- [x] **[CPL-1]** ✅ (signalé Marc 2026-06-11) — switch individuel↔couple GATÉ : « + Ajouter conjoint »
  ouvre désormais un FORMULAIRE de définition (nom + âge REQUIS, salaire optionnel, bouton disabled sinon)
  + avertissement explicite « passer en couple change les calculs » — plus de placeholder silencieux
  (age 30/salaires 0). **Diagnostic calculs** (tests/services/coupleParity.test.ts) : en mode RÉEL, un
  conjoint vide = ZÉRO revenu fantôme (computeIncomeBaseline neutre — le ×1.35 ne s'applique qu'à un net
  non nul) ; la différence de courbes venait des RENTES D'ÉTAT/fiscalité du placeholder (PSV/SRG à ses
  65 ans, imposition 2 têtes) — effets LÉGITIMES pour un vrai conjoint même sans revenu → PAS de
  neutralisation moteur (elle fausserait les vrais couples), le gate UX est la correction. Le split
  théorique 55/45 (useTheoretical) documenté au test. ⚠️ Reste à VALIDER par Marc en visuel : créer un
  conjoint réel sans revenu DOIT changer les courbes (rentes d'État du conjoint) — c'est voulu.

#### Suivis PH3-c (découvertes du contre-audit)
- [~] **[PH3-c-bis]** PARTIEL — ✅ **`User.industry` PURGÉ** (PR R5/#377, 2026-06-19, décision Marc) : `type Industry` +
  champ `User.industry` + `<select>` `UserConfigFields` retirés ; zéro consommateur services/, zéro migration (politique PH3-c :
  résiduel persisté ignoré) ; typecheck clean, 0 ref résiduelle. **RESTE** : `ProjectionConfig.futureProvince/MoveYear` (W2.7,
  orphelins — auditer) · `rsuYearsRemaining` (consommé moteur mais SANS éditeur UI, défaut 99 ans — ajouter l'éditeur ou retirer du moteur).

#### Phase 4 — onglet FUTUR « leviers-d'abord » (en cours)
- [x] **[PH4-FUT-A]** ✅ (PR-A) — calcul-sur-clic + retrait des « plans ». La courbe ET le bandeau
  KPI ne s'affichent QUE sur clic « Calculer » (signe `params` ENTIER → aucune entrée ne met la courbe
  à jour en douce ; état « périmé » si une entrée change après calcul). Mode « Test rapide » (5
  stratégies-types / RobustnessPanel) RETIRÉ → l'Optimisation montre directement les leviers (recherche
  Monte-Carlo). Chaîne morte robustesse purgée (strategyRobustness.ts, runRobustnessRankingAsync,
  branche worker 'robustness'). Panel : code-reviewer (MAJEUR signature corrigé), silent-failure (RAS),
  a11y (propre, aria-busy ajouté).
- [x] **[PH4-FUT-B-1]** ✅ #251 — levier **Profil de rendement** (conservateur/équilibré/agressif → presets
  returnRates ; 'balanced' = inchangé, non-régression). Helper partagé recherche↔courbe. 20 tests, monotonie.
- [x] **[PH4-FUT-B-2]** ✅ (PR-B2) — levier **Fractionnement pension 65+** ON/OFF (gate la Phase 3 de
  taxDecember ; défaut actif = historique ; false = conservateur/légal). Panel fiscal-accuracy RAS, baselines
  intactes. Tests : unitaire (actif 20k < inactif 32,5k) + cohérence configToEngine + non-régression.
- [x] **[PH4-FUT-B-3]** ✅ (PR-B3) — levier **Taux d'épargne** (multiplicateur 0.9/1/1.2). Modèle :
  multiplie l'épargne RÉELLE positive (net−dépenses), réduit les dépenses d'autant (conservation revenu
  net, surplus investi) ; mode réel + épargne>0 seulement (déficit = inerte) ; défaut 1 = non-régression.
  Tests : non-régression bit-près + monotonie + déficit inerte + cohérence configToEngine. Baselines intactes.
- [x] **[PH4-FUT-B-4]** ✅ (PR-B4) — levier **Downsizing immo retraite** (choix Marc : vendre + racheter
  plus petit, à l'âge de retraite). Au mois de retraite, la résidence principale libère DOWNSIZE_RELEASE_PCT
  (40 %) de l'équité en placements, garde 60 % dans un bien payé cash (hypothèque 0) ; EXEMPTION gain
  résidence principale (ARC) ; gardes underwater/locataire/une-seule-fois. Tests unitaires (effet/non-rég/
  underwater/locataire) + baselines intactes. → **PH4-FUT-B COMPLET (4/4 leviers livrés #251-#254).**

#### Suivis fiscaux (découverts au panel PH4-FUT-B-4)
- [x] **[RE-GAIN]** ✅ mergé #260 (vente) + #261 (succession) — le gain en capital immobilier d'un **locatif**
  (≠ résidence principale) n'est PAS modélisé à la disposition : la vente générique
  (`monthlyEvents.ts` `name.includes('vente')`) libère le net SANS réaliser de gain imposable et SANS
  tester `isPrimaryResidence` ; à la succession (`estateCalculation.ts`) `realEstateEquity` entre sans
  impôt latent immobilier. Préexistant (hors PH4-FUT-B-4, qui borne correctement le downsizing à la RP).
  Fix : taxer le gain locatif (inclusion 50 %) à la vente/succession ; documenté FISCAL_REFERENCE §8.

- [x] **[PH4-FUT-TEST]** ✅ — test RTL du chemin `applyAndReveal` (Futur leviers-d'abord) :
  clic « Appliquer » → courbe révélée (strip KPI + « Ré-optimiser »), amorçage disparu, `isStale` reste
  faux (preuve du batching des 2 setAppState) + le geste coule au store (emergencyFundMonths/profil/rentes) ;
  2e test : « Ré-optimiser » re-cache la courbe. `tests/components/FutureProjection.applyReveal.test.tsx`.

### Phase 4 — REFONTES ⏳ (UN plan SÉPARÉ par onglet → OK Marc par onglet) — dépend de : PH2 (+PH3 pour FUT/RET)
- [x] **[PH4-FUT]** ✅ Refonte **Futur** « leviers-d'abord » LIVRÉE (#250 calcul-sur-clic+retrait plans ;
  #251-254 4 leviers ; #268 composeur EN AMONT ; #269 « Hypothèses »+ordre retrait AUTO ; #270 annotations
  courbe retraite/rentes/épuisement). Conseils déclinés mois→année = déjà ActionPlanDrilldown. Robustesse =
  l'optimiseur MC. RESTE optionnel : remonter un résumé « prochaines actions » sur la vue Projection (cadrage Marc).
  --- (ancien détail) leviers OBLIGATOIRES avant calcul (l'actuel contenu
  d'Optimisation remonte en amont) ; la courbe affichée = toujours la MEILLEURE selon les leviers ;
  après calcul, choix parmi les courbes retenues puis VERROUILLAGE (PH2-d) ; stratégie de retrait
  AUTO (retirée des paramètres) ; spécificités de la stratégie optimale en langage « qu'un enfant
  comprenne » + ANNOTÉES sur la courbe (**Q1 à poser avant de coder**) ; onglet Paramètres revu
  (moins de texte, previews d'effet, RENOMMÉ) ; « Robustesse » = levier du calcul de départ (retirée
  d'Optimisation) ; stress tests déplacés dans Paramètres ; Optimisation visible seulement à la 1re
  ouverture puis dépliable ; BEAUCOUP plus de leviers, calcul accéléré mais représentatif ; conseils
  du plan d'action REMONTÉS (pas enterrés en bas), clarifiés, déclinés mois/trimestre/semestre/année.
- [x] **[PH4-TX]** ✅ #257 — tri par date/marchand/montant/catégorie (en-têtes cliquables, aria-sort).
  🧭 Reste = refonte visuelle profonde (design → cadrage Marc).
- [ ] **[PH4-BUD]** 🧭 Refonte **Budget** complète — DESIGN, besoin du cadrage Marc (irritants concrets).
  Budget déjà sain techniquement (source unique lastProjection). Routé → `A_FAIRE_MOI`.
- [x] **[PH4-INV]** ✅ Refonte **Investissement** LIVRÉE — #255 autocomplétion à la frappe (Finnhub
  symbol search, debounce + anti-race) ; #256 allocation sur données RÉELLES (`assets`, plus le CSV
  déprécié) + dividendes réels (priorité `Asset.dividendYield/dividendFreq`) ; #259 moins de pages
  (4 → 3 sous-onglets, rééquilibrage fusionné dans l'allocation). 🧭 Reste = polish design (cadrage Marc).
- [x] **[PH4-RET]** ✅ #258 — courbes = source unique (acquis PH2-c) ; invite ProjectionRequired (CSV
  déprécié retiré). 🧭 Reste = lisibilité (design → cadrage Marc).

## 🚨 P0 — Bloquant pour un vrai produit multi-utilisateurs
> ⚠️ **Décision 2026-07-06 (Marc)** : app SOLO — multi-user REMISÉ indéfiniment (focus qualité AAA). Items P0 relus
> sous cet angle : **sync Drive + gate Google = multi-APPAREILS de Marc** (pas multi-user public). `docs/adr/`
> ADR-002, `docs/VISION.md` cap produit.

- [~] **[P0-PROXY]** 🔧 Proxy backend pour la clé Anthropic — **Phases 1-2 LIVRÉES dark-launch** (2026-07-06) :
  relais BYOK (clé chiffrée, Edge Vercel, anti-abus). **Code livré** : `api/_lib/relay.ts` (proxy cœur +
  allowlist modèles/clamp/no-store/annulation chaînée/zéro log), `api/claude/[...path].ts` (route Edge),
  middleware Vite (dev), makeClient switch kind text/vision, 13 tests. **RESTE** : (a) Marc pose 2 env Vercel
  (PROXY_ACCESS_TOKEN serveur + VITE_PROXY_ACCESS_TOKEN build) → redéploie ; (b) smoke test via flag
  VITE_CLAUDE_TRANSPORT=proxy basculable (défaut direct pour Vision, switch relais phase 4) ; (c) spike Vision
  (~13 Mo/90 s vs limites Edge ~10 Mo). *Cf* `A_FAIRE_MOI` O4.
- [ ] **[P0-IDB]** 🔧 Migrer la persistance `localStorage` → IndexedDB (quota ~5 Mo + parsing
  synchrone bloquant au boot). ⚠️ Migration du schéma persist v7 — vigilance corruption.
- [ ] **[P0-SYNC]** 👤 Prouver la sync Drive en réel : créer `VITE_GOOGLE_CLIENT_ID`, tester en
  fenêtre privée (cf `A_FAIRE_MOI` O3 + tests manuels ci-dessous).
- [x] **[P0-AUTH]** ✅ (2026-06-16) — **Cloudflare RETIRÉ de FinanceAI**, gate Google in-app actif. Marc a :
  créé l'OAuth client + posé `VITE_GOOGLE_CLIENT_ID`+`VITE_GOOGLE_GATE=1` (Vercel) + validé (login + données +
  anti-lockout + pas de re-login) + supprimé l'app Cloudflare Access + dé-proxifié apex/www (DNS only → Vercel).
  Piège rencontré : le client OAuth était PARTAGÉ avec CF Access (flux serveur, redirect_uri `cdn-cgi/access/callback`)
  → l'avoir retiré cassait le login CF (`redirect_uri_mismatch`) ; restauré le temps de valider, puis CF retiré.
- [x] **[CF-CODE]** ✅ (2026-06-16) — retrait code-side : CSP nettoyée (`cloudflareinsights` retiré de
  `vercel.json` + `index.html`) ; commentaires périmés MAJ (`secureKeyStore.ts` — la sécu ne repose plus sur CF
  Access, le gate est SOFT + clé par-appareil ; `App.tsx`, `lazyWithRetry.tsx`) ; docs MAJ (CLAUDE.md, A_FAIRE_MOI O1).
  **RESTE optionnel (durcissement gate, séparé)** : bouton « se déconnecter », sélecteur de compte
  `prompt:'select_account'` (aide [PROFIL-SWITCH]), indicateur de sync, client OAuth DÉDIÉ au gate (découpler de CF).

## 🆕 Signalements Marc (2026-06-16)
- [ ] **[PROFIL-SWITCH]** 🔧 HIGH (data-sensible) — le switch entre comptes/profils est compliqué et
  instable : (a) **fuite** — garde en mémoire des infos des profils de TEST après changement ;
  (b) choix de profil **pas assez explicite** (on ne voit pas clairement lequel/quel type est actif) ;
  (c) calculs **pas assez précis/sûrs** selon le profil actif ; (d) **mauvaise sauvegarde** des données.
  Plan : **reset COMPLET à chaque switch** (auditer `personaResetBase`/`personaReset` — visiblement laisse
  passer des données test ; cf #217 mode test persisté) ; **sélecteur explicite** (nom + type réel/test +
  bannière persistante du profil actif + confirmation au changement) ; **persistance isolée par profil**
  (clé storage par profil, pas d'écrasement croisé, vérif d'intégrité au chargement) ; garde-fou « quel
  profil/hypothèses alimentent ces chiffres ». ⚠️ Touche la persistance (schéma v7) → vigilance corruption,
  lié à [P0-IDB]. Plan-first + panel avant de coder (data-critical). *Cadrage à confirmer/préciser par Marc.*
- [~] **[RECH-ACTION-UX]** ◑ MEDIUM PARTIEL (PR #355, 2026-06-18) — (1) ✅ dropdown d'autocomplétion **agrandi**
  (`max-h-64`→`80`) ; (2) **cause la plus évidente corrigée + TESTÉE** : Escape fermait toute la modale (le `Modal`
  écoute Escape sur `document`) → désormais Escape ferme le DROPDOWN sans fermer la fenêtre (`stopPropagation` +
  `stopImmediatePropagation`, test composant prouve `onClose` non appelé). ⚠️ Le symptôme EXACT « sélectionner le
  prix fait quitter » n'a pas pu être reproduit en navigateur (le dropdown exige une clé Finnhub absente en dev) →
  **confirmation visuelle Marc requise** (routé `A_FAIRE_MOI`). Le fallback FINNHUB-MISMATCH ci-dessous améliore
  aussi le ressenti « sélection → coincé ».
- [x] **[FINNHUB-MISMATCH]** ✅ MEDIUM (PR #355, 2026-06-18) — l'autocomplétion Finnhub `/search` proposait des
  symboles que le `/quote` du forfait gratuit ne sait pas coter (TSX/étrangers) → erreur sèche « introuvable ».
  Fix : `selectSuggestion` bascule en **saisie manuelle pré-remplie** (symbole+nom) + notice informatif quand
  le symbole n'a pas de cours (`'no-quote'`). Panel : distinction `'no-quote'` (fallback) vs `'error'` réseau
  (erreur VISIBLE, pas de masquage silencieux — silent-failure-hunter HIGH intégré). 3 tests composant.

## 🧭 Décisions moteur (à trancher avec Marc — money-critical)
- [ ] **[ITEM-2A]** 🧭→🔧 **APPROCHE VALIDÉE PAR MARC (2026-06-16)** : entreprendre le refactor « impôt
  NOMINAL » (revenu nominal + paliers/BPA/crédits indexés par `simInflation`, supprime l'aller-retour
  déflate→impôt→réinflate lossy). **Phase 0 FAITE** (2026-06-16) : test de caractérisation
  `tests/services/tax.item2a.characterization.test.ts` qui PIN le comportement actuel (filet golden — ex.
  impôt 100 k$ : 25 510 $ en 2026 → 20 355 $ en 2046, dérive ~5,2 k$ du 1,02 en dur), zéro changement moteur.
  **RESTE** : **Phase 1** — paramétrer `getIndexedBracketsForYear(year, rate)` + threader le `rate` dans
  `calculateFiscalReport` ET ses sous-calculs indexés (BPA, `calculateAgeAndPensionCredits`, FSS, RAMQ),
  défaut 0,02 (additif, zéro régression) ; **Phase 2** — basculer les ~10 sites d'appel sur revenu nominal +
  `simInflation`, retirer les déflations (`monthlyCalcs.ts:92-110`, latentTax, retirementIncome, taxDecember…),
  **re-baser les golden Phase 0 + les baselines SCIEMMENT** (prouver le rapprochement vs ARC), panel
  fiscal-accuracy + projection-validator. ⚠️ Money-critical, plan-first à chaque phase, gate + panel.
- [x] **[ITEM-2C]** ✅ **PHASES 1+2 FAITES (2026-06-25 : FERR per-conjoint + PSV/RRQ per-conjoint)**. RESTES : reset REER 71 + per-conjoint PSV/RRQ AU DÉCÈS = **DÉCISION Marc 2026-07-06 : LAISSER EN LIMITE ASSUMÉE** (doc `FISCAL_REFERENCE §9` coté survivorMode, impact $ minimal). Clos.
- [x] **[B-AUDIT-5]** ✅ **DÉJÀ CORRIGÉ** (vérifié 2026-06-19, Marc avait dit « corriger »). Le SRG est DÉJÀ exclu
  de l'assiette du clawback PSV : `projection.ts:918` passe `incomeRetirement − incomeRetirementGis` à
  `computeOasClawback`, l.921 `v − gisShare` par conjoint, l.929 le cap `pensionPSV − incomeRetirementGis`
  (corrigé implicitement par FA-2/FA-3/FA-8). Le `incomeRetirement` AVEC SRG ne sert qu'au reset de janvier
  (l.945), pas au clawback. Item périmé → PAS de fake fix (un faux fix d'impôt = pire que le finding).
- [x] **[H1]** ❌ DÉCISION Marc 2026-06-19 : **PAS de chiffrement par passphrase** (risque recovery > valeur ;
  cascade IndexedDB chiffré suffit). Clos, décliné.

## 💰 Audit fiscal + moteur 2026-06-09 (3 agents : fiscal-accuracy, projection-validator, code-analyzer)
> 0 BLOCKER. Socle exact (barèmes/BPA/RRQ/RAMQ/FSS/FERR/retenues conformes au doc). Détails dans les
> rapports d'agents (session 2026-06-09). Chaque correctif fiscal = code + FISCAL_REFERENCE même PR.
- [x] **[FA-1]** (livré #221) Assiette du crédit pension (féd 31400 + QC 361) inclut RRQ/PSV à tort
  (`taxDecember.ts:362-364`) — ARC/RQ les EXCLUENT. Restreindre à DB + FERR 72+. **Non conservateur**
  (~250-680 $/an/personne 65+). Le plus systémique des findings.
- [x] **[FA-2]** (livré #222) Clawback PSV : revenu FAMILIAL comparé au seuil INDIVIDUEL (`taxDecember.ts:39-44`)
  → clawback fictif jusqu'à ~14 k$/an pour un couple 95-190 k$ (conservateur mais massif).
  Calculer par conjoint (les décompositions per-user existent) ou documenter en §9.
- [x] **[FA-3]** (livré #222) SRG : (a) imposé à tort (non imposable) ; (b) clawback ignore retraits REER/gains
  → SRG fictif jusqu'à ~13 k$/an en scénario FIRE bas revenu (`retirementIncome.ts:206-220`). **Non
  conservateur** (b).
- [x] **[FA-4]** (livré #221) CELI dupliqué : `taxJanuary.ts:89-92` recalcule 7000×inflation au lieu de lire
  `CELI_ANNUAL_LIMITS` (2027 : 7 000 vs 7 500 au doc). Brancher sur la source unique.
- [x] **[FA-5]** (livré #221) NPV rentes succession : `governmentPension × 0,65 × activeUsersCount`
  (`estateCalculation.ts:144-145`) alors que le moteur le traite déjà comme FAMILIAL → ×N en double,
  `estateNetWorth` couple gonflé de dizaines de k$.
- [x] **[FA-6]** ✅ **FAIT (2026-06-23)** — Dons charitables : crédit par PALIERS (`utils/donationCredit.ts`, féd 15/29 +
  QC 20/24 → 35 % / 53 %, FISCAL_REFERENCE §10 daté+sourcé) remplace le `33 %` plat ; volet titres `−0,15·don` (inventé) SUPPRIMÉ.
  ⚠️ **Découverte CRITIQUE en cadrant** : le crédit (et la taxe locative/CCPC) allait dans `taxCurrentYear.revenu`, **ÉCRASÉ en
  décembre année ACTIVE** (`taxDecember:406` `=` vs `+=` retraité) → un salarié actif donateur n'avait AUCUN bénéfice fiscal, et les
  loyers/dividendes CCPC d'un actif n'étaient PAS imposés. Fix = router les 3 ajustements W5 vers `divers` (jamais écrasé) via
  `addTaxDivers`. Panel financial-integrity + projection-validator = CORRECT, 0 régression, conservation 35/35, discriminant
  `git stash` prouvé. Découvertes routées ci-dessous (FA-6-CREDIT-CAP, W5-TAX-PROXY).
- [x] **[FA-6-CREDIT-CAP]** ✅ **FAIT (2026-06-23, même PR que FA-6)** — le crédit-don (non remboursable) est désormais PLAFONNÉ
  à l'impôt sur le revenu + gains de l'année. Champ séparé `taxCurrentYear.donCredit` (accumulé en janvier) → `taxDecember`
  le plafonne à `grossIncomeTax + max(0, gains)` puis l'applique à `divers` (RAMQ/FSS hors assiette). Un crédit non remboursable
  ne génère plus de remboursement net (donateur bas-revenu : crédit borné à son impôt) ; l'excédent est perdu (pas de report
  modélisé). Tests unitaires (revenu élevé = complet, revenu bas = plafonné, revenu nul = 0) + discriminant `git stash` (sans cap,
  les tests bas/nul échouent). Panel financial-integrity + projection-validator + silent-failure-hunter.
- [x] **[W5-TAX-PROXY]** ✅ **DÉCISION Marc 2026-07-06** : **(a) Garder les proxies plats** (0,45 locatif / 0,36 CCPC) documentés en tant qu'estimation de taux marginal QC. Ajouter une mention UI + source de taux marginal QC dans `FISCAL_REFERENCE.md` (rapide, honnête). Option (b) = modéliser l'impôt incrémental réel (exact, mais plan-first dédié, impact moteur). Choix : (a). Clos.
- [x] **[FA-7]** 🔧 (livré) §8 immobilier transcrit dans FISCAL_REFERENCE : B-20 (plancher 5,25 %,
  +2 pts, GDS 39/TDS 44), mise de fonds min + amortissements SCHL (30 ans FTB/neuve août 2024),
  primes SCHL par LTV (0,60→4,00 %), mutations QC 2025 (paliers + note Montréal non modélisé,
  à réindexer 2026), TPS/TVQ neuf (36 %/6 300 $ · 50 %/9 975 $, dégressifs), Smith/HELOC LTV 65 %
  + margin call. Découverte routée vers FA-8 : taux HELOC 5 %/an EN DUR (`realEstateMonth.ts:336`)
  — hypothèse de modèle à paramétrer.
- [x] **[FA-8]** ✅ mergé (PR FA-8) — lot mineurs fiscaux LIVRÉ (10 sous-items, 2 vrais bugs : cap clawback PSV versée + assiette dividendes ; panel fiscal-accuracy AUCUN BLOQUANT ; 11 tests dédiés, preuve par mutation). Restes requalifiés ci-dessous. Ex-périmètre. **LIVRÉ 2026-06-11 (10 sous-items, en attente de merge)** :
  taux clawback 15 % nommé+sourcé (`OAS_CLAWBACK_RATE`, utils/tax.ts) · **cap clawback = PSV
  réellement VERSÉE** (breakdown décembre hors SRG : facteur de report, bonus 75+, prorata
  résidence, survivant — couvre AUSSI « cap ignore prorata/`psvEstimateMonthly`/bonus 75+ » et le
  clawback fantôme avant `psvStartAge` ; `psvBasePension` = repli legacy) · prorata RRQ 39 ans /
  PSV 10-40 ans documentés (doc §6 + commentaires sourcés retirementIncome) · split 65/35 →
  constantes de MODÈLE `GOV_PENSION_*_SHARE` (3 sites unifiés : setupSimulation, retirementIncome,
  estateCalculation) + doc §6 · SystemView TAX_MODULE composé depuis `TAX_BASE_YEAR`/
  `FED_BRACKETS[0].label`/`BASIC_PERSONAL_AMOUNT_FED` · assiette dividendes ALIGNÉE gains
  (+`accRetraitsReerYear` dans `incomeForDiv`) + hypothèse « 30 % du rendement = dividendes »
  documentée §3 · retenue US 15 % sourcée (`US_DIVIDEND_WITHHOLDING_RATE`, convention Canada–É.-U.
  art. X(2)b)/XXI — 4 sites : assetLocation ×3 + glidepathRates) · **FSS réindexé barème 2026**
  (18 500/33 500/64 355/149 355, RQ+CFFP vérifié 2026-06-11 — le code portait le barème 2025 sous
  libellé 2026) · retenue FERR : `eligiblePensionIncome` = retraits REER/FERR N-1 par tête (aligné
  FA-1 ; impact chiffré NUL — `marginalRate` est bracket-only, documenté code+doc §7) ·
  `calculateCeliRoom` unifié sur l'extrapolation taxJanuary (`LAST_KNOWN_CELI_YEAR` exporté,
  fallback `|| 7500` figé supprimé).
  **RESTES (non couverts par le lot)** : ~~`setupSimulation.ts` `inflationRate || 2.0` masque le
  0 légitime (→ `??`)~~ ✅ FAIT (PR #273 — `?? 2.0`, le 0 % saisi est respecté ; 3 tests ; rayon
  baselines nul = aucun fixture à inflation 0 ; + 2 sites UI alignés : Retirement label, ChildPlanning
  coûts, sinon un scénario 0 % affichait/indexait 2 %) · ~~NPV estate lit `governmentPension` même quand `rrqEstimateMonthly` est
  fourni (divergence silencieuse)~~ ✅ FAIT (estateCalculation : les estimés RRQ/PSV priment, ×N
  per-personne comme retirementIncome ; repli 65/35 sans ×N préservé = garde FA-5 ; 5 tests) ·
  ~~**[RRQ-PSV-MIN]** inputs RRQ/PSV sans `min={0}` → un estimé NÉGATIF sous-estimerait en silence~~
  ✅ FAIT : clamp `Math.max(0, …)` dans retirementIncome ET estateCalculation (symétrique) + `min={0}`
  UI sur les 2 inputs ; test (négatif clampé == estimé 0). ·
  assiette clawback PSV/test SRG sans dividendes/intérêts non-reg
  (revenu net 23400 les inclut — sous-estime, borné au cap) · **[FSS-PSV]** 🔧 assiette FSS inclut la
  PSV — l'Annexe F la DÉDUIT (revendiqué sourcé 2026-06-11, page RQ « Cotisation des particuliers au
  FSS »). **Trace 2026-06-12** : confirmé que la PSV est DANS `incomeRetirementMonthly` (taxDecember.ts:662)
  donc bien dans l'assiette FSS ; SEUL le SRG en est retranché (`incomeRetirementGisMonthly`). Le fix
  exige (a) câbler un montant PSV mensuel familial dans le `ctx` de décembre (depuis le breakdown
  `computeRetirementIncome` — RRQ+PSV+DB par conjoint existe déjà, mais PAS la PSV isolée) puis le
  soustraire de l'assiette FSS comme le SRG ; (b) **transcrire d'abord la règle Annexe F dans
  FISCAL_REFERENCE** (actuellement ABSENTE : §FSS ne documente que l'exclusion SRG) — money-critical,
  ne pas implémenter sans source transcrite. PR dédiée. · lagged SRG déflaté du facteur du mois courant
  (~1 an d'écart, SRG légèrement surévalué) · `ghOtherNominal` (récolte de gains, retraité) inclut
  le SRG non imposable → palier visé trop petit (conservateur) · **dbMonthly quasi-nominal dans le
  revenu test SRG réel** (post-FA-9 : SRG coupé de plus en plus tôt pour un profil DB, conservateur
  mais amplitude ×1,49 à 20 ans — déflater la composante DB) · **plafonds ×N non survivor-aware**
  (découverte FA-10) : droits CELI/REER/CELIAPP continuent de s'accumuler pour le défunt
  (`projection.ts` fhsaRoom, `taxJanuary.ts:159`) — sous-imposition indirecte mineure · retenue FERR
  estimée sur 2 têtes en survivorMode (timing seulement, réconcilié en décembre) · taux HELOC
  5 %/an en dur (`realEstateMonth.ts:336`, découverte FA-7 — hypothèse de modèle à paramétrer) ·
  🧭 « montant pour personne vivant seule » QC (grille TP-1.G) absent code+doc — pertinent pour un
  survivant, NE PAS chiffrer sans source Revenu Québec.
- [x] **[FA-12]** 🔧 (livré) Test d'intégration survivorMode SEEDÉ (`projection.survivor.test.ts`,
  5 tests) via hook test-only `__runScenarioForTests`. Astuce clé : `replayHistoricalYear` override
  les taux APRÈS les tirages MC → runs modelSurvivor ON/OFF BIT-IDENTIQUES jusqu'au décès (crypto=0,
  tous les flags stochastiques off), la divergence NetWorth EST le décès. Conjoint 100 ans (p=0,33
  plafond), seed k=0 épinglé → décès au PREMIER janvier (mi=12). Contrats : divergence exactement à
  mi=12 · totalTaxesPaid survivant > base ×1,10 (FA-10, 1 contribuable — mesuré +55 %) · NW final
  survivant < base (PSV défunt cesse) · base identique ∀ seed (aucun tirage si OFF) · série complète
  (la sim continue). En MC le chartData est ALLÉGÉ ({NetWorth, monthIndex}) → assertions par agrégats.
  Si un changement moteur décale la consommation rng : re-scanner k=0..7 (procédure en tête du test).
- [x] **[FA-11]** 🔧 (résolu par DOCUMENTATION — l'option prévue au ticket) Discontinuité SRG au
  seuil documentée en limite assumée dans FISCAL_REFERENCE (§ SRG) : marche ~167 $/mois au seuil
  22 512 $, SRG surévalué (non conservateur) dans la bande ~18-22,5 k$, cause = top-up récupéré
  ~25 ¢/$ supplémentaires non modélisé. Les paramètres exacts du top-up ne sont publiés que via les
  TABLES trimestrielles Service Canada (pas de formule officielle) → les chiffrer sans source
  violerait la règle fiscale. Reste ouvert (🧭 si voulu) : transcrire les tables et modéliser la
  vraie courbe continue.
- [x] **[FA-9]** 🔧 (livré) **Double indexation du SRG** corrigée : `calculateGISBenefit` appelé
  SANS `year` (barème 2026 de base = base réelle, comme RRQ/PSV) contre le revenu test réel, puis
  nominalisation UNIQUE ×inflFactor. Avant : max+seuils ×1,02^Δ dedans PUIS ×inflFactor dehors →
  max surévalué ~49 % à 20 ans (~+6,5 k$/an fictifs) + seuils nominaux face à revenu réel.
  4 tests anti-régression (max simple-indexé, réel constant, seuil de coupure réel) +
  FISCAL_REFERENCE §6.3 note d'indexation. L'util garde son param `year` (usages nominaux hors moteur).
- [x] **[FA-10]** 🔧 (livré) Impôt de décembre en **survivorMode** : le revenu du survivant était
  réparti sur 2 têtes (barème progressif 2× à demi-revenu + crédits d'âge du défunt + fractionnement
  fictif + RAMQ/FSS ×2 = sous-imposition). Fix au call-site (pattern FA-2) : `taxFilers = survivorMode
  ? 1 : activeUsersCount`, `ageSpouse`/décompositions par conjoint coupés, DB AGRÉGÉE sur une tête
  (crédit pension complet), salaire du défunt à 0 dans la branche active de décembre. 4 tests de
  contrat (vrai barème progressif). Bonus : commentaire W1.4 INVERSÉ corrigé (survivant = user1,
  défunt = user2 — `activeIncome.ts:61` faisait foi).
- [x] **[PV-1]** 🔧 (livré — choix Marc : cascade de vente) Liquide négatif effacé silencieusement :
  les débits DIRECTS (impôt d'avril, véhicules/rénos W5, échéances d'objectifs) rendaient `liquid < 0`,
  clampé à 0 par `applyMidMonthGrowth` = dette effacée, patrimoine SURÉVALUÉ. Fix : sauvetage unique
  avant la croissance — découvert couvert par la MÊME cascade que le shortfall régulier (stratégie,
  retenue REER, PBMA/OAS) ; résiduel insolvable journalisé + compté (`shortfallMonths`). Tests de
  conservation (`projection.overdraft.test.ts`). Révélation : Karim (retraite 50, MCP 20 ans) était
  maintenu « solvable » par ~32 k$ d'impôts d'avril avalés → ruine honnête à l'an 20 (test MCP passé
  à 10 ans). Bonus : `get_projection` MCP — `finalNetWorthNominal` = NW brut (cohérent avec `real`),
  successoral exposé séparément (`estateNetWorth`, comme get_retirement_outlook). ⚠️ Sémantique :
  les mois de sauvetage comptent désormais dans `shortfallRate` (honnête — il a fallu vendre).
- [x] **[PV-6]** ✅ Résiduel insolvable = dette portée : quand la cascade du sauvetage PV-1 ne couvre
  pas tout (comptes épuisés / cap OAS), le résiduel est journalisé puis absorbé (convention CF-2 des
  shortfalls non couverts) → NW encore surévalué du résiduel dans les scénarios DÉJÀ en ruine. Modéliser
  un passif `liquidDebt` cumulé (affiché au bilan) si on veut un NW honnête en insolvabilité. Basse
  priorité (scénarios concernés déjà signalés par shortfallRate/successRate). (M)
- [x] **[PV-2]** 🔧 (livré) Récolte de gains ignorait `capitalLossBank` : la banque de pertes (TLH)
  est désormais consommée EN PREMIER (LIR 111(1)(b)) — part compensée = 0 $ d'impôt et HORS palier
  (step-up d'ACB gratuit), remplissage du palier sur le latent restant. `consumedLoss` retourné au
  caller (seule la part non compensée entre dans `accCapitalGainsYear`). 4 tests + FISCAL_REFERENCE §3.
- [x] **[PV-11]** ✅ mergé #247 — (a) métrique `goalShortfalls {count,total}` (hook onGoalShortfall,
  3 tests) ; (b) retraits de goals aux séries withdrawal* ; (c) `_label` retiré ; (d) docstring
  portfolioOps précisé. + clamp liquid négatif (un goal n'efface plus un découvert). Validé
  projection-validator (1927/1927, baselines intactes) ; réserve per-conjoint → PV-11e.
- [x] **[PV-7]** 🔧 (livré) Ventes de CRYPTO via `handleCryptoSale` (miroir de handleNonRegSale) :
  gain proportionnel + banque de pertes (LIR 111(1)(b)) + pertes banquées, aux 2 sites de vente en vie
  (cascade de shortfall `cashflowAllocation.ts`, goal-mutator `projection.ts`). Avant : gain BRUT
  (banque ignorée) et pertes JETÉES. 5 tests unitaires. (Estate latent : NonReg ET crypto ignorent la
  banque symétriquement — hors scope.) Reste le câblage caller de gainHarvesting non testé (cf PV-11).
- [x] **[PV-8]** 🔧 (livré) ⚠️ NON CONSERVATEUR corrigé — TLH fabriquait une perte à partir du seul
  rendement (`harvestedLoss = fakeSell × dropRate`), SANS regarder l'ACB : un titre en gain latent en
  année négative donnait une perte fictive qui gonflait `capitalLossBank` (et PV-2 transformait chaque $
  fabriqué en step-up d'ACB gratuit → sous-imposition des gains réels). Désormais borné par la perte
  LATENTE RÉELLE : `harvestedLoss = max(0, costBasisSold − fakeSell)` avec `costBasisSold = fakeSell ×
  (ACB/valeur)` = `0,5 × max(0, ACB − valeur)`, indépendant du taux ; gain latent → 0 récolte.
  Conservation `acbDelta = −L`. FISCAL_REFERENCE §3 : hypothèse « perte apparente » LIR 54/40(2)g)(i)
  levée (rachat fonds corrélé non identique). Tests réécrits (anti-fabrication, rate-indépendance,
  monotonie en profondeur de perte, conservation).
- [x] **[PV-9]** 🔧 (livré) ⚠️ NON CONSERVATEUR corrigé — gains en capital désormais inclus au test
  SRG ET au clawback PSV : le gain RÉALISÉ imposable (×0,5) entre dans le revenu net des deux tests.
  SRG → `prevYearCapitalGainsForGisNominal` (lag N-1, capturé en décembre avant reset, déflaté) ;
  clawback PSV → `accCapitalGainsYear` de l'année N passé à `computeOasClawback` (réparti également).
  Avant : exclus → un 65+ bas revenu avec gains/gainHarvesting voyait un SRG fictif (surévalué) et
  aucun clawback. Pas de double-comptage (N-1 vs N). 6 tests (SRG = REER ×0,5, clawback, gardes NaN).
  Reste hors test (FA-8) : dividendes/intérêts non-reg.
- [x] **[PV-10]** 🔧 (livré) ⚠️ NON CONSERVATEUR corrigé — goal-mutator NonReg : le retrait
  `'NON-ENREG'` des échéances d'objectifs passe par `handleNonRegSale` (ACB proportionnel, banque
  de pertes, gain → accCapitalGainsYear → imposé en décembre). Avant : ACB décrémenté du montant
  VENDU complet et AUCUN gain réalisé (jamais imposés + ACB faussé). Test d'intégration discriminant
  (delta TaxPaidGains avec/sans objectif — échec prouvé sans le fix). Bonus : logs d'objectifs
  HONNÊTES (montant TIRÉ + « visé X — fonds insuffisants », au lieu de la cible toujours affichée).
  Piège documenté : la room historique CELI/REER ignore `celiContributed` → fixture de test via
  `useManualBalances` + rooms 0.
- [x] **[PV-3]** 🔧 (livré) Fractionnement : l'assiette du crédit pension (féd 31400 / QC 361) SUIT
  désormais la pension transférée vers le récipiendaire (ARC : le bénéficiaire du fractionnement peut
  réclamer le crédit sur la pension reçue). `combinedTaxFor` prend l'assiette par appel ; la grille
  passe `{splittable[H]−tr, tr}`. Avant : assiette gelée pré-split → récipiendaire jamais crédité
  (conservateur). Test d'effet (impôt < assiette gelée, grille reproduite). FISCAL_REFERENCE §6.
- [x] **[PV-4]** 🔧 (livré) Tests des clamps hors-bornes `rrqStartAge`/`psvStartAge`
  (`retirementIncome.ts:184-185`) : 4 tests — 55→60 (rien à 59, identique à un 60 explicite),
  80→72 (facteur ×1,588 appliqué), PSV 60→65 (pas d'anticipation), PSV 80→70 (×1,36 vs 65).
- [x] **[PV-5]** 🔧 (livré) Champs `number` Retraite — saisie vide écrasée silencieusement (découverte EP-8) :
  `updateGoal('X', Number(e.target.value))` (`Retirement.tsx`) persistait `Number('')` = **0** (pas NaN ; et
  NaN sur saisie mi-frappe « - »/« 1e »). En projection (`retirementIncome.ts:203-208`) : `dbPensionStartAge`
  vidé ⇒ 0 ⇒ `age >= 0` toujours vrai ⇒ pension DB versée « dès 0 an » ; estimé RRQ/PSV vidé ⇒ 0 (≠ `undefined`)
  ⇒ le moteur ne retombe plus sur la rente agrégée (`!== undefined`, l.187-191). Fix : `utils/numericInput.ts`
  (`numOr` requis → repli valeur courante ; `numOrUndef` optionnel → `undefined`, jamais 0/NaN) appliqué aux
  10 `<input number>` + tests unitaires. Validé par projection-validator (1835/1835, invariants OK, 0 régression). (S/M)

## 🧽 Audit code 2026-06-09 (code-analyzer) — dette actionnable
- [~] **[CA-01]** PARTIEL — code mort utils/. ✅ **`safeNumber.ts` (30 l) SUPPRIMÉ** (PR #373, 2026-06-19) : util de
  coercition NaN jamais adopté (le moteur garde inline via `Number.isFinite`) → aucun consumer prod (grep : fichier +
  son test seulement), retiré avec son test. ⚠️ **`csvExport.ts` N'EST PAS mort** (affirmation d'origine périmée) : USÉ
  par `components/Transactions.tsx` (export CSV) → NE PAS supprimer. Reste à vérifier 1-à-1 (knip bruyant, pas en masse) :
  exports orphelins (addPurchase/removePurchase, formatMonthYear, `getHasUserDataSnapshot`). NB `formatCompactCAD` EST
  utilisé (axes/tooltips compacts, cf CLAUDE.md formatage) → pas mort. (S)
- [x] **[CA-02]** ✅ (helpers délèguent à formatCAD — source unique, format préservé) Unifier le formatage monétaire : 11 helpers locaux divergents (« 1 234$ » vs
  « 1 234,00 $ »…) → `formatCAD` de `utils/format.ts` ; résorber ~135 `toLocaleString`. (M)
- [ ] **[CA-03]** Finaliser la migration `utils/tax.ts` (820 l) → `services/tax.ts` (alias 5 l
  inachevé, ~20 imports directs restants). (S)
- [x] **[CA-04]** ✅ Smoke tests des 8 composants money-critical sans test direct (DebtManager,
  ChildPlanning, TaxCenter, RealEstate, Retirement, Investments, FutureProjection, AiAssistant) — rendent sans crash.
- [ ] **[CA-06]** Découper `FutureProjection.tsx` (1000 l) + centraliser ses 32 hex dans
  `chartColors`. (L)
- [ ] **[CA-07]** Tokens couleur : `constants/chartColors.ts` (source Recharts), 20 hex en className
  à bannir, 247 classes palette brute → tokens sémantiques. (Le « ~636 text-gray » du D3 est réglé :
  0 restant.) (M)
- [ ] **[CA-08]** Primitives `ui/Input`, `ui/Select`, `ui/Field` (label+erreur+aria) + migrer les
  hotspots (AdvancedProjectionParams 40 inputs, PatrimoineExtended 19, Onboarding 11,
  ProjectionControls 10). (M)
- [ ] **[CA-09]** Découper `services/pdfReport.ts` (847 l) et `services/claude.ts` (768 l) ; évaluer
  l'extractible restant de `projection.ts` (1387 l). (L)
- [x] **[CA-10]** ✅ (quasi complet) — `usePastPortfolioHistory` (dédup PH2-c-1 + `.modes` : mode test,
  anti-fuite réel→test M3, gardes) + **`usePwaInstallPrompt`** (`tests/hooks/usePwaInstallPrompt.test.ts`,
  11 cas : recence de dismiss 30j + garde `Number.isFinite`, standalone, flux beforeinstallprompt/
  promptInstall/appinstalled). `assetMeta` n'existe plus (module supprimé) ; `analytics.ts` = trivial
  (`trackPageView` 40 l, un seul wrapper) → test sans valeur, laissé. (S)

## 🧹 Grand nettoyage AAA — items ENCORE ouverts (réf. `AAA_AUDIT_2026-06.md`)
> D1 (money CF/M-*), D5 (robustesse), D6 (double-h1, focus tour), D9 (robustesse LLM/ingest) = ✅ **faits**
> (détail dans l'audit). Restent les gros chantiers à décision/risque :
- [ ] **[D3]** Design system : codemod des ~636 couleurs ad-hoc (`text-gray-*`, hex) → tokens
  (`ink-*`, `surface`, `success/warning`) + règle ESLint anti-régression. Raffine l'existant
  (dark + emerald), zéro changement d'apparence rendue.
- [ ] **[D4]** God-files : scinder par impact `Investments` (1154) → `FutureProjection` (969) →
  `Budget` (892) → `Transactions` (729) → `Dashboard` (621)… + **[D4-H2]** sélecteurs atomiques
  (App re-render sur tout slice non-`lastProjection` + prop-drilling via `TabRouter`).
- [x] **[D6-SR]** ✅ (gros du lot) — primitive `<PrivateAmount>` (aria-hidden + sr-only « Montant
  masqué » en mode privé, blur CSS inchangé, 4 tests) + MIGRATION : `KPIStat` (prop privacy → couvre
  TOUS les KPI), `DualKPIStat`, `CurrentCapitalCard` (6), + 13 sites one-liner via codemod conservateur
  (RealEstate, Investments, Dashboard, ChildPlanning, StressTestPanel, PropertyConfigurator,
  NetWorthByOwnerCard).
- [ ] **[D6-SR-2]** 🔧 (reste de migration, enrichi revue #247) — ~69 occurrences `privacy-blur`
  restantes : INPUTS (légitimes — un champ éditable doit rester utilisable par son utilisateur SR ;
  **SLIDERS ✅ FAIT** : helper partagé `maskedSliderAria(isPrivacyMode)` (`utils/privacyAria.ts`) +
  `aria-valuetext="Montant masqué"` sur les 5 sliders monétaires masqués — PropertyConfigurator
  prix/mise de fonds, ProjectionControls revenu/dépenses théoriques + plafond immo ; helper réutilisable
  pour les sliders restants ; ChildPlanning REEE NON masqué visuellement → pas de parité à corriger.
  **+ `aria-label` (nom accessible) sur ces 5 sliders** (leurs `<label>` ne sont pas associés) + constante
  partagée `MASKED_AMOUNT_LABEL` (DRY entre `privacyAria` et `PrivateAmount`)) +
  spans mono-valeur + MONTANTS ADJACENTS. **#282 Retirement (13 mono-valeur → PrivateAmount).** **#283 : primitive
  `<PrivateBlock>` CRÉÉE** (`components/ui/PrivateBlock.tsx` + 4 tests : aria-hidden sur le conteneur + `sr-only`
  sibling, SANS wrapper les enfants → préserve le flex multi-spans, là où PrivateAmount le casserait) **+ Dashboard
  liste d'actifs migré** (bloc diff+revenu → PrivateBlock ; bloc gain → PrivateAmount). RESTE = **finition de masse**
  (~50 `privacy-blur` sur ~16 fichiers ; les primitives PrivateAmount/PrivateBlock/KPIStat/Layout NE comptent PAS) :
  gros = `ProjectionTooltip` (13), `ActionPlanDrilldown` (6), `RealEstate` (4), `StrategyOptimizerPanel`/`Planning`/
  `Budget`/`BudgetGroupTable` (3 ch.), puis RetirementIncomeCard/FutureDetailModal/Transactions/Investments/
  StressTestPanel/ChildPlanning/etc. Outils prêts : mono-valeur → `<PrivateAmount>`, bloc multi-spans → `<PrivateBlock>`.
  Mécanique mais volumineux → à faire par paquets (1 fichier ou 2 / lot).
- [x] **[A11Y-SLIDERS]** ✅ COMPLET — nom accessible (WCAG 4.1.2/2.5.3) sur TOUS les sliders dont le `<label>`
  n'était pas associé. **ProjectionControls** (10 : Horizon, Inflation, Hausse salaire, CELI, NonReg/REER,
  Coussin, Inflation/poste ×6, Part actions US, Rendement div. US, Coût soins LD) + **PropertyConfigurator**
  (Prix, Mise de fonds, Plafond) + **RealEstate** (Rendement Boursier, Appréciation Immo) + **DebtManager**
  (Paiement suppl.) + **TaxCenter** (Cotisation REER, CELIAPP) + **ChildPlanning** (Cotisation REEE) — tous
  `aria-label` = texte visible. **Budget:622** avait déjà un nom ; **HealthIndicator:322** déjà associé via
  `htmlFor`/`id` (SKIP, corrects). Tests : `ProjectionControls.a11y` (13 sliders) + PropertyConfigurator (3) +
  DebtManager.smoke (1) + TaxCenter.smoke (2) ; RealEstate/ChildPlanning vérifiés statiquement (render =
  fixtures goal/enfant, disproportionné pour attribut statique). NB : `aria-label` partout (uniformité) ;
  `aria-labelledby` serait + robuste contre la dérive label↔aria si refonte un jour.
- [ ] **[D6-PRIV-MONTANTS]** 🔧 DECISION Marc 2026-07-06 : **OUI masquer au repose, révéler au focus** — incohérence produit :
  les montants $ des sliders REER/CELIAPP (TaxCenter), REEE (ChildPlanning) et paiement suppl. (DebtManager)
  s'affichent EN CLAIR en mode privé (pas de `<PrivateAmount>`), alors que prix immo, revenus/dépenses théoriques,
  mise de fonds y sont masqués. Solution : chaque slider → encapsuler la valeur numérique DANS un composant qui
  masque au blur/repose (par symétrie avec `<PrivateNumberInput>` — focus révèle, blur re-masque) ; l'input reste
  cliquable. Accessible : `aria-label` porte la vraie valeur SR-safe + le slider se focus normalement. Patches : `TaxCenter.tsx`,
  `ChildPlanning.tsx`, `DebtManager.tsx`. Effort S (3 fichiers, pattern clair). Priorité : post-D7-KBD (lot a11y).
- [ ] **[D7]** → Voir [PERF-BOOT] l.724 (doublon, même tâche, déféré provider-aware).
- [ ] **[D6-KBD]** Sidebar hover-only : labels `opacity-0` focusables + `disabled` bloque
  l'accordéon clavier → rendre pilotable au clavier.
- [x] **[D6-GRAPH]** ✅ **PARTIELLEMENT FAIT (A11Y-INK500 lots 1-2)** — tables de données `ChartDataTable` sr-only ajoutées aux 2 donuts Budget. Reste : graphes restants (projections, investissements) ; résiduel = accès clavier aux graphes.
- [ ] **[D6-HEADING]** `CollapsibleSection` émet son titre dans un `<div className="text-h2">` (pas
  un `<hN>`) → saut h1→h4 dans plusieurs onglets (sous-titres `<h4>`). Ajouter une prop `headingLevel`
  pour un vrai outline (h2/h3). Touche tout le codebase (a11y-auditor 2026-06-09).

## 🚀 [CIX] Couple/Individuel « 1000× » — grande initiative ⏳ (surtout ouverte)
> Fait : impôt par conjoint (revenu A1 + crédits B-AUDIT-3). Reste tout le reste.
- [ ] **[CIX-B]** FONDATION — propriété par personne : `owner` sur `Asset`/`Debt`/comptes +
  util `netWorthByOwner` + vue « Répartition par personne ». Additif, faible risque.
- [ ] **[CIX-A1B]** Impôt exact par conjoint **de bout en bout** (attribution rentes/retraits
  REER-FERR/DB/SRG par conjoint — exige des soldes REER/FERR par conjoint). Lourd, débloque le timing.
- [ ] **[CIX-A2]** Fractionnement du revenu de pension à la retraite (≤ 50 %).
- [ ] **[CIX-A3]** REER de conjoint (spousal RRSP) : cotiser au conjoint à plus bas revenu.
- [ ] **[CIX-A45]** Attribuer déductions au plus haut taux marginal + crédits transférables (frais
  médicaux, âge, conjoint).
- [ ] **[CIX-C]** Scénarios séparation (patrimoine familial QC) + décès (roulement REER/CELI,
  RRQ survivant 60 %, PSV cesse) + comparateur ensemble vs séparé.
- [ ] **[CIX-DE]** Optimiseur de couple (étend G21) + décaissement coordonné à 2 têtes (âges de
  retraite différents, demande RRQ/PSV optimale par personne).
- [ ] **[CIX-F]** Bascule couple↔individuel **sans perte** (mémoriser le conjoint) + avatars/couleurs.

## 🎨 Épuration UI — directives Marc 2026-06-09 (ordre validé)
> Ordre : [UI-SCEN] plans de base → [UI-EPURE] épuration → [U5] → lot a11y (D6) → [ICONS-FUT].
- [x] **[UI-SCEN]** (livré #223) Enlever les « plans de base » : `withdrawalStrategy` = paramètre
  (sélecteur dans Paramètres), moteur 1 scénario (suite moteur 82→33 s, slider déterministe ÷11),
  stress-tests à la demande dans Optimisation (`StressTestPanel`), cartes/badge/Verdict supprimés,
  optimiseur « Appliquer » → paramètre + âges de rentes #210.
- [x] **[UI-EPURE]** Audit visuel global de chaque onglet → **fait (code-analyzer 2026-06-09)**.
  Verdict : Futur→Paramètres = l'écran le plus chargé (« usine ») ; redondances chiffrées
  (patrimoine projeté à 4 endroits, score de santé à 3, renvois « → Futur » dans 6 onglets,
  `UserConfigFields` dans 4 onglets). TOP 10 ci-dessous ([EP-1] seul = ~80% du « moins chargé »).
- [x] **[EP-1]** 🔧 (livré #225) Futur/Paramètres : fusionner « Variabilité » + « Événements stochastiques » en
  une section « Risques & aléas » repliée (gate MC actif) ; 10 toggles stochastiques derrière un
  bouton « Activer des aléas… ». 4 sections → 2, ~20 contrôles visibles → ~8. (M) **Priorité Marc n°1.**
- [x] **[EP-2]** 🔧 (livré #225) Futur/Paramètres : retirer la Card AI note + les pros/cons DUPLIQUÉS (déjà sous
  le sélecteur de stratégie) → un seul bloc stratégie. (S)
- [x] **[EP-3]** 🔧 (livré #226) Dashboard : le 5e KPI « Indicateur Futur » → KPIStat simple « Patrimoine projeté »
  (dernier point lastProjection.chartData, source unique), mini-formulaire retiré. (S)
- [x] **[EP-4]** 🔧 (livré #226) Investments : donut « Score de Santé » retiré (doublon du badge header). (S)
- [x] **[EP-5]** 🔧 (livré #226) Investments : Card « Portefeuille projeté » condensée → patrimoine net projeté
  + lien « Détail par compte dans Futur ». (S)
- [x] **[EP-6]** 🔧 (livré) Configuration : `SetupHub` → ruban discret repliable quand complétude = 100 %,
  hub complet sinon. (M)
- [x] **[EP-7]** 🔧 (livré) Futur/Plan d'action : `ProjectionExplains` — méthodologie (6 Q&A) sous
  `CollapsibleSection` « En savoir plus » repliée par défaut. (M)
- [x] **[EP-8]** 🔧 (livré) Retirement : Card « Revenus & besoins » allégée — bloc « Pension d'employeur
  (DB) » sous `CollapsibleSection` (ouvert seulement si un montant DB existe déjà) ; Besoin + RRQ + PSV
  restent visibles ; champs DB détail toujours conditionnels au montant > 0. (M)
- [x] **[EP-9]** 🔧 (audit ⇒ déjà satisfait) Global : les vrais doublons décoratifs ont été retirés par
  les lots antérieurs (donut santé #226, badge « N événements actifs » #225). L'audit (Explore très
  complet) confirme que les 5 renvois « Futur » restants sont fonctionnels et contextuels (1/onglet :
  KPI Dashboard, bouton Placements, carte Budget, badge Immo, badge REEE) et que `<ProjectionRequired>`
  est un empty-state honnête à GARDER → aucun code à retirer (≤ 1 lien discret/page déjà respecté). (S)
- [x] **[EP-10]** 🔧 (livré) Futur/Optimisation : `StressTestPanel` replié par défaut, `StrategyComparePanel`
  ouvert ; `AssetLocationPanel` RETIRÉ (doublon de l'AssetLocationCard de Retraite, plus riche → fichier supprimé). (S)

## 🎨 P2 — UX & polish
- [ ] **[U5]** Export PNG du graphe « Évolution détaillée » (Dashboard).
- [ ] **[ICONS-FUT]** Icônes Futur exhaustives : une icône typée par événement moteur (transferts,
  hypothèque, ventes, RAP, REEE…) + **LOD/clustering** lié au zoom (`useTimeChartZoom`). Moyen-grand.
- [x] **[ANIM]** Animations de qualité partout (chargements, navigation, KPIs, modales/listes) en
  CSS/WAAPI (pas de framer-motion), compositor-friendly, `prefers-reduced-motion`. Grand, à phaser.
  ⚠️ Piège connu (`index.css:222`) : un wrapper `transform` casse `position:fixed` → animer en opacité
  pure ou via portails.
- [x] **[FUT-OPT]** Onglet Futur : optimisation déplacée dans le sous-onglet « Optimisation »
  (4 onglets Graphique/Paramètres/Optimisation/Plan d'action + écran d'amorçage, #213) ; Robustesse
  + Optimiseur fusionnés en un outil « Comparer les stratégies » 2 modes (#215).
- [x] **[RENTE-80]** Rente retraite « ~80 $ » : cause = rentes couplées à l'âge d'arrêt. Réglé par
  le découplage moteur (`rrqStartAge`/`psvStartAge`, RRQ jusqu'à 72, #210) + UI âge de début des
  rentes dans l'onglet Retraite (#214). 👤 À valider sur ton persona (tests manuels ci-dessous).

## 🛠️ Configuration & Système — retours Marc (2026-06-05)
- [x] **[CFG-PROFIL]** Onglet Configuration → Profil : **regrouper en UN seul ensemble cohérent**
  (Paramètres de retraite « hub central » + Configuration Utilisateurs/Salaires & Macro + Profils
  enregistrés + Mode de répartition) et **améliorer** la présentation.
- [x] **[CFG-COMPTES]** Onglet Configuration → Comptes : **regrouper** (Upload relevé de salaire IA +
  Soldes initiaux + Import CSV bancaire), **retirer le texte inutile**, améliorer.
- [x] **[CFG-SAUVE]** Onglet Sauvegarde : **en retirer le Mode test ET « Connecter à Claude »**
  (mauvais emplacement) → les déplacer (Mode test → Système/diagnostics ; Connecteur → sa propre carte).
- [x] **[SYS-REGROUP]** Refonte page **Système & diagnostics** : tout regrouper, plus simple et propre
  (diagnostics AVEC le journal d'erreurs).
- [x] **[SYS-ERRLOG]** Journal d'erreurs : bouton « Rafraîchir » présent (`ErrorLogViewer.tsx`,
  refreshKey). Vérifié 2026-06-09 — était livré mais jamais coché.
- [x] **[SYS-AUDIT]** Journal d'audit **toujours à 0** → brancher `logAudit()` aux call-sites
  (import CSV, suppressions en lot, restauration backup…). Infra prête depuis #103, jamais câblée.
- [x] **[SYS-WEB]** « Toile d'araignée » : **retirée** (option « la retirer si plus pertinente » —
  `SystemView.tsx:156`). Vérifié 2026-06-09.
- [x] **[SYS-VERSION]** Version & build : branché sur Vite define (`vite.config.ts:31-33` →
  `BUILD_INFO` SystemView), auto-tenu à jour à chaque build. Vérifié 2026-06-09.
- [x] **[NBA-PAGE]** « Prochaine action » : **sortir de la sidebar → page/onglet à part** (la sidebar
  ne devrait pas porter ce widget).

## ⚡🧪🔧 P2/P3 — Perf, tests, dette
- [ ] **[PERF-WK]** Profiler le worker projection (keystroke latency des sliders Futur).
- [ ] **[T3]** Couverture 64 → 80 % (composants lourds restants : Retirement/FutureProjection/ChildPlanning).
- [ ] **[T4]** Automatiser 20-30 tests manuels critiques en Playwright (depuis `MANUAL_TEST_CHECKLIST.md`).
- [ ] **[DT5]** Splitter le worker projection (projection / Monte Carlo / scénarios) si le moteur grossit.
- [ ] **[DT3]** Aligner totalement UI ↔ moteur `ChildPlanning` (cf B2).
- [ ] **[B3]** Early-exit de la bissection `findEarliestRetirementAge` (test ~30 s, pas critique).
- [ ] **[B4]** Audit des fichiers de test pour repérer les assertions obsolètes (structures internes changées).
- [ ] **[BIAIS-CAGR]** `startingBalancesFromHistory.ts` : le « rendement réel » compare 1er↔dernier
  point sans retirer les apports → surestime. Note UI ou exiger ≥ 3 ans.
- [ ] **[NONREG-LOSS]** `handleNonRegSale` ne modélise pas les pertes en capital NonReg (branche
  `capitalLossBank +=` inatteignable) → sous-estime l'efficacité fiscale en marché baissier.

## 🔭 Grosses initiatives — quasi terminées
- ✅ **Copilote d'argent** (onglet Futur, passé+présent+futur+optimiseur) : A1-A3, B1-B2, C1-C4
  **livrés**. Reste 👤 : valider le **passé réel** sur tes données + clé Finnhub.
- ✅ **Connecteur MCP** (Lots 0-3) : livré. Reste 👤 : héberger le `.mcpb` (cf `A_FAIRE_MOI` O2).
- ✅ Refonte graphs G1-G20, audit fiscal 2026, mode strict, centralisation : **livrés** (cf archive).

---

## 👤 Tests manuels en attente — SEULEMENT Marc (sans `[ID]`, jamais auto-cochés)
> Ce que Claude ne peut pas vérifier seul. Détail exhaustif : `docs/MANUAL_TEST_CHECKLIST.md`.

**Connecteur MCP (après hébergement du `.mcpb`)**
- [ ] Install 1 clic depuis la carte → Claude Desktop → « connecte mes finances » → vraies données.
- [ ] Auto-sync : appliquer une paie/un relevé dans Claude → rouvrir l'app → données à jour.

**Sync Drive (version fraîche : Unregister SW puis recharger)**
- [ ] Fenêtre privée → login Google → toutes les données reviennent (+ clés API).
- [ ] Reste connecté au refresh ; l'onboarding ne réapparaît pas ; « Dernière sync » se met à jour seule.
- [ ] Clés chiffrées : restauration sur un autre appareil ramène les clés (preuve que le `sub` déchiffre).

**Moteur / UX**
- [ ] Rentes (fix #210/#214) : sur ton profil, vérifier que RRQ/PSV démarrent aux âges choisis
  dans Retraite (indépendants de l'âge d'arrêt) et que le « ~80 $/mois » a disparu.
- [ ] Mode test (fix #217) : switch de persona → AUCUNE donnée de l'ancien ; reload → la bannière
  orange reste ; « Désactiver » → tes vraies données reviennent.
- [ ] Refonte Futur (#213-#216) : les 4 sous-onglets te conviennent ? L'écran « Calculer ma
  projection » au premier passage ? La checklist du Plan d'action (cases + « Pourquoi ? ») ?
- [ ] Zoom molette + pan fluides (60 fps) sur tous les onglets graphiques.
- [ ] Pendant un (re)calcul Futur → écran « Calcul de ta projection… » (pas l'ancienne courbe).
- [ ] Salaire saisi (Onboarding/scan paie/TaxCenter) → affiché **mensuel cohérent** partout.
- [ ] Scénario chômage/invalidité → **moins d'espace REER** cette année-là + patrimoine REER final ≤.

---

## Comment maintenir ce backlog
1. **Ajouter** un item découvert → `- [ ] **[ID]** description`.
2. **Cocher au merge** : Claude coche l'`[ID]` quand la PR qui le livre est mergée (+ réf PR).
3. Blocage humain → `A_FAIRE_MOI.md`. Audit large → `code-analyzer` (ajoute des items ici).
4. Priorité : **P0** → 🧭 décisions → grand nettoyage AAA → CIX → P2/P3 en rotation.

## 2026-08-12 — cycle FUTUR-DAILY (suite) : PR #589 → #594

Retours Marc en rafale sur la courbe Futur, tous livrés + mergés + déployés le jour même :
sélection directe au jour (#589/#591/#592), passé qui suit le calendrier (#593), événements et
impôts à leur jour exact (#594, validator PASS complet + 3 durcissements). ⚠️ Hiérarchie : dans
le BACKLOG, les 4 blocs `SELECT-PATH`/`ROLLOVER`/`NATIVE`/`STICKY-ACTIONS` étaient des SOUS-ITEMS
du chantier parent `[FUTUR-DAILY-TOUCH]` (toujours ouvert), PAS de `[FUTUR-DAILY-EVENTS]` (qui
vivait, lui, en section « Dette technique ») — l'indentation ci-dessous est conservée telle
quelle, ne pas en déduire une parenté avec EVENTS. Contexte intégral :

- [x] **`[FUTUR-DAILY-EVENTS]`** ✅ 2026-08-12 (retour Marc 04:37 : « j'ai mis un
  événement de vie et ça m'a mis au mois et pas au bon jour, tout doit être au bon jour les impôts
  aussi ») — la DONNÉE existe (`LifeEvent.date`/`TravelGoal.date` = date complète, input type=date)
  mais le moteur la TRONQUE (`monthlyEvents.ts` split('-') an/mois) et pastilles/ventilation posent
  tout au 1er. Plan cadré : `logLife/logFlow(msg, day?)` → registre `eventDays` par point (champ
  additif), pastilles à l'abscisse `axisXAtDay`, régularisation d'avril à l'échéance du 30
  (date limite ARC/RQ), ventilation quotidienne : chaque label posé à SON jour. Jalons SANS date
  réelle (FIRE, RRQ/PSV dérivés, lifeMarkers) restent au mois (no-fake). 6 tests (saisie datée,
  YYYY-MM sans jour → au mois, clamp 31→28 fév, échéance 30). Validator : PASS complet (rétrocompat
  bit-identique 0 diff/421 points, registre par mois étanche, partition ledger 0 cassée) ; ses
  3 findings FAIBLE durcis dans la même PR : jour fractionnaire arrondi (label plus jamais perdu du
  ledger), clamp `axisXAtDay` identique au ledger (date impossible restaurée ne pose plus la
  pastille sur le tick du mois suivant), ambiguïté daté/non-daté retirée du registre (no-fake,
  ordre indifférent) — 5 tests discriminants (échec prouvé sur le code d'avant via stash).
  - [x] **`[FUTUR-DAILY-SELECT-PATH]` + `[FUTUR-DAILY-SELECT-STEP]` le chemin vers le jour offert AU
        MOMENT DU CLIC** ✅ 2026-08-12 (retour Marc, capture « mai 2027 » : « je peux pas selectionner
        de jour juste un mois » — 4e occurrence UX-UNREACHABLE : le bouton « Jour » existait mais
        AILLEURS que là où le geste exprimait l'intention). Livré : infobulle figée d'un MOIS →
        bouton « Voir ce mois jour par jour » (zoom centré sur le mois cliqué, même largeur que le
        bouton « Jour ») ; infobulle figée d'un JOUR → « Veille / Lendemain » (sélection au jour
        près sans re-viser au pixel — un jour ≈ 6 px à ~150 jours, mesuré ; utilisable au doigt) ;
        tolérance de dérive du clic ADAPTATIVE (sonde : une dérive de 8 px pendant le geste était
        avalée par le garde anti-pan à 6 px → 14 px en vue jour, 6 px conservés en vue large) ;
        bandeau honnête quand la fenêtre est assez serrée mais que les ancres mensuelles manquent
        (vue au jour impossible avec des données passées trouées — dit à l'écran au lieu de rester
        muet). E2E « depuis la vue LARGE » rejouant le scénario exact de la capture.
  - [x] **`[FUTUR-DAILY-ROLLOVER]` le passé suit le calendrier** ✅ 2026-08-12 (Marc : « ça doit
        se mettre à jour à chaque jour pour le passé »). `useTodayIsoLocal()` : jour local RÉACTIF
        sur l'horloge module partagée du mois (tick horaire + visibilitychange) — `todayIso` était
        figé au montage, app ouverte = frontière réel/projeté gelée. Ancrages « Aujourd'hui » +
        fin de bande « Passé réel » à l'abscisse FRACTIONNAIRE du jour (`axisXForIso` — posés à
        l'entier du mois : jusqu'à 30 j d'écart) ; ligne « Passé réel ⟵ » retirée en courbe
        quotidienne (la frontière est AUJOURD'HUI, pas le 1er du mois). E2E horloge Playwright :
        minuit passe app OUVERTE → la frontière avance (mesuré au pixel, fenêtre zoomée).
  - [x] **`[FUTUR-DAILY-NATIVE]` la courbe est au JOUR partout — sélection directe** ✅ 2026-08-12
        (Marc : « je veux pas un bouton je veux pouvoir selectionner sur la courbe direct », cadrage
        3/3 : clic = jour partout · survol = jour · tracé au jour, GO). Architecture : série
        quotidienne GLOBALE construite une fois (`buildDailyLedger` + option `fields` — ventilation
        LÉGÈRE ~100 ms/30 ans, mesurée ; la complète à 99 champs = ~500 ms/180 Mo, réservée à
        l'infobulle ventilée À LA DEMANDE par mois, cache) ; le zoom reste mensuel et TRANCHE la
        série par abscisse (`sliceDailyRangeByX`, binaire) ; tracé DÉCIMÉ au-delà de ~700 pts
        (mesuré : 11 k pts × 8 aires gèlent le main thread — `mouse.wheel` Playwright expirait) avec
        sélection sur la tranche COMPLÈTE ; mois-ANCRE reconstruit du réel seul
        (`realOnlyMonthPoints`, sinon bande « Passé réel » amputée — e2e d'axe). RETIRÉS : bouton
        « Jour », bouton « Voir ce mois jour par jour » (livré 24 h plus tôt), seuil
        DAILY_CURVE_MAX_POINTS. Bandes MC : percentiles mensuels reliés (sinon perdues partout —
        étiqueté). E2E 8/8 dont vue LARGE sans zoom + garde de poids DOM.
  - [x] **`[FUTUR-TOOLTIP-STICKY-ACTIONS]` le pied d'actions de l'infobulle figée est ÉPINGLÉ**
        ✅ 2026-08-12 (retour Marc APRÈS le déploiement de SELECT-PATH : « figée mais sans le
        nouveau bouton », rechargement forcé fait, prod vérifiée à jour côté Vercel). Cause : le
        tooltip défile en interne (`max-h-[480px]`) et avec ses vraies données (impôts + par-compte)
        le pied d'actions passait SOUS LE PLI — rendu mais jamais VU. L'e2e n'a rien attrapé :
        **Playwright scrolle l'élément en vue avant de cliquer** — le robot paie le chemin que
        l'humain ne voit pas (5e occurrence UX-UNREACHABLE du chantier, leçon CONVENTIONS étendue).
        Fix : pied `sticky bottom-0` + fond opaque ; verrou unitaire (classes) + assertion e2e de
        GÉOMÉTRIE avant tout scroll (bas du bouton ≤ boîte visible du tooltip).


## Déménagés le 2026-08-17 — rattrapage de la dérive signalée par Marc

> ⚠️ **Pourquoi ce bloc existe, et ce qu'il dit de la tenue du fichier.** Marc a constaté que
> `BACKLOG_ARCHIVE.md` n'avait pas bougé depuis le 2026-08-14 et que ses tâches restaient dans
> `BACKLOG.md`. Il avait raison : **57 items cochés** y dormaient. La règle demande DEUX
> gestes au merge — cocher, PUIS déménager. Je faisais le premier et j'avais arrêté le second, ce
> qui est le pire des deux mondes : le fichier a l'air tenu, il ne l'est pas.
> C'est exactement la dérive que `CLAUDE.md` décrit (« c'est la tenue à chaque push qui empêche la
> dérive, pas les grandes passes de nettoyage ») — et cette section EST une grande passe de
> nettoyage, donc la preuve du diagnostic. Le déménagement fait désormais partie du commit final.

- [x] **V1 — Quick wins confiance + hygiène** ✅ 2026-07-31 (PR #549, items archivés) : `[MCP-TAX-FHSA-BALANCE]` (clamp) +
  `[DASH-HIST-CARDS-LABEL]` + `[PROJ-TAXPAID-LABEL]` + `[BIAIS-CAGR]` + `[DEP-ESBUILD-UNLISTED]` +
  `[DETTE-SHADE-OUTOFPALETTE]` + `[DEADCODE-TX-TYPEFILTER]` + `[FISC-REF-FRESHNESS]`
  (doc : dater §4, nettoyer réserve §8, documenter 0.92/EST_*/REEE_AIP au doc).

- [x] **V2 — Meltdown honnête** ✅ 2026-07-31 (PR V2, discriminant git-stash prouvé 2/2) :
  `[WHT-DISPLAY-MELTDOWN]` (requalifié ÉLEVÉ — le ranking de stratégies pèse un impôt sous-compté
  ×2,6, MESURÉ) + `[ENG-MELTDOWN-FLOW-INVISIBLE]` (774 k$ de retraits invisibles des flux).

- [x] **V3 — Parité état + tests money-critical** ✅ 2026-07-31 (PR #552, 40 tests) :
  `[DEFAULTS-DRIFT-FINTABLE-FIELDS]` (4 champs + garde bidirectionnel) + `[TEST-GAP-TAXESTIMATE]` +
  `[TEST-GAP-SUBSCRIPTIONS]` + `[TEST-GAP-ROLESCONFIG]` + `[PV-11e]` + `[NW-PARITY-SURFACES-TEST]` (tous re-vérifiés livrés+verts 2026-08-12 — fichiers aux IDs, dont `nwParitySurfaces.test.ts`)
  (+ fix PDF `equity: 0` en dur → `presentEquityOfGoal`). Archive au merge de #552.

- [x] **V4 — Vie privée (3/4)** ✅ 2026-08-01 (PR V4) : `[D6-PRIV-MONTANTS]` (PrivateSliderValue,
  4 sliders + montants voisins) + `[SEC-GA-DEFER-CONSENT]` (le SCRIPT gtag ne part chez Google
  qu'au consentement) + `[HIST-STORE-SIZE]` (downsample stocké > 365 j → 1 pt/semaine, idempotent,
  compose avec mergePriceHistories). `[PROFIL-SWITCH]` reste (questions posées à Marc — voir 🧭).

- [x] **`[FISC-RRIF-FRACTIONAL-AGE]`** ✅ 2026-08-06 (PR #573) — `rrifRateForAge()` remplace le repli
  attrape-tout : plateau EXPLICITE à 95+ (`RRIF_PLATEAU_AGE`, seuil qui n'était porté que par
  l'absence d'entrée dans la table), âge entier pour un fractionnaire, **0** pour un âge non fini.
  Discriminant prouvé contre `git archive` : l'ancien code rendait 20 % — le facteur le plus
  punitif — sur 72,5 · 93,9 · NaN · +Infinity. Identité bit-à-bit du moteur vérifiée par SHA-256
  sur 361 mois × 102 champs (sonde prouvée discriminante : 1 point de base déplace le hash).
  Au passage : `RRIF_FIRST_WITHDRAWAL_AGE` nommé (il vivait en dur sur taxJanuary ET taxDecember).

- [x] **`[FISC-REF-DEDUP]`** ✅ 2026-08-06 (PR #573) — un sujet, un endroit : les valeurs vivent dans
  §CELI / §REER / §FERR, et la section d'ancrage ne garde que la PROVENANCE et la leçon.

- [x] **`[FUTUR-DAILY-TOUCH]` zoom au DOIGT sur les graphes (pincement)** ✅ 2026-08-12 (retour
      Marc 14:50 : « je veux pouvoir zoomer parce que pour l'instant sur le tel c'est inutilisable
      trop petit trop cramped impossible » ; cadrage : TOUS les graphes d'un coup, 2 doigts = zoom,
      1 doigt = la page). Implémenté DANS `useTimeChartZoom` (les 9 consommateurs héritent via
      `containerRef`/`ZoomContainer`) : pincement = zoom + pan combinés (base figée au départ du
      geste — ratio, donc pas de point-fixe d'arrondi), `touch-action: pan-y` posé par le hook,
      armement au touchMOVE (un écartement réel démarre doigts collés — mesuré par sonde CDP),
      garde `isPinchActive` contre la sélection au lever du 2e doigt. 8 unitaires (discriminants,
      8/8 rouges sur l'avant) + 2 e2e tactiles réels (CDP `gestureSourceType: 'touch'` — le
      « default » est la MOLETTE en desktop headless, leçon CONVENTIONS).
  - [ ] **`[FUTUR-DAILY-CADENCE]` cadence de paie dérivée des documents** (demande Marc 2026-08-11 :
        « je veux que ça dépende des PDF que je donne ou ce que j'indique à Claude… je veux pour
        l'instant que ce soit jeudi hebdo »). Aujourd'hui `DEFAULT_PAY_DAY_OF_WEEK` est un défaut de
        CODE : tous les montants quotidiens du futur en dépendent (un mauvais rythme décale chaque
        solde de plusieurs jours). À dériver des relevés/paies importés, avec repli sur le défaut
        actuel. Ampleur : M.
        Donc : au zoom fort, courbe de VN quotidienne + aires mensuelles ou masquées, et l'écran doit
        le DIRE. À valider avec Marc avant de coder.
        ⚠️ **2e prérequis de l'étape 2, trouvé en revue** : `resolvePointFromClick`
        (`utils/chartTooltip.ts`) et `handleWheel` (`hooks/useTimeChartZoom.ts`) résolvent la
        position par INDEX DE TABLEAU (`frac × (length − 1)`), en supposant un espacement uniforme.
        C'est vrai aujourd'hui — tous les producteurs de `monthIndex` incrémentent de 1 sans trou
        (`buildPastPrefix.ts`, `monthlyOutput.ts`) — donc sur un axe numérique à domaine
        `[dataMin,dataMax]` la relation position ∝ index tient par transformation affine. Dès que
        `displayData` portera des `monthIndex` FRACTIONNAIRES, les deux divergeront silencieusement
        de la position réellement rendue (le clic résout le mauvais point, le curseur de zoom dérive).
        À traiter EN MÊME TEMPS que l'injection des points quotidiens, pas après.
  - [ ] ⚠️ **Divergences d'ANCRE du cash quotidien** — ⚠️ **PLUS latentes depuis #582** (le cash
        quotidien est branché sur la courbe) : `computeStartingCash` compte TOUTE transaction, la
        quotidienne exige une date complète. Un flux daté au mois seul est dans l'ancre mais pas dans
        les points → tout le niveau passé décalé (mesuré −2 000 $). Idem pour un flux daté APRÈS
        aujourd'hui.
        **Mitigation RÉTABLIE 2026-08-11 (`[FUTUR-DAILY-ANCHOR-CAVEAT]`)** : la suppression du
        panneau (#584) avait emporté l'avertissement avec elle — régression d'honnêteté attrapée à
        la relecture du BACKLOG, pas par un test. `buildDailyPastLedger` rend désormais
        `undatedTotal`/`flowsAfterNowDate` (y compris quand AUCUNE ligne n'est produite) et le
        BANDEAU de la vue au jour les affiche en avertissement.
        - [ ] Le vrai correctif — retrancher ces flux de l'ancre — touche `computeStartingCash`,
              donc le raccord au présent : **plan-first**, inchangé.
  - [ ] Liquidités par COMPTE bancaire — ⚠️ BLOQUÉ par une absence de donnée : on reconstruit à
        rebours depuis le solde connu d'AUJOURD'HUI, or il n'est connu que GLOBALEMENT.
        `FintableBrokerBalance` ne couvre que les comptes `kind: 'investment'`. Prérequis : persister
        les soldes des comptes `kind: 'cash'` (la sync les LIT déjà, elle les agrège).
  ⚠️ Contraintes de garde pour la suite du chantier (pas des tâches) : NE JAMAIS mettre de
  décimales dans `monthIndex` (clé d'axe du graphe, du tableau ET des icônes-jalons — les jalons
  se désaligneraient en SILENCE ; la granularité vit dans `date`) · vérifier le POIDS stocké
  avant de livrer une densification (`[HIST-STORE-SIZE]` a été fait POUR tenir le quota).

- [x] 🔴 **`[ENG-DIVORCE-BENEFITS-FLUX]`** — **CORRIGÉ 2026-08-17** (PR #644). Après divorce, les
  allocations familiales étaient encaissées à **100 %** mais publiées à **50 %**.
  Mesuré : `Δ Income = +332 $/mois` contre `Δ childBenefits = +166 $/mois`, constant sur tout
  l'horizon. Cumul 20 ans : 31 673 $ encaissés vs 17 629 $ affichés ; effet patrimoine final
  **75 957 $**. Contredit frontalement la décision verrouillée (`docs/adr/0012-quatre-decisions-de-marc-2026-08-17.md`, Décision 5).
  **Correctif livré, et il ne ressemble pas au correctif prévu.** Ventiler `monthlyIncomeDelta`
  comme `liquidDelta` n'aurait fait que déplacer le problème : chaque montant d'enfant alimente 3 à
  5 registres, et partager le RÉSULTAT oblige à se souvenir de tous. La part de garde est désormais
  appliquée **à la SOURCE**, sur le MONTANT (`childCustodyShare` dans le ctx de `processOneChild`) —
  tout dérivé suit par construction, et les multiplications en aval ont disparu de `projection.ts`.

- [x] 🔴 **`[ENG-DIVORCE-STUDIES-PAYOUT]`** — **CORRIGÉ 2026-08-17** (PR #644). Pendant les études,
  la dépense était partagée (× 0,5) mais le décaissement REEE restait ENTIER.
  Mesuré : `payout = 2 899 $/mois` contre `1 450 $` de dépense portée → **+1 450 $/mois** de
  trésorerie née de nulle part (≈ 69 600 $ sur 4 ans) et le REEE de l'enfant se vide **2× trop
  vite** (épuisé 24 mois plus tôt). Pas de création monétaire au bilan — une incohérence de modèle,
  dérivé oublié de la même assiette. **Correctif** : `studiesMonthly` partagé à la SOURCE ⇒ le
  retrait, calibré dessus, suit automatiquement. Résolu par le même changement que ci-dessus.

- [x] 🔴 **`[ENG-DIVORCE-CHILDREN-NO-SCENARIO-TEST]`** — **LIVRÉ 2026-08-17** :
  `tests/services/divorceEnfantsScenario.test.ts` (10 tests). **Aucune garde n'exerçait
  divorce × enfants**, et c'est pourquoi les deux défauts ci-dessus sont passés avec 4 262 tests
  verts. Tous les tests de divorce déclarent `childGoals: []` ; le fuzz a des enfants mais n'active
  pas `enableMonteCarlo`, donc `tryDivorce` ne tire JAMAIS ; `childrenGardePartagee` teste
  `processOneChild` en ISOLATION et ne touche aucun registre aval. Test exigé au niveau
  `__runScenarioForTests`, divorce forcé : `Δ Income === Δ childBenefits`, `childCost === childGross`
  sur tout l'horizon, `ReeePayout` cohérent avec `childGross` pendant les études. **7 rouges sur le
  code d'avant.**
  ⚠️ **Deux pièges de vacuité rencontrés en l'écrivant, et ils valent la leçon** : (1) en mode MC le
  moteur RÉDUIT chaque point à `{ NetWorth, monthIndex }` — sans `verboseMonthlyPoints`, le test
  lisait des `undefined`, comparait des zéros et serait resté VERT sur n'importe quel code ;
  (2) un enfant de 18 ans ne cotise plus au REEE, donc sans solde de départ le régime est vide et
  « payout ≤ gross » passe sur un régime VIDE, pas sur un correctif. Les gardes `> 0` ont révélé
  les deux.

- [x] 🔴 **`[PASSE-REEL-RESIDUEL-DEPOTS]`** — **CORRIGÉ 2026-08-17** (PR #644). Le résiduel
  « Non expliqué » valait **exactement les dépôts du jour**, systématiquement.
  `dayVariation.ts` exclut les `deposits` « parce qu'ils s'annulent » — mais
  `reconstructCashHistoryDaily` construit les liquidités à partir des SEULES transactions, donc
  `ΔLiquidités = NetTransferLiquid` et jamais `NetTransferLiquid − Σdépôts`. Mesuré sur un achat de
  500 $ : l'écran affiche « Variation +500 », « Non expliqué +500 » ET « dont 500 $ déplacés — ça ne
  change pas ton patrimoine ». Les trois lignes se contredisent.
  **Re-mesuré moi-même avant de corriger** (un finding money-critical est une hypothèse) — confirmé,
  et la mesure a révélé DEUX cas distincts que le finding fusionnait :
  · achat DÉBITÉ (transaction ordinaire) : ΔPatrimoine = 0, juste — mais « Non expliqué +500 $ ».
    Les dépôts portent le côté PLACEMENT et n'avaient aucun pendant dans les sources. **Correctif** :
    `depots` devient une SOURCE ; elle s'annule avec `tresorerie`, mais seulement parce que les deux
    y sont.
  · achat marqué VIREMENT INTERNE : exclu de la reconstruction du cash, donc le titre entre sans
    débit et **ΔPatrimoine = +500 $ pour un simple déplacement**. ⚠️ Mettre les dépôts en source
    ferme AUSSI le résiduel de ce cas — donc masquerait le défaut. D'où `depotsNonFinances`, un
    drapeau dédié qui prend le relais du résiduel comme détecteur, avec son message à l'écran.
    Heuristique assumée (comparaison aux sorties TOTALES du jour) : sous-détection possible, jamais
    sur-détection.

- [x] 🔴 **`[PASSE-REEL-RESIDUEL-ARRONDI]`** — **CORRIGÉ 2026-08-17** : résiduel d'ARRONDI permanent —
  `NetWorth` et `cash` sont arrondis, les sources non. Mesuré sur 3 jours sans aucun dépôt :
  +0,37 / −0,21 / +0,04 — tous au-dessus du seuil d'affichage (0,005 $), donc rendus en ambre comme
  « Non expliqué **0 $** » et « **-0 $** ». Le seul garde-fou honnête du panneau devient du bruit
  quotidien. **Correctif** : `SEUIL_RESIDUEL_SIGNIFICATIF = 1 $` (deux points arrondis à l'unité
  bornent l'erreur à ±1 $), exporté par le service pour que l'écran ne redéfinisse pas le seuil dans
  son coin. ⚠️ Le résiduel n'est PAS absorbé : il reste exposé tel quel dans le résultat, seul son
  AFFICHAGE est filtré.

- [x] 🔴 **`[FUTUR-CATEGORIES-TOTAL-INCOHERENT]`** — **CORRIGÉ 2026-08-17** : `totalDepenses` inclut
  les dépenses SANS catégorie (incrémenté avant le test de catégorie) alors que son JSDoc affirme
  l'inverse : **doc fausse**. À l'écran, l'en-tête montre un total supérieur à la somme des lignes,
  et la note ne donne qu'un COMPTE, jamais le montant. Un mois à 3 000 $ dont 800 $ non classés
  affiche « −3 000 $ » au-dessus de lignes qui font −2 200 $ — écart laissé à la soustraction
  mentale, alors que le même panneau expose ailleurs son résiduel en $. **Correctif** :
  `montantSansCategorie` exposé et rendu comme une LIGNE (jamais comme une catégorie « Autre » —
  le libellé nomme le PROBLÈME, pas une nature de dépense), JSDoc corrigé, et l'invariant
  `Σ(lignes) + non classé === total` sous test.

- [x] 🔴 **`[FUTUR-CATEGORIES-MOIS-100PCT-NON-CLASSE]`** — **CORRIGÉ 2026-08-17** : un mois dont
  100 % des dépenses n'ont pas de catégorie fait disparaître **toute la section**, avertissement
  compris : la condition est `depenses.length > 0`. L'alerte « à classer » s'éteint exactement quand
  tout est à classer, et le mois paraît vide pendant que la courbe descend
  (`SILENCE-READS-AS-BROKEN`, 5e occurrence). Condition corrigée en
  `depenses.length > 0 || sansCategorie > 0`, sous test de rendu.

- [x] 🔴 **`[FUTUR-CATEGORIES-BASE-DE-DATE]`** — **TRANCHÉ 2026-08-17** : `monthCategories` accepte
  `date.length >= 7`, la courbe exige `>= 10` (les dates au mois seul partent dans `undatedTotal`).
  L'en-tête du module affirme pourtant « MÊME BASE D'EXCLUSION ». Mesuré : 100 $ datés au jour
  + 2 000 $ datés `2026-08` → catégories 2 100 $, courbe 100 $. La base doublon/virement est bien
  identique ; la base de PRÉCISION DE DATE ne l'est pas. Inclure les dates au mois est défendable
  pour une vue mensuelle — **le mensonge, c'était le commentaire**. **Décision** : on GARDE
  l'inclusion (exclure une dépense datée « 2026-08 » la ferait disparaître du mois d'août où elle a
  lieu) et on corrige le commentaire, qui affirmait une base identique. Sous test.

- [x] 🔴 **`[TEST-DAYVARIATION-AUTO-SATISFAIT]`** — **CORRIGÉ 2026-08-17** : le test « un dépôt s'annule dans le total »
  construit à la main une ligne que le pipeline NE PRODUIT JAMAIS (mesuré : le vrai `NetWorth` bouge
  de +5 000 dans ce cas). Il verrouille une donnée impossible et laisse passer le finding ci-dessus.
  Classe « garde auto-satisfaite ». Réécrit à partir de `buildDailyPastLedger` sur un achat réel,
  en deux cas (débité / virement interne). 2 rouges sur le code d'avant.

- [x] 🔴 **`[TEST-TOTAL-COMPTES-TAUTOLOGIQUE]`** — **CORRIGÉ 2026-08-17** : le test « total − dettes === valeur nette du
  moteur » ne fait **aucun `render()`** : il compare trois valeurs de la fixture construites
  ensemble. Son commentaire prétendait qu'il tomberait si un compte était oublié — faux : le pire
  des deux mondes, tautologique ET annoncé discriminant. Il lit désormais le total RENDU. Prouvé en
  omettant un compte de la somme du composant : 2 rouges.

- [x] **`[A11Y-INK500]`** ✅ 2026-08-12 — classification par-occurrence des 115 matchs du grep :
  6 étaient des `pink-500` (substring !) + 2 commentaires ; sur les 107 réels, 85 TEXTES actifs
  migrés → `ink-400` (AA normal 5.21-6.42 mesuré) et 22 GARDÉS en `ink-500` légitime (glyphes
  décoratifs aria-hidden, icônes-boutons ≥3:1 WCAG 1.4.11, numérotation présentationnelle,
  grandes icônes d'états vides).

- [x] **`[FUT-TOUCH-TARGETS]`** ✅ 2026-08-12 (absorbé par [FUTUR-MOBILE-LAYOUT], retour Marc
  « trop petit trop cramped ») — mobile : présets de fenêtre (« 5 ans »… « Tout », « Aujourd'hui »)
  à min-h 44px, bascules de légende à 36px (18 bascules : 44px chacune gonflait le bloc), boutons
  du pied d'infobulle déjà à 44px (sticky-footer). Desktop inchangé (sm:min-h-0). Livré avec :
  courbe mobile 55dvh (≈464px sur 844 vs 380 fixes), infobulle figée en BOTTOM SHEET pleine
  largeur avec bouton « Fermer » 44px (« Échap » n'existe pas au doigt), e2e géométrie réelle
  390×844.

- [x] **`[NAV-IA-CONSOLIDATE]`** — **caduque 2026-08-12** : supersedé par `[REFONTE-NAV]`
  (vision différente de Marc : plus d'Accueil du tout, la courbe Future au centre — voir
  `docs/REFONTE_NAV_PLAN.md`). Ne pas implémenter l'ancien découpage.

- [x] **`[UI-TABS-RICH]`** — **LIVRÉ 2026-08-17**. Généraliser le pattern sous-onglets.
  ~~Retraite (4 outils empilés)~~ FAIT par `[REFONTE-NAV-L4]` 2026-08-12. ~~Profil (long scroll)~~
  **FAIT** : `Profile.tsx` passe de CINQ groupes empilés à QUATRE sous-onglets — Identité · Revenus ·
  Retraite & enfants · Profils enregistrés (découpage Marc, `docs/adr/` ; le 4e onglet est
  mon ajout, ses trois bacs ne couvraient ni Retraite ni Enfants).
  Vrai travail : **extraire** les profils enregistrés de `UsersCard` (338 l. → 233 l.) vers
  `components/profile/SavedProfilesCard.tsx` — la Card mélangeait identité des personnes et
  snapshots de config, deux sujets qui partent dans deux onglets différents.
  ⚠️ Migration UI PURE : mêmes clés `localStorage` (`saved_profiles_list`, `profile_<slug>`), même
  slug. Garde de **rétrocompatibilité** qui écrit les clés À LA MAIN, comme l'ancien code — passer
  par l'UI pour construire la fixture n'aurait prouvé que la cohérence du code avec lui-même.
  Gardes : `tests/components/Profile.subTabs.test.tsx` (exhaustivité : l'union des onglets couvre
  EXACTEMENT les 5 groupes d'avant, ensembles comparés et non cardinalités) +
  `tests/components/SavedProfilesCard.test.tsx`. Les deux prouvées discriminantes.

- [x] **`[A11Y-SUBTABS-TABPANEL]`** — **LIVRÉ 2026-08-17**. Le motif ARIA des sous-onglets était
  INCOMPLET (ni `role="tabpanel"`, ni `aria-controls`, ni `aria-labelledby`) et RECOPIÉ à la main
  dans plusieurs écrans. Correctif : un composant UNIQUE `components/ui/SubTabs.tsx`
  (`<SubTabs>` + `<TabPanel>`), qui pose le lien RÉCIPROQUE onglet↔panneau et rend le panneau
  focalisable. Réparer les copies aurait garanti qu'elles divergent : le correctif durable est de
  retirer la copie.
  ⚠️ **La garde a révélé DEUX écrans que le ticket ne listait pas** (`Settings`, `FutureProjection`) :
  le ticket en annonçait 3, il y en avait 5. Leçon déjà au dossier — resserrer le scan AVANT de
  coder, les offenders donnent le vrai périmètre. Converti : `Profile`, `Retirement`,
  `BudgetWorkspace`, `Settings` (4 écrans, style IDENTIQUE → zéro changement visuel).
  Garde : `tests/components/subTabsAria.test.tsx` — rendu (lien réciproque, focalisabilité, panneau
  actif seul, `id` préfixés) + scan de SOURCE en CLIQUET.

- [x] 🔴 **`[FUTUR-INFOBULLE-MONTANTS]`** — **LIVRÉ 2026-08-17** (demande Marc, périmètre confirmé
  par lui : le PASSÉ). L'infobulle affiche le MONTANT de chaque mouvement, plus seulement le
  marchand. `DailyPastRow.movements` porte `{ payee, amount }` ; **`labels` en est DÉRIVÉ**, pas
  accumulé en parallèle — deux listes remplies séparément divergent, et l'infobulle montrerait des
  noms sans leurs montants.
  ⚠️ **Le plafond de 6 est devenu VISIBLE** (`movementsTotal` → « +N autres »). Il était SILENCIEUX :
  tant qu'on n'affichait que des noms c'était un détail, mais avec des montants Marc lirait six
  dépenses en croyant les avoir toutes — même classe que `truncatedFrom`.
  ⚠️ Repli sur les libellés seuls quand les montants n'existent pas (jour projeté) : on n'affiche
  JAMAIS un montant non mesuré. Montants via `PrivateAmount` (mode discret).
  Garde : `tests/services/infobulleMontants.test.ts` (7), dont l'invariant `labels === movements.payee`.

- [x] 🔴 **`[FUTUR-DETAIL-TOTAL-COMPTES]`** — **LIVRÉ 2026-08-17** (demande Marc). Le panneau détail
  affiche désormais le **Total des comptes**, en pied de liste.
  ⚠️ Somme des MÊMES champs moteur que les lignes, sur la liste **NON filtrée** : sommer la liste
  filtrée ferait dépendre un TOTAL d'un critère d'AFFICHAGE — deux écrans montrant des lignes
  différentes donneraient deux totaux pour la même donnée.
  ⚠️ Libellé « **hors dettes** » obligatoire : ce n'est PAS la valeur nette, déjà affichée en haut.
  Sur le cas réel de Marc l'écart vaut 49 337 $ — le confondre n'est pas un détail.
  Garde : `tests/components/FutureDetailModal.totalComptes.test.tsx`, qui vérifie la RELATION
  (`total − dettes === NetWorth` du moteur) et pas seulement l'addition — une addition juste d'un
  ENSEMBLE faux resterait verte. Prouvée discriminante en omettant un compte.

- [x] 🔴 **`[FUTUR-INFOBULLE-EPUREE]`** — **LIVRÉ 2026-08-17** (demande Marc). Infobulle **plus
  grande** (288×480 → **320×560**) et **quasiment sans prose** : trois paragraphes et deux légendes
  sont devenus des pastilles ou des `title`.
  ⚠️ **Aucune RÉSERVE perdue** — c'était tout le risque du ticket. Prix estimé, prix périmé, sync
  non confirmée gardent chacun un marqueur VISIBLE (`~ prix estimé`, `prix J−34`, `⚠ sync
  incomplète`) ; seule la phrase longue passe au survol. Le fait qu'il y a une réserve reste visible
  dans TOUTES les modalités ; ⚠️ limite assumée : au doigt, un `title` ne s'ouvre pas — on perd le
  libellé long, jamais l'alerte.
  ⚠️ La distinction jour réel (« marché seul ») / jour projeté (« croissance étalée ») est
  RACCOURCIE mais maintenue : les fondre ferait passer du lissage pour de la mesure.
  ⚠️ Découverte : `TOOLTIP_WIDTH` (utils/chartTooltip.ts, borne de position) DUPLIQUE la classe
  Tailwind `w-80` sans que rien ne les confronte au runtime → élargir la classe seule aurait fait
  déborder l'infobulle du bord droit, en silence, sur les seuls écrans étroits.
  Gardes : `tests/components/tooltipEpuree.test.tsx` (11) — plafond de prose (45 car./nœud de
  texte) tenu ENSEMBLE avec « aucune réserve perdue », les deux se contredisant si l'un est
  satisfait par suppression ; `tests/components/tooltipLargeur.test.ts` (2) confronte la classe et
  la constante. Plafond prouvé discriminant : 2 nœuds de 65 et 101 caractères sur le code d'avant.

- [x] 🔴 **`[FUTUR-DETAIL-CATEGORIES-MOIS]`** — **LIVRÉ 2026-08-17** (demande Marc, périmètre
  resserré par lui : « oui juste pour passé »). Le panneau ventile les dépenses du mois PAR
  CATÉGORIE, d'après les vraies transactions.
  ⚠️ **La frontière est la feature** : `monthIso` n'est transmis que pour un mois PASSÉ ou en
  cours. Un mois FUTUR n'a aucune transaction (postes budgétaires répartis) — y rendre une
  ventilation présenterait du projeté comme du constaté. Garde discriminante prouvée en retirant
  l'exigence de `monthIso` : la section apparaissait sur du projeté, 2 tests tombent.
  ⚠️ Une dépense SANS catégorie est DITE (« à classer dans Transactions »), jamais fondue dans un
  « Autre » inventé : c'est un fait sur les données de Marc, pas une catégorie. Elle reste dans le
  TOTAL — l'argent est sorti, seule sa catégorie manque.
  Même base d'exclusion que la courbe et la liste du jour ; entrées hors sujet ; tri décroissant
  départagé par nom (ordre STABLE, sinon les données semblent bouger).
  Gardes : `tests/services/monthCategories.test.ts` (9) + `tests/components/FutureDetailModal.categories.test.tsx` (6).

- [x] 🔴 **`[ENG-STRESSTEST-GROWTH-UNREGISTERED]`** (S, LIVRÉ) — le krach et la reprise mutaient
  les soldes sans alimenter `growthCELI/REER/NonReg/Crypto`. Livré : deltas mémorisés au moment du
  choc puis versés APRÈS `applyMonthlyGrowth` (qui ASSIGNE — les ajouter avant les écrasait
  silencieusement). Discrimination mesurée : **162 835 $** de chute non expliquée au mois du krach
  sans le correctif.

- [x] 🔴 **`[ENG-INV-FLUXFORM-COVERAGE]`** (M, LIVRÉ partiellement — périmètre MESURÉ) —
  `tests/services/projection.fluxForm.test.ts` : `Δsolde == MarketGrowth<k> + NetTransfer<k>`, mois
  par mois. Couvre **CELI, REER, Crypto** (résiduel mesuré 0,01 $ = l'arrondi au cent, avec ET sans
  stress-test). La garde a révélé DEUX producteurs muets de plus, dont un corrigé dans le même lot
  (transfert NonReg → CELI/REER, ci-dessous) ; le dernier est ticketé juste après.

- [x] **`[ENG-NONREG-TRANSFER-UNPUBLISHED]`** (S, LIVRÉ — découvert PAR la garde) — le bloc
  « Transfert NonReg → CELI/REER si espace » vendait du non-enregistré pour remplir les droits sans
  publier `withdrawalNonReg` / `contribCELI` / `contribREER`. **Mesuré : 51 197 $ de variation de
  NonReg inexpliquée en un mois**, sur un scénario ORDINAIRE (stress-test désactivé).
  ⚠️ `accRrspYear` était DÉJÀ alimenté : le suivi FISCAL était juste, seul l'affichage des flux
  mentait — c'est ce qui rendait le défaut invisible côté impôt. Effet de `contribREER` sur le
  registre per-conjoint : **MESURÉ NUL** (`reerByUserFinal` bit-identique sur 3 stratégies à
  salaires très inégaux — `stepReerByUser` réconcilie déjà sur `poolEnd`).

- [x] 🔴 **`[AI-CATEGORIZE-NO-BACKOFF]`** (M, LIVRÉ) — `categorizeBatch` chunkait 50 tx sans
  retry/backoff/pacing. Livré : backoff exponentiel borné (1/2/4 s, cap 60 s) **+** `Retry-After`
  honoré (secondes ET date HTTP) **+** pacing 1 s inter-chunks **+** court-circuit sur 401/403 (une
  clé refusée ne redevient pas valide au chunk suivant) **+** logs AGRÉGÉS portant l'erreur brute.
  `sleep` injectable → 15 tests qui ne dorment jamais.

- [x] **`[ENG-DIVORCE-ROOM-DOUBLE]`** (S) — REMPLACÉ par `[ENG-DIVORCE-ROOM-COUPLE]` ci-dessous :
  l'hypothèse est désormais MESURÉE, avec les montants. Ne pas traiter deux fois.

- [x] 🔴 **`[ENG-DIVORCE-CHILDREN-REEE]`** — **LIVRÉ 2026-08-17** (décisions Marc, `docs/adr/` :
  garde 50/50 + cotisations REEE suivant `keep`).
  ⚠️ **Le raccourci était FAUX, et c'est le cœur du ticket** : `liquidDelta` transportait les DEUX
  familles mélangées — coûts d'enfants (naissance l.162, voiture l.294) ET flux REEE (cotisation
  l.273, décaissement l.328). Un `liquidDelta * 0.5` aurait divisé par deux les cotisations REEE :
  un faux SILENCIEUX. Motif « un flux alimente PLUSIEURS registres » (meltdown REER).
  **Correctif** : ventilation À LA SOURCE — `ChildTickResult.liquidDeltaCosts` / `liquidDeltaReee`,
  avec l'invariant `costs + reee === liquidDelta` sous test. Le site d'appel applique la garde à la
  SEULE famille des coûts ; le REEE garde son partage patrimonial déjà appliqué au solde.
  Suivent la garde : `monthlyExpenseDelta`, `childGrossCostAdd`, `childBenefitsAdd`.
  ⚠️ `childCustodyShare = 1` hors divorce ⇒ rétrocompat BIT-IDENTIQUE par construction.
  Garde : `tests/services/childrenGardePartagee.test.ts` — partition sur 3 moments distincts +
  appartenance de chaque flux à sa famille, prouvée discriminante en classant la cotisation REEE
  dans les coûts (l'erreur RÉELLE que la garde doit attraper).

- [x] 🔴 **`[PASSE-REEL-1]`** (M, LIVRÉ PR #614) — le passé ne montre QUE du mesuré.
  **DÉCISION MARC** : pas de repli, pas de trait plat — la courbe commence où les données
  commencent. Livré : paramètre `todayIso`, retour `ProjectionChartPoint | null`, borne stricte
  (aujourd'hui reste projeté). Le changement de type a fait trouver l'infobulle par le compilateur.

- [x] 🔴 **`[PASSE-REEL-2]`** (M, LIVRÉ PR #617) — indicateur « mon passé colle-t-il à ce qui était prévu ».
  **DÉCISION MARC** : comparer à une prévision **FIGÉE que Marc verrouille** (`lockedProjectionStore`
  / `PROJECTION-PERSIST` existent déjà). ⚠️ Surtout PAS à une prévision recalculée aujourd'hui :
  elle intègre déjà le passé, l'écart serait nul par construction et l'indicateur dirait toujours
  « tout va bien ». Revue Vercel avant merge : la garde « point réel » filtrait sur `dayIso` (que le
  spread `{ ...d }` charrie sur les jours FUTURS) au lieu du marqueur `dayIsReal` → corrigé + 2 tests
  discriminants (leçon `MARKER-PROXY-GUARD`, `docs/CONVENTIONS.md`).

- [x] 🔴 **`[PASSE-REEL-3]`** (L) — **CADUC : déjà en place, VÉRIFIÉ dans le code le 2026-08-13.**
  La prémisse du ticket (« les soldes sont saisis une fois à la main ») est FAUSSE. Preuves, dans
  l'ordre de la chaîne :
  1. `hooks/useSimulationParams.ts:123` — `liveCSVBalances = deriveStartingBalancesFromHistory(pastHistory.points)` ;
  2. `services/history/startingBalancesFromHistory.ts:45` — `const last = points[points.length - 1]` :
     le futur démarre sur le **dernier point réel**, donc les soldes d'aujourd'hui ;
  3. `components/ProjectionEngine.tsx:58-85` — `useEffect([params, …])` : dès que ces soldes
     changent, la projection est **recalculée automatiquement** (debounce 300 ms) et republiée dans
     `lastProjection`. Aucun bouton, conformément à la décision de Marc ;
  4. `[FUTUR-DAILY-ROLLOVER]` (livré 2026-08-12, `useSimulationParams.ts:52-64`) — la frontière du
     JOUR avance toute seule (tick horaire + retour d'onglet), app laissée ouverte comprise ;
  5. Garde déjà en place : `tests/services/futureSeedContinuity.test.ts` (branchée sur la VRAIE
     reconstruction, pas sur une réplique) + `tests/hooks/useSimulationParams.dailyRefresh.test.tsx`.
  Seul résidu, et il est **correct par construction** : l'ancre `startYear/startMonth` a une
  granularité MOIS, parce que le moteur est mensuel. Les SOLDES, eux, sont ceux du jour.
  ⚠️ Classe `BACKLOG-STALE-TICKET` : ce ticket a été rédigé le même jour, à partir du symptôme
  signalé par Marc, sans greper le moteur — le vrai défaut était `[PASSE-REEL-1]` (le passé
  affichait la prévision), et il masquait le fait que l'amorçage du futur, lui, était déjà bon.

- [x] 🔴 **`[PASSE-REEL-CAP-400J]`** — livré 2026-08-14. Plafond de 400 j qui coupait la courbe de
  Marc au 2026-01-10 (sa date, au jour près). Boucle passée en curseur (1 993 ms → 37 ms, 54×) AVANT
  de relever le plafond à 4 000 j — relever seul aurait échangé un trou muet contre un gel de 2 s.
  `truncatedFrom` rend la troncature constatable. Garde : `tests/services/pastCap400Days.test.ts`.

- [x] 🔴 **`[PASSE-REEL-TXN-DU-JOUR]`** — livré 2026-08-14. Toutes les transactions du jour dans
  `FutureDetailModal` (le panneau existant, cadrage de Marc) : marchand, compte, catégorie, montant,
  + le net du jour. **Doublons et virements internes AFFICHÉS mais barrés**, avec leur raison — les
  masquer donnerait une liste qui ne colle pas au relevé bancaire, les compter donnerait un total
  qui ne colle pas à la courbe. Filtrage **à la demande** (`services/history/dayTransactions.ts`),
  PAS de Map pré-construite : le registre couvre ~4 000 jours, les pré-indexer garderait tout en
  mémoire pour n'en afficher qu'un. Mode discret conforme dès la naissance de la surface.
  **Détail par ligne** (demande de suivi de Marc, « et plus de détail ») : compte, statut anormal,
  conjoint attribué, origine de la catégorie (IA + confiance, ou vérifiée), catégorie d'avant si
  changée. Rien de déduit — un champ absent ne produit aucune pastille.
  Gardes : `tests/services/dayTransactions.test.ts` + `tests/components/FutureDetailModal.transactions.test.tsx`.

- [x] 🔴 **`[PASSE-REEL-TXN-JOUR-VIDE]`** — livré 2026-08-14. **Signalé par Marc (« marche toujours
  pas »), en mode « courbe au jour », sur des points du PASSÉ.** Une journée identifiée SANS
  transaction ne rendait RIEN : « aucun mouvement ce jour-là » et « c'est cassé » étaient
  indistinguables à l'écran, et c'est la seconde lecture qui s'impose. J'avais appliqué la règle
  no-fake-data au mauvais cas — elle interdit d'INVENTER une donnée absente, pas d'ÉNONCER un zéro
  MESURÉ. Le silence n'est honnête que là où la question n'a pas de sens (point mensuel ou futur,
  toujours sans section). Garde discriminante : 2 tests ÉCHOUENT sur le code d'avant, plus une
  assertion anti-sur-correctif (l'état vide ne doit pas s'afficher quand il y a des mouvements —
  sans elle, on pourrait rendre le message en permanence et rester vert).

- [x] **`[PASSE-REEL-IMPOT-LATENT-DEBUT]`** — **LIVRÉ 2026-08-17**. Marc : « je vois impôt latent
  commencer le 1/09 mais jsp pourquoi ». **Cause CONFIRMÉE par mesure** : `ImpotLatent` n'est émis
  NULLE PART dans le passé reconstruit (0 occurrence dans `dailyPastLedger.ts` et
  `buildPastPrefix.ts`) — le passé ne porte que soldes, flux et patrimoine net. Reconstruire un
  impôt latent exigerait l'historique des PRIX DE REVIENT, que l'app n'a pas.
  ⚠️ **Le calcul est JUSTE ; c'est le SILENCE qui était le défaut** — une courbe qui surgit à une
  date arbitraire se lit comme un bug. Classe `SILENCE-READS-AS-BROKEN`, la troisième de la semaine.
  Correctif : une phrase dans le bandeau « Courbe au jour », GATÉE sur la visibilité de la série
  (sinon bruit permanent). ⚠️ On n'invente PAS un impôt latent passé — no-fake-data.
  Garde : `tests/services/impotLatentPasse.test.ts`, qui verrouille le FAIT et non la phrase : si le
  passé se met un jour à émettre `ImpotLatent`, le test ÉCHOUE — l'explication affichée deviendrait
  fausse et devrait être retirée en même temps. Sans ça, l'app continuerait d'affirmer une
  limitation qui n'existe plus.

- [x] 🔴 **`[PASSE-REEL-VARIATION-DU-JOUR]`** — **LIVRÉ 2026-08-17** (demande Marc 2026-08-14 :
  « je veux voir la variabilité d'argent pour la journée, tout compris mais détaillé »).
  Le panneau montrait le NET ENCAISSÉ, qui n'est pas la variation du patrimoine : un jour de hausse
  boursière affichait 0 $ pendant que la courbe montait.
  ⚠️ **RIEN de recalculé** : `services/history/dayVariation.ts` ne fait que COMBINER ce que
  `DailyPastRow` émettait déjà. Les deux pièges annoncés au ticket sont traités et sous test —
  le **dépôt** s'annule dans le total (sinon compté deux fois) mais reste montré à part ; le
  **palier immobilier** est dit comme tel, jamais lissé.
  ⚠️ **Le RÉSIDUEL est AFFICHÉ** (« Non expliqué », ambre), jamais absorbé par un poste fourre-tout —
  c'était le critère de fini posé d'avance : un fourre-tout fermerait le total par construction et
  rendrait la vérification circulaire.
  Section repliable FERMÉE (choix Marc) + les deux contraintes qui rendent ce choix tenable :
  **état persisté** (sinon « repliable » = « toujours fermée ») et **titre autonome portant le
  montant** (la valeur est lisible sans déplier).
  `addDay` EXPORTÉ de `reconstructCashHistory` plutôt que dupliqué (pas de copie locale de formule).
  Gardes : `tests/services/dayVariation.test.ts` (11) + `tests/components/FutureDetailModal.variation.test.tsx`
  (9), les deux volets prouvés discriminants, avec assertion anti-sur-correctif sur le résiduel.

- [x] 🔴 **`[A11Y-PRIVACY-INVESTMENTS-DETAIL]`** (S) — livré 2026-08-14. Les **9 sites** listés par
  l'audit corrigés (légendes des 2 donuts, rééquilibrage en carte ET en liste, carte par titre :
  Valeur, Coût moyen DCA, Gain total DCA). Pourcentages et signe du gain laissés visibles, sous test
  d'intention. Garde de SOURCE sur tout le fichier :
  `tests/components/Investments.privacy.test.tsx`.

- [x] **`[A11Y-PRIVACY-PDF-CONTRAT]`** — **LIVRÉ 2026-08-17** (décision Marc, `docs/adr/`).
  `services/pdfReport.ts` REFUSE désormais de générer tant que le mode discret est actif, via une
  erreur TYPÉE (`PdfRefusedPrivacyError`) que l'appelant distingue d'une panne.
  ⚠️ **La garde est AU SERVICE, pas au clic** : une borne posée seulement dans `App.tsx` laisserait
  passer tout futur appelant (autre bouton, raccourci, outil MCP, script) — même motif que
  `clampSplitPct`, où la borne UI seule laissait passer un import de sauvegarde.
  ⚠️ Refus **immédiat**, avant toute construction : refuser au moment d'écrire le fichier aurait
  laissé un PDF partiel. Le mode est lu à l'APPEL (il peut être activé entre le rendu du bouton et
  le clic).
  Le toast dit quoi FAIRE (« désactive le mode discret »), pas « erreur » — confondre le refus avec
  une panne enverrait Marc chercher un bug.
  Garde : `tests/services/pdfPrivacyRefus.test.ts`, avec assertion ANTI-SUR-CORRECTIF (mode inactif
  → génère bel et bien : sans elle, refuser TOUJOURS resterait vert) et garde sur le `name` stable
  de l'erreur, sur lequel l'appelant discrimine. Prouvée discriminante (2 tests tombent sans la garde).

- [x] 🔴 **`[AI-CATEGORIZE-NO-BACKOFF]`** (M, LIVRÉ) — [dupliqué en fiscal section, voir là-haut]

- [x] **`[Q1-BRACKET-REALINDEX]`** ✅ Marc 2026-07-31 : « ok » — GO pour corriger la double
  indexation (`[FISC-BRACKET-REALINDEX]`, goldens re-basés sciemment).

- [x] **`[Q2-WHT-92PCT]`** ✅ Marc 2026-07-31 : « fix » — passer le `0.92` à `1.0` (discriminant).

- [x] **`[Q3-SOLO-SPLIT]`** ✅ Marc : « les deux ont un salaire mais possible que pendant un temps juste un en ait » → le fix par détention réelle est le bon dans les DEUX configs (0 $ d'écart aujourd'hui, juste demain) — GO, V5.

- [x] **`[Q-TAXDEC-INCR]`** ✅ Marc : « fix » → coder les 3 sous-fixes de taxDecember (crédit d'âge sur incrément, empilement gains+div, FSS) avec discriminants — fusionne avec [FISC-STACK-GAINS-DIV] en V6.

- [x] **`[Q-MILESTONES-KBD]`** ✅ Marc : « focusable » → pastilles focusables directement (tabIndex=0 + Enter/Space), V10.

- [x] **`[Q-IMMO-EQUITY]`** ✅ Marc : « dans l'app oui » (propriétaire modélisé) → BRANCHER l'équité immo du KPI sur les vrais biens, V2'.

- [x] **`[Q-RE-SALE-PURGE]`** ✅ Marc : « supprimer » → à la suppression d'un bien, SUPPRIMER les lifeEvents de vente qui le référencent (option B).

- [x] **`[Q-DRIVE-ENCRYPT]`** ✅ Marc : « non » → l'opt-in actuel reste ; SEC-DRIVE-ENCRYPT-DEFAULT FERMÉ (archivé).

- [x] **`[Q-WHATIF-DEBT]`** ✅ Marc : « moteur » → champ `Debt.startDate` honoré par le moteur (MCP-WHATIF-DATED-DEBT sort des différés, plan-first moteur).

- [x] **`[Q-PH4-BUD]`** ✅ Marc : « pose plein de questions, faut tout refaire » → refonte Budget CONFIRMÉE, cadrage par batch de questions à préparer (PH4-BUD → V12, plan-first).

- [x] **`[Q-NAV]`** ✅ Marc : « go, pose plein de questions » → IA-NAV-CONSOLIDATE GO, cadrage par batch de questions à préparer (V12, plan-first).

- [x] **`[Q-MCPB]`** ✅ Marc : « cloudrun » → chemin .mcpb FERMÉ définitivement.

- [x] **`[Q-COUPLE-VISION]`** ✅ Marc : « deux façons de voir l'app, mode couple et pas couple, et que tous les résultats et données soient fiables » → critère CIX défini : bascule couple↔solo (CIX-F) + fiabilité per-conjoint de bout en bout (CIX-A1B). Bloc CIX DÉBLOQUÉ : CIX-B → CIX-F → CIX-A1B en priorité.

- [x] **`[Q-RSU]`** ✅ Marc : « retire » → supprimer `rsuYearsRemaining` + `futureProvince`/`futureMoveYear` (lot nettoyage, V3').


## Livrés le 2026-08-17 — PR #645 / #646 (déménagés DANS le cycle, pas après coup)

- [x] **`[PRIV-PAYEE-MODE-DISCRET]`** — **LIVRÉ 2026-08-17** (PR #645). Marc a tranché : « masquer
  marchands ». `PrivateText` (jumelle de `PrivateAmount`) sur 8 surfaces, ATTRIBUTS compris
  (`maskPayee` pour `title`/`aria-label`).
  ⚠️ Deux pièges payés en route : le REPLI de l'infobulle fuyait (`dayLabels` = le vrai `payee` sur
  un jour futur) et ma fixture le rendait inatteignable ; et `rowControlLabel` donnait le MÊME nom
  accessible à toutes les transactions du même jour (trou WCAG 4.1.2 créé en bouchant la fuite) →
  discriminant `id`.
  Reste ouvert : `[PRIV-CATEGORIE-SENSIBLE]` (décision de Marc).

- [x] **`[PRIV-CSV-MODE-DISCRET]`** — **LIVRÉ 2026-08-17** (PR #645, `CsvRefusedPrivacyError`).
  Garde au SERVICE, pas au clic. ⚠️ Le CSV était PIRE que le PDF : marchands ET montants ligne par
  ligne, quand le PDF ne porte aucun `payee`. Leçon `DECISION-PRIVACY-UNE-SEULE-SORTIE`.

- [x] **`[PRIV-PRIVATEAMOUNT-TITLE]`** — **LIVRÉ 2026-08-17** (PR #646),
  `tests/components/privateTitleGuard.test.ts`.
  ⚠️ La garde interdit une VALEUR dans le `title`, pas le `title` lui-même : ces attributs portent
  l'EXPLICATION (« Argent que tu ajoutes toi-même »), et les retirer en mode discret coûterait de la
  compréhension sans retirer une seule fuite. Critère = interpolation (`${`).
  ⚠️ Porte un contrôle ANTI-VACUITÉ : la garde doit voir > 20 primitives, sinon un renommage la
  rendrait verte en ne regardant RIEN. Discrimination prouvée en ajoutant « Valeur exacte » au
  survol du patrimoine.


## Livré le 2026-08-18 — PR #648 (déménagé DANS le cycle)

- [x] 🔴 **`[PRIV-CATEGORIE-SENSIBLE]`** — **TRANCHÉ ET LIVRÉ 2026-08-18** (Marc : « masquer »).
  Option **B** retenue : TOUTES les catégories sont masquées en mode discret, pas une liste de
  « sensibles ». ⚠️ **Décision qui renverse ma reco (A)** — consignée dans `docs/adr/` pour
  que la prochaine session ne la « corrige » pas en croyant retrouver une cohérence.
  ⚠️ (C) écartée pour une raison de fond : une liste de catégories sensibles serait une heuristique
  de TEXTE sur des libellés que Marc écrit lui-même (`TEXT-HEURISTIC-OVER-USER-TEXT`) — « Psy » y
  échapperait en silence, et un masquage qui rate discrètement est pire qu'un masquage absent.
  ⚠️ Le `<select>` de catégorie s'ÉDITE → `PrivateSelect` (idiome `PrivateNumberInput` /
  `D6-PRIV-MONTANTS` : masqué au repos, révélé au focus). Le masquer comme un texte aurait retiré
  une FONCTION pour protéger une valeur.
  ⚠️ `PrivateText` annonçait « Marchand masqué » sur une colonne de catégories — faux à l'oreille,
  corrigé par une prop `quoi` typée en union fermée (un oubli devient une erreur de compilation).
  Gardes : `tests/components/categoriePrivacy.test.tsx` (9), 6 rouges sans le masquage.


## Livré le 2026-08-18 — PR #649 (rattrapage Fintable)

- [x] 🔴 **`[FINTABLE-RATTRAPAGE]`** — **LIVRÉ 2026-08-18** (signalé par Marc : « l'import Fintable
  marche pas, j'ai passé à 1 an d'historique et ça me dit 0 transactions en plus »).
  ⚠️ **Ce n'était pas un bug de code** : la sync est STRICTEMENT EN AVANT. Bascule = date de la
  transaction la plus récente connue → la requête est bornée à `date_from = bascule` ET le mapper
  jette tout ce qui est `<=` (filtre strict). Le réglage d'historique côté Fintable n'est lu NULLE
  PART dans ce chemin. Protection anti-doublon assumée (« pas de recouvrement = pas de dépendance à
  la dédup »), dont le prix était l'impossibilité de rattraper.
  ⚠️ **DEUX bornes, pas une** — n'en lever qu'une donne un rattrapage qui télécharge tout et n'en
  garde rien, en silence. Les deux tests qui les gardent sont indissociables.
  ⚠️ **Le vrai défaut d'affichage** : `skippedBeforeCutover` était calculé depuis toujours mais
  n'était rendu QUE dans le script de dry-run. Marc lisait « 0 en plus » sans savoir que des
  centaines venaient d'être ignorées (`SILENCE-READS-AS-BROKEN`, 6e occurrence). Remonté au rapport
  et affiché, avec le renvoi vers le bouton de rattrapage.
  Classement (décision Marc) : CERTAIN (même jour + montant + libellé similaire) neutralisé seul ·
  INCERTAIN (même montant ±5 j, libellé différent) listé pour arbitrage · le reste ajouté.
  ⚠️ **Neutralisé, pas supprimé** : effet identique à l'écran (hors courbe/budget) mais réversible —
  une suppression sur de la donnée d'argent ne l'est pas.
  ⚠️ **On ne touche PAS** deux vraies dépenses identiques rapprochées (choix de Marc) : la dédup
  historique les marque pourtant, faux positif destructeur sur un an d'historique.
  Gardes : `backfillDedup` (16, dont la moitié visent le faux positif) + `browserSync` (6).


## Livrés le 2026-08-18 — PR #651 (trous de détection du rattrapage)

- [x] 🔴 **`[FINTABLE-DOUBLON-DATE-DECALEE]`** — **CORRIGÉ 2026-08-18** (PR #651). Le cas
  `même libellé + même montant + 1 à 5 j d'écart` tombe désormais en INCERTAIN (listé), plus en
  NOUVELLE. ⚠️ C'est la forme la plus FRÉQUENTE du doublon bancaire réel (date de transaction vs
  date de comptabilisation) : ni neutralisée, ni listée, ni rattrapable par `txnKey` — double
  comptage silencieux. Mon en-tête justifiait l'exclusion par « deux cafés le même jour » :
  raisonnement valable entre deux ENTRANTES du même lot, faux face à une transaction déjà connue.
  ⚠️ Corrigé au passage : `Date.parse('2026-06T00:00:00Z')` étant valide, deux dates au MOIS seul
  donnaient `d === 0` donc « certain » sur une granularité mensuelle — `jourComplet` l'exige
  maintenant. 3 tests, prouvés discriminants.

- [x] 🔴 **`[FINTABLE-APPARIEMENT-GLOUTON]`** — **CORRIGÉ 2026-08-18** (PR #651). Classement en
  DEUX PASSES : tous les CERTAINS d'abord, les DOUTEUX sur le reliquat. ⚠️ En une passe, l'ordre des
  entrantes décidait — une douteuse traitée en premier volait l'existante d'un vrai doublon, ce qui
  produisait DEUX erreurs d'un coup (faux positif listé à Marc + vrai doublon reclassé NOUVELLE,
  donc compté deux fois). 1 test, prouvé discriminant.
