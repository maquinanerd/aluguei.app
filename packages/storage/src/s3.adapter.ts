import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  PresignedGetOptions,
  PresignedGetResult,
  PresignedPutOptions,
  PresignedPutResult,
  StorageObjectHead,
  StoragePutResult,
  StorageService,
} from './types.js';

type S3ClientOptions = ConstructorParameters<typeof S3Client>[0];

export interface S3StorageAdapterOptions {
  bucket: string;
  client?: S3Client;
  endpoint?: string;
  region?: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
  /**
   * Bucket no caminho (`https://endpoint/bucket/chave`) em vez de no host. Obrigatório
   * para MinIO e S3 compatíveis atrás de domínio próprio: o proxy não tem rota nem
   * certificado para `bucket.endpoint`.
   */
  forcePathStyle?: boolean;
  /** Limite de bytes para `putObject` no servidor (upload direto presign NÃO passa por aqui). */
  maxSizeBytes?: number;
}

/** Upload direto excede o limite configurado. */
export class StorageSizeLimitError extends Error {
  readonly size: number;
  readonly limit: number;

  constructor(size: number, limit: number) {
    super(`objeto com ${String(size)} bytes excede o limite de ${String(limit)} bytes`);
    this.name = 'StorageSizeLimitError';
    this.size = size;
    this.limit = limit;
  }
}

/** Adapter S3-compatible (AWS S3, Cloudflare R2, MinIO, etc.). Credenciais nunca são hardcoded. */
export class S3StorageAdapter implements StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly maxSizeBytes: number | undefined;

  constructor(opts: S3StorageAdapterOptions) {
    this.bucket = opts.bucket;
    this.maxSizeBytes = opts.maxSizeBytes;
    if (opts.client) {
      this.client = opts.client;
      return;
    }
    const clientOptions: S3ClientOptions = { region: opts.region ?? 'auto' };
    if (opts.endpoint) {
      clientOptions.endpoint = opts.endpoint;
    }
    if (opts.credentials) {
      clientOptions.credentials = opts.credentials;
    }
    if (opts.forcePathStyle) {
      clientOptions.forcePathStyle = true;
    }
    this.client = new S3Client(clientOptions);
  }

  async putObject(input: {
    key: string;
    body: Buffer | Uint8Array;
    contentType?: string;
  }): Promise<StoragePutResult> {
    const size = input.body.byteLength;
    if (this.maxSizeBytes !== undefined && size > this.maxSizeBytes) {
      throw new StorageSizeLimitError(size, this.maxSizeBytes);
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
    return { key: input.key, size };
  }

  async getObject(key: string): Promise<Buffer | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!response.Body) {
        return null;
      }
      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'NotFound' || name === 'NoSuchKey') {
        return null;
      }
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async headObject(key: string): Promise<StorageObjectHead | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (response.ContentLength === undefined) {
        return null;
      }
      return { key, size: response.ContentLength };
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'NotFound' || name === 'NoSuchKey') {
        return null;
      }
      throw err;
    }
  }

  async getPresignedPutUrl(input: PresignedPutOptions): Promise<PresignedPutResult> {
    const expiresIn = input.expiresInSeconds ?? 300;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn });
    return { url, expiresIn };
  }

  /** URL pré-assinada GET (download direto) com expiração configurável. */
  async getPresignedDownloadUrl(input: PresignedGetOptions): Promise<PresignedGetResult> {
    const expiresIn = input.expiresInSeconds ?? 300;
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: input.key });
    const url = await getSignedUrl(this.client, command, { expiresIn });
    return { url, expiresIn };
  }
}
