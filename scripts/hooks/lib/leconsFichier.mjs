// Chemin du fichier « leçons » cité par le rappel de push (learn-on-push.mjs).
// Lu dans scripts/hooks/hooks.config.json (clé `leconsFichier`) pour que le MÊME hook serve d'autres
// apps. Défaut = docs/claude/lecons.md. Le chemin finit dans le texte injecté à Claude : on
// n'accepte qu'un chemin relatif simple (pas d'absolu, pas de `..`, pas de caractère de contrôle),
// sinon retour au défaut. Jamais d'exception : le hook est non bloquant.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LECONS_PAR_DEFAUT = 'docs/claude/lecons.md';

export function cheminLecons(config) {
  const v = config && config.leconsFichier;
  const sain = typeof v === 'string' && /^[A-Za-z0-9._/-]{1,200}$/.test(v) && !v.startsWith('/') && !v.split('/').includes('..');
  return sain ? v : LECONS_PAR_DEFAUT;
}

export function lireCheminLecons() {
  try {
    const f = join(dirname(fileURLToPath(import.meta.url)), '..', 'hooks.config.json');
    return cheminLecons(JSON.parse(readFileSync(f, 'utf8')));
  } catch { return LECONS_PAR_DEFAUT; }
}
