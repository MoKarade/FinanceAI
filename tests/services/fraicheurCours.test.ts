// [COURS-AU-TROMPEUR] L'âge réel d'un cours : date du dernier close, variation 24 h seulement si
// les deux closes sont récents. Chaque cas « affiché » a son jumeau « refusé ».
import { describe, it, expect } from 'vitest';
import {
    COURS_PERIME_APRES_JOURS,
    coursPerime,
    dateDernierCours,
    joursEntre,
    variation24hSerieSiRecente,
    variation24hTitreAffichable,
} from '../../services/history/fraicheurCours';
import { priceReturnPct, seriesReturnPct } from '../../services/history/periodReturn';
import type { MarketDataPoint } from '../../services/finance';

const AUJOURDHUI = '2026-10-16'; // vendredi

describe('joursEntre / dateDernierCours', () => {
    it('compte les jours calendaires et refuse une date illisible', () => {
        expect(joursEntre('2026-10-12', '2026-10-16')).toBe(4);
        expect(joursEntre('2026-10-16', '2026-10-16')).toBe(0);
        expect(joursEntre('pas-une-date', '2026-10-16')).toBeNull();
    });

    it('lit la date du DERNIER close, dans le désordre, et ignore les points inexploitables', () => {
        const hist = [
            { date: '2026-10-14', price: 12 },
            { date: '2026-10-02', price: 10 },
            { date: '2026-10-15', price: Number.NaN },
            { date: '2026-10-16', price: 0 },
        ];
        expect(dateDernierCours(hist)).toBe('2026-10-14');
    });

    it('rend null sans historique (titre manuel, GIC) : pas de date inventée', () => {
        expect(dateDernierCours(undefined)).toBeNull();
        expect(dateDernierCours([])).toBeNull();
    });
});

describe('coursPerime', () => {
    it('un close du jour ou du dernier week-end (3 j) n’est pas périmé', () => {
        expect(coursPerime('2026-10-16', AUJOURDHUI)).toBe(false);
        expect(coursPerime('2026-10-13', AUJOURDHUI)).toBe(false);
        expect(coursPerime('2026-10-12', AUJOURDHUI)).toBe(false); // exactement le seuil
    });

    it('un close de plus de 4 jours est périmé', () => {
        expect(COURS_PERIME_APRES_JOURS).toBe(4);
        expect(coursPerime('2026-10-11', AUJOURDHUI)).toBe(true);
        expect(coursPerime('2026-10-01', AUJOURDHUI)).toBe(true);
    });

    it('une date inconnue n’est PAS signalée périmée (inconnu ≠ périmé)', () => {
        expect(coursPerime(null, AUJOURDHUI)).toBe(false);
    });
});

describe('variation 24 h d’un titre', () => {
    const recents = [{ date: '2026-10-15', price: 100 }, { date: '2026-10-16', price: 102 }];
    const vieux = [{ date: '2026-10-01', price: 100 }, { date: '2026-10-02', price: 102 }];
    const ecartGrand = [{ date: '2026-10-05', price: 100 }, { date: '2026-10-16', price: 102 }];

    it('affichée quand les deux closes sont récents, et la valeur est celle de priceReturnPct', () => {
        expect(variation24hTitreAffichable(recents, AUJOURDHUI)).toBe(true);
        expect(priceReturnPct(recents, '24H')).toBeCloseTo(2, 6);
    });

    it('refusée quand le dernier close date de plusieurs jours (cours vieux de 2 semaines)', () => {
        expect(variation24hTitreAffichable(vieux, AUJOURDHUI)).toBe(false);
        // …alors que priceReturnPct, lui, rendrait bien un % : c'est la garde qui le retient.
        expect(priceReturnPct(vieux, '24H')).toBeCloseTo(2, 6);
    });

    it('refusée quand le dernier close est récent mais l’avant-dernier est trop loin', () => {
        expect(variation24hTitreAffichable(ecartGrand, AUJOURDHUI)).toBe(false);
    });

    it('refusée sans deux closes', () => {
        expect(variation24hTitreAffichable([{ date: '2026-10-16', price: 1 }], AUJOURDHUI)).toBe(false);
        expect(variation24hTitreAffichable(undefined, AUJOURDHUI)).toBe(false);
    });
});

describe('variation 24 h d’une série du marketData', () => {
    const ligne = (date: string, total: number) => ({ date, TOTAL: total }) as unknown as MarketDataPoint;

    it('rend le % de seriesReturnPct quand les deux points sont récents', () => {
        const rows = [ligne('2026-10-15', 1000), ligne('2026-10-16', 1010)];
        expect(variation24hSerieSiRecente(rows, 'TOTAL', AUJOURDHUI)).toBeCloseTo(1, 6);
        expect(variation24hSerieSiRecente(rows, 'TOTAL', AUJOURDHUI)).toBe(seriesReturnPct(rows, 'TOTAL', '24H'));
    });

    it('rend null quand la série s’arrête il y a plus de 4 jours (la variation d’il y a deux semaines n’est pas celle d’aujourd’hui)', () => {
        const rows = [ligne('2026-10-01', 1000), ligne('2026-10-02', 1010)];
        expect(seriesReturnPct(rows, 'TOTAL', '24H')).toBeCloseTo(1, 6);
        expect(variation24hSerieSiRecente(rows, 'TOTAL', AUJOURDHUI)).toBeNull();
    });

    it('rend null quand les deux points sont récents mais éloignés de plus de 4 jours', () => {
        const rows = [ligne('2026-10-05', 1000), ligne('2026-10-16', 1010)];
        expect(variation24hSerieSiRecente(rows, 'TOTAL', AUJOURDHUI)).toBeNull();
    });

    it('rend null sans série', () => {
        expect(variation24hSerieSiRecente([], 'TOTAL', AUJOURDHUI)).toBeNull();
    });
});
