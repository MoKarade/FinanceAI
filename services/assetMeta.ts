// Metadonnees hardcodees du portefeuille : secteur, region, rendement,
// frequence de versement et mois du prochain dividende.
//
// Extrait de components/Investments.tsx (bug audit #11) pour casser le
// couplage Dashboard -> Investments. Dashboard tirait ~53ko d'Investments
// uniquement pour cet objet.

export interface AssetMeta {
  sector: string;
  region: string;
  yield: number;
  name: string;
  freq: number;
  nextPayMonth?: number;
}

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
