/**
 * [PH3-c-bis] La DURÉE du vesting RSU est enfin saisissable.
 *
 * ⚠️ Le moteur lit ce champ depuis toujours — `activeIncome.ts` :
 * `(u.rsuYearsRemaining ?? 99) > yearsElapsed` — et aucun champ ne l'écrivait. Le repli à 99 ans
 * faisait donc couler les RSU sur TOUT l'horizon de projection, sans jamais expirer.
 *
 * MESURÉ sur une projection complète de 40 ans, RSU de 24 000 $/an :
 *   • sans durée (ce que l'app produisait) ...... 7 273 468 $ de patrimoine final
 *   • vesting de 4 ans .......................... 5 892 838 $
 *   → **1 380 630 $ de richesse fantôme, +23,4 %** — et 823 937 $ encore à 10 ans de vesting.
 *
 * Son JUMEAU `rsuVestingPerYear` avait son champ depuis toujours, deux lignes plus haut
 * (`PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`). Un champ que le moteur consulte et que l'UI ne demande
 * jamais n'est pas une fonctionnalité manquante : c'est un chiffre faux
 * (`UN-CHAMP-TYPE-SANS-PRODUCTEUR-EST-UNE-INTENTION-JAMAIS-LIVREE`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useFinanceStore } from '../../../store/useFinanceStore';
import { UserConfigFields } from '../../../components/settings/UserConfigFields';
import type { User } from '../../../types';

vi.mock('../../../components/ui/Toast', () => ({ showToast: vi.fn() }));

const initial = useFinanceStore.getState();

beforeEach(() => {
    useFinanceStore.setState(initial, true);
    const init = useFinanceStore.getState().config;
    useFinanceStore.setState({
        config: {
            ...init,
            users: [
                { ...init.users[0], name: 'Moi', rsuVestingPerYear: 24_000 },
                { ...init.users[1], name: '' },
            ] as [User, User],
        },
    });
});

const champDuree = () => screen.getAllByLabelText(/Années de vesting RSU restantes/i)[0] as HTMLInputElement;

describe('[PH3-c-bis] durée du vesting RSU', () => {
    it('le champ existe À CÔTÉ de son jumeau (montant), dans la même section', () => {
        render(<UserConfigFields section="detailed" />);
        // Anti-vacuité : le jumeau DOIT être là aussi — s'il ne l'était pas, trouver le mien ne
        // prouverait pas qu'ils sont voisins, et le test passerait dans une section déplacée.
        expect(screen.getAllByLabelText(/RSU vesting annuel/i).length).toBeGreaterThan(0);
        expect(champDuree()).toBeInTheDocument();
    });

    it('la saisie ATTERRIT dans le store (c’est le producteur qui manquait)', () => {
        render(<UserConfigFields section="detailed" />);
        fireEvent.change(champDuree(), { target: { value: '4' } });
        expect(useFinanceStore.getState().config.users[0].rsuYearsRemaining).toBe(4);
    });

    it('vider le champ rend `undefined`, jamais 0 — 0 an et « pas renseigné » ne sont PAS la même chose', () => {
        render(<UserConfigFields section="detailed" />);
        fireEvent.change(champDuree(), { target: { value: '6' } });
        expect(useFinanceStore.getState().config.users[0].rsuYearsRemaining).toBe(6);
        fireEvent.change(champDuree(), { target: { value: '' } });
        // `undefined` = le moteur retombe sur son repli documenté ; un 0 persisté couperait les RSU
        // immédiatement, ce qui n'est pas ce que « champ vide » veut dire.
        expect(useFinanceStore.getState().config.users[0].rsuYearsRemaining).toBeUndefined();
    });
});
