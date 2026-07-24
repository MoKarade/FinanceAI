import React, { useRef } from 'react';

export interface PillOption<T extends string> {
    value: T;
    label: React.ReactNode;
    icon?: React.ReactNode;
    title?: string;
}

interface PillProps<T extends string> {
    options: PillOption<T>[];
    value: T;
    /**
     * [A11Y-PILL-RADIOGROUP] La sélection SUIT le focus (flèches = activation immédiate, pattern
     * radio APG) → `onChange` peut être appelé en rafale sur une navigation clavier maintenue.
     * Le réserver à des actions BON MARCHÉ/idempotentes (setState, filtre client) ou débouncées —
     * PAS un fetch réseau synchrone soumis à rate-limit (finding a11y-auditor #506).
     */
    onChange: (value: T) => void;
    size?: 'sm' | 'md';
    fullWidth?: boolean;
    /** [A11Y-PILL-RADIOGROUP] REQUIS : un radiogroup sans nom accessible viole WCAG 4.1.2 (finding a11y-auditor). */
    'aria-label': string;
    className?: string;
}

const SIZE_CLASSES = {
    // [A11Y-PILL-RADIOGROUP] `min-h-[24px]` : cible tactile ≥ 24 px (WCAG 2.2 SC 2.5.8) — le `sm`
    // (py-1 + text-tiny) tombait sous 24 px selon la police.
    sm: 'px-3 py-1 text-tiny min-h-[24px]',
    md: 'px-4 py-1.5 text-meta',
} as const;

export function Pill<T extends string>({
    options, value, onChange, size = 'md', fullWidth = false,
    className = '', ...rest
}: PillProps<T>) {
    // [A11Y-PILL-RADIOGROUP] Pattern APG radiogroup : roving tabindex (seule l'option sélectionnée est
    // tabbable → 1 arrêt de Tab pour tout le groupe) + navigation aux flèches (la sélection SUIT le focus,
    // comportement natif d'un radio). Avant : chaque option était un arrêt de Tab, sans flèches (7 arrêts
    // pour le sélecteur de période — finding a11y-auditor #498). Corrigé UNE fois → profite aux 3+ usages.
    const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
    // Hoisté (finding code-reviewer) : évite de dépendre du court-circuit `&&`/`||` pour rester en O(n)
    // — sert au repli du roving tabindex quand `value` ne matche aucune option (groupe jamais intabbable).
    const hasSelection = options.some(o => o.value === value);

    const focusAndSelect = (index: number) => {
        const n = options.length;
        const i = ((index % n) + n) % n; // wrap dans les deux sens
        const opt = options[i];
        if (!opt) return;
        onChange(opt.value); // la sélection suit le focus (APG radio)
        btnRefs.current[i]?.focus();
    };

    const onKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                e.preventDefault();
                focusAndSelect(currentIndex + 1);
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                focusAndSelect(currentIndex - 1);
                break;
            case 'Home':
                e.preventDefault();
                focusAndSelect(0);
                break;
            case 'End':
                e.preventDefault();
                focusAndSelect(options.length - 1);
                break;
            default:
                break;
        }
    };

    return (
        <div
            role="radiogroup"
            aria-label={rest['aria-label']}
            className={[
                'inline-flex bg-black/40 p-1 rounded-pill border border-white/10',
                fullWidth ? 'w-full' : '',
                className,
            ].filter(Boolean).join(' ')}
        >
            {options.map((opt, index) => {
                const isSelected = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        ref={(el) => { btnRefs.current[index] = el; }}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        // Roving tabindex : seule l'option sélectionnée est tabbable (repli sur la 1re
                        // si `value` ne matche aucune option, pour ne jamais rendre le groupe intabbable).
                        tabIndex={isSelected || (index === 0 && !hasSelection) ? 0 : -1}
                        onClick={() => onChange(opt.value)}
                        onKeyDown={(e) => onKeyDown(e, index)}
                        title={opt.title}
                        className={[
                            'inline-flex items-center justify-center gap-1.5 rounded-pill font-bold transition-all focus-ring',
                            SIZE_CLASSES[size],
                            fullWidth ? 'flex-1' : '',
                            isSelected
                                ? 'bg-primary text-dark shadow'
                                : 'text-ink-300 hover:text-ink-50 hover:bg-white/5',
                        ].filter(Boolean).join(' ')}
                    >
                        {opt.icon && <span aria-hidden="true">{opt.icon}</span>}
                        <span>{opt.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
