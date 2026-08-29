// utils/chartDataSumGuard.ts
//
// [MCP-CHARTDATA-SUM-GUARD] Garde de CONVENTION : interdit de fabriquer un « revenu » en
// ADDITIONNANT des champs de flux de `chartData` dans les outils MCP.
//
// Pourquoi (leçon MCP-RETIREMENT-VERDICT, 2026-07-14) : le moteur émet `RetraitREER`,
// `RetraitCELI`, `RentalIncome`, `pensionRRQ`… mais le décaissement NON-ENREGISTRÉ et le LIQUIDE
// qui financent la retraite n'ont **AUCUN champ de flux**. Toute somme de flux présentée comme
// « le revenu de retraite » SOUS-ESTIME donc structurellement — mesuré : 3 923 $/mois
// identifiables contre une cible de 5 500 $, sur un plan qui TIENT pourtant à 98 % en Monte-Carlo.
// Un verdict d'adéquation doit s'appuyer sur les signaux du moteur (`minNetWorth > 0` sur
// l'horizon, `successRate`), JAMAIS sur une addition de flux.
//
// ⚠️ Le garde est PRÉVENTIF : au 2026-08-05, `mcp/` ne contient AUCUNE occurrence (vérifié). Il
// existe pour que la correction de MCP-RETIREMENT-VERDICT ne soit pas refaite à l'envers dans six
// mois par quelqu'un qui trouvera « logique » d'additionner ce que le moteur expose.
//
// Module PUR (aucun accès disque) : le scan LIVE vit dans `tests/mcp/chartDataSumGuard.test.ts`.

import { stripComments } from './stripComments';

/**
 * Champs de `ProjectionChartPoint` qui sont des FLUX de revenu de retraite.
 *
 * ⚠️ Liste EXPLICITE et non dérivée : le type ne porte aucune marque sémantique distinguant un
 * flux d'un solde. Le prix de ce choix est la dérive possible — d'où l'assertion anti-désarmement
 * du test, qui exige que CHAQUE nom ci-dessous existe encore dans `services/projection/types.ts`.
 * Sans elle, un renommage côté moteur laisserait un garde qui ne garde plus rien, en silence.
 */
export const RETIREMENT_FLOW_FIELDS = [
    'RetraitREER',
    'RetraitCELI',
    'RentalIncome',
    'pensionRRQ',
    'pensionPSV',
    'pensionPrivee',
    'DividendIncome',
    'IncomeRetirement',
    'ReeePayout',
] as const;

/** Échappatoire pour un cas légitime — DOIT nommer sa raison. */
export const CHARTDATA_SUM_ESCAPE = 'chartdata-sum-ok';

export interface SumViolation {
    line: number;
    /** Les champs de flux impliqués dans l'addition. */
    fields: string[];
    text: string;
}

/** [GUARD-STRIPCOMMENTS-CONSOLIDER] Découpe en lignes le source décommenté par la SOURCE UNIQUE
 *  (`utils/stripComments.ts`) — un exemple en commentaire n'est pas du code. La copie locale
 *  d'avant amputait toute ligne portant une URL dans une chaîne. */
const lignesDeCode = (source: string): string[] => stripComments(source).split('\n');

/**
 * Détecte les additions de flux dans un source.
 *
 * Deux formes attrapées, choisies parce que ce sont celles par lesquelles l'erreur ARRIVE :
 *   A. deux champs de flux DISTINCTS reliés par `+` sur la même ligne
 *      (`p.RetraitREER + p.pensionRRQ`) — la « somme des revenus » écrite à la main ;
 *   B. un champ de flux dans un `reduce(` — l'accumulation d'un flux sur l'horizon.
 *
 * Volontairement PAS attrapé : la lecture d'un champ unique (`p.RentalIncome` pour l'afficher),
 * qui est légitime. Le garde vise la FABRICATION d'un agrégat, pas l'accès.
 */
export function findChartDataSums(
    source: string,
    fields: readonly string[] = RETIREMENT_FLOW_FIELDS,
): SumViolation[] {
    const out: SumViolation[] = [];
    if (fields.length === 0) return out; // liste vide → rien à chercher (anti-crash)

    // ⚠️ L'échappatoire vit dans un COMMENTAIRE — il faut donc la chercher sur la ligne BRUTE,
    // pas sur la ligne strippée (qui vient justement de la supprimer). Ce piège est passé au test
    // du premier coup : le garde ignorait toutes les exemptions en silence.
    const raw = source.split('\n');
    const lines = lignesDeCode(source);
    const nameRe = new RegExp(`(?<![\\w$])(${fields.join('|')})(?![\\w$])`, 'g');

    lines.forEach((line, i) => {
        if ((raw[i] ?? '').includes(CHARTDATA_SUM_ESCAPE)) return;
        const hits = [...line.matchAll(nameRe)].map((m) => m[1]);
        if (hits.length === 0) return;

        const distinct = [...new Set(hits)];
        // A. addition de deux flux DISTINCTS sur la ligne.
        if (distinct.length >= 2 && /\+/.test(line)) {
            out.push({ line: i + 1, fields: distinct, text: line.trim() });
            return;
        }
        // B. accumulation d'un flux (reduce / += ) — même sur un seul champ.
        if (/\.reduce\s*\(/.test(line) || /\+=/.test(line)) {
            out.push({ line: i + 1, fields: distinct, text: line.trim() });
        }
    });

    return out;
}

/**
 * Extrait les noms de champs déclarés dans l'interface `ProjectionChartPoint`.
 * Sert UNIQUEMENT à l'assertion anti-désarmement : si un nom de la liste ci-dessus n'y figure
 * plus, c'est que le moteur a renommé et que le garde protège du vide.
 */
export function extractChartPointFieldNames(typesSource: string): string[] {
    const start = typesSource.indexOf('interface ProjectionChartPoint');
    if (start < 0) return [];
    const body = typesSource.slice(start);
    const end = body.indexOf('\n}');
    const block = end < 0 ? body : body.slice(0, end);
    return [...block.matchAll(/^\s{4}(\w+)\??\s*:/gm)].map((m) => m[1]);
}
