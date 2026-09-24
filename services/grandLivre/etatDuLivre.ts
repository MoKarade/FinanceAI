// services/grandLivre/etatDuLivre.ts
//
// [PTF-L1B-LIVRE-PUR] Positions (quantités) et encaisse de chaque compte du grand livre courtier, à
// une date donnée, par devise NATIVE. Module PUR : aucune horloge, aucun I/O, aucune valorisation
// (le prix d'un titre est l'affaire du moteur de valorisation, lot 1d). Importé par l'app, le
// serveur MCP et la tâche planifiée : il ne doit rien importer de navigateur.
//
// Ce que ce module garantit, et pourquoi chaque point existe :
//   1. TRI-ÉTAT : un livre `undefined` (jamais importé) rend `null`, jamais un état vide. `[]` rend un
//      état vide. Confondre les deux ferait afficher « 0 $ de titres » à qui n'a jamais importé.
//   2. ESPÈCES EN CENTS ENTIERS : chaque montant est converti en cents une fois, puis additionné en
//      entiers. `0,1 + 0,2` ne vaut pas `0,3` en flottant ; l'encaisse d'un courtier se rapproche au
//      cent près d'un relevé, donc une somme flottante fabriquerait des écarts d'un cent.
//   3. ORDRE D'UNE JOURNÉE : un fractionnement s'applique AVANT les autres opérations du même jour —
//      un achat daté du jour de l'ex-date est déjà en titres post-fractionnement. Sans cette règle,
//      l'ordre d'import décidait de la quantité.
//   4. REFUS, JAMAIS CORRECTION : une valeur non finie, une quantité négative à la sortie, une devise
//      de règlement étrangère au compte, un identifiant en double sont RAPPORTÉS (`anomalies`) et
//      l'événement fautif est écarté. On ne coerce rien, on ne complète rien.
import type { BrokerLedgerAccountId, BrokerLedgerCurrency, BrokerLedgerEvent } from '../../types';

/** Devise de RÈGLEMENT de chaque compte du courtier. `hors-courtier` accepte toute devise. */
const DEVISE_DU_COMPTE: Partial<Record<BrokerLedgerAccountId, BrokerLedgerCurrency>> = {
    'courtier-cad': 'CAD',
    'courtier-usd': 'USD',
};

/** Tolérance sur une quantité : un titre fractionnaire (CDR, fraction) peut porter des décimales, et
 *  un fractionnement divise des flottants. En dessous de ce seuil, un reste n'est pas une position. */
const EPSILON_QUANTITE = 1e-9;

type AnomalieLivre =
    | { type: 'valeur-non-finie'; id: string; champ: string }
    /** Le sens est porté par `kind`, jamais par un signe (contrat du schéma, lot 1a) : une valeur nulle
     *  ou négative est un import qui a mal lu sa ligne, pas une opération à inverser. */
    | { type: 'valeur-non-positive'; id: string; champ: string }
    | { type: 'date-invalide'; id: string }
    | { type: 'identifiant-en-double'; id: string }
    | { type: 'quantite-negative'; id: string; isin: string; compte: BrokerLedgerAccountId }
    | { type: 'devise-hors-compte'; id: string; compte: BrokerLedgerAccountId; devise: string }
    | { type: 'fractionnement-invalide'; id: string }
    | { type: 'sorte-inconnue'; id: string };

export interface EtatDuLivre {
    /** Date d'arrêté (`YYYY-MM-DD`) : les événements de ce jour sont INCLUS. */
    date: string;
    /** compte → ISIN → quantité détenue (les positions nulles sont omises). */
    positions: Partial<Record<BrokerLedgerAccountId, Record<string, number>>>;
    /** compte → devise → encaisse, en DOLLARS (arrondie au cent par construction). */
    especes: Partial<Record<BrokerLedgerAccountId, Partial<Record<BrokerLedgerCurrency, number>>>>;
    /** Événements écartés, avec la raison. Vide si le livre est sain. */
    anomalies: AnomalieLivre[];
}

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const enCents = (valeur: number): number => Math.round(valeur * 100);
const estFini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Rang d'un événement DANS une journée : le fractionnement d'abord (point 3 de l'en-tête). */
const rangDansLaJournee = (e: BrokerLedgerEvent): number => (e.kind === 'fractionnement' ? 0 : 1);

/**
 * État du livre à la date `date` (incluse). `null` si le livre n'a jamais été importé.
 * L'ordre du tableau reçu n'importe pas : les événements sont triés par date, fractionnement
 * d'abord dans une journée, puis dans l'ordre reçu (tri stable).
 */
export function etatDuLivreAu(livre: readonly BrokerLedgerEvent[] | undefined, date: string): EtatDuLivre | null {
    if (livre === undefined) return null;
    const anomalies: AnomalieLivre[] = [];
    const quantites = new Map<BrokerLedgerAccountId, Map<string, number>>();
    const cents = new Map<BrokerLedgerAccountId, Map<BrokerLedgerCurrency, number>>();
    const idsVus = new Set<string>();

    const quantite = (compte: BrokerLedgerAccountId, isin: string): number => quantites.get(compte)?.get(isin) ?? 0;
    const poserQuantite = (compte: BrokerLedgerAccountId, isin: string, q: number): void => {
        let parIsin = quantites.get(compte);
        if (!parIsin) { parIsin = new Map(); quantites.set(compte, parIsin); }
        parIsin.set(isin, Math.abs(q) < EPSILON_QUANTITE ? 0 : q);
    };
    const bougerEspeces = (compte: BrokerLedgerAccountId, devise: BrokerLedgerCurrency, deltaCents: number): void => {
        let parDevise = cents.get(compte);
        if (!parDevise) { parDevise = new Map(); cents.set(compte, parDevise); }
        parDevise.set(devise, (parDevise.get(devise) ?? 0) + deltaCents);
    };

    // Tri stable : date, puis rang dans la journée, puis ordre reçu.
    const ordonnes = livre
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => {
            if (typeof e?.date !== 'string' || !DATE_ISO.test(e.date)) {
                anomalies.push({ type: 'date-invalide', id: String(e?.id) });
                return false;
            }
            return e.date <= date;
        })
        .sort((a, b) => (a.e.date < b.e.date ? -1 : a.e.date > b.e.date ? 1 : rangDansLaJournee(a.e) - rangDansLaJournee(b.e) || a.i - b.i))
        .map(({ e }) => e);

    for (const e of ordonnes) {
        if (idsVus.has(e.id)) { anomalies.push({ type: 'identifiant-en-double', id: e.id }); continue; }
        idsVus.add(e.id);

        // Un montant doit être fini ET réglé dans la devise du compte (hors-courtier : libre).
        const montantValide = (): number | null => {
            const m = 'amount' in e ? e.amount : undefined;
            if (!m || !estFini(m.value)) { anomalies.push({ type: 'valeur-non-finie', id: e.id, champ: 'amount' }); return null; }
            if (m.value <= 0) { anomalies.push({ type: 'valeur-non-positive', id: e.id, champ: 'amount' }); return null; }
            const attendue = DEVISE_DU_COMPTE[e.accountId];
            if (attendue && m.currency !== attendue) {
                anomalies.push({ type: 'devise-hors-compte', id: e.id, compte: e.accountId, devise: String(m.currency) });
                return null;
            }
            return enCents(m.value);
        };
        const quantiteValide = (): number | null => {
            const q = 'quantity' in e ? e.quantity : undefined;
            if (!estFini(q)) { anomalies.push({ type: 'valeur-non-finie', id: e.id, champ: 'quantity' }); return null; }
            if (q <= 0) { anomalies.push({ type: 'valeur-non-positive', id: e.id, champ: 'quantity' }); return null; }
            return q;
        };
        // Retire `q` titres ; refuse (sans rien écrire) si la position deviendrait négative.
        const retirer = (isin: string, q: number): boolean => {
            const reste = quantite(e.accountId, isin) - q;
            if (reste < -EPSILON_QUANTITE) {
                anomalies.push({ type: 'quantite-negative', id: e.id, isin, compte: e.accountId });
                return false;
            }
            poserQuantite(e.accountId, isin, reste);
            return true;
        };

        switch (e.kind) {
            case 'acquisition':
            case 'transfert-entrant': {
                const q = quantiteValide();
                if (q !== null) poserQuantite(e.accountId, e.isin, quantite(e.accountId, e.isin) + q);
                break;
            }
            case 'transfert-sortant': {
                const q = quantiteValide();
                if (q !== null) retirer(e.isin, q);
                break;
            }
            case 'achat': {
                const q = quantiteValide();
                const c = q === null ? null : montantValide();
                if (q !== null && c !== null) {
                    poserQuantite(e.accountId, e.isin, quantite(e.accountId, e.isin) + q);
                    bougerEspeces(e.accountId, e.amount.currency, -c);
                }
                break;
            }
            case 'vente': {
                const q = quantiteValide();
                const c = q === null ? null : montantValide();
                // La quantité est vérifiée AVANT de créditer les espèces : une vente refusée ne
                // doit laisser AUCUNE trace, sinon l'encaisse monterait pour des titres jamais détenus.
                if (q !== null && c !== null && retirer(e.isin, q)) bougerEspeces(e.accountId, e.amount.currency, c);
                break;
            }
            case 'fractionnement': {
                if (!estFini(e.splitFrom) || !estFini(e.splitTo) || e.splitFrom <= 0 || e.splitTo <= 0) {
                    anomalies.push({ type: 'fractionnement-invalide', id: e.id });
                    break;
                }
                // Le fractionnement porte sur la position du compte de l'événement, et sur elle seule.
                const avant = quantite(e.accountId, e.isin);
                if (avant !== 0) poserQuantite(e.accountId, e.isin, (avant * e.splitTo) / e.splitFrom);
                break;
            }
            case 'dividende':
            case 'depot-especes': {
                const c = montantValide();
                if (c !== null) bougerEspeces(e.accountId, e.amount.currency, c);
                break;
            }
            case 'retenue-etrangere':
            case 'retrait-especes':
            case 'frais': {
                const c = montantValide();
                if (c !== null) bougerEspeces(e.accountId, e.amount.currency, -c);
                break;
            }
            default:
                anomalies.push({ type: 'sorte-inconnue', id: String((e as { id?: unknown }).id) });
        }
    }

    const positions: EtatDuLivre['positions'] = {};
    for (const [compte, parIsin] of quantites) {
        const garde = Object.fromEntries([...parIsin].filter(([, q]) => q !== 0));
        if (Object.keys(garde).length > 0) positions[compte] = garde;
    }
    const especes: EtatDuLivre['especes'] = {};
    for (const [compte, parDevise] of cents) {
        especes[compte] = Object.fromEntries([...parDevise].map(([d, c]) => [d, c / 100]));
    }
    return { date, positions, especes, anomalies };
}
