import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests services: Node (rapide). Tests composants: jsdom via __jsdom__ env override.
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/components/**', 'jsdom'],
      ['tests/store/**', 'jsdom'],
      ['tests/a11y/**', 'jsdom'],
    ],
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
  },
});
