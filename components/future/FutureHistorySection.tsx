// components/future/FutureHistorySection.tsx
//
// [REFONTE-NAV-L2b] Sous-onglet « Historique » de la page Futur — l'évolution PASSÉE du
// patrimoine par compte, DÉMÉNAGÉE de l'ex-Accueil (components/Dashboard.tsx, carte
// « Évolution détaillée »). Le pipeline `unifiedHistory` est copié FIDÈLEMENT du Dashboard
// (mêmes hooks/services : usePortfolioHistory, presentEquityOfGoal,
// reconstructRealEstateEquityByYear, computeTotalDebt — AUCUNE dérivation nouvelle).
// Les volets du useMemo d'origine qui n'alimentaient PAS ce graphe (listes segmentées
// d'actifs, revenu passif, lookback 30 jours) restent avec leurs consommateurs respectifs
// (cartes par titre → Investissements ; KPI variation → hook Lot 2a) et ne sont pas copiés.
//
// Lecture DIRECTE du store (transactions/assets/soldes/dettes/immobilier) : pas de props à
// enfiler à travers FutureProjection. Chargé en lazy depuis FutureProjection → hors du boot.

import React, { useMemo, useState, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { usePortfolioHistory } from '../../hooks/usePortfolioHistory';
import { useFinanceStore } from '../../store/useFinanceStore';
import { HistoryCoverageNote } from '../dashboard/HistoryCoverageNote';
import { computeTotalDebt } from '../../services/portfolio';
import { presentEquityOfGoal, monthsSince } from '../../services/projection/pastPurchaseInit';
import { reconstructRealEstateEquityByYear } from '../../services/history/reconstructRealEstateEquity';
import { useSyncExternalStore } from 'react';
import { getHistorySyncReport, subscribeHistorySyncReport, skipsActionnables } from '../../services/history/syncDiagnostics';

// Même chunk lazy que sur l'ex-Accueil (recharts ≈ 445 KB via ZoomableTimeChart) : le
// sous-onglet Historique ne paie le graphe qu'à l'affichage. lazyWithRetry = retry/reload
// sur hash périmé après deploy (leçon PH1-a).
const DashboardEvolutionChart = lazyWithRetry(() => import('../dashboard/DashboardEvolutionChart'), 'DashboardEvolutionChart');

type TimeRange = '1M' | '3M' | 'YTD' | '1Y' | 'ALL' | 'CUSTOM';

// Palette des séries par compte — identique à l'ex-Accueil (les couleurs des comptes ne
// changent pas en changeant de page).
const COLORS = ['#4f9d86', '#5b82bf', '#c2974f', '#9277bd', '#bd7d9c', '#5093a8', '#8ba85a', '#6f72c4'];

const FutureHistorySection: React.FC = () => {
    const { t } = useTranslation();
    const [timeRange, setTimeRange] = useState<TimeRange>('1M');
    const [customStart, setCustomStart] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
    const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);

    // Phase D.3 (conservée telle quelle) — chaque compte peut être masqué/affiché ; un bouton
    // « Total » superpose une ligne d'agrégat. Persistance localStorage : MÊMES clés que
    // l'ex-Accueil ('dashboard:*') pour que les préférences existantes de Marc survivent au
    // déménagement (le renommage des clés perdrait ses réglages).
    const [hiddenAccounts, setHiddenAccounts] = useState<Set<string>>(() => {
        try {
            const raw = localStorage.getItem('dashboard:hiddenAccounts:v1');
            return raw ? new Set(JSON.parse(raw)) : new Set();
        } catch { return new Set(); }
    });
    const [showTotalLine, setShowTotalLine] = useState<boolean>(() => {
        try { return localStorage.getItem('dashboard:showTotal:v1') === 'true'; } catch { return false; }
    });
    const toggleAccount = (key: string) => {
        setHiddenAccounts(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            try { localStorage.setItem('dashboard:hiddenAccounts:v1', JSON.stringify([...next])); } catch {/* */}
            return next;
        });
    };
    const toggleTotal = () => {
        setShowTotalLine(prev => {
            const next = !prev;
            try { localStorage.setItem('dashboard:showTotal:v1', String(next)); } catch {/* */}
            return next;
        });
    };

    // Lecture store (source unique, mêmes champs que les props de l'ex-Dashboard).
    const transactions = useFinanceStore(s => s.transactions);
    const assets = useFinanceStore(s => s.assets);
    const initialBalances = useFinanceStore(s => s.initialBalances);
    const debts = useFinanceStore(s => s.debts);
    const realEstateGoals = useFinanceStore(s => s.realEstateGoals);
    const isPrivacyMode = useFinanceStore(s => s.isPrivacyMode);

    // Sprint 3B M3 — cache singleton : un seul fetch global pour toute la session.
    const { history: portfolioHistory, noHistorySymbols, partialHistorySymbols, staleTailSymbols } = usePortfolioHistory();
    // [FUTURE-HISTORY-EMPTY-CAUSE] L'état vide affirmait « vérifie ta clé Finnhub » — une cause que
    // cet écran ne peut PAS connaître : `usePortfolioHistory` ne fait aucun réseau, il DÉRIVE du
    // store. La vraie issue de l'hydratation est publiée au démarrage MÊME quand rien n'a pu être
    // hydraté (`App.tsx`, commenté sur place) : on la lit, comme le fait l'écran Diagnostic.
    const rapportSync = useSyncExternalStore(subscribeHistorySyncReport, getHistorySyncReport, getHistorySyncReport);
    const echecsSync = skipsActionnables(rapportSync);
    // (L'état intermédiaire `marketData` de l'ex-Dashboard datait du chemin fetch legacy —
    // le hook est déjà la source, on le consomme directement.)
    const marketData = portfolioHistory;

    const { unifiedHistory, accountKeys } = useMemo(() => {
        // Sans historique de cours : pas de graphe (empty state honnête ci-dessous).
        if (marketData.length === 0) {
            return { unifiedHistory: [], accountKeys: [] };
        }

        // 1. Timeline des transactions & comptes cash connus (copie fidèle Dashboard).
        const sortedTxs = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const cashAccountsList = new Set<string>();
        Object.keys(initialBalances).forEach(k => cashAccountsList.add(k));
        sortedTxs.forEach(tx => { if (tx.accountName && tx.accountName !== 'Unknown') cashAccountsList.add(tx.accountName); });

        // 2. Construction de l'historique du graphe.
        let txIdx = 0;
        const rc: Record<string, number> = { ...initialBalances };
        // [Finding financial-integrity #544, MESURÉ] Amorcer TOUS les comptes connus à 0 : un compte
        // découvert via une TRANSACTION (absent d'initialBalances) laissait rc[acc] undefined sur les
        // lignes antérieures à sa 1re transaction → total NaN sur ces lignes.
        cashAccountsList.forEach(acc => { if (rc[acc] === undefined) rc[acc] = 0; });

        // [DASH-IMMO-EQUITY-WRITERS] Équité via le helper PARTAGÉ avec le moteur (currentValue/
        // mortgageBalance priment, sinon reconstruction depuis price/downPayment/amortissement).
        const currentRealEstateEquity = realEstateGoals.reduce(
            (sum, g) => sum + presentEquityOfGoal(g, monthsSince(g.purchaseDate)), 0);
        // [DASH-HIST-IMMO-FLAT] (finding financial-integrity #552, MESURÉ) Équité PAR ANNÉE via le
        // helper existant ; l'année COURANTE reste la valeur présente (pas de marche au raccord).
        const equityByYear = reconstructRealEstateEquityByYear(realEstateGoals);
        const nowYearImmo = new Date().getFullYear();
        // [DASH-NW-DUP] source unique gardée NaN/Infinity.
        const currentDebts = computeTotalDebt(debts ?? []);

        const hist = marketData.map(row => {
            const rowDateStr = row.date as string;
            const rowDate = new Date(rowDateStr);
            while (txIdx < sortedTxs.length && new Date(sortedTxs[txIdx].date) <= rowDate) {
                const tx = sortedTxs[txIdx];
                if (!tx.isDuplicate && !tx.isTransfer && tx.accountName && tx.accountName !== 'Unknown') {
                    rc[tx.accountName] = (rc[tx.accountName] || 0) + tx.amount;
                }
                txIdx++;
            }
            const point: Record<string, number | string> = { date: rowDateStr };
            let total = 0;
            cashAccountsList.forEach(acc => { point[acc] = rc[acc]; total += rc[acc]; });

            // [PORTFOLIO-HISTORY, panel 2026-07-22] Piles CELI/REER/NonReg/Crypto = buckets TOTAL_*
            // ÉMIS par le producteur (les lignes par-symbole sont ÉPARSES — jamais de recomposition
            // locale, ni de matching par sous-chaîne).
            const invMap: Record<string, number> = {
                CELI: Number(row['TOTAL_CELI']) || 0,
                REER: Number(row['TOTAL_REER']) || 0,
                NonReg: Number(row['TOTAL_NON-ENREG']) || 0,
                Crypto: Number(row['TOTAL_CRYPTO']) || 0,
            };
            point.CELI = invMap.CELI; point.REER = invMap.REER; point.NonReg = invMap.NonReg; point.Crypto = invMap.Crypto;
            const rowYear = rowDate.getFullYear();
            const immoAtRow = rowYear >= nowYearImmo
                ? currentRealEstateEquity
                : (equityByYear.get(rowYear) ?? 0);
            point.Immobilier = immoAtRow;
            point.Dettes = -currentDebts;

            total += invMap.CELI + invMap.REER + invMap.NonReg + invMap.Crypto + immoAtRow - currentDebts;
            point.Total = total;
            return point;
        });

        const now = new Date();
        let startDate = new Date(marketData[0].date);
        let endDate = new Date();
        switch (timeRange) {
            case '1M': startDate = new Date(); startDate.setMonth(now.getMonth() - 1); break;
            case '3M': startDate = new Date(); startDate.setMonth(now.getMonth() - 3); break;
            case 'YTD': startDate = new Date(now.getFullYear(), 0, 1); break;
            case '1Y': startDate = new Date(); startDate.setFullYear(now.getFullYear() - 1); break;
            case 'CUSTOM': startDate = new Date(customStart); endDate = new Date(customEnd); break;
        }
        const filteredHist = hist.filter(d => {
            const dDate = new Date(d.date); return dDate >= startDate && dDate <= endDate;
        });
        const lastPoint = filteredHist[filteredHist.length - 1] || hist[hist.length - 1] || { Total: 0 };
        // Clés UNIQUES (leçon « Diane & Robert ») : un compte cash peut porter le même nom qu'une
        // catégorie d'investissement → dédoublonnage par Set, ordre cash d'abord préservé.
        const combinedKeys = Array.from(new Set([
            ...cashAccountsList,
            'Immobilier', 'CELI', 'REER', 'NonReg', 'Crypto', 'Dettes',
        ])).filter(k => lastPoint[k] !== 0);

        return { unifiedHistory: filteredHist, accountKeys: combinedKeys };
    }, [marketData, timeRange, customStart, customEnd, transactions, initialBalances, debts, realEstateGoals]);

    return (
        <Card title={t('dashboard.detailed_evolution')} className="w-full min-h-[450px]"
            action={
                <div className="flex flex-col items-end gap-2">
                    <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/10">
                        {/* [A11Y] aria-pressed = période active annoncée au lecteur d'écran ;
                            focus-ring = focus clavier visible (préexistant au déménagement). */}
                        {(['1M', '3M', 'YTD', '1Y', 'ALL', 'CUSTOM'] as TimeRange[]).map(r => (
                            <button key={r} type="button" onClick={() => setTimeRange(r)} aria-pressed={timeRange === r} className={`px-3 py-1 text-tiny font-bold rounded transition-all focus-ring ${timeRange === r ? 'bg-white text-black shadow' : 'text-ink-300 hover:text-white hover:bg-white/5'}`}>{r}</button>
                        ))}
                    </div>
                    {timeRange === 'CUSTOM' && (
                        <div className="flex items-center gap-1.5">
                            <input type="date" aria-label="Date de début" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-black/40 border border-white/10 rounded px-2 py-1 text-tiny text-white focus:border-white/30 outline-none" />
                            <span className="text-ink-500 text-tiny" aria-hidden="true">→</span>
                            <input type="date" aria-label="Date de fin" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-black/40 border border-white/10 rounded px-2 py-1 text-tiny text-white focus:border-white/30 outline-none" />
                        </div>
                    )}
                </div>
            }
        >
            {/* Phase D.3 — chips toggle pour chaque compte + « Total » overlay */}
            {accountKeys.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    <span className="text-tiny text-ink-400 uppercase tracking-widest font-bold mr-1">Affichage :</span>
                    {accountKeys.map((key, idx) => {
                        const isHidden = hiddenAccounts.has(key);
                        const color = COLORS[idx % COLORS.length];
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => toggleAccount(key)}
                                aria-pressed={!isHidden}
                                title={isHidden ? `Afficher ${key}` : `Masquer ${key}`}
                                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-tiny font-medium border transition-colors focus-ring ${
                                    isHidden
                                        ? 'bg-white/[0.02] text-ink-400 border-white/5 hover:bg-white/5'
                                        : 'bg-white/10 text-ink-100 border-white/15 hover:bg-white/15'
                                }`}
                            >
                                <span
                                    aria-hidden="true"
                                    className={`w-2 h-2 rounded-full ${isHidden ? 'opacity-30' : ''}`}
                                    style={{ backgroundColor: color }}
                                />
                                {key}
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        onClick={toggleTotal}
                        aria-pressed={showTotalLine}
                        title={showTotalLine ? 'Masquer la ligne Total' : 'Afficher la ligne Total'}
                        className={`ml-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-tiny font-bold border transition-colors focus-ring ${
                            showTotalLine
                                ? 'bg-white text-black border-white'
                                : 'bg-white/[0.02] text-ink-400 border-white/10 hover:bg-white/5'
                        }`}
                    >
                        <span aria-hidden="true">∑</span>
                        Total
                    </button>
                </div>
            )}
            {/* [DASH-HIST-CARDS-LABEL] Étiquette d'honnêteté : cette courbe est l'HISTORIQUE
                (dernier close), pas le patrimoine présent — et pas la projection du sous-onglet
                voisin non plus. */}
            {unifiedHistory.length > 0 && (
                <p className="text-tiny text-ink-400 mb-1">Courbe au dernier cours de clôture (historique).</p>
            )}
            <div className="w-full h-[380px]">
                {/* [PORTFOLIO-HISTORY] État HONNÊTE quand l'historique n'est pas (encore) là. */}
                {unifiedHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
                        {assets.some(a => a.symbol) ? (
                            <>
                                <p className="text-body text-ink-200 font-medium">Historique de cours indisponible pour l'instant</p>
                                {rapportSync === null ? (
                                    // Rien à dire ENCORE : la synchro n'a pas fini. La promesse est vraie ici,
                                    // et seulement ici — c'est le seul moment où la courbe peut arriver seule.
                                    <p className="text-meta text-ink-400">
                                        Les cours historiques se chargent au démarrage depuis tes dates d'achat —
                                        la courbe apparaît toute seule quand ils arrivent.
                                    </p>
                                ) : echecsSync.length > 0 ? (
                                    <p className="text-meta text-ink-400">
                                        La synchronisation a échoué sur {echecsSync.length}{' '}
                                        {echecsSync.length > 1 ? 'titres' : 'titre'}.{' '}
                                        {/* Le détail vient du diagnostic, pas d'une cause devinée ici. En mode
                                            discret, la variante SANS montant (le `detail` peut interpoler un prix). */}
                                        {(isPrivacyMode ? echecsSync[0].detailPrivacySafe : echecsSync[0].detail)
                                            ?? 'Détail indisponible.'}{' '}
                                        Le détail par titre et les correctifs sont dans Placements → Diagnostic de synchronisation.
                                    </p>
                                ) : (
                                    <p className="text-meta text-ink-400">
                                        La synchronisation s'est terminée sans erreur signalée, mais aucun cours
                                        n'est arrivé. Vérifie les dates d'achat de tes titres — l'historique part
                                        du premier achat.
                                    </p>
                                )}
                            </>
                        ) : (
                            <>
                                <p className="text-body text-ink-200 font-medium">Aucun placement à tracer</p>
                                <p className="text-meta text-ink-400">
                                    Ajoute tes actions/FNB (Investissements → Ajouter) pour voir l'évolution
                                    de ton portefeuille ici.
                                </p>
                            </>
                        )}
                    </div>
                ) : (
                    <Suspense fallback={<Skeleton variant="chart" />}>
                        <DashboardEvolutionChart
                            unifiedHistory={unifiedHistory}
                            accountKeys={accountKeys}
                            colors={COLORS}
                            isPrivacyMode={isPrivacyMode}
                            hiddenAccounts={hiddenAccounts}
                            showTotalLine={showTotalLine}
                        />
                    </Suspense>
                )}
            </div>
            {/* [HIST-COVERAGE-TOTAL] Signalement HONNÊTE des approximations de couverture
                (composant partagé avec Investissements — jamais deux copies qui dérivent). */}
            <HistoryCoverageNote noHistorySymbols={noHistorySymbols} partialHistorySymbols={partialHistorySymbols}
                staleTailSymbols={staleTailSymbols} hasChart={portfolioHistory.length > 0} />
        </Card>
    );
};

export default FutureHistorySection;
