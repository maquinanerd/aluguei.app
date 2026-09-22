/** Backup cifrado e restauração do banco (G3, trilha F2). A linha de comando fica em `cli.ts`. */
export {
  BackupIntegrityError,
  decryptFile,
  encryptFile,
  encryptStream,
  parseEncryptionKey,
} from './crypto.js';
export { backupFileName, parseBackupFileName, selectForDeletion } from './names.js';
export { connectionEnv, describeTarget } from './postgres.js';
