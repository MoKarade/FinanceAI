
import { BudgetCategory, BudgetConfig, InvestmentAccount, InvestmentTransaction, ProjectionConfig, User, Asset, RealEstateGoal, ChildGoal, Debt } from "./types";

// ============================================================
// CATÉGORIES PAR DÉFAUT — Génériques (non spécifiques à un profil)
// ============================================================
export const DEFAULT_CATEGORIES = [
  "Loyer / Hypothèque", "Voyage", "Meubles & Déco", "Tech", "Costco / Vrac",
  "Hydro-Québec", "Resto / Sorties", "Vape", "Épicerie", "Activités / Sorties",
  "Internet / Wifi", "Assurance Habitation", "Streaming", "Alcool / SAQ",
  "Beuh", "Pharmacie", "Produits Ménagers / Entretien", "Autre", "Hobby",
  "Cadeaux", "Entretien auto", "Essence", "Vêtements", "Coiffeur", "Jeux Vidéo",
  "Sport", "Finances", "Café / Snacks", "Stationnement"
];

export const CATEGORY_ICONS: Record<string, string> = {
  "Loyer / Hypothèque": "🏠", "Voyage": "✈️", "Meubles & Déco": "🛋️",
  "Tech": "💻", "Costco / Vrac": "📦", "Hydro-Québec": "⚡", "Resto / Sorties": "🍽️",
  "Vape": "💨", "Épicerie": "🛒", "Activités / Sorties": "🎟️", "Internet / Wifi": "📶",
  "Assurance Habitation": "🛡️", "Streaming": "📺", "Alcool / SAQ": "🍷",
  "Beuh": "🥬", "Pharmacie": "💊", "Produits Ménagers / Entretien": "🧽",
  "Autre": "📌", "Hobby": "🎨", "Cadeaux": "🎁", "Entretien auto": "🔧",
  "Essence": "⛽", "Vêtements": "👕", "Coiffeur": "✂️", "Jeux Vidéo": "🎮",
  "Sport": "🏋️", "Finances": "💰", "Café / Snacks": "☕", "Stationnement": "🅿️"
};

// ============================================================
// PROFIL PAR DÉFAUT — Neutre, à configurer dans Settings
// Les vrais chiffres sont entrés par l'utilisateur dans Paramètres
// ============================================================
export const INITIAL_USERS: [User, User] = [
  {
    name: "Marc",
    grossSalary: 110000,
    netSalary: 6200,
    color: "#BFDBFE",
    age: 34,
    birthYear: 1991, // V38: Strict Canadian mode
    canadaArrivalYear: 2023,
    hasOwnedPropertyLast4Years: false,
    hasChildren: false,
    childCount: 0
  },
  {
    name: "Anna",
    grossSalary: 85000,
    netSalary: 4800,
    color: "#FBCFE8",
    age: 32,
    birthYear: 1993,
    canadaArrivalYear: 2023,
    hasOwnedPropertyLast4Years: false,
    hasChildren: false,
    childCount: 0
  }
];

// Budget par défaut générique — catégories communes, montants à ajuster
export const INITIAL_BUDGET: BudgetCategory[] = [
  { id: "cat_loyer", name: "Loyer / Hypothèque", target: 1500, frequency: "Monthly", type: "Commun", nature: "Besoin" },
  { id: "cat_costco", name: "Costco / Vrac", target: 300, frequency: "Monthly", type: "Commun", nature: "Besoin" },
  { id: "cat_hydro", name: "Hydro-Québec", target: 100, frequency: "Monthly", type: "Commun", nature: "Besoin" },
  { id: "cat_epicerie", name: "Épicerie", target: 500, frequency: "Monthly", type: "Commun", nature: "Besoin" },
  { id: "cat_internet", name: "Internet / Wifi", target: 80, frequency: "Monthly", type: "Commun", nature: "Besoin" },
  { id: "cat_ass_hab", name: "Assurance Habitation", target: 50, frequency: "Monthly", type: "Commun", nature: "Besoin" },
  { id: "cat_pharmacie", name: "Pharmacie", target: 50, frequency: "Monthly", type: "Commun", nature: "Besoin" },
  { id: "cat_prod_men", name: "Produits Ménagers / Entretien", target: 40, frequency: "Monthly", type: "Commun", nature: "Besoin" },
  { id: "cat_ent_auto", name: "Entretien auto", target: 50, frequency: "Monthly", type: "Commun", nature: "Besoin" },
  { id: "cat_essence", name: "Essence", target: 150, frequency: "Monthly", type: "Commun", nature: "Besoin" },

  { id: "cat_voyage", name: "Voyage", target: 200, frequency: "Monthly", type: "Commun", nature: "Envie" },
  { id: "cat_meubles", name: "Meubles & Déco", target: 50, frequency: "Monthly", type: "Commun", nature: "Envie" },
  { id: "cat_tech", name: "Tech", target: 100, frequency: "Monthly", type: "Commun", nature: "Envie" },
  { id: "cat_resto", name: "Resto / Sorties", target: 200, frequency: "Monthly", type: "Commun", nature: "Envie" },
  { id: "cat_vape", name: "Vape", target: 60, frequency: "Monthly", type: "Commun", nature: "Envie" },
  { id: "cat_activites", name: "Activités / Sorties", target: 100, frequency: "Monthly", type: "Commun", nature: "Envie" },
  { id: "cat_streaming", name: "Streaming", target: 30, frequency: "Monthly", type: "Commun", nature: "Envie" },
  { id: "cat_alcool", name: "Alcool / SAQ", target: 80, frequency: "Monthly", type: "Commun", nature: "Envie" },
  { id: "cat_beuh", name: "Beuh", target: 60, frequency: "Monthly", type: "Commun", nature: "Envie" },
  { id: "cat_hobby", name: "Hobby", target: 50, frequency: "Monthly", type: "Commun", nature: "Envie" },
  { id: "cat_cadeaux", name: "Cadeaux", target: 50, frequency: "Monthly", type: "Commun", nature: "Envie" },
  { id: "cat_vetements", name: "Vêtements", target: 100, frequency: "Monthly", type: "Commun", nature: "Envie" },
  { id: "cat_coiffeur", name: "Coiffeur", target: 40, frequency: "Monthly", type: "Commun", nature: "Envie" },
  { id: "cat_jeux", name: "Jeux Vidéo", target: 40, frequency: "Monthly", type: "Commun", nature: "Envie" },
  { id: "cat_sport", name: "Sport", target: 50, frequency: "Monthly", type: "Commun", nature: "Envie" },
  { id: "cat_cafe", name: "Café / Snacks", target: 50, frequency: "Monthly", type: "Commun", nature: "Envie" },
  { id: "cat_stat", name: "Stationnement", target: 20, frequency: "Monthly", type: "Commun", nature: "Envie" },

  { id: "cat_finances", name: "Finances", target: 500, frequency: "Monthly", type: "Commun", nature: "Epargne" },
  { id: "cat_autre", name: "Autre", target: 100, frequency: "Monthly", type: "Commun", nature: "Envie" }
];

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

export const INITIAL_REAL_ESTATE_GOAL: RealEstateGoal = {
  id: 'main_property',
  isActive: false,
  purchaseDate: new Date(new Date().setFullYear(new Date().getFullYear() + 3)).toISOString().split('T')[0],
  price: 450000,
  downPayment: 90000,
  mortgageRate: 4.5,
  amortization: 25,
  totalClosingCosts: 10000,
  monthlyPayment: 2100,
  unrecoverableMonthly: 1500,
  isPrimaryResidence: true,
  isRented: false,
  maxValue: 1200000
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

export const MOCK_ASSETS: Asset[] = [];

export const INITIAL_INVESTMENT_ACCOUNTS: InvestmentAccount[] = [
  { id: 'acc_1', userId: 0, name: 'CELI', type: 'CELI' },
  { id: 'acc_2', userId: 0, name: 'REER', type: 'REER' },
  { id: 'acc_3', userId: 0, name: 'Non-Enreg', type: 'NON-ENREG' }
];

export const INITIAL_INVESTMENT_TRANSACTIONS: InvestmentTransaction[] = [];

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
