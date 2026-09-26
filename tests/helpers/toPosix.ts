// tests/helpers/toPosix.ts
//
// [WIN-GARDES] Normalise un chemin en séparateurs `/`.
//
// Pourquoi : `path.join`, `path.resolve` et `path.relative` rendent des `\` sous Windows. Les gardes
// qui scannent les sources comparent ensuite ces chemins à des littéraux `/fichier.tsx` ou à
// `process.cwd() + '/'` : sous Linux (la CI) tout passe, sous Windows (le PC de Marc) elles
// échouent sans rien dire du code. On normalise à la SORTIE des marcheurs de fichiers, jamais en
// assouplissant une assertion : une garde qui ne voit plus rien doit rester rouge.
export function toPosix(chemin: string): string {
    return chemin.replace(/\\/g, '/');
}

/** `process.cwd()` en séparateurs `/` (comparable à un chemin déjà passé par `toPosix`). */
export const cwdPosix = (): string => toPosix(process.cwd());
