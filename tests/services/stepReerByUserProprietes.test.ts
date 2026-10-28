// tests/services/stepReerByUserProprietes.test.ts
//
// [ENG-REERBYUSER-RETRAIT-INERTE] Caractérisation de `stepReerByUser` — le module qui tient le
// registre REER PAR CONJOINT. Ce fichier existe parce que trois lots successifs ont buté dessus en
// se posant à chaque fois la même question mal : « est-ce que ce paramètre sert à quelque chose ? »
//
// La réponse est différente pour les deux paramètres, et elle est ARITHMÉTIQUE — pas une propriété
// de fixture. Elle se lit dans le code : le retrait est réparti AU PRORATA du solde, la cotisation
// SELON `shares`, puis `reconcileToPool` met à l'échelle pour que Σ vaille `poolEnd`.
//
//   • **`withdrawal` ne déplace PAS la répartition.** Retirer au prorata multiplie CHAQUE solde par
//     le même facteur `(1 − w/Σ)` : le rapport est inchangé, et la mise à l'échelle finale efface
//     jusqu'à la trace du montant. MESURÉ : sur `[300 000, 630 000]`, un retrait de 0 $ et un
//     retrait de 70 000 $ rendent **exactement le même registre**. Même à 800 000 $ sur
//     `[50 000, 900 000]` : part identique au neuvième chiffre.
//   • **`contribution` la déplace**, elle, vers `shares` — c'est le seul des deux qui porte de
//     l'information. MESURÉ : part du conjoint 1 de 0,677419 → 0,656709 pour 100 000 $ cotisés
//     (`shares[1]` = 0,4641).
//
// ⚠️ CONSÉQUENCE À CONNAÎTRE AVANT DE « CORRIGER » CE REGISTRE. Plusieurs lots ont ajouté des
// EXCLUSIONS au terme `withdrawal` pour éviter une double soustraction (`ferrWithdrawalMois`,
// `divorceReerWithdrawalMois`). Elles sont **justes** — on ne soustrait pas deux fois ce qui a déjà
// été débité — mais elles n'achètent presque rien, puisque le terme est ratio-neutre. Mesuré sur le
// moteur, en retirant l'exclusion FERR : **0 $ à âge égal**, **−141,22 $** sur un écart de 15 ans, et
// **−1 641,85 $** sur un écart de 27 ans (pool REER de 1 755 229,60 $, soit 0,09 %) — et **53 tests
// restent VERTS**. Ce résiduel ne vient PAS du rapport mais de la SEULE porte de sortie du terme :
// le cas dégénéré ci-dessous.
//
// ⚠️ Ce fichier PRÉCISE, sans l'annuler, `UN-COUPLE-DU-MEME-AGE-EPINGLE-LE-REGISTRE-PER-CONJOINT`
// (livré quelques heures plus tôt) : j'y ai montré que les flux du registre ne sont PAS décoratifs.
// C'est vrai de `contribution` (+16 123 $ mesurés sous écart d'âge) ; ça ne l'est pas de
// `withdrawal`. Répondre « les flux comptent » ou « les flux ne comptent pas » est faux dans les
// deux sens : il fallait séparer les deux paramètres.

import { describe, it, expect } from 'vitest';
import { stepReerByUser } from '../../services/projection/perUserBalances';

/** Part du conjoint 1 (l'aîné, dans les scénarios FERR) dans le registre. */
const part1 = (a: number[]): number => (a[1] ?? 0) / ((a[0] ?? 0) + (a[1] ?? 0));

const SHARES = [0.5359, 0.4641];

describe('[ENG-REERBYUSER-RETRAIT-INERTE] ce que chaque paramètre de stepReerByUser fait vraiment', () => {
    it('`withdrawal` NE DÉPLACE PAS la répartition — quel que soit le montant', () => {
        const prev = [300_000, 630_000];
        const poolEnd = 930_000;
        const reference = stepReerByUser(prev, { withdrawal: 0, contribution: 0, poolEnd, shares: SHARES });
        // Anti-vacuité : le registre de référence est NON NUL et déséquilibré — sinon « rien ne
        // bouge » serait vrai pour une raison sans intérêt.
        expect(reference[0], 'registre de référence vide').toBeGreaterThan(1_000);
        expect(part1(reference), 'référence équilibrée : un déplacement serait invisible').toBeGreaterThan(0.6);

        for (const w of [1, 1_000, 70_000, 300_000, 899_999]) {
            const avec = stepReerByUser(prev, { withdrawal: w, contribution: 0, poolEnd, shares: SHARES });
            expect(part1(avec), `un retrait de ${w} $ a déplacé la répartition`).toBeCloseTo(part1(reference), 9);
        }
    });

    /**
     * LA seule porte de sortie du terme `withdrawal`, et donc la seule raison pour laquelle les
     * exclusions (`ferrWithdrawalMois`, `divorceReerWithdrawalMois`) ne sont pas STRICTEMENT sans
     * effet : quand le retrait vide le registre, `reconcileToPool` bascule sur son repli et
     * ré-attribue le pool selon `shares`. C'est le cas dégénéré qui explique le résiduel de
     * −1 641,85 $ mesuré sur le moteur.
     */
    it('cas DÉGÉNÉRÉ : un retrait ≥ Σ des soldes fait retomber la répartition sur `shares`', () => {
        const prev = [300_000, 630_000];
        const poolEnd = 930_000;
        const vidange = stepReerByUser(prev, { withdrawal: 930_000, contribution: 0, poolEnd, shares: SHARES });
        expect(part1(vidange), 'le registre n\'est pas retombé sur la clé salariale')
            .toBeCloseTo(SHARES[1] as number, 9);
        // Et ce n'est PAS ce que rend le cas ordinaire : sans quoi le test ne dirait rien.
        const ordinaire = stepReerByUser(prev, { withdrawal: 0, contribution: 0, poolEnd, shares: SHARES });
        expect(part1(ordinaire), 'le cas ordinaire vaut déjà `shares` : le dégénéré ne se distingue pas')
            .not.toBeCloseTo(SHARES[1] as number, 3);
    });

    it('`contribution` déplace la répartition VERS `shares`, et d\'autant plus qu\'elle est grosse', () => {
        const prev = [300_000, 630_000];
        const depart = part1(prev); // 0,677419 — bien au-dessus de shares[1] = 0,4641
        const ecarts = [10_000, 100_000, 500_000].map((c) => {
            const r = stepReerByUser(prev, { withdrawal: 0, contribution: c, poolEnd: 930_000 + c, shares: SHARES });
            return Math.abs(part1(r) - (SHARES[1] as number));
        });
        expect(Math.abs(depart - (SHARES[1] as number)), 'le départ est déjà à la clé : rien à observer')
            .toBeGreaterThan(0.2);
        // Chaque cotisation rapproche STRICTEMENT de la clé : un levier, pas un point de mesure.
        expect(ecarts[0], 'une cotisation n\'a pas rapproché de la clé').toBeLessThan(Math.abs(depart - (SHARES[1] as number)));
        expect(ecarts[1], 'une cotisation 10× plus grosse ne rapproche pas plus').toBeLessThan(ecarts[0] as number);
        expect(ecarts[2], 'une cotisation 50× plus grosse ne rapproche pas plus').toBeLessThan(ecarts[1] as number);
    });

    it('Σ(registre) == poolEnd dans tous les cas, y compris dégénérés', () => {
        const cas = [
            { prev: [300_000, 630_000], withdrawal: 0, contribution: 0, poolEnd: 930_000 },
            { prev: [300_000, 630_000], withdrawal: 70_000, contribution: 0, poolEnd: 860_000 },
            { prev: [300_000, 630_000], withdrawal: 0, contribution: 100_000, poolEnd: 1_030_000 },
            { prev: [300_000, 630_000], withdrawal: 2_000_000, contribution: 0, poolEnd: 1 },
            { prev: [0, 0], withdrawal: 0, contribution: 0, poolEnd: 500_000 },
        ];
        for (const c of cas) {
            const r = stepReerByUser(c.prev, { withdrawal: c.withdrawal, contribution: c.contribution, poolEnd: c.poolEnd, shares: SHARES });
            expect(r.reduce((s, x) => s + x, 0), `Σ ≠ poolEnd pour ${JSON.stringify(c)}`).toBeCloseTo(c.poolEnd, 6);
        }
    });
});

describe('[ENG-FERR-ECART-AGE-NON-COUVERT] les deux cas que le ticket disait « toujours PAS testés »', () => {
    // (a) `shares = [1, 0]` — l'état APRÈS divorce/décès (le callback consolide `reerByUser =
    // [reer, 0]` et `reerShares` devient [1, 0]). Toute fuite vers l'ex-conjoint serait un solde
    // fantôme au nom de quelqu'un qui n'est plus dans le ménage.
    it('shares = [1, 0] : cotisations, retraits et REPLI n\'attribuent JAMAIS rien au conjoint parti', () => {
        const seul = [100_000, 0];
        // Cotisation : intégralement au survivant.
        const avecCotisation = stepReerByUser(seul, { withdrawal: 0, contribution: 10_000, poolEnd: 110_000, shares: [1, 0] });
        expect(avecCotisation[0]).toBeCloseTo(110_000, 6);
        expect(avecCotisation[1]).toBe(0);
        // Retrait partiel : le survivant paie tout, l'autre reste à zéro exactement.
        const avecRetrait = stepReerByUser(seul, { withdrawal: 40_000, contribution: 0, poolEnd: 60_000, shares: [1, 0] });
        expect(avecRetrait[0]).toBeCloseTo(60_000, 6);
        expect(avecRetrait[1]).toBe(0);
        // VIDANGE (le cas dégénéré passe par le REPLI `splitByShares`) : même là, rien ne fuit.
        const vidange = stepReerByUser(seul, { withdrawal: 100_000, contribution: 0, poolEnd: 20_000, shares: [1, 0] });
        expect(vidange[0]).toBeCloseTo(20_000, 6);
        expect(vidange[1]).toBe(0);
    });

    // (b) Un solde per-conjoint NÉGATIF (cotisation à l'un + gros retrait à l'autre peut en
    // fabriquer un transitoirement) : il est ABSORBÉ — plancher à 0 avant la mise à l'échelle —
    // jamais propagé ni compensé par le conjoint sain au-delà du pool.
    // ⚠️ REDONDANCE mesurée (perturbations 2026-09-04) : DEUX planchers indépendants absorbent ce
    // cas — le clamp d'entrée de `stepReerByUser` ET le plancher de `reconcileToPool`. Retirer UN
    // seul laisse ce test VERT (l'autre rattrape) ; retirer les DEUX le fait rougir ([-60 k, 180 k]).
    // Ce test défend donc le FAIT (« jamais de registre négatif publié »), pas un mécanisme précis
    // (`UNE-PERTURBATION-MUETTE-SUR-SON-PROPRE-AJOUT-MESURE-SA-REDONDANCE`).
    it('solde négatif en entrée : absorbé (0), Σ == poolEnd exact, aucun registre négatif en sortie', () => {
        const r = stepReerByUser([-50_000, 150_000], { withdrawal: 30_000, contribution: 0, poolEnd: 120_000, shares: [0.5, 0.5] });
        expect(r[0], 'le conjoint négatif ressort à 0, pas en dette fantôme').toBe(0);
        expect(r[1]).toBeCloseTo(120_000, 6);
        expect(r.every((x) => x >= 0)).toBe(true);
        expect(r.reduce((s, x) => s + x, 0)).toBeCloseTo(120_000, 6);
        // Anti-vacuité : le négatif est bien DISCRIMINANT — sans le plancher de `reconcileToPool`,
        // la mise à l'échelle propagerait un registre négatif (mesuré en perturbation : [-60 k, 180 k]).
        const sain = stepReerByUser([50_000, 150_000], { withdrawal: 30_000, contribution: 0, poolEnd: 120_000, shares: [0.5, 0.5] });
        expect(sain[0], 'le même cas SANS négatif garde deux registres non nuls').toBeGreaterThan(0);
    });
});
