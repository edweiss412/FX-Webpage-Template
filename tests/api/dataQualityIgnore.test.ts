import { describe, expect, test } from "vitest";
import { handleIgnore } from "@/app/api/admin/show/[slug]/data-quality/ignore/route";

const ctx = (slug = "rpas") => ({ params: Promise.resolve({ slug }) });
const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
const admin = async () => ({ email: "Admin@Example.com" });

function fakeTx(captured: { sql: string; params: unknown[] }[], show: { id: string } | null = { id: "sid" }) {
  return async <R>(
    fn: (tx: {
      queryOne<T>(sql: string, p: unknown[]): Promise<T | null>;
      run(sql: string, p: unknown[]): Promise<void>;
    }) => Promise<R>,
  ) =>
    fn({
      async queryOne<T>(sql: string, params: unknown[]) {
        captured.push({ sql, params });
        return (/from public\.shows/.test(sql) ? show : null) as T | null;
      },
      async run(sql: string, params: unknown[]) {
        captured.push({ sql, params });
      },
    });
}

describe("handleIgnore", () => {
  test("AC-5: inserts one row with canonical ignored_by + computed fingerprint", async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const res = await handleIgnore(req({ code: "UNKNOWN_FIELD", rawSnippet: "Storage | x" }), ctx(), {
      requireAdminIdentity: admin,
      withTx: fakeTx(captured),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ignored" });
    const insert = captured.find((c) => /insert into public\.ignored_warnings/.test(c.sql))!;
    expect(insert.sql).toMatch(/on conflict \(show_id, fingerprint\) do nothing/);
    expect(insert.params).toContain("admin@example.com"); // canonicalized
    expect(insert.sql).not.toMatch(/raw_snippet/); // PII never stored
  });

  test("non-admin → 403 ADMIN_FORBIDDEN", async () => {
    const res = await handleIgnore(req({ code: "X", rawSnippet: "y" }), ctx(), {
      requireAdminIdentity: async () => {
        throw { code: "NOT_ADMIN" };
      },
      withTx: fakeTx([]),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, code: "ADMIN_FORBIDDEN" });
  });

  test("infra auth fault → 500 ADMIN_SESSION_LOOKUP_FAILED", async () => {
    const res = await handleIgnore(req({ code: "X", rawSnippet: "y" }), ctx(), {
      requireAdminIdentity: async () => {
        throw { code: "ADMIN_SESSION_LOOKUP_FAILED" };
      },
      withTx: fakeTx([]),
    });
    expect(res.status).toBe(500);
  });

  test("empty/blank snippet → 400 (not ignorable)", async () => {
    const res = await handleIgnore(req({ code: "X", rawSnippet: "   " }), ctx(), {
      requireAdminIdentity: admin,
      withTx: fakeTx([]),
    });
    expect(res.status).toBe(400);
  });

  test("missing show → 404", async () => {
    const res = await handleIgnore(req({ code: "X", rawSnippet: "y" }), ctx(), {
      requireAdminIdentity: admin,
      withTx: fakeTx([], null),
    });
    expect(res.status).toBe(404);
  });
});
