// tests/services/claude.visionTronquee.test.ts
//
// [AI-STOPREASON-JETE] (audit 2026-09-07) Aucun appel de `services/claude.ts` ne lisait `stop_reason`.
// Un relevé trop long pour `max_tokens` revenait COUPÉ : JSON invalide → `[]` → l'écran affirmait
// « Aucune transaction reconnue dans ce document » sur un relevé parfaitement lisible. La cause
// existait dans la réponse ; elle était jetée. Bout-en-bout avec le SDK simulé : c'est la seule façon
// d'exercer les deux appels Vision réels (une copie du parsing ne prouverait rien).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    nextText: '[]',
    nextStop: 'end_turn' as string,
}));

vi.mock('@anthropic-ai/sdk', () => ({
    default: class {
        messages = {
            create: vi.fn(async () => ({
                content: [{ type: 'text', text: mocks.nextText }],
                stop_reason: mocks.nextStop,
            })),
        };
    },
}));

import { analyzeBankStatement, analyzePayslip, VisionTronqueeError, VisionReponseInvalideError } from '../../services/claude';
import { causeErreurIa, messageErreurIa } from '../../services/messageErreurIa';

const releve = () => new File(['pdf'], 'releve.pdf', { type: 'application/pdf' });
const paie = () => new File(['png'], 'paie.png', { type: 'image/png' });

describe('[AI-STOPREASON-JETE] une réponse Vision coupée sur max_tokens est une CAUSE, pas un « rien trouvé »', () => {
    beforeEach(() => { mocks.nextText = '[]'; mocks.nextStop = 'end_turn'; });

    it('relevé : stop_reason max_tokens → VisionTronqueeError, jamais un tableau vide', async () => {
        // Le JSON partiel typique d'une coupure : ouvert, jamais fermé.
        mocks.nextText = '[{"date":"2026-01-03","description":"IGA","amount":-42.5},{"date":"2026-01-0';
        mocks.nextStop = 'max_tokens';
        await expect(analyzeBankStatement(releve(), 'sk-test')).rejects.toBeInstanceOf(VisionTronqueeError);
    });

    it('fiche de paie : même cause, même classe', async () => {
        mocks.nextText = '{"grossPeriod": 3000, "netPeriod": 21';
        mocks.nextStop = 'max_tokens';
        await expect(analyzePayslip(paie(), 'sk-test')).rejects.toBeInstanceOf(VisionTronqueeError);
    });

    it('contrôle — end_turn avec un JSON valide : le chemin nominal est INTACT', async () => {
        mocks.nextText = '[{"date":"2026-01-03","description":"IGA","amount":-42.5}]';
        await expect(analyzeBankStatement(releve(), 'sk-test')).resolves.toEqual([
            { date: '2026-01-03', description: 'IGA', amount: -42.5 },
        ]);
    });

    it('contrôle — end_turn avec un JSON invalide reste « aucune transaction » (ce cas-là est honnête)', async () => {
        mocks.nextText = 'pas du json';
        await expect(analyzeBankStatement(releve(), 'sk-test')).resolves.toEqual([]);
    });

    // Jumelle trouvée par la revue du lot 213 : une réponse REÇUE mais inexploitable (JSON cassé, refus du
    // classificateur) levait un `Error` nu sans statut HTTP → classé « réseau » → « vérifie ton accès Internet ».
    it('fiche de paie : JSON invalide → VisionReponseInvalideError, classée « réponse invalide », jamais « réseau »', async () => {
        mocks.nextText = 'pas du json';
        await expect(analyzePayslip(paie(), 'sk-test')).rejects.toBeInstanceOf(VisionReponseInvalideError);
        const err = new VisionReponseInvalideError('JSON invalide');
        expect(causeErreurIa(err)).toBe('reponse-invalide');
        expect(messageErreurIa(err)).not.toMatch(/Internet/);
    });

    it('stop_reason refusal → VisionReponseInvalideError aux DEUX appels (le classificateur peut intervenir hors streaming)', async () => {
        mocks.nextText = ''; mocks.nextStop = 'refusal';
        await expect(analyzePayslip(paie(), 'sk-test')).rejects.toBeInstanceOf(VisionReponseInvalideError);
        await expect(analyzeBankStatement(releve(), 'sk-test')).rejects.toBeInstanceOf(VisionReponseInvalideError);
    });

    it('l’écran peut NOMMER la cause : messageErreurIa dit « trop long », pas « réseau »', () => {
        const err = new VisionTronqueeError('relevé');
        expect(causeErreurIa(err)).toBe('tronque');
        expect(messageErreurIa(err)).toMatch(/trop long/);
        // Sans le cas dédié, une erreur sans statut HTTP tombait dans « réseau » — le mauvais conseil.
        expect(messageErreurIa(err)).not.toMatch(/Internet/);
    });
});
