import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Run test files sequentially. Several suites share global state — the
    // local Supabase database (tests/admin/*, tests/sync/dev-routing.test.ts,
    // tests/db/*) and the fixture corpus (tests/parser/* readdir's
    // fixtures/shows/raw/*.md). Parallel file execution races on truncates,
    // upserts, and any synthetic-fixture writes. The trade-off is roughly
    // 3s → 10s on a clean run, which is well inside the local-TDD budget.
    fileParallelism: false,
  },
  resolve: { alias: { "@": dirname(fileURLToPath(import.meta.url)) } },
});
