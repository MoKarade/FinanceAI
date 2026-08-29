// [BACKUP-SCHEMA-NON-TYPE] La garde de TYPE à la réhydratation du store.
//
// ⚠️ FICHIER SÉPARÉ de `hydrationNet.test.ts`, et pas par goût du rangement : `getHydrationStatus()`
// est MONOTONE — `onRehydrateStorage` pose `failed: true` et ne le remet jamais à `false` sur une
// réhydratation réussie. Dans un fichier qui contient déjà un cas d'échec, tout contrôle « sain »
// postérieur lit le statut du précédent et échoue sans rapport avec ce qu'il teste. L'isoler est la
// seule façon d'avoir un contrôle d'anti-vacuité qui mesure vraiment quelque chose.
//
// ⚠️ CETTE RAISON A VÉCU : `[STORE-HYDRATION-STATUS-MONOTONE]` est CORRIGÉ (lot 46) — une
// réhydratation réussie remet désormais le statut à sain, donc l'ordre des cas ne compte plus et la
// séparation n'est plus nécessaire. Le fichier reste tel quel : le refusionner serait un
// déplacement gratuit, et son premier `describe` teste précisément la réversibilité retrouvée.
// L'histoire est gardée parce qu'elle explique pourquoi deux fichiers couvrent la même mécanique.
//
// Le défaut était PRÉEXISTANT (le filet date de l'audit 2026-07-16) et son effet était réel en
// PRODUCTION : `services/sync/syncPull.ts:97` appelle `persist.rehydrate()` après un pull Drive,
// donc restaurer une sauvegarde saine laissait la bannière « ne rien saisir, restaurer un backup »
// affichée alors que tout était réparé.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/errorLogger', async (orig) => ({
    ...(await orig() as object),
    logError: vi.fn(),
}));

import { logError } from '../../services/errorLogger';
import { useFinanceStore, getHydrationStatus } from '../../store/useFinanceStore';

const STORE_KEY = 'financeai-storage';

describe('[STORE-HYDRATION-STATUS-MONOTONE] le statut redevient sain quand tout est réparé', () => {
    it('échec PUIS succès : la bannière « restaurer un backup » ne survit pas à la restauration', async () => {
        // ⚠️ LE SCÉNARIO RÉEL, pas une vue de l'esprit : `services/sync/syncPull.ts` appelle
        // `persist.rehydrate()` après un pull Drive. Marc voyait donc la bannière rester affichée
        // APRÈS avoir restauré une sauvegarde saine — le remède survivait à la guérison.
        vi.mocked(logError).mockClear();

        // 1. un blob illisible → le filet lève la bannière (contrôle : sans ça, l'étape 2 ne
        //    prouverait rien, elle lirait un statut jamais monté).
        localStorage.setItem(STORE_KEY, '{pas-du-json:::');
        await useFinanceStore.persist.rehydrate();
        expect(getHydrationStatus().failed, 'le blob corrompu doit d\'abord LEVER la bannière').toBe(true);

        // 2. la restauration écrit un blob sain et re-réhydrate — exactement ce que fait `syncPull`.
        localStorage.setItem(STORE_KEY, JSON.stringify({ state: { transactions: [] }, version: 7 }));
        await useFinanceStore.persist.rehydrate();

        // Discriminant : sur le code d'avant, `onRehydrateStorage` sortait sur `if (!error) return;`
        // sans jamais remettre le statut — celui-ci restait `failed` pour la durée du module.
        expect(getHydrationStatus().failed).toBe(false);
        expect(getHydrationStatus().error).toBeNull();

        localStorage.removeItem(STORE_KEY);
    });
});

describe('[BACKUP-SCHEMA-NON-TYPE] la garde de TYPE, sur le chemin de tous les jours', () => {
    it('le même blob avec un montant NUMÉRIQUE passe — anti-vacuité du cas suivant', async () => {
        vi.mocked(logError).mockClear();
        localStorage.setItem(STORE_KEY, JSON.stringify({
            state: { transactions: [], projection: { inflationRate: 2 } },
            version: 7,
        }));

        await useFinanceStore.persist.rehydrate();

        // Sans ce contrôle, un test qui échoue pour une raison étrangère au type (blob mal formé,
        // storage indisponible) donnerait exactement le même vert que le cas ci-dessous.
        expect(getHydrationStatus().failed).toBe(false);
        expect(logError).not.toHaveBeenCalled();
        localStorage.removeItem(STORE_KEY);
    });

    it('blob À JOUR (v7) portant un montant en TEXTE → refusé, journalisé, blob INTACT', async () => {
        vi.mocked(logError).mockClear();
        // ⚠️ `version: 7` — la version COURANTE. C'est tout l'intérêt du cas : zustand n'appelle
        // `migrate` QUE si la version diffère (vérifié dans `middleware.js`), donc ce blob-là — celui
        // que Marc a réellement sur son disque tous les jours — ne traverse aucune migration. Une
        // garde posée dans `migrate` aurait laissé passer exactement cet état ; celle-ci vit dans
        // `merge`, appelé à CHAQUE réhydratation.
        const blob = JSON.stringify({
            state: { transactions: [], projection: { inflationRate: '2' } },
            version: 7,
        });
        localStorage.setItem(STORE_KEY, blob);

        await useFinanceStore.persist.rehydrate();

        expect(getHydrationStatus().failed).toBe(true);
        expect(logError).toHaveBeenCalledWith(expect.objectContaining({
            severity: 'critical',
            source: 'storage',
        }));
        // Le blob n'est ni réparé ni écrasé : il reste disponible pour diagnostic et récupération.
        expect(localStorage.getItem(STORE_KEY)).toBe(blob);
        localStorage.removeItem(STORE_KEY);
    });
});

