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
    transactionsAdded: number;
    cashUpdated: boolean;
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
    const debtsUpdated: string[] = [];

    for (const doc of payloads) {
        try {
            nextState = applyDocument(nextState, doc).nextState;
            if (doc.kind === 'bank_statement') transactionsAdded += doc.transactions.length;
            else if (doc.kind === 'cash_balance') cashUpdated = true;
            else if (doc.kind === 'debt') debtsUpdated.push(doc.name);
        } catch (payloadErr) {
            const reason = payloadErr instanceof Error ? payloadErr.message : String(payloadErr);
            warnings.push(`Payload « ${doc.kind} » NON appliqué : ${reason}`);
        }
    }

    return { nextState, transactionsAdded, cashUpdated, debtsUpdated, warnings };
}
