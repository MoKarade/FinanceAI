
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Transaction, BudgetCategory, CategorizationRule } from '../types';
import { showToast } from './ui/Toast';
// Phase 4 A3: bascule sur services/claude.ts (Haiku 4.5 pour vitesse)
import { categorizeBatch } from '../services/claude';
import { Card } from './ui/Card';
import { EmptyState } from './ui/EmptyState';
import { PageHeader } from './ui/PageHeader';

interface TransactionsProps {
    transactions: Transaction[];
    setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
    apiKey: string;
    budgetItems: BudgetCategory[];
    categorizationRules?: CategorizationRule[];
    setCategorizationRules?: (rules: CategorizationRule[]) => void;
}

export const Transactions: React.FC<TransactionsProps> = ({
    transactions,
    setTransactions,
    apiKey,
    budgetItems,
    categorizationRules = [],
    setCategorizationRules,
}) => {
    const [processing, setProcessing] = useState(false);
    const [progressStatus, setProgressStatus] = useState({ current: 0, total: 0 });
    const [liveLogs, setLiveLogs] = useState<string[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);

    const [showWizard, setShowWizard] = useState(false);

    const [filterText, setFilterText] = useState('');
    const [showDuplicates, setShowDuplicates] = useState(false);
    const [dateStart, setDateStart] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [typeFilter, setTypeFilter] = useState<'All' | 'Income' | 'Expense' | 'Transfer'>('All');
    const [quickFilter, setQuickFilter] = useState<'NONE' | 'BIG_SPEND' | 'RECENT' | 'TO_REVIEW'>('NONE');

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
        return Array.from(new Set([...budgetNames, ...systemCats])).sort();
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

            if (dateStart && t.date < dateStart) return false;
            if (selectedCategory !== 'All' && t.category !== selectedCategory) return false;
            if (typeFilter === 'Transfer' && !t.isTransfer) return false;
            if (typeFilter === 'Income' && (t.amount < 0 || t.isTransfer)) return false;
            if (typeFilter === 'Expense' && (t.amount > 0 || t.isTransfer)) return false;

            return true;
        });
    }, [transactions, filterText, showDuplicates, dateStart, selectedCategory, typeFilter, quickFilter]);

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

    const handleAutoCategorizeAll = async () => {
        setProcessing(true);
        setLiveLogs(['Demarrage de l\'analyse...']);
        setProgressStatus({ current: 0, total: 0 });

        let targetTxs: Transaction[] = [];
        if (selectedIds.size > 0) {
            targetTxs = transactions.filter(t => selectedIds.has(t.id));
        } else {
            targetTxs = transactions.filter(t =>
                !t.isDuplicate &&
                (t.category === 'Uncategorized' || t.category === '' || t.category === 'Unknown' || t.category === 'Inconnu')
            );
        }

        if (targetTxs.length === 0) {
            targetTxs = transactions.filter(t => !t.isDuplicate && t.category === 'Autre');
            if (targetTxs.length === 0) {
                showToast("Tout semble deja classe ! Utilisez le mode manuel si besoin.", "info");
                setProcessing(false);
                return;
            }
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
            console.error('[Transactions] Categorisation batch failed:', e);
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
    const paginatedTransactions = filteredTransactions.slice(
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
        if (!score) return 'bg-gray-700';
        if (score >= 90) return 'bg-green-500';
        if (score >= 70) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    return (
        <div className="space-y-6 relative">

            <PageHeader
                icon="💳"
                title="Transactions"
                subtitle={`${transactions.length} transactions au total · ${uncategorizedGroups.length} groupe(s) à classer`}
                actions={
                    transactions.length > 0 ? (
                        <button
                            type="button"
                            onClick={async () => {
                                const { exportTransactionsCSV, downloadCSV, dateForFilename } = await import('../utils/csvExport');
                                downloadCSV(`transactions-${dateForFilename()}`, exportTransactionsCSV(transactions));
                            }}
                            className="px-3 py-1.5 bg-info-500/15 hover:bg-info-500/25 border border-info-500/30 rounded-card text-info-300 text-tiny font-bold transition-colors focus-ring"
                            title="Exporter toutes les transactions en CSV"
                        >
                            📊 Export CSV
                        </button>
                    ) : null
                }
            />

            <div className="rounded-xl border border-indigo-500/20 bg-indigo-900/10">
                <button
                    onClick={() => setShowRulesPanel(p => !p)}
                    aria-expanded={showRulesPanel}
                    className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-indigo-300 hover:text-white transition-colors"
                >
                    <span className="flex items-center gap-2">
                        <span aria-hidden="true">⚡</span>
                        Regles de Categorisation Automatiques
                        <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">{categorizationRules.length}</span>
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
                                className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-indigo-400 outline-none"
                            />
                            <select
                                value={newRuleCategory}
                                onChange={e => setNewRuleCategory(e.target.value)}
                                aria-label="Categorie a appliquer"
                                className="bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-indigo-400 outline-none"
                            >
                                <option value="">-- Categorie --</option>
                                {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <button
                                onClick={handleAddRule}
                                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors"
                            >
                                + Ajouter
                            </button>
                        </div>

                        {categorizationRules.length === 0 ? (
                            <p className="text-tiny text-gray-600 text-center py-2">Aucune regle. Creez-en une pour categoriser automatiquement.</p>
                        ) : (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                                {categorizationRules.map(rule => (
                                    <div key={rule.id} className="flex items-center gap-2 bg-black/30 px-3 py-2 rounded-lg border border-white/5 text-xs group">
                                        <span className="text-indigo-300 font-bold flex-1 truncate">"{rule.pattern}"</span>
                                        <span className="text-gray-500 hidden sm:inline" aria-hidden="true">-&gt;</span>
                                        <span className="text-white bg-indigo-900/40 px-2 py-0.5 rounded font-bold truncate max-w-[120px]">{rule.category}</span>
                                        <button onClick={() => handleApplyRuleNow(rule)} aria-label={`Appliquer la regle ${rule.pattern}`} className="md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 text-green-400 hover:text-green-300 transition-all text-tiny font-bold ml-1">Appliquer</button>
                                        <button onClick={() => handleDeleteRule(rule.id)} aria-label={`Supprimer la regle ${rule.pattern}`} className="md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 text-red-400 hover:text-red-300 transition-all ml-1">✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showWizard && (
                <div role="dialog" aria-modal="true" aria-labelledby="wizard-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
                    <div className="bg-[#151922] border border-white/10 w-full max-w-4xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col">
                        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-blue-900/20 to-transparent rounded-t-2xl">
                            <div>
                                <h2 id="wizard-title" className="text-xl font-bold text-white flex items-center gap-2">
                                    Assistant de Classement
                                </h2>
                                <p className="text-xs text-gray-400 mt-1">
                                    L'IA a laisse {uncategorizedGroups.length} groupes incertains. Classez-les en masse ici.
                                </p>
                            </div>
                            <button onClick={() => setShowWizard(false)} aria-label="Fermer l'assistant" className="text-gray-400 hover:text-white px-3 py-1 bg-white/10 rounded">Terminer</button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-2 custom-scrollbar">
                            {uncategorizedGroups.length === 0 ? (
                                <div className="text-center py-20">
                                    <div className="text-4xl mb-2" aria-hidden="true">🎉</div>
                                    <h3 className="text-white font-bold">Tout est propre !</h3>
                                    <p className="text-gray-500 text-sm">Plus aucune transaction inconnue.</p>
                                </div>
                            ) : (
                                uncategorizedGroups.map((group) => (
                                    <div key={group.payee} className="flex flex-col md:flex-row items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/5 hover:border-primary/30 transition-colors">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="font-bold text-white text-lg">{group.payee}</div>
                                                <div className="bg-red-500/20 text-red-300 text-tiny px-2 py-0.5 rounded-full font-bold">
                                                    {group.count} trans.
                                                </div>
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                Total: <span className="text-white font-mono">{group.total.toFixed(2)}$</span>
                                            </div>
                                        </div>

                                        <div className="w-full md:w-auto flex gap-2">
                                            <select
                                                aria-label={`Categorie pour ${group.payee}`}
                                                className="bg-black border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none min-w-[180px]"
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
                        <div className={`text-tiny sm:text-xs font-bold px-2 py-1 rounded border border-white/10 whitespace-nowrap ${filteredSum > 0 ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                            Σ {filteredSum.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}
                        </div>
                        <button
                            onClick={handleExportCSV}
                            title="Exporter en CSV (compatible Excel)"
                            aria-label="Exporter en CSV"
                            className="text-tiny sm:text-xs flex items-center gap-1 text-green-300 hover:text-white border border-green-500/30 bg-green-500/10 px-2 sm:px-3 py-1.5 rounded-lg transition-colors font-bold"
                        >
                            CSV
                        </button>
                        <button
                            onClick={() => setShowWizard(true)}
                            aria-label={`Ouvrir l'assistant de classement (${uncategorizedGroups.length} groupes)`}
                            className="text-tiny sm:text-xs flex items-center gap-1 text-blue-300 hover:text-white border border-blue-500/30 bg-blue-500/10 px-2 sm:px-3 py-1.5 rounded-lg transition-colors font-bold whitespace-nowrap"
                        >
                            <span className="hidden sm:inline">Assistant </span>({uncategorizedGroups.length})
                        </button>
                    </div>
                }
            >
                <div className="flex flex-col gap-3 mb-4">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true">🔍</span>
                            <input
                                type="text"
                                placeholder="Rechercher..."
                                aria-label="Rechercher dans les transactions"
                                className="w-full bg-[#1e2330] border border-border rounded-full pl-9 pr-3 py-2 text-sm text-white focus:border-primary outline-none shadow-inner"
                                value={filterText}
                                onChange={(e) => { setFilterText(e.target.value); setCurrentPage(1); }}
                            />
                        </div>
                        <button
                            onClick={handleAutoCategorizeAll}
                            disabled={processing}
                            aria-label={processing ? 'Scan IA en cours' : 'Demarrer le scan IA'}
                            className={`px-3 sm:px-4 py-2 rounded-full text-xs font-bold text-white shadow-lg transition-all active:scale-95 flex items-center gap-2 whitespace-nowrap ${processing ? 'bg-gray-600 cursor-not-allowed' : apiKey ? 'bg-gradient-to-r from-secondary to-purple-500 hover:brightness-110' : 'bg-gray-700'
                                }`}
                        >
                            <span aria-hidden="true">{processing ? '⚙️' : '⚡'}</span>
                            <span className="hidden sm:inline">{processing ? 'Scan en cours...' : 'IA Auto-Scan'}</span>
                            <span className="sm:hidden">{processing ? 'Scan' : 'IA'}</span>
                        </button>
                    </div>

                    {processing && (
                        <div role="status" aria-live="polite" className="bg-black/80 border border-green-500/30 rounded-lg p-3 font-mono text-tiny text-green-400 h-32 overflow-y-auto custom-scrollbar flex flex-col-reverse shadow-inner">
                            <div ref={logsEndRef} />
                            {liveLogs.map((log, i) => (
                                <div key={i} className="opacity-90">{`> ${log}`}</div>
                            ))}
                            <div className="sticky bottom-0 bg-black/90 pb-2 border-t border-green-500/20 pt-2 flex items-center justify-between">
                                <span className="animate-pulse">TRAITEMENT IA (Claude Sonnet 4.6)...</span>
                                <span>{progressStatus.current}/{progressStatus.total}</span>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-2 px-2">
                        <button
                            onClick={() => setQuickFilter(quickFilter === 'TO_REVIEW' ? 'NONE' : 'TO_REVIEW')}
                            aria-pressed={quickFilter === 'TO_REVIEW'}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border whitespace-nowrap ${quickFilter === 'TO_REVIEW' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-300' : 'bg-white/5 border-white/10 text-gray-400'}`}
                        >
                            A Verifier
                        </button>
                        <select
                            aria-label="Filtre par categorie"
                            className={`appearance-none px-4 py-1.5 rounded-full text-xs font-medium border transition-colors max-w-[150px] truncate ${selectedCategory !== 'All' ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-white/10 text-gray-300'}`}
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
                            <tr className="border-b border-border text-gray-400 text-xs uppercase tracking-wider">
                                <th className="p-3 w-8">
                                    <input
                                        type="checkbox"
                                        aria-label="Selectionner toutes les transactions de la page"
                                        className="rounded bg-[#1e2330] border-gray-600"
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
                                <th className="p-3">Date</th>
                                <th className="p-3">Marchand</th>
                                <th className="p-3 w-10">IA</th>
                                <th className="p-3">Type</th>
                                <th className="p-3">Montant</th>
                                <th className="p-3">Categorie</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {paginatedTransactions.map((t) => (
                                <tr
                                    key={t.id}
                                    className={`border-b border-border/50 transition-colors ${selectedIds.has(t.id) ? 'bg-primary/10' : 'hover:bg-white/5'} ${t.category === 'Inconnu' ? 'bg-red-900/10' : ''}`}
                                    onClick={(e) => { if ((e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'SELECT') handleSelectOne(t.id, e.shiftKey); }}
                                >
                                    <td className="p-3"><input type="checkbox" checked={selectedIds.has(t.id)} readOnly aria-label={`Selectionner ${t.payee}`} className="rounded bg-[#1e2330]" /></td>
                                    <td className="p-3 text-gray-400 whitespace-nowrap">{t.date}</td>
                                    <td className="p-3 font-medium text-white">{t.payee}</td>

                                    <td className="p-3">
                                        {t.confidence !== undefined && (
                                            <div
                                                className={`w-2 h-2 rounded-full ${getConfidenceColor(t.confidence)}`}
                                                title={`Confiance IA: ${t.confidence}%`}
                                                aria-label={`Confiance IA ${t.confidence}%`}
                                            ></div>
                                        )}
                                    </td>

                                    <td className="p-3">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleTransfer(t.id); }}
                                            aria-pressed={t.isTransfer}
                                            className={`text-tiny px-2 py-0.5 rounded border transition-colors ${t.isTransfer ? 'bg-blue-500/20 border-blue-500 text-blue-300' : 'bg-white/5 border-white/10 text-gray-500 hover:text-white'}`}
                                        >
                                            {t.isTransfer ? 'Transfert' : 'Transaction'}
                                        </button>
                                    </td>

                                    <td className={`p-3 font-bold privacy-blur ${t.isTransfer ? 'text-blue-300 opacity-70' : t.amount > 0 ? 'text-green-400' : 'text-gray-200'}`}>
                                        {t.amount.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}
                                    </td>

                                    <td className="p-3">
                                        <select
                                            aria-label={`Categorie de ${t.payee}`}
                                            className={`bg-[#1e2330] border border-gray-600 rounded px-2 py-1 text-xs text-white focus:border-primary outline-none cursor-pointer w-full max-w-[180px] ${(t.category === 'Uncategorized' || t.category === 'Inconnu') ? 'border-red-500/50 text-red-300' : ''
                                                }`}
                                            value={t.category}
                                            onChange={(e) => updateCategory(t.id, e.target.value)}
                                            onClick={e => e.stopPropagation()}
                                        >
                                            {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </td>
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
                                icon="🔍"
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
                                className={`rounded-xl border p-3 transition-colors ${isSelected ? 'border-primary/50 bg-primary/10' : isUncat ? 'border-red-500/30 bg-red-900/10' : 'border-white/5 bg-white/[0.03]'
                                    }`}
                            >
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="flex items-start gap-2 min-w-0 flex-1">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={(e) => { e.stopPropagation(); handleSelectOne(t.id, false); }}
                                            aria-label={`Selectionner ${t.payee}`}
                                            className="mt-1 rounded bg-[#1e2330] flex-shrink-0"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-semibold text-white text-sm truncate">{t.payee}</span>
                                                {t.confidence !== undefined && (
                                                    <span
                                                        className={`w-2 h-2 rounded-full flex-shrink-0 ${getConfidenceColor(t.confidence)}`}
                                                        title={`Confiance IA: ${t.confidence}%`}
                                                        aria-label={`Confiance IA ${t.confidence}%`}
                                                    ></span>
                                                )}
                                            </div>
                                            <div className="text-tiny text-gray-500 mt-0.5">{t.date}</div>
                                        </div>
                                    </div>
                                    <div className={`font-bold text-sm privacy-blur whitespace-nowrap ${t.isTransfer ? 'text-blue-300 opacity-70' : t.amount > 0 ? 'text-green-400' : 'text-gray-200'
                                        }`}>
                                        {t.amount.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <select
                                        aria-label={`Categorie de ${t.payee}`}
                                        className={`flex-1 bg-[#1e2330] border rounded px-2 py-1.5 text-xs text-white focus:border-primary outline-none cursor-pointer ${isUncat ? 'border-red-500/50 text-red-300' : 'border-gray-600'
                                            }`}
                                        value={t.category}
                                        onChange={(e) => updateCategory(t.id, e.target.value)}
                                    >
                                        {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <button
                                        onClick={() => toggleTransfer(t.id)}
                                        aria-pressed={t.isTransfer}
                                        className={`text-tiny px-2 py-1.5 rounded border transition-colors whitespace-nowrap ${t.isTransfer ? 'bg-blue-500/20 border-blue-500 text-blue-300' : 'bg-white/5 border-white/10 text-gray-400'
                                            }`}
                                    >
                                        {t.isTransfer ? '⇄ Tx' : 'Tx'}
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>

                {totalPages > 1 && (
                    <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/5">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="text-xs px-3 py-1 bg-white/10 rounded disabled:opacity-30">Precedent</button>
                        <span className="text-xs text-gray-500">Page {currentPage} / {totalPages}</span>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="text-xs px-3 py-1 bg-white/10 rounded disabled:opacity-30">Suivant</button>
                    </div>
                )}
            </Card>
        </div>
    );
};
