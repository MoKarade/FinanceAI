import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { getQuote, getHistory, searchSymbols, getActiveProviderName, type SymbolSearchResult } from '../../services/marketData';
import { formatCAD } from '../../utils/format';
import type { Asset } from '../../types';

/**
 * Phase E.9 — formulaire d'ajout d'une action. DEUX chemins :
 *
 *   A) Avec Finnhub (« Valider ») : fetch un quote live, prix actuel auto, suggestion du prix
 *      historique à la date d'achat. Pratique mais nécessite une clé Finnhub + connexion.
 *   B) 100% MANUEL (« À la main ») : on saisit symbole + prix actuel + quantité + prix d'achat
 *      SOI-MÊME, sans clé ni réseau — pour un titre que Finnhub ne couvre pas (fonds, GIC, titre
 *      étranger) ou simplement pour tout entrer à la main. C'est le « rentrer toutes les données
 *      à la main » demandé.
 *
 * Dans les deux cas : Submit → ajoute l'Asset au store.
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

    // Saisie 100% MANUELLE (sans Finnhub) : pour ajouter une action/un placement à la main, sans clé
    // API ni connexion, ou pour un titre que Finnhub ne couvre pas (fonds, GIC, titre étranger…).
    const [manualMode, setManualMode] = useState(false);
    const [manualPrice, setManualPrice] = useState(''); // prix actuel saisi à la main (manualMode)

    const [isValidating, setIsValidating] = useState(false);
    const [isSuggestingPrice, setIsSuggestingPrice] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // [FINNHUB-MISMATCH] message INFORMATIF (non bloquant, ≠ error rouge) : ex. bascule en saisie manuelle
    // quand un symbole proposé par l'autocomplétion n'a pas de cours Finnhub.
    const [notice, setNotice] = useState<string | null>(null);

    // PH4-INV-1 — autocomplétion à la frappe (Finnhub symbol search). Le dropdown n'apparaît que si
    // une clé Finnhub est configurée ; sinon l'utilisateur reste sur la saisie « À la main ».
    const [suggestions, setSuggestions] = useState<SymbolSearchResult[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchSeq = useRef(0); // anti-course : ne garde que la réponse de la dernière requête
    const hasProvider = getActiveProviderName() !== 'none';

    const reset = () => {
        setSymbol('');
        setValidatedSymbol(null);
        setStockName('');
        setCurrentPrice(null);
        setDateBought(new Date().toISOString().split('T')[0]);
        setQuantity('');
        setBuyPrice('');
        setManualMode(false);
        setManualPrice('');
        setError(null);
        setNotice(null);
        setSuggestions([]);
        setShowSuggestions(false);
    };

    // Débounce 300 ms : recherche tant que l'utilisateur tape (≥ 2 car.), pas encore validé/manuel.
    useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        const q = symbol.trim();
        if (!hasProvider || validatedSymbol !== null || manualMode || q.length < 2) {
            setSuggestions([]);
            return;
        }
        const seq = ++searchSeq.current;
        searchTimer.current = setTimeout(async () => {
            const res = await searchSymbols(q);
            if (seq !== searchSeq.current) return; // une frappe plus récente a pris le relais
            setSuggestions(res.slice(0, 8));
            setShowSuggestions(true);
        }, 300);
        return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    }, [symbol, hasProvider, validatedSymbol, manualMode]);

    /** Bascule en saisie 100% manuelle : le symbole tapé devient le titre, sans appel Finnhub. */
    const enterManualMode = () => {
        const sym = symbol.trim().toUpperCase();
        if (!sym) { setError('Entre d\'abord un symbole ou un nom court (ex: AAPL, FONDS-XYZ).'); return; }
        setError(null);
        setNotice(null);
        setManualMode(true);
        setStockName(sym);
    };

    /** Prêt à saisir le reste : soit le symbole est validé (Finnhub), soit on est en mode manuel. */
    const ready = validatedSymbol !== null || manualMode;

    /**
     * Tente d'obtenir un cours pour un symbole. Retourne un STATUT discriminé :
     *  - 'ok'       : cours obtenu, symbole validé.
     *  - 'no-quote' : pas de cours (symbole inconnu / non couvert par le forfait) → fallback légitime.
     *  - 'error'    : exception réseau (timeout, 401, panne) → NE PAS basculer silencieusement en manuel.
     * La distinction est cruciale : une panne réseau ≠ un symbole non cotable (sinon on masquerait une
     * vraie erreur derrière « entre le prix à la main »).
     */
    const validateSymbol = async (symOverride?: string, nameOverride?: string): Promise<'ok' | 'no-quote' | 'error'> => {
        const sym = (symOverride ?? symbol).trim().toUpperCase();
        if (!sym) return 'no-quote';
        setShowSuggestions(false);
        setIsValidating(true);
        setError(null);
        setNotice(null);
        try {
            const quote = await getQuote(sym);
            if (!quote || quote.price <= 0) {
                setError(`Ticker "${sym}" introuvable ou prix indisponible. Configure ta clé Finnhub si pas déjà fait.`);
                return 'no-quote';
            }
            setSymbol(sym);
            setValidatedSymbol(sym);
            setStockName(nameOverride || quote.symbol);
            setCurrentPrice(quote.price);
            setBuyPrice(quote.price.toString()); // par défaut = prix actuel
            return 'ok';
        } catch (e) {
            console.error('[AddStockForm] validate failed:', e);
            setError("Erreur lors de la validation. Vérifie ta connexion et la clé Finnhub.");
            return 'error';
        } finally {
            setIsValidating(false);
        }
    };

    /** [FINNHUB-MISMATCH] Clic sur une suggestion → tente la validation (quote live). L'autocomplétion
     *  Finnhub `/search` propose des symboles que le `/quote` du forfait gratuit ne sait PAS coter (titres
     *  étrangers/TSX, dérivés). UNIQUEMENT dans ce cas ('no-quote'), on bascule en saisie MANUELLE pré-remplie
     *  (symbole + nom) — il n'a plus qu'à entrer le prix. Une vraie panne réseau ('error') garde son message
     *  d'erreur VISIBLE (pas de bascule silencieuse qui masquerait l'incident). */
    const selectSuggestion = async (r: SymbolSearchResult) => {
        setSuggestions([]);
        setShowSuggestions(false);
        const res = await validateSymbol(r.symbol, r.description);
        if (res === 'no-quote') {
            setError(null);
            setSymbol(r.symbol.toUpperCase());
            setStockName(r.description || r.symbol);
            setManualMode(true);
            setNotice(`« ${r.symbol} » n'a pas de cours via Finnhub (titre étranger ou hors forfait gratuit). Entre le prix à la main ci-dessous.`);
        }
        // res === 'error' → l'erreur réseau reste affichée (pas de fallback manuel silencieux).
        // res === 'ok'    → symbole validé.
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
            if (history && history.length > 0) {
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
        const finalSymbol = (validatedSymbol ?? symbol.trim().toUpperCase()).trim();
        const effectivePrice = manualMode ? parseFloat(manualPrice) : currentPrice;
        if (!finalSymbol || !effectivePrice || !Number.isFinite(effectivePrice) || effectivePrice <= 0 || !quantity || !buyPrice) {
            setError(manualMode ? 'Symbole, prix actuel, quantité et prix d\'achat sont requis.' : 'Tous les champs sont requis.');
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
            symbol: finalSymbol,
            name: stockName || finalSymbol,
            quantity: qty,
            currency,
            currentPrice: effectivePrice,
            performance: ((effectivePrice - bp) / bp) * 100,
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
        <Modal isOpen={isOpen} onClose={handleClose} title="Ajouter une action manuellement" icon={<Icon name="investments" size={22} />} size="lg">
            <div className="space-y-4">
                {/* Step 1 : Symbol */}
                <div>
                    <label className="block text-meta text-ink-300 mb-1 font-bold uppercase">1. Symbole / Ticker</label>
                    <div className="relative">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={symbol}
                            onChange={(e) => { setSymbol(e.target.value.toUpperCase()); if (notice) setNotice(null); }}
                            onFocus={() => { if (suggestions.length) setShowSuggestions(true); }}
                            onBlur={() => { setTimeout(() => setShowSuggestions(false), 150); }}
                            // [RECH-ACTION-UX] Escape ferme le DROPDOWN d'autocomplétion, PAS la modale entière :
                            // le Modal écoute Escape sur `document` ; sans ce stopPropagation, vouloir fermer le
                            // menu fermait toute la fenêtre et perdait la saisie en cours.
                            onKeyDown={(e) => { if (e.key === 'Escape' && showSuggestions) { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setShowSuggestions(false); } }}
                            placeholder={hasProvider ? 'Tape un nom ou un ticker : Apple, AAPL, XEQT…' : 'AAPL, TSLA, FONDS-XYZ...'}
                            disabled={validatedSymbol !== null || manualMode}
                            autoComplete="off"
                            role="combobox"
                            aria-expanded={showSuggestions && suggestions.length > 0}
                            aria-controls="symbol-suggestions"
                            className="flex-1 bg-dark border border-white/10 rounded px-3 py-2 text-white focus:border-primary outline-none uppercase font-mono"
                        />
                        {validatedSymbol || manualMode ? (
                            <button
                                type="button"
                                onClick={() => { setValidatedSymbol(null); setCurrentPrice(null); setManualMode(false); setManualPrice(''); setNotice(null); }}
                                className="px-3 py-2 bg-white/10 text-white rounded font-bold text-body hover:bg-white/15"
                            >
                                Changer
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => validateSymbol()}
                                    disabled={!symbol.trim() || isValidating}
                                    className="px-3 py-2 bg-primary text-dark rounded font-bold text-body hover:bg-primary/80 disabled:opacity-50"
                                >
                                    {isValidating ? '⏳' : 'Valider'}
                                </button>
                                <button
                                    type="button"
                                    onClick={enterManualMode}
                                    disabled={!symbol.trim()}
                                    title="Ajouter sans validation en ligne (Finnhub non requis)"
                                    className="px-3 py-2 bg-white/10 text-white rounded font-bold text-body hover:bg-white/15 disabled:opacity-50"
                                >
                                    À la main
                                </button>
                            </>
                        )}
                    </div>
                    {/* PH4-INV-1 — dropdown d'autocomplétion (Finnhub symbol search). */}
                    {showSuggestions && suggestions.length > 0 && !validatedSymbol && !manualMode && (
                        <ul
                            id="symbol-suggestions"
                            role="listbox"
                            aria-label="Suggestions de titres"
                            className="absolute z-20 mt-1 w-full max-h-80 overflow-y-auto rounded-lg border border-white/15 bg-dark shadow-xl"
                        >
                            {suggestions.map((r) => (
                                <li key={r.symbol} role="option" aria-selected={false}>
                                    <button
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault() /* garde le focus le temps du clic */}
                                        onClick={() => selectSuggestion(r)}
                                        className="w-full text-left px-3 py-2 hover:bg-white/10 focus:bg-white/10 outline-none flex items-center gap-2 min-h-[44px]"
                                    >
                                        <span className="font-mono font-bold text-white shrink-0">{r.displaySymbol || r.symbol}</span>
                                        <span className="text-meta text-ink-300 truncate flex-1">{r.description}</span>
                                        {r.type && <span className="text-tiny text-ink-500 shrink-0 hidden sm:inline">{r.type}</span>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    </div>
                    {isValidating && (
                        <p className="mt-2 text-meta text-ink-300" role="status">⏳ Validation du cours en cours…</p>
                    )}
                    {manualMode && (
                        <div className="mt-2">
                            <label className="block text-meta text-ink-300 mb-1 font-bold uppercase">Prix actuel par action (manuel)</label>
                            <input
                                type="number"
                                value={manualPrice}
                                onChange={(e) => setManualPrice(e.target.value)}
                                min={0}
                                step={0.01}
                                placeholder="ex: 152.30"
                                className="w-full bg-dark border border-white/10 rounded px-3 py-2 text-white focus:border-primary outline-none font-mono"
                            />
                            <p className="text-tiny text-ink-500 mt-1">Sans Finnhub : entre le prix actuel toi-même (modifiable plus tard).</p>
                        </div>
                    )}
                    {validatedSymbol && currentPrice !== null && (
                        <div className="mt-2 p-2 bg-success-500/10 border border-success-500/30 rounded text-meta text-emerald-300 flex justify-between">
                            <span>Validé : <strong className="font-mono">{validatedSymbol}</strong></span>
                            <span className="font-mono">Prix actuel : {formatCAD(currentPrice)}</span>
                        </div>
                    )}
                </div>

                {/* Step 2 : Date + qty + price (validé Finnhub OU saisie manuelle) */}
                {ready && (
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-meta text-ink-300 mb-1 font-bold uppercase">2. Date d'achat</label>
                                <input
                                    type="date"
                                    value={dateBought}
                                    onChange={(e) => setDateBought(e.target.value)}
                                    max={new Date().toISOString().split('T')[0]}
                                    className="w-full bg-dark border border-white/10 rounded px-3 py-2 text-white focus:border-primary outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-meta text-ink-300 mb-1 font-bold uppercase">3. Quantité</label>
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
                            <label className="block text-meta text-ink-300 mb-1 font-bold uppercase flex items-center justify-between">
                                4. Prix d'achat par action
                                {validatedSymbol && (
                                    <button
                                        type="button"
                                        onClick={suggestHistoricalPrice}
                                        disabled={isSuggestingPrice}
                                        className="text-tiny text-info-400 hover:underline disabled:opacity-50"
                                    >
                                        {isSuggestingPrice ? 'Recherche…' : 'Suggérer prix historique'}
                                    </button>
                                )}
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
                            <p className="text-tiny text-ink-500 mt-1">Override possible si le prix suggéré ne correspond pas à ta transaction réelle.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-meta text-ink-300 mb-1 font-bold uppercase">5. Compte fiscal</label>
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
                                <label className="block text-meta text-ink-300 mb-1 font-bold uppercase">Devise</label>
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
                                <div className="text-tiny text-info-400 uppercase font-bold mb-1">Récapitulatif</div>
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

                {notice && (
                    <div className="p-2 bg-info-500/10 border border-info-500/30 rounded text-meta text-info-400" role="status">
                        {notice}
                    </div>
                )}

                {error && (
                    <div className="p-2 bg-danger-500/10 border border-danger-500/30 rounded text-meta text-red-300" role="alert">
                        {error}
                    </div>
                )}

                {/* Pourquoi « Ajouter » est grisé : on liste explicitement les champs requis manquants. */}
                {ready && (!quantity || !buyPrice || (manualMode && !manualPrice)) && (
                    <p className="text-tiny text-amber-300/90 text-right">
                        Pour activer « Ajouter », renseigne{' '}
                        {[
                            manualMode && !manualPrice ? 'le prix actuel' : null,
                            !quantity ? 'la quantité' : null,
                            !buyPrice ? "le prix d'achat" : null,
                        ].filter(Boolean).join(', ')}.
                    </p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 text-ink-200 rounded font-bold text-body transition-colors"
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!ready || !quantity || !buyPrice || (manualMode && !manualPrice)}
                        className="px-4 py-2 bg-primary hover:bg-primary/80 text-dark rounded font-bold text-body transition-colors disabled:opacity-50"
                    >
                        Ajouter au portefeuille
                    </button>
                </div>
            </div>
        </Modal>
    );
};
