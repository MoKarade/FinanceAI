// services/fintable/rolesConfig.ts
//
// [FINTABLE-3] Parseur PARTAGÉ du JSON de rôles de comptes (Lot 1 CLI `--roles <fichier>` ET Lot 3
// serveur `FINTABLE_ROLES_JSON`) — consolidé ici plutôt que dupliqué (classe [[Lot audit n°2]]
// « appliquer le même delta à deux copies = le signal de consolider »). La FORME est validée : un
// rôle inconnu ou un `debtName` vide passerait sinon en silence jusqu'au mapper.

import type { FintableMappingConfig } from './mapSnapshot';

/** @throws si la chaîne n'est pas un JSON d'objet `{ "<id de compte>": { "kind": … } }` valide. */
export function parseRolesJson(raw: string): FintableMappingConfig['roles'] {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Rôles Fintable : objet { "<id de compte>": { "kind": … } } attendu.');
    }
    const roles: FintableMappingConfig['roles'] = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
        const kind = (value as { kind?: unknown })?.kind;
        if (kind === 'cash' || kind === 'investment' || kind === 'ignore') {
            roles[id] = { kind };
        } else if (kind === 'debt') {
            const debtName = (value as { debtName?: unknown }).debtName;
            if (typeof debtName !== 'string' || debtName.trim() === '') {
                throw new Error(`Rôles Fintable : le rôle « debt » du compte ${id} exige un "debtName" non vide.`);
            }
            roles[id] = { kind: 'debt', debtName };
        } else {
            throw new Error(`Rôles Fintable : rôle inconnu pour le compte ${id} (attendu : cash | debt | investment | ignore).`);
        }
    }
    return roles;
}
