import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      // Phase 4 — base path configurable pour GitHub Pages.
      // En dev (mode === 'development') ou si VITE_BASE_PATH absent → '/'.
      // En build GitHub Pages, le workflow set VITE_BASE_PATH=/FinanceAI/.
      base: env.VITE_BASE_PATH || '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
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
