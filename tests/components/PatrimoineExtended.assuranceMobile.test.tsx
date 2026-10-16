// tests/components/PatrimoineExtended.assuranceMobile.test.tsx
// [ASSURANCE-LIGNE-MOBILE] Une ligne d'assurance tient sur DEUX rangées sur téléphone
// (6 colonnes), et reste sur une seule rangée dès `sm` (12 colonnes).
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { InsurancePanel } from '../../components/PatrimoineExtended';
import type { InsurancePolicy } from '../../types';

const POLICES: InsurancePolicy[] = [
    { id: 'p1', kind: 'life-term', insurer: 'Assureur X', faceAmount: 743119, monthlyPremium: 18337 } as InsurancePolicy,
];

afterEach(cleanup);

describe('InsurancePanel — ligne sur téléphone', () => {
    it('la ligne passe sur 6 colonnes (2 rangées) sur téléphone et 12 dès sm', () => {
        render(<InsurancePanel policies={POLICES} onChange={vi.fn()} />);
        const ligne = screen.getByLabelText("Type d'assurance").parentElement as HTMLElement;
        expect(ligne.className).toContain('grid-cols-6');
        expect(ligne.className).toContain('sm:grid-cols-12');
        expect(ligne.className).not.toMatch(/(^|\s)grid-cols-12(\s|$)/);
    });

    it('la date d\'expiration a assez de place (au moins 2 colonnes sur téléphone)', () => {
        render(<InsurancePanel policies={POLICES} onChange={vi.fn()} />);
        const date = screen.getByLabelText("Date d'expiration de la police");
        expect(date.className).toContain('col-span-2');
    });
});
