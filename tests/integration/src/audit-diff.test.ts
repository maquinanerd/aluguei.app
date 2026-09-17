import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { auditEvents } from '@aluguei/db';
import { AUDIT_ACTIONS } from '@aluguei/domain';
import { buildTestApp, registerUser } from './helpers.js';

/**
 * P2-11 (auditoria 2026-09-10): `audit_events.payload` chegava vazio nas atualizações — a
 * trilha registrava "imóvel atualizado" sem dizer o que mudou. As rotas de atualização gravam
 * o diff dos campos alterados (antes e depois) sem dado pessoal: campo pessoal mascarado e
 * texto livre redigido.
 */
interface AuditPayload {
  fields?: string[];
  changes?: Record<string, { from: unknown; to: unknown }>;
  userId?: string;
}

describe('audit_events.payload com diff (P2-11)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function lastPayload(action: string, entityId: string): Promise<AuditPayload> {
    const [row] = await app.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, action), eq(auditEvents.entityId, entityId)))
      .orderBy(desc(auditEvents.createdAt))
      .limit(1);
    if (!row) {
      throw new Error(`nenhum audit_event ${action} para ${entityId}`);
    }
    return (row.payload ?? {}) as AuditPayload;
  }

  it('PATCH /properties/:id grava só o que mudou, com texto livre redigido', async () => {
    const { cookie } = await registerUser(app);
    const created = await app.inject({
      method: 'POST',
      url: '/properties',
      headers: { cookie },
      payload: { title: 'Casa Antiga', propertyType: 'HOUSE', bedrooms: 2, furnished: false },
    });
    expect(created.statusCode).toBe(201);
    const propertyId = (created.json() as { property: { id: string } }).property.id;

    const patch = await app.inject({
      method: 'PATCH',
      url: `/properties/${propertyId}`,
      headers: { cookie },
      payload: {
        title: 'Casa Reformada',
        bedrooms: 3,
        furnished: false,
        description: 'Falar com 11912345678 ou maria@exemplo.com',
      },
    });
    expect(patch.statusCode, JSON.stringify(patch.json())).toBe(200);

    const payload = await lastPayload(AUDIT_ACTIONS.PROPERTY_UPDATED, propertyId);
    expect(payload.fields).toEqual(['bedrooms', 'description', 'title']);
    expect(payload.changes?.title).toEqual({ from: 'Casa Antiga', to: 'Casa Reformada' });
    expect(payload.changes?.bedrooms).toEqual({ from: 2, to: 3 });
    expect(payload.changes?.description?.to).toBe('Falar com [REDACTED:PHONE] ou [REDACTED:EMAIL]');
    const asText = JSON.stringify(payload);
    expect(asText).not.toContain('11912345678');
    expect(asText).not.toContain('maria@exemplo.com');
    expect(asText).not.toContain('updatedAt');
  });

  it('troca de papel de membro grava o papel antes e depois, sem dado do usuário', async () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const owner = await registerUser(app, {
      email: `owner-audit-${suffix}@example.com`,
      organizationName: `Org Audit ${suffix}`,
    });
    const member = await registerUser(app, {
      email: `membro-audit-${suffix}@example.com`,
      name: 'Membro Auditado',
      organizationName: `Org Pessoal ${suffix}`,
    });
    const added = await app.inject({
      method: 'POST',
      url: `/organizations/${owner.body.org.id}/members`,
      headers: { cookie: owner.cookie },
      payload: { userId: member.body.user.id, role: 'agent' },
    });
    expect(added.statusCode).toBe(201);
    const membershipId = (added.json() as { membership: { id: string } }).membership.id;

    const changed = await app.inject({
      method: 'PATCH',
      url: `/organizations/${owner.body.org.id}/members/${member.body.user.id}`,
      headers: { cookie: owner.cookie },
      payload: { role: 'manager' },
    });
    expect(changed.statusCode, JSON.stringify(changed.json())).toBe(200);

    const payload = await lastPayload(AUDIT_ACTIONS.MEMBER_ROLE_CHANGED, membershipId);
    expect(payload.fields).toEqual(['role']);
    expect(payload.changes?.role).toEqual({ from: 'agent', to: 'manager' });
    expect(payload.userId).toBe(member.body.user.id);
    const asText = JSON.stringify(payload);
    expect(asText).not.toContain(`membro-audit-${suffix}@example.com`);
    expect(asText).not.toContain('Membro Auditado');
  });
});
