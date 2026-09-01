import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { BudgetGroupTable, tendanceSparkline } from '../../components/budget/BudgetGroupTable';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';
import { formatPercent } from '../../utils/format';
import type { BudgetCategory } from '../../types';

// Régression : un groupe VIDE doit toujours afficher le bouton « + Ajouter »,
// sinon impossible de créer la 1re catégorie (INITIAL_BUDGET=[] → blocant pour
// tout nouvel utilisateur).
const baseProps = {
    allItems: [] as BudgetCategory[],
    actualsMap: {},
    trendMap: {},
    monthlyDataMap: {},
    totalBudgetDisplay: 0,
    monthProgress: 0,
    expandedId: null,
    onExpandToggle: vi.fn(),
    getDisplayTarget: () => 0,
    getDisplayAvg: () => null as number | null,
    isSolo: true,
    splitRatio1: 1,
    userNames: ['Moi', ''] as [string, string],
    timeView: 'MONTH' as const,
    onUpdateItem: vi.fn(),
    onDeleteItem: vi.fn(),
};

/**
 * [A11Y-PRIVACY-CHAINES-RESTANTES] La colonne « répartition » était UNE CHAÎNE (« Moi: 900 $ »,
 * « Mar:540 $ / Ann:360 $ ») : aucun nœud à masquer. Elle est maintenant une liste de parts.
 * Ce que ces deux cas défendent : le NOM reste lisible (sinon on ne sait plus QUI paie quoi) et le
 * MONTANT disparaît. Envelopper la phrase entière aurait masqué les deux.
 */
/**
 * [A11Y-BUDGETGROUP-CHART-NOALT] Les deux graphes de ce fichier étaient les seuls du dépôt sans nom
 * accessible ni alternative textuelle. Deux remèdes DIFFÉRENTS, et la différence est le sujet :
 * le graphe déplié reçoit le patron complet (`role="img"` + `ChartDataTable`), le sparkline — un
 * PAR LIGNE — reçoit un résumé, parce que six mois chiffrés par ligne noieraient le lecteur d'écran.
 */
describe('tendanceSparkline — le résumé qui remplace six mois de chiffres', () => {
    it('rend `null` quand aucune description honnête n\'est possible', () => {
        // L'appelant marque alors le graphe `aria-hidden` : mieux vaut muet qu'inventé.
        expect(tendanceSparkline([])).toBeNull();
        expect(tendanceSparkline([100])).toBeNull();
        expect(tendanceSparkline([NaN, Infinity])).toBeNull();
    });

    it('dit le SENS et l\'ampleur, en pourcentage — jamais un montant', () => {
        // ⚠️ L'attendu se COMPOSE avec `formatPercent` : en fr-CA, l'espace avant le « % » est
        // INSÉCABLE (U+00A0). Écrit avec une espace ordinaire, l'attendu échoue sur deux chaînes
        // visuellement identiques — même piège que l'insécable de `formatCAD` au lot 56.
        expect(tendanceSparkline([100, 110])).toBe(`2 mois, en hausse de ${formatPercent(10, 0)}`);
        expect(tendanceSparkline([200, 150])).toBe(`2 mois, en baisse de ${formatPercent(25, 0)}`);
        // ⚠️ Aucun « $ » : un ratio n'est pas un montant, il reste donc lisible en mode discret.
        // Un résumé « de 820 $ à 910 $ » aurait dû être masqué et n'aurait plus rien dit.
        expect(tendanceSparkline([820, 910])).not.toMatch(/\$/);
    });

    it('« stable » plutôt qu\'une hausse d\'arrondi, et pas de pourcentage infini depuis zéro', () => {
        expect(tendanceSparkline([100, 100.005])).toBe('2 mois, stable');
        // Départ à 0 : la variation relative est infinie. On annonce le sens seul.
        expect(tendanceSparkline([0, 500])).toBe('2 mois, en hausse');
    });
});

describe('BudgetGroupTable — alternatives textuelles des deux graphes', () => {
    const item: BudgetCategory = { id: 'c1', name: 'Épicerie', nature: 'Besoin', target: 900 } as BudgetCategory;
    const props = {
        ...baseProps,
        getDisplayTarget: () => 900,
        totalBudgetDisplay: 900,
        trendMap: { 'Épicerie': [800, 880] },
        monthlyDataMap: { 'Épicerie': [{ name: 'juil.', value: 820 }, { name: 'août', value: 910 }] },
        expandedId: 'c1',
    };

    afterEach(() => { useFinanceStore.setState({ isPrivacyMode: false }); });

    it('le sparkline est NOMMÉ, et son nom dit le poste et la tendance', () => {
        render(<BudgetGroupTable {...props} nature="Besoin" items={[item]} onAddItem={vi.fn()} />);
        expect(screen.getByRole('img', { name: `Tendance de Épicerie sur 2 mois, en hausse de ${formatPercent(10, 0)}` })).toBeInTheDocument();
    });

    it('sans données exploitables, le sparkline est MASQUÉ au lecteur d\'écran, pas nommé à tort', () => {
        render(<BudgetGroupTable {...props} trendMap={{}} nature="Besoin" items={[item]} onAddItem={vi.fn()} />);
        expect(screen.queryByRole('img', { name: /Tendance de Épicerie/ })).toBeNull();
    });

    it('le graphe déplié est nommé ET lisible : les six mois existent en table sr-only', () => {
        render(<BudgetGroupTable {...props} nature="Besoin" items={[item]} onAddItem={vi.fn()} />);
        expect(screen.getByRole('img', { name: /Dépenses mensuelles de Épicerie sur les six derniers mois/ })).toBeInTheDocument();
        const table = screen.getByRole('table', { name: /Dépenses mensuelles de Épicerie/ });
        const texte = (table.textContent ?? '').replace(/[\s\u00A0\u202F]+/g, ' ');
        expect(texte).toMatch(/juil\./);
        expect(texte).toMatch(/820/);
        expect(texte).toMatch(/910/);
    });

    it('[mode discret] l\'alternative textuelle n\'est pas une porte dérobée sur les montants', () => {
        useFinanceStore.setState({ isPrivacyMode: true });
        render(<BudgetGroupTable {...props} nature="Besoin" items={[item]} onAddItem={vi.fn()} />);
        const table = screen.getByRole('table', { name: /Dépenses mensuelles de Épicerie/ });
        const texte = (table.textContent ?? '').replace(/[\s\u00A0\u202F]+/g, ' ');
        // Les MOIS restent — sinon la table ne dirait plus de quoi elle parle — les montants non.
        expect(texte).toMatch(/juil\./);
        expect(texte).not.toMatch(/820/);
        expect(texte).not.toMatch(/910/);
        expect(texte).toMatch(new RegExp(MASKED_AMOUNT_LABEL));
    });
});

describe('BudgetGroupTable — répartition par personne et mode discret', () => {
    const item: BudgetCategory = { id: 'c1', name: 'Épicerie', nature: 'Besoin', target: 900, type: 'Commun' } as BudgetCategory;
    const props = {
        ...baseProps,
        isSolo: false,
        splitRatio1: 0.6,
        userNames: ['Marc', 'Anna'] as [string, string],
        getDisplayTarget: () => 900,
        totalBudgetDisplay: 900,
    };
    const cellules = () => Array.from(document.querySelectorAll('td'))
        .map((td) => (td.textContent ?? '').replace(/[\s\u00A0\u202F]+/g, ' ').trim());

    afterEach(() => { useFinanceStore.setState({ isPrivacyMode: false }); });

    it('mode NORMAL : les deux parts sont chiffrées (anti-vacuité)', () => {
        render(<BudgetGroupTable {...props} nature="Besoin" items={[item]} onAddItem={vi.fn()} />);
        const texte = cellules().join(' | ');
        expect(texte).toContain('Mar:');
        expect(texte).toContain('Ann:');
        expect(texte).toMatch(/540/);   // 900 × 0,6
        expect(texte).toMatch(/360/);   // 900 × 0,4
    });

    it('mode DISCRET : les NOMS restent, les montants partent', () => {
        useFinanceStore.setState({ isPrivacyMode: true });
        render(<BudgetGroupTable {...props} nature="Besoin" items={[item]} onAddItem={vi.fn()} />);
        const texte = cellules().join(' | ');
        expect(texte).toContain('Mar:');
        expect(texte).toContain('Ann:');
        expect(texte).not.toMatch(/540/);
        expect(texte).not.toMatch(/360/);
    });
});

describe('BudgetGroupTable — groupe vide', () => {
    it('affiche le bouton « + Ajouter » même sans aucune catégorie', () => {
        const onAddItem = vi.fn();
        render(<BudgetGroupTable {...baseProps} nature="Besoin" items={[]} onAddItem={onAddItem} />);
        const btn = screen.getByText(/Ajouter une ligne dans Besoin/i);
        expect(btn).toBeInTheDocument();
        fireEvent.click(btn);
        expect(onAddItem).toHaveBeenCalledWith('Besoin');
    });

    it('affiche un empty state explicite quand le groupe est vide', () => {
        render(<BudgetGroupTable {...baseProps} nature="Envie" items={[]} onAddItem={vi.fn()} />);
        expect(screen.getByText(/Aucune catégorie dans/i)).toBeInTheDocument();
    });

    it('rend les catégories existantes + garde le bouton « + Ajouter »', () => {
        const item: BudgetCategory = {
            id: 'c1', name: 'Épicerie', target: 100, frequency: 'Monthly', type: 'Commun', nature: 'Besoin',
        };
        render(
            <BudgetGroupTable
                {...baseProps}
                nature="Besoin"
                items={[item]}
                allItems={[item]}
                getDisplayTarget={() => 100}
                onAddItem={vi.fn()}
            />
        );
        expect(screen.getByDisplayValue('Épicerie')).toBeInTheDocument();
        expect(screen.getByText(/Ajouter une ligne dans Besoin/i)).toBeInTheDocument();
    });
});

// [BUDGET-3-VUES] — colonne « Moy. 12m » par poste (réel · moyenne · prévu, demande Marc).
describe('BudgetGroupTable — colonne moyenne 12 mois', () => {
    const item: BudgetCategory = {
        id: 'c1', name: 'Épicerie', target: 400, frequency: 'Monthly', type: 'Commun', nature: 'Besoin',
    };

    it('affiche la moyenne formatée quand elle est disponible (poste + bandeau de groupe)', () => {
        render(
            <BudgetGroupTable
                {...baseProps}
                nature="Besoin"
                items={[item]}
                allItems={[item]}
                actualsMap={{ 'Épicerie': 350 }}
                getDisplayTarget={() => 400}
                getDisplayAvg={() => 372}
                onAddItem={vi.fn()}
            />
        );
        expect(screen.getByText('Moy. 12m')).toBeInTheDocument();
        // Assertions SCOPÉES (finding panel : un regex global sur la page est fragile) :
        // la cellule de la LIGNE du poste, puis le total du bandeau de groupe.
        const row = screen.getByDisplayValue('Épicerie').closest('tr')!;
        expect(within(row as HTMLElement).getByText(/372/)).toBeInTheDocument();
        const header = screen.getByTitle('Réel · moyenne 12 mois · cible');
        expect(within(header).getByText(/372/)).toBeInTheDocument();
    });

    it('affiche « — » (jamais un faux 0) quand aucun historique révolu', () => {
        render(
            <BudgetGroupTable
                {...baseProps}
                nature="Besoin"
                items={[item]}
                allItems={[item]}
                getDisplayTarget={() => 400}
                getDisplayAvg={() => null}
                onAddItem={vi.fn()}
            />
        );
        // Cellule du poste + total du bandeau : les deux rendent « — », aucun « 0 $ » de moyenne
        expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
        expect(screen.getByTitle(/moyenne indisponible/i)).toBeInTheDocument();
        // A11y (finding panel) : le « — » porte un texte accessible sr-only aux DEUX endroits
        // (title seul n'est pas fiable pour lecteur d'écran).
        expect(screen.getByText('Moyenne indisponible (aucun mois plein d\'historique)')).toBeInTheDocument();
        expect(screen.getByText('Moyenne du groupe indisponible (aucun mois plein d\'historique)')).toBeInTheDocument();
    });
});

// [REFONTE-NAV-L5] — cross-link « Voir les transactions » (poste → Transactions filtrées).
describe('BudgetGroupTable — cross-link Voir les transactions', () => {
    const item: BudgetCategory = {
        id: 'c1', name: 'Épicerie', target: 400, frequency: 'Monthly', type: 'Commun', nature: 'Besoin',
    };

    it('la ligne dépliée offre « Voir les transactions » et remonte le NOM du poste', () => {
        const onViewTransactions = vi.fn();
        render(
            <BudgetGroupTable
                {...baseProps}
                nature="Besoin"
                items={[item]}
                allItems={[item]}
                expandedId="c1"
                getDisplayTarget={() => 400}
                onAddItem={vi.fn()}
                onViewTransactions={onViewTransactions}
            />
        );
        const btn = screen.getByRole('button', { name: /Voir les transactions de la catégorie Épicerie/i });
        fireEvent.click(btn);
        expect(onViewTransactions).toHaveBeenCalledWith('Épicerie');
    });

    it('sans callback (rétro-compat) : aucun lien rendu', () => {
        render(
            <BudgetGroupTable
                {...baseProps}
                nature="Besoin"
                items={[item]}
                allItems={[item]}
                expandedId="c1"
                getDisplayTarget={() => 400}
                onAddItem={vi.fn()}
            />
        );
        expect(screen.queryByText(/Voir les transactions/i)).toBeNull();
    });

    it('chaque ligne porte l\'ancre de deep-link data-focus-section="poste:<nom>"', () => {
        const { container } = render(
            <BudgetGroupTable
                {...baseProps}
                nature="Besoin"
                items={[item]}
                allItems={[item]}
                getDisplayTarget={() => 400}
                onAddItem={vi.fn()}
            />
        );
        expect(container.querySelector('[data-focus-section="poste:Épicerie"]')).toBeTruthy();
    });
});

// [A11Y-PRIVACY-SALAIRE] Le champ « montant de base » n'avait AUCUN nommeur : ni `id` + `<label>`,
// ni `aria-label`. Son nom accessible venait du `title`, IDENTIQUE sur chaque ligne — « Modifier le
// montant de base », sans jamais dire de quel poste. Un tableau de 10 postes annonçait donc 10 fois
// le même nom. En mode discret c'est pire : `PrivateNumberInput` remplace ce `title` par le libellé
// masqué, et les lignes deviennent rigoureusement indistinguables.
describe('BudgetGroupTable — nom accessible du montant par poste', () => {
    const items: BudgetCategory[] = [
        { id: 'c1', name: 'Épicerie', target: 400, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
        { id: 'c2', name: 'Restaurants', target: 150, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
    ] as BudgetCategory[];

    const renderTable = () =>
        render(<BudgetGroupTable {...baseProps} nature="Besoin" items={items} onAddItem={vi.fn()} />);

    it('chaque ligne nomme son montant par le POSTE (deux lignes ≠ deux noms)', () => {
        const { container } = renderTable();
        const champs = [...container.querySelectorAll('input[type="number"]')];
        expect(champs.length, 'une ligne = un champ montant').toBeGreaterThanOrEqual(2);
        expect(champs[0]).toHaveAccessibleName('Montant de base — Épicerie');
        expect(champs[1]).toHaveAccessibleName('Montant de base — Restaurants');
    });

    // Le nom porte le POSTE, jamais le MONTANT : il doit survivre au masquage sans rien divulguer.
    it('en mode discret, le nom survit ET ne porte aucun montant', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        const { container } = renderTable();
        const boutons = [...container.querySelectorAll('button')]
            .filter((b) => (b.textContent ?? '').includes('•••'));
        expect(boutons.length, 'les montants doivent être masqués').toBeGreaterThanOrEqual(2);
        expect(boutons[0]).toHaveAccessibleName('Montant de base — Épicerie');
        expect(boutons[1]).toHaveAccessibleName('Montant de base — Restaurants');
        const noms = boutons.map((b) => b.getAttribute('aria-label') ?? '').join(' ');
        expect(noms, 'le nom ne doit JAMAIS porter le montant').not.toContain('400');
        expect(noms).not.toContain('150');
        act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
    });
});
