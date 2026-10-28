// services/fintable/rolesConfig.ts
//
// [FINTABLE-3] Parseur PARTAGÉ du JSON de rôles de comptes (Lot 1 CLI `--roles <fichier>` ET Lot 3
// serveur `FINTABLE_ROLES_JSON`) — consolidé ici plutôt que dupliqué (classe [[Lot audit n°2]]
// « appliquer le même delta à deux copies = le signal de consolider »). La FORME est validée : un
// rôle inconnu ou un `debtName` vide passerait sinon en silence jusqu'au mapper.

import type { FintableMappingConfig, FintableTaxRegime } from './mapSnapshot';
// Liste IMPORTÉE, pas re-codée : une 2ᵉ copie diverge (elle l'avait déjà fait, cf. le message de
// remède qui enseignait une graphie que ce parseur rejette).
import { FINTABLE_TAX_REGIMES as TAX_REGIMES } from './mapSnapshot';

/** @throws si la chaîne n'est pas un JSON d'objet `{ "<id de compte>": { "kind": … } }` valide. */
export function parseRolesJson(raw: string): FintableMappingConfig['roles'] {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Rôles Fintable : objet { "<id de compte>": { "kind": … } } attendu.');
    }
    const roles: FintableMappingConfig['roles'] = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
        const kind = (value as { kind?: unknown })?.kind;
        if (kind === 'investment') {
            // [FINTABLE-6] `taxRegime` est OPTIONNEL (absent = solde affiché mais écart non ventilé,
            // signalé par le mapper) — mais s'il est FOURNI, il doit être valide : une faute de frappe
            // (« celi », « non-enregistre ») passerait sinon en silence et l'écart atterrirait dans le
            // mauvais panier fiscal, ce qui fausse l'impôt de toute la projection. Bretelle ici,
            // ceinture côté mapper (classe MCP-WHATIF : « le schéma est la bretelle, pas la ceinture »).
            const rawRegime = (value as { taxRegime?: unknown }).taxRegime;
            if (rawRegime === undefined || rawRegime === null) {
                roles[id] = { kind: 'investment' };
            } else if (typeof rawRegime === 'string' && (TAX_REGIMES as readonly string[]).includes(rawRegime)) {
                roles[id] = { kind: 'investment', taxRegime: rawRegime as FintableTaxRegime };
            } else {
                throw new Error(
                    `Rôles Fintable : "taxRegime" invalide pour le compte ${id} `
                    + `(attendu : ${TAX_REGIMES.join(' | ')}, ou champ absent).`,
                );
            }
        } else if (kind === 'cash' || kind === 'ignore') {
            roles[id] = { kind };
        } else if (kind === 'debt') {
            // [FINTABLE-CARTE-SANS-DETTE] `debtName` ABSENT ou VIDE est désormais légitime des DEUX
            // côtés : « importe les transactions, ne touche à aucun solde ». Refuser ici pendant que
            // le chemin navigateur l'accepte ferait exactement diverger les deux orchestrateurs —
            // le défaut que `syncCore` a été créé pour rendre impossible. En revanche un debtName
            // d'un autre TYPE reste une erreur de configuration, pas un choix.
            const debtName = (value as { debtName?: unknown }).debtName;
            if (debtName !== undefined && typeof debtName !== 'string') {
                throw new Error(`Rôles Fintable : le "debtName" du compte ${id} doit être une chaîne (ou être absent).`);
            }
            roles[id] = { kind: 'debt', debtName: (debtName ?? '').trim() };
        } else {
            throw new Error(`Rôles Fintable : rôle inconnu pour le compte ${id} (attendu : cash | debt | investment | ignore).`);
        }
    }
    return roles;
}
