import { describe, it, expect, beforeEach, vi } from 'vitest';

// passphraseStore = LE secret zéro-knowledge (D-3). On verrouille son contrat de sécurité :
//   - jamais dans localStorage (qui survit à la fermeture du navigateur) ;
//   - présent dans sessionStorage (survit à un reload de page, effacé à la fermeture de l'onglet) ;
//   - get/set/clear cohérents, y compris réhydratation depuis sessionStorage (cas d'un F5).
// Le module garde un état mémoire ; on l'isole via un import dynamique (resetModules) par test.

const SESSION_KEY = 'financeai:sync:passphrase:v1';
const PASS = 'ma-passphrase-secrete-2026'; // ≥ 12 caractères

async function freshModule() {
    // Réinitialise le cache de modules → état mémoire neuf à chaque import (isolation du singleton).
    vi.resetModules();
    return import('../../services/sync/passphraseStore');
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
});

describe('passphraseStore — contrat de base', () => {
    it('aucune passphrase au départ', async () => {
        const m = await freshModule();
        expect(m.getPassphrase()).toBeNull();
        expect(m.hasPassphrase()).toBe(false);
    });

    it('set → get redonne la valeur, hasPassphrase devient vrai', async () => {
        const m = await freshModule();
        m.setPassphrase(PASS);
        expect(m.getPassphrase()).toBe(PASS);
        expect(m.hasPassphrase()).toBe(true);
    });

    it('clear → revient à null', async () => {
        const m = await freshModule();
        m.setPassphrase(PASS);
        m.clearPassphrase();
        expect(m.getPassphrase()).toBeNull();
        expect(m.hasPassphrase()).toBe(false);
    });
});

describe('passphraseStore — propriétés de sécurité du stockage', () => {
    it('écrit dans sessionStorage (survit à un reload de page)', async () => {
        const m = await freshModule();
        m.setPassphrase(PASS);
        expect(sessionStorage.getItem(SESSION_KEY)).toBe(PASS);
    });

    it("n'écrit JAMAIS dans localStorage (ne survit pas à la fermeture du navigateur)", async () => {
        const m = await freshModule();
        m.setPassphrase(PASS);
        // Aucune clé de localStorage ne doit contenir la passphrase.
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i)!;
            expect(localStorage.getItem(k)).not.toContain(PASS);
        }
        expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    });

    it('clear vide aussi sessionStorage', async () => {
        const m = await freshModule();
        m.setPassphrase(PASS);
        m.clearPassphrase();
        expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    });

    it('réhydrate depuis sessionStorage si la mémoire est neuve (simule un reload de page)', async () => {
        // Onglet A : on pose la passphrase en sessionStorage directement (comme si elle survivait au F5).
        sessionStorage.setItem(SESSION_KEY, PASS);
        // Nouveau module = mémoire vide → premier getPassphrase doit relire sessionStorage.
        const m = await freshModule();
        expect(m.getPassphrase()).toBe(PASS);
        expect(m.hasPassphrase()).toBe(true);
    });
});
