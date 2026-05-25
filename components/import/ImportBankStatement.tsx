import React, { useState } from 'react';
import { parseBankCsv, type ParsedBankCsv } from '../../services/import/parseBankCsv';

interface ImportBankStatementProps {
    /** Reçoit le texte brut du fichier ; l'app le re-parse + fusionne + dédoublonne. */
    onImport: (rawText: string) => void;
}

const cad = (v: number) => `${v.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

const DELIM_LABEL: Record<string, string> = { ',': 'virgule', ';': 'point-virgule', '\t': 'tabulation' };

/**
 * Import de relevé bancaire CSV — gratuit, 100% local (rien ne quitte le
 * navigateur). Choix de fichier → aperçu (séparateur/colonnes détectés + 3
 * premières lignes + compte) → confirmation. S'appuie sur parseBankCsv qui gère
 * n'importe quelle banque (virgule/`;`/TAB, dates FR/ISO, montants `1 234,56`,
 * débit/crédit séparés).
 */
export const ImportBankStatement: React.FC<ImportBankStatementProps> = ({ onImport }) => {
    const [raw, setRaw] = useState('');
    const [fileName, setFileName] = useState('');
    const [preview, setPreview] = useState<ParsedBankCsv | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleFile = async (file: File) => {
        setError(null);
        try {
            const text = await file.text();
            const parsed = parseBankCsv(text);
            if (parsed.imported === 0) {
                setError("Aucune transaction reconnue. Vérifie que le fichier est bien un relevé CSV (avec une colonne date et une colonne montant).");
                setPreview(null);
                setRaw('');
                return;
            }
            setRaw(text);
            setFileName(file.name);
            setPreview(parsed);
        } catch {
            setError('Impossible de lire le fichier.');
        }
    };

    const reset = () => { setRaw(''); setFileName(''); setPreview(null); setError(null); };

    const confirm = () => {
        if (!raw) return;
        onImport(raw);
        reset();
    };

    return (
        <div className="bg-black/20 rounded-xl border border-white/5 p-4 space-y-3">
            <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span aria-hidden="true">📥</span> Importer un relevé bancaire (CSV)
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                    Exporte un CSV depuis ta banque et dépose-le ici. 100% local — rien ne quitte ton navigateur.
                    Toutes les banques sont supportées (virgule/point-virgule, dates FR ou ISO, débit/crédit).
                </p>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
                <span className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-ink-100 transition-colors focus-within:ring">
                    Choisir un fichier…
                </span>
                <span className="text-xs text-gray-500 truncate">{fileName || 'Aucun fichier sélectionné'}</span>
                <input
                    type="file"
                    accept=".csv,.txt,.tsv,text/csv"
                    className="sr-only"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
                    aria-label="Choisir un relevé CSV à importer"
                />
            </label>

            {error && (
                <div className="text-xs text-red-300 bg-red-900/20 border border-red-500/20 rounded-lg p-2">{error}</div>
            )}

            {preview && (
                <div className="space-y-2 animate-fade-in">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-tiny text-gray-400">
                        <span><span className="text-ink-200 font-bold">{preview.imported}</span> transaction(s) prêtes</span>
                        {preview.skipped > 0 && <span className="text-amber-300">{preview.skipped} ligne(s) ignorée(s)</span>}
                        <span>Séparateur : {DELIM_LABEL[preview.delimiter] ?? preview.delimiter}</span>
                        <span>Dates : {preview.dateOrder}</span>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-white/5">
                        <table className="w-full text-tiny">
                            <thead className="bg-black/30 text-gray-500">
                                <tr><th className="text-left p-2">Date</th><th className="text-left p-2">Description</th><th className="text-right p-2">Montant</th></tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {preview.transactions.slice(0, 3).map((t) => (
                                    <tr key={t.id}>
                                        <td className="p-2 font-mono text-gray-400">{t.date}</td>
                                        <td className="p-2 text-ink-200 truncate max-w-[160px]">{t.payee}</td>
                                        <td className={`p-2 text-right font-mono privacy-blur ${t.amount < 0 ? 'text-orange-300' : 'text-emerald-400'}`}>{cad(t.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={confirm}
                            className="px-3 py-2 bg-primary/90 hover:bg-primary text-white rounded-lg text-sm font-bold transition-colors focus-ring"
                        >
                            Importer {preview.imported} transaction(s)
                        </button>
                        <button type="button" onClick={reset} className="px-3 py-2 text-sm text-gray-400 hover:text-white focus-ring rounded-lg">
                            Annuler
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
