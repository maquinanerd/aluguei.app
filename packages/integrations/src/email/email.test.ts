import { describe, expect, it } from 'vitest';
import { FakeEmailSender } from './fake.js';
import { getEmailSender } from './registry.js';
import { ResendEmailSender } from './resend.js';
import { EmailProviderError } from './types.js';
import type { EmailMessage } from './types.js';

/** Entrega de e-mail sobre a caixa de saída (B28, D6 b): adapter da Resend e o registro. */

const MENSAGEM: EmailMessage = {
  id: '0b7d2c1e-5b7a-4f0e-9a51-7f1c2a3e4d5f',
  to: 'pessoa@example.com',
  subject: 'Confirme seu alerta de imóvel',
  text: 'Confirme pelo link: https://achouimovel.online/alerta/confirmado?token=segredo',
};

interface Chamada {
  url: string;
  init: RequestInit;
}

function fetchQueResponde(status: number, corpo: unknown, chamadas: Chamada[] = []): typeof fetch {
  return ((url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    return Promise.resolve(
      new Response(JSON.stringify(corpo), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }) as unknown as typeof fetch;
}

function resend(fetchImpl: typeof fetch, timeoutMs?: number): ResendEmailSender {
  return new ResendEmailSender({
    apiKey: 're_chave_de_teste',
    from: 'AchouImóvel <nao-responda@achouimovel.online>',
    fetchImpl,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

async function erroDe(promessa: Promise<unknown>): Promise<EmailProviderError> {
  try {
    await promessa;
  } catch (err) {
    if (err instanceof EmailProviderError) return err;
    throw err;
  }
  throw new Error('a entrega deveria ter falhado');
}

describe('ResendEmailSender', () => {
  it('manda a mensagem com a chave, o remetente e o id da caixa de saída como idempotência', async () => {
    const chamadas: Chamada[] = [];
    const resultado = await resend(fetchQueResponde(200, { id: 'msg_123' }, chamadas)).send(
      MENSAGEM,
    );
    expect(resultado).toEqual({ providerMessageId: 'msg_123' });
    expect(chamadas).toHaveLength(1);
    const [chamada] = chamadas;
    expect(chamada?.url).toBe('https://api.resend.com/emails');
    expect(chamada?.init.method).toBe('POST');
    const cabecalhos = new Headers(chamada?.init.headers);
    expect(cabecalhos.get('authorization')).toBe('Bearer re_chave_de_teste');
    expect(cabecalhos.get('idempotency-key')).toBe(MENSAGEM.id);
    expect(JSON.parse(chamada?.init.body as string)).toEqual({
      from: 'AchouImóvel <nao-responda@achouimovel.online>',
      to: ['pessoa@example.com'],
      subject: 'Confirme seu alerta de imóvel',
      text: MENSAGEM.text,
    });
  });

  it.each([
    [401, 'AUTH', false],
    [403, 'AUTH', false],
    [422, 'INVALID_INPUT', false],
    [429, 'RATE_LIMIT', true],
    [500, 'HTTP', true],
    [503, 'HTTP', true],
  ] as const)('HTTP %i vira %s (nova tentativa: %s)', async (status, codigo, tentarDeNovo) => {
    const erro = await erroDe(
      resend(fetchQueResponde(status, { message: 'motivo do provedor' })).send(MENSAGEM),
    );
    expect(erro.code).toBe(codigo);
    expect(erro.retryable).toBe(tentarDeNovo);
    expect(erro.status).toBe(status);
    expect(erro.message).toBe(`Resend HTTP ${String(status)}: motivo do provedor`);
  });

  it('o erro nunca repete o destinatário nem o corpo (o link tem token)', async () => {
    const erro = await erroDe(resend(fetchQueResponde(422, { message: 'x' })).send(MENSAGEM));
    expect(erro.message).not.toContain('pessoa@example.com');
    expect(erro.message).not.toContain('token');
  });

  it('sem resposta no prazo, TIMEOUT com nova tentativa', async () => {
    const pendurado = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      })) as unknown as typeof fetch;
    const erro = await erroDe(resend(pendurado, 20).send(MENSAGEM));
    expect(erro.code).toBe('TIMEOUT');
    expect(erro.retryable).toBe(true);
  });

  it('falha de rede e resposta sem id também podem ser tentadas de novo', async () => {
    const semRede = (() =>
      Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;
    expect((await erroDe(resend(semRede).send(MENSAGEM))).retryable).toBe(true);
    const semId = await erroDe(resend(fetchQueResponde(200, {})).send(MENSAGEM));
    expect([semId.code, semId.retryable]).toEqual(['HTTP', true]);
  });
});

describe('getEmailSender', () => {
  it('sem provedor, ninguém entrega: a mensagem fica na caixa de saída', () => {
    expect(getEmailSender()).toBeNull();
    expect(getEmailSender({ provider: 'RESEND' })).toBeNull();
    expect(getEmailSender({ provider: 'RESEND', apiKey: 're_x' })).toBeNull();
  });

  it('RESEND com chave e remetente; FAKE; e o injetado vence', () => {
    expect(getEmailSender({ provider: 'RESEND', apiKey: 're_x', from: 'a@b.c' })?.provider).toBe(
      'RESEND',
    );
    expect(getEmailSender({ provider: 'FAKE' })?.provider).toBe('FAKE');
    const injetado = new FakeEmailSender();
    expect(getEmailSender({ provider: 'RESEND', fake: injetado })).toBe(injetado);
  });

  it('o falso guarda o que entregou e falha quando mandado', async () => {
    const falso = new FakeEmailSender();
    falso.failNext(new EmailProviderError('RATE_LIMIT', 'limite'));
    await expect(falso.send(MENSAGEM)).rejects.toBeInstanceOf(EmailProviderError);
    expect(await falso.send(MENSAGEM)).toEqual({ providerMessageId: `fake-${MENSAGEM.id}` });
    expect(falso.sent).toEqual([MENSAGEM]);
  });
});
