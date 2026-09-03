// tests/toLocaleStringMoneyScan.test.ts
//
// [FMT-TOLOCALESTRING-MONEY] Le SCAN, livré AVANT les correctifs — ses offenders SONT le périmètre.
//
// ⚠️ Règle du dépôt appliquée à la lettre : « resserrer le scan-garde AVANT de coder le fix ». Le
// ticket unifie cinq tickets antérieurs mesurés à trois dates (45 → 77 sites) ; aucun de ces chiffres
// ne se recopie, ils se RE-MESURENT ici. Et aucune garde du dépôt n'interdisait ce motif jusqu'ici —
// `chartPrivacyScan` ne le couvre pas.
//
// ⚠️ POURQUOI CE MOTIF EST UN DÉFAUT. `formatCAD` est la source unique du format monétaire ; elle
// garde les valeurs non finies (« — » plutôt que « NaN$ ») et pose l'espace insécable des milliers.
// Un `toLocaleString('fr-CA')` nu court-circuite les deux : il rend « NaN$ » sur une valeur sale et
// diverge du reste de l'app à la première évolution du format.
//
// ⚠️ CE QUE LE SCAN NE FAIT PAS. Il ne juge PAS les dates (`toLocaleString` y est le bon outil) ni
// les COMPTEURS (`configCount.toLocaleString()` — c'est `formatNumber` qui s'y applique, pas
// `formatCAD` ; hors périmètre du ticket, qui vise les MONTANTS). Ces deux exclusions sont
// déclarées, testées par témoin, et chiffrées — un périmètre borné en silence se lit comme
// « tout est couvert » (`CRITERE-D-INCLUSION-TROP-ETROIT-EST-LE-BUG`).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { describe, it, expect } from 'vitest';
import { stripCommentsJsx } from '../utils/stripComments';

const RACINES = ['components', 'services', 'hooks', 'store', 'mcp', 'utils'];

const fichiersProd = (): string[] => {
    const out: string[] = [];
    const marcher = (dir: string): void => {
        for (const e of readdirSync(dir)) {
            const p = join(dir, e);
            if (statSync(p).isDirectory()) { marcher(p); continue; }
            if (!['.ts', '.tsx'].includes(extname(p))) continue;
            if (p.includes('.test.') || p.includes('.spec.')) continue;
            if (p === join('utils', 'format.ts')) continue; // LA source unique : c'est son travail
            out.push(p);
        }
    };
    for (const r of RACINES) marcher(r);
    return out;
};

/** Clés d'options qui prouvent un usage de DATE — `toLocaleString` y est le bon outil. */
const OPTIONS_DATE = /\b(hour|minute|second|weekday|dateStyle|timeStyle|era|timeZone|day|month|year)\b/;
/**
 * Récepteurs qui sont manifestement une DATE.
 *
 * ⚠️ `Ts` s'écrit avec une MAJUSCULE, jamais `[Tt]s` : la classe minuscule matchait `debts`,
 * `assets`, `amounts`, `results` — les noms les plus courants du dépôt pour des grandeurs
 * MONÉTAIRES. Un futur `totalDebts.toLocaleString('fr-CA')` aurait été classé « date », donc
 * jamais compté, et le plafond de l'inventaire serait resté VERT sur une régression neuve : le
 * mode de panne exact que cette garde existe pour empêcher. Aucune des 78 occurrences du jour
 * n'exploitait le trou (le compte 67 était donc juste), il était structurel — un faux négatif
 * SILENCIEUX, à l'opposé d'un faux positif qui, lui, fait rougir bruyamment.
 */
const RECEPTEUR_DATE = /(new Date\([^)]*\)|[A-Za-z_$][\w$]*(?:[Dd]ate|[Tt]ime|Ts|At)\b)$/;

interface Occurrence {
    fichier: string;
    ligne: number;
    extrait: string;
    /**
     * La fenêtre EXACTE sur laquelle `classer` a tranché (40 caractères à partir de l'appel).
     * ⚠️ `extrait` n'est PAS cette fenêtre : il part du début de la ligne et s'arrête à 110
     * caractères, donc sur une ligne JSX longue il peut ne même plus contenir l'appel. Une
     * assertion posée dessus contrôlerait autre chose que ce qui a produit la décision — « un
     * contrôle de perturbation doit viser la même PORTÉE que la perturbation », appliqué ici au
     * contrôle d'une CLASSIFICATION.
     */
    fenetre: string;
}

/**
 * La fenêtre sur laquelle la décision se prend : 40 caractères À PARTIR de l'appel.
 * Exportée en une fonction plutôt que recopiée, pour que le contrôle du test regarde EXACTEMENT
 * ce que le classificateur a lu (deux écritures de la même fenêtre divergent en silence).
 */
const fenetreDeClassement = (ligne: string, index: number): string => ligne.slice(index).slice(0, 40);

/** Découpe la ligne autour de l'appel : récepteur (avant le `.`) et arguments (après). */
function classer(ligne: string, index: number): 'date' | 'compteur' | 'montant' {
    const avant = ligne.slice(0, index).trimEnd().replace(/\.$/, '');
    const apres = ligne.slice(index);
    if (OPTIONS_DATE.test(apres.slice(0, 160))) return 'date';
    if (RECEPTEUR_DATE.test(avant)) return 'date';
    // Un MONTANT se reconnaît à son signe de dollar juste après, ou au fait qu'on l'ait arrondi /
    // pris en valeur absolue avant de le formater — deux gestes qu'on ne fait pas sur un compteur.
    // ⚠️ `\$` échappé dans un littéral de gabarit compte aussi (`…')\\$/an` vu dans assetLocation).
    if (/\\?\$(?!\{)/.test(fenetreDeClassement(ligne, index))) return 'montant';
    if (/(Math\.(round|abs|max|min)\([^)]*\)|Fraction)/.test(avant) || /Fraction/.test(apres.slice(0, 120))) return 'montant';
    return 'compteur';
}

function scanner(): { montants: Occurrence[]; dates: number; compteurs: Occurrence[]; partCode: number } {
    const montants: Occurrence[] = [];
    const compteurs: Occurrence[] = [];
    let dates = 0, brut = 0, code = 0;
    for (const f of fichiersProd()) {
        const src = readFileSync(f, 'utf8');
        const decom = stripCommentsJsx(src);
        brut += src.replace(/\s/g, '').length; code += decom.replace(/\s/g, '').length;
        decom.split('\n').forEach((ligne, i) => {
            let from = 0;
            for (;;) {
                const k = ligne.indexOf('toLocaleString', from);
                if (k === -1) break;
                from = k + 1;
                const o: Occurrence = { fichier: f, ligne: i + 1, extrait: ligne.trim().slice(0, 110), fenetre: fenetreDeClassement(ligne, k) };
                const cls = classer(ligne, k);
                if (cls === 'date') dates++;
                else if (cls === 'compteur') compteurs.push(o);
                else montants.push(o);
            }
        });
    }
    // Anti-vacuité AGRÉGÉE : à l'échelle d'un dépôt, `partDeCodeRestante` se somme au lieu de se
    // moyenner — un fichier à 88 % de prose fausserait une moyenne par fichier, pas un total
    // (`UN-DECOMMENTEUR-NAIF-MANGE-LE-CODE-APRES-UNE-URL`, corollaire d'échelle).
    return { montants, dates, compteurs, partCode: code / Math.max(1, brut) };
}

describe('[FMT-TOLOCALESTRING-MONEY] le scan qui définit le périmètre', () => {
    const r = scanner();

    it('le scan VOIT quelque chose, sur du code décommenté (anti-vacuité)', () => {
        // Part du code NON BLANC qui survit au décommentage, AGRÉGÉE sur les 6 racines de prod.
        // MESURÉ le 2026-09-03 : 0,583 — ces fichiers sont denses en prose par convention de dépôt,
        // 42 % des caractères non blancs sont du commentaire. Le seuil est posé à 0,45 : ce que la
        // garde doit attraper est un décommenteur qui AVALE le code (ratio proche de 0), pas une
        // dérive de densité de commentaires, qui la rendrait bombe à retardement. J'ai écrit 0,9
        // puis 0,45 AVANT de mesurer les deux fois : le seuil se pose APRÈS le chiffre
        // (`UN-SEUIL-D-ANTI-VACUITE-APPARTIENT-A-LA-PORTEE-QU-IL-MESURE`).
        expect(r.partCode).toBeGreaterThan(0.45);
        // Et il trouve les TROIS familles : un scan qui n'en verrait qu'une classerait mal.
        expect(r.montants.length + r.compteurs.length + r.dates).toBeGreaterThan(40);
        expect(r.dates).toBeGreaterThan(5);
    });

    it('le décommentage FONCTIONNE : la prose qui cite le motif n\'est pas comptée', () => {
        // `PatrimoineExtended.tsx` explique en commentaire la règle « pas de `toLocaleString` nu ».
        // Un scan qui la compterait accuserait le fichier qui documente l'interdiction
        // (`SCAN-QUI-MATCHE-LA-PROSE`, re-payé quatre fois dans ce dépôt).
        const brut = readFileSync('components/PatrimoineExtended.tsx', 'utf8');
        expect(brut).toContain('toLocaleString');                       // la prose existe…
        expect(stripCommentsJsx(brut)).not.toContain('toLocaleString'); // …et le scan ne la voit pas
    });

    it('INVENTAIRE des montants à corriger — ce compte EST le périmètre du ticket', () => {
        // ⚠️ Ce test ne fait pas rougir le dépôt aujourd'hui : il ÉPINGLE le compte mesuré pour que
        // le prochain ajout soit visible, et pour que chaque lot de correction le fasse BAISSER.
        // Une borne s'écrit dans les DEUX sens (`UN-INVENTAIRE-DE-DETTE-DOIT-SAVOIR-MOURIR`).
        const n = r.montants.length;
        // eslint-disable-next-line no-console
        console.log(`[FMT-TOLOCALESTRING-MONEY] montants=${n} · compteurs=${r.compteurs.length} · dates=${r.dates}`);
        expect(n, `Un ${n > 67 ? 'NOUVEAU' : ''} montant formaté sans passer par formatCAD. `
            + `Mesuré 67 le 2026-09-03 (81 occurrences brutes, 3 en commentaire, 78 en code : `
            + `67 montants, 9 dates, 2 compteurs — classification relue À LA MAIN, ligne par ligne). `
            + `Si tu en AJOUTES un, utilise formatCAD ; si tu en CORRIGES, baisse ce compte — et `
            + `quand il atteint 0, SUPPRIME cette garde, sa dette est payée.`)
            .toBeLessThanOrEqual(67);
        expect(n, 'Dette à ZÉRO : retire cette garde et le ticket, ils n\'ont plus d\'objet.')
            .toBeGreaterThan(0);
    });

    it('les fichiers MONEY-CRITICAL du ticket sont bien dans le périmètre mesuré', () => {
        // Le ticket nomme `cashflowAllocation.ts` (logs de flux). Un scan qui ne le verrait pas
        // mesurerait autre chose que ce que le ticket décrit — vérifié plutôt que supposé.
        const fichiers = new Set(r.montants.map(m => m.fichier));
        expect([...fichiers].some(f => f.includes('cashflowAllocation'))).toBe(true);
        expect([...fichiers].some(f => f.includes('taxDecember'))).toBe(true);
    });

    it('le classificateur ne prend PAS un montant pour une date (témoins nommés)', () => {
        // ⚠️ Ces témoins viennent d'une revue, pas de mon imagination : `[Tt]s` matchait `ts`
        // minuscule, donc `debts`, `assets`, `amounts`, `results` — les noms les plus courants du
        // dépôt pour des grandeurs MONÉTAIRES. Le trou était SILENCIEUX : un montant classé « date »
        // n'entre pas dans l'inventaire, et le plafond reste vert sur une régression neuve.
        const cls = (l: string) => classer(l, l.indexOf('toLocaleString'));
        for (const nom of ['totalDebts', 'assets', 'amounts', 'results']) {
            expect(cls(`logs.push(\`Solde : \${${nom}.toLocaleString('fr-CA')} $\`);`), nom).toBe('montant');
        }
        // …et les VRAIES dates restent des dates : sans ce second sens, resserrer le motif jusqu'à
        // ne plus rien reconnaître satisferait le premier.
        for (const nom of ['createdAt', 'updatedTime', 'startDate']) {
            expect(cls(`const s = ${nom}.toLocaleString('fr-CA');`), nom).toBe('date');
        }
    });

    it('une interpolation `${` n\'est pas prise pour un signe de dollar', () => {
        // `${` contient un `$` — piège déjà payé par le dépôt. Ici le sens d'erreur serait
        // BRUYANT (compte gonflé ⇒ ratchet rouge) et non silencieux, mais le motif est ancré quand
        // même : un compteur suivi d'une autre interpolation reste un compteur.
        const l = 'const t = `${n.toLocaleString(\'fr-CA\')}${suffixe} élément${n > 1 ? \'s\' : \'\'}`;';
        expect(classer(l, l.indexOf('toLocaleString'))).toBe('compteur');
        // Contre-témoin : le VRAI dollar, lui, est bien vu.
        const m = "<span>{n.toLocaleString('fr-CA')} $</span>";
        expect(classer(m, m.indexOf('toLocaleString'))).toBe('montant');
    });

    it('les COMPTEURS sont exclus avec leur mesure, pas en silence', () => {
        // `configCount.toLocaleString()` n'est pas un montant : c'est `formatNumber` qui s'y
        // applique. Hors périmètre du ticket — mais le dire, chiffré, pour qu'un lecteur ne croie
        // pas que « tout est couvert ».
        expect(r.compteurs.length).toBeGreaterThan(0);
        expect(r.compteurs.every(c => !/\$/.test(c.fenetre))).toBe(true);
        // ⚠️ Sur les DEUX compteurs d'aujourd'hui, `fenetre` et `extrait` se recouvrent : remplacer
        // l'un par l'autre ne fait rougir personne (perturbation MESURÉE, muette). L'assertion est
        // donc une PRÉCAUTION, écrite comme telle plutôt que couverte par une fixture qui
        // n'exercerait rien — c'est le test ci-dessous qui prouve que les deux fenêtres PEUVENT
        // diverger, et pourquoi c'est `fenetre` qu'il faut lire.
        // ⚠️ Le rembourrage doit être du CODE, pas des espaces : `extrait` fait un `trim()` avant de
        // couper, donc des espaces de tête ne décaleraient rien.
        const longue = `<td className="${'x'.repeat(120)}">` + "{n.toLocaleString('fr-CA')} $</td>";
        const k = longue.indexOf('toLocaleString');
        expect(fenetreDeClassement(longue, k)).toContain('toLocaleString');
        expect(longue.trim().slice(0, 110)).not.toContain('toLocaleString');
    });
});
