/**
 * Boot da stack E2E (./stack.mjs) em processo Node próprio:
 *   node tests/e2e/scripts/boot-stack.mjs                     → sobe e fica no ar (Ctrl+C derruba)
 *   node tests/e2e/scripts/boot-stack.mjs --stop              → derruba a stack registrada
 *   node tests/e2e/scripts/boot-stack.mjs --stop-if-playwright → idem, só se foi o Playwright que subiu
 * O Playwright usa este script como webServer (E2E_STACK_MODE=playwright) e
 * chama --stop-if-playwright no globalTeardown. O módulo roda fora do runner
 * de propósito: o loader ESM do Playwright 1.49 trava ao importar .mjs no
 * globalSetup (Node 24).
 */
import { bootStack, log, PORTS, stopRecordedStack, stopStack } from './stack.mjs';

if (process.argv.includes('--stop')) {
  stopRecordedStack();
  process.exit(0);
}
if (process.argv.includes('--stop-if-playwright')) {
  stopRecordedStack({ onlyMode: 'playwright' });
  process.exit(0);
}

const mode = process.env.E2E_STACK_MODE === 'playwright' ? 'playwright' : 'manual';
let state;
try {
  state = await bootStack({ mode });
} catch (err) {
  console.error(`[e2e-stack] boot falhou: ${err.message}`);
  process.exit(1);
}
log(
  `web http://localhost:${PORTS.web} · API http://127.0.0.1:${PORTS.api} — Ctrl+C para derrubar.`,
);

const shutdown = () => {
  stopStack(state);
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30);
