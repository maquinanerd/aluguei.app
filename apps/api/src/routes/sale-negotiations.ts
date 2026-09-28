import { and, asc, count, desc, eq, gte, lt, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  parties,
  properties,
  saleCommissionShares,
  saleNegotiationDocuments,
  saleNegotiationEvents,
  saleNegotiations,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  assertNegotiationTransition,
  assertSharesTotal100,
  commissionCents,
  documentProgress,
  isSaleNegotiationStage,
  splitCommission,
} from '@aluguei/domain';
import type { SaleCommissionRole, SaleNegotiationStage } from '@aluguei/domain';
import {
  addSaleNegotiationEventRequestSchema,
  answerSaleNegotiationEventRequestSchema,
  createSaleNegotiationRequestSchema,
  listSaleNegotiationsQuerySchema,
  listSaleNegotiationsResponseSchema,
  moveSaleNegotiationRequestSchema,
  saleNegotiationResponseSchema,
  salesSummaryQuerySchema,
  salesSummaryResponseSchema,
  setSaleCommissionRequestSchema,
  upsertSaleDocumentRequestSchema,
  uuidSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';

/**
 * Negociação de venda (Onda 5).
 *
 * O histórico é a negociação: proposta, contraproposta e resposta viram
 * eventos, e o valor corrente sai do último deles. Nenhuma rota aqui sobrescreve
 * um valor anterior — voltar atrás é registrar um evento novo, não apagar.
 */

type Linha = typeof saleNegotiations.$inferSelect;

/** Valor em jogo hoje: o fechado, ou o último proposto. */
function valorEmJogo(linha: Linha): number | null {
  return linha.closedAmountCents ?? linha.currentAmountCents;
}

function toResumo(linha: Linha, documentos: { provided: boolean }[]): Record<string, unknown> {
  const valor = valorEmJogo(linha);
  return {
    id: linha.id,
    propertyId: linha.propertyId,
    buyerPartyId: linha.buyerPartyId,
    stage: linha.stage,
    askingPriceCents: linha.askingPriceCents,
    currentAmountCents: linha.currentAmountCents,
    commissionBps: linha.commissionBps,
    commissionCents: valor === null ? null : commissionCents(valor, linha.commissionBps),
    ownerUserId: linha.ownerUserId,
    closedAt: linha.closedAt?.toISOString() ?? null,
    closedAmountCents: linha.closedAmountCents,
    lostReason: linha.lostReason,
    documents: documentProgress(documentos),
    createdAt: linha.createdAt.toISOString(),
    updatedAt: linha.updatedAt.toISOString(),
  };
}

async function carregarDetalhe(
  db: AppDb,
  orgId: string,
  negotiationId: string,
): Promise<Record<string, unknown>> {
  const [linha] = await db
    .select()
    .from(saleNegotiations)
    .where(and(eq(saleNegotiations.id, negotiationId), eq(saleNegotiations.orgId, orgId)))
    .limit(1);
  if (!linha) {
    throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
  }

  const eventos = await db
    .select()
    .from(saleNegotiationEvents)
    .where(eq(saleNegotiationEvents.negotiationId, linha.id))
    .orderBy(asc(saleNegotiationEvents.createdAt));
  const documentos = await db
    .select()
    .from(saleNegotiationDocuments)
    .where(eq(saleNegotiationDocuments.negotiationId, linha.id))
    .orderBy(asc(saleNegotiationDocuments.label));
  const participacoes = await db
    .select()
    .from(saleCommissionShares)
    .where(eq(saleCommissionShares.negotiationId, linha.id));

  const valor = valorEmJogo(linha);
  const comissao = valor === null ? 0 : commissionCents(valor, linha.commissionBps);
  const partes = splitCommission(
    comissao,
    participacoes.map((participacao) => ({
      role: participacao.role as SaleCommissionRole,
      percentBps: participacao.percentBps,
    })),
  );

  return {
    ...toResumo(linha, documentos),
    events: eventos.map((evento) => ({
      id: evento.id,
      kind: evento.kind,
      amountCents: evento.amountCents,
      validUntil: evento.validUntil,
      outcome: evento.outcome,
      note: evento.note,
      createdAt: evento.createdAt.toISOString(),
    })),
    documentList: documentos.map((documento) => ({
      id: documento.id,
      side: documento.side,
      label: documento.label,
      provided: documento.provided,
      providedAt: documento.providedAt?.toISOString() ?? null,
    })),
    commissionShares: participacoes.map((participacao, indice) => ({
      role: participacao.role,
      userId: participacao.userId,
      percentBps: participacao.percentBps,
      amountCents: partes[indice]?.amountCents ?? 0,
    })),
  };
}

export const saleNegotiationRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post(
    '/sale-negotiations',
    { onRequest: [requirePermission('proposal:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createSaleNegotiationRequestSchema.parse(request.body);

      // P0-05: imóvel e comprador são conferidos na org antes de qualquer escrita.
      const [imovel] = await db
        .select({ id: properties.id })
        .from(properties)
        .where(and(eq(properties.id, input.propertyId), eq(properties.orgId, auth.orgId)))
        .limit(1);
      if (!imovel) {
        throw new DomainError('NOT_FOUND', 'Imóvel não encontrado');
      }
      const [comprador] = await db
        .select({ id: parties.id })
        .from(parties)
        .where(and(eq(parties.id, input.buyerPartyId), eq(parties.orgId, auth.orgId)))
        .limit(1);
      if (!comprador) {
        throw new DomainError('NOT_FOUND', 'Comprador não encontrado');
      }

      const criada = await db.transaction(async (tx) => {
        const [linha] = await tx
          .insert(saleNegotiations)
          .values({
            orgId: auth.orgId,
            propertyId: input.propertyId,
            buyerPartyId: input.buyerPartyId,
            askingPriceCents: input.askingPriceCents ?? null,
            currentAmountCents: input.offerAmountCents ?? null,
            commissionBps: input.commissionBps ?? 0,
            ownerUserId: auth.userId,
          })
          .returning();
        if (!linha) {
          throw new Error('negociação não gravada');
        }

        // O pedido do proprietário e a primeira proposta já nascem como
        // histórico: a conversa começa aqui, não no primeiro evento manual.
        if (input.askingPriceCents !== undefined) {
          await tx.insert(saleNegotiationEvents).values({
            orgId: auth.orgId,
            negotiationId: linha.id,
            kind: 'ASKING',
            amountCents: input.askingPriceCents,
            outcome: 'PENDING',
            createdByUserId: auth.userId,
          });
        }
        if (input.offerAmountCents !== undefined) {
          await tx.insert(saleNegotiationEvents).values({
            orgId: auth.orgId,
            negotiationId: linha.id,
            kind: 'BUYER_OFFER',
            amountCents: input.offerAmountCents,
            validUntil: input.validUntil ?? null,
            outcome: 'PENDING',
            createdByUserId: auth.userId,
          });
        }
        return linha;
      });

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.SALE_NEGOTIATION_CREATED,
        entityType: 'SALE_NEGOTIATION',
        entityId: criada.id,
      });

      return reply.code(201).send(
        saleNegotiationResponseSchema.parse({
          negotiation: await carregarDetalhe(db, auth.orgId, criada.id),
        }),
      );
    },
  );

  app.get(
    '/sale-negotiations',
    { onRequest: [requirePermission('proposal:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const query = listSaleNegotiationsQuerySchema.parse(request.query);

      const where = and(
        eq(saleNegotiations.orgId, auth.orgId),
        query.stage ? eq(saleNegotiations.stage, query.stage) : undefined,
      );
      const linhas = await db
        .select()
        .from(saleNegotiations)
        .where(where)
        .orderBy(desc(saleNegotiations.updatedAt))
        .limit(query.limit)
        .offset(query.offset);

      const documentos =
        linhas.length === 0
          ? []
          : await db
              .select()
              .from(saleNegotiationDocuments)
              .where(
                inArray(
                  saleNegotiationDocuments.negotiationId,
                  linhas.map((linha) => linha.id),
                ),
              );
      const porNegociacao = new Map<string, { provided: boolean }[]>();
      for (const documento of documentos) {
        const lista = porNegociacao.get(documento.negotiationId) ?? [];
        lista.push({ provided: documento.provided });
        porNegociacao.set(documento.negotiationId, lista);
      }

      // Contagem por etapa: são as colunas do quadro, e o quadro mostra todas
      // mesmo quando a página atual não trouxe nenhuma daquela etapa.
      const contagens = await db
        .select({ stage: saleNegotiations.stage, n: count() })
        .from(saleNegotiations)
        .where(eq(saleNegotiations.orgId, auth.orgId))
        .groupBy(saleNegotiations.stage);
      const byStage: Record<string, number> = {};
      for (const linha of contagens) {
        byStage[linha.stage] = linha.n;
      }

      const [total] = await db.select({ n: count() }).from(saleNegotiations).where(where);

      return listSaleNegotiationsResponseSchema.parse({
        negotiations: linhas.map((linha) => toResumo(linha, porNegociacao.get(linha.id) ?? [])),
        total: total?.n ?? 0,
        byStage,
      });
    },
  );

  app.get(
    '/sale-negotiations/:id',
    { onRequest: [requirePermission('proposal:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      return saleNegotiationResponseSchema.parse({
        negotiation: await carregarDetalhe(db, auth.orgId, id),
      });
    },
  );

  app.post(
    '/sale-negotiations/:id/events',
    { onRequest: [requirePermission('proposal:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = addSaleNegotiationEventRequestSchema.parse(request.body);

      await db.transaction(async (tx) => {
        const [linha] = await tx
          .select()
          .from(saleNegotiations)
          .where(and(eq(saleNegotiations.id, id), eq(saleNegotiations.orgId, auth.orgId)))
          .for('update');
        if (!linha) {
          throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
        }
        if (linha.stage === 'CLOSED' || linha.stage === 'LOST') {
          throw new DomainError('CONFLICT', 'Negociação encerrada não recebe proposta');
        }

        await tx.insert(saleNegotiationEvents).values({
          orgId: auth.orgId,
          negotiationId: id,
          kind: input.kind,
          amountCents: input.amountCents,
          validUntil: input.validUntil ?? null,
          outcome: 'PENDING',
          note: input.note ?? null,
          createdByUserId: auth.userId,
        });

        // Proposta nova move a negociação para o lado de quem tem de responder.
        const proximaEtapa: SaleNegotiationStage =
          input.kind === 'SELLER_COUNTER' ? 'COUNTER' : 'PROPOSAL';
        await tx
          .update(saleNegotiations)
          .set({
            currentAmountCents: input.amountCents,
            stage:
              linha.stage === 'DOCUMENTATION' || linha.stage === 'CONTRACT'
                ? linha.stage
                : proximaEtapa,
            updatedAt: new Date(),
          })
          .where(eq(saleNegotiations.id, id));
      });

      return reply.code(201).send(
        saleNegotiationResponseSchema.parse({
          negotiation: await carregarDetalhe(db, auth.orgId, id),
        }),
      );
    },
  );

  app.post(
    '/sale-negotiations/:id/events/:eventId/answer',
    { onRequest: [requirePermission('proposal:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id, eventId } = z
        .object({ id: uuidSchema, eventId: uuidSchema })
        .parse(request.params);
      const input = answerSaleNegotiationEventRequestSchema.parse(request.body);

      const [atualizado] = await db
        .update(saleNegotiationEvents)
        .set({ outcome: input.outcome, note: input.note ?? null })
        .where(
          and(
            eq(saleNegotiationEvents.id, eventId),
            eq(saleNegotiationEvents.negotiationId, id),
            eq(saleNegotiationEvents.orgId, auth.orgId),
            // Responder duas vezes é engano: só evento pendente aceita resposta.
            eq(saleNegotiationEvents.outcome, 'PENDING'),
          ),
        )
        .returning();
      if (!atualizado) {
        throw new DomainError('NOT_FOUND', 'Proposta não encontrada ou já respondida');
      }

      return saleNegotiationResponseSchema.parse({
        negotiation: await carregarDetalhe(db, auth.orgId, id),
      });
    },
  );

  app.post(
    '/sale-negotiations/:id/stage',
    { onRequest: [requirePermission('proposal:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = moveSaleNegotiationRequestSchema.parse(request.body);

      await db.transaction(async (tx) => {
        const [linha] = await tx
          .select()
          .from(saleNegotiations)
          .where(and(eq(saleNegotiations.id, id), eq(saleNegotiations.orgId, auth.orgId)))
          .for('update');
        if (!linha) {
          throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
        }
        if (!isSaleNegotiationStage(linha.stage)) {
          throw new Error(`etapa inválida no banco: ${linha.stage}`);
        }
        assertNegotiationTransition(linha.stage, input.stage);

        const patch: Record<string, unknown> = { stage: input.stage, updatedAt: new Date() };
        if (input.stage === 'LOST') {
          if (input.reason === undefined || input.reason === '') {
            throw new DomainError('INVALID_INPUT', 'Informe por que a negociação foi perdida');
          }
          patch.lostReason = input.reason;
        }
        if (input.stage === 'CLOSED') {
          const valor = input.closedAmountCents ?? linha.currentAmountCents;
          if (valor === null) {
            throw new DomainError('INVALID_INPUT', 'Informe o valor que fechou a venda');
          }
          patch.closedAmountCents = valor;
          patch.closedAt = new Date();
        }

        await tx.update(saleNegotiations).set(patch).where(eq(saleNegotiations.id, id));
      });

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action:
          input.stage === 'CLOSED'
            ? AUDIT_ACTIONS.SALE_NEGOTIATION_CLOSED
            : AUDIT_ACTIONS.SALE_NEGOTIATION_MOVED,
        entityType: 'SALE_NEGOTIATION',
        entityId: id,
        payload: { stage: input.stage },
      });

      return saleNegotiationResponseSchema.parse({
        negotiation: await carregarDetalhe(db, auth.orgId, id),
      });
    },
  );

  app.put(
    '/sale-negotiations/:id/documents',
    { onRequest: [requirePermission('proposal:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = upsertSaleDocumentRequestSchema.parse(request.body);

      const [linha] = await db
        .select({ id: saleNegotiations.id })
        .from(saleNegotiations)
        .where(and(eq(saleNegotiations.id, id), eq(saleNegotiations.orgId, auth.orgId)))
        .limit(1);
      if (!linha) {
        throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
      }

      await db
        .insert(saleNegotiationDocuments)
        .values({
          orgId: auth.orgId,
          negotiationId: id,
          side: input.side,
          label: input.label,
          provided: input.provided,
          providedAt: input.provided ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: [
            saleNegotiationDocuments.negotiationId,
            saleNegotiationDocuments.side,
            saleNegotiationDocuments.label,
          ],
          set: { provided: input.provided, providedAt: input.provided ? new Date() : null },
        });

      return saleNegotiationResponseSchema.parse({
        negotiation: await carregarDetalhe(db, auth.orgId, id),
      });
    },
  );

  app.put(
    '/sale-negotiations/:id/commission',
    { onRequest: [requirePermission('proposal:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = setSaleCommissionRequestSchema.parse(request.body);
      assertSharesTotal100(input.shares);

      await db.transaction(async (tx) => {
        const [linha] = await tx
          .select({ id: saleNegotiations.id })
          .from(saleNegotiations)
          .where(and(eq(saleNegotiations.id, id), eq(saleNegotiations.orgId, auth.orgId)))
          .for('update');
        if (!linha) {
          throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
        }
        await tx
          .update(saleNegotiations)
          .set({ commissionBps: input.commissionBps, updatedAt: new Date() })
          .where(eq(saleNegotiations.id, id));
        await tx.delete(saleCommissionShares).where(eq(saleCommissionShares.negotiationId, id));
        if (input.shares.length > 0) {
          await tx.insert(saleCommissionShares).values(
            input.shares.map((share) => ({
              orgId: auth.orgId,
              negotiationId: id,
              role: share.role,
              userId: share.userId ?? null,
              percentBps: share.percentBps,
            })),
          );
        }
      });

      return saleNegotiationResponseSchema.parse({
        negotiation: await carregarDetalhe(db, auth.orgId, id),
      });
    },
  );

  /**
   * Painel de vendas do mês. Fechadas contam pelo valor que fechou; abertas,
   * pelo que está em jogo — misturar os dois daria um número que não existe.
   */
  app.get(
    '/sale-negotiations/summary',
    { onRequest: [requirePermission('report:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const query = salesSummaryQuerySchema.parse(request.query);
      const mes =
        query.month ??
        new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
      const inicio = new Date(`${mes}-01T00:00:00.000Z`);
      const fim = new Date(inicio);
      fim.setUTCMonth(fim.getUTCMonth() + 1);

      const fechadas = await db
        .select()
        .from(saleNegotiations)
        .where(
          and(
            eq(saleNegotiations.orgId, auth.orgId),
            eq(saleNegotiations.stage, 'CLOSED'),
            gte(saleNegotiations.closedAt, inicio),
            lt(saleNegotiations.closedAt, fim),
          ),
        );
      const abertas = await db
        .select()
        .from(saleNegotiations)
        .where(
          and(
            eq(saleNegotiations.orgId, auth.orgId),
            inArray(saleNegotiations.stage, ['PROPOSAL', 'COUNTER', 'DOCUMENTATION', 'CONTRACT']),
          ),
        );
      const [perdidas] = await db
        .select({ n: count() })
        .from(saleNegotiations)
        .where(and(eq(saleNegotiations.orgId, auth.orgId), eq(saleNegotiations.stage, 'LOST')));

      const volumeFechado = fechadas.reduce(
        (acc, linha) => acc + (linha.closedAmountCents ?? 0),
        0,
      );
      const comissaoFechada = fechadas.reduce(
        (acc, linha) => acc + commissionCents(linha.closedAmountCents ?? 0, linha.commissionBps),
        0,
      );

      return salesSummaryResponseSchema.parse({
        month: mes,
        closed: {
          count: fechadas.length,
          volumeCents: volumeFechado,
          commissionCents: comissaoFechada,
        },
        open: {
          count: abertas.length,
          volumeCents: abertas.reduce((acc, linha) => acc + (linha.currentAmountCents ?? 0), 0),
        },
        lost: { count: perdidas?.n ?? 0 },
      });
    },
  );

  return Promise.resolve();
};
