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
import { logErrorThrottled } from '../errorLogger';

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

/** Un conseil concret de la période, prêt pour la checklist (montant + « pourquoi » séparés). */
export interface AdviceItem {
    /** Action courte SANS le montant (affiché à part, aligné/coloré). */
    text: string;
    /** Montant signé : > 0 = déposer, < 0 = retirer ; null = pas d'action chiffrée (info). */
    amount: number | null;
    /** Explication « pourquoi », langage simple, repliable côté UI. */
    why: string;
    /** 'info' = résumé non cochable et non directionnel ; 'deposit'/'withdraw' = action cochable. */
    kind: 'deposit' | 'withdraw' | 'info';
}

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
    /** Conseils concrets dérivés des flux (montant + « pourquoi » structurés). */
    advice: AdviceItem[];
}

type Point = Record<string, unknown>;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * [SILENT-ACTIONPLAN-NAN] Champ RENSEIGNÉ mais non fini (NaN, Infinity, valeur non numérique) —
 * `num()` le rabat sur 0, ce qui fabrique un conseil chiffré FAUX (« Cotise 0 $ », « Rien de
 * notable ») à partir d'une donnée moteur corrompue. Convention du dossier (`pastPurchaseInit.ts`
 * `isCorrupt`, `netWorth.ts` HARDEN-NETWORTH-NAN) : présent-mais-invalide → JOURNALISÉ ;
 * réellement absent (`null`/`undefined`, ex. un scénario qui n'émet pas `NetTransferREEE`) →
 * silencieux, c'est un cas normal.
 */
const isCorrupt = (v: unknown): boolean => v != null && !(typeof v === 'number' && Number.isFinite(v));

/** Points futurs (monthIndex >= 0), triés. Le passé réel n'a pas d'action. */
const futurePoints = (chartData: Point[]): Point[] =>
    (chartData || [])
        .filter((d) => num(d.monthIndex) >= 0 && d.year != null)
        .sort((a, b) => num(a.monthIndex) - num(b.monthIndex));

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

// « Pourquoi » par compte et par sens — mécanismes fiscaux en langage simple, SANS aucune
// valeur chiffrée (les constantes fiscales vivent dans docs/FISCAL_REFERENCE.md, jamais ici).
// Exporté pour que les tests balaient l'intégralité de la map (garde-fou anti-chiffre).
export const ADVICE_WHY: Record<ActionAccountKey, { deposit: string; withdraw: string }> = {
    CELI: {
        deposit: 'Le CELI fait croître ton argent à l’abri de l’impôt ; les retraits sont libres d’impôt.',
        withdraw: 'Retrait du CELI : non imposable, et le droit de cotisation se libère l’année suivante.',
    },
    CELIAPP: {
        deposit: 'Le CELIAPP (FHSA) cumule la déduction du REER et le retrait non imposable du CELI, pour une première maison.',
        withdraw: 'Retrait du CELIAPP pour un achat admissible : non imposable.',
    },
    REER: {
        deposit: 'Cotiser au REER réduit ton revenu imposable cette année ; l’impôt est reporté au retrait.',
        withdraw: 'Retrait du REER : imposable comme un revenu — d’où l’intérêt de le faire en année à faible revenu.',
    },
    REEE: {
        deposit: 'Le REEE attire les subventions gouvernementales pour les études des enfants.',
        withdraw: 'Retrait du REEE : seules les subventions et les gains (les PAE) sont imposés, chez l’étudiant à faible taux ; le capital que tu as cotisé te revient non imposable.',
    },
    NonReg: {
        deposit: 'Compte non enregistré : pas d’abri fiscal mais aucun plafond — pour épargner au-delà des comptes enregistrés.',
        withdraw: 'Retrait du non-enregistré : tu n’es imposé que sur le gain en capital réalisé, pas sur le capital. (Les intérêts et dividendes du compte, eux, sont imposés chaque année.)',
    },
    Crypto: {
        deposit: 'Crypto : actif volatil et sans abri fiscal — à garder en petite portion.',
        withdraw: 'Vente de crypto : le gain réalisé est imposé comme un gain en capital.',
    },
    Liquidites: {
        deposit: 'Tu renforces ton coussin de sécurité — disponible en tout temps, mais ça rapporte peu.',
        withdraw: 'Tu puises dans tes liquidités — normal pour financer une dépense ou alimenter un placement.',
    },
};

const buildAdvice = (
    flows: Record<ActionAccountKey, number>,
    isRetired: boolean,
    deposited: number,
    withdrawn: number,
): AdviceItem[] => {
    const moves = ACTION_ACCOUNTS.map((a) => ({ label: a.label, key: a.key, v: flows[a.key] }))
        .filter((m) => Math.abs(m.v) >= FLOW_THRESHOLD)
        .sort((a, b) => Math.abs(b.v) - Math.abs(a.v));

    const items: AdviceItem[] = [];
    const net = deposited - withdrawn;
    if (net > FLOW_THRESHOLD) {
        items.push({
            text: 'Épargne nette sur la période', amount: net, kind: 'info',
            why: 'Tu mets de côté plus que tu ne sors : ton patrimoine grossit sur la période.',
        });
    } else if (net < -FLOW_THRESHOLD) {
        items.push({
            text: 'Décaissement net sur la période', amount: net, kind: 'info',
            why: 'Tu sors plus que tu n’épargnes — normal en retraite ou pour financer un achat planifié.',
        });
    }
    if (isRetired) {
        items.push({
            text: 'Phase de décaissement', amount: null, kind: 'info',
            why: 'À la retraite, on pige dans les comptes dans l’ordre le plus avantageux fiscalement.',
        });
    }

    for (const m of moves) {
        const deposit = m.v > 0;
        items.push({
            text: deposit ? `Cotise au ${m.label}` : `Retire du ${m.label}`,
            amount: m.v,
            kind: deposit ? 'deposit' : 'withdraw',
            why: deposit ? ADVICE_WHY[m.key].deposit : ADVICE_WHY[m.key].withdraw,
        });
    }
    if (items.length === 0) {
        items.push({
            text: 'Rien de notable à faire — laisse fructifier', amount: null, kind: 'info',
            why: 'Aucun mouvement marquant sur la période : tes placements continuent de croître seuls.',
        });
    }
    return items;
};

/** Agrège un ensemble de points en un bucket d'un niveau donné. */
const makeBucket = (points: Point[], level: PlanLevel): PlanBucket => {
    const first = points[0];
    const last = points[points.length - 1];

    const flows = { Liquidites: 0, CELI: 0, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0 } as Record<ActionAccountKey, number>;
    let isRetired = false;
    // [SILENT-ACTIONPLAN-NAN] champs $ présents-mais-non-finis rencontrés dans la période (noms
    // seulement : la valeur fautive est NaN/Infinity par définition, aucun montant réel n'est journalisé).
    const corruptFields = new Set<string>();
    for (const d of points) {
        if (d.isRetired) isRetired = true;
        for (const a of ACTION_ACCOUNTS) {
            const v = d[a.field];
            if (isCorrupt(v)) corruptFields.add(a.field);
            flows[a.key] += num(v);
        }
    }
    if (isCorrupt(last.NetWorth)) corruptFields.add('NetWorth');
    let deposited = 0;
    let withdrawn = 0;
    for (const a of ACTION_ACCOUNTS) {
        const v = Math.round(flows[a.key]);
        flows[a.key] = v;
        if (v > 0) deposited += v;
        else if (v < 0) withdrawn += -v;
    }

    // [SILENT-ACTIONPLAN-NAN] Le module alimente le « Plan d'action » en montants CONCRETS : une
    // valeur moteur non finie neutralisée à 0 sans trace produisait un conseil crédible et faux.
    // Throttlé par (niveau, ensemble de champs fautifs) : `makeBucket` est rejoué à chaque drill et
    // à chaque run de projection → logguer à chaque appel thrasherait le journal (même raison que
    // le throttle de `computeRawNetWorth`).
    if (corruptFields.size > 0) {
        const fields = [...corruptFields].sort().join(',');
        logErrorThrottled(`actionPlan-nonfini:${level}:${fields}`, {
            source: 'projection',
            severity: 'warning',
            message: 'Plan d\'action : champ moteur non fini neutralisé à 0 $ (conseil chiffré potentiellement faux)',
            context: { level, fields, startMonthIndex: num(first.monthIndex), monthCount: points.length },
        });
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
