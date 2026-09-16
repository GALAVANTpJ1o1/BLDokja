import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  use: { baseURL: process.env.BLD_TEST_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  reporter: [["list"], ["html", { outputFolder: ".artifacts/playwright-report", open: "never" }]],
  outputDir: ".artifacts/playwright-results",
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
