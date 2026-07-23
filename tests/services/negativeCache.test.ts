// [QUOTE-NEGATIVE-CACHE] Cache négatif TTL par symbole (quotes/profils) : seuil de 3 échecs
// CONSÉCUTIFS, skip borné par TTL (self-heal), succès = effacement, fenêtre de consécutivité,
// purge des entrées mortes, persistance localStorage (clé dédiée, jamais synchronisée).
import { describe, it, expect, beforeEach } from 'vitest';
import {
    shouldSkipNegative,
    recordNegative,
    clearNegative,
    clearNegativeCache,
    __resetNegativeCacheForTests,
} from '../../services/marketData/negativeCache';

const T0 = Date.UTC(2026, 6, 23, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

beforeEach(() => {
    localStorage.clear();
    __resetNegativeCacheForTests();
});

describe('negativeCache', () => {
    it('ne skippe RIEN avant 3 échecs consécutifs (une panne isolée est inoffensive)', () => {
        recordNegative('quote', 'GIC-MANUEL', T0);
        expect(shouldSkipNegative('quote', 'GIC-MANUEL', T0 + 1)).toBe(false);
        recordNegative('quote', 'GIC-MANUEL', T0 + 2);
        expect(shouldSkipNegative('quote', 'GIC-MANUEL', T0 + 3)).toBe(false);
    });

    it('3 échecs consécutifs → skip actif, borné par le TTL (24 h pour quote)', () => {
        for (let i = 0; i < 3; i++) recordNegative('quote', 'GIC-MANUEL', T0 + i);
        expect(shouldSkipNegative('quote', 'GIC-MANUEL', T0 + 5)).toBe(true);
        // À l'expiration du TTL, un nouvel essai est permis (self-heal).
        expect(shouldSkipNegative('quote', 'GIC-MANUEL', T0 + 2 + DAY + 1)).toBe(false);
    });

    it('profile a un TTL plus long (7 j) que quote (24 h)', () => {
        for (let i = 0; i < 3; i++) recordNegative('profile', 'XYZ', T0 + i);
        expect(shouldSkipNegative('profile', 'XYZ', T0 + 2 + DAY + 1)).toBe(true); // encore actif à J+1
        expect(shouldSkipNegative('profile', 'XYZ', T0 + 2 + 7 * DAY + 1)).toBe(false); // expiré à J+7
    });

    it('un échec APRÈS expiration du TTL ré-arme immédiatement le skip (compteur déjà au seuil)', () => {
        for (let i = 0; i < 3; i++) recordNegative('quote', 'GIC-MANUEL', T0 + i);
        const afterTtl = T0 + 2 + DAY + 1;
        expect(shouldSkipNegative('quote', 'GIC-MANUEL', afterTtl)).toBe(false); // essai permis
        recordNegative('quote', 'GIC-MANUEL', afterTtl); // ...qui échoue encore
        expect(shouldSkipNegative('quote', 'GIC-MANUEL', afterTtl + 1)).toBe(true);
    });

    it('un succès EFFACE l\'entrée (retour au comportement normal)', () => {
        for (let i = 0; i < 3; i++) recordNegative('quote', 'AAPL', T0 + i);
        expect(shouldSkipNegative('quote', 'AAPL', T0 + 5)).toBe(true);
        clearNegative('quote', 'AAPL');
        expect(shouldSkipNegative('quote', 'AAPL', T0 + 6)).toBe(false);
        recordNegative('quote', 'AAPL', T0 + 7); // le compteur repart de 1
        expect(shouldSkipNegative('quote', 'AAPL', T0 + 8)).toBe(false);
    });

    it('la consécutivité a une FENÊTRE : des échecs espacés de > 7 j ne s\'additionnent pas', () => {
        recordNegative('quote', 'RARE', T0);
        recordNegative('quote', 'RARE', T0 + 1);
        // 3ᵉ échec 8 jours plus tard → compteur reparti à 1, pas de skip.
        recordNegative('quote', 'RARE', T0 + 8 * DAY);
        expect(shouldSkipNegative('quote', 'RARE', T0 + 8 * DAY + 1)).toBe(false);
    });

    it('les genres et symboles sont indépendants (quote ≠ profile, casse normalisée)', () => {
        for (let i = 0; i < 3; i++) recordNegative('quote', 'gic', T0 + i);
        expect(shouldSkipNegative('quote', 'GIC', T0 + 5)).toBe(true); // même symbole, casse ≠
        expect(shouldSkipNegative('profile', 'GIC', T0 + 5)).toBe(false); // autre genre
        expect(shouldSkipNegative('quote', 'AUTRE', T0 + 5)).toBe(false); // autre symbole
    });

    it('persiste dans localStorage (clé dédiée) et survit à un reset mémoire', () => {
        for (let i = 0; i < 3; i++) recordNegative('quote', 'GIC-MANUEL', T0 + i);
        expect(localStorage.getItem('financeai:marketdata:negcache:v1')).toContain('GIC-MANUEL');
        __resetNegativeCacheForTests(); // simule un reload (le module recharge du localStorage)
        expect(shouldSkipNegative('quote', 'GIC-MANUEL', T0 + 5)).toBe(true);
    });

    it('clearNegativeCache (changement de clé provider / resync forcé) vide tout', () => {
        for (let i = 0; i < 3; i++) recordNegative('quote', 'GIC-MANUEL', T0 + i);
        clearNegativeCache();
        expect(shouldSkipNegative('quote', 'GIC-MANUEL', T0 + 5)).toBe(false);
        expect(localStorage.getItem('financeai:marketdata:negcache:v1')).toBeNull();
    });

    it('purge les entrées mortes (> 30 j sans échec) lors d\'une écriture ultérieure', () => {
        for (let i = 0; i < 3; i++) recordNegative('quote', 'VIEUX', T0 + i);
        recordNegative('quote', 'AUTRE', T0 + 31 * DAY); // écriture 31 j plus tard → purge de VIEUX
        expect(localStorage.getItem('financeai:marketdata:negcache:v1')).not.toContain('VIEUX');
    });

    it('un JSON corrompu dans localStorage repart propre (jamais de crash)', () => {
        localStorage.setItem('financeai:marketdata:negcache:v1', '{corrompu');
        expect(shouldSkipNegative('quote', 'GIC', T0)).toBe(false);
        recordNegative('quote', 'GIC', T0); // écrit par-dessus sans lever
        expect(shouldSkipNegative('quote', 'GIC', T0 + 1)).toBe(false);
    });
});
