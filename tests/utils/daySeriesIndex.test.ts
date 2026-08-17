/**
 * [FUTUR-DETAIL-STEP-DAY] Position du jour dans la série — LE test qui manquait.
 *
 * ⚠️ POURQUOI IL EXISTE, et c'est la leçon du lot. Le test de `FutureDetailModal.stepDay` vérifiait
 * le CONTRAT du composant : props reçues → callback appelé, bouton désactivé aux bornes. Tout vert,
 * et parfaitement inutile — parce que le défaut était dans la couche APPELANTE, qui fournissait un
 * index FAUX. `detailSeriesIdx` était résolu depuis le point REBASÉ sur le mois (donc sans
 * `dayIso`), et retombait sur `monthIndex` ; or dans une série quotidienne, seul le 1er du mois
 * porte l'abscisse entière. L'index désignait donc TOUJOURS le 1er du mois.
 * Effet pour Marc : « Lendemain » depuis le 15 sautait au 2, et sur un jour futur les clics
 * suivants ne faisaient RIEN de visible (le point rebasé ne changeant pas, React ne re-rendait pas).
 *
 * Un composant testé à son contrat ne dit rien de ce qu'on lui passe. D'où cette fonction pure.
 */
import { describe, it, expect } from 'vitest';
import { resolveDaySeriesIndex, type DaySeriesPoint } from '../../utils/daySeriesIndex';

/** Série quotidienne réaliste : abscisse FRACTIONNAIRE sauf le 1er du mois. */
const serie = (mois: number, jours: number[]): DaySeriesPoint[] =>
    jours.map((j) => ({
        monthIndex: mois + (j - 1) / 31,
        dayIso: `2026-0${mois + 1}-${String(j).padStart(2, '0')}`,
    }));

const AOUT = serie(7, [1, 2, 14, 15, 16, 31]);

describe('[FUTUR-DETAIL-STEP-DAY] l’index suit le JOUR ouvert', () => {
    it('ouvre sur le 15 → index du 15, pas du 1er', () => {
        const i = resolveDaySeriesIndex(AOUT, '2026-08-15', 7);
        expect(AOUT[i].dayIso).toBe('2026-08-15');
    });

    /**
     * ⚠️ L'assertion qui reproduit EXACTEMENT le bug rapporté par Marc s'il avait cliqué.
     * Sur le code d'avant, l'index valait 0 (le 1er du mois) et « Lendemain » menait au 2.
     */
    it('« Lendemain » depuis le 15 mène au 16 — pas au 2', () => {
        const i = resolveDaySeriesIndex(AOUT, '2026-08-15', 7);
        expect(AOUT[i + 1].dayIso).toBe('2026-08-16');
        expect(AOUT[i + 1].dayIso).not.toBe('2026-08-02');
    });

    it('« Veille » depuis le 15 mène au 14', () => {
        const i = resolveDaySeriesIndex(AOUT, '2026-08-15', 7);
        expect(AOUT[i - 1].dayIso).toBe('2026-08-14');
    });

    // ⚠️ L'ancre est posée sur TOUT jour, projeté compris : se déplacer n'affirme rien sur les
    // données, contrairement à `detailDayIso` qui, lui, reste gated sur `dayIsReal`.
    it('un jour FUTUR s’ancre aussi (sinon les flèches gèlent dans le futur)', () => {
        const futur = serie(30, [3, 4, 5]);
        const i = resolveDaySeriesIndex(futur, futur[1].dayIso, 30);
        expect(i).toBe(1);
    });
});

describe('[FUTUR-DETAIL-STEP-DAY] les bornes et les cas dégénérés', () => {
    it('sans ancre (ouverture depuis une pastille d’ÉVÉNEMENT) : repli sur le mois', () => {
        const i = resolveDaySeriesIndex(AOUT, null, 7);
        expect(AOUT[i].dayIso).toBe('2026-08-01');
    });

    /**
     * ⚠️ Pas de repli SILENCIEUX vers le mois quand l'ancre a disparu de la série (fenêtre
     * rezoomée) : renvoyer le 1er du mois ferait sauter l'utilisateur ailleurs sans rien dire.
     * `-1` désactive les flèches — honnête, et visible.
     */
    it('ancre ABSENTE de la série → -1, jamais un repli qui téléporte', () => {
        expect(resolveDaySeriesIndex(AOUT, '2026-08-20', 7)).toBe(-1);
    });

    it('série vide, mois absent, mois non fini → -1', () => {
        expect(resolveDaySeriesIndex([], '2026-08-15', 7)).toBe(-1);
        expect(resolveDaySeriesIndex(AOUT, null, 99)).toBe(-1);
        expect(resolveDaySeriesIndex(AOUT, null, Number.NaN)).toBe(-1);
    });

    // Le mois-ANCRE peut ne pas avoir de jour 1 (reconstruit depuis le réel mesuré seulement).
    it('mois sans jour 1 : l’ancre marche quand même (le repli mensuel, lui, échouerait)', () => {
        const ancre = serie(7, [14, 15, 16]);
        expect(resolveDaySeriesIndex(ancre, '2026-08-15', 7)).toBe(1);
        expect(resolveDaySeriesIndex(ancre, null, 7)).toBe(-1);
    });
});
