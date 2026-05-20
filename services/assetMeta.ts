// §7.F.3 — assetMeta hybride : seed hardcodé (fallback offline) + override
// dynamique via getProfile(symbol) marketData provider.
//
// Avant : 13 symboles hardcodés, jamais à jour, manque les nouveaux achats.
// Après : ASSET_META = seed initial. getAssetMeta(symbol) priorise un profil
// dynamique (Finnhub) si disponible, sinon retourne le seed, sinon une
// valeur "inconnue" minimale.
//
// Migration : les consumers existants (`ASSET_META[symbol]`) restent
// compatibles tant qu'ils ne sont pas mis à jour. Nouveau code doit utiliser
// `getAssetMeta(symbol)` async.

import { getProfile, type AssetProfile } from './marketData';

export interface AssetMeta {
  sector: string;
  region: string;
  yield: number;
  name: string;
  freq: number;
  nextPayMonth?: number;
}

/** Seed hardcodé — fallback quand marketData provider absent ou échoue. */
export const ASSET_META: Record<string, AssetMeta> = {
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
  "EPA:PAAS": { name: "Pan American", sector: "Mines/Or", region: "Ameriques", yield: 1.2, freq: 4, nextPayMonth: 2 },
};

const UNKNOWN_META: AssetMeta = {
  name: 'Inconnu',
  sector: 'Autre',
  region: 'Global',
  yield: 0,
  freq: 1,
};

/** Convertit un AssetProfile (marketData) vers notre AssetMeta historique. */
function profileToMeta(profile: AssetProfile): AssetMeta {
  return {
    name: profile.name,
    sector: profile.sector,
    region: profile.region,
    yield: profile.dividendYield,
    freq: 4, // valeur sentinel — Finnhub /profile2 ne renvoie pas la freq
  };
}

/**
 * Récupère la metadata d'un actif. Priorité :
 *   1. marketData provider dynamique (si configuré)
 *   2. ASSET_META seed hardcodé
 *   3. UNKNOWN_META par défaut
 *
 * Async pour permettre le fetch réseau. Cache TTL 24h géré par marketData/cache.
 */
export async function getAssetMeta(symbol: string): Promise<AssetMeta> {
  // 1. Tente le provider dynamique
  try {
    const profile = await getProfile(symbol);
    if (profile) return profileToMeta(profile);
  } catch {
    // silently fallback to seed
  }
  // 2. Seed hardcodé
  if (ASSET_META[symbol]) return ASSET_META[symbol];
  // 3. Unknown — pas de crash sur un nouveau symbole inconnu
  return { ...UNKNOWN_META, name: symbol };
}

/** Version sync (rétrocompat). Lit uniquement le seed sans tenter le provider. */
export function getAssetMetaSync(symbol: string): AssetMeta {
  return ASSET_META[symbol] ?? { ...UNKNOWN_META, name: symbol };
}
