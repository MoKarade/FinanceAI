// components/app/exportPdfEcran.ts
//
// [GODFILE-APP] Le clic « Générer PDF » d'App.tsx, extrait tel quel (74 lignes de handler dans le
// composant). Comportement inchangé : mêmes imports paresseux (jspdf hors du bundle de boot),
// même lecture du store hors React pour lastProjection, mêmes toasts — y compris la distinction
// « refus mode discret » ≠ « panne ».

import type { AppState } from '../../types';
import { showToast } from '../ui/Toast';
import { logError } from '../../services/errorLogger';
import { isFxRatesEstimated, hasForeignCurrencyAssets } from '../../services/portfolio';
import { useFinanceStore } from '../../store/useFinanceStore';

/** Champs d'état réellement lus par l'export (le sélecteur d'App les porte tous). */
type EtatPourPdf = Pick<AppState,
    'config' | 'debts' | 'budgetItems' | 'realEstateGoals' | 'retirementGoal'
    | 'assets' | 'fxRates' | 'fxRatesEstimated' | 'financialGoals'>;

interface ArgsExportPdf {
    state: EtatPourPdf;
    globalNetWorth: number;
    calculatedMonthlySavings: number;
    assetBreakdown: { celi: number; reer: number; nonReg: number };
    currentLiquidity: number;
}

export async function genererRapportPdfEcran({ state, globalNetWorth, calculatedMonthlySavings, assetBreakdown, currentLiquidity }: ArgsExportPdf): Promise<void> {
    try {
        // P1.5 — PDF complet : patrimoine + fiscal + holdings + dettes + goals + retraite + budget.
        // Lazy-load jspdf vendor chunk seulement à l'usage.
        const {
            generateFinancialReport,
            buildHoldingsRows,
            buildDebtsRows,
            buildGoalsRows,
            buildFiscalSummary,
            buildScenariosRows,
        } = await import('../../services/pdfReport');
        // [NW-PARITY-SURFACES] Équité immo RÉELLE par propriété (était `equity: 0`
        // en dur → la ligne « Équité bâtie » du PDF ne s'affichait jamais). Import
        // dynamique : même frontière lazy que le PDF lui-même (rien au boot).
        const { presentEquityOfGoal, monthsSince } = await import('../../services/projection/pastPurchaseInit');
        // Snapshot store hors React pour éviter la dépendance sur state
        // (lastProjection est délibérément exclu du selector App.tsx).
        const { lastProjection } = useFinanceStore.getState();

        await generateFinancialReport({
            netWorth: globalNetWorth,
            monthlySavings: calculatedMonthlySavings,
            monthlyIncome: state.config.users.reduce((s, u) => s + (u.netSalary || u.salary || 0), 0),
            totalDebts: state.debts.reduce((s, d) => s + d.balance, 0),
            celiBalance: assetBreakdown.celi,
            reerBalance: assetBreakdown.reer,
            investmentsTotal: assetBreakdown.nonReg,
            liquidityBalance: currentLiquidity,
            budgetItems: state.budgetItems.map(b => ({ name: b.name, nature: b.nature || 'Autre', target: b.target, frequency: b.frequency || 'Monthly' })),
            realEstateGoals: state.realEstateGoals.filter(g => g.isActive).map(g => ({
                name: g.name || 'Propriete',
                price: g.price || 0,
                equity: presentEquityOfGoal(g, monthsSince(g.purchaseDate)),
            })),
            retirementTargetAge: state.retirementGoal.targetAge,
            retirementTargetIncome: state.retirementGoal.targetMonthlyIncome,
            userName: state.config.users[0]?.name,
            generatedAt: new Date().toLocaleDateString('fr-CA'),
            lang: document.documentElement.lang || 'fr',
            // P1.5 — sections étendues (dérivées via builders purs testés)
            fiscal: buildFiscalSummary(state),
            holdings: buildHoldingsRows(state),
            // [FX-FALLBACK-SILENCIEUX] : note sous « Total placements » quand le
            // taux vient du repli en dur ET qu'un avoir est en devise étrangère.
            fxRatesEstimated: isFxRatesEstimated(state.fxRates, state.fxRatesEstimated) && hasForeignCurrencyAssets(state.assets),
            debtsDetail: buildDebtsRows(state),
            goalsDetail: buildGoalsRows(state),
            // PDF Futur — comparaison scénarios (allResults depuis lastProjection)
            scenarios: lastProjection?.allResults
                ? buildScenariosRows(
                      lastProjection.allResults,
                      lastProjection.bestStrategyIdx as number | undefined,
                  )
                : [],
        });
        showToast('Rapport PDF généré avec succès.', 'success');
    } catch (e) {
        // Le refus en mode discret n'est PAS une erreur : c'est le contrat. Le
        // confondre avec une panne dirait « ça a planté » là où il faut dire
        // « désactive le mode discret » — l'utilisateur chercherait un bug.
        if (e instanceof Error && e.name === 'PdfRefusedPrivacyError') {
            showToast('Mode discret actif : l’export PDF est bloqué. Un PDF sort de l’app et garderait tes montants en clair — désactive le mode discret pour le générer.', 'error');
            return;
        }
        // ⚠️ [finding silent-failure #644] `logError`, PAS `console.error` : ce
        // `catch` couvre aussi les imports dynamiques et les `build*Rows`, hors du
        // `try` interne de `pdfReport.ts` qui, lui, route déjà vers `logError`. Une
        // vraie panne ici ne laissait aucune trace dans Diagnostics — l'utilisateur
        // voyait un toast et moi rien du tout.
        logError({ source: 'ui', severity: 'error', message: 'Génération PDF échouée', error: e instanceof Error ? e : new Error(String(e)) });
        showToast('Erreur lors de la génération du PDF.', 'error');
    }
}
