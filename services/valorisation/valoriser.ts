// services/valorisation/valoriser.ts
//
// [PTF-L1D-VALORISATION] Le moteur de valorisation du grand livre : ce que vaut le portefeuille à une
// date, et d'où vient sa variation entre deux dates. PUR — ni horloge, ni réseau, ni store : la date
// est un ARGUMENT, le livre et le magasin de marché aussi. Il vit sous `services/` pour être embarqué
// tel quel par l'app, le serveur MCP et la tâche serveur (le Dockerfile du MCP ne copie que
// `services/`, `utils/`, `types.ts`, `constants.ts`), et remplacera les trois producteurs actuels du
// passé (`buildMarketData`, `reconstructPortfolioHistory`, `dailyPastLedger`) au lot 1e.
//
// Ce que le module garantit, et pourquoi :
//  1. UN TOTAL AMPUTÉ EST UN FAUX. Si un seul titre détenu n'a pas de cours servable, si un seul taux
//     manque, ou si le livre porte un événement écarté (`anomalies` de `etatDuLivreAu`), le total vaut
//     `null` et la liste `manquants` dit pourquoi — jamais la somme des seules lignes lisibles.
//  2. AUCUN ARRONDI. Les valeurs sortent en flottants non arrondis ; l'arrondi est l'affaire de
//     l'affichage (`formatCAD`). Arrondir ligne par ligne ferait mentir l'identité de la variation de
//     quelques cents par ligne (mesuré au Lot 0 : 0,041 $ sur douze lignes).
//  3. ZÉRO ARTEFACT. La variation se décompose en effet de COURS, effet de CHANGE et MOUVEMENTS (ce qui
//     entre ou sort du livre, valorisé à la date de fin). Un jour où ni les cours ni les taux ne
//     bougent, les effets de cours et de change valent 0 EXACTEMENT, quels que soient les mouvements —
//     un achat, un transfert en transit ou un fractionnement ne se lisent jamais comme une performance.
//     ⚠️ Le fractionnement est le piège : le cours BRUT tombe (100 → 10) pendant que la quantité monte
//     (×10). La quantité de départ et le cours de départ sont donc exprimés dans l'unité d'APRÈS le
//     fractionnement avant de calculer l'effet de cours ; sinon un 10:1 serait une chute de 90 %
//     compensée par un « mouvement » de +900 %.
//  4. Le « reporté » vient du magasin (`clotureAu`/`tauxAu`) : il est calculé à la lecture, jamais
//     écrit, et l'âge maximal est un argument REQUIS — un défaut ici serait un seuil inventé.
import type { BrokerLedgerAccountId, BrokerLedgerCurrency, BrokerLedgerEvent } from '../../types';
import { etatDuLivreAu, type AnomalieLivre } from '../grandLivre/etatDuLivre';
import { clotureAu, tauxAu, type MagasinMarche, type LectureAuJour, type LectureTauxAuJour } from '../marche/magasinMarche';

/** Une ligne de titres valorisée. `cours` en devise de cotation, `taux` = CAD par unité de devise. */
interface LigneTitres {
    compte: BrokerLedgerAccountId;
    isin: string;
    quantite: number;
    devise: BrokerLedgerCurrency;
    cours: number;
    taux: number;
    /** `quantite × cours × taux`, non arrondi. */
    valeurCad: number;
    /** Provenance du cours et du taux, pour qu'un écran puisse dire « reporté de 2 j » ou « secours ». */
    statutCours: LectureAuJour['statut'];
    statutTaux: LectureTauxAuJour['statut'];
}

/** Une encaisse valorisée (compte × devise). */
interface LigneEspeces {
    compte: BrokerLedgerAccountId;
    devise: BrokerLedgerCurrency;
    montant: number;
    taux: number;
    valeurCad: number;
    statutTaux: LectureTauxAuJour['statut'];
}

/** Pourquoi le total n'est pas publié. Chaque cause nomme ce qui manque, sans aucun montant. */
type Manquant =
    | { type: 'cours'; compte: BrokerLedgerAccountId; isin: string; statut: 'absente' | 'perimee' }
    | { type: 'taux'; devise: BrokerLedgerCurrency; statut: 'absente' | 'perimee' }
    | { type: 'livre'; anomalie: AnomalieLivre };

export interface Valorisation {
    date: string;
    titres: LigneTitres[];
    especes: LigneEspeces[];
    /** Somme en CAD, ou `null` dès qu'il manque quelque chose (garantie 1). */
    totalCad: number | null;
    manquants: Manquant[];
}

const servable = (l: LectureTauxAuJour): l is Extract<LectureTauxAuJour, { valeur: number }> => 'valeur' in l;

/**
 * Valeur du livre à la date `date` (événements du jour INCLUS). `null` si le livre n'a jamais été
 * importé (tri-état : on ne fabrique pas un portefeuille vide). `ageMaxJours` est REQUIS.
 */
export function valoriserAu(
    livre: readonly BrokerLedgerEvent[] | undefined,
    magasin: MagasinMarche,
    date: string,
    ageMaxJours: number,
): Valorisation | null {
    const etat = etatDuLivreAu(livre, date);
    if (etat === null) return null;
    const manquants: Manquant[] = etat.anomalies.map((anomalie) => ({ type: 'livre' as const, anomalie }));
    const tauxVus = new Map<BrokerLedgerCurrency, LectureTauxAuJour>();
    const lireTaux = (devise: BrokerLedgerCurrency): LectureTauxAuJour => {
        let l = tauxVus.get(devise);
        if (!l) {
            l = tauxAu(magasin, devise, date, ageMaxJours);
            tauxVus.set(devise, l);
            if (!servable(l)) manquants.push({ type: 'taux', devise, statut: l.statut as 'absente' | 'perimee' });
        }
        return l;
    };

    const titres: LigneTitres[] = [];
    for (const [compte, parIsin] of entreesTriees(etat.positions)) {
        for (const [isin, quantite] of entreesTriees(parIsin)) {
            const serie = magasin.clotures[isin];
            const cours = clotureAu(serie, date, ageMaxJours);
            // Le taux se lit même si le cours manque : `manquants` doit dire TOUT ce qui manque, sinon
            // compléter le cours révélerait le taux au passage suivant — une réparation en deux temps.
            const taux = serie ? lireTaux(serie.devise) : null;
            if (!serie || !('valeur' in cours)) {
                // `clotureAu(undefined)` rend `absente` : une série inconnue et une série vide se disent pareil.
                manquants.push({ type: 'cours', compte, isin, statut: 'valeur' in cours ? 'absente' : cours.statut });
                continue;
            }
            if (!taux || !servable(taux)) continue;
            titres.push({
                compte, isin, quantite, devise: serie.devise, cours: cours.valeur, taux: taux.valeur,
                valeurCad: quantite * cours.valeur * taux.valeur, statutCours: cours.statut, statutTaux: taux.statut,
            });
        }
    }

    const especes: LigneEspeces[] = [];
    for (const [compte, parDevise] of entreesTriees(etat.especes)) {
        for (const [devise, montant] of entreesTriees(parDevise)) {
            if (montant === 0) continue;
            const taux = lireTaux(devise);
            if (!servable(taux)) continue;
            especes.push({ compte, devise, montant, taux: taux.valeur, valeurCad: montant * taux.valeur, statutTaux: taux.statut });
        }
    }

    const totalCad = manquants.length > 0
        ? null
        : titres.reduce((s, l) => s + l.valeurCad, 0) + especes.reduce((s, l) => s + l.valeurCad, 0);
    return { date, titres, especes, totalCad, manquants };
}

/** Décomposition d'une variation entre deux dates (garantie 3). Somme des trois = `fin − debut`. */
interface Variation {
    debut: Valorisation;
    fin: Valorisation;
    /** Titres détenus au début (exprimés dans l'unité de la fin) × variation du cours × taux du début. */
    effetCours: number;
    /** Titres détenus au début × cours de fin × variation du taux, plus encaisse de début × variation du taux. */
    effetChange: number;
    /** Ce qui est entré ou sorti du livre entre les deux dates, valorisé aux cours et taux de FIN. */
    mouvements: number;
}

export type ResultatVariation =
    | { statut: 'ok'; variation: Variation }
    /** Le livre n'a jamais été importé. */
    | { statut: 'jamais-importe' }
    /** Une des deux valorisations est incomplète : pas de variation, ses `manquants` disent pourquoi. */
    | { statut: 'incomplete'; debut: Valorisation; fin: Valorisation };

/**
 * Variation entre `debut` (exclu des mouvements) et `fin` (inclus). Lève si `debut > fin` (erreur de
 * l'appelant). Un fractionnement de la fenêtre ré-exprime la position de départ (garantie 3).
 */
export function variationEntre(
    livre: readonly BrokerLedgerEvent[] | undefined,
    magasin: MagasinMarche,
    debut: string,
    fin: string,
    ageMaxJours: number,
): ResultatVariation {
    if (debut > fin) throw new Error('variationEntre : début après la fin');
    const v0 = valoriserAu(livre, magasin, debut, ageMaxJours);
    const v1 = valoriserAu(livre, magasin, fin, ageMaxJours);
    if (v0 === null || v1 === null) return { statut: 'jamais-importe' };
    if (v0.totalCad === null || v1.totalCad === null) return { statut: 'incomplete', debut: v0, fin: v1 };

    const ratio = ratiosDeFractionnement(livre ?? [], debut, fin);
    const cle = (compte: string, x: string): string => `${compte}\u0000${x}`;
    const fin1 = new Map(v1.titres.map((l) => [cle(l.compte, l.isin), l]));
    const esp1 = new Map(v1.especes.map((l) => [cle(l.compte, l.devise), l]));

    let effetCours = 0;
    let effetChange = 0;
    for (const l0 of v0.titres) {
        const r = ratio.get(cle(l0.compte, l0.isin)) ?? 1;
        const q0 = l0.quantite * r;
        const p0 = l0.cours / r;
        const l1 = fin1.get(cle(l0.compte, l0.isin));
        // Titre sorti du livre avant la fin : son cours de fin n'est pas lu (il peut ne plus être
        // servi). Tout son écart est un mouvement — il n'a pas eu de performance À NOUS.
        if (!l1) continue;
        effetCours += q0 * (l1.cours - p0) * l0.taux;
        effetChange += q0 * l1.cours * (l1.taux - l0.taux);
    }
    for (const e0 of v0.especes) {
        const e1 = esp1.get(cle(e0.compte, e0.devise));
        if (!e1) continue;
        effetChange += e0.montant * (e1.taux - e0.taux);
    }
    const mouvements = (v1.totalCad - v0.totalCad) - effetCours - effetChange;
    return { statut: 'ok', variation: { debut: v0, fin: v1, effetCours, effetChange, mouvements } };
}

/** compte × ISIN → produit des ratios (`splitTo / splitFrom`) des fractionnements de ]debut, fin]. */
function ratiosDeFractionnement(livre: readonly BrokerLedgerEvent[], debut: string, fin: string): Map<string, number> {
    const ratios = new Map<string, number>();
    for (const e of livre) {
        if (e.kind !== 'fractionnement' || !(e.date > debut && e.date <= fin)) continue;
        const k = `${e.accountId}\u0000${e.isin}`;
        ratios.set(k, (ratios.get(k) ?? 1) * (e.splitTo / e.splitFrom));
    }
    return ratios;
}

/** Entrées d'un enregistrement partiel, triées par clé : un ordre stable rend la sortie comparable. */
function entreesTriees<K extends string, V>(o: Partial<Record<K, V>>): [K, V][] {
    return (Object.entries(o) as [K, V][]).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
