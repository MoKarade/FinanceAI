// components/ui/PrivateAmount.tsx
// [D6-SR] — primitive de montant compatible MODE PRIVÉ. Le mécanisme historique (`privacy-blur`)
// n'est que du CSS (blur) : le montant reste en TEXTE dans le DOM → lu intégralement par un lecteur
// d'écran (fuite). Cette primitive ajoute la couche accessibilité :
//   - mode privé ACTIF : la valeur est `aria-hidden` (invisible aux SR) + un `sr-only`
//     « Montant masqué » est annoncé à la place ; le blur CSS continue de gérer le visuel
//     (et son dé-floutage au survol, inchangé).
//   - mode privé INACTIF : rend la valeur telle quelle (zéro surcoût).
// Migration progressive : remplacer `<span className="privacy-blur">{montant}</span>` par
// `<PrivateAmount className="...">{montant}</PrivateAmount>` (mêmes classes, le composant ajoute
// `privacy-blur` lui-même).
import React from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';

export const PrivateAmount: React.FC<{
    children: React.ReactNode;
    className?: string;
    /** Élément racine (par défaut `span` ; `div` pour les blocs type KPI). */
    as?: 'span' | 'div';
}> = ({ children, className = '', as = 'span' }) => {
    const isPrivacy = useFinanceStore((s) => s.isPrivacyMode);
    const Tag = as;
    return (
        <Tag className={`privacy-blur ${className}`}>
            {isPrivacy ? (
                <>
                    <span aria-hidden="true">{children}</span>
                    <span className="sr-only">{MASKED_AMOUNT_LABEL}</span>
                </>
            ) : (
                children
            )}
        </Tag>
    );
};
