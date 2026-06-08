import path from 'path';
import { execSync } from 'node:child_process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: env.VITE_BASE_PATH || '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
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
          output: {
            manualChunks: {
              'react-vendor': ['react', 'react-dom'],
              'recharts': ['recharts'],
              'ai-vendor': ['@anthropic-ai/sdk'],
              'pdf-vendor': ['jspdf'],
            },
            external: ['html2canvas'],
          },
        },
      },
    };
});
