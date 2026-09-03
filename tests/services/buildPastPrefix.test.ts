import { describe, it, expect } from 'vitest';
import { buildPastPrefix } from '../../services/history/buildPastPrefix';
import type { PortfolioHistoryPoint } from '../../services/history/reconstructPortfolioHistory';

// [FUTUR-HIST-WIRING-TEST] Prouve le CÂBLAGE money-critical du segment passé (extrait en fonction pure) :
// buckets → helper, dette COURANTE soustraite (Option A), alignement des dates, gate no-fake `hasNW`.
// Verrouille contre une substitution accidentelle `DetteTotale` (finding code-reviewer PR #513).

const invPoint = (date: string, o: Partial<PortfolioHistoryPoint> = {}): PortfolioHistoryPoint => ({
    date, monthIndex: 0, CELI: 0, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0, InvestedValue: 0, ...o,
});

describe('[FUTUR-HIST-WIRING-TEST] buildPastPrefix', () => {
    // startYear/startMonth = janvier 2026 (mois 0). '2025-12' → mi=-1, '2025-11' → mi=-2.
    const base = {
        startYear: 2026, startMonth: 0,
        realEstateGoals: [],
        // 1 vraie transaction en 2025-12 → firstMonth = 2025-12 (firstTxnMi = -1).
        transactions: [{ date: '2025-12-15', amount: -500 }],
        calculatedStartingCash: 3000,
    };

    it('soustrait la dette COURANTE du patrimoine net (Option A) — reconstructabilité exacte', () => {
        const out = buildPastPrefix({
            ...base,
            pastHistoryPoints: [invPoint('2025-12-31', { CELI: 10_000, REER: 5_000, NonReg: 2_000, Crypto: 1_000 })],
            currentDebtNonImmo: 8_000, debts: [{ balance: 8_000 }],
        }).points;
        const last = out[out.length - 1];
        expect(last.monthIndex).toBe(-1);
        // Σ placements (18 000) + cash (3 000) + immo (0) − dette (8 000) = 13 000.
        expect(last.NetWorth).toBe(13_000);
        // Reconstructabilité (INV-9 étendu au passé) : NW == Σ colonnes − dette.
        const cols = last.Liquidites + last.Immobilier + last.CELI + last.CELIAPP + last.REER + last.REEE + last.NonReg + last.Crypto;
        expect(cols - 8_000).toBe(last.NetWorth);
    });

    it('[discriminant] la dette réduit le NW d\'EXACTEMENT son montant (vs dette 0 = ancien comportement gonflé)', () => {
        const pts = [invPoint('2025-12-31', { CELI: 10_000, REER: 5_000, NonReg: 2_000, Crypto: 1_000 })];
        const avecDette = buildPastPrefix({ ...base, pastHistoryPoints: pts, currentDebtNonImmo: 8_000, debts: [{ balance: 8_000 }] }).points;
        const sansDette = buildPastPrefix({ ...base, pastHistoryPoints: pts, currentDebtNonImmo: 0, debts: [] }).points;
        const nwAvec = avecDette[avecDette.length - 1].NetWorth!;
        const nwSans = sansDette[sansDette.length - 1].NetWorth!;
        expect(nwSans).toBe(21_000); // gonflé (sans dette) = l'ancien bug MONEY-PHANTOM
        expect(nwSans - nwAvec).toBe(8_000);
    });

    it('mappe les buckets 1:1 (CELI/CELIAPP/REER/REEE/NonReg/Crypto passés au bon champ)', () => {
        const out = buildPastPrefix({
            ...base,
            pastHistoryPoints: [invPoint('2025-12-31', { CELI: 1, CELIAPP: 2, REER: 3, REEE: 4, NonReg: 5, Crypto: 6 })],
            currentDebtNonImmo: 0, debts: [],
        }).points;
        const last = out[out.length - 1];
        expect([last.CELI, last.CELIAPP, last.REER, last.REEE, last.NonReg, last.Crypto]).toEqual([1, 2, 3, 4, 5, 6]);
        // NW = 1+2+3+4+5+6 (21) + cash 3000 = 3021.
        expect(last.NetWorth).toBe(3_021);
    });

    it('no-fake : avant la 1re transaction (mi < firstTxnMi) → NetWorth undefined + Liquidites 0', () => {
        const out = buildPastPrefix({
            ...base,
            // point placement à 2025-11 (mi=-2) < firstMonth 2025-12 (firstTxnMi=-1).
            pastHistoryPoints: [
                invPoint('2025-11-30', { CELI: 9_000 }),
                invPoint('2025-12-31', { CELI: 10_000 }),
            ],
            currentDebtNonImmo: 0, debts: [],
        }).points;
        const at2 = out.find(p => p.monthIndex === -2)!;
        const at1 = out.find(p => p.monthIndex === -1)!;
        expect(at2.NetWorth).toBeUndefined(); // avant la 1re transaction connue
        expect(at2.Liquidites).toBe(0);
        expect(at1.NetWorth).toBe(13_000); // 10 000 + cash 3 000
        expect(at1.dateLabel).toBe('2025-12');
    });

    it('aucun passé connu → []', () => {
        expect(buildPastPrefix({ ...base, transactions: [], pastHistoryPoints: [], currentDebtNonImmo: 0, debts: [] }).points).toEqual([]);
    });

    it('[PASSE-REEL-DETTE-1, discriminant] une dette n\'est soustraite qu\'À PARTIR de son startDate propre', () => {
        const pts = [
            invPoint('2025-11-30', { CELI: 10_000 }),
            invPoint('2025-12-31', { CELI: 10_000 }),
        ];
        const out = buildPastPrefix({
            ...base,
            transactions: [{ date: '2025-11-05', amount: -100 }], // firstTxnMi = -2 (nov 2025)
            pastHistoryPoints: pts,
            // currentDebtNonImmo = ce que le moteur publierait AUJOURD'HUI (la dette est déjà active
            // depuis le 1er décembre, donc déjà incluse dans ce total, comme le ferait sumActiveDebts).
            currentDebtNonImmo: 8_000,
            debts: [{ balance: 8_000, startDate: '2025-12-01' }],
        }).points;
        const nov = out.find(p => p.monthIndex === -2)!; // AVANT le début de la dette
        const dec = out.find(p => p.monthIndex === -1)!; // dette déjà commencée
        // Sur l'ANCIEN code (currentDebtNonImmo appliqué à TOUT le passé sans gating), nov.NetWorth
        // aurait été 5 000 (10 000 + 3 000 − 8 000) — exactement le bug signalé par Marc (dette vue
        // avant sa date). Avec le gating (delta retranché de currentDebtNonImmo, cf `debtSchedule.ts`) :
        expect(nov.NetWorth).toBe(13_000); // 10 000 + cash 3 000, PAS de dette (pas encore commencée)
        expect(dec.NetWorth).toBe(5_000); // 10 000 + cash 3 000 − 8 000, dette active depuis le 1er déc.
    });

    it('[PASSE-REEL-DETTE-1] une dette « terminée » (termEndDate dépassé) garde son solde au bilan', () => {
        const pts = [invPoint('2025-12-31', { CELI: 10_000 })];
        const out = buildPastPrefix({
            ...base,
            pastHistoryPoints: pts,
            // Le moteur (sumActiveDebts) n'exclut QUE 'a-venir', jamais 'terminee' : currentDebtNonImmo
            // inclut donc toujours cette dette, terme échu ou pas — jamais effacée en silence.
            currentDebtNonImmo: 8_000,
            debts: [{ balance: 8_000, termEndDate: '2020-01-01' }],
        }).points;
        const last = out[out.length - 1];
        expect(last.NetWorth).toBe(13_000 - 8_000);
    });

    it('[CRITIQUE, revue #687] une dette pas-encore-commencée AUJOURD\'HUI ne réduit JAMAIS le passé', () => {
        // Régression trouvée indépendamment par financial-integrity ET code-reviewer : le 1er jet
        // retranchait cette dette (10 000 $) de CHAQUE point passé alors qu'elle n'a jamais fait
        // partie de `currentDebtNonImmo` (le moteur l'exclut déjà de sumActiveDebts AUJOURD'HUI) —
        // fabriquant 10 000 $ de patrimoine passé (le signe INVERSE du bug initial de Marc).
        const pts = [
            invPoint('2025-11-30', { CELI: 10_000 }),
            invPoint('2025-12-31', { CELI: 10_000 }),
        ];
        const avecDetteFuture = buildPastPrefix({
            ...base,
            transactions: [{ date: '2025-11-05', amount: -100 }],
            pastHistoryPoints: pts,
            currentDebtNonImmo: 0, // le moteur l'exclut déjà AUJOURD'HUI — 0, pas 10 000
            debts: [{ balance: 10_000, startDate: '2028-01-01' }], // encore À VENIR même aujourd'hui
        }).points;
        const sansCetteDette = buildPastPrefix({
            ...base,
            transactions: [{ date: '2025-11-05', amount: -100 }],
            pastHistoryPoints: pts,
            currentDebtNonImmo: 0, debts: [],
        }).points;
        // Identique au cas SANS la dette — elle n'existe encore nulle part, ni aujourd'hui ni avant.
        expect(avecDetteFuture.map(q => q.NetWorth)).toEqual(sansCetteDette.map(q => q.NetWorth));
    });

    it('[ÉLEVÉ, revue #687] une dette gatée à un solde BRUT > sa part post-amortissement dans currentDebtNonImmo ne rend jamais le total négatif (clamp)', () => {
        // Le delta soustrait le solde BRUT (8 000 $) d'une dette dont `currentDebtNonImmo` (le total
        // publié par le moteur AUJOURD'HUI) reflète déjà un pas d'amortissement — ici, plus bas que
        // le solde brut d'origine (7 800 $ < 8 000 $, cas le plus défavorable : cette dette est la
        // SEULE dette du ménage).
        const pts = [
            invPoint('2025-11-30', { CELI: 10_000 }),
            invPoint('2025-12-31', { CELI: 10_000 }),
        ];
        const out = buildPastPrefix({
            ...base,
            transactions: [{ date: '2025-11-05', amount: -100 }], // firstTxnMi = -2 (nov 2025)
            pastHistoryPoints: pts,
            currentDebtNonImmo: 7_800, // < 8 000 (solde brut) — le pas d'amortissement du mois 0 a réduit le total
            debts: [{ balance: 8_000, startDate: '2025-12-01' }], // déjà active aujourd'hui, PAS ENCORE au mois de nov (gatée)
        }).points;
        const nov = out.find(p => p.monthIndex === -2)!; // dette gatée ⇒ delta = 8 000 brut > 7 800 (currentDebtNonImmo)
        const dec = out.find(p => p.monthIndex === -1)!; // dette déjà active ⇒ delta = 0
        const detteDe = (p: typeof nov) => p.Liquidites + p.Immobilier + p.CELI + p.CELIAPP + p.REER + p.REEE + p.NonReg + p.Crypto - (p.NetWorth as number);
        // Sans clamp, nov aurait une dette de 7 800 − 8 000 = −200 $ (patrimoine gonflé). Avec le
        // clamp : 0, jamais négative.
        expect(detteDe(nov)).toBe(0);
        expect(detteDe(dec)).toBe(7_800);
    });
});
