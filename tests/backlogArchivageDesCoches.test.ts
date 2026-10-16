// tests/backlogArchivageDesCoches.test.ts
//
// `PM-STALE-BACKLOG` — `BACKLOG.md` ne garde AUCUN item : il renvoie aux issues du dépôt.
//
// Historique de la garde. Née le 2026-09-18 pour que `BACKLOG.md` ne garde que le VIVANT : un item coché
// déménageait vers `docs/BACKLOG_ARCHIVE.md` « au plus tard à la PR suivante », avec un plafond MESURÉ de
// 6 coches (le maximum de 4 par PR sur les 14 derniers merges, plus deux). Elle a vécu tant que la liste
// vivait dans ce fichier.
//
// Depuis le 2026-10-16 (tâche FinanceAI#1168, plan de standardisation du 15/10/2026, grille de conformité
// ligne 11), le backlog vit dans les ISSUES : `BACKLOG.md` n'est qu'un renvoi (20 lignes au plus) et l'ancienne
// liste est figée dans `docs/BACKLOG_AVANT_ISSUES_2026-10-15.md`. La garde se resserre donc au lieu de
// disparaître : le plafond passe de 6 coches à ZÉRO item, de tout type. Une liste tenue à deux endroits
// (ici ET dans les issues) dit deux choses différentes au bout d'une semaine — c'est le défaut qu'elle empêche.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (chemin: string): string[] => readFileSync(resolve(__dirname, '..', chemin), 'utf8').split('\n');
const lignes = (): string[] => lire('BACKLOG.md');

/** Un item de tâche, coché ou non, au premier niveau. Les sous-puces indentées appartiennent à leur item. */
const ITEM = /^- \[[ x]\] /;
const COCHE = /^- \[x\] /;
const VIVANT = /^- \[ \] /;
/** Le renvoi vers les issues du dépôt, seule chose que ce fichier doit porter. */
const RENVOI_ISSUES = /https:\/\/github\.com\/MoKarade\/FinanceAI\/issues/;
/** Plafond de la grille de conformité (MoKarade/.github, docs/conformite.md, ligne 11). */
const LIGNES_MAX = 20;

describe('[PM-STALE-BACKLOG] BACKLOG.md est un renvoi vers les issues, pas une liste', () => {
    it('anti-vacuité : le renvoi vers les issues est là, et l\'ancienne liste est archivée intacte', () => {
        // Sans ça, un fichier vide ou renommé rendrait « zéro item » vrai pour la mauvaise raison — exactement
        // l'état dans lequel un ratchet cesse de protéger. L'archive prouve que la liste n'a pas été jetée.
        expect(lignes().some(l => RENVOI_ISSUES.test(l)), 'lien vers les issues').toBe(true);
        const ancienne = lire('docs/BACKLOG_AVANT_ISSUES_2026-10-15.md');
        expect(ancienne.filter(x => VIVANT.test(x)).length, 'items vivants archivés').toBeGreaterThan(50);
        expect(ancienne.filter(x => x.startsWith('## ')).length, 'sections archivées').toBeGreaterThan(10);
    });

    it('le détecteur RECONNAÎT un item de tâche (témoins + contre-témoins)', () => {
        // Témoins repris des items de l'ancienne liste.
        expect(ITEM.test('- [x] 🔧 **`[FUTUR-PANNEAU-FIXE]`** (L) **LIVRÉ le 18/09/2026**')).toBe(true);
        expect(ITEM.test('- [ ] 🔧 **`[PDF-DETTES-SOLDE-BRUT]`** (S) — le rapport PDF')).toBe(true);
        expect(COCHE.test('- [x] 🔴 **`[HUB-TOTAL-AMPUTE]`** (M, money-critical) — livré')).toBe(true);
        // Contre-témoins : la PROSE du renvoi et une sous-puce indentée ne sont pas des items.
        expect(ITEM.test('- Une tâche = une issue `niveau:tâche`, avec **Avant**, **Après** et **Fini quand**.')).toBe(false);
        expect(ITEM.test('  - [x] sous-étape d\'un item')).toBe(false);
    });

    it('BACKLOG.md ne porte aucun item de tâche : le backlog vit dans les issues', () => {
        const items = lignes().filter(l => ITEM.test(l));
        expect(
            items,
            'BACKLOG.md ne garde que le renvoi vers les issues. Une tâche = une issue `niveau:tâche` du dépôt ; ' +
            'ne l\'écris pas ici :\n' + items.map(c => c.slice(0, 100)).join('\n'),
        ).toEqual([]);
    });

    it('BACKLOG.md reste court (20 lignes au plus, plafond de la grille de conformité)', () => {
        const l = lignes();
        // `split('\n')` d'un fichier qui finit par un saut de ligne laisse une dernière entrée vide.
        const n = l[l.length - 1] === '' ? l.length - 1 : l.length;
        expect(n, `${n} lignes dans BACKLOG.md`).toBeLessThanOrEqual(LIGNES_MAX);
    });
});
