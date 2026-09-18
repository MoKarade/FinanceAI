// tests/backlogArchivageDesCoches.test.ts
//
// `PM-STALE-BACKLOG` — `BACKLOG.md` ne garde que le VIVANT.
//
// La règle est écrite dans le dépôt depuis le 2026-07-31 (`CLAUDE.md` §3, « Tenue du BACKLOG ») :
// un item coché + validé (mergé sur `main`, gate vert) DÉMÉNAGE vers `docs/BACKLOG_ARCHIVE.md`
// **au plus tard à la PR suivante**. Elle a dérivé sans que rien ne rougisse — MESURÉ le
// 2026-09-18, juste après le merge de la PR #992 : **91** items cochés cohabitaient avec **151**
// vivants, et **20** d'entre eux portaient dans leur PROPRE texte « → à déménager vers
// BACKLOG_ARCHIVE à la prochaine PR ». Un backlog qui mélange fait et à-faire trompe le PM et la
// reprise de session : elle choisit son lot en lisant la liste.
//
// ⚠️ Pourquoi un PLAFOND et non « zéro coché ». La règle AUTORISE explicitement de cocher dans la
// PR qui livre (« cocher les items livrés dans la PR même ») et n'exige l'archivage qu'à la PR
// SUIVANTE. Une garde à zéro rendrait le geste prescrit impossible. Ce qu'on interdit est donc
// l'ACCUMULATION : au plus les coches d'UN lot.
//
// ⚠️ Le plafond est MESURÉ, pas choisi (`UN-SEUIL-ECRIT-AVANT-SA-MESURE-EST-UN-CHIFFRE-INVENTE`).
// Commande de re-mesure — un chiffre périmé se lit comme un fait, une commande périmée échoue :
//   for c in $(git log --first-parent --format=%H -14 origin/main); do \
//       git show $c -- BACKLOG.md | grep -cE '^\+- \[x\]'; done
// Résultat au 2026-09-18 sur les 14 derniers merges (2026-09-14 → 2026-09-18) : 2 · 4 · 1 · 1 · 1 ·
// 0 · 0 · 1 · 0 · 4 · 1 · 0 · 3 · 3 — soit un MAXIMUM de 4 coches par PR. Plafond à 6 = ce maximum
// plus deux, pour qu'un lot un peu plus large ne rougisse pas le jour où il livre.
//
// ⚠️ La seconde assertion ne dépend d'aucun plafond : un item qui ÉCRIT lui-même que son archivage
// est dû est en retard par ses propres mots, qu'il soit seul ou quatre-vingt-onzième.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lignes = (): string[] =>
    readFileSync(resolve(__dirname, '../BACKLOG.md'), 'utf8').split('\n');

/** Un item de tâche COCHÉ, au premier niveau. Les sous-puces indentées appartiennent à leur item. */
const COCHE = /^- \[x\] /;
const VIVANT = /^- \[ \] /;
/** La dette d'archivage que l'item se déclare à lui-même, dans le texte du backlog. */
const ARCHIVAGE_DU = /à déménager vers\s+`?BACKLOG_ARCHIVE/i;

/** Plafond MESURÉ le 2026-09-18 : 4 coches au plus par PR sur les 14 derniers merges, + 2 de marge. */
const PLAFOND_COCHES = 6;

describe('[PM-STALE-BACKLOG] BACKLOG.md ne garde que le vivant', () => {
    it('anti-vacuité : c\'est bien le vrai backlog qu\'on lit', () => {
        // Sans ça, un fichier vide, renommé ou introuvable rendrait « 0 coché » vrai pour la
        // mauvaise raison — exactement l'état dans lequel un ratchet cesse de protéger.
        const l = lignes();
        expect(l.filter(x => VIVANT.test(x)).length, 'items vivants').toBeGreaterThan(50);
        expect(l.filter(x => x.startsWith('## ')).length, 'sections').toBeGreaterThan(10);
    });

    it('les deux détecteurs RECONNAISSENT ce qu\'ils cherchent (témoins + contre-témoins)', () => {
        // Témoins repris tels quels des items archivés le 2026-09-18.
        expect(COCHE.test('- [x] 🔧 **`[FUTUR-PANNEAU-FIXE]`** (L) **LIVRÉ le 18/09/2026**')).toBe(true);
        expect(COCHE.test('- [x] 🔴 **`[HUB-TOTAL-AMPUTE]`** (M, money-critical) — livré')).toBe(true);
        expect(ARCHIVAGE_DU.test('perturbation → 2 rouges → à déménager vers BACKLOG_ARCHIVE à la prochaine PR.')).toBe(true);
        expect(ARCHIVAGE_DU.test('→ à déménager vers `BACKLOG_ARCHIVE.md` à la prochaine PR')).toBe(true);

        // Contre-témoins : un item VIVANT n'est pas une coche, et une sous-puce indentée non plus
        // (elle appartient à son item ; la compter doublerait le total au premier item détaillé).
        expect(COCHE.test('- [ ] 🔧 **`[PDF-DETTES-SOLDE-BRUT]`** (S) — le rapport PDF')).toBe(false);
        expect(COCHE.test('  - [x] sous-étape d\'un item vivant')).toBe(false);
        // Contre-témoin 2 : la PROSE qui explique la règle ne doit pas être prise pour une dette.
        expect(ARCHIVAGE_DU.test('un item coché + validé DÉMÉNAGE vers `BACKLOG_ARCHIVE.md`')).toBe(false);
    });

    it('les items cochés ne s\'ACCUMULENT pas (au plus les coches d\'un lot)', () => {
        const coches = lignes().filter(l => COCHE.test(l));
        expect(
            coches.length,
            `${coches.length} items cochés dans BACKLOG.md (plafond ${PLAFOND_COCHES}). ` +
            'Un item coché + mergé + gate vert DÉMÉNAGE vers docs/BACKLOG_ARCHIVE.md, avec sa date ' +
            'et sa PR, au plus tard à la PR suivante :\n' + coches.map(c => c.slice(0, 100)).join('\n'),
        ).toBeLessThanOrEqual(PLAFOND_COCHES);
    });

    it('aucun item coché ne déclare lui-même son archivage en retard', () => {
        const fautifs = lignes().filter(l => COCHE.test(l) && ARCHIVAGE_DU.test(l));
        expect(
            fautifs,
            `item(s) portant leur propre dette d'archivage :\n${fautifs.join('\n')}`,
        ).toEqual([]);
    });
});
