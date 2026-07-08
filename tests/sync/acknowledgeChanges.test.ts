/**
 * Task 2 — acknowledgeChanges (lib/sync/holds/acknowledgeChanges.ts) boundary coverage.
 *
 * The Flow-4 "accept auto-applied changes" path delegates to the lock-free,
 * admin-only `acknowledge_changes` RPC via a cookie-bound AUTHENTICATED server
 * client (mirrors undoChange / mi11GateActions). Per invariant 9 it must NEVER
 * throw to its caller and must NEVER collapse a returned/thrown infra fault into
 * a benign success:
 *   - supabase.rpc resolves { ok:true, count:2 }  → { ok:true, count:2 }
 *   - returned { error }                          → { ok:false, code:'SYNC_INFRA_ERROR' }
 *   - supabase.rpc THROWS                          → { ok:false, code:'SYNC_INFRA_ERROR' }
 *
 * requireAdmin is stubbed to resolve (the admin-gate throw is the auth boundary,
 * not a Supabase infra fault — the helper deliberately does NOT catch it).
 *
 * Self-contained via vi.doMock + an isolated module registry per import so it
 * does not perturb other suites' shared Supabase mock.
 */
import { describe, expect, test, vi } from "vitest";

type RpcOutcome = { data: unknown; error: { message?: string } | null };
type RpcCall = { fn: string; args: unknown };

async function importAcknowledgeChanges(opts: {
  throwOnRpc?: boolean;
  rpc?: RpcOutcome;
  calls?: RpcCall[];
}) {
  vi.resetModules();
  vi.doMock("@/lib/auth/requireAdmin", () => ({ requireAdmin: async () => undefined }));
  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () => ({
      rpc: async (fn: string, args: unknown) => {
        if (opts.calls) opts.calls.push({ fn, args });
        if (opts.throwOnRpc) throw new Error("META: rpc fault");
        return opts.rpc ?? { data: { ok: true, count: 0 }, error: null };
      },
    }),
  }));
  const mod = await import("@/lib/sync/holds/acknowledgeChanges");
  return mod;
}

const INFRA = { ok: false, code: "SYNC_INFRA_ERROR" };

describe("acknowledgeChanges (Task 2)", () => {
  test("(a) rpc resolves { ok:true, count:2 } → { ok:true, count:2 }", async () => {
    const { acknowledgeChanges } = await importAcknowledgeChanges({
      rpc: { data: { ok: true, count: 2 }, error: null },
    });
    await expect(acknowledgeChanges("show-1", ["a", "b"])).resolves.toEqual({ ok: true, count: 2 });
  });

  test("(b) returned { error } → SYNC_INFRA_ERROR (no throw)", async () => {
    const { acknowledgeChanges } = await importAcknowledgeChanges({
      rpc: { data: null, error: { message: "META: rpc returned error" } },
    });
    await expect(acknowledgeChanges("show-1", ["a", "b"])).resolves.toEqual(INFRA);
  });

  test("(c) supabase.rpc throw → SYNC_INFRA_ERROR (no leaked throw)", async () => {
    const { acknowledgeChanges } = await importAcknowledgeChanges({ throwOnRpc: true });
    await expect(acknowledgeChanges("show-1", ["a", "b"])).resolves.toEqual(INFRA);
  });

  test("(d) rpc called with ('acknowledge_changes', { p_show_id, p_ids })", async () => {
    const calls: RpcCall[] = [];
    const { acknowledgeChanges } = await importAcknowledgeChanges({
      rpc: { data: { ok: true, count: 2 }, error: null },
      calls,
    });
    await acknowledgeChanges("show-1", ["a", "b"]);
    expect(calls).toEqual([
      { fn: "acknowledge_changes", args: { p_show_id: "show-1", p_ids: ["a", "b"] } },
    ]);
  });
});
