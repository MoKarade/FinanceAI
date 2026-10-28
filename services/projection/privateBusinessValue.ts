// services/projection/privateBusinessValue.ts
//
// [ENG-W5-BUSINESS-NON-PUBLIE] (audit 2026-09-07, lot 214) SOURCE UNIQUE de la valeur des entreprises
// privées détenues (W5.7). Elle vivait inline dans `projection.ts` ; le passé (`buildPastPrefix`,
// `dailyPastLedger`) en a besoin avec la MÊME règle — une seconde copie divergerait en silence.
//
// ⚠️ On compte `estimatedValue × ownershipPct` et **PAS** `retainedEarnings` : une valeur juste
// marchande EMBARQUE déjà les bénéfices non répartis (l'encaisse de la société en fait partie).
// Les additionner double-compterait (400 k$ mesurés sur le persona de référence). Si `estimatedValue`
// devait un jour s'entendre HORS encaisse, ce serait une décision à écrire dans `docs/adr/`.
//
// ⚠️ Valeur CONSTANTE sur tout l'horizon et PLATE sur le passé : aucune croissance n'est modélisée,
// aucun historique n'existe. Inventer une courbe serait de la donnée fabriquée.
import type { PrivateBusiness } from '../../types';

export function computePrivateBusinessValue(list: ReadonlyArray<PrivateBusiness> | undefined | null): number {
    return (list ?? []).reduce((sum, b) => {
        const v = Number(b?.estimatedValue);
        const pct = Number(b?.ownershipPct);
        if (!Number.isFinite(v) || v <= 0) return sum;
        const part = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 100;
        return sum + v * (part / 100);
    }, 0);
}
