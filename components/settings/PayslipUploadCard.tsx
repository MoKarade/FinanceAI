import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Icon } from '../ui/Icon';
import { analyzePayslip } from '../../services/claude';
import { showToast } from '../ui/Toast';
import { Card } from '../ui/Card';
import { useFinanceStore } from '../../store/useFinanceStore';
import { formatCAD } from '../../utils/format';
import { logError } from '../../services/errorLogger';
import { importWithRetry } from '../../utils/lazyWithRetry';
import { PrivateAmount } from '../ui/PrivateAmount';
import { AiChatConfirmModal } from '../aiChat/AiChatConfirmModal';
import type { WritePreview, WriteDecision } from '../../services/aiTools/writeExecutor';

/**
 * Phase C.2 — upload IA de relevé de salaire dans le Hub Configuration.
 *
 * Réutilise `analyzePayslip` (Claude Sonnet Vision) déjà utilisé dans TaxCenter.
 *
 * [AI-VISION-PAYSLIP-NOGATE] L'écriture passe par le MÊME chemin que le chat in-app
 * (`executeWriteTool` + `apply_payslip` + `AiChatConfirmModal`) : diff avant → après MONTRÉ,
 * on attend le clic, recalcul sur état FRAIS, sauvegarde IndexedDB AVANT d'écrire (échec du
 * backup = pas d'écriture). Avant : `setAppState` direct sur `config.users[N]` — aucune
 * confirmation, aucun backup, aucune garde > 0, alors qu'une hallucination OCR écrase le profil
 * salarial qui alimente TOUTE l'app (fiscalité + projection). C'était l'INCOHÉRENCE entre les deux
 * surfaces qui était le bug.
 *
 * Le composant choisit l'utilisateur cible via un radio (user1 / user2 si couple).
 */

interface PayslipUploadCardProps {
    targetUserIndex?: 0 | 1; // 0 par défaut ; couple-aware via radio interne
    /** Classe optionnelle pour le conteneur Card (ex. `h-full` en grille). */
    className?: string;
}

export const PayslipUploadCard: React.FC<PayslipUploadCardProps> = ({ targetUserIndex: initialTarget = 0, className = '' }) => {
    const apiKey = useFinanceStore(s => s.apiKeys.anthropic);
    const config = useFinanceStore(s => s.config);
    const isPrivacyMode = useFinanceStore(s => s.isPrivacyMode);

    const [target, setTarget] = useState<0 | 1>(initialTarget);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [status, setStatus] = useState<string>('');
    const [result, setResult] = useState<{ gross: number; net: number; tax: number; freq: string } | null>(null);

    // [AI-VISION-PAYSLIP-NOGATE] Même mécanique que le chat in-app : le diff attend le clic, la
    // promesse est résolue par le modal (fermer = refuser, jamais de promesse pendante orpheline).
    const [pendingWrite, setPendingWrite] = useState<WritePreview | null>(null);
    const writeResolverRef = useRef<((d: WriteDecision) => void) | null>(null);

    const resolvePendingWrite = useCallback((decision: WriteDecision) => {
        const resolve = writeResolverRef.current;
        writeResolverRef.current = null;
        setPendingWrite(null);
        resolve?.(decision);
    }, []);

    const requestConfirmation = useCallback((preview: WritePreview): Promise<WriteDecision> => {
        return new Promise((resolve) => {
            writeResolverRef.current = resolve;
            setPendingWrite(preview);
        });
    }, []);

    // [A11Y-PRIVACY-TAXCENTER — fuite jumelle] Le modal de confirmation AFFICHE des montants : si le
    // mode discret s'active pendant l'attente, l'écriture en attente est REFUSÉE (même règle que
    // `useAiChat` : « fermer = refus »). L'utilisateur redemande hors mode discret.
    useEffect(() => {
        if (isPrivacyMode && writeResolverRef.current) resolvePendingWrite('cancel');
    }, [isPrivacyMode, pendingWrite, resolvePendingWrite]);

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

            // [AI-VISION-PAYSLIP-NOGATE] GARDE de dernier recours avant toute proposition d'écriture :
            // le schéma Zod borne déjà la réponse Vision (AI-PAYSLIP-SCHEMA-UNBOUNDED), mais c'est ICI
            // que les montants sont MULTIPLIÉS par la fréquence — un produit non fini ou ≤ 0 ne doit
            // jamais atteindre le profil salarial. Rejet HONNÊTE (message), pas de valeur de repli.
            const usable = [annualGross, annualNet].every(v => Number.isFinite(v) && v > 0);
            if (!usable) {
                logError({
                    source: 'ai', severity: 'warning',
                    message: 'Talon de paie : montants annualisés non exploitables (≤ 0 ou non finis) — écriture REFUSÉE',
                    context: { frequency: res.frequency, grossFinite: Number.isFinite(annualGross), netFinite: Number.isFinite(annualNet) },
                });
                setStatus('');
                showToast('Montants illisibles sur ce relevé (brut/net ≤ 0). Rien n\'a été modifié.', 'error');
                return;
            }

            // Écriture par le chemin STANDARD du dépôt : diff pur → modal de confirmation → recalcul
            // sur état frais → backup → setAppState. Chargé à la demande (le spec + l'exécuteur
            // n'entrent dans aucun chunk de boot ; même protection anti-chunk-périmé que le chat).
            const [{ executeWriteTool }, { applyPayslipSpec }] = await importWithRetry(
                () => Promise.all([
                    import('../../services/aiTools/writeExecutor'),
                    import('../../mcp/tools/applyPayslip.spec'),
                ]),
                'payslipWrite',
            );
            setStatus('');
            // Spec du dépôt, ré-estampillée pour CETTE surface : provenance 'payslip' (dépôt in-app)
            // au lieu du défaut 'mcp' (connecteur). Explicite, pour ne pas dépendre du spread interne
            // de `toDocument` — la parité du reste du payload reste garantie par le spec partagé.
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
                    userIndex: target,
                    // Le spec attend de l'ANNUEL et STOCKE en mensuel (annualSalaryToMonthly côté
                    // applyDocument) — la conversion vit à UN seul endroit, plus de copie locale.
                    grossAnnual: annualGross,
                    netAnnual: annualNet,
                    // [INCOME-PROVENANCE] nom du fichier = étiquette de la source du revenu
                    // (même troncature que le chemin MCP).
                    employer: file.name.slice(0, 120),
                },
                requestConfirmation,
            );

            // Contrat de `executeWriteTool` : un bloc texte JSON ({ applied, refusedByUser, … }).
            // Illisible → on n'affirme RIEN (jamais un « mis à jour » fabriqué).
            let applied = false;
            let refused = false;
            try {
                const payload = JSON.parse(toolResult.content[0]?.text ?? '{}') as {
                    applied?: boolean; refusedByUser?: boolean; backupFailed?: boolean;
                };
                applied = payload.applied === true;
                refused = payload.refusedByUser === true || payload.backupFailed === true;
            } catch (parseErr) {
                logError({ source: 'ai', severity: 'warning', message: 'Talon de paie : résultat d\'écriture illisible', error: parseErr });
            }

            if (applied) {
                setResult({ gross: annualGross, net: annualNet, tax: annualTax, freq: res.frequency });
                showToast(`Profil ${target === 0 ? 'principal' : 'conjoint'} mis à jour.`, 'success');
            } else if (refused) {
                showToast('Modification annulée — ton profil est inchangé.', 'info');
            } else {
                showToast('Aucune modification à appliquer (valeurs déjà à jour).', 'info');
            }
        } catch (err) {
            logError({ source: 'ai', severity: 'error', message: 'Analyse talon de paie (Vision) échouée', error: err });
            setStatus('');
            showToast('Analyse échouée. Vérifie le fichier (JPG/PNG/PDF) et ta clé Anthropic.', 'error');
        } finally {
            setIsAnalyzing(false);
            // Reset l'input pour permettre re-upload du même fichier
            e.target.value = '';
        }
    };

    return (
        <Card icon={<Icon name="document" size={18} />} title="Upload relevé de salaire (IA Vision)" className={className}>
            <div className="space-y-4">
                <p className="text-meta text-ink-400">
                    Relevé (image/PDF) → l'IA Vision extrait brut, net, impôt et fréquence, et remplit le profil.
                </p>
                {/* [SEC-VISION-CONSENT-INJECTION] Loi 25 : consentement éclairé — la fiche de paie (nom,
                    employeur, salaire exact) part BRUTE chez Anthropic (pas tronquée/arrondie comme la
                    catégorisation texte). À dire explicitement avant l'envoi. */}
                <p className="text-tiny text-amber-300/90 bg-amber-900/10 border border-warning-500/20 rounded-lg px-3 py-2">
                    Confidentialité : la fiche de paie (image/PDF) est envoyée à Anthropic (Claude) pour en
                    extraire les montants — elle contient des données personnelles (nom, employeur, salaire exact).
                </p>

                {isCouple && (
                    <div className="flex gap-2" role="radiogroup" aria-label="Profil cible du relevé">
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

                <label className={`group flex flex-col items-center justify-center w-full h-36 rounded-card border-2 border-dashed cursor-pointer transition-all duration-300 ${
                    isAnalyzing
                        ? 'border-warning-400/40 bg-warning-400/5'
                        : 'border-white/15 bg-white/[0.02] hover:border-primary/40 hover:bg-primary/5'
                }`}>
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={handleFiles}
                        disabled={isAnalyzing}
                        aria-label="Importer un relevé de salaire (image ou PDF)"
                        className="sr-only"
                    />
                    <span className="mb-2 transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-0.5" aria-hidden="true"><Icon name={isAnalyzing ? 'clock' : 'document'} size={28} className="text-ink-300" /></span>
                    <span className="text-meta font-medium text-ink-200">
                        {isAnalyzing ? status : 'Cliquer ou glisser un fichier'}
                    </span>
                    {!isAnalyzing && (
                        <span className="text-tiny text-ink-400 mt-1">JPG · PNG · WebP · PDF</span>
                    )}
                </label>

                {/* [A11Y-PRIVACY-TAXCENTER — fuite JUMELLE mesurée] Ce récapitulatif (partagé entre
                    Réglages et le gate de setup) affichait Brut/Net/Impôt en clair, sans aucune
                    référence au mode discret. Primitive du dépôt : la valeur SORT du DOM. */}
                {result && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-card bg-success-500/10 border border-success-500/30">
                        <div>
                            <div className="text-tiny text-ink-400 uppercase tracking-wider">Brut/an</div>
                            <PrivateAmount as="div" className="text-meta font-bold text-emerald-300 font-mono">{formatCAD(result.gross)}</PrivateAmount>
                        </div>
                        <div>
                            <div className="text-tiny text-ink-400 uppercase tracking-wider">Net/an</div>
                            <PrivateAmount as="div" className="text-meta font-bold text-info-400 font-mono">{formatCAD(result.net)}</PrivateAmount>
                        </div>
                        <div>
                            <div className="text-tiny text-ink-400 uppercase tracking-wider">Impôt/an</div>
                            <PrivateAmount as="div" className="text-meta font-bold text-amber-300 font-mono">{formatCAD(result.tax)}</PrivateAmount>
                        </div>
                        <div>
                            <div className="text-tiny text-ink-400 uppercase tracking-wider">Fréquence</div>
                            <div className="text-meta font-bold text-ink-200">{result.freq}</div>
                        </div>
                    </div>
                )}
            </div>
            {/* [AI-VISION-PAYSLIP-NOGATE] Point de contrôle humain : MÊME modal que le chat in-app
                (diff avant → après). Toute fermeture = refus ; l'écriture et sa sauvegarde ne
                partent qu'après « Appliquer ». */}
            {pendingWrite && (
                <AiChatConfirmModal preview={pendingWrite} onDecision={resolvePendingWrite} />
            )}
        </Card>
    );
};
