// tests/utils/zodSansEval.test.ts
//
// [S5-ZOD4-CSP] Garde de utils/zodSansEval.ts : zod doit tourner SANS eval dans le navigateur, sinon sa
// sonde `new Function` viole la CSP (Lighthouse bonnes pratiques < 1, budget bloquant). Deux choses à
// tenir : le réglage lui-même, et l'ORDRE (importé avant tout le reste par index.tsx).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { globalConfig } from 'zod/v4/core';
import { z } from 'zod';
import '../../utils/zodSansEval';

describe('[S5-ZOD4-CSP] zod sans eval', () => {
    it('active jitless sur la configuration partagée par `zod`', () => {
        expect(globalConfig.jitless).toBe(true);
        // Le mode sans JIT valide toujours (et retire les clés inconnues, comme avant).
        expect(z.object({ a: z.number() }).parse({ a: 1, b: 2 })).toEqual({ a: 1 });
    });

    it('index.tsx l\'importe en PREMIER, avant tout autre module', () => {
        const source = readFileSync(resolve(process.cwd(), 'index.tsx'), 'utf8');
        const imports = source.split('\n').filter((l) => /^import\s/.test(l));
        expect(imports[0]).toBe("import './utils/zodSansEval';");
    });
});
