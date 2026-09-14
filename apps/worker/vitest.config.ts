import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Mesma acomodação de tests/integration: as suítes do worker sobem PGlite
    // (Postgres WASM) no beforeAll e estouravam o timeout padrão de 10s sob
    // carga — o arquivo era pulado inteiro, sem nenhuma asserção falhar.
    hookTimeout: 120_000,
    testTimeout: 60_000,
    fileParallelism: false,
    maxWorkers: 1,
  },
});
