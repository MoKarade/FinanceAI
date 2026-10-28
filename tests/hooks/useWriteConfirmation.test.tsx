/**
 * [AI-TAXCENTER-APPLY-NOGATE] Le contrat de la plomberie de confirmation d'écriture.
 *
 * ⚠️ Ce fichier existe parce qu'une PERTURBATION n'a rien fait rougir. La règle « le modal de
 * confirmation AFFICHE des montants, donc l'écriture en attente est REFUSÉE si le mode discret
 * s'active » vivait en double (chat in-app + dépôt de talon), commentée avec l'incident qui l'avait
 * motivée — et **désarmer complètement cette règle laissait les 145 tests des deux surfaces au
 * vert**. Une garantie de vie privée que rien ne vérifie n'est pas une garantie.
 *
 * Le hook est né de l'extraction de ces deux copies, vérifiées identiques avant de bouger. Sa
 * troisième consommatrice est `TaxCenter`, qui écrivait encore la config en direct.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWriteConfirmation } from '../../hooks/useWriteConfirmation';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { WritePreview, WriteDecision } from '../../services/aiTools/writeExecutor';

const apercu = { summary: 'Salaire 100 000 $ → 120 000 $' } as unknown as WritePreview;

beforeEach(() => {
    act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
});

describe('[AI-TAXCENTER-APPLY-NOGATE] useWriteConfirmation', () => {
    it('l’écriture RESTE en attente tant que personne ne tranche', async () => {
        const { result } = renderHook(() => useWriteConfirmation());
        let resolu: WriteDecision | null = null;
        act(() => { void result.current.requestConfirmation(apercu).then((d) => { resolu = d; }); });

        await waitFor(() => expect(result.current.pendingWrite).toBe(apercu));
        expect(result.current.hasPendingWrite()).toBe(true);
        // Sens INVERSE de la règle de vie privée : hors mode discret, RIEN ne doit trancher tout
        // seul. Sans cette assertion, un hook qui refuserait TOUT passerait le test suivant.
        expect(resolu).toBeNull();
    });

    it('le clic tranche la promesse ET vide l’attente', async () => {
        const { result } = renderHook(() => useWriteConfirmation());
        let resolu: WriteDecision | null = null;
        act(() => { void result.current.requestConfirmation(apercu).then((d) => { resolu = d; }); });
        await waitFor(() => expect(result.current.pendingWrite).toBe(apercu));

        act(() => { result.current.resolvePendingWrite('apply'); });
        await waitFor(() => expect(resolu).toBe('apply'));
        expect(result.current.pendingWrite).toBeNull();
        expect(result.current.hasPendingWrite()).toBe(false);
    });

    it('MODE DISCRET activé pendant l’attente → l’écriture est REFUSÉE (le modal montre des montants)', async () => {
        const { result } = renderHook(() => useWriteConfirmation());
        let resolu: WriteDecision | null = null;
        act(() => { void result.current.requestConfirmation(apercu).then((d) => { resolu = d; }); });
        await waitFor(() => expect(result.current.pendingWrite).toBe(apercu));

        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });

        await waitFor(() => expect(resolu).toBe('cancel'));
        expect(result.current.pendingWrite).toBeNull();
    });

    it('DÉMONTAGE : refuse sans toucher à l’état, et DIT si quelque chose attendait', async () => {
        const { result } = renderHook(() => useWriteConfirmation());
        // Rien en attente → l'appelant ne doit RIEN tracer (sinon il crie à chaque démontage).
        expect(result.current.refuserAuDemontage()).toBe(false);

        let resolu: WriteDecision | null = null;
        act(() => { void result.current.requestConfirmation(apercu).then((d) => { resolu = d; }); });
        await waitFor(() => expect(result.current.hasPendingWrite()).toBe(true));

        let aRefuse = false;
        act(() => { aRefuse = result.current.refuserAuDemontage(); });
        expect(aRefuse).toBe(true);
        await waitFor(() => expect(resolu).toBe('cancel'));
        // Deuxième appel : plus rien à refuser (pas de double résolution de la promesse).
        expect(result.current.refuserAuDemontage()).toBe(false);
    });
});
