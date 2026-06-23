/**
 * tests/db/showCacheRevalidateCoverage.test.ts (nav-perf tag-caching, plan Task 4 / §6)
 *
 * Structural coverage guard for the show data-cache invalidation contract. getShowForViewer's
 * data fan-out is cached under the `show-${showId}` tag (lib/data/showCacheTag.ts); EVERY
 * Next-runtime write to a getShowForViewer-read table MUST either call `revalidateShow` /
 * `revalidateOnApplied` / `revalidateTag(showCacheTag(...))` POST-COMMIT, or carry an explicit
 * `// not-subject-to-revalidate: <reason>` waiver. Three layers:
 *
 *  - REGISTRY layer: each registered file gets its disposition checked — `revalidate` files must
 *    contain a revalidate call referencing the show tag; `exempt` files must contain the waiver
 *    comment.
 *  - DISCOVERY layer (the anti-regression spine): re-run the spec §6 raw-SQL regex (the 7 read
 *    tables, `\b`-anchored so `shows_pending_changes` etc. are excluded) + the `.from().{insert,
 *    update,upsert,delete}` builder form over lib+app (minus tests/audit). Every file with a
 *    matched write LINE must be registered, and its registered `siteCount` must EQUAL the live
 *    match count. A new raw-SQL write in an already-registered file bumps the discovered count →
 *    MISMATCH → FAIL ("add a revalidate + bump siteCount or exempt"). A brand-new write file →
 *    FAIL (unregistered).
 *  - RPC-wrapper layer: writes that flow through a SECURITY DEFINER RPC (no raw SQL in JS) are
 *    invisible to the discovery regex; each WRITING_RPCS wrapper-call-site file must independently
 *    carry a revalidate or an exemption.
 *
 * Multi-write files record `revalidateBranches` (distinct revalidate call sites expected); the
 * AUTHORITATIVE per-branch proof is the per-site UNIT tests (Tasks 5–9) — this is the structural
 * backstop, not a substitute.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");

type Disposition = "revalidate" | "exempt";

type RegistryEntry = {
  file: string; // repo-relative POSIX path
  siteCount: number; // expected `\b`-anchored raw-SQL write-LINE count (0 for RPC-wrapper/core-routed)
  disposition: Disposition;
  reason?: string;
  revalidateBranches?: number; // multi-write files: distinct revalidate call sites expected
  // A library whose raw-SQL write is real, but whose POST-COMMIT revalidate lives at its Next
  // callers (which own the lock/tx boundary). The registry layer verifies those caller files
  // revalidate instead of requiring an in-file call. Each listed caller must itself be a registered
  // disposition:"revalidate" entry.
  coveredByCallers?: string[];
};

// Built from the ACTUAL implemented state (Tasks 5–9). Each discovered raw-SQL write file appears
// with its live `\b`-count; revalidate files that route their writes through the shared apply core
// / an RPC (no raw SQL) appear with siteCount 0.
const REVALIDATE_REGISTRY: RegistryEntry[] = [
  // ---- Task 5 (sync chokepoint callers) — already shipped before this milestone's Tasks 6–9 ----
  {
    file: "lib/sync/runScheduledCronSync.ts",
    siteCount: 19,
    disposition: "revalidate",
    revalidateBranches: 2, // processOneFile apply tail + markMissingShow loop
    reason:
      "sync apply spine; revalidateShowFromResult(result) (cron loop) + revalidateShow(missing show)",
  },
  {
    file: "lib/sync/runManualSyncForShow.ts",
    siteCount: 1,
    disposition: "revalidate",
    reason: "manual sync caller; revalidateOnApplied post-withPipelineLock",
  },
  {
    file: "lib/sync/runPushSyncForShow.ts",
    siteCount: 0,
    disposition: "revalidate",
    reason: "push runner; revalidateOnApplied post-processOneFile (writes route through the core)",
  },
  {
    file: "app/api/admin/pending-ingestions/[id]/retry/route.ts",
    siteCount: 0,
    disposition: "revalidate",
    reason: "live retry route; revalidateShow post-withRowTryLock (apply routes through the core)",
  },
  {
    file: "app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts",
    siteCount: 0,
    disposition: "exempt",
    reason: "onboarding retry route — Task 5 EXEMPT (no served crew cache for unpublished interim)",
  },
  // ---- Task 6 (onboarding finalize) ----
  {
    file: "app/api/admin/onboarding/finalize/route.ts",
    siteCount: 0,
    disposition: "revalidate",
    reason:
      "first-seen apply routes through applyStagedCore (no raw read-table SQL; its only \\b-match is " +
      "shows_pending_changes, excluded); revalidateShow(core.showId) post-withTx",
  },
  {
    file: "app/api/admin/onboarding/finalize-cas/route.ts",
    siteCount: 1,
    disposition: "revalidate",
    reason:
      "the publish flip (update public.shows); revalidateShow(applied shadow + flipped) post-withTx",
  },
  // ---- Task 7 (diagram promote + asset recovery + staged apply) ----
  {
    file: "lib/sync/promoteSnapshot.ts",
    siteCount: 3,
    disposition: "revalidate",
    revalidateBranches: 2, // promoteSnapshotUpload (promoted) + repairSnapshotRollback (repaired)
    reason: "shows.diagrams cutover/rollback; revalidateShow post-withPromoteLock",
  },
  {
    file: "lib/sync/assetRecovery.ts",
    siteCount: 1,
    disposition: "revalidate",
    reason: "shows.diagrams recovery; revalidateShow in runAssetRecoveryCron post-recover",
  },
  {
    file: "lib/sync/applyStaged.ts",
    siteCount: 1,
    disposition: "revalidate",
    reason:
      "live applied path (runPhase2 mutates show/crew); revalidateShow(result.showId) post-pipeline-lock. " +
      "Wizard path exempt (writes staging only — finalize-cas applies + revalidates).",
  },
  // ---- Task 8 (lifecycle actions) ----
  {
    file: "app/admin/show/[slug]/_actions/publish.ts",
    siteCount: 0,
    disposition: "revalidate",
    reason: "publish_show RPC wrapper; revalidateShow(resolved.show.id) on ok",
  },
  {
    file: "app/admin/show/[slug]/_actions/archive.ts",
    siteCount: 0,
    disposition: "revalidate",
    reason: "archive_show RPC wrapper; revalidateShow(resolved.show.id) on ok",
  },
  {
    file: "app/admin/show/[slug]/_actions/unarchive.ts",
    siteCount: 0,
    disposition: "revalidate",
    reason: "unarchive_show RPC wrapper; revalidateShow(resolved.show.id) on ok",
  },
  {
    file: "app/admin/show/[slug]/_actions/undoAutoPublish.ts",
    siteCount: 0,
    disposition: "revalidate",
    reason: "unpublishShow caller; revalidateShow(result.showId) on success",
  },
  // ---- Task 9 (feed + unpublish + validation + exemptions) ----
  {
    file: "app/admin/show/[slug]/_actions/feed.ts",
    siteCount: 0,
    disposition: "revalidate",
    reason:
      "mi11Approve + undoChange revalidate the server-resolved showId; mi11Reject exempt " +
      "(suppresses a HELD change — crew projection unchanged)",
  },
  {
    file: "app/api/show/[slug]/unpublish/route.ts",
    siteCount: 0,
    disposition: "revalidate",
    reason: "unpublishShowViaEmailedLink caller; revalidateShow(result.showId) on success",
  },
  {
    file: "app/show/[slug]/unpublish/actions.ts",
    siteCount: 0,
    disposition: "revalidate",
    reason: "confirm-page unpublish caller; revalidateShow(result.showId) on success",
  },
  {
    file: "lib/sync/unpublishShow.ts",
    siteCount: 2,
    disposition: "revalidate",
    coveredByCallers: [
      "app/api/show/[slug]/unpublish/route.ts",
      "app/show/[slug]/unpublish/actions.ts",
      "app/admin/show/[slug]/_actions/undoAutoPublish.ts",
    ],
    reason:
      "the show update(published/archive) lives here, but revalidate is at its Next callers " +
      "(unpublish route + confirm action + undoAutoPublish), which own the post-commit boundary",
  },
  {
    file: "lib/sync/discardStaged.ts",
    siteCount: 1,
    disposition: "revalidate",
    reason:
      "live restore-status discard reverts shows.last_sync_status (projected); wrapper revalidates post-lock",
  },
  {
    file: "lib/sync/holds/mi11GateActions.ts",
    siteCount: 0,
    disposition: "revalidate",
    reason:
      "mi11_approve_hold wrapper surfaces showId for feed.ts; mi11_reject_hold exempt (suppress-only)",
  },
  {
    file: "lib/sync/holds/undoChange.ts",
    siteCount: 0,
    disposition: "revalidate",
    reason: "undo_change wrapper surfaces showId for feed.ts (reverts crew identity)",
  },
  {
    file: "app/admin/settings/_actions/validationReset.ts",
    siteCount: 0,
    disposition: "exempt",
    reason:
      "bulk all-shows wipe/reseed, no per-show id; validation-only; revalidatePath covers admin",
  },
  {
    file: "lib/onboarding/sessionLifecycle.ts",
    siteCount: 2,
    disposition: "exempt",
    reason: "deletes only published=false interim shows — no served crew cache to bust",
  },
];

// Writes that flow through a SECURITY DEFINER RPC (no raw SQL in JS) → invisible to the discovery
// regex. Each wrapper-call-site file must independently revalidate or be exempt. (Picker/share-token
// RPCs mutate auth/picker columns NOT in the DATA projection → exempt.)
const WRITING_RPCS: Array<{ rpc: string; wrapperFile: string }> = [
  { rpc: "publish_show", wrapperFile: "app/admin/show/[slug]/_actions/publish.ts" },
  { rpc: "archive_show", wrapperFile: "app/admin/show/[slug]/_actions/archive.ts" },
  { rpc: "unarchive_show", wrapperFile: "app/admin/show/[slug]/_actions/unarchive.ts" },
  { rpc: "mi11_approve_hold", wrapperFile: "lib/sync/holds/mi11GateActions.ts" },
  { rpc: "mi11_reject_hold", wrapperFile: "lib/sync/holds/mi11GateActions.ts" },
  { rpc: "undo_change", wrapperFile: "lib/sync/holds/undoChange.ts" },
  { rpc: "reset_validation_data", wrapperFile: "app/admin/settings/_actions/validationReset.ts" },
  { rpc: "rotate_show_share_token", wrapperFile: "lib/auth/picker/rotateShareToken.ts" },
  { rpc: "reset_picker_epoch_atomic", wrapperFile: "lib/auth/picker/resetPickerEpoch.ts" },
];

// Picker/share-token wrappers: mutate picker/auth columns NOT in the getShowForViewer DATA
// projection → exempt (carry the waiver comment).
const RPC_EXEMPT_FILES = new Set([
  "lib/auth/picker/rotateShareToken.ts",
  "lib/auth/picker/resetPickerEpoch.ts",
  "app/admin/settings/_actions/validationReset.ts",
]);

// ---------------------------------------------------------------------------
// Discovery: walk lib + app, count `\b`-anchored raw-SQL write LINES + the .from() builder form.
// ---------------------------------------------------------------------------

const READ_TABLES =
  "shows|crew_members|hotel_reservations|rooms|transportation|contacts|shows_internal";
const RAW_SQL_RE = new RegExp(
  `(insert into|update|delete from)\\s+public\\.(${READ_TABLES})\\b`,
  "i",
);
const BUILDER_RE = new RegExp(
  `\\.from\\("(${READ_TABLES})"\\)\\s*\\.\\s*(insert|update|upsert|delete)`,
);

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "__generated__") continue;
      walk(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    out.push(full);
  }
}

function isExcluded(relPosix: string): boolean {
  return (
    relPosix.includes("/tests/") ||
    /\.test\.tsx?$/.test(relPosix) ||
    relPosix.startsWith("lib/audit/") ||
    relPosix.includes("/audit/") ||
    relPosix.endsWith("noGlobalCursor.ts") ||
    relPosix.includes("watermark")
  );
}

function discoverWriteSites(): Map<string, number> {
  const files: string[] = [];
  walk(join(REPO_ROOT, "lib"), files);
  walk(join(REPO_ROOT, "app"), files);
  const counts = new Map<string, number>();
  for (const full of files) {
    const relPosix = full
      .slice(REPO_ROOT.length + 1)
      .split("\\")
      .join("/");
    if (isExcluded(relPosix)) continue;
    const src = readFileSync(full, "utf8");
    let n = 0;
    for (const line of src.split("\n")) {
      if (RAW_SQL_RE.test(line) || BUILDER_RE.test(line)) n += 1;
    }
    if (n > 0) counts.set(relPosix, n);
  }
  return counts;
}

function readRegistered(file: string): string {
  return readFileSync(join(REPO_ROOT, file), "utf8");
}

const REVALIDATE_CALL_RE =
  /revalidateShow(FromResult)?\(|revalidateOnApplied\(|revalidateTag\(\s*showCacheTag\(|revalidateTag\(\s*[`'"]show-/;

describe("show-cache revalidate coverage — registry layer", () => {
  test.each(REVALIDATE_REGISTRY.filter((e) => e.disposition === "revalidate"))(
    "$file calls a show-tag revalidate (revalidate disposition)",
    (entry) => {
      if (entry.coveredByCallers) {
        // The write lives in this library, but the POST-COMMIT revalidate is at its Next callers.
        // Verify each named caller is a registered revalidate entry AND actually revalidates.
        for (const caller of entry.coveredByCallers) {
          const callerEntry = REVALIDATE_REGISTRY.find((e) => e.file === caller);
          expect(
            callerEntry?.disposition,
            `${entry.file}.coveredByCallers names ${caller}, which is not a registered revalidate entry`,
          ).toBe("revalidate");
          expect(
            REVALIDATE_CALL_RE.test(readRegistered(caller)),
            `${entry.file} is covered-by-callers, but caller ${caller} contains no show-tag revalidate`,
          ).toBe(true);
        }
        return;
      }
      const src = readRegistered(entry.file);
      expect(
        REVALIDATE_CALL_RE.test(src),
        `${entry.file} is registered disposition:"revalidate" but contains no ` +
          `revalidateShow/revalidateOnApplied/revalidateTag(showCacheTag|"show-") call`,
      ).toBe(true);
    },
  );

  test.each(REVALIDATE_REGISTRY.filter((e) => e.disposition === "exempt"))(
    "$file carries a not-subject-to-revalidate waiver (exempt disposition)",
    (entry) => {
      const src = readRegistered(entry.file);
      expect(
        src.includes("not-subject-to-revalidate"),
        `${entry.file} is registered disposition:"exempt" but has no // not-subject-to-revalidate comment`,
      ).toBe(true);
    },
  );

  test("multi-write revalidate files contain at least revalidateBranches distinct revalidate calls", () => {
    for (const entry of REVALIDATE_REGISTRY) {
      if (entry.disposition !== "revalidate" || !entry.revalidateBranches) continue;
      const src = readRegistered(entry.file);
      const calls = (src.match(/revalidateShow(FromResult)?\(|revalidateOnApplied\(/g) ?? [])
        .length;
      expect(
        calls,
        `${entry.file} expects >= ${entry.revalidateBranches} revalidate call sites, found ${calls}`,
      ).toBeGreaterThanOrEqual(entry.revalidateBranches);
    }
  });
});

describe("show-cache revalidate coverage — discovery layer (site-count)", () => {
  const discovered = discoverWriteSites();
  const registryByFile = new Map(REVALIDATE_REGISTRY.map((e) => [e.file, e]));

  test("every discovered raw-SQL write file is registered", () => {
    const unregistered = [...discovered.keys()].filter((f) => !registryByFile.has(f));
    expect(
      unregistered,
      `New show-data write FILE(s) not in REVALIDATE_REGISTRY: ${unregistered.join(", ")}. ` +
        `Add a revalidateShow + a registry row (or an exemption).`,
    ).toEqual([]);
  });

  test("each discovered file's live write-LINE count equals its registered siteCount", () => {
    const mismatches: string[] = [];
    for (const [file, found] of discovered) {
      const entry = registryByFile.get(file);
      if (!entry) continue; // covered by the previous test
      if (entry.siteCount !== found) {
        mismatches.push(`${file}: registered ${entry.siteCount}, found ${found}`);
      }
    }
    expect(
      mismatches,
      `Show-data write-site count drift — a new raw-SQL write in an already-registered file: ` +
        `${mismatches.join("; ")}. Add a revalidateTag + bump siteCount, or exempt the new site.`,
    ).toEqual([]);
  });

  test("registry siteCount>0 entries are actually discovered (no stale counts)", () => {
    const stale: string[] = [];
    for (const entry of REVALIDATE_REGISTRY) {
      if (entry.siteCount > 0 && !discovered.has(entry.file)) {
        stale.push(`${entry.file} (registered ${entry.siteCount}, discovered 0)`);
      }
    }
    expect(stale, `Stale siteCount registry rows: ${stale.join(", ")}`).toEqual([]);
  });
});

describe("show-cache revalidate coverage — RPC-wrapper layer", () => {
  test("each WRITING_RPCS wrapper-call-site file revalidates or is exempt", () => {
    const offenders: string[] = [];
    for (const { rpc, wrapperFile } of WRITING_RPCS) {
      const src = readRegistered(wrapperFile);
      // Confirm the wrapper actually calls this RPC (keeps the registry honest).
      expect(
        src.includes(rpc),
        `${wrapperFile} no longer calls rpc("${rpc}") — update WRITING_RPCS`,
      ).toBe(true);
      const revalidates = REVALIDATE_CALL_RE.test(src);
      const exempt = RPC_EXEMPT_FILES.has(wrapperFile) || src.includes("not-subject-to-revalidate");
      if (!revalidates && !exempt) {
        offenders.push(`${wrapperFile} (rpc ${rpc})`);
      }
    }
    expect(
      offenders,
      `RPC wrapper-call-site files with neither a show-tag revalidate nor an exemption: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
