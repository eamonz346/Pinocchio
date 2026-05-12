import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const workspaceRoot = resolve(process.cwd(), "../..");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry"
  },
  webServer: {
    command: "corepack pnpm exec next dev --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    env: {
      E2E_MOCK_LLM: "true",
      E2E_MOCK_LLM_ALLOWED: "true",
      CODE_EXECUTION_ENABLED: "true",
      WEB_ACCESS_ENABLED: "false",
      MAX_UPLOAD_FILE_COUNT: "100",
      WORKBENCH_DB_PATH: resolve(workspaceRoot, ".data", "e2e-workbench.db"),
      WORKBENCH_ENV_FILE_PATH: resolve(workspaceRoot, ".data", "e2e.env.local")
    }
  },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }]
});
