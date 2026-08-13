import fp from 'fastify-plugin';
import { S3StorageAdapter } from '@aluguei/storage';
import type { StorageService } from '@aluguei/storage';

declare module 'fastify' {
  interface FastifyInstance {
    storage: StorageService | null;
  }
}

export interface StoragePluginOptions {
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  storage?: StorageService;
}

/**
 * Registra `app.storage` (S3-compatible). Sem bucket/credenciais → `null`
 * (rotas de upload respondem 400 "Storage não configurado"). Em testes,
 * injete um fake via `storage`.
 */
export const storagePlugin = fp<StoragePluginOptions>((app, opts) => {
  if (opts.storage) {
    app.decorate('storage', opts.storage);
    return;
  }
  if (!opts.bucket) {
    app.decorate('storage', null);
    return;
  }
  const adapterOptions: ConstructorParameters<typeof S3StorageAdapter>[0] = { bucket: opts.bucket };
  if (opts.endpoint) {
    adapterOptions.endpoint = opts.endpoint;
  }
  if (opts.region) {
    adapterOptions.region = opts.region;
  }
  if (opts.accessKeyId && opts.secretAccessKey) {
    adapterOptions.credentials = {
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
    };
  }
  const adapter = new S3StorageAdapter(adapterOptions);
  app.decorate('storage', adapter);
});
