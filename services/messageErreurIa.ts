// services/messageErreurIa.ts
//
// [AI-BUDGETMODAL-ERROR-COLLAPSE] Ce que l'app DIT quand un appel à Claude échoue.
//
// ⚠️ LE DÉFAUT : quatre écrans affichaient « Vérifie ta clé Anthropic » quelle que soit la cause.
// Une coupure de réseau, un quota atteint, un service indisponible et une clé réellement refusée
// donnaient la même phrase — celle qui n'est vraie que dans le dernier cas. C'est un message de
// DIAGNOSTIC : il envoie l'utilisateur regarder le mauvais endroit, et une clé parfaitement valide
// se retrouve accusée. Le dépôt a déjà nommé cette classe : un correctif de diagnostic se relit
// comme un correctif de calcul, parce qu'un texte affiché est une AFFIRMATION.
//
// ⚠️ Deux des quatre écrans écrivaient `catch { }` — sans lier l'erreur. Ils ne pouvaient donc pas
// dire autre chose, quoi qu'on écrive ici : la première moitié du correctif est de CAPTURER.
//
// ⚠️ CE MODULE NE RE-CLASSIFIE RIEN. `services/claude.ts` porte déjà `httpStatusOf` et
// `classifyCategorizeError` — mais ses trois catégories répondent à « faut-il réessayer ce
// chunk ? », pas à « que dire à quelqu'un ». `retryable` fusionne le réseau et le 429, qui ne se
// racontent pas pareil ; `fatal` ne dit rien d'utile à un humain. On dérive donc du MÊME statut
// HTTP, pas d'une seconde lecture de l'erreur, et les deux fonctions restent distinctes parce
// qu'elles répondent à deux questions distinctes.
import { httpStatusOf } from './claude';

/** Ce que l'utilisateur peut faire, dérivé de ce qui a réellement échoué. */
export type CauseErreurIa =
    | 'cle-absente'      // aucune clé configurée : l'appel n'a même pas été tenté
    | 'cle-refusee'      // 401 / 403 : la clé existe et le service la rejette
    | 'quota'            // 429 : trop de requêtes, ou crédit épuisé
    | 'reseau'           // aucun statut HTTP : coupure, DNS, timeout client
    | 'service'          // 5xx : c'est Anthropic qui est en panne, pas nous
    | 'requete'          // autre 4xx : la requête elle-même est refusée
    | 'annule';          // AbortError : l'utilisateur a fermé — ce n'est PAS une erreur

const MESSAGES: Record<CauseErreurIa, string> = {
    'cle-absente': 'Aucune clé Anthropic configurée. Ajoute-la dans Configuration pour utiliser l\'IA.',
    'cle-refusee': 'Clé Anthropic refusée par le service. Vérifie-la dans Configuration.',
    quota: 'Quota Anthropic atteint (trop de requêtes ou crédit épuisé). Réessaie dans quelques minutes.',
    reseau: 'Connexion au service interrompue. Vérifie ton accès Internet, puis réessaie.',
    service: 'Le service Anthropic est momentanément indisponible. Réessaie dans quelques minutes.',
    requete: 'Le service a refusé la requête. Rien à corriger de ton côté — c\'est un défaut de l\'app.',
    annule: '',
};

/**
 * ⚠️ Un `AbortError` n'est pas un échec : il arrive quand l'utilisateur ferme la fenêtre pendant le
 * streaming, et l'app le provoque ELLE-MÊME (`controller.abort()` au démontage). L'afficher en
 * rouge accuserait le service d'une action volontaire.
 */
const estAnnulation = (err: unknown): boolean => {
    const nom = (err as { name?: unknown } | null)?.name;
    return nom === 'AbortError' || nom === 'AbortSignalError';
};

/** La cause, telle qu'elle intéresse quelqu'un qui lit un écran. */
export function causeErreurIa(err: unknown, opts: { cleAbsente?: boolean } = {}): CauseErreurIa {
    if (opts.cleAbsente) return 'cle-absente';
    if (estAnnulation(err)) return 'annule';
    const status = httpStatusOf(err);
    // ⚠️ `undefined` veut dire « pas de réponse HTTP du tout » — donc réseau. Le confondre avec un
    // 4xx enverrait vérifier une clé alors que rien n'a quitté la machine.
    if (status === undefined) return 'reseau';
    if (status === 401 || status === 403) return 'cle-refusee';
    if (status === 429) return 'quota';
    if (status === 408) return 'reseau';
    if (status >= 500 && status < 600) return 'service';
    return 'requete';
}

/**
 * Le message à afficher, ou `null` quand il n'y a rien d'honnête à dire (annulation).
 *
 * Rendre `null` plutôt qu'une chaîne vide OBLIGE l'appelant à décider quoi faire du cas « pas
 * d'erreur à montrer » — une chaîne vide se rend en silence dans un `<p>` et laisse un bloc rouge
 * vide à l'écran.
 */
export function messageErreurIa(err: unknown, opts: { cleAbsente?: boolean } = {}): string | null {
    const cause = causeErreurIa(err, opts);
    return cause === 'annule' ? null : MESSAGES[cause];
}
