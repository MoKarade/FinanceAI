// [FX-FALLBACK-SILENCIEUX] Le repli FX en dur (`USD 1,40 / EUR 1,47`, `lastFetched: 0`) n'était
// visible que dans SystemView (page technique) — Dashboard, Investissements, Patrimoine et le PDF
// convertissaient sans aucun signal. Sur 100 k$ USD détenus, 3 points d'écart de taux ≈ 3 000 $ CAD
// d'erreur silencieuse sur le patrimoine affiché. Badge unique, réutilisé partout où une devise
// étrangère est convertie à l'écran (miroir de DECISION-PRIVACY-UNE-SEULE-SORTIE : un signal posé
// pour UNE surface ne protège que celle-là).
import React from 'react';
import { Badge } from './Badge';
import { useFinanceStore } from '../../store/useFinanceStore';
import { isFxRatesEstimated, hasForeignCurrencyAssets } from '../../services/portfolio';

/** `null` si aucun avoir étranger ou si le taux vient bien de l'API — pas de bruit hors-sujet. */
export const FxEstimateBadge: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'sm' }) => {
    const fxRates = useFinanceStore(s => s.fxRates);
    const assets = useFinanceStore(s => s.assets);
    if (!isFxRatesEstimated(fxRates) || !hasForeignCurrencyAssets(assets)) return null;
    return (
        <Badge
            variant="warning"
            size={size}
            title="Le taux de change USD/EUR n'a jamais été récupéré (ou le cache est trop vieux) — un repli approximatif est utilisé pour convertir tes avoirs étrangers en dollars canadiens."
        >
            Taux de change estimés
        </Badge>
    );
};
