// scripts/lib/validation-env.ts — M12 Phase 0.C Codex R4 fix.
//
// Per Codex R4 finding F2: the validation CLIs read `process.env.*` directly
// at module load, but Node/tsx don't auto-load .env.local. The spec +
// .env.local.example tell operators to put VALIDATION_* values in
// .env.local, so an operator following the documented setup gets
// missing-env failures before any seed/check runs. This shim mirrors
// Next.js's own .env.local loading via @next/env's loadEnvConfig.
//
// Invoked synchronously at the very top of each CLI before any
// `process.env.*` read.
import { loadEnvConfig } from "@next/env";

let loaded = false;

export function loadValidationEnv(): void {
  if (loaded) return;
  // Codex Phase 0.C R10-F1 — use PRODUCTION-mode loading (dev=false) so
  // .env.development.local CANNOT override .env.local. Validation tooling
  // mutates prod-equivalent Supabase with the service-role key; allowing
  // a developer's .env.development.local to take precedence would be a
  // credible wrong-database risk (the URL/ref binding guard still passes
  // if both VALIDATION_* values come from the same overriding file).
  //
  // Production-mode precedence (per @next/env):
  //   1. .env.production.local  (unlikely on dev machines)
  //   2. .env.local             (the documented canonical source)
  //   3. .env.production
  //   4. .env
  // .env.development.local is NOT in this list — that's the intended
  // safety property.
  loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
  loaded = true;
}
