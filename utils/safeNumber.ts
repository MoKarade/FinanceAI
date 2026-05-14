/**
 * Coerce une valeur inconnue en nombre fini, sinon retourne fallback.
 * Optionnellement clamp dans [min, max].
 *
 * @param value      Valeur à normaliser (number, string, null, undefined, etc.)
 * @param fallback   Valeur à retourner si parsing échoue ou résultat non fini (default: 0)
 * @param min        Borne inférieure inclusive (optionnelle)
 * @param max        Borne supérieure inclusive (optionnelle)
 *
 * @example
 *   safeNumber('42')           // 42
 *   safeNumber('abc')          // 0
 *   safeNumber(NaN, 100)       // 100
 *   safeNumber(Infinity)       // 0
 *   safeNumber(-5, 0, 0, 100)  // 0 (clamp)
 *   safeNumber(150, 0, 0, 100) // 100 (clamp)
 */
export const safeNumber = (
    value: unknown,
    fallback: number = 0,
    min?: number,
    max?: number,
): number => {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    let result = n;
    if (min !== undefined && result < min) result = min;
    if (max !== undefined && result > max) result = max;
    return result;
};
