import React, { useState, useMemo, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { showToast } from './ui/Toast';
import { Card } from './ui/Card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Cell, PieChart, Pie } from 'recharts';
import { BudgetConfig, Asset } from '../types';
import { GoogleGenAI } from "@google/genai";
import { calculateFiscalReport, calculateGrossFromNet } from '../services/tax';

interface TaxCenterProps {
    config: BudgetConfig;
    setConfig?: (c: BudgetConfig) => void;
    assets?: Asset[];
    apiKey?: string;
}

const DRIVE_FOLDER_URL = "https://drive.google.com/drive/u/0/folders/1mBg4NFJFbT5FpfxUEZkX-9fx8WgVnMH7";

const MODELS = [
    "gemini-3-flash-preview",
    "gemini-2.0-flash",
    "gemini-1.5-flash"
];

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
            grossSalary: Math.round(scannedPay.gross), // always stored as annual
            netSalary: Math.round(scannedPay.net / 12) // always stored as monthly
        };
        setConfig(newConfig);
        showToast("Configuration mise à jour avec succès !", "success");
        setScannedPay(null);
    };

    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const analyzeSingleFile = async (ai: GoogleGenAI, file: File): Promise<any> => {
        const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = error => {
                console.error("File reading error:", error);
                showToast("Erreur lors de la lecture du fichier.", "error");
                reject(error);
            };
        });

        const prompt = `
            Analyse cette FICHE DE PAIE ou document financier.
            Extrait UNIQUEMENT les montants pour la PÉRIODE COURANTE (pas les cumuls annuels YTD) et retourne un JSON pur :
            {
                "grossPeriod": number,
                "netPeriod": number,
                "taxPeriod": number,
                "rrspPeriod": number,
                "frequency": string ("Weekly" | "Bi-Weekly" | "Semi-Monthly" | "Monthly")
            }
        `;

        for (const model of MODELS) {
            try {
                const response = await ai.models.generateContent({
                    model: model,
                    contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: file.type, data: base64Data } }] }],
                    config: { responseMimeType: "application/json" }
                });

                const data = JSON.parse(response.text || "{}");
                return {
                    grossPeriod: data.grossPeriod || 0,
                    netPeriod: data.netPeriod || 0,
                    taxPeriod: data.taxPeriod || 0,
                    rrspPeriod: data.rrspPeriod || 0,
                    frequency: data.frequency || "Bi-Weekly"
                };
            } catch (err: any) {
                console.warn(`Model ${model} failed, trying next...`, err);
                await wait(2000);
            }
        }
        throw new Error("All models failed");
    };

    const handleFileDrop = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        if (!apiKey) {
            showToast("Clé API Gemini requise pour analyser les relevés.", "info");
            return;
        }

        const files: File[] = Array.from(e.target.files);
        setIsAnalyzing(true);
        setProgress({ current: 0, total: files.length });
        setAnalysisStatus(`Démarrage de l'analyse...`);

        let totalTaxPaidFound = 0;
        let totalRrspFound = 0;
        let finalScannedPay = null;

        const ai = new GoogleGenAI({ apiKey });

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setAnalysisStatus(`Analyse de ${file.name} (${i + 1}/${files.length})...`);

            const res = await analyzeSingleFile(ai, file);

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
            await wait(3000);
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
            const uGross = u.grossSalary || calculateGrossFromNet((u.netSalary || 0) * 12);
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

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface p-4 rounded-2xl border border-white/5 shadow-lg">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                        🏛️ Simulateur d'Impôts (Québec)
                    </h2>
                    <p className="text-gray-400 text-xs">Pré-rempli et verrouillé avec votre profil global.</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isAnalyzing}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-secondary to-purple-600 hover:brightness-110 border border-white/10 px-4 py-2 rounded-lg transition-all shadow-lg active:scale-95 group disabled:opacity-50"
                    >
                        <span className="text-lg">{isAnalyzing ? '⏳' : '🤖'}</span>
                        <div className="text-left leading-tight">
                            <div className="font-bold text-white text-xs">Analyser Documents</div>
                            <div className="text-[9px] text-white/70">Supporte fichiers illimités</div>
                        </div>
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*,application/pdf" onChange={handleFileDrop} />

                    <button onClick={openDrive} className="flex items-center justify-center gap-2 bg-[#1f2937] hover:bg-[#374151] border border-white/10 px-4 py-2 rounded-lg transition-all shadow-lg active:scale-95 group">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" alt="Drive" className="w-6 h-6 group-hover:scale-110 transition-transform" />
                    </button>
                </div>
            </div>

            {isAnalyzing && (
                <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-blue-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                    <div className="text-center text-[10px] text-gray-400 mt-1">Traitement {progress.current} / {progress.total} fichiers</div>
                </div>
            )}

            {scannedPay && (
                <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border border-blue-500/30 p-4 rounded-xl shadow-lg mt-4 animate-fade-in">
                    <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">📄 Fiche de Paie Détectée ({scannedPay.freq})</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="bg-black/30 p-3 rounded border border-white/5">
                            <div className="text-[10px] text-gray-400">Brut Annuel Est.</div>
                            <div className="text-lg font-bold text-white">{scannedPay.gross.toLocaleString()}$</div>
                        </div>
                        <div className="bg-black/30 p-3 rounded border border-white/5">
                            <div className="text-[10px] text-gray-400">Net Annuel Est.</div>
                            <div className="text-lg font-bold text-green-400">{scannedPay.net.toLocaleString()}$</div>
                        </div>
                        <div className="bg-black/30 p-3 rounded border border-white/5">
                            <div className="text-[10px] text-gray-400">Impôts Retenus Est.</div>
                            <div className="text-lg font-bold text-red-400">-{scannedPay.tax.toLocaleString()}$</div>
                        </div>
                        <div className="bg-black/30 p-3 rounded border border-white/5">
                            <div className="text-[10px] text-gray-400">REER/RPP Retenus</div>
                            <div className="text-lg font-bold text-blue-400">{scannedPay.rrsp.toLocaleString()}$</div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setScannedPay(null)} className="text-xs text-gray-400 px-3 py-1.5 hover:text-white transition">Ignorer</button>
                        <button onClick={applyToProfile} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-1.5 rounded transition shadow-lg">
                            💾 Appliquer au Profil Principal
                        </button>
                    </div>
                </div>
            )}

            {analysisStatus && !scannedPay && (
                <div className="bg-blue-500/10 border border-blue-500/30 text-blue-300 px-4 py-2 rounded-lg text-sm flex items-center gap-2 animate-fade-in">
                    <span>ℹ️</span> {analysisStatus}
                </div>
            )}

            {/* TABS FOR PROFILE */}
            {config.users.length > 1 && (
                <div className="flex bg-black/40 p-1 rounded-lg w-fit mx-auto border border-white/5">
                    <button
                        onClick={() => setViewUser('all')}
                        className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${viewUser === 'all' ? 'bg-white text-black shadow' : 'text-gray-400 hover:text-white'}`}
                    >
                        Global (Couple)
                    </button>
                    {config.users.map((u) => (
                        <button
                            key={u.name}
                            onClick={() => setViewUser(u.name)}
                            className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${viewUser === u.name ? 'bg-white text-black shadow' : 'text-gray-400 hover:text-white'}`}
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
                                <label className="block text-xs text-gray-400 mb-1 font-bold uppercase">
                                    {isGlobal ? "Revenu Brut Annuel du Couple" : `Revenu Brut (${viewUser})`}
                                </label>
                                <div className="p-3 bg-white/5 border border-white/10 rounded-lg flex items-center justify-between">
                                    <span className="text-gray-400">Total Synchronisé</span>
                                    <span className="text-xl font-bold text-white font-mono">{grossIncome.toLocaleString()}$</span>
                                </div>
                                <p className="text-[10px] text-gray-500 mt-2 flex items-center gap-1">
                                    <span>🔒</span> Verrouillé (* 12 mois) lié à la Configuration.
                                </p>
                            </div>

                            {alreadyPaidTax > 0 && (
                                <div className="p-3 bg-green-900/10 border border-green-500/30 rounded">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-green-400 font-bold">Impôt déjà prélevé (Source)</span>
                                        <span className="text-sm font-mono text-white">{alreadyPaidTax.toLocaleString()}$</span>
                                    </div>
                                    <div className="text-[10px] text-gray-500 mt-1">Détecté automatiquement via vos documents</div>
                                </div>
                            )}

                            {investmentTaxData.totalNonReg > 0 && (
                                <div className="p-3 bg-white/5 rounded border border-white/10">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs text-yellow-400 font-bold">Invest. Non-Enregistrés</span>
                                        <span className="text-xs text-white">{investmentTaxData.totalNonReg.toLocaleString()}$</span>
                                    </div>
                                    <div className="text-[10px] text-gray-500">
                                        Impact estimé sur revenu imposable: <span className="text-red-300">+{investmentTaxData.taxableAddOn.toFixed(0)}$</span>
                                    </div>
                                </div>
                            )}

                            <div className="p-4 bg-blue-900/10 border border-blue-500/20 rounded-xl space-y-3">
                                <h4 className="text-xs font-bold text-blue-300 uppercase flex items-center gap-2">
                                    📉 Réducteurs d'Impôt
                                </h4>
                                <div>
                                    <label className="flex justify-between text-xs text-gray-300 mb-1">
                                        <span>Cotisation REER</span>
                                        <span>{rrspContribution.toLocaleString()}$</span>
                                    </label>
                                    <input type="range" min="0" max="30000" step="100" value={rrspContribution} onChange={e => setRrspContribution(parseFloat(e.target.value))} className="w-full h-2 bg-dark rounded-lg appearance-none cursor-pointer accent-blue-500" />
                                </div>
                                <div>
                                    <label className="flex justify-between text-xs text-gray-300 mb-1">
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
                            <div className="text-[10px] text-gray-500 uppercase font-bold">Impôt Total</div>
                            <div className="text-2xl font-black text-white">{report.totalTax.toLocaleString('fr-CA', { maximumFractionDigits: 0 })} $</div>
                            <div className="text-[10px] text-gray-500">Fed + Qc</div>
                        </Card>
                        <Card className="!p-4 border-l-4 border-l-green-500 bg-surface/50">
                            <div className="text-[10px] text-gray-500 uppercase font-bold">Revenu Net</div>
                            <div className="text-2xl font-black text-green-400">{report.netIncome.toLocaleString('fr-CA', { maximumFractionDigits: 0 })} $</div>
                            <div className="text-[10px] text-gray-500">Dans vos poches</div>
                        </Card>
                        <Card className="!p-4 border-l-4 border-l-yellow-500 bg-surface/50">
                            <div className="text-[10px] text-gray-500 uppercase font-bold">Taux Marginal</div>
                            <div className="text-2xl font-black text-yellow-400">{report.marginalRate.toFixed(1)}%</div>
                            <div className="text-[10px] text-gray-500">Sur le prochain $</div>
                        </Card>
                        <Card className="!p-4 border-l-4 border-l-blue-500 bg-surface/50">
                            <div className="text-[10px] text-gray-500 uppercase font-bold">Remboursement Est.</div>
                            <div className={`text-2xl font-black ${report.refundOrOwe > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {report.refundOrOwe > 0 ? '+' : ''}{report.refundOrOwe.toLocaleString('fr-CA', { maximumFractionDigits: 0 })} $
                            </div>
                            <div className="text-[10px] text-gray-500">Basé sur docs reçus</div>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {isGlobal ? (
                            <div className="md:col-span-2 text-center py-6 text-gray-500 bg-white/5 rounded-xl">
                                ℹ️ Les paliers d'imposition sont individuels. Veuillez sélectionner un profil pour voir les paliers détaillés.
                            </div>
                        ) : (
                            <>
                                <Card title="Paliers Fédéraux (Canada)">
                                    <div className="space-y-4 mt-2">
                                        {fedBreakdown.map((b, i) => (
                                            <div key={i} className="relative">
                                                <div className="flex justify-between text-[10px] mb-1">
                                                    <span className="text-gray-300 font-bold">{b.rate}</span>
                                                    <span className="text-gray-500">{b.amount > 0 ? `${b.amount.toFixed(0)}$ taxés` : '0$'}</span>
                                                </div>
                                                <div className="h-4 w-full bg-gray-800 rounded overflow-hidden relative border border-white/5">
                                                    <div className="h-full bg-red-600/80 transition-all duration-500" style={{ width: `${b.percentFull}%` }}></div>
                                                    <div className="absolute inset-0 flex items-center justify-center text-[9px] font-mono text-white/80 shadow-black drop-shadow-md">
                                                        {b.filled.toLocaleString()} $ / {typeof b.max === 'number' ? b.max.toLocaleString() : b.max} $
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                                <Card title="Paliers Provinciaux (Québec)">
                                    <div className="space-y-4 mt-2">
                                        {qcBreakdown.map((b, i) => (
                                            <div key={i} className="relative">
                                                <div className="flex justify-between text-[10px] mb-1">
                                                    <span className="text-gray-300 font-bold">{b.rate}</span>
                                                    <span className="text-gray-500">{b.amount > 0 ? `${b.amount.toFixed(0)}$ taxés` : '0$'}</span>
                                                </div>
                                                <div className="h-4 w-full bg-gray-800 rounded overflow-hidden relative border border-white/5">
                                                    <div className="h-full bg-blue-600/80 transition-all duration-500" style={{ width: `${b.percentFull}%` }}></div>
                                                    <div className="absolute inset-0 flex items-center justify-center text-[9px] font-mono text-white/80 shadow-black drop-shadow-md">
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
