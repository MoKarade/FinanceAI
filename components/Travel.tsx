
import React, { useState } from 'react';
import { Card } from './ui/Card';
import { ConfirmModal } from './ui/ConfirmModal';
import { PageHeader } from './ui/PageHeader';
import { Button } from './ui/Button';
import { TravelGoal } from '../types';

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
                icon="✈️"
                title="Mes Voyages"
                subtitle="Planifiez vos prochaines aventures"
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
                            <label className="text-xs text-gray-400 mb-1 block">Destination</label>
                            <input
                                type="text" placeholder="Japon, Italie..."
                                className="w-full bg-dark border border-white/20 rounded p-2 text-white"
                                value={newTrip.destination}
                                onChange={e => setNewTrip({ ...newTrip, destination: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-400 mb-1 block">Date Départ</label>
                            <input
                                type="date"
                                className="w-full bg-dark border border-white/20 rounded p-2 text-white"
                                value={newTrip.date}
                                onChange={e => setNewTrip({ ...newTrip, date: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-400 mb-1 block">Budget Total ($)</label>
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
                        <div key={trip.id} className={`relative group overflow-hidden rounded-2xl border ${isPast ? 'border-gray-800 bg-gray-900/50 grayscale' : 'border-white/10 bg-[#1e1e1e] hover:border-primary/50'} transition-all duration-300 shadow-xl`}>
                            {/* Image Header Placeholder */}
                            <div className={`h-24 ${isPast ? 'bg-gray-800' : 'bg-gradient-to-r from-blue-900 to-purple-900'} flex items-center justify-center relative overflow-hidden`}>
                                <span className="text-6xl select-none opacity-20 transform group-hover:scale-110 transition-transform duration-500">✈️</span>
                                <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-md px-2 py-1 rounded text-xs font-mono border border-white/10">
                                    {isPast ? 'Terminé' : `J-${daysLeft}`}
                                </div>
                            </div>

                            <div className="p-5">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="text-xl font-bold text-white">{trip.destination}</h3>
                                    <button onClick={() => handleDelete(trip.id)} className="text-gray-600 hover:text-red-500 transition-colors">🗑️</button>
                                </div>

                                <div className="text-sm text-gray-400 mb-4 flex items-center gap-2">
                                    <span>📅 {new Date(trip.date).toLocaleDateString()}</span>
                                </div>

                                <div className="bg-black/30 rounded-lg p-3 flex justify-between items-center border border-white/5">
                                    <span className="text-xs text-gray-500 uppercase font-bold">Budget</span>
                                    <span className="text-lg font-bold text-green-400">{trip.totalCost.toLocaleString()} $</span>
                                </div>

                                {!isPast && (
                                    <div className="mt-4 text-tiny text-gray-500 text-center">
                                        Ce montant sera déduit de vos liquidités dans la simulation du futur.
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {sortedTrips.length === 0 && !isAdding && (
                <div className="text-center py-20 opacity-50">
                    <span className="text-6xl block mb-4">🌍</span>
                    <p>Aucun voyage prévu. Ajoutez-en un pour voir l'impact sur vos finances !</p>
                </div>
            )}
        </div>
    );
};
