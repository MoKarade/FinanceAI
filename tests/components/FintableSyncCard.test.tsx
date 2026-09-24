/**
 * @vitest-environment jsdom
 *
 * [FINTABLE-7] Carte de configuration de la sync bancaire.
 *
 * Ce que les tests verrouillent en priorité : (a) AUCUN montant n'est rendu — c'est ce qui dispense
 * la carte d'un gate mode discret, et une régression silencieuse y ferait fuiter des soldes réels ;
 * (b) la sync est INDISPONIBLE en mode démo (sinon des données de persona se mêleraient aux vraies) ;
 * (c) le régime fiscal par défaut est bien NON-ENREG (réponse de Marc, 2026-07-30).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FintableSyncCard } from '../../components/settings/FintableSyncCard';
import { useFinanceStore } from '../../store/useFinanceStore';

const listMock = vi.fn();
const syncMock = vi.fn();

vi.mock('../../services/fintable/browserSync', () => ({
    listFintableAccountsForSetup: (...a: unknown[]) => listMock(...a),
    runFintableBrowserSync: (...a: unknown[]) => syncMock(...a),
}));
const logErrorMock = vi.fn();
vi.mock('../../services/errorLogger', () => ({ logError: (...a: unknown[]) => logErrorMock(...a), logErrorThrottled: vi.fn(), }));

// [FINTABLE-TOKEN-PERSIST] Coffre chiffré mocké : ces tests verrouillent que le jeton est bien
// ÉCRIT dans secureKeyStore (incident 2026-08-05 : il ne l'était jamais → perdu à chaque reload).
const saveKeysMock = vi.fn();
vi.mock('../../services/secureKeyStore', () => ({
    saveApiKeys: (...a: unknown[]) => saveKeysMock(...a),
}));

const ACCOUNTS = [
    { id: 'acc_1', label: 'Compte chèque', rawType: 'depository', currency: 'CAD', balance: 1500 },
    { id: 'acc_2', label: 'Disnat L7B1', rawType: 'brokerage', currency: 'CAD', balance: 136863.18 },
];

// [FINTABLE-DEBTNAME-AUTO] Le libellé Fintable (avec son numéro de compte) DIFFÈRE volontairement du
// nom de la dette dans FinanceAI : c'est le cas courant, et c'est lui qui rendait la saisie
// manuelle piégeuse. La suggestion doit franchir cet écart sans jamais inventer.
const ACCOUNTS_AVEC_MC = [
    ...ACCOUNTS,
    { id: 'acc_mc', label: 'Desjardins Cash Back Mastercard 5020', rawType: 'credit', currency: 'CAD', balance: -842.11 },
];

const DETTE_MC = {
    id: 'debt_mc', name: 'Desjardins Cash Back Mastercard', balance: 842.11,
    interestRate: 19.99, minimumPayment: 25, category: 'CreditCard' as const,
};
const DETTE_HYPO = {
    id: 'debt_hypo', name: 'Hypothèque Condo', balance: 280_000,
    interestRate: 4.79, minimumPayment: 1_650, category: 'Other' as const,
};

beforeEach(() => {
    listMock.mockReset();
    syncMock.mockReset();
    saveKeysMock.mockReset();
    logErrorMock.mockReset();
    saveKeysMock.mockResolvedValue(undefined);
    useFinanceStore.setState({
        apiKeys: { anthropic: '', finnhub: '', fintable: 'ft_test' },
        fintableRoles: undefined,
        fintableSyncReport: undefined,
        isTestMode: false,
        // [FINTABLE-DEBTNAME-AUTO] Remis à zéro entre les cas : la liste des dettes pilote désormais
        // ce que la carte rend, donc un cas qui en pose contaminerait les suivants.
        debts: [],
    });
});

describe('FintableSyncCard — vie privée', () => {
    it('n\'affiche AUCUN montant, même après avoir listé des comptes qui en portent', async () => {
        listMock.mockResolvedValue({ accounts: ACCOUNTS, error: null });
        const { container } = render(<FintableSyncCard />);

        fireEvent.click(screen.getByRole('button', { name: /Tester la connexion/i }));
        await waitFor(() => expect(screen.getByText('Disnat L7B1')).toBeInTheDocument());

        // Les soldes existent dans la donnée (1500 / 120000.00) mais ne doivent APPARAÎTRE nulle part.
        const text = container.textContent ?? '';
        expect(text).not.toMatch(/136\s?863/);
        expect(text).not.toMatch(/1[\s ]?500/);
        // Et aucun symbole monétaire rendu par la carte.
        expect(text).not.toContain(' $');
    });
});

describe('FintableSyncCard — garde-fous d\'action', () => {
    it('sans jeton : les deux boutons sont désactivés', () => {
        useFinanceStore.setState({ apiKeys: { anthropic: '', finnhub: '', fintable: '' } });
        render(<FintableSyncCard />);
        expect(screen.getByRole('button', { name: /Tester la connexion/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Synchroniser maintenant/i })).toBeDisabled();
    });

    it('en MODE DÉMO : la synchronisation est bloquée et dite (jamais de mélange démo/réel)', () => {
        useFinanceStore.setState({ isTestMode: true });
        render(<FintableSyncCard />);
        expect(screen.getByRole('button', { name: /Synchroniser maintenant/i })).toBeDisabled();
        expect(screen.getByText(/Mode démo actif/i)).toBeInTheDocument();
        expect(syncMock).not.toHaveBeenCalled();
    });

    it('une erreur de connexion est rendue en alerte, sans liste de comptes fabriquée', async () => {
        listMock.mockResolvedValue({ accounts: [], error: '[AUTH] jeton invalide' });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Tester la connexion/i }));
        await waitFor(() => expect(screen.getByRole('alert', { name: /Erreur de synchronisation/i })).toHaveTextContent(/AUTH/));
        expect(screen.queryByText(/Rôle de chaque compte/i)).toBeNull();
    });
});

describe('FintableSyncCard — écriture de l\'état après une passe', () => {
    it('écrit TOUT champ modifié par la passe, y compris ceux qu\'aucune liste ne nomme', async () => {
        // [finding silent-failure-hunter, PR #536] Le 1er jet énumérait 5 clés à la main et perdait
        // déjà `lastUpdate`. Ce test utilise un champ VOLONTAIREMENT hors de cette liste historique
        // (`assets`) : il échoue sur l'ancien code, passe avec le delta par référence.
        useFinanceStore.setState({ transactions: [], assets: [], lastUpdate: 1 });
        const before = useFinanceStore.getState() as unknown as Record<string, unknown>;
        // [FINTABLE-SYNC-STALE-BASE] La passe rend un PATCH (clés touchées seulement). Ce que ce
        // test verrouille reste le même : la carte écrit TOUT ce que la passe lui donne, sans
        // liste de clés à la main — `assets` et `lastUpdate` étaient perdus par l'ancienne liste.
        syncMock.mockResolvedValue({
            report: { at: 42, error: null, transactionsAdded: 3, accountsSeen: 1, warnings: [] },
            statePatch: {
                transactions: [{ id: 9, date: '2026-07-30', payee: 'X', amount: -5, category: 'Autre', status: 'processed' }],
                assets: [{ symbol: 'ZZZ', quantity: 1, currency: 'CAD', currentPrice: 1, name: 'Z', performance: 0, dateBought: '2026-01-01' }],
                lastUpdate: 999,
            },
        });

        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Synchroniser maintenant/i }));
        // NB : deux régions `role=status` coexistent (zone sr-only d'occupation + notice visible)
        // → cibler le TEXTE, pas le rôle, sinon le matcher est ambigu.
        await waitFor(() => expect(screen.getByText(/3 transaction\(s\) ajoutée/)).toBeInTheDocument());

        const after = useFinanceStore.getState() as unknown as Record<string, unknown>;
        expect((after.transactions as unknown[]).length).toBe(1);
        expect(after.lastUpdate).toBe(999);                       // ← perdu par l'ancienne liste
        expect((after.assets as unknown[])[0]).toMatchObject({ symbol: 'ZZZ' }); // ← idem
        // Et les clés INCHANGÉES ne sont pas réécrites : pas d'écrasement d'une modif concurrente.
        expect(after.budgetItems).toBe(before.budgetItems);
    });

    it('échec de passe → SEUL le rapport est écrit, aucun contenu', async () => {
        useFinanceStore.setState({ transactions: [] });
        syncMock.mockResolvedValue({
            report: { at: 7, error: '[NETWORK] panne', transactionsAdded: 0, accountsSeen: 0, warnings: [] },
            statePatch: null,
        });

        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Synchroniser maintenant/i }));
        await waitFor(() => expect(screen.getByRole('alert', { name: /Erreur de synchronisation/i })).toHaveTextContent(/NETWORK/));

        expect(useFinanceStore.getState().fintableSyncReport?.error).toContain('NETWORK');
        expect(useFinanceStore.getState().transactions).toEqual([]);
    });

    it('[FINTABLE-SOURCE-TAG] un THROW de la passe écrit un rapport d\'échec qui REPORTE lastProductiveAt', async () => {
        // Le chaînon du chemin MANUEL (les trois autres écrivains sont testés chez eux) : sans le
        // report, tout échec effaçait la fraîcheur du connecteur et le gel redevenait invisible.
        const PREV = Date.now() - 3 * 86_400_000;
        useFinanceStore.setState({
            fintableSyncReport: {
                at: Date.now() - 26 * 3_600_000, cutoverDateUsed: null, accountsSeen: 1,
                accountsWithoutRole: 0, transactionsAdded: 2, transfersDetected: 0, cashUpdated: false,
                debtsUpdated: [], investmentReferenceCount: 0, warnings: [], error: null,
                lastProductiveAt: PREV,
            },
        });
        syncMock.mockRejectedValue(new Error('panne pendant la passe'));

        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Synchroniser maintenant/i }));
        await waitFor(() => expect(useFinanceStore.getState().fintableSyncReport?.error).toBeTruthy());

        expect(useFinanceStore.getState().fintableSyncReport?.lastProductiveAt).toBe(PREV);
    });
});

describe('FintableSyncCard — assignation des rôles', () => {
    it('choisir « Placement » pré-remplit NON-ENREG (réponse de Marc), sans rien deviner d\'autre', async () => {
        listMock.mockResolvedValue({ accounts: ACCOUNTS, error: null });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Tester la connexion/i }));
        await waitFor(() => expect(screen.getByText('Disnat L7B1')).toBeInTheDocument());

        fireEvent.change(screen.getByLabelText(/Rôle de Disnat L7B1/i), { target: { value: 'investment' } });

        expect(useFinanceStore.getState().fintableRoles?.acc_2).toEqual({
            kind: 'investment', taxRegime: 'NON-ENREG',
        });
        // L'autre compte reste NON déclaré — rien n'est rangé d'office.
        expect(useFinanceStore.getState().fintableRoles?.acc_1).toBeUndefined();
    });

    // ── [FINTABLE-DEBTNAME-AUTO] Le nom de dette ne se TAPE plus : il se CHOISIT. ──
    // Marc, 2026-09-14 : « je veux pas avoir à donner exactement le nom dans dette, ça devrait être
    // automatique ». Avant ce lot, un champ texte libre exigeait le nom au caractère près (accents
    // compris, cf. `debtKey` d'`applyDebt`) — une faute de frappe gelait la mise à jour du solde.
    it('choisir « Dette » PRÉ-SÉLECTIONNE la dette qui correspond au compte, et la persiste', async () => {
        useFinanceStore.setState({ debts: [DETTE_MC, DETTE_HYPO] });
        listMock.mockResolvedValue({ accounts: ACCOUNTS_AVEC_MC, error: null });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Tester la connexion/i }));
        await waitFor(() => expect(screen.getByText('Desjardins Cash Back Mastercard 5020')).toBeInTheDocument());

        // UN SEUL geste : déclarer que le compte est une dette. Rien à taper ensuite.
        fireEvent.change(screen.getByLabelText(/Rôle de Desjardins Cash Back Mastercard 5020/i), { target: { value: 'debt' } });

        expect(useFinanceStore.getState().fintableRoles?.acc_mc).toEqual({
            kind: 'debt', debtName: 'Desjardins Cash Back Mastercard',
        });
        // Et le choix est VISIBLE/modifiable — une suggestion invisible serait de la donnée fabriquée.
        const select = await screen.findByLabelText(/Dette correspondante/i);
        expect((select as HTMLSelectElement).value).toBe('Desjardins Cash Back Mastercard');
    });

    it('la liste ne propose QUE des dettes existantes — donc un nom qu\'applyDebt accepte', async () => {
        useFinanceStore.setState({ debts: [DETTE_MC, DETTE_HYPO] });
        listMock.mockResolvedValue({ accounts: ACCOUNTS_AVEC_MC, error: null });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Tester la connexion/i }));
        await waitFor(() => expect(screen.getByText('Desjardins Cash Back Mastercard 5020')).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText(/Rôle de Desjardins Cash Back Mastercard 5020/i), { target: { value: 'debt' } });

        const select = await screen.findByLabelText(/Dette correspondante/i) as HTMLSelectElement;
        const valeurs = Array.from(select.options).map((o) => o.value);
        // Le placeholder vide, plus EXACTEMENT les deux dettes du store. Aucun nom libre possible.
        expect(valeurs).toEqual(['', 'Desjardins Cash Back Mastercard', 'Hypothèque Condo']);
        // Discriminant du lot : plus aucun champ où taper un nom à la main.
        expect(screen.queryByLabelText(/Nom EXACT de la dette/i)).toBeNull();

        // Changer de dette reste possible d'un clic.
        fireEvent.change(select, { target: { value: 'Hypothèque Condo' } });
        expect(useFinanceStore.getState().fintableRoles?.acc_mc).toEqual({
            kind: 'debt', debtName: 'Hypothèque Condo',
        });
    });

    it('un debtName HÉRITÉ qui ne désigne plus aucune dette est montré comme INTROUVABLE, pas effacé en silence', async () => {
        // C'est l'état exact qui gelait le solde sans que rien ne le dise à l'écran : le retirer de
        // la liste ferait disparaître la CAUSE en même temps que le symptôme.
        useFinanceStore.setState({
            debts: [DETTE_MC, DETTE_HYPO],
            fintableRoles: { acc_mc: { kind: 'debt', debtName: 'Mastercard Desjardin' } },
        });
        listMock.mockResolvedValue({ accounts: ACCOUNTS_AVEC_MC, error: null });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Tester la connexion/i }));

        const select = await screen.findByLabelText(/Dette correspondante/i) as HTMLSelectElement;
        expect(select.value).toBe('Mastercard Desjardin');
        expect(screen.getByText(/INTROUVABLE dans Réglages/i)).toBeInTheDocument();
        expect(screen.getByText(/son solde n'est PAS mis à jour/i)).toBeInTheDocument();
    });

    it('aucune dette dans FinanceAI : on le DIT au lieu d\'afficher une liste vide qui aurait l\'air de marcher', async () => {
        useFinanceStore.setState({ debts: [] });
        listMock.mockResolvedValue({ accounts: ACCOUNTS_AVEC_MC, error: null });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Tester la connexion/i }));
        await waitFor(() => expect(screen.getByText('Desjardins Cash Back Mastercard 5020')).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText(/Rôle de Desjardins Cash Back Mastercard 5020/i), { target: { value: 'debt' } });

        // ⚠️ [FINTABLE-CARTE-SANS-DETTE] Ce cas disait « crée d'abord une dette » — un cul-de-sac :
        // Marc ne VEUT pas de dette pour sa carte, et sans dette le compte n'était pas routé du
        // tout (100 % de ses transactions jetées, mesuré 0/5). L'écran décrit maintenant ce qui va
        // RÉELLEMENT se passer, y compris la contrepartie.
        expect(await screen.findByText(/transactions de ce compte sont importées comme dépenses/i)).toBeInTheDocument();
        expect(screen.getByText(/patrimoine net ne le soustrait pas/i)).toBeInTheDocument();
        // Pas de liste déroulante fantôme : il n'y a aucune dette à y mettre.
        expect(screen.queryByLabelText(/Dette correspondante/i)).toBeNull();
        // Et le rôle est bien posé, avec un nom VIDE — un choix complet, plus un nom manquant.
        expect(useFinanceStore.getState().fintableRoles?.acc_mc).toEqual({ kind: 'debt', debtName: '' });
    });

    it('avec des dettes, l\'option vide est un CHOIX nommé — « importer seulement les transactions »', async () => {
        // L'ancien libellé « — choisir la dette — » se lisait comme « tu n'as pas fini ».
        useFinanceStore.setState({ debts: [DETTE_HYPO] });
        listMock.mockResolvedValue({ accounts: ACCOUNTS_AVEC_MC, error: null });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Tester la connexion/i }));
        await waitFor(() => expect(screen.getByText('Desjardins Cash Back Mastercard 5020')).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText(/Rôle de Desjardins Cash Back Mastercard 5020/i), { target: { value: 'debt' } });

        const select = await screen.findByLabelText(/Dette correspondante/i) as HTMLSelectElement;
        expect(select.options[0].text).toMatch(/importer seulement les transactions/i);

        // Et la phrase du bas suit ce que le rôle FAIT : sans dette choisie, aucun solde touché.
        fireEvent.change(select, { target: { value: '' } });
        expect(screen.getByText(/Aucun solde n'est touché/i)).toBeInTheDocument();
        fireEvent.change(select, { target: { value: 'Hypothèque Condo' } });
        expect(screen.getByText(/Seul le SOLDE est mis à jour/i)).toBeInTheDocument();
    });
});

describe('FintableSyncCard — persistance du jeton dans le coffre chiffré ([FINTABLE-TOKEN-PERSIST])', () => {
    // DISCRIMINANT par construction : sur le code d'avant (incident 2026-08-05), saveApiKeys
    // n'était JAMAIS appelé depuis cette carte → ces deux tests échouent (mock jamais invoqué).
    it('au blur de l\'input, le jeton est écrit dans secureKeyStore avec les AUTRES clés', async () => {
        render(<FintableSyncCard />);
        const input = screen.getByLabelText(/Jeton Fintable/i);
        fireEvent.change(input, { target: { value: 'ft_nouveau' } });
        fireEvent.blur(input);
        await waitFor(() => expect(saveKeysMock).toHaveBeenCalled());
        // Le blob écrit contient le jeton FRAIS et n'écrase pas les autres clés.
        const written = saveKeysMock.mock.calls.at(-1)?.[0] as Record<string, string>;
        expect(written.fintable).toBe('ft_nouveau');
        expect(written).toHaveProperty('anthropic');
        expect(written).toHaveProperty('finnhub');
    });

    it('« Tester la connexion » persiste aussi le jeton (ceinture au clic direct)', async () => {
        listMock.mockResolvedValue({ accounts: [], error: null });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Tester la connexion/i }));
        await waitFor(() => expect(saveKeysMock).toHaveBeenCalled());
    });

    it('un échec du coffre est AFFICHÉ, jamais silencieux (le jeton reste valide en session)', async () => {
        saveKeysMock.mockRejectedValue(new Error('IndexedDB indisponible'));
        render(<FintableSyncCard />);
        const input = screen.getByLabelText(/Jeton Fintable/i);
        fireEvent.change(input, { target: { value: 'ft_nouveau' } });
        fireEvent.blur(input);
        await waitFor(() => expect(screen.getByText(/Jeton non sauvegardé/i)).toBeInTheDocument());
    });
});

describe('FintableSyncCard — trajet complet du jeton (findings panel #559)', () => {
    // Ces 3 tests couvrent les trous que le PREMIER jet du fix laissait ouverts — chacun rouvrait
    // le symptôme d'origine (« jeton perdu sans trace ») par un chemin plus étroit.
    it('finding #1 — au DÉMONTAGE (navigation interne, sans blur) le jeton est flushé', async () => {
        const { unmount } = render(<FintableSyncCard />);
        fireEvent.change(screen.getByLabelText(/Jeton Fintable/i), { target: { value: 'ft_sans_blur' } });
        expect(saveKeysMock).not.toHaveBeenCalled();   // rien tant qu'on édite : pas de chiffrement par frappe
        unmount();                                      // fermer l'onglet n'émet PAS de blur sur l'input
        await waitFor(() => expect(saveKeysMock).toHaveBeenCalled());
    });

    it('finding #1 bis — `visibilitychange: hidden` (changement d\'onglet navigateur) flushe aussi', async () => {
        render(<FintableSyncCard />);
        fireEvent.change(screen.getByLabelText(/Jeton Fintable/i), { target: { value: 'ft_onglet' } });
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        await waitFor(() => expect(saveKeysMock).toHaveBeenCalled());
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });

    it('finding #2 — sous DOUBLE panne (coffre + réseau), l\'échec de coffre reste visible ET tracé', async () => {
        saveKeysMock.mockRejectedValue(new Error('IndexedDB indisponible'));
        listMock.mockResolvedValue({ accounts: [], error: '[AUTH] jeton invalide' });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Tester la connexion/i }));
        // L'erreur réseau s'affiche dans SA région…
        await waitFor(() => expect(
            screen.getByRole('alert', { name: /Erreur de synchronisation/i }),
        ).toHaveTextContent(/AUTH/));
        // …sans effacer celle du coffre (avant le fix : écrasée, donc totalement invisible).
        expect(screen.getByRole('alert', { name: /Sauvegarde du jeton/i }))
            .toHaveTextContent(/Jeton non sauvegardé/i);
        expect(logErrorMock).toHaveBeenCalled();       // trace durable dans Diagnostics
    });

    it('finding #2 panel #561 — une EXCEPTION de sync écrit quand même le rapport (sinon le gel devient invisible)', async () => {
        // Toute la détection [FINTABLE-STALE-ALERT] lit `fintableSyncReport`. Avant ce fix, une
        // exception laissait le rapport figé sur l'ANCIEN succès : la bannière et le tool MCP ne
        // voyaient jamais la tentative ratée (seul un toast éphémère, perdu au rechargement).
        syncMock.mockRejectedValue(new Error('boom réseau'));
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Synchroniser maintenant/i }));
        await waitFor(() => expect(
            useFinanceStore.getState().fintableSyncReport?.error,
        ).toContain('boom réseau'));
        expect(useFinanceStore.getState().fintableSyncReport?.at).toBeGreaterThan(0);
    });

    it('finding #2 bis — en MODE DÉMO, l\'exception n\'écrit AUCUN rapport (jamais de trace persona)', async () => {
        useFinanceStore.setState({ isTestMode: true, fintableSyncReport: undefined });
        syncMock.mockRejectedValue(new Error('boom'));
        render(<FintableSyncCard />);
        // Le bouton est désactivé en démo : on prouve qu'aucun rapport n'apparaît par ce chemin.
        expect(screen.getByRole('button', { name: /Synchroniser maintenant/i })).toBeDisabled();
        expect(useFinanceStore.getState().fintableSyncReport).toBeUndefined();
    });

    it('finding #3 — « Synchroniser maintenant » persiste AUSSI le jeton (chemin le plus sensible)', async () => {
        // Le commentaire « ceinture : idem handleTest » n'était prouvé que pour handleTest : un
        // refactor retirant l'appel dans le SEUL handleSync serait passé inaperçu — alors que c'est
        // le chemin qui écrit de vraies transactions.
        syncMock.mockResolvedValue({
            report: { at: 1, error: null, transactionsAdded: 0, accountsSeen: 1, warnings: [] },
            statePatch: null,
        });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Synchroniser maintenant/i }));
        await waitFor(() => expect(saveKeysMock).toHaveBeenCalled());
    });
});

/**
 * [FINTABLE-RATTRAPAGE, finding silent-failure #649] Le bouton de rattrapage et la liste des
 * douteuses — zéro test avant ce bloc, et c'est là qu'était la fuite.
 *
 * ⚠️ LE DÉFAUT MESURÉ : `setIncertaines` s'exécutait AVANT le contrôle du mode démo. La liste
 * affiche des dates, des marchands et des montants RÉELS. Si Marc activait le mode démo pendant le
 * fetch (le scénario que le contrôle existe pour couvrir), l'écran montrait ses vraies données dans
 * une session persona — sous un message affirmant « rien n'a été écrit ». Vrai pour le store, FAUX
 * pour l'écran : une fuite avec une confirmation rassurante par-dessus, ce qui est pire qu'une fuite
 * nue.
 */
describe('FintableSyncCard — rattrapage d\'historique', () => {
    const MARCHAND = 'PHARMA-REELLE-ZQX';
    const douteuse = {
        entrante: { date: '2025-09-15', payee: MARCHAND, amount: -180 },
        existante: { date: '2025-09-14', payee: 'PAIEMENT CAISSE', amount: -180 },
        ecartJours: 1,
    };

    it('le bouton « Rattraper l\'historique » demande bien une passe de RATTRAPAGE', async () => {
        syncMock.mockResolvedValue({
            report: { at: 1, error: null, transactionsAdded: 12, accountsSeen: 1, warnings: [], skippedBeforeCutover: 0, wasBackfill: true },
            statePatch: { lastUpdate: 1 }, incertaines: [],
        });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Rattraper l’historique/ }));
        await waitFor(() => expect(syncMock).toHaveBeenCalled());
        // 3e argument = options : c'est `backfill: true` qui lève les deux bornes.
        expect(syncMock.mock.calls[0][2]).toMatchObject({ backfill: true });
    });

    it('« Synchroniser maintenant » ne déclenche JAMAIS un rattrapage (anti-sur-correctif)', async () => {
        syncMock.mockResolvedValue({
            report: { at: 1, error: null, transactionsAdded: 0, accountsSeen: 1, warnings: [] },
            statePatch: { lastUpdate: 1 }, incertaines: [],
        });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Synchroniser maintenant/ }));
        await waitFor(() => expect(syncMock).toHaveBeenCalled());
        expect(syncMock.mock.calls[0][2]).toMatchObject({ backfill: false });
    });

    it('les cas douteux sont AFFICHÉS pour arbitrage', async () => {
        syncMock.mockResolvedValue({
            report: { at: 1, error: null, transactionsAdded: 5, accountsSeen: 1, warnings: [], wasBackfill: true },
            statePatch: { lastUpdate: 1 }, incertaines: [douteuse],
        });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Rattraper l’historique/ }));
        await waitFor(() => expect(screen.getByText(/1 transaction\(s\) à vérifier/)).toBeInTheDocument());
        expect(document.body.textContent).toContain(MARCHAND);
    });

    // ⚠️ LE test de ce bloc.
    it('mode démo activé PENDANT la passe → aucune donnée réelle à l\'écran', async () => {
        syncMock.mockImplementation(async () => {
            // Simule l'activation du mode démo pendant la fenêtre réseau.
            useFinanceStore.setState({ isTestMode: true } as never);
            return {
                report: { at: 1, error: null, transactionsAdded: 5, accountsSeen: 1, warnings: [], wasBackfill: true },
                statePatch: { lastUpdate: 1 }, incertaines: [douteuse],
            };
        });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Rattraper l’historique/ }));
        await waitFor(() => expect(screen.getByText(/Mode démo activé pendant/)).toBeInTheDocument());
        // `innerHTML` : le marchand ne doit être ni dans le texte, ni dans un attribut.
        expect(document.body.innerHTML, 'les vraies données de Marc dans une session persona').not.toContain(MARCHAND);
    });

    it('une nouvelle passe REMET À ZÉRO la liste précédente', async () => {
        syncMock.mockResolvedValue({
            report: { at: 1, error: null, transactionsAdded: 5, accountsSeen: 1, warnings: [], wasBackfill: true },
            statePatch: { lastUpdate: 1 }, incertaines: [douteuse],
        });
        render(<FintableSyncCard />);
        fireEvent.click(screen.getByRole('button', { name: /Rattraper l’historique/ }));
        await waitFor(() => expect(document.body.textContent).toContain(MARCHAND));

        // Passe suivante sans douteuse : l'ancienne liste ne doit pas survivre.
        syncMock.mockResolvedValue({
            report: { at: 2, error: null, transactionsAdded: 0, accountsSeen: 1, warnings: [] },
            statePatch: { lastUpdate: 2 }, incertaines: [],
        });
        fireEvent.click(screen.getByRole('button', { name: /Synchroniser maintenant/ }));
        await waitFor(() => expect(document.body.textContent).not.toContain(MARCHAND));
    });
});
