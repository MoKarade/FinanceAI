// services/marche/instruments.ts
//
// [PTF-L1C3-INSTRUMENTS] Résolution de l'ISIN et du symbole EODHD de chaque titre détenu. Le magasin de
// marché est rangé par ISIN (ADR 0019), mais l'état de l'app ne porte que des symboles de cotation :
// sans cette étape, la passe du magasin n'a aucune cible.
// PUR : aucun `fetch`. Les candidats de recherche arrivent DÉJÀ normalisés (`CandidatRecherche`) ; le
// lecteur de la réponse réelle d'EODHD `/api/search` n'est écrit qu'après une mesure de sa forme (tâche
// #45), jamais d'après une forme supposée (`UN-INDEX-SUR-UNE-LISTE-GROUPEE-PAR-COHORTE-NE-DESIGNE-RIEN`).
//
// Règles, et pourquoi :
//   1. JAMAIS UN ISIN DEVINÉ. Un doute (plusieurs titres possibles, devise qui ne colle pas, ISIN absent
//      ou mal formé) est un REFUS avec sa raison : un mauvais ISIN rangerait les cours d'un autre titre
//      sous le nom de celui-ci, et la courbe serait fausse sans que rien ne le signale.
//   2. LA DEVISE VIENT DE L'ÉTAT, pas de la source : EODHD ne la garantit pas. Un candidat dont la devise
//      diffère de celle du titre détenu (ou n'en a pas) ne peut pas le désigner : `devise-douteuse`.
//   3. UN SYMBOLE DE COTATION = UNE PLACE. Deux places pour un même titre (même ISIN) restent ambiguës :
//      les cours peuvent différer, on ne choisit pas pour le propriétaire. Un suffixe de place sur le
//      symbole détenu (`ABC.TO`) départage seulement quand il désigne exactement une place.
//   4. LE RÉSULTAT NE VIT PAS DANS LE DÉPÔT. Il nomme ce que le propriétaire détient : il est rangé dans
//      le champ `cibles` du fichier de cours Drive (route `/market-store`), jamais dans un fichier versionné.
import type { BrokerLedgerCurrency } from '../../types';
import type { CibleCloture } from './passeMagasin';

/** Un titre détenu : le symbole saisi dans l'app et sa devise de cotation (celle de l'état). */
interface TitreDetenu {
    symbole: string;
    devise: BrokerLedgerCurrency;
}

/** Un résultat de recherche déjà normalisé. `null` = la source n'a pas donné la valeur (jamais comblée). */
interface CandidatRecherche {
    code: string;
    /** Code de place EODHD (la partie après le point du symbole : `US`, `TO`, `PA`…). */
    echange: string;
    isin: string | null;
    devise: string | null;
}

type RaisonRefus = 'introuvable' | 'ambigu' | 'devise-douteuse' | 'isin-absent';

type Resolution =
    | ({ statut: 'resolu' } & CibleCloture)
    | { statut: 'refuse'; raison: RaisonRefus };

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const MORCEAU_SYMBOLE = /^[A-Za-z0-9-]+$/;

const refus = (raison: RaisonRefus): Resolution => ({ statut: 'refuse', raison });

/** Résout un titre. `candidats` = les résultats de la recherche faite avec SON symbole. */
function resoudreUn(titre: TitreDetenu, candidats: readonly CandidatRecherche[]): Resolution {
    const [base, suffixe] = titre.symbole.toUpperCase().split('.');
    // Un candidat d'un autre code ne désigne pas ce titre (la recherche rend aussi des titres voisins).
    let pertinents = candidats.filter((c) =>
        MORCEAU_SYMBOLE.test(c.code) && MORCEAU_SYMBOLE.test(c.echange) && c.code.toUpperCase() === base);
    if (pertinents.length === 0) return refus('introuvable');

    if (suffixe !== undefined) {
        const surCettePlace = pertinents.filter((c) => c.echange.toUpperCase() === suffixe);
        if (surCettePlace.length > 0) pertinents = surCettePlace;
    }

    const memeDevise = pertinents.filter((c) => c.devise !== null && c.devise.toUpperCase() === titre.devise);
    if (memeDevise.length === 0) return refus('devise-douteuse');

    const symboles = new Set(memeDevise.map((c) => `${c.code.toUpperCase()}.${c.echange.toUpperCase()}`));
    if (symboles.size > 1) return refus('ambigu');

    const isins = new Set(memeDevise.flatMap((c) => (c.isin !== null && ISIN.test(c.isin) ? [c.isin] : [])));
    if (isins.size === 0) return refus('isin-absent');
    if (isins.size > 1) return refus('ambigu');

    const [symboleEodhd] = symboles;
    const [isin] = isins;
    return { statut: 'resolu', isin, symboleEodhd, devise: titre.devise };
}

/**
 * Résout chaque titre détenu, dans le même ordre que `titres`. `recherches` : clé = le symbole du titre
 * détenu tel que donné à la recherche. Une clé absente (recherche non faite ou en échec) = `introuvable`.
 */
export function resoudreInstruments(
    titres: readonly TitreDetenu[],
    recherches: ReadonlyMap<string, readonly CandidatRecherche[]>,
): Resolution[] {
    return titres.map((t) => resoudreUn(t, recherches.get(t.symbole) ?? []));
}
