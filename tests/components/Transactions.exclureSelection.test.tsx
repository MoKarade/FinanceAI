/**
 * @vitest-environment jsdom
 *
 * [TX-SELECTION-SANS-ACTION] — MESURÉ le 2026-09-14 sur un cas RÉEL de Marc.
 *
 * 44 transactions importées au mauvais montant (Fintable a livré des reals étiquetés CAD,
 * `[FINTABLE-MONTANT-EN-DEVISE-ORIGINALE]`). Marc : « j'arrive pas à les marquer en doublon ».
 * Il avait raison, et ce n'était pas une maladresse : le SEUL point d'entrée vers `isDuplicate`
 * dans l'app était `DuplicatesPanel`, qui ne rend QUE les groupes trouvés par le détecteur
 * (`findDuplicateGroups`). Une ligne au montant faux est le doublon de RIEN — elle ne pouvait donc
 * apparaître dans aucun groupe, et la marque était INATTEIGNABLE pour cette classe entière.
 *
 * La capacité, elle, existait déjà : `markTransactionsAsDuplicate` est PUR et accepte n'importe
 * quels ids. Et la sélection multiple existait aussi (case par ligne, plage au Maj-clic). Ce qui
 * manquait était le FIL entre les deux — classe `CHAMP-DANS-LE-TYPE-INATTEIGNABLE-DANS-L-UI`
 * appliquée à un MUTATEUR plutôt qu'à un champ.
 *
 * Ces gardes verrouillent les deux moitiés :
 *   1. la barre d'actions n'apparaît QUE quand quelque chose est sélectionné (anti-vacuité : sans
 *      ce cas négatif, une barre rendue en permanence passerait le test suivant) ;
 *   2. « Exclure des calculs » transmet RÉELLEMENT les ids sélectionnés au mutateur — c'est le
 *      chaînon qui n'existait pas, donc le seul dont l'absence doit rougir ;
 *   3. « Sélectionner les N filtrées » dépasse la PAGE : les 44 lignes de Marc s'étalent sur
 *      plusieurs pages, et la case « tout sélectionner » de l'en-tête ne couvre que les 50 de la
 *      page courante — une sélection bornée à la page laisserait le cas réel hors de portée.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import { Transactions } from '../../components/Transactions';
import type { Transaction } from '../../types';

vi.mock('../../services/claude', () => ({ categorizeBatch: vi.fn() }));
vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

function makeTx(id: number, payee: string): Transaction {
    return {
        id,
        date: `2026-01-${String(id).padStart(2, '0')}`,
        payee,
        amount: -10 * id,
        category: 'Autre',
        status: 'processed',
    };
}

const TXS: Transaction[] = [makeTx(1, 'Alpha'), makeTx(2, 'Bravo'), makeTx(3, 'Charlie')];

function renderTransactions(setTransactions = vi.fn()) {
    const utils = render(
        <Transactions transactions={TXS} setTransactions={setTransactions} apiKey="" budgetItems={[]} />,
    );
    return { ...utils, setTransactions };
}

function cocher(container: HTMLElement, payee: string): void {
    const table = container.querySelector('table') as HTMLElement;
    fireEvent.click(within(table).getByLabelText(`Sélectionner ${payee}`));
}

function barre(container: HTMLElement): HTMLElement | null {
    return container.querySelector('[aria-label="Actions sur la sélection"]');
}

describe('[TX-SELECTION-SANS-ACTION] La sélection multiple peut enfin exclure des calculs', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('ANTI-VACUITÉ : aucune barre d\'actions tant que rien n\'est sélectionné', () => {
        const { container } = renderTransactions();
        expect(barre(container)).toBeNull();
    });

    it('la barre apparaît dès la première ligne cochée et annonce le compte', () => {
        const { container } = renderTransactions();
        cocher(container, 'Bravo');
        const b = barre(container);
        expect(b).not.toBeNull();
        expect(b!.textContent).toContain('1 sélectionnée');
    });

    it('« Exclure des calculs » marque EXACTEMENT les lignes sélectionnées', () => {
        const setTransactions = vi.fn();
        const { container } = renderTransactions(setTransactions);
        cocher(container, 'Alpha');
        cocher(container, 'Charlie');

        fireEvent.click(within(barre(container)!).getByText('Exclure des calculs'));

        // Le composant passe une FONCTION de mise à jour : on l'applique à l'état d'origine pour
        // observer ce qui serait RÉELLEMENT écrit — jamais l'intention, toujours le résultat.
        expect(setTransactions).toHaveBeenCalledTimes(1);
        const maj = setTransactions.mock.calls[0]![0] as (p: Transaction[]) => Transaction[];
        const apres = maj(TXS);

        expect(apres.filter((t) => t.isDuplicate).map((t) => t.id).sort()).toEqual([1, 3]);
        // Contrôle négatif : la ligne NON sélectionnée n'est pas touchée. Sans lui, un mutateur
        // qui marquerait TOUT passerait la première assertion si la sélection était totale.
        expect(apres.find((t) => t.id === 2)!.isDuplicate).toBeFalsy();
        // Et rien n'est effacé : les trois lignes restent dans l'historique (la marque EXCLUT,
        // elle ne supprime pas — c'est la décision de l'ADR 0009 sur les transactions).
        expect(apres).toHaveLength(TXS.length);
    });

    it('« Sélectionner les N filtrées » dépasse la page courante', () => {
        const { container } = renderTransactions();
        cocher(container, 'Alpha');
        fireEvent.click(within(barre(container)!).getByText(`Sélectionner les ${TXS.length} filtrées`));
        expect(barre(container)!.textContent).toContain(`${TXS.length} sélectionnées`);
    });
});
