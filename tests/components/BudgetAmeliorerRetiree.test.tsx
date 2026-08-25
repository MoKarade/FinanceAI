// tests/components/BudgetAmeliorerRetiree.test.tsx
//
// [BUDGET-REMOVE-AMELIORER] Marc : la section « Améliorer mon budget » de l'onglet Budget est
// « devenue inutile ». Elle est retirée — mais une épuration se juge sur ce qu'elle NE doit PAS
// emporter, pas sur ce qu'elle supprime (`EPURATION-SUPPRIME-LA-RESERVE`).
//
// ⚠️ VÉRIFIÉ AVANT DE SUPPRIMER : le bouton « Diagnostic » de la carte avait un JUMEAU dans la barre
// de pilotage, en haut de l'onglet (`<Button onClick={handleAiDiagnosis} variant="primary" size="sm">`).
// Le diagnostic IA ne disparaît donc pas avec la carte — il n'était que DUPLIQUÉ. Sans cette
// vérification, retirer la section aurait supprimé une fonctionnalité que le ticket ne visait pas.
//
// Ce qui disparaît RÉELLEMENT, et qui est unique : le donut théorique 50/30/20, la « répartition
// réelle », et le tableau comparatif Réel · Cible · Idéal. C'est bien ce que le ticket demande.
//
// ⚠️ Effet de bord MESURÉ, et mesuré pour de vrai : `Budget.tsx` n'importe plus Recharts du tout
// (ni `ChartDataTable`, ni `CHART_TOOLTIP_STYLE`, ni `computeGoldenSplit`/`GOLDEN_IDEAL`). Sur un
// build PROPRE (`rm -rf dist`), le chunk de l'onglet passe de **86 865 à 81 251 octets** (−5 614,
// soit −6,5 %) et le `dist` total de 3 074 968 à 3 069 479 (−5 489).
// ⚠️ Ce n'est PAS « Recharts sort du bundle » : le chunk `recharts` reste **identique au octet près**
// (404 617), parce que d'autres écrans l'importent encore. Le gain est celui du code de l'onglet, et
// il faut le dire ainsi plutôt que laisser croire à une victoire de dépendance.
// Le 3ᵉ test verrouille la frontière : ré-importer un graphique ici passerait sinon inaperçu.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Budget } from '../../components/Budget';
import type { BudgetConfig, BudgetCategory, User } from '../../types';

const config: BudgetConfig = {
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
        { name: 'Anna', grossSalary: 5500, netSalary: 4000, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
    ],
    splitMode: '50/50',
};

const budgetItems: BudgetCategory[] = [
    { id: 'cat1', name: 'Loyer', target: 1500, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
    { id: 'cat2', name: 'Restaurants', target: 200, frequency: 'Monthly', type: 'Commun', nature: 'Envie' },
    { id: 'cat3', name: 'CELI', target: 500, frequency: 'Monthly', type: 'Commun', nature: 'Epargne' },
];

const props = { transactions: [], config, budgetItems, setBudgetItems: () => {}, apiKey: '' };

describe('[BUDGET-REMOVE-AMELIORER] la section est retirée sans emporter le diagnostic', () => {
    it('la carte « Améliorer mon budget » n\'est plus rendue', () => {
        render(<Budget {...props} />);
        expect(screen.queryByText('Améliorer mon budget'), 'la section est encore là').toBeNull();
        // Les deux graphiques propres à la carte partent avec elle.
        expect(screen.queryByText(/Comparatif visuel 50\/30\/20/i)).toBeNull();
        expect(screen.queryByText(/Ta répartition réelle/i)).toBeNull();
    });

    /**
     * LA garde de l'épuration. Avant, « Diagnostic » existait DEUX fois : dans la barre de pilotage
     * ET dans la carte. Exiger **exactement un** dit les deux choses à la fois — le doublon est
     * parti, ET la fonctionnalité est restée. Un simple `queryBy…toBeNull()` sur la carte n'aurait
     * pas vu qu'on emportait le diagnostic avec elle.
     */
    it('« Diagnostic » reste atteignable, et une seule fois', () => {
        render(<Budget {...props} />);
        const boutons = screen.getAllByRole('button', { name: /diagnostic/i });
        expect(boutons, 'le diagnostic IA a disparu avec la carte, ou son doublon est resté').toHaveLength(1);
    });

    it('Budget.tsx n\'importe plus aucun graphique (frontière de bundle)', () => {
        // ⚠️ Chemin relatif au CWD (racine du dépôt) : `import.meta.url` n'est pas un `file:` sous
        // cet environnement de test — mesuré, `ERR_INVALID_URL_SCHEME`.
        const src = readFileSync(resolve(process.cwd(), 'components/Budget.tsx'), 'utf8');
        // ⚠️ Motif ancré sur l'IMPORT, pas sur la mention : un commentaire a le droit de raconter
        // l'histoire de la carte retirée (`SCAN-QUI-MATCHE-LA-PROSE`).
        const imports = [...src.matchAll(/^import[^\n]*from\s+'([^']+)'/gm)].map((m) => m[1]);
        // Anti-vacuité : l'extracteur trouve bien des imports, dont un témoin certain.
        expect(imports.length, 'aucun import trouvé : le motif ne matche rien').toBeGreaterThan(10);
        expect(imports, 'témoin absent — l\'extracteur ne lit pas ce fichier').toContain('react');
        for (const mort of ['recharts', './ui/ChartDataTable', '../utils/chartTooltip']) {
            expect(imports, `${mort} est revenu dans Budget.tsx`).not.toContain(mort);
        }
    });
});
