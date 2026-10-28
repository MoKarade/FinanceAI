// tests/components/netWorthByOwnerPrivacy.test.tsx
//
// [A11Y-PCT-NOT-MASKED] Le POURCENTAGE de répartition du patrimoine entre conjoints est masqué en
// mode discret, comme le montant qu'il accompagne.
//
// ⚠️ CE TEST FIXE UN ARBITRAGE, il ne se contente pas de constater un comportement — et l'arbitrage
// va CONTRE la règle générale du dépôt, donc il doit être écrit noir sur blanc.
//
// La règle établie (`tests/components/Investments.privacy.test.tsx`, lot `[A11Y-PRIVACY-LOT2]`) dit
// en toutes lettres : « CE QUI RESTE VISIBLE, à dessein : les pourcentages (part du portefeuille,
// écart de rééquilibrage, variation, gain en %). Ce sont des ratios et une direction, pas des
// sommes. » Ce raisonnement tient pour un portefeuille : savoir qu'il est à 40 % en actions ne dit
// rien sur la personne.
//
// Il ne tient PAS ici, et c'est la distinction que ce test verrouille : un pourcentage de
// répartition ENTRE DEUX PERSONNES n'est pas un ratio d'allocation, c'est une information
// RELATIONNELLE. « 70 % / 30 % » se lit par-dessus l'épaule aussi bien qu'un montant, reste
// parfaitement lisible quand les dollars sont masqués, et dit quelque chose du couple — pas du
// portefeuille. Le mode discret existe pour ce regard-là.
//
// Le dépôt traite d'ailleurs DÉJÀ un `%` comme masquable selon le contexte : `FutureKpiStrip` a un
// drapeau `privateSublabel` qui enveloppe son sous-libellé dans `PrivateAmount`. La règle n'était
// donc pas « jamais un pourcentage », mais « pas les ratios anodins » — ce site-ci n'en est pas un.
//
// ⚠️ Garde de SOURCE et non de rendu : atteindre ce composant par le rendu exige un état de couple
// complet (deux personnes, actifs attribués, répartition calculée). Un test de rendu qui n'atteint
// pas le site ne prouve rien SUR ce site tout en le faisant croire couvert — même raisonnement que
// `Investments.privacy.test.tsx`, qui l'explique déjà pour ses neuf sites.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CHEMIN = '../../components/investments/NetWorthByOwnerCard.tsx';
const SOURCE = readFileSync(resolve(__dirname, CHEMIN), 'utf8');

/** Lignes de code (hors commentaires) qui AFFICHENT le pourcentage via l'aide `pct(...)`. */
const lignesQuiAffichentUnPct = (): string[] =>
    SOURCE.split('\n')
        .filter((l) => /\{\s*pct\(/.test(l))          // interpolation JSX `{pct(...)}` : un AFFICHAGE
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)); // pas une ligne de commentaire

describe('[A11Y-PCT-NOT-MASKED] la répartition en % entre conjoints suit le mode discret', () => {
    it('le fichier expose bien un pourcentage (anti-vacuité : sans ça, la garde passerait à vide)', () => {
        // Si l'aide `pct` disparaissait ou était renommée, les assertions suivantes seraient
        // satisfaites par une liste VIDE — le mode de panne classique d'un scan de source.
        expect(lignesQuiAffichentUnPct().length).toBeGreaterThanOrEqual(1);
    });

    it('CHAQUE affichage de pourcentage est enveloppé dans PrivateAmount', () => {
        const nonProteges = lignesQuiAffichentUnPct().filter((l) => !/PrivateAmount/.test(l));
        expect(nonProteges, 'un % de répartition entre personnes doit être masqué comme un montant').toEqual([]);
    });

    it('le libellé du poste reste HORS du masquage (masquer ne doit pas retirer un discriminant)', () => {
        // `MASQUAGE-RETIRE-UN-DISCRIMINANT` : si le nom du poste était masqué avec sa valeur, les
        // trois tuiles deviendraient indistinguables (« ••• / ••• » trois fois) et le nom
        // accessible ne dirait plus de QUI on parle. Le libellé doit donc rester en clair.
        expect(SOURCE).toMatch(/\{b\.label\}/);
        const ligneLibelle = SOURCE.split('\n').find((l) => /\{b\.label\}/.test(l)) ?? '';
        expect(ligneLibelle).not.toMatch(/PrivateAmount/);
    });
});
