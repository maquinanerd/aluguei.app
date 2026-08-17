import { defineConfig } from '@playwright/test';

/**
 * E2E do Aluguei.app contra a stack local (PG + API + worker + web), todos com
 * providers FAKE via env (PAYMENT_PROVIDER/SIGNATURE_PROVIDER/SCREENING_PROVIDER
 * = FAKE, META_MODE=dry_run, AI_PROVIDER=mock). Nenhum efeito externo real.
 *
 * Pré-requisito: binários do PostgreSQL local. O boot é feito pelo script
 * scripts/boot-stack.mjs (executado via webServer) que sobe o cluster em porta
 * isolada (5433) e aplica migrations. Se a stack já estiver no ar
 * (reuseExistingServer), o boot não é refeito.
 */
export default defineConfig({
  testDir: './src',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/boot-stack.mjs',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
