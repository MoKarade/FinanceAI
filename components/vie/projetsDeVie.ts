// components/vie/projetsDeVie.ts
//
// [S5-REFONTE-PROJETS] Logique PURE de la page « Projets de vie » (voyages + événements réunis) :
// la liste unifiée, l'analyse d'impact, la répartition estimée, le déplacement d'année. Extraite de
// l'ancien LifeEvents.tsx (mêmes règles, mêmes chiffres) pour être partagée par la frise, la liste
// et la carte d'impact.
import type { IconName } from '../ui/Icon';
import type { LifeEvent, LifeEventType, TravelGoal } from '../../types';

/** [FISC-EVENT-INCOMELOSS] Types modélisés comme une PERTE DE REVENU (% perdu + durée), pas une
 *  dépense one-shot. Doit rester aligné sur `INCOME_LOSS_EVENT_TYPES` (services/projection/monthlyEvents). */
export const INCOME_LOSS_TYPES: LifeEventType[] = ['PERTE_EMPLOI', 'SABBATIQUE', 'ACCIDENT'];

export interface ProjetDeVie {
    id: string;
    /** Clé unique voyage/événement (`travel_<id>` / `event_<id>`). */
    cle: string;
    genre: 'voyage' | 'evenement';
    nom: string;
    date: string;
    cout: number;
    type: string;
    icone: IconName;
    details: string;
}

const ICONES: Partial<Record<LifeEventType, IconName>> = {
    KRACH: 'debt', ACCIDENT: 'ambulance', GROS_ACHAT: 'cart', PERTE_EMPLOI: 'portfolio', MARIAGE: 'heart',
    RENOVATION: 'real-estate', AUTO: 'car', SABBATIQUE: 'retirement', BUSINESS: 'rocket',
};

/** Voyages et événements, triés par date. */
export function listerProjets(voyages: readonly TravelGoal[], evenements: readonly LifeEvent[]): ProjetDeVie[] {
    const v: ProjetDeVie[] = voyages.map((t) => ({
        id: t.id, cle: `travel_${t.id}`, genre: 'voyage', nom: t.destination, date: t.date, cout: t.totalCost,
        type: 'TRAVEL', icone: 'send', details: t.destination,
    }));
    const e: ProjetDeVie[] = evenements.map((ev) => ({
        id: ev.id, cle: `event_${ev.id}`, genre: 'evenement', nom: ev.name, date: ev.date, cout: ev.impactAmount || 0,
        type: ev.type, icone: ICONES[ev.type] ?? 'calendar',
        details: ev.type === 'KRACH'
            ? `Chute ${ev.impactPercent} %`
            : INCOME_LOSS_TYPES.includes(ev.type)
                ? (ev.incomeLossPercent != null && ev.durationMonths != null ? `Perte ${ev.incomeLossPercent} % · ${ev.durationMonths} mois` : 'Non configuré')
                : (ev.durationMonths ? `Durée ${ev.durationMonths} mois` : ''),
    }));
    return [...v, ...e].sort((a, b) => a.date.localeCompare(b.date));
}

export type Filtre = 'tout' | 'voyages' | 'evenements';
export const filtrer = (items: readonly ProjetDeVie[], f: Filtre) =>
    f === 'voyages' ? items.filter((i) => i.genre === 'voyage') : f === 'evenements' ? items.filter((i) => i.genre === 'evenement') : [...items];

/** Jours entre aujourd'hui (jour ISO local) et la date du projet ; négatif s'il est passé. */
export function joursRestants(dateIso: string, aujourdhuiIso: string): number {
    const jour = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((jour(dateIso) - jour(aujourdhuiIso)) / 86_400_000);
}

export interface Impact {
    coutImmediat: number;
    /** Part du patrimoine actuel (%). */
    partPatrimoine: number;
    /** Rendement perdu sur 20 ans (valeur future − coût). */
    coutOpportunite: number;
    /** Valeur future totale perdue sur 20 ans. */
    manqueAGagner: number;
}

export const ANNEES_IMPACT = 20;

/** Effet « papillon » : ce que le coût serait devenu, placé `ANNEES_IMPACT` ans à `rendement` %. */
export function analyserImpact(item: ProjetDeVie, patrimoine: number, rendement: number): Impact {
    const valeurFuture = item.cout * Math.pow(1 + rendement / 100, ANNEES_IMPACT);
    return {
        coutImmediat: item.cout,
        partPatrimoine: patrimoine > 0 ? (item.cout / patrimoine) * 100 : 0,
        coutOpportunite: valeurFuture - item.cout,
        manqueAGagner: valeurFuture,
    };
}

/** Postes de dépense typiques (parts du coût) et conseils, par type de projet. */
const REPARTITIONS: Record<string, { postes: [string, number][]; conseils: string[] }> = {
    MARIAGE: { postes: [['Réception et traiteur', 0.45], ['Lieu et déco', 0.20], ['Photo et vidéo', 0.12], ['Tenues et alliances', 0.13], ['Fleurs et musique', 0.10]], conseils: ['Astuce : Les cadeaux des invités couvrent souvent 40% à 60% des frais de réception.', 'Coût caché : Les pourboires et les taxes sur les services (souvent non inclus dans les devis initiaux).', 'Impact : C\'est une dépense pure, sans ROI financier, mais un investissement émotionnel majeur.'] },
    AUTO: { postes: [['Prix du véhicule', 0.85], ['Taxes et frais', 0.15]], conseils: ['Dépréciation : Votre voiture perdra environ 20% de sa valeur dès la première année.', 'Budget Mensuel : N\'oubliez pas d\'ajouter ~400$/mois au budget pour l\'assurance, l\'essence et l\'entretien.', 'Conseil : Acheter un véhicule de 3 ans permet souvent d\'éviter la plus grosse part de la dépréciation.'] },
    RENOVATION: { postes: [['Matériaux', 0.40], ['Main-d\'œuvre', 0.45], ['Imprévus', 0.15]], conseils: ['ROI : Une cuisine ou salle de bain rénovée récupère environ 75% de son coût à la revente.', 'Attention : Une piscine ne récupère souvent que 10% à 40% de son coût à la revente.', 'Risque : Prévoyez toujours une marge de manœuvre de 15% pour les surprises derrière les murs.'] },
    TRAVEL: { postes: [['Vols et transport', 0.35], ['Hébergement', 0.30], ['Sur place', 0.35]], conseils: ['Flexibilité : Partir un mardi ou mercredi peut réduire le coût des vols de 15-20%.', 'Frais : Utilisez une carte sans frais de conversion devises pour économiser 2.5% sur tout.', 'Coût caché : Les transports locaux (taxi, train) une fois sur place sont souvent sous-estimés.'] },
    GROS_ACHAT: { postes: [['Prix du produit', 0.80], ['Taxes', 0.15], ['Accessoires et entretien', 0.05]], conseils: ['Règle des 30 jours : Pour tout achat > 500$, attendez 30 jours.', 'Obsolescence : Si c\'est de la tech, ça vaudra 50% de moins dans 2 ans.', 'Financement : Si vous financez cet achat, le coût réel peut augmenter de 10-20%.'] },
    SABBATIQUE: { postes: [['Logement', 0.30], ['Nourriture et vie', 0.30], ['Transport et voyage', 0.30], ['Assurances et santé', 0.10]], conseils: ['Coût caché majeur : L\'arrêt des cotisations retraite (RRQ/REER) pendant 1 an a un impact composé énorme.', 'Astuce : Sous-louer votre résidence principale peut couvrir 60% de vos frais fixes.', 'Retour : Prévoyez un \'buffer\' de 2 mois de salaire pour le retour.'] },
    BUSINESS: { postes: [['Développement', 0.40], ['Marketing', 0.30], ['Légal et admin', 0.10], ['Fonds de roulement', 0.20]], conseils: ['Cash is King : La raison #1 de faillite n\'est pas le manque de profit, mais le manque de liquidités.', 'Coût caché : En tant qu\'autonome, vous devez payer la part employeur ET employé de la RRQ.', 'Conseil : Séparez vos comptes bancaires pro et perso dès le jour 1.'] },
    PERTE_EMPLOI: { postes: [['Loyer ou hypothèque', 0.50], ['Nourriture', 0.25], ['Factures fixes', 0.15], ['Recherche d\'emploi', 0.10]], conseils: ['Mode Survie : Coupez immédiatement tout ce qui n\'est pas vital.', 'Délai : L\'assurance emploi a un délai de carence.', 'Conseil : Négociez un report de paiement hypothécaire avec votre banque *avant* d\'être en défaut.'] },
    ACCIDENT: { postes: [['Perte de revenu (net)', 0.60], ['Soins non couverts', 0.30], ['Logistique et aide', 0.10]], conseils: ['RAMQ : La RAMQ ne couvre pas tout (physio, psy, adaptation domicile).', 'Coût caché : Les frais de stationnement à l\'hôpital s\'accumulent vite.', 'Conseil : Vérifiez si vous avez une assurance invalidité longue durée au travail.'] },
    HERITAGE: { postes: [['Investissement', 0.60], ['Remboursement de dettes', 0.30], ['Plaisir', 0.10]], conseils: ['Règle des 6 mois : Ne prenez aucune décision majeure pendant 6 mois.', 'Fiscalité : Au Canada, pas d\'impôt sur les successions pour le bénéficiaire.', 'Stratégie : C\'est le moment idéal pour maximiser vos droits CELI et REER.'] },
    KRACH: { postes: [['Perte latente actions', 0.70], ['Perte latente obligations', 0.30]], conseils: ['Historique : Les marchés baissiers durent en moyenne 10 à 14 mois.', 'Psychologie : Le plus grand risque est de vendre au plus bas.', 'Opportunité : \'Buy the dip\'. C\'est le moment d\'acheter des actifs de qualité à rabais.'] },
};

/** Couleurs des postes (maquettes), dans l'ordre. */
const COULEURS_POSTES = ['#7c93f2', '#34b39a', '#d4a24c', '#e0703a', '#a78bfa'];

export function repartitionEstimee(type: string, montant: number): { nom: string; montant: number; part: number; couleur: string }[] {
    return (REPARTITIONS[type]?.postes ?? []).map(([nom, part], i) => ({ nom, part, montant: montant * part, couleur: COULEURS_POSTES[i % COULEURS_POSTES.length] }));
}

export const conseilsProjet = (type: string): string[] => REPARTITIONS[type]?.conseils ?? [];

/** Change l'ANNÉE d'un projet (mois et jour conservés) — le geste de la frise. */
export function changerAnnee(dateIso: string, annee: number): string {
    return `${annee}${dateIso.slice(4, 10)}`;
}

/** Applique une nouvelle date au voyage ou à l'événement désigné par sa clé. */
export function redater(
    cle: string, date: string, voyages: TravelGoal[], evenements: LifeEvent[],
): { voyages?: TravelGoal[]; evenements?: LifeEvent[] } {
    const id = cle.split('_').slice(1).join('_');
    if (cle.startsWith('travel_')) return { voyages: voyages.map((t) => (t.id === id ? { ...t, date } : t)) };
    return { evenements: evenements.map((e) => (e.id === id ? { ...e, date } : e)) };
}
