import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, open, rm, stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Arquivo de backup cifrado (G3, trilha F2): `ALUGUEI-BKP1` (12 bytes), IV (12 bytes), o dump
 * cifrado com AES-256-GCM e a etiqueta de autenticação (16 bytes) no fim. A etiqueta cobre o
 * conteúdo inteiro: um byte trocado, o arquivo truncado ou a chave errada fazem a leitura falhar.
 */
const MAGIC = Buffer.from('ALUGUEI-BKP1', 'utf8');
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + IV_BYTES;

/** Backup que não passou na autenticação: adulterado, truncado ou com a chave errada. */
export class BackupIntegrityError extends Error {
  constructor() {
    super('Backup corrompido ou com a chave errada: a autenticação do arquivo falhou');
    this.name = 'BackupIntegrityError';
  }
}

/** Chave de 32 bytes em hex (64 caracteres), a mesma forma do `SERVICE_HEX_64` do Coolify. */
export function parseEncryptionKey(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('BACKUP_ENCRYPTION_KEY precisa ser hex de 64 caracteres (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/** Cifra um fluxo (a saída do pg_dump) direto para o arquivo: o dump não toca o disco em claro. */
export async function encryptStream(input: Readable, destPath: string, key: Buffer): Promise<void> {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  await writeFile(destPath, Buffer.concat([MAGIC, iv]), { flag: 'wx', mode: 0o600 });
  try {
    await pipeline(input, cipher, createWriteStream(destPath, { flags: 'a' }));
    await appendFile(destPath, cipher.getAuthTag());
  } catch (err) {
    await rm(destPath, { force: true });
    throw err;
  }
}

export async function encryptFile(srcPath: string, destPath: string, key: Buffer): Promise<void> {
  await encryptStream(createReadStream(srcPath), destPath, key);
}

async function readAt(path: string, position: number, length: number): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Decifra para `destPath` e só deixa o arquivo se a autenticação passar. Em qualquer falha o
 * destino é apagado: nada de dump parcial, não autenticado, no disco.
 */
export async function decryptFile(srcPath: string, destPath: string, key: Buffer): Promise<void> {
  const { size } = await stat(srcPath);
  const magic = await readAt(srcPath, 0, MAGIC.length);
  if (!magic.equals(MAGIC)) {
    throw new Error(`${srcPath} não é um backup cifrado do Aluguei`);
  }
  if (size < HEADER_BYTES + TAG_BYTES) {
    throw new BackupIntegrityError();
  }
  const iv = await readAt(srcPath, MAGIC.length, IV_BYTES);
  const tag = await readAt(srcPath, size - TAG_BYTES, TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const cipherLength = size - HEADER_BYTES - TAG_BYTES;
  const body =
    cipherLength > 0
      ? createReadStream(srcPath, { start: HEADER_BYTES, end: HEADER_BYTES + cipherLength - 1 })
      : Readable.from([]);
  try {
    await pipeline(body, decipher, createWriteStream(destPath, { flags: 'wx', mode: 0o600 }));
  } catch {
    await rm(destPath, { force: true });
    throw new BackupIntegrityError();
  }
}
