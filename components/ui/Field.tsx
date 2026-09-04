// components/ui/Field.tsx
// [DETTE-UI-PRIMITIVES] Paire label ↔ champ : le `<label htmlFor>` et l'`id` du contrôle sont
// écrits UNE fois, donc ne peuvent plus diverger — c'est la moitié « label+aria » du ticket.
// L'`id` reste EXPLICITE chez l'appelant (jamais généré) : les gardes du dépôt s'ancrent sur des
// ids nommés (`app-*`, `user1-*`), et un id dérivé silencieusement les casserait — et casserait
// les deep-links. Le contrôle enfant reçoit l'`id` par clonage : un seul enfant, n'importe quelle
// primitive de saisie (`Input`, `Select`, `PrivateNumberInput`).
//
// ⚠️ Ce composant ne s'impose PAS aux écrans dont une garde de SOURCE lit l'adjacence
// `<label>…</label><contrôle>` (AdvancedProjectionParams) : là-bas la paire reste écrite en clair,
// c'est la garde qui tient le contrat.
import React from 'react';

interface FieldProps {
    /** Id du contrôle — posé sur le `<label htmlFor>` ET sur l'enfant. Toujours explicite. */
    id: string;
    label: React.ReactNode;
    /** Classes du conteneur (par défaut : simple pile, sans marge imposée). */
    className?: string;
    /** Classes du libellé — par défaut la forme la plus courante des formulaires du dépôt. */
    labelClassName?: string;
    /** LE contrôle de saisie (un seul enfant). */
    children: React.ReactElement<{ id?: string }>;
}

export const Field: React.FC<FieldProps> = ({
    id, label, className = '', labelClassName = 'text-meta text-ink-400', children,
}) => (
    <div className={className}>
        <label htmlFor={id} className={labelClassName}>{label}</label>
        {React.cloneElement(React.Children.only(children), { id })}
    </div>
);
