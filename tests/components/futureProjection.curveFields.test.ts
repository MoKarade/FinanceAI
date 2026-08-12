// [FUTUR-DAILY-NATIVE] Garde : chaque `dataKey` tracé par FutureProjection DOIT figurer dans
// CURVE_FIELDS (la ventilation légère de la série quotidienne). Une série ajoutée au render sans
// être ajoutée à CURVE_FIELDS serait ventilée NULLE PART : la courbe la tracerait sur des champs
// absents → ligne invisible, en silence — exactement la classe « no-op silencieux » du dépôt.
//
// ⚠️ La garde lit le SOURCE du composant (pas sa config) : elle ne peut pas être trompée par une
// constante qui dériverait du render. `monthIndex` (axe X) est exclu : c'est l'abscisse, pas une
// série ventilée.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('[FUTUR-DAILY-NATIVE] CURVE_FIELDS couvre tous les dataKey tracés', () => {
    const src = readFileSync(join(__dirname, '../../components/FutureProjection.tsx'), 'utf-8');

    it('chaque dataKey du render ∈ CURVE_FIELDS', () => {
        const fieldsBlock = src.match(/const CURVE_FIELDS[^=]*= new Set\(\[([\s\S]*?)\]\)/);
        expect(fieldsBlock).not.toBeNull();
        const declared = new Set([...fieldsBlock![1].matchAll(/'([^']+)'/g)].map((m) => m[1]));

        const dataKeys = [...src.matchAll(/dataKey="([^"]+)"/g)].map((m) => m[1]).filter((k) => k !== 'monthIndex');
        expect(dataKeys.length).toBeGreaterThan(5); // non-vacuité : le render trace bien des séries
        for (const k of dataKeys) {
            expect(declared.has(k), `dataKey="${k}" tracé mais ABSENT de CURVE_FIELDS — la série serait invisible au jour`).toBe(true);
        }
    });
});
