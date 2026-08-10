/**
 * tests/sync/onboardingScanSyncLogAttribution.test.ts (Task 3b, 2026-08-09)
 *
 * The onboarding-scan sink is the third `sync_log` writer. Its insert named four
 * columns and no `show_id`, so every onboarding row landed unattributed — and
 * `lib/sync/runOnboardingScan.ts:536` supports re-onboarding a file that already has
 * a `shows` row, which makes those rows attributable-but-NULL rather than
 * legitimately NULL. Leaving this writer alone would have left a whole class of
 * attributable attempts dark while claiming the arc was done.
 *
 * TWO defects, and the second is the easy miss: repairing the sink SQL alone still
 * leaves seven rows NULL, because seven callers never pass a `driveFileId` at all.
 * A `show_id` subselect over a NULL `drive_file_id` resolves to NULL, correctly and
 * uselessly. The sink pin below cannot catch that; the caller pin can.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripCommentsForFile, stripSqlComments } from "@/tests/_shared/stripComments";

// COMMENT-STRIPPED. Whole-diff r1 finding 4: commenting out all seven `driveFileId`
// properties still returned {"matched":7,"bare":0}, and restoring the OLD unattributed
// SQL while parking the expected form in an SQL block comment still satisfied both
// exact pins. Both are the same defect - source text read as if it were code.
const SOURCE = stripCommentsForFile(
  readFileSync(join(process.cwd(), "lib/sync/runOnboardingScan.ts"), "utf8"),
  "lib/sync/runOnboardingScan.ts",
);

describe("onboarding-scan sink — show attribution (spec §3.1)", () => {
  // SQL comments come off through THE shared module (spec
  // 2026-07-26-stripcomments-shared-design); _metaStripCommentsSingleSource forbids a
  // local `--` regex, and the shared one is quote-aware where a naive one is not.
  const normalize = (raw: string) => stripSqlComments(raw).replace(/\s+/g, " ").trim();

  it("resolves show_id by subselect, with drive_file_id reused as $1", () => {
    const insert = SOURCE.match(/insert into public\.sync_log[\s\S]*?\$4::jsonb\s*\)/);
    expect(insert, "the onboarding sync_log insert was not found").not.toBeNull();

    // Exact equality on the normalized statement, matching the other two sinks'
    // rule. Containment would be satisfied by a subselect parked in a comment.
    expect(normalize(insert![0])).toBe(
      "insert into public.sync_log (show_id, drive_file_id, status, message, parse_warnings) " +
        "values ((select id from public.shows where drive_file_id = $1), $1, $2, $3, $4::jsonb)",
    );
  });

  it("does not bind an explicit show id anywhere in the sink", () => {
    // The rejected channel (spec §3.1.1) must be absent from this writer too, not
    // merely unused: an explicit id can carry one read from an uncommitted `shows`
    // insert, and the FK check then blocks on that transaction.
    // Scoped to the statement itself. A fixed-length window from the method's start
    // overruns into the NEXT method, which has its own `$1::uuid` for an unrelated
    // column — the assertion then fails on code it does not govern.
    const start = SOURCE.indexOf("async logSync(entry:");
    expect(start, "the onboarding sink method was not found").toBeGreaterThan(-1);
    const insert = SOURCE.slice(start).match(/insert into public\.sync_log[\s\S]*?\$4::jsonb\s*\)/);
    expect(insert).not.toBeNull();
    expect(insert![0]).not.toMatch(/\$1::uuid/);
  });
});

/**
 * The seven-caller regression pin.
 *
 * This enumeration is deliberate and it is a REGRESSION PIN, not a cover. It claims
 * "these seven calls were repaired in this diff", not "seven is all of them" — the
 * derived guard that WOULD claim completeness is filed as
 * BL-SYNC-LOG-ATTRIBUTION-METATEST, and this file is deleted when that lands.
 *
 * An enumeration is the wrong shape for a cover and the right shape for pinning
 * specific repairs against silent reversion.
 */
describe("onboarding-scan callers — every superseded emit names its file (regression pin)", () => {
  it("no superseded-during-scan emit is left without a driveFileId", () => {
    const bare = [...SOURCE.matchAll(/tx\.logSync\(\{[^}]*\}\)/g)]
      .map((m) => m[0])
      .filter((call) => /WIZARD_SESSION_SUPERSEDED_DURING_SCAN/.test(call))
      .filter((call) => !/driveFileId/.test(call));

    // Anti-vacuity: the matcher must find the emits at all. If the shape changes and
    // this drops to zero matches, the filter above passes for the wrong reason.
    const all = [...SOURCE.matchAll(/tx\.logSync\(\{[^}]*\}\)/g)]
      .map((m) => m[0])
      .filter((call) => /WIZARD_SESSION_SUPERSEDED_DURING_SCAN/.test(call));
    expect(all.length, "the superseded-emit shape changed; this pin is vacuous").toBe(7);

    expect(bare).toEqual([]);
  });

  it("the run-level readiness emit carries no driveFileId, and that is correct", () => {
    // A DOCUMENTED LIMIT, not an oversight (spec §3.2). This emit describes the RUN,
    // not a file — there is no drive_file_id to attribute it to, so `show_id IS NULL`
    // is the right outcome. Pinned so a later reader does not "fix" it into
    // attributing a run to whichever file happened to be in scope.
    expect(SOURCE).toMatch(/code: "onboarding_scan_aborted_migration_state"/);
    const runLevel = SOURCE.match(
      /tx\.logSync\(\{\s*code: "onboarding_scan_aborted_migration_state"[\s\S]*?\}\)/,
    );
    expect(runLevel).not.toBeNull();
    expect(runLevel![0]).not.toMatch(/driveFileId/);
  });
});
