
import { BudgetCategory, BudgetConfig, ProjectionConfig, User, RealEstateGoal, ChildGoal, Tab } from "./types";

// [CHAT-PAGE-CONTEXT] Libellés FR des onglets — SOURCE UNIQUE (consommée par TabRouter ET le
// contexte d'écran du chat, services/aiChat/viewContext.ts). Ne pas redéclarer ailleurs.
export const TAB_LABELS: Record<Tab, string> = {
    [Tab.DASHBOARD]: 'Accueil',
    [Tab.TRANSACTIONS]: 'Transactions',
    [Tab.BUDGET]: 'Budget',
    [Tab.DEBT]: 'Dettes',
    [Tab.INVESTMENTS]: 'Investissements',
    [Tab.FUTURE]: 'Futur',
    [Tab.REAL_ESTATE]: 'Immobilier',
    [Tab.REAL_ESTATE_PROJECTS]: 'Projets immo',
    [Tab.CHILD]: 'Enfant',
    [Tab.TRAVEL]: 'Voyages',
    [Tab.LIFE_EVENTS]: 'Parcours de Vie',
    [Tab.LIFE_PROJECTS]: 'Projets de vie',
    [Tab.RETIREMENT]: 'Retraite',
    [Tab.TAX]: 'Impôts & Docs',
    [Tab.SETTINGS]: 'Paramètres',
    [Tab.PROFILE]: 'Profil',
    [Tab.ASSISTANT]: 'Assistant IA',
};

// ============================================================
// PROFIL PAR DÉFAUT — Neutre, à configurer dans Settings
// Les vrais chiffres sont entrés par l'utilisateur dans Paramètres
// ============================================================
// P1 — Defaults factices "Marc / Anna" retirés (doc directives utilisateur :
// "je veux vide tant que j'ai pas rentré les infos moi").
// L'Onboarding remplit ces valeurs avec les vraies données utilisateur au
// premier launch. Couleurs préservées car cosmétiques.
const INITIAL_USERS: [User, User] = [
  {
    name: "",
    grossSalary: 0,
    netSalary: 0,
    color: "#BFDBFE",
    age: 0,
    birthYear: 0,
    canadaArrivalYear: 0,
    hasOwnedPropertyLast4Years: false,
    hasChildren: false,
    childCount: 0
  },
  {
    name: "",
    grossSalary: 0,
    netSalary: 0,
    color: "#FBCFE8",
    age: 0,
    birthYear: 0,
    canadaArrivalYear: 0,
    hasOwnedPropertyLast4Years: false,
    hasChildren: false,
    childCount: 0
  }
];

// P1 — Catégories de budget retirées (doc directives : zéro données factices).
// L'utilisateur crée ses propres catégories dans Budget. Une suggestion IA
// peut générer un budget basé sur les vraies transactions importées.
export const INITIAL_BUDGET: BudgetCategory[] = [];

export const INITIAL_CONFIG: BudgetConfig = {
  users: INITIAL_USERS,
  splitMode: 'prorata'
};

export const INITIAL_PROJECTION: ProjectionConfig = {
  years: 40,
  returnRate: 7,
  inflationRate: 2,
  salaryGrowth: 2.5,
  savingsMode: 'budget',
  manualContribution: 0,
  usePortfolioRate: true,
  returnRates: { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 },
  emergencyFundMonths: 3,
  theoreticalIncome: 7000,
  theoreticalExpenses: 4000,
  useTheoretical: false
};

// P1 — Defaults factices immobilier retirés (zéro données factices).
// L'utilisateur saisit son propre projet immobilier dans l'onglet Immobilier.
// `isActive: false` donc rien n'apparaît dans les projections tant qu'il
// n'a pas activé un projet.
export const INITIAL_REAL_ESTATE_GOAL: RealEstateGoal = {
  id: 'main_property',
  isActive: false,
  purchaseDate: new Date(new Date().setFullYear(new Date().getFullYear() + 3)).toISOString().split('T')[0],
  price: 0,
  downPayment: 0,
  mortgageRate: 0,
  amortization: 25,
  totalClosingCosts: 0,
  monthlyPayment: 0,
  unrecoverableMonthly: 0,
  isPrimaryResidence: true,
  isRented: false,
  maxValue: 0
};

// Valeurs réalistes pour la planification d'un enfant (Québec 2025)
export const INITIAL_CHILD_GOAL: ChildGoal = {
  id: 'child_1',
  name: 'Enfant 1',
  isActive: false,
  birthDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
  initialCost: 3000,           // Équipement bébé (poussette, lit, etc.)
  monthlyDiapers: 80,          // Couches et produits hygiène
  monthlyFood: 100,            // Nourriture (allaitement → solides)
  monthlyClothing: 60,         // Vêtements
  monthlyDaycare: 10,          // CPE subventionné Québec ~10$/jour (~200$/mois)
  governmentBenefits: 563,     // Allocation canadienne pour enfants (revenu moyen)
  parentalLeaveIncomeDrop: 800 // Baisse de revenu pendant le congé parental
};

// ============================================================
// TAUX DE CHANGE PAR DÉFAUT (Fallback si API indisponible)
// Source: Banque du Canada — mis à jour automatiquement par l'app
// ============================================================
export const DEFAULT_FX_RATES = {
  USD: 1.40, // Mise à jour approximation Q1 2026
  EUR: 1.47,
  CAD: 1.00,
  lastFetched: 0 // 0 = jamais mis à jour automatiquement
};
