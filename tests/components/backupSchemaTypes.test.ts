// [BACKUP-SCHEMA-NON-TYPE] Le schéma de restauration refuse un montant en texte.
//
// ⚠️ Le vecteur : `BackupPanel` validait les conteneurs money-critical en `z.unknown()` /
// `z.array(z.unknown())`, donc une valeur restaurée pouvait revenir en CHAÎNE dans un champ
// monétaire. Mesuré : une chaîne dans un montant de projet immobilier fait −52 % de patrimoine
// final, sans qu'aucune valeur non finie n'apparaisse nulle part.
//
// ⚠️ Ce que ce lot NE resserre PAS : la tolérance de FORME. Le fichier dit « on préfère accepter
// large plutôt que rejeter un backup légitime », et ça reste vrai — un enregistrement qui a évolué,
// des champs inconnus, passent comme avant. Les deux derniers tests le prouvent, sans quoi rien ne
// distinguerait « j'ai ajouté une règle de type » de « j'ai rendu le schéma strict ».
import { describe, it, expect } from 'vitest';
import { BackupSchema } from '../../components/settings/BackupPanel';

const backupMinimal = (extra: Record<string, unknown> = {}) => ({
    version: '3.2',
    timestamp: 1_700_000_000_000,
    transactions: [],
    ...extra,
});

describe('[BACKUP-SCHEMA-NON-TYPE] restauration : le TYPE des montants', () => {
    it('REFUSE un montant en texte dans un conteneur validé en `z.unknown()`', () => {
        const r = BackupSchema.safeParse(backupMinimal({
            realEstateGoals: [{ id: 'g1', name: 'Maison', totalClosingCosts: '15000' }],
        }));
        expect(r.success).toBe(false);
        if (r.success) return;
        expect(r.error.issues[0].message).toContain('totalClosingCosts');
        // Le message est celui montré à l'utilisateur : jamais un chemin technique.
        expect(r.error.issues[0].message).not.toContain('realEstateGoals.0');
    });

    it('REFUSE aussi une dette et un poste de budget en texte', () => {
        for (const [nom, extra] of [
            ['dette', { debts: [{ id: 'd1', name: 'Auto', balance: '10000' }] }],
            ['budget', { budgetItems: [{ name: 'Épicerie', target: '800' }] }],
        ] as const) {
            const r = BackupSchema.safeParse(backupMinimal(extra));
            expect(r.success, nom).toBe(false);
        }
    });

    it('ACCEPTE les mêmes montants en nombre — anti-vacuité', () => {
        const r = BackupSchema.safeParse(backupMinimal({
            realEstateGoals: [{ id: 'g1', name: 'Maison', totalClosingCosts: 15000 }],
            debts: [{ id: 'd1', name: 'Auto', balance: 10000 }],
            budgetItems: [{ name: 'Épicerie', target: 800 }],
        }));
        expect(r.success).toBe(true);
    });

    it('ACCEPTE un enregistrement ÉVOLUÉ dont les champs ajoutés sont NUMÉRIQUES', () => {
        const r = BackupSchema.safeParse(backupMinimal({
            debts: [{ id: 'd1', name: 'Auto', balance: 10000, fraisAjoutesParUneVersionFuture: 12 }],
        }));
        expect(r.success).toBe(true);
    });

    it('⚠️ REFUSE en revanche un champ TEXTE inconnu — la limite assumée de cette garde', () => {
        // ⚠️ À DIRE PLUTÔT QU'À TAIRE. La note « Tier 🟡 » du schéma justifie `z.unknown()` par « ne
        // pas rejeter un backup légitime dont un enregistrement a évolué ». Lister les champs TEXTE
        // resserre cette tolérance dans UN cas : une chaîne sous une clé que l'app ne connaît pas
        // encore. Un backup produit par une version PLUS RÉCENTE, portant un nouveau champ textuel,
        // serait refusé.
        //
        // Pourquoi c'est accepté ici : (1) le risque suppose de restaurer un fichier plus récent que
        // l'app qui le lit — l'inverse du cas courant ; (2) tout champ texte ajouté au produit entre
        // dans `types.ts`, et le canari de `verifierTypesRestaures.test.ts` rougit alors en CI avant
        // d'atteindre qui que ce soit ; (3) l'alternative — lister les champs NUMÉRIQUES — échoue
        // dans l'autre sens, en silence, sur le money-critical. C'est l'arbitrage tranché par Marc.
        // Routé en `[BACKUP-TEXTE-INCONNU-REFUSE]` pour être revu si le cas se présente.
        const r = BackupSchema.safeParse(backupMinimal({
            debts: [{ id: 'd1', name: 'Auto', balance: 10000, champInventeParUneVersionFuture: 'oui' }],
        }));
        expect(r.success).toBe(false);
    });

    it('ACCEPTE un champ TEXTE légitime là où il est attendu', () => {
        const r = BackupSchema.safeParse(backupMinimal({
            transactions: [{ id: 't1', date: '2026-01-01', payee: 'Épicier', amount: -42, category: 'Épicerie' }],
        }));
        expect(r.success).toBe(true);
    });
});
