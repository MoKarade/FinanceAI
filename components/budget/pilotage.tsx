// components/budget/pilotage.tsx
//
// [S5-REFONTE-BUDGET] La barre de pilotage du budget (période, mois affiché, personne) SORT de
// <Budget> pour monter dans l'en-tête de page (maquettes E/M-budget : à droite des onglets au bureau,
// à droite du titre et sous les onglets sur mobile). L'état vit dans `useBudgetPilotage` : l'espace
// Budget le crée et le passe à <Budget> ; un <Budget> rendu seul (tests, autre hôte) crée le sien et
// affiche lui-même les contrôles — un seul état, jamais deux copies désaccordées.
import React, { useState } from 'react';
import { Icon } from '../ui/Icon';
import { Pill } from '../ui/Pill';

export type TimeView = 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';

/** [BUDGET-INCOME-WINDOW-UTC-OFFBYONE] Jour LOCAL `YYYY-MM-DD` (jamais `.toISOString()`). */
export function toLocalDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export interface BudgetPilotage {
    timeView: TimeView;
    setTimeView: (v: TimeView) => void;
    /** 0 = période courante, −1 = précédente… */
    periodOffset: number;
    setPeriodOffset: React.Dispatch<React.SetStateAction<number>>;
    /** Filtre personne en mode couple (null = tout combiné). */
    personFilter: 0 | 1 | null;
    setPersonFilter: (p: 0 | 1 | null) => void;
    customStart: string;
    setCustomStart: (s: string) => void;
    customEnd: string;
    setCustomEnd: (s: string) => void;
}

export function useBudgetPilotage(): BudgetPilotage {
    const [timeView, setTimeView] = useState<TimeView>('MONTH');
    const [periodOffset, setPeriodOffset] = useState(0);
    const [personFilter, setPersonFilter] = useState<0 | 1 | null>(null);
    // [BUDGET-INCOME-WINDOW-UTC-OFFBYONE] `toLocalDateStr` : le 1er du mois LOCAL, même sous un
    // fuseau positif (finding code-reviewer #751).
    const [customStart, setCustomStart] = useState(() => toLocalDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
    const [customEnd, setCustomEnd] = useState(() => toLocalDateStr(new Date()));
    return { timeView, setTimeView, periodOffset, setPeriodOffset, personFilter, setPersonFilter, customStart, setCustomStart, customEnd, setCustomEnd };
}

/** Libellé de la période affichée (« sept. 2026 », « T3 2026 », « 2026 »). */
export function libellePeriode(timeView: TimeView, periodOffset: number, maintenant: Date = new Date()): string {
    if (timeView === 'MONTH') {
        return new Date(maintenant.getFullYear(), maintenant.getMonth() + periodOffset, 1).toLocaleDateString('fr-CA', { month: 'short', year: 'numeric' });
    }
    if (timeView === 'QUARTER') {
        const debut = new Date(maintenant.getFullYear(), (Math.floor(maintenant.getMonth() / 3) + periodOffset) * 3, 1);
        return `T${Math.floor(debut.getMonth() / 3) + 1} ${debut.getFullYear()}`;
    }
    return String(maintenant.getFullYear() + periodOffset);
}

export const ChoixPeriode: React.FC<{ p: BudgetPilotage }> = ({ p }) => (
    <Pill
        aria-label="Période"
        value={p.timeView}
        onChange={(v) => { p.setTimeView(v as TimeView); p.setPeriodOffset(0); }}
        options={[
            { value: 'MONTH', label: 'Mois' },
            { value: 'QUARTER', label: 'Trim.' },
            { value: 'YEAR', label: 'Année' },
            { value: 'CUSTOM', label: 'Dates', title: 'Période personnalisée' },
        ]}
    />
);

/** « ‹ sept. 2026 › » ; en période personnalisée, les deux dates. */
export const NavigateurPeriode: React.FC<{ p: BudgetPilotage }> = ({ p }) => {
    if (p.timeView === 'CUSTOM') {
        return (
            <div className="flex items-center gap-1 h-10 px-2 rounded-lg border border-white/12 focus-within:border-white/30 transition-colors">
                <input type="date" value={p.customStart} onChange={(e) => p.setCustomStart(e.target.value)} className="champ-nu bg-transparent text-ink-100 text-meta border-none outline-hidden w-28" aria-label="Date de début" />
                <span className="text-ink-400" aria-hidden="true">–</span>
                <input type="date" value={p.customEnd} onChange={(e) => p.setCustomEnd(e.target.value)} className="champ-nu bg-transparent text-ink-100 text-meta border-none outline-hidden w-28" aria-label="Date de fin" />
            </div>
        );
    }
    return (
        <div className="flex items-center h-10 rounded-lg border border-white/12">
            <button
                type="button"
                onClick={() => p.setPeriodOffset((o) => o - 1)}
                title="Période précédente"
                aria-label="Période précédente"
                className="h-9 px-2 text-ink-300 hover:text-ink-50 rounded-l-lg focus-ring"
            >
                <Icon name="chevron-left" size={15} />
            </button>
            <span className="text-[13px] text-ink-100 whitespace-nowrap" aria-live="polite">{libellePeriode(p.timeView, p.periodOffset)}</span>
            <button
                type="button"
                onClick={() => p.setPeriodOffset((o) => Math.min(0, o + 1))}
                disabled={p.periodOffset >= 0}
                title={p.periodOffset >= 0 ? 'Période actuelle' : 'Période suivante'}
                aria-label="Période suivante"
                className="h-9 px-2 text-ink-300 hover:text-ink-50 rounded-r-lg focus-ring disabled:opacity-30 disabled:cursor-not-allowed"
            >
                <Icon name="chevron-right" size={15} />
            </button>
            {p.periodOffset !== 0 && (
                <button
                    type="button"
                    onClick={() => p.setPeriodOffset(0)}
                    title="Revenir à la période actuelle"
                    className="h-full pr-2.5 text-meta text-ink-200 underline underline-offset-2 focus-ring rounded-sm"
                >
                    Auj.
                </button>
            )}
        </div>
    );
};

/** Couple / prénom 1 / prénom 2 — rendu seulement en mode couple. */
export const ChoixPersonne: React.FC<{ p: BudgetPilotage; noms: [string, string] }> = ({ p, noms }) => (
    <Pill
        aria-label="Filtre personne"
        value={p.personFilter === null ? 'all' : (p.personFilter === 0 ? 'user1' : 'user2')}
        onChange={(v) => p.setPersonFilter(v === 'all' ? null : v === 'user1' ? 0 : 1)}
        options={[
            { value: 'all', label: 'Couple' },
            { value: 'user1', label: noms[0].split(' ')[0] || 'P1' },
            { value: 'user2', label: noms[1].split(' ')[0] || 'P2' },
        ]}
    />
);
