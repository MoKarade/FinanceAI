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
 *  · la Banque du Canada publie chaque jour OUVRÉ ; la plus longue interruption légitime vaut
 *    **5 jours** — RE-MESURÉE sur les onze prochaines fins d'année après qu'une revue eut relevé
 *    que j'avais écrit « 4 » sans la calculer : `2026-12-24 → 2026-12-29` (Noël, lendemain de Noël
 *    et leurs reports, encadrés par une fin de semaine), cas qui revient 7 années sur 11 ;
 *  · dans la réponse réelle du 2026-09-16, les séries VIVANTES ont 0 jour d'âge, et les séries
 *    ABANDONNÉES en ont **140** (RUB/SAR, 2026-04-30) et **2 452** (VND, 2019-12-31).
 * 10 jours valent donc EXACTEMENT le double de la marge légitime — pas « plus du double », comme je
 * l'avais écrit — tout en restant 14 fois sous le plus proche cas réel à rejeter. L'intervalle
 * [5 ; 139] donne le même verdict, mais 5 y est à marge NULLE (âge 5, seuil 5 : `5 > 5` est faux) :
 * c'est la raison de ne pas descendre jusque-là.
 *
 * ⚠️ CE SEUIL PORTE DEUX QUESTIONS, et une seule est mesurée ici. « Cette série est-elle morte ? »
 * (VND 2 452 j, RUB/SAR 140 j) — 10 jours y répondent parfaitement. « Ce taux a-t-il le droit
 * d'écrire un total de compte ? » est une AUTRE question, à laquelle 10 jours ne répondent pas :
 * USD/CAD bouge couramment de 1 à 2 % en dix jours. Tant que les deux partagent ce seuil, une
 * valeur vieille de dix jours obtient l'autorité pleine — c'est écrit plutôt que découvert
 * (`[FX-AUTORITE-SANS-FRAICHEUR]`, routé au BACKLOG).
 */
export const AGE_MAX_OBSERVATION_JOURS = 10;

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

/** Ce qu'une série vaut dans une réponse donnée. */
export type LectureSerie =
    /** Valeur lue, avec la DATE de l'observation d'où elle vient.
     *  ⚠️ `anomalie` est renseignée quand une observation PLUS RÉCENTE que celle retenue était
     *  illisible : le taux servi reste juste (on est retombé sur le jour d'avant), mais l'anomalie
     *  du jour ne doit pas disparaître du diagnostic — c'est toute la raison d'être de ce module
     *  (revue panel du 2026-09-17). */
    | { statut: 'ok'; valeur: number; date: string; ageJours: number; anomalie?: { brut: string; date: string } }
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
    let illisible: { brut: string; t: number; date: string } | null = null;

    for (const obs of observations) {
        if (obs === null || typeof obs !== 'object') continue;
        const ligne = obs as Record<string, unknown>;
        if (!(serie in ligne)) continue;

        const brut = valeurBrute(ligne[serie]);
        // Série présente mais sans valeur publiée ce jour-là : c'est un silence NORMAL, pas une
        // anomalie — on passe à l'observation suivante sans rien signaler.
        if (brut === undefined || brut === null || String(brut).trim() === '') continue;

        const t = jourUtcDepuisD(ligne.d);
        const dateLisible = t === null ? '(date illisible)' : String(ligne.d);
        const tAnomalie = t ?? -Infinity;
        // Ce qui rend CETTE observation inutilisable, s'il y a lieu. ⚠️ Écrit hors d'une fermeture :
        // `tsc` ne voit pas une affectation faite dans une lambda et réduirait `illisible` à `never`.
        let raison: string | null = null;

        const valeur = parseFloat(String(brut));
        if (!Number.isFinite(valeur) || valeur <= 0) raison = String(brut);
        else if (t === null) raison = String(ligne.d ?? '(date absente)');
        // ⚠️ Une observation datée dans le FUTUR passerait pour fraîche (`Math.max(0, …)` rabat son
        // âge à 0) sans laisser la moindre trace — exactement le contraire de ce que ce module
        // existe pour faire. La tolérance d'UN jour absorbe une horloge locale en retard de
        // quelques heures autour de minuit UTC, cas banal et parfaitement sain ; au-delà, la date
        // ne décrit plus rien de publiable (revue panel du 2026-09-17).
        else if (t - maintenant > MS_PAR_JOUR) raison = `futur:${dateLisible}`;

        if (raison !== null) {
            // On garde l'anomalie la plus RÉCENTE : c'est celle qui décrit l'état du jour.
            if (illisible === null || tAnomalie > illisible.t) {
                illisible = { brut: raison.slice(0, 24), t: tAnomalie, date: dateLisible };
            }
            continue;
        }
        if (t !== null && (meilleure === null || t > meilleure.t)) {
            meilleure = { t, date: String(ligne.d), valeur };
        }
    }

    if (meilleure !== null) {
        const ageJours = Math.max(0, Math.floor((maintenant - meilleure.t) / MS_PAR_JOUR));
        if (ageJours > AGE_MAX_OBSERVATION_JOURS) {
            return { statut: 'perimee', date: meilleure.date, ageJours };
        }
        // ⚠️ Le repli sur une observation plus ancienne SAUVE le taux, il n'efface pas l'anomalie.
        const plusRecenteEtIllisible = illisible !== null && illisible.t > meilleure.t
            ? { brut: illisible.brut, date: illisible.date }
            : undefined;
        return {
            statut: 'ok', valeur: meilleure.valeur, date: meilleure.date, ageJours,
            ...(plusRecenteEtIllisible === undefined ? {} : { anomalie: plusRecenteEtIllisible }),
        };
    }
    if (illisible !== null) return { statut: 'illisible', brut: illisible.brut };
    return { statut: 'absente' };
}
