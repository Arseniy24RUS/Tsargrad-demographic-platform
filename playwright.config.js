// Playwright smoke tests for the static GitHub Pages build.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:8000',
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'python -m http.server 8000 --directory docs',
    url: 'http://127.0.0.1:8000',
    reuseExistingServer: true,
    timeout: 30_000
  }
});
