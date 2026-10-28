// components/ui/PrivateSliderValue.tsx
// [D6-PRIV-MONTANTS] (décision Marc 2026-07-06) — étiquette de VALEUR d'un slider compatible MODE
// DISCRET, symétrique de PrivateNumberInput : masquée « ••• » au repos, RÉVÉLÉE pendant que le
// slider a le focus (on ne peut pas ajuster un montant qu'on ne voit pas). La vraie valeur n'est
// pas rendue au repos (hors DOM — mêmes garanties que PrivateAmount) ; le sr-only annonce le
// masquage aux lecteurs d'écran.
// ⚠️ (panel #553) L'<input type="range"> associé garde son aria-valuenow RÉEL en tout temps — un
// lecteur d'écran en mode PARCOURS l'annonce même hors focus : chaque slider consommateur DOIT
// aussi porter `{...maskedSliderAria(isPrivacyMode && !<focus>)}` (utils/privacyAria), sinon ce
// composant ne masque que la moitié de la fuite. Le `&& !<focus>` donne à l'utilisateur SR la
// MÊME symétrie qu'au visuel : valeur audible PENDANT l'ajustement, masquée au parcours.
//
// Usage : l'appelant fournit `revealed` (focus du slider associé, via onFocus/onBlur) :
//   const [sliderFocus, setSliderFocus] = useState(false);
//   <PrivateSliderValue revealed={sliderFocus}>{formatCAD(v)}</PrivateSliderValue>
//   <input type="range" … onFocus={() => setSliderFocus(true)} onBlur={() => setSliderFocus(false)} />
import React from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';

export const PrivateSliderValue: React.FC<{
    /** true pendant que le slider associé a le focus → valeur visible pour l'ajustement. */
    revealed: boolean;
    children: React.ReactNode;
    className?: string;
}> = ({ revealed, children, className = '' }) => {
    const isPrivacy = useFinanceStore((s) => s.isPrivacyMode);
    if (isPrivacy && !revealed) {
        return (
            <span className={className}>
                <span aria-hidden="true" className="select-none tracking-widest">•••</span>
                <span className="sr-only">{MASKED_AMOUNT_LABEL}</span>
            </span>
        );
    }
    return <span className={className}>{children}</span>;
};
