# 🔮 Projection Future — Documentation détaillée du moteur

> **Fichier source** : `services/projection.ts` (~2000 lignes) + `services/projection/helpers.ts`
> **Point d'entrée public** : `calculateFutureProjection(params, runMC = false, selectedIdx = 0)`
> **Public** : utilisateurs non-experts qui veulent comprendre **exactement** ce que la simulation fait au mois près.

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
│  → Lance 5 scénarios fixés                                      │
│      • BASE             — paramètres actuels                     │
│      • LIBERTE_55       — retraite à 55 + max REER               │
│      • HYPER_INFLATION  — inflation 5.5%                         │
│      • WINDFALL         — héritage +250 000$ au mois 60          │
│      • ECONOMIC_WINTER  — bourse 3% / cash 1% / pessimiste       │
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

### Section Avenirs de Vie (5 scénarios)
- Aucun input direct — paramètres fixés en code (`scenarioType` overrides).

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

## 7. Limitations connues (documentées, à corriger)

| ID | Limitation | PR future |
|---|---|---|
| L1 | RRQ et PSV mêlés dans `governmentPension × 0.65/0.35` au lieu de deux champs | — |
| L2 | Taxe de bienvenue utilise `else if` (paliers non-cumulatifs, faux fiscalement) | D2.11 |
| L3 | 100 itérations MC seulement (IC95% ±3pp) — Web Worker prévu | D2.12 |
| L4 | Bootstrap historique pas implémenté (Box-Muller gaussien seulement) | D2.13 |
| L5 | Survivant après décès du conjoint pas géré (RRQ survivant 60%, etc.) | — |
| L6 | Divorce probabiliste pas modélisé | — |
| L7 | Régime DB d'employeur : pas de buyback, transferts, ou survivants | — |
| L8 | Stock options/RSU non modélisés | — |
| L9 | Asset location (FNB US dans REER vs CELI) pas optimisée automatiquement | — |
| L10 | Mortalité stochastique : break à la mort du user1 — pas de cession au conjoint | — |

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

→ Retourne 5 scénarios + bandes P10/P50/P90 + FVI + métrique sequence risk + indication si LTC s'est déclenché dans certaines itérations.

---

## 9. Pour le développeur

- **Tests** : `tests/services/projection.test.ts` (22 tests scénarios) + `tests/services/projection.helpers.test.ts` (24 tests helpers purs).
- **Déterminisme** : graine fixée par scénario+stratégie+iter. Re-run = identique.
- **Performance** : ~50ms par scénario en mode déterministe, ~3s pour 100 itérations MC sur un horizon 30 ans. Web Worker prévu pour pousser à 1000+.
- **Pas de side-effects** : pure function par construction. Idéal pour MCP/RPC.

---

> Pour toute correction ou ajout, viser **petits diffs**, **tests d'abord**, et **toujours préserver le déterminisme**.
