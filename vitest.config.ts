import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";

// M11 Phase E real-render assertions: per-page smoke tests `await import`
// the .mdx page module. Without an MDX→JS transformer in the Vitest graph
// those imports fail to resolve. `@mdx-js/rollup` plugs into Vitest's Vite
// pipeline; `@next/mdx` is the production build path and stays separate.
// Production runtime is unchanged.
//
// remarkGfm MUST mirror next.config.ts's createMDX remarkPlugins so the test
// MDX pipeline renders the /help catalog tables (Chunk 2) the same way the
// production build does — otherwise vitest would render `| a | b |` as literal
// text and page render-tests would assert against a degraded shape.
export default defineConfig({
  plugins: [
    mdx({
      jsxImportSource: "react",
      providerImportSource: "@mdx-js/react",
      remarkPlugins: [remarkGfm],
    }),
  ],
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
  resolve: {
    alias: { "@": dirname(fileURLToPath(import.meta.url)) },
    // Allow `await import("@/app/help/<slug>/page")` to resolve `.mdx`
    // without a literal extension in the import specifier. Mirrors
    // next.config.ts's `pageExtensions` registration of `mdx`.
    extensions: [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json", ".mdx"],
  },
});
