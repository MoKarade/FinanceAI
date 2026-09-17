// services/fx/observationsBdc.ts
//
// [FX-OBSERVATION-COHORTE] Choisir la bonne observation dans la réponse de la Banque du Canada.
//
// ⚠️⚠️ LE DÉFAUT QUI A FAIT NAÎTRE CE MODULE, mesuré sur la réponse RÉELLE du 2026-09-16 (fournie
// par Marc depuis son navigateur — `www.bankofcanada.ca` est refusé au CONNECT depuis le conteneur
// de développement, cf. §6 de `CLAUDE.md`) :
//
//   observations[0] → { "d": "2019-12-31", "FXVNDCAD": { "v": "0.000056" } }
//   observations[1] → { "d": "2026-09-16", … 24 séries vivantes dont FXUSDCAD et FXEURCAD }
//   observations[2] → { "d": "2026-04-30", "FXRUBCAD": …, "FXSARCAD": … }
//
// `services/finance.ts` lisait `observations[0]`. Sur un GROUPE, `recent=1` ne rend pas « la
// dernière journée » : il rend **la dernière observation de CHAQUE série**, et la liste est groupée
// par COHORTE — une série abandonnée (le dong vietnamien, arrêté fin 2019) apporte sa propre entrée,
// à sa propre date, et rien ne garantit qu'elle soit la moins récente du tableau.
//
// Conséquence : `obs` existait (donc aucune erreur), il ne portait NI `FXUSDCAD` NI `FXEURCAD`, les
// deux replis tiraient ENSEMBLE, et l'app servait `USD 1,4000 / EUR 1,4700` — le littéral du dépôt.
// Écart mesuré contre les vrais taux du jour (1,3947 et 1,6073) : **−0,38 % sur USD** mais
// **+9,34 % sur EUR**, soit +5 426 $ sur une seule des douze positions de Marc.
//
// ⚠️ La leçon n'est pas « il fallait prendre `[1]` » — ce serait le même défaut décalé d'un cran.
// Un INDEX sur une liste groupée par cohorte ne désigne rien : c'est la série qu'on cherche, donc
// c'est l'entrée QUI LA CONTIENT qu'il faut retenir, et la plus récente d'entre elles.
//
// ⚠️ Et aucune fixture du dépôt ne pouvait le voir : les trois écrivaient `observations: [{
// FXUSDCAD: { v: '…' } }]` À LA MAIN, donc elles encodaient la forme qu'on CROYAIT avoir. Quand
// c'est cette croyance qui est fausse, un test ne fait que la confirmer
// (`UNE-CAUSE-CLASSEE-PUIS-JETEE-EST-UNE-CAUSE-ABSENTE`). La garde de ce lot part de la réponse
// RÉELLE, enregistrée dans `tests/fixtures/bdcFxRatesDaily.json`.
//
// ⚠️ Module PUR et sans I/O : importé par le bundle navigateur ET par le serveur MCP.

/**
 * Âge maximal, en jours, d'une observation encore acceptée comme « le taux courant ».
 *
 * ⚠️ DÉRIVÉ, PAS INVENTÉ (`UN-SEUIL-ECRIT-AVANT-SA-MESURE-EST-UN-CHIFFRE-INVENTE`) :
 *  · la Banque du Canada publie chaque jour OUVRÉ ; la plus longue interruption légitime est un
 *    week-end doublé de deux jours fériés consécutifs (25 et 26 décembre), soit **4 jours** ;
 *  · dans la réponse réelle du 2026-09-16, les séries VIVANTES ont 0 jour d'âge, et les séries
 *    ABANDONNÉES en ont **140** (RUB/SAR, 2026-04-30) et **2 452** (VND, 2019-12-31).
 * 10 jours laissent donc plus du double de la marge légitime tout en restant 14 fois sous le plus
 * proche cas réel à rejeter. Aucun jour de l'intervalle [5 ; 139] ne changerait le verdict.
 */
export const AGE_MAX_OBSERVATION_JOURS = 10;

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

/** Ce qu'une série vaut dans une réponse donnée. */
export type LectureSerie =
    /** Valeur lue, avec la DATE de l'observation d'où elle vient. */
    | { statut: 'ok'; valeur: number; date: string; ageJours: number }
    /** Aucune observation ne porte cette série. */
    | { statut: 'absente' }
    /** La série est là, mais sa valeur (ou la date qui la porte) ne peut pas être lue. */
    | { statut: 'illisible'; brut: string }
    /** La série existe et se lit, mais sa dernière publication est trop vieille (série arrêtée ?). */
    | { statut: 'perimee'; date: string; ageJours: number };

const FORMAT_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Le champ `d` d'une observation, en epoch ms (minuit UTC), ou `null` s'il n'est pas une date.
 *
 * ⚠️ `Date.UTC` et JAMAIS `new Date('2026-09-16')` interprété localement : le conteneur tourne en
 * UTC, donc les deux variantes y coïncident TOUJOURS et la mauvaise ne serait jamais démasquée ici
 * (`UN-CONTENEUR-EN-UTC-NE-PEUT-PAS-DEPARTAGER-LOCAL-ET-UTC`). L'epoch, lui, ne dépend d'aucun
 * fuseau : la comparaison avec `Date.now()` est donc juste à Montréal comme à Sydney.
 */
export function jourUtcDepuisD(d: unknown): number | null {
    if (typeof d !== 'string') return null;
    const m = FORMAT_DATE.exec(d.trim());
    if (m === null) return null;
    const annee = Number(m[1]);
    const mois = Number(m[2]);
    const jour = Number(m[3]);
    const t = Date.UTC(annee, mois - 1, jour);
    // `Date.UTC` NORMALISE (2026-02-31 → 3 mars) : sans ce contrôle, une date impossible passerait
    // pour une date valide, décalée — donc un taux daté d'un jour qui n'existe pas.
    const controle = new Date(t);
    if (controle.getUTCFullYear() !== annee
        || controle.getUTCMonth() !== mois - 1
        || controle.getUTCDate() !== jour) return null;
    return t;
}

/** La cellule `{ v: "1.3947" }` d'une observation — ou la valeur nue, par tolérance. */
function valeurBrute(cellule: unknown): unknown {
    if (cellule !== null && typeof cellule === 'object' && 'v' in (cellule as Record<string, unknown>)) {
        return (cellule as Record<string, unknown>).v;
    }
    return cellule;
}

/**
 * La valeur la plus récente de `serie` dans `observations`, avec sa date.
 *
 * Ordre des verdicts, quand plusieurs situations coexistent :
 *  1. une observation LISIBLE et DATABLE existe → la plus récente, `'ok'` ou `'perimee'` selon son âge ;
 *  2. sinon, quelque chose était présent mais illisible → `'illisible'` (distinct d'une absence :
 *     l'un est une anomalie à tracer, l'autre le silence normal d'une série non publiée) ;
 *  3. sinon → `'absente'`.
 *
 * ⚠️ Une observation LISIBLE mais NON DATABLE est classée `'illisible'` : ne pas pouvoir la dater,
 * c'est ne pas pouvoir savoir si elle est courante — et c'est exactement ce qui a permis de servir
 * un taux de 2019 comme s'il était celui du jour.
 */
export function lireSerieBdc(observations: unknown, serie: string, maintenant: number): LectureSerie {
    if (!Array.isArray(observations)) return { statut: 'absente' };

    let meilleure: { t: number; date: string; valeur: number } | null = null;
    let illisible: string | null = null;

    for (const obs of observations) {
        if (obs === null || typeof obs !== 'object') continue;
        const ligne = obs as Record<string, unknown>;
        if (!(serie in ligne)) continue;

        const brut = valeurBrute(ligne[serie]);
        // Série présente mais sans valeur publiée ce jour-là : c'est un silence NORMAL, pas une
        // anomalie — on passe à l'observation suivante sans rien signaler.
        if (brut === undefined || brut === null || String(brut).trim() === '') continue;

        const valeur = parseFloat(String(brut));
        if (!Number.isFinite(valeur) || valeur <= 0) {
            illisible = String(brut).slice(0, 24);
            continue;
        }
        const t = jourUtcDepuisD(ligne.d);
        if (t === null) {
            illisible = String(ligne.d ?? '(date absente)').slice(0, 24);
            continue;
        }
        if (meilleure === null || t > meilleure.t) {
            meilleure = { t, date: String(ligne.d), valeur };
        }
    }

    if (meilleure !== null) {
        const ageJours = Math.max(0, Math.floor((maintenant - meilleure.t) / MS_PAR_JOUR));
        if (ageJours > AGE_MAX_OBSERVATION_JOURS) {
            return { statut: 'perimee', date: meilleure.date, ageJours };
        }
        return { statut: 'ok', valeur: meilleure.valeur, date: meilleure.date, ageJours };
    }
    if (illisible !== null) return { statut: 'illisible', brut: illisible };
    return { statut: 'absente' };
}
