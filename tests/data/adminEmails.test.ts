/**
 * tests/data/adminEmails.test.ts (M9 C9 / M2-D1 R1 fix)
 *
 * Unit tests for `lib/data/adminEmails.ts`. Post-R1, write paths
 * delegate to two Postgres RPCs (`upsert_admin_email_rpc` +
 * `revoke_admin_email_rpc`) that own the atomic logic. These tests
 * pin the JS-side translation contract:
 *   - Email canonicalized BEFORE the RPC call (AGENTS.md §1.3).
 *   - Empty / whitespace input returns `{ kind: 'invalid_email' }`
 *     WITHOUT touching the RPC at all.
 *   - Each RPC envelope status maps to the documented
 *     AdminEmailWriteOutcome kind.
 *   - Supabase errors (sync throw, error result) surface as
 *     AdminEmailsInfraError.
 *
 * End-to-end DB behavior (advisory lock, atomicity, CHECK constraints,
 * JWT-role override) lives in `tests/db/admin-emails.test.ts`.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  // Latest RPC call captured for assertion.
  lastRpc: null as { fn: string; args: Record<string, unknown> } | null,
  // Force the next .rpc() to return an error.
  forceRpcError: null as string | null,
  // Force the next .rpc() to return a specific data envelope.
  rpcResponse: null as unknown,
  // Force a thrown error.
  throwOnRpc: false,
  // Captured calls to .from() / .select() for the listAdminEmails path.
  fromRows: [] as Array<{
    email: string;
    added_by: string | null;
    added_at: string;
    revoked_by: string | null;
    revoked_at: string | null;
    note: string | null;
  }>,
  fromError: null as string | null,
}));

vi.mock("@/lib/supabase/server", () => {
  return {
    createSupabaseServerClient: async () => {
      return {
        rpc: async (fn: string, args: Record<string, unknown>) => {
          mockState.lastRpc = { fn, args };
          if (mockState.throwOnRpc) {
            throw new Error("META: simulated rpc network fault");
          }
          if (mockState.forceRpcError) {
            return { data: null, error: { message: mockState.forceRpcError } };
          }
          return { data: mockState.rpcResponse, error: null };
        },
        from: () => ({
          select: () => ({
            order: () => ({
              order: () =>
                Promise.resolve({
                  data: mockState.fromError ? null : mockState.fromRows,
                  error: mockState.fromError ? { message: mockState.fromError } : null,
                }),
            }),
          }),
        }),
      };
    },
  };
});

const { addAdminEmail, revokeAdminEmail, listAdminEmails, AdminEmailsInfraError } =
  await import("@/lib/data/adminEmails");

beforeEach(() => {
  mockState.lastRpc = null;
  mockState.forceRpcError = null;
  mockState.rpcResponse = null;
  mockState.throwOnRpc = false;
  mockState.fromRows = [];
  mockState.fromError = null;
});

describe("addAdminEmail (M9 C9 / M2-D1 R1)", () => {
  test("invalid_email branch — empty string returns without RPC call", async () => {
    const out = await addAdminEmail({ rawEmail: "", addedBy: "u1" });
    expect(out.kind).toBe("invalid_email");
    expect(mockState.lastRpc).toBeNull();
  });

  test("invalid_email branch — whitespace-only input", async () => {
    const out = await addAdminEmail({ rawEmail: "   \t ", addedBy: "u1" });
    expect(out.kind).toBe("invalid_email");
    expect(mockState.lastRpc).toBeNull();
  });

  test("canonicalizes mixed-case + leading/trailing space BEFORE the RPC", async () => {
    mockState.rpcResponse = { status: "ok", row: null };
    await addAdminEmail({ rawEmail: "  NewAdmin@Example.COM  ", addedBy: "u1" });
    expect(mockState.lastRpc?.fn).toBe("upsert_admin_email_rpc");
    expect(mockState.lastRpc?.args.p_email).toBe("newadmin@example.com");
  });

  test("RPC args carry email + note + confirmReAdd (R2: actor uid derived from auth.uid())", async () => {
    mockState.rpcResponse = { status: "ok", row: null };
    await addAdminEmail({
      rawEmail: "x@example.com",
      addedBy: "u-actor", // accepted but NOT forwarded post-R2
      note: "Q3",
      confirmReAdd: true,
    });
    expect(mockState.lastRpc?.args.p_email).toBe("x@example.com");
    expect(mockState.lastRpc?.args.p_note).toBe("Q3");
    expect(mockState.lastRpc?.args.p_confirm_re_add).toBe(true);
    // R2 fix: p_added_by removed from RPC signature.
    expect(mockState.lastRpc?.args.p_added_by).toBeUndefined();
  });

  test("ok envelope translates to ok kind with row", async () => {
    mockState.rpcResponse = {
      status: "ok",
      row: {
        email: "fresh@example.com",
        added_by: "u-actor",
        added_at: "2026-05-15T00:00:00Z",
        revoked_by: null,
        revoked_at: null,
        note: "Q3",
      },
    };
    const out = await addAdminEmail({ rawEmail: "fresh@example.com", addedBy: "u-actor" });
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") {
      expect(out.row?.email).toBe("fresh@example.com");
    }
  });

  test("already_active envelope translates to already_active kind (idempotent retry)", async () => {
    mockState.rpcResponse = { status: "already_active", email: "active@example.com" };
    const out = await addAdminEmail({ rawEmail: "active@example.com", addedBy: "u1" });
    expect(out.kind).toBe("already_active");
  });

  test("re_add_required envelope translates with previously_revoked_at", async () => {
    mockState.rpcResponse = {
      status: "re_add_required",
      email: "revoked@example.com",
      previously_revoked_at: "2026-04-30T00:00:00Z",
    };
    const out = await addAdminEmail({ rawEmail: "revoked@example.com", addedBy: "u1" });
    expect(out.kind).toBe("re_add_required");
    if (out.kind === "re_add_required") {
      expect(out.previously_revoked_at).toBe("2026-04-30T00:00:00Z");
    }
  });

  test("throws AdminEmailsInfraError on RPC error result", async () => {
    mockState.forceRpcError = "rpc network down";
    await expect(
      addAdminEmail({ rawEmail: "x@example.com", addedBy: "u1" }),
    ).rejects.toBeInstanceOf(AdminEmailsInfraError);
  });

  test("throws AdminEmailsInfraError on RPC sync throw", async () => {
    mockState.throwOnRpc = true;
    await expect(
      addAdminEmail({ rawEmail: "x@example.com", addedBy: "u1" }),
    ).rejects.toBeInstanceOf(AdminEmailsInfraError);
  });

  test("throws AdminEmailsInfraError on malformed RPC envelope (defense-in-depth)", async () => {
    mockState.rpcResponse = { unexpected_shape: true };
    await expect(
      addAdminEmail({ rawEmail: "x@example.com", addedBy: "u1" }),
    ).rejects.toBeInstanceOf(AdminEmailsInfraError);
  });
});

describe("revokeAdminEmail (M9 C9 / M2-D1 R1)", () => {
  test("invalid_email branch — empty string returns without RPC call", async () => {
    const out = await revokeAdminEmail({
      rawEmail: "",
      revokedBy: "u1",
      actorCanonicalEmail: "actor@example.com",
    });
    expect(out.kind).toBe("invalid_email");
    expect(mockState.lastRpc).toBeNull();
  });

  test("canonicalizes input before the RPC", async () => {
    mockState.rpcResponse = { status: "ok", row: null };
    await revokeAdminEmail({
      rawEmail: "  TARGET@Example.COM ",
      revokedBy: "u-actor",
      actorCanonicalEmail: "actor@example.com",
    });
    expect(mockState.lastRpc?.fn).toBe("revoke_admin_email_rpc");
    expect(mockState.lastRpc?.args.p_email).toBe("target@example.com");
  });

  test("R2 fix: RPC args carry email only (actor derived from auth.* inside SECURITY DEFINER)", async () => {
    mockState.rpcResponse = { status: "ok", row: null };
    await revokeAdminEmail({
      rawEmail: "x@example.com",
      revokedBy: "u-actor", // accepted but NOT forwarded post-R2
      actorCanonicalEmail: "actor@example.com", // ditto
    });
    expect(mockState.lastRpc?.args.p_email).toBe("x@example.com");
    expect(mockState.lastRpc?.args.p_revoked_by).toBeUndefined();
    expect(mockState.lastRpc?.args.p_actor_email).toBeUndefined();
  });

  test("ok envelope translates to ok kind with row", async () => {
    mockState.rpcResponse = {
      status: "ok",
      row: {
        email: "victim@example.com",
        added_by: null,
        added_at: "2026-05-01T00:00:00Z",
        revoked_by: "u-rogue",
        revoked_at: "2026-05-15T00:00:00Z",
        note: null,
      },
    };
    const out = await revokeAdminEmail({
      rawEmail: "victim@example.com",
      revokedBy: "u-rogue",
      actorCanonicalEmail: "rogue@example.com",
    });
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") {
      expect(out.row?.revoked_at).not.toBeNull();
    }
  });

  test("last_admin_lockout envelope translates to last_admin_lockout kind", async () => {
    mockState.rpcResponse = { status: "last_admin_lockout", email: "lonely@example.com" };
    const out = await revokeAdminEmail({
      rawEmail: "lonely@example.com",
      revokedBy: "u-self",
      actorCanonicalEmail: "lonely@example.com",
    });
    expect(out.kind).toBe("last_admin_lockout");
  });

  test("throws AdminEmailsInfraError on RPC error result", async () => {
    mockState.forceRpcError = "rpc network down";
    await expect(
      revokeAdminEmail({
        rawEmail: "x@example.com",
        revokedBy: "u1",
        actorCanonicalEmail: "actor@example.com",
      }),
    ).rejects.toBeInstanceOf(AdminEmailsInfraError);
  });
});

describe("listAdminEmails (M9 C9 / M2-D1)", () => {
  test("returns empty array when DB returns no rows (RLS denial steady-state)", async () => {
    const rows = await listAdminEmails();
    expect(rows).toEqual([]);
  });

  test("returns rows when DB returns data", async () => {
    mockState.fromRows = [
      {
        email: "active1@example.com",
        added_by: null,
        added_at: "2026-05-01T00:00:00Z",
        revoked_by: null,
        revoked_at: null,
        note: null,
      },
    ];
    const rows = await listAdminEmails();
    expect(rows.length).toBe(1);
    expect(rows[0]?.email).toBe("active1@example.com");
  });

  test("throws AdminEmailsInfraError on listAdminEmails error", async () => {
    mockState.fromError = "list failed";
    await expect(listAdminEmails()).rejects.toBeInstanceOf(AdminEmailsInfraError);
  });
});
