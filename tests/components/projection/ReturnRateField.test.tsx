// [FUTUR-MOBILE-PR4] ReturnRateField — curseur + champ numérique SYNCHRONISÉS sur la MÊME valeur.
// Les deux sens sont testés SÉPARÉMENT (casser l'un des deux fils d'`onChange` doit rougir) :
// une garde qui ne perturbe qu'un seul sens laisserait l'autre régresser en silence.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReturnRateField } from '../../../components/projection/ReturnRateField';

function renderField(onChange: (v: number) => void, value = 5) {
    return render(
        <ReturnRateField
            label="Taux de test"
            value={value}
            onChange={onChange}
            min={0}
            max={10}
            step={0.5}
            colorClassName="text-warning-400"
            accentClassName="accent-warning-500"
        />,
    );
}

describe('ReturnRateField — synchronisation curseur ↔ champ numérique', () => {
    it('le CURSEUR appelle onChange avec la nouvelle valeur', () => {
        const onChange = vi.fn();
        renderField(onChange);
        fireEvent.change(screen.getByRole('slider', { name: 'Taux de test' }), { target: { value: '7.5' } });
        expect(onChange).toHaveBeenCalledWith(7.5);
    });

    it('le CHAMP NUMÉRIQUE appelle onChange avec la nouvelle valeur (sens distinct du curseur)', () => {
        const onChange = vi.fn();
        renderField(onChange);
        fireEvent.change(screen.getByRole('spinbutton', { name: 'Taux de test' }), { target: { value: '3' } });
        expect(onChange).toHaveBeenCalledWith(3);
    });

    it('le champ numérique CLAMPE aux bornes (une saisie hors bornes ne casse pas la valeur affichée)', () => {
        const onChange = vi.fn();
        renderField(onChange);
        fireEvent.change(screen.getByRole('spinbutton', { name: 'Taux de test' }), { target: { value: '999' } });
        expect(onChange).toHaveBeenCalledWith(10); // max
    });

    it('les DEUX contrôles reflètent la même valeur affichée (rendu synchronisé)', () => {
        renderField(vi.fn(), 6);
        expect(screen.getByRole('slider', { name: 'Taux de test' })).toHaveValue('6');
        expect(screen.getByRole('spinbutton', { name: 'Taux de test' })).toHaveValue(6);
    });

    it('champ numérique et curseur ont un nom accessible DISTINCT par leur RÔLE (pas d\'ambiguïté)', () => {
        renderField(vi.fn());
        // Les deux portent le même texte de nom, mais des rôles différents — getByRole les distingue.
        expect(screen.getByRole('slider', { name: 'Taux de test' })).toBeInTheDocument();
        expect(screen.getByRole('spinbutton', { name: 'Taux de test' })).toBeInTheDocument();
    });
});
