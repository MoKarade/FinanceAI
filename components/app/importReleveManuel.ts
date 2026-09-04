// components/app/importReleveManuel.ts
//
// [GODFILE-APP] L'import MANUEL de relevé bancaire (collage CSV) d'App.tsx, extrait tel quel
// (65 lignes de handler dans le composant). Comportement inchangé : dédup + appariement des
// virements sur l'historique COMPLET, journal d'audit, classification IA paresseuse (le SDK
// Anthropic reste hors du bundle de boot), catégories appliquées sur l'état FRAIS du store.

import type { AppState } from '../../types';
import { showToast } from '../ui/Toast';
import { markDuplicates } from '../../utils/transactionParser';
import { parseBankCsv } from '../../services/import/parseBankCsv';
// [TX-TRANSFERS] Appariement des virements internes — module PUR et léger (aucune dépendance),
// sans effet sur le bundle de boot.
import { applyTransferDetection } from '../../services/transactions/applyTransferDetection';
import { logAudit } from '../../services/auditLog';
import { logError } from '../../services/errorLogger';
import { RULE_CATEGORIES } from '../../services/import/categoryRules';
import { useFinanceStore } from '../../store/useFinanceStore';

interface DepsImportReleve {
    transactions: AppState['transactions'];
    budgetItems: AppState['budgetItems'];
    apiKeyAnthropic: string | undefined;
    setAppState: (patch: Partial<AppState>) => void;
}

export async function importerReleveManuel(rawData: string, deps: DepsImportReleve): Promise<void> {
    const { transactions, budgetItems, apiKeyAnthropic, setAppState } = deps;
    const result = parseBankCsv(rawData);
    const combined = [...result.transactions, ...transactions];
    const deduped = markDuplicates(combined);
    // [TX-TRANSFERS] Appariement des virements internes sur l'historique COMPLET (pas seulement
    // les nouvelles lignes) : les deux côtés d'un virement peuvent arriver dans deux imports
    // différents, et l'appariement a besoin de les voir ensemble. Marquage AUTOMATIQUE des seules
    // paires PROUVÉES (deux comptes connus et différents) — les paires plausibles sans compte
    // remontent au panneau « Virements internes » de l'onglet Transactions, jamais écrites.
    const { transactions: withTransfers, report: transferReport } = applyTransferDetection(deduped);
    setAppState({ transactions: withTransfers, lastUpdate: Date.now() });
    // SYS-AUDIT — trace l'import dans le journal d'audit (qui-quoi-quand).
    logAudit({
        field: 'transactions',
        operation: 'add',
        description: `Import relevé : ${result.transactions.length} ajoutée(s)${result.skipped > 0 ? `, ${result.skipped} ignorée(s)` : ''}`,
        countBefore: transactions.length,
        countAfter: withTransfers.length,
    });
    // No-silent-failure : on dit combien de lignes ont été ignorées.
    const baseMsg = result.skipped > 0
        ? `${result.transactions.length} transaction(s) importée(s), ${result.skipped} ligne(s) ignorée(s).`
        : `${result.transactions.length} transaction(s) importée(s).`;
    // [TX-TRANSFERS] Un marquage automatique doit laisser une TRACE visible : marquer sans le
    // dire retirerait des montants du budget en silence (classe « staleness silencieuse »).
    const transferMsg = transferReport.markedCount > 0
        ? ` ${transferReport.markedCount} virement(s) interne(s) marqué(s).`
        : '';

    // Auto-catégorisation IA (choix Marc) : classe les NOUVELLES transactions non
    // dupliquées / non-transfert encore « à classer ». Lazy-import de claude.ts →
    // ne tire PAS le SDK Anthropic dans le bundle de BOOT (règle CLAUDE.md).
    const apiKey = apiKeyAnthropic;
    const newIds = new Set(result.transactions.map(t => t.id));
    const toClassify = withTransfers.filter(t =>
        newIds.has(t.id) && !t.isDuplicate && !t.isTransfer &&
        (t.category === 'Uncategorized' || t.category === 'Inconnu' || t.category === ''),
    );
    if (!apiKey || toClassify.length === 0) {
        showToast(apiKey ? `${baseMsg}${transferMsg}` : `${baseMsg}${transferMsg} Ajoute ta clé Anthropic pour la classification auto.`, 'success');
        return;
    }
    showToast(`${baseMsg}${transferMsg} Classification IA en cours…`, 'info');
    try {
        const { categorizeBatch } = await import('../../services/claude');
        // 'Inconnu' EXCLU des cibles : c'est un statut « à classer », pas une destination.
        // [TX-CATEGORY-RULES] + jeu canonique des règles : cibles IA disponibles même quand
        // le budget est encore vide (post-purge), cohérentes avec l'import et le Budget.
        const allowed = Array.from(new Set([
            ...budgetItems.map(b => b.name),
            'Salaire', 'Autre', 'Transfert', 'Investissement', 'Remboursement',
            ...RULE_CATEGORIES,
        ]));
        const classified = await categorizeBatch(toClassify, apiKey, withTransfers, allowed);
        const byId = new Map(classified.map(t => [t.id, t]));
        // Applique les catégories sur l'état FRAIS (et non le snapshot `deduped` capturé
        // avant l'await) → un edit utilisateur survenu pendant la classification n'est pas écrasé.
        const current = useFinanceStore.getState().transactions;
        setAppState({ transactions: current.map(t => byId.get(t.id) ?? t), lastUpdate: Date.now() });
        showToast(`${classified.length} nouvelle(s) transaction(s) classée(s).`, 'success');
    } catch (e) {
        logError({ source: 'ai', message: "Auto-catégorisation à l'import échouée", error: e });
        showToast("Import OK, mais la classification auto a échoué — utilise « classer ».", 'error');
    }
}
