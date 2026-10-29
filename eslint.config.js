import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/providers/**', 'src/storage/**'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    ignores: ['dist/**', 'dist-single/**', 'node_modules/**', 'coverage/**'],
  }
);

