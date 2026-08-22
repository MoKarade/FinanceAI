// tests/components/doubleSaisieLocatif.test.tsx
//
// [W5-DOUBLE-SAISIE-LOCATIF] Un même immeuble locatif peut être saisi dans DEUX écrans sans aucun
// lien entre eux, et les deux producteurs S'ADDITIONNENT dans la projection :
//   · onglet Immobilier → `RealEstateGoal.rentalIncomeMonthly` → revenu + `accRentesYear`,
//     imposé au barème RÉEL en décembre (`realEstateMonth.ts`) ;
//   · Réglages → Patrimoine → `RentalProperty` → NOI, imposé au FORFAIT W5 (`w5Effects.ts`).
// Résultat : loyer compté deux fois, impôt calculé deux fois par deux mécanismes distincts.
//
// ⚠️ CE QUE CE LOT NE FAIT PAS, et pourquoi. Il ne tente PAS de détecter que « c'est le même
// immeuble » : les deux structures n'ont aucun identifiant commun, et les rapprocher par leur NOM
// serait une heuristique de texte sur du texte UTILISATEUR (`TEXT-HEURISTIC-OVER-USER-TEXT`) —
// « Plex Papineau » vs « 4-plex » échapperait en silence, et un masquage qui rate discrètement est
// pire qu'une absence de masquage. L'avertissement repose donc sur un fait STRUCTUREL — les deux
// listes sont non vides — et ne PRÉTEND rien : il demande de vérifier.
//
// ⚠️ Le premier test ci-dessous est le plus important : il prouve que le double comptage est RÉEL.
// Sans lui, l'avertissement serait une précaution invérifiée — et une garde qui protège d'un défaut
// qui n'existe pas est du bruit qu'on finit par retirer.

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { RentalPropertyPanel } from '../../components/PatrimoineExtended';
import type { RentalProperty } from '../../types';

const bien = (over: Partial<RentalProperty> = {}): RentalProperty => ({
    id: 'rp1', name: 'Plex Papineau', purchasePrice: 500_000, currentValue: 600_000,
    mortgageBalance: 300_000, mortgageRate: 5, monthlyRent: 2_000, vacancyPct: 5,
    monthlyExpenses: 400, ...over,
});

afterEach(cleanup);

describe('[W5-DOUBLE-SAISIE-LOCATIF] les deux mécanismes de revenu locatif s’ADDITIONNENT', () => {
    it('les deux producteurs sont indépendants dans le moteur — aucun ne connaît l’autre', async () => {
        // Preuve par la SOURCE, pas par un run : les deux modules sont dans des fichiers distincts,
        // pilotés par des champs distincts, et ni l'un ni l'autre ne consulte la structure opposée.
        // C'est exactement ce qui rend le double comptage possible — et invisible.
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const lire = (rel: string): string => readFileSync(resolve(__dirname, '../../', rel), 'utf8');

        const immobilier = lire('services/projection/realEstateMonth.ts');
        const w5 = lire('services/projection/w5Effects.ts');

        // Chaque producteur ajoute bien du revenu depuis SA propre source…
        expect(immobilier).toMatch(/goal\.rentalIncomeMonthly/);
        expect(immobilier).toMatch(/monthlyIncome \+= rentalIncome/);
        expect(w5).toMatch(/rentalPropertyNoiMonthly/);
        expect(w5).toMatch(/addIncome\(rentalPropertyNoiMonthly\)/);

        // …et AUCUN ne regarde la structure de l'autre : rien ne peut donc dédupliquer.
        expect(immobilier, 'realEstateMonth ne consulte pas rentalProperties').not.toMatch(/rentalProperties/);
        expect(w5, 'w5Effects ne consulte pas rentalIncomeMonthly').not.toMatch(/rentalIncomeMonthly/);
    });

    it('l’avertissement APPARAÎT quand les deux côtés sont peuplés', () => {
        const { container } = render(
            <RentalPropertyPanel properties={[bien()]} onChange={() => {}} nbLocatifsImmobilier={1} />,
        );
        expect(container.textContent).toMatch(/deux fois/);
        expect(container.textContent).toMatch(/onglet Immobilier/);
    });

    it('il N’APPARAÎT PAS quand un seul côté est peuplé (pas de bruit sur le cas nominal)', () => {
        // Sans doublon possible, l'avertissement serait une alarme permanente — et une alarme
        // permanente s'ignore. Les deux sens sont donc verrouillés.
        const sansAutreCote = render(
            <RentalPropertyPanel properties={[bien()]} onChange={() => {}} nbLocatifsImmobilier={0} />,
        );
        expect(sansAutreCote.container.textContent).not.toMatch(/deux fois/);
        cleanup();

        const sansBienIci = render(
            <RentalPropertyPanel properties={[]} onChange={() => {}} nbLocatifsImmobilier={3} />,
        );
        expect(sansBienIci.container.textContent).not.toMatch(/deux fois/);
    });

    it('la prop absente ⇒ aucun avertissement (rétrocompat : un appelant qui ne la passe pas)', () => {
        const { container } = render(<RentalPropertyPanel properties={[bien()]} onChange={() => {}} />);
        expect(container.textContent).not.toMatch(/deux fois/);
    });

    it('le compte de l’autre côté ne retient QUE les objectifs réellement locatifs', async () => {
        // Le filtre de `PatrimoineSection` doit reproduire la condition EXACTE du moteur
        // (`!goal.isPrimaryResidence && goal.rentalIncomeMonthly`) : compter une résidence
        // principale avertirait pour un bien qui ne produit aucun loyer, donc ne peut rien doubler.
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const src = readFileSync(
            resolve(__dirname, '../../components/settings/sections/PatrimoineSection.tsx'), 'utf8');
        expect(src).toMatch(/!g\.isPrimaryResidence/);
        expect(src).toMatch(/rentalIncomeMonthly \?\? 0\) > 0/);
    });
});
