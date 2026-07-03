// @vitest-environment node
//
// Success-outcome telemetry (audit finding #5 — changes-feed MI-11 actions).
// Each committed feed mutation (approve / reject / undo) MUST leave a durable
// logAdminOutcome audit row (who did what, when) with a HASHED actor; a refused
// ({ok:false}) result MUST leave NO row (no false audit row).
//
// Concrete failure modes caught:
//   (1) a committed mutation leaves no durable audit row;
//   (2) a rolled-back / refused op logs a false success.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminIdentity = vi.fn(async () => ({ email: "Admin@Example.com" }));
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdminIdentity: () => requireAdminIdentity(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import * as gate from "@/lib/sync/holds/mi11GateActions";
import * as undo from "@/lib/sync/holds/undoChange";
import {
  mi11ApproveAction,
  mi11RejectAction,
  undoChangeAction,
} from "@/app/admin/show/[slug]/_actions/feed";

function capture(): LogRecord[] {
  const sink: LogRecord[] = [];
  setLogSink((r) => {
    sink.push(r);
  });
  return sink;
}

beforeEach(() => requireAdminIdentity.mockClear());
afterEach(() => {
  resetLogSink();
  vi.restoreAllMocks();
});

describe("changes-feed MI-11 success-outcome telemetry", () => {
  it("mi11ApproveAction success → durable MI11_HOLD_APPROVED (hashed actor, showId, holdId)", async () => {
    vi.spyOn(gate, "approveMi11Hold").mockResolvedValue({ ok: true, showId: "show-77" });
    const sink = capture();
    const fd = new FormData();
    fd.set("holdId", "h1");
    fd.set("expectedBaseModifiedTime", "");
    await mi11ApproveAction(null, fd);
    const rec = sink.filter((r) => r.code === "MI11_HOLD_APPROVED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("info");
    expect(rec[0]!.source).toBe("admin.show.feed.mi11Approve");
    expect(typeof rec[0]!.actorHash).toBe("string"); // hashed, never raw
    expect(rec[0]!.actorHash).not.toBe("Admin@Example.com");
    expect(rec[0]!.showId).toBe("show-77");
    expect(rec[0]!.context.holdId).toBe("h1");
  });

  it("mi11ApproveAction refusal ({ok:false}) → NO MI11_HOLD_APPROVED row", async () => {
    vi.spyOn(gate, "approveMi11Hold").mockResolvedValue({
      ok: false,
      code: "IDENTITY_WOULD_COLLIDE",
    });
    const sink = capture();
    const fd = new FormData();
    fd.set("holdId", "h1");
    const res = await mi11ApproveAction(null, fd);
    expect(res).toMatchObject({ ok: false });
    expect(sink.some((r) => r.code === "MI11_HOLD_APPROVED")).toBe(false);
  });

  it("mi11RejectAction success → durable MI11_HOLD_REJECTED (no showId, holdId in extra)", async () => {
    vi.spyOn(gate, "rejectMi11Hold").mockResolvedValue({ ok: true });
    const sink = capture();
    const fd = new FormData();
    fd.set("holdId", "h2");
    await mi11RejectAction(null, fd);
    const rec = sink.filter((r) => r.code === "MI11_HOLD_REJECTED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("info");
    expect(rec[0]!.source).toBe("admin.show.feed.mi11Reject");
    expect(typeof rec[0]!.actorHash).toBe("string");
    expect(rec[0]!.showId).toBeNull(); // reject never surfaces a showId
    expect(rec[0]!.context.holdId).toBe("h2");
  });

  it("mi11RejectAction refusal → NO MI11_HOLD_REJECTED row", async () => {
    vi.spyOn(gate, "rejectMi11Hold").mockResolvedValue({ ok: false, code: "MI11_HOLD_GONE" });
    const sink = capture();
    const fd = new FormData();
    fd.set("holdId", "h2");
    await mi11RejectAction(null, fd);
    expect(sink.some((r) => r.code === "MI11_HOLD_REJECTED")).toBe(false);
  });

  it("undoChangeAction success → durable CHANGE_UNDONE (hashed actor, showId, changeLogId)", async () => {
    vi.spyOn(undo, "undoChange").mockResolvedValue({ ok: true, showId: "show-9" });
    const sink = capture();
    const fd = new FormData();
    fd.set("changeLogId", "cl-9");
    await undoChangeAction(null, fd);
    const rec = sink.filter((r) => r.code === "CHANGE_UNDONE");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("info");
    expect(rec[0]!.source).toBe("admin.show.feed.undoChange");
    expect(typeof rec[0]!.actorHash).toBe("string");
    expect(rec[0]!.showId).toBe("show-9");
    expect(rec[0]!.context.changeLogId).toBe("cl-9");
  });

  it("undoChangeAction refusal → NO CHANGE_UNDONE row", async () => {
    vi.spyOn(undo, "undoChange").mockResolvedValue({ ok: false, code: "CHANGE_ALREADY_UNDONE" });
    const sink = capture();
    const fd = new FormData();
    fd.set("changeLogId", "cl-9");
    await undoChangeAction(null, fd);
    expect(sink.some((r) => r.code === "CHANGE_UNDONE")).toBe(false);
  });
});
