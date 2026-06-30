import { afterEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;
function mockClient(rows: Row[], opts: { error?: unknown } = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  const rec =
    (m: string) =>
    (...a: unknown[]) => {
      calls.push({ method: m, args: a });
      return builder;
    };
  for (const m of ["select", "in", "eq", "gte", "ilike", "order", "or"]) builder[m] = rec(m);
  builder.limit = (...a: unknown[]) => {
    calls.push({ method: "limit", args: a });
    return Promise.resolve({ data: rows, error: opts.error ?? null });
  };
  return {
    from: (t: string) => {
      calls.push({ method: "from", args: [t] });
      return builder;
    },
    __calls: calls,
  };
}
function mk(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`,
    occurred_at: `2026-06-29T00:00:${String(i).padStart(2, "0")}.000Z`,
    level: "error",
    source: "auth",
    message: "m",
    code: null,
    request_id: null,
    show_id: null,
    drive_file_id: null,
    actor_hash: null,
    context: {},
    shows: null,
  }));
}
afterEach(() => vi.restoreAllMocks());

async function withClient(client: unknown) {
  vi.resetModules();
  vi.doMock("@/lib/supabase/server", () => ({ createSupabaseServiceRoleClient: () => client }));
  // Stub lib/log so the loader's best-effort `void log.error(...)` does not fire an async persist
  // (which, un-awaited, would otherwise leak a `.from()` call into a later test's mock client).
  vi.doMock("@/lib/log", () => ({
    log: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
  }));
  return (await import("@/lib/admin/loadAppEvents")).loadAppEvents;
}

describe("loadAppEvents", () => {
  test("returns kind:ok, trims to PAGE_SIZE, hasMore when N+1 rows", async () => {
    const client = mockClient(mk(101));
    const loadAppEvents = await withClient(client);
    const r = await loadAppEvents({});
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.events).toHaveLength(100);
    expect(r.hasMore).toBe(true);
    expect(r.nextCursor).toEqual({ occurredAt: r.events[99]!.occurredAt, id: r.events[99]!.id });
    expect(client.__calls.some((c) => c.method === "limit" && c.args[0] === 101)).toBe(true);
  });

  test("EMPTY filters {} default to a 24h occurred_at lower bound; since=all omits it", async () => {
    const c1 = mockClient(mk(1));
    const load1 = await withClient(c1);
    await load1({});
    expect(c1.__calls.some((c) => c.method === "gte" && c.args[0] === "occurred_at")).toBe(true);
    const c2 = mockClient(mk(1));
    const load2 = await withClient(c2);
    await load2({ sinceHours: null });
    expect(c2.__calls.some((c) => c.method === "gte")).toBe(false);
  });

  test("levels/source/code/showId/requestId/q produce the matching builder calls", async () => {
    const c = mockClient(mk(0));
    const load = await withClient(c);
    await load({
      levels: ["warn", "error"],
      source: "cron.sync",
      code: "CRON_RUN_SUMMARY",
      showId: "00000000-0000-0000-0000-000000000001",
      requestId: "req-9",
      q: "5%x",
    });
    expect(c.__calls.some((x) => x.method === "in" && x.args[0] === "level")).toBe(true);
    expect(c.__calls.some((x) => x.method === "eq" && x.args[0] === "source")).toBe(true);
    expect(c.__calls.some((x) => x.method === "eq" && x.args[0] === "code")).toBe(true);
    expect(
      c.__calls.some(
        (x) =>
          x.method === "eq" &&
          x.args[0] === "show_id" &&
          x.args[1] === "00000000-0000-0000-0000-000000000001",
      ),
    ).toBe(true);
    expect(
      c.__calls.some(
        (x) => x.method === "eq" && x.args[0] === "request_id" && x.args[1] === "req-9",
      ),
    ).toBe(true);
    // q is escaped + wrapped
    expect(c.__calls.some((x) => x.method === "ilike" && String(x.args[1]).includes("5\\%x"))).toBe(
      true,
    );
  });

  test("cursor → exactly one .or(...) keyset predicate with occurred_at AND id tie-breaker", async () => {
    const c = mockClient(mk(0));
    const load = await withClient(c);
    await load({ cursor: { occurredAt: "2026-06-29T00:00:00.000Z", id: "id-9" } });
    const ors = c.__calls.filter((x) => x.method === "or");
    expect(ors).toHaveLength(1);
    const pred = String(ors[0]!.args[0]);
    expect(pred).toContain("occurred_at.lt.2026-06-29T00:00:00.000Z");
    // the tie-breaker MUST be the AND group — a bare `id.lt.id-9` would drop valid older rows
    // whose occurred_at differs, so assert the exact `and(occurred_at.eq…,id.lt…)` shape.
    expect(pred).toContain("and(occurred_at.eq.2026-06-29T00:00:00.000Z,id.lt.id-9)");
  });

  test("returned {error} → infra_error (no throw, message names app_events)", async () => {
    const c = mockClient([], { error: { message: "boom" } });
    const load = await withClient(c);
    const r = await load({});
    expect(r).toMatchObject({ kind: "infra_error" });
    expect((r as { message: string }).message).toMatch(/app_events/);
  });

  test("thrown from builder → infra_error with /app_events.*threw/", async () => {
    const throwing = {
      from: () => {
        throw new Error("net reset");
      },
    };
    const load = await withClient(throwing);
    const r = await load({});
    expect(r).toMatchObject({ kind: "infra_error" });
    expect((r as { message: string }).message).toMatch(/app_events.*threw/);
  });

  test("shows embed: select REQUESTS shows(title, slug), single from(app_events), maps showTitle+showSlug", async () => {
    const rows = mk(1).map((row) => ({
      ...row,
      show_id: "s1",
      shows: { title: "RPAS", slug: "rpas-central" },
    }));
    const c = mockClient(rows);
    const load = await withClient(c);
    const r = await load({});
    if (r.kind !== "ok") throw new Error("ok");
    expect(r.events[0]!.showTitle).toBe("RPAS");
    expect(r.events[0]!.showSlug).toBe("rpas-central"); // slug drives the link, not the UUID
    const selectCall = c.__calls.find((x) => x.method === "select");
    expect(String(selectCall?.args[0])).toContain("shows(title, slug)");
    expect(c.__calls.filter((x) => x.method === "from" && x.args[0] === "shows")).toHaveLength(0);
    expect(c.__calls.filter((x) => x.method === "from")).toHaveLength(1); // only app_events
  });
});
