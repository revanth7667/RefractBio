import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { cspPlugin } from './scripts/csp';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    viteSingleFile({
      useRecommendedBuildConfig: true,
    }),
    cspPlugin({ singleFile: true }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist-single',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
});

