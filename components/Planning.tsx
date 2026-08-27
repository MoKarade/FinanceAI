import React, { useCallback, useMemo, useState } from 'react';
import { logError } from '../services/errorLogger';
// [PRIV-PAYEE-MODE-DISCRET] Un nom d'abonnement EST un nom de marchand (décision Marc 2026-08-17).
import { PrivateText } from './ui/PrivateText';
import { maskPayee } from '../utils/privacyAria';
import { Transaction, RecurringItem } from '../types';
import { Card } from './ui/Card';
import { Icon, type IconName } from './ui/Icon';
import { ProjectionRequired } from './ui/ProjectionRequired';
import { PrivateAmount } from './ui/PrivateAmount';
// Phase 4 A5: bascule sur services/claude.ts (Haiku 4.5)
import { detectSubscriptionsAI } from '../services/claude';
// [TX-SUBSCRIPTIONS] Abonnements fantômes : hausse de prix silencieuse, service qui a cessé d'être
// débité. Modules PURS et légers (aucune dépendance) — dérivés des profils de récurrence.
import { buildMerchantProfiles, merchantKey } from '../services/transactions/merchantProfile';
import { detectSubscriptionAlerts, type SubscriptionAlertInput } from '../services/transactions/subscriptionAlerts';
import { showToast } from './ui/Toast';
import { formatCAD, formatPercent } from '../utils/format';
import { useFinanceStore } from '../store/useFinanceStore';
import { mergeSubscriptions, addSubscription, removeSubscription, isPinned, subscriptionKey, dismissSubscription, restoreSubscription, monthlyEquivalent, totalMonthlyCost, totalYearlyCost, isAnnualSubscription, subscriptionDueLabel } from '../utils/subscriptions';

/** Icône ligne d'un abonnement selon le marchand (sobre, remplace les emoji). */
const subIcon = (payee: string): IconName => {
    const p = (payee || '').toLowerCase();
    if (p.includes('netflix') || p.includes('disney') || p.includes('prime')) return 'tv';
    if (p.includes('spotify') || p.includes('apple music') || p.includes('deezer')) return 'music';
    if (p.includes('hydro') || p.includes('électric') || p.includes('energir')) return 'actions';
    if (p.includes('internet') || p.includes('bell') || p.includes('videotron') || p.includes('telus')) return 'wifi';
    if (p.includes('loyer') || p.includes('hypoth')) return 'real-estate';
    return 'transactions';
};

// [PH4-F] référence stable pour le fallback (évite une nouvelle [] à chaque render → recompute du useMemo).
const EMPTY_SUBS: RecurringItem[] = [];
/** [SUBS-TAB] Référence stable — même raison que EMPTY_SUBS (évite un re-render par tick). */
const EMPTY_DISMISSED: string[] = [];

interface PlanningProps {
    transactions: Transaction[];
    apiKey?: string;
}

export const Planning: React.FC<PlanningProps> = ({ transactions, apiKey }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiSubs, setAiSubs] = useState<RecurringItem[] | null>(null);
    // [PH4-F] abonnements ÉPINGLÉS (persistés dans le store) — survivent au reload sans re-détection IA.
    const isPrivacyMode = useFinanceStore(s => s.isPrivacyMode);
    const pinnedSubs = useFinanceStore(s => s.subscriptions) ?? EMPTY_SUBS;
    // [SUBS-TAB] Marchands explicitement écartés (« pas un abonnement ») — choix Marc : « ne plus
    // jamais le proposer ». Sans ça, un faux positif revenait à CHAQUE actualisation.
    const dismissedSubs = useFinanceStore(s => s.dismissedSubscriptions) ?? EMPTY_DISMISSED;
    const setAppState = useFinanceStore(s => s.setAppState);

    const heuristicSubs = useMemo(() => {
        const groups: Record<string, Transaction[]> = {};
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const variableKeywords = ['iga', 'metro', 'provigo', 'super c', 'maxi', 'walmart', 'costco', 'dollama', 'mcdonald', 'tim horton', 'starbucks', 'uber', 'taxi', 'restaurant', 'resto', 'bar', 'saq', 'petro', 'shell', 'esso', 'ultramar', 'sonic', 'essence', 'gaz', 'pharmaprix', 'jean coutu', 'uniprix', 'familiprix', 'amazon', 'paypal', 'home depot', 'canadian tire'];
        transactions.filter(t => t.amount < 0 && !t.isTransfer && !t.isDuplicate && new Date(t.date) > sixMonthsAgo).forEach(t => {
            const key = (t.payee || 'Inconnu').toLowerCase().trim().replace(/[0-9*#]/g, '').replace('payment', '').replace('paiement', '').replace('prel', '').trim();
            if (variableKeywords.some(k => key.includes(k) || (t.category || '').toLowerCase().includes(k))) return;
            if (!groups[key]) groups[key] = [];
            groups[key].push(t);
        });
        const detected: RecurringItem[] = [];
        Object.entries(groups).forEach(([_key, txs]) => {
            if (txs.length >= 2) {
                txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                const amounts = txs.map(t => Math.abs(t.amount));
                const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
                const isStableAmount = amounts.every(a => Math.abs(a - avg) < 5);
                let isValidInterval = false;
                const last = new Date(txs[txs.length - 1].date);
                const prev = new Date(txs[txs.length - 2].date);
                const diffDays = Math.abs(last.getTime() - prev.getTime()) / (1000 * 3600 * 24);
                if (diffDays >= 20 && diffDays <= 40) isValidInterval = true;
                if (diffDays >= 350 && diffDays <= 380) isValidInterval = true;
                if (isStableAmount && isValidInterval) {
                    const lastTx = txs[txs.length - 1];
                    detected.push({ payee: lastTx.payee, averageAmount: avg, dayOfMonth: new Date(lastTx.date).getDate(), category: lastTx.category, lastDate: lastTx.date, yearlyCost: avg * (diffDays >= 350 ? 1 : 12) });
                }
            }
        });
        return detected.sort((a, b) => b.averageAmount - a.averageAmount);
    }, [transactions]);

    // [TX-SUBSCRIPTIONS] Alertes sur les abonnements RECONNUS (profil de récurrence) : prix qui monte
    // sans qu'on l'ait vu passer, service qui a cessé d'être débité. Ce sont des invitations à
    // regarder, pas des verdicts — un « arrêté » peut être un simple retard de prélèvement.
    const subscriptionAlerts = useMemo(() => {
        const spends = transactions
            .filter(t => t.amount < 0 && !t.isTransfer && !t.isDuplicate)
            .map(t => ({ payee: t.payee, amount: t.amount, date: t.date }));
        const profiles = buildMerchantProfiles(spends);
        const byKey = new Map<string, number[]>();
        for (const s of [...spends].sort((a, b) => a.date.localeCompare(b.date))) {
            const k = merchantKey(s.payee);
            if (!k) continue;
            const list = byKey.get(k);
            if (list) list.push(Math.abs(s.amount));
            else byKey.set(k, [Math.abs(s.amount)]);
        }
        const inputs: SubscriptionAlertInput[] = [];
        for (const [key, profile] of profiles) {
            inputs.push({ profile, amounts: byKey.get(key) ?? [] });
        }
        const today = new Date().toISOString().slice(0, 10);
        return detectSubscriptionAlerts(inputs, today);
    }, [transactions]);

    // [PH4-F] liste affichée = abos ÉPINGLÉS (persistés) + DÉTECTÉS non déjà épinglés (dédup par marchand).
    const activeSubs = useMemo(() => mergeSubscriptions(pinnedSubs, aiSubs || heuristicSubs, dismissedSubs), [pinnedSubs, aiSubs, heuristicSubs, dismissedSubs]);

    const handlePinSub = useCallback((sub: RecurringItem) => {
        if (isPinned(pinnedSubs, sub)) return;
        setAppState({ subscriptions: addSubscription(pinnedSubs, sub) });
        // ⚠️ [finding vie privée #645] `maskPayee` AUSSI dans les toasts : une notification est du texte
        // rendu, au même titre qu'une ligne de tableau. Masquer la liste et pas la confirmation
        // annule le masquage au moment précis où l'utilisateur interagit devant quelqu'un.
        showToast(`« ${maskPayee(sub.payee, isPrivacyMode)} » épinglé — il restera après actualisation.`, 'success');
    }, [pinnedSubs, setAppState]);
    const handleUnpinSub = useCallback((sub: RecurringItem) => {
        setAppState({ subscriptions: removeSubscription(pinnedSubs, subscriptionKey(sub)) });
    }, [pinnedSubs, setAppState]);

    // [SUBS-TAB] « Ce n'est pas un abonnement » — définitif, mais RÉVERSIBLE (cf. le compteur
    // d'écartés plus bas). On désépingle EN MÊME TEMPS : garder un épinglage sur un marchand écarté
    // laisserait deux vérités contradictoires dans l'état persisté.
    const handleDismissSub = useCallback((sub: RecurringItem) => {
        setAppState({
            dismissedSubscriptions: dismissSubscription(dismissedSubs, sub),
            subscriptions: removeSubscription(pinnedSubs, subscriptionKey(sub)),
        });
        showToast(`« ${maskPayee(sub.payee, isPrivacyMode)} » ne sera plus proposé comme abonnement.`, 'success');
    }, [dismissedSubs, pinnedSubs, setAppState]);

    const handleRestoreSub = useCallback((key: string) => {
        setAppState({ dismissedSubscriptions: restoreSubscription(dismissedSubs, key) });
    }, [dismissedSubs, setAppState]);
    // [PLANNING-ANNUAL-SUB-12X] Totaux dérivés de `yearlyCost` (source de vérité annualisée) :
    // un abo ANNUEL ne compte plus ×12 dans le total mensuel.
    const { totalMonthly, totalYearly } = useMemo(() => ({
        totalMonthly: totalMonthlyCost(activeSubs),
        totalYearly: totalYearlyCost(activeSubs),
    }), [activeSubs]);

    const calendarDays = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days = [];
        const startPadding = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        for (let i = 0; i < startPadding; i++) days.push(null);
        for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
        return days;
    }, [currentDate]);

    const changeMonth = (delta: number) => { const newDate = new Date(currentDate); newDate.setMonth(newDate.getMonth() + delta); setCurrentDate(newDate); };

    const handleAiAnalysis = async () => {
        setIsAnalyzing(true);
        try {
            if (!apiKey) {
                showToast('Configure une clé Anthropic pour analyser tes abonnements.', 'info');
                return;
            }
            const results = await detectSubscriptionsAI(transactions, apiKey);
            if (results.length > 0) setAiSubs(results);
            else showToast("L'IA n'a rien détecté de plus.", 'info');
        } catch (e) {
            logError({ source: 'ai', severity: 'error', message: 'Détection IA des abonnements échouée', error: e });
            showToast("Erreur lors de l'analyse IA", 'error');
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4 bg-gradient-to-r from-blue-900/20 to-purple-900/20 p-6 rounded-2xl border border-white/10">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Charges Fixes & Abonnements</h2>
                    <p className="text-ink-300 text-body mt-1">Abonnements & Factures Récurrentes.</p>
                </div>
                <div className="flex gap-4">
                    <div className="text-right"><div className="text-tiny uppercase text-ink-400 font-bold">Fixe Mensuel</div><PrivateAmount as="div" className="text-2xl font-bold text-danger-400">{formatCAD(totalMonthly)}</PrivateAmount></div>
                    <div className="w-px bg-white/10"></div>
                    <div className="text-right"><div className="text-tiny uppercase text-ink-400 font-bold">Coût Annuel</div><PrivateAmount as="div" className="text-2xl font-bold text-white">{formatCAD(totalYearly)}</PrivateAmount></div>
                </div>
            </div>
            {/* [SUBS-TAB] Les marchands ÉCARTÉS restent VISIBLES et restaurables.
                ⚠️ Un « ne plus jamais » définitif ET invisible serait un piège : un mauvais clic
                ferait disparaître un vrai abonnement sans recours, et Marc chercherait pourquoi
                son total a baissé. Le refus est durable, pas irréversible. */}
            {dismissedSubs.length > 0 && (
                <details className="mb-3 text-tiny text-ink-400">
                    <summary className="cursor-pointer touch-target focus-ring rounded inline-flex items-center">
                        {dismissedSubs.length} marchand(s) écarté(s) — « pas un abonnement »
                    </summary>
                    <ul className="mt-2 space-y-1">
                        {dismissedSubs.map((key) => (
                            <li key={key} className="flex items-center justify-between gap-2">
                                {/* ⚠️ [finding vie privée #645] `key` N'EST PAS un identifiant opaque :
                                    `subscriptionKey` le construit littéralement depuis
                                    `payee.trim().toLowerCase()`. C'est donc un nom de marchand
                                    normalisé — masqué comme les autres, texte ET attribut. */}
                                <PrivateText className="text-ink-300 truncate">{key}</PrivateText>
                                <button
                                    onClick={() => handleRestoreSub(key)}
                                    aria-label={`Réafficher ${maskPayee(key, isPrivacyMode)} dans les abonnements détectés`}
                                    className="text-tiny text-ink-400 hover:text-primary px-2 py-1.5 rounded focus-ring"
                                >Réafficher</button>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="xl:col-span-1 space-y-6">
                    <Card title="Abonnements & Récurrents" action={
                        <div className="flex gap-2">{!aiSubs ? (<button onClick={handleAiAnalysis} disabled={isAnalyzing} className="text-tiny bg-primary text-dark px-2 py-1 rounded font-bold hover:bg-white disabled:opacity-50">{isAnalyzing ? '...' : 'IA'}</button>) : (<button onClick={() => setAiSubs(null)} className="text-tiny bg-white/10 px-2 py-1 rounded text-ink-300">Reset</button>)}</div>
                    }>
                        {subscriptionAlerts.length > 0 && (
                            <ul className="space-y-2 mb-3">
                                {subscriptionAlerts.map((a) => (
                                    <li
                                        key={`${a.kind}-${a.merchantKey}`}
                                        className={`rounded-lg border p-2 text-meta ${a.kind === 'price_rise' ? 'border-warning-500/30 bg-warning-500/5' : 'border-info-500/30 bg-info-500/5'}`}
                                    >
                                        {/* `a.label` vient de `merchantProfile.ts` : c'est le payee. */}
                                        <PrivateText className="font-bold text-ink-100 truncate">{a.label}</PrivateText>
                                        {a.kind === 'price_rise' ? (
                                            <div className="text-ink-300">
                                                Le prix a monté de {formatPercent((a.risePct ?? 0) * 100, 0)} —{' '}
                                                <PrivateAmount>{formatCAD(a.baselineAmount)}</PrivateAmount> puis{' '}
                                                <PrivateAmount>{formatCAD(a.latestAmount)}</PrivateAmount>.{' '}
                                                <span className="text-ink-400">
                                                    Soit <PrivateAmount>{formatCAD(a.yearlyCostAtLatest)}</PrivateAmount> par an au tarif actuel.
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="text-ink-300">
                                                Plus débité depuis {a.daysSinceLast} jours — arrêté, ou prélèvement en retard ?{' '}
                                                <span className="text-ink-400">
                                                    <PrivateAmount>{formatCAD(a.yearlyCostAtLatest)}</PrivateAmount> par an s&apos;il reprend.
                                                </span>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                            {activeSubs.map((sub, idx) => (
                                <div key={subscriptionKey(sub) || idx} className="flex justify-between items-center p-3 bg-[#1a1a1a] rounded-xl border border-white/5 hover:border-white/20 transition-all group">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shadow-inner flex-shrink-0"><Icon name={subIcon(sub.payee)} size={16} className="text-ink-300" /></div>
                                        <div className="min-w-0"><PrivateText as="div" className="font-bold text-white text-body truncate">{sub.payee}</PrivateText><div className="text-tiny text-ink-400">{subscriptionDueLabel(sub)}</div></div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {/* [PH4-F] épingler = persister l'abo (survit au reload sans re-détection IA) */}
                                        {isPinned(pinnedSubs, sub) ? (
                                            <button onClick={() => handleUnpinSub(sub)} aria-label={`Désépingler ${maskPayee(sub.payee, isPrivacyMode)}`} title="Épinglé — cliquer pour retirer" className="text-tiny font-bold text-primary hover:text-danger-400 px-2 py-1.5 rounded transition-colors">Épinglé</button>
                                        ) : (
                                            <button onClick={() => handlePinSub(sub)} aria-label={`Épingler ${maskPayee(sub.payee, isPrivacyMode)}`} title="Épingler — le garder après actualisation" className="text-tiny text-ink-400 hover:text-primary px-2 py-1.5 rounded transition-all opacity-0 group-hover:opacity-100 focus:opacity-100">Épingler</button>
                                        )}
                                        {/* [SUBS-TAB] Refuser un faux positif — sinon il revient à CHAQUE actualisation.
                                            HORS du ternaire épinglé/non : refuser vaut dans les deux états (le handler
                                            désépingle en même temps, pour ne pas laisser deux vérités contradictoires). */}
                                        <button onClick={() => handleDismissSub(sub)} aria-label={`${maskPayee(sub.payee, isPrivacyMode)} n'est pas un abonnement`} title="Ce n'est pas un abonnement — ne plus le proposer" className="text-tiny text-ink-400 hover:text-danger-400 px-2 py-1.5 rounded transition-all opacity-0 group-hover:opacity-100 focus:opacity-100">Pas un abo</button>
                                        <div className="text-right"><PrivateAmount as="div" className="font-bold text-white">{formatCAD(monthlyEquivalent(sub))}</PrivateAmount><div className="text-tiny text-ink-400">/mois</div></div>
                                    </div>
                                </div>
                            ))}
                            {activeSubs.length === 0 && <div className="text-center text-ink-400 py-10">Aucun abonnement détecté.</div>}
                        </div>
                        <div className="mt-4 bg-gradient-to-br from-red-900/20 to-black border border-danger-500/20 p-3 rounded-xl">
                            <div className="text-tiny text-red-300 uppercase font-bold mb-2">Le "Latte Factor"</div>
                            <div className="text-tiny text-ink-300 mb-2">
                                Impact à long terme de ces {activeSubs.length} abonnements si l'argent était plutôt investi.
                            </div>
                            <ProjectionRequired variant="inline" feature="cette projection long-terme" />
                        </div>
                    </Card>
                </div>
                <div className="xl:col-span-1 space-y-6">
                    <Card title="Calendrier des Factures">
                        <div className="flex justify-between items-center mb-4 bg-white/5 p-2 rounded-lg">
                            <button onClick={() => changeMonth(-1)} aria-label="Mois précédent" className="touch-target flex items-center justify-center hover:bg-white/10 rounded text-ink-300 focus-ring">◀</button>
                            <h2 className="text-body font-bold text-white capitalize">{currentDate.toLocaleString('fr-CA', { month: 'long', year: 'numeric' })}</h2>
                            <button onClick={() => changeMonth(1)} aria-label="Mois suivant" className="touch-target flex items-center justify-center hover:bg-white/10 rounded text-ink-300 focus-ring">▶</button>
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => <div key={d} className="text-center text-ink-400 text-tiny font-bold uppercase pb-1">{d}</div>)}
                            {calendarDays.map((date, idx) => {
                                if (!date) return <div key={idx} />;
                                const day = date.getDate();
                                const isToday = new Date().toDateString() === date.toDateString();
                                // [PLANNING-ANNUAL-CALENDAR] un abo MENSUEL tombe chaque mois à `dayOfMonth` ;
                                // un abo ANNUEL uniquement dans son mois d'échéance (dérivé de `lastDate`).
                                const bills = activeSubs.filter(i => {
                                    if (i.dayOfMonth !== day) return false;
                                    if (!isAnnualSubscription(i)) return true;
                                    const due = new Date(i.lastDate);
                                    return !Number.isNaN(due.getTime()) && due.getMonth() === date.getMonth();
                                });
                                const hasBills = bills.length > 0;
                                const dailyTotal = bills.reduce((s, b) => s + b.averageAmount, 0);
                                return (
                                    <div key={idx} className={`aspect-square rounded-lg border flex flex-col items-center justify-center relative ${isToday ? 'bg-primary/20 border-primary' : hasBills ? 'bg-danger-500/10 border-danger-500/30' : 'bg-dark/40 border-white/5'}`}>
                                        <span className={`text-meta font-bold ${isToday ? 'text-primary' : 'text-ink-400'}`}>{day}</span>
                                        {hasBills && <div className="mt-1 text-center"><div className="text-tiny font-bold text-white leading-none">{formatCAD(dailyTotal)}</div><div className="flex gap-0.5 justify-center mt-0.5">{bills.slice(0, 3).map((b, bi) => <div key={bi} className="w-1 h-1 rounded-full bg-danger-400" title={maskPayee(b.payee, isPrivacyMode)}></div>)}</div></div>}
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};
