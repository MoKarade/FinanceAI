// services/fintable/syncCore.ts
//
// [FINTABLE-7] Cœur d'orchestration PARTAGÉ entre les deux exécutions d'une passe Fintable :
//   - `mcp/runFintableSync.ts`      — serveur (Cloud Run + cron), état porté par le Drive avec OCC ;
//   - `services/fintable/browserSync.ts` — navigateur, état rendu à l'appelant.
//
// POURQUOI ce module existe (finding code-reviewer, PR #535) : les deux orchestrateurs copiaient
// verbatim le plafonnement de la bascule ET la boucle d'application isolée — or ces deux blocs SONT
// des correctifs de panel (PR #531 : une transaction mal datée gelait l'import en silence ; une
// dette à 0 $ avortait toute la passe). Un futur correctif appliqué à UNE seule copie laisserait
// l'autre chemin bogué sans que rien ne le signale. C'est la classe [[Lot audit n°2]] — « appliquer
// le même delta à deux copies = le signal de CONSOLIDER ». La seule différence légitime entre les
// deux chemins reste le TRANSPORT et le PORTEUR D'ÉTAT ; tout le reste vit ici.

import type { AppState, Transaction } from '../../types';
import { applyDocument, type DocumentPayload } from '../../mcp/ingest/applyDocument';
import { deriveCutoverDate } from './deriveCutoverDate';

export interface CutoverDecision {
    /** Date de bascule à passer au mapper (`transactionsAfter`), déjà plafonnée. */
    cutoverDateUsed: string | null;
    /** Avertissements destinés à l'humain — jamais un plafonnement silencieux. */
    warnings: string[];
}

/**
 * Dérive la date de bascule anti-doublon, PLAFONNÉE à aujourd'hui.
 *
 * ⚠️ [finding financial-integrity A3, PR #531] Une transaction datée dans le FUTUR (typo, saisie
 * pré-datée) pousserait la bascule EN AVANT de la date réelle → le mapper filtrerait TOUTES les
 * transactions Fintable comme « avant la bascule », CHAQUE JOUR, sans aucun signal (`ok:true,
 * transactionsAdded:0` indéfiniment). Le plafonnement est TRACÉ (no silent caps), pas juste appliqué.
 */
export function decideCutoverDate(
    transactions: readonly Transaction[] | undefined,
    todayStr: string,
): CutoverDecision {
    const warnings: string[] = [];
    let cutoverDateUsed = deriveCutoverDate(transactions as Transaction[]);
    if (cutoverDateUsed !== null && cutoverDateUsed > todayStr) {
        warnings.push(
            `Bascule dérivée (${cutoverDateUsed}) dans le FUTUR — une transaction existante est `
            + `mal datée. Plafonnée à aujourd'hui (${todayStr}) pour ne pas bloquer la sync ; corrige la date en cause.`,
        );
        cutoverDateUsed = todayStr;
    }
    return { cutoverDateUsed, warnings };
}

export interface AppliedPayloads {
    nextState: AppState;
    /** Transactions RÉELLEMENT écrites — jamais la taille du payload (cf. `[FINTABLE-TXADDED-MENT]`). */
    transactionsAdded: number;
    /** Vrai seulement si le solde a bougé — `applyCashBalance` ne fait RIEN sous 0,005 $ d'écart. */
    cashUpdated: boolean;
    /** [FINTABLE-ANCRE-LIQUIDITE-GONFLEE] Déplacement TOTAL de l'ancre `initialBalances.LIQUIDITE`
     *  pendant la passe, en dollars. Le cash est DÉRIVÉ : pour atteindre la cible annoncée par la
     *  banque, `applyCashBalance` déplace cette ancre — et le faisait en SILENCE. Or un doublon qui
     *  échappe au classement gonfle l'ancre d'autant (MESURÉ : 1 000 $ → 1 300 $ sur une dépense de
     *  300 $ comptée deux fois), ce qui déplace TOUT l'historique passé du même montant alors que le
     *  total présent, lui, reste juste. Publier le déplacement ne le corrige pas : ça le rend
     *  VISIBLE, ce qui est la seule chose qu'on puisse faire sans savoir POURQUOI l'écart existe. */
    cashAnchorDelta: number;
    /** Les dettes dont au moins un champ a changé — une dette déjà à jour n'y figure pas. */
    debtsUpdated: string[];
    /** Un payload rejeté devient un avertissement LOCAL — jamais un silence, jamais une panne globale. */
    warnings: string[];
}

/**
 * Applique les payloads du mapper en ISOLANT chacun.
 *
 * ⚠️ [finding financial-integrity, PR #531, MESURÉ] `applyDocument` REJETTE volontairement un payload
 * aberrant (solde de dette 0/négatif, dette introuvable, cible de cash non finie…) — un rejet LÉGITIME
 * côté validation. Sans isolation, ce rejet avortait TOUTE la passe avant l'écriture : aucun payload
 * valide n'était appliqué, CHAQUE JOUR, tant que la condition persistait (ex. une carte remboursée à
 * 0 $ ce mois-ci). Les compteurs reflètent donc ce qui a RÉELLEMENT été appliqué, pas ce que le mapper
 * a seulement PROPOSÉ.
 *
 * ⚠️ [finding financial-integrity A4, PR #531] L'ORDRE fourni par `mapFintableSnapshot`
 * (bank_statement → cash_balance → debt) EST le contrat : `applyCashBalance` calcule sa cible via
 * `computeStartingCash(state)` À L'INSTANT de son application, donc le `bank_statement` doit passer
 * D'ABORD pour que le cash tienne compte des nouvelles transactions. Ne JAMAIS trier/réordonner ici.
 */
export function applyPayloadsIsolated(
    state: AppState,
    payloads: readonly DocumentPayload[],
): AppliedPayloads {
    let nextState: AppState = state;
    const warnings: string[] = [];
    let transactionsAdded = 0;
    let cashUpdated = false;
    let cashAnchorDelta = 0;
    const debtsUpdated: string[] = [];

    for (const doc of payloads) {
        try {
            // ⚠️ [FINTABLE-TXADDED-MENT] Compter ce qui a été ÉCRIT, jamais ce que le payload
            // PROPOSAIT. `applyBankStatement` écarte les doublons, les montants aberrants et les
            // lignes malformées : `doc.transactions.length` est un MAJORANT, pas une mesure —
            // mesuré 3 annoncées / 0 écrites quand le recouvrement est total, c'est-à-dire dans le
            // cas le PLUS fréquent d'une sync quotidienne. Un compteur qui ment sur une écriture
            // est pire que pas de compteur : il fait croire que la donnée est arrivée.
            const avant = nextState;
            const { nextState: apres, changes } = applyDocument(avant, doc);
            nextState = apres;
            if (doc.kind === 'bank_statement') {
                // Le delta de longueur EST la mesure : `applyBankStatement` ne fait qu'AJOUTER
                // (`[...existing, ...added]`). `Math.max(0, …)` interdit qu'un futur producteur qui
                // retirerait des lignes se compte comme un ajout NÉGATIF.
                const ecrites = (nextState.transactions?.length ?? 0) - (avant.transactions?.length ?? 0);
                transactionsAdded += Math.max(0, ecrites);
            } else if (doc.kind === 'cash_balance') {
                // `applyCashBalance` retourne l'état INCHANGÉ quand l'écart est sous 0,005 $ — le
                // drapeau posé à `true` faisait afficher « Liquidités : mises à jour » (SystemView)
                // pour une passe qui n'avait rien touché. `changes` est le registre de l'écriture.
                cashUpdated = cashUpdated || changes.length > 0;
                // [FINTABLE-ANCRE-LIQUIDITE-GONFLEE] Le déplacement se LIT dans l'état, pas dans le
                // payload : `targetCad` dit où le total doit arriver, pas de combien l'ancre bouge.
                const ancreAvant = Number((avant.initialBalances ?? {}).LIQUIDITE) || 0;
                const ancreApres = Number((nextState.initialBalances ?? {}).LIQUIDITE) || 0;
                cashAnchorDelta += ancreApres - ancreAvant;
            } else if (doc.kind === 'debt') {
                // Même règle : `applyDebt` rend `changes: []` sur « valeurs déjà à jour ». Une dette
                // listée comme « mise à jour » alors qu'elle n'a pas bougé est une fausse réussite.
                if (changes.length > 0) debtsUpdated.push(doc.name);
            }
        } catch (payloadErr) {
            const reason = payloadErr instanceof Error ? payloadErr.message : String(payloadErr);
            warnings.push(`Payload « ${doc.kind} » NON appliqué : ${reason}`);
        }
    }

    return { nextState, transactionsAdded, cashUpdated, cashAnchorDelta, debtsUpdated, warnings };
}
