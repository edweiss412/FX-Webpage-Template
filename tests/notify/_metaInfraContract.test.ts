import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Each new notify Supabase/postgres boundary helper adds its row here IN THE SAME COMMIT.
export const REGISTERED: { path: string }[] = [];

// Inline recursive .ts walker (R9/R10 fix — no shared walkTs exists in the repo).
function walkTs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkTs(p));
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

// SCANNED SET: lib/notify recursively PLUS the two app-settings getters this contract also
// guards — else a getter could add a Supabase read with no row while green.
const APP_SETTINGS_GETTERS = [
  "lib/appSettings/getAlertOnSyncProblems.ts",
  "lib/appSettings/getDailyReviewDigest.ts",
];

function scannedFiles(): string[] {
  return [...walkTs("lib/notify"), ...APP_SETTINGS_GETTERS.filter((p) => existsSync(p))];
}

// DB boundary = DIRECT Supabase/postgres syntax OR a DB-BOUND WRAPPER call (R11 fix —
// notify maintenance writes through wrappers like upsertAdminAlert/resolveAdminAlert that
// THROW on a returned RPC error; a wrapper-only file has no direct DB syntax and would
// otherwise slip the guard). Extend this alternation as new DB-bound wrappers are added.
const DB_SIGNATURE =
  /createSupabaseServiceRoleClient|\.from\(|\bsql`|postgres\(|upsertAdminAlert\(|resolveAdminAlert\(/;

// R14 fix: the exemption is a POSITIVE marker `// not-subject-to-meta: <reason>` (colon + a
// non-empty reason) on its own comment line — NOT a bare substring (which a discussion comment
// like `// not-subject-to-meta? NO` would falsely satisfy, exempting a real boundary).
const EXEMPT_MARKER = /^\s*\/\/\s*not-subject-to-meta:\s+\S/m;

describe("notify + app-settings infra-contract (structural)", () => {
  test("every lib/notify AND notify app-settings-getter DB boundary is REGISTERED or // not-subject-to-meta: <reason>", () => {
    const offenders: string[] = [];
    for (const file of scannedFiles()) {
      const src = readFileSync(file, "utf8");
      const touchesDb = DB_SIGNATURE.test(src);
      const registered = REGISTERED.some((r) => file.endsWith(r.path));
      const exempt = EXEMPT_MARKER.test(src);
      if (touchesDb && !registered && !exempt) offenders.push(file);
    }
    expect(
      offenders,
      `unregistered notify/app-settings DB boundaries: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  test("every REGISTERED path exists (a renamed/deleted boundary is caught)", () => {
    const missing = REGISTERED.filter((r) => !existsSync(r.path));
    expect(missing.map((r) => r.path), "REGISTERED paths that no longer exist").toEqual([]);
  });
});
