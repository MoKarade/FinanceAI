#!/usr/bin/env tsx
// Script CLI : la sortie console est volontaire.
/* eslint-disable no-console */
//
// [DEBT-AMORTIZATION-CABLAGE] Mesure AVANT/APRÈS de la courbe du PASSÉ, et recensement de qui est
// RÉELLEMENT touché par le lot.
//
// ⚠️ Pourquoi ce script est COMMITTÉ. Un montant cité dans le dépôt exige un script de reproduction
// qui nomme CHAQUE paramètre avec sa valeur (`UN-RAPPORT-D-AGENT-N-EST-PAS-UNE-SOURCE`) : les
// chiffres de la PR et du CHANGELOG viennent d'ici, pas d'une session.
//
// ⚠️ « AVANT » n'est PAS une version antérieure du code : avant ce lot, le champ `originalBalance`
// n'existait pas, donc le service refuse (`donnees-manquantes`) et le supplément vaut 0 — le passé
// reste au niveau figé d'aujourd'hui. Comparer AVEC et SANS ce champ, à code identique, mesure donc
// exactement le changement livré, et c'est aussi la garantie de non-régression pour les utilisateurs
// qui ne l'ont pas saisi.
//
// Run : `npx tsx scripts/mesureAmortissementPasse.ts`
import { buildPastPrefix } from '../services/history/buildPastPrefix.ts';
import { KIND_AMORTISSANT, type DebtAmortissable } from '../services/projection/debtAmortization.ts';
import { TEST_PERSONAS } from '../services/testPersonas/index.ts';
import type { PortfolioHistoryPoint } from '../services/history/reconstructPortfolioHistory.ts';

// ── Scénario, tous paramètres nommés ────────────────────────────────────────────────────────────
const SCENARIO = {
    /** Mois 0 de la projection = « aujourd'hui ». */
    startYear: 2026,
    startMonth: 0,
    /** Prêt auto : 30 000 $ empruntés en janvier 2024, 18 000 $ restants, 5 %/an, 560 $/mois. */
    pret: {
        kind: 'auto', balance: 18000, originalBalance: 30000,
        startDate: '2024-01-15', interestRate: 5, minimumPayment: 560,
    } satisfies DebtAmortissable,
    /** Total des dettes hors hypothèque publié par le moteur au mois 0 (= le solde du prêt seul). */
    currentDebtNonImmo: 18000,
    /** Placements reconstruits, PLATS, pour isoler l'effet de la dette (aucune autre variation). */
    celiPlat: 50000,
    /** Cash de départ et unique transaction connue (fixe le début de la ligne de patrimoine). */
    calculatedStartingCash: 3000,
    premiereTransaction: { date: '2024-01-15', amount: -500 },
} as const;

const invPoint = (date: string, celi: number): PortfolioHistoryPoint =>
    ({ date, monthIndex: 0, CELI: celi, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0, InvestedValue: celi });

const base = {
    startYear: SCENARIO.startYear,
    startMonth: SCENARIO.startMonth,
    realEstateGoals: [],
    transactions: [SCENARIO.premiereTransaction],
    calculatedStartingCash: SCENARIO.calculatedStartingCash,
    pastHistoryPoints: [invPoint('2024-01-31', SCENARIO.celiPlat), invPoint('2025-12-31', SCENARIO.celiPlat)],
    currentDebtNonImmo: SCENARIO.currentDebtNonImmo,
};

// ── 1. Effet sur la courbe du passé ─────────────────────────────────────────────────────────────
const avant = buildPastPrefix({ ...base, debts: [{ ...SCENARIO.pret, originalBalance: undefined }] });
const apres = buildPastPrefix({ ...base, debts: [SCENARIO.pret] });

console.log('=== Patrimoine net du PASSÉ : sans / avec le montant emprunté ===');
console.log('mois  date      avant($)   après($)    écart($)');
for (let i = 0; i < apres.length; i++) {
    const a = avant[i].NetWorth, b = apres[i].NetWorth;
    if (a === undefined || b === undefined) continue;
    // Un point sur trois : la courbe est mensuelle sur 24 mois, la tendance suffit.
    if (i % 3 !== 0 && i !== apres.length - 1) continue;
    console.log(
        `${String(apres[i].monthIndex).padStart(4)}  ${apres[i].dateLabel}  ${String(a).padStart(8)}  ${String(b).padStart(9)}  ${String(b - a).padStart(9)}`,
    );
}

// ── 2. Recensement : combien de dettes du dépôt sont RÉELLEMENT concernées ? ─────────────────────
// Explique pourquoi AUCUN golden ne bouge — « aucun golden n'a bougé » est un résultat à EXPLIQUER,
// jamais un feu vert.
let total = 0, avecOrigine = 0, amortissantes = 0;
for (const persona of TEST_PERSONAS) {
    for (const d of persona.build().debts ?? []) {
        total++;
        if (typeof (d as { originalBalance?: number }).originalBalance === 'number') avecOrigine++;
        if (d.kind && KIND_AMORTISSANT[d.kind]) amortissantes++;
    }
}
console.log('\n=== Couverture dans les personas du dépôt ===');
console.log(`dettes=${total}  type_amortissant=${amortissantes}  avec_originalBalance=${avecOrigine}`);
console.log(avecOrigine === 0
    ? '→ aucune dette du dépôt ne porte le montant emprunté : la courbe de TOUS les goldens est inchangée, bit pour bit.'
    : '→ des goldens portent le champ : leur déplacement doit être justifié un par un.');
