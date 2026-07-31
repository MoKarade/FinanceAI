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
// dans NON-ENREG fabriquerait un faux écart de toute la valeur crypto. (Limite assumée : si un compte
// courtier déclaré NON-ENREG contenait un jour du crypto — Wealthsimple crypto —, l'écart absorberait
// cette valeur ; non atteignable aujourd'hui, Disnat n'a pas de crypto.)
//
// ⚠️ BASE = LE PRÉSENT (quote courante × quantité courante, via assetValueCad), VOLONTAIREMENT
// différente des buckets TOTAL_* de l'historique (`buildMarketData` : dernier close daté ×
// détention datée `holdingsAt`, titres à queue périmée exclus). Les deux surfaces de l'Accueil
// peuvent donc afficher des chiffres différents pour le même panier — c'est le présent vs l'histoire,
// PAS un bug (finding financial-integrity #543, documenté pour la prochaine session).

import type { Asset } from '../../types';
import { assetValueCad } from '../portfolio';
import { BUCKET_OF } from '../history/buildMarketData';
import { logErrorThrottled } from '../errorLogger';
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
        // 0 = actif sans valeur, OU NaN/Infinity rabattu à 0 (ce cas-là est déjà signalé par
        // assetValueCad). Une valeur NÉGATIVE (quantité négative : position corrompue, saisie
        // erronée) est finie → assetValueCad ne dit RIEN ; l'écarter en silence fausserait l'écart
        // affiché comme reconstructible → tracée ici (finding silent-failure, panel #543).
        if (v < 0) {
            logErrorThrottled(`holdings-negative:${a.symbol ?? '?'}`, {
                source: 'storage',
                severity: 'warning',
                message: `Titre « ${a.symbol ?? '?'} » à valeur NÉGATIVE — écarté de la réconciliation courtier (quantité/prix à corriger)`,
                context: { symbol: a.symbol ?? null, quantity: a.quantity ?? null },
            });
            continue;
        }
        if (v === 0) continue;
        out[regime] = (out[regime] ?? 0) + v;
    }
    return out;
}
