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
import { computeFinancialSignals, type FinancialSignal } from './financialSignals';
import {
    MAX_STALE_DAYS,
    computePortfolioSessionMetrics,
    libelleSeance,
} from '../services/history/portfolioSessionMetrics';
import { computeAssetBreakdown } from '../services/portfolio';
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
/** Plafonds du contrat v1.3 : libellé d'une ligne de détail, sa précision, un `why`. */
const MAX_DETAIL_LABEL = 40;
const MAX_HINT = 80;
const MAX_WHY = 140;

/**
 * Âge maximal ATTENDU de `dataAsOf`, publié au hub (`expectedMaxAgeSec`, contrat v1.3).
 *
 * ── CE QU'IL SURVEILLE, ET CE QU'IL NE SURVEILLE PAS ────────────────────────────────
 *
 * C'est un FILET DE FOND, pas le contrôle de fraîcheur quotidien — et il est important de ne pas
 * confondre les deux, sous peine de le « resserrer » un jour et de rendre le hub bavard à tort.
 *
 * Le contrôle quotidien existe déjà et il est plus strict : au-delà de `STALE_THRESHOLD_MS`
 * (6 h sans push Drive), ce summary passe en `status: 'degraded'` et porte une alerte. Le hub
 * affiche cet état-là sans avoir besoin d'un seuil.
 *
 * Alors pourquoi un seuil malgré tout ? Parce que `dataAsOf` n'est PAS l'horodatage du push : c'est
 * le plus ANCIEN du push et de la clôture de marché servie (voir plus bas). Un seuil de 6 h y
 * serait donc FAUX — il crierait « donnée figée » chaque week-end, alors que la bourse est
 * simplement fermée. Ce qu'un seuil peut attraper ici, c'est l'abandon : plus de push ET plus de
 * séance pendant des jours.
 *
 * DÉRIVÉ de `MAX_STALE_DAYS`, jamais choisi : au-delà de ce retard, `computePortfolioSessionMetrics`
 * REFUSE de publier la séance, donc `dataAsOf` retombe sur le seul push. Le +1 jour couvre
 * l'horodatage de la clôture à la fin de sa journée UTC et la frontière du refus. Un seuil
 * indépendant aurait dérivé au premier rajustement de `MAX_STALE_DAYS`, en silence.
 */
export const AGE_MAX_ATTENDU_SEC = (MAX_STALE_DAYS + 1) * 24 * 3600;

/**
 * L'ACTION que chaque signal recommande, par identifiant de signal.
 *
 * ⚠️ Ce n'est pas un doublon de `observation`. Un signal DÉCRIT (« 2 dettes à taux ≥ 8 % pour
 * 12 400 $ ») ; une recommandation DIT QUOI FAIRE. Le contrat sépare d'ailleurs les deux : `label`
 * porte l'action, `why` porte le constat. Recopier l'observation dans `label` produirait une
 * « recommandation » qui ne recommande rien — et elle dépasserait les 80 caractères du contrat.
 *
 * Clé = `signal.id`, stable. `tests/mcp/hubSummary.test.ts` énumère les identifiants RÉELS de
 * `mcp/financialSignals.ts` et exige que chacun ait son action : un signal ajouté sans action
 * fait tomber le test, au lieu de retomber en silence sur le repli ci-dessous.
 */
const ACTION_PAR_SIGNAL: Record<string, string> = {
    high_interest_debt: 'Rembourser les dettes à taux élevé en priorité',
    negative_cashflow: 'Rétablir un cashflow mensuel positif',
    thin_emergency_fund: "Regarnir le coussin d'urgence (3 mois de dépenses)",
    unused_celi_room: "Utiliser l'espace CELI inexploité",
    unused_reer_room: "Utiliser l'espace REER inexploité",
};

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

/** Tronque en signalant la coupe : une valeur coupée en silence passe pour la valeur entière. */
function borne(texte: string, max: number): string {
    const t = texte.trim();
    return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}\u2026`;
}

/** « il y a 12 min », « il y a 4 h », « il y a 3 j » — RELATIF, donc sans fuseau. */
function ilYA(deltaMs: number): string {
    const min = Math.max(0, Math.round(deltaMs / 60_000));
    if (min < 60) return `il y a ${min} min`;
    const h = Math.round(min / 60);
    return h < 48 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
}

/**
 * La recommandation du contrat v1.3, tirée du signal le PLUS PRIORITAIRE. PURE.
 *
 * `computeFinancialSignals` rend déjà ses signaux triés — dettes toxiques et cashflow négatif
 * (`high`) avant coussin et espaces CELI/REER (`medium`). `signals[0]` est donc l'action la plus
 * urgente, et elle ne coûte RIEN : la fonction est déjà appelée pour les alertes.
 *
 * `label` porte l'ACTION, `why` le constat. Le repli sur l'observation tronquée existe pour qu'un
 * signal futur produise quand même une recommandation plutôt que rien ; c'est le test qui empêche
 * ce repli d'être le chemin normal.
 */
export function recommandation(signals: readonly FinancialSignal[]): HubSummary['recommendation'] {
    const premier = signals[0];
    if (!premier) return undefined;
    const action = ACTION_PAR_SIGNAL[premier.id];
    return {
        label: borne(action ?? premier.observation, MAX_ALERT_LABEL),
        why: borne(premier.observation, MAX_WHY),
        href: HUB_APP.url,
    };
}

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
    // [HUB-REFUS-4-SANS-DIAGNOSTIC] Le résultat porte désormais sa CAUSE quand il refuse : une
    // carte qui perd ses trois lignes sans un mot est indiscernable d'une panne. `placements` garde
    // exactement la sémantique d'avant (métriques ou rien), `refusPlacements` porte le pourquoi.
    const resultatPlacements = computePortfolioSessionMetrics(state.assets, state.fxRates, { nowMs: now });
    const placements = resultatPlacements.statut === 'ok' ? resultatPlacements.metriques : null;
    const refusPlacements = resultatPlacements.statut === 'refus' ? resultatPlacements.refus : null;

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
            // `primary` (contrat v1.3) désigne LE chiffre de la carte. Jusqu'ici le hub le
            // déduisait de la position 0 — ce qui marchait tant que personne ne réordonnait
            // cette liste, alors que le commentaire ci-dessous dit justement que l'ordre est un
            // arbitrage qui a DÉJÀ changé une fois.
            primary: true,
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
            // ⚠️⚠️ [HUB-METRIQUE-LIBELLE-EST-UNE-CLE] LIBELLÉ STABLE, et ce n'est pas cosmétique :
            // côté hub, le libellé est la CLÉ de l'historique de la métrique (`serieMetrique(
            // historique, metrique.label)` dans `app/app/[id]/page.tsx`, mesuré en lisant le dépôt
            // Hubperso). Ce libellé portait la date de la clôture — `Placements (16 sept.)` —, donc
            // il CHANGEAIT à chaque séance : la série repartait de zéro chaque jour, la sparkline
            // restait vide et la ligne affichait « pas encore d'historique » à perpétuité, sous une
            // valeur pourtant publiée. C'est ce que Marc voyait (capture du 2026-09-17).
            // La date n'est pas perdue : elle vit dans `details` → « Clôture de référence », qui est
            // l'endroit prévu pour qualifier une valeur sans en changer l'identité.
            label: 'Placements',
            value: Math.round(placements.valeurCad),
            format: 'currency',
            ...(placements.seance ? { trend: placements.seance.pct } : {}),
        });
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

    // ── SECTIONS DE DÉTAIL (contrat v1.3) ───────────────────────────────────────────
    //
    // 1. LA FRAÎCHEUR, DÉCOMPOSÉE. `dataAsOf` est le plus ANCIEN de deux horloges qui n'ont pas
    //    du tout la même cadence : le push Drive (quelques minutes quand l'app est ouverte) et la
    //    clôture de marché (une fois par jour OUVRÉ). Un seul horodatage ne peut pas dire laquelle
    //    des deux est en retard — et c'est pourtant la première question quand un chiffre surprend.
    //    Les publier séparément coûte deux lignes et répond à la question.
    // 2. LA VENTILATION DES PLACEMENTS, telle que `computeAssetBreakdown` la calcule déjà (source
    //    unique, conversion FX incluse). C'est elle qui explique les signaux d'espace CELI/REER :
    //    la recommandation dit « utiliser l'espace CELI », le détail montre ce qu'il y a dedans.
    const details: NonNullable<HubSummary['details']> = [];
    if (freshness.updatedAt != null || placements) {
        const lignes: NonNullable<HubSummary['details']>[number]['items'] = [];
        if (freshness.updatedAt != null) {
            lignes.push({
                label: 'Dernière synchro',
                value: ilYA(Math.max(0, now - freshness.updatedAt)),
                format: 'text',
                // La gravité suit le seuil de l'app, jamais un second jugement : c'est le MÊME
                // `stale` qui met le summary en `degraded` juste au-dessus.
                ...(stale ? { severity: 'warn' as const } : {}),
                hint: borne(`l'app pousse son état sur Drive ; périmé au-delà de ${Math.round(STALE_THRESHOLD_MS / 3_600_000)} h`, MAX_HINT),
            });
        }
        if (placements) {
            lignes.push({
                label: 'Clôture de référence',
                value: libelleSeance(placements.dateSeance),
                format: 'text',
                hint: borne(`la bourse ne cote pas la fin de semaine ; refusée au-delà de ${MAX_STALE_DAYS} j`, MAX_HINT),
            });
        }
        if (lignes.length > 0) details.push({ title: 'Fraîcheur des deux sources', items: lignes });
    }

    // ── LES VARIATIONS, EN DÉTAIL ET JAMAIS EN MÉTRIQUE ─────────────────────────────
    //
    // ⚠️⚠️ [HUB-SPARKLINE-VARIATION-DE-VARIATION] « Variation de la séance » et « Variation 7 jours »
    // ÉTAIENT publiées comme métriques. Or le hub dérive, pour CHAQUE métrique, l'évolution de sa
    // VALEUR sur 7 jours : `(apres.v − avant.v) / avant.v` (`lib/historique.ts`, rendu par la page
    // de détail). Sur une grandeur qui EST déjà une variation, cette base est petite et change de
    // signe — d'où les « −430,6 % sur 7 j » et « −908,4 % sur 7 j » de la capture de Marc. Le
    // chiffre n'est pas faux, il est INEXPLOITABLE (`UN-CHIFFRE-JUSTE-PEUT-ETRE-ILLISIBLE`).
    //
    // Le contrat n'a aucun moyen de dire « ne dérive pas celle-ci » : la correction est donc de ne
    // pas les publier LÀ. Une ligne de `details` est rendue telle quelle — valeur, `trend` publié,
    // `hint` —, sans série ni évolution dérivée (vérifié dans le dépôt Hubperso). Rien n'est perdu :
    // le % de la séance reste le `trend` de « Placements », qui est un NIVEAU, donc la seule des
    // deux dont une évolution sur 7 jours veut dire quelque chose.
    if (placements && (placements.seance || placements.semaine)) {
        const lignes: NonNullable<HubSummary['details']>[number]['items'] = [];
        if (placements.seance) {
            lignes.push({
                label: 'Variation de la séance',
                value: Math.round(placements.seance.montantCad),
                format: 'currency',
                trend: placements.seance.pct,
                hint: borne(`clôture du ${libelleSeance(placements.dateSeance)} contre la précédente`, MAX_HINT),
            });
        }
        if (placements.semaine) {
            lignes.push({
                label: 'Variation 7 jours',
                value: Math.round(placements.semaine.montantCad),
                format: 'currency',
                trend: placements.semaine.pct,
                hint: borne('même panier de titres aux deux bornes, sinon la variation est refusée', MAX_HINT),
            });
        }
        details.push({ title: 'Variation des placements', items: lignes });
    }

    // [HUB-REFUS-4-SANS-DIAGNOSTIC] Quand les placements ne sont PAS publiables, dire pourquoi.
    //
    // ⚠️ Sans cette section, la carte perd ses trois lignes et ne dit rien — or l'app, elle, nomme
    // déjà les titres fautifs (`staleTailSymbols` → bannière de l'écran Investissements). Le hub
    // avait l'information et la jetait : un silence qu'on ne peut pas expliquer se lit comme une
    // panne, et c'est ce que le refus du total amputé allait produire chez Marc.
    //
    // ⚠️ On publie le FAIT et les SYMBOLES, jamais un montant : il n'y a précisément aucun montant
    // digne de foi à publier — c'est tout l'objet du refus.
    if (refusPlacements) {
        const item = (value: string, hint: string) => ([{
            label: 'Placements non publiés',
            value: borne(value, MAX_DETAIL_LABEL),
            format: 'text' as const,
            severity: 'warn' as const,
            hint: borne(hint, MAX_HINT),
        }]);
        let lignes: NonNullable<HubSummary['details']>[number]['items'];
        switch (refusPlacements.raison) {
            case 'total-ampute':
                lignes = item(
                    refusPlacements.symboles.length > 0
                        ? `${refusPlacements.symboles.length} titre(s) hors du total : ${refusPlacements.symboles.join(', ')}`
                        : 'des titres détenus ne comptent pas dans le total',
                    'cours trop anciens et pas de cotation fraîche pour les remplacer ; un total incomplet serait faux, pas approximatif',
                );
                break;
            case 'reference-perimee':
                lignes = item(
                    `dernière clôture le ${refusPlacements.dateSeance} (${refusPlacements.ageJours} j)`,
                    "l'historique daté n'avance que quand l'app s'ouvre ; au-delà du seuil ce n'est plus une séance",
                );
                break;
            case 'inventaire-illisible':
                lignes = item(
                    'inventaire des titres écartés illisible',
                    'impossible d\'affirmer que le total est complet — on refuse plutôt que de supposer',
                );
                break;
            default:
                lignes = item(
                    'pas assez de données de cours',
                    'moins de deux clôtures exploitables : il y a une valeur, pas une variation',
                );
        }
        details.push({ title: 'Pourquoi les placements manquent', items: lignes });
    }

    const ventilation = computeAssetBreakdown(state.assets ?? [], state.fxRates ?? {});
    const postes: [string, number][] = [
        ['REER', ventilation.reer],
        ['CELI', ventilation.celi],
        ['REEE', ventilation.reee],
        ['Non enregistré', ventilation.nonReg],
        ['Crypto', ventilation.crypto],
    ];
    // ⚠️ Seuls les postes NON NULS. Publier « REEE : 0 $ » sur un compte qui n'existe pas
    // affirmerait un compte vide là où il n'y a pas de compte — et le hub trie ses lignes, donc
    // cinq zéros pousseraient dehors ce qui a de la valeur. Aucun poste ⇒ aucune section.
    const garnis = postes.filter(([, v]) => Math.round(v) !== 0);
    if (garnis.length > 0) {
        details.push({
            title: 'Placements par compte',
            items: garnis.map(([label, valeur]) => ({
                label: borne(label, MAX_DETAIL_LABEL),
                value: Math.round(valeur),
                format: 'currency' as const,
            })),
        });
    }

    const reco = recommandation(signals);

    return validateSummary({
        contractVersion: CONTRACT_VERSION,
        app: HUB_APP,
        generatedAt: new Date(now).toISOString(),
        // [HUB-PLACEMENTS-SEANCE] `dataAsOf` doit refléter la fraîcheur de la donnée SOUS-JACENTE,
        // pas l'instant du build. Quand on publie des chiffres de marché, la donnée la plus ANCIENNE
        // des deux gouverne : servir l'horodatage du push Drive pendant qu'on affiche la clôture de
        // l'avant-veille surestimerait la fraîcheur de ce qui est à l'écran.
        // ⚠️ `expectedMaxAgeSec` ne se publie QU'AVEC `dataAsOf` — le contrat v1.3 rejette un âge
        // attendu orphelin, et il a raison : un seuil sans horodatage à comparer donnerait la
        // certitude d'être surveillé alors que rien ne le serait. C'est un FILET DE FOND (voir
        // `AGE_MAX_ATTENDU_SEC`), pas le contrôle quotidien — celui-ci est `status: 'degraded'`.
        ...(dataAsOf != null ? { dataAsOf, expectedMaxAgeSec: AGE_MAX_ATTENDU_SEC } : {}),
        status: stale ? 'degraded' : 'ok',
        metrics,
        alerts: alerts.slice(0, MAX_ALERTS),
        actions: OPEN_ACTION,
        usage: { cost: { amount: aiChatCostUsd, currency: 'USD', period: 'total' } },
        ...(reco ? { recommendation: reco } : {}),
        ...(details.length > 0 ? { details } : {}),
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
