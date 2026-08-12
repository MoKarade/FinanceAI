// tests/services/monthlyEvents.test.ts
// Couverture des helpers purs de services/projection/monthlyEvents.ts :
// applyTravelExpenses, applyLifeEvents, applySavingsGoalDeadlines,
// applyFinancialGoalDeadlines, computeStressTest.

import { describe, it, expect, vi } from 'vitest';
import {
    applyTravelExpenses,
    applyLifeEvents,
    applySavingsGoalDeadlines,
    applyFinancialGoalDeadlines,
    computeStressTest,
    computeIncomeLossFactor,
    INCOME_LOSS_EVENT_TYPES,
} from '../../services/projection/monthlyEvents';
import type { PropertyStateMutable, LifeEventMutator, GoalDeadlineMutator } from '../../services/projection/monthlyEvents';
import { applyCapitalDisposition } from '../../services/projection/portfolioOps';
import type { TravelGoal, LifeEvent, SavingsGoal, FinancialGoal, ProjectionConfig } from '../../types';

// ── applyTravelExpenses ──────────────────────────────────────────────────────

describe('applyTravelExpenses', () => {
    it('débite le coût du voyage quand le mois correspond', () => {
        // Arrange
        const goal: TravelGoal = { id: '1', destination: 'Paris', date: '2026-07', totalCost: 5000 };
        let depense = 0;
        const state = {
            addExpense: (n: number) => { depense += n; },
            logFlow: vi.fn(),
        };

        // Act
        applyTravelExpenses([goal], '2026-07', 1.0, state);

        // Assert
        expect(depense).toBe(5000);
        expect(state.logFlow).toHaveBeenCalledOnce();
    });

    it('n\'applique pas le coût si le mois ne correspond pas', () => {
        // Arrange
        const goal: TravelGoal = { id: '1', destination: 'Tokyo', date: '2026-12', totalCost: 8000 };
        let depense = 0;
        const state = { addExpense: (n: number) => { depense += n; }, logFlow: vi.fn() };

        // Act
        applyTravelExpenses([goal], '2026-07', 1.0, state);

        // Assert
        expect(depense).toBe(0);
        expect(state.logFlow).not.toHaveBeenCalled();
    });

    it('applique le multiplicateur d\'inflation au coût', () => {
        // Arrange — multiplicateur de 1.1 (10% d'inflation cumulée)
        const goal: TravelGoal = { id: '1', destination: 'Hawaii', date: '2028-03', totalCost: 10000 };
        let depense = 0;
        const state = { addExpense: (n: number) => { depense += n; }, logFlow: vi.fn() };

        // Act
        applyTravelExpenses([goal], '2028-03', 1.1, state);

        // Assert
        expect(depense).toBeCloseTo(11000, 2);
    });

    it('ignore les voyages sans date (defensive guard)', () => {
        // Arrange — objet malformé sans date
        const goal = { id: '1', destination: 'Null Island', totalCost: 1000 } as TravelGoal;
        let depense = 0;
        const state = { addExpense: (n: number) => { depense += n; }, logFlow: vi.fn() };

        // Act — ne doit pas crasher
        applyTravelExpenses([goal], '2026-07', 1.0, state);

        // Assert
        expect(depense).toBe(0);
    });
});

// ── applyLifeEvents ──────────────────────────────────────────────────────────

describe('applyLifeEvents', () => {
    // Le state est un objet mutable partagé par le mutateur ET les assertions.
    // On NE fait pas de spread (copie valeur) pour éviter la désynchronisation.
    // Double FIDÈLE : `realizeCapitalDisposition` exerce le VRAI helper `applyCapitalDisposition`
    // (banque de pertes + nettoyage des gains) au lieu d'un `vi.fn()` creux → le test valide la
    // logique réelle. `lossBank` peut être pré-amorcé pour tester le nettoyage d'un gain.
    const makeState = (lossBank = 0) => {
        const s = { portfolio: 100000, liquid: 50000, expense: 0, capitalGain: 0, lossBank };
        const mutator: LifeEventMutator = {
            shockPortfolio: (f: number) => { s.portfolio *= f; },
            addLiquid: (n: number) => { s.liquid += n; },
            addExpense: (n: number) => { s.expense += n; },
            adjustRealEstate: vi.fn(),
            realizeCapitalDisposition: (rawGain: number) => {
                const st = { capitalLossBank: s.lossBank, accCapitalGainsYear: s.capitalGain };
                const r = applyCapitalDisposition(st, rawGain);
                s.lossBank = st.capitalLossBank;
                s.capitalGain = st.accCapitalGainsYear;
                return r;
            },
            logLife: vi.fn(),
            logFlow: vi.fn(),
        };
        return { mutator, s };
    };

    // [ENG-LIFEEVENT-VENTE-SUBSTRING] Sémantique explicite : eventKind prime sur le mot réservé.
    it('eventKind:VENTE_IMMO force la vente SANS le mot « vente » dans le nom', () => {
        const event: LifeEvent = { id: 'v', date: '2035-06', type: 'GROS_ACHAT', name: 'Disposition du chalet', eventKind: 'VENTE_IMMO' };
        const { mutator } = makeState();
        const props: PropertyStateMutable[] = [{ id: 'c', isBought: true, mortgage: 0, currentValue: 400000, cost: 300000, isPrimaryResidence: false }];
        applyLifeEvents([event], '2035-06', 1.0, props, mutator);
        expect(props[0].isSold).toBe(true); // vendu sans dépendre du mot réservé
    });

    it("eventKind:NONE DÉSARME la sous-chaîne : « GROS_ACHAT … après vente de l'ancienne » n'est PLUS avalé en vente", () => {
        const event: LifeEvent = {
            id: 'g', date: '2035-06', type: 'GROS_ACHAT', name: 'Nouvelle maison après vente de l\'ancienne',
            impactAmount: 30000, eventKind: 'NONE',
        };
        const { mutator, s } = makeState();
        const props: PropertyStateMutable[] = [{ id: 'c', isBought: true, mortgage: 0, currentValue: 400000, cost: 300000, isPrimaryResidence: false }];
        applyLifeEvents([event], '2035-06', 1.0, props, mutator);
        expect(props[0].isSold).toBeUndefined();       // AUCUNE vente déclenchée
        expect(s.expense).toBeGreaterThan(0);          // le GROS_ACHAT s'applique (impactAmount honoré)
    });

    it('eventKind absent = comportement HISTORIQUE exact (sous-chaîne « vente » détecte)', () => {
        const event: LifeEvent = { id: 'v', date: '2035-06', type: 'GROS_ACHAT', name: 'Vente chalet' };
        const { mutator } = makeState();
        const props: PropertyStateMutable[] = [{ id: 'c', isBought: true, mortgage: 0, currentValue: 400000, cost: 300000, isPrimaryResidence: false }];
        applyLifeEvents([event], '2035-06', 1.0, props, mutator);
        expect(props[0].isSold).toBe(true);
    });

    // RE-GAIN — gain en capital à la disposition d'un immeuble (vente via LifeEvent « vente »).
    it('RE-GAIN : vente d\'un LOCATIF réalise le gain (produit 95 % − coût) ; 50 % imposé en aval', () => {
        const event: LifeEvent = { id: 'v', date: '2035-06', type: 'GROS_ACHAT', name: 'Vente chalet locatif' };
        const { mutator, s } = makeState();
        const props: PropertyStateMutable[] = [{ id: 'c', isBought: true, mortgage: 100000, currentValue: 500000, cost: 300000, isPrimaryResidence: false }];
        applyLifeEvents([event], '2035-06', 1.0, props, mutator);
        // produit net 500000×0.95 = 475000 ; gain BRUT = 475000 − 300000 = 175000 (l'inclusion 50 % est en aval).
        expect(s.capitalGain).toBeCloseTo(175000, 0);
        expect(s.liquid).toBeCloseTo(50000 + (475000 - 100000), 0); // net après hypothèque
        expect(props[0].isSold).toBe(true);
    });

    it('RE-GAIN : vente de la RÉSIDENCE PRINCIPALE = gain EXEMPT (aucun gain réalisé)', () => {
        const event: LifeEvent = { id: 'v', date: '2035-06', type: 'GROS_ACHAT', name: 'Vente maison' };
        const { mutator, s } = makeState();
        const props: PropertyStateMutable[] = [{ id: 'm', isBought: true, mortgage: 100000, currentValue: 500000, cost: 300000, isPrimaryResidence: true }];
        applyLifeEvents([event], '2035-06', 1.0, props, mutator);
        expect(s.capitalGain).toBe(0);        // exemption résidence principale (LIR 40(2)b)
        expect(props[0].isSold).toBe(true);   // la vente a bien lieu, sans impôt sur le gain
    });

    // [FISC-RE-CAPITAL-LOSS] Discriminant : avant le fix, `gain = Math.max(0, produit − coût)` + `if (gain > 0)`
    // → la perte en capital réalisée était SILENCIEUSEMENT IGNORÉE (ni banque, ni log → avantage fiscal perdu).
    // Désormais elle est PORTÉE en banque de pertes (déductible des gains futurs). ÉCHOUE sur l'ancien code
    // (s.lossBank serait resté 0 et logFlow jamais appelé).
    it('FISC-RE-CAPITAL-LOSS : locatif vendu à perte (produit < coût) → perte PORTÉE en banque (pas ignorée)', () => {
        const event: LifeEvent = { id: 'v', date: '2035-06', type: 'GROS_ACHAT', name: 'Vente locatif' };
        const { mutator, s } = makeState();
        const props: PropertyStateMutable[] = [{ id: 'l', isBought: true, mortgage: 50000, currentValue: 200000, cost: 250000, isPrimaryResidence: false }];
        applyLifeEvents([event], '2035-06', 1.0, props, mutator);
        // produit net 200000×0.95 = 190000 ; perte = 190000 − 250000 = −60000 → banque += 60000.
        expect(s.capitalGain).toBe(0);     // aucun gain imposable réalisé
        expect(s.lossBank).toBeCloseTo(60000, 0); // perte banquée (ancien code : restait 0)
        // [FUTUR-DAILY-EVENTS] 2e arg = jour de l'événement — ici la fixture date '2035-06' n'a pas
        // de jour → undefined explicite (l'affichage posera l'icône au mois, jamais un jour inventé).
        expect(mutator.logFlow).toHaveBeenCalledWith(expect.stringContaining('Perte en capital'), undefined);
    });

    // [FISC-RE-CAPITAL-LOSS] Symétrie : un GAIN locatif nette d'abord la banque de pertes existante avant
    // d'alimenter l'impôt (cohérent avec NonReg/crypto). Banque pré-amorcée à 100000.
    it('FISC-RE-CAPITAL-LOSS : un gain locatif nette la banque de pertes avant imposition', () => {
        const event: LifeEvent = { id: 'v', date: '2040-06', type: 'GROS_ACHAT', name: 'Vente locatif' };
        const { mutator, s } = makeState(100000); // 100 k$ de pertes reportées disponibles
        const props: PropertyStateMutable[] = [{ id: 'l', isBought: true, mortgage: 0, currentValue: 400000, cost: 300000, isPrimaryResidence: false }];
        applyLifeEvents([event], '2040-06', 1.0, props, mutator);
        // gain brut = 400000×0.95 − 300000 = 80000 ; entièrement absorbé par la banque (100000) → 0 imposable.
        expect(s.capitalGain).toBe(0);
        expect(s.lossBank).toBeCloseTo(20000, 0); // 100000 − 80000 consommés
        // Gain entièrement absorbé (taxableGain = 0, bankedLoss = 0) → AUCUN log (ni gain ni perte) : silence VOULU.
        expect(mutator.logFlow).not.toHaveBeenCalledWith(expect.stringContaining('Gain en capital'));
        expect(mutator.logFlow).not.toHaveBeenCalledWith(expect.stringContaining('Perte en capital'));
    });

    // [DETTE-RE-SALE] Discriminant : 2 biens (résidence principale + locatif), tous deux à équité positive.
    // L'événement cible le LOCATIF par propertyId → c'est LUI qui se vend (gain imposable), PAS la RP.
    // Ancien code (`find` premier bien à équité positive) vendait la RP [0] exemptée → capitalGain=0 → ÉCHOUE.
    it('DETTE-RE-SALE : vente ciblée par propertyId vend le BON bien (locatif), pas le premier (RP)', () => {
        const event: LifeEvent = { id: 'v', date: '2035-06', type: 'GROS_ACHAT', name: 'Vente locatif', propertyId: 'loc' };
        const { mutator, s } = makeState();
        const props: PropertyStateMutable[] = [
            { id: 'rp', isBought: true, mortgage: 100000, currentValue: 500000, cost: 300000, isPrimaryResidence: true },
            { id: 'loc', isBought: true, mortgage: 100000, currentValue: 500000, cost: 300000, isPrimaryResidence: false },
        ];
        applyLifeEvents([event], '2035-06', 1.0, props, mutator);
        expect(props[1].isSold).toBe(true);   // le LOCATIF visé est vendu
        expect(props[0].isSold).toBeFalsy();  // la RP n'est PAS vendue (ancien code : l'aurait vendue)
        expect(s.capitalGain).toBeCloseTo(175000, 0); // gain locatif réalisé (RP aurait donné 0 → exempt)
    });

    // Symétrie : cibler la RP (par id) quand elle est en 2ᵉ position prouve que c'est l'id qui pilote, pas l'index.
    it('DETTE-RE-SALE : cibler la RP en 2ᵉ position la vend elle (exempte), pas le locatif en tête', () => {
        const event: LifeEvent = { id: 'v', date: '2035-06', type: 'GROS_ACHAT', name: 'Vente maison', propertyId: 'rp' };
        const { mutator, s } = makeState();
        const props: PropertyStateMutable[] = [
            { id: 'loc', isBought: true, mortgage: 100000, currentValue: 500000, cost: 300000, isPrimaryResidence: false },
            { id: 'rp', isBought: true, mortgage: 100000, currentValue: 500000, cost: 300000, isPrimaryResidence: true },
        ];
        applyLifeEvents([event], '2035-06', 1.0, props, mutator);
        expect(props[1].isSold).toBe(true);   // la RP visée
        expect(props[0].isSold).toBeFalsy();  // le locatif intact
        expect(s.capitalGain).toBe(0);        // vente RP = exempte
    });

    // propertyId fourni SANS correspondance → AUCUNE vente (ne pas vendre un autre bien silencieusement).
    it('DETTE-RE-SALE : propertyId sans correspondance ne vend RIEN (pas de repli sur un autre bien)', () => {
        const event: LifeEvent = { id: 'v', date: '2035-06', type: 'GROS_ACHAT', name: 'Vente locatif', propertyId: 'fantome' };
        const { mutator, s } = makeState();
        const props: PropertyStateMutable[] = [
            { id: 'rp', isBought: true, mortgage: 100000, currentValue: 500000, cost: 300000, isPrimaryResidence: true },
        ];
        applyLifeEvents([event], '2035-06', 1.0, props, mutator);
        expect(props[0].isSold).toBeFalsy();  // rien vendu
        expect(s.capitalGain).toBe(0);
        // Observabilité (panel silent-failure) : la vente ignorée est SIGNALÉE, pas avalée en silence.
        expect(mutator.logFlow).toHaveBeenCalledWith(expect.stringContaining('ignorée'), undefined);
    });

    // Rétrocompat : SANS propertyId, comportement historique inchangé (premier bien à équité positive).
    it('DETTE-RE-SALE : sans propertyId, fallback historique (premier bien à équité positive)', () => {
        const event: LifeEvent = { id: 'v', date: '2035-06', type: 'GROS_ACHAT', name: 'Vente' };
        const { mutator, s } = makeState();
        const props: PropertyStateMutable[] = [
            { id: 'rp', isBought: true, mortgage: 100000, currentValue: 500000, cost: 300000, isPrimaryResidence: true },
            { id: 'loc', isBought: true, mortgage: 100000, currentValue: 500000, cost: 300000, isPrimaryResidence: false },
        ];
        applyLifeEvents([event], '2035-06', 1.0, props, mutator);
        expect(props[0].isSold).toBe(true);   // premier bien (RP) = comportement d'avant
        expect(s.capitalGain).toBe(0);
    });

    it('applique un krach boursier et choque le portfolio', () => {
        // Arrange
        const event: LifeEvent = { id: '1', date: '2030-01', type: 'KRACH', name: 'Crise', impactPercent: 40 };
        const { mutator, s } = makeState();

        // Act
        applyLifeEvents([event], '2030-01', 1.0, [], mutator);

        // Assert — portefeuille à -40% → 60 000
        expect(s.portfolio).toBeCloseTo(60000, 0);
    });

    it('applique l\'impact d\'un événement générique comme dépense', () => {
        // Arrange
        const event: LifeEvent = { id: '2', date: '2026-08', type: 'MARIAGE', name: 'Divorce', impactAmount: 20000 };
        const { mutator, s } = makeState();

        // Act
        applyLifeEvents([event], '2026-08', 1.0, [], mutator);

        // Assert
        expect(s.expense).toBe(20000);
    });

    it('vente immobilière transfère le produit net (95%) en liquidités', () => {
        // Arrange — propriété isBought avec hypothèque
        const event: LifeEvent = { id: '3', date: '2035-06', type: 'GROS_ACHAT', name: 'Vente maison' };
        const prop: PropertyStateMutable = { isBought: true, mortgage: 150000, currentValue: 500000 };
        const { mutator, s } = makeState();

        // Act
        applyLifeEvents([event], '2035-06', 1.0, [prop], mutator);

        // Assert — net = (500000 × 0.95) - 150000 = 325000
        expect(s.liquid).toBeCloseTo(50000 + 325000, 0);
        expect(prop.isBought).toBe(false);
    });

    it('FISC-RE-SALE-RESIDUAL : vente quasi-underwater (frais > équité) → le déficit est PORTÉ, pas effacé', () => {
        // Hypothèque entre 95 % et 100 % de la valeur : les 5 % de frais poussent le produit net SOUS la
        // dette → `saleNet` < 0. La propriété est quand même vendue (mortgage 390 k$ < valeur 400 k$), mais
        // `saleNet = 400 000×0.95 − 390 000 = −10 000`. Avant le fix, `Math.max(0, saleNet)` EFFAÇAIT ce
        // déficit (patrimoine surévalué de 10 k$) ; désormais `addLiquid(saleNet)` le porte (il tombe dans
        // le sauvetage PV-6 → liquidDebt VISIBLE / baisse de liquide). Discriminant : 50 000 → 40 000.
        const event: LifeEvent = { id: 'v', date: '2035-06', type: 'GROS_ACHAT', name: 'Vente maison' };
        const prop: PropertyStateMutable = { isBought: true, mortgage: 390000, currentValue: 400000 };
        const { mutator, s } = makeState();
        applyLifeEvents([event], '2035-06', 1.0, [prop], mutator);
        expect(s.liquid).toBeCloseTo(50000 - 10000, 0); // ancien code (clamp) laissait 50 000 → échec
        expect(prop.isBought).toBe(false);
    });

    it('ignore les événements dont la date ne correspond pas', () => {
        // Arrange
        const event: LifeEvent = { id: '4', date: '2029-03', type: 'ACCIDENT', name: 'Maladie', impactAmount: 5000 };
        const { mutator, s } = makeState();

        // Act
        applyLifeEvents([event], '2026-07', 1.0, [], mutator);

        // Assert
        expect(s.expense).toBe(0);
    });

    it('ignore les événements sans date (defensive guard)', () => {
        // Arrange — date manquante
        const event = { id: '5', type: 'ACCIDENT', name: 'Bug', impactAmount: 9999 } as unknown as LifeEvent;
        const { mutator, s } = makeState();

        // Act — ne doit pas crasher
        expect(() => applyLifeEvents([event], '2026-07', 1.0, [], mutator)).not.toThrow();
        expect(s.expense).toBe(0);
    });
});

// ── applySavingsGoalDeadlines ─────────────────────────────────────────────────

describe('applySavingsGoalDeadlines', () => {
    const makeState = (liquidBalance: number) => {
        const s = { expense: 0, balance: liquidBalance };
        const mutator: GoalDeadlineMutator = {
            withdrawFromAccount: (_acct: string, amount: number) => {
                const withdrawn = Math.min(s.balance, amount);
                s.balance -= withdrawn;
                return withdrawn;
            },
            addExpense: (n: number) => { s.expense += n; },
            logFlow: vi.fn(),
        };
        return { mutator, s };
    };

    it('retire le manque à combler au mois deadline', () => {
        // Arrange — cible 10000, déjà 3000, deadline ce mois
        const goal: SavingsGoal = {
            id: '1', name: 'Fonds urgence', targetAmount: 10000, currentAmount: 3000, deadline: '2027-06', icon: '💰',
        };
        const { mutator, s } = makeState(20000);

        // Act
        applySavingsGoalDeadlines([goal], '2027-06', 1.0, mutator);

        // Assert — retire 7000 (10000 - 3000)
        expect(s.expense).toBe(7000);
    });

    it('n\'agit pas si le goal est déjà atteint', () => {
        // Arrange — currentAmount >= targetAmount
        const goal: SavingsGoal = {
            id: '1', name: 'Déjà atteint', targetAmount: 5000, currentAmount: 5000, deadline: '2027-06', icon: '✅',
        };
        const { mutator, s } = makeState(20000);

        // Act
        applySavingsGoalDeadlines([goal], '2027-06', 1.0, mutator);

        // Assert
        expect(s.expense).toBe(0);
    });

    it('ne rien faire si le mois ne correspond pas', () => {
        // Arrange
        const goal: SavingsGoal = {
            id: '1', name: 'Vacances', targetAmount: 8000, currentAmount: 0, deadline: '2027-12', icon: '🏖️',
        };
        const { mutator, s } = makeState(20000);

        // Act
        applySavingsGoalDeadlines([goal], '2027-06', 1.0, mutator);

        // Assert
        expect(s.expense).toBe(0);
    });
});

// ── applyFinancialGoalDeadlines ───────────────────────────────────────────────

describe('applyFinancialGoalDeadlines', () => {
    const makeState = () => {
        const s = { expense: 0 };
        const mutator: GoalDeadlineMutator = {
            withdrawFromAccount: (_acct: string, amount: number) => amount,
            addExpense: (n: number) => { s.expense += n; },
            logFlow: vi.fn(),
        };
        return { mutator, s };
    };

    it('retire le besoin du compte cible au mois deadline', () => {
        // Arrange
        const goal: FinancialGoal = {
            id: '1', name: 'Auto électrique', targetAmount: 50000, manualCurrentAmount: 20000,
            deadline: '2028-09', targetAccount: 'NON-ENREG', status: 'active', completed: false,
            type: 'CUSTOM',
        };
        const { mutator, s } = makeState();

        // Act
        applyFinancialGoalDeadlines([goal], '2028-09', 1.0, mutator);

        // Assert — besoin = 50000 - 20000 = 30000
        expect(s.expense).toBe(30000);
    });

    it('ignore les goals archivés', () => {
        // Arrange
        const goal: FinancialGoal = {
            id: '1', name: 'Archivé', targetAmount: 10000, manualCurrentAmount: 0,
            deadline: '2028-09', targetAccount: 'CELI', status: 'archived', completed: false,
            type: 'CUSTOM',
        };
        const { mutator, s } = makeState();

        // Act
        applyFinancialGoalDeadlines([goal], '2028-09', 1.0, mutator);

        // Assert
        expect(s.expense).toBe(0);
    });

    it('ignore les goals déjà complétés', () => {
        // Arrange
        const goal: FinancialGoal = {
            id: '1', name: 'Complété', targetAmount: 10000, manualCurrentAmount: 0,
            deadline: '2028-09', targetAccount: 'CELI', status: 'active', completed: true,
            type: 'CUSTOM',
        };
        const { mutator, s } = makeState();

        // Act
        applyFinancialGoalDeadlines([goal], '2028-09', 1.0, mutator);

        // Assert
        expect(s.expense).toBe(0);
    });
});

// ── [PV-11a] onGoalShortfall — remontée structurée des objectifs partiellement financés ──
describe('onGoalShortfall (PV-11a)', () => {
    it('appelé avec (nom, visé, tiré) quand les fonds sont insuffisants', () => {
        const onGoalShortfall = vi.fn();
        const mutator: GoalDeadlineMutator = {
            withdrawFromAccount: (_a, amount) => Math.min(4000, amount), // seulement 4000 dispo
            addExpense: vi.fn(),
            logFlow: vi.fn(),
            onGoalShortfall,
        };
        const goal: SavingsGoal = { id: '1', name: 'Auto', targetAmount: 10000, currentAmount: 0, deadline: '2027-01', icon: '🚗' };

        applySavingsGoalDeadlines([goal], '2027-01', 1.0, mutator);

        expect(onGoalShortfall).toHaveBeenCalledTimes(1);
        expect(onGoalShortfall).toHaveBeenCalledWith('Auto', 10000, 4000);
    });

    it('PAS appelé quand l\'objectif est entièrement financé ; hook optionnel toléré absent', () => {
        const onGoalShortfall = vi.fn();
        const full: GoalDeadlineMutator = {
            withdrawFromAccount: (_a, amount) => amount,
            addExpense: vi.fn(), logFlow: vi.fn(), onGoalShortfall,
        };
        const goal: SavingsGoal = { id: '1', name: 'OK', targetAmount: 5000, currentAmount: 0, deadline: '2027-02', icon: '✅' };
        applySavingsGoalDeadlines([goal], '2027-02', 1.0, full);
        expect(onGoalShortfall).not.toHaveBeenCalled();

        // Sans le hook (appelants tests/hors-moteur) : aucune erreur.
        const minimal: GoalDeadlineMutator = { withdrawFromAccount: () => 0, addExpense: vi.fn(), logFlow: vi.fn() };
        expect(() => applySavingsGoalDeadlines([goal], '2027-02', 1.0, minimal)).not.toThrow();
    });
});

// ── computeStressTest ────────────────────────────────────────────────────────

describe('computeStressTest', () => {
    const baseProj: ProjectionConfig = {
        years: 30,
        returnRate: 6,
        inflationRate: 2,
        savingsMode: 'manual',
        manualContribution: 1000,
        usePortfolioRate: false,
        returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
        emergencyFundMonths: 6,
        salaryGrowth: 2,
        propertyGrowthRate: 3,
        stressTestEnabled: true,
        stressTestYear: 5,       // crash au mois 60
        stressTestDrop: 30,
        stressTestRecoveryMonths: 24,
    };

    it('retourne les facteurs neutres si stress test désactivé', () => {
        // Arrange
        const proj: ProjectionConfig = { ...baseProj, stressTestEnabled: false };

        // Act
        const result = computeStressTest(proj, 60);

        // Assert
        expect(result.crashFactor).toBe(1);
        expect(result.recoveryFactor).toBe(1);
        expect(result.log).toBeNull();
    });

    it('applique un crash de 30% au mois 60 (an 5)', () => {
        // Arrange
        const crashMonth = 60;

        // Act
        const result = computeStressTest(baseProj, crashMonth);

        // Assert — crashFactor = 1 - 0.30 = 0.70
        expect(result.crashFactor).toBeCloseTo(0.70, 5);
        expect(result.recoveryFactor).toBe(1);
        expect(result.log).not.toBeNull();
    });

    it('applique un facteur de reprise partielle pendant la fenêtre de recovery', () => {
        // Arrange — mois 70, dans la fenêtre 60..84
        const recoveryMonth = 70;

        // Act
        const result = computeStressTest(baseProj, recoveryMonth);

        // Assert
        expect(result.crashFactor).toBe(1);
        expect(result.recoveryFactor).toBeGreaterThan(1);
        expect(result.log).toBeNull();
    });

    it('retourne les facteurs neutres après la fenêtre de recovery', () => {
        // Arrange — mois 120, bien après an 5 + 24 mois
        const afterRecovery = 120;

        // Act
        const result = computeStressTest(baseProj, afterRecovery);

        // Assert
        expect(result.crashFactor).toBe(1);
        expect(result.recoveryFactor).toBe(1);
        expect(result.log).toBeNull();
    });

    it('retourne les facteurs neutres avant le crash (mois 0..59)', () => {
        // Arrange
        const beforeCrash = 30;

        // Act
        const result = computeStressTest(baseProj, beforeCrash);

        // Assert
        expect(result.crashFactor).toBe(1);
        expect(result.recoveryFactor).toBe(1);
    });
});

// ── [FISC-EVENT-INCOMELOSS] computeIncomeLossFactor ───────────────────────────

describe('computeIncomeLossFactor', () => {
    const ev = (over: Partial<LifeEvent> = {}): LifeEvent => ({
        id: '1', type: 'PERTE_EMPLOI', name: 'Perte d\'emploi', date: '2028-03',
        durationMonths: 6, incomeLossPercent: 100, ...over,
    });
    // m1 = mois 1-based ; on ancre au 15 pour éviter tout effet de bord de fin de mois.
    const at = (y: number, m1: number): Date => new Date(Date.UTC(y, m1 - 1, 15));

    it('facteur = (1 − %/100) pendant la fenêtre active', () => {
        expect(computeIncomeLossFactor([ev({ incomeLossPercent: 100 })], at(2028, 3))).toBe(0);
        expect(computeIncomeLossFactor([ev({ incomeLossPercent: 50 })], at(2028, 5))).toBe(0.5);
    });

    it('inactif AVANT la date de début → 1', () => {
        expect(computeIncomeLossFactor([ev()], at(2028, 2))).toBe(1);
    });

    it('borne : dernier mois inclus (offset dur−1), premier mois après exclu', () => {
        // début 2028-03, durée 6 → actif 2028-03..2028-08 (offsets 0..5).
        expect(computeIncomeLossFactor([ev({ incomeLossPercent: 100 })], at(2028, 8))).toBe(0); // offset 5 → actif
        expect(computeIncomeLossFactor([ev()], at(2028, 9))).toBe(1);                            // offset 6 → inactif
    });

    it('deux événements actifs se composent multiplicativement', () => {
        const a = ev({ id: 'a', type: 'PERTE_EMPLOI', incomeLossPercent: 50 });
        const b = ev({ id: 'b', type: 'ACCIDENT', incomeLossPercent: 50 });
        expect(computeIncomeLossFactor([a, b], at(2028, 4))).toBeCloseTo(0.25, 10);
    });

    it('% clampé à [0, 100] (négatif → 0 ; >100 → 100)', () => {
        expect(computeIncomeLossFactor([ev({ incomeLossPercent: 150 })], at(2028, 4))).toBe(0);
        expect(computeIncomeLossFactor([ev({ incomeLossPercent: -10 })], at(2028, 4))).toBe(1);
    });

    it('incomeLossPercent NaN/undefined (champ UI vidé) → 0 % (facteur 1, JAMAIS de NaN propagé)', () => {
        // parseFloat('') === NaN ; `?? 0` ne couvre PAS NaN → garde Number.isFinite explicite côté moteur.
        expect(computeIncomeLossFactor([ev({ incomeLossPercent: NaN })], at(2028, 4))).toBe(1);
        expect(computeIncomeLossFactor([ev({ incomeLossPercent: undefined })], at(2028, 4))).toBe(1);
        // durationMonths NaN → événement ignoré (pas de fenêtre active).
        expect(computeIncomeLossFactor([ev({ durationMonths: NaN })], at(2028, 4))).toBe(1);
    });

    it('durationMonths ≤ 0 ou absent → ignoré (facteur 1)', () => {
        expect(computeIncomeLossFactor([ev({ durationMonths: 0 })], at(2028, 3))).toBe(1);
        expect(computeIncomeLossFactor([ev({ durationMonths: undefined })], at(2028, 3))).toBe(1);
    });

    it('type NON perte-de-revenu (GROS_ACHAT) ignoré', () => {
        expect(computeIncomeLossFactor([ev({ type: 'GROS_ACHAT' })], at(2028, 4))).toBe(1);
    });

    it('date invalide ou absente → ignorée (pas de NaN)', () => {
        expect(computeIncomeLossFactor([ev({ date: 'pas-une-date' })], at(2028, 4))).toBe(1);
        expect(computeIncomeLossFactor([ev({ date: undefined as unknown as string })], at(2028, 4))).toBe(1);
    });

    it('résultat toujours dans [0, 1]', () => {
        const r = computeIncomeLossFactor([ev({ incomeLossPercent: 100 }), ev({ id: '2', type: 'SABBATIQUE', incomeLossPercent: 100 })], at(2028, 4));
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
        expect(r).toBe(0); // 0 × 0 = 0, pas de revenu négatif
    });
});

describe('applyLifeEvents — les événements de perte de revenu ne sont PAS une dépense', () => {
    it('un PERTE_EMPLOI au mois courant n\'appelle PAS addExpense (géré par computeIncomeLossFactor)', () => {
        const event: LifeEvent = { id: '1', type: 'PERTE_EMPLOI', name: 'Perte', date: '2028-03', durationMonths: 6, incomeLossPercent: 100, impactAmount: 9999 };
        const addExpense = vi.fn();
        const state: LifeEventMutator = {
            shockPortfolio: vi.fn(), addLiquid: vi.fn(), addExpense, adjustRealEstate: vi.fn(),
            realizeCapitalDisposition: vi.fn(() => ({ bankedLoss: 0, taxableGain: 0 })), logLife: vi.fn(), logFlow: vi.fn(),
        };
        applyLifeEvents([event], '2028-03', 1.0, [], state);
        expect(addExpense).not.toHaveBeenCalled(); // skippé : pas de faux flux de dépense
    });

    it('INCOME_LOSS_EVENT_TYPES contient les 3 types attendus', () => {
        expect([...INCOME_LOSS_EVENT_TYPES].sort()).toEqual(['ACCIDENT', 'PERTE_EMPLOI', 'SABBATIQUE']);
    });
});
