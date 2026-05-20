import path from 'path';
import { execSync } from 'node:child_process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Phase A.4 — version exacte exposée comme constantes globales build-time.
// `APP_VERSION` est bumpée manuellement à chaque phase majeure ; `GIT_SHA`
// identifie chaque push ; `BUILD_DATE` permet de tracer l'âge du bundle.
const APP_VERSION = '3.0.0-alpha.0';
const GIT_SHA = (() => {
    try {
        return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch {
        return 'dev';
    }
})();
const BUILD_DATE = new Date().toISOString().slice(0, 10);

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
        sourcemap: 'hidden',
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
