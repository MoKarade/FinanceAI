#!/usr/bin/env tsx
// Script CLI : la sortie console est volontaire.
/* eslint-disable no-console */
//
// [ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] Re-dérive la mesure du ticket : que devient une valeur
// NON FINIE injectée dans l'état, une fois passée par la frontière du moteur ?
//
// ⚠️ Pourquoi ce script est COMMITTÉ, et pourquoi il fixe TOUT. Le ticket porte deux mesures du même
// scénario qui divergent de 6,83 % : leurs protocoles disaient « rendement 5 % » et le passaient en
// `projection.returnRate` (SINGULIER), un champ que le moteur ne lit pas — un paramètre non câblé ne
// rend pas la mesure bruyante, il la rend MUETTE et fausse. Un montant cité dans le dépôt exige donc
// un script qui nomme CHAQUE paramètre avec sa valeur (`UN-RAPPORT-D-AGENT-N-EST-PAS-UNE-SOURCE`).
//
// ⚠️ Deux pièges de méthode, tous deux payés sur ce ticket :
//   1. Le scan doit être RÉCURSIF. `params.config === state.config` (passage par référence), donc
//      `config.users[0].netSalary` vaut `NaN` DANS les paramètres — invisible à un scan de premier
//      niveau, qui annonce « aucun non fini » sur le cas le plus grave.
//   2. L'état doit être CLONÉ par cas. Une première version partageait ses fixtures entre les cas et
//      la corruption de l'un survivait dans le suivant (`[TEST-PERSONA-FIXTURE-PARTAGEE]`, lot 33).
//
// Run : `npx tsx scripts/mesureFrontiereMoteur.ts`
import { buildSimulationParamsFromState } from '../services/projection/buildSimulationParams.ts';
import { buildCoupleConfort } from '../services/testPersonas/coupleConfort.ts';
import type { AppState } from '../types.ts';

/** Tous les paramètres du scénario, nommés — y compris ceux dont le ticket a montré qu'on peut
 *  croire les fixer sans que le moteur les lise. */
const SCENARIO = {
    startYear: 2026,
    startMonth: 0,
    // ⚠️ `returnRates` (PLURIEL, la carte par compte) est ce que le moteur lit ; `returnRate` au
    // singulier n'alimente aucune croissance (vérifié). On fixe donc la carte, et on l'écrit ici.
    returnRates: { celi: 5, reer: 5, nonReg: 5, crypto: 5, cash: 5 },
    inflationRate: 2,
    years: 30,
} as const;

const etatSain = (): AppState => {
    const base = buildCoupleConfort() as AppState;
    return {
        ...base,
        projection: { ...(base.projection ?? {}), ...SCENARIO } as AppState['projection'],
    };
};

/** Scan RÉCURSIF : rend le chemin de chaque nombre non fini atteignable depuis `racine`. */
function nonFinis(racine: unknown, chemin = '', vus = new WeakSet<object>()): string[] {
    if (typeof racine === 'number') return Number.isFinite(racine) ? [] : [`${chemin} = ${racine}`];
    if (racine === null || typeof racine !== 'object') return [];
    if (vus.has(racine)) return [];
    vus.add(racine);
    const out: string[] = [];
    for (const [cle, val] of Object.entries(racine as Record<string, unknown>)) {
        out.push(...nonFinis(val, chemin ? `${chemin}.${cle}` : cle, vus));
    }
    return out;
}

const CAS: Array<{ nom: string; corrompre?: (e: AppState) => void }> = [
    { nom: '(sain)' },
    { nom: 'netSalary: Infinity', corrompre: (e) => { (e.config.users[0] as unknown as Record<string, unknown>).netSalary = Infinity; } },
    { nom: 'netSalary: NaN', corrompre: (e) => { (e.config.users[0] as unknown as Record<string, unknown>).netSalary = NaN; } },
    { nom: 'grossSalary: Infinity', corrompre: (e) => { (e.config.users[0] as unknown as Record<string, unknown>).grossSalary = Infinity; } },
];

console.log(`scénario : ${JSON.stringify(SCENARIO)}\n`);
for (const cas of CAS) {
    // ⚠️ Un état NEUF par cas — jamais un état partagé qu'on « répare » entre deux mesures.
    const etat = etatSain();
    cas.corrompre?.(etat);
    const params = buildSimulationParamsFromState(etat, { startYear: SCENARIO.startYear, startMonth: SCENARIO.startMonth });
    const premierNiveau = Object.entries(params as unknown as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'number' && !Number.isFinite(v)).map(([k]) => k);
    const recursif = nonFinis(params);
    console.log(`— ${cas.nom}`);
    console.log(`    baseNetAnnual   = ${(params as { baseNetAnnual: number }).baseNetAnnual}`);
    console.log(`    baseGrossAnnual = ${(params as { baseGrossAnnual: number }).baseGrossAnnual}`);
    console.log(`    non finis, PREMIER NIVEAU : ${premierNiveau.length ? premierNiveau.join(', ') : '(aucun)'}`);
    console.log(`    non finis, RÉCURSIF       : ${recursif.length ? recursif.join(', ') : '(aucun)'}`);
}
