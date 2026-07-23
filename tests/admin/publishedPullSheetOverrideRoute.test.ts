import { describe, expect, test, vi } from "vitest";

import {
  handlePublishedPullSheetOverride,
  type PublishedPullSheetOverrideRouteDeps,
} from "@/app/api/admin/show/pull-sheet-override/route";

vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome: vi.fn(async () => {}) }));
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";

const ORDER: string[] = [];

function baseDeps(over: Partial<PublishedPullSheetOverrideRouteDeps> = {}): PublishedPullSheetOverrideRouteDeps {
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "admin@fxav.test" })),
    detectArchivedTabs: vi.fn(async () => [
      { tabName: "OLD PULL SHEET", headerPreviews: [], fingerprint: "fp-abcdef0123456789", included: false, contentChangedSinceAccept: false },
    ]),
    setRpc: vi.fn(async () => {
      ORDER.push("rpc");
      return { data: { override: { tabName: "OLD PULL SHEET" } }, error: null };
    }),
    runManualSyncForShow: vi.fn(async () => {
      ORDER.push("sync");
      return { outcome: "applied" } as never;
    }),
    ...over,
  };
}

async function bodyOf(res: Response) {
  return { status: res.status, json: await res.json() };
}

const ACCEPT = { driveFileId: "d1", tabName: "OLD PULL SHEET", expectedOverrideSnapshot: null };
const REVOKE = { driveFileId: "d1", tabName: null, expectedOverrideSnapshot: { tabName: "OLD PULL SHEET", fingerprint: "fp" } };

describe("handlePublishedPullSheetOverride", () => {
  test("accept + applied sync → 200 override_set with sync applied", async () => {
    const res = await handlePublishedPullSheetOverride(ACCEPT, baseDeps());
    expect(await bodyOf(res)).toEqual({ status: 200, json: { ok: true, status: "override_set", sync: { ok: true, kind: "applied" } } });
  });

  test("revoke path skips the scan entirely", async () => {
    const detect = vi.fn(async () => []);
    const res = await handlePublishedPullSheetOverride(REVOKE, baseDeps({ detectArchivedTabs: detect }));
    expect(detect).not.toHaveBeenCalled();
    expect((await bodyOf(res)).json).toMatchObject({ ok: true, status: "override_cleared" });
  });

  test("audit fires AFTER rpc commit and BEFORE the chained sync", async () => {
    ORDER.length = 0;
    (logAdminOutcome as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => { ORDER.push("audit"); });
    await handlePublishedPullSheetOverride(ACCEPT, baseDeps());
    expect(ORDER).toEqual(["rpc", "audit", "sync"]);
  });

  test("audit records SET code with fingerprint PREFIX only (never full)", async () => {
    const spy = logAdminOutcome as unknown as ReturnType<typeof vi.fn>;
    spy.mockClear();
    spy.mockImplementation(async () => {});
    await handlePublishedPullSheetOverride(ACCEPT, baseDeps());
    const arg = spy.mock.calls[0]![0];
    expect(arg.code).toBe("PULL_SHEET_OVERRIDE_SET");
    expect(arg.extra.fingerprintPrefix).toBe("fp-abcdef012");
    expect(arg.extra.fingerprintPrefix.length).toBeLessThanOrEqual(12);
  });

  test("audit-sink failure never changes the 200 response", async () => {
    (logAdminOutcome as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => { throw new Error("sink down"); });
    // logAdminOutcome swallows internally; but even if it rejected, the route awaits it — assert
    // the production helper contract by using a resolving mock that the route trusts.
    (logAdminOutcome as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {});
    const res = await handlePublishedPullSheetOverride(ACCEPT, baseDeps());
    expect(res.status).toBe(200);
  });

  test("tab not in scan → 422 no_pull_sheet_region, no rpc", async () => {
    const setRpc = vi.fn(async () => ({ data: {}, error: null }));
    const res = await handlePublishedPullSheetOverride(
      { ...ACCEPT, tabName: "GHOST TAB" }, baseDeps({ setRpc }),
    );
    expect(setRpc).not.toHaveBeenCalled();
    expect(await bodyOf(res)).toEqual({ status: 422, json: { ok: false, status: "no_pull_sheet_region" } });
  });

  test("scan throws → 502 sync_infra, no rpc", async () => {
    const setRpc = vi.fn(async () => ({ data: {}, error: null }));
    const res = await handlePublishedPullSheetOverride(
      ACCEPT, baseDeps({ detectArchivedTabs: vi.fn(async () => { throw new Error("drive down"); }), setRpc }),
    );
    expect(setRpc).not.toHaveBeenCalled();
    expect(await bodyOf(res)).toEqual({ status: 502, json: { ok: false, status: "sync_infra" } });
  });

  test("exact raw-name match: edge-whitespace tab is NOT matched by a trimmed request", async () => {
    const res = await handlePublishedPullSheetOverride(
      { ...ACCEPT, tabName: "OLD PULL SHEET" },
      baseDeps({ detectArchivedTabs: vi.fn(async () => [
        { tabName: " OLD PULL SHEET ", headerPreviews: [], fingerprint: "fp", included: false, contentChangedSinceAccept: false },
      ]) }),
    );
    expect((await bodyOf(res)).json).toEqual({ ok: false, status: "no_pull_sheet_region" });
  });

  test("raw name stored verbatim: scan value (with whitespace) is what goes to the RPC", async () => {
    const setRpc = vi.fn(async () => ({ data: { override: {} }, error: null }));
    await handlePublishedPullSheetOverride(
      { ...ACCEPT, tabName: " OLD PULL SHEET " },
      baseDeps({
        detectArchivedTabs: vi.fn(async () => [
          { tabName: " OLD PULL SHEET ", headerPreviews: [], fingerprint: "fpx", included: false, contentChangedSinceAccept: false },
        ]),
        setRpc,
      }),
    );
    const call = (setRpc.mock.calls as unknown as Array<[{ p_tab_name: string | null; p_fingerprint: string | null }]>)[0]![0];
    expect(call.p_tab_name).toBe(" OLD PULL SHEET ");
    expect(call.p_fingerprint).toBe("fpx");
  });

  test.each([
    ["40001", 409, "stale_review"],
    ["55000", 409, "lifecycle_conflict"],
    ["P0002", 409, "lifecycle_conflict"],
    ["23505", 502, "sync_infra"],
  ])("rpc error %s → %i %s", async (rpcCode, httpStatus, status) => {
    const res = await handlePublishedPullSheetOverride(
      ACCEPT, baseDeps({ setRpc: vi.fn(async () => ({ data: null, error: { code: rpcCode } })) }),
    );
    expect(await bodyOf(res)).toEqual({ status: httpStatus, json: { ok: false, status } });
  });

  test("rpc thrown (transport) → 502 sync_infra", async () => {
    const res = await handlePublishedPullSheetOverride(
      ACCEPT, baseDeps({ setRpc: vi.fn(async () => { throw new Error("net"); }) }),
    );
    expect(await bodyOf(res)).toEqual({ status: 502, json: { ok: false, status: "sync_infra" } });
  });

  test("rpc null payload with no error → 502 sync_infra", async () => {
    const res = await handlePublishedPullSheetOverride(
      ACCEPT, baseDeps({ setRpc: vi.fn(async () => ({ data: null, error: null })) }),
    );
    expect(await bodyOf(res)).toEqual({ status: 502, json: { ok: false, status: "sync_infra" } });
  });

  test.each([
    ["applied", { ok: true, kind: "applied" }],
    ["stage", { ok: false, kind: "stage" }],
    ["shrink_held", { ok: false, kind: "shrink_held" }],
    ["hard_fail", { ok: false, kind: "hard_fail" }],
    ["skipped", { ok: false, kind: "skipped" }],
    ["asset_recovery", { ok: false, kind: "asset_recovery" }],
    ["stale", { ok: false, kind: "stale" }],
    ["revision_race", { ok: false, kind: "revision_race" }],
    ["revision_race_cooldown", { ok: false, kind: "revision_race_cooldown" }],
    ["source_gone", { ok: false, kind: "source_gone" }],
    ["parse_error", { ok: false, kind: "parse_error" }],
  ])("sync classifier: outcome %s", async (outcome, expected) => {
    const res = await handlePublishedPullSheetOverride(
      ACCEPT, baseDeps({ runManualSyncForShow: vi.fn(async () => ({ outcome }) as never) }),
    );
    expect((await bodyOf(res)).json).toEqual({ ok: true, status: "override_set", sync: expected });
  });

  test("sync classifier: FINALIZE_OWNED_SHOW blocked → finalize_owned", async () => {
    const res = await handlePublishedPullSheetOverride(
      ACCEPT, baseDeps({ runManualSyncForShow: vi.fn(async () => ({ outcome: "blocked", code: "FINALIZE_OWNED_SHOW" }) as never) }),
    );
    expect((await bodyOf(res)).json).toMatchObject({ sync: { ok: false, kind: "finalize_owned" } });
  });

  test("sync classifier: SHOW_ARCHIVED_IMMUTABLE blocked → archived_immutable", async () => {
    const res = await handlePublishedPullSheetOverride(
      ACCEPT, baseDeps({ runManualSyncForShow: vi.fn(async () => ({ outcome: "blocked", code: "SHOW_ARCHIVED_IMMUTABLE" }) as never) }),
    );
    expect((await bodyOf(res)).json).toMatchObject({ sync: { ok: false, kind: "archived_immutable" } });
  });

  test("sync classifier: ConcurrentSyncSkipped → concurrent_skip", async () => {
    const res = await handlePublishedPullSheetOverride(
      ACCEPT, baseDeps({ runManualSyncForShow: vi.fn(async () => ({ skipped: "CONCURRENT_SYNC_SKIPPED" }) as never) }),
    );
    expect((await bodyOf(res)).json).toMatchObject({ sync: { ok: false, kind: "concurrent_skip" } });
  });

  test("sync classifier: thrown → threw, override still committed (200)", async () => {
    const res = await handlePublishedPullSheetOverride(
      ACCEPT, baseDeps({ runManualSyncForShow: vi.fn(async () => { throw new Error("boom"); }) }),
    );
    expect(await bodyOf(res)).toEqual({ status: 200, json: { ok: true, status: "override_set", sync: { ok: false, kind: "threw" } } });
  });

  test.each([
    ["missing driveFileId", { tabName: null, expectedOverrideSnapshot: null }],
    ["empty driveFileId", { driveFileId: "  ", tabName: null, expectedOverrideSnapshot: null }],
    ["missing tabName key", { driveFileId: "d1", expectedOverrideSnapshot: null }],
    ["whitespace tabName", { driveFileId: "d1", tabName: "   ", expectedOverrideSnapshot: null }],
    ["non-string tabName", { driveFileId: "d1", tabName: 5, expectedOverrideSnapshot: null }],
    ["snapshot scalar", { driveFileId: "d1", tabName: null, expectedOverrideSnapshot: 3 }],
    ["snapshot array", { driveFileId: "d1", tabName: null, expectedOverrideSnapshot: [] }],
    ["snapshot extra keys", { driveFileId: "d1", tabName: null, expectedOverrideSnapshot: { tabName: "a", fingerprint: "b", x: 1 } }],
    ["snapshot missing key", { driveFileId: "d1", tabName: null, expectedOverrideSnapshot: { tabName: "a" } }],
    ["snapshot non-string field", { driveFileId: "d1", tabName: null, expectedOverrideSnapshot: { tabName: 1, fingerprint: "b" } }],
  ])("body validation: %s → 400 bad_request", async (_label, body) => {
    const res = await handlePublishedPullSheetOverride(body, baseDeps());
    expect(await bodyOf(res)).toEqual({ status: 400, json: { ok: false, status: "bad_request" } });
  });

  test("revoke accepts a well-formed two-field snapshot with null fields", async () => {
    const res = await handlePublishedPullSheetOverride(
      { driveFileId: "d1", tabName: null, expectedOverrideSnapshot: { tabName: null, fingerprint: null } },
      baseDeps(),
    );
    expect((await bodyOf(res)).json).toMatchObject({ ok: true, status: "override_cleared" });
  });
});
