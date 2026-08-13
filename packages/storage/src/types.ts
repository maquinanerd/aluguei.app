export interface StoragePutInput {
  key: string;
  body: Buffer | Uint8Array;
  contentType?: string;
}

export interface StoragePutResult {
  key: string;
  size: number;
}

export interface StorageObjectHead {
  key: string;
  size: number;
}

export interface PresignedPutOptions {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}

export interface PresignedPutResult {
  url: string;
  expiresIn: number;
}

/** Interface de storage — implementada por adapters S3-compatible (baseline Cloudflare R2). */
export interface StorageService {
  putObject(input: StoragePutInput): Promise<StoragePutResult>;
  getObject(key: string): Promise<Buffer | null>;
  deleteObject(key: string): Promise<void>;
  headObject(key: string): Promise<StorageObjectHead | null>;
  /** URL pré-assinada para upload direto (browser→R2) — sem credencial no client. */
  getPresignedPutUrl(input: PresignedPutOptions): Promise<PresignedPutResult>;
}
