// [R6] Garde-fou : chaque persona de test, une fois chargé, n'affiche AUCUNE
// PageSetupGate sur les pages pilotées par les DONNÉES (prérequis « met » OU
// opt-out explicite). On EXCLUT Actions/Assistant : leur prérequis `anthropicKey`
// est la clé API de l'utilisateur (jamais dans un persona) → elles restent gatées
// par design tant qu'aucune clé n'est saisie.
//
// Réutilise la SOURCE UNIQUE (`PAGE_SETUP` + `REQUIREMENTS`) : si on ajoute un
// persona, un prérequis ou une page, ce test attrape toute régression de gating.
import { describe, it, expect } from 'vitest';
import { TEST_PERSONAS } from '../../../services/testPersonas';
import { PAGE_SETUP } from '../../../components/setup/PageSetupGate';
import { REQUIREMENTS } from '../../../components/setup/requirements';
import type { FinanceState } from '../../../store/useFinanceStore';

// Pages dont le gate dépend des données (hors prérequis `anthropicKey`).
const DATA_PAGES = Object.entries(PAGE_SETUP).filter(
    ([, cfg]) => cfg && !cfg.requirementIds.includes('anthropicKey'),
);

// State minimal pour les `isMet` (qui ne LISENT que des champs de AppState) + le persona par-dessus.
function stateForPersona(build: () => Partial<FinanceState>): FinanceState {
    const base = {
        config: { users: [] },
        assets: [], realEstateGoals: [], childGoals: [], transactions: [],
        debts: [], travelGoals: [], lifeEvents: [],
        retirementGoal: {}, apiKeys: {}, setupOptOut: {},
    };
    return { ...base, ...build() } as unknown as FinanceState;
}

describe('Personas de test — aucune PageSetupGate sur les pages data (R6)', () => {
    it('le périmètre testé couvre bien plusieurs pages (non vide)', () => {
        expect(DATA_PAGES.length).toBeGreaterThan(5);
    });

    for (const persona of TEST_PERSONAS) {
        it(`${persona.id} : toutes les pages data sont accessibles (aucune gate)`, () => {
            const state = stateForPersona(persona.build as () => Partial<FinanceState>);
            const gated: string[] = [];
            for (const [tab, cfg] of DATA_PAGES) {
                if (!cfg) continue;
                const optedOut = !!(cfg.optOut && state.setupOptOut?.[cfg.optOut.key]);
                if (optedOut) continue;
                const missing = cfg.requirementIds.filter((id) => !REQUIREMENTS[id].isMet(state));
                if (missing.length > 0) gated.push(`${tab} (manque: ${missing.join(', ')})`);
            }
            expect(gated, `Pages gatées pour ${persona.id}`).toEqual([]);
        });
    }
});
