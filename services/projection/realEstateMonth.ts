// services/projection/realEstateMonth.ts
// Cycle 20: extraction du bloc immobilier mensuel (~187 lignes).
// Inclut: achat (RAP/CELI/NonReg/REER cascade), amortissement avec
// renouvellement 5 ans, croissance valeur, Smith Manoeuvre + LTV margin call,
// revenus locatifs, RAP repayment, ajustement loyer post-achat.
//
// Pattern: State Object — toutes les variables mutables dans RealEstateState.
// propertiesState est mutée en place (objets référencés).

import { formatCAD } from '../../utils/format';
import type { RealEstateGoal, Municipality } from '../../types';
import { RAP_LIMIT_PER_USER, calculateGrossWithholdingRRSP, withholdingForGrossRRSP } from '../../utils/tax';
import { calculateB20StressTest, validateMortgageParameters, calculateSchlPremium, calculateNewHomeRebateTotal } from '../realEstate';

type GetMonthOffsetFn = (dateStr: string) => number;
// FISC-WELCOME-UNIFY — la fonction injectée porte la municipalité du bien (welcome tax MTL vs reste QC).
type WelcomeTaxFn = (price: number, municipality?: Municipality) => number;

export interface PropertyStateMutable {
    id: string;
    isBought: boolean;
    mortgage: number;
    currentValue: number;
    calculatedPmt: number;
    isSold?: boolean;
    isPaidOff?: boolean;
}

export interface RealEstateState {
    liquid: number;
    celi: number;
    celiapp: number;
    reer: number;
    nonReg: number;
    nonRegACB: number;
    capitalLossBank: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    accRentesYear: number;
    accCapitalGainsYear: number;
    realEstateEquity: number;
    mortgageBalance: number;
    hasPurchasedPrimary: boolean;
    hasUsedRap: boolean;
    rapBorrowed: number;
    rapRepaymentDueTotal: number;
    rapRepaymentStartOffset: number;
    smithManoeuvreDebt: number;
    smithInterestDeductibleYear: number;
    fhsaClosingYear: number | null;
    taxCurrentYearReer: number;
    impotReerMois: number;
    withdrawalLiquid: number;
    withdrawalCELI: number;
    withdrawalNonReg: number;
    withdrawalREER: number;
    contribLiquid: number;
    celiWithdrawalsThisYear: number;
    retraitCeliMois: number;
    /** [REER-RETRAIT-IMMO-REGISTRE] Registre d'AFFICHAGE des retraits REER du mois (→ `RetraitREER`).
     *  Le module l'ignorait : 355 639 $ sortis du REER s'affichaient « 0 $ retiré » avec l'impôt
     *  correspondant juste en face. Alimenté par le RAP **et** par le retrait imposable — les deux
     *  sont bien des sorties du REER du point de vue du décaissement. */
    retraitReerMois: number;
    /** [REER-IMMO-HORS-ASSIETTE] Retenue à la source prélevée ce mois sur les retraits REER
     *  imposables (registre d'affichage, cf. `cashflowAllocation`). */
    rrspWithholdingMois: number;
    /** [REER-IMMO-HORS-ASSIETTE] Brut IMPOSABLE retiré du REER ce mois pour financer l'achat, à
     *  ajouter par le caller à `accRetraitsReerYear` (l'ASSIETTE que décembre impose) et à sa
     *  ventilation per-conjoint. ⚠️ EXCLUT le RAP, qui n'est pas imposable.
     *  Sans ce registre, le module posait une RETENUE que décembre crédite sans jamais inscrire
     *  le retrait dans l'assiette que décembre débite : un crédit sans sa dette. */
    accRetraitsReerYearAdd: number;
    /** [ENG-RAP-MISSED-REPAYMENT-TAX] Versement RAP DÛ mais non effectué ce mois, à ajouter par le
     *  caller à `accRetraitsReerYear` (l'assiette que décembre impose) et à sa ventilation
     *  per-conjoint. Règle ARC : la portion non remboursée d'une année est incluse au revenu de
     *  cette année (ligne 12900) et le solde RAP diminue d'autant — le versement n'est PAS reporté.
     *  ⚠️ Registre SÉPARÉ de `accRetraitsReerYearAdd` à dessein : ce n'est pas un retrait du REER
     *  (aucun argent ne sort d'un compte ce mois-ci, et aucune RETENUE à la source n'est prélevée) —
     *  seulement une inclusion au revenu. Les fusionner ferait mentir la garde
     *  `accRetraitsReerYearAdd === withdrawalREER − rapBorrowed` (`CLE-QUI-FUSIONNE-DEUX-SENS`). */
    rapMissedRepaymentAdd: number;
    immoInterest: number;
    immoPrincipal: number;
    immoHypo: number;
    immoCharges: number;
    totalRentalIncome: number;
    lifeEventLogs: string[];
    flowEventLogs: string[];
}

export interface RealEstateCtx {
    m: number;
    loopYear: number;
    isRetired: boolean;
    activeUsersCount: number;
    /** [RAP-DIVORCE-DEUX-TETES] Nombre de DÉCLARANTS vivants (1 après divorce/décès), à ne pas
     *  confondre avec `activeUsersCount` qui reste nominal. Le plafond RAP est un droit PAR
     *  PERSONNE : sur `activeUsersCount`, un divorcé recevait le plafond d'un couple.
     *  Optionnel à défaut neutre (`activeUsersCount`) → rétrocompat bit-identique hors divorce. */
    taxFilers?: number;
    simInflation: number;
    simSalaryGrowth: number;
    grossMarcBaseAnnual: number;
    grossAnnaBaseAnnual: number;
    incomeRetirement: number;
    useSmithManoeuvre: boolean;
    currentRentExpense: number;
    /** [Panel #552] RP DÉJÀ détenue au boot : offset logement = PMT reconstruit + charges
     *  (constant, aligné sur ce que le moteur AJOUTE), à la place du proxy loyer indexé — le
     *  budget de base d'un propriétaire contient déjà son versement réel. 0/absent = comportement
     *  historique (achat FUTUR : loyer indexé retiré à partir de l'achat). Optionnel à défaut
     *  neutre → rétrocompat bit-identique. */
    bootPrimaryHousingOffset?: number;
    /** C3 suite — si true, saute le RAP à l'achat (CELI avant REER non-imposable). */
    skipRapForPurchase?: boolean;
    /** PH4-FUT-B-4 — true UNIQUEMENT au mois exact de la retraite si le levier downsizing est actif :
     *  déclenche la vente+rachat-plus-petit de la résidence principale (cf. DOWNSIZE_RELEASE_PCT). */
    downsizeThisMonth?: boolean;
}

// PH4-FUT-B-4 — fraction de l'équité de la résidence principale LIBÉRÉE en placements lors du
// downsizing (le reste finance un bien plus petit payé cash). HYPOTHÈSE DE MODÈLE (ni fiscale ni
// sourcée) : ~40 % = vendre une maison et en racheter une à ~60 % de l'équité (ordre de grandeur
// d'un downsizing réel maison → condo/plus petit). Le gain est EXEMPT d'impôt (résidence principale, ARC).
export const DOWNSIZE_RELEASE_PCT = 0.4;

import { handleNonRegSale } from './portfolioOps';
import { smithHelocAnnualRate } from './modelAssumptions';

/**
 * Traite tout l'immobilier pour le mois courant.
 * Mute state en place. propertiesState[] est mutée par référence.
 */
export function processRealEstate(
    state: RealEstateState,
    ctx: RealEstateCtx,
    activeRE: RealEstateGoal[],
    propertiesState: PropertyStateMutable[],
    getMonthOffset: GetMonthOffsetFn,
    welcomeTax: WelcomeTaxFn,
): void {
    const {
        m, loopYear, simInflation,
        useSmithManoeuvre, currentRentExpense,
        bootPrimaryHousingOffset = 0,
        skipRapForPurchase = false,
        downsizeThisMonth = false,
        taxFilers = ctx.activeUsersCount,
    } = ctx;

    // PH4-FUT-B-4 — DOWNSIZING (au mois exact de la retraite) : vendre la résidence principale et
    // racheter plus petit. Libère DOWNSIZE_RELEASE_PCT de l'équité nette en LIQUIDE (réinvesti par la
    // cascade des mois suivants) ; le reste reste en immobilier dans un bien payé cash (hypothèque 0,
    // plus de paiement). Gain EXEMPT d'impôt (résidence principale, ARC) → on ne touche PAS
    // accCapitalGainsYear. Underwater (hypothèque > valeur) → équité 0 → aucun effet (garde). Locataire
    // (aucune résidence principale) → findIndex −1 → aucun effet. S'exécute une seule fois (mois unique).
    if (downsizeThisMonth) {
        const idx = activeRE.findIndex((g) => g.isPrimaryResidence);
        const prop = idx >= 0 ? propertiesState[idx] : undefined;
        if (prop && prop.isBought && !prop.isSold) {
            const equity = Math.max(0, prop.currentValue - prop.mortgage);
            if (equity > 0) {
                const released = equity * DOWNSIZE_RELEASE_PCT;
                state.liquid += released;                 // exemption résidence principale : zéro impôt
                prop.currentValue = equity - released;    // bien plus petit, payé cash
                prop.mortgage = 0;
                prop.calculatedPmt = 0;                   // plus d'hypothèque à payer
                state.lifeEventLogs.push(
                    `🏠 Downsizing retraite : équité libérée +${formatCAD(Math.round(released))} → placements`,
                );
            }
        }
    }

    let totalImmoHypo = 0;
    let totalImmoEquity = 0;
    let totalImmoDebt = 0;

    activeRE.forEach((goal, i) => {
        const pState = propertiesState[i];
        if (!pState) return;

        const purchaseOffset = getMonthOffset(goal.purchaseDate);
        if (!goal.isActive || m < purchaseOffset) return;
        // [ENG-PAST-OWNED-VS-PLANNED] (A6) 3e registre attrapé par le test bout-en-bout : sans ce
        // gate, un objectif « pas encore acheté » à date PASSÉE était ACHETÉ d'office au m0
        // (mise de fonds débitée, équité injectée — l'achat fantôme remplaçait l'équité fantôme).
        // Un objectif non réalisé n'agit PAS tant que l'utilisateur n'a pas repoussé sa date ou
        // confirmé l'achat (badge « Date passée — non acheté » à l'écran).
        if (goal.isOwned === false && purchaseOffset < 0 && !pState.isBought) return;

        // ── ACHAT ──────────────────────────────────────────────────────
        if (!pState.isBought) {
            // §6.8 — Validation SCHL : mise de fonds min + amortissement max.
            // Informatif uniquement (n'empêche pas l'achat) — l'utilisateur peut
            // tout de même choisir de simuler un scénario non conforme.
            if (m === purchaseOffset) {
                const validation = validateMortgageParameters({
                    price: goal.price,
                    downPayment: goal.downPayment,
                    amortization: goal.amortization,
                    isFirstTimeBuyer: goal.isFirstTimeBuyer ?? false,
                    isNewConstruction: goal.isNewConstruction ?? false,
                });
                if (!validation.valid) {
                    validation.errors.forEach(err => {
                        state.lifeEventLogs.push(`⚠️ Assurance prêt hypothécaire (SCHL) : ${err}`);
                    });
                }
            }

            const welcomeFees = welcomeTax(goal.price, goal.municipality);
            // §6.7 — Remboursement TPS/TVQ pour résidence neuve (réduit le coût net)
            const newHomeRebate = calculateNewHomeRebateTotal(goal.price, !!goal.isNewConstruction);
            const totalCashNeeded = Math.max(0, goal.downPayment + goal.totalClosingCosts + welcomeFees - newHomeRebate);
            if (newHomeRebate > 0) {
                state.lifeEventLogs.push(
                    `💰 Rembours. TPS/TVQ neuve §6.7 (${goal.id}): -${formatCAD(Math.round(newHomeRebate))}`,
                );
            }

            if (state.celiapp > 0) {
                state.liquid += state.celiapp;
                state.flowEventLogs.push(`💰 Retrait CELIAPP (FHSA) pour l'achat : +${formatCAD(Math.round(state.celiapp))}`);
                state.celiapp = 0;
                state.fhsaClosingYear = loopYear;
            }

            if (state.liquid < totalCashNeeded && state.reer > 0) {
                let remainingShortfall = totalCashNeeded - state.liquid;

                // Phase 1: RAP (si résidence principale, éligible, et non sauté par stratégie)
                if (!skipRapForPurchase && goal.isPrimaryResidence && (!state.hasUsedRap || state.rapRepaymentDueTotal === 0)) {
                    // [RAP-DIVORCE-DEUX-TETES] `taxFilers`, PAS `activeUsersCount` : le plafond RAP est
                    // un droit par PERSONNE. Sur `activeUsersCount` (nominal, toujours 2), un divorcé
                    // recevait le plafond d'un COUPLE — mesuré 98 080,68 $ pour un plafond légal de
                    // 60 000 $, soit 38 080,68 $ de retrait non imposable illégitime. Même homonyme
                    // que celui déjà corrigé dans taxJanuary/taxDecember/meltdown/latentTax : ce
                    // site-ci avait été sauté (cf. MODULE-ECRIT-HORS-CHECKLIST).
                    const rapLimit = RAP_LIMIT_PER_USER * Math.max(1, taxFilers);
                    const rapAvailable = Math.max(0, rapLimit - state.rapBorrowed);
                    if (rapAvailable > 0) {
                        const rapAmount = Math.min(state.reer, rapAvailable, remainingShortfall);
                        if (rapAmount > 0) {
                            state.reer -= rapAmount;
                            state.liquid += rapAmount;
                            state.rapBorrowed += rapAmount;
                            state.rapRepaymentDueTotal += rapAmount;
                            state.hasUsedRap = true;
                            const graceYears = (loopYear >= 2022 && loopYear <= 2025) ? 5 : 2;
                            state.rapRepaymentStartOffset = m + (graceYears * 12);
                            state.withdrawalREER += rapAmount;
                            // [REER-RETRAIT-IMMO-REGISTRE] registre d'AFFICHAGE. Le RAP est bien une
                            // sortie du REER — il n'entre en revanche PAS dans `accRetraitsReerYearAdd`
                            // (l'assiette), puisqu'il n'est pas imposable.
                            state.retraitReerMois += rapAmount;
                            state.contribLiquid += rapAmount;
                            remainingShortfall -= rapAmount;
                            state.flowEventLogs.push(`🏦 ↳ Retrait REER via le RAP, sans impôt : +${formatCAD(Math.round(rapAmount))}`);
                        }
                    }
                }

                // Phase 2: CELI (sans impôt)
                if (remainingShortfall > 0 && state.celi > 0) {
                    const celiAmount = Math.min(state.celi, remainingShortfall);
                    state.celi -= celiAmount;
                    state.liquid += celiAmount;
                    state.withdrawalCELI += celiAmount;
                    state.celiWithdrawalsThisYear += celiAmount;
                    state.retraitCeliMois += celiAmount;
                    state.contribLiquid += celiAmount;
                    remainingShortfall -= celiAmount;
                    state.flowEventLogs.push(`🏦 ↳ Retrait CELI pour l'achat : +${formatCAD(Math.round(celiAmount))}`);
                }

                // Phase 3: NonReg
                if (remainingShortfall > 0 && state.nonReg > 0) {
                    const nonRegAmount = handleNonRegSale(state, remainingShortfall);
                    state.liquid += nonRegAmount;
                    state.withdrawalNonReg += nonRegAmount;
                    state.contribLiquid += nonRegAmount;
                    remainingShortfall -= nonRegAmount;
                    state.flowEventLogs.push(`🏦 ↳ Retrait du compte non-enregistré pour l'achat : +${formatCAD(Math.round(nonRegAmount))}`);
                }

                // Phase 4: REER imposable (dernier recours)
                //
                // [REER-IMMO-HORS-ASSIETTE] + [EMPILEMENT-REER-ACHAT-IMMO] — audit 2026-08-19.
                // AVANT : le retrait posait `taxCurrentYearReer += drawn * margRate` (marginal PLAT,
                // évalué sur le revenu d'AVANT le retrait) sans jamais alimenter `accRetraitsReerYear`.
                // Or décembre CRÉDITE le bucket `.reer` comme une retenue déjà prise
                // (`withholdingAlreadyTaken`) et DÉBITE l'impôt calculé sur `accRetraitsReerYear` :
                // un crédit sans sa dette. Le retrait finissait donc NON IMPOSÉ — mesuré 94 599,60 $
                // d'impôt éludé sur un achat de condo 400 k$ financé par 207 758 $ de REER (6 679,78 $
                // payés en avril au lieu de 101 279,37 $). Le marginal plat sous-estimait en plus de
                // 22 110 $ sur un retrait de 235 639 $ (36,12 % plat contre 45,5 % incrémental).
                //
                // MAINTENANT : on suit le patron des 4 autres producteurs de retrait REER
                // (`cashflowAllocation`, `meltdownReer`, FERR de janvier, drawdown) —
                //   1. le brut est dimensionné par le BARÈME DE RETENUE (19/24/29 % combiné QC),
                //      pas par un marginal deviné ;
                //   2. la retenue va au bucket `.reer` (acompte, cf. FISC-REER-WHT-DOUBLE : elle
                //      reste au liquide jusqu'au règlement d'avril, donc `liquid += drawn` brut) ;
                //   3. le brut entre dans `accRetraitsReerYearAdd` → décembre l'impose au taux
                //      marginal RÉEL et réconcilie contre la retenue. C'est la réconciliation qui
                //      corrige l'écart, pas une meilleure estimation du taux.
                if (remainingShortfall > 0 && state.reer > 0) {
                    const { gross: grossNeeded } = calculateGrossWithholdingRRSP(remainingShortfall);
                    const drawn = Math.min(state.reer, grossNeeded);
                    if (drawn > 0) {
                        const withholding = withholdingForGrossRRSP(drawn).withholding;
                        state.reer -= drawn;
                        state.liquid += drawn;
                        state.withdrawalREER += drawn;
                        state.retraitReerMois += drawn;
                        state.contribLiquid += drawn;
                        state.accRetraitsReerYearAdd += drawn;
                        state.taxCurrentYearReer += withholding;
                        state.rrspWithholdingMois += withholding;
                        state.impotReerMois += withholding;
                        state.flowEventLogs.push(`🚨 ↳ Retrait REER imposable pour l'achat : -${formatCAD(Math.round(drawn))} brut (retenue ${formatCAD(Math.round(withholding))}, solde réglé en avril)`);
                    }
                }
            }

            if (state.liquid >= totalCashNeeded) {
                state.liquid -= totalCashNeeded;
                state.withdrawalLiquid += totalCashNeeded;
                pState.isBought = true;

                // §6.5 — Prime SCHL si MDP < 20% (LTV > 80%). Ajoutée au principal
                // du prêt avant calcul du PMT.
                const schl = calculateSchlPremium({
                    price: goal.price,
                    downPayment: goal.downPayment,
                });
                if (schl.required) {
                    pState.mortgage += schl.premium;
                    state.lifeEventLogs.push(
                        `🏦 Prime SCHL §6.5 (${goal.id}): +${formatCAD(Math.round(schl.premium))} ` +
                        `(${(schl.rate * 100).toFixed(2)}% sur LTV ${(schl.ltv * 100).toFixed(1)}%)`,
                    );
                }

                const r = (goal.mortgageRate / 100) / 12;
                const n = goal.amortization * 12;
                const p = pState.mortgage;
                pState.calculatedPmt = r > 0 ? p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : p / n;
                state.lifeEventLogs.push(`🏠 Achat ${goal.name || 'de la propriété'} : -${formatCAD(Math.round(totalCashNeeded))} (argent sorti de tes comptes)`);
                state.flowEventLogs.push(`📌 Mise de fonds : -${formatCAD(goal.downPayment)} · Frais de notaire + taxe de bienvenue : -${formatCAD(Math.round(goal.totalClosingCosts + welcomeFees))}`);
                if (goal.isPrimaryResidence) state.hasPurchasedPrimary = true;

                // §6.6 — Stress test OSFI B-20 (qualifying rate + GDS/TDS).
                // Informatif uniquement : on logue un warning si l'achat ne passerait
                // pas une qualification réelle. L'achat est tout de même autorisé
                // dans la simulation (la décision finale appartient à l'utilisateur).
                //
                // Limitations connues (à améliorer dans futures PRs) :
                //  - `otherDebtMonthly = 0` : on n'a pas accès aux dettes (ctx.debts).
                //    Sous-estime TDS — un user avec dette auto/cartes pourrait échouer
                //    en réalité alors qu'on logue "passes" ici.
                //  - Composition mensuelle simple (`rate / 12`) vs semi-annuelle
                //    canadienne légale : biais conservateur léger (~0.05% sur PMT),
                //    cohérent avec le reste du moteur.
                if (Number.isFinite(goal.mortgageRate) && goal.mortgageRate > 0) {
                    const monthlyGross = ctx.isRetired
                        ? ctx.incomeRetirement
                        : ((ctx.grossMarcBaseAnnual + ctx.grossAnnaBaseAnnual)
                            * Math.pow(1 + ctx.simSalaryGrowth / 100, Math.floor(ctx.m / 12))) / 12;
                    // §6.6 MEDIUM-6 — indexer les charges logement par inflation pour
                    // cohérence avec le revenu nominal (sinon GDS s'améliore artificiellement
                    // sur achats futurs).
                    const inflFactor = Math.pow(1 + ctx.simInflation / 100, Math.floor(ctx.m / 12));
                    const monthlyHousingExcl = (
                        ((goal.taxesYearly || 0) / 12)
                        + (goal.heatingMonthly || 0)
                        + ((goal.condoFees || 0) * 0.5)
                    ) * inflFactor;
                    const stress = calculateB20StressTest({
                        contractRate: goal.mortgageRate,
                        loanAmount: pState.mortgage,
                        amortization: goal.amortization,
                        monthlyHousingChargesExclMortgage: monthlyHousingExcl,
                        monthlyGrossIncome: monthlyGross,
                        otherDebtMonthly: 0,
                    });
                    if (!stress.passes) {
                        state.lifeEventLogs.push(
                            `⚠️ Hypothèque risquée : tes paiements seraient trop élevés par rapport à ton revenu — une banque pourrait refuser ce prêt.`,
                        );
                    }
                } else {
                    state.flowEventLogs.push(
                        `ℹ️ Vérification d'emprunt ignorée (taux d'hypothèque non renseigné).`,
                    );
                }
            } else if (m === purchaseOffset) {
                state.flowEventLogs.push(`⚠️ Achat reporté : pas assez de liquidités pour la mise de fonds.`);
            }
        }

        // ── PROPRIÉTÉ DÉTENUE ──────────────────────────────────────────
        if (pState.isBought && !pState.isSold) {
            const monthsSincePurchase = m - purchaseOffset;
            // Renouvellement 5 ans
            if (monthsSincePurchase > 0 && monthsSincePurchase % 60 === 0) {
                const remainingMonths = goal.amortization * 12 - monthsSincePurchase;
                if (remainingMonths > 60 && pState.mortgage > 0) {
                    // ⚠️ [ENG-RENEWAL-CHOC-MORT] Ce « choc » de taux est dérivé du PREMIER CARACTÈRE
                    // de l'identifiant du bien — et MESURÉ, il vaut ZÉRO partout dans le dépôt :
                    // l'UI crée `prop_<timestamp>` ('p' → 112, 112 % 3 = 1 → choc nul), les fixtures
                    // utilisent `p1` et les personas `jc-re1` ('j' → 106 → 1 → nul aussi). Aucune
                    // propriété atteignable par un utilisateur n'a jamais vu son taux bouger au
                    // renouvellement. Le mécanisme n'est PAS corrigé ici : le rendre vivant
                    // déplacerait de l'argent sur toute projection avec hypothèque et exposerait
                    // `[ENG-RENEWAL-RATE-MISMATCH]` (l'intérêt reste calculé à l'ANCIEN taux) —
                    // deux décisions qui appartiennent à Marc. Suivi : `[ENG-RENEWAL-CHOC-MORT]`.
                    const rateShock = ((pState.id.charCodeAt(0) % 3) - 1) * 0.015;
                    const newRate = Math.max(0.01, goal.mortgageRate / 100 + rateShock);
                    const nr = newRate / 12;
                    pState.calculatedPmt = pState.mortgage * nr * Math.pow(1 + nr, remainingMonths) / (Math.pow(1 + nr, remainingMonths) - 1);
                    // ⚠️ NO-FAKE-DATA : annoncer « nouveau taux 5,00 % » quand l'ancien était 5,00 %
                    // affirme un changement qui n'a pas eu lieu. Le renouvellement, lui, a bien eu
                    // lieu (le terme est échu) — on dit donc ce qui s'est PASSÉ, pas ce qu'on aurait
                    // aimé modéliser. Tant que le choc est nul, c'est la seconde branche qui sort.
                    const tauxChange = Math.abs(newRate - goal.mortgageRate / 100) > 1e-9;
                    state.lifeEventLogs.push(tauxChange
                        ? `🏦 Renouvellement hypothécaire ${goal.name || ''} : nouveau taux ${(newRate * 100).toFixed(2)} %`
                        : `🏦 Renouvellement hypothécaire ${goal.name || ''} : taux inchangé à ${(newRate * 100).toFixed(2)} %`);
                }
            }
            pState.currentValue *= Math.pow(1 + (goal.propertyGrowthRate ?? 3) / 100, 1 / 12);
            if (goal.maxValue && pState.currentValue > goal.maxValue) pState.currentValue = goal.maxValue;

            const monthlyRate = (goal.mortgageRate / 100) / 12;
            const interestPaid = pState.mortgage * monthlyRate;
            const principalPaid = Math.max(0, pState.calculatedPmt - interestPaid);
            const prevMortgage = pState.mortgage;
            pState.mortgage = Math.max(0, pState.mortgage - principalPaid);
            if (prevMortgage > 0 && pState.mortgage <= 0 && !pState.isPaidOff) {
                pState.isPaidOff = true;
                pState.calculatedPmt = 0;
                state.lifeEventLogs.push(`🏠 Hypothèque remboursée à 100 % ! ${goal.name || 'Propriété'} t'appartient pleinement.`);
            }
            totalImmoHypo += pState.calculatedPmt;
            totalImmoEquity += pState.currentValue - pState.mortgage;
            totalImmoDebt += pState.mortgage;
            state.immoInterest += interestPaid;
            state.immoPrincipal += principalPaid;

            // Smith Manoeuvre (intérêts capitalisés)
            if (useSmithManoeuvre && goal.isPrimaryResidence && principalPaid > 0) {
                state.smithManoeuvreDebt += principalPaid;
                state.nonReg += principalPaid;
                state.nonRegACB += principalPaid;
                // [SMITH-HELOC-TAUX-FIGE] Le taux de la marge SUIT désormais celui du prêt du bien
                // (décision Marc 2026-08-24). Avant : 5 % figé, indépendant du dossier — donc une
                // marge moins chère que l'hypothèque dès que celle-ci dépassait 5 %, ce qui rendait
                // le levier flatteur exactement quand il devient dangereux.
                const smithInterest = state.smithManoeuvreDebt * (smithHelocAnnualRate(goal.mortgageRate) / 12);
                state.smithManoeuvreDebt += smithInterest;
                state.smithInterestDeductibleYear += smithInterest;
            }

            // LTV margin call (Smith Manoeuvre)
            if (state.smithManoeuvreDebt + pState.mortgage > pState.currentValue * 0.65) {
                const surplusMarginCall = (state.smithManoeuvreDebt + pState.mortgage) - (pState.currentValue * 0.65);
                if (surplusMarginCall > 0 && state.nonReg > 0) {
                    const call = handleNonRegSale(state, surplusMarginCall);
                    state.smithManoeuvreDebt -= call;
                    state.flowEventLogs.push(`🚨 Appel de marge : vente forcée de ${formatCAD(Math.round(call))} (compte non-enregistré)`);
                }
            }

            // Revenus locatifs
            if (!goal.isPrimaryResidence && goal.rentalIncomeMonthly) {
                const rentalIncome = goal.rentalIncomeMonthly * Math.pow(1 + simInflation / 100, m / 12);
                state.monthlyIncome += rentalIncome;
                state.accRentesYear += rentalIncome;
                state.totalRentalIncome += rentalIncome;
            }

            const monthlyCharges = goal.unrecoverableMonthly || 0;
            state.monthlyExpenses += pState.calculatedPmt + monthlyCharges;
            state.immoHypo += pState.calculatedPmt;
            state.immoCharges += monthlyCharges;
        }
    });

    // Si résidence principale achetée, ne plus payer le loyer. Pour une RP DÉJÀ détenue au boot
    // (achat passé), l'offset est le PMT+charges reconstruits (constant) — le proxy loyer indexé
    // sur-chargeait jusqu'à 20 084 $/an mesurés quand `currentRentExpense` retombait sur le défaut
    // 1 600 $ (panel #552, financial-integrity ÉLEVÉ-1).
    if (state.hasPurchasedPrimary) {
        state.monthlyExpenses -= bootPrimaryHousingOffset > 0
            ? bootPrimaryHousingOffset
            : currentRentExpense * Math.pow(1 + simInflation / 100, m / 12);
    }

    // RAP repayment
    if (state.hasUsedRap && state.rapRepaymentDueTotal > 0 && m >= state.rapRepaymentStartOffset) {
        const monthlyRepayment = (state.rapBorrowed / 15) / 12;
        const amnt = Math.min(state.rapRepaymentDueTotal, monthlyRepayment);
        if (state.liquid >= amnt) {
            state.liquid -= amnt;
            state.reer += amnt;
            state.rapRepaymentDueTotal -= amnt;
        } else {
            // [ENG-RAP-MISSED-REPAYMENT-TAX] Versement DÛ et non payé. Avant ce lot, ce chemin ne
            // faisait RIEN : le versement était reporté en silence, l'argent n'était jamais imposé,
            // et le solde restait dû indéfiniment (mesuré : 205 mois dus pour une obligation de 180,
            // et jusqu'à 68 333 $ jamais portés au revenu sur un ménage à 60 k$ — la limite était
            // documentée « LOW / impact borné », elle ne l'était pas).
            //
            // Règle ARC (ligne 12900) : la portion NON remboursée d'une année s'ajoute au revenu de
            // cette année, et le solde du RAP diminue du même montant. Ce n'est donc ni un report
            // ni une dette qui s'accumule.
            //
            // ⚠️ Pourquoi un traitement MENSUEL est ici exactement équivalent au traitement ANNUEL
            // de l'ARC : le versement du mois est PLAFONNÉ à `monthlyRepayment` (jamais davantage),
            // donc un mois riche ne peut pas rattraper un mois creux de la même année. La somme des
            // manques mensuels d'une année EST le manque annuel. Et le canal choisi
            // (`accRetraitsReerYear`) est une assiette ANNUELLE que décembre impose : le timing
            // fiscal est déjà celui de la règle, pas celui du mois.
            state.rapRepaymentDueTotal -= amnt;
            state.rapMissedRepaymentAdd += amnt;
            state.flowEventLogs.push(
                `⚠️ Versement RAP non fait, ajouté à ton revenu imposable : ${formatCAD(Math.round(amnt))}`,
            );
        }
    }

    state.realEstateEquity = totalImmoEquity;
    state.mortgageBalance = totalImmoDebt;
    state.immoHypo = totalImmoHypo;
}
