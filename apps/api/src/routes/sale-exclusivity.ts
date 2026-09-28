import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { properties, propertyMedia, propertySaleExclusivities } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  assertValidExclusivityPeriod,
  exclusivityStatus,
  isExclusivityInForce,
  periodsOverlap,
} from '@aluguei/domain';
import {
  cancelSaleExclusivityRequestSchema,
  createSaleExclusivityRequestSchema,
  listSaleExclusivitiesResponseSchema,
  saleExclusivityResponseSchema,
  uuidSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';

/**
 * Exclusividade de venda (Onda 5).
 *
 * A situação é calculada aqui e vai pronta para a tela: duas contas de prazo
 * divergem exatamente no dia em que mais importam, o do vencimento.
 */

/** Hoje em dia ISO, no fuso do Brasil — é o calendário de quem opera. */
function hojeNoBrasil(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

type Linha = typeof propertySaleExclusivities.$inferSelect;

function toDto(linha: Linha, hoje: string): unknown {
  const status = exclusivityStatus(
    {
      startsOn: linha.startsOn,
      endsOn: linha.endsOn,
      canceledAt: linha.canceledAt?.toISOString() ?? null,
    },
    hoje,
  );
  return {
    id: linha.id,
    propertyId: linha.propertyId,
    startsOn: linha.startsOn,
    endsOn: linha.endsOn,
    documentMediaId: linha.documentMediaId,
    canceledAt: linha.canceledAt?.toISOString() ?? null,
    canceledReason: linha.canceledReason,
    state: status.state,
    daysLeft: status.daysLeft,
    totalDays: status.totalDays,
    createdAt: linha.createdAt.toISOString(),
  };
}

export const saleExclusivityRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  async function assertImovelDaOrg(propertyId: string, orgId: string): Promise<void> {
    const [imovel] = await db
      .select({ id: properties.id })
      .from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.orgId, orgId)))
      .limit(1);
    if (!imovel) {
      throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
    }
  }

  app.get(
    '/properties/:id/sale-exclusivities',
    { onRequest: [requirePermission('property:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      await assertImovelDaOrg(id, auth.orgId);

      const hoje = hojeNoBrasil();
      const linhas = await db
        .select()
        .from(propertySaleExclusivities)
        .where(
          and(
            eq(propertySaleExclusivities.propertyId, id),
            eq(propertySaleExclusivities.orgId, auth.orgId),
          ),
        )
        .orderBy(desc(propertySaleExclusivities.startsOn));

      const dtos = linhas.map((linha) => toDto(linha, hoje));
      const vigente =
        linhas
          .map((linha) => ({
            linha,
            status: exclusivityStatus(
              { ...linha, canceledAt: linha.canceledAt?.toISOString() ?? null },
              hoje,
            ),
          }))
          .find((item) => isExclusivityInForce(item.status))?.linha ?? null;

      return listSaleExclusivitiesResponseSchema.parse({
        exclusivities: dtos,
        current: vigente === null ? null : toDto(vigente, hoje),
      });
    },
  );

  app.post(
    '/properties/:id/sale-exclusivities',
    { onRequest: [requirePermission('property:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = createSaleExclusivityRequestSchema.parse(request.body);
      await assertImovelDaOrg(id, auth.orgId);
      assertValidExclusivityPeriod(input);

      if (input.documentMediaId !== undefined) {
        const [midia] = await db
          .select({ id: propertyMedia.id })
          .from(propertyMedia)
          .where(
            and(
              eq(propertyMedia.id, input.documentMediaId),
              eq(propertyMedia.propertyId, id),
              eq(propertyMedia.orgId, auth.orgId),
            ),
          )
          .limit(1);
        if (!midia) {
          throw new DomainError('NOT_FOUND', 'Documento não encontrado neste imóvel');
        }
      }

      const criada = await db.transaction(async (tx) => {
        // Trava a linha do imóvel: dois registros simultâneos não podem abrir
        // duas autorizações sobrepostas (mesma técnica do limite de plano).
        await tx
          .select({ id: properties.id })
          .from(properties)
          .where(and(eq(properties.id, id), eq(properties.orgId, auth.orgId)))
          .for('update');

        const existentes = await tx
          .select()
          .from(propertySaleExclusivities)
          .where(
            and(
              eq(propertySaleExclusivities.propertyId, id),
              eq(propertySaleExclusivities.orgId, auth.orgId),
            ),
          );
        const conflito = existentes.find(
          (linha) => linha.canceledAt === null && periodsOverlap(linha, input),
        );
        if (conflito) {
          throw new DomainError(
            'CONFLICT',
            `Já existe exclusividade de ${conflito.startsOn} a ${conflito.endsOn} neste imóvel`,
          );
        }

        const [linha] = await tx
          .insert(propertySaleExclusivities)
          .values({
            orgId: auth.orgId,
            propertyId: id,
            startsOn: input.startsOn,
            endsOn: input.endsOn,
            documentMediaId: input.documentMediaId ?? null,
          })
          .returning();
        if (!linha) {
          throw new Error('exclusividade não gravada');
        }
        return linha;
      });

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.SALE_EXCLUSIVITY_CREATED,
        entityType: 'PROPERTY',
        entityId: id,
        payload: { startsOn: criada.startsOn, endsOn: criada.endsOn },
      });

      return reply
        .code(201)
        .send(saleExclusivityResponseSchema.parse({ exclusivity: toDto(criada, hojeNoBrasil()) }));
    },
  );

  app.post(
    '/properties/:id/sale-exclusivities/:exclusivityId/cancel',
    { onRequest: [requirePermission('property:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id, exclusivityId } = z
        .object({ id: uuidSchema, exclusivityId: uuidSchema })
        .parse(request.params);
      const input = cancelSaleExclusivityRequestSchema.parse(request.body);
      await assertImovelDaOrg(id, auth.orgId);

      const [linha] = await db
        .update(propertySaleExclusivities)
        .set({ canceledAt: new Date(), canceledReason: input.reason, updatedAt: new Date() })
        .where(
          and(
            eq(propertySaleExclusivities.id, exclusivityId),
            eq(propertySaleExclusivities.propertyId, id),
            eq(propertySaleExclusivities.orgId, auth.orgId),
          ),
        )
        .returning();
      if (!linha) {
        throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
      }

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.SALE_EXCLUSIVITY_CANCELED,
        entityType: 'PROPERTY',
        entityId: id,
        payload: { reason: input.reason },
      });

      return saleExclusivityResponseSchema.parse({
        exclusivity: toDto(linha, hojeNoBrasil()),
      });
    },
  );

  return Promise.resolve();
};
