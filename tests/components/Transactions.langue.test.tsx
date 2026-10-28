/**
 * [TRANSACTIONS-LANGUE] — Transactions : français correct (accents) et tutoiement.
 *
 * Avant : « Filtre par categorie », « Tout semble deja classe ! Utilisez le mode manuel… »,
 * « transaction(s) mises a jour »… Après : accents partout, tutoiement comme le reste de l'app.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Transactions } from '../../components/Transactions';

vi.mock('../../services/claude', () => ({ categorizeBatch: vi.fn() }));
vi.mock('../../components/ui/Toast', () => ({ showToast: vi.fn() }));

beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
});

const source = readFileSync(resolve(__dirname, '../../components/Transactions.tsx'), 'utf8');

describe('[TRANSACTIONS-LANGUE] libellés visibles', () => {
    it('le filtre de catégorie est nommé avec son accent', () => {
        render(<Transactions transactions={[]} setTransactions={vi.fn()} apiKey="" budgetItems={[]} />);
        expect(screen.getByLabelText('Filtre par catégorie')).toBeInTheDocument();
    });

    it.each([
        'Tout semble déjà classé ! Utilise le mode manuel si besoin.',
        'transaction(s) mises à jour',
        'classée(s) par règles — rien à envoyer à l\'IA.',
        'Choisir une catégorie…',
        'aria-label="Catégorie à appliquer"',
        '-- Catégorie --',
    ])('le texte « %s » est écrit correctement', (texte) => {
        expect(source).toContain(texte);
    });

    it.each([
        'deja classe',
        'mises a jour',
        'par regles',
        'rien a envoyer',
        'Choisir categorie',
        'Categorie a appliquer',
        '-- Categorie --',
        'Filtre par categorie',
        'Utilisez le mode manuel',
    ])('l\'ancien texte « %s » a disparu', (texte) => {
        expect(source).not.toContain(texte);
    });
});
