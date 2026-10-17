import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests run before the workspace build on a fresh checkout.
export default defineConfig({
  resolve: { alias: {
    '@moneyback/contracts': fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url))
  } }
});
