// services/fintable/brokerHistory.ts
//
// [FINTABLE-HISTORIQUE-COURTIER] Garder une trace DATÉE de ce que le courtier disait, passe après
// passe — au lieu de l'écraser.
//
// LE CONSTAT QUI OUVRE CE LOT, et il faut le dire avant tout le reste : `fintableBrokerBalances`
// est un INSTANTANÉ. Chaque synchro le remplace intégralement, et il ne porte qu'un seul
// horodatage. « Que le passé affiche ce que Fintable disait à ce moment-là » n'est donc PAS
// récupérable rétroactivement : la donnée n'a jamais été conservée. Ce module ne répare pas le
// passé — il fait en sorte qu'il existe à partir de maintenant.
//
// ⚠️ CE LOT NE CHANGE RIEN AUJOURD'HUI, et c'est écrit à l'écran plutôt que laissé à découvrir.
// Il devient utile quand l'historique aura de la profondeur. Livrer un champ qui n'a pas encore de
// consommateur serait normalement le défaut `UN-CHAMP-TYPE-SANS-PRODUCTEUR` pris à l'envers ; ici
// c'est l'inverse exact — le PRODUCTEUR est ce qu'il manquait, et sans lui le consommateur ne
// pourra jamais être écrit, quel que soit le temps qu'on attend.
//
// ⚠️ CONTRAINTE PRODUIT HÉRITÉE : Fintable rend le TOTAL d'un compte, jamais ses positions. Même
// avec dix ans d'historique, on ne pourra pas ventiler un passé par TITRE — seulement par compte,
// et donc par panier fiscal. Le dire ici évite qu'un lot futur promette ce que la source ne
// contient pas.

import type { FintableBrokerBalance } from '../../types';
import { logErrorThrottled } from '../errorLogger';

/**
 * Profondeur conservée : 730 JOURS (deux ans). Valeur annoncée à Marc au cadrage (2026-09-16).
 *
 * ⚠️ Comptée en JOURS et non en « mois de 30 jours » : `24 * 30` fait 720 j, soit 23,7 mois — un
 * écart silencieux entre ce que la constante s'appelle et ce qu'elle fait.
 *
 * ⚠️ Cet historique voyage dans CHAQUE push Drive, avec tout l'état. Une rétention non bornée
 * ferait grossir indéfiniment un blob qui est déjà la chose la plus lourde que l'app synchronise —
 * et le coût ne se verrait qu'une fois le quota atteint, c'est-à-dire trop tard.
 */
export const RETENTION_HISTORIQUE_JOURS = 730; // 24 mois comptés en JOURS (2 ans), pas en mois de 30 j

/**
 * Plafond DUR du nombre d'entrées, indépendant de la rétention en mois.
 *
 * ⚠️ Il ne fait pas doublon avec la rétention : celle-ci se fie aux HORODATAGES, et un horodatage
 * vient de la source externe. Une horloge décalée, un `at` dans le futur, et la fenêtre de 24 mois
 * ne borne plus rien. Deux limites de NATURES différentes, parce qu'une seule d'entre elles dépend
 * d'une donnée qu'on ne contrôle pas.
 */
export const PLAFOND_ENTREES_HISTORIQUE = 5000;

const JOUR_MS = 24 * 60 * 60 * 1000;

/** Jour UTC d'un horodatage, `null` si la date est inexploitable. */
export function jourUtc(at: unknown): string | null {
    const n = Number(at);
    if (!Number.isFinite(n) || n <= 0) return null;
    const d = new Date(n);
    const iso = d.toISOString();
    return iso.length >= 10 ? iso.slice(0, 10) : null;
}

/**
 * Fusionne la lecture du jour dans l'historique.
 *
 * Règles, et chacune répond à une question qui se pose vraiment :
 *  - **Une entrée par compte et par JOUR.** Le cron passe une fois par jour mais Marc peut lancer
 *    une synchro manuelle : sans cette clé, un après-midi actif écrirait cinq points pour la même
 *    journée. La DERNIÈRE lecture du jour gagne — c'est la plus à jour, pas la plus ancienne.
 *  - **Un `at` inexploitable est REFUSÉ, jamais rabattu sur maintenant.** Dater une lecture
 *    d'aujourd'hui alors qu'on ignore quand elle a été prise fabriquerait un point d'historique —
 *    exactement la donnée inventée que ce dépôt refuse.
 *  - **Une entrée `missingRate` est CONSERVÉE telle quelle.** Son `balanceCad` ne signifie rien, et
 *    c'est justement l'information : « ce compte existait ce jour-là et on ne savait pas le
 *    convertir ». La jeter effacerait la trace de la panne en même temps que la panne.
 *  - **Ordre déterministe** (date, puis compte) : un état qui se réordonne tout seul produit un
 *    diff Drive à chaque passe, pour rien.
 */
export function accumulerHistoriqueCourtier(
    ancien: readonly FintableBrokerBalance[] | undefined,
    nouveaux: readonly FintableBrokerBalance[] | undefined,
    maintenant: number,
): FintableBrokerBalance[] {
    const parCle = new Map<string, FintableBrokerBalance>();

    const limite = Number.isFinite(maintenant)
        ? maintenant - RETENTION_HISTORIQUE_JOURS * JOUR_MS
        : Number.NEGATIVE_INFINITY;

    // ⚠️ UN SEUL point de refus, et c'est délibéré. Mon premier jet refusait les dates illisibles ici
    // ET re-filtrait la rétention plus bas sur `e.at` brut : les deux mécanismes se recouvraient, si
    // bien que retirer le refus ne changeait RIEN (`NaN >= limite` est faux, donc le filtre rattrapait
    // en silence). La garde avait l'air de protéger quelque chose et ne pouvait pas TIRER
    // (`UNE-GARDE-QUI-NE-PEUT-PAS-TIRER-N-EST-PAS-UNE-PROTECTION`) — mesuré par perturbation, pas
    // déduit. Les deux décisions vivent donc au même endroit, sur la date DÉJÀ analysée.
    const poser = (e: FintableBrokerBalance | undefined) => {
        if (!e || typeof e !== 'object') return;   // absence : silence LÉGITIME
        const jour = jourUtc(e.at);
        const id = String(e.accountId ?? '');
        if (jour === null || id === '') {
            // ⚠️ `at` et `accountId` sont REQUIS par le type — il n'existe aucun cas légitime
            // « ce compte n'a jamais eu d'id ». Une entrée PRÉSENTE mais illisible vient donc d'un
            // état Drive corrompu (champ additif, aucun schéma Zod), et disparaîtrait à CHAQUE
            // synchro future en faisant baisser la profondeur affichée sans que rien ne l'explique.
            // Le module SŒUR du même lot (`reconcileBrokerBalances`) trace exactement cette classe
            // de corruption ; l'asymétrie était le signal (finding silent-failure-hunter, #978).
            // `logErrorThrottled` : un historique corrompu porterait des centaines d'entrées.
            logErrorThrottled('brokerHistory:entree-illisible', {
                source: 'storage',
                severity: 'warning',
                message: 'Entrée d\'historique courtier écartée (date ou identifiant de compte illisible)',
            });
            return;
        }
        if (Number(e.at) < limite) return;      // hors rétention : silence LÉGITIME
        parCle.set(`${id}|${jour}`, e);
    };

    // Ordre d'insertion = ancien d'abord, nouveau ensuite → la lecture du jour ÉCRASE celle du matin.
    for (const e of ancien ?? []) poser(e);
    for (const e of nouveaux ?? []) poser(e);

    const garde = [...parCle.values()]
        .sort((a, b) => (Number(a.at) - Number(b.at)) || String(a.accountId).localeCompare(String(b.accountId)));

    // Le plafond coupe par le DÉBUT : on sacrifie le plus ancien, jamais le plus récent.
    return garde.length > PLAFOND_ENTREES_HISTORIQUE
        ? garde.slice(garde.length - PLAFOND_ENTREES_HISTORIQUE)
        : garde;
}

/** Nombre de JOURS distincts couverts — la seule mesure honnête de « est-ce que ça sert déjà ? ». */
export function profondeurEnJours(historique: readonly FintableBrokerBalance[] | undefined): number {
    const jours = new Set<string>();
    for (const e of historique ?? []) {
        const j = jourUtc(e?.at);
        if (j !== null) jours.add(j);
    }
    return jours.size;
}
