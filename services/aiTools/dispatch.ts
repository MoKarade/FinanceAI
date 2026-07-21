// services/aiTools/dispatch.ts
//
// [AITOOLS-B] Route un `tool_use` du chat in-app vers le handler du spec correspondant, avec
// VALIDATION ZOD EXPLICITE : côté MCP, `server.tool()` valide les arguments AVANT le handler ;
// en bypassant McpServer, cette étape disparaîtrait silencieusement (finding architecte) — un
// argument malformé (type faux, champ manquant) doit rendre un tool_result d'erreur LISIBLE
// (Claude peut se corriger et rappeler le tool), jamais un throw dans la boucle agentique.

import { z } from 'zod';
import type { StateProvider, ToolTextResult } from '../../mcp/tools/_dataAware';
import { errorContent } from '../../mcp/tools/_dataAware';
import { logError } from '../errorLogger';
import type { AnyReadToolSpec } from '../../mcp/tools/_toolSpec';
import { READ_SPECS_BY_NAME } from './registry';

export async function dispatchReadTool(
    name: string,
    rawArgs: unknown,
    getState: StateProvider,
    // Injectable pour les tests des ceintures (défaut : le vrai registre).
    specsByName: ReadonlyMap<string, AnyReadToolSpec> = READ_SPECS_BY_NAME,
): Promise<ToolTextResult> {
    const spec = specsByName.get(name);
    if (!spec) {
        return errorContent(`Tool inconnu ou non disponible dans l'app : ${name}.`);
    }
    const parsed = z.object(spec.inputSchema).safeParse(rawArgs ?? {});
    if (!parsed.success) {
        const detail = parsed.error.issues
            .map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`)
            .join(' ; ');
        return errorContent(`Arguments invalides pour ${name} — ${detail}`);
    }
    // Les handlers data-aware passent par withState (erreurs converties en réponse) et les
    // stateless actuels sont de l'arithmétique pure — MAIS l'invariant « jamais de throw vers la
    // boucle agentique » doit être STRUCTUREL, pas supposé (finding panel 2026-07-21 : un futur
    // handler stateless qui lève aurait cassé TOUTE la conversation). Ceinture symétrique à
    // withState. Aucun handler ne MUTE l'état (exigence Marc « aucune donnée changée », prouvée
    // par test + snapshot cloné à la frontière appStateProvider).
    try {
        return await spec.handler(parsed.data, getState);
    } catch (err) {
        logError({
            source: 'ai', severity: 'error',
            message: `Chat in-app : le tool ${name} a levé une exception non gérée (ceinture dispatch).`,
            error: err instanceof Error ? err : new Error(String(err)),
        });
        return errorContent(`Le tool ${name} a échoué. ${err instanceof Error ? err.message : String(err)}`);
    }
}
