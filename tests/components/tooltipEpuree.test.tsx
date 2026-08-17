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

/**
 * Tous les nœuds de TEXTE **VISIBLES** rendus.
 *
 * ⚠️ DEUX exclusions, et elles ne sont pas du confort :
 *   • les `title` sont des ATTRIBUTS — hors comptage par construction, c'est la frontière même
 *     que ce plafond verrouille ;
 *   • les sous-arbres `.sr-only` sont EXCLUS parce que le plafond mesure la PROSE À L'ÉCRAN. Un
 *     texte `sr-only` n'occupe aucun pixel : c'est l'équivalent accessible du `title`, ajouté
 *     précisément pour ne PAS payer en information ce que la demande de Marc économise en texte.
 *     Sans cette exclusion, la garde ferait ÉCHOUER le correctif d'accessibilité qu'elle est
 *     censée protéger (piège relevé par l'audit a11y).
 * ⚠️ Ce n'est pas un trou : « aucune réserve perdue » ci-dessous lit justement ces `sr-only`.
 */
const noeudsDeTexte = (): string[] => {
    const out: string[] = [];
    const walk = (n: Node) => {
        if (n.nodeType === 3) {
            const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
            if (t) out.push(t);
            return;
        }
        if (n.nodeType === 1 && (n as Element).classList?.contains('sr-only')) return;
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
    /**
     * ⚠️ Chaque réserve est vérifiée sur TROIS plans, et le troisième vient d'un finding a11y.
     * J'avais écrit que la limite du `title` était « au doigt, il ne s'ouvre pas ». C'était faux
     * par optimisme : un `title` sur un `<span>` NON focusable n'est révélé que par un survol
     * SOURIS — ni au clavier seul (l'élément n'est pas focusable), ni par un lecteur d'écran (qui
     * lit le CONTENU d'un span générique). L'explication était donc perdue pour tout le monde sauf
     * la souris : une RÉGRESSION vs le paragraphe visible qu'elle remplaçait, pas un compromis.
     * D'où le jumeau `sr-only`, et d'où cette assertion qui empêche qu'on le retire.
     */
    const verifieReserve = (labelVisible: string | RegExp, phrase: RegExp) => {
        // ⚠️ Recherche par le `title`, PAS par le texte : depuis l'ajout du jumeau `sr-only`, la
        // phrase complète est elle aussi un nœud de texte — `getByText` en trouverait deux.
        const pastille = [...document.querySelectorAll('span[title]')]
            .find((e) => phrase.test(e.getAttribute('title') || ''));
        expect(pastille, `aucune pastille dont le title corresponde à ${phrase}`).toBeTruthy();
        // 1. l'ALERTE est VISIBLE (nœud de texte direct, hors `sr-only`)…
        const visible = [...pastille!.childNodes]
            .filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
        expect(visible).toMatch(labelVisible instanceof RegExp ? labelVisible : new RegExp(labelVisible.replace(/[.*+?^${}()|[\]\\~]/g, '\\$&')));
        // 2. …la phrase complète est au survol (souris)…
        expect(pastille!.getAttribute('title')).toMatch(phrase);
        // 3. …et elle existe AUSSI dans l'arbre d'accessibilité (lecteur d'écran, clavier seul).
        const sr = pastille!.querySelector('.sr-only');
        expect(sr, 'la phrase doit exister hors du seul attribut `title`').not.toBeNull();
        expect(sr!.textContent).toMatch(phrase);
    };

    it('prix ESTIMÉ : pastille visible + phrase complète (survol ET lecteur d’écran)', () => {
        render(<ExpertTooltip data={jour({ hasEstimatedPrice: true })} />);
        verifieReserve('~ prix estimé', /prix ACTUEL/);
    });

    it('prix PÉRIMÉ : la pastille porte l’âge réel, pas un vague « ancien »', () => {
        render(<ExpertTooltip data={jour({ priceAgeMaxDays: 34 })} />);
        expect(screen.getByText(/prix J−34/)).toBeInTheDocument();
        verifieReserve(/prix J−34/, /plateau de reconstruction/);
    });

    it('sync NON CONFIRMÉE : pastille visible + phrase complète (survol ET lecteur d’écran)', () => {
        render(<ExpertTooltip data={jour({ daySyncUnconfirmed: true })} />);
        verifieReserve(/sync incomplète/, /transactions de ce jour peuvent manquer/);
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
    it('le badge Réel / Projeté garde sa justification (survol ET lecteur d’écran)', () => {
        const { unmount } = render(<ExpertTooltip data={jour()} />);
        verifieReserve('Réel', /pas une moyenne du mois/);
        unmount();
        render(<ExpertTooltip data={jour({ dayIsReal: false })} />);
        verifieReserve('Projeté', /pas une mesure/);
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

    /**
     * ⚠️ [finding silent-failure #644] Le compte doit survivre à la branche de REPLI.
     *
     * Quand aucune transaction du jour ne porte de description, la liste affichée est vide et
     * l'infobulle bascule sur « Mouvement à date connue ». Si le « +N autres » vivait DANS la
     * branche des montants, il disparaissait précisément là où il est le SEUL indice que des
     * mouvements existent — le pire endroit possible pour le perdre.
     */
    it('le compte survit quand AUCUN mouvement n’est décrit (branche de repli)', () => {
        render(<ExpertTooltip data={jour({
            dayIsDated: true, dayMovements: [], dayMovementsTotal: 3,
        })} />);
        expect(screen.getByText('Mouvement à date connue')).toBeInTheDocument();
        expect(screen.getByText('+3 autres')).toBeInTheDocument();
    });

    it('rien à annoncer quand la liste est complète (pas de « +0 autres »)', () => {
        render(<ExpertTooltip data={jour({
            dayIsDated: true,
            dayMovements: [{ payee: 'Metro', amount: -42 }],
            dayMovementsTotal: 1,
        })} />);
        expect(screen.queryByText(/autres?$/)).toBeNull();
    });
});
