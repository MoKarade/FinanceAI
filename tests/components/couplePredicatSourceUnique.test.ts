// tests/components/couplePredicatSourceUnique.test.ts
//
// [COUPLE-PREDICAT-COPIES] (lot 185) — « mode couple = un 2e utilisateur NOMMÉ » était écrit à la main
// à NEUF endroits, sous trois formes (`Boolean(name && trim() !== '')`, `!!name?.trim()`,
// `length >= 2 && …`, plus deux négations/dérivés : MissingDataBanner, Budget, nomsConjoints).
// Deux copies qui divergent rendent un écran « couple » et un autre « solo » sur le MÊME état — sans
// rien de rouge. Source unique : `isCoupleMode` (services/couple/netWorthByOwner.ts). Cette garde lit la
// source DÉCOMMENTÉE (un commentaire qui explique le motif ne doit pas rougir) et cherche la FORME du
// prédicat manuscrit : un accès `[1]` au nom suivi d'un `.trim()`. Les simples AFFICHAGES du nom
// (`users[1]?.name ?? ''`, `userName2={…}`) ne sont pas des prédicats et ne sont pas visés.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stripCommentsJsx } from '../../utils/stripComments';
import { isCoupleMode } from '../../services/couple/netWorthByOwner';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RACINES = ['components', 'services', 'store', 'hooks', 'utils'];
const SOURCE_UNIQUE = path.join('services', 'couple', 'netWorthByOwner.ts');

/** Un prédicat manuscrit : le NOM du 2e utilisateur (`[1]`) passé au `trim()`. */
const PREDICAT_MANUSCRIT = /\[1\]\??\.name\??\.trim\(\)/;

const files = RACINES.flatMap((r) => readdirSync(path.join(ROOT, r), { recursive: true, encoding: 'utf8' })
    .filter((f) => (f.endsWith('.tsx') || f.endsWith('.ts')) && !f.includes('.test.') && !f.includes('.spec.'))
    .map((f) => path.join(ROOT, r, f)));

describe('[COUPLE-PREDICAT-COPIES] le prédicat « mode couple » n\'a qu\'une écriture : isCoupleMode', () => {
    it('a bien des fichiers à scanner', () => {
        expect(files.length).toBeGreaterThan(100);
    });

    it('aucun prédicat manuscrit hors de la source unique (source décommentée)', () => {
        const offenders: string[] = [];
        for (const file of files) {
            const rel = path.relative(ROOT, file);
            if (rel === SOURCE_UNIQUE) continue;
            const code = stripCommentsJsx(readFileSync(file, 'utf8'));
            code.split('\n').forEach((l, i) => {
                if (PREDICAT_MANUSCRIT.test(l)) offenders.push(`${rel}:${i + 1}: ${l.trim()}`);
            });
        }
        expect(offenders, 'écrire `isCoupleMode(users)` (ou sa négation), jamais le test du nom à la main').toEqual([]);
    });

    it('le motif TIRE sur les formes retirées par ce lot (anti-vacuité), pas sur un affichage du nom', () => {
        for (const temoin of [
            "const isCouple = !!coupleUsers[1]?.name?.trim();",
            "const isCouple = Boolean(config?.users?.[1]?.name?.trim());",
            "isMissing: (s) => !s.config?.users?.[1]?.name?.trim(),",
            "const user2 = usersIncome[1]?.name?.trim() ? usersIncome[1] : null;",
            "const n1 = users[1]?.name?.trim() || '';",
            "Boolean(coupleConfig?.users?.[1]?.name && coupleConfig.users[1].name.trim() !== '')",
        ]) expect(temoin, temoin).toMatch(PREDICAT_MANUSCRIT);
        for (const sain of ["userName2={config.users[1]?.name}", "const name2 = users[1]?.name || 'Conjoint(e)';", "isCoupleMode(config?.users)"]) {
            expect(sain, sain).not.toMatch(PREDICAT_MANUSCRIT);
        }
    });

    it('la source unique tient la définition que les neuf copies avaient (nom NON VIDE après trim)', () => {
        expect(isCoupleMode([{ name: 'A' }, { name: 'B' }])).toBe(true);
        expect(isCoupleMode([{ name: 'A' }, { name: ' ' }])).toBe(false);
        expect(isCoupleMode([{ name: 'A' }, {}])).toBe(false);
        expect(isCoupleMode([{ name: 'A' }])).toBe(false);
    });
});
