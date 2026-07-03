import { describe, expect, test, vi } from "vitest";
import { handleIgnore } from "@/app/api/admin/show/[slug]/data-quality/ignore/route";

const { logAdminOutcomeMock } = vi.hoisted(() => ({ logAdminOutcomeMock: vi.fn() }));
vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome: logAdminOutcomeMock }));

const ctx = (slug = "rpas") => ({ params: Promise.resolve({ slug }) });
const req = (body: unknown) =>
  new Request("http://x", { method: "POST", body: JSON.stringify(body) });
const admin = async () => ({ email: "Admin@Example.com" });

function fakeTx(
  captured: { sql: string; params: unknown[] }[],
  show: { id: string } | null = { id: "sid" },
  // The INSERT ... ON CONFLICT DO NOTHING RETURNING result: a row = a real insert (mutation),
  // null = the ON CONFLICT no-op (already ignored). Default: a real insert.
  insertRow: { fingerprint: string } | null = { fingerprint: "fp" },
) {
  return async <R>(
    fn: (tx: {
      queryOne<T>(sql: string, p: unknown[]): Promise<T | null>;
      run(sql: string, p: unknown[]): Promise<void>;
    }) => Promise<R>,
  ) =>
    fn({
      async queryOne<T>(sql: string, params: unknown[]) {
        captured.push({ sql, params });
        if (/from public\.shows/.test(sql)) return show as T | null;
        if (/insert into public\.ignored_warnings/.test(sql)) return insertRow as T | null;
        return null as T | null;
      },
      async run(sql: string, params: unknown[]) {
        captured.push({ sql, params });
      },
    });
}

describe("handleIgnore", () => {
  test("AC-5: inserts one row with canonical ignored_by + computed fingerprint", async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const res = await handleIgnore(
      req({ code: "UNKNOWN_FIELD", rawSnippet: "Storage | x" }),
      ctx(),
      {
        requireAdminIdentity: admin,
        withTx: fakeTx(captured),
      },
    );
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

  test("blank/whitespace code → 400 (input hardening, Codex whole-diff)", async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const res = await handleIgnore(req({ code: "   ", rawSnippet: "Storage | x" }), ctx(), {
      requireAdminIdentity: admin,
      withTx: fakeTx(captured),
    });
    expect(res.status).toBe(400);
    expect(captured).toHaveLength(0); // never reaches the DB
  });

  test("missing show → 404", async () => {
    const res = await handleIgnore(req({ code: "X", rawSnippet: "y" }), ctx(), {
      requireAdminIdentity: admin,
      withTx: fakeTx([], null),
    });
    expect(res.status).toBe(404);
  });

  test("DQIGNORE-4: a successful ignore emits a WARNING_IGNORED forensic outcome post-commit", async () => {
    logAdminOutcomeMock.mockClear();
    const captured: { sql: string; params: unknown[] }[] = [];
    const res = await handleIgnore(
      req({ code: "UNKNOWN_FIELD", rawSnippet: "Storage | x" }),
      ctx(),
      { requireAdminIdentity: admin, withTx: fakeTx(captured, { id: "sid" }) },
    );
    expect(res.status).toBe(200);
    expect(logAdminOutcomeMock).toHaveBeenCalledTimes(1);
    const outcome = logAdminOutcomeMock.mock.calls[0]![0] as {
      code: string;
      source: string;
      actorEmail: string;
      showId: string;
      extra?: Record<string, unknown>;
    };
    expect(outcome).toMatchObject({
      code: "WARNING_IGNORED",
      source: "api.admin.data-quality.ignore",
      actorEmail: "admin@example.com", // canonical, matches the persisted ignored_by
      showId: "sid",
    });
    // The forensic row must carry WHAT was ignored so an audit can trace it.
    expect(outcome.extra?.warningCode).toBe("UNKNOWN_FIELD");
    expect(typeof outcome.extra?.fingerprint).toBe("string");
  });

  test("DQIGNORE-4: no outcome is logged when the show is missing (nothing mutated)", async () => {
    logAdminOutcomeMock.mockClear();
    const res = await handleIgnore(req({ code: "X", rawSnippet: "y" }), ctx(), {
      requireAdminIdentity: admin,
      withTx: fakeTx([], null),
    });
    expect(res.status).toBe(404);
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });

  test("DQIGNORE-4: a duplicate ignore (ON CONFLICT no-op) returns 200 but logs NO outcome", async () => {
    // Failure mode (whole-diff review P1): a second admin ignoring the same fingerprint records a
    // forensic "ignored" event even though no row changed.
    logAdminOutcomeMock.mockClear();
    const res = await handleIgnore(
      req({ code: "UNKNOWN_FIELD", rawSnippet: "Storage | x" }),
      ctx(),
      { requireAdminIdentity: admin, withTx: fakeTx([], { id: "sid" }, null) }, // insert → no-op
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ignored" });
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });
});
