// tests/components/reglageSmithExplique.test.tsx
//
// [DETTE-LEVIER-EXPLICITE] Le bouton qui CRÉE de la dette dit, à l'écran, ce qu'il fait.
//
// Marc, 2026-09-21 : « Je veux que ce soit explicite et expliqué » — après avoir cru pendant des
// jours que sa projection avait un bug, alors que c'était ce réglage, activé en UN clic.
//
// ⚠️ CE QUE CE FICHIER INTERDIT, et pourquoi ce n'est pas du confort. L'explication vivait dans un
// `title` sur le `<button>`. Un `title` n'est révélé que par un survol SOURIS prolongé : ni au
// doigt (aucun survol n'existe), ni au clavier, ni au lecteur d'écran, qui lit le CONTENU du bouton
// (« Smith Manoeuvre ON ») et rien d'autre. Un réglage dont l'effet est de faire MONTER une dette
// toute une vie ne peut pas se décrire dans un canal que la moitié des utilisateurs n'a pas — c'est
// `UN-AVERTISSEMENT-SANS-RECOURS` appliqué à une explication (finding a11y #644, re-payé ici).
//
// ⚠️ `UN-TICKET-QUI-N-ANNONCE-QU-UN-MONTANT-NE-DIT-PAS-SA-GRAVITE` (2026-09-03) disait déjà qu'un
// défaut ATTEIGNABLE PAR UN CLIC — un bouton des réglages avancés, que l'utilisateur active en
// croyant s'optimiser — mérite un cran de plus qu'un défaut subi. C'est le même bouton.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { AdvancedProjectionParams } from '../../components/AdvancedProjectionParams';
import type { ProjectionConfig } from '../../types';
import { LIBELLE_LEVIER } from '../../components/future/detteSerie';

const renderPanel = (useSmithManoeuvre: boolean) => render(
    <AdvancedProjectionParams
        projection={{ useSmithManoeuvre } as unknown as ProjectionConfig}
        updateProj={vi.fn()}
    />,
);

/** Le texte VISIBLE de l'écran (attributs exclus par construction — c'est tout l'objet). */
const texteVisible = () => (document.body.textContent || '').replace(/\s+/g, ' ');

describe('[DETTE-LEVIER-EXPLICITE] le réglage Smith Manoeuvre s’explique à l’écran', () => {
    it.each([[true], [false]])('ON ou OFF, l’explication est VISIBLE (useSmith=%s)', (on) => {
        // ⚠️ Les DEUX états : une explication qui n'apparaîtrait qu'une fois le réglage activé
        // arriverait trop tard — c'est AVANT de cliquer qu'on a besoin de savoir.
        renderPanel(on);
        const txt = texteVisible();
        expect(txt).toContain('ré-emprunté');
        expect(txt).toContain('monte');
        // Le mot qui répond littéralement à la plainte de Marc (« ce n'est pas un découvert »).
        expect(txt).toContain('découvert');
    });

    it('elle NOMME la courbe où l’effet se voit — sinon le graphe et le réglage restent étrangers', () => {
        renderPanel(true);
        // ⚠️ Libellé lu de la SOURCE UNIQUE, jamais recopié : recopié, il divergerait du graphe et
        // l'utilisateur chercherait une courbe qui ne porte plus ce nom.
        expect(texteVisible()).toContain(LIBELLE_LEVIER);
    });

    it('ce n’est PAS un `title` déguisé : le texte est dans un nœud rendu', () => {
        const { container } = renderPanel(true);
        // Anti-vacuité de la méthode : on exige un élément de texte dont le CONTENU porte la
        // phrase. Un `title` sur le bouton satisferait `textContent` du body ? Non — et c'est ce
        // que cette assertion vérifie : un attribut n'est jamais du `textContent`.
        const noeuds = [...container.querySelectorAll('p')]
            .filter((n) => (n.textContent || '').includes('ré-emprunté'));
        expect(noeuds.length, 'aucun paragraphe VISIBLE ne porte l’explication').toBe(1);
        expect((noeuds[0].textContent || '').length).toBeGreaterThan(150);
    });

    it('le bouton lui-même reste trouvable et annonce son état', () => {
        // Anti-vacuité de tout ce qui précède : l'écran rend bien le réglage dont on parle.
        renderPanel(true);
        const bouton = screen.getByRole('button', { name: /Smith Manoeuvre/i });
        expect(within(bouton).getByText(/ON/)).toBeTruthy();
    });

    it('aucun SEUIL de rentabilité chiffré n’est promis', () => {
        // ⚠️ Mesuré le 2026-09-21 : le point d'équilibre dépend de l'écart entre le taux de la marge
        // et le rendement, donc du PROFIL — sur une fixture à hypothèque 5 % (marge 7 %) il tombe
        // entre 5 et 6 % ; sur le profil réel de Marc, autour de 4 %. Écrire un chiffre ici lui
        // donnerait l'autorité d'un fait général qu'aucune mesure ne soutient
        // (`UNE-GRAVITE-CLASSEE-DEPUIS-UN-PROFIL-N-EST-PAS-UNE-GRAVITE`). La phrase dit la
        // CONDITION (« si le rendement dépasse le coût de la marge »), jamais sa valeur.
        renderPanel(true);
        const para = [...document.querySelectorAll('p')]
            .find((n) => (n.textContent || '').includes('ré-emprunté'))!;
        expect(para.textContent).not.toMatch(/\d+([.,]\d+)?\s*%/);
        expect(para.textContent).toContain('rendement');
    });
});
