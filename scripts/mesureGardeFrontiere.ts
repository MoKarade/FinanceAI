#!/usr/bin/env tsx
// Script CLI : la sortie console est volontaire.
/* eslint-disable no-console */
//
// [ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] Les DEUX risques de la garde d'entrée, mesurés.
//
// `scripts/mesureFrontiereMoteur.ts` mesure le DÉFAUT (que devient une valeur non finie sans garde).
// Ce script-ci mesure le COÛT DE LA GARDE, c'est-à-dire ce que le choix d'inverser la logique — scanner
// TOUT l'objet des paramètres au lieu d'énumérer les champs à vérifier — peut casser :
//
//   1. FAUX REFUS. Une garde qui refuse un état légitime est pire que le défaut qu'elle corrige :
//      elle casse l'app pour un cas nominal. « Zéro refus sur les personas » est le minimum, pas une
//      preuve — les personas sont tous des ménages complets et bien remplis. Ce sont les états
//      DÉGRADÉS mais légitimes qui font peur : une app neuve, un utilisateur sans emploi, un budget
//      vide, et surtout les configurations qui produisent un `0/0` honnête.
//   2. COÛT CPU. Le scan tourne à chaque assemblage de paramètres, donc à chaque frappe dans un
//      formulaire. La question n'est pas « combien de microsecondes » mais « est-ce que ça grandit
//      avec les données de Marc ? » — un coût constant ne se mémoïse pas, un coût linéaire en
//      nombre de transactions, si.
//
// ⚠️ L'état est CLONÉ par cas : une première version de `mesureFrontiereMoteur` partageait ses
// fixtures et la corruption de l'un survivait dans le suivant (`[TEST-PERSONA-FIXTURE-PARTAGEE]`).
//
// Run : `npx tsx scripts/mesureGardeFrontiere.ts`
import { buildSimulationParamsFromState } from '../services/projection/buildSimulationParams.ts';
import { verifierEntreesMoteur } from '../services/projection/verifierEntreesMoteur.ts';
import { TEST_PERSONAS, getPersonaOrDefault } from '../services/testPersonas/index.ts';
import { INITIAL_PROJECTION } from '../constants.ts';
import { useFinanceStore } from '../store/useFinanceStore.ts';
import type { AppState } from '../types.ts';

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

/**
 * ⚠️ `projection` est AJOUTÉE à chaque état mesuré. Aucun persona ne la porte (le store l'apporte au
 * montage), donc mesurer sans elle, c'est mesurer un objet plus ÉTROIT que la production — et c'est
 * précisément la classe de défaut que ce ticket corrige, re-commise dans l'instrument qui devait la
 * prouver. Écart mesuré : l'assiette passe de 132 à 149 nœuds rien qu'en l'ajoutant.
 */
const avecProjection = (e: AppState): AppState => {
    e.projection = { ...INITIAL_PROJECTION } as AppState['projection'];
    return e;
};

/** Rend le nombre de refus, et les imprime — un refus ici est un FAUX refus, donc un défaut. */
function refusDe(nom: string, etat: AppState): number {
    const params = buildSimulationParamsFromState(etat) as unknown as Readonly<Record<string, unknown>>;
    const budgetItems = (etat as unknown as { budgetItems?: unknown[] }).budgetItems ?? [];
    const refus = verifierEntreesMoteur(params, { budgetItems });
    const detail = refus.map((r) => `${r.chemin} = ${String(r.valeur)}`).join(' | ');
    console.log(`  ${refus.length === 0 ? 'ok   ' : 'REFUS'} ${nom}${detail ? ` :: ${detail}` : ''}`);
    return refus.length;
}

// ── 1. FAUX REFUS ─────────────────────────────────────────────────────────────────────────────────
console.log('\n1. FAUX REFUS — un refus sur ces états serait un défaut\n');

let faux = 0;
let cas = 0;

// L'app NEUVE : l'état par défaut du store, rien de saisi. Le cas le plus important de la liste —
// c'est celui que voit un nouvel utilisateur, et le refuser rendrait l'app inutilisable d'emblée.
cas++; faux += refusDe('état initial du store (app neuve)', clone(useFinanceStore.getState()) as unknown as AppState);

for (const p of TEST_PERSONAS) {
    cas++; faux += refusDe(`persona ${p.id}`, avecProjection(p.build() as AppState));
}

const base = avecProjection(getPersonaOrDefault('couple-confort').build() as AppState);

/* eslint-disable @typescript-eslint/no-explicit-any -- on dégrade volontairement des champs typés */
const DEGRADATIONS: ReadonlyArray<{ nom: string; f: (e: any) => void }> = [
    // Vides et absences : tout ce qu'un formulaire produit légitimement.
    { nom: 'salaires à 0 (sans emploi)', f: (e) => e.config.users.forEach((u: any) => { u.netSalary = 0; u.grossSalary = 0; }) },
    { nom: 'aucun poste de budget', f: (e) => { e.budgetItems = []; } },
    { nom: 'budgetItems absent', f: (e) => { delete e.budgetItems; } },
    { nom: 'un seul utilisateur', f: (e) => { e.config.users = [e.config.users[0]]; } },
    { nom: 'aucun actif', f: (e) => { e.assets = []; } },
    { nom: 'aucune transaction', f: (e) => { e.transactions = []; } },
    { nom: 'aucun compte', f: (e) => { e.accounts = []; } },
    { nom: 'aucun immeuble', f: (e) => { e.realEstate = []; } },
    { nom: 'aucune dette', f: (e) => { e.debts = []; } },
    { nom: 'aucun objectif', f: (e) => { e.goals = []; } },
    { nom: 'projection absente', f: (e) => { delete e.projection; } },
    { nom: 'projection.years = 0', f: (e) => { e.projection = { ...(e.projection ?? {}), years: 0 }; } },
    { nom: 'nom d\'utilisateur vide', f: (e) => e.config.users.forEach((u: any) => { u.name = ''; }) },
    { nom: 'poste de budget à 0', f: (e) => (e.budgetItems ?? []).forEach((b: any) => { b.target = 0; }) },
    { nom: 'poste de budget null', f: (e) => (e.budgetItems ?? []).forEach((b: any) => { b.target = null; }) },
    { nom: 'liveCSVBalances vide', f: (e) => { e.liveCSVBalances = {}; } },
    { nom: 'TOUT vide (actifs + transactions + comptes + budget + dettes)', f: (e) => { e.assets = []; e.transactions = []; e.accounts = []; e.budgetItems = []; e.debts = []; e.realEstate = []; e.goals = []; } },
    // ⚠️ Les GÉNÉRATEURS DE `0/0` : la seule façon crédible qu'un état légitime produise un `NaN`.
    // Un ratio dont le dénominateur peut valoir zéro (un rendement sans historique, une durée nulle)
    // rend `NaN` sans qu'aucune donnée ne soit corrompue — c'est exactement ce que la garde ne doit
    // pas confondre avec un blob Drive illisible.
    { nom: '0/0 — actif quantité 0 ET prix 0', f: (e) => (e.assets ?? []).forEach((a: any) => { a.quantity = 0; a.buyPrice = 0; a.currentPrice = 0; }) },
    { nom: '0/0 — dette solde 0, taux 0, paiement 0', f: (e) => (e.debts ?? []).forEach((d: any) => { d.balance = 0; d.interestRate = 0; d.monthlyPayment = 0; }) },
    { nom: '0/0 — immeuble valeur 0 et hypothèque 0', f: (e) => (e.realEstate ?? []).forEach((r: any) => { r.currentValue = 0; r.mortgageBalance = 0; r.monthlyPayment = 0; }) },
    { nom: '0/0 — objectif montant 0, échéance passée', f: (e) => (e.goals ?? []).forEach((g: any) => { g.targetAmount = 0; g.targetDate = '2000-01-01'; }) },
    { nom: '0/0 — revenus 0 ET dépenses 0 (taux d\'épargne indéfini)', f: (e) => { e.config.users.forEach((u: any) => { u.netSalary = 0; u.grossSalary = 0; }); (e.budgetItems ?? []).forEach((b: any) => { b.target = 0; }); } },
    { nom: '0/0 — âge de retraite = âge actuel (0 an d\'accumulation)', f: (e) => e.config.users.forEach((u: any) => { u.retirementAge = u.age ?? 35; }) },
    { nom: '0/0 — âge de retraite déjà dépassé', f: (e) => e.config.users.forEach((u: any) => { u.retirementAge = 20; }) },
    { nom: '0/0 — date de naissance absente', f: (e) => e.config.users.forEach((u: any) => { delete u.birthDate; delete u.age; }) },
    { nom: '0/0 — comptes à solde 0', f: (e) => (e.accounts ?? []).forEach((a: any) => { a.balance = 0; }) },
    { nom: '0/0 — transactions à montant 0', f: (e) => (e.transactions ?? []).forEach((t: any) => { t.amount = 0; }) },
    { nom: '0/0 — historique de prix vide (CAGR sans borne)', f: (e) => { (e.assets ?? []).forEach((a: any) => { a.priceHistory = []; }); e.portfolioHistory = []; } },
    { nom: '0/0 — un seul point d\'historique (CAGR sur 0 an)', f: (e) => { e.portfolioHistory = [{ date: '2026-01-01', value: 1000 }]; } },
    // Bornes extrêmes mais saisissables.
    { nom: 'inflation 0 et rendements 0', f: (e) => { e.projection = { ...(e.projection ?? {}), inflationRate: 0, returnRates: { celi: 0, reer: 0, nonReg: 0, crypto: 0, cash: 0 } }; } },
    { nom: 'inflation −100 % (déflation extrême)', f: (e) => { e.projection = { ...(e.projection ?? {}), inflationRate: -100 }; } },
];
/* eslint-enable @typescript-eslint/no-explicit-any */

for (const d of DEGRADATIONS) {
    const e = clone(base) as AppState;
    d.f(e);
    cas++; faux += refusDe(`dégradé — ${d.nom}`, e);
}

console.log(`\n  → ${cas} états légitimes, ${faux} faux refus${faux === 0 ? ' (aucun)' : ' ⚠️'}\n`);

// ── 2. COÛT ───────────────────────────────────────────────────────────────────────────────────────
console.log('2. COÛT — le scan grandit-il avec les données de Marc ?\n');

/** Nombre de nœuds que le scan doit visiter : la vraie mesure de l'assiette. */
function tailleAssiette(racine: unknown, vus = new WeakSet<object>()): number {
    if (racine === null || typeof racine !== 'object') return 1;
    if (vus.has(racine)) return 0;
    vus.add(racine);
    let n = 1;
    for (const v of Object.values(racine as Record<string, unknown>)) n += tailleAssiette(v, vus);
    return n;
}

function chrono(etat: AppState, etiquette: string): void {
    const params = buildSimulationParamsFromState(etat) as unknown as Readonly<Record<string, unknown>>;
    const budgetItems = (etat as unknown as { budgetItems?: unknown[] }).budgetItems ?? [];
    for (let i = 0; i < 200; i++) verifierEntreesMoteur(params, { budgetItems });   // chauffe
    const t0 = performance.now();
    const N = 2000;
    for (let i = 0; i < N; i++) verifierEntreesMoteur(params, { budgetItems });
    const us = ((performance.now() - t0) / N) * 1000;
    console.log(`  ${etiquette} : assiette ${tailleAssiette(params)} nœuds, ${us.toFixed(1)} µs/appel`);
}

chrono(clone(base), 'nominal                        ');

// ⚠️ DEUX façons de grossir, et elles ne donnent PAS le même résultat — c'est tout l'intérêt.
//
//   · Grossir ce qui n'entre PAS dans les paramètres (actifs, transactions) ne change rien :
//     l'assiette reste identique. C'est ce qui rend la garde tenable sur un gros portefeuille.
//   · Grossir ce qui Y ENTRE (dettes, objectifs immobiliers, événements de vie) la fait bien
//     grandir. Écrire « le coût ne grandit pas avec les données » serait donc trop large — il ne
//     grandit pas avec les COLLECTIONS LOURDES, ce qui n'est pas la même affirmation.
const grosHorsParams = clone(base) as AppState;
const premierActif = (grosHorsParams.assets ?? [])[0];
if (premierActif) grosHorsParams.assets = Array.from({ length: 500 }, (_, i) => ({ ...premierActif, id: `a${i}` }));
const premiereTx = (grosHorsParams.transactions ?? [])[0];
if (premiereTx) grosHorsParams.transactions = Array.from({ length: 5000 }, (_, i) => ({ ...premiereTx, id: i + 1 }));
chrono(grosHorsParams, '500 actifs, 5 000 transactions ');

const grosDansParams = clone(base) as AppState;
const premiereDette = (grosDansParams.debts ?? [])[0];
if (premiereDette) grosDansParams.debts = Array.from({ length: 40 }, () => clone(premiereDette));
const premierEvenement = (grosDansParams.lifeEvents ?? [])[0];
if (premierEvenement) grosDansParams.lifeEvents = Array.from({ length: 60 }, () => clone(premierEvenement));
chrono(grosDansParams, '40 dettes, 60 événements de vie');

// Le repère qui donne son sens au chiffre : le coût de la fonction qui APPELLE la garde.
const t0 = performance.now();
for (let i = 0; i < 200; i++) buildSimulationParamsFromState(base);
console.log(`\n  repère — buildSimulationParamsFromState : ${(((performance.now() - t0) / 200) * 1000).toFixed(1)} µs/appel\n`);
