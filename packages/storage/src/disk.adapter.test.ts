import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DISK_STORAGE_PATH, DiskStorageAdapter } from './disk.adapter.js';
import { StorageSizeLimitError } from './s3.adapter.js';

/** Storage em disco da stack de testes (F3, ADR-105): o contrato do S3 sobre uma pasta local. */

let pasta: string;
let storage: DiskStorageAdapter;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'aluguei-storage-'));
  storage = new DiskStorageAdapter({
    root: pasta,
    publicUrl: 'http://127.0.0.1:4000/',
    secret: 'segredo-de-teste',
    maxSizeBytes: 1_000,
  });
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

function parametros(url: string) {
  const u = new URL(url);
  return {
    caminho: u.pathname,
    key: u.searchParams.get('key') ?? '',
    expires: Number(u.searchParams.get('expires')),
    contentType: u.searchParams.get('contentType') ?? undefined,
    signature: u.searchParams.get('signature') ?? '',
  };
}

describe('DiskStorageAdapter', () => {
  it('grava, lê, mede e apaga como o S3, com o tipo do upload', async () => {
    const key = 'orgs/o1/properties/p1/foto.jpg';
    expect(await storage.headObject(key)).toBeNull();
    expect(await storage.getObject(key)).toBeNull();
    await storage.putObject({ key, body: Buffer.from('jpeg!'), contentType: 'image/jpeg' });
    expect(await storage.headObject(key)).toEqual({ key, size: 5 });
    expect((await storage.getObject(key))?.toString()).toBe('jpeg!');
    expect(await storage.readObject(key)).toEqual({
      body: Buffer.from('jpeg!'),
      contentType: 'image/jpeg',
    });
    await storage.deleteObject(key);
    expect(await storage.headObject(key)).toBeNull();
    expect(await readdir(join(pasta, 'orgs/o1/properties/p1'))).toEqual([]);
  });

  it('respeita o limite de bytes do upload pelo servidor', async () => {
    await expect(
      storage.putObject({ key: 'grande.bin', body: Buffer.alloc(1_001) }),
    ).rejects.toBeInstanceOf(StorageSizeLimitError);
  });

  it('não deixa a chave sair da pasta', async () => {
    for (const key of ['../fora.txt', 'a/../../fora.txt', '', 'x\0y', 'foto.jpg.content-type']) {
      await expect(storage.putObject({ key, body: Buffer.from('x') })).rejects.toThrow(/chave/);
    }
    await expect(
      storage.getPresignedPutUrl({ key: '../fora.txt', contentType: 'text/plain' }),
    ).rejects.toThrow(/chave/);
  });

  it('URL de upload assinada para o método, a chave, o tipo e a validade', async () => {
    const agora = Date.now();
    const { url, expiresIn } = await storage.getPresignedPutUrl({
      key: 'docs/renda.pdf',
      contentType: 'application/pdf',
      expiresInSeconds: 60,
    });
    expect(expiresIn).toBe(60);
    const p = parametros(url);
    expect(url.startsWith(`http://127.0.0.1:4000${DISK_STORAGE_PATH}?`)).toBe(true);
    expect(p.caminho).toBe(DISK_STORAGE_PATH);
    expect(storage.verify('PUT', p, agora)).toBe(true);
    // Outro método, outra chave, outro tipo, assinatura adulterada ou fora da validade: não vale.
    expect(storage.verify('GET', p, agora)).toBe(false);
    expect(storage.verify('PUT', { ...p, key: 'docs/outro.pdf' }, agora)).toBe(false);
    expect(storage.verify('PUT', { ...p, contentType: 'image/png' }, agora)).toBe(false);
    expect(storage.verify('PUT', { ...p, signature: `${p.signature}x` }, agora)).toBe(false);
    expect(storage.verify('PUT', p, agora + 61_000)).toBe(false);
  });

  it('URL de download assinada, e outra instância (outro segredo) não a aceita', async () => {
    const { url } = await storage.getPresignedDownloadUrl({ key: 'docs/renda.pdf' });
    const p = parametros(url);
    expect(p.contentType).toBeUndefined();
    expect(storage.verify('GET', p)).toBe(true);
    const outra = new DiskStorageAdapter({ root: pasta, publicUrl: 'http://x' });
    expect(outra.verify('GET', p)).toBe(false);
  });
});
