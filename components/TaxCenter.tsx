import React, { useState, useMemo, useRef } from 'react';
import { showToast } from './ui/Toast';
import { Card } from './ui/Card';
import { PageHeader } from './ui/PageHeader';
import { CoupleOptimizationCard } from './tax/CoupleOptimizationCard';
import { BudgetConfig, Asset } from '../types';
// Phase 4 A4: bascule sur services/claude.ts (Sonnet 4.6 + Vision)
import { analyzePayslip } from '../services/claude';
import { calculateFiscalReport, calculateGrossFromNet } from '../services/tax';
import { annualSalaryToMonthly } from '../utils/salary';

interface TaxCenterProps {
    config: BudgetConfig;
    setConfig?: (c: BudgetConfig) => void;
    assets?: Asset[];
    apiKey?: string;
}

const DRIVE_FOLDER_URL = "https://drive.google.com";

// Phase 4 A4: les modèles Gemini sont remplacés par Claude Sonnet 4.6
// (cf services/claude.ts analyzePayslip).

export const TaxCenter: React.FC<TaxCenterProps> = ({ config, setConfig, assets = [], apiKey }) => {



    const [rrspContribution, setRrspContribution] = useState(0);
    const [fhsaContribution, setFhsaContribution] = useState(0);
    const [alreadyPaidTax, setAlreadyPaidTax] = useState(0);

    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisStatus, setAnalysisStatus] = useState("");
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [scannedPay, setScannedPay] = useState<{ gross: number, net: number, tax: number, rrsp: number, freq: string } | null>(null);

    const applyToProfile = () => {
        if (!scannedPay || !setConfig) return;
        const newConfig = { ...config };
        newConfig.users[0] = {
            ...newConfig.users[0],
            // scannedPay.gross/net sont ANNUELS → on STOCKE en MENSUEL (convention canonique).
            // Avant : le brut annuel était stocké tel quel → moteur ré-annualisait → revenu ~12× trop haut.
            grossSalary: annualSalaryToMonthly(scannedPay.gross),
            netSalary: annualSalaryToMonthly(scannedPay.net),
        };
        setConfig(newConfig);
        showToast("Configuration mise à jour avec succès !", "success");
        setScannedPay(null);
    };

    // Phase 4 A4: analyse vision déportée dans services/claude.ts
    // Voir analyzePayslip(file, apiKey).

    const handleFileDrop = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        if (!apiKey) {
            showToast("Clé API Anthropic requise pour analyser les relevés.", "info");
            return;
        }

        const files: File[] = Array.from(e.target.files);
        setIsAnalyzing(true);
        setProgress({ current: 0, total: files.length });
        setAnalysisStatus(`Démarrage de l'analyse...`);

        let totalTaxPaidFound = 0;
        let totalRrspFound = 0;
        let finalScannedPay = null;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            // Audit F6 — borne la taille avant lecture/encodage base64 + envoi API Vision.
            if (file.size > 10 * 1024 * 1024) {
                showToast(`${file.name} ignoré : trop volumineux (max 10 Mo).`, 'info');
                setProgress({ current: i + 1, total: files.length });
                continue;
            }
            setAnalysisStatus(`Analyse de ${file.name} (${i + 1}/${files.length})...`);

            let res;
            try {
                res = await analyzePayslip(file, apiKey);
            } catch (err) {
                console.error(`[TaxCenter] analyzePayslip failed for ${file.name}:`, err);
                showToast(`Échec analyse ${file.name}. Format JPG/PNG requis.`, 'error');
                setProgress({ current: i + 1, total: files.length });
                continue;
            }

            let multiplier = 26;
            if (res.frequency === "Weekly") multiplier = 52;
            else if (res.frequency === "Semi-Monthly") multiplier = 24;
            else if (res.frequency === "Monthly") multiplier = 12;

            if (res.grossPeriod > 0) {
                const annualGross = res.grossPeriod * multiplier;
                const annualNet = res.netPeriod * multiplier;
                const annualTax = res.taxPeriod * multiplier;
                const annualRrsp = res.rrspPeriod * multiplier;

                finalScannedPay = {
                    gross: annualGross,
                    net: annualNet,
                    tax: annualTax,
                    rrsp: annualRrsp,
                    freq: res.frequency
                };

                totalTaxPaidFound += annualTax;
                totalRrspFound += annualRrsp;
            }

            setProgress({ current: i + 1, total: files.length });
            // Petite pause entre fichiers pour respecter rate-limit Anthropic
            await new Promise(r => setTimeout(r, 1000));
        }

        if (finalScannedPay) {
            setScannedPay(finalScannedPay);
            setAlreadyPaidTax(totalTaxPaidFound);
            setRrspContribution(totalRrspFound);
        }

        setAnalysisStatus(`Terminé ! Analyse complétée.`);
        setIsAnalyzing(false);
    };

    const investmentTaxData = useMemo(() => {
        const nonRegAssets = assets.filter(a => a.accountType === 'NON-ENREG' || a.accountType === 'CRYPTO');
        const nonRegValue = nonRegAssets.reduce((sum, a) => sum + (a.quantity * a.currentPrice * (a.currency === 'USD' ? 1.38 : 1)), 0);

        const estDividends = nonRegValue * 0.02;
        const estCapitalGains = nonRegValue * 0.07;
        const taxableInvestmentIncome = estDividends + (estCapitalGains * 0.5);

        return { totalNonReg: nonRegValue, taxableAddOn: taxableInvestmentIncome };
    }, [assets]);

    const [viewUser, setViewUser] = useState<string>('all');

    const taxData = useMemo(() => {
        const results = config.users.map((u, i) => {
            // Bug fix test-mode : u.grossSalary et u.netSalary sont MENSUELS
            // dans le store (convention Budget.tsx). Le moteur fiscal attend
            // le brut ANNUEL → × 12. Avant ce fix, TaxCenter affichait
            // grossIncome = 13 700$ comme "REVENU BRUT ANNUEL" pour un couple
            // dont le brut annuel réel est 164 400$ → impôt = 0$ (sous le PBMA).
            const monthlyGross = u.grossSalary || 0;
            const uGross = monthlyGross > 0
                ? monthlyGross * 12
                : calculateGrossFromNet((u.netSalary || 0) * 12);
            const splitRatio = 1 / config.users.length;
            const uTotalTaxable = uGross + (investmentTaxData.taxableAddOn * splitRatio);
            const res = calculateFiscalReport(uTotalTaxable, rrspContribution * splitRatio, fhsaContribution * splitRatio);
            const refundOrOwe = (alreadyPaidTax * splitRatio) > 0 ? ((alreadyPaidTax * splitRatio) - res.totalTax) : 0;
            return {
                id: i,
                name: u.name,
                gross: uGross,
                report: { ...res, refundOrOwe },
                fedBreakdown: res.fedBreakdown,
                qcBreakdown: res.qcBreakdown
            };
        });

        if (viewUser === 'all') {
            const totalGross = results.reduce((sum, r) => sum + r.gross, 0);
            const totalTax = results.reduce((sum, r) => sum + r.report.totalTax, 0);
            const totalNetIncome = results.reduce((sum, r) => sum + r.report.netIncome, 0);
            const totalRefundOrOwe = results.reduce((sum, r) => sum + r.report.refundOrOwe, 0);
            const maxMarginal = Math.max(...results.map(r => r.report.marginalRate));

            return {
                isGlobal: true,
                grossIncome: totalGross,
                report: {
                    totalTax,
                    netIncome: totalNetIncome,
                    marginalRate: maxMarginal,
                    refundOrOwe: totalRefundOrOwe,
                    averageRate: totalGross > 0 ? (totalTax / totalGross * 100) : 0
                },
                fedBreakdown: results[0].fedBreakdown,
                qcBreakdown: results[0].qcBreakdown
            };
        } else {
            const userRes = results.find(r => r.name === viewUser) || results[0];
            return {
                isGlobal: false,
                grossIncome: userRes.gross,
                report: userRes.report,
                fedBreakdown: userRes.fedBreakdown,
                qcBreakdown: userRes.qcBreakdown
            };
        }
    }, [config.users, viewUser, rrspContribution, fhsaContribution, investmentTaxData, alreadyPaidTax]);

    const { grossIncome, report, fedBreakdown, qcBreakdown, isGlobal } = taxData;

    const openDrive = () => window.open(DRIVE_FOLDER_URL, '_blank');

    return (
        <div className="space-y-6 animate-fade-in pb-20">

            <PageHeader
                icon="🏛️"
                title="Simulateur d'Impôts (Québec)"
                subtitle="Pré-rempli et verrouillé avec votre profil global"
            />

            <div className="flex justify-end gap-2 w-full md:w-auto md:ml-auto -mt-2">
                    {/* Phase G.2 — upload migré vers l'onglet Documents global (doc directives §9).
                        On garde l'extraction IA ici pour les utilisateurs qui veulent un calcul
                        direct, mais on annonce clairement la nouvelle destination. */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isAnalyzing}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-secondary to-purple-600 hover:brightness-110 border border-white/10 px-4 py-2 rounded-lg transition-all shadow-lg active:scale-95 group disabled:opacity-50"
                        title="Pour archiver vos documents, utilisez plutôt l'onglet Documents"
                    >
                        <span className="text-lg">{isAnalyzing ? '⏳' : '🤖'}</span>
                        <div className="text-left leading-tight">
                            <div className="font-bold text-white text-meta">Calcul rapide</div>
                            <div className="text-tiny text-white/70">Pour archiver → onglet Documents</div>
                        </div>
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*,application/pdf" onChange={handleFileDrop} />

                    <button onClick={openDrive} className="flex items-center justify-center gap-2 bg-[#1f2937] hover:bg-[#374151] border border-white/10 px-4 py-2 rounded-lg transition-all shadow-lg active:scale-95 group">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" alt="Drive" className="w-6 h-6 group-hover:scale-110 transition-transform" />
                    </button>
            </div>

            {isAnalyzing && (
                <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-info-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                    <div className="text-center text-tiny text-ink-300 mt-1">Traitement {progress.current} / {progress.total} fichiers</div>
                </div>
            )}

            {scannedPay && (
                <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border border-info-500/30 p-4 rounded-xl shadow-lg mt-4 animate-fade-in">
                    <h3 className="text-body font-bold text-white mb-3 flex items-center gap-2">📄 Fiche de Paie Détectée ({scannedPay.freq})</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="bg-black/30 p-3 rounded border border-white/5">
                            <div className="text-tiny text-ink-300">Brut Annuel Est.</div>
                            <div className="text-lg font-bold text-white">{scannedPay.gross.toLocaleString()}$</div>
                        </div>
                        <div className="bg-black/30 p-3 rounded border border-white/5">
                            <div className="text-tiny text-ink-300">Net Annuel Est.</div>
                            <div className="text-lg font-bold text-green-400">{scannedPay.net.toLocaleString()}$</div>
                        </div>
                        <div className="bg-black/30 p-3 rounded border border-white/5">
                            <div className="text-tiny text-ink-300">Impôts Retenus Est.</div>
                            <div className="text-lg font-bold text-danger-400">-{scannedPay.tax.toLocaleString()}$</div>
                        </div>
                        <div className="bg-black/30 p-3 rounded border border-white/5">
                            <div className="text-tiny text-ink-300">REER/RPP Retenus</div>
                            <div className="text-lg font-bold text-info-400">{scannedPay.rrsp.toLocaleString()}$</div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setScannedPay(null)} className="text-meta text-ink-300 px-3 py-1.5 hover:text-white transition">Ignorer</button>
                        <button onClick={applyToProfile} className="bg-info-600 hover:bg-info-500 text-white text-meta font-bold px-4 py-1.5 rounded transition shadow-lg">
                            💾 Appliquer au Profil Principal
                        </button>
                    </div>
                </div>
            )}

            {analysisStatus && !scannedPay && (
                <div className="bg-info-500/10 border border-info-500/30 text-blue-300 px-4 py-2 rounded-lg text-body flex items-center gap-2 animate-fade-in">
                    <span>ℹ️</span> {analysisStatus}
                </div>
            )}

            {/* Phase G.4 — Optimisation fiscale couple IA (rendu uniquement si couple) */}
            <CoupleOptimizationCard />

            {/* TABS FOR PROFILE */}
            {config.users.length > 1 && (
                <div className="flex bg-black/40 p-1 rounded-lg w-fit mx-auto border border-white/5">
                    <button
                        onClick={() => setViewUser('all')}
                        className={`px-4 py-2 text-body font-bold rounded-md transition-all ${viewUser === 'all' ? 'bg-white text-black shadow' : 'text-ink-300 hover:text-white'}`}
                    >
                        Global (Couple)
                    </button>
                    {config.users.map((u) => (
                        <button
                            key={u.name}
                            onClick={() => setViewUser(u.name)}
                            className={`px-4 py-2 text-body font-bold rounded-md transition-all ${viewUser === u.name ? 'bg-white text-black shadow' : 'text-ink-300 hover:text-white'}`}
                        >
                            {u.name}
                        </button>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                <div className="lg:col-span-4 space-y-6 order-2 lg:order-1">
                    <Card title="💼 Revenus & Déductions">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-meta text-ink-300 mb-1 font-bold uppercase">
                                    {isGlobal ? "Revenu Brut Annuel du Couple" : `Revenu Brut (${viewUser})`}
                                </label>
                                <div className="p-3 bg-white/5 border border-white/10 rounded-lg flex items-center justify-between">
                                    <span className="text-ink-300">Total Synchronisé</span>
                                    <span className="text-xl font-bold text-white font-mono">{grossIncome.toLocaleString()}$</span>
                                </div>
                                <p className="text-tiny text-ink-500 mt-2 flex items-center gap-1">
                                    <span>🔒</span> Verrouillé (* 12 mois) lié à la Configuration.
                                </p>
                            </div>

                            {alreadyPaidTax > 0 && (
                                <div className="p-3 bg-green-900/10 border border-green-500/30 rounded">
                                    <div className="flex justify-between items-center">
                                        <span className="text-meta text-green-400 font-bold">Impôt déjà prélevé (Source)</span>
                                        <span className="text-body font-mono text-white">{alreadyPaidTax.toLocaleString()}$</span>
                                    </div>
                                    <div className="text-tiny text-ink-500 mt-1">Détecté automatiquement via vos documents</div>
                                </div>
                            )}

                            {investmentTaxData.totalNonReg > 0 && (
                                <div className="p-3 bg-white/5 rounded border border-white/10">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-meta text-yellow-400 font-bold">Invest. Non-Enregistrés</span>
                                        <span className="text-meta text-white">{investmentTaxData.totalNonReg.toLocaleString()}$</span>
                                    </div>
                                    <div className="text-tiny text-ink-500">
                                        Impact estimé sur revenu imposable: <span className="text-red-300">+{investmentTaxData.taxableAddOn.toFixed(0)}$</span>
                                    </div>
                                </div>
                            )}

                            <div className="p-4 bg-blue-900/10 border border-info-500/20 rounded-xl space-y-3">
                                <h4 className="text-meta font-bold text-blue-300 uppercase flex items-center gap-2">
                                    📉 Réducteurs d'Impôt
                                </h4>
                                <div>
                                    <label className="flex justify-between text-meta text-ink-200 mb-1">
                                        <span>Cotisation REER</span>
                                        <span>{rrspContribution.toLocaleString()}$</span>
                                    </label>
                                    <input type="range" min="0" max="30000" step="100" value={rrspContribution} onChange={e => setRrspContribution(parseFloat(e.target.value))} className="w-full h-2 bg-dark rounded-lg appearance-none cursor-pointer accent-info-500" />
                                </div>
                                <div>
                                    <label className="flex justify-between text-meta text-ink-200 mb-1">
                                        <span>CELIAPP</span>
                                        <span>{fhsaContribution.toLocaleString()}$</span>
                                    </label>
                                    <input type="range" min="0" max="8000" step="100" value={fhsaContribution} onChange={e => setFhsaContribution(parseFloat(e.target.value))} className="w-full h-2 bg-dark rounded-lg appearance-none cursor-pointer accent-green-500" />
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>

                <div className="lg:col-span-8 space-y-6 order-1 lg:order-2">

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card className="!p-4 border-l-4 border-l-red-500 bg-surface/50">
                            <div className="text-tiny text-ink-400 uppercase font-bold">Impôt Total</div>
                            <div className="text-2xl font-black text-white">{report.totalTax.toLocaleString('fr-CA', { maximumFractionDigits: 0 })} $</div>
                            <div className="text-tiny text-ink-400">Fed + Qc</div>
                        </Card>
                        <Card className="!p-4 border-l-4 border-l-green-500 bg-surface/50">
                            <div className="text-tiny text-ink-400 uppercase font-bold">Revenu Net</div>
                            <div className="text-2xl font-black text-green-400">{report.netIncome.toLocaleString('fr-CA', { maximumFractionDigits: 0 })} $</div>
                            <div className="text-tiny text-ink-400">Dans vos poches</div>
                        </Card>
                        <Card className="!p-4 border-l-4 border-l-yellow-500 bg-surface/50">
                            <div className="text-tiny text-ink-400 uppercase font-bold">Taux Marginal</div>
                            {/* Bug fix : utils/tax.ts:getMarginalRate retourne un DÉCIMAL
                                (ex: 0.4 pour 40%), pas un pourcentage. Multiplier par 100. */}
                            <div className="text-2xl font-black text-yellow-400">{(report.marginalRate * 100).toFixed(1)}%</div>
                            <div className="text-tiny text-ink-400">Sur le prochain $</div>
                        </Card>
                        <Card className="!p-4 border-l-4 border-l-blue-500 bg-surface/50">
                            <div className="text-tiny text-ink-400 uppercase font-bold">Remboursement Est.</div>
                            <div className={`text-2xl font-black ${report.refundOrOwe > 0 ? 'text-green-400' : 'text-danger-400'}`}>
                                {report.refundOrOwe > 0 ? '+' : ''}{report.refundOrOwe.toLocaleString('fr-CA', { maximumFractionDigits: 0 })} $
                            </div>
                            <div className="text-tiny text-ink-400">Basé sur docs reçus</div>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {isGlobal ? (
                            <div className="md:col-span-2 text-center py-6 text-ink-500 bg-white/5 rounded-xl">
                                ℹ️ Les paliers d'imposition sont individuels. Veuillez sélectionner un profil pour voir les paliers détaillés.
                            </div>
                        ) : (
                            <>
                                <Card title="Paliers Fédéraux (Canada)">
                                    <div className="space-y-4 mt-2">
                                        {(fedBreakdown ?? []).map((b, i) => (
                                            <div key={i} className="relative">
                                                <div className="flex justify-between text-tiny mb-1">
                                                    <span className="text-ink-200 font-bold">{b.rate}</span>
                                                    <span className="text-ink-400">{b.amount > 0 ? `${b.amount.toFixed(0)}$ taxés` : '0$'}</span>
                                                </div>
                                                <div className="h-4 w-full bg-gray-800 rounded overflow-hidden relative border border-white/5">
                                                    <div className="h-full bg-danger-600/80 transition-all duration-500" style={{ width: `${b.percentFull}%` }}></div>
                                                    <div className="absolute inset-0 flex items-center justify-center text-tiny font-mono text-white/80 shadow-black drop-shadow-md">
                                                        {b.filled.toLocaleString()} $ / {typeof b.max === 'number' ? b.max.toLocaleString() : b.max} $
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                                <Card title="Paliers Provinciaux (Québec)">
                                    <div className="space-y-4 mt-2">
                                        {(qcBreakdown ?? []).map((b, i) => (
                                            <div key={i} className="relative">
                                                <div className="flex justify-between text-tiny mb-1">
                                                    <span className="text-ink-200 font-bold">{b.rate}</span>
                                                    <span className="text-ink-400">{b.amount > 0 ? `${b.amount.toFixed(0)}$ taxés` : '0$'}</span>
                                                </div>
                                                <div className="h-4 w-full bg-gray-800 rounded overflow-hidden relative border border-white/5">
                                                    <div className="h-full bg-info-600/80 transition-all duration-500" style={{ width: `${b.percentFull}%` }}></div>
                                                    <div className="absolute inset-0 flex items-center justify-center text-tiny font-mono text-white/80 shadow-black drop-shadow-md">
                                                        {b.filled.toLocaleString()} $ / {typeof b.max === 'number' ? b.max.toLocaleString() : b.max} $
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            </>
                        )}
                    </div>

                </div>
            </div>

        </div>
    );
};
