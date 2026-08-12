// Bloc « Impôts » de l'infobulle Futur (demande Marc) : impôt dormant (latent) +
// régularisation d'avril. On vérifie l'étiquetage honnête et les signes.
// [R3] ExpertTooltip prend désormais `data` en prop DIRECTE (découplé de Recharts).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExpertTooltip } from '../../../components/projection/ProjectionTooltip';
import type { ProjectionChartPoint } from '../../../services/projection/types';

const pt = (over: Partial<ProjectionChartPoint>): ProjectionChartPoint => ({
    monthIndex: 0,
    dateLabel: 'janv. 2030',
    age: 40,
    NetWorth: 500000,
    ...over,
} as ProjectionChartPoint);

const renderTip = (over: Partial<ProjectionChartPoint>) =>
    render(<ExpertTooltip data={pt(over)} />);

describe('ExpertTooltip — bloc Impôts (impôt dormant + régularisation)', () => {
    it("affiche l'impôt dormant en valeur ABSOLUE (ImpotLatent est négatif dans le moteur)", () => {
        renderTip({ ImpotLatent: -50000 });
        expect(screen.getByText('Impôts')).toBeInTheDocument();
        const row = screen.getByText(/Impôt dormant/).parentElement;
        expect(row).toBeTruthy();
        // jamais de signe « − » : on montre la magnitude, pas l'obligation signée.
        expect(row?.textContent).not.toContain('-');
        expect(row?.textContent).toContain('50');
    });

    it('régularisation positive = solde à payer (libellé « avril », signe −)', () => {
        renderTip({ FluxImpots: 1200 });
        const row = screen.getByText(/Solde d'impôt \(avril\)/).parentElement;
        expect(row?.textContent).toContain('-');
        expect(screen.queryByText(/Remboursement d'impôt/)).toBeNull();
    });

    it('régularisation négative = remboursement (signe +)', () => {
        renderTip({ FluxImpots: -800 });
        const row = screen.getByText(/Remboursement d'impôt/).parentElement;
        expect(row?.textContent).toContain('+');
        expect(screen.queryByText(/Solde d'impôt/)).toBeNull();
    });

    it('aucun bloc Impôts quand dormant et régularisation sont nuls/absents', () => {
        renderTip({ ImpotLatent: 0, FluxImpots: 0 });
        expect(screen.queryByText('Impôts')).toBeNull();
    });

    it('les deux lignes coexistent (dormant + régularisation au même point)', () => {
        renderTip({ ImpotLatent: -120000, FluxImpots: 3400 });
        expect(screen.getByText(/Impôt dormant/)).toBeInTheDocument();
        expect(screen.getByText(/Solde d'impôt \(avril\)/)).toBeInTheDocument();
    });
});

// [FUTUR-DAILY lot B étape 2] Quand le point visé est un JOUR de la courbe (et non un mois).
// ⚠️ CORRECTION DE CAP (Marc, 2026-08-11) : l'infobulle listait tous les jours du mois — c'était
// donner à LIRE, alors que la demande est de SÉLECTIONNER un jour sur le graphe. C'est le graphe
// qui porte désormais les jours ; l'infobulle ne décrit que celui qu'on vise. Ce qui doit tenir :
// un jour à mouvement daté est distingué d'un jour qui ne doit sa variation qu'à l'étalement.
const dayPoint = (over: Partial<ProjectionChartPoint> & {
    isDailyPoint?: boolean; dayLabels?: string[]; dayIsDated?: boolean;
}) => pt(over as Partial<ProjectionChartPoint>);

describe('ExpertTooltip — point QUOTIDIEN sélectionné', () => {
    it('nomme les mouvements du jour visé', () => {
        render(<ExpertTooltip data={dayPoint({ isDailyPoint: true, dayIsDated: true, dayLabels: ['Paie', 'Loyer'] })} />);
        expect(screen.getByText('Ce jour')).toBeInTheDocument();
        expect(screen.getByText('Paie, Loyer')).toBeInTheDocument();
    });

    it("dit explicitement qu'un jour SANS mouvement daté n'est que de l'étalement", () => {
        render(<ExpertTooltip data={dayPoint({ isDailyPoint: true, dayIsDated: false, dayLabels: [] })} />);
        expect(screen.getByText(/croissance, répartie sur le mois/)).toBeInTheDocument();
        expect(screen.queryByText('Ce jour')).toBeNull();
    });

    it("un jour DATÉ sans libellé le dit quand même (un DatedDelta peut n'avoir aucun label)", () => {
        render(<ExpertTooltip data={dayPoint({ isDailyPoint: true, dayIsDated: true, dayLabels: [] })} />);
        expect(screen.getByText('Ce jour')).toBeInTheDocument();
        expect(screen.getByText('Mouvement à date connue')).toBeInTheDocument();
    });

    it("aucun bloc « jour » sur un point MENSUEL (l'immense majorité des survols)", () => {
        render(<ExpertTooltip data={pt({})} />);
        expect(screen.queryByText('Ce jour')).toBeNull();
        expect(screen.queryByText(/croissance, répartie sur le mois/)).toBeNull();
    });
});

// [R3] Pied de page selon l'état figé/survol + bouton « Détail complet ».
describe('ExpertTooltip — figeage (R3)', () => {
    it('au SURVOL (non figé) : invite à figer, aucun bouton « Détail complet »', () => {
        render(<ExpertTooltip data={pt({})} />);
        expect(screen.getByText(/Clique pour figer/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Détail complet/ })).toBeNull();
    });

    it('FIGÉ : affiche le bouton « Détail complet » et déclenche onOpenDetail au clic', () => {
        const onOpenDetail = vi.fn();
        render(<ExpertTooltip data={pt({})} frozen onOpenDetail={onOpenDetail} />);
        const btn = screen.getByRole('button', { name: /Détail complet/ });
        expect(btn).toBeInTheDocument();
        expect(screen.queryByText(/Clique pour figer/)).toBeNull();
        fireEvent.click(btn);
        expect(onOpenDetail).toHaveBeenCalledTimes(1);
    });
});

// [FUTUR-DAILY] Le badge « Variation » ne fabrique plus de zéro.
//
// Finding CRITIQUE de la revue #579 : le badge était rendu SANS garde, sur `data.diffNW || 0`. Un
// point QUOTIDIEN n'ayant pas de `diffNW`, l'infobulle affichait « Variation +0 $ » EN VERT sur
// chaque jour — y compris celui où la paie tombe, pendant que le bas de la même infobulle disait
// correctement « Ce jour : Paie ». C'est le faux zéro crédible que tout ce chantier combat, sur la
// donnée la plus regardée.
describe('ExpertTooltip — badge « Variation » : une absence n’est pas un zéro', () => {
    it('MASQUE le badge quand la variation est inconnue', () => {
        render(<ExpertTooltip data={pt({ diffNW: undefined })} />);
        expect(screen.queryByText(/Variation/)).toBeNull();
    });

    it('affiche un vrai zéro quand la variation VAUT zéro', () => {
        // Distinction essentielle : « je ne sais pas » ≠ « ça n'a pas bougé ».
        render(<ExpertTooltip data={pt({ diffNW: 0 })} />);
        expect(screen.getByText(/Variation/)).toBeInTheDocument();
    });

    it('affiche la variation du JOUR sur un point quotidien qui en porte une', () => {
        render(<ExpertTooltip data={pt({ diffNW: -1250 })} />);
        const badge = screen.getByText(/Variation/);
        expect(badge.textContent).toContain('-1');
        expect(badge.className).toContain('text-red-300');
    });
});

// [FUTUR-DAILY-SELECT-PATH / -STEP] Les deux chemins de sélection offerts DANS l'infobulle figée.
//
// Contexte (capture Marc 2026-08-12, « je peux pas selectionner de jour juste un mois ») : la vue
// au jour exigeait de zoomer sous 6 mois AVANT de cliquer — un seuil que rien n'annonçait au moment
// du clic (3e occurrence de la classe UX-UNREACHABLE sur ce chantier). Désormais :
//   • un MOIS figé offre « Voir ce mois jour par jour » (zoom centré sur le mois cliqué) ;
//   • un JOUR figé offre « Veille / Lendemain » (sélection au jour près sans re-viser au pixel —
//     un jour ≈ 6 px à ~150 jours affichés, mesuré ; et utilisable au doigt, sans molette).
describe('ExpertTooltip — chemins de sélection du jour (pied figé)', () => {
    it('mois FIGÉ : « Voir ce mois jour par jour » est offert et déclenche le zoom', () => {
        const onZoomToDays = vi.fn();
        render(<ExpertTooltip data={pt({})} frozen onZoomToDays={onZoomToDays} />);
        const btn = screen.getByRole('button', { name: /Voir ce mois jour par jour/ });
        fireEvent.click(btn);
        expect(onZoomToDays).toHaveBeenCalledTimes(1);
    });

    it('mois NON figé (survol) : aucun bouton — le tooltip de survol est passif', () => {
        render(<ExpertTooltip data={pt({})} onZoomToDays={vi.fn()} />);
        expect(screen.queryByRole('button', { name: /Voir ce mois jour par jour/ })).toBeNull();
    });

    it('jour FIGÉ : « Veille » et « Lendemain » sélectionnent le jour voisin (−1 / +1)', () => {
        const onStepDay = vi.fn();
        render(<ExpertTooltip data={dayPoint({ isDailyPoint: true })} frozen onStepDay={onStepDay} canStepPrev canStepNext />);
        // ⚠️ [WCAG 2.5.3 label-in-name — finding a11y #589] Le nom accessible DOIT contenir le texte
        // visible : ces requêtes par /Veille|Lendemain/ verrouillent qu'un futur aria-label de
        // REMPLACEMENT (« Jour précédent » seul) casserait le test comme il casserait Dragon.
        fireEvent.click(screen.getByRole('button', { name: /Veille/ }));
        fireEvent.click(screen.getByRole('button', { name: /Lendemain/ }));
        expect(onStepDay).toHaveBeenNthCalledWith(1, -1);
        expect(onStepDay).toHaveBeenNthCalledWith(2, 1);
    });

    it('jour FIGÉ : pas de « Voir ce mois jour par jour » (on y est déjà) et bornes désactivées', () => {
        render(<ExpertTooltip data={dayPoint({ isDailyPoint: true })} frozen onZoomToDays={vi.fn()} onStepDay={vi.fn()} canStepPrev={false} canStepNext />);
        expect(screen.queryByRole('button', { name: /Voir ce mois jour par jour/ })).toBeNull();
        // ⚠️ Un bouton de borne DÉSACTIVÉ (pas absent) : le pied garde sa géométrie, et le lecteur
        // d'écran comprend qu'il n'y a simplement pas de veille dans la fenêtre.
        expect(screen.getByRole('button', { name: /Veille/ })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Lendemain/ })).toBeEnabled();
    });
});

// [FUTUR-TOOLTIP-STICKY-ACTIONS] Le pied d'actions du tooltip FIGÉ est ÉPINGLÉ en bas.
//
// Pas du style : le tooltip défile en interne (`max-h-[480px] overflow-y-auto`) et avec des
// données réelles le pied passait SOUS LE PLI — Marc ne voyait pas « Voir ce mois jour par jour »
// alors qu'il était rendu (capture 2026-08-12). L'e2e n'a rien vu : Playwright scrolle l'élément
// en vue AVANT de cliquer. jsdom ne rend pas de layout → on verrouille l'INTENTION (les classes
// sticky/bottom-0 + fond opaque), ce qui échoue sur le code d'avant (pied dans le flux).
describe('ExpertTooltip — pied d’actions épinglé (visible sans défiler)', () => {
    it('FIGÉ : le conteneur des boutons est sticky bottom-0 avec un fond opaque', () => {
        render(<ExpertTooltip data={pt({})} frozen onZoomToDays={vi.fn()} onOpenDetail={vi.fn()} />);
        const footer = screen.getByRole('button', { name: /Détail complet/ }).closest('div.sticky');
        expect(footer).not.toBeNull();
        expect(footer!.className).toContain('bottom-0');
        // Fond opaque : sans lui, le contenu scrollé transparaîtrait sous les boutons.
        expect(footer!.className).toMatch(/bg-\[#0d1118\]/);
    });

    it('SURVOL : pas de pied d’actions du tout (rien à épingler)', () => {
        render(<ExpertTooltip data={pt({})} onZoomToDays={vi.fn()} />);
        expect(screen.queryByRole('button', { name: /Détail complet/ })).toBeNull();
    });
});
