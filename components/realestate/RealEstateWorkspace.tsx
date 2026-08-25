import React, { useState, useMemo, useEffect } from 'react';
import { CHART_TOOLTIP_STYLE } from '../../utils/chartTooltip';
import { formatCAD } from '../../utils/format';
import { Card } from '../ui/Card';
import { ProjectionRequired } from '../ui/ProjectionRequired';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useTimeChartZoom } from '../../hooks/useTimeChartZoom';
import { ZoomContainer } from '../ui/ZoomContainer';
import { ChartDataTable, type ChartDataColumn } from '../ui/ChartDataTable';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';
import { RealEstateGoal, Tab as TabEnum } from '../../types';
import { INITIAL_REAL_ESTATE_GOAL, TAB_LABELS } from '../../constants';
import { VieCurveLink } from '../vie/VieCurveLink';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Modal } from '../ui/Modal';
import { PropertyConfigurator } from './PropertyConfigurator';
import { MultiPropertyComparison } from './MultiPropertyComparison';
import { RealEstateAdviceCard } from './RealEstateAdviceCard';
import { calculateWelcomeTax } from '../../services/realEstate';
import { presentEquityOfGoal, monthsSince } from '../../services/projection/pastPurchaseInit';
import { firstDayOfCurrentMonthIso } from '../../services/realEstatePartition';
import { useFinanceStore } from '../../store/useFinanceStore';
import { PageHeader } from '../ui/PageHeader';
import { Icon } from '../ui/Icon';
import { KPIStat } from '../ui/KPIStat';
import { StatGrid } from '../ui/StatGrid';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { PrivateAmount } from '../ui/PrivateAmount';

/**
 * [REFONTE-NAV-L3] Atelier immobilier PARTAGÉ entre les deux vues du split :
 *  - variant « actuel » → page Immobilier (Config) : les biens détenus (photo d'aujourd'hui) ;
 *  - variant « projet » → page Projets immo (Vie) : les achats futurs (plans).
 *
 * C'est l'ex-corps de RealEstate.tsx, extrait tel quel : MÊME tranche de store
 * (`realEstateGoals`, jamais partitionnée côté données), la vue ne reçoit qu'un
 * SOUS-ENSEMBLE à afficher (`visibleGoals`) mais toute écriture repasse par la
 * liste COMPLÈTE (`allGoals`) pour ne jamais perdre l'autre moitié.
 */
// [REFONTE-NAV-L4] Idiome de sous-titre de la famille « Vie » (ce que je PRÉVOIS) : chaque page
// annonce son rôle vis-à-vis de la courbe Future. UNIQUEMENT la variante « projet » — la variante
// « actuel » vit dans Configurations (ce que je POSSÈDE) et garde son sous-titre de photo.
const PROJET_VIE_IDIOM = "Chaque projet d'achat déforme ta courbe Future";

export interface RealEstateWorkspaceProps {
    variant: 'actuel' | 'projet';
    availableCash: number;
    /** Tranche complète du store — SEULE base des écritures (setAllGoals). */
    allGoals: RealEstateGoal[];
    /** Sous-ensemble affiché par cette vue (partition par `partitionRealEstateGoals`). */
    visibleGoals: RealEstateGoal[];
    setAllGoals: (g: RealEstateGoal[]) => void;
}

export const RealEstateWorkspace: React.FC<RealEstateWorkspaceProps> = ({
    variant, availableCash, allGoals, visibleGoals, setAllGoals,
}) => {
    const isActuel = variant === 'actuel';

    // Selection state
    const [activeGoalId, setActiveGoalId] = useState<string>(visibleGoals[0]?.id || '');

    const activeGoal = useMemo(() =>
        visibleGoals.find(g => g.id === activeGoalId) || visibleGoals[0] || INITIAL_REAL_ESTATE_GOAL
        , [visibleGoals, activeGoalId]);

    // [REFONTE-NAV-L3] Si le bien sélectionné QUITTE la vue (ex. sa date d'achat éditée
    // bascule passé↔futur, il migre vers l'autre page), on retombe sur le premier visible.
    useEffect(() => {
        if (visibleGoals.length > 0 && !visibleGoals.some(g => g.id === activeGoalId)) {
            setActiveGoalId(visibleGoals[0].id);
        }
    }, [visibleGoals, activeGoalId]);

    const updateActiveGoal = (updates: Partial<RealEstateGoal>) => {
        setAllGoals(allGoals.map(g => g.id === activeGoal.id ? { ...g, ...updates } : g));
    };

    // [ENG-PAST-OWNED-VS-PLANNED] (décision Marc A6) : un objectif ACTIF dont la date planifiée
    // est PASSÉE sans que l'achat soit tranché (isOwned indéfini — legacy ou projet rattrapé par
    // le calendrier) déclenche LA question. Répondre écrit le champ ; « Pas encore » retire le
    // bien du m0 (badge « Date passée — non acheté » + contrôle du formulaire pour corriger).
    // Fermer sans répondre = « plus tard » pour CE bien et CETTE session d'écran (pas persisté).
    //
    // Trois bornes délibérées (revue #684) :
    //  - file figée à l'OUVERTURE de l'écran (instantané d'ids) : la question ne s'invite JAMAIS
    //    en pleine saisie — éditer une date vers le passé ne vole pas le focus (WCAG 3.2.2), la
    //    checkbox du formulaire, visible dès que la date est passée, couvre l'édition en direct ;
    //  - rejet PAR BIEN (Set), pas global : fermer saute CE bien, le suivant en attente est
    //    questionné — une fermeture accidentelle n'avale plus tout le lot en silence ;
    //  - biens VISIBLES sur CETTE page seulement : la question se pose dans le contexte où le
    //    bien s'affiche (et le popup ne fuit pas dans les tests/pages de l'autre moitié).
    const firstDayOfCurrentMonth = useMemo(() => firstDayOfCurrentMonthIso(), []);
    const [pendingOwnedIds, setPendingOwnedIds] = useState<ReadonlySet<string>>(() =>
        new Set(visibleGoals
            .filter(g => g.isActive && g.isOwned === undefined && g.purchaseDate
                && g.purchaseDate < firstDayOfCurrentMonthIso())
            .map(g => g.id)));
    const pendingOwnedGoal = useMemo(() =>
        visibleGoals.find(g => pendingOwnedIds.has(g.id) && g.isOwned === undefined) ?? null,
        [visibleGoals, pendingOwnedIds]);
    const dismissOwnedQuestion = (goalId: string) => {
        setPendingOwnedIds(prev => {
            const next = new Set(prev);
            next.delete(goalId);
            return next;
        });
    };
    const answerOwned = (goalId: string, owned: boolean) => {
        setAllGoals(allGoals.map(g => g.id === goalId ? { ...g, isOwned: owned } : g));
    };

    const addNewGoal = () => {
        const newId = `prop_${Date.now()}`;
        // La nouvelle entrée DOIT atterrir dans la vue courante (sinon elle « disparaît »
        // instantanément vers l'autre page) — et surtout dans la zone où sa propre
        // classification est VRAIE pour le MOTEUR, pas seulement pour l'UI :
        //  - « actuel » = 1er jour du mois PRÉCÉDENT. Le mois COURANT est l'angle mort :
        //    `getMonthOffset === 0` ⇒ `purchaseOffset < 0` faux ⇒ le moteur n'achète PAS le bien
        //    (ou pire, re-débite mise de fonds + taxe de bienvenue au mois 0 si le cash suffit),
        //    alors que la page affichait déjà son équité. Le mois précédent satisfait à la fois
        //    `isOwnedToday` et la convention STRICTE du moteur.
        //  - « projet » = dans 1 an (inchangé, franchement futur).
        // `new Date(y, m - 1, 1)` : construction par composants (jamais `setMonth(-1)` sur le
        // jour courant — un 31 déborderait sur le mois suivant) et date LOCALE formatée à la main
        // (`toISOString` bascule en UTC → peut reculer d'un jour, donc d'un mois le 1er).
        const now = new Date();
        const iso = (d: Date) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const purchaseDate = isActuel
            ? iso(new Date(now.getFullYear(), now.getMonth() - 1, 1))
            : iso(new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()));
        const newGoal: RealEstateGoal = {
            ...INITIAL_REAL_ESTATE_GOAL,
            id: newId,
            // [ENG-PAST-OWNED-VS-PLANNED] un bien créé depuis la page « Actuel » est par
            // définition DÉTENU — le champ est posé explicitement (jamais deviné d'une date).
            ...(isActuel ? { isOwned: true } : {}),
            isActive: false,
            isPrimaryResidence: false,
            price: 400000,
            downPayment: 80000,
            purchaseDate,
        };
        setAllGoals([...allGoals, newGoal]);
        setActiveGoalId(newId);
    };

    const deleteGoal = (id: string) => {
        if (allGoals.length <= 1) return;
        setConfirmDeleteGoalId(id);
    };

    const doConfirmDeleteGoal = () => {
        if (!confirmDeleteGoalId) return;
        setAllGoals(allGoals.filter(g => g.id !== confirmDeleteGoalId));
        if (activeGoalId === confirmDeleteGoalId) {
            const remaining = visibleGoals.filter(g => g.id !== confirmDeleteGoalId);
            setActiveGoalId(remaining[0]?.id || '');
        }
        setConfirmDeleteGoalId(null);
    };

    const [confirmDeleteGoalId, setConfirmDeleteGoalId] = useState<string | null>(null);

    // Mode Switch
    const [mode, setMode] = useState<'AUTO' | 'MANUAL'>('MANUAL');

    const price = activeGoal.price || 450000;
    const downPayment = activeGoal.downPayment || (price * 0.2);
    const rate = activeGoal.mortgageRate || 4.5;
    const amortization = activeGoal.amortization || 25;
    const targetDate = activeGoal.purchaseDate || new Date().toISOString().split('T')[0];
    const propertyGrowthRate = activeGoal.propertyGrowthRate || 3.0;
    const rentalIncomeMonthly = activeGoal.rentalIncomeMonthly || 0;
    const initialRenovations = activeGoal.initialRenovations || 0;
    const yearlyRenovations = activeGoal.yearlyRenovations || 0;
    const renewalRate = activeGoal.renewalRateProjection || 5.0;
    const maxValue = activeGoal.maxValue || 0;
    const propertyName = activeGoal.name || (activeGoal.isPrimaryResidence ? 'Résidence Principale' : 'Investissement');

    const [taxesYearly, setTaxesYearly] = useState(activeGoal.taxesYearly ?? 3000);
    const [heatingMonthly, setHeatingMonthly] = useState(activeGoal.heatingMonthly ?? 150);
    const [condoFees, setCondoFees] = useState(activeGoal.condoFees ?? 0);

    // Sync from store when switching between properties
    useEffect(() => {
        setTaxesYearly(activeGoal.taxesYearly ?? 3000);
        setHeatingMonthly(activeGoal.heatingMonthly ?? 150);
        setCondoFees(activeGoal.condoFees ?? 0);
    // activeGoal.taxesYearly/heatingMonthly/condoFees omis volontairement : seul activeGoalId
    // doit déclencher la réinitialisation des sliders locaux (pas les changements en cours de saisie).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeGoalId]);

    // AUTO: compute from price and persist to store
    useEffect(() => {
        if (mode === 'AUTO') {
            const t = Math.round(price * 0.01);
            const h = Math.round(80 + (price / 10000) * 1.5);
            setTaxesYearly(t);
            setHeatingMonthly(h);
            setCondoFees(0);
            setAllGoals(allGoals.map(g => g.id === activeGoal.id ? { ...g, taxesYearly: t, heatingMonthly: h, condoFees: 0 } : g));
        }
    // allGoals, setAllGoals et activeGoal.id omis volontairement : seuls price et mode
    // doivent déclencher ce recalcul ; ajouter allGoals provoquerait des boucles d'update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [price, mode]);

    const [currentRent, setCurrentRent] = useState(1600);
    // Phase F.7 — coût d'opportunité dynamique : le rendement boursier hérite
    // de l'hypothèse globale de croissance des actions (projection.returnRate).
    // L'utilisateur peut toujours override localement via le slider.
    const globalReturnRate = useFinanceStore(s => s.projection?.returnRate);
    const [marketReturn, setMarketReturn] = useState(globalReturnRate ?? 7);
    const [marketReturnOverridden, setMarketReturnOverridden] = useState(false);
    // Sync automatique tant que l'utilisateur n'a pas explicitement override
    React.useEffect(() => {
        if (!marketReturnOverridden && globalReturnRate !== undefined && globalReturnRate !== marketReturn) {
            setMarketReturn(globalReturnRate);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [globalReturnRate]);
    const [localRentalAppreciation, setLocalRentalAppreciation] = useState(propertyGrowthRate);
    const [localStockReturn, setLocalStockReturn] = useState(marketReturn);

    const totalMortgage = price - downPayment;
    // FISC-WELCOME-UNIFY : source UNIQUE partagée avec le moteur (helpers.ts:welcomeTax délègue à
    // calculateWelcomeTax). La municipalité du bien sélectionne le barème (Montréal jusqu'à 4% vs reste
    // du QC max 2%). Non choisie ⇒ repli conservateur Montréal (l'UI invite à choisir).
    const welcomeTax = calculateWelcomeTax(price, activeGoal.municipality);

    const notaryFees = 1500;
    const inspectionFees = 800;
    const totalCashNeeded = downPayment + welcomeTax + notaryFees + inspectionFees + initialRenovations;

    const monthlyRate = rate / 100 / 12;
    const numberOfPayments = amortization * 12;
    // Facteur d'amortissement calculé une seule fois (évitait 2 Math.pow par render).
    const mortgagePowFactor = monthlyRate > 0 ? Math.pow(1 + monthlyRate, numberOfPayments) : 0;
    const monthlyMortgage = monthlyRate > 0
        ? (monthlyRate * totalMortgage * mortgagePowFactor) / (mortgagePowFactor - 1)
        : totalMortgage / numberOfPayments;

    const amortizationData = useMemo(() => {
        const data = [];
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
    }, [totalMortgage, rate, renewalRate, monthlyMortgage, amortization, price, propertyGrowthRate, initialRenovations, maxValue, targetDate, yearlyRenovations]);

    const monthlyTaxes = taxesYearly / 12;
    const totalMonthlyCost = monthlyMortgage + monthlyTaxes + heatingMonthly + condoFees;
    const netMonthlyCost = Math.max(0, totalMonthlyCost - rentalIncomeMonthly);
    const maintenanceMonthly = (price * 0.01) / 12;
    const initialInterest = totalMortgage * monthlyRate;
    const unrecoverableMonthly = Math.max(0, initialInterest + monthlyTaxes + heatingMonthly + condoFees + maintenanceMonthly - rentalIncomeMonthly);

    const formatCurrency = (val: number) => formatCAD(val);

    // [REFONTE-NAV-L3] Équité PRÉSENTE (vue « actuel ») — source unique presentEquityOfGoal,
    // MÊME convention que le moteur et le KPI patrimoine (jamais de formule locale).
    //
    // ⚠️ No-fake-data : `presentEquityOfGoal` retourne 0 pour un bien INACTIF (il est exclu du
    // patrimoine simulé). Sommer sur TOUS les biens visibles faisait donc afficher
    // « 1 bien détenu · Équité présente 0 $ » sur une maison payée mise en inactif — un 0 $
    // crédible qui sous-déclare en silence. On n'agrège plus que les biens ACTIFS, et on le DIT.
    const activeVisibleGoals = useMemo(
        () => (isActuel ? visibleGoals.filter(g => g.isActive) : []),
        [isActuel, visibleGoals],
    );
    const presentEquityTotal = useMemo(() => (
        activeVisibleGoals.reduce((sum, g) => sum + presentEquityOfGoal(g, monthsSince(g.purchaseDate)), 0)
    ), [activeVisibleGoals]);
    const activePresentEquity = isActuel
        ? presentEquityOfGoal(activeGoal, monthsSince(activeGoal.purchaseDate))
        : 0;

    // Wiring 2026-05: équité immo projetée par le moteur principal au terme de
    // l'amortissement, à comparer avec le calcul local de la card Buy vs Rent.
    const lastProjection = useFinanceStore(s => s.lastProjection);
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);
    const projectedEquityAtAmortEnd = useMemo(() => {
        if (!lastProjection?.chartData?.length) return null;
        const targetMonth = amortization * 12;
        const point = lastProjection.chartData.find(p => p.monthIndex === targetMonth)
            ?? lastProjection.chartData[Math.min(targetMonth, lastProjection.chartData.length - 1)];
        return point?.Immobilier ?? null;
    }, [lastProjection, amortization]);

    // G7b — calcul Acheter-vs-Louer remonté au niveau composant (il vivait dans
    // une IIFE de rendu) pour pouvoir brancher le zoom molette/pan sur la courbe.
    const monthlyRental = rentalIncomeMonthly || Math.round(price / 23.3 / 12);
    const annualExpenses = monthlyTaxes * 12 + heatingMonthly * 12 + condoFees * 12 + (price * 0.01);
    const netAnnualIncome = (monthlyRental * 12) - annualExpenses - (amortizationData.data[0]?.PartInteretAnnuelle || 0);
    const netYield = (netAnnualIncome / price) * 100;
    const combinedData = useMemo(() => Array.from({ length: amortization }, (_, i) => {
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
        const buyPrimaryNetWorth = amortizationData.data[i]?.Équité || 0;
        const propValue = price * Math.pow(1 + localRentalAppreciation / 100, yr);
        const equity = amortizationData.data[i]?.Équité || 0;
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
    }), [amortization, totalCashNeeded, currentRent, netMonthlyCost, maintenanceMonthly, marketReturn, price, localRentalAppreciation, localStockReturn, netAnnualIncome, amortizationData.data]);
    const zoom = useTimeChartZoom<{
        year: number;
        'Acheter (Résidence)': number;
        'Louer + Investir Reste': number;
        'Investissement Locatif (Équité+Loyer)': number;
        'Bourse (Placer Cash Initial)': number;
        'Valeur Propriété': number;
    }>(combinedData);

    // [A11Y-CHARTS] table de données sr-only pour le graphe « Scénarios comparatifs » (Recharts opaque
    // aux lecteurs d'écran). Colonnes $ masquées en mode privé (parité avec PrivateAmount/blur) ; l'axe X
    // (année) reste visible. Mêmes séries que l'AreaChart ; le graphe n'affiche que les scénarios pertinents
    // selon le type de propriété, mais la table les liste tous (lecture exhaustive = signal plus riche au SR).
    const isPrivacyMode = useFinanceStore(s => s.isPrivacyMode);
    const money = (v: unknown) => isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(Number(v) || 0);
    const scenariosColumns: ChartDataColumn[] = [
        { key: 'year', label: 'Année', format: (v) => `An ${v}` },
        { key: 'Acheter (Résidence)', label: 'Acheter (Résidence)', format: money },
        { key: 'Louer + Investir Reste', label: 'Louer + Investir Reste', format: money },
        { key: 'Investissement Locatif (Équité+Loyer)', label: 'Investissement Locatif (Équité+Loyer)', format: money },
        { key: 'Bourse (Placer Cash Initial)', label: 'Bourse (Placer Cash Initial)', format: money },
        { key: 'Valeur Propriété', label: 'Valeur Propriété', format: money },
    ];

    // [REFONTE-NAV-L3] Vocabulaire et en-tête par variante.
    // [REFONTE-NAV-L4] Titre = TAB_LABELS (source unique des libellés d'onglets), comme les
    // trois autres pages « Vie ». Les deux libellés en dur ici les répliquaient à la main.
    const pageTitle = isActuel ? TAB_LABELS[TabEnum.REAL_ESTATE] : TAB_LABELS[TabEnum.REAL_ESTATE_PROJECTS];
    const pageIcon = isActuel ? 'real-estate' as const : 'building' as const;
    const entityWord = isActuel ? 'bien' : 'projet';
    const countVisible = visibleGoals.length;
    const plural = countVisible > 1 ? 's' : '';
    // Équité affichée = somme des biens ACTIFS uniquement (cf. bloc `activeVisibleGoals`).
    // Aucun bien actif → « — » honnête plutôt qu'un « 0 $ » qui se lit comme un patrimoine nul.
    // Mélange actif/inactif → on annonce le dénominateur réel de la somme.
    const activeCount = activeVisibleGoals.length;
    const equityPart = activeCount === 0
        ? 'Équité présente — (aucun bien actif dans la simulation)'
        : activeCount < countVisible
            ? `Équité présente ${formatCurrency(presentEquityTotal)} (${activeCount} bien${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''} sur ${countVisible})`
            : `Équité présente ${formatCurrency(presentEquityTotal)}`;
    const pageSubtitle = isActuel
        ? `${countVisible} ${entityWord}${plural} détenu${plural} · ${equityPart}`
        : `${PROJET_VIE_IDIOM} · ${countVisible} ${entityWord}${plural} d'achat · Mensualité nette ${formatCurrency(netMonthlyCost)}`;
    const otherCount = allGoals.length - visibleGoals.length;
    const crossLink = otherCount > 0 && (
        <button
            type="button"
            onClick={() => navigateWithFocus(isActuel ? TabEnum.REAL_ESTATE_PROJECTS : TabEnum.REAL_ESTATE)}
            className="text-meta text-ink-400 hover:text-ink-200 underline underline-offset-2 transition-colors focus-ring rounded"
        >
            {isActuel
                ? `${otherCount} projet${otherCount > 1 ? 's' : ''} d'achat futur${otherCount > 1 ? 's' : ''} → Vie · Projets immo`
                : `${otherCount} bien${otherCount > 1 ? 's' : ''} détenu${otherCount > 1 ? 's' : ''} → Configurations · Immobilier`}
        </button>
    );

    // [REFONTE-NAV-L3] Vue vide HONNÊTE (pas d'éditeur sur le goal placeholder) : rien à montrer
    // dans CETTE moitié du split — on propose d'ajouter, et on pointe vers l'autre page si le
    // reste de la tranche vit là-bas.
    if (countVisible === 0) {
        return (
            <div className="space-y-6 stagger-in pb-10">
                <PageHeader
                    icon={<Icon name={pageIcon} size={28} />}
                    title={pageTitle}
                    subtitle={isActuel
                        ? 'Aucun bien détenu pour l\'instant'
                        : `${PROJET_VIE_IDIOM} · aucun projet d'achat pour l'instant`}
                    actions={isActuel ? undefined : <VieCurveLink />}
                />
                <Card>
                    <div className="py-8 text-center space-y-4">
                        <p className="text-body text-ink-300">
                            {isActuel
                                ? 'Tu ne possèdes aucun bien immobilier pour l\'instant (photo d\'aujourd\'hui).'
                                : 'Aucun projet d\'achat futur pour l\'instant (les plans qui déforment la courbe).'}
                        </p>
                        <Button onClick={addNewGoal} variant="primary" size="md">
                            {isActuel ? '+ Ajouter un bien détenu' : '+ Ajouter un projet d\'achat'}
                        </Button>
                        {crossLink && <div>{crossLink}</div>}
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6 stagger-in pb-10">
            <ConfirmModal
                isOpen={!!confirmDeleteGoalId}
                onConfirm={doConfirmDeleteGoal}
                onCancel={() => setConfirmDeleteGoalId(null)}
                title="Supprimer la propriété"
                message="Supprimer ce scénario immobilier définitivement ?"
                confirmLabel="Supprimer"
            />
            {pendingOwnedGoal && (
                // [ENG-PAST-OWNED-VS-PLANNED] Modal nu (PAS ConfirmModal : son onClose == onCancel,
                // une fermeture accidentelle écrirait « pas acheté » et retirerait le bien du m0).
                // Trois issues : Oui / Pas encore / fermer = décider plus tard (rien n'est écrit,
                // la question reviendra).
                <Modal
                    isOpen
                    onClose={() => dismissOwnedQuestion(pendingOwnedGoal.id)}
                    title="Date d'achat passée"
                    size="sm"
                    footer={
                        <>
                            <Button onClick={() => answerOwned(pendingOwnedGoal.id, false)} variant="ghost" size="sm">Pas encore</Button>
                            <Button onClick={() => answerOwned(pendingOwnedGoal.id, true)} variant="primary" size="sm">Oui, acheté</Button>
                        </>
                    }
                >
                    <p className="text-body text-ink-300 leading-relaxed">
                        La date d'achat planifiée de « {pendingOwnedGoal.name || 'ce bien'} » ({pendingOwnedGoal.purchaseDate}) est passée.
                        As-tu acheté ce bien ? « Pas encore » le retire de la simulation au mois 0 (badge visible, réversible dans le formulaire).
                    </p>
                </Modal>
            )}
            <PageHeader
                icon={<Icon name={pageIcon} size={28} />}
                title={pageTitle}
                subtitle={pageSubtitle}
                badge={
                    <div className="flex items-center gap-2">
                        {activeGoal.isActive
                            ? <Badge variant="success" size="md">Active dans simulation</Badge>
                            // [UX-ISACTIVE-BADGE] (A5) : l'amputation du patrimoine doit être VISIBLE.
                            : <Badge variant="neutral" size="md">Non compté dans la simulation</Badge>}
                        {/* [ENG-PAST-OWNED-VS-PLANNED] (A6) : date passée sans achat confirmé. La
                            condition de DATE est requise : une date repoussée au futur rend le
                            « Pas encore » caduc (le moteur achètera normalement) — sans elle, le
                            badge d'avertissement resterait affiché à jamais (revue #684). */}
                        {activeGoal.isOwned === false && !!activeGoal.purchaseDate
                            && activeGoal.purchaseDate < firstDayOfCurrentMonth && (
                            <Badge variant="warning" size="md">Date passée — non acheté</Badge>
                        )}
                    </div>
                }
                actions={
                    <>
                        {/* [REFONTE-NAV-L4] affordance commune des pages « Vie » — variante « projet »
                            seulement (la page Immobilier de Configurations n'est pas une page Vie). */}
                        {!isActuel && <VieCurveLink />}
                        <Button
                            onClick={() => updateActiveGoal({ isActive: !activeGoal.isActive })}
                            variant={activeGoal.isActive ? 'danger' : 'primary'}
                            size="md"
                        >
                            {activeGoal.isActive ? 'Désactiver' : 'Activer dans Simulation'}
                        </Button>
                    </>
                }
            />

            {/* Multi-Property Tabs */}
            <div className="flex flex-wrap items-center gap-2">
                {visibleGoals.map((g, idx) => {
                    const isActive = activeGoalId === g.id;
                    return (
                        <button
                            key={g.id}
                            onClick={() => setActiveGoalId(g.id)}
                            className={`px-4 py-2 rounded-pill border transition-all flex items-center gap-2 text-meta font-bold focus-ring ${
                                isActive
                                    ? 'bg-info-bg border-info-500 text-info-400'
                                    : 'bg-white/5 border-white/10 text-ink-300 hover:bg-white/10'
                            }`}
                        >
                            <span className="inline-flex items-center gap-1.5"><Icon name="real-estate" size={14} />{g.name || (g.isPrimaryResidence ? 'Résidence' : `Propriété ${idx + 1}`)}</span>
                            {g.isActive && <span className="w-2 h-2 rounded-full bg-success-500 animate-pulse" aria-label="active" />}
                            {allGoals.length > 1 && (
                                <span
                                    onClick={(e) => { e.stopPropagation(); deleteGoal(g.id); }}
                                    className="ml-2 text-ink-400 hover:text-danger-400 cursor-pointer"
                                    role="button"
                                    aria-label={`Supprimer ${g.name}`}
                                >
                                    <Icon name="close" size={13} />
                                </span>
                            )}
                        </button>
                    );
                })}
                <button
                    onClick={addNewGoal}
                    className="px-4 py-2 rounded-pill bg-white/5 border border-dashed border-white/20 text-ink-300 hover:bg-white/10 text-meta font-bold focus-ring"
                >
                    {isActuel ? '+ Ajouter un bien' : '+ Ajouter un projet'}
                </button>
            </div>
            {crossLink && <div>{crossLink}</div>}

            {/* Property name editor */}
            <div className="flex items-center gap-3">
                <span className="text-h1 text-ink-50 inline-flex items-center gap-2"><Icon name="building" size={20} className="text-ink-400" />{propertyName}</span>
                <input
                    type="text"
                    value={propertyName}
                    onChange={e => updateActiveGoal({ name: e.target.value })}
                    placeholder="Renommer..."
                    className="bg-transparent border-b border-white/20 text-ink-300 text-meta focus:outline-none focus:border-info-400 w-48 pb-0.5 transition-colors"
                    aria-label="Nom de la propriété"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <PropertyConfigurator
                    activeGoal={activeGoal}
                    updateActiveGoal={updateActiveGoal}
                    mode={mode}
                    setMode={setMode}
                    taxesYearly={taxesYearly}
                    setTaxesYearly={setTaxesYearly}
                    heatingMonthly={heatingMonthly}
                    setHeatingMonthly={setHeatingMonthly}
                    condoFees={condoFees}
                    setCondoFees={setCondoFees}
                />

                {/* ANALYSIS DASHBOARD */}
                <div className="lg:col-span-3 space-y-5">
                    <StatGrid cols={4} gap="sm">
                        {isActuel ? (
                            /* [REFONTE-NAV-L3] Bien détenu : le « cash nécessaire à l'achat » n'a plus de
                               sens — on montre l'équité PRÉSENTE (source unique presentEquityOfGoal). */
                            <KPIStat
                                label="Équité présente"
                                icon={<Icon name="cash" size={16} />}
                                /* No-fake-data : `presentEquityOfGoal` rend 0 pour un bien inactif — afficher
                                   « 0 $ » ferait croire à une équité nulle. « — » est la valeur honnête. */
                                value={activeGoal.isActive ? formatCurrency(activePresentEquity) : '—'}
                                sublabel={activeGoal.isActive ? 'Valeur actuelle − hypothèque' : 'Bien inactif — exclu du patrimoine'}
                                privacy
                                variant={!activeGoal.isActive ? 'info' : activePresentEquity >= 0 ? 'success' : 'danger'}
                            />
                        ) : (
                            <KPIStat
                                label="Cash nécessaire"
                                icon={<Icon name="cash" size={16} />}
                                value={formatCurrency(totalCashNeeded)}
                                sublabel={availableCash >= totalCashNeeded ? 'Disponible' : `Manque ${formatCurrency(totalCashNeeded - availableCash)}`}
                                privacy
                                variant={availableCash >= totalCashNeeded ? 'success' : 'danger'}
                            />
                        )}
                        <KPIStat
                            label="Prêt Initial"
                            icon={<Icon name="bank" size={16} />}
                            value={formatCurrency(totalMortgage)}
                            sublabel={`Ratio Prêt/Valeur: ${Math.round((totalMortgage / price) * 100)}%`}
                            privacy
                            variant="info"
                        />
                        <KPIStat
                            label="Perte Sèche (Mens.)"
                            icon={<Icon name="debt" size={16} />}
                            value={formatCurrency(unrecoverableMonthly)}
                            sublabel="Intérêts + taxes + entretien"
                            privacy
                            variant="danger"
                        />
                        <KPIStat
                            label="Valeur à terme"
                            icon={<Icon name="investments" size={16} />}
                            value={formatCurrency(amortizationData.finalValue)}
                            sublabel={`Dans ${amortization} ans`}
                            privacy
                            variant="success"
                        />
                    </StatGrid>

                    <Card icon={<Icon name="chart" size={18} />} title="Scénarios comparatifs" action={
                        projectedEquityAtAmortEnd !== null && projectedEquityAtAmortEnd > 0 ? (
                            <Badge
                                variant="info"
                                size="sm"
                                onClick={() => navigateWithFocus(TabEnum.FUTURE)}
                                title={`Équité immo projetée par FutureProjection à l'année ${amortization} — clic pour ouvrir`}
                            >
                                Projection: {formatCurrency(projectedEquityAtAmortEnd)}
                            </Badge>
                        ) : <ProjectionRequired variant="inline" feature="l'équité immo projetée" />
                    }>
                        {(() => {
                            return (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 p-4 bg-black/30 rounded-xl border border-white/5">
                                        <div>
                                            <label className="text-tiny text-purple-400 font-bold uppercase block mb-1">
                                                Loyer actuel (scénario Louer)
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    step="50"
                                                    value={currentRent}
                                                    onChange={e => setCurrentRent(Number(e.target.value))}
                                                    className="w-full bg-purple-500/10 border border-purple-500/30 rounded px-2 py-1.5 text-purple-300 text-body font-bold focus:outline-none focus:border-purple-400"
                                                />
                                                <span className="text-meta text-ink-400">$/m</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="flex justify-between text-tiny text-success-400 font-bold uppercase mb-1">
                                                <span className="flex items-center gap-1">
                                                    Rendement Boursier
                                                    {!marketReturnOverridden && globalReturnRate !== undefined && (
                                                        <span title="Synchronisé avec hypothèse globale (Futur)" className="inline-flex text-ink-400"><Icon name="link" size={12} /></span>
                                                    )}
                                                </span>
                                                <span className="flex items-center gap-2">
                                                    <span className="text-white">{marketReturn}%</span>
                                                    {marketReturnOverridden && globalReturnRate !== undefined && (
                                                        <button
                                                            type="button"
                                                            onClick={() => { setMarketReturnOverridden(false); setMarketReturn(globalReturnRate); setLocalStockReturn(globalReturnRate); }}
                                                            className="text-tiny text-info-400 hover:underline font-normal normal-case"
                                                            title={`Resynchroniser avec la projection globale (${globalReturnRate}%)`}
                                                        >
                                                            ↺ sync
                                                        </button>
                                                    )}
                                                </span>
                                            </label>
                                            <input
                                                type="range"
                                                aria-label="Rendement Boursier"
                                                min="3"
                                                max="15"
                                                step="0.5"
                                                value={marketReturn}
                                                onChange={e => {
                                                    setMarketReturn(Number(e.target.value));
                                                    setLocalStockReturn(Number(e.target.value));
                                                    setMarketReturnOverridden(true);
                                                }}
                                                className="w-full h-1.5 bg-dark rounded-lg appearance-none cursor-pointer accent-success-500 mt-2"
                                            />
                                            {!marketReturnOverridden && globalReturnRate !== undefined && (
                                                <p className="text-tiny text-info-400/70 italic mt-1">
                                                    Phase F.7 — coût d'opportunité hérité de Futur ({globalReturnRate}%). Bouge le slider pour override.
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            <label className="flex justify-between text-tiny text-pink-400 font-bold uppercase mb-1">
                                                <span>Appréciation Immo</span>
                                                <span className="text-white">{localRentalAppreciation}%</span>
                                            </label>
                                            <input
                                                type="range"
                                                aria-label="Appréciation Immo"
                                                min="0" max="10" step="0.5"
                                                value={localRentalAppreciation}
                                                onChange={e => setLocalRentalAppreciation(Number(e.target.value))}
                                                className="w-full h-1.5 bg-dark rounded-lg appearance-none cursor-pointer accent-pink-500 mt-2"
                                            />
                                        </div>
                                        <div className={`p-2 rounded-lg border flex flex-col justify-center ${netYield > 0 ? 'bg-green-900/20 border-green-500/20' : 'bg-red-900/20 border-danger-500/20'}`}>
                                            <div className="text-tiny uppercase font-bold text-ink-300">Si location (Cash-Flow)</div>
                                            <div className={`text-lg font-black ${netYield > 0 ? 'text-green-400' : 'text-danger-400'}`}>
                                                {formatCurrency(netAnnualIncome)}<span className="text-tiny font-normal text-ink-400">/an</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div role="img" aria-label="Graphique des scénarios comparatifs immobiliers (Acheter, Louer + Investir, Investissement locatif, Bourse) par année">
                                    <ZoomContainer zoom={zoom} className="h-[300px] w-full mt-2">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={zoom.visibleData}>
                                                <XAxis dataKey="year" tick={{ fontSize: 10 }} tickFormatter={v => `An ${v}`} />
                                                <YAxis hide />
                                                <Tooltip formatter={(v: number) => isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCurrency(v)} contentStyle={CHART_TOOLTIP_STYLE} />
                                                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11, fontWeight: 'bold' }} />

                                                {(activeGoal.isPrimaryResidence || !activeGoal.isRented) && (
                                                    <Area type="monotone" dataKey="Acheter (Résidence)" stroke="#4f9d86" fill="#4f9d86" fillOpacity={0.1} strokeWidth={3} />
                                                )}

                                                {(activeGoal.isPrimaryResidence || !activeGoal.isRented) && (
                                                    <Area type="monotone" dataKey="Louer + Investir Reste" stroke="#8a7cc0" fill="#8a7cc0" fillOpacity={0.1} strokeWidth={3} />
                                                )}

                                                {(!activeGoal.isPrimaryResidence && activeGoal.isRented) && (
                                                    <Area type="monotone" dataKey="Investissement Locatif (Équité+Loyer)" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.1} strokeWidth={3} />
                                                )}

                                                {(!activeGoal.isPrimaryResidence && activeGoal.isRented) && (
                                                    <Area type="monotone" dataKey="Bourse (Placer Cash Initial)" stroke="#c2974f" fill="#c2974f" fillOpacity={0.1} strokeWidth={3} />
                                                )}
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </ZoomContainer>
                                    </div>
                                    <ChartDataTable
                                        caption="Scénarios comparatifs immobiliers par année (équité ou patrimoine net selon le scénario)"
                                        columns={scenariosColumns}
                                        rows={combinedData}
                                    />
                                    <p className="text-tiny text-ink-400 mt-3 text-center">
                                        Note: Le graphique affiche automatiquement les scénarios pertinents (Habiter vs Louer) selon le type de propriété que vous avez configuré (Résidence Principale ou Propriété Locative).
                                    </p>
                                </>
                            );
                        })()}
                    </Card>

                    <Card title="Amortissement et Équité">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-2">
                            <div><div className="text-tiny text-ink-400 uppercase tracking-wider">Welcome Tax</div><div className="text-body font-bold text-white">{formatCurrency(welcomeTax)}</div></div>
                            <div><div className="text-tiny text-ink-400 uppercase tracking-wider">Notaire &amp; Insp.</div><div className="text-body font-bold text-white">{formatCurrency(notaryFees + inspectionFees)}</div></div>
                            <div><div className="text-tiny text-ink-400 uppercase tracking-wider">Rénos Initiales</div><div className="text-body font-bold text-white">{formatCurrency(initialRenovations)}</div></div>
                            <div><div className="text-tiny text-ink-400 uppercase tracking-wider">Maison Totale</div><div className="text-body font-bold text-white">{formatCurrency(price + initialRenovations)}</div></div>
                        </div>
                    </Card>

                    <Card icon={<Icon name="clipboard" size={18} />} title="Amortissement">
                        <div className="overflow-x-auto">
                            <div className="mb-3 flex flex-wrap gap-4 text-meta">
                                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-danger-500 inline-block" />Intérêts totaux payés : <PrivateAmount className="font-bold text-danger-400">{formatCurrency(amortizationData.totalInterest)}</PrivateAmount></div>
                                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-success-500 inline-block" />Gain Équité projeté : <PrivateAmount className="font-bold text-success-400">{formatCurrency((amortizationData.data[amortizationData.data.length - 1]?.Équité || 0) - downPayment)}</PrivateAmount></div>
                                {yearlyRenovations > 0 && <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" />Rénos totales : <PrivateAmount className="font-bold text-yellow-400">{formatCurrency(yearlyRenovations * amortization)}</PrivateAmount></div>}
                            </div>
                            <table className="w-full text-meta text-left min-w-[700px]">
                                <thead>
                                    <tr className="border-b border-white/10 text-ink-400 uppercase tracking-wider">
                                        <th className="py-2 pr-4">Année</th>
                                        <th className="py-2 pr-4">Taux</th>
                                        <th className="py-2 pr-4 text-right">Intérêts/an</th>
                                        <th className="py-2 pr-4 text-right">Principal/an</th>
                                        <th className="py-2 pr-4 text-right">Solde Restant</th>
                                        <th className="py-2 pr-4 text-right">Valeur Propriété</th>
                                        <th className="py-2 text-right">Équité</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {amortizationData.data.map((row, idx) => {
                                        const isRenewal = idx > 0 && idx % 5 === 0;
                                        const equityPct = row.ValeuréPropriété > 0 ? Math.round((row.Équité / row.ValeuréPropriété) * 100) : 0;
                                        return (
                                            <tr key={row.year} className={`border-b border-white/5 ${isRenewal ? 'bg-orange-900/10' : idx % 2 === 0 ? 'bg-white/[0.02]' : ''} hover:bg-white/5 transition-colors`}>
                                                <td className="py-2 pr-4 font-bold">
                                                    {row.calendarYear}
                                                    {isRenewal && <span className="ml-1.5 text-tiny text-orange-400 border border-orange-500/30 rounded px-1">Renouvellement</span>}
                                                </td>
                                                <td className="py-2 pr-4 text-orange-300">{row.TauxEnVigueur}</td>
                                                <td className="py-2 pr-4 text-right text-danger-400"><PrivateAmount>{formatCurrency(row.PartInteretAnnuelle)}</PrivateAmount></td>
                                                <td className="py-2 pr-4 text-right text-info-400"><PrivateAmount>{formatCurrency(row.PartPrincipalAnnuelle)}</PrivateAmount></td>
                                                <td className="py-2 pr-4 text-right text-white"><PrivateAmount>{formatCurrency(row.Solde)}</PrivateAmount></td>
                                                <td className="py-2 pr-4 text-right text-purple-300"><PrivateAmount>{formatCurrency(row.ValeuréPropriété)}</PrivateAmount></td>
                                                <td className="py-2 text-right">
                                                    <PrivateAmount className="text-success-400 font-bold">{formatCurrency(row.Équité)}</PrivateAmount>
                                                    <span className="text-ink-400 ml-1">({equityPct}%)</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            </div>

            <MultiPropertyComparison goals={visibleGoals} />

            {/* Phase F.8 — Conseils IA Immobilier poussés */}
            <RealEstateAdviceCard
                context={{
                    price,
                    downPayment,
                    mortgageRate: rate,
                    amortizationYears: amortization,
                    monthlyMortgagePayment: monthlyMortgage,
                    propertyTaxesAnnual: taxesYearly,
                    welcomeTax,
                    maintenanceAnnual: maintenanceMonthly * 12,
                    isPrimaryResidence: !!activeGoal.isPrimaryResidence,
                    isFirstTimeBuyer: !!activeGoal.isFirstTimeBuyer,
                    currentRent,
                    marketReturnExpected: marketReturn,
                    propertyAppreciationExpected: propertyGrowthRate,
                }}
            />

        </div>
    );
};
