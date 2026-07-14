#!/usr/bin/env node
// mcp/build-server.mjs — [MCP-CLOUDRUN-DEPLOY]
// Bundle le serveur HTTP (mcp/http.ts) en UN fichier autonome dist-mcp/http.js
// via esbuild (résolution des imports FIGÉE au build). Pourquoi : `tsx` au runtime
// échoue à résoudre les imports sans extension à nom pointé (`./tools/ping.tool`)
// selon la version de Node/tsx (vu sur Cloud Run : ERR_MODULE_NOT_FOUND). Le bundle
// esbuild — même mécanique que mcp/pack.mjs pour le .mcpb — supprime cette fragilité
// ET démarre instantanément (aucune transpilation à froid). Lancé au build de l'image.

import esbuild from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // mcp/
const root = join(here, '..');
const outfile = join(root, 'dist-mcp', 'http.js');

await esbuild.build({
    entryPoints: [join(here, 'http.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    // createRequire : certaines deps (SDK MCP) font des require() CJS internes.
    banner: { js: "import{createRequire as ___cr}from'module';const require=___cr(import.meta.url);" },
    logLevel: 'info',
});

console.log(`[mcp:build-server] Bundle créé : ${outfile}`);
