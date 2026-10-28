// tests/components/setupHubRenders.test.tsx
//
// [PERF-RENDER-SETUPHUB-FULLSTORE] `SetupHub` s'abonnait au store ENTIER (`useFinanceStore((s) => s)`),
// donc il se re-rendait à CHAQUE écriture — y compris celles qui n'ont rien à voir avec la
// complétude de la configuration (écritures fréquentes pendant un calcul Monte-Carlo, par exemple).
// Mesuré avant le correctif : 2 écritures sans rapport = 2 rendus de plus. Après : 0.
//
// ⚠️ Un test qui ne vérifierait QUE « plus de rendu inutile » serait satisfait par un composant qui
// ne se met JAMAIS à jour — c'est-à-dire par une régression bien pire. D'où le LEVIER : une écriture
// qui change réellement un prérequis doit encore produire un rendu ET changer ce qui est affiché.

import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { SetupHub } from '../../components/setup/SetupHub';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { Debt } from '../../types';

const DETTE: Debt = { id: 'd-test', name: 'Auto', balance: 12000, rate: 5, monthlyPayment: 300 } as unknown as Debt;

afterEach(() => {
    act(() => {
        useFinanceStore.getState().setPrivacyMode(false);
        useFinanceStore.getState().setAppState({ debts: [] });
    });
});

/** Monte le hub sous un `Profiler` et rend le compteur de rendus COMMITÉS de ce sous-arbre. */
function monterAvecCompteur(): () => number {
    let rendus = 0;
    render(
        <React.Profiler id="setup-hub" onRender={() => { rendus += 1; }}>
            <SetupHub />
        </React.Profiler>,
    );
    return () => rendus;
}

describe('[PERF-RENDER-SETUPHUB-FULLSTORE] le hub de configuration ne suit que ce qui le concerne', () => {
    it('une écriture SANS rapport avec la complétude ne re-rend pas le hub', () => {
        const rendus = monterAvecCompteur();
        const apresMontage = rendus();
        expect(apresMontage).toBeGreaterThan(0); // anti-vacuité : le composant s'est bien monté

        // `isPrivacyMode` n'est lu par AUCUN prérequis (les 9 lisent salaire, retraite, actifs,
        // immobilier, enfants, transactions, dettes, projets de vie, clé API) ni par cet écran.
        act(() => { useFinanceStore.getState().setPrivacyMode(true); });
        act(() => { useFinanceStore.getState().setPrivacyMode(false); });

        expect(rendus(), 'le hub se re-rend encore sur une écriture qui ne le concerne pas').toBe(apresMontage);
    });

    it('LEVIER : une écriture qui change un prérequis re-rend le hub ET change ce qui est affiché', () => {
        const rendus = monterAvecCompteur();
        const avant = rendus();
        // Sans cette moitié, le test précédent serait satisfait par un hub qui ne se met jamais à jour.
        expect(screen.getByText('Dettes').closest('div')?.textContent).toContain('0/1');

        act(() => { useFinanceStore.getState().setAppState({ debts: [DETTE] }); });

        expect(rendus(), 'le hub ne réagit plus à un vrai changement de complétude').toBeGreaterThan(avant);
        expect(screen.getByText('Dettes').closest('div')?.textContent).not.toContain('0/1');
    });
});
