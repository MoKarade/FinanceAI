// [AI-BUDGETMODAL-RAW-FALLBACK] Une réponse NON validée ne prend pas l'apparence d'une réponse
// validée.
//
// ⚠️ Quand le modèle rend le JSON demandé, chaque entrée traverse `RecosSchema`. Quand il rend
// autre chose, l'app affichait le texte BRUT dans les mêmes puces — indiscernable d'une
// recommandation vérifiée.
//
// ⚠️ Le ticket prescrivait « échec honnête plutôt qu'affichage de secours ». Ce serait une
// RÉGRESSION : le repli est délibéré (`[BUDGET-AI-DUP-PARSING]`) — jeter une réponse lisible pour
// cause de format est pire que de la montrer. Ce qui manquait n'est pas le refus mais le STATUT.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BudgetAiModal, type BudgetAiPayload } from '../../components/budget/BudgetAiModal';

/** Le flux renvoyé par le faux `chatStream`, réécrit par cas. */
let reponseModele = '';

vi.mock('../../services/claude', async () => {
    const reel = await vi.importActual<typeof import('../../services/claude')>('../../services/claude');
    return {
        ...reel,
        MODEL_HAIKU: 'claude-haiku-test',
        // eslint-disable-next-line require-yield
        chatStream: async function* () { yield reponseModele; },
    };
});

const payload: BudgetAiPayload = {
    totalNetIncome: 5000, totalBudget: 4000, totalSpent: 3800, alerts: [],
    categories: [{ name: 'Épicerie', nature: 'Besoin', target: 800, spent: 910 }],
} as unknown as BudgetAiPayload;

beforeEach(() => { reponseModele = ''; });

describe('[AI-BUDGETMODAL-RAW-FALLBACK] la forme de la réponse est LISIBLE', () => {
    it('réponse conforme : des recommandations, sans avertissement de format', async () => {
        reponseModele = JSON.stringify(['Réduis l\'épicerie de 100 $.', 'Bloque 200 $ d\'épargne.', 'Revois les abonnements.']);
        render(<BudgetAiModal apiKey="sk-test" payload={payload} onClose={() => {}} />);
        await waitFor(() => expect(screen.getByText(/Réduis l'épicerie/)).toBeTruthy());
        // ⚠️ Contrôle : sans lui, « l'avertissement apparaît sur du brut » serait aussi vrai d'un
        // avertissement affiché EN PERMANENCE, qui ne distinguerait plus rien.
        expect(screen.queryByText(/pas répondu dans le format attendu/)).toBeNull();
        expect(screen.getAllByText(/Réduis|Bloque|Revois/)).toHaveLength(3);
    });

    it('réponse NON conforme : le texte est conservé, mais MARQUÉ', async () => {
        reponseModele = 'Je te suggère surtout de revoir ton épicerie, elle dépasse de 110 $ ce mois-ci.';
        render(<BudgetAiModal apiKey="sk-test" payload={payload} onClose={() => {}} />);
        await waitFor(() => expect(screen.getByText(/revoir ton épicerie/)).toBeTruthy());
        // Le texte n'est PAS jeté — c'est le choix de `[BUDGET-AI-DUP-PARSING]`, et le remettre en
        // cause serait une régression déguisée en correctif.
        expect(screen.getByText(/revoir ton épicerie/)).toBeTruthy();
        // …mais il dit ce qu'il est.
        expect(screen.getByText(/n'a été ni découpée ni vérifiée par l'app/)).toBeTruthy();
    });

    it('les deux formes ne se RESSEMBLENT pas — c\'était tout le défaut', async () => {
        // ⚠️ L'assertion qui porte le lot. Le texte d'avertissement pourrait exister tout en laissant
        // le contenu dans une puce identique à une recommandation validée : on vérifie donc que le
        // conteneur DIFFÈRE, pas seulement qu'une phrase a été ajoutée.
        reponseModele = JSON.stringify(['Réduis l\'épicerie de 100 $.', 'Bloque 200 $.', 'Revois les abonnements.']);
        const { container: conforme, unmount } = render(<BudgetAiModal apiKey="sk-test" payload={payload} onClose={() => {}} />);
        await waitFor(() => expect(screen.getByText(/Réduis l'épicerie/)).toBeTruthy());
        const classesValidees = conforme.querySelector('.rounded-lg.p-4')?.className ?? '';
        unmount();

        reponseModele = 'Texte libre du modèle, hors format.';
        const { container: brut } = render(<BudgetAiModal apiKey="sk-test" payload={payload} onClose={() => {}} />);
        await waitFor(() => expect(screen.getByText(/Texte libre du modèle/)).toBeTruthy());
        const classesBrutes = brut.querySelector('.rounded-lg.p-4')?.className ?? '';

        expect(classesValidees, 'la mesure est vide — le sélecteur ne trouve plus les blocs').not.toBe('');
        expect(classesBrutes).not.toBe('');
        expect(classesBrutes, 'les deux formes ont le MÊME habillage : le défaut est intact').not.toBe(classesValidees);
    });
});
