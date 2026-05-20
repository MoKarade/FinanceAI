import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { analyzeBudgetAI } from '../../services/claude';

export interface BudgetAiPayload {
    totalNetIncome: number;
    totalBudget: number;
    totalSpent: number;
    alerts: string[];
    categories: Array<{ name: string; nature: string; target: number; spent: number }>;
}

interface BudgetAiModalProps {
    apiKey: string;
    payload: BudgetAiPayload;
    onClose: () => void;
}

export const BudgetAiModal: React.FC<BudgetAiModalProps> = ({ apiKey, payload, onClose }) => {
    const [isAnalyzing, setIsAnalyzing] = useState(true);
    const [aiRecommendations, setAiRecommendations] = useState<string[]>([]);

    useEffect(() => {
        let cancelled = false;
        analyzeBudgetAI(payload, apiKey).then(recos => {
            if (!cancelled) {
                setAiRecommendations(recos);
                setIsAnalyzing(false);
            }
        });
        return () => { cancelled = true; };
    }, []);

    return (
        <Modal
            isOpen
            onClose={onClose}
            title="Diagnostic IA du Budget"
            icon="✨"
            size="lg"
        >
            {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-8">
                    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                    <p className="text-sm text-gray-400 mt-4 animate-pulse">L'IA de FinanceAI parcourt vos lignes de budget...</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {aiRecommendations.map((reco, idx) => (
                        <div key={idx} className="bg-white/5 border border-white/10 rounded-lg p-4 flex gap-3 animate-slide-up" style={{ animationDelay: `${idx * 100}ms` }}>
                            <div className="text-indigo-400 mt-0.5" aria-hidden="true">•</div>
                            <p className="text-sm text-gray-200 leading-relaxed">{reco}</p>
                        </div>
                    ))}
                    <button
                        onClick={onClose}
                        className="w-full mt-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition-colors"
                    >
                        Fermer le diagnostic
                    </button>
                </div>
            )}
        </Modal>
    );
};
