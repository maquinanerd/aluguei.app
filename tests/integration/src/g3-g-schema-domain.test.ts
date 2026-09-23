import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { is, sql } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import * as dbSchema from '@aluguei/db';
import { createTestDb } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import * as contracts from '@aluguei/contracts';
import * as domain from '@aluguei/domain';

/**
 * G3, trilha G (auditoria 2026-09-10, P2-12): o banco é a última barreira do domínio.
 *
 * 1. Cada coluna de domínio fechado tem `CHECK <tabela>_<coluna>_valid`, e a lista do CHECK
 *    aplicado pelas migrations é exatamente a do domínio (`packages/domain`) ou, quando o domínio
 *    não tem a constante, a do contrato da API (`packages/contracts`). Mudou um lado sem o outro,
 *    este teste falha — as listas não derivam.
 * 2. Todo índice, UNIQUE e CHECK que existe no banco migrado está declarado no schema do drizzle
 *    (`packages/db/src/schema`): nada criado só no SQL escrito à mão, invisível ao `db:generate`.
 * 3. Os totais em centavos que somam muitas linhas são `bigint` no schema e no banco.
 */

interface DomainCheck {
  values: readonly string[];
  /** A coluna aceita nulo (o CHECK é `coluna is null or coluna in (...)`). */
  nullable?: boolean;
}

const c = contracts;
const d = domain;

/** Coluna → vocabulário esperado, tirado do domínio ou, na falta dele, do contrato. */
const DOMAIN_CHECKS: Record<string, DomainCheck> = {
  // Já existiam antes da trilha G (C, D, E2 e G2): continuam presos ao domínio.
  'organizations.status': { values: d.ORGANIZATION_STATUSES },
  'email_outbox.kind': { values: c.emailOutboxMessageSchema.shape.kind.options },
  'email_outbox.status': { values: c.emailOutboxMessageSchema.shape.status.options },
  'parties.type': { values: c.partySchema.shape.type.options },
  'parties.status': { values: c.partyStatusSchema.options },
  'party_identities.kind': { values: c.identityKindSchema.options },
  'party_documents.kind': { values: c.partyDocumentKindSchema.options },
  'visits.status': { values: d.VISIT_STATUSES },
  'proposals.status': { values: d.PROPOSAL_STATUSES },
  'rental_applications.decision_source': { values: d.CREDIT_DECISION_SOURCES, nullable: true },
  'inspection_ai_suggestions.status': { values: c.suggestionStatusSchema.options },
  'lease_amendments.kind': { values: c.leaseAmendmentKindSchema.options },
  'whatsapp_connections.status': { values: d.WHATSAPP_CONNECTION_STATUSES },
  // Onda 1A do frontend: módulos incluídos no plano (o CHECK é `modules <@ array[...]`).
  'plans.modules': { values: d.PLAN_MODULES },

  // Trilha G — CRM e imóveis.
  'party_roles.role': { values: c.partyRoleSchema.options },
  'leads.status': { values: d.FUNNEL_STATUSES },
  'tasks.status': { values: c.taskStatusSchema.options },
  'properties.status': { values: c.propertyStatusSchema.options },
  'properties.property_type': { values: c.propertyTypeSchema.options },
  // Onda 2A: finalidade do imóvel (alugar, vender ou os dois).
  'properties.purpose': { values: d.PROPERTY_PURPOSES },
  // Onda 2A: alerta de imóvel do portal.
  'search_alerts.purpose': { values: ['RENT', 'SALE'] },
  'search_alerts.status': { values: ['PENDING', 'ACTIVE', 'CANCELED'] },
  'search_alerts.contact_kind': { values: ['EMAIL', 'WHATSAPP'] },
  'property_media.kind': { values: c.mediaKindSchema.options },
  'listings.status': { values: d.LISTING_STATUSES },
  'portal_access.kind': { values: c.portalKindSchema.options },
  // Pendência do inventário da G: o que a API e o worker gravam na timeline.
  'timeline_events.entity_type': { values: c.timelineEntityTypeSchema.options },

  // Canais.
  'listing_channel_publications.channel': { values: d.CHANNEL_TYPES },
  'listing_channel_publications.status': { values: d.CHANNEL_PUBLICATION_STATUSES },
  'channel_sync_jobs.channel': { values: d.CHANNEL_TYPES },
  'channel_sync_jobs.job_type': { values: d.CHANNEL_JOB_TYPES },
  'channel_sync_jobs.status': { values: d.CHANNEL_JOB_STATUSES },

  // WhatsApp.
  'conversations.status': { values: d.CONVERSATION_STATUSES },
  'messages.direction': { values: c.messageSchema.shape.direction.options },
  'messages.sender_type': { values: c.messageSchema.shape.senderType.options },
  'conversation_intents.intent': { values: c.conversationIntentSchema.shape.intent.options },
  'conversation_intents.extracted_by': {
    values: c.conversationIntentSchema.shape.extractedBy.options,
  },

  // Locação, crédito, contrato e assinatura.
  'rental_applications.status': { values: d.RENTAL_APPLICATION_STATUSES },
  'screening_results.decision': { values: c.screeningResultSchema.shape.decision.options },
  'contract_templates.status': { values: c.contractTemplateSchema.shape.status.options },
  'contracts.status': { values: d.CONTRACT_STATUSES },
  'contract_parties.role': { values: c.contractPartySchema.shape.role.options },
  'signature_envelopes.status': { values: c.signatureEnvelopeSchema.shape.status.options },
  'signature_events.event_type': {
    values: c.signatureWebhookEventSchema.shape.eventType.options,
  },

  // Vistoria.
  'inspections.type': { values: c.inspectionTypeSchema.options },
  'inspections.status': { values: d.INSPECTION_STATUSES },
  'inspection_media.kind': { values: c.inspectionMediaKindSchema.options },
  'inspection_transcripts.status': { values: c.inspectionTranscriptSchema.shape.status.options },
  'inspection_ai_suggestions.kind': { values: c.suggestionKindSchema.options },
  'inspection_observations.category': { values: c.observationCategorySchema.options },
  'inspection_observations.severity': { values: c.severitySchema.options },
  'inspection_observations.source': {
    values: c.inspectionObservationSchema.shape.source.options,
  },
  'inspection_observations.status': {
    values: c.inspectionObservationSchema.shape.status.options,
  },
  'inspection_comparisons.status': { values: c.inspectionComparisonSchema.shape.status.options },

  // Financeiro.
  'leases.status': { values: d.LEASE_STATUSES },
  'lease_amendments.index_name': { values: c.leaseIndexNameSchema.options, nullable: true },
  'charges.status': { values: d.CHARGE_STATUSES },
  'payments.method': { values: c.paymentMethodSchema.options },
  'payments.status': { values: d.PAYMENT_STATUSES },
  'split_allocations.role': { values: d.SPLIT_ALLOCATION_ROLES },
  'payouts.status': { values: c.payoutSchema.shape.status.options },
  'ledger_accounts.type': { values: c.ledgerAccountSchema.shape.type.options },
  'reconciliations.status': { values: c.reconciliationSchema.shape.status.options },
  'reconciliations.provider': { values: c.reconciliationProviderSchema.options },
  'party_bank_accounts.status': { values: c.bankAccountSchema.shape.status.options },

  // Meta Ads.
  'meta_connections.status': { values: c.metaConnectionStatusSchema.options },
  'meta_assets.kind': { values: c.metaAssetKindSchema.options },
  'meta_ad_profiles.objective': { values: c.metaObjectiveSchema.options },
  'meta_ad_profiles.status': { values: c.metaAdProfileStatusSchema.options },
  'meta_campaign_links.objective': { values: c.metaObjectiveSchema.options },
  'meta_campaign_links.status': { values: c.metaCampaignStatusSchema.options },
  'meta_sync_jobs.job_type': { values: c.metaJobTypeSchema.options },
};

const MIGRATION_0022 = fileURLToPath(
  new URL('../../../packages/db/drizzle/0022_domain_checks_bigint_totals.sql', import.meta.url),
);

/** Totais que somam muitas linhas: `int4` estoura acima de R$ 21.474.836,47. */
const BIGINT_TOTALS = ['reconciliations.provider_total_cents', 'reconciliations.local_total_cents'];

type Row = Record<string, unknown>;

async function rows(db: AppDb, statement: ReturnType<typeof sql>): Promise<Row[]> {
  const result = await db.execute(statement);
  return result.rows as Row[];
}

/** Valores de um CHECK de lista, como o PostgreSQL devolve (`= ANY (ARRAY['A'::text, ...])`). */
function listedValues(definition: string): string[] {
  return [...definition.matchAll(/'((?:[^']|'')*)'::text/g)].map((m) =>
    (m[1] ?? '').replaceAll("''", "'"),
  );
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function schemaTables(): PgTable[] {
  return (Object.values(dbSchema) as unknown[]).filter((value): value is PgTable =>
    is(value, PgTable),
  );
}

describe('G3-G (P2-12): CHECK de domínio fechado igual ao domínio e aos contratos', () => {
  let db: AppDb;
  let checks: Map<string, string>;

  beforeAll(async () => {
    db = await createTestDb();
    const found = await rows(
      db,
      sql`select k.conname as name, pg_get_constraintdef(k.oid) as def
          from pg_constraint k join pg_class t on t.oid = k.conrelid
          where k.contype = 'c' and t.relnamespace = 'public'::regnamespace`,
    );
    checks = new Map(found.map((row) => [String(row['name']), String(row['def'])]));
  });

  afterAll(async () => {
    await (db.$client as unknown as { close?: () => Promise<void> }).close?.();
  });

  it.each(Object.entries(DOMAIN_CHECKS))('%s', (column, expected) => {
    const [table, name] = column.split('.') as [string, string];
    const constraint = `${table}_${name}_valid`;
    const definition = checks.get(constraint);
    expect(definition, `falta o CHECK ${constraint}`).toBeDefined();
    expect(sorted(listedValues(definition ?? ''))).toEqual(sorted(expected.values));
    expect(definition ?? '', 'o CHECK olha a própria coluna').toContain(name);
    if (expected.nullable) {
      expect(definition, 'coluna anulável: nulo continua aceito').toContain('IS NULL');
    } else {
      expect(definition, 'coluna obrigatória: o CHECK não abre exceção para nulo').not.toContain(
        'IS NULL',
      );
    }
  });

  it('todo CHECK de lista `<tabela>_<coluna>_valid` no banco tem o vocabulário mapeado aqui', () => {
    const unmapped = [...checks.entries()]
      .filter(([name, def]) => name.endsWith('_valid') && listedValues(def).length > 0)
      .map(([name]) => name)
      .filter(
        (name) =>
          !Object.keys(DOMAIN_CHECKS).some(
            (column) => `${column.replace('.', '_')}_valid` === name,
          ),
      );
    expect(unmapped).toEqual([]);
  });

  it('o CHECK recusa valor fora do domínio e aceita os do domínio (leads.status)', async () => {
    const org = randomUUID();
    await db.execute(
      sql`insert into organizations (id, name, slug) values (${org}, 'Org G', ${`org-g-${org}`})`,
    );
    for (const status of d.FUNNEL_STATUSES) {
      await db.execute(
        sql`insert into leads (id, org_id, status) values (${randomUUID()}, ${org}, ${status})`,
      );
    }
    let code: string | null = null;
    try {
      await db.execute(
        sql`insert into leads (id, org_id, status) values (${randomUUID()}, ${org}, 'CONTACTED')`,
      );
    } catch (error) {
      const cause = (error as { cause?: { code?: string }; code?: string }).cause ?? error;
      code = (cause as { code?: string }).code ?? null;
    }
    expect(code, 'status fora do funil é recusado pelo banco').toBe('23514');
  });

  it('o pré-voo da 0022 confere exatamente as colunas e listas dos CHECKs que a 0022 cria', () => {
    const text = readFileSync(MIGRATION_0022, 'utf8');
    const quoted = (list: string): string[] =>
      [...list.matchAll(/'([^']*)'/g)].map((m) => m[1] ?? '').sort();
    const created = [
      ...text.matchAll(
        /ADD CONSTRAINT "[a-z_]+_valid" CHECK \((?:"[a-z_]+"\."[a-z_]+" is null or )?"([a-z_]+)"\."([a-z_]+)" in \(([^)]*)\)\)/g,
      ),
    ].map((m) => [`${m[1] ?? ''}.${m[2] ?? ''}`, quoted(m[3] ?? '')] as const);
    const preflight = [...text.matchAll(/\('([a-z_]+)', '([a-z_]+)', ARRAY\[([^\]]*)\]\)/g)].map(
      (m) => [`${m[1] ?? ''}.${m[2] ?? ''}`, quoted(m[3] ?? '')] as const,
    );
    expect(created.length, 'a 0022 cria CHECKs de domínio').toBeGreaterThan(0);
    const byColumn = (a: readonly [string, string[]], b: readonly [string, string[]]): number =>
      a[0].localeCompare(b[0]);
    expect([...preflight].sort(byColumn)).toEqual([...created].sort(byColumn));
  });
});

describe('G3-G (P2-12): o schema do drizzle declara tudo o que existe no banco', () => {
  let db: AppDb;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await (db.$client as unknown as { close?: () => Promise<void> }).close?.();
  });

  it('índices e UNIQUE do banco migrado = índices e UNIQUE declarados no schema', async () => {
    const declared = new Set<string>();
    for (const table of schemaTables()) {
      const config = getTableConfig(table);
      declared.add(`${config.name}_pkey`);
      for (const index of config.indexes) {
        declared.add(index.config.name ?? '');
      }
      for (const unique of config.uniqueConstraints) {
        declared.add(unique.getName() ?? '');
      }
      for (const column of config.columns) {
        if (column.isUnique && column.uniqueName) {
          declared.add(column.uniqueName);
        }
      }
    }
    const found = await rows(
      db,
      sql`select indexname from pg_indexes where schemaname = 'public' order by indexname`,
    );
    const inDatabase = found.map((row) => String(row['indexname']));
    expect(
      inDatabase.filter((name) => !declared.has(name)),
      'índice só no SQL escrito à mão',
    ).toEqual([]);
    expect(
      [...declared].filter((name) => !inDatabase.includes(name)),
      'declarado e ausente do banco',
    ).toEqual([]);
  });

  it('CHECKs do banco migrado = CHECKs declarados no schema', async () => {
    const declared = schemaTables().flatMap((table) =>
      getTableConfig(table).checks.map((check) => check.name),
    );
    const found = await rows(
      db,
      sql`select k.conname from pg_constraint k join pg_class t on t.oid = k.conrelid
          where k.contype = 'c' and t.relnamespace = 'public'::regnamespace`,
    );
    expect(sorted(found.map((row) => String(row['conname'])))).toEqual(sorted(declared));
  });

  it('consentimento ativo único por pessoa e finalidade: índice parcial declarado no schema', async () => {
    const config = getTableConfig(dbSchema.partyConsents);
    const index = config.indexes.find((i) => i.config.name === 'party_consents_active_unique');
    expect(index, 'party_consents_active_unique declarado em crm.ts').toBeDefined();
    expect(index?.config.unique).toBe(true);
    expect(index?.config.where, 'índice parcial (só os não revogados)').toBeDefined();
    const found = await rows(
      db,
      sql`select indexdef from pg_indexes where indexname = 'party_consents_active_unique'`,
    );
    expect(String(found[0]?.['indexdef'])).toContain('WHERE (revoked_at IS NULL)');
  });

  it.each(BIGINT_TOTALS)('%s é bigint no schema e no banco', async (column) => {
    const [table, name] = column.split('.') as [string, string];
    const found = await rows(
      db,
      sql`select data_type from information_schema.columns
          where table_schema = 'public' and table_name = ${table} and column_name = ${name}`,
    );
    expect(found[0]?.['data_type']).toBe('bigint');
    const tableObject = schemaTables().find((t) => getTableConfig(t).name === table);
    const declared = getTableConfig(tableObject as PgTable).columns.find(
      (col) => col.name === name,
    );
    expect(declared?.getSQLType()).toBe('bigint');
  });
});
