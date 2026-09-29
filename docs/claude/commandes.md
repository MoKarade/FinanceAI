<!-- Extrait de CLAUDE.md, déplacé le 2026-09-26 (texte copié à l'identique, rien supprimé). Index : CLAUDE.md -->

## 4. Commandes utiles

```bash
npm run dev                  # Vite
npm run test  · test:watch   # Vitest
npm run test:e2e             # Playwright / Chromium
npm run typecheck · lint     # tsc --noEmit · ESLint
npm run build                # ⚠️ prebuild = lint : le build CASSE si le lint échoue
npm run knip · check-contrast
npm run portes               # portes qualité de l'Atelier (cliquet, qualite/seuils.json) — ≈ 20 min
npm run portes:maj           # resserre les seuils après une amélioration (jamais l'inverse)
npm run mcp:dev | mcp:auth | mcp:connect | mcp:pack
```

- `/review-all` — panel d'agents sur le diff courant (voir §11).
- `tools/agent-control-center` — vue `/backlog` dérivée de `BACKLOG.md`, `docs/A_FAIRE_MOI.md`
  et de git. **Lecture seule**, et les nombres de tests y sont *lus* du `HANDOVER.md` plutôt
  que re-mesurés : une commande de tableau de bord ne doit pas coûter une suite complète.

