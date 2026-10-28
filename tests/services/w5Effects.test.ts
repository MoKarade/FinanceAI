// tests/services/w5Effects.test.ts
// Couverture des effets W5 : assurances, véhicules, rénovations, dons charitables,
// immeubles locatifs, entreprises privées, et dépenses liées à l'âge.

import { describe, it, expect, vi } from 'vitest';
import { applyW5Effects, applyAgeBasedExpenses } from '../../services/projection/w5Effects';
import type { W5Context, W5Mutator, W5Containers } from '../../services/projection/w5Effects';
import { computeDonationCredit } from '../../utils/donationCredit';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeCtx = (overrides: Partial<W5Context> = {}): W5Context => ({
    m: 12,
    currentMonthIndex: 0,
    currentLoopDate: new Date('2027-01-01'),
    startYear: 2026,
    startMonth: 0,
    expenseMultiplier: 1.0,
    ...overrides,
});

const makeMutator = () => {
    const s = { expense: 0, income: 0, liquid: 0, taxRevenu: 0, taxGains: 0, taxDivers: 0, donCredit: 0 };
    const mutator: W5Mutator = {
        addExpense: (n) => { s.expense += n; },
        addIncome: (n) => { s.income += n; },
        subtractLiquid: (n) => { s.liquid -= n; },
        addTaxRevenu: (n) => { s.taxRevenu += n; },
        addTaxGains: (n) => { s.taxGains += n; },
        addTaxDivers: (n) => { s.taxDivers += n; },
        addDonationCredit: (n) => { s.donCredit += n; },
        logFlow: vi.fn(),
        logLife: vi.fn(),
    };
    return { mutator, s };
};

const emptyContainers = (): W5Containers => ({
    insurancePolicies: [],
    vehicleReplacements: [],
    majorRenovations: [],
    charitableGoals: [],
    rentalProperties: [],
    privateBusinesses: [],
});

// ── Assurances ────────────────────────────────────────────────────────────────

describe('applyW5Effects — assurances', () => {
    it('débite la prime mensuelle active', () => {
        // Arrange
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            insurancePolicies: [{ id: 'p1', kind: 'life-term' as const, monthlyPremium: 200 }],
        };

        // Act
        applyW5Effects(makeCtx(), containers, mutator);

        // Assert
        expect(s.expense).toBe(200);
    });

    it('n\'applique pas la prime si la police est expirée', () => {
        // Arrange — expiry dans le passé
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            insurancePolicies: [{
                id: 'p2', kind: 'life-term' as const, monthlyPremium: 150,
                expiryDate: '2020-01-01',
            }],
        };

        // Act
        applyW5Effects(makeCtx({ currentLoopDate: new Date('2027-06-01') }), containers, mutator);

        // Assert
        expect(s.expense).toBe(0);
    });

    it('continue d\'appliquer la prime si la police n\'est pas encore expirée', () => {
        // Arrange — expiry dans le futur
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            insurancePolicies: [{
                id: 'p3', kind: 'disability-lt' as const, monthlyPremium: 300,
                expiryDate: '2040-01-01',
            }],
        };

        // Act
        applyW5Effects(makeCtx({ currentLoopDate: new Date('2027-01-01') }), containers, mutator);

        // Assert
        expect(s.expense).toBe(300);
    });
});

// ── Véhicules cycliques ───────────────────────────────────────────────────────

describe('applyW5Effects — véhicules', () => {
    it('débite le coût véhicule quand le cycle est atteint (120 mois)', () => {
        // Arrange — exactement au mois 120 (10 ans)
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            vehicleReplacements: [{ id: 'v1', costEstimate: 40000, cyclYears: 10 }],
        };

        // Act
        applyW5Effects(makeCtx({ m: 120 }), containers, mutator);

        // Assert
        expect(s.liquid).toBe(-40000);
    });

    it('ne débite pas si le cycle n\'est pas atteint', () => {
        // Arrange — mois 60, cycle 10 ans (120 mois)
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            vehicleReplacements: [{ id: 'v1', costEstimate: 35000, cyclYears: 10 }],
        };

        // Act
        applyW5Effects(makeCtx({ m: 60 }), containers, mutator);

        // Assert
        expect(s.liquid).toBe(0);
    });
});

// ── Rénovations majeures ──────────────────────────────────────────────────────

describe('applyW5Effects — rénovations', () => {
    it('débite le coût de rénovation au mois correspondant', () => {
        // Arrange — rénovation en janvier 2027, simulation commence jan 2026
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            majorRenovations: [{ id: 'r1', description: 'Cuisine', cost: 25000, date: '2027-01-15' }],
        };

        // Act — mois 12 = jan 2027 (startYear=2026, startMonth=0)
        applyW5Effects(makeCtx({ m: 12 }), containers, mutator);

        // Assert
        expect(s.liquid).toBe(-25000);
    });

    it('n\'applique pas la rénovation si la date ne correspond pas', () => {
        // Arrange — rénovation planifiée pour 2030
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            majorRenovations: [{ id: 'r1', description: 'Toit', cost: 15000, date: '2030-06-01' }],
        };

        // Act — mois 12 = jan 2027
        applyW5Effects(makeCtx({ m: 12 }), containers, mutator);

        // Assert
        expect(s.liquid).toBe(0);
    });
});

// ── Dons charitables ──────────────────────────────────────────────────────────

describe('applyW5Effects — dons charitables', () => {
    it('[FA-6] crédit par paliers en janvier, accumulé dans donCredit (plafonné en décembre)', () => {
        // Arrange — janvier (currentMonthIndex=0), an 2027 (yearNow=2027)
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            charitableGoals: [{ id: 'c1', annualAmount: 12000 }],
        };

        // Act — mois 12, currentMonthIndex=0 (janvier)
        applyW5Effects(makeCtx({ m: 12, currentMonthIndex: 0 }), containers, mutator);

        // Assert — dépense mensuelle = 1000 ; crédit par PALIERS (féd ABATTU + QC) = 5754,42 $
        // [FISC-DON-ABATEMENT] féd (0,15·200 + 0,29·11800) × 0,835 = 2882,42 ; QC (0,20·200 +
        // 0,24·11800) = 2872 → 5754,42. La part fédérale ne vaut que 83,5 % au Québec : le moteur
        // déduit ce crédit d'un impôt DÉJÀ net d'abattement. Reste supérieur à l'ancien 33 % plat (3960).
        // Le crédit (POSITIF) va dans donCredit ; décembre le plafonne à l'impôt dû puis l'applique à divers.
        expect(s.expense).toBeCloseTo(1000, 2);
        expect(computeDonationCredit(12000)).toBeCloseTo(5754.42, 2);
        expect(s.donCredit).toBeCloseTo(5754.42, 2);    // crédit accumulé (positif)
        expect(s.donCredit).toBeGreaterThan(12000 * 0.33); // toujours mieux que l'ancien taux plat
        expect(s.taxDivers).toBe(0);                  // PAS encore dans divers (appliqué/plafonné en décembre)
        expect(s.taxRevenu).toBe(0);                  // jamais dans revenu (écrasé en décembre)
    });

    it('[FA-6] don de titres en nature : AUCUN effet sur les gains (inclusion 0 % non modélisée)', () => {
        // Arrange — le flag donateAppreciatedSecurities ne doit plus toucher taxGains
        // (l'ancien proxy -0,15·don, non sourcé, est supprimé).
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            charitableGoals: [{ id: 'c1', annualAmount: 12000, donateAppreciatedSecurities: true }],
        };

        // Act
        applyW5Effects(makeCtx({ m: 12, currentMonthIndex: 0 }), containers, mutator);

        // Assert — crédit identique (dans donCredit), et taxGains INCHANGÉ (0)
        expect(s.donCredit).toBeCloseTo(5754.42, 2);
        expect(s.taxGains).toBe(0);
    });

    it('ne comptabilise pas le crédit fiscal hors janvier', () => {
        // Arrange — juillet (currentMonthIndex=6)
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            charitableGoals: [{ id: 'c1', annualAmount: 12000 }],
        };

        // Act
        applyW5Effects(makeCtx({ m: 18, currentMonthIndex: 6 }), containers, mutator);

        // Assert — dépense mensuelle présente mais pas le crédit
        expect(s.expense).toBeCloseTo(1000, 2);
        expect(s.donCredit).toBe(0);
        expect(s.taxDivers).toBe(0);
        expect(s.taxRevenu).toBe(0);
    });

    it('n\'applique pas le don si la période est hors bornes', () => {
        // Arrange — don limité à 2028-2030, simulation en 2027
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            charitableGoals: [{ id: 'c1', annualAmount: 5000, startYear: 2028, endYear: 2030 }],
        };

        // Act — m=12 → yearNow=2027, avant startYear
        applyW5Effects(makeCtx({ m: 12 }), containers, mutator);

        // Assert
        expect(s.expense).toBe(0);
    });
});

// ── Immeubles locatifs ────────────────────────────────────────────────────────

describe('applyW5Effects — immeubles locatifs', () => {
    it('ajoute le NOI net comme revenu', () => {
        // Arrange — loyer 2500$/mois, dépenses 500$/mois, vacancy 5%
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            rentalProperties: [{
                id: 'rp1', name: '123 Rue Test', monthlyRent: 2500,
                monthlyExpenses: 500, vacancyPct: 5,
                purchasePrice: 400000, currentValue: 450000,
                mortgageBalance: 300000, mortgageRate: 5,
            }],
        };

        // Act
        applyW5Effects(makeCtx(), containers, mutator);

        // Assert — NOI annuel = 2500×12×0.95 - 500×12 = 28500-6000 = 22500 → /12 = 1875/mois
        expect(s.income).toBeCloseTo(1875, 0);
        // [FA-6] l'impôt locatif (proxy 45 %) va dans DIVERS → survit décembre (avant : clobberé en
        // année active = loyers NON imposés). Plus dans revenu.
        expect(s.taxDivers).toBeGreaterThan(0);
        expect(s.taxRevenu).toBe(0);
    });
});

describe('[FISC-RRSP-RENTAL-EARNED] applyW5Effects — le NOI par propriétaire est RENDU (revenu gagné)', () => {
    const plex = (over: Partial<W5Containers['rentalProperties'][number]> = {}) => ({
        id: 'rp1', name: 'Plex', monthlyRent: 2500, monthlyExpenses: 500, vacancyPct: 5,
        purchasePrice: 400000, currentValue: 450000, mortgageBalance: 300000, mortgageRate: 5, ...over,
    });

    it('propriétaire user2 : tout le NOI mensuel (1 875 $) dans son seau, les autres à zéro', () => {
        const { mutator } = makeMutator();
        const r = applyW5Effects(makeCtx(), { ...emptyContainers(), rentalProperties: [plex({ owner: 'user2' })] }, mutator);
        expect(r.rentalNoiMensuelParProprietaire.user2).toBeCloseTo(1875, 6);
        expect(r.rentalNoiMensuelParProprietaire.user1).toBe(0);
        expect(r.rentalNoiMensuelParProprietaire.joint).toBe(0);
    });

    it('sans propriétaire → seau conjoint ; deux immeubles s’additionnent chacun chez le sien', () => {
        const { mutator, s } = makeMutator();
        const r = applyW5Effects(makeCtx(), { ...emptyContainers(), rentalProperties: [plex(), plex({ id: 'rp2', owner: 'user1', monthlyRent: 1000, monthlyExpenses: 0, vacancyPct: 0 })] }, mutator);
        expect(r.rentalNoiMensuelParProprietaire.joint).toBeCloseTo(1875, 6);
        expect(r.rentalNoiMensuelParProprietaire.user1).toBeCloseTo(1000, 6);
        // Même porte que le revenu : la somme des seaux est EXACTEMENT ce qui a été encaissé.
        expect(r.rentalNoiMensuelParProprietaire.joint + r.rentalNoiMensuelParProprietaire.user1).toBeCloseTo(s.income, 6);
    });

    it('perte locative : le seau est NÉGATIF (T4040 : pertes déduites du revenu gagné)', () => {
        const { mutator } = makeMutator();
        const r = applyW5Effects(makeCtx(), { ...emptyContainers(), rentalProperties: [plex({ owner: 'user1', monthlyRent: 1000, monthlyExpenses: 1500 })] }, mutator);
        // 1000×12×0,95 − 1500×12 = 11 400 − 18 000 = −6 600 → −550/mois
        expect(r.rentalNoiMensuelParProprietaire.user1).toBeCloseTo(-550, 6);
    });

    it('aucun immeuble : les trois seaux valent zéro (jamais undefined)', () => {
        const { mutator } = makeMutator();
        const r = applyW5Effects(makeCtx(), emptyContainers(), mutator);
        expect(r.rentalNoiMensuelParProprietaire).toEqual({ user1: 0, user2: 0, joint: 0 });
    });
});

// ── Entreprises privées ───────────────────────────────────────────────────────

describe('applyW5Effects — entreprises privées', () => {
    it('ajoute les dividendes mensuels au revenu', () => {
        // Arrange
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            privateBusinesses: [{
                id: 'b1', name: 'Holding SA', annualDividend: 120000,
                ownershipPct: 100, estimatedValue: 1000000,
            }],
        };

        // Act
        applyW5Effects(makeCtx(), containers, mutator);

        // Assert — 120000/12 = 10000/mois ; [FA-6] impôt dividende (proxy 36 %) dans DIVERS, pas revenu
        expect(s.income).toBeCloseTo(10000, 0);
        expect(s.taxDivers).toBeGreaterThan(0);
        expect(s.taxRevenu).toBe(0);
    });

    it('tient compte du % de participation', () => {
        // Arrange — 50% de participation sur 240000$/an
        const { mutator, s } = makeMutator();
        const containers: W5Containers = {
            ...emptyContainers(),
            privateBusinesses: [{
                id: 'b2', name: 'Holding SARL', annualDividend: 240000,
                ownershipPct: 50, estimatedValue: 2000000,
            }],
        };

        // Act
        applyW5Effects(makeCtx(), containers, mutator);

        // Assert — 240000 × 0.5 / 12 = 10000
        expect(s.income).toBeCloseTo(10000, 0);
    });
});

// ── applyAgeBasedExpenses ────────────────────────────────────────────────────

describe('applyAgeBasedExpenses', () => {
    it('applique la dépense boomerang pendant la durée configurée', () => {
        // Arrange — boomerang débute à 55 ans, durée 36 mois, âge actuel 56
        let depense = 0;
        const state = { addExpense: (n: number) => { depense += n; } };
        const ctx = { age: 56, currentMonthIndex: 0, isRetired: false, expenseMultiplier: 1.0 };
        const proj = {
            boomerangSupportMonthly: 800,
            boomerangStartAge: 55,
            boomerangDurationMonths: 36,
        };

        // Act
        applyAgeBasedExpenses(ctx, proj, state);

        // Assert — mois 12 dans la durée → dépense active
        expect(depense).toBe(800);
    });

    it('n\'applique pas le boomerang avant l\'âge de début', () => {
        // Arrange — boomerang à 55 ans, âge actuel 50
        let depense = 0;
        const state = { addExpense: (n: number) => { depense += n; } };
        const ctx = { age: 50, currentMonthIndex: 0, isRetired: false, expenseMultiplier: 1.0 };
        const proj = { boomerangSupportMonthly: 800, boomerangStartAge: 55, boomerangDurationMonths: 36 };

        // Act
        applyAgeBasedExpenses(ctx, proj, state);

        // Assert
        expect(depense).toBe(0);
    });

    it('applique les frais de caregiving pendant la durée configurée', () => {
        // Arrange — aidant à 65 ans, durée 24 mois, âge actuel 66
        let depense = 0;
        const state = { addExpense: (n: number) => { depense += n; } };
        const ctx = { age: 66, currentMonthIndex: 0, isRetired: true, expenseMultiplier: 1.0 };
        const proj = { caregivingMonthly: 1500, caregivingStartAge: 65, caregivingDurationMonths: 24 };

        // Act
        applyAgeBasedExpenses(ctx, proj, state);

        // Assert
        expect(depense).toBe(1500);
    });

    it('applique les frais snowbird mensuels si retraité et activé', () => {
        // Arrange
        let depense = 0;
        const state = { addExpense: (n: number) => { depense += n; } };
        const ctx = { age: 68, currentMonthIndex: 0, isRetired: true, expenseMultiplier: 1.0 };
        const proj = { snowbirdEnabled: true, snowbirdMonthsPerYear: 4, snowbirdExtraMonthlyCost: 1200 };

        // Act
        applyAgeBasedExpenses(ctx, proj, state);

        // Assert — 1200 × 4 / 12 = 400/mois
        expect(depense).toBeCloseTo(400, 2);
    });

    it('n\'applique pas snowbird si non retraité', () => {
        // Arrange
        let depense = 0;
        const state = { addExpense: (n: number) => { depense += n; } };
        const ctx = { age: 55, currentMonthIndex: 0, isRetired: false, expenseMultiplier: 1.0 };
        const proj = { snowbirdEnabled: true, snowbirdMonthsPerYear: 4, snowbirdExtraMonthlyCost: 1200 };

        // Act
        applyAgeBasedExpenses(ctx, proj, state);

        // Assert
        expect(depense).toBe(0);
    });
});

// ── [W5-RENTAL-INTERET-DPA] intérêts hypothécaires déductibles du NOI imposable ────────────────

describe('[W5-RENTAL-INTERET-DPA] applyW5Effects — l’intérêt du mois est DÉDUIT de la base imposable, pas du flux', () => {
    // Plex : NOI 1 875 $/mois. Intérêt du mois passé par le contexte : 1 250 $ (300 k$ × 5 % / 12).
    const plex = (over: Partial<W5Containers['rentalProperties'][number]> = {}) => ({
        id: 'rp1', name: 'Plex', monthlyRent: 2500, monthlyExpenses: 500, vacancyPct: 5,
        purchasePrice: 400000, currentValue: 450000, mortgageBalance: 300000, mortgageRate: 5, ...over,
    });
    const avecInteret = (interet: number, over: Partial<W5Containers['rentalProperties'][number]> = {}) => {
        const { mutator, s } = makeMutator();
        const r = applyW5Effects(makeCtx({ rentalInterestMensuelParImmeuble: { rp1: interet } }), { ...emptyContainers(), rentalProperties: [plex(over)] }, mutator);
        return { r, s };
    };

    it('le revenu ENCAISSÉ reste le NOI brut ; l’impôt porte sur NOI − intérêt', () => {
        const { s } = avecInteret(1250);
        expect(s.income).toBeCloseTo(1875, 6);
        expect(s.taxDivers).toBeCloseTo((1875 - 1250) * 0.45, 6);
        // Discriminant : l'ancien calcul (NOI brut × proxy) donnait 843,75.
        expect(s.taxDivers).not.toBeCloseTo(1875 * 0.45, 2);
    });

    it('le revenu GAGNÉ par propriétaire est la base NETTE (T4040 : revenu net de location)', () => {
        const { r } = avecInteret(1250, { owner: 'user2' });
        expect(r.rentalNoiMensuelParProprietaire.user2).toBeCloseTo(625, 6);
        expect(r.rentalNoiMensuelParProprietaire.user1).toBe(0);
    });

    it('contexte ABSENT → base = NOI brut (rétrocompat : les appelants historiques ne changent pas)', () => {
        const { mutator, s } = makeMutator();
        applyW5Effects(makeCtx(), { ...emptyContainers(), rentalProperties: [plex()] }, mutator);
        expect(s.taxDivers).toBeCloseTo(1875 * 0.45, 6);
    });

    it('intérêt > NOI → base NÉGATIVE : perte locative déductible (impôt négatif, revenu gagné négatif), flux inchangé', () => {
        const { r, s } = avecInteret(2000, { owner: 'user1' });
        expect(s.income).toBeCloseTo(1875, 6);
        expect(s.taxDivers).toBeCloseTo((1875 - 2000) * 0.45, 6);
        expect(r.rentalNoiMensuelParProprietaire.user1).toBeCloseTo(-125, 6);
    });

    it('intérêt qui annule EXACTEMENT le NOI de trésorerie : la porte reste ouverte sur la base fiscale (0 n’est pas « absent »)', () => {
        // NOI 1 875 et intérêt 1 875 → base 0 ; à l'inverse un NOI de trésorerie nul avec 500 $ d'intérêts
        // doit produire une perte de 500 $ — la porte ne dépend pas d'une coïncidence du flux.
        const { mutator, s } = makeMutator();
        applyW5Effects(makeCtx({ rentalInterestMensuelParImmeuble: { rp1: 500 } }), { ...emptyContainers(), rentalProperties: [plex({ monthlyRent: 500 / 0.95, monthlyExpenses: 500 })] }, mutator);
        expect(s.income).toBeCloseTo(0, 6);
        expect(s.taxDivers).toBeCloseTo(-500 * 0.45, 6);
    });

    it('intérêt NaN ou NÉGATIF dans le contexte → traité comme 0 (jamais propagé, jamais un crédit fantôme)', () => {
        expect(avecInteret(NaN).s.taxDivers).toBeCloseTo(1875 * 0.45, 6);
        expect(avecInteret(-300).s.taxDivers).toBeCloseTo(1875 * 0.45, 6);
    });

    it('clé d’un immeuble SANS id : `rentalStateId` (repli « anon ») — l’intérêt n’est pas perdu', () => {
        const { mutator, s } = makeMutator();
        applyW5Effects(makeCtx({ rentalInterestMensuelParImmeuble: { anon: 1250 } }), { ...emptyContainers(), rentalProperties: [plex({ id: '' })] }, mutator);
        expect(s.taxDivers).toBeCloseTo((1875 - 1250) * 0.45, 6);
    });
});

