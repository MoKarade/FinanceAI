// components/debt/debtKindLabels.ts
//
// [DEBT-UI-PAR-TYPE] Libellés FRANÇAIS des onze types de dette, pour les formulaires.
//
// ⚠️ `Record<DebtKind, string>` EXHAUSTIF, jamais une map partielle : ajouter une valeur à
// `DEBT_KINDS` casse le typecheck ICI tant que personne ne lui a écrit un libellé. Même choix, et
// pour la même raison, que `KIND_AMORTISSANT` dans `services/projection/debtAmortization.ts` — un
// défaut par OMISSION (un type qui s'affiche sous son identifiant technique, ou pire, qui disparaît
// de la liste) est la forme d'erreur que ce dépôt paie le plus cher.
//
// Les libellés disent ce que l'utilisateur RECONNAÎT sur son contrat, pas le nom du champ : « Bail
// auto » et « Prêt auto » sont deux lignes distinctes parce que les confondre change ce que le
// moteur fait de la dette (un bail ne s'amortit pas).

import { DEBT_KINDS, type DebtKind } from '../../types';

export const DEBT_KIND_LABELS: Readonly<Record<DebtKind, string>> = {
    mortgage: 'Hypothèque',
    heloc: 'Marge hypothécaire (HELOC)',
    auto: 'Prêt auto',
    'auto-lease': 'Bail auto (location)',
    'student-federal': 'Prêt étudiant fédéral',
    'student-quebec': 'Prêt étudiant (Québec)',
    'credit-card': 'Carte de crédit',
    personal: 'Prêt personnel',
    margin: 'Marge de crédit',
    'spouse-loan': 'Prêt au conjoint',
    other: 'Autre',
};

/** Les types dans l'ordre de `DEBT_KINDS` (source unique), pour peupler un `<select>`. */
export const DEBT_KIND_OPTIONS: ReadonlyArray<{ value: DebtKind; label: string }> =
    DEBT_KINDS.map(k => ({ value: k, label: DEBT_KIND_LABELS[k] }));
