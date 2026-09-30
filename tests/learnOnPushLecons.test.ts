// [HOOKS-LECONS] Le rappel de push cite le fichier des leçons, lu depuis une config (défaut
// docs/claude/lecons.md), et n'accepte aucun chemin douteux.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cheminLecons, LECONS_PAR_DEFAUT } from '../scripts/hooks/lib/leconsFichier.mjs';

const rappel = (command: string): string => {
    const r = spawnSync('node', ['scripts/hooks/learn-on-push.mjs'], { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8' });
    expect(r.status).toBe(0);
    return r.stdout;
};

describe('[HOOKS-LECONS] chemin du fichier leçons', () => {
    it('le défaut est docs/claude/lecons.md et ce fichier existe', () => {
        expect(LECONS_PAR_DEFAUT).toBe('docs/claude/lecons.md');
        expect(readFileSync(LECONS_PAR_DEFAUT, 'utf8').length).toBeGreaterThan(100);
    });
    it('la config valide est prise, tout le reste retombe sur le défaut', () => {
        expect(cheminLecons({ leconsFichier: 'docs/autre/lecons.md' })).toBe('docs/autre/lecons.md');
        for (const mauvais of ['/etc/passwd', '../hors.md', 'a/../../b.md', String.raw`C:\x.md`, 'a b.md', 'x\ny.md', '', 42, null, undefined]) {
            expect(cheminLecons({ leconsFichier: mauvais }), String(mauvais)).toBe(LECONS_PAR_DEFAUT);
        }
        expect(cheminLecons(null)).toBe(LECONS_PAR_DEFAUT);
    });
    it('le hook cite docs/claude/lecons.md sur un git push, et reste muet sinon', () => {
        const sortie = rappel('git push -u origin agence/x/y');
        expect(sortie).toContain('docs/claude/lecons.md');
        expect(sortie).not.toContain('dans CLAUDE.md');
        expect(rappel('git status')).toBe('');
    });
});
