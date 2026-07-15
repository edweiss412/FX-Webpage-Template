// @vitest-environment node
//
// Per-show Sheet-changes feed accept server actions (spec 2026-07-15 §3).
// Mirrors tests/admin/autoAppliedActions.test.ts for the dashboard pair: each
// committed accept delegates to the guarded acknowledgeChanges helper,
// revalidates BOTH the show page and /admin POST-COMMIT (the dashboard strip
// must drop accepted rows), and leaves a durable CHANGES_ACKNOWLEDGED audit
// row — a refused / early-return result leaves NO row and NEVER calls the
// helper.
//
// Concrete failure modes caught:
//   (1) an accept submitted without showId/changeLogId calls acknowledgeChanges anyway;
//   (2) a committed accept misses one of the two revalidate targets (stale strip or feed);
//   (3) a refused ({ok:false}) op logs a false success;
//   (4) accept busts the crew-data cache tag (it must not — acknowledgement
//       mutates no crew-facing data);
//   (5) Accept-all forwards duplicates / whitespace noise instead of the
//       deduped id list, or treats an empty payload as a valid no-op;
//   (6) a count:0 success (stale-id race vs the dashboard strip) is mislabeled
//       a failure.
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
import { acceptChangeAction, acceptAllAction } from "@/app/admin/show/[slug]/_actions/feed";

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

describe("Sheet-changes feed: acceptChangeAction", () => {
  it("success → acknowledgeChanges(showId,[changeLogId]) + BOTH revalidates + durable CHANGES_ACKNOWLEDGED (source admin.show.feed.accept); crew-data tag untouched", async () => {
    const spy = vi.spyOn(ack, "acknowledgeChanges").mockResolvedValue({ ok: true, count: 1 });
    const sink = capture();
    const fd = new FormData();
    fd.set("showId", SHOW_ID);
    fd.set("changeLogId", "cl-1");
    const res = await acceptChangeAction(null, fd);
    expect(res).toMatchObject({ ok: true, count: 1 });
    expect(requireAdminIdentity).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(SHOW_ID, ["cl-1"]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/show/[slug]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "page");
    expect(revalidateShow).not.toHaveBeenCalled();
    const rec = sink.filter((r) => r.code === "CHANGES_ACKNOWLEDGED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.source).toBe("admin.show.feed.accept");
  });

  it("empty showId → typed refusal; helper NOT called; no telemetry", async () => {
    const spy = vi.spyOn(ack, "acknowledgeChanges");
    const sink = capture();
    const fd = new FormData();
    fd.set("changeLogId", "cl-1");
    const res = await acceptChangeAction(null, fd);
    expect(res).toEqual({ ok: false, code: "SYNC_INFRA_ERROR" });
    expect(spy).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(sink.filter((r) => r.code === "CHANGES_ACKNOWLEDGED")).toHaveLength(0);
  });

  it("empty changeLogId → same refusal (deliberate tightening vs dashboard near-copy)", async () => {
    const spy = vi.spyOn(ack, "acknowledgeChanges");
    const fd = new FormData();
    fd.set("showId", SHOW_ID);
    const res = await acceptChangeAction(null, fd);
    expect(res).toEqual({ ok: false, code: "SYNC_INFRA_ERROR" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("helper {ok:false} passthrough — no revalidate, no telemetry", async () => {
    vi.spyOn(ack, "acknowledgeChanges").mockResolvedValue({
      ok: false,
      code: "SYNC_INFRA_ERROR",
    });
    const sink = capture();
    const fd = new FormData();
    fd.set("showId", SHOW_ID);
    fd.set("changeLogId", "cl-1");
    const res = await acceptChangeAction(null, fd);
    expect(res).toEqual({ ok: false, code: "SYNC_INFRA_ERROR" });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(sink.filter((r) => r.code === "CHANGES_ACKNOWLEDGED")).toHaveLength(0);
  });
});

describe("Sheet-changes feed: acceptAllAction", () => {
  it("ids ' a, b ,,b, ' → delegates deduped ['a','b']; success logs count+requested", async () => {
    const spy = vi.spyOn(ack, "acknowledgeChanges").mockResolvedValue({ ok: true, count: 2 });
    const sink = capture();
    const fd = new FormData();
    fd.set("showId", SHOW_ID);
    fd.set("ids", " a, b ,,b, ");
    const res = await acceptAllAction(null, fd);
    expect(res).toMatchObject({ ok: true, count: 2 });
    expect(spy).toHaveBeenCalledWith(SHOW_ID, ["a", "b"]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/show/[slug]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/admin", "page");
    const rec = sink.filter((r) => r.code === "CHANGES_ACKNOWLEDGED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.source).toBe("admin.show.feed.acceptAll");
  });

  it("empty / whitespace-only ids → typed refusal; helper NOT called", async () => {
    const spy = vi.spyOn(ack, "acknowledgeChanges");
    for (const raw of ["", " ", ",,", " , , "]) {
      const fd = new FormData();
      fd.set("showId", SHOW_ID);
      fd.set("ids", raw);
      const res = await acceptAllAction(null, fd);
      expect(res).toEqual({ ok: false, code: "SYNC_INFRA_ERROR" });
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("empty showId → typed refusal even with valid ids", async () => {
    const spy = vi.spyOn(ack, "acknowledgeChanges");
    const fd = new FormData();
    fd.set("ids", "a,b");
    const res = await acceptAllAction(null, fd);
    expect(res).toEqual({ ok: false, code: "SYNC_INFRA_ERROR" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("count:0 success passthrough (stale-id race with the dashboard strip) is still {ok:true} and logs", async () => {
    vi.spyOn(ack, "acknowledgeChanges").mockResolvedValue({ ok: true, count: 0 });
    const sink = capture();
    const fd = new FormData();
    fd.set("showId", SHOW_ID);
    fd.set("ids", "already-acked");
    const res = await acceptAllAction(null, fd);
    expect(res).toEqual({ ok: true, count: 0 });
    expect(sink.filter((r) => r.code === "CHANGES_ACKNOWLEDGED")).toHaveLength(1);
  });
});
