import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintPluginPrettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // TypeScript-specific rules
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'error',

      // Code quality rules
      'no-console': 'warn',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],

      // Security rules (from eslint-plugin-security)
      // Note: Individual rules enabled rather than full plugin due to config compatibility
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'test-fixtures/**',
      '*.js',
      'vitest.config.ts',
      '.claude/**',
    ],
  }
);
