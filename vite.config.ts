import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        spike: resolve(__dirname, 'spike/index.html'),
        storageProbe: resolve(__dirname, 'spike/storage-probe.html'),
      },
    },
  },
});

