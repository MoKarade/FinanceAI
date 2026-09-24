// services/marche/magasinMarche.ts
//
// [PTF-L1C1-MAGASIN-FORMAT] Format du MAGASIN DE MARCHÉ : clôtures brutes de chaque titre, taux de la
// Banque du Canada datés, fractionnements et dividendes. Décidé au Lot 0 (ADR 0019) : un fichier Drive
// SÉPARÉ de l'état de l'app, avec un seul écrivain (la tâche serveur, lot 1c-2). Ce module ne lit ni
// n'écrit rien : il définit la forme, la valide, fusionne des lectures et répond « quel cours à telle
// date ». Module PUR, importé par l'app, le serveur MCP et la tâche planifiée.
//
// Ce que ce module garantit, et pourquoi :
//   1. LE MAGASIN NE PORTE QUE DES FAITS. Un cours « reporté » (le dernier connu, faute de séance) n'est
//      JAMAIS écrit : il est calculé à la LECTURE (`clotureAu`), avec son âge. Un point reporté écrit
//      deviendrait indiscernable d'une vraie clôture au prochain passage.
//   2. LA SOURCE DÉCIDE DU STATUT. EODHD est la source principale (mesurée à 0,00 % des ancres,
//      prix BRUT) : ses points sont « officiels ». Yahoo est un SECOURS (prix ajusté des
//      fractionnements) : il ne remplace jamais un point officiel, alors qu'un point officiel remplace
//      un point de secours.
//   3. FUSION IDEMPOTENTE. Rejouer la même lecture ne change rien et ne compte rien : la tâche serveur
//      rattrape les jours manqués en relisant des fenêtres qui se recouvrent.
//   4. REFUS, JAMAIS RÉPARATION. Un magasin mal formé est refusé en entier avec ses raisons — un
//      point faux corrigé en silence deviendrait un cours « officiel » inventé.
//   5. AUCUN SEUIL DE FRAÎCHEUR INVENTÉ ICI. L'âge maximal d'un cours reporté est un ARGUMENT : c'est
//      au moteur de valorisation (lot 1d) de le fixer et de le justifier.
import type { BrokerLedgerCurrency } from '../../types';
import { jourUtcDepuisD } from '../fx/observationsBdc';

const VERSION_MAGASIN_MARCHE = 1 as const;

/** Sources de cours reconnues. Leur ORDRE ne décide de rien : c'est `STATUT_PAR_SOURCE` qui tranche. */
const SOURCES_COURS = ['eodhd', 'yahoo'] as const;
type SourceCours = typeof SOURCES_COURS[number];

/** Statut d'un point ÉCRIT. `reportee` n'en fait pas partie : il n'existe qu'à la lecture (point 1). */
type StatutCloture = 'officielle' | 'secours';
const STATUT_PAR_SOURCE: Record<SourceCours, StatutCloture> = { eodhd: 'officielle', yahoo: 'secours' };

/** Devises dont la Banque du Canada publie un taux ici. CAD n'en a pas besoin (taux 1 par définition). */
const DEVISES_TAUX = ['USD', 'EUR'] as const;
export type DeviseTaux = typeof DEVISES_TAUX[number];

/** Une clôture : `[date AAAA-MM-JJ, cours brut dans la devise de cotation, source]`. En tuple pour la
 *  taille du fichier (≈ 12 titres × 270 séances : ~70 Ko en tuples contre ~190 Ko en objets). */
export type PointCloture = readonly [date: string, cours: number, source: SourceCours];
/** Un taux BdC : `[date, dollars canadiens pour 1 unité de la devise]`. */
export type PointTaux = readonly [date: string, valeur: number];

export interface SerieClotures {
    /** Devise de COTATION (celle du référentiel). EODHD ne la renvoie pas : elle ne vient pas de la source. */
    devise: BrokerLedgerCurrency;
    /** Triés par date croissante, une seule entrée par date. */
    points: PointCloture[];
}

interface FractionnementMarche {
    isin: string;
    /** Date d'effet (ex-date). */
    date: string;
    /** `de` titres deviennent `a` titres (10 pour 1 : de 1, a 10). */
    de: number;
    a: number;
    source: SourceCours;
}

interface DividendeMarche {
    isin: string;
    dateEx: string;
    /** Montant BRUT par titre, dans `devise`. */
    montant: number;
    devise: BrokerLedgerCurrency;
    source: SourceCours;
}

export interface MagasinMarche {
    version: typeof VERSION_MAGASIN_MARCHE;
    /** Horodatage ISO de la dernière écriture. */
    majLe: string;
    /** Clé = ISIN du référentiel d'instruments (jamais un symbole de cotation, qui change de source en source). */
    clotures: Record<string, SerieClotures>;
    taux: Partial<Record<DeviseTaux, PointTaux[]>>;
    fractionnements: FractionnementMarche[];
    dividendes: DividendeMarche[];
}

export function magasinVide(majLe: string): MagasinMarche {
    return { version: VERSION_MAGASIN_MARCHE, majLe, clotures: {}, taux: {}, fractionnements: [], dividendes: [] };
}

// ─── Validation ─────────────────────────────────────────────────────────────────────────────────────

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const DEVISES_COTATION: readonly string[] = ['CAD', 'USD', 'EUR'];
const estDate = (d: unknown): d is string => jourUtcDepuisD(d) !== null;
const estPositifFini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const estObjet = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Vérifie qu'une liste de points est triée par date STRICTEMENT croissante (donc sans doublon). */
function verifierOrdre(dates: string[], ou: string, erreurs: string[]): void {
    for (let i = 1; i < dates.length; i++) {
        if (!(dates[i - 1] < dates[i])) { erreurs.push(`${ou} : dates non strictement croissantes`); return; }
    }
}

function validerPointCloture(p: unknown, ou: string, erreurs: string[]): string | null {
    if (!Array.isArray(p) || p.length !== 3) { erreurs.push(`${ou} : point mal formé`); return null; }
    const [d, v, s] = p as unknown[];
    if (!estDate(d)) { erreurs.push(`${ou} : date illisible`); return null; }
    if (!estPositifFini(v)) { erreurs.push(`${ou} : cours non fini ou non positif`); return null; }
    if (!(SOURCES_COURS as readonly unknown[]).includes(s)) { erreurs.push(`${ou} : source inconnue`); return null; }
    return d;
}

function validerPointTaux(p: unknown, ou: string, erreurs: string[]): string | null {
    if (!Array.isArray(p) || p.length !== 2) { erreurs.push(`${ou} : point mal formé`); return null; }
    const [d, v] = p as unknown[];
    if (!estDate(d)) { erreurs.push(`${ou} : date illisible`); return null; }
    if (!estPositifFini(v)) { erreurs.push(`${ou} : taux non fini ou non positif`); return null; }
    return d;
}

export type LectureMagasin = { ok: true; magasin: MagasinMarche } | { ok: false; erreurs: string[] };

/**
 * Valide un magasin lu (JSON déjà parsé). Refuse EN ENTIER à la première classe d'erreur trouvée, et
 * liste toutes les erreurs rencontrées. ⚠️ Les messages ne portent ni cours ni taux : le rapport de la
 * tâche serveur finit dans un journal GitHub PUBLIC, et les conditions d'EODHD interdisent d'en
 * redistribuer les prix. Ils nomment l'ISIN, qui désigne un titre sans quantité ni montant.
 */
export function lireMagasin(json: unknown): LectureMagasin {
    const erreurs: string[] = [];
    if (!estObjet(json)) return { ok: false, erreurs: ['le magasin n’est pas un objet'] };
    if (json.version !== VERSION_MAGASIN_MARCHE) {
        // Une version FUTURE est refusée aussi : la lire comme une v1 perdrait en silence ce qu'elle ajoute.
        return { ok: false, erreurs: [`version ${String(json.version)} non prise en charge (attendue ${VERSION_MAGASIN_MARCHE})`] };
    }
    if (typeof json.majLe !== 'string' || Number.isNaN(Date.parse(json.majLe))) erreurs.push('majLe illisible');

    if (!estObjet(json.clotures)) erreurs.push('clotures n’est pas un objet');
    else {
        for (const [isin, serie] of Object.entries(json.clotures)) {
            const ou = `clotures.${isin}`;
            if (!ISIN.test(isin)) { erreurs.push(`${ou} : clé qui n’est pas un ISIN`); continue; }
            if (!estObjet(serie) || !Array.isArray(serie.points)) { erreurs.push(`${ou} : série mal formée`); continue; }
            if (!DEVISES_COTATION.includes(serie.devise as string)) erreurs.push(`${ou} : devise inconnue`);
            const dates = serie.points.map((p, i) => validerPointCloture(p, `${ou}[${i}]`, erreurs));
            if (dates.every((d): d is string => d !== null)) verifierOrdre(dates, ou, erreurs);
        }
    }

    if (!estObjet(json.taux)) erreurs.push('taux n’est pas un objet');
    else {
        for (const [devise, points] of Object.entries(json.taux)) {
            const ou = `taux.${devise}`;
            if (!(DEVISES_TAUX as readonly string[]).includes(devise)) { erreurs.push(`${ou} : devise inconnue`); continue; }
            if (!Array.isArray(points)) { erreurs.push(`${ou} : n’est pas une liste`); continue; }
            const dates = points.map((p, i) => validerPointTaux(p, `${ou}[${i}]`, erreurs));
            if (dates.every((d): d is string => d !== null)) verifierOrdre(dates, ou, erreurs);
        }
    }

    if (!Array.isArray(json.fractionnements)) erreurs.push('fractionnements n’est pas une liste');
    else json.fractionnements.forEach((f, i) => {
        const ou = `fractionnements[${i}]`;
        if (!estObjet(f) || !ISIN.test(String(f.isin)) || !estDate(f.date)
            || !estPositifFini(f.de) || !estPositifFini(f.a)
            || !(SOURCES_COURS as readonly unknown[]).includes(f.source)) erreurs.push(`${ou} : mal formé`);
    });

    if (!Array.isArray(json.dividendes)) erreurs.push('dividendes n’est pas une liste');
    else json.dividendes.forEach((d, i) => {
        const ou = `dividendes[${i}]`;
        if (!estObjet(d) || !ISIN.test(String(d.isin)) || !estDate(d.dateEx)
            || !estPositifFini(d.montant) || !DEVISES_COTATION.includes(d.devise as string)
            || !(SOURCES_COURS as readonly unknown[]).includes(d.source)) erreurs.push(`${ou} : mal formé`);
    });

    return erreurs.length > 0 ? { ok: false, erreurs } : { ok: true, magasin: json as unknown as MagasinMarche };
}

// ─── Fusion ─────────────────────────────────────────────────────────────────────────────────────────

export interface BilanFusion<P> {
    points: P[];
    /** Dates absentes jusque-là. */
    ajouts: number;
    /** Même rang de source, valeur différente : la plus récente lecture gagne (une source peut corriger). */
    revisions: number;
    /** Un point de secours remplacé par un point officiel. */
    promotions: number;
    /** Un point de secours reçu là où un point officiel existe déjà : ignoré. */
    ignores: number;
}

/**
 * Fusionne des clôtures reçues dans une série existante (point 2 et 3 de l'en-tête). Ne mute rien.
 * Les points reçus doivent être déjà validés ; deux points reçus pour la même date : le dernier gagne.
 */
export function fusionnerClotures(existants: readonly PointCloture[], recus: readonly PointCloture[]): BilanFusion<PointCloture> {
    const parDate = new Map<string, PointCloture>(existants.map((p) => [p[0], p]));
    let ajouts = 0, revisions = 0, promotions = 0, ignores = 0;
    for (const p of recus) {
        const avant = parDate.get(p[0]);
        if (!avant) { parDate.set(p[0], p); ajouts++; continue; }
        const statutAvant = STATUT_PAR_SOURCE[avant[2]];
        const statutRecu = STATUT_PAR_SOURCE[p[2]];
        if (statutAvant === 'officielle' && statutRecu === 'secours') { ignores++; continue; }
        if (statutAvant === 'secours' && statutRecu === 'officielle') { parDate.set(p[0], p); promotions++; continue; }
        if (avant[1] === p[1] && avant[2] === p[2]) continue;
        parDate.set(p[0], p);
        revisions++;
    }
    const points = [...parDate.values()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return { points, ajouts, revisions, promotions, ignores };
}

/** Fusionne des taux BdC reçus : une seule source, donc seulement ajouts et révisions. */
export function fusionnerTaux(existants: readonly PointTaux[], recus: readonly PointTaux[]): BilanFusion<PointTaux> {
    const parDate = new Map<string, PointTaux>(existants.map((p) => [p[0], p]));
    let ajouts = 0, revisions = 0;
    for (const p of recus) {
        const avant = parDate.get(p[0]);
        if (!avant) { parDate.set(p[0], p); ajouts++; continue; }
        if (avant[1] === p[1]) continue;
        parDate.set(p[0], p);
        revisions++;
    }
    const points = [...parDate.values()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return { points, ajouts, revisions, promotions: 0, ignores: 0 };
}

// ─── Lecture à une date ─────────────────────────────────────────────────────────────────────────────

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

export type LectureAuJour =
    /** Un point existe À cette date. */
    | { statut: StatutCloture; valeur: number; dateSource: string; ageJours: 0; source?: SourceCours }
    /** Le dernier point connu AVANT cette date (jour sans séance, ou retard de la source). */
    | { statut: 'reportee'; valeur: number; dateSource: string; ageJours: number; statutSource?: StatutCloture }
    /** Un point antérieur existe, mais plus vieux que `ageMaxJours` : on ne le sert pas. */
    | { statut: 'perimee'; dateSource: string; ageJours: number }
    /** Aucun point à cette date ni avant (date d'avant la série, ou série vide). */
    | { statut: 'absente' };

/** Dernier indice dont la date est ≤ `date` (recherche dichotomique sur des dates ISO triées), ou −1. */
function dernierAuPlusTard(dates: (i: number) => string, n: number, date: string): number {
    let bas = 0, haut = n - 1, trouve = -1;
    while (bas <= haut) {
        const m = (bas + haut) >> 1;
        if (dates(m) <= date) { trouve = m; bas = m + 1; } else haut = m - 1;
    }
    return trouve;
}

function lireAuJour(date: string, dateSource: string, valeur: number, ageMaxJours: number):
    { ageJours: number; perime: boolean } {
    const ageJours = Math.round(((jourUtcDepuisD(date) as number) - (jourUtcDepuisD(dateSource) as number)) / MS_PAR_JOUR);
    return { ageJours, perime: ageJours > ageMaxJours || !Number.isFinite(valeur) };
}

/**
 * Le cours d'une série à `date`. ⚠️ `ageMaxJours` est REQUIS (point 5 de l'en-tête) : un défaut écrit
 * ici serait un seuil inventé, adopté en silence par tous les appelants.
 * Lève sur une date illisible : c'est une erreur de programmation de l'appelant, pas une donnée.
 */
export function clotureAu(serie: SerieClotures | undefined, date: string, ageMaxJours: number): LectureAuJour {
    if (jourUtcDepuisD(date) === null) throw new Error(`clotureAu : date illisible « ${date} »`);
    if (!serie || serie.points.length === 0) return { statut: 'absente' };
    const i = dernierAuPlusTard((k) => serie.points[k][0], serie.points.length, date);
    if (i < 0) return { statut: 'absente' };
    const [d, v, s] = serie.points[i];
    const { ageJours, perime } = lireAuJour(date, d, v, ageMaxJours);
    if (perime) return { statut: 'perimee', dateSource: d, ageJours };
    if (ageJours === 0) return { statut: STATUT_PAR_SOURCE[s], valeur: v, dateSource: d, ageJours: 0, source: s };
    return { statut: 'reportee', valeur: v, dateSource: d, ageJours, statutSource: STATUT_PAR_SOURCE[s] };
}

export type LectureTauxAuJour = LectureAuJour | { statut: 'identite'; valeur: 1 };

/** Le taux BdC d'une devise à `date` (CAD → 1 par définition). Mêmes règles que `clotureAu`. */
export function tauxAu(magasin: MagasinMarche, devise: BrokerLedgerCurrency, date: string, ageMaxJours: number): LectureTauxAuJour {
    if (jourUtcDepuisD(date) === null) throw new Error(`tauxAu : date illisible « ${date} »`);
    if (devise === 'CAD') return { statut: 'identite', valeur: 1 };
    const points = magasin.taux[devise];
    if (!points || points.length === 0) return { statut: 'absente' };
    const i = dernierAuPlusTard((k) => points[k][0], points.length, date);
    if (i < 0) return { statut: 'absente' };
    const [d, v] = points[i];
    const { ageJours, perime } = lireAuJour(date, d, v, ageMaxJours);
    if (perime) return { statut: 'perimee', dateSource: d, ageJours };
    if (ageJours === 0) return { statut: 'officielle', valeur: v, dateSource: d, ageJours: 0 };
    return { statut: 'reportee', valeur: v, dateSource: d, ageJours };
}
