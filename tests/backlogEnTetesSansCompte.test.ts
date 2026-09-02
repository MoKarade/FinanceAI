// tests/backlogEnTetesSansCompte.test.ts
//
// `PM-STALE-BACKLOG` — un en-tête de `BACKLOG.md` ne doit JAMAIS annoncer un COMPTE d'items.
//
// Le compte a une source unique : la LISTE elle-même. Le recopier dans un titre en fait une
// `DOC-METRIQUE-RECOPIEE`, qui ne se met à jour que si quelqu'un y pense — et personne n'y pense au
// moment de cocher une case. MESURÉ le 2026-09-02, avant ce lot : cinq en-têtes annonçaient
// **50 items** au total là où il en restait **21**.
//   · « Moteur & fiscal (8 HIGH · 7 MED · 7 LOW) » → 10 ouverts
//   · « A11y — 1 HIGH restant, 3 MED, 1 LOW »      → 1
//   · « Performance (1 HIGH, 2 MED, 1 LOW) »       → 1
//   · « IA / Anthropic (1 HIGH, 4 MED, 2 LOW) »    → 2
//   · « Dette technique (2 HIGH, 4 MED, 6 LOW/S) » → 7
// Un backlog qui annonce plus du double de ce qu'il contient trompe la reprise de session : elle
// choisit son lot d'après les titres. C'est la MÊME classe que les quatre en-têtes annonçant des
// tickets inexistants, corrigés au lot 84 — la récidive est ce qui justifie une garde plutôt qu'une
// troisième passe à la main.
//
// ⚠️ Aucune EXEMPTION, délibérément : une liste d'exceptions est le réglage le plus dangereux d'un
// détecteur (elle se lit comme un détail déjà tranché). Un titre qui doit raconter un reliquat
// historique le fait sans chiffre, et renvoie à `docs/BACKLOG_ARCHIVE.md`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lignes = (): string[] =>
    readFileSync(resolve(__dirname, '../BACKLOG.md'), 'utf8').split('\n');

const EN_TETE = /^#{2,3} /;
/** « 8 HIGH », « 3 MED/LOW », « 1 HIGH restant », « 7 LOW/FAIBLE »… */
const COMPTE = /\d+\s*(HIGH|MED\b|LOW|ÉLEVÉ|MOYEN|FAIBLE)/i;

describe('[PM-STALE-BACKLOG] aucun en-tête de BACKLOG.md n\'annonce de compte', () => {
    it('anti-vacuité : le fichier a bien des en-têtes ET des items ouverts', () => {
        // Sans ce contrôle, un BACKLOG.md vide, renommé ou introuvable rendrait la garde verte.
        const l = lignes();
        expect(l.filter(x => EN_TETE.test(x)).length, 'des en-têtes').toBeGreaterThan(10);
        expect(l.filter(x => x.startsWith('- [ ]')).length, 'des items ouverts').toBeGreaterThan(10);
    });

    it('le détecteur RECONNAÎT les formes qui ont réellement dérivé (témoins)', () => {
        // Témoins tirés des cinq en-têtes mesurés le 2026-09-02, plus un contre-témoin.
        for (const temoin of [
            '### 🔴 Moteur & fiscal — altère les calculs (8 HIGH/ÉLEVÉ · 7 MED · 7 LOW/FAIBLE)',
            '### 🔴 A11y — 1 HIGH restant, 3 MED, 1 LOW',
            '### 🔴 Performance (1 HIGH, 2 MED, 1 LOW)',
            '## Dette technique (2 HIGH, 4 MED, 6 LOW/S)',
        ]) {
            expect(COMPTE.test(temoin), `non détecté : ${temoin}`).toBe(true);
        }
        // Contre-témoin : un titre SANS compte ne doit pas être relevé, sinon la garde
        // interdirait d'écrire des en-têtes normaux.
        expect(COMPTE.test('### 🔴 Moteur & fiscal — altère les calculs d\'argent')).toBe(false);
        // Contre-témoin 2 : un ID de ticket contenant un chiffre n'est pas un compte.
        expect(COMPTE.test('### 🔴 `[PASSE-REEL-DETTE]` — la dette du passé (Marc, signalé 2×)')).toBe(false);
    });

    it('AUCUN en-tête ne porte de compte aujourd\'hui', () => {
        const fautifs = lignes().filter(l => EN_TETE.test(l) && COMPTE.test(l));
        expect(fautifs, `en-tête(s) annonçant un compte :\n${fautifs.join('\n')}`).toEqual([]);
    });
});
