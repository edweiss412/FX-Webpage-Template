import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * POST /api/admin/onboarding/pull-sheet-override — accept/revoke route behavior
 * (spec §5.4, invariants 2/9/10). No DB: requireAdminIdentity + logAdminOutcome are
 * mocked at the module level; the fresh-detect, RPC caller, and re-scan are INJECTED
 * via deps so each branch (CAS match/mismatch, 40001, partial-success) is exercised
 * without Drive/Postgres. Response bodies are asserted with toEqual (anti-tautology:
 * a leaked or dropped key fails independent of the mock's raw result).
 */

const requireAdminIdentityMock = vi.fn(async (..._a: unknown[]) => ({
  email: "admin@example.com",
}));
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdminIdentity: (...a: unknown[]) => requireAdminIdentityMock(...a),
}));

const outcomeSpy = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/log/logAdminOutcome", () => ({
  logAdminOutcome: (...a: unknown[]) => outcomeSpy(...a),
}));

import type { ArchivedPullSheetTab } from "@/lib/drive/exportSheetToMarkdown";
import type { OverrideSnapshot } from "@/lib/sync/pullSheetOverride";

const { handlePullSheetOverride } =
  await import("@/app/api/admin/onboarding/pull-sheet-override/route");

const DRIVE = "d";
const SESSION = "11111111-1111-4111-8111-111111111111";
const TAB = "OLD PULL SHEET";

function reqWith(body: unknown): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/pull-sheet-override", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function tab(fingerprint: string): ArchivedPullSheetTab {
  return {
    tabName: TAB,
    headerPreviews: ["RIA-Chicago 4/15/24"],
    fingerprint,
    included: false,
    contentChangedSinceAccept: false,
  };
}

/** Deps factory. `serverFingerprint` drives the fresh detect; pass null for "no region". */
function makeDeps(opts: {
  serverFingerprint: string | null;
  rpc?: ReturnType<typeof vi.fn>;
  rescan?: ReturnType<typeof vi.fn>;
}) {
  const detect = vi.fn(
    async (_drive: string): Promise<ArchivedPullSheetTab[]> =>
      opts.serverFingerprint === null ? [] : [tab(opts.serverFingerprint)],
  );
  const rpc = opts.rpc ?? vi.fn(async (_p: unknown) => ({ data: { override: {} }, error: null }));
  const rescan = opts.rescan ?? vi.fn(async () => ({ status: "updated" as const }));
  return {
    deps: {
      detectArchivedTabs: detect,
      setPullSheetOverrideRpc: rpc as never,
      rescanWizardSheet: rescan as never,
    },
    detect,
    rpc,
    rescan,
  };
}

describe("POST /api/admin/onboarding/pull-sheet-override", () => {
  beforeEach(() => {
    requireAdminIdentityMock.mockReset();
    requireAdminIdentityMock.mockResolvedValue({ email: "admin@example.com" });
    outcomeSpy.mockReset();
    outcomeSpy.mockResolvedValue(undefined);
  });

  test("accept: server fingerprint === expectedFingerprint => RPC called with server-computed fingerprint, re-scan triggered", async () => {
    const { deps, rpc, rescan } = makeDeps({ serverFingerprint: "ee" });
    const res = await handlePullSheetOverride(
      reqWith({
        driveFileId: DRIVE,
        wizardSessionId: SESSION,
        tabName: TAB,
        expectedFingerprint: "ee",
        expectedOverrideSnapshot: null,
      }),
      deps,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "override_set" });
    expect(rpc).toHaveBeenCalledWith(
      expect.objectContaining({
        p_drive_file_id: DRIVE,
        p_wizard_session_id: SESSION,
        p_tab_name: TAB,
        p_fingerprint: "ee",
        p_accepted_by: "admin@example.com",
        p_expected_override_snapshot: null,
      }),
    );
    expect(rescan).toHaveBeenCalledWith(DRIVE, SESSION);
    expect(outcomeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ code: "PULL_SHEET_OVERRIDE_SET", actorEmail: "admin@example.com" }),
    );
  });

  test("accept: server fingerprint !== expectedFingerprint => 409 { status: 'stale_review' }, RPC NOT called (I3 CAS)", async () => {
    const { deps, rpc } = makeDeps({ serverFingerprint: "ee" });
    const res = await handlePullSheetOverride(
      reqWith({
        driveFileId: DRIVE,
        wizardSessionId: SESSION,
        tabName: TAB,
        expectedFingerprint: "ff",
      }),
      deps,
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ status: "stale_review" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("accept CAS mismatch REFRESHES the persisted preview before 409, so a second accept succeeds (no dead-loop, plan-R5-1)", async () => {
    const { deps, rpc, rescan } = makeDeps({ serverFingerprint: "ee" });
    const res1 = await handlePullSheetOverride(
      reqWith({
        driveFileId: DRIVE,
        wizardSessionId: SESSION,
        tabName: TAB,
        expectedFingerprint: "ff",
      }),
      deps,
    );
    expect(res1.status).toBe(409);
    expect(rescan).toHaveBeenCalled(); // envelope re-persisted with the NEW fingerprint
    expect(rpc).not.toHaveBeenCalled();

    // Client re-fetched; now sends the refreshed fingerprint 'ee' → matches → succeeds.
    const res2 = await handlePullSheetOverride(
      reqWith({
        driveFileId: DRIVE,
        wizardSessionId: SESSION,
        tabName: TAB,
        expectedFingerprint: "ee",
      }),
      deps,
    );
    expect(res2.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({ p_fingerprint: "ee" }));
  });

  test("stale_review 409 body has no §12.4/lookup code (uncataloged-code guard, plan-R1-3)", async () => {
    const { deps } = makeDeps({ serverFingerprint: "ee" });
    const res = await handlePullSheetOverride(
      reqWith({
        driveFileId: DRIVE,
        wizardSessionId: SESSION,
        tabName: TAB,
        expectedFingerprint: "ff",
      }),
      deps,
    );
    const body = await res.json();
    expect(body).not.toHaveProperty("code");
  });

  test("accept: named tab has no pull-sheet region server-side => typed error, no override written", async () => {
    const { deps, rpc } = makeDeps({ serverFingerprint: null });
    const res = await handlePullSheetOverride(
      reqWith({
        driveFileId: DRIVE,
        wizardSessionId: SESSION,
        tabName: TAB,
        expectedFingerprint: "ee",
      }),
      deps,
    );
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ status: "no_pull_sheet_region" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("revoke: tabName null => RPC called with p_tab_name null + p_expected_override_snapshot, re-scan triggered", async () => {
    const snapshot: OverrideSnapshot = { tabName: TAB, fingerprint: "ff" };
    const { deps, rpc, rescan, detect } = makeDeps({ serverFingerprint: "ee" });
    const res = await handlePullSheetOverride(
      reqWith({
        driveFileId: DRIVE,
        wizardSessionId: SESSION,
        tabName: null,
        expectedOverrideSnapshot: snapshot,
      }),
      deps,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "override_cleared" });
    // Revoke does NOT fresh-detect (there is no fingerprint to compare).
    expect(detect).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      expect.objectContaining({
        p_tab_name: null,
        p_expected_override_snapshot: snapshot,
      }),
    );
    expect(rescan).toHaveBeenCalledWith(DRIVE, SESSION);
    expect(outcomeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ code: "PULL_SHEET_OVERRIDE_CLEARED" }),
    );
  });

  test("row-state CAS: RPC raises 40001 (override changed since page load) => 409 { status:'stale_review' } (plan-R3-1)", async () => {
    const rpc = vi.fn(async (_p: unknown) => {
      throw { code: "40001" };
    });
    const { deps } = makeDeps({ serverFingerprint: "ee", rpc });
    const res = await handlePullSheetOverride(
      reqWith({
        driveFileId: DRIVE,
        wizardSessionId: SESSION,
        tabName: null,
        expectedOverrideSnapshot: { tabName: TAB, fingerprint: "ff" },
      }),
      deps,
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ status: "stale_review" });
  });

  test("row-state CAS: RPC RETURNS a 40001 error (PostgREST-mapped) => 409 stale_review", async () => {
    const rpc = vi.fn(async (_p: unknown) => ({ data: null, error: { code: "40001" } }));
    const { deps } = makeDeps({ serverFingerprint: "ee", rpc });
    const res = await handlePullSheetOverride(
      reqWith({
        driveFileId: DRIVE,
        wizardSessionId: SESSION,
        tabName: null,
        expectedOverrideSnapshot: null,
      }),
      deps,
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ status: "stale_review" });
  });

  test("non-admin => rejected before any RPC (requireAdminIdentity throws)", async () => {
    const rejected = new Error("forbidden");
    requireAdminIdentityMock.mockRejectedValueOnce(rejected);
    const { deps, rpc } = makeDeps({ serverFingerprint: "ee" });
    await expect(
      handlePullSheetOverride(
        reqWith({
          driveFileId: DRIVE,
          wizardSessionId: SESSION,
          tabName: TAB,
          expectedFingerprint: "ee",
        }),
        deps,
      ),
    ).rejects.toBe(rejected);
    expect(rpc).not.toHaveBeenCalled();
    expect(outcomeSpy).not.toHaveBeenCalled();
  });

  test("malformed body => 400, no RPC, no audit", async () => {
    const { deps, rpc } = makeDeps({ serverFingerprint: "ee" });
    const res = await handlePullSheetOverride(
      reqWith({ driveFileId: "", wizardSessionId: "not-a-uuid" }),
      deps,
    );
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(outcomeSpy).not.toHaveBeenCalled();
  });

  test("re-scan FAILS after RPC commit => logAdminOutcome STILL emitted SET, response not 500 (partial-success audit, plan-R8-1)", async () => {
    const rescan = vi.fn(async () => {
      throw new Error("rescan timeout");
    });
    const { deps } = makeDeps({ serverFingerprint: "ee", rescan });
    const res = await handlePullSheetOverride(
      reqWith({
        driveFileId: DRIVE,
        wizardSessionId: SESSION,
        tabName: TAB,
        expectedFingerprint: "ee",
        expectedOverrideSnapshot: null,
      }),
      deps,
    );
    // Audit fired despite the re-scan failure (a committed mutation is never dark).
    expect(outcomeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ code: "PULL_SHEET_OVERRIDE_SET" }),
    );
    expect(res.status).not.toBe(500);
    expect(res.status).toBe(200);
  });
});
