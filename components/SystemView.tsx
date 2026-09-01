
import React, { useEffect, useMemo, useState } from 'react';
import { Card } from './ui/Card';
import { AppState, FintableSyncReport } from '../types';
import { formatCAD } from '../utils/format';
import { getMigrationStatus, getHydrationStatus } from '../store/useFinanceStore';
import { LONGUEUR_MAX_DIAGNOSTIC } from '../services/verifierTypesRestaures';
import { ErrorLogViewer } from './system/ErrorLogViewer';
import { AuditLogViewer } from './system/AuditLogViewer';
import { Icon } from './ui/Icon';
import { PrivateAmount } from './ui/PrivateAmount';
import { TAX_BASE_YEAR, FED_BRACKETS, BASIC_PERSONAL_AMOUNT_FED } from '../utils/tax';
import { logError } from '../services/errorLogger';
import { formatRelative } from '../utils/relativeTime';

interface SystemViewProps {
    state: AppState;
}

type LogLine = { text: string; level: 'info' | 'warn' | 'err' };

const logLevelClass: Record<LogLine['level'], string> = {
    err: 'text-danger-400',
    warn: 'text-yellow-400',
    info: 'text-green-400/80',
};

// G22-N5 — Infos de build injectées par Vite (vite.config define) : version
// CalVer, hash git court, horodatage du build. Source unique, auto-tenue à jour
// à chaque déploiement — remplace l'ancien CHANGELOG écrit à la main.
const BUILD_INFO = {
    version: __APP_VERSION__,
    sha: __GIT_SHA__,
    builtAt: __BUILD_DATE__,
};

// formatRelative : déplacé vers utils/relativeTime.ts ([FINTABLE-6 Lot 2] — partagé avec le badge
// de fraîcheur des soldes courtier, une seule copie).

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

    // [STORE-REHYDRATE-SILENT] Chemin DISTINCT de la migration legacy : la réhydratation ZUSTAND
    // (blob financeai-storage illisible / migration persist en erreur) — sans cette ligne, le
    // diagnostic affichait « migration OK » alors que l'app tourne sur l'état par défaut.
    const hydration = getHydrationStatus();
    if (hydration.failed) {
        lines.push({
            // ⚠️ La troncature était à 80 caractères — juste AVANT les chemins des champs fautifs,
            // c'est-à-dire avant la seule information exploitable de tout le diagnostic. Mesuré
            // pendant l'incident du 2026-09-01, dans l'écran qu'on demande à l'utilisateur d'ouvrir.
            text: stamp(`STATE_MGR: ERREUR de réhydratation du store (blob intact, état par défaut chargé) — ${hydration.error?.slice(0, LONGUEUR_MAX_DIAGNOSTIC)}`),
            level: 'err',
        });
    } else {
        lines.push({ text: stamp(`STATE_MGR: réhydratation du store OK`), level: 'info' });
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

    const hasAnthropic = !!state.apiKeys.anthropic;
    lines.push({
        text: stamp(
            `API_KEYS: Anthropic Claude ${hasAnthropic ? '✓' : '✗'}`
        ),
        level: hasAnthropic ? 'info' : 'warn',
    });

    // FA-8 (2026-06-11) — libellé COMPOSÉ depuis les constantes réelles de utils/tax.ts
    // (avant : « 14%, BPA 16 452$ » en dur — mentait dès qu'une constante changeait).
    lines.push({
        text: stamp(
            `TAX_MODULE: barèmes ${TAX_BASE_YEAR} chargés (fédéral 1ère tranche ` +
            // MONTANT-PUBLIC — le montant personnel de base FÉDÉRAL est une valeur de la loi, affichée dans
            // le diagnostic pour vérifier quel barème l'app applique. Ce n'est pas une donnée de Marc.
            `${FED_BRACKETS[0].label}, BPA ${formatCAD(BASIC_PERSONAL_AMOUNT_FED)})`
        ),
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

// [finding silent-failure-hunter, PR #531] `fintableSyncReport` traverse une frontière de sync/
// persistance SANS validation Zod (champ additif, hors schéma `.passthrough()`). Aujourd'hui
// l'unique écrivain (`runFintableSync`) produit toujours des tableaux — mais un état Drive ancien/
// corrompu ou un futur bug ne doit JAMAIS faire planter le RENDER : `debtsUpdated`/`warnings` sont
// rabattus à `[]` s'ils ne sont pas des tableaux, et l'anomalie est TRACÉE (jamais un `?? []` muet).
function normalizeFintableSyncReport(report: FintableSyncReport): { report: FintableSyncReport; anomaly: boolean } {
    const debtsOk = Array.isArray(report.debtsUpdated);
    const warningsOk = Array.isArray(report.warnings);
    if (debtsOk && warningsOk) return { report, anomaly: false };
    return {
        report: {
            ...report,
            debtsUpdated: debtsOk ? report.debtsUpdated : [],
            warnings: warningsOk ? report.warnings : [],
        },
        anomaly: true,
    };
}

export const SystemView: React.FC<SystemViewProps> = ({ state }) => {
    const [refreshKey, setRefreshKey] = useState(0);

    // refreshKey force le recalcul volontairement (incrémenté par le bouton Refresh).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const logs = useMemo(() => computeDiagnostics(state), [state, refreshKey]);

    // [SYSVIEW-DBSIZE-ZERO] `null` et non `0` : un « 0 KB » est une valeur CRÉDIBLE, donc un mensonge
    // — l'utilisateur lit « ma base est vide » alors que la sérialisation vient d'échouer (structure
    // cyclique, mémoire). `computeDiagnostics`, dans CE MÊME fichier, pousse déjà un `level: 'err'`
    // pour le MÊME échec : l'incohérence était entre deux lignes du même écran.
    const dbSize = useMemo<number | null>(() => {
        try { return JSON.stringify(state).length / 1024; } catch { return null; }
    }, [state]);

    const fintableReportSafe = useMemo(
        () => (state.fintableSyncReport ? normalizeFintableSyncReport(state.fintableSyncReport) : null),
        [state.fintableSyncReport],
    );
    useEffect(() => {
        if (fintableReportSafe?.anomaly) {
            logError({
                source: 'ui', severity: 'warning',
                message: 'fintableSyncReport de forme inattendue (debtsUpdated/warnings non-tableau) — rabattu à [].',
            });
        }
    }, [fintableReportSafe]);

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="flex justify-between items-end gap-3">
                <div>
                    <h2 className="text-h1 text-ink-50 tracking-tight">Système &amp; diagnostics</h2>
                    <p className="text-meta text-ink-400 mt-0.5">Local-first.</p>
                </div>
                <span className="shrink-0 text-meta text-info-400 font-bold bg-info-500/10 px-3 py-1 rounded-full border border-info-500/30">
                    ● Local-first
                </span>
            </div>

            {/* P1.1 — Journal d'erreurs local (consultable + exportable) */}
            <ErrorLogViewer />

            {/* SYS-REGROUP — diagnostic placé AVEC le journal d'erreurs (retour Marc) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                <div className="lg:col-span-2 space-y-6">
                    {/* SYS-WEB — « Toile d'araignée » (doc figée, périmée) retirée. */}
                    <Card icon={<Icon name="health" size={18} />} title="Diagnostic système" className="bg-dark border border-white/10 font-mono">
                        <div className="flex justify-between items-center mb-2 px-2">
                            <span className="text-tiny text-ink-400 uppercase tracking-widest">État runtime</span>
                            <button
                                onClick={() => setRefreshKey(k => k + 1)}
                                className="text-tiny text-success-400 hover:text-emerald-300 px-2 py-0.5 rounded bg-success-500/10 hover:bg-success-500/20 transition-colors"
                                aria-label="Rafraîchir le diagnostic"
                            >
                                ⟳ Refresh
                            </button>
                        </div>
                        <div className="h-[260px] overflow-y-auto custom-scrollbar p-2 text-meta space-y-1">
                            {logs.map((line, i) => (
                                <div key={i} className="flex gap-2">
                                    <span className="text-ink-500 select-none" aria-hidden="true">{(i + 1).toString().padStart(3, '0')}</span>
                                    <span className={logLevelClass[line.level]}>
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
                            <div className="text-tiny text-ink-400 uppercase font-bold">Base de Données</div>
                            {/* [SYSVIEW-DBSIZE-ZERO] « — » honnête plutôt qu'un « 0 KB » crédible.
                                `title` porte la raison : l'écart se voit ET s'explique. */}
                            <div
                                className="text-xl font-bold text-white"
                                title={dbSize === null ? 'Taille indisponible : la sérialisation de l’état a échoué (voir les diagnostics ci-dessous)' : undefined}
                            >
                                {dbSize === null ? '—' : `${dbSize.toFixed(0)} KB`}
                            </div>
                        </Card>
                        <Card className="!p-4 bg-white/5 border-white/10">
                            <div className="text-tiny text-ink-400 uppercase font-bold">Objectifs</div>
                            <div className="text-xl font-bold text-white">{state.financialGoals.length}</div>
                        </Card>
                    </div>

                    {/* [FINTABLE-3] Rapport de la dernière passe de sync serveur (cron quotidien) — VISIBLE
                        dans l'app sans notification proactive (choix Marc). Zéro montant $ dans ce rapport
                        (compteurs, dates, noms de dettes saisis par Marc) → pas de gate mode discret nécessaire
                        (la règle protège les VALEURS $, cf CLAUDE.md « Mode discret »). `fintableReportSafe`
                        rabat `debtsUpdated`/`warnings` à `[]` si jamais mal formés (champ additif hors
                        schéma Zod) plutôt que de planter le render (finding silent-failure, PR #531). */}
                    <Card icon={<Icon name="bank" size={18} />} title="Sync Fintable">
                        {!fintableReportSafe ? (
                            <p className="text-meta text-ink-400">
                                Aucune sync automatique n'a encore eu lieu (cron serveur non configuré, ou pas encore déclenché).
                            </p>
                        ) : (
                            <div className="space-y-0 text-body">
                                <div className="flex items-center justify-between py-2 border-b border-white/5">
                                    <span className="text-ink-300">Dernière passe</span>
                                    <span className="font-mono text-white">{formatRelative(fintableReportSafe.report.at)}</span>
                                </div>
                                <div className="flex items-center justify-between py-2 border-b border-white/5">
                                    <span className="text-ink-300">Statut</span>
                                    <span className={fintableReportSafe.report.error ? 'text-danger-400 font-bold' : 'text-success-400 font-bold'}>
                                        {fintableReportSafe.report.error ? 'Échec' : 'OK'}
                                    </span>
                                </div>
                                {fintableReportSafe.report.error && (
                                    <p className="text-meta text-danger-400 break-words py-2 border-b border-white/5">
                                        {fintableReportSafe.report.error}
                                    </p>
                                )}
                                <div className="flex items-center justify-between py-2 border-b border-white/5">
                                    <span className="text-ink-300">Bascule utilisée</span>
                                    <span className="font-mono text-ink-200">{fintableReportSafe.report.cutoverDateUsed ?? 'aucune'}</span>
                                </div>
                                <div className="flex items-center justify-between py-2 border-b border-white/5">
                                    <span className="text-ink-300">Comptes vus</span>
                                    <span className="font-mono text-white">
                                        {fintableReportSafe.report.accountsSeen}
                                        {fintableReportSafe.report.accountsWithoutRole > 0 && (
                                            <span className="text-yellow-400"> ({fintableReportSafe.report.accountsWithoutRole} sans rôle)</span>
                                        )}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between py-2 border-b border-white/5">
                                    <span className="text-ink-300">Transactions ajoutées</span>
                                    <span className="font-mono text-white">{fintableReportSafe.report.transactionsAdded}</span>
                                </div>
                                {fintableReportSafe.report.transfersDetected > 0 && (
                                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                                        <span className="text-ink-300">Virements internes détectés</span>
                                        <span className="font-mono text-white">{fintableReportSafe.report.transfersDetected}</span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between py-2 border-b border-white/5">
                                    <span className="text-ink-300">Liquidités</span>
                                    <span className="font-mono text-white">{fintableReportSafe.report.cashUpdated ? 'mises à jour' : 'inchangées'}</span>
                                </div>
                                {/* [FINTABLE-ANCRE-LIQUIDITE-GONFLEE] Le cash est DÉRIVÉ : pour atteindre le
                                    solde annoncé par la banque, la sync déplace l'ANCRE du compte
                                    « Liquidités » — en silence jusqu'ici. Un doublon qui échappe au
                                    classement la gonfle d'autant (MESURÉ : 1 000 $ → 1 300 $ sur une dépense
                                    de 300 $ comptée deux fois) : le total présent reste juste, mais l'ancre
                                    visible dans Réglages → Comptes ne correspond plus à rien et TOUT
                                    l'historique passé est déplacé. Publier le mouvement ne le corrige pas —
                                    on ne sait pas POURQUOI l'écart existe — mais il cesse d'être invisible.
                                    ⚠️ `undefined` = rapport d'AVANT ce lot : on n'affiche RIEN plutôt qu'un
                                    « 0 $ » qui affirmerait faussement que l'ancre n'a pas bougé. */}
                                {Number.isFinite(fintableReportSafe.report.cashAnchorDelta)
                                    && Math.abs(fintableReportSafe.report.cashAnchorDelta as number) >= 0.01 && (
                                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                                        <span className="text-ink-300">Ancre « Liquidités » déplacée</span>
                                        <PrivateAmount className="font-mono text-warning-400">
                                            {formatCAD(fintableReportSafe.report.cashAnchorDelta as number)}
                                        </PrivateAmount>
                                    </div>
                                )}
                                <div className="flex items-center justify-between py-2 gap-3">
                                    <span className="text-ink-300 shrink-0">Dettes mises à jour</span>
                                    <span className="font-mono text-white text-right">
                                        {fintableReportSafe.report.debtsUpdated.length > 0 ? fintableReportSafe.report.debtsUpdated.join(', ') : 'aucune'}
                                    </span>
                                </div>
                                {fintableReportSafe.report.warnings.length > 0 && (
                                    <div className="pt-2 space-y-1">
                                        {fintableReportSafe.report.warnings.map((w, i) => (
                                            <p key={i} className="text-tiny text-yellow-400">{w}</p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>

                    <Card title="Version & build">
                        <div className="space-y-3 text-body">
                            <p className="text-meta text-ink-400">Auto-injecté à chaque build/déploiement.</p>
                            <div className="flex items-center justify-between py-2 border-b border-white/5">
                                <span className="text-ink-300">Version</span>
                                <span className="font-mono font-bold text-white">v{BUILD_INFO.version}</span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-white/5">
                                <span className="text-ink-300">Commit</span>
                                <span className="font-mono text-success-400">{BUILD_INFO.sha}</span>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <span className="text-ink-300">Build</span>
                                <span className="font-mono text-ink-200">{BUILD_INFO.builtAt}</span>
                            </div>
                        </div>
                    </Card>
                </div>

            </div>

            {/* P1.7 — Journal d'audit (changements de state) */}
            <AuditLogViewer />
        </div>
    );
};
