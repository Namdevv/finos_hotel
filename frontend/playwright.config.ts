import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
  ],
  outputDir: "test-results",
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "on",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
