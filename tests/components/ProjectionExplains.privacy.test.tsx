/**
 * @vitest-environment jsdom
 */
// [A11Y-PRIVACY-PROJECTION-EXPLAINS] Mode discret sur l'explorateur de projection.
//
// ⚠️ C'ÉTAIT LE PLUS GROS TROU RESTANT. Ce composant affiche la projection année par année ET mois
// par mois : valeur nette de fin d'année, valeur nette de chaque mois, et pour chaque compte le
// détail des cotisations, de la croissance de marché, des retraits, des versements et des
// transferts. Zéro `isPrivacyMode` sur 293 lignes : en mode discret, l'écran le plus détaillé de
// l'app restait entièrement lisible.
//
// ⚠️ DEUX CANAUX, DEUX REMÈDES DIFFÉRENTS.
//  1. Les montants CALCULÉS étaient interpolés dans des phrases (`« +1 200 $ cotisé »`, un
//     `string[]`). Un montant noyé dans une chaîne n'est plus un nœud : on ne peut pas l'envelopper
//     après coup. La structure porte maintenant `{ montant, libelle }` et le rendu compose les deux.
//  2. Les JOURNAUX DU MOTEUR (`flowEvents`/`lifeEvents`) sont des phrases construites en amont, qui
//     PORTENT le montant dans leur texte. Les effacer par regex est proscrit : ces libellés
//     interpolent du texte UTILISATEUR (noms de dettes, d'immeubles, d'enfants), et une heuristique
//     de texte sur du contenu saisi fabrique des faux positifs (`TEXT-HEURISTIC-OVER-USER-TEXT`).
//     On garde donc le FAIT (« 2 événements ce mois-ci ») et on tait le DÉTAIL.
//
// ⚠️ Chaque cas de masquage a son CONTRÔLE en mode normal : sans lui, un composant qui ne rendrait
// plus rien du tout passerait toutes les assertions d'absence.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { ProjectionExplains } from '../../components/projection/ProjectionExplains';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { ProjectionChartPoint } from '../../services/projection/types';

const months: ProjectionChartPoint[] = [
    {
        monthIndex: 0, NetWorth: 100000, year: 2026, age: 35, dateLabel: 'Jan 2026',
        CELI: 50000, ContribCELI: 500, MarketGrowthCELI: 80,
        flowEvents: ['💰 ↳ Surplus placé dans le CELI : +500 $'],
    },
    {
        monthIndex: 2, NetWorth: 90000, year: 2026, age: 35, dateLabel: 'Mar 2026',
        Liquidites: 5000,
        // DEUX événements le même mois : c'est ce qui rend le COMPTE observable (avec un seul, un
        // « 1 » pourrait venir d'un `length` codé en dur autant que du vrai compte).
        lifeEvents: [
            "🏠 Achat de la propriété : -103 135 $ (argent sorti de tes comptes)",
            '🎁 Héritage Inattendu: +250 000$',
        ],
    },
] as ProjectionChartPoint[];

const setPrivacy = (on: boolean) => act(() => { useFinanceStore.setState({ isPrivacyMode: on }); });

/** Ouvre l'année 2026 : les mois sont repliés par défaut. */
const ouvrir2026 = () => fireEvent.click(screen.getByText('2026'));

/**
 * Texte du document, ESPACES RETIRÉES.
 *
 * ⚠️ Sans cette normalisation, les assertions d'absence de ce fichier étaient VACUEUSES et je l'ai
 * mesuré : `formatCAD(90000)` rend `"90\u00A0000\u00A0$"` — des espaces INSÉCABLES (code 160), pas
 * des espaces ordinaires. Un `not.toContain('90 000')` écrit avec une espace normale ne pouvait donc
 * jamais matcher, et la perturbation qui retirait le `<PrivateAmount>` de la valeur nette du mois
 * laissait les quatre tests VERTS. Une perturbation muette dit d'abord que l'assertion ne l'atteint
 * pas. Même patron que `FutureDetailModal.transactions.test.tsx`.
 */
const texteSansEspaces = () => (document.body.textContent ?? '').replace(/[\s\u00A0\u202F]/g, '');

afterEach(() => {
    cleanup();
    act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
});

describe('[A11Y-PRIVACY-PROJECTION-EXPLAINS] mode discret sur l’explorateur', () => {
    it('CONTRÔLE — hors mode discret, montants et journaux sont bien LISIBLES', () => {
        // Sans ce cas, toutes les assertions d'absence ci-dessous seraient satisfaites par un écran
        // vide (`UN-INVARIANT-QUI-NE-TROUVE-RIEN-DOIT-PROUVER-QU-IL-POURRAIT`).
        setPrivacy(false);
        render(<ProjectionExplains chartData={months} />);
        ouvrir2026();
        expect(screen.getByText(/Achat de la propriété/)).toBeTruthy();
        expect(screen.getByText(/Héritage Inattendu/)).toBeTruthy();
        expect(texteSansEspaces()).toContain('100000');
        expect(texteSansEspaces(), 'le détail par compte doit être chiffré').toContain('+500');
    });

    it('mode discret : AUCUN montant ne subsiste dans le document', () => {
        setPrivacy(true);
        render(<ProjectionExplains chartData={months} />);
        ouvrir2026();
        const texte = texteSansEspaces();
        // Valeur nette de fin d'année, valeur nette de CHAQUE mois, et le détail par compte.
        for (const chiffre of ['100000', '90000', '+500', '+80']) {
            expect(texte, `« ${chiffre} » fuit encore`).not.toContain(chiffre);
        }
        // Et le masquage est bien ACTIF, pas juste un écran vide.
        expect(texte, 'le marqueur de masquage doit être présent').toContain('•••');
    });

    it('mode discret : les journaux du moteur sont TUS, mais leur nombre reste annoncé', () => {
        setPrivacy(true);
        render(<ProjectionExplains chartData={months} />);
        ouvrir2026();
        // Le TEXTE de l'événement disparaît — il porte le montant à l'intérieur.
        expect(screen.queryByText(/Achat de la propriété/), 'un journal fuit encore').toBeNull();
        expect(screen.queryByText(/Héritage Inattendu/), 'un journal fuit encore').toBeNull();
        expect(texteSansEspaces(), 'le montant du journal fuit encore').not.toContain('103135');
        expect(texteSansEspaces(), 'le montant du journal fuit encore').not.toContain('250000');
        // Le FAIT survit : un mois à 1 événement, un mois à 2.
        const texte = document.body.textContent ?? '';
        expect(texte).toContain('1 événement ce mois-ci');
        expect(texte).toContain('2 événements ce mois-ci');
    });

    it('le COMPTE annoncé est celui du mois, pas une constante', () => {
        // Un « 1 événement » et un « 2 événements » sur la MÊME fixture : c'est ce qui distingue un
        // vrai compte d'un littéral. Le singulier et le pluriel sont vérifiés du même coup.
        setPrivacy(true);
        render(<ProjectionExplains chartData={months} />);
        ouvrir2026();
        const texte = document.body.textContent ?? '';
        expect((texte.match(/événements? ce mois-ci/g) ?? []).length, 'les deux mois doivent annoncer leur compte').toBe(2);
    });
});
