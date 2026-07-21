// services/aiTools/agentLoop.ts
//
// [AITOOLS-B] Boucle agentique du chat Claude in-app : envoie les messages + tools au SDK
// Anthropic (streaming), exécute LOCALEMENT chaque tool_use (dispatch → specs partagés avec le
// MCP), renvoie les tool_result, et boucle jusqu'à la réponse texte finale.
//
// Garde-fous (findings architecte, plan 2026-07-21) :
// - CAP DUR de tours (défaut 6) : une boucle qui ne converge pas s'arrête avec un message honnête
//   + logError (BYOK : le coût retombe sur la clé de Marc — jamais de boucle infinie).
// - État CAPTURÉ UNE FOIS à l'entrée : plusieurs tool_use du même envoi lisent le MÊME snapshot
//   (cohérence des chiffres entre tools d'un même tour de question).
// - Timeout PAR TOUR (makeTimeoutSignal, réutilisé de services/claude.ts) + signal externe (Annuler).
// - Les erreurs de tool deviennent des tool_result `is_error` (Claude peut se corriger) — jamais
//   de throw qui casserait la conversation.

import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { makeClient, makeTimeoutSignal, MODEL_SONNET } from '../claude';
import { logError } from '../errorLogger';
import type { StateProvider, ToolTextResult } from '../../mcp/tools/_dataAware';
import { errorContent } from '../../mcp/tools/_dataAware';
import type { AnyWriteToolSpec } from '../../mcp/tools/_toolSpec';
import { dispatchReadTool } from './dispatch';
import { toAnthropicTools } from './toAnthropicTools';
import { READ_SPECS, WRITE_SPECS, WRITE_SPECS_BY_NAME } from './registry';
import { buildAgentSystemPrompt } from './systemPrompt';

const DEFAULT_MAX_TURNS = 6;
const DEFAULT_TURN_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 2048;

/** Sous-ensemble STRUCTUREL du client Anthropic utilisé par la boucle (injectable en test). */
export interface AgentStreamLike {
    on(event: 'text', cb: (delta: string) => void): unknown;
    finalMessage(): Promise<Anthropic.Message>;
}
export interface AgentClientLike {
    messages: {
        stream(params: Record<string, unknown>, opts?: { signal?: AbortSignal }): AgentStreamLike;
    };
}

export interface AgentLoopOptions {
    apiKey: string;
    /** Fournit l'AppState — appelé UNE fois à l'entrée (snapshot cohérent pour tout l'envoi). */
    getState: StateProvider;
    /** Streaming du texte assistant vers l'UI (deltas). */
    onTextDelta?: (delta: string) => void;
    /** Transparence : notifié au début de chaque exécution de tool (chip « a consulté : X »). */
    onToolUse?: (toolName: string) => void;
    /** [AITOOLS-D] Exécuteur d'ÉCRITURE (writeExecutor : diff → CONFIRMATION → apply/refus). Les
     *  5 tools apply_* ne sont DÉCLARÉS à l'API que si ce callback est fourni — une surface sans
     *  confirmation (tests, futur usage lecture seule) reste STRUCTURELLEMENT incapable d'écrire. */
    onWriteToolUse?: (spec: AnyWriteToolSpec, args: Record<string, unknown>) => Promise<ToolTextResult>;
    signal?: AbortSignal;
    maxTurns?: number;
    turnTimeoutMs?: number;
    model?: string;
    maxTokens?: number;
    system?: string;
    /** Client injectable (tests). Défaut : makeClient(apiKey) — même transport que le reste de l'app. */
    client?: AgentClientLike;
}

export interface AgentLoopResult {
    /** Texte assistant concaténé (la réponse finale ; les tours intermédiaires en font partie s'ils portaient du texte). */
    text: string;
    /** Noms des tools exécutés, dans l'ordre. */
    toolsUsed: string[];
    turns: number;
    /** 'end' = fin normale ; 'max_turns' = cap d'outils ; 'truncated' = réponse COUPÉE (max_tokens) ;
     *  'refused' = refus du modèle ; 'aborted' = ANNULATION utilisateur (nominale — jamais logError) ;
     *  'error' = échec API/état (texte accumulé + message honnête).
     *  [Findings panel 2026-07-21] : collapser max_tokens en « fin normale » présentait une phrase
     *  coupée en plein chiffre avec la même autorité qu'une réponse complète (no-fake-data, version
     *  texte) ; collapser l'abort en 'error' affichait « réessaie » + polluait les logs d'erreur à
     *  chaque clic Annuler (bruit qui masque les VRAIS échecs API). */
    stopReason: 'end' | 'max_turns' | 'truncated' | 'refused' | 'aborted' | 'error';
    /** Renseigné quand stopReason === 'error' (message technique, déjà journalisé via logError). */
    errorMessage?: string;
    /** Historique complet (avec blocs tool_use/tool_result) de CET envoi. ⚠️ État réel (finding
     *  panel) : le consommateur actuel (useAiChat) le JETTE à chaque tour — les tours suivants
     *  repartent du transcript TEXTE seul, et le modèle re-consulte les tools au besoin (lecture
     *  idempotente sur le même état → mêmes chiffres). Jamais persisté/synchronisé (ADR-4). */
    messages: Anthropic.MessageParam[];
}

/** Aplati les blocs texte d'un ToolTextResult en string pour le tool_result Anthropic. */
function flattenContent(content: Array<{ type: 'text'; text: string }>): string {
    return content.map((b) => b.text).join('\n\n');
}

/**
 * [AITOOLS-D] Route un tool_use : écriture (validation zod PUIS exécuteur de confirmation — mêmes
 * ceintures que la lecture : erreurs → tool_result lisible, jamais de throw) ou lecture (dispatch).
 */
async function dispatchAnyTool(
    name: string,
    rawArgs: unknown,
    getState: StateProvider,
    onWriteToolUse?: (spec: AnyWriteToolSpec, args: Record<string, unknown>) => Promise<ToolTextResult>,
): Promise<ToolTextResult> {
    const writeSpec = WRITE_SPECS_BY_NAME.get(name);
    if (writeSpec) {
        if (!onWriteToolUse) {
            // Structurel : sans exécuteur de confirmation, l'écriture est IMPOSSIBLE (le tool ne
            // devrait même pas être déclaré — ceinture au cas où le modèle hallucine le nom).
            return errorContent(`Le tool d'écriture ${name} n'est pas disponible sur cette surface.`);
        }
        const parsed = z.object(writeSpec.inputSchema).safeParse(rawArgs ?? {});
        if (!parsed.success) {
            const detail = parsed.error.issues
                .map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`)
                .join(' ; ');
            return errorContent(`Arguments invalides pour ${name} — ${detail}`);
        }
        try {
            return await onWriteToolUse(writeSpec, parsed.data as Record<string, unknown>);
        } catch (err) {
            logError({
                source: 'ai', severity: 'error',
                message: `Chat in-app : l'exécuteur d'écriture ${name} a levé (ceinture) — AUCUNE écriture appliquée.`,
                error: err instanceof Error ? err : new Error(String(err)),
            });
            return errorContent(`L'écriture ${name} a échoué. ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return dispatchReadTool(name, rawArgs, getState);
}

/** Invoque un callback UI en l'ISOLANT : une erreur de rendu ne casse JAMAIS la boucle agentique
 *  (finding panel silent-failure 2026-07-21 — un throw de couche présentation perdait toute la
 *  conversation + les tool_results déjà payés). */
function safeCallback(fn: (() => void) | undefined, label: string): void {
    if (!fn) return;
    try {
        fn();
    } catch (e) {
        logError({
            source: 'ui', severity: 'warning',
            message: `Chat in-app : le callback UI ${label} a levé — ignoré (la boucle continue).`,
            error: e instanceof Error ? e : new Error(String(e)),
        });
    }
}

export async function runAgentLoop(
    history: Anthropic.MessageParam[],
    opts: AgentLoopOptions,
): Promise<AgentLoopResult> {
    const client = opts.client ?? (makeClient(opts.apiKey) as unknown as AgentClientLike);
    // [AITOOLS-D] Les tools d'écriture ne sont déclarés QUE si un exécuteur de confirmation existe.
    const tools = toAnthropicTools(opts.onWriteToolUse ? [...READ_SPECS, ...WRITE_SPECS] : READ_SPECS);
    const maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS;
    const system = opts.system ?? buildAgentSystemPrompt();

    const messages: Anthropic.MessageParam[] = [...history];
    const toolsUsed: string[] = [];
    let text = '';

    // Résultat d'ÉCHEC honnête : texte accumulé + trace + historique (rien de perdu pour l'UI).
    const failResult = (errorMessage: string, turns: number): AgentLoopResult => {
        text += (text ? '\n\n' : '')
            + '[Erreur] La conversation n\'a pas pu aboutir — réessaie dans un instant.';
        return { text, toolsUsed, turns, stopReason: 'error', errorMessage, messages };
    };

    // Snapshot UNIQUE de l'état pour tout l'envoi (cohérence inter-tools du même tour de question).
    // Peut lever si l'état du store est CORROMPU (validateAppStateShape) → échec honnête journalisé,
    // jamais des zéros plausibles (finding panel silent-failure : null ≠ absence légitime).
    let state: Awaited<ReturnType<StateProvider>>;
    try {
        state = await opts.getState();
    } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        logError({
            source: 'storage', severity: 'error',
            message: 'Chat in-app : état illisible/invalide au démarrage de la boucle — conversation refusée.',
            error: err,
        });
        return failResult(err.message, 0);
    }
    const frozenState: StateProvider = async () => state;

    for (let turn = 1; turn <= maxTurns; turn++) {
        const { signal, cleanup } = makeTimeoutSignal(opts.signal, opts.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS);
        let msg: Anthropic.Message;
        try {
            const stream = client.messages.stream({
                model: opts.model ?? MODEL_SONNET,
                max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
                system,
                messages,
                tools,
            }, { signal });
            if (opts.onTextDelta) {
                const cb = opts.onTextDelta;
                stream.on('text', (delta) => safeCallback(() => cb(delta), 'onTextDelta'));
            }
            msg = await stream.finalMessage();
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            // [Finding panel CRITIQUE #2] ANNULATION utilisateur ≠ panne : détectée via le signal
            // externe (le timeout interne, lui, n'aborte pas opts.signal) ou le nom de l'erreur.
            // Action nominale → AUCUN logError (sinon chaque clic Annuler pollue les logs d'erreur
            // et masque les vrais échecs API), texte honnête « [Annulé] ».
            if (opts.signal?.aborted || err.name === 'AbortError' || e instanceof DOMException) {
                text += (text ? '\n\n' : '') + '[Annulé]';
                return { text, toolsUsed, turns: turn, stopReason: 'aborted', messages };
            }
            // [Finding panel CRITIQUE] Échec API (réseau, 429/5xx, timeout) : journaliser et rendre
            // un résultat HONNÊTE (texte déjà streamé + historique préservés pour l'UI/retry)
            // au lieu de rejeter en perdant tout le travail déjà payé.
            logError({
                source: 'ai', severity: 'error',
                message: `Chat in-app : échec de l'appel Claude au tour ${turn} — conversation interrompue.`,
                error: err,
            });
            return failResult(err.message, turn);
        } finally {
            cleanup();
        }

        for (const block of msg.content) {
            if (block.type === 'text') text += (text ? '\n' : '') + block.text;
        }

        if (msg.stop_reason !== 'tool_use') {
            // [Finding panel ÉLEVÉ] Distinguer les fins DÉGRADÉES d'une fin normale : une réponse
            // coupée par max_tokens (potentiellement en plein chiffre) ou un refus ne doit jamais
            // être présentée avec l'autorité d'une réponse complète.
            if (msg.stop_reason === 'max_tokens') {
                logError({
                    source: 'ai', severity: 'warning',
                    message: 'Chat in-app : réponse TRONQUÉE (max_tokens) — signalée à l\'utilisateur.',
                });
                text += '\n\n[Réponse coupée] La réponse a atteint sa longueur maximale — demande-moi de continuer.';
                return { text, toolsUsed, turns: turn, stopReason: 'truncated', messages };
            }
            if (msg.stop_reason === 'refusal') {
                return { text, toolsUsed, turns: turn, stopReason: 'refused', messages };
            }
            // 'end_turn' / 'stop_sequence' — fins normales. NB : 'pause_turn' (tools SERVEUR type
            // web-search) est inatteignable ici (aucun tool serveur configuré) ; si un futur lot en
            // ajoute, ce chemin devra le gérer explicitement.
            return { text, toolsUsed, turns: turn, stopReason: 'end', messages };
        }

        // Tour d'outils : exécuter chaque tool_use LOCALEMENT (séquentiel — déterminisme), puis
        // renvoyer les tool_result dans UN message user (contrat de l'API).
        const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
        messages.push({ role: 'assistant', content: msg.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const tu of toolUses) {
            safeCallback(opts.onToolUse ? () => opts.onToolUse!(tu.name) : undefined, 'onToolUse');
            toolsUsed.push(tu.name);
            const res = await dispatchAnyTool(tu.name, tu.input, frozenState, opts.onWriteToolUse);
            results.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: flattenContent(res.content),
                ...(res.isError ? { is_error: true } : {}),
            });
        }
        messages.push({ role: 'user', content: results });
    }

    // Cap atteint : arrêt honnête (jamais de boucle infinie sur la clé BYOK de l'utilisateur).
    logError({
        source: 'ai', severity: 'warning',
        message: `Chat in-app : cap de ${maxTurns} tours d'outils atteint sans réponse finale — boucle arrêtée.`,
        context: { toolsUsed: toolsUsed.length },
    });
    const capNote = `[Limite atteinte] J'ai consulté ${toolsUsed.length} outils sans parvenir à conclure — reformule ta question ou découpe-la.`;
    text += (text ? '\n\n' : '') + capNote;
    // Clôturer l'historique par un tour ASSISTANT (finding panel : finir sur un tour user/tool_result
    // ferait fusionner d'anciens tool_results JSON avec la PROCHAINE question de l'utilisateur).
    messages.push({ role: 'assistant', content: capNote });
    return { text, toolsUsed, turns: maxTurns, stopReason: 'max_turns', messages };
}
