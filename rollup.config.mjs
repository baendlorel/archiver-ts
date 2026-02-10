import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import replace from '@rollup/plugin-replace';
import alias from '@rollup/plugin-alias';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const deps = Object.keys(pkg.dependencies ?? {});
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'esm',
    sourcemap: true,
    banner: '#!/usr/bin/env node',
  },
  external: (id) => builtins.has(id) || deps.includes(id),
  plugins: [
    alias({
      entries: [{ find: /^@/, replacement: path.resolve(import.meta.dirname, 'src') }],
    }),
    replace({
      preventAssignment: true,
      values: {
        'process.env.NODE_ENV': `production`,
      },
    }),
    resolve({ preferBuiltins: true }),
    commonjs(),
    json(),
    typescript({ tsconfig: './tsconfig.json', declaration: false, declarationMap: false }),
  ],
};
