// mcp/tools/_toolSpec.ts
//
// [ARCH-AITOOLS-SPLIT] Types NEUTRES des specs de tools — la frontière entre la logique métier
// (browser-safe, fichiers `*.spec.ts`) et l'enregistrement serveur MCP (fichiers `*.tool.ts`,
// seuls autorisés à importer @modelcontextprotocol/sdk). Cette frontière est PHYSIQUE (par
// fichier), pas par export : le SDK serveur tire express/cors/hono — compter sur le tree-shaking
// pour l'exclure du bundle navigateur serait un pari (ADR-1, plan Claude-in-app 2026-07-21).
//
// Deux consommateurs des specs :
//  - serveur MCP : `*.tool.ts` → server.tool(spec.name, spec.description, spec.inputSchema, …)
//  - app (chat Claude in-app) : `services/aiTools/registry.ts` → SDK Anthropic tool-use
// La PARITÉ des payloads entre les deux ponts est verrouillée par tests/aiTools/registryParity.
//
// ⚠️ Ce fichier ne doit JAMAIS importer le SDK MCP ni un module Node-only
// (garde : tests/aiTools/noMcpSdkInSpecs.test.ts).

import type { z } from 'zod';
import type { ToolTextResult, StateProvider } from './_dataAware';
import type { DocumentPayload } from '../ingest/applyDocument';

/** Forme « raw shape » zod attendue par server.tool (et convertie en JSON Schema côté app). */
export type ToolInputShape = Record<string, z.ZodTypeAny>;

/**
 * Tool de LECTURE (data-aware : lit l'AppState) ou CALCULATEUR pur (stateless : ignore l'état).
 * Le handler est VERBATIM l'ancienne logique du tool — y compris withState/jsonContent/scrub.
 */
export interface ReadToolSpec<Args = Record<string, unknown>> {
    kind: 'read' | 'stateless';
    name: string;
    description: string;
    inputSchema: ToolInputShape;
    handler: (args: Args, getState: StateProvider) => Promise<ToolTextResult>;
}

/**
 * Tool d'ÉCRITURE : le spec ne PERSISTE pas — il convertit seulement les args validés en
 * DocumentPayload. La persistance reste hors du spec : `runApply(store, doc)` côté serveur
 * (fichier/Drive + OCC), `applyDocument` pur + confirmation UI + Zustand côté app (ADR-2).
 */
export interface WriteToolSpec<Args = Record<string, unknown>> {
    kind: 'write';
    name: string;
    description: string;
    inputSchema: ToolInputShape;
    toDocument: (args: Args) => DocumentPayload;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- registres hétérogènes (Args varie par tool) */
export type AnyReadToolSpec = ReadToolSpec<any>;
export type AnyWriteToolSpec = WriteToolSpec<any>;
/* eslint-enable @typescript-eslint/no-explicit-any */
export type AnyToolSpec = AnyReadToolSpec | AnyWriteToolSpec;

/** StateProvider pour l'enregistrement des tools STATELESS (leur handler ne lit jamais l'état). */
export const NO_STATE: StateProvider = async () => {
    throw new Error('Tool stateless — aucun état à fournir.');
};
