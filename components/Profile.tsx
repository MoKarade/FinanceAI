// components/Profile.tsx
// PH3 (brief Marc) — Onglet PROFIL UNIFIÉ : regroupe TOUT le setup utilisateur (identité, salaire,
// fiscal, répartition couple, carrière & rémunération variable, paramètres de retraite, enfants),
// jusqu'ici éparpillé dans Configuration, Impôts, Budget, Retraite, Enfant. Migration UI PURE :
// chaque sous-composant lit/écrit les MÊMES clés store qu'avant → ZÉRO perte de données.
//
// [PROFIL-SOUS-ONGLETS 2026-08-17] Les cinq groupes empilés deviennent QUATRE sous-onglets.
// Découpage choisi par Marc (`docs/adr/0012-quatre-decisions-de-marc-2026-08-17.md`) : Identité · Revenus · Profils enregistrés.
// ⚠️ Ses trois bacs ne couvraient pas Retraite ni Enfants — d'où un 4e onglet plutôt que de les
// rétrograder sous « Revenus » (faux : ce ne sont pas des revenus d'aujourd'hui) ou de les perdre.
// Écart signalé à Marc, pas décidé en silence.
//
// ⚠️ Idiome REPRIS de `Retirement.tsx` / `BudgetWorkspace.tsx` (Lots 4 et 5), à l'identique :
// `role="tablist"` + boutons `role="tab"`. Ne PAS inventer un 4e patron de sous-onglets dans le
// dépôt — la cohérence de navigation compte plus qu'une amélioration locale. La lacune commune aux
// trois (pas de `role="tabpanel"` ni d'`aria-controls`) est réelle mais se corrige en UN ticket sur
// les trois écrans, pas en divergeant ici : `[A11Y-SUBTABS-TABPANEL]`.
import React, { useState } from 'react';
import { useFinanceStore } from '../store/useFinanceStore';
import { PageHeader } from './ui/PageHeader';
import { Icon, type IconName } from './ui/Icon';
import { SubTabs, TabPanel } from './ui/SubTabs';
import { UsersCard } from './settings/sections/UsersCard';
import { SavedProfilesCard } from './profile/SavedProfilesCard';
import { UserConfigFields, RepartitionField } from './settings/UserConfigFields';
import { RetirementSettingsCard } from './retirement/RetirementSettingsCard';
import { RetirementIncomeCard } from './retirement/RetirementIncomeCard';

type ProfileSubTab = 'identite' | 'revenus' | 'retraite' | 'profils';

const PROFILE_SUB_TABS: ReadonlyArray<{ id: ProfileSubTab; label: string; icon: IconName }> = [
    { id: 'identite', label: 'Identité', icon: 'users' },
    { id: 'revenus', label: 'Revenus', icon: 'cash' },
    { id: 'retraite', label: 'Retraite & enfants', icon: 'retirement' },
    { id: 'profils', label: 'Profils enregistrés', icon: 'settings' },
];

/** Petit intertitre de regroupement (les sous-composants rendent déjà leurs propres Cards). */
const GroupTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h2 className="text-meta font-bold uppercase tracking-wider text-ink-400 mt-2 -mb-1 px-1">{children}</h2>
);

export const Profile: React.FC = () => {
    const config = useFinanceStore((s) => s.config);
    const setConfig = (c: typeof config) => useFinanceStore.getState().setAppState({ config: c });
    const [subTab, setSubTab] = useState<ProfileSubTab>('identite');

    return (
        <div className="space-y-6 stagger-in pb-20">
            <PageHeader
                icon={<Icon name="settings" size={28} />}
                title="Profil"
                subtitle="Toutes tes infos personnelles en un seul endroit — elles alimentent Impôts, Retraite, Futur et le reste."
            />

            <SubTabs<ProfileSubTab>
                idPrefix="profil"
                label="Sections Profil"
                tabs={PROFILE_SUB_TABS}
                active={subTab}
                onSelect={setSubTab}
            />

            {/* [IA-DEDUP-COMPLETUDE] La complétude (SetupHub) vit UNIQUEMENT dans Configuration
                (audit UX 2026-06-17 : doublon Profil+Config). Ici = uniquement les champs à remplir. */}
            <TabPanel idPrefix="profil" tab="identite" when={subTab === 'identite'}>
                <UsersCard config={config} setConfig={setConfig} />
            </TabPanel>

            <TabPanel idPrefix="profil" tab="revenus" when={subTab === 'revenus'}>
                    <GroupTitle>Revenus &amp; fiscalité</GroupTitle>
                    <UserConfigFields section="salary" />
                    <UserConfigFields section="fiscal" />
                    <RepartitionField />

                    {/* PH3-c — champs santé/civil/emploi morts purgés ; reste carrière + rémunération variable. */}
                    <GroupTitle>Carrière &amp; rémunération variable</GroupTitle>
                    <UserConfigFields section="detailed" />
            </TabPanel>

            <TabPanel idPrefix="profil" tab="retraite" when={subTab === 'retraite'}>
                    <GroupTitle>Retraite</GroupTitle>
                    <RetirementSettingsCard />
                    <RetirementIncomeCard />

                    <GroupTitle>Enfants</GroupTitle>
                    <UserConfigFields section="children" />
            </TabPanel>

            <TabPanel idPrefix="profil" tab="profils" when={subTab === 'profils'}>
                <SavedProfilesCard config={config} setConfig={setConfig} />
            </TabPanel>
        </div>
    );
};
