import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BackupIntegrityError,
  backupFileName,
  decryptFile,
  encryptFile,
  parseBackupFileName,
  parseEncryptionKey,
  selectForDeletion,
} from '@aluguei/db/backup';

/**
 * G3, trilha F2 (plano de continuação, Fase 6): backup do banco com retenção e criptografia. O
 * arquivo cifrado (AES-256-GCM) precisa recusar adulteração e chave errada sem deixar texto claro
 * para trás, e a retenção precisa apagar só os mais antigos.
 */
describe('formato do backup cifrado', () => {
  let dir: string;
  const key = randomBytes(32).toString('hex');

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aluguei-backup-format-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const exists = async (path: string): Promise<boolean> =>
    stat(path).then(
      () => true,
      () => false,
    );

  it('cifra e decifra sem perder um byte, em arquivo pequeno e grande', async () => {
    for (const size of [0, 17, 3 * 1024 * 1024 + 5]) {
      const plain = join(dir, `plain-${String(size)}`);
      const sealed = join(dir, `sealed-${String(size)}`);
      const opened = join(dir, `opened-${String(size)}`);
      const content = randomBytes(size);
      await writeFile(plain, content);
      await encryptFile(plain, sealed, parseEncryptionKey(key));
      const sealedBytes = await readFile(sealed);
      expect(sealedBytes.subarray(0, 12).toString('utf8')).toBe('ALUGUEI-BKP1');
      if (size > 0) {
        expect(sealedBytes.includes(content.subarray(0, Math.min(size, 16)))).toBe(false);
      }
      await decryptFile(sealed, opened, parseEncryptionKey(key));
      expect((await readFile(opened)).equals(content), `tamanho ${String(size)}`).toBe(true);
    }
  });

  it('um byte adulterado, a chave errada ou o arquivo truncado são recusados sem deixar saída', async () => {
    const plain = join(dir, 'plain-tamper');
    const sealed = join(dir, 'sealed-tamper');
    await writeFile(plain, randomBytes(64 * 1024));
    await encryptFile(plain, sealed, parseEncryptionKey(key));
    const original = await readFile(sealed);

    const tampered = Buffer.from(original);
    const middle = Math.floor(tampered.length / 2);
    tampered[middle] = (tampered[middle] ?? 0) ^ 0x01;
    const tamperedPath = join(dir, 'sealed-tampered');
    await writeFile(tamperedPath, tampered);
    const truncatedPath = join(dir, 'sealed-truncated');
    await writeFile(truncatedPath, original.subarray(0, original.length - 5));
    const otherKey = parseEncryptionKey(randomBytes(32).toString('hex'));

    const cases: Array<[string, string, Buffer]> = [
      ['adulterado', tamperedPath, parseEncryptionKey(key)],
      ['chave errada', sealed, otherKey],
      ['truncado', truncatedPath, parseEncryptionKey(key)],
    ];
    for (const [label, input, cryptoKey] of cases) {
      const output = join(dir, `opened-${label.replaceAll(' ', '-')}`);
      await expect(decryptFile(input, output, cryptoKey), label).rejects.toBeInstanceOf(
        BackupIntegrityError,
      );
      expect(await exists(output), `${label}: nada de texto claro no disco`).toBe(false);
    }

    const notABackup = join(dir, 'not-a-backup');
    await writeFile(notABackup, 'PGDMP isto é um dump sem cifra');
    await expect(
      decryptFile(notABackup, join(dir, 'opened-not'), parseEncryptionKey(key)),
    ).rejects.toThrow('não é um backup cifrado do Aluguei');
  });

  it('a chave é hex de 64 caracteres (32 bytes)', () => {
    expect(parseEncryptionKey(key)).toHaveLength(32);
    for (const bad of ['', 'abc', 'z'.repeat(64), '0'.repeat(63), '0'.repeat(128)]) {
      expect(() => parseEncryptionKey(bad), bad).toThrow('BACKUP_ENCRYPTION_KEY');
    }
  });
});

describe('nome e retenção dos backups', () => {
  it('nome com o instante em UTC, lido de volta', () => {
    const at = new Date('2026-09-21T19:35:07.123Z');
    expect(backupFileName(at)).toBe('aluguei-20260921T193507Z.dump.enc');
    expect(parseBackupFileName('aluguei-20260921T193507Z.dump.enc')?.toISOString()).toBe(
      '2026-09-21T19:35:07.000Z',
    );
    for (const other of ['aluguei-2026.dump.enc', 'notas.txt', 'aluguei-20260921T193507Z.dump']) {
      expect(parseBackupFileName(other), other).toBeNull();
    }
  });

  it('mantém os N mais novos e ignora o que não é backup', () => {
    const names = Array.from({ length: 16 }, (_, day) =>
      backupFileName(new Date(Date.UTC(2026, 8, day + 1, 6, 0, 0))),
    );
    const shuffled = [...names].reverse().concat(['LEIA-ME.txt', 'aluguei-x.dump.enc.tmp']);
    expect(selectForDeletion(shuffled, 14)).toEqual([names[1], names[0]]);
    expect(selectForDeletion(names.slice(0, 3), 14)).toEqual([]);
    expect(() => selectForDeletion(names, 0)).toThrow('BACKUP_KEEP');
  });
});
