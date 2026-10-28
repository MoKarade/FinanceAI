// services/lia/contrat.ts — ce que FinanceAI échange avec LIA (fonctions pures, aucune I/O).
//
// LIA vit chez MemoryAI (cerveau, mémoire, outils) ; FinanceAI ne fait que l'AFFICHER et lui relayer
// les questions de Marc PAR LE HUB, seul détenteur des jetons de l'écosystème. Aucun état LIA ici.
//   navigateur → api/lia/ask   (cookie de session du hub, vérifié côté serveur)
//   api/lia/ask → hub          POST /api/lia/ask (x-hub-token : le jeton de CETTE app)
//   hub → MemoryAI             (jeton que le hub détient ; l'app ne le connaît pas)
// Même schéma que le squelette (MoKarade/app-template#128, contrat `commun/assistant/CONTRAT-ask-lia.md`).
//
// ⚠️ Ce module est aussi chargé par la fonction Vercel (runtime Node, ESM natif) : AUCUN import relatif
// ici (sinon l'extension `.js` serait requise, cf tests/api/relayRouteStatique.test.ts), seulement `zod`
// et le paquet.
//
// Un texte reçu du hub (donc de MemoryAI) est une DONNÉE : le paquet l'affiche par `textContent`, jamais
// `innerHTML`. Les blocs composés (`blocks`) ne sont volontairement PAS relayés en v1 : FinanceAI n'a pas de
// rendu pour eux, et les ignorer ici évite de laisser passer des données que personne ne valide.

import { HUMEURS_LIA } from '@mokarade/lia-ui';
import { z } from 'zod';

export const URL_HUB_DEFAUT = 'https://hubperso.com';
export const CHEMIN_ASK_HUB = '/api/lia/ask';
/** Au-delà, LIA dit « indisponible » plutôt que de laisser Marc attendre. */
export const DELAI_HUB_MS = 35_000;
export const QUESTION_MAX = 2000;
/** Une question de 2 000 caractères tient très en dessous. Plus gros = pas une question. */
export const CORPS_ASK_MAX_OCTETS = 8 * 1024;

export const DemandeLia = z.object({
    question: z.string().trim().min(1).max(QUESTION_MAX),
    /** Chemin de la page où se trouve Marc (contexte pour LIA), jamais une URL complète. */
    page: z.string().max(200).startsWith('/').optional(),
});
export type DemandeLia = z.infer<typeof DemandeLia>;

/**
 * Cette session est-elle celle du propriétaire (`AUTHORIZED_EMAIL`) ? Sans variable : faux.
 * FinanceAI n'a QU'UN utilisateur : seul le propriétaire interroge LIA.
 */
export function estProprietaire(email: string, proprietaire: string | undefined): boolean {
    const attendu = (proprietaire ?? '').trim().toLowerCase();
    return attendu !== '' && email.trim().toLowerCase() === attendu;
}

export const ReponseLiaApp = z.object({
    text: z.string().min(1).max(8000),
    chips: z
        .array(z.object({ id: z.string().min(1).max(64), label: z.string().min(1).max(60) }))
        .max(6)
        .optional(),
    mood: z.enum(HUMEURS_LIA).optional(),
});
export type ReponseLiaApp = z.infer<typeof ReponseLiaApp>;
