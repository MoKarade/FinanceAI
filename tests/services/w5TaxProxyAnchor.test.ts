// tests/services/w5TaxProxyAnchor.test.ts
//
// [W5-PROXY-NON-SOURCE] Les deux proxys d'impôt W5 sont des HYPOTHÈSES DE MODÈLE assumées
// (décision Marc `[W5-TAX-PROXY]` : garder le forfait, le documenter). Trois endroits les
// mentionnent — le calcul, la doc fiscale, et l'écran qui les annonce à l'utilisateur.
// Cette garde empêche les trois de diverger.
//
// ⚠️ Elle IMPORTE les constantes au lieu de les recopier : un outil-garde à valeurs re-codées en dur
// dérive en silence (`UN-OUTIL-GARDE-A-VALEURS-RECODEES`, leçon du dépôt). Si un jour quelqu'un
// change 45 % en 40 %, ce test exige que la doc ET l'écran suivent.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RENTAL_NOI_TAX_PROXY, CCPC_DIVIDEND_TAX_PROXY, applyW5Effects } from '../../services/projection/w5Effects';
import type { W5Context, W5Containers, W5Mutator } from '../../services/projection/w5Effects';
import { vi } from 'vitest';

const lire = (rel: string): string => readFileSync(resolve(__dirname, '../../', rel), 'utf8');
const pct = (r: number): string => `${Math.round(r * 100)} %`;

describe('[W5-PROXY-NON-SOURCE] les proxys d\'impôt W5 sont ancrés, et les 3 sites concordent', () => {
    it('les deux taux ont une valeur PLAUSIBLE — sinon la garde protégerait n\'importe quoi', () => {
        // Anti-vacuité : sans ça, une constante mise à 0 laisserait tout le reste passer (la doc
        // contiendrait « 0 % » et l'écran aussi, cohérents dans l'erreur).
        expect(RENTAL_NOI_TAX_PROXY).toBeGreaterThan(0.2);
        expect(RENTAL_NOI_TAX_PROXY).toBeLessThan(0.6);
        expect(CCPC_DIVIDEND_TAX_PROXY).toBeGreaterThan(0.15);
        expect(CCPC_DIVIDEND_TAX_PROXY).toBeLessThan(0.55);
    });

    it('FISCAL_REFERENCE.md porte une section dédiée, avec les DEUX taux du code', () => {
        const doc = lire('docs/FISCAL_REFERENCE.md');
        expect(doc, 'section absente — le ticket exigeait précisément son existence')
            .toContain("Proxys d'impôt W5");
        // Les taux doivent apparaître dans la section, écrits comme le code les porte.
        const i = doc.indexOf("Proxys d'impôt W5");
        // ⚠️ Fenêtre bornée à la PROCHAINE section, pas à un offset arbitraire : mesuré, un
        // `slice(i, i+6000)` débordait de 1 740 caractères sur la section suivante — la garde
        // pouvait être satisfaite demain par un voisin (`GARDE-BORNEE-PAR-CLASSE-NEGATIVE`, cousin).
        const finSection = doc.indexOf('\n### ', i + 1);
        const section = doc.slice(i, finSection > i ? finSection : undefined);
        expect(section.length, 'section vide → la garde ne mesure rien').toBeGreaterThan(1000);
        expect(section, `taux locatif ${pct(RENTAL_NOI_TAX_PROXY)} absent de la doc`)
            .toContain(pct(RENTAL_NOI_TAX_PROXY));
        expect(section, `taux dividende ${pct(CCPC_DIVIDEND_TAX_PROXY)} absent de la doc`)
            .toContain(pct(CCPC_DIVIDEND_TAX_PROXY));
        // Et elle doit dire que ce ne sont PAS des règles fiscales — c'est tout l'objet du lot.
        expect(section).toMatch(/hypothèses? de MODÈLE/);
    });

    it('l\'écran ANNONCE les taux, et les lit depuis le moteur (pas de valeur recopiée)', () => {
        const ui = lire('components/PatrimoineExtended.tsx');
        // Les deux mentions existent…
        expect(ui).toContain('RENTAL_NOI_TAX_PROXY');
        expect(ui).toContain('CCPC_DIVIDEND_TAX_PROXY');
        // …et elles sont RENDUES, pas seulement importées.
        // ⚠️ Motif EXACT (`× 100, 0`) : perturbation mesurée — `RENTAL_NOI_TAX_PROXY * 100 + 5`
        // passait le motif lâche `formatPercent\(RENTAL_NOI_TAX_PROXY` en affichant 50 %.
        expect(ui).toMatch(/formatPercent\(RENTAL_NOI_TAX_PROXY \* 100, 0\)/);
        expect(ui).toMatch(/formatPercent\(CCPC_DIVIDEND_TAX_PROXY \* 100, 0\)/);
        // ⚠️ DISCRIMINANT du recopiage : aucun littéral « 45 % » / « 36 % » en dur dans le composant.
        // C'est ce qui empêcherait la mention de survivre à un changement de constante.
        const code = ui.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
        expect(code.length).toBeGreaterThan(ui.length * 0.5); // anti-vacuité du décommentage
        expect(code, 'taux recopié en dur dans l\'écran').not.toMatch(/\b45\s*%/);
        expect(code, 'taux recopié en dur dans l\'écran').not.toMatch(/\b36\s*%/);
    });

    it('le CALCUL applique chaque constante à SON flux — échanger les deux doit rougir', () => {
        // ⚠️ Trou mesuré en revue : ÉCHANGER les deux constantes (0,36 au locatif, 0,45 au dividende)
        // laissait 4/4 vert et déplaçait `estateNetWorth` de −14 460 $ sans une assertion rouge —
        // aucun test du dépôt ne fixait la VALEUR de ces impôts (`w5Effects.test.ts` n'assertait que
        // `taxDivers > 0`). Un scan de texte prouve des jetons ; seul le COMPORTEMENT prouve le câblage.
        const s = { taxDivers: 0, income: 0 };
        const mutator = {
            addExpense: () => {}, addIncome: (n: number) => { s.income += n; }, subtractLiquid: () => {},
            addTaxRevenu: () => {}, addTaxGains: () => {}, addTaxDivers: (n: number) => { s.taxDivers += n; },
            addDonationCredit: () => {}, logFlow: vi.fn(), logLife: vi.fn(),
        } as unknown as W5Mutator;
        const ctx = { m: 12, currentMonthIndex: 0, currentLoopDate: new Date('2027-01-01'),
            startYear: 2026, startMonth: 0, expenseMultiplier: 1 } as unknown as W5Context;

        // Locatif seul : NOI = (3 000 − 500) × 12 = 30 000 $/an → impôt mensuel = 30 000 × 0,45 / 12.
        const contLoc = { insurancePolicies: [], vehicleReplacements: [], majorRenovations: [],
            charitableGoals: [], privateBusinesses: [],
            rentalProperties: [{ id: 'r1', name: 'R1', monthlyRent: 3_000, monthlyExpenses: 500,
                vacancyPct: 0, purchasePrice: 0, currentValue: 0, mortgageBalance: 0 }],
        } as unknown as W5Containers;
        applyW5Effects(ctx, contLoc, mutator);
        expect(s.taxDivers).toBeCloseTo(30_000 * RENTAL_NOI_TAX_PROXY / 12, 6);

        // Dividende seul : 24 000 $/an → impôt mensuel = 24 000 × 0,36 / 12. Valeurs choisies pour
        // que 30 000 × 0,36 ≠ 30 000 × 0,45 : l'échange des constantes rougit les DEUX assertions.
        s.taxDivers = 0;
        const contDiv = { insurancePolicies: [], vehicleReplacements: [], majorRenovations: [],
            charitableGoals: [], rentalProperties: [],
            privateBusinesses: [{ id: 'b1', name: 'B1', annualDividend: 24_000, ownershipPct: 100,
                estimatedValue: 0 }],
        } as unknown as W5Containers;
        applyW5Effects(ctx, contDiv, mutator);
        expect(s.taxDivers).toBeCloseTo(24_000 * CCPC_DIVIDEND_TAX_PROXY / 12, 6);
    });

    it('le moteur applique bien les CONSTANTES NOMMÉES, plus des littéraux nus', () => {
        // « Nommer ou retirer » : le ticket reprochait deux littéraux anonymes au milieu du calcul.
        const src = lire('services/projection/w5Effects.ts');
        const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
        expect(code.length).toBeGreaterThan(src.length * 0.3);
        expect(code).toMatch(/rentalPropertyNoiMonthly \* RENTAL_NOI_TAX_PROXY/);
        expect(code).toMatch(/businessDividendMonthly \* CCPC_DIVIDEND_TAX_PROXY/);
        // Les seuls `0.45` / `0.36` restants doivent être les DÉCLARATIONS, pas des usages.
        expect((code.match(/0\.45/g) ?? []).length).toBe(1);
        expect((code.match(/0\.36/g) ?? []).length).toBe(1);
    });
});
