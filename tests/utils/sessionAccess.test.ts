// [CF-ACCESS] Session Access expirée : la sonde reconnaît la redirection, ignore une panne réseau, et ne boucle pas.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { reponseDeSessionExpiree, verifierSession, surveillerSessionAccess } from '../../utils/sessionAccess';

const rep = (o: { type?: string; redirected?: boolean; status?: number }) => ({ type: 'basic', redirected: false, status: 200, ...o }) as Response;

describe('reponseDeSessionExpiree', () => {
    it('opaqueredirect, opaque, redirigée, statut 0 : expirée', () => {
        expect(reponseDeSessionExpiree({ type: 'opaqueredirect', status: 0 })).toBe(true);
        expect(reponseDeSessionExpiree({ type: 'opaque', status: 0 })).toBe(true);
        expect(reponseDeSessionExpiree({ type: 'basic', redirected: true, status: 200 })).toBe(true);
        expect(reponseDeSessionExpiree({ type: 'basic', status: 0 })).toBe(true);
    });
    it('réponse normale de notre origine : pas expirée', () => {
        expect(reponseDeSessionExpiree({ type: 'basic', redirected: false, status: 200 })).toBe(false);
    });
});

describe('verifierSession', () => {
    it('sonde sans donnée, sans suivre les redirections, sans cache', async () => {
        const f = vi.fn(async () => rep({}));
        expect(await verifierSession(f as unknown as typeof fetch)).toBe('ok');
        expect(f).toHaveBeenCalledWith('/icon.svg', expect.objectContaining({ redirect: 'manual', cache: 'no-store' }));
    });
    it('redirection reçue : expirée', async () => {
        expect(await verifierSession((async () => rep({ type: 'opaqueredirect', status: 0 })) as unknown as typeof fetch)).toBe('expiree');
    });
    it('réseau HS (fetch rejette) : « inconnu », PAS expirée (hors ligne ≠ déconnecté)', async () => {
        expect(await verifierSession((async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch)).toBe('inconnu');
    });
});

describe('surveillerSessionAccess', () => {
    beforeEach(() => { sessionStorage.clear(); });
    const visibilite = (etat: 'hidden' | 'visible') => {
        Object.defineProperty(document, 'visibilityState', { value: etat, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
    };
    const attendre = () => new Promise((r) => setTimeout(r, 0));

    it('retour dans l\'onglet après ≥ 1 min avec session expirée : recharge UNE fois', async () => {
        let t = 1_000_000;
        const recharger = vi.fn();
        const stop = surveillerSessionAccess({ fetchImpl: (async () => rep({ type: 'opaqueredirect', status: 0 })) as unknown as typeof fetch, recharger, maintenant: () => t });
        visibilite('hidden'); t += 120_000; visibilite('visible'); await attendre(); await attendre();
        expect(recharger).toHaveBeenCalledTimes(1);
        // Garde anti-boucle : le retour du réseau 5 s plus tard (session toujours expirée) ne recharge plus.
        t += 5_000; window.dispatchEvent(new Event('online')); await attendre(); await attendre();
        expect(recharger).toHaveBeenCalledTimes(1);
        stop();
    });
    it('absence courte (< 1 min) : aucune sonde', async () => {
        let t = 5_000_000;
        const f = vi.fn(async () => rep({}));
        const stop = surveillerSessionAccess({ fetchImpl: f as unknown as typeof fetch, recharger: vi.fn(), maintenant: () => t });
        visibilite('hidden'); t += 10_000; visibilite('visible'); await attendre();
        expect(f).not.toHaveBeenCalled();
        stop();
    });
    it('session valide : jamais de rechargement', async () => {
        let t = 9_000_000;
        const recharger = vi.fn();
        const stop = surveillerSessionAccess({ fetchImpl: (async () => rep({})) as unknown as typeof fetch, recharger, maintenant: () => t });
        visibilite('hidden'); t += 300_000; visibilite('visible'); await attendre(); await attendre();
        expect(recharger).not.toHaveBeenCalled();
        stop();
    });
    it('le nettoyage retire les écouteurs', async () => {
        const f = vi.fn(async () => rep({}));
        let t = 1;
        const stop = surveillerSessionAccess({ fetchImpl: f as unknown as typeof fetch, recharger: vi.fn(), maintenant: () => t });
        stop();
        visibilite('hidden'); t += 500_000; visibilite('visible'); await attendre();
        expect(f).not.toHaveBeenCalled();
    });
});
