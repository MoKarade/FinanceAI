// [PERF-SDK-BOOT-PRELOAD, finding silent-failure #547] L'ErrorBoundary doit router tout crash de
// rendu vers le journal interne (logError → Diagnostics), pas seulement console.error : un chunk
// périmé après un déploiement (PayslipUploadCard lazy, onglets lazy) laisse sinon un fallback
// visible à l'utilisateur mais AUCUNE trace exploitable dans l'app.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../../../components/ui/ErrorBoundary';
import { getErrors, clearErrors } from '../../../services/errorLogger';

const Boom: React.FC = () => {
    throw new Error('chunk périmé simulé');
};

beforeEach(() => {
    clearErrors();
    // React logge le crash en console.error — bruit attendu, silencé pour ce test.
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ErrorBoundary — journalisation des crashs de rendu', () => {
    it('affiche le fallback ET écrit dans le journal interne (logError, source ui)', () => {
        render(
            <ErrorBoundary label="Impôts">
                <Boom />
            </ErrorBoundary>,
        );
        expect(screen.getByText(/Erreur dans « Impôts »/)).toBeInTheDocument();

        const logged = getErrors();
        const entry = logged.find((e) => e.message.includes('Erreur de rendu — Impôts'));
        expect(entry).toBeDefined();
        expect(entry?.source).toBe('ui');
        expect(entry?.severity).toBe('error');
        // La cause réelle (message de l'Error) doit être exploitable depuis le journal.
        expect(JSON.stringify(entry)).toContain('chunk périmé simulé');
    });
});
