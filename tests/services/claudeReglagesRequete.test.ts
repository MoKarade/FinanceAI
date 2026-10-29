// tests/services/claudeReglagesRequete.test.ts
//
// Génération 5.5 : ce que les appels ENVOIENT réellement. `aiChatReglages.test.ts` éprouve les
// fonctions de réglage isolément ; ici on lit le corps de la requête construit par chaque appel,
// sur le vrai SDK (seul `fetch` est simulé) : plus de `temperature` (400 sur la 5.5), réflexion et
// effort réglés par modèle, plafonds de réponse relevés (la réflexion compte dans `max_tokens`).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chat, analyzeBankStatement, analyzePayslip, MODEL_HAIKU, MODEL_SONNET } from '../../services/claude';

const ok = (text: string) => new Response(JSON.stringify({
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text }], stop_reason: 'end_turn',
    usage: { input_tokens: 1, output_tokens: 1 },
}), { status: 200, headers: { 'content-type': 'application/json' } });

let corps: Array<Record<string, unknown>>;

beforeEach(() => {
    corps = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: { body?: string }) => {
        corps.push(JSON.parse(String(init?.body ?? '{}')));
        return ok('[]');
    }));
    vi.stubEnv('VITE_CLAUDE_TRANSPORT', '');
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('requêtes de la génération 5.5', () => {
    it('chat() sur Sonnet 5.5 : effort moyen, pensée conservée, plafond 4096, jamais de temperature', async () => {
        await chat([{ role: 'user', content: 'salut' }], 'sk-ant-test');
        expect(corps).toHaveLength(1);
        expect(corps[0].model).toBe(MODEL_SONNET);
        expect(corps[0].output_config).toEqual({ effort: 'medium' });
        expect(corps[0].thinking).toBeUndefined();
        expect(corps[0].max_tokens).toBe(4096);
        expect(corps[0]).not.toHaveProperty('temperature');
    });

    it('chat() sur Haiku 5.5 : pensée coupée, effort bas (Haiku accepte `disabled`)', async () => {
        await chat([{ role: 'user', content: 'salut' }], 'sk-ant-test', { model: MODEL_HAIKU });
        expect(corps[0].model).toBe(MODEL_HAIKU);
        expect(corps[0].thinking).toEqual({ type: 'disabled' });
        expect(corps[0].output_config).toEqual({ effort: 'low' });
    });

    it('analyzeBankStatement : Sonnet 5.5 en between_tools (il refuse `disabled`), plafond 16000, sans temperature', async () => {
        const file = new File(['%PDF-1.4 releve'], 'releve.pdf', { type: 'application/pdf' });
        await analyzeBankStatement(file, 'sk-ant-test').catch(() => undefined);
        expect(corps.length).toBeGreaterThan(0);
        for (const c of corps) {
            expect(c.model).toBe(MODEL_SONNET);
            expect(c.thinking).toEqual({ type: 'between_tools' });
            expect(c.output_config).toEqual({ effort: 'medium' });
            expect(c.max_tokens).toBe(16000);
            expect(c).not.toHaveProperty('temperature');
        }
    });

    it('analyzePayslip : même réglage de lecture, plafond 1024, sans temperature', async () => {
        const file = new File(['%PDF-1.4 paie'], 'paie.pdf', { type: 'application/pdf' });
        await analyzePayslip(file, 'sk-ant-test').catch(() => undefined);
        expect(corps.length).toBeGreaterThan(0);
        expect(corps[0].thinking).toEqual({ type: 'between_tools' });
        expect(corps[0].output_config).toEqual({ effort: 'medium' });
        expect(corps[0].max_tokens).toBe(1024);
        expect(corps[0]).not.toHaveProperty('temperature');
    });
});
