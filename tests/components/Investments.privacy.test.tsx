// tests/components/Investments.privacy.test.tsx
//
// [A11Y-PRIVACY-INVESTMENTS-DETAIL] — 5ᵉ ticket du lot `[A11Y-PRIVACY-LOT2]`.
//
// Cas différent des quatre précédents : `isPrivacyMode` était DÉJÀ câblé dans ce fichier (infobulles
// des donuts, table sr-only, KPI patrimoine). C'était une omission PAR SITE, pas une plomberie
// manquante — le patron exact de la PR #608. Neuf `formatCAD` nus subsistaient :
//   · légendes des deux donuts (répartition par région et par secteur) ;
//   · suggestions de rééquilibrage, en carte ET en liste (« Vendre 12 000 $ de… ») ;
//   · carte par titre : Valeur, Coût moyen DCA, Gain total DCA.
//
// CE QUI RESTE VISIBLE, à dessein : les pourcentages (part du portefeuille, écart de
// rééquilibrage, variation, gain en %) et le SIGNE du gain. Ce sont des ratios et une direction,
// pas des sommes — et la couleur du texte trahit déjà le signe. Même règle que partout dans ce lot.
//
// ⚠️ POURQUOI UNE GARDE DE SOURCE ICI, en plus du rendu : atteindre les neuf sites par le rendu
// demanderait neuf états distincts (sous-onglet, cibles d'allocation configurées, transactions
// d'achat pour les stats DCA…). Un test de rendu qui n'atteint pas un site ne prouve rien SUR ce
// site, et le ferait croire couvert. Le scan de source, lui, les voit tous — c'est la même famille
// que `chartPrivacyScan.test.ts`, qui garde les formateurs de graphique.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, '../../components/Investments.tsx'), 'utf8');

/** Marques prouvant qu'un montant est rendu en tenant compte du mode discret. */
const PROTEGE = /PrivateAmount|PrivateBlock|isPrivacyMode|maskedTick/;

/**
 * Chaque ligne qui AFFICHE un montant via `formatCAD`, avec son contexte immédiat.
 * Le contexte remonte de 2 lignes : une balise `<PrivateAmount …>` ouvrante peut précéder le
 * montant sur sa propre ligne (cas réel du KPI « total portefeuille », l. 1052-1054).
 */
const sitesNonProteges = () => {
    const lignes = SOURCE.split('\n');
    const out: string[] = [];
    lignes.forEach((ligne, i) => {
        if (!/formatCAD\(/.test(ligne)) return;
        if (/^\s*(\/\/|\*|\/\*)/.test(ligne)) return;          // commentaire
        if (/^import /.test(ligne)) return;                     // import du helper
        const contexte = lignes.slice(Math.max(0, i - 2), i + 1).join('\n');
        if (PROTEGE.test(contexte)) return;
        out.push(`${i + 1}: ${ligne.trim().slice(0, 90)}`);
    });
    return out;
};

describe('[A11Y-PRIVACY-INVESTMENTS-DETAIL] garde de source : aucun montant en clair', () => {
    it('la garde a bien des montants à examiner (sinon elle ne prouverait rien)', () => {
        const total = (SOURCE.match(/formatCAD\(/g) ?? []).length;
        expect(total, 'aucun formatCAD dans le fichier : le scan est cassé, pas le fichier')
            .toBeGreaterThan(10);
    });

    it('AUCUN `formatCAD` du fichier n’échappe au mode discret', () => {
        expect(
            sitesNonProteges(),
            'ces montants s’affichent en clair quel que soit le mode discret — les envelopper dans '
            + '<PrivateAmount> (ou lire isPrivacyMode s’il s’agit d’un formateur de graphique)',
        ).toEqual([]);
    });

    // ⚠️ Le contexte de la garde remonte de 2 lignes. Au-delà, un `<PrivateAmount>` ouvert plus haut
    // ne serait plus vu et produirait un FAUX POSITIF bruyant (pas un faux négatif : la garde
    // accuserait à tort, elle ne laisserait rien passer). Ce test fige cette limite : si quelqu'un
    // écrit un bloc plus espacé, il verra la garde échouer et saura qu'il faut élargir le contexte
    // plutôt que de croire à une vraie fuite.
    it('aucun bloc PrivateAmount du fichier n’espace son montant de plus de 2 lignes', () => {
        const lignes = SOURCE.split('\n');
        const trop: string[] = [];
        lignes.forEach((ligne, i) => {
            if (!/<PrivateAmount/.test(ligne)) return;
            const fin = lignes.slice(i, i + 6).join('\n');
            const idx = fin.indexOf('formatCAD(');
            if (idx < 0) return;                       // PrivateAmount sans formatCAD : hors sujet
            const ecart = fin.slice(0, idx).split('\n').length - 1;
            if (ecart > 2) trop.push(`${i + 1} (montant ${ecart} lignes plus bas)`);
        });
        expect(trop, 'la garde ne verrait plus ce PrivateAmount : élargir son contexte').toEqual([]);
    });
});

// ── Ce qui doit RESTER lisible ────────────────────────────────────────────────────────────────
// Test d'INTENTION. Sans lui, un futur « masquons tout » retirerait les pourcentages sans que le
// choix soit rediscuté — et un écran de répartition sans ses pourcentages ne sert plus à rien.
describe('[A11Y-PRIVACY-INVESTMENTS-DETAIL] décision explicite : les ratios restent', () => {
    it('les pourcentages des légendes et du rééquilibrage ne sont PAS masqués', () => {
        // Ces trois rendus de % côtoient un montant désormais masqué, sur la même ligne ou juste
        // en dessous. Ils doivent survivre.
        expect(SOURCE, 'part du portefeuille dans la légende des donuts')
            .toContain('{item.percent.toFixed(1)}%');
        expect(SOURCE, 'écart de rééquilibrage (surplus)').toContain('{a.diffPct.toFixed(1)}%');
        expect(SOURCE, 'gain DCA en pourcentage').toContain('{purchaseStats.gainPct.toFixed(1)}%');
    });

    it('le SIGNE du gain DCA reste hors du masque (direction, pas montant)', () => {
        expect(SOURCE).toContain("{purchaseStats.totalGain >= 0 ? '+' : ''}<PrivateAmount>");
    });
});
