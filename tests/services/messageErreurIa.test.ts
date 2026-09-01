// [AI-BUDGETMODAL-ERROR-COLLAPSE] Le message d'erreur IA est une AFFIRMATION, pas de la décoration.
//
// ⚠️ « Vérifie ta clé Anthropic » sur une coupure réseau envoie l'utilisateur corriger un champ qui
// n'a rien. C'est la même classe qu'un correctif de calcul : un texte affiché affirme quelque chose,
// et un diagnostic faux coûte plus qu'un diagnostic absent.
import { describe, it, expect } from 'vitest';
import { causeErreurIa, messageErreurIa } from '../../services/messageErreurIa';

/** Une erreur du SDK Anthropic porte son statut sur `.status`. */
const erreurHttp = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

describe('[AI-BUDGETMODAL-ERROR-COLLAPSE] causes distinctes, messages distincts', () => {
    it('chaque cause a son message, et deux causes ne partagent JAMAIS le même', () => {
        // ⚠️ C'est l'assertion qui porte le lot : le défaut n'était pas « le message est faux », mais
        // « quatre causes rendent le MÊME message ». Une correction qui distinguerait les causes
        // sans distinguer les phrases ne changerait rien pour l'utilisateur.
        const causes = [
            { err: erreurHttp(401), attendu: 'cle-refusee' },
            { err: erreurHttp(403), attendu: 'cle-refusee' },
            { err: erreurHttp(429), attendu: 'quota' },
            { err: erreurHttp(500), attendu: 'service' },
            { err: erreurHttp(503), attendu: 'service' },
            { err: erreurHttp(400), attendu: 'requete' },
            { err: new Error('Failed to fetch'), attendu: 'reseau' },
            { err: erreurHttp(408), attendu: 'reseau' },
        ] as const;
        for (const c of causes) {
            expect(causeErreurIa(c.err), `statut mal classé : ${String(c.attendu)}`).toBe(c.attendu);
        }

        const messages = new Set(
            ['cle-refusee', 'quota', 'service', 'requete', 'reseau'].map((cause) => {
                const err = cause === 'reseau' ? new Error('offline')
                    : erreurHttp(cause === 'cle-refusee' ? 401 : cause === 'quota' ? 429 : cause === 'service' ? 500 : 400);
                return messageErreurIa(err);
            }),
        );
        expect(messages.size, 'deux causes rendent le même message — le défaut est intact').toBe(5);
    });

    it('une clé ABSENTE et une clé REFUSÉE ne se disent pas pareil', () => {
        // Le premier cas est une configuration jamais faite, le second une clé que le service
        // rejette. Envoyer « vérifie ta clé » à quelqu'un qui n'en a jamais mis est une impasse.
        const absente = messageErreurIa(null, { cleAbsente: true });
        const refusee = messageErreurIa(erreurHttp(401));
        expect(absente).not.toBe(refusee);
        expect(absente).toMatch(/Aucune clé/i);
        expect(refusee).toMatch(/refusée/i);
    });

    it('`cleAbsente` prime sur l\'erreur — l\'appel n\'a jamais été tenté', () => {
        // Sans cette priorité, un appelant qui passe les deux verrait le message du RÉSEAU alors
        // qu'aucune requête n'est partie.
        expect(causeErreurIa(new Error('Failed to fetch'), { cleAbsente: true })).toBe('cle-absente');
    });

    it('une ANNULATION ne rend AUCUN message — ce n\'est pas un échec', () => {
        // ⚠️ L'app provoque elle-même l'`AbortError` au démontage (`controller.abort()`). L'afficher
        // en rouge accuserait le service d'une action que l'utilisateur vient de faire exprès.
        const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
        expect(causeErreurIa(abort)).toBe('annule');
        expect(messageErreurIa(abort), 'une annulation doit rendre null, pas une chaîne vide').toBeNull();
    });

    it('AUCUN message ne parle de la clé quand la clé n\'est pas en cause', () => {
        // ⚠️ L'assertion qui aurait attrapé le défaut d'origine, écrite dans son sens : c'est la
        // MENTION de la clé sur un échec réseau ou de quota qui envoyait au mauvais endroit.
        for (const err of [new Error('offline'), erreurHttp(429), erreurHttp(500), erreurHttp(400)]) {
            expect(messageErreurIa(err), `parle de la clé à tort : ${String((err as { status?: number }).status ?? 'réseau')}`)
                .not.toMatch(/clé/i);
        }
        // Contrôle : le cas où elle DOIT en parler, sinon l'assertion ci-dessus serait satisfaite
        // par un module qui ne mentionne jamais la clé.
        expect(messageErreurIa(erreurHttp(401))).toMatch(/clé/i);
    });
});
