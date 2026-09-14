import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { buildTestApp, fakeStorage, registerUser } from './helpers.js';
import { findCrossOrgReferences } from './cross-org-verify.js';

/**
 * P0-05 (auditoria 2026-09-10): isolamento multi-tenant por referência.
 * Para cada rota que recebe um id de outra entidade, a org B tenta usar um id
 * da org A. Esperado: 404 NOT_FOUND (a mesma resposta de um id inexistente,
 * sem oráculo de existência), nenhuma linha criada em B, e o mesmo pedido com
 * ids da própria B funciona (controle positivo — prova que o 404 vem do dono).
 */

interface Org {
  cookie: string;
  orgId: string;
  userId: string;
  partyId: string;
  propertyId: string;
  propertyMediaId: string;
  listingId: string;
  leadId: string;
  proposalId: string;
  applicationId: string;
  consentId: string;
  inspectionId: string;
  roomId: string;
  inspectionMediaId: string;
  connectionId: string;
  pageAssetId: string;
  instagramAssetId: string;
}

type Refs = Omit<Org, 'cookie' | 'orgId'>;

interface Json {
  [key: string]: unknown;
}

const uniq = (): string => Math.random().toString(36).slice(2, 10);

function randomRefs(): Refs {
  return {
    userId: randomUUID(),
    partyId: randomUUID(),
    propertyId: randomUUID(),
    propertyMediaId: randomUUID(),
    listingId: randomUUID(),
    leadId: randomUUID(),
    proposalId: randomUUID(),
    applicationId: randomUUID(),
    consentId: randomUUID(),
    inspectionId: randomUUID(),
    roomId: randomUUID(),
    inspectionMediaId: randomUUID(),
    connectionId: randomUUID(),
    pageAssetId: randomUUID(),
    instagramAssetId: randomUUID(),
  };
}

describe('P0-05: referência entre organizações é bloqueada', () => {
  let app: FastifyInstance;
  let A: Org;
  let B: Org;
  let bCampaignId = '';

  async function call(
    cookie: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: Json,
  ): Promise<{ status: number; body: Json }> {
    const res = await app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload !== undefined ? { payload } : {}),
    });
    return { status: res.statusCode, body: (res.json() as Json | null) ?? {} };
  }

  async function created(cookie: string, url: string, payload: Json, key: string): Promise<string> {
    const res = await call(cookie, 'POST', url, payload);
    expect(res.status, `${url}: ${JSON.stringify(res.body)}`).toBe(201);
    return (res.body[key] as { id: string }).id;
  }

  async function seedOrg(label: string, cpf: string): Promise<Org> {
    const user = await registerUser(app, { organizationName: `Org ${label} ${uniq()}` });
    const cookie = user.cookie;

    const partyId = await created(
      cookie,
      '/parties',
      { type: 'PERSON', name: `Cliente ${label}`, identities: [{ kind: 'CPF', value: cpf }] },
      'party',
    );
    const consentId = await created(
      cookie,
      `/parties/${partyId}/consents`,
      { purpose: 'CREDIT_SCREENING' },
      'consent',
    );
    const propertyId = await created(
      cookie,
      '/properties',
      { title: `Imóvel ${label}`, propertyType: 'HOUSE' },
      'property',
    );
    expect(
      (
        await call(cookie, 'PUT', `/properties/${propertyId}/financial-terms`, {
          monthlyRentCents: 250_000,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(cookie, 'PUT', `/properties/${propertyId}/address`, {
          publicAddress: {
            street: 'Rua Teste',
            city: 'São Paulo',
            state: 'SP',
            zipCode: '01310-100',
          },
        })
      ).status,
    ).toBe(200);

    const upload = await call(cookie, 'POST', `/properties/${propertyId}/media/upload-url`, {
      kind: 'PHOTO',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
    });
    expect(upload.status).toBe(200);
    fakeStorage.markUploaded(upload.body.key as string, 2048);
    const propertyMediaId = await created(
      cookie,
      `/properties/${propertyId}/media/confirm`,
      { key: upload.body.key as string },
      'media',
    );

    const listingId = await created(
      cookie,
      '/listings',
      { propertyId, title: `Anúncio ${label}`, description: '2 quartos' },
      'listing',
    );
    for (const status of ['READY', 'PUBLISHED']) {
      expect(
        (await call(cookie, 'PATCH', `/listings/${listingId}/status`, { status })).status,
      ).toBe(200);
    }

    const leadId = await created(cookie, '/leads', { partyId }, 'lead');
    const proposalId = await created(
      cookie,
      '/proposals',
      { leadId, partyId, propertyId, monthlyRentCents: 250_000 },
      'proposal',
    );
    const applicationId = await created(
      cookie,
      '/rental-applications',
      { partyId, propertyId },
      'application',
    );

    const inspectionId = await created(
      cookie,
      '/inspections',
      { propertyId, type: 'CHECKIN' },
      'inspection',
    );
    const roomId = await created(
      cookie,
      `/inspections/${inspectionId}/rooms`,
      { name: 'Sala' },
      'room',
    );
    const photo = await call(cookie, 'POST', `/inspections/${inspectionId}/media/upload-url`, {
      kind: 'PHOTO',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
    });
    expect(photo.status).toBe(200);
    fakeStorage.markUploaded(photo.body.key as string, 2048);
    const inspectionMediaId = await created(
      cookie,
      `/inspections/${inspectionId}/media/confirm`,
      { key: photo.body.key as string },
      'media',
    );

    const connectionId = await created(
      cookie,
      '/meta/connections',
      { provider: 'FAKE' },
      'connection',
    );
    const assets = await call(cookie, 'GET', `/meta/connections/${connectionId}/assets`);
    const list = assets.body.assets as Array<{ id: string; kind: string }>;
    const pageAssetId = list.find((a) => a.kind === 'PAGE')?.id ?? '';
    const instagramAssetId = list.find((a) => a.kind === 'INSTAGRAM_ACCOUNT')?.id ?? '';
    expect(pageAssetId).not.toBe('');
    expect(instagramAssetId).not.toBe('');

    return {
      cookie,
      orgId: user.body.org.id,
      userId: user.body.user.id,
      partyId,
      propertyId,
      propertyMediaId,
      listingId,
      leadId,
      proposalId,
      applicationId,
      consentId,
      inspectionId,
      roomId,
      inspectionMediaId,
      connectionId,
      pageAssetId,
      instagramAssetId,
    };
  }

  /** Payload de ad-profile válido no contexto de B (só troca o que o caso pedir). */
  function adProfile(b: Org, override: Json): Json {
    return {
      connectionId: b.connectionId,
      listingId: b.listingId,
      propertyId: b.propertyId,
      name: 'Campanha B',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudgetCents: 5_000_00,
      mediaSelection: [b.propertyMediaId],
      landingUrl: 'https://aluguei.app/imoveis/exemplo',
      copyPrimary: 'Apartamento pronto para morar',
      idempotencyKey: `prep-${uniq()}`,
      ...override,
    };
  }

  async function countInOrg(table: string, orgId: string): Promise<number> {
    const res = await app.db.execute(
      sql`select count(*)::int as n from ${sql.identifier(table)} where org_id = ${orgId}`,
    );
    return (res.rows[0] as { n: number }).n;
  }

  beforeAll(async () => {
    app = await buildTestApp();
    process.env.META_TOKEN_ENCRYPTION_KEY = 'c'.repeat(64);
    A = await seedOrg('A', '52998224725');
    B = await seedOrg('B', '52998224725');
    const profile = await created(B.cookie, '/meta/ad-profiles', adProfile(B, {}), 'adProfile');
    const campaign = await call(B.cookie, 'POST', `/meta/ad-profiles/${profile}/create-campaign`, {
      idempotencyKey: `crt-${uniq()}`,
    });
    expect(campaign.status).toBe(201);
    bCampaignId = (campaign.body.campaign as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  interface RefCase {
    name: string;
    url: (b: Org) => string;
    payload: (ref: Refs, b: Org) => Json;
    /** tabelas de B que não podem ganhar linhas quando o id é de A */
    tables: string[];
    controlStatus?: number;
  }

  const at = new Date(Date.now() + 86_400_000).toISOString();

  const cases: RefCase[] = [
    {
      name: 'POST /leads partyId',
      url: () => '/leads',
      payload: (r) => ({ partyId: r.partyId }),
      tables: ['leads'],
    },
    {
      name: 'POST /leads interestedPropertyIds',
      url: () => '/leads',
      payload: (r) => ({ interestedPropertyIds: [r.propertyId] }),
      tables: ['leads', 'lead_property_interests'],
    },
    {
      name: 'POST /visits leadId',
      url: () => '/visits',
      payload: (r) => ({ leadId: r.leadId, scheduledAt: at }),
      tables: ['visits'],
    },
    {
      name: 'POST /visits partyId',
      url: () => '/visits',
      payload: (r) => ({ partyId: r.partyId, scheduledAt: at }),
      tables: ['visits'],
    },
    {
      name: 'POST /visits propertyId',
      url: () => '/visits',
      payload: (r) => ({ propertyId: r.propertyId, scheduledAt: at }),
      tables: ['visits'],
    },
    {
      name: 'POST /proposals leadId',
      url: () => '/proposals',
      payload: (r) => ({ leadId: r.leadId, monthlyRentCents: 100_000 }),
      tables: ['proposals'],
    },
    {
      name: 'POST /proposals partyId',
      url: () => '/proposals',
      payload: (r) => ({ partyId: r.partyId, monthlyRentCents: 100_000 }),
      tables: ['proposals'],
    },
    {
      name: 'POST /proposals propertyId',
      url: () => '/proposals',
      payload: (r) => ({ propertyId: r.propertyId, monthlyRentCents: 100_000 }),
      tables: ['proposals'],
    },
    {
      name: 'POST /rental-applications partyId',
      url: () => '/rental-applications',
      payload: (r, b) => ({ partyId: r.partyId, propertyId: b.propertyId }),
      tables: ['rental_applications'],
    },
    {
      name: 'POST /rental-applications propertyId',
      url: () => '/rental-applications',
      payload: (r, b) => ({ partyId: b.partyId, propertyId: r.propertyId }),
      tables: ['rental_applications'],
    },
    {
      name: 'POST /rental-applications leadId',
      url: () => '/rental-applications',
      payload: (r, b) => ({ partyId: b.partyId, propertyId: b.propertyId, leadId: r.leadId }),
      tables: ['rental_applications'],
    },
    {
      name: 'POST /rental-applications proposalId',
      url: () => '/rental-applications',
      payload: (r, b) => ({
        partyId: b.partyId,
        propertyId: b.propertyId,
        proposalId: r.proposalId,
      }),
      tables: ['rental_applications'],
    },
    {
      name: 'POST /inspections propertyId',
      url: () => '/inspections',
      payload: (r) => ({ propertyId: r.propertyId, type: 'CHECKIN' }),
      tables: ['inspections'],
    },
    {
      name: 'POST /inspections/:id/observations roomId',
      url: (b) => `/inspections/${b.inspectionId}/observations`,
      payload: (r) => ({
        roomId: r.roomId,
        category: 'DAMAGE',
        severity: 'LOW',
        description: 'Risco na parede',
      }),
      tables: ['inspection_observations'],
    },
    {
      name: 'POST /inspections/:id/observations mediaId',
      url: (b) => `/inspections/${b.inspectionId}/observations`,
      payload: (r) => ({
        mediaId: r.inspectionMediaId,
        category: 'DAMAGE',
        severity: 'LOW',
        description: 'Risco na parede',
      }),
      tables: ['inspection_observations'],
    },
    {
      name: 'POST /tasks assigneeUserId',
      url: () => '/tasks',
      payload: (r) => ({ title: 'Ligar para cliente', assigneeUserId: r.userId }),
      tables: ['tasks'],
    },
    {
      name: 'POST /tasks relatedEntityId (LEAD)',
      url: () => '/tasks',
      payload: (r) => ({
        title: 'Retornar lead',
        relatedEntityType: 'LEAD',
        relatedEntityId: r.leadId,
      }),
      tables: ['tasks'],
    },
    {
      name: 'POST /timeline entityId (LEAD)',
      url: () => '/timeline',
      payload: (r) => ({ entityType: 'LEAD', entityId: r.leadId, eventType: 'NOTA' }),
      tables: ['timeline_events'],
    },
    {
      name: 'POST /meta/ad-profiles connectionId',
      url: () => '/meta/ad-profiles',
      payload: (r, b) => adProfile(b, { connectionId: r.connectionId }),
      tables: ['meta_ad_profiles'],
    },
    {
      name: 'POST /meta/ad-profiles pageAssetId',
      url: () => '/meta/ad-profiles',
      payload: (r, b) => adProfile(b, { pageAssetId: r.pageAssetId }),
      tables: ['meta_ad_profiles'],
    },
    {
      name: 'POST /meta/ad-profiles instagramAssetId',
      url: () => '/meta/ad-profiles',
      payload: (r, b) => adProfile(b, { instagramAssetId: r.instagramAssetId }),
      tables: ['meta_ad_profiles'],
    },
    {
      name: 'POST /meta/campaigns/:id/creative mediaSelection',
      url: () => `/meta/campaigns/${bCampaignId}/creative`,
      payload: (r) => ({
        copyPrimary: 'Nova chamada',
        mediaSelection: [r.propertyMediaId],
        idempotencyKey: `crv-${uniq()}`,
      }),
      tables: ['meta_sync_jobs'],
      controlStatus: 202,
    },
  ];

  it.each(cases.map((c) => [c.name, c] as const))('%s', async (_name, c) => {
    // controle positivo: com ids da própria B a rota funciona
    const control = await call(B.cookie, 'POST', c.url(B), c.payload(B, B));
    expect(control.status, JSON.stringify(control.body)).toBe(c.controlStatus ?? 201);

    const before = await Promise.all(c.tables.map((t) => countInOrg(t, B.orgId)));
    const attack = await call(B.cookie, 'POST', c.url(B), c.payload(A, B));
    expect(attack.status, JSON.stringify(attack.body)).toBe(404);
    expect(attack.body.code).toBe('NOT_FOUND');

    // id inexistente → mesma resposta (sem oráculo de existência)
    const missing = await call(B.cookie, 'POST', c.url(B), c.payload(randomRefs(), B));
    expect(missing.status, JSON.stringify(missing.body)).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');
    expect(missing.body.message).toBe(attack.body.message);

    const after = await Promise.all(c.tables.map((t) => countInOrg(t, B.orgId)));
    expect(after).toEqual(before);
  });

  it('observação com ambiente/mídia de OUTRA vistoria da mesma org → 404', async () => {
    const other = await created(
      B.cookie,
      '/inspections',
      { propertyId: B.propertyId, type: 'CHECKOUT' },
      'inspection',
    );
    const res = await call(B.cookie, 'POST', `/inspections/${other}/observations`, {
      roomId: B.roomId,
      category: 'DAMAGE',
      severity: 'LOW',
      description: 'Ambiente de outra vistoria',
    });
    expect(res.status).toBe(404);
  });

  it('consentimento LGPD: B não lista nem cria consentimento da pessoa de A (404)', async () => {
    const list = await call(B.cookie, 'GET', `/parties/${A.partyId}/consents`);
    expect(list.status).toBe(404);
    const own = await call(B.cookie, 'GET', `/parties/${B.partyId}/consents`);
    expect(own.status).toBe(200);
    expect((own.body.consents as unknown[]).length).toBe(1);

    const grant = await call(B.cookie, 'POST', `/parties/${A.partyId}/consents`, {
      purpose: 'CREDIT_SCREENING',
    });
    expect(grant.status).toBe(404);
  });

  it('consentimento LGPD: agregado da candidatura nunca devolve consentimento de outra org', async () => {
    // Linha "legada" envenenada (candidatura de B apontando para a pessoa de A),
    // inserida por fora das FKs para provar o filtro de org na leitura.
    const poisonedId = randomUUID();
    await app.db.execute(sql`set session_replication_role = replica`);
    try {
      await app.db.execute(
        sql`insert into rental_applications (id, org_id, party_id, property_id) values (${poisonedId}, ${B.orgId}, ${A.partyId}, ${B.propertyId})`,
      );
    } finally {
      await app.db.execute(sql`set session_replication_role = origin`);
    }
    try {
      const res = await call(B.cookie, 'GET', `/rental-applications/${poisonedId}`);
      expect(JSON.stringify(res.body)).not.toContain(A.consentId);
      if (res.status === 200) {
        expect(res.body.consent).toBeNull();
      }
    } finally {
      await app.db.execute(sql`delete from rental_applications where id = ${poisonedId}`);
    }
  });

  it('rotas filhas de vistoria de outra org → 404 (não 500)', async () => {
    const base = `/inspections/${A.inspectionId}`;
    const attempts: Array<[string, 'POST' | 'DELETE', string, Json | undefined]> = [
      ['rooms', 'POST', `${base}/rooms`, { name: 'X' }],
      [
        'observations',
        'POST',
        `${base}/observations`,
        { category: 'DAMAGE', severity: 'LOW', description: 'x' },
      ],
      [
        'upload-url',
        'POST',
        `${base}/media/upload-url`,
        { kind: 'PHOTO', mimeType: 'image/jpeg', sizeBytes: 10 },
      ],
      [
        'confirm',
        'POST',
        `${base}/media/confirm`,
        { key: `orgs/${B.orgId}/inspections/${A.inspectionId}/x.jpg` },
      ],
      ['delete media', 'DELETE', `${base}/media/${A.inspectionMediaId}`, undefined],
    ];
    for (const [label, method, url, payload] of attempts) {
      const res = await call(B.cookie, method, url, payload);
      expect(res.status, `${label}: ${JSON.stringify(res.body)}`).toBe(404);
    }
    const media = await app.db.execute(
      sql`select count(*)::int as n from inspection_media where id = ${A.inspectionMediaId}`,
    );
    expect((media.rows[0] as { n: number }).n).toBe(1);
  });

  it('regressão: rotas que já validavam o dono continuam 404', async () => {
    const listing = await call(B.cookie, 'POST', '/listings', {
      propertyId: A.propertyId,
      title: 'x',
      description: 'y',
    });
    expect(listing.status).toBe(404);
    const contract = await call(B.cookie, 'POST', '/contracts', {
      applicationId: A.applicationId,
      templateId: randomUUID(),
    });
    expect(contract.status).toBe(404);
  });

  it('defesa no banco: FK composta recusa referência a outra org (23503)', async () => {
    // Sem passar pela API: INSERT direto com id da org A gravando na org B.
    // Se uma rota futura esquecer a checagem de dono, é aqui que para.
    const id = (): string => randomUUID();
    const cases: Array<[string, ReturnType<typeof sql>]> = [
      [
        'leads.party_id',
        sql`insert into leads (id, org_id, status, party_id)
            values (${id()}, ${B.orgId}, 'NEW', ${A.partyId})`,
      ],
      [
        'lead_property_interests.property_id',
        sql`insert into lead_property_interests (id, org_id, lead_id, property_id)
            values (${id()}, ${B.orgId}, ${B.leadId}, ${A.propertyId})`,
      ],
      [
        'visits.party_id',
        sql`insert into visits (id, org_id, party_id, scheduled_at, status)
            values (${id()}, ${B.orgId}, ${A.partyId}, now(), 'SCHEDULED')`,
      ],
      [
        'proposals.property_id',
        sql`insert into proposals (id, org_id, property_id, monthly_rent_cents, status)
            values (${id()}, ${B.orgId}, ${A.propertyId}, 250000, 'DRAFT')`,
      ],
      [
        'rental_applications.party_id',
        sql`insert into rental_applications (id, org_id, party_id, property_id, status)
            values (${id()}, ${B.orgId}, ${A.partyId}, ${B.propertyId}, 'DRAFT')`,
      ],
      [
        'rental_applications.proposal_id',
        sql`insert into rental_applications (id, org_id, party_id, property_id, proposal_id, status)
            values (${id()}, ${B.orgId}, ${B.partyId}, ${B.propertyId}, ${A.proposalId}, 'DRAFT')`,
      ],
      [
        'inspections.property_id',
        sql`insert into inspections (id, org_id, property_id, type, status)
            values (${id()}, ${B.orgId}, ${A.propertyId}, 'CHECKIN', 'DRAFT')`,
      ],
      [
        'inspection_media.room_id',
        sql`insert into inspection_media (id, org_id, inspection_id, room_id, kind, storage_key)
            values (${id()}, ${B.orgId}, ${B.inspectionId}, ${A.roomId}, 'PHOTO', ${`k-${uniq()}`})`,
      ],
      [
        'inspection_observations.media_id',
        sql`insert into inspection_observations
              (id, org_id, inspection_id, media_id, category, severity, description, source, status)
            values (${id()}, ${B.orgId}, ${B.inspectionId}, ${A.inspectionMediaId},
                    'DAMAGE', 'LOW', 'risco na parede', 'HUMAN', 'CONFIRMED')`,
      ],
      [
        'meta_ad_profiles.page_asset_id',
        sql`insert into meta_ad_profiles
              (id, org_id, connection_id, property_id, page_asset_id, name, objective,
               landing_url, copy_primary, status)
            values (${id()}, ${B.orgId}, ${B.connectionId}, ${B.propertyId}, ${A.pageAssetId},
                    'Campanha', 'OUTCOME_TRAFFIC', 'https://aluguei.app/x', 'copy', 'DRAFT')`,
      ],
    ];

    for (const [label, statement] of cases) {
      let code: string | undefined;
      try {
        await app.db.execute(statement);
      } catch (error) {
        code = sqlState(error);
      }
      // 23503 = foreign_key_violation. Outro código (ou nenhum) significa que o
      // insert passou ou falhou por outro motivo — nos dois casos o teste falha.
      expect(code, `${label}: o banco deveria recusar com 23503`).toBe('23503');
    }

    expect(await findCrossOrgReferences(app.db)).toEqual([]);
  });

  it('controle positivo: a mesma referência dentro da própria org é aceita', async () => {
    const leadId = randomUUID();
    await app.db.execute(
      sql`insert into leads (id, org_id, status, party_id)
          values (${leadId}, ${B.orgId}, 'NEW', ${B.partyId})`,
    );
    const row = await app.db.execute(
      sql`select count(*)::int as n from leads where id = ${leadId} and party_id = ${B.partyId}`,
    );
    expect((row.rows[0] as { n: number }).n).toBe(1);
  });

  it('verificação SQL: zero referências entre organizações', async () => {
    expect(await findCrossOrgReferences(app.db)).toEqual([]);
  });
});

/** SQLSTATE do erro: o driver aninha o erro original na cadeia de causas. */
function sqlState(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
