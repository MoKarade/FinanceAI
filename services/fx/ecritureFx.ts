// services/fx/ecritureFx.ts
//
// [FX-SERVEUR-JAMAIS-RAFRAICHI] CE QU'UNE LECTURE DE TAUX ÉCRIT DANS L'ÉTAT — source unique du
// navigateur (`updateFxRates` du store, démarrage de l'app) et du serveur (`runPriceRefresh`, le
// rafraîchissement planifié).
//
// Pourquoi ce module existe : les taux de la Banque du Canada n'étaient lus QUE par le navigateur,
// au démarrage. Le serveur (hub, MCP) valorisait donc les titres étrangers au taux de la dernière
// ouverture de l'app — des jours, parfois. Le brancher côté serveur exigeait les deux règles que le
// navigateur applique déjà :
//   1. QUOI écrire (`decisionEcritureFx`, déjà pure) — dont « une lecture SANS autorité n'écrase
//      jamais un taux qui en a » (un taux saisi à la main survit à une Banque du Canada injoignable) ;
//   2. COMMENT l'écrire (le corps de `updateFxRates`) — la provenance dérivée, la date d'observation
//      tenue cohérente avec la provenance.
// La seconde vivait dans le store, inatteignable depuis le serveur. Recopiée, elle aurait divergé au
// premier correctif (`AVANT-D-UNIFIER-N-COPIES…` : ici les deux côtés partagent TOUT, rien n'est un
// paramètre local). D'où l'extraction, sans changement de comportement pour le navigateur.
//
// ⚠️ Module PUR, sans I/O : importé par le bundle navigateur ET par le serveur MCP.
import type { FxCause, FxSource } from './provenance';
import { decisionEcritureFx, fxSourceEffective, type LectureFx } from './provenance';

/** Les champs FX de l'état — forme minimale, jamais `AppState` en entier. */
export interface EtatFx {
    fxRates: { USD: number; EUR: number; CAD: number; lastFetched?: number };
    fxRatesEstimated?: boolean;
    fxRatesSource?: FxSource;
    fxLastAttemptCause?: string;
    fxLastAttemptAt?: number;
    fxObservationDate?: string;
}

/** L'argument de `updateFxRates` (signature inchangée). */
export interface EcritureFx {
    USD: number; EUR: number; CAD: number; lastFetched?: number; estimated?: boolean;
    /** [FX-TAUX-JAMAIS-ARRIVES] provenance du taux (`services/fx/provenance.ts`). */
    source?: FxSource;
    /** résultat de la tentative qui a produit ce taux. */
    cause?: FxCause;
    /** epoch ms de cette tentative, réussie ou non. */
    attemptAt?: number;
    /** [FX-OBSERVATION-COHORTE] date de l'observation BdC retenue (`YYYY-MM-DD`). */
    observationDate?: string;
}

/** Une lecture complète (`fetchFxRates`), telle que `decisionEcritureFx` la compare. */
export type LectureFxComplete = LectureFx & { CAD: number; estimated: boolean; observationDate?: string };

/**
 * Les champs à écrire pour une écriture donnée — le corps d'origine de `updateFxRates`, déplacé tel
 * quel (commentaires compris : ils expliquent chaque règle).
 */
export function champsFxApres(prev: EtatFx, { estimated, source, cause, attemptAt, observationDate, ...rates }: EcritureFx): EtatFx {
    return {
        // [FX-FALLBACK-SILENCIEUX] `estimated` vit SIBLING de fxRates (jamais dans l'objet
        // lui-même — il resterait un Record<string, number> pour ses ~13 consommateurs).
        // [FX-TAUX-JAMAIS-ARRIVES] `source`/`cause`/`attemptAt` sont SIBLING pour la même
        // raison, et TOUS optionnels : un appelant qui n'en passe aucun (état ancien, test
        // écrit avant ce lot) laisse l'existant intact plutôt que de l'effacer.
        // `?.` : le type exige `fxRates`, mais un blob Drive ANCIEN lu par le serveur peut ne pas
        // le porter — la lecture de marché doit alors l'ÉCRIRE, pas lever.
        fxRates: { ...prev.fxRates, ...rates },
        fxRatesEstimated: estimated ?? prev.fxRatesEstimated,
        // ⚠️ Quand un appelant ne donne QUE `estimated` (l'ancienne signature), on DÉRIVE la
        // provenance au lieu de garder l'ancienne : sinon l'état porterait deux réponses
        // contradictoires à la même question, et `fxSourceEffective` — qui préfère le champ
        // explicite — suivrait la périmée. Un seul écrivain, donc aucune contradiction
        // exprimable (`UN-DEFAUT-QUI-RECOUVRE-DEUX-FAITS-OPPOSES-SE-CORRIGE-EN-LES-SEPARANT`,
        // pris par l'autre bout : séparer deux faits impose de les tenir cohérents).
        fxRatesSource: source
            ?? (estimated === undefined ? prev.fxRatesSource : (estimated ? 'repli' : 'api')),
        fxLastAttemptCause: cause ?? prev.fxLastAttemptCause,
        fxLastAttemptAt: attemptAt ?? prev.fxLastAttemptAt,
        // ⚠️ [FX-OBSERVATION-COHORTE] La date est DÉRIVÉE de la provenance, jamais recopiée
        // telle quelle : elle ne décrit les DEUX taux que si les deux ont été lus chez la
        // Banque du Canada. Un taux saisi à la main ou un repli en dur n'a aucune
        // observation derrière lui — garder l'ancienne date daterait le littéral du dépôt.
        // ⚠️ Et quand l'appelant ne parle PAS de provenance (ancienne signature), la date
        // ne survit que si les TAUX n'ont pas bougé : `{ USD: 1.55, EUR: 1.80 }` sans `source`
        // laissait sinon la date de la veille DATER des taux neufs.
        fxObservationDate: source === undefined
            ? ((rates.USD !== prev.fxRates?.USD || rates.EUR !== prev.fxRates?.EUR)
                ? undefined
                : prev.fxObservationDate)
            : (source === 'api' ? observationDate : undefined),
    };
}

/**
 * Que faut-il écrire à la suite de CETTE lecture ? `null` = rien.
 *
 * La décision est `decisionEcritureFx` ; ce module ne fait que traduire sa réponse en argument
 * d'écriture. La branche `'diagnostic'` était écrite EN LIGNE dans le démarrage de l'app : le
 * serveur en a besoin à l'identique, sinon une Banque du Canada injoignable depuis Cloud Run
 * effacerait un taux saisi à la main — exactement le cas où la saisie sert.
 */
export function ecritureFxSelonLecture(prev: EtatFx, lecture: LectureFxComplete): EcritureFx | null {
    const quoi = decisionEcritureFx(prev, lecture);
    if (quoi === 'rien') return null;
    if (quoi === 'tout') {
        return {
            USD: lecture.USD, EUR: lecture.EUR, CAD: lecture.CAD, lastFetched: lecture.lastFetched,
            estimated: lecture.estimated, source: lecture.source, cause: lecture.cause,
            attemptAt: lecture.attemptAt, observationDate: lecture.observationDate,
        };
    }
    // ⚠️ Une lecture SANS autorité n'écrase pas un taux qui en a : on ne garde que la TRACE de la
    // tentative. Les taux, leur provenance et leur date d'observation sont REPASSÉS tels quels —
    // sans la date, `champsFxApres` classerait l'écriture comme neuve et l'effacerait.
    return {
        USD: prev.fxRates.USD, EUR: prev.fxRates.EUR, CAD: prev.fxRates.CAD,
        lastFetched: prev.fxRates.lastFetched,
        estimated: prev.fxRatesEstimated,
        source: fxSourceEffective(prev),
        cause: lecture.cause,
        attemptAt: lecture.attemptAt,
        observationDate: prev.fxObservationDate,
    };
}
