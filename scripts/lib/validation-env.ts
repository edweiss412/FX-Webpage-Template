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
  // dev=true so .env.local / .env.development.local override .env in the
  // same Next.js-canonical precedence order; quiet=true suppresses the
  // "Loaded env from .env.local" banner that would otherwise pollute the
  // CLIs' stderr.
  loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });
  loaded = true;
}
