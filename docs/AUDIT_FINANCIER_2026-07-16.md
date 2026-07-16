# 🔬 AUDIT FINANCIER COMPLET — FinanceAI (passe 2026-07-16)

> **Passe récurrente n°2** (précédente : [`AUDIT_FINANCIER_2026-06-17.md`](./AUDIT_FINANCIER_2026-06-17.md), complément 2026-06-23).
> **Commit audité** : `main@9e6b1a6`. **Méthodologie inchangée** — panel adversarial 5 agents (chacun briefé
> pour RÉFUTER), trust-but-verify sur chaque finding (relecture du vrai code avant inscription), arbitre =
> forme-bilan `ΔNW == ΔΣactifs − ΔΣdettes`. Le détail pédagogique (cascade de décaissement, 9 phases,
> reconstruction NW, discipline du faux positif, diagrammes) vit dans le rapport de juin, §2-7 — il reste
> exact et n'est pas dupliqué ici.

---

## 1. Résumé exécutif

**Verdict global : le CŒUR financier reste AAA** — fiscalité 100 % conforme (0 écart sur ~180 valeurs),
conservation de l'argent prouvée empiriquement (voir §4), couverture de tests moteur au plafond (41/41
sous-modules). **Le lot de findings de juin est fermé à 12/14.** MAIS la passe trouve :

- **1 CRITIQUE inédit** (hors périmètre des passes précédentes) : la **réhydratation du store Zustand n'a
  aucun filet d'erreur** — un blob localStorage corrompu ou une migration qui lève = app vierge au boot,
  **sans aucune trace** (ni log, ni console). Même classe de gravité que l'incident SYNC-ANTI-CLOBBER
  (230 k$), côté hydratation locale. Le « filet ultime » de `syncPull` est du code mort pour ce scénario
  (la promesse de `rehydrate()` ne rejette jamais — vérifié dans les internes zustand).
- **2 HIGH récidivants de la classe n°1** (« un consommateur recalcule au lieu de lire la source unique ») :
  le KPI « Valeur Nette Globale » du Dashboard (repli sans CSV = dettes JAMAIS soustraites) et le revenu
  envoyé à l'IA/MCP (salaire d'onboarding, alors que Budget affiche le revenu réel depuis BUDGET-INCOME-REAL).
- Une poignée de MEDIUM/LOW de durcissement (détail §5).

La leçon structurante de juin se confirme : **les bugs d'argent ne naissent plus dans le moteur — ils
naissent dans les surfaces qui le contournent.** Les deux HIGH de cette passe sont nés dans des god-files UI
en croissance rapide (+13 à +31 % en 3 semaines) pendant que le cœur moteur restait plat (+1 %).

## 2. Ce qui a changé depuis la passe de juin (périmètre du delta)

Chantiers majeurs livrés entre les deux passes, tous re-audités par cette passe :
- **Fiscal** : base d'impôt élargie au revenu de placement (TAX-AVGRATE-BASE), `calculateFiscalReport(...,
  employmentIncome?)`, détail des retenues per-user (TAX-DETAIL), crédit-don plafonné (FA-6), ligne 361 QC
  corrigée (TP1G-VIVANT-SEUL), FERR/PSV/RRQ per-conjoint + roulement au décès (ITEM-2C).
- **Revenu réel** : `computeIncomeBreakdown`/`INCOME_CATEGORIES` (BUDGET-INCOME-REAL), chaîne paie→Impôt
  (INCOME-PROVENANCE/TAX-DETAIL).
- **Sync** : scission `syncOrchestrator` en 9 modules (ARCH-SYNC-SPLIT), timeout corps (SYNC-FETCH-TIMEOUT),
  anti-clobber strict, jeton Drive persistant + renouvellement + propagation cross-onglet (AUTH-DRIVE-PERSIST).
- **Projection** : persistance de la révélation + gel « pas à jour » (PROJECTION-PERSIST).
- **MCP** : OCC écritures (MCP-WRITE-VERSION-TOKEN), scrub anti-injection par allowlist (MCP-PROMPT-SCRUB),
  apply_payslip/apply_debt, get_holdings.

## 3. Conformité fiscale — `financial-integrity` (verdict : 0 écart)

~180 valeurs/logiques auditées code↔`FISCAL_REFERENCE.md` : **100 % conformes, 0 non-sourcée, 0 périmée.**
Domaines couverts : paliers féd/QC 2026, BPA, abattement, RRQ v1+v2/MGA/MGAS, AE/RQAP, gains 50 %,
dividendes (gross-up/CID), retenues REER QC, crédits 65+/ligne 361 (seuil UNIQUE 42 955 $ — le bug TP1G des
seuils empruntés à la ligne 462 est bien mort), RAMQ/FSS, SRG, report/anticipation RRQ/PSV + bonus 75+,
clawback PSV, prorata RRQ 39 ans/PSV 10-40, FERR (facteurs, gate ≥72), CELI/REER/CELIAPP/RAP/REEE,
taxe de bienvenue (MTL 8 tranches + reste-QC), OSFI B-20, SCHL, TPS/TVQ neuf, crédit dons plafonné.

Les 4 chemins fiscaux modifiés depuis juin sont conformes ; notamment `averageRatePct`/`netIncome`
(assiette commune salaire+placement, `taxableInvestmentIncome` exposé → reconstructible) et
`employmentIncome?` (défaut-neutre, rétrocompat bit-identique des ~15 appelants moteur).
Gardes automatiques verts : `fiscalFreshness` 13/13, `fiscalConstants.guard` 10/10.
Limites assumées inchangées (FSS indexé au-delà du gel, marche SRG, BPA dégressif, majoration don
top-bracket) — documentées au doc §5/§6/§1/§10, non-bugs.

## 4. Conservation de l'argent — `projection-validator` (empirique)

**Verdict : la simulation CONSERVE l'argent — rien n'a pu être réfuté.** 31 scénarios exécutés
(épargnants, couples+enfants, retraités ample/modeste/épuisé/insolvable, immigrant, immobilier+Smith,
achat/vente, locatif à perte, vente quasi-underwater, multi-dettes, krach −40 %, dette NaN, perte d'emploi,
inflation 0/2/7 %, don/véhicule/assurance/héritage, écart d'âge 55/40, survivant) :

- **Reconstructabilité** `NW == Σactifs − DettesNonImmo` à CHAQUE mois : résiduel max **0,02 $**
  (cumul d'arrondi au cent — très en-deçà d'une vraie fuite).
- **Symétrie per-conjoint** `f([a,b])==f([b,a])` : diff **0,000000** (contrôle non-vacant : âges
  différents → 164 k$ d'écart attendu).
- **Survivant/décès** : aucun flux fiscal fantôme post-décès (roulement REER correct ; `surv < base`
  sur impôts ET NW final).
- **NaN/Infinity** : aucun point non-fini, y compris dette NaN injectée (normalisée + journalisée) ;
  aucun actif fantôme négatif (tout découvert porté en `LiquidDebt` visible) ; hypothèque jamais
  double-comptée sur les 9 scénarios immobiliers.
- Suites de garde : `moneyConservation` 20/20, `fuzzConservation` 3/3, `survivor` 5/5 ; suite complète
  **2661/2661**.

Note de périmètre (assumée) : la conservation prouve qu'aucun argent ne se crée/détruit sans cause
visible ; l'exactitude des magnitudes fiscales ponctuelles relève de l'axe fiscal (§3) — les deux axes
sont verts sur cette passe.

## 5. Findings de la passe — par gravité (tous CONTRE-VÉRIFIÉS dans le vrai code)

### 5.0 CRITIQUE — `[STORE-REHYDRATE-SILENT]` : réhydratation Zustand sans filet

`store/useFinanceStore.ts` (config `persist`, ~l.579) + `migratePersistedState` (~l.356).
- Aucun `onRehydrateStorage` fourni ; `migratePersistedState` non protégé ; le `getItem` de
  `createJSONStorage` parse sans try/catch.
- Vérifié dans `node_modules/zustand/esm/middleware.mjs` : sur erreur (parse OU migration), le `.catch`
  interne de zustand jette l'erreur si `onRehydrateStorage` est absent → **le store reste sur l'état
  initial** : app vierge, zéro trace (ni `logError`, ni console).
- Le « filet ultime » `services/sync/syncPull.ts:88-94` (`catch` → reload) est **du code mort** pour ce
  scénario : `persist.rehydrate()` ne rejette jamais (l'erreur est avalée en amont).
- **Scénario concret** : localStorage tronqué par un crash navigateur, blob v≤6 avec un `assets` malformé →
  au boot, tout paraît perdu (transactions, actifs, budgets, dettes), indiscernable d'un premier lancement.
  Les données SONT encore dans le blob (et dans Drive/backups) mais l'utilisateur ne le sait pas — risque de
  sur-réaction (réonboarding par-dessus, pull Drive destructeur…).
- **Fix (S)** : `onRehydrateStorage` → `logError(critical)` sur erreur + try/catch par palier dans
  `migratePersistedState` (diagnostiquer QUEL palier casse) + signal UI honnête (bannière « données non
  chargées — ne rien saisir, restaurer un backup »). → BACKLOG `[STORE-REHYDRATE-SILENT]`.

### 5.1 HIGH — `[DASH-NW-DUP]` : le KPI le plus visible contourne la source unique

`components/Dashboard.tsx:155-337` — « Valeur Nette Globale » (haut du Dashboard) n'importe ni
`computePresentNetWorth` ni `useDerivedFinancials` :
- **Repli sans CSV d'historique (l.160-175) : `Total = cash + portefeuille` — dettes JAMAIS soustraites**
  (vérifié). Pour un utilisateur endetté sans CSV, le patrimoine affiché est gonflé du montant de la dette
  (~50 k$ dans le cas réel). C'est le pattern MONEY-PHANTOM/H1 fermé en juin dans `useDerivedFinancials`,
  réapparu dans un chemin non couvert par ce fix.
- Chemin principal : dette sommée sans garde `Number.isFinite` (l.270) — classe NAN-INPUT-HARDENING rouverte ici.
- **Nuance conservée (pas un bug en soi)** : l'inclusion de l'équité immo dans la série historique suit la
  convention du MOTEUR (`chartData` inclut l'immo ; `computePresentNetWorth` l'exclut par design — leçon
  NW-PARITY-INVARIANT). C'est un PÉRIMÈTRE différent de celui des surfaces IA — à étiqueter, pas à « corriger »
  aveuglément. → BACKLOG `[DASH-NW-DUP]` (fix M : router le repli + garde ; étiqueter le périmètre immo ;
  livrer enfin le test de parité « NW unique » recommandé en juin, qui aurait attrapé ce finding).

### 5.2 HIGH — `[INCOME-3WAY-SPLIT]` : l'IA/MCP raisonne encore sur le salaire d'onboarding

`services/financialSnapshot.ts:90` (→ MCP `get_financial_overview` + contexte IA `claude.ts:441`) et
`components/sidebar/NextBestAction.tsx:112` (widget permanent) calculent `monthlyIncome = Σ netSalary`
(config d'onboarding) — alors que Budget affiche le revenu RÉEL (transactions) depuis BUDGET-INCOME-REAL.
C'est l'angle mort nommé par la leçon elle-même (« un payload IA resté sur le salaire config fait raisonner
l'IA sur un chiffre que l'utilisateur ne voit plus ») : le fix du 16 juillet a couvert `Budget.tsx`
(payload du diagnostic Budget) mais PAS ces deux surfaces. → BACKLOG `[INCOME-3WAY-SPLIT]` (fix S-M :
router sur `computeMonthlyActualAverages`/`computeIncomeBreakdown` avec repli étiqueté « salaire déclaré »
quand il n'y a pas de transactions — le pattern déjà appliqué par `TaxCenter`/`HealthIndicator`).

### 5.3 ÉLEVÉ — `[MCP-TOOLS-SILENT-CATCH]` : la frontière d'erreur MCP ne journalise jamais

`mcp/tools/_dataAware.ts` (`withState`) + `mcp/tools/_writeHelper.ts` (`runApply`) + `applyPayslip.tool.ts` :
les 4 `catch` convertissent l'erreur en texte pour Claude mais n'appellent JAMAIS `logError` — un bug de
calcul dans `get_tax_situation`/`get_projection` devient introuvable côté serveur (Cloud Run muet), le seul
signal étant une phrase que Claude peut paraphraser. Incohérent avec `driveStateSource.ts` (même dossier,
bien instrumenté « JAMAIS muet »). → BACKLOG `[MCP-TOOLS-SILENT-CATCH]` (fix S).

### 5.4 MOYEN

- `[SYNC-APIKEYS-SILENT]` `services/sync/syncPull.ts:55-60` : échec de `saveApiKeys` (coffre indispo) avalé
  sans trace → clés restaurées EN MÉMOIRE seulement, disparaissent au reload sans explication. Asymétrique
  avec le chemin voisin (l.153-164) qui journalise. Fix S (logError symétrique).
- `[DEBT-SUM-DUP]` 4 sites (`NextBestAction:109`, `HealthIndicator:108`, `Dashboard:270`, `DebtManager:73`)
  réimplémentent `computeTotalDebt` sans garde `isFinite`. Risque d'atteignabilité faible, DRY pur. Fix S groupé.
- `[MCP-USERTEXT-LANDMINE]` `mcp/tools/_dataAware.ts` : l'allowlist `USER_TEXT_KEYS` ne couvre pas
  `notes`/`insurer`/`beneficiary`/`destination` — champs LIBRES utilisateur (`DocumentMeta.notes`,
  `InsurancePolicy.*`, `TravelGoal.*`) qu'AUCUN tool n'expose encore (exploitabilité NULLE aujourd'hui,
  vérifié par grep), mais un futur tool « résume mes assurances » hériterait du trou. Fix S préventif :
  distinguer structurellement notes code-auteur (renommer `verdict`/`advisory`) vs notes utilisateur, OU
  ajouter ces clés à l'allowlist (les `notes` code-auteur actuelles, courtes, survivent au scrub — à
  valider par test).

### 5.5 LOW

- `[LOG-TOKEN-ANCHORED]` `services/errorLogger.ts:76` : le scrub matche `token` mais pas `accessToken`
  (ancré). Aucun appelant ne logue de token aujourd'hui (vérifié) ; durcissement préventif, pattern déjà
  appliqué aux clés financières (SEC-LOG-DEBT-REGEX).
- `[MCP-RUNPROJECTION-AMBIG]` : `run_projection` (calculateur générique Sprint 1, ne lit PAS l'état) porte
  un nom qui peut aiguiller le LLM vers la formule simplifiée au lieu du vrai moteur — clarifier la
  description (XS).
- `[LINT-4-WARNINGS]` : 3 locales mortes `services/financialSnapshot.ts:82-84` + import `within` orphelin
  `tests/components/Budget.test.tsx:2` (hygiène, 0 erreur).
- `console.error` au lieu de `logError` dans `mcp/state/stateStore.ts:56` (PERSONA-PURGE compteurs —
  visible en logs Cloud Run, pas un masquage ; cohérence de convention).

### 5.6 Findings RÉFUTÉS / nuancés par la contre-vérification (conservés pour transparence)

- « Le Dashboard diverge du périmètre NW » : l'inclusion immo dans la série HISTORIQUE suit la convention
  moteur (chartData inclut l'immo) — le vrai bug est le REPLI sans dettes + l'absence d'étiquette, pas
  l'inclusion immo elle-même.
- `Math.max(0, realDeficit)` (Budget donut) : PAS un masquage — le déficit est explicitement affiché sous
  le graphe (« Déficit réel de X$ ») ; pattern exemplaire.
- `finnhub num()` permissif : ne s'applique qu'à des champs secondaires ; le prix réel est strictement
  gardé. Non-bug.

## 6. Statut du lot de juin (12/14 fermés — preuves)

| Finding juin | Statut | Preuve |
|---|---|---|
| H1 NW présent sans dettes | ✅ fermé | `useDerivedFinancials.ts:28-31` → `computePresentNetWorth` |
| H2 AiAssistant FX en dur | ✅ fermé | `AiAssistant.tsx:78-82` → source unique |
| SEC-1 LLM sans anti-injection | ✅ fermé | `claude.ts:608-621` sanitize+wrap |
| M1 retenue REER ×0,15 | ✅ fermé | `projection.ts:1436` `withholdingForGrossRRSP` |
| M2 dividende 30 % dupliqué | ✅ fermé | constante partagée `helpers.ts:15` |
| M3 inclusion gains en dur | ✅ fermé | `CAPITAL_GAINS_INCLUSION_STANDARD` |
| M4 TaxBracketViz sans crédits | ✅ fermé | route `calculateFiscalReport` |
| TC-FX-HARDCODE | ✅ fermé | `TaxCenter.tsx:149-159` → `fxRates` |
| SEC-PRIVACY-BLUR-INPUTS | ✅ fermé | `privacy-blur` retiré |
| SEC-PBKDF2-DRIVE 100k | ✅ fermé | `keyCipher.ts:27` = 600 000 |
| SEC-LOG-DEBT-REGEX | ✅ fermé | regex substring |
| NAN-INPUT-HARDENING (7 sites) | ✅ fermé | 7/7 gardés (— rouvert AILLEURS : cf DASH-NW-DUP/DEBT-SUM-DUP) |
| M5-INV1-EXTEND (INV-1 hypothèque) | ⚠️ inchangé | INV-9 couvre déjà ; nuance doc, assumé |
| W5-TAX-PROXY (locatif/CCPC) | ⏸ ouvert assumé | proxys étiquetés, décision Marc de garder |

## 7. Scorecard comparatif

| Axe | 2026-06-17 | 2026-06-23 | **2026-07-16** |
|---|---|---|---|
| Conformité fiscale | A+ | A+ | **A+** (0 écart / ~180) |
| Conservation moteur (empirique) | A+ | A+ | **A+** (31 scénarios, résiduel max 0,02 $) |
| Source unique NW/revenu (moteur↔UI/IA/MCP) | A− | A | **B** ← 2 contournements HIGH nouveaux |
| Traçabilité des échecs ($) | A− | B+ | **B+** ← 1 CRITIQUE hydratation + frontière MCP muette (le reste très discipliné) |
| Sécurité / vie privée | A | A− | **A** (6 axes ✅, SEC-1 fermé, 2 durcissements préventifs) |
| Couverture tests moteur | A− (30/31) | A− (40/41) | **A+ (41/41)** |
| Santé déterministe (typecheck/tests/build/deps) | — | — | **A** (2661/2661, 0 vuln, 0 erreur lint) |
| Dette god-files UI | — | — | **B** (Budget +20 %, TaxCenter +31 %, FutureProjection +13 % en 3 sem.) |

## 8. Recommandations (routées au BACKLOG, ordre proposé)

1. **`[STORE-REHYDRATE-SILENT]`** (S, CRITIQUE) — filet d'hydratation + migration par palier + signal UI.
2. **`[DASH-NW-DUP]`** (M, HIGH) — repli avec dettes + garde isFinite + étiquette de périmètre immo + test de
   parité « NW unique » (aurait attrapé le finding ; recommandé en juin, jamais livré).
3. **`[INCOME-3WAY-SPLIT]`** (S-M, HIGH) — snapshot IA/MCP + sidebar sur le revenu réel (repli étiqueté).
4. **`[MCP-TOOLS-SILENT-CATCH]`** (S, ÉLEVÉ) + **`[SYNC-APIKEYS-SILENT]`** (S, MOYEN) — logError aux frontières.
5. **`[DEBT-SUM-DUP]`** (S) + **`[MCP-USERTEXT-LANDMINE]`** (S) + LOW (`[LOG-TOKEN-ANCHORED]`,
   `[MCP-RUNPROJECTION-AMBIG]`, `[LINT-4-WARNINGS]`).
6. Dette non urgente (L, plan-first) : découpe de `Budget.tsx`/`FutureProjection.tsx` par domaine — c'est le
   terrain où naissent les récidives de la classe n°1.

## 9. Verdict

Le moteur qui calcule l'argent est **sain et prouvé** (fiscal 0 écart, conservation verte, 41/41 testé).
Les findings vivent — comme en juin — **en périphérie** : surfaces qui contournent la source unique, et
frontières (hydratation, MCP) qui avalent leurs erreurs. Le CRITIQUE d'hydratation est le seul finding de
classe « perte apparente de données » : à corriger en priorité absolue. Lot 1-4 proposé en corrections
immédiates (plan-first, panel par PR) ; 5-6 au fil de l'eau.
