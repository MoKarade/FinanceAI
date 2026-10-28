#!/usr/bin/env node
// mcp/install-desktop.mjs
//
// Configure (ou met à jour) l'entrée MCP « financeai » dans la config de Claude
// Desktop, AUTOMATIQUEMENT et de façon robuste :
//   - command = le node.exe courant (process.execPath) → aucune dépendance au PATH
//   - args    = [ <chemin absolu tsx/dist/cli.mjs>, <chemin absolu mcp/stdio.ts> ]
//   - spawn DIRECT de node.exe (pas via npx/cmd) → pas de souci d'espaces dans le
//     chemin (OneDrive, « Marc Richard »…) ni de `cmd /c` qui re-découpe les args.
//
// Écrit dans TOUS les emplacements connus où Claude Desktop lit sa config :
//   - installeur classique : %APPDATA%/Claude (Win) / ~/Library/... (mac) / ~/.config (linux)
//   - version MICROSOFT STORE (MSIX, sandbox) : %LOCALAPPDATA%/Packages/Claude_*/
//     LocalCache/Roaming/Claude  (la version Store ignore le %APPDATA% normal !)
//
// Préserve les autres serveurs MCP déjà présents. Écrit en UTF-8 SANS BOM.
//
// Usage :
//   npm run mcp:setup                      (état attendu à ~/financeai-state.json)
//   npm run mcp:setup -- "C:\\chemin\\state.json"   (chemin d'état explicite)

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url)); // .../mcp
const repoRoot = resolve(here, '..');

// 1) Chemins absolus du lanceur ----------------------------------------------
const nodeBin = process.execPath; // le node qui exécute ce script = celui de l'utilisateur
const tsxPkgPath = require.resolve('tsx/package.json'); // tsx du node_modules du repo
const tsxPkg = JSON.parse(readFileSync(tsxPkgPath, 'utf8'));
const tsxBinRel = typeof tsxPkg.bin === 'string' ? tsxPkg.bin : tsxPkg.bin.tsx;
const tsxCli = join(dirname(tsxPkgPath), tsxBinRel); // .../tsx/dist/cli.mjs (résolu, version-proof)
const stdioTs = join(repoRoot, 'mcp', 'stdio.ts');

// 2) Fichier d'état (arg optionnel, sinon ~/financeai-state.json) -------------
const stateArg = process.argv[2];
const stateFile = stateArg ? resolve(stateArg) : join(homedir(), 'financeai-state.json');

const financeaiEntry = {
    command: nodeBin,
    args: [tsxCli, stdioTs],
    env: { FINANCEAI_STATE_FILE: stateFile },
};

// 3) Emplacements de la config Claude Desktop selon l'OS ----------------------
function standardConfigPath() {
    const p = platform();
    if (p === 'win32') {
        const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
        return join(appData, 'Claude', 'claude_desktop_config.json');
    }
    if (p === 'darwin') {
        return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    }
    return join(homedir(), '.config', 'Claude', 'claude_desktop_config.json'); // linux & autres
}

// Version Microsoft Store (MSIX) : %APPDATA% est redirigé vers le bac à sable du
// paquet. On détecte tout paquet « Claude_* » et on vise son Roaming\Claude.
function msixConfigPaths() {
    if (platform() !== 'win32') return [];
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
    const pkgRoot = join(localAppData, 'Packages');
    if (!existsSync(pkgRoot)) return [];
    try {
        return readdirSync(pkgRoot)
            .filter((name) => name.startsWith('Claude_'))
            .map((name) => join(pkgRoot, name, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json'));
    } catch {
        return [];
    }
}

const targets = [standardConfigPath(), ...msixConfigPaths()];

// 4) Pour chaque cible : lire/fusionner (préserve les autres serveurs) + écrire -
function mergeAndWrite(cfgPath) {
    let cfg = {};
    if (existsSync(cfgPath)) {
        let raw = readFileSync(cfgPath, 'utf8');
        if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // retire un BOM éventuel
        try {
            cfg = raw.trim() ? JSON.parse(raw) : {};
        } catch {
            const bak = `${cfgPath}.bak`;
            copyFileSync(cfgPath, bak);
            console.warn(`[mcp:setup] Config illisible → sauvegardée: ${bak}. On repart propre.`);
            cfg = {};
        }
    }
    if (typeof cfg !== 'object' || cfg === null) cfg = {};
    if (typeof cfg.mcpServers !== 'object' || cfg.mcpServers === null) cfg.mcpServers = {};
    cfg.mcpServers.financeai = financeaiEntry;
    mkdirSync(dirname(cfgPath), { recursive: true });
    writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
}
for (const t of targets) mergeAndWrite(t);

// 5) Compte rendu -------------------------------------------------------------
console.log('\n[mcp:setup] Connecteur « financeai » configuré pour Claude Desktop.\n');
console.log('  config(s) écrite(s) :');
for (const t of targets) console.log(`    - ${t}${t.includes('Packages') ? '   (version Microsoft Store)' : ''}`);
console.log(`  node    : ${nodeBin}`);
console.log(`  tsx     : ${tsxCli}`);
console.log(`  serveur : ${stdioTs}`);
console.log(`  état    : ${stateFile}${existsSync(stateFile) ? '' : '   <-- ABSENT (voir ci-dessous)'}`);

if (!existsSync(stateFile)) {
    console.log("\n[!] Le fichier d'état n'existe pas encore. Dans l'app (F12 → Console), exécute :");
    console.log("    copy(JSON.stringify(JSON.parse(localStorage.getItem('financeai-storage')).state, null, 2))");
    console.log(`    puis colle le presse-papier dans : ${stateFile}`);
}

console.log('\nEnsuite :');
console.log('  1. Quitte COMPLÈTEMENT Claude Desktop (barre des tâches → clic droit sur l\'icône → Quit).');
console.log('  2. Rouvre Claude Desktop.');
console.log('  3. Settings → Developer : « financeai » doit afficher « running ».');
console.log('  4. Demande : « Donne-moi une vue d\'ensemble de mes finances. »\n');
