// tests/hooks/appBootStoragePersistence.test.ts
//
// [STORAGE-PERSIST-REQUEST] Le chaînon : c'est le BOOT qui demande la persistance. Un service testé
// chez lui et un écran testé chez lui ne prouvent pas que quelqu'un appelle la demande — scan de la
// source DÉCOMMENTÉE du hook de boot (le hook monte l'app entière : un rendu réel coûterait plus
// qu'il ne prouverait, et l'appel est un `void requestPersistentStorage()` sans retour observable).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../../utils/stripComments';

const SRC = stripComments(readFileSync(resolve(__dirname, '../../hooks/useAppBootEffects.ts'), 'utf8'));

describe('[STORAGE-PERSIST-REQUEST] useAppBootEffects demande la persistance du stockage au boot', () => {
    it('importe et APPELLE requestPersistentStorage (usage, pas seulement déclaration)', () => {
        expect(SRC).toMatch(/import \{ requestPersistentStorage \} from '\.\.\/services\/storagePersistence'/);
        expect(SRC).toMatch(/void requestPersistentStorage\(\)/);
    });
    it('anti-vacuité : la source décommentée contient encore le boot Drive (le lecteur n\'a pas tout blanchi)', () => {
        expect(SRC).toContain('runBootSync');
    });
});
