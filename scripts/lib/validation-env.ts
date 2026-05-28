// scripts/lib/validation-env.ts — M12 Phase 0.C R4-F2 + R10-F1 + R11-F1.
//
// Loads VALIDATION_* vars from .env.local ONLY. Validation tooling mutates
// prod-equivalent Supabase with the service-role key; any other env-file
// source (.env.development.local, .env.production.local, .env.production,
// .env) overriding .env.local is a credible wrong-database risk (the
// URL/ref binding guard passes when both VALIDATION_* values come from
// the same overriding file).
//
// Implementation: a narrow hand-rolled dotenv parser that reads ONLY
// .env.local. @next/env's loadEnvConfig was rejected because both
// dev=true (R10) and dev=false (R11) modes admit additional override
// files; no flag isolates .env.local exclusively.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let loaded = false;

/**
 * Parse a dotenv file body. Mirrors Next.js's parsing behavior for the
 * subset of syntax this project actually uses: `KEY=VALUE` per line,
 * comments via `#` prefix, blank lines ignored, simple-quoted VALUE
 * has quotes stripped. No multi-line, no expansion, no overriding the
 * already-set process.env (Next.js convention — process.env wins).
 */
function parseDotenv(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadValidationEnv(): void {
  if (loaded) return;
  loaded = true;
  // R16-F1 + R22-F1 test escape hatch — when VALIDATION_ENV_SKIP_LOCAL_FILE=1
  // is set AND we're running under Vitest (VITEST_WORKER_ID defined
  // on every worker), skip the .env.local read entirely.
  //
  // R22-F1 gate: outside of Vitest, the flag is treated as a hostile
  // env-injection attempt and we FAIL CLOSED. Pre-R22 the flag honored
  // unconditionally — a CI / shell / direnv with this flag set could
  // silently bypass .env.local in production CLI runs and let
  // inherited VALIDATION_* drive the target. The wrong-database risk
  // R16-F1 was meant to close re-opened.
  const skipLocalFile = process.env.VALIDATION_ENV_SKIP_LOCAL_FILE === "1";
  const inVitest = process.env.VITEST_WORKER_ID !== undefined;
  if (skipLocalFile && !inVitest) {
    throw new Error(
      "VALIDATION_ENV_SKIP_LOCAL_FILE=1 is set outside of Vitest. " +
        "This flag is a test-only escape hatch (it disables the .env.local " +
        "loader so tests can supply VALIDATION_* via parent env). Honoring it " +
        "outside Vitest re-opens the wrong-database risk per Codex R16-F1 / " +
        "R22-F1. Unset it to run validation tooling.",
    );
  }
  if (skipLocalFile) return;
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const parsed = parseDotenv(readFileSync(path, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    // Codex Phase 0.C R16-F1 (CRITICAL) — .env.local is AUTHORITATIVE
    // over inherited process.env for VALIDATION_* keys. A developer
    // shell, direnv, CI env, or prior dotenv export could set
    // VALIDATION_SUPABASE_URL/PROJECT_REF/SECRET_KEY for a different
    // hosted project; if those inherited values were left to win, the
    // URL/ref binding guard would still pass (both consistent with each
    // other, just for the WRONG target) and validation:reseed would
    // mutate the wrong Supabase project with the service-role key.
    //
    // Forcing .env.local to win for VALIDATION_* keys closes that
    // bypass: the operator's documented canonical source is the only
    // place a destructive target can come from. CI environments
    // typically have no .env.local — there the loader is a no-op and
    // inherited values (from GitHub Actions secrets) flow through
    // unchanged. Local environments with .env.local + inherited
    // VALIDATION_* always defer to .env.local.
    //
    // Non-VALIDATION_* keys retain the conventional inherited-wins
    // behavior (no destructive bypass concern).
    if (key.startsWith("VALIDATION_")) {
      process.env[key] = value;
    } else if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
