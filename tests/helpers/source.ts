// tests/helpers/source.ts
//
// [AITOOLS-CALLSITE-UNIQUE-GARDE] Lecteur de SOURCE partagé pour les gardes-scan.
//
// Pourquoi ce module existe : le dépôt porte SIX décommenteurs `stripComments` recopiés
// (`tests/aiTools/specFiniteGuard.test.ts`, `tests/services/assetFxGuard.test.ts`,
// `utils/fiscalConstGuardV2.ts`, `utils/chartDataSumGuard.ts`, `utils/fiscalConstantsGuard.ts`…),
// aucun exporté — leçon `GUARD-STRIPCOMMENTS-DUPLIQUE`, déjà payée deux fois. Celui-ci est le
// premier EXPORTÉ ; la migration des six existants est un ticket à part
// (`[GUARD-STRIPCOMMENTS-CONSOLIDER]`), pas un effet de bord de la garde qui l'introduit.
//
// ⚠️ Une garde d'ABSENCE (`not.toMatch`) DOIT lire la source DÉCOMMENTÉE : la meilleure façon
// d'expliquer un motif interdit est de l'écrire, donc une bonne doc fait rougir un scan naïf
// (leçon `SCAN-QUI-MATCHE-LA-PROSE`, trois récidives). Symétriquement, une garde de PRÉSENCE qui
// vise un commentaire doit lire la source BRUTE.

import { readFileSync } from 'node:fs';

/** Retire commentaires de bloc et de ligne. Volontairement simple — l'anti-vacuité ci-dessous
 *  est ce qui empêche de prouver une absence à partir d'un fichier devenu vide. */
export function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Lit un fichier décommenté ET PROUVE que le décommentage n'a pas tout mangé : « rien ne
 * référence X » ne doit jamais se démontrer à partir de « il n'y a plus rien ». Deux témoins :
 * la part de code restante, et un jeton de vrai code que l'appelant sait devoir s'y trouver.
 */
export function readCodeOnly(path: string, witness: string, minCodeRatio = 0.2): string {
    const raw = readFileSync(path, 'utf8');
    const code = stripComments(raw);
    if (raw.length > 0 && code.length / raw.length < minCodeRatio) {
        throw new Error(
            `${path} : décommentage suspect (${code.length}/${raw.length} caractères restants) — ` +
            'une garde d\'absence lue sur un fichier vidé serait vacueuse',
        );
    }
    if (!code.includes(witness)) {
        throw new Error(`${path} : témoin « ${witness} » introuvable APRÈS décommentage — le lecteur a mangé du code`);
    }
    return code;
}
