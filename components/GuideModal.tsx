
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
                    title: "Machine a Voyager dans le Temps",
                    desc: "Simulation mensuelle de votre vie financiere. Inclut la gestion des objectifs (anciennement onglet Objectifs).",
                    features: [
                        "**Depart en 2026** : Le simulateur projette mois par mois votre avenir a partir de Janvier 2026.",
                        "**Moteur Hybride** : Basculez entre vos donnees reelles (Budget) et des donnees theoriques via les sliders.",
                        "**Enfant & Maison** : Les achats de maison coupent le loyer et activent l'hypotheque. L'enfant coute de l'argent jusqu'a 18 ans avec une pique pour les etudes.",
                        "**Impot Latent** : Represente sous la barre du zero, c'est la dette fiscale accumulee sur vos gains non-realises.",
                        "**Objectifs IA** : Cliquez sur le bouton IA pour que Claude lise vos comptes et vous propose des objectifs pertinents (ex: remplir REER, rembourser telle dette).",
                        "**Connexion Auto** : Un objectif de type 'CELI' se mettra a jour tout seul quand la valeur de votre CELI monte dans le Google Sheet."
                    ],
                    tip: "Survolez le graphique avec la souris : l'info-bulle Expert montre la variation exacte (+/- X$) de votre patrimoine et de vos comptes par rapport au mois precedent !"
                };
            case Tab.INVESTMENTS:
                 return {
                    title: "Investissements & Actifs",
                    desc: "Analyse profonde de votre Google Sheet.",
                    features: [
                        "**Lecture Directe CSV** : Aucune saisie requise. Le systeme lit votre fichier Google et applique un 'Forward Fill' pour combler les trous de donnees.",
                        "**Repartition** : Decouvrez instantanement votre exposition Geographique et Sectorielle.",
                        "**Calendrier de Rente** : Estimation de la date et du montant de vos prochains dividendes."
                    ],
                    tip: "Utilisez le bouton 'Base 100 (%)' sur le graphique pour comparer la performance relative de chaque actif depuis le debut de la periode."
                };
            case Tab.TAX:
                 return {
                    title: "Simulateur Fiscal Verrouille",
                    desc: "Calculateur de l'impot sur le revenu (Quebec/Canada).",
                    features: [
                        "**Sync Globale** : Vos revenus bruts sont directement extraits de l'onglet 'Reglages'. Plus besoin de les saisir manuellement.",
                        "**IA Documentaire** : Deposez vos T4/Releves. L'IA Claude lira les montants d'impots deja payes pour calculer votre remboursement.",
                        "**Paliers Marginaux** : Observez visuellement comment votre dernier dollar est taxe a travers les tranches."
                    ],
                    tip: "Modifiez votre salaire dans Reglages -> Profils, et regardez les barres rouges s'ajuster ici."
                };
            default:
                return {
                    title: "Bienvenue sur FinanceAI",
                    desc: "L'Architecte Patrimonial (v4.0)",
                    features: [
                        "**Local First & Persistance** : Vos donnees restent dans votre navigateur. Si vous changez de page, le systeme sauvegarde votre etat.",
                        "**Mode Discret** : Le bouton Oeil en haut masque absolument tous les montants pour plus d'intimite.",
                        "**Cerveau Central** : La 'Config' (Salaires, Budget) irrigue tous les autres onglets automatiquement."
                    ],
                    tip: "Naviguez sans crainte. Le systeme conserve tout en memoire."
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
                        <h3 className="text-body font-bold text-ink-300 uppercase tracking-widest mb-3">Guide Contextuel</h3>
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
