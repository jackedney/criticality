import eslint from '@eslint/js';
import securityPlugin from 'eslint-plugin-security';

export default [
  eslint.configs.recommended,
  {
    plugins: {
      security: securityPlugin,
    },
    rules: {
      'security/detect-eval-with-expression': 'warn',
    },
  },
];
