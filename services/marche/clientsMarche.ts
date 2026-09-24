// services/marche/clientsMarche.ts
//
// [PTF-L1C1-CLIENTS-PURS] Construction des requêtes et lecture des réponses des deux sources du magasin
// de marché : EODHD (clôtures, source principale — ADR 0019 §2) et la Banque du Canada (taux datés).
// PURS : aucun `fetch` ici. La tâche serveur (lot 1c-2) fait l'appel réseau, compte son budget et
// passe la réponse à ces lecteurs. Ainsi chaque règle de lecture est testable sans réseau — le
// conteneur de développement n'en a d'ailleurs pas vers ces hôtes (CONNECT refusé, mesuré).
//
// ⚠️ Ce que ces lecteurs NE FONT PAS, délibérément :
//  · aucun lecteur de fractionnements ni de dividendes EODHD : la mesure du Lot 0.5b n'a porté que
//    sur les clôtures (`/api/eod`). Écrire un lecteur d'après la forme SUPPOSÉE d'une réponse jamais
//    reçue, c'est encoder une croyance dans un test qui la confirmera toujours
//    (`UN-INDEX-SUR-UNE-LISTE-GROUPEE-PAR-COHORTE-NE-DESIGNE-RIEN`). Ils viendront avec leur mesure.
//  · aucun lecteur Yahoo : il n'est « secours » qu'une fois son prix AJUSTÉ des fractionnements géré
//    (ADR 0019 §2), et la mesure l'a montré ajusté — le lire comme brut serait faux avant chaque
//    fractionnement.
//
// ⚠️ Vie privée : la clé EODHD voyage dans l'URL (`api_token`). Aucune fonction de ce module ne
// renvoie de message qui contienne l'URL, la clé, un cours ou un taux : seulement la FORME de ce qui
// a été reçu et des compteurs. Le journal de la tâche serveur est public.
import { jourUtcDepuisD } from '../fx/observationsBdc';
import type { DeviseTaux, PointTaux } from './magasinMarche';

// ─── EODHD ──────────────────────────────────────────────────────────────────────────────────────────

/** Symbole EODHD : `TICKER.PLACE` (ex. forme `ABC.US`, `XYZ.PA`). Lettres, chiffres, point, tiret. */
const SYMBOLE_EODHD = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)?$/;

function exigerDate(d: string, nom: string): void {
    if (jourUtcDepuisD(d) === null) throw new Error(`${nom} illisible`);
}

/**
 * URL de la série de clôtures quotidiennes d'EODHD entre deux dates incluses. Lève sur une entrée
 * invalide (erreur de programmation de l'appelant, jamais une donnée à corriger).
 * ⚠️ Le résultat CONTIENT la clé : ne jamais le journaliser.
 */
export function urlCloturesEodhd(symbole: string, du: string, au: string, cle: string): string {
    if (!SYMBOLE_EODHD.test(symbole)) throw new Error('symbole EODHD mal formé');
    exigerDate(du, 'date de début');
    exigerDate(au, 'date de fin');
    if (du > au) throw new Error('date de début après la date de fin');
    if (cle.trim() === '') throw new Error('clé EODHD absente');
    return `https://eodhd.com/api/eod/${encodeURIComponent(symbole)}`
        + `?fmt=json&period=d&from=${du}&to=${au}&api_token=${encodeURIComponent(cle)}`;
}

export type LectureSerieSource<P> =
    /** `ecartes` compte les lignes illisibles (date, valeur) et les dates en doublon, jamais corrigées. */
    | { statut: 'ok'; points: P[]; ecartes: number }
    /** La réponse n'a pas la forme attendue. `forme` la décrit sans en citer le contenu. */
    | { statut: 'erreur'; forme: string };

/** `[date, cours brut]` : la source n'est pas portée ici, c'est l'appelant qui la connaît. */
export type PointCoursLu = readonly [date: string, cours: number];

/** La forme d'une valeur reçue, sans son contenu (même principe que `formeRecue` de la mesure 0.5b). */
function forme(j: unknown): string {
    if (typeof j === 'string') return 'une chaîne (message d’erreur de la source ?)';
    if (Array.isArray(j)) return `un tableau de ${j.length} élément(s)`;
    if (j !== null && typeof j === 'object') return `un objet à ${Object.keys(j).length} clé(s)`;
    return `une valeur de type ${j === null ? 'null' : typeof j}`;
}

/** Retire les dates en doublon (les DEUX lignes : laquelle croire ?) et trie par date croissante. */
function dedoublonnerEtTrier<P extends readonly [string, number]>(lus: P[]): { points: P[]; doublons: number } {
    const compte = new Map<string, number>();
    for (const p of lus) compte.set(p[0], (compte.get(p[0]) ?? 0) + 1);
    const points = lus.filter((p) => compte.get(p[0]) === 1)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return { points, doublons: lus.length - points.length };
}

/**
 * Lit une réponse `/api/eod` d'EODHD : un tableau de `{ date, open, high, low, close, adjusted_close,
 * volume }`. Seul `close` est lu — le prix BRUT, mesuré au Lot 0.5b (identique au prix d'époque avant
 * un fractionnement). ⚠️ JAMAIS `adjusted_close` : ajusté des fractionnements ET des dividendes, il
 * réécrit tout le passé à chaque distribution.
 */
export function lireReponseEodhd(json: unknown): LectureSerieSource<PointCoursLu> {
    if (!Array.isArray(json)) return { statut: 'erreur', forme: forme(json) };
    const lus: PointCoursLu[] = [];
    let ecartes = 0;
    for (const ligne of json) {
        const l = ligne as Record<string, unknown> | null;
        const date = l?.date;
        const close = l?.close;
        if (jourUtcDepuisD(date) === null || typeof close !== 'number' || !Number.isFinite(close) || close <= 0) {
            ecartes++;
            continue;
        }
        lus.push([date as string, close]);
    }
    const { points, doublons } = dedoublonnerEtTrier(lus);
    return { statut: 'ok', points, ecartes: ecartes + doublons };
}

// ─── Banque du Canada ───────────────────────────────────────────────────────────────────────────────

/** Nom de la série Valet d'une devise (`FXUSDCAD` = dollars canadiens pour 1 dollar américain). */
export function serieBdc(devise: DeviseTaux): string {
    return `FX${devise}CAD`;
}

/**
 * URL de la série QUOTIDIENNE d'une devise entre deux dates incluses. ⚠️ Une SÉRIE, jamais le groupe
 * `FX_RATES_DAILY` : sur un groupe, la réponse est groupée par cohorte et contient des séries arrêtées
 * (`UN-INDEX-SUR-UNE-LISTE-GROUPEE-PAR-COHORTE-NE-DESIGNE-RIEN`, 2026-09-17).
 */
export function urlSerieBdc(devise: DeviseTaux, du: string, au: string): string {
    exigerDate(du, 'date de début');
    exigerDate(au, 'date de fin');
    if (du > au) throw new Error('date de début après la date de fin');
    return `https://www.bankofcanada.ca/valet/observations/${serieBdc(devise)}/json?start_date=${du}&end_date=${au}`;
}

/**
 * Lit une réponse Valet `{ observations: [{ d, FXUSDCAD: { v: "1.3947" } }, …] }`. La forme de
 * l'observation est celle de la réponse RÉELLE enregistrée dans `tests/fixtures/bdcFxRatesDaily.json`.
 * Une observation SANS la série est un silence normal (jour non publié) : ni lue, ni écartée. Une
 * valeur présente mais illisible, ou une date illisible, est écartée et COMPTÉE.
 */
export function lireSerieDateeBdc(json: unknown, devise: DeviseTaux): LectureSerieSource<PointTaux> {
    const obs = (json as Record<string, unknown> | null)?.observations;
    if (!Array.isArray(obs)) return { statut: 'erreur', forme: forme(json) };
    const nom = serieBdc(devise);
    const lus: PointTaux[] = [];
    let ecartes = 0;
    for (const o of obs) {
        if (o === null || typeof o !== 'object' || !(nom in o)) continue;
        const ligne = o as Record<string, unknown>;
        const cellule = ligne[nom];
        const brut = cellule !== null && typeof cellule === 'object' ? (cellule as Record<string, unknown>).v : cellule;
        if (brut === undefined || brut === null || String(brut).trim() === '') continue;
        const valeur = Number(String(brut).trim());
        if (jourUtcDepuisD(ligne.d) === null || !Number.isFinite(valeur) || valeur <= 0) { ecartes++; continue; }
        lus.push([ligne.d as string, valeur]);
    }
    const { points, doublons } = dedoublonnerEtTrier(lus);
    return { statut: 'ok', points, ecartes: ecartes + doublons };
}
