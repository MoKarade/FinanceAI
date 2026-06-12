// components/ui/PrivateBlock.tsx
// [D6-SR-2] — variante de PrivateAmount pour les BLOCS de plusieurs valeurs (conteneur flex/grid).
// PrivateAmount wrappe ses enfants dans un <span aria-hidden> → casserait un layout flex multi-enfants
// (les enfants ne seraient plus des flex-items directs). PrivateBlock garde les enfants INTACTS (donc
// le flex/grid du conteneur est préservé) et, en mode privé :
//   - pose `aria-hidden` sur le conteneur lui-même (toutes les valeurs disparaissent de l'arbre SR) ;
//   - ajoute UN `sr-only` « Montant masqué » en FRÈRE (hors du conteneur aria-hidden, donc annoncé).
// Le flou visuel reste géré par `privacy-blur` sur le conteneur (inchangé).
// Critère de bascule : utiliser PrivateBlock quand le `privacy-blur` portait sur un CONTENEUR flex/grid
// dont les enfants doivent rester des items DIRECTS (sinon le wrap de PrivateAmount casse le layout) ;
// pour une valeur unique (même dans un conteneur sans contrainte de layout sur ses enfants), <PrivateAmount>.
import React from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';

export const PrivateBlock: React.FC<{
    children: React.ReactNode;
    className?: string;
    /** Élément racine du bloc (par défaut `div`). */
    as?: 'span' | 'div';
}> = ({ children, className = '', as = 'div' }) => {
    const isPrivacy = useFinanceStore((s) => s.isPrivacyMode);
    const Tag = as;
    return (
        <>
            <Tag className={`privacy-blur ${className}`} aria-hidden={isPrivacy || undefined}>
                {children}
            </Tag>
            {isPrivacy && <span className="sr-only">{MASKED_AMOUNT_LABEL}</span>}
        </>
    );
};
