/**
 * [FINTABLE-EXTERNAL-MEMO-PISTE-DEVISE] Les VALEURS des champs hors contrat — à l'écran, et NULLE
 * PART AILLEURS.
 *
 * L'inventaire livré par `[FINTABLE-DECODEUR-CHAMPS-INCONNUS]` nomme les champs que l'API envoie et
 * que le décodeur jette. Un NOM dit qu'un champ existe ; seule une VALEUR dit s'il sert. La question
 * restée sans réponse pendant que 44 montants étaient faux : « l'API dit-elle la devise RÉELLE
 * quelque part ? » — aucun des 5 champs ne s'appelle `currency`, mais `external_memo` est du texte
 * libre.
 *
 * ⚠️⚠️ La contrainte qui gouverne TOUT ce fichier : ces valeurs ne doivent atteindre QUE l'écran de
 * Marc. Le rapport de synchro est rendu sans gate de mode discret ET `cat`é en clair dans les
 * journaux GitHub Actions d'un dépôt PUBLIC — un mémo bancaire peut porter un nom, un numéro de
 * chèque, une adresse. Décision de Marc (2026-09-16) : « oui, à l'écran seulement ».
 * La séparation est VÉRIFIÉE ici, jamais laissée à la vigilance
 * (`UN-COMMENTAIRE-QUI-RECLAME-DE-LA-VIGILANCE-EST-UNE-SOURCE-UNIQUE-MANQUANTE`).
 */
vi.mock('../../../services/errorLogger', () => ({ logError: vi.fn(), logErrorThrottled: vi.fn() }));

import { describe, it, expect, vi } from 'vitest';
import { echantillonsClesInconnues, MAX_CLES_CITEES } from '../../../services/fintable/decode';
import { runFintableBrowserSync } from '../../../services/fintable/browserSync';
import { runFintableSync } from '../../../mcp/runFintableSync';
import type { FintableClient } from '../../../services/fintable/client';
import type { StateStore } from '../../../mcp/state/stateStore';
import type { AppState } from '../../../types';

/** Valeur TÉMOIN : aucun autre champ du rapport ne peut la produire par hasard. */
const MEMO_TEMOIN = 'USD 4.40 @ 1.3712 — MARC TREMBLAY 4519';

const brut = (over: Record<string, unknown> = {}) => ({
    id: 'tx_1', account_id: 'acc_1', date: '2026-09-15', amount: '-4.40', currency: 'CAD',
    description: 'A.SAILY', merchant: null, category: null, updated_at: null,
    ...over,
});

// ── 1. La fonction pure ────────────────────────────────────────────────────────────────────────

describe('echantillonsClesInconnues', () => {
    it('rend la VALEUR des champs hors contrat, pas seulement leur nom', () => {
        const out = echantillonsClesInconnues([brut({ external_memo: MEMO_TEMOIN })]);
        expect(out).toEqual([{ cle: 'external_memo', exemples: [MEMO_TEMOIN.slice(0, 48)] }]);
    });

    it('ne rend RIEN pour un champ déclaré : c\'est l\'inconnu qu\'on inventorie', () => {
        // ANTI-VACUITÉ de tous les cas ci-dessus : sans ça, une fonction qui rend toujours `[]`
        // passerait le premier test si le champ témoin devenait déclaré.
        expect(echantillonsClesInconnues([brut()])).toEqual([]);
    });

    it('TRONQUE une valeur longue — un mémo peut porter une adresse entière', () => {
        const long = 'x'.repeat(300);
        const [e] = echantillonsClesInconnues([brut({ external_memo: long })]);
        expect(e.exemples[0].length).toBeLessThanOrEqual(49); // 48 + le caractère de troncature
        expect(e.exemples[0].endsWith('…')).toBe(true);
    });

    it('BORNE le nombre d\'exemples par clé : deux suffisent à voir un FORMAT', () => {
        const raws = Array.from({ length: 20 }, (_, i) => brut({ id: `tx_${i}`, external_memo: `memo ${i}` }));
        const [e] = echantillonsClesInconnues(raws);
        expect(e.exemples).toHaveLength(2);
    });

    it('BORNE le nombre de clés ET ANNONCE la troncature — jamais en silence', () => {
        // ⚠️ [revue panel] « Borné » et « tronqué en silence » sont indiscernables sans ce compte.
        // Le risque est concret : l'ordre est ALPHABÉTIQUE, donc si le champ qui porte la devise
        // tombait au-delà du 12ᵉ, Marc ne le verrait pas — et rien ne le lui dirait.
        const trop: Record<string, unknown> = {};
        for (let i = 0; i < MAX_CLES_CITEES + 5; i++) trop[`inconnu_${String(i).padStart(2, '0')}`] = `v${i}`;
        const out = echantillonsClesInconnues([brut(trop)]);

        const cites = out.filter((e) => e.exemples.length > 0);
        expect(cites).toHaveLength(MAX_CLES_CITEES);
        // La sentinelle porte le COMPTE de ce qui manque, et aucune valeur.
        const sentinelle = out.find((e) => e.exemples.length === 0);
        expect(sentinelle?.cle).toBe('(+ 5 autre(s) non cité(s))');
    });

    it('PAS de sentinelle quand rien n\'est tronqué — elle affirmerait une perte inexistante', () => {
        // Contrôle négatif : sans lui, une sentinelle posée systématiquement passerait le test
        // ci-dessus et mentirait dans le cas NORMAL, qui est celui que Marc voit tous les jours.
        const out = echantillonsClesInconnues([brut({ external_memo: MEMO_TEMOIN })]);
        expect(out.every((e) => e.exemples.length > 0)).toBe(true);
        expect(out.some((e) => e.cle.includes('autre(s)'))).toBe(false);
    });

    it('ignore `null`, `undefined` et le vide : les citer ferait croire à un champ REMPLI', () => {
        const out = echantillonsClesInconnues([brut({ check_num: null, ext_id: undefined, external_memo: '   ' })]);
        expect(out).toEqual([]);
    });

    it('déduplique : vingt lignes au même mémo ne prouvent pas deux formats', () => {
        const raws = Array.from({ length: 20 }, (_, i) => brut({ id: `tx_${i}`, external_memo: 'IDEM' }));
        expect(echantillonsClesInconnues(raws)[0].exemples).toEqual(['IDEM']);
    });
});

// ── 2. LA garde de vie privée : où ces valeurs ont le droit d'arriver ───────────────────────────

function clientFake(): FintableClient {
    return {
        get: async (chemin: string) => {
            if (chemin.startsWith('/accounts')) {
                return { data: [{ id: 'acc_1', connection_id: 'c', name: 'Carte', type: 'credit', currency: 'CAD', balance: '-100', cash_balance: null, debt: null }] };
            }
            return { data: [] };
        },
        getAllPages: async () => [brut({ external_memo: MEMO_TEMOIN })],
    } as unknown as FintableClient;
}

const ETAT = {
    transactions: [], debts: [], assets: [],
    fintableRoles: { acc_1: { kind: 'debt', debtName: '' } },
} as unknown as AppState;

describe('la valeur atteint l\'ÉCRAN, et jamais le rapport', () => {
    it('navigateur : l\'échantillon est RENDU à l\'appelant', async () => {
        const r = await runFintableBrowserSync(ETAT, 'jeton', {
            client: clientFake(), now: () => Date.parse('2026-09-16T12:00:00Z'),
        });
        const memo = r.echantillonsChampsInconnus.find((e) => e.cle === 'external_memo');
        expect(memo).toBeDefined();
        expect(memo?.exemples[0]).toContain('USD 4.40');
    });

    it('⚠️ navigateur : la valeur n\'est NULLE PART dans le rapport (journal PUBLIC)', async () => {
        const r = await runFintableBrowserSync(ETAT, 'jeton', {
            client: clientFake(), now: () => Date.parse('2026-09-16T12:00:00Z'),
        });
        // Le rapport ENTIER sérialisé — pas seulement `warnings` : un champ neuf ajouté demain
        // serait couvert par cette garde sans qu'on ait à y penser.
        const serialise = JSON.stringify(r.report);
        expect(serialise).not.toContain('USD 4.40');
        expect(serialise).not.toContain('MARC TREMBLAY');
        expect(serialise).not.toContain('4519');
        // ANTI-VACUITÉ : le rapport nomme bien le champ — donc la garde lit la bonne chose, et
        // « aucune valeur » n'est pas « aucun rapport ».
        expect(serialise).toContain('external_memo');
    });

    it('⚠️ navigateur : la valeur n\'est pas non plus dans le PATCH persisté', async () => {
        const r = await runFintableBrowserSync(ETAT, 'jeton', {
            client: clientFake(), now: () => Date.parse('2026-09-16T12:00:00Z'),
        });
        expect(JSON.stringify(r.statePatch ?? {})).not.toContain('USD 4.40');
    });

    it('⚠️⚠️ cron : l\'échantillon n\'existe PAS dans son retour — fuite structurellement impossible', async () => {
        // Le chemin serveur `cat` son résultat dans un journal public. Il ne RRND que le rapport,
        // donc il n'a aucun moyen d'émettre ces valeurs, même par erreur de câblage future.
        const store: StateStore = {
            get: async () => ETAT,
            getWithVersion: async () => ({ state: ETAT, version: 1 }),
            save: async () => ({ backupPath: '/b' }),
            canWrite: true,
        };
        const report = await runFintableSync(store, {
            token: 't', roles: { acc_1: { kind: 'debt', debtName: '' } }, client: clientFake(),
        });
        const serialise = JSON.stringify(report);
        expect(serialise).not.toContain('USD 4.40');
        expect(serialise).not.toContain('MARC TREMBLAY');
        // Le champ reste NOMMÉ côté serveur : l'inventaire n'est pas ce qu'on retire, c'est la valeur.
        expect(serialise).toContain('external_memo');
        // Et il n'y a pas de porte : la clé elle-même est absente du contrat de retour.
        expect(Object.keys(report)).not.toContain('echantillonsChampsInconnus');
    });
});
