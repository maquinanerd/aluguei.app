import { CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';

export interface EnsureBucketOptions {
  /** Tentativas enquanto o storage ainda não responde (ex.: MinIO subindo). */
  attempts: number;
  /** Espera entre tentativas, em milissegundos. */
  delayMs: number;
}

export type EnsureBucketOutcome = 'exists' | 'created';

interface AwsLikeError {
  name?: string;
  $metadata?: { httpStatusCode?: number };
}

function isNotFound(err: unknown): boolean {
  const error = err as AwsLikeError;
  return (
    error.name === 'NotFound' ||
    error.name === 'NoSuchBucket' ||
    error.$metadata?.httpStatusCode === 404
  );
}

function isAlreadyOwned(err: unknown): boolean {
  return (err as AwsLikeError).name === 'BucketAlreadyOwnedByYou';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Garante que o bucket existe. Idempotente: bucket existente não é recriado, e
 * uma criação concorrente conta como bucket existente. Qualquer erro que não
 * seja "não encontrado" (storage ainda subindo, rede) é repetido até esgotar
 * `attempts`; aí o último erro sobe.
 */
export async function ensureBucket(
  client: S3Client,
  bucket: string,
  options: EnsureBucketOptions,
): Promise<EnsureBucketOutcome> {
  let lastError: unknown = new Error(`bucket ${bucket}: nenhuma tentativa feita`);
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return 'exists';
    } catch (err) {
      if (!isNotFound(err)) {
        lastError = err;
        if (attempt < options.attempts) {
          await sleep(options.delayMs);
        }
        continue;
      }
    }
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
      return 'created';
    } catch (err) {
      if (isAlreadyOwned(err)) {
        return 'exists';
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
