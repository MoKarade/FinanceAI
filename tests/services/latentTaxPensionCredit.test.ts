// tests/services/latentTaxPensionCredit.test.ts
//
// [FISC-LATENT-PENSION-CREDIT] — l'impôt latent portait l'ÂGE depuis le lot 84, mais pas l'assiette
// du crédit pour revenu de retraite (ARC 31400 / RQ 361). La raison en était structurelle : la règle
// vivait en CLOSURE dans `taxDecember` (`eligiblePensionFor`), donc inatteignable
// (`HELPER-INAPPELABLE-PAR-SON-CONSOMMATEUR`). Ce lot l'extrait en fonction PURE — `pensionCredit.ts`
// — et la fait consommer par les deux modules.
import { describe, it, expect, vi } from 'vitest';
import { computeLatentTax, type LatentTaxCtx } from '../../services/projection/latentTax';
import { eligiblePensionRealFor } from '../../services/projection/pensionCredit';
import { calculateFiscalReport, type AgeCreditOptions, type FiscalReport } from '../../utils/tax';

/** Barème RÉEL privé du seul champ que ce lot ajoute — témoin, pas ré-implémentation. */
const sansPension = (g: number, r: number, f: number, y: number, s: boolean, o?: AgeCreditOptions,
                     e?: number, d?: number): FiscalReport =>
    calculateFiscalReport(g, r, f, y, s, o ? { ...o, eligiblePensionIncome: undefined } : o, e, d);

/** Retraité SEUL de 70 ans, avec REER et gain latent : les deux appels de la bande sont exercés. */
const retraite = (extra: Partial<LatentTaxCtx> = {}): LatentTaxCtx => ({
    m: 0, loopYear: 2026, simInflation: 0, simSalaryGrowth: 0, isRetired: true, activeUsersCount: 1,
    grossMarcBaseAnnual: 0, grossAnnaBaseAnnual: 0,
    accRentesYear: 0, incomeRetirement: 40000 / 12,
    reer: 400000, nonReg: 200000, nonRegACB: 120000, crypto: 0, cryptoACB: 0,
    realEstateLatentGain: 0, enableMonteCarlo: false,
    ages: [70], dbPensionPerUserMonthly: [2000],
    ...extra,
});

describe('[FISC-LATENT-PENSION-CREDIT] la règle est PURE et gate sur deux âges distincts', () => {
    it('sans déclarant, pas d\'assiette', () => {
        expect(eligiblePensionRealFor(undefined, 24000, 12000)).toBe(0);
    });

    it('à 64 ans : rien — ni la rente privée, ni les retraits', () => {
        expect(eligiblePensionRealFor(64, 24000, 12000)).toBe(0);
    });

    it('à 65 ans : la rente PRIVÉE entre, les retraits FERR PAS ENCORE (gate 72, dérivé de taxJanuary)', () => {
        // Les deux gates sont DISTINCTS et c'est le cœur de la règle : les confondre accorderait le
        // crédit sur les retraits sept ans trop tôt (mesuré ailleurs : +6 508 $ sur 22 personas).
        expect(eligiblePensionRealFor(65, 24000, 12000)).toBe(24000);
    });

    it('à 72 ans : les deux', () => {
        expect(eligiblePensionRealFor(72, 24000, 12000)).toBe(36000);
    });

    it('une valeur négative ne crédite rien (clamp par terme, pas sur la somme)', () => {
        expect(eligiblePensionRealFor(75, -5000, 12000)).toBe(12000);
    });
});

describe('[FISC-LATENT-PENSION-CREDIT] câblage — on OBSERVE l\'argument', () => {
    const espionner = (ctx: LatentTaxCtx) => {
        const vus: AgeCreditOptions[] = [];
        const spy = vi.fn((g: number, r: number, f: number, y: number, s: boolean,
                           o?: AgeCreditOptions, e?: number, d?: number) => {
            if (o) vus.push(o);
            return calculateFiscalReport(g, r, f, y, s, o, e, d);
        });
        computeLatentTax(ctx, spy);
        return vus;
    };

    it('l\'assiette transmise vaut la rente DB ANNUALISÉE et déflatée, sur les DEUX appels de la bande', () => {
        const vus = espionner(retraite());
        // Anti-vacuité : la bande produit deux appels (base, puis liquidation totale).
        expect(vus.length, 'les deux appels de la bande doivent être observés').toBe(2);
        for (const o of vus) expect(o.eligiblePensionIncome).toBe(2000 * 12);
    });

    it('l\'assiette est DÉFLATÉE comme le revenu — sinon elle serait comparée à des dollars d\'une autre année', () => {
        // 10 ans à 2 % ⇒ facteur 1,02^10. Le module travaille en dollars RÉELS : une assiette laissée
        // en nominal sur-créditerait, et l'écart grandirait avec l'horizon.
        const facteur = Math.pow(1.02, 10);
        const vus = espionner(retraite({ m: 120, simInflation: 2 }));
        for (const o of vus) expect(o.eligiblePensionIncome).toBeCloseTo((2000 * 12) / facteur, 6);
    });

    it('sous 65 ans, aucune assiette n\'est transmise même avec une rente DB', () => {
        const vus = espionner(retraite({ ages: [64] }));
        for (const o of vus) expect(o.eligiblePensionIncome).toBe(0);
    });

    it('INVERSÉ (lot 200) — la moitié FERR ARRIVE : à 75 ans, l\'assiette vaut rente DB + retraits FERR de l\'année', () => {
        // Ce cas était l'INVENTAIRE DE DETTE du lot 86 : il affirmait que l'assiette vaut EXACTEMENT la
        // rente DB, et devait mourir quand la moitié FERR arriverait. Elle est arrivée par
        // `ferrAnnualPerUser` (retrait obligatoire de l'année, fixé en janvier — pas l'accumulateur
        // année-à-date qui bloquait). Inversé ici même, avec son histoire
        // (`UN-TEST-DE-LIMITE-S-INVERSE-IL-NE-SE-SUPPRIME-PAS`).
        const vus = espionner(retraite({ ages: [75], ferrAnnualPerUser: [12000] }));
        expect(vus.length).toBe(2);
        for (const o of vus) expect(o.eligiblePensionIncome).toBe(2000 * 12 + 12000);
    });

    it('à 70 ans, les retraits FERR transmis ne comptent PAS (gate 72, dérivé de taxJanuary)', () => {
        const vus = espionner(retraite({ ages: [70], ferrAnnualPerUser: [12000] }));
        for (const o of vus) expect(o.eligiblePensionIncome).toBe(2000 * 12);
    });

    it('sans `ferrAnnualPerUser`, l\'assiette reste la rente DB seule — bit-identique au lot 86', () => {
        const vus = espionner(retraite({ ages: [75] }));
        for (const o of vus) expect(o.eligiblePensionIncome).toBe(2000 * 12);
    });

    it('la moitié FERR est DÉFLATÉE comme la rente DB (dollars réels)', () => {
        // m = 24 à 2 % : facteur 1,0404. Les deux moitiés sont divisées par le même facteur.
        const vus = espionner(retraite({ ages: [75], m: 24, simInflation: 2, ferrAnnualPerUser: [10404] }));
        for (const o of vus) expect(o.eligiblePensionIncome).toBeCloseTo(24000 / 1.0404 + 10000, 6);
    });
});

describe('[FISC-LATENT-PENSION-CREDIT] effet publié — le SIGNE dépend du revenu de base', () => {
    const latent = (ctx: LatentTaxCtx): number => computeLatentTax(ctx, calculateFiscalReport);
    const latentSansPension = (ctx: LatentTaxCtx): number => computeLatentTax(ctx, sansPension);

    it('sans `dbPensionPerUserMonthly`, résultat bit-identique au barème sans crédit de pension', () => {
        const ctx = retraite({ dbPensionPerUserMonthly: undefined });
        expect(latent(ctx)).toBe(latentSansPension(ctx));
    });

    it('avec la rente, le résultat CHANGE (anti-vacuité du test précédent)', () => {
        const ctx = retraite();
        expect(latent(ctx)).not.toBe(latentSansPension(ctx));
    });

    it('revenu de base FAIBLE : la dette latente DIMINUE — le crédit fédéral est perdu sur la base', () => {
        // L'impôt de base est déjà nul : le crédit fédéral (non testé au revenu) n'y sert à rien et
        // ne joue que sur la liquidation. Mesuré : −250,50 $ de dette en moins.
        const ctx = retraite({ incomeRetirement: 12000 / 12 });
        expect(latent(ctx)).toBeGreaterThan(latentSansPension(ctx)); // moins négatif = moins de dette
    });

    it('revenu de base MOYEN : la dette latente AUGMENTE — le montant québécois survit sur la base', () => {
        // La ligne 361 QC est testée au revenu : elle survit sur la base et est écrasée par la
        // liquidation, donc la bande incrémentale la facture. Mesuré : +280 $ à 2 000 $ d'assiette,
        // +428 $ dès 3 058 $ (le plafond québécois). On asserte les SIGNES, jamais les montants —
        // ancrés, ils seraient une bombe à la prochaine indexation.
        const ctx = retraite({ incomeRetirement: 40000 / 12 });
        expect(latent(ctx)).toBeLessThan(latentSansPension(ctx));
    });
});
