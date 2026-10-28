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

    it('3 échecs consécutifs → skip COURT (1 h pour quote — finding ÉLEVÉ #499 : une rafale transitoire ne gèle pas 24 h)', () => {
        for (let i = 0; i < 3; i++) recordNegative('quote', 'GIC-MANUEL', T0 + i);
        expect(shouldSkipNegative('quote', 'GIC-MANUEL', T0 + 5)).toBe(true);
        // À l'expiration du TTL COURT (1 h), un nouvel essai est permis (self-heal).
        expect(shouldSkipNegative('quote', 'GIC-MANUEL', T0 + 2 + HOUR + 1)).toBe(false);
    });

    it('≥ 5 échecs consécutifs → TTL LONG (quote 24 h) : un titre vraiment non coté finit par coûter zéro réseau', () => {
        for (let i = 0; i < 5; i++) recordNegative('quote', 'GIC-MANUEL', T0 + i * HOUR * 2);
        const last = T0 + 4 * HOUR * 2;
        expect(shouldSkipNegative('quote', 'GIC-MANUEL', last + 2 * HOUR)).toBe(true); // > 1 h : encore actif
        expect(shouldSkipNegative('quote', 'GIC-MANUEL', last + DAY + 1)).toBe(false); // expiré à 24 h
    });

    it('profile : TTL court 24 h (3-4 échecs), long 7 j (≥ 5)', () => {
        for (let i = 0; i < 3; i++) recordNegative('profile', 'XYZ', T0 + i);
        expect(shouldSkipNegative('profile', 'XYZ', T0 + 2 + HOUR)).toBe(true); // actif à +1 h
        expect(shouldSkipNegative('profile', 'XYZ', T0 + 2 + DAY + 1)).toBe(false); // court expiré à 24 h
        recordNegative('profile', 'XYZ', T0 + 2 + DAY + 2); // 4e
        recordNegative('profile', 'XYZ', T0 + 2 + DAY + 3); // 5e → long
        expect(shouldSkipNegative('profile', 'XYZ', T0 + 2 + 3 * DAY)).toBe(true); // actif à J+3
        expect(shouldSkipNegative('profile', 'XYZ', T0 + 2 + DAY + 3 + 7 * DAY + 1)).toBe(false); // expiré à J+7
    });

    it('un échec APRÈS expiration du TTL ré-arme immédiatement le skip (compteur déjà au seuil)', () => {
        for (let i = 0; i < 3; i++) recordNegative('quote', 'GIC-MANUEL', T0 + i);
        const afterTtl = T0 + 2 + HOUR + 1;
        expect(shouldSkipNegative('quote', 'GIC-MANUEL', afterTtl)).toBe(false); // essai permis
        recordNegative('quote', 'GIC-MANUEL', afterTtl); // ...qui échoue encore (4e)
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

    it('une entrée à `until` INFINI (tampering `1e999`) est rejetée à la lecture — pas de gel à vie', () => {
        // Finding sécurité #499 : JSON.parse('1e999') === Infinity, typeof 'number' → sans garde de
        // finitude, shouldSkipNegative resterait vrai pour toujours (self-heal TTL cassé).
        localStorage.setItem('financeai:marketdata:negcache:v1',
            '{"quote::EVIL":{"fails":3,"lastFailAt":1,"until":1e999}}');
        expect(shouldSkipNegative('quote', 'EVIL', T0)).toBe(false);
    });

    it('un JSON corrompu dans localStorage repart propre (jamais de crash)', () => {
        localStorage.setItem('financeai:marketdata:negcache:v1', '{corrompu');
        expect(shouldSkipNegative('quote', 'GIC', T0)).toBe(false);
        recordNegative('quote', 'GIC', T0); // écrit par-dessus sans lever
        expect(shouldSkipNegative('quote', 'GIC', T0 + 1)).toBe(false);
    });
});
