import React, { useState } from 'react';
import { analyzePayslip } from '../../services/claude';
import { showToast } from '../ui/Toast';
import { Card } from '../ui/Card';
import { useFinanceStore } from '../../store/useFinanceStore';
import { formatCAD } from '../../utils/format';

/**
 * Phase C.2 — upload IA de relevé de salaire dans le Hub Configuration.
 *
 * Réutilise `analyzePayslip` (Claude Sonnet Vision) déjà utilisé dans TaxCenter.
 * Différence ici : auto-fill direct dans `config.users[N]` (grossSalary,
 * netSalary, taxDeduction) au lieu d'alimenter le calculateur fiscal.
 *
 * Le composant choisit l'utilisateur cible via un radio (user1 / user2 si couple).
 */

interface PayslipUploadCardProps {
    targetUserIndex?: 0 | 1; // 0 par défaut ; couple-aware via radio interne
}

export const PayslipUploadCard: React.FC<PayslipUploadCardProps> = ({ targetUserIndex: initialTarget = 0 }) => {
    const apiKey = useFinanceStore(s => s.apiKeys.anthropic);
    const config = useFinanceStore(s => s.config);
    const setAppState = useFinanceStore(s => s.setAppState);

    const [target, setTarget] = useState<0 | 1>(initialTarget);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [status, setStatus] = useState<string>('');
    const [result, setResult] = useState<{ gross: number; net: number; tax: number; freq: string } | null>(null);

    const isCouple = Boolean(config?.users?.[1]?.name?.trim());

    const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        if (!apiKey) {
            showToast('Clé API Anthropic requise pour analyser les relevés.', 'info');
            return;
        }

        const file = e.target.files[0];
        // Audit F6 — borne la taille avant lecture/encodage base64 + envoi API Vision
        // (évite la saturation mémoire navigateur sur un fichier énorme).
        const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 Mo
        if (file.size > MAX_UPLOAD_BYTES) {
            showToast(`Fichier trop volumineux (${(file.size / 1048576).toFixed(1)} Mo). Maximum 10 Mo.`, 'info');
            return;
        }
        setIsAnalyzing(true);
        setStatus(`Analyse en cours… (${file.name})`);
        setResult(null);

        try {
            const res = await analyzePayslip(file, apiKey);
            let multiplier = 26;
            if (res.frequency === 'Weekly') multiplier = 52;
            else if (res.frequency === 'Semi-Monthly') multiplier = 24;
            else if (res.frequency === 'Monthly') multiplier = 12;

            const annualGross = res.grossPeriod * multiplier;
            const annualNet = res.netPeriod * multiplier;
            const annualTax = res.taxPeriod * multiplier;

            // Auto-fill le profil de l'utilisateur ciblé (taxDeduction est dérivé
            // de grossSalary - netSalary partout dans l'app, pas besoin de le stocker).
            const newUsers = [...config.users] as [typeof config.users[0], typeof config.users[1]];
            const targetUser = newUsers[target];
            newUsers[target] = {
                ...targetUser,
                grossSalary: Math.round(annualGross),
                netSalary: Math.round(annualNet),
            };
            setAppState({ config: { ...config, users: newUsers } });

            setResult({ gross: annualGross, net: annualNet, tax: annualTax, freq: res.frequency });
            setStatus('');
            showToast(`Profil ${target === 0 ? 'principal' : 'conjoint'} mis à jour.`, 'success');
        } catch (err) {
            console.error('[PayslipUpload] analyzePayslip failed:', err);
            setStatus('');
            showToast('Analyse échouée. Vérifie le fichier (JPG/PNG/PDF) et ta clé Anthropic.', 'error');
        } finally {
            setIsAnalyzing(false);
            // Reset l'input pour permettre re-upload du même fichier
            e.target.value = '';
        }
    };

    return (
        <Card title="📄 Upload relevé de salaire (IA Vision)">
            <div className="space-y-4">
                <p className="text-tiny text-gray-400 leading-snug">
                    Téléverse un relevé de salaire (image ou PDF). L'IA Vision (Claude Sonnet)
                    extrait automatiquement le brut, le net, l'impôt retenu et la fréquence de paie,
                    puis remplit le profil sélectionné.
                </p>

                {isCouple && (
                    <div className="flex gap-2">
                        {[0, 1].map(idx => (
                            <label
                                key={idx}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-card border cursor-pointer transition-colors ${
                                    target === idx ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-white/5 border-white/10 text-ink-300 hover:bg-white/10'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="payslip-target"
                                    checked={target === idx}
                                    onChange={() => setTarget(idx as 0 | 1)}
                                    className="sr-only"
                                />
                                <span className="text-meta font-medium">
                                    {config.users[idx]?.name || (idx === 0 ? 'Utilisateur 1' : 'Conjoint')}
                                </span>
                            </label>
                        ))}
                    </div>
                )}

                <label className={`flex flex-col items-center justify-center w-full h-32 rounded-card border-2 border-dashed cursor-pointer transition-colors ${
                    isAnalyzing
                        ? 'border-amber-400/40 bg-amber-400/5'
                        : 'border-white/15 bg-white/[0.02] hover:border-primary/40 hover:bg-primary/5'
                }`}>
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={handleFiles}
                        disabled={isAnalyzing || !apiKey}
                        className="sr-only"
                    />
                    <span className="text-2xl mb-2" aria-hidden="true">{isAnalyzing ? '⏳' : '📥'}</span>
                    <span className="text-meta font-medium text-ink-200">
                        {isAnalyzing ? status : (apiKey ? 'Cliquer ou glisser un fichier ici' : 'Configure la clé Anthropic ci-dessous')}
                    </span>
                    {!isAnalyzing && (
                        <span className="text-tiny text-ink-500 mt-1">JPG, PNG, WebP, PDF</span>
                    )}
                </label>

                {result && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-card bg-emerald-500/10 border border-emerald-500/30">
                        <div>
                            <div className="text-tiny text-ink-400 uppercase tracking-wider">Brut/an</div>
                            <div className="text-meta font-bold text-emerald-300 font-mono">{formatCAD(result.gross)}</div>
                        </div>
                        <div>
                            <div className="text-tiny text-ink-400 uppercase tracking-wider">Net/an</div>
                            <div className="text-meta font-bold text-info-300 font-mono">{formatCAD(result.net)}</div>
                        </div>
                        <div>
                            <div className="text-tiny text-ink-400 uppercase tracking-wider">Impôt/an</div>
                            <div className="text-meta font-bold text-amber-300 font-mono">{formatCAD(result.tax)}</div>
                        </div>
                        <div>
                            <div className="text-tiny text-ink-400 uppercase tracking-wider">Fréquence</div>
                            <div className="text-meta font-bold text-ink-200">{result.freq}</div>
                        </div>
                    </div>
                )}

                {!apiKey && (
                    <p className="text-tiny text-amber-400 italic">
                        💡 Configure ta clé Anthropic dans la carte "Clés API & Services" pour activer l'upload IA.
                    </p>
                )}
            </div>
        </Card>
    );
};
