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
    // [FMT-MONTANTS-COMPOSES-A-LA-MAIN] La forme que les deux premiers ne voient PAS : une
    // interpolation nue suivie du symbole (`+${payout}$`, `${Math.round(v)} $`). Elle n'appelle
    // aucune fonction de formatage, donc aucune garde ne la cherchait. C'est elle qui a laissé
    // « Maladie grave (capital +250000$) » à 36 lignes d'un site migré (revue du lot 101).
    /\$\{[^{}]*\} ?\\?\$(?!\{)/,
];

/**
 * ⚠️ PÉRIMÈTRE ÉLARGI au lot 103 : `components/` NE SUFFIT PAS. La classe vit aussi dans les
 * journaux du moteur et dans les résumés d'outils MCP — deux surfaces que cette garde ne regardait
 * pas, et où le recensement a trouvé de vrais montants sans séparateur.
 */
const RACINES = ['components', 'services', 'mcp'];

const files = RACINES.flatMap((r) => readdirSync(path.join(ROOT, r), { recursive: true, encoding: 'utf8' })
    .filter((f) => (f.endsWith('.tsx') || f.endsWith('.ts')) && !f.includes('.test.') && !f.includes('.spec.'))
    .map((f) => path.join(ROOT, r, f)));

/**
 * EXEMPTIONS DÉCLARÉES — jamais un périmètre borné en silence
 * (`CRITERE-D-INCLUSION-TROP-ETROIT-EST-LE-BUG` : « déclarer aussi ce qu'on EXCLUT, chiffré et
 * motivé »). Mesuré le 2026-09-03 : 19 lignes restantes, dont **2 faux positifs** et **17 sites
 * de TEXTE POUR UN MODÈLE**, aucune surface d'écran.
 *
 * ⚠️ Ces 17 sites ne sont PAS « à corriger plus tard par oubli » : un prompt n'est pas un écran.
 * `BudgetAiModal`/`claude.ts` arrondissent DÉLIBÉRÉMENT à 100 $ — c'est la vie privée, et le texte
 * de consentement de l'app le promet en toutes lettres (« montants arrondis à 100$ »). Y appliquer
 * `formatCAD` changerait ce que le modèle LIT, et son repli « — » remplacerait une omission déjà
 * traitée sur place. La question « le texte destiné à un modèle doit-il passer par le formateur
 * d'écran ? » est routée à Marc, elle n'est pas tranchée ici.
 */
const EXEMPTIONS: Array<{ fichier: string; raison: string }> = [
    { fichier: 'components/budget/BudgetAiModal.tsx', raison: 'prompt LLM — arrondi à 100 $ DÉLIBÉRÉ (vie privée, promis dans le texte de consentement)' },
    { fichier: 'services/claude.ts', raison: 'prompt LLM — `roundToHundred` volontaire, même raison' },
    { fichier: 'services/aiChat/viewContext.ts', raison: 'prompt LLM — helper qui rend `null` (jamais un 0 plausible) ; sa règle est écrite sur place' },
    { fichier: 'mcp/ingest/applyDocument.ts', raison: 'résumés d\'outils MCP lus par un modèle, pas par un écran' },
    { fichier: 'components/TaxCenter.tsx', raison: 'FAUX POSITIF mesuré : `${b.max} $` est la branche NON-numérique du ternaire (le cas nombre passe déjà par formatCAD)' },
];

describe('[FORMAT] tout montant de l\'UI passe par utils/format.ts', () => {
    it('a bien des fichiers à scanner', () => {
        expect(files.length).toBeGreaterThan(100);
    });

    it('aucun montant composé à la main dans components/, services/ et mcp/', () => {
        const offenders: string[] = [];
        for (const file of files) {
            const rel = path.relative(ROOT, file);
            if (EXEMPTIONS.some((e) => e.fichier === rel)) continue;
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

    it('le 3e motif TIRE sur l\'interpolation nue — la forme que les deux autres ratent', () => {
        // Témoins RÉELS du dépôt, corrigés au lot 103 : ils ne contiennent ni `toLocaleString` ni
        // `toFixed`, donc les deux premiers motifs étaient aveugles.
        for (const t of [
            "state.logLife(`🩺 Maladie grave (capital +${payout}\\$, dépenses +${extra}\\$/mois)`);",
            "<div>{info.monthly > 0 ? `${info.monthly}$/m` : 'Gratuit'}</div>",
            "return `${Math.round(v)} $`;",
        ]) {
            expect(COMPOSE_A_LA_MAIN[2].test(t), t).toBe(true);
        }
        // …et il laisse passer un pourcentage ou une unité qui n'est pas le dollar.
        expect(COMPOSE_A_LA_MAIN[2].test('const s = `${taux} %`;')).toBe(false);
    });

    it('aucune EXEMPTION fantôme : chacune a encore un objet', () => {
        // Un registre censé DÉCROÎTRE a besoin d'une garde sur l'obsolescence de ses entrées,
        // pas seulement sur leur forme — sinon il continue d'affirmer un défaut corrigé
        // (`ENTREE-D-INVENTAIRE-FANTOME`). Chaque exemption doit encore contenir la forme qu'elle
        // excuse, sinon elle se retire.
        for (const e of EXEMPTIONS) {
            const code = stripCommentsJsx(readFileSync(path.join(ROOT, e.fichier), 'utf8'));
            const touche = code.split('\n').some((l) => COMPOSE_A_LA_MAIN.some((m) => m.test(l)));
            expect(touche, `${e.fichier} n'a plus de montant composé à la main : retire son exemption (${e.raison}).`).toBe(true);
        }
    });
});
