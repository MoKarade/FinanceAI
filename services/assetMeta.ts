// §7.F.3 — assetMeta hybride : seed hardcodé (fallback offline) + champs PERSISTÉS sur l'actif.
//
// [INVEST-ALLOC-GEO-SECTOR] 2026-07-23 (bug Marc « la répartition géographique marche pas et
// sectorielle non plus ») : les donuts lisaient `ASSET_META[a.symbol]` — table statique de 13
// titres, keyée au format PRÉFIXE place (« EPA:XXX ») alors que les actifs réels portent des
// symboles SUFFIXE (« XXX.PA ») → quasi tout tombait en « Autre »/« Autre ». (L'en-tête historique
// promettait un `getAssetMeta` dynamique qui n'a jamais existé — doc menteuse retirée.)
//
// Source de vérité DÉSORMAIS : `resolveAssetMeta(asset)` (PURE, sync) — priorité :
//   1. `asset.sector`/`asset.region` (édités inline dans Investissements, ou auto-remplis au boot
//      par hydrateAssetProfiles via le profil provider) ;
//   2. seed ASSET_META avec matching NORMALISÉ préfixe↔suffixe (« XXX.PA » matche « EPA:XXX ») ;
//   3. crypto (CoinGecko connu) → « Crypto »/« Global » par construction ;
//   4. « Autre »/« Autre » honnête (et ÉDITABLE — plus une impasse).

interface AssetMeta {
  sector: string;
  region: string;
  yield: number;
  name: string;
  freq: number;
  nextPayMonth?: number;
}

/**
 * Seed hardcodé — fallback quand marketData provider absent ou échoue. Volontairement RÉDUIT à quelques
 * fonds et titres très courants : aucune composition de
 * portefeuille réelle dans le dépôt public. Le rendement n'est pas seedé (0 = « non renseigné ») :
 * il se saisit sur l'actif (`dividendYield`).
 */
const ASSET_META: Record<string, AssetMeta> = {
  "NASDAQ:MSFT": { name: "Microsoft", sector: "Technologie", region: "USA", yield: 0, freq: 4 },
  "TSX:ZSP": { name: "Indice S&P 500", sector: "Index", region: "USA", yield: 0, freq: 4 },
  "TSX:XAW": { name: "Indice actions mondial hors Canada", sector: "Index", region: "Global", yield: 0, freq: 4 },
};



import type { Asset } from '../types';
import { toFinnhubSymbol } from './marketData/providers/finnhub';
import { coinGeckoIdFor } from './marketData/providers/coingecko';

/** Valeurs canoniques des donuts (aussi les options de l'édition inline d'Investissements). */
export const CANONICAL_SECTORS = ['Technologie', 'Industrie', 'Finance', 'Index', 'Mines/Or', 'Crypto', 'Autre'] as const;
export const CANONICAL_REGIONS = ['USA', 'Canada', 'Europe', 'Asie', 'Ameriques', 'Global', 'Autre'] as const;

// Index du seed par symbole NORMALISÉ (format suffixe — « EPA:XXX » → « XXX.PA ») : les actifs
// réels portent le format suffixe, la table historique le format préfixe → sans normalisation,
// même les titres PRÉSENTS dans le seed tombaient en « Autre » (cause n°2 du bug).
const SEED_BY_NORMALIZED: Record<string, AssetMeta> = {};
for (const [key, meta] of Object.entries(ASSET_META)) {
    SEED_BY_NORMALIZED[toFinnhubSymbol(key).toUpperCase()] = meta;
}

/** Seed par symbole, tolérant au format (exact, préfixe place, suffixe). Exporté pour test. */
export function lookupSeedMeta(symbol: string): AssetMeta | undefined {
    if (!symbol) return undefined;
    return ASSET_META[symbol] ?? SEED_BY_NORMALIZED[toFinnhubSymbol(symbol).toUpperCase()];
}

interface ResolvedAssetMeta {
    name: string;
    sector: string;
    region: string;
    yield: number;
    freq: number;
    nextPayMonth?: number;
    /** D'où viennent sector/region — 'asset' = champ persisté (édité/auto-rempli), sinon déduits. */
    source: 'asset' | 'seed' | 'crypto' | 'unknown';
}

/**
 * Secteur/région d'un actif — PURE, sync, source unique des donuts ET de l'auto-populate
 * (qui ne remplit que les actifs dont la résolution est 'unknown'). Voir la priorité en tête.
 */
export function resolveAssetMeta(asset: Pick<Asset, 'symbol' | 'name' | 'sector' | 'region' | 'currentPrice'>): ResolvedAssetMeta {
    const seed = lookupSeedMeta(asset.symbol);
    const base = {
        name: seed?.name || asset.name || asset.symbol,
        yield: seed?.yield ?? 0,
        freq: seed?.freq ?? 1,
        nextPayMonth: seed?.nextPayMonth,
    };
    // 1. Champs persistés de l'actif (chacun indépendamment — un seul des deux peut être rempli).
    if (asset.sector || asset.region) {
        return {
            ...base,
            sector: asset.sector || seed?.sector || (coinGeckoIdFor(asset.symbol) ? 'Crypto' : 'Autre'),
            region: asset.region || seed?.region || (coinGeckoIdFor(asset.symbol) ? 'Global' : 'Autre'),
            source: 'asset',
        };
    }
    // 2. Seed normalisé.
    if (seed) return { ...base, sector: seed.sector, region: seed.region, source: 'seed' };
    // 3. Crypto par construction.
    if (coinGeckoIdFor(asset.symbol)) return { ...base, sector: 'Crypto', region: 'Global', source: 'crypto' };
    // 4. Inconnu honnête (éditable dans Investissements).
    return { ...base, sector: 'Autre', region: 'Autre', source: 'unknown' };
}
