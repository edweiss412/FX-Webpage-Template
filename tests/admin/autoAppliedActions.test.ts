// @vitest-environment node
//
// Dashboard auto-applied strip server actions (Flow-4 Task 4). Mirrors
// tests/admin/feedTelemetry.test.tsx for the per-show undoChangeAction: each
// committed dashboard mutation (accept / accept-all / undo) delegates to the
// right guarded helper, revalidates POST-COMMIT, and leaves a durable
// logAdminOutcome audit row (hashed actor) — a refused / early-return result
// leaves NO row and NEVER calls the helper with an undefined show scope.
//
// Concrete failure modes caught:
//   (1) an accept submitted without showId calls acknowledgeChanges anyway;
//   (2) a committed mutation leaves no durable audit row;
//   (3) a refused ({ok:false}) op logs a false success;
//   (4) undo reads a client-supplied showId (it must not);
//   (5) undo revalidates a show tag even when undoChange surfaces no showId.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminIdentity = vi.fn(async () => ({ email: "Admin@Example.com" }));
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdminIdentity: () => requireAdminIdentity(),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
  revalidateTag: vi.fn(),
}));

const revalidateShow = vi.fn();
vi.mock("@/lib/data/showCacheTag", () => ({
  revalidateShow: (...a: unknown[]) => revalidateShow(...a),
}));

import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import * as ack from "@/lib/sync/holds/acknowledgeChanges";
import * as undo from "@/lib/sync/holds/undoChange";
import {
  acceptChangeAction,
  acceptAllAction,
  undoFromDashboardAction,
} from "@/app/admin/_actions/autoApplied";

const SHOW_ID = "11111111-1111-1111-1111-111111111111";

function capture(): LogRecord[] {
  const sink: LogRecord[] = [];
  setLogSink((r) => {
    sink.push(r);
  });
  return sink;
}

beforeEach(() => {
  requireAdminIdentity.mockClear();
  revalidatePath.mockClear();
  revalidateShow.mockClear();
});
afterEach(() => {
  resetLogSink();
  vi.restoreAllMocks();
});

describe("Flow-4 dashboard: acceptChangeAction", () => {
  it("success → acknowledgeChanges(showId, [changeLogId]) + revalidatePath + durable CHANGES_ACKNOWLEDGED (hashed actor)", async () => {
    const spy = vi.spyOn(ack, "acknowledgeChanges").mockResolvedValue({ ok: true, count: 1 });
    const sink = capture();
    const fd = new FormData();
    fd.set("showId", SHOW_ID);
    fd.set("changeLogId", "cl-1");
    const res = await acceptChangeAction(null, fd);
    expect(res).toMatchObject({ ok: true });
    expect(requireAdminIdentity).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(SHOW_ID, ["cl-1"]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "page");
    const rec = sink.filter((r) => r.code === "CHANGES_ACKNOWLEDGED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("info");
    expect(rec[0]!.source).toBe("admin.dashboard.autoApplied.accept");
    expect(typeof rec[0]!.actorHash).toBe("string");
    expect(rec[0]!.actorHash).not.toBe("Admin@Example.com");
    expect(rec[0]!.showId).toBe(SHOW_ID);
    expect(rec[0]!.context.changeLogId).toBe("cl-1");
  });

  it("missing showId → NO acknowledgeChanges call, typed refusal, NO row", async () => {
    const spy = vi.spyOn(ack, "acknowledgeChanges").mockResolvedValue({ ok: true, count: 1 });
    const sink = capture();
    const fd = new FormData();
    fd.set("changeLogId", "cl-1"); // no showId
    const res = await acceptChangeAction(null, fd);
    expect(res).toMatchObject({ ok: false });
    expect(spy).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(sink.some((r) => r.code === "CHANGES_ACKNOWLEDGED")).toBe(false);
  });

  it("helper failure → NO CHANGES_ACKNOWLEDGED row, no revalidate", async () => {
    vi.spyOn(ack, "acknowledgeChanges").mockResolvedValue({ ok: false, code: "SYNC_INFRA_ERROR" });
    const sink = capture();
    const fd = new FormData();
    fd.set("showId", SHOW_ID);
    fd.set("changeLogId", "cl-1");
    const res = await acceptChangeAction(null, fd);
    expect(res).toMatchObject({ ok: false });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(sink.some((r) => r.code === "CHANGES_ACKNOWLEDGED")).toBe(false);
  });
});

describe("Flow-4 dashboard: acceptAllAction", () => {
  it("success → acknowledgeChanges(showId, splitIds) + revalidatePath + durable CHANGES_ACKNOWLEDGED", async () => {
    const spy = vi.spyOn(ack, "acknowledgeChanges").mockResolvedValue({ ok: true, count: 3 });
    const sink = capture();
    const fd = new FormData();
    fd.set("showId", SHOW_ID);
    fd.set("ids", "a,b,c");
    const res = await acceptAllAction(null, fd);
    expect(res).toMatchObject({ ok: true });
    expect(requireAdminIdentity).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(SHOW_ID, ["a", "b", "c"]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "page");
    const rec = sink.filter((r) => r.code === "CHANGES_ACKNOWLEDGED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.source).toBe("admin.dashboard.autoApplied.acceptAll");
    expect(typeof rec[0]!.actorHash).toBe("string");
    expect(rec[0]!.showId).toBe(SHOW_ID);
  });

  it("empty/malformed ids → filtered to [] (no empty-string ids leak to helper)", async () => {
    const spy = vi.spyOn(ack, "acknowledgeChanges").mockResolvedValue({ ok: true, count: 0 });
    capture();
    const fd = new FormData();
    fd.set("showId", SHOW_ID);
    fd.set("ids", ",,"); // all empty after split → []
    await acceptAllAction(null, fd);
    expect(spy).toHaveBeenCalledWith(SHOW_ID, []);
  });

  it("missing showId → NO acknowledgeChanges call, typed refusal, NO row", async () => {
    const spy = vi.spyOn(ack, "acknowledgeChanges").mockResolvedValue({ ok: true, count: 3 });
    const sink = capture();
    const fd = new FormData();
    fd.set("ids", "a,b,c"); // no showId
    const res = await acceptAllAction(null, fd);
    expect(res).toMatchObject({ ok: false });
    expect(spy).not.toHaveBeenCalled();
    expect(sink.some((r) => r.code === "CHANGES_ACKNOWLEDGED")).toBe(false);
  });
});

describe("Flow-4 dashboard: undoFromDashboardAction", () => {
  it("success WITH showId → undoChange(changeLogId) + revalidateShow + revalidatePath + durable CHANGE_UNDONE", async () => {
    const spy = vi.spyOn(undo, "undoChange").mockResolvedValue({ ok: true, showId: "show-9" });
    const sink = capture();
    const fd = new FormData();
    fd.set("changeLogId", "cl-9");
    fd.set("showId", "should-be-ignored"); // undo must NOT read a client showId
    const res = await undoFromDashboardAction(null, fd);
    expect(res).toMatchObject({ ok: true });
    expect(requireAdminIdentity).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("cl-9"); // single arg — never a client showId
    expect(revalidateShow).toHaveBeenCalledWith("show-9");
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "page");
    const rec = sink.filter((r) => r.code === "CHANGE_UNDONE");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.source).toBe("admin.dashboard.autoApplied.undo");
    expect(typeof rec[0]!.actorHash).toBe("string");
    expect(rec[0]!.showId).toBe("show-9");
    expect(rec[0]!.context.changeLogId).toBe("cl-9");
  });

  it("success WITHOUT showId → revalidateShow NOT called, revalidatePath called, CHANGE_UNDONE emitted", async () => {
    vi.spyOn(undo, "undoChange").mockResolvedValue({ ok: true });
    const sink = capture();
    const fd = new FormData();
    fd.set("changeLogId", "cl-9");
    await undoFromDashboardAction(null, fd);
    expect(revalidateShow).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "page");
    expect(sink.filter((r) => r.code === "CHANGE_UNDONE")).toHaveLength(1);
  });

  it("helper failure → NO CHANGE_UNDONE row, no revalidate", async () => {
    vi.spyOn(undo, "undoChange").mockResolvedValue({ ok: false, code: "CHANGE_ALREADY_UNDONE" });
    const sink = capture();
    const fd = new FormData();
    fd.set("changeLogId", "cl-9");
    const res = await undoFromDashboardAction(null, fd);
    expect(res).toMatchObject({ ok: false });
    expect(revalidateShow).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(sink.some((r) => r.code === "CHANGE_UNDONE")).toBe(false);
  });
});
