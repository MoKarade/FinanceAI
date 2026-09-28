// components/vie/FormulaireProjet.tsx
//
// [S5-REFONTE-PROJETS] Formulaire « Nouveau projet » (voyage OU événement), extrait tel quel de
// l'ancien LifeEvents.tsx : mêmes champs, mêmes refus ([FISC-EVENT-INCOMELOSS]) et même intention de
// vente explicite ([ENG-LIFEEVENT-VENTE-SUBSTRING]). Seule la mise en forme suit les maquettes.
import React, { useMemo, useState } from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { LifeEvent, LifeEventType, TravelGoal } from '../../types';
import { INCOME_LOSS_TYPES } from './projetsDeVie';

/** Défaut de % de revenu perdu par type (modifiable). Sémantique validée Marc 2026-06-18 :
 *  perte d'emploi & sabbatique = 100 % (revenu coupé), accident/maladie = 50 % (partiel). */
const INCOME_LOSS_DEFAULT_PCT: Partial<Record<LifeEventType, number>> = { PERTE_EMPLOI: 100, SABBATIQUE: 100, ACCIDENT: 50 };
/** parseFloat tolérant : champ vide / NaN → undefined (jamais de NaN persisté dans le store ni propagé au moteur). */
const numOrUndef = (v: string): number | undefined => { const n = parseFloat(v); return Number.isFinite(n) ? n : undefined; };

const CHAMP = 'w-full h-11 px-3 text-ink-50';
const ETIQUETTE = 'text-meta text-ink-300 mb-1 block';

interface Props {
    voyages: TravelGoal[];
    setVoyages: (v: TravelGoal[]) => void;
    evenements: LifeEvent[];
    setEvenements: (e: LifeEvent[]) => void;
    onFermer: () => void;
}

export const FormulaireProjet: React.FC<Props> = ({ voyages, setVoyages, evenements, setEvenements, onFermer }) => {
    const [genre, setGenre] = useState<'TRAVEL' | 'EVENT'>('TRAVEL');
    const [erreur, setErreur] = useState<string | null>(null);
    const aujourdhui = new Date().toISOString().split('T')[0];
    const [nouvelEvenement, setNouvelEvenement] = useState<Partial<LifeEvent>>({ type: 'GROS_ACHAT', date: aujourdhui });
    const [nouveauVoyage, setNouveauVoyage] = useState<Partial<TravelGoal>>({ destination: '', date: aujourdhui, totalCost: 0, image: '✈️' });
    // DETTE-RE-SALE : biens immobiliers pour désigner LEQUEL vendre sur un événement « vente » (le
    // sélecteur n'apparaît qu'avec ≥2 biens actifs — sinon le fallback moteur suffit).
    const realEstateGoals = useFinanceStore(s => s.realEstateGoals);
    const biensActifs = useMemo(() => realEstateGoals.filter(g => g.isActive), [realEstateGoals]);

    const ajouter = () => {
        if (genre === 'TRAVEL') {
            if (!nouveauVoyage.destination || !nouveauVoyage.totalCost) { setErreur('Destination et coût du voyage requis.'); return; }
            setVoyages([...voyages, { id: Date.now().toString(), destination: nouveauVoyage.destination, date: nouveauVoyage.date || aujourdhui, totalCost: Number(nouveauVoyage.totalCost), image: nouveauVoyage.image || '✈️' }]);
        } else {
            if (!nouvelEvenement.name || !nouvelEvenement.date) { setErreur('Nom et date de l\'événement requis.'); return; }
            // [FISC-EVENT-INCOMELOSS] un événement de perte de revenu SANS % ou durée serait inerte
            // (le moteur l'ignorerait) → on le refuse explicitement plutôt que de créer un levier muet.
            if (INCOME_LOSS_TYPES.includes(nouvelEvenement.type as LifeEventType)
                && (!Number.isFinite(nouvelEvenement.incomeLossPercent) || (nouvelEvenement.incomeLossPercent ?? 0) <= 0
                    || !Number.isFinite(nouvelEvenement.durationMonths) || (nouvelEvenement.durationMonths ?? 0) <= 0)) {
                setErreur('Perte de revenu : indique un % perdu (> 0) et une durée en mois (> 0).');
                return;
            }
            // [ENG-LIFEEVENT-VENTE-SUBSTRING] `eventKind` est écrit EXPLICITEMENT sur tout événement neuf.
            setEvenements([...evenements, {
                ...nouvelEvenement,
                eventKind: nouvelEvenement.eventKind === 'VENTE_IMMO' ? 'VENTE_IMMO' : 'NONE',
                id: Date.now().toString(),
            } as LifeEvent]);
        }
        setErreur(null);
        onFermer();
    };

    const onglet = (g: 'TRAVEL' | 'EVENT', libelle: string) => (
        <button
            type="button"
            onClick={() => { setGenre(g); setErreur(null); }}
            aria-pressed={genre === g}
            className={`h-9 px-3.5 rounded-lg text-body transition-colors focus-ring ${genre === g ? 'bg-surfaceHighlight text-ink-50 font-semibold' : 'text-ink-300 hover:bg-white/5'}`}
        >
            {libelle}
        </button>
    );

    return (
        <section aria-labelledby="nouveau-projet-titre" className="rounded-2xl bg-surface border border-white/10 p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="nouveau-projet-titre" className="text-[17px] font-semibold text-ink-50">Nouveau projet</h2>
                <div role="group" aria-label="Genre de projet" className="flex gap-1">
                    {onglet('TRAVEL', 'Voyage')}
                    {onglet('EVENT', 'Aléas & Projets')}
                </div>
            </div>
            {genre === 'TRAVEL' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label htmlFor="lifeevent-destination" className={ETIQUETTE}>Destination</label><input id="lifeevent-destination" type="text" placeholder="Japon, Italie…" className={CHAMP} value={nouveauVoyage.destination} onChange={e => setNouveauVoyage({ ...nouveauVoyage, destination: e.target.value })} /></div>
                    <div><label htmlFor="lifeevent-tripDate" className={ETIQUETTE}>Date de départ</label><input id="lifeevent-tripDate" type="date" className={CHAMP} value={nouveauVoyage.date} onChange={e => setNouveauVoyage({ ...nouveauVoyage, date: e.target.value })} /></div>
                    <div><label htmlFor="lifeevent-tripCost" className={ETIQUETTE}>Budget total ($)</label><input id="lifeevent-tripCost" type="number" placeholder="5000" className={CHAMP} value={nouveauVoyage.totalCost || ''} onChange={e => setNouveauVoyage({ ...nouveauVoyage, totalCost: parseFloat(e.target.value) })} /></div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                        <label htmlFor="lifeevent-type" className={ETIQUETTE}>Type</label>
                        <select id="lifeevent-type" className={CHAMP} value={nouvelEvenement.type} onChange={e => { const t = e.target.value as LifeEventType; const perte = INCOME_LOSS_TYPES.includes(t); setNouvelEvenement(prev => ({ ...prev, type: t, incomeLossPercent: perte ? (prev.incomeLossPercent ?? INCOME_LOSS_DEFAULT_PCT[t]) : undefined, durationMonths: perte ? prev.durationMonths : undefined, impactPercent: t === 'KRACH' ? prev.impactPercent : undefined, impactAmount: (!perte && t !== 'KRACH') ? prev.impactAmount : undefined })); }}>
                            <optgroup label="Projets de vie"><option value="GROS_ACHAT">Gros achat</option><option value="MARIAGE">Mariage</option><option value="RENOVATION">Rénovations</option><option value="AUTO">Achat auto</option><option value="SABBATIQUE">Année sabbatique</option><option value="BUSINESS">Lancer une entreprise</option></optgroup>
                            <optgroup label="Risques et aléas"><option value="ACCIDENT">Accident / santé</option><option value="PERTE_EMPLOI">Perte d'emploi</option><option value="KRACH">Krach boursier</option><option value="HERITAGE">Héritage / gain</option></optgroup>
                        </select>
                    </div>
                    <div><label htmlFor="lifeevent-name" className={ETIQUETTE}>Nom</label><input id="lifeevent-name" type="text" className={CHAMP} value={nouvelEvenement.name ?? ''} onChange={e => setNouvelEvenement({ ...nouvelEvenement, name: e.target.value })} /></div>
                    <div><label htmlFor="lifeevent-date" className={ETIQUETTE}>Date</label><input id="lifeevent-date" type="date" className={CHAMP} value={nouvelEvenement.date} onChange={e => setNouvelEvenement({ ...nouvelEvenement, date: e.target.value })} /></div>
                    {nouvelEvenement.type === 'KRACH' ? (
                        <div><label htmlFor="lifeevent-krach" className={ETIQUETTE}>Chute (%)</label><input id="lifeevent-krach" type="number" min={0} max={100} placeholder="Ex: 30" className={CHAMP} value={nouvelEvenement.impactPercent ?? ''} onChange={e => setNouvelEvenement({ ...nouvelEvenement, impactPercent: numOrUndef(e.target.value) })} /></div>
                    ) : INCOME_LOSS_TYPES.includes(nouvelEvenement.type as LifeEventType) ? (
                        <>
                            <div><label htmlFor="lifeevent-losspct" className={ETIQUETTE}>% de revenu perdu</label><input id="lifeevent-losspct" type="number" min={0} max={100} placeholder="Ex: 100" className={CHAMP} value={nouvelEvenement.incomeLossPercent ?? ''} onChange={e => setNouvelEvenement({ ...nouvelEvenement, incomeLossPercent: numOrUndef(e.target.value) })} /></div>
                            <div><label htmlFor="lifeevent-duration" className={ETIQUETTE}>Durée (mois)</label><input id="lifeevent-duration" type="number" min={1} placeholder="Ex: 6" className={CHAMP} value={nouvelEvenement.durationMonths ?? ''} onChange={e => setNouvelEvenement({ ...nouvelEvenement, durationMonths: numOrUndef(e.target.value) })} /></div>
                        </>
                    ) : (
                        <div><label htmlFor="lifeevent-amount" className={ETIQUETTE}>Montant ($)</label><input id="lifeevent-amount" type="number" className={CHAMP} value={nouvelEvenement.impactAmount ?? ''} onChange={e => setNouvelEvenement({ ...nouvelEvenement, impactAmount: numOrUndef(e.target.value) })} /></div>
                    )}
                    {/* [ENG-LIFEEVENT-VENTE-SUBSTRING] Vendre un bien est une INTENTION, pas un mot dans un
                        champ libre : la case écrit `eventKind`, un champ TYPÉ que le moteur consulte en premier. */}
                    {biensActifs.length >= 1 && (
                        <div className="md:col-span-2 lg:col-span-4">
                            <label htmlFor="lifeevent-vente" className="flex items-center gap-2 text-meta text-ink-300 cursor-pointer min-h-11">
                                <input
                                    id="lifeevent-vente"
                                    type="checkbox"
                                    className="h-4 w-4 accent-primary"
                                    checked={nouvelEvenement.eventKind === 'VENTE_IMMO'}
                                    onChange={e => setNouvelEvenement(prev => ({
                                        ...prev,
                                        eventKind: e.target.checked ? 'VENTE_IMMO' : 'NONE',
                                        // Décocher retire la cible : un `propertyId` orphelin désignerait un bien que plus rien ne vend.
                                        propertyId: e.target.checked ? prev.propertyId : undefined,
                                    }))}
                                />
                                Cet événement est la <strong>vente d'un bien immobilier</strong>
                            </label>
                            {/* ⚠️ La RÉSERVE, pas l'automatisme : si le nom parle de vente alors que la case est
                                décochée, on le DIT au lieu de deviner. */}
                            {nouvelEvenement.eventKind !== 'VENTE_IMMO' && nouvelEvenement.name?.toLowerCase().includes('vente') && (
                                <p className="text-meta text-amber-300 mt-1" role="status">
                                    Le nom parle d'une vente, mais la case n'est pas cochée : aucun bien ne sera vendu.
                                </p>
                            )}
                        </div>
                    )}
                    {nouvelEvenement.eventKind === 'VENTE_IMMO' && biensActifs.length >= 2 && (
                        <div className="md:col-span-2 lg:col-span-4">
                            <label htmlFor="lifeevent-property" className={ETIQUETTE}>Bien à vendre (plusieurs biens détectés)</label>
                            <select id="lifeevent-property" className={CHAMP} value={nouvelEvenement.propertyId ?? ''} onChange={e => setNouvelEvenement({ ...nouvelEvenement, propertyId: e.target.value || undefined })}>
                                <option value="">Auto (1er bien à équité positive)</option>
                                {biensActifs.map(g => <option key={g.id} value={g.id}>{g.name || 'Bien immobilier'}</option>)}
                            </select>
                        </div>
                    )}
                </div>
            )}
            {erreur && <p className="text-meta text-red-300" role="alert">{erreur}</p>}
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onFermer} className="h-10 px-4 rounded-lg text-body text-ink-300 hover:bg-white/5 focus-ring">Annuler</button>
                <button type="button" onClick={ajouter} className="h-10 px-4 rounded-lg bg-primary text-dark text-body font-bold focus-ring">Ajouter</button>
            </div>
        </section>
    );
};
