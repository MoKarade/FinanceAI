// services/fx/provenance.ts
//
// [FX-TAUX-JAMAIS-ARRIVES] D'OÙ vient le taux de change qui convertit les avoirs étrangers.
//
// MESURE À L'ORIGINE DU MODULE (2026-09-16, état RÉEL de Marc lu par le MCP) : ses positions
// sont en USD ou en EUR — AUCUNE en CAD — et les facteurs appliqués valaient **1,4000** et **1,4700**
// au dix-millième, c'est-à-dire `DEFAULT_FX_RATES` au caractère près (« approximation Q1 2026 »).
// Autrement dit : 100 % des placements affichés reposaient sur un taux INVENTÉ, et
// c'était aussi la vraie raison pour laquelle le compte courtier USD n'était pas converti.
//
// ⚠️ POURQUOI UNE PROVENANCE ET PAS UN BOOLÉEN. `fxRatesEstimated` recouvre DEUX faits (« du marché »
// contre « repli en dur »). Marc a demandé un troisième cas — un taux qu'il SAISIT lui-même quand la
// Banque du Canada reste injoignable — et un booléen ne peut pas le porter : le ranger dans `true`
// le priverait de conversion (donc de la correction demandée), le ranger dans `false` le ferait
// passer pour une lecture de marché. Même piège que
// `UN-DEFAUT-QUI-RECOUVRE-DEUX-FAITS-OPPOSES-SE-CORRIGE-EN-LES-SEPARANT`, vu une marche plus haut :
// ici le remède n'est pas de séparer en deux mais de cesser de compter en booléen.
//
// ⚠️ Ce module est PUR et sans I/O : il est importé par le bundle navigateur ET par le serveur MCP.

/** D'où vient le taux effectivement appliqué. Ordre de confiance décroissante. */
export type FxSource =
    /** Lu chez la Banque du Canada, les deux séries présentes et lisibles. */
    | 'api'
    /** Saisi À LA MAIN par Marc (recours quand l'API reste injoignable). Daté, et il le sait. */
    | 'manuel'
    /** `DEFAULT_FX_RATES` — un chiffre écrit en dur dans le dépôt, qui ne mesure rien. */
    | 'repli';

/** Ce que la DERNIÈRE tentative de lecture a donné. Sert au diagnostic, jamais au calcul. */
export type FxCause =
    | 'ok'
    /** Requête réussie mais AU MOINS une des deux séries manquait ou était illisible. */
    | 'partiel'
    /** [FX-OBSERVATION-COHORTE] La série existe et se lit, mais sa dernière publication est trop
     *  vieille pour être « le taux courant » (série arrêtée, ou publication interrompue). Distincte
     *  de `'partiel'` : une série ABSENTE et une série FIGÉE ne se corrigent pas pareil, et c'est
     *  précisément la confusion qui a fait chercher la panne du mauvais côté le 2026-09-16. */
    | 'perimee'
    /** La requête n'est jamais partie ou n'est jamais revenue (réseau, CSP, délai dépassé). */
    | 'reseau'
    /** Le serveur a répondu autre chose qu'un succès. */
    | 'http'
    /** Réponse reçue mais sans observation exploitable. */
    | 'reponse-illisible'
    /** Taux posé à la main : il n'y a pas eu de tentative de lecture. */
    | 'manuel'
    /** Aucune tentative enregistrée (état d'avant ce lot, ou app jamais ouverte en ligne). */
    | 'jamais-tente';

/** Les valeurs acceptées, pour valider un état venu du Drive qu'aucun schéma Zod ne contrôle. */
const SOURCES: readonly FxSource[] = ['api', 'manuel', 'repli'];
const CAUSES: readonly FxCause[] = [
    'ok', 'partiel', 'perimee', 'reseau', 'http', 'reponse-illisible', 'manuel', 'jamais-tente',
];

/**
 * Cette chaîne est-elle une `FxCause` connue ?
 *
 * ⚠️ EXPORTÉ parce que `services/finance.ts` en tenait une COPIE (`CAUSES_CACHE`) pour valider le
 * cache local : ajouter `'perimee'` demandait d'éditer DEUX listes, et celle qu'on oublie ne rougit
 * nulle part — elle rejette silencieusement une cause légitime, ce qui fait réécrire l'état à chaque
 * démarrage. `UN-COMMENTAIRE-QUI-RECLAME-DE-LA-VIGILANCE-EST-UNE-SOURCE-UNIQUE-MANQUANTE`.
 */
export function estFxCause(brut: unknown): brut is FxCause {
    return typeof brut === 'string' && (CAUSES as readonly string[]).includes(brut);
}

/** Forme MINIMALE lue ici — jamais `AppState` en entier (ce module sert aussi au serveur MCP). */
export interface EtatFxMinimal {
    fxRates?: { lastFetched?: number } | undefined;
    fxRatesEstimated?: boolean | undefined;
    fxRatesSource?: string | undefined;
    fxLastAttemptCause?: string | undefined;
}

/**
 * Provenance EFFECTIVE du taux courant.
 *
 * ⚠️ RÉTROCOMPATIBILITÉ : `fxRatesSource` est un champ ADDITIF. Tout état écrit avant ce lot ne le
 * porte pas — et il n'y a alors QUE deux provenances possibles, puisque la saisie manuelle n'existait
 * pas. On retombe donc exactement sur l'ancienne lecture (`fxRatesEstimated`, sinon
 * `lastFetched === 0`), ce qui rend le comportement bit-identique sur un état ancien.
 */
export function fxSourceEffective(etat: EtatFxMinimal | undefined): FxSource {
    const brut = etat?.fxRatesSource;
    if (typeof brut === 'string' && (SOURCES as readonly string[]).includes(brut)) {
        return brut as FxSource;
    }
    const estime = etat?.fxRatesEstimated;
    if (typeof estime === 'boolean') return estime ? 'repli' : 'api';
    return (etat?.fxRates?.lastFetched ?? 0) === 0 ? 'repli' : 'api';
}

/** Cause de la dernière tentative, validée. Inconnue ou absente ⇒ `jamais-tente`. */
export function fxCauseEffective(etat: EtatFxMinimal | undefined): FxCause {
    const brut = etat?.fxLastAttemptCause;
    if (estFxCause(brut)) return brut;
    return 'jamais-tente';
}

/**
 * Ce taux a-t-il le droit de convertir une grandeur qui FAIT AUTORITÉ (total d'un compte courtier,
 * solde de départ de la projection) ?
 *
 * ⚠️ C'est la question que `UN-REPLI-BON-POUR-UN-AFFICHAGE-EST-LE-PIRE-POUR-UNE-AUTORITE` oblige à
 * poser, et la réponse n'est PAS « le taux est-il exact ? » mais « saurait-on encore, en lisant le
 * résultat, que c'en est un ? ». Un taux saisi par Marc est daté, visible et assumé par lui : il
 * convertit. `DEFAULT_FX_RATES` ne mesure rien et se présenterait comme un total de compte : il
 * n'a pas le droit d'écrire un montant.
 */
export function fxFaitAutorite(source: FxSource): boolean {
    return source === 'api' || source === 'manuel';
}

/** Libellé court de la provenance, pour un badge. */
export function libelleSourceFx(source: FxSource): string {
    if (source === 'api') return 'Taux Banque du Canada';
    if (source === 'manuel') return 'Taux saisis à la main';
    return 'Taux de change estimés';
}

/**
 * Phrase de diagnostic : ce qui s'est passé, et ce que Marc peut y faire.
 *
 * ⚠️ Un texte affiché est une AFFIRMATION (`UN-MESSAGE-QUI-PROMET-UNE-RESOLUTION-AUTOMATIQUE-EST-UNE-
 * AFFIRMATION-SUR-L-AVENIR`) : aucune de ces phrases ne promet que ça se règlera tout seul, parce
 * qu'avant ce lot la lecture ne tournait qu'UNE fois au démarrage — « réessaie plus tard » aurait
 * été faux pour toutes les causes à la fois.
 */
export function messageCauseFx(cause: FxCause): string {
    switch (cause) {
        case 'ok':
            return 'Les deux taux ont été lus chez la Banque du Canada.';
        case 'partiel':
            return 'La Banque du Canada a répondu, mais au moins une des deux séries (USD ou EUR) '
                + 'était absente ou illisible : ce taux-là vient du repli.';
        case 'perimee':
            return 'La Banque du Canada a répondu, mais la dernière valeur publiée pour au moins '
                + 'une des deux séries est trop ancienne pour être le taux du jour : ce taux-là '
                + 'vient du repli.';
        case 'reseau':
            return 'La requête vers la Banque du Canada n\'est pas revenue (réseau coupé, délai '
                + 'dépassé, ou blocage du navigateur).';
        case 'http':
            return 'La Banque du Canada a répondu par une erreur.';
        case 'reponse-illisible':
            return 'La Banque du Canada a répondu, mais sans aucune observation exploitable.';
        case 'manuel':
            return 'Le taux en vigueur est celui que tu as saisi — aucune lecture automatique n\'a '
                + 'été faite depuis.';
        case 'jamais-tente':
        default:
            return 'Aucune lecture automatique n\'a encore été enregistrée.';
    }
}

/**
 * Délai au-delà duquel une lecture IDENTIQUE mérite quand même d'être écrite.
 *
 * ⚠️ MESURE DE LA RAISON D'ÊTRE : la Banque du Canada ne publie qu'un jour OUVRÉ. « Le même taux
 * qu'hier » est donc le cas NORMAL, pas une anomalie — et le démarrage n'écrivait l'état que si la
 * VALEUR avait changé (`if (fxRates.USD !== rates.USD || fxRates.EUR !== rates.EUR)`). Conséquence :
 * une lecture parfaitement réussie un lundi matin ne rafraîchissait RIEN si le taux n'avait pas
 * bougé, et la fraîcheur affichée vieillissait indéfiniment sur une donnée pourtant à jour.
 */
export const DELAI_RAFRAICHISSEMENT_FX_MS = 12 * 60 * 60 * 1000;

/** Ce que `doitEcrireTauxFx` compare — structurel, pour ne pas importer `services/finance.ts` (cycle). */
export interface LectureFx {
    USD: number;
    EUR: number;
    lastFetched: number;
    source: FxSource;
    cause: FxCause;
    attemptAt: number;
}

/** L'état courant, côté comparaison. */
export interface EtatFxCompare extends EtatFxMinimal {
    fxRates?: { USD?: number; EUR?: number; lastFetched?: number } | undefined;
    fxLastAttemptAt?: number | undefined;
}

/** Ce qu'il faut écrire dans l'état à la suite d'une lecture. */
export type DecisionEcritureFx =
    /** Rien : ni les taux ni le diagnostic n'apprennent quoi que ce soit de neuf. */
    | 'rien'
    /** Le DIAGNOSTIC seulement (cause + instant de la tentative). Les TAUX ne bougent pas. */
    | 'diagnostic'
    /** Tout : les taux, la provenance et le diagnostic. */
    | 'tout';

/**
 * Que faut-il écrire ?
 *
 * ⚠️⚠️ LA RÈGLE QUI COMPTE, ET ELLE A ÉTÉ MESURÉE : **une lecture SANS autorité ne remplace jamais
 * un taux QUI EN A.** Sans elle, le recours que tout ce lot existe pour offrir s'effaçait au
 * redémarrage suivant : Marc saisit son taux (1,3650), la Banque du Canada reste injoignable — ce
 * qui est EXACTEMENT la situation où il l'a saisi — et le démarrage rappelait `fetchFxRates`, qui
 * rend alors le repli en dur (1,40). Les valeurs DIFFÉRANT, l'ancienne condition écrivait, et la
 * saisie disparaissait. Mesuré : `manuel 1,3650` → `repli 1,40`, à chaque ouverture de l'app.
 *
 * ⚠️ Le même piège vaut pour un taux `api` déjà persisté quand le cache local a été vidé :
 * `fetchFxRates` ne peut plus proposer son dernier taux réel et retombe sur le littéral du dépôt.
 * La garde est donc posée sur l'AUTORITÉ, pas sur le mot « manuel ».
 *
 * ⚠️ Mais l'échec DOIT quand même laisser une trace, sinon « essayé, réseau coupé » redevient
 * indiscernable de « jamais tenté » — d'où un troisième état, `'diagnostic'`, au lieu d'un booléen.
 * C'est la même leçon que `UN-DEFAUT-QUI-RECOUVRE-DEUX-FAITS-OPPOSES-SE-CORRIGE-EN-LES-SEPARANT`,
 * appliquée ici à la DÉCISION plutôt qu'à la donnée.
 */
export function decisionEcritureFx(prev: EtatFxCompare | undefined, res: LectureFx): DecisionEcritureFx {
    const sourcePrecedente = fxSourceEffective(prev);
    const peutRemplacer = fxFaitAutorite(res.source) || !fxFaitAutorite(sourcePrecedente);

    if (peutRemplacer) {
        if (res.USD !== prev?.fxRates?.USD || res.EUR !== prev?.fxRates?.EUR) return 'tout';
        if (res.source !== sourcePrecedente) return 'tout';
        // Un SUCCÈS dont la valeur n'a pas bougé rafraîchit quand même la fraîcheur (cf. le délai).
        if (res.lastFetched > 0
            && res.lastFetched - (prev?.fxRates?.lastFetched ?? 0) > DELAI_RAFRAICHISSEMENT_FX_MS) return 'tout';
    }

    // Reste le DIAGNOSTIC. Un échec est une information : « essayé il y a 2 min, réseau coupé » ne
    // se déduit d'aucun autre champ.
    if (res.cause !== fxCauseEffective(prev)) return peutRemplacer ? 'tout' : 'diagnostic';
    if (res.attemptAt - (prev?.fxLastAttemptAt ?? 0) > DELAI_RAFRAICHISSEMENT_FX_MS) {
        return peutRemplacer ? 'tout' : 'diagnostic';
    }
    return 'rien';
}
