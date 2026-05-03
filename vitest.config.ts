import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Match both .test.ts and .test.tsx so React component atom tests
    // under tests/components/atoms/ (Task 4.4) are picked up. The atom
    // tests pure-server-render via `renderToStaticMarkup`, so no DOM
    // environment is needed — `environment: "node"` (above) stays correct.
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
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
