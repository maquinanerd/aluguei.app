import { defineConfig } from '@playwright/test';

/**
 * E2E do Aluguei.app contra a stack local (PG + API + worker + web), todos com
 * providers FAKE via env (PAYMENT_PROVIDER/SIGNATURE_PROVIDER/SCREENING_PROVIDER
 * = FAKE, META_MODE=dry_run, AI_PROVIDER=mock). Nenhum efeito externo real.
 *
 * O webServer (scripts/boot-stack.mjs → scripts/stack.mjs) sobe a stack do
 * zero a cada execução — cluster PostgreSQL descartável (binários locais em
 * PG_BIN) ou o banco de E2E_DATABASE_URL (CI) — e o globalTeardown a derruba.
 * E2E_REUSE_STACK=1 reutiliza uma stack já no ar (boot-stack.mjs manual).
 */
const WEB_PORT = process.env.WEB_PORT ?? '3000';

export default defineConfig({
  testDir: './src',
  globalTeardown: './scripts/global-teardown.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/boot-stack.mjs',
    url: `http://localhost:${WEB_PORT}`,
    reuseExistingServer: process.env.E2E_REUSE_STACK === '1',
    timeout: 300_000,
    env: { E2E_STACK_MODE: 'playwright' },
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
