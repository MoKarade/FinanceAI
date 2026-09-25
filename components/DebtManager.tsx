import React, { useState, useMemo } from 'react';
import { CHART_TOOLTIP_STYLE } from '../utils/chartTooltip';
import { Card } from './ui/Card';
import { PrivateAmount } from './ui/PrivateAmount';
import { PrivateSliderValue } from './ui/PrivateSliderValue';
import { EmptyState } from './ui/EmptyState';
import { PageHeader } from './ui/PageHeader';
import { Icon } from './ui/Icon';
import { Debt } from '../types';
import { useTodayIsoLocal } from '../hooks/useSimulationParams';
import { soldeDetteAujourdhui, statutSoldeDette, marchandsCandidats, dettesAuSoldeDuJour, clePayee, type StatutSoldeDette } from '../services/projection/debtAmortization';
import { computeTotalDebt } from '../services/portfolio';
import { ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ComposedChart, Area, Line } from 'recharts';
import { ConfirmModal } from './ui/ConfirmModal';
import { useTimeChartZoom } from '../hooks/useTimeChartZoom';
import { useViewportBelowLg } from '../hooks/useViewportBelowLg';
import { ZoomContainer } from './ui/ZoomContainer';
import { ChartDataTable, type ChartDataColumn } from './ui/ChartDataTable';
import { MASKED_AMOUNT_LABEL, maskedSliderAria } from '../utils/privacyAria';
import { maskedTick } from '../utils/chartPrivacy';
import { useFinanceStore } from '../store/useFinanceStore';
import { formatCAD, formatCompactCAD, formatIsoDay, formatNumber } from '../utils/format';
import { DebtKindFields, refusOrigineIncoherente, refusChampNonFini } from './debt/DebtKindFields';

/**
 * [DETTE-BALANCEASOF-INVISIBLE] Ce que le formulaire a le droit de DIRE du solde enregistré.
 *
 * ⚠️ Ce mapper ne DÉCIDE rien : il traduit les trois formes rendues par `statutSoldeDette`, le
 * module qui porte les conditions. Re-tester ici `kind`/`interestRate`/`startDate` ferait diverger
 * ce que l'écran AFFIRME de ce que le calcul FAIT — `tests/components/debtManagerStatutSolde.test.tsx`
 * l'interdit par un scan.
 *
 * ⚠️ Aucune de ces phrases ne porte de MONTANT : le champ « Solde » juste au-dessus affiche déjà la
 * valeur ramenée à aujourd'hui (`startEdit`), donc répéter un chiffre ici mettrait deux montants de
 * la même dette sur le même écran — et un texte sans montant n'a rien à masquer en mode discret.
 */
export function phraseStatutSolde(statut: StatutSoldeDette): { texte: string; alerte: boolean } {
    switch (statut.forme) {
        case 'suit-les-virements':
            // [DETTE-VIREMENTS-REELS] Le cas de Marc. `nbDeduits === 0` n'est PAS une alerte : c'est
            // l'état NORMAL le lendemain d'un enregistrement — rien n'a encore été prélevé depuis.
            // Dire « aucun virement » sur un ton d'alarme apprendrait à ignorer le message.
            return statut.nbDeduits === 0
                ? {
                    texte: `Enregistré le ${formatIsoDay(statut.dateIso)} · lié à « ${statut.payee} » : aucun virement depuis, le solde ne bougera qu’au prochain.`,
                    alerte: false,
                }
                : {
                    texte: `Enregistré le ${formatIsoDay(statut.dateIso)} · ${statut.nbDeduits} virement${statut.nbDeduits > 1 ? 's' : ''} à « ${statut.payee} » depuis`
                        + `${statut.dernierIso ? `, le dernier le ${formatIsoDay(statut.dernierIso)}` : ''} — déjà déduit${statut.nbDeduits > 1 ? 's' : ''} ci-dessus.`,
                    alerte: false,
                };
        case 'virements-incoherents':
            // Les virements dépassent le solde enregistré : ils ne décrivent pas cette dette. La
            // correction est REFUSÉE — mieux vaut le solde enregistré, honnête, qu'un 0 $ crédible.
            return {
                texte: `${statut.nbDeduits} virements à « ${statut.payee} » dépassent le solde enregistré : rien n’est déduit. Vérifie le marchand choisi, ou ré-enregistre le solde.`,
                alerte: true,
            };
        case 'lie-sans-virement':
            // Un lien qui ne peut RIEN produire : aucune date ne le sauverait, et la dette restera
            // au même niveau tant qu'il pointe un marchand qui ne verse rien.
            return {
                texte: `Lié à « ${statut.payee} » · aucun virement de ce marchand dans tes transactions : la dette ne bougera pas. Vérifie le marchand choisi.`,
                alerte: true,
            };
        case 'suit-les-versements':
            return {
                texte: `Enregistré le ${formatIsoDay(statut.dateIso)} · les versements prélevés depuis sont déjà déduits ci-dessus.`,
                alerte: false,
            };
        case 'date-figee':
            return {
                texte: `Enregistré le ${formatIsoDay(statut.dateIso)} · ce solde ne se déduit pas tout seul.`,
                alerte: false,
            };
        case 'jamais-date':
            // LE cas que Marc ne pouvait pas voir, et le seul qui appelle un geste : sans date, le
            // solde est l'instantané figé du défaut d'origine.
            return {
                texte: 'Solde jamais daté · il ne bougera pas tout seul. « Enregistrer » posera la date d’aujourd’hui.',
                alerte: true,
            };
    }
}

interface DebtManagerProps {
    debts: Debt[];
    setDebts: (d: Debt[]) => void;
}

export const DebtManager: React.FC<DebtManagerProps> = ({ debts, setDebts }) => {
    const todayIso = useTodayIsoLocal();
    // [DETTE-VIREMENTS-REELS] Les virements réels : c'est eux qui font baisser une dette liée à un
    // marchand. Lus du store ici plutôt que reçus en prop — `DebtManager` y lit déjà `isPrivacyMode`,
    // et ajouter une prop obligerait tous ses montages à la fournir sans rien y gagner.
    const transactions = useFinanceStore(s => s.transactions);
    // La liste offerte au lien, calculée UNE fois pour les deux formulaires (ajout et édition).
    // ⚠️ Les marchands DÉJÀ liés à une AUTRE dette en sont retirés : `paiementsReelsDette` travaille
    // par dette, donc deux dettes liées au même marchand déduiraient CHACUNE la totalité des
    // virements. Mesuré sur deux dettes et 7 virements réels : le double de la somme versée
    // retirés du total dû, soit exactement deux fois trop. La liste est le SEUL endroit où ce lien
    // se pose : l'empêcher ici l'empêche partout.
    const marchands = useMemo(() => marchandsCandidats(transactions), [transactions]);
    // ⚠️⚠️ [DETTE-VIREMENTS-REELS] **UNE SEULE liste de dettes pour tout ce que cet écran MONTRE.**
    // Le badge « Total dû » passait par `computeTotalDebt` (corrigé) pendant que la carte de chaque
    // dette et le simulateur d'extinction lisaient `d.balance` BRUT : deux chiffres de la même
    // dette sur le même écran, l'écart grandissant d'un virement par semaine sans qu'aucun ne soit
    // rouge. `dettesAuSoldeDuJour` PRÉSERVE l'identité des objets non corrigés, donc cette
    // mémoïsation ne coûte aucun re-rendu — et elle évite de refaire le balayage des transactions
    // à chaque mouvement du curseur « paiement supplémentaire ».
    // ⚠️ Les MUTATEURS (`saveEdit`, suppression) continuent d'opérer sur `debts`, la liste du
    // STORE : écrire la liste corrigée persisterait une déduction déjà faite, donc la compterait
    // deux fois au chargement suivant.
    // ⚠️⚠️ Et le RENDU de la liste aussi, mesuré : `dettesAuSoldeDuJour` ré-estampille les dettes
    // qu'elle corrige à AUJOURD'HUI (c'est ce qui la rend idempotente). Rendre la liste corrigée
    // faisait donc dire au formulaire « aucun virement depuis » sur la dette même qui venait d'en
    // déduire huit — la date VRAIE, celle que `statutSoldeDette` doit lire, n'existe plus que dans
    // `debts`. La liste garde donc les objets du store, et chaque MONTANT passe par la source
    // unique. Deux tests ont rougi là-dessus avant que je le voie.
    const dettesAuJour = useMemo(() => dettesAuSoldeDuJour(debts, todayIso, transactions), [debts, todayIso, transactions]);
    const [isAdding, setIsAdding] = useState(false);
    const [newDebt, setNewDebt] = useState<Partial<Debt>>({ name: '', balance: 0, interestRate: 0, minimumPayment: 0, category: 'CreditCard' });
    // [DETTE-DATES] Édition d'une dette EXISTANTE. Avant ce lot il n'y avait que « Ajouter » et
    // « Supprimer » : corriger une date (ou n'importe quel champ) obligeait à détruire la dette et
    // à la ressaisir. Demande Marc 2026-08-19 — il ne pouvait pas corriger le début de son bail auto.
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<Partial<Debt>>({});

    const marchandsLibres = useMemo(() => {
        const pris = new Set(debts.filter(d => d.id !== editingId).map(d => clePayee(d.paymentPayee)).filter(p => p !== ''));
        return marchands.filter(m => !pris.has(m.payee));
    }, [marchands, debts, editingId]);

    // [DEBT-BALANCE-NAN-SILENCIEUX] Le refus d'une saisie non numérique est ANNONCÉ (région live
    // montée en permanence, texte vidé quand tout va bien) — un `return` muet laissait croire que
    // le clic n'avait rien fait, et un `NaN` enregistré ne se voyait plus nulle part.
    const [refusSaisie, setRefusSaisie] = useState<string | null>(null);
    const [extraPayment, setExtraPayment] = useState(200);
    // [D6-PRIV-MONTANTS] focus du slider → étiquette révélée pendant l'ajustement seulement.
    const [extraSliderFocus, setExtraSliderFocus] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const handleAdd = () => {
        // [DEBT-UI-PAR-TYPE] Même refus que l'écriture par l'assistant (`applyDocument`) : accepter
        // ici ce que le MCP rejette laisserait le moteur refuser la courbe EN SILENCE.
        if (refusOrigineIncoherente(newDebt.originalBalance, newDebt.balance)) { setRefusSaisie(null); return; }
        // [DEBT-BALANCE-NAN-SILENCIEUX] `balance > 0` refusait déjà un solde vidé, mais PAS un taux
        // ni un minimum vidés — et l'édition (ci-dessous) ne refusait rien du tout.
        const refus = refusChampNonFini(newDebt);
        setRefusSaisie(refus);
        if (refus) return;
        if (newDebt.name && newDebt.balance && newDebt.balance > 0) {
            // [DETTE-SOLDE-INSTANTANE-FIGE] Le solde qu'on vient de taper est vrai AUJOURD'HUI —
            // on le DATE, au lieu de laisser un instantané sans date que rien n'avancera jamais.
            setDebts([...debts, { ...newDebt, id: Date.now().toString(), balanceAsOf: todayIso } as Debt]);
            setIsAdding(false);
            setNewDebt({ name: '', balance: 0, interestRate: 0, minimumPayment: 0, category: 'CreditCard' });
        }
    };

    const handleDelete = (id: string) => { setConfirmDeleteId(id); };

    // Le refus est un ÉTAT (pas dérivé du brouillon) : il se REMET À ZÉRO à chaque changement de
    // formulaire, sinon un message d'ajout périmé s'afficherait sur une dette saine ouverte en édition
    // (revue du lot 213).
    // [DETTE-SOLDE-INSTANTANE-FIGE] Le formulaire s'ouvre sur le solde d'AUJOURD'HUI, pas sur
    // l'instantané enregistré : montrer le stocké pendant que le badge « Total dû » affiche le
    // corrigé mettrait deux chiffres différents pour la même dette sur le même écran — la classe de
    // défaut que ce chantier répare. Les deux coïncident tant que rien n'a dérivé.
    const startEdit = (d: Debt) => {
        setEditingId(d.id);
        setDraft({ ...d, balance: soldeDetteAujourdhui(d, todayIso, transactions) });
        setIsAdding(false);
        setRefusSaisie(null);
    };
    const cancelEdit = () => { setEditingId(null); setDraft({}); setRefusSaisie(null); };
    const saveEdit = () => {
        if (!editingId) return;
        // [DEBT-UI-PAR-TYPE] Cohérence du montant emprunté, sur les valeurs EFFECTIVES (brouillon
        // fusionné sur la dette existante).
        // ⚠️ REDONDANT AUJOURD'HUI, et mesuré comme tel : `startEdit` fait `setDraft({ ...d })`, donc
        // le brouillon porte TOUJOURS tous les champs — juger sur `draft` seul donne le même résultat
        // (perturbation faite : 13 tests verts). J'ai d'abord recopié ici la leçon du lot 93, où le
        // payload MCP est VRAIMENT partiel ; sa prémisse est fausse dans cette UI. La fusion reste
        // parce qu'elle survit à un brouillon qui deviendrait partiel (édition champ par champ,
        // sauvegarde automatique) — mais elle est écrite comme une précaution, pas comme une garde,
        // et le test porte le FAIT (« une origine incohérente ne s'enregistre pas ») plutôt que ce
        // mécanisme (`UNE-PERTURBATION-MUETTE-SUR-SON-PROPRE-AJOUT-MESURE-SA-REDONDANCE`).
        const existante = debts.find(d => d.id === editingId);
        if (refusOrigineIncoherente(draft.originalBalance ?? existante?.originalBalance,
            draft.balance ?? existante?.balance)) { setRefusSaisie(null); return; }
        // [DEBT-BALANCE-NAN-SILENCIEUX] Jugé sur les valeurs EFFECTIVES (même fusion que l'écriture).
        const refus = refusChampNonFini({ ...existante, ...draft });
        setRefusSaisie(refus);
        if (refus) return;
        // ⚠️ On fusionne sur la dette EXISTANTE (`{ ...d, ...draft }`) plutôt que de remplacer par le
        // brouillon : les champs que le formulaire ne montre pas (`kind`, `limit`, `rateProvider`,
        // `isInterestDeductible`…) survivraient sinon à peine à un clic sur « Enregistrer ».
        // [DETTE-SOLDE-INSTANTANE-FIGE] On estampille à CHAQUE enregistrement, sans condition : le
        // brouillon porte le solde d'aujourd'hui par construction (`startEdit` ci-dessus), qu'il ait
        // été retapé ou seulement corrigé à l'ouverture. Ne dater que les soldes MODIFIÉS laisserait
        // un « Enregistrer » sur un autre champ re-figer la dérive déjà absorbée à l'écran.
        setDebts(debts.map(d => (d.id === editingId ? ({ ...d, ...draft, id: d.id, balanceAsOf: todayIso } as Debt) : d)));
        cancelEdit();
    };

    const doConfirmDelete = () => {
        if (confirmDeleteId) {
            setDebts(debts.filter(d => d.id !== confirmDeleteId));
            setConfirmDeleteId(null);
        }
    };

    const simulation = useMemo(() => {
        const data = [];
        let activeDebts = dettesAuJour.map(d => ({ ...d }));
        let totalInterestPaid = 0;
        let month = 0;
        const maxMonths = 120;
        while (activeDebts.some(d => d.balance > 0) && month < maxMonths) {
            let monthlyBalanceTotal = 0;
            let remainingExtra = extraPayment;
            activeDebts.sort((a, b) => b.interestRate - a.interestRate);
            activeDebts.forEach(d => {
                if (d.balance <= 0) return;
                const interest = (d.balance * (d.interestRate / 100)) / 12;
                totalInterestPaid += interest;
                let payment = d.minimumPayment;
                if (remainingExtra > 0) { payment += remainingExtra; remainingExtra = 0; }
                if (payment > (d.balance + interest)) { remainingExtra += (payment - (d.balance + interest)); payment = d.balance + interest; }
                const principal = Math.max(0, payment - interest);
                d.balance -= principal;
                if (d.balance < 0) d.balance = 0;
                monthlyBalanceTotal += d.balance;
            });
            if (month % 3 === 0 || monthlyBalanceTotal === 0) data.push({ month, balance: Math.round(monthlyBalanceTotal), interestAccumulated: Math.round(totalInterestPaid) });
            month++;
        }
        // [DEBT-BALANCE-NAN-SILENCIEUX] Un champ non fini (dette persistée avant le refus de saisie)
        // rend `NaN > 0` faux dès le 1er mois : la boucle s'arrête et affichait « Liberté dans 0,1 ans »
        // — mesuré. Une simulation qui ne peut pas tourner le DIT (« — »), elle n'invente pas une date.
        // Et SANS dette, il n'y a rien à simuler : « 0,0 ans » était une durée inventée (`[].every` est vrai par vacuité).
        const valide = dettesAuJour.length > 0 && dettesAuJour.every(d => Number.isFinite(d.balance) && Number.isFinite(d.interestRate) && Number.isFinite(d.minimumPayment));
        return { chart: data, totalInterest: totalInterestPaid, months: month, valide };
    }, [dettesAuJour, extraPayment]);

    // [DEBT-SUM-DUP, audit 2026-07-16] Source unique (garde isFinite incluse) au lieu du reduce local.
    const totalDebt = useMemo(() => computeTotalDebt(debts, todayIso, transactions), [debts, todayIso, transactions]);
    const totalMinPayment = debts.reduce((sum, d) => sum + d.minimumPayment, 0);

    // [DETTE-SOLDE-INSTANTANE-FIGE] Le jour LOCAL : le « Total dû » affiche le solde d'AUJOURD'HUI,
    // pas l'instantané enregistré.
    // G7a — zoom molette / pan sur la courbe d'extinction (x = mois).
    const zoom = useTimeChartZoom(simulation.chart);
    const etroit = useViewportBelowLg();
    // Repères de l'axe des mois (maquettes) : tous les 6 mois au bureau, 12 au téléphone, + le dernier.
    const reperesMois = useMemo(() => {
        const pas = etroit ? 12 : 6;
        const mois = simulation.chart.map((p) => p.month);
        const dernier = mois[mois.length - 1];
        const r = mois.filter((m) => m % pas === 0 && (dernier === undefined || dernier - m >= pas / 2 || m === dernier));
        if (dernier !== undefined && !r.includes(dernier)) r.push(dernier);
        return r;
    }, [simulation.chart, etroit]);
    // Repères des montants « ronds » (maquettes : 0, 5, 10, 15, 20 k$) : pas de 1 / 2 / 2,5 / 5 × 10ⁿ
    // le plus proche du quart du maximum ; la courbe peut dépasser le dernier repère.
    const reperesMontants = useMemo(() => {
        const max = Math.max(0, ...simulation.chart.map((p) => Math.max(p.balance, p.interestAccumulated)));
        if (!(max > 0)) return undefined;
        const brut = max / 4;
        const puissance = 10 ** Math.floor(Math.log10(brut));
        const pas = [1, 2, 2.5, 5, 10].map((f) => f * puissance).reduce((a, b) => (Math.abs(b - brut) < Math.abs(a - brut) ? b : a));
        const r: number[] = [];
        for (let v = 0; v <= max + 1e-9; v += pas) r.push(v);
        return r;
    }, [simulation.chart]);
    // Libellés d'axe calés aux bords : le premier à gauche, le dernier à droite (jamais rognés).
    const TickMois = (props: { x?: number; y?: number; payload?: { value: number }; index?: number; visibleTicksCount?: number }) => {
        const { x = 0, y = 0, payload, index = 0, visibleTicksCount = 1 } = props;
        const m = payload?.value ?? 0;
        const ancre = index === 0 ? 'start' : index === visibleTicksCount - 1 ? 'end' : 'middle';
        return (
            <text x={x} y={y + 12} textAnchor={ancre} fill="#8896a8" fontSize={etroit ? 10 : 11} fontFamily="JetBrains Mono">
                {m === 0 ? (etroit ? 'auj.' : "aujourd'hui") : `${m} mois`}
            </text>
        );
    };
    const legende = (
        <span className="flex flex-wrap gap-x-3.5 gap-y-1 text-meta text-ink-300" aria-hidden="true">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-[#e0703a]" />Solde restant</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-[3px] rounded-sm bg-warning-400" />Intérêts cumulés</span>
        </span>
    );

    // [A11Y-CHARTS] — mode discret : masque les montants de la table de données sr-only.
    // [A11Y-PRIVACY-DEBT] Le mode discret ne couvrait que la table sr-only et le slider : le total dû
    // (badge d'en-tête), chaque solde/minimum de la liste, le rappel « paiements mensuels » et
    // l'infobulle de la courbe restaient LISIBLES. Tout passe désormais par la primitive PrivateAmount
    // (la valeur SORT du DOM — jamais un flou CSS qui la laisse au lecteur d'écran).
    const isPrivacyMode = useFinanceStore(s => s.isPrivacyMode);
    // [A11Y-CHARTS] — colonnes de la table sr-only (alternative texte à l'AreaChart d'extinction,
    // opaque aux lecteurs d'écran). Mois (axe X) + solde restant + intérêts cumulés. Mode privé
    // masque les MONTANTS (pas le numéro de mois).
    const debtColumns = useMemo<ChartDataColumn[]>(() => {
        const money = (v: unknown) => isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(v);
        return [
            { key: 'month', label: 'Mois', format: (v) => `Mois ${v ?? 0}` },
            { key: 'balance', label: 'Solde restant', format: money },
            { key: 'interestAccumulated', label: 'Intérêts cumulés', format: money },
        ];
    }, [isPrivacyMode]);

    return (
        <div className="space-y-6 stagger-in">
            <ConfirmModal isOpen={!!confirmDeleteId} onConfirm={doConfirmDelete} onCancel={() => setConfirmDeleteId(null)} title="Supprimer la dette" message="Supprimer cette dette définitivement ?" confirmLabel="Supprimer" />
            {/* [S5-REFONTE-DETTES] En-tête des maquettes : « Total dû » à côté du titre (bureau) ou dessous
                (mobile) ; action principale à droite (« Ajouter » en contour au téléphone). */}
            <PageHeader
                title="Dettes"
                badge={<span className="text-meta lg:text-body text-ink-400">Total dû <PrivateAmount className={`font-mono font-semibold lg:font-normal ${totalDebt > 0 ? 'text-[#e0703a] lg:text-danger-400' : 'text-success-400'}`}>{formatCAD(totalDebt)}</PrivateAmount></span>}
                actions={
                    <button
                        type="button"
                        onClick={() => { setIsAdding(!isAdding); setRefusSaisie(null); }}
                        aria-expanded={isAdding}
                        aria-label={isAdding ? 'Fermer' : 'Ajouter une dette'}
                        className="h-10 px-3.5 lg:px-4 rounded-lg border border-white/40 lg:border-transparent text-ink-100 lg:bg-primary lg:text-dark text-body lg:font-bold focus-ring"
                    >
                        {isAdding ? 'Fermer' : <><span className="lg:hidden">Ajouter</span><span className="hidden lg:inline">Ajouter une dette</span></>}
                    </button>
                }
            />
            <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-5 items-start">
                <div className="space-y-4">
                    {/* [S5-REFONTE-DETTES] Maquettes : bureau = une carte, dettes en lignes ; mobile = une carte
                        par dette, liseré orange à gauche. Pas de titre visible (la page EST la liste). */}
                    <section aria-label="Tes dettes" className="flex flex-col gap-2.5 lg:gap-0 lg:rounded-2xl lg:bg-surface lg:border lg:border-white/6 lg:overflow-hidden">
                        {isAdding && (
                            <div className="p-4 lg:px-5 rounded-2xl lg:rounded-none bg-surface border border-white/6 lg:border-x-0 lg:border-t-0 lg:border-white/5 space-y-2">
                                <input aria-label="Nom de la dette" type="text" placeholder="Nom (ex: Visa)" className="w-full bg-dark border border-white/10 rounded-sm px-2 py-1 text-meta text-white" value={newDebt.name} onChange={e => setNewDebt({...newDebt, name: e.target.value})} />
                                <div className="grid grid-cols-2 gap-2">
                                    <input aria-label="Solde de la dette (dollars)" type="number" placeholder="Solde $" className="bg-dark border border-white/10 rounded-sm px-2 py-1 text-meta text-white" value={newDebt.balance || ''} onChange={e => setNewDebt({...newDebt, balance: parseFloat(e.target.value)})} />
                                    <input aria-label="Taux d'intérêt (pourcentage)" type="number" placeholder="Taux %" className="bg-dark border border-white/10 rounded-sm px-2 py-1 text-meta text-white" value={newDebt.interestRate || ''} onChange={e => setNewDebt({...newDebt, interestRate: parseFloat(e.target.value)})} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <input aria-label="Paiement minimum mensuel (dollars)" type="number" placeholder="Min. Payment $" className="bg-dark border border-white/10 rounded-sm px-2 py-1 text-meta text-white" value={newDebt.minimumPayment || ''} onChange={e => setNewDebt({...newDebt, minimumPayment: parseFloat(e.target.value)})} />
                                    <select aria-label="Catégorie de la dette" className="bg-dark border border-white/10 rounded-sm px-2 py-1 text-meta text-white" value={newDebt.category} onChange={e => setNewDebt({...newDebt, category: e.target.value as Debt['category']})}><option value="CreditCard">Carte Crédit</option><option value="Car">Auto</option><option value="Student">Étudiant</option><option value="Personal">Personnel</option></select>
                                </div>
                                {/* [DETTE-DATES] Début et fin de terme. Les deux sont FACULTATIFS :
                                    une dette sans dates se comporte exactement comme avant. */}
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="flex flex-col gap-1 text-tiny text-ink-400">
                                        Début du prêt / bail
                                        <input aria-label="Date de début du prêt ou du bail" type="date" className="bg-dark border border-white/10 rounded-sm px-2 py-1 text-meta text-white" value={newDebt.startDate ?? ''} onChange={e => setNewDebt({...newDebt, startDate: e.target.value || undefined})} />
                                    </label>
                                    <label className="flex flex-col gap-1 text-tiny text-ink-400">
                                        Fin du terme
                                        <input aria-label="Date de fin du terme ou du bail" type="date" className="bg-dark border border-white/10 rounded-sm px-2 py-1 text-meta text-white" value={newDebt.termEndDate ?? ''} onChange={e => setNewDebt({...newDebt, termEndDate: e.target.value || undefined})} />
                                    </label>
                                </div>
                                <DebtKindFields valeur={newDebt} onChange={patch => setNewDebt({ ...newDebt, ...patch })} idSuffixe="ajout" marchands={marchandsLibres} />
                                <p className="text-tiny text-ink-400">
                                    Laisse vide si tu ne sais pas : sans date de fin, le paiement continue jusqu'à
                                    extinction. Avec une date de fin, il s'arrête à ce mois-là — et s'il reste un
                                    solde, il est signalé au lieu d'être effacé.
                                </p>
                                <p role="status" className="text-tiny text-danger-400 empty:hidden">{refusSaisie ?? ''}</p>
                                <button onClick={handleAdd} className="w-full bg-danger-600 hover:bg-danger-700 text-white text-meta font-bold py-2 rounded-sm">Enregistrer</button>
                            </div>
                        )}
                            {debts.map(d => (
                                <div key={d.id} className="p-4 lg:px-5 rounded-2xl lg:rounded-none bg-surface lg:bg-transparent border border-white/6 border-l-[3px] border-l-[#e0703a] lg:border-x-0 lg:border-t-0 lg:border-white/5 lg:last:border-b-0">
                                    {editingId === d.id ? (
                                        <div className="space-y-2">
                                            <input aria-label="Nom de la dette" type="text" className="w-full bg-dark border border-white/10 rounded-sm px-2 py-1 text-meta text-white" value={draft.name ?? ''} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                                            <div className="grid grid-cols-2 gap-2">
                                                <input aria-label="Solde de la dette (dollars)" type="number" className="bg-dark border border-white/10 rounded-sm px-2 py-1 text-meta text-white" value={draft.balance ?? ''} onChange={e => setDraft({ ...draft, balance: parseFloat(e.target.value) })} />
                                                <input aria-label="Taux d'intérêt (pourcentage)" type="number" className="bg-dark border border-white/10 rounded-sm px-2 py-1 text-meta text-white" value={draft.interestRate ?? ''} onChange={e => setDraft({ ...draft, interestRate: parseFloat(e.target.value) })} />
                                            </div>
                                            {(() => {
                                                const { texte, alerte } = phraseStatutSolde(statutSoldeDette(d, todayIso, transactions));
                                                return <p className={`text-tiny ${alerte ? 'text-amber-400' : 'text-ink-400'}`}>{texte}</p>;
                                            })()}
                                            <input aria-label="Paiement minimum mensuel (dollars)" type="number" className="w-full bg-dark border border-white/10 rounded-sm px-2 py-1 text-meta text-white" value={draft.minimumPayment ?? ''} onChange={e => setDraft({ ...draft, minimumPayment: parseFloat(e.target.value) })} />
                                            <div className="grid grid-cols-2 gap-2">
                                                <label className="flex flex-col gap-1 text-tiny text-ink-400">
                                                    Début du prêt / bail
                                                    <input aria-label="Date de début du prêt ou du bail" type="date" className="bg-dark border border-white/10 rounded-sm px-2 py-1 text-meta text-white" value={draft.startDate ?? ''} onChange={e => setDraft({ ...draft, startDate: e.target.value || undefined })} />
                                                </label>
                                                <label className="flex flex-col gap-1 text-tiny text-ink-400">
                                                    Fin du terme
                                                    <input aria-label="Date de fin du terme ou du bail" type="date" className="bg-dark border border-white/10 rounded-sm px-2 py-1 text-meta text-white" value={draft.termEndDate ?? ''} onChange={e => setDraft({ ...draft, termEndDate: e.target.value || undefined })} />
                                                </label>
                                            </div>
                                            <DebtKindFields valeur={draft} onChange={patch => setDraft({ ...draft, ...patch })} idSuffixe={`edit-${d.id}`} marchands={marchandsLibres} />
                                            <p role="status" className="text-tiny text-danger-400 empty:hidden">{refusSaisie ?? ''}</p>
                                            <div className="flex gap-2">
                                                <button onClick={saveEdit} className="flex-1 bg-green-700 hover:bg-green-800 text-white text-meta font-bold py-1.5 rounded-sm focus-ring">Enregistrer</button>
                                                <button onClick={cancelEdit} className="flex-1 bg-white/10 hover:bg-white/20 text-white text-meta py-1.5 rounded-sm focus-ring">Annuler</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-2 lg:gap-2.5">
                                            <div className="flex justify-between items-baseline gap-3">
                                                <span className="font-semibold text-ink-50 text-body">{d.name}</span>
                                                <PrivateAmount as="span" className="font-mono text-[16px] lg:text-[18px] font-bold text-ink-50 lg:text-danger-400">{formatCAD(soldeDetteAujourdhui(d, todayIso, transactions))}</PrivateAmount>
                                            </div>
                                            {/* Mobile : taux en orange, minimum à droite. */}
                                            <div className="flex lg:hidden justify-between items-center gap-3 text-[13px]">
                                                <span className="font-mono text-[#e0703a]">{d.interestRate.toLocaleString('fr-CA')} %</span>
                                                <span className="text-ink-300">minimum <PrivateAmount>{formatCAD(d.minimumPayment)}</PrivateAmount>/mois</span>
                                            </div>
                                            {/* Bureau : pastilles ; un taux élevé (≥ 8 %, seuil du signal « dette à taux élevé ») en rouge. */}
                                            <div className="hidden lg:flex flex-wrap gap-2">
                                                <span className={`h-6 px-2.5 rounded-full text-meta flex items-center ${d.interestRate >= 8 ? 'bg-danger-500/10 border border-danger-500/30 text-danger-400' : 'bg-surfaceHighlight text-ink-200'}`}>{d.interestRate.toLocaleString('fr-CA')} %</span>
                                                <span className="h-6 px-2.5 rounded-full bg-surfaceHighlight text-ink-300 text-meta flex items-center">minimum&nbsp;<PrivateAmount>{formatCAD(d.minimumPayment)}</PrivateAmount>/mois</span>
                                            </div>
                                            {/* [DETTE-DATES] Les dates ne sont pas des montants : elles restent visibles en
                                                mode discret. Aucune n'est INVENTÉE — un tiret honnête quand elle manque. */}
                                            {(d.startDate || d.termEndDate) && (
                                                <div className="text-tiny text-ink-400">
                                                    {d.startDate ? `Début ${d.startDate}` : 'Début —'}
                                                    {' → '}
                                                    {d.termEndDate ? `fin ${d.termEndDate}` : 'fin —'}
                                                </div>
                                            )}
                                            {/* Toujours visibles (maquettes) : plus de liens révélés au survol, inutilisables au doigt. */}
                                            <div className="flex gap-3.5 text-meta">
                                                <button type="button" onClick={() => startEdit(d)} className="text-primary underline underline-offset-2 focus-ring rounded-sm">Modifier</button>
                                                <button type="button" onClick={() => handleDelete(d.id)} className="text-ink-300 underline underline-offset-2 hover:text-danger-400 focus-ring rounded-sm">Supprimer</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {debts.length === 0 && (
                                <div className="rounded-2xl bg-surface border border-white/6 lg:border-0 p-4">
                                    <EmptyState
                                        variant="subtle"
                                        icon={<Icon name="celebrate" size={30} />}
                                        title="Aucune dette"
                                        description="Bravo ! Votre santé financière est au beau fixe."
                                    />
                                </div>
                            )}
                    </section>
                    <Card title="Remboursement">
                        <div className="space-y-3.5">
                            <div>
                                <label className="flex justify-between text-body text-ink-200 mb-2"><span>Paiement supplémentaire</span><span className="font-mono text-ink-50"><PrivateSliderValue revealed={extraSliderFocus}>{formatCAD(extraPayment)}</PrivateSliderValue>/mois</span></label>
                                <input type="range" aria-label="Paiement supplémentaire" min="0" max="2000" step="50" value={extraPayment} {...maskedSliderAria(isPrivacyMode && !extraSliderFocus)} onChange={e => setExtraPayment(Number(e.target.value))} onFocus={() => setExtraSliderFocus(true)} onBlur={() => setExtraSliderFocus(false)} className="w-full accent-primary cursor-pointer" />
                                <div className="text-[13px] text-ink-400 mt-1.5">En plus des minimums (<PrivateAmount>{formatCAD(totalMinPayment)}</PrivateAmount>) : <PrivateAmount>{formatCAD(totalMinPayment + extraPayment)}</PrivateAmount> par mois au total.</div>
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                                <div className="px-3 lg:px-3.5 py-3 rounded-xl bg-dark lg:bg-surface lg:border lg:border-white/6">
                                    <div className="text-meta text-ink-400">Liberté dans</div>
                                    <div className="font-mono lg:font-sans text-[20px] lg:text-[22px] font-bold text-success-400">{simulation.valide ? `${formatNumber(simulation.months / 12, { decimals: 1 })} ans` : '—'}</div>
                                </div>
                                {/* [S5-REFONTE-DETTES] « Intérêts évités : Calculé vs Min. » n'affichait AUCUN chiffre :
                                    remplacé par les intérêts réellement payés d'ici l'extinction (même simulation que la courbe). */}
                                <div className="px-3 lg:px-3.5 py-3 rounded-xl bg-dark lg:bg-surface lg:border lg:border-white/6">
                                    <div className="text-meta text-ink-400">Intérêts payés</div>
                                    {simulation.valide
                                        ? <PrivateAmount as="div" className="font-mono text-[20px] font-bold text-warning-400 lg:text-ink-50">{formatCAD(Math.round(simulation.totalInterest))}</PrivateAmount>
                                        : <div className="font-mono text-[20px] font-bold text-ink-50">—</div>}
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
                <div className="space-y-4 min-w-0">
                    {/* [S5-REFONTE-DETTES] Légende à droite du titre (bureau) ou dessous (mobile, le titre ne se
                        tronque pas) ; axe des montants à droite au bureau ; repères « aujourd'hui, 6 mois… ». */}
                    <Card title="Extinction de la dette" action={<span className="hidden sm:flex">{legende}</span>}>
                        <div className="sm:hidden -mt-2 mb-3">{legende}</div>
                        <div
                            role="img"
                            aria-label="Courbe d'extinction de la dette — solde total restant et intérêts cumulés, mois par mois, jusqu'au remboursement complet selon le paiement supplémentaire choisi."
                        >
                        {/* Pas d'indice « molette = zoom » : il recouvrait les repères de l'axe (le zoom reste actif). */}
                        <ZoomContainer zoom={zoom} hint={false} style={{ width: '100%', height: etroit ? '220px' : '360px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={zoom.visibleData} margin={{ top: 10, right: etroit ? 4 : 0, left: 0, bottom: 0 }}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                                    <XAxis dataKey="month" tick={<TickMois />} tickLine={false} axisLine={false} ticks={reperesMois} interval={0} />
                                    <YAxis orientation={etroit ? 'left' : 'right'} ticks={reperesMontants} domain={[0, 'dataMax']} stroke="#8896a8" tick={{ fontSize: etroit ? 10 : 11, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} width={etroit ? 40 : 48} tickFormatter={maskedTick(isPrivacyMode, (val: number) => formatCompactCAD(val))} />
                                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelFormatter={(m: number) => (m === 0 ? "Aujourd'hui" : `Dans ${m} mois`)} formatter={(val: number) => (isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(val))} />
                                    <Area type="monotone" dataKey="balance" stroke="#e0703a" fill="#e0703a" fillOpacity={0.35} name="Solde restant" strokeWidth={2} />
                                    <Line type="monotone" dataKey="interestAccumulated" stroke="#fbbf24" strokeWidth={2} dot={false} name="Intérêts cumulés" />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </ZoomContainer>
                        </div>
                        {/* [A11Y-CHARTS] — alternative TEXTUELLE (sr-only) à la courbe d'extinction :
                            mêmes données (solde + intérêts cumulés par mois) en table accessible. */}
                        <ChartDataTable
                            caption="Solde de dette restant et intérêts cumulés par mois"
                            columns={debtColumns}
                            rows={simulation.chart}
                        />
                    </Card>
                    <div className="p-4 rounded-2xl bg-info-500/5 border border-info-500/25 flex gap-3 items-start">
                        <Icon name="info" size={20} className="text-info-400 shrink-0 mt-0.5" />
                        <div>
                            <h3 className="font-semibold text-ink-50 text-body">Pris en compte dans le Futur</h3>
                            <p className="text-[13px] leading-5 text-ink-300 mt-1">La projection déduit les <PrivateAmount>{formatCAD(totalMinPayment + extraPayment)}</PrivateAmount> mensuels de tes liquidités jusqu'à ce que chaque dette soit remboursée.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
