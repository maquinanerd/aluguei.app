import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Criptografia simétrica AES-256-GCM para segredos externos armazenados
 * por conexão (ex.: access_token Meta). O token nunca é persistido em
 * texto claro nem aparece em logs/LLM.
 */

export interface EncryptedSecret {
  /** Ciphertext + tag GCM, base64. */
  value: string;
  /** IV base64 (não secreto). */
  iv: string;
  /** Versão/chave utilizada (rotação). */
  keyId: string;
}

/** Deriva chave de 32 bytes a partir da variável de ambiente (hex de 64 chars). */
function deriveKey(encryptionKey: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    throw new Error('META_TOKEN_ENCRYPTION_KEY deve ser hex de 64 caracteres (32 bytes)');
  }
  return Buffer.from(encryptionKey, 'hex');
}

const ALGORITHM = 'aes-256-gcm';

export function encryptSecret(
  plaintext: string,
  encryptionKey: string,
  keyId = 'k1',
): EncryptedSecret {
  const key = deriveKey(encryptionKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    value: Buffer.concat([ciphertext, tag]).toString('base64'),
    iv: iv.toString('base64'),
    keyId,
  };
}

export function decryptSecret(encrypted: EncryptedSecret, encryptionKey: string): string {
  const key = deriveKey(encryptionKey);
  const iv = Buffer.from(encrypted.iv, 'base64');
  const combined = Buffer.from(encrypted.value, 'base64');
  const tag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(0, combined.length - 16);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Fingerprint não reversível de um input (auditoria sem PII). */
export function digestInput(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
