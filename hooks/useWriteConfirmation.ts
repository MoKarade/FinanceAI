// hooks/useWriteConfirmation.ts
//
// [AI-TAXCENTER-APPLY-NOGATE] Plomberie PARTAGÉE de la confirmation d'écriture : le diff attend le
// clic, et la promesse est résolue par le modal — jamais de promesse pendante orpheline.
//
// ⚠️ Pourquoi une extraction et pas une troisième copie. Ce bloc existait DEUX fois, à l'octet
// près : dans `useAiChat` (chat in-app) et dans `PayslipUploadCard` (dépôt de talon de paie).
// Vérifié avant d'extraire — les deux copies n'avaient PAS divergé, donc l'extraction est
// mécanique et sans arbitrage. TaxCenter aurait été la troisième, et « deux copies d'un patron ont
// déjà divergé, la troisième se refuse ».
//
// La règle du mode discret vit ICI, et c'est le point : le modal AFFICHE des montants, donc si le
// mode discret s'active pendant l'attente, l'écriture en attente est REFUSÉE. Laissée chez chaque
// appelant, cette règle de VIE PRIVÉE serait à réimplémenter à chaque nouvelle surface — et une
// décision de vie privée écrite pour UNE sortie se repasse sur TOUTES.
import { useState, useRef, useCallback, useEffect } from 'react';
import type { WritePreview, WriteDecision } from '../services/aiTools/writeExecutor';
import { useFinanceStore } from '../store/useFinanceStore';

interface WriteConfirmation {
    /** Diff en attente du clic — `null` quand aucune écriture n'est suspendue. */
    pendingWrite: WritePreview | null;
    /** Passé à `executeWriteTool` : rend une promesse que le modal résout. */
    requestConfirmation: (preview: WritePreview) => Promise<WriteDecision>;
    /** Tranche l'écriture en attente. Fermer le modal = `'cancel'`, jamais un silence. */
    resolvePendingWrite: (decision: WriteDecision) => void;
    /**
     * Y a-t-il une écriture suspendue ? Lit la RÉF, pas l'état — les appelants s'en servent depuis
     * des rappels (`cancel`) où la valeur d'état capturée serait celle du rendu précédent.
     */
    hasPendingWrite: () => boolean;
    /**
     * Refuse l'écriture en attente SANS toucher à l'état React, et dit si quelque chose attendait.
     * Réservé au DÉMONTAGE : `resolvePendingWrite` y ferait un `setState` sur un composant démonté.
     * L'appelant décide quoi tracer — le message dépend de la surface, pas de la plomberie.
     */
    refuserAuDemontage: () => boolean;
}

export function useWriteConfirmation(): WriteConfirmation {
    const isPrivacyMode = useFinanceStore((s) => s.isPrivacyMode);
    const [pendingWrite, setPendingWrite] = useState<WritePreview | null>(null);
    const writeResolverRef = useRef<((d: WriteDecision) => void) | null>(null);

    const resolvePendingWrite = useCallback((decision: WriteDecision) => {
        const resolve = writeResolverRef.current;
        writeResolverRef.current = null;
        setPendingWrite(null);
        resolve?.(decision);
    }, []);

    const requestConfirmation = useCallback((preview: WritePreview): Promise<WriteDecision> => {
        return new Promise((resolve) => {
            writeResolverRef.current = resolve;
            setPendingWrite(preview);
        });
    }, []);

    // Le modal affiche des montants : mode discret activé pendant l'attente → refus.
    useEffect(() => {
        if (isPrivacyMode && writeResolverRef.current) resolvePendingWrite('cancel');
    }, [isPrivacyMode, pendingWrite, resolvePendingWrite]);

    const hasPendingWrite = useCallback(() => writeResolverRef.current !== null, []);

    const refuserAuDemontage = useCallback(() => {
        const resolve = writeResolverRef.current;
        if (!resolve) return false;
        writeResolverRef.current = null;
        resolve('cancel');
        return true;
    }, []);

    return { pendingWrite, requestConfirmation, resolvePendingWrite, hasPendingWrite, refuserAuDemontage };
}
