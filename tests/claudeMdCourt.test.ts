// CLAUDE.md est chargé à CHAQUE session : il doit rester court. Le détail vit dans docs/claude/.
// Limites : 60 lignes (décision Marc via pole-architecture) et 10 240 octets (règle pole-couts).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MAX_LIGNES = 60;
const MAX_OCTETS = 10_240;
const racine = resolve(__dirname, '..');
const chemin = resolve(racine, 'CLAUDE.md');

describe('CLAUDE.md reste court', () => {
  it(`fait au plus ${MAX_LIGNES} lignes`, () => {
    const contenu = readFileSync(chemin, 'utf8');
    const lignes = contenu.replace(/\r?\n$/, '').split(/\r?\n/).length;
    expect(lignes).toBeLessThanOrEqual(MAX_LIGNES);
  });

  it(`fait au plus ${MAX_OCTETS} octets`, () => {
    expect(readFileSync(chemin).byteLength).toBeLessThanOrEqual(MAX_OCTETS);
  });

  it('chaque fichier docs/claude/*.md cité dans l\'index existe', () => {
    const contenu = readFileSync(chemin, 'utf8');
    const cites = [...contenu.matchAll(/docs\/claude\/([a-z-]+\.md)/g)].map((m) => m[1]);
    expect(cites.length).toBeGreaterThan(0);
    for (const f of new Set(cites)) {
      expect(existsSync(resolve(racine, 'docs', 'claude', f)), f).toBe(true);
    }
  });
});
