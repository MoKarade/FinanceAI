
import React, { useState } from 'react';
import { Card } from './ui/Card';
import { EmptyState } from './ui/EmptyState';
import { ConfirmModal } from './ui/ConfirmModal';
import { PageHeader } from './ui/PageHeader';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { TravelGoal } from '../types';
import { formatCAD } from '../utils/format';

interface TravelProps {
    travelGoals: TravelGoal[];
    setTravelGoals: (goals: TravelGoal[]) => void;
}

export const Travel: React.FC<TravelProps> = ({ travelGoals, setTravelGoals }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newTrip, setNewTrip] = useState<Partial<TravelGoal>>({ destination: '', date: '', totalCost: 0, image: '✈️' });
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const handleAddTrip = () => {
        if (newTrip.destination && newTrip.totalCost) {
            setTravelGoals([...travelGoals, {
                id: Date.now().toString(),
                destination: newTrip.destination || 'Inconnu',
                date: newTrip.date || new Date().toISOString().split('T')[0],
                totalCost: Number(newTrip.totalCost),
                image: newTrip.image || '✈️'
            }]);
            setIsAdding(false);
            setNewTrip({ destination: '', date: '', totalCost: 0, image: '✈️' });
        }
    };

    const handleDelete = (id: string) => { setConfirmDeleteId(id); };

    const sortedTrips = [...travelGoals].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <ConfirmModal
                isOpen={!!confirmDeleteId}
                onConfirm={() => { if (confirmDeleteId) { setTravelGoals(travelGoals.filter(t => t.id !== confirmDeleteId)); setConfirmDeleteId(null); } }}
                onCancel={() => setConfirmDeleteId(null)}
                message="Supprimer ce voyage définitivement ?"
                confirmLabel="Supprimer"
            />
            <PageHeader
                icon={<Icon name="plane" size={28} />}
                title="Mes Voyages"
                actions={
                    <Button onClick={() => setIsAdding(!isAdding)} variant={isAdding ? 'ghost' : 'primary'} size="md">
                        {isAdding ? 'Annuler' : '+ Nouveau Voyage'}
                    </Button>
                }
            />

            {isAdding && (
                <Card className="border-2 border-dashed border-white/20 bg-white/5">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div>
                            <label className="text-meta text-ink-300 mb-1 block">Destination</label>
                            <input
                                type="text" placeholder="Japon, Italie..."
                                className="w-full bg-dark border border-white/20 rounded p-2 text-white"
                                value={newTrip.destination}
                                onChange={e => setNewTrip({ ...newTrip, destination: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-meta text-ink-300 mb-1 block">Date Départ</label>
                            <input
                                type="date"
                                className="w-full bg-dark border border-white/20 rounded p-2 text-white"
                                value={newTrip.date}
                                onChange={e => setNewTrip({ ...newTrip, date: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-meta text-ink-300 mb-1 block">Budget Total ($)</label>
                            <input
                                type="number" placeholder="5000"
                                className="w-full bg-dark border border-white/20 rounded p-2 text-white"
                                value={newTrip.totalCost || ''}
                                onChange={e => setNewTrip({ ...newTrip, totalCost: parseFloat(e.target.value) })}
                            />
                        </div>
                        <button onClick={handleAddTrip} className="bg-white/10 hover:bg-white/20 border border-white/20 text-white p-2 rounded font-bold h-[42px]">
                            Ajouter
                        </button>
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortedTrips.map(trip => {
                    const daysLeft = Math.ceil((new Date(trip.date).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                    const isPast = daysLeft < 0;

                    return (
                        <div key={trip.id} className={`relative group overflow-hidden rounded-2xl border ${isPast ? 'border-white/10 bg-dark/50 grayscale' : 'border-white/10 bg-[#1e1e1e] hover:border-primary/50'} transition-all duration-300 shadow-xl`}>
                            {/* Image Header Placeholder */}
                            <div className={`h-24 ${isPast ? 'bg-surfaceHighlight' : 'bg-white/[0.04]'} flex items-center justify-center relative overflow-hidden`}>
                                <Icon name="plane" size={48} className="text-white opacity-[0.10] transform group-hover:scale-110 transition-transform duration-500" />
                                <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-md px-2 py-1 rounded text-meta font-mono border border-white/10">
                                    {isPast ? 'Terminé' : `J-${daysLeft}`}
                                </div>
                            </div>

                            <div className="p-5">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="text-xl font-bold text-white">{trip.destination}</h3>
                                    <button onClick={() => handleDelete(trip.id)} aria-label="Supprimer le voyage" className="inline-flex text-ink-500 hover:text-danger-500 transition-colors"><Icon name="trash" size={16} /></button>
                                </div>

                                <div className="text-body text-ink-300 mb-4 flex items-center gap-1.5">
                                    <Icon name="calendar" size={14} className="text-ink-400" />{new Date(trip.date).toLocaleDateString()}
                                </div>

                                <div className="bg-black/30 rounded-lg p-3 flex justify-between items-center border border-white/5">
                                    <span className="text-meta text-ink-400 uppercase font-bold">Budget</span>
                                    <span className="text-lg font-bold text-ink-100">{formatCAD(trip.totalCost)}</span>
                                </div>

                                {!isPast && (
                                    <div className="mt-4 text-tiny text-ink-400 text-center">
                                        Déduit des liquidités dans la simulation.
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {sortedTrips.length === 0 && !isAdding && (
                <EmptyState
                    icon={<Icon name="globe" size={30} />}
                    title="Aucun voyage prévu"
                    description="Visualise son impact sur ta projection."
                />
            )}
        </div>
    );
};
