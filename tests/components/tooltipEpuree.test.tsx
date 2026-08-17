/**
 * [FUTUR-INFOBULLE-EPUREE] « Un peu plus grande, et quasiment pas de texte » (Marc, 2026-08-17).
 *
 * ⚠️ LE PIÈGE DE CETTE DEMANDE, et ce que ce fichier verrouille : « moins de texte » se réalise
 * trivialement en SUPPRIMANT de l'information. Or trois des paragraphes retirés portaient une
 * RÉSERVE sur la fiabilité du point affiché (titre valorisé à son prix actuel, prix périmé, jour
 * pas encore couvert par la sync). Les faire disparaître transformerait un chiffre sous réserve en
 * chiffre net — précisément le « 0 $ crédible » que tout cet écran combat.
 *
 * Deux gardes tenues ENSEMBLE, et c'est leur tension qui fait la valeur :
 *   1. PLAFOND DE PROSE — aucun nœud de texte ne dépasse un seuil court. Échoue sur le code
 *      d'avant (deux paragraphes de 65 et ~110 caractères).
 *   2. AUCUNE RÉSERVE PERDUE — chaque réserve garde un marqueur VISIBLE, et sa phrase complète
 *      reste accessible au survol. Échoue sur une « épuration » faite à coups de suppressions.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ExpertTooltip } from '../../components/projection/ProjectionTooltip';
import type { ProjectionChartPoint } from '../../services/projection/types';

/**
 * Champs d'affichage portés par les points QUOTIDIENS (hors contrat du moteur).
 * ⚠️ Le paramètre n'est PAS intersecté avec `Partial<ProjectionChartPoint>` : ce type a une
 * signature d'index scalaire, et `dayMovements` (un tableau d'objets) ne s'y conforme pas.
 */
type DailyExtras = {
    isDailyPoint?: boolean; dayIsReal?: boolean; dayIsDated?: boolean; dayLabels?: string[];
    hasEstimatedPrice?: boolean; priceAgeMaxDays?: number; daySyncUnconfirmed?: boolean;
    dayMovements?: Array<{ payee: string; amount: number }>; dayMovementsTotal?: number;
};

const jour = (extras: DailyExtras = {}): ProjectionChartPoint => ({
    monthIndex: 12, dateLabel: '10 août 2026', age: 41, NetWorth: 812_345, diffNW: -1_240,
    // De quoi peupler TOUTES les sections de chrome (revenus, dépenses, impôts, par compte) :
    // une infobulle vide passerait le plafond de prose sans rien prouver.
    IncomeMarc: 3_200, IncomeRetirement: 900, Expenses: 2_450, RetraitREER: 500,
    FluxImpots: 1_200, ImpotLatent: -60_000,
    Liquidites: 12_000, CELI: 90_000, REER: 210_000, NonReg: 45_000,
    MarketGrowthCELI: 300, NetTransferCELI: 500,
    isDailyPoint: true, dayIsReal: true, dayIsDated: false, dayLabels: [],
    ...extras,
} as unknown as ProjectionChartPoint);

/** Tous les nœuds de TEXTE rendus (les `title` sont des attributs : hors comptage, par construction). */
const noeudsDeTexte = (): string[] => {
    const out: string[] = [];
    const walk = (n: Node) => {
        if (n.nodeType === 3) {
            const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
            if (t) out.push(t);
            return;
        }
        n.childNodes.forEach(walk);
    };
    walk(document.body);
    return out;
};

// Seuil : ~une demi-ligne de l'infobulle. Au-delà, ce n'est plus une étiquette, c'est une phrase.
const PLAFOND = 45;

describe('[FUTUR-INFOBULLE-EPUREE] plafond de prose', () => {
    it.each([
        ['jour réel figé', { frozen: true }],
        ['jour réel survolé', { frozen: false }],
    ])('%s : aucun nœud de texte ne dépasse le plafond', (_nom, opts) => {
        render(<ExpertTooltip data={jour()} userName1="Marc" frozen={opts.frozen} onOpenDetail={() => {}} onStepDay={() => {}} canStepPrev canStepNext />);
        const trop = noeudsDeTexte().filter((t) => t.length > PLAFOND);
        // Message diagnostique : sans lui, un échec ne dirait pas QUELLE phrase est revenue.
        expect(trop, `phrases trop longues rendues : ${JSON.stringify(trop)}`).toEqual([]);
    });

    it('jour PROJETÉ sans mouvement : idem (c’est là que vivait la plus longue phrase)', () => {
        render(<ExpertTooltip data={jour({ dayIsReal: false })} />);
        expect(noeudsDeTexte().filter((t) => t.length > PLAFOND)).toEqual([]);
    });

    // ⚠️ Anti-sur-correctif du plafond : le plafond ne doit PAS être satisfait en vidant l'écran.
    it('l’infobulle dit toujours l’essentiel (valeur, variation, comptes, impôts)', () => {
        render(<ExpertTooltip data={jour()} />);
        const txt = (document.body.textContent || '').replace(/\s+/g, '');
        expect(txt).toContain('Valeurnette');
        expect(txt).toContain('Variation');
        expect(txt).toContain('Parcompte');
        expect(txt).toContain('Impôts');
        expect(txt).toContain('Dépenses');
    });
});

describe('[FUTUR-INFOBULLE-EPUREE] aucune réserve perdue', () => {
    it('prix ESTIMÉ : pastille visible + phrase complète au survol', () => {
        render(<ExpertTooltip data={jour({ hasEstimatedPrice: true })} />);
        const chip = screen.getByText('~ prix estimé');
        expect(chip.getAttribute('title')).toMatch(/prix ACTUEL/);
    });

    it('prix PÉRIMÉ : la pastille porte l’âge réel, pas un vague « ancien »', () => {
        render(<ExpertTooltip data={jour({ priceAgeMaxDays: 34 })} />);
        const chip = screen.getByText('prix J−34');
        expect(chip.getAttribute('title')).toMatch(/plateau de reconstruction/);
    });

    it('sync NON CONFIRMÉE : pastille visible + phrase complète au survol', () => {
        render(<ExpertTooltip data={jour({ daySyncUnconfirmed: true })} />);
        const chip = screen.getByText(/sync incomplète/);
        expect(chip.getAttribute('title')).toMatch(/transactions de ce jour peuvent manquer/);
    });

    // ⚠️ Sans cette garde, afficher les trois pastilles EN PERMANENCE resterait vert — et une
    // réserve permanente ne se lit plus comme une réserve.
    it('aucune réserve → aucune pastille (pas d’avertissement décoratif)', () => {
        render(<ExpertTooltip data={jour()} />);
        expect(screen.queryByText('~ prix estimé')).toBeNull();
        expect(screen.queryByText(/prix J−/)).toBeNull();
        expect(screen.queryByText(/sync incomplète/)).toBeNull();
    });

    it('un prix de 7 jours ou moins n’est PAS une réserve (seuil inchangé)', () => {
        render(<ExpertTooltip data={jour({ priceAgeMaxDays: 7 })} />);
        expect(screen.queryByText(/prix J−/)).toBeNull();
    });

    // La justification du badge « Réel » était un paragraphe ; elle est maintenant son `title`.
    it('le badge Réel / Projeté garde sa justification au survol', () => {
        const { unmount } = render(<ExpertTooltip data={jour()} />);
        expect(screen.getByText('Réel').getAttribute('title')).toMatch(/pas une moyenne du mois/);
        unmount();
        render(<ExpertTooltip data={jour({ dayIsReal: false })} />);
        expect(screen.getByText('Projeté').getAttribute('title')).toMatch(/pas une mesure/);
    });

    // La troncature de la liste des mouvements reste ANNONCÉE : c'est la garde de
    // [FUTUR-INFOBULLE-MONTANTS], que l'épuration ne doit pas emporter en raccourcissant le libellé.
    it('la troncature des mouvements reste annoncée', () => {
        render(<ExpertTooltip data={jour({
            dayIsDated: true,
            dayMovements: [{ payee: 'Metro', amount: -42 }],
            dayMovementsTotal: 5,
        })} />);
        const reste = screen.getByText('+4 autres');
        expect(reste.getAttribute('title')).toMatch(/Détail complet/);
    });
});
