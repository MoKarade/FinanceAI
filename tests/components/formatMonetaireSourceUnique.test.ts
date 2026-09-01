/**
 * [FORMAT-EXPLAINS-TOLOCALESTRING] GARDE DE SOURCE — aucun montant composé À LA MAIN dans l'UI.
 *
 * Non négociable du `CLAUDE.md` : « **Formatage $ : `formatCAD` (`utils/format.ts`) UNIQUEMENT.
 * Jamais `toLocaleString()` nu, jamais `` `${n.toFixed(0)}$` `` ». La règle existait, rien ne la
 * tenait : le recensement de ce lot a trouvé **16 sites** dans `components/`, là où le ticket en
 * annonçait 3.
 *
 * ⚠️ **CE QUE CETTE GARDE PROTÈGE N'EST PAS QUE LA TYPOGRAPHIE.** Un montant composé à la main est
 * invisible à `amountPrivacyScan` — qui cherche `formatCAD`/`formatCompactCAD` et leurs alias. Les
 * seize sites échappaient donc AUX DEUX gardes, et migrer le format en a révélé **six** qui
 * n'étaient pas masqués en mode discret (coût de garde, d'école et d'activités d'un enfant). Le
 * format et la vie privée sont ici le même trou vu deux fois.
 *
 * MOTIF : un `toLocaleString(...)` ou un `toFixed(n)` suivi, à moins de quelques caractères, d'un
 * `$` littéral. ⚠️ Le `$` doit être suivi d'autre chose qu'une accolade : `${` est le début d'un
 * PLACEHOLDER de gabarit, pas un symbole dollar — sans cette exclusion le scan relevait des lignes
 * de `toFixed(4)` sur des TAUX DE CHANGE (mesuré : 5 faux positifs de cette seule cause).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stripCommentsJsx } from '../../utils/stripComments';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const COMPOSE_A_LA_MAIN = [
    /toLocaleString\([^)]*\)[^\n]{0,12}\$(?!\{)/,
    /toFixed\(\d\)[^\n]{0,8}\$(?!\{)/,
];

const files = readdirSync(path.join(ROOT, 'components'), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => path.join(ROOT, 'components', f));

describe('[FORMAT] tout montant de l\'UI passe par utils/format.ts', () => {
    it('a bien des fichiers à scanner', () => {
        expect(files.length).toBeGreaterThan(100);
    });

    it('aucun montant composé à la main dans components/', () => {
        const offenders: string[] = [];
        for (const file of files) {
            // Source DÉCOMMENTÉE : un commentaire qui EXPLIQUE le motif interdit — comme celui en
            // tête de ce fichier — ne doit pas faire rougir la garde (`SCAN-QUI-MATCHE-LA-PROSE`).
            const code = stripCommentsJsx(readFileSync(file, 'utf8'));
            code.split('\n').forEach((l, i) => {
                if (!COMPOSE_A_LA_MAIN.some((m) => m.test(l))) return;
                offenders.push(`${path.relative(ROOT, file)}:${i + 1}  ${l.trim().slice(0, 110)}`);
            });
        }
        expect(
            offenders,
            'montant composé à la main. Utilise formatCAD (montant plein), formatCompactCAD (k$/M$) '
            + 'ou formatSigned(n, { withCurrency: true }) (signe préservé) — utils/format.ts.',
        ).toEqual([]);
    });

    it('le motif TIRE : il reconnaît les quatre formes que ce lot a retirées', () => {
        // Sans ce cas, « zéro offender » ne distingue pas « tout est propre » d'un motif mort.
        // Les quatre témoins sont les formes RÉELLES trouvées dans le dépôt, pas des inventions.
        const temoins = [
            "const cad = (v) => `${Math.round(v).toLocaleString('fr-CA')}$`;",
            "value={`${(fireNumber / 1000).toFixed(0)}k $`}",
            "const fmtM = (v) => `${(v / 1_000_000).toFixed(2)}M$`;",
            "`${n >= 0 ? '+' : '-'}${Math.abs(Math.round(n)).toLocaleString('fr-CA')} $`",
        ];
        for (const t of temoins) {
            expect(COMPOSE_A_LA_MAIN.some((m) => m.test(t)), t).toBe(true);
        }
        // …et il LAISSE passer ce qui n'est pas un montant : un taux de change à 4 décimales suivi
        // d'un placeholder de gabarit. C'est le faux positif que l'exclusion `(?!\{)` supprime.
        const innocent = 'const s = `USD=${state.fxRates.USD.toFixed(4)} · EUR=${state.fxRates.EUR.toFixed(4)}`;';
        expect(COMPOSE_A_LA_MAIN.some((m) => m.test(innocent))).toBe(false);
    });
});
