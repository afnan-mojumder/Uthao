import { defineConfig, devices } from '@playwright/test';

const isPreview = process.env.PLAYWRIGHT_PREVIEW === '1';
const baseURL = isPreview ? 'http://localhost:4173' : 'http://localhost:5173';
const webServerCommand = isPreview
  ? 'npx vite preview --port 4173 --strictPort'
  : 'npm run dev';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL,
    trace: 'on-first-retry',
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI && !isPreview,
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'pixel7',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 915, height: 412 },
      },
    },
  ],
});
