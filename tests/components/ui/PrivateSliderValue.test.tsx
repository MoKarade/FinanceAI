/**
 * @vitest-environment jsdom
 *
 * [D6-PRIV-MONTANTS] L'étiquette de valeur d'un slider ne fuit AUCUN montant en mode discret :
 * masquée « ••• » au repos (valeur HORS DOM), révélée pendant le focus du slider (symétrie
 * PrivateNumberInput), rendue telle quelle hors mode discret.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { PrivateSliderValue } from '../../../components/ui/PrivateSliderValue';
import { useFinanceStore } from '../../../store/useFinanceStore';

beforeEach(() => {
    useFinanceStore.setState({ isPrivacyMode: false });
});

describe('[D6-PRIV-MONTANTS] PrivateSliderValue', () => {
    it('mode discret + repos : « ••• », la VALEUR n\'est pas dans le DOM, sr-only annonce le masquage', () => {
        useFinanceStore.setState({ isPrivacyMode: true });
        const { container } = render(<PrivateSliderValue revealed={false}>12 345 $</PrivateSliderValue>);
        expect(container.textContent).not.toContain('12');
        expect(container.textContent).toContain('•••');
        expect(container.querySelector('.sr-only')?.textContent).toBeTruthy();
    });

    it('mode discret + slider FOCUSÉ (revealed) : la valeur est visible pour l\'ajustement', () => {
        useFinanceStore.setState({ isPrivacyMode: true });
        const { container } = render(<PrivateSliderValue revealed>12 345 $</PrivateSliderValue>);
        expect(container.textContent).toContain('12 345 $');
        expect(container.textContent).not.toContain('•••');
    });

    it('hors mode discret : valeur rendue telle quelle (zéro surcoût)', () => {
        const { container } = render(<PrivateSliderValue revealed={false}>12 345 $</PrivateSliderValue>);
        expect(container.textContent).toContain('12 345 $');
    });
});
