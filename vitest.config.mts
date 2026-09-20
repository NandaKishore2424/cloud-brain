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
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
});
