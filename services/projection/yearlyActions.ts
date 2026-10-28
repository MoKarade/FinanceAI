// services/projection/yearlyActions.ts
// C2 — « actions concrètes par année » dérivées du scénario choisi. Le moteur
// émet déjà le flux net mensuel par compte (NetTransfer<compte> = dépôts −
// retraits). On les somme par année → ce que tu dois DÉPOSER (positif) ou
// RETIRER (négatif) dans chaque compte cette année-là, selon la meilleure
// stratégie. Fonction PURE (aucune dépendance UI) → testable. Aucune règle
// inventée : c'est exactement ce que la projection optimale exécute.

export type ActionAccountKey = 'Liquidites' | 'CELI' | 'CELIAPP' | 'REER' | 'REEE' | 'NonReg' | 'Crypto';

export const ACTION_ACCOUNTS: Array<{ key: ActionAccountKey; label: string; field: string }> = [
    { key: 'CELI', label: 'CELI', field: 'NetTransferCELI' },
    { key: 'CELIAPP', label: 'CELIAPP (FHSA)', field: 'NetTransferCELIAPP' },
    { key: 'REER', label: 'REER', field: 'NetTransferREER' },
    { key: 'REEE', label: 'REEE', field: 'NetTransferREEE' },
    { key: 'NonReg', label: 'Non-Enreg', field: 'NetTransferNonReg' },
    { key: 'Crypto', label: 'Crypto', field: 'NetTransferCrypto' },
    { key: 'Liquidites', label: 'Cash', field: 'NetTransferLiquid' },
];

interface YearlyAction {
    year: number;
    age: number | null;
    isRetired: boolean;
    /** Flux net annuel par compte : > 0 = déposer, < 0 = retirer. */
    flows: Record<ActionAccountKey, number>;
    /** Total déposé (somme des flux positifs) et total retiré (somme des négatifs, valeur absolue). */
    deposited: number;
    withdrawn: number;
}

/**
 * Agrège le flux net par compte et par année à partir du chartData mensuel d'un
 * scénario. Ignore les mois passés (monthIndex < 0) si présents.
 */
export function computeYearlyActions(chartData: Array<Record<string, unknown>>): YearlyAction[] {
    if (!chartData || chartData.length === 0) return [];
    const byYear = new Map<number, YearlyAction>();

    for (const d of chartData) {
        const monthIndex = (d.monthIndex as number | undefined) ?? 0;
        if (monthIndex < 0) continue; // passé réel : pas d'action future
        const year = d.year as number | undefined;
        if (year == null) continue;
        const age = (d.age as number | null | undefined) ?? null;
        let entry = byYear.get(year);
        if (!entry) {
            entry = {
                year,
                age,
                isRetired: false,
                flows: { Liquidites: 0, CELI: 0, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0 },
                deposited: 0,
                withdrawn: 0,
            };
            byYear.set(year, entry);
        }
        entry.age = age ?? entry.age; // dernier âge vu dans l'année
        if (d.isRetired) entry.isRetired = true;
        for (const a of ACTION_ACCOUNTS) {
            const v = ((d[a.field] as number | undefined) || 0);
            entry.flows[a.key] += v;
        }
    }

    const result = [...byYear.values()].sort((x, y) => x.year - y.year);
    for (const e of result) {
        for (const a of ACTION_ACCOUNTS) {
            const v = Math.round(e.flows[a.key]);
            e.flows[a.key] = v;
            if (v > 0) e.deposited += v;
            else if (v < 0) e.withdrawn += -v;
        }
    }
    return result;
}
