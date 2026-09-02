// tests/services/latentTaxAgeCredits.test.ts
//
// [FISC-BANDES-FRERES-SANS-AGEOPTS] L'impôt latent ignorait les crédits liés à l'ÂGE : le paramètre
// d'options était typé `undefined` dans ce module, donc l'information ne POUVAIT pas passer.
//
// Mécanisme (mesuré, pas déduit) : le crédit d'âge réduit la facture de BASE mais pas celle de la
// LIQUIDATION TOTALE (il est récupéré aux revenus élevés). L'impôt latent EST l'écart entre les
// deux — l'omettre le rétrécit, donc SOUS-ESTIME la dette fiscale et SURESTIME le patrimoine net
// d'impôt affiché. Mesuré sur le scénario ci-dessous : **1 854 $ par déclarant de 65 ans et plus**.
//
// ⚠️ Ce que ce lot ne fait PAS, et pourquoi : `eligiblePensionIncome` n'est pas transmis. Sa bonne
// assiette (rente DB dès 65 ans + retraits FERR dès 72) vit dans `taxDecember` et n'est pas
// disponible ici ; y mettre les rentes publiques serait un SUR-crédit — exactement le défaut que le
// commentaire de `eligiblePensionFor` raconte avoir corrigé. Mesuré : 280 $ de plus par déclarant,
// routé en `[FISC-LATENT-PENSION-CREDIT]`.

import { describe, it, expect, vi } from 'vitest';
import { computeLatentTax, type LatentTaxCtx } from '../../services/projection/latentTax';
import { calculateFiscalReport } from '../../utils/tax';

const RETRAITE: Omit<LatentTaxCtx, 'ages' | 'activeUsersCount'> = {
    m: 0, loopYear: 2026, simInflation: 2, simSalaryGrowth: 2,
    isRetired: true,
    grossMarcBaseAnnual: 0, grossAnnaBaseAnnual: 0,
    accRentesYear: 24_000, incomeRetirement: 2_000,
    reer: 400_000, nonReg: 200_000, nonRegACB: 120_000,
    crypto: 0, cryptoACB: 0, realEstateLatentGain: 0, enableMonteCarlo: false,
};
const latent = (ctx: Partial<LatentTaxCtx> & { activeUsersCount: number }): number =>
    computeLatentTax({ ...RETRAITE, ...ctx }, calculateFiscalReport);

describe('[FISC-BANDES-FRERES-SANS-AGEOPTS] l’impôt latent tient compte de l’âge', () => {
    it('SANS `ages` : identique à un cas SANS crédit (rétrocompat, à 1 ET à 2 déclarants)', () => {
        // Le contrat des fixtures existantes : ne rien dire de l'âge ⇒ ne rien changer. C'est ce cas
        // qui autorise à ne pas re-baser les 22 appels de test déjà en place.
        //
        // ⚠️ Volontairement PAS un montant épinglé : ancrer un chiffre fiscal au dollar en fait une
        // bombe à la prochaine indexation du barème. On compare deux EXÉCUTIONS — absence d'âges vs
        // âges sans effet — et l'égalité vaut quel que soit le barème. Le cas à 2 déclarants
        // exerce en plus la boucle : la somme de N déclarations identiques vaut l'ancien produit.
        expect(latent({ activeUsersCount: 1 })).toBeCloseTo(latent({ activeUsersCount: 1, ages: [60] }), 6);
        expect(latent({ activeUsersCount: 2 })).toBeCloseTo(latent({ activeUsersCount: 2, ages: [60, 60] }), 6);
    });

    it('65 ans et plus : la dette fiscale latente AUGMENTE (elle était sous-estimée)', () => {
        const sans = latent({ activeUsersCount: 1 });
        const avec = latent({ activeUsersCount: 1, ages: [70] });
        expect(avec).toBeLessThan(sans);                    // plus négatif = plus de dette latente
        expect(sans - avec).toBeGreaterThan(1_500);         // ordre de grandeur mesuré : ~1 854 $
        expect(sans - avec).toBeLessThan(2_200);
    });

    it('SOUS 65 ans : aucun effet — on transmet la VÉRITÉ, pas une hypothèse « 65+ »', () => {
        // Le ticket parlait de « contextes par définition 65+ ». Faux : une retraite peut commencer
        // à 55 ans. Transmettre l'âge réel se limite tout seul, `calculateAgeAndPensionCredits`
        // appliquant le seuil — et c'est ce qui rend le correctif sûr.
        expect(latent({ activeUsersCount: 1, ages: [60] })).toBeCloseTo(latent({ activeUsersCount: 1 }), 6);
    });

    it('le statut CONJOINT voyage avec l’âge (sinon un couple est sur-crédité)', () => {
        // ⚠️ Première version de ce test : comparer un couple à « deux fois un solo ». VACUEUSE —
        // la perturbation l'a dit : retirer `hasSpouse` la laissait VERTE, parce que les deux
        // valeurs diffèrent DÉJÀ par le revenu par déclarant (base/2 contre base/1). Deux
        // grandeurs qui diffèrent pour une autre raison ne mesurent pas la variable visée.
        //
        // On OBSERVE donc l'argument, au lieu de le déduire d'un écart : le statut conjugal doit
        // accompagner l'âge, sinon `AgeCreditOptions` traite l'absence comme « vit seul » et ajoute
        // le montant québécois correspondant (~305 $/déclarant de sur-crédit).
        const vus: Array<{ age?: number; hasSpouse?: boolean } | undefined> = [];
        const espion = ((g: number, r: number, f: number, y: number, s: boolean,
            o?: { age?: number; hasSpouse?: boolean }, e?: number, d?: number) => {
            vus.push(o);
            return calculateFiscalReport(g, r, f, y, s, o, e, d);
        }) as typeof calculateFiscalReport;

        computeLatentTax({ ...RETRAITE, activeUsersCount: 2, ages: [70, 68] }, espion);
        expect(vus.length, 'aucune déclaration calculée — fixture inopérante').toBeGreaterThan(0);
        expect(vus.every((o) => o?.hasSpouse === true), 'un couple sans `hasSpouse` est sur-crédité').toBe(true);
        expect(vus.map((o) => o?.age)).toContain(68); // l'âge du CONJOINT voyage aussi

        vus.length = 0;
        computeLatentTax({ ...RETRAITE, activeUsersCount: 1, ages: [70] }, espion);
        expect(vus.every((o) => o?.hasSpouse === false), 'un déclarant seul perdrait son montant « vivant seul »').toBe(true);
    });

    it('LEVIER par déclarant : deux âges DIFFÉRENTS ne donnent pas le même résultat que deux égaux', () => {
        // Sans la boucle par déclarant, l'âge du conjoint serait ignoré et ces deux valeurs
        // seraient identiques — c'est ce cas qui prouve que la boucle n'est pas décorative.
        const memeAge = latent({ activeUsersCount: 2, ages: [70, 70] });
        const agesDifferents = latent({ activeUsersCount: 2, ages: [70, 60] });
        expect(agesDifferents).not.toBeCloseTo(memeAge, 0);
    });

    it('anti-vacuité : la grandeur mesurée est bien NON NULLE et négative', () => {
        expect(latent({ activeUsersCount: 1, ages: [70] })).toBeLessThan(-100_000);
    });
});

describe('[FISC-BANDES-FRERES-SANS-AGEOPTS] le moteur transmet RÉELLEMENT les âges', () => {
    it('la boucle passe les âges projetés des déclarants (observation de l’ARGUMENT, pas de sa copie)', async () => {
        // Un test au CONTRAT du module ne dit rien de ce que l'appelant lui passe. On OBSERVE donc
        // l'argument via un espion, plutôt que de reconstruire l'expression attendue (un test qui
        // recopie le code testé teste sa copie).
        vi.resetModules();
        const espion = vi.fn((_ctx: unknown) => -1);
        vi.doMock('../../services/projection/latentTax', () => ({ computeLatentTax: espion }));
        const { __runScenarioForTests } = await import('../../services/projection');
        const { PROJECTION, CONFIG, PARAMS } = await import('./fixtures/latentAgesFixture');
        void PROJECTION; void CONFIG;
        __runScenarioForTests(PARAMS, 'AUTO_MARGINAL' as never, false, false);
        vi.doUnmock('../../services/projection/latentTax');

        expect(espion, 'le calcul d’impôt latent n’a pas été appelé — fixture inopérante').toHaveBeenCalled();
        const ctx = espion.mock.calls[0]?.[0] as unknown as LatentTaxCtx;
        expect(Array.isArray(ctx.ages), '`ages` n’est pas transmis par le moteur').toBe(true);
        // user1 a 64 ans au départ dans la fixture → 64 au mois 0.
        expect(ctx.ages?.[0]).toBe(64);
        expect(ctx.ages?.[1]).toBe(62);
    });
});
