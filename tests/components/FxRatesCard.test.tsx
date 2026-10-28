/**
 * [FX-TAUX-JAMAIS-ARRIVES] La carte qui donne enfin un RECOURS.
 *
 * ⚠️ Ce que ce fichier défend n'est pas « la carte s'affiche » mais « les deux gestes existent et
 * ABOUTISSENT ». Avant ce lot, le badge « Taux de change estimés » nommait le problème depuis des
 * mois sur l'écran Investissements, et rien dans toute l'app ne pouvait le faire taire : la lecture
 * automatique ne tourne qu'au démarrage. Un avertissement sans issue apprend à être ignoré —
 * `UN-ETAT-DE-FILTRAGE-SANS-CONTROLE-QUI-LE-RALLUME-EST-UNE-TRAPPE`, appliqué à un diagnostic.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fetchFxRatesMock = vi.fn();
vi.mock('../../services/finance', () => ({ fetchFxRates: (...a: unknown[]) => fetchFxRatesMock(...a) }));

import { FxRatesCard, lireTauxSaisi, TAUX_MAX } from '../../components/settings/FxRatesCard';
import { useFinanceStore } from '../../store/useFinanceStore';

const etatRepli = {
    fxRates: { USD: 1.40, EUR: 1.47, CAD: 1, lastFetched: 0 },
    fxRatesEstimated: true,
    fxRatesSource: 'repli' as const,
    fxLastAttemptCause: 'reseau',
    fxLastAttemptAt: Date.parse('2026-09-16T10:00:00Z'),
};

beforeEach(() => {
    fetchFxRatesMock.mockReset();
    useFinanceStore.setState(etatRepli);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('lireTauxSaisi — ce qu\'on refuse, et ce qu\'on ne refuse PAS', () => {
    it('accepte un taux plausible, virgule comprise', () => {
        expect(lireTauxSaisi('1.3845')).toEqual({ valeur: 1.3845 });
        expect(lireTauxSaisi(' 1,3845 ')).toEqual({ valeur: 1.3845 }); // clavier québécois
    });

    it('refuse ce qui est FAUX par construction, en disant lequel des cas', () => {
        expect(lireTauxSaisi('')).toHaveProperty('erreur');
        expect(lireTauxSaisi('abc')).toHaveProperty('erreur');
        expect(lireTauxSaisi('0')).toHaveProperty('erreur');
        expect(lireTauxSaisi('-1.3')).toHaveProperty('erreur');
        expect(lireTauxSaisi(String(TAUX_MAX + 1))).toHaveProperty('erreur');
        // Chaque refus NOMME son cas : « invalide » enverrait chercher au hasard.
        const messages = ['', 'abc', '0', '-1.3'].map((v) => (lireTauxSaisi(v) as { erreur: string }).erreur);
        expect(new Set(messages).size).toBeGreaterThan(1);
    });

    it('⚠️ n\'impose AUCUNE fourchette « plausible »', () => {
        // Un intervalle 1,0–2,0 refuserait une valeur légitime le jour où le change bouge vraiment —
        // c'est-à-dire précisément le jour où la saisie manuelle sert.
        expect(lireTauxSaisi('3.6')).toEqual({ valeur: 3.6 });   // BRL/CAD, plausible ailleurs
        expect(lireTauxSaisi('0.72')).toEqual({ valeur: 0.72 });
    });
});

describe('le bouton « Réessayer maintenant »', () => {
    it('FORCE la lecture — sinon le cache de 24 h en ferait un no-op silencieux', async () => {
        fetchFxRatesMock.mockResolvedValue({
            USD: 1.3845, EUR: 1.4512, CAD: 1, lastFetched: 2_000, estimated: false,
            source: 'api', cause: 'ok', attemptAt: 2_000,
        });
        render(<FxRatesCard />);
        await userEvent.click(screen.getByRole('button', { name: /Réessayer maintenant/i }));

        await waitFor(() => expect(fetchFxRatesMock).toHaveBeenCalledWith({ force: true }));
        await waitFor(() => expect(useFinanceStore.getState().fxRatesSource).toBe('api'));
        expect(useFinanceStore.getState().fxRates.USD).toBe(1.3845);
    });

    it('un ÉCHEC est écrit lui aussi — « essayé » ne doit pas ressembler à « jamais tenté »', async () => {
        fetchFxRatesMock.mockResolvedValue({
            USD: 1.40, EUR: 1.47, CAD: 1, lastFetched: 0, estimated: true,
            source: 'repli', cause: 'http', attemptAt: 9_999,
        });
        render(<FxRatesCard />);
        await userEvent.click(screen.getByRole('button', { name: /Réessayer maintenant/i }));

        await waitFor(() => expect(useFinanceStore.getState().fxLastAttemptCause).toBe('http'));
        expect(useFinanceStore.getState().fxLastAttemptAt).toBe(9_999);
        expect(await screen.findByText(/Lecture sans succès/i)).toBeTruthy();
    });
});

describe('la saisie manuelle', () => {
    it('applique les deux taux et les marque comme VENANT DE MARC', async () => {
        render(<FxRatesCard />);
        await userEvent.type(screen.getByLabelText(/USD → CAD/i), '1.3845');
        await userEvent.type(screen.getByLabelText(/EUR → CAD/i), '1.4512');
        await userEvent.click(screen.getByRole('button', { name: /Appliquer ces taux/i }));

        const s = useFinanceStore.getState();
        expect(s.fxRates.USD).toBe(1.3845);
        expect(s.fxRates.EUR).toBe(1.4512);
        expect(s.fxRatesSource).toBe('manuel');
        // ⚠️ `lastFetched` date les lectures RÉUSSIES de la Banque du Canada : y écrire l'instant
        // d'une saisie ferait afficher « taux à jour (BdC) » sur un chiffre tapé à la main.
        expect(s.fxRates.lastFetched).toBe(0);
    });

    it('une saisie invalide n\'écrit RIEN et dit laquelle des deux', async () => {
        render(<FxRatesCard />);
        await userEvent.type(screen.getByLabelText(/USD → CAD/i), '1.3845');
        await userEvent.type(screen.getByLabelText(/EUR → CAD/i), 'zéro');
        await userEvent.click(screen.getByRole('button', { name: /Appliquer ces taux/i }));

        expect(useFinanceStore.getState().fxRates.USD).toBe(1.40); // inchangé
        expect(useFinanceStore.getState().fxRatesSource).toBe('repli');
        // ⚠️ DEUX nœuds portent le message, et c'est voulu : le paragraphe d'erreur (visible) et la
        // région live (annoncée). Peint SEULEMENT, il n'existait pas pour un lecteur d'écran — donc
        // la fonctionnalité que cette carte ajoute était muette au clavier, exactement pour qui
        // n'a qu'elle comme recours (finding a11y, panel #978).
        const noeuds = await screen.findAllByText(/^EUR :/);
        expect(noeuds.length).toBe(2);
        expect(screen.getByRole('status').textContent).toMatch(/^EUR :/);
    });
});

describe('accessibilité et honnêteté de l\'écran', () => {
    it('la région live est montée DÈS LE DÉPART, vide — sinon elle rate la 1re annonce', () => {
        // `UNE-REGION-LIVE-MONTEE-CONDITIONNELLEMENT-N-ANNONCE-PAS` : la première transition est la
        // seule qui compte, et c'est justement celle qu'un nœud inséré au moment de parler manque.
        render(<FxRatesCard />);
        const live = screen.getByRole('status');
        expect(live).toBeTruthy();
        expect(live.textContent).toBe('');
    });

    it('dit que le repli n\'a pas le droit d\'écrire un total de compte', async () => {
        render(<FxRatesCard />);
        expect(screen.getByText(/n'a pas le droit d'écrire un total de compte/i)).toBeTruthy();
    });

    it('ne dit PAS cet avertissement quand le taux fait autorité', () => {
        useFinanceStore.setState({ ...etatRepli, fxRatesSource: 'api', fxRatesEstimated: false });
        render(<FxRatesCard />);
        expect(screen.queryByText(/n'a pas le droit d'écrire un total de compte/i)).toBeNull();
    });
});

// ⚠️⚠️ [FX-OBSERVATION-COHORTE, revue panel 2026-09-17] LE BOUTON DÉTRUISAIT LE RECOURS QU'IL SERT.
//
// Le gestionnaire écrivait le résultat SANS CONDITION, court-circuitant `decisionEcritureFx` — la
// décision pure écrite pour ce cas exact et testée pour lui. Sur un état qui FAIT AUTORITÉ, un seul
// clic pendant une panne ramenait le littéral du dépôt.
//
// ⚠️ Pourquoi la garde d'à côté ne pouvait pas le voir : elle part de `etatRepli`, un état SANS
// autorité ET aux mêmes valeurs 1,40 / 1,47 que le repli rendu par le mock. Le défaut y est
// structurellement indiscernable (`UNE-FIXTURE-QUI-SATURE-LA-CONTRAINTE-REND-LA-MESURE-AVEUGLE`).
describe('un clic ne peut pas détruire un taux qui fait autorité', () => {
    const etatManuel = {
        fxRates: { USD: 1.3947, EUR: 1.6073, CAD: 1, lastFetched: 0 },
        fxRatesEstimated: true,
        fxRatesSource: 'manuel' as const,
        fxLastAttemptCause: 'manuel',
        fxLastAttemptAt: Date.parse('2026-09-17T09:00:00Z'),
        fxObservationDate: undefined,
    };

    it('lecture en ÉCHEC sur un état « manuel » → les taux saisis SURVIVENT', async () => {
        useFinanceStore.setState(etatManuel);
        fetchFxRatesMock.mockResolvedValue({
            USD: 1.40, EUR: 1.47, CAD: 1, lastFetched: 0,
            estimated: true, source: 'repli', cause: 'reseau', attemptAt: Date.now(),
        });
        render(<FxRatesCard />);
        await userEvent.click(screen.getByRole('button', { name: /Réessayer maintenant/i }));

        await waitFor(() => {
            expect(useFinanceStore.getState().fxLastAttemptCause).toBe('reseau');
        });
        const apres = useFinanceStore.getState();
        expect(apres.fxRates.USD).toBe(1.3947);
        expect(apres.fxRates.EUR).toBe(1.6073);
        expect(apres.fxRatesSource).toBe('manuel');
    });

    it('…et le clic laisse quand même sa TRACE (sinon le bouton aurait l\'air cassé)', async () => {
        useFinanceStore.setState({ ...etatManuel, fxLastAttemptAt: 1 });
        fetchFxRatesMock.mockResolvedValue({
            USD: 1.40, EUR: 1.47, CAD: 1, lastFetched: 0,
            estimated: true, source: 'repli', cause: 'http', attemptAt: 987_654_321,
        });
        render(<FxRatesCard />);
        await userEvent.click(screen.getByRole('button', { name: /Réessayer maintenant/i }));

        await waitFor(() => {
            expect(useFinanceStore.getState().fxLastAttemptAt).toBe(987_654_321);
        });
        expect(useFinanceStore.getState().fxLastAttemptCause).toBe('http');
    });

    it('contrôle négatif : une lecture RÉUSSIE écrit bien, elle (sinon la garde bloquerait tout)', async () => {
        useFinanceStore.setState(etatRepli);
        fetchFxRatesMock.mockResolvedValue({
            USD: 1.3947, EUR: 1.6073, CAD: 1, lastFetched: Date.now(),
            estimated: false, source: 'api', cause: 'ok', attemptAt: Date.now(),
            observationDate: '2026-09-16',
        });
        render(<FxRatesCard />);
        await userEvent.click(screen.getByRole('button', { name: /Réessayer maintenant/i }));

        await waitFor(() => {
            expect(useFinanceStore.getState().fxRates.EUR).toBe(1.6073);
        });
        expect(useFinanceStore.getState().fxRatesSource).toBe('api');
        expect(useFinanceStore.getState().fxObservationDate).toBe('2026-09-16');
    });
});
