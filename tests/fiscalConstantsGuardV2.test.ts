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

    it('une clé qui recouvre PLUSIEURS occurrences les ÉNUMÈRE toutes', () => {
        // ⚠️ [FISC-GUARD-SCOPE] L'index est (fichier, valeur), PAS la ligne — choix assumé (un
        // numéro de ligne dérive au premier refactor). Le prix devient LOURD sur un module dense :
        // dans `childrenReee.ts`, `0.20` est À LA FOIS le taux de SCEE (barème ARC) et le taux
        // d'impôt sur le PRA à la fermeture (approximation de modèle), et `500` recouvre TROIS sens
        // sans rapport. Une raison qui n'en décrit qu'un est un document FAUX : elle certifie
        // « trié » une valeur dont un des sens n'a jamais été regardé.
        //
        // La garde est STRUCTURELLE (on compte des références `L<n>`), pas une heuristique de
        // prose : une clé vue N fois dans le fichier doit citer N lignes distinctes.
        const manquants: string[] = [];
        let clesMultiples = 0;

        for (const e of FISCAL_CONST_INVENTORY) {
            const src = readFileSync(resolve(root, e.file), 'utf-8');
            const lignes = new Set(findFiscalConstants(src).filter((h) => h.value === e.value).map((h) => h.line));
            if (lignes.size < 2) continue;
            clesMultiples++;
            // DEUX façons d'être honnête, et il faut en CHOISIR une — c'est le but :
            //   • `[×N]` en tête    → les N occurrences ont le MÊME sens (table d'âges FERR, proxy
            //                          répété pour les deux conjoints…). Rien à énumérer.
            //   • N références `L<n>` → les sens DIFFÈRENT, et chacun est décrit.
            // Un `[×N]` posé sur des sens divergents reste possible : aucune garde ne lit le sens.
            // Ce qu'on supprime, c'est le cas où PERSONNE n'a regardé.
            const memeSens = new RegExp(`^\\[×${lignes.size}\\]`).test(e.reason);
            const refs = new Set(e.reason.match(/L\d+/g) ?? []);
            if (!memeSens && refs.size < lignes.size) {
                manquants.push(`${e.file}::${e.value} — ${lignes.size} occurrences, ${refs.size} référence(s) L<n>, pas de marque [×${lignes.size}]`);
            }
        }

        // ANTI-VACUITÉ : si plus aucune clé n'est multiple, cette garde ne vérifie RIEN et doit
        // être revue plutôt que laissée verte.
        expect(clesMultiples, 'aucune clé multiple → cette garde ne prouve plus rien').toBeGreaterThanOrEqual(8);
        expect(manquants, `Raison(s) qui ne couvrent pas toutes les occurrences de leur clé :\n${manquants.join('\n')}`).toEqual([]);
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
