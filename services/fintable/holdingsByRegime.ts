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
import type { JumeauxPorteurs } from './autoriteCourtier';

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

/**
 * [FINTABLE-AUTORITE-PARTOUT étape 3] Les paniers JUMEAUX qui PORTENT vraiment de la valeur.
 *
 * ⚠️ POURQUOI CE N'EST PAS UNE LECTURE D'UNE BASE DE CALCUL. Le refus `famille-mixte` existe parce
 * qu'un total courtier annoncé « CELI » ne peut pas s'écrire sur le panier CELI quand un CELIAPP
 * bien réel vit à côté (mesuré : 91 500 $ affichés pour 66 500 $ réels). Tant que ce test se
 * lisait dans les soldes de DÉPART, il répondait sur la base du moteur — donc l'écran, dont la
 * base replie CELIAPP sur CELI (`BUCKET_OF`, juste au-dessus), n'aurait JAMAIS pu le faire tirer.
 * Une garde structurellement inatteignable n'est pas une protection.
 *
 * La question « le CELIAPP porte-t-il quelque chose ? » est un FAIT sur les avoirs : elle se
 * calcule une fois, ici, et se passe aux deux surfaces. Elle est en prime plus sûre que l'ancienne
 * lecture — un CELIAPP dont tous les titres sont écartés de la reconstruction valait `0` dans les
 * soldes, et le refus ne pouvait pas tirer non plus.
 *
 * ⚠️ `> 0` et non « il existe un actif de ce type » : un titre soldé (quantité 0) ne rend pas le
 * panier mixte, et le compter ferait refuser un total courtier parfaitement applicable.
 */
export function jumeauxPorteursDepuisActifs(
    assets: readonly Asset[] | undefined,
    fxRates: Record<string, number> | undefined,
): JumeauxPorteurs {
    let CELIAPP = false;
    let REEE = false;
    for (const a of assets ?? []) {
        const type = a.accountType;
        if (type !== 'CELIAPP' && type !== 'REEE') continue;
        if (!(assetValueCad(a, fxRates) > 0)) continue;
        if (type === 'CELIAPP') CELIAPP = true; else REEE = true;
    }
    return { CELIAPP, REEE };
}
