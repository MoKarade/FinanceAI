// tests/services/celiNudge.test.ts
// [CELI-ASSET-NUDGE] — détection « virements CELI mais aucun avoir CELI ». NO-FAKE-DATA : le total
// viré est un CONTEXTE (coût cumulé), jamais un solde. On teste la détection, le seuil, et les
// non-régressions (mode « a un CELI » → pas de nudge ; virements entrants ignorés).

import { describe, it, expect } from 'vitest';
import { computeCeliNudgeStatus, CELI_NUDGE_MIN_TRANSFERRED } from '../../services/celiNudge';
import type { Transaction, Asset } from '../../types';

let _id = 0;
const tx = (payee: string, amount: number, over: Partial<Transaction> = {}): Transaction => ({
    id: ++_id, date: '2025-06-01', payee, amount, category: 'Transfert', status: 'processed', ...over,
});
const celiAsset = (): Asset => ({
    symbol: 'XEQT.TO', name: 'XEQT', quantity: 100, currentPrice: 30, currency: 'CAD',
    performance: 0, dateBought: '2025-01-01', accountType: 'CELI',
});
const nonRegAsset = (): Asset => ({ ...celiAsset(), accountType: 'NON-ENREG' });

describe('[CELI-ASSET-NUDGE] computeCeliNudgeStatus', () => {
    it('virements CELI significatifs + aucun avoir CELI → shouldShow, total viré exposé', () => {
        const s = computeCeliNudgeStatus(
            [tx('Transfert vers CELI - Wealthsimple', -800), tx('VIREMENT CELI Disnat', -1200)],
            [nonRegAsset()],
        );
        expect(s.shouldShow).toBe(true);
        expect(s.transferredTotal).toBe(2000);
        expect(s.hasCeliAssets).toBe(false);
    });

    it('a DÉJÀ un actif CELI → jamais de nudge (même avec des virements)', () => {
        const s = computeCeliNudgeStatus(
            [tx('Transfert vers CELI', -5000)],
            [celiAsset()],
        );
        expect(s.hasCeliAssets).toBe(true);
        expect(s.shouldShow).toBe(false);
    });

    it('sous le seuil → pas de nudge (bruit)', () => {
        const s = computeCeliNudgeStatus([tx('Cotisation CELI', -(CELI_NUDGE_MIN_TRANSFERRED - 1))], []);
        expect(s.shouldShow).toBe(false);
    });

    it('NO-FAKE-DATA : le total est un COÛT viré, pas dérivé en solde — entrants et non-CELI ignorés', () => {
        const s = computeCeliNudgeStatus(
            [
                tx('Transfert vers CELI', -1500),        // compte (sortant)
                tx('Retrait CELI vers compte', +900),    // ENTRANT → ignoré (pas une cotisation)
                tx('Épicerie Metro', -300),              // non-CELI → ignoré
                tx('Virement REER', -2000),              // autre compte → ignoré
            ],
            [],
        );
        expect(s.transferredTotal).toBe(1500);
        expect(s.shouldShow).toBe(true);
    });

    it('les transactions dupliquées ne comptent pas', () => {
        const s = computeCeliNudgeStatus(
            [tx('Transfert vers CELI', -1500), tx('Transfert vers CELI', -1500, { isDuplicate: true })],
            [],
        );
        expect(s.transferredTotal).toBe(1500);
    });

    it('TFSA (libellé anglais) reconnu comme CELI', () => {
        const s = computeCeliNudgeStatus([tx('Transfer to TFSA account', -2500)], []);
        expect(s.shouldShow).toBe(true);
        expect(s.transferredTotal).toBe(2500);
    });

    it('un montant NON FINI ne doit PAS empoisonner le total ni masquer le nudge (garde silent-failure)', () => {
        // NaN >= 0 est false → sans garde, la tx corrompue passait et `+= Math.abs(NaN)` rendait le
        // total NaN → shouldShow devenait false EN SILENCE malgré des virements CELI légitimes.
        const s = computeCeliNudgeStatus(
            [tx('Transfert vers CELI', -2000), tx('Transfert vers CELI', Number.NaN)],
            [],
        );
        expect(Number.isFinite(s.transferredTotal)).toBe(true);
        expect(s.transferredTotal).toBe(2000);
        expect(s.shouldShow).toBe(true);
    });

    it('aucun virement CELI → pas de nudge', () => {
        const s = computeCeliNudgeStatus([tx('Épicerie', -300), tx('Salaire', +3000)], []);
        expect(s.shouldShow).toBe(false);
        expect(s.transferredTotal).toBe(0);
    });
});
