const blockedParts = [
  'node_modules/',
  '.git/',
  '.next/',
  'dist/',
  'build/',
  'coverage/',
  '.turbo/',
  '.expo/',
  'tmp/',
  'temp/',
];

export const ContextGuardPlugin = async () => {
  return {
    'tool.execute.before': async (input, output) => {
      if (input.tool !== 'read') return;

      const candidate = output?.args?.filePath ?? output?.args?.path ?? '';
      const normalized = String(candidate).replaceAll('\\\\', '/').toLowerCase();

      if (
        normalized.endsWith('/.env') ||
        normalized.endsWith('/.env.local') ||
        normalized.match(/\/\.env\.[^/]+$/)
      ) {
        if (!normalized.endsWith('/.env.example')) {
          throw new Error(
            'Blocked: do not read real .env files. Use .env.example and environment presence checks instead.',
          );
        }
      }

      if (
        blockedParts.some((part) => normalized.includes(`/${part}`) || normalized.startsWith(part))
      ) {
        throw new Error(
          'Blocked token-waste read: generated/dependency/internal directory. Inspect source manifests, search symbols, or run targeted commands instead.',
        );
      }
    },
  };
};
