import React, { useState, useMemo } from 'react';
import { CHART_TOOLTIP_STYLE } from '../utils/chartTooltip';
import { Card } from './ui/Card';
import { PrivateAmount } from './ui/PrivateAmount';
import { PrivateSliderValue } from './ui/PrivateSliderValue';
import { EmptyState } from './ui/EmptyState';
import { PageHeader } from './ui/PageHeader';
import { Icon } from './ui/Icon';
import { Badge } from './ui/Badge';
import { Debt } from '../types';
import { useTodayIsoLocal } from '../hooks/useSimulationParams';
import { soldeDetteAujourdhui, statutSoldeDette, marchandsCandidats, dettesAuSoldeDuJour, clePayee, type StatutSoldeDette } from '../services/projection/debtAmortization';
import { computeTotalDebt } from '../services/portfolio';
import { ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';
import { ConfirmModal } from './ui/ConfirmModal';
import { useTimeChartZoom } from '../hooks/useTimeChartZoom';
import { ZoomContainer } from './ui/ZoomContainer';
import { ChartDataTable, type ChartDataColumn } from './ui/ChartDataTable';
import { MASKED_AMOUNT_LABEL, maskedSliderAria } from '../utils/privacyAria';
import { maskedTick } from '../utils/chartPrivacy';
import { useFinanceStore } from '../store/useFinanceStore';
import { formatCAD, formatIsoDay } from '../utils/format';
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
        <div className="space-y-6 stagger-in pb-20">
            <ConfirmModal isOpen={!!confirmDeleteId} onConfirm={doConfirmDelete} onCancel={() => setConfirmDeleteId(null)} title="Supprimer la dette" message="Supprimer cette dette définitivement ?" confirmLabel="Supprimer" />
            {/* [REFONTE-NAV-L3] Titre aligné sur TAB_LABELS (« Dettes ») — la page et la nav
                doivent dire la même chose (passe de cohérence Config). */}
            <PageHeader
                icon={<Icon name="debt" size={28} />}
                title="Dettes"
                badge={<Badge variant={totalDebt > 0 ? 'danger' : 'success'} size="md">Total Dû: <PrivateAmount>{formatCAD(totalDebt)}</PrivateAmount></Badge>}
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                    <Card title="Vos Dettes" action={<button onClick={() => { setIsAdding(!isAdding); setRefusSaisie(null); }} className="text-meta bg-white/10 px-2 py-1 rounded-sm hover:bg-white/20">+ Ajouter</button>}>
                        {isAdding && (
                            <div className="mb-4 p-3 bg-white/5 rounded-sm border border-white/10 space-y-2">
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
                        <div className="space-y-3">
                            {debts.map(d => (
                                <div key={d.id} className="p-3 bg-[#1a1a1a] rounded-xl border border-white/5 group">
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
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <div className="font-bold text-white text-body">{d.name}</div>
                                                <div className="text-meta text-ink-400">{d.interestRate}% • Min: <PrivateAmount>{formatCAD(d.minimumPayment)}</PrivateAmount></div>
                                                {/* [DETTE-DATES] Les dates ne sont pas des montants : elles restent visibles en
                                                    mode discret. Aucune n'est INVENTÉE — un tiret honnête quand elle manque. */}
                                                {(d.startDate || d.termEndDate) && (
                                                    <div className="text-tiny text-ink-400 mt-0.5">
                                                        {d.startDate ? `Début ${d.startDate}` : 'Début —'}
                                                        {' → '}
                                                        {d.termEndDate ? `fin ${d.termEndDate}` : 'fin —'}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <PrivateAmount as="div" className="font-mono text-danger-400 font-bold">{formatCAD(soldeDetteAujourdhui(d, todayIso, transactions))}</PrivateAmount>
                                                <div className="flex gap-2 justify-end">
                                                    <button onClick={() => startEdit(d)} className="text-tiny text-ink-400 hover:text-white md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 focus-ring transition-opacity">Modifier</button>
                                                    <button onClick={() => handleDelete(d.id)} className="text-tiny text-ink-400 hover:text-danger-500 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 focus-ring transition-opacity">Supprimer</button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {debts.length === 0 && (
                                <EmptyState
                                    variant="subtle"
                                    icon={<Icon name="celebrate" size={30} />}
                                    title="Aucune dette"
                                    description="Bravo ! Votre santé financière est au beau fixe."
                                />
                            )}
                        </div>
                    </Card>
                    <Card title="Remboursement">
                        <div className="space-y-4">
                            <div>
                                <label className="flex justify-between text-meta text-ink-200 mb-1"><span>Paiement Mensuel Supplémentaire</span><PrivateSliderValue revealed={extraSliderFocus} className="font-bold text-green-400">{formatCAD(extraPayment)}</PrivateSliderValue></label>
                                <input type="range" aria-label="Paiement Mensuel Supplémentaire" min="0" max="2000" step="50" value={extraPayment} {...maskedSliderAria(isPrivacyMode && !extraSliderFocus)} onChange={e => setExtraPayment(Number(e.target.value))} onFocus={() => setExtraSliderFocus(true)} onBlur={() => setExtraSliderFocus(false)} className="w-full h-2 bg-dark rounded-lg appearance-none cursor-pointer accent-green-500" />
                                <div className="text-tiny text-ink-400 mt-1">En plus des minimums (<PrivateAmount>{formatCAD(totalMinPayment)}</PrivateAmount>). Total payé: <strong className="text-white"><PrivateAmount>{formatCAD(totalMinPayment + extraPayment)}</PrivateAmount>/mois</strong>.</div>
                            </div>
                            <div className="p-3 bg-white/5 rounded-sm border border-white/10">
                                <div className="flex justify-between items-center mb-1"><span className="text-meta text-ink-300">Liberté dans</span><span className="text-body font-bold text-white">{simulation.valide ? `${(simulation.months / 12).toFixed(1)} ans` : '—'}</span></div>
                                <div className="flex justify-between items-center"><span className="text-meta text-ink-300">Intérêts évités</span><span className="text-body font-bold text-green-400">Calculé vs Min.</span></div>
                            </div>
                        </div>
                    </Card>
                </div>
                <div className="lg:col-span-2">
                    <Card title="Extinction de la dette">
                        <div
                            role="img"
                            aria-label="Courbe d'extinction de la dette — solde total restant, mois par mois, jusqu'au remboursement complet selon le paiement supplémentaire choisi."
                        >
                        <ZoomContainer zoom={zoom} style={{ width: '100%', height: '350px', minHeight: '350px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={zoom.visibleData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <defs><linearGradient id="colorDebt" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient></defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                    <XAxis dataKey="month" stroke="#666" tick={{fontSize: 10}} tickFormatter={(m) => `M${m}`} />
                                    <YAxis stroke="#666" tick={{fontSize: 10}} width={40} tickFormatter={maskedTick(isPrivacyMode, (val: number) => `${(val/1000).toFixed(0)}k`)} />
                                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(val: number) => (isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(val))} />
                                    <Area type="monotone" dataKey="balance" stroke="#ef4444" fill="url(#colorDebt)" name="Solde Restant" strokeWidth={3} />
                                </AreaChart>
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
                    <div className="mt-6 p-4 bg-blue-900/10 border border-info-500/20 rounded-xl flex gap-4 items-start">
                        <span className="text-2xl">ℹ️</span>
                        <div>
                            <h4 className="font-bold text-blue-300 text-body">Impact sur le Futur</h4>
                            <p className="text-meta text-ink-200 mt-1">Ces dettes sont automatiquement prises en compte dans l'onglet <strong>Futur</strong>. Le simulateur déduit les paiements mensuels (<PrivateAmount>{formatCAD(totalMinPayment + extraPayment)}</PrivateAmount>) de vos liquidités jusqu'à ce que chaque dette soit remboursée.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
