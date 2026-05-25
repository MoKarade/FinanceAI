import { describe, it, expect, beforeEach } from 'vitest';
import { getInitialStateWithMigration } from '../../store/useFinanceStore';

// Consolidation persistance (2026-05-25) : `financeai-storage` (Zustand persist)
// est la source de vérité unique. Le lecteur legacy `app_*` ne sert plus qu'à
// l'import unique des utilisateurs d'avant persist. Ces tests prouvent que le
// comportement est préservé dans les 3 scénarios de boot — sans perte de données.
beforeEach(() => {
    localStorage.clear();
});

const legacyTx = JSON.stringify([{ id: 1, date: '2020-01-01', payee: 'Legacy', amount: -10 }]);

describe('getInitialStateWithMigration — consolidation persistance', () => {
    it('IGNORE les clés legacy app_* quand financeai-storage existe (persist = source de vérité)', () => {
        localStorage.setItem('financeai-storage', JSON.stringify({ state: {}, version: 6 }));
        localStorage.setItem('cached_transactions', legacyTx); // legacy résiduel : ne doit PAS être lu
        const s = getInitialStateWithMigration();
        // Retourne les défauts ; persist hydratera financeai-storage par-dessus.
        expect(s.transactions).toEqual([]);
    });

    it('IMPORTE les clés legacy quand financeai-storage est absent (1er upgrade)', () => {
        localStorage.setItem('cached_transactions', legacyTx); // clé legacy réelle des transactions
        const s = getInitialStateWithMigration();
        expect(s.transactions).toHaveLength(1);
        expect(s.transactions[0].payee).toBe('Legacy');
    });

    it('nouvel utilisateur (rien stocké) → défauts propres', () => {
        const s = getInitialStateWithMigration();
        expect(s.transactions).toEqual([]);
        expect(s.budgetItems).toEqual([]);
        expect(s.apiKeys).toEqual({ eraContext: '', anthropic: '', finnhub: '' });
    });

    it('ne perd pas les données : financeai-storage présent + legacy présent → on garde la voie persist', () => {
        // Même si une vieille clé legacy diverge, financeai-storage gagne (il est
        // toujours au moins aussi frais — plus aucune écriture vers app_*).
        localStorage.setItem('financeai-storage', JSON.stringify({ state: {}, version: 6 }));
        localStorage.setItem('app_assets', JSON.stringify([{ symbol: 'OLD', quantity: 99 }]));
        const s = getInitialStateWithMigration();
        expect(s.assets).toEqual([]); // legacy ignoré → persist fournira les vrais assets
    });
});
