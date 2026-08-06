// services/projection/dailyRefine.ts
//
// [FUTUR-DAILY] Raffinement QUOTIDIEN d'une fenêtre de la courbe (demande Marc 2026-08-06 :
// « quotidien sur tout, je veux voir le détail si je zoom beaucoup »).
//
// ⚠️ POURQUOI CE MODULE EXISTE PLUTÔT QU'UNE BOUCLE MOTEUR AU JOUR.
// Passer `services/projection.ts` au pas quotidien voudrait dire ~11 000 itérations au lieu de 361,
// multipliées par chaque tirage Monte Carlo — et surtout REJOUER au jour une fiscalité qui n'a
// aucune granularité inférieure au mois (`taxJanuary`, `taxDecember`, `taxApril` sont des
// événements ANNUELS). Le moteur reste donc la SOURCE DE VÉRITÉ mensuelle, intouchée, et ce module
// RAFFINE la fenêtre qu'on regarde. C'est le mot « si je zoom » qui rend ça possible : on ne
// raffine que ce qui est à l'écran.
//
// ⚠️ L'INVARIANT QUI REND CE MODULE HONNÊTE.
// La série quotidienne passe EXACTEMENT par les points mensuels du moteur — par CONSTRUCTION, pas
// par chance : on part de la valeur de début de mois, on pose les mouvements DATÉS à leur jour, et
// on étale le RÉSIDU inexpliqué (la croissance) sur le mois. Le dernier jour retombe donc sur la
// valeur de fin de mois du moteur, au centime. Sans cet invariant, l'app afficherait DEUX vérités
// pour le même mois selon le niveau de zoom — exactement la classe de bug « source unique » que le
// dépôt s'interdit ailleurs.
//
// ⚠️ CE QUI EST MESURÉ ET CE QUI EST INTERPOLÉ — et pourquoi on le DIT.
// Dans un mois, l'app connaît de VRAIES dates : la paie, le loyer, un abonnement à son `dayOfMonth`,
// un paiement hypothécaire. Ces mouvements-là sont de l'information réelle et apparaissent comme des
// MARCHES au bon jour. Le reste — la croissance d'un portefeuille — n'a aucune date : l'étaler est
// une interpolation. Chaque point porte donc `isDated` pour que l'écran puisse distinguer les deux.
// Laisser croire qu'une courbe lissée est une prévision quotidienne serait de la fausse précision.

/** Un mouvement à DATE connue dans le mois (paie, loyer, abonnement, versement hypothécaire). */
export interface DatedDelta {
    /** Jour du mois, 1-based. Sera clampé au nombre réel de jours du mois. */
    day: number;
    /** Montant signé, en dollars. Non fini ⇒ ignoré (jamais transformé en 0 crédible). */
    amount: number;
    /** Libellé code-auteur pour l'infobulle (« Paie », « Loyer », « Netflix »). */
    label?: string;
}

/** Un point quotidien de la série raffinée. */
export interface DailyPoint {
    /** Date calendaire réelle, `YYYY-MM-DD`.
     *  ⚠️ C'est la SEULE clé de temps valide au jour. Un `monthIndex` fractionnaire serait un piège :
     *  `monthIndex` est un ENTIER de mois utilisé comme clé d'axe par le graphe, le tableau et les
     *  icônes-jalons — y glisser des décimales désaligne les jalons en SILENCE. */
    date: string;
    /** Ancre mensuelle du point (entier, inchangé) — permet de rejoindre les données du moteur. */
    monthIndex: number;
    /** Jour du mois, 1-based. */
    dayOfMonth: number;
    /** Valeur au SOIR de ce jour. */
    value: number;
    /** `true` si un mouvement DATÉ tombe ce jour-là (information réelle), `false` si le point ne
     *  doit son mouvement qu'à l'étalement du résidu (interpolation). L'écran s'en sert pour ne pas
     *  faire passer du lissage pour de la mesure. */
    isDated: boolean;
    /** Libellés des mouvements datés du jour, pour l'infobulle. Vide si aucun. */
    labels: string[];
}

const DAY_MS = 86_400_000;

/** Nombre de jours du mois (0-based `month`, comme `Date`). */
export function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function iso(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Raffine UN mois en points quotidiens.
 *
 * `startValue` = valeur au dernier jour du mois PRÉCÉDENT (donc l'état d'entrée du mois).
 * `endValue`   = valeur du moteur à la fin de CE mois. Le dernier point rendu vaut EXACTEMENT
 *                `endValue` — c'est l'invariant de raccord, garanti par construction.
 *
 * Les `datedDeltas` sont posés à leur jour. Le RÉSIDU (`endValue − startValue − Σdeltas`) est étalé
 * uniformément sur les jours du mois : c'est la croissance, qui n'a pas de date.
 *
 * ⚠️ Si `startValue` ou `endValue` n'est pas fini, on rend `[]` plutôt qu'une série de zéros :
 * une valeur non finie ne devient JAMAIS un défaut numérique crédible (no-fake-data).
 */
export function refineMonthToDaily(
    startValue: number,
    endValue: number,
    year: number,
    month: number,
    monthIndex: number,
    datedDeltas: ReadonlyArray<DatedDelta> = [],
): DailyPoint[] {
    if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) return [];

    const nDays = daysInMonth(year, month);

    // Regroupe les mouvements datés par jour. Un jour hors [1, nDays] est CLAMPÉ plutôt qu'ignoré :
    // un abonnement au « 31 » doit tomber le 30 en avril, pas disparaître (il est bien débité).
    const byDay = new Map<number, { sum: number; labels: string[] }>();
    let datedTotal = 0;
    for (const d of datedDeltas) {
        if (!Number.isFinite(d.amount) || !Number.isFinite(d.day)) continue;
        const day = Math.min(nDays, Math.max(1, Math.round(d.day)));
        const slot = byDay.get(day) ?? { sum: 0, labels: [] };
        slot.sum += d.amount;
        if (d.label) slot.labels.push(d.label);
        byDay.set(day, slot);
        datedTotal += d.amount;
    }

    // Le résidu est ce que les dates n'expliquent PAS : croissance, rendement, indexation.
    const residual = endValue - startValue - datedTotal;
    const perDayResidual = residual / nDays;

    const out: DailyPoint[] = [];
    let running = startValue;
    for (let day = 1; day <= nDays; day++) {
        const slot = byDay.get(day);
        running += (slot?.sum ?? 0) + perDayResidual;
        out.push({
            date: iso(year, month, day),
            monthIndex,
            dayOfMonth: day,
            // Dernier jour : on POSE `endValue` au lieu du cumul, pour tuer la dérive flottante.
            // Sur 30 additions de `residual/30`, l'écart est de l'ordre de 1e-10 $ — invisible, mais
            // il ferait échouer un test d'égalité stricte, et surtout il autoriserait la série
            // quotidienne à ne PAS retomber sur le moteur. L'invariant prime sur l'élégance.
            value: day === nDays ? endValue : running,
            isDated: slot !== undefined,
            labels: slot?.labels ?? [],
        });
    }
    return out;
}

/** Une valeur mensuelle du moteur, réduite à ce dont le raffinement a besoin. */
export interface MonthlyAnchor {
    monthIndex: number;
    year: number;
    /** Mois 0-based (comme `Date`). */
    month: number;
    value: number;
}

/**
 * Raffine une FENÊTRE de mois consécutifs.
 *
 * `anchors` doit être trié par `monthIndex` croissant et contenir au moins 2 points : le premier
 * sert de valeur d'ENTRÉE et n'est pas rendu au jour (on n'invente pas le mois d'avant la fenêtre).
 *
 * `deltasFor` fournit les mouvements datés d'un mois donné — c'est l'appelant qui sait aller
 * chercher la paie, les abonnements et l'hypothèque, ce module reste PUR.
 */
export function refineWindowToDaily(
    anchors: ReadonlyArray<MonthlyAnchor>,
    deltasFor?: (anchor: MonthlyAnchor) => ReadonlyArray<DatedDelta>,
): DailyPoint[] {
    if (anchors.length < 2) return [];
    const out: DailyPoint[] = [];
    for (let i = 1; i < anchors.length; i++) {
        const prev = anchors[i - 1];
        const cur = anchors[i];
        out.push(...refineMonthToDaily(
            prev.value, cur.value, cur.year, cur.month, cur.monthIndex,
            deltasFor ? deltasFor(cur) : [],
        ));
    }
    return out;
}

/**
 * [FUTUR-DAILY] Traduit un `monthIndex` (0 = mois de départ de la projection) en année/mois
 * calendaires. `month` est 0-based, comme `Date`.
 *
 * ⚠️ Gère le PASSÉ (`monthIndex` négatif) : le `%` de JS garde le signe du dividende, d'où le
 * double modulo `((abs % 12) + 12) % 12`. Un `%` nu rendrait un mois négatif en silence.
 */
export function calendarFromMonthIndex(
    startYear: number, startMonth: number, monthIndex: number,
): { year: number; month: number } {
    const abs = startMonth + monthIndex;
    return { year: startYear + Math.floor(abs / 12), month: ((abs % 12) + 12) % 12 };
}

/** Date ISO `YYYY-MM-DD` à partir d'une année, d'un mois 0-based et d'un jour. */
export function isoDate(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Date d'AUJOURD'HUI, cohérente avec le calendrier LOCAL de l'utilisateur.
 *
 * ⚠️ **Extraite d'un composant PARCE QU'ELLE Y ÉTAIT FAUSSE ET INTESTABLE** (finding CRITIQUE de la
 * revue de #574). Le code inline combinait une année et un mois LOCAUX avec un jour lu en **UTC**
 * (`getUTCDate()`). Reproduit à Toronto le 31 août à 22h30 : il construisait `2026-08-01` au lieu de
 * `2026-08-31` — **30 jours d'écart**, et ça se produit tous les soirs entre ~20h et minuit dès que
 * l'heure UTC franchit le jour avant l'heure locale.
 * Conséquence : la frontière passé/futur se déplaçait, donc des jours RÉELS étaient affichés comme
 * « projeté » avec une valeur interpolée — exactement la confusion mesure/interpolation que tout ce
 * chantier cherche à éviter.
 * ⚠️ Le bug était structurellement INVISIBLE en CI : le conteneur tourne en `TZ=UTC`, où
 * `getDate() === getUTCDate()` toujours. D'où l'extraction : ici, une date injectable se teste.
 */
export function todayIsoLocal(now: Date = new Date()): string {
    return isoDate(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Nombre de jours calendaires entre deux dates ISO (`YYYY-MM-DD`), bornes incluses.
 * Sert à décider du niveau de détail : au-delà d'un certain nombre de jours à l'écran, un point par
 * jour n'est plus lisible ET plus rendable — c'est l'appelant qui tranche, avec ce compte.
 */
export function daySpan(fromIso: string, toIso: string): number {
    const a = Date.parse(`${fromIso}T00:00:00Z`);
    const b = Date.parse(`${toIso}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.floor((b - a) / DAY_MS) + 1;
}
