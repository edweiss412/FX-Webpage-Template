import { describe, expect, test, vi } from "vitest";
import type {
  CleanupAbandonedFinalizeRouteDeps,
  CleanupAbandonedFinalizeRouteTx,
} from "@/app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route";
import { handleCleanupAbandonedFinalize } from "@/app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route";
import { CleanupRequiresStaleSessionError } from "@/lib/onboarding/sessionLifecycle";

const W1 = "11111111-1111-4111-8111-111111111111";

function request(): Request {
  return new Request(`https://crew.fxav.test/api/admin/onboarding/cleanup-abandoned-finalize/${W1}`, {
    method: "POST",
  });
}

class FakeCleanupRouteTx implements CleanupAbandonedFinalizeRouteTx {
  appliedManifestCount = 1;
  shadowCount = 1;
  unresolvedManifestCount = 0;
  auditRows: Array<{ phase: string; status: string }> = [];

  async query<T>(sql: string, params: readonly unknown[] = []) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized.startsWith("select")) {
      return {
        rows: [
          {
            applied_manifest_count: this.appliedManifestCount,
            shadow_count: this.shadowCount,
            unresolved_manifest_count: this.unresolvedManifestCount,
          } as T,
        ],
        rowCount: 1,
      };
    }
    if (normalized.startsWith("insert into public.sync_audit")) {
      this.auditRows.push({ phase: params[1] as string, status: params[2] as string });
      return { rows: [{ id: "audit-1" } as T], rowCount: 1 };
    }
    throw new Error(`Unhandled cleanup route SQL: ${normalized}`);
  }
}

function deps(
  tx: FakeCleanupRouteTx,
  overrides: Partial<CleanupAbandonedFinalizeRouteDeps> = {},
): CleanupAbandonedFinalizeRouteDeps {
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
    withTx: async (fn) => fn(tx),
    cleanupAbandonedFinalize: vi.fn(async () => ({ status: "cleaned" })),
    randomUUID: () => "22222222-2222-4222-8222-222222222222",
    ...overrides,
  };
}

async function json(response: Response): Promise<unknown> {
  return await response.json();
}

describe("POST /api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]", () => {
  test("gates admin, writes before/after audit rows, and returns cleaned status", async () => {
    const tx = new FakeCleanupRouteTx();
    const routeDeps = deps(tx);

    const response = await handleCleanupAbandonedFinalize(request(), {
      params: Promise.resolve({ sessionId: W1 }),
    }, routeDeps);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "cleaned" });
    expect(routeDeps.cleanupAbandonedFinalize).toHaveBeenCalledWith(W1, expect.any(Object));
    expect(tx.auditRows).toEqual([
      { phase: "before", status: "started" },
      { phase: "after", status: "cleaned" },
    ]);
  });

  test("stale-session guard refusal writes a refused audit row and returns 409", async () => {
    const tx = new FakeCleanupRouteTx();
    const error = new CleanupRequiresStaleSessionError("session_too_fresh", {
      wizard_session_id: W1,
    });

    const response = await handleCleanupAbandonedFinalize(request(), {
      params: Promise.resolve({ sessionId: W1 }),
    }, deps(tx, {
      cleanupAbandonedFinalize: vi.fn(async () => {
        throw error;
      }),
    }));

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({
      ok: false,
      code: "CLEANUP_REQUIRES_STALE_SESSION",
      reason: "session_too_fresh",
      context: { wizard_session_id: W1 },
    });
    expect(tx.auditRows).toEqual([
      { phase: "before", status: "started" },
      { phase: "after", status: "refused" },
    ]);
  });

  test("non-admin callers return 403 before helper or audit work", async () => {
    const tx = new FakeCleanupRouteTx();
    const routeDeps = deps(tx, {
      requireAdminIdentity: vi.fn(async () => {
        throw new Error("forbidden");
      }),
    });

    const response = await handleCleanupAbandonedFinalize(request(), {
      params: Promise.resolve({ sessionId: W1 }),
    }, routeDeps);

    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({ ok: false, code: "ADMIN_FORBIDDEN" });
    expect(routeDeps.cleanupAbandonedFinalize).not.toHaveBeenCalled();
    expect(tx.auditRows).toEqual([]);
  });
});
