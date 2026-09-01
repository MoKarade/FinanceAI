// D6-SR-2 — intégration : en mode privé, les sliders monétaires de PropertyConfigurator exposent
// aria-valuetext="Montant masqué" au lecteur d'écran (parité avec le blur visuel).
//
// ⚠️ [A11Y-PRIVACY-PROPERTY-CONFIG] (lot 55) — CE FICHIER PORTAIT LE CONSTAT DU DÉFAUT. Il disait, en
// commentaire et dans son assertion : « prix d'achat + mise de fonds = 2 sliders monétaires masqués
// (le plafond maxValue ne l'est PAS) ». C'était exact, et c'était le défaut : « Plafond Valeur Max »
// affiche `fmt(maxValue)`, un montant, sans `maskedSliderAria` — alors que les deux sliders d'à côté
// l'avaient depuis #608. `PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI` : le risque était connu, traité deux
// fois, et le troisième site du même fichier oublié. Le compte passe donc de 2 à **3**, et c'est une
// CORRECTION d'état de fait, pas un re-basage de confort.
//
// ⚠️ Et le même lot masque les cinq champs de SAISIE dont le libellé porte un `$` (revenu locatif,
// rénovations, taxes, chauffage, condo) : un mode discret qui cache le prix d'achat et laisse le
// loyer et les taxes foncières en clair ne protège rien — on lit le budget de l'immeuble ligne à
// ligne. Ces cinq-là se vérifient par SCAN DE SOURCE (deuxième bloc), parce que le critère est un
// critère de LIBELLÉ et qu'une regex à l'exécution sur du texte utilisateur est une source de faux
// positifs (`TEXT-HEURISTIC-OVER-USER-TEXT`).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PropertyConfigurator } from '../../components/realestate/PropertyConfigurator';
import { useFinanceStore } from '../../store/useFinanceStore';
import { stripCommentsJsx } from '../../utils/stripComments';
import type { RealEstateGoal } from '../../types';

const goal = { price: 450000, downPayment: 90000, maxValue: 0 } as unknown as RealEstateGoal;

const renderConfigurator = () =>
    render(
        <PropertyConfigurator
            activeGoal={goal} updateActiveGoal={vi.fn()}
            mode="AUTO" setMode={vi.fn()}
            taxesYearly={3000} setTaxesYearly={vi.fn()}
            heatingMonthly={100} setHeatingMonthly={vi.fn()}
            condoFees={0} setCondoFees={vi.fn()}
        />,
    );

describe('PropertyConfigurator — sliders masqués au SR en mode privé (D6-SR-2)', () => {
    afterEach(() => {
        cleanup();
        act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
    });

    it('mode privé : les sliders monétaires portent aria-valuetext="Montant masqué"', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        renderConfigurator();
        const masked = screen.getAllByRole('slider').filter(
            (el) => el.getAttribute('aria-valuetext') === 'Montant masqué',
        );
        // prix d'achat + mise de fonds + PLAFOND VALEUR MAX = 3. Le troisième a été ajouté par
        // `[A11Y-PRIVACY-PROPERTY-CONFIG]` ; ce commentaire disait « le plafond ne l'est pas », ce
        // qui était le constat exact du défaut.
        expect(masked.length).toBe(3);
        // Parité complète : les ÉTIQUETTES de valeur (PrivateAmount : prix + mise de fonds) annoncent
        // aussi « Montant masqué » au SR (sr-only) — sinon la fuite serait juste déplacée du slider au label.
        expect(screen.getAllByText('Montant masqué').length).toBeGreaterThanOrEqual(2);
    });

    it('mode normal : aucun slider n\'est masqué (le SR annonce la vraie valeur)', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
        renderConfigurator();
        const masked = screen.getAllByRole('slider').filter(
            (el) => el.getAttribute('aria-valuetext') === 'Montant masqué',
        );
        expect(masked.length).toBe(0);
    });

    it('mode privé : le MONTANT du plafond est masqué à l’œil, « Aucun plafond » reste lisible', () => {
        // Un slider dont l'aria est muselé mais dont l'étiquette affiche encore le montant ne
        // déplace la fuite que d'un cran. On vérifie donc les DEUX côtés, sur une fixture où le
        // plafond est RENSEIGNÉ — avec `maxValue: 0` le libellé dit « Aucun plafond » et l'assertion
        // serait vacueuse (`UNE-GARDE-NE-COUVRE-QUE-CE-QUE-SA-FIXTURE-REND-NON-NUL`).
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        render(
            <PropertyConfigurator
                activeGoal={{ ...goal, maxValue: 900000 } as unknown as RealEstateGoal} updateActiveGoal={vi.fn()}
                mode="AUTO" setMode={vi.fn()}
                taxesYearly={3000} setTaxesYearly={vi.fn()}
                heatingMonthly={100} setHeatingMonthly={vi.fn()}
                condoFees={0} setCondoFees={vi.fn()}
            />,
        );
        expect(screen.queryByText(/900\s?000/), 'le plafond chiffré fuit encore').toBeNull();
        expect(screen.queryByText('Aucun plafond'), 'un plafond renseigné ne doit pas dire « Aucun »').toBeNull();
    });

    it('chaque slider monétaire porte un NOM accessible (aria-label) — les <label> ne sont pas associés', () => {
        renderConfigurator();
        // Trouvable par son nom accessible = le SR sait quel contrôle c'est (et pas juste « curseur »).
        expect(screen.getByRole('slider', { name: 'Prix d\'achat' })).toBeInTheDocument();
        expect(screen.getByRole('slider', { name: 'Mise de fonds' })).toBeInTheDocument();
        expect(screen.getByRole('slider', { name: 'Plafond Valeur Max' })).toBeInTheDocument();
    });
});

// ── Garde de SOURCE : le critère « le libellé porte un $ », appliqué au formulaire entier ────────
// Un test de RENDU ne voit que ce que la fixture instancie ; un scan de source voit TOUS les champs
// du fichier, y compris ceux qu'un panneau conditionnel n'affiche pas dans cette fixture.
const propre = stripCommentsJsx(
    readFileSync(resolve(process.cwd(), 'components/realestate/PropertyConfigurator.tsx'), 'utf8'),
);

/** Index du `>` fermant la balise ouvrante commencée à `debut` (profondeur des accolades JSX). */
function finBalise(s: string, debut: number): number {
    let i = debut + 1, accolades = 0, guillemet: string | null = null;
    while (i < s.length) {
        const c = s[i];
        if (guillemet !== null) { if (c === guillemet) guillemet = null; }
        else if (c === '"' || c === "'" || c === '`') guillemet = c;
        else if (c === '{') accolades++;
        else if (c === '}') accolades--;
        else if (c === '>' && accolades === 0) return i;
        i++;
    }
    return -1;
}

interface Champ { id: string; libelle: string; balise: string }

/** Chaque paire `<label htmlFor="prop-…">` ↔ le contrôle qui porte cet `id`. */
function champs(): Champ[] {
    const out: Champ[] = [];
    for (const m of propre.matchAll(/<label htmlFor="(prop-[A-Za-z]+)"[^>]*>([\s\S]*?)<\/label>/g)) {
        const id = m[1];
        const libelle = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const iCtrl = propre.indexOf(`id="${id}"`);
        expect(iCtrl, `aucun contrôle ne porte l'id ${id}`).toBeGreaterThan(-1);
        const debut = propre.lastIndexOf('<', iCtrl);
        const balise = propre.slice(debut, finBalise(propre, debut) + 1);
        out.push({ id, libelle, balise });
    }
    return out;
}

const estMontant = (libelle: string) => libelle.includes('$');
const estMasque = (balise: string) => balise.startsWith('<PrivateNumberInput');

describe('[A11Y-PRIVACY-PROPERTY-CONFIG] mode discret sur le projet immobilier', () => {
    it('anti-vacuité : le scan voit bien les champs du formulaire, montants ET non-montants', () => {
        const tous = champs();
        expect(tous.length, 'aucun champ apparié — le scan ne mesure rien').toBeGreaterThanOrEqual(9);
        // Les DEUX familles doivent être représentées, sinon chaque règle ci-dessous est vacueuse
        // par absence de sujet (`UNE-GARDE-NE-COUVRE-QUE-CE-QUE-SA-FIXTURE-REND-NON-NUL`).
        expect(tous.filter((c) => estMontant(c.libelle)).length, 'aucun montant vu').toBeGreaterThanOrEqual(5);
        expect(tous.filter((c) => !estMontant(c.libelle)).length, 'aucun non-montant vu').toBeGreaterThanOrEqual(3);
    });

    it('TOUT champ dont le libellé porte un « $ » est masquable', () => {
        const fautifs = champs().filter((c) => estMontant(c.libelle) && !estMasque(c.balise))
            .map((c) => `${c.id} — « ${c.libelle} »`);
        expect(fautifs, 'un montant reste en clair quel que soit le mode discret').toEqual([]);
    });

    it('AUCUN champ sans « $ » n’est masqué — le masquage est CIBLÉ', () => {
        // Symétrique, et il compte autant : masquer un taux rendrait le formulaire illisible sans
        // rien protéger de plus. C'est ce qui distingue un mode discret d'un « on cache tout ».
        const fautifs = champs().filter((c) => !estMontant(c.libelle) && estMasque(c.balise))
            .map((c) => `${c.id} — « ${c.libelle} »`);
        expect(fautifs, 'ce champ n’est pas un montant : le masquer coûte de la lisibilité pour rien').toEqual([]);
    });

    it('les TROIS sliders monétaires taisent leur valeur au lecteur d’écran', () => {
        // Le flou du mode discret est purement CSS : sans `maskedSliderAria`, un lecteur d'écran
        // annonce toujours l'`aria-valuenow` réel. Prix et mise de fonds l'avaient depuis #608 ;
        // « Plafond Valeur Max » ne l'avait pas, et personne ne l'avait vu.
        for (const nom of ["Prix d'achat", 'Mise de fonds', 'Plafond Valeur Max']) {
            const i = propre.indexOf(`aria-label="${nom}"`);
            expect(i, `slider « ${nom} » introuvable`).toBeGreaterThan(-1);
            const balise = propre.slice(propre.lastIndexOf('<', i), finBalise(propre, propre.lastIndexOf('<', i)) + 1);
            expect(balise, `« ${nom} » annonce sa valeur réelle au lecteur d’écran`)
                .toContain('maskedSliderAria(isPrivacyMode)');
        }
    });

    it('le montant AFFICHÉ du plafond passe par PrivateAmount, pas le libellé « Aucun plafond »', () => {
        expect(propre, 'le plafond chiffré doit être masquable').toMatch(/<PrivateAmount>\{fmt\(maxValue\)\}<\/PrivateAmount>/);
        expect(propre, '« Aucun plafond » n’est pas un montant : il reste en clair')
            .toMatch(/<span>Aucun plafond<\/span>/);
    });
});
