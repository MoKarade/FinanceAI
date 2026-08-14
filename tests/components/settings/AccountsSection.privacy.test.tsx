// tests/components/settings/AccountsSection.privacy.test.tsx
//
// [A11Y-PRIVACY-SOLDES-COMPTES] — Réglages › Comptes : les soldes de DÉPART.
//
// Troisième ticket du lot `[A11Y-PRIVACY-LOT2]`. Ce sont les vrais soldes de chaque compte
// (chèque, épargne), saisis à la main et lus par la projection comme point de départ « cash ».
// Ils étaient en `<input type="number">` nu, quel que soit le mode.
//
// ⚠️ La valeur d'un champ ÉDITABLE vit dans `.value`, pas dans `textContent` — on inspecte les deux.
//
// ⚠️ Le `<label>` n'était associé à AUCUN champ (pas de `htmlFor`/`id`, pas d'enveloppement) : les
// boutons masqués auraient été anonymes, et ici c'est particulièrement grave puisqu'il y en a un
// PAR COMPTE. Leçon `BudgetGroupTable` de #629, appliquée d'entrée.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { AccountsSection } from '../../../components/settings/sections/AccountsSection';
import { useFinanceStore } from '../../../store/useFinanceStore';
import type { Transaction } from '../../../types';

vi.mock('../../../components/settings/PayslipUploadCard', () => ({ PayslipUploadCard: () => null }));
vi.mock('../../../components/import/ImportBankStatement', () => ({ ImportBankStatement: () => null }));

const setPrivacy = (on: boolean) => act(() => { useFinanceStore.setState({ isPrivacyMode: on }); });

// Soldes « uniques » : assez longs pour ne croiser aucun nombre statique de l'écran (leçon du
// témoin 1213 qui vivait dans « T1213 retenue source »).
const SOLDES = { 'Compte chèque': 48317, 'Épargne d’urgence': 129643 };
const COMPTES = Object.keys(SOLDES);

const renderSection = (balances: Record<string, number> = SOLDES) =>
    render(
        <AccountsSection
            initialBalances={balances}
            setInitialBalances={vi.fn()}
            transactions={[] as Transaction[]}
            onImportData={vi.fn()}
        />,
    );

const inputValues = (c: HTMLElement) =>
    [...c.querySelectorAll('input')].map((i) => (i as HTMLInputElement).value).join('|');

const allText = (c: HTMLElement) => {
    const attrs = [...c.querySelectorAll('[title], [aria-label], [placeholder]')]
        .map((el) => `${el.getAttribute('title') ?? ''} ${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('placeholder') ?? ''}`)
        .join(' ');
    return `${c.textContent ?? ''} ${attrs} ${inputValues(c)}`.replace(/[\s  ]/g, '');
};

beforeEach(() => { setPrivacy(false); });
afterEach(() => { cleanup(); setPrivacy(false); });

describe('[A11Y-PRIVACY-SOLDES-COMPTES] soldes de départ', () => {
    it('mode discret INACTIF : les soldes sont LISIBLES (le test discrimine)', () => {
        const { container } = renderSection();
        const values = inputValues(container);
        for (const [compte, solde] of Object.entries(SOLDES)) {
            expect(values, `le solde de « ${compte} » devrait être lisible`).toContain(String(solde));
        }
    });

    it('mode discret ACTIF : les soldes SORTENT du DOM (aucun input rendu)', () => {
        setPrivacy(true);
        const { container } = renderSection();
        const text = allText(container);
        for (const [compte, solde] of Object.entries(SOLDES)) {
            expect(text, `le solde de « ${compte} » fuyait`).not.toContain(String(solde));
        }
        expect(container.querySelectorAll('input')).toHaveLength(0);
        expect(container.querySelectorAll('button')).toHaveLength(COMPTES.length);
    });

    it('mode discret ACTIF : le clic révèle un champ NUMÉRIQUE éditable', () => {
        setPrivacy(true);
        const { container } = renderSection();
        const btn = container.querySelector('#acc-balance-0') as HTMLButtonElement;
        expect(btn.tagName).toBe('BUTTON');
        act(() => { fireEvent.click(btn); });
        const champ = container.querySelector('#acc-balance-0') as HTMLInputElement;
        expect(champ.tagName).toBe('INPUT');
        expect(champ.type, 'le champ révélé doit rester numérique').toBe('number');
        expect(champ.value).toBe(String(SOLDES['Compte chèque']));
    });
});

describe('[A11Y-PRIVACY-SOLDES-COMPTES] nom accessible', () => {
    it('mode discret ACTIF : chaque solde masqué est nommé par SON compte', () => {
        setPrivacy(true);
        const { container } = renderSection();
        COMPTES.forEach((compte, idx) => {
            expect(container.querySelector(`#acc-balance-${idx}`), `le champ ${idx} doit porter le nom de son compte`)
                .toHaveAccessibleName(compte);
        });
    });

    // Un nom de compte peut contenir espaces et accents (« Épargne d'urgence »). Un `id` DÉRIVÉ de
    // ce texte serait invalide ou, pire, ferait collision après nettoyage — deux comptes distincts
    // avec le même `id` cassent l'association `<label htmlFor>` en SILENCE. D'où l'index.
    it('des noms de comptes exotiques ne cassent pas l’association libellé↔champ', () => {
        setPrivacy(true);
        const exotiques = { 'Épargne d’urgence #1': 11117, 'Épargne d urgence 1': 22229 };
        const { container } = renderSection(exotiques);
        Object.keys(exotiques).forEach((compte, idx) => {
            expect(container.querySelector(`#acc-balance-${idx}`)).toHaveAccessibleName(compte);
        });
        const ids = [...container.querySelectorAll('[id^="acc-balance-"]')].map((e) => e.id);
        expect(new Set(ids).size, 'deux comptes ont reçu le même id').toBe(ids.length);
    });
});

// ── Ce qui reste VISIBLE, à dessein ──────────────────────────────────────────────────────────
// Le NOM et le NOMBRE de comptes restent en clair. Ce ne sont pas des montants, et les masquer
// serait incohérent : le nom EST le libellé du champ — le retirer rendrait les boutons « ••• »
// indistinguables, soit exactement le défaut que ce lot corrige. Test d'INTENTION : sans lui, un
// futur « masquons tout » passerait sans que le choix soit rediscuté.
describe('[A11Y-PRIVACY-SOLDES-COMPTES] décision explicite : noms de comptes en clair', () => {
    it('mode discret ACTIF : les noms de comptes restent affichés', () => {
        setPrivacy(true);
        const { container } = renderSection();
        for (const compte of COMPTES) {
            expect(container.textContent, `le nom « ${compte} » doit rester lisible`).toContain(compte);
        }
    });
});
