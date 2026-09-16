// components/settings/FxRatesCard.tsx
//
// [FX-TAUX-JAMAIS-ARRIVES] Le taux de change : d'où il vient, ce que la dernière lecture a donné,
// et — c'est tout l'objet de cette carte — DEUX gestes pour en sortir.
//
// POURQUOI ELLE EXISTE, mesuré le 2026-09-16 sur l'état RÉEL de Marc (lu par le serveur MCP) :
// ses douze positions sont en USD ou en EUR, aucune en CAD, et les facteurs appliqués valaient
// 1,4000 et 1,4700 au dix-millième — le littéral `DEFAULT_FX_RATES` du dépôt. La totalité de la
// valeur de ses placements reposait donc sur un taux qui ne mesure rien, la lecture automatique ne
// tournait qu'UNE fois au démarrage, et le badge « Taux de change estimés » disait le problème
// sans offrir la moindre sortie.
//
// ⚠️ Un avertissement sans recours apprend à être ignoré — c'est la même classe que
// `UN-ETAT-DE-FILTRAGE-SANS-CONTROLE-QUI-LE-RALLUME-EST-UNE-TRAPPE` : le geste ALLER existait
// (l'app constatait), le geste RETOUR n'existait pas.
import React, { useMemo, useState } from 'react';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useFinanceStore } from '../../store/useFinanceStore';
import { fetchFxRates } from '../../services/finance';
import { formatRelative } from '../../utils/relativeTime';
import {
    fxSourceEffective, fxCauseEffective, libelleSourceFx, messageCauseFx, fxFaitAutorite,
} from '../../services/fx/provenance';

/**
 * Bornes de SAISIE, volontairement LARGES.
 *
 * ⚠️ Un intervalle « plausible » (disons 1,0–2,0 pour USD/CAD) refuserait une valeur légitime le
 * jour où le change bouge vraiment — et ce jour-là le refus tomberait précisément quand la saisie
 * manuelle sert le plus. On ne garde donc que ce qui est FAUX par construction : un non-nombre,
 * zéro, un négatif, ou une valeur qui ne peut pas être un taux.
 */
export const TAUX_MIN = 0;
export const TAUX_MAX = 100;

/** `null` si la saisie ne peut pas être un taux. Le message dit LEQUEL des cas, jamais « invalide ». */
export function lireTauxSaisi(brut: string): { valeur: number } | { erreur: string } {
    const nettoye = brut.trim().replace(',', '.');
    if (nettoye === '') return { erreur: 'Entre une valeur.' };
    const v = Number(nettoye);
    if (!Number.isFinite(v)) return { erreur: 'Ce n\'est pas un nombre.' };
    if (v <= TAUX_MIN) return { erreur: 'Un taux de change est strictement positif.' };
    if (v > TAUX_MAX) return { erreur: `Au-delà de ${TAUX_MAX}, ce n'est pas un taux de change.` };
    return { valeur: v };
}

export const FxRatesCard: React.FC = () => {
    const fxRates = useFinanceStore((s) => s.fxRates);
    const source = useFinanceStore(fxSourceEffective);
    const cause = useFinanceStore(fxCauseEffective);
    const lastAttemptAt = useFinanceStore((s) => s.fxLastAttemptAt ?? 0);
    const updateFxRates = useFinanceStore((s) => s.updateFxRates);

    const [enCours, setEnCours] = useState(false);
    const [annonce, setAnnonce] = useState('');
    const [saisieUsd, setSaisieUsd] = useState('');
    const [saisieEur, setSaisieEur] = useState('');
    const [erreurSaisie, setErreurSaisie] = useState('');

    const autorite = fxFaitAutorite(source);
    const derniereLecture = fxRates.lastFetched ?? 0;

    const reessayer = async () => {
        setEnCours(true);
        setErreurSaisie('');
        try {
            // `force` COURT-CIRCUITE le cache de 24 h. Sans lui le bouton rendrait la valeur en
            // cache sans rien tenter, et Marc verrait le même écran sans savoir que rien n'a bougé.
            const res = await fetchFxRates({ force: true });
            // ⚠️ Écriture INCONDITIONNELLE ici, contrairement au démarrage : un geste explicite doit
            // laisser une trace même quand le résultat est identique, sinon « j'ai cliqué » et « je
            // n'ai pas cliqué » produisent le même état et le bouton a l'air cassé.
            updateFxRates(res);
            setAnnonce(res.source === 'api'
                ? `Taux lus chez la Banque du Canada : USD ${res.USD.toFixed(4)}, EUR ${res.EUR.toFixed(4)}.`
                : `Lecture sans succès. ${messageCauseFx(res.cause)}`);
        } catch (e) {
            // La fonction encode déjà ses échecs dans son retour ; un rejet ici serait un défaut de
            // programmation, pas une panne réseau — on le DIT plutôt que de l'avaler.
            setAnnonce(`La lecture n'a pas pu être lancée : ${e instanceof Error ? e.message : 'cause inconnue'}.`);
        } finally {
            setEnCours(false);
        }
    };

    const appliquerSaisie = () => {
        const usd = lireTauxSaisi(saisieUsd);
        const eur = lireTauxSaisi(saisieEur);
        if ('erreur' in usd) { setErreurSaisie(`USD : ${usd.erreur}`); return; }
        if ('erreur' in eur) { setErreurSaisie(`EUR : ${eur.erreur}`); return; }
        setErreurSaisie('');
        updateFxRates({
            USD: usd.valeur, EUR: eur.valeur, CAD: 1,
            // ⚠️ `lastFetched` N'EST PAS touché : il date les lectures RÉUSSIES de la Banque du
            // Canada. Y écrire l'instant d'une saisie ferait afficher « taux à jour (BdC) » sur un
            // chiffre tapé à la main — un habillage de valeur vérifiée sur une valeur qui ne l'est
            // pas (`UNE-VALEUR-NON-VERIFIEE-NE-PORTE-PAS-L-HABILLAGE-D-UNE-VALEUR-VERIFIEE`).
            estimated: true,
            source: 'manuel',
            cause: 'manuel',
            attemptAt: Date.now(),
        });
        setAnnonce(`Taux saisis appliqués : USD ${usd.valeur.toFixed(4)}, EUR ${eur.valeur.toFixed(4)}.`);
        setSaisieUsd('');
        setSaisieEur('');
    };

    const variante = useMemo(() => (source === 'api' ? 'success' : 'warning'), [source]);

    return (
        <Card icon={<Icon name="bank" size={18} />} title="Taux de change">
            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={variante} size="sm">{libelleSourceFx(source)}</Badge>
                    <span className="font-mono text-meta text-ink-100">
                        USD {fxRates.USD.toFixed(4)} · EUR {fxRates.EUR.toFixed(4)}
                    </span>
                </div>

                <p className="text-meta text-ink-200">
                    {messageCauseFx(cause)}
                    {' '}
                    {derniereLecture > 0
                        ? `Dernière lecture réussie ${formatRelative(derniereLecture)}.`
                        : 'Aucune lecture réussie à ce jour.'}
                    {lastAttemptAt > 0 ? ` Dernière tentative ${formatRelative(lastAttemptAt)}.` : ''}
                </p>

                {!autorite && (
                    <p className="text-meta text-warning-300">
                        Tant que le taux vient du repli écrit dans le code, il convertit ce qui est
                        AFFICHÉ mais il n'a pas le droit d'écrire un total de compte : un compte
                        courtier en devise étrangère reste nommé et non converti.
                    </p>
                )}

                <div>
                    <Button variant="ghost" size="sm" onClick={reessayer} loading={enCours} disabled={enCours}>
                        Réessayer maintenant
                    </Button>
                </div>

                <div className="border-t border-white/10 pt-4">
                    <p className="text-meta text-ink-200 mb-2">
                        Si la Banque du Canada reste injoignable, saisis le taux toi-même. Il
                        convertira tes avoirs — et l'app continuera de dire qu'il vient de toi.
                    </p>
                    <div className="flex flex-wrap items-end gap-3">
                        <div>
                            <label htmlFor="fx-manuel-usd" className="block text-meta text-ink-300 mb-1">
                                USD → CAD
                            </label>
                            <Input
                                id="fx-manuel-usd"
                                variant="compact"
                                inputMode="decimal"
                                placeholder={fxRates.USD.toFixed(4)}
                                value={saisieUsd}
                                onChange={(e) => setSaisieUsd(e.target.value)}
                                className="w-28 font-mono"
                            />
                        </div>
                        <div>
                            <label htmlFor="fx-manuel-eur" className="block text-meta text-ink-300 mb-1">
                                EUR → CAD
                            </label>
                            <Input
                                id="fx-manuel-eur"
                                variant="compact"
                                inputMode="decimal"
                                placeholder={fxRates.EUR.toFixed(4)}
                                value={saisieEur}
                                onChange={(e) => setSaisieEur(e.target.value)}
                                className="w-28 font-mono"
                            />
                        </div>
                        <Button variant="outline" size="sm" onClick={appliquerSaisie}>
                            Appliquer ces taux
                        </Button>
                    </div>
                    {erreurSaisie !== '' && (
                        <p className="text-meta text-danger-300 mt-2">{erreurSaisie}</p>
                    )}
                </div>

                {/* ⚠️ Conteneur monté EN PERMANENCE, texte VIDÉ — une région live insérée au moment
                    où elle doit parler rate la PREMIÈRE annonce, la seule qui compte
                    (`UNE-REGION-LIVE-MONTEE-CONDITIONNELLEMENT-N-ANNONCE-PAS`). */}
                <p role="status" aria-live="polite" className="text-meta text-ink-100 min-h-[1rem]">
                    {annonce}
                </p>
            </div>
        </Card>
    );
};
