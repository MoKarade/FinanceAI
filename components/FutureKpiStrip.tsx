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
    /**
     * Précision de périmètre ou variation relative, sous la valeur.
     *
     * ⚠️ TYPÉ `ReactNode`, PAS `string` — leçon du dépôt : « un champ de texte d'interface qui peut
     * contenir un montant ne doit jamais être typé `string` » (déjà payée sur `DualKPIStat.sublabel`
     * et `PageHeader.subtitle`). Un montant interpolé dans une phrase n'est plus un nœud, donc plus
     * masquable — l'appelant doit pouvoir envelopper LA valeur et laisser l'explication lisible.
     *
     * Deux masquages, deux besoins distincts :
     *  · `privateSublabel` — le sous-titre est ENTIÈREMENT un montant (la variation en %) : on masque
     *    tout, l'appelant n'a rien à découper.
     *  · `<PrivateAmount>` posé par l'appelant — le sous-titre MÊLE explication et montant (« dont
     *    X $ d'hypothèque ») : seule la valeur part, la phrase reste. C'est aussi ce qu'exige
     *    `amountPrivacyScan` d'une ligne d'ATTRIBUT — elle porte sa marque À ELLE, le masquage du
     *    voisin ne lui sert jamais d'alibi.
     */
    sublabel?: React.ReactNode;
    privateSublabel?: boolean;
    /** Étiquette de PÉRIMÈTRE (assiette du chiffre), sous le sublabel — jamais privée : elle ne
     *  contient aucune donnée financière, et doit rester lisible même en mode discret. */
    scope?: string;
    /** Signal additionnel à côté du libellé (ex. FxEstimateBadge) — jamais de donnée financière. */
    badge?: React.ReactNode;
    /** Couleur de la valeur (maquette : dettes en rouge, épargne en vert). */
    ton?: string;
}> = ({ label, value, signed = false, sublabel, privateSublabel = false, scope, badge, ton = 'text-ink-50' }) => (
    <div className="min-w-0 rounded-2xl bg-surface border border-white/6 px-[18px] py-4 flex flex-col gap-1">
        <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-ink-400 flex flex-wrap items-center gap-1.5">
            {label}{badge}
        </p>
        {Number.isFinite(value) ? (
            <PrivateAmount as="div" className={`text-[22px] leading-tight font-bold font-mono ${ton}`}>
                {signed && value > 0 ? '+' : ''}{formatCAD(value)}
            </PrivateAmount>
        ) : (
            <div className="text-[22px] leading-tight font-bold text-ink-300">
                {/* [Audit a11y #600, LOW] NO_DATA_LABEL importé (source unique). */}
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

/**
 * [S5-REFONTE-FUTUR] Où le bandeau se rend (maquettes F-bureau / F-mobile) :
 *  · `bureau` — cinq tuiles (Patrimoine net, Total avoirs, Dettes, Liquidités, Épargne / mois) ;
 *  · `mobile-tete` — le patrimoine net en grand et l'épargne du mois, sous l'en-tête ;
 *  · `mobile-pied` — « Avoirs / dettes » et « Liquidités », en tuiles sous la courbe.
 * La variation 30 j (retirée des tuiles par la maquette) suit le patrimoine net, en une ligne,
 * et seulement quand elle est mesurée : pas de ligne « — » sous le chiffre de tête.
 */
export type VarianteBandeau = 'bureau' | 'mobile-tete' | 'mobile-pied';

export const FutureKpiStrip: React.FC<{
    netWorth: number;
    liquidity: number;
    monthlySavings: number;
    /** [KPI-AVOIRS-DETTES] Les deux TERMES hors immobilier, du MÊME appel que `netWorth`. */
    avoirsHorsImmo: number;
    dettesHorsImmo: number;
    variante?: VarianteBandeau;
}> = ({ netWorth, liquidity, monthlySavings, avoirsHorsImmo, dettesHorsImmo, variante = 'bureau' }) => {
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

    const net = netWorth + realEstateEquity;
    // [REFONTE-NAV-L2a] Variation 30 j — « liquide + placements » PAR CONSTRUCTION : son assiette
    // diffère du patrimoine net, et la ligne le dit (périmètre toujours écrit à côté).
    const ligneVariation = variation && (
        <p className="text-tiny text-ink-400" data-variation-30j="">
            <span>Variation 30 j </span>
            <PrivateAmount className={variation.diff >= 0 ? 'text-success-400' : 'text-danger-400'}>{`${variation.diff > 0 ? '+' : ''}${formatCAD(variation.diff)}`}</PrivateAmount>
            {variation.pct != null && <> (<PrivateAmount>{`${variation.pct > 0 ? '+' : ''}${formatPercent(variation.pct)}`}</PrivateAmount>)</>}
            <span> · {variationScope}</span>
        </p>
    );
    const detailHypotheque = realEstateHypotheque > 0.5 ? (
        <>dont <PrivateAmount>{formatCAD(realEstateHypotheque)}</PrivateAmount> d'hypothèque</>
    ) : undefined;

    if (variante === 'mobile-tete') {
        return (
            <section aria-label="Indicateurs clés" className="flex flex-col gap-1">
                <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink-400 flex items-center gap-1.5">Patrimoine net<FxEstimateBadge /></p>
                <div className="flex items-end justify-between gap-3">
                    {Number.isFinite(net)
                        ? <PrivateAmount as="div" className="font-mono text-[32px] leading-tight font-bold text-ink-50">{formatCAD(net)}</PrivateAmount>
                        : <div className="text-[32px] font-bold text-ink-300"><span aria-hidden="true">—</span><span className="sr-only">{NO_DATA_LABEL}</span></div>}
                    {Number.isFinite(monthlySavings) && (
                        <span className="pb-1.5 text-meta font-semibold text-success-400 whitespace-nowrap">
                            <PrivateAmount>{`${monthlySavings > 0 ? '+' : ''}${formatCAD(monthlySavings)}`}</PrivateAmount>/mois
                        </span>
                    )}
                </div>
                {hasRealEstate && <p className="text-tiny text-ink-400">équité immo incluse</p>}
                {ligneVariation}
            </section>
        );
    }
    if (variante === 'mobile-pied') {
        return (
            <>
                <div className="min-w-0 rounded-2xl bg-surface border border-white/6 p-3.5 flex flex-col gap-1">
                    <p className="text-meta text-ink-400">Avoirs / dettes</p>
                    <p className="font-mono text-[15px] font-bold leading-snug">
                        <PrivateAmount className="text-ink-50">{formatCAD(avoirs)}</PrivateAmount>{' '}
                        <PrivateAmount className="text-danger-400">{`−${formatCAD(dettes)}`}</PrivateAmount>
                    </p>
                    {detailHypotheque && <p className="text-tiny text-ink-400">{detailHypotheque}</p>}
                </div>
                <div className="min-w-0 rounded-2xl bg-surface border border-white/6 p-3.5 flex flex-col gap-1">
                    <p className="text-meta text-ink-400">Liquidités</p>
                    <PrivateAmount as="div" className="font-mono text-[15px] font-bold text-ink-50">{formatCAD(liquidity)}</PrivateAmount>
                </div>
            </>
        );
    }

    return (
        <section aria-label="Indicateurs clés" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
            <KpiTile
                label="Patrimoine net"
                value={net}
                sublabel={hasRealEstate ? 'équité immo incluse' : undefined}
                // [FX-FALLBACK-SILENCIEUX] : ce chiffre convertit les avoirs étrangers en CAD via
                // le taux du store — le signal doit vivre ICI (surface la plus vue de l'app).
                badge={<FxEstimateBadge />}
            />
            {/* [KPI-AVOIRS-DETTES] Les deux TERMES, à côté du net qu'ils composent (avoirs − dettes
                = patrimoine net, par construction — voir plus haut). */}
            <KpiTile
                label="Total avoirs"
                value={avoirs}
                sublabel={hasRealEstate ? 'valeur brute des biens incluse' : undefined}
            />
            <KpiTile
                label="Dettes"
                value={dettes}
                ton="text-danger-400"
                // ⚠️ Le détail demandé par Marc est PRIVÉ (montant) : seule la VALEUR est masquée,
                // la phrase reste — la COMPOSITION du total se lit sans qu'aucun chiffre ne sorte.
                sublabel={detailHypotheque}
            />
            <KpiTile label="Liquidités" value={liquidity} />
            <KpiTile label="Épargne / mois" value={monthlySavings} signed ton="text-success-400" />
            {ligneVariation && <div className="col-span-full -mt-1.5">{ligneVariation}</div>}
        </section>
    );
};
