// services/fintable/holdingsByRegime.ts
//
// [FINTABLE-6 Lot 2] Valeur CAD des titres SAISIS, groupée par panier fiscal réconciliable —
// l'entrée `holdingsByRegime` de `reconcileBrokerBalances`.
//
// ⚠️ La FAMILLE fiscale d'un type de compte vient de `BUCKET_OF` (`services/history/buildMarketData`),
// la MÊME table que les piles CELI/REER/NonReg de l'Accueil et les buckets TOTAL_* de l'historique —
// jamais une table parallèle re-tapée ici (classe A11Y-CHECK-CONTRAST-DRIFT : deux copies dérivent
// en silence). Conséquence voulue : CELIAPP compte avec CELI, REEE avec REER, MARGE/AUTRE/sans type
// avec NON-ENREG — l'écart affiché reste cohérent avec ce que l'utilisateur voit empilé ailleurs.
//
// CRYPTO est HORS réconciliation : le crypto ne vit pas dans un compte courtier Fintable, l'inclure
// dans NON-ENREG fabriquerait un faux écart de toute la valeur crypto.

import type { Asset } from '../../types';
import { assetValueCad } from '../portfolio';
import { BUCKET_OF } from '../history/buildMarketData';
import type { ReconcilableRegime } from './brokerBalances';

/** Bucket historique → panier réconciliable (`null` = hors réconciliation, ex. crypto). */
const REGIME_OF_BUCKET: Record<(typeof BUCKET_OF)[keyof typeof BUCKET_OF], ReconcilableRegime | null> = {
    TOTAL_CELI: 'CELI',
    TOTAL_REER: 'REER',
    'TOTAL_NON-ENREG': 'NON-ENREG',
    TOTAL_CRYPTO: null,
};

/**
 * Somme `assetValueCad` (source unique FX + garde NaN) par panier fiscal réconciliable.
 * Un actif sans `accountType` suit la convention du repo (`?? 'NON-ENREG'`, cf. buildMarketData).
 */
export function holdingsCadByRegime(
    assets: readonly Asset[] | undefined,
    fxRates: Record<string, number> | undefined,
): Partial<Record<ReconcilableRegime, number>> {
    const out: Partial<Record<ReconcilableRegime, number>> = {};
    for (const a of assets ?? []) {
        const regime = REGIME_OF_BUCKET[BUCKET_OF[a.accountType ?? 'NON-ENREG']];
        if (regime === null) continue;
        const v = assetValueCad(a, fxRates);
        if (v <= 0) continue; // 0 = actif sans valeur OU corrompu (déjà signalé par assetValueCad)
        out[regime] = (out[regime] ?? 0) + v;
    }
    return out;
}
