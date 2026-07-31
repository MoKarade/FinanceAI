// components/PatrimoineExtended.tsx
// W5.3+W5.4+W5.6 — Panneaux compacts pour capturer les actifs/passifs étendus
// (assurances, immeubles locatifs, dettes détaillées). Importé dans Settings.

import React from 'react';
import { Card } from './ui/Card';
import { Icon } from './ui/Icon';
import type {
    InsurancePolicy, InsuranceKind,
    RentalProperty,
    PrivateBusiness,
    VehicleReplacement,
    MajorRenovation,
    CharitableGoal,
} from '../types';

const newId = () => Math.random().toString(36).slice(2, 10);

// ─────────────────────────────────────────────────────────────
// Insurance Panel
// ─────────────────────────────────────────────────────────────
export const InsurancePanel: React.FC<{
    policies: InsurancePolicy[];
    onChange: (next: InsurancePolicy[]) => void;
}> = ({ policies, onChange }) => {
    const add = () => onChange([...policies, { id: newId(), kind: 'life-term', monthlyPremium: 0 }]);
    const update = (i: number, patch: Partial<InsurancePolicy>) => {
        const next = [...policies];
        next[i] = { ...next[i], ...patch };
        onChange(next);
    };
    const remove = (i: number) => {
        const next = [...policies];
        next.splice(i, 1);
        onChange(next);
    };

    return (
        <Card icon={<Icon name="shield" size={18} />} title="Assurances">
            <div className="space-y-2">
                {policies.length === 0 && (
                    <p className="text-meta text-ink-400 italic">Aucune assurance enregistrée. Ajoute tes polices pour modéliser leur impact (primes mensuelles, capital décès, capital invalidité, etc.).</p>
                )}
                {policies.map((p, i) => (
                    <div key={p.id} className="grid grid-cols-12 gap-1 items-center p-2 bg-black/30 rounded border border-white/5">
                        <select
                            value={p.kind}
                            onChange={e => update(i, { kind: e.target.value as InsuranceKind })}
                            className="col-span-3 bg-dark border border-border rounded px-1 py-1 text-meta text-white"
                        >
                            <option value="life-term">Vie temp</option>
                            <option value="life-whole">Vie entière</option>
                            <option value="life-universal">Vie universelle</option>
                            <option value="disability-st">Invalidité courte</option>
                            <option value="disability-lt">Invalidité longue</option>
                            <option value="critical-illness">Maladies graves</option>
                            <option value="long-term-care">Soins LD</option>
                            <option value="travel">Voyage</option>
                            <option value="auto">Auto</option>
                            <option value="home">Habitation</option>
                            <option value="liability">Responsabilité</option>
                        </select>
                        <input
                            placeholder="Assureur" value={p.insurer ?? ''}
                            onChange={e => update(i, { insurer: e.target.value })}
                            className="col-span-3 bg-dark border border-border rounded px-1 py-1 text-meta text-white"
                        />
                        <input
                            type="number" placeholder="Capital $" value={p.faceAmount ?? ''}
                            onChange={e => update(i, { faceAmount: Number(e.target.value) || undefined })}
                            className="col-span-2 bg-dark border border-border rounded px-1 py-1 text-meta text-white"
                        />
                        <input
                            type="number" placeholder="Prime $/mois" value={p.monthlyPremium}
                            onChange={e => update(i, { monthlyPremium: Number(e.target.value) || 0 })}
                            className="col-span-2 bg-dark border border-border rounded px-1 py-1 text-meta text-white"
                        />
                        <input
                            type="date" placeholder="Expire" value={p.expiryDate ?? ''}
                            onChange={e => update(i, { expiryDate: e.target.value })}
                            className="col-span-1 bg-dark border border-border rounded px-0.5 py-1 text-tiny text-white"
                        />
                        <button onClick={() => remove(i)} className="col-span-1 text-danger-400 text-body hover:text-red-300" title="Supprimer">×</button>
                    </div>
                ))}
                <button onClick={add} className="text-meta bg-info-500/20 border border-info-500/40 rounded px-2 py-1 text-blue-300 hover:bg-info-500/30">
                    + Ajouter une assurance
                </button>
            </div>
        </Card>
    );
};

// ─────────────────────────────────────────────────────────────
// Rental Property Panel
// ─────────────────────────────────────────────────────────────
export const RentalPropertyPanel: React.FC<{
    properties: RentalProperty[];
    onChange: (next: RentalProperty[]) => void;
}> = ({ properties, onChange }) => {
    const add = () => onChange([...properties, { id: newId(), name: 'Nouveau locatif', purchasePrice: 0, currentValue: 0, mortgageBalance: 0, mortgageRate: 5, monthlyRent: 0, vacancyPct: 5, monthlyExpenses: 0 }]);
    const update = (i: number, patch: Partial<RentalProperty>) => { const next = [...properties]; next[i] = { ...next[i], ...patch }; onChange(next); };
    const remove = (i: number) => { const next = [...properties]; next.splice(i, 1); onChange(next); };

    return (
        <Card icon={<Icon name="building" size={18} />} title="Immeubles locatifs">
            <div className="space-y-2">
                {properties.length === 0 && (
                    <p className="text-meta text-ink-400 italic">Pour mesurer cap rate, NOI, vacancy. La résidence principale reste dans l'onglet Real Estate.</p>
                )}
                {properties.map((rp, i) => {
                    const annualRent = rp.monthlyRent * 12 * (1 - rp.vacancyPct / 100);
                    const annualExpenses = rp.monthlyExpenses * 12;
                    const noi = annualRent - annualExpenses;
                    const capRate = rp.currentValue > 0 ? (noi / rp.currentValue * 100).toFixed(2) : '0.00';
                    return (
                        <details key={rp.id} className="p-2 bg-black/30 rounded border border-white/5">
                            <summary className="text-meta font-bold text-white cursor-pointer py-1.5">
                                {rp.name} — NOI: {noi.toLocaleString('fr-CA')}$ · Cap: {capRate}%
                            </summary>
                            <div className="mt-2 grid grid-cols-3 gap-1">
                                <input aria-label="Nom de l'immeuble locatif" placeholder="Nom" value={rp.name} onChange={e => update(i, { name: e.target.value })} className="bg-dark border border-border rounded px-1 py-0.5 text-meta text-white" />
                                <input aria-label="Prix d'achat (dollars)" type="number" placeholder="Prix achat $" value={rp.purchasePrice || ''} onChange={e => update(i, { purchasePrice: Number(e.target.value) || 0 })} className="bg-dark border border-border rounded px-1 py-0.5 text-meta text-white" />
                                <input aria-label="Valeur actuelle (dollars)" type="number" placeholder="Valeur actuelle $" value={rp.currentValue || ''} onChange={e => update(i, { currentValue: Number(e.target.value) || 0 })} className="bg-dark border border-border rounded px-1 py-0.5 text-meta text-white" />
                                <input aria-label="Solde hypothécaire (dollars)" type="number" placeholder="Hypothèque $" value={rp.mortgageBalance || ''} onChange={e => update(i, { mortgageBalance: Number(e.target.value) || 0 })} className="bg-dark border border-border rounded px-1 py-0.5 text-meta text-white" />
                                <input aria-label="Taux hypothécaire (pourcentage)" type="number" placeholder="Taux %" value={rp.mortgageRate || ''} onChange={e => update(i, { mortgageRate: Number(e.target.value) || 0 })} className="bg-dark border border-border rounded px-1 py-0.5 text-meta text-white" />
                                <input aria-label="Loyer mensuel (dollars)" type="number" placeholder="Loyer $/mois" value={rp.monthlyRent || ''} onChange={e => update(i, { monthlyRent: Number(e.target.value) || 0 })} className="bg-dark border border-border rounded px-1 py-0.5 text-meta text-white" />
                                <input aria-label="Taux de vacance (pourcentage)" type="number" placeholder="Vacance %" value={rp.vacancyPct || ''} onChange={e => update(i, { vacancyPct: Number(e.target.value) || 0 })} className="bg-dark border border-border rounded px-1 py-0.5 text-meta text-white" />
                                <input aria-label="Charges mensuelles (dollars)" type="number" placeholder="Charges $/mois" value={rp.monthlyExpenses || ''} onChange={e => update(i, { monthlyExpenses: Number(e.target.value) || 0 })} className="bg-dark border border-border rounded px-1 py-0.5 text-meta text-white" />
                                <input aria-label="DPA cumulée (dollars)" type="number" placeholder="DPA cumulée $" value={rp.ccaTaken || ''} onChange={e => update(i, { ccaTaken: Number(e.target.value) || undefined })} className="bg-dark border border-border rounded px-1 py-0.5 text-meta text-white" />
                                <button onClick={() => remove(i)} className="col-span-3 text-danger-400 text-tiny hover:text-red-300">Supprimer cet immeuble</button>
                            </div>
                        </details>
                    );
                })}
                <button onClick={add} className="text-meta bg-success-500/20 border border-success-500/40 rounded px-2 py-1 text-emerald-300 hover:bg-success-500/30">
                    + Ajouter un immeuble locatif
                </button>
            </div>
        </Card>
    );
};

// ─────────────────────────────────────────────────────────────
// Private Business Panel
// ─────────────────────────────────────────────────────────────
export const BusinessPanel: React.FC<{
    businesses: PrivateBusiness[];
    onChange: (next: PrivateBusiness[]) => void;
}> = ({ businesses, onChange }) => {
    const add = () => onChange([...businesses, { id: newId(), name: 'Société', ownershipPct: 100, estimatedValue: 0 }]);
    const update = (i: number, patch: Partial<PrivateBusiness>) => { const next = [...businesses]; next[i] = { ...next[i], ...patch }; onChange(next); };
    const remove = (i: number) => { const next = [...businesses]; next.splice(i, 1); onChange(next); };

    return (
        <Card icon={<Icon name="building" size={18} />} title="Entreprises (CCPC)">
            <div className="space-y-2">
                {businesses.length === 0 && (
                    <p className="text-meta text-ink-400 italic">Pour les actionnaires de société par actions (CCPC). Modélise dividende reçu, BNR, accès DPE.</p>
                )}
                {businesses.map((b, i) => (
                    <div key={b.id} className="grid grid-cols-6 gap-1 items-center p-2 bg-black/30 rounded border border-white/5">
                        <input aria-label="Nom de la société" placeholder="Nom" value={b.name} onChange={e => update(i, { name: e.target.value })} className="col-span-2 bg-dark border border-border rounded px-1 py-1 text-meta text-white" />
                        <input aria-label="Pourcentage détenu" type="number" placeholder="% détenu" value={b.ownershipPct} onChange={e => update(i, { ownershipPct: Number(e.target.value) || 0 })} className="bg-dark border border-border rounded px-1 py-1 text-meta text-white" />
                        <input aria-label="Juste valeur marchande (dollars)" type="number" placeholder="JVM $" value={b.estimatedValue || ''} onChange={e => update(i, { estimatedValue: Number(e.target.value) || 0 })} className="bg-dark border border-border rounded px-1 py-1 text-meta text-white" />
                        <input aria-label="Dividende annuel (dollars)" type="number" placeholder="Div annuel $" value={b.annualDividend || ''} onChange={e => update(i, { annualDividend: Number(e.target.value) || undefined })} className="bg-dark border border-border rounded px-1 py-1 text-meta text-white" />
                        <button onClick={() => remove(i)} className="text-danger-400 hover:text-red-300">×</button>
                    </div>
                ))}
                <button onClick={add} className="text-meta bg-purple-500/20 border border-purple-500/40 rounded px-2 py-1 text-purple-300 hover:bg-purple-500/30">+ Ajouter une société</button>
            </div>
        </Card>
    );
};

// ─────────────────────────────────────────────────────────────
// Vehicle / Renovation / Charitable Panel (compact combo)
// ─────────────────────────────────────────────────────────────
export const CyclicalGoalsPanel: React.FC<{
    vehicles: VehicleReplacement[];
    renovations: MajorRenovation[];
    charity: CharitableGoal[];
    onVehicles: (v: VehicleReplacement[]) => void;
    onRenovations: (r: MajorRenovation[]) => void;
    onCharity: (c: CharitableGoal[]) => void;
}> = ({ vehicles, renovations, charity, onVehicles, onRenovations, onCharity }) => {
    return (
        <Card icon={<Icon name="goal" size={18} />} title="Objectifs cycliques">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Vehicles */}
                <div>
                    <h4 className="text-tiny font-bold uppercase tracking-widest text-ink-300 mb-2">Véhicules cycliques</h4>
                    {vehicles.map((v, i) => (
                        <div key={v.id} className="flex gap-1 mb-1">
                            <input aria-label="Fréquence de remplacement (années)" type="number" placeholder="Tous les N ans" value={v.cyclYears} onChange={e => { const next = [...vehicles]; next[i] = { ...v, cyclYears: Number(e.target.value) || 0 }; onVehicles(next); }} className="w-16 bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                            <input aria-label="Coût estimé du véhicule (dollars)" type="number" placeholder="Coût $" value={v.costEstimate} onChange={e => { const next = [...vehicles]; next[i] = { ...v, costEstimate: Number(e.target.value) || 0 }; onVehicles(next); }} className="flex-1 bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                            <button onClick={() => { const next = [...vehicles]; next.splice(i, 1); onVehicles(next); }} className="text-danger-400 text-meta">×</button>
                        </div>
                    ))}
                    <button onClick={() => onVehicles([...vehicles, { id: newId(), cyclYears: 8, costEstimate: 30000 }])} className="text-tiny text-info-400 hover:text-blue-300">+ Ajouter</button>
                </div>
                {/* Renovations */}
                <div>
                    <h4 className="text-tiny font-bold uppercase tracking-widest text-ink-300 mb-2">Rénovations majeures</h4>
                    {renovations.map((r, i) => (
                        <div key={r.id} className="flex gap-1 mb-1">
                            <input aria-label="Date de la rénovation" type="date" value={r.date} onChange={e => { const next = [...renovations]; next[i] = { ...r, date: e.target.value }; onRenovations(next); }} className="bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                            <input aria-label="Coût de la rénovation (dollars)" type="number" placeholder="Coût $" value={r.cost} onChange={e => { const next = [...renovations]; next[i] = { ...r, cost: Number(e.target.value) || 0 }; onRenovations(next); }} className="flex-1 bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                            <button onClick={() => { const next = [...renovations]; next.splice(i, 1); onRenovations(next); }} className="text-danger-400 text-meta">×</button>
                        </div>
                    ))}
                    <button onClick={() => onRenovations([...renovations, { id: newId(), date: '', cost: 20000 }])} className="text-tiny text-info-400 hover:text-blue-300">+ Ajouter</button>
                </div>
                {/* Charity */}
                <div>
                    <h4 className="text-tiny font-bold uppercase tracking-widest text-ink-300 mb-2">Dons charitables</h4>
                    {charity.map((c, i) => (
                        <div key={c.id} className="flex gap-1 mb-1">
                            <input aria-label="Don annuel (dollars)" type="number" placeholder="$/an" value={c.annualAmount} onChange={e => { const next = [...charity]; next[i] = { ...c, annualAmount: Number(e.target.value) || 0 }; onCharity(next); }} className="flex-1 bg-dark border border-border rounded px-1 py-0.5 text-tiny text-white" />
                            <label
                                className="text-tiny text-ink-300 flex items-center gap-1"
                                title="Don de titres cotés en nature : l'avantage fiscal (inclusion du gain en capital à 0 %) n'est pas encore modélisé — le crédit de don s'applique quand même. Cf FISCAL_REFERENCE §10."
                            >
                                <input type="checkbox" checked={c.donateAppreciatedSecurities ?? false} onChange={e => { const next = [...charity]; next[i] = { ...c, donateAppreciatedSecurities: e.target.checked }; onCharity(next); }} />
                                titres*
                            </label>
                            <button onClick={() => { const next = [...charity]; next.splice(i, 1); onCharity(next); }} className="text-danger-400 text-meta">×</button>
                        </div>
                    ))}
                    <button onClick={() => onCharity([...charity, { id: newId(), annualAmount: 1000 }])} className="text-tiny text-info-400 hover:text-blue-300">+ Ajouter</button>
                </div>
            </div>
        </Card>
    );
};
