import { afterEach, describe, expect, test, vi } from "vitest";

// Per-source latest-row mock that ALSO records builder calls (so we can pin the code+source+limit
// filters, not just observe seeded data — non-tautological).
function mockClient(
  bySource: Record<string, Record<string, unknown> | null>,
  opts: { error?: unknown; throwOnFrom?: boolean } = {},
) {
  const calls: { method: string; args: unknown[] }[] = [];
  return {
    __calls: calls,
    from(table?: string) {
      if (opts.throwOnFrom) throw new Error("net reset");
      calls.push({ method: "from", args: [table] });
      let source = "";
      const b: Record<string, unknown> = {};
      b.select = (...a: unknown[]) => {
        calls.push({ method: "select", args: a });
        return b;
      };
      b.order = (...a: unknown[]) => {
        calls.push({ method: "order", args: a });
        return b;
      };
      b.eq = (col: string, val: string) => {
        calls.push({ method: "eq", args: [col, val] });
        if (col === "source") source = val;
        return b;
      };
      b.limit = (...a: unknown[]) => {
        calls.push({ method: "limit", args: a });
        return Promise.resolve({
          data: opts.error ? null : bySource[source] ? [bySource[source]] : [],
          error: opts.error ?? null,
        });
      };
      return b;
    },
  };
}
afterEach(() => vi.restoreAllMocks());
async function withClient(client: unknown) {
  vi.resetModules();
  vi.doMock("@/lib/supabase/server", () => ({ createSupabaseServiceRoleClient: () => client }));
  // Stub lib/log so the loader's best-effort `void log.error(...)` does not fire an async persist
  // (un-awaited, it would otherwise leak a `.from()` into a later test's mock client).
  vi.doMock("@/lib/log", () => ({
    log: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
  }));
  return (await import("@/lib/admin/loadCronHealth")).loadCronHealth;
}
const row = (over: Record<string, unknown>) => ({
  occurred_at: "2026-06-29T00:00:00.000Z",
  level: "info",
  context: { outcome: "ok", counts: { processed: 3 } },
  ...over,
});

describe("loadCronHealth", () => {
  test("ok: one CronHealthRow per CRON_JOBS entry (9), latest per source", async () => {
    const load = await withClient(mockClient({ "cron.sync": row({}) }));
    const r = await load();
    if (r.kind !== "ok") throw new Error("ok");
    expect(r.jobs).toHaveLength(9);
    const sync = r.jobs.find((j) => j.jobName === "sync")!;
    expect(sync.lastRunAt).toBe("2026-06-29T00:00:00.000Z");
    expect(sync.outcome).toBe("ok");
    expect(sync.counts).toMatchObject({ processed: 3 });
    expect(sync.staleAfterMs).toBeGreaterThan(0);
  });
  test("each per-job read pins code=CRON_RUN_SUMMARY + source=cron.<job> + limit(1) (9 of each)", async () => {
    const c = mockClient({});
    const load = await withClient(c);
    await load();
    const eqCode = c.__calls.filter((x) => x.method === "eq" && x.args[0] === "code");
    expect(eqCode).toHaveLength(9);
    expect(eqCode.every((x) => x.args[1] === "CRON_RUN_SUMMARY")).toBe(true);
    expect(c.__calls.filter((x) => x.method === "eq" && x.args[0] === "source")).toHaveLength(9);
    expect(c.__calls.filter((x) => x.method === "limit" && x.args[0] === 1)).toHaveLength(9);
  });
  test("no row → lastRunAt null, outcome null", async () => {
    const load = await withClient(mockClient({}));
    const r = await load();
    if (r.kind !== "ok") throw new Error("ok");
    const keepalive = r.jobs.find((j) => j.jobName === "keepalive")!;
    expect(keepalive.lastRunAt).toBeNull();
    expect(keepalive.outcome).toBeNull();
  });
  test("malformed context.outcome → outcome null but lastRunAt set (distinct from no-row)", async () => {
    const load = await withClient(
      mockClient({ "cron.sync": row({ level: "warn", context: { outcome: "weird" } }) }),
    );
    const r = await load();
    if (r.kind !== "ok") throw new Error("ok");
    const sync = r.jobs.find((j) => j.jobName === "sync")!;
    expect(sync.lastRunAt).toBe("2026-06-29T00:00:00.000Z");
    expect(sync.outcome).toBeNull();
    expect(sync.level).toBe("warn");
  });
  test("returned {error} on a read → infra_error 'returned error' (distinct from threw)", async () => {
    const load = await withClient(mockClient({}, { error: { message: "boom" } }));
    const r = await load();
    expect(r).toMatchObject({ kind: "infra_error" });
    expect((r as { message: string }).message).toMatch(/returned error/);
  });
  test("thrown → infra_error /app_events.*threw/", async () => {
    const load = await withClient(mockClient({}, { throwOnFrom: true }));
    const r = await load();
    expect(r).toMatchObject({ kind: "infra_error" });
    expect((r as { message: string }).message).toMatch(/app_events.*threw/);
  });
});
