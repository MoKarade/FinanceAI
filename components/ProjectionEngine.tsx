// components/ProjectionEngine.tsx
import { messageDeRefus } from '../services/projection/verifierEntreesMoteur';
import React, { useEffect, useMemo, useState } from 'react';
import { useFinanceStore } from '../store/useFinanceStore';
import { runProjectionAsync, PROJECTION_CANCELLED } from '../services/projection/runAsync';
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
 * Headless + état local isolé : ce composant rend `null`. `asyncResults` ne change qu'UNE fois (à la
 * résolution du calcul MC — runProjectionAsync mode projection ne rapporte PAS de progrès), donc ses
 * re-renders ne touchent NI App NI les pages — pas de cascade (cf C1 fix App.tsx ; `lastProjection`
 * ET `projectionStatus` sont exclus du sélecteur d'App).
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
    const setProjectionRefus = useFinanceStore((s) => s.setProjectionRefus);
    // Souscription ÉTROITE à un booléen dérivé : ne re-render que quand le verrou de setup bascule.
    const reqsMet = useFinanceStore((s) => FUTURE_REQ_IDS.every((id) => REQUIREMENTS[id].isMet(s)));

    // PH2-c-3 — déterministe ET Monte-Carlo routés au Web Worker (libère le main thread quel que soit
    // l'onglet ; avant, le déterministe coûtait ~150 ms sur le thread de rendu à chaque changement de
    // params). Le calcul déterministe est IDENTIQUE (même calculateFutureProjection), juste off-thread.
    const [asyncResults, setAsyncResults] = useState<ProjectionResult | null>(null);

    // PH2-b — signature de contenu : permet à runAsync de RE-RACCROCHER à un calcul déjà en vol.
    const mcDedupKey = useMemo(() => {
        try { return JSON.stringify(params); } catch { return undefined; }
    }, [params]);

    // PH2-c-3 — calcul (déterministe OU Monte-Carlo selon runMC) dans un Web Worker, debounce 300 ms.
    // [ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] Deuxième condition de refus, à côté de `reqsMet` et
    // pour la même raison no-fake-data : une entrée illisible ne doit pas produire de projection.
    // Le patron est repris de la garde voisine — ne pas calculer, ne rien publier, laisser l'UI
    // dire pourquoi. ⚠️ La différence avec `reqsMet` est le MESSAGE : « ouvre Future » ne répare
    // pas une donnée corrompue, il faut nommer le champ (d'où `entreesRefusees` dans les params).
    // ⚠️ Mémoïsé, et réduit à une CHAÎNE : `params.entreesRefusees ?? []` fabriquait un tableau neuf
    // à chaque rendu sur le chemin NOMINAL (le champ est absent quand il n'y a rien à refuser), ce
    // qui aurait fait re-tourner l'effet de publication à chaque render. Une chaîne se compare par
    // valeur — `null` sur le chemin nominal, donc l'effet ne bouge plus.
    const messageRefus = useMemo(
        () => (params.entreesRefusees?.length ? messageDeRefus(params.entreesRefusees) : null),
        [params.entreesRefusees],
    );

    useEffect(() => {
        if (!reqsMet || messageRefus) return;
        // [HARDEN-SNAPSHOT-RACE] AbortController en plus du flag `cancelled` : le flag protège les
        // `setState` tardifs, l'abort DÉTACHE la requête elle-même (params changés, démontage).
        // ⚠️ La dédup PH2-b est préservée par construction : l'abort ne rejette qu'une promesse
        // DÉRIVÉE — si les mêmes params reviennent (remount), on se re-raccroche au calcul partagé
        // toujours en vol, exactement le scénario « reprend où il en était ».
        let cancelled = false;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            setProjectionStatus('computing');
            runProjectionAsync(params, runMC, 0, undefined, mcDedupKey, { signal: controller.signal })
                .then((r) => { if (!cancelled) setAsyncResults(r); })
                .catch((e) => {
                    // Une annulation N'EST PAS un crash : la router en « CRITICAL SIMULATION ERROR »
                    // remplirait le journal d'erreurs à chaque changement de params (une par frappe).
                    if (e instanceof Error && e.message === PROJECTION_CANCELLED) return;
                    if (!cancelled) {
                        console.error('CRITICAL SIMULATION ERROR (worker, engine):', e);
                        import('../services/errorLogger').then(({ logError }) => {
                            logError({ source: 'projection', severity: 'critical', message: 'runProjectionAsync (worker, engine) crashed', error: e instanceof Error ? e : new Error(String(e)) });
                        }).catch(() => { /* logger HS, silent */ });
                        setAsyncResults({ chartData: [], fireNumber: 0, allResults: [], _hasError: true });
                    }
                });
        }, 300);
        return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
    }, [params, runMC, reqsMet, messageRefus, mcDedupKey, setProjectionStatus]);

    const results = asyncResults;

    // Publie le résultat frais dans la source unique + met à jour le statut.
    useEffect(() => {
        if (!reqsMet) {
            // Setup incomplet (ou redevenu incomplet) → on efface la source : pas de projection bidon.
            setLastProjection(null);
            setProjectionStatus('idle');
            setProjectionRefus(null);
            return;
        }
        if (messageRefus) {
            // [ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] ⚠️ EFFACER, pas seulement s'abstenir de
            // recalculer : une projection publiée AVANT que la donnée ne devienne illisible
            // resterait la source unique de tous les écrans, et rien ne dirait qu'elle est périmée.
            // Le statut passe à `error` — l'utilisateur doit voir qu'il se passe quelque chose, pas
            // un onglet qui semble simplement vide.
            setLastProjection(null);
            setProjectionStatus('error');
            // Le MOTIF va au store : `ProjectionRequired` est monté sur toutes les surfaces qui
            // dépendent de la projection, donc une seule publication les couvre toutes — plutôt
            // qu'un message recopié écran par écran (classe `DECISION-PRIVACY-UNE-SEULE-SORTIE`).
            setProjectionRefus(messageRefus);
            return;
        }
        setProjectionRefus(null); // plus rien à refuser : ne pas laisser un motif périmé à l'écran
        if (results && Array.isArray(results.chartData) && results.chartData.length > 0) {
            setLastProjection(results);
            setProjectionStatus(results._hasError ? 'error' : 'idle');
        } else if (results?._hasError) {
            // Résultat en erreur (chartData vide) : NE PAS publier (no-fake-data), mais signaler à l'UI.
            setProjectionStatus('error');
        }
    }, [results, reqsMet, messageRefus, setLastProjection, setProjectionStatus, setProjectionRefus]);

    return null;
};

export const ProjectionEngine = React.memo(ProjectionEngineInner);
