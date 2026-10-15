// tests/components/PatrimoineExtended.entrepriseLibelles.test.tsx
// [ENTREPRISE-LIBELLES-SIMPLES] La ligne « Entreprise » parle en mots simples :
// plus de sigle « JVM », plus d'abréviation « Div », et le bouton supprimer nomme une entreprise.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { BusinessPanel } from '../../components/PatrimoineExtended';
import type { PrivateBusiness } from '../../types';

const SOCIETES: PrivateBusiness[] = [
    { id: 'b1', name: 'Société', ownershipPct: 100, estimatedValue: 0 } as PrivateBusiness,
];

afterEach(cleanup);

describe('BusinessPanel — libellés en mots simples', () => {
    it('la valeur marchande et le dividende annuel ont un texte indicatif lisible', () => {
        render(<BusinessPanel businesses={SOCIETES} onChange={vi.fn()} />);
        expect(screen.getByLabelText('Juste valeur marchande (dollars)')).toHaveProperty('placeholder', 'Valeur marchande $');
        expect(screen.getByLabelText('Dividende annuel (dollars)')).toHaveProperty('placeholder', 'Dividende annuel $');
    });

    it('le bouton supprimer parle d\'une entreprise, pas d\'un immeuble', () => {
        render(<BusinessPanel businesses={SOCIETES} onChange={vi.fn()} />);
        expect(screen.getByLabelText('Supprimer cette entreprise')).toBeTruthy();
        expect(screen.queryByLabelText('Supprimer cet immeuble locatif')).toBeNull();
    });
});
