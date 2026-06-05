import React, { useEffect, useRef, useState } from 'react';
import { isGateEnabled, isGateEscaped, setGateEscaped, isGateAuthedThisSession } from '../../services/sync/authGate';
import { initSync, gateSilentResume, connectAndSync, getSyncStatus } from '../../services/sync/syncOrchestrator';

/**
 * R2 — Gate de login Google (un seul login pour l'app + la sync, remplace Cloudflare Access).
 *
 * INERTE par défaut (livraison « dark ») : si `isGateEnabled()` est faux (pas de
 * VITE_GOOGLE_GATE ou pas de Client ID), on rend l'app directement → comportement prod inchangé.
 *
 * Actif : au montage on tente une reprise SILENCIEUSE (zéro clic si une session Google existe et
 * que le consentement a déjà été donné — y compris en navigation privée). Sinon on affiche
 * « Se connecter avec Google ». La connexion réussie déclenche la restauration auto (pull).
 *
 * Trappe ANTI-LOCKOUT : « Continuer sans me connecter » (ou `?nogate=1`) entre toujours dans
 * l'app en local → on ne se retrouve jamais enfermé dehors si Google tombe.
 */
type Phase = 'checking' | 'needs-login' | 'logging-in' | 'authenticated' | 'escaped';

interface LoginGateProps {
    children: React.ReactNode;
}

export function LoginGate({ children }: LoginGateProps): React.ReactElement {
    const [phase, setPhase] = useState<Phase>(() => {
        if (!isGateEnabled()) return 'authenticated'; // gate off → app directe (dark)
        if (isGateEscaped()) return 'escaped'; // trappe anti-lockout déjà choisie
        // Déjà connecté cette session (onglet) → on rend l'app directement, SANS re-bloquer derrière
        // l'écran de login. La restauration réhydrate en place (sans reload), mais en cas de refresh
        // manuel le jeton (en mémoire) peut être perdu → l'app le ré-acquiert en silencieux au boot
        // (runBootSync). Sans ce flag, Marc devait se reconnecter une 2e fois (friction 2026-05-29).
        if (isGateAuthedThisSession()) return 'authenticated';
        return 'checking';
    });
    const [error, setError] = useState<string | null>(null);
    const started = useRef(false);

    useEffect(() => {
        if (phase !== 'checking' || started.current) return;
        started.current = true;
        // Le gate s'évalue avant le boot de App → on configure gisAuth ici (idempotent).
        initSync(import.meta.env.VITE_GOOGLE_CLIENT_ID);
        let cancelled = false;
        void (async () => {
            const ok = await gateSilentResume(); // restaure en place ; ok=true si authentifié
            if (cancelled) return;
            setPhase(ok ? 'authenticated' : 'needs-login');
        })();
        return () => {
            cancelled = true;
        };
    }, [phase]);

    if (phase === 'authenticated' || phase === 'escaped') {
        return <>{children}</>;
    }

    const onLogin = async (): Promise<void> => {
        setError(null);
        setPhase('logging-in');
        try {
            await connectAndSync(); // interactif ; restaure en place (réhydratation, sans reload)
            if (getSyncStatus().connected) {
                setPhase('authenticated');
            } else {
                setError(getSyncStatus().error ?? 'Connexion impossible. Réessaie.');
                setPhase('needs-login');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Connexion impossible. Réessaie.');
            setPhase('needs-login');
        }
    };

    const onEscape = (): void => {
        setGateEscaped();
        setPhase('escaped');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
            <div className="w-full max-w-sm text-center space-y-6">
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold text-white">FinanceAI</h1>
                    <p className="text-meta text-ink-200 leading-snug">
                        Connecte-toi avec Google pour retrouver tes données sur tous tes appareils,
                        automatiquement.
                    </p>
                </div>

                {phase === 'checking' ? (
                    <p className="text-meta text-ink-300 animate-pulse">Connexion en cours…</p>
                ) : (
                    <button
                        type="button"
                        onClick={onLogin}
                        disabled={phase === 'logging-in'}
                        className="w-full px-4 py-2.5 rounded-card bg-primary/15 border border-primary/40 text-primary text-meta font-medium hover:bg-primary/25 disabled:opacity-50"
                    >
                        {phase === 'logging-in' ? 'Connexion…' : 'Se connecter avec Google'}
                    </button>
                )}

                {error && <p className="text-tiny text-rose-400 italic">{error}</p>}

                <button
                    type="button"
                    onClick={onEscape}
                    className="text-tiny text-ink-500 underline underline-offset-2 hover:text-ink-200"
                >
                    Continuer sans me connecter
                </button>
            </div>
        </div>
    );
}
