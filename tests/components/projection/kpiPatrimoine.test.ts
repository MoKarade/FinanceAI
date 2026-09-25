// [FUTUR-KPI-PATRIMOINE-FIN-COURBE] La tuile « Patrimoine » du Futur montre la fin de courbe,
// jamais l'héritage net (qui reste dans l'info-bulle, masqué en mode discret).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { kpiPatrimoine } from '../../../components/projection/kpiPatrimoine';
import { formatCompactCAD } from '../../../utils/format';
import { MASKED_AMOUNT_LABEL } from '../../../utils/privacyAria';

// Ordres de grandeur du persona « Couple à l'aise » (2066) : fin de courbe 11,23 M$, héritage 9,79 M$.
const FIN = 11_229_524;
const HERITAGE = 9_790_000;

describe('kpiPatrimoine', () => {
    it('affiche la valeur nette de fin de courbe, pas l\'héritage net', () => {
        const k = kpiPatrimoine({ finalNetWorth: FIN, estateNetWorth: HERITAGE, fireNumber: 1_270_000 }, false);
        expect(k.value).toBe(formatCompactCAD(FIN));
        expect(k.value).not.toBe(formatCompactCAD(HERITAGE));
    });

    it("donne l'héritage net dans l'info-bulle", () => {
        const k = kpiPatrimoine({ finalNetWorth: FIN, estateNetWorth: HERITAGE }, false);
        expect(k.tooltip).toContain('fin de l\'horizon');
        expect(k.tooltip).toContain(`Héritage net : ${formatCompactCAD(HERITAGE)}`);
    });

    it("masque l'héritage net en mode discret (l'info-bulle n'est pas floutée)", () => {
        const k = kpiPatrimoine({ finalNetWorth: FIN, estateNetWorth: HERITAGE }, true);
        expect(k.tooltip).toContain(`Héritage net : ${MASKED_AMOUNT_LABEL}`);
        expect(k.tooltip).not.toContain(formatCompactCAD(HERITAGE));
    });

    it("sans héritage calculé, l'info-bulle ne parle que de la fin de courbe", () => {
        const k = kpiPatrimoine({ finalNetWorth: FIN }, false);
        expect(k.tooltip).not.toContain('Héritage');
    });

    it('garde le repli historique : sans valeur finale, le nombre FIRE, puis 0', () => {
        expect(kpiPatrimoine({ finalNetWorth: 0, fireNumber: 1_270_000 }, false).value).toBe(formatCompactCAD(1_270_000));
        expect(kpiPatrimoine(null, false).value).toBe(formatCompactCAD(0));
    });

    it('est bien la source de la tuile du Futur', () => {
        const src = readFileSync('components/FutureProjection.tsx', 'utf8');
        expect(src).toContain('kpiPatrimoine(results, isPrivacyMode)');
        expect(src).toContain('value={patrimoineKpi.value}');
        expect(src).toContain('tooltip={patrimoineKpi.tooltip}');
        expect(src).not.toMatch(/value=\{formatCompactCAD\(\(results\?\.estateNetWorth/);
    });
});
