/**
 * @vitest-environment jsdom
 *
 * [TX-DUPLICATES-BRUIT] La moitié VISIBLE du correctif — celle que Marc touche.
 *
 * Deux faits, mesurés le 2026-09-15 sur ses 321 transactions réelles :
 *   1. le panneau pré-cochait TOUT, collisions de montant comprises (`OnlyFans −100 $` avec un
 *      paiement de carte et un Interac) : un clic suffisait à effacer de l'argent réel ;
 *   2. replié, il n'annonçait RIEN — Marc voit ses doublons « dans ma liste de transactions » et
 *      n'avait aucune raison d'ouvrir ce panneau. C'est sa réponse textuelle du 2026-09-15.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import { DuplicatesPanel } from '../../components/transactions/DuplicatesPanel';
import type { Transaction } from '../../types';

vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

let prochainId = 1;
function tx(date: string, amount: number, payee: string): Transaction {
    return { id: prochainId++, date, payee, amount, category: 'Autre', status: 'processed' } as Transaction;
}

/** Un VRAI doublon (même marchand, même jour) et une COLLISION (marchands sans rapport). */
function jeuMixte(): Transaction[] {
    return [
        tx('2026-08-31', -7.9, 'Metro Rj Rio De'),
        tx('2026-08-31', -7.9, 'Metro Rj Rio De'),
        tx('2026-07-10', -100, 'OnlyFans'),
        tx('2026-07-10', -100, 'Bill payment - AccèsD - Internet /Carte de crédit'),
    ];
}

describe('[TX-DUPLICATES-BRUIT] le panneau annonce, et ne pré-coche que ce qui concorde', () => {
    it('REPLIÉ, il annonce le nombre de lignes détectées — sinon rien n\'invite à l\'ouvrir', () => {
        const { container } = render(
            <DuplicatesPanel transactions={jeuMixte()} onMarkDuplicates={vi.fn()}
                markedCount={0} onUnmarkAll={vi.fn()} />,
        );
        // Une seule ligne en trop est annoncée : le vrai doublon. La collision à 100 $ n'entre PAS
        // dans le badge — un compteur gonflé par du faux referait le tort qu'on corrige.
        expect(container.textContent).toContain('1 détecté');
        expect(container.textContent).not.toContain('2 détecté');
    });

    it('ANTI-VACUITÉ : sans aucun doublon, aucun badge', () => {
        const { container } = render(
            <DuplicatesPanel transactions={[tx('2026-08-31', -7.9, 'Metro Rj Rio De')]}
                onMarkDuplicates={vi.fn()} markedCount={0} onUnmarkAll={vi.fn()} />,
        );
        expect(container.textContent).not.toContain('détecté');
    });

    it('OUVERT, il pré-coche le vrai doublon et PAS la collision de montant', () => {
        const onMark = vi.fn();
        const txs = jeuMixte();
        const idsMetro = txs.filter((t) => t.payee.startsWith('Metro')).map((t) => t.id);
        const idsCollision = txs.filter((t) => !t.payee.startsWith('Metro')).map((t) => t.id);
        const { container, getByRole } = render(
            <DuplicatesPanel transactions={txs} onMarkDuplicates={onMark}
                markedCount={0} onUnmarkAll={vi.fn()} />,
        );
        fireEvent.click(getByRole('button', { name: /Doublons/ }));

        // Les DEUX groupes restent listés — on ne perd rien, la décision d'origine est intacte.
        expect(container.textContent).toContain('Metro Rj Rio De');
        expect(container.textContent).toContain('OnlyFans');
        expect(container.textContent).toContain('marchands différents');

        // Mais un seul est pré-coché, donc le bouton ne propose qu'UNE ligne.
        const bouton = within(container).getByText(/Marquer 1 transaction/);
        fireEvent.click(bouton);

        expect(onMark).toHaveBeenCalledTimes(1);
        const ids = onMark.mock.calls[0]![0] as number[];
        // L'assertion qui compte : l'id marqué vient du groupe Metro, et AUCUN de la collision.
        expect(ids).toHaveLength(1);
        expect(idsMetro).toContain(ids[0]);
        expect(idsCollision).not.toContain(ids[0]);
    });
});
