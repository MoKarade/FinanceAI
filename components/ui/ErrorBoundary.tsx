import React from 'react';

interface ErrorBoundaryProps {
    children: React.ReactNode;
    /** Quand cette clé change, l'état d'erreur est réinitialisé. */
    resetKey?: string | number;
    /** Fallback custom: reçoit l'erreur et une fonction retry. */
    fallback?: (error: Error, retry: () => void) => React.ReactNode;
    /** Label de l'onglet/section, affiché dans le fallback par défaut. */
    label?: string;
}

interface ErrorBoundaryState {
    error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[FinanceAI ErrorBoundary]', this.props.label || 'unknown', error, info.componentStack);
    }

    componentDidUpdate(prevProps: ErrorBoundaryProps) {
        if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null });
        }
    }

    private retry = () => this.setState({ error: null });

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        if (this.props.fallback) {
            return this.props.fallback(error, this.retry);
        }

        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] p-8 bg-red-900/10 border border-danger-500/20 rounded-2xl m-4">
                <div className="text-5xl mb-4" aria-hidden="true">⚠️</div>
                <h2 className="text-xl font-bold text-red-300 mb-2">
                    {this.props.label ? `Erreur dans « ${this.props.label} »` : 'Erreur dans cet onglet'}
                </h2>
                <p className="text-body text-ink-300 mb-6 max-w-md text-center">
                    Quelque chose s'est mal passé. Tes données sont en sécurité — tu peux réessayer ou changer d'onglet.
                </p>
                <details className="mb-6 max-w-md w-full">
                    <summary className="text-meta text-ink-500 cursor-pointer hover:text-ink-200 select-none">
                        Détails techniques
                    </summary>
                    <pre className="text-tiny text-red-200/70 bg-black/40 p-3 rounded mt-2 overflow-auto max-h-48 whitespace-pre-wrap break-words">
                        {error.name}: {error.message}
                        {error.stack ? `\n\n${error.stack}` : ''}
                    </pre>
                </details>
                <button
                    onClick={this.retry}
                    className="px-4 py-2 bg-danger-500/20 border border-danger-500/40 rounded-lg text-red-200 text-body font-bold hover:bg-danger-500/30 transition-colors"
                >
                    Réessayer
                </button>
            </div>
        );
    }
}
