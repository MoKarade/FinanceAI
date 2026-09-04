import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Transaction, BudgetConfig, BudgetCategory, Tab as TabEnum } from '../types';
import { Card } from './ui/Card';
import { ConfirmModal } from './ui/ConfirmModal';
import { ProjectionRequired } from './ui/ProjectionRequired';
import { PrivateAmount } from './ui/PrivateAmount';
import { PrivateText } from './ui/PrivateText';
import { showToast } from './ui/Toast';
import { logError } from '../services/errorLogger';
import { BudgetGroupTable } from './budget/BudgetGroupTable';
import { BudgetAiModal } from './budget/BudgetAiModal';
import { useFinanceStore } from '../store/useFinanceStore';
import { ProjectionStaleBanner } from './ui/ProjectionStaleBanner';
import { StatementReminder } from './StatementReminder';
import { Icon } from './ui/Icon';
import { Pill } from './ui/Pill';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { formatCAD, formatSigned } from '../utils/format';
import { useViewContextPublisher } from '../hooks/useViewContextPublisher';
import type { BudgetViewDetail } from '../services/aiChat/viewContext';
import { computeBudgetParity, matchTransactionToCategory, computeActualByOwner, isSavingsNature, type OrphanCategory } from '../utils/budget';
import { syncBudgetWithTransactionCategories, buildMonthlyLedger, computeMonthlyActualAverages, computeIncomeBreakdown, computeAvgByItem } from '../utils/budgetSync';
import { DualKPIStat } from './budget/DualKPIStat';
import { calculateFiscalReport } from '../utils/tax';
import { MASKED_AMOUNT_LABEL } from '../utils/privacyAria';

interface BudgetProps {
    transactions: Transaction[];
    config: BudgetConfig;
    budgetItems: BudgetCategory[];
    setBudgetItems: (items: BudgetCategory[]) => void;
    apiKey: string;
}

type TimeView = 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';

// [BUDGET-TX-CATEGORIES] Flag MODULE (survit aux démontages) : les RETRAITS de postes ne
// s'appliquent qu'à la PREMIÈRE sync par CHARGEMENT D'APP. Un ref composant se ré-armait à
// chaque remount (changement d'onglet/sous-onglet → <Budget> démonte) → un poste créé à la
// main était retiré en quelques clics de navigation (finding panel silent-failure 2026-07-15).
let _budgetFullSyncDoneThisLoad = false;

// [BUDGET-INCOME-WINDOW-UTC-OFFBYONE] Date locale → chaîne `YYYY-MM-DD` SANS passer par
// `.toISOString()` : cette dernière convertit en UTC d'abord, donc une fin de journée locale
// (23:59:59) bascule sur le jour CALENDRIER suivant sous un fuseau négatif (ex. Toronto,
// UTC-4 : 31 août 23:59:59 local → 1er septembre 03:59:59 UTC → « 2026-09-01 », un jour de
// TROP), et minuit local peut basculer sur la VEILLE sous un fuseau positif. Fonctions MODULE
// (pas des closures du composant) : utilisées dès l'initialisation de `useState` (lignes
// `customStart`/`customEnd`), avant que le corps du composant ait fini de s'exécuter.
function toLocalDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// `new Date('YYYY-MM-DD')` (les bornes CUSTOM saisies par l'utilisateur) ancre à UTC minuit — sous
// un fuseau négatif, le jour LOCAL correspondant est la veille (mesuré, `TZ=America/Toronto` :
// « 2026-08-01 » redevient le 31 juillet une fois relu en heure locale). Les vues Mois/Trimestre/
// Année construisent déjà leurs bornes en heure LOCALE (`new Date(année, mois, jour)`) ; Custom
// doit faire pareil pour rester cohérent.
function parseLocalDateStr(s: string): Date {
    const [y, m, d] = s.split('-').map(Number);
    // [finding financial-integrity #751] Un `<input type="date">` vidé rend `''` → sans cette
    // garde, `y`/`m`/`d` valent `NaN` et la date résultante se propage en `toLocalDateStr` sous
    // la forme « NaN-NaN-NaN », qui rate ensuite TOUTE comparaison de chaîne (`t.date >= ...`)
    // → 0 $ affiché en silence. Repli sur AUJOURD'HUI (jamais un chiffre financier par défaut,
    // juste la fenêtre affichée) plutôt qu'une date invalide qui se propage sans avertir.
    if (!y || !m || !d) return new Date();
    return new Date(y, m - 1, d);
}

// Nombre de jours CIVILS entre deux dates LOCALES, via `Date.UTC` des composantes Y/M/D — jamais
// un delta de millisecondes entre deux `Date` locales : un changement d'heure (DST) dans
// l'intervalle décale ce delta de ±1 h, ce qui peut faire basculer `Math.ceil` sur un jour de
// plus (finding financial-integrity, mesuré +3,45 % sur le multiplicateur d'une plage Custom
// traversant un changement d'heure).
// [BUDGET-EFFORT-NOMMER-LA-BASE] Décision de Marc (2026-09-03) : le badge « Effort » garde la
// paie déclarée (net SAISI au Profil) comme dénominateur, et il le DIT. Le « Revenu Net
// Disponible » affiché plus haut dans la même carte est un calcul fiscal sur le brut — un
// pourcentage calculé sur une autre base que le net affiché juste au-dessus se signale, sinon il
// se lit comme s'il portait sur lui (écart mesuré −0,3 % à +3,5 % selon la paire brut/net).
// Aucun chiffre ne bouge : seule la provenance est nommée. Constante UNIQUE : deux badges la
// consomment, deux copies divergeraient.
const EFFORT_BASE_LABEL = 'de la paie déclarée';
const EFFORT_BASE_TITLE = 'Part de la paie déclarée (le net saisi au Profil) qui part en dépenses, commun + perso. '
    + 'Ce pourcentage ne se calcule PAS sur le « Revenu Net Disponible » ci-dessus, qui est un calcul fiscal.';

function civilDaysBetween(a: Date, b: Date): number {
    const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round(Math.abs(utcB - utcA) / (1000 * 60 * 60 * 24));
}

export const Budget: React.FC<BudgetProps> = ({ transactions, config, budgetItems, setBudgetItems, apiKey }) => {
    const [timeView, setTimeView] = useState<TimeView>('MONTH');
    const [inflationSim, setInflationSim] = useState(0);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null); // Pour le modal
    // Phase D'.6 — navigation périodes : 0 = courante, -1 = mois/trim/année précédent, etc.
    const [periodOffset, setPeriodOffset] = useState(0);
    // Phase D'.4 — filtre personne en mode couple (null = tout combiné)
    const [personFilter, setPersonFilter] = useState<0 | 1 | null>(null);

    const [showAiModal, setShowAiModal] = useState(false);

    // [BUDGET-RENAME-ECRIT-A-CHAQUE-FRAPPE] La propagation du renommage aux transactions (plus bas,
    // `handleUpdateItem`) est DÉBOUNCÉE. Deux findings du panel (code-reviewer + silent-failure-hunter,
    // même mécanisme trouvé indépendamment) ont montré que le premier jet était CASSÉ :
    // (1) les refs étaient clées par `index` POSITIONNEL (recalculé à chaque render dans
    //     `BudgetGroupTable`) — supprimer un poste au-dessus décale les index des suivants, faisant
    //     hériter un poste totalement différent d'une session de renommage en vol. Clées par `item.id`
    //     (stable), jamais réutilisé par un autre poste.
    // (2) le nettoyage au démontage ANNULAIT le timer sans le FLUSHER — un renommage tapé juste avant
    //     de changer d'onglet se perdait en silence (désync Budget/Transactions découverte seulement
    //     en revenant). `flushRename` est appelée aussi bien par le timer que par le cleanup.
    // (3) le timer capturait `transactions` (prop) par fermeture au moment de la PLANIFICATION —
    //     une écriture concurrente sur `transactions` pendant la fenêtre de 500 ms (sync Fintable,
    //     import MCP) aurait été écrasée au déclenchement. `transactionsRef` tient toujours la
    //     dernière valeur (mise à jour à CHAQUE rendu), lue au moment du FLUSH, jamais figée.
    const renameTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const renamePendingRef = useRef<Record<string, { fromName: string; toValue: string }>>({});
    const transactionsRef = useRef(transactions);
    transactionsRef.current = transactions;

    const flushRename = (id: string) => {
        const pending = renamePendingRef.current[id];
        if (!pending) return;
        clearTimeout(renameTimersRef.current[id]);
        delete renameTimersRef.current[id];
        delete renamePendingRef.current[id];
        const { fromName, toValue } = pending;
        const current = transactionsRef.current;
        const updatedTransactions = current.map(t =>
            t.category === fromName ? { ...t, category: toValue } : t
        );
        const renamedCount = updatedTransactions.filter((t, i) => t.category !== current[i].category).length;
        if (renamedCount > 0) {
            setAppState({ transactions: updatedTransactions });
            showToast(`Catégorie renommée. ${renamedCount} transaction(s) mises à jour.`, 'success');
        }
    };
    // [BUDGET-RENAME-ECRIT-A-CHAQUE-FRAPPE] FLUSH (pas seulement annuler) au démontage : `renamePendingRef`
    // est lu au moment du cleanup, jamais figé (deps `[]` mais la fonction relit la ref à jour).
    useEffect(() => () => {
        Object.keys(renamePendingRef.current).forEach(flushRename);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // [BUDGET-TX-CATEGORIES] Le Budget reflète SEULEMENT ET EXACTEMENT les catégories présentes
    // dans les Transactions (demande Marc 2026-07-15) : postes manquants ajoutés (cible suggérée
    // = moyenne mensuelle 6 mois, modifiable), postes flou-rapprochables RENOMMÉS (réglages
    // conservés), postes sans aucune transaction retirés. Les RETRAITS/RENOMMAGES ne s'appliquent
    // qu'à la PREMIÈRE sync par CHARGEMENT D'APP (flag module, PAS un ref — cf. ci-dessus) —
    // ensuite ajouts-seulement, sinon un poste créé à la main serait retiré AVANT qu'on puisse y
    // affecter une transaction (œuf-et-poule : le menu de catégories se nourrit des postes).
    // Idempotent ; no-op sur transactions vides (état pas encore hydraté).
    useEffect(() => {
        if (transactions.length === 0) return;
        const sync = syncBudgetWithTransactionCategories(transactions, budgetItems);
        if (!sync.changed) { _budgetFullSyncDoneThisLoad = true; return; }
        const removalAllowed = !_budgetFullSyncDoneThisLoad;
        // Mode ajouts-seulement (après la 1re sync du chargement) : retraits/renommages GELÉS,
        // mais les REFRESH de cibles auto passent quand même (finding panel : sinon un import
        // CSV en cours de session laisse les postes auto préexistants sur des moyennes d'AVANT
        // l'import jusqu'au prochain reload). Un poste conservé garde son id+nom → on reprend
        // sa version rafraîchie depuis sync.items ; les retirés/renommés restent tels quels.
        const items = removalAllowed
            ? sync.items
            : [
                ...budgetItems.map(b => {
                    const refreshed = sync.items.find(i => i.id === b.id && i.name === b.name);
                    return b.autoTarget === true && refreshed ? refreshed : b;
                }),
                ...sync.items.filter(i => sync.added.includes(i.name)),
            ];
        _budgetFullSyncDoneThisLoad = true;
        if (removalAllowed || sync.added.length > 0 || sync.refreshedCount > 0) {
            setBudgetItems(items);
            if (removalAllowed && (sync.removed.length || sync.renamed.length)) {
                // Trace DURABLE (le toast disparaît en 4 s) : quels postes ont été retirés/renommés.
                logError({
                    source: 'storage', severity: 'warning',
                    message: `Budget aligné sur les catégories des transactions — retirés : [${sync.removed.join(', ') || '—'}], renommés : [${sync.renamed.join(', ') || '—'}]`,
                });
            } else if (removalAllowed && !sync.added.length) {
                // Refresh des cibles AUTO seul (persist + push Drive sans action utilisateur) :
                // trace discrète pour la traçabilité des écritures automatiques (finding panel).
                logError({
                    source: 'storage', severity: 'info',
                    message: 'Budget : cibles auto recalculées (moyenne de tout le passé) — aucune autre modification.',
                });
            }
            const parts: string[] = [];
            if (sync.added.length) parts.push(`${sync.added.length} catégorie(s) ajoutée(s) depuis tes transactions`);
            if (removalAllowed && sync.renamed.length) parts.push(`${sync.renamed.length} renommée(s) (réglages conservés)`);
            if (removalAllowed && sync.removed.length) parts.push(`${sync.removed.length} sans transaction retirée(s)`);
            if (parts.length) showToast(`Budget aligné sur tes transactions : ${parts.join(', ')}.`, 'info');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transactions, budgetItems]);

    // Custom Date State
    // [BUDGET-INCOME-WINDOW-UTC-OFFBYONE] `toLocalDateStr`, jamais `.toISOString().split('T')[0]` :
    // ce dernier convertit en UTC d'abord, donc sous un fuseau POSITIF (Europe/Asie/Australie), le
    // 1er du mois à minuit LOCAL peut reculer d'un jour en UTC — le champ « Date de début » se
    // pré-remplirait avec le dernier jour du mois précédent (finding code-reviewer #751 : site le
    // plus visible, une valeur affichée directement dans le formulaire, pas juste une borne interne).
    const [customStart, setCustomStart] = useState(toLocalDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
    const [customEnd, setCustomEnd] = useState(toLocalDateStr(new Date()));

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    // [BUDGET-MONTH-NAV] Un mois PASSÉ (navigué) est CLOS → progression 100 % ; seul le mois en cours
    // (periodOffset === 0) utilise l'avancement réel du jour. Sinon les barres de progression par poste
    // sur un mois passé se calaient sur l'avancement du mois d'aujourd'hui (finding audit).
    const monthProgress = periodOffset === 0 ? (currentDay / daysInMonth) * 100 : 100;

    const getDateRange = () => {
        // Phase D'.6 — applique le periodOffset (négatif = passé, positif = futur)
        if (timeView === 'MONTH') {
            const start = new Date(now.getFullYear(), now.getMonth() + periodOffset, 1);
            const end = new Date(now.getFullYear(), now.getMonth() + periodOffset + 1, 0, 23, 59, 59);
            return { start, end };
        } else if (timeView === 'QUARTER') {
            const currentQuarter = Math.floor(now.getMonth() / 3);
            const startMonth = (currentQuarter + periodOffset) * 3;
            const start = new Date(now.getFullYear(), startMonth, 1);
            const end = new Date(now.getFullYear(), startMonth + 3, 0, 23, 59, 59);
            return { start, end };
        } else if (timeView === 'YEAR') {
            const start = new Date(now.getFullYear() + periodOffset, 0, 1);
            const end = new Date(now.getFullYear() + periodOffset, 11, 31, 23, 59, 59);
            return { start, end };
        } else {
            // Custom : pas de périodes adjacentes, utilise les bornes user (heure LOCALE, cf. note ci-dessus).
            const start = parseLocalDateStr(customStart);
            const end = parseLocalDateStr(customEnd);
            // [BUDGET-CUSTOM-PLAGE-INVERSEE] finding code-reviewer : une plage inversée (date de fin
            // saisie avant la date de début) laissait `civilDaysBetween` rendre un nombre positif
            // (il fait `Math.abs`) pendant que le filtre par CHAÎNE (`t.date >= startStr && t.date
            // <= endStr`) ne matchait jamais rien — « prévu » positif, « réel » toujours 0 $. Permuter
            // silencieusement les deux bornes : l'utilisateur voit la plage qu'il a demandée, dans
            // l'ordre chronologique, plutôt qu'un message d'erreur pour une faute de frappe bénigne.
            return start > end ? { start: end, end: start } : { start, end };
        }
    };

    // Bornes de période en CHAÎNES `YYYY-MM-DD`, comparables directement à `t.date` (même format).
    // Ne JAMAIS comparer `t.date` en le reconvertissant en `Date` (`new Date(t.date)` ancre à UTC
    // minuit) contre `start`/`end` (ancrés en heure LOCALE) — sous un fuseau négatif, ça exclut le
    // 1er jour de la période (mesuré, `TZ=America/Toronto` : le 1er du mois disparaissait du revenu
    // réel avant ce correctif, `incomeBreakdown` comparait encore des `Date`).
    const getDateRangeStrings = () => {
        const { start, end } = getDateRange();
        return {
            startStr: toLocalDateStr(start),
            endStr: toLocalDateStr(end),
        };
    };

    const getMultiplier = () => {
        switch (timeView) {
            case 'QUARTER': return 3;
            case 'YEAR': return 12;
            case 'CUSTOM': {
                const { start, end } = getDateRange();
                // [BUDGET-TRANSACTIONS-SYNC-AUDIT] +1 : la fenêtre de sélection est INCLUSIVE des
                // DEUX bornes (`getDateRangeStrings`, `t.date >= startStr && t.date <= endStr`),
                // donc une plage de N jours calendaires contient N jours de transactions, pas
                // `civilDaysBetween` (différence EXCLUSIVE). Sans le +1, le « prévu » était
                // systématiquement sous-estimé (mesuré −3,2 % sur un mois plein).
                const diffDays = civilDaysBetween(start, end) + 1;
                // [BUDGET-TRANSACTIONS-SYNC-AUDIT] finding financial-integrity (MOYEN) : l'ancien
                // plancher `Math.max(0.1, …)` protégeait contre `diffDays === 0` (plage d'un seul
                // jour, avant le +1 ci-dessus) — depuis le +1, `diffDays` vaut TOUJOURS ≥ 1, donc le
                // multiplicateur est TOUJOURS ≥ 1/30,44 ≈ 0,033 : le plancher n'a plus de rôle et ne
                // faisait plus qu'écraser les petites plages vers 0,1 (mesuré : 1, 2 ET 3 jours
                // affichaient tous le MÊME « prévu », jusqu'à +204 % d'erreur sur 1 jour). Seule
                // division par ce multiplicateur dans le fichier (`monthlyTotalSavings`, plus bas)
                // reste sûre : le minimum possible n'est jamais nul.
                // Normalize to months (approx 30.44 days)
                return diffDays / 30.44;
            }
            default: return 1;
        }
    };

    const getBaseMonthlyTarget = (item: BudgetCategory): number => {
        let val = item.target;
        if (item.frequency === 'Yearly') val = item.target / 12;
        if (item.frequency === 'Weekly') val = item.target * 4.33;
        if (item.frequency === 'Quarterly') val = item.target / 3;
        return val;
    };

    const getDisplayTarget = (item: BudgetCategory): number => {
        const baseMonthly = getBaseMonthlyTarget(item);
        let multiplier = getMultiplier();

        if (!isSavingsNature(item.nature) && inflationSim > 0) { // [HEALTH-SAVINGS-CONSISTENCY] NFD, pas `!== 'Epargne'`
            multiplier *= (1 + inflationSim / 100);
        }

        return baseMonthly * multiplier;
    };

    // --- INCOME CALCULATION (EXPLICIT INPUTS) ---
    const usersIncome = useMemo(() => {
        return config.users.map(u => {
            const monthlyGross = u.grossSalary || 0;
            const monthlyNet = u.netSalary || u.salary || 0; // Fallback to old salary field
            return {
                ...u,
                grossSalary: monthlyGross,
                netSalary: monthlyNet,
            };
        });
    }, [config.users]);

    const { actualsMap, totalSpent, trendMap, monthlyDataMap, orphanCategories, itemsWithoutTransactions, actualByOwner } = useMemo(() => {
        // [BUDGET-INCOME-WINDOW-UTC-OFFBYONE] `getDateRangeStrings()` (jour LOCAL, jamais un
        // aller-retour UTC) — l'ancien `.toISOString().split('T')[0]` ici même décalait `endStr`
        // d'un jour sous un fuseau négatif (mesuré, `TZ=America/Toronto`).
        const { startStr, endStr } = getDateRangeStrings();

        const filtered = transactions.filter(t => {
            return t.date >= startStr && t.date <= endStr && t.amount < 0 && !t.isTransfer && !t.isDuplicate;
        });

        // [PH4-A] Réels + catégories orphelines (fenêtre) + postes sans dépense (TOUT
        // l'historique → un poste annuel rapproché une fois n'est pas « sans dépense »).
        const allSpend = transactions.filter(t => t.amount < 0 && !t.isTransfer && !t.isDuplicate);
        const parity = computeBudgetParity(filtered, budgetItems, allSpend);

        // [PH4-E] Dépense RÉELLE par conjoint sur la fenêtre (auto par type de poste, override par ownerId).
        const actualByOwner = computeActualByOwner(filtered, budgetItems);

        // Tendances 6 mois : MÊME règle de rapprochement que les réels (avant : nom
        // EXACT seul → un substring-match comptait dans le réel mais pas la tendance ;
        // et les doublons `isDuplicate` gonflaient la tendance mais PAS le réel — désormais
        // exclus des DEUX). Cache par catégorie + un seul passage sur les transactions (perf).
        const matchCache = new Map<string, string | undefined>();
        const matchedName = (cat: string): string | undefined => {
            if (!matchCache.has(cat)) matchCache.set(cat, matchTransactionToCategory(cat, budgetItems)?.name);
            return matchCache.get(cat);
        };
        const months: { mStr: string; monthName: string }[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            // [BUDGET-INCOME-WINDOW-UTC-OFFBYONE, finding code-reviewer #751] `toLocalDateStr`, pas
            // `.toISOString()` : sous un fuseau POSITIF (Europe/Asie/Australie), minuit local peut
            // reculer d'un jour en UTC et faire tomber le 1er du mois dans le mois PRÉCÉDENT,
            // décalant tout `trendMap`/`monthlyDataMap` d'un cran.
            months.push({ mStr: toLocalDateStr(d).substring(0, 7), monthName: d.toLocaleDateString('fr-CA', { month: 'short' }) });
        }
        const trends: Record<string, number[]> = {};
        const detailedMonthly: Record<string, { name: string, value: number }[]> = {};
        budgetItems.forEach(item => {
            trends[item.name] = months.map(() => 0);
            detailedMonthly[item.name] = months.map(m => ({ name: m.monthName, value: 0 }));
        });
        for (const t of transactions) {
            if (t.amount >= 0 || t.isTransfer || t.isDuplicate) continue;
            const mi = months.findIndex(m => t.date.startsWith(m.mStr));
            if (mi < 0) continue;
            const name = matchedName(t.category);
            if (!name || !trends[name]) continue;
            const abs = Math.abs(t.amount);
            trends[name][mi] += abs;
            detailedMonthly[name][mi].value += abs;
        }

        return {
            actualsMap: parity.actualsMap,
            totalSpent: parity.totalSpent,
            trendMap: trends,
            monthlyDataMap: detailedMonthly,
            orphanCategories: parity.orphanCategories,
            itemsWithoutTransactions: parity.itemsWithoutTransactions,
            actualByOwner,
        };
    // getDateRange et now sont recréés à chaque render (fonctions locales) ; ses VRAIS paramètres sont
    // listés explicitement : timeView + customStart/customEnd ET `periodOffset` (le navigateur de mois —
    // getDateRange l'applique, cf `now.getMonth() + periodOffset`). ⚠️ Bug corrigé 2026-07-16 : periodOffset
    // manquait ici (mais présent dans les memos voisins revenus/alertes) → naviguer vers un autre mois NE
    // recalculait PAS les dépenses réelles par poste (memo figé sur le mois courant → « ça s'actualise pas »).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transactions, timeView, budgetItems, customStart, customEnd, periodOffset]);

    // [BUDGET-MONTHLY-LEDGER] Grand livre mensuel (12 mois) : RÉEL des dépenses ET des revenus
    // par mois + solde (demande Marc). Lignes dépenses = exactement les postes du budget.
    const ledger = useMemo(
        () => buildMonthlyLedger(transactions, budgetItems.map(i => i.name)),
        [transactions, budgetItems],
    );

    // [BUDGET-PAST-AVG] « Budget du mois en cours = moyenne de tout le passé » (demande Marc) :
    // moyennes mensuelles GLOBALES (dépenses/revenus) sur tous les mois PLEINS d'historique.
    const pastAverages = useMemo(() => computeMonthlyActualAverages(transactions), [transactions]);

    // [BUDGET-3-VUES] Moyenne MENSUELLE par poste sur la fenêtre du ledger 12 mois — mois courant
    // (partiel) EXCLU, donc au plus 11 mois pleins (demande Marc : « réel actuel, moyenne des
    // derniers mois, prévision » — 3 colonnes). MÊME source que l'historique par poste (ledger,
    // sœur de PH4D « calculs voisins sur la même base »). `null` = « — » honnête (cf helper).
    const avg12ByItem = useMemo(
        () => computeAvgByItem(ledger, (category) => logError({
            source: 'storage', severity: 'warning',
            message: `Budget : moyenne mensuelle NON FINIE pour le poste « ${category} » (transaction corrompue ?) — affichée indisponible.`,
        })),
        [ledger],
    );

    // Moyenne ramenée à la PÉRIODE affichée (×3 trimestre, ×12 année — même normalisation que la
    // cible, sinon comparaison mensuel-vs-trimestre faussée). PAS d'inflationSim : la moyenne est
    // un RÉEL historique, la simulation d'inflation ne s'applique qu'aux cibles projetées.
    const getDisplayAvg = (item: BudgetCategory): number | null => {
        const avg = avg12ByItem[item.name];
        if (avg === null || avg === undefined) return null;
        return avg * getMultiplier();
    };

    const totalBudgetDisplay = budgetItems.reduce((sum, item) => sum + getDisplayTarget(item), 0);
    // [BUDGET-REEL-PREVISIONNEL-OBJECTIF] Assiette de l'OBJECTIF des tuiles de dépenses. Deux
    // différences DÉLIBÉRÉES avec `totalBudgetDisplay` ci-dessus, chacune mesurée par le panel :
    //  1. postes ÉPARGNE EXCLUS — le « réel » d'en face filtre `isTransfer`, donc une cotisation
    //     CELI ne peut STRUCTURELLEMENT jamais y apparaître : garder sa cible dans l'objectif
    //     comparait deux assiettes différentes (mesuré : Réel 1 500 $ contre Objectif 2 000 $, soit
    //     un « sous le budget » permanent de 500 $/mois). Aligne enfin `Budget.tsx` sur la règle que
    //     `utils/healthRatios.ts` affirmait DÉJÀ suivre ici (`monthlyConsumptionExpenses`).
    //  2. cible NON indexée par le simulateur d'inflation — un chiffre étiqueté « Objectif » se lit
    //     comme une valeur SAISIE ; la faire bouger avec un curseur situé 60 lignes plus bas, hors
    //     du champ visuel des tuiles, en fait une valeur simulée qui ne dit plus son nom
    //     (mesuré : 2 200 $ → 2 370 $ à +10 %). `getBaseMonthlyTarget` ignore `inflationSim`.
    const totalSpendObjectifDisplay = budgetItems
        .filter((item) => !isSavingsNature(item.nature))
        .reduce((sum, item) => sum + getBaseMonthlyTarget(item), 0) * getMultiplier();
    // [PH4-A/F1] Total dépensé = TOUTES les dépenses (postes rapprochés + orphelins), via
    // `totalSpent` — préserve le total d'AVANT le refactor (les orphelins comptent dans le réel).
    // `actualsMap` ne contient plus les orphelins → on NE somme PLUS ses valeurs ici.
    const totalSpentDisplay = totalSpent;
    // [BUDGET-INCOME-REAL] Revenu de référence = MOYENNE RÉELLE (paie + divers) des mois pleins passés,
    // PAS le salaire d'onboarding. Sert au badge Excédentaire/Déficitaire (cohérent avec les tuiles réel).
    const avgRealIncomeDisplay = pastAverages.incomeAvg * getMultiplier();
    // [BUDGET-MONTH-NAV] La projection « fin de mois » n'a de sens que pour le mois EN COURS (partiel).
    // Sur un mois PASSÉ (periodOffset < 0, déjà clos), diviser par l'avancement du mois d'AUJOURD'HUI
    // donnait un chiffre fantaisiste (finding audit, même classe que le bug periodOffset des dépenses).
    const projectedTotalDisplay = timeView === 'MONTH' && periodOffset === 0
        ? (totalSpentDisplay / (currentDay / daysInMonth))
        : totalSpentDisplay;

    // Phase D'.3 — vraie décomposition fiscale (intègre fed + QC + RRQ + AE + RQAP)
    // au lieu de la simple soustraction Brut − Net.
    const fiscalBreakdown = useMemo(() => {
        // grossSalary et netSalary sont MENSUELS dans le store → × 12 pour annuel
        let fedTax = 0;
        let qcTax = 0;
        let rrq = 0;
        let ae = 0;
        let rqap = 0;
        let netIncome = 0;
        let totalGross = 0;
        for (const u of usersIncome) {
            const grossAnnual = u.grossSalary * 12;
            if (grossAnnual <= 0) continue;
            const report = calculateFiscalReport(grossAnnual, 0, 0, new Date().getFullYear(), true);
            fedTax += report.fedTax;
            qcTax += report.qcTax;
            rrq += report.rrq;
            ae += report.ae;
            rqap += report.rqap;
            netIncome += report.netIncome;
            totalGross += grossAnnual;
        }
        const totalTax = fedTax + qcTax + rrq + ae + rqap;
        const multiplier = getMultiplier() / 12; // de annuel → période courante (mois/trim/an)
        return {
            grossDisplay: totalGross * multiplier,
            fedTaxDisplay: fedTax * multiplier,
            qcTaxDisplay: qcTax * multiplier,
            rrqDisplay: rrq * multiplier,
            aeRqapDisplay: (ae + rqap) * multiplier,
            totalTaxDisplay: totalTax * multiplier,
            netDisplay: netIncome * multiplier,
            averageRate: totalGross > 0 ? (totalTax / totalGross) * 100 : 0,
        };
    // getMultiplier est recréé à chaque render ; timeView et customStart/customEnd couvrent
    // déjà ses paramètres — l'ajouter directement causerait une recréation infinie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [usersIncome, timeView, customStart, customEnd]);

    // [BUDGET-REEL-PREVISIONNEL-OBJECTIF] no-fake-data : `fiscalBreakdown` dérive le net du SEUL
    // `grossSalary` (`if (grossAnnual <= 0) continue`). Une fiche de paie importée qui ne porte que
    // le NET (`mcp/ingest/applyDocument.ts`) laisse donc `grossSalary` à 0 → l'objectif vaudrait
    // « 0 $ » et le reste-à-vivre objectif serait NÉGATIF. `undefined` = la 3e valeur est omise
    // proprement par `DualKPIStat`, ce qui est l'aveu honnête plutôt qu'un zéro crédible.
    const incomeObjectifDisplay = fiscalBreakdown.grossDisplay > 0 ? fiscalBreakdown.netDisplay : undefined;

    // [BUDGET-INCOME-REAL 2026-07-16] Revenu RÉEL = ventilé SALAIRE (paie) vs REVENUS DIVERS depuis les
    // transactions de la période (catégories de revenu réel), PAS le salaire d'onboarding (demande Marc :
    // « le revenu doit correspondre à ma paie réelle / mes fiches, pas au chiffre saisi »). period-aware
    // (periodOffset) comme les dépenses.
    const incomeBreakdown = useMemo(() => {
        // [BUDGET-INCOME-WINDOW-UTC-OFFBYONE] Comparaison par CHAÎNE `YYYY-MM-DD`, comme le filtre
        // des dépenses — jamais `new Date(t.date) >= start` : `new Date('YYYY-MM-DD')` ancre à UTC
        // minuit, `start`/`end` sont en heure LOCALE. Sous un fuseau négatif, ça excluait le 1er
        // jour de la période (mesuré, `TZ=America/Toronto`).
        const { startStr, endStr } = getDateRangeStrings();
        const inRange = transactions.filter(t => t.date >= startStr && t.date <= endStr);
        return computeIncomeBreakdown(inRange);
    // getDateRangeStrings (→ getDateRange) est une fonction locale recréée à chaque render ; ses
    // vraies deps (timeView, customStart, customEnd, periodOffset) sont listées directement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transactions, timeView, customStart, customEnd, periodOffset]);
    const totalActualIncomeDisplay = incomeBreakdown.total;


    // --- 2. GROUPING LOGIC ---
    const groupedItems = useMemo(() => {
        const groups = { 'Besoin': [] as BudgetCategory[], 'Envie': [] as BudgetCategory[], 'Epargne': [] as BudgetCategory[] };
        budgetItems.forEach(item => {
            const nature = item.nature || 'Envie';
            if (groups[nature]) groups[nature].push(item);
            else groups['Envie'].push(item);
        });
        Object.keys(groups).forEach(key => {
            groups[key as keyof typeof groups].sort((a, b) => getBaseMonthlyTarget(b) - getBaseMonthlyTarget(a));
        });
        return groups;
    // inflationSim n'est pas utilisé par getBaseMonthlyTarget (tri par cible de base) ;
    // ESLint le détecte comme superflu mais le conserver ne nuit pas au comportement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [budgetItems, inflationSim]);

    // --- 3. COUPLE SPLIT & SAVINGS CAPACITY ---
    const coupleAnalysis = useMemo(() => {
        // USE NET SALARIES FOR SPLIT ANALYSIS
        const user1 = usersIncome[0];
        // [PH4E-OWNER-EDIT] solo = user2 SANS NOM. `config.users` est un tuple [User, User] (length TOUJOURS 2),
        // donc `length > 1` rendait `isSolo` toujours faux → la section couple s'affichait en solo (et un override
        // `ownerId` orphelin y montrait un montant inexpliqué). Détection par NOM, cohérente avec `Transactions.isCouple`.
        const user2 = usersIncome[1]?.name?.trim() ? usersIncome[1] : null;

        // Explicitly use Net Salary for ratio calculation
        const totalNet = user1.netSalary + (user2 ? user2.netSalary : 0);

        let ratio1 = 1; // Solo user takes 100%
        if (user2) {
            // [BUDGET-SPLIT-5050-RATIO-1] Le mode « 50 / 50 » du sélecteur n'avait AUCUNE branche
            // ici : ratio1 restait à 1 et 100 % du commun allait au conjoint 1 (Effort affiché
            // 30 %/0 % au lieu de 15 %/19 %, mesuré au lot 120). La valeur offerte par un <select>
            // doit avoir sa branche chez son consommateur — un fallthrough silencieux vaut un
            // no-op typé vert.
            if (config.splitMode === 'custom') ratio1 = (config.customSplit || 50) / 100;
            else if (config.splitMode === 'prorata' && totalNet > 0) ratio1 = user1.netSalary / totalNet;
            // [BUDGET-SPLIT-PRORATA-SANS-NET] Tout le reste en couple → moitié-moitié : le mode
            // « 50 / 50 », ET le prorata quand AUCUN net n'est saisi (100 %/0 % n'a aucun sens
            // pour un couple sans salaires — c'était le même fallthrough silencieux que le 50/50).
            else ratio1 = 0.5;
        }
        const ratio2 = 1 - ratio1;

        let commonExpenses = 0;
        let user1Personal = 0;
        let user2Personal = 0;

        budgetItems.forEach(item => {
            const amount = getDisplayTarget(item);
            if (!isSavingsNature(item.nature)) { // [HEALTH-SAVINGS-CONSISTENCY] NFD, pas `!== 'Epargne'`
                if (item.type === 'Commun') commonExpenses += amount;
                else if (item.type === 'Perso 1') user1Personal += amount;
                else if (item.type === 'Perso 2') user2Personal += amount;
            }
        });

        const user1IncomeDisplay = user1.netSalary * getMultiplier();
        const user2IncomeDisplay = user2 ? user2.netSalary * getMultiplier() : 0;

        const user1ShareCommon = commonExpenses * ratio1;
        const user2ShareCommon = commonExpenses * ratio2;

        const user1Contribution = user1ShareCommon + user1Personal;
        const user2Contribution = user2ShareCommon + user2Personal;

        const user1Savings = user1IncomeDisplay - user1Contribution;
        const user2Savings = user2IncomeDisplay - user2Contribution;
        const totalSavings = user1Savings + user2Savings;

        return {
            user1, user2,
            user1Savings, user2Savings, totalSavings,
            user1Income: user1IncomeDisplay, user2Income: user2IncomeDisplay,
            user1Contribution, user2Contribution,
            user1ShareCommon, user2ShareCommon,
            user1Personal, user2Personal,
            // [PH4-E] Dépense RÉELLE par conjoint (transactions auto-attribuées par type de poste,
            // override par ownerId) — distincte du split PLANIFIÉ ci-dessus (cibles budgétées).
            user1Actual: actualByOwner.owner0,
            user2Actual: actualByOwner.owner1,
            communActual: actualByOwner.commun,
            splitRatio1: ratio1,
            splitMode: config.splitMode,
            isSolo: !user2
        };
    // getDisplayTarget et getMultiplier sont recréés à chaque render ; leurs vraies deps
    // (timeView, inflationSim, customStart, customEnd, periodOffset) sont déjà listées explicitement.
    // periodOffset : getMultiplier→getDateRange en dépend → sans lui, les KPIs d'épargne couple
    // restaient figés sur la période courante en navigant vers le passé (cohérent avec le useMemo voisin).
    // actualByOwner.* en SCALAIRES (pas l'objet) : `coupleAnalysis` ne se recalcule que si une valeur change,
    // pas à chaque nouvelle réf de l'objet (le useMemo de parité en recrée un à chaque recalcul).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config, usersIncome, budgetItems, timeView, inflationSim, customStart, customEnd, periodOffset, actualByOwner.owner0, actualByOwner.owner1, actualByOwner.commun]);

    // [A11Y-PRIVACY-CHAINES-RESTANTES] La liste portait « Poste (312 $ dépassé) » en CHAÎNE, et elle
    // a DEUX consommateurs aux règles opposées : le bandeau à l'écran, qui doit masquer le montant,
    // et le contexte de l'assistant, qui a besoin du chiffre. Une chaîne ne peut pas servir les deux.
    // Elle porte donc le nom et le dépassement séparément ; chaque consommateur compose le sien.
    const alerts = useMemo(() => {
        const list: Array<{ poste: string; depassement: number }> = [];
        budgetItems.forEach(item => {
            const spent = actualsMap[item.name] || 0;
            const target = getDisplayTarget(item);
            // Alerte seulement au-delà de 10% de dépassement (tolérance anti-bruit
            // pour les petits écarts normaux).
            if (target > 0 && spent > target * 1.1) {
                list.push({ poste: item.name, depassement: spent - target });
            }
        });
        return list;
    // getDisplayTarget est recréé à chaque render ; ses vraies deps sont déjà dans la liste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [budgetItems, actualsMap, timeView, inflationSim, customStart, customEnd]);

    const setAppState = useFinanceStore(s => s.setAppState);

    const handleUpdateItem = (index: number, field: keyof BudgetCategory, value: BudgetCategory[keyof BudgetCategory]) => {
        // [BUDGET-TRANSACTIONS-SYNC-AUDIT] Le champ nom est un input CONTRÔLÉ qui écrit à chaque
        // frappe (`onChange`, pas `onBlur`) : vider le nom propagerait `category: ''` à TOUTES les
        // transactions du poste, puis en le retapant `oldItem.name` vaudrait '' (falsy) et la garde
        // de rename plus bas ne se redéclencherait plus jamais — orphelines pour de bon (mesuré :
        // 1 200 $ perdus sur une fixture 3 mois). Refuser l'écriture d'un nom vide : le champ
        // contrôlé revient alors visuellement à l'ancien nom au lieu de se vider.
        if (field === 'name' && typeof value === 'string' && value.trim() === '') {
            // [BUDGET-TRANSACTIONS-SYNC-AUDIT] finding silent-failure-hunter (ÉLEVÉ) : le champ est
            // un input CONTRÔLÉ — sans message, l'utilisateur qui vide le nom pour le retaper voit
            // juste son clavier « ne pas marcher » (React re-rend l'ancien nom sans explication).
            showToast('Le nom du poste ne peut pas être vide.', 'info');
            return;
        }
        const newItems = [...budgetItems];
        const oldItem = newItems[index];
        newItems[index] = { ...oldItem, [field]: value };
        // [BUDGET-TX-CATEGORIES] Éditer la CIBLE ou la FRÉQUENCE à la main décroche la gestion
        // auto (cible auto = moyenne MENSUELLE de tout le passé ; si la fréquence passait à
        // « Yearly » en restant auto, le refresh réécrirait un montant mensuel interprété ÷12 —
        // finding panel : cible silencieusement mal échelonnée).
        if ((field === 'target' || field === 'frequency') && oldItem.autoTarget) {
            newItems[index] = { ...newItems[index], autoTarget: false };
        }
        setBudgetItems(newItems);

        // Phase D'.1 — synchro absolue : si rename de catégorie, propage aux
        // transactions qui utilisent l'ancien nom.
        // [BUDGET-RENAME-ECRIT-A-CHAQUE-FRAPPE] Débouncé, clé = `item.id` (STABLE, jamais un index
        // positionnel — cf. commentaire plus haut). `oldItem.name` à CETTE frappe est déjà la valeur
        // de la frappe PRÉCÉDENTE (le champ est contrôlé, `budgetItems` mis à jour ci-dessus à chaque
        // frappe) : `renamePendingRef` fige le nom encore présent dans `transactions` dès la 1ʳᵉ
        // frappe de la session, et la réécriture ne part QUE de ce nom-là, vers la valeur la plus
        // RÉCENTE au moment du flush (timer ou démontage).
        if (field === 'name' && typeof value === 'string' && oldItem.name && oldItem.name !== value && oldItem.id) {
            const id = oldItem.id;
            const fromName = renamePendingRef.current[id]?.fromName ?? oldItem.name;
            renamePendingRef.current[id] = { fromName, toValue: value };
            clearTimeout(renameTimersRef.current[id]);
            renameTimersRef.current[id] = setTimeout(() => flushRename(id), 500);
        }
    };

    const handleAddItem = (nature: 'Besoin' | 'Envie' | 'Epargne' = 'Envie') => {
        const newId = `cat_${Date.now()}`;
        setBudgetItems([...budgetItems, {
            id: newId,
            name: 'Nouvelle Catégorie',
            target: 0,
            frequency: 'Monthly',
            type: 'Commun',
            nature: nature
        }]);
    };

    const handleDeleteItem = (idToDelete: string | undefined) => {
        if (!idToDelete) return;
        // ✅ Fix : ConfirmModal non-bloquant au lieu de window.confirm()
        setConfirmDeleteId(idToDelete);
    };

    const doConfirmDelete = () => {
        if (confirmDeleteId) {
            const itemToDelete = budgetItems.find(i => i.id === confirmDeleteId);
            setBudgetItems(budgetItems.filter(i => i.id !== confirmDeleteId));
            // [BUDGET-RENAME-ECRIT-A-CHAQUE-FRAPPE] finding CRITIQUE (code-reviewer +
            // silent-failure-hunter) : si un renommage débouncé est encore en vol pour ce poste,
            // `itemToDelete.name` est déjà la valeur TAPÉE — `transactions`, elle, porte encore le
            // nom ORIGINAL (`renamePendingRef`, pas encore flushé). Chercher par le nom tapé
            // manquerait toutes les transactions réelles (0 réassignées, catégorie fantôme jamais
            // nettoyée) ET laisserait le timer se déclencher plus tard sur un poste qui n'existe
            // plus. Annuler le timer et réassigner depuis le VRAI nom en cours.
            const pending = confirmDeleteId ? renamePendingRef.current[confirmDeleteId] : undefined;
            if (confirmDeleteId) {
                clearTimeout(renameTimersRef.current[confirmDeleteId]);
                delete renameTimersRef.current[confirmDeleteId];
                delete renamePendingRef.current[confirmDeleteId];
            }
            const nameInTransactions = pending?.fromName ?? itemToDelete?.name;
            // Phase D'.1 — réassigne les transactions affectées à "Uncategorized"
            // au lieu de les laisser pointer vers une catégorie fantôme.
            if (nameInTransactions) {
                const affectedCount = transactions.filter(t => t.category === nameInTransactions).length;
                if (affectedCount > 0) {
                    const updatedTransactions = transactions.map(t =>
                        t.category === nameInTransactions ? { ...t, category: 'Uncategorized' } : t
                    );
                    setAppState({ transactions: updatedTransactions });
                    showToast(`Catégorie supprimée. ${affectedCount} transaction(s) déplacée(s) vers "Uncategorized".`, 'info');
                }
            }
            setConfirmDeleteId(null);
        }
    };

    // Phase D'.1 — compte les transactions affectées par la suppression
    // (utilisé dans le message de confirmation).
    const deleteAffectedCount = useMemo(() => {
        if (!confirmDeleteId) return 0;
        const itemToDelete = budgetItems.find(i => i.id === confirmDeleteId);
        if (!itemToDelete?.name) return 0;
        return transactions.filter(t => t.category === itemToDelete.name).length;
    }, [confirmDeleteId, budgetItems, transactions]);

    const buildAiPayload = () => ({
        // [BUDGET-INCOME-REAL 2026-07-16] Le diagnostic IA raisonne sur le MÊME revenu que l'utilisateur voit :
        // la moyenne RÉELLE (paie + divers) des mois pleins passés, PAS le salaire d'onboarding
        // (`config.users[].netSalary`) — sinon l'IA conseille sur un revenu incohérent avec les tuiles/badge.
        totalNetIncome: avgRealIncomeDisplay,
        totalBudget: totalBudgetDisplay,
        totalSpent: totalSpentDisplay,
        // TROISIÈME consommateur de `alerts`, révélé par le typecheck en découpant la chaîne : le
        // prompt du diagnostic IA. Il attend des phrases ; on les compose ICI plutôt que de forcer
        // les deux autres consommateurs à partager un format qui ne leur convient pas.
        alerts: alerts.map((a) => `${a.poste} (${formatCAD(a.depassement)} dépassé)`), // MONTANT-HORS-ECRAN
        categories: budgetItems.map(item => ({
            name: item.name,
            nature: item.nature || 'Inconnu',
            target: getDisplayTarget(item),
            spent: actualsMap[item.name] || 0,
        })),
    });

    const handleAiDiagnosis = () => {
        if (!apiKey) {
            showToast("Clé API Anthropic requise pour le diagnostic IA.", "info");
            return;
        }
        setShowAiModal(true);
    };
    const isPrivacyMode = useFinanceStore(s => s.isPrivacyMode);
    // [AUDIT-SAFETY / revue #608, 3e tour] La carte « Santé Financière du Couple » ne consultait
    // JAMAIS le mode discret : décomposition fiscale complète (fédéral, QC, RRQ, AE+RQAP, net
    // disponible) et partage du revenu des DEUX conjoints, en texte ET en `title=`. Un attribut est
    // la même classe d'angle mort qu'une prop de graphique : invisible au rendu, lisible au DOM et
    // annoncé par certains lecteurs d'écran. `maskedAttr` sert aux ATTRIBUTS (pas de nœud à
    // envelopper) ; le texte visible passe par `PrivateAmount`.
    // Frontière : les $ sont masqués, ainsi que le TAUX MOYEN d'imposition (il désigne la tranche de
    // revenu). Les ratios de comportement (effort, clé de partage) restent : ils ne disent pas le revenu.
    const maskedAttr = (v: number) => (isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(v));

    // Wiring 2026-05: snapshot final de la projection vivante.
    // Permet de relier "épargne théorique mensuelle" → "patrimoine fin vie".
    const lastProjection = useFinanceStore(s => s.lastProjection);
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);
    const projectionSummary = useMemo(() => {
        if (!lastProjection?.chartData?.length) return null;
        const last = lastProjection.chartData[lastProjection.chartData.length - 1];
        const monthlyTotalSavings = coupleAnalysis.totalSavings / getMultiplier(); // ramène mensuel
        const horizonYears = lastProjection.chartData.length / 12;
        // [BUDGET-SENSIBILITE-FORMULE-5PCT] ⚠️ La tuile « Sensibilité » vivait ICI, et elle est
        // SUPPRIMÉE plutôt que corrigée. Elle recalculait localement un patrimoine long terme
        // (valeur future d'une rente à 5 % en dur), ce qui viole le non-négociable « Future = source
        // unique » — et le chiffre était faux d'une façon qui interdit de le réparer :
        //   · il ne dépendait QUE de l'horizon, donc il valait **145 648 $ pour les SEPT personas**,
        //     identiques revenus, dettes, âge de retraite et fiscalité confondus ;
        //   · la vraie réponse du moteur (même scénario, dépenses −100 $/mois) va de **18 495 $**
        //     (`pre-retraite-riche`) à **307 118 $** (`lea-fauchee`), soit un rapport de **16,6×**.
        //   · l'écart n'est donc pas un biais qu'on corrigerait en changeant le taux : le rapport
        //     formule/moteur va de **0,47× à 7,88×** selon le ménage. C'est la FORME qui est fausse
        //     (`UN-FACTEUR-PLAT-SUR-UNE-RELATION-CONVEXE`).
        // Une sensibilité qui ne dépend pas de l'utilisateur n'est pas une sensibilité. La question
        // reste légitime et le moteur sait y répondre : elle est ROUTÉE en
        // `[BUDGET-SENSIBILITE-MOTEUR]` plutôt que devinée ici. La carte entière navigue déjà vers
        // l'onglet Futur, donc rien d'ATTEIGNABLE n'est perdu.
        return {
            estateNetWorth: lastProjection.estateNetWorth ?? last?.NetWorth ?? 0,
            finalYear: last?.year ?? new Date().getFullYear() + Math.round(horizonYears),
            horizonYears: Math.round(horizonYears),
            currentMonthlySavings: monthlyTotalSavings,
        };
    // getMultiplier est recréé à chaque render ; ses deps (timeView, customStart, customEnd)
    // sont implicitement couvertes par coupleAnalysis.totalSavings qui se recalcule avec elles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastProjection, coupleAnalysis.totalSavings]);

    // [CHAT-PAGE-CONTEXT] Contexte d'écran publié pour le chat : RÉUTILISE STRICTEMENT les valeurs
    // déjà calculées pour le rendu (totalSpentDisplay/totalBudgetDisplay/totalActualIncomeDisplay/
    // actualsMap/projectionSummary/alerts) — AUCUNE nouvelle expression arithmétique (« jamais un
    // 3e chiffre », classes PH4D-BUDGET-RATIOS / BUDGET-INCOME-REAL). Le gate mode discret vit dans
    // le hook (à la source). [Vague 1.5, demande Marc] TOUTES les cartes de la page + la PROVENANCE
    // de chaque chiffre (le chat peut expliquer « d'où ça vient », pas seulement le citer).
    const chatViewDetail = useMemo<BudgetViewDetail>(() => {
        const { start, end } = getDateRange();
        // [BUDGET-CUSTOM-PLAGE-INVERSEE] finding panel (MOYEN) : `getDateRange()` permute déjà les
        // bornes CUSTOM inversées pour tous les calculs $ de cet objet — le libellé doit décrire la
        // MÊME plage, pas les chaînes brutes `customStart`/`customEnd` (qui resteraient dans l'ordre
        // saisi par erreur), sinon le chat recevrait un texte contradictoire avec les chiffres à côté.
        const periodLabel = timeView === 'MONTH'
            ? new Intl.DateTimeFormat('fr-CA', { month: 'long', year: 'numeric' }).format(start)
            : timeView === 'QUARTER'
                ? `T${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}`
                : timeView === 'YEAR'
                    ? String(start.getFullYear())
                    : `du ${toLocalDateStr(start)} au ${toLocalDateStr(end)}`;
        const timeViewLabel = timeView === 'MONTH' ? 'mois'
            : timeView === 'QUARTER' ? 'trimestre'
                : timeView === 'YEAR' ? 'année' : 'plage personnalisée';
        const topCategories = Object.entries(actualsMap)
            .filter(([, spent]) => Number.isFinite(spent) && spent > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, spent]) => ({ name, spent }));
        const personName = personFilter !== null ? config.users[personFilter]?.name?.trim() : '';
        // Ces cartes ne sont PAS un rendu : elles composent le contexte envoyé à l'assistant IA
        // (`services/aiChat/viewContext.ts`). Le mode discret doit-il s'y appliquer ? C'est une
        // décision de Marc, pas une évidence — masquer les montants rendrait l'assistant inutile
        // pendant qu'il est actif. Question posée dans `[PRIVACY-CONTEXTE-IA]`.
        // Le jeton `MONTANT-HORS-ECRAN` est répété SUR chaque ligne : la garde lit une fenêtre de
        // ±2 lignes, et ces cartes sont trop espacées pour qu'une seule marque les couvre.
        const cards: NonNullable<BudgetViewDetail['cards']> = [
            {
                label: 'Revenus (ventilation)',
                value: `Salaire ${formatCAD(incomeBreakdown.salary)} · Divers ${formatCAD(incomeBreakdown.other)}`, // MONTANT-HORS-ECRAN
                note: 'revenus RÉELS des transactions de la période (catégories de revenu), pas le salaire déclaré du profil',
            },
            {
                label: 'Statut du budget',
                value: avgRealIncomeDisplay >= totalBudgetDisplay ? 'Excédentaire' : 'Déficitaire',
                note: 'compare la moyenne des revenus réels des mois passés à la cible totale du budget',
            },
        ];
        if (timeView === 'MONTH' && periodOffset === 0) {
            cards.push({
                label: 'Fin de mois (projection)',
                value: formatCAD(projectedTotalDisplay), // MONTANT-HORS-ECRAN
                note: 'dépenses du mois projetées au rythme actuel (réel ÷ avancement du mois) — mois en cours seulement',
            });
        }
        if (projectionSummary) {
            cards.push({
                label: 'Impact à long terme',
                value: formatCAD(projectionSummary.estateNetWorth), // MONTANT-HORS-ECRAN
                note: `patrimoine successoral projeté en ${projectionSummary.finalYear} (horizon ${projectionSummary.horizonYears} ans), rentes RRQ/PSV incluses — vient de la PROJECTION de l'onglet Futur (lastProjection.estateNetWorth) ; pour comparer avec get_projection, utiliser years=${projectionSummary.horizonYears}`,
            });
        }
        if (timeView === 'MONTH' && alerts.length > 0) {
            cards.push({
                label: 'Dépassements détectés',
                value: `${alerts.length} poste(s) : ${alerts.slice(0, 3).map((a) => `${a.poste} (${formatCAD(a.depassement)} dépassé)`).join(', ')}`, // MONTANT-HORS-ECRAN
                note: 'postes dont le réel dépasse la cible de la période',
            });
        }
        return {
            kind: 'budget',
            timeViewLabel,
            periodLabel,
            totalSpent: totalSpentDisplay,
            totalBudgetTarget: totalBudgetDisplay,
            totalRealIncome: totalActualIncomeDisplay,
            topCategories,
            ...(personName ? { personFilterLabel: personName } : {}),
            cards,
        };
    // getDateRange est recréée à chaque render ; ses VRAIES deps (timeView, periodOffset,
    // customStart, customEnd — leçon BUDGET-MONTH-NAV : lister TOUS les états qu'elle lit)
    // sont listées directement, comme le memo incomeBreakdown voisin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeView, periodOffset, customStart, customEnd, totalSpentDisplay, totalBudgetDisplay,
        totalActualIncomeDisplay, actualsMap, personFilter, config.users, incomeBreakdown,
        avgRealIncomeDisplay, projectedTotalDisplay, projectionSummary, alerts]);
    useViewContextPublisher('budget', chatViewDetail);

    return (
        <div className="space-y-6 stagger-in pb-20">
            <ConfirmModal
                isOpen={!!confirmDeleteId}
                onConfirm={doConfirmDelete}
                onCancel={() => setConfirmDeleteId(null)}
                title="Supprimer la catégorie"
                message={
                    deleteAffectedCount > 0
                        ? `Supprimer définitivement ? ${deleteAffectedCount} transaction(s) seront déplacées vers "Uncategorized".`
                        : "Supprimer cette catégorie de budget définitivement ?"
                }
                confirmLabel="Supprimer"
            />
            {/* [PH2-c-2] — signal inter-onglets : dernier recalcul de projection échoué. */}
            <ProjectionStaleBanner />
            {/* [REFONTE-NAV-L5] L'en-tête de PAGE (h1 « Budget » = TAB_LABELS) vit dans
                BudgetWorkspace, commun aux quatre sous-onglets — un seul h1 par destination.
                Ici : la barre de pilotage (badge + vision + période + filtres), sans titre. */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-section">
                <div className="flex flex-wrap items-center gap-3 min-w-0">
                    <Badge variant={avgRealIncomeDisplay >= totalBudgetDisplay ? 'success' : 'danger'} size="md">
                        {avgRealIncomeDisplay >= totalBudgetDisplay ? 'Excédentaire' : 'Déficitaire'}
                        <PrivateAmount className="ml-1 tabular-nums">{formatCAD(avgRealIncomeDisplay - totalBudgetDisplay)}</PrivateAmount>
                    </Badge>
                    <p className="text-body text-ink-300">
                        {timeView === 'MONTH' ? 'Vision tactique (Mois en cours)' :
                            timeView === 'QUARTER' ? 'Vision trimestrielle (Objectifs ×3)' :
                                timeView === 'YEAR' ? 'Vision stratégique (Objectifs ×12)' :
                                    'Période personnalisée'}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 flex-shrink-0 w-full md:w-auto">
                        <Button onClick={handleAiDiagnosis} variant="primary" size="sm">
                            Diagnostic
                        </Button>
                        <Pill
                            aria-label="Période"
                            size="sm"
                            value={timeView}
                            onChange={(v) => { setTimeView(v as TimeView); setPeriodOffset(0); }}
                            options={[
                                { value: 'MONTH', label: 'Mois' },
                                { value: 'QUARTER', label: 'Trim.' },
                                { value: 'YEAR', label: 'Année' },
                                { value: 'CUSTOM', label: 'Custom' },
                            ]}
                        />
                        {/* Phase D'.6 — navigation rapide périodes adjacentes */}
                        {timeView !== 'CUSTOM' && (
                            <div className="flex items-center gap-1 bg-white/5 rounded-pill p-0.5 border border-white/10">
                                <button
                                    type="button"
                                    onClick={() => setPeriodOffset(o => o - 1)}
                                    title="Période précédente"
                                    aria-label="Période précédente"
                                    className="px-2 py-1.5 text-ink-300 hover:text-ink-100 hover:bg-white/10 rounded transition-colors focus-ring"
                                >
                                    <Icon name="chevron-left" size={15} />
                                </button>
                                <span className="px-2 text-tiny text-ink-300 font-mono min-w-[80px] text-center">
                                    {(() => {
                                        const { start } = getDateRange();
                                        if (timeView === 'MONTH') return start.toLocaleDateString('fr-CA', { month: 'short', year: '2-digit' });
                                        if (timeView === 'QUARTER') {
                                            const q = Math.floor(start.getMonth() / 3) + 1;
                                            return `T${q} ${start.getFullYear()}`;
                                        }
                                        return String(start.getFullYear());
                                    })()}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setPeriodOffset(o => Math.min(0, o + 1))}
                                    disabled={periodOffset >= 0}
                                    title={periodOffset >= 0 ? 'Période actuelle' : 'Période suivante'}
                                    aria-label="Période suivante"
                                    className="px-2 py-1.5 text-ink-300 hover:text-ink-100 hover:bg-white/10 rounded transition-colors focus-ring disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                >
                                    <Icon name="chevron-right" size={15} />
                                </button>
                                {periodOffset !== 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setPeriodOffset(0)}
                                        title="Revenir à la période actuelle"
                                        className="px-2 py-1 text-tiny text-info-400 hover:underline focus-ring rounded"
                                    >
                                        Auj.
                                    </button>
                                )}
                            </div>
                        )}
                        {timeView === 'CUSTOM' && (
                            <div className="flex items-center gap-1 bg-white/5 rounded-pill p-1 border border-white/10 focus-within:border-primary/50 transition-colors">
                                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-transparent text-ink-100 text-meta border-none outline-none w-24" aria-label="Date de début" />
                                <span className="text-ink-400">-</span>
                                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-transparent text-ink-100 text-meta border-none outline-none w-24" aria-label="Date de fin" />
                            </div>
                        )}
                        {/* Phase D'.4 — filtre personne en mode couple */}
                        {coupleAnalysis.user2 && (
                            <Pill
                                aria-label="Filtre personne"
                                size="sm"
                                value={personFilter === null ? 'all' : (personFilter === 0 ? 'user1' : 'user2')}
                                onChange={(v) => setPersonFilter(v === 'all' ? null : v === 'user1' ? 0 : 1)}
                                options={[
                                    { value: 'all', label: 'Couple' },
                                    { value: 'user1', label: coupleAnalysis.user1?.name?.split(' ')[0] || 'P1' },
                                    { value: 'user2', label: coupleAnalysis.user2?.name?.split(' ')[0] || 'P2' },
                                ]}
                            />
                        )}
                </div>
            </div>

            {/* [UX-STATEMENT-REMINDER] rappel proactif « relevé du mois manquant » (le filet d'import
                mensuel qui a manqué quand la fuite persona est restée invisible des semaines). */}
            <StatementReminder />

            {/* [BUDGET-PAST-AVG] Tuiles dédupliquées (« Budget » et « Dépenses » affichaient les
                MÊMES chiffres — demande Marc). Le « prévu » des dépenses = MOYENNE DE TOUT LE
                PASSÉ (mois pleins), pas la somme des cibles : c'est le budget du mois en cours. */}
            <div className={`grid grid-cols-2 gap-4 ${timeView === 'MONTH' ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
                <DualKPIStat
                    label="Revenus"
                    icon={<Icon name="money" size={16} />}
                    prevu={pastAverages.incomeAvg * getMultiplier()}
                    reel={totalActualIncomeDisplay}
                    // [BUDGET-REEL-PREVISIONNEL-OBJECTIF] Objectif Revenus = salaire NET déclaré au
                    // profil (fiscalBreakdown.netDisplay, même source que la carte fiscale plus bas —
                    // "salaire déclaré", distinct du réel transactionnel par design de cet écran).
                    objectif={incomeObjectifDisplay}
                    // [BUDGET-INCOME-REAL] Ventilation demandée par Marc : salaire (paie) vs revenus divers,
                    // depuis les vraies transactions de la période. Remplace « moy. passée » peu informatif.
                    sublabel={<>Salaire <PrivateAmount>{formatCAD(incomeBreakdown.salary)}</PrivateAmount> · Divers <PrivateAmount>{formatCAD(incomeBreakdown.other)}</PrivateAmount></>}
                    variant="success"
                />
                <DualKPIStat
                    label="Dépenses"
                    icon={<Icon name="debt" size={16} />}
                    prevu={pastAverages.expenseAvg * getMultiplier()}
                    reel={totalSpentDisplay}
                    // [BUDGET-REEL-PREVISIONNEL-OBJECTIF] Objectif = somme des cibles de dépense par
                    // catégorie, hors ÉPARGNE et hors simulateur d'inflation (cf. sa définition).
                    objectif={totalSpendObjectifDisplay}
                    sublabel={`Budget = moy. passée (${pastAverages.fullMonths} mois)`}
                    // Aucun mois complet → comparaison NON pertinente : neutre, jamais « danger »
                    // sur un prévu=0 (finding panel : badge rouge + écart 0,0 % contradictoires).
                    variant={pastAverages.fullMonths > 0 && totalSpentDisplay > pastAverages.expenseAvg * getMultiplier() ? 'danger' : 'info'}
                    invertGoodBad
                />
                {/* Vue MOIS + mois EN COURS seulement : hors MONTH ou sur un mois passé,
                    projectedTotalDisplay === totalSpentDisplay → la tuile dupliquerait « Dépenses »
                    (finding panel) et une « projection » sur un mois clos n'a aucun sens. */}
                {timeView === 'MONTH' && periodOffset === 0 && (
                    <DualKPIStat
                        label="Fin de mois (projection)"
                        icon={<Icon name="goal" size={16} />}
                        prevu={pastAverages.expenseAvg * getMultiplier()}
                        reel={projectedTotalDisplay}
                        objectif={totalSpendObjectifDisplay}
                        sublabel="Dépenses au rythme actuel"
                        variant={pastAverages.fullMonths > 0 && projectedTotalDisplay > pastAverages.expenseAvg * getMultiplier() ? 'danger' : 'info'}
                        invertGoodBad
                    />
                )}
                <DualKPIStat
                    label="Restant"
                    icon={<Icon name="status" size={16} />}
                    prevu={(pastAverages.incomeAvg - pastAverages.expenseAvg) * getMultiplier()}
                    reel={totalActualIncomeDisplay - totalSpentDisplay}
                    // [BUDGET-REEL-PREVISIONNEL-OBJECTIF] Objectif Restant = objectif Revenus −
                    // objectif Dépenses (les deux MÊMES sources que les tuiles ci-dessus, donc
                    // l'identité affichée tient). Objectif Revenus absent ⇒ pas d'objectif de reste.
                    objectif={incomeObjectifDisplay === undefined ? undefined : incomeObjectifDisplay - totalSpendObjectifDisplay}
                    sublabel="Revenus − dépenses (réels)"
                    variant={totalActualIncomeDisplay - totalSpentDisplay < 0 ? 'danger' : 'success'}
                />
            </div>

            {/* Simulateur d'inflation — toggle inline (avant: caché en hover sur Card 1) */}
            <details className="bg-surface/40 rounded-card border border-white/5 group">
                <summary className="cursor-pointer px-4 py-2 text-meta text-ink-300 hover:text-ink-50 transition-colors flex items-center justify-between focus-ring">
                    <span>Simulateur d'inflation {inflationSim > 0 && <Badge variant="warning" size="sm" className="ml-2">+{inflationSim}%</Badge>}</span>
                    <span className="text-ink-400 group-open:rotate-180 transition-transform" aria-hidden="true">▾</span>
                </summary>
                <div className="px-4 pb-4 pt-2 border-t border-white/5">
                    <label className="flex justify-between text-meta text-ink-300 mb-2">
                        <span>Hausse des dépenses simulée</span>
                        <span className="text-warning-400 font-bold">+{inflationSim}%</span>
                    </label>
                    <input
                        type="range" min="0" max="20" step="1"
                        value={inflationSim} onChange={e => setInflationSim(Number(e.target.value))}
                        className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-warning-500"
                        aria-label="Simulateur d'inflation"
                    />
                    <p className="text-tiny text-ink-400 mt-2">Applique un multiplicateur sur les cibles non-Épargne pour estimer l'impact de l'inflation.</p>
                </div>
            </details>

            {/* PROJECTION LINK (Wiring 2026-05) — mode strict */}
            {!projectionSummary && (
                <ProjectionRequired feature="L'impact à long terme du budget" />
            )}
            {projectionSummary && (
                <button
                    type="button"
                    onClick={() => navigateWithFocus(TabEnum.FUTURE)}
                    className="bg-white/[0.03] border border-white/40 rounded-card p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between w-full text-left hover:bg-white/[0.05] transition-colors focus-ring"
                    title="Ouvrir FutureProjection"
                >
                    <div>
                        <div className="text-tiny uppercase font-bold text-info-400 tracking-widest mb-1">Impact à long terme →</div>
                        <PrivateAmount as="div" className="text-2xl font-black text-white">
                            {formatCAD(projectionSummary.estateNetWorth)}
                        </PrivateAmount>
                        <div className="text-tiny text-ink-400 mt-1">
                            Patrimoine successoral projeté, avec rentes RRQ/PSV, en {projectionSummary.finalYear} (FutureProjection actif).
                        </div>
                    </div>
                </button>
            )}

            {/* ALERTS BANNER */}
            {timeView === 'MONTH' && alerts.length > 0 && (
                <div className="bg-red-900/10 border border-danger-500/20 rounded-lg p-3 flex items-start gap-3 animate-fade-in">
                    <Icon name="alert" size={18} className="text-warning-400 shrink-0" />
                    <div>
                        <h4 className="text-body font-bold text-danger-400">Attention : Dépassements détectés</h4>
                        <p className="text-meta text-ink-300 mt-1">
                            {alerts.slice(0, 3).map((a, i) => (
                                <React.Fragment key={a.poste}>
                                    {i > 0 && ', '}
                                    {a.poste} (<PrivateAmount>{formatCAD(a.depassement)}</PrivateAmount> dépassé)
                                </React.Fragment>
                            ))} {alerts.length > 3 && `et ${alerts.length - 3} autres.`}
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* LEFT COLUMN: VISUALS */}
                <div className="lg:col-span-1 space-y-6">

                    {/* SAVINGS CAPACITY CARD & EXPENSE BREAKDOWN */}
                    <Card title={coupleAnalysis.isSolo ? "Santé Financière" : "Santé Financière du Couple"} className="bg-gradient-to-br from-[#1e1e1e] to-blue-900/10 border-info-500/20">
                        <div className="space-y-6">

                            {/* Phase D'.3 — Visualisation fiscale détaillée (fed + QC + RRQ + AE + RQAP)
                                au lieu de la simple soustraction Brut − Net. */}
                            <div className="bg-black/30 rounded-lg p-3 border border-white/5 space-y-2">
                                <div className="flex justify-between items-center text-tiny text-ink-300">
                                    <span>Revenus Bruts Totaux <span className="text-ink-400">(salaire déclaré)</span></span>
                                    <PrivateAmount className="font-mono">{formatCAD(fiscalBreakdown.grossDisplay)}</PrivateAmount>
                                </div>
                                {/* Barre stackée multi-couleurs des déductions */}
                                {/* Garde /0 : sans salaire brut déclaré, `x/0` rendrait width:NaN%/Infinity% (finding audit). */}
                                <div className="w-full bg-surfaceHighlight h-2 rounded-full overflow-hidden flex">
                                    <div
                                        className="h-full bg-danger-500/80"
                                        style={{ width: `${fiscalBreakdown.grossDisplay > 0 ? (fiscalBreakdown.fedTaxDisplay / fiscalBreakdown.grossDisplay) * 100 : 0}%` }}
                                        title={`Fédéral : ${maskedAttr(fiscalBreakdown.fedTaxDisplay)}`}
                                    />
                                    <div
                                        className="h-full bg-rose-600/80"
                                        style={{ width: `${fiscalBreakdown.grossDisplay > 0 ? (fiscalBreakdown.qcTaxDisplay / fiscalBreakdown.grossDisplay) * 100 : 0}%` }}
                                        title={`Québec : ${maskedAttr(fiscalBreakdown.qcTaxDisplay)}`}
                                    />
                                    <div
                                        className="h-full bg-warning-500/80"
                                        style={{ width: `${fiscalBreakdown.grossDisplay > 0 ? (fiscalBreakdown.rrqDisplay / fiscalBreakdown.grossDisplay) * 100 : 0}%` }}
                                        title={`RRQ : ${maskedAttr(fiscalBreakdown.rrqDisplay)}`}
                                    />
                                    <div
                                        className="h-full bg-yellow-400/80"
                                        style={{ width: `${fiscalBreakdown.grossDisplay > 0 ? (fiscalBreakdown.aeRqapDisplay / fiscalBreakdown.grossDisplay) * 100 : 0}%` }}
                                        title={`AE + RQAP : ${maskedAttr(fiscalBreakdown.aeRqapDisplay)}`}
                                    />
                                </div>
                                {/* Legend détaillé */}
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-tiny">
                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center gap-1 text-red-300">
                                            <span aria-hidden="true" className="w-2 h-2 bg-danger-500/80 rounded-sm" />
                                            Impôt fédéral
                                        </span>
                                        <PrivateAmount className="font-mono">{formatCAD(fiscalBreakdown.fedTaxDisplay)}</PrivateAmount>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center gap-1 text-rose-300">
                                            <span aria-hidden="true" className="w-2 h-2 bg-rose-600/80 rounded-sm" />
                                            Impôt QC
                                        </span>
                                        <PrivateAmount className="font-mono">{formatCAD(fiscalBreakdown.qcTaxDisplay)}</PrivateAmount>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center gap-1 text-amber-300">
                                            <span aria-hidden="true" className="w-2 h-2 bg-warning-500/80 rounded-sm" />
                                            RRQ
                                        </span>
                                        <PrivateAmount className="font-mono">{formatCAD(fiscalBreakdown.rrqDisplay)}</PrivateAmount>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center gap-1 text-yellow-300">
                                            <span aria-hidden="true" className="w-2 h-2 bg-yellow-400/80 rounded-sm" />
                                            AE + RQAP
                                        </span>
                                        <PrivateAmount className="font-mono">{formatCAD(fiscalBreakdown.aeRqapDisplay)}</PrivateAmount>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center text-tiny text-ink-400 pt-1 border-t border-white/5">
                                    <span>Total déductions (<PrivateAmount>{`${fiscalBreakdown.averageRate.toFixed(1)}%`}</PrivateAmount> moyen)</span>
                                    <PrivateAmount className="font-mono text-danger-400">{`−${formatCAD(fiscalBreakdown.totalTaxDisplay)}`}</PrivateAmount>
                                </div>
                                <div className="flex justify-between items-center font-bold text-white mt-1 pt-1 border-t border-white/5">
                                    <span>Revenu Net Disponible</span>
                                    <PrivateAmount className="text-success-400 font-mono">{formatCAD(fiscalBreakdown.netDisplay)}</PrivateAmount>
                                </div>
                            </div>

                            {/* User 1 Breakdown */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-body font-bold text-indigo-400">{coupleAnalysis.user1.name}</span>
                                    <div className="flex items-center gap-2">
                                        {coupleAnalysis.splitMode === 'prorata' && (
                                            <span className="text-tiny text-ink-400">{(coupleAnalysis.splitRatio1 * 100).toFixed(0)}% (Net)</span>
                                        )}
                                        <span className="text-meta text-ink-400 bg-white/5 px-2 py-0.5 rounded" title={EFFORT_BASE_TITLE}>
                                            Effort: {coupleAnalysis.user1Income > 0 ? ((coupleAnalysis.user1Contribution / coupleAnalysis.user1Income) * 100).toFixed(0) : 0}% {EFFORT_BASE_LABEL}
                                        </span>
                                    </div>
                                </div>

                                <div className="relative h-4 w-full bg-black/50 rounded-full overflow-hidden flex">
                                    <div className="h-full bg-indigo-600" style={{ width: `${(coupleAnalysis.user1ShareCommon / coupleAnalysis.user1Income) * 100}%` }} title={`Commun: ${maskedAttr(coupleAnalysis.user1ShareCommon)}`}></div>
                                    <div className="h-full bg-indigo-400" style={{ width: `${(coupleAnalysis.user1Personal / coupleAnalysis.user1Income) * 100}%` }} title={`Perso: ${maskedAttr(coupleAnalysis.user1Personal)}`}></div>
                                    <div className="h-full bg-green-500/50" style={{ flex: 1 }} title={`Épargne: ${maskedAttr(coupleAnalysis.user1Savings)}`}></div>
                                </div>

                                <div className="flex justify-between text-tiny text-ink-300 px-1">
                                    <div className="flex flex-col">
                                        <span>Sorties: <PrivateAmount className="text-white font-bold">{formatCAD(coupleAnalysis.user1Contribution)}</PrivateAmount></span>
                                        {/* [PH4-E] dépense RÉELLE perso attribuée (vs « Sorties » = part PLANIFIÉE). Masqué en solo (toujours 0). */}
                                        {!coupleAnalysis.isSolo && (
                                            <span className="text-ink-400" title="Dépenses réelles attribuées à ce conjoint (postes Perso, override possible)">Perso réel: <PrivateAmount className="text-white font-semibold">{formatCAD(coupleAnalysis.user1Actual)}</PrivateAmount></span>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span>Épargne: <PrivateAmount className="text-green-400 font-bold">{formatCAD(coupleAnalysis.user1Savings)}</PrivateAmount></span>
                                    </div>
                                </div>
                            </div>

                            {/* User 2 Breakdown */}
                            {!coupleAnalysis.isSolo && coupleAnalysis.user2 && (
                                <div className="space-y-2 pt-2 border-t border-white/5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-body font-bold text-pink-400">{coupleAnalysis.user2.name}</span>
                                        <div className="flex items-center gap-2">
                                            {coupleAnalysis.splitMode === 'prorata' && (
                                                <span className="text-tiny text-ink-400">{((1 - coupleAnalysis.splitRatio1) * 100).toFixed(0)}% (Net)</span>
                                            )}
                                            <span className="text-meta text-ink-400 bg-white/5 px-2 py-0.5 rounded" title={EFFORT_BASE_TITLE}>
                                                Effort: {coupleAnalysis.user2Income > 0 ? ((coupleAnalysis.user2Contribution / coupleAnalysis.user2Income) * 100).toFixed(0) : 0}% {EFFORT_BASE_LABEL}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="relative h-4 w-full bg-black/50 rounded-full overflow-hidden flex">
                                        <div className="h-full bg-pink-600" style={{ width: `${(coupleAnalysis.user2ShareCommon / coupleAnalysis.user2Income) * 100}%` }} title={`Commun: ${maskedAttr(coupleAnalysis.user2ShareCommon)}`}></div>
                                        <div className="h-full bg-pink-400" style={{ width: `${(coupleAnalysis.user2Personal / coupleAnalysis.user2Income) * 100}%` }} title={`Perso: ${maskedAttr(coupleAnalysis.user2Personal)}`}></div>
                                        <div className="h-full bg-green-500/50" style={{ flex: 1 }} title={`Épargne: ${maskedAttr(coupleAnalysis.user2Savings)}`}></div>
                                    </div>

                                    <div className="flex justify-between text-tiny text-ink-300 px-1">
                                        <div className="flex flex-col">
                                            <span>Sorties: <PrivateAmount className="text-white font-bold">{formatCAD(coupleAnalysis.user2Contribution)}</PrivateAmount></span>
                                            {/* [PH4-E] dépense RÉELLE perso attribuée (vs « Sorties » = part PLANIFIÉE) */}
                                            <span className="text-ink-400" title="Dépenses réelles attribuées à ce conjoint (postes Perso, override possible)">Perso réel: <PrivateAmount className="text-white font-semibold">{formatCAD(coupleAnalysis.user2Actual)}</PrivateAmount></span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span>Épargne: <PrivateAmount className="text-green-400 font-bold">{formatCAD(coupleAnalysis.user2Savings)}</PrivateAmount></span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="pt-2 text-center bg-green-500/10 rounded-lg py-2 border border-green-500/20">
                                <PrivateAmount as="div" className="text-2xl font-bold text-green-400">
                                    {formatSigned(coupleAnalysis.totalSavings, { withCurrency: true })}
                                </PrivateAmount>
                                <div className="text-tiny text-green-200">Potentiel d'épargne combiné (Net)</div>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* RIGHT COLUMN: THE TABLE */}
                <div className="lg:col-span-2 space-y-6">
                    {(['Besoin', 'Envie', 'Epargne'] as const).map(nature => (
                        <BudgetGroupTable
                            key={nature}
                            nature={nature}
                            items={groupedItems[nature]}
                            allItems={budgetItems}
                            actualsMap={actualsMap}
                            trendMap={trendMap}
                            monthlyDataMap={monthlyDataMap}
                            totalBudgetDisplay={totalBudgetDisplay}
                            monthProgress={monthProgress}
                            expandedId={expandedId}
                            onExpandToggle={setExpandedId}
                            getDisplayTarget={getDisplayTarget}
                            getDisplayAvg={getDisplayAvg}
                            isSolo={coupleAnalysis.isSolo}
                            splitRatio1={coupleAnalysis.splitRatio1}
                            userNames={[config.users[0].name, config.users[1]?.name ?? '']}
                            timeView={timeView}
                            onUpdateItem={handleUpdateItem}
                            onDeleteItem={handleDeleteItem}
                            onAddItem={handleAddItem}
                            // [REFONTE-NAV-L5] Cross-link poste → Transactions filtrées sur la catégorie.
                            onViewTransactions={(name) => navigateWithFocus(TabEnum.TRANSACTIONS, `category:${name}`)}
                        />
                    ))}

                    {/* [PH4-A] Parité Budget ↔ Transactions : trous de rapprochement (règle unique
                        `matchTransactionToCategory`). Empty-state honnête si tout est rapproché. */}
                    {(orphanCategories.length > 0 || itemsWithoutTransactions.length > 0) ? (
                        <div className="premium-card rounded-2xl p-4 sm:p-5 border border-white/5">
                            <div className="flex items-center gap-2 mb-3">
                                <Icon name="transactions" size={16} />
                                <h2 className="text-h2 font-bold text-white">Parité Budget ↔ Transactions</h2>
                            </div>
                            {orphanCategories.length > 0 && (
                                <div className="mb-4">
                                    <h3 className="text-tiny uppercase tracking-widest text-ink-400 font-bold mb-1.5">
                                        Catégories de transactions sans poste ({orphanCategories.length})
                                    </h3>
                                    <ul className="space-y-1">
                                        {orphanCategories.map((o: OrphanCategory) => (
                                            <li key={o.category} className="flex items-center justify-between gap-2 text-meta">
                                                <PrivateText quoi="categorie" className="text-ink-200 truncate">{o.category}</PrivateText>
                                                <PrivateAmount className="font-mono text-warning-400 shrink-0">{formatCAD(o.total)}</PrivateAmount>
                                            </li>
                                        ))}
                                    </ul>
                                    <p className="text-tiny text-ink-400 mt-1.5">Crée un poste du même nom (ou renomme la catégorie) pour suivre ces dépenses.</p>
                                </div>
                            )}
                            {itemsWithoutTransactions.length > 0 && (
                                <div>
                                    <h3 className="text-tiny uppercase tracking-widest text-ink-400 font-bold mb-1.5">
                                        Postes jamais rapprochés à une dépense ({itemsWithoutTransactions.length})
                                    </h3>
                                    <ul className="flex flex-wrap gap-1.5">
                                        {itemsWithoutTransactions.map(i => (
                                            <li key={i.id ?? i.name} className="text-tiny px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-ink-200">{i.name}</li>
                                        ))}
                                    </ul>
                                    <p className="text-tiny text-ink-400 mt-1.5">Aucune transaction (tout l'historique) ne correspond à ce poste — nom différent des catégories de transactions, ou poste inutilisé&nbsp;? (l'épargne par virement n'est pas comptée ici)</p>
                                </div>
                            )}
                        </div>
                    ) : budgetItems.length > 0 && (
                        <div className="text-meta text-ink-400 flex items-center gap-2 px-1">
                            <span aria-hidden="true">✓</span>
                            <span>Parité complète : chaque dépense est rapprochée à un poste, et chaque poste a des dépenses.</span>
                        </div>
                    )}

                    {/* [BUDGET-MONTHLY-LEDGER] Grand livre mensuel (12 mois) : RÉEL des revenus ET
                        des dépenses par mois + solde (demande Marc). Lignes de dépenses =
                        exactement les catégories des transactions (mêmes que les postes). */}
                    {(ledger.expenseRows.length > 0 || ledger.incomeRows.length > 0) && (
                        <div className="premium-card rounded-2xl p-4 sm:p-5 border border-white/5">
                            <div className="flex items-center gap-2 mb-3">
                                <Icon name="chart" size={16} />
                                <h2 className="text-h2 font-bold text-white">Réel par mois — revenus et dépenses (12 mois)</h2>
                            </div>
                            {/* Région défilante FOCUSABLE (WCAG 2.1.1 — ~14 colonnes, déborde
                                forcément) + caption programmatique (H39) — findings a11y-auditor. */}
                            <div
                                className="overflow-x-auto focus-ring rounded-lg"
                                tabIndex={0}
                                role="region"
                                aria-label="Réel mensuel par catégorie, tableau défilant horizontalement"
                            >
                                <table className="w-full text-meta">
                                    <caption className="sr-only">
                                        Revenus et dépenses réels par catégorie, 12 derniers mois (dernier mois en cours, partiel).
                                    </caption>
                                    <thead>
                                        <tr className="text-tiny uppercase tracking-widest text-ink-400">
                                            <th scope="col" className="text-left font-bold py-1.5 pr-2 sticky left-0 bg-surface">Catégorie</th>
                                            {ledger.months.map((m, i) => (
                                                <th key={m} scope="col" className="text-right font-bold py-1.5 px-1.5 whitespace-nowrap">
                                                    {new Date(`${m}-15`).toLocaleDateString('fr-CA', { month: 'short', year: '2-digit' })}
                                                    {i === ledger.currentMonthIndex && <span className="block font-normal normal-case tracking-normal text-ink-400">(en cours)</span>}
                                                </th>
                                            ))}
                                            {/* Fenêtre 12 mois (≠ cible auto = moyenne de TOUT le passé — libellé explicite, finding panel) */}
                                            <th scope="col" className="text-right font-bold py-1.5 pl-2">Moy. 12 mois pleins</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* — REVENUS — */}
                                        <tr className="border-t border-white/10">
                                            <th scope="row" colSpan={ledger.months.length + 2} className="text-left text-tiny uppercase tracking-widest text-success-400 font-bold pt-3 pb-1 sticky left-0 bg-surface">Revenus</th>
                                        </tr>
                                        {ledger.incomeRows.map(row => (
                                            <tr key={`in-${row.category}`} className="border-t border-white/5">
                                                <th scope="row" className="text-left font-medium text-ink-100 py-1.5 pr-2 sticky left-0 bg-surface whitespace-nowrap"><PrivateText quoi="categorie">{row.category}</PrivateText></th>
                                                {row.byMonth.map((v, i) => (
                                                    <td key={ledger.months[i]} className="text-right py-1.5 px-1.5 font-mono">
                                                        {v > 0
                                                            ? <PrivateAmount className="text-ink-200">{formatCAD(v)}</PrivateAmount>
                                                            : <span className="text-ink-400" aria-label="aucun revenu">—</span>}
                                                    </td>
                                                ))}
                                                <td className="text-right py-1.5 pl-2 font-mono">
                                                    <PrivateAmount className="text-ink-100 font-bold">{formatCAD(row.monthlyAverage)}</PrivateAmount>
                                                </td>
                                            </tr>
                                        ))}
                                        {ledger.incomeRows.length === 0 && (
                                            <tr><td colSpan={ledger.months.length + 2} className="text-ink-400 text-meta py-1.5">Aucun revenu dans les transactions sur 12 mois.</td></tr>
                                        )}
                                        {/* — DÉPENSES — */}
                                        <tr className="border-t border-white/10">
                                            <th scope="row" colSpan={ledger.months.length + 2} className="text-left text-tiny uppercase tracking-widest text-warning-400 font-bold pt-3 pb-1 sticky left-0 bg-surface">Dépenses</th>
                                        </tr>
                                        {ledger.expenseRows.map(row => (
                                            <tr key={`out-${row.category}`} className="border-t border-white/5">
                                                <th scope="row" className="text-left font-medium text-ink-100 py-1.5 pr-2 sticky left-0 bg-surface whitespace-nowrap"><PrivateText quoi="categorie">{row.category}</PrivateText></th>
                                                {row.byMonth.map((v, i) => (
                                                    <td key={ledger.months[i]} className="text-right py-1.5 px-1.5 font-mono">
                                                        {v > 0
                                                            ? <PrivateAmount className="text-ink-200">{formatCAD(v)}</PrivateAmount>
                                                            : <span className="text-ink-400" aria-label="aucune dépense">—</span>}
                                                    </td>
                                                ))}
                                                <td className="text-right py-1.5 pl-2 font-mono">
                                                    <PrivateAmount className="text-ink-100 font-bold">{formatCAD(row.monthlyAverage)}</PrivateAmount>
                                                </td>
                                            </tr>
                                        ))}
                                        {/* — TOTAUX + SOLDE — */}
                                        <tr className="border-t border-white/20 font-bold">
                                            <th scope="row" className="text-left text-ink-50 py-2 pr-2 sticky left-0 bg-surface">Total revenus</th>
                                            {ledger.totalIncomeByMonth.map((v, i) => (
                                                <td key={ledger.months[i]} className="text-right py-2 px-1.5 font-mono">
                                                    <PrivateAmount className="text-success-400">{formatCAD(v)}</PrivateAmount>
                                                </td>
                                            ))}
                                            <td className="py-2 pl-2" />
                                        </tr>
                                        <tr className="font-bold">
                                            <th scope="row" className="text-left text-ink-50 py-1 pr-2 sticky left-0 bg-surface">Total dépenses</th>
                                            {ledger.totalExpenseByMonth.map((v, i) => (
                                                <td key={ledger.months[i]} className="text-right py-1 px-1.5 font-mono">
                                                    <PrivateAmount className="text-warning-400">{formatCAD(v)}</PrivateAmount>
                                                </td>
                                            ))}
                                            <td className="py-1 pl-2" />
                                        </tr>
                                        <tr className="font-bold border-t border-white/10">
                                            <th scope="row" className="text-left text-ink-50 py-2 pr-2 sticky left-0 bg-surface">Solde</th>
                                            {ledger.netByMonth.map((v, i) => (
                                                <td key={ledger.months[i]} className="text-right py-2 px-1.5 font-mono">
                                                    <PrivateAmount className={v >= 0 ? 'text-success-400' : 'text-danger-400'}>{formatSigned(v, { withCurrency: true })}</PrivateAmount>
                                                </td>
                                            ))}
                                            <td className="py-2 pl-2" />
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-tiny text-ink-400 mt-2">Réel par mois, hors transferts et doublons. Le dernier mois est EN COURS (partiel) — il est exclu des moyennes. Un revenu à « — » sur le mois courant veut souvent dire que le relevé de compte du mois n'est pas encore importé.</p>
                        </div>
                    )}
                </div>
            </div>

            {showAiModal && (
                <BudgetAiModal
                    apiKey={apiKey}
                    payload={buildAiPayload()}
                    onClose={() => setShowAiModal(false)}
                />
            )}
        </div>
    );
};
