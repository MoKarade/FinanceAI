// [STORE-REHYDRATE-SILENT, audit 2026-07-16] — le FILET de réhydratation Zustand.
// Avant : aucun `onRehydrateStorage` → un blob `financeai-storage` corrompu (ou une migration qui
// lève) était JETÉ par zustand (vérifié dans middleware.mjs) → app vierge au boot, zéro trace,
// indiscernable d'un premier lancement. Ces tests prouvent : (1) l'erreur est désormais journalisée
// en CRITIQUE + exposée via `getHydrationStatus()` (lu par App → toast « ne rien saisir ») ;
// (2) une migration qui lève identifie son PALIER (diagnostic) puis RELANCE (jamais de blob à
// moitié migré) ; (3) le blob reste INTACT dans localStorage (récupération possible).
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/errorLogger', async (orig) => ({
    ...(await orig() as object),
    logError: vi.fn(),
}));

import { logError } from '../../services/errorLogger';
import { useFinanceStore, getHydrationStatus, migratePersistedState } from '../../store/useFinanceStore';

const STORE_KEY = 'financeai-storage';

describe('filet de réhydratation (onRehydrateStorage + statut)', () => {
    it('blob VALIDE → réhydratation propre, statut sain (contrôle de non-vacuité)', async () => {
        localStorage.setItem(STORE_KEY, JSON.stringify({ state: { transactions: [] }, version: 7 }));
        await useFinanceStore.persist.rehydrate();
        expect(getHydrationStatus().failed).toBe(false);
        localStorage.removeItem(STORE_KEY);
    });

    it('blob CORROMPU (JSON illisible) → statut failed + logError CRITIQUE + blob INTACT', async () => {
        vi.mocked(logError).mockClear();
        const corrupted = '{pas-du-json:::';
        localStorage.setItem(STORE_KEY, corrupted);

        await useFinanceStore.persist.rehydrate();

        // Discriminant : sur l'ancien code (aucun onRehydrateStorage), l'erreur était jetée —
        // aucun statut, aucun log ; l'app démarrait vierge en silence.
        expect(getHydrationStatus().failed).toBe(true);
        expect(logError).toHaveBeenCalledWith(expect.objectContaining({
            severity: 'critical',
            source: 'storage',
            message: expect.stringMatching(/Réhydratation du store ÉCHOUÉE/),
        }));
        // Le blob n'est PAS écrasé/réparé : il reste disponible pour diagnostic/récupération.
        expect(localStorage.getItem(STORE_KEY)).toBe(corrupted);
        localStorage.removeItem(STORE_KEY);
    });
});

describe('migratePersistedState — diagnostic de palier + relance', () => {
    it('une migration qui LÈVE identifie le palier fautif (logError) puis RELANCE (jamais avalée)', () => {
        vi.mocked(logError).mockClear();
        // Blob v5 avec un asset null → le palier v5→v6 (purchases DCA) lève un TypeError.
        const blob = { assets: [null], apiKeys: { anthropic: '' } };

        expect(() => migratePersistedState(blob, 5)).toThrow();
        expect(logError).toHaveBeenCalledWith(expect.objectContaining({
            severity: 'critical',
            source: 'storage',
            message: expect.stringMatching(/palier « v5→v6/),
        }));
    });

    it('un blob sain traverse tous les paliers sans log ni throw', () => {
        vi.mocked(logError).mockClear();
        const out = migratePersistedState({ transactions: [], apiKeys: { anthropic: 'x' } }, 5) as Record<string, unknown>;
        expect(out.transactions).toEqual([]);
        expect(logError).not.toHaveBeenCalled();
    });
});

describe('câblage App.tsx — refs de toast INDÉPENDANTS (scan du source)', () => {
    // [Finding panel silent-failure, lot 2026-07-17] Un ref PARTAGÉ entre le toast de migration
    // legacy et le toast d'hydratation avalait le second quand les DEUX échouent ensemble
    // (localStorage inaccessible → les deux chemins tombent en même temps) : la branche migration
    // posait `migrationWarningShown.current = true` AVANT le check hydratation gaté sur le même ref.
    // Rendre App entier en test est trop lourd (LoginGate/providers) → on verrouille la structure
    // par scan du source, avec preuve de volume (leçon FISC-CONST-LINT : un scan vide protège zéro).
    it('la branche hydratation est gatée par SON ref, jamais par celui de la migration', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        // [GODFILE-APP] Le câblage des toasts a déménagé d'App.tsx vers hooks/useAppBootEffects.ts
        // (extraction telle quelle) — la garde suit le code, le FAIT défendu ne change pas.
        const src = readFileSync(resolve(process.cwd(), 'hooks/useAppBootEffects.ts'), 'utf-8');

        // Preuve de volume : les deux filets existent bien dans le hook de boot.
        expect(src).toContain('getMigrationStatus()');
        expect(src).toContain('getHydrationStatus()');

        // Deux refs distincts déclarés.
        expect(src).toMatch(/const migrationWarningShown = useRef\(false\)/);
        expect(src).toMatch(/const hydrationWarningShown = useRef\(false\)/);

        // Discriminant : la condition d'affichage du toast d'hydratation référence hydrationWarningShown
        // (l'ancien code — `hydration.failed && !migrationWarningShown.current` — échoue ici).
        expect(src).toMatch(/hydration\.failed && !hydrationWarningShown\.current/);
        expect(src).not.toMatch(/hydration\.failed && !migrationWarningShown\.current/);
    });
});
