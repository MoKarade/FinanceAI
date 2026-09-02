import React, { useState } from 'react';
import { Icon } from '../ui/Icon';
import { Card } from '../ui/Card';
import { useFinanceStore } from '../../store/useFinanceStore';
import { messageErreurIa } from '../../services/messageErreurIa';
import { getCoupleOptimizationStrategies, type CoupleOptimizationStrategy, type CoupleTaxContext } from '../../services/claude';
import { formatCAD } from '../../utils/format';
import { PrivateAmount } from '../ui/PrivateAmount';

/**
 * Phase G.4 — Optimisation fiscale croisée pour couple.
 *
 * Affiche un bouton "Générer stratégies IA" qui appelle Claude Haiku avec
 * le contexte fiscal complet du couple. Retourne 3 suggestions concrètes :
 *  - Spousal RRSP (allocation REER conjoint)
 *  - Allocation CELI optimale
 *  - Pension splitting (si retraite)
 *  - Transferts de crédits
 *  - Etc.
 *
 * Cache de session (pas localStorage — sensible). Refresh manuel.
 */

const CONFIDENCE_COLORS: Record<CoupleOptimizationStrategy['confidence'], string> = {
    high: 'text-emerald-300 border-success-500/30 bg-success-500/5',
    medium: 'text-amber-300 border-warning-500/30 bg-warning-500/5',
    low: 'text-ink-300 border-white/10 bg-white/5',
};

/**
 * [AI-COUPLE-SELFRATED-CONFIDENCE] ⚠️ CES NIVEAUX SONT AUTO-ATTRIBUÉS PAR LE MODÈLE.
 *
 * Le schéma Zod valide la FORME (`'high' | 'medium' | 'low'`), jamais la justesse : rien dans l'app
 * ne vérifie qu'une stratégie « high » repose sur un calcul. « Haute confiance », écrit tel quel,
 * se lit comme un verdict de l'application — c'est-à-dire comme les chiffres de la Fiscalité et du
 * Futur, qui sortent du moteur et sont testés. Les deux se ressemblent à l'écran et n'ont pas du
 * tout le même statut.
 *
 * Les libellés disent donc QUI parle. Ce n'est pas de la prudence décorative : le voisin immédiat
 * de cette carte affiche des montants d'impôt calculés, et l'app pose comme règle qu'une valeur
 * non vérifiée ne prend jamais l'apparence d'une valeur vérifiée (`no-fake-data`).
 */
const CONFIDENCE_LABELS: Record<CoupleOptimizationStrategy['confidence'], string> = {
    high: 'IA — piste solide',
    medium: 'IA — à vérifier',
    low: 'IA — idée à creuser',
};

export const CoupleOptimizationCard: React.FC = () => {
    const config = useFinanceStore(s => s.config);
    const apiKey = useFinanceStore(s => s.apiKeys.anthropic);

    const [strategies, setStrategies] = useState<CoupleOptimizationStrategy[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    // [AI-BUDGETMODAL-ERROR-COLLAPSE] Le MESSAGE, pas un booléen : ce drapeau recouvrait à la fois
    // un échec d'appel (quatre causes possibles) et « le modèle n'a rien rendu », qui n'est pas une
    // erreur de service et ne se corrige pas au même endroit.
    const [erreur, setErreur] = useState<string | null>(null);

    const u1 = config?.users?.[0];
    const u2 = config?.users?.[1];

    // N'affiche pas la card si mode individuel (pas de second user)
    if (!u1 || !u2 || !u2.name?.trim()) return null;

    const handleGenerate = async () => {
        if (!apiKey) return;
        setIsLoading(true);
        setErreur(null);
        // [COUPLE-CTX-FAKE-ZERO] ⚠️ PAS de `|| 0` ici. `promptCad` (services/claude.ts) rend
        // « (non disponible) » sur une valeur NON FINIE — c'est exactement sa raison d'être. Un
        // `|| 0` la court-circuitait : un salaire absent devenait un « 0 $ » AFFIRMÉ au modèle, qui
        // bâtissait ensuite des stratégies de fractionnement REER/CELI sur ce revenu fantôme.
        // `undefined * 12` vaut `NaN` (un `number` pour le type, non fini pour `promptCad`) : la
        // garde reprend son travail sans qu'aucune signature ne change.
        const annualiser = (mensuel: number | undefined): number => (mensuel as number) * 12;
        const ctx: CoupleTaxContext = {
            user1: {
                name: u1.name || 'Personne 1',
                grossAnnual: annualiser(u1.grossSalary),
                netAnnual: annualiser(u1.netSalary),
            },
            user2: {
                name: u2.name || 'Personne 2',
                grossAnnual: annualiser(u2.grossSalary),
                netAnnual: annualiser(u2.netSalary),
            },
        };
        try {
            const result = await getCoupleOptimizationStrategies(ctx, apiKey);
            if (result.length === 0) {
                setErreur('Aucune stratégie générée pour cette situation. Réessaie.');
            } else {
                setStrategies(result);
            }
        } catch (err) {
            // `catch {}` ne liait pas l'erreur : ce site ne pouvait rien dire d'autre que « vérifie
            // ta clé », y compris sur une coupure réseau. Capturer est la première moitié.
            setErreur(messageErreurIa(err));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card icon={<Icon name="users" size={18} />} title="Optimisation fiscale du couple">
            <div className="space-y-4">
                <p className="text-tiny text-ink-300 leading-snug">
                    Génère 3 stratégies concrètes d'optimisation fiscale croisée :
                    fractionnement REER, allocation CELI, pension splitting, transfert de crédits.
                    Calculé pour <strong className="text-white">{u1.name}</strong> et <strong className="text-white">{u2.name}</strong>.
                </p>

                {strategies.length === 0 && (
                    <div className="text-center py-4">
                        {!apiKey ? (
                            <p className="text-warning-400 text-body">
                                ℹ️ Configure ta clé Anthropic dans Configuration pour activer l'IA.
                            </p>
                        ) : (
                            <button
                                type="button"
                                onClick={handleGenerate}
                                disabled={isLoading}
                                className="px-4 py-2 bg-primary/15 border border-primary/40 text-primary rounded-lg font-bold text-body hover:bg-primary/25 transition-colors disabled:opacity-50"
                            >
                                {isLoading ? 'Analyse fiscale…' : 'Générer 3 stratégies IA'}
                            </button>
                        )}
                        {erreur !== null && (
                            <p className="text-danger-400 text-tiny mt-2">{erreur}</p>
                        )}
                    </div>
                )}

                {strategies.length > 0 && (
                    <div className="space-y-3">
                        {strategies.map((s, i) => {
                            const colors = CONFIDENCE_COLORS[s.confidence];
                            return (
                                <div key={i} className={`p-4 rounded-lg border ${colors}`}>
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="shrink-0 w-5 h-5 inline-flex items-center justify-center rounded-full bg-white/10 text-tiny font-bold text-ink-200" aria-hidden="true">
                                                {i + 1}
                                            </span>
                                            <h4 className="font-bold text-white text-body">{s.title}</h4>
                                        </div>
                                        <span className="text-tiny font-mono opacity-70 shrink-0">{CONFIDENCE_LABELS[s.confidence]}</span>
                                    </div>
                                    <p className="text-tiny text-ink-200 leading-relaxed">{s.description}</p>
                                    {s.estimated_savings_cad !== undefined && s.estimated_savings_cad > 0 && (
                                        // ⚠️ Ce montant vient du MODÈLE, pas du moteur. En police monospace verte
                                        // et encadré, il avait exactement l'allure des montants calculés affichés
                                        // dix lignes plus haut dans la Fiscalité — un chiffre inventé héritait donc
                                        // de l'autorité d'un chiffre vérifié. Il porte maintenant sa provenance
                                        // DANS son libellé, là où on ne peut pas la manquer.
                                        <div className="mt-2 inline-block px-2 py-1 bg-white/5 border border-white/15 rounded text-tiny font-mono text-ink-200">
                                            Ordre de grandeur avancé par l'IA : <PrivateAmount>{formatCAD(s.estimated_savings_cad)}</PrivateAmount>/an
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {/* ⚠️ Une mention UNIQUE sous la liste, pas répétée par carte : répétée, elle
                            devient du décor qu'on cesse de lire, et c'est précisément ce qu'on veut
                            éviter ici. Elle dit ce que l'app N'A PAS fait — la seule information que
                            les libellés par stratégie ne portent pas. */}
                        <p className="text-tiny text-ink-400 italic leading-snug">
                            Niveaux et montants ci-dessus sont produits par l'IA à partir de tes données.
                            L'app ne les recalcule pas : traite-les comme des pistes à valider, pas comme
                            les montants de l'onglet Impôts.
                        </p>
                        <button
                            type="button"
                            onClick={handleGenerate}
                            disabled={isLoading}
                            className="w-full py-2 bg-white/5 hover:bg-white/10 text-ink-200 rounded-lg text-tiny font-bold transition-colors disabled:opacity-50"
                        >
                            {isLoading ? 'Régénération…' : '↻ Régénérer les stratégies'}
                        </button>
                    </div>
                )}
            </div>
        </Card>
    );
};
