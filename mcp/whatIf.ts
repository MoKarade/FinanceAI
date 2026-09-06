// mcp/whatIf.ts
//
// [MCP-WHATIF] — logique PURE du tool `simulate_what_if` : « si j'achète une
// voiture demain, comment ça affecte mes finances ? »
//
// Principe NON NÉGOCIABLE (no-fake-data) : aucun chiffre n'est inventé ici.
// Chaque changement hypothétique est traduit vers les VRAIES structures que le
// moteur consomme déjà (LifeEvent, Debt, RealEstateGoal, salaires du store,
// épargne mensuelle), puis le VRAI moteur (`calculateFutureProjection`) tourne
// DEUX fois — état réel tel quel vs état réel + changements — et on compare.
// Les seuls calculs faits ici sont des identités arithmétiques documentées
// (paiement de prêt amorti via `calculateMortgagePayment`, déjà utilisé par
// l'app) et chaque approximation de modélisation est REMONTÉE dans
// `assumptions` pour être affichée à l'utilisateur.

import type { AppState, Debt, LifeEvent, Municipality, RealEstateGoal, User } from '../types';
import type { SimulationParams } from '../services/projection';
import type { ProjectionChartPoint } from '../services/projection/types';
import {
    buildSimulationParams,
    deriveSimulationInputsFromState,
} from '../services/projection/buildSimulationParams';
import { calculateMortgagePayment, calculatePurchaseCosts } from '../services/realEstate';
import { formatCAD } from '../utils/format';

// ── Types de changements hypothétiques ───────────────────────────────────────

export interface WhatIfFinancing {
    /** Mise de fonds comptant ($). Le reste (`amount − downPayment`) devient une dette amortie. */
    downPayment: number;
    /** Taux annuel du prêt (%). */
    ratePct: number;
    /** Durée du prêt (années). */
    termYears: number;
}

export type WhatIfChange =
    | {
        /** Grosse dépense ponctuelle (voiture comptant, réno, voyage…). */
        kind: 'achat_ponctuel';
        label: string;
        amount: number;
        /** Dans combien de mois (défaut 1 = le mois prochain). */
        monthsFromNow?: number;
        /** Si financé : mise de fonds + prêt au lieu d'un débit comptant. */
        financing?: WhatIfFinancing;
    }
    | {
        /** Changement de salaire (promotion, temps partiel, perte…). */
        kind: 'salaire';
        /** 0 = premier conjoint (défaut), 1 = second. */
        userIndex?: number;
        /** Variation en % (ex. +10, −20). Exclusif avec newGrossMonthly. */
        changePct?: number;
        /** Nouveau salaire BRUT MENSUEL ($). */
        newGrossMonthly?: number;
        /** Nouveau salaire NET MENSUEL ($) — sinon net ajusté proportionnellement au brut. */
        newNetMonthly?: number;
    }
    | {
        /** Dépense récurrente en plus (+) ou en moins (−), $ par mois. */
        kind: 'depense_recurrente';
        label: string;
        monthlyAmount: number;
    }
    | {
        /** Nouvel emprunt à la consommation (le bien financé n'est PAS compté en actif). */
        kind: 'nouvelle_dette';
        label: string;
        amount: number;
        ratePct: number;
        /** Durée d'amortissement (années, défaut 5) si monthlyPayment absent. */
        termYears?: number;
        /** Paiement mensuel imposé (sinon calculé par la formule d'amortissement standard). */
        monthlyPayment?: number;
        category?: Debt['category'];
    }
    | {
        /** Achat immobilier (résidence ou locatif). */
        kind: 'achat_immobilier';
        price: number;
        /** Mise de fonds absolue ($) — exclusif avec downPaymentPct. */
        downPayment?: number;
        /** Mise de fonds en % du prix (ex. 20). */
        downPaymentPct?: number;
        ratePct: number;
        amortYears?: number;
        monthsFromNow?: number;
        isPrimaryResidence?: boolean;
        municipality?: Municipality;
        /** Charges mensuelles non récupérables (taxes, chauffage, condo…). */
        monthlyCharges?: number;
    };

interface WhatIfApplication {
    /** Clone de l'état réel avec les changements appliqués (l'original n'est JAMAIS muté). */
    state: AppState;
    /** Délta à appliquer à l'épargne mensuelle dérivée (négatif = dépense en plus). */
    monthlySavingsDelta: number;
    /** Hypothèses de modélisation à AFFICHER à l'utilisateur (transparence). */
    assumptions: string[];
    /** Résumé humain de chaque changement appliqué. */
    applied: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Mois ISO `YYYY-MM` à `monthsFromNow` mois d'aujourd'hui (format attendu par LifeEvent.date).
 * ⚠️ Construit la chaîne EXACTEMENT comme le moteur (`projection.ts` : `new Date(y, m, 1)` local
 * puis `toISOString()` UTC) — un formatage en composants LOCAUX décalerait l'événement d'un mois
 * dans les fuseaux en avance sur UTC (finding silent-failure, panel 2026-07-13).
 */
export function isoMonthFrom(now: Date, monthsFromNow: number): string {
    return new Date(now.getFullYear(), now.getMonth() + monthsFromNow, 1)
        .toISOString().split('T')[0].substring(0, 7);
}

/**
 * « vente » est un MOT RÉSERVÉ du moteur : `applyLifeEvents` (monthlyEvents.ts) route tout
 * LifeEvent dont le nom contient « vente » vers la branche VENTE IMMOBILIÈRE (qui ignore
 * `impactAmount`) → un achat étiqueté « … après vente de l'ancienne » disparaîtrait en
 * silence (delta 0). On assainit le nom INTERNE (le libellé montré à l'utilisateur via
 * `applied` reste le sien) et on le signale en assumption.
 */
function safeEngineName(label: string): { name: string; changed: boolean } {
    if (!/vente/i.test(label)) return { name: label, changed: false };
    return { name: label.replace(/vente/gi, 'achat'), changed: true };
}

/** Paiement mensuel d'un prêt amorti (formule standard, même helper que l'app). */
function loanMonthlyPayment(principal: number, ratePct: number, years: number): number {
    return calculateMortgagePayment({
        price: principal,
        downPayment: 0,
        rate: ratePct,
        amortization: years,
    }).monthlyMortgage;
}

function fmt(n: number): string {
    return formatCAD(Math.round(n));
}

/** Y a-t-il un 2ᵉ conjoint ? Test de CONTENU, jamais la longueur du tuple (leçon PH4E-OWNER-EDIT). */
function hasSpouse(users: readonly User[]): boolean {
    return Boolean(users[1]?.name?.trim());
}

// ── Application des changements ──────────────────────────────────────────────

/**
 * Applique les changements hypothétiques sur un CLONE de l'état réel.
 * Lève une Error à message clair (français) si un changement est invalide —
 * `withState` la présentera proprement à Claude.
 */
export function applyWhatIfChanges(
    base: AppState,
    changes: readonly WhatIfChange[],
    now: Date,
    opts?: {
        /** Horizon simulé en MOIS : un changement daté au-delà est REJETÉ (sinon il « réussirait » sans aucun effet). */
        horizonMonths?: number;
    },
): WhatIfApplication {
    if (!changes.length) throw new Error('Aucun changement fourni : précise au moins un changement hypothétique.');

    const horizonMonths = opts?.horizonMonths;
    const checkHorizon = (label: string, monthsFromNow: number): void => {
        if (horizonMonths != null && monthsFromNow >= horizonMonths) {
            throw new Error(
                `« ${label} » est daté dans ${monthsFromNow} mois mais l'horizon simulé est de ${Math.floor(horizonMonths / 12)} an(s) ` +
                `(${horizonMonths} mois) : il n'aurait AUCUN effet. Augmente l'horizon (years) ou rapproche la date.`,
            );
        }
    };
    const checkFinite = (label: string, field: string, value: number): void => {
        if (!Number.isFinite(value)) {
            throw new Error(`« ${label} » : ${field} non fini (${value}) — fournis un montant réel.`);
        }
    };

    const state: AppState = structuredClone(base);
    const assumptions: string[] = [
        'Tous les montants sont en dollars d’AUJOURD’HUI ; le moteur les indexe à l’inflation.',
        'Comparaison déterministe : même moteur, mêmes données réelles, seul(s) le(s) changement(s) décrits diffèrent.',
    ];
    const applied: string[] = [];
    let monthlySavingsDelta = 0;
    let seq = 0;
    const nextId = (): string => `whatif-${++seq}`;

    for (const change of changes) {
        switch (change.kind) {
            case 'achat_ponctuel': {
                checkFinite(change.label, 'montant', change.amount);
                if (!(change.amount > 0)) throw new Error(`Achat « ${change.label} » : montant invalide (${change.amount}).`);
                const monthsFromNow = change.monthsFromNow ?? 1;
                checkHorizon(change.label, monthsFromNow);
                const date = isoMonthFrom(now, monthsFromNow);
                const engineName = safeEngineName(change.label);
                if (engineName.changed) {
                    assumptions.push(
                        `Le libellé « ${change.label} » contient « vente » (mot réservé du moteur pour une vente immobilière) → ` +
                        'renommé en interne pour que l’achat soit bien débité comme une dépense.',
                    );
                }
                if (change.financing) {
                    const { downPayment, ratePct, termYears } = change.financing;
                    checkFinite(change.label, 'mise de fonds', downPayment);
                    if (downPayment < 0 || downPayment > change.amount) {
                        throw new Error(`Achat « ${change.label} » : mise de fonds invalide (${downPayment}).`);
                    }
                    if (monthsFromNow > 1) {
                        // Les dettes du moteur n'ont PAS de date de début (elles sont servies dès le
                        // mois 0) : un financement différé fausserait le patrimoine AVANT l'achat
                        // (mesuré : −28 k$ quatre ans trop tôt — panel financial-integrity 2026-07-13).
                        // → REJET honnête plutôt que chiffre faux. Cf BACKLOG [MCP-WHATIF-DATED-DEBT].
                        throw new Error(
                            `Achat financé « ${change.label} » : le financement différé (dans ${monthsFromNow} mois) n'est pas ` +
                            'supporté — le modèle de dette du moteur démarre aujourd’hui. Simule l’achat financé MAINTENANT ' +
                            '(monthsFromNow ≤ 1), ou un achat COMPTANT à la date future.',
                        );
                    }
                    const financed = change.amount - downPayment;
                    if (downPayment > 0) {
                        state.lifeEvents = [...(state.lifeEvents ?? []), {
                            id: nextId(), type: 'GROS_ACHAT', name: `${engineName.name} (mise de fonds)`,
                            date, impactAmount: downPayment,
                            // [ENG-LIFEEVENT-VENTE-SUBSTRING] Ceinture STRUCTURELLE : un achat n'est
                            // JAMAIS une vente, quel que soit le nom (safeEngineName reste la bretelle).
                            eventKind: 'NONE',
                        } satisfies LifeEvent];
                    }
                    const payment = loanMonthlyPayment(financed, ratePct, termYears);
                    state.debts = [...(state.debts ?? []), {
                        id: nextId(), name: `Prêt ${change.label}`, balance: financed,
                        interestRate: ratePct, minimumPayment: payment,
                        category: 'Car', amortizationYears: termYears,
                    } satisfies Debt];
                    assumptions.push(
                        `« ${change.label} » financé : le bien acheté n’est PAS compté comme actif (bien de consommation) ; ` +
                        `paiement de ${fmt(payment)}/mois calculé par amortissement standard (${ratePct} %, ${termYears} ans).`,
                    );
                    applied.push(`Achat financé « ${change.label} » : ${fmt(change.amount)} (${fmt(downPayment)} comptant + prêt de ${fmt(financed)} à ${ratePct} % sur ${termYears} ans) en ${date}.`);
                } else {
                    state.lifeEvents = [...(state.lifeEvents ?? []), {
                        id: nextId(), type: 'GROS_ACHAT', name: engineName.name,
                        date, impactAmount: change.amount,
                        eventKind: 'NONE', // ceinture structurelle (cf mise de fonds ci-dessus)
                    } satisfies LifeEvent];
                    assumptions.push(`« ${change.label} » payé comptant : bien de consommation, non compté comme actif.`);
                    applied.push(`Achat comptant « ${change.label} » : ${fmt(change.amount)} en ${date}.`);
                }
                break;
            }
            case 'salaire': {
                const idx = change.userIndex ?? 0;
                const users = state.config?.users ?? [];
                const user = users[idx];
                if (idx === 1 && !hasSpouse(users)) throw new Error('Changement de salaire : aucun 2ᵉ conjoint configuré.');
                if (!user) throw new Error(`Changement de salaire : utilisateur ${idx} introuvable.`);
                const oldGross = user.grossSalary || 0;
                const oldNet = user.netSalary || user.salary || 0;
                let newGross: number;
                if (change.changePct != null) {
                    newGross = oldGross * (1 + change.changePct / 100);
                } else if (change.newGrossMonthly != null) {
                    newGross = change.newGrossMonthly;
                } else {
                    throw new Error('Changement de salaire : précise changePct OU newGrossMonthly.');
                }
                if (!(Number.isFinite(newGross) && newGross >= 0)) throw new Error(`Changement de salaire : brut résultant invalide (${newGross}).`);
                let newNet: number;
                if (change.newNetMonthly != null) {
                    newNet = change.newNetMonthly;
                } else if (oldGross > 0) {
                    newNet = oldNet * (newGross / oldGross);
                    assumptions.push(
                        `Salaire de ${user.name || `conjoint ${idx + 1}`} : NET de départ ajusté proportionnellement au brut ` +
                        '(approximation — la progressivité fiscale du premier dollar n’est pas recalculée ici ; ' +
                        'l’impôt de la PROJECTION, lui, est recalculé par le moteur sur le brut).',
                    );
                } else {
                    throw new Error(
                        'Changement de salaire : salaire brut actuel = 0, impossible d’ajuster le net proportionnellement — fournis newNetMonthly.',
                    );
                }
                user.grossSalary = newGross;
                user.netSalary = newNet;
                applied.push(`Salaire de ${user.name || `conjoint ${idx + 1}`} : brut ${fmt(oldGross)} → ${fmt(newGross)}/mois (net ${fmt(oldNet)} → ${fmt(newNet)}).`);
                break;
            }
            case 'depense_recurrente': {
                if (!Number.isFinite(change.monthlyAmount) || change.monthlyAmount === 0) {
                    throw new Error(`Dépense récurrente « ${change.label} » : montant invalide (${change.monthlyAmount}).`);
                }
                monthlySavingsDelta -= change.monthlyAmount;
                assumptions.push(
                    `« ${change.label} » (${fmt(change.monthlyAmount)}/mois) ajuste les dépenses mensuelles du moteur — ` +
                    'même effet qu’une ligne de budget ; la cible FIRE (dépenses × 25) bouge en conséquence. ' +
                    'S’applique en phase ACTIVE : en retraite, les dépenses du moteur = le revenu cible configuré.',
                );
                applied.push(change.monthlyAmount > 0
                    ? `Dépense récurrente « ${change.label} » : +${fmt(change.monthlyAmount)}/mois.`
                    : `Réduction de dépenses « ${change.label} » : −${fmt(-change.monthlyAmount)}/mois.`);
                break;
            }
            case 'nouvelle_dette': {
                checkFinite(change.label, 'montant', change.amount);
                if (!(change.amount > 0)) throw new Error(`Nouvelle dette « ${change.label} » : montant invalide (${change.amount}).`);
                const years = change.termYears ?? 5;
                const payment = change.monthlyPayment ?? loanMonthlyPayment(change.amount, change.ratePct, years);
                state.debts = [...(state.debts ?? []), {
                    id: nextId(), name: change.label, balance: change.amount,
                    interestRate: change.ratePct, minimumPayment: payment,
                    category: change.category ?? 'Personal', amortizationYears: years,
                } satisfies Debt];
                assumptions.push(
                    `« ${change.label} » : emprunt à la consommation — le bien financé n’est PAS compté comme actif, ` +
                    `paiement de ${fmt(payment)}/mois${change.monthlyPayment != null ? ' (fourni)' : ` (amortissement standard, ${change.ratePct} %, ${years} ans)`}.`,
                );
                applied.push(`Nouvelle dette « ${change.label} » : ${fmt(change.amount)} à ${change.ratePct} %.`);
                break;
            }
            case 'achat_immobilier': {
                checkFinite('Achat immobilier', 'prix', change.price);
                if (!(change.price > 0)) throw new Error(`Achat immobilier : prix invalide (${change.price}).`);
                checkHorizon('Achat immobilier', change.monthsFromNow ?? 3);
                const downPayment = change.downPayment ?? (change.downPaymentPct != null
                    ? change.price * (change.downPaymentPct / 100)
                    : change.price * 0.20);
                checkFinite('Achat immobilier', 'mise de fonds', downPayment);
                if (downPayment > change.price) {
                    throw new Error(`Achat immobilier : mise de fonds (${fmt(downPayment)}) supérieure au prix (${fmt(change.price)}).`);
                }
                if (change.downPayment == null && change.downPaymentPct == null) {
                    assumptions.push('Achat immobilier : mise de fonds non précisée → 20 % du prix (conventionnel, sans prime SCHL).');
                }
                if (downPayment / change.price < 0.20) {
                    assumptions.push(
                        'Mise de fonds < 20 % : le moteur ajoute la prime SCHL au principal — le paiement réel sera un peu ' +
                        'plus élevé que celui affiché ici (le patrimoine projeté, lui, en tient compte).',
                    );
                }
                const amortYears = change.amortYears ?? 25;
                const isPrimary = change.isPrimaryResidence ?? true;
                const payment = calculateMortgagePayment({
                    price: change.price, downPayment, rate: change.ratePct, amortization: amortYears,
                });
                // ⚠️ totalClosingCosts SANS taxe de bienvenue : le moteur l'ajoute LUI-MÊME au mois
                // d'achat (realEstateMonth.ts, `welcomeFees`) — l'inclure ici la double-compterait.
                const costs = calculatePurchaseCosts({ price: change.price, downPayment, municipality: change.municipality });
                const closingWithoutWelcomeTax = costs.notaryFees + costs.inspectionFees;
                if (!change.municipality) {
                    assumptions.push('Achat immobilier : municipalité non précisée → taxe de bienvenue au barème MONTRÉAL (repli conservateur du moteur).');
                }
                if (change.monthlyCharges == null) {
                    assumptions.push('Achat immobilier : charges mensuelles (taxes, chauffage, condo) non précisées → 0 $/mois (optimiste — fournis monthlyCharges pour affiner).');
                }
                state.realEstateGoals = [...(state.realEstateGoals ?? []), {
                    id: nextId(), name: 'Achat what-if', isActive: true,
                    purchaseDate: `${isoMonthFrom(now, change.monthsFromNow ?? 3)}-01`,
                    price: change.price, downPayment,
                    mortgageRate: change.ratePct, amortization: amortYears,
                    totalClosingCosts: closingWithoutWelcomeTax,
                    monthlyPayment: payment.monthlyMortgage,
                    unrecoverableMonthly: change.monthlyCharges ?? 0,
                    isPrimaryResidence: isPrimary,
                    municipality: change.municipality,
                } satisfies RealEstateGoal];
                applied.push(
                    `Achat immobilier : ${fmt(change.price)} (mise de fonds ${fmt(downPayment)}, hypothèque à ${change.ratePct} % sur ${amortYears} ans, ` +
                    `paiement ${fmt(payment.monthlyMortgage)}/mois, ${isPrimary ? 'résidence principale' : 'locatif/secondaire'}).`,
                );
                break;
            }
        }
    }

    return { state, monthlySavingsDelta, assumptions, applied };
}

// ── Assemblage des paramètres moteur ─────────────────────────────────────────

/**
 * AppState → SimulationParams pour un run what-if : même adaptateur pur que
 * tous les tools data-aware, avec le `now` PARTAGÉ entre les deux runs
 * (déterminisme base vs scénario) + le délta d'épargne mensuelle.
 */
export function buildWhatIfParams(
    state: AppState,
    now: Date,
    years: number,
    monthlySavingsDelta = 0,
): SimulationParams {
    const inputs = deriveSimulationInputsFromState(state, { now });
    // Délta appliqué APRÈS le clamp ≥ 0 de computeMonthlySavings : une dépense
    // qui dépasse l'épargne rend le solde honnêtement négatif (déficit visible),
    // au lieu d'être avalée par le clamp.
    inputs.calculatedMonthlySavings += monthlySavingsDelta;
    inputs.projection = { ...inputs.projection, years };
    return buildSimulationParams(inputs);
}

// ── Séries annuelles (pour que Claude trace des graphiques EXACTS) ───────────

interface YearlyPoint {
    year: number | null;
    age: number | null;
    netWorth: number;
    realNetWorth: number | null;
    liquidites: number | null;
    celi: number | null;
    reer: number | null;
    celiapp: number | null;
    nonReg: number | null;
    crypto: number | null;
    reee: number | null;
    immobilier: number | null;
    dettesNonImmo: number | null;
    detteTotale: number | null;
}

const roundOrNull = (v: number | undefined | null): number | null =>
    (typeof v === 'number' && Number.isFinite(v)) ? Math.round(v) : null;

/**
 * Échantillonne `chartData` (mensuel) en points ANNUELS (décembre de chaque
 * année + dernier point) — assez fin pour un graphique, assez compact pour une
 * réponse MCP (≤ 51 points sur 50 ans).
 */
export function extractYearlySeries(chartData: readonly ProjectionChartPoint[]): YearlyPoint[] {
    const out: YearlyPoint[] = [];
    chartData.forEach((p, i) => {
        const isYearEnd = (p.monthIndex + 1) % 12 === 0;
        const isLast = i === chartData.length - 1;
        if (!isYearEnd && !isLast) return;
        out.push({
            year: p.year ?? null,
            age: p.age ?? null,
            netWorth: Math.round(p.NetWorth),
            realNetWorth: roundOrNull(p.realNetWorth),
            liquidites: roundOrNull(p.Liquidites),
            celi: roundOrNull(p.CELI),
            reer: roundOrNull(p.REER),
            celiapp: roundOrNull(p.CELIAPP),
            nonReg: roundOrNull(p.NonReg),
            crypto: roundOrNull(p.Crypto),
            reee: roundOrNull(p.REEE),
            immobilier: roundOrNull(p.Immobilier),
            dettesNonImmo: roundOrNull(p.DettesNonImmo),
            detteTotale: roundOrNull(p.DetteTotale),
        });
    });
    return out;
}

// ── Comparaison base vs what-if ──────────────────────────────────────────────

interface HorizonDelta {
    afterYears: number;
    baseNetWorth: number;
    whatIfNetWorth: number;
    /** whatIf − base (négatif = le changement coûte). */
    netWorthDelta: number;
    baseNetWorthReal: number | null;
    whatIfNetWorthReal: number | null;
    netWorthDeltaReal: number | null;
}

/** Dernier point du mois `months*12 − 1` (ou le plus proche en dessous). */
function pointAtYears(chartData: readonly ProjectionChartPoint[], years: number): ProjectionChartPoint | undefined {
    const target = years * 12 - 1;
    let best: ProjectionChartPoint | undefined;
    for (const p of chartData) {
        if (p.monthIndex <= target) best = p;
        else break;
    }
    return best;
}

export function compareAtHorizons(
    base: readonly ProjectionChartPoint[],
    whatIf: readonly ProjectionChartPoint[],
    horizonYears: number,
): HorizonDelta[] {
    const marks = [1, 2, 5, 10, 20, 30, horizonYears]
        .filter((y, i, arr) => y <= horizonYears && arr.indexOf(y) === i)
        .sort((a, b) => a - b);
    const out: HorizonDelta[] = [];
    for (const y of marks) {
        const b = pointAtYears(base, y);
        const w = pointAtYears(whatIf, y);
        if (!b || !w) continue;
        const bReal = roundOrNull(b.realNetWorth);
        const wReal = roundOrNull(w.realNetWorth);
        out.push({
            afterYears: y,
            baseNetWorth: Math.round(b.NetWorth),
            whatIfNetWorth: Math.round(w.NetWorth),
            // Délta calculé sur les valeurs ARRONDIES : garantit netWorthDelta ==
            // whatIfNetWorth − baseNetWorth tels qu'affichés (pas d'écart de ±1 $).
            netWorthDelta: Math.round(w.NetWorth) - Math.round(b.NetWorth),
            baseNetWorthReal: bReal,
            whatIfNetWorthReal: wReal,
            netWorthDeltaReal: (bReal != null && wReal != null) ? wReal - bReal : null,
        });
    }
    return out;
}

/** Âge au 1er mois où la valeur nette atteint la cible FIRE (sinon null). */
export function fireAgeOf(chartData: readonly ProjectionChartPoint[]): number | null {
    const d = chartData.find((p) => (p.FireTarget || 0) > 0 && (p.NetWorth || 0) >= (p.FireTarget || 0));
    return d ? (d.age ?? null) : null;
}
