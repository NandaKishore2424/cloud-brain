import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Vitest covers `src/lib` and other pure modules only — no React Native, no
 * SQLite, no rendering. Those layers have their own checks
 * (`npm run verify:schema` executes the real schema), and keeping this config
 * free of a React Native transform is what makes the suite start in
 * milliseconds and stay worth running on every save.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      // `fileURLToPath`, not `new URL(...).pathname`.
      //
      // `.pathname` returns a percent-encoded URL path, so a project directory
      // containing a space resolves to ".../Cloud%20Brain/src" — a path that
      // does not exist, and every '@/...' import fails to resolve with a
      // "Cannot find package" error that points at the import rather than at
      // the alias. `fileURLToPath` decodes back to a real filesystem path.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
