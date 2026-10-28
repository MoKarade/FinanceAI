// tests/services/aiChatReglages.test.ts
//
// Réglages d'appel par génération de modèle : la famille 5.5 pense par défaut (et la pensée compte
// dans `max_tokens`) ; `thinking: disabled` est refusé (400) par Sonnet/Opus 5.5 ; un id inconnu ne
// reçoit aucun réglage (jamais un 400 sur un paramètre qu'il ne connaît pas).

import { describe, it, expect } from 'vitest';
import { reglagesLecture, reglagesConversation } from '../../services/aiChat/reglages';
import { MODEL_IDS } from '../../services/aiChat/models';

describe('reglagesLecture', () => {
    it('Haiku 5.5 : pensée coupée, effort bas', () => {
        expect(reglagesLecture(MODEL_IDS.haiku)).toEqual({ thinking: { type: 'disabled' }, output_config: { effort: 'low' } });
    });

    it('Sonnet 5.5 : jamais `disabled` (400) — `between_tools`, effort moyen', () => {
        const r = reglagesLecture(MODEL_IDS.sonnet);
        expect(r.thinking).toEqual({ type: 'between_tools' });
        expect(r.output_config).toEqual({ effort: 'medium' });
    });

    it('Opus 5.5 : on ne peut pas couper la pensée → aucun champ `thinking`, effort bas', () => {
        const r = reglagesLecture(MODEL_IDS.opus);
        expect(r.thinking).toBeUndefined();
        expect(r.output_config).toEqual({ effort: 'low' });
    });

    it('id inconnu : aucun réglage', () => {
        expect(reglagesLecture('claude-inconnu-9')).toEqual({});
    });
});

describe('reglagesConversation', () => {
    it('famille 5.5 : effort moyen, pensée adaptative conservée', () => {
        for (const id of Object.values(MODEL_IDS)) {
            expect(reglagesConversation(id)).toEqual({ output_config: { effort: 'medium' } });
        }
    });

    it('id inconnu : aucun réglage', () => {
        expect(reglagesConversation('gpt-oss-atelier')).toEqual({});
    });
});
