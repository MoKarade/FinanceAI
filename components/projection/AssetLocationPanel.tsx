// components/projection/AssetLocationPanel.tsx
// C3 suite — Branche assetLocation.ts sur le portfolio réel de l'utilisateur.
// Affiche les recommandations de placement par compte (CELI/REER/NonReg) basées
// sur les règles canadiennes (PWL Capital / Canadian Couch Potato).

import React, { useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import type { Asset } from '../../types';
import { optimizeAssetLocation, type AssetClass, type AccountType } from '../../services/projection/assetLocation';

interface Props {
    assets: Asset[];
    annualGrossIncome: number;
}

// Heuristique symbole → classe d'actif.
// Couvre les ETF canadiens courants + tickers US courants.
function inferAssetClass(symbol: string): AssetClass | null {
    const s = symbol.toUpperCase().replace('.TO', '').replace('.TSX', '');

    // Crypto → skip (pas géré par assetLocation)
    const cryptoTickers = ['BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'XRP', 'DOT', 'MATIC', 'AVAX', 'LINK'];
    if (cryptoTickers.includes(s)) return null;

    // Obligations / fonds monétaire
    const bondPrefixes = ['ZAG', 'VAB', 'XBB', 'XSB', 'XLB', 'CLF', 'BND', 'AGG', 'HYS', 'PSA', 'CASH', 'HISA'];
    if (bondPrefixes.some(p => s.startsWith(p))) return 'bonds';

    // REIT canadien
    const reitTickers = ['ZRE', 'XRE', 'VNQ', 'REI', 'CRT'];
    if (reitTickers.some(p => s.startsWith(p))) return 'reit';

    // Actions US
    const usTickers = ['VOO', 'VFV', 'SPY', 'IVV', 'QQQ', 'VTI', 'ITOT', 'VGT', 'XQQ'];
    if (usTickers.some(p => s.startsWith(p))) return 'us-equity';

    // Actions internationales
    const intlTickers = ['VXUS', 'XEF', 'VEE', 'EFA', 'IEFA', 'ACWX', 'VIU'];
    if (intlTickers.some(p => s.startsWith(p))) return 'international';

    // Small-cap / croissance
    const growthTickers = ['VSS', 'VBR', 'AVSC', 'VXC', 'XCS'];
    if (growthTickers.some(p => s.startsWith(p))) return 'growth-small';

    // Actions canadiennes
    const caTickers = ['XIC', 'VCN', 'XIU', 'ZCN', 'HXT', 'XDIV', 'CDZ'];
    if (caTickers.some(p => s.startsWith(p))) return 'ca-equity';

    // Fallback : si le symbole se termine par .TO → actions canadiennes
    if (symbol.toUpperCase().endsWith('.TO')) return 'ca-equity';

    // Fallback générique : equity us
    return 'us-equity';
}

function mapAccountType(rawType: string | undefined): AccountType | null {
    if (!rawType) return null;
    const t = rawType.toUpperCase();
    if (t === 'CELI') return 'CELI';
    if (t === 'REER') return 'REER';
    if (t === 'NON-ENREG' || t === 'NONENREG') return 'NonReg';
    return null; // CRYPTO, CELIAPP, REEE, etc. → ignoré par assetLocation
}

const CLASS_LABELS: Record<AssetClass, string> = {
    bonds: 'Obligations/GIC',
    'us-equity': 'Actions US',
    'ca-equity': 'Actions CAD',
    international: 'International',
    'growth-small': 'Petites cap.',
    reit: 'REIT',
    cash: 'Liquidités',
};
const ACCOUNT_COLORS: Record<AccountType, string> = {
    CELI: 'text-green-300',
    REER: 'text-blue-300',
    NonReg: 'text-amber-300',
};

export const AssetLocationPanel: React.FC<Props> = ({ assets, annualGrossIncome }) => {
    const [expanded, setExpanded] = useState(false);

    const result = useMemo(() => {
        if (assets.length === 0 || annualGrossIncome <= 0) return null;

        const holdings = assets
            .map(a => {
                const assetClass = inferAssetClass(a.symbol);
                const currentAccount = mapAccountType(a.accountType);
                if (!assetClass || !currentAccount) return null;
                const amount = (a.currentPrice || 0) * (a.quantity || 0);
                if (amount < 100) return null;
                return { assetClass, amount, currentAccount };
            })
            .filter((h): h is NonNullable<typeof h> => h !== null);

        if (holdings.length === 0) return null;
        return optimizeAssetLocation({ annualGrossIncome, holdings });
    }, [assets, annualGrossIncome]);

    if (!result) return null;

    const hasIssues = result.totalAnnualLoss > 0;

    return (
        <div className={`mt-3 rounded-xl border p-3.5 ${hasIssues ? 'border-warning-500/30 bg-warning-500/5' : 'border-green-500/30 bg-green-500/5'}`}>
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center justify-between gap-2 focus-ring rounded"
                aria-expanded={expanded}
            >
                <span className="text-meta font-black text-white tracking-tight flex items-center gap-1.5">
                    <Icon name={hasIssues ? 'alert' : 'check'} size={14} className={hasIssues ? 'text-warning-400' : 'text-success-400'} /> Placement par compte
                </span>
                <span className={`text-tiny font-bold ${hasIssues ? 'text-amber-300' : 'text-green-300'}`}>
                    {hasIssues
                        ? `~${result.totalAnnualLoss.toLocaleString('fr-CA')}$/an d'impôts évitables`
                        : 'Allocation optimale'}
                </span>
            </button>

            {expanded && (
                <div className="mt-3 space-y-2">
                    <p className="text-tiny text-ink-300">{result.summary}</p>
                    {result.recommendations.length === 0 ? (
                        <p className="text-tiny text-green-300">Aucun déplacement suggéré.</p>
                    ) : (
                        <div className="space-y-1.5">
                            {result.recommendations.map((rec, i) => (
                                <div key={i} className="flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-tiny font-bold text-white">{CLASS_LABELS[rec.assetClass]}</span>
                                            <span className="text-tiny text-ink-400 privacy-blur">{rec.amount.toLocaleString('fr-CA', { maximumFractionDigits: 0 })}$</span>
                                        </div>
                                        <div className="text-tiny text-ink-300 mt-0.5">
                                            <span className={ACCOUNT_COLORS[rec.currentAccount]}>{rec.currentAccount}</span>
                                            <span className="text-ink-500"> → </span>
                                            <span className={ACCOUNT_COLORS[rec.recommendedAccount]}>{rec.recommendedAccount}</span>
                                            <span className="text-ink-400 ml-2">({rec.rationale})</span>
                                        </div>
                                    </div>
                                    <span className="text-tiny font-mono text-amber-300 whitespace-nowrap shrink-0 privacy-blur">
                                        -{rec.annualLossIfUnchanged.toLocaleString('fr-CA')}$/an
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
