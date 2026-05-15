// Setup global pour tests Vitest (jest-dom matchers + cleanup React).
// Chargé via vitest.config.ts setupFiles.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
    cleanup();
});
