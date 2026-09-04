// components/ui/Select.tsx
// [DETTE-UI-PRIMITIVES] Liste déroulante CANONIQUE des formulaires. Même contrat que `ui/Input` :
// la base reproduit la forme déjà peinte (aucun changement visible), `className` s'AJOUTE et ne
// doit porter aucune classe en conflit avec la base (padding, taille de texte). Un `<select>`
// embarqué dans une GRILLE dense (ex. lignes d'assurance de PatrimoineExtended, col-span + px-1)
// reste volontairement hors de cette primitive : sa forme appartient à sa grille.
import React from 'react';

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select: React.FC<SelectProps> = ({ className = '', children, ...rest }) => (
    <select
        className={`bg-dark border border-border rounded px-2 py-1 text-meta text-ink-100${className ? ` ${className}` : ''}`}
        {...rest}
    >
        {children}
    </select>
);
