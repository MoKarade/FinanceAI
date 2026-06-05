/**
 * @vitest-environment jsdom
 *
 * services/marketData/providers/providerError.ts — `logProviderError` n'avait AUCUN test.
 * On verrouille son contrat de routage (le cœur de SF-2) :
 *   - NOT_FOUND (symbole inconnu) = légitime → AUCUN log (pas de bruit) ;
 *   - AUTH (clé invalide) = action requise → severity 'error' ;
 *   - NETWORK / RATE_LIMIT / UNKNOWN = transitoire → severity 'warning' ;
 *   - erreur non typée (Error nu / string) → 'warning' + wrappée.
 * Logger réel via getErrors() (jsdom localStorage), comme finnhub/driveAppData.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { logProviderError } from '../../services/marketData/providers/providerError';
import { MarketDataError } from '../../services/marketData/types';
import { getErrors, clearErrors } from '../../services/errorLogger';

describe('logProviderError — routage par code (SF-2)', () => {
    beforeEach(() => { clearErrors(); });

    it('NOT_FOUND (symbole/crypto inconnu) → aucun log (légitime, pas de bruit)', () => {
        logProviderError('Finnhub', 'getQuote', 'ZZZZ', new MarketDataError('introuvable', 'NOT_FOUND', 'finnhub'));
        expect(getErrors()).toHaveLength(0);
    });

    it('AUTH (clé invalide) → severity error, source network', () => {
        logProviderError('Finnhub', 'getQuote', 'AAPL', new MarketDataError('clé invalide', 'AUTH', 'finnhub'));
        const errs = getErrors();
        expect(errs).toHaveLength(1);
        expect(errs[0].severity).toBe('error');
        expect(errs[0].source).toBe('network');
        expect(errs[0].message).toContain('Finnhub');
        expect(errs[0].message).toContain('getQuote');
    });

    it.each(['NETWORK', 'RATE_LIMIT', 'UNKNOWN'] as const)('%s → severity warning (transitoire)', (code) => {
        logProviderError('CoinGecko', 'getHistory', 'BTC', new MarketDataError('souci', code, 'coingecko'));
        const errs = getErrors();
        expect(errs).toHaveLength(1);
        expect(errs[0].severity).toBe('warning');
        expect(errs[0].source).toBe('network');
    });

    it('erreur non typée (Error nu) → warning (pas de chemin AUTH) + journalisée', () => {
        logProviderError('Finnhub', 'getProfile', 'AAPL', new Error('boom réseau'));
        const errs = getErrors();
        expect(errs).toHaveLength(1);
        expect(errs[0].severity).toBe('warning');
    });

    it('valeur jetée non-Error (string) → wrappée puis journalisée (warning)', () => {
        logProviderError('Finnhub', 'getDividends', 'AAPL', 'panne brute');
        const errs = getErrors();
        expect(errs).toHaveLength(1);
        expect(errs[0].severity).toBe('warning');
    });
});
