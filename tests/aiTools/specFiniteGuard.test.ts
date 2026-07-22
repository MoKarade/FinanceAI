// tests/aiTools/specFiniteGuard.test.ts
//
// [SEC / AITOOLS] Garde-scan anti-récidive : tout champ `z.number()` de MONTANT ($) dans un spec de
// tool MCP/app (mcp/tools/*.spec.ts) DOIT porter `.finite()` — Zod `.positive()/.min()/.max()`
// n'exclut PAS Infinity ; seuls les `.int()` le rejettent par construction (leçon MCP-WHATIF). Un
// champ $ non fini traverse le moteur ($ absurde, présenté avec l'autorité d'un vrai calcul, ou
// JSON.stringify → null silencieux). Ce scan (sur le modèle d'assetFxGuard) empêche un futur tool
// d'introduire un champ $ non gardé. On PROUVE le volume scanné (sinon garde vacante silencieuse).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const SPEC_DIR = resolve(process.cwd(), 'mcp/tools');

// Champs qui ne sont PAS des montants $ (années, âges, taux %, durées, compteurs bornés) : exemptés
// du `.finite()` car soit `.int()`, soit bornés par `.max(N)` fini. On liste les NOMS non-$ connus
// pour éviter les faux positifs ; tout NOUVEAU champ `z.number()` non listé et sans `.finite()`/`.int()`
// fait échouer le test → le mainteneur ajoute `.finite()` (si $) ou l'exempte explicitement (si non-$).
const NON_MONEY_FIELDS = new Set<string>([
    'years', 'returnRate', 'inflationRate', 'rate', 'amortization', 'renewalRate', 'propertyGrowthRate',
    'startYear', 'birthYear', 'arrivalYear', 'currentYear', 'limit', 'termYears', 'monthsFromNow',
    'amortYears', 'age', 'targetAge', 'retirementAge', 'horizonYears', 'yearsUntil',
]);

function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('garde-scan .finite() sur les champs $ des specs de tools', () => {
    const files = readdirSync(SPEC_DIR).filter((f) => f.endsWith('.spec.ts'));

    it('scanne un volume PROUVÉ de specs (garde non vacante)', () => {
        expect(files.length).toBeGreaterThan(10); // 16 tools attendus
    });

    it('tout champ z.number() de montant $ porte .finite() (ou est .int()/borné/non-$ exempté)', () => {
        const offenders: string[] = [];
        let fieldsScanned = 0;

        for (const file of files) {
            const src = stripComments(readFileSync(resolve(SPEC_DIR, file), 'utf8'));
            // Capture « nom: z.number()<chaîne de .méthodes()> » jusqu'au prochain .describe( ou , ou fin.
            const re = /(\w+)\s*:\s*z\.number\(\)((?:\s*\.\w+\([^)]*\))*)/g;
            let m: RegExpExecArray | null;
            while ((m = re.exec(src)) !== null) {
                const [, name, chain] = m;
                fieldsScanned += 1;
                const isInt = /\.int\(/.test(chain);
                const isFinite = /\.finite\(/.test(chain);
                // Borné par .max(N) fini → Infinity rejeté (N est un littéral numérique).
                const isBounded = /\.max\(\s*\d/.test(chain);
                if (isInt || isFinite || isBounded) continue;
                if (NON_MONEY_FIELDS.has(name)) continue;
                offenders.push(`${file}: ${name} (z.number()${chain}) — ajoute .finite() (champ $) ou exempte-le (non-$)`);
            }
        }

        expect(fieldsScanned).toBeGreaterThan(15); // volume de champs numériques prouvé
        expect(offenders, `Champs $ sans .finite() :\n${offenders.join('\n')}`).toEqual([]);
    });
});
