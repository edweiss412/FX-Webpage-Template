/**
 * tests/data/setAdminDeveloper.test.ts (Developer Tier Task 7)
 *
 * Unit tests for `setAdminDeveloper` in `lib/data/adminEmails.ts` +
 * the `is_developer` column threading in `listAdminEmails`. The write
 * path delegates to `set_admin_developer_rpc` (spec §7 data layer);
 * these tests pin the JS-side translation contract:
 *   - Email canonicalized BEFORE the RPC call (AGENTS.md invariant 3);
 *     empty/whitespace input returns { kind:'invalid_email' } WITHOUT
 *     touching the RPC.
 *   - Each RPC envelope status maps to the documented SetDeveloperOutcome.
 *   - A PostgREST 42501 (insufficient_privilege) is a DISCRIMINABLE
 *     authorization result → { kind:'not_authorized' }, NOT a transient
 *     infra fault (invariant 9). Any OTHER error code → AdminEmailsInfraError.
 *   - listAdminEmails selects the new is_developer column.
 *
 * End-to-end DB behavior (advisory lock, table-backed actor check, CHECK
 * constraints) lives in the Phase-1 DB tests.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  // Latest RPC call captured for assertion.
  lastRpc: null as { fn: string; args: Record<string, unknown> } | null,
  // Envelope the next .rpc() resolves as `data`.
  rpcData: null as unknown,
  // Error the next .rpc() resolves as `error` (null → no error).
  rpcError: null as { code?: string; message?: string } | null,
  // Force a synchronous throw from .rpc().
  throwOnRpc: false,
  // Column string captured from the listAdminEmails .select() call.
  lastSelectColumns: null as string | null,
  fromRows: [] as unknown[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      mockState.lastRpc = { fn, args };
      if (mockState.throwOnRpc) {
        throw new Error("META: simulated rpc network fault");
      }
      return { data: mockState.rpcData, error: mockState.rpcError };
    },
    from: () => ({
      select: (columns: string) => {
        mockState.lastSelectColumns = columns;
        return {
          order: () => ({
            order: () => Promise.resolve({ data: mockState.fromRows, error: null }),
          }),
        };
      },
    }),
  }),
}));

const { setAdminDeveloper, listAdminEmails, AdminEmailsInfraError } =
  await import("@/lib/data/adminEmails");

beforeEach(() => {
  mockState.lastRpc = null;
  mockState.rpcData = null;
  mockState.rpcError = null;
  mockState.throwOnRpc = false;
  mockState.lastSelectColumns = null;
  mockState.fromRows = [];
});

describe("setAdminDeveloper (Task 7, spec §7)", () => {
  test("invalid_email (empty input) returns WITHOUT calling the RPC", async () => {
    const out = await setAdminDeveloper({ rawEmail: "   \t ", isDeveloper: true });
    expect(out).toEqual({ kind: "invalid_email" });
    expect(mockState.lastRpc).toBeNull();
  });

  test("canonicalizes rawEmail + forwards p_is_developer BEFORE the RPC", async () => {
    mockState.rpcData = { status: "ok", email: "target@example.com", is_developer: false };
    await setAdminDeveloper({ rawEmail: "  Target@Example.COM ", isDeveloper: false });
    expect(mockState.lastRpc?.fn).toBe("set_admin_developer_rpc");
    expect(mockState.lastRpc?.args.p_email).toBe("target@example.com");
    expect(mockState.lastRpc?.args.p_is_developer).toBe(false);
  });

  test("ok envelope → { kind:'ok', email, isDeveloper:true }", async () => {
    mockState.rpcData = { status: "ok", email: "dev@example.com", is_developer: true };
    const out = await setAdminDeveloper({ rawEmail: "dev@example.com", isDeveloper: true });
    expect(out).toEqual({ kind: "ok", email: "dev@example.com", isDeveloper: true });
  });

  test("self_developer_demote_forbidden envelope → that kind", async () => {
    mockState.rpcData = { status: "self_developer_demote_forbidden", email: "self@example.com" };
    const out = await setAdminDeveloper({ rawEmail: "self@example.com", isDeveloper: false });
    expect(out).toEqual({ kind: "self_developer_demote_forbidden", email: "self@example.com" });
  });

  test("not_found envelope → { kind:'not_found', email }", async () => {
    mockState.rpcData = { status: "not_found", email: "ghost@example.com" };
    const out = await setAdminDeveloper({ rawEmail: "ghost@example.com", isDeveloper: true });
    expect(out).toEqual({ kind: "not_found", email: "ghost@example.com" });
  });

  test("invalid_email envelope (DB defense-in-depth) → { kind:'invalid_email' }", async () => {
    mockState.rpcData = { status: "invalid_email" };
    const out = await setAdminDeveloper({ rawEmail: "x@example.com", isDeveloper: true });
    expect(out).toEqual({ kind: "invalid_email" });
  });

  test("PostgREST 42501 → { kind:'not_authorized' } (discriminable authz result, NOT a throw)", async () => {
    mockState.rpcError = {
      code: "42501",
      message: "permission denied for function set_admin_developer_rpc",
    };
    const out = await setAdminDeveloper({ rawEmail: "x@example.com", isDeveloper: true });
    expect(out).toEqual({ kind: "not_authorized" });
  });

  test("transient error code (57014) → throws AdminEmailsInfraError (invariant 9)", async () => {
    mockState.rpcError = {
      code: "57014",
      message: "canceling statement due to statement timeout",
    };
    await expect(
      setAdminDeveloper({ rawEmail: "x@example.com", isDeveloper: true }),
    ).rejects.toBeInstanceOf(AdminEmailsInfraError);
  });

  test("error with no code → throws AdminEmailsInfraError (not silently authorized)", async () => {
    mockState.rpcError = { message: "rpc network down" };
    await expect(
      setAdminDeveloper({ rawEmail: "x@example.com", isDeveloper: true }),
    ).rejects.toBeInstanceOf(AdminEmailsInfraError);
  });

  test("rpc sync throw → throws AdminEmailsInfraError", async () => {
    mockState.throwOnRpc = true;
    await expect(
      setAdminDeveloper({ rawEmail: "x@example.com", isDeveloper: true }),
    ).rejects.toBeInstanceOf(AdminEmailsInfraError);
  });

  test("malformed RPC envelope (no status) → throws AdminEmailsInfraError", async () => {
    mockState.rpcData = { unexpected_shape: true };
    await expect(
      setAdminDeveloper({ rawEmail: "x@example.com", isDeveloper: true }),
    ).rejects.toBeInstanceOf(AdminEmailsInfraError);
  });

  test("unknown status string → throws AdminEmailsInfraError (schema-drift defense)", async () => {
    mockState.rpcData = { status: "totally_made_up_status" };
    await expect(
      setAdminDeveloper({ rawEmail: "x@example.com", isDeveloper: true }),
    ).rejects.toBeInstanceOf(AdminEmailsInfraError);
  });
});

describe("listAdminEmails is_developer column threading", () => {
  test("select column string includes is_developer", async () => {
    await listAdminEmails();
    expect(mockState.lastSelectColumns).toContain("is_developer");
  });
});
