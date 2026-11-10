import { defineConfig, devices } from "@playwright/test";

// E2E testovi rade nad posebnom test bazom. Prvo: npm run build
const PORT = 3100;
export const E2E_ENV = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/fos_test",
  ADMIN_EMAIL: "e2e@example.com",
  ADMIN_PASSWORD: "e2e-lozinka-123",
};

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "telefon", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    env: { ...E2E_ENV, NODE_ENV: "production", DEMO_DELAY_MS: "120", ODDSPAPI_API_KEY: "", APIFOOTBALL_API_KEY: "", TRACKER_ENABLED: "false" },
  },
});
