// services/history/diagnosticCourbe.ts
//
// [COURBE-DIAGNOSTIC] Explique les cassures de la courbe « Performance comparée » : pour chaque saut
// du TOTAL, QUEL titre est sorti, entré ou a changé de quantité ou de prix. PUR : aucun réseau, aucun
// store ; il rejoue `buildMarketData` (la même source que l'écran) et ne lit que son résultat.
//
// Pourquoi : une chute de ~30 % suivie d'un retour d'un coup n'est jamais un marché, c'est un titre
// qui disparaît du TOTAL (clôture périmée sans cotation fraîche) puis réapparaît. Depuis
// COURBE-TROUS-COMBLES les trous INTÉRIEURS sont comblés (`plagesComblees`) ; reste la queue arrêtée.
// `omittedKeys` le trace déjà date par date ; ce module le met en phrases et en pourcentages.
//
// ⚠️ La sortie contient des symboles et des POURCENTAGES, jamais un montant ni une quantité : elle se
// colle dans une issue sans y mettre de donnée perso (le dépôt est tenu comme public).

import type { Asset } from '../../types';
import { buildMarketData } from './buildMarketData';
import { STALE_PRICE_DAYS } from './reconstructPortfolioHistory';

const DAY_MS = 86_400_000;
const jours = (a: string, b: string): number =>
    Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

type NatureCause = 'sorti' | 'entre' | 'quantite' | 'prix';

interface CauseSaut {
    symbole: string;
    nature: NatureCause;
    /** Part du TOTAL de la veille (en points de %, signée) que ce titre explique. */
    pointsDuTotal: number;
}

interface SautTotal {
    date: string;
    precedente: string;
    /** Variation du TOTAL entre les deux dates, en %. */
    variationPct: number;
    causes: CauseSaut[];
}

interface TrouTitre {
    symbole: string;
    du: string;
    au: string;
    jours: number;
}

interface SautPrix {
    symbole: string;
    date: string;
    variationPct: number;
}

export interface DiagnosticCourbe {
    sauts: SautTotal[];
    /** Trous de plus de `STALE_PRICE_DAYS` entre deux clôtures d'un même titre (le titre sort du TOTAL). */
    trous: TrouTitre[];
    /** Titres dont la dernière clôture est périmée à `aujourdhui`. */
    queuesPerimees: Array<{ symbole: string; derniereCloture: string; jours: number }>;
    /** Variations d'un jour du cours d'un titre au-delà du seuil : fractionnement non répercuté, ou faute de source. */
    sautsDePrix: SautPrix[];
    /** Titres dont la quantité nette des achats ne rejoint pas la quantité de la fiche. */
    quantitesIncoherentes: Array<{ symbole: string; ecartQuantite: number }>;
    /** Trous intérieurs comblés au dernier cours connu (`buildMarketData`, COURBE-TROUS-COMBLES) : la courbe ne chute plus, mais la valeur est reportée. */
    plagesComblees: Array<{ symbol: string; du: string; au: string }>;
    /** Dates du TOTAL amputé d'au moins un titre détenu, regroupées en plages. */
    plagesAmputees: Array<{ du: string; au: string; symboles: string[] }>;
}

export interface OptionsDiagnostic {
    /** Seuil d'un saut du TOTAL, en % (défaut 5). */
    seuilSautPct?: number;
    /** Seuil d'un saut de cours d'un jour, en % (défaut 40). */
    seuilPrixPct?: number;
    nowMs?: number;
}

/** Colonnes de `MarketDataPoint` qui sont des titres (pas la date, pas les TOTAL*). */
const estColonneTitre = (cle: string): boolean => cle !== 'date' && !cle.startsWith('TOTAL');

export function diagnostiquerCourbe(
    assets: Asset[],
    fxRates: Record<string, number> | undefined,
    opts: OptionsDiagnostic = {},
): DiagnosticCourbe {
    const seuilSaut = opts.seuilSautPct ?? 5;
    const seuilPrix = opts.seuilPrixPct ?? 40;
    const nowMs = opts.nowMs ?? Date.now();
    const aujourdhui = new Date(nowMs).toISOString().slice(0, 10);
    const { rows, omittedKeys, gapBridges } = buildMarketData(assets, fxRates, { maxPoints: Number.MAX_SAFE_INTEGER, nowMs });

    // Valeur et prix par titre : repris de la ligne rendue (aucun recalcul concurrent de la détention).
    const sauts: SautTotal[] = [];
    for (let i = 1; i < rows.length; i++) {
        const avant = rows[i - 1];
        const apres = rows[i];
        const t0 = Number(avant.TOTAL);
        const t1 = Number(apres.TOTAL);
        if (!(t0 > 0) || !Number.isFinite(t1)) continue;
        const variationPct = ((t1 - t0) / t0) * 100;
        if (Math.abs(variationPct) < seuilSaut) continue;
        const causes: CauseSaut[] = [];
        const cles = new Set([...Object.keys(avant), ...Object.keys(apres)].filter(estColonneTitre));
        for (const cle of cles) {
            const v0 = Number(avant[cle]);
            const v1 = Number(apres[cle]);
            const a = Number.isFinite(v0) && v0 > 0;
            const b = Number.isFinite(v1) && v1 > 0;
            if (a && !b) causes.push({ symbole: cle, nature: 'sorti', pointsDuTotal: (-v0 / t0) * 100 });
            else if (!a && b) causes.push({ symbole: cle, nature: 'entre', pointsDuTotal: (v1 / t0) * 100 });
            else if (a && b && Math.abs(v1 - v0) / t0 > 0.005) {
                const actif = assets.find((x) => x.symbol === cle);
                const qte = (t: string) => (actif?.purchases ?? []).reduce((q, p) => (p.date <= t ? q + p.quantity : q), 0);
                const nature: NatureCause = actif?.purchases?.length && qte(String(apres.date)) !== qte(String(avant.date)) ? 'quantite' : 'prix';
                causes.push({ symbole: cle, nature, pointsDuTotal: ((v1 - v0) / t0) * 100 });
            }
        }
        causes.sort((x, y) => Math.abs(y.pointsDuTotal) - Math.abs(x.pointsDuTotal));
        sauts.push({
            date: String(apres.date), precedente: String(avant.date),
            variationPct: Number(variationPct.toFixed(2)),
            causes: causes.map((c) => ({ ...c, pointsDuTotal: Number(c.pointsDuTotal.toFixed(2)) })),
        });
    }

    const trous: TrouTitre[] = [];
    const queuesPerimees: DiagnosticCourbe['queuesPerimees'] = [];
    const sautsDePrix: SautPrix[] = [];
    const quantitesIncoherentes: DiagnosticCourbe['quantitesIncoherentes'] = [];
    for (const a of assets) {
        if (!a.symbol) continue;
        const hist = (a.priceHistory ?? [])
            .filter((p) => p.date && Number.isFinite(p.price) && p.price > 0)
            .sort((x, y) => (x.date < y.date ? -1 : 1));
        for (let i = 1; i < hist.length; i++) {
            const ecart = jours(hist[i - 1].date, hist[i].date);
            if (ecart > STALE_PRICE_DAYS) trous.push({ symbole: a.symbol, du: hist[i - 1].date, au: hist[i].date, jours: ecart });
            const pct = ((hist[i].price - hist[i - 1].price) / hist[i - 1].price) * 100;
            if (Math.abs(pct) >= seuilPrix) sautsDePrix.push({ symbole: a.symbol, date: hist[i].date, variationPct: Number(pct.toFixed(1)) });
        }
        const derniere = hist[hist.length - 1];
        if (derniere && (a.quantity || 0) > 0) {
            const age = jours(derniere.date, aujourdhui);
            if (age > STALE_PRICE_DAYS) queuesPerimees.push({ symbole: a.symbol, derniereCloture: derniere.date, jours: age });
        }
        if (a.purchases && a.purchases.length > 0) {
            const net = a.purchases.reduce((q, p) => q + p.quantity, 0);
            const ecart = Number((net - (a.quantity || 0)).toFixed(6));
            if (Math.abs(ecart) > 1e-6) quantitesIncoherentes.push({ symbole: a.symbol, ecartQuantite: ecart });
        }
    }

    // Plages amputées : dates consécutives de `rows` qui partagent le même ensemble de titres omis.
    const parDate = new Map<string, Set<string>>();
    for (const cle of omittedKeys) {
        try {
            const [d, s] = JSON.parse(cle) as [string, string];
            if (!parDate.has(d)) parDate.set(d, new Set());
            parDate.get(d)!.add(s);
        } catch (err) {
            throw new Error(`omittedKeys illisible (${err instanceof Error ? err.message : 'format'}) : codec encodeOmittedKey modifié sans ce lecteur`);
        }
    }
    const plagesAmputees: DiagnosticCourbe['plagesAmputees'] = [];
    let courante: { du: string; au: string; symboles: string[] } | null = null;
    for (const r of rows) {
        const date = String(r.date);
        const s = [...(parDate.get(date) ?? [])].sort();
        if (s.length === 0) { courante = null; continue; }
        if (courante && courante.symboles.join('|') === s.join('|')) courante.au = date;
        else { courante = { du: date, au: date, symboles: s }; plagesAmputees.push(courante); }
    }

    return { sauts, trous, queuesPerimees, sautsDePrix, quantitesIncoherentes, plagesComblees: gapBridges, plagesAmputees };
}
