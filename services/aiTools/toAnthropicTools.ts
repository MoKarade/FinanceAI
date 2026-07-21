// services/aiTools/toAnthropicTools.ts
//
// [AITOOLS-B] Convertit les specs neutres (schéma zod « raw shape », le même que server.tool côté
// MCP) au format `tools[]` du SDK Anthropic (JSON Schema). Même source de vérité des schémas des
// deux côtés → un champ ajouté à un spec est vu par claude.ai ET par le chat in-app sans dérive.

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type Anthropic from '@anthropic-ai/sdk';
import type { AnyReadToolSpec } from '../../mcp/tools/_toolSpec';

export function toAnthropicTools(specs: readonly AnyReadToolSpec[]): Anthropic.Tool[] {
    return specs.map((spec) => {
        // $refStrategy 'none' : schémas inline (le SDK Anthropic n'attend pas de $ref/definitions).
        const schema = zodToJsonSchema(z.object(spec.inputSchema), { $refStrategy: 'none' }) as Record<string, unknown>;
        // [Finding panel 2026-07-21] zod-to-json-schema appose une clé méta `$schema` top-level,
        // hors contrat Tool.InputSchema d'Anthropic — retirée (le cast masquait l'écart de type).
        delete schema.$schema;
        return {
            name: spec.name,
            description: spec.description,
            input_schema: schema as Anthropic.Tool.InputSchema,
        };
    });
}
