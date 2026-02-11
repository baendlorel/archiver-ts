// @ts-check
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import replace from '@rollup/plugin-replace';
import alias from '@rollup/plugin-alias';
import terser from '@rollup/plugin-terser';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const defaultConfigJsoncRaw = readFileSync(new URL('./src/default-files/config.jsonc', import.meta.url), 'utf8');
const defaultAutoIncrJsoncRaw = readFileSync(new URL('./src/default-files/auto-incr.jsonc', import.meta.url), 'utf8');
const deps = Object.keys(pkg.dependencies ?? {});
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

/**
 * @type {import('rollup').RollupOptions[]}
 */
export default [
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'esm',
      sourcemap: false,
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
          'process.env.NODE_ENV': JSON.stringify(`production`),
          __VERSION__: JSON.stringify(pkg.version),
          __ARCHIVER_BUNDLED_CONFIG_JSONC_RAW__: JSON.stringify(defaultConfigJsoncRaw),
          __ARCHIVER_BUNDLED_AUTO_INCR_JSONC_RAW__: JSON.stringify(defaultAutoIncrJsoncRaw),
        },
      }),
      resolve({ preferBuiltins: true }),
      commonjs(),
      json(),
      typescript({ tsconfig: './tsconfig.json', declaration: false, declarationMap: false }),
      terser({}),
    ],
  },
];
