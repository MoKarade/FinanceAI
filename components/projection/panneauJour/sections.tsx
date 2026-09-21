// components/projection/panneauJour/sections.tsx
// [FUTUR-PANNEAU-FIXE] Les quatre sections du panneau du jour, extraites de `ExpertTooltip`.
//
// ⚠️ EXTRAITES, PAS RÉÉCRITES. Chacune de ces sections porte des décisions payées cher — le
// masquage en mode discret par `PrivateAmount`/`PrivateText`, le `sr-only` jumeau des `title` (un
// `title` seul n'est lisible qu'à la souris), la distinction jour RÉEL / jour PROJETÉ, le refus
// d'afficher un montant qu'on n'a pas mesuré. Les re-taper en aurait perdu au moins une ; les cinq
// fichiers de test qui les gardent ont donc été repointés sur le panneau plutôt que réécrits.
//
// ⚠️ CE QUI CHANGE : la MISE EN PAGE, et rien d'autre. L'infobulle empilait tout dans une colonne
// de 320 px qui suivait le curseur ; le panneau range les mêmes blocs en quatre colonnes fixes
// (PC) ou quatre onglets (téléphone), dans l'ordre choisi par Marc. Aucune section n'est
// supprimée : interrogé sur ce qu'il regarde en premier, il a coché les quatre.
import React from 'react';
import type { ProjectionChartPoint } from '../../../services/projection/types';
import { PrivateAmount } from '../../ui/PrivateAmount';
// [PRIV-PAYEE-MODE-DISCRET] Le NOM du marchand est de la donnée personnelle : « pharmacie X, le 3 »
// dit déjà beaucoup, même sans le montant à côté. Décision Marc 2026-08-17.
import { PrivateText } from '../../ui/PrivateText';
import { formatCAD, formatNumber } from '../../../utils/format';
import { detteReductrice } from '../futureDetail/comptes';
import { splitEventIcon } from '../ProjectionTooltip';
import { detteLevierSousZero, phraseLevier, COULEUR_LEVIER, LIBELLE_LEVIER } from '../../future/detteSerie';

/**
 * [FUTUR-DAILY lot B étape 2] Champs portés par les points QUOTIDIENS de la courbe. Ils sont
 * absents des points mensuels du moteur, d'où la lecture défensive plutôt qu'un élargissement de
 * `ProjectionChartPoint` (qui est le contrat du MOTEUR, pas celui de l'affichage).
 */
export type PointJour = ProjectionChartPoint & {
    isDailyPoint?: boolean;
    dayLabels?: string[];
    dayIsDated?: boolean;
    dayMovements?: Array<{ payee: string; amount: number }>;
    dayMovementsTotal?: number;
    dayIsReal?: boolean;
    priceAgeMaxDays?: number;
    hasEstimatedPrice?: boolean;
    daySyncUnconfirmed?: boolean;
    lockedNetWorth?: number;
};

/**
 * ⚠️ NON FINI ⇒ « — », JAMAIS « 0 $ ». `formatCAD` sait déjà rendre « — » ; c'était le `|| 0` des
 * appelants qui court-circuitait ce chemin honnête. Le panneau pouvait donc afficher « Valeur nette
 * 0 $ » en colonne ① pendant que la colonne ③ disait « Dette non calculable — valeur nette
 * illisible sur ce point » : deux affirmations contradictoires sur la même valeur, à vingt
 * centimètres l'une de l'autre. Le défaut est ANTÉRIEUR (il vivait dans l'infobulle), mais c'est ce
 * lot qui le rend contradictoire ET permanent, puisque le panneau est toujours affiché.
 * ⚠️ `Math.round` est conservé pour les valeurs FINIES : le laisser tomber au profit de l'arrondi
 * d'`Intl` déplacerait les demis NÉGATIFS (mesuré ailleurs dans le dépôt : 4 valeurs sur 11).
 */
const fmt = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? formatCAD(Math.round(n)) : formatCAD(n));
// ⚠️ Ce site-ci n'a JAMAIS porté de « $ » : c'est le gain affiché sous la valeur du compte, dont le
// symbole est déjà une ligne plus haut. `formatCAD` y ajouterait un symbole que l'écran n'avait pas
// — le membre déviant d'un remplacement de classe.
const fmtNu = (n: number) => formatNumber(Math.round(n));

/** Comptes affichés dans la répartition (valeur + rendement de la période). */
const COMPTES_PANNEAU: Array<{ key: string; label: string; color: string; gainKey?: string }> = [
    { key: 'Liquidites', label: 'Cash', color: '#5a6478', gainKey: 'MarketGrowthLiquid' },
    { key: 'CELI', label: 'CELI', color: '#4f9d86', gainKey: 'MarketGrowthCELI' },
    { key: 'CELIAPP', label: 'CELIAPP (FHSA)', color: '#5cae9f', gainKey: 'MarketGrowthCELIAPP' },
    { key: 'REER', label: 'REER', color: '#5b82bf', gainKey: 'MarketGrowthREER' },
    { key: 'REEE', label: 'REEE', color: '#5093a8', gainKey: 'MarketGrowthREEE' },
    { key: 'NonReg', label: 'Non-Enreg', color: '#c2974f', gainKey: 'MarketGrowthNonReg' },
    { key: 'Crypto', label: 'Crypto', color: '#9277bd', gainKey: 'MarketGrowthCrypto' },
    { key: 'Immobilier', label: 'Immobilier', color: '#bd7d9c' },
    { key: 'Entreprise', label: 'Entreprise privée', color: '#7fa86b' },
];

/**
 * [FUTUR-INFOBULLE-EPUREE, finding a11y #644] Pastille compacte + sa phrase complète.
 *
 * ⚠️ POURQUOI LE `sr-only` EST OBLIGATOIRE, et pas une politesse. L'épuration a transformé des
 * `<p>` VISIBLES en `title`. J'avais écrit que la limite était « au doigt, un `title` ne s'ouvre
 * pas » — c'était trop optimiste de deux populations : un `title` sur un `<span>` NON FOCUSABLE
 * n'est révélé que par un survol SOURIS. Ni le clavier seul (l'élément n'est pas focusable), ni un
 * lecteur d'écran (qui lit le CONTENU d'un span générique, pas son attribut) n'y accèdent.
 * L'explication était donc perdue pour tout le monde sauf la souris — une RÉGRESSION nette par
 * rapport au paragraphe qu'elle remplaçait, et pas un simple compromis tactile.
 */
const Reserve = ({ label, explication, ton }: { label: string; explication: string; ton: 'neutre' | 'reel' | 'alerte' }) => (
    <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${
            ton === 'alerte' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300/90'
                : ton === 'reel' ? 'border-green-500/30 bg-green-500/10 text-green-300 uppercase tracking-widest'
                    : 'border-white/15 bg-white/5 text-ink-300 uppercase tracking-widest'
        }`}
        title={explication}
    >
        {label}
        <span className="sr-only"> — {explication}</span>
    </span>
);

const TitreBloc = ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold mb-1" title={title}>{children}</div>
);

/* ─────────────────────────── ① Valeur nette + variation ─────────────────────────── */

export const SectionValeurNette = ({ data }: { data: PointJour }) => {
    const isDailyPoint = data.isDailyPoint === true;
    // ⚠️ `undefined` ≠ 0 (finding CRITIQUE de la revue). Un point QUOTIDIEN sans veille connue (le
    // 1er de la fenêtre) n'a pas de variation : afficher « +0 $ » en vert serait un faux chiffre
    // crédible sur la donnée la plus regardée. On masque le badge à la place.
    const hasDiffNW = Number.isFinite(data.diffNW);
    const diffNW = Number(data.diffNW) || 0;
    const totalFlow = (data.NetTransferCELI || 0) + (data.NetTransferREER || 0) + (data.NetTransferNonReg || 0)
        + (data.NetTransferCrypto || 0) + (data.NetTransferLiquid || 0) + (data.NetTransferCELIAPP || 0) + (data.NetTransferREEE || 0);
    const totalGain = (data.MarketGrowthCELI || 0) + (data.MarketGrowthREER || 0) + (data.MarketGrowthNonReg || 0)
        + (data.MarketGrowthCrypto || 0) + (data.MarketGrowthLiquid || 0) + (data.MarketGrowthCELIAPP || 0) + (data.MarketGrowthREEE || 0);
    const locked = data.lockedNetWorth;

    return (
        <div className="space-y-2.5">
            <div className="rounded-xl bg-white/[0.05] border border-white/15 p-2.5">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-tiny uppercase tracking-widest text-ink-300 font-bold">Valeur nette</span>
                    {hasDiffNW && (
                        /* ⚠️ [finding a11y/privacy #644] Le MONTANT passe par `PrivateAmount`, pas le
                           libellé : en mode discret, ce badge affichait la variation en clair juste à
                           côté d'une valeur nette masquée — la donnée la plus regardée échappait au
                           seul mécanisme prévu pour elle. */
                        <span className={`text-tiny font-mono font-bold px-1.5 py-0.5 rounded ${diffNW >= 0 ? 'text-green-300 bg-green-500/15' : 'text-red-300 bg-danger-500/15'}`}>
                            Variation {isDailyPoint ? 'du jour ' : ''}
                            <PrivateAmount>{diffNW > 0 ? '+' : ''}{fmt(diffNW)}</PrivateAmount>
                        </span>
                    )}
                </div>
                <PrivateAmount as="div" className="mt-1 text-2xl font-black text-white font-mono leading-none">{fmt(data.NetWorth)}</PrivateAmount>
            </div>

            {/* [PH2-d-2] — référence VERROUILLÉE (présente seulement sous verrou) : valeur figée +
                écart vs l'aperçu live. */}
            {typeof locked === 'number' && (
                <div className="rounded-xl bg-amber-500/[0.08] border border-amber-500/25 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-tiny uppercase tracking-widest text-amber-300 font-bold">🔒 Verrouillée</span>
                        <PrivateAmount className={`text-tiny font-mono font-bold px-1.5 py-0.5 rounded ${(data.NetWorth || 0) - locked >= 0 ? 'text-green-300 bg-green-500/15' : 'text-red-300 bg-danger-500/15'}`} title="Écart entre l'aperçu live et la référence verrouillée">
                            Live {(data.NetWorth || 0) - locked >= 0 ? '+' : ''}{fmt((data.NetWorth || 0) - locked)}
                        </PrivateAmount>
                    </div>
                    <PrivateAmount as="div" className="mt-1 text-body font-black text-amber-200 font-mono leading-none">{fmt(locked)}</PrivateAmount>
                </div>
            )}

            {/* Pourquoi ça a bougé : dépôts (ce que tu ajoutes) vs rendement (marché). */}
            {(totalFlow !== 0 || totalGain !== 0) && (
                <div className="flex items-center gap-2 text-tiny font-mono">
                    <PrivateAmount className={`flex-1 text-center px-1.5 py-1 rounded ${totalFlow >= 0 ? 'text-sky-300 bg-sky-500/10' : 'text-orange-300 bg-orange-500/10'}`} title="Argent que tu ajoutes toi-même (dépôts − retraits)">
                        Dépôts {totalFlow > 0 ? '+' : ''}{fmt(totalFlow)}
                    </PrivateAmount>
                    <PrivateAmount className={`flex-1 text-center px-1.5 py-1 rounded ${totalGain >= 0 ? 'text-green-300 bg-green-500/10' : 'text-red-300 bg-danger-500/10'}`} title="Ce que tes placements rapportent (rendement du marché)">
                        Rendement {totalGain > 0 ? '+' : ''}{fmt(totalGain)}
                    </PrivateAmount>
                </div>
            )}
        </div>
    );
};

/* ─────────────────────────── ② Entrées / sorties + impôts ─────────────────────────── */

export const SectionFlux = ({ data, userName1, userName2 }: { data: PointJour; userName1?: string; userName2?: string }) => {
    const portfolioOutflow = (data.RetraitREER || 0) + (data.RetraitCELI || 0);
    const aDesImpots = Math.abs(data.FluxImpots || 0) > 0.5 || Math.abs(data.ImpotLatent || 0) > 0.5;
    return (
        <div className="space-y-2.5">
            {/* Revenus / dépenses — du MOIS sur un point mensuel, du JOUR sur un point quotidien.
                [FUTUR-DAILY-FULL] `dailyLedger` ventile ces mêmes champs au jour : rien à changer ici
                hormis les libellés, ce qui élimine tout risque de divergence entre les deux vues. */}
            <div className="space-y-1 text-meta">
                {(data.IncomeMarc || 0) > 0 && <div className="flex justify-between"><span className="text-ink-300">Paye {userName1 || 'Util. 1'}</span><PrivateAmount className="font-mono text-green-400">+{fmt(data.IncomeMarc || 0)}</PrivateAmount></div>}
                {(data.IncomeAnna || 0) > 0 && <div className="flex justify-between"><span className="text-ink-300">Paye {userName2 || 'Util. 2'}</span><PrivateAmount className="font-mono text-green-400">+{fmt(data.IncomeAnna || 0)}</PrivateAmount></div>}
                {(data.IncomeRetirement || 0) > 0 && <div className="flex justify-between" title="Rentes et prestations de retraite (RRQ, PSV, régimes)"><span className="text-ink-300">Rentes</span><PrivateAmount className="font-mono text-green-400">+{fmt(data.IncomeRetirement || 0)}</PrivateAmount></div>}
                {/* [REVENUS-NON-VENTILES-AFFICHAGE] Loyers, allocations et REEE font partie d'`Income`
                    mais n'étaient ventilés nulle part (mesuré : 3 551 $/mois de loyer manquants).
                    Champs CONSOMMÉS tels que le moteur les émet — jamais recalculés ici. */}
                {(data.RentalIncome || 0) > 0 && <div className="flex justify-between" title="Loyers encaissés sur tes immeubles locatifs (net de rien — les charges sont dans les dépenses)"><span className="text-ink-300">Loyers</span><PrivateAmount className="font-mono text-green-400">+{fmt(data.RentalIncome || 0)}</PrivateAmount></div>}
                {(data.childBenefits || 0) > 0 && <div className="flex justify-between" title="Allocations familiales (ACE fédérale + Allocation famille du Québec)"><span className="text-ink-300">Allocations</span><PrivateAmount className="font-mono text-green-400">+{fmt(data.childBenefits || 0)}</PrivateAmount></div>}
                {(data.ReeePayout || 0) > 0 && <div className="flex justify-between" title="Versement du REEE pendant les études"><span className="text-ink-300">REEE versé</span><PrivateAmount className="font-mono text-green-400">+{fmt(data.ReeePayout || 0)}</PrivateAmount></div>}
                {portfolioOutflow > 0 && <div className="flex justify-between" title="Retraits de ton portefeuille (REER + CELI) pour couvrir tes dépenses"><span className="text-ink-300">Décaissement</span><PrivateAmount className="font-mono text-warning-400">+{fmt(portfolioOutflow)}</PrivateAmount></div>}
                {(data.Expenses || 0) > 0 && <div className="flex justify-between" title="Dépenses de vie (hors impôts et hors remboursements de dette)"><span className="text-ink-300">Dépenses</span><PrivateAmount className="font-mono text-danger-400">-{fmt(data.Expenses || 0)}</PrivateAmount></div>}
            </div>

            {/* Impôts du point (demande Marc) : (1) régularisation réglée en avril (FluxImpots =
                impôt réel de l'année − retenues déjà prélevées ; + = à payer, − = remboursement) et
                (2) impôt DORMANT (ImpotLatent, latent/négatif dans le moteur → valeur absolue). On
                n'affiche PAS un « impôt total annuel » : la retenue mensuelle est déjà implicite
                dans le net ci-dessus. */}
            {aDesImpots && (
                <div className="bg-black/30 p-2.5 rounded-xl space-y-1 text-meta border border-white/10">
                    <TitreBloc>Impôts</TitreBloc>
                    {Math.abs(data.FluxImpots || 0) > 0.5 && (
                        <div className="flex justify-between" title="Solde réglé en avril : impôt réel de l'année moins les retenues déjà prélevées (positif = reste à payer, négatif = remboursement).">
                            <span className="text-ink-300">{(data.FluxImpots || 0) > 0 ? "Solde d'impôt (avril)" : "Remboursement d'impôt"}</span>
                            <PrivateAmount className={`font-mono ${(data.FluxImpots || 0) > 0 ? 'text-danger-400' : 'text-green-400'}`}>
                                {(data.FluxImpots || 0) > 0 ? '-' : '+'}{fmt(Math.abs(data.FluxImpots || 0))}
                            </PrivateAmount>
                        </div>
                    )}
                    {Math.abs(data.ImpotLatent || 0) > 0.5 && (
                        <div className="flex justify-between" title="Impôt « dormant » : ce que tu devrais plus tard sur ton REER et tes gains non réalisés si tu liquidais tout aujourd'hui. Ce n'est PAS un décaissement de ce mois.">
                            <span className="text-ink-300">Impôt dormant</span>
                            <PrivateAmount className="font-mono text-amber-300/90">{fmt(Math.abs(data.ImpotLatent || 0))}</PrivateAmount>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/* ─────────────────────────── ③ Par compte + dette ─────────────────────────── */

export const SectionComptes = ({ data }: { data: PointJour }) => {
    const isDailyPoint = data.isDailyPoint === true;
    const comptes = COMPTES_PANNEAU
        .map((a) => ({ ...a, value: (data[a.key] as number | undefined) || 0, gain: a.gainKey ? ((data[a.gainKey] as number | undefined) || 0) : 0 }))
        .filter((a) => a.value !== 0);
    // [DETTE-INVISIBLE-INFOBULLE] La liste ci-dessus ne contient que des comptes POSITIFS : quand le
    // bail auto de Marc entre au bilan, le patrimoine net baisse et RIEN ne l'explique. Les chiffres
    // affichés ne se recomposaient pas. Même dérivation que le « Détail complet » — PARTAGÉE, jamais
    // recopiée.
    // ⚠️ [INFOBULLE-DETTE-NW-NON-FINI] `null` = patrimoine net non fini, donc écart INCALCULABLE.
    // Afficher un montant ici reviendrait à présenter la somme des actifs comme une dette.
    const detteReduc = detteReductrice(
        data as unknown as Record<string, unknown>,
        COMPTES_PANNEAU.map((a) => a.key),
    );

    const afficheDette = detteReduc !== null && detteReduc > 0.5;
    const afficheRefus = detteReduc === null;
    // [DETTE-LEVIER-EXPLICITE] Marc, 2026-09-21 : « la dette augmente à 150k alors que j’ai juste
    // une dette auto qui finit en 2030 ». Il avait raison sur sa dette ORDINAIRE ; ce qui monte
    // ensuite est la marge de la Smith Manoeuvre. Le FAIT se lit sur le champ que le MOTEUR
    // publie — jamais sur une seconde lecture de `useSmithManoeuvre`, qui ne saurait pas dire à
    // quelle DATE le levier existe (il n’ouvre qu’une fois la résidence achetée).
    const levier = detteLevierSousZero(data as unknown as Record<string, unknown>);
    const afficheLevier = afficheDette && levier !== null && Math.abs(levier) > 0.5;
    const explicationLevier = phraseLevier(data as unknown as Record<string, unknown>);
    if (comptes.length === 0 && !afficheDette && !afficheRefus) return null;

    return (
        <div className="bg-black/30 p-2.5 rounded-xl space-y-1 text-meta border border-white/10">
            <TitreBloc title={`Valeur de chaque compte, et à droite son rendement ${isDailyPoint ? 'du jour' : 'du mois'}`}>Par compte</TitreBloc>
            {comptes.map((a) => (
                <div key={a.key} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-ink-200 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: a.color }} />
                        <span className="truncate">{a.label}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0 font-mono">
                        <PrivateAmount className="text-white">{fmt(a.value)}</PrivateAmount>
                        {Math.abs(a.gain) > 0.5 && (
                            <PrivateAmount className={`text-[10px] ${a.gain >= 0 ? 'text-green-400' : 'text-danger-400'}`}>{a.gain > 0 ? '+' : ''}{fmtNu(a.gain)}</PrivateAmount>
                        )}
                    </span>
                </div>
            ))}
            {/* [DETTE-INVISIBLE-INFOBULLE] Le terme NÉGATIF, sans lequel la liste ne recompose pas le
                patrimoine net. Seuil à 0,50 $ : en dessous, c'est un résidu d'arrondi. */}
            {afficheDette && (
                <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-1 mt-1">
                    <span className="flex items-center gap-1.5 text-ink-200 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0 bg-danger-400" />
                        <span className="truncate" title="Prêts, cartes, marge et découvert. L'hypothèque n'y est pas : la ligne Immobilier est déjà l'équité nette.">Dettes (hors hypothèque)</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0 font-mono">
                        <PrivateAmount className="text-danger-400">−{fmt(detteReduc)}</PrivateAmount>
                    </span>
                </div>
            )}
            {/* [DETTE-LEVIER-EXPLICITE] La PART de la dette ci-dessus qui est un levier VOULU, en
                retrait pour dire « dont » plutôt que « en plus ». ⚠️ Le libellé visible reste court
                (plafond de prose de `[FUTUR-INFOBULLE-EPUREE]`, 45 car.) : la phrase entière vit
                dans le `title` ET dans son jumeau `sr-only` — un `title` seul n’est lisible qu’à la
                souris (finding a11y #644). Aucun MONTANT dans la phrase : interpolé, il ne serait
                plus masquable en mode discret. */}
            {afficheLevier && explicationLevier && (
                <div className="flex items-center justify-between gap-2 pl-3.5">
                    <span className="flex items-center gap-1.5 text-ink-300 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COULEUR_LEVIER }} />
                        <span className="truncate" title={explicationLevier}>
                            {LIBELLE_LEVIER}
                            <span className="sr-only"> — {explicationLevier}</span>
                        </span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0 font-mono">
                        <PrivateAmount className="text-indigo-300">−{fmt(Math.abs(levier))}</PrivateAmount>
                    </span>
                </div>
            )}
            {/* ⚠️ [INFOBULLE-DETTE-NW-NON-FINI] Le REFUS se dit. Sans cette ligne, un patrimoine net
                corrompu rendait une liste de comptes qui ne recompose rien, sans que l'écran
                l'avoue — et c'est précisément la plainte qui a fait naître la ligne de dette. */}
            {afficheRefus && (
                <div className="border-t border-white/10 pt-1 mt-1 text-[10px] text-amber-300/90" title="La valeur nette de ce point n'est pas exploitable, donc l'écart entre les comptes et elle ne peut pas être calculé.">
                    Dette non calculable ici — valeur nette illisible sur ce point
                </div>
            )}
        </div>
    );
};

/* ─────────────────────────── ④ Ce jour-là (mouvements + événements) ─────────────────────────── */

export const SectionMouvements = ({ data }: { data: PointJour }) => {
    const isDailyPoint = data.isDailyPoint === true;
    // [FUTUR-DAILY-PAST-REAL] Un jour du PASSÉ est RECONSTRUIT depuis de vraies données ; un jour du
    // FUTUR est ventilé depuis le mois du moteur. Les présenter à l'identique reviendrait à faire
    // passer une projection pour une mesure — et l'inverse.
    const isRealDay = data.dayIsReal === true;
    const priceAge = Number(data.priceAgeMaxDays);
    const stalePrice = Number.isFinite(priceAge) && priceAge > 7;
    const dayLabels = data.dayLabels;
    const dayMovements = data.dayMovements;
    const dayMovementsTotal = data.dayMovementsTotal ?? 0;
    // ⚠️ `dayIsDated` ET les libellés (finding revue) : un `DatedDelta` sans `label` produit un jour
    // réellement DATÉ mais sans libellé — n'écouter que `labels.length` aurait alors annoncé
    // « aucun mouvement à date connue » un jour où un mouvement a bel et bien eu lieu.
    const dayHasMovement = data.dayIsDated === true || (dayLabels?.length ?? 0) > 0;
    const events: string[] = [...(data.lifeEvents || []), ...(data.flowEvents || [])];

    return (
        <div className="space-y-2.5">
            {/* U4 — TOUS les événements du mois, pas juste le premier. Chaque ligne a son icône via
                `splitEventIcon`. */}
            {events.length > 0 && (
                <div className="space-y-1">
                    <TitreBloc>{events.length === 1 ? 'Événement' : `Événements (${events.length})`}</TitreBloc>
                    {events.map((ev, i) => {
                        const { icon, text } = splitEventIcon(ev);
                        return (
                            <div key={i} className="flex items-center gap-1.5 text-tiny text-yellow-200 bg-yellow-500/5 rounded-lg px-2 py-1.5 border border-yellow-500/15">
                                <span className="shrink-0" aria-hidden="true">{icon}</span>
                                <span className="flex-1 font-semibold leading-tight">{text}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {isDailyPoint && (
                <div>
                    {/* [FUTUR-INFOBULLE-EPUREE] Chaque réserve que portait la prose (prix estimé, prix
                        périmé, sync incomplète) garde un marqueur VISIBLE — c'est le fait qu'il y a
                        une réserve qui doit sauter aux yeux — et sa phrase complète reste portée par
                        `<Reserve>` : `title` pour la souris, `sr-only` pour le lecteur d'écran. */}
                    <div className="mb-1.5 flex flex-wrap items-center gap-1">
                        <Reserve
                            ton={isRealDay ? 'reel' : 'neutre'}
                            label={isRealDay ? 'Réel' : 'Projeté'}
                            explication={isRealDay
                                ? 'Jour RÉEL : reconstruit depuis tes transactions datées et le prix de tes titres ce jour-là — pas une moyenne du mois.'
                                : 'Jour PROJETÉ : ventilé depuis le mois calculé par le moteur — pas une mesure.'}
                        />
                        {isRealDay && data.hasEstimatedPrice === true && (
                            <Reserve
                                ton="alerte" label="~ prix estimé"
                                explication="Au moins un titre est valorisé à son prix ACTUEL, faute d’historique à cette date."
                            />
                        )}
                        {isRealDay && stalePrice && (
                            <Reserve
                                ton="alerte" label={`prix J−${Math.round(priceAge)}`}
                                explication={`Le prix le plus ancien composant ce point a ${Math.round(priceAge)} jours : c’est un plateau de reconstruction, pas une valeur observée ce jour-là.`}
                            />
                        )}
                        {/* [FUTUR-DAILY-ROLLOVER, finding silent-failure #593] Jour réel POSTÉRIEUR à
                            la dernière sync bancaire : ses « 0 $ » peuvent n'être qu'une sync pas
                            encore passée — le dire, sinon un plat crédible passe pour une journée
                            mesurée. */}
                        {isRealDay && data.daySyncUnconfirmed === true && (
                            <Reserve
                                ton="alerte" label="⚠ sync incomplète"
                                explication="Jour pas encore couvert par la sync bancaire — des transactions de ce jour peuvent manquer."
                            />
                        )}
                    </div>
                    {dayHasMovement ? (
                        /* [FUTUR-INFOBULLE-MONTANTS] Demande de Marc : voir le MONTANT de chaque
                           dépense, pas seulement le marchand. Borné au PASSÉ — `dayMovements`
                           n'existe que sur un jour reconstruit ; le futur n'itemise pas.
                           ⚠️ Repli sur les libellés seuls quand les montants n'existent pas : ne
                           JAMAIS afficher un montant qu'on n'a pas mesuré. */
                        <div className="space-y-0.5">
                            <span className="text-tiny uppercase tracking-widest text-primary font-bold">Ce jour</span>
                            {dayMovements && dayMovements.length > 0 ? (
                                dayMovements.map((mv, i) => (
                                    <div key={`${mv.payee}-${i}`} className="flex items-baseline justify-between gap-3">
                                        <PrivateText className="text-tiny text-ink-100 truncate">{mv.payee}</PrivateText>
                                        <PrivateAmount className={`text-tiny font-mono shrink-0 ${mv.amount >= 0 ? 'text-green-300' : 'text-ink-200'}`}>
                                            {mv.amount > 0 ? '+' : ''}{fmt(mv.amount)}
                                        </PrivateAmount>
                                    </div>
                                ))
                            ) : (
                                /* ⚠️ [finding CRITIQUE revue #645] CE REPLI FUYAIT. `dayMovements`
                                   n'existe que sur un jour PASSÉ reconstruit ; un jour FUTUR portant
                                   une charge récurrente passe donc toujours par ici — et `dayLabels`
                                   y vaut `r.payee` (datedMonthEvents.ts), c'est-à-dire un vrai nom de
                                   marchand. Le chemin heureux était masqué, le repli non. */
                                dayLabels && dayLabels.length > 0
                                    ? <PrivateText className="text-tiny text-ink-100">{dayLabels.join(', ')}</PrivateText>
                                    : <span className="text-tiny text-ink-100">Mouvement à date connue</span>
                            )}
                            {/* ⚠️ [FUTUR-MOUVEMENTS-TOUS 2026-09-18] Cette ligne ne parle PLUS d'une
                                troncature d'affichage : il n'y en a plus. L'écart restant est celui
                                des transactions SANS description, qui n'entrent dans aucune liste
                                affichée. ⚠️ [finding silent-failure #644] Elle est HORS du ternaire :
                                une journée dont AUCUNE transaction ne porte de description tombe dans
                                la branche de repli, et c'est justement là que ce compte est le SEUL
                                indice que des mouvements existent. */}
                            {dayMovementsTotal > (dayMovements?.length ?? 0) && (
                                <div className="text-[10px] text-ink-400" title="Les autres mouvements de ce jour — dont ceux sans description — sont listés dans « Détail complet ».">
                                    +{dayMovementsTotal - (dayMovements?.length ?? 0)} autre{dayMovementsTotal - (dayMovements?.length ?? 0) > 1 ? 's' : ''}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* ⚠️ [FUTUR-INFOBULLE-EPUREE] Raccourci, mais la DISTINCTION reste dite : un
                           jour réel sans mouvement ne bouge que par le marché, un jour projeté ne
                           bouge que par l'étalement de la croissance. Fondre les deux en un seul
                           « Aucun mouvement » ferait passer du lissage pour de la mesure. */
                        <div className="text-[10px] text-ink-400" title={isRealDay
                            ? 'Aucun mouvement sur tes comptes ce jour-là — la variation ne vient que du marché.'
                            : 'Aucun mouvement à date connue ce jour-là — la variation vient de la croissance, répartie sur le mois.'}>
                            {isRealDay ? 'Aucun mouvement · marché seul' : 'Aucun mouvement daté · croissance étalée'}
                        </div>
                    )}
                </div>
            )}

            {/* ⚠️ Un point MENSUEL n'a pas de mouvements datés : le dire plutôt que de rendre une
                colonne vide, qui se lit comme une donnée manquante. */}
            {!isDailyPoint && events.length === 0 && (
                <div className="text-[10px] text-ink-400" title="Ce point est un MOIS entier : le détail au jour n'existe que sur la courbe quotidienne.">
                    Point mensuel — pas de détail au jour
                </div>
            )}
        </div>
    );
};
