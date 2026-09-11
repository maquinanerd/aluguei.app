// Extracts every Fastify route (method + path + file:line) from apps/api/src/routes.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT =
  'C:/Users/pablo/Documents/OpenCode/Aluguei-app/.claude/worktrees/aluguei-technical-audit-6cea11';
const dir = join(ROOT, 'apps/api/src/routes');
const out = [];
for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
  const src = readFileSync(join(dir, f), 'utf8');
  const re =
    /\b(app|fastify|instance)\.(get|post|put|patch|delete)\s*(<[\s\S]*?>)?\s*\(\s*(['"`])([^'"`]+)\4/g;
  let m;
  while ((m = re.exec(src))) {
    const line = src.slice(0, m.index).split('\n').length;
    // look ahead in the following ~1500 chars for permission / auth markers
    const window = src.slice(m.index, m.index + 1500);
    const perm = /requirePermission\(\s*['"]([^'"]+)['"]/.exec(window);
    const portal = /requirePortal|portalSession|requirePortalSession/.test(window);
    const auth = /requireAuth|requireSession|preHandler/.test(window);
    out.push({
      method: m[2].toUpperCase(),
      path: m[5],
      file: `apps/api/src/routes/${f}:${line}`,
      perm: perm ? perm[1] : '',
      portal,
      auth,
    });
  }
}
out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
const byMethod = {};
for (const r of out) byMethod[r.method] = (byMethod[r.method] ?? 0) + 1;
const lines = out.map(
  (r) => `${r.method}\t${r.path}\t${r.file}\tperm=${r.perm || '-'}\tportal=${r.portal}`,
);
writeFileSync(
  'C:/Users/pablo/AppData/Local/Temp/claude/C--Users-pablo-Documents-OpenCode-Aluguei-app--claude-worktrees-aluguei-technical-audit-6cea11/57b60008-7a72-4aed-be9f-ad6fb81a7cff/scratchpad/routes.tsv',
  lines.join('\n') + '\n',
);
console.log('TOTAL', out.length, JSON.stringify(byMethod));
console.log(lines.join('\n'));
