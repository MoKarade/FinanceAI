import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

// Copies EXACTES du kit d'auto-merge de l'Atelier (tag kit-1.9.0) : empreintes épinglées dans COPIES.md, jamais retouchées, donc jamais linées.
// Liste NOMINATIVE (pas le glob modeles/auto-merge/**) : un fichier propre à FinanceAI ajouté dans ce dossier reste lint.
const COPIES_MODELE_ATELIER = ['autoMerge.mjs', 'autoMerge.d.mts', 'fusionner.mjs', 'armer.mjs', 'codes-raison.mjs', 'verifier-copies.mjs', 'surblocage.mjs'].map((f) => `modeles/auto-merge/${f}`);

export default [
  {
    // dist-mcp/** et dist-ssr/** : artefacts de build (bundle esbuild du serveur MCP + SSR) — comme
    // dist/**, ils ne doivent PAS être lint-scannés (leur code bundlé porte des directives eslint de
    // deps tierces → « rule not found ». Vercel build d'un clone propre ne les a pas, mais un build
    // local APRÈS `mcp/build-server.mjs` fait échouer `prebuild=lint`). Alignés sur .gitignore.
    ignores: ['dist/**', 'dist-mcp/**', 'dist-ssr/**', 'node_modules/**', '**/*.d.ts', 'public/**', ...COPIES_MODELE_ATELIER],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': 'off',
    },
  },
];
