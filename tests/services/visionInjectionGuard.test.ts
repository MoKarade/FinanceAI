// tests/services/visionInjectionGuard.test.ts
// [SEC-VISION-CONSENT-INJECTION] La clause anti-injection VISION_INJECTION_GUARD doit exister ET être
// câblée dans les DEUX prompts Vision (fiche de paie + relevé bancaire) — un document (image/PDF) peut
// contenir du texte adversarial lu par le modèle. Scan de source (leçon FISC-CONST-LINT : prouver le volume).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VISION_INJECTION_GUARD } from '../../utils/promptSafety';

describe('[SEC-VISION-CONSENT-INJECTION] clause anti-injection Vision', () => {
    it('VISION_INJECTION_GUARD porte la directive anti-injection', () => {
        expect(typeof VISION_INJECTION_GUARD).toBe('string');
        expect(VISION_INJECTION_GUARD.length).toBeGreaterThan(80);
        expect(VISION_INJECTION_GUARD).toMatch(/document/i);
        expect(VISION_INJECTION_GUARD).toMatch(/instruction/i);
        expect(VISION_INJECTION_GUARD).toMatch(/JAMAIS/);
    });

    it('les 2 appels Vision (paie + relevé) incluent la clause', () => {
        const src = readFileSync(resolve(process.cwd(), 'services/claude.ts'), 'utf8');
        // 2 appels Vision doivent exister (prouve le volume avant d'affirmer la couverture).
        const visionCalls = (src.match(/makeClient\(apiKey, 'vision'\)/g) || []).length;
        expect(visionCalls).toBe(2);
        // 1 import + 2 usages dans les system prompts = ≥ 3 occurrences.
        const guardRefs = (src.match(/VISION_INJECTION_GUARD/g) || []).length;
        expect(guardRefs).toBeGreaterThanOrEqual(3);
    });
});
