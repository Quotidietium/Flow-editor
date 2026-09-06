import { defineConfig, devices } from '@playwright/test';

// 本机 Windows 动态保留端口范围（Hyper-V/WSL）可能圈住 3000——DEV_PORT 可绕开
const DEV_PORT = Number(process.env.DEV_PORT) || 3000;

export default defineConfig({
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  retries: process.env.CI ? 2 : 0,
  testDir: './tests',
  use: {
    baseURL: `http://localhost:${DEV_PORT}`,
    browserName: 'chromium',
    permissions: ['clipboard-read', 'clipboard-write'],
    trace: 'retain-on-failure',
    viewport: { width: 1920, height: 1080 }
  },
  webServer: {
    command: `pnpm ${process.env.CI ? 'preview' : 'dev'}`,
    url: `http://localhost:${DEV_PORT}`,
    reuseExistingServer: !process.env.CI
  },
  workers: process.env.CI ? 3 : undefined
});
