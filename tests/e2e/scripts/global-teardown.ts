import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Derruba a stack que o webServer (boot-stack.mjs) subiu: mata a árvore de
 * processos registrada e para o postgres com `pg_ctl stop`. Necessário porque
 * o postgres iniciado pelo pg_ctl não pertence à árvore do webServer e ficaria
 * órfão. Uma stack manual reutilizada (E2E_REUSE_STACK=1) é mantida.
 */
export default function globalTeardown(): void {
  const script = fileURLToPath(new URL('./boot-stack.mjs', import.meta.url));
  execFileSync(process.execPath, [script, '--stop-if-playwright'], { stdio: 'inherit' });
}
