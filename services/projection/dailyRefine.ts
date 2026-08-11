// services/projection/dailyRefine.ts
//
// ⚠️ [FUTUR-DAILY-INFOBULLE-ONLY 2026-08-11] `refineMonthToDaily`, `refineWindowToDaily`,
// `DailyPoint` et `daySpan` ont été RETIRÉS d'ici. Ils ne raffinaient que `NetWorth` ; la
// ventilation COMPLÈTE au jour (tous les champs) vit dans `dailyLedger.ts`, qui les a remplacés.
// Leur dernier consommateur (le tableau jour-par-jour sous la courbe) a été supprimé à la demande
// de Marc — le détail du jour vit dans l'infobulle, uniquement. Restent ici : les utilitaires de
// calendrier, `finiteAnchorRun` (garde no-fake des ancres) et `dailyWindowRange` (bouton « Jour »).
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

/** Nombre de jours du mois (0-based `month`, comme `Date`). */
export function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
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
 * Traduit des points mensuels du moteur en ancres, en NE GARDANT que la plus longue plage
 * CONTIGUË dont la valeur est finie.
 *
 * ⚠️ POURQUOI CE FILTRE EXISTE (finding `silent-failure-hunter` sur #577). `NetWorth` est
 * LÉGITIMEMENT `undefined` avant la première transaction connue : `buildPastPrefix` l'écrit
 * exprès (« no-fake : pas de fausse ligne à 0 »). Un `Number(p.NetWorth) || 0` au site d'appel
 * transformait cette absence en un patrimoine de **0 $** — et VIDAIT du même coup le garde-fou
 * de `refineMonthToDaily`, qui rend `[]` sur une valeur non finie : le garde ne se déclenchait
 * jamais puisque l'appelant avait déjà rendu la valeur finie.
 *
 * ⚠️ ET POURQUOI « CONTIGUË » plutôt qu'un simple `filter`. `refineWindowToDaily` traite les
 * ancres par PAIRES adjacentes : retirer une ancre au MILIEU appairerait deux mois non voisins
 * et étalerait un écart de deux mois sur un seul — une distorsion silencieuse. On préfère une
 * fenêtre plus courte mais juste.
 */
export function finiteAnchorRun(
    points: ReadonlyArray<{ monthIndex: number; NetWorth?: unknown }>,
    startYear: number,
    startMonth: number,
): MonthlyAnchor[] {
    let best: MonthlyAnchor[] = [];
    let cur: MonthlyAnchor[] = [];
    for (const p of points) {
        const value = Number(p.NetWorth);
        if (!Number.isFinite(value)) {
            if (cur.length > best.length) best = cur;
            cur = [];
            continue;
        }
        cur.push({
            monthIndex: p.monthIndex,
            ...calendarFromMonthIndex(startYear, startMonth, p.monthIndex),
            value,
        });
    }
    return cur.length > best.length ? cur : best;
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
 * [FUTUR-DAILY-REACH] Fenêtre de zoom (en INDICES DE TABLEAU) qui fait basculer la courbe au JOUR,
 * ancrée sur aujourd'hui.
 *
 * ⚠️ POURQUOI CETTE FONCTION EXISTE. La vue au jour ne s'active que sous un plafond de points
 * MENSUELS visibles, et le seul chemin pour y descendre était la molette : **mesuré à 23-31 crans
 * depuis « Tout »** (facteur 0,85 par cran, plancher de zoom à 5 d'écart) et encore 16 crans depuis
 * le preset « 5 ans ». Aucun bouton n'y menait, aucun retour ne disait qu'on s'en approchait, et le
 * hook de zoom n'écoute QUE `wheel` + souris — donc au doigt, sur téléphone ou tablette, la
 * fonctionnalité était **strictement inatteignable**. Une feature livrée, testée et déployée que
 * l'utilisateur ne peut pas atteindre n'est pas livrée : c'est le retour de Marc (« j'arrive
 * toujours pas à voir jour par jour »).
 *
 * ⚠️ POURQUOI LA FENÊTRE EST CENTRÉE SUR AUJOURD'HUI, et non ancrée dessus (correction
 * `[FUTUR-DAILY-PAST-REACH]`, retour de Marc 2026-08-11 : « je vois toujours pas au jour pour le
 * passé »). Le premier jet posait `lo = todayIndex − 1`. Or la construction des jours CONSOMME la
 * première ancre comme valeur d'ENTRÉE sans la rendre : le premier jour affiché était donc le 1er du
 * mois COURANT, et **le bouton « Jour » ne montrait STRICTEMENT AUCUN jour passé**. Toute la
 * reconstruction du passé au jour existait, était testée, et restait invisible — même classe de bug
 * que `[FUTUR-DAILY-REACH]`, une marche plus loin : la fonctionnalité était atteignable, mais pas
 * la MOITIÉ qu'elle promettait.
 * On centre donc : la moitié des mois RENDUS tombe avant aujourd'hui, l'autre après. Avec 6 points,
 * ça donne 2 mois passés + le mois courant + 2 mois futurs.
 *
 * ⚠️ Les bords restent prioritaires sur le centrage : près du début de série (pas d'historique) ou
 * de la fin, la fenêtre est simplement collée au bord — une fenêtre plus déséquilibrée mais VALIDE
 * vaut mieux qu'une fenêtre hors tableau.
 *
 * Rend `null` quand la fenêtre n'a pas de sens : moins de points que demandé, ou un jeu si court que
 * la fenêtre couvrirait TOUT (le hook repasserait alors en « vue complète », donc hors zoom, et la
 * vue au jour ne s'activerait pas). L'appelant masque le bouton dans ce cas plutôt que d'offrir un
 * clic sans effet.
 */
export function dailyWindowRange(
    dataLength: number,
    todayIndex: number,
    windowPoints: number,
): [number, number] | null {
    if (!Number.isFinite(dataLength) || !Number.isFinite(todayIndex) || !Number.isFinite(windowPoints)) return null;
    if (windowPoints < 2 || dataLength <= windowPoints) return null;
    const today = Math.max(0, Math.min(Math.round(todayIndex), dataLength - 1));
    // −1 pour l'ancre d'ENTRÉE (non rendue), puis on recule encore de la moitié des mois rendus
    // pour que le passé occupe la première moitié de la fenêtre.
    const renderedMonths = windowPoints - 1;
    const anchored = today - 1 - Math.floor(renderedMonths / 2);
    const lo = Math.max(0, Math.min(anchored, dataLength - windowPoints));
    return [lo, lo + windowPoints - 1];
}

/**
 * Abscisse d'un point QUOTIDIEN sur l'axe X numérique du graphe Futur : le `monthIndex` du mois,
 * plus la fraction du mois déjà écoulée.
 *
 * ⚠️ L'invariant qui rend la migration sûre : le jour 1 rend EXACTEMENT l'entier `monthIndex`.
 * Les ancrages du graphe (frontière passé/futur, « Aujourd'hui », icônes-jalons) sont posés sur des
 * entiers ; s'ils ne coïncidaient plus avec le début du mois correspondant, ils glisseraient en
 * silence sur un écran money-critical.
 *
 * ⚠️ Et l'espacement N'EST PAS uniforme d'un mois à l'autre : un jour de février vaut 1/28 de mois,
 * un jour de mars 1/31. Tout code qui résout une position par INDEX de tableau (plutôt que par
 * valeur d'abscisse) devient donc faux dès qu'on lui donne cette série — cf. `resolvePointByX`.
 */
export function axisXAtDay(monthIndex: number, dayOfMonth: number, year: number, month: number): number {
    const nDays = daysInMonth(year, month);
    if (!Number.isFinite(monthIndex) || nDays <= 0) return monthIndex;
    return monthIndex + (dayOfMonth - 1) / nDays;
}
