// tests/messages/_metaAlertActionsContract.test.ts
/**
 * Structural contract for the alert action registry
 * (spec docs/superpowers/specs/alerts/2026-07-04-alert-action-links.md §6).
 *
 * 1. Raise-site fidelity: every context field a builder consumes appears at
 *    that code's OWN raise expression (code literal and field in one bounded
 *    regex match — a whole-file grep would keep passing off a sibling log
 *    payload, e.g. lib/sync/runOnboardingScan.ts logSync at :824-829).
 * 2. Show-scoping pins: the four slug-dependent codes render only because
 *    their producers raise show-scoped rows; a showId: null refactor would
 *    silently kill the link while fixture-slug unit tests stay green.
 * 3. Target fidelity: the #share-access anchor and the /admin/onboarding
 *    route the internal links point at must exist on disk.
 * 4. Registry parity: exactly the spec's 11 codes (9 original + RESYNC_SHRINK_HELD,
 *    re-sync quality gate audit #3; + ONBOARDING_SHEET_UNREADABLE, setup-scan
 *    folder link), all members of the ADMIN_ALERTS_CODES universe.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { ALERT_ACTIONS, ALERT_ACTION_CODES } from "@/lib/adminAlerts/alertActions";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** Every .tsx under a directory — filesystem-walked so a NEW component that
 *  emits a duplicate anchor id fails by default rather than needing a list. */
function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walkFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

type RaiseSitePin = {
  code: string;
  file: string;
  pattern: RegExp; // MUST carry the g flag (matchAll requirement)
  expectedMatches: number;
  pins: string; // what property this row pins (for the test name)
};

const RAISE_SITE_PINS: RaiseSitePin[] = [
  {
    code: "ROLE_FLAGS_NOTICE",
    file: "lib/sync/phase2.ts",
    // `as const` anchors the CONSTRUCTOR (:422-431) — the bare literal also
    // matches the roleFlagsNotice TYPE definition at :120-127 (2 matches).
    pattern:
      /code: "ROLE_FLAGS_NOTICE" as const,[\s\S]{0,160}?context: \{[\s\S]{0,60}?drive_file_id:/g,
    expectedMatches: 1,
    pins: "drive_file_id enters the notice context at the constructor",
  },
  {
    code: "ROLE_FLAGS_NOTICE",
    file: "lib/sync/runScheduledCronSync.ts",
    pattern: /upsertAdminAlert\(result\.roleFlagsNotice\)/g,
    expectedMatches: 1,
    pins: "cron write boundary persists the constructed notice",
  },
  {
    code: "ROLE_FLAGS_NOTICE",
    file: "lib/sync/applyStaged.ts",
    pattern: /upsertAdminAlert\(result\.roleFlagsNotice\)/g,
    expectedMatches: 1,
    pins: "staged-apply write boundary persists the constructed notice",
  },
  {
    code: "LIVE_ROW_CONFLICT",
    file: "lib/sync/runOnboardingScan.ts",
    pattern:
      /code: LIVE_ROW_CONFLICT[\s\S]{0,300}?context: \{[\s\S]{0,160}?drive_file_id:[\s\S]{0,160}?folder_id:/g,
    expectedMatches: 1,
    pins: "drive_file_id + folder_id in the alert context (not the sibling logSync payload)",
  },
  {
    code: "REPORT_ORPHANED_LOST_LEASE",
    file: "lib/reports/submit.ts",
    pattern: /REPORT_ORPHANED_LOST_LEASE[\s\S]{0,700}?orphan_url:/g,
    expectedMatches: 1,
    pins: "orphan_url in the raw-INSERT context jsonb",
  },
  {
    code: "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
    file: "scripts/verify-branch-protection.ts",
    pattern: /repo,[\s\S]{0,260}?p_code: "BRANCH_PROTECTION_MONITOR_AUTH_FAILED"/g,
    expectedMatches: 3,
    pins: "repo in the context of ALL THREE auth-failure producer branches",
  },
  {
    code: "BRANCH_PROTECTION_DRIFT",
    file: "scripts/verify-branch-protection.ts",
    pattern: /\{ failures, repo, ts[\s\S]{0,260}?p_code: "BRANCH_PROTECTION_DRIFT"/g,
    expectedMatches: 1,
    pins: "repo in the drift context",
  },
  {
    code: "SHOW_FIRST_PUBLISHED",
    file: "lib/sync/runScheduledCronSync.ts",
    pattern: /showId: args\.result\.showId,[\s\S]{0,60}?code: "SHOW_FIRST_PUBLISHED"/g,
    expectedMatches: 1,
    pins: "show-scoped raise (slug-dependent link)",
  },
  {
    code: "PICKER_EPOCH_RESET",
    file: "lib/auth/picker/resetPickerEpoch.ts",
    pattern: /showId: input\.showId,[\s\S]{0,60}?code: "PICKER_EPOCH_RESET"/g,
    expectedMatches: 1,
    pins: "show-scoped raise (slug-dependent link)",
  },
  {
    code: "PICKER_SELECTION_RACE",
    file: "lib/auth/picker/cleanupStaleEntry.ts",
    pattern: /showId: input\.showId,[\s\S]{0,60}?code: "PICKER_SELECTION_RACE"/g,
    expectedMatches: 1,
    pins: "show-scoped raise (slug-dependent link)",
  },
  {
    // Re-sync quality gate (audit #3): the held-shrink alert action link is slug-dependent, so a
    // showId: null refactor would silently kill it. Pin the show-scoped raise at its own site.
    code: "RESYNC_SHRINK_HELD",
    file: "lib/sync/runScheduledCronSync.ts",
    pattern: /showId: show\.showId,[\s\S]{0,60}?code: "RESYNC_SHRINK_HELD"/g,
    expectedMatches: 1,
    pins: "show-scoped raise (slug-dependent link)",
  },
  {
    code: "RESYNC_QUALITY_REGRESSED",
    file: "lib/sync/runScheduledCronSync.ts",
    // Single terminal upsert in evaluateQualityRegression_unlocked. `showId,` shorthand → a
    // `showId: null` refactor stops matching, dropping expectedMatches to 0 (fails the pin).
    pattern: /showId,[\s\S]{0,80}?code: "RESYNC_QUALITY_REGRESSED"/g,
    expectedMatches: 1,
    pins: "show-scoped raise (per-show alert row; not a global showId:null collision)",
  },
  {
    code: "ONBOARDING_SHEET_UNREADABLE",
    file: "app/api/admin/onboarding/scan/route.ts",
    // The Drive-folder link builder consumes context.folder_id; pin it to THIS
    // alert's own raise expression. The sibling logAdminOutcome extra a few lines
    // above carries `folderId:` (camelCase) not `folder_id:`, so a whole-file
    // grep would false-pass — the bounded regex anchors the code literal to the
    // snake_case context field.
    pattern:
      /code: "ONBOARDING_SHEET_UNREADABLE",[\s\S]{0,120}?context: \{[\s\S]{0,120}?folder_id:/g,
    expectedMatches: 1,
    pins: "folder_id in the alert context (not the sibling logAdminOutcome folderId payload)",
  },
];

describe("alert-action registry ↔ raise-site fidelity", () => {
  test.each(RAISE_SITE_PINS)("$code — $pins ($file)", ({ file, pattern, expectedMatches }) => {
    const matches = Array.from(read(file).matchAll(pattern));
    expect(matches).toHaveLength(expectedMatches);
  });
});

describe("alert-action internal link targets exist", () => {
  test("the #share-access anchor exists on the show page (spec §4 #1-#3)", () => {
    // share-hub T4: the share/access region became the status band's ShareHub
    // popover, so the deep-link anchor moved onto the StatusStrip ROOT — an
    // unconditional element that renders in all three lifecycles, including
    // archived (where the hub itself is absent). Hosting it on the hub's own
    // trigger group would dead-link the alert action for archived shows.
    expect(read("components/admin/showpage/StatusStrip.tsx")).toMatch(/id="share-access"/);
    // EXACTLY one emitter, counted across the whole component tree — checking
    // presence here plus absence in one named file would still pass if the id
    // were duplicated onto the hub, its trigger group, or any other component,
    // which makes hash navigation resolve to whichever node comes first.
    const emitters = walkFiles(join(ROOT, "components")).filter((f) =>
      /id="share-access"/.test(readFileSync(f, "utf8")),
    );
    expect(emitters.map((f) => f.replace(ROOT, ""))).toEqual([
      "/components/admin/showpage/StatusStrip.tsx",
    ]);
  });
  test("the onboarding wizard route exists (spec §4 #6)", () => {
    expect(existsSync(join(ROOT, "app/admin/onboarding/page.tsx"))).toBe(true);
  });
});

describe("alert-action registry parity (spec §6.3)", () => {
  const SPEC_CODES = [
    "BRANCH_PROTECTION_DRIFT",
    "BRANCH_PROTECTION_MONITOR_AUTH_FAILED",
    "LIVE_ROW_CONFLICT",
    "ONBOARDING_SHEET_UNREADABLE",
    "PICKER_EPOCH_RESET",
    "PICKER_SELECTION_RACE",
    "REPORT_ORPHANED_LOST_LEASE",
    "RESYNC_SHRINK_HELD",
    "ROLE_FLAGS_NOTICE",
    "SHOW_FIRST_PUBLISHED",
    "WIZARD_SESSION_SUPERSEDED_RACE",
  ];
  test("registry keys equal exactly the spec's 11 codes", () => {
    expect(Object.keys(ALERT_ACTIONS).sort()).toEqual(SPEC_CODES);
    expect([...ALERT_ACTION_CODES].sort()).toEqual(SPEC_CODES);
  });
  test("every registry key is in the 45-code ADMIN_ALERTS_CODES universe", () => {
    // Parse the shared registry module's source — do NOT import a meta-test
    // (its top level registers tests; importing would re-register them here).
    // noUncheckedIndexedAccess: index accesses stay string | undefined, so
    // narrow via ?? "" after the runtime assertion.
    const source = read("tests/messages/adminAlertsRegistry.ts");
    const block = source.match(/export const ADMIN_ALERTS_CODES = \[([\s\S]*?)\] as const;/);
    const body = block?.[1] ?? "";
    expect(body.length).toBeGreaterThan(0);
    const universe = new Set(Array.from(body.matchAll(/"([A-Z0-9_]+)"/g), (m) => m[1] ?? ""));
    for (const code of ALERT_ACTION_CODES) {
      expect(universe.has(code), `${code} missing from ADMIN_ALERTS_CODES`).toBe(true);
    }
  });
});
