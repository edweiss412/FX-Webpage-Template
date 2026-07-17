import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Cross-caller emission-topology guard (spec 2026-07-17-mi9-lead-autoapply-fyi §3.4, Codex R3).
 *
 * The durable `LEAD_ROLE_APPLIED` app_event MUST ride the SAME set of post-commit sites that emit
 * the coalescing `ROLE_FLAGS_NOTICE` feed nudge — otherwise a LEAD grant through an un-covered apply
 * path stays silent. This walks lib/sync (filesystem, so a NEW caller fails-by-default) and asserts:
 * every file that EMITS a roleFlagsNotice (calls `upsertAdminAlert(<x>.roleFlagsNotice)`) ALSO
 * co-emits the durable event (`emitLeadRoleApplied(`). Propagation-only files (that merely thread
 * `applied.roleFlagsNotice = phase2.roleFlagsNotice` up the result type) are NOT emission sites and
 * are excluded — the discriminator is a call to `upsertAdminAlert(` with a `.roleFlagsNotice` arg.
 */
const SYNC_ROOT = "lib/sync";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.ts$/.test(full) && !/\.test\.ts$/.test(full)) out.push(full);
  }
  return out;
}

// Matches `upsertAdminAlert(<something>roleFlagsNotice)` — the actual feed-nudge emission call, not
// the many `result.roleFlagsNotice = ...` propagation assignments.
const EMISSION_RE = /upsertAdminAlert\(\s*[A-Za-z0-9_.]*roleFlagsNotice\b/;

describe("LEAD_ROLE_APPLIED cross-caller emission topology (§3.4)", () => {
  const emissionSites = walk(SYNC_ROOT).filter((f) => EMISSION_RE.test(readFileSync(f, "utf8")));

  test("at least the two known emission sites are discovered (cron/manual + staged)", () => {
    expect(emissionSites.sort()).toEqual([
      "lib/sync/applyStaged.ts",
      "lib/sync/runScheduledCronSync.ts",
    ]);
  });

  test.each(
    walk(SYNC_ROOT)
      .filter((f) => EMISSION_RE.test(readFileSync(f, "utf8")))
      .map((f) => [f]),
  )("%s co-emits the durable LEAD_ROLE_APPLIED event", (file) => {
    const src = readFileSync(file, "utf8");
    expect(
      src.includes("emitLeadRoleApplied("),
      `${file} emits a ROLE_FLAGS_NOTICE but does not co-emit the durable LEAD_ROLE_APPLIED event`,
    ).toBe(true);
  });
});
