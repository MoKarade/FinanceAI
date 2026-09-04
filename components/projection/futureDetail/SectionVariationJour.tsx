import React, { useState } from 'react';
import { formatCAD } from '../../../utils/format';
import { PrivateAmount } from '../../ui/PrivateAmount';
import { SEUIL_RESIDUEL_SIGNIFICATIF, type DayVariationResult } from '../../../services/history/dayVariation';

/**
 * [GODFILE-FUTUREDETAILMODAL] Section « Variation du patrimoine ce jour-là », extraite telle quelle
 * de FutureDetailModal.tsx (lot 154). Son état de pli (persisté localStorage) et ses libellés de
 * sources ont déménagé avec elle — le parent n'y touchait pas. La CONDITION (`dayIso && variation`)
 * reste chez le parent.
 */
export const SectionVariationJour: React.FC<{ variation: DayVariationResult }> = ({ variation }) => {
    const fmt = (n: number) => formatCAD(n);

    /**
     * [PASSE-REEL-VARIATION-DU-JOUR] Section REPLIABLE, FERMÉE par défaut — choix de Marc
     * (`docs/adr/`), pour garder le panneau court.
     *
     * ⚠️ Je lui ai signalé le risque au moment de la question : une feature gatée par une
     * interaction se fait oublier (`UX-UNREACHABLE-FEATURE`). Il assume, ET les deux contraintes qui
     * en découlent sont donc obligatoires :
     *   • l'état ouvert/fermé est PERSISTÉ — sinon son choix serait à refaire à chaque ouverture,
     *     ce qui transformerait « repliable » en « toujours fermée » ;
     *   • le titre replié dit ce qu'il contient de façon AUTONOME (montant de la variation compris),
     *     pour que la valeur soit lisible SANS déplier.
     */
    const [variationOuverte, setVariationOuverte] = useState<boolean>(() => {
        try { return localStorage.getItem('future:variationJour:open') === '1'; } catch { return false; }
    });
    const basculerVariation = () => {
        setVariationOuverte((v) => {
            const suivant = !v;
            // Persistance DANS le setter — même convention que `future:hiddenSeries:v1`.
            try { localStorage.setItem('future:variationJour:open', suivant ? '1' : '0'); } catch { /* stockage indisponible : le pli reste juste non mémorisé */ }
            return suivant;
        });
    };

    const LIBELLE_SOURCE: Record<string, string> = {
        tresorerie: 'Encaissé / décaissé',
        // ⚠️ Le côté PLACEMENT d'un achat de titre. Il s'annule avec « Encaissé / décaissé » — mais
        // seulement parce que les DEUX sont là : sans cette ligne, le résiduel valait les dépôts.
        depots: 'Placé (achat de titres)',
        rendement: 'Rendement des placements',
        immobilier: 'Équité immobilière',
        dettes: 'Dettes',
    };

    return (
                            <div className="border-t border-white/10 pt-3">
                                <button
                                    type="button"
                                    onClick={basculerVariation}
                                    aria-expanded={variationOuverte}
                                    className="w-full flex items-baseline justify-between gap-2 text-left focus-ring rounded"
                                >
                                    {/* Titre AUTONOME : le montant est lisible sans déplier. */}
                                    <span className="text-tiny uppercase tracking-widest text-ink-400 font-bold">
                                        <span aria-hidden="true" className="mr-1 inline-block">{variationOuverte ? '▾' : '▸'}</span>
                                        Variation du patrimoine ce jour-là
                                    </span>
                                    <PrivateAmount className={`font-mono text-meta ${variation.deltaNetWorth >= 0 ? 'text-green-400' : 'text-danger-400'}`}>
                                        {variation.deltaNetWorth > 0 ? '+' : ''}{fmt(variation.deltaNetWorth)}
                                    </PrivateAmount>
                                </button>

                                {variationOuverte && (
                                    <div className="mt-2 space-y-1">
                                        {variation.sources.filter((src) => Math.abs(src.montant) > 0.005).map((src) => (
                                            <div key={src.cle} className="flex items-baseline justify-between gap-2 text-meta">
                                                <span className="text-ink-300">{LIBELLE_SOURCE[src.cle] ?? src.cle}</span>
                                                <PrivateAmount className={`font-mono ${src.montant >= 0 ? 'text-green-300' : 'text-ink-200'}`}>
                                                    {src.montant > 0 ? '+' : ''}{fmt(src.montant)}
                                                </PrivateAmount>
                                            </div>
                                        ))}

                                        {/* ⚠️ Le RÉSIDUEL est AFFICHÉ, jamais absorbé par un poste
                                            « autre » : un fourre-tout fermerait le total par
                                            construction et la vérification deviendrait circulaire. */}
                                        {Math.abs(variation.residuel) >= SEUIL_RESIDUEL_SIGNIFICATIF && (
                                            <div className="flex items-baseline justify-between gap-2 text-meta border-t border-white/5 pt-1">
                                                <span className="text-amber-300">Non expliqué</span>
                                                <PrivateAmount className="font-mono text-amber-300">
                                                    {variation.residuel > 0 ? '+' : ''}{fmt(variation.residuel)}
                                                </PrivateAmount>
                                            </div>
                                        )}

                                        {/* ⚠️ Ce n'est PLUS le résiduel qui détecte ce cas : depuis que
                                            les dépôts sont une source, il se ferme même quand l'argent
                                            n'a jamais quitté le compte. Ce drapeau prend le relais —
                                            sinon le correctif du résiduel MASQUERAIT le défaut qu'il
                                            rendait visible par accident. */}
                                        {variation.depotsNonFinances > 0.005 && (
                                            <p className="text-tiny text-amber-300/90 leading-snug pt-1">
                                                ⚠ <PrivateAmount as="span" className="font-mono">{fmt(variation.depotsNonFinances)}</PrivateAmount> de titres
                                                sont entrés sans qu'aucune sortie d'argent ne les finance ce jour-là. Ton patrimoine
                                                paraît donc monter d'autant, alors que tu as seulement déplacé de l'argent : l'achat
                                                est probablement marqué « virement interne » dans tes transactions, ce qui l'exclut du
                                                calcul de tes liquidités.
                                            </p>
                                        )}

                                        {/* Mouvement INTERNE : montré parce qu'il est utile, et à somme
                                            nulle sur le patrimoine — les deux lignes ci-dessus
                                            (« Encaissé / décaissé » et « Placé ») s'annulent. */}
                                        {Math.abs(variation.depotsInternes) > 0.005 && (
                                            <p className="text-tiny text-ink-400 leading-snug pt-1">
                                                Dont <PrivateAmount as="span" className="font-mono">{fmt(variation.depotsInternes)}</PrivateAmount> déplacés
                                                de tes liquidités vers tes placements — ça ne change pas ton patrimoine, seulement où il se trouve.
                                            </p>
                                        )}

                                        {variation.immobilierEstPalier && (
                                            <p className="text-tiny text-ink-400 leading-snug pt-1">
                                                L'équité immobilière est connue à l'<strong className="text-ink-200">année</strong>, pas au jour :
                                                elle bouge par palier. Ce n'est pas un gain réalisé ce jour-là.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
    );
};
