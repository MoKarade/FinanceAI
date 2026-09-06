// tests/helpers/menageProprietaire.ts
//
// [TEST-DIVORCE-SANS-IMMOBILIER] Fixture RÉUTILISABLE « couple propriétaire » — la maison DÉTENUE que
// les 16 fixtures de divorce du dépôt n'avaient pas (toutes portaient `realEstateGoals: []`, ce qui
// a laissé un correctif de dizaines de milliers de dollars — `[ENG-DIVORCE-PMT-NON-PARTAGEE]`,
// #737 — sans aucun golden à re-baser). Elle vivait en DEUX copies identiques
// (`divorcePmtPartagee.test.ts`, `divorceImmobilier.test.ts`) ; hissée ici au lot 197 pour que la
// garde de conservation du divorce puisse enfin l'employer sans en écrire une troisième.
//
// ⚠️ `isActive` ET `isOwned` sont TOUS DEUX indispensables : `projection.ts` n'initialise un achat
// PASSÉ que sous `g.isActive && purchaseOffset < 0 && g.isOwned !== false`. Sans `isActive`, le
// bien n'existe pas du tout — mesuré `Immobilier = 0` sur tout l'horizon, et la fixture aurait
// mesuré un scénario SANS maison tout en paraissant en décrire une.
//
// ⚠️ Un partage à 50 % ne distingue PAS `keep` de `1 − keep` (les deux valent 0,5) : un test
// DISCRIMINANT sur le partage tourne à 75 %, où confondre les deux fait ×3 d'écart.

import type { RealEstateGoal, User } from '../../types';

/** Couple de 45 ans par défaut, deux salaires (brut mensuel 8 200 $ + 7 100 $). */
export const usersCouple = (age = 45): User[] => ([
    { name: 'Marc', grossSalary: 8_200, netSalary: 5_620, color: '#10b981', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
    { name: 'Anna', grossSalary: 7_100, netSalary: 4_995, color: '#3b82f6', age, birthYear: 2026 - age, canadaArrivalYear: 2026 - age, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 },
] as unknown as User[]);

/**
 * Maison 500 000 $ achetée le 2021-01-01, mise 100 000 $, 5 % / 25 ans, résidence principale,
 * croissance 3 %/an. Rend un objet NEUF à chaque appel (une fixture partagée ne casse pas un test,
 * elle le rend faux — `UNE-FIXTURE-PARTAGEE-NE-CASSE-PAS-UN-TEST-ELLE-LE-REND-FAUX`).
 */
export const maisonDetenue = (): RealEstateGoal => ({
    id: 'p1', name: 'Maison', price: 500_000, downPayment: 100_000,
    mortgageRate: 5, amortization: 25, purchaseDate: '2021-01-01', isActive: true, isOwned: true,
    propertyGrowthRate: 3, isPrimaryResidence: true,
} as unknown as RealEstateGoal);
