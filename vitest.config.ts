import { defineConfig, configDefaults } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";

import { BASE_INCLUDE, PARALLEL_TEST_GLOBS, ENV_BOUND_EXCLUDES } from "./vitest.projects";
import { WeightBalancedSequencer } from "./vitest.sequencer";

// unit-suite.yml sets VITEST_EXCLUDE_ENV_BOUND=1 to drop the env-bound files
// (see vitest.projects.ts). It MUST be a project-level exclude, not a CLI
// `--exclude` flag — vitest ignores CLI `--exclude` once a project defines its
// own `exclude`. Gated so the x-audits' direct `vitest run <file>` (and local
// `pnpm test`) still run those files.
const envBoundExcludes = process.env.VITEST_EXCLUDE_ENV_BOUND === "1" ? ENV_BOUND_EXCLUDES : [];

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
//
// The suite is split into two projects (see vitest.projects.ts for the partition
// rationale + single source of truth): a SERIAL project (fileParallelism:false)
// for the DB/fixture-corpus-bound suites, and a PARALLEL project for the ~300
// verified DB-free render/unit files. This replaces the previous global
// `fileParallelism: false`, which serialized the ENTIRE suite (the largest chunk
// of the unit-suite CI wall-clock). vitest runs the projects in separate
// sequential phases, so the parallel project never overlaps the serial one.
export default defineConfig({
  plugins: [
    mdx({
      jsxImportSource: "react",
      providerImportSource: "@mdx-js/react",
      remarkPlugins: [remarkGfm],
    }),
  ],
  test: {
    // Root-level options inherited by BOTH projects via `extends: true`. The
    // node environment is correct even for the React atom tests under
    // tests/components/atoms/ — they pure-server-render via renderToStaticMarkup.
    environment: "node",
    globals: false,
    setupFiles: ["tests/setup.ts"],
    // PR E: weight-balanced --shard partition (the two hot serial files no longer
    // both land in shard 1). No-op unless --shard is passed (vitest gates shard()
    // on config.shard), so local `pnpm test` + the x-audits' `vitest run <file>`
    // are unaffected. Root-level (ProjectConfig omits `sequencer`).
    sequence: { sequencer: WeightBalancedSequencer },
    projects: [
      {
        extends: true,
        test: {
          name: "serial",
          include: BASE_INCLUDE,
          // configDefaults.exclude keeps node_modules/dist/etc. excluded (setting
          // `exclude` overrides the default); then everything in the parallel set
          // is removed so it runs ONLY in the parallel project. New dirs default
          // here (safe).
          exclude: [...configDefaults.exclude, ...PARALLEL_TEST_GLOBS, ...envBoundExcludes],
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: "parallel",
          include: PARALLEL_TEST_GLOBS,
          fileParallelism: true,
        },
      },
    ],
  },
  resolve: {
    alias: { "@": dirname(fileURLToPath(import.meta.url)) },
    // Allow `await import("@/app/help/<slug>/page")` to resolve `.mdx`
    // without a literal extension in the import specifier. Mirrors
    // next.config.ts's `pageExtensions` registration of `mdx`.
    extensions: [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json", ".mdx"],
  },
});
