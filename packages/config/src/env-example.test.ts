import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { envSchema } from './env.js';
import { loadRuntimeEnv } from './runtime.js';

/**
 * `.env.example` e o schema de configuração andam juntos (G3, Trilha F, F-2): quem copia o
 * exemplo precisa ver todas as variáveis que API, worker e web leem, e o exemplo não pode trazer
 * variável que nenhum processo lê. O exemplo também precisa ser uma configuração válida de
 * desenvolvimento, sem segredo preenchido.
 */
const EXAMPLE = fileURLToPath(new URL('../../../.env.example', import.meta.url));

function parseExample(): { keys: string[]; values: Record<string, string> } {
  const keys: string[] = [];
  const values: Record<string, string> = {};
  for (const raw of readFileSync(EXAMPLE, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match?.[1]) {
      throw new Error(`linha fora do formato CHAVE=valor no .env.example: ${line}`);
    }
    keys.push(match[1]);
    values[match[1]] = match[2] ?? '';
  }
  return { keys, values };
}

describe('.env.example × envSchema', () => {
  it('toda chave do schema está no exemplo e toda chave do exemplo está no schema', () => {
    const schemaKeys = Object.keys(envSchema.shape).sort();
    const exampleKeys = [...new Set(parseExample().keys)].sort();
    // Os dois lados numa asserção só: a falha mostra a diferença inteira.
    expect({
      noSchemaForaDoExemplo: schemaKeys.filter((key) => !exampleKeys.includes(key)),
      noExemploForaDoSchema: exampleKeys.filter((key) => !schemaKeys.includes(key)),
    }).toEqual({ noSchemaForaDoExemplo: [], noExemploForaDoSchema: [] });
  });

  it('nenhuma chave aparece duas vezes', () => {
    const { keys } = parseExample();
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
  });

  it('o exemplo, sem os vazios, é uma configuração válida de desenvolvimento para API e worker', () => {
    const { values } = parseExample();
    const filled = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
    expect(filled.NODE_ENV).toBe('development');
    expect(() => loadRuntimeEnv('api', filled)).not.toThrow();
    expect(() => loadRuntimeEnv('worker', filled)).not.toThrow();
  });

  it('segredos e credenciais ficam vazios no exemplo', () => {
    const { values } = parseExample();
    const secretLike = Object.keys(values).filter((key) =>
      /(SECRET|TOKEN|PASSWORD|API_KEY|ACCESS_KEY|ENCRYPTION_KEY|CLIENT_ID|DSN)/.test(key),
    );
    expect(secretLike.length).toBeGreaterThan(0);
    expect(secretLike.filter((key) => values[key] !== '')).toEqual([]);
  });
});
