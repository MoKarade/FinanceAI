/**
 * @vitest-environment jsdom
 *
 * [REFONTE-NAV-L2a] Bandeau KPI du Futur — ce qu'on verrouille (itération panel #601) :
 *  - la ligne « Variation 30 j » (une tuile avant la refonte S5) : $ signé + % (le % positif porte
 *    un « + » comme le $), et AUCUNE ligne quand le hook rend `null` (JAMAIS un 0 $ crédible) ;
 *  - l'ÉTIQUETTE DE PÉRIMÈTRE de la variation : « liquide + placements (courbe historique) »
 *    toujours visible (l'assiette du % diffère de la tuile Patrimoine — leçon
 *    DASH-NETWORTH-CANONICAL), et « sur N j de données » quand l'étendue réelle est plus
 *    courte que la fenêtre (le titre « 30 j » ne doit pas mentir sur la couverture) ;
 *  - la parité patrimoine avec l'ex-Accueil : équité immo AJOUTÉE à la valeur ET étiquetée
 *    « équité immo incluse » ENSEMBLE — porte `.some(équité ≠ 0)` (parité gate ex-Accueil :
 *    deux équités qui se COMPENSENT restent de l'immobilier, l'étiquette s'affiche) ;
 *  - les tuiles du Lot 1 (liquidités, épargne/mois) toujours rendues.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import { FutureKpiStrip } from '../../components/FutureKpiStrip';
import { useFinanceStore } from '../../store/useFinanceStore';
import { formatCAD, formatPercent } from '../../utils/format';
import type { NetWorthVariation } from '../../hooks/useNetWorthVariation';
import type { RealEstateGoal } from '../../types';

// Le hook est testé pour lui-même dans tests/hooks/useNetWorthVariation.test.ts — ici on pilote
// sa SORTIE pour verrouiller le rendu de la tuile dans chaque état. ⚠️ Le mock doit ré-exporter
// VARIATION_WINDOW_DAYS (consommé par le composant pour l'étiquette de couverture) — et tout
// retour de mock reste STABLE au niveau module (leçon L2a : un objet recréé à chaque appel
// nourrissant un useEffect = boucle de rendu infinie).
const mockVariation = vi.fn<() => NetWorthVariation | null>(() => null);
vi.mock('../../hooks/useNetWorthVariation', () => ({
    useNetWorthVariation: () => mockVariation(),
    VARIATION_WINDOW_DAYS: 30,
}));

/** Bien passé à équité EXPLICITE 100 000 $ (currentValue − mortgageBalance). */
const goal: RealEstateGoal = {
    id: 'g1', name: 'Maison', isActive: true, purchaseDate: '2020-01-01',
    price: 350_000, downPayment: 70_000, mortgageRate: 4, amortization: 25,
    totalClosingCosts: 0, monthlyPayment: 1_500, unrecoverableMonthly: 0,
    isPrimaryResidence: true, currentValue: 400_000, mortgageBalance: 300_000,
};

/** Second bien à équité NÉGATIVE −100 000 $ : avec `goal`, la SOMME est 0 mais chaque équité
 *  est ≠ 0 — c'est le cas qui discrimine la porte `.some` de l'ancienne porte `somme ≠ 0`. */
const underwaterGoal: RealEstateGoal = {
    ...goal, id: 'g2', name: 'Chalet', currentValue: 300_000, mortgageBalance: 400_000,
};

// [KPI-AVOIRS-DETTES] Les deux termes sont REQUIS : le compilateur a énuméré les deux sites
// (`TabRouter` et ce fichier) plutôt que de laisser un défaut optionnel les rendre muets
// (`UN-DEFAUT-QUI-SE-PERIME-SE-CORRIGE-EN-RENDANT-LE-CHAMP-REQUIS`, appliqué à une prop).
// ⚠️ Les valeurs ne sont pas quelconques : `62 000 − 12 000 = 50 000` = le `netWorth` passé, donc
// l'identité que les tuiles affichent est VRAIE dans la fixture. Des nombres incohérents ici
// feraient passer une garde d'identité qui ne peut plus rien mesurer.
const renderStrip = () =>
    render(<FutureKpiStrip
        netWorth={50_000}
        liquidity={12_000}
        monthlySavings={800}
        avoirsHorsImmo={62_000}
        dettesHorsImmo={12_000}
    />);

/** La tuile entière (conteneur) à partir de son libellé.
 *  ⚠️ Les montants s'assertent via `textContent.toContain(formatCAD(...))`, PAS `getByText` :
 *  le normaliseur de testing-library remplace les espaces insécables de `fr-CA` par des
 *  espaces simples côté DOM mais pas côté matcher → faux négatif systématique. */
const tile = (label: string): HTMLElement => {
    const el = screen.getByText(label).closest('div');
    if (!el) throw new Error(`Tuile « ${label} » introuvable`);
    return el as HTMLElement;
};

const SCOPE_FULL = 'liquide + placements (courbe historique)';

beforeEach(() => {
    mockVariation.mockReturnValue(null);
    useFinanceStore.setState({ isPrivacyMode: false, realEstateGoals: [] });
});

/** [S5-REFONTE-FUTUR] La variation 30 j n'est plus une tuile (maquette F-bureau) : une LIGNE sous le
 *  patrimoine net, `data-variation-30j`, rendue seulement quand la variation est mesurée. */
const ligneVariation = (c: HTMLElement): HTMLElement | null => c.querySelector('[data-variation-30j]');

describe('FutureKpiStrip — ligne « Variation 30 j »', () => {
    it('couverture insuffisante (hook → null) : AUCUNE ligne — ni « — », ni 0 $ crédible', () => {
        const { container } = renderStrip();
        expect(ligneVariation(container)).toBeNull();
        expect(screen.queryByText(/Variation 30 j/)).not.toBeInTheDocument();
    });

    it('variation positive : montant « + », % « + » (cohérence de signe, LOW #601), périmètre étiqueté', () => {
        mockVariation.mockReturnValue({ diff: 1_234, pct: 4.5454, spanDays: 30 });
        const { container } = renderStrip();
        const l = ligneVariation(container)!;
        expect(l).not.toBeNull();
        expect(l.textContent).toContain(`+${formatCAD(1_234)}`);
        expect(l.textContent).toContain(`+${formatPercent(4.5454)}`);
        expect(l.textContent).toContain(SCOPE_FULL);
    });

    it('variation négative : montant négatif tel que formaté, % négatif SANS « + »', () => {
        mockVariation.mockReturnValue({ diff: -500, pct: -2.1, spanDays: 30 });
        const { container } = renderStrip();
        const l = ligneVariation(container)!;
        expect(l.textContent).toContain(formatCAD(-500));
        expect(l.textContent).not.toContain(`+${formatCAD(-500)}`);
        expect(l.textContent).toContain(formatPercent(-2.1));
        expect(l.textContent).not.toContain(`+${formatPercent(-2.1)}`);
    });

    it('pct null (départ ≤ 0) : le $ s\'affiche, aucun % (pas de 0 % trompeur)', () => {
        mockVariation.mockReturnValue({ diff: 100, pct: null, spanDays: 30 });
        const { container } = renderStrip();
        const l = ligneVariation(container)!;
        expect(l.textContent).toContain(`+${formatCAD(100)}`);
        expect(l.textContent).not.toMatch(/%/);
    });

    it('[MED #601] étendue réelle < fenêtre : le périmètre dit « sur N j de données », pas 30 j implicites', () => {
        mockVariation.mockReturnValue({ diff: 1_234, pct: 4.5, spanDays: 12 });
        const { container } = renderStrip();
        const l = ligneVariation(container)!;
        expect(l.textContent).toContain('liquide + placements · sur 12 j de données');
        expect(l.textContent).not.toContain(SCOPE_FULL);
    });
});

describe('FutureKpiStrip — patrimoine net et équité immo', () => {
    it('sans immobilier : valeur = prop netWorth, PAS d\'étiquette « équité immo incluse »', () => {
        renderStrip();
        const t = tile('Patrimoine net');
        expect(t.textContent).toContain(formatCAD(50_000));
        expect(screen.queryByText(/équité immo incluse/i)).not.toBeInTheDocument();
    });

    it('avec immobilier : équité AJOUTÉE à la valeur ET étiquetée (jamais l\'une sans l\'autre)', () => {
        useFinanceStore.setState({ realEstateGoals: [goal] });
        renderStrip();
        const t = tile('Patrimoine net');
        expect(t.textContent).toContain(formatCAD(150_000));
        expect(within(t).getByText('équité immo incluse')).toBeInTheDocument();
    });

    it('[LOW #601] deux équités qui se COMPENSENT (somme 0) : l\'étiquette s\'affiche quand même (porte .some, parité ex-Accueil)', () => {
        useFinanceStore.setState({ realEstateGoals: [goal, underwaterGoal] });
        renderStrip();
        const t = tile('Patrimoine net');
        // Somme des équités = +100 000 − 100 000 = 0 : la valeur reste netWorth…
        expect(t.textContent).toContain(formatCAD(50_000));
        // …mais il Y A de l'immobilier à l'écran : l'étiquette de convention doit le dire.
        expect(within(t).getByText('équité immo incluse')).toBeInTheDocument();
    });
});

describe('FutureKpiStrip — tuiles du Lot 1 conservées', () => {
    it('liquidités et épargne/mois toujours rendues (épargne signée)', () => {
        renderStrip();
        expect(tile('Liquidités').textContent).toContain(formatCAD(12_000));
        expect(tile('Épargne / mois').textContent).toContain(`+${formatCAD(800)}`);
    });
});

/* ───────────────────────── [KPI-AVOIRS-DETTES] les deux TERMES du patrimoine ───────────────────────── */
//
// Marc, 2026-09-21 : « je veux voir genre ma somme total d'argent et ma somme total de dette /
// ce que je dois (partout dans financeai et dans hubperso) ». Né d'un écart qu'il a constaté
// lui-même : Fintable additionne des SOLDES DE COMPTES (un total plus élevé chez lui), l'app publie une
// VALEUR NETTE — et les deux TERMES de la soustraction n'étaient visibles nulle part.
//
// ⚠️⚠️ CE QUE CES GARDES TIENNENT : `avoirs − dettes = patrimoine net`, À L'ŒIL, sur la même
// rangée. Marc a signalé QUATRE fois en deux jours des chiffres d'un même écran qui ne se
// recomposent pas ; trois tuiles qui divergent rouvriraient exactement cette porte.
describe('[KPI-AVOIRS-DETTES] avoirs et dettes, à côté du net qu’ils composent', () => {
    /** Les trois montants affichés, lus dans le DOM et re-convertis en nombres. */
    const montants = () => {
        const nb = (label: string): number => {
            const txt = tile(label).textContent ?? '';
            const m = txt.match(/-?[\d   ]+(?:,\d+)?\s*\$/);
            if (!m) throw new Error(`Aucun montant dans la tuile « ${label} » : ${txt}`);
            return Number(m[0].replace(/[^\d,-]/g, '').replace(',', '.'));
        };
        return { avoirs: nb('Total avoirs'), dettes: nb('Dettes'), net: nb('Patrimoine net') };
    };

    it('sans immobilier : les trois tuiles se recomposent', () => {
        renderStrip();
        const { avoirs, dettes, net } = montants();
        expect(avoirs - dettes).toBe(net);
        // Anti-vacuité : une dette NULLE rendrait l'identité vraie par accident.
        expect(dettes).toBeGreaterThan(0);
        expect(avoirs).toBeGreaterThan(net);
    });

    it('AVEC immobilier : l’hypothèque compte dans les dettes ET la valeur BRUTE dans les avoirs', () => {
        // ⚠️ LE cas qui discrimine, et le piège que Marc a créé en tranchant « dettes tout compris
        // avec le détail » : si les dettes incluent l'hypothèque mais que les avoirs portent
        // l'ÉQUITÉ (valeur − hypothèque), l'hypothèque est retranchée DEUX FOIS et les trois
        // chiffres cessent de se recomposer. Bien : 400 000 $ de valeur, 300 000 $ d'hypothèque.
        useFinanceStore.setState({ realEstateGoals: [goal] });
        renderStrip();
        const { avoirs, dettes, net } = montants();
        expect(avoirs - dettes).toBe(net);
        // Les deux termes ont bien AUGMENTÉ du bien, chacun de son côté.
        expect(avoirs).toBe(62_000 + 400_000);
        expect(dettes).toBe(12_000 + 300_000);
        // …et le net, lui, n'a bougé que de l'ÉQUITÉ (100 000 $).
        expect(net).toBe(50_000 + 100_000);
    });

    it('le DÉTAIL de l’hypothèque n’apparaît que s’il y en a une', () => {
        // Marc a demandé « un total, et le détail ». Un « dont 0 $ d'hypothèque » permanent serait
        // du décor (`UN-AVERTISSEMENT-PERMANENT-EST-UN-AVERTISSEMENT-MORT`).
        renderStrip();
        expect(tile('Dettes').textContent).not.toMatch(/hypoth/i);

        cleanup();
        useFinanceStore.setState({ realEstateGoals: [goal] });
        renderStrip();
        const t = tile('Dettes');
        expect(t.textContent).toMatch(/hypoth/i);
        expect(t.textContent).toContain(formatCAD(300_000));
    });

    it('le détail de l’hypothèque est MASQUÉ en mode discret — mais la PHRASE reste', () => {
        // ⚠️ Un sous-titre qui porte un montant est une donnée financière : le laisser nu à côté
        // d'une valeur masquée est exactement le finding a11y/privacy #644.
        //
        // ⚠️⚠️ Ce test porte les DEUX moitiés, et la seconde est née d'un rouge de CI :
        // `amountPrivacyScan` exige qu'une ligne d'ATTRIBUT (`sublabel=`) porte sa marque À ELLE —
        // le drapeau `privateSublabel`, posé une ligne plus bas, ne lui servait pas de preuve.
        // Le correctif n'est pas de faire taire la garde mais de DÉCOUPER : seule la valeur est
        // enveloppée, « dont … d'hypothèque » survit. Sans la seconde assertion, un lot futur
        // pourrait remasquer le sous-titre ENTIER et rester vert, alors que Marc perdrait
        // l'information qui explique la composition de son total.
        useFinanceStore.setState({ realEstateGoals: [goal], isPrivacyMode: true });
        renderStrip();
        const t = tile('Dettes');
        expect(t.textContent).not.toContain(formatCAD(300_000));
        expect(t.textContent).toMatch(/dont/i);
        expect(t.textContent).toMatch(/hypoth/i);
        // Anti-vacuité : hors mode discret, le montant EST là (cas ci-dessus) — et le LIBELLÉ reste.
        expect(t.textContent).toMatch(/Dettes/);
    });

    it('un bien à équité NÉGATIVE ne casse pas l’identité', () => {
        // 300 000 $ de valeur pour 400 000 $ d'hypothèque : les avoirs montent de 300 000, les
        // dettes de 400 000, et le net BAISSE de 100 000. Une implémentation qui clamperait l'un
        // des deux termes à zéro « pour éviter un négatif » romprait la recomposition.
        useFinanceStore.setState({ realEstateGoals: [underwaterGoal] });
        renderStrip();
        const { avoirs, dettes, net } = montants();
        expect(avoirs - dettes).toBe(net);
        expect(net).toBe(50_000 - 100_000);
    });
});
