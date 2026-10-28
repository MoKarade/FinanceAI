// services/aiTools/toAnthropicTools.ts
//
// [AITOOLS-B] Convertit les specs neutres (schéma zod « raw shape », le même que server.tool côté
// MCP) au format `tools[]` du SDK Anthropic (JSON Schema). Même source de vérité des schémas des
// deux côtés → un champ ajouté à un spec est vu par claude.ai ET par le chat in-app sans dérive.

import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import type { AnyToolSpec } from '../../mcp/tools/_toolSpec';

// [AITOOLS-D] Accepte lecture ET écriture (name/description/inputSchema communs aux deux formes).
export function toAnthropicTools(specs: readonly AnyToolSpec[]): Anthropic.Tool[] {
    return specs.map((spec) => {
        // [S5-ZOD4] Convertisseur natif de zod 4, avec EXACTEMENT les options du SDK MCP pour un schéma
        // zod 4 (`toJsonSchemaCompat` : draft-7, côté entrée) → claude.ai et le chat in-app reçoivent
        // le même JSON Schema par construction (garde : tests/mcp/writeToolParity.test.ts).
        // `zod-to-json-schema` ne lit pas zod 4 ; il a été retiré.
        const schema = z.toJSONSchema(z.object(spec.inputSchema), { target: 'draft-7', io: 'input' }) as Record<string, unknown>;
        // [Finding panel 2026-07-21] Le convertisseur appose une clé méta `$schema` top-level,
        // hors contrat Tool.InputSchema d'Anthropic — retirée (le cast masquait l'écart de type).
        delete schema.$schema;
        return {
            name: spec.name,
            description: spec.description,
            input_schema: schema as Anthropic.Tool.InputSchema,
        };
    });
}
