import { describe, it, expect } from 'vitest';
import { reconstructPortfolioHistory, type MinimalAsset } from '../../services/history/reconstructPortfolioHistory';

const TODAY = new Date('2026-03-15T00:00:00Z');

describe('reconstructPortfolioHistory', () => {
    it('reconstruit la valeur marché passée avec les prix historiques (CAD)', () => {
        const assets: MinimalAsset[] = [{
            symbol: 'VFV', quantity: 10, currency: 'CAD', currentPrice: 130, accountType: 'CELI',
            purchases: [{ date: '2026-01-10', quantity: 10, price: 100 }],
            priceHistory: [
                { date: '2026-01-31', price: 100 },
                { date: '2026-02-28', price: 120 },
                { date: '2026-03-15', price: 130 },
            ],
        }];
        const r = reconstructPortfolioHistory(assets, { USD: 1.35, EUR: 1.5 }, { today: TODAY });
        // 3 mois : janv, févr, mars
        expect(r.points).toHaveLength(3);
        // janvier : 10 × 100 = 1000 dans CELI
        expect(r.points[0].CELI).toBe(1000);
        expect(r.points[0].monthIndex).toBe(-2);
        // février : 10 × 120 = 1200
        expect(r.points[1].CELI).toBe(1200);
        // mars (aujourd'hui) : 10 × 130 = 1300, monthIndex 0
        expect(r.points[2].CELI).toBe(1300);
        expect(r.points[2].monthIndex).toBe(0);
        expect(r.points[2].InvestedValue).toBe(1300);
        expect(r.coverage).toBe(1); // tout adossé à de vrais prix
        expect(r.firstDate).toBe('2026-01-10');
    });

    it('convertit les devises étrangères en CAD via fx', () => {
        const assets: MinimalAsset[] = [{
            symbol: 'VOO', quantity: 5, currency: 'USD', currentPrice: 400, accountType: 'REER',
            purchases: [{ date: '2026-02-01', quantity: 5, price: 400 }],
            priceHistory: [{ date: '2026-02-28', price: 400 }, { date: '2026-03-15', price: 400 }],
        }];
        const r = reconstructPortfolioHistory(assets, { USD: 1.35 }, { today: TODAY });
        // 5 × 400 × 1.35 = 2700
        expect(r.points[r.points.length - 1].REER).toBe(2700);
    });

    it('accumule les achats échelonnés (DCA)', () => {
        const assets: MinimalAsset[] = [{
            symbol: 'XEQT', quantity: 20, currency: 'CAD', currentPrice: 30, accountType: 'CELI',
            purchases: [
                { date: '2026-01-05', quantity: 10, price: 25 },
                { date: '2026-03-05', quantity: 10, price: 30 },
            ],
            priceHistory: [
                { date: '2026-01-31', price: 25 }, { date: '2026-02-28', price: 28 }, { date: '2026-03-15', price: 30 },
            ],
        }];
        const r = reconstructPortfolioHistory(assets, {}, { today: TODAY });
        expect(r.points[0].CELI).toBe(250);  // janv : 10 × 25
        expect(r.points[1].CELI).toBe(280);  // févr : 10 × 28 (2e achat pas encore)
        expect(r.points[2].CELI).toBe(600);  // mars : 20 × 30
    });

    it('signale une couverture < 1 quand l\'historique de prix manque', () => {
        const assets: MinimalAsset[] = [{
            symbol: 'ABC', quantity: 10, currency: 'CAD', currentPrice: 50, accountType: 'NON-ENREG',
            purchases: [{ date: '2026-01-10', quantity: 10, price: 50 }],
            // pas de priceHistory → retombe sur currentPrice
        }];
        const r = reconstructPortfolioHistory(assets, {}, { today: TODAY });
        expect(r.points[r.points.length - 1].NonReg).toBe(500); // 10 × 50 (prix actuel)
        expect(r.coverage).toBe(0); // 0 % adossé à de vrais prix
    });

    it('aucun avoir → résultat vide', () => {
        const r = reconstructPortfolioHistory([], {}, { today: TODAY });
        expect(r.points).toHaveLength(0);
        expect(r.firstDate).toBeNull();
    });
});
