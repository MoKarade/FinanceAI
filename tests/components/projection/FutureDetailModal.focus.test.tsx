import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FutureDetailModal } from '../../../components/projection/FutureDetailModal';
import type { ProjectionChartPoint } from '../../../services/projection/types';

// [Audit a11y #599] Gestion du focus de la modale de détail. Les deux tests DISCRIMINENT
// le code d'avant (vérifié par stash) :
// 1. HIGH — le callback-ref inline `ref={(node) => node?.focus()}` changeait d'identité à
//    chaque rendu → React ré-exécutait `.focus()` à CHAQUE re-render : cliquer « un compte »
//    (setSelected) arrachait le focus au bouton qu'on venait d'activer.
// 2. MED — aucune restauration : à la fermeture, le focus tombait sur <body> et Tab
//    repartait du haut de page au lieu de la pastille déclencheuse.

const point = {
    monthIndex: 1, year: 2026, dateLabel: 'févr. 2026', age: 30,
    NetWorth: 1000, Liquidites: 500, CELI: 500,
} as unknown as ProjectionChartPoint;
const chartData = [
    { monthIndex: 0, year: 2026, dateLabel: 'janv. 2026', NetWorth: 900, Liquidites: 450, CELI: 450 },
    point,
] as unknown as ProjectionChartPoint[];

describe('FutureDetailModal — gestion du focus (audit #599)', () => {
    it('HIGH — un re-render (clic sur un compte) ne re-vole PAS le focus au profit du dialog', () => {
        render(
            <FutureDetailModal point={point} chartData={chartData} userName1="A" userName2="B" onClose={vi.fn()} />,
        );
        const dialog = screen.getByRole('dialog');
        // Au montage, le dialog prend le focus (comportement voulu, inchangé).
        expect(document.activeElement).toBe(dialog);

        // L'utilisateur clavier atteint un bouton de compte puis l'active → setSelected → re-render.
        const accountBtn = screen.getByRole('button', { name: /CELI/ });
        accountBtn.focus();
        fireEvent.click(accountBtn);

        // Ancien code : le ref inline ré-exécutait node.focus() au re-render → activeElement
        // redevenait le dialog. Nouveau contrat : le focus reste où l'utilisateur l'a mis
        // (le bouton cliqué a disparu au profit du drill-down → il suffit que le dialog ne
        // l'ait pas REPRIS de force).
        expect(document.activeElement).not.toBe(dialog);
    });

    it('MED — à la fermeture (démontage), le focus REVIENT à l\'élément déclencheur', () => {
        const trigger = document.createElement('button');
        trigger.textContent = 'pastille';
        document.body.appendChild(trigger);
        trigger.focus();
        expect(document.activeElement).toBe(trigger);

        const { unmount } = render(
            <FutureDetailModal point={point} chartData={chartData} userName1="A" userName2="B" onClose={vi.fn()} />,
        );
        expect(document.activeElement).toBe(screen.getByRole('dialog'));

        unmount();
        expect(document.activeElement).toBe(trigger);
        trigger.remove();
    });
});
