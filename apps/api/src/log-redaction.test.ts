import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { loggerOptions } from '@aluguei/observability';
import { buildApp } from './app.js';

/**
 * P2-11 (auditoria 2026-09-10) no log de requisição da API: a busca de pessoas aceita CPF,
 * e-mail e telefone em `q`, e a URL inteira ia para o log de "incoming request". O logger da
 * API (o mesmo de `index.ts`) redige a URL e nunca registra o cookie de sessão.
 */
describe('log de requisição da API sem dado pessoal (P2-11)', () => {
  it('URL com CPF, e-mail e telefone e cookie de sessão não chegam ao log', async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const app = await buildApp({ logger: { ...loggerOptions({ level: 'info' }), stream } });
    try {
      for (const q of ['529.982.247-25', 'maria.souza@exemplo.com.br', '(11) 91234-5678']) {
        await app.inject({
          method: 'GET',
          url: `/parties?q=${encodeURIComponent(q)}&limit=20`,
          headers: { cookie: 'aluguei_session=sessao-secreta-123' },
        });
      }
      await app.inject({ method: 'GET', url: '/public/parties/maria.souza@exemplo.com.br' });
    } finally {
      await app.close();
    }
    const output = chunks.join('');
    expect(output).toContain('incoming request');
    expect(output).toContain('limit=20');
    for (const value of [
      '529.982.247-25',
      '529.982',
      'maria.souza',
      'exemplo.com.br',
      '91234-5678',
      '91234',
      'sessao-secreta-123',
    ]) {
      expect(output, value).not.toContain(value);
    }
  });
});
