import { defineConfig } from 'vitest/config';

/**
 * Suíte com PostgreSQL real (TEST_DATABASE_URL): corridas entre conexões e
 * processos que o PGlite não reproduz. Fica fora do `pnpm test` padrão (que não
 * exige servidor) e roda como gate próprio: `pnpm test:pg` (local e CI).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.pg.test.ts'],
    hookTimeout: 180_000,
    testTimeout: 180_000,
    fileParallelism: false,
    maxWorkers: 1,
  },
});
