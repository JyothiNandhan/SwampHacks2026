import { defineConfig } from 'vitest/config';

// Unit tests intentionally do not load vite.config.ts: DeepSpace correctly
// refuses production builds until the team owner server-mints an app ID.
export default defineConfig({
  define: { __DEEPSPACE_APP_ID__: JSON.stringify('app_test_fixture_only') },
  test: { include: ['src/**/*.{test,spec}.{ts,tsx}'], environment: 'node' }
});
