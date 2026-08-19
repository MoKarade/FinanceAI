// CA-04 — smoke test : DebtManager (money-critical, aucun test direct jusqu'ici).
// Vérifie qu'il rend SANS CRASH (liste vide → EmptyState ; avec dette → affichée).
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DebtManager } from '../../components/DebtManager';
import type { Debt } from '../../types';

// recharts : jsdom n'a pas de dimensions SVG → passthrough.
vi.mock('recharts', async () => {
    const React = await import('react');
    const P = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
    return {
        ResponsiveContainer: P, AreaChart: P, Area: () => null,
        XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
    };
});

describe('DebtManager — smoke (CA-04)', () => {
    it('rend sans crash avec une liste vide', () => {
        const { container } = render(<DebtManager debts={[]} setDebts={vi.fn()} />);
        expect(container).toBeTruthy();
    });

    it('affiche une dette fournie', () => {
        const debts: Debt[] = [
            { id: 'd1', name: 'Carte Visa', balance: 5000, interestRate: 19.99, minimumPayment: 150, category: 'CreditCard' },
        ];
        render(<DebtManager debts={debts} setDebts={vi.fn()} />);
        expect(screen.getByText(/Carte Visa/)).toBeTruthy();
        // [A11Y-SLIDERS] le slider de paiement supplémentaire porte un nom accessible.
        expect(screen.getByRole('slider', { name: 'Paiement Mensuel Supplémentaire' })).toBeInTheDocument();
    });

    // [FMT-CURRENCY-UNIFY] garde : aucun montant rendu en float brut « 1100$ » (sans
    // séparateur de milliers) — tout passe par formatCAD (fr-CA : « 1 100 $ »).
    it('formate les montants en fr-CA (pas de float brut collé au $)', () => {
        const debts: Debt[] = [
            { id: 'd1', name: 'Prêt auto', balance: 37000, interestRate: 6.5, minimumPayment: 1100, category: 'Car' },
        ];
        const { container } = render(<DebtManager debts={debts} setDebts={vi.fn()} />);
        const text = container.textContent ?? '';
        // 4 chiffres ou plus collés à « $ » = formatage manuel oublié (ex. « 1100$ », « 37000$ »).
        expect(text).not.toMatch(/\d{4,}\$/);
        // La devise est bien présente (montants formatés).
        expect(text).toContain('$');
    });

    // [A11Y-CHARTS] la courbe d'extinction a une alternative sr-only (role="img" + ChartDataTable),
    // et cette table MASQUE les $ en mode discret (ne réintroduit PAS la fuite vie privée).
    it('graphe : alternative sr-only présente + masque les $ en mode discret', async () => {
        const { useFinanceStore } = await import('../../store/useFinanceStore');
        const { act } = await import('@testing-library/react');
        const debts: Debt[] = [
            { id: 'd1', name: 'Prêt', balance: 50000, interestRate: 5, minimumPayment: 500, category: 'Personal' },
        ];
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        try {
            const { container } = render(<DebtManager debts={debts} setDebts={vi.fn()} />);
            expect(container.querySelector('[role="img"]')).not.toBeNull();      // conteneur graphe
            const srTable = container.querySelector('table.sr-only');            // alternative textuelle
            expect(srTable).not.toBeNull();
            expect(srTable?.textContent).toContain('Montant masqué');            // $ masqués en privacy
        } finally {
            act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
        }
    });
});


describe('[DETTE-DATES] éditer une dette existante et lui donner ses dates', () => {
    // ⚠️ Le blocage RÉEL de Marc (2026-08-19) : « j'ai jamais pu définir le début ni la fin du bail ».
    // Avant ce lot, `DebtManager` n'offrait que « Ajouter » et « Supprimer » — corriger une date
    // imposait de DÉTRUIRE la dette et de la ressaisir (donc de perdre tout champ non affiché).
    // C'est une feature INATTEIGNABLE au sens de `UX-UNREACHABLE-FEATURE` : le champ pouvait bien
    // exister dans le type, aucun geste ne permettait de l'y mettre.

    const bail = (): Debt => ({
        id: 'auto', name: 'Bail auto', balance: 22000, interestRate: 7,
        minimumPayment: 500, category: 'Car',
    });

    it('le bouton « Modifier » existe et ouvre un formulaire portant les DEUX dates', async () => {
        const user = userEvent.setup();
        render(<DebtManager debts={[bail()]} setDebts={vi.fn()} />);

        // Non-vacuité : avant le clic, les champs de date n'existent pas — sinon le test passerait
        // même si « Modifier » ne faisait rien.
        expect(screen.queryByLabelText(/Date de début du prêt ou du bail/)).toBeNull();

        await user.click(screen.getByRole('button', { name: /Modifier/ }));
        expect(screen.getByLabelText(/Date de début du prêt ou du bail/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Date de fin du terme ou du bail/)).toBeInTheDocument();
    });

    it('enregistrer les dates les REMONTE au parent, sans perdre les champs non affichés', async () => {
        const user = userEvent.setup();
        const setDebts = vi.fn();
        // `kind` et `rateProvider` ne sont montrés par AUCUN champ du formulaire : ils doivent
        // survivre à l'édition.
        //
        // ⚠️ HONNÊTETÉ SUR CE QUE CES DEUX ASSERTIONS PROUVENT. Vérifié par perturbation : remplacer
        // le `{ ...d, ...draft }` de `saveEdit` par un `{ ...draft }` naïf les laisse VERTES — parce
        // que `startEdit` copie aujourd'hui la dette ENTIÈRE dans le brouillon. Le merge est donc
        // défensif, pas encore nécessaire. Ces assertions gardent la propriété de BOUT EN BOUT
        // (« aucun champ ne se perd à l'édition »), qui est ce qui compte pour l'utilisateur — elles
        // attraperaient un futur `startEdit` qui ne copierait que le sous-ensemble éditable. Elles
        // ne prouvent PAS la ligne de fusion, et le prétendre serait une fausse preuve.
        const avecExtras: Debt = { ...bail(), kind: 'auto-lease', rateProvider: 'Desjardins' };
        render(<DebtManager debts={[avecExtras]} setDebts={setDebts} />);

        await user.click(screen.getByRole('button', { name: /Modifier/ }));
        await user.type(screen.getByLabelText(/Date de début du prêt ou du bail/), '2026-07-20');
        await user.type(screen.getByLabelText(/Date de fin du terme ou du bail/), '2030-07-19');
        await user.click(screen.getByRole('button', { name: /^Enregistrer$/ }));

        expect(setDebts).toHaveBeenCalledTimes(1);
        const rendu = setDebts.mock.calls[0][0] as Debt[];
        expect(rendu).toHaveLength(1);
        expect(rendu[0].startDate).toBe('2026-07-20');
        expect(rendu[0].termEndDate).toBe('2030-07-19');
        expect(rendu[0].id, 'l’identité de la dette doit être préservée').toBe('auto');
        expect(rendu[0].kind, 'champ non affiché perdu à l’édition').toBe('auto-lease');
        expect(rendu[0].rateProvider, 'champ non affiché perdu à l’édition').toBe('Desjardins');
    });

    it('les dates saisies sont VISIBLES dans la liste (sinon rien ne dit qu’elles ont pris)', () => {
        const debts: Debt[] = [{ ...bail(), startDate: '2026-07-20', termEndDate: '2030-07-19' }];
        render(<DebtManager debts={debts} setDebts={vi.fn()} />);
        expect(screen.getByText(/2026-07-20/)).toBeInTheDocument();
        expect(screen.getByText(/2030-07-19/)).toBeInTheDocument();
    });

    it('une dette SANS dates n’affiche pas de tiret trompeur', () => {
        // No-fake-data : on ne rend pas « Début — → fin — » sur une dette qui n'a jamais eu de
        // dates. L'absence de la ligne EST l'information.
        render(<DebtManager debts={[bail()]} setDebts={vi.fn()} />);
        expect(screen.queryByText(/Début/)).toBeNull();
    });
});
