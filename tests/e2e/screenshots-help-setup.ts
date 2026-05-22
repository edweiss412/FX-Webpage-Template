// r2 fix per F-r1 finding 2: setup projects run test files. A default-
// exported `globalSetup()` function would never execute here.
import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";

test("seed screenshots DB (runs once before screenshots-help + help-docs)", async () => {
  // r3: the Playwright runner env must match the env used by the webServer.
  // Otherwise signInAs() and X-Screenshot-Frozen-Now auth headers fail on CI.
  expect(process.env.ENABLE_TEST_AUTH).toBe("true");
  expect(process.env.TEST_AUTH_SECRET).toBe("test-secret-fixture");

  const result = spawnSync("pnpm", ["db:seed"], {
    stdio: "inherit",
    shell: false,
  });
  expect(result.status, `pnpm db:seed exited with status ${result.status}`).toBe(0);
});
