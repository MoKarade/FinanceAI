import React, { useMemo, useState } from 'react';
import { PageHeader } from './ui/PageHeader';
import { Icon } from './ui/Icon';
import { EmptyState } from './ui/EmptyState';
import { ConfirmModal } from './ui/ConfirmModal';
import { PrivateAmount } from './ui/PrivateAmount';
import { VieCurveLink } from './vie/VieCurveLink';
import { FormulaireProjet } from './vie/FormulaireProjet';
import { FriseProjets, couleurProjet } from './vie/FriseProjets';
import { ImpactProjet } from './vie/ImpactProjet';
import { dateLongue } from './vie/dateLongue';
import { listerProjets, filtrer, joursRestants, redater, type Filtre } from './vie/projetsDeVie';
import { useViewportBelowLg } from '../hooks/useViewportBelowLg';
import { useTodayIsoLocal } from '../hooks/useSimulationParams';
import { formatCAD } from '../utils/format';
import { TAB_LABELS } from '../constants';
import { Tab, type TravelGoal, type LifeEvent } from '../types';

/**
 * [S5-REFONTE-PROJETS] « Projets de vie » aux maquettes (E-projets / M-projets) : voyages et
 * événements réunis sur UNE frise (glisser = changer d'année), une liste filtrable et la carte
 * d'impact du projet choisi. Remplace Travel.tsx + LifeEvents.tsx (Phase F.12) : les stores restent
 * séparés (`travelGoals`, `lifeEvents`), la page les présente ensemble.
 */

interface LifeProjectsProps {
    travelGoals: TravelGoal[];
    setTravelGoals: (goals: TravelGoal[]) => void;
    lifeEvents: LifeEvent[];
    setLifeEvents: (events: LifeEvent[]) => void;
    netWorth: number;
    returnRate: number;
}

const FILTRES: ReadonlyArray<{ id: Filtre; libelle: string }> = [
    { id: 'tout', libelle: 'Tout' },
    { id: 'voyages', libelle: 'Voyages' },
    { id: 'evenements', libelle: 'Événements' },
];

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

export const LifeProjects: React.FC<LifeProjectsProps> = ({
    travelGoals, setTravelGoals, lifeEvents, setLifeEvents, netWorth, returnRate,
}) => {
    const aujourdhui = useTodayIsoLocal();
    const compacte = useViewportBelowLg();
    const [filtre, setFiltre] = useState<Filtre>('tout');
    const [selection, setSelection] = useState<string | null>(null);
    const [ajout, setAjout] = useState(false);
    const [aSupprimer, setASupprimer] = useState<string | null>(null);

    const tous = useMemo(() => listerProjets(travelGoals, lifeEvents), [travelGoals, lifeEvents]);
    const visibles = useMemo(() => filtrer(tous, filtre), [tous, filtre]);
    // Projet choisi : celui cliqué, sinon le prochain à venir, sinon le premier.
    const choisi = tous.find((p) => p.cle === selection)
        ?? tous.find((p) => p.date.slice(0, 10) >= aujourdhui) ?? tous[0] ?? null;

    const nbVoyages = travelGoals.length;
    const nbEvenements = lifeEvents.length;

    const appliquerDate = (cle: string, date: string) => {
        const r = redater(cle, date, travelGoals, lifeEvents);
        if (r.voyages) setTravelGoals(r.voyages);
        if (r.evenements) setLifeEvents(r.evenements);
    };
    const supprimer = () => {
        if (!aSupprimer) return;
        const id = aSupprimer.split('_').slice(1).join('_');
        if (aSupprimer.startsWith('travel_')) setTravelGoals(travelGoals.filter((t) => t.id !== id));
        else setLifeEvents(lifeEvents.filter((e) => e.id !== id));
        if (selection === aSupprimer) setSelection(null);
        setASupprimer(null);
    };

    const filtres = (classe: string) => (
        <div role="group" aria-label="Filtrer les projets" className={classe}>
            {FILTRES.map((f) => (
                <button
                    key={f.id}
                    type="button"
                    onClick={() => setFiltre(f.id)}
                    aria-pressed={filtre === f.id}
                    className={`min-h-11 lg:min-h-8 px-3 rounded-lg text-[13px] transition-colors focus-ring ${compacte ? 'flex-1' : ''} ${
                        filtre === f.id ? (compacte ? 'bg-ink-50 text-dark font-semibold' : 'bg-surfaceHighlight text-ink-50 font-semibold') : 'text-ink-300 hover:bg-white/5'
                    }`}
                >
                    {f.libelle}
                </button>
            ))}
        </div>
    );

    return (
        <div className="space-y-5 stagger-in pb-10">
            <ConfirmModal
                isOpen={!!aSupprimer}
                onConfirm={supprimer}
                onCancel={() => setASupprimer(null)}
                title="Supprimer le projet"
                message="Supprimer définitivement ce projet ?"
                confirmLabel="Supprimer"
            />
            <PageHeader
                title={TAB_LABELS[Tab.LIFE_PROJECTS]}
                badge={<span className="text-meta lg:text-body text-ink-400">{pluriel(tous.length, 'projet', 'projets')} · {pluriel(nbVoyages, 'voyage', 'voyages')} · {pluriel(nbEvenements, 'événement', 'événements')}</span>}
                actions={
                    <span className="flex items-center gap-3">
                        <span className="hidden lg:inline-flex"><VieCurveLink /></span>
                        <button
                            type="button"
                            onClick={() => setAjout((v) => !v)}
                            aria-expanded={ajout}
                            aria-label={ajout ? 'Fermer' : 'Nouveau projet'}
                            className="h-10 px-3.5 lg:px-4 rounded-lg border border-white/40 lg:border-transparent text-ink-100 lg:bg-primary lg:text-dark text-body lg:font-bold focus-ring"
                        >
                            {ajout ? 'Fermer' : <><span className="lg:hidden">Nouveau</span><span className="hidden lg:inline">Nouveau projet</span></>}
                        </button>
                    </span>
                }
            />

            {ajout && (
                <FormulaireProjet
                    voyages={travelGoals} setVoyages={setTravelGoals}
                    evenements={lifeEvents} setEvenements={setLifeEvents}
                    onFermer={() => setAjout(false)}
                />
            )}

            {tous.length === 0 ? (
                !ajout && (
                    <EmptyState
                        icon={<Icon name="life-projects" size={30} />}
                        title="Aucun projet"
                        description="Planifie un voyage ou un événement (rénovation, mariage, sabbatique…) pour voir son effet sur ta courbe Future."
                        cta={<button type="button" onClick={() => setAjout(true)} className="h-10 px-4 rounded-lg bg-primary text-dark text-body font-bold focus-ring">Nouveau projet</button>}
                    />
                )
            ) : (
                <>
                    {compacte && filtres('flex gap-1 p-1 rounded-xl bg-surface border border-white/6')}
                    <FriseProjets
                        items={compacte ? visibles : tous}
                        selection={choisi?.cle ?? null}
                        onSelection={setSelection}
                        onRedater={appliquerDate}
                        aujourdhui={aujourdhui}
                        compacte={compacte}
                    />
                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_440px] gap-5 items-start">
                        {!compacte && (
                            <section aria-label="Projets" className="rounded-2xl bg-surface border border-white/6 overflow-hidden">
                                {filtres('flex gap-1 px-4 py-3')}
                                <ul>
                                    {visibles.map((p) => {
                                        const couleur = couleurProjet(p);
                                        const j = joursRestants(p.date, aujourdhui);
                                        return (
                                            <li key={p.cle} className="border-t border-white/5">
                                                <button
                                                    type="button"
                                                    aria-pressed={choisi?.cle === p.cle}
                                                    onClick={() => setSelection(p.cle)}
                                                    className={`w-full min-h-[72px] px-5 grid grid-cols-[44px_minmax(0,1fr)_90px_120px] gap-3.5 items-center text-left transition-colors focus-ring ${choisi?.cle === p.cle ? 'bg-white/4' : 'hover:bg-white/3'}`}
                                                >
                                                    <span className="w-10 h-10 rounded-xl bg-surfaceHighlight flex items-center justify-center" style={{ color: couleur }} aria-hidden="true"><Icon name={p.icone} size={18} /></span>
                                                    <span className="flex flex-col gap-0.5 min-w-0">
                                                        <span className="font-semibold text-ink-50 truncate">{p.nom}</span>
                                                        <span className="font-mono text-meta text-ink-400">{dateLongue(p.date)}</span>
                                                    </span>
                                                    <span className="font-mono text-meta text-ink-300">{p.genre === 'voyage' ? (j >= 0 ? `dans ${j} j` : 'passé') : 'événement'}</span>
                                                    <PrivateAmount className="text-right font-mono font-bold text-ink-50">{formatCAD(p.cout)}</PrivateAmount>
                                                </button>
                                            </li>
                                        );
                                    })}
                                    {visibles.length === 0 && (
                                        <li className="border-t border-white/5 px-5 py-6 text-meta text-ink-400">Aucun projet dans cette catégorie.</li>
                                    )}
                                </ul>
                            </section>
                        )}
                        {choisi && (
                            <ImpactProjet
                                projet={choisi}
                                patrimoine={netWorth}
                                rendement={returnRate}
                                onRedater={appliquerDate}
                                onSupprimer={setASupprimer}
                            />
                        )}
                    </div>
                </>
            )}

            {/* Mobile : le lien vers la courbe ferme la page, en pleine largeur (maquette M-projets). */}
            {compacte && <div className="[&>button]:w-full"><VieCurveLink /></div>}
        </div>
    );
};
