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
import { MASKED_PAYEE_LABEL, MASKED_CATEGORY_LABEL } from '../../utils/privacyAria';

export const PrivateText: React.FC<{
    children: React.ReactNode;
    className?: string;
    as?: 'span' | 'div';
    title?: string;
    /**
     * CE QUI est masqué — pilote uniquement le libellé annoncé au lecteur d'écran.
     *
     * ⚠️ Prop ajoutée quand `[PRIV-CATEGORIE-MASQUEE]` a réutilisé ce composant : une catégorie
     * masquée s'annonçait « Marchand masqué ». Pas une fuite, mais une AFFIRMATION FAUSSE à
     * l'oreille — et sur une colonne entière. Typée en union fermée pour qu'un oubli de valeur
     * soit une erreur de compilation plutôt qu'une annonce muette et fausse.
     */
    quoi?: 'marchand' | 'categorie';
}> = ({ children, className = '', as = 'span', title, quoi = 'marchand' }) => {
    const isPrivacy = useFinanceStore((s) => s.isPrivacyMode);
    const Tag = as;
    if (isPrivacy) {
        return (
            <Tag className={className}>
                <span aria-hidden="true" className="select-none tracking-widest">•••</span>
                <span className="sr-only">{quoi === 'categorie' ? MASKED_CATEGORY_LABEL : MASKED_PAYEE_LABEL}</span>
            </Tag>
        );
    }
    return <Tag className={className} title={title}>{children}</Tag>;
};
