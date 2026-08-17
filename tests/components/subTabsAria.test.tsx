/**
 * [A11Y-SUBTABS-TABPANEL] Le motif ARIA des sous-onglets, et la garde qui empêche sa dérive.
 *
 * ⚠️ LE DÉFAUT D'ORIGINE. Trois écrans (`Profile`, `Retirement`, `BudgetWorkspace`) avaient recopié
 * le même balisage : `role="tablist"` + boutons `role="tab"`, mais SANS `role="tabpanel"`, sans
 * `aria-controls` et sans `aria-labelledby`. Un lecteur d'écran annonçait donc « onglet » sans
 * pouvoir relier l'onglet à son contenu ni y naviguer.
 *
 * ⚠️ POURQUOI UNE GARDE DE SOURCE EN PLUS DES TESTS DE RENDU. Le vrai risque n'est pas que le
 * composant partagé régresse — c'est qu'un QUATRIÈME écran recopie l'ancien balisage à la main,
 * comme les trois premiers l'avaient fait entre eux. Aucun test de rendu sur `Profile` ne peut
 * détecter ça : le nouvel écran serait simplement absent de la suite. La garde scanne donc le
 * SOURCE de tous les composants pour interdire la copie.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import React from 'react';
import { SubTabs, TabPanel } from '../../components/ui/SubTabs';

describe('[A11Y-SUBTABS-TABPANEL] le motif est COMPLET', () => {
    const TABS = [
        { id: 'a' as const, label: 'Premier', icon: 'users' as const },
        { id: 'b' as const, label: 'Second', icon: 'cash' as const },
    ];

    const Harnais: React.FC<{ actif: 'a' | 'b' }> = ({ actif }) => (
        <>
            <SubTabs idPrefix="test" label="Sections Test" tabs={TABS} active={actif} onSelect={vi.fn()} />
            <TabPanel idPrefix="test" tab="a" when={actif === 'a'}>contenu A</TabPanel>
            <TabPanel idPrefix="test" tab="b" when={actif === 'b'}>contenu B</TabPanel>
        </>
    );

    it('chaque onglet POINTE vers son panneau, et le panneau REPOINTE vers l’onglet', () => {
        render(<Harnais actif="a" />);
        const onglet = screen.getByRole('tab', { name: 'Premier' });
        const panneau = screen.getByRole('tabpanel');

        // Le lien réciproque est LE cœur du motif : sans lui, un lecteur d'écran ne peut pas dire
        // « panneau Premier, de l'onglet Premier », ni y sauter.
        expect(onglet.getAttribute('aria-controls')).toBe(panneau.getAttribute('id'));
        expect(panneau.getAttribute('aria-labelledby')).toBe(onglet.getAttribute('id'));
    });

    it('le panneau est FOCALISABLE (sinon « aller au contenu » n’a nulle part où atterrir)', () => {
        render(<Harnais actif="a" />);
        expect(screen.getByRole('tabpanel').getAttribute('tabindex')).toBe('0');
    });

    it('seul le panneau ACTIF est dans le DOM', () => {
        render(<Harnais actif="a" />);
        expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
        expect(screen.getByText('contenu A')).toBeTruthy();
        expect(screen.queryByText('contenu B')).toBeNull();
    });

    it('les `id` sont PRÉFIXÉS par écran (deux écrans montés ne doivent pas collisionner)', () => {
        const { container } = render(
            <>
                <SubTabs idPrefix="ecranUn" label="Un" tabs={TABS} active="a" onSelect={vi.fn()} />
                <SubTabs idPrefix="ecranDeux" label="Deux" tabs={TABS} active="a" onSelect={vi.fn()} />
            </>,
        );
        const ids = [...container.querySelectorAll('[role="tab"]')].map((e) => e.getAttribute('id'));
        expect(new Set(ids).size, 'des `id` en double rendraient `aria-controls` ambigu').toBe(ids.length);
    });
});

describe('[A11Y-SUBTABS-TABPANEL] garde de SOURCE : personne ne recopie le balisage à la main', () => {
    const racine = resolve(__dirname, '../../components');

    const tousLesFichiers = (dir: string): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
            const p = join(dir, e.name);
            return e.isDirectory() ? tousLesFichiers(p) : p.endsWith('.tsx') ? [p] : [];
        });

    /** ⚠️ Le scan doit ignorer les COMMENTAIRES : un fichier qui EXPLIQUE le motif (comme
     *  `Profile.tsx`, qui documente pourquoi il ne recopie plus le balisage) n'est pas un offender.
     *  Ma première version l'accusait — une garde qui crie sur sa propre documentation finit
     *  désactivée. */
    const sansCommentaires = (src: string): string =>
        src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    /** Exception CONNUE, LISTÉE et JUSTIFIÉE — jamais une exclusion silencieuse.
     *  `FutureProjection` est un vrai motif à panneaux, mais son bandeau a un habillage DIFFÉRENT
     *  (emojis au lieu d'icônes, autre fond, autres espacements). Le convertir tel quel changerait
     *  l'apparence de l'écran principal de Marc, ce qu'il n'a pas demandé. Ticket dédié :
     *  `[A11Y-SUBTABS-FUTUR]` — soit une variante d'habillage dans `SubTabs`, soit un accord
     *  explicite de Marc sur le changement visuel.
     *  ⚠️ Cette liste est un CLIQUET : elle ne doit que RÉTRÉCIR. Un fichier de plus ici veut dire
     *  qu'on a recopié le balisage au lieu d'utiliser `<SubTabs>`. */
    const EXCEPTIONS_CONNUES = ['FutureProjection.tsx'];

    it('aucun NOUVEAU composant ne recopie `role="tablist"` à la main', () => {
        const offenders = tousLesFichiers(racine)
            .filter((f) => !f.endsWith(join('ui', 'SubTabs.tsx')))
            .filter((f) => /role="tablist"/.test(sansCommentaires(readFileSync(f, 'utf8'))))
            .map((f) => f.slice(racine.length + 1));

        expect(
            offenders.sort(),
            'un écran qui recopie le bandeau recopiera aussi ses lacunes ARIA — passer par <SubTabs>',
        ).toEqual(EXCEPTIONS_CONNUES);
    });
});
