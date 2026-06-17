// components/ui/PrivateAmount.tsx
// [PRIV-DISCRET-DOM] — primitive de montant pour le MODE DISCRET. Choix Marc 2026-06-17 : on MASQUE la
// VALEUR (« ••• ») au lieu de la flouter. La vraie valeur n'est PLUS rendue en mode privé → elle n'est plus
// dans le DOM du tout (copier-coller, inspecteur, désactivation de classe CSS, lecteur d'écran : zéro fuite).
// Loi 25 / vie privée.
//   - mode privé ACTIF : rend « ••• » (aria-hidden) + un sr-only « Montant masqué » ; la valeur réelle
//     n'est PAS rendue.
//   - mode privé INACTIF : rend la valeur telle quelle (zéro surcoût).
// Migration progressive : remplacer `<span className="privacy-blur">{montant}</span>` par
// `<PrivateAmount className="...">{montant}</PrivateAmount>` (le composant gère tout le masquage).
import React from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';

export const PrivateAmount: React.FC<{
    children: React.ReactNode;
    className?: string;
    /** Élément racine (par défaut `span` ; `div` pour les blocs type KPI). */
    as?: 'span' | 'div';
    /** Infobulle native conservée lors de la migration depuis un `<span title="…">` brut. */
    title?: string;
}> = ({ children, className = '', as = 'span', title }) => {
    const isPrivacy = useFinanceStore((s) => s.isPrivacyMode);
    const Tag = as;
    if (isPrivacy) {
        return (
            <Tag className={className} title={title}>
                <span aria-hidden="true" className="select-none tracking-widest">•••</span>
                <span className="sr-only">{MASKED_AMOUNT_LABEL}</span>
            </Tag>
        );
    }
    return (
        <Tag className={className} title={title}>
            {children}
        </Tag>
    );
};
