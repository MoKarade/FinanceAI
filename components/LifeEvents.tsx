import React, { useState, useMemo } from 'react';
import { Card } from './ui/Card';
import { EmptyState } from './ui/EmptyState';
import { PageHeader } from './ui/PageHeader';
import { Button } from './ui/Button';
import { LifeEvent, LifeEventType, TravelGoal } from '../types';
import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip } from 'recharts';
import { ConfirmModal } from './ui/ConfirmModal';

interface LifeEventsProps {
    events: LifeEvent[];
    setEvents: (e: LifeEvent[]) => void;
    travelGoals: TravelGoal[];
    setTravelGoals: (g: TravelGoal[]) => void;
    netWorth: number;
    returnRate: number;
}

const getEventInsights = (type: string, amount: number) => {
    switch (type) {
        case 'MARIAGE': return { breakdown: [{ name: 'Réception/Traiteur', value: amount * 0.45, color: '#ec4899' }, { name: 'Lieu & Déco', value: amount * 0.20, color: '#8b5cf6' }, { name: 'Photo/Vidéo', value: amount * 0.12, color: '#3b82f6' }, { name: 'Tenues/Alliances', value: amount * 0.13, color: '#10b981' }, { name: 'Fleurs/Musique', value: amount * 0.10, color: '#f59e0b' }], tips: ['💰 Astuce : Les cadeaux des invités couvrent souvent 40% à 60% des frais de réception.', '⚠️ Coût caché : Les pourboires et les taxes sur les services (souvent non inclus dans les devis initiaux).', '📉 Impact : C\'est une dépense pure, sans ROI financier, mais un investissement émotionnel majeur.'] };
        case 'AUTO': return { breakdown: [{ name: 'Prix Véhicule', value: amount * 0.85, color: '#3b82f6' }, { name: 'Taxes & Frais', value: amount * 0.15, color: '#ef4444' }], tips: ['📉 Dépréciation : Votre voiture perdra environ 20% de sa valeur dès la première année.', '⛽ Budget Mensuel : N\'oubliez pas d\'ajouter ~400$/mois au budget pour l\'assurance, l\'essence et l\'entretien.', '💡 Conseil : Acheter un véhicule de 3 ans permet souvent d\'éviter la plus grosse part de la dépréciation.'] };
        case 'RENOVATION': return { breakdown: [{ name: 'Matériaux', value: amount * 0.40, color: '#f59e0b' }, { name: 'Main d\'oeuvre', value: amount * 0.45, color: '#8b5cf6' }, { name: 'Imprévus (+15%)', value: amount * 0.15, color: '#ef4444' }], tips: ['🏠 ROI : Une cuisine ou salle de bain rénovée récupère environ 75% de son coût à la revente.', '🏊‍♂️ Attention : Une piscine ne récupère souvent que 10% à 40% de son coût à la revente.', '⚠️ Risque : Prévoyez toujours une marge de manœuvre de 15% pour les surprises derrière les murs.'] };
        case 'TRAVEL': return { breakdown: [{ name: 'Vols/Transport', value: amount * 0.35, color: '#3b82f6' }, { name: 'Hébergement', value: amount * 0.30, color: '#8b5cf6' }, { name: 'Nourriture/Activités', value: amount * 0.35, color: '#10b981' }], tips: ['✈️ Flexibilité : Partir un mardi ou mercredi peut réduire le coût des vols de 15-20%.', '💳 Frais : Utilisez une carte sans frais de conversion devises pour économiser 2.5% sur tout.', '⚠️ Coût caché : Les transports locaux (taxi, train) une fois sur place sont souvent sous-estimés.'] };
        case 'GROS_ACHAT': return { breakdown: [{ name: 'Prix Produit', value: amount * 0.80, color: '#facc15' }, { name: 'Taxes (15%)', value: amount * 0.15, color: '#ef4444' }, { name: 'Accessoires/Entretien', value: amount * 0.05, color: '#6b7280' }], tips: ['⏳ Règle des 30 jours : Pour tout achat > 500$, attendez 30 jours.', '📉 Obsolescence : Si c\'est de la tech, ça vaudra 50% de moins dans 2 ans.', '⚠️ Financement : Si vous financez cet achat, le coût réel peut augmenter de 10-20%.'] };
        case 'SABBATIQUE': return { breakdown: [{ name: 'Logement', value: amount * 0.30, color: '#3b82f6' }, { name: 'Nourriture/Vie', value: amount * 0.30, color: '#10b981' }, { name: 'Transport/Voyage', value: amount * 0.30, color: '#f59e0b' }, { name: 'Assurances/Santé', value: amount * 0.10, color: '#ef4444' }], tips: ['📉 Coût caché majeur : L\'arrêt des cotisations retraite (RRQ/REER) pendant 1 an a un impact composé énorme.', '💡 Astuce : Sous-louer votre résidence principale peut couvrir 60% de vos frais fixes.', '⚠️ Retour : Prévoyez un \'buffer\' de 2 mois de salaire pour le retour.'] };
        case 'BUSINESS': return { breakdown: [{ name: 'Dév/Produit', value: amount * 0.40, color: '#8b5cf6' }, { name: 'Marketing/Pub', value: amount * 0.30, color: '#ec4899' }, { name: 'Légal/Admin', value: amount * 0.10, color: '#6b7280' }, { name: 'Fonds de roulement', value: amount * 0.20, color: '#10b981' }], tips: ['🚀 Cash is King : La raison #1 de faillite n\'est pas le manque de profit, mais le manque de liquidités.', '⚠️ Coût caché : En tant qu\'autonome, vous devez payer la part employeur ET employé de la RRQ.', '💡 Conseil : Séparez vos comptes bancaires pro et perso dès le jour 1.'] };
        case 'PERTE_EMPLOI': return { breakdown: [{ name: 'Loyer/Hypothèque', value: amount * 0.50, color: '#ef4444' }, { name: 'Nourriture', value: amount * 0.25, color: '#f59e0b' }, { name: 'Factures Fixes', value: amount * 0.15, color: '#3b82f6' }, { name: 'Recherche Emploi', value: amount * 0.10, color: '#6b7280' }], tips: ['📉 Mode Survie : Coupez immédiatement tout ce qui n\'est pas vital.', '⚠️ Délai : L\'assurance emploi a un délai de carence.', '💡 Conseil : Négociez un report de paiement hypothécaire avec votre banque *avant* d\'tre en défaut.'] };
        case 'ACCIDENT': return { breakdown: [{ name: 'Perte Revenu (Net)', value: amount * 0.60, color: '#ef4444' }, { name: 'Soins Non-Couverts', value: amount * 0.30, color: '#f59e0b' }, { name: 'Logistique/Aide', value: amount * 0.10, color: '#6b7280' }], tips: ['⚕️ RAMQ : La RAMQ ne couvre pas tout (physio, psy, adaptation domicile).', '⚠️ Coût caché : Les frais de stationnement à l\'hôpital s\'accumulent vite.', '💡 Conseil : Vérifiez si vous avez une assurance invalidité longue durée au travail.'] };
        case 'HERITAGE': return { breakdown: [{ name: 'Investissement', value: amount * 0.60, color: '#10b981' }, { name: 'Remb. Dettes', value: amount * 0.30, color: '#3b82f6' }, { name: 'Plaisir (Fun)', value: amount * 0.10, color: '#ec4899' }], tips: ['🧠 Règle des 6 mois : Ne prenez aucune décision majeure pendant 6 mois.', '⚠️ Fiscalité : Au Canada, pas d\'impôt sur les successions pour le bénéficiaire.', '💡 Stratégie : C\'est le moment idéal pour maximiser vos droits CELI et REER.'] };
        case 'KRACH': return { breakdown: [{ name: 'Perte Latente Actions', value: amount * 0.70, color: '#ef4444' }, { name: 'Perte Latente Obligations', value: amount * 0.30, color: '#f59e0b' }], tips: ['📉 Historique : Les marchés baissiers durent en moyenne 10 à 14 mois.', '🧠 Psychologie : Le plus grand risque est de vendre au plus bas.', '💡 Opportunité : \'Buy the dip\'. C\'est le moment d\'acheter des actifs de qualité à rabais.'] };
        default: return null;
    }
};

export const LifeEvents: React.FC<LifeEventsProps> = ({ events, setEvents, travelGoals, setTravelGoals, netWorth, returnRate }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [activeTab, setActiveTab] = useState<'ALL' | 'TRAVEL' | 'RISK'>('ALL');
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
    const [eventTypeCategory, setEventTypeCategory] = useState<'TRAVEL' | 'EVENT'>('TRAVEL');
    const [newLifeEvent, setNewLifeEvent] = useState<Partial<LifeEvent>>({ type: 'GROS_ACHAT', date: new Date().toISOString().split('T')[0] });
    const [newTrip, setNewTrip] = useState<Partial<TravelGoal>>({ destination: '', date: new Date().toISOString().split('T')[0], totalCost: 0, image: '✈️' });
    const [dragOverYear, setDragOverYear] = useState<number | null>(null);

    const allItems = useMemo(() => {
        const tItems = travelGoals.map(t => ({ id: t.id, uniqueKey: `travel_${t.id}`, date: t.date, name: `Voyage: ${t.destination}`, cost: t.totalCost, type: 'TRAVEL', icon: t.image || '✈️', details: t.destination }));
        const eItems = events.map(e => ({ id: e.id, uniqueKey: `event_${e.id}`, date: e.date, name: e.name, cost: e.impactAmount || 0, type: e.type, icon: e.type === 'KRACH' ? '📉' : e.type === 'ACCIDENT' ? '🚑' : e.type === 'GROS_ACHAT' ? '💸' : e.type === 'PERTE_EMPLOI' ? '💼' : e.type === 'MARIAGE' ? '💍' : e.type === 'RENOVATION' ? '🔨' : e.type === 'AUTO' ? '🚗' : e.type === 'SABBATIQUE' ? '🧘' : e.type === 'BUSINESS' ? '🚀' : '⛱️', details: e.type === 'KRACH' ? `Chute ${e.impactPercent}%` : (e.durationMonths ? `Durée ${e.durationMonths} mois` : '') }));
        return [...tItems, ...eItems].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [events, travelGoals]);

    const filteredItems = useMemo(() => {
        if (activeTab === 'TRAVEL') return allItems.filter(i => i.type === 'TRAVEL');
        if (activeTab === 'RISK') return allItems.filter(i => i.type !== 'TRAVEL');
        return allItems;
    }, [allItems, activeTab]);

    const selectedItem = useMemo(() => {
        if (!selectedEventId && allItems.length > 0) return allItems[0];
        return allItems.find(i => i.uniqueKey === selectedEventId) || (allItems.length > 0 ? allItems[0] : null);
    }, [allItems, selectedEventId]);

    const impactAnalysis = useMemo(() => {
        if (!selectedItem) return null;
        const yearsToProject = 20;
        const rate = returnRate / 100;
        const cost = selectedItem.cost;
        const futureValueLost = cost * Math.pow(1 + rate, yearsToProject);
        const opportunityCost = futureValueLost - cost;
        const liquidityRatio = netWorth > 0 ? (cost / netWorth) * 100 : 0;
        const insights = getEventInsights(selectedItem.type, cost);
        return { immediateCost: cost, opportunityCost, totalWealthImpact20y: futureValueLost, liquidityRatio, insights };
    }, [selectedItem, netWorth, returnRate]);

    const handleAdd = () => {
        if (eventTypeCategory === 'TRAVEL') {
            if (newTrip.destination && newTrip.totalCost) {
                setTravelGoals([...travelGoals, { id: Date.now().toString(), destination: newTrip.destination || 'Inconnu', date: newTrip.date || new Date().toISOString().split('T')[0], totalCost: Number(newTrip.totalCost), image: newTrip.image || '✈️' }]);
            }
        } else {
            if (newLifeEvent.name && newLifeEvent.date) {
                setEvents([...events, { ...newLifeEvent, id: Date.now().toString() } as LifeEvent]);
            }
        }
        setIsAdding(false);
        setNewTrip({ destination: '', date: '', totalCost: 0, image: '✈️' });
        setNewLifeEvent({ type: 'GROS_ACHAT', date: new Date().toISOString().split('T')[0] });
    };

    const handleDelete = (uniqueKey: string) => {
        const isTravel = uniqueKey.startsWith('travel_');
        const idToDelete = uniqueKey.split('_')[1];
        if (isTravel) {
            setTravelGoals(travelGoals.filter(t => t.id !== idToDelete));
        } else {
            setEvents(events.filter(e => e.id !== idToDelete));
        }
        if (selectedEventId === uniqueKey) setSelectedEventId(null);
    };

    const doDeleteConfirmed = () => {
        if (confirmDeleteKey) {
            handleDelete(confirmDeleteKey);
            setConfirmDeleteKey(null);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in pb-24">
            <ConfirmModal
                isOpen={!!confirmDeleteKey}
                onConfirm={doDeleteConfirmed}
                onCancel={() => setConfirmDeleteKey(null)}
                title="Supprimer l'événement"
                message="Supprimer définitivement cet événement ?"
                confirmLabel="Supprimer"
            />

            <PageHeader
                icon="🛤️"
                title="Parcours de Vie"
                subtitle="Simulez l'impact financier de vos projets (voyages, mariage) et des aléas (accidents, krach)."
                actions={
                    <Button onClick={() => setIsAdding(!isAdding)} variant={isAdding ? 'ghost' : 'secondary'} size="md">
                        {isAdding ? 'Fermer' : '➕ Ajouter un Événement'}
                    </Button>
                }
            />

            {/* INTERACTIVE TIMELINE */}
            {(() => {
                const currentYear = new Date().getFullYear();
                const timelineYears = Array.from({ length: 15 }, (_, i) => currentYear + i);
                const eventsByYear: Record<number, typeof allItems> = {};
                timelineYears.forEach(y => eventsByYear[y] = []);
                allItems.forEach(item => {
                    const yr = new Date(item.date).getFullYear();
                    if (yr >= currentYear && yr <= currentYear + 14) eventsByYear[yr] = [...(eventsByYear[yr] || []), item];
                });
                const handleDragStart = (e: React.DragEvent, itemId: string) => { e.dataTransfer.setData('text/plain', itemId); e.dataTransfer.effectAllowed = 'move'; };
                const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
                const handleDrop = (e: React.DragEvent, targetYear: number) => {
                    e.preventDefault(); setDragOverYear(null);
                    const uniqueKey = e.dataTransfer.getData('text/plain');
                    const isTravel = uniqueKey.startsWith('travel_');
                    const idToDrop = uniqueKey.split('_').slice(1).join('_');
                    if (isTravel) {
                        setTravelGoals(travelGoals.map(t => { if (t.id === idToDrop) { const nd = new Date(t.date); nd.setFullYear(targetYear); return { ...t, date: nd.toISOString().split('T')[0] }; } return t; }));
                    } else {
                        setEvents(events.map(ev => { if (ev.id === idToDrop) { const nd = new Date(ev.date); nd.setFullYear(targetYear); return { ...ev, date: nd.toISOString().split('T')[0] }; } return ev; }));
                    }
                };
                // C7 fix : useState a été déplacé au niveau top du composant (ligne 44).
                // L'ancien `const [dragOverYear, setDragOverYear] = React.useState(null)` ici
                // était une violation de la règle des Hooks (hook dans callback IIFE).
                return (
                    <Card title="🗓️ Timeline Interactive — Glissez pour déplacer un événement">
                        <div className="text-tiny text-gray-500 mb-4">Faites glisser les événements sur les années pour ajuster votre calendrier de vie.</div>
                        <div className="overflow-x-auto pb-3">
                            <div className="flex gap-2 min-w-max">
                                {timelineYears.map(year => {
                                    const isNow = year === currentYear;
                                    const hasEvents = eventsByYear[year]?.length > 0;
                                    const isDragOver = dragOverYear === year;
                                    return (
                                        <div key={year} className={`flex-shrink-0 w-[90px] min-h-[120px] rounded-xl border p-2 flex flex-col gap-1.5 transition-all duration-150 ${isDragOver ? 'border-blue-400 bg-blue-900/30 scale-[1.03]' : isNow ? 'border-green-500/50 bg-green-900/10' : hasEvents ? 'border-white/20 bg-white/5' : 'border-white/5 bg-white/[0.02]'}`}
                                            onDragOver={(e) => { handleDragOver(e); setDragOverYear(year); }}
                                            onDragLeave={() => setDragOverYear(null)}
                                            onDrop={(e) => { handleDrop(e, year); setDragOverYear(null); }}
                                        >
                                            <div className={`text-tiny font-black text-center pb-1 border-b ${isNow ? 'text-green-400 border-green-500/30' : 'text-gray-500 border-white/5'}`}>
                                                {year}{isNow && <span className="ml-1 text-green-400">●</span>}
                                            </div>
                                            {eventsByYear[year]?.map((item) => (
                                                <div key={item.uniqueKey} draggable onDragStart={(e) => handleDragStart(e, item.uniqueKey)}
                                                    className={`px-1.5 py-1 rounded text-tiny font-bold cursor-grab active:cursor-grabbing flex items-center gap-1 select-none transition-opacity hover:opacity-80 ${item.type === 'KRACH' || item.type === 'ACCIDENT' || item.type === 'PERTE_EMPLOI' ? 'bg-red-900/60 text-red-300 border border-red-500/30' : item.uniqueKey.startsWith('travel') ? 'bg-blue-900/60 text-blue-300 border border-blue-500/30' : 'bg-purple-900/60 text-purple-300 border border-purple-500/30'}`}
                                                    title={`${item.name} — ${item.cost.toLocaleString()}$`}>
                                                    <span>{item.icon}</span>
                                                    <span className="truncate max-w-[55px]">{item.name}</span>
                                                </div>
                                            ))}
                                            {isDragOver && <div className="text-tiny text-blue-400 text-center mt-auto pt-1 animate-pulse">⬇ Déposer ici</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </Card>
                );
            })()}

            {isAdding && (
                <Card className="border-2 border-dashed border-white/20 bg-white/5 animate-slide-up">
                    <div className="mb-4 flex gap-4 border-b border-white/10 pb-2">
                        <button onClick={() => setEventTypeCategory('TRAVEL')} className={`text-sm font-bold pb-1 px-2 transition-colors ${eventTypeCategory === 'TRAVEL' ? 'text-white border-b-2 border-blue-500' : 'text-gray-500'}`}>✈️ Voyage</button>
                        <button onClick={() => setEventTypeCategory('EVENT')} className={`text-sm font-bold pb-1 px-2 transition-colors ${eventTypeCategory === 'EVENT' ? 'text-white border-b-2 border-purple-500' : 'text-gray-500'}`}>🎲 Aléas & Projets</button>
                    </div>
                    {eventTypeCategory === 'TRAVEL' ? (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            <div><label className="text-xs text-gray-400 mb-1 block">Destination</label><input type="text" className="w-full bg-dark border border-white/20 rounded p-2 text-white" value={newTrip.destination} onChange={e => setNewTrip({ ...newTrip, destination: e.target.value })} /></div>
                            <div><label className="text-xs text-gray-400 mb-1 block">Date</label><input type="date" className="w-full bg-dark border border-white/20 rounded p-2 text-white" value={newTrip.date} onChange={e => setNewTrip({ ...newTrip, date: e.target.value })} /></div>
                            <div><label className="text-xs text-gray-400 mb-1 block">Coût ($)</label><input type="number" className="w-full bg-dark border border-white/20 rounded p-2 text-white" value={newTrip.totalCost || ''} onChange={e => setNewTrip({ ...newTrip, totalCost: parseFloat(e.target.value) })} /></div>
                            <button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded font-bold h-[42px]">Planifier Voyage</button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                            <div className="lg:col-span-1">
                                <label className="text-xs text-gray-400 mb-1 block">Type</label>
                                <select className="w-full bg-dark border border-white/20 rounded p-2 text-white text-xs" value={newLifeEvent.type} onChange={e => setNewLifeEvent({ ...newLifeEvent, type: e.target.value as LifeEventType })}>
                                    <optgroup label="Projets de Vie"><option value="GROS_ACHAT">💸 Gros Achat</option><option value="MARIAGE">💍 Mariage</option><option value="RENOVATION">🔨 Rénovations</option><option value="AUTO">🚗 Achat Auto</option><option value="SABBATIQUE">🧘 Année Sabbatique</option><option value="BUSINESS">🚀 Lancer Business</option></optgroup>
                                    <optgroup label="Risques & Aléas"><option value="ACCIDENT">🚑 Accident / Santé</option><option value="PERTE_EMPLOI">💼 Perte d'Emploi</option><option value="KRACH">📉 Krach Boursier</option><option value="HERITAGE">⛱️ Héritage / Gain</option></optgroup>
                                </select>
                            </div>
                            <div><label className="text-xs text-gray-400 mb-1 block">Nom</label><input type="text" className="w-full bg-dark border border-white/20 rounded p-2 text-white" value={newLifeEvent.name} onChange={e => setNewLifeEvent({ ...newLifeEvent, name: e.target.value })} /></div>
                            <div><label className="text-xs text-gray-400 mb-1 block">Date</label><input type="date" className="w-full bg-dark border border-white/20 rounded p-2 text-white" value={newLifeEvent.date} onChange={e => setNewLifeEvent({ ...newLifeEvent, date: e.target.value })} /></div>
                            {(newLifeEvent.type === 'KRACH' || newLifeEvent.type === 'ACCIDENT' || newLifeEvent.type === 'PERTE_EMPLOI') ? (
                                <div><label htmlFor="lifeevent-impact" className="text-xs text-gray-400 mb-1 block">Impact (%) ou Durée</label><input id="lifeevent-impact" aria-label="Impact en pourcentage ou durée en mois" type="number" placeholder="Ex: 30% ou 3 mois" className="w-full bg-dark border border-white/20 rounded p-2 text-white" value={newLifeEvent.impactPercent || newLifeEvent.durationMonths || ''} onChange={e => setNewLifeEvent({ ...newLifeEvent, impactPercent: parseFloat(e.target.value), durationMonths: parseFloat(e.target.value) })} /></div>
                            ) : (
                                <div><label className="text-xs text-gray-400 mb-1 block">Montant ($)</label><input type="number" className="w-full bg-dark border border-white/20 rounded p-2 text-white" value={newLifeEvent.impactAmount || ''} onChange={e => setNewLifeEvent({ ...newLifeEvent, impactAmount: parseFloat(e.target.value) })} /></div>
                            )}
                            <button onClick={handleAdd} className="bg-purple-600 hover:bg-purple-500 text-white p-2 rounded font-bold h-[42px]">Ajouter</button>
                        </div>
                    )}
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 space-y-4">
                    <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
                        <button onClick={() => setActiveTab('ALL')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeTab === 'ALL' ? 'bg-white text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Tout</button>
                        <button onClick={() => setActiveTab('TRAVEL')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeTab === 'TRAVEL' ? 'bg-blue-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Voyages</button>
                        <button onClick={() => setActiveTab('RISK')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeTab === 'RISK' ? 'bg-purple-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Aléas</button>
                    </div>
                    <div className="relative border-l-2 border-white/10 ml-4 space-y-6">
                        {filteredItems.map((item) => {
                            const isPast = new Date(item.date) < new Date();
                            const isSelected = selectedEventId === item.uniqueKey;
                            return (
                                <div key={item.uniqueKey} className={`relative pl-8 group cursor-pointer transition-all duration-300 ${isSelected ? 'scale-105' : 'hover:pl-9'}`} onClick={() => setSelectedEventId(item.uniqueKey)}>
                                    <div className={`absolute -left-[9px] top-4 w-4 h-4 rounded-full border-4 border-[#0B0E14] transition-colors ${isSelected ? 'bg-white shadow-[0_0_10px_white]' : item.type === 'TRAVEL' ? 'bg-blue-500' : 'bg-purple-500'}`}></div>
                                    <div className={`p-4 rounded-xl border transition-all ${isSelected ? 'bg-white/10 border-white/30 shadow-xl' : 'bg-[#151922] border-white/5 hover:bg-white/10'} ${isPast ? 'opacity-50 grayscale' : ''}`}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                <span className="text-2xl bg-black/30 p-2 rounded-lg">{item.icon}</span>
                                                <div>
                                                    <div className="font-bold text-white">{item.name}</div>
                                                    <div className="text-xs text-gray-400">{item.date} • {item.details || 'Aucun détail'}</div>
                                                </div>
                                            </div>
                                            {item.cost > 0 && <div className="font-bold text-red-400 text-lg">-{item.cost.toLocaleString()}$</div>}
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteKey(item.uniqueKey); }} className="absolute top-3 right-3 text-gray-500 hover:text-red-500 p-2 transition-colors z-10 hover:bg-white/5 rounded-full" title="Supprimer cet événement">🗑️</button>
                                    </div>
                                </div>
                            );
                        })}
                        {filteredItems.length === 0 && (
                            <EmptyState
                                variant="subtle"
                                title="Aucun événement"
                                description="Aucun événement dans cette catégorie pour le moment."
                            />
                        )}
                    </div>
                </div>

                <div className="lg:col-span-5">
                    {selectedItem && impactAnalysis ? (
                        <div className="sticky top-6 space-y-6 animate-fade-in">
                            <Card className="!p-0 overflow-hidden border-2 border-white/10">
                                <div className="bg-gradient-to-r from-gray-900 to-black p-6 border-b border-white/10 flex justify-between items-start">
                                    <div>
                                        <div className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Analyse d'Impact</div>
                                        <h3 className="text-2xl font-black text-white">{selectedItem.name}</h3>
                                        <div className="text-sm text-gray-400 mt-1">{new Date(selectedItem.date).toLocaleDateString()}</div>
                                    </div>
                                    <button onClick={() => setConfirmDeleteKey(selectedItem.uniqueKey)} className="text-gray-500 hover:text-red-500 p-2 transition-colors hover:bg-white/5 rounded-full" title="Supprimer">🗑️</button>
                                </div>
                                <div className="p-6 space-y-6">
                                    <div>
                                        <div className="flex justify-between text-sm mb-2"><span className="text-gray-300">Coût Immédiat</span><span className="text-white font-bold">{impactAnalysis.immediateCost.toLocaleString()} $</span></div>
                                        <div className="w-full bg-gray-800 rounded-full h-2"><div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(100, impactAnalysis.liquidityRatio)}%` }}></div></div>
                                        <div className="text-tiny text-right text-red-400 mt-1">{impactAnalysis.liquidityRatio.toFixed(1)}% de votre patrimoine actuel</div>
                                    </div>
                                    <div className="bg-blue-900/10 border border-blue-500/20 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-2"><span className="text-xl">🦋</span><h4 className="font-bold text-blue-300 text-sm">Effet Papillon (20 ans)</h4></div>
                                        <p className="text-xs text-gray-400 mb-3">Si cet argent ({impactAnalysis.immediateCost.toLocaleString()}$) avait été investi à {returnRate}% au lieu d'être dépensé...</p>
                                        <div className="flex justify-between items-end">
                                            <div><div className="text-xs text-gray-500">Coût d'Opportunité</div><div className="text-lg font-bold text-orange-400">-{Math.round(impactAnalysis.opportunityCost).toLocaleString()} $</div></div>
                                            <div className="text-right"><div className="text-xs text-gray-500">Manque à gagner total</div><div className="text-2xl font-black text-white">-{Math.round(impactAnalysis.totalWealthImpact20y).toLocaleString()} $</div></div>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                            {impactAnalysis.insights && (
                                <Card className="border border-white/10" title="Détails & Conseils">
                                    {impactAnalysis.insights.breakdown.length > 0 && (
                                        <div className="mb-6">
                                            <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">Répartition Estimée</h4>
                                            <div style={{ width: '100%', height: '180px' }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart><Pie data={impactAnalysis.insights.breakdown} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value">{impactAnalysis.insights.breakdown.map((entry: any, index: number) => (<Cell key={`cell-${index}`} fill={entry.color} stroke="none" />))}</Pie><Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333', fontSize: '12px' }} formatter={(val: number) => val.toFixed(0) + '$'} /><Legend verticalAlign="middle" align="right" layout="vertical" iconSize={8} wrapperStyle={{ fontSize: '10px' }} /></PieChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    )}
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-gray-400 uppercase">Facteurs Cachés</h4>
                                        {impactAnalysis.insights.tips.map((tip: string, i: number) => (<div key={i} className="text-xs text-gray-300 bg-white/5 p-3 rounded border border-white/5 leading-relaxed">{tip}</div>))}
                                    </div>
                                </Card>
                            )}
                        </div>
                    ) : (
                        <div className="sticky top-6 h-[400px] flex flex-col items-center justify-center text-gray-500 bg-white/5 rounded-2xl border border-white/5 border-dashed">
                            <span className="text-5xl mb-4 grayscale opacity-30">👈</span>
                            <p className="text-sm">Sélectionnez un événement à gauche</p>
                            <p className="text-xs opacity-50">pour voir l'analyse détaillée</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
