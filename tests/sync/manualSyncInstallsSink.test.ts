/**
 * tests/sync/manualSyncInstallsSink.test.ts (Task 3c, 2026-08-09)
 *
 * Resolving `show_id` at the sink only helps rows that are WRITTEN. Two of ten
 * production entry points installed a sync_log sink — the cron route and the Drive
 * webhook — so a manual re-sync ran with no sink for its `processOneFile` outcomes and
 * produced no row to attribute for them. Precisely: the manual RECOVERY outcomes were
 * already written, by `recoveryTx.insertSyncLog` in `markManualDriveError_unlocked` and
 * `markManualSheetUnavailable_unlocked`; it was the ordinary pipeline outcomes that had
 * nowhere to go. Fixing the three sinks without fixing this would have left those paths
 * exactly as dark as before, while every sink test passed.
 *
 * This is a REGRESSION PIN over a FIXED list of eight sites. It claims "these eight
 * were repaired in this diff", NOT "eight is all of them". The derived guard that
 * would claim completeness — deriving entry points from the exports of the sync
 * modules rather than from a hand list — is filed as
 * BL-SYNC-LOG-ATTRIBUTION-METATEST, and this file is deleted when that lands.
 *
 * The distinction is the whole point. An enumeration is the WRONG shape for a cover:
 * two of these eight surfaced only after a six-site list had been published, which is
 * exactly why the completeness claim is filed rather than made here. It is the RIGHT
 * shape for pinning specific repairs against silent reversion, which is all this
 * file does.
 *
 * Keyed on the IMPORT, never the call name. Three of these sites call through a local
 * alias (`catchUp`, `runSync`, `deps.runManualSyncForShowUnlocked`), so a call-name
 * matcher misses them; import presence is file-local and needs no interprocedural
 * analysis.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripCommentsForFile } from "@/tests/_shared/stripComments";

/** The eight repaired sites. Fixed, deliberate, and not a completeness claim. */
const SITES = [
  "app/api/admin/sync/[slug]/route.ts",
  "app/admin/dev/actions.ts",
  "app/admin/show/[slug]/_actions/roleToken.ts",
  "app/admin/show/[slug]/_actions/useRaw.ts",
  "app/api/admin/pending-ingestions/[id]/retry/route.ts",
  "lib/showLifecycle/unarchiveShow.ts",
  "app/api/admin/show/pull-sheet-override/route.ts",
] as const;

/** Already instrumented before this arc; included so a regression there also fails. */
const ALREADY_INSTRUMENTED = [
  "app/api/cron/sync/route.ts",
  "app/api/drive/webhook/route.ts",
] as const;

/**
 * COMMENT-STRIPPED. Whole-diff r1 finding 4: replacing every live
 * `logSync: writeSyncLog` with `/* logSync: writeSyncLog *\/` left all seven checks
 * reporting `import=true install=true`. A pin that cannot fail when its subject is
 * commented out pins nothing.
 */
function read(rel: string): string {
  return stripCommentsForFile(readFileSync(join(process.cwd(), rel), "utf8"), rel);
}

describe("manual sync entry points install a sync_log sink (regression pin)", () => {
  it.each([...SITES])("%s imports and installs writeSyncLog", (rel) => {
    const src = read(rel);
    expect(src, `${rel} does not import the sink`).toMatch(
      /import\s*\{[^}]*\bwriteSyncLog\b[^}]*\}\s*from\s*["']@\/lib\/sync\/syncLog["']/,
    );
    // Installed, not merely imported. An unused import satisfies the check above and
    // changes nothing about what gets written.
    expect(src, `${rel} imports the sink but never installs it`).toMatch(/logSync:\s*writeSyncLog/);
  });

  it.each([...ALREADY_INSTRUMENTED])("%s still installs a sink", (rel) => {
    expect(read(rel)).toMatch(/writeSyncLog/);
  });

  it("the pending-ingestions retry route installs a sink on BOTH of its paths", () => {
    // Two distinct call shapes in one file: the unlocked re-sync (a DIFFERENT callee
    // name, `deps.runManualSyncForShowUnlocked`) and the first-seen stage deps. A
    // per-file check passes once either one is fixed, so both are named here.
    const src = read("app/api/admin/pending-ingestions/[id]/retry/route.ts");
    const installs = src.match(/logSync:\s*writeSyncLog/g) ?? [];
    expect(installs.length, "only one of the retry route's two paths installs a sink").toBe(2);
  });

  it("the two alias call sites forward the sink through their alias, not around it", () => {
    // `catchUp` and `runSync` default to the real function, so an installation that
    // forgets the alias typechecks and silently writes nothing.
    for (const rel of [
      "lib/showLifecycle/unarchiveShow.ts",
      "app/api/admin/show/pull-sheet-override/route.ts",
    ]) {
      const src = read(rel);
      expect(src, `${rel} does not pass deps through its alias`).toMatch(
        /(catchUp|runSync)\([^)]*,[^)]*,[\s\S]{0,200}?logSync:\s*writeSyncLog/,
      );
    }
  });
});
