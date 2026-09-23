// [IA-LOCALE-ROUTE] Le relais doit vivre à un chemin STATIQUE exact. Mesuré en prod le 2026-09-23 : l'ancien
// `api/claude/[...path].ts` (attrape-tout) n'était pas routé par Vercel sur ce projet Vite → la requête tombait
// sur la réécriture SPA `/(.*) → /index.html` (POST 405, GET = page HTML) et TOUTE l'IA texte échouait dès
// l'allumage du transport `proxy`. Aucun test unitaire ne pouvait le voir (ils appellent `relayClaude` en direct) :
// cette garde verrouille la forme du fichier, seule cause mesurée.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');

function fichiers(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? fichiers(join(dir, e.name)) : [join(dir, e.name)]);
}

describe('[IA-LOCALE-ROUTE] route du relais Claude', () => {
    it('la fonction existe au chemin exact appelé par le SDK : api/claude/v1/messages.ts', () => {
        expect(existsSync(join(ROOT, 'api', 'claude', 'v1', 'messages.ts'))).toBe(true);
    });

    it('aucun fichier « attrape-tout » [...x] sous api/ (non routé par Vercel hors Next.js)', () => {
        const attrapeTout = fichiers(join(ROOT, 'api')).filter((f) => f.includes('[...'));
        expect(attrapeTout).toEqual([]);
    });
});
