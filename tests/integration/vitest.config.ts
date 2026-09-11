import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // *.pg.test.ts exigem PostgreSQL real e rodam em `pnpm test:pg` (vitest.pg.config.ts)
    exclude: [...configDefaults.exclude, 'src/**/*.pg.test.ts'],
    hookTimeout: 120_000,
    testTimeout: 60_000,
    // PGlite (Postgres WASM) é pesado: executa arquivos em sequência para
    // evitar estouro de memória com múltiplas instâncias paralelas.
    fileParallelism: false,
    maxWorkers: 1,
  },
});
