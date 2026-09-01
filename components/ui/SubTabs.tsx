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
// ⚠️ [A11Y-TABLIST-NO-PANEL] LE CLAVIER FAIT PARTIE DU MOTIF, et il manquait aux quatre bandeaux.
// Le motif ARIA « tabs » ne dit pas seulement comment étiqueter : il dit que le bandeau se parcourt
// aux FLÈCHES, pas à la touche de tabulation. Concrètement, `tabIndex` roving — un seul onglet dans
// l'ordre de tabulation, celui qui est actif — plus Gauche/Droite (avec bouclage), Début et Fin.
// Sans ça, atteindre le 4e onglet coûte quatre tabulations et traverse tout le bandeau ; avec, la
// tabulation sort du bandeau vers le CONTENU, ce qui est le geste utile.
//
// ⚠️ Le clavier vit ICI, exporté, parce qu'un cinquième bandeau le recopierait sinon — c'est
// exactement l'histoire de ce fichier, né de trois copies divergentes. `FutureProjection` garde son
// bandeau à lui (libellés en emoji, autre habillage) mais consomme la MÊME logique de touches.
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

/**
 * Le clavier du motif ARIA « tabs » : Gauche/Droite avec bouclage, Début, Fin.
 *
 * ⚠️ Rendre un `onKeyDown` à poser sur le CONTENEUR, pas sur chaque onglet : posé sur l'onglet, il
 * ne se déclenche que si cet onglet a le focus — ce qui est vrai ici, mais devient faux dès qu'un
 * bandeau contient autre chose qu'des onglets. Le conteneur est le porteur du motif.
 *
 * ⚠️ L'activation est AUTOMATIQUE (la flèche sélectionne, elle ne fait pas que déplacer le focus) :
 * c'est le comportement par défaut du motif, et le seul cohérent avec des panneaux dont un seul est
 * monté — un focus sans sélection laisserait l'utilisateur devant le panneau d'un autre onglet.
 */
export function clavierTablist<Id extends string>(
    idPrefix: string,
    ids: ReadonlyArray<Id>,
    actif: Id,
    onSelect: (id: Id) => void,
): (e: React.KeyboardEvent) => void {
    return (e) => {
        const courant = ids.indexOf(actif);
        if (courant < 0 || ids.length === 0) return;
        let cible: number;
        if (e.key === 'ArrowRight') cible = (courant + 1) % ids.length;
        else if (e.key === 'ArrowLeft') cible = (courant - 1 + ids.length) % ids.length;
        else if (e.key === 'Home') cible = 0;
        else if (e.key === 'End') cible = ids.length - 1;
        else return;
        e.preventDefault();
        const suivant = ids[cible];
        onSelect(suivant);
        // Le focus SUIT la sélection : sans ça, la flèche suivante repartirait de l'ancien onglet.
        // Différé d'une frame — l'onglet cible n'a pas encore été re-rendu au moment de la touche.
        requestAnimationFrame(() => document.getElementById(tabId(idPrefix, suivant))?.focus());
    };
}

export function SubTabs<Id extends string>({ idPrefix, label, tabs, active, onSelect }: SubTabsProps<Id>) {
    return (
        <div
            className="flex gap-1 p-0.5 rounded-card bg-black/30 border border-white/5 w-fit overflow-x-auto"
            role="tablist"
            aria-label={label}
            onKeyDown={clavierTablist(idPrefix, tabs.map((t) => t.id), active, onSelect)}
        >
            {tabs.map((s) => (
                <button
                    key={s.id}
                    type="button"
                    role="tab"
                    id={tabId(idPrefix, s.id)}
                    aria-controls={panelId(idPrefix, s.id)}
                    aria-selected={active === s.id}
                    // `tabIndex` roving : un SEUL onglet dans l'ordre de tabulation. La tabulation
                    // sort alors du bandeau vers le contenu, et les flèches parcourent les onglets.
                    tabIndex={active === s.id ? 0 : -1}
                    onClick={() => onSelect(s.id)}
                    // [A11Y-SUBTABS-TOUCH-TARGET] `touch-target` (44×44, index.css) : sans lui, `py-1.5`
                    // + une interligne de 16 px donnent 28 px de haut — sous le plancher WCAG 2.5.5.
                    // Le correctif vit ICI parce que les trois écrans à sous-onglets passent par ce
                    // composant : une seule ligne, trois surfaces.
                    className={`touch-target inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-meta font-bold rounded whitespace-nowrap transition-colors focus-ring ${active === s.id ? 'bg-primary text-dark' : 'text-ink-300 hover:text-ink-50 hover:bg-white/10'}`}
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
