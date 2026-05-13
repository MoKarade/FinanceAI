
import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, RecurringItem, FinancialGoal, GoalType, Asset } from "../types";

const MODEL_NAME = "gemini-2.0-flash";

// Contexte fiscal et culturel québécois pour améliorer la précision de l'IA
const QUEBEC_FISCAL_CONTEXT = `
Tu es un expert-comptable et conseiller financier spécialisé dans les finances personnelles au Québec, Canada.
Tes connaissances incluent :
- Le système fiscal canadien et québécois (impôt fédéral + provincial)
- Les types de comptes : CELI (Compte Épargne Libre Impôt), REER (Régime Épargne Retraite), CELIAPP/FHSA, REEE
- Les institutions financières québécoises : Desjardins, Banque Laurentienne, BNC, RBC, TD, BMO, Scotia, CIBC, Wealthsimple
- Les épiceries : IGA, Metro, Maxi, Super C, Provigo, PA, Walmart, Costco
- Les commerçants locaux québécois : SAQ, SQDC, Couche-Tard, Jean Coutu, Pharmaprix, Dollarama
- Les services : Hydro-Québec, Bell, Vidéotron, Telus, Cogeco
- Les restaurants et livraison : Uber Eats, DoorDash, Skip The Dishes, restaurants locaux
- Les paiements : Interac, Visa, Mastercard, AmEx, PayPal, Google Pay, Apple Pay
- Les abréviations bancaires courantes sur les relevés québécois
Tu dois catégoriser les transactions avec précision selon le contexte québécois.
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
const safeJsonParse = (text: string): any[] => {
    try { return JSON.parse(text); } catch (e) {
        let cleaned = text.trim().replace(/^```json/, '').replace(/```$/, '').trim();
        try { return JSON.parse(cleaned); } catch (e2) { return []; }
    }
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const categorizeBatch = async (transactions: Transaction[], apiKey: string, history: Transaction[] = [], allowedCategories: string[] = [], onProgress?: any): Promise<Transaction[]> => {
    if (transactions.length === 0) return [];
    if (onProgress) onProgress(0, transactions.length, "🔍 Analyse de l'historique et règles strictes...");
    const { matched, remaining } = matchFromHistory(transactions, history);
    if (onProgress) onProgress(matched.length, transactions.length, `✅ ${matched.length} identifiés (Historique/Règles).`, matched);
    if (remaining.length === 0) return matched;
    if (!apiKey) return [...matched, ...remaining];

    const ai = new GoogleGenAI({ apiKey });
    const safeCategories = Array.from(new Set([...allowedCategories, "Autre", "Transfert", "Inconnu", "Remboursement"]));
    const BATCH_SIZE = 15; let aiProcessed: Transaction[] = [];

    for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
        const batch = remaining.slice(i, i + BATCH_SIZE);
        if (onProgress) onProgress(matched.length + aiProcessed.length, transactions.length, `🤖 Appel IA (Lot ${Math.floor(i / BATCH_SIZE) + 1})...`);
        const txList = batch.map(t => `ID:${t.id}|"${t.payee}"|${t.amount}`).join('\n');
        const prompt = `${QUEBEC_FISCAL_CONTEXT}\n\nCATEGORIES AUTORISÉES (utilise UNIQUEMENT ces valeurs): ${JSON.stringify(safeCategories)}.\n\nTransactions à catégoriser:\n${txList}\n\nRègle: Si tu ne peux pas déterminer la catégorie avec >50% de confiance, utilise "Autre".\nFORMAT JSON STRICT: [{ "id": number, "category": string, "isTransfer": boolean, "confidence": number }]`;
        try {
            // Utilisation du grounding web pour améliorer la reconnaissance des marchands
            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    tools: [{ googleSearch: {} }]
                }
            });
            const results = safeJsonParse(response.text || "[]");
            const batchMap = new Map(results.map((r: any) => [r.id, r]));
            const processedBatch = batch.map(t => {
                const aiRes = batchMap.get(t.id);
                return { ...t, category: aiRes?.category || "Inconnu", status: 'processed' as const, isTransfer: aiRes?.isTransfer === true, confidence: aiRes?.confidence || 50 };
            });
            aiProcessed = [...aiProcessed, ...processedBatch];
            if (onProgress) onProgress(matched.length + aiProcessed.length, transactions.length, `✨ Lot terminé (${processedBatch.length} transactions).`, processedBatch);
            await sleep(1000);
        } catch (e) {
            console.warn("Web grounding failed, falling back to standard model:", e);
            // Fallback sans grounding web en cas d'erreur
            try {
                const fallbackResponse = await ai.models.generateContent({
                    model: MODEL_NAME,
                    contents: prompt,
                    config: { responseMimeType: "application/json" }
                });
                const fallbackResults = safeJsonParse(fallbackResponse.text || "[]");
                const fallbackMap = new Map(fallbackResults.map((r: any) => [r.id, r]));
                const fallbackBatch = batch.map(t => {
                    const aiRes = fallbackMap.get(t.id);
                    return { ...t, category: aiRes?.category || "Inconnu", status: 'processed' as const, isTransfer: aiRes?.isTransfer === true, confidence: aiRes?.confidence || 50 };
                });
                aiProcessed = [...aiProcessed, ...fallbackBatch];
                if (onProgress) onProgress(matched.length + aiProcessed.length, transactions.length, `✨ Lot terminé (mode standard).`, fallbackBatch);
            } catch (fallbackError) {
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
    const recent = transactions.filter(t => t.amount < 0 && !t.isTransfer && !t.isDuplicate).slice(0, 200).map(t => `${t.date}|${t.payee}|${Math.abs(t.amount)}`);
    const prompt = `${QUEBEC_FISCAL_CONTEXT}\n\nIdentifie les ABONNEMENTS RÉCURRENTS FIXES uniquement. Ignore les dépenses variables.\nDonnées:\n${recent.join('\n')}\nRetourne JSON: [{ "payee": string, "averageAmount": number, "dayOfMonth": number, "category": string, "yearlyCost": number }]`;
    try {
        const response = await ai.models.generateContent({ model: MODEL_NAME, contents: prompt, config: { responseMimeType: "application/json" } });
        return safeJsonParse(response.text || "[]").map((item: any) => ({ ...item, lastDate: new Date().toISOString().split('T')[0] }));
    } catch (e) { return []; }
};

export const getInvestmentAdvice = async (holdings: string, apiKey: string): Promise<string> => {
    if (!apiKey) return "";
    const ai = new GoogleGenAI({ apiKey });
    try {
        const response = await ai.models.generateContent({ model: MODEL_NAME, contents: `${QUEBEC_FISCAL_CONTEXT}\n\nAnalyse ce portefeuille: ${holdings}. Conseils concis en français, adaptés au contexte fiscal québécois (CELI, REER, gains en capital).` });
        return response.text || "";
    } catch (e) { return ""; }
};

// --- MOTEUR D'OBJECTIFS IA OPTIMISÉ ---
export const generateSmartGoals = async (
    financialData: {
        netWorth: number;
        cash: number;
        investments: { celi: number, reer: number, nonReg: number };
        monthlySavings: number;
        debts: { total: number };
        assets: Asset[];
        celiRoom?: number; // Plafond CELI disponible réel
        rrspRoom?: number; // Plafond REER disponible réel
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
        return { symbol: a.symbol, weight: totalAssetsVal > 0 ? (val / totalAssetsVal) * 100 : 0 };
    });

    const celiRoomStr = financialData.celiRoom !== undefined ? `${financialData.celiRoom}$` : 'Non spécifié';
    const rrspRoomStr = financialData.rrspRoom !== undefined ? `${financialData.rrspRoom}$` : 'Non spécifié';

    const prompt = `
        ${QUEBEC_FISCAL_CONTEXT}
        
        TACHE: Générer 3 à 5 objectifs financiers chirurgicaux basés sur les données réelles du patrimoine.
        
        DONNÉES DU PATRIMOINE:
        - Capacité d'épargne: ${safeSavings}$/mois
        - Cash (tous comptes): ${financialData.cash}$
        - Dettes totales: ${financialData.debts.total}$
        - REER: ${financialData.investments.reer}$ (Plafond disponible: ${rrspRoomStr})
        - CELI: ${financialData.investments.celi}$ (Plafond disponible: ${celiRoomStr})
        - Non-Enregistré: ${financialData.investments.nonReg}$
        - Actifs par poids: ${JSON.stringify(assetsWithWeight)}
        - Âge approximatif: ${financialData.userAge || 'Non spécifié'} ans
        
        INSTRUCTIONS:
        1. PRIORITÉ CELI si plafond disponible > 0 : suggère de maximiser
        2. PRIORITÉ REER si revenus élevés (>80k$) et plafond disponible
        3. PRIORITÉ DETTES si taux d'intérêt > 5%
        4. RÉÉQUILIBRAGE si un actif > 30% du portefeuille
        5. FONDS D'URGENCE si cash < 3 mois de dépenses
        
        FORMAT JSON OBLIGATOIRE:
        [
          {
            "name": "Titre très précis et actionnable",
            "type": "CELI" | "REER" | "LIQUIDITY" | "NET_WORTH" | "REBALANCING",
            "targetAmount": number,
            "target_account": "CELI" | "REER" | "NON-ENREG",
            "estimated_yield": number,
            "monthly_cashflow_impact": number,
            "months_to_goal": number,
            "rationale": "Pourquoi (1 phrase)",
            "action_plan": ["Action concrète 1", "Action concrète 2"]
          }
        ]
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        const rawGoals = safeJsonParse(response.text || "[]");
        const today = new Date();

        return rawGoals.map((g: any) => {
            const months = (g.months_to_goal && g.months_to_goal > 0) ? g.months_to_goal : 12;
            const targetDate = new Date(today);
            targetDate.setMonth(targetDate.getMonth() + months);
            const isoDate = targetDate.toISOString().split('T')[0];

            return {
                id: `ai_goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: g.name,
                type: g.type,
                targetAmount: g.targetAmount,
                monthlyContributionReq: g.monthly_cashflow_impact || 0,
                deadline: isoDate,
                manualCurrentAmount: 0,
                completed: false,
                status: 'suggestion',
                rationale: g.rationale,
                actionPlan: g.action_plan || [],
                targetAccount: g.target_account || 'NON-ENREG',
                estimatedYield: g.estimated_yield || 5.0,
                complexityScore: 1
            };
        });

    } catch (e) {
        console.error("AI Goal Gen Error:", e);
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
    if (!apiKey) return ["Clé API requise pour le diagnostic IA."];
    const ai = new GoogleGenAI({ apiKey });

    // Contexte partagé mais on demande 3 reco JSON
    const prompt = `
        ${QUEBEC_FISCAL_CONTEXT}
        
        AGIS COMME UN CONSEILLER FINANCIER EXPERT, STRICT ET BIENVEILLANT.
        Analyse ce budget mensuel québécois et fournis EXACTEMENT 3 recommandations courtes (1 ou 2 phrases max) très concrètes et orientées action. Ne sois pas générique.
        
        DONNÉES DU MOIS:
        - Revenu net mensuel: ${budgetData.totalNetIncome}$
        - Budget prévu: ${budgetData.totalBudget}$
        - Dépenses réelles actuelles: ${budgetData.totalSpent}$
        - Alertes de dépassement: ${budgetData.alerts.length > 0 ? budgetData.alerts.join(', ') : 'Aucune'}
        
        DÉTAIL DES CATÉGORIES (Prévu vs Réel):
        ${budgetData.categories.map(c => `- ${c.name} (${c.nature}): ${c.target.toFixed(0)}$ prévu, ${c.spent.toFixed(0)}$ dépensé`).join('\n')}
        
        RÈGLE OBLIGATOIRE: Retourne uniquement un Array JSON contenant 3 chaînes de caractères.
        EXEMPLE CIBLE: ["Analysez vos dépenses en restaurants qui dépassent de X$ la cible.", "Transférez X$ supplémentaires vers votre CELI car votre loyer est sous contrôle.", "Réduisez l'enveloppe loisir de X% pour compenser le dépassement sur l'épicerie."]
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const result = safeJsonParse(response.text || "[]");
        return Array.isArray(result) && result.length > 0 ? result : ["L'IA n'a pas pu générer de recommandations valides."];
    } catch (e) {
        console.error("AI Budget Analysis Error:", e);
        return ["Erreur lors de l'analyse du budget. Vérifiez votre connexion ou votre clé API Gemini."];
    }
};
