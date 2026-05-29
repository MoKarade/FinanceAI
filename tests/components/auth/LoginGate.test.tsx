import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoginGate } from '../../../components/auth/LoginGate';

/**
 * Garde de non-régression « dark » : sans VITE_GOOGLE_GATE (cas par défaut / prod actuelle), le
 * gate doit rendre l'app DIRECTEMENT, sans écran de login ni appel réseau. Si ce test casse, c'est
 * que le gate s'activerait par erreur au déploiement.
 */
describe('LoginGate — inerte par défaut', () => {
    it('rend les enfants directement quand le gate est désactivé', () => {
        render(
            <LoginGate>
                <div>CONTENU_APP</div>
            </LoginGate>,
        );
        expect(screen.getByText('CONTENU_APP')).toBeTruthy();
        // Aucun écran de login ne doit apparaître.
        expect(screen.queryByText('Se connecter avec Google')).toBeNull();
    });
});
