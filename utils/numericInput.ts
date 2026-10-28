// utils/numericInput.ts
//
// PV-5 — Garde de saisie pour les <input type="number"> dont la valeur alimente un calcul.
//
// Deux pièges quand on fait `Number(e.target.value)` sans garde :
//  1. Champ VIDÉ → la valeur est '' → `Number('')` vaut **0** (pas NaN). On écrase donc
//     silencieusement le champ par 0 : ex. `dbPensionStartAge` cleared ⇒ 0 ⇒ `age >= 0`
//     toujours vrai ⇒ la pension DB démarre « à 0 an » ; un estimé RRQ/PSV vidé ⇒ 0 au lieu
//     de « non renseigné » (le moteur ne retombe plus sur la rente agrégée).
//  2. Saisie non finie (jsdom sans validation type=number, ou intermédiaire « - » / « 1e ») →
//     `Number(...)` = NaN. `??` ne protège PAS (`NaN ?? x` vaut `NaN`) ⇒ NaN propagé dans le moteur.
//
// Ces helpers garantissent qu'on ne persiste JAMAIS ni un 0 « fantôme » (champ vidé) ni un NaN.

/**
 * Champ REQUIS : '' / blanc / saisie non finie ⇒ `fallback` (typiquement la valeur courante).
 * Un 0 EXPLICITEMENT saisi (« 0 ») est conservé. Ne renvoie jamais NaN.
 */
export const numOr = (raw: string, fallback: number): number => {
    if (raw.trim() === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
};

/**
 * Champ OPTIONNEL : '' / blanc / saisie non finie ⇒ `undefined` (= « non renseigné »), sinon le
 * nombre fini. Surtout PAS `0` quand un consommateur distingue `undefined` (repli sur une valeur
 * dérivée) d'un `0` explicite — ex. `rrqEstimateMonthly` côté moteur de retraite (`!== undefined`).
 */
export const numOrUndef = (raw: string): number | undefined => {
    if (raw.trim() === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
};
