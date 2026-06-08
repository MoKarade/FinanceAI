import React, { useState } from 'react';
import { PageHeader } from './ui/PageHeader';
import { Icon } from './ui/Icon';
import { Pill } from './ui/Pill';
import { Travel } from './Travel';
import { LifeEvents } from './LifeEvents';
import type { TravelGoal, LifeEvent } from '../types';

/**
 * Phase F.12 — onglet unifié "Projets de vie" qui fusionne Voyages et
 * Événements de vie en un seul espace cohérent (doc directives §8).
 *
 * Pour minimiser le risque sur cette étape :
 *   - Pas de migration des stores : `travelGoals` et `lifeEvents` restent
 *     séparés dans le store global
 *   - L'UI offre 2 sous-onglets pour basculer entre les deux flux
 *   - Les composants Travel et LifeEvents existants sont réutilisés tels quels
 *
 * Une fusion plus profonde (un seul `lifeProjects[]` avec champ `type`)
 * pourra être faite plus tard sans changer la sidebar.
 */

interface LifeProjectsProps {
    travelGoals: TravelGoal[];
    setTravelGoals: (goals: TravelGoal[]) => void;
    lifeEvents: LifeEvent[];
    setLifeEvents: (events: LifeEvent[]) => void;
    netWorth: number;
    returnRate: number;
}

export const LifeProjects: React.FC<LifeProjectsProps> = ({
    travelGoals,
    setTravelGoals,
    lifeEvents,
    setLifeEvents,
    netWorth,
    returnRate,
}) => {
    const [view, setView] = useState<'all' | 'travel' | 'events'>('all');

    const totalProjects = travelGoals.length + lifeEvents.length;
    const upcomingTravel = travelGoals.filter(t => new Date(t.date) > new Date()).length;
    const upcomingEvents = lifeEvents.filter(e => new Date(e.date) > new Date()).length;

    return (
        <div className="space-y-6 stagger-in pb-20">
            <PageHeader
                icon={<Icon name="life-projects" size={28} />}
                title="Projets de vie"
            />

            {/* Recap rapide + sous-onglet selector */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex gap-3">
                    <div className="px-3 py-2 bg-white/5 rounded-card border border-white/10">
                        <div className="text-tiny text-ink-400 uppercase font-bold">Total projets</div>
                        <div className="text-base font-bold text-white">{totalProjects}</div>
                    </div>
                    <div className="px-3 py-2 bg-info-500/10 rounded-card border border-info-500/20">
                        <div className="text-tiny text-info-300 uppercase font-bold">Voyages à venir</div>
                        <div className="text-base font-bold text-info-100">{upcomingTravel}</div>
                    </div>
                    <div className="px-3 py-2 bg-purple-500/10 rounded-card border border-purple-500/20">
                        <div className="text-tiny text-purple-300 uppercase font-bold">Événements à venir</div>
                        <div className="text-base font-bold text-purple-100">{upcomingEvents}</div>
                    </div>
                </div>
                <Pill
                    aria-label="Filtre projets"
                    size="sm"
                    value={view}
                    onChange={(v) => setView(v as typeof view)}
                    options={[
                        { value: 'all', label: 'Tout' },
                        { value: 'travel', label: 'Voyages' },
                        { value: 'events', label: 'Événements' },
                    ]}
                />
            </div>

            {/* Bloc Voyages */}
            {(view === 'all' || view === 'travel') && (
                <Travel travelGoals={travelGoals} setTravelGoals={setTravelGoals} />
            )}

            {/* Bloc Life Events — LifeEvents gère déjà travelGoals dans sa timeline */}
            {(view === 'all' || view === 'events') && (
                <LifeEvents
                    events={lifeEvents}
                    setEvents={setLifeEvents}
                    travelGoals={travelGoals}
                    setTravelGoals={setTravelGoals}
                    netWorth={netWorth}
                    returnRate={returnRate}
                />
            )}
        </div>
    );
};
