import React from 'react';
import { Icon } from '../ui/Icon';
import { Card } from '../ui/Card';
import { RealEstateGoal, Municipality } from '../../types';
import { PrivateAmount } from '../ui/PrivateAmount';
import { useFinanceStore } from '../../store/useFinanceStore';
import { maskedSliderAria } from '../../utils/privacyAria';

const fmt = (val: number) =>
    new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(val);

interface PropertyConfiguratorProps {
    activeGoal: RealEstateGoal;
    updateActiveGoal: (updates: Partial<RealEstateGoal>) => void;
    mode: 'AUTO' | 'MANUAL';
    setMode: (mode: 'AUTO' | 'MANUAL') => void;
    taxesYearly: number;
    setTaxesYearly: (v: number) => void;
    heatingMonthly: number;
    setHeatingMonthly: (v: number) => void;
    condoFees: number;
    setCondoFees: (v: number) => void;
}

export const PropertyConfigurator: React.FC<PropertyConfiguratorProps> = ({
    activeGoal, updateActiveGoal,
    mode, setMode,
    taxesYearly, setTaxesYearly,
    heatingMonthly, setHeatingMonthly,
    condoFees, setCondoFees,
}) => {
    // D6-SR-2 — masque la valeur des sliders monétaires au lecteur d'écran en mode privé (parité blur).
    const isPrivacyMode = useFinanceStore((s) => s.isPrivacyMode);
    const price = activeGoal.price || 450000;
    const downPayment = activeGoal.downPayment || (price * 0.2);
    const downPaymentPercent = Math.round((downPayment / price) * 100);
    const rate = activeGoal.mortgageRate || 4.5;
    const amortization = activeGoal.amortization || 25;
    const targetDate = activeGoal.purchaseDate || new Date().toISOString().split('T')[0];
    const propertyGrowthRate = activeGoal.propertyGrowthRate || 3.0;
    const rentalIncomeMonthly = activeGoal.rentalIncomeMonthly || 0;
    const yearlyRenovations = activeGoal.yearlyRenovations || 0;
    const renewalRate = activeGoal.renewalRateProjection || 5.0;
    const maxValue = activeGoal.maxValue || 0;

    return (
        <div className="lg:col-span-1 space-y-5">
            <Card title="Type de propriété">
                <div className="space-y-3">
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-white/10 cursor-pointer hover:bg-white/5 transition-colors">
                        <input
                            type="checkbox"
                            checked={activeGoal.isPrimaryResidence}
                            onChange={e => updateActiveGoal({ isPrimaryResidence: e.target.checked })}
                            className="w-4 h-4 accent-primary"
                        />
                        <div className="flex-1">
                            <div className="text-body font-bold text-white">Résidence Principale</div>
                            <div className="text-tiny text-ink-400">Si coché, le loyer actuel sera supprimé.</div>
                        </div>
                    </label>

                    {!activeGoal.isPrimaryResidence && (
                        <label className="flex items-center gap-3 p-3 rounded-lg border border-white/10 cursor-pointer hover:bg-white/5 transition-colors">
                            <input
                                type="checkbox"
                                checked={activeGoal.isRented || false}
                                onChange={e => {
                                    if (e.target.checked) {
                                        updateActiveGoal({ isRented: true, rentalIncomeMonthly: Math.round(price / 23.3 / 12) });
                                    } else {
                                        updateActiveGoal({ isRented: false, rentalIncomeMonthly: 0 });
                                    }
                                }}
                                className="w-4 h-4 accent-green-500"
                            />
                            <div className="flex-1">
                                <div className="text-body font-bold text-white">Propriété Locative</div>
                                <div className="text-tiny text-ink-400">Génère des revenus de location.</div>
                            </div>
                        </label>
                    )}

                    {activeGoal.isRented && !activeGoal.isPrimaryResidence && (
                        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg space-y-2 mt-2">
                            <label className="flex justify-between items-end text-meta text-green-400 font-bold">
                                <span>Revenu Locatif ($/mois)</span>
                                <button
                                    onClick={() => updateActiveGoal({ rentalIncomeMonthly: Math.round(price / 23.3 / 12) })}
                                    className="text-tiny bg-green-500/20 px-1.5 py-0.5 rounded text-green-300 hover:bg-green-500/40"
                                    title="Basé sur le ratio moyen Prix/Loyer au Québec (23.3)"
                                >
                                    Auto (Moy. QC)
                                </button>
                            </label>
                            <input
                                type="number"
                                step="50"
                                value={rentalIncomeMonthly}
                                onChange={e => updateActiveGoal({ rentalIncomeMonthly: Number(e.target.value) })}
                                className="w-full bg-black/50 border border-green-500/30 rounded px-2 py-1.5 text-green-400 text-body font-bold focus:outline-none focus:border-green-400"
                                placeholder="Ex: 1500$"
                            />
                        </div>
                    )}
                </div>
            </Card>

            <Card icon={<Icon name="cash" size={18} />} title="Prix et Financement">
                <div className="space-y-4">
                    <div>
                        <label className="flex justify-between text-meta text-ink-300 mb-1">
                            <span>Prix d'achat</span>
                            <PrivateAmount className="text-white font-bold">{fmt(price)}</PrivateAmount>
                        </label>
                        <input type="range" aria-label="Prix d'achat" min="150000" max="2500000" step="10000" value={price} {...maskedSliderAria(isPrivacyMode)} onChange={e => updateActiveGoal({ price: Number(e.target.value) })}
                            className="w-full h-1.5 bg-dark rounded-lg appearance-none cursor-pointer accent-primary" />
                    </div>
                    <div>
                        <label className="flex justify-between text-meta text-ink-300 mb-1">
                            <span>Mise de fonds</span>
                            <PrivateAmount className="text-blue-300 font-bold">{fmt(downPayment)} ({downPaymentPercent}%)</PrivateAmount>
                        </label>
                        <input type="range" aria-label="Mise de fonds" min={price * 0.05} max={price} step="5000" value={downPayment} {...maskedSliderAria(isPrivacyMode)} onChange={e => updateActiveGoal({ downPayment: Number(e.target.value) })}
                            className="w-full h-1.5 bg-dark rounded-lg appearance-none cursor-pointer accent-info-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="amortization-select" className="block text-meta text-ink-300 mb-1">Amortissement</label>
                            <select id="amortization-select" value={amortization} onChange={e => updateActiveGoal({ amortization: Number(e.target.value) })} className="w-full bg-white/5 border border-border rounded px-2 py-1.5 text-white text-body">
                                <option value="15">15 ans</option>
                                <option value="20">20 ans</option>
                                <option value="25">25 ans</option>
                                <option value="30">30 ans</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-meta text-ink-300 mb-1">Date cible</label>
                            <input type="date" value={targetDate} onChange={e => updateActiveGoal({ purchaseDate: e.target.value })} className="w-full bg-white/5 border border-border rounded px-2 py-1.5 text-white text-body" />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="municipality-select" className="block text-meta text-ink-300 mb-1">
                            Municipalité <span className="text-tiny text-ink-400">(taxe de bienvenue)</span>
                        </label>
                        <select
                            id="municipality-select"
                            value={activeGoal.municipality ?? ''}
                            onChange={e => updateActiveGoal({ municipality: e.target.value ? (e.target.value as Municipality) : undefined })}
                            aria-describedby={!activeGoal.municipality ? 'municipality-hint' : undefined}
                            className="w-full bg-white/5 border border-border rounded px-2 py-1.5 text-white text-body"
                        >
                            <option value="">À préciser…</option>
                            <option value="montreal">Montréal (surtaxe, jusqu'à 4 %)</option>
                            <option value="reste_qc">Reste du Québec (max 2 %)</option>
                        </select>
                        {!activeGoal.municipality && (
                            <p id="municipality-hint" className="text-tiny text-amber-400/80 mt-1">
                                Non précisé : barème Montréal (le plus élevé) appliqué par prudence.
                            </p>
                        )}
                    </div>
                </div>
            </Card>

            <Card icon={<Icon name="rate" size={18} />} title="Taux et Rendement">
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-meta text-orange-400 mb-1 font-bold">Taux Actuel (%)</label>
                            <input type="number" step="0.1" value={rate} onChange={e => updateActiveGoal({ mortgageRate: Number(e.target.value) })} className="w-full bg-orange-500/10 border border-orange-500/30 rounded px-2 py-1.5 text-orange-400 text-body font-bold" />
                        </div>
                        <div>
                            <label className="block text-meta text-danger-400 mb-1 font-bold">Taux Renouvellement</label>
                            <input type="number" step="0.1" value={renewalRate} onChange={e => updateActiveGoal({ renewalRateProjection: Number(e.target.value) })} className="w-full bg-danger-500/10 border border-danger-500/30 rounded px-2 py-1.5 text-danger-400 text-body font-bold" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-meta text-info-400 mb-1 font-bold">Appréciation Immo (%/an)</label>
                            <input type="number" step="0.5" value={propertyGrowthRate} onChange={e => updateActiveGoal({ propertyGrowthRate: Number(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-body" />
                        </div>
                        <div>
                            <label className="block text-meta text-success-400 mb-1 font-bold">Rénos annuelles ($)</label>
                            <input type="number" step="500" value={yearlyRenovations} onChange={e => updateActiveGoal({ yearlyRenovations: Number(e.target.value) })} className="w-full bg-success-500/10 border border-success-500/30 rounded px-2 py-1.5 text-success-400 text-body font-bold" />
                        </div>
                    </div>
                    <div>
                        <label className="flex justify-between text-meta text-purple-400 mb-1 font-bold">
                            <span>Plafond Valeur Max</span>
                            <span>{maxValue > 0 ? fmt(maxValue) : 'Aucun plafond'}</span>
                        </label>
                        <input type="range" aria-label="Plafond Valeur Max" min="0" max={price * 4} step={price * 0.1} value={maxValue} onChange={e => updateActiveGoal({ maxValue: Number(e.target.value) })} className="w-full h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                        <p className="text-tiny text-ink-400 mt-1">Limite l'appréciation projetée de la propriété à un maximum réaliste.</p>
                    </div>
                </div>
            </Card>

            <Card icon={<Icon name="money" size={18} />} title="Frais Récurrents">
                <div className="space-y-3">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-meta text-ink-300">Mode de calcul</span>
                        <button
                            onClick={() => setMode(mode === 'AUTO' ? 'MANUAL' : 'AUTO')}
                            className={`text-meta px-3 py-1 rounded-full font-bold border transition-all ${
                                mode === 'AUTO'
                                ? 'bg-primary/20 border-primary text-primary'
                                : 'bg-white/5 border-white/10 text-ink-300 hover:text-white'
                            }`}
                        >
                            {mode === 'AUTO' ? 'AUTO' : 'MANUEL'}
                        </button>
                    </div>
                    <div>
                        <label className="text-meta text-ink-300">Taxes foncières ($/an)</label>
                        <input
                            type="number"
                            step="100"
                            value={taxesYearly}
                            onChange={e => { const v = Number(e.target.value); setTaxesYearly(v); updateActiveGoal({ taxesYearly: v }); }}
                            disabled={mode === 'AUTO'}
                            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-body mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                    </div>
                    <div>
                        <label className="text-meta text-ink-300">Chauffage ($/mois)</label>
                        <input
                            type="number"
                            step="10"
                            value={heatingMonthly}
                            onChange={e => { const v = Number(e.target.value); setHeatingMonthly(v); updateActiveGoal({ heatingMonthly: v }); }}
                            disabled={mode === 'AUTO'}
                            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-body mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                    </div>
                    <div>
                        <label className="text-meta text-ink-300">Frais de condo ($/mois)</label>
                        <input
                            type="number"
                            step="50"
                            value={condoFees}
                            onChange={e => { const v = Number(e.target.value); setCondoFees(v); updateActiveGoal({ condoFees: v }); }}
                            disabled={mode === 'AUTO'}
                            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-body mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                    </div>
                </div>
            </Card>
        </div>
    );
};
