/**
 * [FUTUR-DAILY] Valeur des placements par compte, JOUR par JOUR, sur une fenêtre.
 *
 * Deux choses comptent ici, et aucune n'est « ça rend des points » :
 *  1. la RÉCONCILIATION — le point du dernier jour d'un mois vaut le point mensuel de ce mois ;
 *  2. l'HONNÊTETÉ DU PLATEAU — un prix reconduit doit être signalé comme tel, parce qu'au-delà de
 *     12 mois le stockage est compressé à 1 point/semaine et qu'un plateau de 6 jours ressemble
 *     alors à une valeur stable observée alors que c'est de la donnée absente.
 */
import { describe, it, expect } from 'vitest';
import {
    reconstructPortfolioHistory,
    reconstructPortfolioHistoryDaily,
    type MinimalAsset,
} from '../../services/history/reconstructPortfolioHistory';

const FX = { CAD: 1, USD: 1.35 };

const asset = (over: Partial<MinimalAsset> = {}): MinimalAsset => ({
    quantity: 10,
    currency: 'CAD',
    currentPrice: 100,
    accountType: 'CELI',
    dateBought: '2026-01-01',
    priceHistory: [
        { date: '2026-01-01', price: 100 },
        { date: '2026-01-02', price: 110 },
        { date: '2026-01-05', price: 120 },
    ],
    ...over,
} as MinimalAsset);

describe('[FUTUR-DAILY] reconstructPortfolioHistoryDaily', () => {
    it('valorise chaque jour de la fenêtre, bornes INCLUSES', () => {
        const pts = reconstructPortfolioHistoryDaily([asset()], FX, '2026-01-01', '2026-01-05');
        expect(pts.map((p) => p.date)).toEqual([
            '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05',
        ]);
        expect(pts[0].CELI).toBe(1_000);   // 10 × 100
        expect(pts[1].CELI).toBe(1_100);   // 10 × 110
        expect(pts[4].CELI).toBe(1_200);   // 10 × 120
    });

    it('RECONDUIT le dernier close les jours sans cotation — et le SIGNALE', () => {
        // Les 3 et 4 janvier n'ont pas de close : la valeur reste celle du 2. C'est JUSTE (un close
        // est la valeur jusqu'au suivant), mais l'écran doit pouvoir distinguer « marché fermé » de
        // « donnée compressée » — d'où l'âge du prix, qui croît sur le plateau.
        const pts = reconstructPortfolioHistoryDaily([asset()], FX, '2026-01-01', '2026-01-05');
        expect(pts[2].CELI).toBe(1_100);              // 3 janvier : close du 2 reconduit
        expect(pts[2].priceAgeMaxDays).toBe(1);
        expect(pts[3].priceAgeMaxDays).toBe(2);       // 4 janvier : close vieux de 2 jours
        expect(pts[4].priceAgeMaxDays).toBe(0);       // 5 janvier : vrai close
    });

    it('INVARIANT — le dernier jour du mois vaut le point MENSUEL de ce mois', () => {
        const a = asset({
            dateBought: '2025-11-01',
            priceHistory: [
                { date: '2025-11-01', price: 50 },
                { date: '2025-12-15', price: 70 },
                { date: '2025-12-31', price: 80 },
            ],
        });
        const mensuel = reconstructPortfolioHistory([a], FX, { today: new Date('2026-01-15T00:00:00Z') });
        const pointDeDecembre = mensuel.points.find((p) => p.date === '2025-12-31');

        const quotidien = reconstructPortfolioHistoryDaily([a], FX, '2025-12-01', '2025-12-31');
        const dernierJour = quotidien.at(-1);

        expect(pointDeDecembre).toBeDefined();
        expect(dernierJour?.date).toBe('2025-12-31');
        expect(dernierJour?.CELI).toBeCloseTo(pointDeDecembre!.CELI, 2);
    });

    it('ventile par COMPTE — c’est la demande « voir chaque compte précisément »', () => {
        const pts = reconstructPortfolioHistoryDaily(
            [
                asset({ accountType: 'CELI', quantity: 10 }),
                asset({ accountType: 'REER', quantity: 5 }),
                asset({ accountType: 'NON-ENREG', quantity: 2 }),
            ],
            FX, '2026-01-02', '2026-01-02',
        );
        expect(pts[0].CELI).toBe(1_100);
        expect(pts[0].REER).toBe(550);
        expect(pts[0].NonReg).toBe(220);
        expect(pts[0].InvestedValue).toBe(1_870);
    });

    it('convertit les devises — un titre USD ne se somme jamais brut', () => {
        const pts = reconstructPortfolioHistoryDaily(
            [asset({ currency: 'USD', quantity: 1, priceHistory: [{ date: '2026-01-01', price: 100 }] })],
            FX, '2026-01-01', '2026-01-01',
        );
        expect(pts[0].CELI).toBeCloseTo(135, 6);
    });

    it('ne compte PAS un titre avant son achat', () => {
        const pts = reconstructPortfolioHistoryDaily(
            [asset({ dateBought: undefined, purchases: [{ date: '2026-01-04', quantity: 10, price: 100 }] })],
            FX, '2026-01-02', '2026-01-05',
        );
        expect(pts[0].CELI).toBe(0);   // 2 janvier : pas encore acheté
        expect(pts[2].CELI).toBe(1_100); // 4 janvier : acheté, close du 2 reconduit
    });

    it('SIGNALE une valorisation au prix ACTUEL faute d’historique', () => {
        // Sans le drapeau, un point estimé serait indiscernable d'un point mesuré — c'est
        // exactement le « 0 $ crédible » que le dépôt s'interdit, transposé à une courbe.
        const pts = reconstructPortfolioHistoryDaily(
            [asset({ priceHistory: [], currentPrice: 42 })],
            FX, '2026-01-02', '2026-01-02',
        );
        expect(pts[0].hasEstimatedPrice).toBe(true);
        expect(pts[0].CELI).toBe(420);
    });

    it('BORNE la fenêtre plutôt que de rendre 20 ans au jour', () => {
        const pts = reconstructPortfolioHistoryDaily([asset()], FX, '2026-01-01', '2027-01-01', { maxDays: 10 });
        expect(pts).toHaveLength(10);
        expect(pts.at(-1)?.date).toBe('2026-01-10');
    });

    it('fenêtre inversée ou date illisible → [] (pas une série vide déguisée)', () => {
        expect(reconstructPortfolioHistoryDaily([asset()], FX, '2026-01-05', '2026-01-01')).toEqual([]);
        expect(reconstructPortfolioHistoryDaily([asset()], FX, 'pas-une-date', '2026-01-01')).toEqual([]);
        expect(reconstructPortfolioHistoryDaily([], FX, '2026-01-01', '2026-01-05')).toEqual([]);
    });
});
