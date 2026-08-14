/**
 * Secret scan local (sem dependência externa): varre o repo por padrões de
 * segredo conhecidos e falha se encontrar. Uso: `node scripts/security-scan.mjs`.
 * Documentado em docs/THREAT_MODEL.md (secret scanning).
 *
 * Allowlist: compara o VALOR CAPTURADO do match (nunca a linha inteira) com a
 * lista de fakes determinísticos documentados. Um segredo real na mesma linha
 * de um fake ainda é detectado.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  '.expo',
  'dist',
  'build',
  'coverage',
  'assets',
  '.expo-shared',
]);

const IGNORE_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.lock',
  '.snap',
  '.map',
  '.woff',
  '.woff2',
  '.ttf',
]);

/**
 * Padrões com grupo de captura do valor do segredo.
 * O grupo $1 é o que vai contra a allowlist.
 */
const PATTERNS = [
  { name: 'aws-access-key', re: /\b(AKIA[0-9A-Z]{16})\b/ },
  { name: 'stripe-live-key', re: /\b(sk_live_[0-9a-zA-Z]{20,})\b/ },
  { name: 'stripe-restricted', re: /\b(rk_live_[0-9a-zA-Z]{20,})\b/ },
  { name: 'github-pat', re: /\b(ghp_[0-9a-zA-Z]{36,})\b/ },
  { name: 'private-key', re: /-----BEGIN (RSA|OPENSSH|EC|DSA|PGP) PRIVATE KEY-----/ },
  { name: 'meta-token', re: /\b(EAAG[0-9A-Za-z_-]{20,}|EAA[0-9A-Za-z_-]{20,})\b/ },
  { name: 'google-api-key', re: /\b(AIza[0-9A-Za-z_-]{30,})\b/ },
  { name: 'openai-key', re: /\b(sk-(proj-|ant-|)[0-9A-Za-z_-]{20,})\b/ },
  { name: 'anthropic-key', re: /\b(sk-ant-[0-9A-Za-z_-]{20,})\b/ },
  { name: 'slack-token', re: /\b(xox[baprs]-[0-9A-Za-z-]{20,})\b/ },
  { name: 'sendgrid-key', re: /\b(SG\.[0-9A-Za-z_-]{20,})\b/ },
  { name: 'brevo-key', re: /\b(xkeysib-[0-9A-Za-z-]{20,})\b/ },
  {
    name: 'generic-secret-assignment',
    re: /(?:api[_-]?key|client[_-]?secret|access[_-]?token|secret|password)\s*[:=]\s*["']?([0-9a-zA-Z_\-.]{24,})["']?/i,
  },
  {
    name: 'connection-string',
    re: /\b(postgres|postgresql|mysql|redis|rediss):\/\/[^\s"']+:[^\s"']+@[^\s"']+/i,
  },
];

/**
 * Valores de teste/fake documentados (determinísticos). Comparação exata do
 * valor capturado — adicionar novos fakes AQUI, nunca pela linha inteira.
 */
const ALLOWLIST_VALUES = new Set([
  'fake-verify-token',
  'senha-segura-123',
  'EAAG-fake-dry-run-token',
  'EAAG-token-super-secreto',
  'a'.repeat(64), // chave AES de teste do config (roundtrip)
]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (!IGNORE_DIRS.has(entry)) {
        walk(full, files);
      }
    } else if (!IGNORE_EXT.has(entry.split('.').pop())) {
      files.push(full);
    }
  }
  return files;
}

const findings = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue; // binário/encoding não lido
  }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 500) {
      continue;
    }
    for (const pattern of PATTERNS) {
      const match = pattern.re.exec(line);
      if (!match) {
        continue;
      }
      // connection-string captura a URL completa no match[0] (grupo 1 é só o scheme).
      const captured = pattern.name === 'connection-string' ? match[0] : (match[1] ?? match[0]);
      // Falsos positivos legítimos:
      // - conexão local (localhost/127.0.0.1) nunca é segredo;
      // - atribuição de variável de ambiente (`env.X` / `process.env.X`).
      if (captured.includes('localhost') || captured.includes('127.0.0.1')) {
        continue;
      }
      if (/^(env|process\.env)\./.test(captured) || captured.includes('process.env.')) {
        continue;
      }
      if (ALLOWLIST_VALUES.has(captured)) {
        continue;
      }
      findings.push({
        file: rel,
        line: i + 1,
        pattern: pattern.name,
        snippet: line.trim().slice(0, 100),
      });
    }
  }
}

if (findings.length > 0) {
  console.error('Secret scan FAILED:');
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line} [${f.pattern}] ${f.snippet}`);
  }
  process.exit(1);
}
console.log('Secret scan OK: nenhum segredo encontrado.');
