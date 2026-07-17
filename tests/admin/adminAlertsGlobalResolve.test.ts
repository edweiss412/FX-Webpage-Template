import { describe, expect, test, vi } from "vitest";
import type {
  AdminAlertGlobalResolveDeps,
  AdminAlertGlobalResolveTx,
} from "@/app/api/admin/admin-alerts/[id]/resolve/route";
import { handleAdminAlertGlobalResolve } from "@/app/api/admin/admin-alerts/[id]/resolve/route";

const A1 = "44444444-4444-4444-8444-444444444444";

class FakeGlobalAlertTx implements AdminAlertGlobalResolveTx {
  row: {
    id: string;
    show_id: string | null;
    slug: string | null;
    resolved_at: string | null;
  } | null = { id: A1, show_id: null, slug: null, resolved_at: null };
  updated = false;
  selectSql: string | null = null;
  async queryOne<T>(sql: string, params: unknown[]) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized.startsWith("select")) {
      this.selectSql = normalized;
      return this.row as T;
    }
    if (normalized.startsWith("update public.admin_alerts")) {
      if (this.row?.show_id !== null) return null as T;
      this.updated = true;
      this.row = { ...this.row!, resolved_at: "DB_NOW" };
      return this.row as T;
    }
    throw new Error(`Unhandled global alert SQL: ${normalized} ${JSON.stringify(params)}`);
  }
}

function deps(
  tx: FakeGlobalAlertTx,
  overrides: Partial<AdminAlertGlobalResolveDeps> = {},
): AdminAlertGlobalResolveDeps {
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
    withTx: async (fn) => fn(tx),
    ...overrides,
  };
}

async function json(response: Response): Promise<unknown> {
  return await response.json();
}

describe("global admin alert resolve route", () => {
  test("resolves a global alert idempotently", async () => {
    const tx = new FakeGlobalAlertTx();

    const response = await handleAdminAlertGlobalResolve(
      new Request("https://crew.fxav.test"),
      {
        params: Promise.resolve({ id: A1 }),
      },
      deps(tx),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "resolved", id: A1, resolved_at: "DB_NOW" });
    expect(tx.updated).toBe(true);
  });

  // Regression (ADMIN_ALERT_RESOLVE_FAILED, 2026-07-17): the locking SELECT joins
  // `shows` via LEFT JOIN (nullable side) to backfill slug. A BARE `for update`
  // locks every table in the query, so Postgres rejects it with "FOR UPDATE cannot
  // be applied to the nullable side of an outer join" → the route threw a 500 on
  // EVERY global resolve. The lock must be scoped to the base alias (`for update of
  // a`). The mocked tx here never executes SQL, so this asserts the SQL shape; the
  // real-DB behavioral proof is the psql round-trip in the PR description.
  test("locking select scopes FOR UPDATE to the alert alias (not the outer-joined shows)", async () => {
    const tx = new FakeGlobalAlertTx();
    await handleAdminAlertGlobalResolve(
      new Request("https://crew.fxav.test"),
      { params: Promise.resolve({ id: A1 }) },
      deps(tx),
    );
    expect(tx.selectSql).toContain("left join public.shows");
    // Scoped lock present …
    expect(tx.selectSql).toMatch(/for update of a\b/);
    // … and NOT a bare, unscoped `for update` (which would lock the nullable side).
    expect(tx.selectSql).not.toMatch(/for update(?!\s+of\b)/);
  });

  test("returns 400 ALERT_REQUIRES_SHOW_SCOPED_RESOLVE for per-show alerts", async () => {
    const tx = new FakeGlobalAlertTx();
    tx.row = { id: A1, show_id: "show-1", slug: "test-show", resolved_at: null };

    const response = await handleAdminAlertGlobalResolve(
      new Request("https://crew.fxav.test"),
      {
        params: Promise.resolve({ id: A1 }),
      },
      deps(tx),
    );

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({
      ok: false,
      code: "ALERT_REQUIRES_SHOW_SCOPED_RESOLVE",
      id: A1,
      show_id: "show-1",
      redirect_to: "/api/admin/show/test-show/alerts/44444444-4444-4444-8444-444444444444/resolve",
    });
    expect(tx.updated).toBe(false);
  });

  test("missing alert returns 404", async () => {
    const tx = new FakeGlobalAlertTx();
    tx.row = null;

    const response = await handleAdminAlertGlobalResolve(
      new Request("https://crew.fxav.test"),
      {
        params: Promise.resolve({ id: A1 }),
      },
      deps(tx),
    );

    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({ ok: false, code: "ADMIN_ALERT_NOT_FOUND" });
  });
});
