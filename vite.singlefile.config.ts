import { resolve } from 'path';
import * as fs from 'fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { cspPlugin } from './scripts/csp';

function inlineFaviconsPlugin(): Plugin {
  return {
    name: 'inline-favicons',
    enforce: 'pre',
    transformIndexHtml: {
      order: 'pre',
      handler(html: string) {
        const logoMark = fs.readFileSync(resolve(__dirname, 'src/assets/logo-mark.svg')).toString('base64');
        const favicon32 = fs.readFileSync(resolve(__dirname, 'src/assets/favicon-32.png')).toString('base64');
        const appleTouch = fs.readFileSync(resolve(__dirname, 'src/assets/apple-touch-icon.png')).toString('base64');

        return html
          .replace(/href="\.\/src\/assets\/logo-mark\.svg"/g, `href="data:image/svg+xml;base64,${logoMark}"`)
          .replace(/href="\.\/src\/assets\/favicon-32\.png"/g, `href="data:image/png;base64,${favicon32}"`)
          .replace(/href="\.\/src\/assets\/apple-touch-icon\.png"/g, `href="data:image/png;base64,${appleTouch}"`);
      },
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [
    inlineFaviconsPlugin(),
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
});

