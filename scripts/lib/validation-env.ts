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
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const parsed = parseDotenv(readFileSync(path, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    // Don't override pre-existing process.env (env exported in shell
    // wins — same as @next/env). Especially important for test scenarios
    // where the parent shell intentionally sets VALIDATION_* values that
    // should propagate through tsx into the script.
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
