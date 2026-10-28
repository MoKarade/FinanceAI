// [FUMEE-SANTE] La sonde de santé que le test de fumée commun (MoKarade/.github) lit après chaque déploiement :
// 200, JSON { ok: true }, jamais mis en cache. Sans cette route, la réécriture SPA répondait la page HTML (200) et la
// fumée aurait conclu « ok:true absent » — un faux rouge permanent.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sante, { repondreSante } from '../../api/sante';

const ROOT = resolve(__dirname, '../..');

describe('[FUMEE-SANTE] api/sante.ts', () => {
    it('GET → 200, { ok: true }, no-store', async () => {
        const r = repondreSante(new Request('https://finance.hubperso.com/api/sante'));
        expect(r.status).toBe(200);
        expect(r.headers.get('cache-control')).toBe('no-store');
        expect(r.headers.get('content-type')).toBe('application/json');
        expect(await r.json()).toEqual({ ok: true });
    });

    it('HEAD → 200 sans corps ; POST → 405 avec Allow (la sonde ne fait rien d\'autre)', async () => {
        const head = repondreSante(new Request('https://finance.hubperso.com/api/sante', { method: 'HEAD' }));
        expect(head.status).toBe(200);
        expect(await head.text()).toBe('');
        const post = repondreSante(new Request('https://finance.hubperso.com/api/sante', { method: 'POST', body: '{}' }));
        expect(post.status).toBe(405);
        expect(post.headers.get('allow')).toBe('GET, HEAD');
    });

    it('l\'export par défaut est le gestionnaire que Vercel appelle', async () => {
        const r = sante.fetch(new Request('https://finance.hubperso.com/api/sante'));
        expect(await r.json()).toEqual({ ok: true });
    });

    it('le fichier vit au chemin statique exact et déclare le runtime Node', () => {
        expect(existsSync(join(ROOT, 'api', 'sante.ts'))).toBe(true);
        expect(readFileSync(join(ROOT, 'api', 'sante.ts'), 'utf8')).toContain("runtime: 'nodejs'");
    });
});
