// tests/mcp/freshness.test.ts
//
// [MCP-STALE-FRESHNESS] — le connecteur sert la copie Drive : si l'app n'a pas poussé récemment,
// Claude doit le SAVOIR (incident 2026-07-14 : le MCP affirmait 5 732 $ pendant que l'app locale
// portait 160 k$+ jamais poussés). On teste : le registre, la note (info vs avertissement), et
// l'apposition automatique par withState sur les réponses des tools data-aware.

import { describe, it, expect, afterEach } from 'vitest';
import {
    setStateFreshness,
    getStateFreshness,
    freshnessNotice,
    STALE_THRESHOLD_MS,
} from '../../mcp/state/freshness';
import { withState, jsonContent } from '../../mcp/tools/_dataAware';
import { buildDefaultAppState } from '../../mcp/state/loadAppState';

// Registre module-level → toujours le réinitialiser (sinon fuite inter-tests/inter-fichiers).
afterEach(() => setStateFreshness({ updatedAt: null, source: null }));

describe('freshness — registre + note', () => {
    it('sans horodatage (source fixture/fichier) → aucune note', () => {
        expect(freshnessNotice()).toBeNull();
        expect(getStateFreshness().updatedAt).toBeNull();
    });

    it('blob récent → note informative avec la date, SANS avertissement', () => {
        const now = 1_800_000_000_000;
        setStateFreshness({ updatedAt: now - 5 * 60_000, source: 'Google Drive' });
        const note = freshnessNotice(now);
        expect(note).toMatch(/Données synchronisées le .+ \(il y a 5 min, source : Google Drive\)/);
        expect(note).not.toContain('⚠️');
    });

    it('blob PÉRIMÉ (au-delà du seuil) → AVERTISSEMENT actionnable (ouvrir l\'app pour pousser)', () => {
        const now = 1_800_000_000_000;
        setStateFreshness({ updatedAt: now - (STALE_THRESHOLD_MS + 60_000), source: 'Google Drive' });
        const note = freshnessNotice(now);
        expect(note).toContain('⚠️');
        expect(note).toMatch(/PÉRIMÉES/);
        expect(note).toMatch(/ouvrir l'app FinanceAI/);
    });
});

describe('freshness — apposée par withState sur chaque réponse de tool', () => {
    const getState = async () => buildDefaultAppState();

    it('fraîcheur publiée → la réponse gagne un 2e bloc texte (le JSON du 1er bloc reste intact)', async () => {
        setStateFreshness({ updatedAt: Date.now() - 60_000, source: 'Google Drive' });
        const res = await withState(getState, () => jsonContent({ ok: true }));
        expect(res.isError).toBeFalsy();
        expect(JSON.parse(res.content[0].text)).toEqual({ ok: true }); // payload inchangé
        expect(res.content).toHaveLength(2);
        expect(res.content[1].text).toMatch(/Données synchronisées/);
    });

    it('pas de fraîcheur (fixture) → réponse INCHANGÉE (1 seul bloc) — zéro régression des tools existants', async () => {
        const res = await withState(getState, () => jsonContent({ ok: true }));
        expect(res.content).toHaveLength(1);
    });
});
