
import React, { useState, useMemo, useEffect, useRef } from 'react';
// [PRIV-PAYEE-MODE-DISCRET] Le nom du marchand est de la donnée personnelle (décision Marc
// 2026-08-17) : masqué en mode discret comme les montants, y compris dans les ATTRIBUTS.
import { PrivateText } from './ui/PrivateText';
import { PrivateSelect } from './ui/PrivateSelect';
import { maskPayee, maskCategory, rowControlLabel } from '../utils/privacyAria';
import { logError } from '../services/errorLogger';
import { Tab, Transaction, BudgetCategory, CategorizationRule } from '../types';
import { TAB_LABELS } from '../constants';
import { showToast } from './ui/Toast';
// Phase 4 A3: bascule sur services/claude.ts (Haiku 4.5 pour vitesse)
import { categorizeBatch, CATEGORIZE_MODEL_ID } from '../services/claude';
import { modelLabelFromId } from '../services/aiChat/models';
import { RULE_CATEGORIES } from '../services/import/categoryRules';
// [TX-CATEGORIZE] La catégorie « Abonnements » ne se décide plus sur le seul libellé : chez un
// marchand de plateforme (Steam, App Store…), seul le profil de récurrence distingue un achat
// unique d'un abonnement. Modules PURS et légers.
import { buildMerchantProfiles } from '../services/transactions/merchantProfile';
import { contextualCategorize } from '../services/transactions/contextualCategorize';
import { EmptyState } from './ui/EmptyState';
import { PageHeader } from './ui/PageHeader';
import { Icon } from './ui/Icon';
import { ImportBankStatement } from './import/ImportBankStatement';
import { PrivateAmount } from './ui/PrivateAmount';
import { useFinanceStore } from '../store/useFinanceStore';
import { usePendingFocus } from '../utils/usePendingFocus';
import { formatCAD, formatSigned } from '../utils/format';
import { couleurCategorie } from './transactions/couleursCategories';
import { useViewportBelowLg } from '../hooks/useViewportBelowLg';
import { DuplicatesPanel } from './transactions/DuplicatesPanel';
import { TransfersPanel } from './transactions/TransfersPanel';
import { CategoryReviewPanel } from './transactions/CategoryReviewPanel';
import { markTransactionsAsDuplicate, unmarkTransactionsAsDuplicate } from '../services/transactions/duplicateDetection';
import { isCoupleMode } from '../services/couple/netWorthByOwner';

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
    // [PRIV-PAYEE-MODE-DISCRET] Lu ICI plutôt que passé en prop : le masquage doit suivre le mode
    // en direct, sans dépendre d'un appelant qui aurait oublié de propager le drapeau.
    const isPrivacyMode = useFinanceStore(s => s.isPrivacyMode);
    // [TX-REVIEW] Revue d'échantillon persistée (graine + jugements) — l'échantillon ne doit pas
    // changer entre deux ouvertures, sinon le dénominateur du taux ne veut plus rien dire.
    const categoryReview = useFinanceStore(s => s.categoryReview);
    const setAppState = useFinanceStore(s => s.setAppState);
    // [REFONTE-NAV-L5] Cross-link vers le Budget (« Voir au budget » sur la catégorie filtrée).
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);
    const pendingFocus = useFinanceStore(s => s.pendingFocus);
    const coupleUsers = config?.users ?? [];
    const isCouple = isCoupleMode(coupleUsers); // [COUPLE-PREDICAT-COPIES] source unique
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
    // [REFONTE-NAV-L5] Deep-link Budget → Transactions (« Voir les transactions » d'un poste) :
    // on arrive DÉJÀ filtré sur la catégorie ciblée (section `category:<nom>`, patron Settings).
    const [selectedCategory, setSelectedCategory] = useState<string>(() => {
        if (pendingFocus && pendingFocus.tab === Tab.TRANSACTIONS && Date.now() <= pendingFocus.expiresAt
            && pendingFocus.section?.startsWith('category:')) {
            return pendingFocus.section.slice('category:'.length);
        }
        return 'All';
    });
    // Consomme pendingFocus + scroll vers l'historique filtré (one-shot).
    usePendingFocus(Tab.TRANSACTIONS);
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

    // [S5-REFONTE-TRANSACTIONS] « Afficher plus » (maquettes) remplace la pagination : 16 lignes au
    // bureau, 10 sur mobile, puis autant à chaque clic. Toute nouvelle vue (filtre, recherche) repart du début.
    const etroit = useViewportBelowLg();
    const pas = etroit ? 10 : 16;
    const [plus, setPlus] = useState(0);
    const [importOuvert, setImportOuvert] = useState(transactions.length === 0);
    const [outil, setOutil] = useState<null | 'doublons' | 'virements' | 'qualite' | 'regles' | 'selection'>(null);
    const modeSelection = outil === 'selection';
    const [masquerVirements, setMasquerVirements] = useState(false);

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

    // [TX-TRANSFERS] Marque les deux côtés d'un virement interne : catégorie « Transfert » (comme le
    // choix « Transfert » dans la pastille de catégorie), `originalCategory` préservée — une seule
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
        showToast(`Règle ajoutée : « ${maskPayee(rule.pattern, isPrivacyMode)} » → ${maskCategory(rule.category, isPrivacyMode)}`, 'success');
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
            if (masquerVirements && t.isTransfer) return false;

            const searchMatch = filterText === '' ||
                (t.payee || '').toLowerCase().includes(filterText.toLowerCase()) ||
                (t.category || '').toLowerCase().includes(filterText.toLowerCase());
            if (!searchMatch) return false;

            if (selectedCategory !== 'All' && t.category !== selectedCategory) return false;

            return true;
        });
    }, [transactions, filterText, showDuplicates, selectedCategory, quickFilter, masquerVirements]);

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

    // [REFONTE-NAV-L5] Calculé en PERMANENCE (plus gaté sur showWizard) : le sous-titre du header
    // et le bouton « Assistant (N) » affichaient « 0 groupe à classer » tant que l'assistant
    // n'avait pas été OUVERT — un compte réel figé à 0 est un faux chiffre (no-fake-data).
    const uncategorizedGroups = useMemo(() => {
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
    }, [transactions]);

    const handleWizardApply = (ids: number[], newCat: string) => {
        const idSet = new Set(ids);
        const updated = transactions.map(t =>
            idSet.has(t.id) ? { ...t, category: newCat, status: 'processed' as const, confidence: 100 } : t
        );
        setTransactions(updated);
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
        // [TX-STALE-MODEL-LABEL] Libellé DÉRIVÉ du modèle réellement employé par `categorizeBatch`
        // (Haiku depuis la bascule) — le texte en dur affichait encore « Claude Sonnet 4.6 ».
        setLiveLogs(prev => [...prev, `${targetTxs.length} transactions ciblees.`, `Modele: ${modelLabelFromId(CATEGORIZE_MODEL_ID)}`]);

        try {
            await categorizeBatch(
                targetTxs,
                apiKey,
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

    const visiblesTx = sortedTransactions.slice(0, pas * (plus + 1));

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

    // [REFONTE-NAV-L5] Une SEULE dérivation CSV (utils/csvExport, RFC 4180) pour les DEUX exports
    // (tout l'historique depuis le header / la vue filtrée-triée ici) — l'ancien builder local
    // dupliquait le format avec un jeu de colonnes divergent (consolidation, pas de 2e dérivation).
    /**
     * Les DEUX boutons d'export partagent exactement le même traitement de refus — il y vivait en
     * double, et le second aurait été oublié en ajoutant la règle « données fictives » (c'est
     * précisément ce qui est arrivé au mode discret sur les presets voisins de `csvExport`).
     * Rend `true` si le refus a été traité ; `false` laisse l'appelant relancer une vraie panne.
     */
    const refusExportCsvTraite = (e: unknown): boolean => {
        if (!(e instanceof Error)) return false;
        if (e.name === 'CsvRefusedPrivacyError') {
            showToast('Export CSV refusé : le mode discret est actif. Le fichier contiendrait tes marchands et tes montants en clair.', 'info');
            return true;
        }
        if (e.name === 'CsvRefusedTestModeError') {
            // Le message nomme l'ISSUE (revenir aux données réelles) — jamais « réessaie » :
            // aucun nouvel essai ne réussira tant que le mode est actif.
            showToast("Export CSV refusé : l’app affiche des données fictives (mode test / bac à sable). Le fichier aurait l’allure de vraies transactions. Reviens aux données réelles pour l’exporter.", 'info');
            return true;
        }
        return false;
    };

    const handleExportFilteredCSV = async () => {
        const { exportTransactionsCSV, downloadCSV, dateForFilename } = await import('../utils/csvExport');
        try {
            downloadCSV(`transactions-filtrees-${dateForFilename()}`, exportTransactionsCSV(sortedTransactions));
        } catch (e) {
            if (refusExportCsvTraite(e)) return;
            throw e;
        }
    };

    // [S5-REFONTE-TRANSACTIONS] Écran des maquettes E/M-transactions : barre de recherche et de
    // filtres, tableau (liste par jour sur mobile), à droite le mois en cours, les outils et les
    // groupes à classer. Les outils (doublons, virements, qualité, règles, sélection) s'ouvrent en
    // panneau au-dessus de la liste.
    const vueFiltree = (fn: () => void) => { fn(); setPlus(0); };
    const aVerifier = transactions.filter((t) => !t.isDuplicate && (t.category === 'Uncategorized' || t.category === 'Autre' || t.category === 'Inconnu')).length;
    const moisCourant = (() => {
        const d = new Date();
        const prefixe = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        let entrees = 0; let sorties = 0;
        for (const t of transactions) {
            if (t.isTransfer || t.isDuplicate || !(t.date || '').startsWith(prefixe)) continue;
            if (t.amount > 0) entrees += t.amount; else sorties += t.amount;
        }
        const libelle = d.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' });
        return { libelle: libelle.charAt(0).toUpperCase() + libelle.slice(1), entrees, sorties };
    })();
    const OUTILS: ReadonlyArray<{ id: NonNullable<typeof outil>; libelle: string; compte?: number }> = [
        { id: 'doublons', libelle: 'Doublons' },
        { id: 'virements', libelle: 'Virements internes' },
        { id: 'qualite', libelle: 'Qualité du classement' },
        { id: 'regles', libelle: 'Règles automatiques', compte: categorizationRules.length },
        { id: 'selection', libelle: 'Sélectionner des lignes' },
    ];
    const titreOutil = OUTILS.find((o) => o.id === outil)?.libelle;
    const exporterTout = async () => {
        const { exportTransactionsCSV, downloadCSV, dateForFilename } = await import('../utils/csvExport');
        try {
            downloadCSV(`transactions-${dateForFilename()}`, exportTransactionsCSV(transactions));
        } catch (e) {
            if (refusExportCsvTraite(e)) return;
            throw e;
        }
    };
    const ligneOutil = 'w-full min-h-12 px-4 lg:px-5 flex items-center justify-between gap-3 border-t border-white/5 text-body text-ink-100 text-left hover:bg-white/3 focus-ring';
    const pastille = 'h-10 px-3.5 rounded-full border text-[13px] whitespace-nowrap transition-colors focus-ring shrink-0';
    const signe = (n: number) => (n > 0 ? '+' : '');
    // Jours de la liste mobile (maquette : « mar. 15 sept. » + total du jour).
    const jours: Array<{ date: string; libelle: string; total: number; lignes: Transaction[] }> = [];
    for (const t of visiblesTx) {
        const dernier = jours[jours.length - 1];
        if (dernier && dernier.date === t.date) { dernier.lignes.push(t); if (!t.isTransfer) dernier.total += t.amount; continue; }
        const [y, m, dd] = (t.date || '').split('-').map(Number);
        const libelle = y && m && dd ? new Date(y, m - 1, dd).toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' }) : t.date;
        jours.push({ date: t.date, libelle, total: t.isTransfer ? 0 : t.amount, lignes: [t] });
    }

    const outils = (
        <section aria-labelledby="outils-tx-titre" className="rounded-2xl bg-surface border border-white/6 overflow-hidden">
            <h2 id="outils-tx-titre" className="px-4 lg:px-5 py-3 text-[11px] font-semibold tracking-[0.08em] uppercase text-ink-400">Outils</h2>
            {etroit && (
                <button type="button" onClick={() => { void handleAutoCategorizeAll('gaps'); }} disabled={processing} className={`${ligneOutil} disabled:opacity-50`}>
                    {processing ? 'Catégorisation…' : 'Auto-catégoriser'}<span className="text-ink-400" aria-hidden="true">›</span>
                </button>
            )}
            {OUTILS.map((o) => (
                <button
                    key={o.id}
                    type="button"
                    onClick={() => setOutil(outil === o.id ? null : o.id)}
                    aria-expanded={outil === o.id}
                    className={ligneOutil}
                >
                    {o.libelle}
                    <span className="flex items-center gap-2 text-ink-400">{o.compte !== undefined && <span className="font-mono text-meta">{o.compte}</span>}<span aria-hidden="true">›</span></span>
                </button>
            ))}
            {/* [TX-CATEGORIZE] Passe sur TOUT l'historique (demande Marc). Les catégories
                existantes sont réécrites — SAUF les corrections manuelles, verrouillées. */}
            <button
                type="button"
                onClick={() => { void handleAutoCategorizeAll('all'); }}
                disabled={processing}
                aria-label="Recatégoriser tout l'historique (les corrections manuelles sont conservées)"
                className={`${ligneOutil} disabled:opacity-50`}
            >
                Tout recatégoriser<span className="text-ink-400" aria-hidden="true">›</span>
            </button>
            {filteredTransactions.length > 0 && (
                <button type="button" onClick={() => { void handleExportFilteredCSV(); }} aria-label="Exporter la vue filtrée en CSV" className={ligneOutil}>
                    Exporter la vue filtrée<span className="text-ink-400" aria-hidden="true">›</span>
                </button>
            )}
            {etroit && transactions.length > 0 && (
                <button type="button" onClick={() => { void exporterTout(); }} className={ligneOutil}>
                    Exporter CSV<span className="text-ink-400" aria-hidden="true">›</span>
                </button>
            )}
        </section>
    );
    const resumeMois = (
        <section aria-labelledby="mois-tx-titre" className="rounded-2xl bg-surface border border-white/6 p-4 lg:p-5 flex flex-col gap-2.5">
            <h2 id="mois-tx-titre" className="text-[17px] font-semibold text-ink-50">{moisCourant.libelle}</h2>
            <dl className={etroit ? 'grid grid-cols-3 gap-2' : 'flex flex-col gap-2.5 text-body'}>
                <div className={etroit ? 'flex flex-col gap-0.5' : 'flex justify-between gap-3'}><dt className="text-meta lg:text-body text-ink-400 lg:text-ink-300">Entrées</dt><dd><PrivateAmount className="font-mono font-bold lg:font-normal text-success-400">{`${signe(moisCourant.entrees)}${formatCAD(moisCourant.entrees)}`}</PrivateAmount></dd></div>
                <div className={etroit ? 'flex flex-col gap-0.5' : 'flex justify-between gap-3'}><dt className="text-meta lg:text-body text-ink-400 lg:text-ink-300">Sorties</dt><dd><PrivateAmount className="font-mono font-bold lg:font-normal text-ink-50 lg:text-danger-400">{formatCAD(moisCourant.sorties)}</PrivateAmount></dd></div>
                <div className={etroit ? 'flex flex-col gap-0.5' : 'flex justify-between gap-3 pt-2.5 border-t border-white/6 font-semibold'}><dt className="text-meta lg:text-body text-ink-400 lg:text-ink-50">Restant</dt><dd><PrivateAmount className="font-mono font-bold text-ink-50">{formatCAD(moisCourant.entrees + moisCourant.sorties)}</PrivateAmount></dd></div>
            </dl>
        </section>
    );
    const aClasser = uncategorizedGroups.length > 0 && (
        <section aria-labelledby="a-classer-titre" className={`rounded-2xl border border-warning-400/35 bg-warning-500/6 p-4 lg:p-5 flex ${etroit ? 'items-center justify-between gap-3' : 'flex-col gap-3'}`}>
            <div className="flex flex-col gap-1 min-w-0">
                <h2 id="a-classer-titre" className="text-body font-semibold text-warning-400">{uncategorizedGroups.length} groupe{uncategorizedGroups.length > 1 ? 's' : ''} à classer</h2>
                <p className="text-meta text-ink-300">Choisis une catégorie par groupe de transactions semblables : tout le groupe la prend.</p>
            </div>
            <button
                type="button"
                onClick={() => setShowWizard(true)}
                aria-label={`Ouvrir l'assistant de classement (${uncategorizedGroups.length} groupes)`}
                className={etroit ? 'shrink-0 h-10 px-4 rounded-lg bg-warning-400 text-dark text-body font-bold focus-ring' : 'h-11 rounded-lg border border-warning-400/60 text-warning-400 text-body font-semibold hover:bg-warning-500/10 focus-ring'}
            >
                {etroit ? 'Classer' : 'Classer maintenant'}
            </button>
        </section>
    );

    return (
        <div className="space-y-5 relative stagger-in">

            <PageHeader
                // [REFONTE-NAV-L5] Titre = TAB_LABELS (cohérence des en-têtes de la destination).
                title={TAB_LABELS[Tab.TRANSACTIONS]}
                badge={<span className="text-meta lg:text-body text-ink-400">{transactions.length} transactions · {uncategorizedGroups.length} groupe{uncategorizedGroups.length > 1 ? 's' : ''} à classer</span>}
                actions={
                    <span className="flex items-center gap-2">
                        {onImport && (
                            <button
                                type="button"
                                onClick={() => setImportOuvert((o) => !o)}
                                aria-expanded={importOuvert}
                                className="h-10 px-3.5 lg:px-4 rounded-lg border border-white/40 text-body text-ink-100 hover:bg-white/5 focus-ring"
                            >
                                {etroit ? 'Importer' : 'Importer CSV / PDF'}
                            </button>
                        )}
                        {!etroit && transactions.length > 0 && (
                            <button
                                type="button"
                                onClick={() => { void exporterTout(); }}
                                className="h-10 px-4 rounded-lg border border-white/40 text-body text-ink-100 hover:bg-white/5 focus-ring"
                                title="Exporter toutes les transactions en CSV"
                            >
                                Exporter CSV
                            </button>
                        )}
                        {!etroit && (
                            <button
                                type="button"
                                onClick={() => { void handleAutoCategorizeAll('gaps'); }}
                                disabled={processing}
                                aria-label={processing ? 'Scan IA en cours' : 'Demarrer le scan IA'}
                                className="h-10 px-4 rounded-lg bg-primary text-dark text-body font-bold hover:bg-white disabled:opacity-60 focus-ring"
                            >
                                {processing ? 'Catégorisation…' : 'Auto-catégoriser'}
                            </button>
                        )}
                    </span>
                }
            />

            {/* [FINTABLE-4] Import manuel — repli JAMAIS supprimé (seul chemin quand Fintable/Plaid
                est indisponible), hors du flux principal : le bouton « Importer » de l'en-tête l'ouvre.
                Ouvert d'emblée UNIQUEMENT à l'onboarding (aucune transaction, D2 activation — l'écran
                vide ne doit jamais être une impasse). */}
            {onImport && importOuvert && (
                <section aria-labelledby="import-tx-titre" className="rounded-2xl bg-surface border border-white/6 p-4 lg:p-5 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                        <h2 id="import-tx-titre" className="text-body font-semibold text-ink-50">Import manuel (repli — CSV/PDF)</h2>
                        {transactions.length > 0 && <button type="button" onClick={() => setImportOuvert(false)} className="min-h-11 px-2 text-meta text-ink-300 underline underline-offset-2 focus-ring rounded-sm">Fermer</button>}
                    </div>
                    <ImportBankStatement onImport={onImport} apiKey={apiKey} />
                </section>
            )}

            {showWizard && (
                <div role="dialog" aria-modal="true" aria-labelledby="wizard-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
                    <div className="bg-surface border border-white/10 w-full max-w-4xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col">
                        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/3 rounded-t-2xl">
                            <div>
                                <h2 id="wizard-title" className="text-xl font-bold text-white flex items-center gap-2">
                                    Assistant de Classement
                                </h2>
                                <p className="text-meta text-ink-300 mt-1">
                                    L'IA a laisse {uncategorizedGroups.length} groupes incertains. Classez-les en masse ici.
                                </p>
                            </div>
                            <button onClick={() => setShowWizard(false)} aria-label="Fermer l'assistant" className="text-ink-300 hover:text-white px-3 py-1 bg-white/10 rounded-sm">Terminer</button>
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
                                                <PrivateText as="div" className="font-bold text-white text-lg">{group.payee}</PrivateText>
                                                <div className="bg-danger-500/20 text-red-300 text-tiny px-2 py-0.5 rounded-full font-bold">
                                                    {group.count} trans.
                                                </div>
                                            </div>
                                            <div className="text-meta text-ink-300">
                                                {/* [A11Y-PRIVACY-TXN-TOTALS] Les montants par LIGNE étaient masqués, pas les agrégats — or le
                                                    total d'un marchand est aussi révélateur qu'une ligne. */}
                                                Total: <PrivateAmount className="text-white font-mono">{formatCAD(group.total, { decimals: 2 })}</PrivateAmount>
                                            </div>
                                        </div>

                                        <div className="w-full md:w-auto flex gap-2">
                                            <select
                                                aria-label={`Catégorie pour ${maskPayee(group.payee, isPrivacyMode)}`}
                                                className="bg-black border border-white/10 rounded-lg px-3 py-2 text-body text-white focus:border-primary outline-hidden min-w-[180px]"
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

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
                <div className="flex flex-col gap-4 min-w-0">
                    {outil && (
                        <section aria-label={titreOutil} className="rounded-2xl bg-surface border border-white/6 p-4 lg:p-5 flex flex-col gap-3">
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="text-body font-semibold text-ink-50">{titreOutil}</h2>
                                <button type="button" onClick={() => setOutil(null)} className="min-h-11 px-2 text-meta text-ink-300 underline underline-offset-2 focus-ring rounded-sm">Fermer</button>
                            </div>
                            {/* [TX-DUPLICATES] Détection de doublons — propose, ne marque jamais d'office. */}
                            {outil === 'doublons' && (
                                <DuplicatesPanel integre transactions={transactions} markedCount={markedDuplicateCount} onMarkDuplicates={handleMarkDuplicates} onUnmarkAll={handleUnmarkAllDuplicates} />
                            )}
                            {/* [TX-TRANSFERS] Virements internes — marque d'office ce qui est PROUVÉ (deux comptes
                                connus et différents), fait confirmer le reste. */}
                            {outil === 'virements' && <TransfersPanel integre transactions={transactions} onMarkTransfers={handleMarkTransfers} />}
                            {/* [TX-REVIEW] Mesure du taux réel d'erreurs — le seul moyen de vérifier l'objectif. */}
                            {outil === 'qualite' && (
                                <CategoryReviewPanel
                                    integre
                                    transactions={transactions}
                                    review={categoryReview}
                                    onChange={(next) => setAppState({ categoryReview: next })}
                                    onFixCategory={(id) => {
                                        // Amène la transaction à l'écran pour la corriger : filtre sur son marchand.
                                        // ⚠️ [finding vie privée #645] PAS en mode discret : recopier le `payee` brut
                                        // dans `filterText` le rendrait en CLAIR dans l'attribut `value` du champ.
                                        const target = transactions.find((t) => t.id === id);
                                        if (target?.payee && !isPrivacyMode) vueFiltree(() => setFilterText(target.payee));
                                    }}
                                />
                            )}
                            {outil === 'regles' && (
                            <div className="space-y-3">
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                        type="text"
                                        placeholder="Texte du marchand (ex: Metro, Spotify...)"
                                        value={newPattern}
                                        onChange={e => setNewPattern(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddRule()}
                                        aria-label="Texte du marchand a matcher"
                                        className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-meta text-white focus:border-indigo-400 outline-hidden"
                                    />
                                    <select
                                        value={newRuleCategory}
                                        onChange={e => setNewRuleCategory(e.target.value)}
                                        aria-label="Categorie a appliquer"
                                        className="bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-meta text-white focus:border-indigo-400 outline-hidden"
                                    >
                                        <option value="">-- Categorie --</option>
                                        {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <button
                                        onClick={handleAddRule}
                                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-meta font-bold rounded-lg transition-colors"
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
                                                <PrivateText quoi="categorie" className="text-ink-100 bg-white/10 px-2 py-0.5 rounded-sm font-bold truncate max-w-[120px]">{rule.category}</PrivateText>
                                                <button onClick={() => handleApplyRuleNow(rule)} aria-label={`Appliquer la regle ${rule.pattern}`} className="md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 text-ink-300 hover:text-primary transition-all text-tiny font-bold ml-1">Appliquer</button>
                                                <button onClick={() => handleDeleteRule(rule.id)} aria-label={`Supprimer la regle ${rule.pattern}`} className="md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 inline-flex text-danger-400 hover:text-danger-500 transition-all ml-1 p-2 -m-1"><Icon name="close" size={13} /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            )}
                            {outil === 'selection' && (
                                <p className="text-meta text-ink-300">Coche des lignes dans la liste (Maj-clic pour une plage), puis exclus-les des calculs.</p>
                            )}
                        </section>
                    )}

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


                    {/* [REFONTE-NAV-L5] Ancre du deep-link Budget → Transactions : usePendingFocus scrolle
                        vers `category:<nom>` — l'attribut suit la catégorie filtrée (posée à l'arrivée). */}
                    <div data-focus-section={`category:${selectedCategory}`} className="flex flex-col gap-4">
                    <section aria-label="Historique des transactions" className={etroit ? 'flex flex-col gap-3' : 'rounded-2xl bg-surface border border-white/6 overflow-hidden'}>
                        <div className={etroit ? 'flex flex-col gap-3' : 'flex items-center gap-2.5 px-4 py-3.5 border-b border-white/5'}>
                            <label className={`flex items-center gap-2 h-10 px-3 rounded-[10px] bg-dark border border-white/8 text-ink-400 focus-within:border-white/30 ${etroit ? 'w-full' : 'flex-1 min-w-0'}`}>
                                <Icon name="search" size={16} />
                                <input
                                    type="search"
                                    placeholder="Rechercher un marchand, un montant…"
                                    aria-label="Rechercher dans les transactions"
                                    className="champ-nu flex-1 min-w-0 bg-transparent border-0 text-body text-ink-100 placeholder-ink-400 outline-hidden"
                                    value={filterText}
                                    onChange={(e) => vueFiltree(() => setFilterText(e.target.value))}
                                />
                            </label>
                            <div className={`flex items-center gap-2 ${etroit ? 'overflow-x-auto -mx-6 px-6 scrollbar-hide' : 'shrink-0'}`}>
                                <span className="relative shrink-0">
                                    <select
                                        aria-label="Filtre par categorie"
                                        className={`champ-nu appearance-none h-10 pl-3.5 pr-7 rounded-full border text-[13px] max-w-[180px] truncate cursor-pointer focus-ring ${selectedCategory !== 'All' ? 'bg-primary/15 border-primary/60 text-ink-50' : 'bg-surfaceHighlight border-white/10 text-ink-100'}`}
                                        value={selectedCategory}
                                        onChange={(e) => vueFiltree(() => setSelectedCategory(e.target.value))}
                                    >
                                        <option value="All">Toutes catégories</option>
                                        <option value="Uncategorized">À classer</option>
                                        <option value="Transfert">Transferts</option>
                                        {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-300" aria-hidden="true">▾</span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => vueFiltree(() => setQuickFilter(quickFilter === 'TO_REVIEW' ? 'NONE' : 'TO_REVIEW'))}
                                    aria-pressed={quickFilter === 'TO_REVIEW'}
                                    className={`${pastille} ${quickFilter === 'TO_REVIEW' ? 'bg-warning-400 border-warning-400 text-dark font-semibold' : 'bg-warning-500/10 border-warning-400/35 text-warning-400 font-semibold'}`}
                                >
                                    À vérifier · {aVerifier}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => vueFiltree(() => setMasquerVirements((m) => !m))}
                                    aria-pressed={masquerVirements}
                                    className={`${pastille} ${masquerVirements ? 'bg-ink-50 border-ink-50 text-dark font-semibold' : 'border-white/10 text-ink-200'}`}
                                >
                                    Masquer les virements
                                </button>
                                {markedDuplicateCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => vueFiltree(() => setShowDuplicates(p => !p))}
                                        aria-pressed={showDuplicates}
                                        title={showDuplicates
                                            ? 'Masquer à nouveau les transactions exclues des calculs'
                                            : 'Ces transactions existent toujours : elles sont seulement exclues des calculs et cachées de la liste'}
                                        className={`touch-target inline-flex items-center px-3 py-1.5 rounded-full text-meta font-bold transition-all border whitespace-nowrap ${showDuplicates ? 'bg-warning-500/20 border-warning-500 text-warning-400' : 'bg-white/5 border-white/10 text-ink-300'}`}
                                    >
                                        {markedDuplicateCount} exclue{markedDuplicateCount > 1 ? 's' : ''} — {showDuplicates ? 'masquer' : 'afficher'}
                                    </button>
                                )}
                                {/* [REFONTE-NAV-L5] Cross-link sobre : la catégorie filtrée a un poste budget
                                    du même nom → ouvrir le Budget scrollé sur ce poste (navigateWithFocus).
                                    Affiché SEULEMENT si le poste existe (pas de lien vers un poste absent). */}
                                {selectedCategory !== 'All' && budgetItems.some(b => b.name === selectedCategory) && (
                                    <button
                                        type="button"
                                        onClick={() => navigateWithFocus(Tab.BUDGET, `poste:${selectedCategory}`)}
                                        title={`Ouvrir le poste « ${selectedCategory} » dans le Budget`}
                                        className="touch-target inline-flex items-center px-3 py-1.5 rounded-full text-meta font-medium border border-info-500/30 bg-info-500/10 text-info-400 hover:text-white transition-colors whitespace-nowrap focus-ring"
                                    >
                                        Voir au budget →
                                    </button>
                                )}
                                {/* [A11Y-PRIVACY-TXN-TOTALS] Σ de la vue filtrée : agrégat = donnée privée. */}
                                {!etroit && (
                                    <PrivateAmount className="font-mono text-[13px] text-ink-400 whitespace-nowrap pl-1">{`Σ ${formatCAD(filteredSum, { decimals: 2 })}`}</PrivateAmount>
                                )}
                            </div>
                        </div>

                        {etroit && resumeMois}
                        {etroit && aClasser}

                        {/* [TX-SELECTION-SANS-ACTION] La sélection multiple existait (case par ligne,
                            plage au Maj-clic, « tout sélectionner » de la page) mais ne pouvait RIEN faire
                            d'autre que re-catégoriser : aucun libellé ne disait ce qu'elle permettait, et
                            aucune action d'exclusion ne s'y branchait. Or `markTransactionsAsDuplicate` est
                            PUR et accepte n'importe quels ids — la capacité existait dans le modèle, il
                            manquait le point d'entrée. Mesuré le 2026-09-14 : le SEUL chemin vers
                            `isDuplicate` était `DuplicatesPanel`, qui n'affiche que les groupes trouvés par
                            le DÉTECTEUR — donc une ligne au montant faux, doublon de RIEN, était
                            définitivement inatteignable (44 lignes réelles dans ce cas).
                            ⚠️ Le libellé dit l'EFFET (« exclure des calculs »), pas le nom du champ : la
                            raison d'exclure n'est pas toujours un doublon. L'annulation reste celle qui
                            existe déjà (« Annuler tous les marquages » du panneau Doublons). */}
                        {selectedIds.size > 0 && (
                            <div
                                role="region"
                                aria-label="Actions sur la sélection"
                                className={`flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl border border-primary/30 bg-primary/10 ${etroit ? '' : 'mx-4 my-3'}`}
                            >
                                <span className="text-meta font-bold text-ink-100">
                                    {selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}
                                </span>
                                {selectedIds.size < filteredTransactions.length && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedIds(new Set(filteredTransactions.map(t => t.id)))}
                                        className="touch-target px-3 py-1.5 rounded-full text-meta font-bold bg-white/5 border border-white/10 text-ink-200 hover:text-ink-50 transition-colors focus-ring"
                                    >
                                        Sélectionner les {filteredTransactions.length} filtrées
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => { handleMarkDuplicates([...selectedIds]); setSelectedIds(new Set()); }}
                                    title="Les lignes restent dans l'historique mais sortent du solde, du budget et des revenus. Réversible."
                                    className="touch-target px-3 py-1.5 rounded-full text-meta font-bold bg-warning-600 text-dark focus-ring"
                                >
                                    Exclure des calculs
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedIds(new Set())}
                                    className="touch-target px-3 py-1.5 rounded-full text-meta bg-white/5 border border-white/10 text-ink-300 hover:text-ink-100 transition-colors focus-ring"
                                >
                                    Désélectionner
                                </button>
                                <span className="text-meta text-ink-400 basis-full">
                                    Rien n&apos;est effacé : les lignes restent visibles, simplement hors du solde,
                                    du budget et des revenus. Annulable dans le panneau « Doublons ».
                                </span>
                            </div>
                        )}

                        {filteredTransactions.length === 0 ? (
                            <EmptyState
                                variant="subtle"
                                icon={<Icon name="search" size={30} />}
                                title="Aucune transaction"
                                description={transactions.length === 0
                                    ? (onImport
                                        ? 'Aucune transaction pour l’instant — importe un relevé bancaire (CSV/PDF) via « Import manuel » en haut de page.'
                                        : 'Aucune transaction enregistrée pour l’instant.')
                                    : 'Aucune transaction ne correspond aux filtres actuels.'}
                                cta={transactions.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => { setFilterText(''); setSelectedCategory('All'); setQuickFilter('NONE'); setMasquerVirements(false); setPlus(0); }}
                                        className="px-3 py-1.5 rounded-full text-meta font-bold bg-white/5 border border-white/10 text-ink-200 hover:text-ink-50 transition-colors focus-ring"
                                    >
                                        Réinitialiser les filtres
                                    </button>
                                )}
                            />
                        ) : etroit ? (
                            <div className="flex flex-col">
                                <div className="flex items-center justify-between py-2 text-[11px] font-semibold tracking-[0.06em] uppercase text-ink-400">
                                    <span>{visiblesTx.length} sur {filteredTransactions.length}</span>
                                    <PrivateAmount className="font-mono normal-case tracking-normal">{`Σ ${formatCAD(filteredSum, { decimals: 2 })}`}</PrivateAmount>
                                </div>
                                <ul role="list" aria-label={`${filteredTransactions.length} transactions`}>
                                    {jours.map((j) => (
                                        <li key={j.date}>
                                            <div className="flex items-center justify-between pt-3 pb-2 border-b border-white/5 text-meta">
                                                <span className="font-semibold text-ink-200">{j.libelle}</span>
                                                <PrivateAmount className="font-mono text-ink-400">{formatSigned(j.total, { withCurrency: true, decimals: 2 })}</PrivateAmount>
                                            </div>
                                            <ul>
                                                {j.lignes.map((t) => {
                                                    const isUncat = t.category === 'Uncategorized' || t.category === 'Inconnu';
                                                    return (
                                                        <li key={t.id} className={`flex items-center gap-3 py-2.5 border-b border-white/5 ${selectedIds.has(t.id) ? 'bg-primary/10' : ''}`}>
                                                            {modeSelection && (
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedIds.has(t.id)}
                                                                    onChange={() => handleSelectOne(t.id, false)}
                                                                    aria-label={rowControlLabel('Sélectionner', t.payee, t.date, t.id, isPrivacyMode)}
                                                                    className="rounded-sm bg-surfaceHighlight shrink-0"
                                                                />
                                                            )}
                                                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: couleurCategorie(t.category) }} aria-hidden="true" />
                                                            <span className="flex-1 min-w-0 flex flex-col">
                                                                <PrivateText className="text-body font-medium text-ink-50 truncate">{t.payee}</PrivateText>
                                                                <span className="flex items-center gap-1 text-meta text-ink-400">
                                                                    {/* ⚠️ [PRIV-CATEGORIE-MASQUEE] `PrivateSelect` : la catégorie s'ÉDITE (toucher le libellé ouvre la liste). */}
                                                                    <PrivateSelect
                                                                        aria-label={rowControlLabel('Catégorie de', t.payee, t.date, t.id, isPrivacyMode)}
                                                                        className={`champ-nu appearance-none field-sizing-content bg-transparent border-0 p-0 text-meta cursor-pointer max-w-[60%] truncate ${isUncat ? 'text-warning-400' : 'text-ink-400'}`}
                                                                        value={t.category}
                                                                        onChange={(e) => updateCategory(t.id, e.target.value)}
                                                                    >
                                                                        {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                                                    </PrivateSelect>
                                                                    {/* [PH4E-OWNER-EDIT] attribution couple — dépenses seulement. */}
                                                                    {isCouple && t.amount < 0 && !t.isTransfer && (
                                                                        <>
                                                                            <span aria-hidden="true">·</span>
                                                                            <select
                                                                                aria-label={rowControlLabel('Conjoint propriétaire de', t.payee, t.date, t.id, isPrivacyMode)}
                                                                                className="champ-nu appearance-none field-sizing-content bg-transparent border-0 p-0 text-meta text-ink-400 cursor-pointer"
                                                                                value={t.ownerId === 0 ? '0' : t.ownerId === 1 ? '1' : 'auto'}
                                                                                onChange={(e) => updateOwner(t.id, e.target.value === 'auto' ? undefined : (e.target.value === '0' ? 0 : 1))}
                                                                            >
                                                                                <option value="auto">Auto</option>
                                                                                <option value="0">{ownerFirstName(0)}</option>
                                                                                <option value="1">{ownerFirstName(1)}</option>
                                                                            </select>
                                                                        </>
                                                                    )}
                                                                </span>
                                                            </span>
                                                            <PrivateAmount className={`font-mono font-bold whitespace-nowrap ${t.isTransfer ? 'text-ink-300' : t.amount > 0 ? 'text-success-400' : 'text-ink-50'}`}>
                                                                {`${signe(t.amount)}${formatCAD(t.amount, { decimals: 2 })}`}
                                                            </PrivateAmount>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse text-body">
                                <caption className="sr-only">Liste des {filteredTransactions.length} transactions filtrees</caption>
                                <thead>
                                    <tr className="text-[11px] font-semibold tracking-[0.06em] uppercase text-ink-400">
                                        {modeSelection && (
                                            <th className="pl-4 w-8">
                                                <input
                                                    type="checkbox"
                                                    aria-label="Sélectionner toutes les transactions de la page"
                                                    className="rounded-sm bg-surfaceHighlight border-white/10"
                                                    checked={selectedIds.size > 0 && selectedIds.size >= visiblesTx.length}
                                                    ref={(el) => {
                                                        if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < visiblesTx.length;
                                                    }}
                                                    onChange={(e) => setSelectedIds(e.target.checked ? new Set(visiblesTx.map(t => t.id)) : new Set())}
                                                />
                                            </th>
                                        )}
                                        {([['date', 'Date', 'px-4'], ['payee', 'Marchand', 'px-2'], ['category', 'Catégorie', 'px-2']] as const).map(([k, label, pad]) => (
                                            <th key={k} className={`${pad} h-10 font-semibold`} aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                                {/* PH4-TX — tri par colonne ; la flèche n'apparaît que hors du tri par défaut (date, récent d'abord). */}
                                                <button type="button" onClick={() => toggleSort(k)} className="uppercase tracking-[0.06em] font-semibold hover:text-ink-50 focus-ring rounded-sm">
                                                    {label}{sortKey === k && !(k === 'date' && sortDir === 'desc') && <span aria-hidden="true"> {sortDir === 'asc' ? '▲' : '▼'}</span>}
                                                </button>
                                            </th>
                                        ))}
                                        {isCouple && <th className="px-2 font-semibold">Conjoint</th>}
                                        <th className="px-4 font-semibold text-right" aria-sort={sortKey === 'amount' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                            <button type="button" onClick={() => toggleSort('amount')} className="uppercase tracking-[0.06em] font-semibold hover:text-ink-50 focus-ring rounded-sm">
                                                Montant{sortKey === 'amount' && <span aria-hidden="true"> {sortDir === 'asc' ? '▲' : '▼'}</span>}
                                            </button>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visiblesTx.map((t) => {
                                        const isUncat = t.category === 'Uncategorized' || t.category === 'Inconnu';
                                        return (
                                            <tr
                                                key={t.id}
                                                className={`h-12 border-t border-white/5 ${selectedIds.has(t.id) ? 'bg-primary/10' : ''}`}
                                                // En mode sélection, un clic sur la ligne la coche (Maj-clic = plage), sauf sur ses contrôles.
                                                onClick={modeSelection ? (e) => { if (!['BUTTON', 'SELECT', 'OPTION', 'INPUT'].includes((e.target as HTMLElement).tagName)) handleSelectOne(t.id, e.shiftKey); } : undefined}
                                            >
                                                {modeSelection && (
                                                    <td className="pl-4">
                                                        {/* UI6 (a11y) : checkbox pilotable au clavier ; shiftKey lu sur onClick pour la
                                                            sélection par plage (Maj-clic). onChange no-op = input contrôlé sans warning. */}
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedIds.has(t.id)}
                                                            onChange={() => { /* géré par onClick (porte shiftKey) */ }}
                                                            onClick={(e) => { e.stopPropagation(); handleSelectOne(t.id, e.shiftKey); }}
                                                            aria-label={rowControlLabel('Sélectionner', t.payee, t.date, t.id, isPrivacyMode)}
                                                            className="rounded-sm bg-surfaceHighlight"
                                                        />
                                                    </td>
                                                )}
                                                <td className="px-4 font-mono text-[13px] text-ink-400 whitespace-nowrap">{t.date}</td>
                                                <td className="px-2 text-ink-100 max-w-0 w-full truncate"><PrivateText>{t.payee}</PrivateText></td>
                                                <td className="px-2">
                                                    {/* ⚠️ [PRIV-CATEGORIE-MASQUEE] `PrivateSelect`, pas `PrivateText` : la
                                                        catégorie s'ÉDITE — la pastille de la maquette EST la liste. */}
                                                    <span className="relative inline-flex items-center">
                                                        <span className="pointer-events-none absolute left-2.5 w-2 h-2 rounded-full" style={{ background: couleurCategorie(t.category) }} aria-hidden="true" />
                                                        <PrivateSelect
                                                            aria-label={rowControlLabel('Catégorie de', t.payee, t.date, t.id, isPrivacyMode)}
                                                            className={`champ-nu appearance-none field-sizing-content h-[30px] pl-6 pr-2.5 rounded-full border bg-surfaceHighlight text-[13px] cursor-pointer max-w-[170px] truncate ${isUncat ? 'border-warning-400/50 text-warning-400' : 'border-white/8 text-ink-200'}`}
                                                            value={t.category}
                                                            onChange={(e) => updateCategory(t.id, e.target.value)}
                                                        >
                                                            {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                                        </PrivateSelect>
                                                    </span>
                                                </td>
                                                {isCouple && (
                                                    <td className="px-2">
                                                        {/* [PH4E-OWNER-EDIT] override de l'attribution couple ; « Auto » = par type de poste.
                                                            SEULEMENT sur les DÉPENSES : revenus/transferts ignorés par le calcul. */}
                                                        {t.amount < 0 && !t.isTransfer ? (
                                                            <select
                                                                aria-label={rowControlLabel('Conjoint propriétaire de', t.payee, t.date, t.id, isPrivacyMode)}
                                                                className="champ-nu appearance-none bg-transparent border-0 h-8 text-meta text-ink-300 cursor-pointer focus-ring rounded-sm"
                                                                value={t.ownerId === 0 ? '0' : t.ownerId === 1 ? '1' : 'auto'}
                                                                onChange={(e) => updateOwner(t.id, e.target.value === 'auto' ? undefined : (e.target.value === '0' ? 0 : 1))}
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
                                                <td className="px-4 text-right whitespace-nowrap">
                                                    <PrivateAmount className={`font-mono ${t.isTransfer ? 'text-ink-300' : t.amount > 0 ? 'text-success-400' : 'text-ink-50'}`}>
                                                        {`${signe(t.amount)}${formatCAD(t.amount, { decimals: 2 })}`}
                                                    </PrivateAmount>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}

                        {filteredTransactions.length > 0 && (
                            <div className={`flex items-center justify-between gap-3 ${etroit ? 'justify-center pt-3' : 'px-4 py-3 border-t border-white/5'}`}>
                                {!etroit && <span className="text-meta text-ink-400">{visiblesTx.length} sur {filteredTransactions.length}</span>}
                                {visiblesTx.length < filteredTransactions.length && (
                                    <button type="button" onClick={() => setPlus((n) => n + 1)} className="min-h-11 px-2 text-[13px] text-ink-100 underline underline-offset-2 focus-ring rounded-sm">
                                        Afficher plus
                                    </button>
                                )}
                            </div>
                        )}
                    </section>
                    </div>
                    {etroit && outils}
                </div>

                {!etroit && (
                    <div className="flex flex-col gap-5 min-w-0">
                        {resumeMois}
                        {outils}
                        {aClasser}
                    </div>
                )}
            </div>
        </div>
    );
};
