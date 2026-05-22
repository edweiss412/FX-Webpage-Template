import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import betterTailwind from "eslint-plugin-better-tailwindcss";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Build artifacts produced by the dual-build Playwright projects
    // (configured in playwright.config.ts via NEXT_DIST_DIR).
    ".next-screenshots-help/**",
    ".next-dev/**",
    ".next-prod/**",
    ".next-prod-flip/**",
    ".next-build-artifact-gate-test/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Code worktrees — full repo checkouts that would double-scan
    // every source file and OOM the eslint process when bare `pnpm lint`
    // runs from the main checkout.
    ".claude/**",
    "tests/cross-cutting/fixtures/no-global-cursor/**",
    "tests/cross-cutting/fixtures/no-global-cursor-semantic/**",
    "tests/cross-cutting/fixtures/email-canonicalization/**",
  ]),
  // ── Tailwind v4 canonical-class enforcement ─────────────────────────────
  // Implements the Tailwind PR-19059 canonical-class suggestions (same logic
  // as VSCode's `tailwindCSS.lint.suggestCanonicalClasses`). Catches
  // arrow-syntax `(--token-name)` references when the `@theme` block defines
  // a namespace-stripped utility (e.g. `min-h-(--spacing-tap-min)` →
  // `min-h-tap-min`). Auto-fixable; runs against the css-based config in
  // `app/globals.css`.
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    plugins: {
      "better-tailwindcss": betterTailwind,
    },
    settings: {
      "better-tailwindcss": {
        entryPoint: "app/globals.css",
      },
    },
    rules: {
      // Note: catches direct string literals + recognized utility callees
      // (`clsx`/`cn`/`cva`/...). Array-style patterns like
      // `className={[ "...", "..." ].filter(Boolean).join(" ")}` are NOT
      // covered by the plugin's default selectors — those are linted by
      // hand on initial canonicalization; new violations introduced via
      // direct string literals or `clsx` calls WILL be caught.
      "better-tailwindcss/enforce-canonical-classes": "error",
      // Honor the leading-underscore convention for intentionally unused
      // identifiers (parser-block `_version` parameters, type-test
      // construction sentinels, destructured-but-discarded values).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: [
      "lib/audit/admin-tables.generated.ts",
      "lib/audit/watermark-symbols.generated.ts",
      "lib/audit/email-boundaries.generated.ts",
    ],
    rules: {},
  },
  // Must be last: disables ESLint rules that conflict with Prettier formatting.
  prettier,
]);

export default eslintConfig;
