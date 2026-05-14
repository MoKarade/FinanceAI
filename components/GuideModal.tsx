
import React from 'react';
import { Tab } from '../types';

interface GuideModalProps {
    activeTab: Tab;
    onClose: () => void;
}

export const GuideModal: React.FC<GuideModalProps> = ({ activeTab, onClose }) => {

    const getContent = () => {
        switch (activeTab) {
            case Tab.DASHBOARD:
                return {
                    title: "Accueil : Le Hub",
                    desc: "Vue unifiee de votre sante financiere.",
                    features: [
                        "\u{1F4CA} **Graphique Multi-Comptes** : Visualisez l'evolution separee de vos liquidites et de votre portefeuille boursier.",
                        "⏱️ **Selecteur Temporel** : Zoomez dynamiquement. L'axe Y s'ajuste automatiquement (Auto-Scale).",
                        "\u{1F4B0} **Revenus Passifs** : L'accueil calcule les dividendes et interets percus sur le mois selectionne."
                    ],
                    tip: "Les donnees boursieres proviennent directement de votre Google Sheet en lecture seule. Les dettes ont ete integrees dans la section Credit."
                };
            case Tab.FUTURE:
                 return {
                    title: "Machine a Voyager dans le Temps",
                    desc: "Simulation mensuelle de votre vie financiere. Inclut la gestion des objectifs (anciennement onglet Objectifs).",
                    features: [
                        "\u{1F4C5} **Depart en 2026** : Le simulateur projette mois par mois votre avenir a partir de Janvier 2026.",
                        "\u{1F504} **Moteur Hybride** : Basculez entre vos donnees reelles (Budget) et des donnees theoriques via les sliders.",
                        "\u{1F476} **Enfant & Maison** : Les achats de maison coupent le loyer et activent l'hypotheque. L'enfant coute de l'argent jusqu'a 18 ans avec une pique pour les etudes.",
                        "\u{1F4C9} **Impot Latent** : Represente sous la barre du zero, c'est la dette fiscale accumulee sur vos gains non-realises.",
                        "✨ **Objectifs IA** : Cliquez sur le bouton IA pour que Gemini lise vos comptes et vous propose des objectifs pertinents (ex: remplir REER, rembourser telle dette).",
                        "\u{1F517} **Connexion Auto** : Un objectif de type 'CELI' se mettra a jour tout seul quand la valeur de votre CELI monte dans le Google Sheet."
                    ],
                    tip: "Survolez le graphique avec la souris : l'info-bulle Expert montre la variation exacte (+/- X$) de votre patrimoine et de vos comptes par rapport au mois precedent !"
                };
            case Tab.INVESTMENTS:
                 return {
                    title: "Investissements & Actifs",
                    desc: "Analyse profonde de votre Google Sheet.",
                    features: [
                        "\u{1F4C8} **Lecture Directe CSV** : Aucune saisie requise. Le systeme lit votre fichier Google et applique un 'Forward Fill' pour combler les trous de donnees.",
                        "\u{1F30D} **Repartition** : Decouvrez instantanement votre exposition Geographique et Sectorielle.",
                        "\u{1F4C6} **Calendrier de Rente** : Estimation de la date et du montant de vos prochains dividendes."
                    ],
                    tip: "Utilisez le bouton 'Base 100 (%)' sur le graphique pour comparer la performance relative de chaque actif depuis le debut de la periode."
                };
            case Tab.TAX:
                 return {
                    title: "Simulateur Fiscal Verrouille",
                    desc: "Calculateur de l'impot sur le revenu (Quebec/Canada).",
                    features: [
                        "\u{1F512} **Sync Globale** : Vos revenus bruts sont directement extraits de l'onglet 'Reglages'. Plus besoin de les saisir manuellement.",
                        "\u{1F916} **IA Documentaire** : Deposez vos T4/Releves. L'IA Gemini lira les montants d'impots deja payes pour calculer votre remboursement.",
                        "\u{1F4CA} **Paliers Marginaux** : Observez visuellement comment votre dernier dollar est taxe a travers les tranches."
                    ],
                    tip: "Modifiez votre salaire dans Reglages -> Profils, et regardez les barres rouges s'ajuster ici."
                };
            default:
                return {
                    title: "Bienvenue sur FinanceAI",
                    desc: "L'Architecte Patrimonial (v4.0)",
                    features: [
                        "\u{1F4BE} **Local First & Persistance** : Vos donnees restent dans votre navigateur. Si vous changez de page, le systeme sauvegarde votre etat.",
                        "\u{1F441}️ **Mode Discret** : Le bouton Oeil en haut masque absolument tous les montants pour plus d'intimite.",
                        "\u{1F9E0} **Cerveau Central** : La 'Config' (Salaires, Budget) irrigue tous les autres onglets automatiquement."
                    ],
                    tip: "Naviguez sans crainte. Le systeme conserve tout en memoire."
                };
        }
    };

    const content = getContent();

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div
                className="bg-[#151922] border border-white/20 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden relative"
                onClick={e => e.stopPropagation()}
            >
                <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 p-6 border-b border-white/10">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                            <div className="text-4xl">ℹ️</div>
                            <div>
                                <h2 className="text-2xl font-bold text-white">{content.title}</h2>
                                <p className="text-blue-200 text-sm mt-1">{content.desc}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl transition-colors" aria-label="Fermer le guide">✕</button>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    <div>
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">Guide Contextuel</h3>
                        <ul className="space-y-3">
                            {content.features?.map((feat, idx) => (
                                <li key={idx} className="flex gap-3 text-sm text-gray-300 leading-relaxed">
                                    <span className="text-blue-500 mt-1">●</span>
                                    <span dangerouslySetInnerHTML={{ __html: feat.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>') }}></span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {content.tip && (
                        <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4 flex gap-4">
                            <span className="text-2xl">\u{1F4A1}</span>
                            <div>
                                <h4 className="text-emerald-400 font-bold text-sm mb-1">Astuce de Pro</h4>
                                <p className="text-xs text-gray-300 leading-relaxed">{content.tip}</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-white/10 bg-black/20 flex justify-end">
                    <button onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-lg font-bold text-sm transition-all">
                        C'est compris !
                    </button>
                </div>
            </div>
        </div>
    );
};
