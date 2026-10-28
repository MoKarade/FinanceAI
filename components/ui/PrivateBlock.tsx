// components/ui/PrivateBlock.tsx
// [PRIV-DISCRET-DOM] — variante de PrivateAmount pour un BLOC de plusieurs valeurs (conteneur flex/grid).
// Mode discret (choix Marc 2026-06-17) : on MASQUE les valeurs par un unique « ••• » → les vraies valeurs
// ne sont PLUS rendues (elles sortent du DOM, pas seulement floutées). Le conteneur est `aria-hidden` et un
// `sr-only` « Montant masqué » est annoncé en FRÈRE (hors du conteneur masqué). Réservé aux blocs dont les
// enfants sont des VALEURS (pas des libellés) — sinon utiliser un masquage par valeur (`<PrivateAmount>`).
import React from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';

export const PrivateBlock: React.FC<{
    children: React.ReactNode;
    className?: string;
    /** Élément racine du bloc (par défaut `div`). */
    as?: 'span' | 'div';
    /** Infobulle native conservée lors de la migration depuis un conteneur `title="…"` brut. */
    title?: string;
}> = ({ children, className = '', as = 'div', title }) => {
    const isPrivacy = useFinanceStore((s) => s.isPrivacyMode);
    const Tag = as;
    if (isPrivacy) {
        return (
            <>
                <Tag className={className} title={title} aria-hidden="true">
                    <span className="select-none tracking-widest">•••</span>
                </Tag>
                <span className="sr-only">{MASKED_AMOUNT_LABEL}</span>
            </>
        );
    }
    return (
        <Tag className={className} title={title}>
            {children}
        </Tag>
    );
};
