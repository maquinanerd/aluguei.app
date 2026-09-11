import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DomainError } from '@aluguei/domain';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { findPaymentByProviderId } from '../finance/settlement.js';

/**
 * Simulação do pagador em ambiente com provider FAKE (dev e E2E): confirma a
 * cobrança NO PROVIDER, como o cliente pagando o QR/boleto. Não credita nada —
 * quem credita é o worker, depois da notificação do provider (auditoria
 * 2026-09-10, P0-02: o webhook não confirma nada por si). Registrada apenas
 * fora de produção (app.ts) e só responde com o provider FAKE.
 */
export const devPaymentRoutes: FastifyPluginAsync = (app) => {
  app.post(
    '/dev/fake-payments/:providerChargeId/confirm',
    { onRequest: [requirePermission('finance:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { providerChargeId } = z
        .object({ providerChargeId: z.string().min(1).max(200) })
        .parse(request.params);
      const provider = app.payments;
      if (!provider || provider.name !== 'FAKE' || !provider.confirmCharge) {
        throw new DomainError('NOT_FOUND', 'Rota disponível apenas com o provider FAKE');
      }
      const payment = await findPaymentByProviderId(app.db, 'FAKE', providerChargeId, auth.orgId);
      if (!payment) {
        throw new DomainError('NOT_FOUND', 'Cobrança não encontrada');
      }
      await provider.confirmCharge(providerChargeId);
      return { providerChargeId, status: 'CONFIRMED' as const };
    },
  );
  return Promise.resolve();
};
