// mcp/hubSummary.ts
//
// [HUB-01] Résumé pour le hub perso (hubperso.com), contrat @mokarade/hub-contract v1.
// Construit un HubSummary à partir des VRAIES données (aucun chiffre inventé) :
// overview + signaux financiers → metrics/alerts ; fraîcheur Drive → status/dataAsOf.
// Le payload est validé par le schéma du contrat AVANT d'être servi : ce serveur ne
// publie jamais un JSON non conforme.
import {
    CONTRACT_VERSION,
    validateSummary,
    type HubAlert,
    type HubMetric,
    type HubSummary,
} from '@mokarade/hub-contract';
import type { AppState } from '../types';
import { computeFinancialSignals } from './financialSignals';
import { getStateFreshness, STALE_THRESHOLD_MS } from './state/freshness';

/** Identité de l'app dans le widget du hub. */
export const HUB_APP: HubSummary['app'] = {
    id: 'financeai',
    name: 'FinanceAI',
    url: 'https://finance.hubperso.com',
    color: '#0f766e',
};

const MAX_ALERT_LABEL = 80;
const MAX_ALERTS = 10;

function clip(label: string): string {
    return label.length <= MAX_ALERT_LABEL ? label : `${label.slice(0, MAX_ALERT_LABEL - 1)}…`;
}

const ALERT_SEVERITY: Record<'high' | 'medium' | 'low', HubAlert['severity']> = {
    high: 'alert',
    medium: 'warn',
    low: 'info',
};

const OPEN_ACTION: HubSummary['actions'] = [
    { label: 'Ouvrir FinanceAI', kind: 'link', href: HUB_APP.url },
];

/** Résumé conforme au contrat, calculé sur l'état réel. */
export function buildHubSummary(state: AppState, now: number = Date.now()): HubSummary {
    const { overview, celiRoom, signals } = computeFinancialSignals(state);
    const freshness = getStateFreshness();
    const age = freshness.updatedAt == null ? null : Math.max(0, now - freshness.updatedAt);
    const stale = age != null && age > STALE_THRESHOLD_MS;

    const metrics: HubMetric[] = [
        { label: 'Valeur nette', value: Math.round(overview.netWorth), format: 'currency' },
        {
            label: 'Cashflow mensuel',
            value: Math.round(overview.monthlyCashflow),
            format: 'currency',
            severity: overview.monthlyCashflow > 0 ? 'ok' : 'alert',
        },
        { label: 'Liquidités', value: Math.round(overview.liquidity), format: 'currency' },
        { label: 'Investissements', value: Math.round(overview.investments), format: 'currency' },
        { label: 'Dette totale', value: Math.round(overview.totalDebt), format: 'currency' },
        { label: 'Espace CELI dispo', value: Math.round(celiRoom), format: 'currency' },
    ];

    const alerts: HubAlert[] = [];
    if (stale && freshness.updatedAt != null) {
        alerts.push({
            label: clip(`Données périmées : dernière synchro le ${new Date(freshness.updatedAt).toISOString()}`),
            severity: 'warn',
        });
    }
    for (const signal of signals) {
        alerts.push({ label: clip(signal.observation), severity: ALERT_SEVERITY[signal.priority] });
    }

    return validateSummary({
        contractVersion: CONTRACT_VERSION,
        app: HUB_APP,
        generatedAt: new Date(now).toISOString(),
        ...(freshness.updatedAt != null ? { dataAsOf: new Date(freshness.updatedAt).toISOString() } : {}),
        status: stale ? 'degraded' : 'ok',
        metrics,
        alerts: alerts.slice(0, MAX_ALERTS),
        actions: OPEN_ACTION,
    });
}

/** Summary d'ERREUR honnête quand l'état est indisponible : le widget montre la panne, pas du vide. */
export function errorHubSummary(reason: string, now: number = Date.now()): HubSummary {
    return validateSummary({
        contractVersion: CONTRACT_VERSION,
        app: HUB_APP,
        generatedAt: new Date(now).toISOString(),
        status: 'error',
        metrics: [],
        alerts: [{ label: clip(`État indisponible : ${reason}`), severity: 'alert' }],
        actions: OPEN_ACTION,
    });
}
