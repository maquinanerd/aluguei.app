import { randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

/**
 * Migrations da trilha A do Gate G2 (0014–0017) sobre dados legados. Cada caso
 * aplica as migrations até a anterior, grava o dado que o defeito deixava no
 * banco e aplica o restante: o pré-voo tem de abortar sem aplicar nada, e,
 * removida a linha inconsistente, a migração conclui e converte os dados
 * legítimos (auditoria 2026-09-10: P0-04, P1-06, P1-11 e P1-05).
 */

const MIGRATIONS = fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url));
const tempDirs: string[] = [];

interface Journal {
  entries: Array<{ tag: string }>;
}

type Row = Record<string, unknown>;

interface LegacyDatabase {
  run: (statement: SQL) => Promise<Row[]>;
  /** Aplica as migrations restantes; devolve a mensagem de erro ou null. */
  migrateRest: () => Promise<string | null>;
  columnExists: (table: string, column: string) => Promise<boolean>;
  close: () => Promise<void>;
}

function errorMessages(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages.join(' | ');
}

async function legacyDatabase(lastAppliedTag: string): Promise<LegacyDatabase> {
  const folder = mkdtempSync(join(tmpdir(), 'aluguei-migracoes-'));
  tempDirs.push(folder);
  cpSync(MIGRATIONS, folder, { recursive: true });
  const journalPath = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Journal;
  const last = journal.entries.findIndex((entry) => entry.tag === lastAppliedTag);
  if (last < 0) {
    throw new Error(`migration ${lastAppliedTag} não encontrada`);
  }
  journal.entries = journal.entries.slice(0, last + 1);
  writeFileSync(journalPath, JSON.stringify(journal));

  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: folder });
  const run = async (statement: SQL): Promise<Row[]> => (await db.execute(statement)).rows as Row[];
  return {
    run,
    migrateRest: async () => {
      try {
        await migrate(db, { migrationsFolder: MIGRATIONS });
        return null;
      } catch (error) {
        return errorMessages(error);
      }
    },
    columnExists: async (table, column) => {
      const rows = await run(sql`
        select count(*)::int as n from information_schema.columns
        where table_schema = 'public' and table_name = ${table} and column_name = ${column}
      `);
      return rows[0]?.['n'] === 1;
    },
    close: () => client.close(),
  };
}

async function seedOrganization(legacy: LegacyDatabase): Promise<string> {
  const org = randomUUID();
  await legacy.run(
    sql`insert into organizations (id, name, slug) values (${org}, 'Org legada', ${`org-${org}`})`,
  );
  return org;
}

async function seedProperty(legacy: LegacyDatabase, org: string): Promise<string> {
  const property = randomUUID();
  await legacy.run(sql`
    insert into properties (id, org_id, title, property_type)
    values (${property}, ${org}, 'Imóvel legado', 'HOUSE')
  `);
  return property;
}

describe('migrations da trilha A (G2): pré-voo aborta sem aplicar nada; migração de dados converte', () => {
  afterAll(() => {
    for (const folder of tempDirs) {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('0014 (P0-04): contrato assinado e depois regenerado aborta; contrato íntegro vira versão 1', async () => {
    const legacy = await legacyDatabase('0013_tenant_composite_fks');
    try {
      const org = await seedOrganization(legacy);
      const corrupted = randomUUID();
      const intact = randomUUID();
      await legacy.run(sql`
        insert into contracts (id, org_id, status, content, content_hash, signed_at) values
          (${corrupted}, ${org}, 'GENERATED', 'texto regenerado',
           encode(sha256(convert_to('texto regenerado', 'UTF8')), 'hex'), now()),
          (${intact}, ${org}, 'GENERATED', 'texto íntegro',
           encode(sha256(convert_to('texto íntegro', 'UTF8')), 'hex'), null)
      `);

      const failure = await legacy.migrateRest();
      expect(failure).toContain('Migracao 0014 abortada');
      expect(failure).toContain('assinado e regenerado');
      expect(await legacy.columnExists('contracts', 'current_version')).toBe(false);

      await legacy.run(sql`delete from contracts where id = ${corrupted}`);
      expect(await legacy.migrateRest()).toBeNull();
      expect(
        await legacy.run(sql`
          select c.current_version, v.version, v.content_hash = c.content_hash as same_hash
          from contracts c join contract_versions v on v.contract_id = c.id
          where c.id = ${intact}
        `),
      ).toEqual([{ current_version: 1, version: 1, same_hash: true }]);
    } finally {
      await legacy.close();
    }
  });

  it('0015 (P1-06): crédito aprovado sem análise aborta; decisão do worker ganha origem e contrato ativo leva a CONTRACTING', async () => {
    const legacy = await legacyDatabase('0014_contract_versions');
    try {
      const org = await seedOrganization(legacy);
      const property = await seedProperty(legacy, org);
      const party = randomUUID();
      const bypassed = randomUUID();
      const automatic = randomUUID();
      await legacy.run(sql`
        insert into parties (id, org_id, type, name) values (${party}, ${org}, 'PERSON', 'Candidata')
      `);
      await legacy.run(sql`
        insert into rental_applications
          (id, org_id, party_id, property_id, status, decision_reason, decided_at) values
          (${bypassed}, ${org}, ${party}, ${property}, 'APPROVED', null, null),
          (${automatic}, ${org}, ${party}, ${property}, 'APPROVED', 'auto:approve', now())
      `);
      await legacy.run(sql`
        insert into screening_results (id, org_id, application_id, provider, score, decision)
        values (${randomUUID()}, ${org}, ${automatic}, 'FAKE', 820, 'APPROVE')
      `);
      await legacy.run(sql`
        insert into contracts (id, org_id, application_id, status)
        values (${randomUUID()}, ${org}, ${automatic}, 'DRAFT')
      `);

      const failure = await legacy.migrateRest();
      expect(failure).toContain('Migracao 0015 abortada');
      expect(failure).toContain('decidida sem motivo');
      expect(failure).toContain('sem resultado de screening');
      expect(await legacy.columnExists('rental_applications', 'decision_source')).toBe(false);

      await legacy.run(sql`delete from rental_applications where id = ${bypassed}`);
      expect(await legacy.migrateRest()).toBeNull();
      expect(
        await legacy.run(
          sql`select status, decision_source from rental_applications where id = ${automatic}`,
        ),
      ).toEqual([{ status: 'CONTRACTING', decision_source: 'AUTOMATIC' }]);
    } finally {
      await legacy.close();
    }
  });

  it('0016 (P1-11): envelope gravado como FAKE com id de provider real aborta; envelope FAKE legítimo segue', async () => {
    const legacy = await legacyDatabase('0015_credit_decision_audit');
    try {
      const org = await seedOrganization(legacy);
      const contract = randomUUID();
      const orphan = randomUUID();
      await legacy.run(sql`
        insert into contracts (id, org_id, status) values (${contract}, ${org}, 'DRAFT')
      `);
      await legacy.run(sql`
        insert into signature_envelopes (id, org_id, contract_id, provider, provider_envelope_id)
        values
          (${orphan}, ${org}, ${contract}, 'FAKE', 'env-clicksign-real-1'),
          (${randomUUID()}, ${org}, ${contract}, 'FAKE', 'env.fake.0123456789ab')
      `);

      const failure = await legacy.migrateRest();
      expect(failure).toContain('Migracao 0016 abortada');
      expect(failure).toContain('gravado como FAKE com id de outro provider');
      expect(await legacy.columnExists('signature_envelopes', 'document_hash')).toBe(false);

      await legacy.run(sql`delete from signature_envelopes where id = ${orphan}`);
      expect(await legacy.migrateRest()).toBeNull();
      expect(
        await legacy.run(sql`select provider_envelope_id, document_hash from signature_envelopes`),
      ).toEqual([{ provider_envelope_id: 'env.fake.0123456789ab', document_hash: null }]);
    } finally {
      await legacy.close();
    }
  });

  it('0017 (P1-05): sugestão gravada com a ação vira ACCEPTED/REJECTED/EDITED; status desconhecido aborta', async () => {
    const legacy = await legacyDatabase('0016_signature_document_hash');
    try {
      const org = await seedOrganization(legacy);
      const property = await seedProperty(legacy, org);
      const inspection = randomUUID();
      await legacy.run(sql`
        insert into inspections (id, org_id, property_id, type)
        values (${inspection}, ${org}, ${property}, 'CHECKIN')
      `);
      const byLegacyStatus = new Map<string, string>();
      for (const status of ['ACCEPT', 'REJECT', 'EDIT', 'PENDING', 'SUGERIDA']) {
        const id = randomUUID();
        byLegacyStatus.set(status, id);
        await legacy.run(sql`
          insert into inspection_ai_suggestions (id, org_id, inspection_id, kind, payload, status)
          values (${id}, ${org}, ${inspection}, 'VISUAL', '{}'::jsonb, ${status})
        `);
      }
      const statuses = async (): Promise<Row[]> =>
        legacy.run(sql`select id, status from inspection_ai_suggestions order by status`);

      const failure = await legacy.migrateRest();
      expect(failure).toContain('Migracao 0017 abortada');
      expect(failure).toContain('status desconhecido');
      // Nada foi aplicado: a ação continua gravada como status.
      expect((await statuses()).map((row) => row['status'])).toContain('ACCEPT');

      await legacy.run(
        sql`delete from inspection_ai_suggestions where id = ${byLegacyStatus.get('SUGERIDA') ?? ''}`,
      );
      expect(await legacy.migrateRest()).toBeNull();
      expect(
        Object.fromEntries((await statuses()).map((row) => [row['id'], row['status']])),
      ).toEqual({
        [byLegacyStatus.get('ACCEPT') ?? '']: 'ACCEPTED',
        [byLegacyStatus.get('REJECT') ?? '']: 'REJECTED',
        [byLegacyStatus.get('EDIT') ?? '']: 'EDITED',
        [byLegacyStatus.get('PENDING') ?? '']: 'PENDING',
      });
    } finally {
      await legacy.close();
    }
  });
});
