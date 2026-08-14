// [SEC-PRIVACY-BLUR-INPUTS, audit 2026-06-23] PrivateNumberInput : champ ÉDITABLE qui, en mode discret
// hors-focus, sort la VALEUR du DOM (••• comme PrivateAmount) et la révèle au clic/focus pour l'édition.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { PrivateNumberInput } from '../../../components/ui/PrivateNumberInput';
import { useFinanceStore } from '../../../store/useFinanceStore';

/** Marqueur d'état masqué, désormais porté par un texte sr-only (et non plus par un `aria-label`
 *  en dur, qui écrasait le nom du champ — cf. [A11Y-PRIVACY-SALAIRE] plus bas). */
const MASKED_HINT = 'Montant masqué — cliquer pour modifier';

describe('[SEC-PRIVACY-BLUR-INPUTS] PrivateNumberInput', () => {
    beforeEach(() => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
    });

    it('mode discret INACTIF : rend un <input> éditable avec la valeur', () => {
        render(<PrivateNumberInput type="number" value={1234} onChange={() => {}} />);
        const input = screen.getByDisplayValue('1234');
        expect(input.tagName).toBe('INPUT');
    });

    it('mode discret ACTIF + hors-focus : la VALEUR sort du DOM (bouton •••, aucun input)', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        const { container } = render(<PrivateNumberInput type="number" value={1234} onChange={() => {}} />);
        expect(container.querySelector('input')).toBeNull();
        expect(screen.queryByDisplayValue('1234')).toBeNull();
        expect(container.textContent).not.toContain('1234'); // zéro fuite copier-coller/inspecteur/SR
        const btn = container.querySelector('button')!;
        expect(btn.querySelector('[aria-hidden="true"]')?.textContent).toBe('•••');
        // Sans autre nommeur, le marqueur sr-only devient le NOM du bouton (dernier recours de
        // l'algorithme de nom accessible) : l'état masqué reste annoncé.
        expect(btn).toHaveAccessibleName(MASKED_HINT);
    });

    it('mode discret ACTIF : le clic révèle un <input> éditable (focus-to-edit)', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        const { container } = render(<PrivateNumberInput type="number" value={1234} onChange={() => {}} />);
        const btn = container.querySelector('button')!;
        act(() => { fireEvent.click(btn); });
        const input = screen.getByDisplayValue('1234');
        expect(input.tagName).toBe('INPUT');
    });

    it('le bouton masqué stoppe la propagation du clic (ne toggle pas la ligne parente)', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        let parentClicked = false;
        const { container } = render(
            <div onClick={() => { parentClicked = true; }}>
                <PrivateNumberInput type="number" value={1} onChange={() => {}} />
            </div>,
        );
        act(() => { fireEvent.click(container.querySelector('button')!); });
        expect(parentClicked).toBe(false);
    });

    it('mode discret ACTIF : le blur re-masque (la valeur ressort du DOM)', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        const { container } = render(<PrivateNumberInput type="number" value={1234} onChange={() => {}} />);
        act(() => { fireEvent.click(container.querySelector('button')!); });
        expect(screen.getByDisplayValue('1234').tagName).toBe('INPUT');
        act(() => { fireEvent.blur(container.querySelector('input')!); });
        expect(container.querySelector('input')).toBeNull();
        expect(container.querySelector('button')?.textContent).toContain('•••');
    });

    it('mode discret ACTIF : le focus clavier (Tab) sur le bouton révèle l\'input', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        const { container } = render(<PrivateNumberInput type="number" value={1234} onChange={() => {}} />);
        act(() => { fireEvent.focus(container.querySelector('button')!); });
        expect(screen.getByDisplayValue('1234').tagName).toBe('INPUT');
    });

    it('activer le mode discret PENDANT l\'édition re-masque (la valeur ressort du DOM)', () => {
        const { container } = render(<PrivateNumberInput type="number" value={1234} onChange={() => {}} />);
        expect(screen.getByDisplayValue('1234')).toBeTruthy(); // édité hors mode discret
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        expect(container.querySelector('input')).toBeNull();
        expect(screen.queryByDisplayValue('1234')).toBeNull();
        expect(container.querySelector('button')?.textContent).toContain('•••');
    });

    it('propage le `id` au bouton masqué ET à l\'input (association <label htmlFor> préservée)', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        const { container } = render(<PrivateNumberInput id="champ-x" type="number" value={1} onChange={() => {}} />);
        expect(container.querySelector('button')?.getAttribute('id')).toBe('champ-x');
        act(() => { fireEvent.click(container.querySelector('button')!); });
        expect(container.querySelector('input')?.getAttribute('id')).toBe('champ-x');
    });

    // ── [A11Y-PRIVACY-SALAIRE] le masque ne doit pas voler le NOM du champ ──────────────────
    // Le bouton portait `aria-label={MASKED_AMOUNT_LABEL} — cliquer pour modifier` EN DUR.
    // `aria-label` est prioritaire sur les DEUX nommeurs utilisés dans le dépôt : le
    // `<label htmlFor>` (salaires de Profil) et l'`aria-label` du champ (Asset Location, FE, RSU).
    // MESURÉ : les deux devenaient « Montant masqué — cliquer pour modifier ». En mode discret,
    // tous les champs d'un même formulaire annonçaient donc le même nom.
    // Ces trois tests ÉCHOUENT sur la version d'avant (le nom vaut le libellé masqué dans les
    // trois cas) — c'est ce qui les rend discriminants.
    describe('nom accessible du bouton masqué', () => {
        beforeEach(() => { act(() => { useFinanceStore.setState({ isPrivacyMode: true }); }); });

        it('nommé par <label htmlFor> : le libellé du champ SURVIT au masquage', () => {
            const { container } = render(
                <div>
                    <label htmlFor="p1">Salaire Brut annuel ($)</label>
                    <PrivateNumberInput id="p1" type="number" value={1} onChange={() => {}} />
                </div>,
            );
            expect(container.querySelector('button')).toHaveAccessibleName('Salaire Brut annuel ($)');
        });

        it('nommé par aria-label : le libellé du champ SURVIT au masquage', () => {
            const { container } = render(
                <PrivateNumberInput aria-label="RSU vesting annuel" type="number" value={1} onChange={() => {}} />,
            );
            expect(container.querySelector('button')).toHaveAccessibleName('RSU vesting annuel');
        });

        it("l'état masqué est annoncé en DESCRIPTION, donc sans écraser aucun nom", () => {
            const { container } = render(
                <PrivateNumberInput aria-label="RSU vesting annuel" type="number" value={1} onChange={() => {}} />,
            );
            expect(container.querySelector('button')).toHaveAccessibleDescription('Montant masqué');
        });

        it('deux champs voisins masqués restent DISTINGUABLES', () => {
            const { container } = render(
                <div>
                    <PrivateNumberInput aria-label="Salaire brut" type="number" value={1} onChange={() => {}} />
                    <PrivateNumberInput aria-label="Salaire net" type="number" value={2} onChange={() => {}} />
                </div>,
            );
            const [brut, net] = [...container.querySelectorAll('button')];
            expect(brut, 'les deux champs annonçaient le même nom').toHaveAccessibleName('Salaire brut');
            expect(net, 'les deux champs annonçaient le même nom').toHaveAccessibleName('Salaire net');
            cleanup();
        });
    });
});
