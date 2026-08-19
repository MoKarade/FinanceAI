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
import { computePortfolioSessionMetrics, libelleSeance } from '../services/history/portfolioSessionMetrics';
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
    // `celiRoom` n'est plus publié en métrique (place prise par les placements) — il reste calculé
    // par `computeFinancialSignals`, qui l'utilise pour ses SIGNAUX (alertes). On ne le déstructure
    // simplement plus ici.
    const { overview, signals } = computeFinancialSignals(state);
    const freshness = getStateFreshness();
    const age = freshness.updatedAt == null ? null : Math.max(0, now - freshness.updatedAt);
    const stale = age != null && age > STALE_THRESHOLD_MS;

    // [HUB-PLACEMENTS-SEANCE] Variation des placements — `null` si la donnée ne permet pas de
    // l'affirmer (série absente, séance de référence périmée, bornes synthétiques). Voir
    // `services/history/portfolioSessionMetrics.ts` pour les trois refus.
    const placements = computePortfolioSessionMetrics(state.assets, state.fxRates, { nowMs: now });

    // ⚠️ SIX métriques MAXIMUM (contrat du hub), et la PREMIÈRE est rendue en gros. L'ordre est
    // donc un arbitrage, pas une liste. Les trois lignes de placements prennent la place de
    // `Investissements` (la variation dit tout ce que la valeur disait, et davantage), `Dette
    // totale` et `Espace CELI dispo` — les deux grandeurs les plus STABLES du lot, qui n'apprennent
    // rien d'un coup d'œil quotidien et restent consultables dans l'app.
    // ⚠️ Quand les métriques de placements sont REFUSÉES, les trois sortantes ne reviennent pas :
    // une carte dont la composition change selon la fraîcheur des cours serait illisible. On publie
    // moins, pas autre chose.
    const metrics: HubMetric[] = [
        {
            label: 'Valeur nette',
            value: Math.round(overview.netWorth),
            format: 'currency',
            // `trend` = variation RELATIVE signée en %, colorée par le hub. Celle des placements est
            // la seule variation QUOTIDIENNE honnête dont on dispose : les dettes sont figées et
            // l'immobilier bouge par palier ANNUEL dans la reconstruction du passé. On ne l'appose
            // donc à la valeur nette que si elle existe — jamais un 0 qui dirait « stable ».
            ...(placements?.seance ? { trend: placements.seance.pct } : {}),
        },
        {
            label: 'Cashflow mensuel',
            value: Math.round(overview.monthlyCashflow),
            format: 'currency',
            severity: overview.monthlyCashflow > 0 ? 'ok' : 'alert',
        },
        { label: 'Liquidités', value: Math.round(overview.liquidity), format: 'currency' },
    ];

    if (placements) {
        metrics.push({
            label: `Placements (${libelleSeance(placements.dateSeance)})`,
            value: Math.round(placements.valeurCad),
            format: 'currency',
            ...(placements.seance ? { trend: placements.seance.pct } : {}),
        });
        if (placements.seance) {
            // ⚠️ Le hub formate `currency` en fr-CA : un négatif porte « − », un positif n'a PAS de
            // « + ». Le libellé doit donc suffire à dire qu'on lit une VARIATION, sans quoi
            // « 1 240 $ » se lirait comme un solde.
            metrics.push({
                label: 'Variation de la séance',
                value: Math.round(placements.seance.montantCad),
                format: 'currency',
                trend: placements.seance.pct,
            });
        }
        if (placements.semaine) {
            metrics.push({
                label: 'Variation 7 jours',
                value: Math.round(placements.semaine.montantCad),
                format: 'currency',
                trend: placements.semaine.pct,
            });
        }
    }

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

    // Coût cumulé du chat IA (mesuré côté app en USD, cf. services/aiChat/pricing) → bloc
    // usage du hub. Déjà présent dans l'AppState synchronisé : aucune donnée nouvelle exposée.
    const aiChatCostUsd =
        typeof state.aiChatCostUsdTotal === 'number' && state.aiChatCostUsdTotal >= 0
            ? Math.round(state.aiChatCostUsdTotal * 100) / 100
            : 0;

    // La clôture est datée au JOUR : on l'horodate à la fin de cette journée UTC plutôt qu'à minuit,
    // sans quoi une séance du jour même paraîtrait vieille de 24 h. Elle ne peut jamais dépasser
    // `now` (une séance future n'existe pas), et `Math.min` avec le push Drive garde la plus ancienne.
    const seanceMs = placements
        ? Math.min(now, Date.parse(`${placements.dateSeance}T23:59:59Z`))
        : null;
    const candidats = [freshness.updatedAt, seanceMs].filter((v): v is number => v != null && Number.isFinite(v));
    const dataAsOf = candidats.length > 0 ? new Date(Math.min(...candidats)).toISOString() : null;

    return validateSummary({
        contractVersion: CONTRACT_VERSION,
        app: HUB_APP,
        generatedAt: new Date(now).toISOString(),
        // [HUB-PLACEMENTS-SEANCE] `dataAsOf` doit refléter la fraîcheur de la donnée SOUS-JACENTE,
        // pas l'instant du build. Quand on publie des chiffres de marché, la donnée la plus ANCIENNE
        // des deux gouverne : servir l'horodatage du push Drive pendant qu'on affiche la clôture de
        // l'avant-veille surestimerait la fraîcheur de ce qui est à l'écran.
        ...(dataAsOf != null ? { dataAsOf } : {}),
        status: stale ? 'degraded' : 'ok',
        metrics,
        alerts: alerts.slice(0, MAX_ALERTS),
        actions: OPEN_ACTION,
        usage: { cost: { amount: aiChatCostUsd, currency: 'USD', period: 'total' } },
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
