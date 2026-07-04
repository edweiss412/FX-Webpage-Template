import { describe, expect, test } from "vitest";
import { collectEvents } from "@/scripts/observe/collect";
import type { QueryEventsResult } from "@/lib/observe/query";

function ev(id: string) {
  return {
    id,
    occurredAt: "2026-07-03T00:00:00.000Z",
    level: "info" as const,
    source: "s",
    message: "m",
    code: null,
    requestId: null,
    showId: null,
    driveFileId: null,
    actorHash: null,
    context: {},
    showTitle: null,
    showSlug: null,
  };
}
function pages(...defs: QueryEventsResult[]) {
  let i = 0;
  return async () => defs[Math.min(i++, defs.length - 1)]!;
}

describe("collectEvents", () => {
  test("accumulates across two pages up to limit (b: !hasMore)", async () => {
    const q = pages(
      {
        kind: "ok",
        events: [ev("a"), ev("b")],
        hasMore: true,
        nextCursor: { occurredAt: "t", id: "b" },
      },
      { kind: "ok", events: [ev("c")], hasMore: false, nextCursor: null },
    );
    const r = await collectEvents(q, {}, 100);
    if (r.kind !== "ok") throw new Error("infra");
    expect(r.events.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
  test("(a) truncates at limit AND nextCursor points at last RETURNED row (not past dropped rows)", async () => {
    const q = pages({
      kind: "ok",
      events: [ev("a"), ev("b"), ev("c")],
      hasMore: true,
      nextCursor: { occurredAt: "t", id: "c" },
    });
    const r = await collectEvents(q, {}, 2);
    if (r.kind !== "ok") throw new Error("infra");
    expect(r.events.map((e) => e.id)).toEqual(["a", "b"]);
    // must resume from "b" (the last returned), NOT "c" (which we never emitted)
    expect(r.nextCursor).toEqual({ occurredAt: "2026-07-03T00:00:00.000Z", id: "b" });
  });
  test("(d) non-advancing cursor stops (no infinite loop)", async () => {
    let calls = 0;
    const q = async (_f: import("@/lib/admin/observabilityTypes").AppEventFilters) => {
      calls++;
      return {
        kind: "ok" as const,
        events: [ev(`x${calls}`)],
        hasMore: true,
        nextCursor: { occurredAt: "t", id: "same" },
      };
    };
    const r = await collectEvents(q, { cursor: { occurredAt: "t", id: "same" } }, 500);
    expect(r.kind).toBe("ok");
    expect(calls).toBeLessThanOrEqual(2); // stops on non-advance, does not spin
  });
  test("(c) null nextCursor stops", async () => {
    const q = pages({ kind: "ok", events: [ev("a")], hasMore: true, nextCursor: null });
    const r = await collectEvents(q, {}, 500);
    if (r.kind !== "ok") throw new Error("infra");
    expect(r.events.length).toBe(1);
  });
  test("(e) empty page stops", async () => {
    const q = pages({
      kind: "ok",
      events: [],
      hasMore: true,
      nextCursor: { occurredAt: "t", id: "z" },
    });
    const r = await collectEvents(q, {}, 500);
    if (r.kind !== "ok") throw new Error("infra");
    expect(r.events.length).toBe(0);
  });
  test("(f) page cap: never more than 6 calls", async () => {
    let calls = 0;
    const q = async () => {
      calls++;
      return {
        kind: "ok" as const,
        events: [ev(`p${calls}`)],
        hasMore: true,
        nextCursor: { occurredAt: "t", id: `c${calls}` },
      };
    };
    await collectEvents(q, {}, 500);
    expect(calls).toBeLessThanOrEqual(6);
  });
  test("mid-loop infra_error surfaces", async () => {
    const q = pages(
      { kind: "ok", events: [ev("a")], hasMore: true, nextCursor: { occurredAt: "t", id: "a" } },
      { kind: "infra_error", message: "down" },
    );
    expect((await collectEvents(q, {}, 500)).kind).toBe("infra_error");
  });
});
