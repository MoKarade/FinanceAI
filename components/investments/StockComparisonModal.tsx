import React from 'react';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { StockChart } from '../StockChart';
import { Skeleton } from '../ui/Skeleton';
import { usePortfolioHistory } from '../../hooks/usePortfolioHistory';
import { historyKeyMatchesSymbol } from '../../services/history/buildMarketData';

/**
 * Phase D.4 — modal de comparaison de stocks superposés.
 *
 * Quand l'utilisateur sélectionne 1+ stock(s) dans la liste Dashboard, cette
 * modal récupère l'historique et les rend dans `<StockChart>` :
 *   - 1 stock → mode PRIX par défaut (lisible)
 *   - 2+ stocks → mode PERFORMANCE base 100 par défaut (comparable)
 *
 * Le composant `StockChart` supporte déjà toggle PRICE/PERFORMANCE en interne.
 */

interface StockComparisonModalProps {
    symbols: string[];           // tickers/keys à comparer (peut être 1 ou N)
    isOpen: boolean;
    onClose: () => void;
    isPrivacyMode?: boolean;
}

export const StockComparisonModal: React.FC<StockComparisonModalProps> = ({
    symbols,
    isOpen,
    onClose,
    isPrivacyMode = false,
}) => {
    // [PORTFOLIO-HISTORY] Dérivé du store (priceHistory hydraté au boot) — plus aucun fetch ici.
    // Avant : fetchPortfolioHistory() (stub CSV mort → toujours []) → « Aucune donnée » à chaque fois.
    const { history: data, isLoading } = usePortfolioHistory();

    // Trouve les colonnes du dataset correspondant aux symbols (les clés peuvent
    // être "NASDAQ:AAPL" mais le symbol exposé est "AAPL").
    // ⚠️ [panel 2026-07-22] UNION des clés de TOUTES les lignes : les lignes réelles sont ÉPARSES
    // (un actif acheté après la 1re date est ABSENT de la ligne 0 → « Voir courbe » rendait
    // « Aucune donnée » à tort). Et matching EXACT, jamais `includes` : « V » (Visa) matchait
    // « VFV.TO » → la MAUVAISE courbe affichée sous le titre « Évolution — V » (fausse donnée).
    const visibleKeys = React.useMemo(() => {
        if (data.length === 0) return new Set<string>();
        const allKeys = new Set<string>();
        data.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
        const candidate = [...allKeys].filter(k => k !== 'date' && k !== 'Date' && !k.startsWith('Taux') && !k.includes('TOTAL'));
        const matched = candidate.filter(k => symbols.some(s => historyKeyMatchesSymbol(k, s)));
        return new Set(matched);
    }, [data, symbols]);

    const title = symbols.length === 1
        ? `Évolution — ${symbols[0]}`
        : `Comparaison — ${symbols.length} actions`;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} icon={<Icon name="investments" size={22} />} size="xl">
            <div className="space-y-3">
                {symbols.length > 1 && (
                    <p className="text-tiny text-ink-400 italic">
                        Astuce : bascule en mode <strong>Base 100 (%)</strong> pour comparer la
                        performance relative depuis le début de la période, indépendamment du prix.
                    </p>
                )}
                <div className="w-full h-[500px]">
                    {isLoading ? (
                        <Skeleton variant="chart" />
                    ) : data.length === 0 || visibleKeys.size === 0 ? (
                        <div className="flex items-center justify-center h-full text-meta text-ink-400">
                            Aucune donnée disponible pour cette sélection.
                        </div>
                    ) : (
                        <StockChart
                            data={data}
                            visibleKeys={visibleKeys}
                            isPrivacyMode={isPrivacyMode}
                        />
                    )}
                </div>
            </div>
        </Modal>
    );
};
