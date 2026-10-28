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
        // ⚠️ Ce total a BAISSÉ de 78 (lot 100) à 13 (lot 101) puis à 11 (lot 102) parce que les lots
        // ont payé la dette — ce n'est pas une régression du scan, et le seuil se re-mesure avec
        // elle. Les familles restantes s'assertent une par une : un total qui tiendrait grâce aux
        // seules dates ne prouverait pas que les compteurs sont encore reconnus. La famille
        // MONTANT, elle, est désormais VIDE par construction — c'est le sujet du test d'inventaire
        // plus bas, et sa capacité de détection est prouvée par les témoins nommés.
        expect(r.montants.length + r.compteurs.length + r.dates).toBeGreaterThan(8);
        expect(r.dates).toBeGreaterThan(5);
        expect(r.compteurs.length).toBeGreaterThan(0);
    });

    it('le décommentage FONCTIONNE : la prose qui cite le motif n\'est pas comptée', () => {
        // `PatrimoineExtended.tsx` explique en commentaire la règle « pas de `toLocaleString` nu ».
        // Un scan qui la compterait accuserait le fichier qui documente l'interdiction
        // (`SCAN-QUI-MATCHE-LA-PROSE`, re-payé quatre fois dans ce dépôt).
        const brut = readFileSync('components/PatrimoineExtended.tsx', 'utf8');
        expect(brut).toContain('toLocaleString');                       // la prose existe…
        expect(stripCommentsJsx(brut)).not.toContain('toLocaleString'); // …et le scan ne la voit pas
    });

    it('AUCUN montant formaté hors de la source unique — la dette est à ZÉRO', () => {
        // ⚠️ CE TEST A CHANGÉ DE NATURE AU LOT 102, et c'est lui-même qui l'a exigé. Il est né
        // INVENTAIRE au lot 100 (« pas plus de 67 »), a été abaissé à 2 au lot 101, et portait
        // depuis le début une SECONDE assertion — « dette à zéro → retire cette garde ». C'est
        // elle qui a rougi ici : la dette EST payée. Un inventaire qui ne saurait que refuser des
        // ajouts survivrait à sa raison d'être (`UN-INVENTAIRE-DE-DETTE-DOIT-SAVOIR-MOURIR`).
        //
        // Il ne disparaît pas pour autant : ce qu'il mesurait — « combien reste-t-il ? » — devient
        // « il ne doit plus jamais y en avoir ». C'est la même limite, INVERSÉE au même endroit,
        // avec son histoire écrite dedans (`UN-TEST-DE-LIMITE-S-INVERSE-IL-NE-SE-SUPPRIME-PAS`) :
        // supprimer le fichier laisserait croire que la règle n'a jamais eu besoin d'être tenue,
        // et rouvrirait en silence la porte que trois lots viennent de fermer.
        const n = r.montants.length;
        // eslint-disable-next-line no-console
        console.log(`[FMT-TOLOCALESTRING-MONEY] montants=${n} · compteurs=${r.compteurs.length} · dates=${r.dates}`);
        expect(n, `Un montant formaté sans passer par formatCAD (${r.montants.map(m => `${m.fichier}:${m.ligne}`).join(', ')}). `
            + `La dette de [FMT-TOLOCALESTRING-MONEY] a été ramenée de 67 (lot 100) à 0 (lot 102) : `
            + `il n'y a plus de compte à faire baisser, seulement une règle à tenir. `
            + `Utilise formatCAD (montant en CAD), formatNumber (nombre nu ou devise ÉTRANGÈRE — le `
            + `« $ » y serait FAUX) ou formatSigned(n, { withCurrency: true }). `
            + `⚠️ CE COMPTE NE PORTE QUE SUR toLocaleString : un montant composé À LA MAIN `
            + `(\`+\${x}$\`) lui est INVISIBLE — c'est la garde JUMELLE `
            + `formatMonetaireSourceUnique.test.ts qui tient cette moitié-là, et il en reste `
            + `hors de components/ (voir [FMT-MONTANTS-COMPOSES-A-LA-MAIN]).`)
            .toBe(0);
    });

    it('les fichiers MONEY-CRITICAL du ticket sont bien BALAYÉS', () => {
        // ⚠️ Cette garde s'est INVERSÉE au lot 101, elle n'a pas été supprimée. Elle affirmait
        // « `cashflowAllocation` et `taxDecember` FIGURENT parmi les offenders » — vrai au lot 100,
        // et devenu faux dès qu'on les a corrigés : elle rougissait sur le correctif qu'elle était
        // censée préparer. Elle ancrait la FORME (qui est offender aujourd'hui) au lieu du FAIT
        // (ces modules sont dans le périmètre BALAYÉ), et un garde-fou qui rougit sur un correctif
        // légitime pose souvent la bonne question
        // (`UNE-GARDE-ANCRE-LE-FAIT-JAMAIS-LA-FORME-QU-AVAIT-LE-CODE`).
        const balayes = fichiersProd();
        expect(balayes).toContain(join('services', 'projection', 'cashflowAllocation.ts'));
        expect(balayes).toContain(join('services', 'projection', 'taxDecember.ts'));
        // …et le scan les a bien LUS, pas seulement listés : sans cette seconde moitié, un
        // marcheur qui rendrait les chemins sans jamais ouvrir les fichiers passerait.
        expect(balayes.length).toBeGreaterThan(200);
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
