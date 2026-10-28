// [FUTUR-KPI-PATRIMOINE-FIN-COURBE] (2026-09-25, décision Marc) — la tuile « Patrimoine » du Futur
// montre la valeur nette de FIN DE COURBE, le chiffre que Retraite et Placements affichent pour la
// même année. Elle montrait l'héritage net (`estateNetWorth` : impôt dû au décès retiré, rentes
// RRQ/PSV restantes ajoutées) sous le sous-libellé « Fin de l'horizon », que son info-bulle
// contredisait (« différent du patrimoine en fin d'horizon ») : persona « Couple à l'aise »,
// 9,79 M$ sur la tuile contre 11,23 M$ au bout de la courbe. L'héritage net reste consultable
// dans l'info-bulle, masqué en mode discret (l'info-bulle n'est pas floutée par `KPIStat`).
import { formatCompactCAD } from '../../utils/format';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';
import type { ProjectionResult } from '../../services/projection/types';

type ResultatsPatrimoine = Pick<ProjectionResult, 'finalNetWorth' | 'estateNetWorth' | 'fireNumber'>;

const BASE_INFO = "Valeur nette projetée à la fin de l'horizon : le même chiffre que le bout de la courbe.";

export function kpiPatrimoine(
    results: ResultatsPatrimoine | null | undefined,
    isPrivacyMode: boolean,
): { value: string; tooltip: string } {
    // Repli historique conservé tel quel : sans valeur finale (projection absente ou nulle), le
    // nombre FIRE sert de substitut plutôt qu'un « 0 $ » trompeur en mode test.
    const value = formatCompactCAD((results?.finalNetWorth || results?.fireNumber) || 0);
    const heritage = results?.estateNetWorth;
    if (!heritage) return { value, tooltip: BASE_INFO };
    const montant = isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCompactCAD(heritage);
    return {
        value,
        tooltip: `${BASE_INFO} Héritage net : ${montant}, une fois l'impôt dû au décès payé (REER et gains en capital) et la valeur des rentes RRQ/PSV restantes ajoutée.`,
    };
}
