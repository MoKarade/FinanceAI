// components/aiChat/suggestions.ts
//
// Suggestions d'amorçage de l'assistant — source UNIQUE : le chat (clic = envoi) et l'aperçu de la
// page verrouillée (AssistantVerrouille, libellés seuls) affichent les mêmes.
import type { IconName } from '../ui/Icon';

export const SUGGESTIONS_ASSISTANT: ReadonlyArray<{ icon: IconName; label: string; prompt: string }> = [
    { icon: 'retirement', label: 'Quand retraite ?', prompt: "À quel âge puis-je raisonnablement prendre ma retraite selon mes finances actuelles ?" },
    { icon: 'budget', label: 'Budget sain ?', prompt: "Analyse mes dépenses des 3 derniers mois et dis-moi si mon budget est équilibré. Identifie les 2 catégories où je dépense le plus." },
    { icon: 'investments', label: 'Investir mieux', prompt: "Quelle stratégie d'investissement me recommandes-tu compte tenu de mon âge et de mes objectifs ? CELI ou REER en priorité ?" },
    { icon: 'real-estate', label: 'Acheter maison', prompt: "Suis-je prêt à acheter une propriété ? Quels sont les 3 critères les plus importants à considérer ?" },
];
