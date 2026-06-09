# 🔮 Projection Future — Documentation détaillée du moteur

> **Fichier source** : `services/projection.ts` (~2400 lignes) + `services/projection/helpers.ts` + `services/projection/goalSeek.ts` + `services/projection/drawdownOptimizer.ts` + `services/projection/historicalReturns.ts` + `services/projection/runAsync.ts` + `services/projection/assetLocation.ts` + `services/projection.worker.ts`
> **Point d'entrée public** : `calculateFutureProjection(params, runMC = false, selectedIdx = 0, onlyStratTypes?): ProjectionResult`
> ⚠️ **[UI-SCEN] (2026-06-09) — changement de contrat** : par défaut le moteur ne calcule QUE le
> scénario de la stratégie sélectionnée (`projection.withdrawalStrategy`, défaut AUTO_MARGINAL) —
> `allResults` contient **1 entrée** (plus 11). Les stress-tests se demandent EXPLICITEMENT via
> `onlyStratTypes` (ex. `['HYPER_INFLATION']`) ; comparer des stratégies = un run par
> `withdrawalStrategy` (cf `drawdownOptimizer.compareLifeScenarios`). `selectedIdx` est legacy (0).
> **API async** : `runProjectionAsync(params, runMC, selectedIdx): Promise<ProjectionResult>` — exécute dans un Web Worker avec timeout 30s
> **Public** : utilisateurs non-experts qui veulent comprendre **exactement** ce que la simulation fait au mois près.
> **UI composants** : `components/Retirement.tsx` (orchestration) + `components/retirement/GoalSeekerCard.tsx` (projection inverse) + `components/retirement/AssetLocationCard.tsx` (asset location)

---

## 0. Vocabulaire de base

| Terme | Définition rapide |
|---|---|
| **Mois de simulation** (`m`) | Numéro du mois depuis le début (m=0 = aujourd'hui, m=12 = an 1, etc.) |
| **Tick** | Une itération de la boucle mensuelle (une exécution du bloc complet pour un mois donné). |
| **Scénario** | Une trajectoire complète sur `projection.years` années, sous une stratégie fixée. |
| **Itération MC** | Une exécution complète d'un scénario avec des rendements aléatoires (gaussiens). |
| **Run** | Un scénario × une stratégie × une graine MC = une trajectoire unique. |

---

## 1. Le pipeline en 3 niveaux

```
┌──────────────────────────────────────────────────────────────────┐
│  Niveau 1 : calculateFutureProjection()                         │
│                                                                   │
│  → Lance 7 scénarios fixés                                      │
│      • BASE             — paramètres actuels                     │
│      • LIBERTE_55       — retraite à 55 + max REER               │
│      • HYPER_INFLATION  — inflation 5.5%                         │
│      • WINDFALL         — héritage +250 000$ au mois 60          │
│      • ECONOMIC_WINTER  — bourse 3% / cash 1% / pessimiste       │
│      • COMPOUND_STRESS  — inflation 5% × rendements anémiques    │
│                          × LTC forcé (Tempête Parfaite)          │
│      • LATE_INHERITANCE — +250 000$ au mois 240 (an 20)          │
│                                                                   │
│  → Trie par patrimoine successoral                              │
│  → Si runMC=true, lance Monte Carlo sur le scénario sélectionné │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  Niveau 2 : runMonteCarlo()  (optionnel, si runMC=true)         │
│                                                                   │
│  → 100 itérations de runScenario(enableMonteCarlo=true)          │
│  → Bandes percentiles : P10 (pessimiste), P50 (médiane), P90    │
│  → Taux de succès (% d'itérations qui ne finissent pas à 0$)    │
│  → FVI : Indice de Vitalité Financière (30/30/20/20 split)      │
│  → Sequence Risk (% itérations dans la décennie critique)        │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  Niveau 3 : runScenario()  (le cœur, 1600+ lignes)              │
│                                                                   │
│  Boucle mensuelle de m=0 à projection.years × 12                 │
│  À chaque mois : 9 phases dans cet ordre exact                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Le tic-tac mensuel — 9 phases dans cet ordre

Pour **chaque** mois `m`, le moteur exécute ces 9 phases séquentiellement. Comprendre cet ordre est essentiel pour savoir « ce qui se passe quand ».

### Phase 1 — Croissance et chocs de marché

1. **Calcul de l'inflation effective** (peut être boostée par stress-test).
2. **Si Monte Carlo activé** : tirages gaussiens corrélés
   - `Z_market` (choc général)
   - `Z_macro` (choc macroéconomique)
   - Dérivés : `Z_stocks` (corr 0.8 marché), `Z_crypto` (corr 1.2 marché), `Z_cash` (corr +0.5 inflation), `Z_inflation` (corr −0.4 marché)
3. **Calcul des taux mensuels effectifs** :
   ```
   mu_mensuel = (1 + rendement_annuel/100)^(1/12) − 1
   sigma_mensuel = (vol_annuelle/100) / √12
   rendement_avec_choc = mu_mensuel + sigma_mensuel × shock
   ```
   Volatilités annuelles utilisées : actions 15%, crypto 45%, cash 2%, inflation 1.5%.
4. **Multiplicateur des dépenses (`expenseMultiplier`)** : compound mensuel par l'inflation effective + bonus santé après 75 ans (max +2.5%).
5. **Inflation par poste** (D2.9, si activée) : moyenne pondérée logement 30 / alim 17 / transport 15 / santé 5 / loisirs 6 / autres 27.

### Phase 2 — Revenus

**Si retraité** :
- RRQ : `governmentPension × 0.65 × prorata × facteur_age`
  - Prorata = années cotisées au Canada / 39
  - Facteur âge : −0.6%/mois avant 65, +0.7%/mois après (max 1.42× à 70)
- PSV : `governmentPension × 0.35 × prorata_résidence × facteur_age`
  - Prorata résidence = (années au Canada après 18 ans) / 40
- **Pension DB (D2.4)** : `dbPensionMonthly × facteur_indexation × (déclenchée si age ≥ dbPensionStartAge)`
- Tout indexé par l'inflation cumulative depuis le début (`(1 + π)^(m/12)`).

**Si actif** :
- Salaire net mensuel × `(1 + salaryGrowth/100)^(années_écoulées)`
- ⚠️ **Le salaire augmente DISCRÈTEMENT chaque année**, pas continuellement. C'est `Math.floor(m / 12)` qui sert d'exposant.
- **Perte d'emploi stochastique (D2.10)** : si MC + flag, tirage en janvier. Si déclenchée, le salaire du user principal tombe à 55% (assurance-emploi) pendant 6 mois (paramétrable).

### Phase 3 — Dépenses et événements de vie

- Dépenses de base × `expenseMultiplier` × `lifestyleFactor`
  - `lifestyleFactor` : 1 par défaut. Si Smile Curve (D2.5) activée :
    - 60-74 ans : 1.15 (go-go)
    - 75-84 ans : 1.00 (slow-go)
    - 85+ ans : 0.90 (no-go)
- **Soins longue durée (D2.8)** : si MC + flag, tirage stochastique par mois. Probabilité annuelle : 1% à 65 → 25% à 90+. Si déclenchés, ajoute `ltcMonthlyCost` (5000$/mois défaut) jusqu'à la fin.
- **Mortalité stochastique (D2.8)** : si MC + flag, tirage annuel en janvier. Si décès, la boucle `break` — `estateNetWorth` devient le patrimoine **au décès** et non en fin d'horizon.
- Événements ponctuels du `lifeEvents[]` (mariage, voyage, voiture…).

### Phase 4 — Fiscalité (calendrier réel canadien)

| Mois | Action |
|---|---|
| **Avril** (currentMonthIndex = 3) | Règlement des impôts de l'an passé. `taxPreviousYear` payé depuis le liquide. Remboursement éventuel re-déposé dans NonReg (avec ajustement ACB). |
| **Décembre** (currentMonthIndex = 11) | Calcul de la facture finale annuelle réelle. `taxPreviousYear ← taxCurrentYear` pour le règlement d'avril prochain. |
| **Janvier** (currentMonthIndex = 0, sauf m=0) | **CELI** : régénération de l'espace (`celiRoom += celiWithdrawalsThisYear`). **FERR** : conversion REER→FERR à 71 ans, retrait minimum obligatoire selon table RRIF (5.4% à 72 → 20% à 94, plafonné). |
| **Mensuel** | Approximation T1213 : retenue à la source ajustée selon `optimizeSourceDeductions`. Le déficit ou surplus s'accumule dans `taxCurrentYear.revenu`. |

⚠️ **Tu paies tes impôts UNE FOIS PAR AN, en avril, sur le revenu de l'année précédente** — c'est fidèle au cycle ARC/Revenu Québec réel.

### Phase 5 — Dettes

- Itère sur les dettes actives, payées dans l'ordre **taux décroissant** (avalanche method).
- Paiement minimum mensuel = `monthlyPayment` configuré.
- Si surplus disponible, attaque la dette au taux le plus élevé.
- Intérêts capitalisés mensuellement.

### Phase 6 — Immobilier

Pour chaque `RealEstateGoal` actif :
- **Si pas encore acheté** et mois = `purchaseOffset` :
  - Calcul mise de fonds nécessaire
  - Retrait CELIAPP/FHSA si éligible (40k$ max à vie)
  - Retrait RAP du REER si éligible (35k$ par personne, sans impôt, remboursable 15 ans)
  - Retrait CELI / NonReg / REER (avec impôt marginal sur ce dernier)
  - Frais de clôture : notaire + arpentage + inspection + **taxe de bienvenue** (Montréal : 0.5% / 1% / 1.5% / 3% par paliers — bug latent, à corriger)
- **Si acheté** :
  - Versement hypothécaire mensuel (capital + intérêts)
  - Charges (taxes municipales, scolaires, condo, entretien, assurances)
  - Renouvellement du taux à `renewalDate`
  - Croissance de la valeur : `propertyGrowthRate` annuel composé

### Phase 7 — Enfants et REEE

Pour chaque `ChildGoal` actif :
- Coût mensuel selon âge : 0-5 ans (garderie), 6-17 ans (école), 18+ (cégep/université)
- **Allocation famille** (provincial QC) + **ACE** (fédéral) dégressives selon revenu familial
- **REEE** : cotisations mensuelles + **SCEE** (fédéral, 20% max 500$/an/enfant) + **IQEE** (QC, 10% max 250$/an/enfant)
- À 18 ans : décaissement progressif pour études (PAE imposable au nom de l'enfant)

### Phase 8 — Allocation du surplus / Manque à gagner

C'est **le moteur stratégique** (lignes 1249-1576 du code).

**Calcul du surplus mensuel** :
```
surplus = monthlyIncome − monthlyExpenses − immoHypo − dettesPaid − childCost − fluxImpots
```

**Selon `strategy`** :
- `AUTO_MARGINAL` : optimise le taux marginal courant. Cotise au REER si taux > 35%, sinon CELI.
- `PRIO_REER` : remplit REER d'abord (déductibilité immédiate), puis CELI.
- `PRIO_CELI` : remplit CELI d'abord (croissance non-imposable), puis REER.
- `MELTDOWN_REER` : en pré-retraite, vide le REER stratégiquement pour lisser les impôts.
- `DEBT_FIRST` : éteint les dettes en priorité avant tout placement.

**Si manque à gagner** (revenu < dépenses) : puise dans cet ordre :
```
liquide → CELI → NonReg → FHSA → REER (avec gross-up fiscal)
```

Le retrait REER nécessite un calcul de **gross-up** : pour obtenir net = X, il faut retirer brut = X / (1 − taux marginal).

### Phase 9 — Snapshot mensuel

Tous les soldes, croissances, taxes payées, contributions, retraits, événements sont enregistrés dans `chartData[]` pour le rendu graphique. Format :
```ts
{ monthIndex, year, age, NetWorth, CELI, REER, NonReg, Liquidites,
  CELIAPP, REEE, MarketGrowthCELI, GrowthCELIAPP, …,
  RealEstateEquity, MortgageBalance, MonthlyIncome, MonthlyExpenses,
  P10, P50, P90 (en MC), … }
```

---

## 3. Détails non-évidents (les pièges)

### 3.1 Salaire annuel, pas continu
```ts
const yearsElapsed = Math.floor(m / 12);
incomeMarc = base × (1 + g/100)^yearsElapsed;
```
Donc au mois 11 vs mois 13, le salaire fait un **saut discret** (l'augmentation tombe en janvier de chaque année simulée).

### 3.2 Inflation cumulative compoundée mensuellement
Contrairement au salaire (annuel), l'inflation s'accumule **chaque mois** :
```ts
expenseMultiplier *= Math.pow(1 + π/100, 1/12);
```
Résultat : sur 30 ans à 3%, `expenseMultiplier` ≈ 2.43 (les dépenses sont 2.43× plus chères en nominal).

### 3.3 Croissance des actifs : mid-month
Les contributions ne croissent qu'**un demi-mois** (hypothèse conservatrice : versement au milieu du mois) :
```ts
growthOnStart = startVal × monthlyRate           // mois entier
growthOnFlow  = netFlow × ((1+rate)^(1/24) - 1)  // demi-mois
```

### 3.4 MER (frais de gestion) dérivé chaque mois
`MER = 0.20%` annuel, déduit chaque mois sur le solde + flux : `(startVal + netFlow) × MER/12`.
Crypto et cash exemptés.

### 3.5 Glide path (ratio actions/obligations)
À mesure que la retraite approche, le rendement effectif glisse vers un mix plus conservateur :
```ts
effectiveCeliRate = activeCeliRate × glideFactor + targetGlideRate × (1 − glideFactor)
```
Le `glideFactor` part de 1.0 (100% actions) et décroît vers 0.3 (30%) à la retraite.

### 3.6 Withholding tax US sur CELI (D2.7)
Le CELI **n'est pas** protégé par la convention fiscale Canada-US. Détenir VOO/SPY dans un CELI perd 15% des dividendes US. Modélisé comme drag de rendement :
```ts
drag = (usEquityShareCeli/100) × (usEquityDividendYield/100) × 0.15
effectiveCeliRate -= drag × 100  // pp
```
REER exempté (convention fiscale).

### 3.7 Le PRNG est déterministe et seedé
```ts
seed = hash("scenario-strategy-iter")  // PAS le capital initial (D2.3)
rng  = mulberry32(seed)
```
Deux exécutions avec les mêmes params donnent **rigoureusement les mêmes nombres aléatoires**. Crucial pour la comparaison de stratégies.

### 3.8 OAS Clawback (PSV remboursable)
À partir d'un revenu de pension supérieur à 90 997$/an (indexé), 15% de l'excédent est récupéré sur la PSV. Modélisé en `oasClawbackNextPeriod`.

### 3.9 Bombe fiscale FERR à 71 ans
La conversion REER → FERR est obligatoire l'année des 71 ans. Le retrait minimum (5.4% à 72 → 20%+ à 94) peut **pousser dans une tranche supérieure** et causer un OAS clawback.

### 3.10 Banque de pertes en capital
Une perte en capital sur le NonReg n'est PAS perdue : elle s'accumule dans `capitalLossBank` et compense les gains futurs (TLH = Tax Loss Harvesting).

---

## 4. Inputs disponibles (UI)

### Section Avenirs de Vie (7 scénarios)
- Aucun input direct — paramètres fixés en code (`scenarioType` overrides).
- **Scénarios standards** : BASE, LIBERTE_55, HYPER_INFLATION, WINDFALL, ECONOMIC_WINTER.
- **Scénarios compound stress (Phase 4 #4)** :
  - **COMPOUND_STRESS** (« Tempête Parfaite ») : empile inflation 5%+, rendements
    anémiques (CELI/REER 3%, NonReg 2%, cash 1%) et **force `ltcEnabled = true`**
    via override dans `runScenario` (cf `services/projection.ts`). Le pire du pire,
    probabilité combinée faible mais non nulle — utile pour mesurer la marge de
    sécurité.
  - **LATE_INHERITANCE** (« Héritage Tardif ») : injection de 250 000$ au mois 240
    (an 20) au lieu du mois 60 comme WINDFALL. Teste le pont fiscal long et
    montre la nécessité d'autonomie financière dans la première décennie.

### Section Données réelles / Sandbox
- `useTheoretical` : bascule entre revenus/dépenses réels du CSV et mode bac-à-sable.

### Toggles événements stochastiques (MC requis)
- ⚰️ **Mortalité stochastique** (D2.8)
- 🏥 **LTC stochastique** + coût mensuel (D2.8)
- 💼 **Perte d'emploi stochastique** (D2.10)

### Inflation et frais
- Inflation globale (slider)
- 📊 **Inflation par poste** (D2.9) : 6 sliders pondérés CPI

### Options de modélisation
- 🎲 **Monte Carlo** ON/OFF
- 😊 **Smile Curve** (D2.5)
- 🇺🇸 **Part actions US dans CELI** + yield dividende (D2.7)

### Pension DB (page Retirement)
- Rente mensuelle DB
- Indexation IPC %
- Âge de début

---

## 5. Outputs

### Par scénario (`allResults[i]`)
- `chartData[]` — snapshot mensuel complet
- `finalNetWorth` — patrimoine en fin d'horizon
- `estateNetWorth` — patrimoine au décès (après impôts latents)
- `totalTaxesPaid`, `totalGrowth`, `totalExpenses`
- `minNetWorth`, `shortfallMonths`, `shortfallRate`
- `gainVsAuto` (vs BASE)

### Si Monte Carlo activé
- `successRate` (%) — itérations qui ne finissent pas en faillite
- `fvi` (Indice de Vitalité 0-100) — `0.3×Survie + 0.3×Sécurité + 0.2×Efficience + 0.2×Legs`
- `p10Data[]`, `p50Data[]`, `p90Data[]` — bandes percentiles
- `expertMetrics` :
  - `swr` — Safe Withdrawal Rate observé
  - `taxLeakage` — Taxes / Croissance
  - `shortfallRisk` — Mois en manque à gagner
  - **`sequenceRiskPct`** (D2.6) — % itérations où NW < 50% startNW dans la décennie critique [retraite-5, retraite+5]
  - **`worstDecadeDrawdown`** — pire chute relative dans cette fenêtre

---

## 6. Diagnostic — comment savoir si la simulation a un sens

| Symptôme | Cause probable |
|---|---|
| `successRate` = 100% trop facilement | Inflation trop basse, ou Smile Curve OFF, ou dépenses sous-estimées |
| Patrimoine final négatif rapidement | Rente Etat (`governmentPension`) sous-déclarée, ou dépenses retraite trop élevées |
| `fvi` < 30 | Risque sérieux : revoir la stratégie d'allocation, age de retraite, ou objectif de dépenses |
| `sequenceRiskPct` > 40% | Plan fragile à un krach précoce — envisager de retarder retraite ou réduire actions juste avant |
| Bandes P10/P90 très écartées | Sensibilité forte aux rendements — diversifier davantage |

---

## 7. Limitations connues — État (mai 2026)

| ID | Limitation | Statut |
|---|---|---|
| L1 | RRQ et PSV mêlés dans `governmentPension × 0.65/0.35` | ✅ **CORRIGÉ** (W1.3) |
| L2 | Taxe de bienvenue utilise `else if` (paliers non-cumulatifs) | 🟡 Documenté, à corriger |
| L3 | 100 itérations MC seulement (IC95% ±3pp) | ✅ **Web Worker scaffold** (W1.1) |
| L4 | Bootstrap historique pas implémenté | ✅ **CORRIGÉ** (W1.2) |
| L5 | Survivant après décès du conjoint pas géré | ✅ **CORRIGÉ** (W1.4) |
| L6 | Divorce probabiliste pas modélisé | ✅ **CORRIGÉ** (W3.1) |
| L7 | Régime DB d'employeur : pas de buyback, transferts, ou survivants | 🟡 Élection joint/single (W5.5), buyback pas implémenté |
| L8 | Stock options/RSU non modélisés | 🟡 Capturés en input (W5.2), non utilisés dans moteur |
| L9 | Asset location auto pas optimisée | ✅ **CORRIGÉ** (optimizeAssetLocation) |
| L10 | Mortalité stochastique user1 break sans cession | ✅ **CORRIGÉ** (W1.4 — survivant) |

## 8. Features ajoutées (vagues W1-W5)

### Vague W1 — Fondations précision

| ID | Feature | UI |
|---|---|---|
| **W1.1** | Web Worker scaffold (runProjectionAsync) | — (API) |
| **W1.2** | Bootstrap historique 1928-2024 (S&P + bonds + CPI) | Toggle 📜 |
| **W1.3** | RRQ et PSV séparés (champs individuels) | 2 inputs Retirement |
| **W1.4** | Scénario survivant après décès conjoint | Toggle 🖤 + dropdown DB election |
| **W1.5** | Goal seeking / projection inverse (épargne ou âge minimal) | Card 🎯 Retirement |
| **W1.6** | Comparison multi-scénarios | ⚠️ Partiel (allResults exposé) |

### Vague W2 — Optimisations fiscales

| ID | Feature | Statut |
|---|---|---|
| **W2.1** | Roth-equivalent ladder (REER→CELI) | 🟡 Flag, pas de logique |
| **W2.2** | Pension splitting 65+ explicite | ⚠️ Implicite via activeUsersCount |
| **W2.3** | Spousal RRSP optimization | 🟡 Flag |
| **W2.6** | **Drawdown order optimizer** | ✅ 5 stratégies comparées |
| **W2.7** | Geographic arbitrage | 🟡 Champ futureProvince |

### Vague W3 — Événements de vie stochastiques

| ID | Feature | Probabilité défaut | UI Toggle |
|---|---|---|---|
| **W3.1** | **Divorce** | 1.5%/an | 💔 |
| **W3.2** | **Invalidité longue durée** | 0.5%/an | ♿ |
| **W3.3** | **Maladie grave** | 0.3%/an | 🩺 |
| **W3.4** | **Héritage probabilisé** | configurable | 🎁 |
| **W3.5** | Sandwich generation (boomerang + caregiving) | toujours actif si configuré | — |
| **W3.7** | Severance / mise à pied | 🟡 Flag | — |

### Vague W4 — Visualisation et UX

| ID | Feature | Localisation |
|---|---|---|
| **W4.1** | **Tax bracket viz** (fédéral + Québec avec marqueur revenu) | Retirement |
| **W4.5** | **Replay krach historique** (1929/1973/2000/2008/2020/2022) | Dropdown FutureProjection |
| **W4.6** | Phased retirement (semi-retraite) | 🟡 Flag |
| **W4.7** | **Snowbird** (4-6 mois US/Mexique en hiver) | Toggle 🌴 |

### Vague W5 — Capture de variables

| ID | Catégorie | Champs ajoutés |
|---|---|---|
| **W5.1** | Profil utilisateur enrichi | sexe, province, citoyenneté, statut civil, santé, fumeur, IMC, conditions chroniques, parents âge décès, industrie, expérience, type emploi, régime retraite |
| **W5.2** | Rémunération variable | bonus % brut, RSU $/an, stock options, side income, périodicité paie |
| **W5.3** | Dettes étendues | kind, taux variable, limite, terme, prêteur, déductible |
| **W5.4** | **InsurancePolicy** (11 types) | vie temp/entière/U, invalidité ST/LT, maladies graves, soins LD, voyage, auto, habitation, responsabilité |
| **W5.5** | DB joint-life vs single-life | option survivant + % rente |
| **W5.6** | **RentalProperty** | cap rate, vacancy, NOI, DPA, amortization |
| **W5.7** | **PrivateBusiness** (CCPC) | % détention, JVM, dividendes, BNR, accès DPE |
| **W5.x** | Goals cycliques | véhicules cycliques, rénovations majeures, dons charitables |

## 9. Stratégies de décaissement (drawdown)

5 stratégies disponibles, accessibles via `optimizeDrawdownOrder(params)` :

```
🥇 AUTO_MARGINAL  : optimise le taux marginal à chaque retrait
🥈 PRIO_REER      : vide REER d'abord (lisse revenu, évite OAS clawback)
🥉 PRIO_CELI      : vide CELI d'abord (préserve REER différé)
   MELTDOWN_REER  : meltdown REER en pré-retraite (comble brackets bas)
   DEBT_FIRST     : extinction dettes avant placements
```

L'optimizer lance les 5 et retourne celle qui maximise `estateNetWorth` avec un gain mesuré vs la pire.

### 9.1 Optimisations 2026-05 (cashflowAllocation.ts)

Le shortfall cascade a été enrichi avec trois couches d'intelligence fiscale :

1. **Palier 0% (PBMA)** — existant : retrait REER jusqu'au palier de base montant
   ajusté (~17 183$/usager), à taux marginal effectif 0%.

2. **Palier 14% (NOUVEAU, AUTO_MARGINAL uniquement)** — extension : continue le
   retrait REER jusqu'au plafond du palier 1 (~54 345$/usager, fed+QC combiné
   28%). Sous ce seuil, sortir du REER plutôt que du CELI préserve la valeur
   futur non-imposable du CELI.

3. **OAS Clawback Guard (NOUVEAU)** — si `isRetired`, plafonne les retraits REER
   au seuil de clawback PSV (`OAS_CLAWBACK_THRESHOLD_2026 = 93 454$`/usager).
   Tout dollar au-delà déclencherait une récupération de 15%. Le shortfall
   bascule alors sur CELI/NonReg.

4. **Banque de pertes en capital (NOUVEAU)** — si `capitalLossBank > 1000$`,
   inverse REER ↔ NONREG dans la cascade. Vendre du NonReg utilise la banque
   (gain compensé → effectivement non-imposable) au lieu de gaspiller la
   déduction REER.

**Impact mesurable** : pour un retraité à 60 ans avec ~$50k de revenu retraite
base, le palier 14% permet de retirer ~$30k de plus du REER chaque année sans
dépasser le bracket 1. Sur 30 ans de retraite, c'est ~$200k de CELI préservés.

## 10. Bootstrap historique (W1.2)

Source : Aswath Damodaran (NYU Stern) — 97 années 1928-2024.

```
HISTORICAL_RETURNS_US[] = [
  { year: 1928, sp500: +43.81%, bonds: +0.84%, inflation: -1.15% },
  ...
  { year: 2022, sp500: -18.04%, bonds: -17.83%, inflation: +6.45% },
  { year: 2023, sp500: +26.06%, bonds: +3.88%, inflation: +3.35% },
  { year: 2024, sp500: +25.02%, bonds: +0.58%, inflation: +2.95% },
]
```

Crashes notables capturés :
- **1929-1933** : -86% cumulé (Grande Dépression)
- **1973-1974** : -40% (choc pétrolier + stagflation)
- **2000-2002** : -43% (bulle dot-com)
- **2008** : -37% (crise financière)
- **2020** : -34% (mars COVID, rebond rapide)
- **2022** : -18% S&P + -18% bonds (60/40 explosé)

Mode bootstrap MC : assemble des blocs de 24 mois consécutifs (préserve corrélations).
Mode replay (W4.5) : force déterministe à partir d'une année donnée.

## 11.5 Asset Location Optimizer

```ts
optimizeAssetLocation({
  annualGrossIncome: 100000,
  holdings: [
    { assetClass: 'bonds',     amount: 50000,  currentAccount: 'CELI' },
    { assetClass: 'us-equity', amount: 100000, currentAccount: 'CELI' },
  ],
});
// → { recommendations: [...], totalAnnualLoss: 1247, summary: "Tu perds ~1247$/an d'impôts évitables." }
```

Règle d'or canadienne implémentée :
- Obligations / GIC / Cash → **REER** (intérêts 100% imposables)
- Actions US (VOO/SPY) → **REER** (treaty exempte withholding 15%)
- Actions CAD (XIC/VCN) → **CELI** (gain non-imposable, dividende éligible favorable hors CELI)
- International (VXUS) → **NonReg** (FTC récupère le foreign withholding)
- Croissance/Small-cap → **CELI** (gain non-imposable)
- REIT → **REER** (distributions taxées comme intérêt)

Compute `marginalRate(annualGrossIncome)` puis annualLoss = différence d'impôt entre compte actuel et idéal + drag US sur CELI + opportunity cost (bonds/cash dans CELI gaspille l'espace).

## 12. Hook useDebouncedMemo + Worker

```ts
// utils/useDebouncedMemo.ts — hook React générique
useDebouncedMemo(factory, deps, delay = 300)
```

- Mode déterministe : synchrone, debounce 300ms
- Mode MC : asynchrone via `runProjectionAsync` (Web Worker), debounce 300ms
- Indicateur visuel `⏳` sur le bouton MC pendant calcul

## 11. Goal Seeking (projection inverse)

```ts
findRequiredMonthlySavings(params, targetNetWorth, targetAge?)
// → { found: true, value: 1850, iterations: 12 }

findEarliestRetirementAge(params, minAge=45, maxAge=75)
// → { found: true, value: 58, iterations: 10 }
```

Méthode : dichotomie sur le paramètre, garantit convergence en log2(range) appels.


---

## 8. Cas-test : "Et si je gagne 100k$, j'ai 35 ans, je vise 60 ans ?"

```ts
calculateFutureProjection({
  projection: {
    years: 30,
    inflationRate: 3,
    returnRates: { celi: 7, reer: 7, nonReg: 6, crypto: 10, cash: 2 },
    salaryGrowth: 2.5,
    useSmileCurve: true,
    ltcEnabled: true,
    useStochasticMortality: true,
    jobLossEnabled: true,
    usePerCategoryInflation: true,
  },
  retirementGoal: { targetAge: 60, targetMonthlyIncome: 5000, governmentPension: 1800, dbPensionMonthly: 0 },
  // … balances initiaux, dettes, etc.
}, /* runMC */ true);
```

→ Retourne 7 scénarios + bandes P10/P50/P90 + FVI + métrique sequence risk + indication si LTC s'est déclenché dans certaines itérations.

---

## 9. Pour le développeur

- **Tests** : `tests/services/projection.test.ts` (47 tests scénarios — incluant les 7 avenirs et les 2 compound stress de Phase 4 #4) + `tests/services/projection.helpers.test.ts` (28 tests helpers purs).
- **Déterminisme** : graine fixée par scénario+stratégie+iter. Re-run = identique.
- **Performance** : ~50ms par scénario en mode déterministe, ~3s pour 100 itérations MC sur un horizon 30 ans. Web Worker prévu pour pousser à 1000+.
- **Pas de side-effects** : pure function par construction. Idéal pour MCP/RPC.

---

> Pour toute correction ou ajout, viser **petits diffs**, **tests d'abord**, et **toujours préserver le déterminisme**.
