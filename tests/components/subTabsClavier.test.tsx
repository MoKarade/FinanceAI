// [A11Y-TABLIST-NO-PANEL] Le motif ARIA « tabs » : le lien réciproque onglet ↔ panneau, et le clavier.
//
// ⚠️ Deux moitiés, et l'ancienne version n'en avait aucune. L'ÉTIQUETAGE (un `aria-controls` qui
// pointe vers un panneau, et un `aria-labelledby` qui repointe vers l'onglet) permet à un lecteur
// d'écran de dire « panneau X, de l'onglet X » et d'y sauter. Le CLAVIER (flèches, Début, Fin,
// `tabIndex` roving) est ce qui rend le bandeau franchissable : sans lui, atteindre le contenu
// coûte une tabulation par onglet.
//
// ⚠️ Ce test vise le RENDU, pas la source. Un scan prouverait que `aria-controls` existe ; il ne
// dirait pas qu'il pointe vers un élément PRÉSENT, ni que la flèche change quoi que ce soit — deux
// choses qu'un attribut figé satisferait (`UN-ATTRIBUT-PRESENT-NE-PROUVE-PAS-QU-IL-DESIGNE-LA-BONNE-CHOSE`).
import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SubTabs, TabPanel, tabId, panelId, type SubTabDef } from '../../components/ui/SubTabs';

type Id = 'un' | 'deux' | 'trois';
const TABS: ReadonlyArray<SubTabDef<Id>> = [
    { id: 'un', label: 'Premier', icon: 'settings' },
    { id: 'deux', label: 'Deuxième', icon: 'money' },
    { id: 'trois', label: 'Troisième', icon: 'tax' },
];

const Harnais: React.FC = () => {
    const [actif, setActif] = useState<Id>('un');
    return (
        <>
            <SubTabs<Id> idPrefix="t" label="Sections de test" tabs={TABS} active={actif} onSelect={setActif} />
            {TABS.map((t) => (
                <TabPanel key={t.id} idPrefix="t" tab={t.id} when={actif === t.id}>
                    <span>contenu {t.id}</span>
                </TabPanel>
            ))}
        </>
    );
};

/** `requestAnimationFrame` synchrone : le focus du motif est différé d'une frame. */
function avecRafSynchrone(fn: () => void) {
    const vrai = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => { cb(0); return 0; }) as typeof vrai;
    try { fn(); } finally { globalThis.requestAnimationFrame = vrai; }
}

describe('[A11Y-TABLIST-NO-PANEL] motif tabs — lien réciproque et clavier', () => {
    it('chaque onglet DÉSIGNE un panneau présent, qui le re-désigne', () => {
        render(<Harnais />);
        const actif = screen.getByRole('tab', { selected: true });
        const cible = actif.getAttribute('aria-controls');
        expect(cible, 'l\'onglet actif ne désigne aucun panneau').toBe(panelId('t', 'un'));

        // ⚠️ Le point que seul un test de RENDU peut faire : la cible EXISTE.
        const panneau = document.getElementById(cible as string);
        expect(panneau, 'aria-controls pointe vers un id absent du DOM').toBeTruthy();
        expect(panneau?.getAttribute('role')).toBe('tabpanel');
        // …et elle repointe vers l'onglet : c'est la réciprocité qui permet d'y naviguer.
        expect(panneau?.getAttribute('aria-labelledby')).toBe(tabId('t', 'un'));
        expect(panneau?.getAttribute('tabindex'), 'panneau non focalisable : la tabulation n\'a nulle part où atterrir').toBe('0');

        // Un seul panneau monté à la fois — les inactifs sont ABSENTS, pas masqués.
        expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    });

    it('`tabIndex` roving : un SEUL onglet dans l\'ordre de tabulation', () => {
        render(<Harnais />);
        const onglets = screen.getAllByRole('tab');
        expect(onglets).toHaveLength(3);
        expect(onglets.filter((o) => o.getAttribute('tabindex') === '0')).toHaveLength(1);
        expect(screen.getByRole('tab', { selected: true }).getAttribute('tabindex')).toBe('0');
    });

    it('les FLÈCHES sélectionnent, avec bouclage, et Début/Fin vont aux extrémités', () => {
        render(<Harnais />);
        const liste = screen.getByRole('tablist');
        const nomActif = () => screen.getByRole('tab', { selected: true }).textContent;

        expect(nomActif()).toContain('Premier');
        avecRafSynchrone(() => fireEvent.keyDown(liste, { key: 'ArrowRight' }));
        expect(nomActif()).toContain('Deuxième');
        // ⚠️ Le BOUCLAGE se teste, sinon « la flèche avance » serait vrai d'un compteur qui déborde.
        avecRafSynchrone(() => fireEvent.keyDown(liste, { key: 'ArrowLeft' }));
        avecRafSynchrone(() => fireEvent.keyDown(liste, { key: 'ArrowLeft' }));
        expect(nomActif(), 'gauche depuis le premier doit revenir au dernier').toContain('Troisième');
        avecRafSynchrone(() => fireEvent.keyDown(liste, { key: 'ArrowRight' }));
        expect(nomActif(), 'droite depuis le dernier doit revenir au premier').toContain('Premier');

        avecRafSynchrone(() => fireEvent.keyDown(liste, { key: 'End' }));
        expect(nomActif()).toContain('Troisième');
        avecRafSynchrone(() => fireEvent.keyDown(liste, { key: 'Home' }));
        expect(nomActif()).toContain('Premier');
    });

    it('le PANNEAU suit la sélection au clavier — sinon le motif ment', () => {
        render(<Harnais />);
        const liste = screen.getByRole('tablist');
        avecRafSynchrone(() => fireEvent.keyDown(liste, { key: 'ArrowRight' }));
        const panneau = screen.getByRole('tabpanel');
        expect(panneau.id).toBe(panelId('t', 'deux'));
        expect(panneau.getAttribute('aria-labelledby')).toBe(tabId('t', 'deux'));
        expect(panneau.textContent).toContain('contenu deux');
    });

    it('le FOCUS suit la sélection — sans lui, la flèche suivante repart du mauvais onglet', () => {
        render(<Harnais />);
        const liste = screen.getByRole('tablist');
        avecRafSynchrone(() => fireEvent.keyDown(liste, { key: 'ArrowRight' }));
        expect(document.activeElement?.id).toBe(tabId('t', 'deux'));
    });

    it('une touche NON prévue ne fait rien — et ne bloque pas le navigateur', () => {
        // ⚠️ Contrôle : sans lui, un `preventDefault()` posé trop large casserait la saisie ailleurs,
        // et « les flèches marchent » serait vrai d'un handler qui avale TOUT.
        const onSelect = vi.fn();
        render(<SubTabs<Id> idPrefix="x" label="l" tabs={TABS} active="un" onSelect={onSelect} />);
        const evt = fireEvent.keyDown(screen.getByRole('tablist'), { key: 'a' });
        expect(evt, 'la touche « a » a été annulée : le handler avale trop').toBe(true);
        expect(onSelect).not.toHaveBeenCalled();
        // Et le contraire, pour prouver que ce contrôle n'est pas vacueux :
        act(() => { avecRafSynchrone(() => fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })); });
        expect(onSelect).toHaveBeenCalledWith('deux');
    });
});
