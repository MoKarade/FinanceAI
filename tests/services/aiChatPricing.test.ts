// tests/services/aiChatPricing.test.ts
//
// [B3+B4] Modèles du chat + coût réel : mapping des clés, parité ids↔tarifs (un modèle offert SANS
// tarif = coût silencieusement non compté — la garde échoue AVANT la prod), maths de coût (tarifs
// datés/sourcés dans pricing.ts), formatage CAD des micro-montants.

import { describe, it, expect } from 'vitest';
import { MODEL_IDS, AI_CHAT_MODELS, DEFAULT_AI_CHAT_MODEL, resolveChatModelKey } from '../../services/aiChat/models';
import {
    PRICING_USD_PER_MTOK, chatCostUsd, addUsage, sumMessagesCostUsd, EMPTY_USAGE,
    type AiTokenUsage,
} from '../../services/aiChat/pricing';
import { MODEL_SONNET } from '../../services/claude';
import { formatCostCad } from '../../utils/format';

const usage = (u: Partial<AiTokenUsage>): AiTokenUsage => ({ ...EMPTY_USAGE, ...u });

describe('models (B3)', () => {
    it('chaque modèle offert dans le chat a un id API et un TARIF (parité verrouillée)', () => {
        expect(AI_CHAT_MODELS.map((m) => m.key).sort()).toEqual(['haiku', 'opus', 'sonnet']);
        for (const m of AI_CHAT_MODELS) {
            const id = MODEL_IDS[m.key];
            expect(id, `id manquant pour ${m.key}`).toBeTruthy();
            expect(PRICING_USD_PER_MTOK[id], `tarif manquant pour ${id} — le coût serait silencieusement non compté`).toBeDefined();
        }
    });

    it('MODEL_SONNET (services/claude) dérive de la MÊME source — jamais deux littéraux qui divergent', () => {
        expect(MODEL_SONNET).toBe(MODEL_IDS.sonnet);
    });

    it('resolveChatModelKey : valeur inconnue/corrompue → défaut (jamais un id invalide vers l\'API)', () => {
        expect(resolveChatModelKey('opus')).toBe('opus');
        expect(resolveChatModelKey('gpt-5')).toBe(DEFAULT_AI_CHAT_MODEL);
        expect(resolveChatModelKey(undefined)).toBe(DEFAULT_AI_CHAT_MODEL);
        expect(resolveChatModelKey(42)).toBe(DEFAULT_AI_CHAT_MODEL);
    });
});

describe('chatCostUsd (B4)', () => {
    it('1M tokens input Sonnet = 3 $ US ; 1M output = 15 $ US (tarif public 2026-06)', () => {
        expect(chatCostUsd(usage({ inputTokens: 1_000_000 }), MODEL_IDS.sonnet)).toBeCloseTo(3, 10);
        expect(chatCostUsd(usage({ outputTokens: 1_000_000 }), MODEL_IDS.sonnet)).toBeCloseTo(15, 10);
    });

    it('cache : read = 0,1× l\'input, write = 1,25× l\'input', () => {
        expect(chatCostUsd(usage({ cacheReadTokens: 1_000_000 }), MODEL_IDS.sonnet)).toBeCloseTo(0.3, 10);
        expect(chatCostUsd(usage({ cacheWriteTokens: 1_000_000 }), MODEL_IDS.sonnet)).toBeCloseTo(3.75, 10);
    });

    it('Opus 5×/Haiku ~0,33× le tarif input de Sonnet (ordre de grandeur verrouillé)', () => {
        const oneM = usage({ inputTokens: 1_000_000 });
        expect(chatCostUsd(oneM, MODEL_IDS.opus)).toBeCloseTo(5, 10);
        expect(chatCostUsd(oneM, MODEL_IDS.haiku)).toBeCloseTo(1, 10);
    });

    it('modèle sans tarif → null HONNÊTE (jamais un 0 plausible)', () => {
        expect(chatCostUsd(usage({ inputTokens: 1000 }), 'claude-inconnu-9')).toBeNull();
    });

    it('champs non finis/négatifs ignorés (jamais de NaN dans un cumul $)', () => {
        const c = chatCostUsd(usage({ inputTokens: NaN, outputTokens: -5, cacheReadTokens: Infinity }), MODEL_IDS.sonnet);
        expect(c).toBe(0);
    });
});

describe('addUsage / sumMessagesCostUsd', () => {
    it('accumule champ à champ, NaN neutralisé', () => {
        const sum = addUsage(usage({ inputTokens: 100, cacheReadTokens: 50 }), usage({ inputTokens: NaN, outputTokens: 20, cacheReadTokens: 5 }));
        expect(sum).toEqual({ inputTokens: 100, outputTokens: 20, cacheWriteTokens: 0, cacheReadTokens: 55 });
    });

    it('somme les costUsd des réponses, ignore absents/non finis', () => {
        expect(sumMessagesCostUsd([
            { costUsd: 0.01 }, {}, { costUsd: NaN }, { costUsd: 0.02 }, { costUsd: -1 },
        ])).toBeCloseTo(0.03, 10);
    });
});

// fr-CA Intl rend des espaces insécables (U+202F/U+00A0) — normalisées pour la lisibilité.
const norm = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ');

describe('formatCostCad', () => {
    it('convertit USD→CAD via le taux fourni, 2 décimales fr-CA', () => {
        // 0,10 $ US × 1,35 = 0,135 $ CA → « 0,14 $ » (arrondi Intl fr-CA, séparateur insécable)
        expect(norm(formatCostCad(0.1, 1.35))).toBe('0,14 $');
    });
    it('micro-coût réel > 0 → « < 0,01 $ », jamais un 0,00 $ qui ment', () => {
        expect(formatCostCad(0.001, 1.35)).toBe('< 0,01 $');
    });
    it('entrées non finies ou taux invalide → « — » (no-fake-data)', () => {
        expect(formatCostCad(NaN, 1.35)).toBe('—');
        expect(formatCostCad(0.1, 0)).toBe('—');
        expect(formatCostCad(0.1, Infinity)).toBe('—');
    });
});
