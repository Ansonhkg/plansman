import {defineConfig, devices} from "@playwright/test";

const apiPort = Number(process.env.PLANSMAN_TEST_API_PORT ?? 4000);
const webPort = Number(process.env.PLANSMAN_TEST_WEB_PORT ?? 3100);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", {open: "never"}]],
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {...devices["Desktop Chrome"]},
    },
  ],
  webServer: [
    {
      command: `PORT=${apiPort} bun tests/serve-api.ts`,
      reuseExistingServer: false,
      timeout: 30_000,
      url: `http://127.0.0.1:${apiPort}/api/plans`,
    },
    {
      command: `bun run dev --host 127.0.0.1 --port ${webPort}`,
      reuseExistingServer: false,
      timeout: 30_000,
      url: `http://127.0.0.1:${webPort}`,
    },
  ],
});
