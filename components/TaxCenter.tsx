import React, { useState, useMemo, useRef } from 'react';
import { showToast } from './ui/Toast';
import { importWithRetry } from '../utils/lazyWithRetry';
import { useWriteConfirmation } from '../hooks/useWriteConfirmation';
import { AiChatConfirmModal } from './aiChat/AiChatConfirmModal';
import { CollapsibleSection } from './ui/CollapsibleSection';
import { PrivateSliderValue } from './ui/PrivateSliderValue';
import { maskedSliderAria } from '../utils/privacyAria';
import { PageHeader } from './ui/PageHeader';
import { Icon } from './ui/Icon';
import { CoupleOptimizationCard } from './tax/CoupleOptimizationCard';
import { BudgetConfig, Asset, Tab } from '../types';
import { TAB_LABELS } from '../constants';
// Phase 4 A4: bascule sur services/claude.ts (Sonnet 4.6 + Vision)
import { analyzePayslip } from '../services/claude';
import { logError } from '../services/errorLogger';
import { causeErreurIa, messageErreurIa } from '../services/messageErreurIa';
import { assetValueCad } from '../services/portfolio';
import { ageOptsForSalaryInversion, calculateFiscalReport, calculateGrossFromNet } from '../services/tax';
import { netModelResidual } from '../services/taxResidual';
import { estimateTaxableInvestmentIncome, estimateTaxableInvestmentIncomeByOwner } from '../services/taxEstimate';
import { FxEstimateBadge } from './ui/FxEstimateBadge';
import { isCoupleMode } from '../services/couple/netWorthByOwner';
import { FHSA_ANNUAL_LIMIT_PER_USER, RRSP_ANNUAL_LIMITS, RRSP_ANNUAL_LIMIT_FALLBACK } from '../utils/tax';

// [Finding financial-integrity #549] Borne du slider REER = plafond de l'ANNÉE COURANTE
// (source unique utils/tax) — un `max="30000"` en dur dérivait en silence à chaque indexation.
const RRSP_SLIDER_MAX = RRSP_ANNUAL_LIMITS[new Date().getFullYear()] ?? RRSP_ANNUAL_LIMIT_FALLBACK;
import { computeMonthlyActualAverages } from '../utils/budgetSync';
import { PrivateAmount } from './ui/PrivateAmount';
import { formatCAD, formatIsoDay, formatPercent, formatSigned } from '../utils/format';
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
        // [FISC-SOLO-INVEST-SPLIT] part de chaque conjoint par DÉTENTION RÉELLE (Asset.owner ; commun =
        // moitié-moitié en couple ; hors couple tout à user1) — même helper que get_tax_situation.
        const parProprietaire = estimateTaxableInvestmentIncomeByOwner(assets, fxRates, isCoupleMode(config.users));

        return { totalNonReg: nonRegValue, taxableAddOn: taxableInvestmentIncome, parProprietaire };
    }, [assets, fxRates, config.users]);

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
            // [FISC-SOLO-INVEST-SPLIT] le placement suit son DÉTENTEUR (plus « ÷ nombre de conjoints ») :
            // un actif attribué à Marc est imposé chez Marc, même si le conjoint n'a pas de salaire.
            const partPlacement = i === 0 ? investmentTaxData.parProprietaire.user1
                : i === 1 ? investmentTaxData.parProprietaire.user2 : 0;
            const uTotalTaxable = uGross + partPlacement;
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
                partPlacement,
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
                taxableAddOn: userRes.partPlacement,
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
    const importer = () => fileInputRef.current?.click();
    const annee = new Date().getFullYear();
    const paieAppliquee = salarySource?.kind === 'payslip' || salarySource?.kind === 'mcp';
    const imposable = grossIncome + taxableAddOn;
    const retenues = [
        { cle: 'fed', libelle: 'Impôt fédéral (après abattement)', montant: deductions.fed },
        { cle: 'qc', libelle: 'Impôt Québec', montant: deductions.qc },
        { cle: 'rrq', libelle: 'RRQ', montant: deductions.rrq },
        { cle: 'rqap', libelle: 'RQAP', montant: deductions.rqap },
        { cle: 'ae', libelle: 'Assurance-emploi', montant: deductions.ae },
    ];
    // Barres de la cascade (maquettes) : en % du revenu imposable ; les retenues s'empilent depuis la
    // DROITE (chacune commence où la précédente s'arrête), le net part de la gauche.
    const pct = (v: number) => (imposable > 0 ? Math.max(0, Math.min(100, (v / imposable) * 100)) : 0);
    let depuisDroite = 0;
    const barresRetenues = retenues.map((r) => {
        const debut = 100 - depuisDroite - pct(r.montant);
        depuisDroite += pct(r.montant);
        return { ...r, gauche: Math.max(0, debut), largeur: pct(r.montant) };
    });
    const boutonImporter = (classe: string) => (
        <button type="button" onClick={importer} disabled={isAnalyzing} className={`h-10 px-4 rounded-lg bg-primary text-dark text-body font-bold focus-ring disabled:opacity-50 ${classe}`}>
            {isAnalyzing ? 'Analyse…' : 'Importer une fiche de paie'}
        </button>
    );
    const tuile = 'rounded-2xl bg-surface border border-white/6 p-4 lg:px-[18px] flex flex-col gap-1';
    const etiquetteTuile = 'text-meta lg:text-[11px] lg:font-semibold lg:tracking-[0.06em] lg:uppercase text-ink-400';

    // [S5-REFONTE-IMPOTS] Maquettes E-impots / M-impots : en-tête (Couple / conjoints, « Estimation
    // AAAA », import de paie), bandeau de provenance du revenu, 4 tuiles, cascade « Du brut au net »,
    // puis à droite les réducteurs d'impôt, le réel des 3 derniers mois et l'optimisation du couple.
    return (
        <div className="space-y-5 stagger-in pb-20">
            <PageHeader
                title={TAB_LABELS[Tab.TAX]}
                nav={config.users.length > 1 ? (
                    <div role="group" aria-label="Vue fiscale" className="flex gap-1 p-1 rounded-xl bg-surface border border-white/6 w-full lg:w-auto">
                        {[{ id: 'all', libelle: 'Couple' }, ...config.users.map((u) => ({ id: u.name, libelle: u.name }))].map((o) => (
                            <button
                                key={o.id}
                                type="button"
                                onClick={() => setViewUser(o.id)}
                                aria-pressed={viewUser === o.id}
                                className={`flex-1 lg:flex-none min-h-10 lg:min-h-8 px-3.5 rounded-lg text-[13px] transition-colors focus-ring ${viewUser === o.id ? 'bg-ink-50 text-dark font-semibold' : 'text-ink-300 hover:bg-white/5'}`}
                            >
                                {o.libelle}
                            </button>
                        ))}
                    </div>
                ) : undefined}
                actions={
                    <span className="flex items-center gap-3">
                        <span className="text-meta text-ink-400">Estimation {annee}</span>
                        {boutonImporter('hidden lg:inline-flex items-center')}
                    </span>
                }
            />
            <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*,application/pdf" onChange={handleFileDrop} />

            {/* [INCOME-PROVENANCE] Source UNIQUE du revenu (demande Marc : « l'onglet impôt dépend
                seulement des fichiers de paie que je lui mets »). */}
            {paieAppliquee ? (
                <div className="rounded-xl border border-success-500/30 bg-success-500/8 px-4 py-3 text-[13px] text-ink-100 flex items-center gap-2">
                    <Icon name="lock" size={14} className="shrink-0" />
                    <span>
                        <strong className="text-success-400 font-semibold">Revenu de la fiche de paie</strong>{salarySource?.label ? ` « ${salarySource.label} »` : ''}
                        {salarySource?.kind === 'mcp' ? ' (via le connecteur Claude)' : ''}
                        {salarySource?.appliedAt ? `, appliquée le ${formatIsoDay(salarySource.appliedAt)}` : ''}.
                        {' '}La Santé financière et le Budget utilisent ce même revenu.
                    </span>
                </div>
            ) : (
                <div className="rounded-xl border border-warning-500/30 bg-warning-500/6 px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-3">
                    <p className="text-[13px] text-ink-100 leading-5">
                        <strong className="text-warning-400 font-semibold">Revenu saisi à la main.</strong>{' '}
                        Aucune fiche de paie appliquée : importe une paie pour un calcul précis, elle devient la source du revenu partout.
                    </p>
                    {boutonImporter('lg:hidden w-full h-11')}
                </div>
            )}
            {/* [SEC-VISION-CONSENT-INJECTION] Loi 25 : l'import envoie la fiche de paie BRUTE (nom,
                employeur, salaire exact) à Anthropic — le dire explicitement près de l'action. */}
            <p className="text-tiny text-ink-400 -mt-2">
                L'import envoie ta fiche de paie (image/PDF, avec nom/employeur/salaire) à Anthropic (Claude) pour en extraire les montants.{' '}
                <button type="button" onClick={openDrive} className="underline underline-offset-2 hover:text-ink-100 focus-ring rounded-sm">Ouvrir Google Drive ↗</button>
            </p>

            {isAnalyzing && (
                <div className="w-full bg-surfaceHighlight rounded-full h-2.5 overflow-hidden">
                    <div className="bg-info-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                    <div className="text-center text-tiny text-ink-300 mt-1">Traitement {progress.current} / {progress.total} fichiers</div>
                </div>
            )}

            {scannedPay && (
                <section aria-labelledby="paie-detectee" className="rounded-2xl bg-surface border border-white/10 p-4 sm:p-5 animate-fade-in">
                    <h2 id="paie-detectee" className="text-[17px] font-semibold text-ink-50 mb-3">Fiche de paie détectée ({scannedPay.freq})</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
                        {[
                            { l: 'Brut annuel est.', v: <PrivateAmount as="div" className="font-mono text-[18px] font-bold text-ink-50">{formatCAD(scannedPay.gross)}</PrivateAmount> },
                            { l: 'Net annuel est.', v: <PrivateAmount as="div" className="font-mono text-[18px] font-bold text-success-400">{formatCAD(scannedPay.net)}</PrivateAmount> },
                            { l: 'Impôts retenus est.', v: <PrivateAmount as="div" className="font-mono text-[18px] font-bold text-danger-400">{formatSigned(-scannedPay.tax, { withCurrency: true })}</PrivateAmount> },
                            { l: 'REER/RPP retenus', v: <PrivateAmount as="div" className="font-mono text-[18px] font-bold text-ink-50">{formatCAD(scannedPay.rrsp)}</PrivateAmount> },
                        ].map((t) => (
                            <div key={t.l} className="rounded-xl bg-dark/40 border border-white/6 px-3.5 py-3">
                                <div className="text-meta text-ink-400">{t.l}</div>
                                {t.v}
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setScannedPay(null)} className="h-10 px-4 rounded-lg text-body text-ink-300 hover:bg-white/5 focus-ring">Ignorer</button>
                        <button type="button" onClick={applyToProfile} className="h-10 px-4 rounded-lg bg-primary text-dark text-body font-bold focus-ring">Appliquer au profil principal</button>
                    </div>
                </section>
            )}

            {analysisStatus && !scannedPay && (
                <div className="bg-info-500/10 border border-info-500/30 text-blue-300 px-4 py-2 rounded-lg text-body animate-fade-in" role="status">
                    {analysisStatus}
                </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 lg:gap-4">
                <div className={tuile}>
                    <span className={etiquetteTuile}>Impôt total</span>
                    <PrivateAmount as="div" className="font-mono text-[18px] lg:text-[24px] font-bold text-ink-50">{formatCAD(report.totalTax)}</PrivateAmount>
                    <span className="text-tiny text-ink-400">fédéral + Québec</span>
                </div>
                <div className={tuile}>
                    <span className={etiquetteTuile}>Revenu net</span>
                    <PrivateAmount as="div" className="font-mono text-[18px] lg:text-[24px] font-bold text-ink-50 lg:text-success-400">{formatCAD(report.netIncome)}</PrivateAmount>
                    <span className="text-tiny text-ink-400"><PrivateAmount>{formatCAD(report.netIncome / 12)}</PrivateAmount> par mois</span>
                </div>
                <div className={tuile}>
                    <span className={etiquetteTuile}>Taux marginal</span>
                    {/* utils/tax.ts:getMarginalRate retourne un DÉCIMAL (0,4 pour 40 %). */}
                    <div className="font-mono lg:font-sans text-[18px] lg:text-[24px] font-bold text-ink-50">{formatPercent(report.marginalRate * 100, 1)}</div>
                    <span className="text-tiny text-ink-400">sur le prochain dollar</span>
                </div>
                <div className={tuile}>
                    <span className={etiquetteTuile}>Remboursement estimé</span>
                    <PrivateAmount as="div" className={`font-mono text-[18px] lg:text-[24px] font-bold ${report.refundOrOwe > 0 ? 'text-success-400' : report.refundOrOwe < 0 ? 'text-danger-400' : 'text-ink-50'}`}>
                        {formatSigned(report.refundOrOwe, { withCurrency: true })}
                    </PrivateAmount>
                    <span className="text-tiny text-ink-400">selon les documents reçus</span>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
                <div className="min-w-0 flex flex-col gap-5">
                    {/* [TAX-DETAIL] Brut → chaque retenue → net (demande Marc : « que je vois exactement ce
                        que je gagne ») — la cascade doit BOUCLER au dollar près (placement inclus). */}
                    <section aria-labelledby="brut-net-titre" className="rounded-2xl bg-surface border border-white/6 p-4 sm:px-6 sm:py-5">
                        <h2 id="brut-net-titre" className="text-[17px] lg:text-[18px] font-semibold text-ink-50 mb-3">Du brut au net (annuel{!isGlobal ? `, ${viewUser}` : ''})</h2>
                        <dl className="flex flex-col">
                            <LigneCascade libelle="Salaire brut" montant={<PrivateAmount>{formatCAD(grossIncome)}</PrivateAmount>} barre={{ gauche: 0, largeur: pct(grossIncome), couleur: 'bg-ink-50' }} />
                            {taxableAddOn > 0 && (
                                <LigneCascade libelle="Revenu de placement estimé" montant={<PrivateAmount>{formatSigned(taxableAddOn, { withCurrency: true })}</PrivateAmount>} barre={{ gauche: pct(grossIncome), largeur: pct(taxableAddOn), couleur: 'bg-success-400' }} />
                            )}
                            <LigneCascade fort separe libelle="Revenu imposable" montant={<PrivateAmount>{formatCAD(imposable)}</PrivateAmount>} barre={{ gauche: 0, largeur: 100, couleur: 'bg-ink-500' }} />
                            {barresRetenues.map((r) => (
                                <LigneCascade key={r.cle} libelle={r.libelle} montant={<PrivateAmount>{formatSigned(-r.montant, { withCurrency: true })}</PrivateAmount>} couleurMontant="text-danger-400" barre={{ gauche: r.gauche, largeur: r.largeur, couleur: 'bg-danger-400' }} />
                            ))}
                            <LigneCascade fort separe libelle="Revenu net fiscal" montant={<PrivateAmount>{formatCAD(report.netIncome)}</PrivateAmount>} barre={{ gauche: 0, largeur: pct(report.netIncome), couleur: 'bg-success-400' }} />
                            {/* [ENG-NET-MODEL-RESIDUAL] Affiché seulement quand il y a un FAIT à montrer (brut SAISI
                                et écart ≥ 1 % du net déclaré). */}
                            {residuelNet?.significatif && (
                                <div className="flex justify-between gap-3 py-2 border-t border-white/6 text-[13px]">
                                    <dt className="text-warning-400">Écart net déclaré ↔ net du modèle (salaire)</dt>
                                    <dd className="font-mono text-warning-400"><PrivateAmount>{formatSigned(residuelNet.residuel, { withCurrency: true })}</PrivateAmount></dd>
                                </div>
                            )}
                        </dl>
                        {residuelNet?.significatif && (
                            <p className="text-tiny text-ink-400 mt-2">Ton brut est saisi à la main et le net que le modèle en déduit ne retombe pas sur ton net déclaré — les projections encaissent le net DÉCLARÉ, l'impôt vient du MODÈLE. Écart positif : le modèle rend plus de net que ta paie (retenues d'employeur type RPP/assurances non modélisées ?). Écart négatif : vérifie le brut et le net au Profil (une des deux saisies est peut-être périmée).</p>
                        )}
                        <p className="text-tiny text-ink-400 mt-3">Net fiscal = imposable − impôts − cotisations (avant régime de retraite et assurances collectives){isGlobal ? ' ; couple : sommé par conjoint' : ''}.</p>
                    </section>

                    {/* Paliers : individuels (vue d'un conjoint, ou solo). */}
                    {!isGlobal && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <Paliers titre="Paliers fédéraux" paliers={fedBreakdown ?? []} couleur="bg-danger-600/80" />
                            <Paliers titre="Paliers provinciaux" paliers={qcBreakdown ?? []} couleur="bg-info-600/80" />
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex flex-col gap-4">
                    <section aria-labelledby="reducteurs-titre" className="rounded-2xl bg-surface border border-white/6 p-4 sm:px-5 sm:py-[18px] flex flex-col gap-2.5">
                        <h2 id="reducteurs-titre" className="text-[17px] lg:text-[16px] font-semibold text-ink-50">Réducteurs d'impôt</h2>
                        <LigneSimple libelle="Cotisation REER" valeur={<PrivateSliderValue revealed={rrspSliderFocus}>{formatCAD(rrspContribution)}</PrivateSliderValue>} />
                        <LigneSimple libelle="CELIAPP" valeur={<PrivateSliderValue revealed={fhsaSliderFocus}>{formatCAD(fhsaContribution)}</PrivateSliderValue>} />
                        {investmentTaxData.totalNonReg > 0 && (
                            <LigneSimple
                                libelle={<span className="flex items-center gap-2">Placements non enregistrés <FxEstimateBadge /></span>}
                                valeur={<span className="text-warning-400"><PrivateAmount>{formatSigned(taxableAddOn, { withCurrency: true })}</PrivateAmount> imposable</span>}
                            />
                        )}
                        {alreadyPaidTax > 0 && (
                            <LigneSimple libelle="Impôt déjà prélevé (documents)" valeur={<PrivateAmount>{formatCAD(alreadyPaidTax)}</PrivateAmount>} />
                        )}
                        {/* Les curseurs (absents des maquettes, gardés) : simuler une cotisation. */}
                        <CollapsibleSection title="Simuler une cotisation" variant="quiet" headingLevel={3}>
                            <div className="space-y-4">
                                <div>
                                    <label className="flex justify-between text-meta text-ink-200 mb-1">
                                        <span>Cotisation REER</span>
                                        <PrivateSliderValue revealed={rrspSliderFocus}>{formatCAD(rrspContribution)}</PrivateSliderValue>
                                    </label>
                                    <input type="range" aria-label="Cotisation REER" min="0" max={RRSP_SLIDER_MAX} step="100" value={rrspContribution} {...maskedSliderAria(isPrivacyMode && !rrspSliderFocus)} onChange={e => setRrspContribution(parseFloat(e.target.value))} onFocus={() => setRrspSliderFocus(true)} onBlur={() => setRrspSliderFocus(false)} className="w-full accent-primary cursor-pointer" />
                                </div>
                                <div>
                                    <label className="flex justify-between text-meta text-ink-200 mb-1">
                                        <span>CELIAPP</span>
                                        <PrivateSliderValue revealed={fhsaSliderFocus}>{formatCAD(fhsaContribution)}</PrivateSliderValue>
                                    </label>
                                    <input type="range" aria-label="CELIAPP" min="0" max={FHSA_ANNUAL_LIMIT_PER_USER} step="100" value={fhsaContribution} {...maskedSliderAria(isPrivacyMode && !fhsaSliderFocus)} onChange={e => setFhsaContribution(parseFloat(e.target.value))} onFocus={() => setFhsaSliderFocus(true)} onBlur={() => setFhsaSliderFocus(false)} className="w-full accent-primary cursor-pointer" />
                                </div>
                            </div>
                        </CollapsibleSection>
                    </section>

                    {/* [TAX-REAL-SPENDING] Le réel des transactions est un agrégat MÉNAGE : en vue d'un seul
                        conjoint, le comparer à SON net serait dominé par le salaire de l'autre. */}
                    <section aria-labelledby="vraie-vie-titre" className="rounded-2xl bg-surface border border-white/6 p-4 sm:px-5 sm:py-[18px] flex flex-col gap-2.5">
                        <h2 id="vraie-vie-titre" className="text-[17px] lg:text-[16px] font-semibold text-ink-50">Dans la vraie vie ({realAverages.fullMonths > 0 ? `${realAverages.fullMonths} derniers mois` : 'transactions'})</h2>
                        {!isGlobal ? (
                            <p className="text-meta text-ink-400">Le réel des transactions est un agrégat du ménage — choisis « Couple » pour le voir.</p>
                        ) : realAverages.fullMonths > 0 ? (
                            <>
                                <LigneSimple libelle="Revenus réels / mois" valeur={<PrivateAmount>{formatCAD(realAverages.incomeAvg)}</PrivateAmount>} />
                                <LigneSimple libelle="Dépenses réelles / mois" valeur={<PrivateAmount>{formatSigned(-realAverages.expenseAvg, { withCurrency: true })}</PrivateAmount>} />
                                <div className="flex justify-between items-center gap-3 pt-2 border-t border-white/6">
                                    <span className="text-body font-semibold text-ink-50">Solde mensuel</span>
                                    <span className={`font-mono font-bold ${realAverages.incomeAvg - realAverages.expenseAvg >= 0 ? 'text-success-400' : 'text-danger-400'}`}>
                                        <PrivateAmount>{formatSigned(realAverages.incomeAvg - realAverages.expenseAvg, { withCurrency: true })}</PrivateAmount>
                                    </span>
                                </div>
                                <p className="text-tiny text-ink-400">
                                    Écart avec le net fiscal : <PrivateAmount>{formatSigned(realAverages.incomeAvg - report.netIncome / 12, { withCurrency: true })}</PrivateAmount> par mois (virements exclus).
                                </p>
                            </>
                        ) : (
                            <p className="text-meta text-ink-400">Aucun mois complet de transactions — importe tes relevés pour voir le réel ici.</p>
                        )}
                    </section>

                    {/* Phase G.4 — Optimisation fiscale couple IA (rendu uniquement si couple) */}
                    <CoupleOptimizationCard />
                </div>
            </div>

            {/* [AI-TAXCENTER-APPLY-NOGATE] Point de contrôle humain : MÊME modal que le chat in-app et que
                le dépôt de talon (diff avant → après). Toute fermeture = refus. */}
            {pendingWrite && (
                <AiChatConfirmModal preview={pendingWrite} onDecision={resolvePendingWrite} />
            )}
        </div>
    );
};

/** Ligne de la cascade « Du brut au net » : libellé, barre (position en % de l'imposable), montant. */
const LigneCascade: React.FC<{
    libelle: string; montant: React.ReactNode; barre: { gauche: number; largeur: number; couleur: string };
    fort?: boolean; separe?: boolean; couleurMontant?: string;
}> = ({ libelle, montant, barre, fort, separe, couleurMontant = 'text-ink-50' }) => (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_120px] items-center gap-x-4 gap-y-1.5 py-2.5 lg:py-0 lg:h-[42px] ${separe ? 'border-t border-white/6' : ''}`}>
        <dt className={`text-[13px] lg:text-body ${fort ? 'font-semibold text-ink-50' : 'text-ink-200'}`}>{libelle}</dt>
        <div className="relative h-2.5 col-span-2 lg:col-span-1 row-start-2 lg:row-start-auto" aria-hidden="true">
            <span className={`absolute inset-y-0 rounded-sm ${barre.couleur}`} style={{ left: `${barre.gauche}%`, width: `max(${barre.largeur}%, 2px)` }} />
        </div>
        <dd className={`font-mono text-right text-[13px] lg:text-body ${fort ? 'font-bold' : ''} ${couleurMontant}`}>{montant}</dd>
    </div>
);

const LigneSimple: React.FC<{ libelle: React.ReactNode; valeur: React.ReactNode }> = ({ libelle, valeur }) => (
    <div className="flex justify-between items-center gap-3 text-body">
        <span className="text-ink-300">{libelle}</span>
        <span className="font-mono text-ink-50 text-right">{valeur}</span>
    </div>
);

type Palier = { rate: string; amount: number; filled: number; max: number | string; percentFull: number };
const Paliers: React.FC<{ titre: string; paliers: Palier[]; couleur: string }> = ({ titre, paliers, couleur }) => (
    <section className="rounded-2xl bg-surface border border-white/6 p-4 sm:p-5">
        <h2 className="text-[17px] font-semibold text-ink-50 mb-3">{titre}</h2>
        <div className="space-y-4">
            {paliers.map((b, i) => (
                <div key={i} className="relative">
                    <div className="flex justify-between text-tiny mb-1">
                        <span className="text-ink-200 font-bold">{b.rate}</span>
                        <PrivateAmount className="text-ink-400">{b.amount > 0 ? `${formatCAD(b.amount)} taxés` : formatCAD(0)}</PrivateAmount>
                    </div>
                    <div className="h-4 w-full bg-surfaceHighlight rounded-sm overflow-hidden relative border border-white/5">
                        <div className={`h-full transition-all duration-500 ${couleur}`} style={{ width: `${b.percentFull}%` }}></div>
                        <PrivateAmount as="div" className="absolute inset-0 flex items-center justify-center text-tiny font-mono text-white/80">
                            {formatCAD(b.filled)} / {typeof b.max === 'number' ? formatCAD(b.max) : `${b.max} $`}
                        </PrivateAmount>
                    </div>
                </div>
            ))}
        </div>
    </section>
);
