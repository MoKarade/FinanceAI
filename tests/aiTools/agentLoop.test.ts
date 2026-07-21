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
            stream: (params) => {
                requests.push(params);
                const msg = script[Math.min(i, script.length - 1)];
                i += 1;
                return { on: () => undefined, finalMessage: async () => msg };
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
            toolMsg('apply_debt', { name: 'x' }), // write-tool : PAS dans le registre lecture (Lot B)
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

    it('[ceinture panel] cap max_turns : l\'historique retourné se TERMINE par un tour assistant (reprise saine)', async () => {
        const { client } = scriptedClient([toolMsg('get_financial_overview', {})]);
        const res = await runAgentLoop([{ role: 'user', content: 'q' }], {
            apiKey: 'sk-test', getState, client, maxTurns: 2,
        });
        expect(res.stopReason).toBe('max_turns');
        expect(res.messages.at(-1)!.role).toBe('assistant'); // ancien code : finissait sur user/tool_result
    });
});
