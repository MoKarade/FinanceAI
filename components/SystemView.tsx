
import React, { useMemo, useState } from 'react';
import { Card } from './ui/Card';
import { AppState } from '../types';
import { getMigrationStatus } from '../store/useFinanceStore';
import { ErrorLogViewer } from './system/ErrorLogViewer';

interface SystemViewProps {
    state: AppState;
}

const CHANGELOG = [
    {
        version: "4.0",
        date: "Aujourd'hui",
        title: "Interconnexion Totale & Sim. 2026",
        features: [
            "Le simulateur Futur démarre formellement en Janvier 2026, avec calcul des variations mensuelles nettes dans l'info-bulle.",
            "L'onglet Impôts est désormais verrouillé et lit ses données directement depuis le profil Config (Fin des incohérences).",
            "La logique Immo annule le loyer du budget dès l'achat. L'enfant génère un coût massif pour ses études à 18 ans.",
            "Sauvegarde continue : Chaque état de curseur (slider) ou option est préservé via le LocalStorage Global."
        ]
    },
    {
        version: "3.2",
        date: "Précédemment",
        title: "Correction Moteur Fiscal & Retraite",
        features: [
            "Moteur hybride (Réel vs Théorique) pour le Futur.",
            "Plafond de croissance immobilière ajouté."
        ]
    }
];

type LogLine = { text: string; level: 'info' | 'warn' | 'err' };

const formatRelative = (ts: number | undefined): string => {
    if (!ts || ts <= 0) return 'jamais';
    const diffMs = Date.now() - ts;
    if (diffMs < 0) return 'futur';
    const sec = Math.round(diffMs / 1000);
    if (sec < 60) return `il y a ${sec}s`;
    const min = Math.round(sec / 60);
    if (min < 60) return `il y a ${min} min`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `il y a ${hr}h`;
    const days = Math.round(hr / 24);
    return `il y a ${days} j`;
};

const computeDiagnostics = (state: AppState): LogLine[] => {
    const now = new Date().toLocaleTimeString();
    const stamp = (txt: string): string => `[${now}] ${txt}`;

    const migration = getMigrationStatus();
    const lines: LogLine[] = [];

    lines.push({ text: stamp(`SYSTEM_INIT: app chargée à ${new Date().toLocaleDateString('fr-CA')}`), level: 'info' });

    if (migration.failed) {
        lines.push({
            text: stamp(`STATE_MGR: ERREUR de migration localStorage — ${migration.error?.slice(0, 80)}`),
            level: 'err',
        });
        if (migration.backupKey) {
            lines.push({
                text: stamp(`STATE_MGR: backup disponible sous "${migration.backupKey}" (F12 → Application)`),
                level: 'warn',
            });
        }
    } else {
        lines.push({ text: stamp(`STATE_MGR: migration localStorage OK`), level: 'info' });
    }

    lines.push({
        text: stamp(
            `STATE_MGR: ${state.transactions.length} tx · ${state.assets.length} actifs · ` +
            `${state.debts.length} dettes · ${state.financialGoals.length} goals`
        ),
        level: 'info',
    });

    lines.push({
        text: stamp(
            `SYNC: dernière mise à jour ${formatRelative(state.lastUpdate)}`
        ),
        level: 'info',
    });

    const fxAge = state.fxRates.lastFetched ?? 0;
    lines.push({
        text: stamp(
            `FX_API: USD=${state.fxRates.USD.toFixed(4)} · EUR=${state.fxRates.EUR.toFixed(4)} ` +
            `(BdC, ${formatRelative(fxAge)})`
        ),
        level: fxAge === 0 ? 'warn' : 'info',
    });

    const hasEra = !!state.apiKeys.eraContext;
    const hasAnthropic = !!state.apiKeys.anthropic;
    lines.push({
        text: stamp(
            `API_KEYS: Era Context ${hasEra ? '✓' : '✗'} · Anthropic Claude ${hasAnthropic ? '✓' : '✗'}`
        ),
        level: (hasEra && hasAnthropic) ? 'info' : 'warn',
    });

    lines.push({
        text: stamp(`TAX_MODULE: barèmes 2026 chargés (fédéral 1ère tranche 14%, BPA 16 452$)`),
        level: 'info',
    });

    try {
        const dbSize = JSON.stringify(state).length / 1024;
        lines.push({
            text: stamp(`STORE: snapshot mémoire ${dbSize.toFixed(1)} KB`),
            level: dbSize > 4000 ? 'warn' : 'info',
        });
    } catch {
        lines.push({ text: stamp(`STORE: impossible de sérialiser l'état (cycle ?)`), level: 'err' });
    }

    if (state.aiConversation && state.aiConversation.length > 0) {
        lines.push({
            text: stamp(`AI_ASSIST: ${state.aiConversation.length} message(s) en historique`),
            level: 'info',
        });
    }

    return lines;
};

export const SystemView: React.FC<SystemViewProps> = ({ state }) => {
    const [refreshKey, setRefreshKey] = useState(0);

    const logs = useMemo(() => computeDiagnostics(state), [state, refreshKey]);

    const dbSize = useMemo(() => {
        try { return JSON.stringify(state).length / 1024; } catch { return 0; }
    }, [state]);

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Système & Logique Interne</h2>
                    <p className="text-gray-400 text-sm">Documentation de l'architecture des données.</p>
                </div>
                <div className="text-right">
                    <div className="text-xs text-blue-400 font-bold bg-blue-900/20 px-3 py-1 rounded-full border border-blue-500/30">
                        ● Local First & Sync
                    </div>
                </div>
            </div>

            {/* P1.1 — Journal d'erreurs local (consultable + exportable) */}
            <ErrorLogViewer />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                <div className="lg:col-span-2 space-y-6">
                    <Card title="📚 La Toile d'Araignée (Interconnexions)">
                        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
                            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                                <h4 className="font-bold text-white mb-2 text-lg text-blue-400">1. Le Moteur "Futur" (Départ 2026)</h4>
                                <p>L'algorithme démarre en janvier 2026 et applique chaque mois les règles suivantes :</p>
                                <ul className="list-disc pl-5 mt-1 space-y-1 text-gray-400">
                                    <li><strong>Dettes :</strong> Déduit le paiement (Min + Extra) jusqu'à extinction, augmentant le cashflow dispo.</li>
                                    <li><strong>Immobilier :</strong> À la date d'achat, le budget "Loyer" est annulé. L'Hypothèque, les taxes et l'entretien s'activent. La valeur de la maison croît jusqu'à son plafond maximum.</li>
                                    <li><strong>Enfant :</strong> Un coût mensuel s'applique jusqu'à 18 ans, suivi d'un retrait massif (30k$) pour les études supérieures simulées.</li>
                                </ul>
                            </div>

                            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                                <h4 className="font-bold text-white mb-2 text-lg text-red-400">2. L'Axe Fédéral/Provincial (Impôts)</h4>
                                <p>Pour éviter les erreurs de saisie :</p>
                                <ul className="list-disc pl-5 mt-1 space-y-1 text-gray-400">
                                    <li>L'onglet "Impôts & Docs" est <strong>verrouillé</strong>. Il lit le Salaire Net défini dans "Config" et extrapole le Brut via un ratio (x1.35).</li>
                                    <li>L'IA lit vos T4 pour déduire vos impôts payés. Tout surplus génère un "Remboursement", toute carence augmente la dette fiscale à payer en avril dans le Futur.</li>
                                </ul>
                            </div>

                            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                                <h4 className="font-bold text-white mb-2 text-lg text-emerald-400">3. Persistance Global State</h4>
                                <p>Aucun rafraîchissement ne vous fera perdre vos données.</p>
                                <p className="text-gray-400 mt-1">Le composant racine (App.tsx) agit comme un Singleton. Chaque manipulation de slider ou d'objectif déclenche un <code>localStorage.setItem()</code>. Le passage d'un onglet à l'autre ne démonte que l'UI, pas la Data.</p>
                            </div>
                        </div>
                    </Card>

                    <Card title="Diagnostic Système" className="bg-[#0c0c0c] border border-white/10 font-mono">
                        <div className="flex justify-between items-center mb-2 px-2">
                            <span className="text-tiny text-gray-500 uppercase tracking-widest">État runtime</span>
                            <button
                                onClick={() => setRefreshKey(k => k + 1)}
                                className="text-tiny text-emerald-400 hover:text-emerald-300 px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                                aria-label="Rafraîchir le diagnostic"
                            >
                                ⟳ Refresh
                            </button>
                        </div>
                        <div className="h-[260px] overflow-y-auto custom-scrollbar p-2 text-xs space-y-1">
                            {logs.map((line, i) => (
                                <div key={i} className="flex gap-2">
                                    <span className="text-gray-600 select-none">{(i + 1).toString().padStart(3, '0')}</span>
                                    <span className={
                                        line.level === 'err' ? 'text-red-400' :
                                            line.level === 'warn' ? 'text-yellow-400' :
                                                'text-green-400/80'
                                    }>
                                        {line.text}
                                    </span>
                                </div>
                            ))}
                            <div className="animate-pulse text-green-500">_</div>
                        </div>
                    </Card>
                </div>

                <div className="lg:col-span-1 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <Card className="!p-4 bg-white/5 border-white/10">
                            <div className="text-tiny text-gray-500 uppercase font-bold">Base de Données</div>
                            <div className="text-xl font-bold text-white">{dbSize.toFixed(0)} KB</div>
                        </Card>
                        <Card className="!p-4 bg-white/5 border-white/10">
                            <div className="text-tiny text-gray-500 uppercase font-bold">Objectifs</div>
                            <div className="text-xl font-bold text-white">{state.financialGoals.length}</div>
                        </Card>
                    </div>

                    <Card title="Historique">
                        <div className="relative border-l border-white/10 ml-3 space-y-6 py-2">
                            {CHANGELOG.map((log, i) => (
                                <div key={i} className="relative pl-6">
                                    <div className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ${i === 0 ? 'bg-primary shadow-[0_0_10px_#10b981]' : 'bg-gray-600'}`}></div>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className={`text-sm font-bold ${i === 0 ? 'text-white' : 'text-gray-400'}`}>v{log.version}</span>
                                        <span className="text-tiny text-gray-500">{log.date}</span>
                                    </div>
                                    <div className={`text-xs font-bold mb-2 ${i === 0 ? 'text-primary' : 'text-gray-300'}`}>{log.title}</div>
                                    <ul className="space-y-1">
                                        {log.features.map((feat, j) => (
                                            <li key={j} className="text-meta text-gray-400 leading-tight flex items-start gap-2">
                                                <span className="text-white/20">•</span>{feat}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

            </div>
        </div>
    );
};
