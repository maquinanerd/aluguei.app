import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { loggerOptions } from './logger.js';

/**
 * P2-11 (auditoria 2026-09-10): o redact dos logs cobria senha e token, mas não CPF, e-mail,
 * telefone nem cookies. O logger da API e do worker (`loggerOptions`) redige por caminho
 * (chaves conhecidas) e por padrão de valor (texto livre, mensagens de erro, objetos fundos).
 */
const CPF = '529.982.247-25';
const CPF_DIGITS = '52998224725';
const EMAIL = 'maria.souza@exemplo.com.br';
const PHONE = '+55 11 91234-5678';
const WA_ID = '5511912345678';
const COOKIE = 'aluguei_session=sessao-secreta-123';

function capture(): { log: ReturnType<typeof pino>; text: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const log = pino(loggerOptions({ level: 'info' }), stream);
  return { log, text: () => chunks.join('') };
}

function expectNoPii(text: string): void {
  for (const value of [CPF, CPF_DIGITS, EMAIL, PHONE, WA_ID, 'sessao-secreta-123']) {
    expect(text, value).not.toContain(value);
  }
}

describe('redação de dado pessoal nos logs (P2-11)', () => {
  it('cookies por caminho: requisição, resposta e cabeçalhos soltos', () => {
    const { log, text } = capture();
    log.info({ req: { headers: { cookie: COOKIE, 'user-agent': 'vitest' } } }, 'req');
    log.info({ res: { headers: { 'set-cookie': [`${COOKIE}; HttpOnly`] } } }, 'res');
    log.info({ headers: { cookie: COOKIE } }, 'headers');
    log.info({ request: { headers: { cookie: COOKIE } } }, 'aninhado');
    log.info({ cookie: COOKIE }, 'solto');
    expectNoPii(text());
    expect(text()).toContain('vitest');
  });

  it('CPF, e-mail e telefone por caminho, no topo, um nível abaixo e nas identidades', () => {
    const { log, text } = capture();
    log.info({ email: 'x@y', cpf: 'cpf-sem-formato', phone: 'fone-sem-formato' }, 'topo');
    log.info({ party: { email: 'x@y', cpf: 'cpf-sem-formato', document: 'doc-livre' } }, 'nível');
    log.info({ identities: [{ kind: 'CPF', value: 'valor-da-identidade' }] }, 'identidades');
    log.info({ contact: { waContactId: 'wa-sem-formato', phone: 'fone-sem-formato' } }, 'wa');
    const output = text();
    for (const value of [
      'x@y',
      'cpf-sem-formato',
      'fone-sem-formato',
      'doc-livre',
      'valor-da-identidade',
      'wa-sem-formato',
    ]) {
      expect(output, value).not.toContain(value);
    }
    expect(output).toContain('"kind":"CPF"');
  });

  it('por padrão de valor na mensagem e em texto livre de objetos fundos', () => {
    const { log, text } = capture();
    log.info(`cadastro de ${EMAIL} com CPF ${CPF} e telefone ${PHONE}`);
    log.info(
      { job: { payload: { note: `ligar para ${WA_ID} ou (11) 91234-5678, doc ${CPF_DIGITS}` } } },
      'x',
    );
    log.info({ lista: [`contato ${EMAIL}`] }, 'lista');
    expectNoPii(text());
    expect(text()).not.toContain('91234-5678');
  });

  it('erro com dado pessoal na mensagem e na pilha é redigido, e o tipo do erro fica', () => {
    const { log, text } = capture();
    const err = new Error(`duplicate key value: Key (email)=(${EMAIL}) already exists`);
    log.error({ err, causeMessage: `Key (cpf)=(${CPF}) already exists` }, 'unhandled error');
    const output = text();
    expectNoPii(output);
    expect(output).toContain('"type":"Error"');
    expect(output).toContain('duplicate key value');
  });

  it('não confunde identificador, data, duração e valores com dado pessoal', () => {
    const { log, text } = capture();
    const payload = {
      jobId: '550e8400-e29b-41d4-a716-446655440000',
      at: '2026-09-17T12:34:56.789Z',
      epochMs: 1789662704601,
      epochSeconds: 1789662704,
      amountCents: 250000,
      durationMs: 12,
    };
    log.info(payload, 'job concluído');
    const output = text();
    expect(output).toContain('550e8400-e29b-41d4-a716-446655440000');
    expect(output).toContain('2026-09-17T12:34:56.789Z');
    expect(output).toContain('1789662704601');
    expect(output).toContain('"epochSeconds":1789662704');
    expect(output).toContain('"amountCents":250000');
  });

  it('não altera o objeto de quem loga', () => {
    const { log } = capture();
    const job = { payload: { note: `email ${EMAIL}` }, email: EMAIL };
    log.info({ job }, 'x');
    expect(job.payload.note).toBe(`email ${EMAIL}`);
    expect(job.email).toBe(EMAIL);
  });
});
