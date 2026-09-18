/**
 * [FUTUR-PANNEAU-FIXE] « Les chiffres ne se recomposent pas entre eux » — irritant coché par Marc.
 *
 * ⚠️ C'EST UNE MESURE, PAS UNE IMPRESSION. La famille est documentée : quand deux chiffres d'un
 * même écran ne se recomposent pas, l'arithmétique de l'écran le dit avant tout raisonnement
 * (carte du hub, tuile « Variation 30 j », infobulle Futur — trois instances en deux jours). La
 * colonne « Par compte » du panneau ne liste que des termes POSITIFS : sans la ligne de dette, la
 * somme des comptes dépasse la valeur nette affichée juste à côté, et rien ne l'explique.
 *
 * ⚠️ Cette garde vise le RENDU, pas la dérivation : la dérivation elle-même est testée dans
 * `tests/components/detteReductrice.test.ts`. Ce qui n'appartenait à personne, c'est le CHAÎNON —
 * que la ligne rendue porte bien ce montant-là, dans la colonne que Marc regarde
 * (`UN-TROU-ENTRE-DEUX-MOITIES-TESTEES-N-APPARTIENT-A-PERSONNE`).
 * ⚠️ Mon premier jet affirmait ici « déjà testée chez elle » — c'était FAUX : aucun fichier de
 * `tests/` n'importait ce module. Une phrase de couverture se vérifie comme un chiffre.
 */
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderPanneauJour } from '../../helpers/panneauJour';
import type { PointJour } from '../../../components/projection/panneauJour/sections';

/** Montants ronds et distincts : un écart s'y lit à l'œil dans le message d'échec. */
const COMPTES = { Liquidites: 12_000, CELI: 90_000, REER: 210_000, NonReg: 45_000 } as const;
const SOMME_ACTIFS = 357_000; // 12 000 + 90 000 + 210 000 + 45 000
const DETTE = 47_000;

const point = (over: Partial<PointJour> = {}): PointJour => ({
    monthIndex: 3,
    dateLabel: '18 sept. 2026',
    age: 41,
    NetWorth: SOMME_ACTIFS - DETTE,
    ...COMPTES,
    ...over,
} as PointJour);

/** Normalise les espaces : `formatCAD` sépare les milliers par une INSÉCABLE (U+00A0). */
const texte = () => (document.body.textContent || '').replace(/ |\s+/g, ' ');

describe('[FUTUR-PANNEAU-FIXE] la colonne « Par compte » recompose la valeur nette', () => {
    it('la ligne de dette vaut exactement Σ comptes − valeur nette', () => {
        renderPanneauJour(point());
        expect(screen.getByText(/Dettes \(hors hypothèque\)/)).toBeInTheDocument();
        // 357 000 − 310 000 = 47 000. Le signe « − » est rendu avant le montant.
        expect(texte()).toContain('47 000');
    });

    /**
     * ⚠️ ANTI-VACUITÉ, et elle n'est pas symbolique : « 47 000 apparaît » serait vrai d'un écran
     * qui afficherait n'importe quel 47 000. On vérifie que la dette SUIT la valeur nette — c'est
     * la RELATION qui est gardée, jamais une valeur de fixture
     * (`ancrer sur la RELATION, jamais sur une valeur de fixture supposée`).
     */
    it('baisser la valeur nette de 10 000 monte la dette de 10 000', () => {
        const { unmount } = renderPanneauJour(point({ NetWorth: SOMME_ACTIFS - DETTE - 10_000 }));
        expect(texte()).toContain('57 000');
        unmount();
    });

    it('aucune dette : la ligne ne se rend pas du tout (pas un « 0 $ » décoratif)', () => {
        renderPanneauJour(point({ NetWorth: SOMME_ACTIFS }));
        expect(screen.queryByText(/Dettes \(hors hypothèque\)/)).toBeNull();
    });

    /**
     * ⚠️ [INFOBULLE-DETTE-NW-NON-FINI] LE CAS QUI COÛTAIT DE L'ARGENT. Avant le correctif,
     * `Number(point.NetWorth) || 0` rabattait un `NaN` sur ZÉRO et la soustraction rendait la somme
     * TOTALE des actifs — 357 000 $ affichés comme une DETTE, sans trace. Le repli le plus
     * plausible est le pire.
     */
    it('un COMPTE non fini refuse aussi — une somme amputée fausse la soustraction', () => {
        // ⚠️ La moitié la plus discrète du même défaut, et elle va dans l'AUTRE SENS : un compte
        // illisible absorbé par `|| 0` ne fait pas disparaître la dette, il la SURÉVALUE du montant
        // du compte perdu. Ici 210 000 $ de REER : sans ce refus, la ligne annoncerait 257 000 $.
        renderPanneauJour(point({ REER: Number.POSITIVE_INFINITY }));
        expect(screen.getByText(/Dette non calculable/)).toBeInTheDocument();
        expect(texte()).not.toContain('257 000');
    });

    it('un compte ABSENT reste légitime (pas de compte ≠ donnée perdue)', () => {
        // ⚠️ `REPLI-SILENCIEUX-LEGITIME-VS-CORRUPTION` : refuser sur une clé absente ferait crier le
        // panneau sur le cas NOMINAL de quiconque n'a pas de crypto.
        const { NonReg: _retire, ...sansNonReg } = COMPTES;
        renderPanneauJour({
            monthIndex: 3, dateLabel: '18 sept. 2026', age: 41,
            NetWorth: SOMME_ACTIFS - 45_000 - DETTE,
            ...sansNonReg,
        } as PointJour);
        expect(screen.getByText(/Dettes \(hors hypothèque\)/)).toBeInTheDocument();
        expect(texte()).toContain('47 000');
    });

    it('valeur nette NON FINIE : la dette est REFUSÉE, et le refus est dit', () => {
        renderPanneauJour(point({ NetWorth: Number.NaN }));
        expect(screen.getByText(/Dette non calculable/)).toBeInTheDocument();
        // Le montant fautif d'avant le correctif ne doit apparaître NULLE PART.
        expect(texte()).not.toContain('357 000');
        expect(screen.queryByText(/Dettes \(hors hypothèque\)/)).toBeNull();
    });

    /**
     * ⚠️ LA COLONNE ① DOIT DIRE LA MÊME CHOSE QUE LA ③, et c'est une perturbation MUETTE qui l'a
     * révélé : remettre le `|| 0` sur la valeur nette du panneau laissait ce fichier TOUT VERT.
     * Le panneau affichait alors « Valeur nette 0 $ » (colonne ①) pendant que la colonne ③ disait
     * « Dette non calculable — valeur nette illisible » : deux affirmations contradictoires sur la
     * même valeur, à vingt centimètres l'une de l'autre, et la seconde est vraie. `formatCAD` sait
     * déjà rendre « — » ; c'était le `|| 0` de l'appelant qui court-circuitait ce chemin honnête.
     */
    it('valeur nette NON FINIE : la colonne ① n’annonce PAS « 0 $ » — « — », pas un zéro crédible', () => {
        renderPanneauJour(point({ NetWorth: Number.NaN }));
        const t = texte();
        const i = t.indexOf('Valeur nette');
        expect(i, 'libellé « Valeur nette » introuvable — le test serait vacueux').toBeGreaterThanOrEqual(0);
        // Le premier montant rendu après le libellé doit être le tiret d'absence, pas un zéro.
        expect(t.slice(i, i + 80)).toContain('—');
        expect(t.slice(i, i + 80)).not.toMatch(/\b0 \$/);
    });
});
