import React, { useMemo } from 'react';
import { formatCAD, formatPercent } from '../utils/format';
import { PrivateAmount } from './ui/PrivateAmount';
import { NO_DATA_LABEL } from './ui/emptyAware';
import { useFinanceStore } from '../store/useFinanceStore';
import { useNetWorthVariation, VARIATION_WINDOW_DAYS } from '../hooks/useNetWorthVariation';
import { presentTermesOfGoal, monthsSince } from '../services/projection/pastPurchaseInit';
import { FxEstimateBadge } from './ui/FxEstimateBadge';

/**
 * [REFONTE-NAV Lot 1] Bandeau KPI compact AU-DESSUS de la courbe Future (choix Marc :
 * « bandeau compact au-dessus »). Reprend les chiffres de tête de l'ex-Accueil pour que
 * son retrait ne perde rien : patrimoine net, variation 30 j, liquidités, épargne du mois.
 *
 * Valeurs = dérivées RÉELLES du store (useDerivedFinancials via TabRouter + hooks internes),
 * jamais de la projection — le bandeau reste juste même quand la courbe recalcule.
 * No-fake-data : une valeur non finie s'affiche « — » (jamais un 0 $ crédible).
 * [REFONTE-NAV-L2a] Variation 30 j (useNetWorthVariation) + équité immo dans le patrimoine
 * (mêmes conventions que le KPI de l'ex-Accueil, étiquetée). Itération panel #601 : la
 * variation couvre « liquide + placements » PAR CONSTRUCTION (les termes immo/dettes à
 * granularité annuelle/constante fabriquaient des sauts fictifs au 31 décembre) — son
 * assiette de % diffère donc de la tuile Patrimoine et l'étiquette de périmètre le dit
 * (leçon DASH-NETWORTH-CANONICAL). Reste (santé financière…) : Lot 2b.
 */
const KpiTile: React.FC<{
    label: string;
    value: number;
    signed?: boolean;
    /** Précision de périmètre ou variation relative, sous la valeur. Masquée avec la valeur en
     *  mode discret quand `privateSublabel` (un % de variation reste une donnée financière). */
    sublabel?: string;
    privateSublabel?: boolean;
    /** Étiquette de PÉRIMÈTRE (assiette du chiffre), sous le sublabel — jamais privée : elle ne
     *  contient aucune donnée financière, et doit rester lisible même en mode discret. */
    scope?: string;
    /** Signal additionnel à côté du libellé (ex. FxEstimateBadge) — jamais de donnée financière. */
    badge?: React.ReactNode;
}> = ({ label, value, signed = false, sublabel, privateSublabel = false, scope, badge }) => (
    <div className="flex-1 min-w-[140px] rounded-card bg-white/5 border border-white/5 px-4 py-3">
        <p className="text-tiny uppercase tracking-widest text-ink-400 font-bold flex flex-wrap items-center gap-1.5">
            {label}{badge}
        </p>
        {Number.isFinite(value) ? (
            <PrivateAmount as="div" className="text-lg font-bold text-ink-50 font-mono">
                {signed && value > 0 ? '+' : ''}{formatCAD(value)}
            </PrivateAmount>
        ) : (
            <div className="text-lg font-bold text-ink-300">
                {/* [Audit a11y #600, LOW] NO_DATA_LABEL importé (source unique) — une chaîne
                    re-codée en dur dérive en silence si le libellé canonique change. */}
                <span aria-hidden="true">—</span>
                <span className="sr-only">{NO_DATA_LABEL}</span>
            </div>
        )}
        {sublabel && (privateSublabel ? (
            <PrivateAmount as="div" className="text-tiny text-ink-400">{sublabel}</PrivateAmount>
        ) : (
            <p className="text-tiny text-ink-400">{sublabel}</p>
        ))}
        {scope && <p className="text-tiny text-ink-400">{scope}</p>}
    </div>
);

export const FutureKpiStrip: React.FC<{
    netWorth: number;
    liquidity: number;
    monthlySavings: number;
    /** [KPI-AVOIRS-DETTES] Les deux TERMES hors immobilier, du MÊME appel que `netWorth`. */
    avoirsHorsImmo: number;
    dettesHorsImmo: number;
}> = ({ netWorth, liquidity, monthlySavings, avoirsHorsImmo, dettesHorsImmo }) => {
    // [REFONTE-NAV-L2a] Variation 30 j — liquide + placements (hook, pas de prop-drilling).
    // `null` (couverture < 2 points) → tuile « — » : jamais un 0 $ crédible.
    const variation = useNetWorthVariation();

    // [MED #601] Si l'étendue réelle des données est plus courte que la fenêtre demandée
    // (portefeuille jeune, historique périmé), le périmètre DIT « sur N j de données » au
    // lieu de laisser le titre « 30 j » mentir sur la couverture.
    const variationScope = variation && variation.spanDays < VARIATION_WINDOW_DAYS
        ? `liquide + placements · sur ${variation.spanDays} j de données`
        : 'liquide + placements (courbe historique)';

    // [REFONTE-NAV-L2a] Parité avec le KPI patrimoine de l'ex-Accueil (DASH-NW-DUP) : la prop
    // `netWorth` (useDerivedFinancials → computePresentNetWorth) est HORS immo — l'ex-Accueil y
    // AJOUTAIT l'équité immobilière et l'étiquetait. On reprend les deux ENSEMBLE : ajouter
    // l'étiquette sans la valeur (ou l'inverse) referait la classe « deux patrimoines à l'écran ».
    // `presentEquityOfGoal` porte sa propre garde non-fini (bien exclu + log throttlé).
    // [LOW #601] La porte de l'étiquette est `.some(équité ≠ 0)` — parité EXACTE avec le gate
    // de l'ex-Accueil : deux équités qui se compensent (somme 0) restent de l'immobilier à
    // l'écran, l'étiquette doit s'afficher même si la somme ajoutée est nulle.
    const realEstateGoals = useFinanceStore(s => s.realEstateGoals);
    // [KPI-AVOIRS-DETTES] Les deux termes de CHAQUE bien viennent d'un seul appel
    // (`presentTermesOfGoal`), dont `presentEquityOfGoal` dérive : `valeur − hypothèque === équité`
    // par construction. Les calculer séparément ferait trois chiffres qui cessent de se recomposer
    // au premier correctif appliqué à un seul (`UNE-FORMULE-MONEY-CRITICAL-RECOPIEE-DIVERGE`).
    const { realEstateEquity, realEstateValeur, realEstateHypotheque, hasRealEstate } = useMemo(() => {
        const termes = realEstateGoals.map(g => presentTermesOfGoal(g, monthsSince(g.purchaseDate)));
        const somme = (f: (t: { valeur: number; hypotheque: number }) => number) =>
            termes.reduce((sum, t) => sum + f(t), 0);
        return {
            realEstateEquity: somme(t => t.valeur - t.hypotheque),
            realEstateValeur: somme(t => t.valeur),
            realEstateHypotheque: somme(t => t.hypotheque),
            hasRealEstate: termes.some(t => t.valeur - t.hypotheque !== 0),
        };
    }, [realEstateGoals]);

    /**
     * [KPI-AVOIRS-DETTES] Marc, 2026-09-21 : « je veux voir ma somme totale d'argent et ma somme
     * totale de dettes / ce que je dois ». Il a tranché que « ce que je dois » inclut
     * l'hypothèque, AVEC son détail — c'est ce que le sous-titre porte.
     *
     * ⚠️⚠️ L'IDENTITÉ QUE CES TROIS TUILES DOIVENT TENIR À L'ŒIL :
     *     avoirs − dettes = patrimoine net
     * Elle est vraie PAR CONSTRUCTION ici, et il ne faut pas s'en écarter :
     *     avoirs   = (actifs hors immo)      + valeur BRUTE des biens
     *     dettes   = (dettes hors immo)      + hypothèques
     *     net      = (actifs − dettes) hors immo + (valeur − hypothèque)  ← la tuile existante
     * ⚠️ Si les dettes incluent l'hypothèque, les avoirs DOIVENT porter la valeur BRUTE. Mettre
     * l'équité d'un côté et l'hypothèque de l'autre la retrancherait DEUX fois — et trois chiffres
     * d'un même écran qui ne se recomposent pas, c'est la classe de défaut que Marc a signalée
     * quatre fois en deux jours.
     * ⚠️ L'identité tient sur les valeurs BRUTES ; les tuiles, elles, ARRONDISSENT chacune à
     * l'affichage, donc la somme lue peut différer d'un dollar. C'est de l'arrondi d'affichage,
     * pas une dérive — et c'est pour ça que la garde vérifie l'identité sur les nombres, pas sur
     * le texte rendu.
     */
    const avoirs = avoirsHorsImmo + realEstateValeur;
    const dettes = dettesHorsImmo + realEstateHypotheque;

    return (
        <section aria-label="Indicateurs clés" className="flex flex-wrap gap-2 md:gap-3 mb-4">
            <KpiTile
                label="Patrimoine net"
                value={netWorth + realEstateEquity}
                sublabel={hasRealEstate ? 'équité immo incluse' : undefined}
                // [FX-FALLBACK-SILENCIEUX] : ce chiffre convertit les avoirs étrangers en CAD via
                // le taux du store — le signal doit vivre ICI (surface la plus vue de l'app),
                // pas seulement dans SystemView.
                badge={<FxEstimateBadge />}
            />
            <KpiTile
                label="Variation 30 j"
                // `NaN` volontaire quand la couverture est insuffisante → la tuile rend « — »
                // + sr-only NO_DATA_LABEL (no-fake-data), jamais 0 $.
                value={variation ? variation.diff : Number.NaN}
                signed
                // [LOW #601] `+` sur le % positif, comme la ligne $ (cohérence de signe).
                sublabel={variation && variation.pct != null
                    ? `${variation.pct > 0 ? '+' : ''}${formatPercent(variation.pct)}`
                    : undefined}
                privateSublabel
                scope={variationScope}
            />
            {/* [KPI-AVOIRS-DETTES] Les deux TERMES, à côté du net qu'ils composent. Six tuiles :
                choix de Marc — « on garde tout », Liquidités comprise (elle est un sous-ensemble
                des avoirs, mais c'est le chiffre qu'il regarde tous les jours). */}
            <KpiTile
                label="Total avoirs"
                value={avoirs}
                sublabel={hasRealEstate ? 'valeur brute des biens incluse' : undefined}
            />
            <KpiTile
                label="Dettes"
                value={dettes}
                // ⚠️ Le détail que Marc a demandé, et il est PRIVÉ : c'est un montant. Affiché
                // seulement quand il existe — « dont 0 $ d'hypothèque » sur un dossier sans
                // immobilier serait du décor (`UN-AVERTISSEMENT-PERMANENT-EST-UN-AVERTISSEMENT-MORT`).
                sublabel={realEstateHypotheque > 0.5 ? `dont ${formatCAD(realEstateHypotheque)} d'hypothèque` : undefined}
                privateSublabel
            />
            <KpiTile label="Liquidités" value={liquidity} />
            <KpiTile label="Épargne / mois" value={monthlySavings} signed />
        </section>
    );
};
