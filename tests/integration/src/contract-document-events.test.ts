import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { FakeScreeningProvider } from '@aluguei/integrations';
import { runInboxJobs } from '@aluguei/worker';
import { buildTestApp, fakePayments, fakeSignature } from './helpers.js';
import { createContractFixtures } from './contract-fixtures.js';

/**
 * P2-08 (auditoria 2026-09-10): o texto do contrato saía com o aluguel em
 * centavos crus ("ALUGUEL 250000"); o template era obrigado a usar todas as
 * variáveis oferecidas; `signature_events` nunca era gravada; e
 * `PATCH /contracts/:id/status` gravava VOID e respondia 400 (schema de
 * resposta errado) depois de efetivar.
 */

interface AggregateBody {
  contract: { contract: { status: string; content: string | null } };
}

interface SignatureEventRow {
  provider: string;
  event_type: string;
  provider_event_id: string;
  org_id: string;
  payload: Record<string, unknown>;
}

describe('P2-08: texto do contrato, trilha de assinatura e resposta do cancelamento', () => {
  let app: FastifyInstance;
  let fx: ReturnType<typeof createContractFixtures>;
  const screening = new FakeScreeningProvider();

  function worker() {
    return runInboxJobs({
      db: app.db,
      limit: 50,
      screening,
      signature: fakeSignature,
      payments: fakePayments,
    });
  }

  beforeAll(async () => {
    app = await buildTestApp();
    fx = createContractFixtures(app, worker);
  });

  afterAll(async () => {
    await app.close();
  });

  async function eventsOf(providerEnvelopeId: string): Promise<SignatureEventRow[]> {
    return fx.rows<SignatureEventRow>(sql`
      select se.provider, se.event_type, se.provider_event_id, se.org_id::text as org_id,
             se.payload
      from signature_events se
      join signature_envelopes e on e.id = se.envelope_id
      where e.provider_envelope_id = ${providerEnvelopeId}
    `);
  }

  it('aluguel sai em R$ no corpo — variável monthlyRent e o legado {{monthlyRentCents}}', async () => {
    const contract = await fx.draftContract({
      rentCents: 250_000,
      templateBody:
        'ALUGUEL: {{monthlyRent}} | LEGADO: {{monthlyRentCents}} | LOCATARIO: {{tenantName}}',
    });
    const res = await fx.generate(contract);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const content = (res.body as unknown as AggregateBody).contract.contract.content;
    expect(content).toBe(
      'ALUGUEL: R$ 2.500,00 | LEGADO: R$ 2.500,00 | LOCATARIO: Locatária Contrato',
    );
    expect(content).not.toContain('250000');
  });

  it('template usa só parte das variáveis; placeholder desconhecido continua 400 sem gerar', async () => {
    const partial = await fx.draftContract({ templateBody: 'LOCATARIO: {{tenantName}}' });
    const generated = await fx.generate(partial);
    expect(generated.status, JSON.stringify(generated.body)).toBe(200);
    expect((generated.body as unknown as AggregateBody).contract.contract.content).toBe(
      'LOCATARIO: Locatária Contrato',
    );

    const typo = await fx.draftContract({ templateBody: 'LOCATARIO: {{tenantNome}}' });
    const refused = await fx.generate(typo);
    expect(refused.status, JSON.stringify(refused.body)).toBe(400);
    expect(JSON.stringify(refused.body)).toContain('tenantNome');
    expect((await fx.contractRow(typo.contractId)).status).toBe('DRAFT');
  });

  it('webhook de assinatura grava signature_events na chegada, uma linha por evento do provider', async () => {
    const contract = await fx.sentContract({ landlord: true });
    const signer1 = await fx.signatureWebhook(contract.providerEnvelopeId, {
      eventType: 'SIGNER_SIGNED',
      signerOrder: 1,
    });
    expect(signer1.status).toBe(200);
    // Reentrega do mesmo evento pelo provider: nenhuma linha nova.
    const replay = await fx.call('POST', '/webhooks/signature', {
      payload: {
        provider: 'FAKE',
        providerEventId: signer1.providerEventId,
        providerEnvelopeId: contract.providerEnvelopeId,
        eventType: 'SIGNER_SIGNED',
        signerOrder: 1,
      },
    });
    expect(replay.status).toBe(200);

    // Gravado na chegada, antes de o worker processar.
    const received = await eventsOf(contract.providerEnvelopeId);
    expect(received).toEqual([
      expect.objectContaining({
        provider: 'FAKE',
        event_type: 'SIGNER_SIGNED',
        provider_event_id: signer1.providerEventId,
        org_id: contract.orgId,
      }),
    ]);
    expect(received[0]?.payload).toMatchObject({ signerOrder: 1 });

    const signer2 = await fx.signatureWebhook(contract.providerEnvelopeId, {
      eventType: 'SIGNER_SIGNED',
      signerOrder: 2,
    });
    const completed = await fx.signatureWebhook(contract.providerEnvelopeId, {
      eventType: 'COMPLETED',
    });
    await worker();
    expect((await fx.contractRow(contract.contractId)).status).toBe('SIGNED');
    const all = await eventsOf(contract.providerEnvelopeId);
    expect(all.map((event) => event.provider_event_id).sort()).toEqual(
      [signer1.providerEventId, signer2.providerEventId, completed.providerEventId].sort(),
    );
    expect(all.map((event) => event.event_type).sort()).toEqual(
      ['COMPLETED', 'SIGNER_SIGNED', 'SIGNER_SIGNED'].sort(),
    );

    // Envelope desconhecido: ignorado, sem linha.
    const unknown = await fx.signatureWebhook('env.inexistente', { eventType: 'COMPLETED' });
    expect(unknown.status).toBe(200);
    const [orphans] = await fx.rows<{ n: number }>(
      sql`select count(*)::int as n from signature_events where provider_event_id = ${unknown.providerEventId}`,
    );
    expect(orphans?.n).toBe(0);
  });

  it('PATCH /contracts/:id/status VOID → 200 com o agregado; transição inválida → 409 sem escrita', async () => {
    const contract = await fx.generatedContract();
    const res = await fx.call('PATCH', `/contracts/${contract.contractId}/status`, {
      cookie: contract.cookie,
      payload: { status: 'VOID' },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((res.body as unknown as AggregateBody).contract.contract.status).toBe('VOID');
    expect((await fx.contractRow(contract.contractId)).status).toBe('VOID');

    const signed = await fx.signedContract();
    const before = await fx.contractRow(signed.contractId);
    const refused = await fx.call('PATCH', `/contracts/${signed.contractId}/status`, {
      cookie: signed.cookie,
      payload: { status: 'VOID' },
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(await fx.contractRow(signed.contractId)).toEqual(before);
  });
});
