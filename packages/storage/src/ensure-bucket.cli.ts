/**
 * Garante o bucket do storage antes de a API subir (serviço storage-init do
 * docker-compose.prod.yml). Lê as variáveis STORAGE_* e nunca imprime credenciais.
 *
 * Uso: node --import tsx packages/storage/src/ensure-bucket.cli.ts
 */
import { S3Client } from '@aws-sdk/client-s3';
import { ensureBucket } from './ensure-bucket.js';

const REQUIRED = ['STORAGE_BUCKET', 'STORAGE_ACCESS_KEY_ID', 'STORAGE_SECRET_ACCESS_KEY'] as const;

const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`storage-init: variáveis ausentes: ${missing.join(', ')}`);
  process.exit(1);
}

const bucket = process.env.STORAGE_BUCKET as string;
const client = new S3Client({
  region: process.env.STORAGE_REGION ?? 'us-east-1',
  ...(process.env.STORAGE_ENDPOINT ? { endpoint: process.env.STORAGE_ENDPOINT } : {}),
  forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY as string,
  },
});

try {
  const outcome = await ensureBucket(client, bucket, { attempts: 30, delayMs: 2000 });
  console.log(`storage-init: bucket ${bucket} ${outcome === 'created' ? 'criado' : 'já existia'}`);
} catch (err) {
  const reason = err instanceof Error ? err.message : String(err);
  console.error(`storage-init: não foi possível garantir o bucket ${bucket}: ${reason}`);
  process.exit(1);
}
