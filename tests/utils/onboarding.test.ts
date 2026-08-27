import { describe, it, expect } from 'vitest';
import { shouldShowOnboarding, hasMeaningfulData } from '../../utils/onboarding';

describe('shouldShowOnboarding', () => {
    it('vrai 1er lancement (pas de flag, pas de données) → affiche', () => {
        expect(shouldShowOnboarding(null, false)).toBe(true);
    });
    it('onboarding déjà complété (flag posé) → n affiche pas', () => {
        expect(shouldShowOnboarding('true', false)).toBe(false);
    });
    it('données déjà présentes (restauration Drive) → n affiche pas même sans flag', () => {
        // Cas Marc : restore sur nouvel appareil / navigation privée → données mais pas de flag local.
        expect(shouldShowOnboarding(null, true)).toBe(false);
    });
    it('flag + données → n affiche pas', () => {
        expect(shouldShowOnboarding('true', true)).toBe(false);
    });
});

describe('shouldShowOnboarding — utilisateur de RETOUR via la sync (jamais l accueil)', () => {
    it('compte Drive déjà connecté sur cet appareil → n affiche pas (avant même le pull)', () => {
        expect(shouldShowOnboarding(null, false, { connectedBefore: true })).toBe(false);
    });
    it('connecté / pull en cours → n affiche pas', () => {
        expect(shouldShowOnboarding(null, false, { syncConnected: true })).toBe(false);
        expect(shouldShowOnboarding(null, false, { syncBusy: true })).toBe(false);
    });
    it('coffre chiffré en attente de passphrase → n affiche pas (le prompt passphrase prend la main)', () => {
        expect(shouldShowOnboarding(null, false, { needsPassphrase: true })).toBe(false);
    });
    it('aucun signal, aucune donnée, aucun flag → vrai 1er lancement → affiche', () => {
        expect(shouldShowOnboarding(null, false, {})).toBe(true);
    });
});

describe('hasMeaningfulData — reconnaît un PROFIL/retraite restauré (pas que transactions/actifs)', () => {
    it('vide : null / état par défaut frais', () => {
        expect(hasMeaningfulData(null)).toBe(false);
        expect(hasMeaningfulData({})).toBe(false);
        expect(hasMeaningfulData({ transactions: [], assets: [], config: { users: [{ name: '', netSalary: 0, grossSalary: 0 }] } })).toBe(false);
    });
    it('non-vide dès une transaction ou un actif', () => {
        expect(hasMeaningfulData({ transactions: [{ id: 't' }] })).toBe(true);
        expect(hasMeaningfulData({ assets: [{ id: 'a' }] })).toBe(true);
    });
    it('NON-vide si un profil est renseigné (nom ou salaire) — sans transactions (bug Marc)', () => {
        expect(hasMeaningfulData({ config: { users: [{ name: 'Marc', netSalary: 0, grossSalary: 0 }] } })).toBe(true);
        expect(hasMeaningfulData({ config: { users: [{ name: '', netSalary: 4000 }] } })).toBe(true);
        expect(hasMeaningfulData({ config: { users: [{ name: '', grossSalary: 5400 }] } })).toBe(true);
    });
    it('non-vide dès une dette / un événement de vie', () => {
        expect(hasMeaningfulData({ debts: [{ id: 'd' }] })).toBe(true);
        expect(hasMeaningfulData({ lifeEvents: [{ id: 'g' }] })).toBe(true);
    });
    it('liste canonique élargie : budget / voyages / assurances comptent aussi (alignée sur la sync)', () => {
        expect(hasMeaningfulData({ budgetItems: [{ id: 'b' }] })).toBe(true);
        expect(hasMeaningfulData({ travelGoals: [{ id: 't' }] })).toBe(true);
        expect(hasMeaningfulData({ insurancePolicies: [{ id: 'i' }] })).toBe(true);
    });
});
