import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { StorageSizeLimitError } from './s3.adapter.js';
import type {
  PresignedGetOptions,
  PresignedGetResult,
  PresignedPutOptions,
  PresignedPutResult,
  StorageObjectHead,
  StoragePutInput,
  StoragePutResult,
  StorageService,
} from './types.js';

/** Rota da API que recebe o upload e serve o download das URLs assinadas do storage em disco. */
export const DISK_STORAGE_PATH = '/dev/storage/object';

export type DiskStorageMethod = 'GET' | 'PUT';

export interface DiskStorageAdapterOptions {
  /** Pasta dos objetos (na stack de E2E, a pasta da execução). */
  root: string;
  /** Endereço da API visto pelo navegador: base das URLs assinadas. */
  publicUrl: string;
  /** Segredo das assinaturas; sem ele, um aleatório por processo (as URLs morrem com a API). */
  secret?: string;
  maxSizeBytes?: number;
}

/** Parâmetros de uma URL assinada, como chegam na rota. */
export interface DiskStorageSignedParams {
  key: string;
  expires: number;
  contentType?: string | undefined;
  signature: string;
}

export interface DiskStorageObject {
  body: Buffer;
  contentType: string;
}

const TIPO_PADRAO = 'application/octet-stream';
const SUFIXO_DO_TIPO = '.content-type';

/** Erro síncrono vira promessa rejeitada, como no adapter do S3. */
function emPromessa<T>(gerar: () => T): Promise<T> {
  try {
    return Promise.resolve(gerar());
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
}

function ausente(err: unknown): boolean {
  return (err as { code?: string }).code === 'ENOENT';
}

/**
 * Storage em disco para a stack de testes (F3, ADR-105): o mesmo contrato do S3/R2, com a pasta
 * local no lugar do bucket e a própria API no lugar do upload direto — as URLs "pré-assinadas"
 * apontam para `/dev/storage/object` com assinatura HMAC e validade, como as do S3. Só sobe fora
 * de produção e com `ALLOW_FAKE_PROVIDERS=true` (`@aluguei/config`, `storageProblems`).
 */
export class DiskStorageAdapter implements StorageService {
  private readonly root: string;
  private readonly publicUrl: string;
  private readonly secret: Buffer;
  private readonly maxSizeBytes: number | undefined;

  constructor(opts: DiskStorageAdapterOptions) {
    this.root = resolve(opts.root);
    this.publicUrl = opts.publicUrl.replace(/\/+$/, '');
    this.secret = opts.secret === undefined ? randomBytes(32) : Buffer.from(opts.secret);
    this.maxSizeBytes = opts.maxSizeBytes;
  }

  /** Arquivo do objeto; chave vazia, com byte nulo ou que sai da pasta é recusada. */
  private arquivo(key: string): string {
    if (key === '' || key.includes('\0') || key.endsWith(SUFIXO_DO_TIPO)) {
      throw new Error('chave de objeto inválida');
    }
    const alvo = resolve(this.root, key);
    if (!alvo.startsWith(this.root + sep)) {
      throw new Error('chave de objeto fora da pasta do storage');
    }
    return alvo;
  }

  async putObject(input: StoragePutInput): Promise<StoragePutResult> {
    const size = input.body.byteLength;
    if (this.maxSizeBytes !== undefined && size > this.maxSizeBytes) {
      throw new StorageSizeLimitError(size, this.maxSizeBytes);
    }
    const alvo = this.arquivo(input.key);
    await mkdir(dirname(alvo), { recursive: true });
    await writeFile(alvo, input.body);
    await writeFile(`${alvo}${SUFIXO_DO_TIPO}`, input.contentType ?? TIPO_PADRAO);
    return { key: input.key, size };
  }

  async getObject(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.arquivo(key));
    } catch (err) {
      if (ausente(err)) return null;
      throw err;
    }
  }

  /** O objeto com o tipo gravado no upload, para a rota de download. */
  async readObject(key: string): Promise<DiskStorageObject | null> {
    const body = await this.getObject(key);
    if (body === null) return null;
    const contentType = await readFile(`${this.arquivo(key)}${SUFIXO_DO_TIPO}`, 'utf8').catch(
      () => TIPO_PADRAO,
    );
    return { body, contentType };
  }

  async deleteObject(key: string): Promise<void> {
    const alvo = this.arquivo(key);
    await rm(alvo, { force: true });
    await rm(`${alvo}${SUFIXO_DO_TIPO}`, { force: true });
  }

  async headObject(key: string): Promise<StorageObjectHead | null> {
    try {
      const info = await stat(this.arquivo(key));
      return { key, size: info.size };
    } catch (err) {
      if (ausente(err)) return null;
      throw err;
    }
  }

  getPresignedPutUrl(input: PresignedPutOptions): Promise<PresignedPutResult> {
    const expiresIn = input.expiresInSeconds ?? 300;
    return emPromessa(() => ({
      url: this.url('PUT', input.key, expiresIn, input.contentType),
      expiresIn,
    }));
  }

  getPresignedDownloadUrl(input: PresignedGetOptions): Promise<PresignedGetResult> {
    const expiresIn = input.expiresInSeconds ?? 300;
    return emPromessa(() => ({ url: this.url('GET', input.key, expiresIn), expiresIn }));
  }

  /** A URL vale para o método, a chave, o tipo (no PUT) e até `expires`, como a do S3. */
  verify(method: DiskStorageMethod, params: DiskStorageSignedParams, agora = Date.now()): boolean {
    if (!Number.isFinite(params.expires) || params.expires * 1000 < agora) return false;
    const esperada = Buffer.from(
      this.assinatura(method, params.key, params.expires, params.contentType),
    );
    const recebida = Buffer.from(params.signature);
    return esperada.length === recebida.length && timingSafeEqual(esperada, recebida);
  }

  private url(
    method: DiskStorageMethod,
    key: string,
    expiresIn: number,
    contentType?: string,
  ): string {
    // Recusa aqui a chave que o upload recusaria, antes de entregar a URL.
    this.arquivo(key);
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    const query = new URLSearchParams({ key, expires: String(expires) });
    if (contentType !== undefined) query.set('contentType', contentType);
    query.set('signature', this.assinatura(method, key, expires, contentType));
    return `${this.publicUrl}${DISK_STORAGE_PATH}?${query.toString()}`;
  }

  private assinatura(
    method: DiskStorageMethod,
    key: string,
    expires: number,
    contentType?: string,
  ): string {
    return createHmac('sha256', this.secret)
      .update([method, key, String(expires), contentType ?? ''].join('\n'))
      .digest('base64url');
  }
}
