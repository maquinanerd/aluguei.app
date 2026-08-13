import { describe, expect, it } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';
import { S3StorageAdapter } from './s3.adapter.js';

interface FakeCommandLike {
  constructor: { name: string };
  input: unknown;
}

/** Fake de S3Client: grava comandos e devolve respostas determinísticas (sem rede). */
class FakeS3Client {
  readonly sent: FakeCommandLike[] = [];

  send(command: FakeCommandLike): Promise<Record<string, unknown>> {
    this.sent.push(command);
    switch (command.constructor.name) {
      case 'PutObjectCommand':
        return Promise.resolve({});
      case 'GetObjectCommand':
        return Promise.resolve({
          Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([1, 2, 3])) },
        });
      case 'HeadObjectCommand':
        return Promise.resolve({ ContentLength: 3 });
      case 'DeleteObjectCommand':
        return Promise.resolve({});
      default:
        return Promise.reject(new Error(`Unexpected command: ${command.constructor.name}`));
    }
  }
}

function makeAdapter(): { adapter: S3StorageAdapter; fake: FakeS3Client } {
  const fake = new FakeS3Client();
  const adapter = new S3StorageAdapter({
    bucket: 'aluguei-test',
    client: fake as unknown as S3Client,
  });
  return { adapter, fake };
}

describe('S3StorageAdapter', () => {
  it('putObject envia comando e retorna tamanho', async () => {
    const { adapter, fake } = makeAdapter();
    const body = new Uint8Array([10, 20, 30]);
    const result = await adapter.putObject({ key: 'a/b.txt', body, contentType: 'text/plain' });
    expect(result).toEqual({ key: 'a/b.txt', size: 3 });
    expect(fake.sent[0]?.constructor.name).toBe('PutObjectCommand');
    expect(fake.sent[0]?.input).toMatchObject({ Bucket: 'aluguei-test', Key: 'a/b.txt' });
  });

  it('getObject retorna buffer', async () => {
    const { adapter } = makeAdapter();
    const buffer = await adapter.getObject('a/b.txt');
    expect(buffer).toEqual(Buffer.from([1, 2, 3]));
  });

  it('headObject retorna metadados', async () => {
    const { adapter } = makeAdapter();
    await expect(adapter.headObject('a/b.txt')).resolves.toEqual({ key: 'a/b.txt', size: 3 });
  });

  it('deleteObject completa sem erro', async () => {
    const { adapter, fake } = makeAdapter();
    await adapter.deleteObject('a/b.txt');
    expect(fake.sent[0]?.constructor.name).toBe('DeleteObjectCommand');
  });

  it('getPresignedPutUrl gera URL assinada sem rede (SigV4 local)', async () => {
    const client = new S3Client({
      region: 'auto',
      endpoint: 'http://localhost:9000',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    const adapter = new S3StorageAdapter({ bucket: 'aluguei-test', client });
    const result = await adapter.getPresignedPutUrl({
      key: 'orgs/1/properties/2/photo.jpg',
      contentType: 'image/jpeg',
    });
    expect(result.expiresIn).toBe(300);
    expect(result.url).toContain('X-Amz-Signature=');
    expect(result.url).toContain('aluguei-test');
  });
});
