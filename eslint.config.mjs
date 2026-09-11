import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.expo/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/drizzle/**',
      '**/next-env.d.ts',
      'tests/e2e/scripts/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      // Desabilitado: casts `as X` sobre any (ex.: response.json() em testes) são intencionais.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },
  {
    // Hook chamado depois de um return condicional quebra a página em runtime
    // (auditoria 2026-09-10, P1-04). Só a regra estrutural; as regras do
    // React Compiler do preset `recommended` não fazem parte deste gate.
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
    },
  },
);
