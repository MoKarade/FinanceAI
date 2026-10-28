/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    markBackupDone,
    getLastBackupDate,
    computeBackupNagStatus,
} from '../../services/backupReminder';

beforeEach(() => {
    localStorage.clear();
});

describe('markBackupDone / getLastBackupDate', () => {
    it('retourne null avant tout backup', () => {
        expect(getLastBackupDate()).toBeNull();
    });

    it('enregistre une date proche de maintenant', () => {
        const before = Date.now();
        markBackupDone();
        const after = Date.now();
        const saved = getLastBackupDate();
        expect(saved).not.toBeNull();
        expect(saved!.getTime()).toBeGreaterThanOrEqual(before);
        expect(saved!.getTime()).toBeLessThanOrEqual(after);
    });

    it('retourne null si la valeur stockee est corrompue', () => {
        localStorage.setItem('lastBackupAt', 'not-a-date');
        expect(getLastBackupDate()).toBeNull();
    });
});

describe('computeBackupNagStatus - mode test / pas de donnees', () => {
    it('shouldShow=false si isTestMode=true meme avec donnees', () => {
        const status = computeBackupNagStatus(true, true);
        expect(status.shouldShow).toBe(false);
    });

    it('shouldShow=false si hasUserData=false', () => {
        const status = computeBackupNagStatus(false, false);
        expect(status.shouldShow).toBe(false);
    });

    it('shouldShow=false si isTestMode=true et hasUserData=false', () => {
        const status = computeBackupNagStatus(false, true);
        expect(status.shouldShow).toBe(false);
    });
});

describe('computeBackupNagStatus - jamais de backup', () => {
    it('shouldShow=true si hasData=true et aucun backup jamais fait', () => {
        const status = computeBackupNagStatus(true, false);
        expect(status.shouldShow).toBe(true);
        expect(status.lastBackupAt).toBeNull();
        expect(status.daysSinceLast).toBeNull();
    });
});

describe('computeBackupNagStatus - backup recent', () => {
    it('shouldShow=false si backup fait il y a moins de 14 jours', () => {
        markBackupDone();
        const now = Date.now() + 13 * 24 * 60 * 60 * 1000; // +13 jours
        const status = computeBackupNagStatus(true, false, now);
        expect(status.shouldShow).toBe(false);
        expect(status.daysSinceLast).not.toBeNull();
        expect(status.daysSinceLast!).toBeLessThan(14);
    });

    it('shouldShow=false si backup fait exactement il y a 14 jours moins 1 ms', () => {
        markBackupDone();
        const now = Date.now() + 14 * 24 * 60 * 60 * 1000 - 1;
        const status = computeBackupNagStatus(true, false, now);
        expect(status.shouldShow).toBe(false);
    });
});

describe('computeBackupNagStatus - backup ancien', () => {
    it('shouldShow=true si backup fait il y a plus de 14 jours', () => {
        markBackupDone();
        const now = Date.now() + 15 * 24 * 60 * 60 * 1000; // +15 jours
        const status = computeBackupNagStatus(true, false, now);
        expect(status.shouldShow).toBe(true);
        expect(status.daysSinceLast).toBeGreaterThan(14);
    });

    it('daysSinceLast est calcule correctement pour 30 jours', () => {
        markBackupDone();
        const now = Date.now() + 30 * 24 * 60 * 60 * 1000;
        const status = computeBackupNagStatus(true, false, now);
        expect(Math.floor(status.daysSinceLast!)).toBe(30);
    });

    it('lastBackupAt est une Date quand un backup existe', () => {
        markBackupDone();
        const now = Date.now() + 20 * 24 * 60 * 60 * 1000;
        const status = computeBackupNagStatus(true, false, now);
        expect(status.lastBackupAt).toBeInstanceOf(Date);
    });
});
