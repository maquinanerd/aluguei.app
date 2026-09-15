import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { FakeScreeningProvider } from '@aluguei/integrations';
import { runInboxJobs } from '@aluguei/worker';
import { buildTestApp, fakePayments, fakeSignature } from './helpers.js';
import { createContractFixtures } from './contract-fixtures.js';
import type { ContractFixture } from './contract-fixtures.js';

/**
 * P0-04 (auditoria 2026-09-10): `POST /contracts/:id/generate` só barrava
 * GENERATED e validava a transição a partir do literal DRAFT — um contrato
 * SIGNED voltava a GENERATED com conteúdo e hash reescritos e `signed_at`
 * preservado, sem versão anterior. Regra: o conteúdo só é (re)gerado antes do
 * envio para assinatura, cada geração vira uma versão com hash, e a partir do
 * envio nada no texto muda — nem pela API, nem por escrita direta no banco.
 */

interface ContractDto {
  status: string;
  content: string | null;
  contentHash: string | null;
  currentVersion?: number | null;
}

interface VersionDto {
  version: number;
  content: string;
  contentHash: string;
  templateId: string | null;
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/** SQLSTATE do erro do banco (o drizzle embrulha o erro do driver em `cause`). */
function sqlState(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return candidate.code;
    }
    current = candidate.cause;
  }
  return undefined;
}

describe('P0-04: contrato enviado ou assinado não é regenerado', () => {
  let app: FastifyInstance;
  let fx: ReturnType<typeof createContractFixtures>;
  const screening = new FakeScreeningProvider();

  beforeAll(async () => {
    app = await buildTestApp();
    fx = createContractFixtures(app, () =>
      runInboxJobs({
        db: app.db,
        limit: 50,
        screening,
        signature: fakeSignature,
        payments: fakePayments,
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  async function changeRent(fixture: ContractFixture, monthlyRentCents: number): Promise<void> {
    const res = await fx.call('PUT', `/properties/${fixture.propertyId}/financial-terms`, {
      cookie: fixture.cookie,
      payload: { monthlyRentCents },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }

  async function versionsOf(fixture: ContractFixture): Promise<VersionDto[]> {
    const res = await fx.call('GET', `/contracts/${fixture.contractId}/versions`, {
      cookie: fixture.cookie,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.versions as VersionDto[];
  }

  /** Nenhuma forma de `generate` pode tocar o contrato: 409 e linha idêntica. */
  async function expectGenerateRefused(fixture: ContractFixture): Promise<void> {
    const before = await fx.contractRow(fixture.contractId);
    // O dado de origem muda depois do envio: sem a trava, regenerar reescreveria o texto.
    await changeRent(fixture, 999_900);
    for (const payload of [{}, { regenerate: true }]) {
      const res = await fx.generate(fixture, payload);
      expect(
        res.status,
        `generate ${JSON.stringify(payload)} em ${before.status}: ${JSON.stringify(res.body)}`,
      ).toBe(409);
      expect(await fx.contractRow(fixture.contractId)).toEqual(before);
    }
  }

  it('SIGNED: regenerar → 409; status, conteúdo, hash e assinatura intactos', async () => {
    const contract = await fx.signedContract();
    const before = await fx.contractRow(contract.contractId);
    expect(before.status).toBe('SIGNED');
    expect(before.signed_at).not.toBeNull();

    await expectGenerateRefused(contract);

    // A locação nasce do contrato assinado original.
    const lease = await fx.call('POST', '/leases', {
      cookie: contract.cookie,
      payload: { contractId: contract.contractId },
    });
    expect(lease.status, JSON.stringify(lease.body)).toBe(201);
  });

  it('SENT_FOR_SIGNATURE: regenerar → 409 sem nenhuma escrita', async () => {
    const contract = await fx.sentContract();
    expect((await fx.contractRow(contract.contractId)).status).toBe('SENT_FOR_SIGNATURE');
    await expectGenerateRefused(contract);
  });

  it('PARTIALLY_SIGNED: regenerar → 409 sem nenhuma escrita', async () => {
    const contract = await fx.partiallySignedContract();
    await expectGenerateRefused(contract);
  });

  it('VOID: regenerar → 409 sem nenhuma escrita', async () => {
    const contract = await fx.generatedContract();
    await fx.call('PATCH', `/contracts/${contract.contractId}/status`, {
      cookie: contract.cookie,
      payload: { status: 'VOID' },
    });
    expect((await fx.contractRow(contract.contractId)).status).toBe('VOID');
    await expectGenerateRefused(contract);
  });

  it('DRAFT → GENERATED grava a versão 1 com o hash do conteúdo', async () => {
    const contract = await fx.draftContract();
    const res = await fx.generate(contract);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const generated = (res.body.contract as { contract: ContractDto }).contract;
    expect(generated.status).toBe('GENERATED');
    expect(generated.currentVersion).toBe(1);
    expect(generated.contentHash).toBe(sha256(generated.content ?? ''));

    const versions = await versionsOf(contract);
    expect(versions).toEqual([
      expect.objectContaining({
        version: 1,
        content: generated.content,
        contentHash: generated.contentHash,
        templateId: contract.templateId,
      }),
    ]);
  });

  it('GENERATED: repetir é idempotente; regeneração explícita cria a versão 2 e preserva a 1', async () => {
    const contract = await fx.generatedContract({ rentCents: 250_000 });
    const v1 = await fx.contractRow(contract.contractId);

    const again = await fx.generate(contract);
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(await fx.contractRow(contract.contractId)).toEqual(v1);

    // Mesmo conteúdo: regenerar não cria versão vazia de sentido.
    const unchanged = await fx.generate(contract, { regenerate: true });
    expect(unchanged.status, JSON.stringify(unchanged.body)).toBe(200);
    expect(await fx.contractRow(contract.contractId)).toEqual(v1);

    // Dado de origem muda ANTES do envio: regeneração explícita gera nova versão.
    await changeRent(contract, 300_000);
    const regenerated = await fx.generate(contract, { regenerate: true });
    expect(regenerated.status, JSON.stringify(regenerated.body)).toBe(200);
    const v2 = await fx.contractRow(contract.contractId);
    expect(v2.content).not.toBe(v1.content);
    expect(v2.content_hash).toBe(sha256(v2.content ?? ''));

    const versions = await versionsOf(contract);
    expect(versions.map((v) => [v.version, v.contentHash, v.content])).toEqual([
      [1, v1.content_hash, v1.content],
      [2, v2.content_hash, v2.content],
    ]);
  });

  it('envio fixa a versão: o envelope registra a versão enviada', async () => {
    const contract = await fx.sentContract();
    const aggregate = await fx.call('GET', `/contracts/${contract.contractId}`, {
      cookie: contract.cookie,
    });
    expect(aggregate.status).toBe(200);
    const envelope = aggregate.body.envelope as { contractVersion?: number | null } | null;
    expect(envelope?.contractVersion).toBe(1);
  });

  it('banco recusa reescrever texto enviado, regredir SIGNED e alterar versão gravada', async () => {
    const contract = await fx.signedContract();
    const before = await fx.contractRow(contract.contractId);
    const id = contract.contractId;
    const attempts: Array<[string, SQL]> = [
      [
        'contracts.content em SIGNED',
        sql`update contracts set content = 'adulterado' where id = ${id}`,
      ],
      [
        'contracts.content_hash em SIGNED',
        sql`update contracts set content_hash = ${sha256('adulterado')} where id = ${id}`,
      ],
      [
        'contracts.status SIGNED → GENERATED',
        sql`update contracts set status = 'GENERATED' where id = ${id}`,
      ],
      [
        'contract_versions.content',
        sql`update contract_versions set content = 'adulterado' where contract_id = ${id}`,
      ],
    ];
    for (const [label, statement] of attempts) {
      let code: string | undefined;
      try {
        await app.db.execute(statement);
      } catch (error) {
        code = sqlState(error);
      }
      // 23514 = check_violation, levantado pelo gatilho de imutabilidade.
      expect(code, `${label}: o banco deveria recusar com 23514`).toBe('23514');
    }
    expect(await fx.contractRow(id)).toEqual(before);
  });
});
