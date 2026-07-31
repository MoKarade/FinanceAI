
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { logError } from '../services/errorLogger';
import { Transaction, BudgetCategory, CategorizationRule } from '../types';
import { showToast } from './ui/Toast';
// Phase 4 A3: bascule sur services/claude.ts (Haiku 4.5 pour vitesse)
import { categorizeBatch } from '../services/claude';
import { RULE_CATEGORIES } from '../services/import/categoryRules';
// [TX-CATEGORIZE] La catégorie « Abonnements » ne se décide plus sur le seul libellé : chez un
// marchand de plateforme (Steam, App Store…), seul le profil de récurrence distingue un achat
// unique d'un abonnement. Modules PURS et légers.
import { buildMerchantProfiles } from '../services/transactions/merchantProfile';
import { contextualCategorize } from '../services/transactions/contextualCategorize';
import { Card } from './ui/Card';
import { EmptyState } from './ui/EmptyState';
import { PageHeader } from './ui/PageHeader';
import { Icon } from './ui/Icon';
import { ImportBankStatement } from './import/ImportBankStatement';
import { PrivateAmount } from './ui/PrivateAmount';
import { useFinanceStore } from '../store/useFinanceStore';
import { formatCAD } from '../utils/format';
import { DuplicatesPanel } from './transactions/DuplicatesPanel';
import { TransfersPanel } from './transactions/TransfersPanel';
import { CategoryReviewPanel } from './transactions/CategoryReviewPanel';
import { markTransactionsAsDuplicate, unmarkTransactionsAsDuplicate } from '../services/transactions/duplicateDetection';

interface TransactionsProps {
    transactions: Transaction[];
    setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
    apiKey: string;
    budgetItems: BudgetCategory[];
    categorizationRules?: CategorizationRule[];
    setCategorizationRules?: (rules: CategorizationRule[]) => void;
    /** Import d'un relevé CSV (texte brut) → l'app re-parse + fusionne + dédoublonne. */
    onImport?: (rawText: string) => void;
}

export const Transactions: React.FC<TransactionsProps> = ({
    transactions,
    setTransactions,
    apiKey,
    budgetItems,
    categorizationRules = [],
    setCategorizationRules,
    onImport,
}) => {
    // [PH4E-OWNER-EDIT] mode couple : colonne « Conjoint » pour OVERRIDER l'attribution auto (par type de poste).
    // Hooks de store regroupés en tête (avant les useState) pour la lisibilité.
    const config = useFinanceStore(s => s.config);
    // [TX-REVIEW] Revue d'échantillon persistée (graine + jugements) — l'échantillon ne doit pas
    // changer entre deux ouvertures, sinon le dénominateur du taux ne veut plus rien dire.
    const categoryReview = useFinanceStore(s => s.categoryReview);
    const setAppState = useFinanceStore(s => s.setAppState);
    const coupleUsers = config?.users ?? [];
    const isCouple = !!coupleUsers[1]?.name?.trim();
    const ownerFirstName = (i: 0 | 1): string => coupleUsers[i]?.name?.trim().split(' ')[0] || `Conjoint ${i + 1}`;

    const [processing, setProcessing] = useState(false);
    const [progressStatus, setProgressStatus] = useState({ current: 0, total: 0 });
    const [liveLogs, setLiveLogs] = useState<string[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);

    const [showWizard, setShowWizard] = useState(false);

    const [filterText, setFilterText] = useState('');
    // [TX-DUPLICATES] Ce setter était `_`-préfixé et JAMAIS appelé : le filtre était figé à `false`
    // à vie, donc les doublons marqués étaient invisibles et impossibles à revoir (code mort qui
    // échappe au lint via le `_`, cf. DETTE-DEADCODE). Rebranché avec le panneau de détection.
    const [showDuplicates, setShowDuplicates] = useState(false);
    // [DEADCODE-TX-TYPEFILTER] `dateStart`/`typeFilter` étaient des états dont les setters
    // (`_`-préfixés) n'étaient JAMAIS appelés : filtres morts structurels (aucune UI ne pouvait
    // les changer). Retirés — les rebrancher = re-créer l'état AVEC son contrôle UI.
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [quickFilter, setQuickFilter] = useState<'NONE' | 'BIG_SPEND' | 'RECENT' | 'TO_REVIEW'>('NONE');
    // PH4-TX — tri par colonne (date / marchand / montant / catégorie). Défaut : date décroissante.
    const [sortKey, setSortKey] = useState<'date' | 'payee' | 'amount' | 'category'>('date');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const toggleSort = (key: 'date' | 'payee' | 'amount' | 'category') => {
        if (sortKey === key) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); }
        else { setSortKey(key); setSortDir(key === 'amount' || key === 'date' ? 'desc' : 'asc'); }
    };

    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<number | null>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;

    useEffect(() => {
        if (processing && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [liveLogs, processing]);

    useEffect(() => {
        if (categorizationRules.length === 0) return;
        setTransactions(prev => prev.map(t => {
            if (t.isTransfer || t.isAiProcessed) return t;
            const match = categorizationRules.find(r =>
                (t.payee || '').toLowerCase().includes(r.pattern.toLowerCase())
            );
            if (match && t.category !== match.category) {
                return { ...t, category: match.category, status: 'manual' as const, confidence: 100 };
            }
            return t;
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categorizationRules]);

    const [showRulesPanel, setShowRulesPanel] = useState(false);
    const [newPattern, setNewPattern] = useState('');
    const [newRuleCategory, setNewRuleCategory] = useState('');

    // [TX-DUPLICATES] Marquage/démarquage — passe par les helpers PURS (aucune suppression : le cash
    // est dérivé des transactions, cf. ADR « Suppressions via MCP/IA »). Le filtre s'ouvre après un
    // marquage pour que le résultat soit VISIBLE : marquer sans rien voir serait une action aveugle.
    const markedDuplicateCount = useMemo(
        () => transactions.filter((t) => t.isDuplicate).length,
        [transactions],
    );
    const handleMarkDuplicates = (ids: number[]): void => {
        if (ids.length === 0) return;
        setTransactions(prev => markTransactionsAsDuplicate(prev, ids));
        setShowDuplicates(true);
        showToast(`${ids.length} transaction(s) marquée(s) en doublon — exclues des calculs, réversible.`, 'success');
    };
    const handleUnmarkAllDuplicates = (): void => {
        const ids = transactions.filter((t) => t.isDuplicate).map((t) => t.id);
        if (ids.length === 0) return;
        setTransactions(prev => unmarkTransactionsAsDuplicate(prev, ids));
        showToast(`${ids.length} marquage(s) annulé(s).`, 'success');
    };

    // [TX-TRANSFERS] Marque les deux côtés d'un virement interne. Même forme que `toggleTransfer`
    // (catégorie « Transfert », `originalCategory` préservée pour pouvoir défaire) — une seule
    // sémantique du marquage, quel que soit le point d'entrée.
    const handleMarkTransfers = (ids: number[]): void => {
        if (ids.length === 0) return;
        const idSet = new Set(ids);
        setTransactions(prev => prev.map(t => (idSet.has(t.id)
            ? {
                ...t,
                isTransfer: true,
                originalCategory: t.originalCategory ?? t.category,
                category: 'Transfert',
                status: 'processed' as const,
                confidence: 100,
            }
            : t)));
        showToast(`${ids.length} transaction(s) marquée(s) comme virement interne — exclues du budget, réversible.`, 'success');
    };

    const handleAddRule = () => {
        if (!newPattern.trim() || !newRuleCategory) return;
        const rule: CategorizationRule = {
            id: `rule_${Date.now()}`,
            pattern: newPattern.trim(),
            category: newRuleCategory,
            createdAt: new Date().toISOString()
        };
        const updated = [...categorizationRules, rule];
        setCategorizationRules?.(updated);
        setNewPattern('');
        showToast(`Regle ajoutee: "${rule.pattern}" -> ${rule.category}`, 'success');
    };

    const handleDeleteRule = (id: string) => {
        const updated = categorizationRules.filter(r => r.id !== id);
        setCategorizationRules?.(updated);
    };

    const handleApplyRuleNow = (rule: CategorizationRule) => {
        let count = 0;
        setTransactions(prev => prev.map(t => {
            if ((t.payee || '').toLowerCase().includes(rule.pattern.toLowerCase()) && t.category !== rule.category) {
                count++;
                return { ...t, category: rule.category, status: 'manual' as const, confidence: 100 };
            }
            return t;
        }));
        showToast(`${count} transaction(s) mises a jour`, 'success');
    };

    const availableCategories = useMemo(() => {
        const budgetNames = budgetItems.map(b => b.name);
        const systemCats = ["Salaire", "Autre", "Transfert", "Investissement", "Remboursement", "Inconnu"];
        // [TX-CATEGORY-RULES] + jeu canonique des règles : disponible même quand le budget est
        // encore VIDE (post-purge), pour le classement manuel ET la liste `allowed` de l'IA.
        return Array.from(new Set([...budgetNames, ...systemCats, ...RULE_CATEGORIES])).sort();
    }, [budgetItems]);

    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            if (quickFilter === 'BIG_SPEND' && (Math.abs(t.amount) < 100 || t.isTransfer)) return false;
            if (quickFilter === 'RECENT') {
                const oneWeekAgo = new Date();
                oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                if (new Date(t.date) < oneWeekAgo) return false;
            }
            if (quickFilter === 'TO_REVIEW' && t.category !== 'Uncategorized' && t.category !== 'Autre' && t.category !== 'Inconnu') return false;

            if (!showDuplicates && t.isDuplicate) return false;

            const searchMatch = filterText === '' ||
                (t.payee || '').toLowerCase().includes(filterText.toLowerCase()) ||
                (t.category || '').toLowerCase().includes(filterText.toLowerCase());
            if (!searchMatch) return false;

            if (selectedCategory !== 'All' && t.category !== selectedCategory) return false;

            return true;
        });
    }, [transactions, filterText, showDuplicates, selectedCategory, quickFilter]);

    // PH4-TX — tri appliqué APRÈS le filtre. localeCompare 'fr' pour marchand/catégorie ; numérique
    // pour le montant ; comparaison de chaîne ISO pour la date (YYYY-MM-DD trie correctement).
    const sortedTransactions = useMemo(() => {
        const dir = sortDir === 'asc' ? 1 : -1;
        return [...filteredTransactions].sort((a, b) => {
            switch (sortKey) {
                case 'amount': return (a.amount - b.amount) * dir;
                case 'payee': return (a.payee || '').localeCompare(b.payee || '', 'fr') * dir;
                case 'category': return (a.category || '').localeCompare(b.category || '', 'fr') * dir;
                case 'date':
                default: return (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) * dir;
            }
        });
    }, [filteredTransactions, sortKey, sortDir]);

    const uncategorizedGroups = useMemo(() => {
        if (!showWizard) return [];

        const groups: Record<string, { payee: string, count: number, total: number, ids: number[] }> = {};

        transactions.forEach(t => {
            if (!t.isDuplicate && (t.category === 'Uncategorized' || t.category === 'Autre' || t.category === 'Inconnu')) {
                const key = (t.payee || 'Inconnu').toLowerCase().substring(0, 15).trim();
                if (!groups[key]) {
                    groups[key] = { payee: t.payee, count: 0, total: 0, ids: [] };
                }
                groups[key].count++;
                groups[key].total += t.amount;
                groups[key].ids.push(t.id);
            }
        });

        return Object.values(groups).sort((a, b) => b.count - a.count);
    }, [transactions, showWizard]);

    const handleWizardApply = (ids: number[], newCat: string) => {
        const idSet = new Set(ids);
        const updated = transactions.map(t =>
            idSet.has(t.id) ? { ...t, category: newCat, status: 'processed' as const, confidence: 100 } : t
        );
        setTransactions(updated);
    };

    const toggleTransfer = (id: number) => {
        setTransactions(prev => prev.map(t => {
            if (t.id === id) {
                const newVal = !t.isTransfer;
                return {
                    ...t,
                    isTransfer: newVal,
                    category: newVal ? 'Transfert' : (t.originalCategory || 'Uncategorized'),
                    status: 'manual' as const,
                    confidence: 100
                };
            }
            return t;
        }));
    };

    const updateCategory = (id: number, newCat: string) => {
        setTransactions(prev => prev.map(t =>
            t.id === id ? { ...t, category: newCat, status: 'manual' as const, isTransfer: newCat === 'Transfert', confidence: 100 } : t
        ));
    };

    // [PH4E-OWNER-EDIT] override manuel du conjoint propriétaire (undefined = retour à l'attribution AUTO par type de poste).
    const updateOwner = (id: number, ownerId: 0 | 1 | undefined) => {
        setTransactions(prev => prev.map(t => (t.id === id ? { ...t, ownerId } : t)));
    };

    // [TX-CATEGORIZE] `scope: 'all'` = passe sur TOUT l'historique (demande Marc : « une passe tout
    // historique », avec écrasement des catégories existantes). Dans les deux modes, une transaction
    // corrigée à la main (`status === 'manual'`) est un VERROU : jamais réécrite (seule exception au
    // « écraser aussi », décision Marc 2026-07-31).
    const handleAutoCategorizeAll = async (scope: 'gaps' | 'all' = 'gaps') => {
        setProcessing(true);
        setLiveLogs(['Demarrage de l\'analyse...']);
        setProgressStatus({ current: 0, total: 0 });

        const isLocked = (t: Transaction): boolean => t.status === 'manual';
        let targetTxs: Transaction[] = [];
        if (selectedIds.size > 0) {
            targetTxs = transactions.filter(t => selectedIds.has(t.id) && !isLocked(t));
        } else if (scope === 'all') {
            targetTxs = transactions.filter(t => !t.isDuplicate && !t.isTransfer && !isLocked(t));
        } else {
            targetTxs = transactions.filter(t =>
                !t.isDuplicate && !isLocked(t) &&
                (t.category === 'Uncategorized' || t.category === '' || t.category === 'Unknown' || t.category === 'Inconnu')
            );
        }

        if (targetTxs.length === 0) {
            targetTxs = transactions.filter(t => !t.isDuplicate && !isLocked(t) && t.category === 'Autre');
            if (targetTxs.length === 0) {
                showToast("Tout semble deja classe ! Utilisez le mode manuel si besoin.", "info");
                setProcessing(false);
                return;
            }
        }

        // [TX-CATEGORY-RULES] Passe RÈGLES d'abord (déterministe, gratuite, ~88 % du corpus réel) :
        // ce que les règles classent est appliqué immédiatement ; l'IA ne reçoit QUE le reste.
        // [TX-CATEGORIZE] Profils de récurrence construits sur les DÉPENSES réelles (hors
        // transferts et doublons, qui fausseraient la cadence) — ils permettent de distinguer un
        // achat unique chez un marchand de plateforme d'un vrai abonnement.
        const profiles = buildMerchantProfiles(
            transactions
                .filter(t => !t.isDuplicate && !t.isTransfer)
                .map(t => ({ payee: t.payee, amount: t.amount, date: t.date })),
        );
        const ruled = new Map<number, string>();
        let promoted = 0;
        for (const t of targetTxs) {
            const decision = contextualCategorize(t.payee, profiles);
            if (!decision.category) continue;
            ruled.set(t.id, decision.category);
            if (decision.source === 'recurrence') promoted++;
        }
        if (ruled.size > 0) {
            setTransactions(prev => prev.map(t => {
                const cat = ruled.get(t.id);
                return cat
                    ? { ...t, category: cat, status: 'processed' as const, isTransfer: cat === 'Transfert' ? true : t.isTransfer, isAiProcessed: false, confidence: 100 }
                    : t;
            }));
            setLiveLogs(prev => [...prev, `${ruled.size} classee(s) par regles (sans IA)${promoted > 0 ? `, dont ${promoted} abonnement(s) reconnu(s) a la recurrence` : ''}.`]);
            targetTxs = targetTxs.filter(t => !ruled.has(t.id));
        }
        if (targetTxs.length === 0) {
            showToast(`${ruled.size} transaction(s) classee(s) par regles — rien a envoyer a l'IA.`, 'success');
            setSelectedIds(new Set()); // même nettoyage que le chemin IA (finding panel : sélection qui restait cochée)
            setProcessing(false);
            return;
        }

        setProgressStatus({ current: 0, total: targetTxs.length });
        setLiveLogs(prev => [...prev, `${targetTxs.length} transactions ciblees.`, `Modele: Claude Sonnet 4.6`]);

        try {
            await categorizeBatch(
                targetTxs,
                apiKey,
                transactions,
                availableCategories,
                (count: number, total: number, msg: string, processedChunk: Transaction[]) => {
                    setProgressStatus({ current: count, total: total });
                    setLiveLogs(prev => [...prev, msg]);

                    if (processedChunk && processedChunk.length > 0) {
                        setTransactions((currentTransactions: Transaction[]): Transaction[] => {
                            const updateMap = new Map<number, Transaction>(
                                processedChunk.map((p: Transaction): [number, Transaction] => [p.id, p])
                            );
                            return currentTransactions.map((t: Transaction): Transaction => {
                                const found = updateMap.get(t.id);
                                return found ?? t;
                            });
                        });
                    }
                }
            );

            setLiveLogs(prev => [...prev, 'Analyse terminee !']);

            setTimeout(() => {
                const hasLeftovers = transactions.some(t => t.category === 'Inconnu');
                if (hasLeftovers) setShowWizard(true);
            }, 1500);

        } catch (e: unknown) {
            // TH4 fix : unknown au lieu de any (useUnknownInCatchVariables tsconfig)
            logError({ source: 'ai', severity: 'error', message: 'Catégorisation batch des transactions échouée', error: e });
            const msg = e instanceof Error ? e.message : 'inconnue';
            setLiveLogs(prev => [...prev, `Erreur : ${msg}`]);
        } finally {
            setTimeout(() => {
                setProcessing(false);
                setLiveLogs([]);
                setSelectedIds(new Set());
            }, 3000);
        }
    };

    const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
    const paginatedTransactions = sortedTransactions.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handleSelectOne = (id: number, shiftKey: boolean) => {
        const newSelected = new Set(selectedIds);
        if (shiftKey && lastSelectedId !== null) {
            const allIds = filteredTransactions.map(t => t.id);
            const start = allIds.indexOf(lastSelectedId);
            const end = allIds.indexOf(id);
            if (start !== -1 && end !== -1) {
                const [min, max] = [Math.min(start, end), Math.max(start, end)];
                for (let i = min; i <= max; i++) newSelected.add(allIds[i]);
            }
        } else {
            if (newSelected.has(id)) newSelected.delete(id);
            else newSelected.add(id);
        }
        setSelectedIds(newSelected);
        setLastSelectedId(id);
    };

    const filteredSum = filteredTransactions.reduce((acc, t) => !t.isTransfer ? acc + t.amount : acc, 0);

    const handleExportCSV = () => {
        const headers = ['Date', 'Marchand', 'Montant CAD', 'Categorie', 'Compte', 'Transfert', 'Confiance IA'];
        const rows = filteredTransactions.map(t => [
            t.date,
            `"${(t.payee || '').replace(/"/g, '""')}"`,
            t.amount.toFixed(2),
            `"${t.category || ''}"`,
            `"${t.accountName || ''}"`,
            t.isTransfer ? 'Oui' : 'Non',
            t.confidence !== undefined ? `${t.confidence}%` : ''
        ]);
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getConfidenceColor = (score?: number) => {
        if (!score) return 'bg-surfaceHighlight';
        if (score >= 90) return 'bg-green-500';
        if (score >= 70) return 'bg-yellow-500';
        return 'bg-danger-500';
    };

    return (
        <div className="space-y-6 relative stagger-in">

            <PageHeader
                icon={<Icon name="transactions" size={28} />}
                title="Transactions"
                subtitle={`${transactions.length} transactions au total · ${uncategorizedGroups.length} groupe(s) à classer`}
                actions={
                    <div className="flex items-center gap-2">
                        {transactions.length > 0 && (
                            <button
                                type="button"
                                onClick={async () => {
                                    const { exportTransactionsCSV, downloadCSV, dateForFilename } = await import('../utils/csvExport');
                                    downloadCSV(`transactions-${dateForFilename()}`, exportTransactionsCSV(transactions));
                                }}
                                className="px-3 py-1.5 bg-info-500/15 hover:bg-info-500/25 border border-info-500/30 rounded-card text-info-400 text-tiny font-bold transition-colors focus-ring"
                                title="Exporter toutes les transactions en CSV"
                            >
                                Export CSV
                            </button>
                        )}
                    </div>
                }
            />

            {/* [FINTABLE-4] Import manuel — repli JAMAIS supprimé (seul chemin quand Fintable/Plaid
                est indisponible), mais déplacé HORS du flux principal (retiré des actions du header)
                maintenant que Fintable synchronise les transactions récentes automatiquement, 1×/jour.
                Disclosure native `<details>` (convention établie, cf `AdvancedProjectionParams` /
                `HistoryCoverageNote`) : ouverte par défaut UNIQUEMENT à l'onboarding (aucune transaction,
                D2 activation — l'écran vide ne doit jamais être une impasse) ; repliée sinon, un clic pour
                l'atteindre. ⚠️ jsdom ne cache pas le contenu d'un `<details>` fermé → le test discrimine
                sur l'attribut `open`, pas sur la présence du panneau (cf CLAUDE.md [[INVEST-CHART-CLEAN]]). */}
            {onImport && (
                <details open={transactions.length === 0}>
                    <summary className="cursor-pointer text-body text-ink-300 hover:text-white transition-colors focus-ring rounded-card inline-block px-1 py-1.5">
                        Import manuel (repli — CSV/PDF)
                    </summary>
                    <div className="mt-3">
                        <ImportBankStatement onImport={onImport} apiKey={apiKey} />
                    </div>
                </details>
            )}

            {/* [TX-DUPLICATES] Détection de doublons — propose, ne marque jamais d'office. */}
            <DuplicatesPanel
                transactions={transactions}
                markedCount={markedDuplicateCount}
                onMarkDuplicates={handleMarkDuplicates}
                onUnmarkAll={handleUnmarkAllDuplicates}
            />

            {/* [TX-TRANSFERS] Virements internes — marque d'office ce qui est PROUVÉ (deux comptes
                connus et différents), fait confirmer le reste. */}
            <TransfersPanel transactions={transactions} onMarkTransfers={handleMarkTransfers} />

            {/* [TX-REVIEW] Mesure du taux réel d'erreurs — le seul moyen de vérifier l'objectif. */}
            <CategoryReviewPanel
                transactions={transactions}
                review={categoryReview}
                onChange={(next) => setAppState({ categoryReview: next })}
                onFixCategory={(id) => {
                    // Amène la transaction à l'écran pour la corriger : filtre sur son marchand et
                    // remonte en haut de liste. Sans ça, « mal classée » serait un vote sans suite.
                    const target = transactions.find((t) => t.id === id);
                    if (target?.payee) { setFilterText(target.payee); setCurrentPage(1); }
                }}
            />

            <div className="rounded-xl border border-indigo-500/20 bg-indigo-900/10">
                <button
                    onClick={() => setShowRulesPanel(p => !p)}
                    aria-expanded={showRulesPanel}
                    className="w-full flex items-center justify-between px-4 py-3 text-meta font-bold text-ink-200 hover:text-ink-50 transition-colors"
                >
                    <span className="flex items-center gap-2">
                        <Icon name="actions" size={15} className="text-ink-400" />
                        Règles automatiques
                        <span className="bg-white/10 text-ink-300 px-2 py-0.5 rounded-full">{categorizationRules.length}</span>
                    </span>
                    <span className={`transition-transform ${showRulesPanel ? 'rotate-180' : ''}`} aria-hidden="true">▼</span>
                </button>

                {showRulesPanel && (
                    <div className="px-4 pb-4 space-y-3">
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                type="text"
                                placeholder="Texte du marchand (ex: Metro, Spotify...)"
                                value={newPattern}
                                onChange={e => setNewPattern(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddRule()}
                                aria-label="Texte du marchand a matcher"
                                className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-meta text-white focus:border-indigo-400 outline-none"
                            />
                            <select
                                value={newRuleCategory}
                                onChange={e => setNewRuleCategory(e.target.value)}
                                aria-label="Categorie a appliquer"
                                className="bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-meta text-white focus:border-indigo-400 outline-none"
                            >
                                <option value="">-- Categorie --</option>
                                {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <button
                                onClick={handleAddRule}
                                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-meta font-bold rounded-lg transition-colors"
                            >
                                + Ajouter
                            </button>
                        </div>

                        {categorizationRules.length === 0 ? (
                            <p className="text-tiny text-ink-400 text-center py-2">Aucune regle. Creez-en une pour categoriser automatiquement.</p>
                        ) : (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                                {categorizationRules.map(rule => (
                                    <div key={rule.id} className="flex items-center gap-2 bg-black/30 px-3 py-2 rounded-lg border border-white/5 text-meta group">
                                        <span className="text-ink-200 font-bold flex-1 truncate">"{rule.pattern}"</span>
                                        <Icon name="chevron-right" size={12} className="text-ink-500 hidden sm:inline shrink-0" />
                                        <span className="text-ink-100 bg-white/10 px-2 py-0.5 rounded font-bold truncate max-w-[120px]">{rule.category}</span>
                                        <button onClick={() => handleApplyRuleNow(rule)} aria-label={`Appliquer la regle ${rule.pattern}`} className="md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 text-ink-300 hover:text-primary transition-all text-tiny font-bold ml-1">Appliquer</button>
                                        <button onClick={() => handleDeleteRule(rule.id)} aria-label={`Supprimer la regle ${rule.pattern}`} className="md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 inline-flex text-danger-400 hover:text-danger-500 transition-all ml-1"><Icon name="close" size={13} /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showWizard && (
                <div role="dialog" aria-modal="true" aria-labelledby="wizard-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
                    <div className="bg-surface border border-white/10 w-full max-w-4xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col">
                        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/[0.03] rounded-t-2xl">
                            <div>
                                <h2 id="wizard-title" className="text-xl font-bold text-white flex items-center gap-2">
                                    Assistant de Classement
                                </h2>
                                <p className="text-meta text-ink-300 mt-1">
                                    L'IA a laisse {uncategorizedGroups.length} groupes incertains. Classez-les en masse ici.
                                </p>
                            </div>
                            <button onClick={() => setShowWizard(false)} aria-label="Fermer l'assistant" className="text-ink-300 hover:text-white px-3 py-1 bg-white/10 rounded">Terminer</button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-2 custom-scrollbar">
                            {uncategorizedGroups.length === 0 ? (
                                <div className="text-center py-20">
                                    <Icon name="check" size={40} className="text-success-500 block mx-auto mb-2" />
                                    <h3 className="text-white font-bold">Tout est propre !</h3>
                                    <p className="text-ink-400 text-body">Plus aucune transaction inconnue.</p>
                                </div>
                            ) : (
                                uncategorizedGroups.map((group) => (
                                    <div key={group.payee} className="flex flex-col md:flex-row items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/5 hover:border-primary/30 transition-colors">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="font-bold text-white text-lg">{group.payee}</div>
                                                <div className="bg-danger-500/20 text-red-300 text-tiny px-2 py-0.5 rounded-full font-bold">
                                                    {group.count} trans.
                                                </div>
                                            </div>
                                            <div className="text-meta text-ink-300">
                                                Total: <span className="text-white font-mono">{formatCAD(group.total, { decimals: 2 })}</span>
                                            </div>
                                        </div>

                                        <div className="w-full md:w-auto flex gap-2">
                                            <select
                                                aria-label={`Categorie pour ${group.payee}`}
                                                className="bg-black border border-white/10 rounded-lg px-3 py-2 text-body text-white focus:border-primary outline-none min-w-[180px]"
                                                onChange={(e) => {
                                                    if (e.target.value) handleWizardApply(group.ids, e.target.value);
                                                }}
                                                value=""
                                            >
                                                <option value="" disabled>Choisir categorie...</option>
                                                {availableCategories.map(c => (
                                                    <option key={c} value={c}>{c}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            <Card
                title={`Historique (${filteredTransactions.length})`}
                action={
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <div className={`text-tiny sm:text-meta font-bold px-2 py-1 rounded border border-white/10 whitespace-nowrap ${filteredSum > 0 ? 'text-green-400 bg-green-500/10' : 'text-danger-400 bg-danger-500/10'}`}>
                            Σ {formatCAD(filteredSum, { decimals: 2 })}
                        </div>
                        <button
                            onClick={handleExportCSV}
                            title="Exporter en CSV (compatible Excel)"
                            aria-label="Exporter en CSV"
                            className="text-tiny sm:text-meta flex items-center gap-1 text-green-300 hover:text-white border border-green-500/30 bg-green-500/10 px-2 sm:px-3 py-1.5 rounded-lg transition-colors font-bold"
                        >
                            CSV
                        </button>
                        <button
                            onClick={() => setShowWizard(true)}
                            aria-label={`Ouvrir l'assistant de classement (${uncategorizedGroups.length} groupes)`}
                            className="text-tiny sm:text-meta flex items-center gap-1 text-blue-300 hover:text-white border border-info-500/30 bg-info-500/10 px-2 sm:px-3 py-1.5 rounded-lg transition-colors font-bold whitespace-nowrap"
                        >
                            <span className="hidden sm:inline">Assistant </span>({uncategorizedGroups.length})
                        </button>
                    </div>
                }
            >
                <div className="flex flex-col gap-3 mb-4">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
                            <input
                                type="text"
                                placeholder="Rechercher..."
                                aria-label="Rechercher dans les transactions"
                                className="w-full bg-surfaceHighlight border border-border rounded-full pl-9 pr-3 py-2 text-body text-white focus:border-primary outline-none shadow-inner"
                                value={filterText}
                                onChange={(e) => { setFilterText(e.target.value); setCurrentPage(1); }}
                            />
                        </div>
                        <button
                            onClick={() => { void handleAutoCategorizeAll('gaps'); }}
                            disabled={processing}
                            aria-label={processing ? 'Scan IA en cours' : 'Demarrer le scan IA'}
                            className={`px-3 sm:px-4 py-2 rounded-full text-meta font-bold shadow-lg transition-all active:scale-95 flex items-center gap-2 whitespace-nowrap ${processing ? 'bg-white/10 text-white cursor-not-allowed' : apiKey ? 'bg-primary text-dark hover:bg-white' : 'bg-surfaceHighlight text-white'
                                }`}
                        >
                            <span className="hidden sm:inline">{processing ? 'Catégorisation…' : 'Auto-catégoriser'}</span>
                            <span className="sm:hidden">{processing ? '…' : 'Auto'}</span>
                        </button>
                        {/* [TX-CATEGORIZE] Passe sur TOUT l'historique (demande Marc). Les catégories
                            existantes sont réécrites — SAUF les corrections manuelles, verrouillées. */}
                        <button
                            onClick={() => { void handleAutoCategorizeAll('all'); }}
                            disabled={processing}
                            aria-label="Recatégoriser tout l'historique (les corrections manuelles sont conservées)"
                            className={`px-3 sm:px-4 py-2 rounded-full text-meta font-bold border transition-all active:scale-95 whitespace-nowrap ${processing ? 'bg-white/5 text-ink-400 border-white/10 cursor-not-allowed' : 'bg-white/5 text-ink-200 border-white/10 hover:text-ink-50'
                                }`}
                        >
                            <span className="hidden sm:inline">Tout recatégoriser</span>
                            <span className="sm:hidden">Tout</span>
                        </button>
                    </div>

                    {processing && (
                        <div role="status" aria-live="polite" className="bg-black/80 border border-green-500/30 rounded-lg p-3 font-mono text-tiny text-green-400 h-32 overflow-y-auto custom-scrollbar flex flex-col-reverse shadow-inner">
                            <div ref={logsEndRef} />
                            {liveLogs.map((log, i) => (
                                <div key={i} className="opacity-90">{`> ${log}`}</div>
                            ))}
                            <div className="sticky bottom-0 bg-black/90 pb-2 border-t border-green-500/20 pt-2 flex items-center justify-between">
                                <span className="animate-pulse">Catégorisation en cours…</span>
                                <span>{progressStatus.current}/{progressStatus.total}</span>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-2 px-2">
                        <button
                            onClick={() => setQuickFilter(quickFilter === 'TO_REVIEW' ? 'NONE' : 'TO_REVIEW')}
                            aria-pressed={quickFilter === 'TO_REVIEW'}
                            className={`px-3 py-1.5 rounded-full text-meta font-bold transition-all border whitespace-nowrap ${quickFilter === 'TO_REVIEW' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-300' : 'bg-white/5 border-white/10 text-ink-300'}`}
                        >
                            A Verifier
                        </button>
                        <select
                            aria-label="Filtre par categorie"
                            className={`appearance-none px-4 py-1.5 rounded-full text-meta font-medium border transition-colors max-w-[150px] truncate ${selectedCategory !== 'All' ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-white/10 text-ink-200'}`}
                            value={selectedCategory}
                            onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
                        >
                            <option value="All">Toutes Categories</option>
                            <option value="Uncategorized">A classer</option>
                            <option value="Transfert">Transferts</option>
                            {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>

                {/* Desktop: tableau complet (≥ md) */}
                <div className="hidden md:block overflow-x-auto pb-4">
                    <table className="w-full text-left border-collapse">
                        <caption className="sr-only">Liste des {filteredTransactions.length} transactions filtrees</caption>
                        <thead>
                            <tr className="border-b border-border text-ink-300 text-meta uppercase tracking-wider">
                                <th className="p-3 w-8">
                                    <input
                                        type="checkbox"
                                        aria-label="Selectionner toutes les transactions de la page"
                                        className="rounded bg-surfaceHighlight border-white/10"
                                        checked={selectedIds.size > 0 && selectedIds.size >= paginatedTransactions.length}
                                        ref={(el) => {
                                            if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < paginatedTransactions.length;
                                        }}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedIds(new Set(paginatedTransactions.map(t => t.id)));
                                            } else {
                                                setSelectedIds(new Set());
                                            }
                                        }}
                                    />
                                </th>
                                {([['date', 'Date'], ['payee', 'Marchand']] as const).map(([k, label]) => (
                                    <th key={k} className="p-3" aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                        <button type="button" onClick={() => toggleSort(k)} className="flex items-center gap-1 uppercase tracking-wider hover:text-white focus-ring rounded">
                                            {label}{sortKey === k && <span aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                                        </button>
                                    </th>
                                ))}
                                <th className="p-3 w-12" title="Confiance de la catégorisation IA — vert ≥ 90 %, jaune ≥ 70 %, rouge < 70 %">
                                    <span className="inline-flex items-center gap-1">Auto<span aria-hidden="true" className="text-ink-500 not-italic">ⓘ</span></span>
                                </th>
                                <th className="p-3">Type</th>
                                {([['amount', 'Montant'], ['category', 'Categorie']] as const).map(([k, label]) => (
                                    <th key={k} className="p-3" aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                        <button type="button" onClick={() => toggleSort(k)} className="flex items-center gap-1 uppercase tracking-wider hover:text-white focus-ring rounded">
                                            {label}{sortKey === k && <span aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                                        </button>
                                    </th>
                                ))}
                                {isCouple && <th className="p-3 uppercase tracking-wider">Conjoint</th>}
                            </tr>
                        </thead>
                        <tbody className="text-body">
                            {paginatedTransactions.map((t) => (
                                <tr
                                    key={t.id}
                                    className={`border-b border-border/50 transition-colors ${selectedIds.has(t.id) ? 'bg-primary/10' : 'hover:bg-white/5'} ${t.category === 'Inconnu' ? 'bg-red-900/10' : ''}`}
                                    onClick={(e) => { if ((e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'SELECT') handleSelectOne(t.id, e.shiftKey); }}
                                >
                                    <td className="p-3">
                                        {/* UI6 (a11y) : checkbox pilotable au clavier (Espace/Entrée déclenchent
                                            un click) ET à la souris. On lit shiftKey sur onClick pour préserver la
                                            sélection par plage (shift-clic), et on stoppe la propagation pour éviter
                                            un double-toggle avec le onClick du <tr>. onChange no-op = input contrôlé
                                            sans warning React. */}
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(t.id)}
                                            onChange={() => { /* géré par onClick (porte shiftKey) */ }}
                                            onClick={(e) => { e.stopPropagation(); handleSelectOne(t.id, e.shiftKey); }}
                                            aria-label={`Selectionner ${t.payee}`}
                                            className="rounded bg-surfaceHighlight"
                                        />
                                    </td>
                                    <td className="p-3 text-ink-300 whitespace-nowrap">{t.date}</td>
                                    <td className="p-3 font-medium text-white">{t.payee}</td>

                                    <td className="p-3">
                                        {t.confidence !== undefined && (
                                            <div
                                                className={`w-2 h-2 rounded-full ${getConfidenceColor(t.confidence)}`}
                                                title={`Confiance: ${t.confidence}%`}
                                                aria-label={`Confiance IA ${t.confidence}%`}
                                            ></div>
                                        )}
                                    </td>

                                    <td className="p-3">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleTransfer(t.id); }}
                                            aria-pressed={t.isTransfer}
                                            className={`text-tiny px-2 py-0.5 rounded border transition-colors ${t.isTransfer ? 'bg-info-500/20 border-info-500 text-blue-300' : 'bg-white/5 border-white/10 text-ink-400 hover:text-white'}`}
                                        >
                                            {t.isTransfer ? 'Transfert' : 'Transaction'}
                                        </button>
                                    </td>

                                    <td className={`p-3 font-bold ${t.isTransfer ? 'text-blue-300 opacity-70' : t.amount > 0 ? 'text-green-400' : 'text-ink-100'}`}>
                                        <PrivateAmount>{formatCAD(t.amount, { decimals: 2 })}</PrivateAmount>
                                    </td>

                                    <td className="p-3">
                                        <select
                                            aria-label={`Categorie de ${t.payee}`}
                                            className={`bg-surfaceHighlight border border-white/10 rounded px-2 py-1 text-meta text-white focus:border-primary outline-none cursor-pointer w-full max-w-[180px] ${(t.category === 'Uncategorized' || t.category === 'Inconnu') ? 'border-danger-500/50 text-red-300' : ''
                                                }`}
                                            value={t.category}
                                            onChange={(e) => updateCategory(t.id, e.target.value)}
                                            onClick={e => e.stopPropagation()}
                                        >
                                            {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </td>

                                    {isCouple && (
                                        <td className="p-3">
                                            {/* [PH4E-OWNER-EDIT] override de l'attribution couple ; « Auto » = par type de poste (défaut).
                                                SEULEMENT sur les DÉPENSES : computeActualByOwner ignore revenus/transferts → l'override n'y
                                                aurait aucun effet (on n'offre pas un contrôle trompeur). aria-label discriminé par date (payee non unique). */}
                                            {t.amount < 0 && !t.isTransfer ? (
                                                <select
                                                    aria-label={`Conjoint propriétaire de ${t.payee} (${t.date})`}
                                                    className="bg-surfaceHighlight border border-white/10 rounded px-2 py-1 text-meta text-white focus:border-primary outline-none cursor-pointer"
                                                    value={t.ownerId === 0 ? '0' : t.ownerId === 1 ? '1' : 'auto'}
                                                    onChange={(e) => updateOwner(t.id, e.target.value === 'auto' ? undefined : (e.target.value === '0' ? 0 : 1))}
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    <option value="auto">Auto</option>
                                                    <option value="0">{ownerFirstName(0)}</option>
                                                    <option value="1">{ownerFirstName(1)}</option>
                                                </select>
                                            ) : (
                                                <span className="text-meta text-ink-400" title="L'attribution par conjoint ne s'applique qu'aux dépenses">—</span>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile: vue cartes (< md) */}
                <ul role="list" aria-label={`${filteredTransactions.length} transactions`} className="md:hidden space-y-2 pb-4 -mx-1">
                    {paginatedTransactions.length === 0 && (
                        <li>
                            <EmptyState
                                variant="subtle"
                                icon={<Icon name="search" size={30} />}
                                title="Aucune transaction"
                                description="Importez un CSV ou ajustez les filtres pour voir vos transactions."
                            />
                        </li>
                    )}
                    {paginatedTransactions.map((t) => {
                        const isSelected = selectedIds.has(t.id);
                        const isUncat = t.category === 'Uncategorized' || t.category === 'Inconnu';
                        return (
                            <li
                                key={t.id}
                                className={`rounded-xl border p-3 transition-colors ${isSelected ? 'border-primary/50 bg-primary/10' : isUncat ? 'border-danger-500/30 bg-red-900/10' : 'border-white/5 bg-white/[0.03]'
                                    }`}
                            >
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="flex items-start gap-2 min-w-0 flex-1">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={(e) => { e.stopPropagation(); handleSelectOne(t.id, false); }}
                                            aria-label={`Selectionner ${t.payee}`}
                                            className="mt-1 rounded bg-surfaceHighlight flex-shrink-0"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-semibold text-white text-body truncate">{t.payee}</span>
                                                {t.confidence !== undefined && (
                                                    <span
                                                        className={`w-2 h-2 rounded-full flex-shrink-0 ${getConfidenceColor(t.confidence)}`}
                                                        title={`Confiance: ${t.confidence}%`}
                                                        aria-label={`Confiance IA ${t.confidence}%`}
                                                    ></span>
                                                )}
                                            </div>
                                            <div className="text-tiny text-ink-400 mt-0.5">{t.date}</div>
                                        </div>
                                    </div>
                                    <PrivateAmount as="div" className={`font-bold text-body whitespace-nowrap ${t.isTransfer ? 'text-blue-300 opacity-70' : t.amount > 0 ? 'text-green-400' : 'text-ink-100'
                                        }`}>
                                        {formatCAD(t.amount, { decimals: 2 })}
                                    </PrivateAmount>
                                </div>

                                <div className="flex items-center gap-2">
                                    <select
                                        aria-label={`Categorie de ${t.payee}`}
                                        className={`flex-1 bg-surfaceHighlight border rounded px-2 py-1.5 text-meta text-white focus:border-primary outline-none cursor-pointer ${isUncat ? 'border-danger-500/50 text-red-300' : 'border-white/10'
                                            }`}
                                        value={t.category}
                                        onChange={(e) => updateCategory(t.id, e.target.value)}
                                    >
                                        {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <button
                                        onClick={() => toggleTransfer(t.id)}
                                        aria-pressed={t.isTransfer}
                                        className={`text-tiny px-2 py-1.5 rounded border transition-colors whitespace-nowrap ${t.isTransfer ? 'bg-info-500/20 border-info-500 text-blue-300' : 'bg-white/5 border-white/10 text-ink-300'
                                            }`}
                                    >
                                        {t.isTransfer ? '⇄ Tx' : 'Tx'}
                                    </button>
                                </div>

                                {isCouple && t.amount < 0 && !t.isTransfer && (
                                    <div className="flex items-center gap-2">
                                        {/* [PH4E-OWNER-EDIT] override de l'attribution couple en mode carte (mobile). Dépenses seulement
                                            (revenus/transferts ignorés par le calcul). touch-target = cible tactile ≥ 44px (WCAG 2.5.5). */}
                                        <span className="text-tiny text-ink-400 shrink-0">Conjoint :</span>
                                        <select
                                            aria-label={`Conjoint propriétaire de ${t.payee} (${t.date})`}
                                            className="touch-target flex-1 bg-surfaceHighlight border border-white/10 rounded px-2 py-1.5 text-meta text-white focus:border-primary outline-none cursor-pointer"
                                            value={t.ownerId === 0 ? '0' : t.ownerId === 1 ? '1' : 'auto'}
                                            onChange={(e) => updateOwner(t.id, e.target.value === 'auto' ? undefined : (e.target.value === '0' ? 0 : 1))}
                                        >
                                            <option value="auto">Auto</option>
                                            <option value="0">{ownerFirstName(0)}</option>
                                            <option value="1">{ownerFirstName(1)}</option>
                                        </select>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>

                {totalPages > 1 && (
                    <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/5">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="text-meta px-3 py-1 bg-white/10 rounded disabled:opacity-30">Precedent</button>
                        <span className="text-meta text-ink-400">Page {currentPage} / {totalPages}</span>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="text-meta px-3 py-1 bg-white/10 rounded disabled:opacity-30">Suivant</button>
                    </div>
                )}
            </Card>
        </div>
    );
};
