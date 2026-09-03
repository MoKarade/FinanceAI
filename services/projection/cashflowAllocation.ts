// services/projection/cashflowAllocation.ts
// Cycle 19: extraction du bloc shortfall + excess allocation (~180 lignes).
//
// Pattern: State Object — toutes les variables mutables sont regroupées dans
// CashflowState et passées par référence. Le caller copie ses locales dans
// l'objet, appelle la fonction, puis destructure les nouvelles valeurs.
//
// handleNonRegSale est ré-implémenté en interne (depend de nonReg/nonRegACB/
// capitalLossBank/accCapitalGainsYear, tous dans state).

import { formatCAD } from '../../utils/format';
import type { Debt } from '../../types';
import type { AllocationStrategy } from './types';
import type { ContributionOrder } from './strategyConfig';
import { PBMA_THRESHOLD_PER_USER, OAS_CLAWBACK_THRESHOLD_2026, withholdingForGrossRRSP, QC_BRACKETS, FED_BRACKETS, type FiscalReport } from '../../utils/tax';

// Plafond du palier 1 (14% fédéral + 14% Québec) par utilisateur. Combinaison
// marginale ≈ 28%, comparable à la retenue REER de 19-24% (cf RRSP_WITHHOLDING_QC)
// — donc encore avantageux de puiser dans le REER plutôt que dans le CELI sous ce seuil.
// Dérivé du 1er palier brut le plus restrictif des deux, au lieu d'un 54 345 $ « nombre magique »
// (audit 2026-06) : la valeur se met à jour avec les barèmes de base. NB : ce sont les brackets BRUTS
// (non réindexés par année de projection via getIndexedBracketsForYear) — comportement inchangé vs
// l'ancien 54 345 $ en dur. Vaut 54 345 $ en 2026.
const SAFE_REER_BRACKET_TOP_PER_USER = Math.min(QC_BRACKETS[0].upTo, FED_BRACKETS[0].upTo);

type FiscalReportFn = (
    grossIncome: number,
    rrspContrib: number,
    fhsaContrib: number,
    year: number,
    skipBreakdown: boolean,
) => FiscalReport;

type GrossWithholdingFn = (netDesired: number) => { gross: number };

export interface CashflowState {
    liquid: number;
    celi: number;
    reer: number;
    celiapp: number;
    nonReg: number;
    nonRegACB: number;
    capitalLossBank: number;
    crypto: number;
    /** M-4 : coût de base crypto (= valeur de départ par convention) → ne taxer que le gain à la vente. */
    cryptoACB: number;
    celiRoom: number;
    rrspRoom: number;
    fhsaRoom: number;
    taxCurrentYearReer: number;
    accRetraitsReerYear: number;
    accCapitalGainsYear: number;
    accRrspYear: number;
    accFhsaYear: number;
    fhsaLifetimeContrib: number;
    celiWithdrawalsThisYear: number;
    retraitReerMois: number;
    /** [WHT-DISPLAY-EXACT volet a → PROJ-TTP-DOUBLECOUNT 2026-08-01] Retenue REER PAR TIRAGE
     *  cumulée sur le mois (cascade shortfall + sauvetage de découvert). N'alimente PLUS
     *  `totalTaxesPaid` (l'impôt y arrive via le débit d'avril du bucket .reer, une seule fois)
     *  et n'atteint PAS chartData : son seul consommateur restant est le re-crédit CF-2 plus bas
     *  (la retenue reste au patrimoine jusqu'au règlement — retrait NW-neutre). Réinitialisé à 0
     *  chaque mois par le caller, comme `retraitReerMois`. */
    rrspWithholdingMois: number;
    retraitCeliMois: number;
    withdrawalREER: number;
    withdrawalCELI: number;
    withdrawalNonReg: number;
    withdrawalCrypto: number;
    contribCELI: number;
    contribREER: number;
    contribNonReg: number;
    contribCELIAPP: number;
    shortfallMonths: number;
    /** FISC-BROKE-LIQUID-FLOOR — déficit mensuel NON couvert après épuisement de TOUS les comptes de
     *  décaissement (le coussin critique reste protégé). Reporté par le caller en `liquidDebt` (dette
     *  visible) au lieu de s'évaporer. 0 si entièrement couvert ou en cas d'excédent. */
    uncoveredShortfall: number;
    flowEventLogs: string[];
}

export interface CashflowCtx {
    monthlyCashflow: number;
    targetEF: number;
    criticalThreshold: number;
    isRetired: boolean;
    strategy: AllocationStrategy;
    m: number;
    loopYear: number;
    enableMonteCarlo: boolean;
    activeUsersCount: number;
    /** FA-10 — décès modélisé : le survivant est 1 contribuable (seuils fiscaux ×1, salaire du défunt = 0). Défaut false. */
    survivorMode?: boolean;
    grossMarcBaseAnnual: number;
    grossAnnaBaseAnnual: number;
    simSalaryGrowth: number;
    incomeRetirement: number;
    accRentesYear: number;
    hasFuturePurchase: boolean;
    hasPurchasedPrimary: boolean;
    // G21 C5 — leviers découplés de l'enum AllocationStrategy. Absents ⇒ on retombe
    // sur le comportement historique dérivé de `strategy` (aucune régression).
    /** Ordre de cotisation en accumulation, indépendant de l'ordre de retrait. */
    contributionOrder?: ContributionOrder;
    /** Rembourser toutes les dettes avant d'investir (vs seulement toxiques >7%). */
    debtFirst?: boolean;
}

import { handleNonRegSale, handleCryptoSale } from './portfolioOps';

// [WHT-DISPLAY-EXACT volet b] La retenue REER par tirage suit la source de vérité unique
// `withholdingForGrossRRSP` (utils/tax.ts, 19/24/29 % combiné QC, tranche déterminée sur le brut) —
// plus de copie locale `rrspWithholding` (qui dupliquait exactement cette logique).

/**
 * Traite le cashflow mensuel: shortfall (cascade retraits) ou excess
 * (EF + dettes toxiques + FHSA + REER/CELI selon stratégie + NonReg).
 * Mute state en place.
 */
export function processCashflowAllocation(
    state: CashflowState,
    ctx: CashflowCtx,
    activeDebts: Debt[],
    calculateFiscalReport: FiscalReportFn,
    calculateGrossWithholdingRRSP: GrossWithholdingFn,
): void {
    const {
        monthlyCashflow, targetEF, criticalThreshold, isRetired, strategy,
        m, loopYear, enableMonteCarlo, activeUsersCount, survivorMode = false,
        grossMarcBaseAnnual, grossAnnaBaseAnnual, simSalaryGrowth,
        incomeRetirement, accRentesYear, hasFuturePurchase, hasPurchasedPrimary,
        contributionOrder, debtFirst,
    } = ctx;

    // G21 C5 — résolution des leviers : override explicite sinon dérivé de l'enum
    // (comportement historique). `debtFirstActive` remplace les tests directs sur
    // strategy === 'DEBT_FIRST' ; `reerFirstContrib` remplace la dérivation de
    // l'ordre de cotisation depuis l'ordre de retrait.
    const debtFirstActive = debtFirst ?? (strategy === 'DEBT_FIRST');
    // FA-10 — survivant = 1 contribuable : seuils fiscaux individuels (pas ×2 du ménage),
    // cohérent avec taxFilers (taxDecember) et oasBeneficiaries (clawback PSV). Le salaire du
    // défunt (grossAnna par convention du moteur) est exclu des revenus de la cascade.
    // ⚠️ [panel #613] Le paramètre s'appelle `survivorMode` pour raisons historiques, mais
    // l'appelant y passe désormais `soloHousehold` (= décès OU DIVORCE) : sa sémantique ici a
    // toujours été « il ne reste qu'UN contribuable », jamais « prestations de survivant ».
    // Ne pas le lire comme spécifique au décès — c'est ce qui a produit l'oubli du divorce.
    const liveFilers = survivorMode ? 1 : activeUsersCount;

    if (monthlyCashflow < 0) {
        // ── SHORTFALL ──────────────────────────────────────────────────
        let shortfall = -monthlyCashflow;

        // Piger dans les liquidités jusqu'au seuil critique
        if (state.liquid - shortfall >= criticalThreshold) {
            state.liquid -= shortfall;
            shortfall = 0;
        } else {
            const fromLiquid = Math.max(0, state.liquid - criticalThreshold);
            state.liquid -= fromLiquid;
            shortfall -= fromLiquid;
        }

        // CF-2 (2026-06) : niveau du liquide APRÈS la dépense directe (puisée jusqu'au seuil
        // critique). Le déficit restant est couvert ci-dessous par des VENTES d'actifs dont le
        // produit finance une dépense — il ne doit donc PAS rester dans le liquide. On rétablit
        // ce niveau en fin de branche (sinon les ventes gonflaient le liquide → le patrimoine ne
        // baissait pas du plein déficit ; le cas AMPLE, lui, déduit déjà tout le déficit du liquide).
        const liquidAfterDirectSpend = state.liquid;
        // FISC-REER-WHT-DOUBLE (2026-06-16) : la retenue prélevée par la cascade `drawReer` ci-dessous
        // (retraits du compte REER — ou FERR après 71 ans, même solde `state.reer`) est un ACOMPTE d'impôt
        // payé en avril via le bucket .reer (taxApril débite revenu+reer). Elle doit donc RESTER dans le
        // patrimoine jusque-là, comme la convention BRUT-au-liquide de FERR/immo (le minimum FERR obligatoire
        // est, lui, déjà crédité BRUT au liquide en janvier — chemin séparé, hors de cette cascade). Sinon le
        // retrait sort le BRUT du REER tandis que le net est effacé par CF-2 → la retenue quitte le NW au
        // retrait ET est re-débitée en avril = double-comptage (fuite ≈ retenue/mois, vérifiée empiriquement).
        // On capture le cumul d'avant CET appel : le restore CF-2 du liquide n'utilise que la retenue prélevée
        // PAR CET APPEL (delta), alors que `state.rrspWithholdingMois` cumule sur tout le mois (cascade +
        // sauvetage de découvert, qui rappelle cette fonction) pour le compteur d'affichage.
        const rrspWithholdingAtStart = state.rrspWithholdingMois;

        if (shortfall > 0) state.shortfallMonths++;

        if (shortfall > 0) {
            const currentAnnualGrossTotal = isRetired
                ? ((incomeRetirement * 12) + state.accRetraitsReerYear + accRentesYear)
                : ((grossMarcBaseAnnual + (survivorMode ? 0 : grossAnnaBaseAnnual)) * Math.pow(1 + simSalaryGrowth / 100, Math.floor(m / 12)) + state.accRetraitsReerYear);

            let runningGross = currentAnnualGrossTotal;
            const pbmaThreshold = PBMA_THRESHOLD_PER_USER * liveFilers;
            const bracket1Top = SAFE_REER_BRACKET_TOP_PER_USER * liveFilers;
            // OAS clawback ne s'applique qu'aux 65+. On le proxy par isRetired puisque
            // l'âge n'est pas dans le contexte; les retraités < 65 ne reçoivent pas PSV
            // donc le cap est sans effet pour eux (revenus typiquement < 93k).
            const oasCap = isRetired ? OAS_CLAWBACK_THRESHOLD_2026 * liveFilers : Infinity;

            // Helper local: cap-aware REER draw. Mute state, retourne brut tiré.
            const drawReer = (capRoomGross: number, label: string): number => {
                if (shortfall <= 0 || state.reer <= 0 || capRoomGross <= 0) return 0;
                const { gross: grossAttempt } = calculateGrossWithholdingRRSP(shortfall);
                const actualGross = Math.min(state.reer, grossAttempt, capRoomGross);
                if (actualGross <= 0) return 0;
                const actualWithholding = withholdingForGrossRRSP(actualGross).withholding;
                const actualNet = Math.min(actualGross - actualWithholding, shortfall);

                state.reer -= actualGross;
                state.liquid += actualNet;
                state.accRetraitsReerYear += actualGross;
                state.retraitReerMois += actualGross;
                state.withdrawalREER += actualGross;
                state.taxCurrentYearReer += actualWithholding;
                state.rrspWithholdingMois += actualWithholding; // acompte conservé au liquide (cf CF-2) + compteur d'affichage exact
                runningGross += actualGross;
                shortfall -= actualNet;
                state.flowEventLogs.push(`🏦 ↳ Retrait REER (${label}) : +${formatCAD(Math.round(actualGross))} brut → +${formatCAD(Math.round(actualNet))} net après impôt`);
                return actualGross;
            };

            // Logique #1 — PBMA: REER au taux 0% marginal (palier 0).
            // Toutes stratégies en profitent (ne pas laisser de la place gaspillée).
            const pbmaRoom = Math.min(
                Math.max(0, pbmaThreshold - runningGross),
                Math.max(0, oasCap - runningGross),
            );
            drawReer(pbmaRoom, 'Palier 0%');

            // Logique #1b — Bracket-1 fill (AUTO_MARGINAL uniquement, optim 2026).
            // Sous le palier 1 (~54k/usager), marginal combiné fed+QC ≈ 28%, déjà
            // proche de la retenue à la source REER. Préférer REER ici évite de
            // gaspiller du CELI dont le rendement futur est non-imposable.
            if (strategy === 'AUTO_MARGINAL') {
                const bracket1Room = Math.min(
                    Math.max(0, bracket1Top - runningGross),
                    Math.max(0, oasCap - runningGross),
                );
                drawReer(bracket1Room, 'Palier 14%');
            }

            let buckets: string[];
            if (strategy === 'PRIO_REER') buckets = ['REER', 'CELI', 'NONREG', 'CRYPTO'];
            else if (strategy === 'PRIO_CELI' || strategy === 'PRIO_CELI_NO_RAP') buckets = ['CELI', 'NONREG', 'REER', 'CRYPTO'];
            else buckets = ['CELI', 'REER', 'NONREG', 'CRYPTO'];

            // Optim 2026: banque de pertes en capital — si on a des pertes accumulées
            // significatives, on préfère vendre du NonReg avant le REER pour les
            // utiliser (le gain compensé devient effectivement non-imposable).
            if (state.capitalLossBank > 1000 && state.nonReg > 0) {
                const reerIdx = buckets.indexOf('REER');
                const nonRegIdx = buckets.indexOf('NONREG');
                if (reerIdx !== -1 && nonRegIdx !== -1 && nonRegIdx > reerIdx) {
                    buckets[reerIdx] = 'NONREG';
                    buckets[nonRegIdx] = 'REER';
                }
            }

            // Cascade standard
            for (const bucket of buckets) {
                if (shortfall <= 0.1) break;

                if (bucket === 'CELI' && state.celi > 0) {
                    const drawn = Math.min(state.celi, shortfall);
                    state.celi -= drawn;
                    state.liquid += drawn;
                    state.celiWithdrawalsThisYear += drawn;
                    state.retraitCeliMois += drawn;
                    state.withdrawalCELI += drawn;
                    shortfall -= drawn;
                    state.flowEventLogs.push(`🏦 ↳ Retrait CELI (sans impôt) : +${formatCAD(Math.round(drawn))}`);
                } else if (bucket === 'NONREG' && state.nonReg > 0) {
                    const drawnNonReg = handleNonRegSale(state, shortfall);
                    state.liquid += drawnNonReg;
                    state.withdrawalNonReg += drawnNonReg;
                    shortfall -= drawnNonReg;
                    state.flowEventLogs.push(`🏦 ↳ Retrait du compte non-enregistré : +${formatCAD(Math.round(drawnNonReg))}`);
                } else if (bucket === 'REER' && state.reer > 0) {
                    // OAS guard appliqué ici aussi: on respecte le plafond clawback.
                    const reerCap = Math.max(0, oasCap - runningGross);
                    drawReer(reerCap, 'Standard');
                } else if (bucket === 'CRYPTO' && state.crypto > 0) {
                    // [PV-7] M-4 (gain proportionnel) + banque de pertes (LIR 111(1)(b)) via le
                    // helper partagé, comme NonReg : la part compensée n'est pas réimposée et les
                    // pertes alimentent la banque au lieu d'être jetées.
                    const drawn = handleCryptoSale(state, shortfall);
                    state.liquid += drawn;
                    shortfall -= drawn;
                    state.withdrawalCrypto += drawn;
                    state.flowEventLogs.push(`🚨 Vente de crypto (dernier recours) : +${formatCAD(Math.round(drawn))}`);
                }
            }
        }

        // FISC-BROKE-LIQUID-FLOOR : déficit résiduel après épuisement de TOUS les comptes de
        // décaissement (REER/CELI/nonReg/crypto = 0), le coussin critique restant protégé (choix Marc).
        // Reporté en dette VISIBLE par le caller (liquidDebt) au lieu de s'évaporer : sans ça, ΔNW ne
        // baisse pas du déficit → argent fantôme (résiduel de conservation +shortfall/mois mesuré).
        state.uncoveredShortfall = Math.max(0, shortfall);

        // CF-2 : les produits de vente d'actifs ci-dessus ont financé la dépense (déficit) → ils
        // ne s'accumulent pas dans le liquide. On rétablit le niveau post-dépense directe. EXCEPTION
        // (FISC-REER-WHT-DOUBLE) : on RÉINJECTE la retenue REER/FERR prélevée — c'est un acompte
        // d'impôt qui reste au patrimoine jusqu'au règlement d'avril (.reer), pas un produit de vente
        // consommé. Le retrait devient ainsi NW-neutre (seul le net finance la dépense ; la retenue
        // n'est débitée qu'UNE fois, en avril).
        // delta = retenue prélevée par CET appel uniquement (cf rrspWithholdingAtStart), pas le mois entier.
        state.liquid = liquidAfterDirectSpend + (state.rrspWithholdingMois - rrspWithholdingAtStart);
    } else {
        // ── EXCESS ─────────────────────────────────────────────────────
        let excess = monthlyCashflow;

        if (state.liquid < targetEF) {
            const fillEF = Math.min(excess, targetEF - state.liquid);
            state.liquid += fillEF;
            excess -= fillEF;
        }

        // Cash drag sweep
        if (state.liquid > targetEF) {
            const sweep = state.liquid - targetEF;
            state.liquid -= sweep;
            excess += sweep;
        }

        // Dettes toxiques (>7%) ou toutes si DEBT_FIRST
        if (excess > 0) {
            const sortedDebts = activeDebts
                .filter(d => d.balance > 0 && (d.interestRate > 7 || debtFirstActive))
                .sort((a, b) => b.interestRate - a.interestRate);
            for (const d of sortedDebts) {
                const pay = Math.min(excess, d.balance);
                if (pay > 0) {
                    d.balance -= pay;
                    excess -= pay;
                    const label = d.interestRate > 7 ? 'dette à taux élevé' : 'remboursement accéléré';
                    state.flowEventLogs.push(`💸 Remboursement ${d.name} (${label}) : -${formatCAD(Math.round(pay))}`);
                }
            }
        }

        const hasRemainingDebtPostPay = activeDebts.some(d => d.balance > 0);

        // FHSA (sauf si DEBT_FIRST avec dettes restantes)
        if (excess > 0 && state.fhsaRoom > 0 && !isRetired && hasFuturePurchase && !hasPurchasedPrimary
            && (!debtFirstActive || !hasRemainingDebtPostPay)) {
            const fillFhsa = Math.min(state.fhsaRoom, excess);
            state.celiapp += fillFhsa;
            state.fhsaRoom -= fillFhsa;
            state.fhsaLifetimeContrib += fillFhsa;
            state.accFhsaYear += fillFhsa;
            state.contribCELIAPP += fillFhsa;
            excess -= fillFhsa;
        }

        if (!isRetired) {
            const yearsElapsedForMarg = Math.floor(m / 12);
            const estAnnualGross = (grossMarcBaseAnnual + (survivorMode ? 0 : grossAnnaBaseAnnual)) * Math.pow(1 + simSalaryGrowth / 100, yearsElapsedForMarg);
            const marginal = calculateFiscalReport(estAnnualGross / liveFilers, 0, 0, loopYear, enableMonteCarlo).marginalRate;

            // Ordre de cotisation : override explicite sinon dérivé de l'enum (REER
            // d'abord si PRIO_REER, ou si AUTO_MARGINAL à taux marginal élevé ≥ 40 %).
            // CF-3 (2026-06) : `marginal` (= FiscalReport.marginalRate) est un DÉCIMAL (~0,27–0,53),
            // pas un pourcentage. L'ancien seuil `>= 40` était donc TOUJOURS faux → AUTO_MARGINAL ne
            // cotisait JAMAIS REER-d'abord. Seuil correct = `>= 0.40` (40 %, choix Marc).
            const reerFirstContrib = contributionOrder
                ? contributionOrder === 'REER_FIRST'
                : (strategy === 'PRIO_REER' || (strategy === 'AUTO_MARGINAL' && marginal >= 0.40));

            if (debtFirstActive && hasRemainingDebtPostPay) {
                // Skip investments — excess will flow to liquid below
            } else if (reerFirstContrib) {
                if (excess > 0 && state.rrspRoom > 0) {
                    const fill = Math.min(state.rrspRoom, excess);
                    state.reer += fill; state.rrspRoom -= fill; excess -= fill;
                    state.accRrspYear += fill; state.contribREER += fill;
                }
                if (excess > 0 && state.celiRoom > 0) {
                    const fill = Math.min(state.celiRoom, excess);
                    state.celi += fill; state.celiRoom -= fill; excess -= fill;
                    state.contribCELI += fill;
                }
            } else {
                if (excess > 0 && state.celiRoom > 0) {
                    const fill = Math.min(state.celiRoom, excess);
                    state.celi += fill; state.celiRoom -= fill; excess -= fill;
                    state.contribCELI += fill;
                }
                if (excess > 0 && state.rrspRoom > 0) {
                    const fill = Math.min(state.rrspRoom, excess);
                    state.reer += fill; state.rrspRoom -= fill; excess -= fill;
                    state.accRrspYear += fill; state.contribREER += fill;
                }
            }
        } else {
            // RRIF Overflow → CELI prioritaire
            if (excess > 0 && state.celiRoom > 0) {
                const fill = Math.min(state.celiRoom, excess);
                state.celi += fill;
                state.celiRoom -= fill;
                excess -= fill;
                state.contribCELI += fill;
                state.flowEventLogs.push(`💰 ↳ Surplus placé dans le CELI : +${formatCAD(Math.round(fill))}`);
            }
        }

        if (excess > 0) {
            state.nonReg += excess;
            state.nonRegACB += excess;
            state.contribNonReg += excess;
        }
        // Conservation : ne JAMAIS remonter le liquide au-dessus de ce que le surplus permet.
        // Le remplissage du coussin + le sweep ci-dessus établissent déjà le bon niveau ;
        // un `= targetEF` inconditionnel fabriquait de l'argent quand le surplus du mois ne
        // suffisait pas à remplir le coussin (liquide poussé à targetEF sans source). `Math.min`
        // ne fait que plafonner (no-op dans le cas financé), sans rien créer.
        state.liquid = Math.min(state.liquid, targetEF);
    }
}
