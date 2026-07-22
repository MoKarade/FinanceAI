// tests/aiTools/agentLoop.test.ts
//
// [AITOOLS-B] Boucle agentique du chat in-app, testée avec un client Anthropic FACTICE scripté :
// dispatch réel des tools (vrais specs + vrai état persona), cap dur de tours, tool_result
// d'erreur lisible sur args invalides / tool inconnu (Claude peut se corriger), zéro throw.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/errorLogger', async (orig) => ({
    ...(await orig() as object),
    logError: vi.fn(),
}));

import type Anthropic from '@anthropic-ai/sdk';
import { logError } from '../../services/errorLogger';
import { runAgentLoop, type AgentClientLike } from '../../services/aiTools/agentLoop';
import { TEST_PERSONAS } from '../../services/testPersonas';
import { normalizeAppState } from '../../mcp/state/loadAppState';

const karim = normalizeAppState(TEST_PERSONAS.find((p) => p.id === 'karim-immigre')!.build());
const getState = async () => karim;

function textMsg(text: string): Anthropic.Message {
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn' } as unknown as Anthropic.Message;
}
function toolMsg(name: string, input: Record<string, unknown>, id = 'tu-1'): Anthropic.Message {
    return { content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use' } as unknown as Anthropic.Message;
}

/** Client scripté : rend les messages dans l'ordre (le dernier se répète), capture chaque requête. */
function scriptedClient(script: Anthropic.Message[]) {
    const requests: Array<Record<string, unknown>> = [];
    let i = 0;
    const client: AgentClientLike = {
        messages: {
            stream: (params, opts) => {
                requests.push(params);
                const msg = script[Math.min(i, script.length - 1)];
                i += 1;
                return {
                    on: () => undefined,
                    // Fidélité au vrai SDK : un signal déjà aborté fait rejeter finalMessage
                    // (sinon un test d'annulation ne pourrait pas observer l'arrêt du tour suivant).
                    finalMessage: async () => {
                        if (opts?.signal?.aborted) throw new DOMException('User cancelled', 'AbortError');
                        return msg;
                    },
                };
            },
        },
    };
    return { client, requests };
}

beforeEach(() => {
    vi.mocked(logError).mockClear();
});

describe('runAgentLoop', () => {
    it('nominal : tool_use → dispatch RÉEL (vrai payload) → tool_result renvoyé → réponse finale', async () => {
        const { client, requests } = scriptedClient([
            toolMsg('get_financial_overview', {}),
            textMsg('Ton patrimoine est solide.'),
        ]);
        const toolChips: string[] = [];
        const res = await runAgentLoop([{ role: 'user', content: 'Où j\'en suis ?' }], {
            apiKey: 'sk-test', getState, client, onToolUse: (n) => toolChips.push(n),
        });

        expect(res.stopReason).toBe('end');
        expect(res.text).toContain('Ton patrimoine est solide.');
        expect(res.toolsUsed).toEqual(['get_financial_overview']);
        expect(toolChips).toEqual(['get_financial_overview']);
        // La 2e requête porte le tool_result avec le VRAI payload (netWorth du persona) — preuve
        // que le dispatch exécute la même logique que le MCP, pas un stub.
        const secondReq = requests[1].messages as Anthropic.MessageParam[];
        const toolResultMsg = secondReq.at(-1)!;
        const block = (toolResultMsg.content as Anthropic.ToolResultBlockParam[])[0];
        expect(block.type).toBe('tool_result');
        expect(block.is_error).toBeUndefined();
        const payload = JSON.parse((block.content as string).split('\n\n')[0]);
        expect(payload.currency).toBe('CAD');
        expect(typeof payload.netWorth).toBe('number');
        expect(logError).not.toHaveBeenCalled(); // nominal = zéro bruit
    });

    it('cap DUR de tours : un modèle qui boucle s\'arrête avec message honnête + logError', async () => {
        const { client } = scriptedClient([toolMsg('get_financial_overview', {})]); // répète à l'infini
        const res = await runAgentLoop([{ role: 'user', content: 'q' }], {
            apiKey: 'sk-test', getState, client, maxTurns: 3,
        });
        expect(res.stopReason).toBe('max_turns');
        expect(res.turns).toBe(3);
        expect(res.text).toContain('[Limite atteinte]');
        expect(logError).toHaveBeenCalledWith(expect.objectContaining({
            source: 'ai', severity: 'warning',
            message: expect.stringMatching(/cap de 3 tours/),
        }));
    });

    it('args INVALIDES → tool_result is_error LISIBLE (pas de throw), la boucle continue', async () => {
        const { client, requests } = scriptedClient([
            toolMsg('get_tax_situation', { year: 'pas-un-nombre' }),
            textMsg('Corrigé.'),
        ]);
        const res = await runAgentLoop([{ role: 'user', content: 'q' }], { apiKey: 'sk-test', getState, client });
        expect(res.stopReason).toBe('end');
        const block = ((requests[1].messages as Anthropic.MessageParam[]).at(-1)!
            .content as Anthropic.ToolResultBlockParam[])[0];
        expect(block.is_error).toBe(true);
        expect(block.content as string).toContain('Arguments invalides');
    });

    it('tool INCONNU → tool_result is_error « non disponible », pas de crash', async () => {
        const { client, requests } = scriptedClient([
            toolMsg('tool_inexistant', { name: 'x' }), // ni lecture ni écriture
            textMsg('Ok.'),
        ]);
        const res = await runAgentLoop([{ role: 'user', content: 'q' }], { apiKey: 'sk-test', getState, client });
        expect(res.stopReason).toBe('end');
        const block = ((requests[1].messages as Anthropic.MessageParam[]).at(-1)!
            .content as Anthropic.ToolResultBlockParam[])[0];
        expect(block.is_error).toBe(true);
        expect(block.content as string).toContain('non disponible');
    });

    it('les 11 tools de lecture sont déclarés à l\'API (noms exacts, schémas JSON, sans $schema méta)', async () => {
        const { client, requests } = scriptedClient([textMsg('ok')]);
        await runAgentLoop([{ role: 'user', content: 'q' }], { apiKey: 'sk-test', getState, client });
        const tools = requests[0].tools as Array<{ name: string; input_schema: Record<string, unknown> }>;
        expect(tools.map((t) => t.name).sort()).toEqual([
            'calculate_real_estate', 'get_financial_overview', 'get_holdings', 'get_next_best_actions',
            'get_projection', 'get_retirement_outlook', 'get_tax_room', 'get_tax_situation',
            'run_projection', 'search_transactions', 'simulate_what_if',
        ]);
        for (const t of tools) {
            expect(t.input_schema.type).toBe('object');
            expect(t.input_schema.$schema, `${t.name} : clé méta $schema hors contrat Anthropic`).toBeUndefined();
        }
    });

    it('[ceinture panel] échec API (finalMessage rejette) → résultat HONNÊTE stopReason error + logError, timers nettoyés', async () => {
        // Discriminant : l'ancien code REJETAIT la promesse entière (texte + tool_results déjà payés
        // perdus, zéro logError). Un hoquet réseau ne doit plus jeter le travail accompli.
        vi.useFakeTimers();
        try {
            const client: AgentClientLike = {
                messages: { stream: () => ({ on: () => undefined, finalMessage: async () => { throw new Error('529 overloaded'); } }) },
            };
            const res = await runAgentLoop([{ role: 'user', content: 'q' }], { apiKey: 'sk-test', getState, client });
            expect(res.stopReason).toBe('error');
            expect(res.errorMessage).toContain('529');
            expect(res.text).toContain('[Erreur]');
            expect(logError).toHaveBeenCalledWith(expect.objectContaining({
                source: 'ai', severity: 'error',
                message: expect.stringMatching(/échec de l'appel Claude au tour 1/),
            }));
            expect(vi.getTimerCount()).toBe(0); // cleanup() du timeout bien passé (finally)
        } finally {
            vi.useRealTimers();
        }
    });

    it('[AITOOLS-B1] 400 API sur une PIÈCE JOINTE (document invalide) → message « retire-la », pas « réessaie » (le retry rééchouerait à l\'identique)', async () => {
        const apiErr = Object.assign(new Error('invalid_request_error: document exceeds maximum pages'), { status: 400 });
        const client: AgentClientLike = {
            messages: { stream: () => ({ on: () => undefined, finalMessage: async () => { throw apiErr; } }) },
        };
        const res = await runAgentLoop([{ role: 'user', content: 'q' }], { apiKey: 'sk-test', getState, client });
        expect(res.stopReason).toBe('error');
        expect(res.text).toContain('pièce jointe');
        expect(res.text).not.toContain('réessaie dans un instant');
    });

    it('[SEC] réponse REFUSÉE (refusal) → stopReason refused + marqueur honnête + logError (pas « réessaie » aveugle)', async () => {
        const refused = { content: [{ type: 'text', text: '' }], stop_reason: 'refusal' } as unknown as Anthropic.Message;
        const { client } = scriptedClient([refused]);
        const res = await runAgentLoop([{ role: 'user', content: 'q' }], { apiKey: 'sk-test', getState, client });
        expect(res.stopReason).toBe('refused');
        expect(res.text).toContain('[Réponse refusée]');
        expect(logError).toHaveBeenCalledWith(expect.objectContaining({
            severity: 'warning', message: expect.stringMatching(/REFUS/),
        }));
    });

    it('[ceinture panel] réponse TRONQUÉE (max_tokens) → stopReason truncated + marqueur honnête + logError', async () => {
        // Discriminant : l'ancien code rendait stopReason 'end' — une phrase coupée en plein chiffre
        // était présentée avec l'autorité d'une réponse complète (no-fake-data version texte).
        const truncated = { content: [{ type: 'text', text: 'Ton taux marginal est de 47' }], stop_reason: 'max_tokens' } as unknown as Anthropic.Message;
        const { client } = scriptedClient([truncated]);
        const res = await runAgentLoop([{ role: 'user', content: 'q' }], { apiKey: 'sk-test', getState, client });
        expect(res.stopReason).toBe('truncated');
        expect(res.text).toContain('[Réponse coupée]');
        expect(logError).toHaveBeenCalledWith(expect.objectContaining({
            severity: 'warning', message: expect.stringMatching(/TRONQUÉE/),
        }));
    });

    it('[ceinture panel] un handler de tool qui THROW → tool_result is_error (ceinture dispatch), la conversation survit', async () => {
        // Discriminant : sans la ceinture de dispatchReadTool, le throw sortait de runAgentLoop et
        // cassait TOUTE la conversation. Prouvé via le paramètre injectable specsByName.
        const { dispatchReadTool } = await import('../../services/aiTools/dispatch');
        const evil = new Map([[
            'boom_tool',
            { kind: 'stateless', name: 'boom_tool', description: 'x', inputSchema: {}, handler: async () => { throw new TypeError('boom interne'); } },
        ]] as never);
        const res = await dispatchReadTool('boom_tool', {}, getState, evil as never);
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('boom_tool a échoué');
        expect(logError).toHaveBeenCalledWith(expect.objectContaining({
            source: 'ai', severity: 'error',
            message: expect.stringMatching(/exception non gérée/),
        }));
    });

    it('[ceinture panel] un callback UI (onToolUse) qui THROW n\'interrompt PAS la boucle (logError warning)', async () => {
        const { client } = scriptedClient([
            toolMsg('get_financial_overview', {}),
            textMsg('Fini.'),
        ]);
        const res = await runAgentLoop([{ role: 'user', content: 'q' }], {
            apiKey: 'sk-test', getState, client,
            onToolUse: () => { throw new Error('bug de rendu React'); },
        });
        expect(res.stopReason).toBe('end');
        expect(res.text).toContain('Fini.');
        expect(res.toolsUsed).toEqual(['get_financial_overview']); // le tool a bien tourné malgré le callback cassé
        expect(logError).toHaveBeenCalledWith(expect.objectContaining({
            source: 'ui', severity: 'warning',
            message: expect.stringMatching(/onToolUse a levé/),
        }));
    });

    it('[ceinture panel] ANNULATION utilisateur → stopReason aborted + « [Annulé] », SANS logError (action nominale)', async () => {
        // Discriminant (finding panel CRITIQUE, sonde mesurée) : l'ancien catch absorbait l'abort en
        // 'error' générique (« réessaie ») + logError severity error à CHAQUE clic Annuler (bruit
        // qui masque les vrais échecs API).
        const ctrl = new AbortController();
        const client: AgentClientLike = {
            messages: {
                stream: () => ({
                    on: () => undefined,
                    finalMessage: async () => { throw new DOMException('User cancelled', 'AbortError'); },
                }),
            },
        };
        ctrl.abort(new DOMException('User cancelled', 'AbortError'));
        const res = await runAgentLoop([{ role: 'user', content: 'q' }], {
            apiKey: 'sk-test', getState, client, signal: ctrl.signal,
        });
        expect(res.stopReason).toBe('aborted');
        expect(res.text).toContain('[Annulé]');
        expect(logError).not.toHaveBeenCalled();
    });

    // ── [AITOOLS-D] Routage des tools d'ÉCRITURE ─────────────────────────────────────────────

    it('[AITOOLS-D] SANS onWriteToolUse : les apply_* ne sont PAS déclarés à l\'API + is_error si hallucinés', async () => {
        // Structurel : une surface sans exécuteur de confirmation est INCAPABLE d'écrire — le tool
        // n'existe même pas côté API, et la ceinture rattrape un nom halluciné.
        const { client, requests } = scriptedClient([
            toolMsg('apply_debt', { name: 'Prêt auto', balance: 5000, interestRate: 7, minimumPayment: 150 }),
            textMsg('Ok.'),
        ]);
        await runAgentLoop([{ role: 'user', content: 'q' }], { apiKey: 'sk-test', getState, client });
        const tools = requests[0].tools as Array<{ name: string }>;
        expect(tools.some((t) => t.name.startsWith('apply_'))).toBe(false);
        const block = ((requests[1].messages as Anthropic.MessageParam[]).at(-1)!
            .content as Anthropic.ToolResultBlockParam[])[0];
        expect(block.is_error).toBe(true);
        expect(block.content as string).toContain('n\'est pas disponible');
    });

    it('[AITOOLS-D] AVEC onWriteToolUse : les 5 apply_* sont déclarés, args VALIDÉS puis routés vers l\'exécuteur', async () => {
        const { client, requests } = scriptedClient([
            toolMsg('apply_debt', { name: 'Prêt auto Civic', balance: 12000, interestRate: 6.5, minimumPayment: 320 }),
            textMsg('Dette proposée.'),
        ]);
        const onWriteToolUse = vi.fn(async () => ({ content: [{ type: 'text' as const, text: '{"applied":true}' }] }));
        const res = await runAgentLoop([{ role: 'user', content: 'q' }], {
            apiKey: 'sk-test', getState, client, onWriteToolUse,
        });
        expect(res.stopReason).toBe('end');
        const tools = requests[0].tools as Array<{ name: string }>;
        expect(tools.filter((t) => t.name.startsWith('apply_')).map((t) => t.name).sort()).toEqual([
            'apply_bank_statement', 'apply_broker_statement', 'apply_debt', 'apply_payslip', 'apply_tax_slip',
        ]);
        expect(onWriteToolUse).toHaveBeenCalledTimes(1);
        const [spec, args] = onWriteToolUse.mock.calls[0] as unknown as [{ name: string }, Record<string, unknown>];
        expect(spec.name).toBe('apply_debt');
        expect(args.balance).toBe(12000); // args VALIDÉS (zod) transmis à l'exécuteur
        const block = ((requests[1].messages as Anthropic.MessageParam[]).at(-1)!
            .content as Anthropic.ToolResultBlockParam[])[0];
        expect(block.is_error).toBeUndefined();
        expect(block.content as string).toContain('"applied":true');
    });

    it('[AITOOLS-D] args d\'écriture INVALIDES → is_error lisible, l\'exécuteur n\'est JAMAIS appelé', async () => {
        const { client, requests } = scriptedClient([
            toolMsg('apply_debt', { name: '', balance: Infinity }), // nom vide + Infinity (leçon MCP-WHATIF)
            textMsg('Corrigé.'),
        ]);
        const onWriteToolUse = vi.fn();
        await runAgentLoop([{ role: 'user', content: 'q' }], { apiKey: 'sk-test', getState, client, onWriteToolUse });
        expect(onWriteToolUse).not.toHaveBeenCalled();
        const block = ((requests[1].messages as Anthropic.MessageParam[]).at(-1)!
            .content as Anthropic.ToolResultBlockParam[])[0];
        expect(block.is_error).toBe(true);
        expect(block.content as string).toContain('Arguments invalides');
    });

    it('[AITOOLS-D] l\'exécuteur d\'écriture qui THROW → is_error + logError, la conversation survit (ceinture)', async () => {
        const { client, requests } = scriptedClient([
            toolMsg('apply_debt', { name: 'Prêt', balance: 100, interestRate: 5, minimumPayment: 10 }),
            textMsg('Fini.'),
        ]);
        const onWriteToolUse = vi.fn(async () => { throw new Error('IndexedDB explosé'); });
        const res = await runAgentLoop([{ role: 'user', content: 'q' }], {
            apiKey: 'sk-test', getState, client, onWriteToolUse,
        });
        expect(res.stopReason).toBe('end'); // la boucle continue, pas de throw
        const block = ((requests[1].messages as Anthropic.MessageParam[]).at(-1)!
            .content as Anthropic.ToolResultBlockParam[])[0];
        expect(block.is_error).toBe(true);
        expect(block.content as string).toContain('a échoué');
        expect(logError).toHaveBeenCalledWith(expect.objectContaining({
            source: 'ai', severity: 'error',
            message: expect.stringMatching(/exécuteur d'écriture apply_debt a levé/),
        }));
    });

    it('[AITOOLS-D panel] ANNULATION pendant le 1er write d\'un lot → les tool_use RESTANTS du même tour sont court-circuités (pas de 2e confirmation)', async () => {
        // Discriminant (finding panel mesuré) : 2 apply_* dans UN tour ; annuler pendant le 1er modal
        // ne doit PAS ouvrir le 2e. Avant le garde : onWriteToolUse était appelé 2×.
        const twoWrites = {
            content: [
                { type: 'tool_use', id: 'w1', name: 'apply_debt', input: { name: 'Dette 1', balance: 100, interestRate: 5, minimumPayment: 10 } },
                { type: 'tool_use', id: 'w2', name: 'apply_debt', input: { name: 'Dette 2', balance: 200, interestRate: 6, minimumPayment: 20 } },
            ],
            stop_reason: 'tool_use',
        } as unknown as Anthropic.Message;
        const { client, requests } = scriptedClient([twoWrites, textMsg('fin')]);
        const ctrl = new AbortController();
        let writeCalls = 0;
        const onWriteToolUse = vi.fn(async () => {
            writeCalls += 1;
            ctrl.abort(new DOMException('User cancelled', 'AbortError')); // simule le clic Annuler pendant le 1er modal
            return { content: [{ type: 'text' as const, text: '{"applied":false,"refusedByUser":true}' }] };
        });
        const res = await runAgentLoop([{ role: 'user', content: 'ajoute ces deux dettes' }], {
            apiKey: 'sk-test', getState, client, signal: ctrl.signal, onWriteToolUse,
        });
        expect(writeCalls).toBe(1); // le 2e write n'est JAMAIS exécuté (court-circuit sur signal aborté)
        // Le tour suivant appelle stream() avec le signal aborté → stopReason aborted (pas d'API gaspillée).
        expect(res.stopReason).toBe('aborted');
        // Le 2e tour a bien été construit avec un tool_result « annulé » pour w2 (l'API exige 1 result/tool_use).
        const firstTurnResults = (requests[1].messages as Anthropic.MessageParam[]).at(-1)!
            .content as Anthropic.ToolResultBlockParam[];
        expect(firstTurnResults.find((r) => r.tool_use_id === 'w2')?.content).toContain('Annulé');
        expect(firstTurnResults.find((r) => r.tool_use_id === 'w2')?.is_error).toBe(true);
    });

    it('[ceinture panel] cap max_turns : l\'historique retourné se TERMINE par un tour assistant (reprise saine)', async () => {
        const { client } = scriptedClient([toolMsg('get_financial_overview', {})]);
        const res = await runAgentLoop([{ role: 'user', content: 'q' }], {
            apiKey: 'sk-test', getState, client, maxTurns: 2,
        });
        expect(res.stopReason).toBe('max_turns');
        expect(res.messages.at(-1)!.role).toBe('assistant'); // ancien code : finissait sur user/tool_result
    });

    it('[B4-CHAT-COST] usage ACCUMULÉ sur tous les tours (input/output/cache), champs cache absents = 0', async () => {
        const withUsage = (m: Anthropic.Message, u: Record<string, number>): Anthropic.Message =>
            ({ ...m, usage: u } as unknown as Anthropic.Message);
        const { client } = scriptedClient([
            withUsage(toolMsg('get_financial_overview', {}), { input_tokens: 1000, output_tokens: 50 }),
            withUsage(textMsg('Voilà.'), { input_tokens: 200, output_tokens: 30, cache_read_input_tokens: 800, cache_creation_input_tokens: 100 }),
        ]);
        const res = await runAgentLoop([{ role: 'user', content: 'q' }], { apiKey: 'sk-test', getState, client });
        expect(res.usage).toEqual({ inputTokens: 1200, outputTokens: 80, cacheReadTokens: 800, cacheWriteTokens: 100 });
    });

    it('[B4-CHAT-COST] les tours DÉJÀ payés restent comptés même quand la boucle finit en ÉCHEC/annulation', async () => {
        // Tour 1 abouti (payé), tour 2 : l'appel API rejette → stopReason error, usage du tour 1 conservé.
        const usageMsg = { ...toolMsg('get_financial_overview', {}), usage: { input_tokens: 500, output_tokens: 40 } } as unknown as Anthropic.Message;
        let call = 0;
        const client: AgentClientLike = {
            messages: {
                stream: () => ({
                    on: () => undefined,
                    finalMessage: async () => {
                        call += 1;
                        if (call === 1) return usageMsg;
                        throw new Error('503 service unavailable');
                    },
                }),
            },
        };
        const res = await runAgentLoop([{ role: 'user', content: 'q' }], { apiKey: 'sk-test', getState, client });
        expect(res.stopReason).toBe('error');
        expect(res.usage).toEqual({ inputTokens: 500, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 });
    });

    it('[B4-CHAT-COST] message SANS champ usage (mock/SDK inattendu) → zéros, jamais NaN', async () => {
        const { client } = scriptedClient([textMsg('OK.')]);
        const res = await runAgentLoop([{ role: 'user', content: 'q' }], { apiKey: 'sk-test', getState, client });
        expect(res.usage).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
    });
});
