/// <reference types="vitest" />
import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults, type UserConfig as VitestUserConfig } from 'vitest/config';
import { cspPlugin } from './scripts/csp';

declare module 'vite' {
  interface UserConfig {
    test?: VitestUserConfig['test'];
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    rolldownOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        minify: {
          compress: {
            dropConsole: true,
            dropDebugger: true,
          },
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    alias: {
      mammoth: 'mammoth/mammoth.browser.js',
    },
  },
});
