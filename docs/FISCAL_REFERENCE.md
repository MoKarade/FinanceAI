# FISCAL_REFERENCE — valeurs fiscales QC / Canada (SOURCE DE VÉRITÉ)

> **Statut** : source de vérité des constantes fiscales de FinanceAI.
> **Année de base** : **2026**. **Dernière vérification** : 2026-06-05.
> **Règle CLAUDE.md** : toute constante fiscale du code DOIT correspondre à ce doc,
> daté + sourcé. Aucun chiffre fiscal en dur non sourcé. Audit : agent `fiscal-accuracy`.
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
- **Dividendes** (`calculateDividendTax`, résident QC) :
  | Type | Majoration (gross-up) | CID fédéral | CID Québec |
  |---|---|---|---|
  | Admissibles (`eligible`) | +38 % | 15,0198 % du majoré | 11,7 % du majoré |
  | Non-admissibles (`non-eligible`) | +15 % | 9,0301 % du majoré | 3,42 % du majoré |
  > Imposition par **empilement progressif** du montant majoré (ITEM 2d), CID inchangé.

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

### Québec — ligne 361 (âge + revenu de retraite combinés)
| Constante | Valeur 2026 | Source |
|---|---|---|
| Montant en raison de l'âge (`AGE_AMOUNT_QC_2026`) | **3 986 $** | Revenu Québec TP-1.G, 65+/personne |
| Montant revenu de retraite (`RETIREMENT_INCOME_AMOUNT_QC_2026`) | **3 058 $** | sur 1ers 3 058 $ de pension admissible |
| Seuil revenu familial — sans conjoint | 27 835 $ | crédit complet en dessous |
| Seuil revenu familial — avec conjoint | 45 270 $ | |
| Taux de réduction (`QC_LINE_361_REDUCTION_RATE`) | 18,75 % | au-delà du seuil |
| Âge minimum | 65 ans | |
> Indexation 2026 : +2,05 % (QC), +2,0 % (féd).

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

### FSS — Fonds des services de santé (ligne 446 / Annexe F)
S'applique surtout aux retraités/indépendants (les salariés sont couverts par l'employeur).
**Cotisation max : 1 000 $.**
| Revenu net | Cotisation |
|---|---|
| ≤ 18 130 $ | 0 $ |
| 18 130 → 33 130 $ | 1 % × (revenu − 18 130) |
| 33 130 → 63 060 $ | 150 $ (fixe) |
| 63 060 → 148 030 $ | 150 $ + 1 % × (revenu − 63 060) |
| ≥ 148 030 $ | 1 000 $ |

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
- Taux de récupération : **15 %** de l'excédent (ARC — impôt de récupération PSV).
- Le seuil s'applique **PAR PARTICULIER** (revenu net individuel), jamais au revenu du ménage.
> **Implémentation** (`taxDecember.ts:computeOasClawback`, FA-2 2026-06-09) : clawback calculé
> PAR CONJOINT (revenu_i = pension_i + retraits REER_i + part égale des loyers, vs seuil indexé),
> plafonné à sa part de PSV. Avant FA-2, le revenu FAMILIAL était comparé au seuil individuel →
> clawback fictif jusqu'à ~14 k$/an pour un couple 95-190 k$. Limites assumées : part de PSV
> répartie également entre conjoints ; cap basé sur la PSV de base (sans facteur de report — FA-8).

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
> pertes et ≥ 0 (gain net de la ligne 12700). Idem **clawback PSV** : les gains imposables de l'année
> COURANTE entrent dans le revenu de récupération (ligne 23400), répartis également par conjoint.
> Limites assumées : année 1 de simulation sans historique (assiette RRQ+DB seule, optimiste, borné à
> 12 mois) ; le salaire de l'année précédant la retraite n'est pas compté ; janvier de l'année Y teste
> l'assiette Y-2 (décalage d'un mois — le vrai cycle SRG court juillet→juin) ; dividendes/intérêts
> non-reg encore hors test (FA-8).
> **Indexation** (FA-9, 2026-06-10) : le moteur calcule le SRG **en base réelle 2026** (barème de
> base ci-dessous contre le revenu test déflaté) puis nominalise UNE fois ×inflation simulée —
> comme RRQ/PSV. Avant : `calculateGISBenefit(year)` indexait max+seuils ×1,02^Δ PUIS le résultat
> était re-multiplié ×inflation → max **double-indexé** (surévalué ~49 % à 20 ans, soit ~+6,5 k$/an
> fictifs **en $ réels 2026, célibataire** ≈ 9,6 k$ nominaux à l'an 20) et seuils nominaux face à
> un revenu réel (réduction trop clémente). En pratique le barème SRG suit l'IPC trimestriellement :
> la modélisation « réel + inflation simulée » est l'approximation cohérente du module retraite.
> Effet de bord assumé (extension FA-3b) : `dbMonthly` quasi-nominal entre dans le revenu test réel
> → un profil pension DB voit son SRG coupé de plus en plus tôt avec l'horizon (conservateur,
> amplitude ×1,49 à 20 ans) — déflater la composante DB = candidat FA-8.
| Paramètre | Célibataire 65+ | Couple (2 reçoivent PSV), par adulte |
|---|---|---|
| Maximum mensuel | 1 105 $ | 662 $ |
| Seuil de revenu (autre que PSV) | 22 512 $ | 29 760 $ (combiné) |
| Récupération (`GIS_CLAWBACK_RATE`) | 50 ¢ / 1 $ | 50 ¢ / 1 $ |
> Cas « conjoint sans PSV / Allocation » : non implémentés.

### Décès du conjoint — survivorMode (FA-10, 2026-06-10)
> Quand le conjoint (user2) décède (`modelSurvivor`, Monte Carlo), le moteur traite le SURVIVANT
> (user1) comme **contribuable unique** :
> 1. **Déclaration individuelle** : impôt de décembre sur UNE tête (un seul BPA, barème progressif
>    une fois), seuils « sans conjoint » (ligne 361 QC 27 835 $, RAMQ exemption célibataire,
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
> Limites connues (BACKLOG FA-8) : les droits CELI/REER/CELIAPP continuent de s'accumuler ×N
> (plafonds non survivor-aware) ; retenue FERR estimée sur 2 têtes (effet de timing seulement,
> réconcilié en décembre) ; « montant pour personne vivant seule » QC non modélisé (à sourcer).

---

## 7. Plafonds de régimes enregistrés

| Régime | Constante | Valeur |
|---|---|---|
| RAP (Régime accession propriété) | `RAP_LIMIT_PER_USER` | 60 000 $ / personne |
| CELIAPP — plafond à vie | `FHSA_LIFETIME_LIMIT_PER_USER` | 40 000 $ / personne |
| CELIAPP — plafond annuel | `FHSA_ANNUAL_LIMIT_PER_USER` | 8 000 $ / personne |
| PBMA (palier de base montant ajusté) | `PBMA_THRESHOLD_PER_USER` | 17 183 $ |

### CELI — plafonds annuels (`CELI_ANNUAL_LIMITS`)
2009-2012 : 5 000 · 2013-2014 : 5 500 · 2015 : 10 000 · 2016-2018 : 5 500 · 2019-2022 : 6 000 ·
2023 : 6 500 · 2024-2026 : **7 000** · 2027-2030 : 7 500 (estimés, à confirmer au Budget).
> **Implémentation** (`taxJanuary.ts`, FA-4 2026-06-09) : le moteur lit `CELI_ANNUAL_LIMITS` pour
> les années connues (SOURCE UNIQUE — l'ancien recalcul local 7000×inflation donnait 7 000 $ en
> 2027 au lieu de 7 500 $) ; au-delà de la dernière année connue, extrapolation indexée par
> `simInflation` arrondie au 500 $ (mécanisme légal d'indexation).

### REER — plafonds annuels (`RRSP_ANNUAL_LIMITS`)
2024 : 31 560 · 2025 : 32 490 · **2026 : 33 810** · 2027 : 34 480 · 2028 : 35 170 ·
2029 : 35 870 · 2030 : 36 590 (2027+ estimés, à confirmer au Budget). Espace gagné = 18 % du brut.

### FERR / RRIF — conversion et retrait minimum (`services/projection/helpers.ts:RRIF_RATES`)
**Règle ARC.** La conversion REER→FERR est obligatoire **au plus tard à la fin de l'année des
71 ans**. Mais **aucun retrait minimum n'est dû l'année d'ouverture** du FERR. Pour le cas standard
(conversion à l'échéance des 71 ans), le **1er retrait minimum obligatoire tombe l'année des 72 ans**.
Le facteur 71 ans (5,28 %) ne s'applique qu'à une conversion **volontaire précoce**.
> **Implémentation** (`taxJanuary.ts` §4) : le moteur force le retrait minimum à partir de **72 ans**
> (`if (ctx.age >= 72)`). Le facteur 71 reste dans la table pour complétude (conversion précoce non
> modélisée). Montant = solde FERR (1er janvier) × facteur prescrit selon l'âge.

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
> 95 ans et + : plafond **20 %** (fallback). Source : ARC, facteurs FERR prescrits (post-2015).

---

## 8. Immobilier (SCHL / OSFI) — `services/realEstate.ts`
Implémenté (ADR 009) ; valeurs à transcrire ici lors de la prochaine revue fiscale :
`calculateMinDownPayment` (mise de fonds min), `validateMortgageParameters` (amortissement max),
`calculateB20StressTest` (stress test B-20), `calculateSchlPremiumRate` (prime assurance < 20 %).

---

## 9. Limites connues (assumées, non-bugs)
- **ACB initial NonReg/crypto = valeur de départ** (`nonRegACB = nonReg`, `cryptoACB = crypto`) :
  le gain latent ACCUMULÉ avant la simulation n'est pas modélisé (coût d'acquisition historique
  inconnu — no-fake-data). Seule la croissance future simulée devient imposable → impôt à la
  disposition SOUS-ESTIMÉ pour un actif à fort gain latent au départ. Symétrique NonReg/crypto.
- **BPA fédéral dégressif** haut revenu (> ~177 k$) : non modélisé (on retient le palier max).
- **Indexation 2027+** : repose sur ~+2 %/an estimé tant que les montants officiels ne sont
  pas publiés (`getIndexedBracketsForYear`).
- **Aller-retour réel↔nominal** des paliers : écart connu vs ARC à forte inflation (ITEM 2a,
  rejeté après analyse numérique — cf BACKLOG).
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
