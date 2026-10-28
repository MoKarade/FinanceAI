/**
 * [PROFIL-SOUS-ONGLETS] `SavedProfilesCard` — extrait de `UsersCard`.
 *
 * ⚠️ CE QUI EST EN JEU : la RÉTROCOMPATIBILITÉ des données de Marc. Les profils enregistrés vivent
 * dans `localStorage`, sous une clé dérivée du nom (`profile_<nom slugifié>`) et listés dans
 * `saved_profiles_list`. Déplacer le code dans un autre fichier ne doit RIEN changer à ces clés :
 * un profil écrit par la version d'AVANT doit rester lisible après. Une extraction qui « marche »
 * mais change le slug rendrait tous les profils existants invisibles, sans erreur ni message —
 * l'utilisateur croirait les avoir perdus.
 *
 * Le test écrit donc les clés À LA MAIN, telles que l'ancien code les produisait, au lieu de passer
 * par l'UI : construire la fixture avec le code testé prouverait seulement qu'il est cohérent avec
 * lui-même (le piège de la garde auto-satisfaite, déjà consigné dans `CONVENTIONS`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedProfilesCard } from '../../components/profile/SavedProfilesCard';
import type { AppState, User } from '../../types';

vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

const config = {
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000, color: '#10b981', age: 35 } as unknown as User,
        { name: '', grossSalary: 0, netSalary: 0, color: '#3b82f6', age: 0 } as unknown as User,
    ],
    splitMode: '50/50',
} as unknown as AppState['config'];

beforeEach(() => {
    localStorage.clear();
});

describe('[PROFIL-SOUS-ONGLETS] rétrocompatibilité des profils déjà enregistrés', () => {
    it('un profil écrit par l’ANCIEN code est listé et chargeable', async () => {
        // Clés telles que l'ancien `UsersCard` les écrivait : espaces → `_`, minuscules.
        localStorage.setItem('saved_profiles_list', JSON.stringify(['Marc & Anna 2026']));
        localStorage.setItem('profile_marc_&_anna_2026', JSON.stringify({ config: { ...config, splitMode: 'PRORATA' } }));

        const setConfig = vi.fn();
        render(<SavedProfilesCard config={config} setConfig={setConfig} />);

        // Listé sous son nom d'origine (pas le slug).
        const bouton = screen.getByRole('button', { name: 'Charger le profil Marc & Anna 2026' });
        await userEvent.click(bouton);

        expect(setConfig, 'le profil doit être RETROUVÉ sous son ancienne clé').toHaveBeenCalledTimes(1);
        expect(setConfig.mock.calls[0][0]).toMatchObject({ splitMode: 'PRORATA' });
    });

    it('enregistrer écrit LES MÊMES clés que l’ancien code', async () => {
        render(<SavedProfilesCard config={config} setConfig={vi.fn()} />);
        await userEvent.type(screen.getByLabelText('Nom du profil à sauvegarder'), 'Marc & Anna 2026');
        await userEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }));

        expect(localStorage.getItem('profile_marc_&_anna_2026'), 'slug inchangé').not.toBeNull();
        expect(JSON.parse(localStorage.getItem('saved_profiles_list') || '[]')).toEqual(['Marc & Anna 2026']);
    });
});

describe('[PROFIL-SOUS-ONGLETS] états honnêtes et suppression', () => {
    it('aucun profil → le dit, au lieu de rester muet', () => {
        render(<SavedProfilesCard config={config} setConfig={vi.fn()} />);
        expect(screen.getByText('Aucun profil enregistré.')).toBeTruthy();
    });

    // Une liste corrompue (JSON valide mais pas un tableau) ne doit pas casser le render :
    // `.map` sur un non-tableau planterait l'écran entier.
    it('une liste CORROMPUE ne fait pas planter l’écran', () => {
        localStorage.setItem('saved_profiles_list', JSON.stringify({ pas: 'un tableau' }));
        expect(() => render(<SavedProfilesCard config={config} setConfig={vi.fn()} />)).not.toThrow();
        expect(screen.getByText('Aucun profil enregistré.')).toBeTruthy();
    });

    it('la suppression exige DEUX clics (le 1er demande confirmation)', async () => {
        localStorage.setItem('saved_profiles_list', JSON.stringify(['Test']));
        localStorage.setItem('profile_test', JSON.stringify({ config }));
        render(<SavedProfilesCard config={config} setConfig={vi.fn()} />);

        await userEvent.click(screen.getByRole('button', { name: 'Supprimer le profil Test' }));
        expect(localStorage.getItem('profile_test'), 'un seul clic ne doit RIEN supprimer').not.toBeNull();

        await userEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));
        expect(localStorage.getItem('profile_test')).toBeNull();
        expect(JSON.parse(localStorage.getItem('saved_profiles_list') || '[]')).toEqual([]);
    });
});
