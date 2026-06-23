// components/ui/PrivateNumberInput.tsx
// [SEC-PRIVACY-BLUR-INPUTS, audit 2026-06-23] Champ numérique ÉDITABLE compatible MODE DISCRET.
//
// Avant : la classe CSS `privacy-blur` (flou) laissait la VALEUR dans le DOM → lisible par inspecteur,
// copier-coller, lecteur d'écran, ou en désactivant la classe (mêmes fuites que CLAUDE.md interdit pour
// l'affichage, cf <PrivateAmount>).
//
// Ici, en mode discret ET hors-focus, on rend « ••• » SANS rendre la valeur (hors DOM). Au clic ou au
// focus clavier, on révèle un vrai <input> pour éditer ; le blur re-masque. Le bouton masqué stoppe la
// propagation (clic ET focus) — un champ embarqué dans une ligne cliquable ne doit pas la toggler.
//
// Limite assumée : une fois EN ÉDITION, la valeur est dans `.value` — inhérent à tout champ éditable lié
// au store (la valeur est de toute façon dans l'état React/Zustand, inspectable). On protège l'état
// d'AFFICHAGE (regard par-dessus l'épaule / capture / lecteur d'écran) et on re-masque dès que le mode
// discret est (ré)activé, même en cours d'édition.
import React, { useState, useRef, useEffect } from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';

type Props = React.InputHTMLAttributes<HTMLInputElement>;

export const PrivateNumberInput: React.FC<Props> = ({ className = '', onBlur, onClick, autoFocus, id, ...rest }) => {
    const isPrivacy = useFinanceStore((s) => s.isPrivacyMode);
    const [revealed, setRevealed] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Re-masque si le mode discret est (ré)activé : la confidentialité l'emporte sur l'édition en cours.
    useEffect(() => {
        if (isPrivacy) setRevealed(false);
    }, [isPrivacy]);

    // Focus programmatique fiable (clavier inclus, ≠ `autoFocus` qui n'agit qu'au montage et peut perdre
    // le focus dans la bascule button→input sur certains navigateurs).
    useEffect(() => {
        if (isPrivacy && revealed) inputRef.current?.focus();
    }, [isPrivacy, revealed]);

    if (isPrivacy && !revealed) {
        return (
            <button
                id={id}
                type="button"
                className={`${className} focus-ring min-h-[24px]`}
                aria-label={`${MASKED_AMOUNT_LABEL} — cliquer pour modifier`}
                title={MASKED_AMOUNT_LABEL}
                onClick={(e) => { e.stopPropagation(); setRevealed(true); }}
                onFocus={(e) => { e.stopPropagation(); setRevealed(true); }}
            >
                <span aria-hidden="true" className="select-none tracking-widest">•••</span>
            </button>
        );
    }

    return (
        <input
            {...rest}
            id={id}
            ref={inputRef}
            className={className}
            onClick={onClick}
            autoFocus={autoFocus}
            onBlur={(e) => { onBlur?.(e); if (isPrivacy) setRevealed(false); }}
        />
    );
};
