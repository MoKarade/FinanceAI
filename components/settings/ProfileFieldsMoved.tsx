// components/settings/ProfileFieldsMoved.tsx
// PH3 — pointeur affiché LÀ où un éditeur de profil a été déplacé vers l'onglet Profil unifié.
// Garde la découvrabilité (« je veux changer mon salaire depuis Impôts → un clic vers Profil »).
import React from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { Tab } from '../../types';

export const ProfileFieldsMoved: React.FC<{ what?: string }> = ({ what = 'Ces réglages' }) => {
    const setActiveTab = useFinanceStore((s) => s.setActiveTab);
    return (
        <button
            type="button"
            onClick={() => setActiveTab(Tab.PROFILE)}
            className="w-full flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-surface/40 px-4 py-3 text-left hover:bg-white/5 transition-colors focus-ring"
        >
            <span className="text-meta text-ink-300">
                {what} sont maintenant regroupés dans l'onglet <span className="font-bold text-ink-100">Profil</span>.
            </span>
            <span className="inline-flex items-center gap-1 text-meta font-bold text-primary shrink-0" aria-hidden="true">
                Ouvrir →
            </span>
        </button>
    );
};
