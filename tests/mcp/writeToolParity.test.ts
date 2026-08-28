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

/**
 * Tools que le serveur MCP expose et que le chat in-app n'a PAS à exposer — exclusions
 * DÉLIBÉRÉES, énumérées ici avec leur raison (un périmètre borné en silence se lit comme
 * « tout est couvert », leçon `AUDITER-LE-FILTRE-AUTANT-QUE-LA-LISTE`) :
 *   - `ping` : health-check du serveur, sans objet dans le navigateur ;
 *   - `connect_drive` : OAuth loopback Node — l'app EST déjà la source de données.
 */
const SERVER_ONLY = ['ping', 'connect_drive'] as const;

async function listServerTools(withStore: boolean): Promise<Array<{ name: string; description?: string }>> {
    const server = createServer(withStore ? { store: makeStateStore(null) } : {});
    const client = new Client({ name: 'test-parity', version: '0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const { tools } = await client.listTools();
    await client.close();
    return tools.map((t) => ({ name: t.name, description: t.description }));
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
});
