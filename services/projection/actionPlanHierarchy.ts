// services/projection/actionPlanHierarchy.ts
// Plan d'action HIÉRARCHIQUE pour l'onglet Futur. Marc veut creuser :
// global → décennie → 3 ans → année → semestre → trimestre → mois → conseils.
//
// Le moteur émet le flux net mensuel par compte (NetTransfer<compte>). On le
// ré-agrège à n'importe quelle granularité en découpant le flux mensuel par
// `monthIndex` (robuste même si la projection démarre en cours d'année), sauf
// l'année qui se regroupe par le champ calendaire `year`.
//
// Fonction PURE (aucune dépendance UI) → testable. Aucune règle inventée : les
// flux et conseils affichés sont EXACTEMENT ce que la stratégie optimale exécute.

import { ACTION_ACCOUNTS, type ActionAccountKey } from './yearlyActions';

export type PlanLevel = 'global' | 'decade' | 'triennium' | 'year' | 'semester' | 'quarter' | 'month';

/** Niveau enfant atteint en cliquant un bucket de ce niveau (null = feuille). */
const CHILD_LEVEL: Record<PlanLevel, PlanLevel | null> = {
    global: 'decade',
    decade: 'triennium',
    triennium: 'year',
    year: 'semester',
    semester: 'quarter',
    quarter: 'month',
    month: null,
};

/** Largeur en mois des niveaux à découpage fixe. L'année se regroupe par calendrier. */
const CHUNK_MONTHS: Partial<Record<PlanLevel, number>> = {
    decade: 120,
    triennium: 36,
    semester: 6,
    quarter: 3,
    month: 1,
};

const LEVEL_NAME: Record<PlanLevel, string> = {
    global: "Vue d'ensemble",
    decade: 'Décennie',
    triennium: '3 ans',
    year: 'Année',
    semester: 'Semestre',
    quarter: 'Trimestre',
    month: 'Mois',
};

const FLOW_THRESHOLD = 100; // sous 100 $/période on n'affiche pas le mouvement

export interface PlanBucket {
    id: string;
    level: PlanLevel;
    label: string;
    startMonthIndex: number;
    endMonthIndex: number;
    startYear: number;
    endYear: number;
    ageStart: number | null;
    ageEnd: number | null;
    isRetired: boolean;
    /** Flux net par compte sur la période : > 0 = déposer, < 0 = retirer. */
    flows: Record<ActionAccountKey, number>;
    deposited: number;
    withdrawn: number;
    netWorthEnd: number;
    monthCount: number;
    /** true si on peut encore creuser (niveau enfant existant + plus d'un mois). */
    hasChildren: boolean;
    /** Conseils concrets dérivés des flux (langage naturel, prêts à exécuter). */
    advice: string[];
}

type Point = Record<string, unknown>;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Points futurs (monthIndex >= 0), triés. Le passé réel n'a pas d'action. */
const futurePoints = (chartData: Point[]): Point[] =>
    (chartData || [])
        .filter((d) => num(d.monthIndex) >= 0 && d.year != null)
        .sort((a, b) => num(a.monthIndex) - num(b.monthIndex));

const fmtCAD = (v: number): string => `${Math.round(v).toLocaleString('fr-CA')} $`;

const labelFor = (level: PlanLevel, points: Point[]): string => {
    const first = points[0];
    const last = points[points.length - 1];
    const y0 = num(first.year);
    const y1 = num(last.year);
    switch (level) {
        case 'global':
            return `Vue d'ensemble · ${y0}–${y1}`;
        case 'decade':
        case 'triennium':
            return y0 === y1 ? `${y0}` : `${y0}–${y1}`;
        case 'year':
            return `${y0}`;
        case 'semester':
        case 'quarter':
            return `${String(first.dateLabel ?? y0)} – ${String(last.dateLabel ?? y1)}`;
        case 'month':
            return String(first.dateLabel ?? y0);
    }
};

const buildAdvice = (
    flows: Record<ActionAccountKey, number>,
    isRetired: boolean,
    deposited: number,
    withdrawn: number,
): string[] => {
    const moves = ACTION_ACCOUNTS.map((a) => ({ label: a.label, key: a.key, v: flows[a.key] }))
        .filter((m) => Math.abs(m.v) >= FLOW_THRESHOLD)
        .sort((a, b) => Math.abs(b.v) - Math.abs(a.v));

    const lines: string[] = [];
    const net = deposited - withdrawn;
    if (net > FLOW_THRESHOLD) lines.push(`Épargne nette : +${fmtCAD(net)}`);
    else if (net < -FLOW_THRESHOLD) lines.push(`Décaissement net : ${fmtCAD(net)}`);
    if (isRetired) lines.push('Phase retraite : on décaisse de façon fiscalement optimale.');

    for (const m of moves) {
        lines.push(m.v > 0 ? `Cotise ${fmtCAD(m.v)} au ${m.label}.` : `Retire ${fmtCAD(-m.v)} du ${m.label}.`);
    }
    if (lines.length === 0) lines.push('Rien de notable à faire sur cette période — laisse fructifier.');
    return lines;
};

/** Agrège un ensemble de points en un bucket d'un niveau donné. */
const makeBucket = (points: Point[], level: PlanLevel): PlanBucket => {
    const first = points[0];
    const last = points[points.length - 1];

    const flows = { Liquidites: 0, CELI: 0, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0 } as Record<ActionAccountKey, number>;
    let isRetired = false;
    for (const d of points) {
        if (d.isRetired) isRetired = true;
        for (const a of ACTION_ACCOUNTS) flows[a.key] += num(d[a.field]);
    }
    let deposited = 0;
    let withdrawn = 0;
    for (const a of ACTION_ACCOUNTS) {
        const v = Math.round(flows[a.key]);
        flows[a.key] = v;
        if (v > 0) deposited += v;
        else if (v < 0) withdrawn += -v;
    }

    const childLevel = CHILD_LEVEL[level];
    return {
        id: `${level}:${num(first.monthIndex)}`,
        level,
        label: labelFor(level, points),
        startMonthIndex: num(first.monthIndex),
        endMonthIndex: num(last.monthIndex),
        startYear: num(first.year),
        endYear: num(last.year),
        ageStart: typeof first.age === 'number' ? first.age : null,
        ageEnd: typeof last.age === 'number' ? last.age : null,
        isRetired,
        flows,
        deposited,
        withdrawn,
        netWorthEnd: num(last.NetWorth),
        monthCount: points.length,
        hasChildren: childLevel != null && points.length > 1,
        advice: buildAdvice(flows, isRetired, deposited, withdrawn),
    };
};

/** Découpe des points (triés) en groupes de `n` mois, alignés sur le 1er mois. */
const chunkByMonths = (points: Point[], n: number): Point[][] => {
    if (points.length === 0) return [];
    const base = num(points[0].monthIndex);
    const groups = new Map<number, Point[]>();
    for (const p of points) {
        const k = Math.floor((num(p.monthIndex) - base) / n);
        const g = groups.get(k);
        if (g) g.push(p);
        else groups.set(k, [p]);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g);
};

/** Regroupe des points par année calendaire (champ `year`). */
const chunkByYear = (points: Point[]): Point[][] => {
    const groups = new Map<number, Point[]>();
    for (const p of points) {
        const y = num(p.year);
        const g = groups.get(y);
        if (g) g.push(p);
        else groups.set(y, [p]);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g);
};

/**
 * Bucket racine « global » couvrant tout l'horizon futur. null si pas de données.
 */
export const buildRootBucket = (chartData: Point[]): PlanBucket | null => {
    const pts = futurePoints(chartData);
    if (pts.length === 0) return null;
    return makeBucket(pts, 'global');
};

/**
 * Enfants d'un bucket : on re-filtre les points futurs dans la plage du parent,
 * puis on découpe selon le niveau enfant. [] si le bucket est une feuille (mois).
 */
export const getChildBuckets = (chartData: Point[], parent: PlanBucket): PlanBucket[] => {
    const childLevel = CHILD_LEVEL[parent.level];
    if (!childLevel) return [];

    const within = futurePoints(chartData).filter(
        (p) => num(p.monthIndex) >= parent.startMonthIndex && num(p.monthIndex) <= parent.endMonthIndex,
    );
    if (within.length === 0) return [];

    const groups = childLevel === 'year' ? chunkByYear(within) : chunkByMonths(within, CHUNK_MONTHS[childLevel] ?? 1);
    return groups.filter((g) => g.length > 0).map((g) => makeBucket(g, childLevel));
};

export const levelName = (level: PlanLevel): string => LEVEL_NAME[level];
