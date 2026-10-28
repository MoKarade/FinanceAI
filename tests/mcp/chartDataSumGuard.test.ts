/**
 * [MCP-CHARTDATA-SUM-GUARD] Aucun outil MCP ne doit fabriquer un « revenu » en additionnant des
 * champs de flux de `chartData`.
 *
 * Le fond (leçon MCP-RETIREMENT-VERDICT) : le décaissement NON-ENREGISTRÉ et le LIQUIDE n'ont
 * AUCUN champ de flux dans `chartData`. Une somme de flux sous-estime donc structurellement — et
 * l'erreur est d'autant plus tentante que le moteur expose gentiment `RetraitREER`, `pensionRRQ`…
 *
 * Mode ÉCHEC DUR : le code est propre aujourd'hui (0 occurrence dans `mcp/`, vérifié), donc le
 * scan LIVE passe ; toute réintroduction le fera ÉCHOUER.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
    findChartDataSums,
    extractChartPointFieldNames,
    RETIREMENT_FLOW_FIELDS,
    CHARTDATA_SUM_ESCAPE,
    type SumViolation,
} from '../../utils/chartDataSumGuard';

const root = process.cwd();

const isSource = (full: string): boolean =>
    /\.ts$/.test(full) && !/\.(test|spec)\.ts$/.test(full);

function listMcpSources(): string[] {
    const abs = resolve(root, 'mcp');
    const files: string[] = [];
    for (const entry of readdirSync(abs, { recursive: true })) {
        const full = join(abs, entry.toString());
        if (isSource(full)) files.push(full);
    }
    return files;
}

describe('[MCP-CHARTDATA-SUM-GUARD] détection (DISCRIMINANT)', () => {
    it('détecte l’addition de deux flux DISTINCTS — la « somme des revenus » écrite à la main', () => {
        const v = findChartDataSums('const revenu = p.RetraitREER + p.pensionRRQ;');
        expect(v).toHaveLength(1);
        expect(v[0].fields.sort()).toEqual(['RetraitREER', 'pensionRRQ']);
    });

    it('détecte l’ACCUMULATION d’un flux sur l’horizon (reduce / +=)', () => {
        expect(findChartDataSums('const t = pts.reduce((s, p) => s + (p.RentalIncome ?? 0), 0);')).toHaveLength(1);
        expect(findChartDataSums('total += point.pensionPSV;')).toHaveLength(1);
    });

    it('NE détecte PAS la simple LECTURE d’un flux (usage légitime)', () => {
        // Le garde vise la FABRICATION d'un agrégat, pas l'accès à un champ pour l'afficher.
        expect(findChartDataSums('const loyer = p.RentalIncome ?? 0;')).toHaveLength(0);
        expect(findChartDataSums('if (p.RetraitREER > 0) flag = true;')).toHaveLength(0);
    });

    it('NE détecte PAS un exemple en COMMENTAIRE (doc, leçon, TODO)', () => {
        expect(findChartDataSums('// ne JAMAIS faire p.RetraitREER + p.RetraitCELI')).toHaveLength(0);
        expect(findChartDataSums('/* p.pensionRRQ + p.pensionPSV */\nconst x = 1;')).toHaveLength(0);
    });

    it(`ignore une ligne portant l’échappatoire « ${CHARTDATA_SUM_ESCAPE} »`, () => {
        expect(findChartDataSums(
            `const t = p.RetraitREER + p.RetraitCELI; // ${CHARTDATA_SUM_ESCAPE}: total des retraits ENREGISTRÉS, pas un revenu`,
        )).toHaveLength(0);
    });

    it('liste de champs vide → aucune détection (anti-crash)', () => {
        expect(findChartDataSums('const r = p.RetraitREER + p.pensionRRQ;', [])).toHaveLength(0);
    });

    it('ne confond pas un nom PLUS LONG qui contient un champ de flux', () => {
        expect(findChartDataSums('const x = p.RetraitREERBrut + p.autreChose;')).toHaveLength(0);
    });
});

describe('[MCP-CHARTDATA-SUM-GUARD] anti-désarmement', () => {
    it('CHAQUE champ surveillé existe encore dans ProjectionChartPoint', () => {
        // ⚠️ La raison d'être de ce test : la liste est EXPLICITE (le type ne distingue pas un flux
        // d'un solde). Un renommage côté moteur — `pensionRRQ` → `PensionRRQ`, par exemple —
        // laisserait un garde qui ne garde plus rien, SANS que rien ne s'allume. Ici, ça casse.
        const src = readFileSync(resolve(root, 'services/projection/types.ts'), 'utf-8');
        const declared = extractChartPointFieldNames(src);

        expect(declared.length, 'extraction du type effondrée → assertion vide').toBeGreaterThan(50);
        const missing = RETIREMENT_FLOW_FIELDS.filter((f) => !declared.includes(f));
        expect(
            missing,
            `Champ(s) surveillé(s) ABSENT(S) de ProjectionChartPoint — le moteur a renommé, `
            + `le garde protégeait du vide : ${missing.join(', ')}`,
        ).toEqual([]);
    });
});

describe('[MCP-CHARTDATA-SUM-GUARD] scan LIVE de mcp/ (échec dur)', () => {
    it('aucun outil MCP n’additionne des flux chartData', () => {
        const files = listMcpSources();
        // ANTI-DÉSARMEMENT : un scan vide (mauvais cwd, readdirSync qui rend 0) passerait à tort.
        expect(files.length, 'scan vide → garde-fou désarmé (cwd ?)').toBeGreaterThan(20);

        const all: Array<SumViolation & { file: string }> = [];
        let exempted = 0;
        for (const file of files) {
            const content = readFileSync(file, 'utf-8');
            exempted += content.split('\n').filter((l) => l.includes(CHARTDATA_SUM_ESCAPE)).length;
            for (const v of findChartDataSums(content)) {
                all.push({ ...v, file: file.replace(root, '').replace(/\\/g, '/') });
            }
        }

        expect(
            all,
            all.length === 0
                ? ''
                : `Somme de flux chartData dans mcp/ — le décaissement NON-ENREGISTRÉ et le LIQUIDE `
                  + `n'ont AUCUN champ de flux, donc ce total SOUS-ESTIME structurellement. Utilise les `
                  + `signaux d'adéquation du moteur (minNetWorth, successRate). Si le cas est légitime, `
                  + `ajoute « // ${CHARTDATA_SUM_ESCAPE}: <raison> » :\n`
                  + all.map((v) => `  ${v.file}:${v.line} → ${v.fields.join(' + ')}  | ${v.text}`).join('\n'),
        ).toEqual([]);

        // ANTI-ABUS : l'échappatoire ne doit pas servir à désarmer en masse (0 usage aujourd'hui).
        expect(exempted, `trop de lignes « ${CHARTDATA_SUM_ESCAPE} » → audite-les`).toBeLessThan(5);
    });
});
