// tests/helpers/source.ts
//
// [AITOOLS-CALLSITE-UNIQUE-GARDE] Lecteur de SOURCE partagé pour les gardes-scan.
//
// Pourquoi ce module existe : le dépôt porte SIX décommenteurs `stripComments` recopiés
// (`tests/aiTools/specFiniteGuard.test.ts`, `tests/services/assetFxGuard.test.ts`,
// `utils/fiscalConstGuardV2.ts`, `utils/chartDataSumGuard.ts`, `utils/fiscalConstantsGuard.ts`…),
// aucun exporté — leçon `GUARD-STRIPCOMMENTS-DUPLIQUE`, déjà payée deux fois. Depuis
// `[GUARD-STRIPCOMMENTS-CONSOLIDER]`, la source unique est `utils/stripComments.ts` (pure, sans
// `node:fs`, donc atteignable depuis le bundle) et les trois gardes d'`utils/` la consomment. Les
// copies restantes vivent dans des fichiers de TEST : leur migration est un ticket à part.
//
// ⚠️ Une garde d'ABSENCE (`not.toMatch`) DOIT lire la source DÉCOMMENTÉE : la meilleure façon
// d'expliquer un motif interdit est de l'écrire, donc une bonne doc fait rougir un scan naïf
// (leçon `SCAN-QUI-MATCHE-LA-PROSE`, trois récidives). Symétriquement, une garde de PRÉSENCE qui
// vise un commentaire doit lire la source BRUTE.

import { readFileSync } from 'node:fs';
import { stripComments, partDeCodeRestante } from '../../utils/stripComments';

// [GUARD-STRIPCOMMENTS-CONSOLIDER] Le décommenteur vit désormais dans `utils/stripComments.ts` :
// il doit être atteignable depuis `utils/chartDataSumGuard.ts`, qui part dans le bundle du
// navigateur et ne peut donc rien importer d'ici (ce module touche `node:fs`). Ré-exporté pour ne
// pas casser les appelants existants.
export { stripComments } from '../../utils/stripComments';

/**
 * Lit un fichier décommenté ET PROUVE que le décommentage n'a pas tout mangé : « rien ne
 * référence X » ne doit jamais se démontrer à partir de « il n'y a plus rien ». Deux témoins :
 * la part de code restante, et un jeton de vrai code que l'appelant sait devoir s'y trouver.
 */
export function readCodeOnly(path: string, witness: string, minCodeRatio = 0.2): string {
    const raw = readFileSync(path, 'utf8');
    const code = stripComments(raw);
    // ⚠️ La part se mesure sur les caractères NON BLANCS, jamais sur la longueur : le décommenteur
    // BLANCHIT (il préserve lignes et colonnes pour les gardes qui reportent une position), donc
    // `code.length / raw.length` vaudrait toujours 1 et l'anti-vacuité serait vacueuse elle-même.
    const part = partDeCodeRestante(raw, code);
    if (part < minCodeRatio) {
        throw new Error(
            `${path} : décommentage suspect (${(part * 100).toFixed(1)} % de code non blanc restant) — ` +
            'une garde d\'absence lue sur un fichier vidé serait vacueuse',
        );
    }
    if (!code.includes(witness)) {
        throw new Error(`${path} : témoin « ${witness} » introuvable APRÈS décommentage — le lecteur a mangé du code`);
    }
    return code;
}
