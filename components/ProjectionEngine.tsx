// components/ProjectionEngine.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useDebouncedMemo } from '../utils/useDebouncedMemo';
import { useFinanceStore } from '../store/useFinanceStore';
import { calculateFutureProjection } from '../services/projection';
import { runProjectionAsync } from '../services/projection/runAsync';
import type { ProjectionResult } from '../services/projection/types';
import { useSimulationParams } from '../hooks/useSimulationParams';
import { REQUIREMENTS, type RequirementId } from './setup/requirements';

// Miroir de PAGE_SETUP[Tab.FUTURE].requirementIds (cf components/setup/PageSetupGate.tsx).
// Dupliqué VOLONTAIREMENT pour ne PAS importer le gros composant PageSetupGate dans ce moteur
// toujours monté (bundle + risque de cycle). Verrouillé en phase avec PAGE_SETUP par un test.
export const FUTURE_REQ_IDS: RequirementId[] = ['salary', 'assets', 'retirementProfile'];

interface ProjectionEngineProps {
    /** Dérivé en amont par useDerivedFinancials (App) — passé pour éviter un recalcul. */
    calculatedMonthlySavings: number;
}

/**
 * PH2-c (clé de voûte) — MOTEUR DE PROJECTION AU NIVEAU APP, monté une seule fois (headless,
 * rend `null`). Calcule `calculateFutureProjection` (déterministe + Monte-Carlo) et publie le
 * résultat dans `store.lastProjection` — la SOURCE UNIQUE lue par Dashboard / Investissement /
 * Budget / Futur / Retraite. Avant ce hoist, seul `FutureProjection` calculait → les autres
 * onglets restaient à `ProjectionRequired` tant qu'on n'ouvrait pas Futur.
 *
 * Headless + état local isolé : ce composant rend `null`, donc ses re-renders (toutes les ~300 ms
 * pendant un Monte-Carlo, via `asyncResults`) ne touchent NI App NI les pages — pas de cascade
 * (cf C1 fix App.tsx ; `lastProjection` ET `projectionStatus` sont exclus du sélecteur d'App).
 *
 * Garde no-fake-data : ne calcule QUE si les prérequis de Futur (salaire + placements + profil
 * retraite) sont remplis — la MÊME condition que `PageSetupGate[Tab.FUTURE]`. Sinon `lastProjection`
 * est remis à `null` → les pages affichent `ProjectionRequired`, jamais une projection bidon.
 *
 * Gestion d'erreur identique à l'ancien chemin de FutureProjection : flag `_hasError` + `logError`
 * critical ; un résultat en erreur (chartData vide) n'est PAS publié au store (no-fake-data) mais
 * bascule `projectionStatus` à `'error'` pour l'UI.
 */
const ProjectionEngineInner: React.FC<ProjectionEngineProps> = ({ calculatedMonthlySavings }) => {
    const { params } = useSimulationParams(calculatedMonthlySavings);
    const runMC = useFinanceStore((s) => s.projectionRunMC);
    const setLastProjection = useFinanceStore((s) => s.setLastProjection);
    const setProjectionStatus = useFinanceStore((s) => s.setProjectionStatus);
    // Souscription ÉTROITE à un booléen dérivé : ne re-render que quand le verrou de setup bascule.
    const reqsMet = useFinanceStore((s) => FUTURE_REQ_IDS.every((id) => REQUIREMENTS[id].isMet(s)));

    // Mode déterministe : synchrone + debounce 300 ms (~150 ms de calcul).
    const syncResults = useDebouncedMemo<ProjectionResult | null>(() => {
        if (!reqsMet || runMC) return null; // MC traité par l'effect ci-dessous
        try {
            return calculateFutureProjection(params, false, 0);
        } catch (e) {
            console.error('CRITICAL SIMULATION ERROR (engine):', e);
            import('../services/errorLogger').then(({ logError }) => {
                logError({ source: 'projection', severity: 'critical', message: 'calculateFutureProjection crashed (engine)', error: e instanceof Error ? e : new Error(String(e)) });
            }).catch(() => { /* logger HS, silent */ });
            return { chartData: [], fireNumber: 0, allResults: [], _hasError: true };
        }
    }, [params, runMC, reqsMet], 300);

    const [asyncResults, setAsyncResults] = useState<ProjectionResult | null>(null);

    // PH2-b — signature de contenu : permet à runAsync de RE-RACCROCHER à un calcul déjà en vol.
    const mcDedupKey = useMemo(() => {
        try { return JSON.stringify(params); } catch { return undefined; }
    }, [params]);

    // Mode Monte-Carlo : exécuté dans un Web Worker (libère le main thread), debounce 300 ms.
    useEffect(() => {
        if (!reqsMet || !runMC) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            setProjectionStatus('computing');
            runProjectionAsync(params, true, 0, undefined, mcDedupKey)
                .then((r) => { if (!cancelled) setAsyncResults(r); })
                .catch((e) => {
                    if (!cancelled) {
                        console.error('CRITICAL SIMULATION ERROR (worker, engine):', e);
                        import('../services/errorLogger').then(({ logError }) => {
                            logError({ source: 'projection', severity: 'critical', message: 'runProjectionAsync (worker MC) crashed (engine)', error: e instanceof Error ? e : new Error(String(e)) });
                        }).catch(() => { /* logger HS, silent */ });
                        setAsyncResults({ chartData: [], fireNumber: 0, allResults: [], _hasError: true });
                    }
                });
        }, 300);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [params, runMC, reqsMet, mcDedupKey, setProjectionStatus]);

    const results = runMC ? asyncResults : syncResults;

    // Publie le résultat frais dans la source unique + met à jour le statut.
    useEffect(() => {
        if (!reqsMet) {
            // Setup incomplet (ou redevenu incomplet) → on efface la source : pas de projection bidon.
            setLastProjection(null);
            setProjectionStatus('idle');
            return;
        }
        if (results && Array.isArray(results.chartData) && results.chartData.length > 0) {
            setLastProjection(results);
            setProjectionStatus(results._hasError ? 'error' : 'idle');
        } else if (results?._hasError) {
            // Résultat en erreur (chartData vide) : NE PAS publier (no-fake-data), mais signaler à l'UI.
            setProjectionStatus('error');
        }
    }, [results, reqsMet, setLastProjection, setProjectionStatus]);

    return null;
};

export const ProjectionEngine = React.memo(ProjectionEngineInner);
