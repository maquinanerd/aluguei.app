import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers.js';
import { approveAgency, call, registerAgency } from './platform-fixtures.js';
import type { RegisteredAgency } from './platform-fixtures.js';

/**
 * Pedido de link de acesso pelo próprio cliente (Onda 6).
 *
 * O que o teste protege, em ordem:
 * 1. **A rota não diz quem é cliente de quem.** Contato cadastrado e não
 *    cadastrado recebem exatamente a mesma resposta — senão ela vira um
 *    verificador de relação comercial de terceiros.
 * 2. **Quem tem concessão recebe link novo**, e o link antigo deixa de valer:
 *    pedir outro invalida o anterior.
 * 3. **Sem concessão ativa, nada é gerado** — revogar acesso tem de significar
 *    revogar acesso, inclusive contra um pedido de link.
 */

const EMAIL_CLIENTE = 'inquilina.onda6@example.com';
const EMAIL_DESCONHECIDO = 'ninguem.onda6@example.com';

describe('Onda 6 — pedido de link de acesso', () => {
  let app: FastifyInstance;
  let agencia: RegisteredAgency;
  let partyId = '';

  beforeAll(async () => {
    app = await buildTestApp();
    agencia = await registerAgency(app);
    await approveAgency(app, agencia.org.id, 'ILIMITADO');

    const pessoa = await call(app, 'POST', '/parties', {
      cookie: agencia.cookie,
      payload: {
        type: 'PERSON',
        name: 'Fernanda Inquilina',
        identities: [
          { kind: 'CPF', value: '52998224725' },
          { kind: 'EMAIL', value: EMAIL_CLIENTE },
        ],
      },
    });
    expect(pessoa.status, JSON.stringify(pessoa.body)).toBe(201);
    partyId = (pessoa.body.party as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function pedirLink(contact: string): Promise<number> {
    const res = await call(app, 'POST', '/portal/auth/request-link', {
      remoteAddress: `10.60.${String(Math.floor(Math.random() * 200))}.1`,
      payload: { contact },
    });
    return res.status;
  }

  async function mensagensPara(email: string): Promise<number> {
    const res = await call(app, 'GET', `/dev/email-outbox?to=${encodeURIComponent(email)}`, {
      remoteAddress: '10.60.0.9',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return (res.body as { messages: unknown[] }).messages.length;
  }

  it('responde igual para contato conhecido e desconhecido', async () => {
    const semConcessao = await pedirLink(EMAIL_CLIENTE);
    const desconhecido = await pedirLink(EMAIL_DESCONHECIDO);
    expect(semConcessao).toBe(200);
    expect(desconhecido).toBe(200);
  });

  it('sem concessão ativa, nenhuma mensagem é gerada', async () => {
    // A pessoa existe, mas a imobiliária nunca deu acesso ao portal.
    expect(await mensagensPara(EMAIL_CLIENTE)).toBe(0);
  });

  it('com concessão, gera link novo e o anterior deixa de valer', async () => {
    const concessao = await call(app, 'POST', '/portal/access', {
      cookie: agencia.cookie,
      payload: { partyId, kind: 'TENANT' },
    });
    expect(concessao.status, JSON.stringify(concessao.body)).toBe(201);
    const tokenAntigo = (concessao.body as { oneTimeToken: string }).oneTimeToken;

    expect(await pedirLink(EMAIL_CLIENTE)).toBe(200);
    expect(await mensagensPara(EMAIL_CLIENTE)).toBe(1);

    // Pedir outro link invalida o anterior: o token antigo não abre mais.
    const antigo = await call(app, 'POST', '/portal/auth/consume', {
      remoteAddress: '10.60.0.11',
      payload: { token: tokenAntigo },
    });
    expect(antigo.status).toBe(401);
  });

  it('contato desconhecido continua sem gerar mensagem nenhuma', async () => {
    expect(await pedirLink(EMAIL_DESCONHECIDO)).toBe(200);
    expect(await mensagensPara(EMAIL_DESCONHECIDO)).toBe(0);
  });
});
