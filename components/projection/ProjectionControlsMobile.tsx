import React from 'react';
import { Select } from '../ui/Select';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/Button';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { Badge } from '../ui/Badge';
import { ProjectionConfig, RealEstateGoal } from '../../types';
import { AdvancedProjectionParams } from '../AdvancedProjectionParams';
import { ReturnRateField } from './ReturnRateField';
import { FluxMensuelsFields } from './macroFields/FluxMensuelsFields';
import { ValeurMaxMaisonField } from './macroFields/ValeurMaxMaisonField';
import { STOCHASTIC_TOGGLES, INFLATION_CATEGORIES, REPLAY_OPTIONS } from './ProjectionControls';

/**
 * [FUTUR-MOBILE-PR4] Composition MOBILE de l'onglet Hypothèses — décision Marc 2026-09-10 :
 * ordre Mode (rendu par le parent, INCHANGÉ) → macro → rendements → sections repliées (inflation
 * par poste, risques, rejeu krach, avancés). Le desktop garde sa grille en 4 colonnes dans
 * `ProjectionControls.tsx`, ENTIÈREMENT séparée de ce fichier — aucune des deux vues n'importe le
 * JSX de l'autre, seulement les tableaux de config partagés (`STOCHASTIC_TOGGLES` etc.) et les deux
 * fragments à rendu VERBATIM (`FluxMensuelsFields`, `ValeurMaxMaisonField`).
 *
 * Bornes des curseurs COPIÉES depuis `ProjectionControls.tsx` (desktop) pour les champs qui y ont déjà
 * un curseur ; crypto/cash n'avaient qu'un champ numérique NON BORNÉ dans `AdvancedProjectionParams`
 * (avancés, desktop) — ce lot leur donne des bornes raisonnables (0–30 %, 0–10 %) UNIQUEMENT pour le
 * curseur mobile, sans toucher au champ desktop existant.
 */
interface LiveCSVBalances {
    CELI: number;
    REER: number;
    NON_ENREG: number;
    CRYPTO: number;
    REEE: number;
    TOTAL: number;
    historicalRate: number;
}

interface ProjectionControlsMobileProps {
    projection: ProjectionConfig;
    updateProj: (key: keyof ProjectionConfig, val: unknown) => void;
    updateReturnRate: (key: string, val: number) => void;
    runMC: boolean;
    liveCSVBalances: LiveCSVBalances;
    applyHistoricalRate: () => void;
    realEstateGoals: RealEstateGoal[];
    setRealEstateGoals?: (g: RealEstateGoal[]) => void;
    isPrivacyMode: boolean;
    activeStochasticCount: number;
    showStochastic: boolean;
    setShowStochastic: (v: boolean) => void;
    projAsMap: Record<string, unknown>;
}

export const ProjectionControlsMobile: React.FC<ProjectionControlsMobileProps> = ({
    projection, updateProj, updateReturnRate,
    runMC, liveCSVBalances, applyHistoricalRate,
    realEstateGoals, setRealEstateGoals, isPrivacyMode,
    activeStochasticCount, showStochastic, setShowStochastic, projAsMap,
}) => (
    <>
        {/* §1 mobile — Macro (toujours visible, comme desktop, mais empilée sur 1 colonne) */}
        <CollapsibleSection
            title="Hypothèses macroéconomiques"
            icon={<Icon name="cash" size={20} />}
            defaultOpen={true}
        >
            <div className="space-y-5">
                <FluxMensuelsFields projection={projection} updateProj={updateProj} useTheoretical={!!projection.useTheoretical} isPrivacyMode={isPrivacyMode} />
                <div className="space-y-4">
                    <h4 className="text-tiny uppercase text-ink-400 border-b border-white/10 pb-1">Facteurs Macro</h4>
                    <ReturnRateField
                        label="Horizon (Années)" unit="ans" value={projection.years || 30}
                        onChange={(v) => updateProj('years', v)} min={5} max={50} step={1}
                        colorClassName="text-secondary" accentClassName="accent-secondary"
                    />
                    <ReturnRateField
                        label="Inflation" value={projection.inflationRate}
                        onChange={(v) => updateProj('inflationRate', v)} min={0} max={8} step={0.1}
                        colorClassName="text-danger-400" accentClassName="accent-danger-500"
                    />
                    <ReturnRateField
                        label="Hausse Salaire (An)" value={projection.salaryGrowth ?? 2.5}
                        onChange={(v) => updateProj('salaryGrowth', v)} min={0} max={10} step={0.1}
                        colorClassName="text-info-400" accentClassName="accent-info-500"
                    />
                    <ReturnRateField
                        label="Coussin de Sécurité" unit="mois" value={projection.emergencyFundMonths || 3}
                        onChange={(v) => updateProj('emergencyFundMonths', v)} min={1} max={12} step={1}
                        colorClassName="text-info-400" accentClassName="accent-info-500"
                    />
                </div>
                <ValeurMaxMaisonField realEstateGoals={realEstateGoals} setRealEstateGoals={setRealEstateGoals} isPrivacyMode={isPrivacyMode} />
            </div>
        </CollapsibleSection>

        {/* §2 mobile — Rendements estimés (les 5 taux, curseur + champ synchronisés) */}
        <CollapsibleSection
            title="Rendements Estimés"
            icon={<Icon name="cash" size={20} />}
            defaultOpen={true}
        >
            {/* ⚠️ Le bouton « Auto » n'est PAS un `badge` de `CollapsibleSection` : ce prop se rend À
                L'INTÉRIEUR du bouton d'accordéon (`CollapsibleSection.tsx:68`) — l'y placer imbriquerait
                un bouton dans un bouton (HTML invalide, double déclenchement au clic, piège déjà payé
                au PR3 sur « Tout réafficher »). Rendu ici, en CONTENU de section (frère, pas parent). */}
            <div className="space-y-4">
                {liveCSVBalances.historicalRate > 0 && (
                    <Button
                        onClick={applyHistoricalRate}
                        variant="ghost"
                        size="sm"
                        title="Appliquer le rendement composé observé sur ton historique. ⚠️ Il inclut tes APPORTS (pas seulement la croissance des titres) → il SURESTIME le rendement pur, surtout sur un historique court (fiable à partir de ~3 ans)."
                    >
                        Auto ({liveCSVBalances.historicalRate.toFixed(1)}%)
                    </Button>
                )}
                <ReturnRateField
                    label="CELI (Tax Free)" value={projection.returnRates?.celi || 7}
                    onChange={(v) => updateReturnRate('celi', v)} min={2} max={15} step={0.1}
                    colorClassName="text-warning-400" accentClassName="accent-warning-500"
                />
                <ReturnRateField
                    label="Non-Enregistré / REER" value={projection.returnRates?.nonReg || 6.5}
                    onChange={(v) => updateProj('returnRates', { ...(projection.returnRates || { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 }), nonReg: v, reer: v })}
                    min={2} max={15} step={0.1}
                    colorClassName="text-warning-400" accentClassName="accent-warning-500"
                />
                {/* Crypto/Cash n'avaient qu'un champ NUMÉRIQUE NON BORNÉ dans « Paramètres avancés »
                    (desktop ET mobile, `AdvancedProjectionParams`, INCHANGÉ) — ce curseur mobile
                    élève les 5 taux au même niveau de visibilité, avec des bornes RAISONNABLES pour
                    le geste tactile. Les deux contrôles éditent le MÊME champ (`returnRates.crypto`) :
                    doublon délibéré (accès rapide + réglage fin), pas une régression. */}
                <ReturnRateField
                    label="Crypto" value={projection.returnRates?.crypto ?? 10}
                    onChange={(v) => updateReturnRate('crypto', v)} min={0} max={30} step={0.5}
                    colorClassName="text-teal-400" accentClassName="accent-teal-500"
                />
                <ReturnRateField
                    label="Cash / HISA" value={projection.returnRates?.cash ?? 3}
                    onChange={(v) => updateReturnRate('cash', v)} min={0} max={10} step={0.1}
                    colorClassName="text-teal-400" accentClassName="accent-teal-500"
                />
            </div>
        </CollapsibleSection>

        {/* §3 mobile — Inflation par poste (repliée, section À PART — combinée à « Risques » sur desktop) */}
        <CollapsibleSection
            title="Inflation par poste"
            icon={<Icon name="cash" size={20} />}
            defaultOpen={false}
        >
            <div className="space-y-3">
                <Button
                    onClick={() => updateProj('usePerCategoryInflation', !projection.usePerCategoryInflation)}
                    variant={projection.usePerCategoryInflation ? 'primary' : 'ghost'}
                    size="sm"
                    title="Décompose l'inflation en 6 postes (logement, alim, transport, santé, loisirs, autres) avec pondérations CPI 2023."
                >
                    Inflation par poste {projection.usePerCategoryInflation ? 'ON' : 'OFF'}
                </Button>
                {projection.usePerCategoryInflation && (
                    <div className="space-y-3 mt-3 p-3 rounded-card border border-warning-border bg-warning-bg">
                        {INFLATION_CATEGORIES.map(item => (
                            <ReturnRateField
                                key={item.key}
                                label={`${item.label} (${item.weight}%)`}
                                value={(projAsMap[item.key] as number | undefined) ?? item.def}
                                onChange={(v) => updateProj(item.key as keyof ProjectionConfig, v)}
                                min={0} max={10} step={0.1}
                                colorClassName="text-warning-400" accentClassName="accent-warning-500"
                            />
                        ))}
                    </div>
                )}
            </div>
        </CollapsibleSection>

        {/* §4 mobile — Risques & aléas (stochastiques + US withholding + soins LD, sans l'inflation
            par poste ni le replay — chacun sa propre section repliée sur mobile). */}
        <CollapsibleSection
            title="Risques & aléas"
            icon={<Icon name="dice" size={20} />}
            defaultOpen={runMC}
            badge={activeStochasticCount > 0 ? <Badge variant="warning" size="sm">{activeStochasticCount} aléas actifs</Badge> : undefined}
        >
            <div className="space-y-4">
                {!runMC && (
                    <p className="text-tiny text-ink-400 leading-snug">
                        Ces réglages prennent tout leur sens en <strong className="text-ink-200">Monte Carlo</strong>
                        {' '}(bandes P10–P90).
                    </p>
                )}
                <div className="space-y-4 p-3 rounded-card border border-white/5 bg-black/30">
                    <ReturnRateField
                        label="🇺🇸 Part actions US dans CELI" value={projection.usEquityShareCeli ?? 0}
                        onChange={(v) => updateProj('usEquityShareCeli', v)} min={0} max={100} step={5}
                        colorClassName="text-info-400" accentClassName="accent-info-500"
                    />
                    <p className="text-tiny text-ink-400 -mt-2">VOO/SPY/QQQ... Le CELI n'est PAS protégé du withholding US 15% (le REER si).</p>
                    <ReturnRateField
                        label="Rendement dividende US" value={projection.usEquityDividendYield ?? 1.5}
                        onChange={(v) => updateProj('usEquityDividendYield', v)} min={0} max={5} step={0.1}
                        colorClassName="text-info-400" accentClassName="accent-info-500"
                    />
                    <p className="text-tiny text-ink-400 -mt-2">Yield moyen S&P 500 ≈ 1.5%. Drag = part × yield × 15%.</p>
                </div>

                <div className="pt-2 border-t border-white/10">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h4 className="text-tiny uppercase text-ink-400 flex items-center gap-1.5">
                            <Icon name="wind" size={14} /> Événements de vie aléatoires
                        </h4>
                        {!showStochastic && (
                            <Button onClick={() => setShowStochastic(true)} variant="ghost" size="sm"
                                title="Perte d'emploi, divorce, invalidité, soins de longue durée, héritage… (Monte Carlo)">
                                Activer des aléas… ({STOCHASTIC_TOGGLES.length})
                            </Button>
                        )}
                    </div>
                    {showStochastic && (
                        <div className="grid grid-cols-1 gap-2 mt-3">
                            {STOCHASTIC_TOGGLES.map(({ key, label, title }) => {
                                const isOn = !!projAsMap[key];
                                return (
                                    <Button
                                        key={key}
                                        onClick={() => updateProj(key as keyof ProjectionConfig, !isOn)}
                                        variant={isOn ? 'primary' : 'ghost'}
                                        size="sm"
                                        title={title}
                                        fullWidth
                                    >
                                        {label} {isOn ? 'ON' : 'OFF'}
                                    </Button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {projection.ltcEnabled && (
                    <div className="mt-3 p-3 rounded-card border border-danger-border bg-danger-bg">
                        <ReturnRateField
                            label="Coût mensuel soins" unit="$/mois" value={projection.ltcMonthlyCost ?? 5000}
                            onChange={(v) => updateProj('ltcMonthlyCost', v)} min={2000} max={12000} step={500}
                            colorClassName="text-danger-400" accentClassName="accent-danger-500"
                        />
                        <p className="text-tiny text-ink-400 mt-1">CHSLD public ~2000$, RPA semi-privé ~4500$, soins privés à domicile 8000-12000$.</p>
                    </div>
                )}
            </div>
        </CollapsibleSection>

        {/* §5 mobile — Rejeu krach historique (section À PART sur mobile, groupée sur desktop) */}
        <CollapsibleSection
            title="Rejeu krach historique"
            icon={<Icon name="dice" size={20} />}
            defaultOpen={false}
        >
            <div className="flex items-center gap-2 flex-wrap">
                <label className="text-meta text-ink-300" htmlFor="replay-select-mobile">Rejouer un krach:</label>
                <Select
                    id="replay-select-mobile"
                    value={projection.replayHistoricalYear ?? ''}
                    onChange={e => updateProj('replayHistoricalYear', e.target.value ? Number(e.target.value) : undefined)}
                >
                    {REPLAY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </Select>
                <span className="text-tiny text-ink-400">→ Force les rendements historiques.</span>
            </div>
        </CollapsibleSection>

        {/* §6 mobile — Paramètres avancés (identique au desktop) */}
        <CollapsibleSection
            title="Paramètres avancés"
            icon={<Icon name="settings" size={20} />}
            defaultOpen={false}
        >
            <AdvancedProjectionParams projection={projection} updateProj={updateProj} />
        </CollapsibleSection>
    </>
);
