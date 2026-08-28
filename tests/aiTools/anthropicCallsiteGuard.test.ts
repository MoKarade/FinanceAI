// tests/aiTools/anthropicCallsiteGuard.test.ts
//
// [AITOOLS-CALLSITE-UNIQUE-GARDE] `tests/mcp/writeToolParity.test.ts` (lot 30) prouve que les deux
// REGISTRES de tools disent la même chose. Il ne prouve rien sur la QUESTION D'À CÔTÉ : est-ce que
// le chat in-app déclare ses tools à l'API Anthropic depuis un seul endroit ?
//
// Aujourd'hui oui — `services/aiTools/agentLoop.ts` est le seul site — mais c'est une propriété de
// FAIT, que rien ne testait : une future fonctionnalité qui construirait son propre `tools:` ad hoc
// échapperait à la garde de parité (elle regarde `mcp/server.ts`, pas les appels au SDK) ET à
// `noMcpSdkInSpecs` (qui vise l'import du SDK serveur, pas le paramètre `tools`). On aurait alors
// des outils exposés au modèle sans jumeau côté MCP, sans un seul test rouge (finding ai-reviewer,
// panel PR #756).
//
// Toutes les assertions d'ABSENCE lisent la source DÉCOMMENTÉE avec son anti-vacuité — ce fichier
// EXPLIQUE le motif qu'il interdit, donc un scan naïf rougirait sur sa propre doc
// (leçon `SCAN-QUI-MATCHE-LA-PROSE`).

import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { readCodeOnly, stripComments } from '../helpers/source';
import { readFileSync } from 'node:fs';

const ROOT = process.cwd();
/** Dossiers de PRODUCTION susceptibles de parler au SDK Anthropic. Les tests sont hors périmètre :
 *  un test a le droit d'importer `toAnthropicTools` pour comparer des schémas (c'est ce que fait
 *  la garde de parité MCP). */
const SCAN_DIRS = ['services', 'hooks', 'components', 'api', 'mcp', 'utils', 'store'];

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const full = resolve(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts')) out.push(full);
    }
    return out;
}

const FILES = SCAN_DIRS.flatMap((d) => walk(resolve(ROOT, d)));
const rel = (f: string) => relative(ROOT, f);

describe('[AITOOLS-CALLSITE-UNIQUE-GARDE] un seul endroit déclare des tools au SDK Anthropic', () => {
    it('le balayage couvre un volume PROUVÉ de fichiers de production', () => {
        // Un scan qui ne lirait rien prouverait « aucun site », pas « un seul site ».
        expect(FILES.length).toBeGreaterThanOrEqual(200);
    });

    it('seul `services/aiTools/agentLoop.ts` importe `toAnthropicTools` (hors tests)', () => {
        const importers = FILES.filter((f) => /import\s*\{[^}]*\btoAnthropicTools\b/.test(stripComments(readFileSync(f, 'utf8'))))
            .map(rel).sort();
        expect(importers).toEqual(['services/aiTools/agentLoop.ts']);
    });

    it('les sites d\'appel du SDK sont ceux mesurés, et AUCUN autre ne passe de `tools`', () => {
        // Mesuré : 2 fichiers de production appellent `messages.create(`/`messages.stream(` —
        // `agentLoop.ts` (boucle agentique, AVEC tools) et `claude.ts` (appels sans tool-use).
        const callSites = FILES.filter((f) => /messages\.(create|stream)\s*\(/.test(stripComments(readFileSync(f, 'utf8'))))
            .map(rel).sort();
        expect(callSites).toEqual(['services/aiTools/agentLoop.ts', 'services/claude.ts']);

        // C'est CETTE assertion qui ferme le trou : le second site ne doit jamais se mettre à
        // déclarer des tools de son côté. Anti-vacuité par témoin : le fichier contient bien du
        // vrai code après décommentage.
        const claude = readCodeOnly(resolve(ROOT, 'services/claude.ts'), 'messages.create(');
        expect(/\btools\s*:/.test(claude), 'services/claude.ts déclare des `tools` hors du registre partagé').toBe(false);
    });

    it('`agentLoop.ts` construit son tableau `tools` DEPUIS le registre, jamais à la main', () => {
        // Contre-épreuve du test précédent : le site autorisé doit vraiment passer par le registre,
        // sinon « un seul site » ne garantit rien sur ce qu'il déclare.
        const loop = readCodeOnly(resolve(ROOT, 'services/aiTools/agentLoop.ts'), 'messages.stream(');
        expect(loop).toMatch(/tools\s*=\s*toAnthropicTools\(/);
        // Et il ne fabrique pas d'entrée de tool littérale à côté (un `input_schema` écrit en dur
        // serait un tool déclaré au modèle sans spec ni jumeau MCP).
        expect(/input_schema\s*:/.test(loop), 'agentLoop.ts fabrique un tool littéral hors des specs').toBe(false);
    });
});
