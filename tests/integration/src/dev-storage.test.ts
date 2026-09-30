import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DiskStorageAdapter } from '@aluguei/storage';
import { buildTestApp, registerUser } from './helpers.js';
import type { RegisteredUser } from './helpers.js';

/**
 * Storage em disco da stack de testes (F3, ADR-105): as URLs "pré-assinadas" apontam para a
 * própria API, que faz o papel do bucket. O fluxo das telas (pedir a URL, enviar o arquivo,
 * confirmar) passa inteiro, e a URL só vale para o que foi assinado.
 */

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

/** Caminho e query de uma URL absoluta, para o `inject`. */
function caminho(url: string): string {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
}

describe('F3: storage em disco da stack de testes', () => {
  let pasta: string;
  let storage: DiskStorageAdapter;
  let app: FastifyInstance;
  let dono: RegisteredUser;

  beforeAll(async () => {
    pasta = await mkdtemp(join(tmpdir(), 'aluguei-dev-storage-'));
    storage = new DiskStorageAdapter({ root: pasta, publicUrl: 'http://127.0.0.1:4000' });
    app = await buildTestApp({
      storage,
      env: { STORAGE_DRIVER: 'disk', ALLOW_FAKE_PROVIDERS: 'true' },
    });
    dono = await registerUser(app);
  });

  afterAll(async () => {
    await app.close();
    await rm(pasta, { recursive: true, force: true });
  });

  it('pedir a URL, enviar a foto, confirmar e baixar, como as telas fazem', async () => {
    const imovel = await app.inject({
      method: 'POST',
      url: '/properties',
      headers: { cookie: dono.cookie },
      payload: { title: 'Apto com foto', propertyType: 'APARTMENT' },
    });
    expect(imovel.statusCode, imovel.body).toBe(201);
    const propertyId = (imovel.json() as { property: { id: string } }).property.id;

    const pedido = await app.inject({
      method: 'POST',
      url: `/properties/${propertyId}/media/upload-url`,
      headers: { cookie: dono.cookie },
      payload: { kind: 'PHOTO', mimeType: 'image/jpeg', sizeBytes: JPEG.byteLength },
    });
    expect(pedido.statusCode, pedido.body).toBe(200);
    const { url, key } = pedido.json() as { url: string; key: string };
    expect(url.startsWith('http://127.0.0.1:4000/dev/storage/object?')).toBe(true);

    // O upload não usa sessão: vale a assinatura, como no S3.
    const envio = await app.inject({
      method: 'PUT',
      url: caminho(url),
      headers: { 'content-type': 'image/jpeg' },
      payload: JPEG,
    });
    expect(envio.statusCode, envio.body).toBe(200);

    const confirmacao = await app.inject({
      method: 'POST',
      url: `/properties/${propertyId}/media/confirm`,
      headers: { cookie: dono.cookie },
      payload: { key },
    });
    expect(confirmacao.statusCode, confirmacao.body).toBe(201);

    const { url: download } = await storage.getPresignedDownloadUrl({ key });
    const baixado = await app.inject({ method: 'GET', url: caminho(download) });
    expect(baixado.statusCode).toBe(200);
    expect(baixado.headers['content-type']).toBe('image/jpeg');
    expect(baixado.rawPayload.equals(JPEG)).toBe(true);
  });

  it('a URL só vale para o tipo, a chave e o prazo assinados', async () => {
    const { url } = await storage.getPresignedPutUrl({
      key: 'orgs/x/docs/renda.pdf',
      contentType: 'application/pdf',
    });
    const outroTipo = await app.inject({
      method: 'PUT',
      url: caminho(url),
      headers: { 'content-type': 'text/html' },
      payload: '<script>',
    });
    expect(outroTipo.statusCode).toBe(403);

    const adulterada = await app.inject({
      method: 'PUT',
      url: caminho(url).replace('renda.pdf', 'outro.pdf'),
      headers: { 'content-type': 'application/pdf' },
      payload: Buffer.from('%PDF-1.4'),
    });
    expect(adulterada.statusCode).toBe(403);

    const { url: vencida } = await storage.getPresignedPutUrl({
      key: 'orgs/x/docs/renda.pdf',
      contentType: 'application/pdf',
      expiresInSeconds: -1,
    });
    const tarde = await app.inject({
      method: 'PUT',
      url: caminho(vencida),
      headers: { 'content-type': 'application/pdf' },
      payload: Buffer.from('%PDF-1.4'),
    });
    expect(tarde.statusCode).toBe(403);

    // Baixar com a URL de upload também não vale: o método entra na assinatura.
    const comUrlDeEnvio = await app.inject({ method: 'GET', url: caminho(url) });
    expect(comUrlDeEnvio.statusCode).toBe(403);
    expect(await storage.headObject('orgs/x/docs/renda.pdf')).toBeNull();
  });

  it('o navegador pode mandar o PUT: a pré-checagem de CORS libera o método', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/dev/storage/object?key=a',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(String(res.headers['access-control-allow-methods'])).toContain('PUT');
  });

  it('com o storage de sempre, a rota nem existe e o CORS não libera o PUT', async () => {
    const padrao = await buildTestApp({ env: {} });
    const res = await padrao.inject({ method: 'GET', url: '/dev/storage/object?key=a' });
    expect(res.statusCode).toBe(404);
    const preflight = await padrao.inject({
      method: 'OPTIONS',
      url: '/properties',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'PUT',
      },
    });
    expect(String(preflight.headers['access-control-allow-methods'])).not.toContain('PUT');
    await padrao.close();
  });
});
