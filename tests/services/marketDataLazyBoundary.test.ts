// tests/services/marketDataLazyBoundary.test.ts
//
// [PERF-MARKETDATA-DYNIMPORT-INERTE] La frontière asynchrone de marketData est une propriété
// FRAGILE : un seul import STATIQUE de valeurs depuis un module du chunk d'entrée suffit à
// rapatrier les ~67 Ko (providers Finnhub/CoinGecko compris) dans le bundle de BOOT — c'est
// exactement ce que quatre imports faisaient (INEFFECTIVE_DYNAMIC_IMPORT, build 2026-08-19).
// Vérité re-mesurée au build PROPRE du 2026-09-04 après le correctif : 0 avertissement,
// `api.coingecko.com`/`finnhub.io` absents de `index-*.js` (293 → 279,6 Ko), et un chunk
// asynchrone `marketData-*.js` existe enfin.
//
// La garde lit la SOURCE (décommentée — un commentaire qui cite le motif ne compte pas) des deux
// fichiers d'ENTRÉE nommés par le build : App.tsx et hooks/usePastPortfolioHistory.ts. Les écrans
// PARESSEUX (Investments, AddStockForm) gardent le droit d'importer statiquement — marketData part
// alors dans LEUR chunk, pas dans celui du boot ; les interdire ici serait un faux positif.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripComments } from '../../utils/stripComments';
import { loadMarketData } from '../../services/marketData/lazy';

const ENTRY_FILES = ['App.tsx', 'hooks/usePastPortfolioHistory.ts'];
// Import de VALEURS depuis le module (ou son index) — `import type` reste permis (n'émet rien),
// et `marketData/lazy` / `marketData/messageEchec` (types seuls) ne sont pas le module lourd.
const IMPORT_VALEURS = /import\s*\{[^}]*\}\s*from\s*'[^']*services\/marketData(?:\/index)?'/;
const IMPORT_TYPE = /import\s+type\s[^;]*from\s*'[^']*services\/marketData(?:\/index)?'/;

describe('[PERF-MARKETDATA-DYNIMPORT-INERTE] le chunk d\'entrée ne ré-importe pas marketData statiquement', () => {
    for (const f of ENTRY_FILES) {
        it(`${f} : zéro import statique de valeurs, et la façade paresseuse est bien consommée`, () => {
            const brut = readFileSync(f, 'utf8');
            const code = stripComments(brut);
            // Anti-vacuité du décommentage : il reste substantiellement du code.
            expect(code.replace(/\s/g, '').length).toBeGreaterThan(2_000);
            // Le FAIT : aucun import de valeurs du module lourd (un `import type` resterait sain).
            const sansTypes = code.replace(new RegExp(IMPORT_TYPE.source, 'g'), '');
            expect(sansTypes).not.toMatch(IMPORT_VALEURS);
            // Témoin : le fichier consomme bien la façade (sinon la garde serait satisfaite par la
            // disparition de son objet — le module ne serait juste plus utilisé du tout).
            expect(code).toMatch(/\bloadMarketData\(/);
        });
    }

    it('lazy.ts : sa seule référence à ./index est le `import()` dynamique (jamais un import statique)', () => {
        const code = stripComments(readFileSync('services/marketData/lazy.ts', 'utf8'));
        expect(code).toMatch(/import\(\s*'\.\/index'\s*\)/);   // la frontière existe
        expect(code).not.toMatch(/from\s*'\.\/index'/);        // et rien ne la court-circuite
        // (`typeof import('./index')` est un TYPE : aucune émission runtime, hors de ce motif)
    });

    it('la façade mémoïse : deux appels rendent LA MÊME promesse (c\'est elle qui porte l\'ordre configure→quote)', async () => {
        const p1 = loadMarketData();
        const p2 = loadMarketData();
        expect(p1).toBe(p2);
        // Chaîne réelle : le module chargé expose bien les deux gestes dont l'ORDRE est le contrat.
        const m = await p1;
        expect(typeof m.configureMarketDataProvider).toBe('function');
        expect(typeof m.getQuote).toBe('function');
    });
});
