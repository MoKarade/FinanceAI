// services/claude.ts
// Phase 4 A1 — équivalent Anthropic du services/gemini.ts.
//
// Garde le MÊME contrat public que gemini.ts pour que les consumers
// (AiAssistant, BudgetAiModal, Transactions, TaxCenter, Planning) puissent
// migrer en simple changement d'import.
//
// Décisions par usage (cf docs/PLAN_PHASE_4.md §3):
//   - chat / chatStream      → claude-sonnet-4-6  (équilibre qualité/coût)
//   - categorizeBatch        → claude-haiku-4-5   (vitesse, gros volumes)
//   - analyzeBudget          → claude-sonnet-4-6
//   - generateSmartGoals     → claude-sonnet-4-6
//   - detectSubscriptions    → claude-haiku-4-5

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { Transaction, RecurringItem, FinancialGoal, GoalType } from '../types';

// ─── Modèles ─────────────────────────────────────────────────────────────────

const MODEL_SONNET = 'claude-sonnet-4-6';
const MODEL_HAIKU = 'claude-haiku-4-5-20251001';

// ─── Privacy hardening (préservé tel quel depuis gemini.ts) ──────────────────

const sanitizePayee = (raw: string): string => {
    if (!raw) return '';
    // eslint-disable-next-line no-control-regex
    return raw
        .replace(/[\x00-\x1F\x7F]/g, ' ')
        .replace(/["\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60);
};

const roundToHundred = (amount: number): number => {
    if (!isFinite(amount)) return 0;
    return Math.round(amount / 100) * 100;
};

// ─── Schémas Zod ─────────────────────────────────────────────────────────────

const CategorizeItemSchema = z.object({
    id: z.number(),
    category: z.string(),
    isTransfer: z.boolean(),
    confidence: z.number(),
});
const CategorizeArraySchema = z.array(CategorizeItemSchema);

const SubscriptionItemSchema = z.object({
    payee: z.string(),
    averageAmount: z.number(),
    dayOfMonth: z.number(),
    category: z.string(),
    lastDate: z.string(),
    yearlyCost: z.number(),
});
const SubscriptionArraySchema = z.array(SubscriptionItemSchema);

const SmartGoalItemSchema = z.object({
    name: z.string(),
    type: z.enum(['NET_WORTH', 'CELI', 'REER', 'LIQUIDITY', 'CUSTOM']),
    targetAmount: z.number(),
    deadline: z.string(),
    rationale: z.string(),
    actionPlan: z.array(z.string()),
    monthlyContributionReq: z.number().optional(),
    targetAccount: z.enum(['CELI', 'REER', 'NON-ENREG', 'CRYPTO']).optional(),
});
const SmartGoalArraySchema = z.array(SmartGoalItemSchema);

const BudgetAnalysisArraySchema = z.array(z.string());

const safeJsonValidate = <S extends z.ZodTypeAny>(text: string, schema: S): z.infer<S> | null => {
    try {
        // Claude renvoie parfois du JSON entouré de ```json ... ``` — on nettoie.
        const cleaned = text
            .trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```\s*$/i, '');
        const parsed = JSON.parse(cleaned);
        return schema.parse(parsed);
    } catch (e) {
        console.warn('[Claude] JSON validation failed:', e, 'raw:', text.slice(0, 200));
        return null;
    }
};

// ─── Contexte fiscal commun ──────────────────────────────────────────────────

const QUEBEC_FISCAL_CONTEXT = `
Tu es un expert en finances personnelles QUEBEC/CANADA 2026. Tu utilises:
- CELI (compte épargne libre d'impôt) plutôt que TFSA
- REER (régime enregistré épargne-retraite) plutôt que RRSP
- CELIAPP (FHSA) pour première propriété
- RRQ (régime rentes Québec) au lieu de CPP
- PSV (pension sécurité vieillesse) au lieu de OAS
- Contexte fiscal Quebec: paliers fed (14/20.5/26/29/33%) + QC (14/19/24/25.75%)
`;

// ─── Client factory ──────────────────────────────────────────────────────────

const makeClient = (apiKey: string): Anthropic => {
    return new Anthropic({
        apiKey,
        // Phase 4 décision §3 Q3 — on reste client-side. Le backend proxy
        // viendra plus tard si besoin (cf PLAN_PHASE_4.md §6).
        dangerouslyAllowBrowser: true,
    });
};

// ─── Public API ──────────────────────────────────────────────────────────────

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

/**
 * Appel Claude en one-shot. Retourne le texte complet quand prêt.
 * Use case: appels courts (analyses ponctuelles), background tasks.
 */
// §7.C.2 — Timeout par défaut sur tous les appels Claude (évite UI bloquée
// si la connexion gèle ou si le modèle hallucine longtemps).
const DEFAULT_CLAUDE_TIMEOUT_MS = 30_000;

/**
 * Crée un AbortSignal qui combine un signal externe (optionnel) ET un timeout.
 * Si l'externe abort en premier → on relaye. Si timeout en premier → on abort.
 */
function makeTimeoutSignal(externalSignal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(new Error(`Claude timeout après ${timeoutMs}ms`)), timeoutMs);
    let externalListener: (() => void) | undefined;
    if (externalSignal) {
        if (externalSignal.aborted) ctrl.abort(externalSignal.reason);
        else {
            externalListener = () => ctrl.abort(externalSignal.reason);
            externalSignal.addEventListener('abort', externalListener, { once: true });
        }
    }
    return {
        signal: ctrl.signal,
        cleanup: () => {
            clearTimeout(timeoutId);
            if (externalSignal && externalListener) {
                externalSignal.removeEventListener('abort', externalListener);
            }
        },
    };
}

export async function chat(
    messages: ChatMessage[],
    apiKey: string,
    options: { system?: string; model?: string; maxTokens?: number; temperature?: number; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<string> {
    if (!apiKey) throw new Error('Clé API Anthropic manquante.');
    const client = makeClient(apiKey);
    const { signal, cleanup } = makeTimeoutSignal(options.signal, options.timeoutMs ?? DEFAULT_CLAUDE_TIMEOUT_MS);
    try {
        const response = await client.messages.create({
            model: options.model ?? MODEL_SONNET,
            max_tokens: options.maxTokens ?? 1024,
            temperature: options.temperature ?? 0.7,
            system: options.system,
            messages,
        }, { signal });
        // La réponse Anthropic est un array de content blocks; on concatène les text.
        return response.content
            .filter(block => block.type === 'text')
            .map(block => (block as { type: 'text'; text: string }).text)
            .join('');
    } finally {
        cleanup();
    }
}

/**
 * Appel Claude en streaming. Retourne un async iterable de chunks de texte.
 * Use case: AiAssistant — affichage progressif token par token.
 * §7.C.2 — supporte signal externe (bouton "Annuler") + timeout default 30s.
 */
export async function* chatStream(
    messages: ChatMessage[],
    apiKey: string,
    options: { system?: string; model?: string; maxTokens?: number; temperature?: number; signal?: AbortSignal; timeoutMs?: number } = {},
): AsyncGenerator<string> {
    if (!apiKey) throw new Error('Clé API Anthropic manquante.');
    const client = makeClient(apiKey);
    const { signal, cleanup } = makeTimeoutSignal(options.signal, options.timeoutMs ?? DEFAULT_CLAUDE_TIMEOUT_MS);
    try {
        const stream = client.messages.stream({
            model: options.model ?? MODEL_SONNET,
            max_tokens: options.maxTokens ?? 2048,
            temperature: options.temperature ?? 0.7,
            system: options.system,
            messages,
        }, { signal });
        for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                yield event.delta.text;
            }
        }
    } finally {
        cleanup();
    }
}

// ─── Catégorisation batch (compat gemini.ts) ─────────────────────────────────

const cleanMerchantName = (raw: string): string => sanitizePayee(raw);

const isDefiniteTransfer = (payee: string, amount: number): boolean => {
    const p = (payee || '').toLowerCase();
    return /transfert|virement|interac/.test(p) || (Math.abs(amount) > 5000 && /paiement carte/.test(p));
};

export const categorizeBatch = async (
    transactions: Transaction[],
    apiKey: string,
    history: Transaction[] = [],
    allowedCategories: string[] = [],
    onProgress?: (current: number, total: number, msg: string, processedChunk: Transaction[]) => void,
): Promise<Transaction[]> => {
    if (!apiKey || transactions.length === 0) return transactions;

    const safeCategories = allowedCategories.length > 0
        ? allowedCategories
        : ['Alimentation', 'Transport', 'Logement', 'Loisir', 'Sante', 'Autre', 'Transfert'];

    const CHUNK_SIZE = 50;
    const out: Transaction[] = [];
    let processed = 0;

    for (let i = 0; i < transactions.length; i += CHUNK_SIZE) {
        const chunk = transactions.slice(i, i + CHUNK_SIZE);

        // Filtre les transferts évidents avant l'appel LLM
        const toAnalyze = chunk.filter(t => !isDefiniteTransfer(t.payee || '', t.amount));
        const obvious = chunk.filter(t => isDefiniteTransfer(t.payee || '', t.amount))
            .map(t => ({ ...t, category: 'Transfert' as string, isTransfer: true, isAiProcessed: true, confidence: 100, status: 'processed' as const }));
        out.push(...obvious);

        if (toAnalyze.length === 0) {
            processed += chunk.length;
            onProgress?.(processed, transactions.length, `${chunk.length} transferts évidents.`, obvious);
            continue;
        }

        const txList = toAnalyze.map(t => `- {id: ${t.id}, payee: "${cleanMerchantName(t.payee || '')}", amount: ${roundToHundred(t.amount)}}`).join('\n');

        const userPrompt = `CATÉGORIES AUTORISÉES (utilise UNIQUEMENT ces valeurs): ${JSON.stringify(safeCategories)}.

Transactions à catégoriser (montants arrondis à 100$):
${txList}

Règle: Si tu ne peux pas déterminer la catégorie avec >50% de confiance, utilise "Autre".
RÉPONDS UNIQUEMENT avec un JSON Array strict, sans markdown, sans commentaire:
[{ "id": number, "category": string, "isTransfer": boolean, "confidence": number }]`;

        try {
            const text = await chat(
                [{ role: 'user', content: userPrompt }],
                apiKey,
                { model: MODEL_HAIKU, system: QUEBEC_FISCAL_CONTEXT, maxTokens: 4096, temperature: 0 },
            );
            const validated = safeJsonValidate(text, CategorizeArraySchema);
            if (validated) {
                const byId = new Map(validated.map(v => [v.id, v]));
                const merged = toAnalyze.map(t => {
                    const r = byId.get(t.id);
                    if (!r) return t;
                    return {
                        ...t,
                        category: r.category,
                        isTransfer: r.isTransfer,
                        confidence: r.confidence,
                        isAiProcessed: true,
                        status: 'processed' as const,
                    };
                });
                out.push(...merged);
            } else {
                out.push(...toAnalyze);
            }
        } catch (e) {
            console.error('[Claude] categorizeBatch chunk failed:', e);
            out.push(...toAnalyze);
        }

        processed += chunk.length;
        onProgress?.(processed, transactions.length, `Traité ${processed}/${transactions.length}`, out);
    }

    return out;
};

// ─── Détection abonnements (compat gemini.ts) ────────────────────────────────

export const detectSubscriptionsAI = async (
    transactions: Transaction[],
    apiKey: string,
): Promise<RecurringItem[]> => {
    if (!apiKey || transactions.length === 0) return [];

    const sample = transactions.slice(0, 200)
        .map(t => `${t.date}: ${cleanMerchantName(t.payee || '')} (${roundToHundred(t.amount)}$)`)
        .join('\n');

    const userPrompt = `Voici l'historique des transactions (dates + marchand + montant arrondi). Identifie les ABONNEMENTS RÉCURRENTS (Netflix, Spotify, hypothèque, gym...).

${sample}

Pour chaque abonnement, calcule le coût annuel approximatif et la catégorie (Loisir/Logement/etc.).
RÉPONDS UNIQUEMENT avec un JSON Array strict (pas de markdown):
[{
  "payee": string,
  "averageAmount": number,
  "dayOfMonth": number,
  "category": string,
  "lastDate": "YYYY-MM-DD",
  "yearlyCost": number
}]`;

    try {
        const text = await chat(
            [{ role: 'user', content: userPrompt }],
            apiKey,
            { model: MODEL_HAIKU, system: QUEBEC_FISCAL_CONTEXT, maxTokens: 2048, temperature: 0 },
        );
        const validated = safeJsonValidate(text, SubscriptionArraySchema);
        return validated ?? [];
    } catch (e) {
        console.error('[Claude] detectSubscriptionsAI failed:', e);
        return [];
    }
};

// ─── Conseil investissement (compat gemini.ts) ───────────────────────────────

export const getInvestmentAdvice = async (holdings: string, apiKey: string): Promise<string> => {
    if (!apiKey) return 'Clé API Anthropic requise.';
    try {
        return await chat(
            [{ role: 'user', content: `Voici mes placements actuels:\n${holdings}\n\nDonne-moi 3 recommandations concrètes pour rééquilibrer mon portefeuille (max 4 phrases au total).` }],
            apiKey,
            { system: QUEBEC_FISCAL_CONTEXT, maxTokens: 512, temperature: 0.7 },
        );
    } catch (e) {
        console.error('[Claude] getInvestmentAdvice failed:', e);
        return 'Erreur lors de l\'analyse. Vérifie ta clé API.';
    }
};

// ─── Génération objectifs intelligents (compat gemini.ts) ────────────────────

export const generateSmartGoals = async (
    profile: { netWorth: number; monthlyIncome: number; age: number; existingGoals: FinancialGoal[]; topPriority: string },
    apiKey: string,
): Promise<FinancialGoal[]> => {
    if (!apiKey) return [];
    const userPrompt = `Profil financier:
- Patrimoine net: ${roundToHundred(profile.netWorth)}$
- Revenu mensuel: ${roundToHundred(profile.monthlyIncome)}$
- Âge: ${profile.age} ans
- Priorité utilisateur: ${profile.topPriority || 'aucune'}
- Objectifs existants: ${profile.existingGoals.map(g => g.name).join(', ') || 'aucun'}

Suggère 3 objectifs financiers SMART pour cette personne, complémentaires (pas de doublon avec les existants).
RÉPONDS UNIQUEMENT avec un JSON Array strict (pas de markdown):
[{
  "name": string,
  "type": "NET_WORTH"|"CELI"|"REER"|"LIQUIDITY"|"CUSTOM",
  "targetAmount": number,
  "deadline": "YYYY-MM-DD",
  "rationale": string (max 1 phrase),
  "actionPlan": [string, string, string],
  "monthlyContributionReq"?: number,
  "targetAccount"?: "CELI"|"REER"|"NON-ENREG"|"CRYPTO"
}]`;

    try {
        const text = await chat(
            [{ role: 'user', content: userPrompt }],
            apiKey,
            { system: QUEBEC_FISCAL_CONTEXT, maxTokens: 2048, temperature: 0.5 },
        );
        const validated = safeJsonValidate(text, SmartGoalArraySchema);
        if (!validated) return [];
        // Map vers FinancialGoal complet (id + status par défaut)
        return validated.map(v => ({
            id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: v.name,
            type: v.type as GoalType,
            targetAmount: v.targetAmount,
            deadline: v.deadline,
            rationale: v.rationale,
            actionPlan: v.actionPlan,
            monthlyContributionReq: v.monthlyContributionReq,
            targetAccount: v.targetAccount,
            status: 'suggestion' as const,
        }));
    } catch (e) {
        console.error('[Claude] generateSmartGoals failed:', e);
        return [];
    }
};

// ─── Diagnostic budget (compat gemini.ts analyzeBudgetAI) ────────────────────

export const analyzeBudgetAI = async (
    budgetData: {
        totalNetIncome: number;
        totalBudget: number;
        totalSpent: number;
        alerts: string[];
        categories: { name: string; target: number; spent: number; nature: string }[];
    },
    apiKey: string,
): Promise<string[]> => {
    if (!apiKey) return ['Clé API Anthropic requise pour le diagnostic IA.'];

    const userPrompt = `AGIS COMME UN CONSEILLER FINANCIER QUÉBÉCOIS EXPERT, STRICT ET BIENVEILLANT.
Analyse ce budget mensuel et fournis EXACTEMENT 3 recommandations courtes (1-2 phrases max) très concrètes et orientées action.

DONNÉES DU MOIS (montants arrondis à 100$):
- Revenu net mensuel: ${roundToHundred(budgetData.totalNetIncome)}$
- Budget prévu: ${roundToHundred(budgetData.totalBudget)}$
- Dépenses réelles: ${roundToHundred(budgetData.totalSpent)}$
- Alertes de dépassement: ${budgetData.alerts.length > 0 ? budgetData.alerts.join(', ') : 'Aucune'}

DÉTAIL DES CATÉGORIES (Prévu vs Réel, arrondis à 100$):
${budgetData.categories.map(c => `- ${c.name} (${c.nature}): ${roundToHundred(c.target).toFixed(0)}$ prévu, ${roundToHundred(c.spent).toFixed(0)}$ dépensé`).join('\n')}

RÉPONDS UNIQUEMENT avec un JSON Array strict de 3 strings (pas de markdown):
["recommandation 1", "recommandation 2", "recommandation 3"]`;

    try {
        const text = await chat(
            [{ role: 'user', content: userPrompt }],
            apiKey,
            { system: QUEBEC_FISCAL_CONTEXT, maxTokens: 1024, temperature: 0.7 },
        );
        const validated = safeJsonValidate(text, BudgetAnalysisArraySchema);
        return validated && validated.length > 0
            ? validated
            : ['L\'IA n\'a pas pu générer de recommandations valides.'];
    } catch (e) {
        console.error('[Claude] analyzeBudgetAI failed:', e);
        return ['Erreur lors de l\'analyse du budget. Vérifie ta clé API Anthropic.'];
    }
};

// ─── Vision: analyse fiche de paie (compat TaxCenter) ───────────────────────

const PayslipSchema = z.object({
    grossPeriod: z.number(),
    netPeriod: z.number(),
    taxPeriod: z.number(),
    rrspPeriod: z.number(),
    frequency: z.enum(['Weekly', 'Bi-Weekly', 'Semi-Monthly', 'Monthly']),
});
export type PayslipData = z.infer<typeof PayslipSchema>;

/**
 * Phase 4 A4 — analyse vision d'une fiche de paie / document fiscal.
 *
 * Extrait les montants de la PÉRIODE COURANTE (pas YTD) au format
 * structuré pour TaxCenter. Modèle Sonnet 4.6 (Vision).
 */
export const analyzePayslip = async (file: File, apiKey: string): Promise<PayslipData> => {
    if (!apiKey) throw new Error('Clé API Anthropic manquante.');

    // Lit le fichier en base64 pour Anthropic Vision
    const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1] || result);
        };
        reader.onerror = () => reject(new Error('Lecture fichier échouée'));
        reader.readAsDataURL(file);
    });

    const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) {
        throw new Error(`Type ${mediaType} non supporté. Utilise JPG/PNG/GIF/WEBP.`);
    }

    const client = makeClient(apiKey);
    const response = await client.messages.create({
        model: MODEL_SONNET,
        max_tokens: 512,
        system: `${QUEBEC_FISCAL_CONTEXT}\nTu analyses des fiches de paie québécoises (T4, RL-1, talons). Extrais les montants de la PÉRIODE COURANTE uniquement (pas les cumuls YTD).`,
        messages: [{
            role: 'user',
            content: [
                { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
                {
                    type: 'text',
                    text: `Analyse cette fiche de paie. Extrais UNIQUEMENT les montants de la PÉRIODE COURANTE et retourne un JSON strict (sans markdown):
{
  "grossPeriod": number,
  "netPeriod": number,
  "taxPeriod": number,
  "rrspPeriod": number,
  "frequency": "Weekly" | "Bi-Weekly" | "Semi-Monthly" | "Monthly"
}`,
                },
            ],
        }],
    });

    const text = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('');
    const validated = safeJsonValidate(text, PayslipSchema);
    if (!validated) {
        throw new Error('Format JSON invalide retourné par Claude.');
    }
    return validated;
};

// ─── Vision: analyse générique de documents (compat gemini.ts) ──────────────

export const analyzeDocuments = async (
    files: File[],
    apiKey: string,
    onProgress?: (current: number, total: number) => void,
): Promise<{ summary: string; extracted: Record<string, unknown>[] }> => {
    if (!apiKey) return { summary: 'Clé API Anthropic requise.', extracted: [] };
    if (files.length === 0) return { summary: 'Aucun fichier à analyser.', extracted: [] };

    const extracted: Record<string, unknown>[] = [];
    let summary = '';

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        onProgress?.(i + 1, files.length);

        // Lit le fichier en base64 (Anthropic Vision accepte les images base64)
        const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                // strip "data:image/png;base64," prefix
                resolve(result.split(',')[1] || result);
            };
            reader.onerror = () => reject(new Error('Lecture fichier échouée'));
            reader.readAsDataURL(file);
        });

        const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
        if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) {
            console.warn(`[Claude] Type ${mediaType} non supporté, skip ${file.name}`);
            continue;
        }

        try {
            const client = makeClient(apiKey);
            const response = await client.messages.create({
                model: MODEL_SONNET,
                max_tokens: 1024,
                system: `${QUEBEC_FISCAL_CONTEXT}\nTu analyses des documents fiscaux québécois (T4, RL-1, relevés, factures). Extrais les chiffres clés.`,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
                        { type: 'text', text: 'Analyse ce document fiscal. Extrais les montants importants (revenu brut, impôt fédéral retenu, impôt provincial retenu, RRQ, AE, etc.) et résume en 2-3 phrases.' },
                    ],
                }],
            });
            const text = response.content
                .filter(b => b.type === 'text')
                .map(b => (b as { type: 'text'; text: string }).text)
                .join('');
            summary += `\n--- ${file.name} ---\n${text}\n`;
            extracted.push({ file: file.name, analysis: text });
        } catch (e) {
            console.error(`[Claude] analyzeDocuments error on ${file.name}:`, e);
            summary += `\n--- ${file.name} ---\nErreur: ${(e as Error).message}\n`;
        }
    }

    return { summary: summary.trim(), extracted };
};
