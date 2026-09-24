// services/import/disnat/versEvenements.ts
//
// [PTF-L1F-PARSEUR-DISNAT] Traduction d'un relevé Disnat lu (`lireReleveDisnat`) en événements du
// grand livre. PUR : la correspondance description → ISIN, la devise de cotation d'un titre et la
// quantité détenue avant une date sont des ARGUMENTS (le référentiel et le livre vivent ailleurs).
//
// Ce que ce module garantit :
//   1. RIEN N'EST DEVINÉ. Un titre que la correspondance ne reconnaît pas, une opération inconnue, un
//      montant au signe inattendu, un fractionnement sur une position nulle : REFUS nommé (numéro de
//      ligne, jamais le texte). L'import (lot 1g) montre ces refus à Marc avant d'écrire quoi que ce soit.
//   2. LE SIGNE DEVIENT UN `kind`, UNE FOIS : un achat doit être imprimé négatif, un dividende positif,
//      etc. Un signe contraire n'est pas « corrigé » par une valeur absolue : il est refusé.
//   3. IDENTIFIANTS STABLES : `disnat:<date d'arrêté>:<compte>:<rang>` — réimporter le même relevé
//      donne les mêmes identifiants, donc un import idempotent.
//   4. LE FRACTIONNEMENT IMPRIMÉ est une quantité REÇUE (« 54 » pour 6 titres devenus 60) : il devient
//      `splitFrom = détenu`, `splitTo = détenu + reçu`, ce qui exige la position d'avant.
import type { BrokerLedgerCurrency, BrokerLedgerEvent } from '../../../types';
import type { CompteDisnat, OperationDisnat, ReleveDisnat } from './lireReleveDisnat';

export interface Correspondances {
    /** ISIN du titre décrit ainsi sur le relevé, ou `undefined` s'il n'est pas au référentiel. */
    isinDe: (description: string) => string | undefined;
    /** Devise de COTATION du titre (celle du prix d'un achat ou d'une vente). */
    deviseDe: (isin: string) => BrokerLedgerCurrency | undefined;
    /** Quantité détenue dans ce compte JUSTE AVANT cette date (événements du jour exclus). */
    detenuAvant: (compte: CompteDisnat, isin: string, date: string) => number;
}

type RefusTraduction =
    | { type: 'operation-inconnue'; ligne: number }
    | { type: 'titre-inconnu'; ligne: number }
    | { type: 'devise-de-cotation-inconnue'; ligne: number }
    | { type: 'champ-manquant'; ligne: number; champ: 'quantite' | 'prix' | 'montant' }
    | { type: 'signe-inattendu'; ligne: number }
    | { type: 'fractionnement-sans-position'; ligne: number };

const DEVISE_DU_COMPTE: Record<CompteDisnat, BrokerLedgerCurrency> = { 'courtier-cad': 'CAD', 'courtier-usd': 'USD' };

/** Sens attendu du montant imprimé, par sorte : l'entrée d'argent est positive. */
const SIGNE: Partial<Record<NonNullable<OperationDisnat['sorte']>, 1 | -1>> = {
    achat: -1, vente: 1, dividende: 1, 'retenue-impot': -1, 'impot-non-resident': -1, frais: -1, depot: 1,
};

export function versEvenements(
    releve: ReleveDisnat,
    c: Correspondances,
): { evenements: BrokerLedgerEvent[]; refus: RefusTraduction[] } {
    const evenements: BrokerLedgerEvent[] = [];
    const refus: RefusTraduction[] = [];
    const source = { kind: 'releve-courtier' as const, date: releve.dateArrete };

    for (const compte of releve.comptes) {
        const deviseCompte = DEVISE_DU_COMPTE[compte.compte];
        compte.operations.forEach((o, rang) => {
            const base = { id: `disnat:${releve.dateArrete}:${compte.compte}:${rang + 1}`, date: o.dateTransaction, accountId: compte.compte, source };
            if (o.sorte === null) { refus.push({ type: 'operation-inconnue', ligne: o.ligne }); return; }
            const manque = (champ: 'quantite' | 'prix' | 'montant'): void => { refus.push({ type: 'champ-manquant', ligne: o.ligne, champ }); };

            // Montant : présent, au bon signe, converti en valeur positive (le sens passe dans `kind`).
            const signe = SIGNE[o.sorte];
            let montant: number | undefined;
            if (signe !== undefined) {
                if (o.montant === undefined) { manque('montant'); return; }
                if (Math.sign(o.montant) !== signe) { refus.push({ type: 'signe-inattendu', ligne: o.ligne }); return; }
                montant = signe * o.montant;
            }
            const argent = (): { value: number; currency: BrokerLedgerCurrency } => ({ value: montant as number, currency: deviseCompte });

            if (o.sorte === 'frais' || o.sorte === 'depot') {
                evenements.push({ ...base, kind: o.sorte === 'frais' ? 'frais' : 'depot-especes', amount: argent() });
                return;
            }
            // Toutes les autres sortes portent sur un titre.
            const isin = c.isinDe(o.description);
            if (isin === undefined) { refus.push({ type: 'titre-inconnu', ligne: o.ligne }); return; }

            switch (o.sorte) {
                case 'transfert-recu':
                    if (o.quantite === undefined) { manque('quantite'); return; }
                    evenements.push({ ...base, kind: 'transfert-entrant', isin, quantity: o.quantite });
                    return;
                case 'achat':
                case 'vente': {
                    if (o.quantite === undefined) { manque('quantite'); return; }
                    if (o.prix === undefined) { manque('prix'); return; }
                    const devisePrix = c.deviseDe(isin);
                    if (devisePrix === undefined) { refus.push({ type: 'devise-de-cotation-inconnue', ligne: o.ligne }); return; }
                    evenements.push({ ...base, kind: o.sorte, isin, quantity: o.quantite, price: { value: o.prix, currency: devisePrix }, amount: argent() });
                    return;
                }
                case 'dividende':
                    evenements.push({ ...base, kind: 'dividende', isin, amount: argent() });
                    return;
                case 'retenue-impot':
                case 'impot-non-resident':
                    evenements.push({ ...base, kind: 'retenue-etrangere', isin, amount: argent() });
                    return;
                case 'fractionnement': {
                    if (o.quantite === undefined) { manque('quantite'); return; }
                    const detenu = c.detenuAvant(compte.compte, isin, o.dateTransaction);
                    if (!(detenu > 0)) { refus.push({ type: 'fractionnement-sans-position', ligne: o.ligne }); return; }
                    evenements.push({ ...base, kind: 'fractionnement', isin, splitFrom: detenu, splitTo: detenu + o.quantite });
                    return;
                }
            }
        });
    }
    return { evenements, refus };
}
