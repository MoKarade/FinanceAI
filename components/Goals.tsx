import React from 'react';
import { Card } from './ui/Card';
import { FinancialGoal, Asset } from '../types';

export const Goals: React.FC<any> = () => {
    return (
        <div className="flex items-center justify-center min-h-[60vh] animate-fade-in">
            <Card className="max-w-md text-center border-l-4 border-l-blue-500">
                <div className="text-5xl mb-6 mt-4">🔮</div>
                <h2 className="text-2xl font-black text-white mb-4">Les Objectifs ont déménagé</h2>
                <p className="text-gray-400 mb-6 text-sm">
                    Afin d'offrir une vision globale et interconnectée, tous vos objectifs se visualisent et se paramétrent désormais directement depuis le <strong>Master Hub : Futur</strong>.
                </p>
            </Card>
        </div>
    );
};
