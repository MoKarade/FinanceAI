// services/portefeuille/passerelle.ts
//
// [PTF-L1E-PASSERELLE] La passerelle entre le grand livre courtier et les placements saisis. Elle dit
// QUELS placements saisis le grand livre remplace, et ce que vaut le grand livre à leur place, par
// régime fiscal. PUR — ni horloge, ni réseau, ni store : le livre, les régimes, le magasin de marché et
// la date sont des ARGUMENTS. Vit sous `services/` pour être embarqué tel quel par l'app, le serveur MCP
// et la tâche serveur, comme le moteur de valorisation qu'il consomme.
//
// Décisions de Marc (2026-09-24), et ce que chacune impose ici :
//   1. « Exclus automatiquement » : dès qu'un compte du courtier porte un régime et figure au livre, les
//      placements saisis de CE RÉGIME sortent des calculs. Sinon le même titre compterait deux fois.
//   2. « Par compte » : le régime se DÉCLARE par compte du livre (`brokerAccountRegimes`), il ne se
//      devine jamais. Tant qu'un compte porteur n'en a pas, la passerelle REFUSE le livre ENTIER et les
//      écrans gardent les placements saisis — un livre à moitié branché ferait disparaître un régime
//      sans que rien ne le remplace.
//
// Ce que le module garantit, et pourquoi :
//   A. IDENTITÉ SANS LIVRE. Livre jamais importé, livre vide, livre refusé : `actifsHorsLivre` rend le
//      MÊME tableau (même référence). Aucun écran ne change tant que le livre ne fait pas autorité — et
//      la même référence évite qu'un `useMemo` en aval recalcule pour rien.
//   B. CORRESPONDANCE EXACTE DU RÉGIME. Un actif sort si son `accountType` (absent = NON-ENREG, la
//      règle de `holdingsCadByRegime`) est EXACTEMENT un régime couvert. Pas de famille : CELIAPP reste
//      distinct de CELI, sinon un CELIAPP saisi disparaîtrait derrière un compte CELI du courtier, alors
//      que ce sont deux comptes, deux plafonds et deux régimes de retrait.
//   C. SEULS LES COMPTES PRÉSENTS AU LIVRE COUVRENT. Un régime déclaré pour un compte qui n'a aucun
//      événement ne retire rien : il n'a rien pour remplacer ce qu'il retirerait.
//   D. UN TOTAL AMPUTÉ EST UN FAUX (garantie 1 de `valoriserAu`, reprise telle quelle) : dès qu'il manque
//      un cours ou un taux, la valeur du livre est `indisponible`, avec la valorisation qui dit pourquoi.
//      Jamais la somme des seules lignes lisibles, jamais un repli sur les placements saisis (ils sont
//      exclus, et les rappeler ici ferait deux sources pour un même chiffre).
//   E. TOUS LES COMPTES DU LIVRE SE TRAITENT PAREIL, `hors-courtier` compris. Ce compte porte ce que
//      Marc tient ailleurs et saisit à la main (source `saisie-manuelle`) : s'il a des événements, il
//      fait partie du livre, il lui faut un régime, et il couvre ce régime comme les deux autres.
//
// ⚠️ Conséquence de B, à dire et non à cacher : l'exclusion se fait par PANIER de régime. Un placement
// saisi du même régime mais tenu chez un AUTRE courtier sortirait aussi. C'est routé à Marc
// (`[PTF-L1E-PASSERELLE]` au BACKLOG), pas deviné ici.
import type {
    Asset, BrokerAccountRegime, BrokerAccountRegimeType, BrokerLedgerAccountId, BrokerLedgerEvent,
} from '../../types';
import type { MagasinMarche } from '../marche/magasinMarche';
import { valoriserAu, type Valorisation } from '../valorisation/valoriser';

/** Les comptes du livre, dans un ordre fixe : deux appels sur le même état rendent les mêmes causes. */
const COMPTES_DU_LIVRE: readonly BrokerLedgerAccountId[] = ['courtier-cad', 'courtier-usd', 'hors-courtier'];

/** Les régimes qu'un compte du livre peut déclarer. Tableau et non ensemble : la valeur lue d'un
 *  blob n'est pas typée, et `includes` sur un tableau typé exige une conversion explicite. */
const REGIMES_ADMIS: readonly BrokerAccountRegimeType[] = ['CELI', 'CELIAPP', 'REER', 'NON-ENREG', 'REEE', 'MARGE'];

/** Pourquoi le livre ne fait pas autorité. Chaque cause nomme le compte, jamais un montant. */
type CauseRefusPasserelle =
    /** Un événement porte un compte hors des trois du contrat (blob restauré, schéma futur) : rien
     *  n'en dit le régime, et `etatDuLivre` le valorise quand même — le laisser passer ferait
     *  sortir sa valeur de toute ventilation par régime. `compte` est la chaîne lue, telle quelle. */
    | { type: 'compte-inconnu'; compte: string }
    | { type: 'compte-sans-regime'; compte: BrokerLedgerAccountId }
    /** Deux régimes différents déclarés pour le même compte : lequel vaut n'est pas à deviner. */
    | { type: 'regime-ambigu'; compte: BrokerLedgerAccountId }
    /** Un régime illisible (blob restauré, saisie d'une version future) : jamais rabattu sur un défaut. */
    | { type: 'regime-inconnu'; compte: BrokerLedgerAccountId };

export type DecisionPasserelle =
    /** Aucun livre importé : les placements saisis restent la seule source. */
    | { etat: 'sans-livre' }
    | { etat: 'refusee'; causes: CauseRefusPasserelle[] }
    | {
        etat: 'active';
        /** Régime de chaque compte PRÉSENT au livre (garantie C). */
        regimeParCompte: ReadonlyMap<BrokerLedgerAccountId, BrokerAccountRegimeType>;
        /** Régimes que le livre remplace. Vide pour un livre importé mais vide (garantie A). */
        regimesCouverts: ReadonlySet<BrokerAccountRegimeType>;
    };

/** Les comptes qu'un événement touche : le sien, et la cible d'une conversion ou d'un virement. */
function comptesTouches(e: BrokerLedgerEvent): BrokerLedgerAccountId[] {
    const autre = (e as { toAccountId?: BrokerLedgerAccountId }).toAccountId;
    return autre === undefined ? [e.accountId] : [e.accountId, autre];
}

/**
 * Le livre fait-il autorité, et sur quels régimes ? Ne lit ni cours ni taux : la décision ne dépend
 * que du livre et des régimes déclarés, pour qu'un magasin en retard ne fasse pas basculer les écrans
 * d'une source à l'autre d'un jour à l'autre.
 */
export function deciderPasserelle(
    livre: readonly BrokerLedgerEvent[] | undefined,
    regimes: readonly BrokerAccountRegime[] | undefined,
): DecisionPasserelle {
    if (livre === undefined) return { etat: 'sans-livre' };

    const presents = new Set<BrokerLedgerAccountId>();
    for (const e of livre) for (const c of comptesTouches(e)) presents.add(c);

    const declares = new Map<BrokerLedgerAccountId, unknown[]>();
    for (const r of regimes ?? []) {
        const liste = declares.get(r.accountId) ?? [];
        liste.push(r.regime);
        declares.set(r.accountId, liste);
    }

    const causes: CauseRefusPasserelle[] = [];
    const connus = COMPTES_DU_LIVRE as readonly string[];
    for (const compte of [...presents].filter((c) => !connus.includes(c)).sort()) {
        causes.push({ type: 'compte-inconnu', compte });
    }
    const regimeParCompte = new Map<BrokerLedgerAccountId, BrokerAccountRegimeType>();
    for (const compte of COMPTES_DU_LIVRE) {
        if (!presents.has(compte)) continue;
        const valeurs = [...new Set(declares.get(compte) ?? [])];
        if (valeurs.length === 0) { causes.push({ type: 'compte-sans-regime', compte }); continue; }
        if (valeurs.length > 1) { causes.push({ type: 'regime-ambigu', compte }); continue; }
        const regime = valeurs[0];
        if (!(REGIMES_ADMIS as readonly unknown[]).includes(regime)) { causes.push({ type: 'regime-inconnu', compte }); continue; }
        regimeParCompte.set(compte, regime as BrokerAccountRegimeType);
    }
    if (causes.length > 0) return { etat: 'refusee', causes };
    return { etat: 'active', regimeParCompte, regimesCouverts: new Set(regimeParCompte.values()) };
}

/** Les placements saisis qui restent comptés à côté du livre (garanties A et B). */
export function actifsHorsLivre<T extends Pick<Asset, 'accountType'>>(assets: readonly T[], decision: DecisionPasserelle): readonly T[] {
    if (decision.etat !== 'active' || decision.regimesCouverts.size === 0) return assets;
    const couverts = decision.regimesCouverts as ReadonlySet<string>;
    return assets.filter((a) => !couverts.has(a.accountType ?? 'NON-ENREG'));
}

export type ValeurDuLivre =
    /** Le livre ne remplace rien : aucune valeur à ajouter, les placements saisis sont intacts. */
    | { etat: 'sans-objet' }
    /** Le livre remplace des régimes, mais sa valeur n'est pas publiable (garantie D). */
    | { etat: 'indisponible'; cause: 'magasin-absent' }
    /** Une ligne valorisée vient d'un compte sans régime dans `decision` : la décision n'a pas été
     *  prise sur CE livre. Refus plutôt qu'une ventilation qui perdrait la ligne. */
    | { etat: 'indisponible'; cause: 'decision-desynchronisee' }
    | { etat: 'indisponible'; cause: 'valorisation-incomplete'; valorisation: Valorisation }
    | {
        etat: 'disponible';
        /** Titres et encaisse du livre, par régime, en CAD, non arrondis. */
        parRegime: Partial<Record<BrokerAccountRegimeType, number>>;
        totalCad: number;
        valorisation: Valorisation;
    };

/**
 * Ce que vaut le livre à `date`, par régime. `magasin` vaut `null` tant qu'aucun magasin de marché
 * n'a été lu — un magasin VIDE serait un autre mensonge (« aucun cours connu » au lieu de « pas lu »).
 * `ageMaxJours` est REQUIS, comme chez `valoriserAu` : un défaut ici serait un seuil inventé.
 */
export function valeurDuLivre(
    livre: readonly BrokerLedgerEvent[] | undefined,
    decision: DecisionPasserelle,
    magasin: MagasinMarche | null,
    date: string,
    ageMaxJours: number,
): ValeurDuLivre {
    if (decision.etat !== 'active' || decision.regimesCouverts.size === 0) return { etat: 'sans-objet' };
    if (magasin === null) return { etat: 'indisponible', cause: 'magasin-absent' };
    const valorisation = valoriserAu(livre, magasin, date, ageMaxJours);
    // `valoriserAu` ne rend `null` que pour un livre jamais importé, exclu par la décision active.
    if (valorisation === null) return { etat: 'sans-objet' };
    if (valorisation.totalCad === null) return { etat: 'indisponible', cause: 'valorisation-incomplete', valorisation };

    const parRegime: Partial<Record<BrokerAccountRegimeType, number>> = {};
    for (const l of [...valorisation.titres, ...valorisation.especes]) {
        // Une décision prise sur CE livre couvre chacun de ses comptes (un compte inconnu la refuse).
        // Une ligne sans régime dit donc que `decision` vient d'un autre livre : jamais de clé
        // fantôme, jamais une ligne perdue en silence.
        const regime = decision.regimeParCompte.get(l.compte);
        if (regime === undefined) return { etat: 'indisponible', cause: 'decision-desynchronisee' };
        parRegime[regime] = (parRegime[regime] ?? 0) + l.valeurCad;
    }
    return { etat: 'disponible', parRegime, totalCad: valorisation.totalCad, valorisation };
}
