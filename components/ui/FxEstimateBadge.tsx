// [FX-FALLBACK-SILENCIEUX] Le repli FX en dur (`USD 1,40 / EUR 1,47`, `lastFetched: 0`) n'était
// visible que dans SystemView (page technique) — Dashboard, Investissements, Patrimoine et le PDF
// convertissaient sans aucun signal. Sur 100 k$ USD détenus, 3 points d'écart de taux ≈ 3 000 $ CAD
// d'erreur silencieuse sur le patrimoine affiché. Badge unique, réutilisé partout où une devise
// étrangère est convertie à l'écran (miroir de DECISION-PRIVACY-UNE-SEULE-SORTIE : un signal posé
// pour UNE surface ne protège que celle-là).
//
// ⚠️ [FX-TAUX-JAMAIS-ARRIVES] Ce badge DISAIT le problème et n'offrait AUCUNE sortie : la lecture
// automatique ne tournait qu'une fois au démarrage, et rien dans l'app ne permettait de la relancer
// ni de poser un taux à la main. Mesuré sur l'état réel de Marc le 2026-09-16 — facteurs 1,4000 et
// 1,4700 au dix-millième, soit le littéral du dépôt — il portait donc cet avertissement depuis
// toujours sans que rien ne puisse le faire taire. Un avertissement qu'on ne peut pas résoudre
// apprend à être ignoré ; le `title` nomme désormais l'endroit où agir.
import React from 'react';
import { Badge } from './Badge';
import { useFinanceStore } from '../../store/useFinanceStore';
import { hasForeignCurrencyAssets } from '../../services/portfolio';
import { fxSourceEffective, libelleSourceFx, type FxSource } from '../../services/fx/provenance';

/** Le texte du `title` dépend de la PROVENANCE : deux situations, deux gestes différents. */
const EXPLICATION: Readonly<Record<Exclude<FxSource, 'api'>, string>> = {
    repli: 'Le taux de change USD/EUR n\'a pas pu être récupéré auprès de la Banque du Canada — '
        + 'un repli approximatif écrit dans le code est utilisé pour convertir tes avoirs étrangers '
        + 'en dollars canadiens. Réglages → Système & diagnostics permet de réessayer ou de saisir '
        + 'le taux à la main.',
    manuel: 'Le taux de change appliqué est celui que tu as saisi toi-même, pas une lecture de la '
        + 'Banque du Canada. Réglages → Système & diagnostics permet de relancer la lecture '
        + 'automatique.',
};

/** `null` si aucun avoir étranger ou si le taux vient bien de l'API — pas de bruit hors-sujet. */
export const FxEstimateBadge: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'sm' }) => {
    const source = useFinanceStore(fxSourceEffective);
    const assets = useFinanceStore(s => s.assets);
    if (source === 'api' || !hasForeignCurrencyAssets(assets)) return null;
    return (
        <Badge
            variant="warning"
            size={size}
            title={EXPLICATION[source]}
        >
            {libelleSourceFx(source)}
        </Badge>
    );
};
