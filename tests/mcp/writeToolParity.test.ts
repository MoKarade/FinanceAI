// tests/mcp/writeToolParity.test.ts
//
// [MCP-WRITE-PARITY-GUARD] Les tools d'ÉCRITURE sont exposés par DEUX surfaces indépendantes :
//   - le serveur MCP (`mcp/server.ts`, bloc `if (options.store)`) — chemin claude.ai / Claude Desktop ;
//   - `WRITE_SPECS` (`services/aiTools/registry.ts`) — chemin chat Claude IN-APP.
// Rien ne les reliait : un tool ajouté ou retiré d'UN SEUL registre ne serait vu ni par `tsc`
// (deux listes de littéraux, aucun type partagé qui les contraigne), ni par le lint, ni par le gate.
// Le retrait de `upsert_savings_goal` (lot 29) est passé par les deux à la main — la prochaine fois
// c'est cette garde qui le prouve, pas la mémoire.
//
// La mesure est BEHAVIORALE (pas un scan de source) : on démarre le VRAI serveur sur un transport
// en mémoire et on lui demande `tools/list`, exactement comme le ferait claude.ai. Un tool déclaré
// mais jamais enregistré (ou l'inverse) ne peut pas se cacher derrière un `grep`.

import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../mcp/server';
import { makeStateStore } from '../../mcp/state/stateStore';
import { READ_SPECS, WRITE_SPECS } from '../../services/aiTools/registry';
import { toAnthropicTools } from '../../services/aiTools/toAnthropicTools';

/**
 * Tools que le serveur MCP expose et que le chat in-app n'a PAS à exposer — exclusions
 * DÉLIBÉRÉES, énumérées ici avec leur raison (un périmètre borné en silence se lit comme
 * « tout est couvert », leçon `AUDITER-LE-FILTRE-AUTANT-QUE-LA-LISTE`) :
 *   - `ping` : health-check du serveur, sans objet dans le navigateur ;
 *   - `connect_drive` : OAuth loopback Node — l'app EST déjà la source de données.
 */
const SERVER_ONLY = ['ping', 'connect_drive'] as const;

/**
 * Normalise un JSON Schema pour comparer les DEUX convertisseurs. Les specs partagent le même objet
 * zod, mais chaque surface le rend avec son propre convertisseur : le SDK MCP en interne côté
 * serveur, `zod-to-json-schema` côté `toAnthropicTools`. MESURÉ sur les 19 tools : la sortie est
 * identique partout SAUF deux écarts de MÉTA, tous deux sans effet sur ce que le modèle peut
 * produire — et aucun autre :
 *   - `$schema` : posé par `zod-to-json-schema`, retiré par `toAnthropicTools` (hors contrat
 *     `Tool.InputSchema` d'Anthropic) ; présent côté MCP.
 *   - `additionalProperties: false` sur les 3 tools à schéma VIDE (`get_financial_overview`,
 *     `get_holdings`, `get_next_best_actions`) : le SDK MCP l'omet quand il n'y a aucune propriété.
 * On neutralise EXACTEMENT ces deux-là — donc toute divergence de `properties`, de `type`, de
 * `required` ou de `description` fait rougir la garde (finding ai-reviewer, panel PR #756).
 */
function normalizeSchema(raw: unknown): unknown {
    const schema = { ...(raw as Record<string, unknown>) };
    delete schema.$schema;
    // Condition sur la VALEUR exacte mesurée (`false`), pas seulement sur « schéma vide » : sinon
    // la même clause avalerait aussi un futur `additionalProperties: true` (permissif) posé par une
    // seule des deux surfaces — un vrai changement de contrat de validation, pas un écart de méta
    // (finding code-reviewer, 2e passe panel PR #756).
    const props = (schema.properties ?? {}) as Record<string, unknown>;
    if (schema.additionalProperties === false && Object.keys(props).length === 0) delete schema.additionalProperties;
    return schema;
}

async function listServerTools(withStore: boolean): Promise<Array<{ name: string; description?: string; inputSchema?: unknown }>> {
    const server = createServer(withStore ? { store: makeStateStore(null) } : {});
    const client = new Client({ name: 'test-parity', version: '0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const { tools } = await client.listTools();
    await client.close();
    return tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
}

describe('[MCP-WRITE-PARITY-GUARD] serveur MCP ↔ registre du chat in-app', () => {
    it('les tools d\'ÉCRITURE du serveur sont EXACTEMENT ceux de WRITE_SPECS (dans les deux sens)', async () => {
        const withStore = await listServerTools(true);
        const withoutStore = await listServerTools(false);

        // Anti-vacuité : sans magasin, le serveur expose déjà des tools (donc la soustraction
        // ci-dessous n'est pas « tout moins rien »), et le bloc d'écriture en ajoute vraiment.
        expect(withoutStore.length).toBeGreaterThanOrEqual(10);
        expect(withStore.length).toBeGreaterThan(withoutStore.length);

        const readOnlyNames = new Set(withoutStore.map((t) => t.name));
        const serverWriteNames = withStore.map((t) => t.name).filter((n) => !readOnlyNames.has(n)).sort();
        const registryWriteNames = WRITE_SPECS.map((s) => s.name).sort();

        // L'ÉGALITÉ d'abord : c'est elle qui porte la garde. Le plancher de volume vient APRÈS,
        // sinon un retrait dans WRITE_SPECS ferait rougir le plancher et masquerait la vraie cause.
        expect(
            serverWriteNames,
            'un tool d\'écriture existe dans UN SEUL des deux registres — une surface peut écrire ce que l\'autre ignore',
        ).toEqual(registryWriteNames);
        expect(registryWriteNames.length).toBeGreaterThanOrEqual(8); // volume (leçon FISC-CONST-LINT)
    });

    it('les tools de LECTURE du serveur sont EXACTEMENT ceux de READ_SPECS, hors exclusions déclarées', async () => {
        const withoutStore = await listServerTools(false);
        const serverReadNames = withoutStore
            .map((t) => t.name)
            .filter((n) => !SERVER_ONLY.includes(n as (typeof SERVER_ONLY)[number]))
            .sort();
        const registryReadNames = READ_SPECS.map((s) => s.name).sort();

        // Anti-vacuité du FILTRE : chaque exclusion doit correspondre à un tool RÉELLEMENT exposé
        // (une exclusion périmée masquerait un tool absent au lieu de le signaler).
        for (const name of SERVER_ONLY) {
            expect(withoutStore.some((t) => t.name === name), `exclusion périmée : « ${name} » n'est plus exposé`).toBe(true);
        }
        expect(registryReadNames.length).toBeGreaterThanOrEqual(11);
        expect(serverReadNames).toEqual(registryReadNames);
    });

    it('la DESCRIPTION servie par le serveur est celle de la spec (aucune divergence de contrat pour le LLM)', async () => {
        // Un `.tool.ts` qui réécrit sa propre description ferait diverger ce que le modèle lit
        // selon la surface — même tool, deux contrats, deux comportements.
        const withStore = await listServerTools(true);
        const byName = new Map(withStore.map((t) => [t.name, t.description]));
        for (const spec of [...READ_SPECS, ...WRITE_SPECS]) {
            expect(byName.get(spec.name), `« ${spec.name} » absent du serveur MCP`).toBeDefined();
            expect(byName.get(spec.name), `description divergente pour « ${spec.name} »`).toBe(spec.description);
        }
    });

    it('le SCHÉMA D\'ENTRÉE servi par les deux surfaces est le même (hors deux écarts de méta mesurés)', async () => {
        // 3e branche du contrat que le modèle lit — après le nom et la description. Les deux
        // surfaces partent du MÊME objet zod mais passent par DEUX convertisseurs indépendants :
        // une divergence de rendu (unions, `required`, `.refine()`) ferait que le modèle génère un
        // appel valide sur une surface et invalide sur l'autre. Aucune écriture incorrecte
        // silencieuse (les deux re-valident au vrai schéma zod) — de la friction, pas de la corruption.
        const withStore = await listServerTools(true);
        const byName = new Map(withStore.map((t) => [t.name, t.inputSchema]));
        const specs = [...READ_SPECS, ...WRITE_SPECS];
        expect(specs.length).toBeGreaterThanOrEqual(19); // anti-vacuité : la boucle balaie bien tout
        for (const spec of specs) {
            expect(
                normalizeSchema(byName.get(spec.name)),
                `schéma d'entrée divergent pour « ${spec.name} » entre le serveur MCP et le chat in-app`,
            ).toEqual(normalizeSchema(toAnthropicTools([spec])[0].input_schema));
        }
    });
});
