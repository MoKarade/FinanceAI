/**
 * [FISC-CONST-GUARD-V2] Aucune constante fiscale NOUVELLE ne doit apparaître dans le moteur sans
 * être triée.
 *
 * Le garde existant (`FISC-CONST-LINT`) interdit de RECOPIER un littéral de `utils/tax.ts`. Il est
 * aveugle au cas inverse — une constante fiscale nouvelle, née directement dans le moteur, que rien
 * ne compare à rien. C'est par ce trou que `estimatedWithholding = totalEmployerTax * 0.92` est
 * passé : un chiffre sans source, invisible pendant des mois.
 *
 * Mode RATCHET (et non échec dur) : le périmètre a été MESURÉ d'abord — 38 littéraux existants,
 * dont de vrais paramètres fiscaux ET des heuristiques de conception à ne surtout pas confondre.
 * Un échec dur aurait cassé sur 38 lignes, donc aurait été relâché. Ici l'existant est inventorié
 * AVEC SA RAISON, et tout NOUVEAU littéral fait échouer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    findFiscalConstants,
    inventoryIndex,
    inventoryKey,
    FISCAL_CONST_INVENTORY,
    FISCAL_MODULES,
    FISCAL_MODULES_HORS_PERIMETRE,
} from '../utils/fiscalConstGuardV2';

const root = process.cwd();

describe('[FISC-CONST-GUARD-V2] relevé des littéraux (DISCRIMINANT)', () => {
    it('relève un littéral en position de CALCUL — le cas 0.92', () => {
        const hits = findFiscalConstants('const wht = totalEmployerTax * 0.92;');
        expect(hits.map((h) => h.value)).toContain('0.92');
    });

    it('relève un littéral en position de COMPARAISON (âge-seuil)', () => {
        expect(findFiscalConstants('if (age >= 71) convert();').map((h) => h.value)).toContain('71');
    });

    it('relève un littéral de REPLI (`|| 0.20`) — raté par le premier jet du scan', () => {
        // Un vrai facteur FERR (20 % au plateau 95+) échappait au scan initial : `||` ne
        // ressemblait pas à un opérateur de calcul. Constaté en mesurant, pas en raisonnant.
        expect(findFiscalConstants('const r = RRIF_RATES[age] || 0.20;').map((h) => h.value)).toContain('0.20');
    });

    it('relève le 1er ARGUMENT d’un appel — les DEUX barèmes qui s’y cachaient', () => {
        // [FISC-GUARD-ARGUMENT] Quatrième position ajoutée le 2026-08-22. Ces deux lignes sont les
        // VRAIES du dépôt (`retirementIncome.ts`), pas des exemples : l’âge de début de la période
        // cotisable RRQ et la borne légale d’anticipation. Aucune des deux n’avait de clé.
        expect(findFiscalConstants('const a = Math.max(18, residencyStart - birthYear);').map((h) => h.value))
            .toContain('18');
        expect(findFiscalConstants('let s = Math.min(72, Math.max(60, goal.rrqStartAge ?? d));').map((h) => h.value))
            .toEqual(expect.arrayContaining(['72', '60']));
    });

    it('IGNORE une parenthèse de PROSE — pourquoi le motif exige un identifiant collé', () => {
        // ⚠️ Le premier motif mesuré était `/[(,]$/`, plus large. Il relevait « (18 ans) » dans un
        // message UTILISATEUR de `childrenReee.ts` : `SCAN-QUI-MATCHE-LA-PROSE`, cette fois dans un
        // littéral de CHAÎNE — que `stripComments` ne touche pas. Exiger `\w` avant la parenthèse
        // sépare l’appel de fonction du texte, sans rien perdre : mesuré, les DEUX barèmes ci-dessus
        // sont toujours relevés et le faux positif disparaît.
        const prose = findFiscalConstants('logs.push(`🚗 Cadeau voiture pour ${n} (18 ans) : -${c} $`);');
        expect(prose.map((h) => h.value)).not.toContain('18');
    });

    it('`60` n’est PLUS bénin — et ses quatre sens sont bien distincts', () => {
        // [FISC-GUARD-BENIGN-60] Il y était comme « secondes/minutes », or aucune des occurrences du
        // dépôt n’est une durée. Une seule est fiscale (l’anticipation RRQ) : c’est justement pour ça
        // qu’une exemption globale était le mauvais outil — elle range quatre sens sous un seul.
        expect(findFiscalConstants('if (age < 60) return 0.003;').map((h) => h.value)).toContain('60');
        expect(findFiscalConstants('x *= (proj.ltdIncomeReplacementPct ?? 60) / 100;').map((h) => h.value)).toContain('60');
        // Contre-épreuve : les vrais bénins restent bénins, sinon on aurait juste tout ouvert.
        expect(findFiscalConstants('const m = i * 12; const p = x / 100;').map((h) => h.value)).toEqual([]);
    });

    it('IGNORE les littéraux bénins (indices, mois, pourcentage)', () => {
        const hits = findFiscalConstants('const pct = x / 100; const m = i * 12; if (n > 0) y = 1;');
        expect(hits.map((h) => h.value)).toEqual([]);
    });

    it('IGNORE un littéral en COMMENTAIRE (exemple de doc, référence ARC)', () => {
        expect(findFiscalConstants('// le plafond REER est de 18 % du revenu gagné')).toEqual([]);
        expect(findFiscalConstants('/* seuil 58523 */\nconst x = 1;')).toEqual([]);
    });

    it('ne relève pas un littéral collé à un identifiant ou une propriété', () => {
        expect(findFiscalConstants('const x = RRSP_ANNUAL_LIMITS.y2026 * 1;').map((h) => h.value)).toEqual([]);
    });
});

describe('[FISC-CONST-GUARD-V2] intégrité de l’inventaire', () => {
    it('chaque entrée porte une RAISON lisible — une entrée sans raison ne vaut rien', () => {
        for (const e of FISCAL_CONST_INVENTORY) {
            expect(e.reason.length, `${e.file}::${e.value} sans raison`).toBeGreaterThan(30);
        }
    });

    it('aucun doublon de clé (fichier, valeur)', () => {
        const keys = FISCAL_CONST_INVENTORY.map((e) => inventoryKey(e.file, e.value));
        expect(keys.length).toBe(new Set(keys).size);
    });

    it('l’inventaire ne référence que des modules RÉELLEMENT scannés', () => {
        // Une entrée pointant un fichier hors scan serait du bruit qui ne protège rien.
        const scanned = new Set<string>(FISCAL_MODULES);
        const orphans = FISCAL_CONST_INVENTORY.filter((e) => !scanned.has(e.file)).map((e) => e.file);
        expect([...new Set(orphans)]).toEqual([]);
    });

    it('aucune entrée FANTÔME : chaque clé correspond à un littéral qui existe VRAIMENT', () => {
        // ⚠️ Trouvé en revue de `[RQAP-CAP-98K]` (2026-08-20). En important `RQAP_MAX_INCOME`, le
        // littéral `98000` a disparu de `childrenReee.ts` — mais son entrée d'inventaire est restée,
        // à décrire comme VIVANT (« à remplacer par un import ») un défaut que la PR venait de
        // fermer. Le seul `98000` restant était dans un COMMENTAIRE, que `stripComments` efface.
        //
        // Aucune garde ne le voyait : l'inventaire vérifiait les modules orphelins (niveau FICHIER),
        // les doublons de clé et les comptes — jamais l'EXISTENCE de la valeur. Or le sens de ce
        // fichier est de DÉCROÎTRE à mesure que les constantes sont ancrées et importées ; une
        // entrée à zéro occurrence est exactement le signal « c'est réglé, supprime-moi », et le
        // laisser passer transforme un constat daté en affirmation fausse sur le code de prod.
        const fantomes: string[] = [];
        for (const e of FISCAL_CONST_INVENTORY) {
            const hits = findFiscalConstants(readFileSync(resolve(root, e.file), 'utf-8'))
                .filter((h) => h.value === e.value);
            if (hits.length === 0) fantomes.push(`${e.file}::${e.value}`);
        }
        expect(
            fantomes,
            `Entrée(s) sans littéral correspondant — le défaut est RÉGLÉ, supprime l’entrée :\n${fantomes.join('\n')}`,
        ).toEqual([]);
    });

    it('une clé qui recouvre PLUSIEURS occurrences le DÉCLARE, et le compte est JUSTE', () => {
        // ⚠️ [FISC-GUARD-SCOPE] L'index est (fichier, valeur), PAS la ligne — un numéro de ligne
        // dérive au premier refactor. Le prix : dans `childrenReee.ts`, `0.20` est À LA FOIS le taux
        // de SCEE (barème ARC) et le taux d'impôt sur le PRA (approximation), et `500` recouvre
        // TROIS sens. Une raison qui n'en décrit qu'un certifie « trié » ce que personne n'a regardé.
        //
        // ⚠️ HISTOIRE DE CETTE GARDE, parce qu'elle explique sa forme. Première version (#666) :
        // « soit `[×N]`, soit N références `L<n>` ». Elle ne VÉRIFIAIT pas les `L<n>` — limite
        // documentée comme assumée. Elle a mordu dans la PR suivante : j'ai cité `L285` pour un
        // littéral vivant en `L75`. J'ai donc voulu vérifier les numéros… et la vérification a sorti
        // 16 entrées, dont une partie n'était fausse que parce que MES PROPRES éditions avaient
        // décalé le fichier. C'était réintroduire, dans la PROSE, le couplage à la ligne que la CLÉ
        // évite par conception — et se condamner à un rouge à chaque refactor.
        //
        // Forme retenue : un compte, jamais un numéro. `[×N]` = N occurrences de MÊME sens ;
        // `[≠N]` = N occurrences de sens DIFFÉRENTS, que la prose décrit en NOMMANT les constructions
        // (un nom ne dérive pas). N ne bouge que si une occurrence apparaît ou disparaît — c'est
        // précisément le moment où il FAUT re-regarder, et c'est ce qui s'est produit aujourd'hui
        // quand `rqapCapProjected` a ajouté un second `0.5` dans `childrenReee.ts`.
        const manquants: string[] = [];
        let clesMultiples = 0;

        for (const e of FISCAL_CONST_INVENTORY) {
            const src = readFileSync(resolve(root, e.file), 'utf-8');
            const lignes = new Set(findFiscalConstants(src).filter((h) => h.value === e.value).map((h) => h.line));
            if (lignes.size < 2) continue;
            clesMultiples++;
            const marque = e.reason.match(/^\[([×≠])(\d+)\]/);
            if (!marque) {
                manquants.push(`${e.file}::${e.value} — ${lignes.size} occurrences, aucune marque [×N] ou [≠N] en tête`);
            } else if (Number(marque[2]) !== lignes.size) {
                manquants.push(`${e.file}::${e.value} — marque [${marque[1]}${marque[2]}] mais ${lignes.size} occurrences RÉELLES : une occurrence est apparue ou a disparu, il faut la regarder`);
            }
        }

        // ANTI-VACUITÉ : si plus aucune clé n'est multiple, cette garde ne vérifie RIEN.
        expect(clesMultiples, 'aucune clé multiple → cette garde ne prouve plus rien').toBeGreaterThanOrEqual(8);
        expect(manquants, `Clé(s) multiples mal déclarées :\n${manquants.join('\n')}`).toEqual([]);
    });

    it('le périmètre EXCLU est déclaré, réel, et vraiment hors scan', () => {
        // Un périmètre borné en silence se lit comme « tout est couvert ». On vérifie que chaque
        // exclusion existe encore, produirait vraiment du bruit, et n'est pas scannée par ailleurs.
        const scanned = new Set<string>(FISCAL_MODULES);
        expect(FISCAL_MODULES_HORS_PERIMETRE.length).toBeGreaterThanOrEqual(3);

        for (const x of FISCAL_MODULES_HORS_PERIMETRE) {
            expect(scanned.has(x.file), `${x.file} est déclaré HORS périmètre ET scanné`).toBe(false);
            const reel = findFiscalConstants(readFileSync(resolve(root, x.file), 'utf-8')).length;
            expect(reel, `${x.file} n'a plus de littéral : l'exclusion n'a plus d'objet`).toBeGreaterThan(0);
            // Tolérance large : on veut attraper un fichier VIDÉ ou renommé, pas facturer un ±2.
            expect(reel, `${x.file} : ${reel} littéraux réels vs ${x.literals} déclarés — chiffre périmé`)
                .toBeGreaterThanOrEqual(Math.floor(x.literals / 2));
        }
    });

    it('la DETTE fiscale est visible : au moins une entrée « fiscal » reste à ancrer', () => {
        // Documente que ce garde constate une dette plutôt que de la clore. Le jour où cette
        // assertion casse, c'est que tout a été ancré dans FISCAL_REFERENCE — bonne nouvelle,
        // et signal qu'il faut revoir le garde plutôt que le laisser mentir.
        expect(FISCAL_CONST_INVENTORY.some((e) => e.family === 'fiscal')).toBe(true);
    });
});

describe('[FISC-CONST-GUARD-V2] scan LIVE du moteur fiscal (ratchet)', () => {
    it('aucune constante fiscale NOUVELLE hors inventaire', () => {
        const known = inventoryIndex();
        const unknown: string[] = [];
        let scannedFiles = 0;

        for (const file of FISCAL_MODULES) {
            const abs = resolve(root, file);
            let content: string;
            try {
                content = readFileSync(abs, 'utf-8');
            } catch {
                continue; // module renommé/supprimé : couvert par l'assertion de volume ci-dessous
            }
            scannedFiles++;
            for (const hit of findFiscalConstants(content)) {
                if (known.has(inventoryKey(file, hit.value))) continue;
                unknown.push(`  ${file}:${hit.line} → ${hit.value}  | ${hit.text.slice(0, 100)}`);
            }
        }

        // ANTI-DÉSARMEMENT : si les modules disparaissent (renommage, restructuration), le scan
        // deviendrait vide et passerait à tort en croyant protéger.
        expect(scannedFiles, 'modules fiscaux introuvables → garde-fou désarmé').toBe(FISCAL_MODULES.length);

        expect(
            unknown,
            unknown.length === 0
                ? ''
                : `Constante(s) NOUVELLE(S) dans le moteur fiscal. C'est par là que « 0.92 » est passé.\n`
                  + `Trie-la puis ajoute-la à FISCAL_CONST_INVENTORY (utils/fiscalConstGuardV2.ts) avec sa RAISON :\n`
                  + `  • family 'fiscal'     → vrai paramètre ARC/RQ : à ancrer dans docs/FISCAL_REFERENCE.md ;\n`
                  + `  • family 'design'     → heuristique de conception : ne JAMAIS la « sourcer » ;\n`
                  + `  • family 'structural' → index/pas d'algorithme, hors périmètre fiscal.\n`
                  + unknown.join('\n'),
        ).toEqual([]);
    });
});
