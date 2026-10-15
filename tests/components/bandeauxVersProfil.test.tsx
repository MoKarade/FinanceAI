/**
 * [BANDEAUX-VERS-PROFIL] Un bouton « Configurer → » mène au champ qu'il nomme.
 *
 * Défaut signalé le 25/09/2026 : les bandeaux « donnée manquante » (espérance de vie, salaire,
 * âge…), les prérequis de page et l'invite « données manquantes » visaient `Tab.SETTINGS` avec une
 * section `profile-*`. Or ces champs vivent dans l'onglet Profil depuis PH3 : Réglages ouvrait un
 * sous-onglet qui ne contient plus qu'un renvoi. Le bouton avait l'air de marcher et ne menait
 * nulle part.
 *
 * Trois gardes : (1) aucune source ne vise encore Réglages pour un champ profil ; (2) chaque
 * section visée existe bien comme `data-focus-section` dans un composant ; (3) le Profil, monté
 * avec un deep-link, ouvre le BON sous-onglet et y monte le champ visé.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { Profile } from '../../components/Profile';
import { Tab } from '../../types';

const ROOT = path.resolve(__dirname, '../..');
const SOURCES = ['components/ui/MissingDataBanner.tsx', 'components/setup/requirements.ts', 'components/ui/EmptyDataPrompt.tsx'];
const lire = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('[BANDEAUX-VERS-PROFIL] les deep-links des champs profil', () => {
    it('aucune source ne vise Réglages pour un champ `profile-*`', () => {
        const fautifs: string[] = [];
        for (const rel of SOURCES) {
            const src = lire(rel);
            // Trois écritures : appel direct, objet `focus`, descripteur multi-lignes (section puis tab).
            if (/Tab\.SETTINGS,\s*'profile-/.test(src)) fautifs.push(`${rel} : navigateWithFocus(Tab.SETTINGS, 'profile-…')`);
            if (/tab:\s*Tab\.SETTINGS,\s*section:\s*'profile-/.test(src)) fautifs.push(`${rel} : focus { tab: Tab.SETTINGS, section: 'profile-…' }`);
            if (/section:\s*'profile-[^']+',\s*tab:\s*Tab\.SETTINGS/.test(src)) fautifs.push(`${rel} : { section: 'profile-…', tab: Tab.SETTINGS }`);
        }
        expect(fautifs).toEqual([]);
    });

    it('chaque section `profile-*` visée existe comme `data-focus-section` quelque part', () => {
        const visees = new Set<string>();
        for (const rel of SOURCES) for (const m of lire(rel).matchAll(/'(profile-[A-Za-z0-9-]+)'/g)) visees.add(m[1]);
        // Anti-vacuité : les trois sources portent bien des deep-links profil.
        expect(visees.size).toBeGreaterThanOrEqual(8);

        const composants = readdirSync(path.join(ROOT, 'components'), { recursive: true, encoding: 'utf8' })
            .filter((f) => f.endsWith('.tsx'))
            .map((f) => readFileSync(path.join(ROOT, 'components', f), 'utf8'))
            .join('\n');
        // Les cibles par personne s'écrivent `profile-user${idx + 1}-name` : on les développe pour 1 et 2.
        const cibles = new Set<string>();
        for (const m of composants.matchAll(/data-focus-section=(?:"([^"]+)"|\{`([^`]+)`\})/g)) {
            const brut = m[1] ?? m[2];
            if (brut.includes('${')) for (const n of [1, 2]) cibles.add(brut.replace(/\$\{[^}]+\}/, String(n)));
            else cibles.add(brut);
        }
        const orphelines = [...visees].filter((s) => !cibles.has(s));
        expect(orphelines, 'section visée par un bouton mais absente de tout écran').toEqual([]);
    });
});

describe('[BANDEAUX-VERS-PROFIL] le Profil consomme le deep-link', () => {
    const etatInitial = useFinanceStore.getState();
    beforeEach(() => useFinanceStore.setState(etatInitial, true));

    const cas: Array<{ section: string; onglet: RegExp }> = [
        { section: 'profile-lifeExpectancy', onglet: /Retraite (&|et) enfants/ },
        { section: 'profile-user1-grossSalary', onglet: /Revenus/ },
        { section: 'profile-user1-card', onglet: /Identité/ },
    ];
    for (const { section, onglet } of cas) {
        it(`« ${section} » ouvre l'onglet ${onglet.source} et y monte le champ`, () => {
            useFinanceStore.setState({ pendingFocus: { tab: Tab.PROFILE, section, expiresAt: Date.now() + 5_000 } });
            const { container } = render(<Profile />);
            expect(screen.getByRole('tab', { name: onglet })).toHaveAttribute('aria-selected', 'true');
            const cible = Array.from(container.querySelectorAll<HTMLElement>('[data-focus-section]'))
                .find((n) => n.dataset.focusSection === section);
            expect(cible, `champ ${section} absent du sous-onglet ouvert`).toBeTruthy();
        });
    }

    it('sans deep-link : l\'onglet Identité, comme avant', () => {
        render(<Profile />);
        expect(screen.getByRole('tab', { name: /Identité/ })).toHaveAttribute('aria-selected', 'true');
    });
});
