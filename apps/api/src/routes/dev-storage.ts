import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DomainError } from '@aluguei/domain';
import { DISK_STORAGE_PATH } from '@aluguei/storage';
import type { DiskStorageAdapter } from '@aluguei/storage';

/** Maior arquivo que as telas enviam (vídeo de vistoria incluso), com folga. */
const LIMITE_DO_UPLOAD = 200 * 1024 * 1024;

const urlAssinada = z
  .object({
    key: z.string().min(1).max(512),
    expires: z.coerce.number().int(),
    contentType: z.string().min(1).max(200).optional(),
    signature: z.string().min(1).max(200),
  })
  .strict();

/**
 * Upload e download das URLs assinadas do storage em disco (F3, ADR-105): o papel do bucket na
 * stack de testes. Só é registrada quando a API sobe com esse storage — fora de produção e com
 * ALLOW_FAKE_PROVIDERS=true. Como no S3, a URL vale para o método, a chave, o tipo (no upload) e
 * até vencer; não precisa de sessão.
 */
export const devStorageRoutes: FastifyPluginAsync<{ storage: DiskStorageAdapter }> = (
  app,
  opts,
) => {
  // O corpo do upload é o próprio arquivo, de qualquer tipo, como no PUT pré-assinado do S3.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(
    '*',
    { parseAs: 'buffer', bodyLimit: LIMITE_DO_UPLOAD },
    (_request, body, done) => {
      done(null, body);
    },
  );

  app.put(DISK_STORAGE_PATH, async (request, reply) => {
    const assinatura = urlAssinada.parse(request.query);
    const tipo = (request.headers['content-type'] ?? '').split(';')[0]?.trim();
    if (!opts.storage.verify('PUT', assinatura) || tipo !== assinatura.contentType) {
      throw new DomainError('FORBIDDEN', 'URL de upload inválida ou vencida');
    }
    const corpo = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    await opts.storage.putObject({
      key: assinatura.key,
      body: corpo,
      contentType: assinatura.contentType ?? 'application/octet-stream',
    });
    return reply.code(200).send();
  });

  app.get(DISK_STORAGE_PATH, async (request, reply) => {
    const assinatura = urlAssinada.parse(request.query);
    if (!opts.storage.verify('GET', assinatura)) {
      throw new DomainError('FORBIDDEN', 'URL de download inválida ou vencida');
    }
    const objeto = await opts.storage.readObject(assinatura.key);
    if (!objeto) {
      throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
    }
    return reply
      .header('content-type', objeto.contentType)
      .header('cache-control', 'private, max-age=300')
      .send(objeto.body);
  });

  return Promise.resolve();
};
