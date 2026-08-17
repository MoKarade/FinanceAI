// components/ui/SubTabs.tsx
// [A11Y-SUBTABS-TABPANEL] Le patron de sous-onglets du dépôt, en UN seul endroit.
//
// ⚠️ POURQUOI CE COMPOSANT EXISTE. Trois écrans (`Profile`, `Retirement`, `budget/BudgetWorkspace`)
// avaient recopié le même balisage : un `role="tablist"` et des boutons `role="tab"`. Le motif ARIA
// était INCOMPLET dans les trois — ni `role="tabpanel"`, ni `aria-controls`, ni `aria-labelledby`.
// Un lecteur d'écran annonçait donc « onglet » sans pouvoir relier l'onglet à son contenu.
//
// Corriger trois copies aurait garanti qu'elles divergent : la 4e surface à sous-onglets aurait
// recopié celle qu'elle avait sous les yeux, correcte ou non. Le correctif durable est de retirer
// la copie, pas de la réparer trois fois.
//
// ⚠️ CE QUE LE MOTIF EXIGE, et que le balisage précédent ne donnait pas :
//   • chaque `tab` porte un `id` et un `aria-controls` qui pointe vers son panneau ;
//   • chaque panneau porte `role="tabpanel"`, son `id`, et un `aria-labelledby` qui repointe vers
//     l'onglet — c'est ce lien RÉCIPROQUE qui permet à un lecteur d'écran de dire « panneau X, de
//     l'onglet X », et d'y naviguer directement ;
//   • le panneau est focalisable (`tabIndex={0}`) : sans ça, la touche qui mène « du bandeau
//     d'onglets au contenu » n'a nulle part où atterrir.
//
// ⚠️ Seul le panneau ACTIF est rendu (les écrans montaient déjà leur contenu conditionnellement, et
// certains panneaux sont lourds). C'est conforme au motif ARIA : les panneaux inactifs peuvent être
// absents du DOM plutôt que masqués.
import React from 'react';
import { Icon, type IconName } from './Icon';

export interface SubTabDef<Id extends string> {
    id: Id;
    label: string;
    icon: IconName;
}

interface SubTabsProps<Id extends string> {
    /** Préfixe des `id` DOM — doit être unique par écran, sinon deux écrans montés en même temps
     *  produiraient des `id` en double et `aria-controls` deviendrait ambigu. */
    idPrefix: string;
    /** Nom du groupe d'onglets, annoncé par les lecteurs d'écran (ex. « Sections Profil »). */
    label: string;
    tabs: ReadonlyArray<SubTabDef<Id>>;
    active: Id;
    onSelect: (id: Id) => void;
}

export const tabId = (idPrefix: string, id: string): string => `${idPrefix}-tab-${id}`;
export const panelId = (idPrefix: string, id: string): string => `${idPrefix}-panel-${id}`;

export function SubTabs<Id extends string>({ idPrefix, label, tabs, active, onSelect }: SubTabsProps<Id>) {
    return (
        <div className="flex gap-1 p-0.5 rounded-card bg-black/30 border border-white/5 w-fit overflow-x-auto" role="tablist" aria-label={label}>
            {tabs.map((s) => (
                <button
                    key={s.id}
                    type="button"
                    role="tab"
                    id={tabId(idPrefix, s.id)}
                    aria-controls={panelId(idPrefix, s.id)}
                    aria-selected={active === s.id}
                    onClick={() => onSelect(s.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-meta font-bold rounded whitespace-nowrap transition-colors focus-ring ${active === s.id ? 'bg-primary text-dark' : 'text-ink-300 hover:text-ink-50 hover:bg-white/10'}`}
                >
                    <Icon name={s.icon} size={14} />{s.label}
                </button>
            ))}
        </div>
    );
}

interface TabPanelProps {
    idPrefix: string;
    /** Identifiant de l'onglet auquel ce panneau appartient. */
    tab: string;
    /** Rendu seulement si vrai — le panneau inactif est ABSENT du DOM, pas masqué. */
    when: boolean;
    className?: string;
    children: React.ReactNode;
}

export const TabPanel: React.FC<TabPanelProps> = ({ idPrefix, tab, when, className, children }) => {
    if (!when) return null;
    return (
        <div
            role="tabpanel"
            id={panelId(idPrefix, tab)}
            aria-labelledby={tabId(idPrefix, tab)}
            tabIndex={0}
            className={className ?? 'space-y-6 focus-ring rounded-card'}
        >
            {children}
        </div>
    );
};
