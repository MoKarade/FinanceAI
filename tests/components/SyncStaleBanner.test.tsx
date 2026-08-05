/**
 * @vitest-environment jsdom
 *
 * [FINTABLE-STALE-ALERT] La bannière qui aurait épargné 5 jours d'import gelé à Marc (2026-08-05).
 * Ce qu'on verrouille : elle PARLE quand le flux est figé sans erreur (le cas trompeur), elle se
 * TAIT quand tout va bien ou en mode démo, et elle nomme la cause plutôt qu'un « problème » vague.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SyncStaleBanner } from '../../components/dashboard/SyncStaleBanner';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { FintableSyncReport, Transaction } from '../../types';

const dayMs = 86_400_000;
const iso = (msAgo: number): string => new Date(Date.now() - msAgo).toISOString().slice(0, 10);

const tx = (date: string, id: number): Transaction => ({
    id, date, payee: 'Payroll /ROBOVIC INC.', amount: 837.31, category: 'Salaire', status: 'processed',
});

/** Historique quotidien : donne une cadence médiane de 1 jour → seuil de gel à 3 jours. */
const dailyHistory = (fromDaysAgo: number, count: number): Transaction[] =>
    Array.from({ length: count }, (_, i) => tx(iso((fromDaysAgo + i) * dayMs), i + 1));

const report = (over: Partial<FintableSyncReport> = {}): FintableSyncReport => ({
    at: Date.now() - 3_600_000, cutoverDateUsed: '2026-07-01', accountsSeen: 6, accountsWithoutRole: 0,
    transactionsAdded: 0, transfersDetected: 0, cashUpdated: true, debtsUpdated: [],
    investmentReferenceCount: 1, warnings: [], error: null, ...over,
});

beforeEach(() => {
    useFinanceStore.setState({ isTestMode: false, transactions: [], fintableSyncReport: undefined });
});

describe('SyncStaleBanner', () => {
    it('IMPORT GELÉ sans erreur (le cas de l\'incident) → alerte visible qui nomme la cause', () => {
        useFinanceStore.setState({ transactions: dailyHistory(5, 40), fintableSyncReport: report() });
        render(<SyncStaleBanner />);
        const alert = screen.getByRole('alert', { name: /Fraîcheur de l'import bancaire/i });
        expect(alert).toHaveTextContent(/Import bancaire figé/i);
        // La CAUSE probable, pas un « problème » vague — c'est ce qui rend l'alerte actionnable.
        expect(alert).toHaveTextContent(/abonnement expiré|ré-autoriser/i);
        expect(screen.getByRole('button', { name: /réglages de synchronisation/i })).toBeInTheDocument();
    });

    it('import à jour → AUCUNE bannière (sinon on apprend à l\'ignorer)', () => {
        useFinanceStore.setState({ transactions: dailyHistory(0, 40), fintableSyncReport: report() });
        const { container } = render(<SyncStaleBanner />);
        expect(container).toBeEmptyDOMElement();
    });

    it('passe en ÉCHEC → alerte distincte, avec le code d\'erreur d\'origine', () => {
        useFinanceStore.setState({
            transactions: dailyHistory(0, 40),
            fintableSyncReport: report({ error: '[AUTH] jeton invalide' }),
        });
        render(<SyncStaleBanner />);
        const alert = screen.getByRole('alert', { name: /Fraîcheur de l'import bancaire/i });
        expect(alert).toHaveTextContent(/Synchronisation bancaire en échec/i);
        expect(alert).toHaveTextContent(/\[AUTH\]/);
    });

    it('MODE DÉMO → silence (des données de persona sont figées par nature)', () => {
        useFinanceStore.setState({
            isTestMode: true, transactions: dailyHistory(5, 40), fintableSyncReport: report(),
        });
        const { container } = render(<SyncStaleBanner />);
        expect(container).toBeEmptyDOMElement();
    });

    it('import JAMAIS configuré → silence (on alerte sur une chute, pas sur une absence)', () => {
        useFinanceStore.setState({ transactions: dailyHistory(5, 40), fintableSyncReport: undefined });
        const { container } = render(<SyncStaleBanner />);
        expect(container).toBeEmptyDOMElement();
    });
});
