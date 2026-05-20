import React, { useState, useMemo } from 'react';
import { PageHeader } from './ui/PageHeader';
import { Card } from './ui/Card';
import { Pill } from './ui/Pill';
import { Button } from './ui/Button';
import { ConfirmModal } from './ui/ConfirmModal';
import { showToast } from './ui/Toast';
import { EmptyState } from './ui/EmptyState';
import { useFinanceStore } from '../store/useFinanceStore';
import { analyzePayslip } from '../services/claude';
import { formatCAD, formatDate } from '../utils/format';
import type { DocumentMeta, DocumentCategory } from '../types';

/**
 * Phase G.1 — onglet Documents global.
 *
 * Centralise tous les uploads PDF/Image qui étaient auparavant éparpillés
 * dans TaxCenter (fiche de paie) et Configuration (relevés). Stocke les
 * MÉTADONNÉES (nom, type, date, extraction IA) sans persister les blobs
 * pour respecter le quota localStorage. Les fichiers sont processés à
 * l'upload ; l'utilisateur peut re-uploader si besoin de re-process.
 *
 * Une extension future utilisera IndexedDB pour stocker les blobs binaires.
 */

const CATEGORY_LABELS: Record<DocumentCategory, { label: string; icon: string }> = {
    PAYSLIP: { label: 'Fiche de paie', icon: '💰' },
    T4: { label: 'T4 / Relevé 1', icon: '📋' },
    BANK_STATEMENT: { label: 'Relevé bancaire', icon: '🏦' },
    CONTRACT: { label: 'Contrat', icon: '📝' },
    INVOICE: { label: 'Facture', icon: '🧾' },
    OTHER: { label: 'Autre', icon: '📄' },
};

const ACCEPTED_MIME = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const EMPTY_DOCS: DocumentMeta[] = [];

export const Documents: React.FC = () => {
    // Selector qui renvoie la même référence si undefined — évite la boucle infinie
    // causée par `?? []` qui crée un nouveau tableau à chaque rendu.
    const documentsFromStore = useFinanceStore(s => s.documents);
    const documents = documentsFromStore ?? EMPTY_DOCS;
    const setAppState = useFinanceStore(s => s.setAppState);
    const apiKey = useFinanceStore(s => s.apiKeys.anthropic);

    const [filter, setFilter] = useState<DocumentCategory | 'ALL'>('ALL');
    const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('PAYSLIP');
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStatus, setProcessingStatus] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const filteredDocs = useMemo(() => {
        const sorted = [...documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
        if (filter === 'ALL') return sorted;
        return sorted.filter(d => d.category === filter);
    }, [documents, filter]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const files = Array.from(e.target.files);

        for (const file of files) {
            if (file.size > MAX_SIZE_BYTES) {
                showToast(`${file.name} : trop volumineux (max 5 MB).`, 'error');
                continue;
            }

            setIsProcessing(true);
            setProcessingStatus(`Traitement de ${file.name}…`);

            let extractedData: Record<string, unknown> | undefined;

            // Si Payslip et clé Anthropic présente : extraction Vision Claude
            if (uploadCategory === 'PAYSLIP' && apiKey) {
                try {
                    setProcessingStatus(`Analyse IA de ${file.name}…`);
                    const result = await analyzePayslip(file, apiKey);
                    extractedData = result as unknown as Record<string, unknown>;
                    showToast(`${file.name} analysé : ${result.frequency}, brut ${formatCAD(result.grossPeriod)}`, 'success');
                } catch (err) {
                    console.warn('[Documents] analyzePayslip failed:', err);
                    showToast(`${file.name} : extraction IA échouée — métadonnées enregistrées seulement.`, 'info');
                }
            }

            const newDoc: DocumentMeta = {
                id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                name: file.name,
                category: uploadCategory,
                uploadedAt: new Date().toISOString(),
                sizeBytes: file.size,
                mimeType: file.type,
                extractedData,
            };

            setAppState({ documents: [...documents, newDoc] });
        }

        setIsProcessing(false);
        setProcessingStatus('');
        e.target.value = ''; // reset pour permettre re-upload même fichier
    };

    const handleDelete = () => {
        if (!confirmDeleteId) return;
        setAppState({ documents: documents.filter(d => d.id !== confirmDeleteId) });
        showToast('Document supprimé.', 'info');
        setConfirmDeleteId(null);
    };

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <ConfirmModal
                isOpen={!!confirmDeleteId}
                onConfirm={handleDelete}
                onCancel={() => setConfirmDeleteId(null)}
                title="Supprimer le document"
                message="Supprimer ce document définitivement ? Les données extraites par IA seront perdues."
                confirmLabel="Supprimer"
            />

            <PageHeader
                icon="📁"
                title="Documents"
                subtitle="Hub central des relevés, contrats et fiches fiscales. Extraction IA automatique pour les fiches de paie."
            />

            {/* Upload zone */}
            <Card title="📥 Téléverser un document">
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-tiny text-gray-400 uppercase font-bold mb-1">Catégorie</label>
                            <select
                                value={uploadCategory}
                                onChange={(e) => setUploadCategory(e.target.value as DocumentCategory)}
                                disabled={isProcessing}
                                className="w-full bg-dark border border-white/10 rounded px-3 py-2 text-white focus:border-primary outline-none"
                            >
                                {(Object.keys(CATEGORY_LABELS) as DocumentCategory[]).map(cat => (
                                    <option key={cat} value={cat}>{CATEGORY_LABELS[cat].icon} {CATEGORY_LABELS[cat].label}</option>
                                ))}
                            </select>
                            {uploadCategory === 'PAYSLIP' && apiKey && (
                                <p className="text-tiny text-info-400 mt-1 italic">
                                    ✨ Extraction IA Vision activée pour les fiches de paie
                                </p>
                            )}
                            {uploadCategory === 'PAYSLIP' && !apiKey && (
                                <p className="text-tiny text-amber-400 mt-1 italic">
                                    ℹ️ Configure ta clé Anthropic dans Configuration pour l'extraction IA
                                </p>
                            )}
                        </div>
                    </div>

                    <label className={`flex flex-col items-center justify-center w-full h-32 rounded-card border-2 border-dashed cursor-pointer transition-colors ${
                        isProcessing
                            ? 'border-amber-400/40 bg-amber-400/5'
                            : 'border-white/15 bg-white/[0.02] hover:border-primary/40 hover:bg-primary/5'
                    }`}>
                        <input
                            type="file"
                            multiple
                            accept={ACCEPTED_MIME}
                            onChange={handleUpload}
                            disabled={isProcessing}
                            className="sr-only"
                        />
                        <span className="text-2xl mb-2" aria-hidden="true">{isProcessing ? '⏳' : '📥'}</span>
                        <span className="text-meta font-medium text-ink-200">
                            {isProcessing ? processingStatus : 'Cliquer ou glisser des fichiers ici'}
                        </span>
                        {!isProcessing && (
                            <span className="text-tiny text-ink-500 mt-1">JPG, PNG, WebP, PDF — max 5 MB</span>
                        )}
                    </label>

                    <p className="text-tiny text-gray-500 italic">
                        💡 Seules les <strong>métadonnées</strong> et les <strong>données extraites par IA</strong>
                        sont stockées localement. Les blobs binaires ne sont pas conservés (limite localStorage).
                    </p>
                </div>
            </Card>

            {/* Filter + Documents list */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="text-meta text-ink-300">
                    <strong className="text-ink-50">{documents.length}</strong> document{documents.length > 1 ? 's' : ''} enregistré{documents.length > 1 ? 's' : ''}
                </div>
                <Pill
                    aria-label="Filtre catégorie"
                    size="sm"
                    value={filter}
                    onChange={(v) => setFilter(v as DocumentCategory | 'ALL')}
                    options={[
                        { value: 'ALL', label: 'Tout', icon: '📂' },
                        ...(Object.keys(CATEGORY_LABELS) as DocumentCategory[]).map(cat => ({
                            value: cat,
                            label: CATEGORY_LABELS[cat].label,
                            icon: CATEGORY_LABELS[cat].icon,
                        })),
                    ]}
                />
            </div>

            {filteredDocs.length === 0 ? (
                <EmptyState
                    icon="📁"
                    title={documents.length === 0 ? 'Aucun document' : 'Aucun document dans cette catégorie'}
                    description={documents.length === 0 ? "Téléverse ton premier relevé via le formulaire ci-dessus." : "Change de filtre ou téléverse un nouveau document."}
                />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredDocs.map(doc => {
                        const cat = CATEGORY_LABELS[doc.category];
                        return (
                            <div key={doc.id} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-primary/30 transition-colors group">
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-2xl shrink-0" aria-hidden="true">{cat.icon}</span>
                                        <div className="min-w-0">
                                            <div className="font-bold text-white text-sm truncate" title={doc.name}>{doc.name}</div>
                                            <div className="text-tiny text-ink-500">{cat.label}</div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(doc.id)}
                                        aria-label={`Supprimer ${doc.name}`}
                                        className="text-ink-500 hover:text-red-400 transition-colors p-1 rounded opacity-0 group-hover:opacity-100 focus-ring"
                                    >
                                        🗑️
                                    </button>
                                </div>
                                <div className="text-tiny text-ink-400 space-y-1">
                                    <div>📅 {formatDate(doc.uploadedAt)}</div>
                                    <div>📦 {(doc.sizeBytes / 1024).toFixed(1)} KB · {doc.mimeType.split('/').pop()?.toUpperCase()}</div>
                                </div>
                                {doc.extractedData && (
                                    <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
                                        <div className="text-tiny text-info-400 uppercase font-bold mb-1 flex items-center gap-1">
                                            <span aria-hidden="true">✨</span> Extraction IA
                                        </div>
                                        {Object.entries(doc.extractedData).slice(0, 4).map(([k, v]) => (
                                            <div key={k} className="text-tiny flex justify-between gap-2">
                                                <span className="text-ink-500 truncate">{k}</span>
                                                <span className="text-ink-200 font-mono truncate">
                                                    {typeof v === 'number' ? formatCAD(v) : String(v)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
