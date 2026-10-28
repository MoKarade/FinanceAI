// [LIA-1253][#1267] Une seule LIA, démarrée une seule fois hors du rendu, sans secret côté navigateur.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RACINE = resolve(__dirname, '../..');
const lire = (p: string): string => readFileSync(join(RACINE, p), 'utf8');

function sources(dir: string): string[] {
    return readdirSync(join(RACINE, dir)).flatMap((n) => {
        const rel = `${dir}/${n}`;
        if (statSync(join(RACINE, rel)).isDirectory()) return n === 'node_modules' ? [] : sources(rel);
        return /\.(tsx?|jsx?)$/.test(n) ? [rel] : [];
    });
}

describe('[LIA-1253][#1267] montage de LIA', () => {
    it('LIA est démarrée hors du rendu, depuis index.tsx, au chargement du module (jamais dans App.tsx)', () => {
        const entree = lire('index.tsx');
        expect(entree).toMatch(/import\('\.\/services\/lia\/demarrage'\)[\s\S]{0,120}demarrerLiaApp\(\)/);
        // Avant le rendu : une panne de React ne doit pas l'empêcher de démarrer.
        expect(entree.indexOf("services/lia/demarrage")).toBeLessThan(entree.indexOf('root.render('));
        expect(entree).toMatch(/\.catch\([\s\S]{0,60}console\.error/);
        expect(lire('App.tsx')).not.toMatch(/LiaMontee|<Lia[\s/>]|@mokarade\/lia-ui/);
    });

    it('mode invité (#1273) : LIA démarre avant le rendu du LoginGate, donc elle est là sans session (écran de connexion, premier lancement)', () => {
        const entree = lire('index.tsx');
        expect(entree.indexOf("services/lia/demarrage")).toBeLessThan(entree.indexOf('<LoginGate>'));
        // Aucune condition de session ou de connexion Google ne décide du démarrage de LIA.
        expect(lire('services/lia/demarrage.ts')).not.toMatch(/^import .*(authGate|LoginGate)|isGateEnabled|isGateAuthedThisSession/m);
    });

    it('une seule voie : seul services/lia/demarrage.ts importe le montage du paquet, et aucun composant ne rend <Lia />', () => {
        const tous = [...sources('components'), ...sources('hooks'), ...sources('services'), 'App.tsx', 'index.tsx'];
        const importeurs = tous.filter((f) => /@mokarade\/lia-ui\/(boot|react)/.test(lire(f)));
        expect(importeurs).toEqual(['services/lia/demarrage.ts']);
        expect(lire('services/lia/demarrage.ts')).toContain("@mokarade/lia-ui/boot");
        expect(tous.filter((f) => /<Lia[\s/>]/.test(lire(f)))).toEqual([]);
    });

    it('aucun état LIA propre à FinanceAI (pas de stockage local ni de store de LIA)', () => {
        for (const f of sources('services/lia')) expect(lire(f), f).not.toMatch(/localStorage|sessionStorage|indexedDB|zustand/i);
    });

    it('HUB_TOKEN et les clés de session n\'apparaissent dans aucun module chargé par le navigateur', () => {
        const navigateur = ['services/lia/demarrage.ts', 'services/lia/client.ts', 'services/lia/contrat.ts'];
        for (const f of navigateur) expect(lire(f), f).not.toMatch(/HUB_TOKEN|HUB_SESSION_PUBLIC_KEYS|process\.env|import\.meta\.env/);
        // …et aucune variable VITE_ ne porte le jeton (elle serait recopiée en clair dans le bundle).
        for (const f of ['.env.example', 'vite.config.ts']) expect(lire(f), f).not.toMatch(/VITE_HUB_TOKEN/);
    });
});

describe('[#1267] services/lia/demarrage.ts', () => {
    it('démarre le paquet une fois avec un ask qui passe par api/lia/ask et borne la page à 200 caractères', async () => {
        vi.resetModules();
        const demarrerLia = vi.fn(() => ({ poignee: () => null, arreter: () => undefined }));
        vi.doMock('@mokarade/lia-ui/boot', () => ({ demarrerLia }));
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: 'ok' }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('window', { location: { pathname: `/${'p'.repeat(300)}`, hash: '#x' } });
        try {
            const { demarrerLiaApp } = await import('../../services/lia/demarrage');
            demarrerLiaApp();
            expect(demarrerLia).toHaveBeenCalledTimes(1);
            const options = (demarrerLia.mock.calls[0] as unknown as [{ ask: (q: string, s: AbortSignal) => Promise<{ text: string }> }])[0];
            expect(Object.keys(options)).toEqual(['ask']);
            await expect(options.ask('Salut', new AbortController().signal)).resolves.toMatchObject({ text: 'ok' });
            const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
            expect(url).toBe('/api/lia/ask');
            const corps = JSON.parse(String(init.body)) as { question: string; page: string };
            expect(corps.question).toBe('Salut');
            expect(corps.page).toHaveLength(200);
        } finally {
            vi.doUnmock('@mokarade/lia-ui/boot');
            vi.unstubAllGlobals();
            vi.resetModules();
        }
    });
});
