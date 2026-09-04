import React, { useState, useMemo, useRef } from 'react';
import { showToast } from './ui/Toast';
import { importWithRetry } from '../utils/lazyWithRetry';
import { useWriteConfirmation } from '../hooks/useWriteConfirmation';
import { AiChatConfirmModal } from './aiChat/AiChatConfirmModal';
import { Card } from './ui/Card';
import { PrivateSliderValue } from './ui/PrivateSliderValue';
import { maskedSliderAria } from '../utils/privacyAria';
import { PageHeader } from './ui/PageHeader';
import { ProfileFieldsMoved } from './settings/ProfileFieldsMoved';
import { Icon } from './ui/Icon';
import { CoupleOptimizationCard } from './tax/CoupleOptimizationCard';
import { BudgetConfig, Asset } from '../types';
// Phase 4 A4: bascule sur services/claude.ts (Sonnet 4.6 + Vision)
import { analyzePayslip } from '../services/claude';
import { logError } from '../services/errorLogger';
import { causeErreurIa, messageErreurIa } from '../services/messageErreurIa';
import { assetValueCad } from '../services/portfolio';
import { ageOptsForSalaryInversion, calculateFiscalReport, calculateGrossFromNet } from '../services/tax';
import { netModelResidual } from '../services/taxResidual';
import { estimateTaxableInvestmentIncome } from '../services/taxEstimate';
import { FHSA_ANNUAL_LIMIT_PER_USER, RRSP_ANNUAL_LIMITS, RRSP_ANNUAL_LIMIT_FALLBACK } from '../utils/tax';

// [Finding financial-integrity #549] Borne du slider REER = plafond de l'ANNÉE COURANTE
// (source unique utils/tax) — un `max="30000"` en dur dérivait en silence à chaque indexation.
const RRSP_SLIDER_MAX = RRSP_ANNUAL_LIMITS[new Date().getFullYear()] ?? RRSP_ANNUAL_LIMIT_FALLBACK;
import { computeMonthlyActualAverages } from '../utils/budgetSync';
import { PrivateAmount } from './ui/PrivateAmount';
import { formatCAD, formatSigned } from '../utils/format';
import { useFinanceStore } from '../store/useFinanceStore';

interface TaxCenterProps {
    config: BudgetConfig;
    /**
     * ⚠️ [AI-TAXCENTER-APPLY-NOGATE] RETIRÉ : plus aucun code de cet écran n'écrit la config en
     * direct. L'application d'un talon de paie passe par `executeWriteTool` (diff → confirmation →
     * backup → écriture), qui lit et écrit l'état FRAIS lui-même. Laisser la prop en place ferait
     * croire qu'il existe encore un chemin d'écriture direct — et inviterait à le reprendre.
     */
    assets?: Asset[];
    apiKey?: string;
}

const DRIVE_FOLDER_URL = "https://drive.google.com";

// Phase 4 A4: les modèles Gemini sont remplacés par Claude Sonnet 4.6
// (cf services/claude.ts analyzePayslip).

export const TaxCenter: React.FC<TaxCenterProps> = ({ config, assets = [], apiKey }) => {
    // [AI-TAXCENTER-APPLY-NOGATE] Plomberie PARTAGÉE de la confirmation (diff → clic → apply).
    const { pendingWrite, requestConfirmation, resolvePendingWrite } = useWriteConfirmation();



    const [rrspContribution, setRrspContribution] = useState(0);
    const [fhsaContribution, setFhsaContribution] = useState(0);
    // [D6-PRIV-MONTANTS] focus des sliders → étiquette révélée pendant l'ajustement seulement.
    const [rrspSliderFocus, setRrspSliderFocus] = useState(false);
    const [fhsaSliderFocus, setFhsaSliderFocus] = useState(false);
    // [A11Y-PRIVACY-TAXCENTER] Le détail « Ce que tu gagnes » passait déjà par PrivateAmount, mais 5
    // zones restaient LISIBLES en mode discret : la fiche de paie détectée (brut/net/impôt/REER), le
    // revenu brut synchronisé, l'impôt déjà prélevé + placements non enregistrés, les 3 KPI ($) et
    // les paliers (montant taxé / rempli = le revenu, à la tranche près). Toutes enveloppées.
    const isPrivacyMode = useFinanceStore((s) => s.isPrivacyMode);
    const [alreadyPaidTax, setAlreadyPaidTax] = useState(0);

    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisStatus, setAnalysisStatus] = useState("");
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [scannedPay, setScannedPay] = useState<{ gross: number, net: number, tax: number, rrsp: number, freq: string, sourceLabel?: string } | null>(null);

    /**
     * [AI-TAXCENTER-APPLY-NOGATE] Écriture par le chemin STANDARD du dépôt : diff pur → modal de
     * confirmation → recalcul sur état FRAIS → backup → écriture. Exactement ce qu'a reçu
     * `PayslipUploadCard` ; cette surface-ci écrivait encore en direct.
     *
     * ⚠️ Ce que le geste de confirmation ne remplaçait PAS : il y avait bien un bouton à cliquer,
     * mais aucun DIFF (on ne voyait pas ce qui allait changer), aucun BACKUP (rien à quoi revenir),
     * et aucune garde de vraisemblance. Un bouton n'est pas un filet.
     *
     * ⚠️ Et le `setConfig` direct portait une MUTATION : `{ ...config }` est une copie de SURFACE,
     * donc `newConfig.users` restait le MÊME tableau — `newConfig.users[0] = …` écrasait l'état
     * précédent en place. L'objet auquel un backup ou un `undo` se serait raccroché était déjà
     * modifié. Le bug disparaît avec le chemin standard, qui ne touche jamais l'état à la main.
     */
    const applyToProfile = async () => {
        if (!scannedPay) return;
        const [{ executeWriteTool }, { applyPayslipSpec }] = await importWithRetry(
            () => Promise.all([
                import('../services/aiTools/writeExecutor'),
                import('../mcp/tools/applyPayslip.spec'),
            ]),
            'taxCenterPayslipWrite',
        );
        // Spec du dépôt, ré-estampillée pour CETTE surface : provenance 'payslip' (dépôt in-app)
        // au lieu du défaut 'mcp'. Le spec attend de l'ANNUEL et stocke en MENSUEL — la conversion
        // vit à UN seul endroit, plus de `annualSalaryToMonthly` recopié ici.
        const inAppSpec = {
            ...applyPayslipSpec,
            toDocument: (a: Parameters<typeof applyPayslipSpec.toDocument>[0]) => ({
                ...applyPayslipSpec.toDocument(a),
                sourceKind: 'payslip' as const,
            }),
        };
        const toolResult = await executeWriteTool(
            inAppSpec,
            {
                userIndex: 0,
                grossAnnual: scannedPay.gross,
                netAnnual: scannedPay.net,
                // [INCOME-PROVENANCE] étiquette de la source du revenu (même troncature que le
                // chemin MCP et que `PayslipUploadCard`).
                // `sourceLabel` est optionnel sur le résultat de l'analyse : sans étiquette, on
                // n'en INVENTE pas — le spec sait vivre sans (le champ reste absent côté document).
                ...(scannedPay.sourceLabel ? { employer: scannedPay.sourceLabel.slice(0, 120) } : {}),
            },
            requestConfirmation,
        );

        // Contrat de `executeWriteTool` : un bloc texte JSON. Illisible → on n'affirme RIEN
        // (jamais un « mis à jour » fabriqué).
        let applied = false;
        let refused = false;
        try {
            const payload = JSON.parse(toolResult.content[0]?.text ?? '{}') as {
                applied?: boolean; refusedByUser?: boolean; backupFailed?: boolean;
            };
            applied = payload.applied === true;
            refused = payload.refusedByUser === true || payload.backupFailed === true;
        } catch (parseErr) {
            logError({ source: 'ai', severity: 'warning', message: 'Centre fiscal : résultat d\'écriture illisible', error: parseErr });
        }

        if (applied) {
            showToast('Configuration mise à jour avec succès !', 'success');
            setScannedPay(null);
        } else if (refused) {
            showToast('Modification annulée — ton profil est inchangé.', 'info');
        } else {
            showToast('Rien n\'a été modifié.', 'info');
        }
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
                // SF-RESIDUS — routé vers logError (source 'ai' : analyse de paie via Claude). Le toast
                // ci-dessous reste le retour utilisateur ; logError donne la visibilité prod (SystemView).
                logError({ source: 'ai', severity: 'error', message: 'TaxCenter : analyse de paie (analyzePayslip) échouée', context: { fileName: file.name }, error: err instanceof Error ? err : new Error(String(err)) });
                // [AI-BUDGETMODAL-ERROR-COLLAPSE] Le message NOMMAIT deux causes à la fois — le format
                // du fichier ET la clé — sur une erreur dont il ne savait rien. L'indice de format ne
                // vaut que si la requête elle-même a été refusée ; sinon c'est le réseau, le quota ou
                // le service, et aucun des deux conseils ne s'applique.
                showToast(
                    causeErreurIa(err) === 'requete'
                        ? `Échec analyse ${file.name}. Vérifie le format du fichier (JPG/PNG/WEBP/PDF).`
                        : `Échec analyse ${file.name}. ${messageErreurIa(err) ?? ''}`.trim(),
                    'error',
                );
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
                    freq: res.frequency,
                    // [INCOME-PROVENANCE] nom du fichier de paie = étiquette de la source unique
                    // (tronqué : même discipline que le .max(120) du chemin MCP — finding panel)
                    sourceLabel: file.name.slice(0, 120),
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

    // [TC-FX-HARDCODE] taux de change RÉELS du store (avant : USD figé à 1,38 → impôt estimé faux).
    const fxRates = useFinanceStore((s) => s.fxRates);
    const investmentTaxData = useMemo(() => {
        // [ASSET-FX-DISPLAY] routé sur la source unique assetValueCad. [TAX-APP-MCP-BASE] l'assiette
        // placement imposable vient du helper PARTAGÉ (services/taxEstimate) — même code que
        // get_tax_situation (MCP) → l'app et le connecteur calculent sur la MÊME base.
        const nonRegAssets = assets.filter(a => a.accountType === 'NON-ENREG' || a.accountType === 'CRYPTO');
        const nonRegValue = nonRegAssets.reduce((sum, a) => sum + assetValueCad(a, fxRates), 0);
        const taxableInvestmentIncome = estimateTaxableInvestmentIncome(assets, fxRates);

        return { totalNonReg: nonRegValue, taxableAddOn: taxableInvestmentIncome };
    }, [assets, fxRates]);

    const [viewUser, setViewUser] = useState<string>('all');

    const taxData = useMemo(() => {
        const results = config.users.map((u, i) => {
            // Bug fix test-mode : u.grossSalary et u.netSalary sont MENSUELS
            // dans le store (convention Budget.tsx). Le moteur fiscal attend
            // le brut ANNUEL → × 12. Avant ce fix, TaxCenter affichait
            // grossIncome = 13 700$ comme "REVENU BRUT ANNUEL" pour un couple
            // dont le brut annuel réel est 164 400$ → impôt = 0$ (sous le PBMA).
            const anneeFiscaleCourante = new Date().getFullYear();
            const monthlyGross = u.grossSalary || 0;
            const ageOptsUser = ageOptsForSalaryInversion(u, anneeFiscaleCourante, config.users.length);
            const uGross = monthlyGross > 0
                ? monthlyGross * 12
                // [GROSSFROMNET-ANNEE-FIGEE] ⚠️ Cette année DOIT être la même que celle passée à
                // `calculateFiscalReport` juste en dessous. Les désaccorder rend l'aller-retour faux :
                // mesuré 212 $/an d'écart dès 2027, 874 $ en 2030, sur un panneau étiqueté
                // « Estimation {année courante} ».
                // [GROSSFROMNET-CREDITS-65] ⚠️ Ces `ageOpts` DOIVENT être les mêmes que ceux passés à
                // `calculateFiscalReport` juste en dessous — même exigence de PAIRE que l'année, et
                // pour la même raison : ce panneau fait un aller-retour net→brut→impôt. Avant ce lot,
                // les crédits d'âge manquaient aux DEUX bouts (`undefined /* ageOpts */`), ce qui était
                // au moins cohérent ; n'en câbler qu'un aurait été pire que le défaut.
                : calculateGrossFromNet((u.netSalary || 0) * 12, anneeFiscaleCourante, ageOptsUser);
            const splitRatio = 1 / config.users.length;
            const uTotalTaxable = uGross + (investmentTaxData.taxableAddOn * splitRatio);
            // [FISC-PAYROLL-BASE-INVEST] assiette IMPOSABLE = salaire + placement (paliers d'impôt),
            // mais assiette EMPLOI (RRQ/RQAP/AE) = salaire SEUL (uGross) — le placement ne cotise pas.
            const res = calculateFiscalReport(
                uTotalTaxable, rrspContribution * splitRatio, fhsaContribution * splitRatio,
                anneeFiscaleCourante, undefined /* skipBreakdown */, ageOptsUser, uGross /* employmentIncome */,
            );
            const refundOrOwe = (alreadyPaidTax * splitRatio) > 0 ? ((alreadyPaidTax * splitRatio) - res.totalTax) : 0;
            return {
                id: i,
                name: u.name,
                gross: uGross,
                taxable: uTotalTaxable,
                report: { ...res, refundOrOwe },
                // [ENG-NET-MODEL-RESIDUAL] Diagnostic net déclaré vs net du modèle (salaire seul) —
                // même PAIRE (année, ageOpts) que le rapport ci-dessus, sinon l'écart mesurerait le
                // désaccord des paramètres et pas celui de la paie.
                residuelNet: netModelResidual(u, anneeFiscaleCourante, ageOptsUser),
                fedBreakdown: res.fedBreakdown,
                qcBreakdown: res.qcBreakdown
            };
        });

        if (viewUser === 'all') {
            const totalGross = results.reduce((sum, r) => sum + r.gross, 0);
            const totalTaxable = results.reduce((sum, r) => sum + r.taxable, 0);
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
                    // Taux moyen sur l'assiette IMPOSABLE (salaire + placement), cohérent avec totalTax/le MCP.
                    averageRate: totalTaxable > 0 ? (totalTax / totalTaxable * 100) : 0
                },
                // [TAX-DETAIL] détail des retenues, sommé (le détail par conjoint est dans les onglets)
                deductions: {
                    fed: results.reduce((s, r) => s + r.report.fedTax, 0),
                    qc: results.reduce((s, r) => s + r.report.qcTax, 0),
                    rrq: results.reduce((s, r) => s + r.report.rrq, 0),
                    rqap: results.reduce((s, r) => s + r.report.rqap, 0),
                    ae: results.reduce((s, r) => s + r.report.ae, 0),
                },
                // La base du calcul inclut le revenu de placement ESTIMÉ (non-enreg/crypto) — la
                // cascade affichée doit l'inclure pour BOUCLER (finding financial-integrity F1).
                taxableAddOn: investmentTaxData.taxableAddOn,
                // Diagnostic PAR PERSONNE seulement (comme les paliers) : sommer un écart de paie
                // par-dessus des conjoints aux situations différentes brouillerait le signal.
                // ⚠️ SAUF en solo : le sélecteur de profil n'existe que pour un couple
                // (`users.length > 1`), donc la vue « all » est la SEULE vue d'un solo — sans ce
                // cas, le diagnostic serait inatteignable pour lui (classe UX-UNREACHABLE-FEATURE).
                residuelNet: results.length === 1 ? results[0].residuelNet : null,
                fedBreakdown: results[0].fedBreakdown,
                qcBreakdown: results[0].qcBreakdown
            };
        } else {
            const userRes = results.find(r => r.name === viewUser) || results[0];
            return {
                isGlobal: false,
                grossIncome: userRes.gross,
                report: userRes.report,
                residuelNet: userRes.residuelNet,
                deductions: {
                    fed: userRes.report.fedTax,
                    qc: userRes.report.qcTax,
                    rrq: userRes.report.rrq,
                    rqap: userRes.report.rqap,
                    ae: userRes.report.ae,
                },
                taxableAddOn: investmentTaxData.taxableAddOn / config.users.length,
                fedBreakdown: userRes.fedBreakdown,
                qcBreakdown: userRes.qcBreakdown
            };
        }
    }, [config.users, viewUser, rrspContribution, fhsaContribution, investmentTaxData, alreadyPaidTax]);

    const { grossIncome, report, fedBreakdown, qcBreakdown, isGlobal, deductions, taxableAddOn, residuelNet } = taxData;

    // [INCOME-PROVENANCE] Source du revenu du profil principal (fiche de paie = source unique).
    const salarySource = config.users[0]?.salarySource;

    // [TAX-REAL-SPENDING] « voir exactement ce que je gagne et dépense » : réel mensuel moyen
    // (mois pleins, hors transferts/doublons) — mêmes fonctions que le Budget (source unique).
    const transactions = useFinanceStore(s => s.transactions);
    const realAverages = useMemo(() => computeMonthlyActualAverages(transactions), [transactions]);

    const openDrive = () => window.open(DRIVE_FOLDER_URL, '_blank');

    return (
        <div className="space-y-6 stagger-in pb-20">

            {/* [REFONTE-NAV-L3] Titre aligné sur TAB_LABELS (« Impôts & Docs ») — la page et la
                nav doivent dire la même chose (passe de cohérence Config). */}
            <PageHeader
                icon={<Icon name="tax" size={28} />}
                title="Impôts & Docs"
            />

            {/* PH3 — salaire + options fiscales déplacés dans l'onglet Profil unifié. */}
            <ProfileFieldsMoved what="Ton salaire et tes options fiscales" />

            <div className="flex justify-end gap-2 w-full md:w-auto md:ml-auto -mt-2">
                    {/* Phase G.2 — upload migré vers l'onglet Documents global (doc directives §9).
                        On garde l'extraction IA ici pour les utilisateurs qui veulent un calcul
                        direct, mais on annonce clairement la nouvelle destination. */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isAnalyzing}
                        className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/40 px-4 py-2 rounded-lg transition-all active:scale-95 group disabled:opacity-50"
                        title="Pour archiver vos documents, utilisez plutôt l'onglet Documents"
                    >
                        <Icon name={isAnalyzing ? 'clock' : 'bot'} size={18} className="text-ink-300" />
                        <span className="font-bold text-ink-100 text-meta">Calcul rapide</span>
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*,application/pdf" onChange={handleFileDrop} />

                    <button onClick={openDrive} className="flex items-center justify-center gap-2 bg-[#1f2937] hover:bg-[#374151] border border-white/40 px-4 py-2 rounded-lg transition-all shadow-lg active:scale-95 group">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" alt="Drive" className="w-6 h-6 group-hover:scale-110 transition-transform" />
                    </button>
            </div>
            {/* [SEC-VISION-CONSENT-INJECTION] Loi 25 : « Calcul rapide » envoie la fiche de paie BRUTE
                (nom, employeur, salaire exact) à Anthropic — le dire explicitement près de l'action. */}
            <p className="text-tiny text-ink-400">
                « Calcul rapide » envoie ta fiche de paie (image/PDF, avec nom/employeur/salaire) à Anthropic (Claude) pour en extraire les montants.
            </p>

            {isAnalyzing && (
                <div className="w-full bg-surfaceHighlight rounded-full h-2.5 overflow-hidden">
                    <div className="bg-info-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                    <div className="text-center text-tiny text-ink-300 mt-1">Traitement {progress.current} / {progress.total} fichiers</div>
                </div>
            )}

            {scannedPay && (
                <div className="bg-white/[0.03] border border-white/10 p-4 rounded-xl mt-4 animate-fade-in">
                    <h3 className="text-body font-bold text-white mb-3 flex items-center gap-2">Fiche de Paie Détectée ({scannedPay.freq})</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="bg-black/30 p-3 rounded border border-white/5">
                            <div className="text-tiny text-ink-300">Brut Annuel Est.</div>
                            <PrivateAmount as="div" className="text-lg font-bold text-white">{formatCAD(scannedPay.gross)}</PrivateAmount>
                        </div>
                        <div className="bg-black/30 p-3 rounded border border-white/5">
                            <div className="text-tiny text-ink-300">Net Annuel Est.</div>
                            <PrivateAmount as="div" className="text-lg font-bold text-green-400">{formatCAD(scannedPay.net)}</PrivateAmount>
                        </div>
                        <div className="bg-black/30 p-3 rounded border border-white/5">
                            <div className="text-tiny text-ink-300">Impôts Retenus Est.</div>
                            <PrivateAmount as="div" className="text-lg font-bold text-danger-400">{formatSigned(-scannedPay.tax, { withCurrency: true })}</PrivateAmount>
                        </div>
                        <div className="bg-black/30 p-3 rounded border border-white/5">
                            <div className="text-tiny text-ink-300">REER/RPP Retenus</div>
                            <PrivateAmount as="div" className="text-lg font-bold text-info-400">{formatCAD(scannedPay.rrsp)}</PrivateAmount>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setScannedPay(null)} className="text-meta text-ink-300 px-3 py-1.5 hover:text-white transition">Ignorer</button>
                        <button onClick={applyToProfile} className="bg-info-600 hover:bg-info-700 text-white text-meta font-bold px-4 py-1.5 rounded transition shadow-lg">
                            Appliquer au Profil Principal
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
                        type="button"
                        onClick={() => setViewUser('all')}
                        aria-pressed={viewUser === 'all'}
                        className={`px-4 py-2 text-body font-bold rounded-md transition-all ${viewUser === 'all' ? 'bg-white text-black shadow' : 'text-ink-300 hover:text-white'}`}
                    >
                        Global (Couple)
                    </button>
                    {config.users.map((u) => (
                        <button
                            key={u.name}
                            type="button"
                            onClick={() => setViewUser(u.name)}
                            aria-pressed={viewUser === u.name}
                            className={`px-4 py-2 text-body font-bold rounded-md transition-all ${viewUser === u.name ? 'bg-white text-black shadow' : 'text-ink-300 hover:text-white'}`}
                        >
                            {u.name}
                        </button>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                <div className="lg:col-span-4 space-y-6 order-2 lg:order-1">
                    <Card icon={<Icon name="portfolio" size={18} />} title="Revenus & Déductions">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-meta text-ink-300 mb-1 font-bold uppercase">
                                    {isGlobal ? "Revenu Brut Annuel du Couple" : `Revenu Brut (${viewUser})`}
                                </label>
                                <div className="p-3 bg-white/5 border border-white/10 rounded-lg flex items-center justify-between">
                                    <span className="text-ink-300">Total Synchronisé</span>
                                    <PrivateAmount className="text-xl font-bold text-white font-mono">{formatCAD(grossIncome)}</PrivateAmount>
                                </div>
                                <p className="text-tiny text-ink-400 mt-2 flex items-center gap-1.5">
                                    <Icon name="lock" size={12} /> Lié à la Configuration (× 12 mois).
                                </p>
                            </div>

                            {alreadyPaidTax > 0 && (
                                <div className="p-3 bg-green-900/10 border border-green-500/30 rounded">
                                    <div className="flex justify-between items-center">
                                        <span className="text-meta text-green-400 font-bold">Impôt déjà prélevé (Source)</span>
                                        <PrivateAmount className="text-body font-mono text-white">{formatCAD(alreadyPaidTax)}</PrivateAmount>
                                    </div>
                                    <div className="text-tiny text-ink-400 mt-1">Détecté automatiquement via vos documents</div>
                                </div>
                            )}

                            {investmentTaxData.totalNonReg > 0 && (
                                <div className="p-3 bg-white/5 rounded border border-white/10">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-meta text-yellow-400 font-bold">Invest. Non-Enregistrés</span>
                                        <PrivateAmount className="text-meta text-white">{formatCAD(investmentTaxData.totalNonReg)}</PrivateAmount>
                                    </div>
                                    <div className="text-tiny text-ink-400">
                                        Impact estimé sur revenu imposable: <PrivateAmount className="text-red-300">{formatSigned(investmentTaxData.taxableAddOn, { withCurrency: true })}</PrivateAmount>
                                    </div>
                                </div>
                            )}

                            <div className="p-4 bg-blue-900/10 border border-info-500/20 rounded-xl space-y-3">
                                <h4 className="text-meta font-bold text-blue-300 uppercase flex items-center gap-2">
                                    Réducteurs d'Impôt
                                </h4>
                                <div>
                                    <label className="flex justify-between text-meta text-ink-200 mb-1">
                                        <span>Cotisation REER</span>
                                        <PrivateSliderValue revealed={rrspSliderFocus}>{formatCAD(rrspContribution)}</PrivateSliderValue>
                                    </label>
                                    <input type="range" aria-label="Cotisation REER" min="0" max={RRSP_SLIDER_MAX} step="100" value={rrspContribution} {...maskedSliderAria(isPrivacyMode && !rrspSliderFocus)} onChange={e => setRrspContribution(parseFloat(e.target.value))} onFocus={() => setRrspSliderFocus(true)} onBlur={() => setRrspSliderFocus(false)} className="w-full h-2 bg-dark rounded-lg appearance-none cursor-pointer accent-info-500" />
                                </div>
                                <div>
                                    <label className="flex justify-between text-meta text-ink-200 mb-1">
                                        <span>CELIAPP</span>
                                        <PrivateSliderValue revealed={fhsaSliderFocus}>{formatCAD(fhsaContribution)}</PrivateSliderValue>
                                    </label>
                                    <input type="range" aria-label="CELIAPP" min="0" max={FHSA_ANNUAL_LIMIT_PER_USER} step="100" value={fhsaContribution} {...maskedSliderAria(isPrivacyMode && !fhsaSliderFocus)} onChange={e => setFhsaContribution(parseFloat(e.target.value))} onFocus={() => setFhsaSliderFocus(true)} onBlur={() => setFhsaSliderFocus(false)} className="w-full h-2 bg-dark rounded-lg appearance-none cursor-pointer accent-green-500" />
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>

                <div className="lg:col-span-8 space-y-6 order-1 lg:order-2">

                    {/* [INCOME-PROVENANCE] Source UNIQUE du revenu (demande Marc : « l'onglet impôt
                        dépend seulement des fichiers de paie que je lui mets »). La Santé financière
                        lit le même config.users[].netSalary → toute la chaîne suit cette source. */}
                    {salarySource?.kind === 'payslip' || salarySource?.kind === 'mcp' ? (
                        <div className="bg-success-500/10 border border-success-500/30 rounded-lg px-4 py-2.5 text-meta text-ink-100 flex items-center gap-2">
                            <Icon name="lock" size={14} />
                            <span>
                                Revenu basé sur la fiche de paie{salarySource.label ? ` « ${salarySource.label} »` : ''}
                                {salarySource.kind === 'mcp' ? ' (via le connecteur Claude)' : ''}
                                {salarySource.appliedAt ? `, appliquée le ${new Date(salarySource.appliedAt).toLocaleDateString('fr-CA')}` : ''}.
                                {' '}La Santé financière et le Budget utilisent ce même revenu.
                            </span>
                        </div>
                    ) : (
                        <div className="bg-warning-500/10 border border-warning-500/30 rounded-lg px-4 py-2.5 text-meta text-ink-100 flex items-center gap-2">
                            <Icon name="status" size={14} />
                            <span>Revenu saisi manuellement (aucune fiche de paie appliquée). Pour un calcul précis, importe une paie via « Calcul rapide » — elle deviendra LA source du revenu partout.</span>
                        </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card className="!p-4 border-l-4 border-l-red-500 bg-surface/50">
                            <div className="text-tiny text-ink-400 uppercase font-bold">Impôt Total</div>
                            <PrivateAmount as="div" className="text-2xl font-black text-white">{formatCAD(report.totalTax)}</PrivateAmount>
                            <div className="text-tiny text-ink-400">Fed + Qc</div>
                        </Card>
                        <Card className="!p-4 border-l-4 border-l-green-500 bg-surface/50">
                            <div className="text-tiny text-ink-400 uppercase font-bold">Revenu Net</div>
                            <PrivateAmount as="div" className="text-2xl font-black text-green-400">{formatCAD(report.netIncome)}</PrivateAmount>
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
                            <PrivateAmount as="div" className={`text-2xl font-black ${report.refundOrOwe > 0 ? 'text-green-400' : 'text-danger-400'}`}>
                                {formatSigned(report.refundOrOwe, { withCurrency: true })}
                            </PrivateAmount>
                            <div className="text-tiny text-ink-400">Basé sur docs reçus</div>
                        </Card>
                    </div>

                    {/* [TAX-DETAIL] Brut → chaque retenue → net (demande Marc : « plus détaillé,
                        plus précis, que je vois exactement ce que je gagne ») + réel des dépenses. */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card icon={<Icon name="tax" size={18} />} title={`Ce que tu gagnes — détail (annuel${!isGlobal ? `, ${viewUser}` : ''})`}>
                            <dl className="space-y-1.5 text-meta">
                                <div className="flex justify-between py-1">
                                    <dt className="text-ink-200 font-bold">Salaire brut</dt>
                                    <dd className="font-mono text-white font-bold"><PrivateAmount>{formatCAD(grossIncome)}</PrivateAmount></dd>
                                </div>
                                {/* [TAX-DETAIL F1] la base fiscale inclut le revenu de placement ESTIMÉ :
                                    sans cette ligne, la cascade brut − retenues ≠ net (écart = l'add-on,
                                    mesuré par le panel — la carte doit BOUCLER au dollar près). */}
                                {taxableAddOn > 0 && (
                                    <div className="flex justify-between py-1">
                                        <dt className="text-ink-300">+ Revenu de placement estimé (non-enreg/crypto)</dt>
                                        <dd className="font-mono text-ink-100"><PrivateAmount>{formatSigned(taxableAddOn, { withCurrency: true })}</PrivateAmount></dd>
                                    </div>
                                )}
                                <div className="flex justify-between py-1 border-b border-white/10">
                                    <dt className="text-ink-200 font-bold">Revenu imposable estimé</dt>
                                    <dd className="font-mono text-white font-bold"><PrivateAmount>{formatCAD(grossIncome + taxableAddOn)}</PrivateAmount></dd>
                                </div>
                                <div className="flex justify-between py-1">
                                    <dt className="text-ink-300">Impôt fédéral (après abattement QC)</dt>
                                    <dd className="font-mono text-danger-400"><PrivateAmount>{formatSigned(-deductions.fed, { withCurrency: true })}</PrivateAmount></dd>
                                </div>
                                <div className="flex justify-between py-1">
                                    <dt className="text-ink-300">Impôt Québec</dt>
                                    <dd className="font-mono text-danger-400"><PrivateAmount>{formatSigned(-deductions.qc, { withCurrency: true })}</PrivateAmount></dd>
                                </div>
                                <div className="flex justify-between py-1">
                                    <dt className="text-ink-300">RRQ (volets 1 + 2)</dt>
                                    <dd className="font-mono text-danger-400"><PrivateAmount>{formatSigned(-deductions.rrq, { withCurrency: true })}</PrivateAmount></dd>
                                </div>
                                <div className="flex justify-between py-1">
                                    <dt className="text-ink-300">RQAP</dt>
                                    <dd className="font-mono text-danger-400"><PrivateAmount>{formatSigned(-deductions.rqap, { withCurrency: true })}</PrivateAmount></dd>
                                </div>
                                <div className="flex justify-between py-1">
                                    <dt className="text-ink-300">Assurance-emploi</dt>
                                    <dd className="font-mono text-danger-400"><PrivateAmount>{formatSigned(-deductions.ae, { withCurrency: true })}</PrivateAmount></dd>
                                </div>
                                <div className="flex justify-between py-1.5 border-t border-white/10">
                                    <dt className="text-ink-100 font-bold">Revenu net (fiscal)</dt>
                                    <dd className="font-mono text-success-400 font-bold"><PrivateAmount>{formatCAD(report.netIncome)}</PrivateAmount></dd>
                                </div>
                                <div className="flex justify-between py-1">
                                    <dt className="text-ink-300">Soit par mois (net fiscal)</dt>
                                    <dd className="font-mono text-ink-100"><PrivateAmount>{formatCAD(report.netIncome / 12)}</PrivateAmount></dd>
                                </div>
                                {/* [ENG-NET-MODEL-RESIDUAL] Affiché seulement quand il y a un FAIT à montrer :
                                    brut SAISI (déduit → écart nul par construction, un 0 $ serait du décor) ET
                                    écart ≥ 1 % du net déclaré (sous ça : bruit de paie). Le montant reste un
                                    NŒUD (PrivateAmount), la phrase du dessous ne porte aucun chiffre. */}
                                {residuelNet?.significatif && (
                                    <div className="flex justify-between py-1 border-t border-white/10">
                                        <dt className="text-warning-400">Écart net déclaré ↔ net du modèle (salaire)</dt>
                                        <dd className="font-mono text-warning-400"><PrivateAmount>{formatSigned(residuelNet.residuel, { withCurrency: true })}</PrivateAmount></dd>
                                    </div>
                                )}
                            </dl>
                            {residuelNet?.significatif && (
                                <p className="text-tiny text-ink-400 mt-2">Ton brut est saisi à la main et le net que le modèle en déduit ne retombe pas sur ton net déclaré — les projections encaissent le net DÉCLARÉ, l'impôt vient du MODÈLE. Écart positif : le modèle rend plus de net que ta paie (retenues d'employeur type RPP/assurances non modélisées ?). Écart négatif : vérifie le brut et le net au Profil (une des deux saisies est peut-être périmée).</p>
                            )}
                            <p className="text-tiny text-ink-400 mt-2">Estimation {new Date().getFullYear()}{isGlobal ? ' (couple, sommé par conjoint)' : ''}. Net FISCAL = imposable − impôts − cotisations (avant RPP/assurances collectives). Les cotisations RRQ/RQAP/AE sont estimées sur le revenu imposable (léger sur-compte si salaire sous les maximums — suivi au BACKLOG).</p>
                        </Card>
                        <Card icon={<Icon name="transactions" size={18} />} title="Ce que tu dépenses — réel (transactions, ménage)">
                            {/* [TAX-DETAIL F2-scope] le réel des transactions est TOUJOURS un agrégat
                                MÉNAGE : en vue individuelle d'un couple, comparer au net d'UN conjoint
                                serait dominé par le salaire de l'autre (finding panel) → carte masquée. */}
                            {!isGlobal ? (
                                <p className="text-meta text-ink-400">Le réel des transactions est un agrégat du ménage — sélectionne « Global (Couple) » pour le voir.</p>
                            ) : realAverages.fullMonths > 0 ? (
                                <dl className="space-y-1.5 text-meta">
                                    <div className="flex justify-between py-1">
                                        <dt className="text-ink-300">Revenus réels moyens / mois</dt>
                                        <dd className="font-mono text-success-400"><PrivateAmount>{formatCAD(realAverages.incomeAvg)}</PrivateAmount></dd>
                                    </div>
                                    <div className="flex justify-between py-1">
                                        <dt className="text-ink-300">Dépenses réelles moyennes / mois</dt>
                                        <dd className="font-mono text-danger-400"><PrivateAmount>{formatSigned(-realAverages.expenseAvg, { withCurrency: true })}</PrivateAmount></dd>
                                    </div>
                                    <div className="flex justify-between py-1.5 border-t border-white/10">
                                        <dt className="text-ink-100 font-bold">Solde mensuel moyen</dt>
                                        <dd className={`font-mono font-bold ${realAverages.incomeAvg - realAverages.expenseAvg >= 0 ? 'text-success-400' : 'text-danger-400'}`}>
                                            <PrivateAmount>{formatSigned(realAverages.incomeAvg - realAverages.expenseAvg, { withCurrency: true })}</PrivateAmount>
                                        </dd>
                                    </div>
                                    <div className="flex justify-between py-1">
                                        <dt className="text-ink-300">Écart net fiscal ↔ revenus réels</dt>
                                        <dd className="font-mono text-ink-100"><PrivateAmount>{formatSigned(realAverages.incomeAvg - report.netIncome / 12, { withCurrency: true })}</PrivateAmount></dd>
                                    </div>
                                </dl>
                            ) : (
                                <p className="text-meta text-ink-400">Aucun mois complet de transactions — importe tes relevés pour voir le réel ici.</p>
                            )}
                            <p className="text-tiny text-ink-400 mt-2">Moyennes sur {realAverages.fullMonths} mois plein(s) d'historique, hors transferts et doublons — mêmes chiffres que l'onglet Budget. Un écart net↔réel notable = revenus hors paie (Interac, remboursements) ou relevés incomplets.</p>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {isGlobal ? (
                            <div className="md:col-span-2 text-center py-6 text-ink-400 bg-white/5 rounded-xl">
                                ℹ️ Les paliers d'imposition sont individuels. Veuillez sélectionner un profil pour voir les paliers détaillés.
                            </div>
                        ) : (
                            <>
                                <Card title="Paliers fédéraux">
                                    <div className="space-y-4 mt-2">
                                        {(fedBreakdown ?? []).map((b, i) => (
                                            <div key={i} className="relative">
                                                <div className="flex justify-between text-tiny mb-1">
                                                    <span className="text-ink-200 font-bold">{b.rate}</span>
                                                    <PrivateAmount className="text-ink-400">{b.amount > 0 ? `${formatCAD(b.amount)} taxés` : '0 $'}</PrivateAmount>
                                                </div>
                                                <div className="h-4 w-full bg-surfaceHighlight rounded overflow-hidden relative border border-white/5">
                                                    <div className="h-full bg-danger-600/80 transition-all duration-500" style={{ width: `${b.percentFull}%` }}></div>
                                                    <PrivateAmount as="div" className="absolute inset-0 flex items-center justify-center text-tiny font-mono text-white/80 shadow-black drop-shadow-md">
                                                        {formatCAD(b.filled)} / {typeof b.max === 'number' ? formatCAD(b.max) : `${b.max} $`}
                                                    </PrivateAmount>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                                <Card title="Paliers provinciaux">
                                    <div className="space-y-4 mt-2">
                                        {(qcBreakdown ?? []).map((b, i) => (
                                            <div key={i} className="relative">
                                                <div className="flex justify-between text-tiny mb-1">
                                                    <span className="text-ink-200 font-bold">{b.rate}</span>
                                                    <PrivateAmount className="text-ink-400">{b.amount > 0 ? `${formatCAD(b.amount)} taxés` : '0 $'}</PrivateAmount>
                                                </div>
                                                <div className="h-4 w-full bg-surfaceHighlight rounded overflow-hidden relative border border-white/5">
                                                    <div className="h-full bg-info-600/80 transition-all duration-500" style={{ width: `${b.percentFull}%` }}></div>
                                                    <PrivateAmount as="div" className="absolute inset-0 flex items-center justify-center text-tiny font-mono text-white/80 shadow-black drop-shadow-md">
                                                        {formatCAD(b.filled)} / {typeof b.max === 'number' ? formatCAD(b.max) : `${b.max} $`}
                                                    </PrivateAmount>
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

            {/* [AI-TAXCENTER-APPLY-NOGATE] Point de contrôle humain : MÊME modal que le chat in-app
                et que le dépôt de talon (diff avant → après). Toute fermeture = refus ; l'écriture
                et sa sauvegarde ne partent qu'après « Appliquer ». */}
            {pendingWrite && (
                <AiChatConfirmModal preview={pendingWrite} onDecision={resolvePendingWrite} />
            )}
        </div>
    );
};
