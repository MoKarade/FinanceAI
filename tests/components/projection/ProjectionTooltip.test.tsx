// Bloc « Impôts » de l'infobulle Futur (demande Marc) : impôt dormant (latent) +
// régularisation d'avril. On vérifie l'étiquetage honnête et les signes.
// ⚠️ [FUTUR-PANNEAU-FIXE 2026-09-18] Ces gardes visaient l'infobulle FLOTTANTE, qui n'existe plus.
// Le contenu — blocs Impôts, badge Variation, détail du jour — est désormais rendu par le PANNEAU
// FIXE sous le graphe, et c'est LUI qu'on monte ici. Les assertions de CONTENU sont inchangées :
// elles portent sur des faits qui n'ont pas bougé. Celles qui décrivaient la MÉCANIQUE de
// l'infobulle (« Clique pour figer », pied collant, flèches réservées à l'état figé) ont été
// INVERSÉES au même endroit, avec leur histoire — les supprimer laisserait croire que ces
// exigences n'ont jamais existé (`UN-TEST-DE-LIMITE-S-INVERSE-IL-NE-SE-SUPPRIME-PAS`).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderPanneauJour } from '../../helpers/panneauJour';
import type { ProjectionChartPoint } from '../../../services/projection/types';

const pt = (over: Partial<ProjectionChartPoint>): ProjectionChartPoint => ({
    monthIndex: 0,
    dateLabel: 'janv. 2030',
    age: 40,
    NetWorth: 500000,
    ...over,
} as ProjectionChartPoint);

const renderTip = (over: Partial<ProjectionChartPoint>) => renderPanneauJour(pt(over));

describe('PanneauJour — bloc Impôts (impôt dormant + régularisation)', () => {
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

describe('PanneauJour — point QUOTIDIEN sélectionné', () => {
    it('nomme les mouvements du jour visé', () => {
        renderPanneauJour(dayPoint({ isDailyPoint: true, dayIsDated: true, dayLabels: ['Paie', 'Loyer'] }));
        expect(screen.getByText('Ce jour')).toBeInTheDocument();
        expect(screen.getByText('Paie, Loyer')).toBeInTheDocument();
    });

    it("dit explicitement qu'un jour SANS mouvement daté n'est que de l'étalement", () => {
        renderPanneauJour(dayPoint({ isDailyPoint: true, dayIsDated: false, dayLabels: [] }));
        // [FUTUR-INFOBULLE-EPUREE] Phrase raccourcie (demande Marc : « quasiment pas de texte »),
        // mais l'AFFIRMATION reste la même — et sa version longue reste au survol (`title`).
        const ligne = screen.getByText(/croissance étalée/);
        expect(ligne).toBeInTheDocument();
        expect(ligne.getAttribute('title')).toMatch(/croissance, répartie sur le mois/);
        expect(screen.queryByText('Ce jour')).toBeNull();
    });

    it("un jour DATÉ sans libellé le dit quand même (un DatedDelta peut n'avoir aucun label)", () => {
        renderPanneauJour(dayPoint({ isDailyPoint: true, dayIsDated: true, dayLabels: [] }));
        expect(screen.getByText('Ce jour')).toBeInTheDocument();
        expect(screen.getByText('Mouvement à date connue')).toBeInTheDocument();
    });

    it("aucun bloc « jour » sur un point MENSUEL (l'immense majorité des survols)", () => {
        renderPanneauJour(pt({}));
        expect(screen.queryByText('Ce jour')).toBeNull();
        expect(screen.queryByText(/croissance étalée/)).toBeNull();
    });
});

// ⚠️ INVERSION DE `[R3] figeage`. L'ancienne règle était « au survol, l'infobulle n'est qu'un
// aperçu : pas d'actions, une invite à figer ». Elle existait parce qu'un objet qui suit le curseur
// est INATTEIGNABLE à la souris — viser son bouton le déplace. Le panneau étant dans le flux du
// document, la contrainte disparaît : ses actions sont cliquables dans les trois états. Ce qui
// reste vrai, et que le test garde, c'est que l'ÉTAT est ANNONCÉ — trois situations qui se
// ressemblent à l'écran (aujourd'hui / aperçu / épinglé) et ne veulent pas dire la même chose.
describe('PanneauJour — l’origine du jour affiché est annoncée, et les actions restent cliquables', () => {
    it('au SURVOL : le panneau dit que c’est un aperçu, et « Détail complet » reste actionnable', () => {
        renderPanneauJour(pt({}), { origine: 'survol' });
        expect(screen.getByText(/Aperçu/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Détail complet/ })).toBeInTheDocument();
    });

    it('ÉPINGLÉ : le panneau le dit, et « Détail complet » déclenche onOpenDetail au clic', () => {
        const onOpenDetail = vi.fn();
        renderPanneauJour(pt({}), { origine: 'epingle', onOpenDetail });
        expect(screen.getByText(/Jour épinglé/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Détail complet/ }));
        expect(onOpenDetail).toHaveBeenCalledTimes(1);
    });

    it('AU REPOS : le panneau montre aujourd’hui et ne propose PAS de relâcher une épingle', () => {
        renderPanneauJour(pt({}), { origine: 'ancre' });
        expect(screen.getByText(/Aujourd’hui/)).toBeInTheDocument();
        // ⚠️ Le bouton de retour n'existe que quand il y a quelque chose à défaire : proposé au
        // repos, il serait un no-op déguisé — un contrôle qui ne change rien apprend à être ignoré.
        expect(screen.queryByRole('button', { name: /Revenir à aujourd/ })).toBeNull();
    });
});

// [FUTUR-DAILY] Le badge « Variation » ne fabrique plus de zéro.
//
// Finding CRITIQUE de la revue #579 : le badge était rendu SANS garde, sur `data.diffNW || 0`. Un
// point QUOTIDIEN n'ayant pas de `diffNW`, l'infobulle affichait « Variation +0 $ » EN VERT sur
// chaque jour — y compris celui où la paie tombe, pendant que le bas de la même infobulle disait
// correctement « Ce jour : Paie ». C'est le faux zéro crédible que tout ce chantier combat, sur la
// donnée la plus regardée.
describe('PanneauJour — badge « Variation » : une absence n’est pas un zéro', () => {
    it('MASQUE le badge quand la variation est inconnue', () => {
        renderPanneauJour(pt({ diffNW: undefined }));
        expect(screen.queryByText(/Variation/)).toBeNull();
    });

    it('affiche un vrai zéro quand la variation VAUT zéro', () => {
        // Distinction essentielle : « je ne sais pas » ≠ « ça n'a pas bougé ».
        renderPanneauJour(pt({ diffNW: 0 }));
        expect(screen.getByText(/Variation/)).toBeInTheDocument();
    });

    it('affiche la variation du JOUR sur un point quotidien qui en porte une', () => {
        renderPanneauJour(pt({ diffNW: -1250 }));
        const badge = screen.getByText(/Variation/);
        expect(badge.textContent).toContain('-1');
        expect(badge.className).toContain('text-red-300');
    });
});

// [FUTUR-DAILY-NATIVE] Sélection du jour DANS l'infobulle figée. Le bouton « Voir ce mois jour
// par jour » ([FUTUR-DAILY-SELECT-PATH]) a été RETIRÉ : la courbe est au jour partout, le clic
// sélectionne directement le jour. Restent les flèches « Veille / Lendemain » (sélection au jour
// près sans re-viser au pixel — utilisables au doigt, sans molette).
describe('PanneauJour — navigation d’un jour à l’autre', () => {
    it('le bouton « Voir ce mois jour par jour » n\'existe PLUS (courbe au jour native)', () => {
        renderPanneauJour(pt({}));
        expect(screen.queryByRole('button', { name: /Voir ce mois jour par jour/ })).toBeNull();
    });

    // ⚠️ INVERSION. L'ancienne règle réservait Veille/Lendemain à l'infobulle FIGÉE, ce qui était
    // cohérent : hors gel, l'infobulle suivait le curseur et n'était pas cliquable. Le panneau,
    // lui, est toujours là — et au repos il montre AUJOURD'HUI. Des flèches inertes tant que rien
    // n'est épinglé les auraient rendues mortes exactement à l'ouverture de l'écran, le seul moment
    // garanti. Elles marchent donc dans les trois états.
    it('les flèches sélectionnent le jour voisin MÊME au repos (origine « ancre »)', () => {
        const onStep = vi.fn();
        renderPanneauJour(dayPoint({ isDailyPoint: true }), { origine: 'ancre', onStep });
        // ⚠️ [WCAG 2.5.3 label-in-name — finding a11y #589] Le nom accessible DOIT contenir le texte
        // visible : ces requêtes par /Veille|Lendemain/ verrouillent qu'un futur aria-label de
        // REMPLACEMENT (« Jour précédent » seul) casserait le test comme il casserait Dragon.
        fireEvent.click(screen.getByRole('button', { name: /Veille/ }));
        fireEvent.click(screen.getByRole('button', { name: /Lendemain/ }));
        // ⚠️ Le PAS voyage avec la direction : sans lui, le parent ne saurait pas de combien
        // avancer, et « Année » retomberait silencieusement sur un jour.
        expect(onStep).toHaveBeenNthCalledWith(1, -1, 'jour');
        expect(onStep).toHaveBeenNthCalledWith(2, 1, 'jour');
    });

    it('le PAS choisi est transmis aux flèches (jour / mois / année)', () => {
        const onStep = vi.fn();
        renderPanneauJour(dayPoint({ isDailyPoint: true }), { onStep, pas: 'annee' });
        fireEvent.click(screen.getByRole('button', { name: /Lendemain/ }));
        expect(onStep).toHaveBeenCalledWith(1, 'annee');
    });

    it('changer de pas remonte le choix au parent (c’est lui qui borne les flèches)', () => {
        const onPasChange = vi.fn();
        renderPanneauJour(dayPoint({ isDailyPoint: true }), { onPasChange });
        fireEvent.click(screen.getByRole('button', { name: 'Mois' }));
        expect(onPasChange).toHaveBeenCalledWith('mois');
    });

    it('borne atteinte = bouton DÉSACTIVÉ (pas absent)', () => {
        renderPanneauJour(dayPoint({ isDailyPoint: true }), { canStepPrev: false, canStepNext: true });
        // ⚠️ Un bouton de borne DÉSACTIVÉ (pas absent) : la barre garde sa géométrie, et le lecteur
        // d'écran comprend qu'il n'y a simplement pas de veille dans la fenêtre.
        expect(screen.getByRole('button', { name: /Veille/ })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Lendemain/ })).toBeEnabled();
    });
});

// ⚠️ INVERSION de `[FUTUR-TOOLTIP-STICKY-ACTIONS]`, et il faut lire POURQUOI avant de croire
// qu'on a perdu une protection.
//
// La règle d'origine : le pied d'actions de l'infobulle figée devait être `sticky bottom-0` sur
// fond opaque, parce que l'infobulle défilait EN INTERNE (`max-h` + `overflow-y-auto`) et qu'avec
// des données réelles le pied passait sous le pli — Marc ne voyait pas les boutons alors qu'ils
// étaient rendus (capture 2026-08-12). L'e2e ne l'avait jamais vu : Playwright fait défiler
// l'élément en vue AVANT de cliquer, donc le robot payait un chemin que l'humain ne voit pas.
//
// Ce qui a changé : le panneau vit dans le FLUX du document et ne défile pas en interne. Il n'y a
// plus de pli à franchir, donc plus rien à épingler — et remettre un `sticky` ici recréerait le
// problème qu'il résolvait. La garde vérifie donc le FAIT qui rend la règle caduque, pas sa forme
// disparue : le panneau n'a pas de hauteur bornée ni de défilement interne.
describe('PanneauJour — les actions sont atteignables sans défilement interne', () => {
    it('le panneau ne borne pas sa hauteur et ne défile pas en interne', () => {
        const { container } = renderPanneauJour(pt({}));
        const racine = container.querySelector('[data-panneau-jour]');
        expect(racine).not.toBeNull();
        expect(racine!.className).not.toMatch(/max-h-/);
        expect(racine!.className).not.toMatch(/overflow-y-auto/);
    });

    it('les actions sont rendues dans les trois origines (rien à « figer » d’abord)', () => {
        for (const origine of ['ancre', 'survol', 'epingle'] as const) {
            const { unmount } = renderPanneauJour(pt({}), { origine });
            expect(screen.getByRole('button', { name: /Détail complet/ })).toBeInTheDocument();
            unmount();
        }
    });
});

// [A11Y-FUTUR-MILESTONES-KEYBOARD] Décision Marc : les pastilles d'événement sont FOCUSABLES
// (tabIndex -1 les rendait inatteignables au clavier — WCAG 2.1.1). Entrée/Espace = même action
// que le clic, aria-label DATÉ, anneau de focus SVG (l'outline CSS sur un <g> est invisible
// dans certains moteurs).
import { ClickableEventIcon } from '../../../components/projection/ProjectionTooltip';
import { fireEvent as fe } from '@testing-library/react';

describe('ClickableEventIcon — clavier (A11Y-FUTUR-MILESTONES-KEYBOARD)', () => {
    const renderIcon = (onSelect = vi.fn()) => {
        const { container } = render(
            <svg>
                <ClickableEventIcon
                    cx={100} cy={50}
                    payload={{ label: '✈️ Voyage (Rome): -4 000$', subIdx: 0, dateLabel: 'sept. 2031' }}
                    onSelect={onSelect}
                    kind="life"
                />
            </svg>,
        );
        const g = container.querySelector('g[role="button"]')!;
        return { g, onSelect };
    };

    it('est FOCUSABLE (tabIndex 0) avec un aria-label DATÉ', () => {
        const { g } = renderIcon();
        expect(g.getAttribute('tabindex')).toBe('0');
        expect(g.getAttribute('aria-label')).toBe('Événement : ✈️ Voyage (Rome): -4 000$ — sept. 2031');
    });

    it('Entrée et Espace déclenchent onSelect (même action que le clic), pas les autres touches', () => {
        const { g, onSelect } = renderIcon();
        fe.keyDown(g, { key: 'Enter' });
        expect(onSelect).toHaveBeenCalledTimes(1);
        fe.keyDown(g, { key: ' ' });
        expect(onSelect).toHaveBeenCalledTimes(2);
        fe.keyDown(g, { key: 'Tab' });
        fe.keyDown(g, { key: 'Escape' });
        expect(onSelect).toHaveBeenCalledTimes(2);
    });

    it('porte l’anneau de focus SVG (cercle .event-focus-ring, opacité 0 au repos)', () => {
        const { g } = renderIcon();
        const ring = g.querySelector('.event-focus-ring')!;
        expect(ring).toBeTruthy();
        expect(ring.getAttribute('opacity')).toBe('0');
    });

    it('sans dateLabel (payload restauré/ancien) : label honnête sans tiret pendouillant', () => {
        const { container } = render(
            <svg>
                <ClickableEventIcon cx={10} cy={10} payload={{ label: 'Jalon' }} onSelect={vi.fn()} />
            </svg>,
        );
        expect(container.querySelector('g[role="button"]')!.getAttribute('aria-label')).toBe('Événement : Jalon');
    });
});

describe("[DETTE-INVISIBLE-INFOBULLE] la dette qui manquait à la répartition", () => {
    // Marc, 2026-09-17 : « je le vois nulle part dans le passé, pas sur l'infobulle ou quoi ».
    // Son bail auto entre au bilan et le patrimoine net baisse d'autant, sans qu'aucune ligne ne
    // l'explique : la répartition ne listait QUE des comptes positifs. Fixture synthétique.
    const SON_POINT = {
        Liquidites: 29_049, CELI: 15_639, REER: 17_709, NonReg: 198_501,
        NetWorth: 214_918,
    } as Partial<ProjectionChartPoint>;
    // 20 000 + 10 000 + 15 000 + 155 000 = 200 000 ; 200 000 − 170 000 = 30 000.
    const sansEspaces = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ');

    it('affiche la dette, signée, et les chiffres se recomposent enfin', () => {
        renderTip(SON_POINT);
        const ligne = screen.getByText(/Dettes \(hors hypothèque\)/).closest('div')?.parentElement;
        expect(ligne).toBeTruthy();
        // ⚠️ `formatCAD` sépare les milliers par une INSÉCABLE : une assertion écrite avec une
        // espace ordinaire serait vacueuse.
        expect(sansEspaces(ligne?.textContent)).toContain('45 980');
        // Le signe dit que le terme se SOUSTRAIT — sans lui, la ligne se lirait comme un actif.
        expect(sansEspaces(ligne?.textContent)).toContain('−');
    });

    it("CONTRÔLE NÉGATIF : sans dette, aucune ligne inventée", () => {
        // Sans ce cas, une ligne affichée EN PERMANENCE (« Dettes : 0 $ ») passerait le test
        // ci-dessus — et afficherait un zéro crédible là où il n'y a rien, ce que le dépôt refuse.
        renderTip({ Liquidites: 10_000, NetWorth: 10_000 });
        expect(screen.queryByText(/Dettes \(hors hypothèque\)/)).toBeNull();
    });

    it("l'hypothèque n'est PAS recomptée : Immobilier est déjà l'équité nette", () => {
        // Équité immo 100 000 (déjà nette d'hypothèque) + cash 10 000, patrimoine net 110 000 :
        // il n'y a RIEN à soustraire. Si la ligne apparaissait, elle compterait l'hypothèque deux fois.
        renderTip({ Liquidites: 10_000, Immobilier: 100_000, NetWorth: 110_000 });
        expect(screen.queryByText(/Dettes \(hors hypothèque\)/)).toBeNull();
    });
});
