
// [A11Y-MODAL-GUIDE-NODIALOG] Ce guide était un `<div>` posé par-dessus l'app : aucun `role="dialog"`,
// aucun `aria-modal`, pas de focus initial, pas de piège Tab, pas de restauration du focus à la
// fermeture, pas d'Échap. Il est pourtant atteignable au clavier (palette Cmd+K) — donc un
// utilisateur au clavier pouvait tabuler DANS l'application recouverte, sans rien qui le lui dise.
//
// ⚠️ La documentation affirmait que la migration vers la primitive `<Modal>` était déjà faite
// (`DOC-STALE-IMPOSSIBILITY`). Elle ne l'était pas. Elle l'est ici — et le correctif n'est pas
// d'ajouter les attributs à la main : tout ce qui manquait vit DÉJÀ dans `ui/Modal`, et le
// réécrire localement aurait fabriqué une sixième variante à maintenir.
import React from 'react';
import { Tab } from '../types';
import { Modal } from './ui/Modal';
import { Icon } from './ui/Icon';

interface GuideModalProps {
    activeTab: Tab;
    onClose: () => void;
}

// Parser markdown sûr (anti-XSS): split sur `**...**` en composants React.
function renderBoldMarkdown(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="text-white">{part.slice(2, -2)}</strong>;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
    });
}

export const GuideModal: React.FC<GuideModalProps> = ({ activeTab, onClose }) => {

    const getContent = () => {
        switch (activeTab) {
            // [REFONTE-NAV Lot 1] Cas Tab.DASHBOARD retiré : l'Accueil n'est plus routé
            // (deep-link #DASHBOARD → #FUTURE dans App.tsx).
            case Tab.FUTURE:
                 return {
                    title: "Machine à voyager dans le temps",
                    desc: "Une simulation mois par mois de ta vie financière. Tes objectifs s'y trouvent aussi.",
                    features: [
                        "**Tes vraies données** : la projection part de tes comptes, de ton budget et de tes revenus réels.",
                        "**Enfant et maison** : acheter une maison arrête le loyer et démarre l'hypothèque. Un enfant coûte de l'argent jusqu'à ses 18 ans, avec une hausse pour les études.",
                        "**Impôt latent** : affiché sous la ligne du zéro, c'est l'impôt que tu devras payer sur tes gains pas encore encaissés.",
                        "**Objectifs avec l'IA** : clique sur le bouton IA pour que Claude lise tes comptes et te propose des objectifs (par exemple remplir ton REER ou rembourser une dette)."
                    ],
                    tip: "Passe la souris sur le graphique : la bulle d'info montre de combien ton patrimoine et tes comptes ont changé depuis le mois précédent."
                };
            case Tab.INVESTMENTS:
                 return {
                    title: "Investissements et actifs",
                    desc: "Un regard détaillé sur tes placements.",
                    features: [
                        "**Aucune saisie en double** : tes placements sont lus directement depuis ton fichier, sans que tu aies à les retaper.",
                        "**Répartition** : vois tout de suite où ton argent est placé, par pays et par secteur.",
                        "**Calendrier des revenus** : une estimation de la date et du montant de tes prochains dividendes."
                    ],
                    tip: "Utilise le bouton « Base 100 (%) » sur le graphique pour comparer la performance de chaque placement depuis le début de la période."
                };
            case Tab.TAX:
                 return {
                    title: "Simulateur d'impôt",
                    desc: "Un calcul de ton impôt sur le revenu (Québec et Canada).",
                    features: [
                        "**Revenus repris des réglages** : tes revenus bruts viennent de l'onglet « Réglages ». Pas besoin de les retaper.",
                        "**Documents lus par l'IA** : dépose tes T4 et tes relevés. Claude lit les impôts déjà payés pour calculer ton remboursement.",
                        "**Paliers d'imposition** : vois comment ton dernier dollar gagné est taxé, tranche par tranche."
                    ],
                    tip: "Change ton salaire dans Réglages, puis regarde les barres s'ajuster ici."
                };
            default:
                return {
                    title: "Bienvenue sur FinanceAI",
                    desc: "Ton outil de planification financière.",
                    features: [
                        "**Tes données restent chez toi** : elles sont gardées dans ton navigateur. Si tu changes de page, ton travail est conservé.",
                        "**Mode discret** : le bouton en forme d'œil, en haut, cache tous les montants.",
                        "**Les réglages servent partout** : tes salaires et ton budget alimentent automatiquement tous les autres onglets."
                    ],
                    tip: "Navigue sans crainte : l'application garde tout en mémoire."
                };
        }
    };

    const content = getContent();

    return (
        <Modal
            isOpen
            onClose={onClose}
            size="xl"
            icon={<Icon name="book" size={28} className="text-primary shrink-0" />}
            title={content.title}
            subtitle={content.desc}
            footer={(
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-lg font-bold text-body transition-all focus-ring"
                    >
                        C'est compris !
                    </button>
                </div>
            )}
        >
                <div className="space-y-6">
                    <div>
                        <h3 className="text-body font-bold text-ink-300 uppercase tracking-widest mb-3">Guide de cet onglet</h3>
                        <ul className="space-y-3">
                            {content.features?.map((feat, idx) => (
                                <li key={idx} className="flex gap-3 text-body text-ink-200 leading-relaxed">
                                    <span className="text-info-500 mt-1">●</span>
                                    <span>{renderBoldMarkdown(feat)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {content.tip && (
                        <div className="bg-emerald-900/20 border border-success-500/30 rounded-xl p-4">
                            <div>
                                <h4 className="text-success-400 font-bold text-body mb-1">Astuce</h4>
                                <p className="text-meta text-ink-200 leading-relaxed">{content.tip}</p>
                            </div>
                        </div>
                    )}
                </div>
        </Modal>
    );
};
