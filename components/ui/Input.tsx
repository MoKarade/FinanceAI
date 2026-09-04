// components/ui/Input.tsx
// [DETTE-UI-PRIMITIVES] Champ de saisie CANONIQUE (texte/nombre/date/mot de passe).
//
// Trois « variants » qui REPRODUISENT les trois densités déjà peintes dans le dépôt — ce lot
// unifie le CODE, pas l'apparence : chaque écran migré garde exactement ses classes d'avant
// (décision de préservation ; unifier les densités serait un changement VISIBLE, hors périmètre).
//  - `compact` : les grilles de paramètres (AdvancedProjectionParams) — px-2 py-1, texte meta ;
//  - `large`   : les formulaires pleine largeur (Onboarding) — px-3 py-2, rounded-card, focus-ring.
// L'`accent` colore la bordure par section (⚠️ classes ÉCRITES EN ENTIER — Tailwind ne génère
// jamais une classe interpolée). `className` s'AJOUTE (marges, font-mono…) : n'y mettre AUCUNE
// classe qui entre en conflit avec la base (padding, taille de texte) — un conflit Tailwind se
// résout par l'ordre du CSS généré, pas par l'ordre d'écriture, donc en silence et mal.
//
// ⚠️ Pour un MONTANT, la primitive reste `PrivateNumberInput` (mode discret) — `Input` ne masque
// rien et les gardes de vie privée (`AdvancedProjectionParams.privacy` et voisines) interdisent
// déjà un libellé en $ branché sur autre chose que `PrivateNumberInput`.
import React from 'react';

type InputVariant = 'compact' | 'large';
type InputAccent =
    | 'neutral' | 'cyan' | 'orange' | 'pink' | 'rose' | 'slate'
    | 'success' | 'teal' | 'violet' | 'warning' | 'yellow';

const BASES: Record<InputVariant, string> = {
    compact: 'w-full bg-dark border rounded px-2 py-1 text-meta text-white',
    large: 'w-full bg-dark border rounded-card px-3 py-2 text-ink-50 text-body focus-ring',
};

const ACCENTS: Record<InputAccent, string> = {
    neutral: 'border-white/10',
    cyan: 'border-cyan-500/20',
    orange: 'border-orange-500/20',
    pink: 'border-pink-500/20',
    rose: 'border-rose-500/20',
    slate: 'border-slate-500/20',
    success: 'border-success-500/20',
    teal: 'border-teal-500/20',
    violet: 'border-violet-500/20',
    warning: 'border-warning-500/20',
    yellow: 'border-yellow-500/20',
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    variant?: InputVariant;
    accent?: InputAccent;
}

export const Input: React.FC<InputProps> = ({ variant = 'compact', accent = 'neutral', className = '', ...rest }) => (
    <input className={`${BASES[variant]} ${ACCENTS[accent]}${className ? ` ${className}` : ''}`} {...rest} />
);
