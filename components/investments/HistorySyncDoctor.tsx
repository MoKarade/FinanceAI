// components/investments/HistorySyncDoctor.tsx
//
// [HIST-MULTI-PROVIDER] Diagnostic PAR TITRE de la synchronisation des cours + REMÈDE inline :
// pour chaque titre que l'hydratation n'a pas pu couvrir (raison 'empty'/'error'), la raison
// EXACTE en français (qu'a-t-on essayé, pourquoi refusé) et un champ « symbole de cotation »
// pour fixer le ticker Yahoo exact (ex. AASI.PA) — le remède est À CÔTÉ du symptôme, pas caché
// dans un formulaire. Appliquer purge l'historique du titre (un historique fusionné d'un MAUVAIS
// titre ne doit pas survivre à la correction) puis relance la resynchronisation.
//
// ⚠️ Jamais rendu en mode test/persona : les diagnostics portent les TICKERS RÉELS (gate côté
// parent Investments, doublé ici en ceinture).

import React, { useState, useSyncExternalStore } from 'react';
import { Icon } from '../ui/Icon';
import { showToast } from '../ui/Toast';
import { useFinanceStore } from '../../store/useFinanceStore';
import {
    getHistorySyncReport, subscribeHistorySyncReport,
} from '../../services/history/syncDiagnostics';
import { searchYahooSymbols, type YahooSearchResult } from '../../services/marketData/providers/yahooProxy';

interface Props {
    /** Applique un symbole de cotation à un actif (purge d'historique incluse) puis resynchronise. */
    onApplyQuoteSymbol: (assetSymbol: string, quoteSymbol: string) => void;
    /** Une resynchronisation est-elle en cours ? (désactive les boutons Appliquer) */
    isSyncing: boolean;
}

export const HistorySyncDoctor: React.FC<Props> = ({ onApplyQuoteSymbol, isSyncing }) => {
    const report = useSyncExternalStore(subscribeHistorySyncReport, getHistorySyncReport, getHistorySyncReport);
    const isTestMode = useFinanceStore((s) => s.isTestMode);
    const isPrivacyMode = useFinanceStore((s) => s.isPrivacyMode);
    const assets = useFinanceStore((s) => s.assets);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [suggestions, setSuggestions] = useState<Record<string, YahooSearchResult[]>>({});
    const [searching, setSearching] = useState<string | null>(null);

    // [HIST-MULTI-PROVIDER] Recherche le titre par NOM chez Yahoo → tickers candidats cliquables
    // (« Amundi MSCI Em Asia » → AASI.PA) au lieu de demander à l'utilisateur de deviner.
    const searchFor = async (symbol: string) => {
        const asset = (assets || []).find((a) => a.symbol === symbol);
        const query = asset?.name?.trim() || symbol;
        setSearching(symbol);
        try {
            const results = await searchYahooSymbols(query);
            if (results === null) {
                showToast('Recherche de titre indisponible (réseau) — réessaie dans un instant.', 'error');
                return;
            }
            setSuggestions((s) => ({ ...s, [symbol]: results }));
            if (results.length === 0) showToast(`Aucun titre trouvé pour « ${query} » — essaie un autre nom ou saisis le ticker.`, 'info');
        } finally {
            setSearching(null);
        }
    };

    if (isTestMode) return null; // ceinture — tickers réels, jamais en démo persona
    if (!report) return null;
    // Seuls les échecs ACTIONNABLES : 'empty' (introuvable/refusé) et 'error' (panne). Les raisons
    // nominales (fresh) ou couvertes ailleurs (no-provider hors navigateur, currency-mismatch déjà
    // détaillée au journal) n'appellent pas d'action ici.
    // [Finding code-reviewer #494 — MOYEN, mesuré] DÉDUP par symbole : le même titre détenu dans
    // 2 comptes (CELI+REER) produit 2 skips → clé React + id DOM dupliqués (htmlFor cassé) et
    // drafts/suggestions partagés entre les 2 lignes. Une seule ligne par symbole (le remède —
    // historySymbol — s'applique de toute façon à TOUS les actifs de ce symbole).
    const bySymbol = new Map<string, (typeof report.skipped)[number]>();
    for (const s of report.skipped) {
        if ((s.reason === 'empty' || s.reason === 'error') && !bySymbol.has(s.symbol)) bySymbol.set(s.symbol, s);
    }
    const actionable = [...bySymbol.values()];
    if (actionable.length === 0) return null;

    const currentQuoteSymbol = (symbol: string): string =>
        (assets || []).find((a) => a.symbol === symbol)?.historySymbol ?? '';

    // [INVEST-CHART-CLEAN] REPLIÉ par défaut (demande Marc « enlève le texte, qu'on voie le
    // graphe ») : une ligne d'alerte compacte, le diagnostic + remèdes au clic.
    // [Finding a11y #495] Le <h4> sr-only HORS du <details> préserve la navigation par TITRES des
    // lecteurs d'écran (un summary a un rôle bouton, pas heading — et un heading DANS un details
    // fermé est caché) ; py-1.5 sur le summary = boîte ≥ 24 px (WCAG 2.5.8, padding sur le summary
    // lui-même, pas le parent).
    return (
        <div className="mt-2">
        <h4 className="sr-only">Cours non synchronisés</h4>
        <details className="bg-white/[0.03] border border-warning-400/30 rounded-card px-3 py-1">
            <summary className="text-tiny font-bold text-ink-300 cursor-pointer select-none hover:text-white focus-ring rounded flex items-center gap-2 py-1.5">
                <Icon name="alert" size={12} aria-hidden="true" />
                Cours non synchronisés ({actionable.length}) — diagnostiquer et corriger
            </summary>
            <div className="mt-2">
            <ul className="space-y-3">
                {actionable.map((s) => (
                    <li key={s.symbol} className="text-meta text-ink-200">
                        <span className="font-bold text-white">{s.symbol}</span>
                        {' — '}
                        {/* [Finding sécurité #494 — mode discret] `detail` peut interpoler des
                            montants (currentPrice) : en mode discret, on rend la variante SANS
                            montant, avec un générique en défaut SÛR (jamais le detail chiffré). */}
                        {(isPrivacyMode
                            ? (s.detailPrivacySafe ?? 'Diagnostic masqué (mode discret) — désactive-le pour le détail complet.')
                            : s.detail)
                            ?? (s.reason === 'error'
                                ? 'Panne du fournisseur de cours — nouvel essai automatique au prochain chargement.'
                                : 'Aucun historique trouvé pour ce titre.')}
                        {s.reason === 'empty' && (suggestions[s.symbol]?.length ?? 0) > 0 && (
                            <ul className="mt-1.5 flex flex-wrap gap-2" aria-label={`Titres suggérés pour ${s.symbol}`}>
                                {suggestions[s.symbol].map((sug) => (
                                    <li key={sug.symbol}>
                                        <button
                                            type="button"
                                            disabled={isSyncing}
                                            onClick={() => onApplyQuoteSymbol(s.symbol, sug.symbol)}
                                            title={`Utiliser ${sug.symbol} comme symbole de cotation`}
                                            className="text-tiny bg-info-500/20 text-blue-300 border border-info-500/50 rounded-lg px-2 py-1 hover:bg-info-500/30 focus-ring disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {sug.symbol} — {sug.name}{sug.exchange ? ` (${sug.exchange})` : ''}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {s.reason === 'empty' && (
                            <form
                                className="mt-1.5 flex items-center gap-2"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    const value = (drafts[s.symbol] ?? currentQuoteSymbol(s.symbol)).trim();
                                    if (!value || isSyncing) return;
                                    onApplyQuoteSymbol(s.symbol, value);
                                }}
                            >
                                <label htmlFor={`quote-symbol-${s.symbol}`} className="text-tiny text-ink-400">
                                    Symbole de cotation :
                                </label>
                                <input
                                    id={`quote-symbol-${s.symbol}`}
                                    type="text"
                                    value={drafts[s.symbol] ?? currentQuoteSymbol(s.symbol)}
                                    onChange={(e) => setDrafts((d) => ({ ...d, [s.symbol]: e.target.value }))}
                                    placeholder={`ex. ${s.symbol}.PA`}
                                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-meta text-white w-36 focus-ring"
                                />
                                <button
                                    type="submit"
                                    disabled={isSyncing || !(drafts[s.symbol] ?? currentQuoteSymbol(s.symbol)).trim()}
                                    className="text-meta text-primary hover:text-white focus-ring rounded-lg px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSyncing ? 'Synchronisation…' : 'Appliquer'}
                                </button>
                                <button
                                    type="button"
                                    disabled={isSyncing || searching === s.symbol}
                                    onClick={() => void searchFor(s.symbol)}
                                    className="text-meta text-ink-300 hover:text-white focus-ring rounded-lg px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {searching === s.symbol ? 'Recherche…' : 'Chercher le titre'}
                                </button>
                            </form>
                        )}
                    </li>
                ))}
            </ul>
            </div>
        </details>
        </div>
    );
};
