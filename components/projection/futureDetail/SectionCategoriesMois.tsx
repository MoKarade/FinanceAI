import React from 'react';
import { formatCAD } from '../../../utils/format';
import { PrivateAmount } from '../../ui/PrivateAmount';
import { PrivateText } from '../../ui/PrivateText';
import type { monthCategories } from '../../../services/history/monthCategories';

/**
 * [GODFILE-FUTUREDETAILMODAL] Section « Dépenses du mois par catégorie », extraite telle quelle de
 * FutureDetailModal.tsx (lot 154). La CONDITION d'affichage (mois passé identifié + quelque chose à
 * montrer) reste chez le parent — avec les commentaires qui la justifient.
 */
export const SectionCategoriesMois: React.FC<{
    catsDuMois: ReturnType<typeof monthCategories>;
}> = ({ catsDuMois }) => {
    const fmt = (n: number) => formatCAD(n);
    return (
                            <div className="border-t border-white/10 pt-3">
                                <div className="flex items-baseline justify-between gap-2 mb-2">
                                    <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold">
                                        Dépenses du mois par catégorie
                                    </div>
                                    <PrivateAmount className="font-mono text-meta text-ink-200">{fmt(-catsDuMois.totalDepenses)}</PrivateAmount>
                                </div>
                                <div className="space-y-1">
                                    {catsDuMois.depenses.map((c) => (
                                        <div key={c.categorie} className="flex items-baseline justify-between gap-2 text-meta">
                                            <span className="text-ink-200">
                                                <PrivateText quoi="categorie">{c.categorie}</PrivateText>
                                                <span className="ml-1.5 text-tiny text-ink-400">
                                                    {c.nombre} {c.nombre > 1 ? 'transactions' : 'transaction'}
                                                </span>
                                            </span>
                                            <PrivateAmount className="font-mono text-ink-200">{fmt(-c.montant)}</PrivateAmount>
                                        </div>
                                    ))}
                                </div>
                                {/* ⚠️ Dit, jamais fondu dans un « Autre » inventé : une dépense sans
                                    catégorie est un import à classer, pas une catégorie. La ranger
                                    sous un nom fabriqué la rendrait invisible EN TANT QUE problème. */}
                                {catsDuMois.sansCategorie > 0 && (
                                    <>
                                        {/* ⚠️ Une LIGNE avec son MONTANT, pas seulement un compte : sans
                                            elle, l'en-tête affiche un total supérieur à la somme des
                                            lignes et l'écart est laissé à la soustraction mentale. Le
                                            même panneau expose son résiduel en $ trois blocs plus haut ;
                                            la même exigence vaut ici.
                                            ⚠️ Ce n'est PAS une catégorie « Autre » inventée : le libellé
                                            nomme le problème (à classer), pas une nature de dépense. */}
                                        <div className="flex items-baseline justify-between gap-2 text-meta border-t border-white/5 mt-1 pt-1">
                                            <span className="text-amber-300/90">
                                                Sans catégorie
                                                <span className="ml-1.5 text-tiny text-amber-300/70">
                                                    {catsDuMois.sansCategorie} {catsDuMois.sansCategorie > 1 ? 'transactions' : 'transaction'}
                                                </span>
                                            </span>
                                            <PrivateAmount className="font-mono text-amber-300/90">{fmt(-catsDuMois.montantSansCategorie)}</PrivateAmount>
                                        </div>
                                        <p className="text-tiny text-amber-300/90 mt-1.5 leading-snug">
                                            {catsDuMois.sansCategorie > 1 ? 'Ces dépenses sont comptées' : 'Cette dépense est comptée'} dans
                                            le total mais {catsDuMois.sansCategorie > 1 ? 'n\u2019ont' : 'n\u2019a'} pas de catégorie — à classer dans Transactions.
                                        </p>
                                    </>
                                )}
                            </div>
    );
};
