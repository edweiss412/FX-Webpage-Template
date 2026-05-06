/**
 * tests/admin/resolveAlert.test.ts (M5 §B Task 5.9 — code-quality follow-up)
 *
 * Unit-test harness for resolveAdminAlertFormAction in app/admin/actions.ts,
 * pinning the I1 + I2 hardenings from the §5.9 review:
 *
 *   I1 — DB UPDATE error must NOT trigger revalidatePath. The pre-fix code
 *        discarded the .update() result and revalidated unconditionally, so
 *        an RLS denial / network blip showed the admin a "resolved" UI while
 *        the row remained unresolved on the database. Pinning: when the
 *        mocked update chain resolves to { error }, the action MUST log to
 *        console.error AND skip revalidatePath.
 *
 *   I2 — Malformed UUIDs must be rejected before the DB call. The pre-fix
 *        guard accepted any non-empty string. Pinning: when the form's `id`
 *        field isn't a UUID, the action MUST short-circuit — no Supabase
 *        client construction, no UPDATE attempt, no revalidatePath, no
 *        console output.
 *
 * Anti-tautology discipline:
 *   - The mocks intentionally return distinguishable shapes (`{ error: ... }`
 *     for I1, never reached for I2) so a passing test cannot be satisfied by
 *     coincidence. We assert against the spy call counts directly.
 *   - For the success path, we assert the order of operations: the
 *     update().eq().is() chain is invoked once with the correct arguments,
 *     AND revalidatePath is called once with the documented ('/admin',
 *     'layout') signature.
 *
 * Mock surface:
 *   - @/lib/auth/requireAdmin → no-op (the action's defense-in-depth gate is
 *     covered by tests/auth/requireAdmin.test.ts; here we test the body
 *     downstream of it).
 *   - @/lib/supabase/server → builder mock whose .from('admin_alerts').update()
 *     .eq().is().is() chain resolves to a configurable { error } shape, and
 *     whose .auth.getUser() returns a configurable user.email.
 *   - next/cache → spy on revalidatePath.
 *
 * The action is "use server" but Vitest's ESM loader does not block import
 * (verified pattern from tests/admin/parseAndStage-auth.test.ts).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Hoisted shared mock state. Each test mutates `chainResult` (what
// .update().eq().is() resolves to) and `userEmail` (what .auth.getUser()
// returns). The update spy records args so we can assert "no DB call" when
// the UUID guard or null-id guard short-circuits.
const mockState = vi.hoisted(() => ({
  chainResult: { error: null as null | { message: string } },
  userEmail: "admin@fxav.test" as string | null | undefined,
  updateSpy: vi.fn(),
  fromSpy: vi.fn(),
  filters: [] as Array<{ method: "eq" | "is"; column: string; value: unknown }>,
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: async () => undefined,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    const builder = {
      update: (payload: unknown) => {
        mockState.updateSpy(payload);
        return builder;
      },
      eq: (col: string, val: string) => {
        mockState.filters.push({ method: "eq", column: col, value: val });
        return builder;
      },
      is: (col: string, val: unknown) => {
        mockState.filters.push({ method: "is", column: col, value: val });
        return builder;
      },
      then: (
        resolve: (value: typeof mockState.chainResult) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => {
        return Promise.resolve(mockState.chainResult).then(resolve, reject);
      },
    };
    return {
      from: (table: string) => {
        mockState.fromSpy(table);
        return builder;
      },
      auth: {
        getUser: async () => ({
          data: { user: { email: mockState.userEmail } },
          error: null,
        }),
      },
    };
  },
}));

const revalidatePathSpy = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathSpy,
}));

// Import AFTER mocks so the action's module-level imports resolve to them.
import { resolveAdminAlertFormAction } from "@/app/admin/actions";

const VALID_UUID = "11111111-2222-3333-4444-555555555555";

describe("resolveAdminAlertFormAction", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockState.chainResult = { error: null };
    mockState.userEmail = "admin@fxav.test";
    mockState.updateSpy.mockClear();
    mockState.fromSpy.mockClear();
    mockState.filters = [];
    revalidatePathSpy.mockClear();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  function fd(entries: Record<string, string>): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.append(k, v);
    return f;
  }

  test("happy path: valid UUID + healthy DB → UPDATE runs and revalidatePath fires", async () => {
    await resolveAdminAlertFormAction(fd({ id: VALID_UUID }));

    // The action constructed a supabase client and called .from('admin_alerts').
    expect(mockState.fromSpy).toHaveBeenCalledTimes(1);
    expect(mockState.fromSpy).toHaveBeenCalledWith("admin_alerts");

    // The .update() call carried both resolved_at (an ISO string) and
    // resolved_by (the canonicalized admin email).
    expect(mockState.updateSpy).toHaveBeenCalledTimes(1);
    expect(mockState.filters).toEqual([
      { method: "eq", column: "id", value: VALID_UUID },
      { method: "is", column: "resolved_at", value: null },
      { method: "is", column: "show_id", value: null },
    ]);
    const updateCall = mockState.updateSpy.mock.calls[0];
    if (!updateCall) throw new Error("expected update() to have been called");
    const payload = updateCall[0] as {
      resolved_at: string;
      resolved_by: string;
    };
    expect(typeof payload.resolved_at).toBe("string");
    expect(new Date(payload.resolved_at).toString()).not.toBe("Invalid Date");
    expect(payload.resolved_by).toBe("admin@fxav.test");

    // Revalidation fired exactly once with the documented ('/admin', 'layout').
    expect(revalidatePathSpy).toHaveBeenCalledTimes(1);
    expect(revalidatePathSpy).toHaveBeenCalledWith("/admin", "layout");

    // No errors logged.
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  // ============ I1: DB UPDATE error path ============

  test("I1: DB UPDATE returns error → console.error fires and revalidatePath does NOT", async () => {
    mockState.chainResult = { error: { message: "rls denied" } };

    await resolveAdminAlertFormAction(fd({ id: VALID_UUID }));

    // The .update() chain WAS invoked (we got far enough to attempt the write).
    expect(mockState.updateSpy).toHaveBeenCalledTimes(1);

    // Revalidation MUST NOT have fired — the row was not changed, so the
    // admin must not see a "resolved" UI on next render.
    expect(revalidatePathSpy).not.toHaveBeenCalled();

    // The error MUST have been logged so an operator tailing logs has a
    // signal that the resolve path is broken.
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const call = consoleErrorSpy.mock.calls[0];
    if (!call) throw new Error("expected console.error to have been called");
    const [logMsg, errArg] = call;
    expect(String(logMsg)).toContain("[resolveAdminAlertFormAction]");
    expect(String(logMsg)).toContain("UPDATE failed");
    expect(String(errArg)).toContain("rls denied");
  });

  test("scope hardening: action resolves only global alerts", async () => {
    await resolveAdminAlertFormAction(fd({ id: VALID_UUID }));

    expect(mockState.filters).toContainEqual({
      method: "is",
      column: "show_id",
      value: null,
    });
  });

  // ============ I2: malformed UUID guard ============

  test("I2: malformed id (not a UUID) → no DB call, no revalidation, no log", async () => {
    await resolveAdminAlertFormAction(fd({ id: "not-a-uuid" }));

    expect(mockState.fromSpy).not.toHaveBeenCalled();
    expect(mockState.updateSpy).not.toHaveBeenCalled();
    expect(revalidatePathSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  test("I2: malformed id (UUID-shaped but wrong length) → rejected", async () => {
    // 7-char first segment instead of 8 — passes a naive substring check but
    // fails the strict UUID regex.
    await resolveAdminAlertFormAction(fd({ id: "1111111-2222-3333-4444-555555555555" }));

    expect(mockState.fromSpy).not.toHaveBeenCalled();
    expect(mockState.updateSpy).not.toHaveBeenCalled();
    expect(revalidatePathSpy).not.toHaveBeenCalled();
  });

  test("I2: SQL-injection-shaped id → rejected", async () => {
    await resolveAdminAlertFormAction(fd({ id: "'; DROP TABLE admin_alerts; --" }));

    expect(mockState.fromSpy).not.toHaveBeenCalled();
    expect(mockState.updateSpy).not.toHaveBeenCalled();
    expect(revalidatePathSpy).not.toHaveBeenCalled();
  });

  test("I2: empty id → rejected before UUID guard (existing length-0 guard)", async () => {
    await resolveAdminAlertFormAction(fd({ id: "" }));

    expect(mockState.fromSpy).not.toHaveBeenCalled();
    expect(mockState.updateSpy).not.toHaveBeenCalled();
    expect(revalidatePathSpy).not.toHaveBeenCalled();
  });

  test("I2: missing id field entirely → rejected by type guard", async () => {
    await resolveAdminAlertFormAction(new FormData());

    expect(mockState.fromSpy).not.toHaveBeenCalled();
    expect(mockState.updateSpy).not.toHaveBeenCalled();
    expect(revalidatePathSpy).not.toHaveBeenCalled();
  });

  // ============ M6: defensive null-email guard ============

  test("M6: getUser returns null email → action logs and skips DB write", async () => {
    mockState.userEmail = null;

    await resolveAdminAlertFormAction(fd({ id: VALID_UUID }));

    // Defense-in-depth: even though requireAdmin() should have prevented
    // this, we refuse to write a NULL resolved_by attribution.
    expect(mockState.updateSpy).not.toHaveBeenCalled();
    expect(revalidatePathSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const m6Call = consoleErrorSpy.mock.calls[0];
    if (!m6Call) throw new Error("expected console.error to have been called");
    expect(String(m6Call[0])).toContain("canonicalized email is null");
  });
});
