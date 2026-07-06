// tests/fiscalConstants.guard.test.ts
//
// [FISC-CONST-LINT] — garde-fou STRUCTUREL : aucun littéral fiscal DISTINCTIF ne doit réapparaître
// hors de la source unique (`utils/tax.ts` / `services/realEstate.ts`). Ferme la classe M1-M3
// (constante fiscale recopiée en dur qui finit par diverger du barème daté).
//
// Mode ÉCHEC DUR (choix Marc 2026-06-18) : le code est propre aujourd'hui (0 fuite), donc le test
// passe ; toute future régression (un seuil fiscal recopié au lieu d'être importé) le fait ÉCHOUER.
// Échappatoire : `// fiscal-const-ok: <raison>` sur la ligne d'un faux positif légitime.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
    extractDistinctiveFiscalLiterals,
    findFiscalLeaks,
    FISCAL_CONST_ESCAPE,
    type FiscalLeak,
} from '../utils/fiscalConstantsGuard';

const root = process.cwd();

// Source unique des constantes fiscales — EXCLUE du scan (elle DOIT les contenir).
const TAX_SOURCE_FILES = ['utils/tax.ts', 'services/realEstate.ts'] as const;

// Fichiers/dossiers de DONNÉES DÉMO (fixtures du mode test) exclus : leurs montants fictifs peuvent
// coïncider fortuitement avec un seuil fiscal (ex. solde de prêt 18500 = FSS_THRESHOLD_ZERO).
const DEMO_DATA_FILES = ['services/testBudget.ts'] as const;
const DEMO_DATA_DIRS = ['services/testPersonas'] as const;

// Surfaces applicatives scannées : tout littéral fiscal distinctif ici = recopie suspecte.
// `mcp/` inclus (les outils MCP exposent des données financières). `scripts/` EXCLU volontairement
// (outillage build/hooks, pas du calcul fiscal ; surtout du `.mjs`/`.cjs` non couvert par le filtre).
const SCAN_DIRS = ['components', 'services', 'hooks', 'store', 'utils', 'mcp'] as const;
const SCAN_ROOT_FILES = ['App.tsx', 'constants.ts', 'i18n.ts'] as const;

const isSource = (full: string): boolean => /\.(ts|tsx)$/.test(full) && !/\.test\.(ts|tsx)$/.test(full);

const EXCLUDED_FILES = new Set([...TAX_SOURCE_FILES, ...DEMO_DATA_FILES].map(p => resolve(root, p)));
const EXCLUDED_DIRS = DEMO_DATA_DIRS.map(p => resolve(root, p));
const isExcluded = (full: string): boolean =>
    EXCLUDED_FILES.has(full) || EXCLUDED_DIRS.some(d => full.startsWith(d));

function listScannedFiles(): string[] {
    const files: string[] = [];
    for (const dir of SCAN_DIRS) {
        const abs = resolve(root, dir);
        for (const entry of readdirSync(abs, { recursive: true })) {
            const full = join(abs, entry.toString());
            if (isSource(full) && !isExcluded(full)) files.push(full);
        }
    }
    for (const f of SCAN_ROOT_FILES) files.push(resolve(root, f));
    return files;
}

const readTaxSources = (): string[] => TAX_SOURCE_FILES.map(p => readFileSync(resolve(root, p), 'utf-8'));

describe('[FISC-CONST-LINT] extraction des littéraux distinctifs', () => {
    it('garde les seuils ≥5 chiffres non-ronds, exclut les ronds et les taux 2-décimales', () => {
        const src = 'const a = 58523; const b = 60000; const r = 0.2575; const g = 0.50; const big = 117045;';
        const banned = extractDistinctiveFiscalLiterals([src]);
        expect(banned).toContain('58523');
        expect(banned).toContain('117045');
        expect(banned).toContain('0.2575');
        expect(banned).not.toContain('60000'); // rond → collisionnable (ex. 60 s en ms)
        expect(banned).not.toContain('0.50');  // taux 2-décimales → trop générique
    });

    it('extrait bien les valeurs réelles de tax.ts (sanité) et exclut les ronds', () => {
        const banned = extractDistinctiveFiscalLiterals(readTaxSources());
        expect(banned).toContain('58523');  // 1er palier fédéral
        expect(banned).toContain('95323');  // seuil clawback PSV
        expect(banned).toContain('18952');  // BPA QC
        expect(banned).not.toContain('60000'); // RAP_LIMIT (rond) — exclu
        expect(banned).not.toContain('85000'); // RRQ_YAMPE (rond) — exclu
    });
});

describe('[FISC-CONST-LINT] détection de fuite (DISCRIMINANT)', () => {
    const banned = ['58523', '117045', '0.2575'];

    it('détecte un littéral fiscal banni recopié dans un fichier', () => {
        const leaks = findFiscalLeaks('const seuil = 58523; // recopié en dur', banned);
        expect(leaks).toHaveLength(1);
        expect(leaks[0].value).toBe('58523');
        expect(leaks[0].line).toBe(1);
    });

    it('NE détecte PAS un littéral banni à l’intérieur d’un nombre plus grand', () => {
        expect(findFiscalLeaks('const x = 585234; const y = 1117045;', banned)).toHaveLength(0);
    });

    it(`ignore une ligne portant l’échappatoire « ${FISCAL_CONST_ESCAPE} »`, () => {
        expect(findFiscalLeaks(`const s = 58523; // ${FISCAL_CONST_ESCAPE}: ref barème démo`, banned)).toHaveLength(0);
    });

    it('liste bannie vide → aucune fuite (garde anti-crash)', () => {
        expect(findFiscalLeaks('const s = 58523;', [])).toHaveLength(0);
    });

    it('NE détecte PAS un littéral banni en COMMENTAIRE (n° de ligne ARC, exemple de doc)', () => {
        expect(findFiscalLeaks('// barème fédéral, 1er palier 58523 (ARC ligne 117045)', banned)).toHaveLength(0);
        expect(findFiscalLeaks('const x = 1; /* ref 58523 */', banned)).toHaveLength(0);
    });

    it('détecte le code MAIS ignore le commentaire sur la même ligne', () => {
        const leaks = findFiscalLeaks('const seuil = 58523; // doublon de 117045 dans le commentaire', banned);
        expect(leaks).toHaveLength(1);
        expect(leaks[0].value).toBe('58523'); // le 117045 du commentaire n'est PAS compté
    });

    it('détecte un littéral banni dans une string ordinaire (template) — pas seulement un nombre nu', () => {
        // Documente que les strings normales SONT scannées (≠ les commentaires, stripés).
        expect(findFiscalLeaks('throw new Error(`Seuil ${117045} requis`);', banned)).toHaveLength(1);
    });
});

describe('[FISC-CONST-LINT] scan LIVE du code applicatif (échec dur si fuite)', () => {
    it('aucune constante fiscale distinctive recopiée hors de tax.ts/realEstate.ts', () => {
        const banned = extractDistinctiveFiscalLiterals(readTaxSources());
        // ANTI-DÉSARMEMENT : l'extraction doit produire une liste SUBSTANTIELLE (≈67 littéraux
        // aujourd'hui). Un seuil > 20 attrape un effondrement (regex cassée, source restructurée)
        // qui ferait passer le test à vide en croyant protéger.
        expect(banned.length, 'extraction des littéraux fiscaux effondrée → garde-fou désarmé').toBeGreaterThan(20);

        const files = listScannedFiles();
        // ANTI-DÉSARMEMENT (finding silent-failure-hunter) : si readdirSync rend 0 fichier (mauvais
        // cwd, dossier inaccessible), le scan serait vide et le test passerait à tort. On exige un
        // volume plausible de fichiers applicatifs scannés.
        expect(files.length, 'scan vide → garde-fou désarmé (cwd ou readdirSync ?)').toBeGreaterThan(50);

        const allLeaks: Array<FiscalLeak & { file: string }> = [];
        let exemptedLines = 0;
        for (const file of files) {
            const content = readFileSync(file, 'utf-8');
            exemptedLines += content.split('\n').filter(l => l.includes(FISCAL_CONST_ESCAPE)).length;
            for (const leak of findFiscalLeaks(content, banned)) {
                allLeaks.push({ ...leak, file: file.replace(root, '').replace(/\\/g, '/') });
            }
        }

        expect(
            allLeaks,
            allLeaks.length === 0
                ? ''
                : `Constante(s) fiscale(s) recopiée(s) hors source unique (importer depuis utils/tax.ts, ` +
                  `ou ajouter « // ${FISCAL_CONST_ESCAPE}: <raison> » si légitime) :\n` +
                  allLeaks.map(l => `  ${l.file}:${l.line} → ${l.value}  | ${l.text}`).join('\n'),
        ).toEqual([]);

        // ANTI-ABUS : l'échappatoire ne doit pas servir à désarmer en masse (0 usage aujourd'hui).
        expect(exemptedLines, `trop de lignes « ${FISCAL_CONST_ESCAPE} » → audite-les`).toBeLessThan(10);
    });
});
