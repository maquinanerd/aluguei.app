import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { FakeScreeningProvider } from '@aluguei/integrations';
import { runInboxJobs } from '@aluguei/worker';
import { buildTestApp, fakePayments, fakeSignature } from './helpers.js';
import { createContractFixtures } from './contract-fixtures.js';

/**
 * P1-06 (auditoria 2026-09-10): crédito aprovável sem análise. O domínio
 * liberava SUBMITTED → SCREENING para qualquer PATCH, SCREENING → APPROVED sem
 * motivo, `decidedBy` só era gravado com motivo, o worker decidia sem registrar
 * a origem e CONTRACTING nunca era gravado. Regra: SCREENING só pelo pedido de
 * screening; sobre SCREENING só o resultado decide; decisão humana só em
 * MANUAL_REVIEW, com motivo e responsável; decisão automática com origem, regra
 * e resultado auditáveis; CONTRACTING só pela criação do contrato.
 */

interface ApplicationDto {
  status: string;
  decisionReason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionSource?: string | null;
}

interface AggregateDto {
  application: ApplicationDto;
  latestScreeningResult: { id: string; decision: string } | null;
}

interface SubmittedFixture {
  cookie: string;
  userId: string;
  applicationId: string;
}

const HUMAN_REASON = 'Renda comprovada e fiador aprovado pela equipe';

describe('P1-06: decisão de crédito só com análise, motivo e origem auditável', () => {
  let app: FastifyInstance;
  let fx: ReturnType<typeof createContractFixtures>;
  const screening = new FakeScreeningProvider();

  /** `approveScoreMin` acima do score máximo do FAKE (900) força REVIEW. */
  function worker(approveScoreMin?: number) {
    return runInboxJobs({
      db: app.db,
      limit: 50,
      screening,
      signature: fakeSignature,
      payments: fakePayments,
      ...(approveScoreMin !== undefined ? { screeningApproveScoreMin: approveScoreMin } : {}),
    });
  }

  beforeAll(async () => {
    app = await buildTestApp();
    fx = createContractFixtures(app, () => worker());
  });

  afterAll(async () => {
    await app.close();
  });

  async function aggregateOf(fixture: SubmittedFixture): Promise<AggregateDto> {
    const res = await fx.call('GET', `/rental-applications/${fixture.applicationId}`, {
      cookie: fixture.cookie,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as unknown as AggregateDto;
  }

  function patchStatus(fixture: SubmittedFixture, payload: object) {
    return fx.call('PATCH', `/rental-applications/${fixture.applicationId}/status`, {
      cookie: fixture.cookie,
      payload,
    });
  }

  async function submitted(): Promise<SubmittedFixture> {
    const user = await fx.registerOrg();
    const cookie = user.cookie;
    const property = await fx.call('POST', '/properties', {
      cookie,
      payload: { title: `Imóvel Crédito ${fx.uniq()}`, propertyType: 'HOUSE' },
    });
    expect(property.status, JSON.stringify(property.body)).toBe(201);
    const propertyId = (property.body.property as { id: string }).id;
    const tenant = await fx.call('POST', '/parties', {
      cookie,
      payload: {
        type: 'PERSON',
        name: 'Candidata Crédito',
        identities: [{ kind: 'CPF', value: '52998224725' }],
      },
    });
    expect(tenant.status, JSON.stringify(tenant.body)).toBe(201);
    const tenantId = (tenant.body.party as { id: string }).id;
    const consent = await fx.call('POST', `/parties/${tenantId}/consents`, {
      cookie,
      payload: { purpose: 'CREDIT_SCREENING' },
    });
    expect(consent.status, JSON.stringify(consent.body)).toBe(201);
    const application = await fx.call('POST', '/rental-applications', {
      cookie,
      payload: { partyId: tenantId, propertyId },
    });
    expect(application.status, JSON.stringify(application.body)).toBe(201);
    const fixture = {
      cookie,
      userId: user.userId,
      applicationId: (application.body.application as { id: string }).id,
    };
    const submit = await patchStatus(fixture, { status: 'SUBMITTED' });
    expect(submit.status, JSON.stringify(submit.body)).toBe(200);
    return fixture;
  }

  async function inScreening(): Promise<SubmittedFixture> {
    const fixture = await submitted();
    const res = await fx.call('POST', `/rental-applications/${fixture.applicationId}/screening`, {
      cookie: fixture.cookie,
      payload: { provider: 'FAKE' },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect((await aggregateOf(fixture)).application.status).toBe('SCREENING');
    return fixture;
  }

  async function inManualReview(): Promise<SubmittedFixture> {
    const fixture = await inScreening();
    await worker(901);
    const aggregate = await aggregateOf(fixture);
    expect(aggregate.application.status).toBe('MANUAL_REVIEW');
    expect(aggregate.latestScreeningResult?.decision).toBe('REVIEW');
    return fixture;
  }

  const undecided = { decisionReason: null, decidedBy: null, decidedAt: null };

  it('PATCH SUBMITTED → SCREENING sem pedir screening → 409', async () => {
    const application = await submitted();
    const res = await patchStatus(application, { status: 'SCREENING' });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect((await aggregateOf(application)).application.status).toBe('SUBMITTED');
    const [requests] = await fx.rows<{ n: number }>(
      sql`select count(*)::int as n from screening_requests where application_id = ${application.applicationId}`,
    );
    expect(requests?.n).toBe(0);
  });

  it('screening em andamento: PATCH para APPROVED, REJECTED ou MANUAL_REVIEW → 409, mesmo com motivo', async () => {
    const application = await inScreening();
    for (const status of ['APPROVED', 'REJECTED', 'MANUAL_REVIEW']) {
      const res = await patchStatus(application, { status, decisionReason: HUMAN_REASON });
      expect(res.status, `${status}: ${JSON.stringify(res.body)}`).toBe(409);
    }
    expect((await aggregateOf(application)).application).toMatchObject({
      status: 'SCREENING',
      ...undecided,
    });
  });

  it('aprovação ou rejeição sem motivo → 400, sem gravar decisão', async () => {
    const application = await inManualReview();
    for (const payload of [
      { status: 'APPROVED' },
      { status: 'APPROVED', decisionReason: '   ' },
      { status: 'REJECTED' },
    ]) {
      const res = await patchStatus(application, payload);
      expect(res.status, `${JSON.stringify(payload)}: ${JSON.stringify(res.body)}`).toBe(400);
    }
    expect((await aggregateOf(application)).application).toMatchObject({
      status: 'MANUAL_REVIEW',
      ...undecided,
    });
  });

  it('decisão manual em MANUAL_REVIEW grava motivo, responsável, data e origem MANUAL', async () => {
    const application = await inManualReview();
    const res = await patchStatus(application, {
      status: 'APPROVED',
      decisionReason: HUMAN_REASON,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const decided = (await aggregateOf(application)).application;
    expect(decided).toMatchObject({
      status: 'APPROVED',
      decisionReason: HUMAN_REASON,
      decidedBy: application.userId,
      decisionSource: 'MANUAL',
    });
    expect(decided.decidedAt).not.toBeNull();

    // Repetir o destino não reescreve a decisão registrada.
    const again = await patchStatus(application, {
      status: 'APPROVED',
      decisionReason: 'Outro motivo informado depois',
    });
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect((await aggregateOf(application)).application).toEqual(decided);
  });

  it('decisão automática registra origem AUTOMATIC, a regra aplicada e o resultado do screening', async () => {
    const application = await inScreening();
    await worker();
    const aggregate = await aggregateOf(application);
    expect(aggregate.application).toMatchObject({
      status: 'APPROVED',
      decidedBy: null,
      decisionSource: 'AUTOMATIC',
    });
    expect(aggregate.application.decidedAt).not.toBeNull();
    expect(aggregate.application.decisionReason).toContain('score_above_threshold');

    const audits = await fx.rows<{
      actor_user_id: string | null;
      payload: Record<string, unknown>;
    }>(
      sql`select actor_user_id, payload from audit_events
          where entity_type = 'RENTAL_APPLICATION' and entity_id = ${application.applicationId}
            and action = 'rental_application.decided' and payload->>'to' = 'APPROVED'`,
    );
    expect(audits).toEqual([
      {
        actor_user_id: null,
        payload: expect.objectContaining({
          from: 'SCREENING',
          to: 'APPROVED',
          source: 'AUTOMATIC',
          screeningResultId: aggregate.latestScreeningResult?.id,
        }) as unknown,
      },
    ]);
  });

  it('PATCH não leva a CONTRACTING', async () => {
    const application = await fx.approvedApplication();
    const res = await patchStatus(application, { status: 'CONTRACTING' });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect((await aggregateOf(application)).application.status).toBe('APPROVED');
  });

  it('criar o contrato leva a candidatura a CONTRACTING; segundo contrato → 409', async () => {
    const application = await fx.approvedApplication();
    const templateId = await fx.approvedTemplate(application.cookie);
    const payload = { applicationId: application.applicationId, templateId };
    const first = await fx.call('POST', '/contracts', { cookie: application.cookie, payload });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect((await aggregateOf(application)).application.status).toBe('CONTRACTING');

    const second = await fx.call('POST', '/contracts', { cookie: application.cookie, payload });
    expect(second.status, JSON.stringify(second.body)).toBe(409);
    const [contracts] = await fx.rows<{ n: number }>(
      sql`select count(*)::int as n from contracts where application_id = ${application.applicationId}`,
    );
    expect(contracts?.n).toBe(1);
  });

  it('contrato cancelado devolve a candidatura para APPROVED e permite um novo contrato', async () => {
    const application = await fx.approvedApplication();
    const templateId = await fx.approvedTemplate(application.cookie);
    const payload = { applicationId: application.applicationId, templateId };
    const created = await fx.call('POST', '/contracts', { cookie: application.cookie, payload });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const contractId = (created.body.contract as { contract: { id: string } }).contract.id;
    expect((await aggregateOf(application)).application.status).toBe('CONTRACTING');

    await fx.call('POST', `/contracts/${contractId}/generate`, {
      cookie: application.cookie,
      payload: {},
    });
    await fx.call('PATCH', `/contracts/${contractId}/status`, {
      cookie: application.cookie,
      payload: { status: 'VOID' },
    });
    expect((await fx.contractRow(contractId)).status).toBe('VOID');
    expect((await aggregateOf(application)).application.status).toBe('APPROVED');

    const replacement = await fx.call('POST', '/contracts', {
      cookie: application.cookie,
      payload,
    });
    expect(replacement.status, JSON.stringify(replacement.body)).toBe(201);
    expect((await aggregateOf(application)).application.status).toBe('CONTRACTING');
  });
});
