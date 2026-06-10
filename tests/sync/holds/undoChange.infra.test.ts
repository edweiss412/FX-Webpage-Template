/**
 * WM-F5 — undoChange (lib/sync/holds/undoChange.ts) boundary coverage.
 *
 * The feed Undo path delegates to the lock-taking `undo_change` RPC via a
 * cookie-bound AUTHENTICATED server client (mirrors mi11GateActions). Per
 * invariant 9 it must NEVER throw to its caller and must NEVER collapse a typed
 * RPC failure into a benign success:
 *   - createSupabaseServerClient THROWS        → { ok:false, code:'SYNC_INFRA_ERROR' }
 *   - supabase.rpc THROWS                       → { ok:false, code:'SYNC_INFRA_ERROR' }
 *   - returned { error }                        → { ok:false, code:'SYNC_INFRA_ERROR' }
 *   - RPC data null / unexpected shape          → { ok:false, code:'SYNC_INFRA_ERROR' }
 *   - data.ok === false with a typed code       → { ok:false, code:<typed> } (NOT clobbered)
 *   - data.ok === true                          → { ok:true }
 *
 * requireAdmin is stubbed to resolve (the admin-gate throw is the auth boundary,
 * not a Supabase infra fault — undoChange deliberately does NOT catch it).
 *
 * Self-contained via vi.doMock + an isolated module registry per import so it
 * does not perturb other suites' shared Supabase mock.
 *
 * Non-tautological: each assertion pins a DISTINCT boundary outcome. The
 * data.ok===false case proves the typed code passes through rather than being
 * rewritten to SYNC_INFRA_ERROR; the data.ok===true case proves success is only
 * returned for the explicit `true` shape (null/unexpected reds it).
 */
import { describe, expect, test, vi } from "vitest";

type RpcOutcome = { data: unknown; error: { message?: string } | null };

async function importUndoChange(opts: {
  throwOnServerConstruct?: boolean;
  throwOnRpc?: boolean;
  rpc?: RpcOutcome;
}) {
  vi.resetModules();
  vi.doMock("@/lib/auth/requireAdmin", () => ({ requireAdmin: async () => undefined }));
  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () => {
      if (opts.throwOnServerConstruct) throw new Error("META: server construct fault");
      return {
        rpc: async () => {
          if (opts.throwOnRpc) throw new Error("META: rpc fault");
          return opts.rpc ?? { data: { ok: true }, error: null };
        },
      };
    },
  }));
  const mod = await import("@/lib/sync/holds/undoChange");
  return mod;
}

const INFRA = { ok: false, code: "SYNC_INFRA_ERROR" };

describe("undoChange infra-failure contract (WM-F5)", () => {
  test("(a) createSupabaseServerClient throw → SYNC_INFRA_ERROR (no throw)", async () => {
    const { undoChange } = await importUndoChange({ throwOnServerConstruct: true });
    await expect(undoChange("clog-1")).resolves.toEqual(INFRA);
  });

  test("(b) supabase.rpc throw → SYNC_INFRA_ERROR (no throw)", async () => {
    const { undoChange } = await importUndoChange({ throwOnRpc: true });
    await expect(undoChange("clog-1")).resolves.toEqual(INFRA);
  });

  test("(c) returned { error } → SYNC_INFRA_ERROR (no throw)", async () => {
    const { undoChange } = await importUndoChange({
      rpc: { data: null, error: { message: "META: rpc returned error" } },
    });
    await expect(undoChange("clog-1")).resolves.toEqual(INFRA);
  });

  test("(d) RPC data null → SYNC_INFRA_ERROR (never a silent success)", async () => {
    const { undoChange } = await importUndoChange({ rpc: { data: null, error: null } });
    await expect(undoChange("clog-1")).resolves.toEqual(INFRA);
  });

  test("(d') RPC data unexpected shape (no ok field) → SYNC_INFRA_ERROR", async () => {
    const { undoChange } = await importUndoChange({
      rpc: { data: { unexpected: "shape" }, error: null },
    });
    await expect(undoChange("clog-1")).resolves.toEqual(INFRA);
  });

  test("(e) data.ok === false with typed code → typed code passes through (NOT clobbered)", async () => {
    const { undoChange } = await importUndoChange({
      rpc: { data: { ok: false, code: "UNDO_SUPERSEDED" }, error: null },
    });
    await expect(undoChange("clog-1")).resolves.toEqual({ ok: false, code: "UNDO_SUPERSEDED" });
  });

  test("(f) data.ok === true → { ok:true }", async () => {
    const { undoChange } = await importUndoChange({ rpc: { data: { ok: true }, error: null } });
    await expect(undoChange("clog-1")).resolves.toEqual({ ok: true });
  });
});
