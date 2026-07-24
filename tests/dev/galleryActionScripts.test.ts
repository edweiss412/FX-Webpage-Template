import { describe, expect, test } from "vitest";
import {
  NOOP_ACTIONS,
  buildScriptedActions,
  buildFetchScripts,
  buildActionOverrides,
} from "@/lib/dev/galleryActionScripts";

const HANG_TIMEOUT = 50;
const never = (p: unknown) =>
  Promise.race([
    Promise.resolve(p).then(() => "resolved"),
    new Promise((r) => setTimeout(() => r("hung"), HANG_TIMEOUT)),
  ]);

describe("buildScriptedActions (channel 1)", () => {
  test("null script returns the NOOP identity", () => {
    expect(buildScriptedActions(null, 0)).toBe(NOOP_ACTIONS);
  });

  test("channel-2/3-only scripts also return the NOOP identity", () => {
    expect(buildScriptedActions({ resync: { kind: "pending" }, rotate: { kind: "success" } }, 0)).toBe(
      NOOP_ACTIONS,
    );
  });

  test("scripted results are contract-exact; unscripted keys keep NOOP members", async () => {
    // Failure mode: builder inventing result shapes the components cannot parse,
    // or clobbering unscripted closures.
    const ACCEPTABLE = 4;
    const acts = buildScriptedActions(
      {
        setPublished: { kind: "error", code: "FINALIZE_OWNED_SHOW" },
        acceptAll: { kind: "success" },
        archive: { kind: "not_found" },
      },
      ACCEPTABLE,
    );
    await expect(acts.setPublished(true)).resolves.toEqual({ ok: false, code: "FINALIZE_OWNED_SHOW" });
    await expect(acts.acceptAllAction(null, new FormData())).resolves.toEqual({ ok: true, count: ACCEPTABLE });
    await expect(acts.archiveAction()).resolves.toEqual({ ok: false, code: "show_not_found" });
    expect(acts.undoAction).toBe(NOOP_ACTIONS.undoAction);
  });

  test("pending closures never settle", async () => {
    const acts = buildScriptedActions({ undo: { kind: "pending" } }, 0);
    await expect(never(acts.undoAction(null, new FormData()))).resolves.toBe("hung");
  });
});

describe("buildFetchScripts (channel 2)", () => {
  test("sequenced bulk-ignore partial + shrink-held resync", () => {
    // Failure mode: unsequenced bulk responses (partial state undemonstrable)
    // or a resync body the ReSyncButton parse branch rejects.
    const scripts = buildFetchScripts({
      bulkIgnore: { kind: "partial", okCount: 2 },
      resync: { kind: "shrink_held", detail: "2 crew removed" },
    });
    const bulk = scripts.find((s) => s.key === "bulkIgnore");
    expect(bulk).toBeDefined();
    expect(bulk!.respond(0)).toEqual({ status: 200, body: { status: "ignored" } });
    expect(bulk!.respond(1)).toEqual({ status: 200, body: { status: "ignored" } });
    expect(bulk!.respond(2)).toEqual({
      status: 500,
      body: { ok: false, code: "GALLERY_SCRIPTED_FAIL" },
    });
    const resync = scripts.find((s) => s.key === "resync");
    expect(resync).toBeDefined();
    expect(resync!.pathPattern.test("/api/admin/sync/gallery-show")).toBe(true);
    expect(resync!.pathPattern.test("/api/admin/show/x/alerts/y/resolve")).toBe(false);
    expect(resync!.respond(0)).toEqual({
      status: 200,
      body: {
        ok: true,
        result: {
          outcome: "shrink_held",
          detail: "2 crew removed",
          heldModifiedTime: "2026-06-29T00:00:00.000Z",
        },
      },
    });
  });

  test("resync error codes map to the route's real statuses", () => {
    const scripts = buildFetchScripts({ resync: { kind: "error", code: "PENDING_SYNC_NOT_FOUND" } });
    expect(scripts[0]?.respond(0)).toEqual({
      status: 404,
      body: { ok: false, error: "PENDING_SYNC_NOT_FOUND" },
    });
  });

  test("pending fetch scripts hang; null script yields no scripts", () => {
    const scripts = buildFetchScripts({ resolve: { kind: "pending" } });
    expect(scripts[0]?.respond(0)).toBe("hang");
    expect(buildFetchScripts(null)).toEqual([]);
    expect(buildFetchScripts({ setPublished: { kind: "pending" } })).toEqual([]);
  });
});

describe("buildActionOverrides (channel 3)", () => {
  test("overrides match the real result unions; unscripted keys absent", async () => {
    const o = buildActionOverrides({ crewReset: { kind: "not_found" }, rotate: { kind: "success" } });
    expect(o).not.toBeNull();
    await expect(
      o!.resetCrewMemberSelection!({ showId: "x", crewMemberId: "y" }),
    ).resolves.toEqual({ ok: false, code: "PICKER_CREW_MEMBER_NOT_FOUND" });
    await expect(o!.rotateShareToken!({ showId: "x" })).resolves.toEqual({
      ok: true,
      new_share_token: "gallery-share-token-rotated",
      new_epoch: 2,
    });
    expect(o!.resetPickerEpoch).toBeUndefined();
  });

  test("null when nothing channel-3 is scripted; pending hangs", async () => {
    expect(buildActionOverrides(null)).toBeNull();
    expect(buildActionOverrides({ resync: { kind: "pending" } })).toBeNull();
    const o = buildActionOverrides({ everyoneReset: { kind: "pending" } });
    await expect(never(o!.resetPickerEpoch!({ showId: "x" }))).resolves.toBe("hung");
  });
});
