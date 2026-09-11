import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest resolves modules itself and does not read tsconfig `paths`, so the
 * `@/` alias the app uses everywhere has to be repeated here. Without it, any
 * lib module that imports a sibling by alias fails at test time with "Cannot
 * find package" — which looks like a missing dependency rather than a missing
 * alias.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
});
