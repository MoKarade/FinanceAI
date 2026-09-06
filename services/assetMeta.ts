// §7.F.3 — assetMeta hybride : seed hardcodé (fallback offline) + champs PERSISTÉS sur l'actif.
//
// [INVEST-ALLOC-GEO-SECTOR] 2026-07-23 (bug Marc « la répartition géographique marche pas et
// sectorielle non plus ») : les donuts lisaient `ASSET_META[a.symbol]` — table statique de 13
// titres, keyée au format PRÉFIXE place (« EPA:CW8 ») alors que les actifs réels portent des
// symboles SUFFIXE (« CW8.PA ») → quasi tout tombait en « Autre »/« Autre ». (L'en-tête historique
// promettait un `getAssetMeta` dynamique qui n'a jamais existé — doc menteuse retirée.)
//
// Source de vérité DÉSORMAIS : `resolveAssetMeta(asset)` (PURE, sync) — priorité :
//   1. `asset.sector`/`asset.region` (édités inline dans Investissements, ou auto-remplis au boot
//      par hydrateAssetProfiles via le profil provider) ;
//   2. seed ASSET_META avec matching NORMALISÉ préfixe↔suffixe (« CW8.PA » matche « EPA:CW8 ») ;
//   3. crypto (CoinGecko connu) → « Crypto »/« Global » par construction ;
//   4. « Autre »/« Autre » honnête (et ÉDITABLE — plus une impasse).

export interface AssetMeta {
  sector: string;
  region: string;
  yield: number;
  name: string;
  freq: number;
  nextPayMonth?: number;
}

/** Seed hardcodé — fallback quand marketData provider absent ou échoue. */
const ASSET_META: Record<string, AssetMeta> = {
  // US TECH / SEMI
  "NASDAQ:NVDA": { name: "Nvidia", sector: "Technologie", region: "USA", yield: 0.02, freq: 4, nextPayMonth: 3 },
  "NASDAQ:AVGO": { name: "Broadcom", sector: "Technologie", region: "USA", yield: 1.4, freq: 4, nextPayMonth: 3 },
  "NASDAQ:PLTR": { name: "Palantir", sector: "Technologie", region: "USA", yield: 0, freq: 1 },
  "NASDAQ:KLAC": { name: "KLA Corp", sector: "Technologie", region: "USA", yield: 0.9, freq: 4, nextPayMonth: 3 },

  // INDUSTRIE / AERO
  "NYSE:HWM": { name: "Howmet Aero", sector: "Industrie", region: "USA", yield: 0.3, freq: 4, nextPayMonth: 2 },
  "EPA:SAF": { name: "Safran", sector: "Industrie", region: "Europe", yield: 1.1, freq: 1, nextPayMonth: 5 },

  // FINANCE
  "NYSE:V": { name: "Visa", sector: "Finance", region: "USA", yield: 0.7, freq: 4, nextPayMonth: 3 },

  // ASIA
  "NYSE:TSM": { name: "TSMC", sector: "Technologie", region: "Asie", yield: 1.3, freq: 4, nextPayMonth: 4 },
  "EPA:PAASI": { name: "Emerging Asia", sector: "Index", region: "Asie", yield: 0, freq: 1 },
  "ANDXF": { name: "Amundi Em. Asia", sector: "Index", region: "Asie", yield: 0, freq: 1 },

  // GLOBAL / COMMODITIES
  "EPA:CW8": { name: "MSCI World", sector: "Index", region: "Global", yield: 1.5, freq: 1, nextPayMonth: 6 },
  "BIT:GBS": { name: "Gold Bullion", sector: "Mines/Or", region: "Global", yield: 0, freq: 1 },
  // [Sonde #496] GBS est coté à Paris AUSSI (GBS.PA) — l'entrée BIT: seule normalisait en GBS.MI
  // → GBS.PA restait « Autre ». Idem AASI.PA (Amundi MSCI Em Asia, ticker Paris réel — le seed
  // n'avait que EPA:PAASI/ANDXF). Tickers du portefeuille réel de Marc, mesurés non couverts.
  "EPA:GBS": { name: "Gold Bullion", sector: "Mines/Or", region: "Global", yield: 0, freq: 1 },
  "EPA:AASI": { name: "Amundi MSCI Em Asia", sector: "Index", region: "Asie", yield: 0, freq: 1 },
  "EPA:PAAS": { name: "Pan American", sector: "Mines/Or", region: "Ameriques", yield: 1.2, freq: 4, nextPayMonth: 2 },
};



import type { Asset } from '../types';
import { toFinnhubSymbol } from './marketData/providers/finnhub';
import { coinGeckoIdFor } from './marketData/providers/coingecko';

/** Valeurs canoniques des donuts (aussi les options de l'édition inline d'Investissements). */
export const CANONICAL_SECTORS = ['Technologie', 'Industrie', 'Finance', 'Index', 'Mines/Or', 'Crypto', 'Autre'] as const;
export const CANONICAL_REGIONS = ['USA', 'Canada', 'Europe', 'Asie', 'Ameriques', 'Global', 'Autre'] as const;

// Index du seed par symbole NORMALISÉ (format suffixe — « EPA:CW8 » → « CW8.PA ») : les actifs
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

export interface ResolvedAssetMeta {
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
