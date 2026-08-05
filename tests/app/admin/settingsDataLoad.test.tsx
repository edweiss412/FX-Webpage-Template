// @vitest-environment jsdom
// Nav-perf Phase 1, Task 8 (A3). The settings page collapses the four
// sequential app_settings getter awaits into ONE getSettingsPageFlags()
// happy-path read, run in parallel with the two independent top-level loaders
// (fetchDriveConnectionHealth + fetchEmbeddedAdminEmails). On a flags
// infra_error it FALLS BACK to the four single getters in parallel with
// per-toggle isolation: a single failing column degrades ONLY its toggle; the
// rest render their real values.
//
// Non-tautological coverage:
//  (a) happy path — the 4 toggle initials are derived from getSettingsPageFlags
//      (NOT the single getters; those are asserted not-called on the happy path).
//  (b) per-toggle isolation — flags→infra_error but the 4 single getters return
//      a MIX (one infra_error, the rest values): only the failing toggle
//      degrades; the others render their REAL values (not all four degraded).
//  (c) total failure — flags infra_error AND all 4 getters infra_error: every
//      toggle degrades gracefully (no crash).
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: async () => {},
  requireAdminIdentity: async () => ({ email: "admin@example.com" }),
}));
vi.mock("@/lib/onboarding/serverActions", () => ({
  rerunSetupServerAction: async () => {},
}));
vi.mock("@/lib/time/now", () => ({
  nowDate: async () => new Date("2026-06-01T12:00:00.000Z"),
}));
// Backoff spec §3.6: the page's separate service-role state read must never
// fire in the DB-free project; null keeps the panel's sentence unrendered.
vi.mock("@/lib/admin/watchSurfaceState", () => ({
  readWatchSurfaceState: vi.fn(async () => null),
}));
vi.mock("@/lib/admin/driveConnectionHealth", () => ({
  fetchDriveConnectionHealth: vi.fn(async () => ({
    health: "positive" as const,
    folderName: "Show Sheets",
    folderId: "folder-123",
    syncingCount: 3,
    attentionCount: 0,
    lastReadAt: "2026-06-01T11:00:00.000Z",
  })),
}));
vi.mock("@/lib/admin/embeddedAdminEmails", () => ({
  fetchEmbeddedAdminEmails: vi.fn(async () => ({
    kind: "ok" as const,
    rows: [
      {
        email: "admin@example.com",
        added_by: null,
        added_at: "2026-05-01T00:00:00.000Z",
        revoked_by: null,
        revoked_at: null,
        note: null,
      },
    ],
  })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/settings",
}));

// The single-read happy path + the four fallback getters. Each is a fresh spy
// per test so we can drive flags vs. fallback independently and assert which
// path the page took.
const flags = vi.hoisted(() => ({ getSettingsPageFlags: vi.fn() }));
const getters = vi.hoisted(() => ({
  getAutoPublishCleanFirstSeen: vi.fn(),
  getAlertOnSyncProblems: vi.fn(),
  getDailyReviewDigest: vi.fn(),
  getAlertOnAutoPublish: vi.fn(),
}));

vi.mock("@/lib/appSettings/getSettingsPageFlags", () => ({
  getSettingsPageFlags: flags.getSettingsPageFlags,
}));
vi.mock("@/lib/appSettings/getAutoPublishCleanFirstSeen", () => ({
  getAutoPublishCleanFirstSeen: getters.getAutoPublishCleanFirstSeen,
}));
vi.mock("@/lib/appSettings/getAlertOnSyncProblems", () => ({
  getAlertOnSyncProblems: getters.getAlertOnSyncProblems,
}));
vi.mock("@/lib/appSettings/getDailyReviewDigest", () => ({
  getDailyReviewDigest: getters.getDailyReviewDigest,
}));
vi.mock("@/lib/appSettings/getAlertOnAutoPublish", () => ({
  getAlertOnAutoPublish: getters.getAlertOnAutoPublish,
}));

async function renderSettings() {
  const mod = await import("@/app/admin/settings/page");
  render(await mod.default());
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

/**
 * The not-degraded state, for a note that is now ALWAYS MOUNTED.
 *
 * These four assertions used to read `queryByTestId(...).not.toBeInTheDocument()`.
 * BL-ANNOUNCE-REGION-UNMOUNT-CLASS made the note a permanent `role="status"`
 * region — a region inserted together with its text is never announced, and a
 * degraded state that arrives after first paint is exactly when the
 * announcement matters — so absence is no longer the healthy shape.
 *
 * This is a STRONGER check than the one it replaces, not a weaker accommodation:
 * it pins that the region is present (so it can announce later), silent (no
 * copy), and visually gone (`sr-only`). The old assertion could not tell a
 * healthy toggle from a note that had been deleted outright.
 */
function expectNotDegraded(testId: string): void {
  const el = screen.getByTestId(testId);
  expect(el, `${testId} must stay mounted so a later degrade can announce`).toBeInTheDocument();
  expect(el.className, `${testId} must be visually hidden when healthy`).toContain("sr-only");
  expect(el.textContent ?? "", `${testId} must carry no copy when healthy`).toBe("");
}

describe("Settings page data load (Task 8 / A3)", () => {
  it("happy path: derives all four toggle initials from getSettingsPageFlags, not the single getters", async () => {
    flags.getSettingsPageFlags.mockResolvedValue({
      kind: "value",
      autoPublishCleanFirstSeen: true,
      alertOnSyncProblems: true,
      dailyReviewDigest: false,
      alertOnAutoPublish: true,
    });

    await renderSettings();

    // One single-read; the four single getters are NOT touched on the happy path.
    expect(flags.getSettingsPageFlags).toHaveBeenCalledTimes(1);
    expect(getters.getAutoPublishCleanFirstSeen).not.toHaveBeenCalled();
    expect(getters.getAlertOnSyncProblems).not.toHaveBeenCalled();
    expect(getters.getDailyReviewDigest).not.toHaveBeenCalled();
    expect(getters.getAlertOnAutoPublish).not.toHaveBeenCalled();

    // The four toggle initials reflect the flags result exactly.
    expect(screen.getByTestId("alert-on-sync-problems-toggle").getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(screen.getByTestId("daily-review-digest-toggle").getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(screen.getByTestId("alert-on-auto-publish-toggle").getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(screen.getByTestId("auto-publish-toggle").getAttribute("aria-checked")).toBe("true");
    // Nothing degraded on the happy path.
    expectNotDegraded("auto-publish-degraded");
    expectNotDegraded("alert-on-sync-problems-degraded");
    expectNotDegraded("daily-review-digest-degraded");
    expectNotDegraded("alert-on-auto-publish-degraded");
  });

  it("per-toggle isolation: flags infra_error + a MIX of getters → only the failing toggle degrades", async () => {
    flags.getSettingsPageFlags.mockResolvedValue({ kind: "infra_error" });
    // Mix: auto-publish=real OFF, sync=infra_error (the ONLY failure),
    // digest=real ON, alert-on-auto-publish=real ON.
    getters.getAutoPublishCleanFirstSeen.mockResolvedValue({ kind: "value", autoPublish: false });
    getters.getAlertOnSyncProblems.mockResolvedValue({ kind: "infra_error" });
    getters.getDailyReviewDigest.mockResolvedValue({ kind: "value", enabled: true });
    getters.getAlertOnAutoPublish.mockResolvedValue({ kind: "value", enabled: true });

    await renderSettings();

    // Fallback path engaged: all four single getters were consulted.
    expect(getters.getAutoPublishCleanFirstSeen).toHaveBeenCalledTimes(1);
    expect(getters.getAlertOnSyncProblems).toHaveBeenCalledTimes(1);
    expect(getters.getDailyReviewDigest).toHaveBeenCalledTimes(1);
    expect(getters.getAlertOnAutoPublish).toHaveBeenCalledTimes(1);

    // ONLY the sync toggle degrades.
    expect(screen.getByTestId("alert-on-sync-problems-degraded")).toBeInTheDocument();

    // The other three render their REAL values — NOT degraded.
    expectNotDegraded("daily-review-digest-degraded");
    expect(screen.getByTestId("daily-review-digest-toggle").getAttribute("aria-checked")).toBe(
      "true",
    );
    expectNotDegraded("alert-on-auto-publish-degraded");
    expect(screen.getByTestId("alert-on-auto-publish-toggle").getAttribute("aria-checked")).toBe(
      "true",
    );
    // Auto-publish: real OFF (not degraded) → the off-explainer renders, no degraded notice.
    expectNotDegraded("auto-publish-degraded");
    expect(screen.getByTestId("auto-publish-off-explainer")).toBeInTheDocument();
    expect(screen.getByTestId("auto-publish-toggle").getAttribute("aria-checked")).toBe("false");
  });

  it("total failure: flags infra_error AND all four getters infra_error → every toggle degrades, no crash", async () => {
    flags.getSettingsPageFlags.mockResolvedValue({ kind: "infra_error" });
    getters.getAutoPublishCleanFirstSeen.mockResolvedValue({ kind: "infra_error" });
    getters.getAlertOnSyncProblems.mockResolvedValue({ kind: "infra_error" });
    getters.getDailyReviewDigest.mockResolvedValue({ kind: "infra_error" });
    getters.getAlertOnAutoPublish.mockResolvedValue({ kind: "infra_error" });

    await renderSettings();

    expect(screen.getByTestId("auto-publish-degraded")).toBeInTheDocument();
    expect(screen.getByTestId("alert-on-sync-problems-degraded")).toBeInTheDocument();
    expect(screen.getByTestId("daily-review-digest-degraded")).toBeInTheDocument();
    expect(screen.getByTestId("alert-on-auto-publish-degraded")).toBeInTheDocument();
    // All report OFF when degraded (fail-closed, never a silent wrong ON).
    expect(screen.getByTestId("auto-publish-toggle").getAttribute("aria-checked")).toBe("false");
  });
});
