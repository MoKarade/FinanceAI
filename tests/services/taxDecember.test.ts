// tests/services/taxDecember.test.ts
//
// Tests de CARACTÉRISATION du module fiscal le plus dense du moteur :
// services/projection/taxDecember.ts (money-critical, aucun test direct avant).
//
// Objectif : figer le comportement ACTUEL (non-régression), pas un idéal
// théorique. On privilégie des INVARIANTS robustes (signes, monotonie, seuils)
// + quelques valeurs PINNÉES déterministes.
//
// Les 3 helpers de processDecemberTaxFiling (calculateFiscalReport,
// getMarginalRate, calculateDividendTax) sont INJECTÉS → on les STUB pour des
// montants exacts indépendants des tables fiscales réelles.
// RAMQ et FSS utilisent les VRAIES fonctions (calculateRamqPremium /
// calculateFSSPremium, non injectées). En 2026 l'inflationFactor = 1, donc les
// seuils valent leur valeur de base — les bornes choisies sont donc fiables.

import { describe, it, expect } from 'vitest';
import {
    computeOasClawback,
    processTaxLossHarvesting,
    processGainHarvesting,
    processDecemberTaxFiling,
    type DecemberContext,
    type DecemberHelpers,
} from '../../services/projection/taxDecember';
import {
    OAS_CLAWBACK_THRESHOLD_2026,
    CAPITAL_GAINS_INCLUSION_STANDARD,
    RAMQ_EXEMPTION_SINGLE_2026,
    FSS_THRESHOLD_ZERO,
    FSS_THRESHOLD_FLAT,
    calculateFiscalReport,
    getMarginalRate,
    calculateDividendTax,
    getDividendGrossUpRate,
    type FiscalReport,
    type AgeCreditOptions,
} from '../../utils/tax';

const DECEMBER = 11; // currentMonthIndex de décembre

// ──────────────────────────────────────────────────────────────────────────
// computeOasClawback — récupération PSV prévue (annuelle)
// ──────────────────────────────────────────────────────────────────────────

describe('computeOasClawback — gate « décembre, m>0, retraité 65+ »', () => {
    it('mois ≠ décembre → clawback nul', () => {
        const r = computeOasClawback(5, 24, true, 70, 1, 200000, 0, 0, 800, 0);
        expect(r.clawbackAnnual).toBe(0);
        expect(r.logMsg).toBeUndefined();
    });

    it('m === 0 (tout premier mois) → clawback nul', () => {
        const r = computeOasClawback(DECEMBER, 0, true, 70, 1, 200000, 0, 0, 800, 0);
        expect(r.clawbackAnnual).toBe(0);
    });

    it('non-retraité → clawback nul même au-dessus du seuil', () => {
        const r = computeOasClawback(DECEMBER, 24, false, 70, 1, 200000, 0, 0, 800, 0);
        expect(r.clawbackAnnual).toBe(0);
    });

    it('âge < 65 → clawback nul même au-dessus du seuil', () => {
        const r = computeOasClawback(DECEMBER, 24, true, 60, 1, 200000, 0, 0, 800, 0);
        expect(r.clawbackAnnual).toBe(0);
    });
});

describe('computeOasClawback — seuil de revenu de pension', () => {
    it('SOUS le seuil → clawback nul', () => {
        // revenu pension annuel = 5000 × 12 = 60 000 < 95 323
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 5000, 0, 0, 800, 0);
        expect(r.clawbackAnnual).toBe(0);
    });

    it('exactement AU seuil → clawback nul (comparaison <=)', () => {
        // incomeRetirementMonthly × 12 = seuil exact, accRetraits/accRentes = 0
        const monthly = OAS_CLAWBACK_THRESHOLD_2026 / 12;
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, monthly, 0, 0, 800, 0);
        expect(r.clawbackAnnual).toBe(0);
    });

    it('AU-DESSUS du seuil → clawback strictement positif + log d\'avertissement', () => {
        // 10 000 × 12 = 120 000 > 95 323 → excès ~24 677 × 15% ~3702, plafonné par psv (9600)
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 10000, 0, 0, 800, 0);
        expect(r.clawbackAnnual).toBeGreaterThan(0);
        expect(r.logMsg).toContain('PSV Clawback');
    });

    it('clawback PINNÉ = 15% de l\'excès quand sous le plafond PSV', () => {
        // m=24, simInflation absente côté appel ⇒ on passe 0 pour figer psvAnnualBase = 800×12 = 9600.
        // revenu pension = 8000×12 = 96 000 → excès = 96 000 - 95 323 = 677 → 15% = 101.55
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 8000, 0, 0, 800, 0);
        const excess = 96000 - OAS_CLAWBACK_THRESHOLD_2026;
        expect(r.clawbackAnnual).toBeCloseTo(excess * 0.15, 5);
    });

    it('clawback PLAFONNÉ par la PSV de base (min(psvAnnual, excès×15%))', () => {
        // revenu pension très élevé (50 000×12 = 600 000) → excès×15% ≫ psv.
        // psvAnnualBase = 500 × 12 × (1+0)^... = 6000 → clawback plafonné à 6000.
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 50000, 0, 0, 500, 0);
        expect(r.clawbackAnnual).toBeCloseTo(6000, 5);
    });

    it('monotone : revenu de pension ↑ → clawback ↑ (jusqu\'au plafond)', () => {
        const low = computeOasClawback(DECEMBER, 24, true, 70, 1, 8500, 0, 0, 5000, 0).clawbackAnnual;
        const high = computeOasClawback(DECEMBER, 24, true, 70, 1, 9000, 0, 0, 5000, 0).clawbackAnnual;
        expect(high).toBeGreaterThan(low);
    });

    it('agrège revenu mensuel + retraits REER + rentes pour franchir le seuil', () => {
        // mensuel seul = 60 000 < seuil, mais + 50 000 retraits + 10 000 rentes = 120 000 > seuil
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 5000, 50000, 10000, 5000, 0);
        expect(r.clawbackAnnual).toBeGreaterThan(0);
    });

    it('PV-9 — les gains en capital de l\'année (×0,5) entrent dans l\'assiette du clawback PSV', () => {
        // Pension 7 500 $/mois = 90 000 $/an < seuil 95 323 → sans gains : clawback 0.
        // + 30 000 $ de gains BRUTS × 50 % = 15 000 $ imposables → 105 000 $ > seuil.
        const sansGains = computeOasClawback(DECEMBER, 24, true, 70, 1, 7500, 0, 0, 800, 0, 1, undefined, undefined, 0);
        const avecGains = computeOasClawback(DECEMBER, 24, true, 70, 1, 7500, 0, 0, 800, 0, 1, undefined, undefined, 30000);
        expect(sansGains.clawbackAnnual).toBe(0);
        // excès = (90 000 + 15 000) − seuil ; clawback = excès × 15 % (sous le plafond PSV).
        const excess = 90000 + 30000 * 0.5 - OAS_CLAWBACK_THRESHOLD_2026;
        expect(avecGains.clawbackAnnual).toBeCloseTo(excess * 0.15, 2);
    });

    it('PV-9 — gains négatifs/NaN clampés (jamais de clawback fantôme)', () => {
        const base = computeOasClawback(DECEMBER, 24, true, 70, 1, 7500, 0, 0, 800, 0, 1, undefined, undefined, 0);
        const neg = computeOasClawback(DECEMBER, 24, true, 70, 1, 7500, 0, 0, 800, 0, 1, undefined, undefined, -50000);
        const nan = computeOasClawback(DECEMBER, 24, true, 70, 1, 7500, 0, 0, 800, 0, 1, undefined, undefined, NaN);
        expect(neg.clawbackAnnual).toBe(base.clawbackAnnual);
        expect(nan.clawbackAnnual).toBe(base.clawbackAnnual);
    });

    it('seuil indexé par l\'inflation NOMINALE du revenu (simInflation), PAS expenseMultiplier', () => {
        // BONUS FIX (Marc, 2026-06) — le seuil PSV suit désormais l'inflation nominale du
        // revenu (Math.pow(1+simInflation/100, m/12)), pas l'inflation des dépenses.
        // Preuve 1 : expenseMultiplier n'a plus AUCUN effet (5e arg), à simInflation égal.
        const mult1 = computeOasClawback(DECEMBER, 24, true, 70, 1.0, 100000 / 12, 0, 0, 5000, 0);
        const mult2 = computeOasClawback(DECEMBER, 24, true, 70, 1.2, 100000 / 12, 0, 0, 5000, 0);
        expect(mult2.clawbackAnnual).toBeCloseTo(mult1.clawbackAnnual, 5);

        // Preuve 2 : c'est bien simInflation (dernier arg) qui relève le seuil.
        // revenu nominal = 100 000. Sans inflation (seuil 95 323) → clawback > 0.
        // Avec simInflation=10 % sur m=24 (2 ans) → seuil ≈ 95 323 × 1.21 ≈ 115 341 > 100 000 → nul.
        const noInfl = computeOasClawback(DECEMBER, 24, true, 70, 1, 100000 / 12, 0, 0, 5000, 0);
        const withInfl = computeOasClawback(DECEMBER, 24, true, 70, 1, 100000 / 12, 0, 0, 5000, 10);
        expect(noInfl.clawbackAnnual).toBeGreaterThan(0);
        expect(withInfl.clawbackAnnual).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────────────────
// FA-2 (audit 2026-06-09) : clawback PSV PAR CONJOINT (seuil par particulier)
// ──────────────────────────────────────────────────────────────────────────
describe('FA-2 (audit 2026-06-09) : clawback PSV par conjoint — seuil PAR PARTICULIER', () => {
    // ARC : le seuil de récupération s'applique au revenu net INDIVIDUEL. L'ancien code
    // comparait le revenu FAMILIAL au seuil individuel → clawback fictif pour les couples.

    it('RÉGRESSION CLÉ : couple 150 k$ familial (75 k$ chacun) → AUCUN clawback (ancien code : ~8 200 $/an fictif)', () => {
        // 6 250 $/mois/conjoint × 12 = 75 000 $ chacun, < 95 323. L'ancien agrégat familial
        // donnait (150 000 − 95 323) × 15 % ≈ 8 201,55 $ de clawback INDU.
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 12500, 0, 0, 800, 0,
            2, [6250, 6250], [0, 0]);
        expect(r.clawbackAnnual).toBe(0);
    });

    it('couple asymétrique : seul le conjoint au-dessus du seuil est récupéré, sur SON excédent', () => {
        // [10 000, 1 000] $/mois → 120 000 / 12 000 $. Excédent user0 = 24 677 × 15 % = 3 701,55 ;
        // cap par conjoint = 800×12/2 = 4 800 → non liant. User1 : aucun clawback.
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 11000, 0, 0, 800, 0,
            2, [10000, 1000], [0, 0]);
        expect(r.clawbackAnnual).toBeCloseTo((120000 - OAS_CLAWBACK_THRESHOLD_2026) * 0.15, 5);
    });

    it('cap PAR CONJOINT : la récupération d\'un conjoint est plafonnée à SA part de PSV (pas la PSV familiale)', () => {
        // User0 à 600 k$ → 15 % de l'excédent ≫ cap. Cap par conjoint = 800×12/2 = 4 800 (pas 9 600).
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 51000, 0, 0, 800, 0,
            2, [50000, 1000], [0, 0]);
        expect(r.clawbackAnnual).toBeCloseTo(4800, 5);
    });

    it('retraits REER attribués par conjoint entrent dans le revenu individuel', () => {
        // Pensions égales 40 k$ chacun ; retraits REER [80 000, 0] → user0 = 120 000 > seuil.
        const expected = (120000 - OAS_CLAWBACK_THRESHOLD_2026) * 0.15;
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 80000 / 12, 80000, 0, 800, 0,
            2, [40000 / 12, 40000 / 12], [80000, 0]);
        expect(r.clawbackAnnual).toBeCloseTo(expected, 5);
    });

    it('SOLO : comportement strictement inchangé (n=1 par défaut)', () => {
        // Même appel que les tests historiques : 10 000×12 = 120 000 → 15 % de l'excédent.
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 10000, 0, 0, 800, 0);
        expect(r.clawbackAnnual).toBeCloseTo((120000 - OAS_CLAWBACK_THRESHOLD_2026) * 0.15, 5);
    });

    it('repli sans décomposition : split ÉGAL par adulte (jamais l\'agrégat familial)', () => {
        // n=2 sans tableaux → 150 000/2 = 75 000 chacun < seuil → 0 (l'ancien agrégat donnait ~8 200).
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 12500, 0, 0, 800, 0, 2);
        expect(r.clawbackAnnual).toBe(0);
    });

    it('garde NaN : décomposition corrompue → repli split égal, jamais NaN', () => {
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 12500, 0, 0, 800, 0,
            2, [NaN, 6250], [0, 0]);
        expect(Number.isFinite(r.clawbackAnnual)).toBe(true);
        expect(r.clawbackAnnual).toBe(0); // split égal 75 k$ chacun → sous le seuil
    });

    it('garde somme REER incohérente : repli split égal des retraits', () => {
        // perUserReer [100 000, 0] mais accRetraitsReerYear = 40 000 (incohérent) → split égal
        // 20 000 chacun → user0 = 60 000 + 20 000 = 80 000 < seuil → 0.
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 120000 / 12, 40000, 0, 800, 0,
            2, [60000 / 12, 60000 / 12], [100000, 0]);
        expect(r.clawbackAnnual).toBe(0);
    });

    it('survivorMode (contrat du call-site) : 1 bénéficiaire VIVANT → revenu complet vs seuil, PAS de split ×2', () => {
        // projection.ts passe oasBeneficiaries = survivorMode ? 1 : activeUsersCount, SANS
        // décomposition. Un survivant à 130 k$ doit être récupéré (~5,2 k$/an) — le diviser
        // par les 2 têtes du setup (65 k$ « chacun ») aurait donné 0 (régression évitée).
        const survivant = computeOasClawback(DECEMBER, 24, true, 70, 1, 130000 / 12, 0, 0, 800, 0, 1);
        expect(survivant.clawbackAnnual).toBeCloseTo(
            Math.min(800 * 12, (130000 - OAS_CLAWBACK_THRESHOLD_2026) * 0.15), 5);
        const splitATort = computeOasClawback(DECEMBER, 24, true, 70, 1, 130000 / 12, 0, 0, 800, 0, 2);
        expect(splitATort.clawbackAnnual).toBe(0); // ce qu'aurait donné n=2 — d'où le ternaire survivorMode
    });

    it('revenus locatifs répartis également entre conjoints', () => {
        // Pensions 60 k$ chacun + 80 k$ de loyers (→ +40 k$ chacun) → 100 k$ chacun > seuil.
        const expectedPerUser = (100000 - OAS_CLAWBACK_THRESHOLD_2026) * 0.15;
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 120000 / 12, 0, 80000, 800, 0,
            2, [60000 / 12, 60000 / 12], [0, 0]);
        expect(r.clawbackAnnual).toBeCloseTo(2 * expectedPerUser, 5);
    });
});

// ──────────────────────────────────────────────────────────────────────────
// FA-8 (2026-06-11) : cap du clawback = PSV réellement VERSÉE
// (15e paramètre psvActualMonthlyNominal — mensuelle, NOMINALE, HORS SRG)
// ──────────────────────────────────────────────────────────────────────────
describe('FA-8 : cap clawback = PSV réellement versée (psvActualMonthlyNominal)', () => {
    // Avant FA-8 le cap était psvBasePension (base SANS facteur de report) : clawback
    // SOUS-estimé pour un reporteur 66-70 à haut revenu (cap réel jusqu'à ×1,36×1,10 plus
    // haut), SURestimé si prorata de résidence < 1, et clawback FICTIF possible avant
    // psvStartAge (PSV non versée). Le 15e param (breakdown de décembre psv − gis) corrige.

    it('RÉGRESSION CLÉ (reporteur à 70 ans, ×1,36) : cap = PSV réelle ×12 = 9 792 $, PAS la base ×12 = 7 200 $', () => {
        // base 600 $/mois ; PSV réellement versée 816 $/mois (report ×1,36). Revenu très haut
        // (50 000 $/mois = 600 000 $/an) → 15 % de l'excédent ≈ 75 702 $ ≫ cap → le cap est liant.
        const avecCap = computeOasClawback(DECEMBER, 24, true, 70, 1, 50000, 0, 0, 600, 0,
            1, undefined, undefined, 0, 816);
        expect(avecCap.clawbackAnnual).toBeCloseTo(816 * 12, 5); // 9 792 — la PSV REÇUE
        // Contraste legacy : 15e param ABSENT → repli sur la base (l'ancien plafond sous-estimé).
        const sansCap = computeOasClawback(DECEMBER, 24, true, 70, 1, 50000, 0, 0, 600, 0,
            1, undefined, undefined, 0);
        expect(sansCap.clawbackAnnual).toBeCloseTo(600 * 12, 5); // 7 200 — l'ancien comportement
        expect(avecCap.clawbackAnnual).toBeGreaterThan(sansCap.clawbackAnnual);
    });

    it('cap déjà NOMINAL : PAS re-multiplié par l\'inflation (contrairement au repli base, indexé)', () => {
        // simInflation 10 %, m=24 → facteur nominal 1,1² = 1,21. Le breakdown fourni est DÉJÀ
        // nominal → cap = 816×12 exactement (re-multiplier donnerait 11 848 $, double-indexation).
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 100000, 0, 0, 600, 10,
            1, undefined, undefined, 0, 816);
        expect(r.clawbackAnnual).toBeCloseTo(816 * 12, 5);
        // Le repli legacy (param absent), lui, indexe la base : 600×12×1,21.
        const legacy = computeOasClawback(DECEMBER, 24, true, 70, 1, 100000, 0, 0, 600, 10);
        expect(legacy.clawbackAnnual).toBeCloseTo(600 * 12 * Math.pow(1.1, 2), 5);
    });

    it('cap NON liant : sous le plafond, le clawback reste 15 % de l\'excédent (identique avec/sans cap)', () => {
        // 8 000 $/mois = 96 000 $/an → excédent 677 × 15 % = 101,55 $ < cap (816×12 ou 600×12).
        const avec = computeOasClawback(DECEMBER, 24, true, 70, 1, 8000, 0, 0, 600, 0,
            1, undefined, undefined, 0, 816);
        const sans = computeOasClawback(DECEMBER, 24, true, 70, 1, 8000, 0, 0, 600, 0);
        const excess = 96000 - OAS_CLAWBACK_THRESHOLD_2026;
        expect(avec.clawbackAnnual).toBeCloseTo(excess * 0.15, 5);
        expect(avec.clawbackAnnual).toBeCloseTo(sans.clawbackAnnual, 5);
    });

    it('cap = 0 (PSV pas encore versée — report en cours avant psvStartAge) → AUCUN clawback même à très haut revenu', () => {
        // 67 ans, début PSV choisi à 70 : PSV versée = 0 → récupérer une PSV non reçue serait
        // fictif. Avant FA-8 : cap = base 600×12 → jusqu'à 7 200 $/an de clawback INDU.
        const r = computeOasClawback(DECEMBER, 24, true, 67, 1, 50000, 0, 0, 600, 0,
            1, undefined, undefined, 0, 0);
        expect(r.clawbackAnnual).toBe(0);
        expect(r.logMsg).toBeUndefined();
    });

    it('cap NÉGATIF (corruption amont) → clampé à 0 : clawback nul, jamais NaN', () => {
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 50000, 0, 0, 600, 0,
            1, undefined, undefined, 0, -816);
        expect(Number.isFinite(r.clawbackAnnual)).toBe(true);
        expect(r.clawbackAnnual).toBe(0);
        expect(r.logMsg).toBeUndefined(); // négatif = fini → pas le marqueur « invalide »
    });

    it('cap NaN (présent-mais-invalide) → repli sur la BASE + marqueur « invalide » dans le log', () => {
        // Revue FA-8 (silent-failure) : présent-mais-NaN ≠ absent — la corruption amont
        // (ex. psvResidencyYears NaN) doit laisser une trace, pas un repli silencieux.
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 50000, 0, 0, 600, 0,
            1, undefined, undefined, 0, NaN);
        expect(r.clawbackAnnual).toBeCloseTo(600 * 12, 5); // repli base — jamais NaN
        expect(r.logMsg).toContain('[cap PSV réel invalide');
    });

    it('cap NaN avec clawback NUL → le marqueur « invalide » est quand même émis (trace de corruption)', () => {
        // Revenu sous le seuil → clawback 0 ; sans le `|| capInvalid`, le log serait omis.
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 5000, 0, 0, 600, 0,
            1, undefined, undefined, 0, NaN);
        expect(r.clawbackAnnual).toBe(0);
        expect(r.logMsg).toContain('[cap PSV réel invalide');
    });

    it('cap Infinity → invalide aussi (Number.isFinite) : repli base + marqueur', () => {
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 50000, 0, 0, 600, 0,
            1, undefined, undefined, 0, Infinity);
        expect(r.clawbackAnnual).toBeCloseTo(600 * 12, 5);
        expect(r.logMsg).toContain('[cap PSV réel invalide');
    });

    it('couple : le cap RÉEL est réparti PAR CONJOINT (actual×12/n)', () => {
        // 2 conjoints à 600 k$/an chacun → chacun plafonné à 816×12/2 = 4 896 → total 9 792.
        const r = computeOasClawback(DECEMBER, 24, true, 70, 1, 100000, 0, 0, 600, 0,
            2, [50000, 50000], [0, 0], 0, 816);
        expect(r.clawbackAnnual).toBeCloseTo(816 * 12, 5);
    });
});

// ──────────────────────────────────────────────────────────────────────────
// processTaxLossHarvesting — cristallisation de perte (décembre)
// ──────────────────────────────────────────────────────────────────────────

describe('processTaxLossHarvesting — gate & déclencheurs', () => {
    it('mois ≠ décembre → rien', () => {
        const r = processTaxLossHarvesting(5, 24, 100000, 80000, -20);
        expect(r).toEqual({ harvestedLoss: 0, acbDelta: 0 });
    });

    it('m === 0 → rien', () => {
        const r = processTaxLossHarvesting(DECEMBER, 0, 100000, 80000, -20);
        expect(r).toEqual({ harvestedLoss: 0, acbDelta: 0 });
    });

    it('rendement Non-Reg POSITIF → pas de récolte (rien à cristalliser)', () => {
        const r = processTaxLossHarvesting(DECEMBER, 24, 100000, 80000, +12);
        expect(r.harvestedLoss).toBe(0);
        expect(r.logMsg).toBeUndefined();
    });

    it('rendement nul → pas de récolte', () => {
        const r = processTaxLossHarvesting(DECEMBER, 24, 100000, 80000, 0);
        expect(r.harvestedLoss).toBe(0);
    });

    it('solde Non-Reg nul ou négatif → pas de récolte', () => {
        const r = processTaxLossHarvesting(DECEMBER, 24, 0, 0, -20);
        expect(r.harvestedLoss).toBe(0);
    });

    it('année négative + PERTE latente (ACB > valeur) → récolte positive + log', () => {
        // valeur 80 000 < ACB 100 000 → perte latente 20 000 ; on vend 50 %
        const r = processTaxLossHarvesting(DECEMBER, 24, 80000, 100000, -20);
        expect(r.harvestedLoss).toBeGreaterThan(0);
        expect(r.logMsg).toContain('TLH');
    });

    it('PV-8 anti-fabrication : année négative mais GAIN latent (ACB < valeur) → AUCUNE récolte', () => {
        // valeur 100 000 > ACB 80 000 = gain latent : vendre réaliserait un GAIN, pas une perte.
        // (ancien bug : récoltait 10 000 $ fabriqués à partir du seul taux -20 %)
        const r = processTaxLossHarvesting(DECEMBER, 24, 100000, 80000, -20);
        expect(r).toEqual({ harvestedLoss: 0, acbDelta: 0 });
        expect(r.logMsg).toBeUndefined();
    });

    it('perte récoltée PINNÉE = 50 % × (ACB − valeur), INDÉPENDANTE du taux', () => {
        // fakeSell = 80 000 × 0.5 = 40 000 ; costBasisSold = 40 000 × (100000/80000) = 50 000
        // harvestedLoss = 50 000 − 40 000 = 10 000 = 0.5 × (100000 − 80000)
        const r = processTaxLossHarvesting(DECEMBER, 24, 80000, 100000, -20);
        expect(r.harvestedLoss).toBeCloseTo(0.5 * (100000 - 80000), 5);
        // même valeur/ACB, taux plus profond → MÊME récolte (le taux ne sert qu'à déclencher)
        const deeperRate = processTaxLossHarvesting(DECEMBER, 24, 80000, 100000, -40);
        expect(deeperRate.harvestedLoss).toBeCloseTo(r.harvestedLoss, 5);
    });

    it('perte latente plus PROFONDE → récolte plus grande (monotone en profondeur de perte)', () => {
        // ACB fixe 100 000 ; valeur 90 000 (perte 10 000) vs 70 000 (perte 30 000)
        const shallow = processTaxLossHarvesting(DECEMBER, 24, 90000, 100000, -20).harvestedLoss;
        const deep = processTaxLossHarvesting(DECEMBER, 24, 70000, 100000, -20).harvestedLoss;
        expect(deep).toBeGreaterThan(shallow);
        expect(shallow).toBeCloseTo(0.5 * (100000 - 90000), 5);
        expect(deep).toBeCloseTo(0.5 * (100000 - 70000), 5);
    });

    it('acbDelta PINNÉ = −harvestedLoss (conservation : banque +L, ACB −L)', () => {
        const r = processTaxLossHarvesting(DECEMBER, 24, 80000, 100000, -20);
        expect(r.harvestedLoss).toBeCloseTo(10000, 5);
        expect(r.acbDelta).toBeCloseTo(-10000, 5);
        expect(r.acbDelta).toBeCloseTo(-r.harvestedLoss, 5); // gain futur régénéré = perte banquée
    });
});

// processGainHarvesting — récolte de GAINS (timing de réalisation, levier gainHarvesting)
describe('processGainHarvesting — remplir le 1er palier dans une année à faible revenu', () => {
    const base = {
        enabled: true, nonReg: 200000, nonRegACB: 100000, // 100 000 $ de gain latent
        otherTaxableNominal: 20000, existingGainsNominal: 0,
        activeUsersCount: 1, loopYear: 2026, // 2026 → 1er palier 54 345 $ (non indexé)
    };
    it('désactivé → rien', () => {
        expect(processGainHarvesting({ ...base, enabled: false }).harvestedGain).toBe(0);
    });
    it('aucun gain latent (ACB ≥ solde) → rien', () => {
        expect(processGainHarvesting({ ...base, nonRegACB: 200000 }).harvestedGain).toBe(0);
    });
    it('revenu déjà au-dessus du 1er palier → aucune place → rien', () => {
        expect(processGainHarvesting({ ...base, otherTaxableNominal: 60000 }).harvestedGain).toBe(0);
    });
    it('faible revenu : remplit le 1er palier (revenu + 50 % du gain = plafond 54 345 $)', () => {
        const r = processGainHarvesting(base);
        expect(r.harvestedGain).toBeCloseTo(68690, 0); // (54345−20000)/0,5
        expect(20000 + r.harvestedGain * 0.5).toBeCloseTo(54345, 0); // assiette pile au plafond
        expect(r.logMsg).toContain('Récolte');
    });
    it('gain latent < place → borné par le latent', () => {
        const r = processGainHarvesting({ ...base, nonReg: 130000 }); // latent 30k < 68690
        expect(r.harvestedGain).toBeCloseTo(30000, 0);
    });
    it('couple (×N) : palier doublé → récolte plus', () => {
        expect(processGainHarvesting({ ...base, activeUsersCount: 2 }).harvestedGain)
            .toBeGreaterThan(processGainHarvesting(base).harvestedGain);
    });
    it('gains déjà réalisés cette année réduisent la place', () => {
        const r = processGainHarvesting({ ...base, existingGainsNominal: 40000 });
        expect(r.harvestedGain).toBeCloseTo(28690, 0); // room=(54345−20000−20000)/0,5
    });

    // [PV-2] — la banque de pertes (TLH) compense les gains récoltés EN PREMIER
    // (LIR 111(1)(b)) : part compensée = 0 $ d'impôt et HORS palier.
    it('PV-2 : sans banque, comportement identique (consumedLoss = 0, non-régression)', () => {
        const r = processGainHarvesting({ ...base, capitalLossBank: 0 });
        expect(r.harvestedGain).toBeCloseTo(68690, 0);
        expect(r.consumedLoss).toBe(0);
    });
    it('PV-2 : banque ≥ latent → récolte COMPLÈTE même sans aucune place de palier', () => {
        // Revenu déjà au-dessus du palier (aucune place) MAIS banque 120k ≥ latent 100k :
        // tout le latent est récolté gratuitement (avant : harvestedGain = 0).
        const r = processGainHarvesting({ ...base, otherTaxableNominal: 60000, capitalLossBank: 120000 });
        expect(r.harvestedGain).toBeCloseTo(100000, 0);
        expect(r.consumedLoss).toBeCloseTo(100000, 0);
        expect(r.logMsg).toContain('banque de pertes');
    });
    it('PV-2 : banque partielle → part gratuite (hors palier) + remplissage du palier sur le RESTE', () => {
        // banque 30k → 30k gratuits, puis (54345−20000)/0,5 = 68 690 sur le latent restant (70k).
        const r = processGainHarvesting({ ...base, capitalLossBank: 30000 });
        expect(r.consumedLoss).toBeCloseTo(30000, 0);
        expect(r.harvestedGain).toBeCloseTo(30000 + 68690, 0);
        // Part imposable = harvestedGain − consumedLoss → remplit exactement le palier.
        expect(20000 + (r.harvestedGain - r.consumedLoss) * 0.5).toBeCloseTo(54345, 0);
    });
    it('PV-2 : la part gratuite n\'occupe AUCUNE place de palier (vs ancien comportement)', () => {
        // Avec banque 30k, la récolte totale dépasse le plafond « sans banque » (68 690) :
        // preuve que la part compensée ne mange pas la place du palier.
        const sans = processGainHarvesting(base);
        const avec = processGainHarvesting({ ...base, capitalLossBank: 30000 });
        expect(avec.harvestedGain).toBeGreaterThan(sans.harvestedGain + 29000);
    });
});

// ──────────────────────────────────────────────────────────────────────────
// processDecemberTaxFiling — régularisation annuelle d'impôt
// ──────────────────────────────────────────────────────────────────────────

// Stub déterministe : impôt = 25% du brut réel ; retenue = même 25%.
// getMarginalRate fixe à 40% ; calculateDividendTax = div × marginal.
const STUB_RATE = 0.25;
const STUB_MARGINAL = 0.40;

const makeHelpers = (overrides: Partial<DecemberHelpers> = {}): DecemberHelpers => ({
    // Impôt = taux × (brut - déductions). On lit le 2e arg (deductions) pour que
    // l'effet T1213 (retenue avec vs sans déductions) soit réellement discriminant.
    calculateFiscalReport: ((gross: number, deductions: number) =>
        ({ totalTax: Math.max(0, gross - (deductions ?? 0)) * STUB_RATE } as unknown as FiscalReport)) as DecemberHelpers['calculateFiscalReport'],
    getMarginalRate: () => STUB_MARGINAL,
    calculateDividendTax: (annualDiv: number, marginalRate: number) => annualDiv * marginalRate,
    ...overrides,
});

const ZERO_TAX = { revenu: 0, gains: 0, divers: 0, reer: 0 };

const baseCtx = (o: Partial<DecemberContext> = {}): DecemberContext => ({
    m: 24,
    loopYear: 2026,
    isRetired: false,
    enableMonteCarlo: false,
    yearsElapsed: 0,
    inflationFactor: 1,
    activeUsersCount: 1,
    grossMarcBaseAnnual: 0,
    grossAnnaBaseAnnual: 0,
    simSalaryGrowth: 0,
    optimizeSourceDeductions: undefined,
    incomeRetirementMonthly: 0,
    nonReg: 0,
    baseNonRegRate: 0,
    accRrspYear: 0,
    accFhsaYear: 0,
    smithInterestDeductibleYear: 0,
    accRentesYear: 0,
    accRetraitsReerYear: 0,
    accCapitalGainsYear: 0,
    age: 40,
    childrenCount: 0,
    ramqExempt: true, // par défaut on neutralise RAMQ pour isoler les autres blocs
    ...o,
});

describe('processDecemberTaxFiling — gate « décembre, m>0 »', () => {
    it('mois ≠ décembre → renvoie l\'état initial inchangé, aucun log', () => {
        const init = { revenu: 123, gains: 45, divers: 6, reer: 7 };
        const r = processDecemberTaxFiling(5, baseCtx(), makeHelpers(), init);
        expect(r.newTaxCurrentYear).toEqual(init);
        expect(r.logs).toEqual([]);
    });

    it('m === 0 → renvoie l\'état initial inchangé', () => {
        const init = { revenu: 123, gains: 45, divers: 6, reer: 7 };
        const r = processDecemberTaxFiling(DECEMBER, baseCtx({ m: 0 }), makeHelpers(), init);
        expect(r.newTaxCurrentYear).toEqual(init);
        expect(r.logs).toEqual([]);
    });

    it('ne mute pas l\'objet taxCurrentYear initial (immutabilité)', () => {
        const init = { revenu: 0, gains: 0, divers: 0, reer: 0 };
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ grossMarcBaseAnnual: 120000, optimizeSourceDeductions: false }),
            makeHelpers(),
            init,
        );
        expect(init).toEqual({ revenu: 0, gains: 0, divers: 0, reer: 0 });
        expect(r.newTaxCurrentYear).not.toBe(init);
    });
});

describe('processDecemberTaxFiling — actif : régularisation salariale (T1213)', () => {
    it('sans optimisation (retenue employeur sans déductions) : régularisation ≈ -8% de l\'impôt', () => {
        // Sans déductions : impôt réel = retenue brute = 120000×0.25 = 30000.
        // estimatedWithholding = 30000 × 0.92 = 27600 → revenu = 30000 - 27600 = 2400.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ grossMarcBaseAnnual: 120000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.revenu).toBeCloseTo(2400, 5);
    });

    it('avec optimisation T1213 : la retenue suit l\'impôt réel (avec déductions)', () => {
        // optimizeSourceDeductions=true → taxEmployer = taxReal.
        // Déductions 20000 au plus haut salaire. impôt réel = (120000-20000)×0.25 = 25000.
        // withholding = 25000 × 0.92 = 23000 → revenu = 25000 - 23000 = 2000.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ grossMarcBaseAnnual: 120000, accRrspYear: 20000, optimizeSourceDeductions: true }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.revenu).toBeCloseTo(2000, 5);
    });

    it('monotone : brut salarial ↑ → impôt de régularisation ↑', () => {
        const low = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        ).newTaxCurrentYear.revenu;
        const high = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ grossMarcBaseAnnual: 200000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        ).newTaxCurrentYear.revenu;
        expect(high).toBeGreaterThan(low);
    });

    it('régularisation plancher : jamais sous -100 000 (remboursement borné)', () => {
        // calculateFiscalReport stubé à 0 → totalAnnualTax=0, withholding=0 → revenu=max(-100000, 0)=0.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ grossMarcBaseAnnual: 0, optimizeSourceDeductions: false }),
            makeHelpers({ calculateFiscalReport: () => ({ totalTax: 0 } as unknown as FiscalReport) }),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.revenu).toBeGreaterThanOrEqual(-100000);
    });
});

describe('processDecemberTaxFiling — retraité : impôt marginal réel réconcilié', () => {
    // FIX FISCAL (Marc, 2026-06) — l'ancien comportement n'ajoutait que 5 % du vrai
    // impôt (« 95 % retenu à la source »), MAIS il n'existe aucune retenue mensuelle
    // pour les retraités. Le nouveau comportement régularise au taux marginal RÉEL :
    //   complément .revenu = vrai impôt annuel − retenue déjà captée dans .reer.
    // La somme (.reer + complément) == vrai impôt annuel, en miroir de la phase active.

    it('sans retenue REER préalable : régularise au VRAI impôt total (≈100 %, plus 5 %)', () => {
        // pension = 5000×12 = 60000, aucun retrait REER, .reer initial = 0.
        // Stub linéaire 25 % → vrai impôt = 60000×0.25 = 15000. Réconciliation = 15000 − 0 = 15000.
        // (Avant le fix : seulement 750. Le retraité était sous-imposé d'un facteur ~20.)
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ isRetired: true, incomeRetirementMonthly: 5000 }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.revenu).toBeCloseTo(15000, 5);
    });

    it('retraits REER inclus dans l\'assiette imposable retraité', () => {
        // pension 60000 + retraits REER 40000 = assiette 100000. Stub 25 % → vrai impôt 25000.
        // .reer initial = 0 (aucune retenue préalable simulée ici) → réconciliation = 25000.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ isRetired: true, incomeRetirementMonthly: 5000, accRetraitsReerYear: 40000 }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.revenu).toBeCloseTo(25000, 5);
    });

    it('Phase 2 — retraits REER attribués PAR CONJOINT : la concentration paie plus (progressivité)', () => {
        // Stub PROGRESSIF (20 % jusqu'à 50k, 45 % au-delà) pour révéler l'effet du split.
        // Couple retraité, pension nulle, 100 000 $ de retraits REER dans l'année.
        const progressive = makeHelpers({
            calculateFiscalReport: ((gross: number) =>
                ({ totalTax: gross <= 50000 ? gross * 0.2 : 10000 + (gross - 50000) * 0.45 } as unknown as FiscalReport)
            ) as DecemberHelpers['calculateFiscalReport'],
        });
        const coupleRetired = (byUser?: number[]): Partial<DecemberContext> => ({
            isRetired: true, activeUsersCount: 2, incomeRetirementMonthly: 0,
            incomeRetirementPerUserMonthly: [0, 0], age: 70, ageSpouse: 70,
            accRetraitsReerYear: 100000, accRetraitsReerYearByUser: byUser,
        });
        // Split ÉGAL (attribution absente) : 50k chacun → 10k + 10k = 20 000.
        const equal = processDecemberTaxFiling(DECEMBER, baseCtx(coupleRetired(undefined)), progressive, ZERO_TAX);
        expect(equal.newTaxCurrentYear.revenu).toBeCloseTo(20000, 5);
        // Tout sur UN conjoint (100k / 0) : 32 500 + 0 → impôt combiné PLUS élevé, plus exact.
        const concentrated = processDecemberTaxFiling(DECEMBER, baseCtx(coupleRetired([100000, 0])), progressive, ZERO_TAX);
        expect(concentrated.newTaxCurrentYear.revenu).toBeCloseTo(32500, 5);
        expect(concentrated.newTaxCurrentYear.revenu).toBeGreaterThan(equal.newTaxCurrentYear.revenu);

        // Garde-fou (audit) : si l'attribution NE somme PAS au total (retrait non attribué en amont),
        // on retombe sur le split égal CONSERVATEUR (20 000 $) au lieu de taxer 60k sous-compté (→14 500,
        // sous-imposition). Σ([60000,0])=60000 ≠ accRetraitsReerYear=100000 → repli.
        const undercounted = processDecemberTaxFiling(DECEMBER, baseCtx(coupleRetired([60000, 0])), progressive, ZERO_TAX);
        expect(undercounted.newTaxCurrentYear.revenu).toBeCloseTo(20000, 5);
    });

    it('Phase 3 — fractionnement 65+ : à 72 ans, retraits RIF concentrés → transfert ≤50 % baisse l\'impôt', () => {
        const progressive = makeHelpers({
            calculateFiscalReport: ((gross: number) =>
                ({ totalTax: gross <= 50000 ? gross * 0.2 : 10000 + (gross - 50000) * 0.45 } as unknown as FiscalReport)
            ) as DecemberHelpers['calculateFiscalReport'],
        });
        const ctx = (age: number): Partial<DecemberContext> => ({
            isRetired: true, activeUsersCount: 2, incomeRetirementMonthly: 0,
            incomeRetirementPerUserMonthly: [0, 0], incomeRetirementDbPerUserMonthly: [0, 0],
            age, ageSpouse: age, accRetraitsReerYear: 100000, accRetraitsReerYearByUser: [100000, 0],
        });
        // À 72 ans, 100k de retraits sont du revenu FERR/RIF ADMISSIBLE concentré sur un conjoint.
        // L'optimiseur transfère ≤ 50 % (50k) → [50k, 50k] → impôt 20 000 (vs 32 500 sans fractionnement).
        const at72 = processDecemberTaxFiling(DECEMBER, baseCtx(ctx(72)), progressive, ZERO_TAX);
        expect(at72.newTaxCurrentYear.revenu).toBeCloseTo(20000, 5);
        // Contre-preuve : à 70 ans, les retraits REER ne sont PAS encore RIF (conversion FERR à 72) →
        // rien d'admissible → aucun fractionnement → reste 32 500 (Phase 2).
        const at70 = processDecemberTaxFiling(DECEMBER, baseCtx(ctx(70)), progressive, ZERO_TAX);
        expect(at70.newTaxCurrentYear.revenu).toBeCloseTo(32500, 5);
        expect(at72.newTaxCurrentYear.revenu).toBeLessThan(at70.newTaxCurrentYear.revenu);
    });

    it('MÉCANISME de réconciliation : crédite la retenue déjà captée dans .reer (pas de double-comptage)', () => {
        // pension 60000 + retraits REER 40000 = assiette 100000. Stub 25 % → vrai impôt 25000.
        // La retenue à la source déjà prélevée pendant l'année (.reer = 8000) est CRÉDITÉE :
        //   complément .revenu = 25000 − 8000 = 17000.
        // Total impôt retraité de l'année = .reer (8000, payé en avril) + complément (17000)
        //                                  = 25000 = vrai impôt → AUCUN double-comptage.
        const reerWithheld = 8000;
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ isRetired: true, incomeRetirementMonthly: 5000, accRetraitsReerYear: 40000 }),
            makeHelpers(),
            { ...ZERO_TAX, reer: reerWithheld },
        );
        expect(r.newTaxCurrentYear.revenu).toBeCloseTo(17000, 5);
        // Le bucket .reer n'est PAS modifié par la régularisation revenu (il sera payé tel quel).
        expect(r.newTaxCurrentYear.reer).toBeCloseTo(reerWithheld, 5);
        // Invariant clé : .reer + complément.revenu == vrai impôt annuel (25000).
        expect(r.newTaxCurrentYear.reer + r.newTaxCurrentYear.revenu).toBeCloseTo(25000, 5);
    });

    it('retenue REER supérieure à l\'impôt réel → complément négatif (remboursement en avril)', () => {
        // pension 60000 → vrai impôt 15000 (stub 25 %). Retenue déjà captée 18000 (> impôt).
        // complément = 15000 − 18000 = -3000 → remboursé en avril. Total = 18000 − 3000 = 15000.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ isRetired: true, incomeRetirementMonthly: 5000 }),
            makeHelpers(),
            { ...ZERO_TAX, reer: 18000 },
        );
        expect(r.newTaxCurrentYear.revenu).toBeCloseTo(-3000, 5);
        expect(r.newTaxCurrentYear.reer + r.newTaxCurrentYear.revenu).toBeCloseTo(15000, 5);
    });

    it('aucun ajustement si l\'assiette imposable est nulle', () => {
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ isRetired: true, incomeRetirementMonthly: 0, accRentesYear: 0, accRetraitsReerYear: 0 }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.revenu).toBe(0);
    });

    it('VRAI barème : retraité avec pension 60 000$ paie ~le vrai impôt (milliers de $), PAS 750$', () => {
        // Régression money-critical : au vrai barème QC+fed (crédits d'âge/pension 70 ans,
        // célibataire), l'impôt sur 60 000$ de pension est de l'ordre de ~9 000-10 000$,
        // PAS ~750$ (l'ancien 5 % du stub). On vérifie l'ordre de grandeur réel.
        const realHelpers: DecemberHelpers = { calculateFiscalReport, getMarginalRate, calculateDividendTax };
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ isRetired: true, incomeRetirementMonthly: 5000, age: 70, activeUsersCount: 1, ramqExempt: true }),
            realHelpers,
            ZERO_TAX,
        );
        // Vrai impôt attendu ≈ 9 772$ (cf utils/tax). Bornes larges mais excluant l'ancien bug.
        expect(r.newTaxCurrentYear.revenu).toBeGreaterThan(5000);
        expect(r.newTaxCurrentYear.revenu).toBeLessThan(13000);
        // Et surtout : loin au-dessus de l'ancien ~750$ (preuve que le bug est corrigé).
        expect(r.newTaxCurrentYear.revenu).toBeGreaterThan(2000);
    });

    it('actif vs retraité : même brut/pension → régularisations DIFFÉRENTES', () => {
        const actif = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ isRetired: false, grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        ).newTaxCurrentYear.revenu;
        const retraite = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ isRetired: true, incomeRetirementMonthly: 5000 }),
            makeHelpers(),
            ZERO_TAX,
        ).newTaxCurrentYear.revenu;
        expect(actif).not.toBeCloseTo(retraite, 1);
    });
});

describe('processDecemberTaxFiling — gains en capital (palier 250k)', () => {
    it('aucun gain → bloc gains nul', () => {
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ accCapitalGainsYear: 0, grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        );
        // revenu peut être non nul (salarial), mais gains doit rester 0.
        expect(r.newTaxCurrentYear.gains).toBe(0);
    });

    it('gain positif → impôt sur gains = gain × 50% × impôt incrémental (stub linéaire)', () => {
        // accCapitalGainsYear=100000 → taxable 50000. Stub calculateFiscalReport linéaire
        // (STUB_RATE=25%) → incrément = 50000 × 0.25 = 12500. (B-AUDIT-2 : gains désormais
        // imposés par impôt incrémental empilé, pas par un taux marginal plat.)
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ accCapitalGainsYear: 100000, grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.gains).toBeCloseTo(100000 * CAPITAL_GAINS_INCLUSION_STANDARD * STUB_RATE, 5);
        expect(r.logs.some((l) => l.includes('Gains Cap'))).toBe(true);
    });

    it('CARACTÉRISATION : gain > 250k garde le MÊME taux d\'inclusion 50% (pas de palier supérieur)', () => {
        // Inclusion uniforme 50% (annulation du 66.67% mars 2025). Stub linéaire 25% :
        // 300 000 × 0.50 × 0.25 = 37 500. (L'empilement progressif réel est testé à part
        // avec le vrai barème ; ici le stub est linéaire pour figer un montant exact.)
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ accCapitalGainsYear: 300000, grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.gains).toBeCloseTo(300000 * 0.50 * STUB_RATE, 5);
    });

    it('linéaire : double le gain → double l\'impôt sur gains (inclusion plate)', () => {
        const g1 = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ accCapitalGainsYear: 100000, grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        ).newTaxCurrentYear.gains;
        const g2 = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ accCapitalGainsYear: 200000, grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        ).newTaxCurrentYear.gains;
        expect(g2).toBeCloseTo(2 * g1, 5);
    });
});

describe('processDecemberTaxFiling — gains en capital EMPILÉS sur le barème réel (B-AUDIT-2)', () => {
    // Avec le VRAI barème progressif : un gros gain qui franchit des paliers doit être
    // imposé PLUS que (gain imposable × taux marginal du revenu de base). L'ancien calcul
    // (taux marginal plat sur le revenu AVANT gain) sous-estimait cet impôt.
    const realHelpers: DecemberHelpers = { calculateFiscalReport, getMarginalRate, calculateDividendTax };

    it('gros gain franchissant des paliers → impôt > gain × taux marginal de base (empilement)', () => {
        const baseIncome = 50000;   // revenu modeste
        const accGains = 400000;    // taxable 200k empilé sur 50k → franchit plusieurs paliers
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ accCapitalGainsYear: accGains, grossMarcBaseAnnual: baseIncome, optimizeSourceDeductions: false }),
            realHelpers,
            ZERO_TAX,
        );
        const taxableGains = accGains * CAPITAL_GAINS_INCLUSION_STANDARD;
        const flatNaive = taxableGains * getMarginalRate(baseIncome, 2026); // ancien calcul plat
        expect(r.newTaxCurrentYear.gains).toBeGreaterThan(flatNaive);
    });

    it('cohérence : petit gain dans le même palier → ≈ gain × taux marginal (pas de sur-imposition)', () => {
        const baseIncome = 60000;
        const accGains = 4000; // taxable 2000, reste dans le même palier
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ accCapitalGainsYear: accGains, grossMarcBaseAnnual: baseIncome, optimizeSourceDeductions: false }),
            realHelpers,
            ZERO_TAX,
        );
        const taxableGains = accGains * CAPITAL_GAINS_INCLUSION_STANDARD;
        const flat = taxableGains * getMarginalRate(baseIncome, 2026);
        expect(r.newTaxCurrentYear.gains).toBeCloseTo(flat, 0); // même palier → empilé ≈ plat
    });
});

describe('processDecemberTaxFiling — crédits d\'âge PAR conjoint (B-AUDIT-3)', () => {
    // Le stub calculateFiscalReport ignore les ageOpts → on utilise le VRAI barème,
    // seul à appliquer les crédits d'âge/pension. Avant le fix, ctx.age (Marc) servait
    // aux DEUX conjoints ; après, chacun selon SON âge (ctx.age / ctx.ageSpouse).
    const realHelpers: DecemberHelpers = { calculateFiscalReport, getMarginalRate, calculateDividendTax };

    it('couple retraité à âges décalés : le conjoint <65 ne reçoit PAS le crédit d\'âge → impôt plus élevé', () => {
        const retiredCtx = (ageSpouse: number) => baseCtx({
            isRetired: true, age: 70, ageSpouse, activeUsersCount: 2,
            incomeRetirementMonthly: 5000, // basePensionAnnual 60000 → per-adulte 30000 (crédit d'âge plein)
        });
        const equal = processDecemberTaxFiling(DECEMBER, retiredCtx(70), realHelpers, ZERO_TAX);
        const gap = processDecemberTaxFiling(DECEMBER, retiredCtx(60), realHelpers, ZERO_TAX);
        // 70/70 → les deux ont le crédit ; 70/60 → le conjoint de 60 ans ne l'a pas → impôt couple supérieur.
        expect(gap.newTaxCurrentYear.revenu).toBeGreaterThan(equal.newTaxCurrentYear.revenu);
    });

    it('actif 65+ avec conjoint <65 : seul le 65+ reçoit le crédit d\'âge', () => {
        const mk = (ageSpouse: number) => baseCtx({
            isRetired: false, age: 67, ageSpouse, activeUsersCount: 2,
            grossMarcBaseAnnual: 40000, grossAnnaBaseAnnual: 40000, optimizeSourceDeductions: true,
        });
        const gap = processDecemberTaxFiling(DECEMBER, mk(60), realHelpers, ZERO_TAX);
        const both = processDecemberTaxFiling(DECEMBER, mk(67), realHelpers, ZERO_TAX);
        expect(gap.newTaxCurrentYear.revenu).toBeGreaterThan(both.newTaxCurrentYear.revenu);
    });
});

describe('processDecemberTaxFiling — impôt de retraite PAR conjoint (A1)', () => {
    // Avec le VRAI barème (progressif + crédits), taxer chaque conjoint sur SON revenu
    // de retraite réel doit donner un impôt ≥ celui du split égal (qui minimise sous un
    // barème progressif). Un couple à revenus de retraite ÉGAUX ne doit PAS bouger.
    const realHelpers: DecemberHelpers = { calculateFiscalReport, getMarginalRate, calculateDividendTax };

    // 6000$/mois de pension ménage = 72 000$/an ; + 60 000$ de retraits REER → assiette
    // 132 000$. Assez haut pour qu'un split inégal franchisse des paliers.
    const coupleCtx = (perUser: number[] | undefined) => baseCtx({
        isRetired: true, age: 67, ageSpouse: 67, activeUsersCount: 2,
        incomeRetirementMonthly: 6000,
        incomeRetirementPerUserMonthly: perUser,
        accRetraitsReerYear: 60000,
    });

    it('pension ÉGALE par conjoint → identique au split égal historique (zéro régression)', () => {
        const equalSplit = processDecemberTaxFiling(DECEMBER, coupleCtx(undefined), realHelpers, ZERO_TAX);
        const perUserEqual = processDecemberTaxFiling(DECEMBER, coupleCtx([3000, 3000]), realHelpers, ZERO_TAX);
        expect(perUserEqual.newTaxCurrentYear.revenu).toBeCloseTo(equalSplit.newTaxCurrentYear.revenu, 4);
    });

    it('pension INÉGALE par conjoint → impôt ≥ split égal (barème progressif)', () => {
        const equalSplit = processDecemberTaxFiling(DECEMBER, coupleCtx(undefined), realHelpers, ZERO_TAX);
        // Même total ménage (6000), mais 4500/1500 → le conjoint aisé franchit un palier.
        const perUserUnequal = processDecemberTaxFiling(DECEMBER, coupleCtx([4500, 1500]), realHelpers, ZERO_TAX);
        expect(perUserUnequal.newTaxCurrentYear.revenu).toBeGreaterThan(equalSplit.newTaxCurrentYear.revenu);
    });

    it('breakdown incohérent (mauvaise longueur) → repli sur le split égal', () => {
        const equalSplit = processDecemberTaxFiling(DECEMBER, coupleCtx(undefined), realHelpers, ZERO_TAX);
        const badLen = processDecemberTaxFiling(DECEMBER, coupleCtx([6000]), realHelpers, ZERO_TAX);
        expect(badLen.newTaxCurrentYear.revenu).toBeCloseTo(equalSplit.newTaxCurrentYear.revenu, 4);
    });

    it('solo (activeUsersCount=1) → le breakdown par conjoint est ignoré (split inchangé)', () => {
        const solo = baseCtx({
            isRetired: true, age: 67, activeUsersCount: 1,
            incomeRetirementMonthly: 4000, incomeRetirementPerUserMonthly: [4000],
        });
        const soloNoBreakdown = baseCtx({
            isRetired: true, age: 67, activeUsersCount: 1, incomeRetirementMonthly: 4000,
        });
        const a = processDecemberTaxFiling(DECEMBER, solo, realHelpers, ZERO_TAX);
        const b = processDecemberTaxFiling(DECEMBER, soloNoBreakdown, realHelpers, ZERO_TAX);
        expect(a.newTaxCurrentYear.revenu).toBeCloseTo(b.newTaxCurrentYear.revenu, 6);
    });
});

describe('processDecemberTaxFiling — FA-1 (audit 2026-06-09) : assiette du crédit pension (féd 31400 + QC 361)', () => {
    // Assiette ADMISSIBLE corrigée = rente DB dès 65 ans + retraits FERR dès 72 ans.
    // EXCLUS : RRQ/PSV (incomeRetirement[PerUser]Monthly hors part DB) et les revenus
    // LOCATIFS (accRentesYear = loyers). Avant FA-1, l'assiette = pension TOTALE + loyers
    // → crédit indu ~250-680 $/an/personne 65+ (retraité sous-imposé).

    // ── MÉCANISME : stub-ESPION qui capture les ageOpts transmis au barème ──
    // (baseCtx neutre : nonReg=0 et accCapitalGainsYear=0 → seuls les appels du bloc
    // retraite portent un ageOpts ; RAMQ/FSS n'appellent pas les helpers injectés.)
    const spy = () => {
        const calls: Array<{ gross: number; ageOpts?: AgeCreditOptions }> = [];
        const helpers = makeHelpers({
            calculateFiscalReport: ((gross: number, _d: number, _w: number, _y: number, _mc?: boolean, ageOpts?: AgeCreditOptions) => {
                calls.push({ gross, ageOpts });
                return { totalTax: Math.max(0, gross) * STUB_RATE } as unknown as FiscalReport;
            }) as DecemberHelpers['calculateFiscalReport'],
        });
        return { helpers, calls };
    };

    it('MÉCANISME — retraité 65+ avec UNIQUEMENT RRQ/PSV + loyers → eligiblePensionIncome = 0', () => {
        const { helpers, calls } = spy();
        processDecemberTaxFiling(DECEMBER, baseCtx({
            isRetired: true, age: 70, activeUsersCount: 1,
            incomeRetirementMonthly: 5000, // RRQ+PSV (aucune part DB déclarée)
            accRentesYear: 12000,          // loyers — JAMAIS admissibles au crédit pension
        }), helpers, ZERO_TAX);
        const pensionCalls = calls.filter(c => c.ageOpts !== undefined);
        expect(pensionCalls).toHaveLength(1);
        // L'assiette IMPOSABLE garde tout (60 000 + 12 000)…
        expect(pensionCalls[0].gross).toBeCloseTo(72000, 5);
        // …mais RIEN n'est admissible au crédit pension (avant FA-1 : 72 000 transmis).
        expect(pensionCalls[0].ageOpts!.eligiblePensionIncome).toBe(0);
    });

    it('MÉCANISME — rente DB 65+ → assiette = DB×12 SEULEMENT (ni RRQ/PSV ni loyers)', () => {
        const { helpers, calls } = spy();
        processDecemberTaxFiling(DECEMBER, baseCtx({
            isRetired: true, age: 70, activeUsersCount: 1,
            incomeRetirementMonthly: 5000, incomeRetirementDbPerUserMonthly: [1000],
            accRentesYear: 12000,
        }), helpers, ZERO_TAX);
        const pensionCalls = calls.filter(c => c.ageOpts !== undefined);
        expect(pensionCalls[0].ageOpts!.eligiblePensionIncome).toBeCloseTo(12000, 5); // 1000×12, PAS 72 000
    });

    it('FRONTIÈRE 65 ans pour la rente DB : 64 → 0 ; 65 → DB×12', () => {
        const run = (age: number): number => {
            const { helpers, calls } = spy();
            processDecemberTaxFiling(DECEMBER, baseCtx({
                isRetired: true, age, activeUsersCount: 1,
                incomeRetirementMonthly: 5000, incomeRetirementDbPerUserMonthly: [1000],
            }), helpers, ZERO_TAX);
            return calls.find(c => c.ageOpts !== undefined)!.ageOpts!.eligiblePensionIncome!;
        };
        expect(run(64)).toBe(0);
        expect(run(65)).toBeCloseTo(12000, 5);
    });

    it('FRONTIÈRE 72 ans pour les retraits REER/FERR : 70 → 0 ; 71 → 0 ; 72 → inclus', () => {
        const run = (age: number): number => {
            const { helpers, calls } = spy();
            processDecemberTaxFiling(DECEMBER, baseCtx({
                isRetired: true, age, activeUsersCount: 1,
                incomeRetirementMonthly: 0, accRetraitsReerYear: 40000,
            }), helpers, ZERO_TAX);
            return calls.find(c => c.ageOpts !== undefined)!.ageOpts!.eligiblePensionIncome!;
        };
        expect(run(70)).toBe(0);               // retraits REER à 70 ans : PAS admissibles
        expect(run(71)).toBe(0);               // 71 : toujours pas (conversion FERR modélisée à 72)
        expect(run(72)).toBeCloseTo(40000, 5); // 72+ : retraits FERR admissibles
    });

    it('MÉCANISME — couple per-user : assiette PAR conjoint (seul celui avec DB en a une), loyers exclus', () => {
        const { helpers, calls } = spy();
        processDecemberTaxFiling(DECEMBER, baseCtx({
            isRetired: true, age: 70, ageSpouse: 70, activeUsersCount: 2,
            incomeRetirementMonthly: 5000, incomeRetirementPerUserMonthly: [3000, 2000],
            incomeRetirementDbPerUserMonthly: [1000, 0],
            accRentesYear: 12000, // loyers : dans l'imposable (split égal), PAS dans le crédit
        }), helpers, ZERO_TAX);
        const pensionCalls = calls.filter(c => c.ageOpts !== undefined);
        // 2 premiers appels = combinedTaxFor de BASE (sans fractionnement), ordre [user0, user1].
        // Assiette du crédit = DB seule (12000 pour user0, 0 pour user1), loyers exclus.
        expect(pensionCalls[0].gross).toBeCloseTo(3000 * 12 + 6000, 5);
        expect(pensionCalls[0].ageOpts!.eligiblePensionIncome).toBeCloseTo(12000, 5);
        expect(pensionCalls[1].gross).toBeCloseTo(2000 * 12 + 6000, 5);
        expect(pensionCalls[1].ageOpts!.eligiblePensionIncome).toBe(0);
        // [PV-3] La grille de fractionnement (Phase 3) déplace l'assiette du crédit AVEC la pension
        // transférée : chaque candidat = {12000 − tr (user0), tr (user1)}. Invariants :
        //  - chaque assiette ∈ [0, 12000] (jamais négative ni au-delà du splittable total) ;
        //  - le récipiendaire (user1) gagne une assiette > 0 dans la grille (preuve PV-3 actif) —
        //    l'ancien code la gardait figée à 0 pour lui.
        for (const c of pensionCalls) {
            const e = c.ageOpts!.eligiblePensionIncome;
            expect(e).toBeGreaterThanOrEqual(0);
            expect(e).toBeLessThanOrEqual(12000 + 1e-6);
        }
        // Sous l'ANCIEN code, toute assiette valait EXACTEMENT 0 ou 12000 (figée). Sous PV-3, la
        // grille produit des valeurs INTERMÉDIAIRES (12000−tr et tr) → preuve que l'assiette suit
        // la pension fractionnée vers le récipiendaire.
        const hasIntermediateBase = pensionCalls.some(c => {
            const e = c.ageOpts!.eligiblePensionIncome ?? 0;
            return e > 1 && e < 12000 - 1;
        });
        expect(hasIntermediateBase, 'la grille PV-3 doit produire des assiettes intermédiaires (crédit qui suit le split)').toBe(true);
    });

    it('GARDE — rente DB négative → clampée à 0 (jamais d\'assiette négative)', () => {
        const { helpers, calls } = spy();
        processDecemberTaxFiling(DECEMBER, baseCtx({
            isRetired: true, age: 70, activeUsersCount: 1,
            incomeRetirementMonthly: 5000, incomeRetirementDbPerUserMonthly: [-500],
        }), helpers, ZERO_TAX);
        expect(calls.find(c => c.ageOpts !== undefined)!.ageOpts!.eligiblePensionIncome).toBe(0);
    });

    // ── EFFET au VRAI barème (le stub ignore les ageOpts → seul le vrai barème applique le crédit) ──
    const realHelpers: DecemberHelpers = { calculateFiscalReport, getMarginalRate, calculateDividendTax };

    it('RÉGRESSION clé — 65+ RRQ/PSV + loyers SEULEMENT : paie PLUS qu\'avec l\'ancienne assiette (zéro crédit)', () => {
        const r = processDecemberTaxFiling(DECEMBER, baseCtx({
            isRetired: true, age: 70, activeUsersCount: 1,
            incomeRetirementMonthly: 5000, accRentesYear: 12000,
        }), realHelpers, ZERO_TAX);
        const taxable = 5000 * 12 + 12000; // 72 000 (imposable inchangé)
        const mkOpts = (eligible: number): AgeCreditOptions =>
            ({ age: 70, eligiblePensionIncome: eligible, hasSpouse: false, familyIncome: taxable });
        const expectedNoCredit = calculateFiscalReport(taxable, 0, 0, 2026, false, mkOpts(0)).totalTax;
        // Ancienne assiette (pré-FA-1) = pension RRQ/PSV + loyers au complet.
        const oldWithCredit = calculateFiscalReport(taxable, 0, 0, 2026, false, mkOpts(taxable)).totalTax;
        expect(r.newTaxCurrentYear.revenu).toBeCloseTo(expectedNoCredit, 4);
        // Le crédit indu (~250 $ féd au minimum) a disparu → impôt STRICTEMENT plus élevé.
        expect(r.newTaxCurrentYear.revenu).toBeGreaterThan(oldWithCredit + 100);
    });

    it('EFFET réel — la rente DB ouvre le crédit : impôt plus bas qu\'à zéro DB, à imposable IDENTIQUE', () => {
        const mk = (db: number[] | undefined) => baseCtx({
            isRetired: true, age: 70, activeUsersCount: 1,
            incomeRetirementMonthly: 5000, accRentesYear: 12000,
            incomeRetirementDbPerUserMonthly: db,
        });
        const noDb = processDecemberTaxFiling(DECEMBER, mk(undefined), realHelpers, ZERO_TAX);
        const withDb = processDecemberTaxFiling(DECEMBER, mk([1000]), realHelpers, ZERO_TAX);
        expect(withDb.newTaxCurrentYear.revenu).toBeLessThan(noDb.newTaxCurrentYear.revenu);
        const taxable = 72000;
        const expected = calculateFiscalReport(taxable, 0, 0, 2026, false,
            { age: 70, eligiblePensionIncome: 12000, hasSpouse: false, familyIncome: taxable }).totalTax;
        expect(withDb.newTaxCurrentYear.revenu).toBeCloseTo(expected, 4);
    });

    it('EFFET réel — retraits FERR : 71 ans = même impôt qu\'à 70 (zéro crédit) ; 72 ans → crédit → impôt baisse', () => {
        const mk = (age: number) => baseCtx({
            isRetired: true, age, activeUsersCount: 1,
            incomeRetirementMonthly: 0, accRetraitsReerYear: 40000,
        });
        const at70 = processDecemberTaxFiling(DECEMBER, mk(70), realHelpers, ZERO_TAX).newTaxCurrentYear.revenu;
        const at71 = processDecemberTaxFiling(DECEMBER, mk(71), realHelpers, ZERO_TAX).newTaxCurrentYear.revenu;
        const at72 = processDecemberTaxFiling(DECEMBER, mk(72), realHelpers, ZERO_TAX).newTaxCurrentYear.revenu;
        expect(at71).toBeCloseTo(at70, 6); // 70→71 : aucun crédit pension dans les deux cas
        expect(at72).toBeLessThan(at71);   // 72+ : retraits devenus FERR → crédit appliqué
    });

    it('GARDE NaN — DB [NaN] : pas de crash, traité comme zéro crédit (vrai barème)', () => {
        const mk = (db: number[] | undefined) => baseCtx({
            isRetired: true, age: 70, activeUsersCount: 1,
            incomeRetirementMonthly: 5000, incomeRetirementDbPerUserMonthly: db,
        });
        const nan = processDecemberTaxFiling(DECEMBER, mk([NaN]), realHelpers, ZERO_TAX);
        const zero = processDecemberTaxFiling(DECEMBER, mk(undefined), realHelpers, ZERO_TAX);
        expect(Number.isFinite(nan.newTaxCurrentYear.revenu)).toBe(true);
        expect(nan.newTaxCurrentYear.revenu).toBeCloseTo(zero.newTaxCurrentYear.revenu, 4);
    });

    // [PV-3] Le crédit pension SUIT la pension fractionnée vers le récipiendaire (ARC 31400 /
    // RQ Annexe Q) : un couple où seul un conjoint a une pension DB obtient un SECOND crédit
    // pension après fractionnement → impôt strictement plus bas que l'assiette de crédit gelée.
    it('PV-3 — fractionnement : le récipiendaire gagne le crédit pension → impôt < assiette gelée', () => {
        // H = user0 : pension DB 72 000 $/an (seule pension admissible) ; L = user1 : 0 revenu.
        // 72 k$ → après fractionnement ~36 k$/conjoint : assez d'impôt pour que le crédit pension
        // du récipiendaire (≈ 700 $) soit mesurable (à 36 k$ total, l'impôt serait nul → indétectable).
        const ctx = baseCtx({
            isRetired: true, age: 70, ageSpouse: 70, activeUsersCount: 2,
            incomeRetirementMonthly: 6000,                 // total ménage = 72 000 $/an
            incomeRetirementPerUserMonthly: [6000, 0],     // tout sur H
            incomeRetirementDbPerUserMonthly: [6000, 0],   // 72 000 $ DB admissibles (H), 0 (L)
        });
        const r = processDecemberTaxFiling(DECEMBER, ctx, realHelpers, ZERO_TAX);

        // Reproduction de l'optimiseur AVEC l'assiette de crédit GELÉE (ancien comportement) :
        // même grille de transfert, mais le récipiendaire ne reçoit JAMAIS de crédit.
        const taxable = [72000, 0];
        const eligibleFrozen = [72000, 0];
        const mkOpts = (_taxable: number, eligible: number): AgeCreditOptions =>
            ({ age: 70, eligiblePensionIncome: eligible, hasSpouse: true, familyIncome: 72000 });
        const combined = (tx: number[], el: number[]): number =>
            calculateFiscalReport(tx[0], 0, 0, 2026, false, mkOpts(tx[0], el[0])).totalTax
            + calculateFiscalReport(tx[1], 0, 0, 2026, false, mkOpts(tx[1], el[1])).totalTax;
        const maxTransfer = Math.min(0.5 * 72000, 72000); // 36 000
        let frozenBest = combined(taxable, eligibleFrozen); // sans split
        for (let k = 1; k <= 40; k++) {
            const tr = maxTransfer * (k / 40);
            const cand = [taxable[0] - tr, taxable[1] + tr];
            const ct = combined(cand, eligibleFrozen); // assiette GELÉE {36000, 0}
            if (ct < frozenBest) frozenBest = ct;
        }
        const expectedFrozen = frozenBest * 1; // inflationFactor = 1 en 2026

        // PV-3 : l'impôt réel est STRICTEMENT plus bas (le récipiendaire a obtenu son crédit).
        expect(r.newTaxCurrentYear.revenu).toBeLessThan(expectedFrozen - 50);
        // …et reste cohérent (positif, fini).
        expect(Number.isFinite(r.newTaxCurrentYear.revenu)).toBe(true);
        expect(r.newTaxCurrentYear.revenu).toBeGreaterThan(0);
    });
});

describe('processDecemberTaxFiling — dividendes Non-Reg', () => {
    it('Non-Reg nul → aucun impôt de dividende', () => {
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ nonReg: 0, baseNonRegRate: 5, grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.gains).toBe(0);
    });

    it('Non-Reg positif → dividende imposé PINNÉ (div = solde × taux% × 30%, taxé au marginal)', () => {
        // nonReg=200000, rate=5% → annualDiv = 200000×0.05×0.30 = 3000 ; tax = 3000×0.40 = 1200.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ nonReg: 200000, baseNonRegRate: 5, grossMarcBaseAnnual: 60000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.gains).toBeCloseTo(1200, 5);
    });

    it('gains capitaux ET dividendes s\'additionnent dans le bucket gains', () => {
        // gains cap : 100000×0.5×0.25 = 12500 (incrémental, stub linéaire) ;
        // dividendes : 3000 × marginal 0.40 = 1200 → total 13700.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({
                accCapitalGainsYear: 100000,
                nonReg: 200000,
                baseNonRegRate: 5,
                grossMarcBaseAnnual: 60000,
                optimizeSourceDeductions: false,
            }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.gains).toBeCloseTo(100000 * CAPITAL_GAINS_INCLUSION_STANDARD * STUB_RATE + 1200, 5);
    });
});

describe('processDecemberTaxFiling — dividendes Non-Reg EMPILÉS sur le barème réel (ITEM 2d)', () => {
    // Avec le VRAI barème + le helper gross-up, le dividende majoré s'empile
    // progressivement sur le revenu. Un gros dividende sur un revenu modeste franchit
    // des paliers → impôt > le calcul PLAT (taux marginal au revenu de base), qui
    // sous-estimait (voire annulait via le crédit d'impôt dividende).
    const realHelpers: DecemberHelpers = { calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate };

    it('gros dividende sur revenu modeste → impôt > calcul plat (empilement)', () => {
        // nonReg=2 000 000, rate=5% → annualDiv = 30 000. Sur 50 000$ de revenu (solo),
        // le majoré (~41 400$) franchit des paliers.
        const ctxDiv = baseCtx({
            nonReg: 2_000_000, baseNonRegRate: 5, grossMarcBaseAnnual: 50000,
            optimizeSourceDeductions: false, activeUsersCount: 1,
        });
        const progressive = processDecemberTaxFiling(DECEMBER, ctxDiv, realHelpers, ZERO_TAX);
        // Calcul plat (ancien) : marginal au revenu de base, crédit dividende → souvent 0.
        const annualDiv = 2_000_000 * 0.05 * 0.30;
        const flat = calculateDividendTax(annualDiv, getMarginalRate(50000, 2026), 'eligible');
        expect(progressive.newTaxCurrentYear.gains).toBeGreaterThan(flat);
        expect(progressive.newTaxCurrentYear.gains).toBeGreaterThan(1000); // non nul, contrairement au plat
    });

    it('cohérence : petit dividende dans le même palier → empilé ≈ plat (zéro régression)', () => {
        // Revenu 80 000$ (palier stable), petit dividende → le majoré reste dans le palier.
        // nonReg=200 000, rate=5% → annualDiv=3 000 → majoré ~4 140$.
        const ctxDiv = baseCtx({
            nonReg: 200000, baseNonRegRate: 5, grossMarcBaseAnnual: 80000,
            optimizeSourceDeductions: false, activeUsersCount: 1,
        });
        const progressive = processDecemberTaxFiling(DECEMBER, ctxDiv, realHelpers, ZERO_TAX);
        // Plat avec le VRAI marginal au même revenu.
        const annualDiv = 200000 * 0.05 * 0.30;
        const flat = calculateDividendTax(annualDiv, getMarginalRate(80000, 2026), 'eligible');
        expect(progressive.newTaxCurrentYear.gains).toBeCloseTo(flat, 0);
    });
});

// ──────────────────────────────────────────────────────────────────────────
// FA-8 (2026-06-11) : l'assiette d'empilement des dividendes du RETRAITÉ
// inclut accRetraitsReerYear (alignée sur l'assiette des gains §2)
// ──────────────────────────────────────────────────────────────────────────
describe('processDecemberTaxFiling — FA-8 : assiette dividendes retraité inclut les retraits REER/FERR', () => {
    // Avant FA-8, la branche retraité du bloc dividendes omettait accRetraitsReerYear
    // (les gains §2 l'incluaient déjà) : taux d'entrée sous-évalué → impôt sur dividendes
    // SOUS-estimé pour un retraité vivant de retraits REER (meltdown) — non conservateur.

    it('MÉCANISME (stub spy) — assiette transmise au marginal = (pension − SRG)×12 + rentes + retraits REER', () => {
        // getMarginalRate n'est appelé QUE par le bloc dividendes → on capture son 1er argument.
        const incomes: number[] = [];
        const helpers = makeHelpers({
            getMarginalRate: (income: number) => { incomes.push(income); return STUB_MARGINAL; },
        });
        processDecemberTaxFiling(DECEMBER, baseCtx({
            isRetired: true, age: 70, activeUsersCount: 1,
            incomeRetirementMonthly: 3500, incomeRetirementGisMonthly: 500,
            accRentesYear: 12000, accRetraitsReerYear: 40000,
            nonReg: 200000, baseNonRegRate: 5,
        }), helpers, ZERO_TAX);
        expect(incomes).toHaveLength(1);
        // (3500 − 500)×12 + 12 000 + 40 000 = 88 000 — avant FA-8 : 48 000 (REER omis).
        expect(incomes[0]).toBeCloseTo(88000, 5);
    });

    it('EFFET réel PINNÉ — meltdown REER : impôt dividendes 6 351,66 $ (vs 1 750,96 $ sans retraits)', () => {
        // Retraité solo, pension 3 000 $/mois (36 000 $/an), nonReg 2 M$ à 5 % → dividende
        // admissible 30 000 $ (majoré 41 400 $, CID 11 062 $). Avec 60 000 $ de retraits
        // REER/FERR, l'empilement démarre à 96 000 $ (marginal 36,12 %) au lieu de 36 000 $
        // (25,69 %) → bande nettement plus chère. accCapitalGainsYear = 0 → `.gains` isole
        // l'impôt de dividendes. Avant FA-8, les DEUX cas donnaient 1 750,96 $.
        const realHelpers: DecemberHelpers = { calculateFiscalReport, getMarginalRate, calculateDividendTax, getDividendGrossUpRate };
        const mk = (reer: number) => baseCtx({
            isRetired: true, age: 70, activeUsersCount: 1,
            incomeRetirementMonthly: 3000, accRetraitsReerYear: reer,
            nonReg: 2_000_000, baseNonRegRate: 5,
        });
        const sansRetraits = processDecemberTaxFiling(DECEMBER, mk(0), realHelpers, ZERO_TAX);
        const avecRetraits = processDecemberTaxFiling(DECEMBER, mk(60000), realHelpers, ZERO_TAX);
        // Direction du fix : l'empilement démarre plus haut → impôt dividendes PLUS ÉLEVÉ.
        expect(avecRetraits.newTaxCurrentYear.gains).toBeGreaterThan(sansRetraits.newTaxCurrentYear.gains);
        // Valeurs PINNÉES (barème 2026 réel, inflationFactor 1) pour figer le comportement.
        expect(sansRetraits.newTaxCurrentYear.gains).toBeCloseTo(1750.96, 0);
        expect(avecRetraits.newTaxCurrentYear.gains).toBeCloseTo(6351.66, 0);
    });
});

describe('processDecemberTaxFiling — RAMQ (prime médicaments publique)', () => {
    it('ramqExempt = true → aucune prime RAMQ, aucun log RAMQ', () => {
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ ramqExempt: true, isRetired: true, incomeRetirementMonthly: 5000 }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.logs.some((l) => l.includes('RAMQ'))).toBe(false);
    });

    it('NON exempté avec revenu net > seuil → prime RAMQ positive dans divers + log', () => {
        // retraité, pension = 5000×12 = 60000 > exemption single (19 500) → prime > 0.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ ramqExempt: false, isRetired: true, incomeRetirementMonthly: 5000, activeUsersCount: 1 }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.divers).toBeGreaterThan(0);
        expect(r.logs.some((l) => l.includes('RAMQ'))).toBe(true);
    });

    it('NON exempté mais revenu net SOUS le seuil d\'exemption → prime RAMQ nulle', () => {
        // retraité, pension faible 1000×12 = 12000 < exemption single 19 500 → 0.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ ramqExempt: false, isRetired: true, incomeRetirementMonthly: 1000, activeUsersCount: 1 }),
            makeHelpers(),
            ZERO_TAX,
        );
        // divers ne doit contenir ni RAMQ ni FSS (12000 < FSS_THRESHOLD_ZERO 18 500 aussi — barème 2026, FA-8).
        expect(RAMQ_EXEMPTION_SINGLE_2026).toBeGreaterThan(12000); // garde la prémisse explicite
        expect(r.newTaxCurrentYear.divers).toBe(0);
        expect(r.logs.some((l) => l.includes('RAMQ'))).toBe(false);
    });

    it('actif : RAMQ calculée sur le revenu NET (déductions REER soustraites)', () => {
        // Sans déductions, le brut élevé donne une prime RAMQ. Avec de grosses déductions
        // ramenant le net sous le seuil, la prime tombe. Verrouille le FIX audit HIGH 1.
        const sansDeduc = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({
                ramqExempt: false, isRetired: false, grossMarcBaseAnnual: 30000,
                accRrspYear: 0, optimizeSourceDeductions: false,
            }),
            makeHelpers(),
            ZERO_TAX,
        );
        const avecDeduc = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({
                ramqExempt: false, isRetired: false, grossMarcBaseAnnual: 30000,
                accRrspYear: 25000, optimizeSourceDeductions: false, // net = 5000 < seuil
            }),
            makeHelpers(),
            ZERO_TAX,
        );
        const ramqSans = sansDeduc.logs.some((l) => l.includes('RAMQ'));
        const ramqAvec = avecDeduc.logs.some((l) => l.includes('RAMQ'));
        expect(ramqSans).toBe(true);
        expect(ramqAvec).toBe(false);
    });
});

describe('processDecemberTaxFiling — FSS (Fonds des services de santé)', () => {
    it('retraité au-dessus du seuil FSS → cotisation FSS dans divers + log', () => {
        // pension = 5000×12 = 60000 > FSS_THRESHOLD_FLAT (33 500 — barème 2026, FA-8) → palier 150$+.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ ramqExempt: true, isRetired: true, incomeRetirementMonthly: 5000, activeUsersCount: 1 }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.divers).toBeGreaterThan(0);
        expect(r.logs.some((l) => l.includes('FSS'))).toBe(true);
        expect(FSS_THRESHOLD_FLAT).toBeLessThan(60000); // prémisse explicite
    });

    it('actif → AUCUNE cotisation FSS (couvert par l\'employeur)', () => {
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ ramqExempt: true, isRetired: false, grossMarcBaseAnnual: 120000, optimizeSourceDeductions: false }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.logs.some((l) => l.includes('FSS'))).toBe(false);
    });

    it('retraité sous le seuil FSS zéro → aucune cotisation FSS', () => {
        // pension = 1000×12 = 12000 < FSS_THRESHOLD_ZERO 18 500 (barème 2026, FA-8) → 0.
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({ ramqExempt: true, isRetired: true, incomeRetirementMonthly: 1000, activeUsersCount: 1 }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(FSS_THRESHOLD_ZERO).toBeGreaterThan(12000); // prémisse explicite
        expect(r.logs.some((l) => l.includes('FSS'))).toBe(false);
    });
});

describe('processDecemberTaxFiling — intégration multi-blocs', () => {
    it('retraité complet (RAMQ + FSS + gains) : divers et gains tous deux > 0', () => {
        const r = processDecemberTaxFiling(
            DECEMBER,
            baseCtx({
                ramqExempt: false,
                isRetired: true,
                incomeRetirementMonthly: 5000,
                accCapitalGainsYear: 100000,
                activeUsersCount: 1,
            }),
            makeHelpers(),
            ZERO_TAX,
        );
        expect(r.newTaxCurrentYear.divers).toBeGreaterThan(0); // RAMQ + FSS
        expect(r.newTaxCurrentYear.gains).toBeGreaterThan(0);  // gains capitaux
        expect(r.logs.some((l) => l.includes('RAMQ'))).toBe(true);
        expect(r.logs.some((l) => l.includes('FSS'))).toBe(true);
        expect(r.logs.some((l) => l.includes('Gains Cap'))).toBe(true);
    });
});

// ──────────────────────────────────────────────────────────────────────────
// FA-3a (audit 2026-06-09) : le SRG est NON IMPOSABLE — exclu de toutes les assiettes
// ──────────────────────────────────────────────────────────────────────────
describe('processDecemberTaxFiling — FA-3a : SRG non imposable (exclu de l\'assiette)', () => {
    // Spy identique au bloc FA-1 : capture les (gross, ageOpts) transmis au barème.
    const spy = () => {
        const calls: Array<{ gross: number; ageOpts?: AgeCreditOptions }> = [];
        const helpers = makeHelpers({
            calculateFiscalReport: ((gross: number, _d: number, _w: number, _y: number, _mc?: boolean, ageOpts?: AgeCreditOptions) => {
                calls.push({ gross, ageOpts });
                return { totalTax: Math.max(0, gross) * STUB_RATE } as unknown as FiscalReport;
            }) as DecemberHelpers['calculateFiscalReport'],
        });
        return { helpers, calls };
    };

    it('RÉGRESSION CLÉ — le SRG est SOUSTRAIT de l\'assiette imposable (avant FA-3a : taxé en plein)', () => {
        // 5 000 $/mois de revenu retraite dont 1 000 $ de SRG → assiette = 4 000×12 = 48 000
        // (l'ancien code ignorait le champ → 60 000 transmis au barème).
        const { helpers, calls } = spy();
        processDecemberTaxFiling(DECEMBER, baseCtx({
            isRetired: true, age: 70, activeUsersCount: 1,
            incomeRetirementMonthly: 5000,
            incomeRetirementGisMonthly: 1000,
        }), helpers, ZERO_TAX);
        const pensionCalls = calls.filter(c => c.ageOpts !== undefined);
        expect(pensionCalls).toHaveLength(1);
        expect(pensionCalls[0].gross).toBeCloseTo(48000, 5);
    });

    it('équivalence : (income 5000, gis 1000) impose EXACTEMENT comme (income 4000, gis 0)', () => {
        const run = (income: number, gis: number) => {
            const tax = { ...ZERO_TAX };
            processDecemberTaxFiling(DECEMBER, baseCtx({
                isRetired: true, age: 70, activeUsersCount: 1,
                incomeRetirementMonthly: income,
                incomeRetirementGisMonthly: gis,
            }), makeHelpers(), tax);
            return tax.revenu;
        };
        expect(run(5000, 1000)).toBeCloseTo(run(4000, 0), 5);
    });

    it('champ absent → comportement strictement inchangé (rétro-compat)', () => {
        const { helpers, calls } = spy();
        processDecemberTaxFiling(DECEMBER, baseCtx({
            isRetired: true, age: 70, activeUsersCount: 1,
            incomeRetirementMonthly: 5000,
        }), helpers, ZERO_TAX);
        const pensionCalls = calls.filter(c => c.ageOpts !== undefined);
        expect(pensionCalls[0].gross).toBeCloseTo(60000, 5);
    });

    it('couple per-user : la part de SRG (familiale, répartie également) sort du revenu de CHAQUE conjoint', () => {
        // perUser [3000, 2000] $/mois, SRG familial 1000 → parts 500/500 →
        // assiettes (3000−500)×12 = 30 000 et (2000−500)×12 = 18 000.
        const { helpers, calls } = spy();
        processDecemberTaxFiling(DECEMBER, baseCtx({
            isRetired: true, age: 70, ageSpouse: 70, activeUsersCount: 2,
            incomeRetirementMonthly: 5000,
            incomeRetirementGisMonthly: 1000,
            incomeRetirementPerUserMonthly: [3000, 2000],
        }), helpers, ZERO_TAX);
        const pensionCalls = calls.filter(c => c.ageOpts !== undefined);
        expect(pensionCalls).toHaveLength(2);
        const grosses = pensionCalls.map(c => Math.round(c.gross)).sort((a, b) => a - b);
        expect(grosses).toEqual([18000, 30000]);
    });

    it('clamp : SRG ≥ pension d\'un conjoint → assiette 0 pour lui, jamais négative', () => {
        const { helpers, calls } = spy();
        processDecemberTaxFiling(DECEMBER, baseCtx({
            isRetired: true, age: 70, ageSpouse: 70, activeUsersCount: 2,
            incomeRetirementMonthly: 2500,
            incomeRetirementGisMonthly: 2000, // parts 1000/1000
            incomeRetirementPerUserMonthly: [2000, 500], // user1 : 500 − 1000 < 0 → clamp 0
        }), helpers, ZERO_TAX);
        const pensionCalls = calls.filter(c => c.ageOpts !== undefined);
        const grosses = pensionCalls.map(c => Math.round(c.gross)).sort((a, b) => a - b);
        expect(grosses[0]).toBe(0);
        expect(grosses[1]).toBe(12000); // (2000−1000)×12 ; assiette ménage (2500−2000)×12 > 0 → gate passé
    });
});

// ──────────────────────────────────────────────────────────────────────────
// FA-10 — survivorMode : contrat du call-site (projection.ts). Le moteur passe
// activeUsersCount = 1 (taxFilers), ageSpouse = undefined, décompositions par
// conjoint = undefined, et la DB agrégée sur une tête. Ces tests verrouillent
// la sémantique sur laquelle ce câblage repose : taxer le revenu COMPLET du
// survivant sur UNE tête (barème progressif), sans crédits du défunt ni
// fractionnement fictif, RAMQ/FSS ×1.
// ──────────────────────────────────────────────────────────────────────────
describe('processDecemberTaxFiling — FA-10 : contrat survivorMode (1 contribuable)', () => {
    // VRAI barème (progressif) : le stub linéaire 25 % rendrait le split fiscal neutre
    // et ces tests tautologiques — la progressivité est précisément ce que FA-10 corrige.
    const realHelpers = makeHelpers({
        calculateFiscalReport: calculateFiscalReport as DecemberHelpers['calculateFiscalReport'],
    });
    // Revenu de retraite substantiel : 6 000 $/mois + 30 000 $ de retraits REER/an.
    const survivorCtx = (o: Partial<DecemberContext> = {}): DecemberContext => baseCtx({
        isRetired: true,
        age: 70,
        incomeRetirementMonthly: 6000,
        accRetraitsReerYear: 30000,
        // Ce que projection.ts passe en survivorMode :
        activeUsersCount: 1,
        ageSpouse: undefined,
        incomeRetirementPerUserMonthly: undefined,
        accRetraitsReerYearByUser: undefined,
        incomeRetirementDbPerUserMonthly: [1000], // DB du couple AGRÉGÉE sur le survivant
        ...o,
    });

    it('le revenu complet sur UNE tête est imposé PLUS que le split fictif sur 2 têtes', () => {
        const survivant = processDecemberTaxFiling(DECEMBER, survivorCtx(), realHelpers, ZERO_TAX);
        // L'ancien comportement (latent pré-FA-10) : même revenu réparti sur 2 contribuables.
        const splitATort = processDecemberTaxFiling(DECEMBER, survivorCtx({
            activeUsersCount: 2,
            ageSpouse: 70,
            incomeRetirementDbPerUserMonthly: [500, 500],
        }), realHelpers, ZERO_TAX);
        // Barème progressif : 1 × impôt(plein revenu) > 2 × impôt(demi-revenu).
        expect(survivant.newTaxCurrentYear.revenu).toBeGreaterThan(splitATort.newTaxCurrentYear.revenu * 1.05);
    });

    it('sans ageSpouse, AUCUN fractionnement de pension fictif avec le défunt', () => {
        // Avec un gros DB admissible, le fractionnement baisserait l'impôt si un conjoint
        // existait. En survivorMode (ageSpouse undefined), le garde n===2 le désactive :
        // l'impôt doit être EXACTEMENT celui du calcul sans fractionnement (même appel,
        // DB agrégée, 1 tête) — toute baisse signalerait un split avec un mort.
        const avecDb = processDecemberTaxFiling(DECEMBER, survivorCtx({
            incomeRetirementDbPerUserMonthly: [3000],
        }), realHelpers, ZERO_TAX);
        const sansDb = processDecemberTaxFiling(DECEMBER, survivorCtx({
            incomeRetirementDbPerUserMonthly: undefined,
        }), realHelpers, ZERO_TAX);
        // La DB sert le crédit pension (impôt avecDb ≤ sansDb) mais ne peut pas être
        // fractionnée : l'écart reste celui du crédit, pas d'un transfert de tranche.
        expect(avecDb.newTaxCurrentYear.revenu).toBeLessThanOrEqual(sansDb.newTaxCurrentYear.revenu);
        expect(avecDb.newTaxCurrentYear.revenu).toBeGreaterThan(sansDb.newTaxCurrentYear.revenu * 0.85);
    });

    it('RAMQ : prime ×1 (célibataire), pas ×2', () => {
        const un = processDecemberTaxFiling(DECEMBER, survivorCtx({ ramqExempt: false }), realHelpers, ZERO_TAX);
        const deux = processDecemberTaxFiling(DECEMBER, survivorCtx({
            ramqExempt: false, activeUsersCount: 2, ageSpouse: 70,
            incomeRetirementDbPerUserMonthly: [500, 500],
        }), realHelpers, ZERO_TAX);
        // divers contient RAMQ(+FSS) : 2 adultes paient plus de primes qu'un seul
        // (les primes par adulte diffèrent aussi via le revenu/seuil — on vérifie le sens).
        expect(deux.newTaxCurrentYear.divers).toBeGreaterThan(un.newTaxCurrentYear.divers);
    });

    it('branche ACTIVE : salaire du défunt à 0 → impôt du seul survivant', () => {
        // projection.ts passe grossAnnaBaseAnnual=0 en survivorMode : l'impôt actif de
        // décembre ne doit plus imposer le salaire fantôme du défunt.
        const survivantActif = processDecemberTaxFiling(DECEMBER, baseCtx({
            isRetired: false, age: 45,
            activeUsersCount: 1,
            grossMarcBaseAnnual: 100000,
            grossAnnaBaseAnnual: 0,
            optimizeSourceDeductions: false,
        }), realHelpers, ZERO_TAX);
        const fantome = processDecemberTaxFiling(DECEMBER, baseCtx({
            isRetired: false, age: 45, ageSpouse: 45,
            activeUsersCount: 2,
            grossMarcBaseAnnual: 100000,
            grossAnnaBaseAnnual: 80000,
            optimizeSourceDeductions: false,
        }), realHelpers, ZERO_TAX);
        // Le complément de décembre (impôt − retenue ~92 %) du ménage fantôme dépasse
        // celui du survivant seul (l'impôt d'Anna n'existe plus).
        expect(fantome.newTaxCurrentYear.revenu).toBeGreaterThan(survivantActif.newTaxCurrentYear.revenu);
    });
});
