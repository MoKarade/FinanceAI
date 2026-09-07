// tests/services/claude.promptPaliers.test.ts
//
// [PROMPT-PALIERS-EN-DUR] (audit 2026-09-07) Le prompt système recopiait les taux des paliers 2026 en
// dur — exacts ce jour-là, hors de portée du ratchet fiscal, et faux à la prochaine indexation ou
// réforme. Ils sont désormais DÉRIVÉS de `utils/tax.ts`. La garde ancre le FAIT (le prompt dit ce que
// la source unique dit) et le FORMAT lisible (« 14/20.5/26/29/33 »), pas la ligne de code.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { QUEBEC_FISCAL_CONTEXT } from '../../services/claude';
import { FED_BRACKETS, QC_BRACKETS } from '../../utils/tax';

const attendu = (b: ReadonlyArray<{ rate: number }>) => b.map(x => String(Number((x.rate * 100).toFixed(2)))).join('/');

afterEach(() => { vi.doUnmock('../../utils/tax'); vi.resetModules(); });

describe('[PROMPT-PALIERS-EN-DUR] le prompt système dérive ses paliers de utils/tax.ts', () => {
    it('la ligne des paliers est construite depuis FED_BRACKETS et QC_BRACKETS', () => {
        expect(QUEBEC_FISCAL_CONTEXT).toContain(`paliers fed (${attendu(FED_BRACKETS)}%) + QC (${attendu(QC_BRACKETS)}%)`);
    });

    it('et elle reste LISIBLE : pas d’artefact flottant (0.14 × 100 ≠ 14.000000000000002)', () => {
        expect(QUEBEC_FISCAL_CONTEXT).toMatch(/paliers fed \(\d+(\.\d+)?(\/\d+(\.\d+)?)+%\)/);
        expect(QUEBEC_FISCAL_CONTEXT).not.toMatch(/\d\.\d{6,}/);
    });

    // ⚠️ Revue du lot 213 : les deux cas ci-dessus passaient AUSSI sur le littéral d'avant (octet pour octet égal
    // à la dérivation d'aujourd'hui). La PREUVE de dérivation exige de faire BOUGER la source : un barème modifié
    // doit changer le prompt — un littéral recopié serait resté à « 14 ».
    it('PREUVE : un barème fédéral modifié change le prompt (le littéral d’avant serait resté à 14)', async () => {
        vi.resetModules();
        vi.doMock('../../utils/tax', async (importOriginal) => {
            const reel = await importOriginal<typeof import('../../utils/tax')>();
            return { ...reel, FED_BRACKETS: [{ ...reel.FED_BRACKETS[0], rate: 0.135, label: '13.5%' }, ...reel.FED_BRACKETS.slice(1)] };
        });
        const { QUEBEC_FISCAL_CONTEXT: modifie } = await import('../../services/claude');
        expect(modifie).toContain('paliers fed (13.5/20.5/26/29/33%)');
        expect(modifie).not.toContain('paliers fed (14/20.5/26/29/33%)');
    });

    it('anti-vacuité : la valeur d’aujourd’hui (2026) est bien celle du barème', () => {
        // Mesuré sur `FED_BRACKETS`/`QC_BRACKETS` 2026 ; se re-base AVEC le barème, jamais seul.
        expect(attendu(FED_BRACKETS)).toBe('14/20.5/26/29/33');
        expect(attendu(QC_BRACKETS)).toBe('14/19/24/25.75');
    });
});
