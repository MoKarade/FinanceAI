
import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { Transaction, RecurringItem, FinancialGoal, GoalType, Asset } from "../types";

const MODEL_NAME = "gemini-2.0-flash";

// =============================================================================
// PRIVACY & SECURITY HARDENING (Phase 0)
// =============================================================================
// 1. Sanitization des payees envoyes a Gemini :
//    - Strip des caracteres de controle / nouvelles lignes
//    - Escape des guillemets pour eviter la prompt injection
//    - Troncature a 60 caracteres max
// 2. Arrondi des montants exacts a 100$ avant envoi (reduit la precision PII)
// 3. Validation Zod des reponses LLM (anti-schema-drift, anti-rate-limit JSON)
// 4. Le contexte fiscal quebecois reste necessaire pour la categorisation par
//    nom de marchand. Une anonymisation complete par hash casserait l'efficacite
//    de categorisation. A evaluer en Phase ulterieure : passer ces calls par
//    MCP/Claude (qui pourrait recevoir uniquement les hash et faire le mapping
//    cote serveur en restant local).
// =============================================================================

const sanitizePayee = (raw: string): string => {
    if (!raw) return '';
    // eslint-disable-next-line no-control-regex
    return raw
        .replace(/[\x00-\x1F\x7F]/g, ' ')   // strip control chars + DEL
        .replace(/["\\]/g, ' ')               // strip quotes + backslashes (anti prompt injection)
        .replace(/\s+/g, ' ')                  // collapse whitespace
        .trim()
        .slice(0, 60);                         // limite la PII envoyee
};

const roundToHundred = (amount: number): number => {
    return Math.round(amount / 100) * 100;
};

// ---------------------------------------------------------------------------
// Schemas Zod : validation stricte des reponses LLM (T4)
// ---------------------------------------------------------------------------

const CategorizeItemSchema = z.object({
    id: z.number(),
    category: z.string(),
    isTransfer: z.boolean().optional(),
    confidence: z.number().optional(),
});
const CategorizeArraySchema = z.array(CategorizeItemSchema);

const SubscriptionItemSchema = z.object({
    payee: z.string(),
    averageAmount: z.number(),
    dayOfMonth: z.number(),
    category: z.string(),
    yearlyCost: z.number(),
});
const SubscriptionArraySchema = z.array(SubscriptionItemSchema);

const SmartGoalItemSchema = z.object({
    name: z.string(),
    type: z.enum(['NET_WORTH', 'CELI', 'REER', 'LIQUIDITY', 'CUSTOM', 'EXPENSE_OPTIMIZATION', 'REBALANCING']),
    targetAmount: z.number(),
    target_account: z.enum(['CELI', 'REER', 'NON-ENREG', 'CRYPTO']).optional(),
    estimated_yield: z.number().optional(),
    monthly_cashflow_impact: z.number().optional(),
    months_to_goal: z.number().optional(),
    rationale: z.string().optional(),
    action_plan: z.array(z.string()).optional(),
});
const SmartGoalArraySchema = z.array(SmartGoalItemSchema);

const BudgetAnalysisArraySchema = z.array(z.string());

/**
 * Parse une reponse LLM en JSON puis valide contre un schema Zod.
 * Renvoie null si parse ou validation echoue ; logge l'erreur cote console.
 *
 * Note: generique sur S extends z.ZodTypeAny pour que TS infere correctement
 * le type de retour via z.infer<S> (z.ZodType<T> ne reverse-infere pas T).
 */
const safeJsonValidate = <S extends z.ZodTypeAny>(text: string, schema: S): z.infer<S> | null => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        const cleaned = text.trim().replace(/^```json/, '').replace(/```$/, '').trim();
        try {
            parsed = JSON.parse(cleaned);
        } catch (e2) {
            console.warn('[FinanceAI Gemini] JSON.parse failed:', e2, 'raw:', text.slice(0, 200));
            return null;
        }
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
        console.warn('[FinanceAI Gemini] Zod validation failed:', result.error.issues.slice(0, 5));
        return null;
    }
    return result.data;
};

// Contexte fiscal et culturel quebecois pour ameliorer la precision de l'IA
const QUEBEC_FISCAL_CONTEXT = `
Tu es un expert-comptable et conseiller financier specialise dans les finances personnelles au Quebec, Canada.
Tes connaissances incluent :
- Le systeme fiscal canadien et quebecois (impot federal + provincial)
- Les types de comptes : CELI (Compte Epargne Libre Impot), REER (Regime Epargne Retraite), CELIAPP/FHSA, REEE
- Les institutions financieres quebecoises : Desjardins, Banque Laurentienne, BNC, RBC, TD, BMO, Scotia, CIBC, Wealthsimple
- Les epiceries : IGA, Metro, Maxi, Super C, Provigo, PA, Walmart, Costco
- Les commercants locaux quebecois : SAQ, SQDC, Couche-Tard, Jean Coutu, Pharmaprix, Dollarama
- Les services : Hydro-Quebec, Bell, Videotron, Telus, Cogeco
- Les restaurants et livraison : Uber Eats, DoorDash, Skip The Dishes, restaurants locaux
- Les paiements : Interac, Visa, Mastercard, AmEx, PayPal, Google Pay, Apple Pay
- Les abreviations bancaires courantes sur les releves quebecois
Tu dois categoriser les transactions avec precision selon le contexte quebecois.
`;

const cleanMerchantName = (raw: string): string => {
    return raw.toLowerCase().replace(/[0-9*#]/g, ' ').replace(/\s+/g, ' ').replace(/(succursale|store|magasin|pos|biller|paiement|payment|prelevement|virement|interac|transfert)/g, '').trim();
};
const isDefiniteTransfer = (payee: string, amount: number): boolean => {
    const p = payee.toLowerCase();
    if (p.includes('interac') || p.includes('e-transfer')) return false;
    if (p.includes('acces d') || p.includes('accesd')) return true;
    const transferKeywords = ['payment', 'paiement', 'prelevement', 'biller', 'wealthsimple', 'questrade', 'disnat', 'visa', 'mastercard', 'epargne', 'savings', 'celi', 'reer'];
    if (transferKeywords.some(k => p.includes(k))) return true;
    return false;
};
const matchFromHistory = (transactions: Transaction[], history: Transaction[]) => {
    const knowledgeBase = new Map<string, { cat: string, isTransfer: boolean }>();
    const frequency = new Map<string, Record<string, number>>();
    history.forEach(t => {
        if (!t.category || t.category === 'Uncategorized' || t.category === 'Autre') return;
        const key = cleanMerchantName(t.payee);
        if (key.length < 2) return;
        if (!frequency.has(key)) frequency.set(key, {});
        const counts = frequency.get(key)!;
        counts[t.category] = (counts[t.category] || 0) + 1;
        if (t.isTransfer) knowledgeBase.set(key, { cat: t.category, isTransfer: true });
    });
    frequency.forEach((counts, payee) => {
        let bestCat = ''; let maxCount = 0;
        Object.entries(counts).forEach(([cat, count]) => { if (count > maxCount) { maxCount = count; bestCat = cat; } });
        if (bestCat) { const existing = knowledgeBase.get(payee); knowledgeBase.set(payee, { cat: bestCat, isTransfer: existing?.isTransfer || false }); }
    });
    const matched: Transaction[] = []; const remaining: Transaction[] = [];
    transactions.forEach(t => {
        const key = cleanMerchantName(t.payee);
        if (isDefiniteTransfer(t.payee, Math.abs(t.amount))) { matched.push({ ...t, category: 'Transfert', isTransfer: true, status: 'processed', confidence: 100 }); return; }
        if (knowledgeBase.has(key)) { const known = knowledgeBase.get(key)!; matched.push({ ...t, category: known.cat, isTransfer: known.isTransfer, status: 'processed', confidence: 95 }); return; }
        remaining.push(t);
    });
    return { matched, remaining };
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const categorizeBatch = async (transactions: Transaction[], apiKey: string, history: Transaction[] = [], allowedCategories: string[] = [], onProgress?: any): Promise<Transaction[]> => {
    if (transactions.length === 0) return [];
    if (onProgress) onProgress(0, transactions.length, "Analyse de l'historique et regles strictes...");
    const { matched, remaining } = matchFromHistory(transactions, history);
    if (onProgress) onProgress(matched.length, transactions.length, `${matched.length} identifies (Historique/Regles).`, matched);
    if (remaining.length === 0) return matched;
    if (!apiKey) return [...matched, ...remaining];

    const ai = new GoogleGenAI({ apiKey });
    const safeCategories = Array.from(new Set([...allowedCategories, "Autre", "Transfert", "Inconnu", "Remboursement"]));
    const BATCH_SIZE = 15; let aiProcessed: Transaction[] = [];

    for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
        const batch = remaining.slice(i, i + BATCH_SIZE);
        if (onProgress) onProgress(matched.length + aiProcessed.length, transactions.length, `Appel IA (Lot ${Math.floor(i / BATCH_SIZE) + 1})...`);
        // Phase 0 hardening: sanitize les payees + arrondit les montants avant envoi a Gemini
        const txList = batch.map(t => `ID:${t.id}|"${sanitizePayee(t.payee)}"|${roundToHundred(t.amount)}`).join('\n');
        const prompt = `${QUEBEC_FISCAL_CONTEXT}\n\nCATEGORIES AUTORISEES (utilise UNIQUEMENT ces valeurs): ${JSON.stringify(safeCategories)}.\n\nTransactions a categoriser (montants arrondis a 100$):\n${txList}\n\nRegle: Si tu ne peux pas determiner la categorie avec >50% de confiance, utilise "Autre".\nFORMAT JSON STRICT: [{ "id": number, "category": string, "isTransfer": boolean, "confidence": number }]`;
        try {
            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    tools: [{ googleSearch: {} }]
                }
            });
            const validated = safeJsonValidate(response.text || "[]", CategorizeArraySchema);
            const batchMap = new Map((validated || []).map(r => [r.id, r]));
            const processedBatch = batch.map(t => {
                const aiRes = batchMap.get(t.id);
                return { ...t, category: aiRes?.category || "Inconnu", status: 'processed' as const, isTransfer: aiRes?.isTransfer === true, confidence: aiRes?.confidence || 50 };
            });
            aiProcessed = [...aiProcessed, ...processedBatch];
            if (onProgress) onProgress(matched.length + aiProcessed.length, transactions.length, `Lot termine (${processedBatch.length} transactions).`, processedBatch);
            await sleep(1000);
        } catch (e) {
            console.warn("Web grounding failed, falling back to standard model:", e);
            try {
                const fallbackResponse = await ai.models.generateContent({
                    model: MODEL_NAME,
                    contents: prompt,
                    config: { responseMimeType: "application/json" }
                });
                const validatedFb = safeJsonValidate(fallbackResponse.text || "[]", CategorizeArraySchema);
                const fallbackMap = new Map((validatedFb || []).map(r => [r.id, r]));
                const fallbackBatch = batch.map(t => {
                    const aiRes = fallbackMap.get(t.id);
                    return { ...t, category: aiRes?.category || "Inconnu", status: 'processed' as const, isTransfer: aiRes?.isTransfer === true, confidence: aiRes?.confidence || 50 };
                });
                aiProcessed = [...aiProcessed, ...fallbackBatch];
                if (onProgress) onProgress(matched.length + aiProcessed.length, transactions.length, `Lot termine (mode standard).`, fallbackBatch);
            } catch (fallbackError) {
                console.error("[FinanceAI] Echec total de categorisation IA pour ce lot:", fallbackError);
                const failedBatch = batch.map(t => ({ ...t, status: 'error' as const, confidence: 0 }));
                aiProcessed = [...aiProcessed, ...failedBatch];
            }
        }
    }
    return [...matched, ...aiProcessed];
};

export const detectSubscriptionsAI = async (transactions: Transaction[], apiKey: string): Promise<RecurringItem[]> => {
    if (!apiKey) return [];
    const ai = new GoogleGenAI({ apiKey });
    // Phase 0 hardening: sanitize payees + arrondit les montants envoyes
    const recent = transactions.filter(t => t.amount < 0 && !t.isTransfer && !t.isDuplicate).slice(0, 200).map(t => `${t.date}|${sanitizePayee(t.payee)}|${roundToHundred(Math.abs(t.amount))}`);
    const prompt = `${QUEBEC_FISCAL_CONTEXT}\n\nIdentifie les ABONNEMENTS RECURRENTS FIXES uniquement. Ignore les depenses variables.\nDonnees (montants arrondis a 100$):\n${recent.join('\n')}\nRetourne JSON: [{ "payee": string, "averageAmount": number, "dayOfMonth": number, "category": string, "yearlyCost": number }]`;
    try {
        const response = await ai.models.generateContent({ model: MODEL_NAME, contents: prompt, config: { responseMimeType: "application/json" } });
        const validated = safeJsonValidate(response.text || "[]", SubscriptionArraySchema);
        if (!validated) return [];
        return validated.map((item): RecurringItem => ({
            payee: item.payee,
            averageAmount: item.averageAmount,
            dayOfMonth: item.dayOfMonth,
            category: item.category,
            yearlyCost: item.yearlyCost,
            lastDate: new Date().toISOString().split('T')[0],
        }));
    } catch (e) {
        console.error("[FinanceAI] detectSubscriptionsAI a echoue:", e);
        return [];
    }
};

export const getInvestmentAdvice = async (holdings: string, apiKey: string): Promise<string> => {
    if (!apiKey) return "";
    const ai = new GoogleGenAI({ apiKey });
    try {
        const response = await ai.models.generateContent({ model: MODEL_NAME, contents: `${QUEBEC_FISCAL_CONTEXT}\n\nAnalyse ce portefeuille: ${holdings}. Conseils concis en francais, adaptes au contexte fiscal quebecois (CELI, REER, gains en capital).` });
        return response.text || "";
    } catch (e) {
        console.error("[FinanceAI] getInvestmentAdvice a echoue:", e);
        return "";
    }
};

// --- MOTEUR D'OBJECTIFS IA OPTIMISE ---
export const generateSmartGoals = async (
    financialData: {
        netWorth: number;
        cash: number;
        investments: { celi: number, reer: number, nonReg: number };
        monthlySavings: number;
        debts: { total: number };
        assets: Asset[];
        celiRoom?: number;
        rrspRoom?: number;
        userAge?: number;
        fxRates?: Record<string, number>;
    },
    apiKey: string
): Promise<FinancialGoal[]> => {
    if (!apiKey) return [];

    const ai = new GoogleGenAI({ apiKey });
    const safeSavings = Math.max(100, financialData.monthlySavings);
    const fxUSD = financialData.fxRates?.USD || 1.38;

    const totalAssetsVal = financialData.investments.celi + financialData.investments.reer + financialData.investments.nonReg;
    const assetsWithWeight = financialData.assets.map(a => {
        const val = a.quantity * a.currentPrice * (a.currency === 'USD' ? fxUSD : 1);
        return { symbol: a.symbol, weight: totalAssetsVal > 0 ? Math.round((val / totalAssetsVal) * 100) : 0 };
    });

    // Phase 0 hardening: arrondit les montants envoyes a Gemini (PII)
    const celiRoomStr = financialData.celiRoom !== undefined ? `${roundToHundred(financialData.celiRoom)}$` : 'Non specifie';
    const rrspRoomStr = financialData.rrspRoom !== undefined ? `${roundToHundred(financialData.rrspRoom)}$` : 'Non specifie';

    const prompt = `
        ${QUEBEC_FISCAL_CONTEXT}
        
        TACHE: Generer 3 a 5 objectifs financiers chirurgicaux bases sur les donnees reelles du patrimoine.
        
        DONNEES DU PATRIMOINE (montants arrondis a 100$):
        - Capacite d'epargne: ${roundToHundred(safeSavings)}$/mois
        - Cash (tous comptes): ${roundToHundred(financialData.cash)}$
        - Dettes totales: ${roundToHundred(financialData.debts.total)}$
        - REER: ${roundToHundred(financialData.investments.reer)}$ (Plafond disponible: ${rrspRoomStr})
        - CELI: ${roundToHundred(financialData.investments.celi)}$ (Plafond disponible: ${celiRoomStr})
        - Non-Enregistre: ${roundToHundred(financialData.investments.nonReg)}$
        - Actifs par poids (%): ${JSON.stringify(assetsWithWeight)}
        - Age approximatif: ${financialData.userAge || 'Non specifie'} ans
        
        INSTRUCTIONS:
        1. PRIORITE CELI si plafond disponible > 0 : suggere de maximiser
        2. PRIORITE REER si revenus eleves (>80k$) et plafond disponible
        3. PRIORITE DETTES si taux d'interet > 5%
        4. REEQUILIBRAGE si un actif > 30% du portefeuille
        5. FONDS D'URGENCE si cash < 3 mois de depenses
        
        FORMAT JSON OBLIGATOIRE:
        [
          {
            "name": "Titre tres precis et actionnable",
            "type": "CELI" | "REER" | "LIQUIDITY" | "NET_WORTH" | "REBALANCING",
            "targetAmount": number,
            "target_account": "CELI" | "REER" | "NON-ENREG",
            "estimated_yield": number,
            "monthly_cashflow_impact": number,
            "months_to_goal": number,
            "rationale": "Pourquoi (1 phrase)",
            "action_plan": ["Action concrete 1", "Action concrete 2"]
          }
        ]
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        const validated = safeJsonValidate(response.text || "[]", SmartGoalArraySchema);
        if (!validated) return [];

        const today = new Date();

        return validated.map(g => {
            const months = (g.months_to_goal && g.months_to_goal > 0) ? g.months_to_goal : 12;
            const targetDate = new Date(today);
            targetDate.setMonth(targetDate.getMonth() + months);
            const isoDate = targetDate.toISOString().split('T')[0];

            return {
                // Phase 0 hardening: crypto.randomUUID() au lieu de Math.random().toString(36).substr (deprecie)
                id: `ai_goal_${Date.now()}_${(typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID().slice(0, 9) : Math.random().toString(36).slice(2, 11)}`,
                name: g.name,
                type: g.type as GoalType,
                targetAmount: g.targetAmount,
                monthlyContributionReq: g.monthly_cashflow_impact || 0,
                deadline: isoDate,
                manualCurrentAmount: 0,
                completed: false,
                status: 'suggestion' as const,
                rationale: g.rationale,
                actionPlan: g.action_plan || [],
                targetAccount: g.target_account || 'NON-ENREG',
                estimatedYield: g.estimated_yield || 5.0,
                complexityScore: 1
            };
        });

    } catch (e) {
        console.error("[FinanceAI] AI Goal Gen Error:", e);
        return [];
    }
};

export const analyzeBudgetAI = async (
    budgetData: {
        totalNetIncome: number;
        totalBudget: number;
        totalSpent: number;
        alerts: string[];
        categories: { name: string, target: number, spent: number, nature: string }[];
    },
    apiKey: string
): Promise<string[]> => {
    if (!apiKey) return ["Cle API requise pour le diagnostic IA."];
    const ai = new GoogleGenAI({ apiKey });

    // Phase 0 hardening: arrondit les montants envoyes a Gemini (PII)
    const prompt = `
        ${QUEBEC_FISCAL_CONTEXT}
        
        AGIS COMME UN CONSEILLER FINANCIER EXPERT, STRICT ET BIENVEILLANT.
        Analyse ce budget mensuel quebecois et fournis EXACTEMENT 3 recommandations courtes (1 ou 2 phrases max) tres concretes et orientees action. Ne sois pas generique.
        
        DONNEES DU MOIS (montants arrondis a 100$):
        - Revenu net mensuel: ${roundToHundred(budgetData.totalNetIncome)}$
        - Budget prevu: ${roundToHundred(budgetData.totalBudget)}$
        - Depenses reelles actuelles: ${roundToHundred(budgetData.totalSpent)}$
        - Alertes de depassement: ${budgetData.alerts.length > 0 ? budgetData.alerts.join(', ') : 'Aucune'}
        
        DETAIL DES CATEGORIES (Prevu vs Reel, arrondis a 100$):
        ${budgetData.categories.map(c => `- ${c.name} (${c.nature}): ${roundToHundred(c.target).toFixed(0)}$ prevu, ${roundToHundred(c.spent).toFixed(0)}$ depense`).join('\n')}
        
        REGLE OBLIGATOIRE: Retourne uniquement un Array JSON contenant 3 chaines de caracteres.
        EXEMPLE CIBLE: ["Analysez vos depenses en restaurants qui depassent de X$ la cible.", "Transferez X$ supplementaires vers votre CELI car votre loyer est sous controle.", "Reduisez l'enveloppe loisir de X% pour compenser le depassement sur l'epicerie."]
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const validated = safeJsonValidate(response.text || "[]", BudgetAnalysisArraySchema);
        return validated && validated.length > 0 ? validated : ["L'IA n'a pas pu generer de recommandations valides."];
    } catch (e) {
        console.error("[FinanceAI] AI Budget Analysis Error:", e);
        return ["Erreur lors de l'analyse du budget. Verifiez votre connexion ou votre cle API Gemini."];
    }
};
