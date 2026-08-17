// components/ui/PrivateText.tsx
// [PRIV-PAYEE-MODE-DISCRET] Primitive de TEXTE sensible pour le MODE DISCRET — jumelle de
// `PrivateAmount`, même contrat et même idiome (on ne crée pas un 3e patron).
//
// Décision Marc 2026-08-17 : « masquer marchands ». L'audit `A11Y-PRIVACY` du 2026-08-12 n'avait
// couvert que les MONTANTS. Or un nom de marchand daté dessine un profil de dépenses — pharmacie,
// lieu de culte, clinique — et c'est de la donnée personnelle au sens de la Loi 25 même sans le
// montant à côté. Le mode discret sert justement à montrer son écran à quelqu'un.
//
// ⚠️ Comme `PrivateAmount` : la vraie valeur n'est PAS rendue en mode privé — elle n'est donc plus
// dans le DOM du tout (copier-coller, inspecteur, désactivation d'une classe CSS, lecteur d'écran :
// zéro fuite). Un flou CSS aurait laissé la chaîne lisible dans le HTML.
import React from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { MASKED_PAYEE_LABEL } from '../../utils/privacyAria';

export const PrivateText: React.FC<{
    children: React.ReactNode;
    className?: string;
    as?: 'span' | 'div';
    title?: string;
}> = ({ children, className = '', as = 'span', title }) => {
    const isPrivacy = useFinanceStore((s) => s.isPrivacyMode);
    const Tag = as;
    if (isPrivacy) {
        return (
            <Tag className={className}>
                <span aria-hidden="true" className="select-none tracking-widest">•••</span>
                <span className="sr-only">{MASKED_PAYEE_LABEL}</span>
            </Tag>
        );
    }
    return <Tag className={className} title={title}>{children}</Tag>;
};
