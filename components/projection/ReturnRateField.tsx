import React from 'react';

/**
 * [FUTUR-MOBILE-PR4] Curseur + champ numérique SYNCHRONISÉS sur la MÊME valeur — décision Marc
 * 2026-09-10 pour l'onglet Hypothèses mobile (les steppers +/- étaient écartés). Les deux contrôles
 * appellent le MÊME `onChange` : casser l'un des deux fils fait diverger le curseur du champ, ce que
 * le test de ce composant PROUVE en perturbant chaque sens séparément.
 *
 * ⚠️ Usage MOBILE UNIQUEMENT (décision Marc « zéro changement visuel desktop ») : le desktop garde
 * ses `<input type="range">` bruts inchangés dans `ProjectionControls.tsx` — ce composant n'y est
 * jamais monté, pour ne courir aucun risque de diff visuel desktop.
 *
 * Nom accessible : le curseur porte son propre `aria-label` (role="slider"), le champ numérique un
 * `<label htmlFor>` (role="spinbutton") — même texte, rôles distincts, donc pas d'ambiguïté pour un
 * lecteur d'écran ni pour `getByRole`.
 */

const slugify = (s: string): string =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');

export interface ReturnRateFieldProps {
    label: string;
    /** Nom accessible du curseur, si différent du libellé visible (ex. inclut déjà un %). */
    ariaLabel?: string;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step: number;
    unit?: string;
    /** Classe Tailwind de couleur du texte pour le champ numérique (ex. "text-warning-400"). */
    colorClassName: string;
    /** Classe Tailwind `accent-*` pour le curseur (ex. "accent-warning-500"). */
    accentClassName: string;
    id?: string;
}

export const ReturnRateField: React.FC<ReturnRateFieldProps> = ({
    label, ariaLabel, value, onChange, min, max, step, unit = '%', colorClassName, accentClassName, id,
}) => {
    const numberId = id ?? `rrf-${slugify(label)}`;
    const clamp = (v: number) => Math.min(max, Math.max(min, v));
    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-1">
                <label htmlFor={numberId} className="text-meta text-ink-300">{label}</label>
                <span className="flex items-center gap-1 shrink-0">
                    <input
                        type="number"
                        id={numberId}
                        value={value}
                        min={min}
                        max={max}
                        step={step}
                        onChange={(e) => {
                            if (e.target.value === '') return; // laisse taper sans imposer 0 en cours de frappe
                            onChange(clamp(Number(e.target.value)));
                        }}
                        className={`w-16 min-h-[44px] text-right bg-black/30 border border-white/10 rounded px-1.5 text-meta font-bold focus-ring ${colorClassName}`}
                    />
                    {unit && <span className="text-tiny text-ink-400">{unit}</span>}
                </span>
            </div>
            <input
                type="range"
                aria-label={ariaLabel ?? label}
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className={`w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer ${accentClassName}`}
            />
        </div>
    );
};
