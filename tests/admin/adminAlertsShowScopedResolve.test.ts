import { describe, expect, test, vi } from "vitest";
import type {
  AdminAlertShowResolveDeps,
  AdminAlertShowResolveTx,
} from "@/app/api/admin/show/[slug]/alerts/[id]/resolve/route";
import { handleAdminAlertShowResolve } from "@/app/api/admin/show/[slug]/alerts/[id]/resolve/route";

const A1 = "44444444-4444-4444-8444-444444444444";

class FakeShowAlertTx implements AdminAlertShowResolveTx {
  show: { id: string; slug: string } | null = { id: "show-1", slug: "test-show" };
  alert: { id: string; show_id: string; resolved_at: string | null } | null = {
    id: A1,
    show_id: "show-1",
    resolved_at: null,
  };
  updated = false;

  async queryOne<T>(sql: string, params: unknown[]) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized.startsWith("select id, slug")) return this.show as T;
    if (normalized.startsWith("select id, show_id")) {
      const alert = this.alert;
      if (!alert || alert.id !== params[0]) return null as T;
      if (alert.show_id !== params[1]) return null as T;
      return alert as T;
    }
    if (normalized.startsWith("update public.admin_alerts")) {
      if (!this.alert || this.alert.show_id !== params[1]) return null as T;
      this.updated = true;
      this.alert = { ...this.alert!, resolved_at: "DB_NOW" };
      return this.alert as T;
    }
    throw new Error(`Unhandled show alert SQL: ${normalized}`);
  }
}

function deps(
  tx: FakeShowAlertTx,
  overrides: Partial<AdminAlertShowResolveDeps> = {},
): AdminAlertShowResolveDeps {
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
    withTx: async (fn) => fn(tx),
    ...overrides,
  };
}

async function json(response: Response): Promise<unknown> {
  return await response.json();
}

describe("show-scoped admin alert resolve route", () => {
  test("resolves matching show alert idempotently", async () => {
    const tx = new FakeShowAlertTx();

    const response = await handleAdminAlertShowResolve(
      new Request("https://crew.fxav.test"),
      {
        params: Promise.resolve({ slug: "test-show", id: A1 }),
      },
      deps(tx),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "resolved", id: A1, resolved_at: "DB_NOW" });
    expect(tx.updated).toBe(true);
  });

  test("cross-show forgery returns ADMIN_ALERT_NOT_FOUND without leaking existence", async () => {
    const tx = new FakeShowAlertTx();
    tx.alert = { id: A1, show_id: "other-show", resolved_at: null };

    const response = await handleAdminAlertShowResolve(
      new Request("https://crew.fxav.test"),
      {
        params: Promise.resolve({ slug: "test-show", id: A1 }),
      },
      deps(tx),
    );

    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({ ok: false, code: "ADMIN_ALERT_NOT_FOUND" });
    expect(tx.updated).toBe(false);
  });
});
