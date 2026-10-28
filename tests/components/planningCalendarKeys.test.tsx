// tests/components/planningCalendarKeys.test.tsx
//
// [PLANNING-CALENDAR-KEY-DOUBLON] L'en-tête du calendrier rendait `['L','M','M','J','V','S','D']`
// avec `key={d}` : deux clés `M` (mardi/mercredi), donc un avertissement React à CHAQUE rendu de cet
// écran. Sans conséquence visible (liste statique, jamais réordonnée) — mais c'est du bruit
// permanent dans la console de test, et un avertissement permanent est un avertissement qu'on cesse
// de lire, y compris le jour où il désigne une VRAIE liste dynamique.
//
// ⚠️ La garde vise le FAIT (« ce rendu n'émet aucun avertissement de clé dupliquée »), jamais la
// forme du tableau : elle resterait juste si les libellés changeaient, et elle attraperait une
// nouvelle liste mal clefée ajoutée à cet écran.
//
// Balayage du dépôt fait au même lot : 27 sites utilisent l'élément lui-même comme clé. UN seul
// offender (celui-ci) ; deux autres sont explicitement dédoublonnés avec le commentaire qui explique
// pourquoi (`AiChatView` via `new Set`, `FutureHistorySection` « leçon Diane & Robert ») ; les 24
// restants itèrent des ensembles uniques par construction. La classe est comprise dans ce dépôt —
// c'était le reliquat.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { Planning } from '../../components/Planning';
import type { Transaction } from '../../types';

vi.mock('../../services/claude', () => ({ detectSubscriptionsAI: vi.fn() }));
vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

const TX: Transaction[] = [
    { id: 1, date: '2026-05-05', payee: 'Netflix', amount: -18, category: 'Loisirs', status: 'processed' },
    { id: 2, date: '2026-06-05', payee: 'Netflix', amount: -18, category: 'Loisirs', status: 'processed' },
    { id: 3, date: '2026-07-05', payee: 'Netflix', amount: -18, category: 'Loisirs', status: 'processed' },
] as unknown as Transaction[];

afterEach(() => { vi.restoreAllMocks(); });

/** Messages émis par React sur `console.error` pendant le rendu. */
function rendreEnEcoutant(): string[] {
    const messages: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { messages.push(args.map(String).join(' ')); });
    render(<Planning transactions={TX} />);
    return messages;
}

describe('[PLANNING-CALENDAR-KEY-DOUBLON] le calendrier n’émet aucun avertissement de clé dupliquée', () => {
    it('rendu complet de l’écran : zéro avertissement « same key »', () => {
        const messages = rendreEnEcoutant();
        const clesDupliquees = messages.filter((m) => /same key|two children with the same key/i.test(m));
        expect(clesDupliquees, `avertissements de clé émis :\n${clesDupliquees.join('\n')}`).toEqual([]);
    });

    // ANTI-VACUITÉ : sans ce cas, un espion mal câblé (ou un React qui n'avertit plus) rendrait le
    // test ci-dessus vert quoi qu'il arrive. On prouve que le mécanisme VOIT une clé dupliquée.
    it('l’espion voit RÉELLEMENT une clé dupliquée (sinon la garde ci-dessus est vacueuse)', () => {
        const messages: string[] = [];
        vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { messages.push(args.map(String).join(' ')); });
        render(<ul>{['A', 'B', 'B'].map((x) => <li key={x}>{x}</li>)}</ul>);
        expect(messages.some((m) => /same key/i.test(m))).toBe(true);
    });
});
