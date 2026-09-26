import path from 'path';
import { execSync } from 'node:child_process';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { relayClaude, iaLocaleDepuisEnv } from './api/_lib/relay';

// [P0-PROXY] Middleware dev : monte le relais BYOK (api/_lib/relay.ts, code Web-standard partagé
// avec la fonction Edge Vercel) sous /api/claude en `npm run dev` — sans dépendre de `vercel dev`.
// Corps de REQUÊTE bufferisé (petits JSON texte — Vision reste en direct, hors relais) ;
// corps de RÉPONSE streamé chunk par chunk (préserve le SSE de chatStream).
const claudeRelayDevPlugin = (env: Record<string, string>): Plugin => ({
    name: 'financeai-claude-relay-dev',
    configureServer(server) {
        server.middlewares.use('/api/claude', (req, res) => {
            void (async () => {
                const chunks: Buffer[] = [];
                for await (const c of req) chunks.push(c as Buffer);
                const ctrl = new AbortController();
                res.on('close', () => { if (!res.writableEnded) ctrl.abort(); });
                res.on('error', () => { /* socket fermé par le client (abort mi-stream) — no-op voulu */ });
                const headers = new Headers();
                for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
                const original = (req as unknown as { originalUrl?: string }).originalUrl ?? req.url ?? '';
                const request = new Request(`http://localhost${original}`, {
                    method: req.method,
                    headers,
                    body: chunks.length ? new Uint8Array(Buffer.concat(chunks)) : undefined,
                    signal: ctrl.signal,
                });
                const response = await relayClaude(request, {
                    accessToken: env.PROXY_ACCESS_TOKEN || env.VITE_PROXY_ACCESS_TOKEN || undefined,
                    // [IA-LOCALE] Même lecture qu'en prod, depuis .env.local (IA_LOCALE_URL / _CLE / …).
                    iaLocale: iaLocaleDepuisEnv((k) => env[k] || undefined),
                });
                res.statusCode = response.status;
                response.headers.forEach((v, k) => res.setHeader(k, v));
                if (response.body) {
                    const reader = response.body.getReader();
                    for (;;) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        res.write(value);
                    }
                }
                res.end();
            })().catch((e) => {
                // DEV LOCAL uniquement : logguer la vraie cause est sans risque (la clé vit dans les
                // headers de la requête, jamais dans l'objet d'erreur) et rend le relais diagnosticable.
                console.error('[relais dev /api/claude]', e);
                if (!res.headersSent) {
                    res.statusCode = 502;
                    res.setHeader('content-type', 'application/json');
                    res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Relais dev indisponible.' } }));
                } else {
                    // Flux déjà entamé (SSE) : ne PAS injecter de JSON en queue de stream — terminer sec.
                    res.end();
                }
            });
        });
    },
});

// G22-F2 — version AUTO (plus de bump manuel). CalVer `AAAA.M.J` dérivée de la date
// de build : change à chaque déploiement, robuste même sur clone git shallow (Vercel)
// où un compteur de commits serait faux. `GIT_SHA` identifie le commit exact,
// `BUILD_DATE` (horodatage complet) trace l'instant du build.
const GIT_SHA = (() => {
    try {
        return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch {
        return 'dev';
    }
})();
const _now = new Date();
const APP_VERSION = `${_now.getFullYear()}.${_now.getMonth() + 1}.${_now.getDate()}`;
const BUILD_DATE = _now.toISOString().slice(0, 16).replace('T', ' '); // 'AAAA-MM-JJ HH:MM' UTC

// [PORTFOLIO-HISTORY] Miroir LOCAL (dev + preview) du rewrite Vercel `/api/history/yahoo/:symbol` →
// query1.finance.yahoo.com (le repli d'historique passe par un proxy same-origin : CSP inchangée +
// pas de CORS). En prod c'est vercel.json qui fait ce travail. Partagé server/preview (source unique).
const yahooProxy = {
  '/api/history/yahoo': {
    target: 'https://query1.finance.yahoo.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/history\/yahoo/, '/v8/finance/chart'),
  },
  // [HIST-MULTI-PROVIDER] Recherche de titre par nom (diagnostic « Cours non synchronisés »).
  '/api/search/yahoo': {
    target: 'https://query1.finance.yahoo.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/search\/yahoo/, '/v1/finance/search'),
  },
  // [FINTABLE-7] Sync Fintable DEPUIS LE NAVIGATEUR (décision 2026-07-30) : même patron same-origin
  // que Yahoo ci-dessus → `connect-src 'self'` couvre, AUCUN domaine ajouté à la CSP, pas de CORS.
  // Le jeton voyage dans l'en-tête `Authorization` que le proxy relaie tel quel ; il n'est jamais
  // dans l'URL (les URL finissent dans les logs — contrat explicite de `client.ts`).
  '/api/fintable': {
    target: 'https://fintable.io',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/fintable/, '/api/v2'),
  },
};

// [S5-REFONTE-PERF] Graphe STATIQUE de l'entrée (index.tsx) : les modules chargés au démarrage quoi
// qu'il arrive. Calculé une fois par build, au premier appel de `manualChunks`.
type InfoModule = { importedIds: readonly string[] } | null;
let grapheDemarrageCache: Set<string> | null = null;
function grapheDemarrage(getModuleInfo: (id: string) => InfoModule): Set<string> {
  if (grapheDemarrageCache) return grapheDemarrageCache;
  const entree = path.resolve(__dirname, 'index.tsx');
  const vus = new Set<string>();
  const pile = [entree];
  while (pile.length) {
    const id = pile.pop()!;
    if (vus.has(id)) continue;
    vus.add(id);
    for (const dep of getModuleInfo(id)?.importedIds ?? []) if (!vus.has(dep)) pile.push(dep);
  }
  grapheDemarrageCache = vus;
  return vus;
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: env.VITE_BASE_PATH || '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: yahooProxy,
      },
      // [HIST-PREVIEW-PROXY] `vite preview` a besoin du MÊME proxy que le dev server : sans lui, le
      // repli Yahoo tombe sur le fallback SPA (HTML → null honnête) → graphes vides en preview local.
      preview: {
        proxy: yahooProxy,
      },
      plugins: [react(), claudeRelayDevPlugin(env)],
      define: {
        __APP_VERSION__: JSON.stringify(APP_VERSION),
        __GIT_SHA__: JSON.stringify(GIT_SHA),
        __BUILD_DATE__: JSON.stringify(BUILD_DATE),
      },
      optimizeDeps: {
        exclude: ['html2canvas'],
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // Sprint 3 SH6 (sécurité) — `'hidden'` générait quand même les fichiers
        // .js.map déployés sur Vercel (accessibles publiquement à
        // domaine.com/assets/index-X.js.map → exposait tout le TS source).
        // `false` ne génère AUCUN sourcemap. Si on veut debug en prod, utiliser
        // un service de monitoring privé qui upload les sourcemaps séparément.
        sourcemap: false,
        chunkSizeWarningLimit: 800,
        // Phase 3E perf — désactive le polyfill modulepreload (économise ~2-4KB
        // sur le bundle initial). Tous les navigateurs modernes supportent
        // nativement modulepreload, le polyfill est inutile pour notre cible.
        modulePreload: { polyfill: false },
        rollupOptions: {
          // Vite 8 = Rolldown : `external` est une option de TOP-NIVEAU (plus sous `output`).
          external: ['html2canvas'],
          output: {
            // [S5-REFONTE-PERF] `codeSplitting` (API Rolldown) plutôt que `manualChunks` : les
            // groupes y ont une PRIORITÉ — React et recharts sont capturés AVANT le noyau, sans quoi
            // la capture récursive des dépendances du noyau y aspirait React (mesuré : un seul
            // chunk de 205 Ko gzip, React invalidé à chaque déploiement).
            codeSplitting: {
              groups: [
                { name: 'react-vendor', test: /[\\/]node_modules[\\/](react|react-dom|scheduler|use-sync-external-store)[\\/]/, priority: 3 },
                // [PERF-SDK-BOOT-PRELOAD] recharts n'est atteint que par des pages chargées à la
                // demande : son groupe reste hors du démarrage (vérifié sur dist/index.html).
                { name: 'recharts', test: /[\\/]node_modules[\\/](recharts|victory-vendor|d3-[^/]+|internmap)[\\/]/, priority: 2 },
                // Tout ce que l'entrée importe STATIQUEMENT (donc chargé au démarrage quoi qu'il
                // arrive) va dans UN chunk « noyau ». Sans ce groupe, chaque module partagé avec une
                // page chargée à la demande devenait son propre petit chunk : ~15 requêtes au
                // démarrage, que le Lighthouse mobile simule en HTTP/1.1 (6 connexions, allers-retours
                // lents) — mesuré : FCP 3,0 → 2,6 s, score mobile 0,88 → 0,92 en les regroupant.
                // ⚠️ Ne casse AUCUNE frontière asynchrone (le piège de [PERF-SDK-BOOT-PRELOAD]
                // ci-dessous) : seul le graphe STATIQUE de l'entrée est concerné, un module atteint
                // seulement par import() n'y est jamais.
                {
                  name: (id, ctx) => (!id.includes('node_modules/') && grapheDemarrage((m) => ctx.getModuleInfo(m)).has(id) ? 'noyau' : null),
                  priority: 1,
                },
              ],
            },
            // [PERF-SDK-BOOT-PRELOAD] La règle `@anthropic-ai/ → 'ai-vendor'` est RETIRÉE : un
            // chunk manuel dont le contenu n'est atteint QUE par import() devient EAGER (le chunk
            // manuel casse la frontière asynchrone — l'entry l'importait STATIQUEMENT et le SDK
            // ~126 Ko était modulepreload au BOOT, mesuré, alors qu'aucune chaîne statique source
            // n'existe). Sans la règle, Rolldown range le SDK dans le chunk async naturel de
            // claude.ts — téléchargé au PREMIER usage IA seulement (mesuré sur dist/index.html).
            // Même retrait pour `jspdf → 'pdf-vendor'` : dès que la règle SDK est partie, le
            // reshuffle a fait apparaître pdf-vendor dans le preload de boot (MÊME piège manualChunk
            // eager) — jspdf n'est atteint que par import() (pdfReport), il n'a rien à faire au boot.
          },
        },
      },
    };
});
