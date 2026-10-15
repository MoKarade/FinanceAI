// tests/components/GuideModal.langue.test.tsx
// [GUIDE-AIDE-REECRIT] Le guide (bouton ?) est écrit en français correct, avec accents,
// en tutoiement, et ne parle plus de fonctions retirées (curseurs théoriques, « données théoriques »).
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { GuideModal } from '../../components/GuideModal';
import { Tab } from '../../types';

afterEach(cleanup);

const ONGLETS = [Tab.FUTURE, Tab.INVESTMENTS, Tab.TAX, Tab.BUDGET];

function texte(tab: Tab): string {
    render(<GuideModal activeTab={tab} onClose={() => {}} />);
    const t = document.body.textContent ?? '';
    cleanup();
    return t;
}

describe('GuideModal — langue', () => {
    it.each(ONGLETS)('onglet %s : pas de vouvoiement', (tab) => {
        const t = texte(tab);
        expect(t).not.toMatch(/\b(votre|vos|Basculez|Cliquez|Survolez|Deposez|Observez|Utilisez|Modifiez)\b/i);
    });

    it.each(ONGLETS)('onglet %s : pas de mot sans accent courant', (tab) => {
        const t = texte(tab);
        expect(t).not.toMatch(/\b(donnees|periode|Reglages|impot|reelles|theoriques|Depart|Repartition|Geographique)\b/i);
    });

    it('le guide du Futur ne parle plus des curseurs ni des données théoriques', () => {
        const t = texte(Tab.FUTURE);
        expect(t).not.toMatch(/slider|curseur|th[eé]orique/i);
        expect(t).toContain('Machine à voyager dans le temps');
    });
});
