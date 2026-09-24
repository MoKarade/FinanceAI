// [GODFILE-FUTUREDETAILMODAL] Définitions et calculs des COMPTES du panneau de détail Futur,
// extraits tels quels de FutureDetailModal.tsx (lot 154). Fonctions pures + constantes —
// aucun JSX, aucune lecture de store.
import { formatCAD } from '../../../utils/format';
import type { IconName } from '../../ui/Icon';
import type { ProjectionChartPoint } from '../../../services/projection/types';

export interface AccountDef {
    key: string;
    label: string;
    color: string;
    /** Champ chartData du gain marché du mois (P2). */
    gainKey?: string;
    /** Champ chartData du flux net du mois (apport − retrait) (P2). */
    flowKey?: string;
    /** Champ chartData « espace + solde » (CELIMax/REERMax) — comptes enregistrés. */
    roomMaxKey?: string;
    /** Champ chartData des cotisations du mois (G19). */
    contribKey?: string;
}

export const ACCOUNTS: AccountDef[] = [
    { key: 'Liquidites', label: 'Cash (Coussin)', color: '#5a6478', gainKey: 'MarketGrowthLiquid', flowKey: 'NetTransferLiquid' },
    { key: 'CELI', label: 'CELI', color: '#4f9d86', gainKey: 'MarketGrowthCELI', flowKey: 'NetTransferCELI', roomMaxKey: 'CELIMax', contribKey: 'ContribCELI' },
    { key: 'CELIAPP', label: 'CELIAPP (FHSA)', color: '#5cae9f', gainKey: 'MarketGrowthCELIAPP', flowKey: 'NetTransferCELIAPP', roomMaxKey: 'CELIAPPMax', contribKey: 'ContribCELIAPP' },
    { key: 'REER', label: 'REER', color: '#5b82bf', gainKey: 'MarketGrowthREER', flowKey: 'NetTransferREER', roomMaxKey: 'REERMax', contribKey: 'ContribREER' },
    { key: 'REEE', label: 'REEE (Études)', color: '#5093a8', gainKey: 'MarketGrowthREEE', flowKey: 'NetTransferREEE' },
    { key: 'NonReg', label: 'Non-Enregistré', color: '#c2974f', gainKey: 'MarketGrowthNonReg', flowKey: 'NetTransferNonReg' },
    { key: 'Crypto', label: 'Crypto', color: '#9277bd', gainKey: 'MarketGrowthCrypto', flowKey: 'NetTransferCrypto' },
    { key: 'Immobilier', label: 'Immobilier', color: '#bd7d9c' },
    { key: 'Entreprise', label: 'Entreprise privée', color: '#7fa86b' },
];

/**
 * [DETTE-INVISIBLE-INFOBULLE] La dette qui tire le patrimoine net SOUS la somme des actifs affichés.
 *
 * Marc, 2026-09-17 : « je le vois nulle part dans le passé, pas sur l'infobulle ou quoi ». Son bail
 * auto entre au bilan en juillet — le patrimoine net baisse d'autant, et AUCUNE ligne de
 * l'infobulle ne l'explique : elle ne liste que des comptes POSITIFS. Les chiffres affichés ne se
 * recomposent donc pas (la somme des actifs dépasse le patrimoine net du montant de la dette), et rien ne dit
 * pourquoi — la même classe de défaut que la carte du hub corrigée le matin même.
 *
 * ⚠️ DÉRIVÉE PAR SOUSTRACTION, jamais lue dans `DettesNonImmo`, et c'est délibéré : ce champ du
 * moteur n'est pas publié sur toutes les courbes (il manquait à `CURVE_FIELDS` —
 * `CORRECTIF-VERT-EN-TEST-INERTE-EN-PROD`). L'identité `NetWorth = Σ(actifs publiés) − dette`, elle,
 * tient sur TOUT point, passé reconstruit compris.
 *
 * ⚠️ L'HYPOTHÈQUE N'Y EST PAS : « Immobilier » est déjà l'équité NETTE (valeur − hypothèque). Elle
 * y serait comptée deux fois. Ce qui reste = prêts, cartes, découvert, marge.
 *
 * ⚠️ Extrait de `FutureDetailModal` (où il est né du bug Marc du 2026-06-16, « un patrimoine net
 * négatif n'était expliqué par AUCUN élément ») pour être PARTAGÉ avec l'infobulle : le recopier
 * aurait donné deux dérivations d'une même vérité, qui divergent au premier changement
 * (`UN-COMMENTAIRE-QUI-RECLAME-DE-LA-VIGILANCE-EST-UNE-SOURCE-UNIQUE-MANQUANTE`).
 */
export function detteReductrice(
    point: Record<string, unknown>,
    clesActifsAffiches: readonly string[],
): number | null {
    // ⚠️ [INFOBULLE-DETTE-NW-NON-FINI] `Number(point.NetWorth) || 0` rabattait un `NaN` ou un
    // `Infinity` sur ZÉRO — et la soustraction rendait alors la somme TOTALE des actifs, affichée
    // sous le libellé « Dettes (hors hypothèque) ». Un patrimoine corrompu ne produisait donc pas
    // un écran vide mais un montant de dette FAUX ET CRÉDIBLE, sans trace, dans les deux surfaces
    // qui appellent cette fonction. Le repli le plus plausible est le pire (§1, no-fake-data).
    //
    // ⚠️ LE CORRECTIF EST LE TYPE, pas un meilleur nombre : `number | null` fait ÉNUMÉRER les
    // consommateurs par le compilateur. Les deux gatent sur `> 0.5`, ce qui masque `null` en
    // silence — un retour numérique « prudent » les aurait laissés muets exactement là où il faut
    // parler (`UN-CORRECTIF-PEUT-RENDRE-ATTEIGNABLE-UNE-BRANCHE-MORTE`).
    const nw = Number(point.NetWorth);
    if (!Number.isFinite(nw)) return null;
    // ⚠️ L'AUTRE MOITIÉ, et elle est plus discrète : une clé d'actif PRÉSENTE mais non finie rend la
    // SOMME amputée, donc la soustraction fausse — dans l'autre sens (une dette SURÉVALUÉE du
    // montant du compte illisible). `|| 0` l'absorbait aussi silencieusement que pour la valeur
    // nette. ⚠️ Une clé ABSENTE reste légitime : ça veut dire « pas de compte de ce type », pas
    // « donnée perdue » — c'est la distinction `REPLI-SILENCIEUX-LEGITIME-VS-CORRUPTION`.
    let sommeActifs = 0;
    for (const k of clesActifsAffiches) {
        const v = point[k];
        if (v === undefined || v === null) continue;
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        sommeActifs += n;
    }
    return Math.max(0, sommeActifs - nw);
}

// G19 — espace de cotisation gagné par année (CELI/REER). Dérivation par
// conservation : espace_gagné(Y) = espace_dispo(fin Y) − espace_dispo(fin Y−1)
// + cotisations(Y). L'espace dispo = Max (espace + solde) − solde. Capture aussi
// le réajout d'espace CELI après retrait. Année 1 : pas de référence → gained=null.
interface RoomYear { year: number; gained: number | null; avail: number }
export function computeRoomByYear(chartData: ProjectionChartPoint[], balanceKey: string, maxKey: string, contribKey: string): RoomYear[] {
    const byYear = new Map<number, { availLast: number; contribs: number }>();
    for (const d of chartData) {
        const avail = (Number(d[maxKey]) || 0) - (Number(d[balanceKey]) || 0);
        const yr = d.year ?? 0;
        const cur = byYear.get(yr) || { availLast: 0, contribs: 0 };
        cur.availLast = avail; // dernier mois vu = décembre
        cur.contribs += Number(d[contribKey]) || 0;
        byYear.set(yr, cur);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    return years.map((y, i) => {
        const e = byYear.get(y)!;
        const prev = i > 0 ? byYear.get(years[i - 1])!.availLast : null;
        return { year: y, gained: prev === null ? null : (e.availLast - prev + e.contribs), avail: e.availLast };
    });
}

// G13 — point enrichi du drill-down : la valeur du compte + les composantes qui
// expliquent son mouvement (toutes issues du moteur, aucune invention).
export interface AccountPoint {
    monthIndex: number;
    year: number;
    dateLabel?: string;
    value: number;
    gain: number;        // MarketGrowthX — gain/perte marché du mois
    flow: number;        // NetTransferX — apport net (dépôts − retraits)
    events: string[];    // libellés exacts du moteur = la VRAIE cause d'un mouvement
    hasDecomp: boolean;  // false pour l'Immobilier (pas de gain/flow émis)
}

type ReasonTone = 'pos' | 'neg' | 'in' | 'out';
/**
 * [A11Y-PRIVACY-CHAINES-RESTANTES] `text` était une CHAÎNE qui portait le montant à l'intérieur
 * (« Rendement placements +1 200 $ »). Les deux surfaces qui l'affichent enveloppaient donc la
 * phrase ENTIÈRE dans `PrivateAmount` : en mode discret, la ligne devenait « ••• » — l'icône
 * comprise — et le FAIT disparaissait avec le chiffre. C'est l'autre moitié de la leçon du lot 56 :
 * garder le FAIT, taire le DÉTAIL. Le libellé et le montant sont donc séparés.
 */
interface MovementReason { icon: IconName; libelle: string; montant: number; tone: ReasonTone; }

export const fmtMoney = (n: number) => formatCAD(n);

// G13 — décompose le mouvement d'un compte en composantes EXACTES : gain marché
// (MarketGrowthX) vs apport/retrait net (NetTransferX). On ne devine PAS la cause
// d'un retrait (un retrait CELI peut être un achat immo via RAP, pas forcément la
// retraite) : la cause précise vient des événements du mois, affichés à part.
export function explainMovement(d: AccountPoint): MovementReason[] {
    if (!d.hasDecomp) return [];
    const out: MovementReason[] = [];
    if (d.gain > 0.5) out.push({ icon: 'investments', libelle: 'Rendement placements', montant: d.gain, tone: 'pos' });
    else if (d.gain < -0.5) out.push({ icon: 'debt', libelle: 'Perte de marché', montant: d.gain, tone: 'neg' });
    if (d.flow > 0.5) out.push({ icon: 'cash', libelle: 'Dépôt (argent ajouté)', montant: d.flow, tone: 'in' });
    else if (d.flow < -0.5) out.push({ icon: 'bank', libelle: 'Retrait (argent sorti)', montant: d.flow, tone: 'out' });
    return out;
}

export const REASON_TONE_CLASS: Record<ReasonTone, string> = {
    pos: 'text-green-300 bg-green-500/10',
    neg: 'text-red-300 bg-danger-500/10',
    in: 'text-sky-300 bg-sky-500/10',
    out: 'text-orange-300 bg-orange-500/10',
};
