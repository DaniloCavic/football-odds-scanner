import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    env: { DATABASE_URL: process.env.ITEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/fos_itest" },
  },
});
