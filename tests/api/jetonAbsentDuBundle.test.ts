// [DURCISSEMENT-RELAIS] Le jeton de relais ne doit JAMAIS se retrouver dans le bundle construit.
//
// Pourquoi : tout ce qui est préfixé VITE_ est recopié en clair dans le JavaScript servi au public. Le vieux
// `VITE_PROXY_ACCESS_TOKEN` y était : n'importe qui le lisait (l'audit l'a classé HAUTE). Ce test construit l'app
// avec une valeur CANARI dans cette variable et échoue si la valeur — ou le nom de l'en-tête — apparaît dans un
// fichier de sortie. Il ne montre JAMAIS la valeur (seulement des booléens et des noms de fichiers).
import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const RACINE = resolve(__dirname, '../..');
const CANARI = `canari-jeton-relais-${Math.random().toString(36).slice(2)}${Date.now()}`;
const dossiers: string[] = [];
afterAll(() => { for (const d of dossiers) rmSync(d, { recursive: true, force: true }); });

function fichiers(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? fichiers(p) : [p];
    });
}

/** Fichiers de `dir` contenant l'une des chaînes ; sans jamais renvoyer la chaîne trouvée. */
function fichiersContenant(dir: string, motifs: string[]): string[] {
    return fichiers(dir).filter((f) => {
        const t = readFileSync(f, 'latin1');
        return motifs.some((m) => t.includes(m));
    }).map((f) => f.slice(dir.length + 1));
}

describe('bundle construit : aucun jeton de relais', () => {
    it('le scanneur détecte bien un canari (témoin : sans lui, un test vert ne prouverait rien)', () => {
        const d = mkdtempSync(join(tmpdir(), 'financeai-scan-'));
        dossiers.push(d);
        writeFileSync(join(d, 'a.js'), `var t="${CANARI}";`);
        writeFileSync(join(d, 'b.js'), 'var propre=1;');
        expect(fichiersContenant(d, [CANARI])).toEqual(['a.js']);
    });

    it('construit avec VITE_PROXY_ACCESS_TOKEN=<canari> : ni la valeur ni le nom de l\'en-tête dans dist', () => {
        const out = mkdtempSync(join(tmpdir(), 'financeai-bundle-'));
        dossiers.push(out);
        // `vite build` direct (le `prebuild` lint est déjà une porte à part) ; sortie hors du dépôt.
        execFileSync(process.execPath, [join(RACINE, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'production', '--outDir', out, '--emptyOutDir'], {
            cwd: RACINE,
            env: { ...process.env, VITE_PROXY_ACCESS_TOKEN: CANARI, VITE_CLAUDE_TRANSPORT: 'proxy' },
            stdio: 'pipe',
            maxBuffer: 64 * 1024 * 1024,
        });
        const construits = fichiers(out);
        expect(construits.length).toBeGreaterThan(5);                       // le build a bien produit quelque chose
        expect(construits.some((f) => f.endsWith('.js'))).toBe(true);
        expect(fichiersContenant(out, [CANARI])).toEqual([]);               // la valeur
        expect(fichiersContenant(out, ['x-financeai-proxy'])).toEqual([]);  // le nom de l'en-tête
    }, 240_000);
});
