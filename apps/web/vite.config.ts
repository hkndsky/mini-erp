import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  server: {
    port: 5173,
    proxy: {
      // In dev, the SPA talks to the API through /api (same-origin), so the
      // browser never hits CORS and E2E can run against a single origin.
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    css: false,
    // Component tests only — e2e/ holds Playwright specs, which must not be
    // collected by vitest (their test.describe() would run outside Playwright).
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
});
