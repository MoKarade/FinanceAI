import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { parseBrokerCsv, holdingsToAssets, type ParsedBrokerCsv } from '../../services/import/parseBrokerCsv';
import type { Asset } from '../../types';

/**
 * Import de positions courtier en lot (CSV) — Wealthsimple, Questrade, Disnat,
 * RBC DI… 100 % local. Fichier OU collage → aperçu → ajout au portefeuille.
 * S'appuie sur parseBrokerCsv (pur, testé) ; le prix live est rafraîchi ensuite
 * par Finnhub si une clé est configurée (sinon coût moyen = base, perf 0 %).
 */
interface Props {
    isOpen: boolean;
    onClose: () => void;
    onImport: (assets: Asset[]) => void;
}

const fmt = (v: number) => v.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const ImportBrokerPositions: React.FC<Props> = ({ isOpen, onClose, onImport }) => {
    const [preview, setPreview] = useState<ParsedBrokerCsv | null>(null);
    const [error, setError] = useState<string | null>(null);

    const parse = (text: string) => {
        setError(null);
        const parsed = parseBrokerCsv(text);
        if (parsed.imported === 0) {
            setError(
                "Aucune position reconnue. Le CSV doit avoir un en-tête avec au moins une colonne « symbole/ticker » et une colonne « quantité ». Exporte tes positions depuis ton courtier.",
            );
            setPreview(null);
            return;
        }
        setPreview(parsed);
    };

    const handleFile = async (file: File) => {
        try { parse(await file.text()); }
        catch { setError('Impossible de lire le fichier.'); }
    };

    const reset = () => { setPreview(null); setError(null); };
    const handleClose = () => { reset(); onClose(); };
    const confirm = () => {
        if (!preview) return;
        onImport(holdingsToAssets(preview.holdings));
        reset();
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Importer mes positions (CSV courtier)" icon="📥" size="lg">
            <div className="space-y-4">
                <p className="text-meta text-ink-300">
                    Exporte tes positions depuis ton courtier (Wealthsimple, Questrade, Disnat, RBC DI…) en CSV,
                    puis dépose le fichier ou colle son contenu. 100 % local — rien ne quitte ton navigateur.
                    Colonnes reconnues : symbole, quantité, coût moyen (ou coût total), devise, type de compte, date.
                </p>

                <label className="flex items-center gap-3 cursor-pointer">
                    <span className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-body text-ink-100 transition-colors">
                        Choisir un fichier CSV…
                    </span>
                    <input
                        type="file"
                        accept=".csv,.txt,.tsv,text/csv"
                        className="sr-only"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
                        aria-label="Choisir un export de positions CSV"
                    />
                </label>

                <div>
                    <label className="block text-meta text-ink-300 mb-1">… ou colle le CSV ici</label>
                    <textarea
                        rows={4}
                        onChange={(e) => { const v = e.target.value; if (v.trim()) parse(v); else reset(); }}
                        placeholder={'Symbol,Quantity,Average Cost,Currency,Account\nAAPL,10,150.25,USD,TFSA'}
                        className="w-full bg-dark border border-white/10 rounded px-3 py-2 text-white font-mono text-tiny outline-none focus:border-primary"
                    />
                </div>

                {error && (
                    <div className="text-meta text-red-300 bg-red-900/20 border border-danger-500/20 rounded-lg p-2">{error}</div>
                )}

                {preview && (
                    <div className="space-y-2 animate-fade-in">
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-tiny text-ink-300">
                            <span><span className="text-ink-200 font-bold">{preview.imported}</span> position(s) prête(s)</span>
                            {preview.skipped > 0 && <span className="text-amber-300">{preview.skipped} ligne(s) ignorée(s)</span>}
                        </div>
                        <div className="rounded-lg border border-white/5 max-h-48 overflow-y-auto">
                            <table className="w-full text-tiny">
                                <thead className="bg-black/30 text-ink-500 sticky top-0">
                                    <tr>
                                        <th className="text-left p-2">Symbole</th>
                                        <th className="text-right p-2">Qté</th>
                                        <th className="text-right p-2">Coût moyen</th>
                                        <th className="text-left p-2">Compte</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {preview.holdings.slice(0, 8).map((h, i) => (
                                        <tr key={`${h.symbol}-${i}`}>
                                            <td className="p-2 font-mono text-ink-200">{h.symbol}</td>
                                            <td className="p-2 text-right font-mono text-ink-300 privacy-blur">{h.quantity}</td>
                                            <td className="p-2 text-right font-mono text-ink-300 privacy-blur">{fmt(h.avgCost)} {h.currency}</td>
                                            <td className="p-2 text-ink-300">{h.accountType ?? 'NON-ENREG'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {preview.holdings.length > 8 && (
                            <p className="text-tiny text-ink-500">… et {preview.holdings.length - 8} autre(s).</p>
                        )}
                        <p className="text-tiny text-ink-500">
                            Le prix actuel se met à jour via Finnhub si ta clé est configurée ; sinon le coût moyen
                            sert de base (performance 0 % jusqu'au prochain rafraîchissement). Les symboles déjà
                            présents ne sont pas dupliqués.
                        </p>
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={handleClose} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-ink-200 rounded font-bold text-body transition-colors">
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={confirm}
                        disabled={!preview}
                        className="px-4 py-2 bg-primary hover:bg-primary/80 text-white rounded font-bold text-body transition-colors disabled:opacity-50"
                    >
                        Importer{preview ? ` ${preview.imported} position(s)` : ''}
                    </button>
                </div>
            </div>
        </Modal>
    );
};
