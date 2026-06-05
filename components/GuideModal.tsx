
import React from 'react';
import { Tab } from '../types';

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
            case Tab.DASHBOARD:
                return {
                    title: "Accueil : Le Hub",
                    desc: "Vue unifiee de votre sante financiere.",
                    features: [
                        "📊 **Graphique Multi-Comptes** : Visualisez l'evolution separee de vos liquidites et de votre portefeuille boursier.",
                        "⏱️ **Selecteur Temporel** : Zoomez dynamiquement. L'axe Y s'ajuste automatiquement (Auto-Scale).",
                        "💰 **Revenus Passifs** : L'accueil calcule les dividendes et interets percus sur le mois selectionne."
                    ],
                    tip: "Les donnees boursieres proviennent directement de votre Google Sheet en lecture seule. Les dettes ont ete integrees dans la section Credit."
                };
            case Tab.FUTURE:
                 return {
                    title: "Machine a Voyager dans le Temps",
                    desc: "Simulation mensuelle de votre vie financiere. Inclut la gestion des objectifs (anciennement onglet Objectifs).",
                    features: [
                        "📅 **Depart en 2026** : Le simulateur projette mois par mois votre avenir a partir de Janvier 2026.",
                        "🔄 **Moteur Hybride** : Basculez entre vos donnees reelles (Budget) et des donnees theoriques via les sliders.",
                        "👶 **Enfant & Maison** : Les achats de maison coupent le loyer et activent l'hypotheque. L'enfant coute de l'argent jusqu'a 18 ans avec une pique pour les etudes.",
                        "📉 **Impot Latent** : Represente sous la barre du zero, c'est la dette fiscale accumulee sur vos gains non-realises.",
                        "✨ **Objectifs IA** : Cliquez sur le bouton IA pour que Claude lise vos comptes et vous propose des objectifs pertinents (ex: remplir REER, rembourser telle dette).",
                        "🔗 **Connexion Auto** : Un objectif de type 'CELI' se mettra a jour tout seul quand la valeur de votre CELI monte dans le Google Sheet."
                    ],
                    tip: "Survolez le graphique avec la souris : l'info-bulle Expert montre la variation exacte (+/- X$) de votre patrimoine et de vos comptes par rapport au mois precedent !"
                };
            case Tab.INVESTMENTS:
                 return {
                    title: "Investissements & Actifs",
                    desc: "Analyse profonde de votre Google Sheet.",
                    features: [
                        "📈 **Lecture Directe CSV** : Aucune saisie requise. Le systeme lit votre fichier Google et applique un 'Forward Fill' pour combler les trous de donnees.",
                        "🌍 **Repartition** : Decouvrez instantanement votre exposition Geographique et Sectorielle.",
                        "📆 **Calendrier de Rente** : Estimation de la date et du montant de vos prochains dividendes."
                    ],
                    tip: "Utilisez le bouton 'Base 100 (%)' sur le graphique pour comparer la performance relative de chaque actif depuis le debut de la periode."
                };
            case Tab.TAX:
                 return {
                    title: "Simulateur Fiscal Verrouille",
                    desc: "Calculateur de l'impot sur le revenu (Quebec/Canada).",
                    features: [
                        "🔒 **Sync Globale** : Vos revenus bruts sont directement extraits de l'onglet 'Reglages'. Plus besoin de les saisir manuellement.",
                        "🤖 **IA Documentaire** : Deposez vos T4/Releves. L'IA Claude lira les montants d'impots deja payes pour calculer votre remboursement.",
                        "📊 **Paliers Marginaux** : Observez visuellement comment votre dernier dollar est taxe a travers les tranches."
                    ],
                    tip: "Modifiez votre salaire dans Reglages -> Profils, et regardez les barres rouges s'ajuster ici."
                };
            default:
                return {
                    title: "Bienvenue sur FinanceAI",
                    desc: "L'Architecte Patrimonial (v4.0)",
                    features: [
                        "💾 **Local First & Persistance** : Vos donnees restent dans votre navigateur. Si vous changez de page, le systeme sauvegarde votre etat.",
                        "👁️ **Mode Discret** : Le bouton Oeil en haut masque absolument tous les montants pour plus d'intimite.",
                        "🧠 **Cerveau Central** : La 'Config' (Salaires, Budget) irrigue tous les autres onglets automatiquement."
                    ],
                    tip: "Naviguez sans crainte. Le systeme conserve tout en memoire."
                };
        }
    };

    const content = getContent();

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div
                className="bg-surface border border-white/20 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden relative"
                onClick={e => e.stopPropagation()}
            >
                <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 p-6 border-b border-white/10">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                            <div className="text-4xl">ℹ️</div>
                            <div>
                                <h2 className="text-2xl font-bold text-white">{content.title}</h2>
                                <p className="text-blue-200 text-body mt-1">{content.desc}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="text-ink-300 hover:text-white text-2xl transition-colors" aria-label="Fermer le guide">✕</button>
                    </div>
                </div>

                <div className="p-6 space-y-6">
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
                        <div className="bg-emerald-900/20 border border-success-500/30 rounded-xl p-4 flex gap-4">
                            <span className="text-2xl">💡</span>
                            <div>
                                <h4 className="text-success-400 font-bold text-body mb-1">Astuce de Pro</h4>
                                <p className="text-meta text-ink-200 leading-relaxed">{content.tip}</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-white/10 bg-black/20 flex justify-end">
                    <button onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-lg font-bold text-body transition-all">
                        C'est compris !
                    </button>
                </div>
            </div>
        </div>
    );
};
