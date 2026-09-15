import { describe, expect, it } from 'vitest';
import { S3StorageAdapter } from './s3.adapter.js';

/**
 * MinIO atrás de um domínio próprio só atende endereçamento path-style
 * (https://endpoint/bucket/chave): o proxy não tem rota nem certificado para
 * bucket.endpoint. Sem a opção, o SDK assina a URL em virtual-hosted e o
 * upload direto do navegador falha.
 */
const base = {
  bucket: 'aluguei-private',
  endpoint: 'https://s3.exemplo.test',
  region: 'us-east-1',
  credentials: { accessKeyId: 'teste', secretAccessKey: 'teste' },
};

describe('S3StorageAdapter com endpoint próprio', () => {
  it('forcePathStyle: upload pré-assinado aponta para o endpoint, com o bucket no caminho', async () => {
    const adapter = new S3StorageAdapter({ ...base, forcePathStyle: true });
    const { url } = await adapter.getPresignedPutUrl({
      key: 'orgs/o1/imoveis/foto.jpg',
      contentType: 'image/jpeg',
    });
    const parsed = new URL(url);
    expect(parsed.host).toBe('s3.exemplo.test');
    expect(parsed.pathname).toBe('/aluguei-private/orgs/o1/imoveis/foto.jpg');
  });

  it('forcePathStyle também vale para o download pré-assinado', async () => {
    const adapter = new S3StorageAdapter({ ...base, forcePathStyle: true });
    const { url } = await adapter.getPresignedDownloadUrl({ key: 'orgs/o1/imoveis/foto.jpg' });
    const parsed = new URL(url);
    expect(parsed.host).toBe('s3.exemplo.test');
    expect(parsed.pathname).toBe('/aluguei-private/orgs/o1/imoveis/foto.jpg');
  });

  it('sem a opção, o SDK põe o bucket no host — é por isso que a opção existe', async () => {
    const adapter = new S3StorageAdapter(base);
    const { url } = await adapter.getPresignedPutUrl({ key: 'a.jpg', contentType: 'image/jpeg' });
    expect(new URL(url).host).toBe('aluguei-private.s3.exemplo.test');
  });
});
