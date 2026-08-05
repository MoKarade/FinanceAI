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
