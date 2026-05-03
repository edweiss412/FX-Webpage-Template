import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Build artifacts produced by the dual-build Playwright projects
    // (configured in playwright.config.ts via NEXT_DIST_DIR).
    ".next-dev/**",
    ".next-prod/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Must be last: disables ESLint rules that conflict with Prettier formatting.
  prettier,
]);

export default eslintConfig;
