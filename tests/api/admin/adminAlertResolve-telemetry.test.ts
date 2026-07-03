import { afterEach, describe, expect, test } from "vitest";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import { handleAdminAlertGlobalResolve } from "@/app/api/admin/admin-alerts/[id]/resolve/route";
import { handleAdminAlertShowResolve } from "@/app/api/admin/show/[slug]/alerts/[id]/resolve/route";

// S3 — admin-alert resolve durable telemetry (both scopes). setLogSink capture proves the
// POST-COMMIT ADMIN_ALERT_RESOLVED and the withTx-throw ADMIN_ALERT_RESOLVE_FAILED; an idempotent
// re-resolve (already resolved) commits nothing → emits nothing.

function capture(): LogRecord[] {
  const sink: LogRecord[] = [];
  setLogSink((r) => {
    sink.push(r);
  });
  return sink;
}
afterEach(() => resetLogSink());

const admin = async () => ({ email: "Admin@Example.com" });
const req = () => new Request("http://x", { method: "POST" });

type AlertRow = {
  id: string;
  show_id: string | null;
  slug: string | null;
  resolved_at: string | null;
};

function globalTx(first: AlertRow | null, updated: AlertRow | null = null) {
  return async <R>(
    fn: (tx: { queryOne<T>(sql: string, p: unknown[]): Promise<T | null> }) => Promise<R>,
  ) =>
    fn({
      async queryOne<T>(sql: string) {
        if (/update public\.admin_alerts/.test(sql)) return updated as T | null;
        return first as T | null;
      },
    });
}

function showTx(
  show: { id: string; slug: string } | null,
  alert: AlertRow | null,
  updated: AlertRow | null = null,
) {
  return async <R>(
    fn: (tx: { queryOne<T>(sql: string, p: unknown[]): Promise<T | null> }) => Promise<R>,
  ) =>
    fn({
      async queryOne<T>(sql: string) {
        if (/from public\.shows/.test(sql)) return show as T | null;
        if (/update public\.admin_alerts/.test(sql)) return updated as T | null;
        return alert as T | null;
      },
    });
}

describe("admin-alert global resolve telemetry", () => {
  const ctx = (id = "a1") => ({ params: Promise.resolve({ id }) });

  test("real mutation → POST-COMMIT ADMIN_ALERT_RESOLVED (actor hashed, no showId)", async () => {
    const sink = capture();
    const res = await handleAdminAlertGlobalResolve(req(), ctx(), {
      requireAdminIdentity: admin,
      withTx: globalTx(
        { id: "a1", show_id: null, slug: null, resolved_at: null },
        { id: "a1", show_id: null, slug: null, resolved_at: "2026-07-02T00:00:00Z" },
      ),
    });
    expect(res.status).toBe(200);
    const rec = sink.filter((r) => r.code === "ADMIN_ALERT_RESOLVED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.source).toBe("api.admin.admin-alerts.resolve");
    expect(typeof rec[0]!.actorHash).toBe("string"); // hashed, never raw
    expect(rec[0]!.showId).toBeNull(); // global scope
  });

  test("idempotent (already resolved) → NO emission", async () => {
    const sink = capture();
    const res = await handleAdminAlertGlobalResolve(req(), ctx(), {
      requireAdminIdentity: admin,
      withTx: globalTx({
        id: "a1",
        show_id: null,
        slug: null,
        resolved_at: "2026-07-01T00:00:00Z",
      }),
    });
    expect(res.status).toBe(200);
    expect(sink.some((r) => r.code === "ADMIN_ALERT_RESOLVED")).toBe(false);
  });

  test("withTx throw → ADMIN_ALERT_RESOLVE_FAILED, rethrows (no behavior change)", async () => {
    const sink = capture();
    await expect(
      handleAdminAlertGlobalResolve(req(), ctx(), {
        requireAdminIdentity: admin,
        withTx: async () => {
          throw new Error("db down");
        },
      }),
    ).rejects.toThrow("db down");
    const rec = sink.filter((r) => r.code === "ADMIN_ALERT_RESOLVE_FAILED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("error");
    expect(sink.some((r) => r.code === "ADMIN_ALERT_RESOLVED")).toBe(false);
  });
});

describe("admin-alert show-scoped resolve telemetry", () => {
  const ctx = (slug = "rpas", id = "a1") => ({ params: Promise.resolve({ slug, id }) });

  test("real mutation → POST-COMMIT ADMIN_ALERT_RESOLVED (showId = show.id)", async () => {
    const sink = capture();
    const res = await handleAdminAlertShowResolve(req(), ctx(), {
      requireAdminIdentity: admin,
      withTx: showTx(
        { id: "show-9", slug: "rpas" },
        { id: "a1", show_id: "show-9", slug: null, resolved_at: null },
        { id: "a1", show_id: "show-9", slug: null, resolved_at: "2026-07-02T00:00:00Z" },
      ),
    });
    expect(res.status).toBe(200);
    const rec = sink.filter((r) => r.code === "ADMIN_ALERT_RESOLVED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.source).toBe("api.admin.show.alerts.resolve");
    expect(rec[0]!.showId).toBe("show-9");
  });

  test("idempotent (already resolved) → NO emission", async () => {
    const sink = capture();
    const res = await handleAdminAlertShowResolve(req(), ctx(), {
      requireAdminIdentity: admin,
      withTx: showTx(
        { id: "show-9", slug: "rpas" },
        { id: "a1", show_id: "show-9", slug: null, resolved_at: "2026-07-01T00:00:00Z" },
      ),
    });
    expect(res.status).toBe(200);
    expect(sink.some((r) => r.code === "ADMIN_ALERT_RESOLVED")).toBe(false);
  });

  test("withTx throw → ADMIN_ALERT_RESOLVE_FAILED, rethrows", async () => {
    const sink = capture();
    await expect(
      handleAdminAlertShowResolve(req(), ctx(), {
        requireAdminIdentity: admin,
        withTx: async () => {
          throw new Error("db down");
        },
      }),
    ).rejects.toThrow("db down");
    const rec = sink.filter((r) => r.code === "ADMIN_ALERT_RESOLVE_FAILED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("error");
  });
});
