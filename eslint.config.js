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
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            'dangerouslySetInnerHTML is forbidden except for markdown-it output in #print-root and HelpPage.',
        },
      ],
    },
  },
  {
    files: ['scripts/**', 'eslint.config.js', 'vite.config.ts'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
  {
    files: ['src/export/print.*', 'src/ui/help/HelpPage.*'],
    rules: {
      'no-restricted-syntax': 'off',
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
