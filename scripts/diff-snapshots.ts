// scripts/diff-snapshots.ts
// Compare deux snapshots produits par verify-precision.ts.
// Identifie les champs qui diffèrent (montants + clés manquantes).

import { readFileSync } from 'fs';

const [, , fileA, fileB] = process.argv;
const a = JSON.parse(readFileSync(fileA, 'utf-8'));
const b = JSON.parse(readFileSync(fileB, 'utf-8'));

const scenarios = Object.keys(a).filter(k => !k.startsWith('_'));
let totalDiffs = 0;

for (const sc of scenarios) {
    const sa = a[sc];
    const sb = b[sc];
    if (!sb) {
        console.log(`[MISSING in B] ${sc}`);
        continue;
    }

    if (sa.chartDataHash !== sb.chartDataHash) {
        console.log(`\n📊 ${sc}: hash diff (${sa.chartDataHash.slice(0, 12)} vs ${sb.chartDataHash.slice(0, 12)})`);
    } else {
        console.log(`\n✅ ${sc}: hash IDENTIQUE`);
        continue;
    }

    // Compare top-level aggregates
    for (const k of ['finalNetWorth', 'estateNetWorth', 'totalEstateTax', 'totalTaxesPaid', 'totalGrowth', 'totalExpenses', 'minNetWorth', 'shortfallRate']) {
        if (typeof sa[k] === 'number' && typeof sb[k] === 'number') {
            const diff = sa[k] - sb[k];
            const pctDiff = sb[k] !== 0 ? (diff / sb[k]) * 100 : 0;
            if (Math.abs(pctDiff) > 0.001) {
                console.log(`    ${k}: A=${sa[k].toFixed(2)} vs B=${sb[k].toFixed(2)} (Δ${diff > 0 ? '+' : ''}${diff.toFixed(2)}, ${pctDiff > 0 ? '+' : ''}${pctDiff.toFixed(3)}%)`);
                totalDiffs++;
            }
        }
    }

    // Compare sample months
    for (const monthKey of ['sampleM0', 'sampleM60', 'sampleM120', 'sampleM180', 'sampleM240']) {
        if (!sa[monthKey] || !sb[monthKey]) continue;
        const ma = sa[monthKey], mb = sb[monthKey];

        // Find fields where values differ or are unique to one
        const allKeys = new Set([...Object.keys(ma), ...Object.keys(mb)]);
        const fieldDiffs: string[] = [];
        for (const k of allKeys) {
            if (k === 'lifeEvents' || k === 'flowEvents' || k === 'dateLabel') continue;
            const va = ma[k], vb = mb[k];
            if (va === undefined && vb !== undefined) fieldDiffs.push(`${k}: SEUL_DANS_B=${vb}`);
            else if (vb === undefined && va !== undefined) fieldDiffs.push(`${k}: SEUL_DANS_A=${va}`);
            else if (typeof va === 'number' && typeof vb === 'number' && Math.abs(va - vb) > 0.01) {
                fieldDiffs.push(`${k}: A=${va.toFixed(2)} vs B=${vb.toFixed(2)} (Δ${(va-vb).toFixed(2)})`);
                totalDiffs++;
            }
        }
        if (fieldDiffs.length > 0) {
            console.log(`    [${monthKey}] ${fieldDiffs.length} champs diffèrent:`);
            fieldDiffs.slice(0, 5).forEach(f => console.log(`      - ${f}`));
            if (fieldDiffs.length > 5) console.log(`      ... +${fieldDiffs.length - 5} autres`);
        }
    }
}

console.log(`\nTotal différences numériques: ${totalDiffs}`);
