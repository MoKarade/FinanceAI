import React, { useState, useMemo, useEffect } from 'react';
import { formatCAD } from '../../utils/format';
import { Card } from '../ui/Card';
import { RealEstateGoal, Tab as TabEnum } from '../../types';
import { INITIAL_REAL_ESTATE_GOAL, TAB_LABELS } from '../../constants';
import { VieCurveLink } from '../vie/VieCurveLink';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Modal } from '../ui/Modal';
import { PropertyConfigurator } from './PropertyConfigurator';
import { MultiPropertyComparison } from './MultiPropertyComparison';
import { RealEstateAdviceCard } from './RealEstateAdviceCard';
import { construireAmortissement, construireComparaisonScenarios } from './calculsImmoLocaux';
import { ScenariosComparatifsCard } from './ScenariosComparatifsCard';
import { AmortissementCards } from './AmortissementCards';
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
        // [DETTE-RE-SALE-PURGE] Purge des ventes liées, dans le MÊME geste confirmé.
        if (ventesLieesA(confirmDeleteGoalId).length > 0) {
            setAppState({ lifeEvents: (lifeEvents ?? []).filter(e => e.propertyId !== confirmDeleteGoalId) });
        }
        if (activeGoalId === confirmDeleteGoalId) {
            const remaining = visibleGoals.filter(g => g.id !== confirmDeleteGoalId);
            setActiveGoalId(remaining[0]?.id || '');
        }
        setConfirmDeleteGoalId(null);
    };

    const [confirmDeleteGoalId, setConfirmDeleteGoalId] = useState<string | null>(null);

    // [DETTE-RE-SALE-PURGE] Décision de Marc (2026-07-31) : supprimer un bien SUPPRIME aussi les
    // événements de VENTE qui le référencent (`LifeEvent.propertyId`). Sans ça, la vente planifiée
    // devenait un événement orphelin : le moteur la refuse déjà proprement (aucune vente d'un autre
    // bien — monthlyEvents.ts), mais l'utilisateur gardait un événement mort dans sa liste, et un
    // avertissement « vente ignorée » à chaque projection. Le compte est annoncé dans la
    // confirmation AVANT le geste : supprimer un bien + ses ventes est irréversible.
    const lifeEvents = useFinanceStore(s => s.lifeEvents);
    const setAppState = useFinanceStore(s => s.setAppState);
    const ventesLieesA = (goalId: string | null) =>
        goalId ? (lifeEvents ?? []).filter(e => e.propertyId === goalId) : [];

    // Mode Switch
    const [mode, setMode] = useState<'AUTO' | 'MANUAL'>('MANUAL');

    const price = activeGoal.price || 450000;
    const downPayment = activeGoal.downPayment || (price * 0.2);
    const rate = activeGoal.mortgageRate || 4.5;
    const amortization = activeGoal.amortization || 25;
    const targetDate = activeGoal.purchaseDate || new Date().toISOString().split('T')[0];
    const propertyGrowthRate = activeGoal.propertyGrowthRate ?? 3.0;
    const rentalIncomeMonthly = activeGoal.rentalIncomeMonthly || 0;
    const initialRenovations = activeGoal.initialRenovations || 0;
    const yearlyRenovations = activeGoal.yearlyRenovations || 0;
    // Défaut = taux ACTUEL (décision Marc 2026-09-04, aligné sur le moteur — `||` voulu : ≤ 0 = absence).
    const renewalRate = activeGoal.renewalRateProjection || (activeGoal.mortgageRate || 4.5);
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

    // [GODFILE-REALESTATE-CMP] Corps extrait tel quel vers calculsImmoLocaux.ts (lot 153) —
    // mêmes entrées, mêmes dépendances de memo.
    const amortizationData = useMemo(() => construireAmortissement({
        totalMortgage, rate, renewalRate, monthlyMortgage, amortization, price,
        propertyGrowthRate, initialRenovations, maxValue, targetDate, yearlyRenovations,
    }), [totalMortgage, rate, renewalRate, monthlyMortgage, amortization, price, propertyGrowthRate, initialRenovations, maxValue, targetDate, yearlyRenovations]);

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
    // [GODFILE-REALESTATE-CMP] Corps extrait tel quel vers calculsImmoLocaux.ts (lot 153).
    const combinedData = useMemo(() => construireComparaisonScenarios({
        amortization, totalCashNeeded, currentRent, netMonthlyCost, maintenanceMonthly,
        marketReturn, price, localRentalAppreciation, localStockReturn, netAnnualIncome,
        amortissement: amortizationData.data,
    }), [amortization, totalCashNeeded, currentRent, netMonthlyCost, maintenanceMonthly, marketReturn, price, localRentalAppreciation, localStockReturn, netAnnualIncome, amortizationData.data]);

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
    // [A11Y-PRIVACY-CHAINES-RESTANTES] Le sous-titre était UNE CHAÎNE portant l'équité et la
    // mensualité à l'intérieur : rien à masquer. C'est du JSX maintenant — le contexte (« 2 biens
    // détenus », « 1 actif sur 3 ») reste lisible, seuls les deux montants sont masquables.
    const equityPart: React.ReactNode = activeCount === 0
        ? 'Équité présente — (aucun bien actif dans la simulation)'
        : (
            <>
                Équité présente <PrivateAmount>{formatCurrency(presentEquityTotal)}</PrivateAmount>
                {activeCount < countVisible
                    && ` (${activeCount} bien${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''} sur ${countVisible})`}
            </>
        );
    const pageSubtitle: React.ReactNode = isActuel
        ? <>{countVisible} {entityWord}{plural} détenu{plural} · {equityPart}</>
        : (
            <>
                {PROJET_VIE_IDIOM} · {countVisible} {entityWord}{plural} d&apos;achat · Mensualité nette{' '}
                <PrivateAmount>{formatCurrency(netMonthlyCost)}</PrivateAmount>
            </>
        );
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
                message={(() => {
                    const n = ventesLieesA(confirmDeleteGoalId).length;
                    return n > 0
                        ? `Supprimer ce scénario immobilier définitivement ? ${n === 1 ? 'Un événement de vente planifié sur ce bien sera supprimé aussi.' : `${n} événements de vente planifiés sur ce bien seront supprimés aussi.`}`
                        : 'Supprimer ce scénario immobilier définitivement ?';
                })()}
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
                    const nomAffiche = g.name || (g.isPrimaryResidence ? 'Résidence' : `Propriété ${idx + 1}`);
                    return (
                        // [A11Y-DELETE-SPAN-NO-KEYBOARD] Les deux commandes sont des FRÈRES dans une
                        // pilule, pas l'une DANS l'autre.
                        //
                        // ⚠️ Le correctif évident — ajouter `tabIndex` et `onKeyDown` au `<span
                        // role="button">` — aurait été FAUX : un contrôle interactif imbriqué dans un
                        // `<button>` est interdit par la spec (contenu interactif dans un descendant
                        // de bouton), et Entrée/Espace auraient déclenché les DEUX actions, la
                        // sélection de l'onglet et la suppression. Sortir le contrôle règle
                        // l'atteignabilité clavier ET l'imbrication d'un seul geste.
                        //
                        // Les classes de pilule passent au conteneur pour que l'apparence ne bouge
                        // pas ; chaque bouton garde son propre `focus-ring`, sinon la tabulation
                        // traverserait deux commandes en n'en signalant qu'une.
                        <div
                            key={g.id}
                            className={`rounded-pill border transition-all flex items-center text-meta font-bold ${
                                isActive
                                    ? 'bg-info-bg border-info-500 text-info-400'
                                    : 'bg-white/5 border-white/10 text-ink-300 hover:bg-white/10'
                            }`}
                        >
                            <button
                                onClick={() => setActiveGoalId(g.id)}
                                className="px-4 py-2 flex items-center gap-2 rounded-pill focus-ring"
                            >
                                <span className="inline-flex items-center gap-1.5"><Icon name="real-estate" size={14} />{nomAffiche}</span>
                                {g.isActive && <span className="w-2 h-2 rounded-full bg-success-500 animate-pulse" aria-label="active" />}
                            </button>
                            {allGoals.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => deleteGoal(g.id)}
                                    // `touch-target` (index.css) porte la hit-box au minimum WCAG 2.5.8 :
                                    // l'icône fait 13 px, la cible d'une action DESTRUCTIVE ne peut pas.
                                    className="touch-target pr-3 pl-1 text-ink-400 hover:text-danger-400 rounded-pill focus-ring"
                                    aria-label={`Supprimer ${nomAffiche}`}
                                >
                                    <Icon name="close" size={13} />
                                </button>
                            )}
                        </div>
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
                                sublabel={availableCash >= totalCashNeeded ? 'Disponible'
                                    : <>Manque <PrivateAmount>{formatCurrency(totalCashNeeded - availableCash)}</PrivateAmount></>}
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

                    <ScenariosComparatifsCard
                        activeGoal={activeGoal}
                        amortization={amortization}
                        projectedEquityAtAmortEnd={projectedEquityAtAmortEnd}
                        combinedData={combinedData}
                        netYield={netYield}
                        netAnnualIncome={netAnnualIncome}
                        currentRent={currentRent}
                        setCurrentRent={setCurrentRent}
                        marketReturn={marketReturn}
                        setMarketReturn={setMarketReturn}
                        marketReturnOverridden={marketReturnOverridden}
                        setMarketReturnOverridden={setMarketReturnOverridden}
                        globalReturnRate={globalReturnRate}
                        setLocalStockReturn={setLocalStockReturn}
                        localRentalAppreciation={localRentalAppreciation}
                        setLocalRentalAppreciation={setLocalRentalAppreciation}
                    />

                    <AmortissementCards
                        amortizationData={amortizationData}
                        welcomeTax={welcomeTax}
                        notaryFees={notaryFees}
                        inspectionFees={inspectionFees}
                        initialRenovations={initialRenovations}
                        price={price}
                        downPayment={downPayment}
                        yearlyRenovations={yearlyRenovations}
                        amortization={amortization}
                    />
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
