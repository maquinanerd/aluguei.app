import type { StorageService } from '@aluguei/storage';

/** Fake de storage para testes de integração: presign registra o objeto em memória. */
export class FakeStorageService implements StorageService {
  private readonly objects = new Map<string, { size: number; contentType: string }>();

  putObject(input: {
    key: string;
    body: Buffer | Uint8Array;
    contentType?: string;
  }): Promise<{ key: string; size: number }> {
    this.objects.set(input.key, {
      size: input.body.byteLength,
      contentType: input.contentType ?? '',
    });
    return Promise.resolve({ key: input.key, size: input.body.byteLength });
  }

  getObject(key: string): Promise<Buffer | null> {
    const object = this.objects.get(key);
    return Promise.resolve(object ? Buffer.alloc(object.size) : null);
  }

  deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }

  headObject(key: string): Promise<{ key: string; size: number } | null> {
    const object = this.objects.get(key);
    return Promise.resolve(object ? { key, size: object.size } : null);
  }

  getPresignedPutUrl(input: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<{ url: string; expiresIn: number }> {
    this.objects.set(input.key, { size: 0, contentType: input.contentType });
    return Promise.resolve({
      url: `https://fake-storage.example/${input.key}`,
      expiresIn: input.expiresInSeconds ?? 300,
    });
  }

  /** Simula a conclusão do upload direto (size passa a existir para o headObject). */
  markUploaded(key: string, size: number): void {
    const object = this.objects.get(key);
    if (object) {
      object.size = size;
    }
  }

  has(key: string): boolean {
    return this.objects.has(key);
  }
}
