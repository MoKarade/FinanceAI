// [LIA-1253] Contrat et client navigateur de LIA : fonctions pures, aucune I/O réelle.
import { describe, it, expect, vi } from 'vitest';
import { DemandeLia, ReponseLiaApp, estProprietaire, QUESTION_MAX } from '../../services/lia/contrat';
import { demanderLia } from '../../services/lia/client';

describe('[LIA-1253] contrat', () => {
    it('DemandeLia : accepte une question rognée et une page-chemin ; refuse vide, trop longue, URL complète', () => {
        expect(DemandeLia.parse({ question: '  Salut ?  ', page: '/#DEBT' })).toEqual({ question: 'Salut ?', page: '/#DEBT' });
        expect(DemandeLia.safeParse({ question: '   ' }).success).toBe(false);
        expect(DemandeLia.safeParse({ question: 'a'.repeat(QUESTION_MAX + 1) }).success).toBe(false);
        expect(DemandeLia.safeParse({ question: 'ok', page: 'https://x.example/' }).success).toBe(false);
    });

    it('ReponseLiaApp : texte obligatoire, humeur connue seulement, puces bornées', () => {
        expect(ReponseLiaApp.safeParse({ text: 'Bonjour', mood: 'joyeux', chips: [{ id: 'a', label: 'Oui' }] }).success).toBe(true);
        expect(ReponseLiaApp.safeParse({ text: '' }).success).toBe(false);
        expect(ReponseLiaApp.safeParse({ text: 'x', mood: 'inventee' }).success).toBe(false);
        expect(ReponseLiaApp.safeParse({ text: 'x', chips: Array.from({ length: 7 }, (_, i) => ({ id: String(i), label: 'l' })) }).success).toBe(false);
    });

    it('estProprietaire : insensible à la casse, faux sans variable ou vide', () => {
        expect(estProprietaire('Marc@Example.test', 'marc@example.test')).toBe(true);
        expect(estProprietaire('autre@example.test', 'marc@example.test')).toBe(false);
        expect(estProprietaire('marc@example.test', undefined)).toBe(false);
        expect(estProprietaire('', '')).toBe(false);
    });
});

describe('[LIA-1253] demanderLia (navigateur)', () => {
    const signal = new AbortController().signal;

    it('POST same-origin vers /api/lia/ask, sans jeton, et rend la réponse validée', async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ text: 'Voilà.', mood: 'calme' }), { status: 200 }));
        const r = await demanderLia('Salut ?', signal, { fetchImpl: fetchImpl as unknown as typeof fetch, page: '/#BUDGET' });
        expect(r).toEqual({ text: 'Voilà.', mood: 'calme' });
        const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('/api/lia/ask');
        expect(init.method).toBe('POST');
        expect(init.credentials).toBe('same-origin');
        expect(JSON.stringify(init.headers)).not.toMatch(/token/i);
        expect(JSON.parse(String(init.body))).toEqual({ question: 'Salut ?', page: '/#BUDGET' });
    });

    it.each([
        ['statut non-ok', () => new Response('{}', { status: 503 })],
        ['réponse non conforme', () => new Response(JSON.stringify({ text: '' }), { status: 200 })],
    ])('%s → rejet (jamais une réponse inventée)', async (_n, fabrique) => {
        const fetchImpl = vi.fn(async () => fabrique());
        await expect(demanderLia('Salut ?', signal, { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow(/LIA indisponible/);
    });
});
