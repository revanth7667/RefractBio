/// <reference types="vitest" />
import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cspPlugin } from './scripts/csp';

export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        spike: resolve(__dirname, 'spike/index.html'),
        storageProbe: resolve(__dirname, 'spike/storage-probe.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    alias: {
      mammoth: 'mammoth/mammoth.browser.js',
    },
  },
});
