
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
                    desc: "Vue unifiée de votre santé financière.",
                    features: [
                        "📊 **Graphique Multi-Comptes** : Visualisez l'évolution séparée de vos liquidités et de votre portefeuille boursier.",
                        "⏱️ **Sélecteur Temporel** : Zoomez dynamiquement. L'axe Y s'ajuste automatiquement (Auto-Scale).",
                        "💰 **Revenus Passifs** : L'accueil calcule les dividendes et intérêts perçus sur le mois sélectionné."
                    ],
                    tip: "Les données boursières proviennent directement de votre Google Sheet en lecture seule. Les dettes ont été intégrées dans la section Crédit."
                };
            case Tab.FUTURE:
                 return {
                    title: "Machine à Voyager dans le Temps",
                    desc: "Simulation mensuelle de votre vie financière.",
                    features: [
                        "📅 **Départ en 2026** : Le simulateur projette mois par mois votre avenir à partir de Janvier 2026.",
                        "🔄 **Moteur Hybride** : Basculez entre vos données réelles (Budget) et des données théoriques via les sliders.",
                        "👶 **Enfant & Maison** : Les achats de maison coupent le loyer et activent l'hypothèque. L'enfant coûte de l'argent jusqu'à 18 ans avec une pique pour les études.",
                        "📉 **Impôt Latent** : Représenté sous la barre du zéro, c'est la dette fiscale accumulée sur vos gains non-réalisés."
                    ],
                    tip: "Survolez le graphique avec la souris : l'info-bulle Expert montre la variation exacte (+/- X$) de votre patrimoine et de vos comptes par rapport au mois précédent !"
                };
            case Tab.INVESTMENTS:
                 return {
                    title: "Investissements & Actifs",
                    desc: "Analyse profonde de votre Google Sheet.",
                    features: [
                        "📈 **Lecture Directe CSV** : Aucune saisie requise. Le système lit votre fichier Google et applique un 'Forward Fill' pour combler les trous de données.",
                        "🌍 **Répartition** : Découvrez instantanément votre exposition Géographique et Sectorielle.",
                        "📆 **Calendrier de Rente** : Estimation de la date et du montant de vos prochains dividendes."
                    ],
                    tip: "Utilisez le bouton 'Base 100 (%)' sur le graphique pour comparer la performance relative de chaque actif depuis le début de la période."
                };
            case Tab.TAX:
                 return {
                    title: "Simulateur Fiscal Verrouillé",
                    desc: "Calculateur de l'impôt sur le revenu (Québec/Canada).",
                    features: [
                        "🔒 **Sync Globale** : Vos revenus bruts sont directement extraits de l'onglet 'Réglages'. Plus besoin de les saisir manuellement.",
                        "🤖 **IA Documentaire** : Déposez vos T4/Relevés. L'IA Gemini lira les montants d'impôts déjà payés pour calculer votre remboursement.",
                        "📊 **Paliers Marginaux** : Observez visuellement comment votre dernier dollar est taxé à travers les tranches."
                    ],
                    tip: "Modifiez votre salaire dans Réglages -> Profils, et regardez les barres rouges s'ajuster ici."
                };
            case Tab.GOALS:
                 return {
                    title: "Objectifs Intelligents",
                    desc: "Cibles dynamiques et IA.",
                    features: [
                        "✨ **IA Stratégie** : Cliquez sur le bouton IA pour que Gemini lise vos comptes et vous propose des objectifs pertinents (ex: remplir REER, rembourser telle dette).",
                        "🔗 **Connexion Auto** : Un objectif de type 'CELI' se mettra à jour tout seul quand la valeur de votre CELI monte dans le Google Sheet."
                    ],
                    tip: "Priorisez vos objectifs. L'app calculera la date d'atteinte estimée en se basant sur votre capacité d'épargne mensuelle."
                };
            default:
                return {
                    title: "Bienvenue sur FinanceAI",
                    desc: "L'Architecte Patrimonial (v4.0)",
                    features: [
                        "💾 **Local First & Persistance** : Vos données restent dans votre navigateur. Si vous changez de page, le système sauvegarde votre état.",
                        "👁️ **Mode Discret** : Le bouton Œil en haut masque absolument tous les montants pour plus d'intimité.",
                        "🧠 **Cerveau Central** : La 'Config' (Salaires, Budget) irrigue tous les autres onglets automatiquement."
                    ],
                    tip: "Naviguez sans crainte. Le système conserve tout en mémoire."
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
                        <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl transition-colors">✕</button>
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
                            <span className="text-2xl">💡</span>
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
