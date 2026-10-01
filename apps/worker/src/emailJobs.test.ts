import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { auditEvents, createTestDb, emailOutbox } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { EmailProviderError, FakeEmailSender } from '@aluguei/integrations';
import { EMAIL_MAX_ATTEMPTS, esperaDepoisDe, runEmailOutbox } from './emailJobs.js';

/**
 * Entrega da caixa de saída de e-mail (B28, D6 b): o worker manda o que está na fila pelo
 * provedor, repete com espera o que vale repetir e desiste do resto — sem deixar o corpo (que tem
 * link com token) nem o destinatário na auditoria.
 */

const T0 = new Date('2026-09-30T15:00:00.000Z');
const depois = (ms: number) => new Date(T0.getTime() + ms);

let db: AppDb;

beforeEach(async () => {
  db = await createTestDb();
});

async function mensagem(criadaEm = T0): Promise<string> {
  const [row] = await db
    .insert(emailOutbox)
    .values({
      orgId: null,
      kind: 'PASSWORD_RESET',
      toEmail: `pessoa-${randomUUID().slice(0, 8)}@example.com`,
      subject: 'Redefinir a senha',
      body: 'Use o link: https://achouimovel.online/redefinir-senha?token=segredo-do-link',
      createdAt: criadaEm,
    })
    .returning({ id: emailOutbox.id });
  if (!row) throw new Error('semente');
  return row.id;
}

async function ler(id: string) {
  const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id));
  if (!row) throw new Error('mensagem sumiu');
  return row;
}

async function auditoriaDe(id: string, action: string) {
  return db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.entityId, id), eq(auditEvents.action, action)));
}

describe('entrega da caixa de saída de e-mail', () => {
  it('sem provedor, nada sai: a mensagem fica na caixa de saída', async () => {
    const id = await mensagem();
    expect(await runEmailOutbox({ db, sender: null, now: () => T0 })).toEqual({ processed: 0 });
    expect(await ler(id)).toMatchObject({ status: 'QUEUED', attempts: 0, sentAt: null });
  });

  it('entrega: SENT com o id do provedor, e a auditoria sem corpo nem destinatário', async () => {
    const id = await mensagem();
    const provedor = new FakeEmailSender();
    expect(await runEmailOutbox({ db, sender: provedor, now: () => T0 })).toEqual({
      processed: 1,
    });
    const linha = await ler(id);
    expect(linha).toMatchObject({
      status: 'SENT',
      attempts: 1,
      lastError: null,
      nextAttemptAt: null,
      providerMessageId: `fake-${id}`,
    });
    expect(linha.sentAt?.toISOString()).toBe(T0.toISOString());
    expect(provedor.sent).toEqual([
      { id, to: linha.toEmail, subject: 'Redefinir a senha', text: linha.body },
    ]);
    const [evento] = await auditoriaDe(id, 'email.sent');
    expect(evento?.payload).toEqual({ kind: 'PASSWORD_RESET', provider: 'FAKE', attempts: 1 });
    const gravado = JSON.stringify(evento);
    expect(gravado).not.toContain('token');
    expect(gravado).not.toContain(linha.toEmail);
  });

  it('falha que vale repetir volta para a fila e só é tentada depois da espera', async () => {
    const id = await mensagem();
    const provedor = new FakeEmailSender();
    provedor.failNext(new EmailProviderError('RATE_LIMIT', 'Resend HTTP 429: limite'));
    await runEmailOutbox({ db, sender: provedor, now: () => T0 });
    expect(await ler(id)).toMatchObject({
      status: 'QUEUED',
      attempts: 1,
      lastError: 'Resend HTTP 429: limite',
      nextAttemptAt: depois(60_000),
    });

    // Antes da espera, a mensagem nem é lida.
    await runEmailOutbox({ db, sender: provedor, now: () => depois(30_000) });
    expect(provedor.sent).toEqual([]);

    await runEmailOutbox({ db, sender: provedor, now: () => depois(61_000) });
    expect(await ler(id)).toMatchObject({ status: 'SENT', attempts: 2, lastError: null });
    expect(await auditoriaDe(id, 'email.failed')).toEqual([]);
  });

  it('recusa do provedor vira FAILED na hora, com auditoria do código', async () => {
    const id = await mensagem();
    const provedor = new FakeEmailSender();
    provedor.failNext(new EmailProviderError('INVALID_INPUT', 'Resend HTTP 422: remetente'));
    await runEmailOutbox({ db, sender: provedor, now: () => T0 });
    expect(await ler(id)).toMatchObject({ status: 'FAILED', attempts: 1, nextAttemptAt: null });
    const [evento] = await auditoriaDe(id, 'email.failed');
    expect(evento?.payload).toEqual({
      kind: 'PASSWORD_RESET',
      provider: 'FAKE',
      attempts: 1,
      code: 'INVALID_INPUT',
    });
  });

  it(`desiste depois de ${String(EMAIL_MAX_ATTEMPTS)} tentativas, com espera crescente`, async () => {
    const id = await mensagem();
    const provedor = new FakeEmailSender();
    let agora = T0;
    for (let tentativa = 1; tentativa <= EMAIL_MAX_ATTEMPTS; tentativa += 1) {
      provedor.failNext(new EmailProviderError('HTTP', 'Resend HTTP 503'));
      await runEmailOutbox({ db, sender: provedor, now: () => agora });
      const linha = await ler(id);
      expect(linha.attempts).toBe(tentativa);
      if (tentativa < EMAIL_MAX_ATTEMPTS) {
        expect(linha.status).toBe('QUEUED');
        expect(linha.nextAttemptAt?.getTime()).toBe(agora.getTime() + esperaDepoisDe(tentativa));
        agora = new Date(agora.getTime() + esperaDepoisDe(tentativa));
      } else {
        expect(linha.status).toBe('FAILED');
      }
    }
    expect([1, 2, 3, 4, 5].map(esperaDepoisDe)).toEqual([
      60_000, 300_000, 900_000, 3_600_000, 3_600_000,
    ]);
    expect(await auditoriaDe(id, 'email.failed')).toHaveLength(1);
  });

  it('o motivo guardado não tem link nem endereço, mesmo de um erro qualquer', async () => {
    const id = await mensagem();
    const provedor = new FakeEmailSender();
    provedor.failNext(
      new Error('falhou para pessoa@example.com em https://api.exemplo.com/emails?token=x'),
    );
    await runEmailOutbox({ db, sender: provedor, now: () => T0 });
    expect(await ler(id)).toMatchObject({
      status: 'QUEUED',
      lastError: 'falhou para [e-mail] em [url]',
    });
  });

  it('a mais antiga primeiro, dentro do limite do ciclo', async () => {
    const segunda = await mensagem(depois(1_000));
    const primeira = await mensagem(T0);
    const terceira = await mensagem(depois(2_000));
    const provedor = new FakeEmailSender();
    await runEmailOutbox({ db, sender: provedor, now: () => depois(5_000), limit: 2 });
    expect(provedor.sent.map((m) => m.id)).toEqual([primeira, segunda]);
    expect((await ler(terceira)).status).toBe('QUEUED');
  });
});
