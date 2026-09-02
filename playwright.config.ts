import webConfig from './apps/web/playwright.config';

// Lets `npx playwright test` work from the repo root as well as from apps/web.
// Without this, Playwright's default testDir (cwd) would sweep in the vitest
// spec files and fail to collect them.
export default {
  ...webConfig,
  testDir: 'apps/web/e2e',
};
