// [CF-ACCESS] Gardes de FORME (lues comme donnée) : ce qu'aucun test unitaire de handler ne peut voir — routage Vercel,
// redirection *.vercel.app, service worker, manifest, et l'absence de tout « contrôle coupé » en code de production.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const lit = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const vercel = JSON.parse(lit('vercel.json'));

function fichiers(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? fichiers(join(dir, e.name)) : [join(dir, e.name)]));
}

describe('vercel.json', () => {
    const rewrites = vercel.rewrites as Array<{ source: string; destination: string }>;

    it('AUCUNE réécriture ne mène à un hôte externe : Yahoo et Fintable passent par des fonctions gardées', () => {
        const externes = rewrites.filter((r) => /^https?:\/\//.test(r.destination));
        expect(externes).toEqual([]);
    });

    it.each([
        ['/api/history/yahoo/:symbol', '/api/yahoo/history'],
        ['/api/search/yahoo', '/api/yahoo/search'],
        ['/api/fintable/:path*', '/api/proxy/fintable'],
    ])('%s → fonction %s (chemin STATIQUE : les attrape-tout ne sont pas routés), avant la réécriture SPA', (source, fonction) => {
        const i = rewrites.findIndex((r) => r.source === source);
        expect(i, source).toBeGreaterThanOrEqual(0);
        expect(rewrites[i].destination.split('?')[0]).toBe(fonction);
        expect(i).toBeLessThan(rewrites.findIndex((r) => r.source === '/(.*)'));
        expect(readFileSync(resolve(ROOT, `${fonction.slice(1)}.ts`), 'utf8')).toContain("runtime: 'nodejs'");
    });

    it('les hôtes *.vercel.app sont redirigés vers finance.hubperso.com (302, réversible)', () => {
        const r = (vercel.redirects as Array<Record<string, unknown>>).find((x) => JSON.stringify(x.has).includes('vercel'));
        expect(r).toBeDefined();
        expect(r!.destination).toBe('https://finance.hubperso.com/$1');
        expect(r!.permanent).toBe(false);
        const motif = new RegExp(`^(?:${(r!.has as Array<{ value: string }>)[0].value})$`);
        expect(motif.test('financeai-abc123-marc.vercel.app')).toBe(true);
        expect(motif.test('finance.hubperso.com')).toBe(false);
        expect(motif.test('evil.vercel.app.example.com')).toBe(false);
    });

    it('les prévisualisations claude/* restent DÉSACTIVÉES', () => {
        expect(vercel.git.deploymentEnabled['claude/*']).toBe(false);
    });
});

describe('service worker : jamais de réponse redirigée ou opaque en cache', () => {
    const sw = lit('public/sw.js');
    // La fonction est EXÉCUTÉE (pas seulement lue) sur des réponses synthétiques : une regex sur le texte passerait aussi avec un corps cassé.
    const source = /function cacheable\(res\) \{[\s\S]*?\n\}/.exec(sw)![0];
    const cacheable = new Function(`${source}; return cacheable;`)() as (r: unknown) => boolean;
    it('accepte UNIQUEMENT une réponse 200, de type basic, non redirigée', () => {
        expect(cacheable({ status: 200, type: 'basic', redirected: false })).toBe(true);
        expect(cacheable({ status: 200, type: 'basic', redirected: true })).toBe(false); // page de connexion Access servie en 200
        expect(cacheable({ status: 200, type: 'opaque', redirected: false })).toBe(false);
        expect(cacheable({ status: 200, type: 'opaqueredirect', redirected: false })).toBe(false);
        expect(cacheable({ status: 200, type: 'cors', redirected: false })).toBe(false);
        expect(cacheable({ status: 0, type: 'opaqueredirect', redirected: false })).toBe(false);
        expect(cacheable({ status: 302, type: 'basic', redirected: false })).toBe(false);
        expect(cacheable({ status: 404, type: 'basic', redirected: false })).toBe(false);
        expect(cacheable(undefined)).toBe(false);
    });
    it('chaque écriture en cache est précédée du contrôle (aucun ancien test « status !== 200 » seul ne subsiste)', () => {
        expect((sw.match(/cache\.put\(/g) ?? []).length).toBe(3);
        expect((sw.match(/cacheable\(res\)/g) ?? []).length).toBeGreaterThanOrEqual(4); // définition + 3 usages
        expect(sw).not.toMatch(/if \(!res \|\| res\.status !== 200\) return res;/);
    });
    it('/api/* n\'est jamais servi ni mis en cache par le SW', () => {
        expect(sw).toMatch(/pathname\.startsWith\('\/api\/'\)\) return;/);
    });
    it('le nom du cache a changé (les caches de l\'ancienne version sont purgés à l\'activation)', () => {
        expect(sw).not.toContain("'financeai-v3'");
    });
});

describe('manifest et boot', () => {
    it('le manifest est demandé AVEC les identifiants (cookie Access), sinon iOS/Chrome le reçoivent en 302', () => {
        expect(lit('index.html')).toMatch(/<link rel="manifest" href="\/manifest\.json" crossorigin="use-credentials">/);
    });
    it('la surveillance de session est branchée au boot, en production seulement', () => {
        expect(lit('hooks/useAppBootEffects.ts')).toMatch(/import\.meta\.env\.PROD \? surveillerSessionAccess\(\)/);
    });
});

describe('le contrôle d\'accès n\'est jamais coupé en code de production', () => {
    it('`access: null` n\'apparaît que dans les tests', () => {
        const prod = [...fichiers(join(ROOT, 'api')), join(ROOT, 'vite.config.ts')].filter((f) => f.endsWith('.ts'));
        const fautifs = prod.filter((f) => /access\s*:\s*null/.test(readFileSync(f, 'utf8')) && !/relay\.ts$|proxies\.ts$/.test(f));
        expect(fautifs).toEqual([]);
    });
    it('les points d\'entrée des fonctions n\'ouvrent aucune option de contournement', () => {
        const entrees = ['api/claude/v1/messages.ts', 'api/yahoo/history.ts', 'api/yahoo/search.ts', 'api/proxy/fintable.ts'];
        for (const e of entrees) expect(lit(e), e).not.toMatch(/access|CF_ACCESS/);
    });
    it('le jeton n\'est jamais journalisé : aucun console.* de accessJwt ne reçoit un jeton', () => {
        const src = lit('api/_lib/accessJwt.ts');
        const journaux = src.split('\n').filter((l) => /console\.(log|warn|error|info|debug)/.test(l));
        for (const l of journaux) expect(l, l).not.toMatch(/token|jeton\b(?!\s+refusé)|headers/i);
    });
    it('le mode dev n\'active l\'observation que sur localhost (vite.config.ts)', () => {
        expect(lit('vite.config.ts')).toMatch(/k === 'CF_ACCESS_REQUIRED' \? \(env\[k\] \?\? '0'\)/);
    });
});
