import React, { useState } from 'react';
import { Icon } from '../ui/Icon';
import { parseBankCsv, extractedTxnsToCsv, type ParsedBankCsv } from '../../services/import/parseBankCsv';
import { analyzeBankStatement } from '../../services/claude';
import { logError } from '../../services/errorLogger';
import { Card } from '../ui/Card';
import { PrivateAmount } from '../ui/PrivateAmount';

interface ImportBankStatementProps {
    /** Reçoit le texte brut (CSV) ; l'app le re-parse + fusionne + dédoublonne. */
    onImport: (rawText: string) => void;
    /** Clé Anthropic — requise UNIQUEMENT pour analyser un PDF/image (le CSV reste 100 % local). */
    apiKey?: string;
    /** Classe optionnelle pour le conteneur Card (ex. `h-full` en grille). */
    className?: string;
}

const cad = (v: number) => `${v.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

const DELIM_LABEL: Record<string, string> = { ',': 'virgule', ';': 'point-virgule', '\t': 'tabulation' };

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 Mo

/**
 * Import de relevé bancaire — deux sources, même pipeline :
 *  - CSV/TSV : parsé EN LOCAL (rien ne quitte le navigateur), toutes banques.
 *  - PDF/image : extrait par Claude Vision (analyzeBankStatement) puis converti en
 *    CSV canonique (extractedTxnsToCsv) → re-parsé par parseBankCsv comme un CSV.
 * Choix de fichier → aperçu (séparateur/colonnes + 3 premières lignes) → confirmation.
 * Le tri chronologique + la fusion/dédup se font en aval (analyzeBankStatement trie ;
 * parseBankCsv + l'app fusionnent et dédoublonnent).
 */
export const ImportBankStatement: React.FC<ImportBankStatementProps> = ({ onImport, apiKey, className = '' }) => {
    const [raw, setRaw] = useState('');
    const [fileName, setFileName] = useState('');
    const [preview, setPreview] = useState<ParsedBankCsv | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [analyzing, setAnalyzing] = useState(false);

    const handleFile = async (file: File) => {
        setError(null);
        const isCsvLike = /\.(csv|tsv|txt)$/i.test(file.name) || /csv|tsv|tab-separated|text\/plain/.test(file.type);
        setAnalyzing(true);
        try {
            let text: string;
            if (isCsvLike) {
                text = await file.text();
            } else {
                // PDF / image → extraction IA. Le relevé est envoyé à Claude (consenti
                // à l'import) car un PDF ne peut pas être parsé localement.
                if (!apiKey) {
                    setError("Clé Anthropic requise pour analyser un PDF/image. Ajoute-la dans Réglages, ou importe un CSV (100 % local).");
                    return;
                }
                if (file.size > MAX_PDF_BYTES) {
                    setError(`Fichier trop volumineux (${(file.size / 1048576).toFixed(1)} Mo). Maximum 10 Mo.`);
                    return;
                }
                const extracted = await analyzeBankStatement(file, apiKey);
                if (extracted.length === 0) {
                    setError("Aucune transaction reconnue dans ce document. Vérifie que c'est bien un relevé, ou exporte un CSV.");
                    return;
                }
                text = extractedTxnsToCsv(extracted);
            }

            const parsed = parseBankCsv(text);
            if (parsed.imported === 0) {
                setError("Aucune transaction reconnue. Vérifie que le fichier contient une colonne date et une colonne montant.");
                setPreview(null);
                setRaw('');
                return;
            }
            setRaw(text);
            setFileName(file.name);
            setPreview(parsed);
        } catch (e) {
            logError({ source: 'ai', message: 'Import relevé : lecture/extraction échouée', error: e });
            setError("Impossible de lire le fichier. (PDF/image : vérifie ta clé Anthropic et réessaie.)");
        } finally {
            setAnalyzing(false);
        }
    };

    const reset = () => { setRaw(''); setFileName(''); setPreview(null); setError(null); };

    const confirm = () => {
        if (!raw) return;
        onImport(raw);
        reset();
    };

    return (
        <Card icon={<Icon name="import" size={18} />} title="Importer un relevé bancaire (CSV ou PDF)" className={className}>
            <div className="space-y-3">
            <p className="text-meta text-ink-400">
                CSV exporté de ta banque (100 % local) — ou PDF/image de relevé, analysé par l'IA (Claude) puis classé.
            </p>

            <label className={`group flex flex-col items-center justify-center w-full h-36 rounded-card border-2 border-dashed transition-all duration-300 ${
                analyzing
                    ? 'border-warning-400/40 bg-warning-400/5 cursor-wait'
                    : 'border-white/15 bg-white/[0.02] cursor-pointer hover:border-primary/40 hover:bg-primary/5'
            }`}>
                <input
                    type="file"
                    accept=".csv,.txt,.tsv,text/csv,application/pdf,image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={analyzing}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
                    aria-label="Choisir un relevé (CSV, PDF ou image) à importer"
                />
                <span className="mb-2 transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-0.5" aria-hidden="true"><Icon name={analyzing ? 'clock' : 'import'} size={28} className="text-ink-300" /></span>
                <span className="text-meta font-medium text-ink-200">{analyzing ? 'Analyse du document en cours…' : (fileName || 'Cliquer ou glisser un fichier')}</span>
                <span className="text-tiny text-ink-500 mt-1">CSV · TSV · PDF · image</span>
            </label>

            {/* a11y (WCAG 4.1.3) : l'extraction IA est longue → annonce polie aux lecteurs d'écran. */}
            <div role="status" aria-live="polite" className="sr-only">
                {analyzing ? 'Analyse du document en cours, veuillez patienter.' : ''}
            </div>

            {error && (
                <div role="alert" className="text-meta text-danger-400 bg-danger-500/10 border border-danger-500/20 rounded-card p-2">{error}</div>
            )}

            {preview && (
                <div className="space-y-2 animate-fade-in">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-tiny text-ink-300">
                        <span><span className="text-ink-200 font-bold">{preview.imported}</span> transaction(s) prêtes</span>
                        {preview.skipped > 0 && <span className="text-amber-300">{preview.skipped} ligne(s) ignorée(s)</span>}
                        <span>Séparateur : {DELIM_LABEL[preview.delimiter] ?? preview.delimiter}</span>
                        <span>Dates : {preview.dateOrder}</span>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-white/5">
                        <table className="w-full text-tiny">
                            <thead className="bg-black/30 text-ink-500">
                                <tr><th className="text-left p-2">Date</th><th className="text-left p-2">Description</th><th className="text-right p-2">Montant</th></tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {preview.transactions.slice(0, 3).map((t) => (
                                    <tr key={t.id}>
                                        <td className="p-2 font-mono text-ink-300">{t.date}</td>
                                        <td className="p-2 text-ink-200 truncate max-w-[160px]">{t.payee}</td>
                                        <td className={`p-2 text-right font-mono ${t.amount < 0 ? 'text-orange-300' : 'text-success-400'}`}><PrivateAmount>{cad(t.amount)}</PrivateAmount></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={confirm}
                            className="px-3 py-2 bg-primary/90 hover:bg-primary text-dark rounded-lg text-body font-bold transition-colors focus-ring"
                        >
                            Importer {preview.imported} transaction(s)
                        </button>
                        <button type="button" onClick={reset} className="px-3 py-2 text-body text-ink-300 hover:text-white focus-ring rounded-lg">
                            Annuler
                        </button>
                    </div>
                </div>
            )}
            </div>
        </Card>
    );
};
