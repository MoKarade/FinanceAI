#!/usr/bin/env node
// mcp/pack.mjs — empaquette le connecteur en bundle Claude Desktop « FinanceAI.mcpb » (install 1 clic).
// Lancement : npm run mcp:pack
//
// 1) esbuild bundle mcp/stdio.ts → un seul dist/financeai-connector/stdio.js (toutes deps inline).
// 2) embarque connector-client.json (client OAuth PARTAGÉ) s'il est présent localement.
// 3) écrit manifest.json (schéma .mcpb v0.3, serveur node).
// 4) zippe le tout → dist/FinanceAI.mcpb (à héberger pour le bouton « Connecter à Claude » de l'app).

import esbuild from 'esbuild';
import AdmZip from 'adm-zip';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // mcp/
const root = join(here, '..');
const outDir = join(root, 'dist', 'financeai-connector');
const mcpbPath = join(root, 'dist', 'FinanceAI.mcpb');
const CONNECTOR_VERSION = '0.4.0';

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// 1) Bundle (un seul fichier ; modules Node natifs externalisés ; createRequire pour interop CJS).
await esbuild.build({
    entryPoints: [join(here, 'stdio.ts')],
    outfile: join(outDir, 'stdio.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    banner: { js: "import{createRequire as ___cr}from'module';const require=___cr(import.meta.url);" },
    logLevel: 'warning',
});

// 2) Client OAuth FinanceAI PARTAGÉ (gitignoré) → embarqué à côté du bundle (lu par sharedClient.ts).
const clientSrc = join(here, 'drive', 'connector-client.json');
if (existsSync(clientSrc)) {
    copyFileSync(clientSrc, join(outDir, 'connector-client.json'));
    console.log('[mcp:pack] Client OAuth partagé embarqué.');
} else {
    console.warn('[mcp:pack] ⚠ connector-client.json absent → le bundle ne pourra PAS autoriser Drive.');
    console.warn('           Crée mcp/drive/connector-client.json (cf .example) avant de packager pour distribution.');
}

// 3) manifest.json (schéma .mcpb v0.3, serveur node).
const manifest = {
    manifest_version: '0.3',
    name: 'financeai',
    display_name: 'FinanceAI',
    version: CONNECTOR_VERSION,
    description:
        "Pose des questions sur tes finances à Claude et envoie-lui tes documents (paie, relevés, " +
        "feuillets) — il les range dans ton Google Drive FinanceAI.",
    author: { name: 'FinanceAI' },
    server: {
        type: 'node',
        entry_point: 'stdio.js',
        mcp_config: { command: 'node', args: ['${__dirname}/stdio.js'] },
    },
};
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// 4) Zip → .mcpb (un .mcpb EST un zip).
const zip = new AdmZip();
zip.addLocalFolder(outDir);
zip.writeZip(mcpbPath);

console.log(`[mcp:pack] Bundle créé : ${mcpbPath}`);
console.log('[mcp:pack] Héberge-le (ex: public/ de l\'app) et pointe la carte « Connecter à Claude » dessus.');
