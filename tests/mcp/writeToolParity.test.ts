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

import { PROTOCOLE_ECRITURE } from '../../mcp/tools/_writeTool';
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

// ⚠️ Piège de RÉPARATION, pas de détection (finding ai-reviewer, panel PR #756) : rien ne lie
// `spec.kind === 'write'` à l'ENDROIT où le tool est enregistré dans `mcp/server.ts`. Un tool
// d'écriture branché hors du bloc `if (options.store)` apparaîtrait dans `withoutStore`, donc la
// parité ci-dessous rougirait — mais les deux « corrections » les plus naturelles pour la faire
// reverdir (l'ajouter à `READ_SPECS`, ou l'inscrire dans `SERVER_ONLY`) masqueraient sa nature
// d'écriture au lieu de la rétablir. Devant un échec de ce test, la question à se poser est
// « ce tool ÉCRIT-il ? », jamais « comment faire passer le test ? ».
// Vérifié au 2026-08-28 : les 8 tools d'écriture sont bien dans le bloc conditionnel.

/**
 * Normalise un JSON Schema pour comparer les DEUX surfaces. Les specs partagent le même objet zod et,
 * depuis zod 4 ([S5-ZOD4]), le même convertisseur : `z.toJSONSchema` natif, avec les options que le
 * SDK MCP applique à un schéma zod 4 (draft-7, côté entrée). MESURÉ sur les 19 tools : sortie
 * identique partout SAUF la clé méta `$schema`, présente côté MCP et retirée par `toAnthropicTools`
 * (hors contrat `Tool.InputSchema` d'Anthropic) — sans effet sur ce que le modèle peut produire.
 * La clause `additionalProperties: false` sur schéma VIDE date de zod 3 (`zod-to-json-schema` la
 * posait, le SDK MCP l'omettait) ; gardée : elle ne neutralise que cette valeur exacte. Toute
 * divergence de `properties`, de `type`, de `required` ou de `description` fait rougir la garde
 * (finding ai-reviewer, panel PR #756).
 */
function normalizeSchema(raw: unknown, retirerControle = false): unknown {
    const schema = { ...(raw as Record<string, unknown>) };
    delete schema.$schema;
    // [MCP-CONFIRM-TOKEN] 3e écart de méta DÉLIBÉRÉ, écritures seulement : le serveur MCP publie `confirmToken`
    // (jeton à usage unique émis par le serveur) et RETIRE le booléen `confirm` fourni par le modèle ; le chat
    // in-app confirme par modal et garde `confirm` dans son schéma. Les champs MÉTIER restent comparés à l'identique.
    if (retirerControle) {
        const pr = { ...((schema.properties ?? {}) as Record<string, unknown>) };
        delete pr.confirm; delete pr.confirmToken;
        schema.properties = pr;
        if (Array.isArray(schema.required)) schema.required = (schema.required as string[]).filter((k) => k !== 'confirm' && k !== 'confirmToken');
    }
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
        // Même ordre que le test WRITE ci-dessus, et pour la même raison : l'ÉGALITÉ porte la garde,
        // le plancher de volume vient APRÈS. Ce test jumeau avait gardé l'ordre inverse — un retrait
        // dans `READ_SPECS` y aurait rougi sur « expected 10 to be >= 11 » au lieu du vrai message
        // de parité (`PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`, 3e passe panel PR #756).
        expect(
            serverReadNames,
            'un tool de lecture existe dans UN SEUL des deux registres (hors exclusions déclarées)',
        ).toEqual(registryReadNames);
        expect(registryReadNames.length).toBeGreaterThanOrEqual(11);
    });

    it('la DESCRIPTION servie par le serveur est celle de la spec (aucune divergence de contrat pour le LLM)', async () => {
        // Un `.tool.ts` qui réécrit sa propre description ferait diverger ce que le modèle lit
        // selon la surface — même tool, deux contrats, deux comportements.
        const withStore = await listServerTools(true);
        const byName = new Map(withStore.map((t) => [t.name, t.description]));
        for (const spec of [...READ_SPECS, ...WRITE_SPECS]) {
            expect(byName.get(spec.name), `« ${spec.name} » absent du serveur MCP`).toBeDefined();
            // Les outils d'ÉCRITURE portent en plus la clause de protocole à deux temps ([MCP-CONFIRM-TOKEN]).
            const attendue = spec.kind === 'write' ? spec.description + PROTOCOLE_ECRITURE : spec.description;
            expect(byName.get(spec.name), `description divergente pour « ${spec.name} »`).toBe(attendue);
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
                normalizeSchema(byName.get(spec.name), spec.kind === 'write'),
                `schéma d'entrée divergent pour « ${spec.name} » entre le serveur MCP et le chat in-app`,
            ).toEqual(normalizeSchema(toAnthropicTools([spec])[0].input_schema, spec.kind === 'write'));
        }
    });
});
