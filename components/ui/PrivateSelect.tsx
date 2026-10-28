// components/ui/PrivateSelect.tsx
// [PRIV-CATEGORIE-MASQUEE] Menu déroulant ÉDITABLE compatible MODE DISCRET.
//
// ⚠️ POURQUOI UN COMPOSANT ET PAS UN `PrivateText`. La catégorie d'une transaction n'est pas un
// texte affiché : c'est un `<select>` qu'on modifie. L'envelopper dans `PrivateText` masquerait la
// donnée ET l'édition — on retirerait une fonction pour protéger une valeur, alors que le dépôt a
// déjà résolu ce cas exact pour les MONTANTS (`PrivateNumberInput`, décision `D6-PRIV-MONTANTS`).
// On reprend cet idiome à l'identique plutôt que d'en inventer un troisième :
//   masqué au REPOS → révélé au clic/focus → re-masqué dès que le mode discret est (ré)activé.
//
// ⚠️ Limite assumée, la même que pour les montants : une fois EN ÉDITION, la valeur est dans le
// DOM. C'est inhérent à tout champ lié au store. Ce qu'on protège, c'est l'état d'AFFICHAGE — le
// regard par-dessus l'épaule, la capture d'écran, le lecteur d'écran.
import React, { useState, useRef, useEffect } from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { MASKED_CATEGORY_LABEL } from '../../utils/privacyAria';

type Props = React.SelectHTMLAttributes<HTMLSelectElement>;

export const PrivateSelect: React.FC<Props> = ({ className = '', onBlur, onClick, id, children, ...rest }) => {
    const isPrivacy = useFinanceStore((s) => s.isPrivacyMode);
    const [revealed, setRevealed] = useState(false);
    const selectRef = useRef<HTMLSelectElement>(null);

    // La confidentialité l'emporte sur l'édition en cours : réactiver le mode re-masque.
    useEffect(() => {
        if (isPrivacy) setRevealed(false);
    }, [isPrivacy]);

    useEffect(() => {
        if (isPrivacy && revealed) selectRef.current?.focus();
    }, [isPrivacy, revealed]);

    if (isPrivacy && !revealed) {
        return (
            <button
                id={id}
                type="button"
                className={`${className} focus-ring text-left`}
                // ⚠️ [leçon A11Y-PRIVACY-SALAIRE, reprise telle quelle] PAS d'`aria-label` en dur :
                // il écraserait le nom que l'appelant donne déjà au champ, et TOUS les contrôles
                // masqués d'un écran annonceraient le même nom. On transmet le nommage existant et
                // on porte l'état masqué dans le `title` (description) + un `sr-only` de dernier
                // recours.
                aria-label={rest['aria-label']}
                aria-labelledby={rest['aria-labelledby']}
                title={MASKED_CATEGORY_LABEL}
                onClick={(e) => { e.stopPropagation(); setRevealed(true); }}
                onFocus={(e) => { e.stopPropagation(); setRevealed(true); }}
            >
                <span aria-hidden="true" className="select-none tracking-widest">•••</span>
                <span className="sr-only">{MASKED_CATEGORY_LABEL} — cliquer pour modifier</span>
            </button>
        );
    }

    return (
        <select
            {...rest}
            id={id}
            ref={selectRef}
            className={className}
            onClick={onClick}
            onBlur={(e) => { setRevealed(false); onBlur?.(e); }}
        >
            {children}
        </select>
    );
};
