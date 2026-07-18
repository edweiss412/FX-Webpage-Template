/**
 * Unit tests for the per-code alert action registry (spec §4, §7.3, §8.1).
 * Every expected href is derived from the fixture's field values — never an
 * independent constant. Failure modes caught: URL template regression; a
 * guard bypass rendering javascript:/non-GitHub orphan_url; dot-segment or
 * placeholder repo values producing a wrong GitHub target.
 */
import { describe, expect, it } from "vitest";
import { resolveAlertAction, resolveAlertActions } from "@/lib/adminAlerts/alertActions";

const slugOpts = { slug: "east-coast" };
const noSlug = { slug: null };

describe("share-access group (spec §4 #1-#3)", () => {
  it("SHOW_FIRST_PUBLISHED builds the share-access fragment href from the slug", () => {
    const action = resolveAlertAction("SHOW_FIRST_PUBLISHED", {}, slugOpts);
    expect(action).toEqual({
      label: "Go to Published toggle",
      href: `/admin/show/${encodeURIComponent(slugOpts.slug)}#share-access`,
      external: false,
    });
  });
  it("PICKER_EPOCH_RESET and PICKER_SELECTION_RACE share the Share & access target", () => {
    for (const code of ["PICKER_EPOCH_RESET", "PICKER_SELECTION_RACE"]) {
      const action = resolveAlertAction(code, null, slugOpts);
      expect(action).toEqual({
        label: "Go to Share & access",
        href: `/admin/show/${encodeURIComponent(slugOpts.slug)}#share-access`,
        external: false,
      });
    }
  });
  it("slug null/empty/whitespace → null (guard table §7.3)", () => {
    expect(resolveAlertAction("SHOW_FIRST_PUBLISHED", {}, noSlug)).toBeNull();
    expect(resolveAlertAction("PICKER_EPOCH_RESET", {}, { slug: "" })).toBeNull();
    expect(resolveAlertAction("PICKER_SELECTION_RACE", {}, { slug: "   " })).toBeNull();
  });
  it("slug needing encoding is percent-encoded", () => {
    const action = resolveAlertAction("SHOW_FIRST_PUBLISHED", {}, { slug: "a b/c" });
    expect(action?.href).toBe(`/admin/show/${encodeURIComponent("a b/c")}#share-access`);
  });
});

describe("sheet links (spec §4 #4-#5)", () => {
  it("ROLE_FLAGS_NOTICE builds a sheet deep link from context.drive_file_id", () => {
    const drive_file_id = "df-123";
    const action = resolveAlertAction("ROLE_FLAGS_NOTICE", { drive_file_id }, noSlug);
    expect(action).toEqual({
      label: "Open in Sheet",
      href: `https://docs.google.com/spreadsheets/d/${drive_file_id}/edit#gid=0`,
      external: true,
    });
  });
  it("ROLE_FLAGS_NOTICE guards: null context, absent field, non-string, empty", () => {
    expect(resolveAlertAction("ROLE_FLAGS_NOTICE", null, noSlug)).toBeNull();
    expect(resolveAlertAction("ROLE_FLAGS_NOTICE", {}, noSlug)).toBeNull();
    expect(resolveAlertAction("ROLE_FLAGS_NOTICE", { drive_file_id: 42 }, noSlug)).toBeNull();
    expect(
      resolveAlertAction("ROLE_FLAGS_NOTICE", { drive_file_id: { id: "x" } }, noSlug),
    ).toBeNull();
    expect(resolveAlertAction("ROLE_FLAGS_NOTICE", { drive_file_id: "  " }, noSlug)).toBeNull();
  });
  it("LIVE_ROW_CONFLICT prefers the sheet link when drive_file_id present", () => {
    const drive_file_id = "df-456";
    const action = resolveAlertAction(
      "LIVE_ROW_CONFLICT",
      { drive_file_id, folder_id: "fold-9" },
      noSlug,
    );
    expect(action).toEqual({
      label: "Open in Sheet",
      href: `https://docs.google.com/spreadsheets/d/${drive_file_id}/edit#gid=0`,
      external: true,
    });
  });
  it("LIVE_ROW_CONFLICT falls back to the Drive folder when only folder_id present", () => {
    const folder_id = "fold-9";
    const action = resolveAlertAction("LIVE_ROW_CONFLICT", { folder_id }, noSlug);
    expect(action).toEqual({
      label: "Open Drive folder",
      href: `https://drive.google.com/drive/folders/${encodeURIComponent(folder_id)}`,
      external: true,
    });
  });
  it("LIVE_ROW_CONFLICT with neither field → null", () => {
    expect(resolveAlertAction("LIVE_ROW_CONFLICT", {}, noSlug)).toBeNull();
    expect(resolveAlertAction("LIVE_ROW_CONFLICT", null, noSlug)).toBeNull();
  });
  it("LIVE_ROW_CONFLICT per-field guards (§7.3): wrong-type/empty drive_file_id falls back; bad folder_id → null", () => {
    const folder_id = "fold-9";
    // Wrong-type or empty drive_file_id is IGNORED (str → null) → folder fallback.
    for (const badDrive of [42, { id: "x" }, "  "]) {
      const action = resolveAlertAction(
        "LIVE_ROW_CONFLICT",
        { drive_file_id: badDrive, folder_id },
        noSlug,
      );
      expect(action?.href).toBe(
        `https://drive.google.com/drive/folders/${encodeURIComponent(folder_id)}`,
      );
    }
    // Bad folder_id with no drive_file_id → no link at all.
    for (const badFolder of [7, ["a"], "   "]) {
      expect(resolveAlertAction("LIVE_ROW_CONFLICT", { folder_id: badFolder }, noSlug)).toBeNull();
    }
  });
});

describe("wizard link (spec §4 #6)", () => {
  it("WIZARD_SESSION_SUPERSEDED_RACE is a static internal route", () => {
    expect(resolveAlertAction("WIZARD_SESSION_SUPERSEDED_RACE", null, noSlug)).toEqual({
      label: "Go to setup wizard",
      href: "/admin/onboarding",
      external: false,
    });
  });
});

describe("GitHub issue link (spec §4 #7) — URL allow-list", () => {
  const orphan_url = "https://github.com/edweiss412/FX-Webpage-Template/issues/99";
  it("renders the context URL verbatim when it passes the https://github.com/ prefix", () => {
    const action = resolveAlertAction("REPORT_ORPHANED_LOST_LEASE", { orphan_url }, noSlug);
    expect(action).toEqual({ label: "Open GitHub issue", href: orphan_url, external: true });
  });
  it.each([
    ["javascript:alert(1)"],
    ["http://github.com/owner/repo/issues/1"],
    ["https://github.evil.com/x"],
    ["https://gitlab.com/owner/repo"],
    [""],
  ])("rejects %s", (bad) => {
    expect(
      resolveAlertAction("REPORT_ORPHANED_LOST_LEASE", { orphan_url: bad }, noSlug),
    ).toBeNull();
  });
  it("absent / non-string orphan_url → null", () => {
    expect(resolveAlertAction("REPORT_ORPHANED_LOST_LEASE", {}, noSlug)).toBeNull();
    expect(resolveAlertAction("REPORT_ORPHANED_LOST_LEASE", { orphan_url: 7 }, noSlug)).toBeNull();
    expect(resolveAlertAction("REPORT_ORPHANED_LOST_LEASE", null, noSlug)).toBeNull();
  });
});

describe("branch settings links (spec §4 #8-#9) — segment guard", () => {
  const repo = "edweiss412/FX-Webpage-Template";
  it.each(["BRANCH_PROTECTION_DRIFT", "BRANCH_PROTECTION_MONITOR_AUTH_FAILED"])(
    "%s builds the settings URL from a valid owner/name repo",
    (code) => {
      expect(resolveAlertAction(code, { repo }, noSlug)).toEqual({
        label: "Open branch settings",
        href: `https://github.com/${repo}/settings/branches`,
        external: true,
      });
    },
  );
  // The four spec-mandated null-case literals (§8.1) + structural rejects —
  // asserted against BOTH branch-protection codes (spec §4 gives #9 the same
  // guards as #8; a drift-only guard must fail here).
  const BRANCH_CODES = ["BRANCH_PROTECTION_DRIFT", "BRANCH_PROTECTION_MONITOR_AUTH_FAILED"];
  it.each([
    ["owner/.."],
    ["owner/."],
    ["./repo"],
    ["owner/repo"], // producer's missing-env placeholder (verify-branch-protection.ts:49-50)
    ["justowner"],
    ["a/b/c"],
    ["own er/repo"],
    ["owner./repo"], // dot in owner segment — GitHub owner charset has no dots
    [""],
  ])("both codes reject %s", (bad) => {
    for (const code of BRANCH_CODES) {
      expect(resolveAlertAction(code, { repo: bad }, noSlug), code).toBeNull();
    }
  });
  it("non-string repo → null for both codes", () => {
    for (const code of BRANCH_CODES) {
      expect(resolveAlertAction(code, { repo: ["a", "b"] }, noSlug), code).toBeNull();
    }
  });
});

describe("RESYNC_SHRINK_HELD (re-sync quality gate, audit #3)", () => {
  // Failure mode: an unregistered code → resolveAlertAction returns null → the held-shrink alert
  // has no "accept" affordance and the admin must hunt for the ReSyncButton control.
  it("builds the #resync fragment href from the slug", () => {
    expect(resolveAlertAction("RESYNC_SHRINK_HELD", {}, slugOpts)).toEqual({
      label: "Review & re-sync",
      href: `/admin/show/${encodeURIComponent(slugOpts.slug)}#resync`,
      external: false,
    });
  });
  it("→ null when slug missing/blank (fail-quiet, registry contract)", () => {
    expect(resolveAlertAction("RESYNC_SHRINK_HELD", {}, noSlug)).toBeNull();
    expect(resolveAlertAction("RESYNC_SHRINK_HELD", {}, { slug: "" })).toBeNull();
    expect(resolveAlertAction("RESYNC_SHRINK_HELD", {}, { slug: "   " })).toBeNull();
  });
});

describe("ONBOARDING_SHEET_UNREADABLE (setup-scan hard-fail folder alert)", () => {
  // Failure mode: an unregistered code → resolveAlertAction returns null → the "sheets
  // couldn't be read" alert points only at re-running setup, with no way to jump to the
  // folder where the offending sheets actually live.
  it("builds the Drive-folder link from context.folder_id", () => {
    const folder_id = "1iU80Y2mqYmkCuBQYer0TEF1fta6fDp1C";
    expect(resolveAlertAction("ONBOARDING_SHEET_UNREADABLE", { folder_id }, noSlug)).toEqual({
      label: "Open Drive folder",
      href: `https://drive.google.com/drive/folders/${encodeURIComponent(folder_id)}`,
      external: true,
    });
  });
  it.each([
    [undefined],
    [null],
    [{}],
    [{ folder_id: "" }],
    [{ folder_id: "   " }],
    [{ folder_id: 7 }],
  ])("→ null when folder_id absent/blank/non-string (%s)", (context) => {
    expect(
      resolveAlertAction(
        "ONBOARDING_SHEET_UNREADABLE",
        context as Record<string, unknown> | null,
        noSlug,
      ),
    ).toBeNull();
  });
});

describe("resolveAlertAction dispatch", () => {
  it("unregistered codes → null", () => {
    expect(resolveAlertAction("SHOW_UNPUBLISHED", { drive_file_id: "x" }, slugOpts)).toBeNull();
    expect(resolveAlertAction("", null, noSlug)).toBeNull();
    expect(resolveAlertAction("not_a_code", null, noSlug)).toBeNull();
  });
});

describe("resolveAlertActions (spec 2026-07-17 §3.4)", () => {
  it("ROLE_FLAGS_NOTICE with slug: show-page link leads, Open in Sheet second", () => {
    const actions = resolveAlertActions(
      "ROLE_FLAGS_NOTICE",
      { drive_file_id: "abc123" },
      { slug: "ria-forum" },
    );
    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({
      label: "Review in show page",
      href: "/admin/show/ria-forum",
      external: false,
    });
    expect(actions[1]?.label).toBe("Open in Sheet");
    expect(actions[1]?.external).toBe(true);
  });

  it("ROLE_FLAGS_NOTICE without slug: sheet link only", () => {
    const actions = resolveAlertActions(
      "ROLE_FLAGS_NOTICE",
      { drive_file_id: "abc123" },
      { slug: null },
    );
    expect(actions.map((a) => a.label)).toEqual(["Open in Sheet"]);
  });

  it("other codes delegate to the single resolver (0 or 1 element)", () => {
    expect(resolveAlertActions("SYNC_STALLED", null, { slug: null })).toEqual([]);
    const single = resolveAlertActions("PICKER_EPOCH_RESET", {}, { slug: "ria-forum" });
    expect(single).toHaveLength(1);
  });
});
