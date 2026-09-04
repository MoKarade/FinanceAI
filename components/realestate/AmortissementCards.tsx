import React from 'react';
import { formatCAD } from '../../utils/format';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { PrivateAmount } from '../ui/PrivateAmount';
import type { ResultatAmortissement } from './calculsImmoLocaux';

/**
 * [GODFILE-REALESTATE-CMP] Cartes « Amortissement et Équité » (frais d'acquisition) et
 * « Amortissement » (table annuelle), extraites telles quelles de RealEstateWorkspace.tsx
 * (lot 153). Purement présentationnel : toutes les données arrivent en props, la table locale
 * vient de `construireAmortissement` (calculsImmoLocaux).
 */
export interface AmortissementCardsProps {
    amortizationData: ResultatAmortissement;
    welcomeTax: number;
    notaryFees: number;
    inspectionFees: number;
    initialRenovations: number;
    price: number;
    downPayment: number;
    yearlyRenovations: number;
    amortization: number;
}

export const AmortissementCards: React.FC<AmortissementCardsProps> = ({
    amortizationData, welcomeTax, notaryFees, inspectionFees, initialRenovations,
    price, downPayment, yearlyRenovations, amortization,
}) => {
    const formatCurrency = (val: number) => formatCAD(val);
    return (
        <>
            <Card title="Amortissement et Équité">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-2">
                    <div><div className="text-tiny text-ink-400 uppercase tracking-wider">Welcome Tax</div><PrivateAmount as="div" className="text-body font-bold text-white">{formatCurrency(welcomeTax)}</PrivateAmount></div>
                    <div><div className="text-tiny text-ink-400 uppercase tracking-wider">Notaire &amp; Insp.</div><PrivateAmount as="div" className="text-body font-bold text-white">{formatCurrency(notaryFees + inspectionFees)}</PrivateAmount></div>
                    <div><div className="text-tiny text-ink-400 uppercase tracking-wider">Rénos Initiales</div><PrivateAmount as="div" className="text-body font-bold text-white">{formatCurrency(initialRenovations)}</PrivateAmount></div>
                    <div><div className="text-tiny text-ink-400 uppercase tracking-wider">Maison Totale</div><PrivateAmount as="div" className="text-body font-bold text-white">{formatCurrency(price + initialRenovations)}</PrivateAmount></div>
                </div>
            </Card>

            <Card icon={<Icon name="clipboard" size={18} />} title="Amortissement">
                <div className="overflow-x-auto">
                    <div className="mb-3 flex flex-wrap gap-4 text-meta">
                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-danger-500 inline-block" />Intérêts totaux payés : <PrivateAmount className="font-bold text-danger-400">{formatCurrency(amortizationData.totalInterest)}</PrivateAmount></div>
                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-success-500 inline-block" />Gain Équité projeté : <PrivateAmount className="font-bold text-success-400">{formatCurrency((amortizationData.data[amortizationData.data.length - 1]?.Équité || 0) - downPayment)}</PrivateAmount></div>
                        {yearlyRenovations > 0 && <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" />Rénos totales : <PrivateAmount className="font-bold text-yellow-400">{formatCurrency(yearlyRenovations * amortization)}</PrivateAmount></div>}
                    </div>
                    <table className="w-full text-meta text-left min-w-[700px]">
                        <thead>
                            <tr className="border-b border-white/10 text-ink-400 uppercase tracking-wider">
                                <th className="py-2 pr-4">Année</th>
                                <th className="py-2 pr-4">Taux</th>
                                <th className="py-2 pr-4 text-right">Intérêts/an</th>
                                <th className="py-2 pr-4 text-right">Principal/an</th>
                                <th className="py-2 pr-4 text-right">Solde Restant</th>
                                <th className="py-2 pr-4 text-right">Valeur Propriété</th>
                                <th className="py-2 text-right">Équité</th>
                            </tr>
                        </thead>
                        <tbody>
                            {amortizationData.data.map((row, idx) => {
                                const isRenewal = idx > 0 && idx % 5 === 0;
                                const equityPct = row.ValeuréPropriété > 0 ? Math.round((row.Équité / row.ValeuréPropriété) * 100) : 0;
                                return (
                                    <tr key={row.year} className={`border-b border-white/5 ${isRenewal ? 'bg-orange-900/10' : idx % 2 === 0 ? 'bg-white/[0.02]' : ''} hover:bg-white/5 transition-colors`}>
                                        <td className="py-2 pr-4 font-bold">
                                            {row.calendarYear}
                                            {isRenewal && <span className="ml-1.5 text-tiny text-orange-400 border border-orange-500/30 rounded px-1">Renouvellement</span>}
                                        </td>
                                        <td className="py-2 pr-4 text-orange-300">{row.TauxEnVigueur}</td>
                                        <td className="py-2 pr-4 text-right text-danger-400"><PrivateAmount>{formatCurrency(row.PartInteretAnnuelle)}</PrivateAmount></td>
                                        <td className="py-2 pr-4 text-right text-info-400"><PrivateAmount>{formatCurrency(row.PartPrincipalAnnuelle)}</PrivateAmount></td>
                                        <td className="py-2 pr-4 text-right text-white"><PrivateAmount>{formatCurrency(row.Solde)}</PrivateAmount></td>
                                        <td className="py-2 pr-4 text-right text-purple-300"><PrivateAmount>{formatCurrency(row.ValeuréPropriété)}</PrivateAmount></td>
                                        <td className="py-2 text-right">
                                            <PrivateAmount className="text-success-400 font-bold">{formatCurrency(row.Équité)}</PrivateAmount>
                                            <span className="text-ink-400 ml-1">({equityPct}%)</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
        </>
    );
};
