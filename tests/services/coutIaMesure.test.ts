/**
 * @vitest-environment jsdom
 *
 * [COUT-IA-MESURE] (FinanceAI#50) — le coût publié au hub (`usage.cost`, cumul à vie
 * `aiChatCostUsdTotal`) n'avait plus d'écrivain depuis le retrait de l'ancien chat : figé à 0 $
 * pendant que catégorisation, Planning, Impôts et lecture de talon coûtaient de vrais dollars.
 * Il est maintenant mesuré AU POINT DE CONTACT SDK.
 *
 * Trois étages :
 *  1. le module pur (`services/aiChat/coutIa.ts`) : tokens → coût, jamais un coût fabriqué ;
 *  2. le comportement réel : `chat` (SDK simulé) fait grossir le cumul du store, du bon montant ;
 *  3. la GARDE : chaque site `messages.(create|stream)(` de `services/claude.ts` signale son usage —
 *     un nouveau site muet rougit, sans liste écrite à la main.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../helpers/source';

const sdk = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({
    default: class {
        messages = { create: sdk.create };
    },
}));

import { brancherCoutIa, signalerUsageIa, usageDepuisSdk } from '../../services/aiChat/coutIa';
import { chat } from '../../services/claude';
import { useFinanceStore } from '../../store/useFinanceStore';

describe('usageDepuisSdk — tokens du SDK', () => {
    it('absent → null (jamais un 0 inventé)', () => {
        expect(usageDepuisSdk(undefined)).toBeNull();
        expect(usageDepuisSdk(null)).toBeNull();
    });

    it('champs de cache absents ou non finis → 0, jamais NaN', () => {
        expect(usageDepuisSdk({ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: null }))
            .toEqual({ inputTokens: 10, outputTokens: 5, cacheWriteTokens: 0, cacheReadTokens: 0 });
        expect(usageDepuisSdk({ input_tokens: Number.NaN, output_tokens: -3 }))
            .toEqual({ inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 });
    });
});

describe('signalerUsageIa — coût signalé à l\'abonné', () => {
    let debrancher: () => void;
    const recu: number[] = [];
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        recu.length = 0;
        debrancher = brancherCoutIa((c) => { recu.push(c); });
        warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => {
        debrancher();
        warn.mockRestore();
    });

    it('Sonnet 5.5 : 1 M tokens d\'entrée + 1 M de sortie = 2 $ + 10 $ = 12 $ exactement', () => {
        signalerUsageIa('claude-sonnet-5-5', { input_tokens: 1_000_000, output_tokens: 1_000_000 });
        expect(recu).toEqual([12]);
    });

    it('lecture et écriture de cache comptées au tarif du modèle (Sonnet : lecture ×0,05, écriture ×1,25)', () => {
        signalerUsageIa('claude-sonnet-5-5', { cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 });
        expect(recu[0]).toBeCloseTo(2 * 0.05 + 2 * 1.25, 10);
    });

    it('modèle sans tarif : rien n\'est cumulé, la trace le dit', () => {
        signalerUsageIa('claude-inconnu-9', { input_tokens: 5000, output_tokens: 5000 });
        expect(recu).toEqual([]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('claude-inconnu-9'));
    });

    it('réponse sans usage : rien n\'est cumulé, la trace le dit', () => {
        signalerUsageIa('claude-haiku-5-5', undefined);
        expect(recu).toEqual([]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('sans usage'));
    });

    it('usage tout à zéro : aucun appel à l\'abonné (pas de 0 cumulé pour rien)', () => {
        signalerUsageIa('claude-haiku-5-5', { input_tokens: 0, output_tokens: 0 });
        expect(recu).toEqual([]);
    });

    it('un abonné qui plante n\'interrompt pas l\'appel Claude payé : l\'échec est journalisé, pas avalé', () => {
        debrancher();
        debrancher = brancherCoutIa(() => { throw new Error('boum'); });
        const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(() => signalerUsageIa('claude-haiku-5-5', { input_tokens: 1000 })).not.toThrow();
        expect(err).toHaveBeenCalled();
        err.mockRestore();
    });
});

describe('chat — le cumul du store grossit du coût réel', () => {
    beforeEach(() => {
        sdk.create.mockReset();
        useFinanceStore.getState().setAppState({ aiChatCostUsdTotal: 1 });
    });

    it('Haiku 5.5, 100 000 tokens d\'entrée + 10 000 de sortie : +0,015 $ ajoutés au cumul existant', async () => {
        sdk.create.mockResolvedValue({
            content: [{ type: 'text', text: 'ok' }],
            usage: { input_tokens: 100_000, output_tokens: 10_000 },
        });
        const texte = await chat([{ role: 'user', content: 'salut' }], 'sk-test', { model: 'claude-haiku-5-5' });
        expect(texte).toBe('ok');
        // 100 000 × 0,10 $/M + 10 000 × 0,50 $/M = 0,01 + 0,005
        expect(useFinanceStore.getState().aiChatCostUsdTotal).toBeCloseTo(1.015, 10);
    });

    it('réponse sans usage : le cumul ne bouge pas (pas de coût fabriqué)', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        sdk.create.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
        await chat([{ role: 'user', content: 'salut' }], 'sk-test', { model: 'claude-haiku-5-5' });
        expect(useFinanceStore.getState().aiChatCostUsdTotal).toBe(1);
        warn.mockRestore();
    });
});

describe('garde — chaque site SDK de services/claude.ts signale son usage', () => {
    const source = stripComments(readFileSync(resolve(__dirname, '../../services/claude.ts'), 'utf-8'));
    const sitesSdk = (source.match(/\bmessages\.(create|stream)\(/g) ?? []).length;
    const signalements = (source.match(/\bsignalerUsageIa\(/g) ?? []).length;

    it('il y a des sites SDK à garder (la regex ne s\'est pas vidée en silence)', () => {
        expect(sitesSdk).toBeGreaterThanOrEqual(4);
    });

    it('autant de signalements que de sites : un nouveau site muet rougit', () => {
        expect(signalements).toBe(sitesSdk);
    });
});
