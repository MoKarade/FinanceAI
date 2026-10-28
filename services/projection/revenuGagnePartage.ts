// services/projection/revenuGagnePartage.ts
//
// [FISC-RRSP-RENTAL-EARNED] (décision Marc 2026-09-05, réponse 5a) Le revenu NET de location est du
// revenu GAGNÉ au sens des droits REER — guide T4040 : « revenu net de location de biens immeubles »
// dans le revenu gagné, « pertes de location » en déduction (source RELAYÉE, `docs/FISCAL_REFERENCE.md`
// §7). Or le registre des droits est PER-CONJOINT (`accGrossIncomeYearByUser`, règle ARC « par
// personne ») et un immeuble n'avait AUCUN propriétaire dans le modèle : attribuer un loyer exige de
// choisir la clé. Ce module porte cette clé, et rien d'autre — il ne calcule ni loyer ni impôt.
//
// Convention : `owner` réutilise `AssetOwner` des actifs (`user1 | user2 | joint`, cf. `types.ts`).
// Absent = `joint`, réputé détenu à parts ÉGALES (le « défaut 50/50 » de Marc). Ménage effondré sur
// une seule tête (décès du conjoint, divorce) ou ménage solo : tout revient au déclarant restant,
// index 0 — la même règle que `taxFilers` et `householdAdults` dans la boucle de `projection.ts`.
//
// ⚠️ Deux producteurs, deux positions par rapport au reset de janvier (leçon
// `UN-ACCUMULATEUR-ANNUEL-SE-JUGE-SUR-SA-POSITION-PAR-RAPPORT-A-SON-RESET`) : le NOI W5 est produit
// AVANT le bloc de janvier → il passe par le tampon `grossIncomeEnAttenteByUser` comme le salaire ;
// le loyer des buts immobiliers est produit APRÈS → il est versé directement. Ce module ne sait rien
// de cet ordre : c'est l'appelant qui choisit le registre, ici on ne fait que RÉPARTIR.

import type { AssetOwner } from '../../types';

export type MontantsParProprietaire = Record<AssetOwner, number>;

export const montantsParProprietaireVides = (): MontantsParProprietaire => ({ user1: 0, user2: 0, joint: 0 });

/** Part de CHAQUE conjoint quand l'immeuble est conjoint ou sans propriétaire saisi
 *  (décision Marc 2026-09-05 : « défaut 50/50 »). Décision PRODUIT, pas une règle fiscale. */
export const PART_CONJOINT_DEFAUT = 0.5;

export interface MenageRevenuGagne {
    /** Taille NOMINALE du ménage — reste 2 après un décès ou un divorce (cf. `projection.ts`). */
    activeUsersCount: number;
    /** `survivorMode || divorced` : un seul déclarant vivant, tout lui revient. */
    soloHousehold: boolean;
}

/** Normalise une valeur PERSISTÉE : tout ce qui n'est pas `user1`/`user2` est réputé conjoint —
 *  une chaîne inconnue venue d'un backup ne doit ni planter ni fabriquer un `NaN` par indexation. */
export const cleProprietaire = (owner: unknown): AssetOwner =>
    owner === 'user1' || owner === 'user2' ? owner : 'joint';

/** Accumule un montant dans le seau de son propriétaire. Un montant non fini est IGNORÉ ici parce
 *  que le lecteur final (`taxJanuary`) l'ignorerait de toute façon (`Number.isFinite` avant le calcul
 *  des droits) — mieux vaut un seau propre qu'un `NaN` qui contaminerait les deux conjoints. */
export function ajouterParProprietaire(cible: MontantsParProprietaire, owner: unknown, montant: number): void {
    if (!Number.isFinite(montant)) return;
    cible[cleProprietaire(owner)] += montant;
}

/** Parts [conjoint 0, conjoint 1] d'un revenu gagné selon son propriétaire et l'état du ménage.
 *  Invariant : la somme des deux parts vaut toujours 1 — un revenu gagné ne se perd ni ne se double. */
export function partsRevenuGagne(owner: unknown, menage: MenageRevenuGagne): [number, number] {
    if (menage.activeUsersCount <= 1 || menage.soloHousehold) return [1, 0];
    switch (cleProprietaire(owner)) {
        case 'user1': return [1, 0];
        case 'user2': return [0, 1];
        default: return [PART_CONJOINT_DEFAUT, 1 - PART_CONJOINT_DEFAUT];
    }
}

/** Réduit des seaux par propriétaire en un tuple per-conjoint prêt à alimenter le registre. */
export function repartirRevenuGagne(montants: MontantsParProprietaire, menage: MenageRevenuGagne): [number, number] {
    const out: [number, number] = [0, 0];
    for (const owner of ['user1', 'user2', 'joint'] as const) {
        const v = montants[owner];
        if (!Number.isFinite(v) || v === 0) continue;
        const [p0, p1] = partsRevenuGagne(owner, menage);
        out[0] += v * p0;
        out[1] += v * p1;
    }
    return out;
}
