import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DomainError } from '@aluguei/domain';
import { requirePermission } from '../plugins/authz.js';

/**
 * Autocomplete + detalhes do Google Places para o cadastro de imÃ³vel.
 * Nunca bloqueia o cadastro manual: se `app.places` for null (produÃ§Ã£o sem
 * chave), retorna 503 com cÃ³digo claro para a UI cair no modo manual.
 */
export const placesRoutes: FastifyPluginAsync = (app) => {
  app.post(
    '/places/autocomplete',
    { onRequest: [requirePermission('property:write')] },
    async (request, reply) => {
      const input = z.object({ input: z.string().min(3).max(200) }).parse(request.body);
      if (!app.places) {
        throw new DomainError('PROVIDER_ERROR', 'Places nÃ£o configurado');
      }
      const predictions = await app.places.autocomplete(input);
      return reply.status(200).send({ predictions });
    },
  );

  app.get(
    '/places/details',
    { onRequest: [requirePermission('property:read')] },
    async (request) => {
      const { placeId } = z.object({ placeId: z.string().min(1).max(300) }).parse(request.query);
      if (!app.places) {
        throw new DomainError('PROVIDER_ERROR', 'Places nÃ£o configurado');
      }
      const address = await app.places.placeDetails(placeId);
      if (!address) {
        throw new DomainError('NOT_FOUND', 'Endereço não encontrado');
      }
      return { address };
    },
  );

  return Promise.resolve();
};
