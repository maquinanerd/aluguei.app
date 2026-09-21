import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { addDays, saoPauloDate } from '@aluguei/domain';
import { runInboxJobs } from '@aluguei/worker';
import { buildTestApp, fakeStorage } from './helpers.js';
import { approveAgency, call, registerAgency } from './platform-fixtures.js';
import type { Json, RegisteredAgency } from './platform-fixtures.js';

/**
 * G3, trilha D (auditoria 2026-09-10): cadastros e identidade pela API.
 *  - P2-01 pessoas: dígito verificador, detalhe, edição, arquivar/reativar e documentos;
 *  - P2-02 visitas e propostas: ciclo de vida e expiração da proposta no worker;
 *  - P2-03 lead: detalhe e edição de dados e responsável;
 *  - P2-04 identidade: troca e recuperação de senha e convite de membro por e-mail, com a
 *    mensagem gravada na caixa de saída local — nada é enviado.
 */
describe('G3 trilha D — cadastros e identidade pela API', () => {
  let app: FastifyInstance;
  let ipCounter = 0;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  /** IP distinto por chamada sem sessão: login, senha e convite têm rate limit por IP. */
  const nextIp = (): string => {
    ipCounter += 1;
    return `10.44.${String((ipCounter >> 8) & 255)}.${String(ipCounter & 255)}`;
  };

  const rows = async <T>(query: SQL): Promise<T[]> => {
    const result = await app.db.execute(query);
    return result.rows as T[];
  };

  const agency = async (): Promise<RegisteredAgency> => {
    const registered = await registerAgency(app);
    await approveAgency(app, registered.org.id);
    return registered;
  };

  const party = async (cookie: string, name: string, cpf: string): Promise<string> => {
    const res = await call(app, 'POST', '/parties', {
      cookie,
      payload: { type: 'PERSON', name, identities: [{ kind: 'CPF', value: cpf }] },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return (res.body.party as { id: string }).id;
  };

  const auditOf = (orgId: string | null, action: string, entityId: string) =>
    rows<{ payload: Json }>(sql`
      select payload from audit_events
      where ${orgId === null ? sql`org_id is null` : sql`org_id = ${orgId}`}
        and action = ${action} and entity_id = ${entityId}
      order by occurred_at
    `);

  const login = async (email: string, password: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      remoteAddress: nextIp(),
      payload: { email, password },
    });
    const setCookie = res.headers['set-cookie'];
    return {
      status: res.statusCode,
      cookie: Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie ?? ''),
    };
  };

  const tokenFrom = (body: string): string => {
    const match = /token=([A-Za-z0-9_-]+)/.exec(body);
    if (!match?.[1]) {
      throw new Error(`mensagem sem token: ${body}`);
    }
    return match[1];
  };

  describe('P2-01: pessoas', () => {
    it('CPF e CNPJ sem dígito verificador válido são recusados (400)', async () => {
      const a = await agency();
      for (const identity of [
        { kind: 'CPF', value: '12345678900' },
        { kind: 'CPF', value: '111.111.111-11' },
        { kind: 'CNPJ', value: '11222333000180' },
        { kind: 'CNPJ', value: '52998224725' },
      ]) {
        const res = await call(app, 'POST', '/parties', {
          cookie: a.cookie,
          payload: { type: 'PERSON', name: 'Documento Inválido', identities: [identity] },
        });
        expect(res.status, JSON.stringify({ identity, body: res.body })).toBe(400);
      }
      const ok = await call(app, 'POST', '/parties', {
        cookie: a.cookie,
        payload: {
          type: 'COMPANY',
          name: 'Empresa Válida',
          identities: [{ kind: 'CNPJ', value: '11.222.333/0001-81' }],
        },
      });
      expect(ok.status, JSON.stringify(ok.body)).toBe(201);
      expect((ok.body.party as Json).identities).toEqual([
        { kind: 'CNPJ', value: '11222333000181' },
      ]);
      const count = await rows<{ n: number }>(sql`
        select count(*)::int as n from parties where org_id = ${a.org.id}
      `);
      expect(count[0]?.n).toBe(1);
    });

    it('detalhe traz identidades, endereços, papéis, consentimentos e documentos; outra org → 404', async () => {
      const a = await agency();
      const b = await agency();
      const created = await call(app, 'POST', '/parties', {
        cookie: a.cookie,
        payload: {
          type: 'PERSON',
          name: 'Maria Detalhe',
          roles: ['TENANT'],
          identities: [
            { kind: 'CPF', value: '52998224725' },
            { kind: 'EMAIL', value: 'Maria@Exemplo.com' },
          ],
          addresses: [{ label: 'Casa', street: 'Rua A', city: 'São Paulo', isPublic: false }],
        },
      });
      expect(created.status).toBe(201);
      const partyId = (created.body.party as { id: string }).id;
      const consent = await call(app, 'POST', `/parties/${partyId}/consents`, {
        cookie: a.cookie,
        payload: { purpose: 'CREDIT_SCREENING' },
      });
      expect(consent.status).toBe(201);

      const detail = await call(app, 'GET', `/parties/${partyId}`, { cookie: a.cookie });
      expect(detail.status, JSON.stringify(detail.body)).toBe(200);
      expect(detail.body.party).toMatchObject({
        id: partyId,
        name: 'Maria Detalhe',
        status: 'ACTIVE',
        identities: expect.arrayContaining([
          { kind: 'CPF', value: '52998224725' },
          { kind: 'EMAIL', value: 'maria@exemplo.com' },
        ]) as unknown,
        addresses: [expect.objectContaining({ label: 'Casa', city: 'São Paulo' })],
      });
      expect(detail.body.roles).toEqual(['TENANT']);
      expect(detail.body.consents).toEqual([
        expect.objectContaining({ purpose: 'CREDIT_SCREENING', revokedAt: null }),
      ]);
      expect(detail.body.documents).toEqual([]);

      const crossOrg = await call(app, 'GET', `/parties/${partyId}`, { cookie: b.cookie });
      expect(crossOrg.status).toBe(404);
      const missing = await call(app, 'GET', '/parties/00000000-0000-4000-8000-000000000000', {
        cookie: a.cookie,
      });
      expect(missing.status).toBe(404);
      expect(crossOrg.body.message).toBe(missing.body.message);
    });

    it('edição troca nome, identidades, papéis e endereços, com diff na auditoria sem o valor do documento', async () => {
      const a = await agency();
      const partyId = await party(a.cookie, 'Nome Antigo', '11144477735');
      const other = await party(a.cookie, 'Outra Pessoa', '39053344705');

      const updated = await call(app, 'PATCH', `/parties/${partyId}`, {
        cookie: a.cookie,
        payload: {
          name: 'Nome Novo',
          identities: [
            { kind: 'CPF', value: '111.444.777-35' },
            { kind: 'PHONE', value: '(11) 98888-7777' },
          ],
          roles: ['OWNER', 'GUARANTOR'],
          addresses: [{ label: 'Trabalho', city: 'Campinas', isPublic: false }],
        },
      });
      expect(updated.status, JSON.stringify(updated.body)).toBe(200);
      expect(updated.body.party).toMatchObject({ name: 'Nome Novo' });
      expect(updated.body.roles).toEqual(['GUARANTOR', 'OWNER']);
      expect((updated.body.party as { identities: Json[] }).identities).toEqual(
        expect.arrayContaining([
          { kind: 'CPF', value: '11144477735' },
          { kind: 'PHONE', value: '11988887777' },
        ]),
      );

      const audit = await auditOf(a.org.id, 'party.updated', partyId);
      expect(audit).toHaveLength(1);
      expect(audit[0]?.payload).toMatchObject({
        changes: {
          name: { from: 'Nome Antigo', to: 'Nome Novo' },
          identities: { from: ['CPF'], to: ['CPF', 'PHONE'] },
          roles: { from: [], to: ['GUARANTOR', 'OWNER'] },
        },
      });
      // O valor do documento e do telefone não entra na auditoria (dado pessoal).
      expect(JSON.stringify(audit[0]?.payload)).not.toContain('11144477735');
      expect(JSON.stringify(audit[0]?.payload)).not.toContain('11988887777');

      const invalid = await call(app, 'PATCH', `/parties/${partyId}`, {
        cookie: a.cookie,
        payload: { identities: [{ kind: 'CPF', value: '12345678900' }] },
      });
      expect(invalid.status).toBe(400);

      // Identidade de outra pessoa da mesma org: 409, sem 500 de UNIQUE.
      const taken = await call(app, 'PATCH', `/parties/${partyId}`, {
        cookie: a.cookie,
        payload: { identities: [{ kind: 'CPF', value: '39053344705' }] },
      });
      expect(taken.status, JSON.stringify(taken.body)).toBe(409);
      const stillOther = await call(app, 'GET', `/parties/${other}`, { cookie: a.cookie });
      expect((stillOther.body.party as { identities: Json[] }).identities).toEqual([
        { kind: 'CPF', value: '39053344705' },
      ]);

      const unknownField = await call(app, 'PATCH', `/parties/${partyId}`, {
        cookie: a.cookie,
        payload: { orgId: a.org.id },
      });
      expect(unknownField.status).toBe(400);
    });

    it('arquivar tira a pessoa da lista, e reativar devolve; as duas ficam auditadas', async () => {
      const a = await agency();
      const partyId = await party(a.cookie, 'Arquivável', '15350946056');

      const archived = await call(app, 'PATCH', `/parties/${partyId}`, {
        cookie: a.cookie,
        payload: { status: 'ARCHIVED' },
      });
      expect(archived.status, JSON.stringify(archived.body)).toBe(200);
      expect(archived.body.party).toMatchObject({ status: 'ARCHIVED' });

      const list = await call(app, 'GET', '/parties?limit=100', { cookie: a.cookie });
      expect((list.body.parties as Json[]).map((p) => p.id)).not.toContain(partyId);
      const onlyArchived = await call(app, 'GET', '/parties?status=ARCHIVED', {
        cookie: a.cookie,
      });
      expect((onlyArchived.body.parties as Json[]).map((p) => p.id)).toEqual([partyId]);
      // `ids` resolve a pessoa arquivada: linhas antigas continuam com o nome.
      const byIds = await call(app, 'GET', `/parties?ids=${partyId}`, { cookie: a.cookie });
      expect((byIds.body.parties as Json[]).map((p) => p.id)).toEqual([partyId]);

      const reactivated = await call(app, 'PATCH', `/parties/${partyId}`, {
        cookie: a.cookie,
        payload: { status: 'ACTIVE' },
      });
      expect(reactivated.status).toBe(200);
      expect(await auditOf(a.org.id, 'party.archived', partyId)).toHaveLength(1);
      expect(await auditOf(a.org.id, 'party.reactivated', partyId)).toHaveLength(1);
      const back = await call(app, 'GET', '/parties?limit=100', { cookie: a.cookie });
      expect((back.body.parties as Json[]).map((p) => p.id)).toContain(partyId);
    });

    it('documento: upload pelo storage, confirmação idempotente, detalhe e exclusão; chave alheia recusada', async () => {
      const a = await agency();
      const b = await agency();
      const partyId = await party(a.cookie, 'Com Documento', '52998224725');
      const otherParty = await party(a.cookie, 'Outra', '11144477735');

      const upload = await call(app, 'POST', `/parties/${partyId}/documents/upload-url`, {
        cookie: a.cookie,
        payload: { kind: 'PROOF_OF_INCOME', mimeType: 'application/pdf', sizeBytes: 2048 },
      });
      expect(upload.status, JSON.stringify(upload.body)).toBe(200);
      const key = upload.body.key as string;
      expect(key.startsWith(`orgs/${a.org.id}/parties/${partyId}/`)).toBe(true);
      fakeStorage.markUploaded(key, 2048);

      const confirmed = await call(app, 'POST', `/parties/${partyId}/documents/confirm`, {
        cookie: a.cookie,
        payload: { key, kind: 'PROOF_OF_INCOME' },
      });
      expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(201);
      expect(confirmed.body.document).toMatchObject({
        kind: 'PROOF_OF_INCOME',
        documentKey: key,
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      });
      const again = await call(app, 'POST', `/parties/${partyId}/documents/confirm`, {
        cookie: a.cookie,
        payload: { key, kind: 'PROOF_OF_INCOME' },
      });
      expect(again.status).toBe(200);

      const detail = await call(app, 'GET', `/parties/${partyId}`, { cookie: a.cookie });
      expect(detail.body.documents).toHaveLength(1);

      // A chave de uma pessoa não confirma documento em outra.
      const foreignKey = await call(app, 'POST', `/parties/${otherParty}/documents/confirm`, {
        cookie: a.cookie,
        payload: { key, kind: 'PROOF_OF_INCOME' },
      });
      expect(foreignKey.status).toBe(400);
      const crossOrg = await call(app, 'POST', `/parties/${partyId}/documents/upload-url`, {
        cookie: b.cookie,
        payload: { kind: 'IDENTITY', mimeType: 'image/png', sizeBytes: 10 },
      });
      expect(crossOrg.status).toBe(404);
      const tooBig = await call(app, 'POST', `/parties/${partyId}/documents/upload-url`, {
        cookie: a.cookie,
        payload: { kind: 'IDENTITY', mimeType: 'image/png', sizeBytes: 21 * 1024 * 1024 },
      });
      expect(tooBig.status).toBe(400);

      const documentId = (confirmed.body.document as { id: string }).id;
      const removedByOther = await call(
        app,
        'DELETE',
        `/parties/${partyId}/documents/${documentId}`,
        { cookie: b.cookie },
      );
      expect(removedByOther.status).toBe(404);
      const removed = await call(app, 'DELETE', `/parties/${partyId}/documents/${documentId}`, {
        cookie: a.cookie,
      });
      expect(removed.status).toBe(200);
      expect(await auditOf(a.org.id, 'party.document_confirmed', partyId)).toHaveLength(1);
      expect(await auditOf(a.org.id, 'party.document_deleted', partyId)).toHaveLength(1);
      const after = await call(app, 'GET', `/parties/${partyId}/documents`, { cookie: a.cookie });
      expect(after.body.documents).toEqual([]);
    });
  });

  describe('P2-02: visitas', () => {
    const inDays = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString();

    it('confirma, reagenda, cancela com motivo e não volta de status final', async () => {
      const a = await agency();
      const created = await call(app, 'POST', '/visits', {
        cookie: a.cookie,
        payload: { scheduledAt: inDays(2), note: 'primeira' },
      });
      expect(created.status).toBe(201);
      const visitId = (created.body.visit as { id: string }).id;

      const confirmed = await call(app, 'PATCH', `/visits/${visitId}/status`, {
        cookie: a.cookie,
        payload: { status: 'CONFIRMED' },
      });
      expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
      expect(confirmed.body.visit).toMatchObject({ status: 'CONFIRMED' });

      const newDate = inDays(5);
      const rescheduled = await call(app, 'POST', `/visits/${visitId}/reschedule`, {
        cookie: a.cookie,
        payload: { scheduledAt: newDate },
      });
      expect(rescheduled.status, JSON.stringify(rescheduled.body)).toBe(200);
      expect(rescheduled.body.visit).toMatchObject({ status: 'SCHEDULED', scheduledAt: newDate });

      const noReason = await call(app, 'PATCH', `/visits/${visitId}/status`, {
        cookie: a.cookie,
        payload: { status: 'CANCELLED' },
      });
      expect(noReason.status).toBe(409);

      const cancelled = await call(app, 'PATCH', `/visits/${visitId}/status`, {
        cookie: a.cookie,
        payload: { status: 'CANCELLED', reason: 'interessado desistiu' },
      });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.visit).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'interessado desistiu',
      });

      for (const payload of [{ status: 'CONFIRMED' }, { status: 'DONE' }]) {
        const refused = await call(app, 'PATCH', `/visits/${visitId}/status`, {
          cookie: a.cookie,
          payload,
        });
        expect(refused.status, JSON.stringify(payload)).toBe(409);
      }
      const lateReschedule = await call(app, 'POST', `/visits/${visitId}/reschedule`, {
        cookie: a.cookie,
        payload: { scheduledAt: inDays(7) },
      });
      expect(lateReschedule.status).toBe(409);

      const audit = await rows<{ action: string; payload: Json }>(sql`
        select action, payload from audit_events
        where org_id = ${a.org.id} and entity_id = ${visitId} and action like 'visit.%'
        order by occurred_at
      `);
      expect(audit.map((row) => row.action)).toEqual([
        'visit.created',
        'visit.status_changed',
        'visit.rescheduled',
        'visit.status_changed',
      ]);
      expect(audit[3]?.payload).toMatchObject({
        changes: { status: { from: 'SCHEDULED', to: 'CANCELLED' } },
      });

      const detail = await call(app, 'GET', `/visits/${visitId}`, { cookie: a.cookie });
      expect(detail.status).toBe(200);
      expect(detail.body.visit).toMatchObject({ status: 'CANCELLED' });
    });

    it('realizada e não comparecimento; visita de outra org → 404; nasce só agendada ou confirmada', async () => {
      const a = await agency();
      const b = await agency();
      const make = async (): Promise<string> => {
        const res = await call(app, 'POST', '/visits', {
          cookie: a.cookie,
          payload: { scheduledAt: inDays(1) },
        });
        return (res.body.visit as { id: string }).id;
      };
      const done = await make();
      const noShow = await make();
      expect(
        (
          await call(app, 'PATCH', `/visits/${done}/status`, {
            cookie: a.cookie,
            payload: { status: 'DONE' },
          })
        ).body.visit,
      ).toMatchObject({ status: 'DONE' });
      expect(
        (
          await call(app, 'PATCH', `/visits/${noShow}/status`, {
            cookie: a.cookie,
            payload: { status: 'NO_SHOW' },
          })
        ).body.visit,
      ).toMatchObject({ status: 'NO_SHOW' });

      const crossOrg = await call(app, 'PATCH', `/visits/${done}/status`, {
        cookie: b.cookie,
        payload: { status: 'CONFIRMED' },
      });
      expect(crossOrg.status).toBe(404);
      expect((await call(app, 'GET', `/visits/${done}`, { cookie: b.cookie })).status).toBe(404);

      const bornDone = await call(app, 'POST', '/visits', {
        cookie: a.cookie,
        payload: { scheduledAt: inDays(1), status: 'DONE' },
      });
      expect(bornDone.status).toBe(400);
    });
  });

  describe('P2-02: propostas', () => {
    const today = (): string => saoPauloDate(new Date());

    const proposal = async (cookie: string, extra: Json = {}): Promise<string> => {
      const res = await call(app, 'POST', '/proposals', {
        cookie,
        payload: { monthlyRentCents: 250_000, ...extra },
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      return (res.body.proposal as { id: string }).id;
    };

    it('validade é data civil; enviar exige validade futura; só o rascunho é editável', async () => {
      const a = await agency();
      for (const validUntil of ['2027-02-30', '2026-10-17T00:00:00.000Z', 'amanhã']) {
        const refused = await call(app, 'POST', '/proposals', {
          cookie: a.cookie,
          payload: { monthlyRentCents: 100_000, validUntil },
        });
        expect(refused.status, validUntil).toBe(400);
      }
      const id = await proposal(a.cookie);

      const noValidity = await call(app, 'PATCH', `/proposals/${id}/status`, {
        cookie: a.cookie,
        payload: { status: 'SENT' },
      });
      expect(noValidity.status).toBe(409);
      const past = await call(app, 'PATCH', `/proposals/${id}/status`, {
        cookie: a.cookie,
        payload: { status: 'SENT', validUntil: addDays(today(), -1) },
      });
      expect(past.status).toBe(400);

      const edited = await call(app, 'PATCH', `/proposals/${id}`, {
        cookie: a.cookie,
        payload: { monthlyRentCents: 240_000, terms: 'Sem fiador' },
      });
      expect(edited.status, JSON.stringify(edited.body)).toBe(200);
      expect(await auditOf(a.org.id, 'proposal.updated', id)).toEqual([
        {
          payload: {
            changes: {
              monthlyRentCents: { from: 250_000, to: 240_000 },
              terms: { from: null, to: 'Sem fiador' },
            },
          },
        },
      ]);

      const validUntil = addDays(today(), 10);
      const sent = await call(app, 'PATCH', `/proposals/${id}/status`, {
        cookie: a.cookie,
        payload: { status: 'SENT', validUntil },
      });
      expect(sent.status, JSON.stringify(sent.body)).toBe(200);
      expect(sent.body.proposal).toMatchObject({ status: 'SENT', validUntil });
      expect((sent.body.proposal as Json).sentAt).not.toBeNull();

      const editSent = await call(app, 'PATCH', `/proposals/${id}`, {
        cookie: a.cookie,
        payload: { monthlyRentCents: 1 },
      });
      expect(editSent.status).toBe(409);
    });

    it('aceita; recusa exige motivo; status final não volta; outra org → 404', async () => {
      const a = await agency();
      const b = await agency();
      const validUntil = addDays(today(), 5);
      const accepted = await proposal(a.cookie, { validUntil });
      const rejected = await proposal(a.cookie, { validUntil });
      for (const id of [accepted, rejected]) {
        const sent = await call(app, 'PATCH', `/proposals/${id}/status`, {
          cookie: a.cookie,
          payload: { status: 'SENT' },
        });
        expect(sent.status, JSON.stringify(sent.body)).toBe(200);
      }

      const acceptedRes = await call(app, 'PATCH', `/proposals/${accepted}/status`, {
        cookie: a.cookie,
        payload: { status: 'ACCEPTED' },
      });
      expect(acceptedRes.body.proposal).toMatchObject({ status: 'ACCEPTED' });
      expect((acceptedRes.body.proposal as Json).decidedAt).not.toBeNull();

      const noReason = await call(app, 'PATCH', `/proposals/${rejected}/status`, {
        cookie: a.cookie,
        payload: { status: 'REJECTED' },
      });
      expect(noReason.status).toBe(409);
      const rejectedRes = await call(app, 'PATCH', `/proposals/${rejected}/status`, {
        cookie: a.cookie,
        payload: { status: 'REJECTED', reason: 'fora do orçamento' },
      });
      expect(rejectedRes.body.proposal).toMatchObject({
        status: 'REJECTED',
        decisionReason: 'fora do orçamento',
      });

      const reopen = await call(app, 'PATCH', `/proposals/${rejected}/status`, {
        cookie: a.cookie,
        payload: { status: 'ACCEPTED' },
      });
      expect(reopen.status).toBe(409);

      const crossOrg = await call(app, 'PATCH', `/proposals/${accepted}/status`, {
        cookie: b.cookie,
        payload: { status: 'REJECTED', reason: 'x' },
      });
      expect(crossOrg.status).toBe(404);
      expect((await call(app, 'GET', `/proposals/${accepted}`, { cookie: b.cookie })).status).toBe(
        404,
      );
      const audit = await auditOf(a.org.id, 'proposal.status_changed', rejected);
      expect(audit.map((row) => row.payload)).toEqual([
        { changes: { status: { from: 'DRAFT', to: 'SENT' } } },
        { changes: { status: { from: 'SENT', to: 'REJECTED' } } },
      ]);
    });

    it('worker expira a proposta enviada depois do último dia de validade, e só ela', async () => {
      const a = await agency();
      const insert = async (validUntil: string, status: string): Promise<string> => {
        const [row] = await rows<{ id: string }>(sql`
          insert into proposals (id, org_id, status, monthly_rent_cents, valid_until, sent_at)
          values (gen_random_uuid(), ${a.org.id}, ${status}, 200000, ${validUntil}::date, now())
          returning id
        `);
        if (!row) {
          throw new Error('proposta não inserida');
        }
        return row.id;
      };
      const yesterday = addDays(today(), -1);
      const expired = await insert(yesterday, 'SENT');
      const lastDay = await insert(today(), 'SENT');
      const accepted = await insert(yesterday, 'ACCEPTED');

      const statusOf = async (id: string): Promise<string | undefined> =>
        (await rows<{ status: string }>(sql`select status from proposals where id = ${id}`))[0]
          ?.status;
      // O inbox é compartilhado pelas organizações da suíte: roda até a fila desta ser atendida.
      for (let run = 0; run < 15 && (await statusOf(expired)) === 'SENT'; run += 1) {
        await runInboxJobs({ db: app.db, limit: 50 });
      }

      expect(await statusOf(expired)).toBe('EXPIRED');
      expect(await statusOf(lastDay)).toBe('SENT');
      expect(await statusOf(accepted)).toBe('ACCEPTED');
      const audit = await auditOf(a.org.id, 'proposal.expired', expired);
      expect(audit).toHaveLength(1);
      expect(audit[0]?.payload).toMatchObject({
        changes: { status: { from: 'SENT', to: 'EXPIRED' } },
        validUntil: yesterday,
      });
    });
  });

  describe('P2-03: lead', () => {
    it('detalhe com imóveis de interesse; outra org → 404', async () => {
      const a = await agency();
      const b = await agency();
      const property = await call(app, 'POST', '/properties', {
        cookie: a.cookie,
        payload: { title: 'Apto do lead', propertyType: 'APARTMENT' },
      });
      expect(property.status, JSON.stringify(property.body)).toBe(201);
      const propertyId = (property.body.property as { id: string }).id;
      const lead = await call(app, 'POST', '/leads', {
        cookie: a.cookie,
        payload: { source: 'site', interestedPropertyIds: [propertyId] },
      });
      const leadId = (lead.body.lead as { id: string }).id;

      const detail = await call(app, 'GET', `/leads/${leadId}`, { cookie: a.cookie });
      expect(detail.status, JSON.stringify(detail.body)).toBe(200);
      expect(detail.body.lead).toMatchObject({ id: leadId, source: 'site', status: 'NEW' });
      expect(detail.body.interestedPropertyIds).toEqual([propertyId]);
      expect((await call(app, 'GET', `/leads/${leadId}`, { cookie: b.cookie })).status).toBe(404);
    });

    it('equipe da organização ativa para escolher o responsável, sem e-mail e para qualquer função', async () => {
      const a = await agency();
      const colleague = await agency();
      const outsider = await agency();
      await call(app, 'POST', `/organizations/${a.org.id}/members`, {
        cookie: a.cookie,
        payload: { userId: colleague.user.id, role: 'agent' },
      });
      // O corretor não tem `member:read`, mas escolhe o responsável do lead.
      const agentSession = await login(colleague.user.email, 'senha-segura-123');
      await call(app, 'POST', '/auth/switch-org', {
        cookie: agentSession.cookie,
        payload: { orgId: a.org.id },
      });
      const team = await call(app, 'GET', '/me/members', { cookie: agentSession.cookie });
      expect(team.status, JSON.stringify(team.body)).toBe(200);
      const members = team.body.members as Array<Record<string, unknown>>;
      expect(members.map((m) => m.userId).sort()).toEqual([a.user.id, colleague.user.id].sort());
      expect(members.map((m) => m.userId)).not.toContain(outsider.user.id);
      expect(members.find((m) => m.userId === colleague.user.id)).toMatchObject({
        name: colleague.user.name,
        role: 'agent',
      });
      expect(JSON.stringify(team.body)).not.toContain('@');
      expect((await call(app, 'GET', '/me/members')).status).toBe(401);
    });

    it('edição de dados e responsável, com diff auditado; responsável de fora da org → 404', async () => {
      const a = await agency();
      const colleague = await agency();
      const outsider = await agency();
      // Colega vira membro da org A pelo vínculo que já existia (userId de conta existente).
      const member = await call(app, 'POST', `/organizations/${a.org.id}/members`, {
        cookie: a.cookie,
        payload: { userId: colleague.user.id, role: 'agent' },
      });
      expect(member.status, JSON.stringify(member.body)).toBe(201);

      const lead = await call(app, 'POST', '/leads', {
        cookie: a.cookie,
        payload: { notes: 'curto', budgetMaxCents: 300_000 },
      });
      const leadId = (lead.body.lead as { id: string }).id;
      expect(lead.body.lead).toMatchObject({ ownerUserId: a.user.id });

      const updated = await call(app, 'PATCH', `/leads/${leadId}`, {
        cookie: a.cookie,
        payload: {
          ownerUserId: colleague.user.id,
          channel: 'WHATSAPP',
          budgetMinCents: 150_000,
          notes: 'observação mais longa',
        },
      });
      expect(updated.status, JSON.stringify(updated.body)).toBe(200);
      expect(updated.body.lead).toMatchObject({
        ownerUserId: colleague.user.id,
        channel: 'WHATSAPP',
        budgetMinCents: 150_000,
        budgetMaxCents: 300_000,
        notes: 'observação mais longa',
        status: 'NEW',
      });
      const audit = await auditOf(a.org.id, 'lead.updated', leadId);
      expect(audit).toHaveLength(1);
      expect(audit[0]?.payload).toMatchObject({
        changes: {
          ownerUserId: { from: a.user.id, to: colleague.user.id },
          channel: { from: null, to: 'WHATSAPP' },
          budgetMinCents: { from: null, to: 150_000 },
          notes: { from: 5, to: 21 },
        },
      });
      expect(JSON.stringify(audit[0]?.payload)).not.toContain('observação');

      const outsiderOwner = await call(app, 'PATCH', `/leads/${leadId}`, {
        cookie: a.cookie,
        payload: { ownerUserId: outsider.user.id },
      });
      expect(outsiderOwner.status).toBe(404);
      const minAboveMax = await call(app, 'PATCH', `/leads/${leadId}`, {
        cookie: a.cookie,
        payload: { budgetMinCents: 400_000 },
      });
      expect(minAboveMax.status).toBe(400);
      // O status só muda pelo funil (`/leads/:id/status`).
      const statusByPatch = await call(app, 'PATCH', `/leads/${leadId}`, {
        cookie: a.cookie,
        payload: { status: 'WON' },
      });
      expect(statusByPatch.status).toBe(400);
      const crossOrg = await call(app, 'PATCH', `/leads/${leadId}`, {
        cookie: outsider.cookie,
        payload: { channel: 'X' },
      });
      expect(crossOrg.status).toBe(404);
    });
  });

  describe('P2-04: identidade', () => {
    it('troca de senha exige a atual, recusa a mesma e encerra as outras sessões', async () => {
      const a = await agency();
      const other = await login(a.user.email, 'senha-segura-123');
      expect(other.status).toBe(200);

      const wrong = await call(app, 'POST', '/auth/change-password', {
        cookie: a.cookie,
        payload: { currentPassword: 'errada-123', newPassword: 'senha-nova-456' },
      });
      expect(wrong.status).toBe(401);
      const same = await call(app, 'POST', '/auth/change-password', {
        cookie: a.cookie,
        payload: { currentPassword: 'senha-segura-123', newPassword: 'senha-segura-123' },
      });
      expect(same.status).toBe(400);

      const changed = await call(app, 'POST', '/auth/change-password', {
        cookie: a.cookie,
        payload: { currentPassword: 'senha-segura-123', newPassword: 'senha-nova-456' },
      });
      expect(changed.status, JSON.stringify(changed.body)).toBe(200);
      expect(changed.body).toEqual({ ok: true, revokedSessions: 1 });

      expect((await call(app, 'GET', '/auth/me', { cookie: a.cookie })).status).toBe(200);
      expect((await call(app, 'GET', '/auth/me', { cookie: other.cookie })).status).toBe(401);
      expect((await login(a.user.email, 'senha-segura-123')).status).toBe(401);
      expect((await login(a.user.email, 'senha-nova-456')).status).toBe(200);

      const audit = await auditOf(a.org.id, 'auth.password_changed', a.user.id);
      expect(audit).toHaveLength(1);
      expect(JSON.stringify(audit[0]?.payload)).not.toContain('senha-nova-456');
    });

    it('recuperação grava na caixa de saída sem enviar, guarda só o hash e o link é de uso único', async () => {
      const a = await agency();
      const unknown = await app.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        remoteAddress: nextIp(),
        payload: { email: 'ninguem-cadastrado@example.com' },
      });
      expect(unknown.statusCode).toBe(200);
      const known = await app.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        remoteAddress: nextIp(),
        payload: { email: a.user.email.toUpperCase() },
      });
      expect(known.statusCode).toBe(200);
      // Mesma resposta com e sem conta: sem enumeração.
      expect(known.body).toBe(unknown.body);
      expect(
        await rows(
          sql`select 1 from email_outbox where to_email = 'ninguem-cadastrado@example.com'`,
        ),
      ).toHaveLength(0);

      const [message] = await rows<{
        org_id: string | null;
        kind: string;
        status: string;
        body: string;
      }>(sql`
        select org_id, kind, status, body from email_outbox
        where to_email = ${a.user.email} order by created_at desc limit 1
      `);
      expect(message).toMatchObject({ org_id: null, kind: 'PASSWORD_RESET', status: 'QUEUED' });
      const token = tokenFrom(message?.body ?? '');
      const stored = await rows<{ token_hash: string }>(sql`
        select token_hash from password_reset_tokens where user_id = ${a.user.id}
      `);
      expect(stored).toHaveLength(1);
      expect(stored[0]?.token_hash).not.toBe(token);
      const leaked = await rows(sql`
        select 1 from audit_events where payload::text like ${`%${token}%`}
      `);
      expect(leaked).toHaveLength(0);

      // A mensagem de senha não aparece na caixa de saída da imobiliária.
      const orgOutbox = await call(app, 'GET', '/email-outbox', { cookie: a.cookie });
      expect(orgOutbox.status).toBe(200);
      expect((orgOutbox.body.messages as Json[]).map((m) => m.kind)).not.toContain(
        'PASSWORD_RESET',
      );

      const other = await login(a.user.email, 'senha-segura-123');
      const reset = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        remoteAddress: nextIp(),
        payload: { token, newPassword: 'senha-recuperada-789' },
      });
      expect(reset.statusCode, reset.body).toBe(200);
      expect(JSON.parse(reset.body)).toEqual({ ok: true, revokedSessions: 2 });
      expect((await call(app, 'GET', '/auth/me', { cookie: a.cookie })).status).toBe(401);
      expect((await call(app, 'GET', '/auth/me', { cookie: other.cookie })).status).toBe(401);
      expect((await login(a.user.email, 'senha-recuperada-789')).status).toBe(200);

      const reused = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        remoteAddress: nextIp(),
        payload: { token, newPassword: 'mais-uma-senha-000' },
      });
      expect(reused.statusCode).toBe(404);
      expect(await auditOf(null, 'auth.password_reset_completed', a.user.id)).toHaveLength(1);
    });

    it('link vencido e pedido substituído não servem', async () => {
      const a = await agency();
      const ask = () =>
        app.inject({
          method: 'POST',
          url: '/auth/forgot-password',
          remoteAddress: nextIp(),
          payload: { email: a.user.email },
        });
      const lastToken = async (): Promise<string> => {
        const [message] = await rows<{ body: string }>(sql`
          select body from email_outbox where to_email = ${a.user.email}
          order by created_at desc limit 1
        `);
        return tokenFrom(message?.body ?? '');
      };
      await ask();
      const first = await lastToken();
      await ask();
      const second = await lastToken();
      expect(second).not.toBe(first);
      const resetWith = (token: string) =>
        app.inject({
          method: 'POST',
          url: '/auth/reset-password',
          remoteAddress: nextIp(),
          payload: { token, newPassword: 'senha-trocada-321' },
        });
      expect((await resetWith(first)).statusCode).toBe(404);

      await app.db.execute(sql`
        update password_reset_tokens set expires_at = now() - interval '1 minute'
        where user_id = ${a.user.id} and used_at is null
      `);
      expect((await resetWith(second)).statusCode).toBe(404);
      expect((await login(a.user.email, 'senha-segura-123')).status).toBe(200);
    });

    it('convite por e-mail: caixa de saída da org, aceite cria a conta e o vínculo; uso único', async () => {
      const a = await agency();
      const email = `convidado-${Math.random().toString(36).slice(2, 8)}@example.com`;
      const invited = await call(app, 'POST', `/organizations/${a.org.id}/invites`, {
        cookie: a.cookie,
        payload: { email: email.toUpperCase(), role: 'agent', name: 'Pessoa Convidada' },
      });
      expect(invited.status, JSON.stringify(invited.body)).toBe(201);
      expect(invited.body.invite).toMatchObject({ email, role: 'agent', status: 'PENDING' });

      const duplicate = await call(app, 'POST', `/organizations/${a.org.id}/invites`, {
        cookie: a.cookie,
        payload: { email, role: 'viewer' },
      });
      expect(duplicate.status).toBe(409);
      const ownerAgain = await call(app, 'POST', `/organizations/${a.org.id}/invites`, {
        cookie: a.cookie,
        payload: { email: a.user.email, role: 'viewer' },
      });
      expect(ownerAgain.status).toBe(409);

      const outbox = await call(app, 'GET', '/email-outbox', { cookie: a.cookie });
      expect(outbox.status).toBe(200);
      const message = (
        outbox.body.messages as Array<{
          kind: string;
          toEmail: string;
          body: string;
          status: string;
        }>
      ).find((m) => m.toEmail === email);
      expect(message).toMatchObject({ kind: 'MEMBER_INVITE', status: 'QUEUED' });
      const token = tokenFrom(message?.body ?? '');

      const described = await app.inject({
        method: 'POST',
        url: '/invites/describe',
        remoteAddress: nextIp(),
        payload: { token },
      });
      expect(described.statusCode, described.body).toBe(200);
      expect(JSON.parse(described.body)).toMatchObject({
        invite: { email, role: 'agent', organizationName: a.org.name },
      });

      const accepted = await app.inject({
        method: 'POST',
        url: '/invites/accept',
        remoteAddress: nextIp(),
        payload: { token, name: 'Pessoa Convidada', password: 'senha-do-convidado-1' },
      });
      expect(accepted.statusCode, accepted.body).toBe(201);
      expect(JSON.parse(accepted.body)).toMatchObject({
        created: true,
        membership: { orgId: a.org.id, role: 'agent' },
      });
      const setCookie = accepted.headers['set-cookie'];
      const cookie = Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie ?? '');
      const me = await call(app, 'GET', '/auth/me', { cookie });
      expect(me.status).toBe(200);
      expect(me.body.activeOrg).toMatchObject({ id: a.org.id });

      const reused = await app.inject({
        method: 'POST',
        url: '/invites/accept',
        remoteAddress: nextIp(),
        payload: { token, name: 'Outra Pessoa', password: 'outra-senha-222' },
      });
      expect(reused.statusCode).toBe(404);
      const members = await call(app, 'GET', `/organizations/${a.org.id}/members`, {
        cookie: a.cookie,
      });
      expect((members.body.members as Json[]).map((m) => m.email)).toContain(email);
      const invites = await call(app, 'GET', `/organizations/${a.org.id}/invites`, {
        cookie: a.cookie,
      });
      expect((invites.body.invites as Json[]).find((i) => i.email === email)).toMatchObject({
        status: 'ACCEPTED',
      });
      // Convite e mensagem na mesma transação (mesmo instante): a ordem entre eles não importa.
      expect(
        (
          await rows<{ action: string }>(sql`
            select action from audit_events where org_id = ${a.org.id}
              and action in ('member.invited', 'member.invite_accepted', 'email.queued')
          `)
        )
          .map((row) => row.action)
          .sort(),
      ).toEqual(['email.queued', 'member.invite_accepted', 'member.invited']);
    });

    it('convite para conta existente só acrescenta o vínculo; revogado não serve; sem permissão → 403', async () => {
      const a = await agency();
      const existing = await agency();
      const invited = await call(app, 'POST', `/organizations/${a.org.id}/invites`, {
        cookie: a.cookie,
        payload: { email: existing.user.email, role: 'viewer' },
      });
      expect(invited.status, JSON.stringify(invited.body)).toBe(201);
      const [message] = await rows<{ body: string }>(sql`
        select body from email_outbox where org_id = ${a.org.id} and to_email = ${existing.user.email}
      `);
      const accepted = await app.inject({
        method: 'POST',
        url: '/invites/accept',
        remoteAddress: nextIp(),
        payload: {
          token: tokenFrom(message?.body ?? ''),
          name: 'Não Muda',
          password: 'tentativa-de-trocar-1',
        },
      });
      expect(accepted.statusCode, accepted.body).toBe(201);
      expect(JSON.parse(accepted.body)).toMatchObject({ created: false });
      expect(accepted.headers['set-cookie']).toBeUndefined();
      // A senha da conta existente não muda pelo aceite.
      expect((await login(existing.user.email, 'senha-segura-123')).status).toBe(200);
      expect((await login(existing.user.email, 'tentativa-de-trocar-1')).status).toBe(401);

      const revokable = await call(app, 'POST', `/organizations/${a.org.id}/invites`, {
        cookie: a.cookie,
        payload: { email: 'revogado@example.com', role: 'agent' },
      });
      const inviteId = (revokable.body.invite as { id: string }).id;
      const revoked = await call(app, 'DELETE', `/organizations/${a.org.id}/invites/${inviteId}`, {
        cookie: a.cookie,
      });
      expect(revoked.status).toBe(200);
      expect(revoked.body.invite).toMatchObject({ status: 'REVOKED' });
      const [revokedMessage] = await rows<{ body: string }>(sql`
        select body from email_outbox where org_id = ${a.org.id} and to_email = 'revogado@example.com'
      `);
      const describeRevoked = await app.inject({
        method: 'POST',
        url: '/invites/describe',
        remoteAddress: nextIp(),
        payload: { token: tokenFrom(revokedMessage?.body ?? '') },
      });
      expect(describeRevoked.statusCode).toBe(404);

      // O convidado viewer não convida nem lê a caixa de saída; outra org → 404.
      const viewer = await login(existing.user.email, 'senha-segura-123');
      await call(app, 'POST', '/auth/switch-org', {
        cookie: viewer.cookie,
        payload: { orgId: a.org.id },
      });
      const viewerInvite = await call(app, 'POST', `/organizations/${a.org.id}/invites`, {
        cookie: viewer.cookie,
        payload: { email: 'x@example.com', role: 'agent' },
      });
      expect(viewerInvite.status).toBe(403);
      expect((await call(app, 'GET', '/email-outbox', { cookie: viewer.cookie })).status).toBe(403);
      const crossOrg = await call(app, 'POST', `/organizations/${existing.org.id}/invites`, {
        cookie: a.cookie,
        payload: { email: 'y@example.com', role: 'agent' },
      });
      expect(crossOrg.status).toBe(404);
    });
  });
});
