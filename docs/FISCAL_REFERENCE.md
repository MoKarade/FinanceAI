# FISCAL_REFERENCE — valeurs fiscales QC / Canada (SOURCE DE VÉRITÉ)

> **Statut** : source de vérité des constantes fiscales de FinanceAI.
> **Année de base** : **2026**. **Dernière vérification** : 2026-06-11 (FA-8 : FSS réindexé 2026,
> retenue US sourcée, clawback PSV nommé+cap réel, prorata RRQ/PSV et split 65/35 documentés).
> **Ré-audité 2026-06-17** (agent `fiscal-accuracy`, audit complet `docs/AUDIT_FINANCIER_2026-06-17.md`) :
> **0 écart code↔doc**, source unique respectée (zéro chiffre fiscal en dur divergent).
> **2ᵉ passe 2026-06-23** (0 écart, `docs/AUDIT_FINANCIER_2026-06-23.md`).
> **3ᵉ passe 2026-07-31** (financial-integrity, recalcul indépendant) : **0 écart code↔doc sur les
> CONSTANTES** (paliers féd/QC 2026, BPA, clawback PSV, RRQ/RQAP/AE/FSS/RAMQ, retenues REER, FERR,
> CELI/REER/SCEE/IQEE, SCHL/OSFI/mutations 2026 — la réserve « mutations 2025 » de 06-17 est levée,
> le §8 porte le barème 2026 sourcé). MAIS findings de **MODÈLE** routés au BACKLOG :
> `[FISC-BRACKET-REALINDEX]` (CRITIQUE, cf §9), `[FISC-WHT-92PCT]`, `[FISC-GIS-COUPLE-RATE]`,
> `[FISC-DTC-ABATEMENT-ORDER]`, `[FISC-STACK-GAINS-DIV]`, `[FISC-FED-CREDITRATE-15]` (le 15 % des
> crédits non remboursables est la seule valeur du doc SANS source primaire — à re-sourcer ARC).
> NB : le §4 (TP-1.G vivant seul) a été réécrit le 2026-07-07 — couvert par cette 3ᵉ passe.
> ⏰ **CELI/REER 2027-2030 = estimés** : confirmer aux annonces officielles (nov-déc 2026).
> **Règle CLAUDE.md** : toute constante fiscale du code DOIT correspondre à ce doc,
> daté + sourcé. Aucun chiffre fiscal en dur non sourcé. Audit : agent `fiscal-accuracy`.
>
> ⚠️ **Format des dates** : lu par `tests/utils/fiscalFreshness.ts` (garde [HARDEN-FISCAL-TIMEBOMB]).
> Conserver les marqueurs **`Dernière vérification : YYYY-MM-DD`** et **`Ré-audité YYYY-MM-DD`** dans
> ce format exact (la regex tolère le gras markdown `**…**`). Une restructuration de ces lignes casse le test.
> **Bumper la date = ATTESTER une re-vérification RÉELLE des chiffres vs ARC/Revenu Québec** (acte
> d'engagement, pas une formalité) : la garde mesure la fraîcheur de la DATE, pas l'exactitude des
> valeurs. Avancer la date sans re-vérifier désarme la bombe et endort la vigilance qu'elle force.
>
> **Implémentation** : `utils/tax.ts` (particuliers) + `services/realEstate.ts`
> (immobilier SCHL/OSFI). Indexation des années futures : `getIndexedBracketsForYear`
> (≈ +2 %/an au-delà de 2026, sauf montants gelés indiqués). Cf ADR 009.
>
> Ce doc transcrit les valeurs **actuellement implémentées** (vérifiées 2026-05 lors
> de leur saisie) avec leur source officielle. À reconfirmer à chaque Budget fédéral /
> bulletin d'indexation Revenu Québec ; en cas d'écart, **ce doc + le code** sont
> corrigés ensemble dans la même PR.

---

## 1. Barèmes d'impôt sur le revenu (2026)

### Fédéral (`FED_BRACKETS`) — source ARC
| Tranche (revenu imposable) | Taux |
|---|---|
| ≤ 58 523 $ | 14,0 % |
| 58 523 → 117 045 $ | 20,5 % |
| 117 045 → 181 440 $ | 26,0 % |
| 181 440 → 258 482 $ | 29,0 % |
| > 258 482 $ | 33,0 % |

> 1er palier abaissé à **14 %** en 2026 (politique C-4). **Abattement du Québec** :
> l'impôt fédéral d'un résident QC est réduit de **16,5 %** (`QC_FEDERAL_ABATEMENT_RATE`).

### Québec (`QC_BRACKETS`) — source Revenu Québec
| Tranche (revenu imposable) | Taux |
|---|---|
| ≤ 54 345 $ | 14,0 % |
| 54 345 → 108 680 $ | 19,0 % |
| 108 680 → 132 245 $ | 24,0 % |
| > 132 245 $ | 25,75 % |

### Montants personnels de base (BPA, crédit non remboursable au taux le plus bas)
| | Montant 2026 | Taux du crédit | Note |
|---|---|---|---|
| Fédéral (`BASIC_PERSONAL_AMOUNT_FED`) | **16 452 $** | **15 %** (`FED_NONREFUNDABLE_RATE`, gelé malgré le palier à 14 %) | BPA dégressif 16 452 → 14 829 $ haut revenu ; on retient le palier max (dégressivité non modélisée) |
| Québec (`BASIC_PERSONAL_AMOUNT_QC`) | **18 952 $** | **14 %** (`QC_NONREFUNDABLE_RATE`) | = 18 571 $ (2025) × 1,0205 |

> Indexation 2026 : fédéral **+2,0 %**, Québec **+2,05 %**.

---

## 2. Cotisations sociales (2026)

### RRQ — Régime de rentes du Québec (`utils/tax.ts`)
| Constante | Valeur 2026 | Note |
|---|---|---|
| Taux base + volet 1 (`RRQ_RATE`) | **6,30 %** | 5,30 % base (réduit de 5,40 %) + 1,00 %. Total employé+employeur 10,6 % |
| MGA / YMPE (`RRQ_MPE`) | **74 600 $** | +4,6 % vs 71 300 $ (2025) |
| Exemption (`RRQ_EXEMPTION`) | **3 500 $** | |
| Cotisation max volet base+1 (`RRQ_MAX`) | **≈ 4 479,30 $** | (74 600 − 3 500) × 6,30 % |
| Taux volet 2 (`RRQ_PART2_RATE`) | **4,00 %** | MGA → MGAS |
| MGAS / YAMPE (`RRQ_YAMPE`) | **85 000 $** | 2e plafond |
| Cotisation max volet 2 (`RRQ_PART2_MAX`) | **416 $** | (85 000 − 74 600) × 4 % |

### RQAP — Régime québécois d'assurance parentale
| Constante | Valeur 2026 |
|---|---|
| Taux (`RQAP_RATE`) | 0,43 % |
| Revenu max (`RQAP_MAX_INCOME`) | 103 000 $ |
| Cotisation max (`RQAP_MAX`) | 442,90 $ |

### AE — Assurance-emploi (taux Québec)
| Constante | Valeur 2026 |
|---|---|
| Taux (`AE_RATE_QC`) | 1,30 % |
| Revenu max (`AE_MAX_INCOME`) | 68 900 $ |
| Cotisation max (`AE_MAX_QC`) | 895,70 $ |

---

## 3. Gains en capital & dividendes (2026)

- **Inclusion gains en capital** (`CAPITAL_GAINS_INCLUSION_STANDARD`) : **50 %** uniforme
  (la proposition fédérale 66,67 % > 250 k$ a été **annulée en mars 2025**).
- **Report de pertes nettes en capital** (LIR 111(1)(b)) : les pertes cristallisées (TLH) entrent
  dans `capitalLossBank` et compensent les gains futurs au moment de la RÉALISATION
  (`handleNonRegSale`). **PV-2 (2026-06-10)** : la *récolte de gains* (`processGainHarvesting`)
  consomme la banque EN PREMIER — la part compensée est imposable à 0 $ et n'occupe AUCUNE place
  dans le 1er palier (step-up d'ACB gratuit), le remplissage du palier porte sur le latent restant.
  **PV-7 (2026-06-10)** : les ventes de **crypto** en vie (cascade de shortfall/sauvetage PV-1 +
  retraits d'objectifs) passent désormais par `handleCryptoSale` — MÊME logique que NonReg (gain
  proportionnel, banque de pertes, pertes banquées). Reste conservateur à la SUCCESSION : le gain
  latent crypto (comme NonReg) y est calculé `Math.max(0, valeur − ACB)` sans appliquer la banque
  (symétrique entre les deux actifs). Note : `handleNonRegSale` ne réalise jamais de PERTE non plus (le cap
  `min(1, ACB/valeur)` rend rawGain ≥ 0) — la banque ne s'alimente que par le TLH ; en position de
  perte latente, la vente diffère la perte (ACB résiduel conservé) au lieu de la déduire — conservateur.
  Nuances : la compensation MÊME ANNÉE relève de l'art. 3b) LIR (le report 111(1)(b) vise les années
  suivantes ; report rétrospectif 3 ans non modélisé — conservateur) ; l'équivalence brut-contre-brut
  ne tient qu'à inclusion UNIFORME (un retour d'un taux multiple type 66,67 % exigerait le facteur
  d'ajustement 111(1.1)). Limite assumée : la part compensée sort aussi des assiettes RAMQ/FSS
  (revenu NET) alors que la déduction 111(1)(b) ne s'applique qu'au revenu IMPOSABLE — biais
  ≤ ~744 $ RAMQ + ~1 000 $ FSS les années de consommation (convention partagée avec handleNonRegSale).
- **TLH — perte bornée par la perte LATENTE RÉELLE** (`processTaxLossHarvesting`, décembre).
  **PV-8 (2026-06-10)** : la perte cristallisée vaut `0,5 × max(0, ACB − valeur)` (on vend 50 % de la
  tranche, coût fiscal proportionnel − valeur), JAMAIS `valeur × |rendement|`. Une année négative est le
  seul DÉCLENCHEUR ; un titre en GAIN latent (ACB < valeur) ne récolte RIEN, même en chute (le vendre
  réaliserait un gain). L'ancien code fabriquait une perte à partir du seul rendement de l'année et
  gonflait `capitalLossBank` sur des positions en gain → sous-imposition des gains réels abrités ensuite.
  Conservation : banque +L, ACB −L (`acbDelta = −L`) → le gain futur régénéré vaut L (la récolte n'est
  qu'un arbitrage de TIMING/taux, pas un repas gratuit). **Hypothèse « perte apparente » levée.** La *perte
  apparente* (« superficial loss », DÉFINIE à LIR **54**) survient si le **bien identique** est racheté par
  le contribuable **OU une personne affiliée** (conjoint, sa société, son REER/CELI) dans la fenêtre
  **−30/+30 jours** et est encore détenu au **jour +30** : la perte est alors **réputée NULLE** (LIR
  **40(2)g)(i)**) puis **ajoutée à l'ACB du bien racheté** (LIR **53(1)f)** — report, PAS perte sèche ; *sauf*
  rachat par un régime enregistré où elle est définitivement perdue). Le modèle suppose un **rachat dans un
  fonds CORRÉLÉ mais NON identique** (substitution valide, pratique courante de récolte) → pas de bien
  identique, pas de perte apparente, perte **déductible immédiatement**. Le cas « bien identique » n'est pas
  modélisé.
- **Dividendes** (`calculateDividendTax`, résident QC) :
  | Type | Majoration (gross-up) | CID fédéral | CID Québec |
  |---|---|---|---|
  | Admissibles (`eligible`) | +38 % | 15,0198 % du majoré | 11,7 % du majoré |
  | Non-admissibles (`non-eligible`) | +15 % | 9,0301 % du majoré | 3,42 % du majoré |
  > Imposition par **empilement progressif** du montant majoré (ITEM 2d), CID inchangé.
  > Hypothèse de MODÈLE (pas une constante fiscale) : **30 % du rendement NonReg** est versé
  > en dividendes admissibles chaque année (`taxDecember` §3). **FA-8 (2026-06-11)** — assiette
  > de BASE de l'empilement ALIGNÉE sur celle des gains : revenu retraite (hors SRG) + rentes
  > + **retraits REER/FERR de l'année** (avant, les retraits manquaient côté dividendes → taux
  > d'entrée sous-évalué pour un retraité en meltdown REER, non conservateur).
  > ⚠️ **[FISC-STACK-GAINS-DIV] (2026-08-05)** — l'assiette inclut AUSSI les **gains en capital
  > imposables de l'année** : l'empilement est SÉQUENTIEL (gains sur le revenu, puis dividendes
  > majorés sur revenu+gains). Avant, les deux blocs empilaient chacun depuis le revenu nu → la
  > bande commune était facturée DEUX FOIS au taux bas. Propriété désormais garantie et testée :
  > somme des deux bandes = bande totale `[revenu, revenu+gains+majoré]`, sans trou ni
  > recouvrement (exact au cent). Effet mesuré : +815 $/an (retraité 100 k$ / gains 30 k$ /
  > non-enreg 500 k$). Limite restante
  > (OUVERTE, hors lot FA-8 — cf BACKLOG) : dividendes/intérêts non-reg toujours exclus du test
  > SRG et du revenu de clawback PSV.
- **Retenue à la source US sur dividendes** (`US_DIVIDEND_WITHHOLDING_RATE` = **15 %**, FA-8
  2026-06-11) : Convention fiscale **Canada–États-Unis (1980), art. X(2)b)** (taux réduit
  « portefeuille »). **REER/FERR exemptés** (art. XXI — régimes de pension) ; **CELI NON exempté**
  (pas un régime de pension au sens de la convention) → drag non récupérable modélisé sur le CELI
  (`glidepathRates` D2.7 + `assetLocation`) ; en non-enregistré, récupérable via le **crédit pour
  impôt étranger (FTC)**. Pour `international`, retenues variables par pays — le taux US sert
  d'approximation standard (hypothèse de modèle, même constante).

### Retenue à la source REER (résident QC, `RRSP_WITHHOLDING_QC`)
| Tranche du retrait | Féd | QC | Combiné |
|---|---|---|---|
| ≤ 5 000 $ | 5 % | 14 % | **19 %** |
| 5 001 → 15 000 $ | 10 % | 14 % | **24 %** |
| > 15 000 $ | 15 % | 14 % | **29 %** |
> Réfs : ARC IT-528R2 + RQ TP-1015. Hors QC : 10/20/30 % (non modélisé).

---

## 4. Crédits 65+ et revenu de retraite (2026)

### Fédéral
| Constante | Valeur 2026 | Source |
|---|---|---|
| Crédit en raison de l'âge (`AGE_AMOUNT_FED_2026`) | **9 208 $** | ARC ligne 30100 (= 9 028 × 1,02) |
| Seuil de réduction (`AGE_AMOUNT_FED_THRESHOLD_2026`) | 46 432 $ | 45 522 × 1,02 |
| Taux de réduction (`AGE_AMOUNT_FED_REDUCTION_RATE`) | 15 % | au-delà du seuil |
| Âge minimum | 65 ans | |
| Crédit pour revenu de pension (`PENSION_INCOME_AMOUNT_FED`) | **2 000 $** | ARC ligne 31400 (fixe, non indexé depuis 2006) |

### Québec — ligne 361 (âge + revenu de retraite + personne vivant seule combinés)
| Constante | Valeur 2026 | Source |
|---|---|---|
| Montant en raison de l'âge (`AGE_AMOUNT_QC_2026`) | **3 986 $** | Revenu Québec TP-1.G, 65+/personne |
| Montant revenu de retraite (`RETIREMENT_INCOME_AMOUNT_QC_2026`) | **3 058 $** | sur 1ers 3 058 $ de pension admissible |
| **Personne vivant seule (base)** (`LIVING_ALONE_AMOUNT_QC_2026`) | **2 172 $** | Revenu Québec TP-1.G ligne 361, contribuable seul |
| **Supplément monoparental** (NON modélisé — hors scope) | 2 681 $ | ajout si ≥ 1 enfant à charge (réduit −1/12/mois d'Allocation famille) ; exigerait `childrenCount` → différé (un parent seul touche quand même la BASE 2 172 $ via le gate `!hasSpouse`) |
| Seuil revenu familial — sans conjoint | 27 835 $ | crédit complet en dessous (ancien) |
| Seuil revenu familial — avec conjoint | 45 270 $ | crédit complet en dessous (ancien) |
| **Seuil revenu familial net — personne vivant seule (2026)** | **42 955 $** | nouveau ; ancien 42 090 $ (2025) |
| Taux de réduction (`QC_LINE_361_REDUCTION_RATE`) | 18,75 % | au-delà du seuil applicable (personne vivant seule + âge + revenu retraite, PUIS réduit une fois) |
| Âge minimum | 65 ans | |
| Conversion en crédit (taux) | **14 %** | taux du crédit non remboursable ligne 361 QC |
> **Mécanique (source : MFQ Dépenses fiscales 2025, fiche 110606, Tableau C.31 + Loi sur les impôts art. 752.0.7.4)** :
> les montants « Personne vivant seule » et « Supplément monoparental » s'ADDITIONNENT aux montants âge + revenus
> retraite. L'**ensemble** (somme des 3-4 montants applicables) est réduit **UNE SEULE FOIS** de 18,75 % au-delà
> du seuil **42 955 $** (revenu familial net), puis converti en crédit à 14 %. Supplément monoparental réduit de
> **1/12 par mois d'Allocation famille** (cohabitation bénéficiaire). Seuil arrondi au 5 $. Bascule 2026 : nouveau
> seuil 42 955 $ ; ancien barème couple/seul (27 835 / 45 270) **archivé**. Les paliers individuels seul/couple n'existent plus.
> Indexation 2026 : +2,05 % (QC), +2,0 % (féd).
> ⚠️ **Limite d'implémentation (TP1G-VIVANT-SEUL, 2026-07-07)** : le montant « personne vivant seule » n'est appliqué
> qu'au bloc **65+** (`calculateAgeAndPensionCredits` n'est appelée que pour des 65+/retraités) ; un contribuable seul
> de **< 65 ans** n'est PAS crédité (le montant est en réalité indépendant de l'âge, mais l'étendre = surface golden
> énorme sur tout actif solo → différé). Gate `!hasSpouse` = solo ET survivant (tous deux 1 contribuable via `taxFilers`).

### Assiette du revenu de pension ADMISSIBLE (féd 31400 + QC 361) — règle ET implémentation
**Règle (ARC/RQ)** : sont admissibles la rente viagère d'un régime de pension (RPA/DB) et, à 65 ans+,
les retraits FERR/RIF et rentes REER. Sont **EXCLUS** : RRQ, PSV, SRG, et les revenus locatifs.
> **Implémentation** (`taxDecember.ts`, FA-1 2026-06-09) : assiette = rente **DB dès 65 ans** +
> retraits **FERR dès 72 ans** (proxy : le moteur convertit REER→FERR à 72, cf §7). Identique à
> l'assiette FRACTIONNABLE (#211). Avant le correctif FA-1, l'assiette incluait à tort RRQ/PSV et
> les loyers (`accRentesYear`) → crédit surévalué ~250-680 $/an/personne 65+.
> Limite assumée (conservatrice) : les retraits FERR 65-71 (conversion volontaire précoce) ne sont
> pas modélisés ; la rente DB avant 65 ans (admissible au FÉDÉRAL 31400 sans âge minimum) est gateée
> à 65 dans le modèle, comme pour le fractionnement (§9) — sens conservateur.
> (Le revenu fractionné REÇU alimente bien le crédit du récipiendaire depuis **PV-3** — cf §6.)

---

## 5. Cotisations santé QC (2026)

### RAMQ — assurance médicaments (ligne 447 / Annexe K)
Sources : RAMQ, Revenu Québec ligne 447, CFFP U. Sherbrooke. **Prime max : 766 $/adulte**.
| Paramètre | Célibataire | Couple (par adulte) |
|---|---|---|
| Exemption (revenu familial net) | 19 500 $ | 31 610 $ |
| Bonus exemption — 1 enfant | +4 105 $ | +12 110 $ |
| Bonus exemption — 2 enfants et + (total) | +7 895 $ | +16 215 $ |
| Taux tranche 1 (1ers 5 000 $ d'excès) | 7,65 % | 3,84 % |
| Taux tranche 2 (9 600 $ suivants) | 11,48 % | 5,75 % |
> Exemptions : couverture privée (employeur/conjoint), 65+ avec SRG max, étudiant 18-25, etc.
> → le caller passe `exempt: true`.

### FSS — Fonds des services de santé (ligne 446 / Annexe F) — barème **2026**
S'applique surtout aux retraités/indépendants (les salariés sont couverts par l'employeur).
**Cotisation max : 1 000 $.** Vérifié 2026-06-11 (FA-8) — sources : Revenu Québec « Cotisation
des particuliers au FSS » + CFFP U. Sherbrooke. Remplace le barème 2025 que portait le code
(18 130 / 33 130 / 63 060 / 148 030) sous un libellé « 2026 ».
| Revenu net | Cotisation |
|---|---|
| ≤ 18 500 $ | 0 $ |
| 18 500 → 33 500 $ | 1 % × (revenu − 18 500) |
| 33 500 → 64 355 $ | 150 $ (fixe) |
| 64 355 → 149 355 $ | 150 $ + 1 % × (revenu − 64 355) |
| ≥ 149 355 $ | 1 000 $ |
> Formule officielle : « moindre de 150 $ et 1 % de l'excédent de 18 500 $ » (revenu ≤ 64 355 $),
> puis « moindre de 1 000 $ et 150 $ + 1 % de l'excédent de 64 355 $ ». Les seuils 33 500 $ et
> 149 355 $ sont les points de bascule DÉRIVÉS (équivalence exacte avec la forme par paliers du
> code). Limite assumée (conservatrice) : le modèle indexe AUSSI les montants 150 $/1 000 $ au-delà
> de 2026 (`getIndexedBracketsForYear`) alors qu'ils sont historiquement GELÉS (identiques
> 2025/2026) — sur-coût FSS ~2 %/an les années lointaines.

---

## 6. Programmes de retraite fédéraux

### Report / anticipation des rentes publiques (facteurs d'ajustement)
Source du début de rente choisi par l'utilisateur. **Source unique** : `utils/tax.ts`
(`rrqAdjustmentFactor` / `psvDeferralFactor` + taux `RRQ_DEFERRAL_RATE_PER_MONTH` etc.),
consommée par `services/projection/retirementIncome.ts` + `setupSimulation.ts`.
| Rente | Ajustement / mois | Plage | Facteur aux bornes | Source |
|---|---|---|---|---|
| RRQ — **report** après 65 (`rrqAdjustmentFactor`) | **+0,7 %/mois** | 65 → **72** (max +84 mois) | **1,588** à 72 ans (84 × 0,7 % = +58,8 %) | Retraite Québec |
| RRQ — **anticipation** avant 65 (`rrqAdjustmentFactor`) | **−0,6 %/mois** | 60 → 65 (max −60 mois) | 0,64 à 60 ans (−36 %) | Retraite Québec |
| PSV / OAS — **report** après 65 (`psvDeferralFactor`) | **+0,6 %/mois** | 65 → 70 (max +60 mois) | **1,36** à 70 ans (60 × 0,6 %) | Service Canada |
| PSV / OAS — **bonus 75+** (`PSV_BONUS_75_PLUS`) | n/a | dès 75 ans | **+10 %** | Service Canada (depuis juillet 2022) |
> **Report RRQ étendu à 72 ans** depuis le 1ᵉʳ janvier 2024 (avant : 70). Montants max 2026 (Retraite
> Québec) : 60 ans **964,90 $/mois**, 65 ans **1 507,65 $**, 72 ans **2 394,15 $**. La PSV ne se reporte
> pas au-delà de 70 ans et vaut 0 $ avant 65 ans.
>
> **Début des rentes = CHOIX indépendant de l'âge d'arrêt de travail** (champs `rrqStartAge` 60-72 /
> `psvStartAge` 65-70 ; défaut `min(targetAge, 65)`). Correctif 2026-06 : l'ancien `max(60/65, targetAge)`
> forçait les rentes à démarrer à l'âge de retraite → « pas de rente avant l'âge d'arrêt » pour une
> retraite tardive, alors qu'on touche le RRQ dès 65 même en continuant à travailler. `delayPensions`
> (report optimal) vise RRQ 72 / PSV 70.

### Prorata RRQ / résidence PSV (`retirementIncome.ts`) — FA-8 (2026-06-11)
- **RRQ — approximation de MODÈLE « 39 meilleures années »** (`RRQ_DENOMINATOR_YEARS = 39`) :
  la rente officielle = moyenne des gains ouvrant droit à pension AJUSTÉS sur la période cotisable
  (18 ans → début de la rente, ≈ 47 ans à 65 ans), avec **retranchement de 15 % des mois les plus
  faibles** (Retraite Québec) ≈ conserver **39 années sur 47** (8 retirées). Le moteur approxime :
  `prorata = min(1, années au Canada entre max(18, arrivée) et targetAge / 39) × min(1, salaire/MGA)`
  — salaire courant et MGA projetés au MÊME facteur (inflation + 0,5 %/an), donc ratio
  gains/MGA stable sur la carrière (cf B-AUDIT-4). **FISC-RRQ-PRORATA (2026-06-16)** : le prorata de
  résidence ET le ratio gains/MGA sont calculés **PER-CONJOINT** (arrivée via `getResidencyStartYear`,
  gate `isImmigrant` — comme la PSV/CELI/REER) puis moyennés ; avant, la résidence venait de `users[0]`
  seul (faux pour un couple d'arrivées inégales). Un natif (`isImmigrant` faux) ⇒ arrivée = 18 ⇒ prorata plein.
- **PSV — règle OFFICIELLE de résidence** (Service Canada) : admissible à partir de **10 ans** de
  résidence au Canada après 18 ans (`PSV_MIN_RESIDENCY_YEARS`, versement au Canada) ; pension
  **PLEINE à 40 ans** de résidence (`PSV_FULL_RESIDENCY_YEARS`) ; entre les deux, **prorata en
  40ᵉˢ** (`min(1, années/40)`). Moins de 10 ans → 0 $. Résidence saisie par utilisateur
  (`psvResidencyYears`, dérivée de `canadaArrivalYear` pour un immigrant).

### Split 65/35 du champ agrégé `governmentPension` — hypothèse de MODÈLE (PAS une règle ARC/RQ)
`GOV_PENSION_RRQ_SHARE = 0,65` / `GOV_PENSION_PSV_SHARE = 0,35` (`utils/tax.ts`, FA-8 2026-06-11) :
quand l'utilisateur ne fournit que le champ AGRÉGÉ legacy `governmentPension` (RRQ+PSV combinés),
le moteur le scinde 65 % RRQ / 35 % PSV — source unique des 3 sites (`setupSimulation`,
`retirementIncome`, `estateCalculation`). Ordre de grandeur d'un cotisant proche du maximum
(RRQ 65 ans : 1 507,65 $/mois, cf tableau ci-dessus, vs PSV pleine). Les champs PRÉCIS
`rrqEstimateMonthly`/`psvEstimateMonthly` (relevés Retraite Québec / Service Canada) **priment** ;
le split n'est qu'un repli. Conséquence assumée : le facteur de report/anticipation propre à
chaque rente s'applique ensuite à la part correspondante.

### Fractionnement de revenu de pension (couple) — `services/projection/taxDecember.ts`
Sources : ARC ligne 11600 / formulaire **T1032** ; Revenu Québec **Annexe Q**. Un couple peut
**transférer jusqu'à 50 %** du revenu de pension ADMISSIBLE du conjoint au revenu élevé vers l'autre,
pour minimiser l'impôt combiné (élection optionnelle).
| Revenu | Admissible au fractionnement | Dans le moteur |
|---|---|---|
| Rente viagère DB (RPA) | Féd : tout âge ; **QC : 65+** | gate **65** (calcul combiné QC+féd → on retient 65) |
| Retraits **FERR/RIF** | **65+** (compte déjà FERR) | gate **72** (= âge de conversion REER→FERR du modèle, cf §7) |
| RRQ/PSV, retraits **REER** (avant conversion) | **NON admissibles** | exclus de l'assiette |
> **Implémentation** : `taxDecember` calcule l'impôt du ménage AVEC et SANS fractionnement et garde le
> **minimum** (élection optionnelle → ne peut jamais augmenter l'impôt). Transfert borné à ≤ 50 % de
> l'admissible du cédant. **PV-3 (2026-06-10)** : l'assiette du crédit pension (féd 31400 / QC 361)
> SUIT la pension fractionnée — le récipiendaire réclame le crédit sur la pension reçue (ARC : le revenu
> fractionné L.11600 est réputé revenu de pension admissible du cessionnaire pour la L.31400, guide
> T4040/formulaire T1032 ; QC Annexe Q pour la L.361), le cédant le perd sur la part cédée (déduit à
> sa L.21000 ; chacun plafonné au max féd/QC). Limite assumée restante
> (conservatrice, cf §9) : gate DB à 65 (vs tout âge au fédéral).

### PSV / OAS — récupération (clawback)
- Seuil de récupération 2026 (`OAS_CLAWBACK_THRESHOLD_2026`) : **95 323 $** (ARC ; 93 454 $ en 2025).
- Taux de récupération (`OAS_CLAWBACK_RATE`, nommé FA-8 2026-06-11) : **15 %** de l'excédent
  (ARC — impôt de récupération PSV, ligne 23500).
- Le seuil s'applique **PAR PARTICULIER** (revenu net individuel), jamais au revenu du ménage.
> **Implémentation** (`taxDecember.ts:computeOasClawback`, FA-2 2026-06-09) : clawback calculé
> PAR CONJOINT (revenu_i = pension_i + retraits REER_i + part égale des loyers, vs seuil indexé),
> plafonné à sa part de PSV. Avant FA-2, le revenu FAMILIAL était comparé au seuil individuel →
> clawback fictif jusqu'à ~14 k$/an pour un couple 95-190 k$. Limite assumée : part de PSV
> répartie également entre conjoints.
> **Cap = PSV réellement VERSÉE (FA-8, 2026-06-11)** : le plafond de récupération par conjoint
> suit désormais la PSV du breakdown de décembre (facteur de report ×1,36 max, bonus 75+ ×1,10,
> prorata de résidence, facteur survivant — HORS SRG), plus la pension de BASE sans report.
> Corrige : clawback SOUS-estimé pour un reporteur 66-70 à haut revenu (non conservateur),
> SURestimé si prorata de résidence < 1, et clawback FICTIF possible avant `psvStartAge`
> (PSV non versée → cap 0). `psvBasePension` ne sert plus que de repli rétro-compat.

### SRG — Supplément de revenu garanti (Service Canada, barème 2026 Q1, indexé trimestriellement)
> **Règle** : le SRG est **NON IMPOSABLE** (il entre dans le revenu NET — ligne 148→275 QC,
> 14600→23600 féd — mais est déduit au revenu IMPOSABLE : ligne 295 QC / 25000 féd) ; il est réduit
> de ~50 ¢ par dollar de revenu AUTRE que la PSV, établi sur la déclaration de l'**année précédente**
> (tout revenu imposable : RRQ, pensions, retraits REER/FERR, loyers, gains…).
> **Implémentation** (FA-3, 2026-06-09) : (a) le SRG est exposé séparément (`RetirementIncomeBreakdown.gis`)
> et SOUSTRAIT de toutes les assiettes fiscales de décembre (impôt, RAMQ, FSS, empilement gains/
> dividendes, clawback PSV) — il reste du revenu cash ; (b) le test de réduction inclut désormais
> les retraits REER/FERR + loyers de l'ANNÉE PRÉCÉDENTE (capturés au reset de janvier, déflatés).
> **PV-9 (2026-06-10)** : le test SRG inclut aussi les **gains en capital RÉALISÉS** de l'année
> précédente (montant imposable ×0,5, déflaté) — `accCapitalGainsYear` est déjà net de la banque de
> pertes et ≥ 0 = gain RÉALISÉ net BRUT, dont l'inclusion 50 % donne la ligne 12700). Idem **clawback PSV** : les gains imposables de l'année
> COURANTE entrent dans le revenu de récupération (ligne 23400), répartis également par conjoint.
> Limites assumées : année 1 de simulation sans historique (assiette RRQ+DB seule, optimiste, borné à
> 12 mois) ; le salaire de l'année précédant la retraite n'est pas compté ; janvier de l'année Y teste
> l'assiette Y-2 (décalage d'un mois — le vrai cycle SRG court juillet→juin) ; dividendes/intérêts
> non-reg encore hors test (reste OUVERT — non couvert par le lot FA-8 2026-06-11, cf BACKLOG).
> **Indexation** (FA-9, 2026-06-10) : le moteur calcule le SRG **en base réelle 2026** (barème de
> base ci-dessous contre le revenu test déflaté) puis nominalise UNE fois ×inflation simulée —
> comme RRQ/PSV. Avant : `calculateGISBenefit(year)` indexait max+seuils ×1,02^Δ PUIS le résultat
> était re-multiplié ×inflation → max **double-indexé** (surévalué ~49 % à 20 ans, soit ~+6,5 k$/an
> fictifs **en $ réels 2026, célibataire** ≈ 9,6 k$ nominaux à l'an 20) et seuils nominaux face à
> un revenu réel (réduction trop clémente). En pratique le barème SRG suit l'IPC trimestriellement :
> la modélisation « réel + inflation simulée » est l'approximation cohérente du module retraite.
> Effet de bord assumé (extension FA-3b) : `dbMonthly` quasi-nominal entre dans le revenu test réel
> → un profil pension DB voit son SRG coupé de plus en plus tôt avec l'horizon (conservateur,
> amplitude ×1,49 à 20 ans) — déflater la composante DB = reste OUVERT (non couvert par le lot
> FA-8 2026-06-11, cf BACKLOG).
| Paramètre | Célibataire 65+ | Couple (2 reçoivent PSV), par adulte |
|---|---|---|
| Maximum mensuel | 1 105 $ | 662 $ |
| Seuil de revenu (autre que PSV) | 22 512 $ | 29 760 $ (combiné) |
| Récupération (`GIS_CLAWBACK_RATE`) | 50 ¢ / 1 $ | 50 ¢ / 1 $ |
> Cas « conjoint sans PSV / Allocation » : non implémentés.
>
> **Limite assumée — discontinuité au seuil (FA-11, 2026-06-10)** : le modèle applique la
> récupération LINÉAIRE 50 ¢/$ depuis le max (1 105 $/mois célibataire) avec coupure DURE au seuil
> officiel (22 512 $). Or 1 105×12 / 0,50 = 26 520 $ > 22 512 $ → **marche d'environ 167 $/mois**
> juste sous le seuil, et SRG légèrement **SURÉVALUÉ** (non conservateur) dans la bande haute
> (~18-22,5 k$). Cause réelle : le barème Service Canada intègre un **montant complémentaire
> (top-up)** récupéré PLUS VITE (taux additionnel ~25 ¢/$ au-delà d'un seuil propre) — la vraie
> courbe atteint 0 $ continûment au seuil officiel. Les paramètres exacts du top-up ne sont publiés
> que via les **tables trimestrielles** de Service Canada (pas de formule officielle) : les modéliser
> sans source violerait la règle « aucun chiffre fiscal non sourcé » → documenté comme limite, à
> modéliser si on transcrit un jour les tables (candidat 🧭, cf BACKLOG FA-11). Les deux ancres du
> modèle (max à revenu 0, zéro au seuil officiel) restent exactes et sourcées.

### Décès du conjoint — survivorMode (FA-10, 2026-06-10)
> Quand le conjoint (user2) décède (`modelSurvivor`, Monte Carlo), le moteur traite le SURVIVANT
> (user1) comme **contribuable unique** :
> 1. **Déclaration individuelle** : impôt de décembre sur UNE tête (un seul BPA, barème progressif
>    une fois), seuils « sans conjoint » (ligne 361 QC seuil unique 42 955 $ + montant « vivant seule », RAMQ exemption célibataire,
>    FSS ×1), AUCUN crédit d'âge/pension du défunt. Clawback PSV idem (FA-2, `oasBeneficiaries=1`).
> 2. **Roulement intégral au conjoint** (hypothèse) : REER/FERR roulés sans imposition immédiate
>    (LIR 60(l)) — les retraits ultérieurs sont imposables à 100 % entre les mains du survivant ;
>    non-enregistré roulé à l'ACB (LIR 70(6)). Pas de déclaration finale du défunt modélisée.
> 3. **DB de survivant** : la rente réduite (`dbSurvivorPct`) reste admissible au crédit pension
>    65+ sur la tête du survivant (assiette AGRÉGÉE, pas divisée). La rente de survivant RRQ
>    (`rrqSurvivorPct`) transite par la composante RRQ — exclue du crédit (§4).
> 4. **Fractionnement de pension : coupé** dès l'année du décès (l'élection T1032 au prorata avec
>    la déclaration finale du défunt n'est pas modélisée — conservateur, borné à cette année-là).
> 5. **SRG : barème CÉLIBATAIRE** (max 1 105 $, seuil 22 512 $) sur le revenu test COMPLET du
>    survivant (avant : barème couple ×2 + revenu divisé par 2 → SRG fictif ~2,6 k$/an).
> 6. Salaire du défunt = 0 (revenu actif, retenue mensuelle, récolte de gains au palier ×1).
> Limites connues (restes OUVERTS — non couverts par le lot FA-8 2026-06-11, cf BACKLOG) : les
> droits CELI/REER/CELIAPP continuent de s'accumuler ×N (plafonds non survivor-aware) ; retenue
> FERR estimée sur 2 têtes (effet de timing seulement, réconcilié en décembre). Le « montant pour
> personne vivant seule » QC EST désormais modélisé pour le survivant (TP1G-VIVANT-SEUL 2026-07-07,
> gate `!hasSpouse` via `taxFilers` → le survivant le reçoit ; cf §4).

---

## 7. Plafonds de régimes enregistrés

| Régime | Constante | Valeur |
|---|---|---|
| RAP (Régime accession propriété) | `RAP_LIMIT_PER_USER` | 60 000 $ / personne |
| CELIAPP — plafond à vie | `FHSA_LIFETIME_LIMIT_PER_USER` | 40 000 $ / personne |
| CELIAPP — plafond annuel | `FHSA_ANNUAL_LIMIT_PER_USER` | 8 000 $ / personne — ⚠️ le REPORT de droits (jusqu'à 8 000 $ d'années antérieures, déduction max 16 000 $/an à l'ARC) n'est PAS modélisé (choix de modèle, cf clamp `getTaxSituation` + `taxJanuary.ts` : 8 000 × users). Ne pas « corriger » le clamp sans modéliser le report entier. |
| PBMA (palier de base montant ajusté) | `PBMA_THRESHOLD_PER_USER` | 17 183 $ |

### CELI — plafonds annuels (`CELI_ANNUAL_LIMITS`)
2009-2012 : 5 000 · 2013-2014 : 5 500 · 2015 : 10 000 · 2016-2018 : 5 500 · 2019-2022 : 6 000 ·
2023 : 6 500 · 2024-2026 : **7 000** · 2027-2030 : 7 500 (estimés, à confirmer au Budget).
> **Implémentation** (`taxJanuary.ts`, FA-4 2026-06-09) : le moteur lit `CELI_ANNUAL_LIMITS` pour
> les années connues (SOURCE UNIQUE — l'ancien recalcul local 7000×inflation donnait 7 000 $ en
> 2027 au lieu de 7 500 $) ; au-delà de la dernière année connue, extrapolation indexée par
> `simInflation` arrondie au **500 $** le plus proche (`CELI_LIMIT_ROUNDING`, `utils/tax.ts` —
> mécanisme légal d'indexation ARC).
> **FA-8 (2026-06-11)** : `calculateCeliRoom` (droits HISTORIQUES, hors moteur — UI/MCP/setup)
> partage la MÊME formule via `LAST_KNOWN_CELI_YEAR` exporté (`utils/tax.ts`) : dernière limite
> connue × (1+i)^Δ arrondie au 500 $, avec i ≈ 2 %/an hors moteur (ADR 009) vs `simInflation`
> dans le moteur. L'ancien fallback `|| 7 500 $` FIGÉ non indexé (divergent dès 2031) est supprimé ;
> étendre la table `CELI_ANNUAL_LIMITS` met à jour les deux consommateurs automatiquement.

### REER — plafonds annuels (`RRSP_ANNUAL_LIMITS`)
2024 : 31 560 · 2025 : 32 490 · **2026 : 33 810** · 2027 : 34 480 · 2028 : 35 170 ·
2029 : 35 870 · 2030 : 36 590 (2027+ estimés, à confirmer au Budget).
Espace gagné = **18 % du revenu GAGNÉ** de l'année précédente (`RRSP_ROOM_RATE`, `utils/tax.ts`),
moins le facteur d'équivalence, plafonné par `RRSP_ANNUAL_LIMITS`. Source : ARC.

> ⚠️ **« Revenu GAGNÉ » ≠ revenu total** : ni les gains en capital, ni un paiement de revenu
> accumulé de REEE n'ouvrent de droits REER. C'est précisément le piège évité lors de la tentative
> `[FISC-REEE-GRANT-CLAWBACK]` — y ajouter le PRA aurait fabriqué des droits inexistants.
> ⚠️ Corrigé le 2026-08-06 : cette ligne disait « 18 % du **brut** », ce qui contredisait la règle
> ARC 146(1) ET le code (`activeIncome.ts:113-120` neutralise le salaire pendant AE/LTD). Une source
> de vérité qui se contredit fabrique un faux finding à la session suivante.
> ⚠️ **Approximation MÉNAGE assumée** : `taxJanuary.ts` calcule les droits sur le revenu du MÉNAGE
> (`min(plafond × nb_conjoints, revenu_ménage × 18 %)`), alors que la règle ARC est **par personne**.
> Mesuré sur un ménage à 250 k$ avec un seul gagnant : 45 000 $ accordés vs 34 480 $ dus. Corriger
> serait un changement de MODÈLE → `[FISC-RRSP-ROOM-PER-USER]`, en attente d'arbitrage.

### FERR / RRIF — conversion et retrait minimum (`services/projection/helpers.ts:RRIF_RATES`)
**Règle ARC.** La conversion REER→FERR est obligatoire **au plus tard à la fin de l'année des
71 ans**. Mais **aucun retrait minimum n'est dû l'année d'ouverture** du FERR. Pour le cas standard
(conversion à l'échéance des 71 ans), le **1er retrait minimum obligatoire tombe l'année des 72 ans**.
Le facteur 71 ans (5,28 %) ne s'applique qu'à une conversion **volontaire précoce**.
> **Implémentation** (`taxJanuary.ts` §4) : le moteur force le retrait minimum à partir de **72 ans**
> (`if (ctx.age >= 72)`). Le facteur 71 reste dans la table pour complétude (conversion précoce non
> modélisée). Montant = solde FERR (1er janvier) × facteur prescrit selon l'âge.
> **Retenue FERR — assiette du crédit pension (FA-8, 2026-06-11, aligné FA-1)** : le proxy de taux
> marginal de la retenue passe en `eligiblePensionIncome` les retraits REER/FERR de l'année
> précédente par tête (≈ FERR à 72+) au lieu du revenu TOTAL (qui incluait RRQ/PSV/SRG — assiette
> surévaluée vs la règle §4). Effet chiffré NUL aujourd'hui : `marginalRate` ne dépend que des
> paliers (pas des crédits d'âge/pension), et la retenue est réconciliée à la déclaration de
> décembre (timing pur) — l'assiette correcte est passée pour rester juste si `marginalRate`
> devient crédit-aware. La rente DB n'est pas isolable dans le contexte de janvier → exclue
> (conservateur).

| Âge | Facteur | Âge | Facteur | Âge | Facteur |
|---|---|---|---|---|---|
| 71 | 5,28 % | 79 | 6,58 % | 87 | 9,55 % |
| 72 | 5,40 % | 80 | 6,82 % | 88 | 10,21 % |
| 73 | 5,53 % | 81 | 7,08 % | 89 | 10,99 % |
| 74 | 5,67 % | 82 | 7,38 % | 90 | 11,92 % |
| 75 | 5,82 % | 83 | 7,71 % | 91 | 13,06 % |
| 76 | 5,98 % | 84 | 8,08 % | 92 | 14,49 % |
| 77 | 6,17 % | 85 | 8,51 % | 93 | 16,34 % |
| 78 | 6,36 % | 86 | 8,99 % | 94 | 20,00 % |
> **95 ans et + : plafond 20 %** (`RRIF_RATE_PLATEAU` / `RRIF_PLATEAU_AGE`, `helpers.ts`).
> Source : ARC, facteurs FERR prescrits (post-2015).
> ⚠️ Le plateau **échappait au premier scan** du garde de constantes : écrit en repli
> (`RRIF_RATES[age] || 0.20`), il ne ressemblait pas à un opérateur de calcul. C'est le scan élargi
> qui l'a trouvé, pas l'œil.
> **Le seuil de 72 ans est nommé** (`RRIF_FIRST_WITHDRAWAL_AGE`, `helpers.ts`) : il vivait en dur
> sur DEUX modules (`taxJanuary` pour la conversion, `taxDecember` pour l'assiette du crédit
> pension) — la configuration jumelle exacte qui avait laissé le `0.18` survivre à son premier ancrage.
> **[FISC-RRIF-FRACTIONAL-AGE] Le repli n'est plus attrape-tout.** `rrifRateForAge()` rend le
> plateau à partir de 95 ans **explicitement**, l'âge entier pour un âge fractionnaire, et **0**
> pour un âge non fini. Avant, tout âge absent de la table recevait le facteur le plus PUNITIF du
> barème : 72,5 ans sortait à 20 % au lieu de 5,40 %, et un âge `NaN` traversait le filtre
> `age < 72` (toute comparaison avec NaN est fausse) pour ressortir à 20 % lui aussi. Durcissement,
> pas correction d'un bug observable — aucun producteur d'âge fractionnaire n'existe aujourd'hui.

> ⚠️ **`94 : 20,00 % est CONTESTÉ`** — le facteur prescrit serait 18,79 %, le plateau ne commençant
> qu'à 95 ans. Écart MESURÉ : **+13 726 $** de patrimoine final si corrigé. Non modifié : le
> règlement 7308(4) n'est pas atteignable depuis le conteneur (proxy). Routé dans
> `docs/A_FAIRE_MOI.md` → `[FISC-RRIF-94-FACTOR]`.

### Ancrage des constantes du moteur — FISC-CONST-ANCHOR-DEBT (2026-08-06)

Ce fichier ne redit **pas** les valeurs ici : chaque sujet n'a qu'un seul endroit, et c'est sa
propre section. Ce qui suit est la **provenance** — d'où viennent ces constantes et pourquoi elles
ont été déplacées.

`[FISC-CONST-GUARD-V2]` a inventorié les littéraux en position de calcul dans les modules fiscaux
et en a sorti des valeurs qui vivaient **EN DUR** dans `services/projection/`, sans source —
exactement la classe du `0.92`. Sont désormais nommées et importées depuis la source unique :

- `RRSP_ROOM_RATE`, `CELI_LIMIT_ROUNDING` (`utils/tax.ts`) → §REER et §CELI ;
- `RRIF_RATE_PLATEAU`, `RRIF_PLATEAU_AGE`, `RRIF_FIRST_WITHDRAWAL_AGE` (`helpers.ts`) → §FERR.

> ⚠️ **Leçon de la dédup (2026-08-06, `[FISC-REF-DEDUP]`)** : la première rédaction de cette section
> RECOPIAIT les trois valeurs dans un tableau, alors que §CELI, §REER et §FERR les portaient déjà.
> Deux endroits par sujet dans une source de vérité, c'est la divergence de demain — et ça a produit
> **deux contradictions internes en une seule journée** (« 18 % du brut » vs « du revenu gagné », et
> un commentaire annonçant `??` là où le code écrivait `||`). Une valeur, un endroit.
> ⚠️ **Ce que l'ancrage NE fait PAS** : il rend une constante traçable, pas juste. Le `94 : 20,00 %`
> reste contesté (§FERR) et les droits REER restent calculés au niveau du MÉNAGE (§REER) — ancrer
> a rendu ces deux écarts VISIBLES, c'est tout le bénéfice, et c'est déjà beaucoup.

### REEE — SCEE / IQEE (`services/projection/childrenReee.ts`) — FISC-REEE-CONST (2026-06-16)
Le moteur cotise au REEE pour maximiser les subventions et applique le plafond à vie. Valeurs (vérifiées
exactes par `fiscal-accuracy`) :
| Élément | Valeur | Source |
|---|---|---|
| **SCEE** (Subvention canadienne pour l'épargne-études) | **20 %** de la cotisation, max **500 $/an** (1 000 $/an en rattrapage), **7 200 $ à vie** | ARC |
| **IQEE** (Incitatif québécois à l'épargne-études) | **10 %** de la cotisation, max **250 $/an** (500 $/an en rattrapage), **3 600 $ à vie** | Revenu Québec |
| **Plafond REEE** (`REEE_LIFETIME_LIMIT_PER_BENEFICIARY`) | **50 000 $/bénéficiaire à vie** | ARC §6.9 / F13 |
| Cotisation visée | **2 500 $/an** (5 000 $/an en mode rattrapage tant que SCEE < max théorique) | optimisation subvention pleine |
> ✅ **REEE-LITERALS résolu (2026-06-26)** : ces valeurs sont désormais des **constantes nommées** en tête de
> `childrenReee.ts` (`SCEE_GRANT_RATE`, `SCEE_ANNUAL_GRANT_BASIC/CATCHUP`, `SCEE_LIFETIME_GRANT_LIMIT`, idem `IQEE_*`,
> `REEE_LIFETIME_LIMIT_PER_BENEFICIARY`, `REEE_TARGET_ANNUAL_CONTRIB_BASIC/CATCHUP`), qui pointent vers cette section.
> Refactor pur (valeurs inchangées). NB : l'impôt sur le PRA à la fermeture (`REEE_AIP_TAX_RATE` ~20 %) est une
> **approximation de modèle**, PAS un taux combiné officiel — à raffiner séparément.
> Le **clawback d'allocation** (`householdGross > 150 000 $` → dégressif sur 100 000 $) est une heuristique
> de modèle (PAS un barème ARC/RQ officiel d'allocation), à raffiner si besoin.

---

## 8. Immobilier (SCHL / OSFI / mutations / TPS-TVQ neuf) — `services/realEstate.ts`
> Transcrit FA-7 (2026-06-10) depuis le code implémenté (ADR 009, vérifié à la saisie 2026-05).

### Gain en capital immobilier — règles & limites de modélisation (PH4-FUT-B-4, 2026-06-11)
- **Exemption pour résidence principale** (LIR 40(2)b) : le gain sur la vente de la RÉSIDENCE PRINCIPALE
  est **exempt d'impôt** (100 % si RP unique sur toute la période de détention). Appliqué par le levier
  **downsizing** (`realEstateMonth.ts` : l'équité libérée n'incrémente PAS `accCapitalGainsYear`) → aucun
  impôt, aucun effet sur les assiettes de revenu (clawback PSV/SRG, FSS, RAMQ). Conforme.
- **Gain OU perte en capital d'un LOCATIF (≠ RP) à la VENTE** (`monthlyEvents.applyLifeEvents`, RE-GAIN +
  FISC-RE-CAPITAL-LOSS) : gain BRUT SIGNÉ = produit net (95 %) − coût d'achat, routé par la SOURCE UNIQUE
  `portfolioOps.applyCapitalDisposition` (partagée avec NonReg/crypto). Gain ≥ 0 → nette d'abord
  `capitalLossBank` puis alimente `accCapitalGainsYear` (50 % inclus en aval). **Perte < 0 → portée en
  `capitalLossBank`** (LIR 111(1)(b), déductible des gains FUTURS) — avant FISC-RE-CAPITAL-LOSS (2026-06-19)
  un `Math.max(0, …)` l'effaçait silencieusement (avantage fiscal perdu). Exempt pour la résidence principale.
  ⚠️ **Reste** : le gain latent immobilier d'un locatif à la **succession** (`estateCalculation`) utilise
  `Math.max(0, …)` (une perte latente au décès n'a pas de gain futur à compenser — horizon terminé) — cf BACKLOG `[RE-GAIN-SUCC]`.
- `DOWNSIZE_RELEASE_PCT = 0.4` est une **hypothèse de modèle** (fraction d'équité libérée en rachetant
  plus petit), **pas une valeur fiscale** — ajustable, non sourcée.

### Stress test hypothécaire B-20 (`calculateB20StressTest`) — source OSFI, ligne directrice B-20
| Constante | Valeur | Note |
|---|---|---|
| Plancher du taux de qualification (`OSFI_MQR_FLOOR`) | **5,25 %** | qualifying rate = max(plancher, contractuel + tampon) |
| Tampon (`OSFI_MQR_BUFFER`) | **+2,00 pts** | au-dessus du taux contractuel |
| GDS max (`OSFI_GDS_MAX`) | **39 %** | (paiement qualifiant + charges logement) / revenu brut mensuel |
| TDS max (`OSFI_TDS_MAX`) | **44 %** | GDS + autres dettes mensuelles |

### Mise de fonds minimale & amortissement (`calculateMinDownPayment`, `validateMortgageParameters`) — source SCHL
| Prix | Mise de fonds min |
|---|---|
| < 500 000 $ (`SCHL_PRICE_THRESHOLD_TIER1`) | **5 %** |
| 500 000 → 1 500 000 $ (`SCHL_PRICE_THRESHOLD_TIER2`) | 5 % du 1er 500 k$ + **10 %** de l'excédent |
| ≥ 1 500 000 $ | **20 %** (assurance SCHL indisponible) |

Amortissement max : **25 ans** assuré standard · **30 ans** assuré si 1er acheteur OU construction
neuve (règle d'août 2024, `SCHL_AMORT_MAX_INSURED_FTB_OR_NEW`) · **30 ans** conventionnel (≥ 20 %).
Assurance SCHL : **requise si LTV > 80 %**, indisponible si LTV > 95 % ou prix > 1,5 M$.

### Prime d'assurance SCHL (`SCHL_PREMIUM_TIERS`, % du prêt de base, ajoutable au prêt)
| LTV ≤ | 65 % | 75 % | 80 % | 85 % | 90 % | 95 % |
|---|---|---|---|---|---|---|
| Prime | 0,60 % | 1,70 % | 2,40 % | 2,80 % | 3,10 % | **4,00 %** |

### Droits de mutation (« taxe de bienvenue », `calculateWelcomeTax`) — FISC-WELCOME-UNIFY

**SOURCE UNIQUE** : `services/realEstate.ts:calculateWelcomeTax(price, municipality?)`, consommée par
l'UI (`RealEstate.tsx`/`PropertyConfigurator`) ET le moteur (`helpers.ts:welcomeTax` délègue). Le champ
`RealEstateGoal.municipality` (`'montreal' | 'reste_qc'`) sélectionne le barème. **Non défini ⇒ repli
CONSERVATEUR Montréal** (barème le plus élevé) — état transitoire, pas un défaut stocké (l'UI invite à
choisir). Calcul cumulatif par tranche (style impôt).

**Montréal** (surtaxe municipale — Ville de Montréal, règlement sur les droits de mutation **2026**)
| Tranche du prix | Taux |
|---|---|
| ≤ 53 700 $ | 0,5 % |
| 53 700 → 269 300 $ | 1,0 % |
| 269 300 → 538 500 $ | 1,5 % |
| 538 500 → 1 077 000 $ | 2,0 % |
| 1 077 000 → 2 154 000 $ | 2,5 % |
| 2 154 000 → 3 231 000 $ | 3,0 % |
| 3 231 000 → 5 385 000 $ | 3,5 % |
| > 5 385 000 $ | 4,0 % |

**Reste du Québec** (barème provincial de base — Loi concernant les droits sur les mutations immobilières, **2026**)
| Tranche du prix | Taux |
|---|---|
| ≤ 62 900 $ | 0,5 % |
| 62 900 → 315 000 $ | 1,0 % |
| 315 000 → (sans limite 3ᵉ palier) | 1,5 % |

> **Source** : Loi concernant les droits sur les mutations immobilières (RLRQ c. D-15.1), indexation 2026 publiée dans la
> **Gazette officielle du Québec, Partie 1, 2025-06-07 (157ᵉ année, nº 23)**, avis de la ministre des Affaires municipales.
> Indexation 2026 = **+2,3438 %** vs 2025 (61 500→62 900 ; 307 800→315 000). Barème complet jusqu'à 500 000 $ approx.
> Repère : pour un achat à 500 000 $ → **5 885 $** (Montréal) vs **5 610,50 $** (reste du QC, 2026) — Montréal reste le plus élevé (repli conservateur cohérent).
> ⚠️ **Limite assumée** : le barème provincial de base s'applique à tout le Québec sauf Montréal ; toutefois,
> toute municipalité peut ajouter une surtaxe locale (ex. Laval, Longueuil, Québec en appliquent). Les paliers
> municipaux hors Montréal ne sont pas distingués : ils tombent dans `'reste_qc'` → légère sous-estimation possible
> pour les résidences dans les municipalités à surtaxe. Montréal seule a un barème entièrement distinct et surchargé
> (cf tableau Montréal ci-dessus).

### TPS/TVQ résidence NEUVE — remboursements (`calculateGstNewHomeRebate`/`calculateQstNewHomeRebate`)
- **TPS 5 %** (`GST_RATE`) : remboursement **36 %** de la TPS payée si prix ≤ **350 000 $**
  (max **6 300 $**), dégressif linéairement jusqu'à **450 000 $** → 0. Source : ARC RC4028.
- **TVQ 9,975 %** (`QST_RATE`) : remboursement **50 %** de la TVQ payée si prix ≤ **200 000 $**
  (max **≈ 9 975 $**), dégressif jusqu'à **300 000 $** → 0. Source : Revenu Québec (rebate TVQ
  modifié plusieurs fois — implémentation conservatrice, barème courant à la saisie).

### Marge réavançable / Smith Manoeuvre (`realEstateMonth.ts`)
- Plafond HELOC : `dette Smith + hypothèque ≤ 65 % de la valeur` (**LTV 65 %**, plafond B-20 de la
  portion réavançable) ; l'excédent déclenche un **margin call** (remboursement forcé).
- Hypothèse de modèle (PAS une constante fiscale) : **taux HELOC 5 %/an** en dur
  (`realEstateMonth.ts:336`) — à paramétrer un jour si besoin (reste OUVERT, non couvert par le
  lot FA-8 2026-06-11 — cf BACKLOG).

---

## 9. Limites connues (assumées, non-bugs)
- **ACB initial NonReg/crypto = valeur de départ** (`nonRegACB = nonReg`, `cryptoACB = crypto`) :
  le gain latent ACCUMULÉ avant la simulation n'est pas modélisé (coût d'acquisition historique
  inconnu — no-fake-data). Seule la croissance future simulée devient imposable → impôt à la
  disposition SOUS-ESTIMÉ pour un actif à fort gain latent au départ. Symétrique NonReg/crypto.
- **BPA fédéral dégressif** haut revenu (> ~177 k$) : non modélisé (on retient le palier max).
- **Indexation 2027+** : repose sur ~+2 %/an estimé tant que les montants officiels ne sont
  pas publiés (`getIndexedBracketsForYear`).
- **Aller-retour réel↔nominal** des paliers : ✅ **CORRIGÉ 2026-08-01 (`[FISC-BRACKET-REALINDEX]`)**.
  L'erreur (requalifiée MESURÉE 2026-07-31) n'était PAS « à forte inflation » : le moteur déflatait
  le revenu PUIS appliquait un barème indexé `1,02^Δ` → paliers élargis de 2 %/an EN DOLLARS RÉELS,
  indépendamment de `simInflation` (présent au réglage par défaut ; à revenu réel constant 98 400 $,
  l'impôt réel fondait de 24 932 $ à 16 740 $/pers sur 30 ans). **Modèle corrigé** : param
  `realDeflator` (= `(1+i)^Δ`) sur `getIndexedBracketsForYear` et ses dérivés (paliers, BPA,
  crédits d'âge/ligne 361, RAMQ, FSS, `getMarginalRate`, `calculateFiscalReport`) → facteur effectif
  `1,02^Δ/(1+i)^Δ` : `palier_réel = palier_2026 × (1,02/(1+i))^Δ`, soit l'indexation légale
  2 %/an vue en termes réels (constant si `i = 2 %`). **Une exception mesurée** (panel 2026-08-01) :
  le crédit pension fédéral 2 000 $ (GELÉ nominalement, `utils/tax.ts` `PENSION_INCOME_AMOUNT_FED`)
  n'est pas divisé par le déflateur → en espace réel il vaut de facto 2 000 $ constants au lieu de
  `2 000/(1+i)^Δ` (sous-imposition ≤ 250,50 $ réels/pers/an ; pré-existant, correctif =
  `/realDeflator`, chantier séparé avec re-base de goldens — cf BACKLOG `[FISC-PENSION-CREDIT-REAL]`).
  Sites en espace RÉEL qui passent le deflator : `taxDecember` (salarial, `combinedTaxFor`,
  RAMQ, FSS) **et l'impôt latent** (`latentTax.ts` — site oublié de la passe initiale, corrigé
  2026-08-01 : sous-évaluait l'obligation dormante affichée de ~35 %/~53 k$ à 30 ans).
  `taxJanuary` est AUSSI en espace réel (revenu déflaté → `.marginalRate` au barème 2026 :
  cohérent avec décembre seulement à i = 2 % ; effet de timing pur, réconcilié en décembre via
  `withholdingAlreadyTaken`). Les blocs NOMINAUX (empilement gains, dividendes, estate,
  `firstCombinedBracketTopForYear`) restent en `1,02^Δ` nominal — c'est le bon espace pour
  eux. Discriminant : impôt réel CONSTANT sur salarié à revenu réel constant (écart < 1 $ sur
  29 ans — niveau re-basé 2 702 → **1 458,82 $/an** par `[FISC-WHT-92PCT]`, le reste étant la prime
  RAMQ ; la CONSTANCE reste l'invariant) ; goldens re-basés SCIEMMENT (retraités : impôt à vie
  +62 % sur le scénario de référence, direction conservatrice restaurée).
  Cf `tests/services/projection.bracketRealIndex.test.ts`.
- **Retenue salariale employeur** : ✅ **CORRIGÉ 2026-08-01 (`[FISC-WHT-92PCT]`, GO Marc)** —
  retenue = **100 %** de l'impôt sans déductions (`taxDecember.ts`). Fondement : les tables de
  retenue **TP-1015.F (RQ) / T4032-QC (ARC)** sont construites pour que la retenue de l'année
  ÉGALE l'impôt annuel d'un salarié régulier (crédits TD1/TP-1015.3 intégrés) — solde ≈ 0 à la
  déclaration. L'ancien ×0,92 (hypothèse NON SOURCÉE) facturait ~8 % « restants » en avril ALORS
  QUE le `netSalary` saisi est net de TOUTES les retenues → impôt compté en double (mesuré :
  1 243,23 $/an réel sur le couple de référence à 98,4 k$ ; jusqu'à 6 393 $/an à 240 k$).
  Depuis le fix, le solde salarial d'avril ne règle plus que l'écart dû aux déductions (REER…) :
  nul sans déductions, remboursement sinon. **Preuve d'auto-cohérence** (panel #558, mesurée) :
  `calculateNetFromGross` (`utils/tax.ts`) retient exactement `totalTax(brut, 0 déduction)` dans
  le net mensuel que le moteur encaisse — impôt total supporté = `tax(g,0)` (dans le net) +
  solde d'avril. Avec retenue 100 % : `tax(g,0) + [tax(g,d) − tax(g,0)] = tax(g,d)` — EXACT.
  Avec 0,92 : `tax(g,d) + 0,08·tax(g,0)` — sur-imposition structurelle. `1.0` est la seule valeur
  cohérente avec la source unique de conversion brut→net du dépôt. Discriminant :
  `tests/services/projection.whtSettlement.test.ts` (avant : ttp 106 915,04 / NW 720 557,13 ;
  après : 57 722,84 / 819 490,94 sur la fixture de référence 30 ans). La **branche décembre
  retraité est inchangée** : un scénario qui DÉMARRE retraité est bit-identique ; un scénario
  actif→retraite change quand même via le patrimoine accumulé en phase active (mesuré : +21,5 %
  NW sur une fixture 40 ans avec retraite à 62). **Biais assumés** (panel #558) : (a) le net
  MENSUEL encaissé reste le `netSalary` saisi — jamais réconcilié avec l'impôt du MODÈLE (résidu
  mesuré ±3 à 7 k$/an selon la fixture, cf `[ENG-NET-MODEL-RESIDUAL]`) ; (b) un REER cotisé PAR
  RETENUE SALARIALE (l'employeur réduit la rémunération assujettie sans T1213) équivaut à
  `optimizeSourceDeductions=true` — sinon le modèle rembourse en avril un bénéfice déjà dans le
  net saisi (double-comptage côté utilisateur, remède : activer le flag).
- **Assiette placement estimée** (`services/taxEstimate.ts:13-15`) : `EST_DIVIDEND_YIELD = 0,02` et
  `EST_CAPITAL_GAINS_YIELD = 0,07` (gains réalisés à 50 % inclus) — HYPOTHÈSES de modèle (pas des
  valeurs fiscales), consommées par l'onglet Impôt ET `get_tax_situation` (MCP).
- **REEE à la fermeture** : `REEE_AIP_TAX_RATE = 0,20` appliqué au SOLDE total (approximation — le
  vrai régime ne vise que la portion revenu accumulé, surtaxe en sus : `[FISC-REEE-AIP-MODEL]`,
  différé) ; et les subventions SCEE/IQEE non utilisées ne sont PAS remboursées au gouvernement
  (`[FISC-REEE-GRANT-CLAWBACK]`, BACKLOG V6). Les PAE (imposés entre les mains de l'étudiant) ne
  sont pas modélisés.
- **FSS d'un retraité** : assiette simplifiée vs Annexe F réelle (seule l'exclusion SRG est
  documentée §5) — écart borné par le plafond 1 000 $/adulte.
- **Frais de garde — modèle SIMPLIFIÉ** (`childrenReee.ts:~225`, FISC-CHILDCARE) : le moteur applique
  un facteur de coût résiduel de **30 %** (= aide implicite ~70 %) sur la garde privée > 400 $/mois. C'est
  une **HEURISTIQUE conservatrice**, PAS le vrai régime (féd = déduction T778 ligne 21400 plafonnée par
  âge/revenu ; QC = crédit remboursable dégressif ~67-78 %, CPE déjà subventionné exclu). À sourcer/raffiner
  si on veut la précision réelle — borné et conservateur en l'état.
- **Remboursement RAP — « toujours honoré »** (`realEstateMonth.ts:405-414`, FISC-RAP-REPAY) : le moteur
  rembourse le RAP dès que `liquid ≥ versement` ; un versement MANQUÉ est reporté en silence (le vrai régime
  l'inclurait au revenu imposable ligne 12900) et le solde RAP impayé n'est PAS porté au revenu de la
  déclaration finale au décès. Limite LOW assumée (impact borné pour les profils qui gardent des liquidités).
- **Attribution par conjoint** : refactor « soldes REER par conjoint »
  (`docs/REFACTOR_REER_PAR_CONJOINT.md`). Phase 1 = registre REER par conjoint (invariant
  Σ==commun). Phase 2 = retraits REER/FERR taxés PAR CONJOINT (prorata des soldes). **Phase 3 =
  fractionnement de pension 65+ (FAIT, cf §6).** Restent répartis également : rentes gouv. et DB.
  Reste ouvert : **FERR par conjoint exact** (aujourd'hui prorata des soldes).
- ~~**Crédit pension non re-réparti au conjoint receveur**~~ **CORRIGÉ (PV-3, 2026-06-10)** : le
  fractionnement déplace désormais l'assiette du crédit pension (féd 31400 + QC 361) AVEC la pension
  transférée → le récipiendaire réclame le crédit sur la pension reçue (cf §6 fractionnement).
- **Gate DB du fractionnement à 65 ans** (limite assumée) : la rente viagère DB est fractionnable
  dès réception à TOUT âge côté fédéral (T1032), mais le QC exige 65 ans. Le moteur faisant un calcul
  combiné QC+féd, on retient **65** (sur-impôt léger pour une DB débutant avant 65, jamais l'inverse).

---

## 10. Crédit d'impôt pour dons de bienfaisance (FA-6) — année d'imposition 2025

> Crédit d'impôt **non remboursable** réclamé **cumulativement** au fédéral (ligne 34900 / Annexe 9) ET au
> Québec (ligne 395 / Annexe V). Sources (consultées 2026-06-23) :
> [ARC — P113 « Les dons et l'impôt 2025 »](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/p113/p113-gifts-income-tax.html) ·
> [ARC — Ligne 34900](https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-34900-donations-gifts.html) ·
> [Revenu Québec — Crédits d'impôt pour dons](https://www.revenuquebec.ca/fr/citoyens/credits-dimpot/credits-dimpot-pour-dons/) ·
> [CFFP — Crédit d'impôt pour dons (guide mesures fiscales 2025)](https://cffp.recherche.usherbrooke.ca/outils-ressources/guide-mesures-fiscales/credit-impot-dons/).

### Taux par paliers (`utils/donationCredit.ts`)
| Tranche du don | Fédéral | Québec | Combiné |
|---|---|---|---|
| Premiers 200 $ | **15 %** | **20 %** | **35 %** |
| Excédent (> 200 $) | **29 %** | **24 %** | **53 %** |
| Portion appariée au revenu en tranche d'imposition MAX | 33 % (féd) | 25,75 % (QC) | — |

- **Seuil de la tranche max** (déclenche 33 % féd / 25,75 % QC sur la portion de don appariée à ce revenu) :
  QC **129 590 $** (2025, harmonisé au seuil fédéral le 2025-02-03). Le seuil fédéral du 33 % est plus élevé
  (tranche supérieure ~253 k$).
- **Plafond annuel** : fédéral = **75 % du revenu net** ; Québec = **aucun plafond**. Report prospectif 5 ans.

### Implémentation — modèle FA-6 (option B, validée Marc 2026-06-23)
- Crédit (par adulte) = `0,15·min(don,200) + 0,29·max(0, don−200)` **(féd)** `+ 0,20·min(don,200) + 0,24·max(0, don−200)` **(QC)**.
  → effectif **35 %** sur les 1ers 200 $, **53 %** au-delà (vs l'ancien **33 % plat** = sous-crédit, surtout > 200 $).
- **Limites assumées (DOCUMENTÉES, no-fake-data)** :
  - **Majoration top-bracket** (33 % féd / 25,75 % QC) NON modélisée — requiert le statut marginal par conjoint →
    crédit légèrement SOUS-estimé pour un donateur à très haut revenu (direction conservatrice).
  - **Plafond 75 % du revenu net** NON appliqué (les dons modélisés sont petits vs le revenu net) — à ajouter si
    un don dépasse 75 % du revenu net du donateur.
  - **Don de titres cotés en nature** : inclusion du gain en capital à **0 %** (LIR 38(a.1)) NON modélisée —
    `CharitableGoal` ne suit aucune base de coût ni valeur marchande des titres. L'ancien proxy non sourcé
    `addTaxGains(−0,15·don)` est **SUPPRIMÉ**. À modéliser via un champ `gain` optionnel si voulu (suivi BACKLOG).
  - **Plafond « non remboursable » à l'impôt dû — APPLIQUÉ** (`FA-6-CREDIT-CAP`, `taxDecember.ts`) : le crédit-don
    est accumulé (`taxCurrentYear.donCredit`) puis, en décembre, **plafonné à l'impôt sur le revenu + gains de
    l'année** (`grossIncomeTax + max(0, taxCurrent.gains)`) avant d'être appliqué à `divers`. Un crédit non
    remboursable ne peut donc PAS générer de remboursement net (donateur bas-revenu : crédit borné à son impôt).
    **L'excédent non utilisé est PERDU** (le report prospectif 5 ans n'est pas modélisé — conservateur). Les
    cotisations santé RAMQ/FSS ne font PAS partie de l'assiette du crédit. ⚠️ Le plafond est appliqué sur l'impôt
    COMBINÉ féd+QC (approximation conservatrice ; en toute rigueur le crédit fédéral ne plafonne qu'à l'impôt
    fédéral et le QC qu'à l'impôt QC — l'écart n'apparaît qu'à très bas revenu où un palier a de l'impôt et l'autre non).
