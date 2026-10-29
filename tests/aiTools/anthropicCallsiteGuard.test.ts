// tests/aiTools/anthropicCallsiteGuard.test.ts
//
// [AITOOLS-CALLSITE-UNIQUE-GARDE] `tests/mcp/writeToolParity.test.ts` (lot 30) prouve que le serveur
// MCP et le REGISTRE de tools disent la même chose. Il ne prouve rien sur la QUESTION D'À CÔTÉ :
// est-ce que l'app déclare des tools à l'API Anthropic depuis quelque part ?
//
// Depuis le retrait de l'ancien assistant (29/10/2026, FinanceAI#15 : LIA est l'assistant, ses
// pouvoirs passent par le serveur MCP et le hub), la réponse est NON : `services/claude.ts` est le
// seul fichier de production qui appelle le SDK, et il n'envoie aucun `tools`. Cette garde l'empêche
// de revenir sans qu'on le décide : un `tools:` ad hoc échapperait à la garde de parité (elle
// regarde `mcp/server.ts`, pas les appels au SDK) ET à `noMcpSdkInSpecs` (qui vise l'import du SDK
// serveur, pas le paramètre `tools`) — des outils exposés au modèle sans jumeau côté MCP, sans un
// seul test rouge (finding ai-reviewer, panel PR #756).
//
// Tout est lu DÉCOMMENTÉ — ce fichier EXPLIQUE le motif qu'il interdit, et `api/_lib/relay.ts`
// mentionne `messages.stream(` dans un COMMENTAIRE : un scan naïf rougirait sur de la prose
// (leçon `SCAN-QUI-MATCHE-LA-PROSE`). Précision de portée : l'anti-vacuité `readCodeOnly` (témoin
// + ratio de code restant) couvre l'assertion qui affirme qu'AUCUN `tools` ne se déclare ; les
// comparaisons de LISTE exacte n'en ont pas besoin — un décommentage qui viderait un fichier les
// ferait échouer, pas réussir à vide.

import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { readCodeOnly, stripComments } from '../helpers/source';
import { toPosix } from '../helpers/toPosix';
import { readFileSync } from 'node:fs';

const ROOT = process.cwd();
/** Dossiers de PRODUCTION susceptibles de parler au SDK Anthropic. Les tests sont hors périmètre :
 *  un test a le droit de convertir des schémas lui-même (c'est ce que fait `toolSchemaContract`). */
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
const rel = (f: string) => toPosix(relative(ROOT, f));

describe('[AITOOLS-CALLSITE-UNIQUE-GARDE] aucun endroit ne déclare de tools au SDK Anthropic', () => {
    it('le balayage couvre un volume PROUVÉ de fichiers de production', () => {
        // Un scan qui ne lirait rien prouverait « aucun site », pas « un seul site ».
        expect(FILES.length).toBeGreaterThanOrEqual(200);
    });

    it('plus aucun fichier de production n\'importe `toAnthropicTools` (le chat in-app n\'existe plus)', () => {
        const importers = FILES.filter((f) => /import\s*\{[^}]*\btoAnthropicTools\b/.test(stripComments(readFileSync(f, 'utf8'))))
            .map(rel).sort();
        expect(importers).toEqual([]);
    });

    it('le seul site d\'appel du SDK est `services/claude.ts`, et il ne passe AUCUN `tools`', () => {
        // Mesuré : 1 fichier de production appelle `messages.create(`/`messages.stream(`.
        const callSites = FILES.filter((f) => /messages\.(create|stream)\s*\(/.test(stripComments(readFileSync(f, 'utf8'))))
            .map(rel).sort();
        expect(callSites).toEqual(['services/claude.ts']);

        // C'est CETTE assertion qui ferme le trou : ce site ne doit jamais se mettre à déclarer des
        // tools de son côté. Anti-vacuité par témoin : le fichier contient bien du vrai code après
        // décommentage.
        const claude = readCodeOnly(resolve(ROOT, 'services/claude.ts'), 'messages.create(');
        expect(/\btools\s*:/.test(claude), 'services/claude.ts déclare des `tools` hors du registre partagé').toBe(false);
    });

    it('le détecteur de `tools` rougit sur un appel qui en déclare (contre-épreuve)', () => {
        const fautif = 'await client.messages.create({ model, messages, tools: [{ name: "x", input_schema: {} }] });';
        expect(/\btools\s*:/.test(stripComments(fautif))).toBe(true);
        expect(/messages\.(create|stream)\s*\(/.test(stripComments(fautif))).toBe(true);
    });
});
