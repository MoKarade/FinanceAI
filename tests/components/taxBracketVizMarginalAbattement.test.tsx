// tests/components/taxBracketVizMarginalAbattement.test.tsx
//
// [FISC-UI-MARGINAL-ABATEMENT] Le « Combiné marginal » de l'écran Tranches d'imposition est celui du
// MOTEUR (`getMarginalRate`, fédéral net de l'abattement du Québec), plus la somme brute fed + qc ; et la
// décomposition $ par palier vient de `calculateDetailedTax`, plus d'une boucle recopiée.
//
// Perturbations mesurées séparément :
//   · combiné remis à `(fed + qc) × 100` → « combiné » et le scan rougissent, les autres restent verts ;
//   · décomposition recopiée en local (`× b.rate`) → seul le scan rougit (les montants sont égaux par
//     construction — c'est précisément pourquoi une garde de rendu ne suffit pas contre la DÉRIVE).

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TaxBracketViz } from '../../components/TaxBracketViz';
import { bracketsForYear, calculateDetailedTax, getMarginalRate } from '../../utils/tax';
import { formatCAD } from '../../utils/format';
import { stripCommentsJsx, partDeCodeRestante } from '../../utils/stripComments';

afterEach(cleanup);

const REVENU = 100_000;
const ANNEE = 2026;
// `innerHTML` encode l'insécable en `&nbsp;` : normaliser les DEUX formes, sinon un attendu composé avec
// `formatCAD` (U+00A0) ne matche rien (`UN-MONTANT-INTERPOLE…`, corollaire insécable).
const norm = (s: string) => s.replace(/&nbsp;|\u00a0|\u202f/g, ' ');

describe('[FISC-UI-MARGINAL-ABATEMENT] « Combiné marginal » = taux marginal du MOTEUR (net d’abattement)', () => {
    it('affiche getMarginalRate(revenu, année) — et PAS la somme brute fed + qc', () => {
        const { container } = render(<TaxBracketViz year={ANNEE} annualGrossIncome={REVENU} />);
        const html = norm(container.innerHTML);
        const moteur = (getMarginalRate(REVENU, ANNEE) * 100).toFixed(1) + '%';
        const { fed, qc } = bracketsForYear(ANNEE);
        const fedRate = fed.find(b => REVENU <= b.upTo)!.rate;
        const qcRate = qc.find(b => REVENU <= b.upTo)!.rate;
        const sommeBrute = ((fedRate + qcRate) * 100).toFixed(1) + '%';
        // Anti-vacuité : les deux valeurs DIFFÈRENT (l'abattement vaut 16,5 % du fédéral, jamais 0).
        expect(sommeBrute).not.toBe(moteur);
        expect(Number.parseFloat(sommeBrute) - Number.parseFloat(moteur)).toBeGreaterThan(2);
        const bloc = container.querySelector('[class*="text-info-400"][class*="font-mono"]');
        expect(bloc, 'la cellule « Combiné marginal » doit exister').toBeTruthy();
        expect(html).toContain(moteur);
        expect(norm(bloc!.textContent ?? '')).toBe(moteur);
        expect(norm(bloc!.textContent ?? '')).not.toBe(sommeBrute);
    });

    it('contrôle : les « X % marginal » PAR juridiction restent le taux BRUT du palier (l’abattement ne les concerne pas)', () => {
        const { container } = render(<TaxBracketViz year={ANNEE} annualGrossIncome={REVENU} />);
        const html = norm(container.innerHTML);
        const { fed, qc } = bracketsForYear(ANNEE);
        const fedRate = fed.find(b => REVENU <= b.upTo)!.rate;
        const qcRate = qc.find(b => REVENU <= b.upTo)!.rate;
        expect(html).toContain(`${Math.round(fedRate * 100)} % marginal`);
        expect(html).toContain(`${Math.round(qcRate * 100)} % marginal`);
    });

    it('la décomposition $ par palier affiche EXACTEMENT les montants de calculateDetailedTax', () => {
        const { container } = render(<TaxBracketViz year={ANNEE} annualGrossIncome={REVENU} />);
        const html = norm(container.innerHTML);
        const { fed } = bracketsForYear(ANNEE);
        const { breakdown } = calculateDetailedTax(REVENU, fed);
        const atteints = (breakdown ?? []).filter(l => l.filled > 0);
        expect(atteints.length, 'la fixture doit atteindre plusieurs paliers').toBeGreaterThan(1);
        for (const l of atteints) {
            expect(html).toContain(norm(formatCAD(l.amount)));
            expect(html).toContain(norm(formatCAD(l.filled)));
        }
    });

    it('scan de SOURCE : le composant consomme getMarginalRate ET calculateDetailedTax, sans réimplémenter ni l’un ni l’autre', () => {
        const src = readFileSync(resolve(process.cwd(), 'components/TaxBracketViz.tsx'), 'utf8');
        const code = stripCommentsJsx(src);
        expect(partDeCodeRestante(src, code), 'anti-vacuité du décommentage').toBeGreaterThan(0.3);
        expect(code).toMatch(/getMarginalRate\(annualGrossIncome, year\)/);
        expect(code).toMatch(/calculateDetailedTax\(income, brackets\)/);
        // Plus de somme brute des deux marginaux, plus de boucle « × b.rate » recopiée.
        expect(code).not.toMatch(/marginalRate \+ \w+\.marginalRate/);
        expect(code).not.toMatch(/\* b\.rate\b/);
    });
});
