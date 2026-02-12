import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    clearMocks: true,
    testTimeout: 30_000,
  },
  define: {
    // 'process.env.IS_PROD': JSON.stringify(false),
    // 'process.env.VERSION': JSON.stringify('0.0.0-dev'),
    __IS_PROD__: JSON.stringify(false),
    __VERSION__: JSON.stringify('0.0.0-dev'),
  },
  resolve: {
    alias: {
      '@': 'src',
    },
  },
});
