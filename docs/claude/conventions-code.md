<!-- Extrait de CLAUDE.md, déplacé le 2026-09-26 (texte copié à l'identique, rien supprimé). Index : CLAUDE.md -->

## 2. Conventions de code

React 19.2 + Vite 8 (Rolldown) + TS 5.8 strict + Tailwind 3 · Zustand 5 (persist+partialize,
schema v7) · Zod 3 · Recharts 3 (lazy) · Vitest 4 + Testing Library + axe-core ·
@anthropic-ai/sdk (Sonnet 4.6 + Haiku 4.5) · @modelcontextprotocol/sdk · Finnhub + CoinGecko ·
i18next · jspdf. Prod : **Vercel**.

Structure **PLATE** (pas de `src/`) : racine `App.tsx`, `index.tsx`, `constants.ts`, `types.ts`,
`i18n.ts` ; dossiers `components/ hooks/ services/ store/ utils/ locales/ mcp/ e2e/ tests/
scripts/ docs/`. Cœur : `services/projection.ts` + `services/projection/` (57 sous-modules, mesuré le 2026-09-05).

⚠️ Hoister un import au niveau App tire ses deps dans le bundle de BOOT → lazy-charger
(`lazyWithRetry` + Suspense) tout composant/service app-level qui importe du lourd.

