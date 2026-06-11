// components/Profile.tsx
// PH3 (brief Marc) — Onglet PROFIL UNIFIÉ : regroupe TOUT le setup utilisateur (identité, salaire,
// fiscal, répartition couple, profil détaillé santé/carrière, paramètres de retraite, enfants),
// jusqu'ici éparpillé dans Configuration, Impôts, Budget, Retraite, Enfant. Migration UI PURE :
// chaque sous-composant lit/écrit les MÊMES clés store qu'avant → ZÉRO perte de données.
import React from 'react';
import { useFinanceStore } from '../store/useFinanceStore';
import { PageHeader } from './ui/PageHeader';
import { Icon } from './ui/Icon';
import { UsersCard } from './settings/sections/UsersCard';
import { UserConfigFields, RepartitionField } from './settings/UserConfigFields';
import { RetirementSettingsCard } from './retirement/RetirementSettingsCard';

/** Petit intertitre de regroupement (les sous-composants rendent déjà leurs propres Cards). */
const GroupTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h2 className="text-meta font-bold uppercase tracking-wider text-ink-400 mt-2 -mb-1 px-1">{children}</h2>
);

export const Profile: React.FC = () => {
    const config = useFinanceStore((s) => s.config);
    const setConfig = (c: typeof config) => useFinanceStore.getState().setAppState({ config: c });

    return (
        <div className="space-y-6 stagger-in pb-20">
            <PageHeader
                icon={<Icon name="settings" size={28} />}
                title="Profil"
                subtitle="Toutes tes infos personnelles en un seul endroit — elles alimentent Impôts, Retraite, Futur et le reste."
            />

            <GroupTitle>Identité</GroupTitle>
            <UsersCard config={config} setConfig={setConfig} />

            <GroupTitle>Revenus &amp; fiscalité</GroupTitle>
            <UserConfigFields section="salary" />
            <UserConfigFields section="fiscal" />
            <RepartitionField />

            <GroupTitle>Profil détaillé (santé, carrière)</GroupTitle>
            <UserConfigFields section="detailed" />

            <GroupTitle>Retraite</GroupTitle>
            <RetirementSettingsCard />

            <GroupTitle>Enfants</GroupTitle>
            <UserConfigFields section="children" />
        </div>
    );
};
