// tests/aiTools/toolSchemaContract.test.ts
//
// [S5-ZOD4] La garde de parité (`tests/mcp/writeToolParity.test.ts`) prouve que le serveur MCP et le
// registre disent la même chose. Elle ne voit pas une dérive du convertisseur lui-même — zod 3 → zod 4
// (24/09/2026) a fait perdre `additionalProperties: false` à toutes les surfaces à la fois, parité
// toujours verte. (Le chat in-app, seconde surface, a été retiré le 29/10/2026, FinanceAI#15 ; le
// convertisseur de ce test reprend ses options : `z.toJSONSchema`, draft-7, côté entrée.)
// Ce fichier fige le CONTRAT que le modèle lit, indépendamment du convertisseur :
//   - schéma d'entrée = objet, sans clé méta `$schema` (hors contrat `Tool.InputSchema` d'Anthropic) ;
//   - tout est INLINE : aucun `$ref` / `$defs` / `definitions` (le SDK Anthropic n'en attend pas) ;
//   - un champ avec valeur par défaut reste FACULTATIF (conversion côté ENTRÉE : côté sortie, zod le
//     marquerait obligatoire et le modèle devrait le remplir) ;
//   - les variantes de `simulate_what_if` restent distinguées par un `kind` constant et unique.

import { describe, it, expect } from 'vitest';
import { READ_SPECS, WRITE_SPECS } from '../../services/aiTools/registry';
import { z } from 'zod';
import type { AnyToolSpec } from '../../mcp/tools/_toolSpec';

type Schema = Record<string, unknown>;

/** Mêmes options que le SDK MCP pour un schéma zod 4 (draft-7, côté entrée) ; la clé méta `$schema` est retirée. */
function versSchemasModele(specs: readonly AnyToolSpec[]): Array<{ name: string; input_schema: Record<string, unknown> }> {
    return specs.map((spec) => {
        const schema = z.toJSONSchema(z.object(spec.inputSchema), { target: 'draft-7', io: 'input' }) as Record<string, unknown>;
        delete schema.$schema;
        return { name: spec.name, input_schema: schema };
    });
}

const tools = versSchemasModele([...READ_SPECS, ...WRITE_SPECS]);
const byName = new Map(tools.map((t) => [t.name, t.input_schema as unknown as Schema]));

function schemaOf(name: string): Schema {
    const schema = byName.get(name);
    if (!schema) throw new Error(`tool absent du registre : ${name}`);
    return schema;
}

describe('[S5-ZOD4] contrat des JSON Schema envoyés au modèle', () => {
    it('couvre tout le registre (anti-vacuité)', () => {
        expect(tools.length).toBe(READ_SPECS.length + WRITE_SPECS.length);
        expect(tools.length).toBeGreaterThanOrEqual(19);
    });

    it.each(tools.map((t) => [t.name, t.input_schema] as const))('%s : objet inline, sans méta', (_name, schema) => {
        const s = schema as unknown as Schema;
        expect(s.type).toBe('object');
        expect(s).not.toHaveProperty('$schema');
        const json = JSON.stringify(s);
        expect(json).not.toMatch(/"\$ref"|"\$defs"|"definitions"/);
    });

    it('un champ avec valeur par défaut reste facultatif (conversion côté entrée)', () => {
        const projection = schemaOf('get_projection');
        const props = projection.properties as Record<string, Schema>;
        expect(props.years.default).toBe(20);
        expect(props.scenario.default).toBe('BASE');
        expect((projection.required as string[] | undefined) ?? []).not.toContain('years');
        expect((projection.required as string[] | undefined) ?? []).not.toContain('scenario');

        const search = schemaOf('search_transactions');
        expect((search.properties as Record<string, Schema>).limit.default).toBe(50);
        expect((search.required as string[] | undefined) ?? []).not.toContain('limit');
    });

    it('simulate_what_if : chaque variante porte un `kind` constant et unique', () => {
        const changes = (schemaOf('simulate_what_if').properties as Record<string, Schema>).changes;
        const items = changes.items as Schema;
        const variants = (items.oneOf ?? items.anyOf) as Schema[] | undefined;
        expect(Array.isArray(variants)).toBe(true);
        const kinds = (variants ?? []).map((v) => ((v.properties as Record<string, Schema>).kind ?? {}).const);
        expect(kinds.length).toBeGreaterThanOrEqual(2);
        expect(kinds.every((k) => typeof k === 'string')).toBe(true);
        expect(new Set(kinds).size).toBe(kinds.length);
        for (const v of variants ?? []) expect(v.required as string[]).toContain('kind');
    });
});
