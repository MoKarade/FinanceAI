// tests/components/budget.periodePerso.test.tsx
// [BUDGET-DATES-PERSO-LARGES] Les deux champs de date de la période personnalisée sont assez
// larges pour afficher une date complète (jj/mm/aaaa), sans la couper.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { NavigateurPeriode, type BudgetPilotage } from '../../components/budget/pilotage';

afterEach(cleanup);

const pilotage = {
    timeView: 'CUSTOM',
    setTimeView: vi.fn(),
    periodOffset: 0,
    setPeriodOffset: vi.fn(),
    personFilter: null,
    setPersonFilter: vi.fn(),
    customStart: '2026-10-01',
    setCustomStart: vi.fn(),
    customEnd: '2026-10-15',
    setCustomEnd: vi.fn(),
} as unknown as BudgetPilotage;

describe('NavigateurPeriode — période personnalisée', () => {
    it.each(['Date de début', 'Date de fin'])('le champ « %s » est plus large que w-28', (nom) => {
        render(<NavigateurPeriode p={pilotage} />);
        const champ = screen.getByLabelText(nom);
        expect(champ.className).not.toContain('w-28');
        expect(champ.className).toContain('w-36');
    });
});
