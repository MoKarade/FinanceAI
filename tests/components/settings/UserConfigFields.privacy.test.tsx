// tests/components/settings/UserConfigFields.privacy.test.tsx
//
// [A11Y-PRIVACY-SALAIRE] — MODE DISCRET : la SAISIE, pas seulement l'affichage.
//
// La PR #608 a couvert les écrans de LECTURE. Les formulaires de Profil/Réglages, eux, rendaient
// les données les plus sensibles de l'app en `<input type="number" value={…}>` non masqué : salaire
// brut ET net des DEUX conjoints, facteur d'équivalence, RSU, revenus secondaires. Ce fichier
// n'avait AUCUNE référence au mode discret.
//
// ⚠️ La valeur d'un champ ÉDITABLE ne vit PAS dans `textContent` : elle vit dans `.value` du DOM.
// Un test qui ne regarde que le texte aplati est aveugle à cette classe de fuite — c'est
// exactement pour ça qu'elle a survécu à #608. On inspecte donc les deux canaux.
//
// Contrat du dépôt (ADR-5 / PrivateAmount / PrivateNumberInput) : masquer = NE PAS RENDRE. La
// valeur doit SORTIR du DOM, pas être floutée — sinon elle reste au copier-coller, à l'inspecteur
// et au lecteur d'écran.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { useFinanceStore } from '../../../store/useFinanceStore';
import { UserConfigFields } from '../../../components/settings/UserConfigFields';
import type { User } from '../../../types';

vi.mock('../../../components/ui/Toast', () => ({ showToast: vi.fn() }));

const initial = useFinanceStore.getState();

// Montants « uniques » : aucun autre nombre de l'écran ne peut les imiter par hasard.
const GROSS_MONTHLY_1 = 7013;   // → brut ANNUEL affiché 84156
const GROSS_MONTHLY_2 = 4987;   // → brut ANNUEL affiché 59844
const NET_1 = 5163;
const NET_2 = 4271;
const FE_1 = 9317;
const RSU_1 = 41337;
const SIDE_1 = 27431;

const ANNUAL_1 = String(GROSS_MONTHLY_1 * 12);
const ANNUAL_2 = String(GROSS_MONTHLY_2 * 12);

/** Toutes les valeurs réellement présentes dans les champs éditables du DOM. */
const inputValues = (c: HTMLElement) =>
    [...c.querySelectorAll('input')].map((i) => (i as HTMLInputElement).value).join('|');

/** Texte du DOM sans aucune espace + tous les attributs porteurs de texte (title / aria-label /
 *  placeholder) : une valeur sensible peut sortir par un ATTRIBUT sans jamais toucher textContent. */
const allText = (c: HTMLElement) => {
    const attrs = [...c.querySelectorAll('[title], [aria-label], [placeholder]')]
        .map((el) => `${el.getAttribute('title') ?? ''} ${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('placeholder') ?? ''}`)
        .join(' ');
    return `${c.textContent ?? ''} ${attrs} ${inputValues(c)}`.replace(/[\s  ]/g, '');
};

const setPrivacy = (on: boolean) => act(() => { useFinanceStore.setState({ isPrivacyMode: on }); });

beforeEach(() => {
    useFinanceStore.setState(initial, true);
    const init = useFinanceStore.getState().config;
    useFinanceStore.setState({
        config: {
            ...init,
            users: [
                {
                    ...init.users[0], name: 'Marc',
                    grossSalary: GROSS_MONTHLY_1, netSalary: NET_1, facteurEquivalence: FE_1,
                    rsuVestingPerYear: RSU_1, sideIncomeAnnual: SIDE_1, bonusPctOfGross: 11,
                },
                { ...init.users[1], name: 'Anna', grossSalary: GROSS_MONTHLY_2, netSalary: NET_2 },
            ] as [User, User],
            splitMode: 'prorata',
        },
    });
});

afterEach(() => { cleanup(); setPrivacy(false); });

describe('[A11Y-PRIVACY-SALAIRE] Profil — salaires des deux conjoints', () => {
    it('mode discret INACTIF : brut annuel et net des DEUX conjoints sont LISIBLES (le test discrimine)', () => {
        const { container } = render(<UserConfigFields section="salary" />);
        const values = inputValues(container);
        expect(values, 'brut annuel du conjoint 1').toContain(ANNUAL_1);
        expect(values, 'brut annuel du conjoint 2').toContain(ANNUAL_2);
        expect(values, 'net du conjoint 1').toContain(String(NET_1));
        expect(values, 'net du conjoint 2').toContain(String(NET_2));
    });

    it('mode discret ACTIF : les quatre salaires SORTENT du DOM (aucun input rendu)', () => {
        setPrivacy(true);
        const { container } = render(<UserConfigFields section="salary" />);
        const text = allText(container);
        expect(text, 'le brut annuel du conjoint 1 fuyait').not.toContain(ANNUAL_1);
        expect(text, 'le brut annuel du conjoint 2 fuyait').not.toContain(ANNUAL_2);
        expect(text, 'le net du conjoint 1 fuyait').not.toContain(String(NET_1));
        expect(text, 'le net du conjoint 2 fuyait').not.toContain(String(NET_2));
        // Le contrat est « ne pas rendre », pas « flouter » : zéro champ éditable dans le DOM.
        expect(container.querySelectorAll('input')).toHaveLength(0);
        expect(container.querySelectorAll('button')).toHaveLength(4);
    });

    it('mode discret ACTIF : le clic révèle le champ, le blur le re-masque (édition possible)', () => {
        setPrivacy(true);
        const { container } = render(<UserConfigFields section="salary" />);
        const btn = container.querySelector('[data-focus-section="profile-user1-grossSalary"] button')!;
        act(() => { fireEvent.click(btn); });
        const input = container.querySelector('[data-focus-section="profile-user1-grossSalary"] input') as HTMLInputElement;
        expect(input.value, 'la valeur doit revenir telle quelle pour être éditée').toBe(ANNUAL_1);
        act(() => { fireEvent.blur(input); });
        expect(container.querySelector('[data-focus-section="profile-user1-grossSalary"] input')).toBeNull();
    });

    // ⚠️ Fuite par la STRUCTURE, pas par la valeur (leçon #608) : masquer les montants ne doit pas
    // faire disparaître le champ ni changer le nombre de contrôles selon le contenu.
    // ⚠️ HONNÊTETÉ SUR CE QUE CE TEST PROUVE (revue de #629) : il ne prouve RIEN sur le correctif de
    // nom accessible de ce lot, et il passait déjà avant que ce fichier utilise `PrivateNumberInput`.
    // Le rendu masqué est un `<button>` inconditionnel : sa structure ne peut pas dépendre du montant.
    // C'est une garde de NON-RÉGRESSION FUTURE (le jour où quelqu'un rendra la structure dépendante
    // de la valeur, comme l'avait fait `TaxBracketViz` avec ses lignes par palier atteint) — pas une
    // preuve du fix. Le ne pas dire laisserait croire que cette classe de fuite est couverte ici.
    it('mode discret ACTIF : deux ménages très différents rendent un DOM indiscernable', () => {
        setPrivacy(true);
        const shape = () => {
            const { container } = render(<UserConfigFields section="salary" />);
            const s = `${container.querySelectorAll('button').length}/${container.querySelectorAll('input').length}`;
            cleanup();
            return s;
        };
        const riche = shape();
        act(() => {
            const c = useFinanceStore.getState().config;
            useFinanceStore.setState({
                config: { ...c, users: [{ ...c.users[0], grossSalary: 1, netSalary: 1 }, { ...c.users[1], grossSalary: 0, netSalary: 0 }] as [User, User] },
            });
        });
        expect(shape(), 'le nombre de contrôles trahissait le niveau de revenu').toBe(riche);
    });
});

describe('[A11Y-PRIVACY-SALAIRE] Profil — autres MONTANTS du même formulaire', () => {
    it('mode discret INACTIF : FE, RSU et revenus secondaires sont LISIBLES (le test discrimine)', () => {
        const { container: fiscal } = render(<UserConfigFields section="fiscal" />);
        expect(inputValues(fiscal), "facteur d'équivalence").toContain(String(FE_1));
        cleanup();
        const { container: detail } = render(<UserConfigFields section="detailed" />);
        const v = inputValues(detail);
        expect(v, 'RSU annuels').toContain(String(RSU_1));
        expect(v, 'revenus secondaires').toContain(String(SIDE_1));
    });

    it('mode discret ACTIF : FE, RSU et revenus secondaires SORTENT du DOM', () => {
        setPrivacy(true);
        const { container: fiscal } = render(<UserConfigFields section="fiscal" />);
        expect(allText(fiscal), "le facteur d'équivalence fuyait la valeur du régime de retraite").not.toContain(String(FE_1));
        cleanup();
        const { container: detail } = render(<UserConfigFields section="detailed" />);
        const text = allText(detail);
        expect(text, 'les RSU fuyaient').not.toContain(String(RSU_1));
        expect(text, 'les revenus secondaires fuyaient').not.toContain(String(SIDE_1));
    });

    // Le bonus est un POURCENTAGE, pas un montant : laissé en clair à dessein (le brut auquel il
    // s'applique est masqué, donc il ne reconstitue aucune somme). Test d'INTENTION — sans lui, un
    // futur « masquons tout » passerait sans que la décision soit rediscutée.
    it('le bonus en % reste éditable en mode discret (décision explicite)', () => {
        setPrivacy(true);
        const { container } = render(<UserConfigFields section="detailed" />);
        const pct = container.querySelector('input[aria-label="Bonus en % du brut"]') as HTMLInputElement | null;
        expect(pct, 'le champ % ne doit PAS être masqué').not.toBeNull();
        expect(pct!.value).toBe('11');
    });
});

// ── Nommage : masquer ne doit pas rendre le formulaire inutilisable au lecteur d'écran ────────
// Défaut MESURÉ avant ce lot (`computeAccessibleName`) : le bouton « ••• » portait un `aria-label`
// EN DUR, prioritaire sur les deux façons dont un champ est nommé ici — le `<label htmlFor>` des
// salaires et l'`aria-label` du FE/RSU. Les cinq champs annonçaient donc le même nom
// « Montant masqué — cliquer pour modifier » : impossible de savoir lequel on édite.
describe('[A11Y-PRIVACY-SALAIRE] nom accessible des champs masqués', () => {
    it('mode discret ACTIF : chaque champ masqué garde SON nom', () => {
        setPrivacy(true);
        const { container } = render(<UserConfigFields section="salary" />);
        const [brut1, net1, brut2, net2] = [...container.querySelectorAll('button')];
        expect(brut1).toHaveAccessibleName('Salaire Brut annuel ($)');
        expect(net1).toHaveAccessibleName('Salaire Net mensuel ($)');
        expect(brut2, 'le conjoint 2 doit être nommé comme le conjoint 1').toHaveAccessibleName('Salaire Brut annuel ($)');
        expect(net2, 'le conjoint 2 doit être nommé comme le conjoint 1').toHaveAccessibleName('Salaire Net mensuel ($)');
        // …et l'état masqué est bien annoncé, en DESCRIPTION (title), sans écraser le nom.
        expect(screen.getAllByTitle('Montant masqué')).toHaveLength(4);
    });

    it('mode discret ACTIF : un champ nommé par aria-label garde le sien', () => {
        setPrivacy(true);
        const { container } = render(<UserConfigFields section="detailed" />);
        const [rsu, side] = [...container.querySelectorAll('button')];
        expect(rsu).toHaveAccessibleName('RSU vesting annuel');
        expect(side).toHaveAccessibleName('Revenus secondaires annuels');
    });
});
