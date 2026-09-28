import React, { useState, useMemo, useEffect } from 'react';
import { formatCAD, formatNumber } from '../../utils/format';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { useViewportBelowLg } from '../../hooks/useViewportBelowLg';
import { RealEstateGoal, Municipality, Tab as TabEnum } from '../../types';
import { INITIAL_REAL_ESTATE_GOAL, TAB_LABELS } from '../../constants';
import { VieCurveLink } from '../vie/VieCurveLink';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Modal } from '../ui/Modal';
import { PropertyConfigurator } from './PropertyConfigurator';
import { MultiPropertyComparison } from './MultiPropertyComparison';
import { RealEstateAdviceCard } from './RealEstateAdviceCard';
import { construireAmortissement, construireComparaisonScenarios } from './calculsImmoLocaux';
import { ScenariosAchatLocation } from './ScenariosAchatLocation';
import { AmortissementCards } from './AmortissementCards';
import { calculateWelcomeTax } from '../../services/realEstate';
import { presentEquityOfGoal, monthsSince } from '../../services/projection/pastPurchaseInit';
import { firstDayOfCurrentMonthIso } from '../../services/realEstatePartition';
import { useFinanceStore } from '../../store/useFinanceStore';
import { PageHeader } from '../ui/PageHeader';
import { Icon } from '../ui/Icon';
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

interface RealEstateWorkspaceProps {
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

    // [REFONTE-NAV-L3] Équité PRÉSENTE agrégée (vue « actuel ») — source unique presentEquityOfGoal.
    // ⚠️ No-fake-data : `presentEquityOfGoal` rend 0 pour un bien INACTIF → on n'agrège que les biens
    // ACTIFS, et on le DIT (« 1 bien actif sur 2 ») ; aucun actif → « — » plutôt qu'un 0 $ crédible.
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

    // [S5-REFONTE-IMMOBILIER] Maquettes E-immobilier / M-immobilier : UNE page « Immobilier », deux
    // onglets d'en-tête (Biens détenus · N / Projets d'achat · N) qui basculent entre les deux vues du
    // split (Tab.REAL_ESTATE ↔ Tab.REAL_ESTATE_PROJECTS — l'item de navigation reste « Immobilier »).
    const setActiveTab = useFinanceStore(s => s.setActiveTab);
    const etroit = useViewportBelowLg();
    const countVisible = visibleGoals.length;
    const otherCount = allGoals.length - visibleGoals.length;
    const nbBiens = isActuel ? countVisible : otherCount;
    const nbProjets = isActuel ? otherCount : countVisible;
    const onglets = (
        <div role="group" aria-label="Biens et projets" className="flex gap-1 p-1 lg:p-0 rounded-xl bg-surface lg:bg-transparent border border-white/6 lg:border-0 w-full lg:w-auto">
            {([
                { tab: TabEnum.REAL_ESTATE, libelle: `Biens détenus · ${nbBiens}`, courant: isActuel },
                { tab: TabEnum.REAL_ESTATE_PROJECTS, libelle: `Projets d'achat · ${nbProjets}`, courant: !isActuel },
            ]).map((o) => (
                <button
                    key={o.tab}
                    type="button"
                    onClick={() => { if (!o.courant) setActiveTab(o.tab); }}
                    aria-current={o.courant ? 'page' : undefined}
                    className={`flex-1 lg:flex-none min-h-10 lg:min-h-9 px-3.5 rounded-lg text-body transition-colors focus-ring ${o.courant ? 'bg-ink-50 lg:bg-surfaceHighlight text-dark lg:text-ink-50 font-semibold' : 'text-ink-300 hover:bg-white/5'}`}
                >
                    {o.libelle}
                </button>
            ))}
        </div>
    );
    const boutonAjouter = (
        <button
            type="button"
            onClick={addNewGoal}
            aria-label={isActuel ? 'Ajouter un bien' : 'Ajouter un projet'}
            className="h-10 px-3.5 lg:px-4 rounded-lg border border-white/40 lg:border-transparent text-ink-100 lg:bg-primary lg:text-dark text-body lg:font-bold focus-ring"
        >
            <span className="lg:hidden">Ajouter</span><span className="hidden lg:inline">{isActuel ? 'Ajouter un bien' : 'Ajouter un projet'}</span>
        </button>
    );
    // Biens détenus : la phrase de patrimoine (nombre de biens · équité présente des biens ACTIFS).
    const activeCount = activeVisibleGoals.length;
    const resumeBiens = isActuel && countVisible > 0 ? (
        <p className="text-meta lg:text-body text-ink-400">
            {countVisible} bien{countVisible > 1 ? 's' : ''} détenu{countVisible > 1 ? 's' : ''} ·{' '}
            {activeCount === 0
                ? 'Équité présente — (aucun bien actif dans la simulation)'
                : <>Équité présente <PrivateAmount>{formatCurrency(presentEquityTotal)}</PrivateAmount>
                    {activeCount < countVisible && ` (${activeCount} bien${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''} sur ${countVisible})`}</>}
        </p>
    ) : undefined;
    const enTete = (
        <PageHeader
            title={TAB_LABELS[TabEnum.REAL_ESTATE]}
            badge={resumeBiens}
            nav={onglets}
            actions={
                <span className="flex items-center gap-3">
                    {!isActuel && <span className="hidden lg:inline-flex"><VieCurveLink /></span>}
                    {boutonAjouter}
                </span>
            }
        />
    );

    // Vue vide HONNÊTE (pas d'éditeur sur le goal placeholder) : rien à montrer dans CETTE moitié du
    // split — on propose d'ajouter ; l'autre moitié est à un onglet.
    if (countVisible === 0) {
        return (
            <div className="space-y-5 stagger-in pb-10">
                {enTete}
                <section className="rounded-2xl bg-surface border border-white/6 py-10 px-4 text-center space-y-4">
                    <p className="text-body text-ink-300">
                        {isActuel
                            ? 'Tu ne possèdes aucun bien immobilier pour l\'instant (photo d\'aujourd\'hui).'
                            : 'Aucun projet d\'achat futur pour l\'instant (les plans qui déforment la courbe).'}
                    </p>
                    <button type="button" onClick={addNewGoal} className="h-10 px-4 rounded-lg bg-primary text-dark text-body font-bold focus-ring">
                        {isActuel ? '+ Ajouter un bien détenu' : '+ Ajouter un projet d\'achat'}
                    </button>
                </section>
                {!isActuel && etroit && <div className="[&>button]:w-full"><VieCurveLink /></div>}
            </div>
        );
    }

    const residence = activeGoal.isPrimaryResidence || !activeGoal.isRented;
    const tuile = 'rounded-2xl bg-surface border border-white/6 px-4 py-3.5 lg:px-[18px] flex flex-col gap-0.5 min-w-0';
    const etiquette = 'text-meta xl:text-[11px] xl:font-semibold xl:tracking-[0.06em] xl:uppercase text-ink-400';
    const montant = 'font-mono text-[18px] xl:text-[20px] font-bold text-ink-50';
    const pctTexte = (v: number) => formatNumber(v, { decimals: Number.isInteger(v) ? 0 : 1 });

    return (
        <div className="space-y-5 stagger-in pb-10">
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
            {enTete}

            {/* Plusieurs biens dans cette vue : un sélecteur (la maquette n'en montre qu'un). */}
            {countVisible > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                    {visibleGoals.map((g, idx) => {
                        const choisi = activeGoalId === g.id;
                        const nomAffiche = g.name || (g.isPrimaryResidence ? 'Résidence' : `Propriété ${idx + 1}`);
                        return (
                            // [A11Y-DELETE-SPAN-NO-KEYBOARD] Sélection et suppression sont des FRÈRES (jamais
                            // un contrôle dans un <button>).
                            <div key={g.id} className={`rounded-lg border flex items-center text-body ${choisi ? 'bg-surfaceHighlight border-white/15 text-ink-50 font-semibold' : 'border-white/8 text-ink-300 hover:bg-white/5'}`}>
                                <button type="button" onClick={() => setActiveGoalId(g.id)} aria-pressed={choisi} className="min-h-10 px-3.5 flex items-center gap-2 rounded-lg focus-ring">
                                    {nomAffiche}
                                    {g.isActive && <span className="w-2 h-2 rounded-full bg-success-500" aria-label="active" />}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => deleteGoal(g.id)}
                                    className="touch-target pr-3 pl-1 text-ink-400 hover:text-danger-400 rounded-lg focus-ring"
                                    aria-label={`Supprimer ${nomAffiche}`}
                                >
                                    <Icon name="close" size={13} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Carte du bien : nom, type, rôle dans la simulation, interrupteur « Actif ». */}
            <section aria-labelledby="bien-titre" className="rounded-2xl bg-surface border border-white/6 p-4 sm:px-[22px] sm:py-[18px] flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-5">
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <h2 id="bien-titre" className="text-[17px] lg:text-[20px] font-bold text-ink-50">{propertyName}</h2>
                        <span className="max-lg:basis-full max-lg:-mt-1 lg:h-6 lg:px-2.5 lg:rounded-full lg:bg-surfaceHighlight text-meta text-ink-300 flex items-center">{activeGoal.isPrimaryResidence ? 'Résidence principale' : activeGoal.isRented ? 'Propriété locative' : 'Propriété secondaire'}</span>
                        {/* [ENG-PAST-OWNED-VS-PLANNED] (A6) : date passée sans achat confirmé (condition de DATE requise). */}
                        {activeGoal.isOwned === false && !!activeGoal.purchaseDate && activeGoal.purchaseDate < firstDayOfCurrentMonth && (
                            <Badge variant="warning" size="md">Date passée — non acheté</Badge>
                        )}
                    </div>
                    <p className="hidden lg:block text-[13px] text-ink-400">{activeGoal.isPrimaryResidence ? 'Le loyer actuel disparaît de la simulation à l\'achat.' : activeGoal.isRented ? 'Les loyers perçus entrent dans la simulation.' : 'Aucun loyer : le bien pèse par sa mensualité et son équité.'}</p>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={activeGoal.isActive}
                    onClick={() => updateActiveGoal({ isActive: !activeGoal.isActive })}
                    className="flex items-center justify-between lg:justify-start gap-3 min-h-11 px-3.5 lg:px-0 rounded-xl lg:rounded-none border border-white/6 lg:border-0 bg-dark/40 lg:bg-transparent text-body text-ink-200 focus-ring"
                >
                    Actif dans la simulation
                    <span className={`w-11 h-[26px] rounded-full p-[3px] flex transition-colors ${activeGoal.isActive ? 'bg-success-400 justify-end' : 'bg-white/15 justify-start'}`} aria-hidden="true">
                        <span className={`w-5 h-5 rounded-full ${activeGoal.isActive ? 'bg-dark' : 'bg-ink-300'}`} />
                    </span>
                </button>
                {/* [UX-ISACTIVE-BADGE] (A5) : l'amputation du patrimoine doit être VISIBLE. */}
                {!activeGoal.isActive && <p className="text-meta text-warning-400 lg:hidden">Non compté dans la simulation.</p>}
                <p className="lg:hidden text-[13px] text-ink-400">{activeGoal.isPrimaryResidence ? 'Le loyer actuel disparaît de la simulation à l\'achat.' : activeGoal.isRented ? 'Les loyers perçus entrent dans la simulation.' : 'Aucun loyer : le bien pèse par sa mensualité et son équité.'}</p>
            </section>

            <section aria-label="Chiffres clés" className="grid grid-cols-2 xl:grid-cols-5 gap-2.5 xl:gap-3.5">
                <div className={`${tuile} col-span-2 xl:col-span-1`}>
                    <span className={etiquette}>Prix d'achat</span>
                    <PrivateAmount as="div" className={montant}>{formatCurrency(price)}</PrivateAmount>
                    <span className="text-[10px] sm:text-[11px] leading-[15px] text-ink-400">mise de fonds <PrivateAmount>{formatCurrency(downPayment)}</PrivateAmount> · {Math.round((downPayment / price) * 100)} %</span>
                </div>
                {isActuel ? (
                    /* [REFONTE-NAV-L3] Bien détenu : l'équité PRÉSENTE (source unique presentEquityOfGoal) ;
                       inactif → « — » honnête (presentEquityOfGoal rend 0 pour un bien inactif). */
                    <div className={tuile}>
                        <span className={etiquette}>Équité présente</span>
                        {activeGoal.isActive
                            ? <PrivateAmount as="div" className={montant}>{formatCurrency(activePresentEquity)}</PrivateAmount>
                            : <div className={montant}>—</div>}
                        <span className="text-[10px] sm:text-[11px] leading-[15px] text-ink-400">{activeGoal.isActive ? 'Valeur actuelle − hypothèque' : 'Bien inactif — exclu du patrimoine'}</span>
                    </div>
                ) : (
                    <div className={tuile}>
                        <span className={etiquette}>Cash nécessaire</span>
                        <PrivateAmount as="div" className={montant}>{formatCurrency(totalCashNeeded)}</PrivateAmount>
                        {availableCash >= totalCashNeeded
                            ? <span className="text-[10px] sm:text-[11px] leading-[15px] text-success-400">disponible</span>
                            : <span className="text-[10px] sm:text-[11px] leading-[15px] text-danger-400">manque <PrivateAmount>{formatCurrency(totalCashNeeded - availableCash)}</PrivateAmount></span>}
                    </div>
                )}
                <div className={tuile}>
                    <span className={etiquette}>Prêt initial</span>
                    <PrivateAmount as="div" className={montant}>{formatCurrency(totalMortgage)}</PrivateAmount>
                    <span className="text-[10px] sm:text-[11px] leading-[15px] text-ink-400">prêt / valeur {Math.round((totalMortgage / price) * 100)} %</span>
                </div>
                <div className={tuile}>
                    <span className={etiquette}>Mensualité nette</span>
                    <PrivateAmount as="div" className={montant}>{formatCurrency(netMonthlyCost)}</PrivateAmount>
                    <span className="text-[10px] sm:text-[11px] leading-[15px] text-ink-400">perte sèche <PrivateAmount>{formatCurrency(unrecoverableMonthly)}</PrivateAmount>/mois</span>
                </div>
                <div className={tuile}>
                    <span className={etiquette}>Valeur dans {amortization} ans</span>
                    <PrivateAmount as="div" className={montant}>{formatCurrency(amortizationData.finalValue)}</PrivateAmount>
                    <span className="text-[10px] sm:text-[11px] leading-[15px] text-ink-400">appréciation {pctTexte(propertyGrowthRate)} %/an</span>
                </div>
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-5 items-start">
                <section aria-labelledby="financement-titre" className="order-2 xl:order-none rounded-2xl bg-surface border border-white/6 p-4 sm:px-5 sm:py-[18px] flex flex-col gap-4 min-w-0">
                    <h2 id="financement-titre" className="text-[17px] lg:text-[16px] font-semibold text-ink-50">Financement</h2>
                    <div className="flex flex-col gap-2">
                        <span id="amortissement-libelle" className="text-[13px] text-ink-300">Amortissement</span>
                        <div role="group" aria-labelledby="amortissement-libelle" className="grid grid-cols-4 p-1 rounded-xl bg-dark border border-white/6">
                            {[15, 20, 25, 30].map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => updateActiveGoal({ amortization: n })}
                                    aria-pressed={amortization === n}
                                    className={`h-9 rounded-lg text-[13px] transition-colors focus-ring ${amortization === n ? 'bg-ink-50 text-dark font-semibold' : 'text-ink-200 hover:bg-white/5'}`}
                                >
                                    {n} ans
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label htmlFor="municipality-select" className="text-[13px] text-ink-300">Municipalité (taxe de bienvenue)</label>
                        <select
                            id="municipality-select"
                            value={activeGoal.municipality ?? ''}
                            onChange={e => updateActiveGoal({ municipality: e.target.value ? (e.target.value as Municipality) : undefined })}
                            aria-describedby={!activeGoal.municipality ? 'municipality-hint' : undefined}
                            className={`h-11 px-3.5 text-body ${activeGoal.municipality ? 'text-ink-50' : 'text-warning-400 champ-alerte'}`}
                        >
                            <option value="">À préciser</option>
                            <option value="montreal">Montréal (surtaxe, jusqu'à 4 %)</option>
                            <option value="reste_qc">Reste du Québec (max 2 %)</option>
                        </select>
                        {!activeGoal.municipality && (
                            <p id="municipality-hint" className="text-meta leading-[17px] text-ink-400">
                                Non précisée : le barème de Montréal (le plus élevé) est appliqué par prudence.
                            </p>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                        <div className="px-3 py-2.5 rounded-xl bg-dark border border-white/6">
                            <div className="text-meta text-ink-400">Rendement boursier</div>
                            <div className="font-mono text-ink-50">{pctTexte(marketReturn)} %</div>
                        </div>
                        <div className="px-3 py-2.5 rounded-xl bg-dark border border-white/6">
                            <div className="text-meta text-ink-400">Appréciation immo</div>
                            <div className="font-mono text-ink-50">{pctTexte(localRentalAppreciation)} %</div>
                        </div>
                    </div>
                    <CollapsibleSection title="Taux, frais récurrents et plafond de valeur" variant="lien" headingLevel={3}>
                        <div className="flex flex-col gap-5">
                            <div>
                                <label htmlFor="rew-nom" className="text-meta text-ink-300 block mb-1">Nom de la propriété</label>
                                <input id="rew-nom" type="text" value={propertyName} onChange={e => updateActiveGoal({ name: e.target.value })} className="w-full h-11 px-3 text-ink-50" />
                            </div>
                            <fieldset className="flex flex-col gap-3">
                                <legend className="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink-400 mb-2">Hypothèses du comparatif</legend>
                                <div>
                                    <label htmlFor="rew-currentRent" className="text-meta text-ink-300 block mb-1">Loyer actuel (scénario « louer ») — $/mois</label>
                                    <input id="rew-currentRent" type="number" step="50" value={currentRent} onChange={e => setCurrentRent(Number(e.target.value))} className="w-full h-11 px-3 font-mono text-ink-50" />
                                </div>
                                <div>
                                    <label className="flex justify-between text-meta text-ink-300 mb-1">
                                        <span>Rendement boursier{!marketReturnOverridden && globalReturnRate !== undefined ? ' (celui du Futur)' : ''}</span>
                                        <span className="flex items-center gap-2">
                                            <span className="font-mono text-ink-50">{pctTexte(marketReturn)} %</span>
                                            {marketReturnOverridden && globalReturnRate !== undefined && (
                                                <button
                                                    type="button"
                                                    onClick={() => { setMarketReturnOverridden(false); setMarketReturn(globalReturnRate); setLocalStockReturn(globalReturnRate); }}
                                                    className="text-meta text-primary underline underline-offset-2 focus-ring rounded-sm"
                                                    title={`Resynchroniser avec la projection globale (${globalReturnRate} %)`}
                                                >
                                                    ↺ Futur
                                                </button>
                                            )}
                                        </span>
                                    </label>
                                    <input type="range" aria-label="Rendement boursier" min="3" max="15" step="0.5" value={marketReturn} onChange={e => { setMarketReturn(Number(e.target.value)); setLocalStockReturn(Number(e.target.value)); setMarketReturnOverridden(true); }} className="w-full accent-primary cursor-pointer" />
                                </div>
                                <div>
                                    <label className="flex justify-between text-meta text-ink-300 mb-1">
                                        <span>Appréciation immo (comparatif)</span>
                                        <span className="font-mono text-ink-50">{pctTexte(localRentalAppreciation)} %</span>
                                    </label>
                                    <input type="range" aria-label="Appréciation immo (comparatif)" min="0" max="10" step="0.5" value={localRentalAppreciation} onChange={e => setLocalRentalAppreciation(Number(e.target.value))} className="w-full accent-primary cursor-pointer" />
                                </div>
                                {!residence && (
                                    <p className="text-meta text-ink-300">Si location (cash-flow) : <PrivateAmount className={`font-mono ${netYield > 0 ? 'text-success-400' : 'text-danger-400'}`}>{formatCurrency(netAnnualIncome)}</PrivateAmount>/an</p>
                                )}
                            </fieldset>
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
                            {allGoals.length > 1 && countVisible === 1 && (
                                <div className="flex justify-end">
                                    <button type="button" onClick={() => deleteGoal(activeGoal.id)} aria-label={`Supprimer ${propertyName}`} className="min-h-11 px-3 text-meta text-danger-400 underline underline-offset-2 focus-ring rounded-sm">
                                        Supprimer ce {isActuel ? 'bien' : 'projet'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </CollapsibleSection>
                </section>

                <div className="order-1 xl:order-none min-w-0">
                    <ScenariosAchatLocation
                        donnees={combinedData}
                        annees={amortization}
                        rendementBoursier={marketReturn}
                        appreciation={localRentalAppreciation}
                        locatif={!residence}
                        etroit={etroit}
                    />
                </div>
            </div>

            {!isActuel && etroit && <div className="[&>button]:w-full"><VieCurveLink /></div>}

            <CollapsibleSection title="Tableau d'amortissement" subtitle="Frais d'achat, intérêts, équité année par année">
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
            </CollapsibleSection>

            <MultiPropertyComparison goals={visibleGoals} />

            {/* Phase F.8 — Conseils IA Immobilier (absents des maquettes, gardés). */}
            <RealEstateAdviceCard
                replie
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
