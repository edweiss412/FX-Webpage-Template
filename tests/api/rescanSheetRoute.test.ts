import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * POST /api/admin/onboarding/rescan-sheet — route mapping + guards (no DB).
 *
 * requireAdmin is mocked (mirrors tests/api/admin-sync-route.test.ts — the route calls it
 * directly, and a throw must propagate WITHOUT touching the rescan core). The orchestration core
 * is INJECTED via deps so each RescanResult shape can be exercised without a DB; the asserted
 * response bodies are the ROUTE's transform (adds `ok`, includes/omits `code`), pinned with
 * toEqual so a leaked or dropped key fails — independent of the mock's raw RescanResult
 * (anti-tautology).
 */

const adminMock = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: adminMock.requireAdmin,
}));

import type { RescanResult } from "@/lib/onboarding/rescanWizardSheet";

const { handleRescanSheet } = await import("@/app/api/admin/onboarding/rescan-sheet/route");

const DRIVE = "drive-rescan-route";
const SESSION = "11111111-1111-4111-8111-111111111111";

function req(body?: unknown): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/rescan-sheet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function rescanMock(result: RescanResult) {
  return vi.fn(async (_drive: string, _session: string, _deps?: unknown) => result);
}

describe("POST /api/admin/onboarding/rescan-sheet", () => {
  beforeEach(() => {
    adminMock.requireAdmin.mockReset();
    adminMock.requireAdmin.mockResolvedValue(undefined);
  });

  test("requires admin BEFORE parsing the body or rescanning (a throw propagates)", async () => {
    const rejected = new Error("forbidden");
    adminMock.requireAdmin.mockRejectedValueOnce(rejected);
    const rescan = rescanMock({ status: "updated", needsReview: false, changed: true });

    await expect(
      handleRescanSheet(req({ driveFileId: DRIVE, wizardSessionId: SESSION }), {
        rescanWizardSheet: rescan,
      }),
    ).rejects.toBe(rejected);
    expect(rescan).not.toHaveBeenCalled();
  });

  test.each([
    ["missing driveFileId", { wizardSessionId: SESSION }],
    ["missing wizardSessionId", { driveFileId: DRIVE }],
    ["non-string driveFileId", { driveFileId: 5, wizardSessionId: SESSION }],
    ["non-string wizardSessionId", { driveFileId: DRIVE, wizardSessionId: null }],
    ["empty-string driveFileId", { driveFileId: "", wizardSessionId: SESSION }],
    ["no body at all", undefined],
  ])("400 malformed-body + no rescan when %s", async (_label, body) => {
    const rescan = rescanMock({ status: "updated", needsReview: false, changed: true });
    const res = await handleRescanSheet(req(body), { rescanWizardSheet: rescan });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Request must include driveFileId and wizardSessionId.",
    });
    expect(rescan).not.toHaveBeenCalled();
  });

  test.each([
    ["a non-UUID string", "not-a-uuid"],
    ["a numeric-ish string", "12345"],
    ["a truncated UUID", "11111111-1111-4111-8111"],
  ])("400 + no rescan when wizardSessionId is %s", async (_label, badSession) => {
    // Passes the non-empty-string check but is not a UUID — must 400 BEFORE reaching
    // the core's `::uuid` SQL casts (which would otherwise infra-500). Spec §5.1.
    const rescan = rescanMock({ status: "updated", needsReview: false, changed: true });
    const res = await handleRescanSheet(req({ driveFileId: DRIVE, wizardSessionId: badSession }), {
      rescanWizardSheet: rescan,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error?: unknown };
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(rescan).not.toHaveBeenCalled();
  });

  test("forwards driveFileId, wizardSessionId, and rescanDeps to the core", async () => {
    const rescan = rescanMock({ status: "updated", needsReview: true, changed: false });
    const rescanDeps = { afterDriveRead: () => undefined };
    await handleRescanSheet(req({ driveFileId: DRIVE, wizardSessionId: SESSION }), {
      rescanWizardSheet: rescan,
      rescanDeps,
    });
    expect(rescan).toHaveBeenCalledTimes(1);
    expect(rescan).toHaveBeenCalledWith(DRIVE, SESSION, rescanDeps);
  });

  test.each<[RescanResult, Record<string, unknown>]>([
    [
      { status: "updated", needsReview: false, changed: true },
      { ok: true, status: "updated", needsReview: false, changed: true },
    ],
    [
      { status: "updated", needsReview: true, changed: false },
      { ok: true, status: "updated", needsReview: true, changed: false },
    ],
    [
      { status: "needs_attention", code: "DRIVE_FETCH_FAILED" },
      { ok: false, status: "needs_attention", code: "DRIVE_FETCH_FAILED" },
    ],
    [
      { status: "needs_attention", code: "STAGED_PARSE_SOURCE_OUT_OF_SCOPE" },
      { ok: false, status: "needs_attention", code: "STAGED_PARSE_SOURCE_OUT_OF_SCOPE" },
    ],
    [
      { status: "busy", code: "CONCURRENT_FINALIZE_IN_FLIGHT" },
      { ok: false, status: "busy", code: "CONCURRENT_FINALIZE_IN_FLIGHT" },
    ],
    [{ status: "superseded" }, { ok: false, status: "superseded" }],
    [{ status: "no_active_session" }, { ok: false, status: "no_active_session" }],
    [{ status: "not_found" }, { ok: false, status: "not_found" }],
    [{ status: "not_a_sheet" }, { ok: false, status: "not_a_sheet" }],
  ])("maps %j → %j at HTTP 200", async (result, expected) => {
    const rescan = rescanMock(result);
    const res = await handleRescanSheet(req({ driveFileId: DRIVE, wizardSessionId: SESSION }), {
      rescanWizardSheet: rescan,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expected);
  });
});
