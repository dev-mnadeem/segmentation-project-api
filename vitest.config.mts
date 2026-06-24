import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // The API tests build a fresh in-memory container per file; running files
    // in parallel is safe because nothing is shared between them.
    restoreMocks: true,
  },
});
