/**
 * [PRIV-CATEGORIE-MASQUEE] La CATÉGORIE est masquée en mode discret.
 *
 * Décision Marc (2026-08-18) : « masquer ». ⚠️ Elle RENVERSE ma recommandation — j'avais proposé le
 * statu quo (« la catégorie est une classe générique, pas un identifiant ») en signalant l'argument
 * contraire : « Santé » ou « Dons », datée, ré-identifie à peu près aussi bien qu'un marchand.
 * Marc a tranché dans l'autre sens, et c'est sa donnée. Le ticket `[PRIV-CATEGORIE-SENSIBLE]` avait
 * listé trois options ; celle-ci est la B (masquer TOUT), pas la C (liste de catégories sensibles).
 *
 * ⚠️ POURQUOI PAS LA C, et c'est un piège déjà au dossier. Une liste de catégories « sensibles »
 * serait une HEURISTIQUE DE TEXTE sur des libellés que Marc écrit lui-même
 * (`TEXT-HEURISTIC-OVER-USER-TEXT`) : une catégorie personnalisée « Psy » y échapperait EN SILENCE,
 * et un masquage qui rate discrètement est pire qu'un masquage absent — il donne une confiance
 * injustifiée. Le seul masquage qui ne ment pas est celui qui ne trie pas.
 *
 * ⚠️ La garde lit `innerHTML` : une valeur fuit par le TEXTE **et** par un ATTRIBUT (`title`,
 * `aria-label`, `value`). Chercher la chaîne dans le HTML rendu couvre les deux d'un coup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { PrivateText } from '../../components/ui/PrivateText';
import { PrivateSelect } from '../../components/ui/PrivateSelect';
import { maskCategory, MASKED_CATEGORY_LABEL } from '../../utils/privacyAria';

/** Chaîne improbable : si elle apparaît quelque part, c'est une VRAIE fuite. */
const CAT = 'SANTE-CONFIDENTIEL-ZQX';

const privacy = (actif: boolean) => useFinanceStore.setState({ isPrivacyMode: actif } as never);
beforeEach(() => privacy(false));

describe('[PRIV-CATEGORIE-MASQUEE] le texte d’une catégorie', () => {
    it('mode discret : ni dans le texte, ni dans un attribut', () => {
        privacy(true);
        render(<PrivateText quoi="categorie" title={CAT}>{CAT}</PrivateText>);
        expect(document.body.innerHTML).not.toContain(CAT);
        expect(document.body.textContent).toContain('Catégorie masquée');
    });

    /**
     * ⚠️ Le défaut attrapé en écrivant ce lot : `PrivateText` avait été construit pour les
     * MARCHANDS et annonçait « Marchand masqué » — sur une colonne entière de CATÉGORIES. Pas une
     * fuite, mais une affirmation FAUSSE à l'oreille. La prop `quoi` est typée en union fermée pour
     * qu'un oubli soit une erreur de compilation, pas une annonce silencieusement fausse.
     */
    it('annonce « Marchand » ou « Catégorie » selon ce qui est masqué', () => {
        privacy(true);
        const { unmount } = render(<PrivateText quoi="categorie">{CAT}</PrivateText>);
        expect(document.body.textContent).toContain('Catégorie masquée');
        unmount();
        render(<PrivateText>{CAT}</PrivateText>);
        expect(document.body.textContent).toContain('Marchand masqué');
    });

    it('hors mode discret : lisible (anti-sur-correctif)', () => {
        render(<PrivateText>{CAT}</PrivateText>);
        expect(document.body.textContent).toContain(CAT);
    });

    it('`maskCategory` couvre les attributs', () => {
        expect(maskCategory(CAT, true)).toBe(MASKED_CATEGORY_LABEL);
        expect(maskCategory(CAT, false)).toBe(CAT);
    });
});

/**
 * ⚠️ LE CAS QUI DISTINGUE CE LOT DU PRÉCÉDENT. La catégorie n'est pas qu'un texte affiché : c'est un
 * `<select>` qu'on MODIFIE. L'envelopper dans `PrivateText` aurait masqué la donnée ET l'édition —
 * on aurait retiré une fonction pour protéger une valeur. Le dépôt avait déjà résolu ce cas exact
 * pour les montants (`PrivateNumberInput`, décision `D6-PRIV-MONTANTS`) : masqué au repos, révélé
 * au focus. `PrivateSelect` reprend cet idiome plutôt que d'en inventer un troisième.
 */
describe('[PRIV-CATEGORIE-MASQUEE] le SELECT reste éditable', () => {
    const rendre = () => render(
        <PrivateSelect aria-label="Catégorie" value={CAT} onChange={() => {}}>
            <option value={CAT}>{CAT}</option>
            <option value="Autre">Autre</option>
        </PrivateSelect>,
    );

    it('au REPOS : la valeur n’est pas dans le DOM du tout', () => {
        privacy(true);
        rendre();
        // Ni le texte de l'option, ni l'attribut `value` : le `<select>` n'est pas rendu.
        expect(document.body.innerHTML).not.toContain(CAT);
        expect(document.querySelector('select')).toBeNull();
    });

    it('au CLIC : le vrai select apparaît — on peut encore corriger sa catégorie', () => {
        privacy(true);
        rendre();
        fireEvent.click(screen.getByRole('button'));
        expect(document.querySelector('select')).not.toBeNull();
    });

    // ⚠️ Le nom accessible vient de l'APPELANT, jamais du composant : un `aria-label` en dur
    // écraserait le nom de chaque champ et tous les contrôles masqués d'un écran s'appelleraient
    // pareil. Leçon `A11Y-PRIVACY-SALAIRE`, reprise telle quelle.
    it('le bouton masqué garde le nom que l’appelant lui donne', () => {
        privacy(true);
        rendre();
        expect(screen.getByRole('button', { name: 'Catégorie' })).toBeInTheDocument();
    });

    it('hors mode discret : select natif direct, aucun clic à payer', () => {
        rendre();
        expect(document.querySelector('select')).not.toBeNull();
    });

    // La confidentialité l'emporte sur l'édition en cours.
    it('réactiver le mode discret RE-MASQUE, même révélé', () => {
        privacy(true);
        const { rerender } = rendre();
        fireEvent.click(screen.getByRole('button'));
        expect(document.querySelector('select')).not.toBeNull();
        privacy(false);
        rerender(<PrivateSelect aria-label="Catégorie" value={CAT} onChange={() => {}}><option value={CAT}>{CAT}</option></PrivateSelect>);
        privacy(true);
        rerender(<PrivateSelect aria-label="Catégorie" value={CAT} onChange={() => {}}><option value={CAT}>{CAT}</option></PrivateSelect>);
        expect(document.body.innerHTML).not.toContain(CAT);
    });
});
