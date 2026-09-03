// components/debt/DebtKindFields.tsx
//
// [DEBT-UI-PAR-TYPE] Le type de dette, et le montant emprunté quand il a un sens.
//
// ⚠️ Pourquoi un sous-composant plutôt que deux blocs de JSX. `DebtManager` porte DEUX formulaires
// JUMEAUX (ajout et édition) : tout champ écrit deux fois y diverge tôt ou tard — c'est le piège
// `PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`, déjà payé dans ce fichier même. Le ticket proposait de
// découper en `LoanForm`/`LeaseForm` ; ç'aurait DUPLIQUÉ les champs communs (nom, solde, taux,
// paiement, dates) entre deux composants au lieu d'un seul, soit exactement le défaut qu'on veut
// éviter, en plus gros. On extrait donc la PAIRE qui manque, pas le formulaire.
//
// ⚠️ La condition d'affichage du montant emprunté vient de `KIND_AMORTISSANT`, la table que le
// MOTEUR consulte pour décider s'il trace une courbe. Recopier ici une liste « prêt auto, hypo,
// perso… » donnerait un champ visible pour un type que le moteur refuse (l'utilisateur saisirait un
// chiffre sans effet, et rien ne le lui dirait) ou l'inverse. Un formulaire est un consommateur de
// la même vérité qu'un calcul.

import React from 'react';
import { KIND_AMORTISSANT } from '../../services/projection/debtAmortization';
import { DEBT_KIND_OPTIONS } from './debtKindLabels';
import type { Debt, DebtKind } from '../../types';

/** Champ numérique VIDE ⇒ `undefined`, jamais `0` ni `NaN`. « Pas renseigné » n'est pas « zéro » :
 *  un `0` réveillerait un refus pour la mauvaise raison, et un `NaN` traverserait jusqu'au moteur. */
export const nombreSaisiOuAbsent = (v: string): number | undefined => {
    if (v.trim() === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};

/**
 * Message de refus quand le montant emprunté est INFÉRIEUR au solde actuel, `null` sinon.
 *
 * ⚠️ Même règle que l'écriture par l'assistant (`applyDocument`) : sans elle, l'UI accepterait ce
 * que le MCP refuse, et la dette serait écrite avec une origine que le moteur rejetterait EN
 * SILENCE (`origine-incoherente`) — courbe plate, sans explication. Deux chemins d'écriture qui ne
 * disent pas la même chose, c'est l'incohérence qui est le bug (`UN-BOUTON-N-EST-PAS-UN-FILET`).
 */
export const refusOrigineIncoherente = (
    originalBalance: number | undefined,
    balance: number | undefined,
): string | null => {
    if (originalBalance == null || balance == null) return null;
    if (!Number.isFinite(originalBalance) || !Number.isFinite(balance)) return null;
    if (originalBalance >= balance) return null;
    return 'Le montant emprunté est inférieur au solde actuel : une dette qui a grossi n\'a pas de '
        + 'courbe de remboursement. Vérifie les deux chiffres sur ton contrat.';
};

interface Props {
    valeur: Partial<Debt>;
    onChange: (patch: Partial<Debt>) => void;
    /** Suffixe d'identifiant : les deux formulaires coexistent dans le DOM, leurs `id` doivent différer. */
    idSuffixe: string;
}

export const DebtKindFields: React.FC<Props> = ({ valeur, onChange, idSuffixe }) => {
    const kind = valeur.kind;
    const amortissable = kind != null && KIND_AMORTISSANT[kind];
    const refus = refusOrigineIncoherente(valeur.originalBalance, valeur.balance);
    const idKind = `debt-kind-${idSuffixe}`;
    const idOrigine = `debt-original-${idSuffixe}`;

    return (
        <div className="space-y-2">
            <label htmlFor={idKind} className="flex flex-col gap-1 text-tiny text-ink-400">
                Type de dette
                <select
                    id={idKind}
                    className="bg-dark border border-white/10 rounded px-2 py-1 text-meta text-white"
                    value={kind ?? ''}
                    onChange={e => onChange({ kind: (e.target.value || undefined) as DebtKind | undefined })}
                >
                    <option value="">Non précisé</option>
                    {DEBT_KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </label>
            {amortissable && (
                <label htmlFor={idOrigine} className="flex flex-col gap-1 text-tiny text-ink-400">
                    Montant emprunté à l'origine
                    <input
                        id={idOrigine}
                        type="number"
                        inputMode="decimal"
                        placeholder="Ex. 30000"
                        className="bg-dark border border-white/10 rounded px-2 py-1 text-meta text-white"
                        value={valeur.originalBalance ?? ''}
                        onChange={e => onChange({ originalBalance: nombreSaisiOuAbsent(e.target.value) })}
                    />
                </label>
            )}
            {/* La note ne s'affiche QUE là où le champ existe : expliquer un champ absent est du bruit. */}
            {amortissable && (
                <p className="text-tiny text-ink-400">
                    Le montant écrit sur ton contrat de prêt. Il fait apparaître ta dette qui diminue dans
                    la partie passée du graphe Futur. Laisse vide si tu ne l'as pas sous la main : la dette
                    reste alors à son niveau actuel, sans rien d'inventé.
                </p>
            )}
            {/* Le refus est ANNONCÉ (région live montée en permanence, texte vidé quand tout va bien) :
                un message inséré au moment où il doit parler rate la première transition. */}
            <p role="status" className="text-tiny text-danger-400 empty:hidden">{refus ?? ''}</p>
        </div>
    );
};
