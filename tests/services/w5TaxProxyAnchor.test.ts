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
import { RENTAL_NOI_TAX_PROXY, CCPC_DIVIDEND_TAX_PROXY } from '../../services/projection/w5Effects';

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
        const section = doc.slice(i, i + 6000);
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
        expect(ui).toMatch(/formatPercent\(RENTAL_NOI_TAX_PROXY/);
        expect(ui).toMatch(/formatPercent\(CCPC_DIVIDEND_TAX_PROXY/);
        // ⚠️ DISCRIMINANT du recopiage : aucun littéral « 45 % » / « 36 % » en dur dans le composant.
        // C'est ce qui empêcherait la mention de survivre à un changement de constante.
        const code = ui.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
        expect(code.length).toBeGreaterThan(ui.length * 0.5); // anti-vacuité du décommentage
        expect(code, 'taux recopié en dur dans l\'écran').not.toMatch(/\b45\s*%/);
        expect(code, 'taux recopié en dur dans l\'écran').not.toMatch(/\b36\s*%/);
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
