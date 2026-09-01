/**
 * @vitest-environment jsdom
 */
// [A11Y-PRIVACY-DIVERS] Huit montants qui restaient en clair en mode discret, dans sept écrans.
//
// ⚠️ POURQUOI UNE GARDE NOMINATIVE plutôt qu'un scan générique. Ces huit sites n'ont rien en commun
// sinon d'afficher un montant : un budget de voyage, une économie d'impôt estimée, deux bandeaux
// d'avertissement du graphe Futur, deux résultats de recherche d'objectif, et trois champs de
// SAISIE. Un scan générique « tout `formatCAD` est enveloppé » remonterait aussi les dizaines de
// sites déjà couverts par d'autres primitives, et le vrai périmètre du dépôt est le ticket
// `[A11Y-PRIVACY-SCAN-GLOBAL]` — qui annonce 38 sites dans 19 fichiers et demande sa propre
// mesure. Ici on verrouille CE lot, site par site, avec le message d'échec qui nomme l'écran.
//
// ⚠️ Le périmètre a été RE-RECENSÉ : les numéros de ligne du ticket étaient périmés, et il visait
// pour `HealthIndicator` des lignes qui sont des POURCENTAGES. Les vrais montants de cet écran sont
// construits dans `utils/healthScore.ts`, un util PUR — même classe que les journaux du moteur du
// lot 56 (montant interpolé dans une phrase produite en amont). Découpé en ticket séparé : le geste
// n'est pas mécanique et touche le calcul de santé.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { UsersCard } from '../../components/settings/sections/UsersCard';
import { useFinanceStore } from '../../store/useFinanceStore';
import { stripCommentsJsx } from '../../utils/stripComments';
import type { AppState } from '../../types';

const lire = (rel: string) => stripCommentsJsx(readFileSync(resolve(process.cwd(), rel), 'utf8'));

/** Les huit sites, avec le motif qui prouve qu'ils passent par une primitive de masquage. */
const SITES: ReadonlyArray<{ fichier: string; ecran: string; motif: RegExp }> = [
    { fichier: 'components/Travel.tsx', ecran: 'budget d’un voyage',
      motif: /<PrivateAmount[^>]*>\{formatCAD\(trip\.totalCost\)\}<\/PrivateAmount>/ },
    { fichier: 'components/tax/CoupleOptimizationCard.tsx', ecran: 'économie d’impôt estimée',
      motif: /<PrivateAmount>\{formatCAD\(s\.estimated_savings_cad\)\}<\/PrivateAmount>/ },
    { fichier: 'components/FutureProjection.tsx', ecran: 'bandeau « transactions datées au mois »',
      motif: /<PrivateAmount>\{formatCAD\(Math\.abs\(dailyPast\.undatedTotal\)\)\}<\/PrivateAmount>/ },
    { fichier: 'components/FutureProjection.tsx', ecran: 'bandeau « transactions après aujourd’hui »',
      motif: /<PrivateAmount>\{formatCAD\(Math\.abs\(dailyPast\.flowsAfterNowDate\)\)\}<\/PrivateAmount>/ },
    // ⚠️ [FORMAT-EXPLAINS-TOLOCALESTRING] Ces deux motifs ancraient l'EXPRESSION qu'avait le code
    // (`{Math.round(r.estateNetWorth)`, `{goalSeekResult.savings`) : ils ont rougi au lot 61, qui
    // remplace un formatage composé à la main par `formatCAD` — alors que RIEN de ce qu'ils
    // défendent n'avait bougé. Ils ancrent désormais le FAIT : la valeur passe par la primitive de
    // masquage (`UNE-GARDE-ANCRE-LE-FAIT-JAMAIS-LA-FORME-QU-AVAIT-LE-CODE`, 3ᵉ fois).
    { fichier: 'components/retirement/GoalSeekerCard.tsx', ecran: 'patrimoine successoral comparé',
      motif: /<PrivateAmount[^>]*>\{[^}]*r\.estateNetWorth[^}]*\}<\/PrivateAmount>/ },
    { fichier: 'components/retirement/GoalSeekerCard.tsx', ecran: 'épargne mensuelle nécessaire',
      motif: /<PrivateAmount>\{[^}]*goalSeekResult\.savings[^}]*\}<\/PrivateAmount>/ },
    { fichier: 'components/retirement/RetirementSettingsCard.tsx', ecran: 'revenu mensuel cible (saisie)',
      motif: /<PrivateNumberInput id="rsc-income"/ },
    { fichier: 'components/investments/AddStockForm.tsx', ecran: 'prix d’achat par action (saisie)',
      motif: /<PrivateNumberInput\s+id="stock-buyPrice"/ },
    { fichier: 'components/settings/sections/UsersCard.tsx', ecran: 'salaire net du conjoint (saisie)',
      motif: /<PrivateNumberInput\s+id="partner-netSalary"/ },
];

afterEach(() => {
    cleanup();
    act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
});

describe('[A11Y-PRIVACY-DIVERS] les huit montants passent par une primitive de masquage', () => {
    it('anti-vacuité : chaque fichier visé existe et porte du code', () => {
        for (const { fichier } of SITES) {
            expect(lire(fichier).length, `${fichier} : vide ou introuvable`).toBeGreaterThan(500);
        }
    });

    it.each(SITES)('$ecran — $fichier', ({ fichier, ecran, motif }) => {
        expect(lire(fichier), `« ${ecran} » ne passe plus par une primitive de masquage`).toMatch(motif);
    });
});

describe('[A11Y-PRIVACY-DIVERS] le nom accessible SURVIT au masquage', () => {
    // ⚠️ Le seul des trois champs de saisie où le `<label>` ENVELOPPAIT son `<input>` sans `htmlFor`.
    // En mode discret la primitive rend un `<button>` — et je n'ai pas voulu SUPPOSER que
    // l'enveloppement le nomme. La leçon `A11Y-MASK-STEALS-NAME` est exactement là : un masquage qui
    // vole le nom rend tous les champs d'un formulaire indistinguables au lecteur d'écran.
    //
    // ⚠️ MESURÉ, et le résultat corrige ma prudence : retirer le `htmlFor` que ce lot a ajouté laisse
    // ces deux cas VERTS. L'enveloppement suffit donc bien à nommer le `<button>` (`button` est un
    // élément labelable au sens HTML). L'association explicite est CONSERVÉE quand même, et sa raison
    // s'écrit : elle ne dépend pas de l'imbrication, donc elle survit au jour où quelqu'un sortira le
    // champ de son `<label>` — ce qui est précisément le genre de refactor qui casse un nom
    // accessible sans que rien ne rougisse. Ce que ces tests prouvent, c'est le FAIT (le champ garde
    // son nom sous masquage), pas le mécanisme qui l'assure.
    const config = { users: [{ name: 'Marc', age: 40, netSalary: 4000 }] } as unknown as AppState['config'];

    /** Le formulaire du conjoint est derrière un bouton : sans le déplier, le champ n'existe pas. */
    const monterEtDeplier = () => {
        const rendu = render(<UsersCard config={config} setConfig={vi.fn()} />);
        fireEvent.click(screen.getByText(/Ajouter conjoint/));
        return rendu;
    };

    it('CONTRÔLE — hors mode discret, le champ est un vrai <input> et il est nommé', () => {
        const { container } = monterEtDeplier();
        const champ = container.querySelector('#partner-netSalary');
        expect(champ, 'le champ doit exister une fois le formulaire déplié').toBeTruthy();
        expect(champ!.tagName.toLowerCase()).toBe('input');
        expect(screen.getByLabelText(/Salaire net \/mois/)).toBeTruthy();
    });

    it('mode discret : le champ est masqué ET garde SON nom, pas « Montant masqué »', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        const { container } = monterEtDeplier();
        const champ = container.querySelector('#partner-netSalary');
        expect(champ, 'le champ doit exister une fois le formulaire déplié').toBeTruthy();
        expect(champ!.tagName.toLowerCase(), 'la primitive doit rendre un bouton en mode discret').toBe('button');
        // Le nom vient du `<label htmlFor>` posé par ce lot — pas d'un `aria-label` de la primitive,
        // qui rendrait tous les champs masqués homonymes.
        expect(screen.getByLabelText(/Salaire net \/mois/), 'le masquage a volé le nom du champ').toBeTruthy();
    });
});
