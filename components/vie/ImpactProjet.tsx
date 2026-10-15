// components/vie/ImpactProjet.tsx
//
// [S5-REFONTE-PROJETS] Carte « Impact · <projet> » des maquettes : coût immédiat (part du patrimoine),
// coût d'opportunité sur 20 ans, manque à gagner total, répartition estimée en barre empilée.
// Replié dessous (absent des maquettes, gardé) : la date (sans glisser), les conseils, la suppression.
import React from 'react';
import { PrivateAmount } from '../ui/PrivateAmount';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { formatCAD, formatNumber, formatPercent, formatSigned } from '../../utils/format';
import { analyserImpact, conseilsProjet, repartitionEstimee, ANNEES_IMPACT, type ProjetDeVie } from './projetsDeVie';
import { dateLongue } from './dateLongue';

interface Props {
    projet: ProjetDeVie;
    patrimoine: number;
    rendement: number;
    onRedater: (cle: string, date: string) => void;
    onSupprimer: (cle: string) => void;
}

export const ImpactProjet: React.FC<Props> = ({ projet, patrimoine, rendement, onRedater, onSupprimer }) => {
    const impact = analyserImpact(projet, patrimoine, rendement);
    const postes = repartitionEstimee(projet.type, projet.cout);
    const conseils = conseilsProjet(projet.type);
    const tuile = 'px-3.5 py-3 rounded-xl bg-dark lg:bg-surface border border-white/6 lg:border-white/6 flex flex-col gap-0.5';

    return (
        <section aria-labelledby="impact-titre" className="rounded-2xl bg-surface border border-white/6 p-4 sm:px-5 sm:py-[18px] flex flex-col gap-3.5">
            <div className="flex justify-between items-baseline gap-3">
                <h2 id="impact-titre" className="text-[17px] lg:text-[16px] font-semibold text-ink-50 truncate">Impact · {projet.nom}</h2>
                <span className="font-mono text-meta text-ink-400 shrink-0">{dateLongue(projet.date)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
                <div className={tuile}>
                    <span className="text-meta text-ink-400">Coût immédiat</span>
                    <PrivateAmount className="font-mono text-[18px] font-bold text-ink-50">{formatCAD(impact.coutImmediat)}</PrivateAmount>
                    <span className="text-tiny text-ink-400">{formatPercent(impact.partPatrimoine, 1)} du patrimoine</span>
                </div>
                <div className={tuile}>
                    <span className="text-meta text-ink-400">Placé à {formatNumber(rendement, { decimals: Number.isInteger(rendement) ? 0 : 1 })} % sur {ANNEES_IMPACT} ans</span>
                    <PrivateAmount className="font-mono text-[18px] font-bold text-danger-400 lg:text-warning-400">{formatSigned(-Math.round(impact.coutOpportunite), { withCurrency: true })}</PrivateAmount>
                    <span className="text-tiny text-ink-400">coût d'opportunité</span>
                </div>
            </div>
            <div className="px-3.5 py-3 rounded-xl bg-danger-500/8 border border-danger-500/25 flex justify-between items-center gap-3">
                <span className="text-body text-ink-200">Manque à gagner total</span>
                <PrivateAmount className="font-mono text-[18px] font-bold text-danger-400">{formatSigned(-Math.round(impact.manqueAGagner), { withCurrency: true })}</PrivateAmount>
            </div>
            {postes.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-meta lg:text-[11px] font-semibold lg:tracking-[0.08em] lg:uppercase text-ink-300 lg:text-ink-400">Répartition estimée</h3>
                    <div className="flex h-2.5 rounded-full overflow-hidden" aria-hidden="true">
                        {postes.map((p) => <div key={p.nom} style={{ width: `${p.part * 100}%`, background: p.couleur }} />)}
                    </div>
                    <ul className="flex flex-col lg:flex-row lg:flex-wrap lg:justify-between gap-x-4 gap-y-1.5 text-[13px] text-ink-200">
                        {postes.map((p) => (
                            <li key={p.nom} className="flex items-center justify-between lg:justify-start gap-2">
                                <span className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-[3px] lg:hidden" style={{ background: p.couleur }} aria-hidden="true" />
                                    {p.nom}
                                </span>
                                <PrivateAmount className="font-mono text-ink-400">{formatCAD(p.montant)}</PrivateAmount>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <CollapsibleSection title="Détails du projet" subtitle="Date, conseils, suppression" variant="quiet" headingLevel={3}>
                <div className="flex flex-col gap-4">
                    {/* Date exacte : l'alternative au glisser de la frise (un seul pointeur, clavier). */}
                    <div>
                        <label htmlFor="projet-date" className="text-meta text-ink-300 block mb-1">Date</label>
                        <input id="projet-date" type="date" value={projet.date.slice(0, 10)} onChange={(e) => e.target.value && onRedater(projet.cle, e.target.value)} className="w-full h-11 px-3 text-ink-50" />
                    </div>
                    {conseils.length > 0 && (
                        <ul className="flex flex-col gap-2">
                            {conseils.map((c) => <li key={c} className="text-meta text-ink-200 bg-white/4 p-3 rounded-lg border border-white/6 leading-relaxed">{c}</li>)}
                        </ul>
                    )}
                    <div className="flex justify-end">
                        <button type="button" onClick={() => onSupprimer(projet.cle)} className="min-h-11 px-3 text-meta text-danger-400 underline underline-offset-2 focus-ring rounded-sm">
                            Supprimer « {projet.nom} »
                        </button>
                    </div>
                </div>
            </CollapsibleSection>
        </section>
    );
};
