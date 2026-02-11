import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'node20',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    lib: {
      entry: path.resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      output: {
        banner: '#!/usr/bin/env node',
      },
    },
  },
});
