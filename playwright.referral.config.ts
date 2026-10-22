import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "referral-install.spec.ts",
  timeout: 30000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:43176", screenshot: "only-on-failure" },
});
