// tests/components/sauvegardeJsonEtat.test.tsx
//
// [EXPORT-JSON-PERD-FINTABLE] La sauvegarde JSON manuelle énumérait ses champs à la main et
// restaurait par des clés legacy : soldes et historique Fintable, rôles, abonnements, taux,
// conversations IA et documents disparaissaient à la restauration. Elle porte désormais l'enveloppe
// persistée ENTIÈRE, et la restauration la réécrit telle quelle.
//
// Ce que ce fichier tient :
//  1. la règle pure (refus en données fictives, refus sans enveloppe, état recopié à l'identique) ;
//  2. la GARANTIE qui remplace la liste : toute clé persistée est dans le fichier exporté ;
//  3. l'aller-retour RÉEL par l'écran (clic Exporter → fichier → Restaurer → RESTAURER) ;
//  4. « tout remplacer » (décision de Marc) : ce que la sauvegarde ne porte pas retombe au défaut ;
//  5. les refus qui doivent laisser le stockage INTACT (format 4 sans état, montant en texte).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BackupPanel, BackupSchema } from '../../components/settings/BackupPanel';
import { useFinanceStore } from '../../store/useFinanceStore';
import { extrairePersistable, fusionnerEtatPersiste } from '../../store/optionsPersistance';
import { initialState } from '../../store/etatParDefaut';
import { CLES_JAMAIS_RESTAUREES, construireSauvegardeEtat, remplacerLeStockage, resumeSauvegarde, VERSION_SAUVEGARDE_ETAT } from '../../services/sauvegardeJson';
import type { AppState } from '../../types';
import type { FinanceState } from '../../store/useFinanceStore';

vi.mock('../../components/ui/Toast', async (orig) => {
    const vrai = await orig<typeof import('../../components/ui/Toast')>();
    return { ...vrai, showToast: vi.fn() };
});
import { showToast } from '../../components/ui/Toast';

const STORE = 'financeai-storage';
const reload = vi.fn();
let blobs: Blob[] = [];

/** Les champs que l'ANCIEN export perdait — un par famille citée dans le ticket. */
const PERDUS_AVANT: Partial<AppState> = {
    fintableBrokerBalances: [{ accountId: 'acc-1', label: 'Compte test', balanceCad: 1234 }] as unknown as AppState['fintableBrokerBalances'],
    fintableBrokerHistory: [{ accountId: 'acc-1', label: 'Compte test', balanceCad: 1200 }] as unknown as AppState['fintableBrokerHistory'],
    fintableRoles: { 'acc-1': { kind: 'ignore' } } as unknown as AppState['fintableRoles'],
    dismissedSubscriptions: ['abonnement-test'],
    documents: [{ id: 'doc_1727000000000', name: 'feuillet.pdf', category: 'OTHER', uploadedAt: '2026-01-02', sizeBytes: 10, mimeType: 'application/pdf' }],
    aiConversations: [{ id: 'conv_1727000000000', title: 'Question test', messages: [], createdAt: 1, updatedAt: 1 }] as unknown as AppState['aiConversations'],
};

const TX = [{ id: 'tx_1727000000000', date: '2026-01-02', amount: -10, payee: 'Marchand test', category: 'Épicerie' }] as unknown as AppState['transactions'];

const exporter = async (): Promise<Record<string, unknown>> => {
    fireEvent.click(screen.getByRole('button', { name: 'Exporter JSON' }));
    await waitFor(() => expect(blobs).toHaveLength(1));
    return JSON.parse(await blobs[0].text());
};

const restaurer = async (contenu: unknown) => {
    const input = document.querySelector('input[type="file"][accept=".json"]') as HTMLInputElement;
    const fichier = new File([JSON.stringify(contenu)], 'sauvegarde.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [fichier] } });
};

beforeEach(() => {
    localStorage.clear();
    useFinanceStore.getState().resetState();
    vi.mocked(showToast).mockClear();
    reload.mockClear();
    blobs = [];
    global.URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:test'; });
    global.URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
    Object.defineProperty(window, 'location', {
        configurable: true, writable: true,
        value: { reload, search: '', href: 'http://localhost/' },
    });
});

describe('construireSauvegardeEtat (règle pure)', () => {
    const env = { state: { transactions: [] }, version: 7 };
    it('données fictives → refus, quelle que soit l\'enveloppe', () => {
        expect(construireSauvegardeEtat(env, true, 1, true)).toEqual({ ok: false, cause: 'donnees-fictives' });
    });
    it('aucun blob → « rien à sauvegarder »', () => {
        expect(construireSauvegardeEtat(null, false, 1, false)).toEqual({ ok: false, cause: 'rien-a-sauvegarder' });
    });
    it('un blob PRÉSENT mais illisible ou mal formé → « illisible », JAMAIS « rien à sauvegarder »', () => {
        // Illisible : `getLocalPayload` rend `null`, seule la présence du blob le distingue du vide.
        expect(construireSauvegardeEtat(null, false, 1, true)).toEqual({ ok: false, cause: 'illisible' });
        for (const e of ['x', {}, { state: [], version: 7 }, { state: {}, version: 'sept' }]) {
            expect(construireSauvegardeEtat(e, false, 1, false)).toEqual({ ok: false, cause: 'illisible' });
        }
    });
    it('l\'état est recopié tel quel, avec la version du store', () => {
        const r = construireSauvegardeEtat(env, false, 42, true);
        expect(r).toEqual({ ok: true, sauvegarde: { version: VERSION_SAUVEGARDE_ETAT, timestamp: 42, store: env } });
    });
    it('le résumé lit les collections SOUS `store.state` (sinon « 0 transaction » sur un vrai dossier)', () => {
        expect(resumeSauvegarde({ version: '4.0', store: { state: { transactions: [1, 2], assets: [1] } } }))
            .toEqual({ version: '4.0', transactions: 2, actifs: 1 });
        expect(resumeSauvegarde({ version: '3.2', transactions: [1], assets: [] }))
            .toEqual({ version: '3.2', transactions: 1, actifs: 0 });
    });
});

describe('Export : toute clé persistée est dans le fichier', () => {
    it('les clés du fichier = les clés que le store persiste (aucune liste à tenir)', async () => {
        useFinanceStore.setState({ ...PERDUS_AVANT, transactions: TX });
        render(<BackupPanel />);
        const fichier = await exporter();
        const persistees = Object.keys(JSON.parse(JSON.stringify(extrairePersistable(useFinanceStore.getState()))));
        const exportees = Object.keys((fichier.store as { state: object }).state);
        expect(exportees.sort()).toEqual(persistees.sort());
        // Chaque champ que l'ancien export perdait est là, valeur comprise.
        for (const [cle, valeur] of Object.entries(PERDUS_AVANT)) {
            expect((fichier.store as { state: Record<string, unknown> }).state[cle]).toEqual(valeur);
        }
        // Jamais les clés API, ni sous leur nom ni par leur contenu.
        expect(JSON.stringify(fichier)).not.toContain('"apiKeys"');
    });

    it('blob local corrompu → aucun fichier, et le message dit « illisible », pas « rien à sauvegarder »', () => {
        render(<BackupPanel />);
        localStorage.setItem(STORE, '{pas-du-json');
        fireEvent.click(screen.getByRole('button', { name: 'Exporter JSON' }));
        expect(blobs).toHaveLength(0);
        expect(vi.mocked(showToast)).toHaveBeenCalledWith(expect.stringMatching(/illisible/), 'error');
    });

    it('mode test → aucun fichier, message qui dit pourquoi', async () => {
        useFinanceStore.setState({ transactions: TX, isTestMode: true } as Partial<FinanceState>);
        render(<BackupPanel />);
        fireEvent.click(screen.getByRole('button', { name: 'Exporter JSON' }));
        expect(blobs).toHaveLength(0);
        expect(vi.mocked(showToast)).toHaveBeenCalledWith(expect.stringMatching(/mode test/), 'error');
    });
});

describe('Restauration : aller-retour par l\'écran', () => {
    it('le fichier exporté se restaure à l\'identique sous `financeai-storage`, sans clé legacy', async () => {
        useFinanceStore.setState({ ...PERDUS_AVANT, transactions: TX });
        render(<BackupPanel />);
        const fichier = await exporter();

        // Un appareil qui avait AUTRE CHOSE : une clé legacy et un autre état — et son coffre chiffré
        // de clés API, qui n'est pas dans le fichier et doit SURVIVRE.
        localStorage.setItem('app_assets', JSON.stringify([{ symbol: 'AUTRE' }]));
        localStorage.setItem('app_api_keys_enc', 'coffre-chiffre-opaque');
        localStorage.setItem(STORE, JSON.stringify({ state: { transactions: [] }, version: 7 }));

        await restaurer(fichier);
        expect(await screen.findByText('Restauration Complète')).toBeInTheDocument();
        expect(screen.getByText('1', { selector: 'span' })).toBeInTheDocument(); // 1 transaction annoncée
        fireEvent.change(screen.getByLabelText(/pour confirmer/), { target: { value: 'RESTAURER' } });
        fireEvent.click(screen.getByRole('button', { name: 'Restaurer définitivement' }));

        await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
        const ecrit = JSON.parse(localStorage.getItem(STORE)!);
        const attendu = { ...(fichier.store as { state: Record<string, unknown> }).state };
        for (const cle of CLES_JAMAIS_RESTAUREES) delete attendu[cle];
        expect(ecrit).toEqual({ state: attendu, version: (fichier.store as { version: number }).version });
        expect(localStorage.getItem('app_assets')).toBeNull();
        expect(localStorage.getItem('app_api_keys_enc')).toBe('coffre-chiffre-opaque');

        // Au redémarrage, `merge` rend bien les champs que l'ancien chemin perdait.
        const rendu = fusionnerEtatPersiste(ecrit.state, initialState as FinanceState);
        for (const [cle, valeur] of Object.entries(PERDUS_AVANT)) {
            expect((rendu as unknown as Record<string, unknown>)[cle]).toEqual(valeur);
        }
    });

    it('un fichier FABRIQUÉ qui porte des clés API ou un mode test : ces champs ne sont jamais écrits', async () => {
        render(<BackupPanel />);
        await restaurer({
            version: '4.0', timestamp: 1,
            store: {
                state: {
                    transactions: [],
                    apiKeys: { anthropic: 'cle-d-un-tiers', finnhub: 'cle-d-un-tiers', fintable: 'jeton-d-un-tiers' },
                    isTestMode: true, activeTestPersonaId: 'persona-x', realDataSnapshot: { transactions: [] },
                },
                version: 7,
            },
        });
        await screen.findByText('Restauration Complète');
        fireEvent.change(screen.getByLabelText(/pour confirmer/), { target: { value: 'RESTAURER' } });
        fireEvent.click(screen.getByRole('button', { name: 'Restaurer définitivement' }));
        await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
        const ecrit = localStorage.getItem(STORE)!;
        expect(ecrit).not.toContain('tiers');
        expect(JSON.parse(ecrit).state).toEqual({ transactions: [] });
    });

    it('écriture refusée par le navigateur → pas de rechargement, dossier d\'avant intact, message clair', async () => {
        const avant = JSON.stringify({ state: { transactions: TX }, version: 7 });
        localStorage.setItem(STORE, avant);
        render(<BackupPanel />);
        await restaurer({ version: '4.0', timestamp: 1, store: { state: { transactions: [] }, version: 7 } });
        await screen.findByText('Restauration Complète');
        const vrai = Storage.prototype.setItem;
        const espion = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
            if (k === STORE && v !== avant) throw new DOMException('plein', 'QuotaExceededError');
            return vrai.call(this, k, v);
        });
        try {
            fireEvent.change(screen.getByLabelText(/pour confirmer/), { target: { value: 'RESTAURER' } });
            fireEvent.click(screen.getByRole('button', { name: 'Restaurer définitivement' }));
            await waitFor(() => expect(vi.mocked(showToast)).toHaveBeenCalledWith(expect.stringMatching(/intact/), 'error'));
        } finally {
            espion.mockRestore();
        }
        expect(reload).not.toHaveBeenCalled();
        expect(localStorage.getItem(STORE)).toBe(avant);
    });

    it('« tout remplacer » : un champ absent de la sauvegarde retombe au DÉFAUT, jamais à l\'ancien', () => {
        // L'appareil courant a des rôles Fintable ; la sauvegarde n'en porte pas.
        const sauvegarde = { state: { transactions: TX }, version: 7 };
        const vivant = { ...(initialState as FinanceState), fintableRoles: { x: { kind: 'ignore' } } } as unknown as FinanceState;
        // Au démarrage, l'état de base est l'état PAR DÉFAUT (clés legacy effacées), pas le vivant.
        expect(fusionnerEtatPersiste(sauvegarde.state, initialState as FinanceState).fintableRoles)
            .toEqual((initialState as FinanceState).fintableRoles);
        // Contrôle : c'est bien la base qui décide — fusionné sur le vivant, l'ancien survivrait.
        expect(fusionnerEtatPersiste(sauvegarde.state, vivant).fintableRoles).toEqual({ x: { kind: 'ignore' } });
    });
});

describe('remplacerLeStockage : un échec d\'écriture remet l\'ancien contenu', () => {
    it('quota dépassé après clear() → contenu d\'avant rétabli à l\'identique', () => {
        localStorage.setItem(STORE, '{"state":{"a":1},"version":7}');
        localStorage.setItem('autre', 'x');
        const r = remplacerLeStockage(localStorage, (st) => {
            st.setItem('partiel', 'y');
            throw new DOMException('plein', 'QuotaExceededError');
        });
        expect(r).toMatchObject({ ok: false, retabli: true });
        expect(localStorage.getItem(STORE)).toBe('{"state":{"a":1},"version":7}');
        expect(localStorage.getItem('autre')).toBe('x');
        expect(localStorage.getItem('partiel')).toBeNull();   // rien d'un demi-remplacement
    });
    it('les clés à GARDER survivent au remplacement (coffre des clés API)', () => {
        localStorage.setItem('coffre', 'c');
        localStorage.setItem('ancien', 'x');
        expect(remplacerLeStockage(localStorage, (st) => st.setItem('neuf', 'y'), ['coffre'])).toEqual({ ok: true });
        expect(localStorage.getItem('coffre')).toBe('c');
        expect(localStorage.getItem('ancien')).toBeNull();
    });

    it('CONTRÔLE : écriture réussie → seul le nouveau contenu reste', () => {
        localStorage.setItem('ancien', 'x');
        expect(remplacerLeStockage(localStorage, (st) => st.setItem('neuf', 'y'))).toEqual({ ok: true });
        expect(localStorage.getItem('ancien')).toBeNull();
        expect(localStorage.getItem('neuf')).toBe('y');
    });
});

describe('Refus qui laissent le stockage intact', () => {
    it('format 4 sans son état → refusé par le schéma (sinon le chemin legacy viderait tout)', () => {
        for (const version of ['4.0', '4', '40', '5.0']) {
            expect(BackupSchema.safeParse({ version, timestamp: 1 }).success).toBe(false);
        }
        // CONTRÔLE : un ancien backup 3.x reste accepté (chemin legacy inchangé).
        expect(BackupSchema.safeParse({ version: '3.2', transactions: [] }).success).toBe(true);
    });

    it('un montant en TEXTE dans l\'état → refusé AVANT toute écriture', async () => {
        const avant = JSON.stringify({ state: { transactions: TX }, version: 7 });
        localStorage.setItem(STORE, avant);
        render(<BackupPanel />);
        await restaurer({ version: '4.0', timestamp: 1, store: { state: { transactions: [{ id: 't', amount: '10' }] }, version: 7 } });
        await waitFor(() => expect(vi.mocked(showToast)).toHaveBeenCalledWith(expect.stringMatching(/Backup invalide/), 'error'));
        expect(screen.queryByText('Restauration Complète')).toBeNull();
        expect(localStorage.getItem(STORE)).toBe(avant);
    });

    it('CONTRÔLE : la même sauvegarde avec un montant numérique est acceptée', () => {
        expect(BackupSchema.safeParse({ version: '4.0', timestamp: 1, store: { state: { transactions: [{ id: 't', amount: 10 }] }, version: 7 } }).success).toBe(true);
    });
});
