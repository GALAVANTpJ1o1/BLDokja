import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BLD_TEST_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  use: {
    baseURL,
    trace: "retain-on-failure",
    // A first-time visitor is walked around each page by its guide (D-078), and the guide is a modal that
    // blocks the page. Every spec starts as a returning visitor; e2e/page-guides.spec.ts starts as a new one.
    storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "bld.guides.seen", value: JSON.stringify({ "*": 1000 }) }] }] },
  },
  reporter: [["list"], ["html", { outputFolder: ".artifacts/playwright-report", open: "never" }]],
  outputDir: ".artifacts/playwright-results",
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
