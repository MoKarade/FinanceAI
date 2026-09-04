// [HEALTH-MARQUEUR-DONNEE-INVALIDE] Décision de Marc (2026-09-03, ≠ ma recommandation qui était de
// ne rien changer) : une PASTILLE discrète dans le résumé « Santé financière » de Futur quand au
// moins une métrique est exclue pour donnée INVALIDE — cliquable vers le détail (le résumé entier
// est le bouton). LA distinction qui justifie le marqueur : une donnée invalide se CORRIGE, une
// métrique simplement non calculable (cible FIRE absente…) n'appelle aucune action — la pastille
// ne doit JAMAIS s'allumer pour elle, sinon avertissement permanent, donc mort.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { FutureHealthSummary } from '../../components/future/FutureHealthSummary';
import { computeHealthMetrics, type HealthScoreInputs } from '../../utils/healthScore';

const initialState = useFinanceStore.getState();

/** Profil DE BASE : usable partout, score calculable, AUCUNE donnée invalide. */
function poserProfilSain() {
    useFinanceStore.setState(initialState, true);
    useFinanceStore.setState({
        config: {
            ...initialState.config,
            users: [
                { ...initialState.config.users[0], name: 'Marc', grossSalary: 7000, netSalary: 5000 },
                { ...initialState.config.users[1], name: '' },
            ],
        },
        budgetItems: [
            { id: 'b1', name: 'Loyer', target: 1500, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
        ],
        initialBalances: { 'Compte chèque': 30000 },
    } as never);
}

/** Le même profil, avec le canal de corruption MESURÉ par [HEALTH-SCORE-NAN-SILENCIEUX] :
 *  `netSalary: Infinity` (ce que `JSON.parse` produit d'un blob portant `1e999`). */
function poserProfilCorrompu() {
    poserProfilSain();
    const c = useFinanceStore.getState().config;
    useFinanceStore.setState({
        config: { ...c, users: [{ ...c.users[0], netSalary: Infinity }, c.users[1]] },
    } as never);
}

const PASTILLE = '[data-testid="pastille-donnee-invalide"]';

beforeEach(() => poserProfilSain());

describe('[HEALTH-MARQUEUR-DONNEE-INVALIDE] la couche pure distingue invalide de non-calculable', () => {
    const inputs = (over: Partial<HealthScoreInputs> = {}): HealthScoreInputs => ({
        config: { users: [{ name: 'Moi', netSalary: 5000 }] } as unknown as HealthScoreInputs['config'],
        budgetItems: [{ id: 'b1', name: 'Loyer', target: 1500, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' }] as unknown as HealthScoreInputs['budgetItems'],
        debts: [], assets: [], initialBalances: { LIQUIDITE: 20000 }, transactions: [],
        subscriptions: [], fxRates: {},
        projectionFireTarget: 0, // ← fireProgress NON CALCULABLE (pas invalide !)
        ...over,
    });

    it('une donnée INVALIDE porte le marqueur structurel `invalidData` — une non-calculable, NON', () => {
        const rows = computeHealthMetrics(inputs({
            config: { users: [{ name: 'Moi', netSalary: Infinity }] } as unknown as HealthScoreInputs['config'],
        }));
        const invalides = rows.filter((r) => r.invalidData);
        expect(invalides.length).toBeGreaterThan(0); // anti-vacuité : la corruption atteint bien une métrique
        for (const r of invalides) expect(r.available).toBe(false);
        // fireProgress est non calculable (cible 0) mais PAS invalide : c'est LA distinction.
        const fire = rows.find((r) => r.id === 'fireProgress')!;
        expect(fire.available).toBe(false);
        expect(fire.invalidData).toBeUndefined();
    });

    it('profil sain : AUCUN marqueur `invalidData` nulle part', () => {
        const rows = computeHealthMetrics(inputs());
        expect(rows.every((r) => r.invalidData === undefined)).toBe(true);
    });
});

describe('[HEALTH-MARQUEUR-DONNEE-INVALIDE] la pastille du résumé de Futur', () => {
    it('donnée invalide + score encore calculable → la pastille s\'affiche, et le nom accessible dit pourquoi', () => {
        poserProfilCorrompu();
        const { container } = render(<FutureHealthSummary />);
        // Pré-condition du cas : le score global reste calculable (sinon on tombe dans la branche
        // « aucune donnée exploitable », qui a déjà son message).
        expect(container.textContent).toContain('/100');
        expect(container.querySelector(PASTILLE)).not.toBeNull();
        const btn = container.querySelector('button')!;
        expect(btn.getAttribute('aria-label')).toContain('donnée invalide à corriger');
    });

    it('profil SAIN → aucune pastille (contrôle négatif)', () => {
        const { container } = render(<FutureHealthSummary />);
        expect(container.textContent).toContain('/100');
        expect(container.querySelector(PASTILLE)).toBeNull();
    });

    it('métrique simplement NON CALCULABLE (aucune projection FIRE) → aucune pastille : rien à corriger', () => {
        // Le profil sain n'a PAS de projection (fireTarget = 0) : fireProgress est déjà
        // available:false dans les cas ci-dessus. Ce cas rend la distinction EXPLICITE : la
        // pastille ne s'allume pas pour une exclusion sans action possible.
        const { container } = render(<FutureHealthSummary />);
        expect(container.querySelector(PASTILLE)).toBeNull();
    });

    it('la pastille est CLIQUABLE vers le détail : elle vit dans le bouton qui y navigue', () => {
        poserProfilCorrompu();
        const { container } = render(<FutureHealthSummary />);
        const pastille = container.querySelector(PASTILLE)!;
        expect(pastille.closest('button')).not.toBeNull();
        fireEvent.click(pastille);
        // navigateWithFocus pose l'onglet cible dans le store — on observe l'ÉTAT, pas un espion.
        expect(useFinanceStore.getState().activeTab).toBe('BUDGET');
    });
});
