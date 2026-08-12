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
    // Anti-lockout : révèle la trappe d'échappement même SANS erreur explicite, si la connexion « pend »
    // (réseau dégradé / Google lent — les fetch Google/Drive n'ont pas de timeout → une promesse peut ne
    // jamais résoudre et laisser l'écran figé sur « Connexion en cours… » sans aucune affordance). Finding
    // sécurité 2026-07-14. On ne l'arme QUE dans les états où un hang réseau est possible (`checking` =
    // reprise silencieuse, `logging-in` = login interactif) → le hard-block reste « dur » sur l'écran
    // `needs-login` au repos (l'utilisateur doit cliquer « Se connecter » ; une erreur révèle la trappe).
    const [showEscape, setShowEscape] = useState(false);
    const started = useRef(false);

    useEffect(() => {
        if (phase !== 'checking' && phase !== 'logging-in') return;
        const t = setTimeout(() => setShowEscape(true), 10000);
        return () => clearTimeout(t);
    }, [phase]);
    useEffect(() => {
        if (error) setShowEscape(true); // une erreur explicite révèle la trappe immédiatement
    }, [error]);

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
        <div className="min-h-screen flex items-center justify-center bg-dark px-4">
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
                        className="w-full px-4 py-2.5 rounded-card bg-primary border border-primary text-dark text-meta font-semibold hover:bg-primary/90 disabled:opacity-50 focus-ring"
                    >
                        {phase === 'logging-in' ? 'Connexion…' : 'Se connecter avec Google'}
                    </button>
                )}

                {error && <p role="alert" className="text-tiny text-rose-400 italic">{error}</p>}

                {/* Hard-block (choix Marc 2026-07-14) : pas d'accès tant que non connecté à Drive — la
                    sauvegarde de tes données en dépend. Trappe d'URGENCE : révélée après un échec de
                    connexion OU après un délai si la connexion « pend » (réseau dégradé), pour ne jamais
                    t'enfermer dehors loin de tes propres données. `?nogate=1` en URL reste aussi dispo. */}
                {showEscape ? (
                    <button
                        type="button"
                        onClick={onEscape}
                        className="inline-block min-h-[24px] px-1 py-2 text-tiny text-ink-400 underline underline-offset-2 hover:text-ink-200 focus-ring rounded"
                    >
                        Problème de connexion ? Continuer sans me connecter (données non sauvegardées)
                    </button>
                ) : (
                    <p className="text-tiny text-ink-400 leading-snug">
                        Connexion requise pour sauvegarder tes données automatiquement.
                    </p>
                )}
            </div>
        </div>
    );
}
