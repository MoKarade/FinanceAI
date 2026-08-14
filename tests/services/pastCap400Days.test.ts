// tests/services/pastCap400Days.test.ts
//
// [PASSE-REEL-CAP-400J] — le trou muet dans la courbe passée, signalé par Marc le 2026-08-14 :
// « je vois plus mon historique entre 2026-01-10 et 2026-08, je peux pas sélectionner dans la
// courbe ».
//
// CAUSE, confirmée au JOUR PRÈS : `reconstructPortfolioHistoryDaily` plafonnait à 400 jours et
// rendait les 400 PREMIERS. L'historique de Marc démarre le 2024-12-06 ; 2024-12-06 + 399 jours
// = 2026-01-09, donc le premier jour sans valeur de placements est le 2026-01-10 — sa date exacte.
// Au-delà, `buildDailyPastLedger` SAUTE la journée (`if (!c || !i) continue`) : ni tracée, ni
// cliquable. Le commentaire du code promettait pourtant que « l'appelant le voit à la longueur » —
// aucun appelant ne comparait quoi que ce soit.
import { describe, it, expect } from 'vitest';
import {
    reconstructPortfolioHistoryDaily, holdingsAt, priceAt, MAX_DAILY_DAYS_DEFAULT,
    type MinimalAsset,
} from '../../services/history/reconstructPortfolioHistory';

const jours = (n: number, from: string) => {
    const out: string[] = [];
    const d = new Date(`${from}T00:00:00Z`);
    for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
    return out;
};

/** Portefeuille adossé au cas réel : historique démarrant le 2024-12-06. */
const DEBUT = '2024-12-06';
const HIST = jours(700, DEBUT);
const actifs: MinimalAsset[] = [
    {
        symbol: 'VFV', quantity: 100, currency: 'CAD', currentPrice: 130, accountType: 'CELI',
        purchases: [{ date: DEBUT, quantity: 100, price: 100 }],
        priceHistory: HIST.map((date, k) => ({ date, price: 100 + (k % 30) })),
    },
    {
        symbol: 'XEQT', quantity: 50, currency: 'USD', currentPrice: 40, accountType: 'REER',
        purchases: [{ date: '2025-03-14', quantity: 50, price: 32 }],
        priceHistory: HIST.map((date, k) => ({ date, price: 32 + (k % 12) })),
    },
];

describe('[PASSE-REEL-CAP-400J] le plafond ne coupe plus la courbe de Marc', () => {
    it('le défaut couvre bien plus que 400 jours (la cause du trou)', () => {
        expect(MAX_DAILY_DAYS_DEFAULT, '400 jours = ~13 mois, trop court pour un historique réel')
            .toBeGreaterThan(3000);
    });

    // ⚠️ CE TEST EST LE BUG DE MARC, tel quel. Sur le code d'avant il ÉCHOUE : la reconstruction
    // s'arrête au 2026-01-09 et le 2026-01-10 n'existe pas.
    it('le 2026-01-10 existe — la date exacte où sa courbe s’interrompait', () => {
        const out = reconstructPortfolioHistoryDaily(actifs, { USD: 1.35 }, DEBUT, '2026-08-14');
        const dates = new Set(out.map((p) => p.date));
        expect(dates.has('2026-01-09'), 'la veille était déjà couverte').toBe(true);
        expect(dates.has('2026-01-10'), 'PREMIER jour perdu par le plafond de 400').toBe(true);
        expect(dates.has('2026-08-14'), 'jusqu’à aujourd’hui').toBe(true);
    });

    it('aucun trou : chaque jour de la fenêtre est reconstruit', () => {
        const out = reconstructPortfolioHistoryDaily(actifs, { USD: 1.35 }, DEBUT, '2026-08-14');
        const attendus = jours(
            Math.round((Date.parse('2026-08-14T00:00:00Z') - Date.parse(`${DEBUT}T00:00:00Z`)) / 86_400_000) + 1,
            DEBUT,
        );
        expect(out.map((p) => p.date)).toEqual(attendus);
    });

    it('le plafond, quand il mord vraiment, rend les N PREMIERS jours (contrat inchangé)', () => {
        const out = reconstructPortfolioHistoryDaily(actifs, {}, DEBUT, '2026-08-14', { maxDays: 10 });
        expect(out).toHaveLength(10);
        expect(out[0].date).toBe(DEBUT);
        expect(out[9].date).toBe('2024-12-15');
    });
});

// ── L'optimisation ne change PAS le résultat ──────────────────────────────────────────────────
// La boucle passait de « rebalayer tout l'historique de prix par actif ET par jour » à un curseur
// qui n'avance jamais en arrière. MESURÉ : 1 993 ms → 37 ms sur 1 687 jours × 25 titres (54×).
// Un gain pareil ne vaut RIEN s'il déplace un chiffre : on compare donc la sortie du curseur aux
// helpers `holdingsAt` / `priceAt`, restés INCHANGÉS et partagés avec la reconstruction mensuelle.
describe('[PASSE-REEL-CAP-400J] le curseur donne exactement ce que donnaient les helpers', () => {
    it('valeur par compte identique, jour par jour, sur toute la fenêtre', () => {
        const fx = { USD: 1.35 };
        const out = reconstructPortfolioHistoryDaily(actifs, fx, DEBUT, '2026-08-14');
        expect(out.length).toBeGreaterThan(600);

        for (const point of out) {
            const attendu: Record<string, number> = { CELI: 0, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0 };
            for (const a of actifs) {
                const qty = holdingsAt(a, point.date);
                if (qty === 0) continue;
                const prix = priceAt(a, point.date) ?? a.currentPrice ?? 0;
                const taux = a.currency === 'CAD' ? 1 : (fx[a.currency as keyof typeof fx] ?? 1);
                const cle = a.accountType === 'CELI' ? 'CELI' : a.accountType === 'REER' ? 'REER' : 'NonReg';
                attendu[cle] += qty * prix * taux;
            }
            expect(point.CELI, `CELI au ${point.date}`).toBeCloseTo(attendu.CELI, 6);
            expect(point.REER, `REER au ${point.date}`).toBeCloseTo(attendu.REER, 6);
        }
    });

    // Un actif SANS `purchases` prend la branche `dateBought` — un chemin distinct du curseur
    // d'achats, et donc une occasion distincte de diverger.
    it('même résultat pour un actif sans `purchases` (branche dateBought)', () => {
        const sansAchats: MinimalAsset[] = [{
            symbol: 'OLD', quantity: 10, currency: 'CAD', currentPrice: 7, accountType: 'NON-ENREG',
            dateBought: '2025-06-01',
            priceHistory: HIST.map((date, k) => ({ date, price: 5 + (k % 3) })),
        }];
        const out = reconstructPortfolioHistoryDaily(sansAchats, {}, DEBUT, '2026-08-14');
        for (const point of out) {
            const qty = holdingsAt(sansAchats[0], point.date);
            const prix = priceAt(sansAchats[0], point.date) ?? 7;
            expect(point.NonReg, `NonReg au ${point.date}`).toBeCloseTo(qty * prix, 6);
        }
        // Avant la date d'achat : détention nulle, donc valeur nulle — pas un prix appliqué à 0 titre.
        expect(out.find((p) => p.date === '2025-05-31')!.NonReg).toBe(0);
        expect(out.find((p) => p.date === '2025-06-01')!.NonReg).toBeGreaterThan(0);
    });

    // Le curseur d'historique ne doit jamais reculer : un historique NON TRIÉ en entrée le
    // mettrait en défaut si on ne le triait pas d'abord. Le tri est fait — ce test le prouve.
    it('un historique de prix non trié donne le même résultat qu’un trié', () => {
        const melange: MinimalAsset[] = [{
            symbol: 'MIX', quantity: 1, currency: 'CAD', currentPrice: 999, accountType: 'CELI',
            purchases: [{ date: DEBUT, quantity: 1, price: 1 }],
            priceHistory: [...HIST.map((date, k) => ({ date, price: 10 + (k % 7) }))].reverse(),
        }];
        const out = reconstructPortfolioHistoryDaily(melange, {}, DEBUT, '2026-08-14');
        for (const point of out) {
            expect(point.CELI, `CELI au ${point.date}`).toBeCloseTo(priceAt(melange[0], point.date) ?? 999, 6);
        }
    });
});
