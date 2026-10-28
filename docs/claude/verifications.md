<!-- Extrait de CLAUDE.md, déplacé le 2026-09-26 (texte copié à l'identique, rien supprimé). Index : CLAUDE.md -->

## 5. Vérifications avant commit

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

Avant CHAQUE commit (hook `commit-gate`). Jamais `--no-verify`.

- ⚠️ **`npm run typecheck`, JAMAIS `npx tsc`** : `npx` peut résoudre un TypeScript distant qui
  ignore `--noEmit` → « vert » trompeur + pollution de l'environnement du même appel.
- ⚠️ `npm run build` a un `prebuild` = `lint` : le build CASSE si le lint échoue.
- Autres : `test:watch`, `test:e2e`, `knip`, `check-contrast`, MCP `mcp:dev|auth|connect|pack`.

