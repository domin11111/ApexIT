import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Интеграционные тесты поднимают PostgreSQL и Redis в Docker (Testcontainers)
    hookTimeout: 240_000,
    testTimeout: 30_000,
  },
});
