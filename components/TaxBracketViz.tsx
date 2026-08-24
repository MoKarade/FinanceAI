// Phase G.3 — Visualisation tranches d'imposition.
//   Les BARRES + le détail $ montrent la répartition du revenu par palier (BRUT, avant crédits) —
//   pédagogique. Le TOTAL et le taux EFFECTIF affichés viennent de calculateFiscalReport (impôt NET,
//   crédits inclus : BPA + abattement QC) = l'impôt réel de la projection (fix M4, audit 2026-06-17).

import React from 'react';
import { Card } from './ui/Card';
// `FED_BRACKETS` reste importé pour son TYPE (`typeof FED_BRACKETS`) ; les VALEURS affichées
// viennent toutes de `bracketsForYear(year)` — plus aucune table 2026 en dur ici.
import { FED_BRACKETS, bracketsForYear, calculateFiscalReport } from '../utils/tax';
import { formatCAD, formatPercent } from '../utils/format';
import { ChartDataTable, type ChartDataColumn } from './ui/ChartDataTable';
import { PrivateAmount } from './ui/PrivateAmount';
import { PrivateBlock } from './ui/PrivateBlock';
import { MASKED_AMOUNT_LABEL } from '../utils/privacyAria';
import { useFinanceStore } from '../store/useFinanceStore';

interface TaxBracketVizProps {
    annualGrossIncome: number;
    label?: string;
    /**
     * [TAXBRACKETVIZ-ANNEE] Année fiscale des paliers ET du total. **REQUISE, sans défaut.**
     *
     * ⚠️ Un défaut `= 2026` se PÉRIME en silence, et lire l'horloge ici rendrait le composant
     * non déterministe — donc ses tests seraient une bombe au 1er janvier
     * (`UN-DEFAUT-QUI-SE-PERIME-SE-CORRIGE-EN-RENDANT-LE-CHAMP-REQUIS`). En la rendant requise,
     * le typecheck exige que CHAQUE appelant, présent et futur, dise de quelle année il parle.
     *
     * MESURÉ, coût du 2026 figé sur l'impôt total affiché : +212 $ (1,0 %) dès 2027 à 86 968 $ de
     * brut, +874 $ (4,4 %) en 2030, +2 069 $ (11,1 %) en 2035 — et +5 095 $ à 200 000 $ en 2035.
     * Ce n'est donc pas un biais fixe : il COMPOSE à ~2 %/an, comme l'indexation qu'il ignore.
     */
    year: number;
}

function computeTaxBreakdown(income: number, brackets: typeof FED_BRACKETS): { perBracket: Array<{ rate: number; income: number; tax: number; from: number; to: number }>; totalTax: number; marginalRate: number; effectiveRate: number } {
    let totalTax = 0;
    let prev = 0;
    let marginalRate = 0;
    const perBracket: Array<{ rate: number; income: number; tax: number; from: number; to: number }> = [];
    for (const b of brackets) {
        const max = b.upTo === Infinity ? Number.MAX_SAFE_INTEGER : b.upTo;
        const incomeInBracket = Math.max(0, Math.min(income, max) - prev);
        const taxInBracket = incomeInBracket * b.rate;
        perBracket.push({ rate: b.rate, income: incomeInBracket, tax: taxInBracket, from: prev, to: max });
        totalTax += taxInBracket;
        if (income > prev && income <= max) marginalRate = b.rate;
        prev = max;
        if (income <= max) break;
    }
    return { perBracket, totalTax, marginalRate, effectiveRate: income > 0 ? totalTax / income : 0 };
}

export const TaxBracketViz: React.FC<TaxBracketVizProps> = ({ annualGrossIncome, label, year }) => {
    // [AUDIT-SAFETY / revue #608] Ce composant n'avait AUCUNE notion de mode discret : revenu brut,
    // impôt net, détail $ par palier et taux dérivés s'affichaient en clair — y compris dans les
    // `aria-label` et `title`. Frontière retenue : les BORNES et TAUX de palier sont du DROIT FISCAL
    // PUBLIC (ils restent visibles, c'est ce qui rend l'écran pédagogique) ; tout ce qui se DÉRIVE du
    // revenu de Marc est masqué — montants, taux effectif/marginal (ils désignent sa tranche), le
    // marqueur de revenu (sa POSITION est un montant) et l'échelle de l'axe.
    const isPrivacyMode = useFinanceStore((s) => s.isPrivacyMode);
    /** Montant destiné à un attribut (aria-label, title, caption) — pas de nœud DOM à envelopper. */
    const money = (v: number) => (isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(v));
    // En mode discret, l'échelle est FIGÉE au palier public : sinon `annualGrossIncome * 1.2`
    // ferait varier la largeur des barres avec le revenu — une fuite par la géométrie.
    const maxIncome = isPrivacyMode ? 300000 : Math.max(annualGrossIncome * 1.2, 300000);

    // [TAXBRACKETVIZ-ANNEE] Les barres ET le total lisent la MÊME année. Un demi-correctif — total
    // indexé, barres figées à 2026 — serait PIRE que le défaut d'origine : il créerait une
    // incohérence VISIBLE entre des barres et la somme affichée juste en dessous, là où le décalage
    // actuel est au moins cohérent avec lui-même.
    const { fed: fedBrackets, qc: qcBrackets } = bracketsForYear(year);
    const fedBreakdown = computeTaxBreakdown(annualGrossIncome, fedBrackets as never);
    const qcBreakdown = computeTaxBreakdown(annualGrossIncome, qcBrackets as never);
    // [M4] Total + taux effectif = impôt NET (crédits inclus) via la source unique calculateFiscalReport,
    // PAS la somme brute par palier (surévaluée). Les barres restent brutes (pédagogiques).
    const report = calculateFiscalReport(annualGrossIncome, 0, 0, year);
    const netRate = (net: number) => (annualGrossIncome > 0 ? net / annualGrossIncome : 0);

    const renderBracketBar = (
        brackets: typeof FED_BRACKETS,
        jurisdiction: string,
        colorBase: string,
        breakdown: ReturnType<typeof computeTaxBreakdown>,
        netTax: number,
    ) => {
        // [A11Y-TAXBRACKET] alternative texte (sr-only) au graphe de barres, opaque aux lecteurs d'écran (WCAG 1.1.1 A).
        const ladderColumns: ChartDataColumn[] = [
            { key: 'range', label: 'Tranche de revenu' },
            { key: 'rate', label: 'Taux marginal' },
        ];
        const ladderRows = brackets.map((b: { rate: number; upTo: number }, i: number) => ({
            range: `${formatCAD(i === 0 ? 0 : brackets[i - 1].upTo)} → ${b.upTo === Infinity ? '∞' : formatCAD(b.upTo)}`,
            rate: `${(b.rate * 100).toFixed(1)} %`,
        }));
        return (
            <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                    <h3 className="text-meta font-bold text-white">{jurisdiction}</h3>
                    <PrivateBlock as="span" className="text-tiny font-mono" title="Impôt net (crédits inclus)">
                        <span className="text-danger-400">{formatCAD(netTax)}</span>
                        <span className="text-ink-400 mx-1">·</span>
                        <span className="text-warning-400">{formatPercent(netRate(netTax) * 100, 2)} effectif</span>
                        <span className="text-ink-400 mx-1">·</span>
                        <span className="text-info-400">{formatPercent(breakdown.marginalRate * 100, 0)} marginal</span>
                    </PrivateBlock>
                </div>
                <div
                    className="relative h-8 bg-black/40 rounded overflow-hidden border border-white/10"
                    role="img"
                    aria-label={isPrivacyMode
                        ? `Graphique des tranches d'imposition ${jurisdiction}. Revenu et taux masqués (mode discret). Détail dans le tableau suivant.`
                        : `Graphique des tranches d'imposition ${jurisdiction}. Revenu brut ${formatCAD(annualGrossIncome)}, taux marginal ${(breakdown.marginalRate * 100).toFixed(0)} %. Détail dans le tableau suivant.`}
                >
                    {/* Contenu purement visuel : masqué au SR (décrit par aria-label + ChartDataTable sr-only).
                        role="img" rend déjà les enfants présentationnels, mais aria-hidden lève toute ambiguïté inter-AT. */}
                    <div className="absolute inset-0" aria-hidden="true">
                    {brackets.map((b: { rate: number; upTo: number }, i: number) => {
                        const min = i === 0 ? 0 : brackets[i - 1].upTo;
                        const max = b.upTo === Infinity ? maxIncome : b.upTo;
                        const startPct = (min / maxIncome) * 100;
                        const widthPct = ((Math.min(max, maxIncome) - min) / maxIncome) * 100;
                        const intensity = 0.2 + (i / brackets.length) * 0.6;
                        return (
                            <div
                                key={i}
                                className="absolute top-0 h-full flex items-center justify-center"
                                style={{
                                    left: `${startPct}%`,
                                    width: `${widthPct}%`,
                                    background: `rgba(${colorBase}, ${intensity})`,
                                }}
                                title={`Tranche ${(b.rate * 100).toFixed(1)}% : ${formatCAD(min)} → ${b.upTo === Infinity ? '∞' : formatCAD(b.upTo)}`}
                            >
                                <span className="text-tiny text-white font-mono">{(b.rate * 100).toFixed(0)}%</span>
                            </div>
                        );
                    })}
                    {/* Marqueur du revenu — NON rendu en mode discret : sa position EST le montant. */}
                    {!isPrivacyMode && (
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-yellow-400"
                        style={{ left: `${(annualGrossIncome / maxIncome) * 100}%` }}
                        title={`Revenu : ${formatCAD(annualGrossIncome)}`}
                    >
                        <div className="absolute -top-1 -translate-x-1/2 w-2 h-2 bg-yellow-400 rounded-full" />
                    </div>
                    )}
                    </div>
                </div>
                <div className="flex justify-between text-tiny text-ink-400">
                    <span>0 $</span>
                    <PrivateAmount className="text-yellow-400 font-bold">{formatCAD(annualGrossIncome)}</PrivateAmount>
                    <span>{formatCAD(maxIncome)}</span>
                </div>

                <ChartDataTable
                    caption={isPrivacyMode
                        ? `${jurisdiction} — paliers d'imposition ; revenu, taux et impôt masqués (mode discret).`
                        : `${jurisdiction} — paliers d'imposition ; revenu brut ${money(annualGrossIncome)}, taux marginal ${(breakdown.marginalRate * 100).toFixed(0)} %, impôt net ${money(netTax)}.`}
                    columns={ladderColumns}
                    rows={ladderRows}
                />

                {/* Phase G.3 — Détail $ par palier consommé.
                    [revue #608, 3e tour] NON rendu en mode discret : le filtre `b.income > 0` ne
                    garde que les paliers ATTEINTS, donc le simple NOMBRE de lignes encode la tranche
                    marginale (mesuré : 2 lignes à 30 k$, 8 à 250 k$) — même avec chaque montant
                    masqué. Masquer les valeurs sans masquer leur EXISTENCE ne suffit pas. */}
                {!isPrivacyMode && (
                <details className="text-tiny">
                    <summary className="cursor-pointer text-ink-400 hover:text-ink-200 italic py-1.5">
                        Voir décomposition $ par tranche
                    </summary>
                    <div className="mt-1 space-y-0.5 pl-2 border-l border-white/10">
                        {breakdown.perBracket.map((b, i) => b.income > 0 && (
                            <div key={i} className="flex justify-between font-mono">
                                <span className="text-ink-400">
                                    {formatCAD(b.from)} → {b.to === Number.MAX_SAFE_INTEGER ? '∞' : formatCAD(b.to)}
                                </span>
                                <span>
                                    <span className="text-ink-300"><PrivateAmount>{formatCAD(b.income)}</PrivateAmount> × {(b.rate * 100).toFixed(1)}% = </span>
                                    <PrivateAmount className="text-red-300">{formatCAD(b.tax)}</PrivateAmount>
                                </span>
                            </div>
                        ))}
                    </div>
                </details>
                )}
            </div>
        );
    };

    const combinedMarginal = (fedBreakdown.marginalRate + qcBreakdown.marginalRate) * 100;
    // [M4] Effectif combiné = impôt NET total / revenu (crédits inclus), pas la somme des taux bruts.
    const combinedEffective = report.averageRate;

    return (
        <Card title={`Tranches d'imposition${label ? ` (${label})` : ''}`}>
            <div className="space-y-4">
                <p className="text-tiny text-ink-300 leading-snug">
                    Marqueur jaune = revenu brut annuel (<PrivateAmount>{formatCAD(annualGrossIncome)}</PrivateAmount>). Barres = répartition par
                    palier (AVANT crédits). Total/effectif = impôt NET (crédits inclus : BPA, abattement QC).
                    Marginal = taux du prochain dollar gagné.
                </p>
                {renderBracketBar(fedBrackets as never, 'Fédéral (ARC)', '59, 130, 246', fedBreakdown, report.fedTax)}
                {renderBracketBar(qcBrackets as never, 'Québec (Revenu Québec)', '236, 72, 153', qcBreakdown, report.qcTax)}
                <div className="grid grid-cols-2 gap-3 p-3 bg-white/5 rounded border border-white/10">
                    <div>
                        <div className="text-tiny text-ink-400 uppercase tracking-wide">Combiné effectif</div>
                        <PrivateAmount as="div" className="text-base font-bold text-warning-400 font-mono">{combinedEffective.toFixed(2)}%</PrivateAmount>
                    </div>
                    <div>
                        <div className="text-tiny text-ink-400 uppercase tracking-wide">Combiné marginal</div>
                        <PrivateAmount as="div" className="text-base font-bold text-info-400 font-mono">{combinedMarginal.toFixed(1)}%</PrivateAmount>
                    </div>
                </div>
                <p className="text-tiny text-ink-400 italic">
                    Pour optimiser : préfère REER si revenu actuel &gt; revenu à la retraite ;
                    privilégie CELI sinon. Bracket creep = augmenter dans une tranche fait BONDIR le marginal.
                </p>
            </div>
        </Card>
    );
};
