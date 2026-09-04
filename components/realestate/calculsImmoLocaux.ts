// [GODFILE-REALESTATE-CMP] Calculs LOCAUX de l'atelier immobilier, extraits tels quels de
// RealEstateWorkspace.tsx (lot 153). Ce sont les calculs d'ÉCRAN (table d'amortissement locale,
// comparaison Acheter-vs-Louer) — PAS le moteur : la vérité long-terme reste
// `services/projection` (runAmortization / lastProjection.chartData). Fonctions PURES : aucune
// lecture de store, aucune horloge — `targetDate` arrive en argument.

export interface ParamsAmortissement {
    totalMortgage: number;
    /** Taux hypothécaire initial, en % annuel (ex. 4.5). */
    rate: number;
    /** Taux appliqué aux renouvellements quinquennaux, en % annuel. */
    renewalRate: number;
    monthlyMortgage: number;
    /** Durée d'amortissement en années. */
    amortization: number;
    price: number;
    propertyGrowthRate: number;
    initialRenovations: number;
    /** Plafond de valeur du bien (0 = aucun plafond). */
    maxValue: number;
    /** Date d'achat ISO — fixe l'année calendrier de la première ligne. */
    targetDate: string;
    yearlyRenovations: number;
}

export interface LigneAmortissement {
    year: number;
    calendarYear: number;
    age: number;
    Solde: number;
    ValeuréPropriété: number;
    Équité: number;
    IntérêtsCumul: number;
    PrincipalCumul: number;
    PartInteretAnnuelle: number;
    PartPrincipalAnnuelle: number;
    TauxEnVigueur: string;
    RenosCumul: number;
}

export interface ResultatAmortissement {
    data: LigneAmortissement[];
    totalInterest: number;
    finalValue: number;
}

export const construireAmortissement = (p: ParamsAmortissement): ResultatAmortissement => {
    const { totalMortgage, rate, renewalRate, monthlyMortgage, amortization, price,
        propertyGrowthRate, initialRenovations, maxValue, targetDate, yearlyRenovations } = p;
    const data: LigneAmortissement[] = [];
    let balance = totalMortgage;
    let totalInterestPaid = 0;
    let totalPrincipalPaid = 0;
    let currentMonthlyPayment = monthlyMortgage;
    let currentRate = rate / 100 / 12;
    let propertyValue = price + initialRenovations;
    const purchaseYear = new Date(targetDate || new Date()).getFullYear();

    for (let year = 1; year <= amortization; year++) {
        let yearInterest = 0;
        let yearPrincipal = 0;
        if (year > 1 && (year - 1) % 5 === 0) {
            currentRate = renewalRate / 100 / 12;
            const remainingMonths = (amortization - year + 1) * 12;
            if (currentRate > 0)
                currentMonthlyPayment = (currentRate * balance * Math.pow(1 + currentRate, remainingMonths)) / (Math.pow(1 + currentRate, remainingMonths) - 1);
        }
        for (let m = 0; m < 12; m++) {
            if (balance <= 0) break;
            const interest = balance * currentRate;
            const principal = currentMonthlyPayment - interest;
            balance -= principal;
            yearInterest += interest;
            yearPrincipal += principal;
        }
        totalInterestPaid += yearInterest;
        totalPrincipalPaid += yearPrincipal;
        const rawValue = propertyValue * (1 + (propertyGrowthRate / 100));
        propertyValue = (maxValue > 0 && rawValue > maxValue) ? maxValue : rawValue;
        const calendarYear = purchaseYear + year;
        data.push({
            year,
            calendarYear,
            age: year,
            Solde: Math.max(0, Math.round(balance)),
            ValeuréPropriété: Math.round(propertyValue),
            Équité: Math.max(0, Math.round(propertyValue - Math.max(0, balance))),
            IntérêtsCumul: Math.round(totalInterestPaid),
            PrincipalCumul: Math.round(totalPrincipalPaid),
            PartInteretAnnuelle: Math.round(yearInterest),
            PartPrincipalAnnuelle: Math.round(yearPrincipal),
            TauxEnVigueur: (currentRate * 12 * 100).toFixed(1) + '%',
            RenosCumul: Math.round(yearlyRenovations * year),
        });
    }
    return { data, totalInterest: totalInterestPaid, finalValue: propertyValue };
};

export interface ParamsComparaisonScenarios {
    amortization: number;
    totalCashNeeded: number;
    /** Loyer mensuel de départ du scénario « Louer » (croît de 3 %/an dans la boucle, tel quel). */
    currentRent: number;
    netMonthlyCost: number;
    maintenanceMonthly: number;
    /** Rendement boursier du scénario « Louer + Investir », en % annuel. */
    marketReturn: number;
    price: number;
    localRentalAppreciation: number;
    localStockReturn: number;
    netAnnualIncome: number;
    amortissement: LigneAmortissement[];
}

// Alias de TYPE (pas une interface) : `ChartDataTable` attend `Record<string, unknown>[]`, et
// seuls les alias reçoivent l'index implicite de TypeScript — une interface serait refusée.
export type LigneScenario = {
    year: number;
    'Acheter (Résidence)': number;
    'Louer + Investir Reste': number;
    'Investissement Locatif (Équité+Loyer)': number;
    'Bourse (Placer Cash Initial)': number;
    'Valeur Propriété': number;
};

export const construireComparaisonScenarios = (p: ParamsComparaisonScenarios): LigneScenario[] => {
    const { amortization, totalCashNeeded, currentRent, netMonthlyCost, maintenanceMonthly,
        marketReturn, price, localRentalAppreciation, localStockReturn, netAnnualIncome,
        amortissement } = p;
    return Array.from({ length: amortization }, (_, i) => {
        const yr = i + 1;
        let rentScenarioNetWorth = totalCashNeeded;
        let currentRentCost = currentRent;
        for (let y = 1; y <= yr; y++) {
            const rentAnnualCost = currentRentCost * 12;
            const buyAnnualCost = netMonthlyCost * 12 + maintenanceMonthly * 12;
            const differenceToInvest = (buyAnnualCost - rentAnnualCost);
            rentScenarioNetWorth *= (1 + marketReturn / 100);
            if (differenceToInvest > 0) rentScenarioNetWorth += differenceToInvest;
            currentRentCost *= 1.03;
        }
        const buyPrimaryNetWorth = amortissement[i]?.Équité || 0;
        const propValue = price * Math.pow(1 + localRentalAppreciation / 100, yr);
        const equity = amortissement[i]?.Équité || 0;
        const cumulativeRentalIncome = netAnnualIncome * yr;
        const stockInvestment = totalCashNeeded * Math.pow(1 + localStockReturn / 100, yr);
        return {
            year: yr,
            'Acheter (Résidence)': Math.round(buyPrimaryNetWorth),
            'Louer + Investir Reste': Math.round(rentScenarioNetWorth),
            'Investissement Locatif (Équité+Loyer)': Math.round(equity + cumulativeRentalIncome),
            'Bourse (Placer Cash Initial)': Math.round(stockInvestment),
            'Valeur Propriété': Math.round(propValue),
        };
    });
};
