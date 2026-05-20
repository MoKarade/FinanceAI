import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { getQuote, getHistory } from '../../services/marketData';
import { formatCAD } from '../../utils/format';
import type { Asset } from '../../types';

/**
 * Phase E.9 — formulaire d'ajout manuel d'une action.
 *
 * Flow :
 *   1. Saisir le symbol (ex: AAPL, TSLA, MSFT) + valider
 *   2. L'app fetch un quote en live + propose le prix actuel
 *   3. Saisir date d'achat + quantité
 *   4. Suggestion du prix historique à cette date (via getHistory)
 *   5. Override manuel du prix possible
 *   6. Submit → ajoute l'Asset au store
 *
 * Nécessite une clé Finnhub configurée. Affichage dégradé sans clé.
 */

interface AddStockFormProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (asset: Asset) => void;
}

export const AddStockForm: React.FC<AddStockFormProps> = ({ isOpen, onClose, onAdd }) => {
    const [symbol, setSymbol] = useState('');
    const [validatedSymbol, setValidatedSymbol] = useState<string | null>(null);
    const [stockName, setStockName] = useState('');
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const [dateBought, setDateBought] = useState(new Date().toISOString().split('T')[0]);
    const [quantity, setQuantity] = useState('');
    const [buyPrice, setBuyPrice] = useState('');
    const [accountType, setAccountType] = useState<Asset['accountType']>('NON-ENREG');
    const [currency, setCurrency] = useState<'USD' | 'CAD' | 'EUR'>('USD');

    const [isValidating, setIsValidating] = useState(false);
    const [isSuggestingPrice, setIsSuggestingPrice] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reset = () => {
        setSymbol('');
        setValidatedSymbol(null);
        setStockName('');
        setCurrentPrice(null);
        setDateBought(new Date().toISOString().split('T')[0]);
        setQuantity('');
        setBuyPrice('');
        setError(null);
    };

    const validateSymbol = async () => {
        if (!symbol.trim()) return;
        setIsValidating(true);
        setError(null);
        try {
            const quote = await getQuote(symbol.trim().toUpperCase());
            if (!quote || quote.price <= 0) {
                setError(`Ticker "${symbol}" introuvable ou prix indisponible. Configure ta clé Finnhub si pas déjà fait.`);
                return;
            }
            setValidatedSymbol(symbol.trim().toUpperCase());
            setStockName(quote.symbol);
            setCurrentPrice(quote.price);
            setBuyPrice(quote.price.toString()); // par défaut = prix actuel
        } catch (e) {
            console.error('[AddStockForm] validate failed:', e);
            setError("Erreur lors de la validation. Vérifie ta connexion et la clé Finnhub.");
        } finally {
            setIsValidating(false);
        }
    };

    const suggestHistoricalPrice = async () => {
        if (!validatedSymbol || !dateBought) return;
        setIsSuggestingPrice(true);
        try {
            const date = new Date(dateBought);
            const from = new Date(date);
            from.setDate(from.getDate() - 3);
            const to = new Date(date);
            to.setDate(to.getDate() + 3);
            const history = await getHistory(validatedSymbol, from, to);
            if (history.length > 0) {
                // Trouve le point le plus proche
                const targetTime = date.getTime();
                const closest = history.reduce((best, p) => {
                    const diff = Math.abs(new Date(p.date).getTime() - targetTime);
                    return diff < Math.abs(new Date(best.date).getTime() - targetTime) ? p : best;
                });
                setBuyPrice(closest.close.toString());
            }
        } catch (e) {
            console.warn('[AddStockForm] suggest price failed:', e);
        } finally {
            setIsSuggestingPrice(false);
        }
    };

    const handleSubmit = () => {
        if (!validatedSymbol || !currentPrice || !quantity || !buyPrice) {
            setError("Tous les champs sont requis.");
            return;
        }
        const qty = parseFloat(quantity);
        const bp = parseFloat(buyPrice);
        if (!Number.isFinite(qty) || qty <= 0) {
            setError("Quantité invalide.");
            return;
        }
        if (!Number.isFinite(bp) || bp <= 0) {
            setError("Prix d'achat invalide.");
            return;
        }
        // Phase E.8 — initialise purchases[] avec le premier achat, garde
        // dateBought/buyPrice pour rétrocompat
        const asset: Asset = {
            symbol: validatedSymbol,
            name: stockName,
            quantity: qty,
            currency,
            currentPrice,
            performance: ((currentPrice - bp) / bp) * 100,
            dateBought,
            buyPrice: bp,
            purchases: [{ date: dateBought, quantity: qty, price: bp }],
            accountType,
        };
        onAdd(asset);
        reset();
        onClose();
    };

    const handleClose = () => { reset(); onClose(); };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Ajouter une action manuellement" icon="📈" size="lg">
            <div className="space-y-4">
                {/* Step 1 : Symbol */}
                <div>
                    <label className="block text-xs text-gray-400 mb-1 font-bold uppercase">1. Symbole / Ticker</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                            placeholder="AAPL, TSLA, MSFT..."
                            disabled={validatedSymbol !== null}
                            className="flex-1 bg-dark border border-white/10 rounded px-3 py-2 text-white focus:border-primary outline-none uppercase font-mono"
                        />
                        {validatedSymbol ? (
                            <button
                                type="button"
                                onClick={() => { setValidatedSymbol(null); setCurrentPrice(null); }}
                                className="px-3 py-2 bg-white/10 text-white rounded font-bold text-sm hover:bg-white/15"
                            >
                                Changer
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={validateSymbol}
                                disabled={!symbol.trim() || isValidating}
                                className="px-3 py-2 bg-primary text-white rounded font-bold text-sm hover:bg-primary/80 disabled:opacity-50"
                            >
                                {isValidating ? '⏳' : 'Valider'}
                            </button>
                        )}
                    </div>
                    {validatedSymbol && currentPrice !== null && (
                        <div className="mt-2 p-2 bg-emerald-500/10 border border-emerald-500/30 rounded text-meta text-emerald-300 flex justify-between">
                            <span>✓ Validé : <strong className="font-mono">{validatedSymbol}</strong></span>
                            <span className="font-mono">Prix actuel : {formatCAD(currentPrice)}</span>
                        </div>
                    )}
                </div>

                {/* Step 2 : Date + qty + price */}
                {validatedSymbol && (
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1 font-bold uppercase">2. Date d'achat</label>
                                <input
                                    type="date"
                                    value={dateBought}
                                    onChange={(e) => setDateBought(e.target.value)}
                                    max={new Date().toISOString().split('T')[0]}
                                    className="w-full bg-dark border border-white/10 rounded px-3 py-2 text-white focus:border-primary outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1 font-bold uppercase">3. Quantité</label>
                                <input
                                    type="number"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    min={0}
                                    step={0.01}
                                    placeholder="10"
                                    className="w-full bg-dark border border-white/10 rounded px-3 py-2 text-white focus:border-primary outline-none font-mono"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1 font-bold uppercase flex items-center justify-between">
                                4. Prix d'achat par action
                                <button
                                    type="button"
                                    onClick={suggestHistoricalPrice}
                                    disabled={isSuggestingPrice}
                                    className="text-tiny text-info-400 hover:underline disabled:opacity-50"
                                >
                                    {isSuggestingPrice ? '⏳ Recherche…' : '💡 Suggérer prix historique'}
                                </button>
                            </label>
                            <input
                                type="number"
                                value={buyPrice}
                                onChange={(e) => setBuyPrice(e.target.value)}
                                min={0}
                                step={0.01}
                                placeholder="150.00"
                                className="w-full bg-dark border border-white/10 rounded px-3 py-2 text-white focus:border-primary outline-none font-mono"
                            />
                            <p className="text-tiny text-gray-500 mt-1">Override possible si le prix suggéré ne correspond pas à ta transaction réelle.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1 font-bold uppercase">5. Compte fiscal</label>
                                <select
                                    value={accountType}
                                    onChange={(e) => setAccountType(e.target.value as Asset['accountType'])}
                                    className="w-full bg-dark border border-white/10 rounded px-3 py-2 text-white focus:border-primary outline-none"
                                >
                                    <option value="NON-ENREG">Non-enregistré</option>
                                    <option value="CELI">CELI</option>
                                    <option value="REER">REER</option>
                                    <option value="CELIAPP">CELIAPP / FHSA</option>
                                    <option value="CRYPTO">Crypto</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1 font-bold uppercase">Devise</label>
                                <select
                                    value={currency}
                                    onChange={(e) => setCurrency(e.target.value as 'USD' | 'CAD' | 'EUR')}
                                    className="w-full bg-dark border border-white/10 rounded px-3 py-2 text-white focus:border-primary outline-none"
                                >
                                    <option value="USD">USD</option>
                                    <option value="CAD">CAD</option>
                                    <option value="EUR">EUR</option>
                                </select>
                            </div>
                        </div>

                        {/* Récapitulatif */}
                        {quantity && buyPrice && (
                            <div className="p-3 bg-info-500/10 border border-info-500/30 rounded">
                                <div className="text-tiny text-info-300 uppercase font-bold mb-1">Récapitulatif</div>
                                <div className="text-meta text-ink-100">
                                    <strong className="font-mono">{quantity}</strong> × <strong className="font-mono">{formatCAD(parseFloat(buyPrice) || 0)}</strong> {currency}
                                    {' '}= <strong className="font-mono">{formatCAD((parseFloat(quantity) || 0) * (parseFloat(buyPrice) || 0))}</strong> investi le {new Date(dateBought).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
                                </div>
                                {currentPrice && parseFloat(buyPrice) > 0 && (
                                    <div className={`text-tiny mt-1 font-mono ${currentPrice >= parseFloat(buyPrice) ? 'text-emerald-300' : 'text-red-300'}`}>
                                        Gain non-réalisé : {currentPrice >= parseFloat(buyPrice) ? '+' : ''}{(((currentPrice - parseFloat(buyPrice)) / parseFloat(buyPrice)) * 100).toFixed(2)}%
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                {error && (
                    <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-meta text-red-300">
                        {error}
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 text-ink-200 rounded font-bold text-sm transition-colors"
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!validatedSymbol || !quantity || !buyPrice}
                        className="px-4 py-2 bg-primary hover:bg-primary/80 text-white rounded font-bold text-sm transition-colors disabled:opacity-50"
                    >
                        Ajouter au portefeuille
                    </button>
                </div>
            </div>
        </Modal>
    );
};
