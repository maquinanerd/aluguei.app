import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { StorageObjectHead, StoragePutResult, StorageService } from './types.js';

type S3ClientOptions = ConstructorParameters<typeof S3Client>[0];

export interface S3StorageAdapterOptions {
  bucket: string;
  client?: S3Client;
  endpoint?: string;
  region?: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

/** Adapter S3-compatible (AWS S3, Cloudflare R2, MinIO, etc.). Credenciais nunca são hardcoded. */
export class S3StorageAdapter implements StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(opts: S3StorageAdapterOptions) {
    this.bucket = opts.bucket;
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
    this.client = new S3Client(clientOptions);
  }

  async putObject(input: {
    key: string;
    body: Buffer | Uint8Array;
    contentType?: string;
  }): Promise<StoragePutResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
    return { key: input.key, size: input.body.byteLength };
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
}
