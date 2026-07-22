// tests/services/inactivityLogout.test.ts
//
// [AUTH-DRIVE-INACTIVITY] Déconnexion auto après 8h d'inactivité : horodatage persisté (throttlé),
// seuil pur, et minuteur qui déclenche onExpire.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    recordActivity, getLastActivityAt, isInactivityExpired, clearActivity,
    startInactivityWatch, INACTIVITY_LIMIT_MS,
} from '../../services/sync/inactivityLogout';

beforeEach(() => {
    localStorage.clear();
    clearActivity(); // remet _lastWrite (throttle module-level) à 0
});

describe('inactivityLogout — horodatage & seuil (purs)', () => {
    it('recordActivity persiste l\'horodatage, getLastActivityAt le relit', () => {
        recordActivity(1_000_000);
        expect(getLastActivityAt()).toBe(1_000_000);
    });

    it('écriture THROTTLÉE : deux appels < 60s → seul le premier persiste', () => {
        recordActivity(1_000_000);
        recordActivity(1_030_000); // +30s < throttle 60s → no-op
        expect(getLastActivityAt()).toBe(1_000_000);
        recordActivity(1_070_000); // +70s ≥ throttle → écrit
        expect(getLastActivityAt()).toBe(1_070_000);
    });

    it('isInactivityExpired : jamais enregistré → false (pas d\'expiration spontanée)', () => {
        expect(getLastActivityAt()).toBeNull();
        expect(isInactivityExpired(Date.now())).toBe(false);
    });

    it('isInactivityExpired : true SEULEMENT au-delà du seuil (borne exacte)', () => {
        const t0 = 5_000_000;
        recordActivity(t0);
        expect(isInactivityExpired(t0 + INACTIVITY_LIMIT_MS - 1)).toBe(false);
        expect(isInactivityExpired(t0 + INACTIVITY_LIMIT_MS)).toBe(true);
    });

    it('clearActivity efface l\'horodatage', () => {
        recordActivity(1_000_000);
        clearActivity();
        expect(getLastActivityAt()).toBeNull();
    });
});

describe('inactivityLogout — minuteur (startInactivityWatch)', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('déclenche onExpire après 8h sans activité (à partir de la dernière activité RÉELLE)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(10_000_000));
        recordActivity(); // simule une connexion / interaction (l'horloge part d'ici, PAS du montage)
        const onExpire = vi.fn();
        const stop = startInactivityWatch(onExpire);
        expect(onExpire).not.toHaveBeenCalled();
        vi.advanceTimersByTime(INACTIVITY_LIMIT_MS - 1);
        expect(onExpire).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1); // atteint le seuil
        expect(onExpire).toHaveBeenCalledTimes(1);
        stop();
    });

    it('une activité repousse le déclenchement (le compte à rebours redémarre)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(20_000_000));
        recordActivity();
        const onExpire = vi.fn();
        const stop = startInactivityWatch(onExpire);
        // À 7h, on simule une activité (dispatch d'un événement écouté).
        vi.advanceTimersByTime(7 * 3600_000);
        document.dispatchEvent(new Event('keydown'));
        // 1h30 plus tard (8h30 depuis le début, mais seulement 1h30 depuis l'activité) → PAS encore expiré.
        vi.advanceTimersByTime(90 * 60_000);
        expect(onExpire).not.toHaveBeenCalled();
        // Encore 6h30 sans activité → 8h depuis la dernière activité → expire.
        vi.advanceTimersByTime(INACTIVITY_LIMIT_MS - 90 * 60_000);
        expect(onExpire).toHaveBeenCalledTimes(1);
        stop();
    });

    it('[Finding panel] onglet GELÉ > 8h (minuteur jamais tiré) → l\'activité au retour DÉCLENCHE la déconnexion (pas de réarmement silencieux)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(40_000_000));
        recordActivity(); // dernière activité réelle à T0
        const onExpire = vi.fn();
        const stop = startInactivityWatch(onExpire);
        // Simule un onglet gelé par le navigateur : l'HORLOGE avance de 9h mais les timers vitest NE
        // sont PAS avancés (le setTimeout n'a jamais pu s'exécuter). Puis l'utilisateur revient.
        vi.setSystemTime(new Date(40_000_000 + 9 * 3600_000));
        document.dispatchEvent(new Event('keydown'));
        expect(onExpire).toHaveBeenCalledTimes(1); // vérif d'expiration AVANT de réenregistrer l'activité
        stop();
    });

    it('[Finding panel CRITIQUE] le montage NE réarme PAS l\'horloge : une activité vieille de 8h+ reste expirée au démarrage du watch', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(50_000_000));
        recordActivity(); // activité réelle à T0
        vi.setSystemTime(new Date(50_000_000 + INACTIVITY_LIMIT_MS + 1000)); // >8h plus tard
        const onExpire = vi.fn();
        // Démarrer le watch NE doit pas remettre l'horloge à « maintenant » (sinon reload = reset).
        const stop = startInactivityWatch(onExpire);
        expect(isInactivityExpired()).toBe(true); // toujours expiré malgré le montage
        vi.advanceTimersByTime(1); // le timer planifié à delay 0 tire immédiatement
        expect(onExpire).toHaveBeenCalledTimes(1);
        stop();
    });

    it('stop() détache les écouteurs et annule le minuteur', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(30_000_000));
        recordActivity();
        const onExpire = vi.fn();
        const stop = startInactivityWatch(onExpire);
        stop();
        vi.advanceTimersByTime(INACTIVITY_LIMIT_MS + 1);
        expect(onExpire).not.toHaveBeenCalled();
    });
});
