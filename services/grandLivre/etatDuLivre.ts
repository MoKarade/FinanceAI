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
//   5. UNE ANNULATION RETIRE, ELLE NE DÉFAIT PAS : la ligne annulée reste dans le livre et cesse
//      d'avoir un effet À PARTIR de la date de l'annulation. L'état est recalculé depuis le début à
//      chaque date, donc « retirer » suffit — défaire une vente (remettre des titres, reprendre des
//      espèces) serait un second calcul, qui pourrait diverger du premier.
//   6. UNE CONVERSION OU UN VIREMENT EST UN SEUL ÉVÉNEMENT : les deux comptes bougent ensemble ou pas
//      du tout. Une moitié écrite seule ferait apparaître ou disparaître de l'argent.
import type { BrokerLedgerAccountId, BrokerLedgerCurrency, BrokerLedgerEvent } from '../../types';

/** Devise de RÈGLEMENT de chaque compte du courtier. `hors-courtier` accepte toute devise. */
const DEVISE_DU_COMPTE: Partial<Record<BrokerLedgerAccountId, BrokerLedgerCurrency>> = {
    'courtier-cad': 'CAD',
    'courtier-usd': 'USD',
};

/** Tolérance sur une quantité : un titre fractionnaire (CDR, fraction) peut porter des décimales, et
 *  un fractionnement divise des flottants. En dessous de ce seuil, un reste n'est pas une position. */
const EPSILON_QUANTITE = 1e-9;

export type AnomalieLivre =
    | { type: 'valeur-non-finie'; id: string; champ: string }
    /** Le sens est porté par `kind`, jamais par un signe (contrat du schéma, lot 1a) : une valeur nulle
     *  ou négative est un import qui a mal lu sa ligne, pas une opération à inverser. */
    | { type: 'valeur-non-positive'; id: string; champ: string }
    | { type: 'date-invalide'; id: string }
    | { type: 'identifiant-en-double'; id: string }
    | { type: 'quantite-negative'; id: string; isin: string; compte: BrokerLedgerAccountId }
    | { type: 'devise-hors-compte'; id: string; compte: BrokerLedgerAccountId; devise: string }
    | { type: 'fractionnement-invalide'; id: string }
    | { type: 'sorte-inconnue'; id: string }
    /** Le relevé imprime un coût total ET un coût unitaire : lequel fait foi n'est pas à deviner. */
    | { type: 'cout-ambigu'; id: string }
    | { type: 'annulation-invalide'; id: string; raison: 'cible-absente' | 'cible-ambigue' | 'cible-posterieure' | 'cible-annulation' | 'compte-different' | 'deja-annulee' }
    | { type: 'echange-invalide'; id: string }
    /** Un échange imprimé sur des titres que le livre ne détient pas : un import antérieur manque. */
    | { type: 'echange-sans-position'; id: string; isin: string; compte: BrokerLedgerAccountId }
    | { type: 'transfert-interne-invalide'; id: string; raison: 'meme-compte' | 'meme-devise' };

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

/** Rang d'un événement DANS une journée : fractionnement et échange d'abord (point 3 de l'en-tête). */
const rangDansLaJournee = (e: BrokerLedgerEvent): number => (e.kind === 'fractionnement' || e.kind === 'echange' ? 0 : 1);

/**
 * Identifiants des lignes ANNULÉES à la date `date` (point 5 de l'en-tête), plus les annulations
 * refusées. Une annulation n'est lue que si elle est datée au plus tard à `date`. Exporté : le moteur
 * de valorisation doit ignorer les mêmes lignes quand il suit un fractionnement ou un échange.
 */
export function annulationsAu(
    livre: readonly BrokerLedgerEvent[],
    date: string,
): { annules: Set<string>; refusees: AnomalieLivre[] } {
    const annules = new Set<string>();
    const refusees: AnomalieLivre[] = [];
    const parId = new Map<string, BrokerLedgerEvent[]>();
    for (const e of livre) {
        if (typeof e?.id !== 'string') continue;
        const liste = parId.get(e.id);
        if (liste) liste.push(e); else parId.set(e.id, [e]);
    }
    const annulations = livre
        .filter((e) => e?.kind === 'annulation' && typeof e.date === 'string' && DATE_ISO.test(e.date) && e.date <= date)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    for (const a of annulations) {
        if (a.kind !== 'annulation') continue;
        const refuser = (raison: Extract<AnomalieLivre, { type: 'annulation-invalide' }>['raison']): void => {
            refusees.push({ type: 'annulation-invalide', id: a.id, raison });
        };
        const cibles = parId.get(a.cancelsId) ?? [];
        if (cibles.length === 0) { refuser('cible-absente'); continue; }
        if (cibles.length > 1) { refuser('cible-ambigue'); continue; }
        const cible = cibles[0];
        if (cible.kind === 'annulation') { refuser('cible-annulation'); continue; }
        if (!(typeof cible.date === 'string' && cible.date <= a.date)) { refuser('cible-posterieure'); continue; }
        if (cible.accountId !== a.accountId) { refuser('compte-different'); continue; }
        if (annules.has(a.cancelsId)) { refuser('deja-annulee'); continue; }
        annules.add(a.cancelsId);
    }
    return { annules, refusees };
}

/**
 * État du livre à la date `date` (incluse). `null` si le livre n'a jamais été importé.
 * L'ordre du tableau reçu n'importe pas : les événements sont triés par date, fractionnement
 * d'abord dans une journée, puis dans l'ordre reçu (tri stable).
 */
export function etatDuLivreAu(livre: readonly BrokerLedgerEvent[] | undefined, date: string): EtatDuLivre | null {
    if (livre === undefined) return null;
    const { annules, refusees } = annulationsAu(livre, date);
    const anomalies: AnomalieLivre[] = [...refusees];
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
            // Une annulation n'a pas d'effet propre (elle est lue par `annulationsAu`), et une ligne
            // annulée n'en a plus. Les deux restent dans le livre.
            return e.date <= date && e.kind !== 'annulation' && !annules.has(e.id);
        })
        .sort((a, b) => (a.e.date < b.e.date ? -1 : a.e.date > b.e.date ? 1 : rangDansLaJournee(a.e) - rangDansLaJournee(b.e) || a.i - b.i))
        .map(({ e }) => e);

    for (const e of ordonnes) {
        if (idsVus.has(e.id)) { anomalies.push({ type: 'identifiant-en-double', id: e.id }); continue; }
        idsVus.add(e.id);

        // Un montant doit être fini, positif ET réglé dans la devise de SON compte (hors-courtier : libre).
        const montantValide = (
            champ: 'amount' | 'toAmount' = 'amount',
            compte: BrokerLedgerAccountId = e.accountId,
        ): number | null => {
            const m = champ in e ? (e as { [k in typeof champ]?: { value: unknown; currency: unknown } })[champ] : undefined;
            if (!m || !estFini(m.value)) { anomalies.push({ type: 'valeur-non-finie', id: e.id, champ }); return null; }
            if (m.value <= 0) { anomalies.push({ type: 'valeur-non-positive', id: e.id, champ }); return null; }
            const attendue = DEVISE_DU_COMPTE[compte];
            if (attendue && m.currency !== attendue) {
                anomalies.push({ type: 'devise-hors-compte', id: e.id, compte, devise: String(m.currency) });
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
        // Coût d'une ligne de titres : unitaire OU total, jamais les deux, et fini s'il est présent.
        // Le coût n'entre pas dans l'état (quantités, espèces) — mais une ligne mal lue ne passe pas.
        const coutValide = (): boolean => {
            const prix = 'price' in e ? e.price : undefined;
            const total = 'cost' in e ? e.cost : undefined;
            if (prix !== undefined && total !== undefined) { anomalies.push({ type: 'cout-ambigu', id: e.id }); return false; }
            for (const [champ, m] of [['price', prix], ['cost', total]] as const) {
                if (m === undefined) continue;
                if (!estFini(m?.value)) { anomalies.push({ type: 'valeur-non-finie', id: e.id, champ }); return false; }
                if (m.value <= 0) { anomalies.push({ type: 'valeur-non-positive', id: e.id, champ }); return false; }
            }
            return true;
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
                if (q !== null && coutValide()) poserQuantite(e.accountId, e.isin, quantite(e.accountId, e.isin) + q);
                break;
            }
            case 'transfert-sortant': {
                const q = quantiteValide();
                if (q !== null && coutValide()) retirer(e.isin, q);
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
            case 'echange': {
                if (!estFini(e.splitFrom) || !estFini(e.splitTo) || e.splitFrom <= 0 || e.splitTo <= 0
                    || typeof e.toIsin !== 'string' || e.toIsin === e.isin) {
                    anomalies.push({ type: 'echange-invalide', id: e.id });
                    break;
                }
                const avant = quantite(e.accountId, e.isin);
                if (avant === 0) {
                    anomalies.push({ type: 'echange-sans-position', id: e.id, isin: e.isin, compte: e.accountId });
                    break;
                }
                poserQuantite(e.accountId, e.isin, 0);
                poserQuantite(e.accountId, e.toIsin, quantite(e.accountId, e.toIsin) + (avant * e.splitTo) / e.splitFrom);
                break;
            }
            case 'conversion':
            case 'virement-interne': {
                if (e.toAccountId === e.accountId) {
                    anomalies.push({ type: 'transfert-interne-invalide', id: e.id, raison: 'meme-compte' });
                    break;
                }
                const sortie = montantValide('amount', e.accountId);
                if (sortie === null) break;
                if (e.kind === 'virement-interne') {
                    // Même montant des deux côtés : la devise doit être admise par le compte d'arrivée aussi.
                    const attendue = DEVISE_DU_COMPTE[e.toAccountId];
                    if (attendue && e.amount.currency !== attendue) {
                        anomalies.push({ type: 'devise-hors-compte', id: e.id, compte: e.toAccountId, devise: String(e.amount.currency) });
                        break;
                    }
                    bougerEspeces(e.accountId, e.amount.currency, -sortie);
                    bougerEspeces(e.toAccountId, e.amount.currency, sortie);
                    break;
                }
                const entree = montantValide('toAmount', e.toAccountId);
                if (entree === null) break;
                if (e.toAmount.currency === e.amount.currency) {
                    anomalies.push({ type: 'transfert-interne-invalide', id: e.id, raison: 'meme-devise' });
                    break;
                }
                if (e.rate !== undefined && (!estFini(e.rate) || e.rate <= 0)) {
                    anomalies.push({ type: estFini(e.rate) ? 'valeur-non-positive' : 'valeur-non-finie', id: e.id, champ: 'rate' });
                    break;
                }
                bougerEspeces(e.accountId, e.amount.currency, -sortie);
                bougerEspeces(e.toAccountId, e.toAmount.currency, entree);
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
