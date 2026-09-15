import { describe, expect, it } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';
import { ensureBucket } from './ensure-bucket.js';

type Step = 'ok' | 'not-found' | 'already-owned' | 'down';

/** Fake de S3Client: cada chamada consome o próximo passo do roteiro. */
class FakeBucketClient {
  readonly sent: string[] = [];
  private readonly script: Step[];

  constructor(script: Step[]) {
    this.script = [...script];
  }

  send(command: { constructor: { name: string } }): Promise<unknown> {
    this.sent.push(command.constructor.name);
    const step = this.script.shift() ?? 'ok';
    switch (step) {
      case 'ok':
        return Promise.resolve({});
      case 'not-found':
        return Promise.reject(
          Object.assign(new Error('NotFound'), {
            name: 'NotFound',
            $metadata: { httpStatusCode: 404 },
          }),
        );
      case 'already-owned':
        return Promise.reject(
          Object.assign(new Error('já existe'), { name: 'BucketAlreadyOwnedByYou' }),
        );
      case 'down':
        return Promise.reject(
          Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
        );
    }
  }
}

const asClient = (fake: FakeBucketClient): S3Client => fake as unknown as S3Client;
const fast = { attempts: 5, delayMs: 0 };

describe('ensureBucket', () => {
  it('bucket existente: só consulta, não cria', async () => {
    const fake = new FakeBucketClient(['ok']);
    await expect(ensureBucket(asClient(fake), 'aluguei-private', fast)).resolves.toBe('exists');
    expect(fake.sent).toEqual(['HeadBucketCommand']);
  });

  it('bucket ausente: cria', async () => {
    const fake = new FakeBucketClient(['not-found', 'ok']);
    await expect(ensureBucket(asClient(fake), 'aluguei-private', fast)).resolves.toBe('created');
    expect(fake.sent).toEqual(['HeadBucketCommand', 'CreateBucketCommand']);
  });

  it('criação concorrente (BucketAlreadyOwnedByYou) conta como bucket existente', async () => {
    const fake = new FakeBucketClient(['not-found', 'already-owned']);
    await expect(ensureBucket(asClient(fake), 'aluguei-private', fast)).resolves.toBe('exists');
  });

  it('storage ainda subindo: tenta de novo até responder', async () => {
    const fake = new FakeBucketClient(['down', 'down', 'ok']);
    await expect(ensureBucket(asClient(fake), 'aluguei-private', fast)).resolves.toBe('exists');
    expect(fake.sent).toEqual(['HeadBucketCommand', 'HeadBucketCommand', 'HeadBucketCommand']);
  });

  it('storage fora do ar até esgotar as tentativas: falha com o último erro', async () => {
    const fake = new FakeBucketClient(['down', 'down', 'down']);
    await expect(
      ensureBucket(asClient(fake), 'aluguei-private', { attempts: 3, delayMs: 0 }),
    ).rejects.toThrow(/ECONNREFUSED/);
    expect(fake.sent).toHaveLength(3);
  });
});
