// services/projection/dailyLedger.ts
//
// [FUTUR-DAILY-FULL] Le mois du moteur, ventilé au JOUR — TOUS les champs, pas seulement la
// valeur nette.
//
// ⚠️ POURQUOI CE MODULE EXISTE (retour de Marc, 2026-08-11, capture à l'appui : « ça me dit encore
// septembre 2026 et pas le jour […] je veux que tous les calculs soient faits pour chaque jour, je
// veux que tout soit ajusté au jour, toutes les sommes »).
// `dailyRefine` ne raffinait QUE `NetWorth`. Les points quotidiens ne portaient donc aucun des
// champs que l'infobulle affiche — soldes par compte, dépôts, rendement, paie, dépenses, impôts —
// et l'écran devait masquer les aires empilées en s'en expliquant. Résultat : une courbe au jour
// SANS calculs au jour. Ce module comble exactement ce trou : il produit des points quotidiens qui
// respectent le contrat COMPLET de `ProjectionChartPoint`, donc l'infobulle et les aires empilées
// existantes fonctionnent au jour SANS être réécrites (et sans divergence possible entre les deux
// granularités, puisqu'il n'y a qu'un seul composant d'affichage).
//
// ⚠️ CE QUI EST DATÉ, CE QUI EST RÉPARTI — et pourquoi on ne triche sur aucun des deux.
//   • DATÉ (information réelle) : la paie (hebdomadaire, jeudi), les charges récurrentes détectées
//     (leur `dayOfMonth`), les paiements de dette, le solde d'impôt (échéance = fin de mois, donc
//     le 30 avril pour la régularisation annuelle du moteur).
//   • RÉPARTI (pas de date connue) : le rendement du marché, les transferts entre comptes, la
//     plupart des flux fiscaux courus. Personne ne connaît le rendement du 14 septembre 2044 ;
//     fabriquer une volatilité quotidienne « réaliste » serait de la donnée inventée.
// Chaque jour porte donc `dayIsDated` + `dayLabels` pour que l'écran distingue les deux.
//
// ⚠️ L'INVARIANT DE RACCORD, ÉTENDU À TOUS LES CHAMPS. Le dernier jour d'un mois rend EXACTEMENT
// la valeur du moteur pour chaque champ de STOCK, et la somme des jours rend EXACTEMENT le total du
// moteur pour chaque champ de FLUX. Sans ça, l'app afficherait deux vérités selon le zoom.
//
// ⚠️ POURQUOI UNE CLASSIFICATION EXPLICITE DE CHAQUE CHAMP. Confondre un STOCK et un FLUX est la
// faute la plus chère possible ici : un solde de 31 469 $ traité comme un flux s'afficherait à
// 1 049 $/jour — un chiffre parfaitement crédible, et faux d'un facteur 30, sur un écran
// money-critical. La table ci-dessous est donc EXHAUSTIVE et gardée par un test qui échoue dès
// qu'un champ émis par le moteur n'y figure pas (classe de dérive silencieuse déjà vue sur les
// outils-gardes à valeurs recodées).

import type { ProjectionChartPoint } from './types';
import { daysInMonth, calendarFromMonthIndex, type DatedDelta } from './dailyRefine';
import {
    datedDeltasForMonth,
    weeklyDeltasForMonth,
    weeklyOccurrencesInMonth,
    DEFAULT_PAY_DAY_OF_WEEK,
    type MinimalRecurring,
} from './datedMonthEvents';

// ── Classification des champs ────────────────────────────────────────────────────────────────

export type FieldKind =
    /** Solde / photo à un instant (« combien j'ai »). Interpolé de la fin du mois précédent à la
     *  fin de ce mois-ci. Le dernier jour vaut EXACTEMENT la valeur du moteur. */
    | 'stock'
    /** Montant DU mois (« combien il est passé »). Réparti sur les jours selon une cadence. La
     *  somme des jours vaut EXACTEMENT le total du moteur. */
    | 'flow'
    /** Caractéristique du mois, identique chaque jour (âge, taux, pourcentage). Ni divisée ni
     *  interpolée : diviser un taux marginal par 30 n'a aucun sens. */
    | 'monthly'
    /** Recalculé au jour par ce module (date, écarts jour-à-jour, événements). */
    | 'recomputed';

export const FIELD_KIND: Readonly<Record<string, FieldKind>> = {
    // — Soldes et photos —
    Liquidites: 'stock', CELI: 'stock', CELIAPP: 'stock', REER: 'stock', REEE: 'stock',
    NonReg: 'stock', Crypto: 'stock', Immobilier: 'stock',
    DetteTotale: 'stock', DettesNonImmo: 'stock', LiquidDebt: 'stock',
    NetWorth: 'stock', realNetWorth: 'stock',
    ImpotLatent: 'stock', rapBalance: 'stock',
    CELIMax: 'stock', REERMax: 'stock', CELIAPPMax: 'stock',
    reeeContribCum: 'stock', reeeGrantsCum: 'stock',
    FireTarget: 'stock', CoastFIRE: 'stock', BaristaFIRE: 'stock',
    // Impôt COURU : un cumul qui grandit dans l'année puis se solde — un stock, pas un flux.
    AccruedTaxRevenu: 'stock', AccruedTaxGains: 'stock', AccruedTaxDivers: 'stock',
    AccruedTaxREER: 'stock',
    // Bandes Monte Carlo : des patrimoines, donc des stocks (masquées en vue jour, cf. l'écran).
    P10: 'stock', P50: 'stock', P90: 'stock',
    // ⚠️ Champs posés par l'AFFICHAGE, pas par le moteur : le préfixe passé (`buildPastPrefix`)
    // et la référence verrouillée. Ils doivent être classés comme les autres — un champ inconnu de
    // cette table est simplement ABSENT du point quotidien, ce qui le ferait disparaître de la vue
    // au jour sans le moindre message. Le test d'exhaustivité balaie `chartData` (le moteur) et ne
    // les couvre donc pas : ils sont listés ici à la main, en connaissance de cause.
    lockedNetWorth: 'stock',
    isPast: 'monthly',

    // — Flux du mois —
    IncomeMarc: 'flow', IncomeAnna: 'flow', IncomeRetirement: 'flow', Income: 'flow',
    NetSalary: 'flow', Expenses: 'flow',
    childCost: 'flow', childGross: 'flow', childBenefits: 'flow',
    ReeeContrib: 'flow', ReeePayout: 'flow',
    DividendIncome: 'flow', TaxableInvIncome: 'flow',
    pensionRRQ: 'flow', pensionPSV: 'flow', pensionPrivee: 'flow',
    ImmoHypo: 'flow', ImmoCharges: 'flow', ImmoInterest: 'flow', ImmoPrincipal: 'flow',
    RentalIncome: 'flow',
    RetraitREER: 'flow', RetraitCELI: 'flow',
    FluxImpots: 'flow', ImpotRetraitREER: 'flow', ImpotSalaireMois: 'flow',
    ImpotGainsCap: 'flow', ImpotDivers: 'flow',
    TaxPaidRevenu: 'flow', TaxPaidGains: 'flow', TaxPaidDivers: 'flow', TaxPaidREER: 'flow',
    WithheldTaxRrif: 'flow',
    ContribCELI: 'flow', ContribREER: 'flow', ContribNonReg: 'flow',
    MarketGrowthCELI: 'flow', MarketGrowthREER: 'flow', MarketGrowthNonReg: 'flow',
    MarketGrowthCrypto: 'flow', MarketGrowthLiquid: 'flow', MarketGrowthCELIAPP: 'flow',
    MarketGrowthREEE: 'flow',
    NetTransferCELI: 'flow', NetTransferREER: 'flow', NetTransferNonReg: 'flow',
    NetTransferCrypto: 'flow', NetTransferLiquid: 'flow', NetTransferCELIAPP: 'flow',
    NetTransferREEE: 'flow',
    ExpenseInflationImpact: 'flow',

    // — Caractéristiques du mois (jamais divisées) —
    year: 'monthly', age: 'monthly', isRetired: 'monthly',
    marginalTaxRate: 'monthly', effectiveTaxRate: 'monthly',
    MarketGrowthPctCELI: 'monthly', MarketGrowthPctREER: 'monthly',
    MarketGrowthPctNonReg: 'monthly', MarketGrowthPctCrypto: 'monthly',
    MarketGrowthPctLiquid: 'monthly', MarketGrowthPctCELIAPP: 'monthly',
    MarketGrowthPctREEE: 'monthly',
    liquidityRunway: 'monthly', mortgageRemainingMonths: 'monthly',
    ExpenseInflationPct: 'monthly',

    // — Recalculés au jour —
    monthIndex: 'recomputed', dateLabel: 'recomputed',
    diffNW: 'recomputed', diffCELI: 'recomputed', diffREER: 'recomputed', diffLiquid: 'recomputed',
    // `Savings` = Income − Expenses : recalculé À PARTIR DES VALEURS DU JOUR. Le répartir comme un
    // flux ordinaire le ferait diverger de ses deux termes, qui n'ont PAS la même cadence (la paie
    // tombe le jeudi, les charges à leur quantième) — une ligne « épargne du jour » qui ne serait
    // égale ni à la différence affichée juste au-dessus, ni à rien.
    Savings: 'recomputed',
    lifeEvents: 'recomputed', flowEvents: 'recomputed',
};

// ── Cadences de répartition des flux ─────────────────────────────────────────────────────────

export type FlowCadence =
    /** Aucune date connue : réparti également sur les jours du mois. */
    | 'uniform'
    /** Versé à chaque jour de paie (hebdomadaire, jeudi par défaut). */
    | 'weekly'
    /** Suit les charges récurrentes détectées, au prorata de leurs montants. */
    | 'recurring'
    /** Payé en une fois à l'échéance = dernier jour du mois (solde d'impôt : 30 avril). */
    | 'monthEnd'
    /** Mélange paie / reste : la part salaire suit les jours de paie, le reste est réparti. */
    | 'income';

/** Cadence par champ de flux. Absent ⇒ `uniform` (aucune date connue, et on ne l'invente pas). */
export const FLOW_CADENCE: Readonly<Record<string, FlowCadence>> = {
    IncomeMarc: 'weekly',
    IncomeAnna: 'weekly',
    // Impôt retenu à la source : prélevé sur chaque paie, donc à la même cadence qu'elle.
    ImpotSalaireMois: 'weekly',
    // Revenu TOTAL du ménage : salaires (datés) + rentes/décaissements (non datés).
    Income: 'income',
    NetSalary: 'income',
    // Dépenses de vie : la part détectée comme récurrente a un quantième réel ; le reste (épicerie,
    // essence, imprévus) n'en a pas et reste réparti.
    Expenses: 'recurring',
    // Régularisation annuelle : une seule sortie, à l'échéance (30 avril = dernier jour d'avril).
    FluxImpots: 'monthEnd',
};

// ── Contexte daté d'un mois ──────────────────────────────────────────────────────────────────

/** Les mouvements d'un mois dont l'app connaît réellement la DATE, séparés par nature.
 *  ⚠️ Séparés, et pas fusionnés en une seule liste : ils n'affectent PAS les mêmes champs. Un
 *  paiement de dette sort du compte (`Liquidites` baisse) mais ne change PAS le patrimoine net
 *  (la dette baisse d'autant) — les mélanger creusait un faux trou dans la valeur nette le jour de
 *  paie, aussitôt rebouché par l'étalement du résidu. */
export interface DatedMonthContext {
    /** Paie NETTE du ménage, versements hebdomadaires (positifs). */
    salary: DatedDelta[];
    /** Charges récurrentes détectées, à leur quantième (négatifs). */
    recurring: DatedDelta[];
    /** Paiements de dette hebdomadaires (négatifs). */
    debt: DatedDelta[];
    /** Solde d'impôt du mois posé à son échéance (négatif = à payer, positif = remboursement). */
    tax: DatedDelta[];
    /** Jours de paie du mois (quantièmes 1-based). */
    payDays: number[];
    nDays: number;
}

export interface DatedContextInput {
    recurring: ReadonlyArray<MinimalRecurring>;
    /** Net MENSUEL du ménage (le store le porte au mois — règle « unités argent »). */
    monthlyNetSalary: number;
    /** Somme des paiements minimums MENSUELS des dettes. */
    monthlyDebtPayment: number;
    /** Jour de paie (0 = dimanche). Défaut : jeudi, réponse de Marc. */
    payDayOfWeek?: number;
}

/** Assemble les mouvements datés d'un mois calendaire donné. */
export function datedContextFor(
    year: number,
    month: number,
    monthPoint: Readonly<ProjectionChartPoint> | undefined,
    input: DatedContextInput,
): DatedMonthContext {
    const payDayOfWeek = input.payDayOfWeek ?? DEFAULT_PAY_DAY_OF_WEEK;
    const nDays = daysInMonth(year, month);
    const flux = Number(monthPoint?.FluxImpots);
    return {
        salary: weeklyDeltasForMonth(year, month, input.monthlyNetSalary, 'Paie', 1, payDayOfWeek),
        recurring: datedDeltasForMonth(input.recurring, month),
        debt: weeklyDeltasForMonth(year, month, input.monthlyDebtPayment, 'Paiement de dette', -1, payDayOfWeek),
        // ⚠️ SIGNE : `FluxImpots > 0` = solde À PAYER (sortie de compte) → delta négatif.
        // Un remboursement (`< 0`) est une entrée. Se tromper ici ferait monter le compte le jour
        // où l'impôt est prélevé — plausible à l'œil, faux au dollar.
        tax: Number.isFinite(flux) && Math.abs(flux) > 0.005
            ? [{ day: nDays, amount: -flux, label: flux > 0 ? "Solde d'impôt" : "Remboursement d'impôt" }]
            : [],
        payDays: weeklyOccurrencesInMonth(year, month, payDayOfWeek),
        nDays,
    };
}

// ── Poids quotidiens ─────────────────────────────────────────────────────────────────────────

/** Répartition égale. */
function uniformWeights(nDays: number): number[] {
    return new Array(nDays).fill(1 / nDays);
}

/** Normalise un vecteur de poids ; rend `null` si la masse est nulle (l'appelant retombe alors
 *  sur `uniform` plutôt que de produire des `NaN` silencieux). */
function normalize(raw: number[]): number[] | null {
    const total = raw.reduce((s, v) => s + v, 0);
    if (!Number.isFinite(total) || total <= 0) return null;
    return raw.map((v) => v / total);
}

/**
 * Poids quotidiens d'une cadence. Toujours de longueur `nDays` et de somme 1 — c'est ce qui
 * garantit que la somme des jours retombe EXACTEMENT sur le total du mois.
 *
 * `salaryShare` (0..1) n'est utilisé que par la cadence `income` : la part du revenu du mois qui
 * provient d'un SALAIRE, donc datable au jour de paie. Le reste (rentes, décaissements) n'a pas de
 * date connue et reste réparti.
 */
export function cadenceWeights(
    cadence: FlowCadence,
    ctx: Pick<DatedMonthContext, 'nDays' | 'payDays' | 'recurring'>,
    salaryShare = 0,
): number[] {
    const { nDays, payDays } = ctx;
    if (nDays <= 0) return [];
    const uniform = uniformWeights(nDays);

    const weekly = (): number[] => {
        if (payDays.length === 0) return uniform; // mois sans jour de paie : impossible, mais pas de NaN
        const raw = new Array(nDays).fill(0);
        for (const d of payDays) if (d >= 1 && d <= nDays) raw[d - 1] += 1;
        return normalize(raw) ?? uniform;
    };

    switch (cadence) {
        case 'weekly':
            return weekly();
        case 'monthEnd': {
            const raw = new Array(nDays).fill(0);
            raw[nDays - 1] = 1;
            return raw;
        }
        case 'recurring': {
            // ⚠️ On pondère par les montants ABSOLUS des charges détectées, et on n'essaie PAS de
            // « caler » leur total sur celui du moteur. Les récurrentes ne sont qu'une PART des
            // dépenses de vie ; s'en servir comme FORME plutôt que comme MONTANT évite d'avoir à
            // arbitrer un dépassement (Σ récurrentes > dépenses du mois), qui produirait des jours
            // à dépense négative — un chiffre absurde qu'un graphe rend invisible.
            const raw = new Array(nDays).fill(0);
            let any = false;
            for (const d of ctx.recurring) {
                const day = Math.min(nDays, Math.max(1, Math.round(Number(d.day))));
                const amt = Math.abs(Number(d.amount));
                if (!Number.isFinite(amt) || amt === 0) continue;
                raw[day - 1] += amt;
                any = true;
            }
            if (!any) return uniform;
            // Mélange 50/50 forme-récurrente / uniforme : les jours sans charge détectée gardent
            // une dépense (épicerie, essence, imprévus existent tous les jours), et les jours de
            // prélèvement ressortent. Un poids 100 % récurrent mettrait 0 $ de dépense les autres
            // jours — faux, et plus faux que l'uniforme qu'il remplace.
            const shaped = normalize(raw) ?? uniform;
            return shaped.map((w, i) => 0.5 * w + 0.5 * uniform[i]);
        }
        case 'income': {
            const s = Math.min(1, Math.max(0, Number.isFinite(salaryShare) ? salaryShare : 0));
            const w = weekly();
            return uniform.map((u, i) => s * w[i] + (1 - s) * u);
        }
        case 'uniform':
        default:
            return uniform;
    }
}

// ── Interpolation d'un stock ─────────────────────────────────────────────────────────────────

/**
 * Série quotidienne d'un champ de STOCK, de `start` (fin du mois précédent) à `end` (fin de ce
 * mois). Les `deltas` datés sont posés à leur jour ; le RÉSIDU inexpliqué est étalé.
 *
 * ⚠️ Le dernier jour POSE `end` au lieu du cumul : sur 30 additions flottantes l'écart est de
 * l'ordre de 1e-10 $ — invisible, mais il autoriserait la série quotidienne à ne PAS retomber sur
 * le moteur. L'invariant prime sur l'élégance.
 *
 * ⚠️ Rend `null` si une borne n'est pas finie : une valeur absente ne devient JAMAIS un 0 crédible
 * (`NetWorth` est légitimement `undefined` avant la première transaction connue).
 */
export function stockSeries(
    start: unknown,
    end: unknown,
    nDays: number,
    deltas: ReadonlyArray<DatedDelta> = [],
    shape?: ReadonlyArray<number>,
): number[] | null {
    const s = Number(start);
    const e = Number(end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || nDays <= 0) return null;

    const byDay = new Array(nDays).fill(0);
    let datedTotal = 0;
    for (const d of deltas) {
        const amount = Number(d.amount);
        const rawDay = Number(d.day);
        if (!Number.isFinite(amount) || !Number.isFinite(rawDay)) continue;
        const day = Math.min(nDays, Math.max(1, Math.round(rawDay)));
        byDay[day - 1] += amount;
        datedTotal += amount;
    }

    const residual = e - s - datedTotal;
    const spread = shape && shape.length === nDays ? shape : uniformWeights(nDays);
    const out: number[] = [];
    let running = s;
    for (let i = 0; i < nDays; i++) {
        running += byDay[i] + residual * spread[i];
        out.push(i === nDays - 1 ? e : running);
    }
    return out;
}

// ── Construction des points quotidiens ───────────────────────────────────────────────────────

/** Un point quotidien : les champs du moteur ventilés au jour, plus ce qui identifie le jour.
 *  ⚠️ `Partial<>` VOLONTAIRE : un champ que le mois n'émet pas reste ABSENT du jour, et l'écran
 *  doit alors afficher « — », jamais un 0. C'est le double cast au site de construction qui avait
 *  laissé passer le faux « Variation +0 $ » de la version précédente. */
export type DailyLedgerPoint = Partial<ProjectionChartPoint> & {
    /** Abscisse fractionnaire sur l'axe numérique — posée par l'appelant (`axisXAtDay`). */
    monthIndex: number;
    /** Mois HÔTE du moteur (entier) — clé de jointure, `monthIndex` étant fractionnaire. */
    hostMonthIndex: number;
    /** Date ISO du jour, `YYYY-MM-DD`. */
    dayIso: string;
    dayOfMonth: number;
    /** Un mouvement à DATE connue tombe ce jour-là (vs simple étalement). */
    dayIsDated: boolean;
    dayLabels: string[];
    isDailyPoint: true;
};

export interface BuildDailyLedgerInput {
    /** Points MENSUELS consécutifs du moteur, triés par `monthIndex` croissant. Le PREMIER sert de
     *  valeur d'entrée et n'est pas rendu au jour (on n'invente pas le mois d'avant la fenêtre). */
    months: ReadonlyArray<ProjectionChartPoint>;
    /** Année/mois calendaires du `monthIndex` 0 de la projection. */
    startYear: number;
    startMonth: number;
    dated: DatedContextInput;
    /**
     * [FUTUR-DAILY-NATIVE] Restriction OPTIONNELLE aux champs listés (stocks/flux/monthly). Absent =
     * tout le contrat, comme avant.
     *
     * ⚠️ POURQUOI CETTE OPTION EXISTE — c'est une contrainte MESURÉE, pas une préférence
     * (benchs Node 2026-08-12, 30 ans ≈ 11 000 points ; ordres de grandeur, pas des absolus) :
     * ventilation complète ~300-500 ms et ~80-180 Mo de tas selon le nombre de champs du jeu,
     * légère ~100-180 ms et ~25 Mo. La COURBE ne trace qu'une quinzaine de champs ; l'infobulle,
     * elle, se ventile à la demande sur le mois survolé via cette MÊME fonction sans `fields`
     * (≤ 3 mois par appel). Un champ donné passe
     * donc par le même code et les mêmes entrées dans les deux chemins — c'est ce qui interdit
     * toute divergence courbe/infobulle (test de parité : `tests/services/dailyCurve.test.ts`,
     * describe « PARITÉ courbe légère ↔ infobulle complète »).
     * Les champs d'IDENTITÉ du jour (dayIso, dateLabel, dayIsDated…) et les recalculés demandés
     * sont toujours émis ; les `diff*` ne le sont que si leur champ source est retenu.
     */
    fields?: ReadonlySet<string>;
}

/** Libellé d'un jour : « lun. 14/09/2026 ».
 *  ⚠️ C'est CE libellé que Marc lisait comme « sept. 2026 » : l'infobulle affiche `dateLabel`, et
 *  un point quotidien qui hérite du libellé MENSUEL est indiscernable d'un mois à l'écran.
 *  ⚠️ Format NUMÉRIQUE `JJ/MM/AAAA` (demande Marc 2026-08-11 : « ça devrait me dire par exemple
 *  le // ») : un mois abrégé (« 14 sept. 2026 ») ressemble encore au libellé mensuel d'un coup
 *  d'œil. Les barres obliques, elles, ne laissent aucun doute sur la granularité.
 *  Le jour de la SEMAINE est gardé : la paie tombe le jeudi, et le voir rend la marche lisible. */
// [FUTUR-DAILY-NATIVE] Table des 7 noms de jours, construite UNE fois PAR `toLocaleDateString`
// (même source qu'avant — pas de liste re-codée à la main qui dériverait du locale). Mesuré : l'appel
// `toLocaleDateString` par jour dominait la ventilation de 30 ans (~800 ms pour 11 000 jours) ; la
// table le remplace par un accès indexé sur `getUTCDay()`. 2026-01-04 est un dimanche (index 0).
const WEEKDAY_SHORT_FR: ReadonlyArray<string> = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2026, 0, 4 + i)).toLocaleDateString('fr-CA', { weekday: 'short', timeZone: 'UTC' }));

export function dayLabel(year: number, month: number, day: number): string {
    const weekday = WEEKDAY_SHORT_FR[new Date(Date.UTC(year, month, day)).getUTCDay()];
    const dd = String(day).padStart(2, '0');
    const mm = String(month + 1).padStart(2, '0');
    return `${weekday} ${dd}/${mm}/${year}`;
}

const isPlainNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Ventile une fenêtre de mois consécutifs en points quotidiens portant TOUS les champs.
 *
 * Chaque champ est traité selon sa classe (`FIELD_KIND`) :
 *   • `stock`      — interpolé du mois précédent à ce mois, avec les mouvements datés qui LUI
 *                    appartiennent (cf. `datedDeltasForField`) ;
 *   • `flow`       — réparti sur les jours selon sa cadence (`FLOW_CADENCE`) ;
 *   • `monthly`    — recopié tel quel (un taux ne se divise pas) ;
 *   • `recomputed` — reconstruit ici.
 *
 * Un champ absent du mois reste ABSENT du jour : l'infobulle affiche alors « — », jamais un 0.
 */
export function buildDailyLedger(input: BuildDailyLedgerInput): DailyLedgerPoint[] {
    const { months, startYear, startMonth, dated, fields } = input;
    if (months.length < 2) return [];
    const wants = (key: string): boolean => !fields || fields.has(key);

    const out: DailyLedgerPoint[] = [];

    for (let mi = 1; mi < months.length; mi++) {
        const prev = months[mi - 1];
        const cur = months[mi];
        const hostMonthIndex = Number(cur.monthIndex);
        if (!Number.isFinite(hostMonthIndex)) continue;
        const { year, month } = calendarFromMonthIndex(startYear, startMonth, hostMonthIndex);
        const ctx = datedContextFor(year, month, cur, dated);
        const { nDays } = ctx;
        if (nDays <= 0) continue;

        // Part du revenu du mois réellement DATABLE (salaires) — le reste (rentes, décaissements)
        // n'a pas de jour connu. Rapport borné dans `cadenceWeights`.
        const salaries = (Number(cur.IncomeMarc) || 0) + (Number(cur.IncomeAnna) || 0);
        const totalIncome = Number(cur.Income);
        const salaryShare = Number.isFinite(totalIncome) && Math.abs(totalIncome) > 0.005
            ? salaries / totalIncome
            : (salaries > 0 ? 1 : 0);

        const weightsByCadence = new Map<FlowCadence, number[]>();
        const weightsFor = (c: FlowCadence): number[] => {
            const hit = weightsByCadence.get(c);
            if (hit) return hit;
            const w = cadenceWeights(c, ctx, salaryShare);
            weightsByCadence.set(c, w);
            return w;
        };

        // Mouvements datés du jour, pour l'étiquetage de l'infobulle.
        const labelsByDay = new Map<number, string[]>();
        for (const d of [...ctx.salary, ...ctx.recurring, ...ctx.debt, ...ctx.tax]) {
            const day = Math.min(nDays, Math.max(1, Math.round(Number(d.day))));
            if (!Number.isFinite(day)) continue;
            const slot = labelsByDay.get(day) ?? [];
            if (d.label) slot.push(d.label);
            labelsByDay.set(day, slot);
        }

        // Séries de stock, champ par champ.
        const stocks = new Map<string, number[] | null>();
        for (const key of Object.keys(FIELD_KIND)) {
            if (FIELD_KIND[key] !== 'stock') continue;
            if (!wants(key) || !(key in cur)) continue;
            stocks.set(key, stockSeries(
                prev[key], cur[key], nDays,
                datedDeltasForField(key, ctx),
                shapeForStock(key, ctx, weightsFor),
            ));
        }

        // Séries de flux, champ par champ.
        const flows = new Map<string, number[]>();
        for (const key of Object.keys(cur)) {
            if (FIELD_KIND[key] !== 'flow' || !wants(key)) continue;
            const total = Number(cur[key]);
            if (!Number.isFinite(total)) continue;
            const w = weightsFor(FLOW_CADENCE[key] ?? 'uniform');
            flows.set(key, w.map((x) => total * x));
        }

        for (let day = 1; day <= nDays; day++) {
            const i = day - 1;
            const point: Record<string, unknown> = {};

            // Caractéristiques du mois : recopiées telles quelles.
            for (const key of Object.keys(cur)) {
                if (FIELD_KIND[key] === 'monthly' && wants(key)) point[key] = cur[key];
            }
            for (const [key, series] of stocks) {
                if (series) point[key] = series[i];
            }
            for (const [key, series] of flows) point[key] = series[i];

            const labels = labelsByDay.get(day) ?? [];
            const isDated = labelsByDay.has(day);

            // Événements de vie : ils décrivent le MOIS, pas un jour. On les pose au 1er, là où le
            // graphe ancre déjà ses icônes-jalons (abscisse entière = jour 1). Les répéter 30 fois
            // laisserait croire à 30 voyages.
            if (day === 1) {
                if (Array.isArray(cur.lifeEvents) && cur.lifeEvents.length > 0) point.lifeEvents = cur.lifeEvents;
                if (Array.isArray(cur.flowEvents) && cur.flowEvents.length > 0) point.flowEvents = cur.flowEvents;
            }

            const income = point.Income;
            const expenses = point.Expenses;
            if (isPlainNumber(income) && isPlainNumber(expenses)) point.Savings = income - expenses;

            point.dateLabel = dayLabel(year, month, day);
            point.hostMonthIndex = hostMonthIndex;
            point.monthIndex = hostMonthIndex; // abscisse fractionnaire posée par l'appelant
            point.dayIso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            point.dayOfMonth = day;
            point.dayIsDated = isDated;
            point.dayLabels = labels;
            point.isDailyPoint = true;

            out.push(point as unknown as DailyLedgerPoint);
        }
    }

    // Écarts JOUR À JOUR, calculés sur la série finale (donc à travers la frontière des mois).
    // ⚠️ Le premier jour de la fenêtre n'a pas de veille connue : ses `diff*` restent ABSENTS.
    // Le laisser à 0 afficherait « Variation +0 $ » EN VERT — un faux chiffre crédible sur la
    // donnée la plus regardée de l'infobulle (finding déjà corrigé une fois sur ce chantier).
    const DIFFS: Array<[string, string]> = [
        ['diffNW', 'NetWorth'], ['diffCELI', 'CELI'], ['diffREER', 'REER'], ['diffLiquid', 'Liquidites'],
    ];
    for (let i = 1; i < out.length; i++) {
        for (const [diffKey, srcKey] of DIFFS) {
            const now = out[i][srcKey];
            const before = out[i - 1][srcKey];
            if (isPlainNumber(now) && isPlainNumber(before)) {
                (out[i] as Record<string, unknown>)[diffKey] = now - before;
            }
        }
    }

    return out;
}

/**
 * Mouvements datés qui appartiennent à un champ de STOCK donné.
 *
 * ⚠️ C'EST ICI QUE SE JOUE LA CORRECTION LA PLUS IMPORTANTE. Le raffinement précédent appliquait
 * la MÊME liste de mouvements à la valeur nette et au compte : un paiement de dette creusait donc
 * un trou dans le PATRIMOINE NET le jour de paie. C'est faux — le compte baisse, mais la dette
 * baisse d'autant : le patrimoine net ne bouge que de l'INTÉRÊT. Le trou était ensuite rebouché
 * par l'étalement du résidu, donc invisible à la fin du mois et bien visible au jour.
 */
export function datedDeltasForField(field: string, ctx: DatedMonthContext): DatedDelta[] {
    switch (field) {
        // Le compte courant encaisse la paie et paie tout le reste.
        case 'Liquidites':
            return [...ctx.salary, ...ctx.recurring, ...ctx.debt, ...ctx.tax];
        // Le patrimoine net : ce qui entre, ce qui sort — PAS les remboursements de dette (neutres).
        case 'NetWorth':
        case 'realNetWorth':
            return [...ctx.salary, ...ctx.recurring, ...ctx.tax];
        default:
            return [];
    }
}

/** Forme d'étalement du résidu d'un stock : les dettes baissent les jours de paiement, le reste
 *  n'a pas de date connue et s'étale également. */
function shapeForStock(
    field: string,
    ctx: DatedMonthContext,
    weightsFor: (c: FlowCadence) => number[],
): number[] | undefined {
    if (field === 'DetteTotale' || field === 'DettesNonImmo') return weightsFor('weekly');
    return undefined;
}
