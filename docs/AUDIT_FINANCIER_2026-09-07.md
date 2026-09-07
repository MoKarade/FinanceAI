# 🔬 AUDIT FINANCIER COMPLET — FinanceAI (passe 2026-09-07)

> **Passe récurrente n°4** (précédentes : [`2026-06-17`](./AUDIT_FINANCIER_2026-06-17.md), [`2026-06-23`](./AUDIT_FINANCIER_2026-06-23.md),
> [`2026-07-16`](./AUDIT_FINANCIER_2026-07-16.md)). **Commit audité** : `main@3f657d7d`.
> **Demande Marc du 2026-09-07** : « lance une grosse analyse, check tous les problèmes corrigés et mets à jour la
> doc ». Deux périmètres donc : (a) l'audit exhaustif habituel du moteur financier sur `main` ; (b) une
> **vérification systématique** que chacune des 239 entrées archivées comme « corrigé » depuis le 2026-08-20 l'est
> encore dans le code d'aujourd'hui.
> **Méthodologie** : panel adversarial de 11 agents (5 du protocole + `ai-reviewer`, `a11y-auditor`, `documentation-manager`,
> et 4 vérificateurs des corrigés), chacun briefé pour RÉFUTER ; trust-but-verify sur CHAQUE finding (relecture du vrai
> code au `fichier:ligne`) ; **tout chiffre publié ici a été re-mesuré par moi** — un rapport d'agent n'est pas une
> source (leçon `UN-RAPPORT-D-AGENT-N-EST-PAS-UNE-SOURCE`). Les chiffres d'agent non re-mesurés sont marqués
> `[À vérifier]` ou omis.
> ⚠️ **Fichier daté = RÉCIT** : il dit ce qui était vrai le 2026-09-07. Ce qui doit rester vrai vit dans
> `BACKLOG.md`, `HANDOVER.md`, `docs/CONVENTIONS.md`, `docs/FISCAL_REFERENCE.md`.

---

## 1. Résumé exécutif

**Verdict global : le cœur financier reste sain et prouvé** — 0 écart de VALEUR entre le code et
`FISCAL_REFERENCE.md` (~90 constantes recalculées), conservation de l'argent tenue à **0,02 $** sur 50 runs et plus de
15 000 points, 0 valeur non finie, symétrie per-conjoint exacte, `totalTaxesPaid == Σ FluxImpots`, patrimoine
successoral monotone sur 36 horizons. **Les 10 findings de juillet sont fermés (10/10, preuves §3)** et
**233 des 239 corrections archivées depuis le 20 août sont encore en place** (§6 : 1 régression mineure, 2 gardes
disparues, 3 non contrôlables par nature). Sécurité : 0 finding, 0 vulnérabilité npm.

MAIS la passe trouve **un CRITIQUE de la classe « un actif qu'on n'écrit nulle part ne casse aucun bilan »** :
la valeur d'une **entreprise privée** (W5.7) est bien DANS le patrimoine net mensuel depuis le 2026-08-19, mais
**aucun champ publié ne la porte** — l'identité affichée `NW = Σ actifs − dettes` est fausse d'exactement
`estimatedValue × part détenue` sur 100 % des mois (mesuré : **900 000 $ d'écart à 4 points d'une projection de
25 ans**, `Entreprise` absent des clés de `chartData`), le grand livre quotidien la réintègre en dents de scie, et
le passé la met à zéro. Et **un money-critical MOYEN→ÉLEVÉ** : les droits REER d'un couple sont **fermés par l'âge du
seul premier conjoint** — à 72/57 ans, le conjoint de 57 ans qui gagne 120 k$ ne génère plus aucun droit et voit ses
droits accumulés remis à zéro (mesuré : 21 600 $ → 0 $).

Le reste vit **en périphérie**, comme aux trois passes précédentes : surfaces IA qui contournent une décision de
vie privée déjà prise, un solde de dette `NaN` accepté à l'édition puis rabattu sur 0 en silence, une cause de
troncature jetée par l'import Vision, et de la dette de gardes (proxy 45 % non documenté, ratchet aveugle à un
module, test perdu avec une feature). La leçon structurante des passes précédentes se confirme une fois de plus :
**les bugs d'argent naissent dans ce que le moteur ne PUBLIE pas et dans ce que les surfaces recalculent — pas
dans le calcul lui-même.**

## 2. Ce qui a changé depuis la passe de juillet (périmètre du delta)

Mesuré le 2026-09-07 sur `origin/main` :

| Grandeur | 2026-07-16 | **2026-09-07** |
|---|---|---|
| Commits sur `main` entre les deux passes | — | **384** (`git log --oneline --since=2026-07-16`) |
| Entrées `CHANGELOG` `[unreleased]` (utilisateur) | — | **219** |
| Tests Vitest | 2 661 | **5 747** (584 fichiers au dernier gate ; `find tests` en compte 585) |
| Sous-modules `services/projection/` | 41 | **57** |
| Lignes moteur (`projection.ts` + sous-modules) | — | **16 833** (`projection.ts` seul : 2 806) |
| `FutureProjection.tsx` / `Investments.tsx` / `Budget.tsx` / `TaxCenter.tsx` | (+13 à +31 % en 3 sem.) | **2 207 / 1 533 / 1 569 / 766** lignes |
| Tickets archivés FINIS + VALIDÉS depuis le 2026-08-20 | — | **239** (`docs/BACKLOG_ARCHIVE.md`) |

Chantiers majeurs de la période, tous re-audités (lus dans l'archive et `git log`, pas recopiés d'un ticket) :
- **W5 au bilan** (2026-08-19) : immeuble locatif (valeur + hypothèque + service de dette) et entreprise privée
  entrent dans `computeRawNetWorth` — c'est le second qui est incomplet (§5.0).
- **Fiscal** : gate FERR ≥ 72 per-conjoint, crédits d'âge/pension dans l'impôt latent, RAP manqué imposé et
  amorti, plafond REER ancré sur la dernière année connue, dons fédéral sur `FED_NONREFUNDABLE_RATE`, RQAP à
  deux phases, FSS/RAMQ en unité commune au journal de décembre.
- **Hydratation et vie privée** : liste blanche des champs textuels dérivée du contrat (incident 2026-09-01,
  deux vagues), mode discret étendu à l'assistant (décision Marc 2026-09-05 : « masquer »), scan alias-aware des
  montants dans `components/`.
- **Gardes structurelles** : ratchet fiscal V2 (inventaire par valeur, anti-fantôme, `projection.ts` au périmètre
  depuis le 2026-09-01), arbitre de contraste sur la palette Tailwind entière, décommenteur unique
  `utils/stripComments.ts`, garde de forme-bilan au grand livre quotidien.
- **Retrait volontaire** : `rankStrategies` et sa garde d'ordre (lot 162, décision Marc) — ce qui rend
  `[ENG-RANKING-ORDER-PIN]` supersédé, pas régressé (§6).

## 3. Statut du lot de juillet (10/10 fermés — preuves)

| Finding 2026-07-16 | Gravité | Fermé | Preuve (archive / code) |
|---|---|---|---|
| `[STORE-REHYDRATE-SILENT]` | CRITIQUE | 2026-07-17 | `onRehydrateStorage` + filet + signal UI ; durci deux fois depuis (liste blanche dérivée du contrat, 2026-09-01) |
| `[DASH-NW-DUP]` | HIGH | 2026-07-17 | repli sans CSV routé sur `computeRawNetWorth` |
| `[INCOME-3WAY-SPLIT]` | HIGH | 2026-07-17 | `buildFinancialSnapshot` sur le revenu réel |
| `[MCP-TOOLS-SILENT-CATCH]` | ÉLEVÉ | 2026-07-21 | 7/7 catch de frontière journalisent |
| `[SYNC-APIKEYS-SILENT]` | MOYEN | 2026-07-21 | échec `saveApiKeys` au pull tracé |
| `[DEBT-SUM-DUP]` | MOYEN | 2026-07-21 | 2 sites restants sur `computeTotalDebt` (source unique — et c'est elle qui porte le nouveau finding §5.2) |
| `[MCP-USERTEXT-LANDMINE]` | MOYEN | 2026-07-21 | `USER_TEXT_KEYS` |
| `[LOG-TOKEN-ANCHORED]` | LOW | 2026-07-21 | motif suffixe ancré |
| `[MCP-RUNPROJECTION-AMBIG]` | LOW | 2026-07-21 | description réécrite |
| `[LINT-4-WARNINGS]` | LOW | 2026-07-16 | réglé dans la PR du rapport |

Aucun des dix n'a de ticket rouvert dans `BACKLOG.md` (vérifié par grep le 2026-09-07).

## 4. Conformité fiscale — `financial-integrity` (verdict : 0 écart de valeur, 8 findings de CLASSE)

~90 constantes recalculées code↔`FISCAL_REFERENCE.md` : **0 écart de valeur**. Gardes automatiques : ratchet V2 +
V1 27 verts, `fiscalFreshness` 13 verts. Les tickets `FISC-*` ouverts sont tous exacts (re-vérifiés :
`FED-CREDITRATE-15`, `RAMQ-COUPLE-CAP` re-mesuré 766/744 inchangé, `DEC-PSV-CLAWBACK-ASSIETTE-TIMING`,
`RQAP-PHASES-70-55`, `REEE-AGE-FERMETURE`, `BANDES-FRERES` 2/3 livrés).

Ce que la passe trouve n'est pas une VALEUR fausse mais des **défauts de classe** (détail §5) :
- **F1 — une phrase juridique non sourcée hérite de l'autorité du document** : « gelé à 15 % … politique C-4 »
  (`utils/tax.ts:184-186`, `FISCAL_REFERENCE.md` §1) est CONTREDITE par la recherche relayée de Marc du 2026-09-05
  (14,5 % / 14 % + crédit compensatoire) et n'est pas marquée CONTESTÉE. Requalifiée dans ce lot (§1 du doc) ; le
  commentaire de code suit au lot de corrections.
- **F2 — gate REER par le ménage** (`taxJanuary.ts:373-374`), money-critical : voir §5.1.
- **F3 — proxy 45 % bonus/RSU/revenu d'appoint** (`activeIncome.ts:186-187`, `* 0.55`) : absent de
  `FISCAL_REFERENCE.md`, et sa clé de ratchet `(activeIncome.ts, 0.55)` FUSIONNE avec le taux AE 55 %. Mesuré
  contre l'impôt incrémental réel de `calculateFiscalReport` sur 10 000 $ (table §5.3) : **l'écart change de
  SIGNE** entre 100 k$ et 150 k$ de revenu de base — la FORME est fausse (facteur plat sur une relation
  progressive), pas seulement la valeur. Documenté en §9 du doc fiscal dans ce lot.
- **F4 — dividendes traités en revenu ordinaire dans l'onglet Impôts** (`services/taxEstimate.ts:33-35`) alors que
  le moteur passe par majoration + CID : deux surfaces, deux chiffres (§5.3).
- **F5** — seuil de récupération PSV indexé à `simInflation` (`taxDecember.ts:83-84`) là où les paliers le sont à
  2 % : nul à 2 %, divergent sinon. Une ligne en §9 du doc fiscal.
- **F6** = `[FISC-RAMQ-COUPLE-CAP]`, inchangé, bloqué source. **F7** — paliers recopiés dans le prompt système
  (`services/claude.ts:140`), exacts aujourd'hui, hors ratchet. **F8** — JSDoc du ratchet périmée
  (`fiscalConstGuardV2.ts:630-636` déclare encore `projection.ts` « trou assumé »).

Réfutés par l'agent puis confirmés réfutés à la lecture : `getMarginalRate` au bord de palier ; plafonds RRQ non
indexés (documenté §9) ; « CID Québec abattu » (faux) ; « double imposition de la retenue REER » (faux) ; et
`monthlyEvents.ts:222,239` `* 0.95` — coût de disposition documenté §8, PAS une erreur de valeur, mais une constante
sans nom dans un module que le ratchet ne scanne pas (`[FISC-GUARD-SCOPE-MONTHLYEVENTS]`).

## 5. Findings de la passe — par gravité (tous CONTRE-VÉRIFIÉS dans le vrai code, chiffres re-mesurés)

### 5.0 🔴 CRITIQUE — `[ENG-W5-BUSINESS-NON-PUBLIE]` : l'entreprise privée est dans le patrimoine, nulle part ailleurs

- `services/projection/netWorth.ts:33,51,68` : `privateBusinessValue` est un terme de `NetWorthParts`, signé `+1`,
  sommé dans `sumNetWorthParts`. `services/projection.ts:232` le calcule (`estimatedValue × ownershipPct`),
  `:523` l'injecte, `:2506` l'inclut dans la succession.
- `services/projection/monthlyOutput.ts:293-301` publie `Immobilier`, `DettesNonImmo`… — **aucun champ pour
  l'entreprise**. `NET_WORTH_DAILY_ASSETS` (`dailyLedger.ts:153-155`) et les `ASSET_KEYS` des trois harnais de
  conservation (`projection.moneyConservation.test.ts:102`, `mcConservation.test.ts:75`,
  `projection.fuzzConservation.test.ts:68`) listent huit actifs — sans elle.
- **Mesuré** (fixture de `w5OffBalance.test.ts`, `estimatedValue: 900 000`, `ownershipPct: 100`, 25 ans) :
  `NetWorth − Σ(8 actifs publiés) + DettesNonImmo` = **900 000 $ exactement** aux mois 0, 12, 120 et 300 ; 0 $ sans
  entreprise (contrôle négatif) ; la clé `Entreprise` n'existe pas dans le point de `chartData` (liste complète des clés
  du point 0 relue).
- Conséquences : (a) tout écran qui décompose le patrimoine par composante montre un total qui ne somme pas ;
  (b) le grand livre quotidien reconstruit le patrimoine depuis `NET_WORTH_DAILY_ASSETS` et ne retrouve la valeur
  qu'à la borne mensuelle — dents de scie `[À vérifier : amplitude mesurée par l'agent seulement]` ; (c) le
  raccord passé→futur fait une marche de la valeur entière, parce que le passé la met à zéro (§5.1).
- Pourquoi les 5 747 tests sont verts : **un invariant de cohérence ne voit pas ce qui est ABSENT**
  (`UN-INVARIANT-NE-VOIT-PAS-CE-QUI-EST-ABSENT`) — et la seule fixture W5 du harnais de conservation pose
  `estimatedValue: 0` (`projection.moneyConservation.test.ts:162`) : la classe est invisible par construction.
- **Correctif** (ne déplace pas un dollar de `NetWorth`) : publier `Entreprise` dans `monthlyOutput`, l'ajouter à
  `NET_WORTH_DAILY_ASSETS`, aux trois `ASSET_KEYS`, au `FIELD_KIND` (stock), et une **garde structurelle** : tout
  terme `+1` de `NET_WORTH_SIGN` a un champ publié dans `chartData` — c'est la garde qui manquait, pas un test de
  plus. Fixture du harnais à `estimatedValue > 0`. Effort M, plan écrit au BACKLOG, **livrable sans décision**.

### 5.1 🟠 ÉLEVÉ

- **`[PAST-NW-BUSINESS-SANS-PRODUCTEUR]`** — `services/history/pastNetWorth.ts:61` accepte
  `privateBusinessValue = 0` par défaut et son seul appelant `buildPastPrefix.ts:154` passe quatre arguments ;
  `dailyPastLedger.ts:333` écrit `privateBusinessValue: 0` en toutes lettres. La JSDoc promet « valeur COURANTE,
  plate sur le passé » : la promesse n'a pas de producteur. Correctif : porter la valeur dans
  `BuildPastPrefixInput` et l'écrire des deux côtés du raccord (même convention = plate). S.
- **`[FISC-RRSP-ROOM-GATE-MENAGE]`** (money-critical) — `taxJanuary.ts:219-226` calcule les droits REER
  **par conjoint** (`roomUsers.reduce`) puis `:373-374` les ferme par `ctx.age`, l'âge du **premier utilisateur
  seul** : `rrspRoomDelta: ctx.age <= 71 ? newRrspRoom : 0`, `rrspRoomReset: ctx.age > 71`. **Mesuré**
  (`processJanuaryReset`, conjoint 2 actif à 120 k$) : 71/56 → **21 600 $** de droits ; **72/57 → 0 $ ET remise à
  zéro** des droits accumulés ; 60/73 → 21 600 $ (le conjoint de 73 ans génère des droits qu'il ne peut plus
  cotiser). Atteignable : l'âge de retraite est saisissable jusqu'à 75 ans (`RetirementSettingsCard.tsx:37`).
  Correctif contenu : appliquer la borne `≤ 71` à CHAQUE `roomUser` dans la réduction, et ne remettre à zéro que
  si TOUS ont dépassé 71. Perturbations : les trois cas ci-dessus. S, money-critical → mesure avant/après sur un
  couple avec écart d'âge (`UN-COUPLE-DU-MEME-AGE-EPINGLE-LE-REGISTRE-PER-CONJOINT`).
- **`[DEBT-BALANCE-NAN-SILENCIEUX]`** — `components/DebtManager.tsx:56-78` (`saveEdit`) n'a que
  `refusOrigineIncoherente`, qui rend `null` pour un non-fini (`DebtKindFields.tsx:44`) : un solde VIDÉ
  (`parseFloat('')` = `NaN`, `:190`) s'enregistre ; `handleAdd` (`:41-50`) refuse `balance` mais pas
  `interestRate`/`minimumPayment` (`:155-159`). Puis `services/portfolio.ts:216-219` (`computeTotalDebt`)
  rabat le `NaN` sur 0 **sans trace**, alors que ses deux voisins (`assetValueCad`, `computeCurrentLiquidity`)
  passent par `logErrorThrottled` (`PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`). Cinq consommateurs : « Total dû »,
  `FutureHistorySection`, `portfolio.ts:236` (patrimoine), `financialSnapshot.ts` (prompt IA), `healthScore.ts`.
  Le test `projection.moneyConservation.test.ts:519-521` **certifie** le silence (`toBe(0)`, aucune assertion de
  trace). **Mesuré** en rendu : un taux `NaN` fait afficher « Liberté dans **0,1 ans** » (contre 1,3 ans pour la
  même dette à 20 %) — la simulation locale (`:85-111`) s'arrête au premier mois parce que `NaN > 0` est faux.
  Correctif : (a) `logErrorThrottled` dans `computeTotalDebt` ; (b) refus UI d'un champ non fini à l'ajout ET à
  l'édition ; (c) test inversé (le `NaN` est TRACÉ) ; (d) « — » quand la simulation n'est pas finie. S.
- **`[AI-PRIVACY-CONSEILS-NON-GATES]`** — la décision Marc du 2026-09-05 (« masquer : en mode discret, les montants
  ne partent pas non plus vers l'assistant ») est appliquée au chat (`useAiChat.ts:171`), au diagnostic Budget
  (`BudgetAiModal.tsx:99`) et aux cartes de signaux — **pas** aux trois cartes de conseil :
  `CoupleOptimizationCard.tsx:90` (brut/net des deux conjoints, `claude.ts:798-800`),
  `RealEstateAdviceCard.tsx:41` (prix, mise de fonds, mensualité, loyer, `claude.ts:719-724`) et le
  rééquilibrage d'`Investments.tsx:1071` (`Δ` en dollars, `claude.ts:888`) — 0 lecture de `isPrivacyMode` dans
  les deux cartes. Cause structurelle : `amountPrivacyScan.test.ts:82` ne scanne que `components/`, et
  `promptCad` vit dans `services/claude.ts`. Correctif : même paire de gardes que `budgetAiModalModeDiscret`
  (égress au service + ouvreur avec message), trois fois. S, **extension d'une décision prise**, sans décision.
- **`[AI-STOPREASON-JETE]`** — `services/claude.ts` ne lit `stop_reason` nulle part (seul `agentLoop.ts:289-301`
  le fait). `analyzeBankStatement` (non-stream, `max_tokens` 16 000) tronqué → JSON invalide → `[]` →
  `ImportBankStatement.tsx:64` « Aucune transaction reconnue » : **faux**, le relevé a été lu et coupé.
  Correctif : lire `response.stop_reason` aux deux appels Vision et rendre une cause `tronque` avec son message.
  S.

### 5.2 🟡 MOYEN

- **`[TAXESTIMATE-DIVIDENDES-ORDINAIRES]`** — `services/taxEstimate.ts:33-35` estime les dividendes
  (2 % du non-enregistré) puis les impose comme du revenu ordinaire dans l'onglet Impôts et
  `get_tax_situation`. **Mesuré** sur 10 000 $ de dividendes déterminés : traitement ordinaire **2 569 / 3 678 /
  5 047 $** contre majoration + CID progressif **200 / 1 895 / 3 727 $** (bases 40 k / 100 k / 250 k$) —
  surestimation de 2 369 à 1 320 $. Conservateur, mais deux surfaces donnent deux chiffres. S.
- **`[FISC-PROXY-45-BONUS-RSU-NON-DOCUMENTE]`** — table mesurée (impôt incrémental réel sur 10 000 $ de plus,
  `calculateFiscalReport(base+10 000) − calculateFiscalReport(base)`, 2026, salaire seul) :

  | Revenu de base | Impôt incrémental réel | Proxy 45 % | Écart (proxy − réel) |
  |---|---|---|---|
  | 40 000 $ | 2 569 $ (25,7 %) | 4 500 $ | **+1 931 $** (sur-imposé) |
  | 60 000 $ | 3 612 $ (36,1 %) | 4 500 $ | +888 $ |
  | 100 000 $ | 3 678 $ (36,8 %) | 4 500 $ | +822 $ |
  | 150 000 $ | 4 746 $ (47,5 %) | 4 500 $ | **−246 $** (sous-imposé) |
  | 250 000 $ | 5 047 $ (50,5 %) | 4 500 $ | −547 $ |

  Le proxy est hors assiette de décembre et hors registres (`totalTaxesPaid` sous-compte cette part). Doc §9
  livrée dans ce lot ; reste la scission de la clé de ratchet et, si Marc le veut un jour, le passage par
  l'assiette réelle (plan-first : déplace de l'argent).
- **`[AITOOLS-DISPATCH-ERR-NON-SCRUB]`** — `services/aiTools/dispatch.ts:48` renvoie `err.message` brut au
  modèle ; `agentLoop.ts:152` scrubbe déjà (`sanitizePromptText(…, 300)`). XS.
- **`[AI-VISION-SANS-ANNULATION]`** (`makeTimeoutSignal(undefined, 90_000)`, aucun `signal` en paramètre, pas de
  bouton Annuler) et **`[AI-CONSEILS-SANS-ANNULATION]`** (trois cartes, 25 s). S / XS.
- **`[MCP-FIREAGE-DUP]`** — `mcp/tools/getRetirementOutlook.spec.ts:24-26` recopie `fireAgeOf` de
  `mcp/whatIf.ts:514-517` (déjà importé par deux autres specs). XS.
- **`[FISC-GUARD-SCOPE-MONTHLYEVENTS]`** — `monthlyEvents.ts:222,239` `* 0.95` sans nom, module ni dans
  `FISCAL_MODULES` ni dans `HORS_PERIMETRE`. XS : constante nommée + périmètre + entrée d'inventaire.
- **`[TEST-GAP-LIFETIMETAX]`** — `services/projection/lifetimeTax.ts` (35 lignes) sans test direct, consommé
  par le classement de stratégies. XS.
- **`[BUDGET-CATEGORY-INCOME-SIGN-GARDE-PERDUE]`** — le correctif #749 tient (`utils/budget.ts` via
  `spendAmountOf`), mais ses tests vivaient dans `PlanningGoals.test.tsx`/`monthlyActuals.test.ts`, supprimés
  avec les Objectifs (lot 29, #755) : l'agrégation d'un CRÉDIT n'est plus assertée nulle part. XS : un cas dans
  `tests/utils/budget.test.ts`.
- **Q15 (décision Marc, `docs/A_FAIRE_MOI.md`)** — `categorizeBatch` et `detectSubscriptionsAI` envoient les
  montants des transactions en mode discret : ce sont des fonctions cœur déclenchées par l'import, pas des
  conseils. Masquer, bloquer, ou laisser passer avec bannière ? Routé, pas tranché.

### 5.3 🟢 FAIBLE

- F5 (indexation PSV, ligne §9 livrée), F7 (`claude.ts:140` paliers recopiés → dériver de `bracketsForYear()`
  ou déclarer), F8 (`fiscalConstGuardV2.ts:630-636` JSDoc périmée).
- `[FMT-COMPACT-AXE-A-LA-MAIN]` — 5 axes `${(v/1000).toFixed(0)}k` sans `$` (`ChildPlanning.tsx:477,561`,
  `MultiPropertyComparison.tsx:107`, `DrillDownCompte.tsx:212`, `FutureProjection.tsx:1804`), invisibles à
  `formatMonetaireSourceUnique` (motif exige `$`) ; mode discret OK (`maskedTick`). Possible choix d'axe court
  (largeur 50 px) → membre déviant à juger avant de migrer.
- `[KNIP-PAIRETEXTE-EXPORT]` — `scripts/lib/ctaContrast.ts:180` `PaireTexte` exporté sans consommateur
  (lot 208 de moi ; c'est la seule régression des 239, §6). XS.
- `_history` paramètre mort de `categorizeBatch` (`claude.ts:407`) ; `ImportBrokerPositions.tsx:46` et
  `BackupPanel.tsx:152,184,210` : `catch` → message sans `logError`. XS.
- a11y : `PageSetupGate.tsx:284` « ou importer » et `FutureProjection.tsx:1651` (indice survol/molette) en
  `text-tiny text-ink-500` — `ink-500` mesure 3,86 à 4,33 (AA-large seulement), `ink-400` 5,90 à 6,62 ;
  `HealthIndicator.tsx:136` : donut `<svg>` sans `aria-hidden` (le score est déjà en texte). XS ×3.
- God-files re-mesurés : `FutureProjection.tsx` 2 207 (ticket : 2 026), `Investments.tsx` 1 533 (1 440),
  `Budget.tsx` 1 569 (1 413) — mesures des trois tickets rafraîchies dans ce lot. `projection.ts` 2 806 et
  `taxDecember.ts` 1 151 sans ticket : **délibérément** — money-critical, on ne découpe pas pour la taille.
- Docs : `README.md` (« 54 sous-modules », « 4 897 tests, 460 fichiers »), `ARCHITECTURE.md` et `PROJECTION.md`
  (« 2 228 lignes », « 50 sous-modules ») périmés → corrigés dans ce lot.

### 5.4 Findings RÉFUTÉS / nuancés (conservés pour transparence)

- « `UN-ETAT-SEME` re-commis sur divorce + achat » : résiduels identiques (−12 980 $ au mois d'achat) avec et
  sans divorce — c'est la limite documentée de la forme-FLUX à l'achat, pas une fuite.
- « Vision sans mode discret = fuite » : l'analyse d'une paie ou d'un relevé est un consentement explicite par
  action (Loi 25) — non-bug, décision produit existante.
- « `safeJsonValidate` trop tolérant » : tolérance DÉLIBÉRÉE (`[BUDGET-AI-DUP-PARSING]`), ne pas la retirer.
- « 332 boutons sans nom accessible » : 5 après filtrage des faux positifs, 0 après lecture (labels dynamiques,
  `aria-label` par prop).
- « `finance.ts`, caches `marketData`, `sync/*`, `mcp` safeParse avalent des erreurs » : chaque site relu —
  repli LÉGITIME documenté ou erreur déjà journalisée en amont.
- « Le ticket `[VISION-NO-RETRY]` est toujours ouvert » : fermé au lot 209, mesuré sur le vrai SDK.

## 6. Vérification des 239 corrections archivées depuis le 2026-08-20

Quatre agents ont rejoué, par groupe de 60 entrées, le test ou la garde de chaque entrée de
`docs/BACKLOG_ARCHIVE.md` et relu le site corrigé : **327 fichiers de test rejoués, 3 610 tests verts, 0 rouge**.

| Verdict | Nombre | Détail |
|---|---|---|
| ✅ en place, garde verte | **233** | — |
| ❌ régressé | **1** | `[KNIP-UNUSED-EXPORTS-73]` : `PaireTexte` ré-exporté sans consommateur au lot 208 (mineur, XS) |
| 🧟 garde disparue, correctif présent | **2** | `[ENG-RANKING-ORDER-PIN]` (lot 116) : garde ET module retirés VOLONTAIREMENT au lot 162 (#893, décision Marc) — **supersession**, notée dans l'archive ; `[BUDGET-CATEGORY-INCOME-SIGN]` (#749) : correctif intact, tests partis avec les Objectifs (lot 29) → `[BUDGET-CATEGORY-INCOME-SIGN-GARDE-PERDUE]` |
| ⚠️ non contrôlable par nature | **3** | 2 fermetures par décision produit (lot 177, `[T3]` mesure de couverture) ; 1 spec Playwright (`[E2E-PINCH-ZOOM-FLAKE]`, correctif présent, non exécutée ici) |

Nuances relevées sans régression : chemins déplacés (`_hydrationStatus` → `store/optionsPersistance.ts`,
`verifierEntreesMoteur` → `services/projection/`, `applyBankStatement` → `mcp/ingest/applyDocument/`),
`[REBALANCE-SILENT-FAIL]` remplacé par l'union `forme` (défaut fermé), `projection.ts` entré dans
`FISCAL_MODULES` le 2026-09-01, `Workspace` 662 lignes (661 annoncé).

## 7. Conservation de l'argent — `projection-validator` (empirique)

**Verdict : la simulation CONSERVE l'argent** sur tout ce qu'elle PUBLIE. 50 runs, plus de 15 000 points
(épargnants, couples avec enfants et objectifs, retraités ample/modeste/épuisé/insolvable, immigrant, immobilier +
Smith, locatif, dettes multiples, meltdown, inflation 0 à 7 %, krach, décès, divorce) :
- forme-bilan `ΔNW == ΔΣactifs − ΔΣdettes` : résiduel max **0,02 $** ;
- **0** valeur non finie ; symétrie per-conjoint **0,00 $** (contrôle non vacant : écart d'âge → écart attendu) ;
- `totalTaxesPaid == Σ FluxImpots` ; identité de pension à 0,01 $ ; `estateNetWorth` monotone sur 36 horizons ;
- hypothèque jamais double-comptée ; robustesse aux entrées extrêmes.

SAUF ce que le moteur ne publie pas (§5.0) : la forme-bilan est verte PARCE QUE l'entreprise est absente des deux
côtés de l'identité — c'est exactement la leçon inscrite dans `w5OffBalance.test.ts` en août, à moitié appliquée.
Limites assumées de la forme-FLUX (documentées, non-bugs) : principal des minimums de dette, appréciation
immobilière, mois d'achat immobilier.

## 8. Sécurité et vie privée — `security-privacy` (0 CRITIQUE / 0 ÉLEVÉ, 0 vulnérabilité sur 574 paquets)

Vérifié positivement : coffre AES-256-GCM à clé non extractible ; clés API exclues de `localStorage`
(`store/optionsPersistance.ts:83-93`), des backups (`syncSnapshot.ts:41-50`, `BackupPanel.tsx:123,145`) ;
PBKDF2 600 000 itérations ; anti-injection `promptSafety.ts` sur toutes les surfaces ; mode discret bloqué à la
source pour le chat et le Budget (mais voir §5.1) ; CSP `connect-src` couvrant tous les `fetch` ; relais BYOK
(`api/_lib/relay.ts`, URL amont fixe, allowlist de modèles, `max_tokens` borné) ; MCP `timingSafeEqual` +
`no-store` ; aucun secret dans l'historique git ; `errorLogger` scrubbe montants et secrets. Informatif :
`dangerouslyAllowBrowser` ×2 (dette connue), clé Drive dérivée du `sub` Google (ADR assumé).

## 9. Scorecard comparatif

| Axe | 2026-06-17 | 2026-06-23 | 2026-07-16 | **2026-09-07** |
|---|---|---|---|---|
| Conformité fiscale (valeurs) | A+ | A+ | A+ | **A+** (0 écart / ~90 recalculées ; 8 défauts de CLASSE, 0 de valeur) |
| Conservation moteur (empirique) | A+ | A+ | A+ | **A** ← verte sur le publié, mais un actif NON publié (W5.7) |
| Source unique NW/revenu (moteur↔UI/IA/MCP) | A− | A | B | **B+** ← 1 identité fausse par omission, 1 estimation à part (`taxEstimate`) |
| Traçabilité des échecs ($) | A− | B+ | B+ | **B+** ← `computeTotalDebt` muet, `stop_reason` jeté |
| Vie privée (décision « masquer ») | — | — | — | **B** ← 3 surfaces de conseil hors de la décision du 2026-09-05 |
| Sécurité | A | A− | A | **A** (0 finding, 0 vuln) |
| Couverture tests moteur | A− | A− | A+ (41/41) | **A** (56/57 — `lifetimeTax.ts` indirect seulement) |
| Santé déterministe (typecheck/tests/build/deps) | — | — | A | **A+** (5 747/5 747, 0 vuln, lint 0, gate vert) |
| Tenue des corrections (nouveau) | — | — | — | **A** (233/239, 1 régression mineure) |
| Dette god-files UI | — | — | B | **B** (+9 % / +6,5 % / +11 % depuis les tickets) |

## 10. Recommandations (routées au BACKLOG, ordre proposé)

Marc a demandé de « faire tout ce que je peux seul » : les lots ci-dessous sont classés par ce qu'ils exigent.

1. **Sans décision, ne déplace pas d'argent** (lot 213, XS/S groupés) : `[AI-PRIVACY-CONSEILS-NON-GATES]` ×3,
   `[AI-STOPREASON-JETE]`, `[DEBT-BALANCE-NAN-SILENCIEUX]`, `[AITOOLS-DISPATCH-ERR-NON-SCRUB]`,
   `[FISC-GUARD-SCOPE-MONTHLYEVENTS]`, `[MCP-FIREAGE-DUP]`, `[TEST-GAP-LIFETIMETAX]`,
   `[BUDGET-CATEGORY-INCOME-SIGN-GARDE-PERDUE]`, `[KNIP-PAIRETEXTE-EXPORT]`, F7/F8, `_history`, `logError` ×2,
   a11y ×3, commentaire `utils/tax.ts` (F1).
2. **Sans décision, change ce que l'écran MONTRE mais pas `NetWorth`** (lot 214, M) :
   `[ENG-W5-BUSINESS-NON-PUBLIE]` + `[PAST-NW-BUSINESS-SANS-PRODUCTEUR]` + `[HARNAIS-CONSERVATION-W5-VIDE]`, avec
   la garde structurelle sur `NET_WORTH_SIGN`.
3. **Money-critical contenu, mesuré, sans décision produit** (lot 215, S) : `[FISC-RRSP-ROOM-GATE-MENAGE]` —
   mesure avant/après sur un couple à écart d'âge, goldens à relire un par un (pas re-baser).
4. **Décision Marc** : Q15 (fonctions cœur en mode discret) ; `[TAXESTIMATE-DIVIDENDES-ORDINAIRES]` (deux surfaces
   à aligner — sur quoi ?) ; `[FISC-PROXY-45…]` volet assiette (déplace de l'argent) ; `[FMT-COMPACT-AXE-A-LA-MAIN]`
   (membre déviant possible) ; `[AI-*-SANS-ANNULATION]` (UX).

## 11. Verdict

Le moteur qui calcule l'argent est **sain, prouvé, et ses corrections tiennent** (233/239, 10/10 de juillet).
Le CRITIQUE de cette passe n'est pas un calcul faux : c'est un actif exact **que personne ne voit** — le patrimoine
est juste, sa décomposition ment, et c'est indétectable par tout invariant de cohérence. Le second finding
d'argent (droits REER fermés par l'âge du premier conjoint) est la classe « valeur per-conjoint gardée par une
grandeur de ménage », déjà payée sur le FERR en août. Les deux sont contenus et livrables seuls. Le reste est de
la périphérie disciplinée : une décision de vie privée à étendre, deux silences à faire parler, et de la dette de
gardes.

## Annexe — reproduction des mesures (toutes relançables)

- W5 : fixture `params()` de `tests/services/w5OffBalance.test.ts` avec `privateBusinesses: [{ estimatedValue:
  900_000, ownershipPct: 100, retainedEarnings: 0 }]` ; `NetWorth − Σ(Liquidites, CELI, CELIAPP, REER, REEE,
  NonReg, Crypto, Immobilier) + DettesNonImmo` aux indices 0, 12, 120, 300 → 900 000 ; sans entreprise → 0.
- F2 : `processJanuaryReset(0, ctx, helpers)` avec le `baseCtx` de `tests/services/taxJanuary.test.ts`,
  `activeUsersCount: 2`, `accGrossIncomeYearByUser: [0, 120000]`, `reerByUser: [50000, 50000]`, âges
  (`ctx.age`, `users[].birthYear`) 71/56, 72/57, 60/73 → `rrspRoomDelta` 21 600 / 0 / 21 600, `rrspRoomReset`
  false / true / false.
- F3 : `calculateFiscalReport(base + 10000, 0, 0).totalTax − calculateFiscalReport(base, 0, 0).totalTax`
  pour base ∈ {40, 60, 100, 150, 250} k$ (année par défaut 2026).
- F4 : idem pour la voie ordinaire ; voie moteur `calculateDividendTax(10000, getMarginalRate(base, 2026),
  'eligible', progressif)` avec `progressif = report(base + 13 800) − report(base)`.
- DebtManager : `render(<DebtManager debts={[{ balance: 5000, interestRate: NaN, minimumPayment: 200 }]} />)`
  → « Liberté dans 0,1 ans » ; `interestRate: 20` → 1,3 ans.
