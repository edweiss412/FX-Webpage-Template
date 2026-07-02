import { describe, expect, test, vi } from "vitest";
import { handleUnignore } from "@/app/api/admin/show/[slug]/data-quality/unignore/route";

const { logAdminOutcomeMock } = vi.hoisted(() => ({ logAdminOutcomeMock: vi.fn() }));
vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome: logAdminOutcomeMock }));

const ctx = () => ({ params: Promise.resolve({ slug: "rpas" }) });
const req = (body: unknown) =>
  new Request("http://x", { method: "POST", body: JSON.stringify(body) });
const admin = async () => ({ email: "a@b.com" });
function fakeTx(
  captured: { sql: string; params: unknown[] }[],
  show: { id: string } | null = { id: "sid" },
) {
  return async <R>(
    fn: (tx: {
      queryOne<T>(s: string, p: unknown[]): Promise<T | null>;
      run(s: string, p: unknown[]): Promise<void>;
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

describe("handleUnignore", () => {
  test("AC-6: deletes by (show_id, fingerprint) → { status: 'unignored' }", async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const res = await handleUnignore(
      req({ code: "UNKNOWN_FIELD", rawSnippet: "Storage | x" }),
      ctx(),
      {
        requireAdminIdentity: admin,
        withTx: fakeTx(captured),
      },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "unignored" });
    expect(captured.find((c) => /delete from public\.ignored_warnings/.test(c.sql))).toBeTruthy();
  });
  test("non-admin → 403", async () => {
    const res = await handleUnignore(req({ code: "X", rawSnippet: "y" }), ctx(), {
      requireAdminIdentity: async () => {
        throw { code: "NOPE" };
      },
      withTx: fakeTx([]),
    });
    expect(res.status).toBe(403);
  });

  test("DQIGNORE-4: a successful un-ignore emits a WARNING_UNIGNORED forensic outcome post-commit", async () => {
    logAdminOutcomeMock.mockClear();
    const res = await handleUnignore(
      req({ code: "UNKNOWN_FIELD", rawSnippet: "Storage | x" }),
      ctx(),
      { requireAdminIdentity: admin, withTx: fakeTx([]) },
    );
    expect(res.status).toBe(200);
    expect(logAdminOutcomeMock).toHaveBeenCalledTimes(1);
    const outcome = logAdminOutcomeMock.mock.calls[0]![0] as {
      code: string;
      source: string;
      showId: string;
      extra?: Record<string, unknown>;
    };
    expect(outcome).toMatchObject({
      code: "WARNING_UNIGNORED",
      source: "api.admin.data-quality.unignore",
      showId: "sid",
    });
    expect(outcome.extra?.warningCode).toBe("UNKNOWN_FIELD");
    expect(typeof outcome.extra?.fingerprint).toBe("string");
  });

  test("DQIGNORE-4: no outcome is logged when the show is missing", async () => {
    logAdminOutcomeMock.mockClear();
    const res = await handleUnignore(req({ code: "X", rawSnippet: "y" }), ctx(), {
      requireAdminIdentity: admin,
      withTx: fakeTx([], null),
    });
    expect(res.status).toBe(404);
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });
});
