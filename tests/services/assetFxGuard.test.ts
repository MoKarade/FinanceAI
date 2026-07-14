// tests/services/assetFxGuard.test.ts
//
// [ASSET-FX-DISPLAY] Garde-fou ANTI-RÉCIDIVE : les prix des actifs (`Asset.currentPrice`) sont
// stockés en devise NATIVE (USD/EUR/CAD, cf AddStockForm) — toute somme `quantity × currentPrice`
// SANS conversion FX mélange les devises et fausse le patrimoine affiché (incident Marc 2026-07-14 :
// 160 352 « $ » affichés = 69 k USD + 84 k EUR + 7 k CAD bruts, vs ~230 k$ CAD réels — 6 surfaces
// touchées : NetWorthByOwnerCard, Investments, Dashboard, HealthIndicator, AssetLocationCard, CSV).
//
// Ce test SCANNE le code source : tout `quantity` et `currentPrice` multipliés sur la MÊME ligne
// doivent passer par la source unique (`assetValueCad`/`toCurrencyFactor`/`fx`) — sinon échec avec
// le fichier:ligne fautif. Leçon FISC-CONST-LINT : un scan doit PROUVER son volume (un scan qui ne
// trouve aucun fichier/aucun motif passe à vide = protection nulle silencieuse).
//
// ⚠️ LIMITE ASSUMÉE (défense-en-profondeur, pas garantie structurelle) : le scan exige les
// identifiants LITTÉRAUX sur la ligne de multiplication — un alias (`const {quantity: q} = a; q*p`)
// ou une multiplication étalée sur 2 lignes lui échappent. Le style du repo n'alias jamais ces
// champs ; la garantie primaire reste la revue + la source unique `assetValueCad`.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(process.cwd());
const SCAN_DIRS = ['components', 'services', 'utils', 'hooks', 'mcp'];

/** Fichier:ligne autorisés à multiplier qty×prix SANS mention fx sur la ligne (justifiés). */
const ALLOWLIST: Array<{ file: string; reason: string }> = [
    // La source unique elle-même (le factor est appliqué dans la fonction).
    { file: 'services/portfolio.ts', reason: 'assetValueCad = la source unique (factor appliqué)' },
    // Export CSV : valeur volontairement NATIVE par ligne (colonne Currency à côté la qualifie).
    { file: 'utils/csvExport.ts', reason: 'Value par-ligne en devise native, documenté' },
    // Reconstruction d'historique : convertit via fx[currency] à part (ligne dédiée, testée).
    { file: 'services/history/reconstructPortfolioHistory.ts', reason: 'fx appliqué séparément (ligne 55)' },
];

function listSourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        const st = statSync(p);
        if (st.isDirectory()) {
            if (entry === 'node_modules' || entry === 'dist' || entry === 'dist-mcp') continue;
            out.push(...listSourceFiles(p));
        } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry) && !/\.d\.ts$/.test(entry)) {
            out.push(p);
        }
    }
    return out;
}

/** Strip les commentaires (leçon FISC-CONST-LINT : un motif en commentaire pollue le scan). */
function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, '');
}

describe('[ASSET-FX-DISPLAY] garde anti quantity×currentPrice sans FX', () => {
    const files = SCAN_DIRS.flatMap((d) => listSourceFiles(resolve(ROOT, d)));

    it('le scan a du VOLUME (sinon protection nulle silencieuse)', () => {
        expect(files.length).toBeGreaterThan(150); // components+services+utils+hooks+mcp
        // Le motif existe bien quelque part (la source unique) — le scan lit du vrai code.
        const portfolio = readFileSync(resolve(ROOT, 'services/portfolio.ts'), 'utf8');
        expect(portfolio).toMatch(/quantity.*currentPrice|currentPrice.*quantity/);
    });

    it('toute multiplication quantity×currentPrice hors allowlist mentionne fx/factor/assetValueCad sur la ligne', () => {
        const offenders: string[] = [];
        for (const f of files) {
            const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/');
            if (ALLOWLIST.some((a) => rel === a.file)) continue;
            const lines = stripComments(readFileSync(f, 'utf8')).split('\n');
            lines.forEach((line, i) => {
                // Multiplication des deux champs sur la même ligne…
                const multiplies =
                    /quantity[^\n]*\*[^\n]*currentPrice|currentPrice[^\n]*\*[^\n]*quantity/.test(line);
                if (!multiplies) return;
                // …sans passage par la conversion (source unique, factor ou taux fx sur la ligne —
                // `fx` en substring couvre fxRates/fxOf/fx[/`* fx` ; vérifié sans faux négatif).
                const converted = /assetValueCad|toCurrencyFactor|factor|fx/i.test(line);
                if (!converted) offenders.push(`${rel}:${i + 1} → ${line.trim().slice(0, 120)}`);
            });
        }
        expect(offenders, `Somme d'actifs SANS conversion FX (utiliser assetValueCad de services/portfolio) :\n${offenders.join('\n')}`).toEqual([]);
    });
});
