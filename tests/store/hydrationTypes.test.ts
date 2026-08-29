// [BACKUP-SCHEMA-NON-TYPE] La garde de TYPE à la réhydratation du store.
//
// ⚠️ FICHIER SÉPARÉ de `hydrationNet.test.ts`, et pas par goût du rangement : `getHydrationStatus()`
// est MONOTONE — `onRehydrateStorage` pose `failed: true` et ne le remet jamais à `false` sur une
// réhydratation réussie. Dans un fichier qui contient déjà un cas d'échec, tout contrôle « sain »
// postérieur lit le statut du précédent et échoue sans rapport avec ce qu'il teste. L'isoler est la
// seule façon d'avoir un contrôle d'anti-vacuité qui mesure vraiment quelque chose.
//
// Le défaut lui-même est PRÉEXISTANT (le filet date de l'audit 2026-07-16) et il a un effet en
// PRODUCTION : `services/sync/syncPull.ts:97` appelle `persist.rehydrate()` après un pull Drive,
// donc restaurer une sauvegarde saine laisse la bannière « ne rien saisir, restaurer un backup »
// affichée alors que tout est réparé. Routé en `[STORE-HYDRATION-STATUS-MONOTONE]`, PAS corrigé ici
// (convention §6 : un bug préexistant se signale, il ne s'emporte pas dans le lot).
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/errorLogger', async (orig) => ({
    ...(await orig() as object),
    logError: vi.fn(),
}));

import { logError } from '../../services/errorLogger';
import { useFinanceStore, getHydrationStatus } from '../../store/useFinanceStore';

const STORE_KEY = 'financeai-storage';

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

