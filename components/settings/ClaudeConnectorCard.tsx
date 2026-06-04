// components/settings/ClaudeConnectorCard.tsx
//
// « Bouton dans l'app » pour connecter FinanceAI à Claude (assistant IA) en quelques clics, via le
// bundle MCP (.mcpb) : l'utilisateur télécharge UN fichier, l'ouvre (Claude Desktop l'installe en 1
// clic, Node inclus), puis dit « connecte mes finances » (consentement Google, client OAuth partagé).
// Aucun terminal, aucun Google Cloud, aucune installation technique.
//
// L'URL du .mcpb est configurable (VITE_CONNECTOR_MCPB_URL) ; par défaut on le sert depuis l'app
// (`/financeai-connector.mcpb` à déposer dans public/ après `npm run mcp:pack`).

import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';

const MCPB_URL = (import.meta.env.VITE_CONNECTOR_MCPB_URL as string | undefined) || '/financeai-connector.mcpb';
const CLAUDE_DOWNLOAD = 'https://claude.ai/download';

const StepNum: React.FC<{ n: number }> = ({ n }) => (
    <span className="flex-shrink-0 w-6 h-6 inline-flex items-center justify-center rounded-full bg-primary/20 text-primary text-tiny font-bold">{n}</span>
);

type McpbStatus = 'checking' | 'available' | 'unavailable';

// Vérifie que le .mcpb est RÉELLEMENT servi avant de proposer le téléchargement : sinon le bouton
// pointait vers un fichier absent → 404 (ou, pire, le fallback SPA renvoyant index.html → on
// « téléchargeait » du HTML). On teste en HEAD + on rejette un content-type text/html.
export const ClaudeConnectorCard: React.FC = () => {
    const [status, setStatus] = useState<McpbStatus>('checking');

    useEffect(() => {
        let cancelled = false;
        fetch(MCPB_URL, { method: 'HEAD' })
            .then((r) => {
                const ct = r.headers.get('content-type') || '';
                const ok = r.ok && !ct.includes('text/html'); // 404 ou fallback SPA (HTML) ⇒ indisponible
                if (!cancelled) setStatus(ok ? 'available' : 'unavailable');
            })
            .catch(() => { if (!cancelled) setStatus('unavailable'); });
        return () => { cancelled = true; };
    }, []);

    return (
        <Card title="🤖 Connecter à Claude (assistant IA)">
            <div className="space-y-4">
                <p className="text-tiny text-gray-400 leading-snug">
                    Pose tes questions sur tes finances à Claude (« suis-je sur la bonne voie pour la retraite ? »,
                    « quel est mon taux d'impôt ? ») et <strong>envoie-lui tes documents</strong> (paie, relevés
                    bancaires/courtage, feuillets) — il les range dans <strong>ton</strong> Google Drive FinanceAI, tout seul.
                </p>

                <ol className="space-y-3">
                    <li className="flex items-start gap-3 text-meta text-ink-200">
                        <StepNum n={1} />
                        <span>
                            Installe <a href={CLAUDE_DOWNLOAD} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">Claude Desktop</a> (gratuit, Mac/Windows).
                        </span>
                    </li>
                    <li className="flex items-start gap-3 text-meta text-ink-200">
                        <StepNum n={2} />
                        <span>
                            {status === 'available' && (
                                <>
                                    <a
                                        href={MCPB_URL}
                                        download
                                        className="inline-block px-3 py-1.5 rounded-card bg-primary/15 border border-primary/40 text-primary font-medium hover:bg-primary/25"
                                    >
                                        ⬇ Télécharger le connecteur FinanceAI
                                    </a>
                                    <span className="block mt-1">puis <strong>ouvre le fichier</strong> → Claude Desktop l'installe en un clic.</span>
                                </>
                            )}
                            {status === 'checking' && (
                                <span className="inline-block px-3 py-1.5 rounded-card bg-white/5 border border-white/10 text-ink-400 font-medium">
                                    Vérification du connecteur…
                                </span>
                            )}
                            {status === 'unavailable' && (
                                <span className="block rounded-card bg-amber-500/10 border border-amber-500/30 text-amber-200 px-3 py-2 text-tiny leading-snug">
                                    ⏳ Le connecteur n'est pas encore disponible au téléchargement. Il arrive bientôt —
                                    en attendant, l'installation manuelle est décrite dans <code>mcp/README.md</code>.
                                </span>
                            )}
                        </span>
                    </li>
                    <li className="flex items-start gap-3 text-meta text-ink-200">
                        <StepNum n={3} />
                        <span>
                            Dans Claude, dis « <strong>connecte mes finances</strong> » → autorise avec ton compte Google.
                            Ton Drive reste <strong>privé et isolé</strong> ; chaque utilisateur ne voit que ses données.
                        </span>
                    </li>
                </ol>

                <p className="text-tiny text-gray-500 leading-snug">
                    Aucune installation technique (Node est inclus dans Claude Desktop), aucun compte développeur.
                    Tes données restent dans <strong>ton</strong> Google Drive.
                </p>
            </div>
        </Card>
    );
};
