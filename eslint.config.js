import eslint from '@eslint/js';
import securityPlugin from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';

export default [
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.ts'],
    plugins: {
      security: securityPlugin,
    },
    rules: {
      // TypeScript strict rules
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',

      // Code quality rules
      'no-console': 'warn',
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'],

      // Critical security rules (CI-blocking)
      'security/detect-eval-with-expression': 'error',
      'security/detect-child-process': 'error',
      'security/detect-unsafe-regex': 'error',

      // Important security rules (warnings)
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-fs-filename': 'warn',
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'test-fixtures/**',
      '**/*.js',
      'vitest.config.ts',
      '.claude/**',
      '.opencode/**',
      'docs/**',
    ],
  },
];
