import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const deps = Object.keys(pkg.dependencies ?? {});
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

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
    outDir: 'dist',
    emptyOutDir: true,
    copyPublicDir: true,
    sourcemap: false,
    lib: {
      entry: path.resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: (id) => builtins.has(id) || deps.includes(id),
      output: {
        banner: '#!/usr/bin/env node',
      },
    },
  },
});
