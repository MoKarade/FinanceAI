// services/fintable/comptesSansPositions.ts
//
// [FINTABLE-INVESTMENTS-MUET] Traduire `holdingsSkipped` en quelque chose qu'un écran peut DIRE.
//
// ⚠️ Demande Marc 2026-08-17 : « les placements s'affichent vides sans dire pourquoi ». Le
// recensement (lot 98) a montré que la cause était DÉJÀ mesurée — `readFintableSnapshot` remplit
// `holdingsSkipped: { accountId, reason }` — mais que son seul consommateur était un script CLI de
// développement. Il ne manquait pas un diagnostic, il manquait le FIL
// (`UNE-CAUSE-CLASSEE-PUIS-JETEE-EST-UNE-CAUSE-ABSENTE`).
//
// ⚠️ SOURCE UNIQUE des DEUX chemins de sync (`browserSync.ts` navigateur et `mcp/runFintableSync.ts`
// serveur) : ils composaient déjà leurs `warnings` à l'identique et avaient OUBLIÉ `holdingsSkipped`
// tous les deux, de la même façon. Une fonction partagée rend le prochain oubli impossible ; deux
// recopies l'auraient rendu certain (`UN-CORRECTIF-LOCAL-REPETE-EST-LE-SIGNE-D-UNE-SOURCE-UNIQUE-MANQUANTE`).

import type { FintableSnapshot } from './types';
import type { FintableSyncReport } from '../../types';

type CompteSansPositions = NonNullable<FintableSyncReport['comptesSansPositions']>[number];

/**
 * Enrichit chaque compte sauté du LIBELLÉ que l'humain reconnaît.
 *
 * @returns `undefined` quand aucun compte n'est concerné — et non `[]`. Un tableau vide et un champ
 *   absent se lisent pareil à l'écran, mais `undefined` garde le rapport identique à celui d'avant
 *   ce lot dans le cas nominal : aucun bruit ajouté au blob persisté pour dire « rien à signaler ».
 */
export function comptesSansPositionsDuSnapshot(
    snapshot: Pick<FintableSnapshot, 'accounts' | 'holdingsSkipped'>,
): CompteSansPositions[] | undefined {
    if (!snapshot.holdingsSkipped || snapshot.holdingsSkipped.length === 0) return undefined;
    const labelParId = new Map(snapshot.accounts.map(a => [a.id, a.label]));
    return snapshot.holdingsSkipped.map(s => ({
        accountId: s.accountId,
        // ⚠️ Repli sur l'identifiant plutôt que sur une chaîne vide : un compte disparu de la liste
        // entre deux lectures reste NOMMABLE, même mal. Taire la ligne serait perdre la seule
        // information qui explique un écran vide.
        label: labelParId.get(s.accountId) ?? s.accountId,
        reason: s.reason,
    }));
}
